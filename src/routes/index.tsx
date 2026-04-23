import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import florkImg from "@/assets/flork.png";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Flork Jump — Lompat & Hindari!" },
      { name: "description", content: "Game endless jumper seru bersama Flork. Lompat, hindari rintangan, dan kumpulkan skor tertinggi!" },
    ],
  }),
});

type Obstacle = { x: number; w: number; h: number };

const GAME_W = 800;
const GAME_H = 400;
const GROUND_Y = 340;
const FLORK_SIZE = 70;
const GRAVITY = 0.7;
const JUMP_V = -14;

function Index() {
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("flork-best") || 0);
  });

  const stateRef = useRef({
    y: GROUND_Y - FLORK_SIZE,
    vy: 0,
    obstacles: [] as Obstacle[],
    speed: 6,
    frame: 0,
    score: 0,
    running: false,
  });

  const florkRef = useRef<HTMLImageElement>(null);
  const obstaclesRef = useRef<HTMLDivElement>(null);
  const scoreRef = useRef<HTMLDivElement>(null);

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;
    if (s.y >= GROUND_Y - FLORK_SIZE - 1) {
      s.vy = JUMP_V;
    }
  }, []);

  const start = useCallback(() => {
    stateRef.current = {
      y: GROUND_Y - FLORK_SIZE,
      vy: 0,
      obstacles: [],
      speed: 6,
      frame: 0,
      score: 0,
      running: true,
    };
    setScore(0);
    setGameOver(false);
    setRunning(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        if (!stateRef.current.running) start();
        else jump();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jump, start]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;

    const loop = () => {
      const s = stateRef.current;
      if (!s.running) return;

      s.frame++;
      s.vy += GRAVITY;
      s.y += s.vy;
      if (s.y > GROUND_Y - FLORK_SIZE) {
        s.y = GROUND_Y - FLORK_SIZE;
        s.vy = 0;
      }

      // spawn
      const last = s.obstacles[s.obstacles.length - 1];
      if (!last || last.x < GAME_W - 220 - Math.random() * 200) {
        const h = 30 + Math.random() * 50;
        s.obstacles.push({ x: GAME_W, w: 24 + Math.random() * 20, h });
      }

      for (const o of s.obstacles) o.x -= s.speed;
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > 0);

      // collision (with small forgiveness)
      const fx = 80;
      const fy = s.y;
      for (const o of s.obstacles) {
        const ox = o.x;
        const oy = GROUND_Y - o.h;
        if (
          fx + FLORK_SIZE - 14 > ox &&
          fx + 14 < ox + o.w &&
          fy + FLORK_SIZE - 10 > oy
        ) {
          s.running = false;
          setRunning(false);
          setGameOver(true);
          setScore(Math.floor(s.score));
          setBest((b) => {
            const nb = Math.max(b, Math.floor(s.score));
            localStorage.setItem("flork-best", String(nb));
            return nb;
          });
          return;
        }
      }

      s.score += 0.2 + s.speed * 0.02;
      s.speed = 6 + Math.min(8, s.score / 200);

      // render via refs (no React re-render per frame)
      if (florkRef.current) {
        florkRef.current.style.transform = `translate(80px, ${s.y}px) rotate(${s.vy * 2}deg)`;
      }
      if (obstaclesRef.current) {
        obstaclesRef.current.innerHTML = s.obstacles
          .map(
            (o) =>
              `<div class="obstacle" style="left:${o.x}px;width:${o.w}px;height:${o.h}px"></div>`,
          )
          .join("");
      }
      if (scoreRef.current) {
        scoreRef.current.textContent = String(Math.floor(s.score));
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  return (
    <main
      className="min-h-screen w-full flex flex-col items-center justify-center px-4 py-8"
      style={{ background: "var(--gradient-sky)" }}
    >
      <h1
        className="text-5xl md:text-7xl font-black tracking-tight mb-2 text-transparent bg-clip-text"
        style={{ backgroundImage: "var(--gradient-flork)" }}
      >
        FLORK JUMP
      </h1>
      <p className="text-foreground/70 mb-6 text-sm md:text-base">
        Tekan <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20">Space</kbd> atau klik untuk lompat
      </p>

      <div className="flex items-center gap-6 mb-3 text-foreground">
        <div className="text-lg">
          Skor:{" "}
          <span ref={scoreRef} className="font-mono font-bold text-2xl">
            {score}
          </span>
        </div>
        <div className="text-lg opacity-70">
          Terbaik: <span className="font-mono font-bold">{best}</span>
        </div>
      </div>

      <div
        onClick={() => (running ? jump() : start())}
        className="relative w-full max-w-[800px] aspect-[2/1] rounded-3xl overflow-hidden border-2 border-white/20 cursor-pointer select-none"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.3 0.12 290) 0%, oklch(0.4 0.18 320) 70%, oklch(0.55 0.22 340) 100%)",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        {/* Stars */}
        <div className="absolute inset-0 opacity-60 pointer-events-none">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white"
              style={{
                width: Math.random() * 3 + 1,
                height: Math.random() * 3 + 1,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 70}%`,
                opacity: Math.random() * 0.8 + 0.2,
              }}
            />
          ))}
        </div>

        {/* Game viewport */}
        <div
          className="absolute inset-0"
          style={{ aspectRatio: `${GAME_W} / ${GAME_H}` }}
        >
          <svg
            viewBox={`0 0 ${GAME_W} ${GAME_H}`}
            className="absolute inset-0 w-full h-full"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.5 0.25 320)" />
                <stop offset="100%" stopColor="oklch(0.25 0.15 290)" />
              </linearGradient>
            </defs>
            <rect x="0" y={GROUND_Y} width={GAME_W} height={GAME_H - GROUND_Y} fill="url(#ground)" />
            <line x1="0" y1={GROUND_Y} x2={GAME_W} y2={GROUND_Y} stroke="white" strokeOpacity="0.3" strokeWidth="2" />
          </svg>

          {/* Game world scaled to viewport */}
          <div
            className="absolute inset-0"
            style={{
              transformOrigin: "top left",
            }}
          >
            <div
              className="relative"
              style={{
                width: GAME_W,
                height: GAME_H,
                transform: "scale(var(--game-scale, 1))",
                transformOrigin: "top left",
              }}
              ref={(el) => {
                if (!el) return;
                const ro = new ResizeObserver(() => {
                  const parent = el.parentElement!;
                  const scale = parent.clientWidth / GAME_W;
                  el.style.setProperty("--game-scale", String(scale));
                  el.style.height = `${GAME_H * scale}px`;
                });
                ro.observe(el.parentElement!);
              }}
            >
              <img
                ref={florkRef}
                src={florkImg}
                alt="Flork"
                className="absolute top-0 left-0 pointer-events-none"
                style={{
                  width: FLORK_SIZE,
                  height: FLORK_SIZE,
                  transform: `translate(80px, ${GROUND_Y - FLORK_SIZE}px)`,
                  filter: "drop-shadow(0 4px 8px rgba(0,0,0,0.4))",
                }}
                draggable={false}
              />
              <div ref={obstaclesRef} className="absolute inset-0 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Overlays */}
        {!running && !gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="text-3xl md:text-5xl font-black mb-3 text-white">Siap?</div>
            <button
              className="px-8 py-3 rounded-full font-bold text-white text-lg"
              style={{ background: "var(--gradient-flork)", boxShadow: "var(--shadow-glow)" }}
            >
              MULAI
            </button>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="text-4xl md:text-6xl font-black mb-2 text-white">GAME OVER</div>
            <div className="text-white/80 mb-4">Skor: {score} • Terbaik: {best}</div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                start();
              }}
              className="px-8 py-3 rounded-full font-bold text-white text-lg"
              style={{ background: "var(--gradient-flork)", boxShadow: "var(--shadow-glow)" }}
            >
              MAIN LAGI
            </button>
          </div>
        )}
      </div>

      <style>{`
        .obstacle {
          position: absolute;
          bottom: ${GAME_H - GROUND_Y}px;
          background: linear-gradient(180deg, oklch(0.7 0.28 350), oklch(0.55 0.28 300));
          border-radius: 6px 6px 0 0;
          box-shadow: 0 0 20px oklch(0.7 0.28 320 / 0.6), inset 0 -4px 0 rgba(0,0,0,0.2);
          border: 2px solid rgba(255,255,255,0.3);
        }
      `}</style>
    </main>
  );
}
