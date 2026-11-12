import os
import re
import time
import base64
import cv2
import numpy as np
import onnxruntime as ort
from rapidocr_onnxruntime import RapidOCR

MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "plate_detector.onnx")
ort_session = None
INPUT_NAME: str | None = None

if os.path.exists(MODEL_PATH):
    try:
        sess_opts = ort.SessionOptions()
        sess_opts.intra_op_num_threads = 1
        sess_opts.inter_op_num_threads = 1
        sess_opts.enable_cpu_mem_arena = False
        ort_session = ort.InferenceSession(
            MODEL_PATH,
            sess_options=sess_opts,
            providers=["CPUExecutionProvider"],
        )
        INPUT_NAME = ort_session.get_inputs()[0].name
    except Exception as e:
        print(f"[WARNING] Failed to load ONNX model: {e}")

# Load ONLY the CRNN text-recognition model (~25 MB RAM instead of ~240 MB full 3-model suite)
# since YOLOv8n already localizes the license plate bounding box.
try:
    ocr_engine = RapidOCR(use_det=False, use_cls=False, use_rec=True)
except TypeError:
    ocr_engine = RapidOCR()

DIGIT_TO_LETTER = {"0": "O", "1": "I", "2": "Z", "5": "S", "8": "B", "6": "G"}
LETTER_TO_DIGIT = {"O": "0", "D": "0", "Q": "0", "I": "1", "L": "1", "Z": "2", "S": "5", "B": "8", "G": "6"}


def encode_image_base64(img: np.ndarray) -> str:
    """Fast JPEG base64 encoding for UI pipeline stage inspection."""
    _, buffer = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
    b64_str = base64.b64encode(buffer).decode("utf-8")
    return f"data:image/jpeg;base64,{b64_str}"


def refine_indian_plate_syntax(raw_text: str) -> str:
    """Applies positional character correction for Indian HSRP/RTO formats (SS DD LL DDDD)."""
    cleaned = re.sub(r"[^A-Z0-9]", "", raw_text.upper())
    if cleaned.startswith("IND") and len(cleaned) >= 11:
        cleaned = cleaned[3:]

    # Standard 10-character Indian plate: SS DD LL DDDD (e.g., HR51AB1234)
    if len(cleaned) == 10:
        chars = list(cleaned)
        for i in (0, 1):
            chars[i] = DIGIT_TO_LETTER.get(chars[i], chars[i])
        for i in (2, 3):
            chars[i] = LETTER_TO_DIGIT.get(chars[i], chars[i])
        for i in (4, 5):
            chars[i] = DIGIT_TO_LETTER.get(chars[i], chars[i])
        for i in (6, 7, 8, 9):
            chars[i] = LETTER_TO_DIGIT.get(chars[i], chars[i])
        return "".join(chars)

    # 9-character format (single-letter series, e.g., DL8CAF503 -> 9 chars)
    if len(cleaned) == 9:
        chars = list(cleaned)
        for i in (0, 1):
            chars[i] = DIGIT_TO_LETTER.get(chars[i], chars[i])
        for i in (2, 3):
            chars[i] = LETTER_TO_DIGIT.get(chars[i], chars[i])
        chars[4] = DIGIT_TO_LETTER.get(chars[4], chars[4])
        for i in (5, 6, 7, 8):
            chars[i] = LETTER_TO_DIGIT.get(chars[i], chars[i])
        return "".join(chars)

    return cleaned


