import React, { useState, useEffect } from "react";
import {
  Upload,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Image as ImageIcon,
  ShieldAlert,
  Search,
  Send,
  Database,
  UserPlus,
  Phone,
  MapPin,
  User,
  Car,
  ArrowRight,
  X,
  FileWarning,
} from "lucide-react";

const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "https://anpr-system-api.onrender.com"
).replace(/\/$/, "");

const SAMPLE_PRESETS = [
  {
    id: "hsrp",
    label: "Indian HSRP Close-Up",
    tag: "RJ14CV0002",
    src: "/samples/sample_hsrp.jpg",
  },
  {
    id: "yellow",
    label: "Commercial Yellow Plate",
    tag: "MH12DE4567",
    src: "/samples/sample_yellow.jpg",
  },
  {
    id: "cctv",
    label: "CCTV Gate Wide-Angle",
    tag: "LB19RKV",
    src: "/samples/sample_cctv.jpg",
  },
];

const QUICK_DEMO_PLATES = [
  { plate: "HR26BR9044", hint: "Mini Cooper • Gurugram" },
  { plate: "RJ14CV0002", hint: "Kia Seltos • Jaipur" },
  { plate: "MH12DE4567", hint: "Tata Ace • Pune" },
  { plate: "GJ01AB1234", hint: "Hyundai Creta • Ahmedabad" },
  { plate: "DL8CAF5030", hint: "Maruti Swift • New Delhi" },
  { plate: "HR51CB7821", hint: "Honda City • Faridabad" },
  { plate: "GJ18BG4490", hint: "Tata Nexon EV • Gandhinagar" },
  { plate: "KA03MW8899", hint: "Mahindra XUV700 • Bengaluru" },
];

const DIP_STAGES_META = [
  {
    key: "original",
    title: "1. Input Acquisition",
    subtitle: "Aspect-preserved frame normalization (max 1280px)",
  },
  {
    key: "enhanced_gray",
    title: "2. Bilateral + CLAHE",
    subtitle: "Edge-preserving denoising & adaptive contrast boost",
  },
  {
    key: "canny_edges",
    title: "3. Blackhat + Sobel-X",
    subtitle: "High-gradient vertical stroke boundary extraction",
  },
  {
    key: "morph_mask",
    title: "4. Morphological Closing",
    subtitle: "Rectangular kernel (19×5) candidate mask fusion",
  },
  {
    key: "localized",
    title: "5. ONNX Localization",
    subtitle: "YOLOv8n bounding-box detection & NMS filtering",
  },
  {
    key: "binarized_plate",
    title: "6. Segmented & Binarized ROI",
    subtitle: "Deskewed, border-cleaned crop fed to RapidOCR",
  },
];

const VIOLATION_TYPES = [
  { label: "Over-Speeding (Highway / Urban Zone)", amount: 1000 },
  { label: "Red Light Signal Jump", amount: 1500 },
  { label: "Unauthorized No-Parking Zone", amount: 500 },
  { label: "Driving Without Seatbelt / Helmet", amount: 1000 },
  { label: "Wrong-Side / Restricted Lane Entry", amount: 2000 },
];

const INVESTIGATION_PURPOSES = [
  "Routine Checkpoint & Identity Verification",
  "Hit-and-Run / Accident Investigation",
  "Stolen / Suspicious Vehicle Trace",
  "Civil / Court Summons Verification",
];

