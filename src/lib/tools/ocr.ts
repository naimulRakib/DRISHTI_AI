/**
 * DRISHTI AI — OCR with Tesseract.js
 * Local-First, On-Device Multilingual (Bengali + English) Text Recognition
 */

import { createWorker, Worker } from "tesseract.js";
import { ToolResult } from "@/lib/types";
import { speak, speakInChunks, splitTextIntoChunks } from "@/lib/tools/speech";
import { captureFrame } from "@/lib/tools/camera";

let ocrWorkerInstance: Worker | null = null;
let isInitializingWorker = false;

/**
 * Lazy-loads the Tesseract.js worker with languages "ben+eng".
 * Uses local asset paths in /public for complete offline / airplane-mode operation.
 * Option names verified against tesseract.js v7.0.0 (WorkerOptions):
 *   - workerPath: "/tesseract/worker.min.js" (VERIFIED)
 *   - corePath: "/tesseract" (VERIFIED)
 *   - langPath: "/tessdata" (VERIFIED)
 *   - gzip: false (VERIFIED - required for uncompressed .traineddata files)
 */
export async function getOrInitOCRWorker(): Promise<Worker> {
  if (ocrWorkerInstance) {
    return ocrWorkerInstance;
  }

  if (isInitializingWorker) {
    while (isInitializingWorker) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (ocrWorkerInstance) return ocrWorkerInstance;
  }

  isInitializingWorker = true;
  speak("টেক্সট রিকগনিশন মডেল লোড হচ্ছে");

  try {
    const worker = await createWorker("ben+eng", 1, {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract",
      langPath: "/tessdata",
      gzip: false,
    });

    ocrWorkerInstance = worker;
    isInitializingWorker = false;
    return worker;
  } catch (err) {
    isInitializingWorker = false;
    throw err;
  }
}

export interface ReadTextContext {
  imageSource?: ImageData | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
}

/**
 * Calculate average word confidence from Tesseract Page data.
 * Returns null if the library does not return word confidence scores.
 */
export function calculateAverageWordConfidence(data: {
  blocks?: Array<{
    paragraphs?: Array<{
      lines?: Array<{
        words?: Array<{ confidence?: number }>;
      }>;
    }>;
  }> | null;
  confidence?: number;
}): number | null {
  const wordScores: number[] = [];

  if (data.blocks && Array.isArray(data.blocks)) {
    for (const block of data.blocks) {
      if (block.paragraphs && Array.isArray(block.paragraphs)) {
        for (const para of block.paragraphs) {
          if (para.lines && Array.isArray(para.lines)) {
            for (const line of para.lines) {
              if (line.words && Array.isArray(line.words)) {
                for (const word of line.words) {
                  if (
                    typeof word.confidence === "number" &&
                    !isNaN(word.confidence) &&
                    word.confidence >= 0
                  ) {
                    wordScores.push(word.confidence);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  if (wordScores.length > 0) {
    const sum = wordScores.reduce((acc, score) => acc + score, 0);
    return Math.round((sum / wordScores.length) * 10) / 10;
  }

  if (typeof data.confidence === "number" && !isNaN(data.confidence) && data.confidence > 0) {
    return Math.round(data.confidence * 10) / 10;
  }

  return null;
}

/**
 * Main OCR flow:
 * 1. Capture/obtain a frame from camera preview or context.
 * 2. Run on-device recognition with "ben+eng".
 * 3. Trim text.
 * 4. If fewer than 3 characters found: say "কোনো লেখা পড়তে পারিনি, ক্যামেরা আরও কাছে নিন".
 * 5. Otherwise speak text in chunks of at most 300 characters, with stop button working between chunks.
 * 6. Show text on screen with disclaimer that OCR can make mistakes.
 * 7. Confidence uses average word confidence if returned; never claims reading is correct.
 */
export async function readTextFromImage(ctx?: ReadTextContext): Promise<ToolResult> {
  let imageSource = ctx?.imageSource;

  // If no frame is passed directly, capture from the active <video> element
  if (!imageSource && typeof document !== "undefined") {
    const video = document.querySelector("video");
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      const frame = captureFrame(video);
      if (frame) {
        imageSource = frame;
      } else {
        imageSource = video;
      }
    }
  }

  if (!imageSource) {
    const msg = "ক্যামেরা প্রিভিউ পাওয়া যায়নি। অনুগ্রহ করে প্রথমে ক্যামেরা চালু করুন।";
    speak(msg);
    return {
      tool: "readText",
      status: "unavailable",
      source: "on-device-ocr",
      message_bn: msg,
      confidence: null,
    };
  }

  let worker: Worker;
  try {
    worker = await getOrInitOCRWorker();
  } catch (initErr) {
    const msg = "টেক্সট রিকগনিশন ইঞ্জিন প্রস্তুত করতে সমস্যা হয়েছে।";
    speak(msg);
    return {
      tool: "readText",
      status: "error",
      source: "on-device-ocr",
      message_bn: msg,
      detail: initErr instanceof Error ? initErr.message : "Failed to initialize OCR worker",
      confidence: null,
    };
  }

  try {
    let inputForOCR: HTMLCanvasElement | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
    if (typeof ImageData !== "undefined" && imageSource instanceof ImageData) {
      const canvas = document.createElement("canvas");
      canvas.width = imageSource.width;
      canvas.height = imageSource.height;
      const ctx2d = canvas.getContext("2d");
      if (ctx2d) {
        ctx2d.putImageData(imageSource, 0, 0);
      }
      inputForOCR = canvas;
    } else {
      inputForOCR = imageSource as HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
    }

    const ret = await worker.recognize(inputForOCR);
    const data = ret.data;
    const rawText = data?.text || "";
    const trimmedText = rawText.trim();

    // Check if fewer than 3 characters were found
    if (trimmedText.length < 3) {
      const noTextMsg = "কোনো লেখা পড়তে পারিনি, ক্যামেরা আরও কাছে নিন";
      speak(noTextMsg);
      return {
        tool: "readText",
        status: "success",
        source: "on-device-ocr",
        message_bn: noTextMsg,
        confidence: null,
      };
    }

    // Average word confidence if returned; otherwise null
    const confidence = calculateAverageWordConfidence(data);

    // Disclaimer statement: OCR can make mistakes
    const disclaimer = "অপটিক্যাল ক্যারেক্টার রিকগনিশনে কিছু ভুল থাকতে পারে";
    const screenMessage = `চিহ্নিত লেখা (${disclaimer}):\n${trimmedText}`;

    // Speak in chunks of at most 300 characters, prefixed by the disclaimer announcement
    const chunks = splitTextIntoChunks(trimmedText, 300);
    const spokenChunks = [
      "চিহ্নিত লেখা পড়া হচ্ছে। এতে কিছু ভুল থাকতে পারে।",
      ...chunks,
    ];

    // Read aloud in chunks with stop button functioning between/during chunks
    speakInChunks(spokenChunks);

    return {
      tool: "readText",
      status: "success",
      source: "on-device-ocr",
      message_bn: screenMessage,
      detail: trimmedText,
      confidence,
    };
  } catch (ocrErr) {
    const errorMsg = "লেখা পড়ার সময় ত্রুটি ঘটেছে।";
    speak(errorMsg);
    return {
      tool: "readText",
      status: "error",
      source: "on-device-ocr",
      message_bn: errorMsg,
      detail: ocrErr instanceof Error ? ocrErr.message : "OCR recognition error",
      confidence: null,
    };
  }
}

export { readTextFromImage as readText };
