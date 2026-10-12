/**
 * DRISHTI AI — Location Tool (getLocation)
 * Fetches current geographic coordinates on-device via navigator.geolocation.
 * Speaks accuracy area only without revealing raw numeric coordinates aloud.
 */

import { ToolResult } from "@/lib/types";
import { speak } from "@/lib/tools/speech";

export interface LocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number;
  mapsUrl: string;
}

/**
 * Gets the current location in the foreground.
 * Speaks: "আপনার অবস্থান পাওয়া গেছে, নির্ভুলতা প্রায় X মিটার"
 * Shows: Google Maps link and accuracy.
 */
export async function getCurrentLocation(): Promise<ToolResult> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    const errorMsg = "আপনার ডিভাইসে লোকেশন সেবা সমর্থিত নয় বা উপলব্ধ নেই।";
    speak(errorMsg);
    return {
      tool: "getLocation",
      status: "unavailable",
      source: "browser-api",
      message_bn: errorMsg,
      confidence: null,
    };
  }

  // Ensure execution only while in foreground
  if (typeof document !== "undefined" && document.visibilityState === "hidden") {
    const hiddenMsg = "অ্যাপটি ব্যাকগ্রাউন্ডে থাকায় লোকেশন গ্রহণ করা সম্ভব হয়নি।";
    speak(hiddenMsg);
    return {
      tool: "getLocation",
      status: "unavailable",
      source: "browser-api",
      message_bn: hiddenMsg,
      confidence: null,
    };
  }

  return new Promise<ToolResult>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        const roundedAccuracy = Math.round(accuracy);
        const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
        const bnAccuracy = String(roundedAccuracy).replace(
          /\d/g,
          (d) => ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"][Number(d)]
        );

        // As specified: Speak latitude/longitude area only as "আপনার অবস্থান পাওয়া গেছে, নির্ভুলতা প্রায় X মিটার"
        const speechText = `আপনার অবস্থান পাওয়া গেছে, নির্ভুলতা প্রায় ${bnAccuracy} মিটার`;
        speak(speechText);

        const displayText = `আপনার অবস্থান পাওয়া গেছে, নির্ভুলতা প্রায় ${bnAccuracy} মিটার।\nম্যাপ: ${mapsUrl}`;

        resolve({
          tool: "getLocation",
          status: "success",
          source: "browser-api",
          message_bn: displayText,
          detail: mapsUrl,
          confidence: 1.0,
        });
      },
      (error) => {
        let status: ToolResult["status"] = "error";
        let message_bn = "অবস্থান নির্ণয়ে সমস্যা হয়েছে।";

        switch (error.code) {
          case error.PERMISSION_DENIED:
            status = "permission_denied";
            message_bn = "অবস্থান জানার অনুমতি দেওয়া হয়নি। ব্রাউজার সেটিংসে অনুমতি দিন।";
            break;
          case error.POSITION_UNAVAILABLE:
            status = "unavailable";
            message_bn = "বর্তমান অবস্থান পাওয়া সম্ভব হয়নি।";
            break;
          case error.TIMEOUT:
            status = "error";
            message_bn = "অবস্থান নির্ণয়ের সময়সীমা পার হয়ে গেছে। পুনরায় চেষ্টা করুন।";
            break;
        }

        speak(message_bn);

        resolve({
          tool: "getLocation",
          status,
          source: "browser-api",
          message_bn,
          detail: error.message,
          confidence: null,
        });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  });
}
