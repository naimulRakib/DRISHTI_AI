"use client";

import React, { useRef, useState, useEffect } from "react";
import {
  startCamera,
  stopCamera,
  captureFrame,
  CameraStatus,
} from "@/lib/tools/camera";

interface CameraPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture?: (imageData: ImageData) => void;
}

export default function CameraPanel({
  isOpen,
  onClose,
  onCapture,
}: CameraPanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string>(
    "ক্যামেরা বর্তমানে বন্ধ রয়েছে। চালু করতে নিচের বাটনে চাপ দিন।"
  );
  const [captureFeedback, setCaptureFeedback] = useState<string | null>(null);
  const [caneVisionResult, setCaneVisionResult] = useState<{
    imageUrl: string;
    spokenSummaryBn: string;
    timestamp: number;
  } | null>(null);

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
        setCaptureFeedback("🦯 স্মার্ট ক্যান থেকে নতুন ফ্রেম সফলভাবে বিশ্লেষণ করা হয়েছে।");
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

  const handleStart = async () => {
    if (!videoRef.current) return;

    setCameraStatus("starting");
    setStatusMessage("ক্যামেরা সংযোগ স্থাপন করা হচ্ছে...");
    setCaptureFeedback(null);

    const result = await startCamera(videoRef.current);

    if (result.success && result.stream) {
      streamRef.current = result.stream;
      setCameraStatus("active");
      setStatusMessage("ক্যামেরা সফলভাবে চালু হয়েছে। লাইভ ভিডিও দেখা যাচ্ছে।");
    } else if (result.error) {
      setCameraStatus("error");
      setStatusMessage(result.error.message_bn);
    }
  };

  const handleStop = () => {
    if (streamRef.current || videoRef.current) {
      stopCamera(streamRef.current, videoRef.current);
      streamRef.current = null;
    }
    setCameraStatus("idle");
    setStatusMessage("ক্যামেরা সম্পূর্ণভাবে বন্ধ করা হয়েছে।");
    setCaptureFeedback(null);
  };

  const handleCapture = () => {
    if (!videoRef.current || cameraStatus !== "active") return;

    const frame = captureFrame(videoRef.current);
    if (frame) {
      setCaptureFeedback(
        `একটি ফ্রেম সফলভাবে গৃহীত হয়েছে (${frame.width}×${frame.height} পিক্সেল)। ফ্রেমটি ডিভাইসের মেমরিতেই প্রক্রিয়াজাত হবে।`
      );
      onCapture?.(frame);
    } else {
      setCaptureFeedback("ফ্রেম গ্রহণ করা যায়নি। ক্যামেরা প্রস্তুত হওয়া পর্যন্ত অপেক্ষা করুন।");
    }
  };

  const handleClose = () => {
    handleStop();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <section
      aria-labelledby="camera-modal-title"
      className="camera-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="camera-modal-content">
        <div className="camera-modal-header">
          <h2 id="camera-modal-title">ক্যামেরা ভিউ ও ফ্রেম ক্যাপচার</h2>
          <button
            type="button"
            onClick={handleClose}
            className="settings-close-btn"
            aria-label="ক্যামেরা প্যানেল বন্ধ করুন"
          >
            ✕ বন্ধ করুন
          </button>
        </div>

        {/* Visible Camera Status with text */}
        <div className="camera-status-banner" role="status" aria-live="polite">
          <div className="camera-status-indicator">
            <span
              className={`camera-status-dot dot-${cameraStatus}`}
              aria-hidden="true"
            />
            <strong>
              {cameraStatus === "active" && "ক্যামেরা স্থিতি: সচল ও লাইভ (Camera Live)"}
              {cameraStatus === "starting" && "ক্যামেরা স্থিতি: চালু হচ্ছে... (Starting)"}
              {cameraStatus === "idle" && "ক্যামেরা স্থিতি: বন্ধ (Camera Off)"}
              {cameraStatus === "error" && "ক্যামেরা স্থিতি: ত্রুটি (Camera Error)"}
            </strong>
          </div>
          <p className="camera-status-text">{statusMessage}</p>
        </div>

        {/* Video Preview Container */}
        <div className="camera-preview-container">
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
              <p>ক্যামেরা বন্ধ রয়েছে</p>
            </div>
          )}
        </div>

        {/* Smart Cane Frame & Analysis Card */}
        {caneVisionResult && (
          <div
            style={{
              marginTop: "0.75rem",
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

        {/* Capture Feedback */}
        {captureFeedback && (
          <div className="capture-feedback-box" role="status" aria-live="polite">
            <span aria-hidden="true">✓ </span>
            {captureFeedback}
          </div>
        )}

        {/* Controls */}
        <div className="camera-controls-row">
          {cameraStatus !== "active" ? (
            <button
              type="button"
              onClick={handleStart}
              className="camera-action-btn btn-start"
            >
              ক্যামেরা চালু করুন
            </button>
          ) : (
            <button
              type="button"
              onClick={handleStop}
              className="camera-action-btn btn-stop"
            >
              ক্যামেরা বন্ধ করুন
            </button>
          )}

          <button
            type="button"
            onClick={handleCapture}
            disabled={cameraStatus !== "active"}
            className="camera-action-btn btn-capture"
          >
            ছবি তুলুন (ফ্রেম ক্যাপচার)
          </button>
        </div>
      </div>
    </section>
  );
}
