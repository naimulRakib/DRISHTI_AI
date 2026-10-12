/**
 * DRISHTI AI — Bengali Speech Output Module
 * Handles speech synthesis with strict Bengali voice validation.
 * Never falls back to English voices when a Bengali voice is missing.
 */

export interface SpeechOptions {
  rate?: number;
  onEnd?: () => void;
}

export interface SpeechStatusState {
  isSpeaking: boolean;
  noBengaliVoice: boolean;
  lastSpokenText: string | null;
  visibleMessage: string | null;
}

type SpeechListener = (state: SpeechStatusState) => void;

let isSpeaking = false;
let noBengaliVoice = false;
let lastSpokenText: string | null = null;
let visibleMessage: string | null = null;
let cachedVoice: SpeechSynthesisVoice | null = null;
let defaultRate = 1.0;
let cancelActiveChunks = false;

const listeners: Set<SpeechListener> = new Set();

function notify(): void {
  const currentState: SpeechStatusState = {
    isSpeaking,
    noBengaliVoice,
    lastSpokenText,
    visibleMessage,
  };
  listeners.forEach((listener) => {
    try {
      listener(currentState);
    } catch {
      // Ignore listener errors
    }
  });
}

function findBengaliVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    return null;
  }

  // 1. Check for bn-BD (Bangladesh)
  const bnBD = voices.find((v) => v.lang.toLowerCase().startsWith("bn-bd"));
  if (bnBD) return bnBD;

  // 2. Check for bn-IN (India)
  const bnIN = voices.find((v) => v.lang.toLowerCase().startsWith("bn-in"));
  if (bnIN) return bnIN;

  // 3. Check for any voice starting with bn
  const anyBn = voices.find((v) => v.lang.toLowerCase().startsWith("bn"));
  if (anyBn) return anyBn;

  return null;
}

function initVoices(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    noBengaliVoice = true;
    notify();
    return;
  }

  const checkVoices = () => {
    const voice = findBengaliVoice();
    cachedVoice = voice;
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      if (!voice) {
        noBengaliVoice = true;
      } else {
        noBengaliVoice = false;
      }
      notify();
    }
  };

  checkVoices();

  if (window.speechSynthesis.onvoiceschanged !== undefined) {
    window.speechSynthesis.onvoiceschanged = () => {
      checkVoices();
    };
  }
}

// Initialize voices when in browser
if (typeof window !== "undefined") {
  initVoices();
}

export function setDefaultRate(rate: number): void {
  defaultRate = rate;
}

export function getSpeechState(): SpeechStatusState {
  return {
    isSpeaking,
    noBengaliVoice,
    lastSpokenText,
    visibleMessage,
  };
}

export function subscribeSpeechState(listener: SpeechListener): () => void {
  listeners.add(listener);
  listener(getSpeechState());
  return () => {
    listeners.delete(listener);
  };
}

export function stopSpeaking(): void {
  cancelActiveChunks = true;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
  isSpeaking = false;
  notify();
}

export function speak(text: string, options?: SpeechOptions): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    noBengaliVoice = true;
    visibleMessage = `স্পিচ সাপোর্ট নেই। টেক্সট: ${text}`;
    notify();
    return;
  }

  // Cancel any ongoing speech before starting a new one
  stopSpeaking();

  if (!text || text.trim() === "") {
    return;
  }

  lastSpokenText = text;

  // Find or refresh cached voice
  if (!cachedVoice) {
    cachedVoice = findBengaliVoice();
  }

  // If no Bengali voice exists, DO NOT speak with an English voice
  if (!cachedVoice) {
    noBengaliVoice = true;
    visibleMessage = `ডিভাইসে বাংলা ভয়েস পাওয়া যায়নি। টেক্সট: ${text}`;
    isSpeaking = false;
    notify();
    return;
  }

  noBengaliVoice = false;
  visibleMessage = text;

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = cachedVoice;
    utterance.lang = cachedVoice.lang;
    utterance.rate = options?.rate ?? defaultRate;

    utterance.onstart = () => {
      isSpeaking = true;
      notify();
    };

    utterance.onend = () => {
      isSpeaking = false;
      notify();
      options?.onEnd?.();
    };

    utterance.onerror = () => {
      isSpeaking = false;
      notify();
      options?.onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  } catch {
    isSpeaking = false;
    notify();
  }
}

