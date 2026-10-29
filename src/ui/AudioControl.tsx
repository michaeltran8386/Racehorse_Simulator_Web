import { useEffect, useRef, useState } from "react";
import { useAudioSettings } from "../audio/audioManager";
import c from "./App.module.css";

export function AudioControl({ align = "right" }: { align?: "left" | "right" } = {}) {
  const {
    musicEnabled,
    sfxEnabled,
    musicVolume,
    sfxVolume,
    toggleMusic,
    toggleSfx,
    setMusicVolume,
    setSfxVolume,
    playSfx,
  } = useAudioSettings();

  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", handleClickOutside);
    return () => window.removeEventListener("pointerdown", handleClickOutside);
  }, [open]);

  return (
    <div style={{ position: "relative", display: "inline-block" }} ref={popoverRef}>
      <button
        type="button"
        className={c.speedBtn}
        style={{
          minWidth: "36px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "4px",
          padding: "4px 8px",
          fontWeight: 600,
        }}
        aria-label="Cài đặt âm thanh"
        title="Cài đặt âm lượng & hiệu ứng âm thanh"
        onClick={() => {
          playSfx("ui-click");
          setOpen((v) => !v);
        }}
      >
        <span>{musicEnabled ? "🎵" : "🔇"}</span>
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            ...(align === "left" ? { left: 0 } : { right: 0 }),
            zIndex: 9999,
            backgroundColor: "var(--surface-raised, #242933)",
            border: "1px solid var(--border-default, #3b4252)",
            borderRadius: "8px",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.45)",
            padding: "12px 16px",
            minWidth: "220px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            color: "var(--ink-primary, #eceff4)",
            fontSize: "13px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border-subtle, #3b4252)", paddingBottom: "6px" }}>
            <span style={{ fontWeight: 700, letterSpacing: "0.5px" }}>Âm Thanh EquiFlow</span>
            <button
              type="button"
              style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: "14px" }}
              onClick={() => {
                playSfx("ui-close");
                setOpen(false);
              }}
            >
              ✕
            </button>
          </div>

          {/* Nhạc nền */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={musicEnabled}
                  onChange={() => {
                    const next = toggleMusic();
                    playSfx(next ? "ui-success" : "ui-click");
                  }}
                />
                <span>Nhạc nền (BGM)</span>
              </label>
              <span style={{ color: "var(--ink-muted, #9aa2b1)", fontSize: "11px" }}>
                {musicEnabled ? `${Math.round(musicVolume * 100)}%` : "Tắt"}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={musicVolume}
              disabled={!musicEnabled}
              onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent, #a3be8c)", cursor: musicEnabled ? "pointer" : "not-allowed" }}
            />
          </div>

          {/* Hiệu ứng âm thanh (SFX) */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", cursor: "pointer", userSelect: "none" }}>
                <input
                  type="checkbox"
                  checked={sfxEnabled}
                  onChange={() => {
                    const next = toggleSfx();
                    if (next) playSfx("ui-success");
                  }}
                />
                <span>Hiệu ứng (SFX)</span>
              </label>
              <span style={{ color: "var(--ink-muted, #9aa2b1)", fontSize: "11px" }}>
                {sfxEnabled ? `${Math.round(sfxVolume * 100)}%` : "Tắt"}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={sfxVolume}
              disabled={!sfxEnabled}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setSfxVolume(v);
                playSfx("ui-click");
              }}
              style={{ width: "100%", accentColor: "var(--accent, #a3be8c)", cursor: sfxEnabled ? "pointer" : "not-allowed" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
