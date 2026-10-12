import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizeSpeechText,
  synthesizeLocalBengaliAnswer,
  askVisualQuestion,
} from "./visualQa";

describe("Multimodal Visual Q&A Assistant", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Text Sanitization for Bengali Speech", () => {
    it("removes markdown asterisks, backticks, and headers", () => {
      const markdown = "**প্যারাসিটামল ৫০০ মিগ্রা** # নির্দেশাবলী: দিনে `২ বার` সেব্য।";
      const clean = sanitizeSpeechText(markdown);
      expect(clean).toBe("প্যারাসিটামল ৫০০ মিগ্রা নির্দেশাবলী: দিনে ২ বার সেব্য।");
      expect(clean).not.toContain("*");
      expect(clean).not.toContain("`");
      expect(clean).not.toContain("#");
    });

    it("removes raw URLs from spoken text", () => {
      const text = "বিস্তারিত দেখুন https://example.com/meds সাইটে";
      const clean = sanitizeSpeechText(text);
      expect(clean).toBe("বিস্তারিত দেখুন সাইটে");
    });
  });

  describe("Local On-Device Question Synthesis", () => {
    it("answers medicine questions by parsing drug name and appending advisory", () => {
      const question = "আমার হাতে থাকা ওষুধের নাম কী?";
      const objects = "একটি বোতল";
      const ocr = "Napa Extra 500mg Paracetamol";

      const answer = synthesizeLocalBengaliAnswer(question, objects, ocr);

      expect(answer).toContain("ঔষধের প্যাকেটে লেখা রয়েছে: Napa Extra 500mg Paracetamol");
      expect(answer).toContain("চিকিৎসকের সাথে নিশ্চিত করুন");
    });

    it("answers currency questions by identifying banknote denomination", () => {
      const question = "এই টাকার নোটটি কত টাকার?";
      const objects = "একটি কাগজ";
      const ocr = "বাংলাদেশ ব্যাংক ৫০০ টাকা 500";

      const answer = synthesizeLocalBengaliAnswer(question, objects, ocr);

      expect(answer).toContain("চিহ্নিত হয়েছে ৫০০ টাকার নোট");
    });

    it("combines detected surroundings and text for general queries", () => {
      const question = "সামনের পরিবেশ ব্যাখ্যা করো";
      const objects = "বামে একটি চেয়ার এবং ডানে একটি টেবিল";
      const ocr = "ডাক্তারের চেম্বার";

      const answer = synthesizeLocalBengaliAnswer(question, objects, ocr);

      expect(answer).toContain("সামনে বামে একটি চেয়ার এবং ডানে একটি টেবিল দেখতে পাচ্ছি");
      expect(answer).toContain("লেখা রয়েছে: ডাক্তারের চেম্বার");
    });

    it("handles empty or illegible scenes with clear Bengali instruction", () => {
      const question = "এখানে কী আছে?";
      const objects = "কিছু চিনতে পারিনি";
      const ocr = "কোনো লেখা সনাক্ত হয়নি";

      const answer = synthesizeLocalBengaliAnswer(question, objects, ocr);

      expect(answer).toContain("স্পষ্ট তথ্য পাওয়া যায়নি");
      expect(answer).toContain("আরেকটু কাছে নিয়ে আবার চেষ্টা করুন");
    });
  });

  describe("Error Handling", () => {
    it("returns error result gracefully when no image source is provided", async () => {
      const res = await askVisualQuestion({});

      expect(res.tool).toBe("askVision");
      expect(res.status).toBe("error");
      expect(res.message_bn).toContain("প্রশ্ন করার জন্য ক্যামেরা চালু করা বা ছবি দেওয়া আবশ্যক");
    });
  });
});
