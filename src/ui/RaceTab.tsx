// Trường đua 6 làn (SIM-05): chọn ngựa đủ điều kiện → mở cổng → bảng xếp hạng P1–P6 → kết quả chính thức.
import { useEffect, useRef, useState } from "react";
import { publish } from "../sim/bus";
import {
  createRace,
  HORSE_LENGTH_M,
  standings,
  stepRace,
  stepRun,
  triggerIncident,
  type HorseProfile,
  type Race,
  type Surface,
} from "../sim/engine";
import { blockReason, STRATEGY_LABEL } from "../sim/horses";
import { incidentPacket, newSessionId, raceFinishedPacket, raceProgressPacket } from "../sim/packets";
import {
  resolveEventId,
  useEventAcknowledged,
  useTransportError,
  useTransportState,
} from "../sim/socketTransport";
import { drawCountdown, drawCrowd, drawFinishFx, drawLaneTag, drawLeaderboard, drawRunner, drawStartGate, drawTrack, LANE_SILK } from "../render/scenes";
import type { Sprites } from "../render/sprites";
import type { SimulationContext } from "../api/simulatorApi.ts";
import { PixelCanvas } from "./PixelCanvas";
import { formatTime } from "./Telemetry";
import { DISTANCES, SURFACE_LABEL } from "./TrialTab";
import s from "./ui.module.css";
import t from "./Tabs.module.css";

const SUBSTEP = 0.05;
const SPLIT_M = 400;
const COUNTDOWN_S = 3;

function freshLoop(countdown: number) {
  return { tickAcc: 0, uiAcc: 0, phases: [0, 0, 0, 0, 0, 0], realT: 0, countdown, sinceGo: 0, doneAge: 0, cam: null as number | null };
}

interface Props {
  horses: HorseProfile[];
  sprites: Sprites;
  speed: number;
  onIncident: (horseId: string) => void;
  simulationContext?: SimulationContext | null;
  sessionId?: string | null;
}

interface Row {
  lane: number;
  horse: HorseProfile;
  distance: number;
  gap: number;
  kmh: number;
  hr: number;
  status: "RUNNING" | "FINISHED" | "DNF";
  finish: number | null;
  splits: number[];
}

