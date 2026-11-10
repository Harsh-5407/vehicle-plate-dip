import os
import platform
import base64
import cv2
import numpy as np
import pytesseract
import onnxruntime as ort

if platform.system() == "Windows":
    win_tesseract = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(win_tesseract):
        pytesseract.pytesseract.tesseract_cmd = win_tesseract

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "plate_detector.onnx")
ort_session = None
INPUT_NAME: str | None = None

if os.path.exists(MODEL_PATH):
    try:
        ort_session = ort.InferenceSession(MODEL_PATH, providers=["CPUExecutionProvider"])
        INPUT_NAME = ort_session.get_inputs()[0].name
    except Exception as e:
        print(f"[WARNING] Failed to load ONNX model: {e}")


def encode_image_base64(img: np.ndarray) -> str:
    """Fast JPEG base64 encoding for UI pipeline stage inspection."""
    _, buffer = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    b64_str = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/jpeg;base64,{b64_str}"


def deskew_binary_plate(binary: np.ndarray) -> np.ndarray:
    """Straighten perspective/camera tilt using the minimum-area bounding rectangle of character pixels."""
    inv = cv2.bitwise_not(binary)
    coords = np.column_stack(np.where(inv > 0))
    if len(coords) < 30:
        return binary

    rect = cv2.minAreaRect(coords[:, ::-1].astype(np.float32))
    angle = rect[2]
    if angle < -45.0:
        angle += 90.0
    if abs(angle) < 1.0 or abs(angle) > 20.0:
        return binary

    h, w = binary.shape
    M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
    return cv2.warpAffine(
        binary,
        M,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=255,
    )


def read_plate_ocr(gray_crop: np.ndarray) -> tuple[str, np.ndarray]:
    """DIP Post-Processing: Scale-Normalized Bicubic Resize + Adaptive Threshold + Border/Emblem Removal + Deskew."""
    h_in, w_in = gray_crop.shape[:2]
    target_h = 110
    scale = max(1.0, target_h / float(h_in))
    resized = cv2.resize(
        gray_crop,
        (max(1, int(w_in * scale)), target_h),
        interpolation=cv2.INTER_CUBIC,
    )

    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(4, 4))
    enhanced_crop = clahe.apply(resized)

    block_size = 31 if h_in < 35 else 45
    binary = cv2.adaptiveThreshold(
        enhanced_crop,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        block_size,
        10,
    )
    if float(np.mean(binary)) < 127.0:
        binary = cv2.bitwise_not(binary)

    # Filter out outer plate frames, border noise, and small emblems ('IND', bolts)
    inv = cv2.bitwise_not(binary)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(inv, connectivity=8)
    h, w = inv.shape

    candidate_heights = []
    for lbl in range(1, num_labels):
        x, y, bw, bh, area = stats[lbl]
        touches_border = (x == 0) or (y == 0) or (x + bw >= w) or (y + bh >= h)
        is_frame = (bw > w * 0.45) or (bh > h * 0.92)
        if not touches_border and not is_frame and area >= 45 and 0.12 <= (bw / float(bh)) <= 1.25:
            candidate_heights.append(bh)

    min_char_h = (float(np.median(candidate_heights)) * 0.55) if candidate_heights else (h * 0.32)
    max_char_h = (float(np.median(candidate_heights)) * 1.50) if candidate_heights else (h * 0.90)

    cleaned_inv = np.zeros_like(inv)
    for lbl in range(1, num_labels):
        x, y, bw, bh, area = stats[lbl]
        touches_border = (x == 0) or (y == 0) or (x + bw >= w) or (y + bh >= h)
        is_frame = (bw > w * 0.45) or (bh > h * 0.92)
        if not touches_border and not is_frame and area >= 45 and (min_char_h <= bh <= max_char_h):
            cleaned_inv[labels == lbl] = 255

    deskewed = deskew_binary_plate(cv2.bitwise_not(cleaned_inv))

    # Stretch slightly horizontally (1.25x) so narrow perspective-angled digits ('19', 'V') separate cleanly
    widened = cv2.resize(deskewed, None, fx=1.25, fy=1.0, interpolation=cv2.INTER_CUBIC)
    _, widened = cv2.threshold(widened, 127, 255, cv2.THRESH_BINARY)
    padded_preview = cv2.copyMakeBorder(widened, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)

    custom_config = (
        r"--oem 3 --psm 7 "
        r"-c load_system_dawg=0 "
        r"-c load_freq_dawg=0 "
        r"-c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    )
    raw_text = pytesseract.image_to_string(padded_preview, config=custom_config)
    cleaned = "".join(ch for ch in raw_text if ch.isalnum())
    return cleaned, padded_preview

def detect_with_onnx(image: np.ndarray, conf_threshold: float = 0.30) -> tuple[int, int, int, int] | None:
    """Run unified Global + Indian YOLOv8n ONNX detector via ONNX Runtime (~20ms on CPU)."""
    if ort_session is None or INPUT_NAME is None:
        return None

    orig_h, orig_w = image.shape[:2]
    scale = min(640.0 / orig_w, 640.0 / orig_h)
    new_w, new_h = int(orig_w * scale), int(orig_h * scale)
    resized = cv2.resize(image, (new_w, new_h))

    canvas = np.full((640, 640, 3), 114, dtype=np.uint8)
    pad_x, pad_y = (640 - new_w) // 2, (640 - new_h) // 2
    canvas[pad_y:pad_y + new_h, pad_x:pad_x + new_w] = resized

    rgb = cv2.cvtColor(canvas, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    blob = np.transpose(rgb, (2, 0, 1))[np.newaxis, ...]

    raw_outputs = ort_session.run(None, {INPUT_NAME: blob})
    out_tensor = np.squeeze(np.asarray(raw_outputs[0], dtype=np.float32))

    if out_tensor.ndim == 2 and out_tensor.shape[0] < out_tensor.shape[1]:
        predictions = out_tensor.T
    else:
        predictions = out_tensor

    mask = predictions[:, 4] >= conf_threshold
    valid = predictions[mask]
    if len(valid) == 0:
        return None

    boxes: list[list[int]] = []
    confidences: list[float] = []
    for row in valid:
        cx, cy, w, h, conf = float(row[0]), float(row[1]), float(row[2]), float(row[3]), float(row[4])
        x1 = int(((cx - w / 2.0) - pad_x) / scale)
        y1 = int(((cy - h / 2.0) - pad_y) / scale)
        bw = int(w / scale)
        bh = int(h / scale)
        boxes.append([x1, y1, bw, bh])
        confidences.append(conf)

    indices = cv2.dnn.NMSBoxes(boxes, confidences, conf_threshold, 0.45)
    if len(indices) == 0:
        return None

    best_idx = int(np.array(indices).flatten()[0])
    bx, by, bw, bh = boxes[best_idx]

    margin_x = int(bw * 0.04)
    margin_y = int(bh * 0.04)
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
    bilateral = cv2.bilateralFilter(gray, d=5, sigmaColor=15, sigmaSpace=15)
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

    # Stage 5: Generalized Unified ONNX Model Localization
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