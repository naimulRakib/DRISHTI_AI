"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { speak } from "@/lib/tools/speech";
import { toBengaliDigits } from "@/lib/storage/geofenceStore";

export interface NavWaypoint {
  lat: number;
  lng: number;
  heading: number; // degrees (0 = North, 90 = East, etc.)
  instructionBn: string;
  maneuver: "straight" | "turn-right" | "turn-left" | "destination";
  distanceToNextMeters: number;
  totalRemainingMeters: number;
  etaMinutes: number;
  streetNameBn: string;
}

// Realistic Dhaka street route towards Ayesha Medical Hall (Pharmacy)
// Fully self-contained simulated dummy waypoints — requires ZERO Google Maps API key
export const DHAKA_SIMULATED_ROUTE: NavWaypoint[] = [
  {
    lat: 23.72800,
    lng: 90.40100,
    heading: 65,
    instructionBn: "যাত্রা শুরু হয়েছে। ফুটপাত দিয়ে একদম সোজা সামনে চলুন।",
    maneuver: "straight",
    distanceToNextMeters: 45,
    totalRemainingMeters: 140,
    etaMinutes: 2,
    streetNameBn: "তোপখানা রোড (ফুটপাত)",
  },
  {
    lat: 23.72815,
    lng: 90.40140,
    heading: 70,
    instructionBn: "সামনে ৪০ মিটার পর ফুটপাত ঘেঁষে সামান্য ডানে মোড় নিন।",
    maneuver: "straight",
    distanceToNextMeters: 40,
    totalRemainingMeters: 95,
    etaMinutes: 1.5,
    streetNameBn: "তোপখানা রোড মোড়",
  },
  {
    lat: 23.72832,
    lng: 90.40180,
    heading: 78,
    instructionBn: "সাবধান, ফুটপাতে একটু বাঁয়ে থাকুন, সামনে ডানে ফার্মেসির গলিতে মোড় নিন।",
    maneuver: "turn-right",
    distanceToNextMeters: 30,
    totalRemainingMeters: 55,
    etaMinutes: 1,
    streetNameBn: "মেডিকেল স্কয়ার লেন",
  },
  {
    lat: 23.72844,
    lng: 90.40220,
    heading: 65,
    instructionBn: "সামনে আয়েশা মেডিকেল হলের সাইনবোর্ড দেখা যাচ্ছে। আর ২৫ কদম সোজা চলুন।",
    maneuver: "straight",
    distanceToNextMeters: 25,
    totalRemainingMeters: 25,
    etaMinutes: 0.5,
    streetNameBn: "ফার্মেসি গলি",
  },
  {
    lat: 23.72855,
    lng: 90.40250,
    heading: 72,
    instructionBn: "আপনার গন্তব্য আয়েশা মেডিকেল হল সামনে ডানপাশে। পথচলা সমাপ্ত।",
    maneuver: "destination",
    distanceToNextMeters: 0,
    totalRemainingMeters: 0,
    etaMinutes: 0,
    streetNameBn: "আয়েশা মেডিকেল হল সম্মুখ",
  },
];

export interface LiveNavigationMapProps {
  initialAutoPlay?: boolean;
  onGuidanceChange?: (guidanceBn: string) => void;
  height?: string;
  showCameraToggle?: boolean;
  videoSrc?: string;
}

