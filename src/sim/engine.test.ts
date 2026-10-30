// Chạy: npm test  (Node ≥ 22.6 tự bỏ kiểu TypeScript, không cần thư viện test).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRace,
  jumpLift,
  createRun,
  formatMicrochip,
  INTENSITY_PACE,
  standings,
  stepRace,
  stepRun,
  summarize,
  triggerIncident,
  COOLDOWN_S,
  TICK_RATE_HZ,
  createSimulationTicker,
  runSimulationWithTicker,
  type HorseProfile,
  type Surface,
} from "./engine.ts";

const horse: HorseProfile = {
  id: "HRS-T",
  code: "HR-TEST",
  name: "Test",
  breed: "Thoroughbred",
  coat: "BAY",
  gender: "STALLION",
  ageYears: 4,
  weightKg: 485,
  microchip: "985141000000001",
  lifecycle: "DANG_TAP_LUYEN",
  health: "FIT",
  medicalLock: false,
  stall: { col: 0, row: 0 },
  topSpeedMps: 17.5,
  hrRest: 36,
  hrMax: 226,
  hrAlert: 216,
  fitness: 1,
  strategy: "STALKER",
};

function runToEnd(surface: Surface, distanceM: number, pace: number, seed = 1) {
  const run = createRun(horse, { surface, distanceM, pace }, seed);
  while (run.status !== "FINISHED" && run.t < 2000) stepRun(run, horse, 0.05);
  return run;
}

test("bài nặng 1600 m sân cỏ nằm trong dải sinh lý", () => {
  const s = summarize(runToEnd("GRASS", 1600, INTENSITY_PACE.HEAVY));
  assert.ok(s.durationS > 85 && s.durationS < 110, `thời gian ${s.durationS}s`);
  assert.ok(s.topSpeedKmh > 55 && s.topSpeedKmh < 70, `top ${s.topSpeedKmh} km/h`);
  assert.ok(s.peakHr > 190 && s.peakHr <= horse.hrMax, `HR đỉnh ${s.peakHr}`);
  assert.ok(s.avgStrideLenM > 5.5 && s.avgStrideLenM < 7.6, `sải ${s.avgStrideLenM} m`);
  assert.ok(s.avgStrideFreqHz > 2.0 && s.avgStrideFreqHz < 2.5, `tần số ${s.avgStrideFreqHz} Hz`);
  assert.ok(s.finalTempC > 38 && s.finalTempC < 40.5, `thân nhiệt ${s.finalTempC}`);
  assert.ok(s.hrRecovery5m !== null && s.hrRecovery5m > 55 && s.hrRecovery5m < 120, `HR hồi phục ${s.hrRecovery5m}`);
});

test("bài nhẹ giữ nhịp tim ở mức nước kiệu", () => {
  const s = summarize(runToEnd("GRASS", 1000, INTENSITY_PACE.LIGHT));
  assert.ok(s.peakHr > 80 && s.peakHr < 140, `HR đỉnh ${s.peakHr}`);
});

test("sân cát chậm hơn sân cỏ", () => {
  const grass = summarize(runToEnd("GRASS", 1200, INTENSITY_PACE.HEAVY));
  const sand = summarize(runToEnd("SAND", 1200, INTENSITY_PACE.HEAVY));
  assert.ok(sand.durationS > grass.durationS);
});

test("cùng seed cho cùng kết quả", () => {
  assert.deepEqual(
    summarize(runToEnd("MIXED", 800, 0.8, 42)),
    summarize(runToEnd("MIXED", 800, 0.8, 42)),
  );
});

test("gãy chân: dừng hẳn, HR vọt, trạng thái ABORTED_INJURY", () => {
  const run = createRun(horse, { surface: "GRASS", distanceM: 1600, pace: 0.95 }, 3);
  while (run.t < 20) stepRun(run, horse, 0.05);
  triggerIncident(run, "FRACTURE");
  while (run.t < 32) stepRun(run, horse, 0.05);
  assert.equal(run.status, "ABORTED_INJURY");
  assert.ok(run.v < 0.5, `v ${run.v}`);
  assert.ok(run.hr > 195, `HR ${run.hr}`);
});

test("đua 6 ngựa: thứ hạng duy nhất, thời gian tăng dần", () => {
  const field = [17.2, 17.4, 17.6, 17.0, 17.8, 17.3].map((top, i) => ({
    ...horse,
    id: `H${i}`,
    topSpeedMps: top,
    strategy: (["FRONT", "STALKER", "CLOSER"] as const)[i % 3],
  }));
  const race = createRace(field, 1200, "GRASS", 7);
  while (!race.done && race.t < 300) stepRace(race, 0.05);
  const order = standings(race);
  assert.equal(new Set(order.map((e) => e.horse.id)).size, 6);
  for (let i = 1; i < order.length; i++) {
    assert.ok((order[i].run.finishTime ?? 0) >= (order[i - 1].run.finishTime ?? 0));
  }
});

