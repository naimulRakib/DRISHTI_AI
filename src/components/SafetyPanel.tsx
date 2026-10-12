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

interface SafetyPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function SafetyPanel({ isOpen, onClose }: SafetyPanelProps) {
  const [context, dispatch] = useReducer(safetyReducer, INITIAL_SAFETY_CONTEXT);
  const [currentMagnitude, setCurrentMagnitude] = useState<number>(9.8);
  const [motionPermissionStatus, setMotionPermissionStatus] = useState<string>("unknown");
  const [mockLocationLink, setMockLocationLink] = useState<string>(
    "https://www.google.com/maps?q=23.7266,90.3888" // Default fallback (BUET coordinates)
  );

  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const hasSpokenRef = useRef<{ [key: number]: boolean }>({});

  // Obtain current coordinates for the mock alert preview
  useEffect(() => {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMockLocationLink(
            `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
          );
        },
        () => {
          // Use default fallback if permission not granted
        },
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  }, []);

  // Handle Motion listener subscription only while in MONITORING
  useEffect(() => {
    if (context.state !== "MONITORING") return;

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

  // Handle Cancel action (works from button click or voice)
  const handleCancel = useCallback(() => {
    stopSpeaking();
    stopListening();
    dispatch({ type: "CANCEL" });
    speak("পতন সতর্কতা বাতিল করা হয়েছে। পর্যবেক্ষণ পুনরায় সচল রয়েছে।");
  }, []);

  // Countdown timer and spoken prompts during TRIGGERED and COUNTDOWN
  useEffect(() => {
    if (context.state !== "TRIGGERED" && context.state !== "COUNTDOWN") {
      hasSpokenRef.current = {};
      return;
    }

    // Auto-focus the Big Cancel button
    if (cancelBtnRef.current) {
      cancelBtnRef.current.focus();
    }

    // Initial instruction when entering trigger/countdown
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

    // Ticking interval every 1 second
    const timer = setInterval(() => {
      dispatch({ type: "COUNTDOWN_TICK" });
    }, 1000);

    return () => {
      clearInterval(timer);
      stopListening();
    };
  }, [context.state, handleCancel]);

  // Spoken countdown notifications every 5 seconds (10s, 5s)
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

  // Handle TIMEOUT / ALERT_TEST_SENT announcement
  useEffect(() => {
    if (context.state === "ALERT_TEST_SENT") {
      stopSpeaking();
      stopListening();
      speak("পরীক্ষা মোড: জরুরি বার্তা পাঠানো হয়নি");
    }
  }, [context.state]);

  const handleStartMonitoring = async () => {
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
    dispatch({ type: "SIMULATE_FALL" });
  };

  const handleReset = () => {
    stopSpeaking();
    dispatch({ type: "RESET" });
  };

  const handleClose = () => {
    stopSpeaking();
    stopListening();
    dispatch({ type: "STOP_MONITOR" });
    onClose();
  };

  if (!isOpen) return null;

  const mockEmergencyText = `জরুরি সতর্কতা: সম্ভাব্য পতন সনাক্ত হয়েছে। ব্যবহারকারীর বর্তমান অবস্থান: ${mockLocationLink} (পরীক্ষা মোড: কোনো বার্তা পাঠানো হয়নি)`;

  return (
    <section
      aria-labelledby="safety-modal-title"
      className="safety-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="safety-modal-content">
        {/* Persistent TEST MODE Banner across the whole flow */}
        <div className="test-mode-banner" role="banner">
          <span aria-hidden="true">⚠️</span>
          <strong>পরীক্ষা মোড (TEST MODE) — এটি একটি সিমুলেশন, কোনো বার্তা বা কল পাঠানো হবে না</strong>
        </div>

        {/* Modal Header */}
        <div className="camera-modal-header">
          <h2 id="safety-modal-title" style={{ fontSize: "1.25rem", fontWeight: 800 }}>
            নিরাপত্তা ও পতন সনাক্তকরণ (Safety Test)
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

        {/* Experimental Disclaimer Box */}
        <div className="safety-disclaimer-box">
          <span className="safety-badge-experimental">
            পরীক্ষামূলক, যাচাই করা হয়নি
          </span>
          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
            <strong>সতর্কতা:</strong> এটি শুধুমাত্র এই পাতা খোলা থাকা অবস্থায় এবং ডিভাইসের স্ক্রিন চালু থাকা অবস্থায় কাজ করে।
          </p>
        </div>

        {/* Main Flow Views based on State */}
        {(context.state === "TRIGGERED" || context.state === "COUNTDOWN") ? (
          /* COUNTDOWN VIEW */
          <div className="countdown-box" role="alert" aria-live="assertive">
            <h3 style={{ fontSize: "1.3rem", color: "#fca5a5" }}>
              সম্ভাব্য পতন সনাক্ত হয়েছে!
            </h3>
            <div className="countdown-number" aria-label={`কাউন্টডাউন ${context.countdownSeconds} সেকেন্ড`}>
              {context.countdownSeconds}
            </div>
            <p style={{ fontSize: "1.1rem", fontWeight: 700, color: "#ffffff" }}>
              বাতিল করতে বড় লাল বোতামটি চাপুন অথবা মুখে &quot;বাতিল&quot; বলুন।
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
          /* ALERT TEST SENT VIEW */
          <div className="safety-state-card" role="status" aria-live="polite">
            <h3 style={{ fontSize: "1.3rem", color: "var(--accent-amber)" }}>
              পরীক্ষা মোড: জরুরি বার্তা পাঠানো হয়নি
            </h3>
            <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
              কাউন্টডাউন সময়সীমা শেষ হয়েছে। বাস্তব ব্যবস্থায় এই বার্তাটি প্রেরিত হতো:
            </p>

            <div className="mock-alert-card">
              <div className="mock-alert-recipient">
                <strong>প্রাপক (Mock Contact):</strong> পরীক্ষামূলক যোগাযোগ
              </div>
              <div className="mock-alert-message">
                {mockEmergencyText}
              </div>
            </div>

            <p style={{ fontSize: "0.85rem", color: "var(--accent-emerald)", fontWeight: 700 }}>
              ✓ কোনো এসএমএস (sms:) বা ফোন কল (tel:) স্বয়ংক্রিয়ভাবে করা হয়নি।
            </p>

            <button
              type="button"
              onClick={handleReset}
              className="safety-btn-simulate"
              style={{ width: "100%", marginTop: "0.5rem" }}
            >
              পুনরায় শুরু করুন (Reset)
            </button>
          </div>
        ) : (
          /* IDLE / MONITORING / CANCELLED VIEW */
          <div className="safety-state-card">
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  width: "12px",
                  height: "12px",
                  borderRadius: "50%",
                  background: context.state === "MONITORING" ? "#34d399" : "#94a3b8",
                  display: "inline-block",
                }}
                aria-hidden="true"
              />
              <strong>
                স্থিতি: {context.state === "MONITORING" ? "মনিটরিং সচল (Monitoring Active)" : "নিষ্ক্রিয় (Idle)"}
              </strong>
            </div>

            {context.state === "MONITORING" && (
              <p style={{ fontSize: "0.95rem", color: "var(--text-muted)" }}>
                বর্তমান ত্বরণ মান: <strong>{currentMagnitude} মি/সে²</strong>
              </p>
            )}

            {motionPermissionStatus === "denied" && (
              <p style={{ color: "var(--accent-rose)", fontSize: "0.9rem" }}>
                মোশন সেন্সর অনুমতি প্রত্যাখ্যাত হয়েছে। অনুগ্রহ করে ব্রাউজার সেটিংসে অনুমতি দিন।
              </p>
            )}

            {/* Always provide Simulate Fall button so demo doesn't depend on shaking */}
            <div className="safety-actions-grid" style={{ width: "100%", marginTop: "0.5rem" }}>
              {context.state !== "MONITORING" ? (
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
              )}

              {/* Requirement 4: Always provide a button "পতন অনুকরণ করুন" */}
              <button
                type="button"
                onClick={handleSimulateFall}
                className="safety-btn-simulate"
              >
                ⚡ পতন অনুকরণ করুন (Simulate Fall)
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
