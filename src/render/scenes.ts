// Vẽ cảnh pixel art bằng Canvas 2D: đường đua nhìn ngang (chạy thử / đua 6 làn) và sơ đồ chuồng 6×6.
// Màu ở đây là bảng màu của tranh game (không phải token giao diện).
import { OBSTACLE, type HorseProfile, type Incident, type Obstacle, type RunStatus, type StallHealth, type Surface, type TrackCondition } from "../sim/engine";
import type { Stall, StallZone } from "../sim/stallMap";
import { drawFrame, ROW, tinted, type Sprites } from "./sprites";

export const ART = {
  sky: "#BFE3F2",
  skyLow: "#DDF1F7",
  hillFar: "#9CC9A0",
  hillNear: "#6FAE6B",
  tree: "#3F7F45",
  treeDark: "#2F6236",
  rail: "#F4F6F5",
  railShadow: "#9AA6A0",
  grass: "#4E9A3A",
  grassStripe: "#58A744",
  grassSpeck: "#3E8530",
  sand: "#D6B06A",
  sandStripe: "#CFA760",
  sandSpeck: "#B98F4C",
  dirt: "#9A6A3D",
  infield: "#5FA84A",
  gate: "#2E6B57",
  gateBar: "#CFE3DA",
  post: "#FFFFFF",
  sensor: "#D93838",
  ink: "#1E2622",
  label: "#24312C",
  wood: "#7A4E2D",
  woodDark: "#5A3820",
  woodLight: "#9C6A3F",
  straw: "#D9B44A",
  strawDark: "#BF9A36",
  empty: "#B9A27A",
  select: "#FFFFFF",
  alert: "#E53935",
  mud: "#5E3B1E",
  mudDark: "#3E2512",
  mudShine: "#8A6440",
  hay: "#E2B84A",
  hayLight: "#F3D57A",
  hayBand: "#A9802A",
  wet: "rgba(30, 50, 70, 0.14)",
  wetHeavy: "rgba(40, 30, 20, 0.26)",
  skyRain: "rgba(60, 80, 100, 0.12)",
  skyRainHeavy: "rgba(40, 55, 70, 0.24)",
  rain: "rgba(200, 225, 255, 0.55)",
  standBack: "#6B4A2E",
  standStep: "#4E331E",
  roof: "#B03A2E",
  roofDark: "#8A2A20",
  skin: "#E8B48A",
  board: "#FFE082",
} as const;

// Viền ô chuồng đổi theo 4 trạng thái sức khỏe (SRS §12-C; Cyan #00E5FF của file gốc được thay).
export const HEALTH_COLOR: Record<StallHealth, string> = {
  FIT: "#2ECC71",
  WATCH: "#F1C40F",
  INJURED: "#E74C3C",
  ISOLATED: "#9B59B6",
};

// 6 màu áo nài theo làn (SRS §12-B).
export const LANE_SILK = ["#D32F2F", "#1976D2", "#2E9D4A", "#EF7C1A", "#7B3FB0", "#E9C21A"];

const hash = (n: number) => {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};

/** Cắt chữ kèm "…" cho vừa bề rộng maxW (theo font chỉ định). */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, font: string): string {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};

