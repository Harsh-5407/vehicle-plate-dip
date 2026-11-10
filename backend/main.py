import time
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from dip_pipeline import process_vehicle_image

app = FastAPI(
    title="Vehicle License Plate DIP Platform",
    description="Digital Image Processing pipeline for automatic license plate localization and OCR.",
    version="1.0.0",
)

# Enable CORS so React (localhost:5173 and Render Static Site) can call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
@app.get("/health")
def health_check():
    return {"status": "ok", "service": "vehicle-plate-dip-api"}


@app.post("/api/detect-plate")
async def detect_plate(file: UploadFile = File(...)):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Please upload a valid image file (JPG, PNG, WEBP).")

    start_time = time.perf_counter()
    try:
        image_bytes = await file.read()
        result = process_vehicle_image(image_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Image processing failed: {str(e)}")

    elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)
    result["processing_time_ms"] = elapsed_ms
    result["filename"] = file.filename
    return result