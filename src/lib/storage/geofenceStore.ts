/**
 * DRISHTI AI — Safe-Zone & Geofencing Store
 * Manages defined safe perimeter zones (home, office, clinic, etc.)
 * with high-accuracy Haversine coordinate math and boundary breach detection.
 */

export interface SafeZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  isActive: boolean;
  createdAt: number;
}

export interface GeofenceEvaluation {
  isSafe: boolean;
  currentLat: number;
  currentLng: number;
  activeZoneCount: number;
  matchingZone?: SafeZone;
  nearestZone?: {
    zone: SafeZone;
    distanceMeters: number;
  };
  spokenSummaryBn: string;
}

const STORAGE_KEY = "drishti_safe_zones_v1";

export const DEFAULT_SAFE_ZONES: SafeZone[] = [
  {
    id: "zone-home",
    name: "বাড়ি (Home)",
    lat: 23.8103,
    lng: 90.4125,
    radiusMeters: 150,
    isActive: true,
    createdAt: 1700000000000,
  },
  {
    id: "zone-clinic",
    name: "চিকিৎসাকেন্দ্র (Clinic)",
    lat: 23.8155,
    lng: 90.4180,
    radiusMeters: 100,
    isActive: false,
    createdAt: 1700000001000,
  },
];

/**
 * Converts Western digits to Bengali numeral glyphs.
 */
export function toBengaliDigits(val: number | string): string {
  const digits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(val).replace(/\d/g, (d) => digits[Number(d)] || d);
}

/**
 * Calculates surface distance in meters between two geographical coordinates
 * using the Haversine trigonometric formula.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  if (lat1 === lat2 && lon1 === lon2) return 0;

  const R = 6371e3; // Earth mean radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

let memorySafeZones: SafeZone[] = [...DEFAULT_SAFE_ZONES];

/**
 * Retrieve all registered safe zones from local storage or memory cache.
 */
export function getSafeZones(): SafeZone[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return memorySafeZones;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SAFE_ZONES));
      return DEFAULT_SAFE_ZONES;
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SAFE_ZONES;
  } catch {
    return memorySafeZones;
  }
}

/**
 * Persist safe zones to local storage and in-memory cache.
 */
function persistSafeZones(zones: SafeZone[]): void {
  memorySafeZones = [...zones];
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(zones));
  } catch {
    // Ignore quota issues
  }
}

/**
 * Add a new safe zone.
 */
export function addSafeZone(zone: Omit<SafeZone, "id" | "createdAt">): SafeZone {
  const existing = getSafeZones();
  const newZone: SafeZone = {
    ...zone,
    id: `zone-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    createdAt: Date.now(),
  };

  const updated = [newZone, ...existing];
  persistSafeZones(updated);
  return newZone;
}

/**
 * Update an existing safe zone.
 */
export function updateSafeZone(id: string, updates: Partial<SafeZone>): SafeZone[] {
  const existing = getSafeZones();
  const updated = existing.map((z) => (z.id === id ? { ...z, ...updates } : z));
  persistSafeZones(updated);
  return updated;
}

/**
 * Remove a safe zone by ID.
 */
export function deleteSafeZone(id: string): SafeZone[] {
  const existing = getSafeZones();
  const updated = existing.filter((z) => z.id !== id);
  persistSafeZones(updated);
  return updated;
}

/**
 * Reset safe zones to default presets.
 */
export function resetSafeZones(): SafeZone[] {
  memorySafeZones = [...DEFAULT_SAFE_ZONES];
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_SAFE_ZONES));
    } catch {
      // Ignore quota issues
    }
  }
  return DEFAULT_SAFE_ZONES;
}

/**
 * Evaluates whether a coordinate (lat, lng) is currently inside any active safe zone.
 */
export function evaluateSafeZones(currentLat: number, currentLng: number): GeofenceEvaluation {
  const allZones = getSafeZones();
  const activeZones = allZones.filter((z) => z.isActive);

  if (activeZones.length === 0) {
    return {
      isSafe: true,
      currentLat,
      currentLng,
      activeZoneCount: 0,
      spokenSummaryBn: "কোনো সক্রিয় নিরাপদ এলাকা নির্ধারিত নেই। সকল এলাকা অনুমোদিত।",
    };
  }

  let matchingZone: SafeZone | undefined;
  let nearestZone: SafeZone | undefined;
  let minDistance = Infinity;

  for (const zone of activeZones) {
    const distance = calculateDistanceMeters(currentLat, currentLng, zone.lat, zone.lng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestZone = zone;
    }
    if (distance <= zone.radiusMeters) {
      matchingZone = zone;
      break;
    }
  }

  if (matchingZone) {
    const distBn = toBengaliDigits(minDistance);
    return {
      isSafe: true,
      currentLat,
      currentLng,
      activeZoneCount: activeZones.length,
      matchingZone,
      nearestZone: { zone: matchingZone, distanceMeters: minDistance },
      spokenSummaryBn: `আপনি নিরাপদ এলাকার ভিতরে আছেন। এলাকা: ${matchingZone.name}, কেন্দ্র থেকে দূরত্ব প্রায় ${distBn} মিটার।`,
    };
  }

  const nearest = nearestZone!;
  const distBn = toBengaliDigits(minDistance);
  const radiusBn = toBengaliDigits(nearest.radiusMeters);

  return {
    isSafe: false,
    currentLat,
    currentLng,
    activeZoneCount: activeZones.length,
    nearestZone: { zone: nearest, distanceMeters: minDistance },
    spokenSummaryBn: `সতর্কতা! আপনি নিরাপদ এলাকা অতিক্রম করেছেন। নিকটতম এলাকা '${nearest.name}' (${radiusBn} মিটার ব্যাসার্ধ) থেকে ${distBn} মিটার দূরে সরে গেছেন।`,
  };
}
