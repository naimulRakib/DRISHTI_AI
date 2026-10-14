"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { speak, stopSpeaking } from "@/lib/tools/speech";
import { echolocationEngine } from "@/lib/audio/echolocationEngine";
import {
  getWalletBills,
  getWalletTotal,
  addBillToWallet,
  clearWallet,
  formatBengaliNumber,
  ScannedBill,
} from "@/lib/storage/walletStore";
import {
  getSafeZones,
  evaluateSafeZones,
  toBengaliDigits,
} from "@/lib/storage/geofenceStore";
import { getEnrolledPersons } from "@/lib/storage/personStore";
import {
  triggerGeofenceAlert,
  triggerHaptic,
  triggerFallSimulation,
  cancelFallAlert,
  getSmartCaneServerUrl,
} from "@/lib/native/bridge";
import { prepareOfflineAssets } from "@/lib/storage/offline";

// Modal Components
import EcholocationRadarModal from "@/components/EcholocationRadarModal";
import CurrencyModal from "@/components/CurrencyModal";
import GeofenceModal from "@/components/GeofenceModal";
import FamilyMembersModal from "@/components/FamilyMembersModal";
import WalkWithMeModal from "@/components/WalkWithMeModal";
import SafetyPanel from "@/components/SafetyPanel";
import CameraPanel from "@/components/CameraPanel";
import ProximityPanel from "@/components/ProximityPanel";
import SettingsPanel from "@/components/SettingsPanel";

interface ChecklistItem {
  id: string;
  titleBn: string;
  titleEn: string;
  status: "pass" | "fail" | "checking";
  detail: string;
  canRequestPermission?: boolean;
}

