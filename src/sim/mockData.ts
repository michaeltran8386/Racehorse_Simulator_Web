// Dữ liệu mẫu chuẩn hóa 100% theo lược đồ Prisma Backend (EquiFlow SWP391)
// KHÔNG kết nối cơ sở dữ liệu thật; phục vụ trải nghiệm mô phỏng phong phú, đầy đủ tình huống tốt nhất tới xấu nhất.

export type Role = "CLUB_MANAGER" | "HEAD_TRAINER" | "VETERINARIAN" | "GROOM" | "HORSE_OWNER";

export type UserStatus = "ACTIVE" | "PENDING_APPROVAL" | "INVITED" | "LOCKED" | "INACTIVE";

export type StallStatus = "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "INACTIVE";

export type ShiftType = "MORNING" | "AFTERNOON" | "EVENING";

export interface MockUser {
  id: string;
  code: string;
  email: string;
  fullName: string;
  phoneNumber: string;
  role: Role;
  status: UserStatus;
  avatarRow: number; // Hàng avatar trong sprite người (0: Quản lý, 1: HLV, 2: Bác sĩ, 3: Groom, 4: Chủ ngựa)
  shift?: ShiftType;
  shiftHours?: string;
  assignedZoneCode?: string;
  assignedHorses?: string[]; // Mã hoặc tên ngựa
  experienceYears?: number;
  mood?: "HAPPY" | "BUSY" | "TIRED" | "NEUTRAL";
  note?: string;
}

export interface MockStallZone {
  id: string;
  code: "ZONE-A" | "ZONE-B" | "ZONE-C";
  name: string;
  themeTitle: string;
  description: string;
  rows: number;
  cols: number;
  sortOrder: number;
}

export interface MockStall {
  id: string;
  code: string;
  zoneCode: "ZONE-A" | "ZONE-B" | "ZONE-C";
  row: number; // 0-indexed cho renderer
  col: number; // 0-indexed cho renderer
  status: StallStatus;
  horseId?: string;
  horseName?: string;
  assignedGroomName?: string;
  notes?: string;
}

export const MOCK_STALL_ZONES: readonly MockStallZone[] = [
  {
    id: "zone-a",
    code: "ZONE-A",
    name: "Zone A - Barn 1",
    themeTitle: "Khu A · Chuồng Đua Chính Thức",
    description: "Khu chuồng đạt chuẩn thi đấu quốc tế, trang bị đệm rơm cao cấp, máng ăn tự động & thảm giảm chấn.",
    rows: 2,
    cols: 4,
    sortOrder: 1,
  },
  {
    id: "zone-b",
    code: "ZONE-B",
    name: "Zone B - Barn 2",
    themeTitle: "Khu B · Chuồng Rèn Luyện & Tiềm Năng",
    description: "Khu vực nuôi dưỡng các cá thể ngựa trẻ, ngựa tiềm năng và tập huấn luyện nước đại.",
    rows: 2,
    cols: 4,
    sortOrder: 2,
  },
  {
    id: "zone-c",
    code: "ZONE-C",
    name: "Zone C - Isolation",
    themeTitle: "Khu C · Cách Ly Thú Y & Kiểm Dịch",
    description: "Khu vực kiểm dịch y tế, chăm sóc cá thể chấn thương nặng hoặc cần theo dõi sốt đặc biệt.",
    rows: 1,
    cols: 4,
    sortOrder: 3,
  },
] as const;

