import os
import platform
import base64
import cv2
import numpy as np
import pytesseract

# Point directly to Tesseract on Windows if not in PATH; Linux/Render finds it automatically
if platform.system() == "Windows":
    win_tesseract = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(win_tesseract):
        pytesseract.pytesseract.tesseract_cmd = win_tesseract


def encode_image_base64(img: np.ndarray) -> str:
    """Convert an OpenCV image array into a base64 PNG data URI for the React UI."""
    _, buffer = cv2.imencode(".png", img)
    b64_str = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"


def read_plate_ocr(gray_crop: np.ndarray) -> tuple[str, np.ndarray]:
    """Upscale, pad, Otsu-binarize, and extract alphanumeric characters via Tesseract."""
    upscaled = cv2.resize(gray_crop, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_LANCZOS4)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))
    upscaled = clahe.apply(upscaled)

    _, binary = cv2.threshold(upscaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    # Ensure dark text on white background (Tesseract performs best on dark-on-light)
    if np.mean(binary) < 127:
        binary = cv2.bitwise_not(binary)

    padded = cv2.copyMakeBorder(binary, 12, 12, 12, 12, cv2.BORDER_CONSTANT, value=255)

    custom_config = r"--oem 3 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    raw_text = pytesseract.image_to_string(padded, config=custom_config)
    cleaned = "".join(ch for ch in raw_text if ch.isalnum())
    return cleaned, padded


def process_vehicle_image(image_bytes: bytes) -> dict:
    # 1. Decode uploaded image
    np_arr = np.frombuffer(image_bytes, np.uint8)
    original = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if original is None:
        raise ValueError("Invalid image file.")

    height, width = original.shape[:2]
    if width > 1280:
        scale = 1280 / width
        original = cv2.resize(original, (1280, int(height * scale)))

    # 2. Grayscale Conversion & Edge-Preserving Denoising + CLAHE
    gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
    bilateral = cv2.bilateralFilter(gray, d=9, sigmaColor=15, sigmaSpace=15)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(bilateral)

    # 3. Blackhat Morphology + Vertical Sobel Gradient
    rect_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
    blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, rect_kern)

    grad_x = np.absolute(cv2.Sobel(blackhat, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=3))
    min_val, max_val = float(np.min(grad_x)), float(np.max(grad_x))
    if max_val - min_val > 0:
        grad_x_u8 = (255.0 * ((grad_x - min_val) / (max_val - min_val))).astype(np.uint8)
    else:
        grad_x_u8 = grad_x.astype(np.uint8)

    # 4. Gaussian Smooth + Otsu Threshold + Morphological Closing
    grad_blur = cv2.GaussianBlur(grad_x_u8, (5, 5), 0)
    _, thresh = cv2.threshold(grad_blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

    close_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (19, 5))
    morph_kern = np.ones((3, 3), dtype=np.uint8)
    morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, close_kern)
    morph = cv2.erode(morph, morph_kern, iterations=1)
    morph = cv2.dilate(morph, morph_kern, iterations=2)

    # 5. Contour Detection & Geometric + OCR Candidate Verification
    contours, _ = cv2.findContours(morph.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:60]

    best_box: tuple[int, int, int, int] | None = None
    best_text = ""
    best_binarized: np.ndarray = np.zeros((60, 200), dtype=np.uint8)
    fallback_box: tuple[int, int, int, int] | None = None
    fallback_binarized: np.ndarray = np.zeros((60, 200), dtype=np.uint8)

    img_h, img_w = original.shape[:2]

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        aspect_ratio = w / float(h)
        area = w * h

        if 2.0 <= aspect_ratio <= 6.0 and 500 <= area <= (img_h * img_w * 0.25):
            pad_x = int(w * 0.08)
            pad_y = int(h * 0.15)
            x1 = max(0, x - pad_x)
            y1 = max(0, y - pad_y)
            x2 = min(gray.shape[1], x + w + pad_x)
            y2 = min(gray.shape[0], y + h + pad_y)

            crop = gray[y1:y2, x1:x2]
            text, bin_img = read_plate_ocr(crop)

            if fallback_box is None:
                fallback_box = (x1, y1, x2 - x1, y2 - y1)
                fallback_binarized = bin_img

            if 5 <= len(text) <= 11:
                best_box = (x1, y1, x2 - x1, y2 - y1)
                best_text = text
                best_binarized = bin_img
                break

    annotated = original.copy()
    if best_box is not None:
        bx, by, bw, bh = best_box
        cv2.rectangle(annotated, (bx, by), (bx + bw, by + bh), (0, 255, 0), 3)
        extracted_text = best_text
    elif fallback_box is not None:
        bx, by, bw, bh = fallback_box
        cv2.rectangle(annotated, (bx, by), (bx + bw, by + bh), (0, 200, 255), 3)
        extracted_text = "Plate region found (low OCR clarity)"
        best_binarized = fallback_binarized
    else:
        extracted_text = "No plate detected"

    return {
        "plate_number": extracted_text,
        "detected": best_box is not None or fallback_box is not None,
        "stages": {
            "original": encode_image_base64(original),
            "enhanced_gray": encode_image_base64(enhanced),
            "canny_edges": encode_image_base64(grad_x_u8),
            "morph_mask": encode_image_base64(morph),
            "localized": encode_image_base64(annotated),
            "binarized_plate": encode_image_base64(best_binarized),
        },
    }