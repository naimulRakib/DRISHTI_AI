"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { speak } from "@/lib/tools/speech";
import { toBengaliDigits } from "@/lib/storage/geofenceStore";

export interface UberNavWaypoint {
  lat: number;
  lng: number;
  heading: number; // degrees (0 = North, 90 = East, etc.)
  instructionBn: string;
  maneuver: "straight" | "turn-right" | "turn-left" | "destination";
  distanceToNextMeters: number;
  totalRemainingMeters: number;
  etaMinutes: number;
}

// Realistic Dhaka street route towards Ayesha Medical Hall (Pharmacy)
const DHAKA_UBER_ROUTE: UberNavWaypoint[] = [
  {
    lat: 23.72800,
    lng: 90.40100,
    heading: 65,
    instructionBn: "যাত্রা শুরু হয়েছে। ফুটপাত দিয়ে একদম সোজা সামনে চলুন।",
    maneuver: "straight",
    distanceToNextMeters: 45,
    totalRemainingMeters: 140,
    etaMinutes: 2,
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
  },
  {
    lat: 23.72850,
    lng: 90.40250,
    heading: 65,
    instructionBn: "আপনার গন্তব্য আয়েশা মেডিকেল হল সামনে ডানপাশে। পথচলা সমাপ্ত।",
    maneuver: "destination",
    distanceToNextMeters: 0,
    totalRemainingMeters: 0,
    etaMinutes: 0,
  },
];

export interface UberNavigationMapProps {
  initialAutoPlay?: boolean;
  onGuidanceChange?: (guidanceBn: string) => void;
  height?: string;
  showCameraToggle?: boolean;
  videoSrc?: string;
}

