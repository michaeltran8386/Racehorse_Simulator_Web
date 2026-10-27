import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./ui/App";
import { IntroGate } from "./ui/IntroOverlay";
import { getWorkoutSimulationContext } from "./api/simulatorApi";
import "./ui/global.css";

function Root() {
  const query = new URLSearchParams(window.location.search);
  const sessionId = query.get("sessionId")?.trim() || query.get("session_id")?.trim() || null;
  const typeParam = (query.get("type") || query.get("sessionType") || "").trim().toUpperCase();

  // Đồng bộ tức thời nếu có type=EXAM trên URL; hoặc kiểm tra context nếu có sessionId
  const [bypassIntro, setBypassIntro] = useState<boolean>(() => typeParam === "EXAM");

  useEffect(() => {
    if (bypassIntro || !sessionId) return;
    let active = true;
    getWorkoutSimulationContext(sessionId)
      .then((ctx) => {
        if (active && ctx.type === "EXAM") {
          setBypassIntro(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionId, bypassIntro]);

  if (bypassIntro) {
    return <App />;
  }

  return (
    <IntroGate>
      <App />
    </IntroGate>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Thiếu #root trong index.html");
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
