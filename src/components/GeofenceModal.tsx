"use client";

import React, { useState, useEffect } from "react";
import {
  SafeZone,
  GeofenceEvaluation,
  getSafeZones,
  addSafeZone,
  updateSafeZone,
  deleteSafeZone,
  resetSafeZones,
  evaluateSafeZones,
  toBengaliDigits,
} from "@/lib/storage/geofenceStore";
import { getCurrentCoordinates } from "@/lib/tools/geofence";
import { triggerGeofenceAlert } from "@/lib/native/bridge";
import { speak } from "@/lib/tools/speech";

interface GeofenceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GeofenceModal({ isOpen, onClose }: GeofenceModalProps) {
  const [zones, setZones] = useState<SafeZone[]>(() => getSafeZones());
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [evaluation, setEvaluation] = useState<GeofenceEvaluation | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Form states for creating a new safe zone
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>("");
  const [newRadius, setNewRadius] = useState<number>(100);
  const [newLat, setNewLat] = useState<string>("");
  const [newLng, setNewLng] = useState<string>("");

  // Caregiver emergency phone number
  const [caregiverPhone, setCaregiverPhone] = useState<string>(() => {
    if (typeof window !== "undefined" && window.DrishtiBridge?.getEmergencyContact) {
      return window.DrishtiBridge.getEmergencyContact() || "01700000000";
    }
    return "01700000000";
  });

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    setFeedback("জিপিএস থেকে আপনার বর্তমান ভৌগোলিক অবস্থান গ্রহণ করা হচ্ছে...");

    const liveCoords = await getCurrentCoordinates();
    const finalCoords = liveCoords ?? { lat: 23.8103, lng: 90.4125 };
    setCoords(finalCoords);

    const evalResult = evaluateSafeZones(finalCoords.lat, finalCoords.lng);
    setEvaluation(evalResult);
    setIsRefreshing(false);
    setFeedback(evalResult.spokenSummaryBn);
    speak(evalResult.spokenSummaryBn);