// Silkscreen không có dấu tiếng Việt → chữ tiếng Việt dùng VT323
function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "center", font = "Silkscreen") {
  ctx.font = `${size}px ${font}, monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  ctx.fillText(text, Math.round(x), Math.round(y));
}

// ------------------------------------------------------------------ Đường đua

export interface TrackLayout {
  /** mét đang ở mép trái màn hình */
  cameraM: number;
  /** pixel trên mét */
  ppm: number;
  railTop: number;
  railBottom: number;
}

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  surface: Surface,
  targetM: number,
  L: TrackLayout,
): void {
  const { cameraM, ppm, railTop, railBottom } = L;
  // Trời + đồi parallax
  rect(ctx, 0, 0, w, railTop, ART.sky);
  rect(ctx, 0, railTop * 0.55, w, railTop * 0.45, ART.skyLow);
  for (const [depth, color, base, amp] of [
    [0.08, ART.hillFar, railTop * 0.72, railTop * 0.22],
    [0.18, ART.hillNear, railTop * 0.88, railTop * 0.16],
  ] as const) {
    const off = cameraM * ppm * depth;
    const step = 6;
    for (let x = 0; x < w + step; x += step) {
      const wx = Math.floor((x + off) / step);
      const y = base - (Math.sin(wx * 0.045) * 0.5 + 0.5) * amp - hash(wx) * 3;
      rect(ctx, x, y, step, railTop - y, color);
    }
  }
  // Hàng cây sát rào
  const treeGap = 9; // mét
  const firstTree = Math.floor((cameraM * 0.45) / treeGap) - 1;
  for (let i = firstTree; i < firstTree + w / (treeGap * ppm * 0.55) + 3; i++) {
    const x = i * treeGap * ppm - cameraM * ppm * 0.45 + hash(i) * 20;
    const s = 10 + hash(i + 99) * 10;
    rect(ctx, x - 2, railTop - s * 0.5, 4, s * 0.5, ART.woodDark);
    rect(ctx, x - s * 0.7, railTop - s * 1.6, s * 1.4, s * 1.2, ART.tree);
    rect(ctx, x - s * 0.7, railTop - s * 0.6, s * 1.4, s * 0.2, ART.treeDark);
  }

  // Mặt sân
  const band = railBottom - railTop;
  const base = surface === "SAND" ? ART.sand : ART.grass;
  rect(ctx, 0, railTop, w, band, base);
  const stripeM = 8;
  const m0 = Math.floor(cameraM / stripeM);
  for (let i = m0; i <= m0 + w / (stripeM * ppm) + 1; i++) {
    const x = i * stripeM * ppm - cameraM * ppm;
    if (i % 2 === 0) rect(ctx, x, railTop, stripeM * ppm, band, surface === "SAND" ? ART.sandStripe : ART.grassStripe);
    if (surface === "MIXED" && hash(i * 7) > 0.45) {
      const py = railTop + band * (0.2 + hash(i * 13) * 0.5);
      rect(ctx, x + hash(i) * stripeM * ppm * 0.5, py, stripeM * ppm * 0.7, band * 0.22, ART.dirt);
    }
    for (let s = 0; s < 6; s++) {
      const sx = x + hash(i * 31 + s) * stripeM * ppm;
      const sy = railTop + 4 + hash(i * 17 + s) * (band - 8);
      rect(ctx, sx, sy, 2, 2, surface === "SAND" ? ART.sandSpeck : ART.grassSpeck);
    }
  }
  // Rào trắng trên/dưới, cọc mỗi 2 m
  for (const y of [railTop, railBottom]) {
    rect(ctx, 0, y - 7, w, 3, ART.rail);
    rect(ctx, 0, y - 4, w, 1, ART.railShadow);
    const p0 = Math.floor(cameraM / 2);
    for (let i = p0; i <= p0 + w / (2 * ppm) + 1; i++) rect(ctx, i * 2 * ppm - cameraM * ppm, y - 7, 2, 8, ART.rail);
  }
  rect(ctx, 0, railBottom + 1, w, h - railBottom, ART.infield);

  // Cột mốc cự ly (100 m) và cột cảm biến tốc độ (200 m)
  const firstMark = Math.max(0, Math.floor(cameraM / 100));
  for (let m = firstMark * 100; m <= Math.min(targetM, cameraM + w / ppm + 100); m += 100) {
    const x = (m - cameraM) * ppm;
    if (m > 0 && m < targetM) {
      const sensor = m % 200 === 0;
      rect(ctx, x - 1, railTop - 30, 3, 24, sensor ? ART.sensor : ART.post);
      if (sensor) for (let k = 0; k < 3; k++) rect(ctx, x - 1, railTop - 26 + k * 7, 3, 3, ART.post);
      rect(ctx, x - 12, railTop - 42, 24, 11, ART.post);
      label(ctx, String(m), x, railTop - 33, 8, ART.label);
    }
  }

  // Cổng xuất phát ở 0 m
  const gx = (0 - cameraM) * ppm;
  if (gx > -40 && gx < w + 40) {
    rect(ctx, gx - 18, railTop - 18, 6, band + 18, ART.gate);
    rect(ctx, gx + 4, railTop - 18, 6, band + 18, ART.gate);
    rect(ctx, gx - 18, railTop - 22, 28, 6, ART.gate);
    for (let y = railTop; y < railBottom; y += 10) rect(ctx, gx - 12, y, 16, 2, ART.gateBar);
  }
  // Vạch đích caro
  const fx = (targetM - cameraM) * ppm;
  if (fx > -20 && fx < w + 20) {
    for (let y = railTop, k = 0; y < railBottom; y += 6, k++) {
      rect(ctx, fx - 6, y, 6, 6, k % 2 ? ART.ink : ART.post);
      rect(ctx, fx, y, 6, 6, k % 2 ? ART.post : ART.ink);
    }
    rect(ctx, fx - 2, railTop - 46, 4, 40, ART.post);
    rect(ctx, fx - 22, railTop - 58, 44, 13, ART.ink);
    label(ctx, "FINISH", fx, railTop - 48, 8, ART.post);
  }
}

// ------------------------------------------------------------------ Ngựa đang chạy

export interface RunnerPose {
  v: number;
  status: RunStatus;
  incident: Incident | null;
  /** pha chu kỳ sải (0..∞), mỗi đơn vị = 1 vòng 6 khung */
  phase: number;
  t: number;
}

export function drawRunner(
  ctx: CanvasRenderingContext2D,
  sp: Sprites,
  horse: HorseProfile,
  pose: RunnerPose,
  x: number,
  baseY: number,
  h: number,
  silk?: string,
): void {
  const frame = Math.floor(pose.phase * 6) % 6;
  const injured = pose.status === "ABORTED_INJURY" || (pose.incident === "LAMENESS" && pose.v < 3.5);
  if (injured) {
    drawFrame(ctx, sp.horse, tinted(sp.horse, horse.coat), 2 + (Math.floor(pose.t * 2) % 2), ROW.SPECIAL, x, baseY, h);
    const pulse = Math.floor(pose.t * 4) % 2;
    drawFrame(ctx, sp.fx, sp.fx.canvas, 2 + pulse, 2, x, baseY - h * 0.95, h * 0.45);
    return;
  }
  // Đứng ở cổng: khung phi đầu tiên có nài. Sau vạch đích: nài xuống, dắt ngựa đi bộ hồi phục.
  const riding = pose.status === "RUNNING";
  if (riding) {
    const col = pose.v < 0.3 ? 0 : frame;
    if (pose.v > 9) drawFrame(ctx, sp.fx, sp.fx.canvas, frame % 4, 0, x - h * 0.62, baseY, h * 0.45);
    drawFrame(ctx, sp.rider, tinted(sp.rider, horse.coat, silk), col, 4, x, baseY, h);
    return;
  }
  const row = pose.v < 0.3 ? ROW.IDLE : pose.v < 2.6 ? ROW.WALK : pose.v < 6 ? ROW.TROT : ROW.GALLOP;
  drawFrame(ctx, sp.horse, tinted(sp.horse, horse.coat), row === ROW.IDLE ? Math.floor(pose.t * 2) % 6 : frame, row, x, baseY, h);
}

/** Số làn trên khăn yên + chấm màu áo — nhận diện ngựa khi đua. */
export function drawLaneTag(ctx: CanvasRenderingContext2D, lane: number, x: number, y: number, silk: string, leader: boolean): void {
  rect(ctx, x - 9, y - 9, 18, 13, ART.ink);
  rect(ctx, x - 8, y - 8, 16, 11, leader ? "#FFD54F" : ART.post);
  label(ctx, String(lane), x, y + 1, 9, ART.ink);
  rect(ctx, x + 10, y - 6, 6, 6, silk);
}

// ------------------------------------------------------------------ Chuồng 6×6

export type StallActivity = "IDLE" | "GRAZE" | "LIE";

export function stallActivity(horse: HorseProfile, t: number): StallActivity {
  if (horse.lifecycle === "NGHI_NGOI") return "LIE";
  const slot = Math.floor(t / 9);
  const r = hash(Number(horse.id.slice(4)) * 1009 + slot);
  return r < 0.5 ? "IDLE" : r < 0.8 ? "GRAZE" : "LIE";
}

function padlock(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const u = s / 8;
  rect(ctx, x + u * 2, y, u * 4, u, ART.ink);
  rect(ctx, x + u, y + u, u, u * 3, ART.ink);
  rect(ctx, x + u * 6, y + u, u, u * 3, ART.ink);
  rect(ctx, x, y + u * 3, u * 8, u * 5, ART.ink);
  rect(ctx, x + u, y + u * 4, u * 6, u * 3, ART.alert);
  rect(ctx, x + u * 3.5, y + u * 5, u, u * 1.5, ART.ink);
}

export function drawStalls(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sp: Sprites,
  horses: HorseProfile[],
  vitals: Map<string, { hr: number }>,
  selectedId: string | null,
  t: number,
): void {
  const cw = w / 6;
  const ch = h / 6;
  rect(ctx, 0, 0, w, h, ART.woodDark);
  const byCell = new Map(horses.map((hz) => [`${hz.stall.col},${hz.stall.row}`, hz]));
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 6; col++) {
      const x = col * cw;
      const y = row * ch;
      const horse = byCell.get(`${col},${row}`);
      // vách sau, nền rơm, vách ngăn
      rect(ctx, x + 3, y + 3, cw - 6, ch * 0.34, ART.wood);
      for (let k = 1; k < 4; k++) rect(ctx, x + 3, y + 3 + (ch * 0.34 * k) / 4, cw - 6, 1, ART.woodDark);
      rect(ctx, x + 3, y + 3 + ch * 0.34, cw - 6, ch * 0.66 - 6, horse ? ART.straw : ART.empty);
      for (let s = 0; s < 10; s++) {
        const sx = x + 6 + hash(row * 97 + col * 13 + s) * (cw - 14);
        const sy = y + ch * 0.4 + hash(row * 31 + col * 7 + s * 3) * (ch * 0.5);
        rect(ctx, sx, sy, 5, 1, ART.strawDark);
      }
      rect(ctx, x + 3, y + ch * 0.36 - 4, cw * 0.18, 6, ART.woodLight); // máng ăn
      if (!horse) {
        label(ctx, "Trống", x + cw / 2, y + ch * 0.75, 14, "rgba(30,38,34,0.45)", "center", "VT323");
        continue;
      }
      const color = HEALTH_COLOR[horse.health];
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 4.5, y + 4.5, cw - 9, ch - 9);

      const act = horse.lifecycle === "CHAN_THUONG" ? "INJURED" : stallActivity(horse, t);
      const src = tinted(sp.horse, horse.coat);
      const base = y + ch - 10;
      const hh = ch * 0.74;
      const cx = x + cw / 2;
      if (act === "INJURED") drawFrame(ctx, sp.horse, src, 2 + (Math.floor(t * 1.5) % 2), ROW.SPECIAL, cx, base, hh);
      else if (act === "GRAZE") drawFrame(ctx, sp.horse, src, Math.floor(t * 2) % 3, ROW.REST, cx, base, hh);
      else if (act === "LIE") {
        drawFrame(ctx, sp.horse, src, 3 + (Math.floor(t) % 3), ROW.REST, cx, base, hh);
        drawFrame(ctx, sp.fx, sp.fx.canvas, 2 + (Math.floor(t) % 2), 4, cx + cw * 0.22, y + ch * 0.48, ch * 0.34);
      } else drawFrame(ctx, sp.horse, src, Math.floor(t * 3) % 6, ROW.IDLE, cx, base, hh);

      // bảng tên + nhịp tim nghỉ
      rect(ctx, x + 6, y + 6, cw * 0.62, 12, "rgba(20,26,23,0.78)");
      label(ctx, fitText(ctx, horse.name, cw * 0.62 - 6, "13px VT323, monospace"), x + 9, y + 16, 13, "#FFFFFF", "left", "VT323");
      const hr = vitals.get(horse.id)?.hr;
      if (hr !== undefined) {
        rect(ctx, x + 6, y + 20, 42, 12, "rgba(20,26,23,0.78)");
        label(ctx, `♥ ${Math.round(hr)}`, x + 9, y + 30, 13, "#FF8A80", "left", "VT323");
      }
      if (horse.medicalLock) padlock(ctx, x + cw - 24, y + 8, 16);
      if (horse.id === selectedId) {
        ctx.strokeStyle = ART.select;
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(x + 9, y + 9, cw - 18, ch - 18);
        ctx.setLineDash([]);
      }
    }
  }
}

/** Vẽ sơ đồ chuồng theo từng khu (Zone A, B, C) với kích thước lưới tùy biến và trạng thái bảo trì/ngừng dùng. */
export function drawZoneStalls(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  sp: Sprites,
  zone: StallZone,
  zoneStalls: readonly Stall[],
  horses: HorseProfile[],
  vitals: Map<string, { hr: number }>,
  selectedStallCode: string | null,
  t: number,
): void {
  const cols = zone.cols;
  const rows = zone.rows;
  const cw = w / cols;
  const ch = h / rows;
  rect(ctx, 0, 0, w, h, ART.woodDark);

  const horsesById = new Map(horses.map((hz) => [hz.id, hz]));

  for (const s of zoneStalls) {
    const x = s.col * cw;
    const y = s.row * ch;

    // Vách sau và vách ngăn chuồng
    rect(ctx, x + 3, y + 3, cw - 6, ch * 0.34, ART.wood);
    for (let k = 1; k < 4; k++) rect(ctx, x + 3, y + 3 + (ch * 0.34 * k) / 4, cw - 6, 1, ART.woodDark);

    // Nền chuồng theo trạng thái
    if (s.status === "MAINTENANCE") {
      // Nền vạch sọc bảo trì
      rect(ctx, x + 3, y + 3 + ch * 0.34, cw - 6, ch * 0.66 - 6, "#5A3820");
      for (let stripe = 0; stripe < cw; stripe += 16) {
        rect(ctx, x + 3 + stripe, y + 3 + ch * 0.34, 8, ch * 0.66 - 6, "rgba(230, 126, 34, 0.28)");
      }
      label(ctx, "⚒ ĐANG BẢO TRÌ", x + cw / 2, y + ch * 0.58, 16, "#E67E22", "center", "VT323");
    } else if (s.status === "INACTIVE") {
      rect(ctx, x + 3, y + 3 + ch * 0.34, cw - 6, ch * 0.66 - 6, "#34495E");
      label(ctx, "⊘ NGỪNG SỬ DỤNG", x + cw / 2, y + ch * 0.58, 16, "#95A5A6", "center", "VT323");
    } else {
      // AVAILABLE hoặc OCCUPIED
      const horse = s.horseId ? horsesById.get(s.horseId) : undefined;
      rect(ctx, x + 3, y + 3 + ch * 0.34, cw - 6, ch * 0.66 - 6, horse ? ART.straw : ART.empty);
      for (let strawI = 0; strawI < 10; strawI++) {
        const sx = x + 6 + hash(s.row * 97 + s.col * 13 + strawI) * (cw - 14);
        const sy = y + ch * 0.4 + hash(s.row * 31 + s.col * 7 + strawI * 3) * (ch * 0.5);
        rect(ctx, sx, sy, 5, 1, ART.strawDark);
      }
      rect(ctx, x + 3, y + ch * 0.36 - 4, cw * 0.18, 6, ART.woodLight); // máng ăn

      if (!horse) {
        // Ô có ngựa nhưng ngựa không thuộc phiên mô phỏng này: chỉ hiện tên, không vẽ ngựa giả
        label(ctx, s.horseName ?? "Trống (Sẵn sàng)", x + cw / 2, y + ch * 0.72, 15, "rgba(30,38,34,0.55)", "center", "VT323");
      } else {
        const color = HEALTH_COLOR[horse.health];
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 4.5, y + 4.5, cw - 9, ch - 9);

        const act = horse.lifecycle === "CHAN_THUONG" ? "INJURED" : stallActivity(horse, t);
        const src = tinted(sp.horse, horse.coat);
        const base = y + ch - 10;
        const hh = Math.min(ch * 0.74, 96);
        const cx = x + cw / 2;
        if (act === "INJURED") drawFrame(ctx, sp.horse, src, 2 + (Math.floor(t * 1.5) % 2), ROW.SPECIAL, cx, base, hh);
        else if (act === "GRAZE") drawFrame(ctx, sp.horse, src, Math.floor(t * 2) % 3, ROW.REST, cx, base, hh);
        else if (act === "LIE") {
          drawFrame(ctx, sp.horse, src, 3 + (Math.floor(t) % 3), ROW.REST, cx, base, hh);
          drawFrame(ctx, sp.fx, sp.fx.canvas, 2 + (Math.floor(t) % 2), 4, cx + cw * 0.22, y + ch * 0.48, ch * 0.34);
        } else drawFrame(ctx, sp.horse, src, Math.floor(t * 3) % 6, ROW.IDLE, cx, base, hh);

        // Bảng tên + nhịp tim
        rect(ctx, x + 6, y + 22, Math.min(cw * 0.68, 120), 13, "rgba(20,26,23,0.85)");
        label(ctx, fitText(ctx, horse.name, Math.min(cw * 0.68, 120) - 6, "13px VT323, monospace"), x + 9, y + 32, 13, "#FFFFFF", "left", "VT323");
        const hr = vitals.get(horse.id)?.hr;
        if (hr !== undefined) {
          rect(ctx, x + 6, y + 37, 44, 12, "rgba(20,26,23,0.85)");
          label(ctx, `♥ ${Math.round(hr)}`, x + 9, y + 47, 13, "#FF8A80", "left", "VT323");
        }
        if (horse.medicalLock || s.notes?.includes("khóa y tế")) padlock(ctx, x + cw - 24, y + 8, 16);
      }
    }

    // Huy hiệu mã ô chuồng ở góc trên trái (A-01, B-08, C-01)
    rect(ctx, x + 6, y + 6, 36, 14, "rgba(0,0,0,0.7)");
    label(ctx, s.code, x + 24, y + 17, 13, "#FFE082", "center", "VT323");

    // Khung viền chọn (nét đứt)
    if (s.code === selectedStallCode) {
      ctx.strokeStyle = ART.select;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(x + 5, y + 5, cw - 10, ch - 10);
      ctx.setLineDash([]);
    }
  }
}

// ------------------------------------------------------------------ Chướng ngại & thời tiết (M3: dựng sân trước khi chạy)

/** Vẽ chướng ngại trên đường chạy nhìn ngang; `runnerM` để làm bắn bùn khi ngựa lội qua. */
export function drawObstacles(
  ctx: CanvasRenderingContext2D,
  obstacles: readonly Obstacle[],
  L: TrackLayout,
  baseY: number,
  h: number,
  t: number,
  runnerM: number | null,
): void {
  const { cameraM, ppm } = L;
  for (const o of obstacles) {
    const x = (o.atM - cameraM) * ppm;
    if (x < -ppm * 14) continue; // phía phải vẽ ra ngoài khung thì canvas tự cắt
    if (o.kind === "MUD") {
      const w = OBSTACLE.MUD.lengthM * ppm;
      rect(ctx, x, baseY - 3, w, 9, ART.mud);
      rect(ctx, x + 4, baseY - 5, w - 8, 3, ART.mud);
      for (let i = 0; i < 14; i++) rect(ctx, x + hash(o.atM + i) * w, baseY - 2 + hash(o.atM * 3 + i) * 7, 4, 2, ART.mudDark);
      rect(ctx, x + w * 0.2, baseY - 4, w * 0.25, 1, ART.mudShine);
      if (runnerM !== null && runnerM >= o.atM && runnerM <= o.atM + OBSTACLE.MUD.lengthM) {
        const rx = (runnerM - cameraM) * ppm;
        for (let i = 0; i < 10; i++) {
          const p = (t * 3 + hash(i) * 7) % 1;
          rect(ctx, rx - 10 - hash(i * 5) * 30 - p * 20, baseY - 4 - Math.sin(p * Math.PI) * (10 + hash(i * 9) * 14), 3, 3, ART.mudDark);
        }
      }
      continue;
    }
    if (o.kind === "HAY") {
      const bw = ppm * 1.7;
      const bh = h * 0.3;
      rect(ctx, x - bw / 2 - 2, baseY - bh - 2, bw + 4, bh + 4, ART.ink);
      rect(ctx, x - bw / 2, baseY - bh, bw, bh, ART.hay);
      rect(ctx, x - bw / 2, baseY - bh, bw, 3, ART.hayLight);
      rect(ctx, x - bw * 0.2, baseY - bh, 3, bh, ART.hayBand);
      rect(ctx, x + bw * 0.2, baseY - bh, 3, bh, ART.hayBand);
      for (let i = 0; i < 6; i++) rect(ctx, x - bw / 2 + hash(o.atM + i) * bw, baseY - bh + 5 + hash(o.atM * 7 + i) * (bh - 8), 4, 1, ART.hayBand);
      continue;
    }
    // RAIL: hai cột gỗ + hai thanh sơn sọc đỏ trắng
    const half = ppm * 0.9;
    const postH = h * 0.42;
    for (const px of [x - half, x + half]) {
      rect(ctx, px - 3, baseY - postH - 1, 6, postH + 1, ART.ink);
      rect(ctx, px - 2, baseY - postH, 4, postH, ART.woodLight);
    }
    for (const yy of [baseY - h * 0.17, baseY - h * 0.31]) {
      rect(ctx, x - half, yy - 1, half * 2, 5, ART.ink);
      for (let sx = 0; sx < half * 2; sx += 8) rect(ctx, x - half + sx, yy, Math.min(8, half * 2 - sx), 3, (sx / 8) % 2 ? ART.post : ART.sensor);
    }
  }
}

/** Mưa & làm tối mặt sân theo tình trạng sân (ướt / lầy). */
export function drawWeather(ctx: CanvasRenderingContext2D, w: number, h: number, condition: TrackCondition, t: number, railTop: number, railBottom: number): void {
  if (condition === "GOOD") return;
  const heavy = condition === "HEAVY";
  ctx.fillStyle = heavy ? ART.wetHeavy : ART.wet;
  ctx.fillRect(0, railTop, w, railBottom - railTop);
  ctx.fillStyle = heavy ? ART.skyRainHeavy : ART.skyRain;
  ctx.fillRect(0, 0, w, h);
  const drops = heavy ? 140 : 70;
  ctx.fillStyle = ART.rain;
  for (let i = 0; i < drops; i++) {
    const speed = 380 + hash(i) * 220;
    const y = ((hash(i * 3) * h + t * speed) % (h + 20)) - 10;
    const x = ((hash(i * 7) * (w + 60) - t * speed * 0.25) % (w + 60) + w + 60) % (w + 60) - 30;
    for (let k = 0; k < 4; k++) ctx.fillRect(Math.round(x - k), Math.round(y + k * 3), 1, 3);
  }
}

// ------------------------------------------------------------------ Trường đua (M4): cổng, khán đài, bảng xếp hạng, đích

/** Cổng xuất phát nhiều ô; open 0 = đóng, 1 = mở hẳn (cánh cửa gập sang bên). */
export function drawStartGate(ctx: CanvasRenderingContext2D, x: number, laneTops: number[], laneH: number, open: number): void {
  const depth = laneH * 0.9;
  laneTops.forEach((top, i) => {
    rect(ctx, x - 6, top - laneH * 0.55, 6, laneH * 1.1, ART.ink);
    rect(ctx, x - 5, top - laneH * 0.55, 4, laneH * 1.1, ART.gate);
    rect(ctx, x - depth, top - laneH * 0.6, depth, 5, ART.gate);
    label(ctx, String(i + 1), x - depth * 0.5, top - laneH * 0.62, 9, ART.post);
    const doorW = Math.max(2, 10 * (1 - open));
    rect(ctx, x, top - laneH * 0.5, doorW, laneH, ART.ink);
    rect(ctx, x + 1, top - laneH * 0.48, Math.max(1, doorW - 2), laneH - 4, open < 1 ? ART.sensor : ART.gateBar);
  });
}

/** Khán đài phía sau rào trên + khán giả nhún nhảy; hype 0..1 tăng khi ngựa đầu gần đích. */
export function drawCrowd(ctx: CanvasRenderingContext2D, w: number, railTop: number, cameraM: number, ppm: number, hype: number, t: number): void {
  const top = railTop * 0.18;
  const off = cameraM * ppm * 0.5;
  rect(ctx, 0, top, w, railTop - top - 8, ART.standBack);
  // mái khán đài
  rect(ctx, 0, top - 6, w, 8, ART.roof);
  for (let x = -((off * 0.5) % 24); x < w; x += 24) rect(ctx, x, top - 6, 12, 8, ART.roofDark);
  // các bậc + khán giả
  const rows = 4;
  const rowH = (railTop - top - 12) / rows;
  const colors = ["#D32F2F", "#1976D2", "#FBC02D", "#388E3C", "#F57C00", "#7B1FA2", "#FFFFFF", "#6D4C41"];
  for (let r = 0; r < rows; r++) {
    const y = top + 4 + r * rowH;
    rect(ctx, 0, y + rowH - 3, w, 3, ART.standStep);
    const spacing = 9;
    const start = -((off + r * 5) % spacing);
    for (let x = start; x < w; x += spacing) {
      const id = Math.floor((x + off) / spacing) * 7 + r * 131;
      const jump = Math.sin(t * (6 + hash(id) * 4) + hash(id + 1) * 6) > 1 - hype * 1.4 ? Math.round(2 + hype * 2) : 0;
      const hy = y + rowH - 9 - jump;
      rect(ctx, x, hy + 3, 6, 5, colors[Math.floor(hash(id + 2) * colors.length)]);
      rect(ctx, x + 1, hy, 4, 3, ART.skin);
      if (jump && hype > 0.5 && hash(id + 3) > 0.6) rect(ctx, x + 5, hy - 4, 1, 4, ART.skin); // giơ tay
    }
  }
}

export interface BoardRow {
  pos: string;
  name: string;
  silk: string;
  gap: string;
}

/** Bảng xếp hạng gỗ góc trên-phải (giống mockup M4). */
export function drawLeaderboard(ctx: CanvasRenderingContext2D, w: number, rows: BoardRow[], timeText: string): void {
  const bw = Math.min(250, w * 0.36);
  const lh = 17;
  const bh = 30 + rows.length * lh + 22;
  const x = w - bw - 8;
  const y = 8;
  rect(ctx, x + 4, y + 4, bw, bh, "rgba(0,0,0,0.45)");
  rect(ctx, x, y, bw, bh, ART.ink);
  rect(ctx, x + 3, y + 3, bw - 6, bh - 6, ART.woodDark);
  rect(ctx, x + 3, y + 3, bw - 6, 22, ART.wood);
  ctx.textBaseline = "middle";
  ctx.font = "18px VT323, monospace";
  ctx.textAlign = "left";
  ctx.fillStyle = ART.board;
  ctx.fillText("BẢNG XẾP HẠNG", x + 10, y + 15);
  rows.forEach((r, i) => {
    const ry = y + 30 + i * lh;
    if (i === 0) rect(ctx, x + 5, ry - 1, bw - 10, lh, "rgba(233,194,26,0.25)");
    ctx.fillStyle = r.pos === "DNF" ? "#FF8A80" : "#FFE082";
    ctx.font = "10px Silkscreen, monospace";
    ctx.fillText(r.pos, x + 10, ry + lh / 2);
    rect(ctx, x + 44, ry + 4, 9, 9, ART.ink);
    rect(ctx, x + 45, ry + 5, 7, 7, r.silk);
    ctx.font = "17px VT323, monospace";
    ctx.fillStyle = "#F3E6C4";
    const name = r.name.length > 16 ? `${r.name.slice(0, 15)}…` : r.name;
    ctx.fillText(name, x + 60, ry + lh / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "#B8F5A0";
    ctx.fillText(r.gap, x + bw - 10, ry + lh / 2);
    ctx.textAlign = "left";
  });
  ctx.font = "15px VT323, monospace";
  ctx.fillStyle = "#8DFF6A";
  ctx.fillText(`Thời gian ${timeText}`, x + 10, y + bh - 11);
}

/** Đếm ngược 3-2-1-GO giữa màn hình. */
export function drawCountdown(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, frac: number): void {
  const size = Math.round(h * 0.28 * (1.25 - 0.25 * frac));
  ctx.font = `${size}px Silkscreen, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = Math.min(1, 1.6 - frac);
  ctx.fillStyle = ART.ink;
  ctx.fillText(text, w / 2 + 5, h * 0.5 + 5);
  ctx.fillStyle = text === "GO!" ? "#8DFF6A" : "#FFE082";
  ctx.fillText(text, w / 2, h * 0.5);
  ctx.globalAlpha = 1;
}

