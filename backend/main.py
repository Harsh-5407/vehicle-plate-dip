import os
import re
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import DuplicateKeyError
from dip_pipeline import process_vehicle_image

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB_NAME", "visionplate_rto")

client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client[DB_NAME]
vehicles_col = db["vehicles"]
challans_col = db["challan_logs"]

# 50 realistic Indian RTO citizen records (first 5 match scanner demo & real test plates)
SEED_VEHICLES = [
    ("HR26BR9044", "Vikramaditya Sharma", "+91-98114-72910", "House 412, Sector 15, Gurugram, Haryana", "Mini Cooper S (Red)"),
    ("RJ14CV0002", "Ananya Rathore", "+91-94140-58321", "B-28, C-Scheme, Jaipur, Rajasthan", "Kia Seltos HTX (White)"),
    ("MH12DE4567", "Siddharth Kulkarni", "+91-98220-19485", "Flat 304, Koregaon Park, Pune, Maharashtra", "Tata Ace Gold (Commercial Yellow)"),
    ("GJ01AB1234", "Rohan Patel", "+91-98795-64102", "14, Shyamal Row House, Satellite, Ahmedabad, Gujarat", "Hyundai Creta SX (Silver)"),
    ("DL8CAF5030", "Meera Nair", "+91-99102-83746", "C-4/19, Vasant Kunj, New Delhi", "Maruti Suzuki Swift VXi (Blue)"),
    ("HR51CB7821", "Aarav Malhotra", "+91-98103-44219", "House 118, Sector 21C, Faridabad, Haryana", "Honda City ZX (White)"),
    ("GJ18BG4490", "Kavya Desai", "+91-98250-71304", "Plot 56, Sector 7, Gandhinagar, Gujarat", "Tata Nexon EV (Teal)"),
    ("KA03MW8899", "Karthik Subramanian", "+91-98451-60923", "22, 4th Main, Indiranagar, Bengaluru, Karnataka", "Mahindra XUV700 (Midnight Black)"),
    ("UP16BT9901", "Prashant Verma", "+91-98182-33910", "Tower B-902, Sector 62, Noida, Uttar Pradesh", "Toyota Innova Crysta (Grey)"),
    ("TN09BC4321", "Divya Krishnan", "+91-94441-88210", "17, Habibullah Road, T. Nagar, Chennai, Tamil Nadu", "Hyundai i20 N-Line (Red)"),
    ("MH01DX9104", "Zoya Merchant", "+91-98201-55782", "802, Sea Breeze Towers, Worli, Mumbai, Maharashtra", "BMW 330i M Sport (White)"),
    ("DL3CAY6712", "Kabir Arora", "+91-98111-90452", "E-142, Greater Kailash II, New Delhi", "Volkswagen Virtus GT (Yellow)"),
    ("GJ05JR3318", "Darshan Shah", "+91-98241-22890", "401, Vesu VIP Road, Surat, Gujarat", "Maruti Suzuki Brezza ZXi (White)"),
    ("HR29AQ5509", "Neha Bansal", "+91-98994-11028", "House 74, Sector 14, Faridabad, Haryana", "Hyundai Verna SX (Black)"),
    ("RJ19UA8042", "Devendra Singh", "+91-94141-77650", "12, Shastri Nagar, Jodhpur, Rajasthan", "Mahindra Scorpio-N (White)"),
    ("UP32KP2190", "Shruti Srivastava", "+91-94150-66321", "B-19, Gomti Nagar, Lucknow, Uttar Pradesh", "Tata Harrier Dark (Black)"),
    ("PB10FF7743", "Gurpreet Gill", "+91-98140-89214", "45, Sarabha Nagar, Ludhiana, Punjab", "Toyota Fortuner Legender (White)"),
    ("CH01BW9920", "Simranjit Kaur", "+91-98155-30198", "House 210, Sector 9-C, Chandigarh", "Honda Elevate ZX (Orange)"),
    ("WB02AN6415", "Anirban Chatterjee", "+91-98301-47892", "18/2, Ballygunge Circular Rd, Kolkata, West Bengal", "Skoda Slavia 1.5 TSI (Blue)"),
    ("TS07GZ5189", "Nikhil Reddy", "+91-98490-73215", "Plot 88, Jubilee Hills, Hyderabad, Telangana", "MG Hector Sharp (Burgundy)"),
    ("GJ06PD8832", "Mihir Trivedi", "+91-98253-91047", "29, Alkapuri Society, Vadodara, Gujarat", "Maruti Suzuki Baleno Alpha (Silver)"),
    ("HR26DQ1198", "Tanya Kapoor", "+91-98109-65432", "D-45, DLF Phase 1, Gurugram, Haryana", "Jeep Compass Limited (Green)"),
    ("MH04KL7390", "Omkar Deshmukh", "+91-98212-84910", "503, Hiranandani Estate, Thane, Maharashtra", "Tata Safari Accomplished (Gold)"),
    ("DL10SC4082", "Rajeshwari Iyer", "+91-98711-29384", "A-12, Dwarka Sector 10, New Delhi", "Honda Amaze VX (Silver)"),
    ("KA01MJ3579", "Aditya Hegde", "+91-98450-12987", "91, Koramangala 3rd Block, Bengaluru, Karnataka", "Kia Carens Luxury (Blue)"),
    ("GJ18AM9021", "Harshil Joshi", "+91-98790-45123", "Plot 104, Sector 21, Gandhinagar, Gujarat", "Maruti Suzuki Grand Vitara (White)"),
    ("UP14EN6204", "Abhishek Tyagi", "+91-98107-88341", "C-78, Raj Nagar, Ghaziabad, Uttar Pradesh", "Mahindra Thar 4x4 (Red)"),
    ("RJ27CD4810", "Pallavi Chundawat", "+91-94142-39012", "16, Fatehpura, Udaipur, Rajasthan", "Hyundai Alcazar Platinum (White)"),
    ("MP09CX7125", "Saurabh Tiwari", "+91-98260-51904", "34, Vijay Nagar, Indore, Madhya Pradesh", "Tata Punch Creative (Grey)"),
    ("KL07CU9430", "Arjun Menon", "+91-98470-62819", "11B, Marine Drive, Kochi, Kerala", "Toyota Hyryder V Hybrid (Silver)"),
    ("HR51BQ3095", "Deepak Hooda", "+91-98118-74520", "House 309, Sector 16A, Faridabad, Haryana", "Maruti Suzuki Ertiga ZXi (White)"),
    ("GJ01KL5541", "Nidhi Parikh", "+91-98251-83920", "7, Bodakdev, Ahmedabad, Gujarat", "Volkswagen Taigun GT (Red)"),
    ("MH14GU2864", "Pranav Joshi", "+91-98230-41789", "202, Wakad, Pimpri-Chinchwad, Maharashtra", "Hyundai Venue SX (White)"),
    ("DL4CNA8193", "Sonia Bhardwaj", "+91-98104-56712", "B-54, Janakpuri, New Delhi", "Kia Sonet GTX+ (Black)"),
    ("TN01AZ6920", "Vigneshwaran R", "+91-98401-39482", "42, Anna Nagar East, Chennai, Tamil Nadu", "Honda Civic ZX (White)"),
    ("KA05NB1408", "Sneha Rao", "+91-98452-90813", "63, Jayanagar 4th Block, Bengaluru, Karnataka", "Tata Altroz iTurbo (Gold)"),
    ("UP80FG9317", "Manish Agarwal", "+91-94122-61049", "19, Dayalbagh, Agra, Uttar Pradesh", "Maruti Suzuki Ciaz Alpha (Brown)"),
    ("PB08DX4726", "Harmanpreet Singh", "+91-98141-20938", "82, Model Town, Jalandhar, Punjab", "Mahindra XUV300 W8 (White)"),
    ("GJ03MR6180", "Chirag Vora", "+91-98242-77410", "15, Kalawad Road, Rajkot, Gujarat", "Toyota Glanza V (Blue)"),
    ("HR26EK8502", "Pooja Yadav", "+91-98115-92034", "Flat 601, Nirvana Country, Gurugram, Haryana", "Skoda Kushaq Monte Carlo (Red)"),
    ("MH02FE3914", "Farhan Shaikh", "+91-98204-68129", "12, Pali Hill, Bandra West, Mumbai, Maharashtra", "Audi A4 Technology (Black)"),
    ("DL7CS5289", "Nitin Saxena", "+91-98108-14729", "D-88, Preet Vihar, New Delhi", "Hyundai Exter SX (Khaki)"),
    ("RJ14GH7640", "Lokesh Sharma", "+91-94143-82910", "51, Vaishali Nagar, Jaipur, Rajasthan", "Maruti Suzuki Fronx Alpha (Silver)"),
    ("TS08HL9053", "Swathi Reddy", "+91-98480-31947", "Plot 19, Gachibowli, Hyderabad, Telangana", "Tata Tiago EV (White)"),
    ("WB06PT1834", "Subhojit Sen", "+91-98310-59284", "44, Salt Lake Sector 1, Kolkata, West Bengal", "Honda WR-V VX (Brown)"),
    ("GJ18CD4907", "Jignesh Chaudhari", "+91-98791-30482", "Plot 72, Infocity Road, Gandhinagar, Gujarat", "Mahindra Bolero Neo (White)"),
    ("HR51AV6738", "Ritu Chauhan", "+91-98119-40281", "House 512, Greenfield Colony, Faridabad, Haryana", "Nissan Magnite XV (Red)"),
    ("KA04PK2591", "Pradeep Gowda", "+91-98453-71829", "28, Malleshwaram, Bengaluru, Karnataka", "Renault Kiger RXZ (Blue)"),
    ("UP16DM8410", "Shashank Dubey", "+91-98185-62940", "A-1104, Sector 137, Noida, Uttar Pradesh", "MG Astor Savvy (White)"),
    ("MH12PQ9752", "Gauri Patwardhan", "+91-98223-50918", "9, Prabhat Road, Deccan Gymkhana, Pune, Maharashtra", "Hyundai Tucson Signature (Grey)"),
]


