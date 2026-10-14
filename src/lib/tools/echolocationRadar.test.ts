import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateSpatialObstacle,
  formatClockDirectionBn,
  toBengaliNumeral,
  scanEcholocationRadar,
} from "./echolocationRadar";
import { echolocationEngine } from "@/lib/audio/echolocationEngine";

// Mock speech, haptic, and objects detector
vi.mock("@/lib/tools/speech", () => ({
  speak: vi.fn(),
}));

vi.mock("@/lib/native/bridge", () => ({
  triggerHaptic: vi.fn(),
}));

vi.mock("@/lib/tools/objects", () => ({
  getOrInitDetector: vi.fn().mockRejectedValue(new Error("No detector in test")),
}));

describe("echolocationEngine - Acoustic Frequency & Intervals", () => {
  it("calculates higher pitch frequency for closer objects", () => {
    const freqClose = echolocationEngine.calculateFrequency(0.5);
    const freqFar = echolocationEngine.calculateFrequency(3.5);

    expect(freqClose).toBeGreaterThan(freqFar);
    expect(freqClose).toBeGreaterThan(1000);
    expect(freqFar).toBeLessThan(600);
  });

  it("applies elevation harmonics to frequency", () => {
    const mid = echolocationEngine.calculateFrequency(1.5, "mid");
    const high = echolocationEngine.calculateFrequency(1.5, "high");
    const low = echolocationEngine.calculateFrequency(1.5, "low");

    expect(high).toBeGreaterThan(mid);
    expect(low).toBeLessThan(mid);
  });

  it("calculates rapid repetition interval for close obstacles", () => {
    const fastInterval = echolocationEngine.calculatePulseInterval(0.3);
    const slowInterval = echolocationEngine.calculatePulseInterval(3.8);

    expect(fastInterval).toBeLessThanOrEqual(120); // ~90ms
    expect(slowInterval).toBeGreaterThan(700); // ~800ms
  });
});

describe("echolocationRadar - Spatial Vector Geometry", () => {
  const FRAME_WIDTH = 640;
  const FRAME_HEIGHT = 480;

  it("identifies direct center obstacle at 12 o'clock", () => {
    const obstacle = calculateSpatialObstacle(
      { originX: 270, originY: 150, width: 100, height: 180 },
      FRAME_WIDTH,
      FRAME_HEIGHT,
      "chair",
      "চেয়ার"
    );

    expect(obstacle.clockHour).toBe(12);
    expect(Math.abs(obstacle.pan)).toBeLessThan(0.15);
    expect(obstacle.elevation).toBe("mid");
  });

  it("identifies left-side obstacle panned to the left", () => {
    const obstacle = calculateSpatialObstacle(
      { originX: 20, originY: 150, width: 80, height: 160 },
      FRAME_WIDTH,
      FRAME_HEIGHT,
      "person",
      "মানুষ"
    );

    expect(obstacle.pan).toBeLessThan(-0.5);
    expect([9, 10]).toContain(obstacle.clockHour);
  });

  it("identifies right-side obstacle panned to the right", () => {
    const obstacle = calculateSpatialObstacle(
      { originX: 520, originY: 150, width: 90, height: 160 },
      FRAME_WIDTH,
      FRAME_HEIGHT,
      "car",
      "গাড়ি"
    );

    expect(obstacle.pan).toBeGreaterThan(0.5);
    expect([2, 3]).toContain(obstacle.clockHour);
  });

  it("classifies high overhead hazards (tree branches / awnings)", () => {
    const obstacle = calculateSpatialObstacle(
      { originX: 250, originY: 20, width: 140, height: 60 },
      FRAME_WIDTH,
      FRAME_HEIGHT,
      "branch",
      "গাছের ডাল"
    );

    expect(obstacle.elevation).toBe("high");
  });

  it("classifies low ground hazards (curbs / steps / trip hazards)", () => {
    const obstacle = calculateSpatialObstacle(
      { originX: 250, originY: 380, width: 140, height: 80 },
      FRAME_WIDTH,
      FRAME_HEIGHT,
      "step",
      "সিঁড়ি বা বাধা"
    );

    expect(obstacle.elevation).toBe("low");
  });

  it("marks large coverage area as critical threat", () => {
    // Large object covering 60%+ of frame
    const obstacle = calculateSpatialObstacle(
      { originX: 100, originY: 50, width: 440, height: 380 },
      FRAME_WIDTH,
      FRAME_HEIGHT,
      "wall",
      "দেয়াল"
    );

    expect(obstacle.distanceMeters).toBeLessThan(1.0);
    expect(obstacle.threatLevel).toBe("critical");
  });
});

describe("echolocationRadar - Clock Directions & Numerals", () => {
  it("formats clock face directions into natural Bengali text", () => {
    expect(formatClockDirectionBn(12)).toBe("সরাসরি সামনে (১২ টা)");
    expect(formatClockDirectionBn(9)).toBe("বাম পাশে (৯ টা)");
    expect(formatClockDirectionBn(3)).toBe("ডান পাশে (৩ টা)");
    expect(formatClockDirectionBn(10)).toBe("সামনে কিছুটা বামে (১০ টা)");
    expect(formatClockDirectionBn(2)).toBe("সামনে কিছুটা ডানে (২ টা)");
  });

  it("converts numerals to Bengali script", () => {
    expect(toBengaliNumeral(12)).toBe("১২");
    expect(toBengaliNumeral("1.5")).toBe("১.৫");
  });
});

describe("echolocationRadar - scanEcholocationRadar Tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns clear path when no visual feed or no obstacle detected", async () => {
    const result = await scanEcholocationRadar();

    expect(result.tool).toBe("echolocationRadar");
    expect(result.status).toBe("success");
    expect(result.message_bn).toContain("পথ পরিষ্কার");
  });
});
