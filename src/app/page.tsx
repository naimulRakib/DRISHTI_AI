"use client";

import React, { useState, useEffect, FormEvent, useRef } from "react";
import Link from "next/link";
import ActionButton from "@/components/ActionButton";
import StatusRegion from "@/components/StatusRegion";
import SettingsPanel from "@/components/SettingsPanel";
import CameraPanel from "@/components/CameraPanel";
import SafetyPanel from "@/components/SafetyPanel";
import ProximityPanel from "@/components/ProximityPanel";
import WalkWithMeModal from "@/components/WalkWithMeModal";
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
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);
  const [isProximityOpen, setIsProximityOpen] = useState(false);
  const [isWalkOpen, setIsWalkOpen] = useState(false);
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

    if (matchedTool === "describeSurroundings" || matchedTool === "readText") {
      setIsCameraOpen(true);
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

    const tool = toolRegistry[matchedTool];
    if (tool) {
      const result = await tool.run();
      setCurrentMessage(result.message_bn);
      if (
        matchedTool !== "readText" &&
        matchedTool !== "getLocation" &&
        matchedTool !== "readProximity"
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
    if (toolName === "describeSurroundings" || toolName === "readText") {
      setIsCameraOpen(true);
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

    const tool = toolRegistry[toolName];
    if (!tool) return;

    const result = await tool.run();
    setCurrentMessage(result.message_bn);
    if (
      toolName !== "readText" &&
      toolName !== "getLocation" &&
      toolName !== "readProximity"
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
            label="ক্যামেরা ভিউ"
            subLabel="লাইভ প্রিভিউ ও ছবি"
            onClick={() => setIsCameraOpen(true)}
            variant="action"
            ariaLabel="ক্যামেরা প্যানেল খুলুন"
          />
          <ActionButton
            label="সেটিংস"
            subLabel="অ্যাক্সেসিবিলিটি বিকল্প"
            onClick={() => setIsSettingsOpen(true)}
            variant="secondary"
            ariaLabel="সেটিংস ও অ্যাক্সেসিবিলিটি প্যানেল খুলুন"
          />
          <Link
            href="/demo"
            className="action-button variant-secondary"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
            aria-label="ডেমো মোড সিস্টেম চেকলিস্ট"
          >
            <div className="button-inner">
              <div className="button-titles">
                <span className="button-primary-label">ডেমো মোড</span>
                <span className="button-sub-label">সিস্টেম চেকলিস্ট</span>
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
          label="থামুন"
          subLabel="কথা বলা বন্ধ করুন"
          onClick={handleStopSpeaking}
          variant="danger"
          ariaLabel="কথা বলা বন্ধ করুন"
        />
        <ActionButton
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
            label="চারপাশ বুঝুন"
            subLabel="সামনের পরিবেশ পর্যবেক্ষণ"
            status={toolRegistry.describeSurroundings.status}
            onClick={() => handleExecuteTool("describeSurroundings")}
            variant="action"
          />

          {/* Read Text */}
          <ActionButton
            label="লেখা পড়ুন"
            subLabel="কাগজ বা সাইনবোর্ডের লেখা"
            status={toolRegistry.readText.status}
            onClick={() => handleExecuteTool("readText")}
            variant="action"
          />

          {/* Safety Test */}
          <ActionButton
            label="নিরাপত্তা পরীক্ষা"
            subLabel="জরুরি অ্যালার্ট ও ফল ডিটেকশন"
            status={toolRegistry.safetyTest.status}
            onClick={() => handleExecuteTool("safetyTest")}
            variant="action"
          />

          {/* Walk With Me (হাঁটার সঙ্গী - Vision + GPS) */}
          <ActionButton
            label="হাঁটার সঙ্গী"
            subLabel="ভিশন + জিপিএস দিকনির্দেশনা"
            status={toolRegistry.walkWithMe.status}
            onClick={() => handleExecuteTool("walkWithMe")}
            variant="action"
          />

          {/* Location */}
          <ActionButton
            label="লোকেশন"
            subLabel="বর্তমান জিপিএস অবস্থান"
            status={toolRegistry.getLocation.status}
            onClick={() => handleExecuteTool("getLocation")}
            variant="action"
          />

          {/* Proximity Warning (SIMULATION ONLY) */}
          <ActionButton
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
    </div>
  );
}
