"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  getEnrolledPersons,
  savePerson,
  deletePerson,
  resetToDefaultMembers,
  PersonProfile,
  generateSeedVector,
} from "@/lib/storage/personStore";
import { recognizePerson, extractFaceEmbeddingFromImageData } from "@/lib/tools/person";
import { speak } from "@/lib/tools/speech";

interface FamilyMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const RELATION_PRESETS = [
  "মা",
  "বাবা",
  "ছোট ভাই",
  "বড় ভাই",
  "ছোট বোন",
  "বড় বোন",
  "স্ত্রী / স্বামী",
  "সন্তান",
  "পারিবারিক চিকিৎসক",
  "কেয়ারগিভার / সহায়ক",
  "বন্ধু",
];

export default function FamilyMembersModal({
  isOpen,
  onClose,
}: FamilyMembersModalProps) {
  const [members, setMembers] = useState<PersonProfile[]>(() => getEnrolledPersons());
  const [name, setName] = useState("");
  const [relationBn, setRelationBn] = useState(RELATION_PRESETS[0]);
  const [isAdding, setIsAdding] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const stopCameraStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Stop camera when modal is closed
  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }
  }, [isOpen]);

  const startCameraStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsCameraActive(true);
    } catch {
      setFeedback("ক্যামেরা চালু করা সম্ভব হয়নি। ফাইল আপলোড বিকল্পটি ব্যবহার করুন।");
    }
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 320;
    canvas.height = videoRef.current.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    const dataUri = canvas.toDataURL("image/jpeg", 0.85);
    setPreviewUri(dataUri);
    stopCameraStream();
    setFeedback("ছবি সফলভাবে ধারণ করা হয়েছে। এবার নাম ও সম্পর্ক লিখে সংরক্ষণ করুন।");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setPreviewUri(result);
      setFeedback("ছবি আপলোড হয়েছে।");
    };
    reader.readAsDataURL(file);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFeedback("অনুগ্রহ করে সদস্যের নাম লিখুন।");
      return;
    }

    let vector: number[];

    if (previewUri) {
      // Create image element to extract vector
      const img = new Image();
      img.src = previewUri;
      await new Promise((resolve) => {
        img.onload = resolve;
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 320;
      canvas.height = img.naturalHeight || 240;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        vector = extractFaceEmbeddingFromImageData(imgData);
      } else {
        vector = generateSeedVector(Math.floor(Math.random() * 10000));
      }
    } else {
      // Preset pseudo-embedding if photo was not supplied
      vector = generateSeedVector(Math.floor(Math.random() * 10000));
    }

    const newPerson: PersonProfile = {
      id: `member-${Date.now()}`,
      name: name.trim(),
      relationBn: relationBn.trim(),
      photoUri: previewUri || undefined,
      vector,
      enrolledAt: Date.now(),
    };

    savePerson(newPerson);
    setMembers(getEnrolledPersons());
    setName("");
    setPreviewUri(null);
    setIsAdding(false);
    const successMsg = `নতুন সদস্য ${newPerson.name} (${newPerson.relationBn}) সফলভাবে যুক্ত হয়েছে।`;
    setFeedback(successMsg);
    speak(successMsg);
  };

  const handleDelete = (id: string, memberName: string) => {
    deletePerson(id);
    setMembers(getEnrolledPersons());
    const msg = `${memberName} তালিকা থেকে মুছে ফেলা হয়েছে।`;
    setFeedback(msg);
    speak(msg);
  };

  const handleResetDefaults = () => {
    resetToDefaultMembers();
    setMembers(getEnrolledPersons());
    setFeedback("ডিফল্ট পরিবার ও পরিচিতদের তালিকা পুনরুদ্ধার করা হয়েছে।");
    speak("ডিফল্ট তালিকা সক্রিয় করা হয়েছে।");
  };

  const handleTestRecognition = async () => {
    setIsTesting(true);
    setFeedback("ক্যামেরা থেকে মুখ সনাক্তকরণ ও যাচাই চলছে...");
    try {
      const res = await recognizePerson();
      setFeedback(res.message_bn);
    } catch {
      setFeedback("মুখ চেনার সময় সমস্যা হয়েছে।");
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="family-modal-title"
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
          backgroundColor: "#090d16",
          color: "#f8fafc",
          border: "2px solid #38bdf8",
          borderRadius: "1rem",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.8)",
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
              id="family-modal-title"
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
              <span>👥</span> পরিচিত ও কেয়ারগিভার নেটওয়ার্ক
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>
              পরিবার ও চিকিৎসকদের চেহারা সংরক্ষণ করুন যাতে দৃষ্টি স্বয়ংক্রিয়ভাবে চিনতে পারে
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

          {/* Test Recognition Quick Action */}
          <div
            style={{
              padding: "0.85rem",
              borderRadius: "0.6rem",
              backgroundColor: "#1e293b",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.25rem",
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>
                লাইভ ক্যামেরা দিয়ে পরীক্ষা
              </div>
              <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                সামনের ব্যক্তিকে চিনতে পারছে কি না পরীক্ষা করুন
              </div>
            </div>
            <button
              onClick={handleTestRecognition}
              disabled={isTesting}
              style={{
                backgroundColor: isTesting ? "#64748b" : "#0284c7",
                color: "#fff",
                border: "none",
                borderRadius: "0.5rem",
                padding: "0.6rem 1rem",
                fontSize: "0.9rem",
                fontWeight: 700,
                cursor: isTesting ? "wait" : "pointer",
              }}
            >
              {isTesting ? "যাচাই চলছে..." : "🔍 মুখ চিনুন"}
            </button>
          </div>

          {/* Section Heading + Add Button */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#f1f5f9" }}>
              তালিকাভুক্ত সদস্য ({members.length})
            </h3>
            {!isAdding && (
              <button
                onClick={() => setIsAdding(true)}
                style={{
                  backgroundColor: "#10b981",
                  color: "#022c22",
                  border: "none",
                  borderRadius: "0.5rem",
                  padding: "0.45rem 0.85rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>➕</span> নতুন যুক্ত করুন
              </button>
            )}
          </div>

          {/* Add Member Form */}
          {isAdding && (
            <form
              onSubmit={handleSaveMember}
              style={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: "0.75rem",
                padding: "1rem",
                marginBottom: "1.25rem",
              }}
            >
              <h4 style={{ margin: "0 0 0.75rem", color: "#38bdf8", fontSize: "0.95rem" }}>
                নতুন পরিচিত ব্যক্তি যোগ করুন
              </h4>

              <div style={{ marginBottom: "0.75rem" }}>
                <label
                  htmlFor="member-name-input"
                  style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.25rem" }}
                >
                  নাম:
                </label>
                <input
                  id="member-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="যেমন: তানভীর, ডা. শামীম..."
                  required
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "0.4rem",
                    backgroundColor: "#1e293b",
                    border: "1px solid #475569",
                    color: "#f8fafc",
                    fontSize: "0.95rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ marginBottom: "0.75rem" }}>
                <label
                  htmlFor="member-relation-select"
                  style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.25rem" }}
                >
                  সম্পর্ক / পদবি:
                </label>
                <select
                  id="member-relation-select"
                  value={relationBn}
                  onChange={(e) => setRelationBn(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "0.4rem",
                    backgroundColor: "#1e293b",
                    border: "1px solid #475569",
                    color: "#f8fafc",
                    fontSize: "0.95rem",
                    boxSizing: "border-box",
                  }}
                >
                  {RELATION_PRESETS.map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>

              {/* Photo Input (Camera snapshot or file) */}
              <div style={{ marginBottom: "1rem" }}>
                <div style={{ fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.4rem" }}>
                  মুখের ছবি (Photo Sample):
                </div>

                {isCameraActive && (
                  <div style={{ marginBottom: "0.5rem" }}>
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      style={{
                        width: "100%",
                        height: "180px",
                        backgroundColor: "#000",
                        borderRadius: "0.4rem",
                        objectFit: "cover",
                      }}
                    />
                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.4rem" }}>
                      <button
                        type="button"
                        onClick={handleCaptureSnapshot}
                        style={{
                          flex: 1,
                          backgroundColor: "#38bdf8",
                          color: "#0f172a",
                          border: "none",
                          padding: "0.5rem",
                          borderRadius: "0.4rem",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        📸 ছবি তুলুন
                      </button>
                      <button
                        type="button"
                        onClick={stopCameraStream}
                        style={{
                          backgroundColor: "#475569",
                          color: "#fff",
                          border: "none",
                          padding: "0.5rem 0.75rem",
                          borderRadius: "0.4rem",
                          cursor: "pointer",
                        }}
                      >
                        বাতিল
                      </button>
                    </div>
                  </div>
                )}

                {previewUri && (
                  <div style={{ marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUri}
                      alt="মুখের প্রিভিউ"
                      style={{
                        width: "60px",
                        height: "60px",
                        borderRadius: "0.4rem",
                        objectFit: "cover",
                        border: "1px solid #38bdf8",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setPreviewUri(null)}
                      style={{
                        backgroundColor: "transparent",
                        border: "1px solid #ef4444",
                        color: "#ef4444",
                        padding: "0.3rem 0.6rem",
                        borderRadius: "0.3rem",
                        fontSize: "0.8rem",
                        cursor: "pointer",
                      }}
                    >
                      ছবি পরিবর্তন
                    </button>
                  </div>
                )}

                {!isCameraActive && !previewUri && (
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      onClick={startCameraStream}
                      style={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #38bdf8",
                        color: "#38bdf8",
                        padding: "0.45rem 0.75rem",
                        borderRadius: "0.4rem",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      📷 ক্যামেরা খুলুন
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #475569",
                        color: "#cbd5e1",
                        padding: "0.45rem 0.75rem",
                        borderRadius: "0.4rem",
                        fontSize: "0.85rem",
                        cursor: "pointer",
                      }}
                    >
                      📁 ফাইল আপলোড
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={handleFileUpload}
                    />
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    stopCameraStream();
                    setPreviewUri(null);
                  }}
                  style={{
                    backgroundColor: "transparent",
                    color: "#94a3b8",
                    border: "1px solid #475569",
                    borderRadius: "0.4rem",
                    padding: "0.5rem 0.85rem",
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
                    padding: "0.5rem 1.25rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  সংরক্ষণ করুন
                </button>
              </div>
            </form>
          )}

          {/* Members List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {members.map((member) => (
              <div
                key={member.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.75rem 1rem",
                  backgroundColor: "#0f172a",
                  borderRadius: "0.5rem",
                  border: "1px solid #1e293b",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  <div
                    style={{
                      width: "36px",
                      height: "36px",
                      borderRadius: "50%",
                      backgroundColor: "#1e293b",
                      border: "1px solid #38bdf8",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 700,
                      color: "#38bdf8",
                    }}
                  >
                    {member.name.slice(0, 1)}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{member.name}</div>
                    <div style={{ fontSize: "0.8rem", color: "#38bdf8", fontWeight: 500 }}>
                      {member.relationBn}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => handleDelete(member.id, member.name)}
                  aria-label={`${member.name} মুছুন`}
                  style={{
                    backgroundColor: "transparent",
                    border: "none",
                    color: "#ef4444",
                    cursor: "pointer",
                    padding: "0.4rem",
                    fontSize: "1rem",
                  }}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          {/* Reset Defaults button */}
          <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
            <button
              onClick={handleResetDefaults}
              style={{
                backgroundColor: "transparent",
                border: "1px dashed #475569",
                color: "#94a3b8",
                borderRadius: "0.4rem",
                padding: "0.4rem 0.85rem",
                fontSize: "0.8rem",
                cursor: "pointer",
              }}
            >
              🔄 ডিফল্ট তালিকা পুনরুদ্ধার করুন
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
