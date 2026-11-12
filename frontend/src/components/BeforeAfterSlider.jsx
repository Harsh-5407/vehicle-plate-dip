import React, { useState } from "react";
import { SlidersHorizontal, Columns } from "lucide-react";

const COMPARISON_PAIRS = [
  {
    id: "orig_vs_enhanced",
    label: "1. Input Frame vs. Bilateral + CLAHE",
    leftKey: "original",
    leftLabel: "Original Input",
    rightKey: "enhanced_gray",
    rightLabel: "Bilateral + CLAHE",
  },
  {
    id: "enhanced_vs_sobel",
    label: "2. Enhanced Grayscale vs. Blackhat + Sobel-X",
    leftKey: "enhanced_gray",
    leftLabel: "Enhanced Grayscale",
    rightKey: "sobel_x_edges",
    rightLabel: "Blackhat + Sobel-X",
  },
  {
    id: "sobel_vs_morph",
    label: "3. Sobel-X Gradients vs. Morphological Closing",
    leftKey: "sobel_x_edges",
    leftLabel: "Sobel-X Gradients",
    rightKey: "morph_mask",
    rightLabel: "Otsu + Morph Closing",
  },
  {
    id: "crop_vs_binarized",
    label: "4. Raw Plate Crop vs. Segmented & Deskewed ROI",
    leftKey: "raw_plate_crop",
    leftLabel: "Raw Plate Crop",
    rightKey: "binarized_plate",
    rightLabel: "Binarized & Deskewed ROI",
  },
];

export default function BeforeAfterSlider({ stages }) {
  const [pairId, setPairId] = useState("orig_vs_enhanced");
  const [sliderPos, setSliderPos] = useState(50);
  const [mode, setMode] = useState("slider"); // "slider" | "side-by-side"

  if (!stages) return null;

  const pair = COMPARISON_PAIRS.find((p) => p.id === pairId) || COMPARISON_PAIRS[0];
  const leftSrc = stages[pair.leftKey] || stages.original;
  const rightSrc = stages[pair.rightKey] || stages.enhanced_gray;

  return (
    <div className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
            Before &amp; After Stage Comparison
          </h3>
          <p className="text-xs text-slate-400">
            Inspect pixel-level transformations between sequential DIP stages
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pairId}
            onChange={(e) => setPairId(e.target.value)}
            className="bg-[#090E1A] border border-slate-700 focus:border-cyan-500 outline-none rounded-xl px-3 py-1.5 text-xs text-slate-200"
          >
            {COMPARISON_PAIRS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>

          <div className="flex items-center bg-[#090E1A] border border-slate-800 rounded-xl p-0.5 text-xs">
            <button
              type="button"
              onClick={() => setMode("slider")}
              className={`px-2.5 py-1 rounded-lg font-medium transition ${
                mode === "slider" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Split Slider
            </button>
            <button
              type="button"
              onClick={() => setMode("side-by-side")}
              className={`px-2.5 py-1 rounded-lg font-medium transition flex items-center gap-1 ${
                mode === "side-by-side" ? "bg-cyan-600 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              <Columns className="w-3 h-3" />
              Side-by-Side
            </button>
          </div>
        </div>
      </div>

      {mode === "slider" ? (
        <div className="space-y-3">
          <div className="relative w-full h-72 sm:h-80 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 select-none">
            {/* Base Right Image */}
            <img
              src={rightSrc}
              alt={pair.rightLabel}
              className="absolute inset-0 w-full h-full object-contain"
            />
            {/* Clipped Left Image */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
            >
              <img
                src={leftSrc}
                alt={pair.leftLabel}
                className="w-full h-full object-contain bg-slate-950"
              />
            </div>

            {/* Divider Line */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)] pointer-events-none"
              style={{ left: `${sliderPos}%` }}
            >
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-cyan-500 text-slate-950 font-bold text-xs flex items-center justify-center shadow-lg">
                ↔
              </div>
            </div>

            <span className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-slate-950/85 border border-slate-700 text-[11px] font-medium text-slate-200">
              {pair.leftLabel}
            </span>
            <span className="absolute top-3 right-3 px-2.5 py-1 rounded-md bg-slate-950/85 border border-cyan-500/40 text-[11px] font-medium text-cyan-300">
              {pair.rightLabel}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-400 shrink-0">{pair.leftLabel}</span>
            <input
              type="range"
              min="0"
              max="100"
              value={sliderPos}
              onChange={(e) => setSliderPos(Number(e.target.value))}
              aria-label="Before and after comparison slider"
              className="w-full accent-cyan-400 cursor-ew-resize"
            />
            <span className="text-[11px] text-cyan-400 shrink-0">{pair.rightLabel}</span>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#090E1A] border border-slate-800 rounded-xl p-3">
            <p className="text-xs font-medium text-slate-300 mb-2">{pair.leftLabel}</p>
            <div className="h-64 bg-slate-950 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={leftSrc} alt={pair.leftLabel} className="max-h-full max-w-full object-contain" />
            </div>
          </div>
          <div className="bg-[#090E1A] border border-cyan-500/30 rounded-xl p-3">
            <p className="text-xs font-medium text-cyan-300 mb-2">{pair.rightLabel}</p>
            <div className="h-64 bg-slate-950 rounded-lg flex items-center justify-center overflow-hidden">
              <img src={rightSrc} alt={pair.rightLabel} className="max-h-full max-w-full object-contain" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}