import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import florkImg from "@/assets/flork.png";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Flork Jump — Lompat & Hindari!" },
      {
        name: "description",
        content:
          "Game endless jumper seru bersama Flork. Lompat, hindari rintangan, dan kejar skor tertinggi!",
      },
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
    score: 0,
    running: false,
  });

  const florkRef = useRef<SVGImageElement>(null);
  const obstaclesGroupRef = useRef<SVGGElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);

  const jump = useCallback(() => {
    const s = stateRef.current;
    if (!s.running) return;
    if (s.y >= GROUND_Y - FLORK_SIZE - 1) s.vy = JUMP_V;
  }, []);

  const start = useCallback(() => {
    stateRef.current = {
      y: GROUND_Y - FLORK_SIZE,
      vy: 0,
      obstacles: [],
      speed: 6,
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

      s.vy += GRAVITY;
      s.y += s.vy;
      if (s.y > GROUND_Y - FLORK_SIZE) {
        s.y = GROUND_Y - FLORK_SIZE;
        s.vy = 0;
      }

      const last = s.obstacles[s.obstacles.length - 1];
      if (!last || last.x < GAME_W - 220 - Math.random() * 200) {
        const h = 30 + Math.random() * 55;
        s.obstacles.push({ x: GAME_W, w: 24 + Math.random() * 18, h });
      }

      for (const o of s.obstacles) o.x -= s.speed;
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > 0);

      const fx = 80;
      const fy = s.y;
      for (const o of s.obstacles) {
        const oy = GROUND_Y - o.h;
        if (
          fx + FLORK_SIZE - 14 > o.x &&
          fx + 14 < o.x + o.w &&
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

      // Render directly to SVG nodes (no React re-render per frame)
      if (florkRef.current) {
        florkRef.current.setAttribute("x", "80");
        florkRef.current.setAttribute("y", String(s.y));
        florkRef.current.setAttribute(
          "transform",
          `rotate(${s.vy * 2} ${80 + FLORK_SIZE / 2} ${s.y + FLORK_SIZE / 2})`,
        );
      }
      if (obstaclesGroupRef.current) {
        const svgNS = "http://www.w3.org/2000/svg";
        const g = obstaclesGroupRef.current;
        // reuse children
        while (g.childNodes.length < s.obstacles.length) {
          const r = document.createElementNS(svgNS, "rect");
          r.setAttribute("fill", "url(#obstacleGrad)");
          r.setAttribute("stroke", "rgba(255,255,255,0.4)");
          r.setAttribute("stroke-width", "2");
          r.setAttribute("rx", "6");
          g.appendChild(r);
        }
        while (g.childNodes.length > s.obstacles.length) {
          g.removeChild(g.lastChild!);
        }
        s.obstacles.forEach((o, i) => {
          const r = g.childNodes[i] as SVGRectElement;
          r.setAttribute("x", String(o.x));
          r.setAttribute("y", String(GROUND_Y - o.h));
          r.setAttribute("width", String(o.w));
          r.setAttribute("height", String(o.h));
        });
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
      <p className="text-foreground/70 mb-6 text-sm md:text-base text-center">
        Tekan{" "}
        <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20">
          Space
        </kbd>{" "}
        atau klik area game untuk lompat
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
        <svg
          viewBox={`0 0 ${GAME_W} ${GAME_H}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.5 0.25 320)" />
              <stop offset="100%" stopColor="oklch(0.25 0.15 290)" />
            </linearGradient>
            <linearGradient id="obstacleGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.7 0.28 350)" />
              <stop offset="100%" stopColor="oklch(0.55 0.28 300)" />
            </linearGradient>
          </defs>

          {/* Stars */}
          {Array.from({ length: 35 }).map((_, i) => {
            const x = (i * 137) % GAME_W;
            const y = (i * 89) % (GROUND_Y - 40);
            const r = ((i * 13) % 3) * 0.5 + 0.5;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={r}
                fill="white"
                opacity={0.3 + ((i * 7) % 7) / 10}
              />
            );
          })}

          {/* Ground */}
          <rect
            x={0}
            y={GROUND_Y}
            width={GAME_W}
            height={GAME_H - GROUND_Y}
            fill="url(#ground)"
          />
          <line
            x1={0}
            y1={GROUND_Y}
            x2={GAME_W}
            y2={GROUND_Y}
            stroke="white"
            strokeOpacity="0.4"
            strokeWidth="2"
          />

          {/* Obstacles */}
          <g ref={obstaclesGroupRef} />

          {/* Flork */}
          <image
            ref={florkRef}
            href={florkImg}
            x={80}
            y={GROUND_Y - FLORK_SIZE}
            width={FLORK_SIZE}
            height={FLORK_SIZE}
            style={{ filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.4))" }}
          />
        </svg>

        {!running && !gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="text-3xl md:text-5xl font-black mb-4 text-white">
              Siap Melompat?
            </div>
            <button
              className="px-8 py-3 rounded-full font-bold text-white text-lg hover:scale-105 transition-transform"
              style={{
                background: "var(--gradient-flork)",
                boxShadow: "var(--shadow-glow)",
              }}
            >
              MULAI
            </button>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 backdrop-blur-sm">
            <div className="text-4xl md:text-6xl font-black mb-2 text-white">
              GAME OVER
            </div>
            <div className="text-white/80 mb-4">
              Skor: {score} • Terbaik: {best}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                start();
              }}
              className="px-8 py-3 rounded-full font-bold text-white text-lg hover:scale-105 transition-transform"
              style={{
                background: "var(--gradient-flork)",
                boxShadow: "var(--shadow-glow)",
              }}
            >
              MAIN LAGI
            </button>
          </div>
        )}
      </div>

      <p className="mt-6 text-xs text-foreground/50">
        Made with 💜 • Flork Jump
      </p>
    </main>
  );
}
