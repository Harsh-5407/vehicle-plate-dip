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


def process_vehicle_image(image_bytes: bytes) -> dict:
    # 1. Decode uploaded image
    np_arr = np.frombuffer(image_bytes, np.uint8)
    original = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if original is None:
        raise ValueError("Invalid image file.")

    # Resize large images for consistent processing speed
    height, width = original.shape[:2]
    if width > 1000:
        scale = 1000 / width
        original = cv2.resize(original, (1000, int(height * scale)))

    # 2. Grayscale Conversion
    gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)

    # 3. Noise Reduction (Bilateral Filter preserves edges) + CLAHE contrast boost
    bilateral = cv2.bilateralFilter(gray, d=11, sigmaColor=17, sigmaSpace=17)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(bilateral)

    # 4. Canny Edge Detection
    edges = cv2.Canny(enhanced, threshold1=30, threshold2=200)

    # 5. Morphological Closing to merge plate characters into a solid region
    rect_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 5))
    morph = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, rect_kernel)

    # 6. Contour Detection & Geometric Filtering (Aspect Ratio 2.0 - 5.5)
    contours, _ = cv2.findContours(morph.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:15]

    plate_box = None
    plate_crop = None
    annotated = original.copy()

    for cnt in contours:
        x, y, w, h = cv2.boundingRect(cnt)
        aspect_ratio = w / float(h)
        area = w * h

        if 2.0 <= aspect_ratio <= 5.5 and area > 1500:
            plate_box = (x, y, w, h)
            plate_crop = gray[y : y + h, x : x + w]
            cv2.rectangle(annotated, (x, y), (x + w, y + h), (0, 255, 0), 3)
            break

    # 7. Plate Binarization (Otsu's Thresholding) & OCR
    extracted_text = "No plate detected"
    binarized_plate = np.zeros((60, 200), dtype=np.uint8)

    if plate_crop is not None:
        # Upscale crop slightly for sharper Tesseract character recognition
        plate_resized = cv2.resize(plate_crop, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        _, binarized_plate = cv2.threshold(plate_resized, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)

        # PSM 7 treats the image as a single text line; whitelist restricts to uppercase & digits
        custom_config = r"--oem 3 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
        raw_text = pytesseract.image_to_string(binarized_plate, config=custom_config)
        cleaned = "".join(ch for ch in raw_text if ch.isalnum())
        if cleaned:
            extracted_text = cleaned

    return {
        "plate_number": extracted_text,
        "detected": plate_box is not None,
        "stages": {
            "original": encode_image_base64(original),
            "enhanced_gray": encode_image_base64(enhanced),
            "canny_edges": encode_image_base64(edges),
            "morph_mask": encode_image_base64(morph),
            "localized": encode_image_base64(annotated),
            "binarized_plate": encode_image_base64(binarized_plate),
        },
    }