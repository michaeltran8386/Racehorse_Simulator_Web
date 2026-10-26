import type { Intensity, Obstacle, Surface, TrackCondition } from "../sim/engine.ts";
import { API_BASE_URL, getAccessToken } from "./client.ts";

export interface WorkoutSimulationContext {
  type: "WORKOUT";
  sessionId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "ABORTED_INJURY";
  horse: {
    id: string;
    horseCode: string | null;
    name: string;
    microchip?: string | null;
    microchipRfid?: string | null;
    breed: string;
    dob: string;
    gender: string;
    color: string;
    status: string;
    isMedicalLocked: boolean;
  };
  workout: {
    id: string;
    scheduledDate: string;
    workoutType: string | null;
    intensity: string | null;
    distanceMeters: number;
    repetitions: number;
    targetSpeedKmh: number | null;
    targetDurationSeconds: number | null;
    trackSurface: string | null;
  };
}

export interface ExamSimulationContext {
  type: "EXAM";
  sessionId: string;
  status: "PENDING" | "RUNNING" | "COMPLETED" | "ABORTED_INJURY";
  horse: WorkoutSimulationContext["horse"];
  medicalRecordId: string | null;
}

export type SimulationContext = WorkoutSimulationContext | ExamSimulationContext;

export interface TrialSetup {
  surface: Surface;
  distance: number;
  intensity: Intensity;
  condition: TrackCondition;
  obstacles: Obstacle[];
}

export class SimulatorApiError extends Error {
  readonly code?: string;
  readonly statusCode?: number;
  readonly data?: unknown;

  constructor(message: string, code?: string, statusCode?: number, data?: unknown) {
    const formatted = code ? `[${code}] ${message}` : message;
    super(formatted);
    this.name = "SimulatorApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.data = data;
  }
}

export function sessionIdFromSearch(search: string): string | null {
  const param = new URLSearchParams(search).get("sessionId");
  if (!param) return null;
  const trimmed = param.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateSimulationContext(
  expectedSessionId: string,
  raw: unknown,
): SimulationContext {
  if (!raw || typeof raw !== "object") {
    throw new SimulatorApiError(
      "Simulation context payload must be a non-null object.",
      "INVALID_SIMULATOR_CONTEXT",
      200,
      raw,
    );
  }

  const payload = raw as Record<string, unknown>;

  if (typeof payload.sessionId !== "string" || !payload.sessionId.trim()) {
    throw new SimulatorApiError(
      "Simulation context payload missing non-empty sessionId.",
      "INVALID_SIMULATOR_CONTEXT",
      200,
      raw,
    );
  }

  if (payload.sessionId !== expectedSessionId) {
    throw new SimulatorApiError(
      `Simulation context sessionId mismatch: expected '${expectedSessionId}', received '${payload.sessionId}'.`,
      "INVALID_SIMULATOR_CONTEXT",
      200,
      raw,
    );
  }

  if (payload.type !== "WORKOUT" && payload.type !== "EXAM") {
    throw new SimulatorApiError(
      `Invalid simulation context type: ${String(payload.type)}.`,
      "INVALID_SIMULATOR_CONTEXT",
      200,
      raw,
    );
  }

  if (!payload.horse || typeof payload.horse !== "object") {
    throw new SimulatorApiError(
      "Simulation context payload missing horse object.",
      "INVALID_SIMULATOR_CONTEXT",
      200,
      raw,
    );
  }

  const horse = payload.horse as Record<string, unknown>;
  if (typeof horse.id !== "string" || !horse.id.trim()) {
    throw new SimulatorApiError(
      "Simulation context payload missing non-empty horse.id.",
      "INVALID_SIMULATOR_CONTEXT",
      200,
      raw,
    );
  }

  if (payload.type === "WORKOUT") {
    if (!payload.workout || typeof payload.workout !== "object") {
      throw new SimulatorApiError(
        "WORKOUT simulation context missing workout object.",
        "INVALID_SIMULATOR_CONTEXT",
        200,
        raw,
      );
    }
    const workout = payload.workout as Record<string, unknown>;
    if (typeof workout.id !== "string" || !workout.id.trim()) {
      throw new SimulatorApiError(
        "WORKOUT simulation context missing valid workout.id.",
        "INVALID_SIMULATOR_CONTEXT",
        200,
        raw,
      );
    }
    if (
      typeof workout.distanceMeters !== "number" ||
      Number.isNaN(workout.distanceMeters) ||
      workout.distanceMeters <= 0
    ) {
      throw new SimulatorApiError(
        "WORKOUT simulation context missing valid distanceMeters.",
        "INVALID_SIMULATOR_CONTEXT",
        200,
        raw,
      );
    }
    return payload as unknown as WorkoutSimulationContext;
  }

  if (payload.type === "EXAM") {
    if (
      "medicalRecordId" in payload &&
      typeof payload.medicalRecordId !== "string" &&
      payload.medicalRecordId !== null
    ) {
      throw new SimulatorApiError(
        "EXAM simulation context has invalid medicalRecordId.",
        "INVALID_SIMULATOR_CONTEXT",
        200,
        raw,
      );
    }
    return payload as unknown as ExamSimulationContext;
  }

  throw new SimulatorApiError(
    "Unrecognized simulation context structure.",
    "INVALID_SIMULATOR_CONTEXT",
    200,
    raw,
  );
}

export async function getWorkoutSimulationContext(
  sessionId: string,
): Promise<SimulationContext> {
  const cleanId = sessionId?.trim();
  if (!cleanId) throw new Error("A backend-issued sessionId is required.");

  const url = `${API_BASE_URL}/simulator/sessions/${encodeURIComponent(cleanId)}/context`;
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    let code: string | undefined;
    let message = `HTTP ${res.status}: ${res.statusText}`;
    let data: unknown;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson === "object") {
        code = typeof errJson.code === "string" ? errJson.code : undefined;
        message = typeof errJson.message === "string" ? errJson.message : (errJson.error || message);
        data = errJson.data;
      }
    } catch {
      // ignore JSON parse error, use default status text
    }
    throw new SimulatorApiError(message, code, res.status, data);
  }

  const json = await res.json();
  const rawContext =
    json && typeof json === "object" && "data" in json ? json.data : json;
  return validateSimulationContext(cleanId, rawContext);
}

export function workoutToTrialSetup(
  workout: WorkoutSimulationContext["workout"],
): TrialSetup {
  const surface: Surface =
    workout.trackSurface === "DIRT"
      ? "SAND"
      : workout.trackSurface === "SYNTHETIC"
        ? "MIXED"
        : "GRASS";
  const intensity: Intensity =
    workout.intensity === "LIGHT"
      ? "LIGHT"
      : workout.intensity === "HEAVY"
        ? "HEAVY"
        : "MODERATE";
  return {
    surface,
    distance: workout.distanceMeters,
    intensity,
    condition: "GOOD",
    obstacles: [],
  };
}