export function RaceTab({ horses, sprites, speed, onIncident, simulationContext, sessionId }: Props) {
  const eligible = horses.filter((h) => !blockReason(h));
  const [picked, setPicked] = useState<string[]>(() => eligible.slice(0, 6).map((h) => h.id));
  const [distance, setDistance] = useState(1200);
  const [surface, setSurface] = useState<Surface>("GRASS");
  const [rows, setRows] = useState<Row[]>([]);
  const [state, setState] = useState<"IDLE" | "RUNNING" | "DONE">("IDLE");
  const [incidentLane, setIncidentLane] = useState(1);

  const raceRef = useRef<Race | null>(null);
  const sessionRef = useRef(sessionId || "");
  const splits = useRef(new Map<number, number[]>());
  const loop = useRef(freshLoop(0));
  const publishedFinishSessionsRef = useRef(new Set<string>());
  const [finishEventId, setFinishEventId] = useState<string | null>(null);
  const [reRunBlocked, setReRunBlocked] = useState(false);

  const transportState = useTransportState();
  const transportError = useTransportError();
  const finishAcknowledged = useEventAcknowledged(finishEventId);

  const isTournamentRace = simulationContext?.type === "RACE";
  const tournamentName = isTournamentRace ? (simulationContext as any).tournamentName : "";

  // Tự động nhận diện cự ly, mặt sân và danh sách ngựa từ phiên giải đua chính thức
  useEffect(() => {
    if (simulationContext?.type === "RACE") {
      const raceCtx = simulationContext as any;
      if (raceCtx.distanceMeters) setDistance(raceCtx.distanceMeters);
      if (raceCtx.surface) setSurface(raceCtx.surface as Surface);
      if (raceCtx.entries?.length) {
        setPicked(raceCtx.entries.map((e: any) => e.horse.id));
      }
      if (sessionId) sessionRef.current = sessionId;
      else if (raceCtx.sessionId) sessionRef.current = raceCtx.sessionId;
    }
  }, [simulationContext, sessionId]);

  const field = picked.map((id) => horses.find((h) => h.id === id)).filter((h): h is HorseProfile => !!h && !blockReason(h));

  function toggle(id: string) {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 6 ? p : [...p, id]));
  }

  function start() {
    if (field.length < 2) return;
    sessionRef.current = sessionId || sessionRef.current || newSessionId("RACE");
    setFinishEventId(null);
    setReRunBlocked(false);
    raceRef.current = createRace(field, distance, surface, (Date.now() & 0x7fffffff) | 0);
    splits.current = new Map(field.map((_, i) => [i + 1, []]));
    loop.current = freshLoop(COUNTDOWN_S);
    publish("sim:workout_command", "IN", {
      event: "sim:workout_command",
      session_id: sessionRef.current,
      action: "START_RACE",
      surface,
      target_distance_m: distance,
      lanes: field.map((h, i) => ({ lane: i + 1, horse_id: h.id })),
      source: "LOCAL_OPERATOR",
    });
    setState("RUNNING");
    setRows(rowsOf(raceRef.current, splits.current));
  }

  function reset() {
    raceRef.current = null;
    setFinishEventId(null);
    setReRunBlocked(false);
    setState("IDLE");
    setRows([]);
  }

  function incident() {
    const race = raceRef.current;
    const e = race?.entries.find((x) => x.lane === incidentLane);
    if (!race || !e || e.run.status !== "RUNNING") return;
    triggerIncident(e.run, "FRACTURE");
    publish("sim:incident_report", "OUT", incidentPacket(sessionRef.current, e.horse, "FRACTURE", "TRACK", e.run));
    onIncident(e.horse.id);
  }

  const onFrame = (ctx: CanvasRenderingContext2D, w: number, h: number, dtReal: number) => {
    const race = raceRef.current;
    const L = loop.current;
    L.realT += dtReal;
    // Đếm ngược 3-2-1 theo thời gian thật (không phụ thuộc tốc độ mô phỏng), rồi cổng bật mở
    if (race && L.countdown > 0) {
      L.countdown -= dtReal;
    } else if (race) {
      L.sinceGo += dtReal;
    }
    if (race && L.countdown <= 0 && !race.done) {
      let simDt = dtReal * speed;
      while (simDt > 1e-6 && !race.done) {
        const step = Math.min(SUBSTEP, simDt);
        simDt -= step;
        const before = race.entries.map((e) => e.run.distance);
        stepRace(race, step);
        race.entries.forEach((e, i) => {
          L.phases[i] += (e.run.v < 2.6 ? e.run.v * 0.55 : e.run.strideFreqHz) * step;
          // Thời gian từng đoạn 400 m (split times)
          const k = Math.floor(e.run.distance / SPLIT_M);
          if (k > Math.floor(before[i] / SPLIT_M) && k * SPLIT_M <= race.distanceM) {
            const at = race.t - (e.run.distance - k * SPLIT_M) / Math.max(e.run.v, 0.1);
            splits.current.get(e.lane)?.push(at);
          }
        });
        L.tickAcc += step;
        if (L.tickAcc >= 1) {
          L.tickAcc -= 1;
          publish("sim:race_progress", "OUT", raceProgressPacket(sessionRef.current, race));
        }
      }
      if (race.done) {
        const packet = raceFinishedPacket(sessionRef.current, race);
        const eventId = resolveEventId("sim:session_finished", packet);
        const alreadySent = publishedFinishSessionsRef.current.has(sessionRef.current);
        publishedFinishSessionsRef.current.add(sessionRef.current);
        setFinishEventId(eventId);
        setReRunBlocked(alreadySent);
        if (!alreadySent) {
          publish("sim:session_finished", "OUT", packet);
        }
        setState("DONE");
        setRows(rowsOf(race, splits.current));
      }
      L.uiAcc += dtReal;
      if (L.uiAcc > 0.2) {
        L.uiAcc = 0;
        setRows(rowsOf(race, splits.current));
      }
    } else if (race?.done) {
      // Sau khi chốt kết quả: ngựa vẫn chạy chậm dần / đi bộ hồi phục cho cảnh không bị đứng hình
      L.doneAge += dtReal;
      const step = Math.min(SUBSTEP * 4, dtReal * Math.max(speed, 1));
      race.entries.forEach((e, i) => {
        if (e.run.status === "COOLDOWN") stepRun(e.run, e.horse, step);
        L.phases[i] += (e.run.v < 2.6 ? e.run.v * 0.55 : e.run.strideFreqHz) * step;
      });
    }

    // ---- vẽ
    const ppm = w / 64;
    const order = race ? standings(race) : [];
    const leaderM = race ? Math.max(...race.entries.map((e) => (e.run.status === "ABORTED_INJURY" ? 0 : e.run.distance))) : 0;
    const raceM = race?.distanceM ?? distance;
    const camTarget = Math.min(leaderM, raceM + 8) - (w * 0.66) / ppm;
    L.cam = L.cam === null ? camTarget : L.cam + (camTarget - L.cam) * Math.min(1, dtReal * 5); // camera bám mượt
    const cameraM = L.cam;
    const railTop = h * 0.24;
    const railBottom = h * 0.97;
    const progress = race ? Math.min(1, leaderM / raceM) : 0;
    drawTrack(ctx, w, h, race?.surface ?? surface, raceM, { cameraM, ppm, railTop, railBottom });
    drawCrowd(ctx, w, railTop, cameraM, ppm, race?.done ? 1 : 0.15 + Math.max(0, progress - 0.7) * 2.8, L.realT);

    const lanes = race ? race.entries : field.map((horse, i) => ({ lane: i + 1, horse, run: null }));
    const laneH = (railBottom - railTop) / Math.max(6, lanes.length);
    const leaderLane = order[0]?.lane;
    // vẽ từ làn xa (trên) tới làn gần (dưới) để ngựa gần che ngựa xa
    [...lanes].sort((a, b) => b.lane - a.lane).forEach((e) => {
      const i = e.lane - 1;
      const baseY = railTop + laneH * (lanes.length - i) - laneH * 0.08;
      const dist = e.run?.distance ?? 0;
      const x = (dist - cameraM) * ppm;
      if (x < -120 || x > w + 120) return;
      const hh = laneH * 1.45;
      drawRunner(
        ctx,
        sprites,
        e.horse,
        {
          v: e.run?.v ?? 0,
          status: e.run?.status ?? "RUNNING",
          incident: e.run?.incident ?? null,
          phase: L.phases[i],
          t: e.run ? e.run.t : L.realT,
        },
        x,
        baseY,
        hh,
        LANE_SILK[i],
      );
      drawLaneTag(ctx, e.lane, x - hh * 0.55, baseY - hh * 0.5, LANE_SILK[i], state !== "IDLE" && e.lane === leaderLane);
    });

    // Cổng xuất phát: đóng trong lúc đếm ngược, bật mở 0.4 s sau hiệu lệnh
    const gateX = (0 - cameraM) * ppm + laneH * 0.9;
    if (gateX > -60 && gateX < w + 60) {
      const centers = lanes.map((e) => railTop + laneH * (lanes.length - (e.lane - 1)) - laneH * 0.58);
      drawStartGate(ctx, gateX, centers, laneH, race && L.countdown <= 0 ? Math.min(1, L.sinceGo / 0.4) : 0);
    }

    if (race) {
      drawLeaderboard(
        ctx,
        w,
        order.map((e, i) => ({
          pos: e.run.status === "ABORTED_INJURY" ? "DNF" : `P${i + 1}`,
          name: e.horse.name,
          silk: LANE_SILK[e.lane - 1],
          gap:
            e.run.status === "ABORTED_INJURY"
              ? "—"
              : e.run.finishTime !== null
                ? formatTime(e.run.finishTime)
                : i === 0
                  ? `${Math.max(0, Math.round(raceM - e.run.distance))}m`
                  : `+${((Math.min(order[0].run.distance, raceM) - e.run.distance) / HORSE_LENGTH_M).toFixed(1)}L`,
        })),
        formatTime(race.t),
      );
      if (L.countdown > 0) {
        const n = Math.ceil(L.countdown);
        drawCountdown(ctx, w, h, String(n), 1 - (L.countdown - (n - 1)));
      } else if (L.sinceGo < 0.7) drawCountdown(ctx, w, h, "GO!", L.sinceGo / 0.7);
      if (race.done) {
        const win = order.find((e) => e.run.finishTime !== null);
        if (win) drawFinishFx(ctx, w, h, L.doneAge, `P1 · ${win.horse.name} · ${formatTime(win.run.finishTime ?? 0)}`);
      }
    }
  };

  const busy = state === "RUNNING";

  return (
    <div className={t.stack}>
      <section className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>
            {isTournamentRace && tournamentName ? `🏆 Giải đấu: ${tournamentName}` : "Trường đua 6 làn"}
          </h2>
          <div className={t.pillGroup}>
            {isTournamentRace && (
              <span className={s.badge} style={{ background: "rgba(99, 102, 241, 0.15)", color: "#6366f1" }}>
                Phiên giải chính thức
              </span>
            )}
            <span className={state === "DONE" ? s.FIT : state === "RUNNING" ? s.WATCH : s.badge}>
              {state === "DONE" ? "Đã chốt kết quả" : state === "RUNNING" ? "Đang đua" : "Chuẩn bị"}
            </span>
          </div>
        </div>
        {isTournamentRace && state === "DONE" && (
          <div
            role="status"
            style={{
              padding: "0.75rem 1rem",
              margin: "0.5rem 1rem",
              borderRadius: "8px",
              fontSize: "0.875rem",
              fontWeight: 500,
              ...(reRunBlocked
                ? {
                    background: "rgba(245, 158, 11, 0.12)",
                    border: "1px solid rgba(245, 158, 11, 0.35)",
                    color: "#b45309",
                  }
                : finishAcknowledged
                  ? {
                      background: "rgba(16, 185, 129, 0.12)",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                      color: "var(--ok, #10b981)",
                    }
                  : transportError || transportState === "OFFLINE"
                    ? {
                        background: "rgba(239, 68, 68, 0.1)",
                        border: "1px solid rgba(239, 68, 68, 0.32)",
                        color: "#b91c1c",
                      }
                    : {
                        background: "rgba(59, 130, 246, 0.1)",
                        border: "1px solid rgba(59, 130, 246, 0.3)",
                        color: "#1d4ed8",
                      }),
            }}
          >
            {reRunBlocked
              ? `⚠ Phiên mô phỏng (${sessionRef.current}) đã gửi kết quả ở lượt chạy trước nên máy chủ giữ nguyên kết quả đó. Để chạy lại và đồng bộ lượt mới cho giải đấu, hãy quay lại Main Web và bấm "Mở mô phỏng 2D" để cấp phiên mới.`
              : finishAcknowledged
                ? "✓ Kết quả đua mô phỏng 2D đã đồng bộ thành công lên Main Web! Thứ hạng, thời gian và vận tốc từng ngựa đã được nhập sẵn vào biểu mẫu kết quả giải đấu. Hãy quay lại tab Main Web để kiểm tra lại và bấm \"Khóa kết quả chính thức\"."
                : transportError
                  ? `✕ Chưa thể đồng bộ kết quả lên Main Web (${transportError}). Vui lòng kiểm tra kết nối máy chủ hoặc quay lại Main Web để mở lại "Mở mô phỏng 2D" / dùng "Lấy kết quả nhanh".`
                  : transportState === "OFFLINE"
                    ? "⚠ Cuộc đua đã kết thúc nhưng trình giả lập chưa kết nối được tới máy chủ Main Web (OFFLINE). Kết quả chưa được lưu lên hệ thống."
                    : "⟳ Cuộc đua đã kết thúc — đang đồng bộ thứ hạng và thời gian về đích lên Main Web..."}
          </div>
        )}
        {!isTournamentRace && state === "DONE" && (
          <div
            role="status"
            style={{
              padding: "0.65rem 1rem",
              margin: "0.5rem 1rem",
              borderRadius: "8px",
              background: "rgba(100, 116, 139, 0.1)",
              border: "1px solid rgba(100, 116, 139, 0.25)",
              color: "#475569",
              fontSize: "0.84rem",
              fontWeight: 500,
            }}
          >
            ℹ Phiên chạy thử độc lập (không mở từ giải đấu trên Main Web), kết quả chỉ hiển thị tại màn hình mô phỏng này.
          </div>
        )}
        <div className={s.cardBody}>
          <div className={s.row} data-control>
            <div className={s.field}>
              Mặt sân
              <div className={s.segmented} role="group" aria-label="Mặt sân">
                {(Object.keys(SURFACE_LABEL) as Surface[]).map((k) => (
                  <button key={k} type="button" className={s.segment} aria-pressed={surface === k} disabled={busy} onClick={() => setSurface(k)}>
                    {SURFACE_LABEL[k]}
                  </button>
                ))}
              </div>
            </div>
            <div className={s.field}>
              Cự ly
              <div className={s.segmented} role="group" aria-label="Cự ly">
                {DISTANCES.filter((d) => d >= 1000).map((d) => (
                  <button key={d} type="button" className={s.segment} aria-pressed={distance === d} disabled={busy} onClick={() => setDistance(d)}>
                    {d}m
                  </button>
                ))}
              </div>
            </div>
            <div className={s.spacer} />
            {state === "IDLE" ? (
              <button type="button" className={s.primary} onClick={start} disabled={field.length < 2}>
                » Mở cổng xuất phát
              </button>
            ) : (
              <button type="button" className={s.btn} onClick={reset}>
                Đặt lại đường đua
              </button>
            )}
          </div>
        </div>
        <div className={s.sceneFrame}>
          <PixelCanvas aspect={0.5} onFrame={onFrame} label="Trường đua 6 làn" />
        </div>
        <div className={`${s.cardBody} ${t.incidentBar}`} data-control>
          <span className={s.hint}>Giả lập sự cố trong cuộc đua — ngựa bị ghi DNF:</span>
          <select
            aria-label="Chọn làn"
            value={incidentLane}
            onChange={(e) => setIncidentLane(Number(e.target.value))}
            disabled={!busy}
            className={s.btn}
          >
            {field.map((h, i) => (
              <option key={h.id} value={i + 1}>
                Làn {i + 1} · {h.name}
              </option>
            ))}
          </select>
          <button type="button" className={s.danger} disabled={!busy} onClick={incident}>
            !! Gãy chân
          </button>
        </div>
      </section>

      <div className={t.split}>
        <section className={s.card}>
          <div className={s.cardHead}>
            <h3 className={s.cardTitle}>Bảng xếp hạng trực tiếp</h3>
            <span className={s.hint}>khoảng cách tính bằng thân ngựa ({HORSE_LENGTH_M} m)</span>
          </div>
          <div className={s.cardBody}>
            {rows.length === 0 ? (
              <p className={s.hint}>Chọn 2–6 ngựa rồi mở cổng xuất phát.</p>
            ) : (
              <table className={s.table}>
                <thead>
                  <tr>
                    <th>P</th>
                    <th>Ngựa</th>
                    <th className={s.num}>Quãng đường</th>
                    <th className={s.num}>Cách</th>
                    <th className={s.num}>km/h</th>
                    <th className={s.num}>bpm</th>
                    <th className={s.num}>Đoạn 400 m</th>
                    <th className={s.num}>Về đích</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.lane} className={r.status === "DNF" ? t.dnf : i === 0 ? t.leader : undefined}>
                      <td className={s.pixel}>{r.status === "DNF" ? "DNF" : `P${i + 1}`}</td>
                      <td>
                        <span className={t.laneDot} style={{ background: LANE_SILK[r.lane - 1] }} />
                        {r.lane} · {r.horse.name}
                      </td>
                      <td className={s.num}>{Math.round(r.distance)} m</td>
                      <td className={s.num}>{i === 0 ? "—" : r.gap.toFixed(1)}</td>
                      <td className={s.num}>{r.kmh.toFixed(1)}</td>
                      <td className={s.num}>{Math.round(r.hr)}</td>
                      <td className={s.num}>{r.splits.length ? r.splits.map((x, k) => (k ? x - r.splits[k - 1] : x).toFixed(1)).join(" · ") : "—"}</td>
                      <td className={s.num}>{r.finish !== null ? formatTime(r.finish) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className={s.card}>
          <div className={s.cardHead}>
            <h3 className={s.cardTitle}>Ngựa tham gia</h3>
            <span className={s.hint}>{field.length}/6</span>
          </div>
          <div className={s.cardBody}>
            <ul className={t.pickList}>
              {horses.map((h) => {
                const reason = blockReason(h);
                const on = picked.includes(h.id) && !reason;
                return (
                  <li key={h.id}>
                    <label className={reason ? t.pickDisabled : t.pick}>
                      <input type="checkbox" checked={on} disabled={!!reason || busy || (!on && field.length >= 6)} onChange={() => toggle(h.id)} />
                      <span>
                        {h.name}
                        {reason && <div className={t.pickReason}>{reason} — không được đăng ký</div>}
                      </span>
                      <span className={s.hint}>{STRATEGY_LABEL[h.strategy]}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function rowsOf(race: Race, splits: Map<number, number[]>): Row[] {
  const order = standings(race);
  const leader = order[0]?.run.distance ?? 0;
  return order.map((e) => ({
    lane: e.lane,
    horse: e.horse,
    distance: Math.min(e.run.distance, race.distanceM),
    gap: (Math.min(leader, race.distanceM) - Math.min(e.run.distance, race.distanceM)) / HORSE_LENGTH_M,
    kmh: e.run.v * 3.6,
    hr: e.run.hr,
    status: e.run.status === "ABORTED_INJURY" ? "DNF" : e.run.finishTime !== null ? "FINISHED" : "RUNNING",
    finish: e.run.finishTime,
    splits: [...(splits.get(e.lane) ?? [])],
  }));
}
