import assert from "node:assert/strict";
import { test } from "node:test";
import { cameraAt, cameraForFocus, clampCamera, classifyPointerGesture, decayVelocity, interpolateCamera, MAX_ZOOM, MIN_SPEED, nextZoomLevel, viewCenter, zoomAt } from "./camera.ts";

const world = { width: 2048, height: 1536 };

test("camera clamps every edge and centers worlds smaller than viewport", () => {
  assert.deepEqual(clampCamera({ x: -5, y: -9 }, { width: 800, height: 600 }, world), { x: 0, y: 0 });
  assert.deepEqual(clampCamera({ x: 9999, y: 9999 }, { width: 800, height: 600 }, world), { x: 1248, y: 936 });
  assert.deepEqual(clampCamera({ x: 20, y: 30 }, { width: 3000, height: 2000 }, world), { x: -476, y: -232 });
  assert.deepEqual(cameraForFocus({ x: 20, y: 20 }, { width: 800, height: 600 }, world), { x: 0, y: 0 });
});

test("pointer movement becomes a drag at exactly six pixels", () => {
  assert.equal(classifyPointerGesture({ x: 0, y: 0 }, { x: 5.99, y: 0 }), "click");
  assert.equal(classifyPointerGesture({ x: 0, y: 0 }, { x: 6, y: 0 }), "drag");
});

test("camera tween honors progress and reduced motion", () => {
  const from = { x: 10, y: 20 };
  const to = { x: 110, y: 220 };
  assert.deepEqual(interpolateCamera(from, to, 0), from);
  assert.deepEqual(interpolateCamera(from, to, 0.5), { x: 60, y: 120 });
  assert.deepEqual(interpolateCamera(from, to, 1), to);
  assert.deepEqual(interpolateCamera(from, to, 0.01, true), to);
});

test("zoomAt keeps the world point under the cursor and clamps zoom", () => {
  const w = { width: 1280, height: 768 };
  const screen = { width: 800, height: 600 };
  const anchor = { x: 400, y: 300 };
  const r = zoomAt({ x: 200, y: 100 }, 2, 1.5, anchor, screen, w);
  assert.equal(r.zoom, 1.5);
  assert.equal(r.camera.x + anchor.x / r.zoom, 200 + anchor.x / 2);
  assert.equal(r.camera.y + anchor.y / r.zoom, 100 + anchor.y / 2);
  assert.equal(zoomAt({ x: 0, y: 0 }, 2, 99, anchor, screen, w).zoom, MAX_ZOOM);
  assert.equal(zoomAt({ x: 0, y: 0 }, 2, 0.1, anchor, screen, w).zoom, 600 / 768); // vừa khít chiều cao
});

test("wheel and keyboard use the same discrete zoom levels", () => {
  assert.equal(nextZoomLevel(1.5, 1), 2);
  assert.equal(nextZoomLevel(1.5, -1), 1);
  assert.equal(nextZoomLevel(1.15, -1), 1);
  assert.equal(nextZoomLevel(MAX_ZOOM, 1), MAX_ZOOM);
});

test("cameraAt centres a world point and viewCenter reads it back", () => {
  const w = { width: 1280, height: 768 };
  const screen = { width: 800, height: 600 };
  const cam = cameraAt({ x: 640, y: 384 }, 2, screen, w);
  assert.deepEqual(viewCenter(cam, 2, screen), { x: 640, y: 384 });
  assert.deepEqual(cameraAt({ x: 0, y: 0 }, 2, screen, w), { x: 0, y: 0 }, "clamped at the world edge");
});

test("inertia decays the same per second at any frame rate and comes to rest", () => {
  const v0 = { x: 2, y: -1 };
  let fast = v0;
  for (let i = 0; i < 6; i++) fast = decayVelocity(fast, 16);
  const slow = decayVelocity(decayVelocity(v0, 48), 48);
  assert.ok(Math.abs(fast.x - slow.x) < 1e-9 && Math.abs(fast.y - slow.y) < 1e-9);
  let v = v0;
  let ms = 0;
  while (Math.hypot(v.x, v.y) >= MIN_SPEED) { v = decayVelocity(v, 16); ms += 16; }
  assert.ok(ms < 2000, "stops within two seconds");
});
