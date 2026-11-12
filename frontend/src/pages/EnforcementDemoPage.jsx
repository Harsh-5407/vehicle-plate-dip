import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  Search,
  Send,
  Database,
  CheckCircle2,
  AlertCircle,
  User,
  Phone,
  MapPin,
  Car,
  FileWarning,
  X,
} from "lucide-react";
import { API_BASE_URL } from "../constants/dipData";

const QUICK_DEMO_PLATES = [
  { plate: "HR26BR9044", hint: "Mini Cooper • Gurugram" },
  { plate: "RJ14CV0002", hint: "Kia Seltos • Jaipur" },
  { plate: "MH12DE4567", hint: "Tata Ace • Pune" },
  { plate: "GJ01AB1234", hint: "Hyundai Creta • Ahmedabad" },
  { plate: "DL8CAF5030", hint: "Maruti Swift • New Delhi" },
  { plate: "GJ18BG4490", hint: "Tata Nexon EV • Gandhinagar" },
];

const VIOLATION_TYPES = [
  { label: "Over-Speeding (Highway / Urban Zone)", amount: 1000 },
  { label: "Red Light Signal Jump", amount: 1500 },
  { label: "Unauthorized No-Parking Zone", amount: 500 },
  { label: "Wrong-Side / Restricted Lane Entry", amount: 2000 },
];

