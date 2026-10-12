/**
 * DRISHTI AI — Fall & Safety State Machine
 * Pure reducer implementation managing the emergency safety test lifecycle.
 *
 * States:
 *   IDLE, MONITORING, TRIGGERED, COUNTDOWN, CANCELLED, ALERT_TEST_SENT
 * Events:
 *   START_MONITOR, STOP_MONITOR, FALL_SUSPECTED, SIMULATE_FALL,
 *   COUNTDOWN_TICK, CANCEL, TIMEOUT, RESET
 */

export type SafetyState =
  | "IDLE"
  | "MONITORING"
  | "TRIGGERED"
  | "COUNTDOWN"
  | "CANCELLED"
  | "ALERT_TEST_SENT";

export type SafetyEvent =
  | { type: "START_MONITOR" }
  | { type: "STOP_MONITOR" }
  | { type: "FALL_SUSPECTED" }
  | { type: "SIMULATE_FALL" }
  | { type: "COUNTDOWN_TICK" }
  | { type: "CANCEL" }
  | { type: "TIMEOUT" }
  | { type: "RESET" };

export interface SafetyMachineContext {
  state: SafetyState;
  countdownSeconds: number;
  wasMonitoringBeforeTrigger: boolean;
  mockAlertMessage: string | null;
}

export const DEFAULT_COUNTDOWN_SECONDS = 15;

export const INITIAL_SAFETY_CONTEXT: SafetyMachineContext = {
  state: "IDLE",
  countdownSeconds: DEFAULT_COUNTDOWN_SECONDS,
  wasMonitoringBeforeTrigger: false,
  mockAlertMessage: null,
};

/**
 * Pure reducer for the safety test state machine.
 */
export function safetyReducer(
  current: SafetyMachineContext,
  event: SafetyEvent
): SafetyMachineContext {
  switch (event.type) {
    case "RESET":
      return {
        ...INITIAL_SAFETY_CONTEXT,
      };

    case "START_MONITOR":
      if (
        current.state === "IDLE" ||
        current.state === "CANCELLED" ||
        current.state === "ALERT_TEST_SENT"
      ) {
        return {
          ...current,
          state: "MONITORING",
          countdownSeconds: DEFAULT_COUNTDOWN_SECONDS,
          wasMonitoringBeforeTrigger: true,
          mockAlertMessage: null,
        };
      }
      return current;

    case "STOP_MONITOR":
      return {
        ...current,
        state: "IDLE",
        countdownSeconds: DEFAULT_COUNTDOWN_SECONDS,
        wasMonitoringBeforeTrigger: false,
      };

    case "FALL_SUSPECTED":
    case "SIMULATE_FALL":
      if (current.state === "MONITORING" || current.state === "IDLE" || current.state === "CANCELLED") {
        return {
          ...current,
          state: "TRIGGERED",
          countdownSeconds: DEFAULT_COUNTDOWN_SECONDS,
          wasMonitoringBeforeTrigger: current.state === "MONITORING",
        };
      }
      return current;

    case "COUNTDOWN_TICK":
      if (current.state === "TRIGGERED") {
        return {
          ...current,
          state: "COUNTDOWN",
          countdownSeconds: DEFAULT_COUNTDOWN_SECONDS - 1,
        };
      }
      if (current.state === "COUNTDOWN") {
        if (current.countdownSeconds <= 1) {
          return {
            ...current,
            state: "ALERT_TEST_SENT",
            countdownSeconds: 0,
          };
        }
        return {
          ...current,
          countdownSeconds: current.countdownSeconds - 1,
        };
      }
      return current;

    case "CANCEL":
      // Explicit requirement: CANCEL during COUNTDOWN returns to MONITORING
      if (current.state === "COUNTDOWN") {
        return {
          ...current,
          state: "MONITORING",
          countdownSeconds: DEFAULT_COUNTDOWN_SECONDS,
          mockAlertMessage: null,
        };
      }
      if (current.state === "TRIGGERED") {
        return {
          ...current,
          state: current.wasMonitoringBeforeTrigger ? "MONITORING" : "CANCELLED",
          countdownSeconds: DEFAULT_COUNTDOWN_SECONDS,
          mockAlertMessage: null,
        };
      }
      return current;

    case "TIMEOUT":
      if (current.state === "COUNTDOWN" || current.state === "TRIGGERED") {
        return {
          ...current,
          state: "ALERT_TEST_SENT",
          countdownSeconds: 0,
        };
      }
      return current;

    default:
      return current;
  }
}
