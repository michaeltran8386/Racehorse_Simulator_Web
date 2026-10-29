// Bản đồ trang trại: kéo để xem (camera), rê chuột → công trình sáng lên + viền vàng ôm đúng hình + nhãn trên mái,
// lăn chuột → phóng xa/gần quanh con trỏ, bấm → camera lướt tới rồi gọi onEnter (App làm mờ dần sang trang làm việc).
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { drawFarmActors, drawNight } from "../hub/ambient";
import { advanceAmbientClock } from "../hub/ambientScene";
import { paddockHorse, paddockHorseAt, truckPose, TRUCK_UNLOAD_S } from "../hub/paths";
import { DELIVERY_S, type SupplyId } from "../sim/inventory";
import { drawRect, VEHICLE_RECT } from "../render/sprites";
import { audio } from "../audio/audioManager";
import { SUPPLY_ICON } from "./supplyIcons";
import type { HorseProfile } from "../sim/engine";
import type { StableHorseAssignment } from "../hub/farmPopulation";
import { cameraAt, clampCamera, MAX_ZOOM, minZoom, viewCenter, zoomAt, type Size } from "../hub/camera";
import { FARM_ANCHORS, FARM_INTERACTIVE_OBJECTS, FARM_WORLD, type FarmObject, type Point } from "../hub/farmLayout";
import { alphaMaskFromImage, hitTestObjects, type AlphaMask } from "../hub/pixelHitTest";
import { useFarmCamera } from "../hub/useFarmCamera";
import { loadFarmAssets, type FarmAssets } from "../render/farmAssets";
import { drawFarmScene, SQUASH_MS, squashScale } from "../render/farmScene";
import { drawStableHorses } from "../render/stableHorses";
import { createOutlineCanvas } from "../render/silhouette";
import type { Sprites } from "../render/sprites";
import c from "./FarmHub.module.css";

export type TimeOfDay = "DAY" | "NIGHT";
// shortcut: zoom lẻ (1.25…) làm pixel to nhỏ không đều; nếu thấy rõ thì đổi bước sang bội số nguyên
const DEFAULT_ZOOM = 1.5;
const ZOOM_STEP = 1.15; // mỗi nấc lăn

interface Props {
  sprites: Sprites;
  tod: TimeOfDay;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  /** Đặt id để yêu cầu lướt tới công trình (từ cột "Các khu vực"); đổi giá trị mới chạy lại. */
  goTo: { id: string; seq: number } | null;
  onEnter: (target: FarmObject["target"] | "GROOM", label: string) => void;
  /** Ngựa thật đang ở bãi thả, theo thứ tự ô (có thể chứa null); chạm vào sẽ gọi onHorse. */
  paddock: readonly (HorseProfile | null)[];
  stableHorses?: readonly StableHorseAssignment[];
  onHorse: (id: string) => void;
  /** Vừa quay về từ màn riêng của công trình này (Đường đua) → mở bản đồ đang phóng sát rồi lùi ra. */
  arriveFrom: FarmObject["target"] | null;
  trip: { arriveAt: number; items: SupplyId[] } | null;
  simulationRunning?: boolean;
  hasHay?: boolean;
}

