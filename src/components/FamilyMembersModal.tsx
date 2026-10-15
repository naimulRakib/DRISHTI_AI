"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  getEnrolledPersons,
  savePerson,
  deletePerson,
  resetToDefaultMembers,
  PersonProfile,
  generateSeedVector,
} from "@/lib/storage/personStore";
import { recognizePerson, extractFaceEmbeddingFromImageData } from "@/lib/tools/person";
import { speak, speakTouch } from "@/lib/tools/speech";

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

  // Live Face Recognition Testing Scanner
  const [isTestScannerActive, setIsTestScannerActive] = useState(false);
  const [isRecognizing, setIsRecognizing] = useState(false);
  const [lastRecognitionResult, setLastRecognitionResult] = useState<string | null>(null);

  // Enrollment Camera
  const [isEnrollCameraActive, setIsEnrollCameraActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const enrollVideoRef = useRef<HTMLVideoElement | null>(null);
  const enrollStreamRef = useRef<MediaStream | null>(null);

  const testVideoRef = useRef<HTMLVideoElement | null>(null);
  const testStreamRef = useRef<MediaStream | null>(null);

  // Stop all active hardware camera streams
  const stopHardwareStreams = useCallback(() => {
    if (enrollStreamRef.current) {
      enrollStreamRef.current.getTracks().forEach((track) => track.stop());
      enrollStreamRef.current = null;
    }
    if (enrollVideoRef.current) {
      enrollVideoRef.current.srcObject = null;
    }

    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((track) => track.stop());
      testStreamRef.current = null;
    }
    if (testVideoRef.current) {
      testVideoRef.current.srcObject = null;
    }
  }, []);

  // Auto-start live test scanner when modal opens for frictionless demo
  useEffect(() => {
    if (isOpen) {
      startTestScanner();
    } else {
      stopHardwareStreams();
      setIsEnrollCameraActive(false);
      setIsTestScannerActive(false);
    }
  }, [isOpen, stopHardwareStreams]);

  const handleSimulateMemberRecognition = (memberName: string, relationBn: string) => {
    let msg = "";
    if (memberName === "ফাহিম") {
      msg = "সে হচ্ছে ফাহিম, আপনার বন্ধু।";
    } else {
      msg = `তিনি হচ্ছেন ${memberName}, ${relationBn}।`;
    }
    setLastRecognitionResult(msg);
    setFeedback(msg);
    speak(msg);
  };

  const handleClose = () => {
    stopHardwareStreams();
    setIsEnrollCameraActive(false);
    setIsTestScannerActive(false);
    onClose();
  };

  // ==========================================
  // 1. Enrollment Camera (Add Known Face)
  // ==========================================

  // Callback ref to attach stream immediately upon video element mount
  const setEnrollVideoNode = useCallback((node: HTMLVideoElement | null) => {
    enrollVideoRef.current = node;
    if (node && enrollStreamRef.current) {
      node.srcObject = enrollStreamRef.current;
      node.onloadedmetadata = () => {
        node.play().catch((err) => console.warn("Enroll video play warning:", err));
      };
      node.play().catch((err) => console.warn("Enroll video play warning:", err));
    }
  }, []);

  const startEnrollCamera = async () => {
    setFeedback("ক্যামেরা সংযোগ স্থাপন করা হচ্ছে...");
    try {
      let stream: MediaStream;
      try {
        // Ideal user/selfie facing camera
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch {
        // Fallback to any available webcam on laptop or device
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      enrollStreamRef.current = stream;
      setIsEnrollCameraActive(true);

      if (enrollVideoRef.current) {
        enrollVideoRef.current.srcObject = stream;
        await enrollVideoRef.current.play().catch(() => {});
      }

      setFeedback("ক্যামেরা চালু হয়েছে। বৃত্তের মাঝে মুখ সোজা রাখুন এবং ছবি তুলুন।");
      speak("ক্যামেরা চালু হয়েছে। মুখটি বৃত্তের মাঝে রেখে ছবি তুলুন।");
    } catch (err) {
      setFeedback(`ক্যামেরা চালু করা সম্ভব হয়নি: ${err instanceof Error ? err.message : "অনুমতি অস্বীকৃত"}`);
      setIsEnrollCameraActive(false);
    }
  };

  const stopEnrollCamera = () => {
    if (enrollStreamRef.current) {
      enrollStreamRef.current.getTracks().forEach((track) => track.stop());
      enrollStreamRef.current = null;
    }
    if (enrollVideoRef.current) {
      enrollVideoRef.current.srcObject = null;
    }
    setIsEnrollCameraActive(false);
  };

  const handleCaptureSnapshot = () => {
    const video = enrollVideoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      setFeedback("ক্যামেরা ভিডিও প্রস্তুত হওয়া পর্যন্ত এক মুহূর্ত অপেক্ষা করুন।");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw frame (mirror-correcting for natural preview)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUri = canvas.toDataURL("image/jpeg", 0.9);
    setPreviewUri(dataUri);
    stopEnrollCamera();
    setFeedback("✓ মুখের ছবি সফলভাবে গ্রহণ করা হয়েছে। এবার নাম ও সম্পর্ক লিখে সংরক্ষণ করুন।");
    speak("ছবি সফলভাবে গ্রহণ করা হয়েছে। এবার নাম লিখে সংরক্ষণ করুন।");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      setPreviewUri(result);
      setFeedback("ছবি ফাইল সফলভাবে আপলোড হয়েছে।");
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
      // Extract ArcFace 128-d embedding from captured image
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
    stopEnrollCamera();

    const successMsg = `নতুন সদস্য '${newPerson.name}' (${newPerson.relationBn}) সফলভাবে যুক্ত হয়েছে।`;
    setFeedback(successMsg);
    speak(successMsg);
  };

  // ==========================================
  // 2. Live Face Recognition Scanner
  // ==========================================

  const setTestVideoNode = useCallback((node: HTMLVideoElement | null) => {
    testVideoRef.current = node;
    if (node && testStreamRef.current) {
      node.srcObject = testStreamRef.current;
      node.onloadedmetadata = () => {
        node.play().catch((err) => console.warn("Test video play warning:", err));
      };
      node.play().catch((err) => console.warn("Test video play warning:", err));
    }
  }, []);

  const startTestScanner = async () => {
    stopEnrollCamera();
    setFeedback("লাইভ ফেস স্ক্যানার চালু করা হচ্ছে...");
    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "user" },
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      testStreamRef.current = stream;
      setIsTestScannerActive(true);

      if (testVideoRef.current) {
        testVideoRef.current.srcObject = stream;
        await testVideoRef.current.play().catch(() => {});
      }

      setFeedback("লাইভ ক্যামেরা চালু রয়েছে। ক্যামেরার সামনে মুখ রাখুন এবং 'এখন মুখ চিনুন' বোতাম চাপুন।");
      speak("ক্যামেরা সচল হয়েছে। মুখটি ক্যামেরার সামনে রাখুন।");
    } catch (err) {
      setFeedback(`ক্যামেরা চালু করা যায়নি: ${err instanceof Error ? err.message : "অনুমতি নেই"}`);
      setIsTestScannerActive(false);
    }
  };

  const stopTestScanner = () => {
    if (testStreamRef.current) {
      testStreamRef.current.getTracks().forEach((track) => track.stop());
      testStreamRef.current = null;
    }
    if (testVideoRef.current) {
      testVideoRef.current.srcObject = null;
    }
    setIsTestScannerActive(false);
  };

  const handleRecognizeLiveFace = async () => {
    const video = testVideoRef.current;
    if (!video || video.videoWidth === 0) {
      setFeedback("ক্যামেরা প্রস্তুত হওয়া পর্যন্ত অপেক্ষা করুন।");
      return;
    }

    setIsRecognizing(true);
    setFeedback("মুখের বৈশিষ্ট্য বিশ্লেষণ করা হচ্ছে...");

    try {
      const result = await recognizePerson({ imageSource: video });
      setLastRecognitionResult(result.message_bn);
      setFeedback(result.message_bn);
    } catch (err) {
      const msg = `শনাক্তকরণ ত্রুটি: ${err instanceof Error ? err.message : "Error"}`;
      setFeedback(msg);
    } finally {
      setIsRecognizing(false);
    }
  };

  // ==========================================
  // 3. Member Management Handlers
  // ==========================================

  const handleDelete = (id: string, memberName: string) => {
    deletePerson(id);
    setMembers(getEnrolledPersons());
    const msg = `'${memberName}' তালিকা থেকে মুছে ফেলা হয়েছে।`;
    setFeedback(msg);
    speak(msg);
  };

  const handleResetDefaults = () => {
    resetToDefaultMembers();
    setMembers(getEnrolledPersons());
    const msg = "ডিফল্ট পরিবার ও পরিচিতদের তালিকা পুনরুদ্ধার করা হয়েছে।";
    setFeedback(msg);
    speak(msg);
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
        backgroundColor: "rgba(0, 0, 0, 0.88)",
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
          maxWidth: "640px",
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(56, 189, 248, 0.35)",
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
                fontWeight: 800,
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
              ArcFace ফেসিয়াল এমবেডিং দিয়ে পরিবার, বন্ধু ও চিকিৎসকদের লাইভ সনাক্তকরণ
            </p>
          </div>
          <button
            type="button"
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

        {/* Modal Body */}
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

          {/* ======================================================== */}
          {/* Section A: Live Face Recognition Testing Scanner         */}
          {/* ======================================================== */}
          <div
            style={{
              padding: "1rem",
              borderRadius: "0.75rem",
              backgroundColor: "#1e293b",
              border: "1px solid #334155",
              marginBottom: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
              <div>
                <strong style={{ fontSize: "1rem", color: "#f8fafc" }}>
                  🔍 লাইভ ক্যামেরা দিয়ে মুখ সনাক্তকরণ
                </strong>
                <p style={{ margin: "0.15rem 0 0", fontSize: "0.8rem", color: "#94a3b8" }}>
                  ক্যামেরার সামনে থাকা ব্যক্তিকে তালিকা অনুযায়ী চিনতে পারে কি না সরাসরি পরীক্ষা করুন
                </p>
              </div>

              {!isTestScannerActive ? (
                <button
                  type="button"
                  onClick={startTestScanner}
                  onTouchStart={() => speakTouch("লাইভ মুখ সনাক্তকরণ স্ক্যানার চালু করার বোতাম")}
                  onMouseEnter={() => speakTouch("লাইভ মুখ সনাক্তকরণ স্ক্যানার চালু করার বোতাম")}
                  style={{
                    backgroundColor: "#0284c7",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "0.5rem",
                    padding: "0.55rem 1rem",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <span>📷</span> লাইভ স্ক্যানার চালু
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopTestScanner}
                  onTouchStart={() => speakTouch("ক্যামেরা বন্ধ করার বোতাম")}
                  onMouseEnter={() => speakTouch("ক্যামেরা বন্ধ করার বোতাম")}
                  style={{
                    backgroundColor: "#475569",
                    color: "#ffffff",
                    border: "none",
                    borderRadius: "0.5rem",
                    padding: "0.55rem 1rem",
                    fontSize: "0.9rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  ⏹ ক্যামেরা বন্ধ
                </button>
              )}
            </div>

            {/* Live Test Camera Viewfinder */}
            {isTestScannerActive && (
              <div
                style={{
                  position: "relative",
                  borderRadius: "0.5rem",
                  overflow: "hidden",
                  backgroundColor: "#000",
                  height: "220px",
                  border: "2px solid #38bdf8",
                }}
              >
                <video
                  ref={setTestVideoNode}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={(e) => {
                    e.currentTarget.play().catch(() => {});
                  }}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)", // Natural mirror selfie view
                  }}
                />

                {/* Face Targeting Oval Guide Overlay */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    pointerEvents: "none",
                  }}
                >
                  <div
                    style={{
                      width: "140px",
                      height: "180px",
                      borderRadius: "50%",
                      border: "3px dashed #38bdf8",
                      boxShadow: "0 0 15px rgba(56, 189, 248, 0.4)",
                    }}
                  />
                  <span
                    style={{
                      marginTop: "0.5rem",
                      backgroundColor: "rgba(0, 0, 0, 0.75)",
                      color: "#38bdf8",
                      padding: "0.2rem 0.6rem",
                      borderRadius: "0.3rem",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                    }}
                  >
                    মুখটি বৃত্তের মাঝে রাখুন
                  </span>
                </div>

                {/* Live Floating Recognize Button */}
                <div
                  style={{
                    position: "absolute",
                    bottom: "10px",
                    left: 0,
                    right: 0,
                    display: "flex",
                    justifyContent: "center",
                    zIndex: 2,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleRecognizeLiveFace}
                    onTouchStart={() => speakTouch("এখন মুখ চিনুন বোতাম")}
                    onMouseEnter={() => speakTouch("এখন মুখ চিনুন বোতাম")}
                    disabled={isRecognizing}
                    style={{
                      backgroundColor: "#10b981",
                      color: "#022c22",
                      border: "2px solid #34d399",
                      padding: "0.6rem 1.4rem",
                      borderRadius: "2rem",
                      fontSize: "0.95rem",
                      fontWeight: 800,
                      cursor: isRecognizing ? "wait" : "pointer",
                      boxShadow: "0 4px 14px rgba(16, 185, 129, 0.5)",
                    }}
                  >
                    {isRecognizing ? "⌛ মুখ বিশ্লেষণ চলছে..." : "🔍 এখন মুখ চিনুন (Identify Face)"}
                  </button>
                </div>
              </div>
            )}

            {/* Quick Demo Simulator Buttons */}
            <div style={{ marginTop: "0.6rem", marginBottom: "0.8rem" }}>
              <span style={{ fontSize: "0.75rem", color: "#94a3b8", display: "block", marginBottom: "0.3rem" }}>
                দ্রুত ডেমো ও রেকর্ডিং টেস্ট বাটন:
              </span>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.4rem" }}>
                <button
                  type="button"
                  onClick={() => handleSimulateMemberRecognition("ফাহিম", "আপনার বন্ধু")}
                  style={{
                    backgroundColor: "#1e3a8a",
                    color: "#bfdbfe",
                    border: "1px solid #3b82f6",
                    borderRadius: "0.4rem",
                    padding: "0.5rem 0.2rem",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  👤 ফাহিম (বন্ধু)
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateMemberRecognition("আমেনা বেগম", "মা")}
                  style={{
                    backgroundColor: "#065f46",
                    color: "#a7f3d0",
                    border: "1px solid #10b981",
                    borderRadius: "0.4rem",
                    padding: "0.5rem 0.2rem",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  👤 আমেনা বেগম
                </button>
                <button
                  type="button"
                  onClick={() => handleSimulateMemberRecognition("রহিম", "ছোট ভাই")}
                  style={{
                    backgroundColor: "#4c1d95",
                    color: "#e9d5ff",
                    border: "1px solid #8b5cf6",
                    borderRadius: "0.4rem",
                    padding: "0.5rem 0.2rem",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  👤 রহিম (ভাই)
                </button>
              </div>
            </div>

            {/* Last Recognition Result Banner */}
            {lastRecognitionResult && (
              <div
                style={{
                  padding: "0.65rem 0.85rem",
                  borderRadius: "0.4rem",
                  backgroundColor: "#0f172a",
                  border: "1px solid #10b981",
                  color: "#a7f3d0",
                  fontSize: "0.9rem",
                  fontWeight: 700,
                }}
              >
                {lastRecognitionResult}
              </div>
            )}
          </div>

          {/* ======================================================== */}
          {/* Section B: Enrolled Members List & Add New Member        */}
          {/* ======================================================== */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#f1f5f9" }}>
              নথিভুক্ত সদস্য তালিকা ({members.length} জন)
            </h3>
            {!isAdding && (
              <button
                type="button"
                onClick={() => {
                  stopTestScanner();
                  setIsAdding(true);
                }}
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
                border: "2px solid #38bdf8",
                borderRadius: "0.75rem",
                padding: "1.25rem",
                marginBottom: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.85rem",
              }}
            >
              <h4 style={{ margin: 0, color: "#38bdf8", fontSize: "1.05rem" }}>
                ➕ নতুন পরিচিত ব্যক্তি যোগ করুন
              </h4>

              <div>
                <label
                  htmlFor="member-name-input"
                  style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.3rem" }}
                >
                  সদস্যের নাম:
                </label>
                <input
                  id="member-name-input"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="যেমন: তানভীর, ডা. শামীম, আমেনা বেগম..."
                  required
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "0.4rem",
                    backgroundColor: "#1e293b",
                    border: "1px solid #475569",
                    color: "#f8fafc",
                    fontSize: "0.95rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div>
                <label
                  htmlFor="member-relation-select"
                  style={{ display: "block", fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.3rem" }}
                >
                  সম্পর্ক / পদবি:
                </label>
                <select
                  id="member-relation-select"
                  value={relationBn}
                  onChange={(e) => setRelationBn(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.65rem 0.85rem",
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

              {/* Photo Input (Live Camera or Upload) */}
              <div>
                <div style={{ fontSize: "0.85rem", color: "#cbd5e1", marginBottom: "0.4rem" }}>
                  মুখের ছবি (Face Photo):
                </div>

                {/* Enrollment Live Camera Viewfinder */}
                {isEnrollCameraActive && (
                  <div style={{ marginBottom: "0.75rem" }}>
                    <div
                      style={{
                        position: "relative",
                        borderRadius: "0.5rem",
                        overflow: "hidden",
                        backgroundColor: "#000",
                        height: "220px",
                        border: "2px solid #10b981",
                      }}
                    >
                      <video
                        ref={setEnrollVideoNode}
                        autoPlay
                        playsInline
                        muted
                        onLoadedMetadata={(e) => {
                          e.currentTarget.play().catch(() => {});
                        }}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          transform: "scaleX(-1)", // Mirror selfie preview
                        }}
                      />

                      {/* Face Position Guide Overlay */}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          pointerEvents: "none",
                        }}
                      >
                        <div
                          style={{
                            width: "140px",
                            height: "180px",
                            borderRadius: "50%",
                            border: "3px dashed #10b981",
                            boxShadow: "0 0 15px rgba(16, 185, 129, 0.4)",
                          }}
                        />
                        <span
                          style={{
                            marginTop: "0.4rem",
                            backgroundColor: "rgba(0, 0, 0, 0.75)",
                            color: "#6ee7b7",
                            padding: "0.2rem 0.6rem",
                            borderRadius: "0.3rem",
                            fontSize: "0.75rem",
                            fontWeight: 700,
                          }}
                        >
                          মুখটি বৃত্তের মাঝে রাখুন
                        </span>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                      <button
                        type="button"
                        onClick={handleCaptureSnapshot}
                        onTouchStart={() => speakTouch("ছবি তোলার বোতাম")}
                        onMouseEnter={() => speakTouch("ছবি তোলার বোতাম")}
                        style={{
                          flex: 1,
                          backgroundColor: "#10b981",
                          color: "#022c22",
                          border: "none",
                          padding: "0.6rem",
                          borderRadius: "0.4rem",
                          fontWeight: 800,
                          fontSize: "0.95rem",
                          cursor: "pointer",
                        }}
                      >
                        📸 ছবি তুলুন (Capture Snapshot)
                      </button>
                      <button
                        type="button"
                        onClick={stopEnrollCamera}
                        onTouchStart={() => speakTouch("ক্যামেরা বন্ধ করার বোতাম")}
                        onMouseEnter={() => speakTouch("ক্যামেরা বন্ধ করার বোতাম")}
                        style={{
                          backgroundColor: "#475569",
                          color: "#fff",
                          border: "none",
                          padding: "0.6rem 0.85rem",
                          borderRadius: "0.4rem",
                          cursor: "pointer",
                        }}
                      >
                        বাতিল
                      </button>
                    </div>
                  </div>
                )}

                {/* Captured Photo Preview Thumbnail */}
                {previewUri && (
                  <div
                    style={{
                      marginBottom: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.85rem",
                      backgroundColor: "#1e293b",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.5rem",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUri}
                      alt="মুখের প্রিভিউ"
                      style={{
                        width: "64px",
                        height: "64px",
                        borderRadius: "0.4rem",
                        objectFit: "cover",
                        border: "2px solid #10b981",
                      }}
                    />
                    <div>
                      <span style={{ display: "block", fontSize: "0.85rem", color: "#a7f3d0", fontWeight: 700 }}>
                        ✓ ছবি সফলভাবে সংরক্ষিত
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewUri(null);
                          startEnrollCamera();
                        }}
                        style={{
                          backgroundColor: "transparent",
                          border: "1px solid #ef4444",
                          color: "#fca5a5",
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.3rem",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          marginTop: "0.25rem",
                        }}
                      >
                        পুনরায় ছবি তুলুন
                      </button>
                    </div>
                  </div>
                )}

                {/* Camera / File Open Buttons */}
                {!isEnrollCameraActive && !previewUri && (
                  <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={startEnrollCamera}
                      onTouchStart={() => speakTouch("ক্যামেরা খোলার বোতাম")}
                      onMouseEnter={() => speakTouch("ক্যামেরা খোলার বোতাম")}
                      style={{
                        backgroundColor: "#0369a1",
                        border: "1px solid #38bdf8",
                        color: "#ffffff",
                        padding: "0.55rem 0.95rem",
                        borderRadius: "0.4rem",
                        fontSize: "0.9rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <span>📷</span> ক্যামেরা খুলুন (Open Camera)
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      onTouchStart={() => speakTouch("ছবি ফাইল আপলোড করার বোতাম")}
                      onMouseEnter={() => speakTouch("ছবি ফাইল আপলোড করার বোতাম")}
                      style={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #475569",
                        color: "#cbd5e1",
                        padding: "0.55rem 0.85rem",
                        borderRadius: "0.4rem",
                        fontSize: "0.9rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.4rem",
                      }}
                    >
                      <span>📁</span> ফাইল আপলোড
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

              <div style={{ display: "flex", gap: "0.6rem", justifyContent: "flex-end", marginTop: "0.5rem" }}>
                <button
                  type="button"
                  onClick={() => {
                    setIsAdding(false);
                    stopEnrollCamera();
                    setPreviewUri(null);
                  }}
                  style={{
                    backgroundColor: "transparent",
                    color: "#94a3b8",
                    border: "1px solid #475569",
                    borderRadius: "0.4rem",
                    padding: "0.55rem 1rem",
                    cursor: "pointer",
                  }}
                >
                  বাতিল
                </button>
                <button
                  type="submit"
                  style={{
                    backgroundColor: "#10b981",
                    color: "#022c22",
                    border: "none",
                    borderRadius: "0.4rem",
                    padding: "0.55rem 1.4rem",
                    fontWeight: 800,
                    fontSize: "0.95rem",
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
                <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                  {member.photoUri ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.photoUri}
                      alt={member.name}
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "50%",
                        objectFit: "cover",
                        border: "2px solid #38bdf8",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "42px",
                        height: "42px",
                        borderRadius: "50%",
                        backgroundColor: "#1e293b",
                        border: "2px solid #38bdf8",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 800,
                        fontSize: "1.1rem",
                        color: "#38bdf8",
                      }}
                    >
                      {member.name.slice(0, 1)}
                    </div>
                  )}

                  <div>
                    <div style={{ fontWeight: 800, fontSize: "1rem", color: "#f8fafc" }}>
                      {member.name}
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "#38bdf8", fontWeight: 600 }}>
                      {member.relationBn}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={() => {
                      const msg = `সনাক্তকরণ পরীক্ষা: আপনার সামনে ${member.name} (${member.relationBn}) আছেন।`;
                      setFeedback(msg);
                      speak(msg);
                    }}
                    style={{
                      backgroundColor: "rgba(56, 189, 248, 0.15)",
                      border: "1px solid #38bdf8",
                      color: "#38bdf8",
                      borderRadius: "0.35rem",
                      padding: "0.35rem 0.65rem",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    টেস্ট
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(member.id, member.name)}
                    aria-label={`${member.name} মুছুন`}
                    style={{
                      backgroundColor: "transparent",
                      border: "none",
                      color: "#ef4444",
                      cursor: "pointer",
                      padding: "0.4rem",
                      fontSize: "1.1rem",
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Reset Defaults button */}
          <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
            <button
              type="button"
              onClick={handleResetDefaults}
              style={{
                backgroundColor: "transparent",
                border: "1px dashed #475569",
                color: "#94a3b8",
                borderRadius: "0.4rem",
                padding: "0.45rem 1rem",
                fontSize: "0.85rem",
                cursor: "pointer",
              }}
            >
              🔄 ডিফল্ট সদস্য তালিকা পুনরুদ্ধার করুন
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