def deskew_binary_plate(binary: np.ndarray) -> tuple[np.ndarray, float]:
    """Straighten perspective tilt and return (deskewed_image, rotation_angle_degrees)."""
    inv = cv2.bitwise_not(binary)
    coords = np.column_stack(np.where(inv > 0))
    if len(coords) < 30:
        return binary, 0.0

    rect = cv2.minAreaRect(coords[:, ::-1].astype(np.float32))
    angle = float(rect[2])
    if angle < -45.0:
        angle += 90.0
    if abs(angle) < 1.0 or abs(angle) > 20.0:
        return binary, 0.0

    h, w = binary.shape
    M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
    warped = cv2.warpAffine(
        binary,
        M,
        (w, h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=255,
    )
    return warped, round(angle, 2)


def _extract_rapidocr_tokens(img_bgr: np.ndarray) -> tuple[str, float]:
    """Run RapidOCR on a cropped plate image (supports both rec-only and full modes)."""
    result, _ = ocr_engine(img_bgr)
    if not result:
        return "", 0.0

    # Format A: rec-only mode returns [('HR26BR9044', 0.985), ...]
    if isinstance(result[0], (list, tuple)) and len(result[0]) == 2 and isinstance(result[0][0], str):
        tokens = []
        confs = []
        for text, conf in result:
            clean_tok = re.sub(r"[^A-Z0-9]", "", str(text).upper())
            if not clean_tok or clean_tok == "IND" or float(conf) < 0.35:
                continue
            tokens.append(clean_tok)
            confs.append(float(conf))
        combined = "".join(tokens)
        mean_conf = float(np.mean(confs)) if confs else 0.0
        return combined, mean_conf

    # Format B: full det+rec mode returns [[box, text, conf], ...]
    sorted_boxes = sorted(result, key=lambda item: (int(item[0][0][1]) // 22, int(item[0][0][0])))
    tokens = []
    confs = []
    for _, text, conf in sorted_boxes:
        clean_tok = re.sub(r"[^A-Z0-9]", "", str(text).upper())
        if not clean_tok or clean_tok == "IND" or float(conf) < 0.40:
            continue
        tokens.append(clean_tok)
        confs.append(float(conf))

    combined = "".join(tokens)
    mean_conf = float(np.mean(confs)) if confs else 0.0
    return combined, mean_conf


def read_plate_ocr(gray_crop: np.ndarray) -> tuple[str, str, float | None, float, np.ndarray, np.ndarray]:
    """
    DIP Post-Processing + RapidOCR Scene-Text Recognition + Indian RTO Syntax Refinement.
    Returns: (refined_text, raw_ocr_text, ocr_confidence, deskew_angle_deg, enhanced_crop_bgr, binarized_preview)
    """
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

    # Connected-component analysis to filter outer plate frames, bolts, and 'IND' emblem
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

    deskewed, angle_deg = deskew_binary_plate(cv2.bitwise_not(cleaned_inv))

    widened = cv2.resize(deskewed, None, fx=1.25, fy=1.0, interpolation=cv2.INTER_CUBIC)
    _, widened = cv2.threshold(widened, 127, 255, cv2.THRESH_BINARY)
    padded_preview = cv2.copyMakeBorder(widened, 20, 20, 20, 20, cv2.BORDER_CONSTANT, value=255)

    # Pass 1: Run RapidOCR on CLAHE-enhanced natural grayscale crop
    enhanced_padded = cv2.copyMakeBorder(enhanced_crop, 16, 16, 16, 16, cv2.BORDER_REPLICATE)
    text_gray, conf_gray = _extract_rapidocr_tokens(cv2.cvtColor(enhanced_padded, cv2.COLOR_GRAY2BGR))

    # Pass 2: Run RapidOCR on deskewed, border-cleaned binary ROI
    text_bin, conf_bin = _extract_rapidocr_tokens(cv2.cvtColor(padded_preview, cv2.COLOR_GRAY2BGR))

    best_raw = text_gray
    best_conf = conf_gray
    if (8 <= len(text_bin) <= 10) and not (8 <= len(text_gray) <= 10):
        best_raw = text_bin
        best_conf = conf_bin
    elif len(text_bin) > len(text_gray) and conf_bin >= conf_gray:
        best_raw = text_bin
        best_conf = conf_bin

    refined = refine_indian_plate_syntax(best_raw)
    honest_conf = round(best_conf, 4) if best_conf > 0.0 else None
    return refined, best_raw, honest_conf, angle_deg, enhanced_crop, padded_preview


def detect_with_onnx(image: np.ndarray, conf_threshold: float = 0.30) -> tuple[int, int, int, int, float] | None:
    """Run YOLOv8n ONNX detector via ONNX Runtime and return (bx, by, bw, bh, detection_confidence)."""
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
    det_conf = round(float(confidences[best_idx]), 4)

    margin_x = int(bw * 0.04)
    margin_y = int(bh * 0.04)
    bx = max(0, bx - margin_x)
    by = max(0, by - margin_y)
    bw = min(orig_w - bx, bw + 2 * margin_x)
    bh = min(orig_h - by, bh + 2 * margin_y)
    return (bx, by, bw, bh, det_conf)


def _diagnose_failure(gray: np.ndarray, detected: bool, extracted_text: str, crop_shape: tuple[int, int] | None) -> dict | None:
    """Provide evidence-backed diagnostic guidance when localization or OCR fails."""
    h, w = gray.shape[:2]
    mean_brightness = float(np.mean(gray))
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    if detected and len(extracted_text) >= 4 and "No plate" not in extracted_text and "low OCR" not in extracted_text:
        return None

    reasons = []
    if w < 220 or h < 140:
        reasons.append("Input image resolution is very small; distant characters lack pixel density.")
    if mean_brightness < 55.0:
        reasons.append(f"Low illumination heuristic detected (mean intensity {mean_brightness:.1f}/255).")
    elif mean_brightness > 215.0:
        reasons.append(f"Overexposed / glare heuristic detected (mean intensity {mean_brightness:.1f}/255).")
    if laplacian_var < 65.0:
        reasons.append(f"Possible motion or focus blur detected (Laplacian variance {laplacian_var:.1f}).")

    if not detected:
        code = "NO_PLATE_LOCALIZED"
        summary = "YOLOv8n ONNX detector did not find a high-confidence license plate region."
        if not reasons:
            reasons.append("Plate may be occluded, severely angled, or outside detector confidence threshold (0.30).")
    else:
        code = "OCR_LOW_RESOLUTION"
        summary = "Plate region was localized, but RapidOCR could not extract a complete registration string."
        if crop_shape and crop_shape[0] < 24:
            reasons.append(f"Detected plate crop height is only {crop_shape[0]}px; character strokes are aliased.")
        if not reasons:
            reasons.append("Try inspecting the Binarized ROI stage or testing an image with clearer character contrast.")

    return {
        "code": code,
        "summary": summary,
        "indicators": reasons,
        "heuristics": {
            "mean_brightness": round(mean_brightness, 1),
            "laplacian_sharpness": round(laplacian_var, 1),
            "frame_dimensions": f"{w}x{h}",
        },
    }


def process_vehicle_image(image_bytes: bytes) -> dict:
    t_start = time.perf_counter()
    np_arr = np.frombuffer(image_bytes, np.uint8)
    original = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if original is None:
        raise ValueError("Invalid or corrupted image file.")

    orig_h, orig_w = original.shape[:2]
    if orig_w > 1280:
        scale = 1280 / orig_w
        original = cv2.resize(original, (1280, int(orig_h * scale)))

    proc_h, proc_w = original.shape[:2]
    t_stage1 = round((time.perf_counter() - t_start) * 1000, 2)

    # Stage 2: Grayscale + Bilateral Filtering + CLAHE
    t2 = time.perf_counter()
    gray = cv2.cvtColor(original, cv2.COLOR_BGR2GRAY)
    bilateral = cv2.bilateralFilter(gray, d=5, sigmaColor=15, sigmaSpace=15)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(bilateral)
    t_stage2 = round((time.perf_counter() - t2) * 1000, 2)

    # Stage 3: Morphological Blackhat + Sobel-X Vertical Gradient
    t3 = time.perf_counter()
    rect_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
    blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, rect_kern)
    grad_x = np.absolute(cv2.Sobel(blackhat, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=3))
    min_val, max_val = float(np.min(grad_x)), float(np.max(grad_x))
    if max_val - min_val > 0:
        grad_x_u8 = (255.0 * ((grad_x - min_val) / (max_val - min_val))).astype(np.uint8)
    else:
        grad_x_u8 = grad_x.astype(np.uint8)
    t_stage3 = round((time.perf_counter() - t3) * 1000, 2)

    # Stage 4: Otsu Thresholding + Rectangular Morphological Closing
    t4 = time.perf_counter()
    _, thresh = cv2.threshold(cv2.GaussianBlur(grad_x_u8, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    morph = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (19, 5)))
    t_stage4 = round((time.perf_counter() - t4) * 1000, 2)

    # Stage 5: Generalized Unified YOLOv8n ONNX Localization
    t5 = time.perf_counter()
    det = detect_with_onnx(original)
    t_stage5 = round((time.perf_counter() - t5) * 1000, 2)

    # Stage 6: ROI Crop, Connected-Component Cleaning, Deskew & RapidOCR
    t6 = time.perf_counter()
    annotated = original.copy()
    raw_crop_bgr = np.zeros((60, 200, 3), dtype=np.uint8)
    binarized_plate: np.ndarray = np.zeros((60, 200), dtype=np.uint8)
    extracted_text = "No plate detected"
    raw_ocr_text = ""
    detection_confidence: float | None = None
    ocr_confidence: float | None = None
    geometry: dict | None = None
    crop_shape: tuple[int, int] | None = None

    if det is not None:
        bx, by, bw, bh, detection_confidence = det
        cv2.rectangle(annotated, (bx, by), (bx + bw, by + bh), (0, 230, 255), 3)
        raw_crop_bgr = original[by:by + bh, bx:bx + bw].copy()
        crop = gray[by:by + bh, bx:bx + bw]
        crop_shape = crop.shape[:2]

        angle_deg = 0.0
        if crop.size > 0:
            text, raw_ocr_text, ocr_confidence, angle_deg, _, binarized_plate = read_plate_ocr(crop)
            extracted_text = text if len(text) >= 3 else "Plate localized (low OCR resolution)"

        geometry = {
            "bbox": [bx, by, bx + bw, by + bh],
            "x": bx,
            "y": by,
            "width": bw,
            "height": bh,
            "aspect_ratio": round(bw / float(max(1, bh)), 2),
            "deskew_angle_deg": angle_deg,
            "frame_width": proc_w,
            "frame_height": proc_h,
        }
    t_stage6 = round((time.perf_counter() - t6) * 1000, 2)
    pipeline_compute_ms = round((time.perf_counter() - t_start) * 1000, 2)

    failure_analysis = _diagnose_failure(gray, det is not None, extracted_text, crop_shape)

    stages_payload = {
        "original": encode_image_base64(original),
        "enhanced_gray": encode_image_base64(enhanced),
        "sobel_x_edges": encode_image_base64(grad_x_u8),
        "canny_edges": encode_image_base64(grad_x_u8),  # backwards-compatible key
        "morph_mask": encode_image_base64(morph),
        "localized": encode_image_base64(annotated),
        "binarized_plate": encode_image_base64(binarized_plate),
        "raw_plate_crop": encode_image_base64(raw_crop_bgr),
    }

    return {
        "plate_number": extracted_text,
        "raw_ocr_text": raw_ocr_text,
        "detected": det is not None,
        "detection_confidence": detection_confidence,
        "ocr_confidence": ocr_confidence,
        "geometry": geometry,
        "failure_analysis": failure_analysis,
        "pipeline_compute_ms": pipeline_compute_ms,
        "stage_timings_ms": {
            "original": t_stage1,
            "enhanced_gray": t_stage2,
            "sobel_x_edges": t_stage3,
            "morph_mask": t_stage4,
            "localized": t_stage5,
            "binarized_plate": t_stage6,
        },
        "stages": stages_payload,
    }