// Sơ đồ khu chuồng thật lấy từ BE (GET /simulator/stalls), chỉ đọc (SRS SC-1.07 & RULE-MED-01).
// Phân/rút chuồng là nghiệp vụ của Web chính (cần quyền Club Manager / Head Trainer), Simulator không tự đổi.
import { useCallback, useEffect, useRef, useState } from "react";
import { publish } from "../sim/bus";
import { stepRest, type HorseProfile } from "../sim/engine";
import { LIFECYCLE_LABEL } from "../sim/horses";
import { INCIDENT_LABEL, incidentPacket, horseRef } from "../sim/packets";
import { drawZoneStalls, HEALTH_COLOR, stallActivity } from "../render/scenes";
import type { Sprites } from "../render/sprites";
import type { StallZone } from "../sim/stallMap";
import { fetchStallZones } from "../api/farmDataApi";
import { PixelCanvas } from "./PixelCanvas";
import { Popup } from "./Popup";
import s from "./ui.module.css";
import t from "./Tabs.module.css";

type Vitals = { hr: number; stamina: number; tempC: number; rng: number };
const SNAPSHOT_EVERY_S = 10;

interface Props {
  horses: HorseProfile[];
  sprites: Sprites;
  speed: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onIncident: (horseId: string) => void;
  onOpenCard: (horseId: string) => void;
}

const ACTIVITY_LABEL = { IDLE: "Đứng thở", GRAZE: "Ăn cỏ / ngũ cốc", LIE: "Nằm nghỉ" } as const;

