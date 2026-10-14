"use client";

import React from "react";
import { FeatureStatus } from "@/lib/types";
import { speakTouch } from "@/lib/tools/speech";

interface ActionButtonProps {
  label: string;
  subLabel?: string;
  status?: FeatureStatus;
  onClick: () => void;
  variant?: "primary" | "secondary" | "danger" | "action";
  ariaLabel?: string;
  disabled?: boolean;
  icon?: string;
}

export default function ActionButton({
  label,
  subLabel,
  status,
  onClick,
  variant = "action",
  ariaLabel,
  disabled = false,
  icon,
}: ActionButtonProps) {
  // Status icon + text representation (never relies on color alone)
  const renderStatusBadge = () => {
    if (!status) return null;

    if (status === "LIVE") {
      return (
        <span className="status-badge badge-live" aria-label="স্ট্যাটাস: লাইভ">
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="currentColor"
            className="badge-icon"
          >
            <circle cx="6" cy="6" r="5" />
          </svg>
          <span className="badge-text">LIVE</span>
        </span>
      );
    }

    if (status === "SIMULATED") {
      return (
        <span className="status-badge badge-simulated" aria-label="স্ট্যাটাস: সিমুলেটেড">
          <svg
            aria-hidden="true"
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
            className="badge-icon"
          >
            <path d="M11.5 2a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5-.5zm-7 4a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0v-6a.5.5 0 0 1 .5-.5zm7 4a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2a.5.5 0 0 1 .5-.5z" />
            <circle cx="4.5" cy="4" r="2" />
            <circle cx="11.5" cy="8" r="2" />
          </svg>
          <span className="badge-text">SIMULATED</span>
        </span>
      );
    }

    return (
      <span className="status-badge badge-planned" aria-label="স্ট্যাটাস: পরিকল্পিত">
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="currentColor"
          className="badge-icon"
        >
          <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z" />
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z" />
        </svg>
        <span className="badge-text">PLANNED</span>
      </span>
    );
  };

  const touchPronounceText = subLabel ? `${label}, ${subLabel}` : label;
  const computedAriaLabel =
    ariaLabel || (status ? `${label}, স্ট্যাটাস ${status}` : label);

  return (
    <button
      type="button"
      onClick={onClick}
      onTouchStart={() => speakTouch(touchPronounceText)}
      onMouseEnter={() => speakTouch(touchPronounceText)}
      onFocus={() => speakTouch(touchPronounceText)}
      disabled={disabled}
      className={`action-button variant-${variant}`}
      aria-label={computedAriaLabel}
    >
      <div className="button-inner">
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          {icon && (
            <span
              className="button-icon"
              aria-hidden="true"
              style={{
                fontSize: "1.5rem",
                lineHeight: 1,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {icon}
            </span>
          )}
          <div className="button-titles">
            <span className="button-primary-label">{label}</span>
            {subLabel && <span className="button-sub-label">{subLabel}</span>}
          </div>
        </div>
        {renderStatusBadge()}
      </div>
    </button>
  );
}
