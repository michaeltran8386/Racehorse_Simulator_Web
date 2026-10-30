import test from "node:test";
import assert from "node:assert/strict";
import { MOCK_STALLS } from "./mockData.ts";
import { seedHorses } from "./horses.ts";
import {
  initStalls,
  canAssignHorseToStall,
  assignHorseToStall,
  unassignHorseFromStall,
  getAssignedHorseIds,
  getUnassignedHorses,
} from "./stallAllocation.ts";

test("initStalls returns 20 stalls cloned from MOCK_STALLS", () => {
  const stalls = initStalls();
  assert.equal(stalls.length, 20);
  assert.equal(stalls[0].code, "A-01");
  assert.notEqual(stalls, MOCK_STALLS, "Must be a distinct cloned array");
});

test("canAssignHorseToStall rejects MAINTENANCE or INACTIVE or OCCUPIED stalls", () => {
  const stalls = initStalls();
  const horses = seedHorses();
  const fitHorse = horses[0];

  const maintenanceStall = stalls.find((s) => s.status === "MAINTENANCE")!;
  assert.ok(maintenanceStall, "B-08 is in maintenance");
  const checkMaint = canAssignHorseToStall(maintenanceStall, fitHorse);
  assert.equal(checkMaint.allowed, false);
  assert.match(checkMaint.reason ?? "", /bảo trì/i);

  const inactiveStall = stalls.find((s) => s.status === "INACTIVE")!;
  assert.ok(inactiveStall, "C-04 is inactive");
  const checkInactive = canAssignHorseToStall(inactiveStall, fitHorse);
  assert.equal(checkInactive.allowed, false);
  assert.match(checkInactive.reason ?? "", /ngừng sử dụng/i);

  const occupiedStall = stalls.find((s) => s.status === "OCCUPIED")!;
  assert.ok(occupiedStall, "A-01 is occupied");
  const checkOcc = canAssignHorseToStall(occupiedStall, fitHorse);
  assert.equal(checkOcc.allowed, false);
  assert.match(checkOcc.reason ?? "", /đã có ngựa/i);
});

test("canAssignHorseToStall flags RULE-MED-01 warnings for medicalLocked/injured horses in Zone A or B", () => {
  const stalls = initStalls();
  const availableA = stalls.find((s) => s.zoneCode === "ZONE-A" && s.status === "AVAILABLE")!;
  const availableC = stalls.find((s) => s.zoneCode === "ZONE-C" && s.status === "AVAILABLE")!;

  const injuredHorse = {
    ...seedHorses()[0],
    id: "HRS-INJ",
    name: "Injured Runner",
    medicalLock: true,
    health: "INJURED" as const,
  };

  const resA = canAssignHorseToStall(availableA, injuredHorse);
  assert.equal(resA.allowed, true);
  assert.ok(resA.warning, "Should issue warning for Zone A");
  assert.match(resA.warning ?? "", /RULE-MED-01/);

  const resC = canAssignHorseToStall(availableC, injuredHorse);
  assert.equal(resC.allowed, true);
  assert.equal(resC.warning, undefined, "Zone C is medical isolation, no warning");
});

test("assignHorseToStall updates stall to OCCUPIED and sets horseId and horseName", () => {
  const stalls = initStalls();
  const targetStall = stalls.find((s) => s.zoneCode === "ZONE-A" && s.status === "AVAILABLE")!;
  const horse = seedHorses()[1]; // Crimson Comet

  const updated = assignHorseToStall(stalls, targetStall.code, horse, "Lê Văn Phúc");
  const assigned = updated.find((s) => s.code === targetStall.code)!;

  assert.equal(assigned.status, "OCCUPIED");
  assert.equal(assigned.horseId, horse.id);
  assert.equal(assigned.horseName, horse.name);
  assert.equal(assigned.assignedGroomName, "Lê Văn Phúc");

  // Original list is unmodified (immutability)
  assert.equal(targetStall.status, "AVAILABLE");
});

test("assignHorseToStall relocates horse if it was already in another stall", () => {
  const stalls = initStalls();
  const originalStall = stalls.find((s) => s.status === "OCCUPIED" && s.horseName === "Bạch Long Mã")!;
  const newStall = stalls.find((s) => s.zoneCode === "ZONE-B" && s.status === "AVAILABLE")!;
  const horse = seedHorses()[0]; // Bạch Long Mã

  const updated = assignHorseToStall(stalls, newStall.code, horse);
  const oldStallAfter = updated.find((s) => s.code === originalStall.code)!;
  const newStallAfter = updated.find((s) => s.code === newStall.code)!;

  assert.equal(oldStallAfter.status, "AVAILABLE");
  assert.equal(oldStallAfter.horseId, undefined);
  assert.equal(newStallAfter.status, "OCCUPIED");
  assert.equal(newStallAfter.horseId, horse.id);
});

test("unassignHorseFromStall resets stall to AVAILABLE and clears horse", () => {
  const stalls = initStalls();
  const occupied = stalls.find((s) => s.status === "OCCUPIED")!;

  const updated = unassignHorseFromStall(stalls, occupied.code);
  const freed = updated.find((s) => s.code === occupied.code)!;

  assert.equal(freed.status, "AVAILABLE");
  assert.equal(freed.horseId, undefined);
  assert.equal(freed.horseName, undefined);
});

test("getAssignedHorseIds and getUnassignedHorses properly partition horses", () => {
  const stalls = initStalls();
  const allHorses = seedHorses();

  const assignedIds = getAssignedHorseIds(stalls);
  assert.ok(assignedIds.size > 0);

  const unassigned = getUnassignedHorses(allHorses, stalls);
  for (const h of unassigned) {
    assert.equal(assignedIds.has(h.id), false);
  }
});
