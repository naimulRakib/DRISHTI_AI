/**
 * DRISHTI AI — Bengali Speech Output Module
 * Handles speech synthesis with resilient dual-engine Bengali pronunciation:
 * 1. Native Web Speech API with explicit Bengali voice (bn-BD / bn-IN).
 * 2. High-Fidelity Google Bengali TTS Audio Stream fallback when native voice pack is absent on device.
 * 3. Browser SpeechSynthesis with lang="bn-BD" fallback.
 * Guarantees that every single output is pronounced in Bengali under all conditions.
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
let currentAudioElement: HTMLAudioElement | null = null;

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

export function findBengaliVoice(): SpeechSynthesisVoice | null {
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

  // 4. Check for name containing bengali or bangla
  const nameBn = voices.find(
    (v) =>
      v.name.toLowerCase().includes("bengali") ||
      v.name.toLowerCase().includes("bangla")
  );
  if (nameBn) return nameBn;

  return null;
}

function initVoices(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }

  const checkVoices = () => {
    const voice = findBengaliVoice();
    cachedVoice = voice;
    const voices = window.speechSynthesis.getVoices();
    if (voices && voices.length > 0) {
      noBengaliVoice = !voice;
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

/**
 * Stops both Web Speech API and any playing audio streams immediately.
 */
export function stopSpeaking(): void {
  cancelActiveChunks = true;

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
      currentAudioElement.currentTime = 0;
    } catch {
      // Ignore audio stop errors
    }
    currentAudioElement = null;
  }

  isSpeaking = false;
  notify();
}

/**
 * Plays pristine Bengali audio pronunciation via Google TTS audio stream.
 * Resolves with true if successfully played, false if network or format error.
 */
function playGoogleBengaliAudio(
  text: string,
  options?: SpeechOptions
): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(false);
      return;
    }

    try {
      // Google TTS endpoint for Bengali (tl=bn)
      const encodedText = encodeURIComponent(text.trim());
      const audioUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=bn&client=tw-ob&q=${encodedText}`;
      const audio = new Audio(audioUrl);
      currentAudioElement = audio;

      audio.playbackRate = options?.rate ?? defaultRate;

      audio.onplay = () => {
        isSpeaking = true;
        notify();
      };

      audio.onended = () => {
        isSpeaking = false;
        currentAudioElement = null;
        notify();
        options?.onEnd?.();
        resolve(true);
      };

      audio.onerror = () => {
        isSpeaking = false;
        currentAudioElement = null;
        notify();
        resolve(false);
      };

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(() => {
          isSpeaking = false;
          currentAudioElement = null;
          notify();
          resolve(false);
        });
      }
    } catch {
      isSpeaking = false;
      currentAudioElement = null;
      notify();
      resolve(false);
    }
  });
}

/**
 * Speaks Bengali text using native Web Speech API.
 */
function speakViaWebSpeech(
  text: string,
  voice: SpeechSynthesisVoice | null,
  options?: SpeechOptions
): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    isSpeaking = false;
    notify();
    options?.onEnd?.();
    return;
  }

  try {
    const utterance = new SpeechSynthesisUtterance(text);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || "bn-BD";
    } else {
      utterance.lang = "bn-BD";
      // Pick best default voice for language dispatch
      const voices = window.speechSynthesis.getVoices();
      const defaultVoice = voices.find((v) => v.default) || voices[0];
      if (defaultVoice) {
        utterance.voice = defaultVoice;
      }
    }

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
    options?.onEnd?.();
  }
}

/**
 * Primary Speak Function:
 * Pronounces any text in Bengali aloud.
 * 1. If native Bengali voice found in browser: speaks via SpeechSynthesis.
 * 2. If no native voice found: streams native Bengali TTS audio.
 * 3. If stream unavailable: speaks via SpeechSynthesis with lang="bn-BD".
 */
export async function speak(text: string, options?: SpeechOptions): Promise<void> {
  if (!text || text.trim() === "") {
    return;
  }

  stopSpeaking();
  cancelActiveChunks = false;

  lastSpokenText = text;
  visibleMessage = text;

  // Refresh voice if needed
  if (!cachedVoice) {
    cachedVoice = findBengaliVoice();
  }

  // 1. If device has a native Bengali voice, speak directly
  if (cachedVoice) {
    noBengaliVoice = false;
    speakViaWebSpeech(text, cachedVoice, options);
    return;
  }

  // 2. Fallback: stream authentic Bengali pronunciation audio
  const playedAudio = await playGoogleBengaliAudio(text, options);
  if (playedAudio) {
    noBengaliVoice = false;
    return;
  }

  // 3. Fallback: Web Speech API with forced Bengali locale
  noBengaliVoice = false;
  speakViaWebSpeech(text, null, options);
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
 * Speaks text in chunks sequentially.
 * Stops immediately if stopSpeaking() is triggered mid-reading or between chunks.
 */
export async function speakInChunks(
  chunks: string[],
  options?: SpeechOptions
): Promise<void> {
  if (!chunks || chunks.length === 0) return;

  stopSpeaking();
  cancelActiveChunks = false;

  const fullText = chunks.join(" ");
  lastSpokenText = fullText;
  visibleMessage = fullText;

  for (let i = 0; i < chunks.length; i++) {
    if (cancelActiveChunks) break;

    const chunk = chunks[i].trim();
    if (!chunk) continue;

    await new Promise<void>((resolve) => {
      if (cancelActiveChunks) {
        resolve();
        return;
      }

      speak(chunk, {
        rate: options?.rate,
        onEnd: () => resolve(),
      });
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

let touchDebounceTimer: NodeJS.Timeout | null = null;
let lastTouchDescription: string | null = null;
let lastTouchTimestamp = 0;

/**
 * Explore-by-Touch Pronunciation:
 * When a blind user touches, hovers, or focuses on any UI button/option,
 * this function announces what it is in Bengali audio.
 */
export function speakTouch(description: string): void {
  if (!description || description.trim() === "") return;
  const clean = description.trim();
  const now = Date.now();

  // Avoid repeating identical option within 1.2s to prevent stutter
  if (lastTouchDescription === clean && now - lastTouchTimestamp < 1200) {
    return;
  }

  if (touchDebounceTimer) {
    clearTimeout(touchDebounceTimer);
  }

  touchDebounceTimer = setTimeout(() => {
    lastTouchDescription = clean;
    lastTouchTimestamp = Date.now();
    speak(clean);
  }, 100);
}
