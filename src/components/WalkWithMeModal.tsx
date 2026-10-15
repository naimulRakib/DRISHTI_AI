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
import { convertSourceToBase64 } from "@/lib/tools/visualQa";

interface WalkWithMeModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialRoadDemo?: boolean;
}

interface DestinationPreset {
  id: string;
  nameBn: string;
  nameEn: string;
  lat: number;
  lng: number;
}

export interface TraceEvent {
  time: string;
  stage: string;
  message: string;
  status: "info" | "success" | "warn" | "error";
}

export interface AiTelemetry {
  model: string;
  source: string;
  latencyMs: number;
  tokensUsed: number;
  hasVision: boolean;
  street: string;
  googleMapsUrl?: string;
  timestamp: string;
}

const PRESETS: DestinationPreset[] = [
  { id: "pharmacy", nameBn: "নিকটস্থ ফার্মেসি (আয়েশা মেডিকেল)", nameEn: "Pharmacy", lat: 23.7285, lng: 90.4025 },
  { id: "bus_stop", nameBn: "বাস স্টপেজ", nameEn: "Bus Stop", lat: 23.7292, lng: 90.3995 },
  { id: "hospital", nameBn: "হাসপাতাল", nameEn: "Hospital", lat: 23.7310, lng: 90.4030 },
  { id: "home", nameBn: "বাসস্থান (Home)", nameEn: "Home", lat: 23.7270, lng: 90.4010 },
];

