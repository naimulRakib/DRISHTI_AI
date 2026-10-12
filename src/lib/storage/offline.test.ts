import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OFFLINE_ASSET_MANIFEST,
  CACHE_NAME,
  SETTINGS_KEY,
  MOCK_CONTACT_KEY,
  deleteMyData,
  checkOfflineReadiness,
} from "./offline";

describe("Offline Caching Manifest", () => {
  it("includes all critical models, language data, wasm, and app shell", () => {
    expect(OFFLINE_ASSET_MANIFEST).toContain("/");
    expect(OFFLINE_ASSET_MANIFEST).toContain("/manifest.webmanifest");
    expect(OFFLINE_ASSET_MANIFEST).toContain("/models/efficientdet_lite0.tflite");
    expect(OFFLINE_ASSET_MANIFEST).toContain("/tessdata/ben.traineddata");
    expect(OFFLINE_ASSET_MANIFEST).toContain("/tessdata/eng.traineddata");
    expect(OFFLINE_ASSET_MANIFEST).toContain("/mediapipe/wasm/vision_wasm_internal.wasm");
    expect(OFFLINE_ASSET_MANIFEST).toContain("/tesseract/worker.min.js");
  });
});

describe("Data Deletion (deleteMyData)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("removes settings and mock contact from localStorage and clears caches", async () => {
    const removeItemMock = vi.fn();
    Object.defineProperty(global, "localStorage", {
      value: {
        removeItem: removeItemMock,
        getItem: vi.fn(),
        setItem: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    const deleteCacheMock = vi.fn().mockResolvedValue(true);
    const mockCaches = {
      keys: vi.fn().mockResolvedValue([CACHE_NAME, "other-cache"]),
      delete: deleteCacheMock,
      open: vi.fn(),
      match: vi.fn(),
    };

    Object.defineProperty(global, "caches", {
      value: mockCaches,
      configurable: true,
      writable: true,
    });

    const result = await deleteMyData();
    expect(result.success).toBe(true);
    expect(removeItemMock).toHaveBeenCalledWith(SETTINGS_KEY);
    expect(removeItemMock).toHaveBeenCalledWith(MOCK_CONTACT_KEY);
    expect(deleteCacheMock).toHaveBeenCalledWith(CACHE_NAME);
    expect(result.messageBn).toContain("মুছে ফেলা হয়েছে");
  });
});

describe("checkOfflineReadiness", () => {
  it("returns false if cache does not contain all manifest assets", async () => {
    const mockCaches = {
      open: vi.fn().mockResolvedValue({
        match: vi.fn().mockResolvedValue(null),
      }),
    };

    Object.defineProperty(global, "caches", {
      value: mockCaches,
      configurable: true,
      writable: true,
    });

    const isReady = await checkOfflineReadiness();
    expect(isReady).toBe(false);
  });
});
