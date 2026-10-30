// Gói tin JSON theo SRS §9 (Data Contract). Tên trường snake_case giữ nguyên như tài liệu.
import { alertsOf, HORSE_LENGTH_M, summarize, type HorseProfile, type Race, type RunState, standings } from "./engine.ts";

const r1 = (x: number) => Math.round(x * 10) / 10;

let sessionSeq = 0;
export function newSessionId(prefix: "WRK" | "RACE"): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${prefix}-${ymd}-${String(++sessionSeq).padStart(3, "0")}`;
}

export function horseRef(h: HorseProfile) {
  return { horse_id: h.id, microchip_id: h.microchip, lifecycle_status: h.lifecycle, medical_lock: h.medicalLock };
}

export function tickPacket(sessionId: string, h: HorseProfile, run: RunState, speedMultiplier: number) {
  return {
    event: "sim:telemetry_tick",
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

export type IncidentKind = "FRACTURE" | "LAMENESS" | "COLIC" | "FEVER";
export const INCIDENT_LABEL: Record<IncidentKind, string> = {
  FRACTURE: "Gãy xương chân cấp tính",
  LAMENESS: "Khập khiễng (Limp)",
  COLIC: "Đau bụng (Colic)",
  FEVER: "Sốt cao",
};

/**
 * Báo sự cố: Simulator không tự khóa y tế. Backend nhận gói này rồi gửi thông báo cho các actor quản lý
 * con ngựa; VET nhận thông báo y tế của mọi ngựa đang ở cùng `location` (quyết định ngày 18/10/2026).
 */
export function incidentPacket(
  sessionId: string | null,
  h: HorseProfile,
  kind: IncidentKind,
  location: "TRACK" | "STALL",
  run?: RunState,
  packetId?: string,
) {
  const pid = packetId || `inc-${sessionId ?? "stall"}-${h.id}-${kind}-${Date.now()}`;
  return {
    event: "sim:incident_report",
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

export function workoutFinishedPacket(sessionId: string, h: HorseProfile, run: RunState, packetId?: string) {
  return {
    event: "sim:session_finished",
    packet_id: packetId || `fin-${sessionId}-${h.id}`,
    session_id: sessionId,
    type: "WORKOUT",
    status: run.status === "ABORTED_INJURY" ? "ABORTED_INJURY" : "COMPLETED",
    horse: horseRef(h),
    surface: run.surface,
    distance_planned_m: run.targetM,
    result: summarize(run),
  };
}

export function examFinishedPacket(sessionId: string, h: HorseProfile) {
  return {
    event: "sim:exam_finished",
    session_id: sessionId,
    horse_id: h.id,
    captured_at: new Date().toISOString(),
    model_version: "equiflow-sim-v3",
    source: "EQUIFLOW_SIMULATOR",
    metrics: {
      temperature: { value: r1(37.7 + (1 - h.fitness) * 2), unit: "CELSIUS" },
      resting_heart_rate: { value: Math.round(h.hrRest), unit: "BPM" },
      respiratory_rate: { value: Math.round(10 + (1 - h.fitness) * 12), unit: "BREATHS_PER_MINUTE" },
      weight: typeof h.weightKg === "number" && !isNaN(h.weightKg) ? { value: h.weightKg, unit: "KG" } : { value: null, unit: "KG" },
    },
  };
}

export function raceProgressPacket(sessionId: string, race: Race) {
  const order = standings(race);
  const leader = order[0]?.run.distance ?? 0;
  return {
    event: "sim:race_progress",
    session_id: sessionId,
    sim_time_s: r1(race.t),
    positions: order.map((e, i) => ({
      position: i + 1,
      lane: e.lane,
      horse_id: e.horse.id,
      covered_distance_m: r1(Math.min(e.run.distance, race.distanceM)),
      gap_lengths: r1((leader - e.run.distance) / HORSE_LENGTH_M),
      velocity_mps: r1(e.run.v),
      heart_rate_bpm: Math.round(e.run.hr),
      status: e.run.status === "ABORTED_INJURY" ? "DNF" : e.run.finishTime !== null ? "FINISHED" : "RUNNING",
    })),
  };
}

export function raceFinishedPacket(sessionId: string, race: Race, packetId?: string) {
  return {
    event: "sim:session_finished",
    packet_id: packetId || `fin-${sessionId}-race`,
    session_id: sessionId,
    type: "RACE",
    surface: race.surface,
    distance_m: race.distanceM,
    results: standings(race).map((e, i) => ({
      final_rank: e.run.status === "ABORTED_INJURY" ? null : i + 1,
      lane: e.lane,
      horse_id: e.horse.id,
      status: e.run.status === "ABORTED_INJURY" ? "DNF" : "FINISHED",
      finish_time_s: e.run.finishTime === null ? null : Math.round(e.run.finishTime * 100) / 100,
      avg_speed_kmh: e.run.finishTime ? r1((race.distanceM / e.run.finishTime) * 3.6) : null,
      peak_heart_rate_bpm: Math.round(e.run.peakHr),
    })),
  };
}

export function lockSyncPacket(h: HorseProfile, locked: boolean) {
  return {
    event: "sys:medical_lock_sync",
    horse_id: h.id,
    medical_lock: locked,
    issued_by_role: "VETERINARIAN",
    lock_actions: locked ? ["BLOCK_HEAVY_WORKOUT", "BLOCK_TOURNAMENT_ENTRY"] : [],
    note: "Giả lập lệnh từ Main Web (chưa nối Backend)",
  };
}
