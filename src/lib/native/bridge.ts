/**
 * Drishti Native Kotlin Bridge
 * Connects the Next.js web application with native Android hardware:
 * - Foreground Service with persistent WakeLock
 * - High-accuracy FusedLocationProviderClient (1Hz GPS updates)
 * - Android Hardware Compass (Azimuth Heading)
 * - Native Directional Haptic Feedback
 * - Native TextToSpeech engine
 * 
 * Provides transparent Web Geolocation & DeviceOrientation fallback
 * when running directly in a browser outside the Android APK.
 */

export interface NavTickData {
  lat: number;
  lng: number;
  heading: number;
  destLat: number | null;
  destLng: number | null;
  destName: string | null;
  distanceMeters: number;
  clockDirection: string;
  accuracy: number;
}

export type HapticPattern =
  | "turn_left"
  | "turn_right"
  | "obstacle_alert"
  | "confirm"
  | "cancel";

export interface DrishtiNativeInterface {
  isNativeAvailable(): boolean;
  getPlatform(): string;
  startWalkWithMe(destLat: number, destLng: number, destName: string): void;
  stopWalkWithMe(): void;
  setDestination(destLat: number, destLng: number, destName: string): void;
  triggerHaptic(pattern: HapticPattern): void;
  speakNative(text: string): void;

  // ANVI Safety & Fall Detection Extensions
  saveEmergencyContact(phoneNumber: string): void;
  getEmergencyContact(): string;
  cancelFallAlert(): void;
  triggerFallSimulation(): void;
  isFallMonitoringActive(): boolean;
  getSmartCaneServerUrl(): string;
}

declare global {
  interface Window {
    DrishtiBridge?: DrishtiNativeInterface;
    __drishtiNavListener?: (data: NavTickData) => void;
    __drishtiOnFallAlert?: (data: { countdownSeconds: number }) => void;
    __drishtiOnFallCountdownTick?: (data: { secondsRemaining: number }) => void;
    __drishtiOnFallCancelled?: () => void;
    __drishtiOnMotionMagnitude?: (data: { magnitude: number }) => void;
    __drishtiOnCaneImage?: (data: { imagePath: string }) => void;
  }
}

/**
 * Check if running inside the Drishti Android APK with active Kotlin bridge
 */
export function isNativeAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    window.DrishtiBridge &&
    typeof window.DrishtiBridge.isNativeAvailable === "function" &&
    window.DrishtiBridge.isNativeAvailable()
  );
}

/**
 * Convert angle difference between current heading and destination bearing
 * into Bengali clock-face directions.
 */
export function calculateClockDirection(currentHeading: number, targetBearing: number): string {
  let diff = (targetBearing - currentHeading) % 360;
  if (diff < -180) diff += 360;
  if (diff > 180) diff -= 360;

  const hoursOffset = Math.round(diff / 30);
  let clockHour = (12 + hoursOffset) % 12;
  if (clockHour === 0) clockHour = 12;

  const bengaliDigits: Record<number, string> = {
    1: "১", 2: "২", 3: "৩", 4: "৪", 5: "৫", 6: "৬",
    7: "৭", 8: "৮", 9: "৯", 10: "১০", 11: "১১", 12: "১২"
  };

  const bnHour = bengaliDigits[clockHour] || `${clockHour}`;
  switch (clockHour) {
    case 12:
      return "১২টার দিকে সোজা চলুন";
    case 1:
    case 2:
      return `${bnHour}টার দিকে সামান্য ডানে এগোন`;
    case 3:
      return "৩টার দিকে ডানপাশে ঘুরুন";
    case 4:
    case 5:
      return `${bnHour}টার দিকে পেছন-ডানে ঘুরুন`;
    case 6:
      return "৬টার দিকে সম্পূর্ণ পেছনে ঘুরুন";
    case 7:
    case 8:
      return `${bnHour}টার দিকে পেছন-বাঁয়ে ঘুরুন`;
    case 9:
      return "৯টার দিকে বামপাশে ঘুরুন";
    case 10:
    case 11:
      return `${bnHour}টার দিকে সামান্য বাঁয়ে এগোন`;
    default:
      return "সোজা চলুন";
  }
}

