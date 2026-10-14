"use client";

import React, { useState, useEffect, FormEvent, useRef } from "react";
import Link from "next/link";
import ActionButton from "@/components/ActionButton";
import StatusRegion from "@/components/StatusRegion";
import SettingsPanel from "@/components/SettingsPanel";
import CameraPanel, { CameraAiMode } from "@/components/CameraPanel";
import SafetyPanel from "@/components/SafetyPanel";
import ProximityPanel from "@/components/ProximityPanel";
import WalkWithMeModal from "@/components/WalkWithMeModal";
import FamilyMembersModal from "@/components/FamilyMembersModal";
import CurrencyModal from "@/components/CurrencyModal";
import GeofenceModal from "@/components/GeofenceModal";
import EcholocationRadarModal from "@/components/EcholocationRadarModal";
import { toolRegistry } from "@/lib/tools/registry";
import {
  speak,
  stopSpeaking,
  repeatLast,
  subscribeSpeechState,
  SpeechStatusState,
} from "@/lib/tools/speech";
import {
  startListening,
  stopListening,
  MicState,
  isSpeechRecognitionSupported,
} from "@/lib/tools/listen";
import { routeIntent } from "@/lib/router/router";
import { ToolName } from "@/lib/types";
import { subscribeFallEvents } from "@/lib/native/bridge";
import { processCaneFrame, CaneVisionResult } from "@/lib/tools/smartCaneVision";

