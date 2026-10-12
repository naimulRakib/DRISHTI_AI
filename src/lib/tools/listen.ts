/**
 * DRISHTI AI — Speech Recognition Listener
 * Wraps Web SpeechRecognition for bn-BD with clear state tracking and robust Bengali error handling.
 */

export type MicState = "idle" | "listening" | "error";

export interface ListenCallbacks {
  onResult: (transcript: string) => void;
  onError: (errorMessageBn: string, rawError: string) => void;
  onStateChange: (state: MicState) => void;
}

// Global browser SpeechRecognition interfaces
interface SpeechRecognitionEventLike extends Event {
  results: {
    length: number;
    [index: number]: {
      length: number;
      [index: number]: {
        transcript: string;
      };
      isFinal: boolean;
    };
  };
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((event: Event) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: ((event: Event) => void) | null;
}

let activeRecognition: SpeechRecognitionInstance | null = null;
let currentMicState: MicState = "idle";

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(
    (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
  );
}

export function getCurrentMicState(): MicState {
  return currentMicState;
}

export function startListening(callbacks: ListenCallbacks): void {
  if (typeof window === "undefined") {
    callbacks.onStateChange("error");
    callbacks.onError("ব্রাউজার পরিবেশ পাওয়া যায়নি।", "no-window");
    return;
  }

  const windowObj = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };

  const SpeechRecognitionClass =
    windowObj.SpeechRecognition || windowObj.webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    currentMicState = "error";
    callbacks.onStateChange("error");
    callbacks.onError(
      "আপনার ব্রাউজারে ভয়েস ইনপুট সমর্থিত নয়। অনুগ্রহ করে নিচের বক্সে লিখে জানান।",
      "not-supported"
    );
    return;
  }

  // Check if device is currently offline
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    callbacks.onStateChange("error");
    callbacks.onError(
      "ভয়েস ইনপুটের জন্য ইন্টারনেট সংযোগ প্রয়োজন (বর্তমানে অফলাইন রয়েছে)। অনুগ্রহ করে নিচের বক্সে লিখে জানান।",
      "network"
    );
    return;
  }

  // Stop any previous instance
  stopListening();

  try {
    const recognition = new SpeechRecognitionClass();
    recognition.lang = "bn-BD";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      currentMicState = "listening";
      callbacks.onStateChange("listening");
    };

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let finalTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].length > 0) {
          finalTranscript += event.results[i][0].transcript;
        }
      }

      currentMicState = "idle";
      callbacks.onStateChange("idle");

      if (finalTranscript.trim() !== "") {
        callbacks.onResult(finalTranscript.trim());
      } else {
        callbacks.onError(
          "কোনো স্পষ্ট কথা সনাক্ত করা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন বা লিখে জানান।",
          "empty"
        );
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      currentMicState = "error";
      callbacks.onStateChange("error");

      let messageBn = "ভয়েস গ্রহণে সমস্যা হয়েছে। অনুগ্রহ করে নিচের বক্সে লিখে জানান।";

      if (event.error === "not-allowed") {
        messageBn = "মাইক্রোফোনের অনুমতি দেওয়া হয়নি। অনুগ্রহ করে ব্রাউজার সেটিংসে অনুমতি দিন অথবা নিচের বক্সে লিখে জানান।";
      } else if (event.error === "no-speech") {
        messageBn = "কোনো কথা শোনা যায়নি। অনুগ্রহ করে আবার চেষ্টা করুন অথবা নিচের বক্সে লিখে জানান।";
      } else if (event.error === "network") {
        messageBn = "ভয়েস রিকগনিশনের জন্য সক্রিয় ইন্টারনেট সংযোগ প্রয়োজন। নিচের বক্সে লিখেও কমান্ড দিতে পারেন।";
      }

      callbacks.onError(messageBn, event.error);
    };

    recognition.onend = () => {
      if (currentMicState === "listening") {
        currentMicState = "idle";
        callbacks.onStateChange("idle");
      }
      activeRecognition = null;
    };

    activeRecognition = recognition;
    recognition.start();
  } catch (err) {
    currentMicState = "error";
    callbacks.onStateChange("error");
    callbacks.onError(
      "ভয়েস সিস্টেম চালু করতে সমস্যা হয়েছে। অনুগ্রহ করে নিচের বক্সে লিখুন।",
      err instanceof Error ? err.message : "unknown"
    );
  }
}

export function stopListening(): void {
  if (activeRecognition) {
    try {
      activeRecognition.abort();
    } catch {
      // Ignore abort errors
    }
    activeRecognition = null;
  }
  currentMicState = "idle";
}
