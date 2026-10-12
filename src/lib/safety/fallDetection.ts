/**
 * DRISHTI AI — Fall Detection Heuristic Module
 *
 * Tunable Named Constants:
 * - FREE_FALL_THRESHOLD: Acceleration magnitude under 3.0 m/s^2 (near free-fall / weightlessness)
 * - FREE_FALL_MIN_DURATION_MS: Minimum continuous duration (100 ms) in free-fall
 * - IMPACT_SPIKE_THRESHOLD: Spike over 25.0 m/s^2 (impact with floor / ground)
 * - IMPACT_WINDOW_MS: Window (1000 ms = 1 second) within which the impact must occur
 *
 * Label: "পরীক্ষামূলক, যাচাই করা হয়নি" (experimental, not validated)
 * Note: Works only while this page is open and the screen is on.
 */

export const FREE_FALL_THRESHOLD = 3.0; // m/s^2
export const FREE_FALL_MIN_DURATION_MS = 100; // ms
export const IMPACT_SPIKE_THRESHOLD = 25.0; // m/s^2
export const IMPACT_WINDOW_MS = 1000; // ms

export interface AccelerationVector {
  x: number | null;
  y: number | null;
  z: number | null;
}

export interface FallDetectorState {
  freeFallStartTime: number | null;
  freeFallQualifiedTime: number | null;
  lastMagnitude: number;
}

export function createInitialDetectorState(): FallDetectorState {
  return {
    freeFallStartTime: null,
    freeFallQualifiedTime: null,
    lastMagnitude: 9.8,
  };
}

/**
 * Pure heuristic evaluator for a single acceleration reading at a given timestamp.
 * Returns true if a fall pattern (free fall >= 100ms followed within 1s by impact >= 25 m/s^2) is detected.
 */
export function evaluateAccelerationSample(
  state: FallDetectorState,
  acc: AccelerationVector,
  nowMs: number
): { isFallSuspected: boolean; nextState: FallDetectorState } {
  if (acc.x === null || acc.y === null || acc.z === null) {
    return { isFallSuspected: false, nextState: state };
  }

  const mag = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
  let { freeFallStartTime, freeFallQualifiedTime } = state;

  let isFallSuspected = false;

  // 1. Check for free-fall condition (< 3 m/s^2)
  if (mag < FREE_FALL_THRESHOLD) {
    if (freeFallStartTime === null) {
      freeFallStartTime = nowMs;
    } else if (nowMs - freeFallStartTime >= FREE_FALL_MIN_DURATION_MS) {
      // Free-fall duration threshold satisfied
      freeFallQualifiedTime = nowMs;
    }
  } else {
    // Left free-fall condition
    freeFallStartTime = null;

    // 2. Check for impact spike condition (> 25 m/s^2 within 1s of qualified free-fall)
    if (mag >= IMPACT_SPIKE_THRESHOLD) {
      if (
        freeFallQualifiedTime !== null &&
        nowMs - freeFallQualifiedTime <= IMPACT_WINDOW_MS
      ) {
        isFallSuspected = true;
        // Reset after triggering
        freeFallQualifiedTime = null;
      }
    }
  }

  // Clear expired qualified free-fall if more than 1s passed
  if (
    freeFallQualifiedTime !== null &&
    nowMs - freeFallQualifiedTime > IMPACT_WINDOW_MS
  ) {
    freeFallQualifiedTime = null;
  }

  return {
    isFallSuspected,
    nextState: {
      freeFallStartTime,
      freeFallQualifiedTime,
      lastMagnitude: mag,
    },
  };
}

/**
 * Requests DeviceMotion permission on iOS 13+ devices.
 * Must be invoked in response to a user gesture (button click).
 */
export async function requestDeviceMotionPermission(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof window === "undefined") return "unsupported";

  const deviceMotionEvent = window.DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };

  if (typeof deviceMotionEvent?.requestPermission === "function") {
    try {
      const response = await deviceMotionEvent.requestPermission();
      return response === "granted" ? "granted" : "denied";
    } catch {
      return "denied";
    }
  }

  // For non-iOS modern browsers supporting DeviceMotionEvent without explicit permission call
  if ("DeviceMotionEvent" in window) {
    return "granted";
  }

  return "unsupported";
}

/**
 * Subscribes to window devicemotion events while in MONITORING state.
 * Returns an unsubscription function.
 */
export function subscribeToDeviceMotion(
  onFallSuspected: () => void,
  onMotionUpdate?: (magnitude: number) => void
): () => void {
  if (typeof window === "undefined" || !("DeviceMotionEvent" in window)) {
    return () => {};
  }

  let detectorState = createInitialDetectorState();

  const handleDeviceMotion = (event: DeviceMotionEvent) => {
    const acc = event.accelerationIncludingGravity || event.acceleration;
    if (!acc) return;

    const result = evaluateAccelerationSample(
      detectorState,
      { x: acc.x, y: acc.y, z: acc.z },
      Date.now()
    );

    detectorState = result.nextState;
    onMotionUpdate?.(detectorState.lastMagnitude);

    if (result.isFallSuspected) {
      onFallSuspected();
    }
  };

  window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });

  return () => {
    window.removeEventListener("devicemotion", handleDeviceMotion);
  };
}
