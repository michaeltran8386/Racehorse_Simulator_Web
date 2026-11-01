// Kiểu dữ liệu chuồng + nhân sự lấy từ BE (GET /simulator/stalls, /simulator/staff) và hàm chuyển đổi thuần.
// Không còn dữ liệu mẫu: mọi khu, ô, ngựa, groom, ca trực đều là dữ liệu thật của Web chính.

export type Role = "CLUB_MANAGER" | "HEAD_TRAINER" | "VETERINARIAN" | "GROOM";
export type StallStatus = "AVAILABLE" | "OCCUPIED" | "MAINTENANCE" | "INACTIVE";

export interface Stall {
  id: string;
  code: string;
  zoneCode: string;
  row: number; // 0-indexed cho renderer
  col: number; // 0-indexed cho renderer
  status: StallStatus;
  horseId: string | null;
  horseName: string | null;
  assignedGroomName: string | null;
  notes: string | null;
}

export interface StallZone {
  id: string;
  code: string;
  name: string;
  description: string | null;
  rows: number;
  cols: number;
  stalls: Stall[];
}

export interface StaffShift {
  name: string;
  startTime: string;
  endTime: string;
  zoneCode: string;
  zoneName: string;
}

export interface StaffMember {
  id: string;
  fullName: string;
  role: Role;
  horses: { id: string; name: string }[];
  shiftsToday: StaffShift[];
}

const STALL_STATUSES: readonly StallStatus[] = ["AVAILABLE", "OCCUPIED", "MAINTENANCE", "INACTIVE"];

interface RawStall {
  id: string;
  code: string;
  row: number | null;
  col: number | null;
  status: string;
  notes?: string | null;
  horseId?: string | null;
  horseName?: string | null;
  assignedGroomName?: string | null;
}

interface RawZone {
  id: string;
  code: string;
  name: string;
  description?: string | null;
  rows: number;
  cols: number;
  stalls: RawStall[];
}

/** BE lưu hàng/cột bắt đầu từ 1; renderer cần từ 0. Ô thiếu vị trí hoặc nằm ngoài lưới bị bỏ (không vẽ được). */
export function toStallZones(raw: readonly RawZone[]): StallZone[] {
  return raw.map((z) => {
    const rows = Math.max(1, z.rows);
    const cols = Math.max(1, z.cols);
    const stalls: Stall[] = [];
    for (const st of z.stalls) {
      if (st.row == null || st.col == null) continue;
      const row = st.row - 1;
      const col = st.col - 1;
      if (row < 0 || col < 0 || row >= rows || col >= cols) continue;
      stalls.push({
        id: st.id,
        code: st.code,
        zoneCode: z.code,
        row,
        col,
        status: STALL_STATUSES.includes(st.status as StallStatus) ? (st.status as StallStatus) : "INACTIVE",
        horseId: st.horseId ?? null,
        horseName: st.horseName ?? null,
        assignedGroomName: st.assignedGroomName ?? null,
        notes: st.notes ?? null,
      });
    }
    return { id: z.id, code: z.code, name: z.name, description: z.description ?? null, rows, cols, stalls };
  });
}
