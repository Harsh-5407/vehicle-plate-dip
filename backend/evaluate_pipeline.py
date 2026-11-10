import os
import time
import cv2
import numpy as np
from dip_pipeline import process_vehicle_image

OUT_DIR = os.path.join(os.path.dirname(__file__), "test_samples")
os.makedirs(OUT_DIR, exist_ok=True)


def levenshtein_similarity(a: str, b: str) -> float:
    if not a and not b:
        return 100.0
    if not a or not b:
        return 0.0
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(len(a) + 1):
        dp[i][0] = i
    for j in range(len(b) + 1):
        dp[0][j] = j
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    max_len = max(len(a), len(b))
    return max(0.0, (1.0 - dp[len(a)][len(b)] / max_len) * 100.0)


def render_vehicle_scene(
    plate_text: str,
    bg_color: tuple[int, int, int] = (235, 235, 235),
    text_color: tuple[int, int, int] = (20, 20, 20),
    ind_strip: bool = True,
    plate_scale: float = 1.0,
    angle: float = 0.0,
    brightness: float = 1.0,
    shadow: bool = False,
    motion_blur: bool = False,
    noise_sigma: float = 0.0,
    has_plate: bool = True,
) -> np.ndarray:
    """Synthesize realistic front/rear vehicle bumper frames at controlled scales and degradations."""
    H, W = 720, 1280
    img = np.full((H, W, 3), (185, 190, 195), dtype=np.uint8)

    # Draw simplified vehicle bumper + grille context so ONNX detector sees full vehicle cues
    cv2.rectangle(img, (180, 120), (1100, 620), (215, 218, 222), -1)
    cv2.rectangle(img, (260, 180), (1020, 310), (45, 48, 52), -1)  # upper grille
    cv2.rectangle(img, (230, 500), (1050, 590), (35, 38, 42), -1)  # lower air dam
    cv2.circle(img, (260, 245), 42, (240, 245, 250), -1)           # left headlight
    cv2.circle(img, (1020, 245), 42, (240, 245, 250), -1)          # right headlight

    if has_plate:
        pw = int(440 * plate_scale)
        ph = int(96 * plate_scale)
        plate = np.full((ph, pw, 3), bg_color, dtype=np.uint8)
        cv2.rectangle(plate, (0, 0), (pw - 1, ph - 1), (15, 15, 15), max(2, int(4 * plate_scale)))

        text_x_start = int(16 * plate_scale)
        if ind_strip:
            strip_w = int(42 * plate_scale)
            cv2.rectangle(plate, (4, 4), (strip_w, ph - 5), (180, 75, 20), -1)
            cv2.putText(
                plate,
                "IND",
                (int(8 * plate_scale), int(ph * 0.65)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.38 * plate_scale,
                (255, 255, 255),
                max(1, int(1.2 * plate_scale)),
                cv2.LINE_AA,
            )
            text_x_start = strip_w + int(12 * plate_scale)

        font_scale = 1.65 * plate_scale
        thickness = max(2, int(4 * plate_scale))
        cv2.putText(
            plate,
            plate_text,
            (text_x_start, int(ph * 0.74)),
            cv2.FONT_HERSHEY_SIMPLEX,
            font_scale,
            text_color,
            thickness,
            cv2.LINE_AA,
        )

        if abs(angle) > 0.1:
            M = cv2.getRotationMatrix2D((pw / 2, ph / 2), angle, 1.0)
            plate = cv2.warpAffine(plate, M, (pw, ph), borderValue=(215, 218, 222))

        px = (W - pw) // 2
        py = int(395 - ph // 2)
        img[py:py + ph, px:px + pw] = plate

    if shadow:
        overlay = img.copy()
        pts = np.array([[420, 120], [760, 120], [660, 620], [320, 620]], np.int32)
        cv2.fillPoly(overlay, [pts], (40, 40, 45))
        img = cv2.addWeighted(overlay, 0.42, img, 0.58, 0)

    if brightness != 1.0:
        img = np.clip(img.astype(np.float32) * brightness, 0, 255).astype(np.uint8)

    if motion_blur:
        k = np.zeros((9, 9), dtype=np.float32)
        k[4, :] = 1.0 / 9.0
        img = cv2.filter2D(img, -1, k)

    if noise_sigma > 0:
        noise = np.random.normal(0, noise_sigma, img.shape).astype(np.float32)
        img = np.clip(img.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    return img


SCENARIOS = [
    ("01_indian_hsrp_closeup.jpg", "RJ14CV0002", dict(ind_strip=True, plate_scale=1.15)),
    ("02_indian_hsrp_standard.jpg", "GJ01AB1234", dict(ind_strip=True, plate_scale=0.90)),
    ("03_commercial_yellow.jpg", "MH12DE4567", dict(bg_color=(30, 205, 245), ind_strip=True, plate_scale=0.95)),
    ("04_cctv_distant_small.jpg", "LB19RKV", dict(ind_strip=False, plate_scale=0.52)),
    ("05_tilted_camera_angle.jpg", "DL8CAF5030", dict(ind_strip=True, plate_scale=0.95, angle=9.0)),
    ("06_low_light_night.jpg", "KA03MW8899", dict(ind_strip=True, plate_scale=0.95, brightness=0.45, noise_sigma=8.0)),
    ("07_diagonal_shadow.jpg", "UP16BT9901", dict(ind_strip=True, plate_scale=0.95, shadow=True)),
    ("08_motion_blur.jpg", "HR26DK8337", dict(ind_strip=True, plate_scale=1.0, motion_blur=True)),
    ("09_noisy_sensor_grain.jpg", "TN09BC4321", dict(ind_strip=True, plate_scale=0.95, noise_sigma=16.0)),
    ("10_negative_no_plate.jpg", "NONE", dict(has_plate=False)),
]


def main():
    print(f"Generating 10 benchmark images in: {OUT_DIR}\n")
    print(f"{'Scenario':<30} | {'Expected':<11} | {'Predicted':<22} | {'Detected':<8} | {'Char Acc':<8} | {'Latency'}")
    print("-" * 105)

    total_acc = []
    detected_positives = 0
    total_positives = 0

    for filename, expected, kwargs in SCENARIOS:
        img = render_vehicle_scene(expected, **kwargs)
        fpath = os.path.join(OUT_DIR, filename)
        cv2.imwrite(fpath, img)

        _, buf = cv2.imencode(".jpg", img)
        t0 = time.perf_counter()
        res = process_vehicle_image(buf.tobytes())
        ms = (time.perf_counter() - t0) * 1000.0

        pred = res["plate_number"]
        det = res["detected"]

        if expected == "NONE":
            acc = 100.0 if not det else 0.0
        else:
            total_positives += 1
            if det:
                detected_positives += 1
            acc = levenshtein_similarity(expected, pred if det else "")

        total_acc.append(acc)
        print(f"{filename:<30} | {expected:<11} | {pred:<22} | {str(det):<8} | {acc:6.1f}% | {ms:6.1f} ms")

    print("-" * 105)
    print(f"Localization Recall (9 positive plates): {detected_positives}/{total_positives} ({(detected_positives/total_positives)*100:.1f}%)")
    print(f"Mean End-to-End Pipeline Score (10 scenarios): {np.mean(total_acc):.1f}%")


if __name__ == "__main__":
    main()