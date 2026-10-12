"use client";

import React, { useState } from "react";
import {
  simulatedProximityProvider,
  evaluateProximityWarning,
  readProximityTool,
} from "@/lib/tools/proximity";
import { speak } from "@/lib/tools/speech";

interface ProximityPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ProximityPanel({ isOpen, onClose }: ProximityPanelProps) {
  const [distance, setDistance] = useState<number>(() =>
    simulatedProximityProvider.getDistance()
  );

  if (!isOpen) return null;

  const warning = evaluateProximityWarning(distance);

  const bnDist = String(distance).replace(
    /\d/g,
    (d) => ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"][Number(d)]
  );

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setDistance(val);
    simulatedProximityProvider.setDistance(val);

    // Speak warning when moving below 100 cm
    if (val < 100) {
      speak("অনুকরণ: সামনে কিছু কাছে আছে");
    }
  };

  const handleReadAloud = async () => {
    await readProximityTool();
  };

  return (
    <section
      aria-labelledby="proximity-modal-title"
      className="safety-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="safety-modal-content">
        {/* Permanent disclaimer line on screen */}
        <div className="proximity-permanent-line" role="note">
          <span className="badge-simulated" style={{ marginRight: "0.5rem" }}>
            SIMULATED / অনুকরণ
          </span>
          <strong>এটি একটি অনুকরণ, আসল সেন্সর নয়</strong>
        </div>

        {/* Modal Header */}
        <div className="camera-modal-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 id="proximity-modal-title" style={{ fontSize: "1.25rem", fontWeight: 800 }}>
              নিকটবর্তী দূরত্ব সিমুলেশন
            </h2>
            <span className="badge-simulated">SIMULATED / অনুকরণ</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="settings-close-btn"
            aria-label="প্রক্সিমিটি প্যানেল বন্ধ করুন"
          >
            ✕ বন্ধ করুন
          </button>
        </div>

        {/* Slider Input with Label */}
        <div className="proximity-slider-container">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label htmlFor="proximity-distance-slider" className="proximity-slider-label">
              দূরত্ব সিমুলেটর স্লাইডার (০ থেকে ৪০০ সেমি)
            </label>
            <span className="badge-simulated">SIMULATED / অনুকরণ</span>
          </div>

          <input
            id="proximity-distance-slider"
            type="range"
            min={0}
            max={400}
            step={1}
            value={distance}
            onChange={handleSliderChange}
            className="proximity-slider"
            aria-valuemin={0}
            aria-valuemax={400}
            aria-valuenow={distance}
            aria-valuetext={`${bnDist} সেন্টিমিটার (অনুকরণ)`}
          />

          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            <span>০ সেমি (অতি সন্নিকটে)</span>
            <span>১০০ সেমি (সতর্কতা সীমা)</span>
            <span>৪০০ সেমি (দূরবর্তী)</span>
          </div>
        </div>

        {/* Every element showing value carries visible SIMULATED badge */}
        <div className="proximity-value-card">
          <div>
            <span className="badge-simulated" style={{ display: "block", marginBottom: "0.25rem" }}>
              SIMULATED / অনুকরণ
            </span>
            <span style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
              সিমুলেটেড দূরত্বের মান
            </span>
          </div>
          <div className="proximity-distance-display">
            {bnDist} <span style={{ fontSize: "1.2rem", color: "var(--text-muted)" }}>সেমি</span>
          </div>
        </div>

        {/* Warning card showing warning state */}
        <div className={`proximity-warning-card ${warning.isClose ? "is-close" : "is-far"}`}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong>{warning.isClose ? "⚠️ নিকটবর্তী বাধা সতর্কতা" : "ℹ️ দূরত্বের তথ্য"}</strong>
            <span className="badge-simulated">SIMULATED / অনুকরণ</span>
          </div>
          <p style={{ fontSize: "1.05rem", fontWeight: 700 }}>
            {warning.message_bn}
          </p>
          {!warning.isClose && (
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              * দূরত্ব বেশি হলেও পথ সম্পূর্ণ নিরাপদ বা বাধাহীন দাবি করা যায় না।
            </p>
          )}
        </div>

        {/* Spoken test button */}
        <button
          type="button"
          onClick={handleReadAloud}
          className="safety-btn-simulate"
          style={{ width: "100%" }}
        >
          🔊 দূরত্ব পড়ে শুনুন (স্পিচ টেস্ট)
        </button>
      </div>
    </section>
  );
}