/**
 * Calculate Great-Circle distance between two coordinates in meters (Haversine formula)
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Calculate initial bearing from point A to point B in degrees (0..360)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);
  const theta = Math.atan2(y, x);

  const bearing = ((theta * 180) / Math.PI + 360) % 360;
  return Math.round(bearing);
}

// Global subscribers set
const navListeners = new Set<(data: NavTickData) => void>();

// Web fallback tracking IDs
let webWatchId: number | null = null;
let currentWebHeading = 0;
let currentWebDest: { lat: number; lng: number; name: string } | null = null;

function setupNativeGlobalListener() {
  if (typeof window !== "undefined" && !window.__drishtiNavListener) {
    window.__drishtiNavListener = (data: NavTickData) => {
      navListeners.forEach((listener) => {
        try {
          listener(data);
        } catch (e) {
          console.error("Error in Drishti nav listener:", e);
        }
      });
    };
  }
}

/**
 * Subscribe to continuous navigation updates from native Kotlin service or web fallback.
 */
export function subscribeNavTick(listener: (data: NavTickData) => void): () => void {
  setupNativeGlobalListener();
  navListeners.add(listener);
  return () => {
    navListeners.delete(listener);
  };
}

/**
 * Start "Walk With Me" continuous GPS and orientation tracking.
 * Routes to native Kotlin Android service if available, else initiates web geolocation watch.
 */
export function startWalkWithMe(destLat: number, destLng: number, destName: string): void {
  if (isNativeAvailable() && window.DrishtiBridge) {
    window.DrishtiBridge.startWalkWithMe(destLat, destLng, destName);
    return;
  }

  // Web Fallback: Geolocation + DeviceOrientation
  currentWebDest = { lat: destLat, lng: destLng, name: destName };

  if (typeof window !== "undefined") {
    const hasAbsolute = "ondeviceorientationabsolute" in (window as unknown as Record<string, unknown>);
    const eventType = hasAbsolute ? "deviceorientationabsolute" : "deviceorientation";
    window.addEventListener(eventType, handleWebOrientation as EventListener, true);
  }

  if (typeof navigator !== "undefined" && navigator.geolocation) {
    webWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const accuracy = pos.coords.accuracy;

        const distanceMeters = currentWebDest
          ? calculateDistanceMeters(lat, lng, currentWebDest.lat, currentWebDest.lng)
          : 0;

        const bearing = currentWebDest
          ? calculateBearing(lat, lng, currentWebDest.lat, currentWebDest.lng)
          : 0;

        const clockDirection = currentWebDest
          ? calculateClockDirection(currentWebHeading, bearing)
          : "সোজা চলুন";

        const tickData: NavTickData = {
          lat,
          lng,
          heading: currentWebHeading,
          destLat: currentWebDest ? currentWebDest.lat : null,
          destLng: currentWebDest ? currentWebDest.lng : null,
          destName: currentWebDest ? currentWebDest.name : null,
          distanceMeters,
          clockDirection,
          accuracy,
        };

        if (window.__drishtiNavListener) {
          window.__drishtiNavListener(tickData);
        }
      },
      (err) => {
        console.warn("Web Geolocation watch error:", err.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );
  }

  triggerHaptic("confirm");
}

function handleWebOrientation(e: DeviceOrientationEvent) {
  // @ts-expect-error webkitCompassHeading is available on iOS Safari
  const compassHeading = e.webkitCompassHeading ?? (e.alpha ? 360 - e.alpha : 0);
  currentWebHeading = Math.round(compassHeading);
}

/**
 * Stop "Walk With Me" mode and release services/listeners.
 */
export function stopWalkWithMe(): void {
  if (isNativeAvailable() && window.DrishtiBridge) {
    window.DrishtiBridge.stopWalkWithMe();
    return;
  }

  // Clear web fallback
  if (webWatchId !== null && typeof navigator !== "undefined") {
    navigator.geolocation.clearWatch(webWatchId);
    webWatchId = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("deviceorientationabsolute", handleWebOrientation as EventListener, true);
    window.removeEventListener("deviceorientation", handleWebOrientation as EventListener, true);
  }
  currentWebDest = null;
  triggerHaptic("cancel");
}

/**
 * Send tactile haptic feedback to user.
 */