/**
 * Splits text into chunks of at most maxChunkLength characters,
 * respecting sentence endings (। , . ? ! \n) and word boundaries where possible.
 */
export function splitTextIntoChunks(text: string, maxChunkLength = 300): string[] {
  if (!text) return [];
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkLength) return [trimmed];

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > 0) {
    if (remaining.length <= maxChunkLength) {
      chunks.push(remaining.trim());
      break;
    }

    const slice = remaining.slice(0, maxChunkLength);
    let breakIdx = -1;

    // Look for sentence terminators or newlines
    const punctMatches = [...slice.matchAll(/[।\n\.\?!;]/g)];
    if (punctMatches.length > 0) {
      const lastPunct = punctMatches[punctMatches.length - 1];
      if (lastPunct.index !== undefined && lastPunct.index > 30) {
        breakIdx = lastPunct.index + 1;
      }
    }

    // Fallback: look for space boundary
    if (breakIdx === -1) {
      const lastSpace = slice.lastIndexOf(" ");
      if (lastSpace > 30) {
        breakIdx = lastSpace + 1;
      }
    }

    // Hard cutoff if no suitable boundary found
    if (breakIdx === -1) {
      breakIdx = maxChunkLength;
    }

    const chunk = remaining.slice(0, breakIdx).trim();
    if (chunk) {
      chunks.push(chunk);
    }
    remaining = remaining.slice(breakIdx).trim();
  }

  return chunks;
}

/**
 * Speaks text in chunks of at most 300 characters sequentially.
 * Stops immediately if stopSpeaking() is triggered mid-reading or between chunks.
 */
export async function speakInChunks(
  chunks: string[],
  options?: SpeechOptions
): Promise<void> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    noBengaliVoice = true;
    visibleMessage = `স্পিচ সাপোর্ট নেই। টেক্সট: ${chunks.join(" ")}`;
    notify();
    return;
  }

  // Cancel prior speech and reset cancellation flag
  stopSpeaking();
  cancelActiveChunks = false;

  if (!chunks || chunks.length === 0) return;

  if (!cachedVoice) {
    cachedVoice = findBengaliVoice();
  }

  if (!cachedVoice) {
    noBengaliVoice = true;
    visibleMessage = `ডিভাইসে বাংলা ভয়েস পাওয়া যায়নি। টেক্সট: ${chunks.join(" ")}`;
    isSpeaking = false;
    notify();
    return;
  }

  noBengaliVoice = false;
  lastSpokenText = chunks.join(" ");
  visibleMessage = chunks.join(" ");

  for (let i = 0; i < chunks.length; i++) {
    if (cancelActiveChunks) break;

    const chunk = chunks[i].trim();
    if (!chunk) continue;

    await new Promise<void>((resolve) => {
      if (cancelActiveChunks) {
        resolve();
        return;
      }

      try {
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.voice = cachedVoice;
        utterance.lang = cachedVoice?.lang || "bn-BD";
        utterance.rate = options?.rate ?? defaultRate;

        utterance.onstart = () => {
          isSpeaking = true;
          notify();
        };

        utterance.onend = () => {
          isSpeaking = false;
          notify();
          resolve();
        };

        utterance.onerror = () => {
          isSpeaking = false;
          notify();
          resolve();
        };

        window.speechSynthesis.speak(utterance);
      } catch {
        isSpeaking = false;
        notify();
        resolve();
      }
    });

    if (cancelActiveChunks) break;
  }

  isSpeaking = false;
  notify();
  options?.onEnd?.();
}

export function repeatLast(options?: SpeechOptions): void {
  if (lastSpokenText) {
    speak(lastSpokenText, options);
  } else {
    speak("পুনরায় বলার মতো কোনো পূর্ববর্তী বার্তা নেই।", options);
  }
}
