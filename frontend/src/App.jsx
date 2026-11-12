import DipLaboratoryPage from "./pages/DipLaboratoryPage";
import React, { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Cpu,
  FlaskConical,
  BarChart3,
  History,
  BookOpen,
  Menu,
  X,
  Trash2,
} from "lucide-react";
import { API_BASE_URL } from "./constants/dipData";
import OverviewPage from "./pages/OverviewPage";
import PlateRecognitionPage from "./pages/PlateRecognitionPage";
import AboutTechniquesPage from "./pages/AboutTechniquesPage";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, badge: null },
  { id: "recognition", label: "Plate Recognition", icon: Cpu, badge: "Core" },
  { id: "laboratory", label: "DIP Laboratory", icon: FlaskConical, badge: "Interactive" },
  { id: "performance", label: "Performance Analysis", icon: BarChart3, badge: "Phase 3" },
  { id: "history", label: "Processing History", icon: History, badge: null },
  { id: "techniques", label: "About / DIP Techniques", icon: BookOpen, badge: null },
];

export default function App() {
  const [activePage, setActivePage] = useState("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [backendHealth, setBackendHealth] = useState(null);
  const [recentRuns, setRecentRuns] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("visionplate_runs") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setBackendHealth(data))
      .catch(() => setBackendHealth(null));
  }, []);

  const handleRunRecorded = (runEntry) => {
    setRecentRuns((prev) => {
      const updated = [runEntry, ...prev].slice(0, 15);
      try {
        localStorage.setItem("visionplate_runs", JSON.stringify(updated));
      } catch {
        // Ignore quota exceeded if large thumbnails accumulate
      }
      return updated;
    });
  };

  const handleClearHistory = () => {
    setRecentRuns([]);
    localStorage.removeItem("visionplate_runs");
  };

  const navigateTo = (pageId) => {
    setActivePage(pageId);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-[#070B14] text-slate-100 font-sans flex flex-col lg:flex-row">
      {/* Mobile Header */}
      <header className="lg:hidden border-b border-slate-800 bg-[#0B1120] px-4 py-3 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
            <Cpu className="w-5 h-5" />
          </div>
          <span className="font-bold text-sm text-white">VisionPlate DIP</span>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-slate-300 hover:bg-slate-800"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Left Sidebar Navigation */}
      <aside
        className={`${
          mobileMenuOpen ? "fixed inset-0 z-20 pt-16 bg-[#090E1A]" : "hidden"
        } lg:flex lg:w-64 lg:shrink-0 lg:flex-col lg:justify-between border-r border-slate-800/80 bg-[#090E1A] p-4`}
      >
        <div className="space-y-6">
          <div className="hidden lg:flex items-center gap-3 px-2 pt-1">
            <div className="p-2 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">VisionPlate DIP</h1>
              <p className="text-[11px] text-slate-400">ANPR Vision Workbench</p>
            </div>
          </div>

          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition ${
                    isActive
                      ? "bg-cyan-600/20 text-cyan-300 border border-cyan-500/40"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/70"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-slate-500"}`} />
                    <span>{item.label}</span>
                  </span>
                  {item.badge && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="bg-[#0D1322] border border-slate-800 rounded-xl p-3 text-[11px] text-slate-400 space-y-1">
          <p className="font-semibold text-slate-200">5th-Sem DIP Practical</p>
          <p>OpenCV + YOLOv8n ONNX + RapidOCR</p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {activePage === "overview" && (
            <OverviewPage
              backendHealth={backendHealth}
              recentRuns={recentRuns}
              onNavigate={navigateTo}
            />
          )}

          {activePage === "recognition" && (
            <PlateRecognitionPage onRunRecorded={handleRunRecorded} />
          )}

          {activePage === "techniques" && <AboutTechniquesPage />}

          {activePage === "history" && (
            <div className="bg-[#0D1322] border border-slate-800/90 rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-white">Local Session Processing History</h2>
                  <p className="text-xs text-slate-400">
                    Stored locally in your browser (`localStorage`, max 15 runs). No images are permanently retained on the server.
                  </p>
                </div>
                {recentRuns.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear All History
                  </button>
                )}
              </div>

              {recentRuns.length === 0 ? (
                <p className="text-xs text-slate-400 py-8 text-center">
                  No runs recorded yet. Process an image in <strong>Plate Recognition</strong> to populate history.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {recentRuns.map((run) => (
                    <div
                      key={run.id}
                      className="bg-[#090E1A] border border-slate-800 rounded-xl p-3 flex items-center justify-between gap-4"
                    >
                      <div className="flex items-center gap-3">
                        {run.thumbnail && (
                          <img
                            src={run.thumbnail}
                            alt={run.filename}
                            className="w-14 h-10 rounded object-cover border border-slate-700"
                          />
                        )}
                        <div>
                          <p className="text-xs font-semibold text-white">{run.filename}</p>
                          <p className="text-[11px] text-slate-400">
                            {run.timestamp} • Compute: {run.computeMs} ms
                          </p>
                        </div>
                      </div>
                      <span className="font-mono text-xs font-bold px-3 py-1 rounded bg-amber-400 text-slate-950">
                        {run.plateNumber}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activePage === "laboratory" && <DipLaboratoryPage />}

          {activePage === "performance" && (
            <div className="bg-[#0D1322] border border-slate-800 rounded-2xl p-8 text-center space-y-2">
              <BarChart3 className="w-8 h-8 text-amber-400 mx-auto" />
              <h2 className="text-lg font-bold text-white">Performance &amp; Benchmark Analysis</h2>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                Scheduled for <strong>Phase 3</strong>: Multi-condition test gallery, separate localization
                vs. character-level accuracy metrics, runtime charts, and downloadable PDF lab reports.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}