import type { Point } from "./farmLayout";

export interface Size { width: number; height: number }

export function clampCamera(camera: Point, viewport: Size, world: Size): Point {
  const clampAxis = (value: number, view: number, size: number) =>
    view >= size ? (size - view) / 2 : Math.min(size - view, Math.max(0, value));
  return { x: clampAxis(camera.x, viewport.width, world.width), y: clampAxis(camera.y, viewport.height, world.height) };
}

export function classifyPointerGesture(start: Point, current: Point, threshold = 6): "click" | "drag" {
  return Math.hypot(current.x - start.x, current.y - start.y) >= threshold ? "drag" : "click";
}

export function cameraForFocus(focus: Point, viewport: Size, world: Size): Point {
  return clampCamera({ x: focus.x - viewport.width / 2, y: focus.y - viewport.height / 2 }, viewport, world);
}

export function interpolateCamera(from: Point, to: Point, progress: number, reducedMotion = false): Point {
  if (reducedMotion) return to;
  const p = Math.min(1, Math.max(0, progress));
  return { x: from.x + (to.x - from.x) * p, y: from.y + (to.y - from.y) * p };
}

export const MAX_ZOOM = 3;

const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, MAX_ZOOM];

export function nextZoomLevel(zoom: number, direction: 1 | -1): number {
  const levels = direction > 0 ? ZOOM_LEVELS : [...ZOOM_LEVELS].reverse();
  return levels.find((level) => direction > 0 ? level > zoom : level < zoom) ?? zoom;
}

/** Mức phóng nhỏ nhất để bản đồ luôn phủ kín khung (không lộ viền trống). */
export function minZoom(screen: Size, world: Size): number {
  return Math.max(screen.width / world.width, screen.height / world.height);
}

/** Phóng quanh điểm màn hình `anchor`: điểm thế giới dưới con trỏ giữ nguyên chỗ. */
export function zoomAt(camera: Point, zoom: number, nextZoom: number, anchor: Point, screen: Size, world: Size): { camera: Point; zoom: number } {
  const z = Math.min(MAX_ZOOM, Math.max(minZoom(screen, world), nextZoom));
  const wx = camera.x + anchor.x / zoom;
  const wy = camera.y + anchor.y / zoom;
  const next = clampCamera({ x: wx - anchor.x / z, y: wy - anchor.y / z }, { width: screen.width / z, height: screen.height / z }, world);
  return { camera: next, zoom: z };
}

/** Camera đặt `center` (điểm thế giới) giữa khung ở mức phóng `zoom`. */
export function cameraAt(center: Point, zoom: number, screen: Size, world: Size): Point {
  return cameraForFocus(center, { width: screen.width / zoom, height: screen.height / zoom }, world);
}

/** Tâm khung nhìn hiện tại (điểm thế giới). */
export function viewCenter(camera: Point, zoom: number, screen: Size): Point {
  return { x: camera.x + screen.width / zoom / 2, y: camera.y + screen.height / zoom / 2 };
}

/** Ma sát quán tính: vận tốc còn lại sau mỗi 16 ms. */
const FRICTION = 0.92;
/** Dưới ngưỡng này (px thế giới / ms) thì dừng hẳn. */
export const MIN_SPEED = 0.01;

/** Vận tốc sau `dtMs` ms trượt quán tính (giảm theo hàm mũ, không phụ thuộc tốc độ khung hình). */
export function decayVelocity(v: Point, dtMs: number): Point {
  const k = Math.pow(FRICTION, dtMs / 16);
  return { x: v.x * k, y: v.y * k };
}
