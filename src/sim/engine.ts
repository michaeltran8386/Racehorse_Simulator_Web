// Telemetry Math Engine — thay cho Mục 5 bị cắt trong SRS v2.0. Hàm thuần, không phụ thuộc DOM,
// có seed để chạy lại ra đúng kết quả (demo / kiểm thử). Đơn vị nội bộ: mét, giây, m/s, bpm, °C, kcal.
//
// Dải giá trị tham chiếu (số liệu phổ biến trong y văn thể thao ngựa — cần kiểm chứng lại khi viết báo cáo):
// - Nhịp tim nghỉ Thoroughbred 28–44 bpm; HRmax 204–241 bpm; HR tăng gần tuyến tính theo tốc độ rồi bão hòa
//   (Evans & Rose 1988; Hodgson & Rose "The Athletic Horse"). SRS: nghỉ tại chuồng 38–45 bpm.
// - Tốc độ: đi bộ ~1.7 m/s, nước kiệu 4–5 m/s, phi nước đại đua 16–18 m/s (58–65 km/h).
// - Sải phi nước đại 6–7.5 m, tần số 2.1–2.5 sải/s (StrideSAFE / nghiên cứu động học sải).
// - Thân nhiệt nghỉ 37.2–38.3 °C, sau đua 39–40 °C, >40.5 °C nguy cơ sốc nhiệt (tiêu chuẩn thú y FEI).
// - Hồi phục: HR 5 phút sau bài ≤ 85 bpm = tốt, > 110 bpm = cảnh báo tim mạch (tài liệu Flow 2 dự án).
// - Năng lượng vận động ~1.4–2.6 J/kg/m tùy cường độ (ước tính chi phí vận chuyển của ngựa).

export type Surface = "GRASS" | "SAND" | "MIXED";
export type Intensity = "LIGHT" | "MODERATE" | "HEAVY";
export type Coat = "BAY" | "CHESTNUT" | "BLACK" | "GRAY" | "ROAN";
export type Lifecycle =
  | "SAN_SANG_THI_DAU"
  | "DANG_TAP_LUYEN"
  | "CAN_THEO_DOI"
  | "CHAN_THUONG"
  | "CACH_LY"
  | "NGHI_NGOI";
export type StallHealth = "FIT" | "WATCH" | "INJURED" | "ISOLATED";
export type Strategy = "FRONT" | "STALKER" | "CLOSER";
export type Incident = "FRACTURE" | "LAMENESS";
export type RunStatus = "RUNNING" | "COOLDOWN" | "FINISHED" | "ABORTED_INJURY";

export interface HorseProfile {
  id: string;
  code: string;
  name: string;
  breed: string;
  coat: Coat;
  gender: "STALLION" | "MARE" | "GELDING";
  ageYears: number;
  weightKg: number;
  microchip: string;
  lifecycle: Lifecycle;
  health: StallHealth;
  medicalLock: boolean;
  stall: { col: number; row: number };
  topSpeedMps: number;
  hrRest: number;
  hrMax: number;
  hrAlert: number;
  /** 0.85 (kém) – 1.15 (rất tốt): chia vào mức hao thể lực và nợ nhịp tim sau bài. */
  fitness: number;
  strategy: Strategy;
}

/** "985141000000001" → "985 141 000 000 001": người xem phổ thông đọc/đối chiếu theo nhóm 3 số. */
export const formatMicrochip = (chip: string) => chip.replace(/(\d{3})(?=\d)/g, "$1 ");

// Hệ số mặt sân K (SRS M1). Cỏ nhanh & ít hao, cát chậm & hao nhiều, hỗn hợp trung tính.
export const SURFACE: Record<Surface, { speed: number; drain: number }> = {
  GRASS: { speed: 1.05, drain: 0.9 },
  SAND: { speed: 0.92, drain: 1.25 },
  MIXED: { speed: 1.0, drain: 1.0 },
};

// Tỉ lệ tốc độ mục tiêu so với tốc độ tối đa: nhẹ ≈ nước kiệu, vừa ≈ nước kiệu nhanh/canter, nặng ≈ breeze.
export const INTENSITY_PACE: Record<Intensity, number> = { LIGHT: 0.45, MODERATE: 0.7, HEAVY: 0.95 };

