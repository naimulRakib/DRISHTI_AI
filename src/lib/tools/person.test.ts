import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  cosineSimilarity,
  l2Normalize,
  findClosestPersonMatch,
  savePerson,
  deletePerson,
  getEnrolledPersons,
  PersonProfile,
} from "@/lib/storage/personStore";
import {
  formatPersonRecognitionBengali,
  extractFaceEmbeddingFromImageData,
} from "./person";

describe("Person & Face Recognition System", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Vector Mathematics (ArcFace Cosine Similarity)", () => {
    it("returns 1.0 for identical vectors", () => {
      const v = [0.2, 0.5, 0.8];
      const sim = cosineSimilarity(v, v);
      expect(sim).toBeCloseTo(1.0, 4);
    });

    it("returns 0.0 for orthogonal vectors", () => {
      const v1 = [1, 0, 0];
      const v2 = [0, 1, 0];
      const sim = cosineSimilarity(v1, v2);
      expect(sim).toBeCloseTo(0.0, 4);
    });

    it("handles zero vectors safely without division by zero NaN", () => {
      const v1 = [0, 0, 0];
      const v2 = [1, 2, 3];
      expect(cosineSimilarity(v1, v2)).toBe(0);
    });

    it("normalizes vectors to unit length with l2Normalize", () => {
      const vec = [3, 4];
      const normalized = l2Normalize(vec);
      expect(normalized[0]).toBeCloseTo(0.6, 4);
      expect(normalized[1]).toBeCloseTo(0.8, 4);

      const norm = Math.sqrt(
        normalized.reduce((sum, val) => sum + val * val, 0)
      );
      expect(norm).toBeCloseTo(1.0, 4);
    });
  });

  describe("Enrolled Family Person Store", () => {
    it("retrieves default seeded family members", () => {
      const persons = getEnrolledPersons();
      expect(persons.length).toBeGreaterThanOrEqual(3);
      expect(persons.some((p) => p.name === "রহিম")).toBe(true);
      expect(persons.some((p) => p.relationBn === "মা")).toBe(true);
    });

    it("finds closest person match when similarity is above threshold", () => {
      const testPerson: PersonProfile = {
        id: "test-user-123",
        name: "সাকিব",
        relationBn: "বড় ভাই",
        vector: [1, 0, 0, 0],
        enrolledAt: Date.now(),
      };
      savePerson(testPerson);

      const queryVector = [0.99, 0.01, 0, 0];
      const match = findClosestPersonMatch(queryVector, 0.85);

      expect(match).not.toBeNull();
      expect(match?.person.name).toBe("সাকিব");
      expect(match?.similarity).toBeGreaterThan(0.9);

      deletePerson("test-user-123");
    });

    it("returns null when query vector has low similarity to all members", () => {
      const dissimilarVector = new Array(128).fill(0);
      dissimilarVector[0] = -1; // Negative opposite vector
      const match = findClosestPersonMatch(dissimilarVector, 0.95);
      expect(match).toBeNull();
    });
  });

  describe("Bengali Announcement Formatting", () => {
    it("formats known family member announcement with name and relation", () => {
      const mockPerson: PersonProfile = {
        id: "p1",
        name: "আমেনা বেগম",
        relationBn: "মা",
        vector: [1, 0],
        enrolledAt: 1234,
      };

      const result = formatPersonRecognitionBengali(
        { person: mockPerson, similarity: 0.94 },
        true
      );

      expect(result.messageBn).toContain("আপনার সামনে আমেনা বেগম (মা) দাঁড়িয়ে আছেন।");
      expect(result.detail).toContain("Identified: আমেনা বেগম");
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("formats unknown / unenrolled person announcement", () => {
      const result = formatPersonRecognitionBengali(null, true);

      expect(result.messageBn).toContain("আপনার সামনে একজন ব্যক্তি দাঁড়িয়ে আছেন");
      expect(result.messageBn).toContain("নিবন্ধিত পরিচিত তালিকায় নেই");
    });

    it("formats empty scene when no person is present", () => {
      const result = formatPersonRecognitionBengali(null, false);

      expect(result.messageBn).toBe("সামনে কোনো মানুষের উপস্থিতি সনাক্ত করা যায়নি।");
      expect(result.confidence).toBeNull();
    });
  });

  describe("Face Feature Extraction", () => {
    it("extracts a 128-dimensional unit normalized vector from ImageData", () => {
      const width = 64;
      const height = 64;
      const data = new Uint8ClampedArray(width * height * 4);
      // Fill with dummy color pattern
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 180; // R
        data[i + 1] = 120; // G
        data[i + 2] = 90; // B
        data[i + 3] = 255; // A
      }

      const mockImageData: ImageData = {
        width,
        height,
        data,
        colorSpace: "srgb",
      };

      const embedding = extractFaceEmbeddingFromImageData(mockImageData);

      expect(embedding).toHaveLength(128);
      const norm = Math.sqrt(embedding.reduce((s, x) => s + x * x, 0));
      expect(norm).toBeCloseTo(1.0, 4);
    });
  });
});
