"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  getWalletBills,
  getWalletTotal,
  clearWallet,
  removeBillFromWallet,
  addBillToWallet,
  DENOMINATION_NAMES_BN,
  formatBengaliNumber,
  ScannedBill,
} from "@/lib/storage/walletStore";
import { readCurrency } from "@/lib/tools/currency";
import { speak } from "@/lib/tools/speech";

interface CurrencyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function CurrencyModal({ isOpen, onClose }: CurrencyModalProps) {
  const [bills, setBills] = useState<ScannedBill[]>(() => getWalletBills());
  const [totalTaka, setTotalTaka] = useState<number>(() => getWalletTotal());
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [statusFeedback, setStatusFeedback] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!isOpen) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      return;
    }

    let active = true;
    speak("টাকা চেনা ও গণনা মোড সক্রিয় হয়েছে। নোটটি ক্যামেরার সামনে ধরুন।");

    if (navigator?.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        })
        .then(async (stream) => {
          if (!active) {
            stream.getTracks().forEach((track) => track.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(() => {});
          }
        })
        .catch(() => {
          if (active) {
            setStatusFeedback("ক্যামেরা চালু করা সম্ভব হয়নি।");
          }
        });
    }

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen]);

  // Listen to background currency detection events
  useEffect(() => {
    const handleDetection = (e: Event) => {
      const customEvent = e as CustomEvent<{
        denomination: number;
        totalTaka: number;
        matchedBy: string;
      }>;
      if (customEvent.detail) {
        setBills(getWalletBills());
        setTotalTaka(customEvent.detail.totalTaka);
        setStatusFeedback(`${customEvent.detail.denomination} টাকার নোট যুক্ত হয়েছে।`);
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("drishti:currency-detected", handleDetection);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("drishti:currency-detected", handleDetection);
      }
    };
  }, []);

  const handleScanNow = async () => {
    setIsScanning(true);
    setStatusFeedback("নোট স্ক্যান করা হচ্ছে...");
    try {
      const videoEl = videoRef.current;
      const res = await readCurrency(videoEl ? { imageSource: videoEl } : {});
      setBills(getWalletBills());
      setTotalTaka(getWalletTotal());
      setStatusFeedback(res.message_bn);
    } catch {
      setStatusFeedback("স্ক্যান করার সময় ত্রুটি ঘটেছে।");
    } finally {
      setIsScanning(false);
    }
  };

  const handleQuickNote = (denom: number) => {
    const result = addBillToWallet(denom);
    setBills(getWalletBills());
    setTotalTaka(result.totalTaka);
    const denomBn = DENOMINATION_NAMES_BN[denom] || `${denom} টাকা`;
    const msg = `চিহ্নিত হয়েছে ${denomBn}র নোট। মোট জমা হয়েছে: ${formatBengaliNumber(result.totalTaka)} টাকা।`;
    setStatusFeedback(msg);
    speak(msg);
  };

  // Auto-scan after camera opens for frictionless demo
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        handleScanNow();
      }
    }, 2200);
    return () => clearTimeout(timer);
  }, [isOpen]);

  const handleSpeakTotal = () => {
    const totalBn = formatBengaliNumber(totalTaka);
    const msg = `আপনার গণনাকৃত মোট টাকার পরিমাণ ${totalBn} টাকা।`;
    setStatusFeedback(msg);
    speak(msg);
  };

  const handleResetWallet = () => {
    clearWallet();
    setBills([]);
    setTotalTaka(0);
    const msg = "টাকার গণনা শূন্য করা হয়েছে।";
    setStatusFeedback(msg);
    speak(msg);
  };

  const handleRemoveBill = (id: string, denomBn: string) => {
    const newTotal = removeBillFromWallet(id);
    setBills(getWalletBills());
    setTotalTaka(newTotal);
    const msg = `${denomBn} তালিকা থেকে বাদ দেওয়া হয়েছে।`;
    setStatusFeedback(msg);
    speak(msg);
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="currency-modal-title"
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
          backgroundColor: "#060913",
          color: "#f8fafc",
          border: "2px solid #10b981",
          borderRadius: "1rem",
          maxWidth: "600px",
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 25px 50px -12px rgba(16, 185, 129, 0.3)",
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
            backgroundColor: "#04151f",
          }}
        >
          <div>
            <h2
              id="currency-modal-title"
              style={{
                fontSize: "1.35rem",
                fontWeight: 700,
                color: "#10b981",
                margin: 0,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              টাকা চেনা ও গণনা (Currency Reader)
            </h2>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#94a3b8" }}>
              বাংলাদেশী ব্যাংক নোট সনাক্ত করুন এবং মোট টাকা একসাথে হিসাব রাখুন
            </p>
          </div>
          <button
            onClick={onClose}
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

        {/* Content Body */}
        <div style={{ padding: "1.25rem 1.5rem", overflowY: "auto", flex: 1 }}>
          {/* Status Feedback banner */}
          {statusFeedback && (
            <div
              role="status"
              aria-live="polite"
              style={{
                padding: "0.75rem 1rem",
                borderRadius: "0.5rem",
                backgroundColor: "rgba(16, 185, 129, 0.15)",
                border: "1px solid #10b981",
                color: "#d1fae5",
                fontSize: "0.95rem",
                fontWeight: 600,
                marginBottom: "1rem",
              }}
            >
              {statusFeedback}
            </div>
          )}

          {/* Large Total Display Box */}
          <div
            style={{
              padding: "1.25rem",
              borderRadius: "0.75rem",
              background: "linear-gradient(135deg, #064e3b 0%, #022c22 100%)",
              border: "2px solid #34d399",
              textAlign: "center",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ fontSize: "0.9rem", color: "#a7f3d0", fontWeight: 600 }}>
              মোট জমার পরিমাণ (Running Total)
            </div>
            <div
              style={{
                fontSize: "2.8rem",
                fontWeight: 900,
                color: "#ffffff",
                letterSpacing: "-0.02em",
                margin: "0.35rem 0",
              }}
            >
              {formatBengaliNumber(totalTaka)} ৳
            </div>
            <div style={{ fontSize: "0.85rem", color: "#6ee7b7" }}>
              মোট স্ক্যানকৃত নোট: {formatBengaliNumber(bills.length)} টি
            </div>
          </div>

          {/* Camera Viewfinder */}
          <div
            style={{
              position: "relative",
              borderRadius: "0.75rem",
              overflow: "hidden",
              border: "1px solid #334155",
              backgroundColor: "#000",
              marginBottom: "1rem",
              height: "200px",
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
            <div
              style={{
                position: "absolute",
                inset: "15%",
                border: "2px dashed #10b981",
                borderRadius: "0.5rem",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{
                  backgroundColor: "rgba(0,0,0,0.6)",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "0.25rem",
                  fontSize: "0.75rem",
                  color: "#a7f3d0",
                }}
              >
                নোটটি এখানে রাখুন
              </span>
            </div>
          </div>

          {/* Quick Banknote Simulator for Demo & Hands-free testing */}
          <div style={{ marginBottom: "1rem" }}>
            <span style={{ fontSize: "0.8rem", color: "#94a3b8", display: "block", marginBottom: "0.4rem" }}>
              নোট সিমুলেশন বাটন (দ্রুত টেস্ট ও ডেমো রেকর্ডিং):
            </span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "0.5rem" }}>
              <button
                type="button"
                onClick={() => handleQuickNote(10)}
                style={{
                  backgroundColor: "#065f46",
                  color: "#a7f3d0",
                  border: "1px solid #10b981",
                  borderRadius: "0.5rem",
                  padding: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ১০ টাকা
              </button>
              <button
                type="button"
                onClick={() => handleQuickNote(20)}
                style={{
                  backgroundColor: "#064e3b",
                  color: "#6ee7b7",
                  border: "1px solid #059669",
                  borderRadius: "0.5rem",
                  padding: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ২০ টাকা
              </button>
              <button
                type="button"
                onClick={() => handleQuickNote(100)}
                style={{
                  backgroundColor: "#1e3a8a",
                  color: "#bfdbfe",
                  border: "1px solid #3b82f6",
                  borderRadius: "0.5rem",
                  padding: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ১০০ টাকা
              </button>
              <button
                type="button"
                onClick={() => handleQuickNote(500)}
                style={{
                  backgroundColor: "#701a75",
                  color: "#fbcfe8",
                  border: "1px solid #ec4899",
                  borderRadius: "0.5rem",
                  padding: "0.5rem",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                ৫০০ টাকা
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
            <button
              onClick={handleScanNow}
              disabled={isScanning}
              style={{
                backgroundColor: isScanning ? "#065f46" : "#10b981",
                color: "#022c22",
                border: "none",
                borderRadius: "0.6rem",
                padding: "0.85rem 1rem",
                fontSize: "1.05rem",
                fontWeight: 800,
                cursor: isScanning ? "wait" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
              }}
            >
              <span>📸</span> {isScanning ? "স্ক্যান হচ্ছে..." : "নোট স্ক্যান করুন"}
            </button>

            <button
              onClick={handleSpeakTotal}
              style={{
                backgroundColor: "#1e293b",
                color: "#f8fafc",
                border: "1px solid #475569",
                borderRadius: "0.6rem",
                padding: "0.85rem 1rem",
                fontSize: "0.95rem",
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.4rem",
              }}
            >
              <span>🔊</span> মোট শুনুন
            </button>
          </div>

          {/* Breakdown List Heading + Reset Button */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.6rem",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "0.95rem", color: "#94a3b8" }}>
              স্ক্যানকৃত নোটের বিবরণ
            </h3>
            {bills.length > 0 && (
              <button
                onClick={handleResetWallet}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "#ef4444",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.25rem",
                }}
              >
                <span>🔄</span> রিসেট
              </button>
            )}
          </div>

          {/* Bills List */}
          {bills.length === 0 ? (
            <div
              style={{
                padding: "1.5rem",
                textAlign: "center",
                color: "#64748b",
                fontSize: "0.9rem",
                border: "1px dashed #1e293b",
                borderRadius: "0.5rem",
              }}
            >
              এখনও কোনো নোট স্ক্যান করা হয়নি। উপরের বাটনে চাপ দিয়ে নোট যোগ করুন।
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {bills.map((item) => (
                <div
                  key={item.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.6rem 0.85rem",
                    backgroundColor: "#0f172a",
                    borderRadius: "0.4rem",
                    border: "1px solid #1e293b",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "1.1rem" }}>৳</span>
                    <strong style={{ fontSize: "0.95rem", color: "#f8fafc" }}>
                      {item.denominationBn}
                    </strong>
                  </div>
                  <button
                    onClick={() => handleRemoveBill(item.id, item.denominationBn)}
                    aria-label={`${item.denominationBn} মুছুন`}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "#94a3b8",
                      cursor: "pointer",
                      fontSize: "0.9rem",
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
