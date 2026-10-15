"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import {
  isNativeAvailable,
  startWalkWithMe,
  stopWalkWithMe,
  triggerHaptic,
  subscribeNavTick,
  NavTickData,
} from "@/lib/native/bridge";
import { detectObjects } from "@/lib/tools/objects";
import { speak, speakTouch } from "@/lib/tools/speech";
import { toBengaliDigits } from "@/lib/storage/geofenceStore";

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
  const [aiGuidanceBn, setAiGuidanceBn] = useState<string>(
    "পথচলা সহকারী প্রস্তুত। গন্তব্য নির্বাচন করে 'পথচলা শুরু করুন' বাটনে চাপ দিন।"
  );
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);

  // Live GPS Coords (Defaults to central Dhaka until GPS locks)
  const [userCoords, setUserCoords] = useState<[number, number]>([23.728, 90.401]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const visionTimerRef = useRef<NodeJS.Timeout | null>(null);
  const guidanceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const destMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const polylineRef = useRef<any>(null);

  const nativeActive = typeof window !== "undefined" && isNativeAvailable();

  // 1. Live Camera Stream for Vision Obstacle Detection
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
        console.warn("Camera for Pothchola mode could not be opened:", err);
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

  // 2. Real-Time Geolocation Watcher
  useEffect(() => {
    if (!isOpen || typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserCoords([latitude, longitude]);
      },
      (err) => console.warn("GPS Watch error:", err),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isOpen]);

  // 3. Leaflet Map Initialization and Dynamic Marker Updates
  useEffect(() => {
    if (!isOpen || typeof window === "undefined" || !mapContainerRef.current) return;

    let isSubscribed = true;

    async function initLeaflet() {
      const L = (await import("leaflet")).default;
      if (!isSubscribed || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        // Create custom SVG DivIcons for accessibility
        const userIcon = L.divIcon({
          className: "pothchola-user-marker",
          html: `<div style="
            background: #0284c7;
            border: 3px solid #ffffff;
            box-shadow: 0 0 14px #38bdf8;
            width: 26px;
            height: 26px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: 14px;
          ">🚶</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });

        const destIcon = L.divIcon({
          className: "pothchola-dest-marker",
          html: `<div style="
            background: #dc2626;
            border: 3px solid #ffffff;
            box-shadow: 0 0 14px #f87171;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #ffffff;
            font-size: 16px;
          ">📍</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
        });

        // Initialize Map
        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView(userCoords, 16);

        // High contrast accessible dark tiles
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
        }).addTo(map);

        userMarkerRef.current = L.marker(userCoords, { icon: userIcon })
          .addTo(map)
          .bindPopup("<b>আপনার বর্তমান অবস্থান</b>");

        destMarkerRef.current = L.marker([selectedPreset.lat, selectedPreset.lng], { icon: destIcon })
          .addTo(map)
          .bindPopup(`<b>গন্তব্য: ${selectedPreset.nameBn}</b>`);

        polylineRef.current = L.polyline([userCoords, [selectedPreset.lat, selectedPreset.lng]], {
          color: "#38bdf8",
          weight: 4,
          dashArray: "8, 8",
        }).addTo(map);

        mapInstanceRef.current = map;
      } else {
        // Update existing map markers and route line
        const map = mapInstanceRef.current;
        if (userMarkerRef.current) {
          userMarkerRef.current.setLatLng(userCoords);
        }
        if (destMarkerRef.current) {
          destMarkerRef.current.setLatLng([selectedPreset.lat, selectedPreset.lng]);
          destMarkerRef.current.setPopupContent(`<b>গন্তব্য: ${selectedPreset.nameBn}</b>`);
        }
        if (polylineRef.current) {
          polylineRef.current.setLatLngs([userCoords, [selectedPreset.lat, selectedPreset.lng]]);
        }
        map.panTo(userCoords);
      }
    }

    initLeaflet();

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, userCoords, selectedPreset]);

  // Cleanup map instance on close
  useEffect(() => {
    if (!isOpen && mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      userMarkerRef.current = null;
      destMarkerRef.current = null;
      polylineRef.current = null;
    }
  }, [isOpen]);

  // 4. Subscribe to continuous navigation updates from native Kotlin service or web fallback
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = subscribeNavTick((data) => {
      setNavData(data);
    });

    return () => {
      unsubscribe();
    };
  }, [isOpen]);

  // 5. Intelligent Gemini Command & Bengali Audio Guidance Generator
  const generateGeminiAudioGuidance = useCallback(
    async (obstacleText: string | null) => {
      setIsGeneratingGuidance(true);

      const destName = selectedPreset.nameBn;
      const distance = navData ? Math.round(navData.distanceMeters) : 45;
      const steps = navData ? Math.round(navData.distanceMeters * 1.3) : 60;
      const clockDir = navData?.clockDirection || "একদম সোজা সামনে চলুন";

      const apiKey =
        (typeof window !== "undefined" && localStorage.getItem("drishti.gemini_api_key.v1")) ||
        process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
        "";

      // Attempt Cloud Gemini Flash Multimodal Command
      if (apiKey && typeof navigator !== "undefined" && navigator.onLine) {
        try {
          const prompt = `You are পথচলা (Pothchola), an empathetic assistive walking audio guide for a blind person in Bangladesh. The user cannot see anything and relies 100% on your spoken audio.
Destination: ${destName}.
Distance: ${distance} meters (${steps} steps).
Direction: ${clockDir}.
Camera obstacles detected in front: ${obstacleText || "সামনে কোনো বাধা নেই, পথ পরিষ্কার"}.

Respond with exactly ONE concise, spoken sentence in polite natural Bengali giving direct, safe step-by-step walking guidance (e.g., 'একদম সোজা ২০ কদম এগিয়ে চলুন, বামে একটি চেয়ার রয়েছে তাই সামান্য ডানদিক ঘেঁষে হাঁটুন।'). Do NOT use clock numbers like ১২টা or ৩টা. Use pure, natural Bengali directional phrases like 'সোজা সামনে চলুন', 'সামান্য ডান ঘেঁষে চলুন', 'বাঁয়ে ঘুরুন', 'ডানে ঘুরুন'. Do NOT use markdown asterisks or quotes.`;

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 120 },
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text) {
              const cleanAnswer = text.replace(/[*_#`~[\]]/g, "").trim();
              setAiGuidanceBn(cleanAnswer);
              speak(cleanAnswer);
              setIsGeneratingGuidance(false);
              return;
            }
          }
        } catch {
          // Fall through to local fallback
        }
      }

      // Local Rule-Based Speech Fallback
      let fallbackText = "";
      if (obstacleText && !obstacleText.includes("কিছু চিনতে পারিনি")) {
        fallbackText = `${clockDir} প্রায় ${toBengaliDigits(distance)} মিটার বা ${toBengaliDigits(
          steps
        )} কদম চলুন। সাবধান, ${obstacleText}।`;
      } else {
        fallbackText = `${clockDir} প্রায় ${toBengaliDigits(distance)} মিটার বা ${toBengaliDigits(
          steps
        )} কদম এগিয়ে চলুন। সামনে পথ পরিষ্কার।`;
      }

      setAiGuidanceBn(fallbackText);
      speak(fallbackText);
      setIsGeneratingGuidance(false);
    },
    [selectedPreset.nameBn, navData]
  );

  // 6. Vision scanner loop: periodically check for obstacles in front of the camera
  const runObstacleScan = useCallback(async () => {
    if (!videoRef.current || videoRef.current.readyState < 2) return;

    try {
      const result = await detectObjects({ imageSource: videoRef.current });
      if (result.status === "success" && result.message_bn) {
        setDetectedObstacle(result.message_bn);
        if (result.message_bn.includes("সামনে") || result.message_bn.includes("মাঝখানে")) {
          triggerHaptic("obstacle_alert");
        }
        generateGeminiAudioGuidance(result.message_bn);
      } else {
        setDetectedObstacle(null);
        generateGeminiAudioGuidance(null);
      }
    } catch (e) {
      console.warn("Vision scan tick error:", e);
    }
  }, [generateGeminiAudioGuidance]);

  // Periodic navigation guidance & obstacle checks when walking
  useEffect(() => {
    if (isWalking && isVisionScanning) {
      visionTimerRef.current = setInterval(runObstacleScan, 6000);
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
      if (guidanceTimerRef.current) {
        clearInterval(guidanceTimerRef.current);
        guidanceTimerRef.current = null;
      }
    };
  }, [isWalking, isVisionScanning, runObstacleScan]);

  const handleToggleWalking = () => {
    if (isWalking) {
      stopWalkWithMe();
      setIsWalking(false);
      const stopMsg = "পথচলা মোড বন্ধ করা হয়েছে।";
      setAiGuidanceBn(stopMsg);
      speak(stopMsg);
    } else {
      startWalkWithMe(selectedPreset.lat, selectedPreset.lng, selectedPreset.nameBn);
      setIsWalking(true);
      const startMsg = `পথচলা শুরু হয়েছে। গন্তব্য: ${selectedPreset.nameBn}। লাইভ ম্যাপ ও ক্যামেরা ভিশন দিকনির্দেশনা শুনুন।`;
      setAiGuidanceBn(startMsg);
      speak(startMsg);
      // Run first scan and guidance
      setTimeout(() => {
        runObstacleScan();
      }, 1000);
    }
  };

  const handleAnnounceDirection = () => {
    speak(aiGuidanceBn);
  };

  const handleClose = () => {
    if (isWalking) {
      stopWalkWithMe();
      setIsWalking(false);
    }
    onClose();
  };

  if (!isOpen) return null;

  const distanceSteps = navData ? Math.round(navData.distanceMeters * 1.3) : 60;
  const distanceMeters = navData ? Math.round(navData.distanceMeters) : 45;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pothchola-modal-title"
      aria-describedby="pothchola-modal-desc"
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.9)",
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
          border: "3px solid #38BDF8",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "620px",
          maxHeight: "92vh",
          overflowY: "auto",
          padding: "20px",
          color: "#F8FAFC",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.7)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div>
            <h2 id="pothchola-modal-title" style={{ fontSize: "22px", fontWeight: 800, margin: 0, color: "#38BDF8", display: "flex", alignItems: "center", gap: "8px" }}>
              <span>🚶‍♂️</span> পথচলা (Pothchola) — অন্ধ সহচর
            </h2>
            <p id="pothchola-modal-desc" style={{ fontSize: "13px", color: "#94A3B8", marginTop: "3px" }}>
              লাইভ জিপিএস (Leaflet Map) + ক্যামেরা ভিশন + জেমিনাই এআই অডিও দিকনির্দেশনা
            </p>
          </div>
          <button
            onClick={handleClose}
            onTouchStart={() => speakTouch("পথচলা প্যানেল বন্ধ করুন")}
            onMouseEnter={() => speakTouch("পথচলা প্যানেল বন্ধ করুন")}
            onFocus={() => speakTouch("পথচলা প্যানেল বন্ধ করুন")}
            aria-label="পথচলা প্যানেল বন্ধ করুন"
            style={{
              background: "#334155",
              color: "#FFF",
              border: "none",
              borderRadius: "8px",
              padding: "8px 14px",
              fontSize: "15px",
              cursor: "pointer",
              minHeight: "44px",
              minWidth: "44px",
              fontWeight: 700,
            }}
          >
            ✕ বন্ধ
          </button>
        </div>

        {/* Live Bengali Audio Announcement Banner */}
        <div
          role="region"
          aria-live="assertive"
          style={{
            background: "linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(6, 78, 59, 0.35))",
            border: "2px solid #38BDF8",
            borderRadius: "12px",
            padding: "14px 16px",
            marginBottom: "16px",
            boxShadow: "0 4px 14px rgba(56, 189, 248, 0.2)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#38BDF8", display: "flex", alignItems: "center", gap: "6px" }}>
              <span>📢</span> এআই লাইভ অডিও নির্দেশনা:
            </span>
            <span style={{ fontSize: "11px", color: "#6EE7B7", background: "#064E3B", padding: "2px 8px", borderRadius: "10px" }}>
              {isGeneratingGuidance ? "⏳ তৈরি হচ্ছে..." : "🔊 স্বয়ংক্রিয় অডিও সক্রিয়"}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#FFFFFF", lineHeight: 1.5 }}>
            {aiGuidanceBn}
          </p>
        </div>

        {/* Leaflet Live Location Map Container */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#CBD5E1" }}>
              🗺️ লাইভ ম্যাপ ও রুট ট্র্যাকিং (Leaflet):
            </span>
            <span style={{ fontSize: "11px", color: "#94A3B8" }}>
              {nativeActive ? "🦯 কেইন ব্রিজ সক্রিয়" : "📱 ব্রাউজার জিপিএস"} • {userCoords[0].toFixed(4)}, {userCoords[1].toFixed(4)}
            </span>
          </div>
          <div
            id="pothchola-map"
            ref={mapContainerRef}
            style={{
              width: "100%",
              height: "200px",
              borderRadius: "12px",
              border: "2px solid #334155",
              overflow: "hidden",
              background: "#020617",
            }}
          />
        </div>

        {/* Destination Presets */}
        <div style={{ marginBottom: "16px" }}>
          <label style={{ display: "block", fontSize: "14px", fontWeight: 700, marginBottom: "6px", color: "#E2E8F0" }}>
            গন্তব্য নির্বাচন করুন:
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setSelectedPreset(preset);
                  speakTouch(`গন্তব্য নির্বাচিত হয়েছে: ${preset.nameBn}`);
                }}
                onTouchStart={() => speakTouch(`গন্তব্য: ${preset.nameBn}`)}
                onMouseEnter={() => speakTouch(`গন্তব্য: ${preset.nameBn}`)}
                onFocus={() => speakTouch(`গন্তব্য: ${preset.nameBn}`)}
                style={{
                  background: selectedPreset.id === preset.id ? "#1E293B" : "#0F172A",
                  border: `2px solid ${selectedPreset.id === preset.id ? "#38BDF8" : "#334155"}`,
                  borderRadius: "10px",
                  padding: "8px 12px",
                  color: "#FFF",
                  textAlign: "left",
                  cursor: "pointer",
                  minHeight: "44px",
                }}
              >
                <div style={{ fontWeight: "bold", fontSize: "14px" }}>{preset.nameBn}</div>
                <div style={{ fontSize: "11px", color: "#94A3B8" }}>{preset.nameEn}</div>
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
            marginBottom: "16px",
            border: "1px solid #334155",
            height: "150px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "150px", objectFit: "cover" }}
          />

          {/* Overlay Vision Badge */}
          <div
            style={{
              position: "absolute",
              top: "8px",
              left: "8px",
              background: "rgba(15, 23, 42, 0.85)",
              color: "#38BDF8",
              padding: "4px 8px",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: "bold",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>👁️</span> ভিশন বাধা স্ক্যানার (MediaPipe)
          </div>

          {detectedObstacle && (
            <div
              style={{
                position: "absolute",
                bottom: "8px",
                left: "8px",
                right: "8px",
                background: "rgba(0, 0, 0, 0.88)",
                border: "1px solid #F59E0B",
                color: "#FDE68A",
                padding: "6px 10px",
                borderRadius: "8px",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              ⚠️ {detectedObstacle}
            </div>
          )}
        </div>

        {/* Navigation Telemetry Cards */}
        <div
          style={{
            background: "#1E293B",
            borderRadius: "12px",
            padding: "12px 14px",
            marginBottom: "16px",
            border: "1px solid #475569",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "8px",
            textAlign: "center",
          }}
        >
          <div>
            <span style={{ fontSize: "11px", color: "#94A3B8", display: "block" }}>দিকনির্দেশনা</span>
            <strong style={{ fontSize: "15px", color: "#F8FAFC" }}>
              {navData?.clockDirection || "একদম সোজা সামনে"}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: "11px", color: "#94A3B8", display: "block" }}>দূরত্ব</span>
            <strong style={{ fontSize: "15px", color: "#38BDF8" }}>
              {toBengaliDigits(distanceMeters)} মিটার
            </strong>
          </div>
          <div>
            <span style={{ fontSize: "11px", color: "#94A3B8", display: "block" }}>হাঁটার কদম</span>
            <strong style={{ fontSize: "15px", color: "#34D399" }}>
              {toBengaliDigits(distanceSteps)} কদম
            </strong>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <button
            type="button"
            onClick={handleToggleWalking}
            onTouchStart={() => speakTouch(isWalking ? "পথচলা থামান" : "পথচলা শুরু করুন")}
            onMouseEnter={() => speakTouch(isWalking ? "পথচলা থামান" : "পথচলা শুরু করুন")}
            onFocus={() => speakTouch(isWalking ? "পথচলা থামান" : "পথচলা শুরু করুন")}
            style={{
              background: isWalking ? "#DC2626" : "linear-gradient(135deg, #059669, #0284c7)",
              color: "#FFF",
              border: "none",
              borderRadius: "12px",
              padding: "12px",
              fontSize: "17px",
              fontWeight: 800,
              cursor: "pointer",
              minHeight: "50px",
              boxShadow: "0 4px 12px rgba(0, 0, 0, 0.4)",
            }}
          >
            {isWalking ? "⏹ পথচলা থামান (Stop Walk)" : "▶ পথচলা শুরু করুন (Start Pothchola)"}
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button
              type="button"
              onClick={handleAnnounceDirection}
              onTouchStart={() => speakTouch("দিকনির্দেশনা পুনরায় শুনুন")}
              onMouseEnter={() => speakTouch("দিকনির্দেশনা পুনরায় শুনুন")}
              onFocus={() => speakTouch("দিকনির্দেশনা পুনরায় শুনুন")}
              style={{
                background: "#334155",
                color: "#F8FAFC",
                border: "1px solid #475569",
                borderRadius: "10px",
                padding: "10px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              🔊 দিক শুনুন (Speech)
            </button>
            <button
              type="button"
              onClick={runObstacleScan}
              onTouchStart={() => speakTouch("বাধা স্ক্যান ও এআই গাইড")}
              onMouseEnter={() => speakTouch("বাধা স্ক্যান ও এআই গাইড")}
              onFocus={() => speakTouch("বাধা স্ক্যান ও এআই গাইড")}
              style={{
                background: "#334155",
                color: "#F8FAFC",
                border: "1px solid #475569",
                borderRadius: "10px",
                padding: "10px",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              🔍 স্ক্যান ও গাইড
            </button>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              fontSize: "13px",
              color: "#94A3B8",
              cursor: "pointer",
              marginTop: "4px",
            }}
          >
            <input
              type="checkbox"
              checked={isVisionScanning}
              onChange={(e) => setIsVisionScanning(e.target.checked)}
              style={{ width: "16px", height: "16px" }}
            />
            স্বয়ংক্রিয় ভিশন ও বাধা সতর্কতা সক্রিয় রাখুন
          </label>
        </div>
      </div>
    </div>
  );
}
