import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  calculateBearing,
  calculateClockDirection,
  calculateDistanceMeters,
  isNativeAvailable,
  NavTickData,
  startWalkWithMe,
  stopWalkWithMe,
  subscribeNavTick,
  triggerHaptic,
  saveEmergencyContact,
  getEmergencyContact,
  cancelFallAlert,
  triggerFallSimulation,
  subscribeFallEvents,
} from './bridge';

describe('Drishti Kotlin Bridge & Compass Calculations', () => {
  beforeEach(() => {
    if (typeof window === 'undefined') {
      (globalThis as Record<string, unknown>).window = globalThis;
    }
    delete (window as unknown as Record<string, unknown>).DrishtiBridge;
    delete (window as unknown as Record<string, unknown>).__drishtiNavListener;
    delete (window as unknown as Record<string, unknown>).__drishtiOnFallAlert;
    delete window.__drishtiOnFallCountdownTick;
    delete window.__drishtiOnFallCancelled;
    delete window.__drishtiOnMotionMagnitude;
    delete window.__drishtiOnCaneImage;
    vi.restoreAllMocks();
  });

  it('calculates Haversine distance between two coordinates correctly', () => {
    // BUET (23.7266, 90.3888) to TSC Dhaka University (23.7317, 90.3957) ~ 900m
    const distance = calculateDistanceMeters(23.7266, 90.3888, 23.7317, 90.3957);
    expect(distance).toBeGreaterThan(800);
    expect(distance).toBeLessThan(1000);
  });

  it('calculates bearing angle accurately (0-360°)', () => {
    // Due North
    expect(calculateBearing(0, 0, 1, 0)).toBe(0);
    // Due East
    expect(calculateBearing(0, 0, 0, 1)).toBe(90);
    // Due South
    expect(calculateBearing(1, 0, 0, 0)).toBe(180);
    // Due West
    expect(calculateBearing(0, 1, 0, 0)).toBe(270);
  });

  it('translates heading and bearing differences into natural Bengali directions', () => {
    // Facing North (0°), Destination is North (0°) -> straight ahead
    expect(calculateClockDirection(0, 0)).toBe('একদম সোজা সামনে চলুন');

    // Facing North (0°), Destination is East (90°) -> turn right
    expect(calculateClockDirection(0, 90)).toBe('ডান দিকে ঘুরে চলুন');

    // Facing North (0°), Destination is West (270°) -> turn left
    expect(calculateClockDirection(0, 270)).toBe('বাঁ দিকে ঘুরে চলুন');

    // Facing North (0°), Destination is South (180°) -> turn behind
    expect(calculateClockDirection(0, 180)).toBe('সম্পূর্ণ পেছনে ঘুরুন');
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
      saveEmergencyContact: vi.fn(),
      getEmergencyContact: () => '+8801700000000',
      cancelFallAlert: vi.fn(),
      triggerFallSimulation: vi.fn(),
      isFallMonitoringActive: () => true,
      getSmartCaneServerUrl: () => 'http://192.168.1.100:5000',
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
      clockDirection: 'একদম সোজা সামনে চলুন',
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
      saveEmergencyContact: vi.fn(),
      getEmergencyContact: () => '',
      cancelFallAlert: vi.fn(),
      triggerFallSimulation: vi.fn(),
      isFallMonitoringActive: () => true,
      getSmartCaneServerUrl: () => 'http://localhost:5000',
    };

    startWalkWithMe(23.72, 90.40, 'হাসপাতাল');
    expect(startSpy).toHaveBeenCalledWith(23.72, 90.40, 'হাসপাতাল');

    triggerHaptic('turn_left');
    expect(hapticSpy).toHaveBeenCalledWith('turn_left');

    stopWalkWithMe();
  });

  it('supports emergency contact saving and native fall alert events', () => {
    const saveContactSpy = vi.fn();
    const cancelSpy = vi.fn();
    const simSpy = vi.fn();

    window.DrishtiBridge = {
      isNativeAvailable: () => true,
      getPlatform: () => 'android_kotlin',
      startWalkWithMe: vi.fn(),
      stopWalkWithMe: vi.fn(),
      setDestination: vi.fn(),
      triggerHaptic: vi.fn(),
      speakNative: vi.fn(),
      saveEmergencyContact: saveContactSpy,
      getEmergencyContact: () => '+8801999999999',
      cancelFallAlert: cancelSpy,
      triggerFallSimulation: simSpy,
      isFallMonitoringActive: () => true,
      getSmartCaneServerUrl: () => 'http://192.168.1.50:5000',
    };

    saveEmergencyContact('+8801999999999');
    expect(saveContactSpy).toHaveBeenCalledWith('+8801999999999');
    expect(getEmergencyContact()).toBe('+8801999999999');

    cancelFallAlert();
    expect(cancelSpy).toHaveBeenCalled();

    triggerFallSimulation();
    expect(simSpy).toHaveBeenCalled();

    let alertTriggered = false;
    let tickCount = 0;
    const unsub = subscribeFallEvents({
      onTriggered: () => { alertTriggered = true; },
      onTick: (sec) => { tickCount = sec; },
    });

    window.__drishtiOnFallAlert?.({ countdownSeconds: 12 });
    expect(alertTriggered).toBe(true);

    window.__drishtiOnFallCountdownTick?.({ secondsRemaining: 9 });
    expect(tickCount).toBe(9);

    unsub();
  });
});