    setNewLat(finalCoords.lat.toFixed(6));
    setNewLng(finalCoords.lng.toFixed(6));
  };

  useEffect(() => {
    if (!isOpen) return;

    let active = true;

    getCurrentCoordinates().then((liveCoords) => {
      if (!active) return;
      const finalCoords = liveCoords ?? { lat: 23.8103, lng: 90.4125 };
      setCoords(finalCoords);
      const evalResult = evaluateSafeZones(finalCoords.lat, finalCoords.lng);
      setEvaluation(evalResult);
      setFeedback(evalResult.spokenSummaryBn);
      speak(evalResult.spokenSummaryBn);
      setNewLat(finalCoords.lat.toFixed(6));
      setNewLng(finalCoords.lng.toFixed(6));
    });

    return () => {
      active = false;
    };
  }, [isOpen]);

  const handleToggleZone = (id: string, currentActive: boolean) => {
    const updated = updateSafeZone(id, { isActive: !currentActive });
    setZones(updated);
    if (coords) {
      const evalResult = evaluateSafeZones(coords.lat, coords.lng);
      setEvaluation(evalResult);
      speak(
        !currentActive
          ? "নিরাপদ এলাকাটি সক্রিয় করা হয়েছে।"
          : "নিরাপদ এলাকাটি নিষ্ক্রিয় করা হয়েছে।"
      );
    }
  };

  const handleDeleteZone = (id: string, name: string) => {
    const updated = deleteSafeZone(id);
    setZones(updated);
    if (coords) {
      const evalResult = evaluateSafeZones(coords.lat, coords.lng);
      setEvaluation(evalResult);
    }
    const msg = `'${name}' নিরাপদ তালিকা থেকে মুছে ফেলা হয়েছে।`;
    setFeedback(msg);
    speak(msg);
  };

  const handleAddZoneSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setFeedback("অনুগ্রহ করে এলাকার নাম লিখুন।");
      return;
    }

    const latNum = parseFloat(newLat);
    const lngNum = parseFloat(newLng);

    if (isNaN(latNum) || isNaN(lngNum)) {
      setFeedback("সঠিক অক্ষাংশ ও দ্রাঘিমাংশ প্রদান করুন।");
      return;
    }

    addSafeZone({
      name: newName.trim(),
      lat: latNum,
      lng: lngNum,
      radiusMeters: newRadius,
      isActive: true,
    });

    const updated = getSafeZones();
    setZones(updated);
    setIsAdding(false);
    setNewName("");

    if (coords) {
      const evalResult = evaluateSafeZones(coords.lat, coords.lng);
      setEvaluation(evalResult);
    }

    const successMsg = `নতুন নিরাপদ এলাকা '${newName}' (${toBengaliDigits(newRadius)} মিটার) সফলভাবে যুক্ত হয়েছে।`;
    setFeedback(successMsg);
    speak(successMsg);
  };

  const handleTestAlert = () => {
    const zoneName = evaluation?.matchingZone?.name || "বাড়ি";
    const lat = coords?.lat || 23.8103;
    const lng = coords?.lng || 90.4125;
    const dist = evaluation?.nearestZone?.distanceMeters || 250;

    triggerGeofenceAlert(zoneName, lat, lng, dist);
    const alertMsg = `কেয়ারগিভার (${caregiverPhone}) নম্বরে পরীক্ষামূলক জরুরি এসএমএস ও ভাইব্রেশন অ্যালার্ট পাঠানো হয়েছে।`;
    setFeedback(alertMsg);
    speak(alertMsg);
  };

  const handleSaveCurrentAsZone = () => {
    if (!coords) return;
    setNewName("বর্তমান অবস্থান (Custom)");
    setNewLat(coords.lat.toFixed(6));
    setNewLng(coords.lng.toFixed(6));
    setIsAdding(true);
  };

  const handleSavePhone = (newPhone: string) => {
    setCaregiverPhone(newPhone);
    if (typeof window !== "undefined" && window.DrishtiBridge?.saveEmergencyContact) {
      window.DrishtiBridge.saveEmergencyContact(newPhone);
    }
    setFeedback(`কেয়ারগিভার নম্বর '${newPhone}' সফলভাবে সংরক্ষিত হয়েছে।`);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="geofence-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        style={{
          backgroundColor: "#0b1120",
          border: "2px solid #38bdf8",
          borderRadius: "1rem",
          width: "100%",
          maxWidth: "720px",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.9)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: "#0f172a",
          }}
        >
          <div>
            <h2
              id="geofence-modal-title"
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
              <span>🛡️</span> নিরাপদ এলাকা ও লাইভ জিওফেন্সিং
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>
              দৃষ্টিহীন ব্যক্তির নিরাপদ পরিধি পর্যবেক্ষণ এবং হারিয়ে যাওয়া রোধে কেয়ারগিভার অ্যালার্ট
            </p>
          </div>
          <button
            onClick={onClose}
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

          {/* Live Status Hero Card */}
          <div
            style={{
              backgroundColor: "#1e293b",
              borderRadius: "0.75rem",
              padding: "1.25rem",
              border: evaluation?.isSafe
                ? "2px solid #22c55e"
                : "2px solid #ef4444",
              marginBottom: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: "0.5rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "1.5rem" }}>
                  {evaluation?.isSafe ? "🟢" : "🚨"}
                </span>
                <div>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1.15rem",
                      fontWeight: 700,
                      color: evaluation?.isSafe ? "#4ade80" : "#f87171",
                    }}
                  >
                    {evaluation?.isSafe
                      ? "নিরাপদ সীমানার ভিতরে (SAFE)"
                      : "সতর্কতা: সীমানা অতিক্রম! (BREACH)"}
                  </h3>
                  <span style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
                    সক্রিয় নিরাপদ জোন: {toBengaliDigits(evaluation?.activeZoneCount ?? 0)} টি
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRefreshClick}
                disabled={isRefreshing}
                style={{
                  backgroundColor: "#0284c7",
                  border: "none",
                  borderRadius: "0.5rem",
                  padding: "0.5rem 0.85rem",
                  color: "#ffffff",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: isRefreshing ? "wait" : "pointer",
                }}
              >
                {isRefreshing ? "⏳ যাচাই হচ্ছে..." : "🔄 অবস্থান রিফ্রেশ"}
              </button>
            </div>

            {/* Coordinates and Distance details */}
            <div
              style={{
                backgroundColor: "#0f172a",
                borderRadius: "0.5rem",
                padding: "0.75rem",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "0.5rem",
                fontSize: "0.85rem",
                color: "#cbd5e1",
              }}
            >
              <div>
                <span style={{ color: "#64748b" }}>বর্তমান অক্ষাংশ:</span>{" "}
                <strong>{coords ? coords.lat.toFixed(5) : "নির্ণয়াধীন"}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>বর্তমান দ্রাঘিমাংশ:</span>{" "}
                <strong>{coords ? coords.lng.toFixed(5) : "নির্ণয়াধীন"}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>নিকটতম কেন্দ্র:</span>{" "}
                <strong>{evaluation?.nearestZone?.zone.name || "বাড়ি"}</strong>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>কেন্দ্রের দূরত্ব:</span>{" "}
                <strong>
                  {toBengaliDigits(evaluation?.nearestZone?.distanceMeters ?? 0)} মিটার
                </strong>
              </div>
            </div>
          </div>

          {/* Action Row */}
          <div
            style={{
              display: "flex",
              gap: "0.75rem",
              flexWrap: "wrap",
              marginBottom: "1.25rem",
            }}
          >
            <button
              type="button"
              onClick={handleSaveCurrentAsZone}
              style={{
                flex: "1 1 auto",
                backgroundColor: "#0d9488",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.75rem 1rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📍 বর্তমান স্থানকে নিরাপদ জোন করুন
            </button>
            <button
              type="button"
              onClick={handleTestAlert}
              style={{
                flex: "1 1 auto",
                backgroundColor: "#e11d48",
                color: "#ffffff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.75rem 1rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              📲 কেয়ারগিভার অ্যালার্ট টেস্ট (SMS)
            </button>
          </div>

          {/* Caregiver Contact Config */}
          <div
            style={{
              backgroundColor: "#1e293b",
              borderRadius: "0.5rem",
              padding: "0.85rem 1rem",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <label htmlFor="caregiver-phone-input" style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
              জরুরি কেয়ারগিভার ফোন নম্বর:
            </label>
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                id="caregiver-phone-input"
                type="tel"
                value={caregiverPhone}
                onChange={(e) => setCaregiverPhone(e.target.value)}
                style={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #475569",
                  borderRadius: "0.35rem",
                  color: "#f8fafc",
                  padding: "0.35rem 0.6rem",
                  fontSize: "0.85rem",
                  width: "150px",
                }}
              />
              <button
                type="button"
                onClick={() => handleSavePhone(caregiverPhone)}
                style={{
                  backgroundColor: "#334155",
                  color: "#f8fafc",
                  border: "1px solid #64748b",
                  borderRadius: "0.35rem",
                  padding: "0.35rem 0.65rem",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                সংরক্ষণ
              </button>
            </div>
          </div>

          {/* Add Zone Inline Form */}
          {isAdding && (
            <form
              onSubmit={handleAddZoneSubmit}
              style={{
                backgroundColor: "#1e293b",
                borderRadius: "0.75rem",
                padding: "1rem",
                marginBottom: "1.25rem",
                border: "1px solid #38bdf8",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <h4 style={{ margin: 0, color: "#38bdf8", fontSize: "1rem" }}>
                নতুন নিরাপদ এলাকা যোগ করুন
              </h4>

              <div>
                <label
                  htmlFor="zone-name-input"
                  style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.25rem" }}
                >
                  এলাকার নাম (যেমন: বাড়ি, কর্মক্ষেত্র, পার্ক)
                </label>
                <input
                  id="zone-name-input"
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="যেমন: বাড়ি, হাসপাতাল, মসজিদ"
                  style={{
                    width: "100%",
                    backgroundColor: "#0f172a",
                    border: "1px solid #475569",
                    borderRadius: "0.4rem",
                    padding: "0.5rem",
                    color: "#f8fafc",
                    fontSize: "0.9rem",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                <div>
                  <label
                    htmlFor="zone-radius-select"
                    style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.25rem" }}
                  >
                    ব্যাসার্ধ (মিটার)
                  </label>
                  <select
                    id="zone-radius-select"
                    value={newRadius}
                    onChange={(e) => setNewRadius(Number(e.target.value))}
                    style={{
                      width: "100%",
                      backgroundColor: "#0f172a",
                      border: "1px solid #475569",
                      borderRadius: "0.4rem",
                      padding: "0.5rem",
                      color: "#f8fafc",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value={50}>৫০ মিটার</option>
                    <option value={100}>১০০ মিটার</option>
                    <option value={150}>১৫০ মিটার</option>
                    <option value={200}>২০০ মিটার</option>
                    <option value={500}>৫০০ মিটার</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="zone-lat-input"
                    style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.25rem" }}
                  >
                    অক্ষাংশ (Lat)
                  </label>
                  <input
                    id="zone-lat-input"
                    type="text"
                    required
                    value={newLat}
                    onChange={(e) => setNewLat(e.target.value)}
                    style={{
                      width: "100%",
                      backgroundColor: "#0f172a",
                      border: "1px solid #475569",
                      borderRadius: "0.4rem",
                      padding: "0.5rem",
                      color: "#f8fafc",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>

                <div>
                  <label
                    htmlFor="zone-lng-input"
                    style={{ display: "block", fontSize: "0.8rem", color: "#94a3b8", marginBottom: "0.25rem" }}
                  >
                    দ্রাঘিমাংশ (Lng)
                  </label>
                  <input
                    id="zone-lng-input"
                    type="text"
                    required
                    value={newLng}
                    onChange={(e) => setNewLng(e.target.value)}
                    style={{
                      width: "100%",
                      backgroundColor: "#0f172a",
                      border: "1px solid #475569",
                      borderRadius: "0.4rem",
                      padding: "0.5rem",
                      color: "#f8fafc",
                      fontSize: "0.85rem",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  style={{
                    backgroundColor: "transparent",
                    color: "#94a3b8",
                    border: "1px solid #475569",
                    borderRadius: "0.4rem",
                    padding: "0.45rem 0.85rem",
                    cursor: "pointer",
                  }}
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: "#38bdf8",
                    color: "#0f172a",
                    border: "none",
                    borderRadius: "0.4rem",
                    padding: "0.45rem 0.85rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          )}

          {/* Configured Zones List */}
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "0.75rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#f8fafc" }}>
                নির্ধারিত নিরাপদ এলাকা তালিকা ({toBengaliDigits(zones.length)}টি)
              </h3>
              {!isAdding && (
                <button
                  type="button"
                  onClick={() => setIsAdding(true)}
                  style={{
                    backgroundColor: "#1e293b",
                    color: "#38bdf8",
                    border: "1px solid #38bdf8",
                    borderRadius: "0.4rem",
                    padding: "0.35rem 0.75rem",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  + নতুন জোন
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {zones.map((zone) => (
                <div
                  key={zone.id}
                  style={{
                    backgroundColor: "#1e293b",
                    border: zone.isActive ? "1px solid #475569" : "1px dashed #334155",
                    borderRadius: "0.5rem",
                    padding: "0.85rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    opacity: zone.isActive ? 1 : 0.6,
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <strong style={{ fontSize: "1rem", color: "#f8fafc" }}>
                        {zone.name}
                      </strong>
                      <span
                        style={{
                          backgroundColor: "#0369a1",
                          color: "#e0f2fe",
                          fontSize: "0.75rem",
                          padding: "0.15rem 0.45rem",
                          borderRadius: "0.25rem",
                        }}
                      >
                        {toBengaliDigits(zone.radiusMeters)} মিটার
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: "0.25rem" }}>
                      স্থানাঙ্ক: {zone.lat.toFixed(4)}, {zone.lng.toFixed(4)}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={() => handleToggleZone(zone.id, zone.isActive)}
                      aria-label={`${zone.name} ${zone.isActive ? "নিষ্ক্রিয়" : "সক্রিয়"} করুন`}
                      style={{
                        backgroundColor: zone.isActive ? "#166534" : "#334155",
                        color: zone.isActive ? "#86efac" : "#94a3b8",
                        border: "none",
                        borderRadius: "0.35rem",
                        padding: "0.35rem 0.65rem",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {zone.isActive ? "সক্রিয়" : "নিষ্ক্রিয়"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteZone(zone.id, zone.name)}
                      aria-label={`${zone.name} মুছে ফেলুন`}
                      style={{
                        backgroundColor: "transparent",
                        color: "#ef4444",
                        border: "1px solid #7f1d1d",
                        borderRadius: "0.35rem",
                        padding: "0.35rem 0.65rem",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      মুছুন
                    </button>
                  </div>
                </div>
              ))}
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
            backgroundColor: "#0f172a",
          }}
        >
          <button
            type="button"
            onClick={() => {
              const resetList = resetSafeZones();
              setZones(resetList);
              if (coords) {
                setEvaluation(evaluateSafeZones(coords.lat, coords.lng));
              }
              speak("নিরাপদ এলাকা তালিকা প্রাথমিক মানে রিসেট করা হয়েছে।");
            }}
            style={{
              backgroundColor: "transparent",
              color: "#94a3b8",
              border: "none",
              fontSize: "0.85rem",
              textDecoration: "underline",
              cursor: "pointer",
            }}
          >
            ডিফল্ট জোনে রিসেট করুন
          </button>
          <button
            type="button"
            onClick={onClose}
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