test("chướng ngại & sân lầy làm chậm, đếm đủ số lần vượt", () => {
  const plain = runToEnd("GRASS", 1000, INTENSITY_PACE.HEAVY);
  const run = createRun(horse, { surface: "GRASS", distanceM: 1000, pace: INTENSITY_PACE.HEAVY, condition: "HEAVY", obstacles: [{ atM: 300, kind: "RAIL" }, { atM: 500, kind: "MUD" }, { atM: 700, kind: "HAY" }] }, 1);
  let maxLift = 0;
  while (run.status !== "FINISHED" && run.t < 2000) {
    stepRun(run, horse, 0.05);
    maxLift = Math.max(maxLift, jumpLift(run));
  }
  const s = summarize(run);
  assert.ok(s.durationS > summarize(plain).durationS, "phải chậm hơn khi có chướng ngại + sân lầy");
  assert.equal(s.obstaclesCleared, 3);
  assert.ok(maxLift > 0.9, `nhảy cao ${maxLift}`);
});

test("mã chip 15 số được chia nhóm 3 số cho dễ đọc", () => {
  assert.equal(formatMicrochip("985141000000001"), "985 141 000 000 001");
  assert.equal(formatMicrochip("9851"), "985 1");
});

test("ticker: phát nhịp đúng 1.0 Hz ±5% qua các bước thời gian khác nhau (60 FPS, 20 FPS, bước bất định)", () => {
  // Test 60 FPS (dt = 1/60s)
  const ticker60 = createSimulationTicker(TICK_RATE_HZ);
  const dt60 = 1 / 60;
  for (let i = 0; i < 60 * 100; i++) {
    ticker60.step(dt60);
  }
  const hz60 = ticker60.getEffectiveHz();
  assert.ok(hz60 >= 0.95 && hz60 <= 1.05, `60 FPS ticker effective Hz ${hz60}`);
  assert.equal(ticker60.ticksEmitted, 100);

  // Test 20 FPS (dt = 0.05s)
  const ticker20 = createSimulationTicker(TICK_RATE_HZ);
  for (let i = 0; i < 20 * 100; i++) {
    ticker20.step(0.05);
  }
  const hz20 = ticker20.getEffectiveHz();
  assert.ok(hz20 >= 0.95 && hz20 <= 1.05, `20 FPS ticker effective Hz ${hz20}`);
  assert.equal(ticker20.ticksEmitted, 100);

  // Test variable time steps (jitter between ~0.016s and ~0.040s)
  const tickerVar = createSimulationTicker(TICK_RATE_HZ);
  let simTime = 0;
  let ticks = 0;
  while (simTime < 100) {
    const dt = 0.016 + ((simTime * 17) % 7) * 0.004;
    simTime += dt;
    ticks += tickerVar.step(dt);
  }
  const hzVar = tickerVar.getEffectiveHz();
  assert.ok(hzVar >= 0.95 && hzVar <= 1.05, `Variable FPS ticker effective Hz ${hzVar}`);
});

test("ticker: runSimulationWithTicker chạy toàn bộ bài tập với tần số 1.0 Hz ±5%", () => {
  let tickCount = 0;
  const res = runSimulationWithTicker(
    horse,
    { surface: "GRASS", distanceM: 1000, pace: INTENSITY_PACE.LIGHT },
    1,
    0.05,
    undefined,
    () => {
      tickCount++;
    },
  );

  assert.equal(res.inTolerance, true);
  assert.ok(res.effectiveHz >= 0.95 && res.effectiveHz <= 1.05, `effectiveHz ${res.effectiveHz}`);
  assert.equal(res.ticks, tickCount);
  assert.ok(res.ticks > 0);
  assert.equal(res.run.status, "FINISHED");
});

