// Dữ liệu ngựa mẫu cho giai đoạn làm giao diện. Khi nối BE, danh sách này sẽ lấy từ API trung tâm (SIM-01).
import { nextRandom, type Coat, type HorseProfile, type Lifecycle, type StallHealth, type Strategy } from "./engine.ts";

export const COAT_LABEL: Record<Coat, string> = {
  BAY: "Hạt dẻ (Bay)",
  CHESTNUT: "Hồng mã (Chestnut)",
  BLACK: "Hắc mã (Black)",
  GRAY: "Bạch mã (Gray)",
  ROAN: "Xám muối tiêu (Roan)",
};

export const LIFECYCLE_LABEL: Record<Lifecycle, string> = {
  SAN_SANG_THI_DAU: "Sẵn sàng thi đấu",
  DANG_TAP_LUYEN: "Đang tập luyện",
  CAN_THEO_DOI: "Cần theo dõi",
  CHAN_THUONG: "Chấn thương",
  CACH_LY: "Cách ly",
  NGHI_NGOI: "Nghỉ ngơi",
};

export const HEALTH_LABEL: Record<StallHealth, string> = {
  FIT: "Đủ điều kiện",
  WATCH: "Cần theo dõi",
  INJURED: "Chấn thương",
  ISOLATED: "Cách ly",
};

export const STRATEGY_LABEL: Record<Strategy, string> = {
  FRONT: "Dẫn đầu",
  STALKER: "Bám đuổi",
  CLOSER: "Nước rút",
};

type Seed = [string, Coat, HorseProfile["gender"], number, number, Lifecycle, StallHealth, boolean, Strategy];

// [tên, màu lông, giới tính, tuổi, cân nặng, vòng đời, sức khỏe chuồng, medical lock, chiến thuật]
const SEEDS: Seed[] = [
  ["Bạch Long Mã", "BAY", "STALLION", 4, 485, "SAN_SANG_THI_DAU", "FIT", false, "STALKER"],
  ["Crimson Comet", "CHESTNUT", "MARE", 5, 462, "DANG_TAP_LUYEN", "FIT", false, "FRONT"],
  ["Midnight Echo", "BLACK", "GELDING", 6, 501, "SAN_SANG_THI_DAU", "FIT", false, "CLOSER"],
  ["Silver Mistral", "GRAY", "MARE", 4, 455, "CAN_THEO_DOI", "WATCH", false, "STALKER"],
  ["Xích Thố", "ROAN", "STALLION", 7, 512, "CHAN_THUONG", "INJURED", true, "CLOSER"],
  ["Golden Meridian", "CHESTNUT", "GELDING", 5, 478, "DANG_TAP_LUYEN", "FIT", false, "FRONT"],
  ["Night Sonata", "BLACK", "MARE", 3, 449, "SAN_SANG_THI_DAU", "FIT", false, "STALKER"],
  ["Saigon Spirit", "BAY", "STALLION", 5, 495, "SAN_SANG_THI_DAU", "FIT", false, "CLOSER"],
  ["Pearl Harbour", "GRAY", "GELDING", 8, 520, "CACH_LY", "ISOLATED", false, "FRONT"],
  ["Lotus Runner", "ROAN", "MARE", 4, 458, "NGHI_NGOI", "FIT", false, "STALKER"],
];

const NAMES_A = ["Royal", "Storm", "Velvet", "Iron", "Lucky", "Desert", "Ocean", "Scarlet", "Jade", "Mekong"];
const NAMES_B = ["Dancer", "Arrow", "Legend", "Flame", "Breeze", "Crown", "Spirit", "Charger", "Echo", "Star"];
const COATS: Coat[] = ["BAY", "CHESTNUT", "BLACK", "GRAY", "ROAN"];
const STRATEGIES: Strategy[] = ["FRONT", "STALKER", "CLOSER"];

function profileFrom(i: number, seed: Seed, rng: { rng: number }): HorseProfile {
  const [name, coat, gender, ageYears, weightKg, lifecycle, health, medicalLock, strategy] = seed;
  const r = () => nextRandom(rng);
  const hrMax = Math.round(218 + r() * 14);
  return {
    id: `HRS-${String(i + 1).padStart(3, "0")}`,
    code: `HR-${String(i + 1).padStart(6, "0")}`,
    name,
    breed: "Thoroughbred",
    coat,
    gender,
    ageYears,
    weightKg,
    // ISO 11784/11785: 15 chữ số, 3 số đầu là mã quốc gia/nhà sản xuất.
    microchip: `985141${String(Math.floor(r() * 1e9)).padStart(9, "0")}`,
    lifecycle,
    health,
    medicalLock,
    stall: { col: i % 6, row: Math.floor(i / 6) },
    topSpeedMps: Math.round((16.8 + r() * 1.4) * 100) / 100,
    hrRest: Math.round(33 + r() * 9),
    hrMax,
    hrAlert: hrMax - 10,
    fitness: Math.round((0.9 + r() * 0.2) * 100) / 100,
    strategy,
  };
}

export function seedHorses(): HorseProfile[] {
  const rng = { rng: 20261018 };
  return SEEDS.map((s, i) => profileFrom(i, s, rng));
}

/** Nút "Sinh ngựa mới": đặt vào ô chuồng trống đầu tiên trên lưới 6×6. */
export function randomHorse(existing: HorseProfile[]): HorseProfile | null {
  const taken = new Set(existing.map((h) => `${h.stall.col},${h.stall.row}`));
  let free: { col: number; row: number } | null = null;
  for (let row = 0; row < 6 && !free; row++)
    for (let col = 0; col < 6 && !free; col++) if (!taken.has(`${col},${row}`)) free = { col, row };
  if (!free) return null;

  const rng = { rng: (Date.now() ^ (existing.length * 2654435761)) | 0 };
  const pick = <T,>(arr: T[]) => arr[Math.floor(nextRandom(rng) * arr.length)];
  const seed: Seed = [
    `${pick(NAMES_A)} ${pick(NAMES_B)}`,
    pick(COATS),
    pick(["STALLION", "MARE", "GELDING"] as const),
    3 + Math.floor(nextRandom(rng) * 6),
    440 + Math.floor(nextRandom(rng) * 90),
    "DANG_TAP_LUYEN",
    "FIT",
    false,
    pick(STRATEGIES),
  ];
  const nextIndex = existing.reduce((m, h) => Math.max(m, Number(h.id.slice(4))), 0);
  return { ...profileFrom(nextIndex, seed, rng), stall: free };
}

/** Ngựa không được xuất phát bài nặng/đua: Medical Lock, chấn thương, cách ly (RULE-MED-01). */
export function blockReason(h: HorseProfile): string | null {
  if (h.medicalLock) return "Đang bị Medical Lock";
  if (h.lifecycle === "CHAN_THUONG") return "Đang chấn thương";
  if (h.lifecycle === "CACH_LY") return "Đang cách ly";
  return null;
}
