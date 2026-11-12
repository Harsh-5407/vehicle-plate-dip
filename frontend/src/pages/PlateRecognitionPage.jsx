import React, { useState } from "react";
import {
  Upload,
  AlertCircle,
  Clock,
  Layers,
  Image as ImageIcon,
  Copy,
  Check,
  Maximize2,
  Download,
  RotateCcw,
  Eye,
  EyeOff,
  Info,
  Compass,
  FileText,
  ArrowRight,
} from "lucide-react";
import { API_BASE_URL, SAMPLE_PRESETS, DIP_STAGES_META } from "../constants/dipData";
import BeforeAfterSlider from "../components/BeforeAfterSlider";
import ImageInspectorModal from "../components/ImageInspectorModal";
import { exportProcessingReportPDF } from "../utils/pdfReport";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export default function PlateRecognitionPage({ onRunRecorded, onSendToAppliedDemo }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileMeta, setFileMeta] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [activeSample, setActiveSample] = useState(null);

  const [result, setResult] = useState(null);
  const [roundTripMs, setRoundTripMs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Multi-plate detection index & visualization toggles
  const [selectedDetIdx, setSelectedDetIdx] = useState(0);
  const [selectedStageKey, setSelectedStageKey] = useState("localized");
  const [showOverlay, setShowOverlay] = useState(true);
  const [copied, setCopied] = useState(false);
  const [inspector, setInspector] = useState(null);

  // Separate Human Ground-Truth / Correction (never overwrites OCR output)
  const [manualGroundTruth, setManualGroundTruth] = useState("");

  const extractImageMetadata = (file, objectUrl) => {
    const img = new Image();
    img.onload = () => {
      setFileMeta({
        name: file.name,
        type: file.type || "image/jpeg",
        sizeKB: (file.size / 1024).toFixed(1),
        dimensions: `${img.naturalWidth} × ${img.naturalHeight} px`,
      });
    };
    img.src = objectUrl;
  };

  const validateAndLoadFile = (file, preset = null) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Unsupported file format. Please upload a JPG, PNG, or WEBP image.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File exceeds the 10 MB upload limit. Please select a smaller image.");
      return;
    }

    const url = preset ? preset.src : URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(url);
    setResult(null);
    setSelectedDetIdx(0);
    setError("");
    setManualGroundTruth(preset?.groundTruth || "");
    extractImageMetadata(file, url);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    setActiveSample(null);
    validateAndLoadFile(file);
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    setActiveSample(null);
    validateAndLoadFile(file);
  };

  const handleReset = () => {
    setSelectedFile(null);
    setFileMeta(null);
    setPreviewUrl(null);
    setActiveSample(null);
    setResult(null);
    setSelectedDetIdx(0);
    setRoundTripMs(null);
    setError("");
    setManualGroundTruth("");
  };

  const runDetection = async (fileToProcess = selectedFile, presetMeta = null) => {
    if (!fileToProcess) return;
    setLoading(true);
    setError("");
    setResult(null);
    setSelectedDetIdx(0);

    const formData = new FormData();
    formData.append("file", fileToProcess);

    const t0 = performance.now();
    try {
      const response = await fetch(`${API_BASE_URL}/api/detect-plate`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        let detail = `Backend returned HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.detail) detail = errJson.detail;
        } catch {
          // keep HTTP status fallback
        }
        throw new Error(detail);
      }

      const data = await response.json();
      const totalNetworkMs = Number((performance.now() - t0).toFixed(2));
      setRoundTripMs(totalNetworkMs);
      setResult(data);
      setSelectedStageKey(data.detected ? "localized" : "morph_mask");

      if (onRunRecorded) {
        onRunRecorded({
          id: `${Date.now()}`,
          timestamp: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          }),
          filename: fileToProcess.name,
          plateNumber: data.plate_number,
          detected: data.detected,
          computeMs: data.pipeline_compute_ms ?? data.processing_time_ms ?? totalNetworkMs,
          thumbnail: data.stages?.localized || data.stages?.original,
          groundTruth: presetMeta?.groundTruth || manualGroundTruth || "",
        });
      }
    } catch (err) {
      setError(
        err.message === "Failed to fetch"
          ? "Could not reach backend API (Render instance may be cold-starting—wait 15 seconds and retry)."
          : err.message
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSampleClick = async (sample) => {
    try {
      setActiveSample(sample.id);
      const response = await fetch(sample.src);
      const blob = await response.blob();
      const file = new File([blob], `${sample.id}.jpg`, { type: "image/jpeg" });
      validateAndLoadFile(file, sample);
      await runDetection(file, sample);
    } catch {
      setError("Failed to load built-in sample image.");
    }
  };

  // Resolve currently inspected detection (supports single & multi-plate frames)
  const activeDetection = result?.detections?.[selectedDetIdx] || null;
  const activePlateText = activeDetection?.plate_number || result?.plate_number || "— — — —";
  const activeRawOcr = activeDetection?.raw_ocr_text || result?.raw_ocr_text || "";
  const activeDetConf = activeDetection?.detection_confidence ?? result?.detection_confidence;
  const activeOcrConf = activeDetection?.ocr_confidence ?? result?.ocr_confidence;
  const activeGeom = activeDetection?.geometry || result?.geometry;
  const activeBinarizedCrop =
    activeDetection?.binarized_crop_base64 || result?.stages?.binarized_plate;

  const handleCopyPlate = () => {
    if (!result?.plate_number) return;
    navigator.clipboard.writeText(activePlateText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const downloadBase64 = (dataUrl, filename) => {
    if (!dataUrl) return;
    const link = document.createElement("a");
    link.href = dataUrl;
    link.download = filename;
    link.click();
  };

  const activeStageMeta =
    DIP_STAGES_META.find((s) => s.key === selectedStageKey) || DIP_STAGES_META[0];

  // Ground truth character comparison
  const cleanPred = activePlateText.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const cleanGT = manualGroundTruth.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  let matchingChars = 0;
  let charAccuracy = "0.0";
  if (cleanGT && result?.detected) {
    const maxLen = Math.max(cleanGT.length, cleanPred.length);
    for (let i = 0; i < Math.min(cleanGT.length, cleanPred.length); i++) {
      if (cleanGT[i] === cleanPred[i]) matchingChars++;
    }
    charAccuracy = maxLen > 0 ? ((matchingChars / maxLen) * 100).toFixed(1) : "0.0";
  }

  return (
    <div className="space-y-6">
      <ImageInspectorModal
        imageSrc={inspector?.src}
        title={inspector?.title}
        subtitle={inspector?.subtitle}
        onClose={() => setInspector(null)}
      />

      {/* Top Row: Upload Workspace + Recognition Result Card */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upload Workspace */}
        <section className="lg:col-span-7 bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Upload className="w-4 h-4 text-cyan-400" />
                Vehicle Image Acquisition Workspace
              </h2>
              {selectedFile && (
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-400 hover:text-rose-400 flex items-center gap-1 transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Clear &amp; Reset
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Drag &amp; drop or browse a front/rear vehicle photo (JPG, PNG, WEBP • Max 10 MB)
            </p>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-700/80 hover:border-cyan-500/60 transition rounded-xl p-5 text-center bg-[#090E1A]"
            >
              {previewUrl ? (
                <div className="space-y-3">
                  <div className="relative inline-block">
                    <img
                      src={
                        result?.stages && showOverlay
                          ? result.stages.localized
                          : result?.stages?.original || previewUrl
                      }
                      alt="Vehicle preview"
                      className="max-h-64 mx-auto rounded-lg object-contain shadow-md"
                    />
                    {result?.detected && (
                      <button
                        type="button"
                        onClick={() => setShowOverlay(!showOverlay)}
                        className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg bg-slate-950/90 border border-slate-700 text-[11px] font-medium text-cyan-300 flex items-center gap-1.5 hover:border-cyan-500"
                      >
                        {showOverlay ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                        {showOverlay ? "Hide Box Overlay" : "Show Box Overlay"}
                      </button>
                    )}
                  </div>

                  {fileMeta && (
                    <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400">
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 font-mono">
                        {fileMeta.name}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {fileMeta.dimensions}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        {fileMeta.sizeKB} KB
                      </span>
                      <label className="px-2.5 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 cursor-pointer hover:bg-cyan-500/20">
                        Replace Image
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={handleFileInput}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              ) : (
                <label className="block py-10 cursor-pointer space-y-2">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                  <ImageIcon className="w-10 h-10 mx-auto text-slate-500" />
                  <p className="text-sm font-medium text-slate-200">
                    Drop vehicle image here or{" "}
                    <span className="text-cyan-400 underline">browse files</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    Supports high-resolution HSRP plates, commercial yellow plates &amp; CCTV frames
                  </p>
                </label>
              )}
            </div>

            {/* Labelled Demonstration Samples */}
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-slate-300">
                  Demonstration Sample Set (Labelled Test Inputs):
                </span>
                <span className="text-[11px] text-slate-500">Click to load &amp; execute</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SAMPLE_PRESETS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => handleSampleClick(sample)}
                    disabled={loading}
                    className={`group text-left rounded-xl p-2.5 border transition bg-[#090E1A] hover:border-cyan-500/60 ${
                      activeSample === sample.id
                        ? "border-cyan-500 ring-1 ring-cyan-500/40"
                        : "border-slate-800"
                    }`}
                  >
                    <div className="h-14 w-full overflow-hidden rounded-lg bg-slate-900 mb-2">
                      <img
                        src={sample.src}
                        alt={sample.label}
                        className="w-full h-full object-cover group-hover:scale-105 transition duration-200"
                      />
                    </div>
                    <p className="text-xs font-semibold text-slate-200 truncate">{sample.label}</p>
                    <p className="text-[10px] text-slate-400">{sample.condition}</p>
                    <p className="text-[10px] font-mono text-cyan-400 mt-0.5">
                      Sample GT: {sample.groundTruth}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => runDetection(selectedFile)}
            disabled={!selectedFile || loading}
            className="w-full py-3 rounded-xl font-semibold text-sm bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 disabled:text-slate-500 text-white transition shadow-lg shadow-cyan-600/20"
          >
            {loading
              ? "Executing 6-Stage DIP & RapidOCR Pipeline..."
              : "Execute 6-Stage ANPR Pipeline"}
          </button>
        </section>

        {/* Recognition Result & Geometry Telemetry Card */}
        <section className="lg:col-span-5 bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-bold text-white">Recognition &amp; Telemetry Readout</h2>
              <p className="text-xs text-slate-400">
                Measured model outputs, bounding-box geometry, and execution timing
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Failure Analysis Diagnostic Banner */}
            {result?.failure_analysis && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{result.failure_analysis.summary}</span>
                </p>
                <ul className="list-disc list-inside text-[11px] text-amber-200/90 space-y-0.5">
                  {result.failure_analysis.indicators.map((ind, idx) => (
                    <li key={idx}>{ind}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Extracted Plate Number Box + Multi-Plate Switcher + PDF Export */}
            <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-4 text-center">
              <p className="text-[11px] uppercase tracking-widest text-slate-400 mb-2">
                Recognized Registration String
              </p>
              <div className="flex items-center justify-center gap-2">
                <div className="px-5 py-2 rounded-lg bg-amber-400 text-slate-950 font-mono font-extrabold text-2xl tracking-wider shadow">
                  {activePlateText}
                </div>
                {result?.plate_number && (
                  <button
                    type="button"
                    onClick={handleCopyPlate}
                    title="Copy plate text"
                    className="p-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300"
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>

              {activeRawOcr && activeRawOcr !== activePlateText && (
                <p className="text-[11px] text-slate-400 mt-2">
                  Raw OCR Output: <span className="font-mono text-slate-200">{activeRawOcr}</span>{" "}
                  <span className="text-cyan-400">(RTO Positional Syntax Refined)</span>
                </p>
              )}

              {/* Multi-Plate Selector Pills */}
              {result?.detections?.length > 1 && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                  <span className="text-[11px] text-slate-400 mr-1">
                    {result.detections.length} Plates Detected:
                  </span>
                  {result.detections.map((d, i) => (
                    <button
                      key={d.index}
                      type="button"
                      onClick={() => setSelectedDetIdx(i)}
                      className={`px-2.5 py-1 rounded-lg font-mono text-xs font-bold border transition ${
                        selectedDetIdx === i
                          ? "bg-cyan-500/20 border-cyan-400 text-cyan-300"
                          : "bg-slate-900 border-slate-700 text-slate-400"
                      }`}
                    >
                      #{d.index} {d.plate_number}
                    </button>
                  ))}
                </div>
              )}

              {/* Export PDF Lab Report & Applied Demo Actions */}
              {result?.detected && (
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      exportProcessingReportPDF({
                        result,
                        filename: fileMeta?.name || "sample_plate.jpg",
                        groundTruth: manualGroundTruth,
                        selectedDetection: activeDetection,
                      })
                    }
                    className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Export PDF Lab Report
                  </button>

                  {onSendToAppliedDemo && (
                    <button
                      type="button"
                      onClick={() => onSendToAppliedDemo(activePlateText)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium flex items-center gap-1 transition"
                    >
                      <span>Test in Applied RTO Demo</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Segmented ROI Crop + Download/Zoom */}
            <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3.5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-300">
                  Segmented &amp; Binarized Plate ROI
                </span>
                {activeBinarizedCrop && (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setInspector({
                          src: activeBinarizedCrop,
                          title: "Segmented & Binarized ROI",
                          subtitle: `Extracted Plate: ${activePlateText}`,
                        })
                      }
                      className="text-[11px] px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 flex items-center gap-1"
                    >
                      <Maximize2 className="w-3 h-3" />
                      Zoom
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        downloadBase64(activeBinarizedCrop, `${activePlateText || "plate"}-roi.jpg`)
                      }
                      className="text-[11px] px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      Save ROI
                    </button>
                  </div>
                )}
              </div>
              <div className="h-20 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-center overflow-hidden p-2">
                {activeBinarizedCrop ? (
                  <img
                    src={activeBinarizedCrop}
                    alt="Binarized ROI"
                    className="max-h-full max-w-full object-contain rounded"
                  />
                ) : (
                  <span className="text-xs text-slate-600">Awaiting plate segmentation</span>
                )}
              </div>
            </div>

            {/* Honest Confidence & Geometry Readouts */}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-400">Detector Confidence (YOLOv8n)</p>
                <p className="font-mono font-semibold text-white mt-0.5">
                  {activeDetConf != null
                    ? `${(activeDetConf * 100).toFixed(1)}%`
                    : "Not exposed / N/A"}
                </p>
              </div>
              <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-400">OCR String Confidence (RapidOCR)</p>
                <p className="font-mono font-semibold text-white mt-0.5">
                  {activeOcrConf != null
                    ? `${(activeOcrConf * 100).toFixed(1)}%`
                    : "Not exposed / N/A"}
                </p>
              </div>
              <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  Backend Compute / Total
                </p>
                <p className="font-mono font-semibold text-slate-200 mt-0.5">
                  {result?.pipeline_compute_ms ? `${result.pipeline_compute_ms} ms` : "—"}{" "}
                  <span className="text-[10px] text-slate-500">
                    {roundTripMs ? `(${roundTripMs} ms RTT)` : ""}
                  </span>
                </p>
              </div>
              <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3">
                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Compass className="w-3 h-3 text-emerald-400" />
                  Plate Geometry &amp; Deskew
                </p>
                <p className="font-mono font-semibold text-slate-200 mt-0.5">
                  {activeGeom
                    ? `${activeGeom.width}×${activeGeom.height}px (${activeGeom.aspect_ratio}:1) • ${activeGeom.deskew_angle_deg}°`
                    : "—"}
                </p>
              </div>
            </div>

            {/* Separate Ground-Truth Verification Input (Never Overwrites OCR Output) */}
            <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-semibold text-slate-300">
                  Optional Ground-Truth Comparison (Evaluator Input)
                </label>
                {cleanGT && result?.detected && (
                  <span
                    className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
                      cleanGT === cleanPred
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-amber-500/15 text-amber-300"
                    }`}
                  >
                    {matchingChars}/{Math.max(cleanGT.length, cleanPred.length)} chars ({charAccuracy}%)
                  </span>
                )}
              </div>
              <input
                type="text"
                value={manualGroundTruth}
                onChange={(e) => setManualGroundTruth(e.target.value.toUpperCase())}
                placeholder="Enter actual plate string (e.g. RJ14CV0002) to measure accuracy..."
                className="w-full bg-slate-950 border border-slate-800 focus:border-cyan-500 outline-none rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 uppercase"
              />
            </div>
          </div>

          <p className="text-[11px] text-slate-500 border-t border-slate-800/80 pt-3">
            Academic Demonstration Notice: Automated OCR predictions may contain character
            substitutions under motion blur or low light and must be verified manually before
            operational use.
          </p>
        </section>
      </div>

      {/* Interactive 6-Stage Pipeline Stepper */}
      {result?.stages && (
        <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                Interactive Six-Stage DIP Pipeline Inspector
              </h2>
              <p className="text-xs text-slate-400">
                Click any completed stage step below to inspect its output matrix, runtime, and
                mathematical role
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                downloadBase64(
                  result.stages.localized,
                  `${activePlateText || "detected"}-localized.jpg`
                )
              }
              className="px-3.5 py-2 rounded-xl bg-[#090E1A] hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download Localized Frame
            </button>
          </div>

          {/* Stepper Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {DIP_STAGES_META.map((stage) => {
              const isSelected = selectedStageKey === stage.key;
              const stageFailed = stage.key === "binarized_plate" && !result.detected;
              const timeMs = result.stage_timings_ms?.[stage.key];

              return (
                <button
                  key={stage.key}
                  type="button"
                  onClick={() => setSelectedStageKey(stage.key)}
                  className={`text-left p-3 rounded-xl border transition ${
                    isSelected
                      ? "bg-cyan-500/10 border-cyan-400 ring-1 ring-cyan-400/40"
                      : "bg-[#090E1A] border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        stageFailed
                          ? "bg-amber-500/20 text-amber-300"
                          : "bg-emerald-500/15 text-emerald-400"
                      }`}
                    >
                      {stageFailed ? "NO ROI" : "DONE"}
                    </span>
                    {timeMs != null && (
                      <span className="text-[10px] font-mono text-slate-400">{timeMs} ms</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-slate-100 truncate">{stage.shortTitle}</p>
                </button>
              );
            })}
          </div>

          {/* Focused Active Stage Viewer + Educational Explanation */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 bg-[#090E1A] border border-slate-800 rounded-xl p-4">
            <div className="lg:col-span-7 relative bg-slate-950 rounded-lg border border-slate-800/80 h-72 sm:h-80 flex items-center justify-center overflow-hidden">
              <img
                src={result.stages[activeStageMeta.key]}
                alt={activeStageMeta.title}
                className="max-h-full max-w-full object-contain"
              />
              <button
                type="button"
                onClick={() =>
                  setInspector({
                    src: result.stages[activeStageMeta.key],
                    title: activeStageMeta.title,
                    subtitle: activeStageMeta.technique,
                  })
                }
                className="absolute bottom-3 right-3 px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-medium text-white flex items-center gap-1.5"
              >
                <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
                Full-Screen Zoom
              </button>
            </div>

            <div className="lg:col-span-5 flex flex-col justify-between space-y-3 text-xs">
              <div className="space-y-3">
                <div>
                  <span className="text-[11px] font-mono text-cyan-400">
                    Stage {activeStageMeta.stepNumber} of 6 •{" "}
                    {result.stage_timings_ms?.[activeStageMeta.key] ?? "—"} ms
                  </span>
                  <h3 className="text-base font-bold text-white mt-0.5">{activeStageMeta.title}</h3>
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    {activeStageMeta.technique}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-[#0D1322] border border-slate-800 space-y-2">
                  <div>
                    <p className="font-semibold text-cyan-300">What it does:</p>
                    <p className="text-slate-300 mt-0.5 leading-relaxed">
                      {activeStageMeta.whatItDoes}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-emerald-300">Why it is used:</p>
                    <p className="text-slate-300 mt-0.5 leading-relaxed">
                      {activeStageMeta.whyUsed}
                    </p>
                  </div>
                  <div>
                    <p className="font-semibold text-amber-300">What changes in the output:</p>
                    <p className="text-slate-300 mt-0.5 leading-relaxed">
                      {activeStageMeta.whatChanges}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
                <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <span>{activeStageMeta.tooltip}</span>
              </div>
            </div>
          </div>

          {/* All 6 Thumbnails Strip for Quick Side-by-Side Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
            {DIP_STAGES_META.map((stage) => (
              <button
                key={stage.key}
                type="button"
                onClick={() => setSelectedStageKey(stage.key)}
                className={`text-left bg-[#090E1A] rounded-xl p-2 border transition ${
                  selectedStageKey === stage.key
                    ? "border-cyan-400"
                    : "border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="h-24 bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center mb-1.5">
                  <img
                    src={result.stages[stage.key]}
                    alt={stage.shortTitle}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
                <p className="text-[11px] font-semibold text-slate-200 truncate">
                  {stage.shortTitle}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Draggable Before & After Stage Comparison */}
      {result?.stages && <BeforeAfterSlider stages={result.stages} />}
    </div>
  );
}