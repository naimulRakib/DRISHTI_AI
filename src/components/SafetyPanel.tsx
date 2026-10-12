"use client";

import React, { useState, useEffect, useRef, useReducer, useCallback } from "react";
import {
  safetyReducer,
  INITIAL_SAFETY_CONTEXT,
  DEFAULT_COUNTDOWN_SECONDS,
} from "@/lib/safety/machine";
import {
  requestDeviceMotionPermission,
  subscribeToDeviceMotion,
} from "@/lib/safety/fallDetection";
import { speak, stopSpeaking } from "@/lib/tools/speech";
import {
  startListening,
  stopListening,
  isSpeechRecognitionSupported,
} from "@/lib/tools/listen";
import {
  isNativeAvailable,
  saveEmergencyContact,
  getEmergencyContact,
  cancelFallAlert,
  triggerFallSimulation,
  getSmartCaneServerUrl,
  subscribeFallEvents,
} from "@/lib/native/bridge";

interface SafetyPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SafetyPanel({ isOpen, onClose }: SafetyPanelProps) {
  const [context, dispatch] = useReducer(safetyReducer, INITIAL_SAFETY_CONTEXT);
  const [currentMagnitude, setCurrentMagnitude] = useState<number>(9.8);
  const [motionPermissionStatus, setMotionPermissionStatus] = useState<string>("unknown");
  const [emergencyPhone, setEmergencyPhone] = useState<string>(() => getEmergencyContact());
  const [phoneSavedMessage, setPhoneSavedMessage] = useState<string>("");
  const [smartCaneUrl] = useState<string>(() => getSmartCaneServerUrl());
  const [isNative] = useState<boolean>(() => isNativeAvailable());
  const [mockLocationLink, setMockLocationLink] = useState<string>(
    "https://www.google.com/maps?q=23.7266,90.3888" // Default fallback
  );

  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const hasSpokenRef = useRef<{ [key: number]: boolean }>({});

