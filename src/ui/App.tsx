import { useCallback, useEffect, useRef, useState } from "react";
import { SCREEN_LABEL, type Screen } from "../hub/zones";
import { onBusEvent, publish } from "../sim/bus";
import type { HorseProfile } from "../sim/engine";
import { consume, deliver, initialInventory, placeOrder, type Inventory, type SupplyId } from "../sim/inventory";
import { lockSyncPacket } from "../sim/packets";
import {
  connectSimulatorTransport,
  disconnectSimulatorTransport,
  useTransportState,
  getLastError,
} from "../sim/socketTransport.ts";
import { useSprites } from "../render/sprites";
import {
  getWorkoutSimulationContext,
  workoutToTrialSetup,
  type SimulationContext,
} from "../api/simulatorApi.ts";
import { toHorseProfile } from "../api/horseMapper.ts";
import { listHorses } from "../api/horsesApi.ts";
import c from "./App.module.css";
import { FarmHub } from "./FarmHub";
import { RaceTab } from "./RaceTab";
import { HorsePicker } from "./HorsePicker";
import { TrialTab } from "./TrialTab";
import s from "./ui.module.css";

type TrackTab = "TRIAL" | "RACE";
const NAV: Screen[] = ["HUB", "TRACK"];
// SRS: nút điều khiển tốc độ mô phỏng 1× · 10× · 60× · Tạm dừng
const SPEEDS = [1, 10, 60, 0];
const FADE_MS = 450;
let announced = false; // StrictMode chạy effect 2 lần — chỉ báo ONLINE một lần

