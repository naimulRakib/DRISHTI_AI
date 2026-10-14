/**
 * DRISHTI AI — Spatial Audio Echolocation & Acoustic Radar Engine
 * Synthesizes dynamic 3D binaural acoustic pings using Web Audio API:
 * - Stereo panning (-1.0 left to +1.0 right) via StereoPannerNode / PannerNode
 * - Frequency pitch modulation based on obstacle proximity (300Hz to 1400Hz)
 * - Proximity pulse repetition intervals (rapid clicking for close threats)
 * - Ear-safe gain ramping and exponential decay envelopes
 */

export interface EcholocationPingOptions {
  pan?: number; // -1.0 (far left) to +1.0 (far right)
  distanceMeters?: number; // 0.2m to 5.0m
  elevation?: "low" | "mid" | "high"; // vertical spatial cue
  volume?: number; // 0.0 to 1.0
}

export interface RadarTarget {
  id: string;
  labelBn: string;
  pan: number; // -1.0 to 1.0
  distanceMeters: number; // 0.3 to 4.0m
  clockHour: number; // 1 to 12
  isImminentThreat: boolean;
}

class EcholocationAudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private masterGain: GainNode | null = null;
  private activeIntervalId: number | null = null;
  private isRunningContinuous: boolean = false;

  private getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        // @ts-expect-error webkit prefix fallback
        window.webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /**
   * Calculate acoustic pitch based on distance.
   * Closer objects produce higher frequency pings.
   */
  public calculateFrequency(distanceMeters: number, elevation: "low" | "mid" | "high" = "mid"): number {
    const clampedDist = Math.max(0.3, Math.min(4.0, distanceMeters));
    // Linear interpolation: 0.3m -> 1250Hz, 4.0m -> 380Hz
    const t = (clampedDist - 0.3) / (4.0 - 0.3);
    let baseFreq = 1250 - t * (1250 - 380);

    if (elevation === "high") {
      baseFreq *= 1.25; // Higher harmonic for overhead obstacles
    } else if (elevation === "low") {
      baseFreq *= 0.8; // Lower thud for ground hazards
    }

    return Math.round(baseFreq);
  }

  /**
   * Calculate pulse repetition interval in milliseconds.
   * As an obstacle nears, pings repeat with faster urgency.
   */
  public calculatePulseInterval(distanceMeters: number): number {
    const clampedDist = Math.max(0.3, Math.min(4.0, distanceMeters));
    // 0.3m -> 90ms, 4.0m -> 850ms
    const t = (clampedDist - 0.3) / (4.0 - 0.3);
    return Math.round(90 + t * (850 - 90));
  }

  /**
   * Synthesizes a single 3D spatial acoustic ping with stereo panning.
   */
  public playSpatialPing(options: EcholocationPingOptions = {}): void {
    if (this.isMuted) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    const pan = Math.max(-1, Math.min(1, options.pan ?? 0));
    const distance = options.distanceMeters ?? 1.5;
    const elevation = options.elevation ?? "mid";
    const volume = Math.max(0, Math.min(1, options.volume ?? 0.7));

    const freq = this.calculateFrequency(distance, elevation);

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      // Pitch envelope: slight downward chirp for crisp echolocation click
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(100, freq * 0.7), now + 0.08);

      // Amplitude envelope: instant crisp attack with gentle decay
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(volume * 0.4, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

      // Stereo Panning
      if (typeof ctx.createStereoPanner === "function") {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(pan, now);
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(ctx.destination);
      } else {
        // Fallback for Safari without StereoPanner
        osc.connect(gain);
        gain.connect(ctx.destination);
      }

      osc.start(now);
      osc.stop(now + 0.1);
    } catch {
      // AudioContext playback errors suppressed
    }
  }

  /**
   * Stereo Headphone calibration test.
   * Plays a distinct ping in the requested ear.
   */
  public playStereoEarTest(side: "left" | "right"): void {
    const pan = side === "left" ? -1.0 : 1.0;
    this.playSpatialPing({
      pan,
      distanceMeters: 1.0,
      volume: 0.85,
    });
  }

  /**
   * Continuous sonar pulse loop for real-time navigation.
   */
  public startContinuousScan(getTargetFn: () => RadarTarget | null): void {
    this.stopContinuousScan();
    this.isRunningContinuous = true;

    const tick = () => {
      if (!this.isRunningContinuous) return;

      const target = getTargetFn();
      if (target) {
        this.playSpatialPing({
          pan: target.pan,
          distanceMeters: target.distanceMeters,
          volume: target.isImminentThreat ? 0.9 : 0.65,
        });

        const nextInterval = this.calculatePulseInterval(target.distanceMeters);
        this.activeIntervalId = window.setTimeout(tick, nextInterval);
      } else {
        // Ambient pulse when path is clear (calm low beep every 1.5 seconds)
        this.playSpatialPing({
          pan: 0,
          distanceMeters: 3.5,
          volume: 0.2,
        });
        this.activeIntervalId = window.setTimeout(tick, 1500);
      }
    };

    tick();
  }

  public stopContinuousScan(): void {
    this.isRunningContinuous = false;
    if (this.activeIntervalId !== null) {
      clearTimeout(this.activeIntervalId);
      this.activeIntervalId = null;
    }
  }

  public isScanning(): boolean {
    return this.isRunningContinuous;
  }

  public mute(muted: boolean): void {
    this.isMuted = muted;
  }
}

export const echolocationEngine = new EcholocationAudioEngine();
