// Khóa điều khiển Simulator: khách mặc định chỉ xem, nhập PIN mới hiện nút thao tác.
// shortcut: PIN nằm trong bundle JS (ai đọc mã nguồn cũng thấy), chỉ chặn bấm nhầm; cần chặn thật thì BE phải kiểm quyền.
export const ADMIN_PIN = "2204";
export const ADMIN_STORAGE_KEY = "sim_admin";

export const isAdminPin = (input: string): boolean => input.trim() === ADMIN_PIN;

/** Link do Web chính mở (có sessionId) đã qua đăng nhập Web nên được điều khiển ngay. */
export function initialUnlocked(storage: Pick<Storage, "getItem"> | null, sessionId: string | null): boolean {
  if (sessionId) return true;
  try {
    return storage?.getItem(ADMIN_STORAGE_KEY) === "true";
  } catch {
    return false; // trình duyệt chặn localStorage: coi như khách
  }
}