export function triggerHaptic(pattern: HapticPattern): void {
  if (isNativeAvailable() && window.DrishtiBridge) {
    window.DrishtiBridge.triggerHaptic(pattern);
    return;
  }

  // Web Vibration API Fallback
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    switch (pattern) {
      case "turn_left":
        navigator.vibrate([100, 80, 100]);
        break;
      case "turn_right":
        navigator.vibrate([80, 60, 80, 60, 80]);
        break;
      case "obstacle_alert":
        navigator.vibrate([350, 100, 350]);
        break;
      case "confirm":
        navigator.vibrate(120);
        break;
      case "cancel":
        navigator.vibrate([150, 100, 150]);
        break;
    }
  }
}

/**
 * Speak text natively using Android TTS if in native app
 */
export function speakNative(text: string): boolean {
  if (isNativeAvailable() && window.DrishtiBridge) {
    window.DrishtiBridge.speakNative(text);
    return true;
  }
  return false;
}

/**
 * Save emergency contact phone number in native encrypted storage
 */
export function saveEmergencyContact(phoneNumber: string): void {
  if (isNativeAvailable() && window.DrishtiBridge) {
    window.DrishtiBridge.saveEmergencyContact(phoneNumber);
  } else if (typeof window !== "undefined") {
    localStorage.setItem("drishti_emergency_contact", phoneNumber);
  }
}

/**
 * Read stored emergency contact phone number
 */
export function getEmergencyContact(): string {
  if (isNativeAvailable() && window.DrishtiBridge) {
    return window.DrishtiBridge.getEmergencyContact();
  }
  if (typeof window !== "undefined") {
    return localStorage.getItem("drishti_emergency_contact") || "";
  }
  return "";
}

/**
 * Cancel an active native fall detection alert and loud siren
 */
export function cancelFallAlert(): void {
  if (isNativeAvailable() && window.DrishtiBridge) {
    window.DrishtiBridge.cancelFallAlert();
  }
}

/**
 * Trigger fall alert simulation (plays native siren and tests countdown)
 */
export function triggerFallSimulation(): void {
  if (isNativeAvailable() && window.DrishtiBridge) {
    window.DrishtiBridge.triggerFallSimulation();
  }
}

/**
 * Check if native 24/7 background fall monitoring service is active
 */
export function isFallMonitoringActive(): boolean {
  if (isNativeAvailable() && window.DrishtiBridge) {
    return window.DrishtiBridge.isFallMonitoringActive();
  }
  return false;
}

/**
 * Get Smart Cane IoT Gateway URL (NanoHTTPD on port 5000)
 */
export function getSmartCaneServerUrl(): string {
  if (isNativeAvailable() && window.DrishtiBridge) {
    return window.DrishtiBridge.getSmartCaneServerUrl();
  }
  return "http://localhost:5000";
}

export interface FallAlertListeners {
  onTriggered?: (countdownSeconds: number) => void;
  onTick?: (secondsRemaining: number) => void;
  onCancelled?: () => void;
  onMotionMagnitude?: (magnitude: number) => void;
  onCaneImage?: (imagePath: string) => void;
}

/**
 * Subscribe to native fall alert and smart cane events
 */
export function subscribeFallEvents(listeners: FallAlertListeners): () => void {
  if (typeof window === "undefined") return () => {};

  window.__drishtiOnFallAlert = (data) => {
    listeners.onTriggered?.(data.countdownSeconds);
  };
  window.__drishtiOnFallCountdownTick = (data) => {
    listeners.onTick?.(data.secondsRemaining);
  };
  window.__drishtiOnFallCancelled = () => {
    listeners.onCancelled?.();
  };
  window.__drishtiOnMotionMagnitude = (data) => {
    listeners.onMotionMagnitude?.(data.magnitude);
  };
  window.__drishtiOnCaneImage = (data) => {
    listeners.onCaneImage?.(data.imagePath);
  };

  return () => {
    window.__drishtiOnFallAlert = undefined;
    window.__drishtiOnFallCountdownTick = undefined;
    window.__drishtiOnFallCancelled = undefined;
    window.__drishtiOnMotionMagnitude = undefined;
    window.__drishtiOnCaneImage = undefined;
  };
}

