/**
 * DRISHTI AI — MediaPipe Object Detection
 * Local-First, On-Device EfficientDet-Lite0 Detector
 */

import { FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";
import { ToolResult } from "@/lib/types";
import { speak } from "@/lib/tools/speech";
import { captureFrame, startCamera } from "@/lib/tools/camera";

const COCO_BENGALI_MAP: Record<string, string> = {
  person: "মানুষ",
  chair: "চেয়ার",
  bottle: "বোতল",
  cup: "কাপ",
  laptop: "ল্যাপটপ",
  "cell phone": "মোবাইল ফোন",
  book: "বই",
  bed: "বিছানা",
  couch: "সোফা",
  "dining table": "খাবার টেবিল",
  tv: "টেলিভিশন",
  backpack: "ব্যাগ",
  umbrella: "ছাতা",
  bicycle: "সাইকেল",
  car: "গাড়ি",
  bus: "বাস",
  motorcycle: "মোটরসাইকেল",
  dog: "কুকুর",
  cat: "বিড়াল",
  clock: "ঘড়ি",
  keyboard: "কিবোর্ড",
  mouse: "মাউস",
  scissors: "কাঁচি",
};

let detectorInstance: ObjectDetector | null = null;
let isInitializing = false;

/**
 * Lazy loads MediaPipe ObjectDetector on device.
 * Tries GPU delegate first, falls back to CPU.
 */
export async function getOrInitDetector(): Promise<ObjectDetector> {
  if (detectorInstance) {
    return detectorInstance;
  }

  if (isInitializing) {
    // Wait for in-progress initialization
    while (isInitializing) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (detectorInstance) return detectorInstance;
  }

  isInitializing = true;
  speak("মডেল লোড হচ্ছে");

  try {
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");

    let detector: ObjectDetector;
    try {
      // Try GPU delegate first
      detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/models/efficientdet_lite0.tflite",
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        scoreThreshold: 0.5,
        maxResults: 5,
      });
    } catch {
      // Fallback to CPU delegate
      detector = await ObjectDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "/models/efficientdet_lite0.tflite",
          delegate: "CPU",
        },
        runningMode: "IMAGE",
        scoreThreshold: 0.5,
        maxResults: 5,
      });
    }

    detectorInstance = detector;
    isInitializing = false;
    return detector;
  } catch (err) {
    isInitializing = false;
    throw err;
  }
}

export interface ObjectDetectionContext {
  imageSource?: ImageData | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;
}

/**
 * Translates and describes detected objects with horizontal positioning (Left / Centre / Right).
 * Does not make any distance or safety claims.
 */
export async function detectObjects(
  ctx?: ObjectDetectionContext
): Promise<ToolResult> {
  let detector: ObjectDetector;

  try {
    detector = await getOrInitDetector();
  } catch {
    return {
      tool: "describeSurroundings",
      status: "error",
      source: "on-device-model",
      message_bn: "বস্তু সনাক্তকরণ মডেল লোড করতে সমস্যা হয়েছে।",
      detail: "Failed to initialize MediaPipe ObjectDetector",
      confidence: null,
    };
  }

  // Obtain image source from context, active video element, or capture frame
  let imageSource = ctx?.imageSource;
  let imageWidth = 640;

  if (!imageSource && typeof document !== "undefined") {
    const video = document.querySelector("video");
    if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      const frame = captureFrame(video);
      if (frame) {
        imageSource = frame;
        imageWidth = frame.width;
      } else {
        imageSource = video;
        imageWidth = video.videoWidth;
      }
    }
  }

  // If no camera feed is running, attempt to start one or request user to turn on camera
  if (!imageSource && typeof document !== "undefined") {
    // Check if an offscreen video can be started briefly
    try {
      const tempVideo = document.createElement("video");
      const cam = await startCamera(tempVideo);
      if (cam.success && tempVideo.videoWidth > 0) {
        const frame = captureFrame(tempVideo);
        if (frame) {
          imageSource = frame;
          imageWidth = frame.width;
        }
      }
    } catch {
      // Ignore
    }
  }

  if (!imageSource) {
    return {
      tool: "describeSurroundings",
      status: "unavailable",
      source: "on-device-model",
      message_bn: "ক্যামেরা প্রিভিউ পাওয়া যায়নি। অনুগ্রহ করে প্রথমে ক্যামেরা ভিউ চালু করুন।",
      confidence: null,
    };
  }

  try {
    const detectionResult = detector.detect(imageSource);
    const detections = detectionResult.detections || [];

    if (detections.length === 0) {
      return {
        tool: "describeSurroundings",
        status: "success",
        source: "on-device-model",
        message_bn: "কিছু চিনতে পারিনি",
        confidence: null,
      };
    }

    let highestConfidence: number | null = null;
    const itemsDescription: string[] = [];

    for (const d of detections) {
      const category = d.categories?.[0];
      if (!category) continue;

      const rawLabel = category.categoryName.toLowerCase().trim();
      const score = category.score ?? null;

      if (score !== null && (highestConfidence === null || score > highestConfidence)) {
        highestConfidence = score;
      }

      const bengaliName = COCO_BENGALI_MAP[rawLabel] || category.categoryName;

      // Determine horizontal position: under 0.33 left, over 0.66 right, else centre
      let positionBn = "মাঝখানে";
      if (d.boundingBox && imageWidth > 0) {
        const centerX = d.boundingBox.originX + d.boundingBox.width / 2;
        const ratio = centerX / imageWidth;
        if (ratio < 0.33) {
          positionBn = "বামে";
        } else if (ratio > 0.66) {
          positionBn = "ডানে";
        } else {
          positionBn = "মাঝখানে";
        }
      }

      itemsDescription.push(`${positionBn} একটি ${bengaliName}`);
    }

    if (itemsDescription.length === 0) {
      return {
        tool: "describeSurroundings",
        status: "success",
        source: "on-device-model",
        message_bn: "কিছু চিনতে পারিনি",
        confidence: null,
      };
    }

    const message_bn = `আমি দেখতে পাচ্ছি যা মনে হচ্ছে: ${itemsDescription.join(", ")}`;

    return {
      tool: "describeSurroundings",
      status: "success",
      source: "on-device-model",
      message_bn,
      confidence: highestConfidence,
    };
  } catch (detectErr) {
    return {
      tool: "describeSurroundings",
      status: "error",
      source: "on-device-model",
      message_bn: "বস্তু সনাক্ত করার সময় ত্রুটি ঘটেছে।",
      detail: detectErr instanceof Error ? detectErr.message : "Unknown detection error",
      confidence: null,
    };
  }
}

export { detectObjects as describeSurroundings };
