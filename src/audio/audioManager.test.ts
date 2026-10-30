import assert from 'node:assert/strict';
import { test, beforeEach, afterEach } from 'node:test';
import { AudioManager, audio } from './audioManager.ts';

// Mock browser primitives for Node test environment
class MockAudio {
  public src: string;
  public loop = false;
  public preload = 'none';
  public volume = 1;
  public currentTime = 0;
  public paused = true;
  public ended = false;
  public playCalls = 0;
  public pauseCalls = 0;
  public shouldFailPlay = false;

  constructor(src?: string) {
    this.src = src || '';
    MockAudio.instances.push(this);
  }

  static instances: MockAudio[] = [];
  static blockAutoplay = false;

  play(): Promise<void> {
    this.playCalls++;
    if (MockAudio.blockAutoplay || this.shouldFailPlay) {
      this.paused = true;
      return Promise.reject(new Error('Autoplay blocked by browser policy'));
    }
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.pauseCalls++;
    this.paused = true;
  }
}

const storage = new Map<string, string>();
const mockLocalStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, val: string) => storage.set(key, String(val)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
};

const windowListeners: Record<string, Function[]> = {};
const mockWindow = {
  addEventListener: (event: string, fn: Function) => {
    windowListeners[event] = windowListeners[event] || [];
    windowListeners[event].push(fn);
  },
  removeEventListener: (event: string, fn: Function) => {
    if (windowListeners[event]) {
      windowListeners[event] = windowListeners[event].filter((f) => f !== fn);
    }
  },
};

const originalWindow = globalThis.window;
const originalLocalStorage = (globalThis as any).localStorage;
const originalAudio = (globalThis as any).Audio;

beforeEach(() => {
  storage.clear();
  MockAudio.instances = [];
  MockAudio.blockAutoplay = false;
  for (const k of Object.keys(windowListeners)) {
    delete windowListeners[k];
  }
  (globalThis as any).window = mockWindow;
  (globalThis as any).localStorage = mockLocalStorage;
  (globalThis as any).Audio = MockAudio;
});

afterEach(() => {
  (globalThis as any).window = originalWindow;
  (globalThis as any).localStorage = originalLocalStorage;
  (globalThis as any).Audio = originalAudio;
});

test('AudioManager loads default settings when localStorage is empty', () => {
  const manager = new AudioManager();
  const settings = manager.getSettings();

  assert.equal(settings.musicEnabled, true);
  assert.equal(settings.sfxEnabled, true);
  assert.equal(settings.musicVolume, 0.5);
  assert.equal(settings.sfxVolume, 0.7);
});

test('AudioManager loads persisted settings from localStorage', () => {
  mockLocalStorage.setItem(
    'equiflow_audio_settings',
    JSON.stringify({
      musicEnabled: false,
      sfxEnabled: true,
      musicVolume: 0.2,
      sfxVolume: 0.9,
    }),
  );

  const manager = new AudioManager();
  const settings = manager.getSettings();

  assert.equal(settings.musicEnabled, false);
  assert.equal(settings.sfxEnabled, true);
  assert.equal(settings.musicVolume, 0.2);
  assert.equal(settings.sfxVolume, 0.9);
});

test('AudioManager handles corrupted JSON in localStorage gracefully', () => {
  mockLocalStorage.setItem('equiflow_audio_settings', '{invalid-json');

  const manager = new AudioManager();
  const settings = manager.getSettings();

  assert.equal(settings.musicEnabled, true);
  assert.equal(settings.musicVolume, 0.5);
});

test('Volume setters clamp values between 0.0 and 1.0 and persist to localStorage', () => {
  const manager = new AudioManager();

  manager.setMusicVolume(1.5);
  assert.equal(manager.getSettings().musicVolume, 1.0);

  manager.setMusicVolume(-0.5);
  assert.equal(manager.getSettings().musicVolume, 0.0);

  manager.setSfxVolume(2.0);
  assert.equal(manager.getSettings().sfxVolume, 1.0);

  manager.setSfxVolume(-1.0);
  assert.equal(manager.getSettings().sfxVolume, 0.0);

  const saved = JSON.parse(mockLocalStorage.getItem('equiflow_audio_settings')!);
  assert.equal(saved.musicVolume, 0.0);
  assert.equal(saved.sfxVolume, 0.0);
});

test('toggleMusic and toggleSfx flip enabled states and notify subscribers', () => {
  const manager = new AudioManager();
  let notifyCount = 0;
  const unsubscribe = manager.subscribe(() => {
    notifyCount++;
  });

  const nextMusic = manager.toggleMusic();
  assert.equal(nextMusic, false);
  assert.equal(manager.getSettings().musicEnabled, false);
  assert.equal(notifyCount, 1);

  const nextSfx = manager.toggleSfx();
  assert.equal(nextSfx, false);
  assert.equal(manager.getSettings().sfxEnabled, false);
  assert.equal(notifyCount, 2);

  unsubscribe();
  manager.toggleMusic();
  assert.equal(notifyCount, 2, 'Unsubscribed listener should not be called again');
});