// Tình trạng mặt sân (khớp WorkoutSession.trackCondition): ướt / lầy làm chậm và hao sức hơn.
export type TrackCondition = "GOOD" | "WET" | "HEAVY";
export const CONDITION: Record<TrackCondition, { speed: number; drain: number }> = {
  GOOD: { speed: 1, drain: 1 },
  WET: { speed: 0.96, drain: 1.1 },
  HEAVY: { speed: 0.9, drain: 1.25 },
};

// Chướng ngại dựng trước buổi chạy thử (M3): rào thấp / kiện rơm phải giảm tốc để nhảy và tốn sức mỗi lần nhảy;
// vũng bùn dài 12 m làm chậm và hao sức khi lội qua.
export type ObstacleKind = "RAIL" | "HAY" | "MUD";
export interface Obstacle {
  atM: number;
  kind: ObstacleKind;
}
export const OBSTACLE: Record<ObstacleKind, { approachM: number; speed: number; staminaCost: number; lengthM: number; lift: number }> = {
  RAIL: { approachM: 8, speed: 0.94, staminaCost: 0.4, lengthM: 0, lift: 0.7 },
  HAY: { approachM: 10, speed: 0.9, staminaCost: 0.8, lengthM: 0, lift: 1 },
  MUD: { approachM: 0, speed: 0.8, staminaCost: 0, lengthM: 12, lift: 0 },
};
const MUD_DRAIN = 1.5;
const JUMP_HALF_M = 3;

const WALK_MPS = 1.7;
export const COOLDOWN_S = 600; // 10 phút đi bộ hồi phục theo form kết quả chính thức
const REST_TEMP_C = 37.8;

export interface RunState {
  t: number;
  distance: number;
  targetM: number;
  surface: Surface;
  pace: number;
  v: number;
  hr: number;
  stamina: number;
  tempC: number;
  kcal: number;
  strideLenM: number;
  strideFreqHz: number;
  /** Nợ nhịp tim sau gắng sức — giảm dần khi đi bộ hồi phục. */
  hrDebt: number;
  status: RunStatus;
  incident: Incident | null;
  overloadSec: number;
  peakHr: number;
  topV: number;
  finishTime: number | null;
  hrRecovery10m: number | null;
  hrRecovery5m: number | null;
  sums: { hr: number; stride: number; freq: number; n: number };
  rng: number;
  condition: TrackCondition;
  obstacles: Obstacle[];
  /** Số chướng ngại đã vượt qua. */
  cleared: number;
}

export interface RunConfig {
  surface: Surface;
  distanceM: number;
  pace: number;
  condition?: TrackCondition;
  obstacles?: Obstacle[];
}

export interface RunSummary {
  distanceCompletedM: number;
  durationS: number;
  topSpeedKmh: number;
  avgSpeedKmh: number;
  peakHr: number;
  avgHr: number;
  avgStrideLenM: number;
  avgStrideFreqHz: number;
  kcal: number;
  finalTempC: number;
  hrRecovery10m: number | null;
  hrRecovery5m: number | null;
  incident: Incident | null;
  condition: TrackCondition;
  obstaclesCleared: number;
  obstaclesTotal: number;
}

