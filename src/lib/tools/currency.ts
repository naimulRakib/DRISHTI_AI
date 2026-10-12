/**
 * DRISHTI AI — Bangladeshi Currency Reader & Counter
 * Identifies paper banknotes (10, 20, 50, 100, 200, 500, 1000 Taka) and maintains running tally.
 * Designed specifically for visually impaired individuals in Bangladesh.
 */

import { ToolResult } from "@/lib/types";
import { speak } from "@/lib/tools/speech";
import { captureFrame, startCamera } from "@/lib/tools/camera";
import { readTextFromImage } from "@/lib/tools/ocr";
import { triggerHaptic } from "@/lib/native/bridge";
import {
  addBillToWallet,
  formatBengaliNumber,
  DENOMINATION_NAMES_BN,
} from "@/lib/storage/walletStore";

export interface CurrencyContext {
  imageSource?: ImageData | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
  autoAddToTotal?: boolean;
}

export interface BanknoteDetection {
  denomination: number;
  denominationBn: string;
  confidence: number;
  matchedBy: "numeral" | "color" | "hybrid";
}

/**
 * Calculates dominant RGB chromatic balance in the image.
 */
export function calculateDominantRgb(imageData: ImageData): { r: number; g: number; b: number } {
  const { data } = imageData;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  // Sample every 8th pixel
  const step = 8 * 4;
  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Ignore near-black background
    if (r + g + b > 60) {
      totalR += r;
      totalG += g;
      totalB += b;
      count++;
    }
  }

  if (count === 0) return { r: 128, g: 128, b: 128 };
  return {
    r: Math.round(totalR / count),
    g: Math.round(totalG / count),
    b: Math.round(totalB / count),
  };
}

/**
 * Evaluates both textual numerals and color signatures to identify Bangladeshi banknotes.
 */
export function detectBanknoteFromTextAndColor(
  ocrText: string,
  rgb?: { r: number; g: number; b: number }
): BanknoteDetection | null {
  const text = (ocrText || "").toLowerCase();

  // 1. Textual & Numeral Pattern Matching (High priority)
  // Check 1000 Taka first to avoid substring collision with 100 or 10
  if (
    text.includes("১০০০") ||
    text.includes("1000") ||
    text.includes("এক হাজার") ||
    text.includes("one thousand")
  ) {
    return {
      denomination: 1000,
      denominationBn: DENOMINATION_NAMES_BN[1000],
      confidence: 0.95,
      matchedBy: "numeral",
    };
  }

  if (
    text.includes("৫০০") ||
    text.includes("500") ||
    text.includes("পাঁচশত") ||
    text.includes("পাঁচশ") ||
    text.includes("five hundred")
  ) {
    return {
      denomination: 500,
      denominationBn: DENOMINATION_NAMES_BN[500],
      confidence: 0.95,
      matchedBy: "numeral",
    };
  }

  if (
    text.includes("২০০") ||
    text.includes("200") ||
    text.includes("দুইশত") ||
    text.includes("দুইশ") ||
    text.includes("two hundred")
  ) {
    return {
      denomination: 200,
      denominationBn: DENOMINATION_NAMES_BN[200],
      confidence: 0.95,
      matchedBy: "numeral",
    };
  }

  if (
    text.includes("১০০") ||
    text.includes("100") ||
    text.includes("একশত") ||
    text.includes("একশ") ||
    text.includes("one hundred")
  ) {
    return {
      denomination: 100,
      denominationBn: DENOMINATION_NAMES_BN[100],
      confidence: 0.93,
      matchedBy: "numeral",
    };
  }

  if (
    text.includes("৫০") ||
    text.includes("50") ||
    text.includes("পঞ্চাশ") ||
    text.includes("fifty")
  ) {
    return {
      denomination: 50,
      denominationBn: DENOMINATION_NAMES_BN[50],
      confidence: 0.92,
      matchedBy: "numeral",
    };
  }

  if (
    text.includes("২০") ||
    text.includes("20") ||
    text.includes("বিশ") ||
    text.includes("কুড়ি") ||
    text.includes("twenty")
  ) {
    return {
      denomination: 20,
      denominationBn: DENOMINATION_NAMES_BN[20],
      confidence: 0.92,
      matchedBy: "numeral",
    };
  }

  if (
    text.includes("১০") ||
    text.includes("10") ||
    text.includes("দশ") ||
    text.includes("ten")
  ) {
    return {
      denomination: 10,
      denominationBn: DENOMINATION_NAMES_BN[10],
      confidence: 0.91,
      matchedBy: "numeral",
    };
  }

  // 2. Color Profile Fallback if "বাংলাদেশ ব্যাংক" or "টাকা" watermark was detected
  const isBanknoteContext =
    text.includes("বাংলাদেশ") ||
    text.includes("ব্যাংক") ||
    text.includes("টাকা") ||
    text.includes("bank") ||
    text.includes("taka");

  if (rgb && isBanknoteContext) {
    const { r, g, b } = rgb;

    // 100 Taka (Distinct Blue)
    if (b > r * 1.25 && b > g) {
      return {
        denomination: 100,
        denominationBn: DENOMINATION_NAMES_BN[100],
        confidence: 0.78,
        matchedBy: "color",
      };
    }

    // 200 Taka (Distinct Bright Yellow / Ochre)
    if (r > 140 && g > 130 && b < 100) {
      return {
        denomination: 200,
        denominationBn: DENOMINATION_NAMES_BN[200],
        confidence: 0.76,
        matchedBy: "color",
      };
    }

    // 20 Taka (Distinct Emerald Green)
    if (g > r * 1.2 && g > b * 1.2) {
      return {
        denomination: 20,
        denominationBn: DENOMINATION_NAMES_BN[20],
        confidence: 0.77,
        matchedBy: "color",
      };
    }

    // 1000 Taka (Ruby Red / Magenta / Purple)
    if (r > 130 && b > 110 && g < 100) {
      return {
        denomination: 1000,
        denominationBn: DENOMINATION_NAMES_BN[1000],
        confidence: 0.75,
        matchedBy: "color",
      };
    }
  }

  return null;
}

