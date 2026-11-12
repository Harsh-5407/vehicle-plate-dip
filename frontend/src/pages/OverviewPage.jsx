import React from "react";
import {
  ArrowRight,
  Cpu,
  FlaskConical,
  BarChart3,
  Layers,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { DIP_STAGES_META } from "../constants/dipData";

export default function OverviewPage({ backendHealth, recentRuns, onNavigate }) {
  const isOnline = backendHealth?.status === "ok";

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <section className="bg-gradient-to-br from-[#0D1528] via-[#0D1322] to-[#091220] border border-slate-800 rounded-2xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <span className="text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            5th-Semester Digital Image Processing Laboratory
          </span>

          <div
            className={`inline-flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full border ${
              isOnline
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/10 text-amber-300 border-amber-500/30"
            }`}
          >
            {isOnline ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Backend Online • YOLOv8n + RapidOCR Ready</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5" />
                <span>Backend Waking Up / Checking Status...</span>
              </>
            )}
          </div>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight max-w-3xl">
          Automated Vehicle License Plate Detection &amp; Character Extraction Platform
        </h1>
        <p className="text-sm text-slate-300 mt-3 max-w-3xl leading-relaxed">
          An interpretable computer-vision workbench exposing every intermediate spatial filtering,
          contrast enhancement, gradient edge extraction, morphological grouping, ONNX localization,
          and OCR character-segmentation stage behind Indian Automatic Number Plate Recognition (ANPR).
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => onNavigate("recognition")}
            className="px-5 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-cyan-600/20 transition"
          >
            <span>Start Plate Recognition</span>
            <ArrowRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate("laboratory")}
            className="px-4 py-3 rounded-xl bg-[#090E1A] hover:bg-slate-800/80 text-slate-200 border border-slate-700 font-semibold text-sm flex items-center gap-2 transition"
          >
            <FlaskConical className="w-4 h-4 text-cyan-400" />
            <span>Open DIP Laboratory</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate("techniques")}
            className="px-4 py-3 rounded-xl bg-[#090E1A] hover:bg-slate-800/80 text-slate-300 border border-slate-800 font-medium text-sm transition"
          >
            Read Algorithm Specs
          </button>
        </div>
      </section>

      {/* 6-Stage Pipeline Summary Grid */}
      <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Six-Stage Digital Image Processing Architecture
            </h2>
            <p className="text-xs text-slate-400">
              Each stage produces an inspectable intermediate matrix exposed directly from OpenCV &amp; ONNX Runtime
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DIP_STAGES_META.map((stage) => (
            <div
              key={stage.key}
              className="bg-[#090E1A] border border-slate-800/90 rounded-xl p-4 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    STAGE 0{stage.stepNumber}
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-white">{stage.title}</h3>
                <p className="text-[11px] font-mono text-cyan-300/90 mt-1">{stage.technique}</p>
                <p className="text-xs text-slate-400 mt-2 leading-relaxed">{stage.whatItDoes}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Navigation Cards & Recent Runs */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-5 bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-3">
          <h2 className="text-base font-bold text-white">Workbench Modules</h2>
          <p className="text-xs text-slate-400">Jump directly to any evaluation or laboratory view</p>

          <button
            type="button"
            onClick={() => onNavigate("recognition")}
            className="w-full text-left p-3.5 rounded-xl bg-[#090E1A] hover:border-cyan-500/50 border border-slate-800 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Cpu className="w-5 h-5 text-cyan-400" />
              <div>
                <p className="text-xs font-semibold text-white">Plate Recognition &amp; Stage Stepper</p>
                <p className="text-[11px] text-slate-400">Upload frames, inspect bounding boxes &amp; OCR</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate("laboratory")}
            className="w-full text-left p-3.5 rounded-xl bg-[#090E1A] hover:border-cyan-500/50 border border-slate-800 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <FlaskConical className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-xs font-semibold text-white">DIP Experimentation Laboratory</p>
                <p className="text-[11px] text-slate-400">Thresholding, Sobel/Canny edges, CLAHE &amp; Histograms</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate("performance")}
            className="w-full text-left p-3.5 rounded-xl bg-[#090E1A] hover:border-cyan-500/50 border border-slate-800 transition flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-amber-400" />
              <div>
                <p className="text-xs font-semibold text-white">Performance &amp; Ground-Truth Analysis</p>
                <p className="text-[11px] text-slate-400">Character-level accuracy &amp; per-stage runtime metrics</p>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-500" />
          </button>
        </section>

        <section className="lg:col-span-7 bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold text-white">Recent Session Runs</h2>
              <p className="text-xs text-slate-400">Local browser session log of processed vehicle images</p>
            </div>
            {recentRuns.length > 0 && (
              <button
                type="button"
                onClick={() => onNavigate("history")}
                className="text-xs text-cyan-400 hover:underline"
              >
                View All ({recentRuns.length})
              </button>
            )}
          </div>

          {recentRuns.length === 0 ? (
            <div className="bg-[#090E1A] border border-dashed border-slate-800 rounded-xl p-8 text-center">
              <p className="text-xs text-slate-400">
                No images processed in this browser session yet. Click{" "}
                <span className="text-cyan-400 font-semibold">Start Plate Recognition</span> to run your first sample.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {recentRuns.slice(0, 4).map((run) => (
                <div
                  key={run.id}
                  className="bg-[#090E1A] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {run.thumbnail && (
                      <img
                        src={run.thumbnail}
                        alt={run.filename}
                        className="w-12 h-9 rounded object-cover border border-slate-700 shrink-0"
                      />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{run.filename}</p>
                      <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        <span>{run.timestamp}</span>
                        <span>• Compute: {run.computeMs} ms</span>
                      </p>
                    </div>
                  </div>
                  <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-amber-400 text-slate-950 shrink-0">
                    {run.plateNumber}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}