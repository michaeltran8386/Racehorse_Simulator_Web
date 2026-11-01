import test from "node:test";
import assert from "node:assert/strict";
import { toStallZones } from "./stallMap.ts";

const zone = (stalls: unknown[]) => ({ id: "z1", code: "ZONE-A", name: "Zone A", rows: 2, cols: 4, stalls } as never);

test("toStallZones converts 1-based BE row/col to 0-based", () => {
  const [z] = toStallZones([zone([{ id: "s1", code: "STALL-A01", row: 1, col: 1, status: "OCCUPIED", horseId: "h1", horseName: "Apollo" }])]);
  assert.equal(z.stalls[0].row, 0);
  assert.equal(z.stalls[0].col, 0);
  assert.equal(z.stalls[0].zoneCode, "ZONE-A");
  assert.equal(z.stalls[0].horseName, "Apollo");
  assert.equal(z.stalls[0].assignedGroomName, null);
});

test("toStallZones drops stalls without a position or outside the grid", () => {
  const [z] = toStallZones([
    zone([
      { id: "a", code: "A", row: null, col: 1, status: "AVAILABLE" },
      { id: "b", code: "B", row: 3, col: 1, status: "AVAILABLE" },
      { id: "c", code: "C", row: 2, col: 4, status: "AVAILABLE" },
    ]),
  ]);
  assert.deepEqual(z.stalls.map((s) => s.code), ["C"]);
});

test("toStallZones maps unknown status to INACTIVE", () => {
  const [z] = toStallZones([zone([{ id: "a", code: "A", row: 1, col: 1, status: "WHATEVER" }])]);
  assert.equal(z.stalls[0].status, "INACTIVE");
});