export default function EnforcementDemoPage({ prefillPlate = "" }) {
  const [registry, setRegistry] = useState([]);
  const [registrySearch, setRegistrySearch] = useState("");
  const [violationPlate, setViolationPlate] = useState(prefillPlate || "HR26BR9044");
  const [selectedViolationIdx, setSelectedViolationIdx] = useState(0);
  const [dispatchingFine, setDispatchingFine] = useState(false);
  const [fineReceipt, setFineReceipt] = useState(null);
  const [showFineModal, setShowFineModal] = useState(false);
  const [fineError, setFineError] = useState("");

  const [policePlate, setPolicePlate] = useState(prefillPlate || "HR26BR9044");
  const [casePurpose, setCasePurpose] = useState("Routine Checkpoint & Identity Verification");
  const [searchingPolice, setSearchingPolice] = useState(false);
  const [policeDossier, setPoliceDossier] = useState(null);
  const [policeError, setPoliceError] = useState("");

  useEffect(() => {
    if (prefillPlate) {
      setViolationPlate(prefillPlate);
      setPolicePlate(prefillPlate);
    }
  }, [prefillPlate]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/registry`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.vehicles) setRegistry(data.vehicles);
      })
      .catch(() => {});
  }, []);

  const handleIssueFine = async (e) => {
    e.preventDefault();
    setDispatchingFine(true);
    setFineError("");
    setFineReceipt(null);
    const v = VIOLATION_TYPES[selectedViolationIdx];
    try {
      const res = await fetch(`${API_BASE_URL}/api/violation/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate_number: violationPlate,
          violation_type: v.label,
          fine_amount: v.amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to issue fine.");
      setFineReceipt(data);
      setShowFineModal(true);
    } catch (err) {
      setFineError(err.message);
    } finally {
      setDispatchingFine(false);
    }
  };

  const handlePoliceLookup = async (e) => {
    e.preventDefault();
    setSearchingPolice(true);
    setPoliceError("");
    setPoliceDossier(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/police/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate_number: policePlate,
          case_purpose: casePurpose,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "No owner record found.");
      setPoliceDossier(data);
    } catch (err) {
      setPoliceError(err.message);
    } finally {
      setSearchingPolice(false);
    }
  };

  const filteredRegistry = registry.filter((item) => {
    const q = registrySearch.trim().toLowerCase();
    if (!q) return true;
    return (
      item.plate_number.toLowerCase().includes(q) ||
      item.owner_name.toLowerCase().includes(q) ||
      item.address.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {showFineModal && fineReceipt && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1322] border border-emerald-500/40 rounded-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] uppercase font-semibold text-emerald-400">
                  Synthetic Demo E-Challan • {fineReceipt.challan_id}
                </span>
                <h3 className="text-lg font-bold text-white">{fineReceipt.banner_message}</h3>
              </div>
              <button type="button" onClick={() => setShowFineModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-300 bg-[#090E1A] p-3.5 rounded-xl border border-slate-800">
              {fineReceipt.sms_preview}
            </p>
            <button
              type="button"
              onClick={() => setShowFineModal(false)}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
            >
              Close Modal
            </button>
          </div>
        </div>
      )}

      <section className="bg-[#0D1322] border border-amber-500/30 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
            Optional Downstream Application Demo • Synthetic Records Only
          </span>
          <h1 className="text-lg font-bold text-white mt-1.5">
            Applied RTO Traffic E-Challan &amp; Police Investigation Demo
          </h1>
          <p className="text-xs text-slate-400">
            Illustrates how extracted registration numbers integrate with a downstream MongoDB Atlas database ({registry.length || 50} synthetic records).
          </p>
        </div>
      </section>

      {/* Quick Demo Plate Chips */}
      <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-5 space-y-3">
        <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
          <Database className="w-4 h-4 text-cyan-400" />
          Click a Synthetic Sample Plate to Auto-Fill Both Modules:
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {QUICK_DEMO_PLATES.map((item) => (
            <button
              key={item.plate}
              type="button"
              onClick={() => {
                setViolationPlate(item.plate);
                setPolicePlate(item.plate);
              }}
              className="text-left px-3 py-2 rounded-xl bg-[#090E1A] border border-slate-800 hover:border-cyan-500/60 transition"
            >
              <p className="font-mono text-xs font-bold text-amber-400">{item.plate}</p>
              <p className="text-[10px] text-slate-400 truncate">{item.hint}</p>
            </button>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* E-Challan Dispatcher */}
        <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FileWarning className="w-4 h-4 text-rose-400" />
            1. Traffic Violation E-Challan Dispatcher
          </h2>
          <form onSubmit={handleIssueFine} className="space-y-3 text-xs">
            <input
              type="text"
              required
              value={violationPlate}
              onChange={(e) => setViolationPlate(e.target.value.toUpperCase())}
              className="w-full bg-[#090E1A] border border-slate-700 rounded-xl px-3.5 py-2 font-mono font-bold text-amber-400 uppercase"
            />
            <select
              value={selectedViolationIdx}
              onChange={(e) => setSelectedViolationIdx(Number(e.target.value))}
              className="w-full bg-[#090E1A] border border-slate-700 rounded-xl px-3.5 py-2 text-slate-200"
            >
              {VIOLATION_TYPES.map((v, i) => (
                <option key={v.label} value={i}>
                  {v.label} — ₹{v.amount}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={dispatchingFine}
              className="w-full py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-semibold flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              {dispatchingFine ? "Dispatching..." : "Issue Fine & Send SMS Alert"}
            </button>
          </form>
          {fineError && (
            <p className="text-xs text-rose-300 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              {fineError}
            </p>
          )}
          {fineReceipt && (
            <p className="text-xs text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" />
              {fineReceipt.banner_message} ({fineReceipt.challan_id})
            </p>
          )}
        </section>

        {/* Police Investigation Lookup */}
        <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-cyan-400" />
            2. Police Investigation Owner Lookup
          </h2>
          <form onSubmit={handlePoliceLookup} className="space-y-3 text-xs">
            <input
              type="text"
              required
              value={policePlate}
              onChange={(e) => setPolicePlate(e.target.value.toUpperCase())}
              className="w-full bg-[#090E1A] border border-slate-700 rounded-xl px-3.5 py-2 font-mono font-bold text-amber-400 uppercase"
            />
            <select
              value={casePurpose}
              onChange={(e) => setCasePurpose(e.target.value)}
              className="w-full bg-[#090E1A] border border-slate-700 rounded-xl px-3.5 py-2 text-slate-200"
            >
              <option>Routine Checkpoint &amp; Identity Verification</option>
              <option>Hit-and-Run / Accident Investigation</option>
              <option>Stolen / Suspicious Vehicle Trace</option>
            </select>
            <button
              type="submit"
              disabled={searchingPolice}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold flex items-center justify-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              {searchingPolice ? "Searching..." : "Fetch Synthetic Owner Dossier"}
            </button>
          </form>
          {policeError && <p className="text-xs text-rose-300">{policeError}</p>}
          {policeDossier && (
            <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3.5 space-y-2 text-xs">
              <p className="font-bold text-white flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-cyan-400" />
                {policeDossier.owner.owner_name}
              </p>
              <p className="text-emerald-400 font-mono flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5" />
                {policeDossier.owner.phone_number}
              </p>
              <p className="text-slate-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                {policeDossier.owner.address}
              </p>
              <p className="text-slate-400 flex items-center gap-1.5">
                <Car className="w-3.5 h-3.5" />
                {policeDossier.owner.vehicle_model} • Prior Challans:{" "}
                {policeDossier.violation_history.length}
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Searchable 50-Row Synthetic Registry */}
      <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-white">
            Synthetic RTO Citizen Registry ({filteredRegistry.length} Records)
          </h2>
          <input
            type="text"
            value={registrySearch}
            onChange={(e) => setRegistrySearch(e.target.value)}
            placeholder="Filter by plate, name, or city..."
            className="bg-[#090E1A] border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white w-full sm:w-64"
          />
        </div>
        <div className="overflow-x-auto max-h-64 rounded-xl border border-slate-800">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#090E1A] text-slate-400 sticky top-0">
              <tr>
                <th className="py-2 px-3">Plate</th>
                <th className="py-2 px-3">Synthetic Owner</th>
                <th className="py-2 px-3">Phone</th>
                <th className="py-2 px-3">Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredRegistry.map((r) => (
                <tr
                  key={r.plate_number}
                  onClick={() => {
                    setViolationPlate(r.plate_number);
                    setPolicePlate(r.plate_number);
                  }}
                  className="hover:bg-cyan-500/10 cursor-pointer"
                >
                  <td className="py-2 px-3 font-mono font-bold text-amber-400">{r.plate_number}</td>
                  <td className="py-2 px-3 text-white">{r.owner_name}</td>
                  <td className="py-2 px-3 font-mono text-slate-300">{r.phone_number}</td>
                  <td className="py-2 px-3 text-slate-400">{r.address}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}