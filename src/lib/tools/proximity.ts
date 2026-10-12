/**
 * DRISHTI AI — Proximity Warning (SIMULATION ONLY)
 * Pure software simulation with manual slider.
 * There is no Raspberry Pi, Arduino, or physical hardware.
 */

import { ToolResult } from "@/lib/types";
import { speak } from "@/lib/tools/speech";

export interface ProximityReading {
  distanceCm: number | null;
  status: "ok" | "invalid" | "timeout" | "disconnected";
  timestamp: number;
}

export interface ProximityProvider {
  name: string;
  kind: "hardware" | "simulation";
  read(): Promise<ProximityReading>;
}

// Real hardware later: a Web Serial or WebSocket provider can implement ProximityProvider without changing the UI.

/**
 * SimulatedProvider: Pure in-memory simulation controlled by user slider.
 * Every reading carries the kind "simulation".
 */
export class SimulatedProvider implements ProximityProvider {
  name = "সিমুলেটেড প্রক্সিমিটি সেন্সর (Simulated Slider)";
  kind: "simulation" = "simulation";
  private currentDistanceCm: number = 150;

  setDistance(cm: number): void {
    this.currentDistanceCm = Math.max(0, Math.min(400, Math.round(cm)));
  }

  getDistance(): number {
    return this.currentDistanceCm;
  }

  async read(): Promise<ProximityReading> {
    return {
      distanceCm: this.currentDistanceCm,
      status: "ok",
      timestamp: Date.now(),
    };
  }
}

export const simulatedProximityProvider = new SimulatedProvider();

/**
 * Evaluates warning logic for proximity readings.
 * - Under 100 cm: says "অনুকরণ: সামনে কিছু কাছে আছে".
 * - Never claims the path is clear or safe when distance is large.
 * - Spoken output always starts with "অনুকরণ".
 */
export function evaluateProximityWarning(distanceCm: number | null): {
  isClose: boolean;
  message_bn: string;
  speech_bn: string;
} {
  if (distanceCm === null || distanceCm < 0) {
    const msg = "অনুকরণ: দূরত্বের মান পাওয়া যায়নি বা অবৈধ।";
    return { isClose: false, message_bn: msg, speech_bn: msg };
  }

  const bnDist = String(distanceCm).replace(
    /\d/g,
    (d) => ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"][Number(d)]
  );

  // Under 100 cm: Obstacle warning
  if (distanceCm < 100) {
    const speech = "অনুকরণ: সামনে কিছু কাছে আছে";
    const display = `অনুকরণ: সামনে কিছু কাছে আছে (দূরত্ব: ${bnDist} সেমি)`;
    return {
      isClose: true,
      message_bn: display,
      speech_bn: speech,
    };
  }

  // Distance >= 100 cm: Never claim the path is clear or safe!
  const speech = `অনুকরণ: পরিমাপ ${bnDist} সেন্টিমিটার। পথ সম্পূর্ণ নিরাপদ বা বাধাহীন বলে দাবি করা হচ্ছে না।`;
  const display = `অনুকরণ: দূরত্ব ${bnDist} সেমি (পথ নিরাপদ বলে দাবি করা হচ্ছে না)`;
  return {
    isClose: false,
    message_bn: display,
    speech_bn: speech,
  };
}

/**
 * Runs proximity check and speaks evaluation.
 */
export async function readProximityTool(): Promise<ToolResult> {
  const reading = await simulatedProximityProvider.read();
  const evaluation = evaluateProximityWarning(reading.distanceCm);

  speak(evaluation.speech_bn);

  return {
    tool: "readProximity",
    status: "success",
    source: "simulation",
    message_bn: evaluation.message_bn,
    detail: `Distance: ${reading.distanceCm} cm [SIMULATED]`,
    confidence: 1.0,
  };
}