/** Pháo giấy rơi + đèn flash khi chốt kết quả; age = giây kể từ lúc về đích. */
export function drawFinishFx(ctx: CanvasRenderingContext2D, w: number, h: number, age: number, banner: string): void {
  if (age < 0.35) {
    ctx.fillStyle = `rgba(255,255,255,${0.8 * (1 - age / 0.35)})`;
    ctx.fillRect(0, 0, w, h);
  }
  const colors = ["#D32F2F", "#1976D2", "#FBC02D", "#388E3C", "#F57C00", "#7B1FA2"];
  if (age < 6) {
    for (let i = 0; i < 90; i++) {
      const x = (hash(i) * w + Math.sin(age * 3 + i) * 12) % w;
      const y = -10 + (age * (60 + hash(i * 3) * 80) + hash(i * 7) * h * 0.5) % (h + 20);
      rect(ctx, x, y, 3, Math.floor(age * 10 + i) % 2 ? 3 : 1, colors[i % colors.length]);
    }
  }
  const bw = Math.min(w * 0.7, 520);
  const bx = (w - bw) / 2;
  const by = h * 0.36;
  rect(ctx, bx + 5, by + 5, bw, 54, "rgba(0,0,0,0.45)");
  rect(ctx, bx, by, bw, 54, ART.ink);
  rect(ctx, bx + 3, by + 3, bw - 6, 48, "#E9C21A");
  rect(ctx, bx + 3, by + 3, bw - 6, 4, "#FFF8E6");
  ctx.font = "30px VT323, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ART.ink;
  ctx.fillText(banner, w / 2, by + 28);
}
