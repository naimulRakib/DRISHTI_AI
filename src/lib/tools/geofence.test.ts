import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  calculateDistanceMeters,
  toBengaliDigits,
  evaluateSafeZones,
  addSafeZone,
  updateSafeZone,
  deleteSafeZone,
  resetSafeZones,
  getSafeZones,
} from "../storage/geofenceStore";
import { checkSafeZone } from "./geofence";

// Mock bridge and speech
vi.mock("@/lib/tools/speech", () => ({
  speak: vi.fn(),
}));

vi.mock("@/lib/native/bridge", () => ({
  triggerGeofenceAlert: vi.fn(),
  triggerHaptic: vi.fn(),
}));

describe("geofenceStore - Distance & Math", () => {
  it("returns 0 meters for identical coordinates", () => {
    expect(calculateDistanceMeters(23.8103, 90.4125, 23.8103, 90.4125)).toBe(0);
  });

  it("calculates accurate metric distance between Dhaka and Chittagong (~200-220 km)", () => {
    // Dhaka ~ 23.8103, 90.4125; Chittagong ~ 22.3569, 91.7832
    const dist = calculateDistanceMeters(23.8103, 90.4125, 22.3569, 91.7832);
    expect(dist).toBeGreaterThan(200000);
    expect(dist).toBeLessThan(230000);
  });

  it("calculates small micro-distances (e.g. ~110m for ~0.001 deg difference)", () => {
    const dist = calculateDistanceMeters(23.8103, 90.4125, 23.8113, 90.4125);
    expect(dist).toBeGreaterThan(90);
    expect(dist).toBeLessThan(130);
  });

  it("converts numbers to Bengali glyphs", () => {
    expect(toBengaliDigits(150)).toBe("১৫০");
    expect(toBengaliDigits("0123456789")).toBe("০১২৩৪৫৬৭৮৯");
  });
});

describe("geofenceStore - Evaluation & Boundaries", () => {
  beforeEach(() => {
    resetSafeZones();
  });

  it("identifies user as SAFE when inside zone radius", () => {
    // Home is at 23.8103, 90.4125 with radius 150m
    const evalResult = evaluateSafeZones(23.8103, 90.4125);
    expect(evalResult.isSafe).toBe(true);
    expect(evalResult.matchingZone?.id).toBe("zone-home");
    expect(evalResult.spokenSummaryBn).toContain("আপনি নিরাপদ এলাকার ভিতরে আছেন");
  });

  it("identifies user as BREACHED when outside zone radius", () => {
    // Coordinate ~500m away from Home
    const evalResult = evaluateSafeZones(23.8150, 90.4125);
    expect(evalResult.isSafe).toBe(false);
    expect(evalResult.nearestZone?.zone.id).toBe("zone-home");
    expect(evalResult.spokenSummaryBn).toContain("সতর্কতা! আপনি নিরাপদ এলাকা অতিক্রম করেছেন");
  });

  it("evaluates safe when all safe zones are deactivated", () => {
    const zones = getSafeZones();
    zones.forEach((z) => updateSafeZone(z.id, { isActive: false }));

    const evalResult = evaluateSafeZones(24.0, 91.0);
    expect(evalResult.isSafe).toBe(true);
    expect(evalResult.activeZoneCount).toBe(0);
  });
});

describe("geofenceStore - CRUD operations", () => {
  beforeEach(() => {
    resetSafeZones();
  });

  it("adds, updates and deletes a custom safe zone", () => {
    const added = addSafeZone({
      name: "অফিস (Office)",
      lat: 23.7925,
      lng: 90.4078,
      radiusMeters: 80,
      isActive: true,
    });

    expect(added.id).toBeDefined();
    expect(getSafeZones().some((z) => z.id === added.id)).toBe(true);

    updateSafeZone(added.id, { radiusMeters: 200 });
    const updated = getSafeZones().find((z) => z.id === added.id);
    expect(updated?.radiusMeters).toBe(200);

    deleteSafeZone(added.id);
    expect(getSafeZones().some((z) => z.id === added.id)).toBe(false);
  });
});

describe("checkSafeZone Tool", () => {
  beforeEach(() => {
    resetSafeZones();
    vi.clearAllMocks();
  });

  it("returns success and safe status when inside perimeter", async () => {
    const result = await checkSafeZone({ lat: 23.8103, lng: 90.4125 });
    expect(result.tool).toBe("checkSafeZone");
    expect(result.status).toBe("success");
    expect(result.message_bn).toContain("আপনি নিরাপদ এলাকার ভিতরে আছেন");
  });

  it("triggers emergency geofence alert when outside perimeter", async () => {
    const { triggerGeofenceAlert } = await import("@/lib/native/bridge");
    const result = await checkSafeZone({ lat: 23.8200, lng: 90.4125 });

    expect(result.tool).toBe("checkSafeZone");
    expect(result.status).toBe("success");
    expect(result.message_bn).toContain("সতর্কতা! আপনি নিরাপদ এলাকা অতিক্রম করেছেন");
    expect(triggerGeofenceAlert).toHaveBeenCalled();
  });
});