/** mulberry32 — PRNG nhỏ, đủ cho mô phỏng; trả về [0, 1). */
export function nextRandom(state: { rng: number }): number {
  let a = (state.rng = (state.rng + 0x6d2b79f5) | 0);
  a = Math.imul(a ^ (a >>> 15), a | 1);
  a ^= a + Math.imul(a ^ (a >>> 7), a | 61);
  return ((a ^ (a >>> 14)) >>> 0) / 4294967296;
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
/** Tiến về đích theo hằng số thời gian tau (hệ bậc 1) — dùng cho nhịp tim, không phụ thuộc bước dt. */
const approach = (x: number, target: number, tau: number, dt: number) =>
  target + (x - target) * Math.exp(-dt / tau);

export function createRun(horse: HorseProfile, cfg: RunConfig, seed: number): RunState {
  return {
    t: 0,
    distance: 0,
    targetM: cfg.distanceM,
    surface: cfg.surface,
    pace: cfg.pace,
    v: 0,
    hr: horse.hrRest + 6, // hưng phấn trước xuất phát
    stamina: 100,
    tempC: REST_TEMP_C,
    kcal: 0,
    strideLenM: 0,
    strideFreqHz: 0,
    hrDebt: 0,
    status: "RUNNING",
    incident: null,
    overloadSec: 0,
    peakHr: 0,
    topV: 0,
    finishTime: null,
    hrRecovery10m: null,
    hrRecovery5m: null,
    sums: { hr: 0, stride: 0, freq: 0, n: 0 },
    rng: seed | 0,
    condition: cfg.condition ?? "GOOD",
    obstacles: [...(cfg.obstacles ?? [])].sort((a, b) => a.atM - b.atM),
    cleared: 0,
  };
}

/** Hệ số tốc độ / hao sức do chướng ngại tại vị trí hiện tại. */
function obstacleEffect(run: RunState): { speed: number; drain: number } {
  let speed = 1;
  let drain = 1;
  for (const o of run.obstacles) {
    const spec = OBSTACLE[o.kind];
    const d = run.distance - o.atM;
    if (o.kind === "MUD") {
      if (d >= 0 && d <= spec.lengthM) {
        speed *= spec.speed;
        drain *= MUD_DRAIN;
      }
    } else if (d >= -spec.approachM && d <= JUMP_HALF_M) speed *= spec.speed;
  }
  return { speed, drain };
}

/** Độ cao bật nhảy 0..1 (để vẽ) khi ngựa đang qua rào / kiện rơm. */
export function jumpLift(run: RunState): number {
  for (const o of run.obstacles) {
    const d = run.distance - o.atM + JUMP_HALF_M;
    if (o.kind !== "MUD" && d >= 0 && d <= JUMP_HALF_M * 2) return Math.sin((Math.PI * d) / (JUMP_HALF_M * 2)) * OBSTACLE[o.kind].lift;
  }
  return 0;
}

/** Tần số sải tăng theo tốc độ rồi bão hòa ~2.3–2.4 Hz; chiều dài sải = v / tần số. */
export function strideFrequency(v: number): number {
  return v < 0.2 ? 0 : 1.0 + 1.4 * (1 - Math.exp(-v / 6));
}

export function triggerIncident(run: RunState, kind: Incident): void {
  if (run.status !== "RUNNING" || run.incident) return;
  run.incident = kind;
  if (kind === "FRACTURE") run.status = "ABORTED_INJURY";
}

/** Bước mô phỏng cố định dt (giây sim). `paceOverride` dùng cho chiến thuật đua. Hàm có mutate `run`. */
export function stepRun(run: RunState, horse: HorseProfile, dt: number, paceOverride?: number): void {
  if (run.status === "FINISHED") return;
  const k = SURFACE[run.surface];
  const cond = CONDITION[run.condition];
  const ob = obstacleEffect(run);
  const top = horse.topSpeedMps * k.speed * cond.speed;
  const drain = k.drain * cond.drain * ob.drain;
  const pace = paceOverride ?? run.pace;
  // Mệt làm giảm tốc độ tối đa đạt được: 100% thể lực → 1.05·top, 0% → 0.75·top.
  const vCap = top * (0.75 + 0.3 * (run.stamina / 100));

  let vTarget: number;
  if (run.status === "ABORTED_INJURY") vTarget = 0;
  else if (run.status === "COOLDOWN") vTarget = WALK_MPS;
  else vTarget = Math.min(top * pace, vCap) * ob.speed;
  if (run.incident === "LAMENESS") vTarget = Math.min(vTarget, 3.2); // khập khiễng: chỉ còn đi/kiệu chậm

  const accel = clamp((vTarget - run.v) / 2.5, run.status === "ABORTED_INJURY" ? -6 : -4, 3);
  run.v = Math.max(0, run.v + accel * dt + (run.v > 3 ? (nextRandom(run) - 0.5) * 0.08 : 0));

  const ratio = clamp(run.v / horse.topSpeedMps, 0, 1.1);
  const step = run.v * dt;
  run.t += dt;
  run.distance += step;

  // Thể lực (%): hao theo lập phương cường độ, hồi khi đi bộ (+2%/phút).
  if (run.v > WALK_MPS + 0.5) run.stamina -= ((0.6 * ratio ** 3 * drain) / horse.fitness) * dt;
  else run.stamina += (2 / 60) * dt;
  // Mỗi chướng ngại vượt qua tốn thêm một lượng thể lực cố định (bật nhảy / lội bùn).
  while (run.cleared < run.obstacles.length) {
    const o = run.obstacles[run.cleared];
    if (run.distance < o.atM + Math.max(OBSTACLE[o.kind].lengthM, JUMP_HALF_M)) break;
    run.stamina -= OBSTACLE[o.kind].staminaCost;
    run.cleared++;
  }
  run.stamina = clamp(run.stamina, 0, 100);

  // Thân nhiệt: tăng theo bình phương cường độ, tản nhiệt về 37.8 °C với tau ~15 phút.
  run.tempC += (0.02 * ratio ** 2 * drain - (run.tempC - REST_TEMP_C) / 900) * dt;

  // Năng lượng: 1.4–2.6 J/kg/m tùy cường độ (≈ 30 kcal/100 m khi breeze, SRS 4.2: ~25 kcal/100 m).
  run.kcal += (step * horse.weightKg * (1.4 + 1.2 * ratio ** 2)) / 4184;

  // Nhịp tim.
  const fatigue = 100 - run.stamina;
  let hrTarget: number;
  let tau: number;
  if (run.status === "ABORTED_INJURY") {
    hrTarget = Math.min(horse.hrMax, 205 + nextRandom(run) * 12); // đau + stress cấp
    tau = 3;
  } else if (run.v > WALK_MPS + 0.5) {
    hrTarget = horse.hrRest + 0.93 * (horse.hrMax - horse.hrRest) * ratio ** 1.6 + fatigue * 0.12;
    run.hrDebt = Math.max(run.hrDebt, (fatigue * 1.2) / horse.fitness);
    tau = hrTarget > run.hr ? 6 : 20;
  } else {
    run.hrDebt = approach(run.hrDebt, 0, 200, dt);
    hrTarget = horse.hrRest + 25 + run.hrDebt + Math.max(0, run.tempC - 38) * 15;
    tau = 20;
  }
  run.hr = clamp(approach(run.hr, hrTarget, tau, dt) + (nextRandom(run) - 0.5) * 0.6, 20, horse.hrMax);

  run.strideFreqHz = strideFrequency(run.v) * (run.incident === "LAMENESS" ? 0.85 : 1);
  run.strideLenM = run.strideFreqHz > 0 ? run.v / run.strideFreqHz : 0;

  run.overloadSec = run.hr >= horse.hrAlert ? run.overloadSec + dt : 0;

  if (run.status === "RUNNING" || run.status === "ABORTED_INJURY") {
    run.peakHr = Math.max(run.peakHr, run.hr);
    run.topV = Math.max(run.topV, run.v);
    if (run.v > WALK_MPS) {
      run.sums.hr += run.hr;
      run.sums.stride += run.strideLenM;
      run.sums.freq += run.strideFreqHz;
      run.sums.n += 1;
    }
  }

  if (run.status === "RUNNING" && run.distance >= run.targetM) {
    run.finishTime = run.t - (run.distance - run.targetM) / Math.max(run.v, 0.1); // nội suy lúc qua vạch
    run.status = "COOLDOWN";
  } else if (run.status === "COOLDOWN" && run.finishTime !== null) {
    const elapsedCooldown = run.t - run.finishTime;
    if (run.hrRecovery5m === null && elapsedCooldown >= 300) {
      run.hrRecovery5m = Math.round(run.hr);
    }
    if (run.hrRecovery10m === null && elapsedCooldown >= COOLDOWN_S) {
      run.hrRecovery10m = Math.round(run.hr);
      run.status = "FINISHED";
    }
  }
}

/** Nghỉ tại chuồng (SIM-02): thể lực +2%/phút, HR quanh mức nghỉ, thân nhiệt về 37.8 °C. */
export function stepRest(
  vitals: { hr: number; stamina: number; tempC: number; rng: number },
  horse: HorseProfile,
  dt: number,
): void {
  vitals.stamina = clamp(vitals.stamina + (2 / 60) * dt, 0, 100);
  vitals.tempC = approach(vitals.tempC, REST_TEMP_C, 900, dt);
  const target = horse.hrRest + 3 + (horse.health === "INJURED" ? 18 : 0) + (nextRandom(vitals) - 0.5) * 4;
  vitals.hr = approach(vitals.hr, target, 30, dt);
}

export interface Alerts {
  overload_warning: boolean;
  limp_detected: boolean;
  heat_stress: boolean;
}

/** Cờ cảnh báo trong gói telemetry: HR ≥ ngưỡng ≥ 5 s, thể lực < 20%, thân nhiệt > 40.5 °C. */
export function alertsOf(run: RunState): Alerts {
  return {
    overload_warning: run.overloadSec >= 5 || run.stamina < 20 || run.tempC > 40.5,
    limp_detected: run.incident !== null,
    heat_stress: run.tempC > 40.5,
  };
}

export function summarize(run: RunState): RunSummary {
  const durationS = run.finishTime ?? run.t;
  const dist = Math.min(run.distance, run.targetM);
  const n = Math.max(run.sums.n, 1);
  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    distanceCompletedM: Math.round(dist),
    durationS: r1(durationS),
    topSpeedKmh: r1(run.topV * 3.6),
    avgSpeedKmh: r1(durationS > 0 ? (dist / durationS) * 3.6 : 0),
    peakHr: Math.round(run.peakHr),
    avgHr: Math.round(run.sums.hr / n),
    avgStrideLenM: Math.round((run.sums.stride / n) * 100) / 100,
    avgStrideFreqHz: Math.round((run.sums.freq / n) * 100) / 100,
    kcal: r1(run.kcal),
    finalTempC: r1(run.tempC),
    hrRecovery10m: run.hrRecovery10m,
    hrRecovery5m: run.hrRecovery5m,
    incident: run.incident,
    condition: run.condition,
    obstaclesCleared: run.cleared,
    obstaclesTotal: run.obstacles.length,
  };
}