  // Subscribe to native Android fall detection events & Smart Cane events
  useEffect(() => {
    if (!isNativeAvailable()) return;

    const unsubscribe = subscribeFallEvents({
      onTriggered: () => {
        dispatch({ type: "FALL_SUSPECTED" });
      },
      onTick: () => {
        // Synchronize native countdown
        dispatch({ type: "COUNTDOWN_TICK" });
      },
      onCancelled: () => {
        dispatch({ type: "CANCEL" });
        stopSpeaking();
      },
      onMotionMagnitude: (mag) => {
        setCurrentMagnitude(Math.round(mag * 10) / 10);
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Obtain current coordinates for GPS preview
  useEffect(() => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMockLocationLink(
            `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
          );
        },
        () => {},
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  // Web Motion listener subscription (for browser simulation when not in native APK)
  useEffect(() => {
    if (context.state !== "MONITORING" || isNativeAvailable()) return;

    const unsubscribe = subscribeToDeviceMotion(
      () => {
        dispatch({ type: "FALL_SUSPECTED" });
      },
      (mag) => {
        setCurrentMagnitude(Math.round(mag * 10) / 10);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [context.state]);

  // Handle Cancel action (works from UI button, voice, or hardware cane button)
  const handleCancel = useCallback(() => {
    stopSpeaking();
    stopListening();
    cancelFallAlert(); // Native siren & countdown stop
    dispatch({ type: "CANCEL" });
    speak("পতন সতর্কতা বাতিল করা হয়েছে। পর্যবেক্ষণ পুনরায় সচল রয়েছে।");
  }, []);

  // Countdown timer and spoken prompts during TRIGGERED and COUNTDOWN
  useEffect(() => {
    if (context.state !== "TRIGGERED" && context.state !== "COUNTDOWN") {
      hasSpokenRef.current = {};
      return;
    }

    if (cancelBtnRef.current) {
      cancelBtnRef.current.focus();
    }

    if (!hasSpokenRef.current[DEFAULT_COUNTDOWN_SECONDS]) {
      hasSpokenRef.current[DEFAULT_COUNTDOWN_SECONDS] = true;
      speak("পতন সনাক্তকরণের সতর্কতা। বাতিল করতে বাতিল বোতাম চাপুন।");
    }

    // Voice cancel listener
    if (isSpeechRecognitionSupported()) {
      startListening({
        onResult: (transcript) => {
          const lower = transcript.toLowerCase();
          if (
            lower.includes("বাতিল") ||
            lower.includes("থামো") ||
            lower.includes("থামুন") ||
            lower.includes("cancel")
          ) {
            handleCancel();
          }
        },
        onError: () => {},
        onStateChange: () => {},
      });
    }

    // Web ticking interval if outside native APK
    const timer = setInterval(() => {
      dispatch({ type: "COUNTDOWN_TICK" });
    }, 1000);

    return () => {
      clearInterval(timer);
      stopListening();
    };
  }, [context.state, handleCancel]);

  // Spoken countdown notifications at 10s and 5s
  useEffect(() => {
    if (context.state === "COUNTDOWN") {
      const sec = context.countdownSeconds;
      if (sec === 10 && !hasSpokenRef.current[10]) {
        hasSpokenRef.current[10] = true;
        speak("১০ সেকেন্ড বাকি, বাতিল করতে বাতিল বোতাম চাপুন।");
      } else if (sec === 5 && !hasSpokenRef.current[5]) {
        hasSpokenRef.current[5] = true;
        speak("৫ সেকেন্ড বাকি, বাতিল করতে বাতিল বোতাম চাপুন।");
      }
    }
  }, [context.state, context.countdownSeconds]);

  // Handle TIMEOUT / ALERT announcement
  useEffect(() => {
    if (context.state === "ALERT_TEST_SENT") {
      stopSpeaking();
      stopListening();
      if (isNativeAvailable()) {
        speak("জরুরি এসএমএস এবং সরাসরি ফোন কল পাঠানো হচ্ছে।");
      } else {
        speak("পরীক্ষা মোড: জরুরি বার্তা পাঠানো হয়নি");
      }
    }
  }, [context.state]);

  const handleSaveContact = () => {
    if (!emergencyPhone.trim()) return;
    saveEmergencyContact(emergencyPhone);
    setPhoneSavedMessage("✓ জরুরি নম্বর সফলভাবে সংরক্ষিত হয়েছে!");
    speak("জরুরি নম্বর সংরক্ষিত হয়েছে");
    setTimeout(() => setPhoneSavedMessage(""), 4000);
  };

  const handleStartMonitoring = async () => {
    if (isNativeAvailable()) {
      dispatch({ type: "START_MONITOR" });
      speak("নেটিভ পতন পর্যবেক্ষণ সক্রিয় রয়েছে।");
      return;
    }
    const permission = await requestDeviceMotionPermission();
    setMotionPermissionStatus(permission);
    if (permission === "denied") {
      speak("মোশন সেন্সরের অনুমতি দেওয়া হয়নি।");
      return;
    }
    dispatch({ type: "START_MONITOR" });
    speak("পতন পর্যবেক্ষণ শুরু হয়েছে।");
  };

  const handleStopMonitoring = () => {
    dispatch({ type: "STOP_MONITOR" });
    speak("পতন পর্যবেক্ষণ বন্ধ করা হয়েছে।");
  };

  const handleSimulateFall = () => {
    stopSpeaking();
    if (isNativeAvailable()) {
      triggerFallSimulation();
    }
    dispatch({ type: "SIMULATE_FALL" });
  };

  const handleReset = () => {
    stopSpeaking();
    cancelFallAlert();
    dispatch({ type: "RESET" });
  };

  const handleClose = () => {
    stopSpeaking();
    stopListening();
    onClose();
  };

  if (!isOpen) return null;

  const activeContactText = emergencyPhone || "নির্ধারিত নেই (999)";
  const emergencyMessagePreview = `জরুরি সতর্কতা! দৃষ্টি (DRISHTI AI) ব্যবহারকারীর সম্ভাব্য পতন সনাক্ত করেছে।\nবর্তমান অবস্থান: ${mockLocationLink}`;

  return (
    <section
      aria-labelledby="safety-modal-title"
      className="safety-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="safety-modal-content">
        {/* System Mode Indicator */}
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "0.5rem",
            background: isNative ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
            border: isNative ? "1px solid #10b981" : "1px solid #f59e0b",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1rem",
          }}
          role="status"
        >
          <span style={{ fontSize: "1.2rem" }}>{isNative ? "🛡️" : "⚠️"}</span>
          <div style={{ fontSize: "0.85rem" }}>
            <strong>
              {isNative
                ? "নেটিভ হার্ডওয়্যার সুরক্ষা সক্রিয় (ANVI 24/7 Background System)"
                : "পরীক্ষা মোড (ব্রাউজার সিমুলেশন) — কোনো বার্তা বা কল পাঠানো হবে না"}
            </strong>
            <p style={{ margin: "0.2rem 0 0 0", color: "var(--text-secondary)" }}>
              {isNative
                ? "স্ক্রিন বন্ধ বা পকেটে থাকলেও অ্যাক্সিলারোমিটার + জাইরোস্কোপ ও সাইরেন চালু থাকবে।"
                : "ডিভাইসে সরাসরি এসএমএস ও ফোন কল করতে দৃষ্টি অ্যান্ড্রয়েড অ্যাপ ব্যবহার করুন।"}
            </p>
          </div>
        </div>

        {/* Modal Header */}
        <div className="camera-modal-header">
          <h2 id="safety-modal-title" style={{ fontSize: "1.25rem", fontWeight: 800 }}>
            নিরাপত্তা ও পতন সনাক্তকরণ (Safety & Fall Alert)
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="settings-close-btn"
            aria-label="নিরাপত্তা প্যানেল বন্ধ করুন"
          >
            ✕ বন্ধ করুন
          </button>
        </div>

        {/* Emergency Contact Configuration Card */}
        <div
          style={{
            background: "rgba(30, 41, 59, 0.7)",
            border: "1px solid rgba(148, 163, 184, 0.2)",
            borderRadius: "0.75rem",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <label
            htmlFor="emergency-phone-input"
            style={{ display: "block", fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.4rem" }}
          >
            📞 জরুরি যোগাযোগ নম্বর (Emergency Contact):
          </label>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input
              id="emergency-phone-input"
              type="tel"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="+8801XXXXXXXXX"
              style={{
                flex: 1,
                padding: "0.6rem 0.8rem",
                borderRadius: "0.5rem",
                background: "#0f172a",
                border: "1px solid #334155",
                color: "#ffffff",
                fontSize: "1rem",
              }}
            />
            <button
              type="button"
              onClick={handleSaveContact}
              style={{
                padding: "0.6rem 1rem",
                borderRadius: "0.5rem",
                background: "#2563eb",
                color: "#ffffff",
                fontWeight: 700,
                border: "none",
                cursor: "pointer",
              }}
            >
              সংরক্ষণ
            </button>
          </div>
          {phoneSavedMessage && (
            <p style={{ color: "#34d399", fontSize: "0.85rem", marginTop: "0.4rem" }}>
              {phoneSavedMessage}
            </p>
          )}
        </div>

        {/* Main Flow Views based on State */}
        {context.state === "TRIGGERED" || context.state === "COUNTDOWN" ? (
          /* COUNTDOWN VIEW */
          <div className="countdown-box" role="alert" aria-live="assertive">
            <h3 style={{ fontSize: "1.3rem", color: "#fca5a5" }}>
              🚨 সম্ভাব্য পতন সনাক্ত হয়েছে!
            </h3>
            <div className="countdown-number" aria-label={`কাউন্টডাউন ${context.countdownSeconds} সেকেন্ড`}>
              {context.countdownSeconds}
            </div>
            <p style={{ fontSize: "1.05rem", fontWeight: 700, color: "#ffffff" }}>
              বাতিল করতে বড় লাল বোতামটি চাপুন অথবা মুখে &quot;বাতিল&quot; বলুন।
            </p>
            <p style={{ fontSize: "0.85rem", color: "#fef08a" }}>
              কাউন্টডাউন শেষ হলে স্বয়ংক্রিয়ভাবে {activeContactText} নম্বরে জরুরি কল ও জিপিএস এসএমএস যাবে।
            </p>
            <button
              ref={cancelBtnRef}
              type="button"
              onClick={handleCancel}
              className="cancel-emergency-btn"
              aria-label="পতন সতর্কতা বাতিল করতে চাপ দিন"
            >
              ✕ বাতিল করুন (CANCEL)
            </button>
          </div>
        ) : context.state === "ALERT_TEST_SENT" ? (
          /* ALERT DISPATCHED VIEW */
          <div className="safety-state-card" role="status" aria-live="polite">
            <h3 style={{ fontSize: "1.3rem", color: isNative ? "#34d399" : "var(--accent-amber)" }}>
              {isNative ? "✓ জরুরি ব্যবস্থা প্রেরিত!" : "পরীক্ষা মোড: জরুরি বার্তা পাঠানো হয়নি"}
            </h3>
            <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
              {isNative
                ? `প্রাপক ${activeContactText} নম্বরে জিপিএস লোকেশনসহ জরুরি বার্তা পাঠানো হয়েছে এবং জরুরি কল প্রস্তুত রয়েছে।`
                : "কাউন্টডাউন সময়সীমা শেষ হয়েছে। বাস্তব ব্যবস্থায় এই বার্তাটি প্রেরিত হতো:"}
            </p>

            <div className="mock-alert-card">
              <div className="mock-alert-recipient">
                <strong>প্রাপক (Recipient):</strong> {activeContactText}
              </div>
              <div className="mock-alert-message" style={{ whiteSpace: "pre-line" }}>
                {emergencyMessagePreview}
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="safety-btn-simulate"
              style={{ width: "100%", marginTop: "0.75rem" }}
            >
              পুনরায় শুরু করুন (Reset)
            </button>
          </div>
        ) : (
          /* IDLE / MONITORING VIEW */
          <div className="safety-state-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: context.state === "MONITORING" || isNative ? "#34d399" : "#94a3b8",
                  display: "inline-block",
                }}
                aria-hidden="true"
              />
              <strong>
                স্থিতি:{" "}
                {isNative
                  ? "নেটিভ সেন্সর ২৪/৭ সচল (Hardware Active)"
                  : context.state === "MONITORING"
                  ? "মনিটরিং সচল (Web Active)"
                  : "নিষ্ক্রিয় (Idle)"}
              </strong>
            </div>

            <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", margin: "0.5rem 0" }}>
              বর্তমান ত্বরণ মান: <strong>{currentMagnitude} মি/সে²</strong>
            </p>

            {motionPermissionStatus === "denied" && (
              <p style={{ color: "var(--accent-rose)", fontSize: "0.9rem", margin: "0.4rem 0" }}>
                মোশন সেন্সর অনুমতি প্রত্যাখ্যাত হয়েছে। ব্রাউজার সেটিংসে অনুমতি দিন।
              </p>
            )}

            {/* Smart Cane IoT Hardware Info */}
            <div
              style={{
                marginTop: "0.5rem",
                padding: "0.75rem",
                borderRadius: "0.5rem",
                background: "rgba(15, 23, 42, 0.6)",
                border: "1px dashed rgba(148, 163, 184, 0.3)",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ fontWeight: 700, color: "#38bdf8", marginBottom: "0.2rem" }}>
                🦯 স্মার্ট ক্যান (Raspberry Pi Smart Cane IoT):
              </div>
              <p style={{ margin: 0, color: "var(--text-secondary)" }}>
                গেట్‌ওয়ে আইপি: <code>{smartCaneUrl}</code> | আল্ট্রাসোনিক বাধা সংকেত (&lt;২০সেমি) ও ক্যামেরা বোতাম সংযুক্ত।
              </p>
            </div>

            <div className="safety-actions-grid" style={{ width: "100%", marginTop: "1rem" }}>
              {!isNative && (
                context.state !== "MONITORING" ? (
                  <button
                    type="button"
                    onClick={handleStartMonitoring}
                    className="safety-btn-monitor"
                  >
                    পতন পর্যবেক্ষণ চালু করুন
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleStopMonitoring}
                    className="safety-btn-stop"
                  >
                    পতন পর্যবেক্ষণ বন্ধ করুন
                  </button>
                )
              )}

              <button
                type="button"
                onClick={handleSimulateFall}
                className="safety-btn-simulate"
              >
                ⚡ পতন অনুকরণ করুন (Simulate Fall & Test Siren)
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
