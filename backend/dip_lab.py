import cv2
import numpy as np
from dip_pipeline import encode_image_base64


def _decode_and_normalize(image_bytes: bytes, max_width: int = 960) -> np.ndarray:
    """Decode image bytes to BGR and cap width at 960px for fast, low-RAM lab experiments."""
    np_arr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Invalid or corrupted image file.")
    h, w = img.shape[:2]
    if w > max_width:
        scale = max_width / float(w)
        img = cv2.resize(img, (max_width, max(1, int(h * scale))), interpolation=cv2.INTER_AREA)
    return img


def analyze_image_quality(image_bytes: bytes) -> dict:
    """
    Compute heuristic spatial image quality metrics:
    - Mean luminance (Brightness)
    - RMS pixel standard deviation (Contrast)
    - Variance of Laplacian (Sharpness / Blur indicator)
    - Immerkaer fast high-pass Laplacian noise standard deviation estimate
    """
    img = _decode_and_normalize(image_bytes, max_width=1280)
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    brightness = float(np.mean(gray))
    contrast = float(np.std(gray))
    sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())

    # Immerkaer (1996) 3x3 high-pass noise estimation kernel
    noise_kernel = np.array([[1, -2, 1], [-2, 4, -2], [1, -2, 1]], dtype=np.float64)
    conv = cv2.filter2D(gray.astype(np.float64), -1, noise_kernel)
    sigma_noise = float(np.sum(np.abs(conv)) * np.sqrt(0.5 * np.pi) / (6.0 * max(1, (w - 2) * (h - 2))))

    warnings = []
    if brightness < 60.0:
        warnings.append("Low brightness detected (underexposed / night frame)")
    elif brightness > 210.0:
        warnings.append("High brightness detected (possible glare or overexposure)")

    if contrast < 32.0:
        warnings.append("Low tonal contrast (flat histogram; CLAHE recommended)")

    if sharpness < 75.0:
        warnings.append("Possible motion or focus blur (low Laplacian variance)")

    if sigma_noise > 14.0:
        warnings.append("Elevated sensor noise level (bilateral smoothing recommended)")

    if w < 320 or h < 200:
        warnings.append("Low spatial resolution (distant plates may lack stroke detail)")

    return {
        "dimensions": {"width": w, "height": h, "aspect_ratio": round(w / float(max(1, h)), 2)},
        "metrics": {
            "brightness": round(brightness, 1),
            "contrast_rms": round(contrast, 1),
            "sharpness_laplacian": round(sharpness, 1),
            "noise_sigma": round(sigma_noise, 2),
        },
        "warnings": warnings,
        "summary_status": "Good Heuristic Quality" if not warnings else f"{len(warnings)} Heuristic Advisory Note(s)",
        "disclaimer": "Quality metrics are mathematical heuristics (mean intensity, RMS contrast, Laplacian variance, and Immerkaer noise sigma), not guaranteed diagnoses of ANPR readability.",
    }


def run_parameter_tuning(
    image_bytes: bytes,
    clahe_clip: float = 2.0,
    clahe_grid: int = 8,
    bilateral_d: int = 5,
    bilateral_sigma: int = 15,
    binary_thresh: int = 127,
    morph_w: int = 19,
    morph_h: int = 5,
) -> dict:
    """Re-run preprocessing stages with user-adjusted parameters within validated bounds."""
    # Clamp parameters safely on backend
    clahe_clip = float(np.clip(clahe_clip, 1.0, 8.0))
    clahe_grid = int(np.clip(clahe_grid, 2, 16))
    bilateral_d = int(np.clip(bilateral_d, 1, 15))
    if bilateral_d % 2 == 0:
        bilateral_d += 1
    bilateral_sigma = int(np.clip(bilateral_sigma, 5, 120))
    binary_thresh = int(np.clip(binary_thresh, 0, 255))
    morph_w = int(np.clip(morph_w, 3, 35))
    morph_h = int(np.clip(morph_h, 3, 15))

    img = _decode_and_normalize(image_bytes)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    bilateral = cv2.bilateralFilter(gray, d=bilateral_d, sigmaColor=bilateral_sigma, sigmaSpace=bilateral_sigma)
    clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(clahe_grid, clahe_grid))
    enhanced = clahe.apply(bilateral)

    _, manual_binary = cv2.threshold(enhanced, binary_thresh, 255, cv2.THRESH_BINARY)

    rect_kern = cv2.getStructuringElement(cv2.MORPH_RECT, (13, 5))
    blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, rect_kern)
    grad_x = np.absolute(cv2.Sobel(blackhat, ddepth=cv2.CV_32F, dx=1, dy=0, ksize=3))
    g_min, g_max = float(np.min(grad_x)), float(np.max(grad_x))
    grad_u8 = (255.0 * ((grad_x - g_min) / (g_max - g_min))).astype(np.uint8) if g_max > g_min else grad_x.astype(np.uint8)
    _, otsu_grad = cv2.threshold(cv2.GaussianBlur(grad_u8, (5, 5), 0), 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    morph_closed = cv2.morphologyEx(
        otsu_grad,
        cv2.MORPH_CLOSE,
        cv2.getStructuringElement(cv2.MORPH_RECT, (morph_w, morph_h)),
    )

    return {
        "applied_params": {
            "clahe_clip": clahe_clip,
            "clahe_grid": clahe_grid,
            "bilateral_d": bilateral_d,
            "bilateral_sigma": bilateral_sigma,
            "binary_thresh": binary_thresh,
            "morph_w": morph_w,
            "morph_h": morph_h,
        },
        "outputs": {
            "original": encode_image_base64(img),
            "grayscale": encode_image_base64(gray),
            "bilateral_clahe": encode_image_base64(enhanced),
            "manual_threshold": encode_image_base64(manual_binary),
            "morph_closed": encode_image_base64(morph_closed),
        },
    }


def run_thresholding_lab(image_bytes: bytes, global_thresh: int = 127, adaptive_block: int = 31) -> dict:
    """Compare 5 thresholding methods on the exact same grayscale input."""
    global_thresh = int(np.clip(global_thresh, 0, 255))
    adaptive_block = int(np.clip(adaptive_block, 3, 75))
    if adaptive_block % 2 == 0:
        adaptive_block += 1

    img = _decode_and_normalize(image_bytes)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    _, bin_global = cv2.threshold(gray, global_thresh, 255, cv2.THRESH_BINARY)
    _, bin_inv = cv2.threshold(gray, global_thresh, 255, cv2.THRESH_BINARY_INV)
    otsu_val, bin_otsu = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    bin_adapt_mean = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, adaptive_block, 10
    )
    bin_adapt_gauss = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, adaptive_block, 10
    )

    return {
        "params": {
            "global_thresh": global_thresh,
            "otsu_computed_thresh": round(float(otsu_val), 1),
            "adaptive_block": adaptive_block,
        },
        "outputs": {
            "grayscale": encode_image_base64(gray),
            "global_binary": encode_image_base64(bin_global),
            "binary_inverse": encode_image_base64(bin_inv),
            "otsu": encode_image_base64(bin_otsu),
            "adaptive_mean": encode_image_base64(bin_adapt_mean),
            "adaptive_gaussian": encode_image_base64(bin_adapt_gauss),
        },
    }