def normalize_plate(plate: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", plate.upper())


def init_db() -> None:
    try:
        vehicles_col.create_index([("plate_number", ASCENDING)], unique=True)
        challans_col.create_index([("plate_number", ASCENDING), ("issued_at", DESCENDING)])

        existing_count = vehicles_col.count_documents({})
        if existing_count < len(SEED_VEHICLES):
            for plate, owner, phone, addr, model in SEED_VEHICLES:
                vehicles_col.update_one(
                    {"plate_number": plate},
                    {
                        "$setOnInsert": {
                            "plate_number": plate,
                            "owner_name": owner,
                            "phone_number": phone,
                            "address": addr,
                            "vehicle_model": model,
                        }
                    },
                    upsert=True,
                )
        print(f"[INFO] MongoDB connected ({DB_NAME}). Total registered vehicles: {vehicles_col.count_documents({})}")
    except Exception as e:
        print(f"[WARNING] MongoDB initialization error: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield
    client.close()


app = FastAPI(
    title="Vehicle License Plate DIP & RTO Enforcement Platform",
    description="Digital Image Processing ANPR pipeline with MongoDB RTO Registry, Traffic Violation E-Challan Dispatch & Police Lookup.",
    version="2.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class VehicleCreateRequest(BaseModel):
    plate_number: str
    owner_name: str
    phone_number: str
    address: str
    vehicle_model: str = "Private Passenger Vehicle"


class ViolationIssueRequest(BaseModel):
    plate_number: str
    violation_type: str
    fine_amount: int


class PoliceLookupRequest(BaseModel):
    plate_number: str
    case_purpose: str = "General Verification & Investigation"


@app.get("/")
@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "service": "vehicle-plate-dip-api",
        "database": "mongodb",
        "registered_vehicles": vehicles_col.count_documents({}),
    }


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


# --- Feature 2: MongoDB Vehicle Owner Registry & Enforcement Endpoints ---


@app.get("/api/registry")
def list_registered_vehicles():
    docs = list(vehicles_col.find({}, {"_id": 0}))
    return {"total": len(docs), "vehicles": docs}


@app.post("/api/registry")
def register_vehicle(payload: VehicleCreateRequest):
    plate = normalize_plate(payload.plate_number)
    if len(plate) < 5:
        raise HTTPException(status_code=400, detail="Please enter a valid license plate number.")

    doc = {
        "plate_number": plate,
        "owner_name": payload.owner_name.strip(),
        "phone_number": payload.phone_number.strip(),
        "address": payload.address.strip(),
        "vehicle_model": payload.vehicle_model.strip() or "Private Passenger Vehicle",
    }
    try:
        vehicles_col.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail=f"Vehicle plate {plate} is already registered in MongoDB.")

    return {"message": f"Vehicle {plate} registered successfully.", "plate_number": plate}


@app.post("/api/violation/issue")
def issue_traffic_violation(payload: ViolationIssueRequest):
    plate = normalize_plate(payload.plate_number)
    if not plate:
        raise HTTPException(status_code=400, detail="License plate number is required.")

    owner = vehicles_col.find_one({"plate_number": plate}, {"_id": 0})
    if not owner:
        raise HTTPException(
            status_code=404,
            detail=f"Plate '{plate}' not found in RTO MongoDB registry. Register this vehicle first to dispatch a fine.",
        )

    challan_id = f"CHLN-{datetime.now().year}-{uuid.uuid4().hex[:5].upper()}"
    issued_at = datetime.now().strftime("%d %b %Y, %I:%M %p")
    sms_text = (
        f"RTO E-CHALLAN ALERT: Violation [{payload.violation_type}] recorded for vehicle {plate}. "
        f"Fine of Rs. {payload.fine_amount} (ID: {challan_id}) sent to {owner['owner_name']} ({owner['phone_number']})."
    )

    challan_doc = {
        "challan_id": challan_id,
        "plate_number": plate,
        "owner_name": owner["owner_name"],
        "phone_number": owner["phone_number"],
        "violation_type": payload.violation_type,
        "fine_amount": payload.fine_amount,
        "issued_at": issued_at,
    }
    challans_col.insert_one(challan_doc)

    return {
        "status": "dispatched",
        "banner_message": f"Fine message sent to {owner['owner_name']}",
        "challan_id": challan_id,
        "plate_number": plate,
        "owner_name": owner["owner_name"],
        "phone_number": owner["phone_number"],
        "address": owner["address"],
        "vehicle_model": owner["vehicle_model"],
        "violation_type": payload.violation_type,
        "fine_amount": payload.fine_amount,
        "issued_at": issued_at,
        "sms_preview": sms_text,
    }


@app.post("/api/police/lookup")
def police_investigation_lookup(payload: PoliceLookupRequest):
    plate = normalize_plate(payload.plate_number)
    if not plate:
        raise HTTPException(status_code=400, detail="License plate number is required.")

    owner = vehicles_col.find_one({"plate_number": plate}, {"_id": 0})
    if not owner:
        raise HTTPException(
            status_code=404,
            detail=f"No owner record found for plate '{plate}' in RTO investigation records.",
        )

    history = list(challans_col.find({"plate_number": plate}, {"_id": 0}).sort("_id", DESCENDING))

    return {
        "found": True,
        "case_purpose": payload.case_purpose,
        "queried_at": datetime.now().strftime("%d %b %Y, %I:%M %p"),
        "owner": owner,
        "violation_history": history,
    }