export default function UberNavigationMap({
  initialAutoPlay = true,
  onGuidanceChange,
  height = "380px",
  showCameraToggle = true,
  videoSrc = "/demo/dhaka_walk_live.mp4",
}: UberNavigationMapProps) {
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

  const currentStep = DHAKA_UBER_ROUTE[currentStepIdx] || DHAKA_UBER_ROUTE[0];

  // Notify parent of guidance changes
  useEffect(() => {
    if (onGuidanceChange) {
      onGuidanceChange(currentStep.instructionBn);
    }
  }, [currentStepIdx, currentStep.instructionBn, onGuidanceChange]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isSubscribed = true;

    async function initMap() {
      const L = (await import("leaflet")).default;
      if (!isSubscribed || !mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        // Uber-style dark vehicle / pedestrian puck with heading pointer
        const createPuckIcon = (heading: number) =>
          L.divIcon({
            className: "uber-user-puck",
            html: `
              <div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
                <div style="position:absolute; width:36px; height:36px; border-radius:50%; background:rgba(2, 132, 199, 0.35); animation:pulse 1.8s infinite;"></div>
                <div style="width:22px; height:22px; border-radius:50%; background:#0284c7; border:3px solid #ffffff; box-shadow:0 0 12px #38bdf8; display:flex; align-items:center; justify-content:center;">
                  <div style="width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-bottom:7px solid #ffffff; transform:rotate(${heading}deg);"></div>
                </div>
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          });

        const destIcon = L.divIcon({
          className: "uber-dest-pin",
          html: `
            <div style="display:flex; flex-direction:column; align-items:center;">
              <div style="background:#059669; color:#f0fdf4; border:2px solid #ffffff; font-size:10px; font-weight:800; padding:2px 6px; border-radius:4px; box-shadow:0 2px 8px rgba(0,0,0,0.5); white-space:nowrap;">
                আয়েশা মেডিকেল
              </div>
              <div style="width:12px; height:12px; background:#10b981; border:2px solid #ffffff; border-radius:50%; margin-top:2px;"></div>
            </div>
          `,
          iconSize: [90, 36],
          iconAnchor: [45, 36],
        });

        const map = L.map(mapContainerRef.current, {
          zoomControl: false,
          attributionControl: false,
        }).setView([currentStep.lat, currentStep.lng], 17);

        // High contrast Voyager tile layer for crisp Uber-style streets
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
        const fullCoordinates: [number, number][] = DHAKA_UBER_ROUTE.map((w) => [w.lat, w.lng]);
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
        const lastWp = DHAKA_UBER_ROUTE[DHAKA_UBER_ROUTE.length - 1];
        L.marker([lastWp.lat, lastWp.lng], { icon: destIcon }).addTo(map);

        mapInstanceRef.current = map;
      }
    }

    initMap();

    return () => {
      isSubscribed = false;
    };
  }, []);

  // Update marker position and polyline trails as step changes
  useEffect(() => {
    if (!mapInstanceRef.current || !userMarkerRef.current) return;

    async function updatePosition() {
      const L = (await import("leaflet")).default;
      const wp = DHAKA_UBER_ROUTE[currentStepIdx];
      if (!wp) return;

      const newLatLng: [number, number] = [wp.lat, wp.lng];

      // Update puck icon with new heading
      const createPuckIcon = (heading: number) =>
        L.divIcon({
          className: "uber-user-puck",
          html: `
            <div style="position:relative; width:36px; height:36px; display:flex; align-items:center; justify-content:center;">
              <div style="position:absolute; width:36px; height:36px; border-radius:50%; background:rgba(2, 132, 199, 0.35); animation:pulse 1.8s infinite;"></div>
              <div style="width:22px; height:22px; border-radius:50%; background:#0284c7; border:3px solid #ffffff; box-shadow:0 0 12px #38bdf8; display:flex; align-items:center; justify-content:center;">
                <div style="width:0; height:0; border-left:4px solid transparent; border-right:4px solid transparent; border-bottom:7px solid #ffffff; transform:rotate(${heading}deg);"></div>
              </div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

      userMarkerRef.current.setIcon(createPuckIcon(wp.heading));
      userMarkerRef.current.setLatLng(newLatLng);

      // Smooth pan
      mapInstanceRef.current.panTo(newLatLng, { animate: true, duration: 0.8 });

      // Update polylines
      const passedCoords: [number, number][] = DHAKA_UBER_ROUTE.slice(0, currentStepIdx + 1).map((w) => [w.lat, w.lng]);
      const remainingCoords: [number, number][] = DHAKA_UBER_ROUTE.slice(currentStepIdx).map((w) => [w.lat, w.lng]);

      if (passedPolylineRef.current) {
        passedPolylineRef.current.setLatLngs(passedCoords as [number, number][]);
      }
      if (activePolylineRef.current) {
        activePolylineRef.current.setLatLngs(remainingCoords as [number, number][]);
      }
    }

    updatePosition();
  }, [currentStepIdx]);

  // Turn-by-Turn Navigation Interval Timer (Uber movement loop)
  useEffect(() => {
    if (!isNavigating) return;

    const baseIntervalMs = 4500 / speedMultiplier;

    const timer = setInterval(() => {
      setCurrentStepIdx((prev) => {
        const nextIdx = prev + 1;
        if (nextIdx < DHAKA_UBER_ROUTE.length) {
          const nextWp = DHAKA_UBER_ROUTE[nextIdx];
          speak(nextWp.instructionBn);
          return nextIdx;
        } else {
          // Reached destination
          setIsNavigating(false);
          speak(DHAKA_UBER_ROUTE[DHAKA_UBER_ROUTE.length - 1].instructionBn);
          return prev;
        }
      });
    }, baseIntervalMs);

    return () => clearInterval(timer);
  }, [isNavigating, speedMultiplier]);

  const handleToggleNavigation = () => {
    if (currentStepIdx >= DHAKA_UBER_ROUTE.length - 1) {
      // If at end, restart from beginning
      setCurrentStepIdx(0);
      setIsNavigating(true);
      speak(DHAKA_UBER_ROUTE[0].instructionBn);
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
    speak(DHAKA_UBER_ROUTE[0].instructionBn);
  };

  const handleSpeakCurrent = () => {
    speak(currentStep.instructionBn);
  };

  const directMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${DHAKA_UBER_ROUTE[0].lat},${DHAKA_UBER_ROUTE[0].lng}&destination=${DHAKA_UBER_ROUTE[4].lat},${DHAKA_UBER_ROUTE[4].lng}&travelmode=walking`;

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
            padding: "0.45rem 0.85rem",
            background: "#090d16",
            borderBottom: "1px solid #1e293b",
            fontSize: "0.78rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                background: "rgba(2, 132, 199, 0.15)",
                color: "#38bdf8",
                border: "1px solid #0284c7",
                padding: "2px 6px",
                borderRadius: "3px",
                fontWeight: 800,
                fontSize: "0.68rem",
              }}
            >
              UBER LIVE NAVIGATION
            </span>
            <span style={{ color: "#94a3b8", fontWeight: 600 }}>
              {isNavigating ? "হাঁটা চলছে" : currentStepIdx === DHAKA_UBER_ROUTE.length - 1 ? "গন্তব্যে পৌঁছেছেন" : "বিরতিতে"}
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
                padding: "2px 8px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              উবার ম্যাপ
            </button>
            <button
              type="button"
              onClick={() => setViewMode("camera")}
              style={{
                background: viewMode === "camera" ? "#0284c7" : "#1e293b",
                color: viewMode === "camera" ? "#ffffff" : "#94a3b8",
                border: "1px solid #334155",
                borderRadius: "4px",
                padding: "2px 8px",
                cursor: "pointer",
                fontWeight: 700,
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
                padding: "2px 8px",
                cursor: "pointer",
                fontWeight: 700,
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
            <div
              style={{
                position: "absolute",
                top: "8px",
                left: "8px",
                background: "rgba(15, 23, 42, 0.88)",
                border: "1px solid #0284c7",
                borderRadius: "4px",
                padding: "2px 6px",
                fontSize: "0.68rem",
                color: "#38bdf8",
                fontWeight: 800,
              }}
            >
              LIVE ROAD CAMERA
            </div>

            {/* Bounding box: Pharmacy destination */}
            <div
              style={{
                position: "absolute",
                top: "14%",
                left: "14%",
                width: "36%",
                height: "32%",
                border: "2px solid #38bdf8",
                borderRadius: "6px",
                boxShadow: "0 0 10px rgba(56, 189, 248, 0.7)",
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "-18px",
                  left: 0,
                  background: "#0369a1",
                  color: "#f0fdf4",
                  fontSize: "9px",
                  fontWeight: 800,
                  padding: "1px 5px",
                  borderRadius: "2px",
                  whiteSpace: "nowrap",
                }}
              >
                [গন্তব্য: আয়েশা মেডিকেল হল (৪০মি)]
              </span>
            </div>

            {/* Bounding box: Safe sidewalk */}
            <div
              style={{
                position: "absolute",
                bottom: "10%",
                left: "22%",
                width: "56%",
                height: "34%",
                border: "2px dashed #10b981",
                borderRadius: "4px",
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: "-16px",
                  left: 0,
                  background: "#064e3b",
                  color: "#a7f3d0",
                  fontSize: "9px",
                  fontWeight: 800,
                  padding: "1px 5px",
                  borderRadius: "2px",
                  whiteSpace: "nowrap",
                }}
              >
                [নিরাপদ ফুটপাত: পথ পরিষ্কার]
              </span>
            </div>
          </div>
        )}

        {/* Map Half (Shown in map or split mode) */}
        {(viewMode === "map" || viewMode === "split") && (
          <div
            style={{
              position: "relative",
              flex: viewMode === "split" ? "0 0 50%" : "1 1 100%",
              width: "100%",
              overflow: "hidden",
            }}
          >
            {/* The Leaflet Map Canvas */}
            <div
              ref={mapContainerRef}
              style={{
                width: "100%",
                height: "100%",
                background: "#020617",
              }}
            />

            {/* Top Uber-Style Turn Maneuver Header Card */}
            <div
              style={{
                position: "absolute",
                top: "10px",
                left: "10px",
                right: "10px",
                background: "rgba(6, 78, 59, 0.94)",
                border: "1px solid #10b981",
                borderRadius: "8px",
                padding: "0.55rem 0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "0.75rem",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
                zIndex: 1000,
              }}
            >
              {/* Maneuver Icon */}
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "#10b981",
                  color: "#022c22",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {currentStep.maneuver === "straight" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
                {currentStep.maneuver === "turn-right" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                )}
                {currentStep.maneuver === "turn-left" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                )}
                {currentStep.maneuver === "destination" && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="8" />
                  </svg>
                )}
              </div>

              {/* Maneuver Text & Distance */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                  <span style={{ fontSize: "1.1rem", fontWeight: 900, color: "#ffffff" }}>
                    {toBengaliDigits(currentStep.distanceToNextMeters)} মি
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "#a7f3d0", fontWeight: 700 }}>
                    পর মোড়
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "#f0fdf4",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {currentStep.instructionBn}
                </div>
              </div>
            </div>

            {/* Bottom Uber-Style Floating ETA Card */}
            <div
              style={{
                position: "absolute",
                bottom: "10px",
                left: "10px",
                right: "10px",
                background: "rgba(15, 23, 42, 0.94)",
                border: "1px solid #334155",
                borderRadius: "8px",
                padding: "0.55rem 0.85rem",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
                boxShadow: "0 4px 16px rgba(0, 0, 0, 0.6)",
                zIndex: 1000,
              }}
            >
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.95rem", fontWeight: 900, color: "#38bdf8" }}>
                    {toBengaliDigits(Math.ceil(currentStep.etaMinutes))} মিনিট
                  </span>
                  <span style={{ fontSize: "0.75rem", color: "#64748b" }}>•</span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#f8fafc" }}>
                    {toBengaliDigits(currentStep.totalRemainingMeters)} মিটার বাকি
                  </span>
                </div>
                <div style={{ fontSize: "0.72rem", color: "#94a3b8" }}>
                  গন্তব্য: আয়েশা মেডিকেল হল (ফার্মেসি)
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <button
                  type="button"
                  onClick={handleToggleNavigation}
                  style={{
                    background: isNavigating ? "#78350f" : "#065f46",
                    color: isNavigating ? "#fde68a" : "#a7f3d0",
                    border: `1px solid ${isNavigating ? "#f59e0b" : "#10b981"}`,
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {isNavigating ? "বিরতি" : currentStepIdx === DHAKA_UBER_ROUTE.length - 1 ? "পুনরায় শুরু" : "শুরু"}
                </button>

                <button
                  type="button"
                  onClick={handleSpeakCurrent}
                  style={{
                    background: "#1e293b",
                    color: "#f8fafc",
                    border: "1px solid #475569",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ভয়েস শুনুন
                </button>

                <a
                  href={directMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    background: "#0369a1",
                    color: "#ffffff",
                    border: "1px solid #38bdf8",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textDecoration: "none",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  গুগল ম্যাপস ↗
                </a>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Speed Multiplier & Waypoint Progress Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "0.4rem 0.85rem",
          background: "#020617",
          borderTop: "1px solid #1e293b",
          fontSize: "0.72rem",
          color: "#94a3b8",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span>অগ্রগতি: ধাপে ধাপে {toBengaliDigits(currentStepIdx + 1)}/{toBengaliDigits(DHAKA_UBER_ROUTE.length)}</span>
          <button
            type="button"
            onClick={handleRestart}
            style={{
              background: "transparent",
              border: "none",
              color: "#38bdf8",
              cursor: "pointer",
              fontWeight: 700,
              textDecoration: "underline",
              padding: 0,
            }}
          >
            রিসেট
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <span>গতি:</span>
          <button
            type="button"
            onClick={() => setSpeedMultiplier(1)}
            style={{
              background: speedMultiplier === 1 ? "#0284c7" : "#0f172a",
              color: speedMultiplier === 1 ? "#ffffff" : "#94a3b8",
              border: "1px solid #334155",
              borderRadius: "3px",
              padding: "1px 6px",
              fontSize: "0.68rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ১x (স্বাভাবিক)
          </button>
          <button
            type="button"
            onClick={() => setSpeedMultiplier(2)}
            style={{
              background: speedMultiplier === 2 ? "#0284c7" : "#0f172a",
              color: speedMultiplier === 2 ? "#ffffff" : "#94a3b8",
              border: "1px solid #334155",
              borderRadius: "3px",
              padding: "1px 6px",
              fontSize: "0.68rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            ২x (দ্রুত)
          </button>
        </div>
      </div>
    </div>
  );
}