def run_edge_lab(image_bytes: bytes, sobel_ksize: int = 3, canny_low: int = 80, canny_high: int = 180) -> dict:
    """Compare Sobel-X, Sobel-Y, Laplacian, and Canny edge/gradient operators."""
    sobel_ksize = 3 if sobel_ksize <= 3 else 5
    canny_low = int(np.clip(canny_low, 10, 240))
    canny_high = int(np.clip(canny_high, canny_low + 10, 255))

    img = _decode_and_normalize(image_bytes)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)

    def _norm_u8(arr: np.ndarray) -> np.ndarray:
        abs_arr = np.absolute(arr)
        mn, mx = float(np.min(abs_arr)), float(np.max(abs_arr))
        if mx <= mn:
            return np.zeros_like(gray)
        return (255.0 * ((abs_arr - mn) / (mx - mn))).astype(np.uint8)

    sobel_x = _norm_u8(cv2.Sobel(blurred, cv2.CV_32F, 1, 0, ksize=sobel_ksize))
    sobel_y = _norm_u8(cv2.Sobel(blurred, cv2.CV_32F, 0, 1, ksize=sobel_ksize))
    laplacian = _norm_u8(cv2.Laplacian(blurred, cv2.CV_32F, ksize=sobel_ksize))
    canny = cv2.Canny(blurred, threshold1=canny_low, threshold2=canny_high)

    return {
        "params": {
            "sobel_ksize": sobel_ksize,
            "canny_low": canny_low,
            "canny_high": canny_high,
        },
        "outputs": {
            "grayscale": encode_image_base64(gray),
            "sobel_x": encode_image_base64(sobel_x),
            "sobel_y": encode_image_base64(sobel_y),
            "laplacian": encode_image_base64(laplacian),
            "canny": encode_image_base64(canny),
        },
    }


def compute_image_histograms(image_bytes: bytes, clahe_clip: float = 2.0) -> dict:
    """Compute exact 256-bin histograms for Grayscale Before/After CLAHE and RGB channels."""
    clahe_clip = float(np.clip(clahe_clip, 1.0, 8.0))
    img = _decode_and_normalize(image_bytes)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=clahe_clip, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    hist_before = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten().astype(int).tolist()
    hist_after = cv2.calcHist([enhanced], [0], None, [256], [0, 256]).flatten().astype(int).tolist()

    hist_b = cv2.calcHist([img], [0], None, [256], [0, 256]).flatten().astype(int).tolist()
    hist_g = cv2.calcHist([img], [1], None, [256], [0, 256]).flatten().astype(int).tolist()
    hist_r = cv2.calcHist([img], [2], None, [256], [0, 256]).flatten().astype(int).tolist()

    return {
        "stats": {
            "mean_before": round(float(np.mean(gray)), 1),
            "std_before": round(float(np.std(gray)), 1),
            "mean_after": round(float(np.mean(enhanced)), 1),
            "std_after": round(float(np.std(enhanced)), 1),
        },
        "images": {
            "gray_before": encode_image_base64(gray),
            "gray_after": encode_image_base64(enhanced),
        },
        "histograms": {
            "gray_before": hist_before,
            "gray_after": hist_after,
            "red": hist_r,
            "green": hist_g,
            "blue": hist_b,
        },
    }