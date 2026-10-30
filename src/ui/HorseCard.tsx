// Thẻ ngựa (trọng tâm của Simulator): chân dung đúng màu lông + chỉ số dạng thanh/đồng hồ, không chữ kỹ thuật.
import { drawFrame, ROW, tinted, type Sprites } from "../render/sprites";
import { useLog } from "../sim/bus";
import { formatMicrochip, type HorseProfile, type StallHealth } from "../sim/engine";
import { COAT_LABEL, HEALTH_LABEL, LIFECYCLE_LABEL, STRATEGY_LABEL } from "../sim/horses";
import { heartHint, heartZones } from "./heartZones";
import c from "./HorseCard.module.css";
import { PixelCanvas } from "./PixelCanvas";
import { Popup } from "./Popup";
import s from "./ui.module.css";

const GENDER_LABEL = { STALLION: "Ngựa đực giống", MARE: "Ngựa cái", GELDING: "Ngựa thiến" } as const;
const HEALTH_LEVEL: Record<StallHealth, number> = { FIT: 100, WATCH: 60, INJURED: 25, ISOLATED: 40 };
const TOP_SPEED_SCALE_KMH = 72; // ngựa thuần chủng nhanh nhất ~70 km/h

interface Props {
  horse: HorseProfile;
  sprites: Sprites;
  reported: boolean;
  onToggleLock?: (id: string) => void;
  onClose: () => void;
}

interface IncidentPayload {
  horse?: { horse_id?: string };
  incident?: { label?: string; location?: string };
}

export function HorseCard({ horse: h, sprites, reported, onClose }: Props) {
  const incidents = useLog().filter((e) => e.event === "sim:incident_report" && (e.payload as IncidentPayload).horse?.horse_id === h.id);
  const kmh = h.topSpeedMps * 3.6;
  const fitnessPct = Math.round(((h.fitness - 0.85) / 0.3) * 100);
  const zones = heartZones(h);

  return (
    <Popup title={h.name} onClose={onClose}>
      <div className={c.card}>
        <div className={c.portrait}>
          <PixelCanvas
            aspect={0.8}
            label={`Hình ngựa ${h.name}, màu ${COAT_LABEL[h.coat]}`}
            onFrame={(ctx, w, hh) => {
              const now = performance.now() / 1000;
              ctx.clearRect(0, 0, w, hh);
              drawFrame(ctx, sprites.horse, tinted(sprites.horse, h.coat), Math.floor(now * 4) % 6, ROW.IDLE, w / 2, hh * 0.95, hh * 0.9);
            }}
          />
          <div className={c.badges}>
            <span className={s[h.health]}>{HEALTH_LABEL[h.health]}</span>
            {h.medicalLock && <span className={s.lock}>Khóa y tế</span>}
            {reported && <span className={s.WATCH}>Đã báo sự cố</span>}
          </div>
        </div>

        <div className={c.stats}>
          <Meter label="Sức khỏe" value={HEALTH_LEVEL[h.health]} text={HEALTH_LABEL[h.health]} tone={h.health === "FIT" ? "good" : h.health === "WATCH" ? "warn" : "bad"} />
          <Meter label="Thể trạng" value={fitnessPct} text={fitnessPct >= 66 ? "Rất tốt" : fitnessPct >= 33 ? "Tốt" : "Kém"} tone={fitnessPct >= 33 ? "good" : "warn"} />
          <Meter label="Tốc độ tối đa" value={(kmh / TOP_SPEED_SCALE_KMH) * 100} text={`${kmh.toFixed(0)} km/h`} tone="info" />

          <div className={c.heart}>
            <span className={c.meterLabel}>Nhịp tim (nhịp/phút)</span>
            <div
              className={c.heartBar}
              role="img"
              aria-label={`Nhịp tim: nghỉ dưới ${h.hrRest}, vận động ${h.hrRest} đến ${h.hrAlert}, quá sức trên ${h.hrAlert} nhịp mỗi phút`}
            >
              {zones.map((z) => (
                <span key={z.key} data-zone={z.key} style={{ width: `${z.widthPct}%` }} />
              ))}
            </div>
            <ul className={c.heartLegend}>
              {zones.map((z) => (
                <li key={z.key}>
                  <span className={c.swatch} data-zone={z.key} aria-hidden />
                  {z.label} {z.rangeText}
                </li>
              ))}
            </ul>
            <p className={s.hint}>{heartHint(h)}</p>
          </div>

          <dl className={c.facts}>
            <div>
              <dt>Giống</dt>
              <dd>{h.breed}</dd>
            </div>
            <div>
              <dt>Giới tính</dt>
              <dd>{GENDER_LABEL[h.gender]}</dd>
            </div>
            <div>
              <dt>Tuổi</dt>
              <dd>{h.ageYears}</dd>
            </div>
            <div>
              <dt>Cân nặng</dt>
              <dd>{h.weightKg ? `${h.weightKg} kg` : "Chưa có dữ liệu"}</dd>
            </div>
            <div>
              <dt>Màu lông</dt>
              <dd>{COAT_LABEL[h.coat]}</dd>
            </div>
            <div>
              <dt>Ô chuồng</dt>
              <dd>
                {(h as any).stallCode || `${String.fromCharCode(65 + h.stall.row)}${h.stall.col + 1}`}
              </dd>
            </div>
            <div>
              <dt>Tình trạng</dt>
              <dd>{LIFECYCLE_LABEL[h.lifecycle]}</dd>
            </div>
            <div>
              <dt>Lối đua</dt>
              <dd>{STRATEGY_LABEL[h.strategy]}</dd>
            </div>
            <div className={c.wide}>
              <dt>Mã chip</dt>
              <dd>{h.microchip ? (h.microchip.includes('*') ? h.microchip : formatMicrochip(h.microchip)) : 'Chưa gắn chip'}</dd>
            </div>
          </dl>
        </div>
      </div>

      <section className={c.section}>
        <h3 className={c.sectionTitle}>Sự cố</h3>
        {incidents.length === 0 ? (
          <p className={s.hint}>Chưa có sự cố nào.</p>
        ) : (
          <ul className={c.incidents}>
            {incidents.slice(0, 5).map((e) => {
              const p = e.payload as IncidentPayload;
              return (
                <li key={e.id}>
                  <span className={c.incidentIcon} aria-hidden>
                    !
                  </span>
                  {p.incident?.label} · {p.incident?.location === "TRACK" ? "Đường đua" : "Khu chuồng"} ·{" "}
                  {new Date(e.at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={`${c.section} ${c.lockRow}`} data-locked={h.medicalLock}>
        <div>
          <h3 className={c.sectionTitle}>{h.medicalLock ? "Đang khóa y tế" : "Không khóa y tế"}</h3>
          <p className={s.hint}>
            Khóa y tế được đồng bộ tự động theo thời gian thực từ Bác sĩ thú y trên Main Web.
          </p>
        </div>
      </section>
    </Popup>
  );
}

function Meter({ label, value, text, tone }: { label: string; value: number; text: string; tone: "good" | "warn" | "bad" | "info" }) {
  const pct = Math.max(4, Math.min(100, Math.round(value)));
  return (
    <div className={c.meter}>
      <span className={c.meterLabel}>{label}</span>
      <div className={c.track} role="meter" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-valuetext={text}>
        <span className={c.fill} data-tone={tone} style={{ width: `${pct}%` }} />
      </div>
      <span className={c.meterText}>{text}</span>
    </div>
  );
}