// ------------------------------------------------------------------ Đua nhiều ngựa (SIM-05)

export interface RaceEntry {
  lane: number;
  horse: HorseProfile;
  run: RunState;
  /** Phong độ ngày đua ±2% — để kết quả không lặp y hệt giữa các giải. */
  form: number;
}

export interface Race {
  t: number;
  distanceM: number;
  surface: Surface;
  entries: RaceEntry[];
  done: boolean;
}

// Tỉ lệ tốc độ theo chiến thuật: dẫn đầu (front-runner), bám đuổi (stalker), nước rút cuối (closer).
export function strategyPace(strategy: Strategy, progress: number): number {
  if (strategy === "FRONT") return progress < 0.85 ? 0.98 : 0.97;
  if (strategy === "STALKER") return progress < 0.65 ? 0.94 : 1.0;
  return progress < 0.72 ? 0.9 : 1.04;
}

export function createRace(horses: HorseProfile[], distanceM: number, surface: Surface, seed: number): Race {
  const rng = { rng: seed | 0 };
  return {
    t: 0,
    distanceM,
    surface,
    done: false,
    entries: horses.map((horse, i) => ({
      lane: i + 1,
      horse,
      form: 0.98 + nextRandom(rng) * 0.04,
      run: createRun(horse, { surface, distanceM, pace: 0.95 }, (seed + (i + 1) * 7919) | 0),
    })),
  };
}

