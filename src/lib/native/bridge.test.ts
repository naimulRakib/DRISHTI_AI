import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  calculateDistanceMeters,
  calculateBearing,
  calculateClockDirection,
  isNativeAvailable,
  subscribeNavTick,
  startWalkWithMe,
  stopWalkWithMe,
  triggerHaptic,
  NavTickData,
} from './bridge';

describe('Drishti Native Kotlin Bridge & Nav Calculations', () => {
  beforeEach(() => {
    // Ensure window exists in test environment
    if (typeof globalThis.window === 'undefined') {
      (globalThis as unknown as { window: unknown }).window = globalThis;
    }
    delete (window as unknown as { DrishtiBridge?: unknown }).DrishtiBridge;
    delete (window as unknown as { __drishtiNavListener?: unknown }).__drishtiNavListener;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calculates distance between two coordinates accurately using Haversine', () => {
    // Distance between Dhaka University Curzon Hall (23.7277, 90.4013)
    // and Central Shaheed Minar (23.7273, 90.3986) ~ 278 meters
    const dist = calculateDistanceMeters(23.7277, 90.4013, 23.7273, 90.3986);
    expect(dist).toBeGreaterThan(250);
    expect(dist).toBeLessThan(310);
  });

  it('calculates bearing degrees accurately', () => {
    // Due North: bearing is approx 0 / 360
    const bearingNorth = calculateBearing(0, 0, 10, 0);
    expect(bearingNorth).toBe(0);

    // Due East: bearing is approx 90
    const bearingEast = calculateBearing(0, 0, 0, 10);
    expect(bearingEast).toBe(90);
  });

  it('translates heading differences into Bengali clock-face directions', () => {
    // Facing North (0°), Destination is North (0°) -> 12 o'clock straight
    expect(calculateClockDirection(0, 0)).toContain('১২টার দিকে সোজা চলুন');

    // Facing North (0°), Destination is East (90°) -> 3 o'clock right
    expect(calculateClockDirection(0, 90)).toContain('৩টার দিকে ডানপাশে ঘুরুন');

    // Facing North (0°), Destination is West (270°) -> 9 o'clock left
    expect(calculateClockDirection(0, 270)).toContain('৯টার দিকে বামপাশে ঘুরুন');

    // Facing North (0°), Destination is South (180°) -> 6 o'clock full behind
    expect(calculateClockDirection(0, 180)).toContain('৬টার দিকে সম্পূর্ণ পেছনে ঘুরুন');
  });

  it('detects native Kotlin bridge when window.DrishtiBridge is present', () => {
    expect(isNativeAvailable()).toBe(false);

    window.DrishtiBridge = {
      isNativeAvailable: () => true,
      getPlatform: () => 'android_kotlin',
      startWalkWithMe: vi.fn(),
      stopWalkWithMe: vi.fn(),
      setDestination: vi.fn(),
      triggerHaptic: vi.fn(),
      speakNative: vi.fn(),
    };

    expect(isNativeAvailable()).toBe(true);
  });

  it('dispatches navigation ticks to subscribers', () => {
    const received: NavTickData[] = [];
    const unsubscribe = subscribeNavTick((data) => {
      received.push(data);
    });

    const mockData: NavTickData = {
      lat: 23.7277,
      lng: 90.4013,
      heading: 45,
      destLat: 23.7280,
      destLng: 90.4020,
      destName: 'ফার্মেসি',
      distanceMeters: 65,
      clockDirection: '১২টার দিকে সোজা চলুন',
      accuracy: 3.5,
    };

    window.__drishtiNavListener?.(mockData);

    expect(received).toHaveLength(1);
    expect(received[0].distanceMeters).toBe(65);
    expect(received[0].destName).toBe('ফার্মেসি');

    unsubscribe();
  });

  it('delegates startWalkWithMe and triggerHaptic to native bridge if present', () => {
    const startSpy = vi.fn();
    const hapticSpy = vi.fn();

    window.DrishtiBridge = {
      isNativeAvailable: () => true,
      getPlatform: () => 'android_kotlin',
      startWalkWithMe: startSpy,
      stopWalkWithMe: vi.fn(),
      setDestination: vi.fn(),
      triggerHaptic: hapticSpy,
      speakNative: vi.fn(),
    };

    startWalkWithMe(23.72, 90.40, 'হাসপাতাল');
    expect(startSpy).toHaveBeenCalledWith(23.72, 90.40, 'হাসপাতাল');

    triggerHaptic('turn_left');
    expect(hapticSpy).toHaveBeenCalledWith('turn_left');

    stopWalkWithMe();
  });
});
