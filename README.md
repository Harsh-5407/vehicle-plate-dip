# VisionPlate DIP — Automated Vehicle License Plate Detection & Character Extraction Platform

A full-stack Digital Image Processing (DIP) and Computer Vision platform engineered for automated vehicle license plate localization and alphanumeric Optical Character Recognition (OCR). Built with **FastAPI**, **OpenCV**, **ONNX Runtime (YOLOv8-Nano)**, **Tesseract OCR**, and **React (Vite + Tailwind CSS)**, the system combines a unified multi-dataset ONNX detector with a transparent 6-stage DIP inspection pipeline optimized for low-memory CPU environments (< 512 MB RAM).

---

## Key Features

- **Unified Global & Indian HSRP Localization:** Runs a custom-trained **YOLOv8-Nano ONNX model** (`plate_detector.onnx`) via `onnxruntime` (~20 ms CPU inference) trained on a merged dataset of global CCTV vehicles and Indian High Security Registration Plates (HSRP).
- **6-Stage Visual DIP Pipeline Inspection:** Exposes every intermediate image-processing transformation directly in the web UI:
  1. **Input Acquisition:** Aspect-preserving frame normalization (max width `1280px`).
  2. **Bilateral Denoising + CLAHE:** Edge-preserving noise suppression paired with Contrast Limited Adaptive Histogram Equalization (`clipLimit=2.0`, `8×8` tile grid).
  3. **Morphological Blackhat & Sobel-X Gradient:** Highlights dark alphanumeric strokes against reflective plate backgrounds.
  4. **Otsu Thresholding & Morphological Closing:** Generates candidate plate masks using rectangular structuring elements (`19×5`).
  5. **ONNX Bounding-Box Localization:** Detects plate coordinates with Non-Maximum Suppression (NMS) and proportional margin padding.
  6. **ROI Enhancement, Deskewing & Binarization:** Applies scale-normalized bicubic resizing, local adaptive thresholding, connected-components border/emblem (`IND` hologram & screw) filtering, and minimum-area rectangle (`cv2.minAreaRect`) perspective deskewing prior to Tesseract OCR (`--psm 7` with dictionary bias disabled).
- **Automated 10-Scenario Stress-Test Benchmark:** Includes `backend/evaluate_pipeline.py` to generate synthetic test scenes (Indian HSRP close-ups, commercial yellow plates, distant CCTV gates, tilted cameras, night lighting, harsh shadows, motion blur, sensor noise, and negative road controls) and measure localization recall, Levenshtein character accuracy, and pipeline latency.

---

## System Architecture

```text
vehicle-plate-dip/
├── backend/
│   ├── models/
│   │   └── plate_detector.onnx     # Custom YOLOv8n model trained on Global + Indian plate datasets
│   ├── dip_pipeline.py             # 6-stage OpenCV DIP pipeline, ONNX inference & Tesseract OCR
│   ├── main.py                     # FastAPI REST API server & CORS configuration
│   ├── evaluate_pipeline.py        # 10-scenario automated accuracy & latency benchmark suite
│   └── requirements.txt            # Lightweight Python dependencies (< 512MB RAM footprint)
├── frontend/
│   ├── src/
│   │   ├── App.jsx                 # Interactive upload UI, extraction telemetry & 6-stage viewer
│   │   └── main.jsx                # React entry point
│   ├── index.html
│   └── package.json
└── .gitignore

To start Backend server
cd backend
python -m venv venv

To start Backend server
# Windows PowerShell:
.\venv\Scripts\Activate.ps1
# Linux / macOS:
# source venv/bin/activate

To start Backend test script
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

cd frontend
npm install
npm run dev

cd backend
python evaluate_pipeline.py
