import { describe, it, expect } from "vitest";
import { routeIntent, normalizeBengali } from "./router";

describe("router - normalizeBengali", () => {
  it("removes punctuation, danda, and collapses whitespace", () => {
    expect(normalizeBengali("  আমার সামনে কী আছে?  ")).toBe("আমার সামনে কী আছে");
    expect(normalizeBengali("এটা পড়ে শোনাও।")).toBe(normalizeBengali("এটা পড়ে শোনাও"));
    expect(normalizeBengali("থামো, চুপ! বন্ধ করো...")).toBe("থামো চুপ বন্ধ করো");
  });
});

describe("router - routeIntent priority and matching", () => {
  // Five sample commands from prompt
  it("routes sample 1: 'আমার সামনে কী আছে?' -> describeSurroundings", () => {
    expect(routeIntent("আমার সামনে কী আছে?")).toBe("describeSurroundings");
  });

  it("routes sample 2: 'এটা পড়ে শোনাও।' -> readText", () => {
    expect(routeIntent("এটা পড়ে শোনাও।")).toBe("readText");
  });

  it("routes sample 3: 'এই মানুষটিকে কি চেনো?' -> recognizePerson", () => {
    expect(routeIntent("এই মানুষটিকে কি চেনো?")).toBe("recognizePerson");
  });

  it("routes sample 4: 'আমার লোকেশন দেখাও।' -> getLocation", () => {
    expect(routeIntent("আমার লোকেশন দেখাও।")).toBe("getLocation");
  });

  it("routes sample 5: 'সেফটি টেস্ট চালু করো।' -> safetyTest", () => {
    expect(routeIntent("সেফটি টেস্ট চালু করো।")).toBe("safetyTest");
  });

  // Priority check: "আমি পড়ে গেছি" must be safetyTest NOT readText
  it("routes 'আমি পড়ে গেছি' -> safetyTest (priority over readText)", () => {
    expect(routeIntent("আমি পড়ে গেছি")).toBe("safetyTest");
  });

  it("routes 'আমি পড়ে গেলাম' -> safetyTest", () => {
    expect(routeIntent("আমি পড়ে গেলাম")).toBe("safetyTest");
  });

  it("routes 'জরুরি সাহায্য প্রয়োজন' -> safetyTest", () => {
    expect(routeIntent("জরুরি সাহায্য প্রয়োজন")).toBe("safetyTest");
  });

  it("routes 'নিরাপত্তা ব্যবস্থা পরীক্ষা করো' -> safetyTest", () => {
    expect(routeIntent("নিরাপত্তা ব্যবস্থা পরীক্ষা করো")).toBe("safetyTest");
  });

  // Stop speaking commands
  it("routes 'থামো' -> stopSpeaking", () => {
    expect(routeIntent("থামো")).toBe("stopSpeaking");
  });

  it("routes 'এখন থামুন দয়া করে' -> stopSpeaking", () => {
    expect(routeIntent("এখন থামুন দয়া করে")).toBe("stopSpeaking");
  });

  it("routes 'চুপ' -> stopSpeaking", () => {
    expect(routeIntent("চুপ")).toBe("stopSpeaking");
  });

  it("routes 'কথা বন্ধ করো' -> stopSpeaking", () => {
    expect(routeIntent("কথা বন্ধ করো")).toBe("stopSpeaking");
  });

  // Repeat last commands
  it("routes 'আবার বলো' -> repeatLast", () => {
    expect(routeIntent("আবার বলো")).toBe("repeatLast");
  });

  it("routes 'কথাটি আবার বলুন' -> repeatLast", () => {
    expect(routeIntent("কথাটি আবার বলুন")).toBe("repeatLast");
  });

  it("routes 'পুনরায় বলুন' -> repeatLast", () => {
    expect(routeIntent("পুনরায় বলুন")).toBe("repeatLast");
  });

  // Location commands
  it("routes 'আমি কোথায় আছি?' -> getLocation", () => {
    expect(routeIntent("আমি কোথায় আছি?")).toBe("getLocation");
  });

  it("routes 'বর্তমান অবস্থান দেখাও' -> getLocation", () => {
    expect(routeIntent("বর্তমান অবস্থান দেখাও")).toBe("getLocation");
  });

  // Person recognition commands
  it("routes 'ইনি কে এটা বলো' -> recognizePerson", () => {
    expect(routeIntent("ইনি কে এটা বলো")).toBe("recognizePerson");
  });

  it("routes 'সামনের ব্যক্তিকে চিনতে পারছ?' -> recognizePerson", () => {
    expect(routeIntent("সামনের ব্যক্তিকে চিনতে পারছ?")).toBe("recognizePerson");
  });

  // Text reading commands
  it("routes 'কাগজের লেখা পড়ে দাও' -> readText", () => {
    expect(routeIntent("কাগজের লেখা পড়ে দাও")).toBe("readText");
  });

  it("routes 'বইটি পড়ো' -> readText", () => {
    expect(routeIntent("বইটি পড়ো")).toBe("readText");
  });

  it("routes 'এখানে কী লেখা আছে?' -> readText", () => {
    expect(routeIntent("এখানে কী লেখা আছে?")).toBe("readText");
  });

  // Surroundings commands
  it("routes 'চারপাশ দেখে বলো' -> describeSurroundings", () => {
    expect(routeIntent("চারপাশ দেখে বলো")).toBe("describeSurroundings");
  });

  it("routes 'আশেপাশে কী দেখতে পাচ্ছ?' -> describeSurroundings", () => {
    expect(routeIntent("আশেপাশে কী দেখতে পাচ্ছ?")).toBe("describeSurroundings");
  });

  // Walk With Me commands
  it("routes 'হাঁটার সঙ্গী চালু করো' -> walkWithMe", () => {
    expect(routeIntent("হাঁটার সঙ্গী চালু করো")).toBe("walkWithMe");
  });

  it("routes 'হাঁটা শুরু করো' -> walkWithMe", () => {
    expect(routeIntent("হাঁটা শুরু করো")).toBe("walkWithMe");
  });

  it("routes 'আমাকে পথ দেখাও' -> walkWithMe", () => {
    expect(routeIntent("আমাকে পথ দেখাও")).toBe("walkWithMe");
  });

  it("routes 'walk with me mode' -> walkWithMe", () => {
    expect(routeIntent("walk with me mode")).toBe("walkWithMe");
  });

  // Visual Q&A queries (medicine, money, visual inquiries)
  it("routes 'আমার হাতে কী ওষুধ?' -> askVision", () => {
    expect(routeIntent("আমার হাতে কী ওষুধ?")).toBe("askVision");
  });

  it("routes 'এই টাকার নোটটি কত?' -> askVision", () => {
    expect(routeIntent("এই টাকার নোটটি কত?")).toBe("askVision");
  });

  it("routes 'সামনের দৃশ্য বিস্তারিত ব্যাখ্যা করো' -> askVision", () => {
    expect(routeIntent("সামনের দৃশ্য বিস্তারিত ব্যাখ্যা করো")).toBe("askVision");
  });

  // Bangladeshi Currency & Wallet Counter queries
  it("routes 'আমার টাকা গোণো' -> readCurrency", () => {
    expect(routeIntent("আমার টাকা গোণো")).toBe("readCurrency");
  });

  it("routes 'টাকা চেনা শুরু করো' -> readCurrency", () => {
    expect(routeIntent("টাকা চেনা শুরু করো")).toBe("readCurrency");
  });

  it("routes 'টাকা স্ক্যান করো' -> readCurrency", () => {
    expect(routeIntent("টাকা স্ক্যান করো")).toBe("readCurrency");
  });

  it("routes 'মানিব্যাগে মোট টাকা কত আছে' -> readCurrency", () => {
    expect(routeIntent("মানিব্যাগে মোট টাকা কত আছে")).toBe("readCurrency");
  });

  // Gibberish and unknown cases
  it("routes gibberish 'asdkfjhsdf kjhsd' -> unknown", () => {
    expect(routeIntent("asdkfjhsdf kjhsd")).toBe("unknown");
  });

  it("routes unhandled query 'আজকের আবহাওয়া কেমন' -> unknown", () => {
    expect(routeIntent("আজকের আবহাওয়া কেমন")).toBe("unknown");
  });

  it("routes empty string -> unknown", () => {
    expect(routeIntent("")).toBe("unknown");
    expect(routeIntent("    ")).toBe("unknown");
  });
});