/**
 * Converts source to ImageData buffer.
 */
function getImageDataFromSource(
  source: ImageData | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): ImageData | null {
  if (typeof window === "undefined") return null;
  if (source instanceof ImageData) return source;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  if (source instanceof HTMLImageElement) {
    canvas.width = source.naturalWidth || source.width || 320;
    canvas.height = source.naturalHeight || source.height || 240;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  if (source instanceof HTMLVideoElement) {
    canvas.width = source.videoWidth || 320;
    canvas.height = source.videoHeight || 240;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }

  if (source instanceof HTMLCanvasElement) {
    return ctx.getImageData(0, 0, source.width, source.height);
  }

  return null;
}

/**
 * Main Currency Reader Tool.
 */
export async function readCurrency(ctx?: CurrencyContext): Promise<ToolResult> {
  let source = ctx?.imageSource;

  // If no source provided, inspect active video DOM element or start brief camera feed
  if (!source && typeof document !== "undefined") {
    const video = document.querySelector("video");
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      const frame = captureFrame(video);
      source = frame || video;
    }
  }

  // Fallback camera startup
  if (!source && typeof document !== "undefined") {
    try {
      const tempVideo = document.createElement("video");
      const cam = await startCamera(tempVideo);
      if (cam.success && tempVideo.videoWidth > 0) {
        const frame = captureFrame(tempVideo);
        source = frame || tempVideo;
      }
    } catch {
      // Ignore
    }
  }

  if (!source) {
    const errorMsg = "টাকা চেনার জন্য ক্যামেরা চালু করুন বা নোটটি ক্যামেরার সামনে ধরুন।";
    speak(errorMsg);
    return {
      tool: "readCurrency",
      status: "error",
      source: "on-device-model",
      message_bn: errorMsg,
      detail: "No camera or image source available",
      confidence: null,
    };
  }

  speak("টাকার নোট স্ক্যান করা হচ্ছে...");

  try {
    const ocrResult = await readTextFromImage({ imageSource: source });
    const ocrText = ocrResult.detail || ocrResult.message_bn || "";

    const imgData = getImageDataFromSource(source);
    const rgb = imgData ? calculateDominantRgb(imgData) : undefined;

    const detection = detectBanknoteFromTextAndColor(ocrText, rgb);

    if (detection) {
      triggerHaptic("confirm");

      let spokenMessage: string;
      let totalTaka = detection.denomination;

      if (ctx?.autoAddToTotal !== false) {
        const result = addBillToWallet(detection.denomination);
        totalTaka = result.totalTaka;
        const totalBn = formatBengaliNumber(totalTaka);
        spokenMessage = `${detection.denominationBn}র নোট। মোট জমা হয়েছে: ${totalBn} টাকা।`;
      } else {
        spokenMessage = `${detection.denominationBn}র নোট সনাক্ত হয়েছে।`;
      }

      speak(spokenMessage);

      // Dispatch event to update CurrencyModal UI in real time
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("drishti:currency-detected", {
            detail: {
              denomination: detection.denomination,
              totalTaka,
              matchedBy: detection.matchedBy,
            },
          })
        );
      }

      return {
        tool: "readCurrency",
        status: "success",
        source: "on-device-ocr",
        message_bn: spokenMessage,
        detail: `Detected: ${detection.denomination} BDT (${detection.matchedBy})`,
        confidence: detection.confidence,
      };
    }

    const notFoundMsg = "কোনো স্পষ্ট টাকার নোট সনাক্ত করা যায়নি। অনুগ্রহ করে নোটটি আলোর সামনে সোজা করে ধরুন।";
    speak(notFoundMsg);

    return {
      tool: "readCurrency",
      status: "success",
      source: "on-device-ocr",
      message_bn: notFoundMsg,
      detail: "No recognizable Bangladeshi banknote numeral or color signature",
      confidence: 0.4,
    };
  } catch {
    const errorMsg = "টাকা স্ক্যান করার সময় ত্রুটি ঘটেছে।";
    speak(errorMsg);
    return {
      tool: "readCurrency",
      status: "error",
      source: "on-device-ocr",
      message_bn: errorMsg,
      detail: "Currency recognition error",
      confidence: null,
    };
  }
}
