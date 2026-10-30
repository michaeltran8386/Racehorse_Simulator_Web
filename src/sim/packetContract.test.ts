import assert from "node:assert/strict";
import test from "node:test";
import { alertsOf, createRun, summarize, type HorseProfile, type RunState } from "./engine.ts";
import { seedHorses } from "./horses.ts";

/**
 * Packet contract generators matching Backend DTOs and Socket.IO events.
 * Evaluates the SRS §9 Data Contract & NestJS SimulatorGateway schemas.
 */

function horseRef(h: HorseProfile) {
  return {
    horse_id: h.id,
    microchip_id: h.microchip,
    lifecycle_status: h.lifecycle,
    medical_lock: h.medicalLock,
  };
}

function tickPacket(sessionId: string, h: HorseProfile, run: RunState, speedMultiplier: number) {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    event: "sim:telemetry_tick" as const,
    session_id: sessionId,
    timestamp_ms: Date.now(),
    sim_time_s: r1(run.t),
    sim_speed_multiplier: speedMultiplier,
    horse: horseRef(h),
    track: {
      surface: run.surface,
      target_distance_m: run.targetM,
      covered_distance_m: r1(Math.min(run.distance, run.targetM)),
      track_condition: run.condition,
      obstacles_cleared: run.cleared,
      obstacles_total: run.obstacles.length,
    },
    metrics: {
      velocity_mps: r1(run.v),
      heart_rate_bpm: Math.round(run.hr),
      stamina_pct: r1(run.stamina),
      body_temp_c: r1(run.tempC),
      stride_length_m: Math.round(run.strideLenM * 100) / 100,
      stride_freq_spm: Math.round(run.strideFreqHz * 60),
      calories_kcal: r1(run.kcal),
    },
    alerts: alertsOf(run),
  };
}

type IncidentKind = "FRACTURE" | "LAMENESS" | "COLIC" | "FEVER";
const INCIDENT_LABEL: Record<IncidentKind, string> = {
  FRACTURE: "Gãy xương chân cấp tính",
  LAMENESS: "Khập khiễng (Limp)",
  COLIC: "Đau bụng (Colic)",
  FEVER: "Sốt cao",
};

function incidentPacket(
  sessionId: string | null,
  h: HorseProfile,
  kind: IncidentKind,
  location: "TRACK" | "STALL",
  run?: RunState,
  packetId?: string,
) {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  const pid = packetId || `inc-${sessionId ?? "stall"}-${h.id}-${kind}-${Date.now()}`;
  return {
    event: "sim:incident_report" as const,
    packet_id: pid,
    session_id: sessionId,
    timestamp_ms: Date.now(),
    horse: horseRef(h),
    incident: { kind, label: INCIDENT_LABEL[kind], location, stall: h.stall },
    snapshot: run
      ? {
          covered_distance_m: r1(run.distance),
          velocity_mps: r1(run.v),
          heart_rate_bpm: Math.round(run.hr),
          body_temp_c: r1(run.tempC),
        }
      : null,
    notify: {
      managing_actors: ["HEAD_TRAINER", "HORSE_OWNER", "GROOM", "CLUB_MANAGER"],
      veterinarian_scope: location === "TRACK" ? "ALL_HORSES_ON_TRACK" : "ALL_HORSES_IN_STALLS",
    },
  };
}

function workoutFinishedPacket(sessionId: string, h: HorseProfile, run: RunState, packetId?: string) {
  return {
    event: "sim:session_finished" as const,
    packet_id: packetId || `fin-${sessionId}-${h.id}`,
    session_id: sessionId,
    type: "WORKOUT" as const,
    status: run.status === "ABORTED_INJURY" ? "ABORTED_INJURY" : "COMPLETED",
    horse: horseRef(h),
    surface: run.surface,
    distance_planned_m: run.targetM,
    result: summarize(run),
  };
}

function examFinishedPacket(sessionId: string, h: HorseProfile) {
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    event: "sim:exam_finished" as const,
    session_id: sessionId,
    horse_id: h.id,
    captured_at: new Date().toISOString(),
    model_version: "equiflow-sim-v3",
    source: "EQUIFLOW_SIMULATOR" as const,
    metrics: {
      temperature: { value: r1(37.7 + (1 - h.fitness) * 2), unit: "CELSIUS" as const },
      resting_heart_rate: { value: Math.round(h.hrRest), unit: "BPM" as const },
      respiratory_rate: { value: Math.round(10 + (1 - h.fitness) * 12), unit: "BREATHS_PER_MINUTE" as const },
      weight: { value: h.weightKg, unit: "KG" as const },
    },
  };
}

function lockSyncPacket(h: HorseProfile, locked: boolean) {
  return {
    event: "sys:medical_lock_sync" as const,
    horse_id: h.id,
    medical_lock: locked,
    issued_by_role: "VETERINARIAN",
    lock_actions: locked ? ["BLOCK_HEAVY_WORKOUT", "BLOCK_TOURNAMENT_ENTRY"] : [],
    note: "Khóa y tế đồng bộ thời gian thực từ Main Web",
  };
}

