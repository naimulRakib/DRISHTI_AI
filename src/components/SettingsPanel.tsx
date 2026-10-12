"use client";

import React, { useEffect, useState } from "react";
import { setDefaultRate } from "@/lib/tools/speech";

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

  useEffect(() => {
    const stored = loadStoredSettings();
    setSettings(stored);
    setDefaultRate(stored.speechRate);
    applySettingsToDOM(stored);
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
