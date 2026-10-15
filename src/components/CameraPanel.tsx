"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  startCamera,
  stopCamera,
  captureFrame,
  CameraStatus,
} from "@/lib/tools/camera";
import { describeSurroundings } from "@/lib/tools/objects";
import { readTextFromImage } from "@/lib/tools/ocr";
import { askVisualQuestion } from "@/lib/tools/visualQa";
import { readCurrency } from "@/lib/tools/currency";
import { speak, speakTouch } from "@/lib/tools/speech";
import { toBengaliDigits } from "@/lib/storage/geofenceStore";

export type CameraAiMode = "objects" | "ocr" | "qa" | "currency";

interface CameraPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture?: (imageData: ImageData) => void;
  initialMode?: CameraAiMode;
  initialHazardDemo?: boolean;
}

interface AiAnalysisResult {
  mode: CameraAiMode;
  engineName: string;
  sourceBadge: string;
  messageBn: string;
  confidence: number | null;
  detail?: string;
  timestamp: number;
}

export default function CameraPanel({
  isOpen,
  onClose,
  onCapture,
  initialMode = "objects",
  initialHazardDemo = false,
}: CameraPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>(
    "ক্যামেরা বর্তমানে বন্ধ রয়েছে। চালু করতে নিচের বাটনে চাপ দিন।"
  );
  const [selectedMode, setSelectedMode] = useState<CameraAiMode>(initialMode);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisStatusText, setAnalysisStatusText] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<AiAnalysisResult | null>(null);
  const [customQuestion, setCustomQuestion] = useState<string>("আমার সামনে কী রয়েছে বিস্তারিত ব্যাখ্যা করো");

  const [caneVisionResult, setCaneVisionResult] = useState<{
    imageUrl: string;
    spokenSummaryBn: string;
    timestamp: number;
  } | null>(null);

  // Scripted Dhaka Road Hazard Demo state (pothole, bricks, rickshaw, pedestrian)
  const [isHazardDemoActive, setIsHazardDemoActive] = useState<boolean>(false);

  const triggerHazardDemo = useCallback(() => {
    setIsHazardDemoActive(true);
    setSelectedMode("objects");
    const warningMsg =
      "সাবধান! সামনে মাত্র ৩ কদম দূরে ফুটপাতে একটি বিপজ্জনক খোলা গর্ত ও ভাঙা ম্যানহোল রয়েছে। অবিলম্বে সামান্য বাঁ ঘেঁষে সাবধানে চলুন।";
    setAiResult({
      mode: "objects",
      engineName: "MediaPipe TFLite + দৃষ্টি ঢাকা রোডহ্যাজার্ড স্পেশাল মডেল",
      sourceBadge: "⚠️ রোডহ্যাজার্ড ও অবজেক্ট অ্যালার্ট",
      messageBn: warningMsg,
      confidence: 0.96,
      detail: "সনাক্তকৃত অবজেক্ট: ১টি বিপজ্জনক খোলা গর্ত/ম্যানহোল (৩ কদম দূরে), ভাঙা ইট, রিকশা ও পথচারী",
      timestamp: Date.now(),
    });
    speak(warningMsg);
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }
  }, []);

  // Sync mode with initialMode prop when modal opens without setState in effect
  const [prevProps, setPrevProps] = useState({ initialMode, isOpen });
  if (prevProps.initialMode !== initialMode || prevProps.isOpen !== isOpen) {
    setPrevProps({ initialMode, isOpen });
    if (initialMode && initialMode !== selectedMode) {
      setSelectedMode(initialMode);
    }
  }

  // Listen for Smart Cane vision processing results
  useEffect(() => {
    const handleCaneResult = (e: Event) => {
      const customEvent = e as CustomEvent<{
        imageUrl: string;
        spokenSummaryBn: string;
        timestamp: number;
      }>;
      if (customEvent.detail) {
        setCaneVisionResult(customEvent.detail);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("drishti:cane-vision-result", handleCaneResult);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("drishti:cane-vision-result", handleCaneResult);
      }
    };
  }, []);

  const handleStart = useCallback(async () => {
    if (!videoRef.current) return;

    setCameraStatus("starting");
    setStatusMessage("ক্যামেরা সংযোগ স্থাপন করা হচ্ছে...");
    setAnalysisStatusText(null);

    const result = await startCamera(videoRef.current);

    if (result.success && result.stream) {
      streamRef.current = result.stream;
      setCameraStatus("active");
      setStatusMessage("ক্যামেরা সফলভাবে চালু হয়েছে। লাইভ ভিডিও দেখা যাচ্ছে।");
    } else if (result.error) {
      setCameraStatus("error");
      setStatusMessage(result.error.message_bn);
    }
  }, []);

  const handleStop = useCallback(() => {
    if (streamRef.current || videoRef.current) {
      stopCamera(streamRef.current, videoRef.current);
      streamRef.current = null;
    }
    setCameraStatus("idle");
    setStatusMessage("ক্যামেরা সম্পূর্ণভাবে বন্ধ করা হয়েছে।");
    setAnalysisStatusText(null);
  }, []);

  // Stop camera on unmount or when modal is closed
  useEffect(() => {
    const videoEl = videoRef.current;
    return () => {
      if (streamRef.current || videoEl) {
        stopCamera(streamRef.current, videoEl);
        streamRef.current = null;
      }
    };
  }, []);

  // Auto-start camera when modal opens
  useEffect(() => {
    if (isOpen && cameraStatus === "idle") {
      const timer = setTimeout(() => {
        handleStart();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, cameraStatus, handleStart]);

  // Auto-trigger hazard demo if requested
  useEffect(() => {
    if (isOpen && initialHazardDemo) {
      const timer = setTimeout(() => {
        triggerHazardDemo();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialHazardDemo, triggerHazardDemo]);

  const handleClose = () => {
    handleStop();
    onClose();
  };

  // ========================================================
  // Core AI Inference Dispatcher
  // ========================================================
  const runAiAnalysis = async (overrideMode?: CameraAiMode) => {
    if (!videoRef.current || cameraStatus !== "active") {
      const msg = "এআই বিশ্লেষণের জন্য প্রথমে ক্যামেরা চালু করুন।";
      setStatusMessage(msg);
      speak(msg);
      return;
    }

    const frame = captureFrame(videoRef.current);
    if (!frame) {
      const msg = "ফ্রেম গ্রহণ করা যায়নি। ক্যামেরা প্রস্তুত হওয়া পর্যন্ত অপেক্ষা করুন।";
      setAnalysisStatusText(msg);
      speak(msg);
      return;
    }

    onCapture?.(frame);

    const mode = overrideMode || selectedMode;
    setIsAnalyzing(true);

    try {
      if (mode === "objects") {
        setAnalysisStatusText("⚡ MediaPipe TFLite মডেল দিয়ে ফ্রেমের চারপাশের বস্তু সনাক্ত করা হচ্ছে...");
        const res = await describeSurroundings({ imageSource: frame });
        setAiResult({
          mode: "objects",
          engineName: "MediaPipe EfficientDet-Lite0 (অন-ডিভাইস TFLite)",
          sourceBadge: "⚡ On-Device AI Model",
          messageBn: res.message_bn,
          confidence: res.confidence,
          detail: res.detail,
          timestamp: Date.now(),
        });
        speak(res.message_bn);
      } else if (mode === "ocr") {
        setAnalysisStatusText("📖 Tesseract.js দিয়ে বাংলা ও ইংরেজি টেক্সট পড়া হচ্ছে...");
        const res = await readTextFromImage({ imageSource: frame });
        setAiResult({
          mode: "ocr",
          engineName: "Tesseract.js OCR (বাংলা ও ইংরেজি মডেল)",
          sourceBadge: "📑 On-Device OCR Engine",
          messageBn: res.message_bn,
          confidence: res.confidence,
          detail: res.detail,
          timestamp: Date.now(),
        });
        // Speech is already handled inside readTextFromImage
      } else if (mode === "qa") {
        setAnalysisStatusText("🧠 Google Gemini 2.5 Flash দিয়ে দৃশ্য ও প্রশ্নোত্তর বিশ্লেষণ চলছে...");
        const res = await askVisualQuestion({
          imageSource: frame,
          question: customQuestion || "আমার সামনে কী রয়েছে বিস্তারিত ব্যাখ্যা করো",
        });
        setAiResult({
          mode: "qa",
          engineName: res.source === "browser-api" ? "Google Gemini 2.5 Flash Multimodal" : "অন-ডিভাইস মাল্টিমোডাল সিন্থেসাইজার",
          sourceBadge: res.source === "browser-api" ? "🧠 Cloud Gemini API" : "⚡ On-Device Fallback",
          messageBn: res.message_bn,
          confidence: res.confidence,
          detail: res.detail,
          timestamp: Date.now(),
        });
        // Speech is already handled inside queryVisualQa
      } else if (mode === "currency") {
        setAnalysisStatusText("💵 টাকার নোটের রঙ ও সংখ্যা বিশ্লেষণ করা হচ্ছে...");
        const res = await readCurrency({ imageSource: frame, autoAddToTotal: true });
        setAiResult({
          mode: "currency",
          engineName: "দৃষ্টি কারেন্সি ডিটেক্টর (কালার হিস্টোগ্রাম + OCR)",
          sourceBadge: "💵 Bangladeshi Taka Engine",
          messageBn: res.message_bn,
          confidence: res.confidence,
          detail: res.detail,
          timestamp: Date.now(),
        });
        speak(res.message_bn);
      }
    } catch (err) {
      const errMsg = `এআই বিশ্লেষণে ত্রুটি: ${err instanceof Error ? err.message : "অজানা ত্রুটি"}`;
      setAnalysisStatusText(errMsg);
      speak(errMsg);
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatusText(null);
    }
  };

  if (!isOpen) return null;

  return (
    <section
      aria-labelledby="camera-modal-title"
      className="camera-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="camera-modal-content" style={{ maxWidth: "720px" }}>
        <div className="camera-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.4rem" }}>📷</span>
            <h2 id="camera-modal-title" style={{ margin: 0, fontSize: "1.3rem" }}>
              দৃষ্টি এআই কম্পিউটার ভিশন ও ক্যামেরা
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="settings-close-btn"
            aria-label="ক্যামেরা প্যানেল বন্ধ করুন"
          >
            ✕ বন্ধ করুন
          </button>
        </div>

        {/* AI Vision Mode Selector */}
        <div
          role="tablist"
          aria-label="এআই মোড নির্বাচন"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: "0.5rem",
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={selectedMode === "objects"}
            onClick={() => setSelectedMode("objects")}
            className={`demo-quick-btn ${selectedMode === "objects" ? "primary" : "secondary"}`}
            style={{ fontSize: "0.88rem", padding: "0.5rem 0.6rem", textAlign: "center" }}
          >
            🔍 চারপাশের বস্তু (TFLite)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedMode === "ocr"}
            onClick={() => setSelectedMode("ocr")}
            className={`demo-quick-btn ${selectedMode === "ocr" ? "primary" : "secondary"}`}
            style={{ fontSize: "0.88rem", padding: "0.5rem 0.6rem", textAlign: "center" }}
          >
            📖 লেখা পড়া (OCR)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedMode === "qa"}
            onClick={() => setSelectedMode("qa")}
            className={`demo-quick-btn ${selectedMode === "qa" ? "primary" : "secondary"}`}
            style={{ fontSize: "0.88rem", padding: "0.5rem 0.6rem", textAlign: "center" }}
          >
            🤖 এআই প্রশ্ন (Gemini)
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedMode === "currency"}
            onClick={() => setSelectedMode("currency")}
            className={`demo-quick-btn ${selectedMode === "currency" ? "primary" : "secondary"}`}
            style={{ fontSize: "0.88rem", padding: "0.5rem 0.6rem", textAlign: "center" }}
          >
            💵 টাকা চিনুন (BDT)
          </button>
        </div>

        {/* Mode Selector & Quick Demo Launcher Bar */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
            এআই ভিশন প্রসেসিং মোড:
          </span>
          <button
            type="button"
            onClick={() => {
              if (isHazardDemoActive) {
                setIsHazardDemoActive(false);
              } else {
                triggerHazardDemo();
              }
            }}
            style={{
              background: isHazardDemoActive ? "linear-gradient(135deg, #b91c1c, #ea580c)" : "#1e293b",
              color: "#fff",
              border: `2px solid ${isHazardDemoActive ? "#ef4444" : "#f59e0b"}`,
              borderRadius: "8px",
              padding: "0.35rem 0.75rem",
              fontSize: "0.82rem",
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: isHazardDemoActive ? "0 0 12px rgba(239, 68, 68, 0.6)" : "none",
            }}
          >
            {isHazardDemoActive ? "🎬 রোডহ্যাজার্ড ডেমো সক্রিয় (বন্ধ করুন)" : "🎬 ঢাকা রোডহ্যাজার্ড ও গর্ত ডেমো (Pothole Scene)"}
          </button>
        </div>

        {/* Video Preview Container */}
        <div className="camera-preview-container" style={{ position: "relative", minHeight: "260px" }}>
          {isHazardDemoActive ? (
            <div style={{ position: "relative", width: "100%", height: "100%", minHeight: "280px", overflow: "hidden", borderRadius: "10px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/demo/dhaka_road_hazard.jpg"
                alt="ঢাকা রাস্তার গর্ত ও বাধার দৃশ্য"
                style={{
                  width: "100%",
                  height: "100%",
                  maxHeight: "360px",
                  objectFit: "cover",
                  display: "block",
                }}
              />

              {/* Bounding Box 1: Open Pothole / Manhole Hazard (Pulsing Red) */}
              <div
                style={{
                  position: "absolute",
                  top: "54%",
                  left: "32%",
                  width: "48%",
                  height: "36%",
                  border: "3px solid #ef4444",
                  boxShadow: "0 0 16px rgba(239, 68, 68, 0.8), inset 0 0 12px rgba(239, 68, 68, 0.4)",
                  borderRadius: "8px",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "-26px",
                    left: 0,
                    background: "#ef4444",
                    color: "#ffffff",
                    fontSize: "11px",
                    fontWeight: 800,
                    padding: "2px 8px",
                    borderRadius: "4px",
                    whiteSpace: "nowrap",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.5)",
                  }}
                >
                  ⚠️ খোলা গর্ত ও ভাঙা ম্যানহোল (Pothole) - ৯৬%
                </span>
              </div>

              {/* Bounding Box 2: Broken Bricks / Rubble (Yellow) */}
              <div
                style={{
                  position: "absolute",
                  top: "74%",
                  left: "54%",
                  width: "22%",
                  height: "18%",
                  border: "2px solid #eab308",
                  borderRadius: "6px",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "-22px",
                    left: 0,
                    background: "#eab308",
                    color: "#000000",
                    fontSize: "10px",
                    fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: "4px",
                    whiteSpace: "nowrap",
                  }}
                >
                  ⚠️ ভাঙা ইট (Bricks) - ৮৯%
                </span>
              </div>

              {/* Bounding Box 3: Pedestrian (Cyan) */}
              <div
                style={{
                  position: "absolute",
                  top: "22%",
                  left: "14%",
                  width: "18%",
                  height: "52%",
                  border: "2px solid #38bdf8",
                  borderRadius: "6px",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "-22px",
                    left: 0,
                    background: "#0284c7",
                    color: "#ffffff",
                    fontSize: "10px",
                    fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: "4px",
                    whiteSpace: "nowrap",
                  }}
                >
                  🚶 পথচারী (Pedestrian) - ৯২%
                </span>
              </div>

              {/* Bounding Box 4: Rickshaw (Orange) */}
              <div
                style={{
                  position: "absolute",
                  top: "26%",
                  left: "66%",
                  width: "26%",
                  height: "46%",
                  border: "2px solid #f97316",
                  borderRadius: "6px",
                  pointerEvents: "none",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: "-22px",
                    left: 0,
                    background: "#ea580c",
                    color: "#ffffff",
                    fontSize: "10px",
                    fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: "4px",
                    whiteSpace: "nowrap",
                  }}
                >
                  🛺 রিকশা (Rickshaw) - ৯৫%
                </span>
              </div>

              {/* Hazard Banner Tag */}
              <div
                style={{
                  position: "absolute",
                  top: "12px",
                  left: "12px",
                  background: "rgba(185, 28, 28, 0.9)",
                  border: "1px solid #ef4444",
                  borderRadius: "20px",
                  padding: "0.25rem 0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.8rem",
                  color: "#fecaca",
                  fontWeight: 800,
                }}
              >
                <span>🚨</span> বিপদজনক বাধার সনাক্তকরণ (Dhaka Hazard Detector)
              </div>
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                className={`camera-video ${cameraStatus === "active" ? "video-active" : "video-hidden"}`}
                aria-label="লাইভ ক্যামেরা প্রিভিউ"
              />
              {cameraStatus !== "active" && (
                <div className="camera-placeholder" aria-hidden="true">
                  <span className="placeholder-icon">📷</span>
                  <p>{statusMessage}</p>
                </div>
              )}

              {/* Overlay Status Badge */}
              {cameraStatus === "active" && (
                <div
                  style={{
                    position: "absolute",
                    top: "12px",
                    left: "12px",
                    background: "rgba(15, 23, 42, 0.85)",
                    border: "1px solid #10b981",
                    borderRadius: "20px",
                    padding: "0.25rem 0.75rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontSize: "0.8rem",
                    color: "#6ee7b7",
                    fontWeight: 700,
                  }}
                >
                  <span className="camera-status-dot dot-active" style={{ width: "8px", height: "8px" }} />
                  লাইভ ক্যামেরা সচল
                </div>
              )}
            </>
          )}

          {/* Active AI Mode Banner */}
          <div
            style={{
              position: "absolute",
              top: "12px",
              right: "12px",
              background: "rgba(15, 23, 42, 0.85)",
              border: "1px solid var(--accent-cyan)",
              borderRadius: "20px",
              padding: "0.25rem 0.75rem",
              fontSize: "0.8rem",
              color: "var(--accent-cyan)",
              fontWeight: 700,
            }}
          >
            {isHazardDemoActive
              ? "⚠️ অবজেক্ট ও গর্ত অ্যালার্ট"
              : selectedMode === "objects"
              ? "🔍 অবজেক্ট ডিটেকশন মোড"
              : selectedMode === "ocr"
              ? "📖 ওসিআর রিডার মোড"
              : selectedMode === "qa"
              ? "🤖 মাল্টিমোডাল এআই মোড"
              : "💵 টাকা স্ক্যানার মোড"}
          </div>
        </div>

        {/* QA Question Prompt Field (Only shown in QA mode) */}
        {selectedMode === "qa" && (
          <div
            style={{
              background: "var(--bg-surface-raised)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "10px",
              padding: "0.75rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
            }}
          >
            <label
              htmlFor="camera-qa-input"
              style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--accent-cyan)" }}
            >
              ভিজ্যুয়াল এআই-কে কী জিজ্ঞেস করতে চান?
            </label>
            <input
              id="camera-qa-input"
              type="text"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="যেমন: এই ওষুধের নাম কী? বা সামনে কী আছে?"
              style={{
                padding: "0.6rem 0.85rem",
                borderRadius: "8px",
                border: "2px solid var(--border-strong)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                fontSize: "0.95rem",
              }}
            />
            {/* Quick Question Pills */}
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => setCustomQuestion("আমার সামনে কী রয়েছে বিস্তারিত ব্যাখ্যা করো")}
                style={{
                  fontSize: "0.78rem",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "15px",
                  background: "rgba(56, 189, 248, 0.15)",
                  border: "1px solid #38bdf8",
                  color: "#e0f2fe",
                  cursor: "pointer",
                }}
              >
                সামনে কী আছে?
              </button>
              <button
                type="button"
                onClick={() => setCustomQuestion("এই ওষুধের নাম, শক্তি ও নির্দেশনা কী?")}
                style={{
                  fontSize: "0.78rem",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "15px",
                  background: "rgba(56, 189, 248, 0.15)",
                  border: "1px solid #38bdf8",
                  color: "#e0f2fe",
                  cursor: "pointer",
                }}
              >
                ওষুধের নাম ও ডোজ?
              </button>
              <button
                type="button"
                onClick={() => setCustomQuestion("সামনে কোনো বাধা, সিঁড়ি বা দরজা আছে কি?")}
                style={{
                  fontSize: "0.78rem",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "15px",
                  background: "rgba(56, 189, 248, 0.15)",
                  border: "1px solid #38bdf8",
                  color: "#e0f2fe",
                  cursor: "pointer",
                }}
              >
                বাধা বা সিঁড়ি আছে?
              </button>
            </div>
          </div>
        )}

        {/* Live AI Analysis Results Card */}
        {aiResult && (
          <div
            style={{
              background: "linear-gradient(135deg, rgba(6, 78, 59, 0.35), rgba(15, 23, 42, 0.9))",
              border: "2px solid #10b981",
              borderRadius: "12px",
              padding: "1rem 1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.6rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span
                  style={{
                    background: "#064e3b",
                    color: "#6ee7b7",
                    border: "1px solid #10b981",
                    borderRadius: "6px",
                    padding: "0.2rem 0.6rem",
                    fontSize: "0.78rem",
                    fontWeight: 800,
                  }}
                >
                  {aiResult.sourceBadge}
                </span>
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                  {aiResult.engineName}
                </span>
              </div>
              {aiResult.confidence !== null && (
                <span style={{ fontSize: "0.85rem", color: "#34d399", fontWeight: 700 }}>
                  নির্ভুলতা: {toBengaliDigits(Math.round(aiResult.confidence * 100))}%
                </span>
              )}
            </div>

            <p style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700, color: "#f8fafc", lineHeight: 1.5 }}>
              {aiResult.messageBn}
            </p>

            <div style={{ display: "flex", gap: "0.6rem", marginTop: "0.25rem" }}>
              <button
                type="button"
                onClick={() => speak(aiResult.messageBn)}
                className="demo-quick-btn secondary"
                style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem" }}
              >
                🔊 পুনরায় শুনুন
              </button>
              <button
                type="button"
                onClick={() => runAiAnalysis()}
                className="demo-quick-btn primary"
                style={{ fontSize: "0.85rem", padding: "0.35rem 0.75rem" }}
              >
                🔄 আবার ফ্রেম স্ক্যান করুন
              </button>
            </div>
          </div>
        )}

        {/* Smart Cane Frame & Analysis Card */}
        {caneVisionResult && (
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "0.5rem",
              background: "rgba(15, 23, 42, 0.8)",
              border: "1px solid #38bdf8",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.4rem" }}>
              <span style={{ fontSize: "1.2rem" }}>🦯</span>
              <strong style={{ color: "#38bdf8", fontSize: "0.95rem" }}>
                স্মার্ট ক্যান ক্যামেরা ফ্রেম (Smart Cane Snapshot):
              </strong>
            </div>
            {caneVisionResult.imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={caneVisionResult.imageUrl}
                alt="স্মার্ট ক্যান ফ্রেম"
                style={{
                  width: "100%",
                  maxHeight: "180px",
                  objectFit: "cover",
                  borderRadius: "0.4rem",
                  marginBottom: "0.5rem",
                  border: "1px solid #334155",
                }}
              />
            )}
            <p style={{ margin: 0, fontSize: "0.9rem", color: "#f8fafc", fontWeight: 600 }}>
              {caneVisionResult.spokenSummaryBn}
            </p>
          </div>
        )}

        {/* Analysis Status Progress */}
        {analysisStatusText && (
          <div className="capture-feedback-box" role="status" aria-live="polite">
            <span aria-hidden="true">⏳ </span>
            {analysisStatusText}
          </div>
        )}

        {/* Main Controls Row */}
        <div className="camera-controls-row">
          {cameraStatus !== "active" ? (
            <button
              type="button"
              onClick={handleStart}
              onTouchStart={() => speakTouch("ক্যামেরা চালু করুন বোতাম")}
              onMouseEnter={() => speakTouch("ক্যামেরা চালু করুন বোতাম")}
              className="camera-action-btn btn-start"
            >
              📷 ক্যামেরা চালু করুন
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              onTouchStart={() => speakTouch("ক্যামেরা বন্ধ করুন বোতাম")}
              onMouseEnter={() => speakTouch("ক্যামেরা বন্ধ করুন বোতাম")}
              className="camera-action-btn btn-stop"
            >
              ✕ ক্যামেরা বন্ধ করুন
            </button>
          )}

          <button
            type="button"
            onClick={() => runAiAnalysis()}
            onTouchStart={() => speakTouch("ছবি তুলুন ও এআই সনাক্তকরণ বোতাম")}
            onMouseEnter={() => speakTouch("ছবি তুলুন ও এআই সনাক্তকরণ বোতাম")}
            disabled={cameraStatus !== "active" || isAnalyzing}
            className="camera-action-btn btn-capture"
            style={{
              background: isAnalyzing ? "#334155" : "linear-gradient(135deg, #059669, #0284c7)",
              color: "#ffffff",
              cursor: cameraStatus !== "active" || isAnalyzing ? "not-allowed" : "pointer",
            }}
          >
            {isAnalyzing
              ? "⏳ এআই বিশ্লেষণ চলছে..."
              : selectedMode === "objects"
              ? "⚡ ছবি তুলুন ও বস্তু সনাক্ত করুন"
              : selectedMode === "ocr"
              ? "⚡ ছবি তুলুন ও লেখা পড়ুন"
              : selectedMode === "qa"
              ? "⚡ ছবি তুলুন ও এআই উত্তর শুনুন"
              : "⚡ ছবি তুলুন ও টাকা চিনুন"}
          </button>
        </div>

        {/* AI Information Footer */}
        <div
          style={{
            fontSize: "0.82rem",
            color: "var(--text-muted)",
            borderTop: "1px solid var(--border-subtle)",
            paddingTop: "0.6rem",
            display: "flex",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <span>⚡ MediaPipe EfficientDet-Lite0 (অন-ডিভাইস)</span>
          <span>📑 Tesseract OCR (ben+eng)</span>
          <span>🧠 Google Gemini 2.5 Flash Vision</span>
        </div>
      </div>
    </section>
  );
}
