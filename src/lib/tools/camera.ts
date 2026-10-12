/**
 * DRISHTI AI — Camera Capture Module
 * Local-first in-browser video feed and offscreen frame capture.
 * Never stores or transmits frames to any external destination.
 */

export type CameraStatus = "idle" | "starting" | "active" | "error";

export type CameraErrorType =
  | "permission_denied"
  | "unavailable"
  | "insecure_context"
  | "in_use"
  | "unknown";

export interface CameraErrorResult {
  type: CameraErrorType;
  message_bn: string;
}

let activeStream: MediaStream | null = null;

/**
 * Checks if the current execution context is secure (HTTPS or localhost).
 */
export function isSecureCameraContext(): boolean {
  if (typeof window === "undefined") return false;
  if (window.isSecureContext) return true;
  const hostname = window.location.hostname;
  return (
    window.location.protocol === "https:" ||
    hostname === "localhost" ||
    hostname === "127.0.0.1"
  );
}

/**
 * Starts the camera stream and binds it to the provided video element.
 * Prioritizes back/environment camera for mobile visual assistance.
 */
export async function startCamera(
  videoElement: HTMLVideoElement
): Promise<{ success: boolean; stream?: MediaStream; error?: CameraErrorResult }> {
  if (typeof window === "undefined" || !navigator.mediaDevices) {
    return {
      success: false,
      error: {
        type: "unavailable",
        message_bn: "আপনার ব্রাউজারে মিডিয়া ডিভাইস সুবিধা পাওয়া যায়নি।",
      },
    };
  }

  if (!isSecureCameraContext()) {
    return {
      success: false,
      error: {
        type: "insecure_context",
        message_bn: "ক্যামেরা ব্যবহারের জন্য নিরাপদ সংযোগ (HTTPS বা Localhost) আবশ্যক।",
      },
    };
  }

  // Stop any previously running stream
  stopCamera(activeStream, videoElement);

  try {
    let stream: MediaStream;
    try {
      // First attempt: environment/rear camera
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
    } catch {
      // Fallback: any available video input (e.g. laptop webcam)
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
    }

    activeStream = stream;
    videoElement.srcObject = stream;
    videoElement.muted = true;
    videoElement.playsInline = true;

    await videoElement.play();

    return {
      success: true,
      stream,
    };
  } catch (err: unknown) {
    activeStream = null;
    const domError = err as { name?: string };

    if (
      domError.name === "NotAllowedError" ||
      domError.name === "PermissionDeniedError"
    ) {
      return {
        success: false,
        error: {
          type: "permission_denied",
          message_bn: "ক্যামেরা ব্যবহারের অনুমতি দেওয়া হয়নি। অনুগ্রহ করে ব্রাউজার সেটিংসে ক্যামেরার অনুমতি দিন।",
        },
      };
    }

    if (
      domError.name === "NotFoundError" ||
      domError.name === "DevicesNotFoundError"
    ) {
      return {
        success: false,
        error: {
          type: "unavailable",
          message_bn: "ডিভাইসে কোনো ক্যামেরা ডিভাইস পাওয়া যায়নি।",
        },
      };
    }

    if (
      domError.name === "NotReadableError" ||
      domError.name === "TrackStartError"
    ) {
      return {
        success: false,
        error: {
          type: "in_use",
          message_bn: "ক্যামেরাটি অন্য কোনো অ্যাপ্লিকেশন দ্বারা ব্যবহৃত হচ্ছে।",
        },
      };
    }

    return {
      success: false,
      error: {
        type: "unavailable",
        message_bn: "ক্যামেরা চালু করতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
      },
    };
  }
}

/**
 * Completely stops every track in the camera stream and detaches from video element.
 */
export function stopCamera(
  stream?: MediaStream | null,
  videoElement?: HTMLVideoElement | null
): void {
  const targetStream = stream || activeStream;

  if (targetStream) {
    targetStream.getTracks().forEach((track) => {
      track.stop();
    });
  }

  if (activeStream && activeStream === targetStream) {
    activeStream = null;
  }

  if (videoElement) {
    videoElement.srcObject = null;
  }
}

/**
 * Captures the current video frame onto an offscreen canvas.
 * Returns an ImageData object for local vision analysis. Never stores or transmits frames.
 */
export function captureFrame(videoElement: HTMLVideoElement): ImageData | null {
  if (
    !videoElement ||
    videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
    videoElement.videoWidth === 0 ||
    videoElement.videoHeight === 0
  ) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = videoElement.videoWidth;
  canvas.height = videoElement.videoHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