export const MOCK_USERS: readonly MockUser[] = [
  // 1. CLUB_MANAGER (Best case)
  {
    id: "usr-mgr-01",
    code: "MGR-001",
    email: "manager@equiflow.vn",
    fullName: "Michael Trần (Trưởng Ban Điều Hành)",
    phoneNumber: "+84 901 234 567",
    role: "CLUB_MANAGER",
    status: "ACTIVE",
    avatarRow: 0,
    shift: "MORNING",
    shiftHours: "07:30 - 17:30",
    experienceYears: 14,
    mood: "HAPPY",
    note: "Điều hành tổng thể khu phức hợp huấn luyện ngựa đua quốc tế EquiFlow.",
  },

  // 2. HEAD_TRAINER (Best case)
  {
    id: "usr-trn-01",
    code: "TRN-001",
    email: "trainer.david@equiflow.vn",
    fullName: "David Nguyễn (HLV Trưởng Quốc Gia)",
    phoneNumber: "+84 901 234 568",
    role: "HEAD_TRAINER",
    status: "ACTIVE",
    avatarRow: 1,
    shift: "MORNING",
    shiftHours: "05:00 - 14:00",
    assignedZoneCode: "ZONE-A",
    assignedHorses: ["Thunderbolt Swift", "Pegasus Dream", "Golden Eclipse", "Storm Runner"],
    experienceYears: 18,
    mood: "HAPPY",
    note: "Cựu Jockey vô địch cúp Derby Châu Á, thiết kế giáo án bứt tốc và vượt rào.",
  },

  // 3. VETERINARIAN (Best case & Special invited case)
  {
    id: "usr-vet-01",
    code: "VET-001",
    email: "sarah.connor@equiflow.vn",
    fullName: "Dr. Sarah Connor (Bác Sĩ Trưởng Thú Y)",
    phoneNumber: "+84 901 234 569",
    role: "VETERINARIAN",
    status: "ACTIVE",
    avatarRow: 2,
    shift: "MORNING",
    shiftHours: "06:00 - 15:00",
    assignedZoneCode: "ZONE-C",
    assignedHorses: ["Northern Dancer Legacy", "Midnight Mirage", "Shadowfax Wonder"],
    experienceYears: 12,
    mood: "BUSY",
    note: "Chuyên gia chỉnh hình gân cơ và kiểm dịch lâm sàng cho ngựa đua.",
  },
  {
    id: "usr-vet-02",
    code: "VET-002",
    email: "alexander.bell@equiflow.vn",
    fullName: "Dr. Alexander Bell (Chuyên Gia Ngoại Khoa Khách Mời)",
    phoneNumber: "+84 909 888 222",
    role: "VETERINARIAN",
    status: "INVITED",
    avatarRow: 2,
    shiftHours: "Hội chẩn đặc biệt",
    experienceYears: 22,
    mood: "NEUTRAL",
    note: "Thư mời đã gửi đến Hiệp hội Thú Y Quốc Tế, đang chờ xác nhận lịch phẫu thuật gân.",
  },

  // 4. GROOM (Best case, Good active, Pending approval, Worst locked)
  {
    id: "usr-grm-01",
    code: "GRM-001",
    email: "john.groom@equiflow.vn",
    fullName: "John Smith (Groom Trưởng Ca Sáng)",
    phoneNumber: "+84 901 234 570",
    role: "GROOM",
    status: "ACTIVE",
    avatarRow: 3,
    shift: "MORNING",
    shiftHours: "05:00 - 13:00",
    assignedZoneCode: "ZONE-A",
    assignedHorses: ["Thunderbolt Swift", "Northern Dancer Legacy", "Pegasus Dream", "Storm Runner"],
    experienceYears: 9,
    mood: "HAPPY",
    note: "Chăm sóc vệ sinh, chải bờm, kiểm tra móng và cấp thức ăn cho ngựa Zone A.",
  },
  {
    id: "usr-grm-02",
    code: "GRM-002",
    email: "phuc.le@equiflow.vn",
    fullName: "Lê Văn Phúc (Groom Ca Chiều & Y Tế)",
    phoneNumber: "+84 901 234 572",
    role: "GROOM",
    status: "ACTIVE",
    avatarRow: 3,
    shift: "AFTERNOON",
    shiftHours: "13:00 - 21:00",
    assignedZoneCode: "ZONE-B",
    assignedHorses: ["Shadowfax Wonder", "Golden Eclipse", "Midnight Mirage", "Red Velvet"],
    experienceYears: 6,
    mood: "BUSY",
    note: "Phụ trách đệm lót rơm, đắp đá lạnh chân cho ngựa hồi phục và trực khu cách ly.",
  },
  {
    id: "usr-grm-03",
    code: "GRM-003",
    email: "nam.tran@equiflow.vn",
    fullName: "Trần Văn Nam (Groom Tập Sự)",
    phoneNumber: "+84 909 888 111",
    role: "GROOM",
    status: "PENDING_APPROVAL",
    avatarRow: 3,
    shiftHours: "Chờ phê duyệt",
    experienceYears: 1,
    mood: "NEUTRAL",
    note: "Hồ sơ tuyển dụng đang chờ Club Manager phê duyệt trước khi phân công ca trực.",
  },
  {
    id: "usr-grm-04",
    code: "GRM-004",
    email: "kiet.dang@equiflow.vn",
    fullName: "Đặng Tuấn Kiệt (Tài Khoản Tạm Khóa)",
    phoneNumber: "+84 909 888 333",
    role: "GROOM",
    status: "LOCKED",
    avatarRow: 3,
    shiftHours: "Đình chỉ công tác",
    experienceYears: 3,
    mood: "TIRED",
    note: "Tài khoản bị khóa do vi phạm quy định an toàn chuồng trại (bỏ quên cổng phụ mở ban đêm).",
  },

  // 5. HORSE_OWNER (VIP Best case & Partner case)
  {
    id: "usr-own-01",
    code: "OWN-001",
    email: "robert.sterling@invest.vn",
    fullName: "Robert Sterling (Chủ Sở Hữu VIP Gold)",
    phoneNumber: "+84 901 234 571",
    role: "HORSE_OWNER",
    status: "ACTIVE",
    avatarRow: 4,
    assignedHorses: ["Thunderbolt Swift", "Pegasus Dream", "Golden Eclipse", "Silver Comet"],
    mood: "HAPPY",
    note: "Chủ đầu tư chuỗi trang trại đối tác, sở hữu chiến mã vô địch cúp Derby.",
  },
  {
    id: "usr-own-02",
    code: "OWN-002",
    email: "long.duc@saigonhorse.vn",
    fullName: "Phan Đức Long (Chủ Trại Ngựa Hoàng Gia)",
    phoneNumber: "+84 901 234 573",
    role: "HORSE_OWNER",
    status: "ACTIVE",
    avatarRow: 4,
    assignedHorses: ["Northern Dancer Legacy", "Shadowfax Wonder", "Storm Runner", "Red Velvet"],
    mood: "BUSY",
    note: "Đối tác chiến lược gửi đào tạo các dòng ngựa Thuần chủng và Arabian.",
  },
] as const;