test("packet generators preserve the BE telemetry, incident, and finish contract", () => {
  const horse = seedHorses()[0];
  const run = createRun(horse, { surface: "GRASS", distanceM: 1200, pace: 0.9 }, 1);

  const tick = tickPacket("session-1", horse, run, 1);
  assert.equal(tick.event, "sim:telemetry_tick");
  assert.equal(tick.session_id, "session-1");
  assert.equal(tick.horse.horse_id, horse.id);
  assert.equal(tick.horse.microchip_id, horse.microchip);
  assert.deepEqual(tick.alerts, {
    overload_warning: false,
    limp_detected: false,
    heat_stress: false,
  });

  const incident = incidentPacket(null, horse, "COLIC", "STALL", undefined, "packet-1");
  assert.equal(incident.event, "sim:incident_report");
  assert.equal(incident.horse.horse_id, horse.id);
  assert.deepEqual(incident.incident.stall, horse.stall);
  assert.deepEqual(incident.notify.managing_actors, ["HEAD_TRAINER", "HORSE_OWNER", "GROOM", "CLUB_MANAGER"]);

  const finished = workoutFinishedPacket("session-1", horse, run, "packet-2");
  assert.equal(finished.event, "sim:session_finished");
  assert.equal(finished.horse.horse_id, horse.id);
  assert.equal(finished.type, "WORKOUT");
  assert.equal(finished.status, "COMPLETED");
  assert.equal(finished.result.distanceCompletedM, 0);
});

test("exam result carries bounded values, units, provenance, and the real horse id", () => {
  const horse = seedHorses()[0];
  const packet = examFinishedPacket("exam-1", horse);

  assert.equal(packet.event, "sim:exam_finished");
  assert.equal(packet.horse_id, horse.id);
  assert.equal(packet.source, "EQUIFLOW_SIMULATOR");
  assert.equal(packet.metrics.temperature.unit, "CELSIUS");
  assert.ok(packet.metrics.temperature.value >= 35 && packet.metrics.temperature.value <= 43);
  assert.equal(packet.metrics.resting_heart_rate.unit, "BPM");
  assert.ok(packet.metrics.resting_heart_rate.value >= 20 && packet.metrics.resting_heart_rate.value <= 120);
  assert.equal(packet.metrics.respiratory_rate.unit, "BREATHS_PER_MINUTE");
  assert.ok(packet.metrics.respiratory_rate.value >= 4 && packet.metrics.respiratory_rate.value <= 60);
  assert.equal(packet.metrics.weight.unit, "KG");
  assert.equal(packet.metrics.weight.value, horse.weightKg);
});

test("lock sync packet matches sys:medical_lock_sync specification", () => {
  const horse = seedHorses()[0];
  const locked = lockSyncPacket(horse, true);
  assert.equal(locked.event, "sys:medical_lock_sync");
  assert.equal(locked.horse_id, horse.id);
  assert.equal(locked.medical_lock, true);
  assert.equal(locked.issued_by_role, "VETERINARIAN");
  assert.deepEqual(locked.lock_actions, ["BLOCK_HEAVY_WORKOUT", "BLOCK_TOURNAMENT_ENTRY"]);

  const unlocked = lockSyncPacket(horse, false);
  assert.equal(unlocked.event, "sys:medical_lock_sync");
  assert.equal(unlocked.horse_id, horse.id);
  assert.equal(unlocked.medical_lock, false);
  assert.deepEqual(unlocked.lock_actions, []);
});

test("horseRef preserves backend horse_id and standardized microchip", () => {
  const horse = seedHorses()[0];
  const ref = horseRef(horse);
  assert.equal(ref.horse_id, horse.id);
  assert.equal(ref.microchip_id, horse.microchip);
  assert.equal(ref.lifecycle_status, horse.lifecycle);
  assert.equal(ref.medical_lock, horse.medicalLock);

  // Masked microchip preservation (Groom role perspective)
  const maskedHorse = { ...horse, microchip: "***********0001" };
  const maskedRef = horseRef(maskedHorse);
  assert.equal(maskedRef.horse_id, horse.id);
  assert.equal(maskedRef.microchip_id, "***********0001");
});

test("Socket.IO event catalog matches Backend Gateway definitions", () => {
  const SIMULATOR_NAMESPACE = "/simulator";
  const CLIENT_EVENTS = [
    "sim:telemetry_tick",
    "sim:race_progress",
    "sim:incident_report",
    "sim:session_finished",
    "sim:exam_finished",
  ];
  const SERVER_EVENTS = [
    "sys:medical_lock_sync",
  ];

  assert.equal(SIMULATOR_NAMESPACE, "/simulator");
  assert.ok(CLIENT_EVENTS.includes("sim:telemetry_tick"));
  assert.ok(CLIENT_EVENTS.includes("sim:incident_report"));
  assert.ok(CLIENT_EVENTS.includes("sim:session_finished"));
  assert.ok(CLIENT_EVENTS.includes("sim:race_progress"));
  assert.ok(CLIENT_EVENTS.includes("sim:exam_finished"));
  assert.ok(SERVER_EVENTS.includes("sys:medical_lock_sync"));
});