export default function App() {
  const [activeTab, setActiveTab] = useState("scanner");

  // --- Tab 1: DIP Plate Scanner State ---
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSample, setActiveSample] = useState(null);

  // --- Tab 2: MongoDB RTO Registry, Traffic Violation & Police Lookup State ---
  const [registry, setRegistry] = useState([]);
  const [registrySearch, setRegistrySearch] = useState("");
  const [registryLoading, setRegistryLoading] = useState(false);

  // Application 1: Traffic Violation Fine Dispatch
  const [violationPlate, setViolationPlate] = useState("HR26BR9044");
  const [selectedViolationIdx, setSelectedViolationIdx] = useState(0);
  const [dispatchingFine, setDispatchingFine] = useState(false);
  const [fineReceipt, setFineReceipt] = useState(null);
  const [showFineModal, setShowFineModal] = useState(false);
  const [fineError, setFineError] = useState("");

  // Application 2: Police Investigation Lookup
  const [policePlate, setPolicePlate] = useState("HR26BR9044");
  const [casePurpose, setCasePurpose] = useState(INVESTIGATION_PURPOSES[0]);
  const [searchingPolice, setSearchingPolice] = useState(false);
  const [policeDossier, setPoliceDossier] = useState(null);
  const [policeError, setPoliceError] = useState("");

  // Add Vehicle Owner Form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newOwner, setNewOwner] = useState({
    plate_number: "",
    owner_name: "",
    phone_number: "",
    address: "",
    vehicle_model: "",
  });
  const [addStatus, setAddStatus] = useState("");

  const fetchRegistry = async () => {
    setRegistryLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/registry`);
      if (res.ok) {
        const data = await res.json();
        setRegistry(data.vehicles || []);
      }
    } catch {
      // Ignore background fetch error during cold start
    } finally {
      setRegistryLoading(false);
    }
  };

  useEffect(() => {
    fetchRegistry();
  }, []);

  const runDetection = async (fileToProcess) => {
    if (!fileToProcess) return;
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", fileToProcess);

    const t0 = performance.now();
    try {
      const response = await fetch(`${API_BASE_URL}/api/detect-plate`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      const data = await response.json();
      const roundTripMs = (performance.now() - t0).toFixed(2);
      setLatencyMs(data.processing_time_ms ? `${data.processing_time_ms}` : roundTripMs);
      setResult(data);
    } catch (err) {
      setError(err.message || "Failed to process image. Check backend connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActiveSample(null);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError("");
  };

  const handleSampleClick = async (sample) => {
    try {
      setActiveSample(sample.id);
      setError("");
      setPreviewUrl(sample.src);

      const response = await fetch(sample.src);
      const blob = await response.blob();
      const file = new File([blob], `${sample.id}.jpg`, { type: "image/jpeg" });
      setSelectedFile(file);
      await runDetection(file);
    } catch {
      setError("Could not load sample image.");
    }
  };

  const handleSendToEnforcement = (plateText) => {
    const cleaned = (plateText || "").replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (!cleaned) return;
    setViolationPlate(cleaned);
    setPolicePlate(cleaned);
    setFineReceipt(null);
    setPoliceDossier(null);
    setFineError("");
    setPoliceError("");
    setActiveTab("enforcement");
  };

  const handleDemoChipSelect = (plate) => {
    setViolationPlate(plate);
    setPolicePlate(plate);
    setFineError("");
    setPoliceError("");
  };

  const handleIssueFine = async (e) => {
    e.preventDefault();
    setDispatchingFine(true);
    setFineError("");
    setFineReceipt(null);

    const violation = VIOLATION_TYPES[selectedViolationIdx];
    try {
      const res = await fetch(`${API_BASE_URL}/api/violation/issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plate_number: violationPlate,
          violation_type: violation.label,
          fine_amount: violation.amount,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Failed to dispatch fine notice.");
      }
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
      if (!res.ok) {
        throw new Error(data.detail || "No owner record found.");
      }
      setPoliceDossier(data);
    } catch (err) {
      setPoliceError(err.message);
    } finally {
      setSearchingPolice(false);
    }
  };

  const handleAddOwnerSubmit = async (e) => {
    e.preventDefault();
    setAddStatus("");
    try {
      const res = await fetch(`${API_BASE_URL}/api/registry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newOwner),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Could not add vehicle record.");
      }
      setAddStatus(`Added ${data.plate_number} to MongoDB RTO Registry!`);
      handleDemoChipSelect(data.plate_number);
      setNewOwner({
        plate_number: "",
        owner_name: "",
        phone_number: "",
        address: "",
        vehicle_model: "",
      });
      fetchRegistry();
    } catch (err) {
      setAddStatus(`Error: ${err.message}`);
    }
  };

  const filteredRegistry = registry.filter((item) => {
    const q = registrySearch.trim().toLowerCase();
    if (!q) return true;
    return (
      item.plate_number.toLowerCase().includes(q) ||
      item.owner_name.toLowerCase().includes(q) ||
      item.address.toLowerCase().includes(q) ||
      item.phone_number.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 font-sans">
      {/* On-Screen Pop-Up Modal When Traffic Fine Message is Sent */}
      {showFineModal && fineReceipt && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0D1322] border border-emerald-500/40 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-400">
                    E-Challan Dispatched • {fineReceipt.challan_id}
                  </span>
                  <h3 className="text-lg font-bold text-white">
                    {fineReceipt.banner_message}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFineModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Vehicle Plate:</span>
                <span className="font-mono font-bold text-amber-400">{fineReceipt.plate_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Registered Owner:</span>
                <span className="font-semibold text-white">{fineReceipt.owner_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Recipient Mobile:</span>
                <span className="font-mono text-emerald-400">{fineReceipt.phone_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Violation Recorded:</span>
                <span className="text-slate-200">{fineReceipt.violation_type}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Fine Penalty:</span>
                <span className="font-bold text-rose-400">₹{fineReceipt.fine_amount}</span>
              </div>
            </div>

            <div className="bg-emerald-950/30 border border-emerald-500/25 rounded-xl p-3.5">
              <p className="text-[11px] font-semibold text-emerald-400 mb-1">
                Dispatched SMS Gateway Payload:
              </p>
              <p className="text-xs text-slate-200 leading-relaxed">{fineReceipt.sms_preview}</p>
            </div>

            <button
              type="button"
              onClick={() => setShowFineModal(false)}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm text-white transition"
            >
              Done &amp; Return to Portal
            </button>
          </div>
        </div>
      )}

      {/* Top Navbar with Tab Switcher */}
      <header className="border-b border-slate-800/80 bg-[#0B1120]/95 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">VisionPlate DIP</h1>
              <p className="text-xs text-slate-400">
                ANPR Digital Image Processing &amp; RTO Enforcement Suite
              </p>
            </div>
          </div>

          <nav className="flex items-center bg-[#070B14] p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveTab("scanner")}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                activeTab === "scanner"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              1. DIP Plate Scanner
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab("enforcement");
                fetchRegistry();
              }}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-2 ${
                activeTab === "enforcement"
                  ? "bg-indigo-600 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              2. RTO &amp; Police Portal ({registry.length || 50})
            </button>
          </nav>

          <span className="hidden xl:inline-block text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            YOLOv8n + OpenCV + RapidOCR Engine
          </span>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* TAB 1: DIP PLATE SCANNER                                              */}
      {/* ===================================================================== */}
      {activeTab === "scanner" && (
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <section className="lg:col-span-7 bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-slate-200 font-semibold mb-1">
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <h2>Vehicle Image Input</h2>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Upload a front or rear vehicle image (JPG, PNG, WEBP) or click a preset below to inspect the 6-stage DIP pipeline.
                </p>

                <label className="block border-2 border-dashed border-slate-700/80 hover:border-indigo-500/60 transition rounded-xl p-6 text-center cursor-pointer bg-[#090E1A]">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Selected vehicle"
                      className="max-h-64 mx-auto rounded-lg object-contain shadow-md"
                    />
                  ) : (
                    <div className="py-12 space-y-2">
                      <ImageIcon className="w-10 h-10 mx-auto text-slate-500" />
                      <p className="text-sm font-medium text-slate-300">
                        Click to browse or drop vehicle image here
                      </p>
                      <p className="text-xs text-slate-500">
                        Supports high-res close-ups &amp; wide-angle CCTV frames
                      </p>
                    </div>
                  )}
                </label>

                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-400">
                      Quick Test Samples (One-Click Demo):
                    </span>
                    <span className="text-[11px] text-slate-500">No vehicle photo handy? Try these</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {SAMPLE_PRESETS.map((sample) => {
                      const isSelected = activeSample === sample.id;
                      return (
                        <button
                          key={sample.id}
                          type="button"
                          onClick={() => handleSampleClick(sample)}
                          disabled={loading}
                          className={`group text-left rounded-xl p-2 border transition bg-[#090E1A] hover:border-indigo-500/70 ${
                            isSelected
                              ? "border-indigo-500 ring-1 ring-indigo-500/40"
                              : "border-slate-800"
                          }`}
                        >
                          <div className="h-14 w-full overflow-hidden rounded-lg bg-slate-900 mb-1.5">
                            <img
                              src={sample.src}
                              alt={sample.label}
                              className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                            />
                          </div>
                          <p className="text-[11px] font-semibold text-slate-200 truncate">
                            {sample.label}
                          </p>
                          <p className="text-[10px] font-mono text-indigo-400">{sample.tag}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => runDetection(selectedFile)}
                disabled={!selectedFile || loading}
                className="mt-5 w-full py-3 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 transition shadow-lg shadow-indigo-600/20"
              >
                {loading ? "Running 6-Stage DIP & RapidOCR Pipeline..." : "Detect & Extract License Plate"}
              </button>
            </section>

            <section className="lg:col-span-5 bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between">
              <div>
                <h2 className="text-slate-200 font-semibold mb-1">Extraction Telemetry</h2>
                <p className="text-xs text-slate-400 mb-5">Real-time localization &amp; OCR readout</p>

                {error && (
                  <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-5 text-center mb-4">
                  <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">
                    Recognized License Plate
                  </p>
                  <div className="inline-block px-6 py-2.5 rounded-lg bg-amber-400 text-slate-950 font-mono font-extrabold text-2xl tracking-wider shadow">
                    {result ? result.plate_number : "— — — —"}
                  </div>

                  {result?.detected && result?.plate_number && (
                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => handleSendToEnforcement(result.plate_number)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/40 transition"
                      >
                        <span>Lookup Owner / Issue Fine in RTO Portal</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-4 mb-4">
                  <p className="text-xs text-slate-400 mb-2">Segmented &amp; Binarized ROI</p>
                  <div className="h-24 rounded-lg bg-slate-950/80 border border-slate-800/80 flex items-center justify-center overflow-hidden p-2">
                    {result?.stages?.binarized_plate ? (
                      <img
                        src={result.stages.binarized_plate}
                        alt="Binarized ROI"
                        className="max-h-full max-w-full object-contain rounded"
                      />
                    ) : (
                      <span className="text-xs text-slate-600">Awaiting plate segmentation</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                  <CheckCircle2
                    className={`w-5 h-5 ${
                      result?.detected ? "text-emerald-400" : "text-slate-600"
                    }`}
                  />
                  <div>
                    <p className="text-[11px] text-slate-400">Localization Status</p>
                    <p className="text-xs font-semibold text-slate-200">
                      {result ? (result.detected ? "Plate Localized" : "Not Detected") : "Idle"}
                    </p>
                  </div>
                </div>

                <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3.5 flex items-center gap-3">
                  <Clock className="w-5 h-5 text-indigo-400" />
                  <div>
                    <p className="text-[11px] text-slate-400">Pipeline Latency</p>
                    <p className="text-xs font-semibold text-slate-200">
                      {latencyMs ? `${latencyMs} ms` : "—"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {result?.stages && (
            <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  <div>
                    <h2 className="text-base font-semibold text-white">
                      Intermediate Digital Image Processing Stages
                    </h2>
                    <p className="text-xs text-slate-400">
                      Step-by-step computer vision feature maps generated during inference
                    </p>
                  </div>
                </div>
                <span className="text-xs text-slate-400 hidden sm:inline">
                  6-Stage OpenCV + ONNX + RapidOCR Pipeline
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {DIP_STAGES_META.map((stage) => (
                  <div
                    key={stage.key}
                    className="bg-[#090E1A] border border-slate-800 rounded-xl p-3.5 flex flex-col justify-between"
                  >
                    <div className="h-44 w-full rounded-lg bg-slate-950 overflow-hidden flex items-center justify-center mb-3 border border-slate-800/60">
                      <img
                        src={result.stages[stage.key]}
                        alt={stage.title}
                        className="max-h-full max-w-full object-contain"
                      />
                    </div>
                    <div>
                      <h3 className="text-xs font-semibold text-slate-100">{stage.title}</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">{stage.subtitle}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: RTO TRAFFIC ENFORCEMENT & POLICE INVESTIGATION PORTAL          */}
      {/* ===================================================================== */}
      {activeTab === "enforcement" && (
        <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
          {/* Quick-Select Sample Nameplates Bar for Live Professor Demo */}
          <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Database className="w-4 h-4 text-indigo-400" />
                  Demo Sample Number Plates (Click Any Plate to Auto-Fill Both Modules)
                </h2>
                <p className="text-xs text-slate-400">
                  Backed by MongoDB Atlas ({registry.length || 50} registered Indian RTO citizen records)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                <UserPlus className="w-3.5 h-3.5" />
                {showAddForm ? "Close Registration Form" : "+ Register New Citizen Plate"}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
              {QUICK_DEMO_PLATES.map((item) => {
                const isSelected = violationPlate === item.plate && policePlate === item.plate;
                return (
                  <button
                    key={item.plate}
                    type="button"
                    onClick={() => handleDemoChipSelect(item.plate)}
                    className={`text-left px-3 py-2 rounded-xl border transition bg-[#090E1A] hover:border-indigo-500/70 ${
                      isSelected
                        ? "border-amber-400/80 ring-1 ring-amber-400/40"
                        : "border-slate-800"
                    }`}
                  >
                    <p className="font-mono text-xs font-bold text-amber-400">{item.plate}</p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">{item.hint}</p>
                  </button>
                );
              })}
            </div>

            {/* Collapsible Add Citizen Record Form */}
            {showAddForm && (
              <form
                onSubmit={handleAddOwnerSubmit}
                className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
              >
                <input
                  type="text"
                  required
                  placeholder="Plate (e.g. HR51XX1111)"
                  value={newOwner.plate_number}
                  onChange={(e) => setNewOwner({ ...newOwner, plate_number: e.target.value })}
                  className="bg-[#090E1A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono uppercase"
                />
                <input
                  type="text"
                  required
                  placeholder="Owner Full Name"
                  value={newOwner.owner_name}
                  onChange={(e) => setNewOwner({ ...newOwner, owner_name: e.target.value })}
                  className="bg-[#090E1A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Phone (+91-98XXXXXXXX)"
                  value={newOwner.phone_number}
                  onChange={(e) => setNewOwner({ ...newOwner, phone_number: e.target.value })}
                  className="bg-[#090E1A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
                <input
                  type="text"
                  required
                  placeholder="Residential Address"
                  value={newOwner.address}
                  onChange={(e) => setNewOwner({ ...newOwner, address: e.target.value })}
                  className="bg-[#090E1A] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-lg px-4 py-2 transition"
                >
                  Save to MongoDB
                </button>
                {addStatus && (
                  <p className="sm:col-span-2 lg:col-span-5 text-xs text-emerald-400">{addStatus}</p>
                )}
              </form>
            )}
          </section>

          {/* Two-Column Enforcement Modules */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* APPLICATION 1: Traffic Violation Fine Dispatcher */}
            <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between space-y-5">
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="p-2 rounded-lg bg-rose-500/15 text-rose-400 border border-rose-500/30">
                    <FileWarning className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      1. Traffic Violation E-Challan Dispatcher
                    </h2>
                    <p className="text-xs text-slate-400">
                      Issue an automated fine SMS alert to the registered vehicle owner
                    </p>
                  </div>
                </div>

                <form onSubmit={handleIssueFine} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Offending Vehicle Number Plate
                    </label>
                    <input
                      type="text"
                      required
                      value={violationPlate}
                      onChange={(e) => setViolationPlate(e.target.value.toUpperCase())}
                      placeholder="e.g. HR26BR9044"
                      className="w-full bg-[#090E1A] border border-slate-700 focus:border-indigo-500 outline-none rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-amber-400 uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Traffic Violation Category &amp; Penalty
                    </label>
                    <select
                      value={selectedViolationIdx}
                      onChange={(e) => setSelectedViolationIdx(Number(e.target.value))}
                      className="w-full bg-[#090E1A] border border-slate-700 focus:border-indigo-500 outline-none rounded-xl px-3.5 py-2.5 text-xs text-slate-200"
                    >
                      {VIOLATION_TYPES.map((v, idx) => (
                        <option key={v.label} value={idx}>
                          {v.label} — ₹{v.amount}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={dispatchingFine}
                    className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 font-semibold text-sm text-white flex items-center justify-center gap-2 transition shadow-lg shadow-rose-600/20"
                  >
                    <Send className="w-4 h-4" />
                    {dispatchingFine ? "Dispatching E-Challan..." : "Issue Fine & Send SMS Alert"}
                  </button>
                </form>

                {fineError && (
                  <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{fineError}</span>
                  </div>
                )}

                {fineReceipt && (
                  <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        {fineReceipt.banner_message}
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowFineModal(true)}
                        className="text-[11px] underline text-emerald-300"
                      >
                        View Pop-Up
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Sent to <span className="font-mono text-white">{fineReceipt.phone_number}</span> • Challan{" "}
                      <span className="font-mono text-amber-300">{fineReceipt.challan_id}</span> (₹{fineReceipt.fine_amount})
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* APPLICATION 2: Police Civil & Criminal Investigation Lookup */}
            <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between space-y-5">
              <div>
                <div className="flex items-center gap-2.5 mb-1">
                  <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                    <ShieldAlert className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">
                      2. Police Civil &amp; Criminal Investigation Lookup
                    </h2>
                    <p className="text-xs text-slate-400">
                      Retrieve verified owner identity, address, and prior violation dossier
                    </p>
                  </div>
                </div>

                <form onSubmit={handlePoliceLookup} className="mt-5 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Suspect / Target Vehicle Plate Number
                    </label>
                    <input
                      type="text"
                      required
                      value={policePlate}
                      onChange={(e) => setPolicePlate(e.target.value.toUpperCase())}
                      placeholder="e.g. HR26BR9044"
                      className="w-full bg-[#090E1A] border border-slate-700 focus:border-indigo-500 outline-none rounded-xl px-4 py-2.5 text-sm font-mono font-bold text-amber-400 uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Investigation Purpose / Case Classification
                    </label>
                    <select
                      value={casePurpose}
                      onChange={(e) => setCasePurpose(e.target.value)}
                      className="w-full bg-[#090E1A] border border-slate-700 focus:border-indigo-500 outline-none rounded-xl px-3.5 py-2.5 text-xs text-slate-200"
                    >
                      {INVESTIGATION_PURPOSES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={searchingPolice}
                    className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 font-semibold text-sm text-white flex items-center justify-center gap-2 transition shadow-lg shadow-indigo-600/20"
                  >
                    <Search className="w-4 h-4" />
                    {searchingPolice ? "Querying RTO Intelligence DB..." : "Fetch Owner Investigation Dossier"}
                  </button>
                </form>

                {policeError && (
                  <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{policeError}</span>
                  </div>
                )}

                {policeDossier && (
                  <div className="mt-4 bg-[#090E1A] border border-indigo-500/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                        Verified RTO Citizen Dossier
                      </span>
                      <span className="font-mono text-xs font-bold px-2.5 py-0.5 rounded bg-amber-400 text-slate-950">
                        {policeDossier.owner.plate_number}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                      <div className="flex items-start gap-2">
                        <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-slate-500">Registered Owner</p>
                          <p className="font-semibold text-white">{policeDossier.owner.owner_name}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-slate-500">Contact Number</p>
                          <p className="font-mono text-emerald-400">{policeDossier.owner.phone_number}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 sm:col-span-2">
                        <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-slate-500">Permanent Residential Address</p>
                          <p className="text-slate-200">{policeDossier.owner.address}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 sm:col-span-2">
                        <Car className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] text-slate-500">Registered Vehicle Model</p>
                          <p className="text-slate-300">{policeDossier.owner.vehicle_model}</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800">
                      <p className="text-[11px] font-semibold text-slate-300 mb-1.5">
                        Prior E-Challan / Violation History ({policeDossier.violation_history.length})
                      </p>
                      {policeDossier.violation_history.length === 0 ? (
                        <p className="text-[11px] text-emerald-400">
                          Clean record — No prior traffic challans logged.
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                          {policeDossier.violation_history.map((c) => (
                            <div
                              key={c.challan_id}
                              className="text-[11px] bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 flex items-center justify-between"
                            >
                              <span className="text-slate-200">{c.violation_type}</span>
                              <span className="font-mono text-rose-400">
                                ₹{c.fine_amount} ({c.challan_id})
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Searchable 50-Row MongoDB Citizen Registry Table */}
          <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-base font-bold text-white">
                  RTO Citizen &amp; Vehicle Database ({filteredRegistry.length} of {registry.length} Records)
                </h2>
                <p className="text-xs text-slate-400">
                  Click any row to load that vehicle plate into the Enforcement &amp; Police modules
                </p>
              </div>
              <input
                type="text"
                value={registrySearch}
                onChange={(e) => setRegistrySearch(e.target.value)}
                placeholder="Search plate, owner name, city, or phone..."
                className="bg-[#090E1A] border border-slate-700 focus:border-indigo-500 outline-none rounded-xl px-3.5 py-2 text-xs text-white w-full sm:w-72"
              />
            </div>

            <div className="overflow-x-auto max-h-80 rounded-xl border border-slate-800">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-[#090E1A] text-slate-400 sticky top-0">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Plate Number</th>
                    <th className="py-2.5 px-4 font-semibold">Owner Name</th>
                    <th className="py-2.5 px-4 font-semibold">Phone Number</th>
                    <th className="py-2.5 px-4 font-semibold">Residential Address</th>
                    <th className="py-2.5 px-4 font-semibold">Vehicle Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {registryLoading ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-slate-500">
                        Loading MongoDB records...
                      </td>
                    </tr>
                  ) : (
                    filteredRegistry.map((row) => (
                      <tr
                        key={row.plate_number}
                        onClick={() => handleDemoChipSelect(row.plate_number)}
                        className="hover:bg-indigo-600/10 cursor-pointer transition"
                      >
                        <td className="py-2.5 px-4 font-mono font-bold text-amber-400">
                          {row.plate_number}
                        </td>
                        <td className="py-2.5 px-4 font-medium text-white">{row.owner_name}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-300">{row.phone_number}</td>
                        <td className="py-2.5 px-4 text-slate-400">{row.address}</td>
                        <td className="py-2.5 px-4 text-slate-300">{row.vehicle_model}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}
    </div>
  );
}