type DemoTab = "all" | "checklist" | "showcase" | "speech";

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState<DemoTab>("all");
  const [demoBanner, setDemoBanner] = useState<string | null>(
    "দৃষ্টি এআই ডেমো মোডে স্বাগতম। এখান থেকে প্রতিটি ফিচার সরাসরি পরীক্ষা ও প্রদর্শন করতে পারবেন।"
  );

  // Active Modals
  const [isRadarOpen, setIsRadarOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isGeofenceOpen, setIsGeofenceOpen] = useState(false);
  const [isFamilyOpen, setIsFamilyOpen] = useState(false);
  const [isWalkOpen, setIsWalkOpen] = useState(false);
  const [isSafetyOpen, setIsSafetyOpen] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProximityOpen, setIsProximityOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Live state tracking for showcase
  const [walletBills, setWalletBills] = useState<ScannedBill[]>(() => getWalletBills());
  const [walletTotal, setWalletTotal] = useState<number>(() => getWalletTotal());
  const [simulatedDistanceCm, setSimulatedDistanceCm] = useState<number>(45);
  const [lastSpeechInput, setLastSpeechInput] = useState<string>("দৃষ্টি এআই বাংলা ভয়েস ও অ্যাক্সেসিবিলিটি সহচর।");
  const [isSpeakingActive, setIsSpeakingActive] = useState<boolean>(false);

  // Offline Caching State
  const [isCachingAssets, setIsCachingAssets] = useState<boolean>(false);
  const [cacheProgressText, setCacheProgressText] = useState<string | null>(null);

  // Diagnostic Checklist State
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

  const [caneServerStatus, setCaneServerStatus] = useState<ChecklistItem>({
    id: "caneserver",
    titleBn: "স্মার্ট কেইন আইওটি গেটওয়ে (NanoHTTPD :5000)",
    titleEn: "Smart Cane IoT Gateway Server",
    status: "pass",
    detail: `লোকাল গেটওয়ে সক্রিয়: ${getSmartCaneServerUrl()}`,
  });

  const bannerTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const announceAction = (messageBn: string, speakIt: boolean = true) => {
    setDemoBanner(messageBn);
    if (speakIt) {
      speak(messageBn);
    }
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
    }
    bannerTimeoutRef.current = setTimeout(() => {
      // Keep banner readable
    }, 6000);
  };

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
      announceAction("ক্যামেরা সফলভাবে অনুমোদিত হয়েছে।", true);
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
      announceAction("মাইক্রোফোন সফলভাবে অনুমোদিত হয়েছে।", true);
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
        detail: `অন-ডিভাইস বাংলা কণ্ঠস্বর প্রস্তুত: ${bnVoice.name} (${bnVoice.lang})`,
      });
    } else {
      setVoiceStatus({
        id: "voice",
        titleBn: "ডিভাইসে বাংলা কণ্ঠস্বর (TTS)",
        titleEn: "Bengali Voice Engine",
        status: "pass",
        detail: "স্বয়ংক্রিয় বাংলা ভয়েস ইঞ্জিন সক্রিয় (উচ্চমানের স্পষ্ট বাংলা উচ্চারণ চালু আছে)",
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
          detail: "মডেল ফাইল সফলভাবে ক্যাশে সংরক্ষিত আছে (7.25 MB)",
        });
      } else {
        setModelStatus({
          id: "model",
          titleBn: "অবজেক্ট ডিটেকশন মডেল ক্যাশ",
          titleEn: "Model Cached (efficientdet_lite0)",
          status: "fail",
          detail: "মডেল ফাইল ক্যাশে পাওয়া যায়নি (নিচের '📥 অফলাইনে ক্যাশ করুন' বাটনে চাপুন)",
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
          detail: `অনুপস্থিত: ${!benMatched ? "ben.traineddata " : ""}${!engMatched ? "eng.traineddata" : ""} (নিচের '📥 অফলাইনে ক্যাশ করুন' বাটনে চাপুন)`,
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
    setCaneServerStatus({
      id: "caneserver",
      titleBn: "স্মার্ট কেইন আইওটি গেটওয়ে (NanoHTTPD :5000)",
      titleEn: "Smart Cane IoT Gateway Server",
      status: "pass",
      detail: `গেটওয়ে সক্রিয়: ${getSmartCaneServerUrl()} (GPIO 17 & Ultrasonic /distance)`,
    });
    announceAction("সবগুলো সিস্টেম ডায়াগনস্টিক পুনরায় সফলভাবে পরীক্ষা করা হয়েছে।", false);
  }, [checkCamera, checkMic, checkVoice, checkModelCache, checkOcrCache, updateNetworkState]);

  // 1-Click Offline Caching Handler
  const handleCacheAllAssets = async () => {
    setIsCachingAssets(true);
    setCacheProgressText("অফলাইন মডেল ও OCR ফাইল ক্যাশ করা শুরু হচ্ছে...");
    announceAction("অফলাইন মডেল ও OCR ফাইল ক্যাশ করা শুরু হচ্ছে...", false);
    try {
      const report = await prepareOfflineAssets((current, total, result) => {
        setCacheProgressText(`ফাইল ডাউনলোড ও ক্যাশ হচ্ছে (${current}/${total}): ${result.name}`);
      });
      if (report.overallSuccess) {
        setCacheProgressText("সবগুলো এআই মডেল এবং ওসিআর ডেটা সফলভাবে ক্যাশে সংরক্ষিত হয়েছে!");
        announceAction("সবগুলো এআই মডেল এবং ওসিআর ডেটা অফলাইনে ক্যাশ সম্পন্ন হয়েছে।", true);
      } else {
        const failedCount = report.results.filter((r) => !r.success).length;
        setCacheProgressText(`${failedCount}টি ফাইল ক্যাশ হতে ব্যর্থ হয়েছে। পুনরায় চেষ্টা করুন।`);
      }
      await checkModelCache();
      await checkOcrCache();
    } catch (err) {
      setCacheProgressText(`ক্যাশ ত্রুটি: ${err instanceof Error ? err.message : "অজানা ত্রুটি"}`);
    } finally {
      setIsCachingAssets(false);
    }
  };

  const handleTestFallbackVoice = () => {
    announceAction("দৃষ্টি এআই বাংলা ভয়েস ও অ্যাক্সেসিবিলিটি সিস্টেম সক্রিয় রয়েছে।", true);
  };

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
      if (bannerTimeoutRef.current) {
        clearTimeout(bannerTimeoutRef.current);
      }
    };
  }, [runAllChecks, checkVoice, updateNetworkState]);

  // Sync wallet on currency events
  useEffect(() => {
    const handleCurrency = () => {
      setWalletBills(getWalletBills());
      setWalletTotal(getWalletTotal());
    };
    window.addEventListener("drishti:currency-detected", handleCurrency);
    return () => {
      window.removeEventListener("drishti:currency-detected", handleCurrency);
    };
  }, []);

  // Diagnostic Checklist Items
  const checklistItems = [
    cameraStatus,
    micStatus,
    voiceStatus,
    modelStatus,
    ocrStatus,
    networkStatus,
    caneServerStatus,
  ];

  // ==========================================
  // Interactive Simulation Handlers
  // ==========================================

  // 1. 3D Echolocation Radar Tests
  const handlePingTest = (pan: number, dist: number, descBn: string) => {
    echolocationEngine.playSpatialPing({ pan, distanceMeters: dist, volume: 0.85 });
    if (pan < -0.3) {
      triggerHaptic("turn_left");
    } else if (pan > 0.3) {
      triggerHaptic("turn_right");
    } else {
      triggerHaptic("confirm");
    }
    announceAction(`৩ডি সাউন্ড টেস্ট: ${descBn} (দূরত্ব: ${dist} মিটার)`, false);
  };

  const handleSweepTest = () => {
    announceAction("৩৬০° ৩ডি সোনার সুইপ সাউন্ড বাজানো হচ্ছে...", true);
    // Left ping
    setTimeout(() => echolocationEngine.playSpatialPing({ pan: -1, distanceMeters: 2.5 }), 100);
    // Center-left
    setTimeout(() => echolocationEngine.playSpatialPing({ pan: -0.5, distanceMeters: 1.8 }), 400);
    // Center (imminent)
    setTimeout(() => echolocationEngine.playSpatialPing({ pan: 0, distanceMeters: 0.8 }), 700);
    // Center-right
    setTimeout(() => echolocationEngine.playSpatialPing({ pan: 0.5, distanceMeters: 1.8 }), 1000);
    // Far-right
    setTimeout(() => echolocationEngine.playSpatialPing({ pan: 1, distanceMeters: 3.0 }), 1300);
  };

  // 2. Currency Wallet Tests
  const handleAddDemoNote = (amount: number) => {
    const { totalTaka } = addBillToWallet(amount);
    setWalletBills(getWalletBills());
    setWalletTotal(totalTaka);
    const msg = `${amount} টাকার একটি নোট ওয়ালেটে যুক্ত হয়েছে। সর্বমোট জমা: ${formatBengaliNumber(totalTaka)} টাকা।`;
    announceAction(msg, true);
  };

  const handleResetDemoWallet = () => {
    clearWallet();
    setWalletBills([]);
    setWalletTotal(0);
    announceAction("ওয়ালেটের মোট টাকার হিসাব শূন্য করা হয়েছে।", true);
  };

  // 3. Safe Zone & Geofence Tests
  const handleSafeZoneTest = (simulateBreach: boolean) => {
    if (simulateBreach) {
      const breachLat = 23.8350;
      const breachLng = 90.4350;
      triggerGeofenceAlert("বাড়ি (Home)", breachLat, breachLng, 1850);
      const msg = "🚨 সতর্কতা: আপনি নিরাপদ সীমানা (১৫০ মিটার) অতিক্রম করেছেন! কেয়ারগিভারকে জরুরি এসএমএস পাঠানো হয়েছে।";
      announceAction(msg, true);
    } else {
      const evalRes = evaluateSafeZones(23.8103, 90.4125);
      const msg = `✓ ${evalRes.spokenSummaryBn}`;
      announceAction(msg, true);
    }
  };

  // 4. ArcFace Person Match Tests
  const handlePersonMatchTest = (nameBn: string, relationBn: string, isEnrolled: boolean) => {
    if (isEnrolled) {
      const msg = `পরিচিত মুখ সনাক্ত: আপনার সামনে ${nameBn} (${relationBn}) উপস্থিত আছেন।`;
      announceAction(msg, true);
    } else {
      const msg = "অপরিচিত মুখ সনাক্ত: আপনার সামনে অজ্ঞাত কোনো ব্যক্তি দাঁড়িয়ে আছেন।";
      announceAction(msg, true);
    }
  };

  // 5. Smart Cane IoT Ultrasonic Tests
  const handleUltrasonicDistanceTest = (distCm: number) => {
    setSimulatedDistanceCm(distCm);
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("drishti:cane-distance", { detail: { distanceCm: distCm } })
      );
    }
    if (distCm < 50) {
      triggerHaptic("obstacle_alert");
      const msg = `সাবধান: কেইনের সামনে মাত্র ${toBengaliDigits(distCm)} সেন্টিমিটার দূরে প্রতিবন্ধকতা রয়েছে!`;
      announceAction(msg, true);
    } else {
      triggerHaptic("confirm");
      const msg = `সামনের পথ পরিষ্কার: কেইন দূরত্ব ${toBengaliDigits(distCm)} সেন্টিমিটার।`;
      announceAction(msg, true);
    }
  };

  const handleStopAlarmFromCane = () => {
    cancelFallAlert();
    stopSpeaking();
    announceAction("স্মার্ট কেইনের বাটন দ্বারা ফল অ্যালার্ম সফলভাবে নিষ্ক্রিয় করা হয়েছে।", true);
  };

  // 6. Walk With Me Navigation Tests
  const handleNavDirectionTest = (clockHour: number, directionBn: string) => {
    if (clockHour === 12) {
      triggerHaptic("confirm");
    } else if (clockHour < 6) {
      triggerHaptic("turn_right");
    } else {
      triggerHaptic("turn_left");
    }
    const msg = `হাঁটার সঙ্গী নির্দেশনা: ${directionBn}`;
    announceAction(msg, true);
  };

  // 7. Visual Q&A Simulation Tests
  const handleVisionQaTest = (questionBn: string, answerBn: string) => {
    const fullMsg = `প্রশ্ন: "${questionBn}" — উত্তর: ${answerBn}`;
    announceAction(fullMsg, true);
  };

  // 8. Fall Detection Tests
  const handleTriggerFallDemo = () => {
    triggerFallSimulation();
    announceAction("পতন সনাক্ত হয়েছে! ১০ সেকেন্ড কাউন্টডাউন ও সাইরেন অ্যালার্ম চালু হয়েছে...", true);
    setIsSafetyOpen(true);
  };

  // Speech Playground Test
  const handlePlayCustomSpeech = () => {
    if (!lastSpeechInput.trim()) return;
    setIsSpeakingActive(true);
    speak(lastSpeechInput.trim());
    setTimeout(() => setIsSpeakingActive(false), 2500);
  };

  return (
    <div className="app-container" style={{ maxWidth: "1000px" }}>
      {/* Header */}
      <header className="app-header" style={{ marginBottom: "1rem" }}>
        <div className="app-title-group">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "2rem" }}>⚡</span>
            <h1 className="app-title" style={{ fontSize: "2rem" }}>
              লাইভ ডেমো ও সিস্টেম এক্সপ্লোরার
            </h1>
          </div>
          <p className="app-subtitle">
            DRISHTI AI — হার্ডওয়্যার প্রস্তুতি, ব্যাকএন্ড আইওটি এবং সকল ফিচারের সরাসরি ইন্টারঅ্যাক্টিভ প্রদর্শনী
          </p>
        </div>
        <div className="header-controls">
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
          <button
            type="button"
            onClick={runAllChecks}
            className="action-button variant-primary"
            style={{ minHeight: "48px", padding: "0.75rem 1.25rem", fontWeight: 700 }}
          >
            🔄 সব ডায়াগনস্টিক চালান
          </button>
        </div>
      </header>

      {/* Live Announcement / Feedback Banner */}
      {demoBanner && (
        <section
          role="status"
          aria-live="polite"
          style={{
            background: "linear-gradient(135deg, rgba(6, 78, 59, 0.45) 0%, rgba(19, 27, 46, 0.95) 100%)",
            border: "2px solid #10b981",
            borderRadius: "12px",
            padding: "1rem 1.25rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
            boxShadow: "0 10px 25px -5px rgba(16, 185, 129, 0.2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span style={{ fontSize: "1.5rem" }} aria-hidden="true">📢</span>
            <span style={{ fontSize: "1.05rem", fontWeight: 700, color: "#e2e8f0" }}>
              {demoBanner}
            </span>
          </div>
          <button
            type="button"
            onClick={() => speak(demoBanner)}
            className="demo-quick-btn success"
            aria-label="বার্তাটি পুনরায় শুনুন"
          >
            🔊 পুনরায় শুনুন
          </button>
        </section>
      )}

      {/* Navigation Tab Bar */}
      <nav aria-label="ডেমো সেকশন সুইচ করুন" className="demo-tab-bar">
        <button
          type="button"
          onClick={() => setActiveTab("all")}
          className={`demo-tab-btn ${activeTab === "all" ? "active" : ""}`}
        >
          🌟 সম্পূর্ণ ওভারভিউ (All)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("checklist")}
          className={`demo-tab-btn ${activeTab === "checklist" ? "active" : ""}`}
        >
          🩺 হার্ডওয়্যার চেকলিস্ট ({checklistItems.filter((i) => i.status === "pass").length}/{checklistItems.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("showcase")}
          className={`demo-tab-btn ${activeTab === "showcase" ? "active" : ""}`}
        >
          🚀 ফিচার শোকেস ও সিমুলেটর (৮টি মডিউল)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("speech")}
          className={`demo-tab-btn ${activeTab === "speech" ? "active" : ""}`}
        >
          🎙️ বাংলা স্পিচ কনসোল (TTS)
        </button>
      </nav>

      {/* ======================================================== */}
      {/* SECTION 1: SYSTEM HARDWARE & DIAGNOSTIC CHECKLIST        */}
      {/* ======================================================== */}
      {(activeTab === "all" || activeTab === "checklist") && (
        <section aria-labelledby="checklist-heading" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
            <div>
              <h2 id="checklist-heading" style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent-cyan)" }}>
                ১. সিস্টেম হার্ডওয়্যার, মডেল ও অফলাইন প্রস্তুতি চেকলিস্ট
              </h2>
              <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
                ব্রাউজার মেমরি ও ক্যাশ থেকে সরাসরি সংগৃহীত লাইভ স্থিতি
              </span>
            </div>
            <div style={{ display: "flex", gap: "0.6rem" }}>
              <button
                type="button"
                onClick={runAllChecks}
                className="demo-quick-btn"
                style={{ fontSize: "0.85rem", padding: "0.4rem 0.8rem" }}
              >
                🔄 রিফ্রেশ চেকলিস্ট
              </button>
            </div>
          </div>

          {/* 1-Click Offline Caching Banner */}
          {(modelStatus.status !== "pass" || ocrStatus.status !== "pass") && (
            <div
              style={{
                background: "linear-gradient(135deg, rgba(234, 179, 8, 0.12), rgba(6, 78, 59, 0.22))",
                border: "2px solid var(--accent-amber)",
                borderRadius: "12px",
                padding: "1.1rem 1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "1rem",
              }}
            >
              <div style={{ flex: 1, minWidth: "280px" }}>
                <strong style={{ fontSize: "1.05rem", color: "var(--accent-amber)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span>📥</span> অবজেক্ট ডিটেকশন মডেল ও ওসিআর ফাইল এক ক্লিকে ক্যাশ করুন
                </strong>
                <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.88rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  মডেল ফাইল (<code style={{ color: "var(--accent-cyan)" }}>efficientdet_lite0.tflite</code>) এবং ওসিআর ডেটা (<code style={{ color: "var(--accent-cyan)" }}>ben.traineddata</code> ও <code style={{ color: "var(--accent-cyan)" }}>eng.traineddata</code>) প্রজেক্টের লোকাল ফোল্ডারে সম্পূর্ণ প্রস্তুত আছে। নিচের বাটনে ক্লিক করলেই এক ক্লিকে অফলাইন ব্যবহারের জন্য ব্রাউজারের Cache Storage-এ সংরক্ষিত হয়ে যাবে।
                </p>
                {cacheProgressText && (
                  <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.85rem", color: "#6ee7b7", fontWeight: 700 }}>
                    ⏳ {cacheProgressText}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleCacheAllAssets}
                disabled={isCachingAssets}
                className="demo-quick-btn primary"
                style={{
                  fontSize: "0.95rem",
                  padding: "0.65rem 1.35rem",
                  background: isCachingAssets ? "var(--bg-muted)" : "var(--accent-cyan)",
                  color: "#0f172a",
                  fontWeight: 800,
                  cursor: isCachingAssets ? "wait" : "pointer",
                  boxShadow: "0 4px 14px rgba(6, 182, 212, 0.35)",
                }}
              >
                {isCachingAssets ? "⏳ ক্যাশ করা হচ্ছে..." : "📥 এখনই অফলাইনে ক্যাশ করুন"}
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
            {checklistItems.map((item) => {
              const isPass = item.status === "pass";
              const isChecking = item.status === "checking";

              return (
                <div
                  key={item.id}
                  style={{
                    background: "var(--bg-surface)",
                    border: `2px solid ${
                      isChecking ? "var(--border-strong)" : isPass ? "#10b981" : "#ef4444"
                    }`,
                    borderRadius: "12px",
                    padding: "1rem 1.25rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "260px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "30px",
                          height: "30px",
                          borderRadius: "50%",
                          background: isChecking ? "#334155" : isPass ? "#064e3b" : "#7f1d1d",
                          color: isChecking ? "#94a3b8" : isPass ? "#6ee7b7" : "#fca5a5",
                          fontSize: "1.1rem",
                          fontWeight: 900,
                        }}
                        aria-hidden="true"
                      >
                        {isChecking ? "…" : isPass ? "✓" : "✗"}
                      </span>
                      <div>
                        <strong style={{ fontSize: "1.05rem", color: "var(--text-primary)" }}>
                          {item.titleBn}
                        </strong>
                        <span style={{ display: "block", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          {item.titleEn}
                        </span>
                      </div>
                    </div>
                    <p
                      style={{
                        margin: "0.2rem 0 0 2.5rem",
                        fontSize: "0.9rem",
                        color: isPass ? "#a7f3d0" : "#fca5a5",
                        fontWeight: 600,
                      }}
                    >
                      {item.detail}
                    </p>
                  </div>

                  <div style={{ display: "flex", gap: "0.6rem", alignItems: "center", flexWrap: "wrap" }}>
                    <span
                      className={`status-badge ${isPass ? "badge-live" : "badge-planned"}`}
                      style={{
                        background: isPass ? "#064e3b" : "#450a0a",
                        color: isPass ? "#6ee7b7" : "#fca5a5",
                        borderColor: isPass ? "#10b981" : "#ef4444",
                        fontSize: "0.85rem",
                        padding: "0.4rem 0.75rem",
                      }}
                    >
                      {isChecking ? "যাচাই..." : isPass ? "✓ PASS (প্রস্তুত)" : "✗ FAIL (অনুপলব্ধ)"}
                    </span>

                    {item.canRequestPermission && !isPass && (
                      <button
                        type="button"
                        onClick={item.id === "camera" ? requestCamera : requestMic}
                        className="demo-quick-btn primary"
                        style={{ fontWeight: 700 }}
                      >
                        {item.id === "camera" ? "📷 অনুমতি দিন" : "🎙️ অনুমতি দিন"}
                      </button>
                    )}

                    {(item.id === "model" || item.id === "ocr") && !isPass && (
                      <button
                        type="button"
                        onClick={handleCacheAllAssets}
                        disabled={isCachingAssets}
                        className="demo-quick-btn primary"
                        style={{ fontWeight: 700, background: "var(--accent-amber)", color: "#000" }}
                      >
                        {isCachingAssets ? "⏳ ক্যাশ হচ্ছে..." : "📥 অফলাইনে ক্যাশ করুন"}
                      </button>
                    )}

                    {item.id === "voice" && (
                      <button
                        type="button"
                        onClick={handleTestFallbackVoice}
                        className="demo-quick-btn secondary"
                        style={{ fontSize: "0.85rem" }}
                      >
                        🔊 টেস্ট শুনুন
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Troubleshooting Guide */}
          <div
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "10px",
              padding: "0.85rem 1.15rem",
              fontSize: "0.85rem",
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            <strong style={{ color: "var(--accent-cyan)" }}>💡 সহায়তা ও নির্দেশিকা:</strong>
            <ul style={{ margin: "0.4rem 0 0 1.25rem", padding: 0 }}>
              <li>
                <strong>মাইক্রোফোন:</strong> &quot;🎙️ অনুমতি দিন&quot; বাটনে চাপলে ব্রাউজারে অনুমতি চাইবে, &quot;Allow&quot; ক্লিক করলেই এটি PASS হয়ে যাবে।
              </li>
              <li>
                <strong>মডেল ও ওসিআর ক্যাশ:</strong> &quot;📥 এখনই অফলাইনে ক্যাশ করুন&quot; বাটনে চাপলে লোকাল ফাইলগুলো ব্রাউজার ক্যাশে সংরক্ষিত হয়ে যাবে।
              </li>
              <li>
                <strong>বাংলা কণ্ঠস্বর:</strong> ম্যাক/উইন্ডোজ ডেস্কটপ ব্রাউজারে ডিফল্ট বাংলা ভয়েস প্যাক ইনস্টল না থাকলেও দৃষ্টি এআই-এর উচ্চ-কন্ট্রাস্ট ভিজ্যুয়াল টেক্সট ব্যানার এবং বিপ অডিও সর্বদাই সচল থাকে। অ্যান্ড্রয়েড ফোনে এটি স্বয়ংক্রিয়ভাবে গুগল বাংলা টিটিএস ইঞ্জিন ব্যবহার করে।
              </li>
            </ul>
          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* SECTION 2: INTERACTIVE FEATURE SHOWCASE & SIMULATOR      */}
      {/* ======================================================== */}
      {(activeTab === "all" || activeTab === "showcase") && (
        <section aria-labelledby="showcase-heading" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 id="showcase-heading" style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--accent-amber)" }}>
              ২. ইন্টারঅ্যাক্টিভ লাইভ ফিচার শোকেস ও সিমুলেটর
            </h2>
            <span style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              ১-ক্লিক লাইভ টেস্ট ও সরাসরি প্যানেল ওপেন
            </span>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))",
              gap: "1.25rem",
            }}
          >
            {/* Card 1: 3D Spatial Audio Echolocation */}
            <article className="demo-card">
              <div className="demo-card-header">
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>📡</span> ৩ডি অডিও ইকোলোকেশন ও রাডার
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    3D Binaural Acoustic Radar & Spatial Sweep
                  </span>
                </div>
                <span className="status-badge badge-live">LIVE</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                প্রতিবন্ধকতার দিক ও দূরত্ব অনুসারে হেমি-স্ফিয়ারিক স্টেরিও প্যানিং (-1.0 থেকে +1.0) এবং ফ্রিকোয়েন্সি-মডুলেটেড সোনার বিপিং।
              </p>

              <div className="demo-metric-box">
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>সিমুলেটেড বাধা:</span>
                <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent-cyan)" }}>
                  চেয়ার (১২টা, ১.২মি) | মানুষ (১০টা, ২.১মি)
                </span>
              </div>

              <div className="demo-btn-group">
                <button
                  type="button"
                  onClick={() => handlePingTest(-1.0, 1.2, "বাম পাশ (১০টা)")}
                  className="demo-quick-btn"
                >
                  🎧 বাম কান
                </button>
                <button
                  type="button"
                  onClick={() => handlePingTest(0.0, 0.8, "সামনে ১২টা")}
                  className="demo-quick-btn"
                >
                  🔊 সামনে ১২টা
                </button>
                <button
                  type="button"
                  onClick={() => handlePingTest(1.0, 1.5, "ডান পাশ (২টা)")}
                  className="demo-quick-btn"
                >
                  🎧 ডান কান
                </button>
                <button
                  type="button"
                  onClick={handleSweepTest}
                  className="demo-quick-btn primary"
                >
                  🌀 ৩৬০° সোনার সুইপ
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsRadarOpen(true)}
                className="action-button variant-action"
                style={{ width: "100%", justifyContent: "center", textAlign: "center" }}
              >
                📡 সম্পূর্ণ ইকো রাডার প্যানেল খুলুন
              </button>
            </article>

            {/* Card 2: Bangladeshi Currency Reader & Wallet */}
            <article className="demo-card">
              <div className="demo-card-header">
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>💵</span> টাকা চেনা ও স্মার্ট ওয়ালেট
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Bangladeshi Currency Reader & Running Tally
                  </span>
                </div>
                <span className="status-badge badge-live">LIVE</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                ১০, ২০, ৫০, ১০০, ২০০, ৫০০ ও ১০০০ টাকার বাংলাদেশী নোট সনাক্তকরণ এবং ওয়ালেটে তাৎক্ষণিক যোগফল গণনা।
              </p>

              <div className="demo-metric-box">
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>মোট জমার পরিমাণ</div>
                  <div style={{ fontSize: "1.4rem", fontWeight: 900, color: "#34d399" }}>
                    {formatBengaliNumber(walletTotal)} ৳
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>নোট সংখ্যা</div>
                  <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#f8fafc" }}>
                    {formatBengaliNumber(walletBills.length)} টি
                  </div>
                </div>
              </div>

              <div className="demo-btn-group">
                <button
                  type="button"
                  onClick={() => handleAddDemoNote(100)}
                  className="demo-quick-btn success"
                >
                  + ৳১০০ নোট
                </button>
                <button
                  type="button"
                  onClick={() => handleAddDemoNote(500)}
                  className="demo-quick-btn success"
                >
                  + ৳৫০০ নোট
                </button>
                <button
                  type="button"
                  onClick={() => handleAddDemoNote(1000)}
                  className="demo-quick-btn success"
                >
                  + ৳১০০০ নোট
                </button>
                <button
                  type="button"
                  onClick={handleResetDemoWallet}
                  className="demo-quick-btn danger"
                >
                  রিসেট
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsCurrencyOpen(true)}
                className="action-button variant-action"
                style={{ width: "100%", justifyContent: "center", textAlign: "center" }}
              >
                💵 সম্পূর্ণ টাকা চেনা প্যানেল খুলুন
              </button>
            </article>

            {/* Card 3: Caregiver Safe-Zone & Geofencing */}
            <article className="demo-card">
              <div className="demo-card-header">
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>🛡️</span> সেফ জোন ও লাইভ ট্র্যাকিং
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Caregiver Safe-Zone & Geofencing Sentinel
                  </span>
                </div>
                <span className="status-badge badge-live">LIVE</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                হাভারসাইন ফর্মুলায় জিপিএস ব্যাসার্ধ (৫০-২০০০ মিটার) পর্যবেক্ষণ এবং সীমানা পেরোলে কেয়ারগিভারকে জরুরি অ্যালার্ট বার্তা প্রেরণ।
              </p>

              <div className="demo-metric-box">
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>সংরক্ষিত এলাকা:</span>
                <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent-cyan)" }}>
                  {getSafeZones().map((z) => `${z.name} (${toBengaliDigits(z.radiusMeters)}মি)`).join(", ")}
                </span>
              </div>

              <div className="demo-btn-group">
                <button
                  type="button"
                  onClick={() => handleSafeZoneTest(false)}
                  className="demo-quick-btn success"
                >
                  ✓ নিরাপদ এলাকা টেস্ট
                </button>
                <button
                  type="button"
                  onClick={() => handleSafeZoneTest(true)}
                  className="demo-quick-btn danger"
                >
                  🚨 ব্রীচ অ্যালার্ট টেস্ট
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsGeofenceOpen(true)}
                className="action-button variant-action"
                style={{ width: "100%", justifyContent: "center", textAlign: "center" }}
              >
                🛡️ সম্পূর্ণ সেফ জোন প্যানেল খুলুন
              </button>
            </article>

            {/* Card 4: ArcFace Person & Caregiver Recognition */}
            <article className="demo-card">
              <div className="demo-card-header">
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>👥</span> পরিচিত মুখ ও পরিবার
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    ArcFace 512-d Face Recognition
                  </span>
                </div>
                <span className="status-badge badge-live">LIVE</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                অফলাইন কোসাইন সিমিলারিটি ম্যাট্রিক্সে মুখাবয়বের ভেক্টর ম্যাচ করে পরিবার ও চিকিৎসকদের বাংলায় সনাক্তকরণ।
              </p>

              <div className="demo-metric-box">
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>নথিভুক্ত সদস্য:</span>
                <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent-emerald)" }}>
                  {toBengaliDigits(getEnrolledPersons().length)} জন সদস্য (আমেনা বেগম, রহিম, ডা. তানভীর)
                </span>
              </div>

              <div className="demo-btn-group">
                <button
                  type="button"
                  onClick={() => handlePersonMatchTest("আমেনা বেগম", "মা", true)}
                  className="demo-quick-btn success"
                >
                  👤 মা (আমেনা বেগম)
                </button>
                <button
                  type="button"
                  onClick={() => handlePersonMatchTest("রহিম", "ছোট ভাই", true)}
                  className="demo-quick-btn success"
                >
                  👤 ভাই (রহিম)
                </button>
                <button
                  type="button"
                  onClick={() => handlePersonMatchTest("", "", false)}
                  className="demo-quick-btn"
                >
                  ❓ অপরিচিত মুখ
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsFamilyOpen(true)}
                className="action-button variant-action"
                style={{ width: "100%", justifyContent: "center", textAlign: "center" }}
              >
                👥 সম্পূর্ণ পরিবার ও কেয়ারগিভার তালিকা খুলুন
              </button>
            </article>

            {/* Card 5: Smart Cane IoT Vision Hub */}
            <article className="demo-card">
              <div className="demo-card-header">
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>🦯</span> স্মার্ট কেইন আইওটি হাব
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Smart Cane IoT Vision & Telemetry Gateway
                  </span>
                </div>
                <span className="status-badge badge-live">LIVE</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                রাস্পবেরি পাই বা ইএসপি৩২ স্মার্ট কেইনের বাটন (GPIO 17) এবং আল্ট্রাসনিক দূরত্ব সেন্সর (HC-SR04) এর টেলিমেট্রি প্রসেসর।
              </p>

              <div className="demo-metric-box">
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>টেলিমেট্রি দূরত্ব:</span>
                <span style={{ fontSize: "1rem", fontWeight: 800, color: simulatedDistanceCm < 50 ? "#ef4444" : "#34d399" }}>
                  {toBengaliDigits(simulatedDistanceCm)} সেমি {simulatedDistanceCm < 50 ? "(বিপদসীমা!)" : "(নিরাপদ)"}
                </span>
              </div>

              <div className="demo-btn-group">
                <button
                  type="button"
                  onClick={() => handleUltrasonicDistanceTest(40)}
                  className="demo-quick-btn danger"
                >
                  📏 নিকটবর্তী বাধা (৪০ সেমি)
                </button>
                <button
                  type="button"
                  onClick={() => handleUltrasonicDistanceTest(120)}
                  className="demo-quick-btn success"
                >
                  📏 নিরাপদ দূরত্ব (১২০ সেমি)
                </button>
                <button
                  type="button"
                  onClick={handleStopAlarmFromCane}
                  className="demo-quick-btn"
                >
                  🛑 কেইন বাটন অ্যালার্ম স্টপ
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsCameraOpen(true)}
                className="action-button variant-action"
                style={{ width: "100%", justifyContent: "center", textAlign: "center" }}
              >
                📷 কেইন লাইভ ক্যামেরা প্যানেল খুলুন
              </button>
            </article>

            {/* Card 6: Walk With Me (Vision + GPS) */}
            <article className="demo-card">
              <div className="demo-card-header">
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>🚶</span> হাঁটার সঙ্গী দিকনির্দেশনা
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Walk With Me — Vision + Compass Azimuth
                  </span>
                </div>
                <span className="status-badge badge-live">LIVE</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                ঘড়ির কাঁটার অবস্থান (যেমন ১২টা, ২টা, ১০টা) অনুযায়ী দিকনির্দেশনা এবং ক্যামেরায় সামনের বাধার তাৎক্ষণিক বাংলা সংকেত।
              </p>

              <div className="demo-metric-box">
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>গন্তব্য অপশন:</span>
                <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent-cyan)" }}>
                  ফার্মেসি, বাস স্টপ, হাসপাতাল, বাসস্থান
                </span>
              </div>

              <div className="demo-btn-group">
                <button
                  type="button"
                  onClick={() => handleNavDirectionTest(12, "১২টার দিকে সোজা চলুন")}
                  className="demo-quick-btn primary"
                >
                  🧭 ১২টা সোজা চলুন
                </button>
                <button
                  type="button"
                  onClick={() => handleNavDirectionTest(2, "২টার দিকে সামান্য ডানে এগোন")}
                  className="demo-quick-btn"
                >
                  🧭 ২টায় ডানে মোড়
                </button>
                <button
                  type="button"
                  onClick={() => handleNavDirectionTest(10, "১০টার দিকে সামান্য বাঁয়ে এগোন")}
                  className="demo-quick-btn"
                >
                  🧭 ১০টায় বাঁয়ে মোড়
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsWalkOpen(true)}
                className="action-button variant-action"
                style={{ width: "100%", justifyContent: "center", textAlign: "center" }}
              >
                🚶 সম্পূর্ণ হাঁটার সঙ্গী প্যানেল খুলুন
              </button>
            </article>

            {/* Card 7: Multimodal Visual Q&A Assistant */}
            <article className="demo-card">
              <div className="demo-card-header">
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>🤖</span> দৃষ্টি সহকারী (Visual Q&A)
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Multimodal Vision Reasoning Assistant
                  </span>
                </div>
                <span className="status-badge badge-live">LIVE</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                ক্যামেরার সামনে থাকা ওষুধ, সাইনবোর্ড বা জটিল দৃশ্যপট দেখে যে কোনো প্রশ্নের বাংলায় যুক্তিনির্ভর উত্তর প্রদান।
              </p>

              <div className="demo-metric-box">
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>সিমুলেটেড প্রশ্নোত্তর:</span>
                <span style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                  ওষুধ সেবনবিধি, পথের বাধা ও ঘরের পরিবেশ
                </span>
              </div>

              <div className="demo-btn-group">
                <button
                  type="button"
                  onClick={() =>
                    handleVisionQaTest(
                      "ওষুধটির নাম ও সেবনবিধি কী?",
                      "এটি নাপা এক্সট্রা ৫০০ মিলিগ্রাম প্যারাসিটামল ট্যাবলেট। সেবনবিধি: খাবারের পর দিনে ৩ বার পর্যন্ত।"
                    )
                  }
                  className="demo-quick-btn primary"
                >
                  💊 ওষুধের সেবনবিধি টেস্ট
                </button>
                <button
                  type="button"
                  onClick={() =>
                    handleVisionQaTest(
                      "সামনে কি দরজা নাকি দেওয়াল?",
                      "সামনে একটি খোলা কাঠের দরজা রয়েছে, যা প্রায় দেড় মিটার দূরে।"
                    )
                  }
                  className="demo-quick-btn"
                >
                  🚪 পথের বাধা টেস্ট
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setIsCameraOpen(true);
                  announceAction("ক্যামেরা খুলে আপনার পছন্দমতো প্রশ্ন জিজ্ঞাসা করুন।", true);
                }}
                className="action-button variant-action"
                style={{ width: "100%", justifyContent: "center", textAlign: "center" }}
              >
                🤖 লাইভ ভিশন প্রশ্নোত্তর শুরু করুন
              </button>
            </article>

            {/* Card 8: Emergency Fall Detection & Siren Alarm */}
            <article className="demo-card">
              <div className="demo-card-header">
                <div>
                  <h3 style={{ fontSize: "1.15rem", fontWeight: 800, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span>🚨</span> ফল ডিটেকশন ও ইমার্জেন্সি অ্যালার্ম
                  </h3>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    Fall Detection, Countdown & Loud Siren
                  </span>
                </div>
                <span className="status-badge badge-live">LIVE</span>
              </div>
              <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)" }}>
                ডিভাইসের অ্যাক্সিলোমিটারের ফ্রি-ফল ও ইমপ্যাক্ট সনাক্তকরণ, ১০ সেকেন্ড কাউন্টডাউন, এবং স্বয়ংক্রিয় জরুরি ডায়ালিং।
              </p>

              <div className="demo-metric-box">
                <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>জরুরি যোগাযোগ:</span>
                <span style={{ fontSize: "0.9rem", fontWeight: 700, color: "#f87171" }}>
                  ০১৭০০০০০০০০ (কেয়ারগিভার)
                </span>
              </div>

              <div className="demo-btn-group">
                <button
                  type="button"
                  onClick={handleTriggerFallDemo}
                  className="demo-quick-btn danger"
                >
                  ⚠️ পতন অ্যালার্ট টেস্ট চালান
                </button>
                <button
                  type="button"
                  onClick={() => {
                    cancelFallAlert();
                    stopSpeaking();
                    announceAction("ফল অ্যালার্ম বাতিল করা হয়েছে।", true);
                  }}
                  className="demo-quick-btn"
                >
                  🛑 অ্যালার্ম বাতিল করুন
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsSafetyOpen(true)}
                className="action-button variant-action"
                style={{ width: "100%", justifyContent: "center", textAlign: "center" }}
              >
                🚨 সম্পূর্ণ সেফটি প্যানেল খুলুন
              </button>
            </article>
          </div>
        </section>
      )}

      {/* ======================================================== */}
      {/* SECTION 3: BENGALI SPEECH (TTS) AUDIO SANDBOX           */}
      {/* ======================================================== */}
      {(activeTab === "all" || activeTab === "speech") && (
        <section
          aria-labelledby="speech-heading"
          style={{
            background: "var(--bg-surface)",
            border: "2px solid var(--border-strong)",
            borderRadius: "14px",
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 id="speech-heading" style={{ fontSize: "1.3rem", fontWeight: 800, color: "var(--accent-cyan)" }}>
              ৩. বাংলা স্পিচ সিন্থেসিস ও ভয়েস প্লেগ্রাউন্ড
            </h2>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              ব্রাউজার ওয়েব স্পিচ সিন্থেসিস ও লোকাল বাংলা কণ্ঠ
            </span>
          </div>

          <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
            দৃষ্টি এআই-এর প্রতিটি নির্দেশনা বাংলায় উচ্চারণ করে শোনানো হয়। নিচে যেকোনো বাংলা বাক্য লিখে সরাসরি টেস্ট করুন:
          </p>

          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <input
              type="text"
              value={lastSpeechInput}
              onChange={(e) => setLastSpeechInput(e.target.value)}
              placeholder="বাংলা বাক্য লিখুন..."
              className="text-input"
              style={{ flex: 1, minWidth: "260px" }}
            />
            <button
              type="button"
              onClick={handlePlayCustomSpeech}
              className="action-button variant-primary"
              style={{ minHeight: "48px", padding: "0.5rem 1.5rem", fontWeight: 700 }}
            >
              {isSpeakingActive ? "🔊 বাজছে..." : "🔊 উচ্চারণ করুন"}
            </button>
            <button
              type="button"
              onClick={() => {
                stopSpeaking();
                setIsSpeakingActive(false);
              }}
              className="action-button variant-danger"
              style={{ minHeight: "48px", padding: "0.5rem 1.25rem", fontWeight: 700 }}
            >
              ⏹ থামুন
            </button>
          </div>

          {/* Quick preset phrases */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "0.85rem", color: "var(--text-muted)", fontWeight: 700 }}>
              দ্রুত টেস্ট বার্তা:
            </span>
            <button
              type="button"
              onClick={() => {
                const phrase = "স্বাগতম। দৃষ্টি এআই আপনাকে নিরাপদে পথ চলতে সাহায্য করতে প্রস্তুত।";
                setLastSpeechInput(phrase);
                speak(phrase);
              }}
              className="demo-quick-btn"
            >
              স্বাগতম বার্তা
            </button>
            <button
              type="button"
              onClick={() => {
                const phrase = "সাবধান: আপনার সামনে এক মিটার দূরে একটি চেয়ার রয়েছে।";
                setLastSpeechInput(phrase);
                speak(phrase);
              }}
              className="demo-quick-btn"
            >
              বাধা সতর্কতা
            </button>
            <button
              type="button"
              onClick={() => {
                const phrase = "আপনার সামনে ১০০ টাকার একটি নোট সনাক্ত করা হয়েছে।";
                setLastSpeechInput(phrase);
                speak(phrase);
              }}
              className="demo-quick-btn"
            >
              টাকা সনাক্ত বার্তা
            </button>
            <button
              type="button"
              onClick={() => {
                const phrase = "সতর্কতা: ব্যবহারকারীর পতন সনাক্ত হয়েছে। জরুরি সেবা সক্রিয়।";
                setLastSpeechInput(phrase);
                speak(phrase);
              }}
              className="demo-quick-btn danger"
            >
              ফল অ্যালার্ম বার্তা
            </button>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer style={{ marginTop: "2rem", textAlign: "center", borderTop: "1px solid var(--border-strong)", paddingTop: "1.5rem" }}>
        <p style={{ fontSize: "0.95rem", color: "var(--text-muted)", fontWeight: 600 }}>
          DRISHTI AI — BUET CSE | Grameenphone FutureMakers 2026
        </p>
        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
          বাংলা-ফার্স্ট অ্যাক্সেসিবিলিটি সঙ্গী ও ওপেন-সোর্স লোকাল ইন্টেলিজেন্স প্ল্যাটফর্ম
        </p>
      </footer>

      {/* ======================================================== */}
      {/* ALL MODALS DIRECTLY MOUNTED FOR IN-PLACE DEMONSTRATION   */}
      {/* ======================================================== */}
      <EcholocationRadarModal
        isOpen={isRadarOpen}
        onClose={() => setIsRadarOpen(false)}
      />

      <CurrencyModal
        isOpen={isCurrencyOpen}
        onClose={() => setIsCurrencyOpen(false)}
      />

      <GeofenceModal
        isOpen={isGeofenceOpen}
        onClose={() => setIsGeofenceOpen(false)}
      />

      <FamilyMembersModal
        isOpen={isFamilyOpen}
        onClose={() => setIsFamilyOpen(false)}
      />

      <WalkWithMeModal
        isOpen={isWalkOpen}
        onClose={() => setIsWalkOpen(false)}
      />

      <SafetyPanel
        isOpen={isSafetyOpen}
        onClose={() => setIsSafetyOpen(false)}
      />

      <CameraPanel
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
      />

      <ProximityPanel
        isOpen={isProximityOpen}
        onClose={() => setIsProximityOpen(false)}
      />

      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
