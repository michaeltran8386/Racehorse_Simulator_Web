// Bảng nổi kiểu Hay Day trên <dialog> gốc: showModal() lo giữ focus, Esc và trả focus về nút đã mở.
// Mở: nảy lên; đóng: thu lại rồi mới gọi onClose (cha gỡ component). Bản đồ phía sau vẫn chạy.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { audio } from "../audio/audioManager";
import c from "./Popup.module.css";

const CLOSE_MS = 180;

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Popup({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const titleId = useId(); // bảng có thể chồng nhau (thẻ ngựa trên bảng chuồng)

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
      audio.playSfx("building-open");
    }
  }, []);

  useEffect(() => {
    if (!closing) return;
    audio.playSfx("ui-close");
    const t = window.setTimeout(() => {
      ref.current?.close();
      onClose();
    }, CLOSE_MS);
    return () => clearTimeout(t);
  }, [closing, onClose]);

  const requestClose = () => setClosing(true);

  return (
    <dialog
      ref={ref}
      className={c.popup}
      data-closing={closing}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault(); // Esc: chạy hiệu ứng đóng thay vì tắt ngay
        requestClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose(); // chạm ra ngoài bảng
      }}
    >
      <div className={c.panel}>
        <header className={c.head}>
          <h2 id={titleId} className={c.title}>
            {title}
          </h2>
          <button type="button" className={c.close} aria-label="Đóng" onClick={requestClose}>
            <span aria-hidden>✕</span>
          </button>
        </header>
        <div className={c.body}>{children}</div>
      </div>
    </dialog>
  );
}
