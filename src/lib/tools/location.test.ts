import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentLocation } from "./location";
import { toolRegistry } from "./registry";

describe("Location Tool (getLocation)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("handles missing navigator.geolocation gracefully", async () => {
    const originalGeolocation = navigator.geolocation;
    // @ts-expect-error Mocking missing geolocation
    delete navigator.geolocation;

    const result = await getCurrentLocation();
    expect(result.status).toBe("unavailable");
    expect(result.source).toBe("browser-api");
    expect(result.message_bn).toContain("লোকেশন সেবা সমর্থিত নয়");

    // Restore
    Object.defineProperty(navigator, "geolocation", {
      value: originalGeolocation,
      configurable: true,
      writable: true,
    });
  });

  it("returns Google Maps URL and accuracy in detail when position is found", async () => {
    const mockCoords = {
      latitude: 23.7266,
      longitude: 90.3888,
      accuracy: 15.4,
    };

    const mockGeolocation = {
      getCurrentPosition: vi.fn((success) => {
        success({
          coords: mockCoords,
          timestamp: Date.now(),
        });
      }),
    };

    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      configurable: true,
      writable: true,
    });

    const result = await getCurrentLocation();
    expect(result.status).toBe("success");
    expect(result.source).toBe("browser-api");
    expect(result.detail).toBe("https://www.google.com/maps?q=23.7266,90.3888");
    expect(result.message_bn).toContain("১৫ মিটার");
  });

  it("handles permission denied error", async () => {
    const mockGeolocation = {
      getCurrentPosition: vi.fn((_, error) => {
        error({
          code: 1, // PERMISSION_DENIED
          message: "User denied Geolocation",
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
      }),
    };

    Object.defineProperty(navigator, "geolocation", {
      value: mockGeolocation,
      configurable: true,
      writable: true,
    });

    const result = await getCurrentLocation();
    expect(result.status).toBe("permission_denied");
    expect(result.message_bn).toContain("অনুমতি দেওয়া হয়নি");
  });
});

describe("Tool Registry Status for Part 8", () => {
  it("marks getLocation as LIVE in toolRegistry", () => {
    expect(toolRegistry.getLocation.status).toBe("LIVE");
  });

  it("marks safetyTest as LIVE in toolRegistry", () => {
    expect(toolRegistry.safetyTest.status).toBe("LIVE");
  });
});
