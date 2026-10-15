"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import "leaflet/dist/leaflet.css";
import { speak } from "@/lib/tools/speech";
import { toBengaliDigits } from "@/lib/storage/geofenceStore";

export interface NavWaypoint {
  lat: number;
  lng: number;
  heading: number;
  instructionBn: string;
  maneuver: "straight" | "turn-right" | "turn-left" | "destination";
  distanceToNextMeters: number;
  totalRemainingMeters: number;
  etaMinutes: number;
  streetNameBn: string;
}

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
  height = "420px",
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletModuleRef = useRef<any>(null);

  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState<boolean>(initialAutoPlay);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);

  const currentStep = DHAKA_SIMULATED_ROUTE[currentStepIdx] || DHAKA_SIMULATED_ROUTE[0];

  // Helper: Create animated navigation puck
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getPuckIcon = useCallback((L: any, heading: number) => {
    return L.divIcon({
      className: "drishti-live-puck",
      html: `
        <div style="position: relative; width: 42px; height: 42px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; inset: 0; border-radius: 50%; background: rgba(2, 132, 199, 0.28); pointer-events: none;"></div>
          <div style="position: relative; width: 22px; height: 22px; border-radius: 50%; background: #0284c7; border: 3px solid #ffffff; box-shadow: 0 0 12px rgba(2, 132, 199, 0.9); transform: rotate(${heading}deg); transition: transform 0.4s ease-out; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; top: -7px; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 8px solid #38bdf8;"></div>
            <div style="width: 6px; height: 6px; border-radius: 50%; background: #ffffff;"></div>
          </div>
        </div>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 21],
    });
  }, []);

  // Helper: Create destination pin
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getDestIcon = useCallback((L: any) => {
    return L.divIcon({
      className: "drishti-dest-pin",
      html: `
        <div style="position: relative; display: flex; flex-direction: column; align-items: center; pointer-events: none;">
          <div style="background: #059669; color: #ffffff; font-weight: 800; font-size: 11px; padding: 2px 7px; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.4); white-space: nowrap; border: 1px solid #34d399;">
            আয়েশা মেডিকেল হল
          </div>
          <div style="width: 2px; height: 6px; background: #059669;"></div>
          <div style="width: 8px; height: 8px; border-radius: 50%; background: #10b981; border: 2px solid #ffffff; box-shadow: 0 0 8px #10b981;"></div>
        </div>
      `,
      iconSize: [120, 42],
      iconAnchor: [60, 42],
    });
  }, []);

  // Initialize Leaflet Map ONCE on mount
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isCancelled = false;

    const setupMap = async () => {
      const L = await import("leaflet");
      if (isCancelled || !mapContainerRef.current) return;

      leafletModuleRef.current = L;

      // Clean up previous instance if any
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const initialWp = DHAKA_SIMULATED_ROUTE[0];
      const map = L.map(mapContainerRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([initialWp.lat, initialWp.lng], 17);

      // Open, high-contrast CartoDB Voyager tiles (100% free, reliable, no API key)
      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        maxZoom: 20,
      }).addTo(map);

      // Passed route polyline
      passedPolylineRef.current = L.polyline([], {
        color: "#64748b",
        weight: 6,
        opacity: 0.8,
      }).addTo(map);

      // Active forward route polyline
      const allCoords: [number, number][] = DHAKA_SIMULATED_ROUTE.map((w) => [w.lat, w.lng]);
      activePolylineRef.current = L.polyline(allCoords as [number, number][], {
        color: "#0284c7",
        weight: 6,
        opacity: 0.95,
      }).addTo(map);

      // Destination Marker
      const lastWp = DHAKA_SIMULATED_ROUTE[DHAKA_SIMULATED_ROUTE.length - 1];
      L.marker([lastWp.lat, lastWp.lng], { icon: getDestIcon(L) }).addTo(map);

      // User Position Marker
      userMarkerRef.current = L.marker([initialWp.lat, initialWp.lng], {
        icon: getPuckIcon(L, initialWp.heading),
      }).addTo(map);

      mapInstanceRef.current = map;

      // Force recalculation of container size
      setTimeout(() => {
        if (!isCancelled && mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize();
        }
      }, 150);
    };

    setupMap();

    return () => {
      isCancelled = true;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [getDestIcon, getPuckIcon]);

  // Handle waypoint step progression
  useEffect(() => {
    if (!mapInstanceRef.current || !userMarkerRef.current || !leafletModuleRef.current) return;

    const L = leafletModuleRef.current;
    const wp = DHAKA_SIMULATED_ROUTE[currentStepIdx];
    if (!wp) return;

    const newLatLng: [number, number] = [wp.lat, wp.lng];

    // Update Puck position and rotation heading
    userMarkerRef.current.setIcon(getPuckIcon(L, wp.heading));
    userMarkerRef.current.setLatLng(newLatLng);

    // Pan map smoothly to new position
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

    if (onGuidanceChange) {
      onGuidanceChange(wp.instructionBn);
    }
  }, [currentStepIdx, getPuckIcon, onGuidanceChange]);

  // Turn-by-Turn Automated Walk Timer
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
      setCurrentStepIdx(0);
      setIsNavigating(true);
      speak(DHAKA_SIMULATED_ROUTE[0].instructionBn);
    } else {
      const nextState = !isNavigating;
      setIsNavigating(nextState);
      if (nextState) {
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

  // Maneuver SVG icon
  const renderManeuverIcon = () => {
    switch (currentStep.maneuver) {
      case "straight":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="19" x2="12" y2="5" />
            <polyline points="5 12 12 5 19 12" />
          </svg>
        );
      case "turn-right":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
            <path d="M4 18h7a4 4 0 0 0 4-4V6" />
          </svg>
        );
      case "turn-left":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
            <path d="M20 18h-7a4 4 0 0 1-4-4V6" />
          </svg>
        );
      case "destination":
        return (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        );
    }
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: "10px",
        overflow: "hidden",
        border: "1px solid #1e293b",
        background: "#020617",
      }}
    >
      {/* Leaflet Map Canvas */}
      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: "100%",
          background: "#0f172a",
        }}
      />

      {/* Top Turn Maneuver Card */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          right: "12px",
          zIndex: 1000,
          background: "rgba(10, 15, 29, 0.94)",
          backdropFilter: "blur(8px)",
          border: "1px solid #0284c7",
          borderRadius: "8px",
          padding: "0.55rem 0.85rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "6px",
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
            <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>
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

        <button
          type="button"
          onClick={handleSpeakCurrent}
          title="দিকনির্দেশনা শুনুন"
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

      {/* Bottom Floating Control & Status Card */}
      <div
        style={{
          position: "absolute",
          bottom: "12px",
          left: "12px",
          right: "12px",
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
          boxShadow: "0 4px 14px rgba(0, 0, 0, 0.5)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
          <span style={{ fontSize: "1.05rem", fontWeight: 800, color: "#10b981" }}>
            {toBengaliDigits(currentStep.etaMinutes)} মিনিট
          </span>
          <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
            ({toBengaliDigits(currentStep.totalRemainingMeters)} মি বাকি)
          </span>
          <span style={{ fontSize: "0.75rem", color: "#64748b" }}>•</span>
          <span style={{ fontSize: "0.78rem", color: "#cbd5e1", fontWeight: 700 }}>
            গন্তব্য: আয়েশা মেডিকেল হল
          </span>
        </div>

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
            title="রিসেট"
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
            {toBengaliDigits(speedMultiplier)}x
          </button>
        </div>
      </div>
    </div>
  );
}
