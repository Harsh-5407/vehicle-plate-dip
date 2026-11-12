import React from "react";
import { BookOpen, Cpu, AlertTriangle, CheckCircle2 } from "lucide-react";
import { DIP_STAGES_META } from "../constants/dipData";

export default function AboutTechniquesPage() {
  return (
    <div className="space-y-6">
      <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6">
        <span className="text-xs font-semibold uppercase tracking-wider text-cyan-400">
          Technical Documentation &amp; Viva Reference
        </span>
        <h1 className="text-2xl font-bold text-white mt-1">
          Digital Image Processing Methodology &amp; System Architecture
        </h1>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed max-w-4xl">
          VisionPlate DIP combines classical spatial-domain Digital Image Processing (edge-preserving
          filtering, adaptive histogram equalization, directional gradient operators, and
          morphological structuring elements) with lightweight ONNX neural localization and
          scene-text recognition tailored to Indian High-Security Registration Plates (HSRP).
        </p>
      </section>

      <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-4">
        <h2 className="text-base font-bold text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          Stage-by-Stage Mathematical &amp; Algorithmic Reference
        </h2>

        <div className="space-y-3">
          {DIP_STAGES_META.map((stage) => (
            <div
              key={stage.key}
              className="bg-[#090E1A] border border-slate-800 rounded-xl p-4 space-y-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white">
                  Stage {stage.stepNumber}: {stage.title}
                </h3>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                  {stage.technique}
                </span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">{stage.whatItDoes}</p>
              <p className="text-xs text-slate-400 leading-relaxed">
                <strong className="text-slate-200">Engineering Rationale:</strong> {stage.whyUsed}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Cpu className="w-4 h-4 text-emerald-400" />
            Libraries, Models &amp; Runtime Stack
          </h2>
          <ul className="space-y-2 text-xs text-slate-300">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>OpenCV (`opencv-python-headless`):</strong> Color-space conversion, Bilateral
                filtering, CLAHE, Sobel-X derivatives, Otsu &amp; Adaptive Gaussian thresholding,
                morphological closing, connected-component filtering, and affine deskewing.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>ONNX Runtime + YOLOv8-Nano (`plate_detector.onnx`):</strong> Single-class
                license plate localization at 640×640 letterboxed resolution with NMS (`IoU = 0.45`).
              </span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong>RapidOCR ONNX (`rapidocr-onnxruntime`):</strong> Lightweight CRNN sequence
                recognition paired with Indian RTO positional syntax validation (`SS DD LL DDDD`).
              </span>
            </li>
          </ul>
        </section>

        <section className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-3">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            Known Limitations &amp; Responsible-Use Scope
          </h2>
          <ul className="space-y-2 text-xs text-slate-300">
            <li>
              • <strong>Extreme Motion Blur / Low Resolution:</strong> Plates smaller than ~24px in
              vertical height lose stroke separation during adaptive thresholding.
            </li>
            <li>
              • <strong>Specular Glare &amp; Nighttime Headlight Bloom:</strong> Direct LED reflection on
              retro-reflective HSRP sheets can saturate pixel intensities to 255.
            </li>
            <li>
              • <strong>Two-Line Commercial Plates:</strong> Multi-row layouts may require larger
              vertical crop margins when angled steeply.
            </li>
            <li>
              • <strong>Academic Demonstration Disclaimer:</strong> Built for 5th-semester DIP
              evaluation; any RTO/police registry records in the optional demo module are synthetic.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}