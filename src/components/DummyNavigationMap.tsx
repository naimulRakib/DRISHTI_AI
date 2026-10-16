"use client";

import React, { useEffect, useState, useCallback } from "react";
import { speak } from "@/lib/tools/speech";
import { toBengaliDigits } from "@/lib/storage/geofenceStore";

export interface DummyWaypoint {
  xPercent: number; // percentage from left
  yPercent: number; // percentage from top
  heading: number; // orientation in degrees
  instructionBn: string;
  maneuver: "straight" | "turn-right" | "turn-left" | "destination";
  distanceToNextMeters: number;
  totalRemainingMeters: number;
  etaMinutes: number;
  streetNameBn: string;
}

// Visual waypoints precisely aligned to the Dhaka road graphic
export const DHAKA_IMAGE_ROUTE: DummyWaypoint[] = [
  {
    xPercent: 23.5,
    yPercent: 65.5,
    heading: 68,
    instructionBn: "যাত্রা শুরু হয়েছে। ফুটপাত দিয়ে একদম সোজা সামনে চলুন।",
    maneuver: "straight",
    distanceToNextMeters: 45,
    totalRemainingMeters: 140,
    etaMinutes: 2,
    streetNameBn: "তোপখানা রোড (ফুটপাত)",
  },
  {
    xPercent: 38.0,
    yPercent: 55.0,
    heading: 65,
    instructionBn: "সামনে ৪০ মিটার পর ফুটপাত ঘেঁষে সামান্য ডানে মোড় নিন।",
    maneuver: "straight",
    distanceToNextMeters: 40,
    totalRemainingMeters: 95,
    etaMinutes: 1.5,
    streetNameBn: "তোপখানা রোড মোড়",
  },
  {
    xPercent: 58.0,
    yPercent: 41.5,
    heading: 60,
    instructionBn: "সাবধান, ফুটপাতে একটু বাঁয়ে থাকুন, সামনে ডানে ফার্মেসির গলিতে মোড় নিন।",
    maneuver: "turn-right",
    distanceToNextMeters: 30,
    totalRemainingMeters: 55,
    etaMinutes: 1,
    streetNameBn: "মেডিকেল স্কয়ার লেন",
  },
  {
    xPercent: 82.5,
    yPercent: 29.5,
    heading: 135,
    instructionBn: "সামনে আয়েশা মেডিকেল হলের সাইনবোর্ড দেখা যাচ্ছে। আর ২৫ কদম সোজা চলুন।",
    maneuver: "straight",
    distanceToNextMeters: 25,
    totalRemainingMeters: 25,
    etaMinutes: 0.5,
    streetNameBn: "ফার্মেসি গলি",
  },
  {
    xPercent: 81.2,
    yPercent: 80.0,
    heading: 180,
    instructionBn: "আপনার গন্তব্য আয়েশা মেডিকেল হল সামনে ডানপাশে। পথচলা সমাপ্ত।",
    maneuver: "destination",
    distanceToNextMeters: 0,
    totalRemainingMeters: 0,
    etaMinutes: 0,
    streetNameBn: "আয়েশা মেডিকেল হল সম্মুখ",
  },
];

export interface DummyNavigationMapProps {
  initialAutoPlay?: boolean;
  onGuidanceChange?: (guidanceBn: string) => void;
  height?: string;
  showCameraToggle?: boolean;
  videoSrc?: string;
}