test("cooldown: hrRecovery5m được ghi nhận tại 300s và hrRecovery10m tại 600s, không gán chéo trong summarize()", () => {
  assert.equal(COOLDOWN_S, 600, "Thời gian hạ nhiệt chuẩn hóa là 600s (10 phút)");
  const run = createRun(horse, { surface: "GRASS", distanceM: 1600, pace: INTENSITY_PACE.HEAVY }, 1);
  // Chạy cho đến khi qua vạch đích vào COOLDOWN
  while (run.status === "RUNNING" && run.t < 500) {
    stepRun(run, horse, 0.05);
  }
  assert.equal(run.status, "COOLDOWN");
  assert.ok(run.finishTime !== null);

  // Trước 300s: cả 5m và 10m đều là null
  while (run.t - run.finishTime < 299) {
    stepRun(run, horse, 0.05);
  }
  assert.equal(run.hrRecovery5m, null, "Trước 300s, hrRecovery5m phải là null");
  assert.equal(run.hrRecovery10m, null, "Trước 600s, hrRecovery10m phải là null");

  // Vừa qua mốc 300s (5 phút hạ nhiệt): hrRecovery5m được ghi nhận, hrRecovery10m vẫn là null
  while (run.t - run.finishTime < 301) {
    stepRun(run, horse, 0.05);
  }
  assert.ok(run.hrRecovery5m !== null, "Tại 300s, hrRecovery5m phải được ghi nhận");
  assert.equal(run.hrRecovery10m, null, "Tại 300s, hrRecovery10m vẫn phải là null");
  const captured5m = run.hrRecovery5m;

  // Tiếp tục đến trước 600s: hrRecovery5m giữ nguyên giá trị đã ghi nhận, hrRecovery10m vẫn là null
  while (run.t - run.finishTime < 599) {
    stepRun(run, horse, 0.05);
  }
  assert.equal(run.hrRecovery5m, captured5m, "hrRecovery5m không bị gán lại trước 600s");
  assert.equal(run.hrRecovery10m, null, "Trước 600s, hrRecovery10m vẫn phải là null");

  // Vừa qua mốc 600s (10 phút hạ nhiệt): hrRecovery10m được ghi nhận và trạng thái chuyển sang FINISHED
  while ((run.status as string) !== "FINISHED" && run.t < 2000) {
    stepRun(run, horse, 0.05);
  }
  assert.equal(run.status, "FINISHED");
  assert.ok(run.hrRecovery10m !== null, "Tại 600s, hrRecovery10m phải được ghi nhận");
  assert.equal(run.hrRecovery5m, captured5m, "hrRecovery5m phải giữ nguyên giá trị đo lúc 300s, không bị gán đè lúc 600s");
  assert.ok(run.hrRecovery10m <= run.hrRecovery5m, `HR 10m (${run.hrRecovery10m}) phải <= HR 5m (${run.hrRecovery5m})`);

  // summarize() giữ nguyên cả 2 giá trị độc lập, không populate hrRecovery5m từ hrRecovery10m
  const s = summarize(run);
  assert.equal(s.hrRecovery5m, captured5m);
  assert.equal(s.hrRecovery10m, run.hrRecovery10m);
});

test("chấn thương gãy chân hủy bài (ABORTED_INJURY) nhưng không bao giờ tự ý bật medicalLock của ngựa", () => {
  const testHorse: HorseProfile = { ...horse, medicalLock: false };
  const run = createRun(testHorse, { surface: "GRASS", distanceM: 1600, pace: 0.95 }, 3);
  while (run.t < 20) stepRun(run, testHorse, 0.05);
  triggerIncident(run, "FRACTURE");
  while (run.t < 32) stepRun(run, testHorse, 0.05);

  assert.equal(run.status, "ABORTED_INJURY");
  // Invariant 7: Catastrophic injury aborts session but never creates a MedicalRecord or MedicalLock automatically
  assert.equal(testHorse.medicalLock, false, "medicalLock không được tự động bật bởi engine");
});

test("catastrophic-abort: runSimulationWithTicker dừng ngay sau khi ngựa dừng bước (không chạy đến maxT) và không bao giờ bật medicalLock", () => {
  const testHorse: HorseProfile = { ...horse, medicalLock: false };
  let fractureTriggeredAt: number | null = null;
  const res = runSimulationWithTicker(
    testHorse,
    { surface: "GRASS", distanceM: 1600, pace: 0.95 },
    3,
    0.05,
    2000,
    (run, simTime) => {
      if (simTime >= 10 && run.status === "RUNNING") {
        triggerIncident(run, "FRACTURE");
        fractureTriggeredAt = run.t;
      }
    },
  );

  assert.equal(res.run.status, "ABORTED_INJURY");
  assert.equal(res.run.incident, "FRACTURE");
  assert.ok(fractureTriggeredAt !== null);
  // Ngựa giảm tốc và dừng hẳn trong vòng 15 giây sau sự cố
  assert.ok(res.run.t <= fractureTriggeredAt + 15.0, `run.t (${res.run.t}) phải <= ${fractureTriggeredAt + 15.0}`);
  assert.ok(res.durationS < 30, `durationS (${res.durationS}) phải < 30s, không được tiếp tục chạy đến maxT (2000s)`);
  assert.ok(res.run.v <= 0.05, `Tốc độ ngựa khi dừng phải <= 0.05 m/s (thực tế: ${res.run.v})`);
  // Invariant 7: Catastrophic injury aborts session but never creates a MedicalRecord or MedicalLock automatically
  assert.equal(testHorse.medicalLock, false, "medicalLock không bao giờ bị mutate bởi engine");
  assert.equal(res.summary.incident, "FRACTURE");
});