export function App() {
  const { sprites, error } = useSprites();
  const transportState = useTransportState();
  const transportError = getLastError();

  const query = new URLSearchParams(window.location.search);
  const sessionId = query.get("sessionId")?.trim() || query.get("session_id")?.trim() || null;

  const [simulationContext, setSimulationContext] = useState<SimulationContext | null>(null);
  const [loadingContext, setLoadingContext] = useState<boolean>(true);
  const [contextError, setContextError] = useState<string | null>(null);

  const [horses, setHorses] = useState<HorseProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>("HUB");
  const [cameFrom, setCameFrom] = useState<Screen | null>(null);
  const [trackTab, setTrackTab] = useState<TrackTab>("TRIAL");
  const [speed, setSpeed] = useState(1);
  const [reported, setReported] = useState<Set<string>>(new Set());
  const [fade, setFade] = useState<{ phase: "out" | "in"; label: string } | null>(null);
  const timers = useRef<number[]>([]);
  const [inventory, setInventory] = useState(initialInventory);
  const inventoryRef = useRef<Inventory>(inventory);
  const [lastTrip, setLastTrip] = useState<{ arriveAt: number; items: SupplyId[] } | null>(null);
  const realNow = () => performance.now() / 1000;

  const fetchContext = useCallback(async () => {
    setLoadingContext(true);
    setContextError(null);
    try {
      if (sessionId) {
        const ctx = await getWorkoutSimulationContext(sessionId);
        setSimulationContext(ctx);
        const mappedHorse = toHorseProfile(ctx.horse, 0);
        setHorses([mappedHorse]);
        setSelectedId(mappedHorse.id);
        if (ctx.type === "WORKOUT") {
          setScreen("TRACK");
          setTrackTab("TRIAL");
        } else {
          setScreen("HUB");
        }
      } else {
        // Direct port 5175 access: loads complete real horse/stall catalogue from Backend without login
        const rawHorses = await listHorses();
        if (!Array.isArray(rawHorses) || rawHorses.length === 0) {
          throw new Error("Không thể nạp danh mục ngựa từ máy chủ Backend. Vui lòng kiểm tra kết nối dịch vụ.");
        }
        const mapped = rawHorses.map((h, i) => toHorseProfile(h, i));
        setSimulationContext(null);
        setHorses(mapped);
        setSelectedId(mapped[0]?.id || null);
        setScreen("HUB");
      }
    } catch (err: any) {
      setContextError(err.message || "Không thể nạp dữ liệu từ Máy chủ Backend.");
    } finally {
      setLoadingContext(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  // Kết nối Socket.IO duy nhất bằng Main-Web-issued sessionId
  useEffect(() => {
    if (sessionId) {
      connectSimulatorTransport({ sessionId });
    } else {
      disconnectSimulatorTransport();
    }
    return () => {
      disconnectSimulatorTransport();
    };
  }, [sessionId]);

  // Nhận lệnh đồng bộ khóa y tế từ Backend theo thời gian thực
  useEffect(() => {
    return onBusEvent((entry) => {
      if (entry.event === "sys:medical_lock_sync" && entry.direction === "IN") {
        const p = entry.payload as any;
        if (p && p.horse_id) {
          setHorses((prev) =>
            prev.map((h) => (h.id === p.horse_id ? { ...h, medicalLock: Boolean(p.medical_lock) } : h)),
          );
        }
      }
    });
  }, []);

  // Kho tiêu hao theo số ngựa × thời gian mô phỏng (dừng khi tạm dừng); xe giao hàng chạy theo đồng hồ thật — ở mọi màn hình
  useEffect(() => {
    const TICK_S = 0.5;
    const id = window.setInterval(() => {
      const dt = TICK_S * speed;
      const used = dt > 0 ? consume(inventoryRef.current, horses.length, dt) : inventoryRef.current;
      const { inventory: next, arrived } = deliver(used, realNow());
      if (next === inventoryRef.current) return;
      inventoryRef.current = next;
      setInventory(next);
      if (arrived.length) setLastTrip({ arriveAt: arrived[0].arriveAt, items: arrived.map((o) => o.item) });
    }, TICK_S * 1000);
    return () => clearInterval(id);
  }, [speed, horses.length]);

  const orderSupply = (item: SupplyId) => {
    inventoryRef.current = placeOrder(inventoryRef.current, item, realNow());
    setInventory(inventoryRef.current);
  };
  // Chuyến xe đang chạy (đơn chưa tới) hoặc chuyến vừa giao xong (để vẽ cảnh xe rời đi)
  const trip = inventory.orders.length ? { arriveAt: inventory.orders[0].arriveAt, items: inventory.orders.map((o) => o.item) } : lastTrip;

  useEffect(() => {
    if (!announced) {
      announced = true;
      publish("sim:device_status", "OUT", {
        event: "sim:device_status",
        device: "SIMULATOR_WEB",
        status: "ONLINE",
        transport: "SOCKET_IO",
        horses_online: horses.map((h) => h.id),
      });
    }
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, [horses]);

  /** Chuyển cảnh: mờ dần toàn bộ → đổi trang → hiện dần. Chỉ đổi độ mờ (không dịch chuyển) nên vẫn giữ khi bật giảm chuyển động. */
  function go(target: Screen, label = SCREEN_LABEL[target]) {
    if (target === screen || fade) return;
    setFade({ phase: "out", label });
    timers.current.push(
      window.setTimeout(() => {
        setCameFrom(screen);
        setScreen(target);
        window.scrollTo(0, 0);
        setFade({ phase: "in", label });
      }, FADE_MS),
      window.setTimeout(() => setFade(null), FADE_MS * 2 + 150),
    );
  }

  const selected = horses.find((h) => h.id === selectedId) ?? horses[0];

  function toggleLock(id: string) {
    const h = horses.find((x) => x.id === id);
    if (!h) return;
    const next = { ...h, medicalLock: !h.medicalLock };
    publish("sys:medical_lock_sync", "IN", lockSyncPacket(next, next.medicalLock));
    setHorses((list) => list.map((x) => (x.id === id ? next : x)));
  }

  const markReported = (id: string) => setReported((r) => new Set(r).add(id));
  const simScreen = screen === "TRACK";

  // Đang nạp dữ liệu từ Backend
  if (loadingContext) {
    return (
      <div className={c.shell} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className={c.centerNotice}>
          <p className={c.loading}>Đang nạp dữ liệu từ Máy chủ Backend…</p>
        </div>
      </div>
    );
  }

  // Lỗi nạp dữ liệu (session không hợp lệ / Backend offline): hiện lỗi rõ ràng, không fallback mock
  if (contextError) {
    return (
      <div className={c.shell} style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh" }}>
        <div className={c.centerNotice} style={{ maxWidth: 560, margin: "auto" }}>
          <p className={s.noticeDanger} role="status">{contextError}</p>
          <div style={{ marginTop: "var(--sp-4)", display: "flex", gap: "var(--sp-3)", justifyContent: "center" }}>
            <button type="button" className={`${s.btn} ${s.primary}`} onClick={fetchContext}>
              Thử tải lại
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={c.shell} data-screen={screen}>
      <header className={c.header}>
        <button type="button" className={c.brand} onClick={() => go("HUB")} aria-label="Về trang trại">
          <span className={c.logo} aria-hidden>
            EF
          </span>
          <span>
            <span className={c.product}>EquiFlow Simulator</span>
            <span className={c.tagline}>Trang trại ngựa đua mô phỏng v3</span>
          </span>
        </button>
        <nav className={c.views} aria-label="Khu vực">
          {NAV.map((id) => (
            <button key={id} type="button" className={c.viewBtn} aria-current={screen === id} onClick={() => go(id)}>
              {SCREEN_LABEL[id]}
            </button>
          ))}
        </nav>
        <div className={c.headerRight}>
          <span
            className={`${c.statusBadge} ${c[transportState.toLowerCase()]}`}
            title={transportError || `Socket.IO: ${transportState}`}
          >
            <span className={c.statusDot} />
            {transportState === "ONLINE"
              ? "Trực tuyến"
              : transportState === "CONNECTING"
              ? "Đang nối…"
              : "Ngoại tuyến"}
          </span>

          {simulationContext ? (
            <span className={c.userBadge} title={`Mã phiên: ${sessionId}`}>
              {simulationContext.type === "WORKOUT" ? "🏃 Buổi tập" : "🩺 Khám bệnh"} · {simulationContext.horse.name}
            </span>
          ) : (
            <span className={c.userBadge} title="Chế độ trực tiếp: xem danh mục ngựa thực tế từ Backend">
              📋 Danh mục trực tiếp ({horses.length} ngựa)
            </span>
          )}

          {simScreen && (
            <>
              <span className={c.device}>
                <span className={c.dot} /> Đang mô phỏng
              </span>
              <div className={c.speed} role="group" aria-label="Tốc độ mô phỏng">
                {SPEEDS.map((v) => (
                  <button key={v} type="button" className={c.speedBtn} aria-pressed={speed === v} aria-label={v === 0 ? "Tạm dừng" : `Tốc độ ${v} lần`} onClick={() => setSpeed(v)}>
                    {v === 0 ? "II" : `${v}×`}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </header>

      {transportError && (
        <div className={s.noticeDanger} role="alert" style={{ margin: "var(--sp-2) var(--sp-5)" }}>
          ⚠️ Lỗi truyền tin tới Máy chủ: {transportError}
        </div>
      )}

      {error && <p className={s.noticeDanger}>{error}</p>}
      {!sprites && !error && <p className={c.loading}>Đang dựng trang trại…</p>}

      {sprites && horses.length > 0 && screen === "HUB" && (
        <FarmHub
          sprites={sprites}
          horses={horses}
          reported={reported}
          speed={speed}
          speeds={SPEEDS}
          onSpeed={setSpeed}
          onEnterTrack={() => go("TRACK")}
          onSelect={setSelectedId}
          onToggleLock={toggleLock}
          onIncident={markReported}
          inventory={inventory}
          onOrder={orderSupply}
          trip={trip}
          arriveFrom={cameFrom === "HUB" ? null : cameFrom}
          initialVetOpen={simulationContext?.type === "EXAM"}
          sessionId={sessionId}
          targetHorseId={simulationContext?.horse?.id ?? selectedId}
        />
      )}

      {sprites && horses.length > 0 && simScreen && (
        <div className={c.layout}>
          <main className={c.main}>
            <div className={c.zoneBar}>
              <button type="button" className={`${s.btn} ${s.puffy}`} onClick={() => go("HUB")}>
                ◀ Về trang trại
              </button>
              <h1 className={c.zoneTitle}>{SCREEN_LABEL[screen]}</h1>
              {screen === "TRACK" && (
                <nav className={c.tabs} aria-label="Hoạt động trên đường đua">
                  {(
                    [
                      ["TRIAL", "Chạy thử", "1 ngựa"],
                      ["RACE", "Đua 6 làn", "tối đa 6 ngựa"],
                    ] as const
                  ).map(([id, label, code]) => (
                    <button key={id} type="button" className={c.tab} aria-current={trackTab === id} onClick={() => setTrackTab(id)}>
                      {label}
                      <span className={c.tabCode}>{code}</span>
                    </button>
                  ))}
                </nav>
              )}
            </div>
            {screen === "TRACK" && trackTab === "TRIAL" && (
              <HorsePicker horses={horses} sprites={sprites} selectedId={selected?.id ?? null} onSelect={setSelectedId} />
            )}
            {screen === "TRACK" && trackTab === "TRIAL" && selected && (
              <TrialTab
                horse={selected}
                sprites={sprites}
                speed={speed}
                onIncident={markReported}
                sessionId={sessionId ?? undefined}
                initialWorkout={
                  simulationContext?.type === "WORKOUT"
                    ? workoutToTrialSetup(simulationContext.workout)
                    : undefined
                }
              />
            )}
            {screen === "TRACK" && trackTab === "RACE" && (
              <RaceTab horses={horses} sprites={sprites} speed={speed} onIncident={markReported} />
            )}
          </main>
        </div>
      )}

      {fade && (
        <div className={c.curtain} data-phase={fade.phase} aria-hidden>
          <div className={c.curtainCard}>
            <span className={c.curtainKicker}>{fade.phase === "out" ? "Đang vào" : "Đã tới"}</span>
            <span className={c.curtainTitle}>{fade.label}</span>
            <span className={c.curtainDots}>
              <i />
              <i />
              <i />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