export function FarmMapCanvas({ sprites, tod, hoveredId, onHover, goTo, onEnter, paddock, stableHorses, onHorse, arriveFrom, trip, simulationRunning = true, hasHay = true }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screenSize, setScreenSize] = useState<Size>({ width: 1, height: 1 });
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const viewport = useMemo(() => ({ width: screenSize.width / zoom, height: screenSize.height / zoom }), [screenSize, zoom]);
  const [assets, setAssets] = useState<FarmAssets | null>(null);
  const [masks, setMasks] = useState<Map<string, AlphaMask>>(new Map());
  const [outlines, setOutlines] = useState<Map<string, HTMLCanvasElement>>(new Map());
  const [locked, setLocked] = useState(false);
  const [hoverHorse, setHoverHorse] = useState(-1);
  const pop = useRef<{ id: string; t0: number } | null>(null); // công trình vừa chạm (nhún)
  const ambientClock = useRef({ time: 0, lastNow: performance.now() / 1000 });
  const centred = useRef(false);
  const { camera, setCamera, onPointerDown, onPointerMove, finishPointer, stopMomentum } = useFarmCamera(viewport, { x: 0, y: 0 }, zoom);

  // Vòng vẽ đọc trạng thái mới nhất qua ref → không phải khởi động lại rAF mỗi lần camera đổi
  const live = useRef({ camera, hoveredId, tod, screenSize, zoom, locked, paddock, stableHorses, hoverHorse, trip, simulationRunning, hasHay });
  live.current = { camera, hoveredId, tod, screenSize, zoom, locked, paddock, stableHorses, hoverHorse, trip, simulationRunning, hasHay };

  useEffect(() => {
    let alive = true;
    loadFarmAssets().then((loaded) => {
      if (!alive) return;
      const nextMasks = new Map<string, AlphaMask>();
      const nextOutlines = new Map<string, HTMLCanvasElement>();
      const color = getComputedStyle(document.documentElement).getPropertyValue("--map-outline").trim();
      for (const object of FARM_INTERACTIVE_OBJECTS) {
        const image = loaded.objects.get(object.id);
        const mask = image
          ? alphaMaskFromImage(image, object.bounds.w, object.bounds.h)
          : { alpha: new Uint8ClampedArray(object.bounds.w * object.bounds.h).fill(255), width: object.bounds.w, height: object.bounds.h };
        nextMasks.set(object.id, mask);
        nextOutlines.set(object.id, createOutlineCanvas(mask.alpha, mask.width, mask.height, color));
      }
      setAssets(loaded);
      setMasks(nextMasks);
      setOutlines(nextOutlines);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      setScreenSize({ width, height });
      const z = Math.max(minZoom({ width, height }, FARM_WORLD), live.current.zoom);
      setZoom(z);
      // Lần đầu có kích thước thật: màn chính mở ra giữa cụm 4 công trình; sau đó chỉ giữ camera trong bản đồ
      const first = !centred.current && width > 1;
      if (first) centred.current = true;
      setCamera((current) => first ? cameraAt(FARM_ANCHORS.mainFocus, z, { width, height }, FARM_WORLD) : clampCamera(current, { width: width / z, height: height / z }, FARM_WORLD));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [setCamera]);

  useEffect(() => {
    if (!assets) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let frame = 0;
    const render = (now: number) => {
      const { camera: cam, hoveredId: hid, tod: mode, screenSize: size, zoom: z, paddock: herd, stableHorses: assignedStalls, hoverHorse: hh, trip: run, simulationRunning: simRunning, hasHay: hayAvailable } = live.current;
      const realTime = now / 1000;
      ambientClock.current = advanceAmbientClock(ambientClock.current, realTime, simRunning);
      const t = ambientClock.current.time;
      const dpr = window.devicePixelRatio || 1;
      const reducedMotion =
        typeof window !== "undefined" &&
        (window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
          new URLSearchParams(window.location.search).get("reducedMotion") === "1");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, size.width, size.height);
      ctx.save();
      ctx.scale(z, z);
      ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
      drawFarmScene(ctx, assets, t, (actorCtx, time) => {
        if (assignedStalls && assignedStalls.length > 0) {
          drawStableHorses(actorCtx, sprites, assignedStalls, time, reducedMotion);
        }
        const ambientState = { reducedMotion, simulationRunning: simRunning, hasHay: hayAvailable };
        drawFarmActors(actorCtx, sprites, time, herd.map((h) => h?.coat), ambientState);
        if (run) drawDelivery(actorCtx, sprites.vehicles, run, realTime, reducedMotion);
      }, pop.current && now - pop.current.t0 < SQUASH_MS ? { id: pop.current.id, ...squashScale(now - pop.current.t0) } : null);
      if (mode === "NIGHT") drawNight(ctx, FARM_WORLD.width, FARM_WORLD.height, realTime, reducedMotion);
      const hovered = FARM_INTERACTIVE_OBJECTS.find((o) => o.id === hid);
      if (hovered) {
        const image = assets.objects.get(hovered.id);
        const outline = outlines.get(hovered.id);
        const squashing = pop.current?.id === hovered.id && now - pop.current.t0 < SQUASH_MS;
        if (image && !squashing) {
          // làm sáng công trình: vẽ chồng chính nó ở chế độ cộng sáng, mạnh nhẹ theo nhịp
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 5);
          ctx.drawImage(image, hovered.bounds.x, hovered.bounds.y);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = "source-over";
        }
        if (outline) ctx.drawImage(outline, hovered.bounds.x, hovered.bounds.y);
        drawRoofTag(ctx, hovered);
      }
      if (hh >= 0 && herd[hh]) {
        const p = paddockHorse(hh, t);
        drawTag(ctx, herd[hh]!.name, p.x, p.y - 30);
      }
      ctx.restore();
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [assets, outlines, sprites]);

  function objectAt(event: ReactPointerEvent<HTMLCanvasElement>): FarmObject | null {
    const rect = event.currentTarget.getBoundingClientRect();
    return hitTestObjects({ x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom }, camera, FARM_INTERACTIVE_OBJECTS, masks);
  }

  /** Ô bãi thả có ngựa dưới con trỏ (cùng đồng hồ performance.now với vòng vẽ), hoặc -1. */
  function horseAt(event: ReactPointerEvent<HTMLCanvasElement>): number {
    const rect = event.currentTarget.getBoundingClientRect();
    const world = { x: camera.x + (event.clientX - rect.left) / zoom, y: camera.y + (event.clientY - rect.top) / zoom };
    return paddockHorseAt(world, ambientClock.current.time, paddock);
  }

  /** Lướt camera tới `center` đồng thời đổi mức phóng sang `toZoom`, ease-out; xong thì gọi done. */
  function glide(center: Point, toZoom: number, duration: number, done: () => void) {
    stopMomentum();
    const { camera: cam0, zoom: z0, screenSize: size } = live.current;
    const c0 = viewCenter(cam0, z0, size);
    const z1 = Math.min(MAX_ZOOM, Math.max(minZoom(size, FARM_WORLD), toZoom));
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    const step = (now: number) => {
      const linear = reduced ? 1 : Math.min(1, (now - started) / duration);
      const e = 1 - Math.pow(1 - linear, 3);
      const z = z0 + (z1 - z0) * e;
      const cam = cameraAt({ x: c0.x + (center.x - c0.x) * e, y: c0.y + (center.y - c0.y) * e }, z, size, FARM_WORLD);
      // ghi luôn vào live: ResizeObserver chạy sau rAF nhưng trước khi React render lại, nó phải thấy mức phóng mới
      live.current = { ...live.current, zoom: z, camera: cam };
      setZoom(z);
      setCamera(cam);
      if (linear < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  }

  function activate(object: FarmObject) {
    if (locked) return;
    setLocked(true);
    audio.playSfx("building-select");
    onHover(object.id);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) pop.current = { id: object.id, t0: performance.now() };
    // Đường đua có màn riêng → phóng sát vào trước khi chuyển cảnh; các khu khác chỉ lướt tới rồi mở bảng nổi
    const dive = object.target === "TRACK";
    glide(object.focus, dive ? MAX_ZOOM : live.current.zoom, dive ? 900 : 650, () => {
      setLocked(false);
      onHover(null); // bảng nổi đã mở: bỏ nhãn trên mái để không che hoạt cảnh (vd. xe tải đỗ trước kho)
      onEnter(object.target, object.name);
    });
  }

  // Quay về từ Đường đua: bắt đầu phóng sát công trình rồi lùi ra mức mặc định
  const arrived = useRef(false);
  useEffect(() => {
    if (arrived.current || !arriveFrom || screenSize.width <= 1) return;
    const object = FARM_INTERACTIVE_OBJECTS.find((o) => o.target === arriveFrom);
    if (!object) return;
    arrived.current = true;
    setZoom(MAX_ZOOM);
    setCamera(cameraAt(object.focus, MAX_ZOOM, screenSize, FARM_WORLD));
    live.current = { ...live.current, zoom: MAX_ZOOM, camera: cameraAt(object.focus, MAX_ZOOM, screenSize, FARM_WORLD) };
    setLocked(true);
    glide(object.focus, DEFAULT_ZOOM, 1100, () => setLocked(false));
  });

  // Lăn chuột: listener gốc với passive:false để chặn cuộn trang (onWheel của React là passive)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const { camera: cam, zoom: z, screenSize: size, locked: busy } = live.current;
      if (busy) return;
      stopMomentum();
      const rect = canvas.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      const next = zoomAt(cam, z, event.deltaY < 0 ? z * ZOOM_STEP : z / ZOOM_STEP, anchor, size, FARM_WORLD);
      setZoom(next.zoom);
      setCamera(next.camera);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [setCamera, stopMomentum]);

  // Lệnh "đi tới" từ cột bên
  const lastGo = useRef(0);
  useEffect(() => {
    if (!goTo || goTo.seq === lastGo.current) return;
    lastGo.current = goTo.seq;
    const object = FARM_INTERACTIVE_OBJECTS.find((o) => o.id === goTo.id);
    if (object) activate(object);
  });

  return (
    <canvas
      ref={canvasRef}
      className={c.mapCanvas}
      tabIndex={0}
      aria-label="Bản đồ trang trại. Bấm giữ và kéo để di chuyển, lăn chuột để phóng xa hoặc gần; bấm vào công trình để vào khu."
      data-locked={locked}
      data-hover={!!hoveredId || hoverHorse >= 0}
      onPointerDown={(event) => {
        if (!locked) onPointerDown(event);
      }}
      onPointerMove={(event) => {
        if (locked) return;
        onPointerMove(event);
        if (event.buttons) return;
        const slot = horseAt(event);
        setHoverHorse(slot);
        onHover(slot >= 0 ? null : (objectAt(event)?.id ?? null));
      }}
      onPointerLeave={() => {
        if (locked) return;
        onHover(null);
        setHoverHorse(-1);
      }}
      onPointerUp={(event) => {
        if (locked) return;
        if (finishPointer(event)) {
          const slot = horseAt(event);
          if (slot >= 0 && paddock[slot]) return onHorse(paddock[slot].id);
          const object = objectAt(event);
          if (object) activate(object);
        }
      }}
    />
  );
}

/** Nhãn tên nhỏ trên mái (bảng gỗ pixel). */
function drawRoofTag(ctx: CanvasRenderingContext2D, object: FarmObject) {
  drawTag(ctx, `» ${object.name}`, object.bounds.x + object.bounds.w / 2, object.bounds.y);
}

/** Bảng tên pixel căn giữa tại cx, đáy nằm ngay trên top. */
function drawTag(ctx: CanvasRenderingContext2D, text: string, cx: number, top: number) {
  ctx.font = "16px VT323, monospace";
  const w = Math.ceil(ctx.measureText(text).width) + 10;
  const x = Math.round(cx - w / 2);
  const y = Math.max(2, Math.round(top - 18));
  ctx.fillStyle = "#1D130E";
  ctx.fillRect(x - 1, y - 1, w + 2, 16);
  ctx.fillStyle = "#F3E6C4";
  ctx.fillRect(x, y, w, 14);
  ctx.fillStyle = "#1D130E";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + 5, y + 7);
}

const iconImages = new Map<string, HTMLImageElement>();
function iconImage(url: string): HTMLImageElement {
  let img = iconImages.get(url);
  if (!img) iconImages.set(url, (img = Object.assign(new Image(), { src: url })));
  return img;
}

const BARN_DOOR = FARM_ANCHORS.supplyDoor;

/** Xe tải giao hàng + các thùng hàng bay từ đuôi xe vào cửa kho trong lúc dỡ (theo đồng hồ thật). */
/** Xe tải giao hàng + các thùng hàng bay từ đuôi xe vào cửa kho trong lúc dỡ (theo đồng hồ thật). */
function drawDelivery(
  ctx: CanvasRenderingContext2D,
  vehicles: HTMLCanvasElement,
  trip: { arriveAt: number; items: SupplyId[] },
  now: number,
  reducedMotion = false,
) {
  const pose = truckPose(now, trip.arriveAt, DELIVERY_S);
  if (!pose) return;
  drawRect(ctx, vehicles, pose.open ? VEHICLE_RECT.truckOpen : VEHICLE_RECT.truck, pose.x, pose.y, 1);
  if (reducedMotion) return;
  const unloadStart = trip.arriveAt - TRUCK_UNLOAD_S;
  trip.items.forEach((item, i) => {
    const t0 = unloadStart + (i * (TRUCK_UNLOAD_S - 0.6)) / Math.max(1, trip.items.length - 1);
    const p = (now - t0) / 0.6;
    if (p < 0 || p > 1) return;
    const from = { x: pose.x - 40, y: pose.y - 20 };
    const x = from.x + (BARN_DOOR.x - from.x) * p;
    const y = from.y + (BARN_DOOR.y - from.y) * p - Math.sin(Math.PI * p) * 28; // bay vòng cung
    const icon = SUPPLY_ICON[item];
    const size = 24 - 8 * p;
    ctx.globalAlpha = p > 0.8 ? (1 - p) / 0.2 : 1;
    ctx.drawImage(iconImage(icon.url), icon.c * 32, icon.r * 32, 32, 32, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  });
}
