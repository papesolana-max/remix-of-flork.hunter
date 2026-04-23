import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import florkImg from "@/assets/flork.png";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Flork Gravity Flip — Balik Gravitasi!" },
      {
        name: "description",
        content:
          "Game arcade unik: balik gravitasi Flork untuk lari di lantai dan langit-langit. Hindari rintangan, kumpulkan bintang, kejar skor tertinggi!",
      },
    ],
  }),
});

type Obstacle = {
  x: number;
  w: number;
  h: number;
  side: "floor" | "ceil";
};
type Star = { x: number; y: number; taken: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number };

const GAME_W = 900;
const GAME_H = 500;
const PAD = 30;
const FLORK_SIZE = 64;
const GRAV = 0.9;
const TERMINAL = 18;

function Index() {
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("flork-flip-best") || 0);
  });

  const stateRef = useRef({
    y: PAD,
    vy: 0,
    gravDir: 1 as 1 | -1, // 1 = down (on floor), -1 = up (on ceiling)
    obstacles: [] as Obstacle[],
    stars: [] as Star[],
    particles: [] as Particle[],
    speed: 6,
    score: 0,
    distance: 0,
    flipCooldown: 0,
    running: false,
  });

  const florkRef = useRef<SVGImageElement>(null);
  const obstaclesRef = useRef<SVGGElement>(null);
  const starsRef = useRef<SVGGElement>(null);
  const particlesRef = useRef<SVGGElement>(null);
  const trailRef = useRef<SVGPathElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const trailPoints = useRef<{ x: number; y: number }[]>([]);

  const flip = useCallback(() => {
    const s = stateRef.current;
    if (!s.running || s.flipCooldown > 0) return;
    s.gravDir = (s.gravDir === 1 ? -1 : 1) as 1 | -1;
    s.vy = s.gravDir * 4; // small kick in new direction
    s.flipCooldown = 6;
    // burst particles
    for (let i = 0; i < 12; i++) {
      s.particles.push({
        x: 120 + FLORK_SIZE / 2,
        y: s.y + FLORK_SIZE / 2,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 30,
      });
    }
  }, []);

  const start = useCallback(() => {
    stateRef.current = {
      y: PAD,
      vy: 0,
      gravDir: 1,
      obstacles: [],
      stars: [],
      particles: [],
      speed: 6,
      score: 0,
      distance: 0,
      flipCooldown: 0,
      running: true,
    };
    trailPoints.current = [];
    setScore(0);
    setGameOver(false);
    setRunning(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        e.code === "Space" ||
        e.code === "ArrowUp" ||
        e.code === "ArrowDown"
      ) {
        e.preventDefault();
        if (!stateRef.current.running) start();
        else flip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, start]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const svgNS = "http://www.w3.org/2000/svg";

    const loop = () => {
      const s = stateRef.current;
      if (!s.running) return;

      if (s.flipCooldown > 0) s.flipCooldown--;

      // physics
      s.vy += GRAV * s.gravDir;
      if (s.vy > TERMINAL) s.vy = TERMINAL;
      if (s.vy < -TERMINAL) s.vy = -TERMINAL;
      s.y += s.vy;

      // clamp to floor/ceiling
      const floorY = GAME_H - PAD - FLORK_SIZE;
      const ceilY = PAD;
      if (s.y > floorY) {
        s.y = floorY;
        s.vy = 0;
      }
      if (s.y < ceilY) {
        s.y = ceilY;
        s.vy = 0;
      }

      // distance & speed scaling
      s.distance += s.speed;
      s.speed = 6 + Math.min(8, s.distance / 1200);

      // spawn obstacles
      const last = s.obstacles[s.obstacles.length - 1];
      if (!last || last.x < GAME_W - 240 - Math.random() * 180) {
        const side: "floor" | "ceil" = Math.random() < 0.5 ? "floor" : "ceil";
        const h = 60 + Math.random() * 80;
        s.obstacles.push({
          x: GAME_W,
          w: 26 + Math.random() * 18,
          h,
          side,
        });
        // sometimes also add a star to encourage flipping
        if (Math.random() < 0.55) {
          const starSide = Math.random() < 0.5 ? "floor" : "ceil";
          const sy =
            starSide === "floor"
              ? GAME_H - PAD - 50 - Math.random() * 80
              : PAD + 30 + Math.random() * 80;
          s.stars.push({ x: GAME_W + 80, y: sy, taken: false });
        }
      }

      // move
      for (const o of s.obstacles) o.x -= s.speed;
      for (const st of s.stars) st.x -= s.speed;
      s.obstacles = s.obstacles.filter((o) => o.x + o.w > 0);
      s.stars = s.stars.filter((st) => st.x > -30);

      // particles
      for (const p of s.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.2;
        p.life--;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

      // collisions
      const fx = 120;
      const fy = s.y;
      for (const o of s.obstacles) {
        const oy = o.side === "floor" ? GAME_H - PAD - o.h : PAD;
        if (
          fx + FLORK_SIZE - 12 > o.x &&
          fx + 12 < o.x + o.w &&
          fy + FLORK_SIZE - 8 > oy &&
          fy + 8 < oy + o.h
        ) {
          s.running = false;
          setRunning(false);
          setGameOver(true);
          setScore(Math.floor(s.score));
          setBest((b) => {
            const nb = Math.max(b, Math.floor(s.score));
            localStorage.setItem("flork-flip-best", String(nb));
            return nb;
          });
          return;
        }
      }

      // star pickup
      for (const st of s.stars) {
        if (st.taken) continue;
        const cx = fx + FLORK_SIZE / 2;
        const cy = fy + FLORK_SIZE / 2;
        const dx = cx - st.x;
        const dy = cy - st.y;
        if (dx * dx + dy * dy < 36 * 36) {
          st.taken = true;
          s.score += 25;
          for (let i = 0; i < 8; i++) {
            s.particles.push({
              x: st.x,
              y: st.y,
              vx: (Math.random() - 0.5) * 5,
              vy: (Math.random() - 0.5) * 5,
              life: 25,
            });
          }
        }
      }
      s.stars = s.stars.filter((st) => !st.taken);

      s.score += 0.15 + s.speed * 0.015;

      // trail
      trailPoints.current.push({ x: fx + FLORK_SIZE / 2, y: fy + FLORK_SIZE / 2 });
      if (trailPoints.current.length > 18) trailPoints.current.shift();

      // ===== render =====
      if (florkRef.current) {
        florkRef.current.setAttribute("x", String(fx));
        florkRef.current.setAttribute("y", String(fy));
        // flip vertically when on ceiling
        const cx = fx + FLORK_SIZE / 2;
        const cy = fy + FLORK_SIZE / 2;
        const scaleY = s.gravDir === 1 ? 1 : -1;
        florkRef.current.setAttribute(
          "transform",
          `translate(${cx} ${cy}) scale(1 ${scaleY}) translate(${-cx} ${-cy})`,
        );
      }

      if (trailRef.current) {
        const pts = trailPoints.current;
        if (pts.length > 1) {
          const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
          trailRef.current.setAttribute("d", d);
        }
      }

      if (obstaclesRef.current) {
        const g = obstaclesRef.current;
        while (g.childNodes.length < s.obstacles.length) {
          const r = document.createElementNS(svgNS, "rect");
          r.setAttribute("rx", "8");
          r.setAttribute("stroke", "rgba(255,255,255,0.5)");
          r.setAttribute("stroke-width", "2");
          g.appendChild(r);
        }
        while (g.childNodes.length > s.obstacles.length) {
          g.removeChild(g.lastChild!);
        }
        s.obstacles.forEach((o, i) => {
          const r = g.childNodes[i] as SVGRectElement;
          const oy = o.side === "floor" ? GAME_H - PAD - o.h : PAD;
          r.setAttribute("x", String(o.x));
          r.setAttribute("y", String(oy));
          r.setAttribute("width", String(o.w));
          r.setAttribute("height", String(o.h));
          r.setAttribute(
            "fill",
            o.side === "floor" ? "url(#obFloor)" : "url(#obCeil)",
          );
        });
      }

      if (starsRef.current) {
        const g = starsRef.current;
        while (g.childNodes.length < s.stars.length) {
          const c = document.createElementNS(svgNS, "circle");
          c.setAttribute("r", "10");
          c.setAttribute("fill", "url(#starGrad)");
          c.setAttribute("filter", "url(#glow)");
          g.appendChild(c);
        }
        while (g.childNodes.length > s.stars.length) {
          g.removeChild(g.lastChild!);
        }
        s.stars.forEach((st, i) => {
          const c = g.childNodes[i] as SVGCircleElement;
          c.setAttribute("cx", String(st.x));
          c.setAttribute(
            "cy",
            String(st.y + Math.sin((s.distance + i * 50) / 40) * 4),
          );
        });
      }

      if (particlesRef.current) {
        const g = particlesRef.current;
        while (g.childNodes.length < s.particles.length) {
          const c = document.createElementNS(svgNS, "circle");
          c.setAttribute("fill", "white");
          g.appendChild(c);
        }
        while (g.childNodes.length > s.particles.length) {
          g.removeChild(g.lastChild!);
        }
        s.particles.forEach((p, i) => {
          const c = g.childNodes[i] as SVGCircleElement;
          c.setAttribute("cx", String(p.x));
          c.setAttribute("cy", String(p.y));
          c.setAttribute("r", String(Math.max(1, p.life / 10)));
          c.setAttribute("opacity", String(p.life / 30));
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
        className="text-4xl md:text-6xl font-black tracking-tight mb-1 text-transparent bg-clip-text text-center"
        style={{ backgroundImage: "var(--gradient-flork)" }}
      >
        FLORK GRAVITY FLIP
      </h1>
      <p className="text-foreground/70 mb-5 text-sm md:text-base text-center max-w-md">
        Tekan{" "}
        <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20">
          Space
        </kbd>{" "}
        / klik untuk membalik gravitasi. Hindari rintangan, raih bintang!
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
        onClick={() => (running ? flip() : start())}
        className="relative w-full max-w-[900px] aspect-[9/5] rounded-3xl overflow-hidden border-2 border-white/20 cursor-pointer select-none"
        style={{
          background:
            "linear-gradient(180deg, oklch(0.22 0.1 280) 0%, oklch(0.32 0.16 310) 50%, oklch(0.22 0.1 260) 100%)",
          boxShadow: "var(--shadow-glow)",
        }}
      >
        <svg
          viewBox={`0 0 ${GAME_W} ${GAME_H}`}
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <linearGradient id="floorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.55 0.22 240)" />
              <stop offset="100%" stopColor="oklch(0.3 0.15 260)" />
            </linearGradient>
            <linearGradient id="ceilGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.3 0.15 320)" />
              <stop offset="100%" stopColor="oklch(0.55 0.25 340)" />
            </linearGradient>
            <linearGradient id="obFloor" x1="0" y1="1" x2="0" y2="0">
              <stop offset="0%" stopColor="oklch(0.7 0.22 240)" />
              <stop offset="100%" stopColor="oklch(0.55 0.28 300)" />
            </linearGradient>
            <linearGradient id="obCeil" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.7 0.28 350)" />
              <stop offset="100%" stopColor="oklch(0.55 0.28 300)" />
            </linearGradient>
            <radialGradient id="starGrad">
              <stop offset="0%" stopColor="white" />
              <stop offset="60%" stopColor="oklch(0.9 0.2 90)" />
              <stop offset="100%" stopColor="oklch(0.7 0.28 60)" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path
                d="M 50 0 L 0 0 0 50"
                fill="none"
                stroke="white"
                strokeOpacity="0.05"
                strokeWidth="1"
              />
            </pattern>
          </defs>

          <rect width={GAME_W} height={GAME_H} fill="url(#grid)" />

          {/* Background stars */}
          {Array.from({ length: 40 }).map((_, i) => {
            const x = (i * 137) % GAME_W;
            const y = (i * 71) % GAME_H;
            const r = ((i * 13) % 3) * 0.4 + 0.5;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r={r}
                fill="white"
                opacity={0.2 + ((i * 7) % 7) / 14}
              />
            );
          })}

          {/* Ceiling */}
          <rect x={0} y={0} width={GAME_W} height={PAD} fill="url(#ceilGrad)" />
          <line
            x1={0}
            y1={PAD}
            x2={GAME_W}
            y2={PAD}
            stroke="oklch(0.7 0.28 350)"
            strokeOpacity="0.6"
            strokeWidth="2"
          />
          {/* Floor */}
          <rect
            x={0}
            y={GAME_H - PAD}
            width={GAME_W}
            height={PAD}
            fill="url(#floorGrad)"
          />
          <line
            x1={0}
            y1={GAME_H - PAD}
            x2={GAME_W}
            y2={GAME_H - PAD}
            stroke="oklch(0.7 0.22 240)"
            strokeOpacity="0.6"
            strokeWidth="2"
          />

          {/* Obstacles */}
          <g ref={obstaclesRef} />

          {/* Stars */}
          <g ref={starsRef} />

          {/* Trail */}
          <path
            ref={trailRef}
            stroke="white"
            strokeOpacity="0.35"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            filter="url(#glow)"
          />

          {/* Particles */}
          <g ref={particlesRef} />

          {/* Flork */}
          <image
            ref={florkRef}
            href={florkImg}
            x={120}
            y={PAD}
            width={FLORK_SIZE}
            height={FLORK_SIZE}
            style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))" }}
          />
        </svg>

        {!running && !gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
            <div className="text-3xl md:text-5xl font-black mb-2 text-white text-center">
              Balik Dunia Flork!
            </div>
            <p className="text-white/70 mb-5 text-sm md:text-base text-center max-w-sm px-4">
              Lari di lantai & langit-langit. Klik untuk membalik gravitasi.
            </p>
            <button
              className="px-10 py-3 rounded-full font-bold text-white text-lg hover-scale"
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
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/55 backdrop-blur-sm animate-fade-in">
            <div className="text-4xl md:text-6xl font-black mb-2 text-white">
              GAME OVER
            </div>
            <div className="text-white/80 mb-5">
              Skor: <span className="font-bold">{score}</span> • Terbaik:{" "}
              <span className="font-bold">{best}</span>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                start();
              }}
              className="px-10 py-3 rounded-full font-bold text-white text-lg hover-scale"
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
        Bintang = +25 poin • Kecepatan meningkat seiring jarak
      </p>
    </main>
  );
}