export default function Home() {
  const [currentMessage, setCurrentMessage] = useState<string>(
    "স্বাগতম। প্রশ্ন করতে মুখে বলুন বা নিচের বক্সে লিখে জানান।"
  );
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraAiMode>("objects");
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);
  const [isProximityOpen, setIsProximityOpen] = useState(false);
  const [isWalkOpen, setIsWalkOpen] = useState(false);
  const [isFamilyOpen, setIsFamilyOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isGeofenceOpen, setIsGeofenceOpen] = useState(false);
  const [isRadarOpen, setIsRadarOpen] = useState(false);
  const [commandText, setCommandText] = useState("");
  const [micState, setMicState] = useState<MicState>("idle");
  const [speechState, setSpeechState] = useState<SpeechStatusState>({
    isSpeaking: false,
    noBengaliVoice: false,
    lastSpokenText: null,
    visibleMessage: null,
  });

  const textInputRef = useRef<HTMLInputElement>(null);

  // Subscribe to speech synthesis status
  useEffect(() => {
    const unsubscribe = subscribeSpeechState((state) => {
      setSpeechState(state);
      if (state.visibleMessage) {
        setCurrentMessage(state.visibleMessage);
      }
    });
    return () => {
      unsubscribe();
      stopListening();
    };
  }, []);

  // Hands-Free Smart Cane Vision Ingestion: Triggers automatically when cane button is pressed
  useEffect(() => {
    const unsubFall = subscribeFallEvents({
      onCaneImage: async (caneData) => {
        setIsCameraOpen(true);
        const result = await processCaneFrame(caneData);
        if (result.spokenSummaryBn) {
          setCurrentMessage(result.spokenSummaryBn);
        }
      },
    });

    const handleVisionResult = (e: Event) => {
      const customEvent = e as CustomEvent<CaneVisionResult>;
      if (customEvent.detail?.spokenSummaryBn) {
        setCurrentMessage(customEvent.detail.spokenSummaryBn);
      }
    };

    window.addEventListener("drishti:cane-vision-result", handleVisionResult);

    return () => {
      unsubFall();
      window.removeEventListener("drishti:cane-vision-result", handleVisionResult);
    };
  }, []);

  /**
   * Process a recognized or typed user command through the intent router
   */
  const handleProcessCommand = async (rawInput: string) => {
    const trimmed = rawInput.trim();
    if (!trimmed) return;

    const matchedTool = routeIntent(trimmed);

    if (matchedTool === "unknown") {
      const unknownMsg =
        "কমান্ডটি বুঝতে পারা যায়নি। আপনি বলতে পারেন: ১. 'আমার সামনে কী আছে?', ২. 'লেখা পড়ে শোনাও', অথবা ৩. 'সেফটি টেস্ট'।";
      setCurrentMessage(unknownMsg);
      speak(unknownMsg);
      return;
    }

    if (matchedTool === "stopSpeaking") {
      handleStopSpeaking();
      return;
    }

    if (matchedTool === "repeatLast") {
      handleRepeatLast();
      return;
    }

    if (matchedTool === "askVision") {
      setCameraMode("qa");
      setIsCameraOpen(true);
      const tool = toolRegistry.askVision;
      const result = await tool.run({ question: trimmed });
      setCurrentMessage(result.message_bn);
      return;
    }

    if (matchedTool === "describeSurroundings") {
      setCameraMode("objects");
      setIsCameraOpen(true);
      return;
    }

    if (matchedTool === "readText") {
      setCameraMode("ocr");
      setIsCameraOpen(true);
      return;
    }

    if (matchedTool === "recognizePerson") {
      setIsFamilyOpen(true);
      const msg = "পরিচিত মুখ ও পরিবার তালিকা চালু হয়েছে। ক্যামেরার সামনে মুখ রাখুন।";
      setCurrentMessage(msg);
      speak(msg);
      return;
    }

    if (matchedTool === "safetyTest") {
      setIsSafetyOpen(true);
    }

    if (matchedTool === "readProximity") {
      setIsProximityOpen(true);
    }

    if (matchedTool === "walkWithMe") {
      setIsWalkOpen(true);
    }

    if (matchedTool === "readCurrency") {
      setIsCurrencyOpen(true);
    }

    if (matchedTool === "checkSafeZone") {
      setIsGeofenceOpen(true);
    }

    if (matchedTool === "echolocationRadar") {
      setIsRadarOpen(true);
    }

    const tool = toolRegistry[matchedTool];
    if (tool) {
      const result = await tool.run();
      setCurrentMessage(result.message_bn);
      if (
        matchedTool !== "getLocation" &&
        matchedTool !== "readProximity" &&
        matchedTool !== "readCurrency" &&
        matchedTool !== "checkSafeZone" &&
        matchedTool !== "echolocationRadar"
      ) {
        speak(result.message_bn);
      }
    }
  };

  /**
   * Start listening to voice input via SpeechRecognition
   */
  const handleVoiceInputClick = () => {
    if (micState === "listening") {
      stopListening();
      setMicState("idle");
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      const unsupportedMsg =
        "আপনার ব্রাউজারে বাংলা ভয়েস ইনপুট সমর্থিত নয়। অনুগ্রহ করে নিচের বক্সে লিখে জানান।";
      setMicState("error");
      setCurrentMessage(unsupportedMsg);
      speak(unsupportedMsg);
      textInputRef.current?.focus();
      return;
    }

    startListening({
      onResult: (transcript) => {
        handleProcessCommand(transcript);
      },
      onError: (errorMessageBn) => {
        setCurrentMessage(errorMessageBn);
        speak(errorMessageBn);
        textInputRef.current?.focus();
      },
      onStateChange: (state) => {
        setMicState(state);
      },
    });
  };

  // Direct trigger for registry tool buttons
  const handleExecuteTool = async (toolName: ToolName) => {
    if (toolName === "describeSurroundings") {
      setCameraMode("objects");
      setIsCameraOpen(true);
      return;
    }

    if (toolName === "readText") {
      setCameraMode("ocr");
      setIsCameraOpen(true);
      return;
    }

    if (toolName === "askVision") {
      setCameraMode("qa");
      setIsCameraOpen(true);
      return;
    }

    if (toolName === "safetyTest") {
      setIsSafetyOpen(true);
    }

    if (toolName === "readProximity") {
      setIsProximityOpen(true);
    }

    if (toolName === "walkWithMe") {
      setIsWalkOpen(true);
    }

    if (toolName === "readCurrency") {
      setIsCurrencyOpen(true);
    }

    if (toolName === "checkSafeZone") {
      setIsGeofenceOpen(true);
    }

    if (toolName === "echolocationRadar") {
      setIsRadarOpen(true);
    }

    const tool = toolRegistry[toolName];
    if (!tool) return;

    const result = await tool.run();
    setCurrentMessage(result.message_bn);
    if (
      toolName !== "getLocation" &&
      toolName !== "readProximity" &&
      toolName !== "readCurrency" &&
      toolName !== "checkSafeZone" &&
      toolName !== "echolocationRadar"
    ) {
      speak(result.message_bn);
    }
  };

  const handleStopSpeaking = () => {
    stopSpeaking();
    stopListening();
    setCurrentMessage("কথা বলা ও শ্রবণ বন্ধ করা হয়েছে।");
  };

  const handleRepeatLast = () => {
    repeatLast();
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (commandText.trim()) {
      handleProcessCommand(commandText);
      setCommandText("");
    }
  };

  const handleFrameCaptured = (frame: ImageData) => {
    const msg = `ক্যামেরা ফ্রেম সফলভাবে গ্রহণ করা হয়েছে (${frame.width}×${frame.height} পিক্সেল)।`;
    setCurrentMessage(msg);
  };

  const renderMicStatusLabel = () => {
    if (micState === "listening") {
      return (
        <span className="mic-badge state-listening" role="status" aria-live="assertive">
          <span aria-hidden="true">🎙</span> মাইক্রোফোন: কথা শুনছি... (Listening)
        </span>
      );
    }
    if (micState === "error") {
      return (
        <span className="mic-badge state-error" role="status" aria-live="polite">
          <span aria-hidden="true">⚠</span> মাইক্রোফোন: ত্রুটি (Error)
        </span>
      );
    }
    return (
      <span className="mic-badge state-idle" role="status" aria-live="polite">
        <span aria-hidden="true">⚪</span> মাইক্রোফোন: প্রস্তুত (Idle)
      </span>
    );
  };

  return (
    <div className="app-container">
      {/* Header Landmark */}
      <header className="app-header">
        <div className="app-title-group">
          <h1 className="app-title">দৃষ্টি</h1>
          <p className="app-subtitle">
            দৃষ্টিহীন ও স্বল্পদৃষ্টি মানুষের জন্য বাংলা ভয়েস সহচর
          </p>
        </div>
        <div className="header-controls">
          <ActionButton
            icon="📷"
            label="ক্যামেরা ভিউ"
            subLabel="লাইভ প্রিভিউ ও ছবি"
            onClick={() => setIsCameraOpen(true)}
            variant="action"
            ariaLabel="ক্যামেরা প্যানেল খুলুন"
          />
          <ActionButton
            icon="⚙️"
            label="সেটিংস"
            subLabel="অ্যাক্সেসিবিলিটি বিকল্প"
            onClick={() => setIsSettingsOpen(true)}
            variant="secondary"
            ariaLabel="সেটিংস ও অ্যাক্সেসিবিলিটি প্যানেল খুলুন"
          />
          <ActionButton
            icon="👥"
            label="পরিচিত তালিকা"
            subLabel="পরিবার ও কেয়ারগিভার"
            onClick={() => setIsFamilyOpen(true)}
            variant="secondary"
            ariaLabel="পরিবার ও কেয়ারগিভার তালিকা খুলুন"
          />
          <Link
            href="/demo"
            className="action-button variant-secondary"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderColor: "var(--accent-cyan)",
              background: "rgba(56, 189, 248, 0.12)",
            }}
            aria-label="ডেমো মোড ও সম্পূর্ণ সিস্টেম চেকলিস্ট"
          >
            <div className="button-inner">
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
                <span className="button-icon" aria-hidden="true" style={{ fontSize: "1.5rem" }}>⚡</span>
                <div className="button-titles">
                  <span className="button-primary-label" style={{ color: "var(--accent-cyan)" }}>ডেমো মোড</span>
                  <span className="button-sub-label">লাইভ প্রদর্শনী ও চেকলিস্ট</span>
                </div>
              </div>
            </div>
          </Link>
        </div>
      </header>

      {/* Real-time Status Region */}
      <StatusRegion
        message={currentMessage}
        noBengaliVoice={speechState.noBengaliVoice}
      />

      {/* Microphone Status Banner */}
      <aside aria-label="মাইক্রোফোন স্থিতি" className="mic-status-container">
        {renderMicStatusLabel()}
        <span className="mic-browser-note">
          (দ্রষ্টব্য: Chrome ব্রাউজারে ভয়েস রিকগনিশনের জন্য সক্রিয় ইন্টারনেট প্রয়োজন)
        </span>
      </aside>

      {/* Primary Voice and Speech Controls */}
      <nav aria-label="ভয়েস ও স্পিচ নিয়ন্ত্রণ" className="control-bar">
        <ActionButton
          icon="🎙"
          label={micState === "listening" ? "শোনা বন্ধ করুন" : "প্রশ্ন করুন"}
          subLabel="মুখে কথা বলে নির্দেশ দিন"
          onClick={handleVoiceInputClick}
          variant="primary"
          ariaLabel={
            micState === "listening"
              ? "কথা বলা বন্ধ করে ইনপউট সম্পন্ন করুন"
              : "মাইক্রোফোন চালু করে মুখে প্রশ্ন করুন"
          }
        />
        <ActionButton
          icon="⏹"
          label="থামুন"
          subLabel="কথা বলা বন্ধ করুন"
          onClick={handleStopSpeaking}
          variant="danger"
          ariaLabel="কথা বলা বন্ধ করুন"
        />
        <ActionButton
          icon="🔁"
          label="আবার বলুন"
          subLabel="সর্বশেষ বার্তা পুনরাবৃত্তি"
          onClick={handleRepeatLast}
          variant="secondary"
          ariaLabel="সর্বশেষ বার্তা আবার শুনুন"
        />
      </nav>

      {/* Main Action Grid */}
      <section aria-labelledby="main-actions-heading">
        <h2 id="main-actions-heading" className="sr-only">
          প্রধান সুবিধাসমূহ
        </h2>
        <div className="button-grid">
          {/* Understand Surroundings */}
          <ActionButton
            icon="👁️"
            label="চারপাশ বুঝুন"
            subLabel="সামনের পরিবেশ পর্যবেক্ষণ"
            status={toolRegistry.describeSurroundings.status}
            onClick={() => handleExecuteTool("describeSurroundings")}
            variant="action"
          />

          {/* Read Text */}
          <ActionButton
            icon="📖"
            label="লেখা পড়ুন"
            subLabel="কাগজ বা সাইনবোর্ডের লেখা"
            status={toolRegistry.readText.status}
            onClick={() => handleExecuteTool("readText")}
            variant="action"
          />

          {/* Recognize Person (পরিচিত মুখ চেনা) */}
          <ActionButton
            icon="👤"
            label="পরিচিত মুখ"
            subLabel="পরিবার ও কেয়ারগিভার সনাক্ত"
            status={toolRegistry.recognizePerson.status}
            onClick={() => handleExecuteTool("recognizePerson")}
            variant="action"
          />

          {/* Visual Q&A (দৃষ্টি সহকারী - Multimodal Assistant) */}
          <ActionButton
            icon="🤖"
            label="দৃষ্টি সহকারী"
            subLabel="ওষুধ, টাকা ও দৃশ্যপটের প্রশ্নোত্তর"
            status={toolRegistry.askVision.status}
            onClick={() => handleExecuteTool("askVision")}
            variant="action"
          />

          {/* Bangladeshi Currency Reader & Total Counter (টাকা চেনা ও গণনা) */}
          <ActionButton
            icon="💵"
            label="টাকা চেনা"
            subLabel="নোট চেনা ও মোট টাকা গণনা"
            status={toolRegistry.readCurrency.status}
            onClick={() => handleExecuteTool("readCurrency")}
            variant="action"
          />

          {/* Safe-Zone & Geofencing Sentinel (নিরাপদ এলাকা ও সেফ জোন) */}
          <ActionButton
            icon="🛡️"
            label="নিরাপদ এলাকা"
            subLabel="সেফ জোন ও লাইভ ট্র্যাকিং"
            status={toolRegistry.checkSafeZone.status}
            onClick={() => handleExecuteTool("checkSafeZone")}
            variant="action"
          />

          {/* Spatial Audio Echolocation & 3D Obstacle Radar (ইকো রাডার ও ৩ডি সাউন্ড) */}
          <ActionButton
            icon="📡"
            label="ইকো রাডার"
            subLabel="৩ডি সাউন্ড ও বাধা সনাক্ত"
            status={toolRegistry.echolocationRadar.status}
            onClick={() => handleExecuteTool("echolocationRadar")}
            variant="action"
          />

          {/* Safety Test */}
          <ActionButton
            icon="🚨"
            label="নিরাপত্তা পরীক্ষা"
            subLabel="জরুরি অ্যালার্ট ও ফল ডিটেকশন"
            status={toolRegistry.safetyTest.status}
            onClick={() => handleExecuteTool("safetyTest")}
            variant="action"
          />

          {/* Walk With Me (হাঁটার সঙ্গী - Vision + GPS) */}
          <ActionButton
            icon="🚶"
            label="হাঁটার সঙ্গী"
            subLabel="ভিশন + জিপিএস দিকনির্দেশনা"
            status={toolRegistry.walkWithMe.status}
            onClick={() => handleExecuteTool("walkWithMe")}
            variant="action"
          />

          {/* Location */}
          <ActionButton
            icon="📍"
            label="লোকেশন"
            subLabel="বর্তমান জিপিএস অবস্থান"
            status={toolRegistry.getLocation.status}
            onClick={() => handleExecuteTool("getLocation")}
            variant="action"
          />

          {/* Proximity Warning (SIMULATION ONLY) */}
          <ActionButton
            icon="📏"
            label="নিকটবর্তী দূরত্ব"
            subLabel="বাধা পরিমাপ (সিমুলেশন)"
            status={toolRegistry.readProximity.status}
            onClick={() => handleExecuteTool("readProximity")}
            variant="action"
          />
        </div>
      </section>

      {/* Fallback Command Input Form */}
      <section
        aria-labelledby="command-input-label"
        className="command-input-section"
      >
        <form onSubmit={handleFormSubmit}>
          <label
            id="command-input-label"
            htmlFor="command-text-input"
            className="input-label"
          >
            কমান্ড লিখুন (কী-বোর্ড বা ফলব্যাক বিকল্প)
          </label>
          <div className="input-row">
            <input
              ref={textInputRef}
              id="command-text-input"
              type="text"
              value={commandText}
              onChange={(e) => setCommandText(e.target.value)}
              placeholder="যেমন: আমার সামনে কী আছে, পড়ে শোনাও, সেফটি টেস্ট..."
              className="text-input"
              autoComplete="off"
            />
            <button type="submit" className="submit-btn">
              প্রেরণ
            </button>
          </div>
        </form>
      </section>

      {/* Accessibility Settings Modal */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Camera Capture Panel */}
      <CameraPanel
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={handleFrameCaptured}
        initialMode={cameraMode}
      />

      {/* Safety Test & Fall Detection Modal */}
      <SafetyPanel
        isOpen={isSafetyOpen}
        onClose={() => setIsSafetyOpen(false)}
      />

      {/* Proximity Warning Modal (Simulation Only) */}
      <ProximityPanel
        isOpen={isProximityOpen}
        onClose={() => setIsProximityOpen(false)}
      />

      {/* Walk With Me Modal (Vision + GPS + Compass Navigation) */}
      <WalkWithMeModal
        isOpen={isWalkOpen}
        onClose={() => setIsWalkOpen(false)}
      />

      {/* Caregiver & Family Members Modal */}
      <FamilyMembersModal
        isOpen={isFamilyOpen}
        onClose={() => setIsFamilyOpen(false)}
      />

      {/* Bangladeshi Currency Reader & Wallet Modal */}
      <CurrencyModal
        isOpen={isCurrencyOpen}
        onClose={() => setIsCurrencyOpen(false)}
      />

      {/* Caregiver Safe-Zone & Geofencing Modal */}
      <GeofenceModal
        isOpen={isGeofenceOpen}
        onClose={() => setIsGeofenceOpen(false)}
      />

      {/* 3D Spatial Audio Echolocation & Obstacle Radar Modal */}
      <EcholocationRadarModal
        isOpen={isRadarOpen}
        onClose={() => setIsRadarOpen(false)}
      />
    </div>
  );
}
