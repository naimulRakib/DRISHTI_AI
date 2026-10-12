"use client";

import React, { useEffect, useState } from "react";
import { setDefaultRate, speak } from "@/lib/tools/speech";
import {
  prepareOfflineAssets,
  checkOfflineReadiness,
  deleteMyData,
  AssetCacheResult,
} from "@/lib/storage/offline";

export type TextSize = "normal" | "large" | "extra-large";

export interface DrishtiSettings {
  speechRate: number;
  textSize: TextSize;
  highContrast: boolean;
}

const SETTINGS_KEY = "drishti.settings.v1";

const DEFAULT_SETTINGS: DrishtiSettings = {
  speechRate: 1.0,
  textSize: "normal",
  highContrast: true,
};

export function loadStoredSettings(): DrishtiSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      speechRate: typeof parsed.speechRate === "number" ? parsed.speechRate : 1.0,
      textSize: ["normal", "large", "extra-large"].includes(parsed.textSize)
        ? parsed.textSize
        : "normal",
      highContrast: typeof parsed.highContrast === "boolean" ? parsed.highContrast : true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveStoredSettings(settings: DrishtiSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage quota / privacy mode errors
  }
}

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsChange?: (settings: DrishtiSettings) => void;
}

export default function SettingsPanel({
  isOpen,
  onClose,
  onSettingsChange,
}: SettingsPanelProps) {
  const [settings, setSettings] = useState<DrishtiSettings>(DEFAULT_SETTINGS);
  const [isOfflineReady, setIsOfflineReady] = useState<boolean>(false);
  const [isPreparing, setIsPreparing] = useState<boolean>(false);
  const [prepareProgress, setPrepareProgress] = useState<string>("");
  const [prepareResults, setPrepareResults] = useState<AssetCacheResult[]>([]);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);

  useEffect(() => {
    const stored = loadStoredSettings();
    setSettings(stored);
    setDefaultRate(stored.speechRate);
    applySettingsToDOM(stored);

    // Check if offline assets already cached
    checkOfflineReadiness().then((ready) => {
      setIsOfflineReady(ready);
    });
  }, []);

  const applySettingsToDOM = (newSettings: DrishtiSettings) => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-text-size", newSettings.textSize);
    if (newSettings.highContrast) {
      document.documentElement.setAttribute("data-high-contrast", "true");
    } else {
      document.documentElement.removeAttribute("data-high-contrast");
    }
  };

  const updateSetting = <K extends keyof DrishtiSettings>(
    key: K,
    value: DrishtiSettings[K]
  ) => {
    const nextSettings = { ...settings, [key]: value };
    setSettings(nextSettings);
    saveStoredSettings(nextSettings);
    applySettingsToDOM(nextSettings);
    if (key === "speechRate") {
      setDefaultRate(value as number);
    }
    onSettingsChange?.(nextSettings);
  };

  const handlePrepareOffline = async () => {
    setIsPreparing(true);
    setPrepareResults([]);
    setPrepareProgress("ডাউনলোড শুরু হচ্ছে...");
    speak("অফলাইন মডেল ও ভাষা ফাইল ক্যাশ করা শুরু হচ্ছে।");

    const report = await prepareOfflineAssets((current, total, itemResult) => {
      setPrepareProgress(`${current}/${total} ফাইল সম্পন্ন`);
      setPrepareResults((prev) => [...prev, itemResult]);
    });

    setIsPreparing(false);
    if (report.overallSuccess) {
      setIsOfflineReady(true);
      const successMsg = "অফলাইন প্রস্তুতি সম্পন্ন হয়েছে। অ্যাপটি ইন্টারনেট ছাড়াই ব্যবহারের জন্য প্রস্তুত।";
      setPrepareProgress(successMsg);
      speak(successMsg);
    } else {
      setIsOfflineReady(false);
      const failed = report.results.filter((r) => !r.success);
      const failedNames = failed.map((f) => f.name).join(", ");
      const failMsg = `কিছু ফাইল ডাউনলোড করা যায়নি (${failedNames})। অ্যাপটি এখনও পুরোপুরি অফলাইন প্রস্তুত নয়।`;
      setPrepareProgress(failMsg);
      speak("কিছু ফাইল ডাউনলোড করা যায়নি। অ্যাপটি এখনও অফলাইন প্রস্তুত নয়।");
    }
  };

  const handleDeleteData = async () => {
    const result = await deleteMyData();
    setDeleteConfirmation(result.messageBn);
    setSettings(DEFAULT_SETTINGS);
    applySettingsToDOM(DEFAULT_SETTINGS);
    setIsOfflineReady(false);
    setPrepareResults([]);
    setPrepareProgress("");
  };

  if (!isOpen) return null;

  return (
    <section
      aria-labelledby="settings-heading"
      className="settings-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="settings-content">
        <div className="settings-header">
          <h2 id="settings-heading">সেটিংস ও অ্যাক্সেসিবিলিটি</h2>
          <button
            type="button"
            onClick={onClose}
            className="settings-close-btn"
            aria-label="সেটিংস বন্ধ করুন"
          >
            ✕ বন্ধ করুন
          </button>
        </div>

        <div className="settings-body">
          {/* Privacy Guarantee Statement */}
          <div className="privacy-notice-box" role="note">
            <strong style={{ color: "var(--accent-cyan)", fontSize: "1rem" }}>
              🔒 গোপনীয়তার নিশ্চয়তা (Privacy Guarantee)
            </strong>
            <p style={{ fontSize: "0.95rem", color: "var(--text-secondary)" }}>
              কোনো ছবি, মুখের তথ্য বা ভৌগোলিক অবস্থান কখনোই ডিভাইসে বা কোনো সার্ভারে সংরক্ষণ করা হয় না। সমস্ত প্রসেসিং ব্রাউজারের তাৎক্ষণিক মেমরিতেই সম্পন্ন হয়।
            </p>
          </div>

          {/* Speech Speed */}
          <div className="setting-group">
            <label htmlFor="speech-rate-input" className="setting-label">
              কথার গতি (স্পিচ স্পিড): <strong>{settings.speechRate.toFixed(1)}x</strong>
            </label>
            <input
              id="speech-rate-input"
              type="range"
              min="0.6"
              max="1.4"
              step="0.1"
              value={settings.speechRate}
              onChange={(e) =>
                updateSetting("speechRate", parseFloat(e.target.value))
              }
              className="range-input"
            />
            <div className="range-hints" aria-hidden="true">
              <span>০.৬x (ধীরে)</span>
              <span>১.০x (স্বাভাবিক)</span>
              <span>১.৪x (দ্রুত)</span>
            </div>
          </div>

          {/* Text Size */}
          <fieldset className="setting-group">
            <legend className="setting-label">টেক্সটের আকার (Text Size)</legend>
            <div className="text-size-options" role="radiogroup">
              {(
                [
                  { value: "normal", label: "সাধারণ" },
                  { value: "large", label: "বড়" },
                  { value: "extra-large", label: "অনেক বড়" },
                ] as const
              ).map((option) => (
                <label key={option.value} className="radio-label">
                  <input
                    type="radio"
                    name="textSize"
                    value={option.value}
                    checked={settings.textSize === option.value}
                    onChange={() => updateSetting("textSize", option.value)}
                    className="radio-input"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* High Contrast Toggle */}
          <div className="setting-group">
            <label htmlFor="high-contrast-checkbox" className="checkbox-label">
              <input
                id="high-contrast-checkbox"
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) => updateSetting("highContrast", e.target.checked)}
                className="checkbox-input"
              />
              <span className="checkbox-text">
                উচ্চ বৈসাদৃশ্য চালু রাখুন (High Contrast Mode)
              </span>
            </label>
          </div>

          {/* Offline Preparation Section (Part 10) */}
          <div className="offline-prepare-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "1.05rem" }}>
                অফলাইন ক্যাশ ও মডেল ডাউনলোড
              </strong>
              {isOfflineReady ? (
                <span className="badge-live">✓ অফলাইন প্রস্তুত (Offline Ready)</span>
              ) : (
                <span style={{ fontSize: "0.85rem", color: "var(--accent-amber)", fontWeight: 700 }}>
                  ক্যাশিং প্রয়োজন
                </span>
              )}
            </div>

            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              ইন্টারনেট সংযোগ থাকাকালীন সমস্ত এআই মডেল এবং ভাষা ফাইল ডিভাইসে সংরক্ষণ করে নিন যাতে ইন্টারনেট ছাড়াই সব সুবিধা ব্যবহার করা যায়।
            </p>

            <button
              id="prepare-offline-btn"
              type="button"
              onClick={handlePrepareOffline}
              disabled={isPreparing}
              className="safety-btn-monitor"
              style={{ width: "100%" }}
            >
              {isPreparing ? "ডাউনলোড ও ক্যাশ হচ্ছে..." : "⚡ অফলাইন প্রস্তুতি নিন (Prepare offline)"}
            </button>

            {prepareProgress && (
              <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--text-secondary)" }}>
                {prepareProgress}
              </p>
            )}

            {prepareResults.length > 0 && (
              <div className="offline-file-list" role="status">
                {prepareResults.map((r, i) => (
                  <div
                    key={`${r.url}-${i}`}
                    className={`offline-file-item ${r.success ? "success" : "failed"}`}
                  >
                    <span>{r.success ? "✓" : "✗"} {r.name}</span>
                    <span>{r.statusText}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Data Deletion Section (Part 10) */}
          <div className="offline-prepare-card" style={{ borderColor: "#ef4444" }}>
            <strong style={{ color: "#fca5a5", fontSize: "1.05rem" }}>
              ডেটা ও স্টোরেজ পরিষ্কার
            </strong>
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)" }}>
              সংরক্ষিত সেটিংস, পরীক্ষামূলক মক যোগাযোগ এবং এই অ্যাপের তৈরি সমস্ত অফলাইন ক্যাশ ফাইল এক চাপে স্থায়ীভাবে মুছে ফেলুন।
            </p>

            <button
              id="delete-my-data-btn"
              type="button"
              onClick={handleDeleteData}
              className="btn-delete-data"
            >
              🗑️ আমার ডেটা মুছুন (Delete my data)
            </button>

            {deleteConfirmation && (
              <p
                role="status"
                style={{
                  fontSize: "0.95rem",
                  color: "#34d399",
                  fontWeight: 700,
                  marginTop: "0.25rem",
                }}
              >
                ✓ {deleteConfirmation}
              </p>
            )}
          </div>
        </div>

        <div className="settings-footer">
          <button
            type="button"
            onClick={onClose}
            className="settings-save-btn"
          >
            সম্পন্ন
          </button>
        </div>
      </div>
    </section>
  );
}
