"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  isNativeAvailable,
  startWalkWithMe,
  stopWalkWithMe,
  triggerHaptic,
  subscribeNavTick,
  NavTickData,
} from "@/lib/native/bridge";
import { detectObjects } from "@/lib/tools/objects";
import { speak } from "@/lib/tools/speech";

interface WalkWithMeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface DestinationPreset {
  id: string;
  nameBn: string;
  nameEn: string;
  lat: number;
  lng: number;
}

const PRESETS: DestinationPreset[] = [
  { id: "pharmacy", nameBn: "নিকটস্থ ফার্মেসি", nameEn: "Pharmacy", lat: 23.7285, lng: 90.4025 },
  { id: "bus_stop", nameBn: "বাস স্টপেজ", nameEn: "Bus Stop", lat: 23.7292, lng: 90.3995 },
  { id: "hospital", nameBn: "হাসপাতাল", nameEn: "Hospital", lat: 23.7310, lng: 90.4030 },
  { id: "home", nameBn: "বাসস্থান (Home)", nameEn: "Home", lat: 23.7270, lng: 90.4010 },
];

export default function WalkWithMeModal({ isOpen, onClose }: WalkWithMeModalProps) {
  const [isWalking, setIsWalking] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<DestinationPreset>(PRESETS[0]);
  const [navData, setNavData] = useState<NavTickData | null>(null);
  const [detectedObstacle, setDetectedObstacle] = useState<string | null>(null);
  const [isVisionScanning, setIsVisionScanning] = useState(true);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const visionTimerRef = useRef<NodeJS.Timeout | null>(null);

  const nativeActive = typeof window !== "undefined" && isNativeAvailable();

  // Handle live camera stream for vision obstacle detection
  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      return;
    }

    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices?.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (stream && videoRef.current) {
          videoRef.current.srcObject = stream;
          streamRef.current = stream;
        }
      } catch (err) {
        console.warn("Camera for Walk With Me mode could not be opened:", err);
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  // Subscribe to continuous navigation updates from native Kotlin service or web fallback
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = subscribeNavTick((data) => {
      setNavData(data);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  // Vision scanner loop: periodically check for obstacles in front of the camera
  const runObstacleScan = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) return;

    try {
      const result = await detectObjects({ imageSource: videoRef.current });
      if (result.status === "success" && result.message_bn) {
        setDetectedObstacle(result.message_bn);
        if (result.message_bn.includes("সামনে")) {
          triggerHaptic("obstacle_alert");
          speak(`সাবধান: ${result.message_bn}`);
        }
      }
    } catch (e) {
      console.warn("Vision scan tick error:", e);
    }
  }, []);

  useEffect(() => {
    if (isWalking && isVisionScanning) {
      visionTimerRef.current = setInterval(runObstacleScan, 4000);
    } else {
      if (visionTimerRef.current) {
        clearInterval(visionTimerRef.current);
        visionTimerRef.current = null;
      }
    }

    return () => {
      if (visionTimerRef.current) {
        clearInterval(visionTimerRef.current);
        visionTimerRef.current = null;
      }
    };
  }, [isWalking, isVisionScanning, runObstacleScan]);

  const handleToggleWalking = () => {
    if (isWalking) {
      stopWalkWithMe();
      setIsWalking(false);
      const stopMsg = "হাঁটার সঙ্গী মোড বন্ধ করা হয়েছে।";
      speak(stopMsg);
    } else {
      startWalkWithMe(selectedPreset.lat, selectedPreset.lng, selectedPreset.nameBn);
      setIsWalking(true);
      const startMsg = `হাঁটার সঙ্গী সক্রিয় হয়েছে। গন্তব্য: ${selectedPreset.nameBn}। ক্যামেরা ও জিপিএস নির্দেশিকা চালু রয়েছে।`;
      speak(startMsg);
    }
  };

  const handleAnnounceDirection = () => {
    if (!navData) {
      speak("জিপিএস অবস্থান সংগ্রহ করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন।");
      return;
    }

    const steps = Math.round(navData.distanceMeters * 1.3);
    const speech = `গন্তব্য ${navData.destName || selectedPreset.nameBn}। দূরত্ব প্রায় ${Math.round(
      navData.distanceMeters
    )} মিটার বা ${steps} কদম। ${navData.clockDirection}।`;
    speak(speech);
  };

  const handleClose = () => {
    if (isWalking) {
      stopWalkWithMe();
      setIsWalking(false);
    }
    onClose();
  };

  if (!isOpen) return null;

  const distanceSteps = navData ? Math.round(navData.distanceMeters * 1.3) : 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="walk-modal-title"
      aria-describedby="walk-modal-desc"
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.88)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        padding: "16px",
      }}
    >
      <div
        className="modal-card"
        style={{
          background: "#0F172A",
          border: "2px solid #38BDF8",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "580px",
          maxHeight: "90vh",
          overflowY: "auto",
          padding: "24px",
          color: "#F8FAFC",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
          <div>
            <h2 id="walk-modal-title" style={{ fontSize: "24px", fontWeight: "bold", margin: 0, color: "#38BDF8" }}>
              হাঁটার সঙ্গী (Walk With Me)
            </h2>
            <p id="walk-modal-desc" style={{ fontSize: "14px", color: "#94A3B8", marginTop: "4px" }}>
              কোটলিন নেটিভ জিপিএস + কম্পাস দিকনির্দেশনা ও কম্পিউটার ভিশন
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="প্যানেল বন্ধ করুন"
            style={{
              background: "#334155",
              color: "#FFF",
              border: "none",
              borderRadius: "8px",
              padding: "8px 14px",
              fontSize: "16px",
              cursor: "pointer",
              minHeight: "44px",
              minWidth: "44px",
            }}
          >
            ✕ বন্ধ
          </button>
        </div>

        {/* Native Layer Status Badge */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            background: nativeActive ? "#064E3B" : "#451A03",
            color: nativeActive ? "#6EE7B7" : "#FCD34D",
            border: `1px solid ${nativeActive ? "#059669" : "#D97706"}`,
            borderRadius: "20px",
            padding: "6px 14px",
            fontSize: "13px",
            fontWeight: "600",
            marginBottom: "20px",
          }}
        >
          <span style={{ fontSize: "16px" }}>{nativeActive ? "🟢" : "🟡"}</span>
          <span>
            {nativeActive
              ? "KOTLIN NATIVE SERVICE ACTIVE (Screen-off GPS & Compass)"
              : "WEB EMULATION MODE (Browser GPS & Orientation API)"}
          </span>
        </div>

        {/* Destination Presets */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ display: "block", fontSize: "15px", fontWeight: "600", marginBottom: "8px", color: "#E2E8F0" }}>
            গন্তব্য নির্বাচন করুন:
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setSelectedPreset(preset)}
                style={{
                  background: selectedPreset.id === preset.id ? "#1E293B" : "#0F172A",
                  border: `2px solid ${selectedPreset.id === preset.id ? "#38BDF8" : "#334155"}`,
                  borderRadius: "10px",
                  padding: "10px 12px",
                  color: "#FFF",
                  textAlign: "left",
                  cursor: "pointer",
                  minHeight: "48px",
                }}
              >
                <div style={{ fontWeight: "bold", fontSize: "15px" }}>{preset.nameBn}</div>
                <div style={{ fontSize: "12px", color: "#94A3B8" }}>{preset.nameEn}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Vision Feed & Obstacle Detection Container */}
        <div
          style={{
            position: "relative",
            background: "#000",
            borderRadius: "12px",
            overflow: "hidden",
            marginBottom: "20px",
            border: "1px solid #334155",
            minHeight: "180px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "180px", objectFit: "cover" }}
          />

          {/* Overlay Vision Badge */}
          <div
            style={{
              position: "absolute",
              top: "10px",
              left: "10px",
              background: "rgba(15, 23, 42, 0.85)",
              color: "#38BDF8",
              padding: "4px 10px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span>👁️</span> ভিশন বাধা স্ক্যানার (Vision Scanner)
          </div>

          {detectedObstacle && (
            <div
              style={{
                position: "absolute",
                bottom: "10px",
                left: "10px",
                right: "10px",
                background: "rgba(0, 0, 0, 0.85)",
                border: "1px solid #F59E0B",
                color: "#FDE68A",
                padding: "8px 12px",
                borderRadius: "8px",
                fontSize: "13px",
              }}
            >
              <strong>শনাক্ত:</strong> {detectedObstacle}
            </div>
          )}
        </div>

        {/* Live Nav & Telemetry Card */}
        <div
          style={{
            background: "#1E293B",
            borderRadius: "12px",
            padding: "16px",
            marginBottom: "20px",
            border: "1px solid #475569",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontSize: "14px", color: "#94A3B8" }}>লাইভ দিকনির্দেশনা (Navigation):</span>
            <span style={{ fontSize: "12px", color: "#38BDF8", fontWeight: "bold" }}>
              কম্পাস: {navData ? Math.round(navData.heading) : 0}°
            </span>
          </div>

          <div
            style={{
              fontSize: "22px",
              fontWeight: "bold",
              color: "#F8FAFC",
              marginBottom: "8px",
              letterSpacing: "0.5px",
            }}
          >
            {navData?.clockDirection || "১২টার দিকে সোজা চলুন"}
          </div>

          <div style={{ display: "flex", gap: "16px", fontSize: "15px", color: "#CBD5E1" }}>
            <div>
              দূরত্ব:{" "}
              <strong style={{ color: "#38BDF8" }}>
                {navData ? Math.round(navData.distanceMeters) : 0} মিটার
              </strong>
            </div>
            <div>
              পদক্ষেপ:{" "}
              <strong style={{ color: "#34D399" }}>
                {distanceSteps} কদম
              </strong>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button
            type="button"
            onClick={handleToggleWalking}
            style={{
              background: isWalking ? "#DC2626" : "#2563EB",
              color: "#FFF",
              border: "none",
              borderRadius: "12px",
              padding: "14px",
              fontSize: "18px",
              fontWeight: "bold",
              cursor: "pointer",
              minHeight: "54px",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.3)",
            }}
          >
            {isWalking ? "⏹ হাঁটা থামান (Stop Walk)" : "▶ হাঁটা শুরু করুন (Start Walk)"}
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button
              type="button"
              onClick={handleAnnounceDirection}
              style={{
                background: "#334155",
                color: "#F8FAFC",
                border: "1px solid #475569",
                borderRadius: "10px",
                padding: "12px",
                fontSize: "15px",
                fontWeight: "600",
                cursor: "pointer",
                minHeight: "48px",
              }}
            >
              🔊 দিক শুনুন (Speech)
            </button>
            <button
              type="button"
              onClick={runObstacleScan}
              style={{
                background: "#334155",
                color: "#F8FAFC",
                border: "1px solid #475569",
                borderRadius: "10px",
                padding: "12px",
                fontSize: "15px",
                fontWeight: "600",
                cursor: "pointer",
                minHeight: "48px",
              }}
            >
              🔍 বাধা স্ক্যান (Scan Obstacle)
            </button>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "14px",
              color: "#94A3B8",
              cursor: "pointer",
              marginTop: "4px",
            }}
          >
            <input
              type="checkbox"
              checked={isVisionScanning}
              onChange={(e) => setIsVisionScanning(e.target.checked)}
              style={{ width: "18px", height: "18px" }}
            />
            স্বয়ংক্রিয় ভিশন ও বাধা সতর্কতা সক্রিয় রাখুন
          </label>
        </div>
      </div>
    </div>
  );
}
