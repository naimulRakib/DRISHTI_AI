import { describe, it, expect } from "vitest";
import { splitTextIntoChunks } from "@/lib/tools/speech";
import { calculateAverageWordConfidence } from "@/lib/tools/ocr";
import { toolRegistry } from "@/lib/tools/registry";

describe("OCR Text Chunking (splitTextIntoChunks)", () => {
  it("returns an empty array for empty or whitespace-only text", () => {
    expect(splitTextIntoChunks("")).toEqual([]);
    expect(splitTextIntoChunks("   ")).toEqual([]);
  });

  it("keeps text <= 300 characters in a single chunk", () => {
    const text = "দৃষ্টি একটি স্থানীয় বাংলা এআই প্ল্যাটফর্ম।";
    const chunks = splitTextIntoChunks(text, 300);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text);
  });

  it("splits text longer than 300 characters into chunks of at most 300 characters", () => {
    const longText =
      "দৃষ্টি এআই প্ল্যাটফর্মের প্রধান বৈশিষ্ট্য হল এটি সম্পূর্ণ স্থানীয়ভাবে কাজ করে। কোনো তথ্য ক্লাউড সার্ভারে পাঠানো হয় না। " +
      "ব্যবহারকারীর সমস্ত ব্যক্তিগত তথ্য ডিভাইসেই সুরক্ষিত থাকে। অন্ধ ও দৃষ্টিপ্রতিবন্ধী মানুষের জন্য এটি সম্পূর্ণ নিরাপদ ও স্বাধীনভাবে চলাচলের সুযোগ সৃষ্টি করে। " +
      "ক্যামেরা ব্যবহারের সময় প্রতিটি ফ্রেম ডিভাইসের প্রসেসরে প্রক্রিয়াজাত হয়। এমনকি ইন্টারনেট সংযোগ সম্পূর্ণ বন্ধ থাকলেও সমস্ত কাজ নির্বিঘ্নে সম্পন্ন হয়। " +
      "বাংলা ভাষায় তাৎক্ষণিক তথ্য পরিবেশন করে ব্যবহারকারীকে আশপাশের পরিবেশ ও লেখা স্পষ্টভাবে জানতে সহায়তা করে।";

    expect(longText.length).toBeGreaterThan(300);
    const chunks = splitTextIntoChunks(longText, 300);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(300);
      expect(chunk.trim().length).toBeGreaterThan(0);
    }
  });

  it("splits text cleanly along punctuation when available", () => {
    const sentence1 = "ক".repeat(120) + "।";
    const sentence2 = "খ".repeat(120) + "।";
    const sentence3 = "গ".repeat(120) + "।";
    const fullText = `${sentence1} ${sentence2} ${sentence3}`;

    const chunks = splitTextIntoChunks(fullText, 250);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(250);
    }
  });
});

describe("OCR Word Confidence Calculation", () => {
  it("calculates average word confidence from nested blocks structure", () => {
    const mockData = {
      blocks: [
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    { confidence: 80 },
                    { confidence: 90 },
                  ],
                },
              ],
            },
          ],
        },
        {
          paragraphs: [
            {
              lines: [
                {
                  words: [
                    { confidence: 70 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const avg = calculateAverageWordConfidence(mockData);
    expect(avg).toBe(80);
  });

  it("returns null if no words are available and page confidence is absent", () => {
    const emptyData = {
      blocks: [],
    };
    expect(calculateAverageWordConfidence(emptyData)).toBeNull();
  });

  it("falls back to page confidence if words are not present", () => {
    const pageConfidenceData = {
      blocks: [],
      confidence: 85.4,
    };
    expect(calculateAverageWordConfidence(pageConfidenceData)).toBe(85.4);
  });
});

describe("Tool Registry for readText", () => {
  it("marks readText as LIVE in toolRegistry", () => {
    expect(toolRegistry.readText.status).toBe("LIVE");
  });

  it("provides Bengali label for readText", () => {
    expect(toolRegistry.readText.labelBn).toBe("লেখা পড়া");
  });
});