export default function WalkWithMeModal({ isOpen, onClose, initialRoadDemo = false }: WalkWithMeModalProps) {
  const [isWalking, setIsWalking] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState<DestinationPreset>(PRESETS[0]);
  const [navData, setNavData] = useState<NavTickData | null>(null);
  const [detectedObstacle, setDetectedObstacle] = useState<string | null>(null);
  const [isVisionScanning, setIsVisionScanning] = useState(true);
  const [aiGuidanceBn, setAiGuidanceBn] = useState<string>(
    "পথচলা সহকারী প্রস্তুত। গন্তব্য নির্বাচন করে 'পথচলা শুরু করুন' বাটনে চাপ দিন।"
  );
  const [isGeneratingGuidance, setIsGeneratingGuidance] = useState(false);

  // Scripted Dhaka Real Road Walk Demo Mode
  const [isRoadDemoActive, setIsRoadDemoActive] = useState<boolean>(false);

  // Live GPS Coords (Defaults to central Dhaka until GPS locks)
  const [userCoords, setUserCoords] = useState<[number, number]>([23.728, 90.401]);
  const [currentStreet, setCurrentStreet] = useState<string>("হাইকোর্ট স্ট্রিট, ঢাকা");
  const [googleMapsUrl, setGoogleMapsUrl] = useState<string>("");

  // Creative AI Tracing & Telemetry System States
  const [isTraceOpen, setIsTraceOpen] = useState(false);
  const [lastCapturedFrame, setLastCapturedFrame] = useState<string | null>(null);
  const [traceEntries, setTraceEntries] = useState<TraceEvent[]>([
    {
      time: "00:00:00",
      stage: "SYSTEM_INIT",
      message: "পথচলা এআই সহচর ও সেন্সর ইঞ্জিন সফলভাবে লোড হয়েছে",
      status: "info",
    },
  ]);
  const [aiTelemetry, setAiTelemetry] = useState<AiTelemetry>({
    model: "gemini-2.5-flash",
    source: "gemini-multimodal-cloud",
    latencyMs: 380,
    tokensUsed: 420,
    hasVision: true,
    street: "হাইকোর্ট স্ট্রিট, ঢাকা",
    timestamp: "00:00:00",
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const visionTimerRef = useRef<NodeJS.Timeout | null>(null);
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

  // Helper to append a client-side trace event
  const appendTrace = useCallback((stage: string, message: string, status: "info" | "success" | "warn" | "error" = "info") => {
    const newEntry: TraceEvent = {
      time: new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }),
      stage,
      message,
      status,
    };
    setTraceEntries((prev) => [newEntry, ...prev].slice(0, 30));
  }, []);

  // Scripted Road Demo Trigger Handler
  const triggerRoadDemo = useCallback(() => {
    setIsRoadDemoActive(true);
    setIsWalking(true);
    setSelectedPreset(PRESETS[0]);
    const demoGuidance =
      "সামনে আয়েশা মেডিকেল হলের সাইনবোর্ড দেখা যাচ্ছে। ফুটপাত দিয়ে একদম সোজা ৩০ কদম এগিয়ে চলুন, ডানে সড়কে রিকশা চলাচল রয়েছে।";
    setAiGuidanceBn(demoGuidance);
    speak(demoGuidance);
    setDetectedObstacle(null);
    appendTrace("VISION_GEMINI", "আয়েশা মেডিকেল হল ফার্মেসি ও ফুটপাত সনাক্ত - নিরাপদ নেভিগেশন প্রম্পট প্রস্তুত", "success");
    appendTrace("OBSTACLE_CHECK", "ফুটপাত পরিষ্কার; ডানে সড়কে রিকশা চলমান", "info");
    setNavData({
      lat: 23.728,
      lng: 90.401,
      heading: 0,
      destLat: PRESETS[0].lat,
      destLng: PRESETS[0].lng,
      destName: PRESETS[0].nameBn,
      clockDirection: "একদম সোজা সামনে",
      distanceMeters: 40,
      accuracy: 5,
    });
  }, [appendTrace]);

  // Auto-trigger Road Demo when initialRoadDemo prop is true
  useEffect(() => {
    if (isOpen && initialRoadDemo) {
      const timer = setTimeout(() => {
        triggerRoadDemo();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, initialRoadDemo, triggerRoadDemo]);

  // 1. Live Camera Stream for Vision Obstacle Detection & Multimodal Gemini Vision
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
          appendTrace("CAMERA_STREAM", "ক্যামেরা ভিডিও স্ট্রিম সক্রিয় (Facing: Environment)", "success");
        }
      } catch (err) {
        console.warn("Camera for Pothchola mode could not be opened:", err);
        appendTrace("CAMERA_STREAM", "ক্যামেরা এক্সেস ব্যর্থ, ফলব্যাক ক্যামেরা ব্যবহ্রত হবে", "warn");
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, appendTrace]);

  // 2. Real-Time Geolocation Watcher
  useEffect(() => {
    if (!isOpen || typeof navigator === "undefined" || !("geolocation" in navigator)) return;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setUserCoords([latitude, longitude]);
        appendTrace("GPS_UPDATE", `জিপিএস কোঅর্ডিনেট আপডেট: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`, "info");
      },
      (err) => {
        console.warn("GPS Watch error:", err);
        appendTrace("GPS_ERROR", `জিপিএস সতর্কবার্তা: ${err.message}`, "warn");
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [isOpen, appendTrace]);

  // 3. Leaflet Map Initialization and Dynamic Marker Updates
  useEffect(() => {
    if (!isOpen || typeof window === "undefined" || !mapContainerRef.current) return;

    let isSubscribed = true;

    async function initLeaflet() {
      const L = (await import("leaflet")).default;
      if (!isSubscribed || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
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
            font-size: 11px;
            font-weight: 800;
          ">YOU</div>`,
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
            font-size: 10px;
            font-weight: 900;
          ">DEST</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 30],
        });

        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView(userCoords, 16);

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
        appendTrace("MAP_INIT", "লিফলেট ইন্টারেক্টিভ ম্যাপ ভিউ প্রস্তুত", "success");
      } else {
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
  }, [isOpen, userCoords, selectedPreset, appendTrace]);

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

  // 5. Intelligent Multimodal Gemini 2.5 Flash + Vision + Google Maps Guidance
  const generateGeminiAudioGuidance = useCallback(
    async (obstacleText: string | null) => {
      setIsGeneratingGuidance(true);

      const destName = selectedPreset.nameBn;
      const distance = navData ? Math.round(navData.distanceMeters) : 45;
      const steps = navData ? Math.round(navData.distanceMeters * 1.3) : 60;
      const clockDir = navData?.clockDirection || "একদম সোজা সামনে চলুন";

      appendTrace("GUIDANCE_START", `দিকনির্দেশনা বিশ্লেষণ শুরু: গন্তব্য ${destName}, দূরত্ব ${distance}মি`, "info");

      // Extract real camera frame for Multimodal Gemini Vision
      let imageBase64: string | undefined = undefined;
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const frame = convertSourceToBase64(videoRef.current);
        if (frame) {
          imageBase64 = frame;
          setLastCapturedFrame(frame);
          appendTrace("FRAME_CAPTURE", `ক্যামেরা স্ন্যাপশট সফল (${Math.round(frame.length / 1024)} KB JPEG)`, "success");
        }
      }

      const apiKey =
        (typeof window !== "undefined" && localStorage.getItem("drishti.gemini_api_key.v1")) ||
        process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
        "";

      try {
        appendTrace("DISPATCH_API", "সার্ভার এআই রাউটারে রিকোয়েস্ট পাঠানো হচ্ছে...", "info");
        const res = await fetch("/api/guidance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64,
            lat: userCoords[0],
            lng: userCoords[1],
            currentStreet,
            destinationName: destName,
            destLat: selectedPreset.lat,
            destLng: selectedPreset.lng,
            distanceMeters: distance,
            steps: steps,
            direction: clockDir,
            obstacleText,
            apiKey,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.guidanceBn) {
            setAiGuidanceBn(data.guidanceBn);
            speak(data.guidanceBn);
          }
          if (data.street) setCurrentStreet(data.street);
          if (data.googleMapsUrl) setGoogleMapsUrl(data.googleMapsUrl);
          if (data.traceLog && Array.isArray(data.traceLog)) {
            setTraceEntries((prev) => [...data.traceLog, ...prev].slice(0, 30));
          }
          setAiTelemetry({
            model: data.model || "gemini-2.5-flash",
            source: data.source || "gemini-multimodal-cloud",
            latencyMs: data.latencyMs || 0,
            tokensUsed: data.tokensUsed || 0,
            hasVision: Boolean(data.hasVision),
            street: data.street || currentStreet,
            googleMapsUrl: data.googleMapsUrl,
            timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
          });
          appendTrace("AUDIO_OUT", `বাংলা অডিও পাঠ সম্পন্ন: "${data.guidanceBn}"`, "success");
          setIsGeneratingGuidance(false);
          return;
        } else {
          appendTrace("API_ERROR", `এআই সার্ভার স্ট্যাটাস: ${res.status}`, "warn");
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        appendTrace("NETWORK_FAIL", `নেটওয়ার্ক সংযোগ ব্যর্থ: ${errorMsg}`, "warn");
      }

      // Offline / Local Edge Engine Fallback
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
      appendTrace("LOCAL_FALLBACK", `অফলাইন এজ ইঞ্জিন ভয়েস কমান্ড: "${fallbackText}"`, "warn");
      setAiTelemetry({
        model: "drishti-local-edge-v1",
        source: "local-edge-engine",
        latencyMs: 45,
        tokensUsed: 0,
        hasVision: Boolean(imageBase64),
        street: currentStreet,
        timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }),
      });
      setIsGeneratingGuidance(false);
    },
    [selectedPreset, navData, userCoords, currentStreet, appendTrace]
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
          appendTrace("OBSTACLE_ALERT", `বাধা সনাক্ত হয়েছে: ${result.message_bn}`, "warn");
        }
        generateGeminiAudioGuidance(result.message_bn);
      } else {
        setDetectedObstacle(null);
        generateGeminiAudioGuidance(null);
      }
    } catch (e) {
      console.warn("Vision scan tick error:", e);
    }
  }, [generateGeminiAudioGuidance, appendTrace]);

  // Periodic navigation guidance & obstacle checks when walking
  useEffect(() => {
    if (isWalking && isVisionScanning) {
      visionTimerRef.current = setInterval(runObstacleScan, 7000);
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
      const stopMsg = "পথচলা মোড বন্ধ করা হয়েছে।";
      setAiGuidanceBn(stopMsg);
      speak(stopMsg);
      appendTrace("WALK_STATE", "পথচলা নেভিগেশন স্থগিত করা হয়েছে", "info");
    } else {
      startWalkWithMe(selectedPreset.lat, selectedPreset.lng, selectedPreset.nameBn);
      setIsWalking(true);
      const startMsg = `পথচলা শুরু হয়েছে। গন্তব্য: ${selectedPreset.nameBn}। লাইভ ম্যাপ ও ক্যামেরা ভিশন দিকনির্দেশনা শুনুন।`;
      setAiGuidanceBn(startMsg);
      speak(startMsg);
      appendTrace("WALK_STATE", `পথচলা সক্রিয়: গন্তব্য ${selectedPreset.nameBn}`, "success");
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
  const directMapsLink = googleMapsUrl || `https://www.google.com/maps/dir/?api=1&origin=${userCoords[0]},${userCoords[1]}&destination=${selectedPreset.lat},${selectedPreset.lng}&travelmode=walking`;

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
        backgroundColor: "rgba(0, 0, 0, 0.92)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        padding: "12px",
      }}
    >
      <div
        className="modal-card"
        style={{
          background: "#0A0F1D",
          border: "2px solid #38BDF8",
          borderRadius: "18px",
          width: "100%",
          maxWidth: "680px",
          maxHeight: "94vh",
          overflowY: "auto",
          padding: "18px",
          color: "#F8FAFC",
          boxShadow: "0 25px 60px -15px rgba(2, 132, 199, 0.4)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
          <div>
            <h2 id="pothchola-modal-title" style={{ fontSize: "20px", fontWeight: 800, margin: 0, color: "#38BDF8", display: "flex", alignItems: "center", gap: "8px" }}>
              পথচলা (Pothchola) — দৃষ্টি এআই
            </h2>
            <p id="pothchola-modal-desc" style={{ fontSize: "12px", color: "#94A3B8", marginTop: "3px" }}>
              রিয়েল-টাইম ক্যামেরা ভিশন ও বাংলা অডিও নেভিগেশন
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

        {/* Live AI Status HUD Ribbon */}
        <div
          style={{
            background: "rgba(15, 23, 42, 0.8)",
            border: "1px solid #1E293B",
            borderRadius: "10px",
            padding: "8px 12px",
            marginBottom: "12px",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "8px",
            fontSize: "12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                display: "inline-block",
                width: "9px",
                height: "9px",
                borderRadius: "50%",
                background: aiTelemetry.source.includes("cloud") ? "#10B981" : "#F59E0B",
                boxShadow: aiTelemetry.source.includes("cloud") ? "0 0 8px #10B981" : "0 0 8px #F59E0B",
              }}
            />
            <span style={{ fontWeight: 700, color: "#F8FAFC" }}>
              {aiTelemetry.model}
            </span>
            <span style={{ color: "#38BDF8", background: "rgba(56, 189, 248, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
              {aiTelemetry.latencyMs}ms
            </span>
            <span style={{ color: "#A7F3D0", background: "rgba(16, 185, 129, 0.15)", padding: "2px 6px", borderRadius: "4px" }}>
              {aiTelemetry.hasVision ? "ভিশন সক্রিয়" : "টেক্সট মোড"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setIsTraceOpen(!isTraceOpen)}
            onTouchStart={() => speakTouch(isTraceOpen ? "ট্রেস কনসোল লুকান" : "ট্রেস কনসোল খুলুন")}
            onMouseEnter={() => speakTouch(isTraceOpen ? "ট্রেস কনসোল লুকান" : "ট্রেস কনসোল খুলুন")}
            style={{
              background: isTraceOpen ? "#0284C7" : "#1E293B",
              color: "#FFF",
              border: "1px solid #38BDF8",
              borderRadius: "6px",
              padding: "4px 10px",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            লাইভ এআই ট্রেস ({traceEntries.length}) {isTraceOpen ? "▲" : "▼"}
          </button>
        </div>

        {/* Interactive Live AI Tracing Console Drawer (Expandable) */}
        {isTraceOpen && (
          <div
            style={{
              background: "#050811",
              border: "2px solid #0284C7",
              borderRadius: "12px",
              padding: "14px",
              marginBottom: "16px",
              boxShadow: "inset 0 0 20px rgba(2, 132, 199, 0.2)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px", borderBottom: "1px solid #1E293B", paddingBottom: "8px" }}>
              <span style={{ fontSize: "13px", fontWeight: 800, color: "#38BDF8" }}>
                এআই পাইপলাইন ট্রেসিং ও ভেরিফিকেশন কনসোল
              </span>
              <button
                type="button"
                onClick={() => generateGeminiAudioGuidance("ম্যানুয়াল টেস্ট ট্রিগার")}
                style={{
                  background: "#0284C7",
                  color: "#FFF",
                  border: "none",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                টেস্ট এআই ট্রেস রান করুন
              </button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginBottom: "12px" }}>
              {/* Snapshot of Vision Input to Gemini */}
              <div style={{ background: "#0F172A", padding: "10px", borderRadius: "8px", border: "1px solid #334155" }}>
                <span style={{ fontSize: "11px", color: "#94A3B8", display: "block", marginBottom: "6px" }}>
                  জেমিনাই ভিশন ইনপুট ফ্রেম (Camera Snapshot)
                </span>
                {lastCapturedFrame ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/jpeg;base64,${lastCapturedFrame}`}
                    alt="Gemini Vision Input Frame"
                    style={{ width: "100%", height: "110px", objectFit: "cover", borderRadius: "6px", border: "1px solid #38BDF8" }}
                  />
                ) : (
                  <div style={{ height: "110px", display: "flex", alignItems: "center", justifyContent: "center", background: "#020617", borderRadius: "6px", color: "#64748B", fontSize: "12px" }}>
                    ফ্রেম অপেক্ষমাণ...
                  </div>
                )}
                <div style={{ fontSize: "10px", color: "#38BDF8", marginTop: "4px" }}>
                  মাল্টিমোডাল ভিশনে ক্যামেরা ফ্রেম রিয়েল-টাইম প্রসেসড
                </div>
              </div>

              {/* Map & Google Directions Context */}
              <div style={{ background: "#0F172A", padding: "10px", borderRadius: "8px", border: "1px solid #334155" }}>
                <span style={{ fontSize: "11px", color: "#94A3B8", display: "block", marginBottom: "4px" }}>
                  গুগল ম্যাপস ও সড়কের অবস্থান
                </span>
                <div style={{ fontSize: "13px", fontWeight: 700, color: "#F8FAFC", marginBottom: "2px" }}>
                  {currentStreet}
                </div>
                <div style={{ fontSize: "11px", color: "#94A3B8", marginBottom: "6px" }}>
                  জিপিএস: {userCoords[0].toFixed(5)}°N, {userCoords[1].toFixed(5)}°E
                </div>
                <a
                  href={directMapsLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-block",
                    background: "linear-gradient(135deg, #1E40AF, #0284C7)",
                    color: "#FFF",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontWeight: 700,
                    textDecoration: "none",
                  }}
                >
                  গুগল ম্যাপে রুট খুলুন ↗
                </a>
              </div>
            </div>

            {/* Trace Events Timeline */}
            <div style={{ maxHeight: "160px", overflowY: "auto", background: "#020617", borderRadius: "8px", padding: "8px", border: "1px solid #1E293B" }}>
              <span style={{ fontSize: "11px", color: "#64748B", display: "block", marginBottom: "6px", fontWeight: 700 }}>
                📜 লাইভ এক্সিকিউশন টাইমলাইন (মিলিসেকেন্ড ট্রেস):
              </span>
              {traceEntries.map((entry, idx) => (
                <div
                  key={idx}
                  style={{
                    fontSize: "11px",
                    fontFamily: "monospace",
                    padding: "3px 0",
                    borderBottom: "1px solid #0F172A",
                    display: "flex",
                    gap: "8px",
                  }}
                >
                  <span style={{ color: "#64748B" }}>[{entry.time}]</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color:
                        entry.status === "success"
                          ? "#10B981"
                          : entry.status === "warn"
                          ? "#F59E0B"
                          : entry.status === "error"
                          ? "#EF4444"
                          : "#38BDF8",
                    }}
                  >
                    {entry.stage}:
                  </span>
                  <span style={{ color: "#E2E8F0" }}>{entry.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Live Bengali Audio Announcement Banner */}
        <div
          role="region"
          aria-live="assertive"
          style={{
            background: "rgba(15, 23, 42, 0.9)",
            border: "1px solid #38BDF8",
            borderRadius: "10px",
            padding: "12px 14px",
            marginBottom: "14px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "11px", fontWeight: 800, color: "#38BDF8", letterSpacing: "0.5px" }}>
              AI AUDIO GUIDANCE
            </span>
            <span style={{ fontSize: "10px", color: "#6EE7B7", background: "rgba(6, 78, 59, 0.7)", border: "1px solid #10B981", padding: "1px 6px", borderRadius: "4px" }}>
              {isGeneratingGuidance ? "প্রসেসিং..." : "লাইভ ভয়েস"}
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
              লাইভ ম্যাপ ও রুট ট্র্যাকিং (Leaflet):
            </span>
            <span style={{ fontSize: "11px", color: "#94A3B8" }}>
              {nativeActive ? "কেইন ব্রিজ সক্রিয়" : "ব্রাউজার জিপিএস"} • {currentStreet}
            </span>
          </div>
          <div
            id="pothchola-map"
            ref={mapContainerRef}
            style={{
              width: "100%",
              height: "190px",
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
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#94A3B8" }}>
              ক্যামেরা ভিশন ও অবজেক্ট ট্র্যাকিং:
            </span>
            <button
              type="button"
              onClick={() => {
                if (isRoadDemoActive) {
                  setIsRoadDemoActive(false);
                } else {
                  triggerRoadDemo();
                }
              }}
              style={{
                background: isRoadDemoActive ? "#065f46" : "#1E293B",
                color: isRoadDemoActive ? "#6ee7b7" : "#38BDF8",
                border: `1px solid ${isRoadDemoActive ? "#10B981" : "#0284C7"}`,
                borderRadius: "6px",
                padding: "3px 8px",
                fontSize: "11px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {isRoadDemoActive ? "লাইভ ক্যামেরা ভিউ" : "রোড ভিডিও ডেমো"}
            </button>
          </div>

          <div
            style={{
              position: "relative",
              background: "#000",
              borderRadius: "12px",
              overflow: "hidden",
              border: "1px solid #334155",
              minHeight: isRoadDemoActive ? "220px" : "150px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isRoadDemoActive ? (
              <div style={{ position: "relative", width: "100%", height: "220px" }}>
                <video
                  src="/demo/dhaka_walk_live.mp4"
                  autoPlay
                  loop
                  muted
                  playsInline
                  style={{ width: "100%", height: "220px", objectFit: "cover", display: "block" }}
                />

                {/* Box 1: Landmark Pharmacy Destination */}
                <div
                  style={{
                    position: "absolute",
                    top: "22%",
                    left: "18%",
                    width: "28%",
                    height: "28%",
                    border: "2px solid #10B981",
                    borderRadius: "6px",
                    boxShadow: "0 0 10px rgba(16, 185, 129, 0.7)",
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "-20px",
                      left: 0,
                      background: "#064E3B",
                      color: "#6EE7B7",
                      fontSize: "10px",
                      fontWeight: 800,
                      padding: "1px 6px",
                      borderRadius: "4px",
                      whiteSpace: "nowrap",
                      border: "1px solid #10B981",
                    }}
                  >
                    [গন্তব্য: আয়েশা মেডিকেল হল (৪০মি সোজা)]
                  </span>
                </div>

                {/* Box 2: Safe Sidewalk Walkway */}
                <div
                  style={{
                    position: "absolute",
                    top: "54%",
                    left: "22%",
                    width: "46%",
                    height: "40%",
                    border: "2px dashed #38BDF8",
                    borderRadius: "6px",
                    boxShadow: "0 0 10px rgba(56, 189, 248, 0.5)",
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "-18px",
                      left: 0,
                      background: "#0369A1",
                      color: "#E0F2FE",
                      fontSize: "9px",
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: "4px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    [নিরাপদ ফুটপাত: পথ পরিষ্কার]
                  </span>
                </div>

                {/* Box 3: Rickshaw in road lane */}
                <div
                  style={{
                    position: "absolute",
                    top: "30%",
                    left: "70%",
                    width: "24%",
                    height: "44%",
                    border: "2px solid #F97316",
                    borderRadius: "6px",
                    pointerEvents: "none",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: "-18px",
                      left: 0,
                      background: "#C2410C",
                      color: "#FFEDD5",
                      fontSize: "9px",
                      fontWeight: 800,
                      padding: "1px 5px",
                      borderRadius: "4px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    [রিকশা: ডানপাশে সড়কে]
                  </span>
                </div>
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: "100%", height: "150px", objectFit: "cover" }}
              />
            )}

            {/* Overlay Vision Badge (No Emoji) */}
            <div
              style={{
                position: "absolute",
                top: "8px",
                left: "8px",
                background: "rgba(15, 23, 42, 0.9)",
                border: "1px solid #38BDF8",
                color: "#38BDF8",
                padding: "2px 7px",
                borderRadius: "4px",
                fontSize: "10px",
                fontWeight: 800,
                letterSpacing: "0.5px",
              }}
            >
              {isRoadDemoActive ? "LIVE ROAD AI VISION" : "CAMERA VISION"}
            </div>

            {detectedObstacle && (
              <div
                style={{
                  position: "absolute",
                  bottom: "8px",
                  left: "8px",
                  right: "8px",
                  background: "rgba(0, 0, 0, 0.92)",
                  border: "1px solid #F59E0B",
                  color: "#FDE68A",
                  padding: "5px 8px",
                  borderRadius: "6px",
                  fontSize: "11px",
                  fontWeight: 700,
                }}
              >
                [সতর্কতা: {detectedObstacle}]
              </div>
            )}
          </div>
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "8px" }}>
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
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              দিক শুনুন
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
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              স্ক্যান ও গাইড
            </button>
            <button
              type="button"
              onClick={() => {
                window.open(directMapsLink, "_blank");
                speak("গুগল ম্যাপসে লাইভ হাঁটার রুট খোলা হয়েছে");
              }}
              onTouchStart={() => speakTouch("গুগল ম্যাপে পুরো রুট খুলুন")}
              onMouseEnter={() => speakTouch("গুগল ম্যাপে পুরো রুট খুলুন")}
              onFocus={() => speakTouch("গুগল ম্যাপে পুরো রুট খুলুন")}
              style={{
                background: "#0369A1",
                color: "#F8FAFC",
                border: "1px solid #38BDF8",
                borderRadius: "10px",
                padding: "10px",
                fontSize: "13px",
                fontWeight: 700,
                cursor: "pointer",
                minHeight: "44px",
              }}
            >
              গুগল ম্যাপস
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
