// Chế độ chỉ xem cho khách; nút ổ khóa ở đầu trang mở hộp nhập PIN để hiện nút điều khiển.
// Phần tử có [data-control] bị ẩn khi vỏ App mang data-view-only="true" (global.css).
import { useState, type FormEvent } from "react";
import { ADMIN_STORAGE_KEY, isAdminPin } from "../sim/adminPin.ts";
import { Popup } from "./Popup";
import c from "./App.module.css";
import s from "./ui.module.css";

function persist(on: boolean) {
  try {
    if (on) localStorage.setItem(ADMIN_STORAGE_KEY, "true");
    else localStorage.removeItem(ADMIN_STORAGE_KEY);
  } catch {
    // localStorage bị chặn: chỉ mở khóa trong phiên này
  }
}

export function AdminLockButton({ unlocked, onChange }: { unlocked: boolean; onChange: (on: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isAdminPin(pin)) {
      setError(true);
      return;
    }
    persist(true);
    onChange(true);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        className={c.userBadge}
        style={{ cursor: "pointer", background: "none", border: "1px solid currentColor", borderRadius: 6, padding: "2px 8px" }}
        title={unlocked ? "Đang mở điều khiển — bấm để khóa lại (chỉ xem)" : "Chế độ chỉ xem — bấm để nhập mã PIN"}
        onClick={() => {
          if (unlocked) {
            persist(false);
            onChange(false);
          } else {
            setPin("");
            setError(false);
            setOpen(true);
          }
        }}
      >
        {unlocked ? "🔓 Quản trị viên" : "🔒 Chỉ xem"}
      </button>
      {open && (
        <Popup title="Mở khóa điều khiển" onClose={() => setOpen(false)}>
          <form onSubmit={submit} style={{ display: "grid", gap: "var(--sp-3)", minWidth: 260 }}>
            <label className={s.field}>
              Nhập mã PIN để mở khóa điều khiển
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                autoFocus
                value={pin}
                aria-invalid={error || undefined}
                onChange={(e) => {
                  setPin(e.target.value);
                  setError(false);
                }}
                className={s.btn}
                style={{ fontSize: 20, letterSpacing: 6, textAlign: "center" }}
              />
            </label>
            {error && (
              <p className={s.noticeDanger} role="alert">
                Mã PIN không đúng.
              </p>
            )}
            <button type="submit" className={`${s.btn} ${s.primary}`} disabled={!pin}>
              Mở khóa
            </button>
          </form>
        </Popup>
      )}
    </>
  );
}
