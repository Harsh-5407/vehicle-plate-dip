import React, { useState } from "react";
import { Upload, Cpu, CheckCircle2, AlertCircle, Clock, Layers, Image as ImageIcon } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

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
    subtitle: "Deskewed, border-cleaned crop fed to Tesseract OCR",
  },
];

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [latencyMs, setLatencyMs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeSample, setActiveSample] = useState(null);

  const runDetection = async (fileToProcess) => {
    if (!fileToProcess) return;
    setLoading(true);
    setError("");
    setResult(null);

    const formData = new FormData();
    formData.append("file", fileToProcess);

    const t0 = performance.now();
    try {
      const response = await fetch(`${API_BASE_URL}/detect`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(`Server responded with ${response.status}`);
      }
      const data = await response.json();
      setLatencyMs((performance.now() - t0).toFixed(2));
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

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-[#0B1120]/90 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">VisionPlate DIP</h1>
              <p className="text-xs text-slate-400">
                Automated License Plate Detection &amp; Character Extraction
              </p>
            </div>
          </div>
          <span className="text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            ONNX + OpenCV + Tesseract Engine
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Top Two-Column Workspace */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel: Upload Dropzone & Sample Presets */}
          <section className="lg:col-span-7 bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2 text-slate-200 font-semibold mb-1">
                <Upload className="w-4 h-4 text-indigo-400" />
                <h2>Vehicle Image Input</h2>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                Upload a front or rear vehicle image (JPG, PNG, WEBP) or click a preset below to inspect the 6-stage DIP pipeline.
              </p>

              {/* Dropzone */}
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
                    <p className="text-xs text-slate-500">Supports high-res close-ups &amp; wide-angle CCTV frames</p>
                  </div>
                )}
              </label>

              {/* Clickable Sample Images Row */}
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
              {loading ? "Running 6-Stage DIP & ONNX Pipeline..." : "Detect & Extract License Plate"}
            </button>
          </section>

          {/* Right Panel: Extraction Telemetry */}
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

              {/* Recognized Plate Banner */}
              <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-5 text-center mb-4">
                <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">
                  Recognized License Plate
                </p>
                <div className="inline-block px-6 py-2.5 rounded-lg bg-amber-400 text-slate-950 font-mono font-extrabold text-2xl tracking-wider shadow">
                  {result ? result.plate_number : "— — — —"}
                </div>
              </div>

              {/* Segmented & Binarized ROI Preview */}
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

            {/* Status & Latency Footer */}
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

        {/* Bottom Section: 6-Stage Intermediate DIP Pipeline Visual Gallery */}
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
                6-Stage OpenCV + ONNX Pipeline
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
    </div>
  );
}