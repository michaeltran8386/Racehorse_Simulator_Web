import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import styles from "./IntroOverlay.module.css";
import { cloudField, INTRO, INTRO_REDUCED_TOTAL_MS, INTRO_TITLE, INTRO_TOTAL_MS, titleLetters, type CloudLayer } from "./introTimeline";
import { audio } from "../audio/audioManager";

const LAYERS: readonly CloudLayer[] = ["back", "mid", "front"];
const FIELDS = Object.fromEntries(LAYERS.map((layer) => [layer, cloudField(layer)])) as Record<CloudLayer, ReturnType<typeof cloudField>>;
const LETTERS = titleLetters(INTRO_TITLE, INTRO.expand.duration - INTRO.letterGrow);

/** Mốc thời gian đưa sang CSS (một nguồn duy nhất: introTimeline.ts). */
const TIMING = {
  "--pop-start": `${INTRO.acronymPop.start}ms`,
  "--pop-ms": `${INTRO.acronymPop.duration}ms`,
  "--expand-start": `${INTRO.expand.start}ms`,
  "--grow-ms": `${INTRO.letterGrow}ms`,
  "--expand-ms": `${INTRO.expand.duration}ms`,
  "--float-start": `${INTRO.expand.start + INTRO.expand.duration}ms`,
  "--part-start": `${INTRO.part.start}ms`,
  "--part-ms": `${INTRO.part.duration}ms`,
  "--reduced-start": `${INTRO.reducedFade.start}ms`,
  "--reduced-ms": `${INTRO.reducedFade.duration}ms`,
} as CSSProperties;

/**
 * Intro kiểu Hay Day: mây dày phủ kín màn hình, "TMEC" bật nảy rồi giãn thành tên câu lạc bộ, sau đó mây tách
 * sang hai bên (3 lớp parallax) và màn chính lùi từ 1.06 về 1. Chạm hoặc nhấn phím để bỏ qua; xong thì gỡ hẳn.
 */
export function IntroGate({ children }: { children: ReactNode }) {
  const [done, setDone] = useState(false);
  const audioStarted = useRef(false);

  useEffect(() => {
    audio.init();
    audio.duckMusic(true);

    if (done) {
      audio.duckMusic(false);
      audio.startMusic();
      return;
    }

    if (!audioStarted.current) {
      audioStarted.current = true;
      // Pha 1: TMEC logo reveal chime
      const tLogo = window.setTimeout(() => {
        audio.playSfx("intro-logo-reveal");
      }, INTRO.acronymPop.start);

      // Pha 3: Cloud separation whoosh
      const tWhoosh = window.setTimeout(() => {
        audio.playSfx("intro-cloud-whoosh");
      }, INTRO.part.start);

      return () => {
        clearTimeout(tLogo);
        clearTimeout(tWhoosh);
      };
    }
  }, [done]);

  useEffect(() => {
    if (done) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      audio.duckMusic(false);
      audio.startMusic();
      setDone(true);
    };
    const timer = window.setTimeout(finish, reduced ? INTRO_REDUCED_TOTAL_MS : INTRO_TOTAL_MS);
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", skip);
    };
  }, [done]);

  return (
    <>
      <div className={done ? styles.stage : `${styles.stage} ${styles.revealing}`} style={TIMING}>
        {children}
      </div>
      {!done && (
        <div
          className={styles.overlay}
          style={TIMING}
          onPointerDown={() => {
            audio.duckMusic(false);
            audio.startMusic();
            setDone(true);
          }}
        >
          {LAYERS.map((layer) =>
            (["left", "right"] as const).map((side) => (
              <div key={`${layer}-${side}`} className={`${styles.half} ${styles[side]} ${styles[layer]}`} aria-hidden="true">
                {FIELDS[layer].map((p, i) => (
                  <img
                    key={i}
                    className={styles.puff}
                    src={`/assets/clouds/${p.sprite}.png`}
                    alt=""
                    draggable={false}
                    style={{ "--x": `${p.x}%`, "--y": `${p.y}%`, "--w": `${p.w}vmax`, "--bob": `${p.bob}s`, "--phase": `${p.phase}s` } as CSSProperties}
                  />
                ))}
              </div>
            )),
          )}
          <h1 className={styles.title} aria-label={INTRO_TITLE}>
            {LETTERS.map((word, w) => (
              <span key={w} className={styles.word} aria-hidden="true">
                {word.map((l, i) => (
                  <span
                    key={i}
                    className={l.initial ? `${styles.letter} ${styles.initial}` : styles.letter}
                    data-char={l.char}
                    style={{ "--delay": `${l.delay}ms`, "--i": w * 10 + i } as CSSProperties}
                  >
                    {l.char}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <p className={styles.hint}>Chạm hoặc nhấn phím bất kỳ để bỏ qua</p>
        </div>
      )}
    </>
  );
}