export const MOCK_STALLS: readonly MockStall[] = [
  // ZONE A: 2 hàng × 4 cột = 8 ô chuồng
  { id: "stl-a01", code: "A-01", zoneCode: "ZONE-A", row: 0, col: 0, status: "OCCUPIED", horseId: "h-01", horseName: "Bạch Long Mã", assignedGroomName: "Lê Văn Bình", notes: "Ngựa phong độ cao, chuẩn bị xuất trận" },
  { id: "stl-a02", code: "A-02", zoneCode: "ZONE-A", row: 0, col: 1, status: "OCCUPIED", horseId: "h-02", horseName: "Xích Thố", assignedGroomName: "Lê Văn Bình", notes: "Chấn thương gân cổ chân - có khóa y tế" },
  { id: "stl-a03", code: "A-03", zoneCode: "ZONE-A", row: 0, col: 2, status: "OCCUPIED", horseId: "h-04", horseName: "Hắc Báo", assignedGroomName: "Lê Văn Bình", notes: "Thể lực tốt, nhịp tim nghỉ 42 bpm" },
  { id: "stl-a04", code: "A-04", zoneCode: "ZONE-A", row: 0, col: 3, status: "OCCUPIED", horseId: "h-05", horseName: "Thần Phong", assignedGroomName: "Hoàng Văn Phúc", notes: "Đang rèn luyện nước đại" },
  { id: "stl-a05", code: "A-05", zoneCode: "ZONE-A", row: 1, col: 0, status: "AVAILABLE", notes: "Ô chuồng sẵn sàng đón cá thể mới, rơm sạch" },
  { id: "stl-a06", code: "A-06", zoneCode: "ZONE-A", row: 1, col: 1, status: "AVAILABLE", notes: "Ô chuồng sẵn sàng đón cá thể mới, rơm sạch" },
  { id: "stl-a07", code: "A-07", zoneCode: "ZONE-A", row: 1, col: 2, status: "AVAILABLE", notes: "Ô chuồng sẵn sàng đón cá thể mới, rơm sạch" },
  { id: "stl-a08", code: "A-08", zoneCode: "ZONE-A", row: 1, col: 3, status: "AVAILABLE", notes: "Ô chuồng sẵn sàng đón cá thể mới, rơm sạch" },

  // ZONE B: 2 hàng × 4 cột = 8 ô chuồng (B-08 đang bảo trì)
  { id: "stl-b01", code: "B-01", zoneCode: "ZONE-B", row: 0, col: 0, status: "OCCUPIED", horseId: "h-03", horseName: "Shadowfax Wonder", assignedGroomName: "Lê Văn Phúc", notes: "Theo dõi nhịp thở sau bài tập nặng" },
  { id: "stl-b02", code: "B-02", zoneCode: "ZONE-B", row: 0, col: 1, status: "OCCUPIED", horseId: "h-06", horseName: "Storm Runner", assignedGroomName: "John Smith", notes: "Tập làm quen với rào chắn" },
  { id: "stl-b03", code: "B-03", zoneCode: "ZONE-B", row: 0, col: 2, status: "OCCUPIED", horseId: "h-08", horseName: "Red Velvet", assignedGroomName: "Lê Văn Phúc", notes: "Nghỉ ngơi định kỳ sau chặng dài" },
  { id: "stl-b04", code: "B-04", zoneCode: "ZONE-B", row: 0, col: 3, status: "AVAILABLE", notes: "Ô chuồng trống đã khử trùng" },
  { id: "stl-b05", code: "B-05", zoneCode: "ZONE-B", row: 1, col: 0, status: "AVAILABLE", notes: "Ô chuồng trống sẵn sàng" },
  { id: "stl-b06", code: "B-06", zoneCode: "ZONE-B", row: 1, col: 1, status: "AVAILABLE", notes: "Ô chuồng trống sẵn sàng" },
  { id: "stl-b07", code: "B-07", zoneCode: "ZONE-B", row: 1, col: 2, status: "AVAILABLE", notes: "Ô chuồng trống sẵn sàng" },
  { id: "stl-b08", code: "B-08", zoneCode: "ZONE-B", row: 1, col: 3, status: "MAINTENANCE", notes: "Bảo trì thay đệm lót và van cấp nước tự động" },

  // ZONE C: 1 hàng × 4 cột = 4 ô chuồng (C-01 cách ly sốt, C-04 ngừng dùng)
  { id: "stl-c01", code: "C-01", zoneCode: "ZONE-C", row: 0, col: 0, status: "OCCUPIED", horseId: "h-07", horseName: "Midnight Mirage", assignedGroomName: "Lê Văn Phúc", notes: "Cách ly thú y: Sốt phát ban nhẹ, khóa y tế RULE-MED-01" },
  { id: "stl-c02", code: "C-02", zoneCode: "ZONE-C", row: 0, col: 1, status: "AVAILABLE", notes: "Ô đệm rơm y tế sạch dự phòng" },
  { id: "stl-c03", code: "C-03", zoneCode: "ZONE-C", row: 0, col: 2, status: "AVAILABLE", notes: "Ô đệm rơm y tế sạch dự phòng" },
  { id: "stl-c04", code: "C-04", zoneCode: "ZONE-C", row: 0, col: 3, status: "INACTIVE", notes: "Ô ngừng dùng: đang nâng cấp hệ thống lọc áp lực âm" },
] as const;

export function getStallsByZone(zoneCode: "ZONE-A" | "ZONE-B" | "ZONE-C"): MockStall[] {
  return MOCK_STALLS.filter((s) => s.zoneCode === zoneCode);
}
