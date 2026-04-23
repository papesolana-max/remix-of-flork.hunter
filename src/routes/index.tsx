import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import florkImg from "@/assets/flork.png";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Flork Hunter — Petualangan Berburu" },
      {
        name: "description",
        content:
          "Petualangan top-down: jelajahi hutan misterius bersama Flork, buru monster, kumpulkan harta, dan bertahan dari gelombang musuh!",
      },
    ],
  }),
});

const GAME_W = 900;
const GAME_H = 560;
const FLORK_SIZE = 56;
const FLORK_SPEED = 3.6;
const PROJ_SPEED = 8;
const ENEMY_SPEED_BASE = 1.1;

type Vec = { x: number; y: number };
type Enemy = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  r: number;
  type: "slime" | "bat" | "boss";
  hitFlash: number;
};
type Projectile = { x: number; y: number; vx: number; vy: number; life: number };
type Loot = { x: number; y: number; type: "coin" | "heart"; bob: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Tree = { x: number; y: number; r: number };

function Index() {
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [hud, setHud] = useState({ hp: 5, gold: 0, wave: 1, kills: 0 });
  const [best, setBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("flork-hunter-best") || 0);
  });

  const stateRef = useRef({
    pos: { x: GAME_W / 2, y: GAME_H / 2 } as Vec,
    facing: { x: 1, y: 0 } as Vec,
    keys: {} as Record<string, boolean>,
    mouse: { x: GAME_W / 2, y: GAME_H / 2 } as Vec,
    enemies: [] as Enemy[],
    projectiles: [] as Projectile[],
    loot: [] as Loot[],
    particles: [] as Particle[],
    trees: [] as Tree[],
    hp: 5,
    iframes: 0,
    gold: 0,
    kills: 0,
    wave: 1,
    waveSpawned: 0,
    waveTarget: 5,
    waveCooldown: 0,
    fireCooldown: 0,
    running: false,
    tick: 0,
  });

  const florkRef = useRef<SVGImageElement>(null);
  const enemiesRef = useRef<SVGGElement>(null);
  const projRef = useRef<SVGGElement>(null);
  const lootRef = useRef<SVGGElement>(null);
  const particlesRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const start = useCallback(() => {
    const trees: Tree[] = [];
    for (let i = 0; i < 14; i++) {
      trees.push({
        x: 60 + Math.random() * (GAME_W - 120),
        y: 60 + Math.random() * (GAME_H - 120),
        r: 18 + Math.random() * 14,
      });
    }
    // clear center spawn
    const cx = GAME_W / 2,
      cy = GAME_H / 2;
    const filtered = trees.filter(
      (t) => (t.x - cx) ** 2 + (t.y - cy) ** 2 > 120 ** 2,
    );

    stateRef.current = {
      pos: { x: cx, y: cy },
      facing: { x: 1, y: 0 },
      keys: {},
      mouse: { x: cx + 50, y: cy },
      enemies: [],
      projectiles: [],
      loot: [],
      particles: [],
      trees: filtered,
      hp: 5,
      iframes: 0,
      gold: 0,
      kills: 0,
      wave: 1,
      waveSpawned: 0,
      waveTarget: 5,
      waveCooldown: 60,
      fireCooldown: 0,
      running: true,
      tick: 0,
    };
    setHud({ hp: 5, gold: 0, wave: 1, kills: 0 });
    setGameOver(false);
    setWon(false);
    setRunning(true);
  }, []);

  // input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key.toLowerCase()] = true;
      if (!stateRef.current.running && (e.code === "Space" || e.key === "Enter")) {
        start();
      }
    };
    const up = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key.toLowerCase()] = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [start]);

  const fire = useCallback(() => {
    const s = stateRef.current;
    if (!s.running || s.fireCooldown > 0) return;
    const dx = s.mouse.x - (s.pos.x + FLORK_SIZE / 2);
    const dy = s.mouse.y - (s.pos.y + FLORK_SIZE / 2);
    const len = Math.hypot(dx, dy) || 1;
    s.projectiles.push({
      x: s.pos.x + FLORK_SIZE / 2,
      y: s.pos.y + FLORK_SIZE / 2,
      vx: (dx / len) * PROJ_SPEED,
      vy: (dy / len) * PROJ_SPEED,
      life: 70,
    });
    s.fireCooldown = 14;
  }, []);

  const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * GAME_W;
    const y = ((e.clientY - rect.top) / rect.height) * GAME_H;
    stateRef.current.mouse = { x, y };
  }, []);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const svgNS = "http://www.w3.org/2000/svg";

    const collidesTree = (x: number, y: number, r: number) => {
      for (const t of stateRef.current.trees) {
        const dx = x - t.x;
        const dy = y - t.y;
        if (dx * dx + dy * dy < (t.r + r) ** 2) return true;
      }
      return false;
    };

    const spawnEnemy = (s: typeof stateRef.current) => {
      // spawn from edge
      const edge = Math.floor(Math.random() * 4);
      let x = 0,
        y = 0;
      if (edge === 0) {
        x = Math.random() * GAME_W;
        y = -20;
      } else if (edge === 1) {
        x = GAME_W + 20;
        y = Math.random() * GAME_H;
      } else if (edge === 2) {
        x = Math.random() * GAME_W;
        y = GAME_H + 20;
      } else {
        x = -20;
        y = Math.random() * GAME_H;
      }
      const isBoss = s.wave >= 5 && s.waveSpawned === 0 && Math.random() < 0.5;
      const isBat = !isBoss && s.wave >= 2 && Math.random() < 0.35;
      if (isBoss) {
        s.enemies.push({
          x,
          y,
          hp: 12 + s.wave * 2,
          maxHp: 12 + s.wave * 2,
          r: 32,
          type: "boss",
          hitFlash: 0,
        });
      } else if (isBat) {
        s.enemies.push({
          x,
          y,
          hp: 2,
          maxHp: 2,
          r: 14,
          type: "bat",
          hitFlash: 0,
        });
      } else {
        s.enemies.push({
          x,
          y,
          hp: 2 + Math.floor(s.wave / 2),
          maxHp: 2 + Math.floor(s.wave / 2),
          r: 18,
          type: "slime",
          hitFlash: 0,
        });
      }
    };

    const burst = (s: typeof stateRef.current, x: number, y: number, color: string, n = 10) => {
      for (let i = 0; i < n; i++) {
        s.particles.push({
          x,
          y,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          life: 22 + Math.random() * 12,
          color,
        });
      }
    };

    const loop = () => {
      const s = stateRef.current;
      if (!s.running) return;
      s.tick++;

      // movement
      let dx = 0,
        dy = 0;
      if (s.keys["w"] || s.keys["arrowup"]) dy -= 1;
      if (s.keys["s"] || s.keys["arrowdown"]) dy += 1;
      if (s.keys["a"] || s.keys["arrowleft"]) dx -= 1;
      if (s.keys["d"] || s.keys["arrowright"]) dx += 1;
      if (dx || dy) {
        const l = Math.hypot(dx, dy);
        dx /= l;
        dy /= l;
        const nx = s.pos.x + dx * FLORK_SPEED;
        const ny = s.pos.y + dy * FLORK_SPEED;
        const cx = nx + FLORK_SIZE / 2;
        const cy = ny + FLORK_SIZE / 2;
        if (
          cx > 20 &&
          cx < GAME_W - 20 &&
          cy > 20 &&
          cy < GAME_H - 20 &&
          !collidesTree(cx, cy, FLORK_SIZE / 2 - 6)
        ) {
          s.pos.x = nx;
          s.pos.y = ny;
        }
      }

      // facing toward mouse
      const fx = s.mouse.x - (s.pos.x + FLORK_SIZE / 2);
      s.facing.x = fx >= 0 ? 1 : -1;

      // auto-fire on space hold or click via fireCooldown
      if (s.keys[" "] || s.keys["space"]) fire();
      if (s.fireCooldown > 0) s.fireCooldown--;
      if (s.iframes > 0) s.iframes--;

      // wave control
      if (s.waveCooldown > 0) {
        s.waveCooldown--;
      } else if (s.waveSpawned < s.waveTarget) {
        if (s.tick % 45 === 0) {
          spawnEnemy(s);
          s.waveSpawned++;
        }
      } else if (s.enemies.length === 0) {
        // next wave
        s.wave++;
        if (s.wave > 7) {
          s.running = false;
          setRunning(false);
          setWon(true);
          const finalScore = s.gold + s.kills * 10;
          setBest((b) => {
            const nb = Math.max(b, finalScore);
            localStorage.setItem("flork-hunter-best", String(nb));
            return nb;
          });
          return;
        }
        s.waveSpawned = 0;
        s.waveTarget = 4 + s.wave * 2;
        s.waveCooldown = 90;
      }

      // projectiles
      for (const p of s.projectiles) {
        p.x += p.vx;
        p.y += p.vy;
        p.life--;
      }
      s.projectiles = s.projectiles.filter(
        (p) => p.life > 0 && p.x > -10 && p.x < GAME_W + 10 && p.y > -10 && p.y < GAME_H + 10,
      );

      // enemies move toward flork
      const fcx = s.pos.x + FLORK_SIZE / 2;
      const fcy = s.pos.y + FLORK_SIZE / 2;
      for (const e of s.enemies) {
        const ex = fcx - e.x;
        const ey = fcy - e.y;
        const len = Math.hypot(ex, ey) || 1;
        const sp =
          e.type === "bat"
            ? ENEMY_SPEED_BASE * 1.6
            : e.type === "boss"
              ? ENEMY_SPEED_BASE * 0.7
              : ENEMY_SPEED_BASE;
        e.x += (ex / len) * sp;
        e.y += (ey / len) * sp;
        if (e.hitFlash > 0) e.hitFlash--;
      }

      // projectile vs enemy
      for (const p of s.projectiles) {
        for (const e of s.enemies) {
          const dx2 = p.x - e.x;
          const dy2 = p.y - e.y;
          if (dx2 * dx2 + dy2 * dy2 < e.r * e.r) {
            e.hp--;
            e.hitFlash = 6;
            p.life = 0;
            burst(s, p.x, p.y, "oklch(0.85 0.18 60)", 5);
            if (e.hp <= 0) {
              s.kills++;
              burst(s, e.x, e.y, "oklch(0.7 0.28 350)", 14);
              // drop loot
              const r = Math.random();
              if (e.type === "boss") {
                for (let i = 0; i < 3; i++) {
                  s.loot.push({
                    x: e.x + (Math.random() - 0.5) * 30,
                    y: e.y + (Math.random() - 0.5) * 30,
                    type: "coin",
                    bob: Math.random() * Math.PI * 2,
                  });
                }
                s.loot.push({ x: e.x, y: e.y, type: "heart", bob: 0 });
              } else if (r < 0.2) {
                s.loot.push({ x: e.x, y: e.y, type: "heart", bob: 0 });
              } else {
                s.loot.push({ x: e.x, y: e.y, type: "coin", bob: Math.random() * Math.PI * 2 });
              }
            }
            break;
          }
        }
      }
      s.projectiles = s.projectiles.filter((p) => p.life > 0);
      s.enemies = s.enemies.filter((e) => e.hp > 0);

      // enemy vs flork
      if (s.iframes === 0) {
        for (const e of s.enemies) {
          const dx2 = fcx - e.x;
          const dy2 = fcy - e.y;
          if (dx2 * dx2 + dy2 * dy2 < (e.r + FLORK_SIZE / 2 - 8) ** 2) {
            s.hp--;
            s.iframes = 60;
            burst(s, fcx, fcy, "oklch(0.65 0.25 25)", 12);
            if (s.hp <= 0) {
              s.running = false;
              setRunning(false);
              setGameOver(true);
              const finalScore = s.gold + s.kills * 10;
              setBest((b) => {
                const nb = Math.max(b, finalScore);
                localStorage.setItem("flork-hunter-best", String(nb));
                return nb;
              });
              return;
            }
            break;
          }
        }
      }

      // loot pickup
      for (const l of s.loot) {
        l.bob += 0.15;
        const dx2 = fcx - l.x;
        const dy2 = fcy - l.y;
        if (dx2 * dx2 + dy2 * dy2 < 30 * 30) {
          if (l.type === "coin") {
            s.gold += 5;
            burst(s, l.x, l.y, "oklch(0.9 0.2 90)", 6);
          } else {
            s.hp = Math.min(5, s.hp + 1);
            burst(s, l.x, l.y, "oklch(0.7 0.25 25)", 8);
          }
          (l as Loot & { taken?: boolean }).taken = true;
        }
      }
      s.loot = s.loot.filter((l) => !(l as Loot & { taken?: boolean }).taken);

      // particles
      for (const p of s.particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.94;
        p.vy *= 0.94;
        p.life--;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

      // ===== render =====
      if (florkRef.current) {
        florkRef.current.setAttribute("x", String(s.pos.x));
        florkRef.current.setAttribute("y", String(s.pos.y));
        const cx = s.pos.x + FLORK_SIZE / 2;
        const cy = s.pos.y + FLORK_SIZE / 2;
        florkRef.current.setAttribute(
          "transform",
          `translate(${cx} ${cy}) scale(${s.facing.x} 1) translate(${-cx} ${-cy})`,
        );
        florkRef.current.setAttribute("opacity", s.iframes > 0 && s.tick % 6 < 3 ? "0.4" : "1");
      }

      if (enemiesRef.current) {
        const g = enemiesRef.current;
        // rebuild for simplicity (small N)
        while (g.firstChild) g.removeChild(g.firstChild);
        for (const e of s.enemies) {
          const grp = document.createElementNS(svgNS, "g");
          grp.setAttribute("transform", `translate(${e.x} ${e.y})`);
          const body = document.createElementNS(svgNS, "circle");
          body.setAttribute("r", String(e.r));
          body.setAttribute(
            "fill",
            e.type === "boss"
              ? "url(#bossGrad)"
              : e.type === "bat"
                ? "url(#batGrad)"
                : "url(#slimeGrad)",
          );
          body.setAttribute("stroke", e.hitFlash > 0 ? "white" : "rgba(0,0,0,0.4)");
          body.setAttribute("stroke-width", e.hitFlash > 0 ? "3" : "2");
          grp.appendChild(body);
          // eyes
          const eye = (ex: number) => {
            const c = document.createElementNS(svgNS, "circle");
            c.setAttribute("cx", String(ex));
            c.setAttribute("cy", "-3");
            c.setAttribute("r", "3");
            c.setAttribute("fill", "white");
            grp.appendChild(c);
            const p = document.createElementNS(svgNS, "circle");
            p.setAttribute("cx", String(ex));
            p.setAttribute("cy", "-2");
            p.setAttribute("r", "1.5");
            p.setAttribute("fill", "black");
            grp.appendChild(p);
          };
          eye(-e.r * 0.35);
          eye(e.r * 0.35);
          // hp bar
          if (e.hp < e.maxHp) {
            const bw = e.r * 1.6;
            const bg = document.createElementNS(svgNS, "rect");
            bg.setAttribute("x", String(-bw / 2));
            bg.setAttribute("y", String(-e.r - 10));
            bg.setAttribute("width", String(bw));
            bg.setAttribute("height", "4");
            bg.setAttribute("fill", "rgba(0,0,0,0.5)");
            bg.setAttribute("rx", "2");
            grp.appendChild(bg);
            const fg = document.createElementNS(svgNS, "rect");
            fg.setAttribute("x", String(-bw / 2));
            fg.setAttribute("y", String(-e.r - 10));
            fg.setAttribute("width", String(bw * (e.hp / e.maxHp)));
            fg.setAttribute("height", "4");
            fg.setAttribute("fill", "oklch(0.75 0.22 140)");
            fg.setAttribute("rx", "2");
            grp.appendChild(fg);
          }
          g.appendChild(grp);
        }
      }

      if (projRef.current) {
        const g = projRef.current;
        while (g.childNodes.length < s.projectiles.length) {
          const c = document.createElementNS(svgNS, "circle");
          c.setAttribute("r", "5");
          c.setAttribute("fill", "url(#projGrad)");
          c.setAttribute("filter", "url(#glow)");
          g.appendChild(c);
        }
        while (g.childNodes.length > s.projectiles.length) g.removeChild(g.lastChild!);
        s.projectiles.forEach((p, i) => {
          const c = g.childNodes[i] as SVGCircleElement;
          c.setAttribute("cx", String(p.x));
          c.setAttribute("cy", String(p.y));
        });
      }

      if (lootRef.current) {
        const g = lootRef.current;
        while (g.firstChild) g.removeChild(g.firstChild);
        for (const l of s.loot) {
          const yo = Math.sin(l.bob) * 3;
          if (l.type === "coin") {
            const c = document.createElementNS(svgNS, "circle");
            c.setAttribute("cx", String(l.x));
            c.setAttribute("cy", String(l.y + yo));
            c.setAttribute("r", "8");
            c.setAttribute("fill", "url(#coinGrad)");
            c.setAttribute("filter", "url(#glow)");
            c.setAttribute("stroke", "oklch(0.5 0.2 70)");
            c.setAttribute("stroke-width", "1.5");
            g.appendChild(c);
          } else {
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute(
              "d",
              `M ${l.x} ${l.y + yo + 5} C ${l.x - 12} ${l.y + yo - 5}, ${l.x - 8} ${l.y + yo - 12}, ${l.x} ${l.y + yo - 4} C ${l.x + 8} ${l.y + yo - 12}, ${l.x + 12} ${l.y + yo - 5}, ${l.x} ${l.y + yo + 5} Z`,
            );
            path.setAttribute("fill", "oklch(0.7 0.25 25)");
            path.setAttribute("stroke", "white");
            path.setAttribute("stroke-width", "1.5");
            path.setAttribute("filter", "url(#glow)");
            g.appendChild(path);
          }
        }
      }

      if (particlesRef.current) {
        const g = particlesRef.current;
        while (g.childNodes.length < s.particles.length) {
          const c = document.createElementNS(svgNS, "circle");
          g.appendChild(c);
        }
        while (g.childNodes.length > s.particles.length) g.removeChild(g.lastChild!);
        s.particles.forEach((p, i) => {
          const c = g.childNodes[i] as SVGCircleElement;
          c.setAttribute("cx", String(p.x));
          c.setAttribute("cy", String(p.y));
          c.setAttribute("r", String(Math.max(1, p.life / 8)));
          c.setAttribute("fill", p.color);
          c.setAttribute("opacity", String(Math.min(1, p.life / 25)));
        });
      }

      // sync HUD occasionally
      if (s.tick % 6 === 0) {
        setHud({ hp: s.hp, gold: s.gold, wave: s.wave, kills: s.kills });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, fire]);

  const finalScore = hud.gold + hud.kills * 10;

  return (
    <main
      className="min-h-screen w-full flex flex-col items-center justify-center px-4 py-6"
      style={{ background: "var(--gradient-sky)" }}
    >
      <h1
        className="text-4xl md:text-6xl font-black tracking-tight mb-1 text-transparent bg-clip-text text-center"
        style={{ backgroundImage: "var(--gradient-flork)" }}
      >
        FLORK HUNTER
      </h1>
      <p className="text-foreground/70 mb-4 text-sm md:text-base text-center max-w-xl">
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">WASD</kbd> bergerak ·{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">Klik</kbd> /{" "}
        <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">Space</kbd> tembak ke arah kursor
      </p>

      {/* HUD */}
      <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 mb-3 text-foreground">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="text-2xl transition-transform"
              style={{
                filter: i < hud.hp ? "none" : "grayscale(1) opacity(0.3)",
                transform: i < hud.hp ? "scale(1)" : "scale(0.85)",
              }}
            >
              ❤️
            </span>
          ))}
        </div>
        <div className="text-lg font-mono">
          🪙 <span className="font-bold">{hud.gold}</span>
        </div>
        <div className="text-lg font-mono">
          ⚔️ <span className="font-bold">{hud.kills}</span>
        </div>
        <div className="text-lg font-bold px-3 py-1 rounded-full" style={{ background: "var(--gradient-flork)" }}>
          Wave {hud.wave}/7
        </div>
        <div className="text-sm opacity-70">
          Best: <span className="font-mono font-bold">{best}</span>
        </div>
      </div>

      <div
        className="relative w-full max-w-[900px] aspect-[9/5.6] rounded-3xl overflow-hidden border-2 border-white/20 select-none"
        style={{ boxShadow: "var(--shadow-glow)" }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${GAME_W} ${GAME_H}`}
          className="absolute inset-0 w-full h-full cursor-crosshair"
          preserveAspectRatio="xMidYMid slice"
          onMouseMove={onMove}
          onMouseDown={() => (running ? fire() : start())}
        >
          <defs>
            <radialGradient id="forestBg" cx="50%" cy="50%" r="80%">
              <stop offset="0%" stopColor="oklch(0.42 0.12 160)" />
              <stop offset="100%" stopColor="oklch(0.22 0.08 270)" />
            </radialGradient>
            <radialGradient id="slimeGrad">
              <stop offset="0%" stopColor="oklch(0.85 0.2 140)" />
              <stop offset="100%" stopColor="oklch(0.45 0.18 150)" />
            </radialGradient>
            <radialGradient id="batGrad">
              <stop offset="0%" stopColor="oklch(0.55 0.25 320)" />
              <stop offset="100%" stopColor="oklch(0.25 0.15 290)" />
            </radialGradient>
            <radialGradient id="bossGrad">
              <stop offset="0%" stopColor="oklch(0.7 0.28 25)" />
              <stop offset="100%" stopColor="oklch(0.35 0.2 15)" />
            </radialGradient>
            <radialGradient id="projGrad">
              <stop offset="0%" stopColor="white" />
              <stop offset="100%" stopColor="oklch(0.7 0.28 60)" />
            </radialGradient>
            <radialGradient id="coinGrad">
              <stop offset="0%" stopColor="oklch(0.95 0.18 95)" />
              <stop offset="100%" stopColor="oklch(0.65 0.2 70)" />
            </radialGradient>
            <radialGradient id="treeGrad">
              <stop offset="0%" stopColor="oklch(0.45 0.15 150)" />
              <stop offset="100%" stopColor="oklch(0.2 0.1 160)" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="2.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <pattern id="grass" width="30" height="30" patternUnits="userSpaceOnUse">
              <rect width="30" height="30" fill="url(#forestBg)" />
              <circle cx="5" cy="8" r="0.8" fill="white" opacity="0.06" />
              <circle cx="22" cy="20" r="1" fill="white" opacity="0.04" />
            </pattern>
          </defs>

          <rect width={GAME_W} height={GAME_H} fill="url(#grass)" />

          {/* Vignette via overlay */}
          <rect width={GAME_W} height={GAME_H} fill="url(#forestBg)" opacity="0.4" />

          {/* Trees */}
          {stateRef.current.trees.map((t, i) => (
            <g key={i}>
              <ellipse
                cx={t.x}
                cy={t.y + t.r * 0.6}
                rx={t.r * 0.9}
                ry={t.r * 0.25}
                fill="black"
                opacity="0.35"
              />
              <circle cx={t.x} cy={t.y} r={t.r} fill="url(#treeGrad)" stroke="rgba(0,0,0,0.4)" strokeWidth="2" />
            </g>
          ))}

          {/* Loot */}
          <g ref={lootRef} />

          {/* Projectiles */}
          <g ref={projRef} />

          {/* Enemies */}
          <g ref={enemiesRef} />

          {/* Flork */}
          <image
            ref={florkRef}
            href={florkImg}
            x={GAME_W / 2 - FLORK_SIZE / 2}
            y={GAME_H / 2 - FLORK_SIZE / 2}
            width={FLORK_SIZE}
            height={FLORK_SIZE}
            style={{ filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.5))" }}
          />

          {/* Particles */}
          <g ref={particlesRef} />

          {/* Crosshair */}
          {running && (
            <g pointerEvents="none">
              <circle
                cx={stateRef.current.mouse.x}
                cy={stateRef.current.mouse.y}
                r="10"
                fill="none"
                stroke="white"
                strokeOpacity="0.7"
                strokeWidth="1.5"
              />
              <circle
                cx={stateRef.current.mouse.x}
                cy={stateRef.current.mouse.y}
                r="2"
                fill="white"
                opacity="0.8"
              />
            </g>
          )}
        </svg>

        {!running && !gameOver && !won && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/45 backdrop-blur-sm animate-fade-in">
            <div className="text-3xl md:text-5xl font-black mb-2 text-white text-center px-4">
              Petualangan Flork
            </div>
            <p className="text-white/70 mb-5 text-sm md:text-base text-center max-w-md px-4">
              Selamat datang di hutan misterius. Buru monster, kumpulkan koin, dan bertahan 7 gelombang!
            </p>
            <button
              className="px-10 py-3 rounded-full font-bold text-white text-lg hover-scale"
              style={{ background: "var(--gradient-flork)", boxShadow: "var(--shadow-glow)" }}
            >
              MULAI BERBURU
            </button>
          </div>
        )}

        {gameOver && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="text-4xl md:text-6xl font-black mb-2 text-white">KALAH</div>
            <div className="text-white/80 mb-1">
              Gelombang {hud.wave} • {hud.kills} kill • 🪙 {hud.gold}
            </div>
            <div className="text-white/60 mb-5 text-sm">
              Skor: <span className="font-bold text-white">{finalScore}</span> · Best: {best}
            </div>
            <button
              onClick={start}
              className="px-10 py-3 rounded-full font-bold text-white text-lg hover-scale"
              style={{ background: "var(--gradient-flork)", boxShadow: "var(--shadow-glow)" }}
            >
              COBA LAGI
            </button>
          </div>
        )}

        {won && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="text-4xl md:text-6xl font-black mb-2 text-transparent bg-clip-text" style={{ backgroundImage: "var(--gradient-flork)" }}>
              MENANG! 🏆
            </div>
            <div className="text-white/80 mb-1">
              {hud.kills} monster ditaklukkan • 🪙 {hud.gold}
            </div>
            <div className="text-white/60 mb-5 text-sm">
              Skor akhir: <span className="font-bold text-white">{finalScore}</span> · Best: {best}
            </div>
            <button
              onClick={start}
              className="px-10 py-3 rounded-full font-bold text-white text-lg hover-scale"
              style={{ background: "var(--gradient-flork)", boxShadow: "var(--shadow-glow)" }}
            >
              MAIN LAGI
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-foreground/50 text-center">
        🪙 Koin = +5 · ❤️ Heart = +1 HP · Boss muncul di gelombang 5+
      </p>
    </main>
  );
}
