import { describe, it, expect } from "vitest";
import {
  safetyReducer,
  INITIAL_SAFETY_CONTEXT,
  SafetyMachineContext,
} from "./machine";

describe("Safety State Machine (pure reducer)", () => {
  it("initializes with IDLE state and 15 seconds countdown", () => {
    expect(INITIAL_SAFETY_CONTEXT.state).toBe("IDLE");
    expect(INITIAL_SAFETY_CONTEXT.countdownSeconds).toBe(15);
  });

  it("transitions from IDLE to MONITORING on START_MONITOR", () => {
    const next = safetyReducer(INITIAL_SAFETY_CONTEXT, { type: "START_MONITOR" });
    expect(next.state).toBe("MONITORING");
    expect(next.wasMonitoringBeforeTrigger).toBe(true);
  });

  it("transitions from MONITORING to IDLE on STOP_MONITOR", () => {
    const monitoringState: SafetyMachineContext = {
      ...INITIAL_SAFETY_CONTEXT,
      state: "MONITORING",
      wasMonitoringBeforeTrigger: true,
    };
    const next = safetyReducer(monitoringState, { type: "STOP_MONITOR" });
    expect(next.state).toBe("IDLE");
  });

  it("transitions from MONITORING to TRIGGERED on FALL_SUSPECTED", () => {
    const monitoringState: SafetyMachineContext = {
      ...INITIAL_SAFETY_CONTEXT,
      state: "MONITORING",
      wasMonitoringBeforeTrigger: true,
    };
    const next = safetyReducer(monitoringState, { type: "FALL_SUSPECTED" });
    expect(next.state).toBe("TRIGGERED");
    expect(next.countdownSeconds).toBe(15);
    expect(next.wasMonitoringBeforeTrigger).toBe(true);
  });

  it("transitions from IDLE or MONITORING to TRIGGERED on SIMULATE_FALL", () => {
    const fromIdle = safetyReducer(INITIAL_SAFETY_CONTEXT, { type: "SIMULATE_FALL" });
    expect(fromIdle.state).toBe("TRIGGERED");
    expect(fromIdle.wasMonitoringBeforeTrigger).toBe(false);

    const fromMonitoring = safetyReducer(
      { ...INITIAL_SAFETY_CONTEXT, state: "MONITORING", wasMonitoringBeforeTrigger: true },
      { type: "SIMULATE_FALL" }
    );
    expect(fromMonitoring.state).toBe("TRIGGERED");
    expect(fromMonitoring.wasMonitoringBeforeTrigger).toBe(true);
  });

  it("transitions from TRIGGERED to COUNTDOWN on COUNTDOWN_TICK", () => {
    const triggeredState: SafetyMachineContext = {
      ...INITIAL_SAFETY_CONTEXT,
      state: "TRIGGERED",
      countdownSeconds: 15,
    };
    const next = safetyReducer(triggeredState, { type: "COUNTDOWN_TICK" });
    expect(next.state).toBe("COUNTDOWN");
    expect(next.countdownSeconds).toBe(14);
  });

  it("decrements countdownSeconds on COUNTDOWN_TICK while in COUNTDOWN", () => {
    const countdownState: SafetyMachineContext = {
      ...INITIAL_SAFETY_CONTEXT,
      state: "COUNTDOWN",
      countdownSeconds: 10,
    };
    const next = safetyReducer(countdownState, { type: "COUNTDOWN_TICK" });
    expect(next.state).toBe("COUNTDOWN");
    expect(next.countdownSeconds).toBe(9);
  });

  it("transitions from COUNTDOWN to MONITORING on CANCEL (explicit requirement)", () => {
    const countdownState: SafetyMachineContext = {
      ...INITIAL_SAFETY_CONTEXT,
      state: "COUNTDOWN",
      countdownSeconds: 8,
      wasMonitoringBeforeTrigger: true,
    };
    const next = safetyReducer(countdownState, { type: "CANCEL" });
    expect(next.state).toBe("MONITORING");
    expect(next.countdownSeconds).toBe(15);
  });

  it("transitions from COUNTDOWN to ALERT_TEST_SENT on TIMEOUT (explicit requirement)", () => {
    const countdownState: SafetyMachineContext = {
      ...INITIAL_SAFETY_CONTEXT,
      state: "COUNTDOWN",
      countdownSeconds: 3,
    };
    const next = safetyReducer(countdownState, { type: "TIMEOUT" });
    expect(next.state).toBe("ALERT_TEST_SENT");
    expect(next.countdownSeconds).toBe(0);
  });

  it("transitions from COUNTDOWN to ALERT_TEST_SENT when COUNTDOWN_TICK reaches 0", () => {
    const countdownState: SafetyMachineContext = {
      ...INITIAL_SAFETY_CONTEXT,
      state: "COUNTDOWN",
      countdownSeconds: 1,
    };
    const next = safetyReducer(countdownState, { type: "COUNTDOWN_TICK" });
    expect(next.state).toBe("ALERT_TEST_SENT");
    expect(next.countdownSeconds).toBe(0);
  });

  it("transitions from TRIGGERED to CANCELLED on CANCEL when not monitoring before", () => {
    const triggeredState: SafetyMachineContext = {
      ...INITIAL_SAFETY_CONTEXT,
      state: "TRIGGERED",
      wasMonitoringBeforeTrigger: false,
    };
    const next = safetyReducer(triggeredState, { type: "CANCEL" });
    expect(next.state).toBe("CANCELLED");
  });

  it("transitions from TRIGGERED to MONITORING on CANCEL when was monitoring before", () => {
    const triggeredState: SafetyMachineContext = {
      ...INITIAL_SAFETY_CONTEXT,
      state: "TRIGGERED",
      wasMonitoringBeforeTrigger: true,
    };
    const next = safetyReducer(triggeredState, { type: "CANCEL" });
    expect(next.state).toBe("MONITORING");
  });

  it("resets back to INITIAL_SAFETY_CONTEXT on RESET", () => {
    const alertSentState: SafetyMachineContext = {
      state: "ALERT_TEST_SENT",
      countdownSeconds: 0,
      wasMonitoringBeforeTrigger: true,
      mockAlertMessage: "Test msg",
    };
    const reset = safetyReducer(alertSentState, { type: "RESET" });
    expect(reset.state).toBe("IDLE");
    expect(reset.countdownSeconds).toBe(15);
    expect(reset.mockAlertMessage).toBeNull();
  });
});
