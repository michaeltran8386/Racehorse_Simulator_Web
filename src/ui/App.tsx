import { useCallback, useEffect, useRef, useState } from "react";
import { SCREEN_LABEL, type Screen } from "../hub/zones";
import { onBusEvent, publish } from "../sim/bus";
import type { HorseProfile } from "../sim/engine";
import {
  addInboundDelivery,
  applyDeliveryCompleted,
  buildInventory,
  initialInventory,
  mapSupplyToIconKey,
  reconcileAuthoritativeDeliveries,
  tickDeliveries,
  type InboundDeliveryOrder,
  type Inventory,
  type SupplyId,
} from "../sim/inventory";
import { fetchSimulatorInventoryContext } from "../api/inventoryApi.ts";
import { getSupplyTransport, type SupplyDeliveryStartPayload } from "../sim/supplyTransport.ts";
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
import { AudioControl } from "./AudioControl";
import { audio } from "../audio/audioManager";
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
  const latestInventorySeqRef = useRef<number>(0);
  const [inventoryError, setInventoryError] = useState<string | null>(null);
  const [lastTrip, setLastTrip] = useState<{ arriveAt: number; items: SupplyId[] } | null>(null);
  const truckStopPlayedRef = useRef<number | null>(null);
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

  const loadInventory = useCallback(async () => {
    const seq = ++latestInventorySeqRef.current;
    try {
      const data = await fetchSimulatorInventoryContext();
      if (seq !== latestInventorySeqRef.current) {
        // Yêu cầu mới hơn đã được phát ra; hủy phản hồi cũ để chống ghi đè dữ liệu
        return;
      }
      // R-3: Reconcile pending orders against authoritative Backend activeDeliveries
      // Orders completed on Backend are pruned from local state, active orders preserved/added
      const baseInv = buildInventory(data.stocks, inventoryRef.current.orders);
      const reconciledInv = reconcileAuthoritativeDeliveries(
        baseInv,
        Array.isArray(data.activeDeliveries) ? data.activeDeliveries : [],
      );
      inventoryRef.current = reconciledInv;
      setInventory(reconciledInv);
      setInventoryError(null);
    } catch (err: any) {
      if (seq === latestInventorySeqRef.current) {
        const msg = err?.message || "Không thể kết nối tới máy chủ Backend để lấy dữ liệu kho.";
        setInventoryError(msg);
        console.warn("Could not load simulator inventory context:", err);
      }
    }
  }, []);

  useEffect(() => {
    loadInventory();
    const onFocus = () => loadInventory();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadInventory]);

  useEffect(() => {
    const transport = getSupplyTransport();
    transport.connect();

    const handleDeliveryStart = (payload: SupplyDeliveryStartPayload) => {
      const nowSec = performance.now() / 1000;
      const wallClockNowMs = Date.now();
      const endsAtMs = new Date(payload.animationEndsAt).getTime();
      const remainingMs = Math.max(0, endsAtMs - wallClockNowMs);
      const arriveAt = nowSec + remainingMs / 1000;

      const order: InboundDeliveryOrder = {
        id: payload.requestId,
        requestId: payload.requestId,
        requestNumber: payload.requestNumber,
        zoneId: payload.zoneId,
        supplyId: payload.supplyId,
        supplyCode: payload.supplyCode,
        supplyName: payload.supplyName,
        category: payload.category,
        unit: payload.unit,
        approvedQuantity: payload.approvedQuantity,
        dispatchedAt: new Date(payload.dispatchedAt).getTime(),
        animationEndsAt: endsAtMs,
        fallbackAt: new Date(payload.fallbackAt).getTime(),
        arriveAt,
        ackCapability: payload.ackCapability,
        status: "DELIVERING",
      };

      // R-3: addInboundDelivery merges ackCapability into existing REST-snapshot order
      inventoryRef.current = addInboundDelivery(inventoryRef.current, order);
      setInventory({ ...inventoryRef.current });
      audio.playSfx("delivery-vehicle-arrive");
    };

    const handleActiveDeliveries = (deliveries: SupplyDeliveryStartPayload[]) => {
      if (!Array.isArray(deliveries)) return;
      for (const d of deliveries) {
        handleDeliveryStart(d);
      }
    };

    const handleDeliveryCompleted = (payload: any) => {
      inventoryRef.current = applyDeliveryCompleted(inventoryRef.current, payload);
      setInventory({ ...inventoryRef.current });
      audio.playSfx("delivery-complete");
      // R-3: Refresh authoritative stock from REST after completion
      loadInventory();
    };

    // R-3: On supply socket reconnect, refresh authoritative stock to catch any
    // deliveries completed while the socket was offline
    const handleStateChange = (state: string) => {
      if (state === 'ONLINE') {
        loadInventory();
      }
    };

    const unsubStart = transport.onDeliveryStart(handleDeliveryStart);
    const unsubActive = transport.onActiveDeliveries(handleActiveDeliveries);
    const unsubCompleted = transport.onDeliveryCompleted(handleDeliveryCompleted);
    const unsubState = transport.onStateChange(handleStateChange);

    return () => {
      unsubStart();
      unsubActive();
      unsubCompleted();
      unsubState();
    };
  }, [loadInventory]);

  // Hoạt cảnh xe giao hàng chạy theo đồng hồ thật độc lập với tốc độ mô phỏng
  useEffect(() => {
    audio.init();
    audio.startMusic();
    const TICK_MS = 250;
    const transport = getSupplyTransport();

    const id = window.setInterval(() => {
      const nowSec = realNow();
      const nowMs = Date.now();

      const { inventory: next, arrived } = tickDeliveries(
        inventoryRef.current,
        nowSec,
        nowMs,
        (order) => {
          if (order.ackCapability) {
            transport.sendAck(order.requestId, order.ackCapability).catch((err) => {
              console.warn("Supply delivery ACK failed, will retry:", err);
              // R-3: Unmark acked on failure so it can retry when socket reconnects or on subsequent tick
              inventoryRef.current = {
                ...inventoryRef.current,
                orders: inventoryRef.current.orders.map((o) =>
                  o.requestId === order.requestId ? { ...o, acked: false } : o,
                ),
              };
              setInventory({ ...inventoryRef.current });
            });
          }
        },
      );

      // Kích hoạt âm thanh xe phanh/dừng lại trước cửa kho khi còn 1.5s
      const nextOrder = next.orders[0];
      if (
        nextOrder &&
        nowSec >= nextOrder.arriveAt - 1.5 &&
        truckStopPlayedRef.current !== (nextOrder.id as any)
      ) {
        truckStopPlayedRef.current = nextOrder.id as any;
        audio.playSfx("delivery-stop");
      }

      if (next !== inventoryRef.current) {
        inventoryRef.current = next;
        setInventory(next);
      }
      if (arrived.length > 0) {
        const first = arrived[0];
        setLastTrip({
          arriveAt: first.arriveAt,
          items: [mapSupplyToIconKey(first.supplyCode, first.category)],
        });
      }
    }, TICK_MS);

    return () => clearInterval(id);
  }, []);

  const orderSupply = (_item: SupplyId) => {
    // Theo CR-024: Đặt hàng vật tư là nghiệp vụ trên Web của Quản lý;
    // Simulator không tạo đơn local độc lập.
  };

  // Chuyến xe đang chạy (đơn chưa tới) hoặc chuyến vừa giao xong (để vẽ cảnh xe rời đi)
  const trip = inventory.orders.length
    ? {
        arriveAt: inventory.orders[0].arriveAt,
        items: [
          mapSupplyToIconKey(
            inventory.orders[0].supplyCode,
            inventory.orders[0].category,
          ),
        ],
      }
    : lastTrip;

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
    audio.playSfx("ui-click");
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

          <AudioControl />

          {simScreen && (
            <>
              <span className={c.device}>
                <span className={c.dot} /> Đang mô phỏng
              </span>
              <div className={c.speed} role="group" aria-label="Tốc độ mô phỏng">
                {SPEEDS.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className={c.speedBtn}
                    aria-pressed={speed === v}
                    aria-label={v === 0 ? "Tạm dừng" : `Tốc độ ${v} lần`}
                    onClick={() => {
                      audio.playSfx("ui-click");
                      setSpeed(v);
                    }}
                  >
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

      {/* R-3: Visible inventory error banner — console.warn alone is insufficient */}
      {inventoryError && (
        <div className={s.noticeDanger} role="alert" style={{ margin: "var(--sp-2) var(--sp-5)", display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          <span>📦 Lỗi tải kho vật tư: {inventoryError}</span>
          <button
            type="button"
            className={`${s.btn} ${s.primary}`}
            onClick={() => { setInventoryError(null); loadInventory(); }}
            style={{ marginLeft: "auto", flexShrink: 0 }}
          >
            Thử lại
          </button>
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
          onRefreshInventory={loadInventory}
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