export function stepRace(race: Race, dt: number): void {
  if (race.done) return;
  race.t += dt;
  for (const e of race.entries) {
    if (e.run.status === "RUNNING" || e.run.status === "ABORTED_INJURY") {
      const progress = e.run.distance / race.distanceM;
      stepRun(e.run, e.horse, dt, strategyPace(e.horse.strategy, progress) * e.form);
    } else if (e.run.status === "COOLDOWN") {
      stepRun(e.run, e.horse, dt);
    }
  }
  race.done = race.entries.every((e) => e.run.finishTime !== null || e.run.status === "ABORTED_INJURY");
}

/** Thứ hạng hiện tại: ngựa đã về đích theo thời gian, sau đó theo quãng đường; DNF xếp cuối. */
export function standings(race: Race): RaceEntry[] {
  const rank = (e: RaceEntry) =>
    e.run.status === "ABORTED_INJURY" ? 2 : e.run.finishTime !== null ? 0 : 1;
  return [...race.entries].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return (a.run.finishTime ?? 0) - (b.run.finishTime ?? 0);
    return b.run.distance - a.run.distance;
  });
}

export const HORSE_LENGTH_M = 2.4;

// ------------------------------------------------------------------ Simulation 1.0 Hz Ticker (CONSTRAINTS §2)

