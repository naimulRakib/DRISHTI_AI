"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  SpatialObstacle,
  scanEcholocationRadar,
  formatClockDirectionBn,
  toBengaliNumeral,
} from "@/lib/tools/echolocationRadar";
import { echolocationEngine, RadarTarget } from "@/lib/audio/echolocationEngine";
import { speak } from "@/lib/tools/speech";
import { triggerHaptic } from "@/lib/native/bridge";

interface EcholocationRadarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function EcholocationRadarModal({
  isOpen,
  onClose,
}: EcholocationRadarModalProps) {
  const [isContinuousSound, setIsContinuousSound] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [activeObstacles, setActiveObstacles] = useState<SpatialObstacle[]>([
    {
      id: "demo-obs-1",
      label: "chair",
      labelBn: "চেয়ার (Chair)",
      pan: 0.05,
      distanceMeters: 1.2,
      clockHour: 12,
      elevation: "mid",
      threatLevel: "warning",
      confidence: 0.92,
    },
    {
      id: "demo-obs-2",
      label: "person",
      labelBn: "মানুষ (Person)",
      pan: -0.65,
      distanceMeters: 2.1,
      clockHour: 10,
      elevation: "mid",
      threatLevel: "caution",
      confidence: 0.88,
    },
  ]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const handleClose = () => {
    echolocationEngine.stopContinuousScan();
    setIsContinuousSound(false);
    onClose();
  };

  // Initialize camera and greeting
  useEffect(() => {
    if (!isOpen) return;

    speak("৩ডি অডিও ইকোলোকেশন ও অবস্ট্যাকল রাডার সক্রিয় হয়েছে। হেডফোনে দিক ও দূরত্বের শব্দ শুনুন।");

    let active = true;
    if (navigator?.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        })
        .then(async (stream) => {
          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});
          }
        })
        .catch(() => {
          // Camera optional; simulated radar targets remain operational
        });
    }

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      echolocationEngine.stopContinuousScan();
    };
  }, [isOpen]);

  // Handle continuous audio scanning loop
  const handleToggleContinuous = () => {
    if (isContinuousSound) {
      echolocationEngine.stopContinuousScan();
      setIsContinuousSound(false);
      setFeedback("অবিরত সোনার সাউন্ড বন্ধ করা হয়েছে।");
      speak("সোনার সাউন্ড বন্ধ করা হয়েছে।");
    } else {
      setIsContinuousSound(true);
      setFeedback("অবিরত ৩ডি সোনার সাউন্ড সক্রিয়। দূরত্ব অনুযায়ী বিপিং পরিবর্তন হবে।");
      speak("৩ডি সোনার সাউন্ড চালু।");

      echolocationEngine.startContinuousScan(() => {
        if (activeObstacles.length === 0) return null;
        const closest = activeObstacles[0];
        const target: RadarTarget = {
          id: closest.id,
          labelBn: closest.labelBn,
          pan: closest.pan,
          distanceMeters: closest.distanceMeters,
          clockHour: closest.clockHour,
          isImminentThreat: closest.threatLevel === "critical",
        };
        return target;
      });
    }
  };

  // Perform single radar sweep
  const handleSingleSweep = async () => {
    setIsScanning(true);
    setFeedback("পরিবেশে শব্দের প্রতিফলন স্ক্যান করা হচ্ছে...");

    let imageEl: HTMLVideoElement | undefined = undefined;
    if (videoRef.current && videoRef.current.readyState >= 2) {
      imageEl = videoRef.current;
    }

    const result = await scanEcholocationRadar(imageEl);
    setIsScanning(false);
    setFeedback(result.message_bn);
  };

  // Headphone ear test
  const handleEarTest = (side: "left" | "right") => {
    echolocationEngine.playStereoEarTest(side);
    triggerHaptic(side === "left" ? "turn_left" : "turn_right");
    const msg = side === "left" ? "বাম কানে শব্দ বাজানো হয়েছে।" : "ডান কানে শব্দ বাজানো হয়েছে।";
    setFeedback(msg);
  };

  // Inject obstacle simulation presets
  const handleInjectObstacle = (type: "critical" | "left" | "right" | "clear") => {
    if (type === "clear") {
      setActiveObstacles([]);
      echolocationEngine.playSpatialPing({ pan: 0, distanceMeters: 3.5, volume: 0.2 });
      setFeedback("পথ সম্পূর্ণ পরিষ্কার। ৩ মিটারের মধ্যে কোনো বাধা নেই।");
      speak("পথ সম্পূর্ণ পরিষ্কার।");
      return;
    }

    if (type === "critical") {
      const obstacle: SpatialObstacle = {
        id: `obs-${Date.now()}`,
        label: "wall",
        labelBn: "দেয়াল বা বড় বাধা",
        pan: 0,
        distanceMeters: 0.6,
        clockHour: 12,
        elevation: "mid",
        threatLevel: "critical",
        confidence: 0.98,
      };
      setActiveObstacles([obstacle]);
      echolocationEngine.playSpatialPing({ pan: 0, distanceMeters: 0.6, volume: 1.0 });
      triggerHaptic("obstacle_alert");
      const msg = "জরুরি সতর্কতা! সরাসরি ১২ টার দিকে মাত্র ০.৬ মিটারে দেয়াল বা বড় বাধা!";
      setFeedback(msg);
      speak(msg);
      return;
    }

    if (type === "left") {
      const obstacle: SpatialObstacle = {
        id: `obs-${Date.now()}`,
        label: "pole",
        labelBn: "বৈদ্যুতিক খুঁটি / পিলার",
        pan: -0.7,
        distanceMeters: 1.4,
        clockHour: 10,
        elevation: "high",
        threatLevel: "warning",
        confidence: 0.9,
      };
      setActiveObstacles([obstacle]);
      echolocationEngine.playSpatialPing({ pan: -0.7, distanceMeters: 1.4, elevation: "high", volume: 0.8 });
      triggerHaptic("turn_right");
      const msg = "সাবধান! ১০ টার দিকে ১.৪ মিটার দূরে মাথার কাছে বৈদ্যুতিক খুঁটি!";
      setFeedback(msg);
      speak(msg);
      return;
    }

    if (type === "right") {
      const obstacle: SpatialObstacle = {
        id: `obs-${Date.now()}`,
        label: "rickshaw",
        labelBn: "রিকশা / যানবাহন",
        pan: 0.65,
        distanceMeters: 1.8,
        clockHour: 2,
        elevation: "mid",
        threatLevel: "warning",
        confidence: 0.91,
      };
      setActiveObstacles([obstacle]);
      echolocationEngine.playSpatialPing({ pan: 0.65, distanceMeters: 1.8, volume: 0.8 });
      triggerHaptic("turn_left");
      const msg = "সাবধান! ২ টার দিকে ১.৮ মিটার দূরে রিকশা বা যানবাহন!";
      setFeedback(msg);
      speak(msg);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="radar-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.88)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "#070d19",
          border: "2px solid #0284c7",
          borderRadius: "1rem",
          width: "100%",
          maxWidth: "760px",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.95)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.2rem 1.5rem",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#0c172a",
          }}
        >
          <div>
            <h2
              id="radar-modal-title"
              style={{
                fontSize: "1.35rem",
                fontWeight: 700,
                color: "#38bdf8",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span>🦇</span> ৩ডি অডিও ইকোলোকেশন ও অবস্ট্যাকল রাডার
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>
              বাদুড়ের মতো শব্দের অনুরণন ও দিকদর্শী ভাইব্রেশনের সাহায্যে পথ চলা
            </p>
          </div>
          <button
            onClick={handleClose}
            aria-label="বন্ধ করুন"
            style={{
              background: "transparent",
              border: "1px solid #475569",
              color: "#cbd5e1",
              fontSize: "1.25rem",
              width: "2.5rem",
              height: "2.5rem",
              borderRadius: "0.5rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ✕
          </button>
        </div>

        {/* Hidden video element for live camera ingestion */}
        <video ref={videoRef} playsInline muted style={{ display: "none" }} />

        {/* Body content */}
        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}>
          {/* Feedback banner */}
          {feedback && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                backgroundColor: "rgba(56, 189, 248, 0.15)",
                border: "1px solid #38bdf8",
                color: "#e0f2fe",
                fontSize: "0.95rem",
                fontWeight: 600,
                marginBottom: "1rem",
              }}
            >
              {feedback}
            </div>
          )}

          {/* Sonar Radar Screen Visualization */}
          <div
            style={{
              backgroundColor: "#030712",
              border: "2px solid #1e293b",
              borderRadius: "1rem",
              padding: "1rem",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
              marginBottom: "1.25rem",
              minHeight: "260px",
            }}
          >
            <svg
              viewBox="0 0 300 200"
              style={{ width: "100%", maxWidth: "360px", overflow: "visible" }}
            >
              {/* Concentric Sonar Distance Arcs */}
              <circle cx="150" cy="190" r="150" fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx="150" cy="190" r="110" fill="none" stroke="#1e293b" strokeWidth="1.5" />
              <circle cx="150" cy="190" r="70" fill="none" stroke="#334155" strokeWidth="1.5" />
              <circle cx="150" cy="190" r="35" fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="2 2" />

              {/* Bearing Radial Lines */}
              <line x1="150" y1="190" x2="150" y2="40" stroke="#0284c7" strokeWidth="1" strokeDasharray="2 2" />
              <line x1="150" y1="190" x2="50" y2="90" stroke="#1e293b" strokeWidth="1" />
              <line x1="150" y1="190" x2="250" y2="90" stroke="#1e293b" strokeWidth="1" />

              {/* Clock labels */}
              <text x="150" y="32" fill="#38bdf8" fontSize="10" fontWeight="bold" textAnchor="middle">১২ টা (সামনে)</text>
              <text x="35" y="85" fill="#94a3b8" fontSize="9" textAnchor="middle">১০ টা (বাম)</text>
              <text x="265" y="85" fill="#94a3b8" fontSize="9" textAnchor="middle">২ টা (ডান)</text>

              {/* Distance range tags */}
              <text x="154" y="160" fill="#f87171" fontSize="8">০.৮ মি</text>
              <text x="154" y="125" fill="#fbbf24" fontSize="8">১.৫ মি</text>
              <text x="154" y="85" fill="#4ade80" fontSize="8">২.৫ মি</text>

              {/* Obstacle Blips */}
              {activeObstacles.map((obs) => {
                // Map pan (-1 to 1) and distance (0.3m to 4m) to SVG canvas
                const angleRad = (Math.PI / 2) - (obs.pan * (Math.PI / 3)); // forward 120 deg cone
                const radius = Math.min(150, Math.max(30, (obs.distanceMeters / 3.5) * 150));
                const bx = 150 + Math.cos(angleRad) * radius;
                const by = 190 - Math.sin(angleRad) * radius;
                const isCrit = obs.threatLevel === "critical";

                return (
                  <g key={obs.id}>
                    <circle cx={bx} cy={by} r={isCrit ? 10 : 7} fill={isCrit ? "#ef4444" : "#f59e0b"} opacity={0.8} />
                    <circle cx={bx} cy={by} r={isCrit ? 16 : 11} fill="none" stroke={isCrit ? "#ef4444" : "#f59e0b"} strokeWidth="1.5">
                      <animate attributeName="r" values={isCrit ? "10;18;10" : "7;13;7"} dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.9;0.1;0.9" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                    <text x={bx} y={by - 12} fill="#ffffff" fontSize="9" fontWeight="bold" textAnchor="middle">
                      {obs.labelBn.split(" ")[0]} ({toBengaliNumeral(obs.distanceMeters.toFixed(1))}m)
                    </text>
                  </g>
                );
              })}

              {/* User Center Avatar */}
              <circle cx="150" cy="190" r="10" fill="#0284c7" />
              <text x="150" y="193" fill="#ffffff" fontSize="8" fontWeight="bold" textAnchor="middle">আপনি</text>
            </svg>

            {/* Sweep arm info overlay */}
            <div
              style={{
                position: "absolute",
                top: "12px",
                right: "16px",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span
                style={{
                  width: "10px",
                  height: "10px",
                  borderRadius: "50%",
                  backgroundColor: isContinuousSound ? "#22c55e" : "#64748b",
                  boxShadow: isContinuousSound ? "0 0 8px #22c55e" : "none",
                }}
              />
              <span style={{ fontSize: "0.8rem", color: isContinuousSound ? "#4ade80" : "#94a3b8" }}>
                {isContinuousSound ? "লাইভ ৩ডি অডিও বিপিং চালু" : "অডিও নিস্তব্ধ"}
              </span>
            </div>
          </div>

          {/* Primary Action Controls */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "0.75rem",
              marginBottom: "1.25rem",
            }}
          >
            <button
              type="button"
              onClick={handleToggleContinuous}
              style={{
                backgroundColor: isContinuousSound ? "#15803d" : "#0284c7",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.85rem 1rem",
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              <span>{isContinuousSound ? "⏹️" : "🔊"}</span>
              {isContinuousSound ? "৩ডি সোনার শব্দ বন্ধ করুন" : "৩ডি সোনার শব্দ চালু করুন"}
            </button>

            <button
              type="button"
              onClick={handleSingleSweep}
              disabled={isScanning}
              style={{
                backgroundColor: "#1e293b",
                color: "#f8fafc",
                border: "1px solid #475569",
                borderRadius: "0.5rem",
                padding: "0.85rem 1rem",
                fontSize: "0.95rem",
                fontWeight: 600,
                cursor: isScanning ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
              }}
            >
              <span>🎯</span> {isScanning ? "স্ক্যান হচ্ছে..." : "একবার রাডার স্ক্যান"}
            </button>
          </div>

          {/* Headphone Stereo Balance Test */}
          <div
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "0.6rem",
              padding: "0.85rem 1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <span style={{ fontSize: "0.85rem", color: "#38bdf8", fontWeight: 600 }}>
                🎧 হেডফোন স্টেরিও যাচাই (বামে/ডানে স্পষ্ট শব্দ হচ্ছে কিনা পরীক্ষা করুন)
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => handleEarTest("left")}
                style={{
                  flex: 1,
                  backgroundColor: "#1e293b",
                  border: "1px solid #0284c7",
                  color: "#e0f2fe",
                  borderRadius: "0.4rem",
                  padding: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ◀️ বাম কান টেস্ট (Left)
              </button>
              <button
                type="button"
                onClick={() => handleEarTest("right")}
                style={{
                  flex: 1,
                  backgroundColor: "#1e293b",
                  border: "1px solid #0284c7",
                  color: "#e0f2fe",
                  borderRadius: "0.4rem",
                  padding: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                ▶️ ডান কান টেস্ট (Right)
              </button>
            </div>
          </div>

          {/* Live Detected Obstacles List */}
          <div>
            <h3 style={{ margin: "0 0 0.75rem", fontSize: "1.05rem", color: "#f8fafc" }}>
              সনাক্তকৃত বাধা তালিকা ({toBengaliNumeral(activeObstacles.length)}টি)
            </h3>

            {activeObstacles.length === 0 ? (
              <div
                style={{
                  padding: "1rem",
                  borderRadius: "0.5rem",
                  backgroundColor: "#1e293b",
                  color: "#4ade80",
                  textAlign: "center",
                  fontSize: "0.9rem",
                }}
              >
                ✅ সামনে ৩ মিটারের মধ্যে কোনো নিকটবর্তী বাধা নেই। পথ পরিষ্কার।
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {activeObstacles.map((obs) => {
                  const isCrit = obs.threatLevel === "critical";
                  const isWarn = obs.threatLevel === "warning";

                  return (
                    <div
                      key={obs.id}
                      style={{
                        backgroundColor: "#1e293b",
                        borderLeft: isCrit
                          ? "4px solid #ef4444"
                          : isWarn
                          ? "4px solid #f59e0b"
                          : "4px solid #38bdf8",
                        borderRadius: "0.4rem",
                        padding: "0.75rem 1rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "0.5rem",
                      }}
                    >
                      <div>
                        <strong style={{ color: isCrit ? "#f87171" : "#f8fafc", fontSize: "0.95rem" }}>
                          {obs.labelBn}
                        </strong>
                        <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.2rem" }}>
                          দিক: {formatClockDirectionBn(obs.clockHour)} | উচ্চতা:{" "}
                          {obs.elevation === "high"
                            ? "মাথার কাছে (উঁচুতে)"
                            : obs.elevation === "low"
                            ? "পায়ের কাছে (নিচে)"
                            : "মাঝারি"}
                        </div>
                      </div>

                      <div style={{ textAlign: "right" }}>
                        <div
                          style={{
                            fontSize: "1.1rem",
                            fontWeight: 700,
                            color: isCrit ? "#ef4444" : "#fbbf24",
                          }}
                        >
                          {toBengaliNumeral(obs.distanceMeters.toFixed(1))} মিটার
                        </div>
                        <span style={{ fontSize: "0.75rem", color: "#64748b" }}>
                          প্যান: {obs.pan > 0 ? `+${obs.pan}` : obs.pan}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Simulation Presets for Hands-On Testing */}
          <div style={{ marginTop: "1.25rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#64748b", display: "block", marginBottom: "0.5rem" }}>
              সিমুলেশন ও ইনডোর পরীক্ষার জন্য প্রেস করুন:
            </span>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => handleInjectObstacle("critical")}
                style={{
                  backgroundColor: "#450a0a",
                  color: "#fca5a5",
                  border: "1px solid #7f1d1d",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.65rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                ⚠️ সামনে দেয়াল (০.৬ মি)
              </button>
              <button
                type="button"
                onClick={() => handleInjectObstacle("left")}
                style={{
                  backgroundColor: "#1e293b",
                  color: "#93c5fd",
                  border: "1px solid #3b82f6",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.65rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                ◀️ বামে খুঁটি (১০ টা)
              </button>
              <button
                type="button"
                onClick={() => handleInjectObstacle("right")}
                style={{
                  backgroundColor: "#1e293b",
                  color: "#fed7aa",
                  border: "1px solid #f97316",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.65rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                ▶️ ডানে যানবাহন (২ টা)
              </button>
              <button
                type="button"
                onClick={() => handleInjectObstacle("clear")}
                style={{
                  backgroundColor: "#052e16",
                  color: "#86efac",
                  border: "1px solid #15803d",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.65rem",
                  fontSize: "0.75rem",
                  cursor: "pointer",
                }}
              >
                ✅ পথ পরিষ্কার
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "1rem 1.5rem",
            borderTop: "1px solid #1e293b",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#0c172a",
          }}
        >
          <span style={{ fontSize: "0.8rem", color: "#64748b" }}>
            3D Binaural Sound & Directional Haptics
          </span>
          <button
            type="button"
            onClick={handleClose}
            style={{
              backgroundColor: "#38bdf8",
              color: "#0f172a",
              border: "none",
              borderRadius: "0.5rem",
              padding: "0.6rem 1.25rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            সম্পন্ন
          </button>
        </div>
      </div>
    </div>
  );
}
