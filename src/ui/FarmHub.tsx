import { useEffect, useMemo, useState } from "react";
import { useCountUp } from "./useCountUp";
import { FARM_INTERACTIVE_OBJECTS, type FarmTarget } from "../hub/farmLayout";
import { assignPaddockHorses, assignStableHorses } from "../hub/farmPopulation";
import { stockLevel, SUPPLY_IDS, type Inventory, type SupplyId } from "../sim/inventory";
import { SupplyPanel } from "./SupplyPanel";
import { StallTab } from "./StallTab";
import { initStalls } from "../sim/stallAllocation";
import type { MockStall } from "../sim/mockData";
import { VetZone } from "./VetZone";
import { GroomTab } from "./GroomTab";
import type { HorseProfile } from "../sim/engine";
import type { Sprites } from "../render/sprites";
import c from "./FarmHub.module.css";
import { FarmMapCanvas, type TimeOfDay } from "./FarmMapCanvas";
import { HorseCard } from "./HorseCard";
import { HorseList } from "./HorseList";
import { Popup } from "./Popup";

interface Props {
  sprites: Sprites;
  horses: HorseProfile[];
  reported: Set<string>;
  speed: number;
  speeds: number[];
  onSpeed: (speed: number) => void;
  /** Chỉ Đường đua là màn riêng; chuồng, phòng khám, kho mở bảng nổi tại chỗ. */
  onEnterTrack: () => void;
  onSelect: (id: string) => void;
  onToggleLock: (id: string) => void;
  onRandom?: () => void;
  onIncident: (horseId: string) => void;
  arriveFrom: FarmTarget | null;
  inventory: Inventory;
  onOrder: (item: SupplyId) => void;
  /** Chuyến xe giao hàng (đồng hồ performance.now, giây). */
  trip: { arriveAt: number; items: SupplyId[] } | null;
  initialVetOpen?: boolean;
  sessionId?: string | null;
  targetHorseId?: string | null;
}

const nowTod = (): TimeOfDay => {
  if (typeof window !== "undefined") {
    const p = new URLSearchParams(window.location.search).get("tod");
    if (p === "DAY" || p === "NIGHT") return p;
  }
  const h = new Date().getHours();
  return h >= 6 && h < 18 ? "DAY" : "NIGHT";
};
const clock = () => new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