export function StallTab({ horses, sprites, speed, selectedId, onSelect, onIncident, onOpenCard }: Props) {
  const [zones, setZones] = useState<StallZone[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const vitals = useRef(new Map<string, Vitals>());
  const loop = useRef({ simT: 0, realT: 0, snapAcc: 0, uiAcc: 0 });
  const [, force] = useState(0);

  const [activeZoneCode, setActiveZoneCode] = useState<string | null>(null);
  const [selectedStallCode, setSelectedStallCode] = useState<string | null>(null);
  // Chạm ô chuồng mở chi tiết thành bảng nổi đè lên sơ đồ, không đẩy sơ đồ lên.
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await fetchStallZones();
      setZones(data);
      setActiveZoneCode((cur) => cur ?? data[0]?.code ?? null);
    } catch (err) {
      setLoadError((err as Error).message || "Không kết nối được máy chủ.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const horsesRef = useRef(horses);
  horsesRef.current = horses;

  for (const h of horses) {
    if (!vitals.current.has(h.id)) {
      vitals.current.set(h.id, { hr: h.hrRest + 4, stamina: 72 + (h.weightKg % 25), tempC: 37.9, rng: h.weightKg * 977 });
    }
  }

  const currentZone = zones?.find((z) => z.code === activeZoneCode) ?? zones?.[0] ?? null;
  const zoneStalls = currentZone?.stalls ?? [];

  const onFrame = (ctx: CanvasRenderingContext2D, w: number, h: number, dtReal: number) => {
    const L = loop.current;
    L.realT += dtReal;
    const simDt = dtReal * speed;
    L.simT += simDt;
    for (const hz of horsesRef.current) {
      const v = vitals.current.get(hz.id);
      if (v && simDt > 0) stepRest(v, hz, simDt);
    }
    L.snapAcc += simDt;
    if (L.snapAcc >= SNAPSHOT_EVERY_S) {
      L.snapAcc = 0;
      publish("sim:telemetry_tick", "OUT", {
        event: "sim:telemetry_tick",
        mode: "STALL_REST",
        timestamp_ms: Date.now(),
        sim_speed_multiplier: speed,
        stall_vitals: horsesRef.current.map((hz) => {
          const v = vitals.current.get(hz.id);
          return {
            ...horseRef(hz),
            stall: hz.stall,
            heart_rate_bpm: v ? Math.round(v.hr) : null,
            stamina_pct: v ? Math.round(v.stamina * 10) / 10 : null,
            body_temp_c: v ? Math.round(v.tempC * 10) / 10 : null,
            stamina_recovery_pct_per_min: 2,
          };
        }),
      });
    }
    L.uiAcc += dtReal;
    if (L.uiAcc > 0.5) {
      L.uiAcc = 0;
      force((n) => n + 1);
    }

    if (currentZone) drawZoneStalls(ctx, w, h, sprites, currentZone, zoneStalls, horsesRef.current, vitals.current, selectedStallCode, L.realT);
  };

  if (loadError) {
    return (
      <div className={t.stack}>
        <p className={s.hint}>Không tải được sơ đồ chuồng: {loadError}</p>
        <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => void load()}>
          Thử lại
        </button>
      </div>
    );
  }
  if (!zones) return <p className={s.hint}>Đang tải sơ đồ chuồng…</p>;
  if (!currentZone) return <p className={s.hint}>Chưa có khu chuồng nào đang hoạt động trên Web chính.</p>;

  // Ô chuồng được chọn và ngựa trong ô (nếu có)
  const currentStall = zoneStalls.find((st) => st.code === selectedStallCode) ?? null;
  const selectedHorse =
    (currentStall?.horseId ? horses.find((h) => h.id === currentStall.horseId) : null) ?? (selectedId ? horses.find((h) => h.id === selectedId) ?? null : null);
  const sv = selectedHorse ? vitals.current.get(selectedHorse.id) : undefined;

  function report(kind: "COLIC" | "FEVER") {
    if (!selectedHorse) return;
    publish("sim:incident_report", "OUT", incidentPacket(null, selectedHorse, kind, "STALL"));
    onIncident(selectedHorse.id);
  }

  function handleSelectZone(zone: StallZone) {
    setActiveZoneCode(zone.code);
    setSelectedStallCode(null);
  }

  // Thống kê nhanh từng khu
  const occupiedCount = zoneStalls.filter((st) => st.status === "OCCUPIED").length;
  const availableCount = zoneStalls.filter((st) => st.status === "AVAILABLE").length;
  const maintenanceCount = zoneStalls.filter((st) => st.status === "MAINTENANCE").length;
  const inactiveCount = zoneStalls.filter((st) => st.status === "INACTIVE").length;

  return (
    <div className={t.stack}>
      {/* 1. Thanh chuyển khu chuồng (theo dữ liệu thật) */}
      <div className={t.pillGroup} style={{ flexWrap: "wrap", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
          {zones.map((z) => (
            <button
              key={z.code}
              type="button"
              className={`${s.btn} ${z.code === currentZone.code ? s.primary : ""}`}
              style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-sm)", padding: "4px 12px" }}
              aria-pressed={z.code === currentZone.code}
              onClick={() => handleSelectZone(z)}
            >
              {z.name} ({z.stalls.length})
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: "8px", fontSize: "var(--fs-sm)", alignItems: "center" }}>
          <span>Ở: <strong>{occupiedCount}</strong></span> ·
          <span>Trống: <strong>{availableCount}</strong></span>
          {maintenanceCount > 0 && <span> · <strong style={{ color: "#d97706" }}>Bảo trì: {maintenanceCount}</strong></span>}
          {inactiveCount > 0 && <span> · <strong style={{ color: "#78909c" }}>Ngừng: {inactiveCount}</strong></span>}
        </div>
      </div>

      {/* 2. Lưới ô chuồng Canvas 2D */}
      <section className={s.card} style={{ padding: "8px" }}>
        <div className={s.sceneFrame}>
          <PixelCanvas
            aspect={Math.max(0.3, (currentZone.rows / currentZone.cols) * 1.08)}
            onFrame={onFrame}
            label={`Sơ đồ ${currentZone.name} gồm ${currentZone.rows} hàng nhân ${currentZone.cols} cột`}
            onPointer={(x, y, w, h) => {
              const col = Math.floor((x / w) * currentZone.cols);
              const row = Math.floor((y / h) * currentZone.rows);
              const hit = zoneStalls.find((st) => st.col === col && st.row === row);
              if (hit) {
                setSelectedStallCode(hit.code);
                if (hit.horseId) onSelect(hit.horseId);
                setDetailOpen(true);
              }
            }}
          />
        </div>
      </section>

      {!detailOpen && <p className={s.hint}>Chạm vào một ô chuồng để xem chi tiết.</p>}

      {/* 3. Chi tiết ô chuồng được chọn: bảng nổi đè lên sơ đồ */}
      {detailOpen && currentStall && (
        <Popup title={`Ô chuồng ${currentStall.code}`} onClose={() => setDetailOpen(false)}>
        <section className={s.card} style={{ padding: "12px" }}>
          <div className={s.cardHead} style={{ paddingBottom: "8px" }}>
            <h3 className={s.cardTitle} style={{ margin: 0, fontSize: "var(--fs-md)" }}>
              Ô Chuồng <span style={{ color: "#ffe082" }}>{currentStall.code}</span> ·{" "}
              {currentStall.status === "MAINTENANCE" ? (
                <span style={{ color: "#ffa726" }}>Đang Bảo Trì</span>
              ) : currentStall.status === "INACTIVE" ? (
                <span style={{ color: "#b0bec5" }}>Ngừng Sử Dụng</span>
              ) : currentStall.horseName ? (
                <span className={t.horseName}>{currentStall.horseName}</span>
              ) : (
                <span style={{ color: "#81c784" }}>Ô Chuồng Trống</span>
              )}
            </h3>

            {selectedHorse && currentStall.horseId === selectedHorse.id && (
              <span className={t.stallInfo}>
                <span className={s.badge} style={{ color: HEALTH_COLOR[selectedHorse.health] }}>
                  {LIFECYCLE_LABEL[selectedHorse.lifecycle]}
                </span>
                <span className={s.hint}>{ACTIVITY_LABEL[stallActivity(selectedHorse, loop.current.realT)]}</span>
              </span>
            )}
          </div>

          <div style={{ marginTop: "8px" }}>
            {currentStall.horseId && selectedHorse && sv && currentStall.horseId === selectedHorse.id ? (
              <>
                <div style={{ marginBottom: "8px", display: "flex", gap: "12px", flexWrap: "wrap", fontSize: "var(--fs-sm)" }}>
                  <span>Groom: <strong>{currentStall.assignedGroomName ?? "Chưa phân công"}</strong></span>
                  {selectedHorse.medicalLock && (
                    <span style={{ color: "#ff5252", fontWeight: 700 }}>
                      Đang khóa y tế: không chạy bài nặng.
                    </span>
                  )}
                </div>

                <div className={t.vitals}>
                  <div className={s.metric}>
                    <div className={s.metricLabel}>Nhịp tim nghỉ</div>
                    <div className={s.metricValue}>
                      {Math.round(sv.hr)}
                      <span className={s.metricUnit}>bpm</span>
                    </div>
                  </div>
                  <div className={s.metric}>
                    <div className={s.metricLabel}>Thể lực</div>
                    <div className={s.metricValue}>
                      {sv.stamina.toFixed(1)}
                      <span className={s.metricUnit}>%</span>
                    </div>
                  </div>
                  <div className={s.metric}>
                    <div className={s.metricLabel}>Thân nhiệt</div>
                    <div className={s.metricValue}>
                      {sv.tempC.toFixed(1)}
                      <span className={s.metricUnit}>°C</span>
                    </div>
                  </div>
                </div>

                <div className={t.incidentBar} style={{ padding: "8px 0 0", marginTop: "10px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button type="button" className={`${s.btn} ${s.primary}`} onClick={() => onOpenCard(selectedHorse.id)}>
                    Xem thẻ ngựa
                  </button>
                  <button type="button" className={s.danger} data-control onClick={() => report("COLIC")}>
                    {INCIDENT_LABEL.COLIC}
                  </button>
                  <button type="button" className={s.btn} data-control onClick={() => report("FEVER")}>
                    {INCIDENT_LABEL.FEVER}
                  </button>
                </div>
              </>
            ) : currentStall.horseId ? (
              // Ngựa có trong chuồng nhưng không nằm trong danh sách ngựa của phiên mô phỏng này
              <div style={{ padding: "6px 0", fontSize: "var(--fs-sm)" }}>
                Groom: <strong>{currentStall.assignedGroomName ?? "Chưa phân công"}</strong>
              </div>
            ) : currentStall.status === "AVAILABLE" ? (
              <div style={{ padding: "6px 0", color: "var(--muted)", fontSize: "var(--fs-sm)" }}>
                Ô chuồng trống. Việc xếp ngựa vào chuồng làm trên Web chính.
              </div>
            ) : (
              <div style={{ padding: "6px 0", color: "#78909c", fontSize: "var(--fs-sm)" }}>
                {currentStall.notes ?? (currentStall.status === "MAINTENANCE" ? "Đang bảo trì." : "Ngừng sử dụng.")}
              </div>
            )}
          </div>
        </section>
        </Popup>
      )}
    </div>
  );
}
