import { useState } from "react";
import { Upload, Cpu, CheckCircle2, AlertCircle, Image as ImageIcon, Layers, Clock } from "lucide-react";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const STAGE_META = [
  { key: "original", title: "1. Input Acquisition", desc: "Resized RGB source frame" },
  { key: "enhanced_gray", title: "2. Bilateral + CLAHE", desc: "Edge-preserving denoising & contrast boost" },
  { key: "canny_edges", title: "3. Canny Edge Map", desc: "High-gradient boundary extraction" },
  { key: "morph_mask", title: "4. Morphological Closing", desc: "Rectangular kernel (17×5) character fusion" },
  { key: "localized", title: "5. Contour Localization", desc: "Aspect-ratio filtered bounding box" },
  { key: "binarized_plate", title: "6. Otsu Binarization", desc: "Thresholded ROI fed to Tesseract OCR" },
];

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError("");
  };

  const handleAnalyze = async () => {
    if (!selectedFile) return;
    setLoading(true);
    setError("");

    const formData = new FormData();
    formData.append("file", selectedFile);

    try {
      const response = await fetch(`${API_BASE_URL}/api/detect-plate`, {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || "Failed to process image.");
      }
      setResult(data);
    } catch (err) {
      setError(err.message || "Could not connect to the DIP backend server.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-600 rounded-lg">
              <Cpu className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">VisionPlate DIP</h1>
              <p className="text-xs text-slate-400">Automated License Plate Detection & Character Extraction</p>
            </div>
          </div>
          <span className="text-xs font-medium px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            OpenCV + Tesseract Engine
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Top Section: Upload & Extracted Result */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Upload Card */}
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold mb-1 flex items-center gap-2">
                <Upload className="w-4 h-4 text-indigo-400" /> Vehicle Image Input
              </h2>
              <p className="text-xs text-slate-400 mb-4">
                Upload a front or rear vehicle image (JPG, PNG, WEBP) to inspect the 6-stage DIP pipeline.
              </p>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl p-6 cursor-pointer transition bg-slate-950/50">
                {previewUrl ? (
                  <img src={previewUrl} alt="Preview" className="max-h-64 rounded-lg object-contain" />
                ) : (
                  <div className="text-center py-6">
                    <ImageIcon className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-300">Click to select a vehicle image</p>
                    <p className="text-xs text-slate-500 mt-1">Supports standard high-res or low-light plates</p>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </label>
            </div>

            <button
              onClick={handleAnalyze}
              disabled={!selectedFile || loading}
              className="mt-5 w-full py-3 px-4 rounded-xl font-semibold text-sm bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 transition cursor-pointer"
            >
              {loading ? "Running DIP Pipeline..." : "Detect & Extract License Plate"}
            </button>
          </div>

          {/* Recognition Output Card */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-6 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold mb-1">Extraction Telemetry</h2>
              <p className="text-xs text-slate-400 mb-6">Real-time localization & OCR readout</p>

              {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {!result && !error && (
                <div className="h-48 rounded-xl border border-slate-800 bg-slate-950/40 flex items-center justify-center text-sm text-slate-500">
                  Awaiting image analysis...
                </div>
              )}

              {result && (
                <div className="space-y-5">
                  {/* License Plate Badge */}
                  <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                    <span className="text-[11px] uppercase tracking-widest text-slate-400 block mb-2">
                      Recognized License Plate
                    </span>
                    <div className="inline-block px-6 py-2.5 rounded-lg bg-amber-400 text-slate-950 font-mono font-extrabold text-2xl tracking-widest border-2 border-slate-900 shadow-md">
                      {result.plate_number}
                    </div>
                  </div>

                  {/* Cropped Binarized Plate */}
                  {result.detected && (
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                      <span className="text-xs text-slate-400 block mb-2">Segmented & Binarized ROI</span>
                      <img
                        src={result.stages.binarized_plate}
                        alt="Binarized Plate"
                        className="h-14 mx-auto rounded border border-slate-700 object-contain bg-white"
                      />
                    </div>
                  )}

                  {/* Metrics */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2.5">
                      <CheckCircle2 className={`w-4 h-4 ${result.detected ? "text-emerald-400" : "text-amber-400"}`} />
                      <div>
                        <p className="text-slate-400">Contour Status</p>
                        <p className="font-semibold text-slate-200">
                          {result.detected ? "Plate Localized" : "Not Found"}
                        </p>
                      </div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center gap-2.5">
                      <Clock className="w-4 h-4 text-indigo-400" />
                      <div>
                        <p className="text-slate-400">Pipeline Latency</p>
                        <p className="font-semibold text-slate-200">{result.processing_time_ms} ms</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bottom Section: 6-Stage DIP Pipeline Inspector */}
        {result && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <h2 className="text-lg font-bold">Intermediate Digital Image Processing Stages</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {STAGE_META.map((stage) => (
                <div
                  key={stage.key}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col"
                >
                  <div className="bg-slate-950 h-48 flex items-center justify-center p-2">
                    <img
                      src={result.stages[stage.key]}
                      alt={stage.title}
                      className="max-h-full max-w-full object-contain rounded"
                    />
                  </div>
                  <div className="p-4 border-t border-slate-800">
                    <h3 className="text-sm font-semibold text-slate-100">{stage.title}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{stage.desc}</p>
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