export default function DummyNavigationMap({
  initialAutoPlay = true,
  onGuidanceChange,
  height = "380px",
}: DummyNavigationMapProps) {
  const [currentStepIdx, setCurrentStepIdx] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState<boolean>(initialAutoPlay);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1);

  const currentStep = DHAKA_IMAGE_ROUTE[currentStepIdx] || DHAKA_IMAGE_ROUTE[0];

  // Notify parent of guidance updates
  useEffect(() => {
    if (onGuidanceChange) {
      onGuidanceChange(currentStep.instructionBn);
    }
  }, [currentStepIdx, currentStep.instructionBn, onGuidanceChange]);

  // Turn-by-Turn automated movement timer
  useEffect(() => {
    if (!isNavigating) return;

    const baseIntervalMs = 4500 / speedMultiplier;

    const timer = setInterval(() => {
      setCurrentStepIdx((prev) => {
        const nextIdx = prev + 1;
        if (nextIdx < DHAKA_IMAGE_ROUTE.length) {
          const nextWp = DHAKA_IMAGE_ROUTE[nextIdx];
          speak(nextWp.instructionBn);
          return nextIdx;
        } else {
          setIsNavigating(false);
          speak(DHAKA_IMAGE_ROUTE[DHAKA_IMAGE_ROUTE.length - 1].instructionBn);
          return prev;
        }
      });
    }, baseIntervalMs);

    return () => clearInterval(timer);
  }, [isNavigating, speedMultiplier]);

  const handleToggleNavigation = () => {
    if (currentStepIdx >= DHAKA_IMAGE_ROUTE.length - 1) {
      setCurrentStepIdx(0);
      setIsNavigating(true);
      speak(DHAKA_IMAGE_ROUTE[0].instructionBn);
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
    speak(DHAKA_IMAGE_ROUTE[0].instructionBn);
  };

  const handleSpeakCurrent = () => {
    speak(currentStep.instructionBn);
  };

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

  // Build SVG points for route lines
  const pointsString = DHAKA_IMAGE_ROUTE.map((wp) => `${wp.xPercent},${wp.yPercent}`).join(" ");
  const passedPointsString = DHAKA_IMAGE_ROUTE.slice(0, currentStepIdx + 1).map((wp) => `${wp.xPercent},${wp.yPercent}`).join(" ");

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height,
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid #1e293b",
        background: "#020617",
      }}
    >
      {/* Background Dummy Map Image */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/demo/dhaka_dummy_map.jpg"
        alt="Dhaka Street Map"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          filter: "brightness(0.92) contrast(1.08)",
        }}
      />

      {/* SVG Path Overlay Aligned to Streets */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {/* Full planned route (glowing electric cyan) */}
        <polyline
          points={pointsString}
          fill="none"
          stroke="#0284c7"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.9, filter: "drop-shadow(0 0 4px #0284c7)" }}
        />

        {/* Passed route segment (muted slate gray) */}
        {passedPointsString && (
          <polyline
            points={passedPointsString}
            fill="none"
            stroke="#64748b"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.85 }}
          />
        )}
      </svg>

      {/* Destination Pin (Ayesha Medical Hall) */}
      <div
        style={{
          position: "absolute",
          left: `${DHAKA_IMAGE_ROUTE[4].xPercent}%`,
          top: `${DHAKA_IMAGE_ROUTE[4].yPercent}%`,
          transform: "translate(-50%, -100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          pointerEvents: "none",
          zIndex: 40,
        }}
      >
        <div
          style={{
            background: "#059669",
            color: "#ffffff",
            fontWeight: 800,
            fontSize: "10px",
            padding: "2px 6px",
            borderRadius: "4px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.6)",
            whiteSpace: "nowrap",
            border: "1px solid #34d399",
          }}
        >
          আয়েশা মেডিকেল হল
        </div>
        <div style={{ width: "2px", height: "6px", background: "#059669" }} />
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#10b981", border: "2px solid #ffffff", boxShadow: "0 0 8px #10b981" }} />
      </div>

      {/* Dynamic Animated User Navigation Puck */}
      <div
        style={{
          position: "absolute",
          left: `${currentStep.xPercent}%`,
          top: `${currentStep.yPercent}%`,
          transform: "translate(-50%, -50%)",
          transition: "left 0.8s ease-out, top 0.8s ease-out",
          pointerEvents: "none",
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "36px",
          height: "36px",
        }}
      >
        {/* Radar wave */}
        <div
          style={{
            position: "absolute",
            width: "36px",
            height: "36px",
            borderRadius: "50%",
            background: "rgba(2, 132, 199, 0.35)",
            animation: "pulse 1.8s infinite ease-out",
          }}
        />
        {/* Heading pointer circle */}
        <div
          style={{
            position: "relative",
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background: "#0284c7",
            border: "3px solid #ffffff",
            boxShadow: "0 0 12px rgba(2, 132, 199, 0.95)",
            transform: `rotate(${currentStep.heading}deg)`,
            transition: "transform 0.4s ease-out",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: "-7px",
              width: 0,
              height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderBottom: "7px solid #38bdf8",
            }}
          />
          <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#ffffff" }} />
        </div>
      </div>

      {/* Top Turn Maneuver Card */}
      <div
        style={{
          position: "absolute",
          top: "12px",
          left: "12px",
          right: "12px",
          zIndex: 100,
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
          zIndex: 100,
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
            {isNavigating ? "বিরতি" : currentStepIdx === DHAKA_IMAGE_ROUTE.length - 1 ? "পুনরায় শুরু" : "শুরু"}
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
