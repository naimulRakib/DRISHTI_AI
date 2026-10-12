/**
 * DRISHTI AI — Offline Caching & Data Management Module
 * Manages Cache Storage prefetching, offline-ready verification, and complete data deletion.
 */

import { speak } from "@/lib/tools/speech";

export const CACHE_NAME = "drishti-cache-v2";
export const SETTINGS_KEY = "drishti.settings.v1";
export const MOCK_CONTACT_KEY = "drishti.mock_contact.v1";

export const OFFLINE_ASSET_MANIFEST: string[] = [
  "/",
  "/manifest.webmanifest",
  "/models/efficientdet_lite0.tflite",
  "/tessdata/ben.traineddata",
  "/tessdata/eng.traineddata",
  "/mediapipe/wasm/vision_wasm_internal.js",
  "/mediapipe/wasm/vision_wasm_internal.wasm",
  "/mediapipe/wasm/vision_wasm_nosimd_internal.js",
  "/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
  "/tesseract/worker.min.js",
  "/tesseract/tesseract-core.wasm.js",
  "/tesseract/tesseract-core.wasm",
  "/tesseract/tesseract-core-simd-lstm.wasm",
  "/tesseract/tesseract-core-lstm.wasm",
];

export interface AssetCacheResult {
  url: string;
  name: string;
  success: boolean;
  statusText: string;
}

export interface PrepareOfflineReport {
  overallSuccess: boolean;
  results: AssetCacheResult[];
}

/**
 * Fetches all essential AI models, wasm binaries, language data, and app shell files into Cache Storage.
 * Reports success or failure per file.
 * The app is only declared offline-ready if every single asset succeeds.
 */
export async function prepareOfflineAssets(
  onProgress?: (current: number, total: number, result: AssetCacheResult) => void
): Promise<PrepareOfflineReport> {
  const results: AssetCacheResult[] = [];

  if (typeof window === "undefined" || !("caches" in window)) {
    return {
      overallSuccess: false,
      results: [
        {
          url: "caches",
          name: "Cache Storage API",
          success: false,
          statusText: "ব্রাউজারে ক্যাশ স্টোরেজ সমর্থিত নয়",
        },
      ],
    };
  }

  try {
    const cache = await caches.open(CACHE_NAME);

    for (let i = 0; i < OFFLINE_ASSET_MANIFEST.length; i++) {
      const url = OFFLINE_ASSET_MANIFEST[i];
      const filename = url.split("/").pop() || url;

      try {
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          const contentType = response.headers.get("content-type") || "application/octet-stream";
          const cachedResponse = new Response(blob, {
            status: response.status,
            statusText: response.statusText,
            headers: {
              "Content-Type": contentType,
            },
          });
          await cache.put(url, cachedResponse);
          const itemResult: AssetCacheResult = {
            url,
            name: filename,
            success: true,
            statusText: "সংরক্ষিত (Cached)",
          };
          results.push(itemResult);
          onProgress?.(i + 1, OFFLINE_ASSET_MANIFEST.length, itemResult);
        } else {
          const itemResult: AssetCacheResult = {
            url,
            name: filename,
            success: false,
            statusText: `ব্যর্থ (HTTP ${response.status})`,
          };
          results.push(itemResult);
          onProgress?.(i + 1, OFFLINE_ASSET_MANIFEST.length, itemResult);
        }
      } catch (fetchErr) {
        const itemResult: AssetCacheResult = {
          url,
          name: filename,
          success: false,
          statusText: `ডাউনলোড ত্রুটি: ${fetchErr instanceof Error ? fetchErr.message : "Network error"}`,
        };
        results.push(itemResult);
        onProgress?.(i + 1, OFFLINE_ASSET_MANIFEST.length, itemResult);
      }
    }

    const overallSuccess = results.every((r) => r.success);
    return {
      overallSuccess,
      results,
    };
  } catch (err) {
    return {
      overallSuccess: false,
      results: [
        {
          url: CACHE_NAME,
          name: "Cache Opening",
          success: false,
          statusText: err instanceof Error ? err.message : "Cache failure",
        },
      ],
    };
  }
}

/**
 * Verifies if all essential offline assets are present in Cache Storage.
 */
export async function checkOfflineReadiness(): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) {
    return false;
  }

  try {
    const cache = await caches.open(CACHE_NAME);
    for (const url of OFFLINE_ASSET_MANIFEST) {
      const match = await cache.match(url);
      if (!match) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * "Delete my data" flow:
 * 1. Clears drishti.settings.v1 from localStorage.
 * 2. Clears the mock contact.
 * 3. Clears all Cache Storage entries created by this app.
 * 4. Confirms by speech and text.
 */
export async function deleteMyData(): Promise<{ success: boolean; messageBn: string }> {
  try {
    // 1. Clear settings
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(SETTINGS_KEY);
      localStorage.removeItem(MOCK_CONTACT_KEY);
    }

    // 2. Clear all cache storages
    if (typeof caches !== "undefined") {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (key.includes("drishti")) {
            return caches.delete(key);
          }
        })
      );
    }

    const confirmMsg = "আপনার সমস্ত সংরক্ষিত সেটিংস, মক যোগাযোগ ও অফলাইন ক্যাশ ডেটা সম্পূর্ণ মুছে ফেলা হয়েছে।";
    speak(confirmMsg);

    return {
      success: true,
      messageBn: confirmMsg,
    };
  } catch (err) {
    const errorMsg = "ডেটা মুছতে সমস্যা হয়েছে।";
    speak(errorMsg);
    return {
      success: false,
      messageBn: `ডেটা মোছা অসম্পূর্ণ: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