test('init preloads theme music and all SFX sound files', () => {
  const manager = new AudioManager();
  manager.init();

  const themeInstance = MockAudio.instances.find((a) => a.src === '/audio/theme-main.mp3');
  assert.ok(themeInstance, 'theme-main.mp3 must be preloaded');
  assert.equal(themeInstance.loop, true);
  assert.equal(themeInstance.preload, 'auto');

  const expectedSfx = [
    '/audio/ui-click.wav',
    '/audio/building-select.wav',
    '/audio/building-open.wav',
    '/audio/ui-close.wav',
    '/audio/ui-success.wav',
    '/audio/ui-error.wav',
    '/audio/intro-cloud-whoosh.wav',
    '/audio/intro-logo-reveal.wav',
    '/audio/delivery-vehicle-arrive.wav',
    '/audio/delivery-stop.wav',
    '/audio/delivery-complete.wav',
  ];

  for (const sfxSrc of expectedSfx) {
    const sfxInstance = MockAudio.instances.find((a) => a.src === sfxSrc);
    assert.ok(sfxInstance, `Missing preload for ${sfxSrc}`);
    assert.equal(sfxInstance.preload, 'auto');
  }

  assert.ok(windowListeners['pointerdown']?.length, 'Must register fallback pointerdown listener');
  assert.ok(windowListeners['keydown']?.length, 'Must register fallback keydown listener');
});

test('Autoplay fallback starts music upon user interaction and unregisters listeners', () => {
  MockAudio.blockAutoplay = true;
  const manager = new AudioManager();
  manager.init();

  const themeInstance = MockAudio.instances.find((a) => a.src === '/audio/theme-main.mp3')!;
  assert.equal(themeInstance.paused, true);
  assert.equal(themeInstance.playCalls, 1, 'Initial autoplay should have been attempted');

  // Once user interacts, browser allows audio
  MockAudio.blockAutoplay = false;
  const pointerHandler = windowListeners['pointerdown'][0];
  assert.ok(pointerHandler);
  pointerHandler();

  assert.equal(themeInstance.playCalls, 2);
  assert.equal(themeInstance.paused, false);
  assert.equal(windowListeners['pointerdown']?.length || 0, 0);
  assert.equal(windowListeners['keydown']?.length || 0, 0);
});

test('duckMusic scales volume to 25% and restores on unduck', () => {
  const manager = new AudioManager();
  manager.init();
  manager.setMusicVolume(0.8);

  const themeInstance = MockAudio.instances.find((a) => a.src === '/audio/theme-main.mp3')!;
  assert.equal(themeInstance.volume, 0.8);

  manager.duckMusic(true);
  assert.equal(themeInstance.volume, 0.8 * 0.25);

  manager.duckMusic(false);
  assert.equal(themeInstance.volume, 0.8);
});

test('playSfx plays audio and enforces throttleMs concurrency guard', () => {
  const manager = new AudioManager();
  manager.init();

  const clickAudio = MockAudio.instances.find((a) => a.src === '/audio/ui-click.wav')!;
  assert.equal(clickAudio.playCalls, 0);

  manager.playSfx('ui-click', 100);
  assert.equal(clickAudio.playCalls, 1);

  // Calling again immediately within 100ms throttle should be ignored
  manager.playSfx('ui-click', 100);
  assert.equal(clickAudio.playCalls, 1, 'Subsequent rapid playSfx must be throttled');
});

test('playSfx is completely muted when sfxEnabled is false', () => {
  const manager = new AudioManager();
  manager.init();
  manager.setSfxEnabled(false);

  const clickAudio = MockAudio.instances.find((a) => a.src === '/audio/ui-click.wav')!;
  manager.playSfx('ui-click');
  assert.equal(clickAudio.playCalls, 0);
});

test('Safe error handling: unhandled Audio errors or rejected play() do not crash', async () => {
  const manager = new AudioManager();
  manager.init();

  const themeInstance = MockAudio.instances.find((a) => a.src === '/audio/theme-main.mp3')!;
  themeInstance.shouldFailPlay = true;

  // Should not throw
  assert.doesNotThrow(() => {
    manager.startMusic();
    manager.playSfx('ui-error');
  });
});

test('Singleton audio export functions correctly', () => {
  assert.ok(audio);
  const settings = audio.getSettings();
  assert.equal(typeof settings.musicEnabled, 'boolean');
  assert.equal(typeof settings.sfxEnabled, 'boolean');
});
