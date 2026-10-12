export type FeatureStatus = "LIVE" | "SIMULATED" | "PLANNED";

export type ToolName =
  | "describeSurroundings"
  | "readText"
  | "recognizePerson"
  | "getLocation"
  | "walkWithMe"
  | "readProximity"
  | "safetyTest"
  | "askVision"
  | "readCurrency"
  | "checkSafeZone"
  | "stopSpeaking"
  | "repeatLast"
  | "unknown";

export type ToolStatus =
  | "success"
  | "error"
  | "unavailable"
  | "not_implemented"
  | "permission_denied";

export type ToolSource =
  | "on-device-model"
  | "on-device-ocr"
  | "browser-api"
  | "simulation"
  | "hardware"
  | "none";

export interface ToolResult {
  tool: ToolName;
  status: ToolStatus;
  source: ToolSource;
  message_bn: string;
  detail?: string;
  confidence: number | null;
}
