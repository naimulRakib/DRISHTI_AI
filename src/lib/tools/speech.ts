/**
 * DRISHTI AI — Bengali Speech Output Module
 * Handles speech synthesis with strict Bengali voice validation.
 * Never falls back to English voices when a Bengali voice is missing.
 */

export interface SpeechOptions {
  rate?: number;
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
let voicesLoaded = false;
let defaultRate = 1.0;

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
      voicesLoaded = true;
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
    };

    utterance.onerror = () => {
      isSpeaking = false;
      notify();
    };

    window.speechSynthesis.speak(utterance);
  } catch {
    isSpeaking = false;
    notify();
  }
}

export function repeatLast(options?: SpeechOptions): void {
  if (lastSpokenText) {
    speak(lastSpokenText, options);
  } else {
    speak("পুনরায় বলার মতো কোনো পূর্ববর্তী বার্তা নেই।", options);
  }
}
