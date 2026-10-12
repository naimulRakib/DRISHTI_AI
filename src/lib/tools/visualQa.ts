/**
 * DRISHTI AI — Multimodal Visual Q&A & Scene Assistant
 * Ported & Enhanced from ANVI's GeminiApiService & LlmChatModelHelper (https://github.com/naimulRakib/ANVI).
 *
 * Allows visually impaired users to ask targeted visual questions in natural Bengali:
 * - "আমার হাতে কী ওষুধ?" (Medicine identification & dosage advisory)
 * - "এই টাকার নোটটি কত টাকার?" (Bangladeshi currency denomination)
 * - "এখানে রাস্তা পার হওয়া নিরাপদ কি না?" (Pedestrian safety inspection)
 * - "সামনের সাইনবোর্ডে কী দিকনির্দেশনা দেওয়া আছে?" (Signboard & navigation details)
 *
 * Features hybrid architecture:
 * 1. Cloud-assisted Gemini Vision when an API key & internet are present.
 * 2. 100% local on-device fallback using MediaPipe Object Detection + Tesseract OCR when offline.
 */

import { ToolResult } from "@/lib/types";
import { speak, speakInChunks, splitTextIntoChunks } from "@/lib/tools/speech";
import { captureFrame, startCamera } from "@/lib/tools/camera";
import { detectObjects } from "@/lib/tools/objects";
import { readTextFromImage } from "@/lib/tools/ocr";

export interface VisualQaContext {
  question?: string;
  imageSource?: ImageData | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
  apiKey?: string;
}

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

/**
 * Sanitizes markdown or special formatting so speech synthesis sounds completely natural.
 */