export default function LiveNavigationMap({
  initialAutoPlay = true,
  onGuidanceChange,
  height = "380px",
  showCameraToggle = true,
  videoSrc = "/demo/dhaka_walk_live.mp4",
}: LiveNavigationMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMarkerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const activePolylineRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const passedPolylineRef = useRef<any>(null);

  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState<boolean>(initialAutoPlay);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);
  const [viewMode, setViewMode] = useState<"map" | "camera" | "split">("split");
  const [leafletReady, setLeafletReady] = useState<boolean>(false);

  const currentStep = DHAKA_SIMULATED_ROUTE[currentStepIdx] || DHAKA_SIMULATED_ROUTE[0];

  // Notify parent of guidance changes
  useEffect(() => {
    if (onGuidanceChange) {
      onGuidanceChange(currentStep.instructionBn);
    }
  }, [currentStepIdx, currentStep.instructionBn, onGuidanceChange]);

  // Dynamic Animated Puck SVG Icon
  const createPuckIcon = useCallback((heading: number) => {
    if (typeof window === "undefined") return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet");
    const html = `
      <div style="position: relative; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background: rgba(2, 132, 199, 0.28); animation: drishti-pulse-nav 1.8s infinite ease-out; pointer-events: none;"></div>
        <div style="position: relative; width: 22px; height: 22px; border-radius: 50%; background: #0284c7; border: 3px solid #ffffff; box-shadow: 0 0 12px rgba(2, 132, 199, 0.9); transform: rotate(${heading}deg); transition: transform 0.4s ease-out; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; top: -7px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 8px solid #38bdf8;"></div>
          <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
        </div>
      </div>
    `;
    return L.divIcon({
      className: "drishti-live-puck",
      html: html,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });
  }, []);

  // Destination Pin SVG Icon
  const createDestIcon = useCallback(() => {
    if (typeof window === "undefined") return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const L = require("leaflet");
    const html = `
      <div style="position: relative; display: flex; flex-direction: column; align-items: center; pointer-events: none;">
        <div style="background: #10b981; color: #ffffff; font-weight: 800; font-size: 10px; padding: 3px 8px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); white-space: nowrap; border: 1px solid #34d399;">
          আয়েশা মেডিকেল হল
        </div>
        <div style="width: 2px; height: 8px; background: #10b981;"></div>
        <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; border: 2px solid #ffffff; box-shadow: 0 0 8px #10b981;"></div>
      </div>
    `;
    return L.divIcon({
      className: "drishti-dest-pin",
      html: html,
      iconSize: [120, 46],
      iconAnchor: [60, 46],
    });
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    const initMap = async () => {
      try {
        const L = await import("leaflet");
        if (!isMounted || !mapContainerRef.current) return;

        if (!mapInstanceRef.current) {
          const destIcon = createDestIcon();

          const map = L.map(mapContainerRef.current, {
            zoomControl: false,
            attributionControl: false,
          }).setView([currentStep.lat, currentStep.lng], 17);

          // High contrast Voyager tile layer — free, open CartoDB streets (Zero Google Maps API key required)
          L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
            maxZoom: 20,
          }).addTo(map);

          // Passed route (grayed out)
          passedPolylineRef.current = L.polyline([], {
            color: "#64748b",
            weight: 6,
            opacity: 0.8,
          }).addTo(map);

          // Active forward route (glowing electric cyan)
          const fullCoordinates: [number, number][] = DHAKA_SIMULATED_ROUTE.map((w) => [w.lat, w.lng]);
          activePolylineRef.current = L.polyline(fullCoordinates as [number, number][], {
            color: "#0284c7",
            weight: 6,
            opacity: 0.95,
          }).addTo(map);

          // User Marker
          userMarkerRef.current = L.marker([currentStep.lat, currentStep.lng], {
            icon: createPuckIcon(currentStep.heading),
          }).addTo(map);

          // Destination Marker
          const lastWp = DHAKA_SIMULATED_ROUTE[DHAKA_SIMULATED_ROUTE.length - 1];
          if (destIcon) {
            L.marker([lastWp.lat, lastWp.lng], { icon: destIcon }).addTo(map);
          }

          mapInstanceRef.current = map;
          setLeafletReady(true);
        }
      } catch (err) {
        console.warn("Leaflet tile fallback active:", err);
      }
    };

    initMap();

    return () => {
      isMounted = false;
    };
  }, [createDestIcon, createPuckIcon, currentStep.heading, currentStep.lat, currentStep.lng]);

  // Update map state when current step changes
  useEffect(() => {
    if (!mapInstanceRef.current || !userMarkerRef.current) return;

    const wp = DHAKA_SIMULATED_ROUTE[currentStepIdx];
    if (!wp) return;

    const newLatLng: [number, number] = [wp.lat, wp.lng];

    // Update Puck
    const newIcon = createPuckIcon(wp.heading);
    if (newIcon) {
      userMarkerRef.current.setIcon(newIcon);
    }
    userMarkerRef.current.setLatLng(newLatLng);

    // Smooth pan
    mapInstanceRef.current.panTo(newLatLng, { animate: true, duration: 0.8 });

    // Update polylines
    const passedCoords: [number, number][] = DHAKA_SIMULATED_ROUTE.slice(0, currentStepIdx + 1).map((w) => [w.lat, w.lng]);
    const remainingCoords: [number, number][] = DHAKA_SIMULATED_ROUTE.slice(currentStepIdx).map((w) => [w.lat, w.lng]);

    if (passedPolylineRef.current) {
      passedPolylineRef.current.setLatLngs(passedCoords as [number, number][]);
    }
    if (activePolylineRef.current) {
      activePolylineRef.current.setLatLngs(remainingCoords as [number, number][]);
    }
  }, [currentStepIdx, createPuckIcon]);

  // Turn-by-Turn Simulated Movement Interval Timer
  useEffect(() => {
    if (!isNavigating) return;

    const baseIntervalMs = 4500 / speedMultiplier;

    const timer = setInterval(() => {
      setCurrentStepIdx((prev) => {
        const nextIdx = prev + 1;
        if (nextIdx < DHAKA_SIMULATED_ROUTE.length) {
          const nextWp = DHAKA_SIMULATED_ROUTE[nextIdx];
          speak(nextWp.instructionBn);
          return nextIdx;
        } else {
          // Reached destination
          setIsNavigating(false);
          speak(DHAKA_SIMULATED_ROUTE[DHAKA_SIMULATED_ROUTE.length - 1].instructionBn);
          return prev;
        }
      });
    }, baseIntervalMs);

    return () => clearInterval(timer);
  }, [isNavigating, speedMultiplier]);

  const handleToggleNavigation = () => {
    if (currentStepIdx >= DHAKA_SIMULATED_ROUTE.length - 1) {
      // If at end, restart from beginning
      setCurrentStepIdx(0);
      setIsNavigating(true);
      speak(DHAKA_SIMULATED_ROUTE[0].instructionBn);
    } else {
      const nextNavState = !isNavigating;
      setIsNavigating(nextNavState);
      if (nextNavState) {
        speak(currentStep.instructionBn);
      }
    }
  };

  const handleRestart = () => {
    setCurrentStepIdx(0);
    setIsNavigating(true);
    speak(DHAKA_SIMULATED_ROUTE[0].instructionBn);
  };

  const handleSpeakCurrent = () => {
    speak(currentStep.instructionBn);
  };

  // Turn Maneuver Direction Icon SVG
  const renderManeuverIcon = () => {
    switch (currentStep.maneuver) {
      case "straight":
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        );
      case "turn-right":
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
            <path d="M4 18h7a4 4 0 0 0 4-4V6" />
          </svg>
        );
      case "turn-left":
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
            <path d="M20 18h-7a4 4 0 0 1-4-4V6" />
          </svg>
        );
      case "destination":
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        );
    }
  };

  const directMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${DHAKA_SIMULATED_ROUTE[0].lat},${DHAKA_SIMULATED_ROUTE[0].lng}&destination=${DHAKA_SIMULATED_ROUTE[4].lat},${DHAKA_SIMULATED_ROUTE[4].lng}&travelmode=walking`;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #1e293b",
        background: "#020617",
        fontFamily: "inherit",
      }}
    >
      {/* Top View Mode Switcher Strip */}
      {showCameraToggle && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "0.5rem 0.85rem",
            background: "#090d16",
            borderBottom: "1px solid #1e293b",
            fontSize: "0.78rem",
            flexWrap: "wrap",
            gap: "0.4rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <span
              style={{
                background: "rgba(2, 132, 199, 0.15)",
                color: "#38bdf8",
                border: "1px solid #0284c7",
                padding: "2px 7px",
                borderRadius: "4px",
                fontWeight: 800,
                fontSize: "0.68rem",
                letterSpacing: "0.5px",
              }}
            >
              DRISHTI LIVE GPS NAVIGATION
            </span>
            <span
              style={{
                background: "rgba(16, 185, 129, 0.12)",
                color: "#34d399",
                border: "1px solid #059669",
                padding: "2px 6px",
                borderRadius: "3px",
                fontWeight: 700,
                fontSize: "0.65rem",
              }}
            >
              অফলাইন ডামি সিস্টেম (নো এপিআই কী রিকোয়ার্ড)
            </span>
            <span style={{ color: "#94a3b8", fontWeight: 600, fontSize: "0.75rem" }}>
              {isNavigating ? "হাঁটা চলছে" : currentStepIdx === DHAKA_SIMULATED_ROUTE.length - 1 ? "গন্তব্যে পৌঁছেছেন" : "বিরতিতে"}
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.35rem" }}>
            <button
              type="button"
              onClick={() => setViewMode("map")}
              style={{
                background: viewMode === "map" ? "#0284c7" : "#1e293b",
                color: viewMode === "map" ? "#ffffff" : "#94a3b8",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "2px 9px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.75rem",
              }}
            >
              লাইভ ম্যাপ
            </button>
            <button
              type="button"
              onClick={() => setViewMode("camera")}
              style={{
                background: viewMode === "camera" ? "#0284c7" : "#1e293b",
                color: viewMode === "camera" ? "#ffffff" : "#94a3b8",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "2px 9px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.75rem",
              }}
            >
              রোড ভিশন
            </button>
            <button
              type="button"
              onClick={() => setViewMode("split")}
              style={{
                background: viewMode === "split" ? "#0284c7" : "#1e293b",
                color: viewMode === "split" ? "#ffffff" : "#94a3b8",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "2px 9px",
                cursor: "pointer",
                fontWeight: 700,
                fontSize: "0.75rem",
              }}
            >
              স্প্লিট ভিউ
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height,
          display: "flex",
          flexDirection: viewMode === "split" ? "column" : "row",
        }}
      >
        {/* Camera Vision Half (Shown in camera or split mode) */}
        {(viewMode === "camera" || viewMode === "split") && (
          <div
            style={{
              position: "relative",
              flex: viewMode === "split" ? "0 0 50%" : "1 1 100%",
              width: "100%",
              overflow: "hidden",
              background: "#000",
              borderBottom: viewMode === "split" ? "1px solid #1e293b" : "none",
            }}
          >
            <video
              src={videoSrc}
              autoPlay
              loop
              muted
              playsInline
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
            {/* Live Camera HUD Overlays */}
            <div
              style={{
                position: "absolute",
                top: "10px",
                left: "10px",
                background: "rgba(15, 23, 42, 0.88)",
                border: "1px solid #0284c7",
                borderRadius: "4px",
                padding: "2px 8px",
                fontSize: "0.72rem",
                color: "#38bdf8",
                fontWeight: 800,
                letterSpacing: "0.5px",
              }}
            >
              ROAD CAMERA SYNC
            </div>

            {/* Bounding box: Destination Pharmacy in live video */}
            <div
              style={{
                position: "absolute",
                top: "16%",
                left: "14%",
                width: "36%",
                height: "30%",
                border: "2px solid #38bdf8",
                borderRadius: "6px",
                boxShadow: "0 0 12px rgba(56, 189, 248, 0.6)",
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "-20px",
                  left: 0,
                  background: "#0369a1",
                  color: "#f0fdf4",
                  fontSize: "10px",
                  fontWeight: 800,
                  padding: "1px 6px",
                  borderRadius: "3px",
                  whiteSpace: "nowrap",
                }}
              >
                [আয়েশা মেডিকেল হল: {toBengaliDigits(currentStep.totalRemainingMeters)} মি]
              </span>
            </div>

            {/* Bounding box: Safe Footpath Lane */}
            <div
              style={{
                position: "absolute",
                bottom: "10%",
                left: "26%",
                width: "48%",
                height: "34%",
                border: "2px dashed #10b981",
                borderRadius: "6px",
                boxShadow: "0 0 10px rgba(16, 185, 129, 0.5)",
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "-18px",
                  left: 0,
                  background: "#064e3b",
                  color: "#a7f3d0",
                  fontSize: "9px",
                  fontWeight: 800,
                  padding: "1px 5px",
                  borderRadius: "3px",
                  whiteSpace: "nowrap",
                }}
              >
                [নিরাপদ ফুটপাত পথ]
              </span>
            </div>
          </div>
        )}

        {/* Map View Half (Shown in map or split mode) */}
        {(viewMode === "map" || viewMode === "split") && (
          <div
            style={{
              position: "relative",
              flex: viewMode === "split" ? "0 0 50%" : "1 1 100%",
              width: "100%",
              overflow: "hidden",
            }}
          >
            {/* Leaflet Canvas Container */}
            <div
              ref={mapContainerRef}
              style={{
                width: "100%",
                height: "100%",
                background: "#0f172a",
              }}
            />

            {/* Fallback Dummy SVG Vector Map (Guarantees crisp street rendering if tiles are offline) */}
            {!leafletReady && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "radial-gradient(circle at center, #0f172a 0%, #020617 100%)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="100%" height="100%" style={{ position: "absolute", inset: 0, opacity: 0.25 }}>
                  <defs>
                    <pattern id="street-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" strokeWidth="1" />
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#street-grid)" />
                  {/* Road Path */}
                  <path d="M 40 180 Q 140 160 220 120 T 360 80" fill="none" stroke="#0284c7" strokeWidth="8" strokeLinecap="round" />
                </svg>
                <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "1rem" }}>
                  <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#38bdf8" }}>
                    অফলাইন ডামি ভেক্টর রোড ম্যাপ
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "#94a3b8", marginTop: "4px" }}>
                    সিমুলেটেড জিপিএস ট্র্যাকিং সক্রিয়
                  </div>
                </div>
              </div>
            )}

            {/* Top Turn Maneuver Header Card */}
            <div
              style={{
                position: "absolute",
                top: "10px",
                left: "10px",
                right: "10px",
                zIndex: 1000,
                background: "rgba(10, 15, 29, 0.94)",
                backdropFilter: "blur(8px)",
                border: "1px solid #0284c7",
                borderRadius: "8px",
                padding: "0.55rem 0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                boxShadow: "0 6px 18px rgba(0, 0, 0, 0.55)",
              }}
            >
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "8px",
                  background: currentStep.maneuver === "destination" ? "rgba(16, 185, 129, 0.2)" : "rgba(2, 132, 199, 0.2)",
                  border: `1px solid ${currentStep.maneuver === "destination" ? "#10b981" : "#0284c7"}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {renderManeuverIcon()}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 800, color: "#f8fafc" }}>
                    {currentStep.distanceToNextMeters > 0
                      ? `${toBengaliDigits(currentStep.distanceToNextMeters)} মি পর`
                      : "পৌঁছে গেছেন"}
                  </span>
                  <span style={{ fontSize: "0.72rem", color: "#94a3b8", fontWeight: 600 }}>
                    ({currentStep.streetNameBn})
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.82rem",
                    color: "#38bdf8",
                    fontWeight: 700,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {currentStep.instructionBn}
                </div>
              </div>

              {/* Re-speak Audio Button */}
              <button
                type="button"
                onClick={handleSpeakCurrent}
                title="ভয়েস দিকনির্দেশনা শুনুন"
                style={{
                  background: "#1e293b",
                  border: "1px solid #334155",
                  borderRadius: "6px",
                  color: "#38bdf8",
                  padding: "6px 8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              </button>
            </div>

            {/* Bottom Floating ETA Card */}
            <div
              style={{
                position: "absolute",
                bottom: "10px",
                left: "10px",
                right: "10px",
                zIndex: 1000,
                background: "rgba(10, 15, 29, 0.94)",
                backdropFilter: "blur(8px)",
                border: "1px solid #334155",
                borderRadius: "8px",
                padding: "0.55rem 0.85rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                boxShadow: "0 6px 18px rgba(0, 0, 0, 0.55)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem" }}>
                    <span style={{ fontSize: "1.1rem", fontWeight: 800, color: "#10b981" }}>
                      {toBengaliDigits(currentStep.etaMinutes)} মিনিট
                    </span>
                    <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                      ({toBengaliDigits(currentStep.totalRemainingMeters)} মিটার বাকি)
                    </span>
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#cbd5e1", fontWeight: 700 }}>
                    গন্তব্য: আয়েশা মেডিকেল হল (ফার্মেসি)
                  </div>
                </div>
              </div>

              {/* Navigation Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <button
                  type="button"
                  onClick={handleToggleNavigation}
                  style={{
                    background: isNavigating ? "#7f1d1d" : "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "6px",
                    padding: "5px 12px",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {isNavigating ? "বিরতি" : currentStepIdx === DHAKA_SIMULATED_ROUTE.length - 1 ? "পুনরায় শুরু" : "শুরু"}
                </button>

                <button
                  type="button"
                  onClick={handleRestart}
                  title="প্রথম থেকে শুরু করুন"
                  style={{
                    background: "#1e293b",
                    color: "#94a3b8",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    padding: "5px 9px",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  রিসেট
                </button>

                <button
                  type="button"
                  onClick={() => setSpeedMultiplier((prev) => (prev === 1 ? 2 : 1))}
                  title="সিমুলেশন গতি পরিবর্তন"
                  style={{
                    background: "#1e293b",
                    color: speedMultiplier === 2 ? "#38bdf8" : "#94a3b8",
                    border: "1px solid #334155",
                    borderRadius: "6px",
                    padding: "5px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {toBengaliDigits(speedMultiplier)}x গতি
                </button>

                <a
                  href={directMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "rgba(30, 41, 59, 0.8)",
                    color: "#38bdf8",
                    border: "1px solid #0284c7",
                    borderRadius: "6px",
                    padding: "5px 8px",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                    gap: "3px",
                  }}
                >
                  <span>গুগল ম্যাপস</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                    <polyline points="15 3 21 3 21 9" />
                    <line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Info Strip */}
      <div
        style={{
          padding: "0.4rem 0.85rem",
          background: "#090d16",
          borderTop: "1px solid #1e293b",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.72rem",
          color: "#64748b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <span style={{ color: "#34d399", fontWeight: 700 }}>
            জিপিএস: {currentStep.lat.toFixed(5)}°N, {currentStep.lng.toFixed(5)}°E
          </span>
          <span>•</span>
          <span>হেডিং: {toBengaliDigits(currentStep.heading)}°</span>
          <span>•</span>
          <span style={{ color: "#94a3b8" }}>নো এপিআই কী রিকোয়ার্ড</span>
        </div>
        <div>
          <span>অগ্রগতি: ধাপে ধাপে {toBengaliDigits(currentStepIdx + 1)}/{toBengaliDigits(DHAKA_SIMULATED_ROUTE.length)}</span>
        </div>
      </div>
    </div>
  );
}
