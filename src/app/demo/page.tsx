"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface ChecklistItem {
  id: string;
  titleBn: string;
  titleEn: string;
  status: "pass" | "fail" | "checking";
  detail: string;
  canRequestPermission?: boolean;
}

export default function DemoPage() {
  const [cameraStatus, setCameraStatus] = useState<ChecklistItem>({
    id: "camera",
    titleBn: "ক্যামেরার অনুমতি",
    titleEn: "Camera Permission",
    status: "checking",
    detail: "যাচাই করা হচ্ছে...",
    canRequestPermission: true,
  });

  const [micStatus, setMicStatus] = useState<ChecklistItem>({
    id: "mic",
    titleBn: "মাইক্রোফোনের অনুমতি",
    titleEn: "Microphone Permission",
    status: "checking",
    detail: "যাচাই করা হচ্ছে...",
    canRequestPermission: true,
  });

  const [voiceStatus, setVoiceStatus] = useState<ChecklistItem>({
    id: "voice",
    titleBn: "ডিভাইসে বাংলা কণ্ঠস্বর (TTS)",
    titleEn: "Bengali Voice Found",
    status: "checking",
    detail: "যাচাই করা হচ্ছে...",
  });

  const [modelStatus, setModelStatus] = useState<ChecklistItem>({
    id: "model",
    titleBn: "অবজেক্ট ডিটেকশন মডেল ক্যাশ",
    titleEn: "Model Cached (efficientdet_lite0)",
    status: "checking",
    detail: "যাচাই করা হচ্ছে...",
  });

  const [ocrStatus, setOcrStatus] = useState<ChecklistItem>({
    id: "ocr",
    titleBn: "বাংলা ও ইংরেজি OCR ডেটা ক্যাশ",
    titleEn: "OCR Data Cached (Tessdata)",
    status: "checking",
    detail: "যাচাই করা হচ্ছে...",
  });

  const [networkStatus, setNetworkStatus] = useState<ChecklistItem>({
    id: "network",
    titleBn: "নেটওয়ার্ক স্থিতি (অনলাইন/অফলাইন)",
    titleEn: "Online / Offline State",
    status: "checking",
    detail: "যাচাই করা হচ্ছে...",
  });

  // 1. Check Camera Permission
  const checkCamera = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setCameraStatus({
        id: "camera",
        titleBn: "ক্যামেরার অনুমতি",
        titleEn: "Camera Permission",
        status: "fail",
        detail: "মিডিয়া ডিভাইস এপিআই ব্রাউজারে অনুপস্থিত",
      });
      return;
    }

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permission = await navigator.permissions.query({ name: "camera" as PermissionName });
        if (permission.state === "granted") {
          setCameraStatus({
            id: "camera",
            titleBn: "ক্যামেরার অনুমতি",
            titleEn: "Camera Permission",
            status: "pass",
            detail: "অনুমতি দেওয়া হয়েছে (Granted)",
          });
          return;
        } else if (permission.state === "denied") {
          setCameraStatus({
            id: "camera",
            titleBn: "ক্যামেরার অনুমতি",
            titleEn: "Camera Permission",
            status: "fail",
            detail: "অনুমতি প্রত্যাখ্যান করা হয়েছে (Denied)",
          });
          return;
        }
      }
      setCameraStatus({
        id: "camera",
        titleBn: "ক্যামেরার অনুমতি",
        titleEn: "Camera Permission",
        status: "fail",
        detail: "অনুমতি দেওয়া হয়নি বা যাচাই প্রয়োজন (Prompt/Not granted)",
        canRequestPermission: true,
      });
    } catch {
      setCameraStatus({
        id: "camera",
        titleBn: "ক্যামেরার অনুমতি",
        titleEn: "Camera Permission",
        status: "fail",
        detail: "অনুমতি পূর্বে অনুমোদিত নয় (Not granted)",
        canRequestPermission: true,
      });
    }
  }, []);

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
      setCameraStatus({
        id: "camera",
        titleBn: "ক্যামেরার অনুমতি",
        titleEn: "Camera Permission",
        status: "pass",
        detail: "ক্যামেরার অ্যাক্সেস সফল হয়েছে (Granted)",
      });
    } catch (err) {
      setCameraStatus({
        id: "camera",
        titleBn: "ক্যামেরার অনুমতি",
        titleEn: "Camera Permission",
        status: "fail",
        detail: `অনুমতি ব্যর্থ: ${err instanceof Error ? err.message : "Denied"}`,
        canRequestPermission: true,
      });
    }
  };

  // 2. Check Microphone Permission
  const checkMic = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices) {
      setMicStatus({
        id: "mic",
        titleBn: "মাইক্রোফোনের অনুমতি",
        titleEn: "Microphone Permission",
        status: "fail",
        detail: "অডিও ডিভাইস এপিআই ব্রাউজারে অনুপস্থিত",
      });
      return;
    }

    try {
      if (navigator.permissions && navigator.permissions.query) {
        const permission = await navigator.permissions.query({ name: "microphone" as PermissionName });
        if (permission.state === "granted") {
          setMicStatus({
            id: "mic",
            titleBn: "মাইক্রোফোনের অনুমতি",
            titleEn: "Microphone Permission",
            status: "pass",
            detail: "অনুমতি দেওয়া হয়েছে (Granted)",
          });
          return;
        } else if (permission.state === "denied") {
          setMicStatus({
            id: "mic",
            titleBn: "মাইক্রোফোনের অনুমতি",
            titleEn: "Microphone Permission",
            status: "fail",
            detail: "অনুমতি প্রত্যাখ্যান করা হয়েছে (Denied)",
          });
          return;
        }
      }
      setMicStatus({
        id: "mic",
        titleBn: "মাইক্রোফোনের অনুমতি",
        titleEn: "Microphone Permission",
        status: "fail",
        detail: "অনুমতি দেওয়া হয়নি বা যাচাই প্রয়োজন (Prompt/Not granted)",
        canRequestPermission: true,
      });
    } catch {
      setMicStatus({
        id: "mic",
        titleBn: "মাইক্রোফোনের অনুমতি",
        titleEn: "Microphone Permission",
        status: "fail",
        detail: "অনুমতি পূর্বে অনুমোদিত নয় (Not granted)",
        canRequestPermission: true,
      });
    }
  }, []);

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus({
        id: "mic",
        titleBn: "মাইক্রোফোনের অনুমতি",
        titleEn: "Microphone Permission",
        status: "pass",
        detail: "মাইক্রোফোনের অ্যাক্সেস সফল হয়েছে (Granted)",
      });
    } catch (err) {
      setMicStatus({
        id: "mic",
        titleBn: "মাইক্রোফোনের অনুমতি",
        titleEn: "Microphone Permission",
        status: "fail",
        detail: `অনুমতি ব্যর্থ: ${err instanceof Error ? err.message : "Denied"}`,
        canRequestPermission: true,
      });
    }
  };

  // 3. Check Bengali Voice
  const checkVoice = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceStatus({
        id: "voice",
        titleBn: "ডিভাইসে বাংলা কণ্ঠস্বর (TTS)",
        titleEn: "Bengali Voice Found",
        status: "fail",
        detail: "ব্রাউজারে স্পিচ সিন্থেসিস এপিআই অনুপলব্ধ",
      });
      return;
    }

    const voices = window.speechSynthesis.getVoices();
    const bnVoice = voices.find((v) => v.lang.toLowerCase().startsWith("bn"));

    if (bnVoice) {
      setVoiceStatus({
        id: "voice",
        titleBn: "ডিভাইসে বাংলা কণ্ঠস্বর (TTS)",
        titleEn: "Bengali Voice Found",
        status: "pass",
        detail: `বাংলা কণ্ঠস্বর পাওয়া গেছে: ${bnVoice.name} (${bnVoice.lang})`,
      });
    } else {
      setVoiceStatus({
        id: "voice",
        titleBn: "ডিভাইসে বাংলা কণ্ঠস্বর (TTS)",
        titleEn: "Bengali Voice Found",
        status: "fail",
        detail: "ডিভাইসে কোনো বাংলা কণ্ঠস্বর নেই (টেক্সট ফলব্যাক কার্যকর)",
      });
    }
  }, []);

  // 4. Check Model in Cache Storage
  const checkModelCache = useCallback(async () => {
    if (typeof window === "undefined" || !("caches" in window)) {
      setModelStatus({
        id: "model",
        titleBn: "অবজেক্ট ডিটেকশন মডেল ক্যাশ",
        titleEn: "Model Cached (efficientdet_lite0)",
        status: "fail",
        detail: "ক্যাশ স্টোরেজ এপিআই ব্রাউজারে অনুপলব্ধ",
      });
      return;
    }

    try {
      const keys = await caches.keys();
      let matched = false;
      for (const k of keys) {
        const cache = await caches.open(k);
        const res = await cache.match("/models/efficientdet_lite0.tflite");
        if (res) {
          matched = true;
          break;
        }
      }

      if (matched) {
        setModelStatus({
          id: "model",
          titleBn: "অবজেক্ট ডিটেকশন মডেল ক্যাশ",
          titleEn: "Model Cached (efficientdet_lite0)",
          status: "pass",
          detail: "মডেল ফাইল সফলভাবে ক্যাশে সংরক্ষিত আছে (6.9 MB)",
        });
      } else {
        setModelStatus({
          id: "model",
          titleBn: "অবজেক্ট ডিটেকশন মডেল ক্যাশ",
          titleEn: "Model Cached (efficientdet_lite0)",
          status: "fail",
          detail: "মডেল ফাইল ক্যাশে পাওয়া যায়নি (সেটিংসে গিয়ে ক্যাশ করুন)",
        });
      }
    } catch (err) {
      setModelStatus({
        id: "model",
        titleBn: "অবজেক্ট ডিটেকশন মডেল ক্যাশ",
        titleEn: "Model Cached (efficientdet_lite0)",
        status: "fail",
        detail: `ক্যাশ অনুসন্ধান ত্রুটি: ${err instanceof Error ? err.message : "Error"}`,
      });
    }
  }, []);

  // 5. Check OCR Data in Cache Storage
  const checkOcrCache = useCallback(async () => {
    if (typeof window === "undefined" || !("caches" in window)) {
      setOcrStatus({
        id: "ocr",
        titleBn: "বাংলা ও ইংরেজি OCR ডেটা ক্যাশ",
        titleEn: "OCR Data Cached (Tessdata)",
        status: "fail",
        detail: "ক্যাশ স্টোরেজ এপিআই ব্রাউজারে অনুপলব্ধ",
      });
      return;
    }

    try {
      const keys = await caches.keys();
      let benMatched = false;
      let engMatched = false;

      for (const k of keys) {
        const cache = await caches.open(k);
        if (!benMatched) {
          const benRes = await cache.match("/tessdata/ben.traineddata");
          if (benRes) benMatched = true;
        }
        if (!engMatched) {
          const engRes = await cache.match("/tessdata/eng.traineddata");
          if (engRes) engMatched = true;
        }
      }

      if (benMatched && engMatched) {
        setOcrStatus({
          id: "ocr",
          titleBn: "বাংলা ও ইংরেজি OCR ডেটা ক্যাশ",
          titleEn: "OCR Data Cached (Tessdata)",
          status: "pass",
          detail: "বাংলা (855KB) এবং ইংরেজি (4.1MB) উভয় ডেটা ক্যাশে সংরক্ষিত",
        });
      } else {
        setOcrStatus({
          id: "ocr",
          titleBn: "বাংলা ও ইংরেজি OCR ডেটা ক্যাশ",
          titleEn: "OCR Data Cached (Tessdata)",
          status: "fail",
          detail: `অনুপস্থিত: ${!benMatched ? "ben.traineddata " : ""}${!engMatched ? "eng.traineddata" : ""}`,
        });
      }
    } catch (err) {
      setOcrStatus({
        id: "ocr",
        titleBn: "বাংলা ও ইংরেজি OCR ডেটা ক্যাশ",
        titleEn: "OCR Data Cached (Tessdata)",
        status: "fail",
        detail: `ক্যাশ অনুসন্ধান ত্রুটি: ${err instanceof Error ? err.message : "Error"}`,
      });
    }
  }, []);

  // 6. Check Online / Offline State
  const updateNetworkState = useCallback(() => {
    const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
    if (isOnline) {
      setNetworkStatus({
        id: "network",
        titleBn: "নেটওয়ার্ক স্থিতি",
        titleEn: "Online / Offline State",
        status: "pass",
        detail: "বর্তমানে ইন্টারনেট সংযোগ সক্রিয় (Online)",
      });
    } else {
      setNetworkStatus({
        id: "network",
        titleBn: "নেটওয়ার্ক স্থিতি",
        titleEn: "Online / Offline State",
        status: "fail",
        detail: "বর্তমানে কোনো ইন্টারনেট সংযোগ নেই (Offline)",
      });
    }
  }, []);

  // Run all checks
  const runAllChecks = useCallback(() => {
    checkCamera();
    checkMic();
    checkVoice();
    checkModelCache();
    checkOcrCache();
    updateNetworkState();
  }, [checkCamera, checkMic, checkVoice, checkModelCache, checkOcrCache, updateNetworkState]);

  useEffect(() => {
    queueMicrotask(() => {
      runAllChecks();
    });

    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.onvoiceschanged = checkVoice;
    }

    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);

    return () => {
      window.removeEventListener("online", updateNetworkState);
      window.removeEventListener("offline", updateNetworkState);
    };
  }, [runAllChecks, checkVoice, updateNetworkState]);

  const items = [
    cameraStatus,
    micStatus,
    voiceStatus,
    modelStatus,
    ocrStatus,
    networkStatus,
  ];

  return (
    <div className="app-container" style={{ maxWidth: "800px" }}>
      <header className="app-header" style={{ marginBottom: "1.5rem" }}>
        <div className="app-title-group">
          <h1 className="app-title" style={{ fontSize: "2rem" }}>
            ডেমো মোড চেকলিস্ট
          </h1>
          <p className="app-subtitle">
            DRISHTI AI — সিস্টেমের রিয়েল-টাইম হার্ডওয়্যার, মডেল এবং অফলাইন প্রস্তুতি যাচাই
          </p>
        </div>
        <div>
          <Link
            href="/"
            className="action-button variant-secondary"
            style={{
              padding: "0.75rem 1.25rem",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minHeight: "48px",
              fontWeight: 700,
            }}
          >
            ← মূল অ্যাপে ফিরুন
          </Link>
        </div>
      </header>

      {/* Re-check action bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={runAllChecks}
          className="action-button variant-primary"
          style={{ minHeight: "48px", padding: "0.75rem 1.5rem", fontWeight: 700 }}
        >
          🔄 পুনরায় পরীক্ষা করুন (Re-run Checks)
        </button>
        <span style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>
          সবগুলো পরীক্ষা ব্রাউজারের জীবন্ত স্টেট থেকে তাৎক্ষণিক রিড করা হয়।
        </span>
      </div>

      {/* Checklist Grid */}
      <section aria-labelledby="demo-checklist-heading">
        <h2 id="demo-checklist-heading" className="sr-only">
          সিস্টেম চেকলিস্ট আইটেমসমূহ
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {items.map((item) => {
            const isPass = item.status === "pass";
            const isChecking = item.status === "checking";

            return (
              <div
                key={item.id}
                style={{
                  background: "var(--bg-surface)",
                  border: `2px solid ${
                    isChecking
                      ? "var(--border-strong)"
                      : isPass
                      ? "#10b981"
                      : "#ef4444"
                  }`,
                  borderRadius: "12px",
                  padding: "1.25rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: 1, minWidth: "260px" }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginBottom: "0.35rem",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: isChecking
                          ? "#334155"
                          : isPass
                          ? "#064e3b"
                          : "#7f1d1d",
                        color: isChecking
                          ? "#94a3b8"
                          : isPass
                          ? "#6ee7b7"
                          : "#fca5a5",
                        fontSize: "1.2rem",
                        fontWeight: 900,
                      }}
                      aria-hidden="true"
                    >
                      {isChecking ? "…" : isPass ? "✓" : "✗"}
                    </span>
                    <div>
                      <strong style={{ fontSize: "1.1rem", color: "var(--text-primary)" }}>
                        {item.titleBn}
                      </strong>
                      <span
                        style={{
                          display: "block",
                          fontSize: "0.85rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {item.titleEn}
                      </span>
                    </div>
                  </div>
                  <p
                    style={{
                      margin: "0.25rem 0 0 2.75rem",
                      fontSize: "0.95rem",
                      color: isPass ? "#a7f3d0" : "#fca5a5",
                      fontWeight: 600,
                    }}
                  >
                    {item.detail}
                  </p>
                </div>

                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <span
                    className={`status-badge ${
                      isPass ? "badge-live" : "badge-planned"
                    }`}
                    style={{
                      background: isPass ? "#064e3b" : "#450a0a",
                      color: isPass ? "#6ee7b7" : "#fca5a5",
                      borderColor: isPass ? "#10b981" : "#ef4444",
                      fontSize: "0.85rem",
                      padding: "0.4rem 0.8rem",
                    }}
                  >
                    {isChecking
                      ? "CHECKING"
                      : isPass
                      ? "✓ PASS (সচল)"
                      : "✗ FAIL (অনুপলব্ধ)"}
                  </span>

                  {item.canRequestPermission && !isPass && (
                    <button
                      type="button"
                      onClick={item.id === "camera" ? requestCamera : requestMic}
                      className="action-button variant-primary"
                      style={{
                        minHeight: "44px",
                        padding: "0.4rem 0.85rem",
                        fontSize: "0.85rem",
                        fontWeight: 700,
                      }}
                    >
                      অনুমতি অনুরোধ করুন
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer Navigation */}
      <footer style={{ marginTop: "2rem", textAlign: "center" }}>
        <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
          DRISHTI AI — BUET CSE | Grameenphone FutureMakers 2026
        </p>
      </footer>
    </div>
  );
}