export function FarmHub({ sprites, horses, reported, speed, speeds, onSpeed, onEnterTrack, onSelect, onToggleLock, onRandom, onIncident, arriveFrom, inventory, onOrder, trip, initialVetOpen, sessionId, targetHorseId }: Props) {
  const [tod, setTod] = useState<TimeOfDay>(nowTod);
  const [time, setTime] = useState(clock);
  const [hovered, setHovered] = useState<string | null>(null);
  const [goTo, setGoTo] = useState<{ id: string; seq: number } | null>(null);
  const [hint, setHint] = useState(true);
  const [supplyOpen, setSupplyOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [cardId, setCardId] = useState<string | null>(null);
  const [stalls, setStalls] = useState<MockStall[]>(() => initStalls());
  const [stallOpen, setStallOpen] = useState(false);
  const [stallSel, setStallSel] = useState<string | null>(null);
  const [vetOpen, setVetOpen] = useState(Boolean(initialVetOpen));
  const [groomOpen, setGroomOpen] = useState(false);
  const card = horses.find((h) => h.id === cardId) ?? null;
  // Ngựa bãi thả và ngựa chuồng được phân bổ ổn định danh tính
  const paddock = useMemo(() => assignPaddockHorses(horses), [horses]);
  const paddockIds = useMemo(() => new Set(paddock.flatMap((h) => (h ? [h.id] : []))), [paddock]);
  const stableHorses = useMemo(() => assignStableHorses(horses, paddockIds), [horses, paddockIds]);

  const locked = horses.filter((h) => h.medicalLock).length;
  const lowSupplies = SUPPLY_IDS.filter((id) => stockLevel(inventory, id) !== "OK").length;

  useEffect(() => {
    if (initialVetOpen) {
      setVetOpen(true);
    }
  }, [initialVetOpen]);

  useEffect(() => {
    const tick = window.setInterval(() => setTime(clock()), 15_000);
    const hide = window.setTimeout(() => setHint(false), 7000);
    return () => {
      clearInterval(tick);
      clearTimeout(hide);
    };
  }, []);

  const go = (id: string) => setGoTo((g) => ({ id, seq: (g?.seq ?? 0) + 1 }));
  const openCard = (id: string) => {
    setCardId(id);
    onSelect(id);
  };
  const nextSpeed = speeds[(speeds.indexOf(speed) + 1) % speeds.length];

  return (
    <div className={c.page}>
      <FarmMapCanvas
        sprites={sprites}
        tod={tod}
        hoveredId={hovered}
        onHover={setHovered}
        goTo={goTo}
        onEnter={(target) => {
          if (target === "TRACK") onEnterTrack();
          else if (target === "STALL") setStallOpen(true);
          else if (target === "VET") setVetOpen(true);
          else if (target === "GROOM") setGroomOpen(true);
          else setSupplyOpen(true);
        }}
        paddock={paddock}
        stableHorses={stableHorses}
        onHorse={openCard}
        arriveFrom={arriveFrom}
        trip={trip}
        simulationRunning={speed > 0}
        hasHay={inventory.stock.HAY > 0}
      />

      {/* Trên-trái: đồng hồ + ngày/đêm */}
      <div className={`${c.hud} ${c.topLeft}`}>
        <div className={c.pill}>
          <span className={c.pillLabel}>EquiFlow</span>
          <span className={c.clock}>{time}</span>
        </div>
        <button
          type="button"
          className={c.round}
          data-tone={tod === "DAY" ? "sun" : "moon"}
          aria-label={tod === "DAY" ? "Đang ban ngày, chuyển sang ban đêm" : "Đang ban đêm, chuyển sang ban ngày"}
          onClick={() => setTod((t) => (t === "DAY" ? "NIGHT" : "DAY"))}
        >
          <span aria-hidden>{tod === "DAY" ? "☀" : "☾"}</span>
        </button>
      </div>

      {/* Trên-phải: bộ đếm */}
      <dl className={`${c.hud} ${c.topRight}`}>
        <div className={c.pill}>
          <dt className={c.pillLabel}>Ngựa</dt>
          <Count value={horses.length} />
        </div>
        <div className={c.pill} data-alert={reported.size > 0}>
          <dt className={c.pillLabel}>Sự cố</dt>
          <Count value={reported.size} />
        </div>
        <div className={c.pill} data-alert={locked > 0}>
          <dt className={c.pillLabel}>Khóa y tế</dt>
          <Count value={locked} />
        </div>
        <div className={c.pill} data-alert={lowSupplies > 0}>
          <dt className={c.pillLabel}>Kho sắp hết</dt>
          <Count value={lowSupplies} />
        </div>
      </dl>

      {/* Dưới-trái: hướng dẫn, tự ẩn */}
      <p className={`${c.hud} ${c.hint}`} data-show={hint} aria-hidden={!hint}>
        Kéo để đi dạo · lăn chuột để phóng to/nhỏ · chạm vào công trình để vào
      </p>

      {/* Dưới-phải: nút tròn lớn */}
      <div className={`${c.hud} ${c.bottomRight}`}>
        <button type="button" className={c.bigRound} onClick={() => setListOpen(true)}>
          <span className={c.bigIcon} aria-hidden>
            ♞
          </span>
          <span className={c.bigLabel}>Ngựa</span>
        </button>
        <button type="button" className={c.bigRound} data-tone="supply" onClick={() => setSupplyOpen(true)}>
          <span className={c.bigIcon} aria-hidden>
            ▣
          </span>
          <span className={c.bigLabel}>Kho</span>
        </button>
        <button type="button" className={c.bigRound} onClick={() => setGroomOpen(true)} title="Nhân viên">
          <span className={c.bigIcon} aria-hidden>
            👥
          </span>
          <span className={c.bigLabel}>Nhân sự</span>
        </button>
        <button
          type="button"
          className={c.bigRound}
          data-tone={speed === 0 ? "pause" : undefined}
          aria-label={`Tốc độ mô phỏng ${speed === 0 ? "tạm dừng" : `${speed} lần`}, bấm để đổi sang ${nextSpeed === 0 ? "tạm dừng" : `${nextSpeed} lần`}`}
          onClick={() => onSpeed(nextSpeed)}
        >
          <span className={c.bigIcon} aria-hidden>
            {speed === 0 ? "II" : `${speed}×`}
          </span>
          <span className={c.bigLabel}>Tốc độ</span>
        </button>
      </div>

      {supplyOpen && <SupplyPanel inventory={inventory} onOrder={onOrder} onClose={() => setSupplyOpen(false)} />}
      {stallOpen && (
        <Popup title="Khu chuồng" onClose={() => setStallOpen(false)}>
          <StallTab
            horses={horses}
            sprites={sprites}
            speed={speed}
            selectedId={stallSel}
            onSelect={setStallSel}
            onIncident={onIncident}
            onOpenCard={openCard}
            stalls={stalls}
            onStallsChange={setStalls}
          />
        </Popup>
      )}
      {vetOpen && (
        <Popup title="Phòng khám thú y" onClose={() => setVetOpen(false)}>
          <VetZone horses={horses} sprites={sprites} reported={reported} onToggleLock={onToggleLock} onOpenCard={openCard} sessionId={sessionId} targetHorseId={targetHorseId} />
        </Popup>
      )}
      {groomOpen && (
        <Popup title="Nhân viên" onClose={() => setGroomOpen(false)}>
          <GroomTab horses={horses} onOpenHorseCard={openCard} />
        </Popup>
      )}
      {listOpen && (
        <HorseList horses={horses} sprites={sprites} reported={reported} onOpen={openCard} onRandom={onRandom || (() => {})} onClose={() => setListOpen(false)} />
      )}
      {card && (
        <HorseCard horse={card} sprites={sprites} reported={reported.has(card.id)} onToggleLock={onToggleLock} onClose={() => setCardId(null)} />
      )}

      {/* Đường tắt bàn phím: ẩn, chỉ hiện khi được focus */}
      <nav className={c.skip} aria-label="Đi tới khu vực">
        {FARM_INTERACTIVE_OBJECTS.map((o) => (
          <button key={o.id} type="button" onFocus={() => setHovered(o.id)} onBlur={() => setHovered(null)} onClick={() => go(o.id)}>
            {o.name}
          </button>
        ))}
      </nav>
    </div>
  );
}

/** Số trên HUD: chạy dần tới giá trị mới và nảy nhẹ mỗi khi đổi. */
function Count({ value }: { value: number }) {
  const shown = Math.round(useCountUp(value, 400));
  return (
    <dd key={value} className={c.count} data-bump>
      {shown}
    </dd>
  );
}
