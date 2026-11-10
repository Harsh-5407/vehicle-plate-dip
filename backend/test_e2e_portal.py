import sys
import requests

BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://anpr-system-api.onrender.com"

def run_tests():
    print(f"Testing VisionPlate DIP & RTO Portal at: {BASE_URL}\n")

    # 1. Health & MongoDB Record Count
    r = requests.get(f"{BASE_URL}/health", timeout=60)
    assert r.status_code == 200, f"Health check failed: {r.status_code}"
    health = r.json()
    print(f"[PASS] 1. Health Check -> DB: {health.get('database')} | Registered Vehicles: {health.get('registered_vehicles')}")
    assert health.get("registered_vehicles", 0) >= 50, "Expected at least 50 seeded vehicles in MongoDB!"

    # 2. Fetch Full Registry
    r = requests.get(f"{BASE_URL}/api/registry", timeout=30)
    assert r.status_code == 200
    vehicles = r.json().get("vehicles", [])
    print(f"[PASS] 2. Registry List -> Retrieved {len(vehicles)} citizen records.")

    # 3. Issue Traffic Violation E-Challan (Application 1)
    challan_payload = {
        "plate_number": "HR26BR9044",
        "violation_type": "Over-Speeding (Highway / Urban Zone)",
        "fine_amount": 1000,
    }
    r = requests.post(f"{BASE_URL}/api/violation/issue", json=challan_payload, timeout=30)
    assert r.status_code == 200, f"Violation dispatch failed: {r.text}"
    receipt = r.json()
    print(f"[PASS] 3. Traffic E-Challan -> {receipt['banner_message']} | ID: {receipt['challan_id']} | Phone: {receipt['phone_number']}")

    # 4. Police Investigation Lookup & Cross-Reference Check (Application 2)
    police_payload = {
        "plate_number": "HR26BR9044",
        "case_purpose": "Routine Checkpoint & Identity Verification",
    }
    r = requests.post(f"{BASE_URL}/api/police/lookup", json=police_payload, timeout=30)
    assert r.status_code == 200, f"Police lookup failed: {r.text}"
    dossier = r.json()
    owner = dossier["owner"]
    history_ids = [c["challan_id"] for c in dossier["violation_history"]]
    assert receipt["challan_id"] in history_ids, "Newly issued challan did not appear in police dossier!"
    print(f"[PASS] 4. Police Dossier -> Owner: {owner['owner_name']} | Address: {owner['address']} | Priors: {len(history_ids)}")

    # 5. Negative Test: Unregistered Plate Handling
    r = requests.post(f"{BASE_URL}/api/police/lookup", json={"plate_number": "ZZ99XX0000"}, timeout=30)
    assert r.status_code == 404, f"Expected 404 for unknown plate, got {r.status_code}"
    print("[PASS] 5. Unknown Plate Guard -> Properly returned 404 Not Found.\n")
    print("ALL END-TO-END CHECKS PASSED!")

if __name__ == "__main__":
    run_tests()