export function sanitizeSpeechText(rawText: string): string {
  if (!rawText) return "";
  return rawText
    .replace(/[*_#`~[\]]/g, "") // Remove markdown asterisks, hashes, backticks
    .replace(/http\S+/g, "") // Remove raw links
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts a Base64 data URL string from an image source.
 */
export function convertSourceToBase64(
  source: ImageData | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
): string | null {
  if (typeof window === "undefined") return null;

  const canvas = document.createElement("canvas");

  if (source instanceof ImageData) {
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.putImageData(source, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] || null;
  }

  if (source instanceof HTMLImageElement) {
    canvas.width = source.naturalWidth || source.width || 320;
    canvas.height = source.naturalHeight || source.height || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] || null;
  }

  if (source instanceof HTMLVideoElement) {
    canvas.width = source.videoWidth || 320;
    canvas.height = source.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85).split(",")[1] || null;
  }

  if (source instanceof HTMLCanvasElement) {
    return source.toDataURL("image/jpeg", 0.85).split(",")[1] || null;
  }

  return null;
}

/**
 * Intelligently analyzes local OCR & Object detection to answer specific visual questions
 * without requiring any cloud connection.
 */
export function synthesizeLocalBengaliAnswer(
  question: string,
  detectedObjectsBn: string,
  extractedOcrText: string
): string {
  const q = question.toLowerCase();
  const cleanOcr = extractedOcrText.replace("কোনো লেখা সনাক্ত হয়নি", "").trim();
  const hasObjects =
    detectedObjectsBn &&
    !detectedObjectsBn.includes("কিছু চিনতে পারিনি") &&
    !detectedObjectsBn.includes("সমস্যা");

  // 1. Medicine & Prescription Inquiries
  if (q.includes("ওষুধ") || q.includes("ঔষধ") || q.includes("মেডিসিন")) {
    if (cleanOcr) {
      return `ক্যামেরার ফ্রেমে ঔষধের প্যাকেটে লেখা রয়েছে: ${cleanOcr}। ঔষধ সেবনের পূর্বে অনুগ্রহ করে আপনার কেয়ারগিভার বা চিকিৎসকের সাথে নিশ্চিত করুন।`;
    }
    return "সামনে থাকা প্যাকেটের লেখা স্পষ্ট নয়। অনুগ্রহ করে ওষুধের পাতাটি আরও কাছে ও সোজা করে ধরুন।";
  }

  // 2. Bangladeshi Currency Inquiries (টাকা / নোট)
  if (q.includes("টাকা") || q.includes("নোট") || q.includes("কত টাকা")) {
    const currencyMatches = cleanOcr.match(/(১০০০|৫০০|২০০|১০০|৫০|২০|১০|1000|500|200|100|50|20|10)/);
    if (currencyMatches) {
      return `চিহ্নিত হয়েছে ${currencyMatches[0]} টাকার নোট।`;
    }
    if (cleanOcr.includes("বাংলাদেশ ব্যাংক") || cleanOcr.includes("BANGLADESH BANK")) {
      return "এটি একটি বাংলাদেশী ব্যাংক নোট, তবে টাকার নির্দিষ্ট সংখ্যাটি স্পষ্ট করার জন্য নোটটি ক্যামেরার আরেকটু কাছে আনুন।";
    }
    return "নোটের মূল্যমান নিশ্চিত করার জন্য আলোর মধ্যে ক্যামেরার সামনে সোজা করে ধরুন।";
  }

  // 3. Color Inquiries
  if (q.includes("রং") || q.includes("রঙ")) {
    if (hasObjects) {
      return `আপনার সামনে ${detectedObjectsBn} রয়েছে। স্পষ্ট রঙের জন্য পর্যাপ্ত আলো নিশ্চিত করুন।`;
    }
  }

  // 4. Default combined spatial response
  if (hasObjects && cleanOcr) {
    return `আপনার প্রশ্নের প্রেক্ষিতে সামনে ${detectedObjectsBn} দেখতে পাচ্ছি এবং এতে লেখা রয়েছে: ${cleanOcr}।`;
  }

  if (hasObjects) {
    return `আপনার সামনে ${detectedObjectsBn} দেখতে পাচ্ছি।`;
  }

  if (cleanOcr) {
    return `ক্যামেরার ফ্রেমের লেখায় পাওয়া গেছে: ${cleanOcr}।`;
  }

  return "ক্যামেরার ফ্রেমে আপনার প্রশ্নের সুনির্দিষ্ট উত্তর নিশ্চিত করার মতো স্পষ্ট তথ্য পাওয়া যায়নি। অনুগ্রহ করে ক্যামেরাটি আরেকটু কাছে নিয়ে আবার চেষ্টা করুন।";
}

/**
 * Executes Visual Q&A pipeline.
 */
export async function askVisualQuestion(
  ctx?: VisualQaContext
): Promise<ToolResult> {
  const question = ctx?.question?.trim() || "আমার সামনে কী রয়েছে ব্যাখ্যা করো";
  let source = ctx?.imageSource;

  // If no source provided, inspect active video DOM element or start brief camera feed
  if (!source && typeof document !== "undefined") {
    const video = document.querySelector("video");
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      const frame = captureFrame(video);
      source = frame || video;
    }
  }

  // Fallback to temporary camera feed
  if (!source && typeof document !== "undefined") {
    try {
      const tempVideo = document.createElement("video");
      const cam = await startCamera(tempVideo);
      if (cam.success && tempVideo.videoWidth > 0) {
        const frame = captureFrame(tempVideo);
        source = frame || tempVideo;
      }
    } catch {
      // Ignore camera start errors
    }
  }

  if (!source) {
    const errorMsg = "প্রশ্ন করার জন্য ক্যামেরা চালু করা বা ছবি দেওয়া আবশ্যক।";
    speak(errorMsg);
    return {
      tool: "askVision",
      status: "error",
      source: "on-device-model",
      message_bn: errorMsg,
      detail: "No image source available",
      confidence: null,
    };
  }

  // Immediate conversational acknowledgment
  speak("দৃশ্য বিশ্লেষণ করে আপনার প্রশ্নের উত্তর খুঁজছি...");

  // Retrieve API Key from context, localStorage, or environment
  let apiKey = ctx?.apiKey;
  if (!apiKey && typeof window !== "undefined") {
    apiKey =
      localStorage.getItem("drishti.gemini_api_key.v1") ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
      "";
  }

  const base64Data = convertSourceToBase64(source);

  // Attempt Cloud Gemini Multimodal API if API key is present
  if (apiKey && base64Data) {
    try {
      const systemInstruction = `You are DRISHTI AI (দৃষ্টি), a compassionate, highly accurate assistive vision companion for visually impaired people in Bangladesh.
Analyze the provided camera snapshot and answer the user's specific question concisely, truthfully, and clearly in natural Bengali (বাংলা).

Key Guidelines:
- If asked about medicine/drugs: state the medicine name clearly, strength (e.g. 500mg), dosage form, and expiry date if visible. Caution them to confirm with their doctor or caregiver.
- If asked about Bangladeshi currency (টাকা): identify the denomination (১০, ২০, ৫০, ১০০, ২০০, ৫০০, ১০০০ টাকা).
- If asked about signs or directions: explain what the sign says and where it points.
- If asked about obstacles or surroundings: describe positions (বামে, ডানে, মাঝখানে).
- Answer in 1-3 crisp, spoken sentences in polite Bengali. Avoid markdown formatting like asterisks since this will be read aloud by TTS.`;

      const requestBody = {
        contents: [
          {
            role: "user",
            parts: [
              { text: `${systemInstruction}\n\nব্যবহারকারীর প্রশ্ন: ${question}` },
              {
                inlineData: {
                  mimeType: "image/jpeg",
                  data: base64Data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 300,
        },
      };

      const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const data = await response.json();
        const candidateText =
          data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        const cleanAnswer = sanitizeSpeechText(candidateText);

        if (cleanAnswer) {
          if (cleanAnswer.length > 50) {
            speakInChunks(splitTextIntoChunks(cleanAnswer));
          } else {
            speak(cleanAnswer);
          }

          return {
            tool: "askVision",
            status: "success",
            source: "browser-api",
            message_bn: cleanAnswer,
            detail: `Gemini Multimodal Vision response: ${question}`,
            confidence: 0.95,
          };
        }
      }
    } catch {
      // Fallback seamlessly to on-device heuristics
    }
  }

  // 100% On-Device Local Fallback (MediaPipe + Tesseract)
  try {
    const [objectsResult, ocrResult] = await Promise.all([
      detectObjects({ imageSource: source }),
      readTextFromImage({ imageSource: source }),
    ]);

    const localAnswer = synthesizeLocalBengaliAnswer(
      question,
      objectsResult.message_bn,
      ocrResult.message_bn
    );

    if (localAnswer.length > 50) {
      speakInChunks(splitTextIntoChunks(localAnswer));
    } else {
      speak(localAnswer);
    }

    return {
      tool: "askVision",
      status: "success",
      source: "on-device-model",
      message_bn: localAnswer,
      detail: `Local On-Device Vision Synthesis: ${question}`,
      confidence: 0.85,
    };
  } catch {
    const fallbackMsg = "দুঃখিত, দৃশ্যটি বিশ্লেষণ করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।";
    speak(fallbackMsg);
    return {
      tool: "askVision",
      status: "error",
      source: "on-device-model",
      message_bn: fallbackMsg,
      detail: "Visual Q&A execution failure",
      confidence: null,
    };
  }
}
