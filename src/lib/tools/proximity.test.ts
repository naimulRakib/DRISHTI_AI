import { describe, it, expect } from "vitest";
import {
  SimulatedProvider,
  evaluateProximityWarning,
  readProximityTool,
  simulatedProximityProvider,
} from "./proximity";
import { toolRegistry } from "./registry";

describe("Proximity Provider (Simulation Only)", () => {
  it("provides SimulatedProvider with kind 'simulation'", () => {
    const provider = new SimulatedProvider();
    expect(provider.kind).toBe("simulation");
  });

  it("clamps manual slider distance between 0 and 400 cm", async () => {
    const provider = new SimulatedProvider();

    provider.setDistance(50);
    expect(provider.getDistance()).toBe(50);

    provider.setDistance(500);
    expect(provider.getDistance()).toBe(400);

    provider.setDistance(-20);
    expect(provider.getDistance()).toBe(0);

    const reading = await provider.read();
    expect(reading.distanceCm).toBe(0);
    expect(reading.status).toBe("ok");
  });
});

describe("Proximity Warning Logic", () => {
  it("triggers warning under 100 cm saying 'অনুকরণ: সামনে কিছু কাছে আছে'", () => {
    const result = evaluateProximityWarning(45);
    expect(result.isClose).toBe(true);
    expect(result.speech_bn).toBe("অনুকরণ: সামনে কিছু কাছে আছে");
    expect(result.speech_bn.startsWith("অনুকরণ")).toBe(true);
  });

  it("handles distance exactly at 99 cm as close", () => {
    const result = evaluateProximityWarning(99);
    expect(result.isClose).toBe(true);
    expect(result.speech_bn).toBe("অনুকরণ: সামনে কিছু কাছে আছে");
  });

  it("never claims path is clear or safe when distance is >= 100 cm", () => {
    const result = evaluateProximityWarning(250);
    expect(result.isClose).toBe(false);
    expect(result.speech_bn.startsWith("অনুকরণ")).toBe(true);
    // Explicit requirement: Never claim the path is clear or safe when the distance is large
    expect(result.speech_bn).not.toContain("পথ নিরাপদ");
    expect(result.speech_bn).not.toContain("পথ পরিষ্কার");
    expect(result.message_bn).toContain("দাবি করা হচ্ছে না");
  });

  it("handles invalid or null distance gracefully", () => {
    const result = evaluateProximityWarning(null);
    expect(result.isClose).toBe(false);
    expect(result.speech_bn.startsWith("অনুকরণ")).toBe(true);
  });
});

describe("Tool Registry for readProximity", () => {
  it("keeps readProximity status strictly as SIMULATED", () => {
    expect(toolRegistry.readProximity.status).toBe("SIMULATED");
  });

  it("returns simulation tool result with source 'simulation'", async () => {
    simulatedProximityProvider.setDistance(80);
    const result = await readProximityTool();
    expect(result.tool).toBe("readProximity");
    expect(result.source).toBe("simulation");
    expect(result.status).toBe("success");
    expect(result.message_bn.startsWith("অনুকরণ")).toBe(true);
  });
});
