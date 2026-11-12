import React, { useState, useEffect } from "react";
import {
  FlaskConical,
  Sliders,
  Contrast,
  ScanLine,
  BarChart2,
  RotateCcw,
  Upload,
  AlertTriangle,
  CheckCircle2,
  Maximize2,
  Info,
} from "lucide-react";
import { API_BASE_URL, SAMPLE_PRESETS } from "../constants/dipData";
import ImageInspectorModal from "../components/ImageInspectorModal";

const DEFAULT_PARAMS = {
  clahe_clip: 2.0,
  clahe_grid: 8,
  bilateral_d: 5,
  bilateral_sigma: 15,
  binary_thresh: 127,
  morph_w: 19,
  morph_h: 5,
};

function HistogramChart({ seriesA, labelA, colorA, seriesB = null, labelB = "", colorB = "", title }) {
  if (!seriesA || seriesA.length !== 256) return null;

  const maxA = Math.max(...seriesA, 1);
  const maxB = seriesB ? Math.max(...seriesB, 1) : 1;
  const maxVal = Math.max(maxA, maxB, 1);

  const toPoints = (arr) =>
    arr
      .map((v, idx) => {
        const x = (idx / 255) * 100;
        const y = 100 - (v / maxVal) * 95;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

  return (
    <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-bold text-white">{title}</h4>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: colorA }} />
            {labelA}
          </span>
          {seriesB && (
            <span className="flex items-center gap-1.5 text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: colorB }} />
              {labelB}
            </span>
          )}
        </div>
      </div>

      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-40 bg-slate-950 rounded-lg border border-slate-800/80">
        <polyline
          fill="none"
          stroke={colorA}
          strokeWidth="0.9"
          points={toPoints(seriesA)}
        />
        {seriesB && (
          <polyline
            fill="none"
            stroke={colorB}
            strokeWidth="0.9"
            points={toPoints(seriesB)}
          />
        )}
      </svg>

      <div className="flex justify-between text-[10px] font-mono text-slate-500">
        <span>0 (Shadows / Black)</span>
        <span>128 (Midtones)</span>
        <span>255 (Highlights / White)</span>
      </div>
    </div>
  );
}

export default function DipLaboratoryPage() {
  const [labTab, setLabTab] = useState("tuner"); // "tuner" | "threshold" | "edges" | "histograms"
  const [activeFile, setActiveFile] = useState(null);
  const [activeSampleId, setActiveSampleId] = useState("hsrp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inspector, setInspector] = useState(null);

  // Heuristic Image Quality State
  const [qualityData, setQualityData] = useState(null);

  // Experiment 1: Parameter Tuner
  const [params, setParams] = useState(DEFAULT_PARAMS);
  const [tunerResult, setTunerResult] = useState(null);

  // Experiment 2: Thresholding Comparison
  const [globalThresh, setGlobalThresh] = useState(127);
  const [adaptiveBlock, setAdaptiveBlock] = useState(31);
  const [threshResult, setThreshResult] = useState(null);

  // Experiment 3: Edge & Gradient Comparison
  const [sobelKsize, setSobelKsize] = useState(3);
  const [cannyLow, setCannyLow] = useState(80);
  const [cannyHigh, setCannyHigh] = useState(180);
  const [edgeResult, setEdgeResult] = useState(null);

  // Experiment 4: Intensity Histograms
  const [histClaheClip, setHistClaheClip] = useState(2.0);
  const [histResult, setHistResult] = useState(null);

  const loadSampleFile = async (sample) => {
    try {
      setActiveSampleId(sample.id);
      const res = await fetch(sample.src);
      const blob = await res.blob();
      const file = new File([blob], `${sample.id}.jpg`, { type: "image/jpeg" });
      setActiveFile(file);
      return file;
    } catch {
      setError("Could not load sample image.");
      return null;
    }
  };

  const fetchQuality = async (file) => {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`${API_BASE_URL}/api/lab/quality`, { method: "POST", body: fd });
      if (res.ok) setQualityData(await res.json());
    } catch {
      // ignore background quality check error
    }
  };

  const executeActiveExperiment = async (fileToUse = activeFile, tabOverride = labTab, paramOverride = params) => {
    if (!fileToUse) return;
    setLoading(true);
    setError("");

    const fd = new FormData();
    fd.append("file", fileToUse);

    try {
      let endpoint = "/api/lab/tune";
      if (tabOverride === "tuner") {
        Object.entries(paramOverride).forEach(([k, v]) => fd.append(k, String(v)));
      } else if (tabOverride === "threshold") {
        endpoint = "/api/lab/threshold";
        fd.append("global_thresh", String(globalThresh));
        fd.append("adaptive_block", String(adaptiveBlock));
      } else if (tabOverride === "edges") {
        endpoint = "/api/lab/edges";
        fd.append("sobel_ksize", String(sobelKsize));
        fd.append("canny_low", String(cannyLow));
        fd.append("canny_high", String(cannyHigh));
      } else if (tabOverride === "histograms") {
        endpoint = "/api/lab/histograms";
        fd.append("clahe_clip", String(histClaheClip));
      }

      const res = await fetch(`${API_BASE_URL}${endpoint}`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Lab API returned HTTP ${res.status}`);
      const data = await res.json();

      if (tabOverride === "tuner") setTunerResult(data);
      if (tabOverride === "threshold") setThreshResult(data);
      if (tabOverride === "edges") setEdgeResult(data);
      if (tabOverride === "histograms") setHistResult(data);
    } catch (err) {
      setError(err.message || "Failed to execute DIP laboratory experiment.");
    } finally {
      setLoading(false);
    }
  };

  // Load default sample on initial mount
  useEffect(() => {
    loadSampleFile(SAMPLE_PRESETS[0]).then((f) => {
      if (f) {
        fetchQuality(f);
        executeActiveExperiment(f, "tuner", DEFAULT_PARAMS);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActiveSampleId(null);
    setActiveFile(file);
    fetchQuality(file);
    executeActiveExperiment(file, labTab, params);
  };

  const handleSampleSelect = async (sample) => {
    const f = await loadSampleFile(sample);
    if (f) {
      fetchQuality(f);
      executeActiveExperiment(f, labTab, params);
    }
  };

  const handleTabSwitch = (newTab) => {
    setLabTab(newTab);
    executeActiveExperiment(activeFile, newTab, params);
  };

  const handleResetParams = () => {
    setParams(DEFAULT_PARAMS);
    executeActiveExperiment(activeFile, "tuner", DEFAULT_PARAMS);
  };

  return (
    <div className="space-y-6">
      <ImageInspectorModal
        imageSrc={inspector?.src}
        title={inspector?.title}
        subtitle={inspector?.subtitle}
        onClose={() => setInspector(null)}
      />

      {/* Top Lab Header & Shared Input Selector */}
      <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
              Interactive Computer Vision Workbench
            </span>
            <h1 className="text-xl font-bold text-white flex items-center gap-2 mt-0.5">
              <FlaskConical className="w-5 h-5 text-cyan-400" />
              Digital Image Processing (DIP) Laboratory
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Experiment with spatial filtering, CLAHE parameters, 5-way thresholding, gradient operators, and intensity histograms on the same input frame.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {SAMPLE_PRESETS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSampleSelect(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                  activeSampleId === s.id
                    ? "bg-cyan-600/20 border-cyan-400 text-cyan-300"
                    : "bg-[#090E1A] border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                Sample: {s.groundTruth}
              </button>
            ))}
            <label className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 transition">
              <Upload className="w-3.5 h-3.5" />
              <span>Custom Image</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>
        </div>

        {/* Heuristic Image Quality Analyzer Bar */}
        {qualityData && (
          <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-4 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                {qualityData.warnings.length === 0 ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                )}
                Pre-Processing Image Quality Analyzer — {qualityData.summary_status}
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                Resolution: {qualityData.dimensions.width}×{qualityData.dimensions.height}px
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="bg-[#0D1322] border border-slate-800/80 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400">Mean Brightness (0–255)</p>
                <p className="font-mono font-bold text-white mt-0.5">{qualityData.metrics.brightness}</p>
              </div>
              <div className="bg-[#0D1322] border border-slate-800/80 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400">RMS Tonal Contrast</p>
                <p className="font-mono font-bold text-cyan-300 mt-0.5">{qualityData.metrics.contrast_rms}</p>
              </div>
              <div className="bg-[#0D1322] border border-slate-800/80 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400">Sharpness (Laplacian Var)</p>
                <p className="font-mono font-bold text-emerald-300 mt-0.5">{qualityData.metrics.sharpness_laplacian}</p>
              </div>
              <div className="bg-[#0D1322] border border-slate-800/80 rounded-lg p-2.5">
                <p className="text-[10px] text-slate-400">Noise Estimate (σ)</p>
                <p className="font-mono font-bold text-amber-300 mt-0.5">{qualityData.metrics.noise_sigma}</p>
              </div>
            </div>

            {qualityData.warnings.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {qualityData.warnings.map((w, i) => (
                  <span
                    key={i}
                    className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300"
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}

            <p className="text-[10px] text-slate-500 flex items-center gap-1">
              <Info className="w-3 h-3 shrink-0" />
              <span>{qualityData.disclaimer}</span>
            </p>
          </div>
        )}

        {/* Lab Experiment Sub-Tabs */}
        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { id: "tuner", label: "1. Parameter Tuning Lab", icon: Sliders },
            { id: "threshold", label: "2. Thresholding Comparison (5-Way)", icon: Contrast },
            { id: "edges", label: "3. Edge & Gradient Comparison (4-Way)", icon: ScanLine },
            { id: "histograms", label: "4. Intensity Histograms", icon: BarChart2 },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabSwitch(t.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition ${
                  labTab === t.id
                    ? "bg-cyan-600 text-white border-cyan-500 shadow"
                    : "bg-[#090E1A] text-slate-300 border-slate-800 hover:border-slate-700"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {/* =================================================================== */}
      {/* LAB 1: INTERACTIVE PARAMETER TUNER                                  */}
      {/* =================================================================== */}
      {labTab === "tuner" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-4 bg-[#0D1322] border border-slate-800/90 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white">DIP Kernel &amp; Filter Controls</h2>
              <button
                type="button"
                onClick={handleResetParams}
                className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                Reset Defaults
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">CLAHE Clip Limit</span>
                  <span className="font-mono text-cyan-400">{params.clahe_clip.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="8.0"
                  step="0.2"
                  value={params.clahe_clip}
                  onChange={(e) => setParams({ ...params, clahe_clip: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">CLAHE Tile Grid Size</span>
                  <span className="font-mono text-cyan-400">
                    {params.clahe_grid}×{params.clahe_grid}
                  </span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="16"
                  step="2"
                  value={params.clahe_grid}
                  onChange={(e) => setParams({ ...params, clahe_grid: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Bilateral Filter Diameter (d)</span>
                  <span className="font-mono text-cyan-400">{params.bilateral_d} px</span>
                </div>
                <input
                  type="range"
                  min="3"
                  max="15"
                  step="2"
                  value={params.bilateral_d}
                  onChange={(e) => setParams({ ...params, bilateral_d: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Bilateral Sigma Color/Space</span>
                  <span className="font-mono text-cyan-400">{params.bilateral_sigma}</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  value={params.bilateral_sigma}
                  onChange={(e) => setParams({ ...params, bilateral_sigma: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Manual Binary Threshold</span>
                  <span className="font-mono text-cyan-400">{params.binary_thresh} / 255</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="255"
                  step="1"
                  value={params.binary_thresh}
                  onChange={(e) => setParams({ ...params, binary_thresh: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-slate-300">Morph Closing Kernel Width</span>
                  <span className="font-mono text-cyan-400">
                    {params.morph_w}×{params.morph_h}
                  </span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="33"
                  step="2"
                  value={params.morph_w}
                  onChange={(e) => setParams({ ...params, morph_w: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => executeActiveExperiment(activeFile, "tuner", params)}
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-800 text-white font-semibold text-xs transition"
            >
              {loading ? "Computing OpenCV Outputs..." : "Apply Parameters to Image"}
            </button>
          </section>

          <section className="lg:col-span-8 bg-[#0D1322] border border-slate-800/90 rounded-2xl p-5">
            <h2 className="text-sm font-bold text-white mb-3">Live Parameter Output Matrix</h2>
            {tunerResult?.outputs ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: "grayscale", title: "Raw Luminance Grayscale", desc: "Baseline single-channel input" },
                  {
                    key: "bilateral_clahe",
                    title: `Bilateral (d=${tunerResult.applied_params.bilateral_d}) + CLAHE (${tunerResult.applied_params.clahe_clip})`,
                    desc: "Edge-preserved local contrast stretching",
                  },
                  {
                    key: "manual_threshold",
                    title: `Manual Binary Threshold (T = ${tunerResult.applied_params.binary_thresh})`,
                    desc: "Fixed global intensity cutoff",
                  },
                  {
                    key: "morph_closed",
                    title: `Morphological Closing (${tunerResult.applied_params.morph_w}×${tunerResult.applied_params.morph_h})`,
                    desc: "Candidate plate region fusion mask",
                  },
                ].map((card) => (
                  <div key={card.key} className="bg-[#090E1A] border border-slate-800 rounded-xl p-3 space-y-2">
                    <div className="relative h-44 bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
                      <img
                        src={tunerResult.outputs[card.key]}
                        alt={card.title}
                        className="max-h-full max-w-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setInspector({
                            src: tunerResult.outputs[card.key],
                            title: card.title,
                            subtitle: card.desc,
                          })
                        }
                        className="absolute bottom-2 right-2 p-1.5 rounded bg-slate-900/90 border border-slate-700 text-slate-200 hover:text-cyan-400"
                        title="Zoom"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white">{card.title}</p>
                      <p className="text-[11px] text-slate-400">{card.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-12 text-center">Loading parameter outputs...</p>
            )}
          </section>
        </div>
      )}

      {/* =================================================================== */}
      {/* LAB 2: 5-WAY THRESHOLDING COMPARISON                                */}
      {/* =================================================================== */}
      {labTab === "threshold" && (
        <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white">5-Way Binarization &amp; Thresholding Comparison</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Compare global vs. local neighborhood thresholding on the exact same grayscale frame—essential under uneven shadow or headlight glare.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Global Threshold: <span className="font-mono text-cyan-400">{globalThresh}</span>
                </label>
                <input
                  type="range"
                  min="10"
                  max="245"
                  value={globalThresh}
                  onChange={(e) => setGlobalThresh(Number(e.target.value))}
                  className="accent-cyan-400"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Adaptive Block Size: <span className="font-mono text-cyan-400">{adaptiveBlock}×{adaptiveBlock}</span>
                </label>
                <input
                  type="range"
                  min="7"
                  max="65"
                  step="2"
                  value={adaptiveBlock}
                  onChange={(e) => setAdaptiveBlock(Number(e.target.value))}
                  className="accent-cyan-400"
                />
              </div>
              <button
                type="button"
                onClick={() => executeActiveExperiment(activeFile, "threshold")}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
              >
                {loading ? "Running..." : "Recompute"}
              </button>
            </div>
          </div>

          {threshResult?.outputs && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { key: "grayscale", title: "Input Grayscale", note: "Unthresholded 8-bit intensity input." },
                {
                  key: "global_binary",
                  title: `Global Binary (T = ${threshResult.params.global_thresh})`,
                  note: "Single fixed threshold; fails when shadows cross half the plate.",
                },
                {
                  key: "binary_inverse",
                  title: `Binary Inverse (T = ${threshResult.params.global_thresh})`,
                  note: "Inverts foreground/background polarity for dark-background plates.",
                },
                {
                  key: "otsu",
                  title: `Otsu's Automatic Method (T* = ${threshResult.params.otsu_computed_thresh})`,
                  note: "Minimizes intra-class variance automatically assuming a bimodal histogram.",
                },
                {
                  key: "adaptive_mean",
                  title: `Adaptive Mean (${threshResult.params.adaptive_block}×${threshResult.params.adaptive_block})`,
                  note: "Computes local window mean minus constant C; handles uneven lighting.",
                },
                {
                  key: "adaptive_gaussian",
                  title: `Adaptive Gaussian (${threshResult.params.adaptive_block}×${threshResult.params.adaptive_block})`,
                  note: "Gaussian-weighted local window threshold (used in VisionPlate Stage 6).",
                },
              ].map((item) => (
                <div key={item.key} className="bg-[#090E1A] border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="relative h-44 bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
                    <img src={threshResult.outputs[item.key]} alt={item.title} className="max-h-full max-w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setInspector({ src: threshResult.outputs[item.key], title: item.title, subtitle: item.note })}
                      className="absolute bottom-2 right-2 p-1.5 rounded bg-slate-900/90 border border-slate-700 text-slate-200 hover:text-cyan-400"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs font-bold text-white">{item.title}</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{item.note}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* =================================================================== */}
      {/* LAB 3: 4-WAY EDGE & GRADIENT COMPARISON                             */}
      {/* =================================================================== */}
      {labTab === "edges" && (
        <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white">Spatial Derivative &amp; Edge-Detection Comparison</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Compare directional Sobel gradients, isotropic second-derivative Laplacian, and multi-stage Canny edge maps.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Sobel Kernel</label>
                <select
                  value={sobelKsize}
                  onChange={(e) => setSobelKsize(Number(e.target.value))}
                  className="bg-[#090E1A] border border-slate-700 rounded-lg px-2.5 py-1.5 text-white"
                >
                  <option value={3}>3 × 3</option>
                  <option value={5}>5 × 5</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Canny Low/High: <span className="font-mono text-cyan-400">{cannyLow} / {cannyHigh}</span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="20"
                    max="180"
                    value={cannyLow}
                    onChange={(e) => setCannyLow(Number(e.target.value))}
                    className="w-24 accent-cyan-400"
                  />
                  <input
                    type="range"
                    min="80"
                    max="255"
                    value={cannyHigh}
                    onChange={(e) => setCannyHigh(Number(e.target.value))}
                    className="w-24 accent-cyan-400"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => executeActiveExperiment(activeFile, "edges")}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
              >
                {loading ? "Running..." : "Recompute"}
              </button>
            </div>
          </div>

          {edgeResult?.outputs && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                { key: "grayscale", title: "Input Grayscale", note: "Original luminance surface before differentiation." },
                {
                  key: "sobel_x",
                  title: `Sobel-X Horizontal Derivative (k=${edgeResult.params.sobel_ksize})`,
                  note: "Measures ∂I/∂x; strongly responds to vertical character strokes (used in Stage 3).",
                },
                {
                  key: "sobel_y",
                  title: `Sobel-Y Vertical Derivative (k=${edgeResult.params.sobel_ksize})`,
                  note: "Measures ∂I/∂y; highlights horizontal bumper lines and plate top/bottom borders.",
                },
                {
                  key: "laplacian",
                  title: `Laplacian Second Derivative (k=${edgeResult.params.sobel_ksize})`,
                  note: "Isotropic ∇²I operator; responds to edges in all directions but sensitive to noise.",
                },
                {
                  key: "canny",
                  title: `Canny Edge Detector (${edgeResult.params.canny_low}, ${edgeResult.params.canny_high})`,
                  note: "Non-maximum suppression + double hysteresis thresholding for thin 1px contours.",
                },
              ].map((item) => (
                <div key={item.key} className="bg-[#090E1A] border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="relative h-44 bg-slate-950 rounded-lg overflow-hidden flex items-center justify-center">
                    <img src={edgeResult.outputs[item.key]} alt={item.title} className="max-h-full max-w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setInspector({ src: edgeResult.outputs[item.key], title: item.title, subtitle: item.note })}
                      className="absolute bottom-2 right-2 p-1.5 rounded bg-slate-900/90 border border-slate-700 text-slate-200 hover:text-cyan-400"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs font-bold text-white">{item.title}</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{item.note}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* =================================================================== */}
      {/* LAB 4: INTENSITY HISTOGRAM VISUALIZATION                            */}
      {/* =================================================================== */}
      {labTab === "histograms" && (
        <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-white">256-Bin Pixel Intensity Histograms</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Calculated directly from the active image matrices to illustrate dynamic range expansion under CLAHE.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <label className="text-slate-300">
                CLAHE Clip Limit: <span className="font-mono text-cyan-400">{histClaheClip.toFixed(1)}</span>
              </label>
              <input
                type="range"
                min="1.0"
                max="8.0"
                step="0.5"
                value={histClaheClip}
                onChange={(e) => setHistClaheClip(Number(e.target.value))}
                className="accent-cyan-400"
              />
              <button
                type="button"
                onClick={() => executeActiveExperiment(activeFile, "histograms")}
                disabled={loading}
                className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold"
              >
                {loading ? "Computing..." : "Update Histograms"}
              </button>
            </div>
          </div>

          {histResult && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-slate-200">Before Enhancement (Raw Grayscale)</span>
                    <span className="font-mono text-slate-400">
                      μ = {histResult.stats.mean_before} • σ = {histResult.stats.std_before}
                    </span>
                  </div>
                  <div className="h-44 bg-slate-950 rounded-lg flex items-center justify-center overflow-hidden">
                    <img src={histResult.images.gray_before} alt="Before CLAHE" className="max-h-full max-w-full object-contain" />
                  </div>
                </div>

                <div className="bg-[#090E1A] border border-cyan-500/30 rounded-xl p-3 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-cyan-300">After CLAHE Contrast Stretching</span>
                    <span className="font-mono text-cyan-400">
                      μ = {histResult.stats.mean_after} • σ = {histResult.stats.std_after}
                    </span>
                  </div>
                  <div className="h-44 bg-slate-950 rounded-lg flex items-center justify-center overflow-hidden">
                    <img src={histResult.images.gray_after} alt="After CLAHE" className="max-h-full max-w-full object-contain" />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <HistogramChart
                  title="Grayscale Luminance Distribution: Before vs. After CLAHE"
                  seriesA={histResult.histograms.gray_before}
                  labelA="Before Enhancement"
                  colorA="#94a3b8"
                  seriesB={histResult.histograms.gray_after}
                  labelB="After CLAHE"
                  colorB="#22d3ee"
                />
                <HistogramChart
                  title="RGB Color Channel Histograms (Input Image)"
                  seriesA={histResult.histograms.red}
                  labelA="Red Channel"
                  colorA="#f87171"
                  seriesB={histResult.histograms.blue}
                  labelB="Blue Channel"
                  colorB="#60a5fa"
                />
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}