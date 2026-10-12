import { describe, it, expect } from "vitest";
import {
  evaluateAccelerationSample,
  createInitialDetectorState,
  FREE_FALL_THRESHOLD,
  FREE_FALL_MIN_DURATION_MS,
  IMPACT_SPIKE_THRESHOLD,
  IMPACT_WINDOW_MS,
} from "./fallDetection";

describe("Fall Detection Heuristic", () => {
  it("has expected named threshold constants", () => {
    expect(FREE_FALL_THRESHOLD).toBe(3.0);
    expect(FREE_FALL_MIN_DURATION_MS).toBe(100);
    expect(IMPACT_SPIKE_THRESHOLD).toBe(25.0);
    expect(IMPACT_WINDOW_MS).toBe(1000);
  });

  it("does not trigger on normal resting gravity (9.8 m/s^2)", () => {
    const state = createInitialDetectorState();
    const result = evaluateAccelerationSample(
      state,
      { x: 0, y: 9.8, z: 0 },
      1000
    );
    expect(result.isFallSuspected).toBe(false);
  });

  it("does not trigger on sudden impact without prior free fall", () => {
    const state = createInitialDetectorState();
    // High impact (e.g. 30 m/s^2)
    const result = evaluateAccelerationSample(
      state,
      { x: 0, y: 30.0, z: 0 },
      1000
    );
    expect(result.isFallSuspected).toBe(false);
  });

  it("does not trigger if free fall is shorter than 100 ms", () => {
    let state = createInitialDetectorState();

    // Free fall starts at t = 1000ms (< 3 m/s^2)
    const s1 = evaluateAccelerationSample(state, { x: 0, y: 1.0, z: 0 }, 1000);
    state = s1.nextState;

    // Free fall at t = 1050ms (only 50ms elapsed)
    const s2 = evaluateAccelerationSample(state, { x: 0, y: 1.0, z: 0 }, 1050);
    state = s2.nextState;

    // Sudden spike at t = 1080ms
    const s3 = evaluateAccelerationSample(state, { x: 0, y: 28.0, z: 0 }, 1080);
    expect(s3.isFallSuspected).toBe(false);
  });

  it("triggers FALL_SUSPECTED on free fall >= 100ms followed within 1s by spike >= 25 m/s^2", () => {
    let state = createInitialDetectorState();

    // Free fall start at t = 1000ms
    const s1 = evaluateAccelerationSample(state, { x: 0, y: 1.2, z: 0 }, 1000);
    state = s1.nextState;
    expect(s1.isFallSuspected).toBe(false);

    // Free fall continuing at t = 1120ms (120ms >= 100ms)
    const s2 = evaluateAccelerationSample(state, { x: 0, y: 1.0, z: 0 }, 1120);
    state = s2.nextState;
    expect(s2.isFallSuspected).toBe(false);

    // Impact spike at t = 1350ms (230ms after free fall qualification, < 1000ms window)
    const s3 = evaluateAccelerationSample(state, { x: 0, y: 27.5, z: 0 }, 1350);
    expect(s3.isFallSuspected).toBe(true);
  });

  it("does not trigger if impact occurs after 1000ms window has expired", () => {
    let state = createInitialDetectorState();

    // Free fall for 120ms
    state = evaluateAccelerationSample(state, { x: 0, y: 1.0, z: 0 }, 1000).nextState;
    state = evaluateAccelerationSample(state, { x: 0, y: 1.0, z: 0 }, 1120).nextState;

    // Normal movement in between
    state = evaluateAccelerationSample(state, { x: 0, y: 9.8, z: 0 }, 1500).nextState;

    // Impact spike at t = 2200ms (> 1000ms after free fall)
    const sSpike = evaluateAccelerationSample(state, { x: 0, y: 29.0, z: 0 }, 2200);
    expect(sSpike.isFallSuspected).toBe(false);
  });
});
