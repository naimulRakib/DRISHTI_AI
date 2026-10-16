/**
 * DRISHTI AI — Caregiver & Family Person Store
 * Offline-first persistent storage for enrolled family members, caregivers, and doctors.
 * Directly integrates ANVI's ArcFace cosine similarity matching logic.
 */

export interface PersonProfile {
  id: string;
  name: string;
  relationBn: string; // যেমন: "মা", "বাবা", "ছোট ভাই", "ডাক্তার", "কেয়ারগিভার"
  photoUri?: string;
  vector: number[];
  enrolledAt: number;
}

const STORAGE_KEY = "drishti:enrolled_persons_v1";

/**
 * Calculates cosine similarity between two feature embedding vectors.
 * Returns a value between -1.0 and 1.0 (1.0 is an exact match).
 * Equivalent to ANVI's ArcFace cosine distance: dot(a, b) / (norm(a) * norm(b)).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Normalizes a vector using L2-norm (unit length).
 */
export function l2Normalize(vector: number[]): number[] {
  let sum = 0;
  for (const v of vector) sum += v * v;
  const norm = Math.sqrt(sum);
  if (norm <= 0) return vector.slice();
  return vector.map((v) => v / norm);
}

/**
 * Generates a deterministic mock embedding vector of specified dimension
 * for presets and test cases.
 */
export function generateSeedVector(seed: number, dimension = 128): number[] {
  const vec: number[] = [];
  for (let i = 0; i < dimension; i++) {
    // Deterministic pseudo-random sequence
    const val = Math.sin(seed * 997 + i * 31) * 0.5 + Math.cos(seed * 101 + i * 17) * 0.5;
    vec.push(val);
  }
  return l2Normalize(vec);
}

/**
 * Default seeded family & caregiver contacts.
 */
export const DEFAULT_SEED_MEMBERS: PersonProfile[] = [
  {
    id: "member-1",
    name: "রহিম",
    relationBn: "ছোট ভাই",
    vector: generateSeedVector(101),
    enrolledAt: 1710000000000,
  },
  {
    id: "member-2",
    name: "আমেনা বেগম",
    relationBn: "মা",
    vector: generateSeedVector(202),
    enrolledAt: 1710000001000,
  },
  {
    id: "member-fahim",
    name: "ফাহিম",
    relationBn: "আপনার বন্ধু",
    vector: generateSeedVector(404),
    enrolledAt: 1710000003000,
  },
  {
    id: "member-reshma",
    name: "রেশমা",
    relationBn: "যার সাথে গতকালও আপনার দেখা হয়েছিল",
    photoUri: "/demo/reshma_bd_girl.jpg",
    vector: generateSeedVector(505),
    enrolledAt: 1710000004000,
  },
  {
    id: "member-naimul",
    name: "নাইমুল",
    relationBn: "আপনার বন্ধু",
    photoUri: "/demo/naimul.jpg",
    vector: generateSeedVector(606),
    enrolledAt: 1710000005000,
  },
  {
    id: "member-nil",
    name: "নীল",
    relationBn: "আপনার বন্ধু",
    photoUri: "/demo/nil.jpg",
    vector: generateSeedVector(707),
    enrolledAt: 1710000006000,
  },
];

let inMemoryPersons: PersonProfile[] | null = null;

/**
 * Retrieves all enrolled family members from localStorage or in-memory fallback.
 */
export function getEnrolledPersons(): PersonProfile[] {
  if (typeof window === "undefined" || !window.localStorage) {
    if (!inMemoryPersons) {
      inMemoryPersons = [...DEFAULT_SEED_MEMBERS];
    }
    return [...inMemoryPersons];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Seed default profiles on initial run
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SEED_MEMBERS));
      inMemoryPersons = [...DEFAULT_SEED_MEMBERS];
      return [...DEFAULT_SEED_MEMBERS];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      inMemoryPersons = parsed;
      return parsed;
    }
    inMemoryPersons = [...DEFAULT_SEED_MEMBERS];
    return [...DEFAULT_SEED_MEMBERS];
  } catch {
    if (!inMemoryPersons) inMemoryPersons = [...DEFAULT_SEED_MEMBERS];
    return [...inMemoryPersons];
  }
}

/**
 * Saves or updates an enrolled person in storage.
 */
export function savePerson(person: PersonProfile): void {
  const current = getEnrolledPersons();
  const existingIdx = current.findIndex((p) => p.id === person.id);

  if (existingIdx >= 0) {
    current[existingIdx] = person;
  } else {
    current.push(person);
  }

  inMemoryPersons = current;

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (err) {
      console.error("Failed to save person profile:", err);
    }
  }
}

/**
 * Deletes an enrolled person by ID.
 */
export function deletePerson(personId: string): void {
  const current = getEnrolledPersons();
  const filtered = current.filter((p) => p.id !== personId);
  inMemoryPersons = filtered;

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (err) {
      console.error("Failed to delete person profile:", err);
    }
  }
}

/**
 * Resets storage back to default seeded members.
 */
export function resetToDefaultMembers(): void {
  inMemoryPersons = [...DEFAULT_SEED_MEMBERS];
  if (typeof window !== "undefined" && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SEED_MEMBERS));
  }
}


export interface MatchResult {
  person: PersonProfile;
  similarity: number;
}

/**
 * Finds the closest enrolled person matching the query embedding.
 * Matches above the given similarity threshold (default: 0.70).
 */
export function findClosestPersonMatch(
  queryVector: number[],
  threshold = 0.70
): MatchResult | null {
  const members = getEnrolledPersons();
  let bestMatch: MatchResult | null = null;
  let highestSim = -1;

  for (const person of members) {
    const sim = cosineSimilarity(queryVector, person.vector);
    if (sim > highestSim) {
      highestSim = sim;
      bestMatch = { person, similarity: sim };
    }
  }

  if (bestMatch && bestMatch.similarity >= threshold) {
    return bestMatch;
  }

  return null;
}
