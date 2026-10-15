import { ToolName } from "@/lib/types";

/**
 * Normalizes Bengali and Latin text by trimming, stripping punctuation (including danda),
 * normalizing composite unicode characters, and collapsing whitespace.
 */
export function normalizeBengali(text: string): string {
  if (!text) return "";

  return text
    // Normalize Unicode (combining marks / decomposed characters)
    .normalize("NFC")
    // Remove punctuation: Bengali danda (।), double danda (॥), period (.), commas, question marks, etc.
    .replace(/[।॥.,?!:;"'()—\-[\]{}<>/\\`~@#$%^&*+=_|]/g, " ")
    // Collapse multiple whitespace characters into single space
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

interface IntentPattern {
  tool: ToolName;
  keywords: string[];
}

/**
 * Priority order for matching intents.
 * 1. stopSpeaking
 * 2. repeatLast
 * 3. safetyTest (checked before readText so "পড়ে গেছি" triggers fall/safety, not reading)
 * 4. getLocation
 * 5. recognizePerson
 * 6. readText
 * 7. describeSurroundings
 */
const INTENT_PATTERNS: IntentPattern[] = [
  {
    tool: "stopSpeaking",
    keywords: ["থামো", "থামুন", "চুপ", "বন্ধ করো", "stop"],
  },
  {
    tool: "repeatLast",
    keywords: ["আবার বলো", "আবার বলুন", "পুনরায়", "পুনরায়", "repeat"],
  },
  {
    tool: "safetyTest",
    keywords: [
      "পড়ে গেছি",
      "পড়ে গেছি",
      "পড়ে গেলাম",
      "পড়ে গেলাম",
      "পতন",
      "fall",
      "সেফটি",
      "নিরাপত্তা",
      "জরুরি",
      "জরুরী",
      "সাহায্য",
      "help",
      "emergency",
    ],
  },
  {
    tool: "askVision",
    keywords: [
      "এই টাকার নোট",
      "ওষুধ",
      "ঔষধ",
      "রং",
      "রঙ",
      "কী রঙের",
      "কি রঙের",
      "ব্যাখ্যা করো",
      "ব্যাখ্যা",
      "বিস্তারিত",
      "প্রশ্ন",
      "জিজ্ঞাসা",
    ],
  },
  {
    tool: "readCurrency",
    keywords: [
      "টাকা সনাক্ত করো",
      "টাকা সনাক্ত",
      "টাকা শনাক্ত করো",
      "টাকা শনাক্ত",
      "টাকা চেনো",
      "টাকা চেনা",
      "নোট চেনা",
      "নোট কত",
      "টাকা স্ক্যান",
      "টাকা গোণো",
      "টাকা গোনো",
      "টাকা গোনা",
      "টাকা গণনা",
      "মানিব্যাগ",
      "মোট টাকা",
      "টাকা কত",
      "taka sonakto koro",
      "taka sonakto",
      "currency",
      "banknote",
    ],
  },
  {
    tool: "walkWithMe",
    keywords: [
      "পথচলা শুরু করো",
      "পথচলা শুরু",
      "পথচলা",
      "পথ চলো",
      "হাঁটার সঙ্গী",
      "হাঁটা শুরু",
      "হাঁটবো",
      "নেভিগেশন",
      "পথ দেখাও",
      "চলো হাঁটি",
      "pothcola shuru koro",
      "pothcola shuru",
      "pothcola",
      "pothchola",
      "walk with me",
      "walk",
    ],
  },
  {
    tool: "echolocationRadar",
    keywords: [
      "রাডার অন করো",
      "রাডার অন",
      "রাডার চালু",
      "রাডার",
      "radar on",
      "radar",
      "বাধা রাডার",
      "বাধা মাপো",
      "বাধা নির্ণয়",
      "বাধা নির্ণয়",
      "শব্দে বাধা",
      "সোনার",
      "শব্দ নির্দেশিকা",
      "ইকোলোকেশন",
      "echolocation",
      "sonar",
    ],
  },
  {
    tool: "recognizePerson",
    keywords: [
      "ফেস চিনতে সাহায্য করো",
      "ফেস চিনতে সাহায্য",
      "ফেস চিনতে",
      "ফেস চেনো",
      "ফেস",
      "face cinte help kro",
      "face cinte help",
      "face cinte",
      "face",
      "চেহারা চিনতে",
      "চেহারা",
      "মুখ চিনতে",
      "পরিচিত মুখ",
      "পরিচিত মানুষ",
      "কে এটা",
      "কে ইনি",
      "চেনো",
      "চিনতে",
      "মানুষ চিনতে",
    ],
  },
  {
    tool: "checkSafeZone",
    keywords: [
      "নিরাপদ এলাকা",
      "নিরাপদ সীমানা",
      "সেফ জোন",
      "সেফজোন",
      "সীমানা",
      "আমি কি নিরাপদে আছি",
      "নিরাপদ জায়গায় আছি",
      "নিরাপদ জায়গায় আছি",
      "safe zone",
      "geofence",
    ],
  },
  {
    tool: "getLocation",
    keywords: ["লোকেশন", "অবস্থান", "কোথায় আছি", "কোথায় আছি", "location", "gps"],
  },
  {
    tool: "readText",
    keywords: [
      "পড়ে শোনাও",
      "পড়ে শোনাও",
      "পড়ো",
      "পড়ো",
      "পড়ে দাও",
      "পড়ে দাও",
      "লেখা",
      "কী লেখা",
      "কি লেখা",
      "ocr",
      "read text",
    ],
  },
  {
    tool: "describeSurroundings",
    keywords: ["সামনে", "কী আছে", "কি আছে", "চারপাশ", "আশেপাশ", "বস্তু", "object"],
  },
];

/**
 * Pure function: takes raw Bengali text and returns the matched ToolName based on priority rules.
 * Returns "unknown" if no pattern matches.
 */
export function routeIntent(textBn: string): ToolName {
  const normalized = normalizeBengali(textBn);
  if (!normalized) {
    return "unknown";
  }

  for (const { tool, keywords } of INTENT_PATTERNS) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeBengali(keyword);
      if (normalized.includes(normalizedKeyword)) {
        return tool;
      }
    }
  }

  return "unknown";
}
