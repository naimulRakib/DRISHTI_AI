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
    keywords: ["থামো", "থামুন", "চুপ", "বন্ধ করো"],
  },
  {
    tool: "repeatLast",
    keywords: ["আবার বলো", "আবার বলুন", "পুনরায়", "পুনরায়"],
  },
  {
    tool: "safetyTest",
    keywords: [
      "সেফটি",
      "নিরাপত্তা",
      "পড়ে গেছি",
      "পড়ে গেছি",
      "পড়ে গেলাম",
      "পড়ে গেলাম",
      "জরুরি",
      "জরুরী",
      "সাহায্য",
    ],
  },
  {
    tool: "getLocation",
    keywords: ["লোকেশন", "অবস্থান", "কোথায় আছি", "কোথায় আছি"],
  },
  {
    tool: "walkWithMe",
    keywords: [
      "হাঁটার সঙ্গী",
      "হাঁটা শুরু",
      "হাঁটবো",
      "নেভিগেশন",
      "পথ দেখাও",
      "walk with me",
    ],
  },
  {
    tool: "recognizePerson",
    keywords: ["চেনো", "চিনতে", "কে এটা", "কে ইনি"],
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
    ],
  },
  {
    tool: "askVision",
    keywords: [
      "ওষুধ",
      "ঔষধ",
      "টাকা",
      "নোট",
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
    tool: "describeSurroundings",
    keywords: ["সামনে", "কী আছে", "কি আছে", "চারপাশ", "আশেপাশ"],
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
