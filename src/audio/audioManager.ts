/**
 * EquiFlow Audio Manager
 * Centralized, lightweight, and maintainable audio engine for EquiFlow Simulator.
 * Conforms to SRS & Audio System Requirements (NOW1.txt & NOW2.txt):
 * - Seamless looping background music with intro ducking & autoplay fallback
 * - Contextual UI, Intro, Building, and Delivery sound effects
 * - Persistent audio settings in localStorage
 * - Safe error handling (never crashes on missing asset or browser permission)
 */

import { useEffect, useState } from "react";

export type SfxId =
  | "ui-click"
  | "building-select"
  | "building-open"
  | "ui-close"
  | "ui-success"
  | "ui-error"
  | "intro-cloud-whoosh"
  | "intro-logo-reveal"
  | "delivery-vehicle-arrive"
  | "delivery-stop"
  | "delivery-complete";

export interface AudioSettings {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  musicVolume: number; // 0.0 .. 1.0
  sfxVolume: number;   // 0.0 .. 1.0
}

const SETTINGS_KEY = "equiflow_audio_settings";

const DEFAULT_SETTINGS: AudioSettings = {
  musicEnabled: true,
  sfxEnabled: true,
  musicVolume: 0.5,
  sfxVolume: 0.7,
};

export class AudioManager {
  private settings: AudioSettings = { ...DEFAULT_SETTINGS };
  private musicAudio: HTMLAudioElement | null = null;
  private sfxCache: Map<SfxId, HTMLAudioElement> = new Map();
  private lastPlayedTime: Map<string, number> = new Map();
  private listeners: Set<() => void> = new Set();
  private isDucked = false;
  private isInitialized = false;

  constructor() {
    this.loadSettings();
  }

  private loadSettings() {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      if (saved) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      }
    } catch {
      this.settings = { ...DEFAULT_SETTINGS };
    }
  }

  private saveSettings() {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
      } catch {}
    }
    this.notify();
  }

  public init() {
    if (typeof window === "undefined" || this.isInitialized) return;
    this.isInitialized = true;

    // 1. Khởi tạo nhạc nền Theme chính
    this.musicAudio = new Audio("/audio/theme-main.mp3");
    this.musicAudio.loop = true;
    this.musicAudio.preload = "auto";
    this.updateMusicVolume();

    // 2. Tự động tải trước (preload) các hiệu ứng âm thanh
    const sfxList: SfxId[] = [
      "ui-click",
      "building-select",
      "building-open",
      "ui-close",
      "ui-success",
      "ui-error",
      "intro-cloud-whoosh",
      "intro-logo-reveal",
      "delivery-vehicle-arrive",
      "delivery-stop",
      "delivery-complete",
    ];

    for (const id of sfxList) {
      try {
        const audio = new Audio(`/audio/${id}.wav`);
        audio.preload = "auto";
        this.sfxCache.set(id, audio);
      } catch {}
    }

    // 3. Fallback browser autoplay: tự động kích hoạt âm thanh khi người dùng tương tác lần đầu
    const resumeOnInteraction = () => {
      if (this.settings.musicEnabled && this.musicAudio && this.musicAudio.paused) {
        this.musicAudio.play().catch(() => {});
      }
      window.removeEventListener("pointerdown", resumeOnInteraction);
      window.removeEventListener("keydown", resumeOnInteraction);
    };

    window.addEventListener("pointerdown", resumeOnInteraction, { once: true });
    window.addEventListener("keydown", resumeOnInteraction, { once: true });
  }

  public startMusic() {
    if (!this.musicAudio) this.init();
    if (!this.musicAudio) return;

    if (this.settings.musicEnabled) {
      this.updateMusicVolume();
      this.musicAudio.play().catch(() => {
        // Sẽ được kích hoạt khi có user interaction đầu tiên
      });
    }
  }

  public pauseMusic() {
    if (this.musicAudio && !this.musicAudio.paused) {
      this.musicAudio.pause();
    }
  }

  /** Giảm nhỏ nhạc nền (ducking) trong khi hoạt cảnh mở đầu đang chạy */
  public duckMusic(duck: boolean) {
    this.isDucked = duck;
    this.updateMusicVolume();
  }

  private updateMusicVolume() {
    if (!this.musicAudio) return;
    if (!this.settings.musicEnabled) {
      this.musicAudio.volume = 0;
      if (!this.musicAudio.paused) {
        this.musicAudio.pause();
      }
    } else {
      const targetVol = this.isDucked
        ? this.settings.musicVolume * 0.25
        : this.settings.musicVolume;
      this.musicAudio.volume = Math.max(0, Math.min(1, targetVol));
      if (this.musicAudio.paused) {
        this.musicAudio.play().catch(() => {});
      }
    }
  }

  /** Phát hiệu ứng âm thanh với bộ đệm chống chồng lặp (concurrency throttle) */
  public playSfx(id: SfxId, throttleMs = 50) {
    if (!this.settings.sfxEnabled || typeof window === "undefined") return;

    const now = performance.now();
    const last = this.lastPlayedTime.get(id) || 0;
    if (now - last < throttleMs) return;
    this.lastPlayedTime.set(id, now);

    try {
      const cached = this.sfxCache.get(id);
      let audio: HTMLAudioElement;
      if (cached && (cached.paused || cached.ended)) {
        audio = cached;
        audio.currentTime = 0;
      } else {
        audio = new Audio(`/audio/${id}.wav`);
      }
      audio.volume = Math.max(0, Math.min(1, this.settings.sfxVolume));
      audio.play().catch(() => {});
    } catch {}
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  public setMusicEnabled(enabled: boolean) {
    this.settings.musicEnabled = enabled;
    this.updateMusicVolume();
    this.saveSettings();
  }

  public setSfxEnabled(enabled: boolean) {
    this.settings.sfxEnabled = enabled;
    this.saveSettings();
  }

  public setMusicVolume(volume: number) {
    this.settings.musicVolume = Math.max(0, Math.min(1, volume));
    this.updateMusicVolume();
    this.saveSettings();
  }

  public setSfxVolume(volume: number) {
    this.settings.sfxVolume = Math.max(0, Math.min(1, volume));
    this.saveSettings();
  }

  public toggleMusic(): boolean {
    const next = !this.settings.musicEnabled;
    this.setMusicEnabled(next);
    return next;
  }

  public toggleSfx(): boolean {
    const next = !this.settings.sfxEnabled;
    this.setSfxEnabled(next);
    return next;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }
}

export const audio = new AudioManager();

/** Hook theo dõi và cập nhật cài đặt âm thanh trong React */
export function useAudioSettings() {
  const [settings, setSettings] = useState(() => audio.getSettings());

  useEffect(() => {
    return audio.subscribe(() => setSettings(audio.getSettings()));
  }, []);

  return {
    ...settings,
    setMusicEnabled: (v: boolean) => audio.setMusicEnabled(v),
    setSfxEnabled: (v: boolean) => audio.setSfxEnabled(v),
    setMusicVolume: (v: number) => audio.setMusicVolume(v),
    setSfxVolume: (v: number) => audio.setSfxVolume(v),
    toggleMusic: () => audio.toggleMusic(),
    toggleSfx: () => audio.toggleSfx(),
    playSfx: (id: SfxId, throttleMs?: number) => audio.playSfx(id, throttleMs),
    duckMusic: (duck: boolean) => audio.duckMusic(duck),
  };
}