export const TICK_RATE_HZ = 1.0;
export const TICK_INTERVAL_S = 1.0;
export const TICK_TOLERANCE_PCT = 0.05; // ±5% tolerance
export const MIN_TICK_RATE_HZ = TICK_RATE_HZ * (1 - TICK_TOLERANCE_PCT); // 0.95 Hz
export const MAX_TICK_RATE_HZ = TICK_RATE_HZ * (1 + TICK_TOLERANCE_PCT); // 1.05 Hz

export interface SimulationTicker {
  readonly tickAcc: number;
  readonly ticksEmitted: number;
  readonly totalSimTime: number;
  step(dt: number, onTick?: (simTime: number, tickIndex: number) => void): number;
  reset(): void;
  getEffectiveHz(): number;
}

export function createSimulationTicker(targetHz = TICK_RATE_HZ): SimulationTicker {
  let tickAcc = 0;
  let ticksEmitted = 0;
  let totalSimTime = 0;
  const interval = 1.0 / targetHz;

  return {
    get tickAcc() {
      return tickAcc;
    },
    get ticksEmitted() {
      return ticksEmitted;
    },
    get totalSimTime() {
      return totalSimTime;
    },
    step(dt: number, onTick?: (simTime: number, tickIndex: number) => void): number {
      totalSimTime += dt;
      tickAcc += dt;
      let count = 0;
      while (tickAcc >= interval) {
        tickAcc -= interval;
        ticksEmitted++;
        count++;
        if (onTick) {
          onTick(totalSimTime - tickAcc, ticksEmitted);
        }
      }
      return count;
    },
    reset() {
      tickAcc = 0;
      ticksEmitted = 0;
      totalSimTime = 0;
    },
    getEffectiveHz(): number {
      return totalSimTime > 0 ? ticksEmitted / totalSimTime : 0;
    },
  };
}

export interface SimulationRunResult {
  ticks: number;
  durationS: number;
  effectiveHz: number;
  inTolerance: boolean;
  run: RunState;
  summary: RunSummary;
}

export function runSimulationWithTicker(
  horse: HorseProfile,
  cfg: RunConfig,
  seed = 1,
  substepS = 0.05,
  targetDurationS?: number,
  onTick?: (run: RunState, simTime: number, tickIndex: number) => void,
): SimulationRunResult {
  const run = createRun(horse, cfg, seed);
  const ticker = createSimulationTicker(TICK_RATE_HZ);
  const maxT = targetDurationS ?? 2000;

  let abortedAtT: number | null = null;
  while (run.status !== "FINISHED" && run.t < maxT) {
    stepRun(run, horse, substepS);
    ticker.step(substepS, (simTime, tickIndex) => {
      if (onTick) onTick(run, simTime, tickIndex);
    });

    if (run.status === "ABORTED_INJURY") {
      if (abortedAtT === null) {
        abortedAtT = run.t;
      }
      if (run.v <= 0.05 || (run.t - abortedAtT) >= 15.0) {
        break;
      }
    }
  }

  const effectiveHz = ticker.getEffectiveHz();
  const inTolerance = effectiveHz >= MIN_TICK_RATE_HZ && effectiveHz <= MAX_TICK_RATE_HZ;

  return {
    ticks: ticker.ticksEmitted,
    durationS: ticker.totalSimTime,
    effectiveHz,
    inTolerance,
    run,
    summary: summarize(run),
  };
}
