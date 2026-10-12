/**
 * DRISHTI AI — Smart Cane Live Vision Pipeline
 * Directly integrates Raspberry Pi Smart Cane peripherals from ANVI (https://github.com/naimulRakib/ANVI).
 *
 * Automatically processes camera snapshots triggered by the Smart Cane's hardware button,
 * runs on-device MediaPipe Object Detection and Tesseract.js OCR, and speaks a natural
 * Bengali spatial description directly into the user's ear.
 */

import { describeSurroundings } from "@/lib/tools/objects";
import { readText } from "@/lib/tools/ocr";
import { speak, speakInChunks, splitTextIntoChunks } from "@/lib/tools/speech";
import { CaneImageData } from "@/lib/native/bridge";

export interface CaneVisionResult {
  imageUrl: string;
  objectsDetected: string[];
  recognizedText: string | null;
  spokenSummaryBn: string;
  timestamp: number;
}

/**
 * Loads an image from Base64 data URL, HTTP URL, or local blob into an HTMLImageElement
 */
export async function loadImageElement(sourceUri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Cannot load image in non-browser environment"));
      return;
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image frame from smart cane"));
    img.src = sourceUri;
  });
}

/**
 * Synthesizes a natural, clear Bengali assistive voice announcement from
 * detected objects and recognized text.
 */
export function formatVisionSummaryBengali(
  objectsMessageBn: string,
  ocrMessageBn: string
): string {
  const hasValidObjects =
    objectsMessageBn &&
    !objectsMessageBn.includes("কিছু চিনতে পারিনি") &&
    !objectsMessageBn.includes("সমস্যা") &&
    !objectsMessageBn.includes("পাওয়া যায়নি");

  const hasValidText =
    ocrMessageBn &&
    !ocrMessageBn.includes("কোনো লেখা সনাক্ত হয়নি") &&
    !ocrMessageBn.includes("পাওয়া যায়নি") &&
    !ocrMessageBn.includes("সমস্যা");

  if (hasValidObjects && hasValidText) {
    return `আপনার সামনে ${objectsMessageBn}। এবং দৃশ্যপটে লেখা রয়েছে: ${ocrMessageBn}`;
  }

  if (hasValidObjects) {
    return `আপনার সামনে ${objectsMessageBn} দেখতে পাচ্ছি।`;
  }

  if (hasValidText) {
    return `লেখা সনাক্ত হয়েছে: ${ocrMessageBn}`;
  }

  return "সামনে কোনো স্পষ্ট পরিচিত বস্তু বা পাঠ্য লেখা সনাক্ত করা যায়নি।";
}

/**
 * Main ingestion handler executed whenever the user presses the Smart Cane's
 * camera push-button (GPIO 17).
 */
export async function processCaneFrame(data: CaneImageData): Promise<CaneVisionResult> {
  const imageSource = data.base64 || data.frameUrl || data.imagePath;

  // Initial immediate spoken feedback
  speak("স্মার্ট ক্যান থেকে দৃশ্য ধারণ করা হয়েছে। বিশ্লেষণ করছি...");

  try {
    const img = await loadImageElement(imageSource);

    // Parallel vision processing on the cane frame
    const [objectsResult, ocrResult] = await Promise.all([
      describeSurroundings({ imageSource: img }),
      readText({ imageSource: img }),
    ]);

    const spokenSummaryBn = formatVisionSummaryBengali(
      objectsResult.message_bn,
      ocrResult.message_bn
    );

    // Announce synthesized audio
    if (spokenSummaryBn.length > 50) {
      speakInChunks(splitTextIntoChunks(spokenSummaryBn));
    } else {
      speak(spokenSummaryBn);
    }

    const result: CaneVisionResult = {
      imageUrl: imageSource,
      objectsDetected: objectsResult.detail ? [objectsResult.detail] : [],
      recognizedText: ocrResult.detail || null,
      spokenSummaryBn,
      timestamp: Date.now(),
    };

    // Broadcast result event to UI components
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("drishti:cane-vision-result", { detail: result })
      );
    }

    return result;
  } catch {
    const errorMsg = "স্মার্ট ক্যানের ছবি বিশ্লেষণ করতে সমস্যা হয়েছে।";
    speak(errorMsg);
    return {
      imageUrl: imageSource,
      objectsDetected: [],
      recognizedText: null,
      spokenSummaryBn: errorMsg,
      timestamp: Date.now(),
    };
  }
}
