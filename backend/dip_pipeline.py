import os
import platform
import base64
import cv2
import numpy as np
import pytesseract

if platform.system() == "Windows":
    win_tesseract = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(win_tesseract):
        pytesseract.pytesseract.tesseract_cmd = win_tesseract

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "plate_detector.onnx")
net = cv2.dnn.readNetFromONNX(MODEL_PATH) if os.path.exists(MODEL_PATH) else None


def encode_image_base64(img: np.ndarray) -> str:
    """Convert an OpenCV image array into a base64 PNG data URI for the React UI."""
    _, buffer = cv2.imencode(".png", img)
    b64_str = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/png;base64,{b64_str}"


def read_plate_ocr(gray_crop: np.ndarray) -> tuple[str, np.ndarray]:
    """DIP Post-Processing: Lanczos 3x Upscale + CLAHE + Otsu Binarization + Tesseract OCR."""
    upscaled = cv2.resize(gray_crop, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_LANCZOS4)
    clahe = cv2.createCLAHE(clipLimit=2.5, tileGridSize=(4, 4))
    upscaled = clahe.apply(upscaled)

    _, binary = cv2.threshold(upscaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if float(np.mean(binary)) < 127.0:
        binary = cv2.bitwise_not(binary)

    padded = cv2.copyMakeBorder(binary, 12, 12, 12, 12, cv2.BORDER_CONSTANT, value=255)
    custom_config = r"--oem 3 --psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    raw_text = pytesseract.image_to_string(padded, config=custom_config)
    cleaned = "".join(ch for ch in raw_text if ch.isalnum())
    return cleaned, padded


def detect_with_onnx(image: np.ndarray, conf_threshold: float = 0.30) -> tuple[int, int, int, int] | None:
    """Run trained YOLOv8n ONNX detector via OpenCV DNN (zero PyTorch overhead)."""
    if net is None:
        return None

    orig_h, orig_w = image.shape[:2]
    scale = min(640.0 / orig_w, 640.0 / orig_h)
    new_w, new_h = int(orig_w * scale), int(orig_h * scale)
    resized = cv2.resize(image, (new_w, new_h))

    canvas = np.full((640, 640, 3), 114, dtype=np.uint8)
    pad_x, pad_y = (640 - new_w) // 2, (640 - new_h) // 2
    canvas[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = resized

    blob = cv2.dnn.blobFromImage(canvas, 1.0 / 255.0, (640, 640), swapRB=True, crop=False)
    net.setInput(blob)
    outputs = net.forward()[0]  # shape: (5, 8400) for single-class YOLOv8

    predictions = outputs.T  # shape: (8400, 5) -> [cx, cy, w, h, conf]
    boxes: list[list[int]] = []
    confidences: list[float] = []

    for row in predictions:
        conf = float(row[4])
        if conf >= conf_threshold:
            cx, cy, w, h = float(row[0]), float(row[1]), float(row[2]), float(row[3])
            x1 = int(((cx - w / 2.0) - pad_x) / scale)
            y1 = int(((cy - h / 2.0) - pad_y) / scale)
            bw = int(w / scale)
            bh = int(h / scale)
            boxes.append([x1, y1, bw, bh])
            confidences.append(conf)

    if not boxes:
        return None

    indices = cv2.dnn.NMSBoxes(boxes, confidences, conf_threshold, 0.45)
    if len(indices) == 0:
        return None

    best_idx = int(np.array(indices).flatten()[0])
    bx, by, bw, bh = boxes[best_idx]

    margin_x = int(bw * 0.05)
    margin_y = int(bh * 0.08)
    bx = max(0, bx - margin_x)
    by = max(0, by - margin_y)
    bw = min(orig_w - bx, bw + 2 * margin_x)
    bh = min(orig_h - by, bh + 2 * margin_y)
    return (bx, by, bw, bh)


def process_vehicle_image(image_bytes: bytes) -> dict:
    np_arr = np.frombuffer(image_bytes, np.uint8)
    original = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if original is None:
        raise ValueError("Invalid image file.")

    height, width = original.shape[:2]
    if width > 1280:
        scale = 1280 / width
        original = cv2.resize(original, (1280, int(height * scale)))

    # DIP Stage 1-4: Visual Feature Maps for Pipeline Inspection
    gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
    bilateral = cv2.bilateralFilter(gray, d=9, sigmaColor=15, sigmaSpace=15)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(bilateral)

    rect_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
    blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, rect_kern)
    grad_x = np.absolute(cv2.Sobel(blackhat, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=3))
    min_val, max_val = float(np.min(grad_x)), float(np.max(grad_x))
    if max_val - min_val > 0:
        grad_x_u8 = (255.0 * ((grad_x - min_val) / (max_val - min_val))).astype(np.uint8)
    else:
        grad_x_u8 = grad_x.astype(np.uint8)

    _, thresh = cv2.threshold(cv2.GaussianBlur(grad_x_u8, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (19, 5)))

    # Stage 5: Generalized Trained ONNX Model Localization
    box = detect_with_onnx(original)

    annotated = original.copy()
    binarized_plate: np.ndarray = np.zeros((60, 200), dtype=np.uint8)
    extracted_text = "No plate detected"

    if box is not None:
        bx, by, bw, bh = box
        cv2.rectangle(annotated, (bx, by), (bx + bw, by + bh), (0, 255, 0), 3)
        crop = gray[by:by + bh, bx:bx + bw]
        if crop.size > 0:
            text, binarized_plate = read_plate_ocr(crop)
            extracted_text = text if len(text) >= 3 else "Plate localized (low OCR resolution)"

    return {
        "plate_number": extracted_text,
        "detected": box is not None,
        "stages": {
            "original": encode_image_base64(original),
            "enhanced_gray": encode_image_base64(enhanced),
            "canny_edges": encode_image_base64(grad_x_u8),
            "morph_mask": encode_image_base64(morph),
            "localized": encode_image_base64(annotated),
            "binarized_plate": encode_image_base64(binarized_plate),
        },
    }