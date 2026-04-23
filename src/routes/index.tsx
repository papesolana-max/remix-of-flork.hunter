import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import florkImg from "@/assets/flork.png";
import mapImg from "@/assets/forest-map.jpg";
import slimeImg from "@/assets/enemy-slime.png";
import batImg from "@/assets/enemy-bat.png";
import bossImg from "@/assets/enemy-boss.png";
import treeImg from "@/assets/tree.png";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Flork Hunter — Forest Adventure" },
      {
        name: "description",
        content:
          "A top-down hunting adventure: explore the mystical forest with Flork, defeat monsters, collect loot, and climb the realtime leaderboard!",
      },
    ],
  }),
});

const GAME_W = 900;
const GAME_H = 560;
const FLORK_SIZE = 64;
const FLORK_SPEED = 2.2;
const PROJ_SPEED = 5.5;
const ENEMY_SPEED_BASE = 0.55;

type Vec = { x: number; y: number };
type Enemy = {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  r: number;
  type: "slime" | "bat" | "boss";
  hitFlash: number;
  bob: number;
};
type Projectile = { x: number; y: number; vx: number; vy: number; life: number };
type Loot = { x: number; y: number; type: "coin" | "heart"; bob: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Tree = { x: number; y: number; r: number };
type LBRow = {
  id: string;
  username: string;
  wallet: string;
  score: number;
  wave: number;
  kills: number;
  created_at: string;
};

function shortWallet(w: string) {
  if (w.length <= 10) return w;
  return `${w.slice(0, 5)}…${w.slice(-4)}`;
}

function Index() {
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);
  const [hud, setHud] = useState({ hp: 5, gold: 0, wave: 1, kills: 0 });
  const [best, setBest] = useState(() => {
    if (typeof window === "undefined") return 0;
    return Number(localStorage.getItem("flork-hunter-best") || 0);
  });
  const [leaderboard, setLeaderboard] = useState<LBRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({ username: "", wallet: "" });

  const stateRef = useRef({
    pos: { x: GAME_W / 2, y: GAME_H / 2 } as Vec,
    facing: { x: 1, y: 0 } as Vec,
    moveDir: { x: 0, y: 0 } as Vec,
    keys: {} as Record<string, boolean>,
    mouse: { x: GAME_W / 2 + 50, y: GAME_H / 2 } as Vec,
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
    walkPhase: 0,
  });

  const florkRef = useRef<SVGGElement>(null);
  const enemiesRef = useRef<SVGGElement>(null);
  const projRef = useRef<SVGGElement>(null);
  const lootRef = useRef<SVGGElement>(null);
  const particlesRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Load leaderboard + realtime
  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("leaderboard")
        .select("*")
        .order("score", { ascending: false })
        .limit(10);
      if (active && data) setLeaderboard(data as LBRow[]);
    };
    load();

    const channel = supabase
      .channel("leaderboard-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leaderboard" },
        () => load(),
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const start = useCallback(() => {
    const trees: Tree[] = [];
    for (let i = 0; i < 10; i++) {
      trees.push({
        x: 80 + Math.random() * (GAME_W - 160),
        y: 80 + Math.random() * (GAME_H - 160),
        r: 26 + Math.random() * 14,
      });
    }
    const cx = GAME_W / 2,
      cy = GAME_H / 2;
    const filtered = trees.filter(
      (t) => (t.x - cx) ** 2 + (t.y - cy) ** 2 > 130 ** 2,
    );

    stateRef.current = {
      pos: { x: cx, y: cy },
      facing: { x: 1, y: 0 },
      moveDir: { x: 0, y: 0 },
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
      walkPhase: 0,
    };
    setHud({ hp: 5, gold: 0, wave: 1, kills: 0 });
    setGameOver(false);
    setWon(false);
    setSubmitted(false);
    setSubmitError(null);
    setRunning(true);
  }, []);

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key.toLowerCase()] = true;
      if (!stateRef.current.running && (e.code === "Space" || e.key === "Enter")) {
        if (!gameOver && !won) start();
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
  }, [start, gameOver, won]);

  const fire = useCallback(() => {
    const s = stateRef.current;
    if (!s.running || s.fireCooldown > 0) return;
    const dx = s.mouse.x - s.pos.x;
    const dy = s.mouse.y - s.pos.y;
    const len = Math.hypot(dx, dy) || 1;
    s.projectiles.push({
      x: s.pos.x,
      y: s.pos.y,
      vx: (dx / len) * PROJ_SPEED,
      vy: (dy / len) * PROJ_SPEED,
      life: 90,
    });
    s.fireCooldown = 22;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * GAME_W;
    const y = ((e.clientY - rect.top) / rect.height) * GAME_H;
    stateRef.current.mouse = { x, y };
  }, []);

  // Joystick (mobile)
  const joyRef = useRef<HTMLDivElement>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0, active: false });
  const onJoyStart = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateJoy(e);
  };
  const onJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!(e.buttons & 1) && e.pointerType === "mouse") return;
    updateJoy(e);
  };
  const onJoyEnd = () => {
    setJoyKnob({ x: 0, y: 0, active: false });
    stateRef.current.moveDir = { x: 0, y: 0 };
  };
  const updateJoy = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = joyRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const max = rect.width / 2;
    const len = Math.hypot(dx, dy);
    const k = len > max ? max / len : 1;
    const kx = dx * k;
    const ky = dy * k;
    setJoyKnob({ x: kx, y: ky, active: true });
    const nlen = Math.hypot(kx, ky) / max;
    if (nlen < 0.15) {
      stateRef.current.moveDir = { x: 0, y: 0 };
    } else {
      const l = Math.hypot(kx, ky) || 1;
      stateRef.current.moveDir = { x: kx / l, y: ky / l };
    }
    // also aim toward joystick direction if no mouse
    if (e.pointerType !== "mouse" && nlen > 0.2) {
      const l = Math.hypot(kx, ky) || 1;
      stateRef.current.mouse = {
        x: stateRef.current.pos.x + (kx / l) * 80,
        y: stateRef.current.pos.y + (ky / l) * 80,
      };
    }
  };

  // game loop
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const svgNS = "http://www.w3.org/2000/svg";

    const collidesTree = (x: number, y: number, r: number) => {
      for (const t of stateRef.current.trees) {
        const dx = x - t.x;
        const dy = y - t.y;
        if (dx * dx + dy * dy < (t.r * 0.55 + r) ** 2) return true;
      }
      return false;
    };

    const spawnEnemy = (s: typeof stateRef.current) => {
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
          x, y,
          hp: 14 + s.wave * 2,
          maxHp: 14 + s.wave * 2,
          r: 36,
          type: "boss",
          hitFlash: 0,
          bob: Math.random() * Math.PI * 2,
        });
      } else if (isBat) {
        s.enemies.push({
          x, y,
          hp: 2,
          maxHp: 2,
          r: 18,
          type: "bat",
          hitFlash: 0,
          bob: Math.random() * Math.PI * 2,
        });
      } else {
        s.enemies.push({
          x, y,
          hp: 2 + Math.floor(s.wave / 2),
          maxHp: 2 + Math.floor(s.wave / 2),
          r: 22,
          type: "slime",
          hitFlash: 0,
          bob: Math.random() * Math.PI * 2,
        });
      }
    };

    const burst = (s: typeof stateRef.current, x: number, y: number, color: string, n = 10) => {
      for (let i = 0; i < n; i++) {
        s.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
          life: 22 + Math.random() * 12,
          color,
        });
      }
    };

    const finishGame = (won: boolean) => {
      const s = stateRef.current;
      s.running = false;
      setRunning(false);
      const finalScore = s.gold + s.kills * 10;
      setBest((b) => {
        const nb = Math.max(b, finalScore);
        if (typeof window !== "undefined") localStorage.setItem("flork-hunter-best", String(nb));
        return nb;
      });
      if (won) setWon(true);
      else setGameOver(true);
    };

    const loop = () => {
      const s = stateRef.current;
      if (!s.running) return;
      s.tick++;

      // movement
      let dx = 0, dy = 0;
      if (s.keys["w"] || s.keys["arrowup"]) dy -= 1;
      if (s.keys["s"] || s.keys["arrowdown"]) dy += 1;
      if (s.keys["a"] || s.keys["arrowleft"]) dx -= 1;
      if (s.keys["d"] || s.keys["arrowright"]) dx += 1;
      if (dx || dy) {
        const l = Math.hypot(dx, dy);
        dx /= l; dy /= l;
      } else {
        dx = s.moveDir.x;
        dy = s.moveDir.y;
      }

      const moving = dx !== 0 || dy !== 0;
      if (moving) {
        const nx = s.pos.x + dx * FLORK_SPEED;
        const ny = s.pos.y + dy * FLORK_SPEED;
        if (nx > 24 && nx < GAME_W - 24 && !collidesTree(nx, s.pos.y, FLORK_SIZE / 2 - 14)) {
          s.pos.x = nx;
        }
        if (ny > 24 && ny < GAME_H - 24 && !collidesTree(s.pos.x, ny, FLORK_SIZE / 2 - 14)) {
          s.pos.y = ny;
        }
        s.walkPhase += 0.25;
      } else {
        s.walkPhase *= 0.9;
      }

      const fx = s.mouse.x - s.pos.x;
      s.facing.x = fx >= 0 ? 1 : -1;

      if (s.keys[" "] || s.keys["space"]) fire();
      if (s.fireCooldown > 0) s.fireCooldown--;
      if (s.iframes > 0) s.iframes--;

      // wave control
      if (s.waveCooldown > 0) {
        s.waveCooldown--;
      } else if (s.waveSpawned < s.waveTarget) {
        if (s.tick % 70 === 0) {
          spawnEnemy(s);
          s.waveSpawned++;
        }
      } else if (s.enemies.length === 0) {
        s.wave++;
        if (s.wave > 7) {
          finishGame(true);
          return;
        }
        s.waveSpawned = 0;
        s.waveTarget = 4 + s.wave * 2;
        s.waveCooldown = 110;
      }

      // projectiles
      for (const p of s.projectiles) {
        p.x += p.vx; p.y += p.vy; p.life--;
      }
      s.projectiles = s.projectiles.filter(
        (p) => p.life > 0 && p.x > -10 && p.x < GAME_W + 10 && p.y > -10 && p.y < GAME_H + 10,
      );

      // enemies move
      for (const e of s.enemies) {
        const ex = s.pos.x - e.x;
        const ey = s.pos.y - e.y;
        const len = Math.hypot(ex, ey) || 1;
        const sp =
          e.type === "bat"
            ? ENEMY_SPEED_BASE * 1.7
            : e.type === "boss"
              ? ENEMY_SPEED_BASE * 0.6
              : ENEMY_SPEED_BASE;
        e.x += (ex / len) * sp;
        e.y += (ey / len) * sp;
        e.bob += 0.15;
        if (e.hitFlash > 0) e.hitFlash--;
      }

      // proj vs enemy
      for (const p of s.projectiles) {
        for (const e of s.enemies) {
          const dx2 = p.x - e.x;
          const dy2 = p.y - e.y;
          if (dx2 * dx2 + dy2 * dy2 < e.r * e.r) {
            e.hp--;
            e.hitFlash = 6;
            p.life = 0;
            burst(s, p.x, p.y, "#ffd166", 5);
            if (e.hp <= 0) {
              s.kills++;
              burst(s, e.x, e.y, "#ff6bd6", 14);
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
              } else if (Math.random() < 0.2) {
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
          const dx2 = s.pos.x - e.x;
          const dy2 = s.pos.y - e.y;
          if (dx2 * dx2 + dy2 * dy2 < (e.r + FLORK_SIZE / 2 - 12) ** 2) {
            s.hp--;
            s.iframes = 70;
            burst(s, s.pos.x, s.pos.y, "#ef4444", 12);
            if (s.hp <= 0) {
              finishGame(false);
              return;
            }
            break;
          }
        }
      }

      // loot pickup
      for (const l of s.loot) {
        l.bob += 0.15;
        const dx2 = s.pos.x - l.x;
        const dy2 = s.pos.y - l.y;
        if (dx2 * dx2 + dy2 * dy2 < 32 * 32) {
          if (l.type === "coin") {
            s.gold += 5;
            burst(s, l.x, l.y, "#fde047", 6);
          } else {
            s.hp = Math.min(5, s.hp + 1);
            burst(s, l.x, l.y, "#f87171", 8);
          }
          (l as Loot & { taken?: boolean }).taken = true;
        }
      }
      s.loot = s.loot.filter((l) => !(l as Loot & { taken?: boolean }).taken);

      // particles
      for (const p of s.particles) {
        p.x += p.vx; p.y += p.vy;
        p.vx *= 0.94; p.vy *= 0.94;
        p.life--;
      }
      s.particles = s.particles.filter((p) => p.life > 0);

      // ===== render flork with walk + facing =====
      if (florkRef.current) {
        const bob = Math.sin(s.walkPhase) * 4;
        const tilt = Math.sin(s.walkPhase) * 6;
        const dim = s.iframes > 0 && s.tick % 6 < 3 ? "0.4" : "1";
        florkRef.current.setAttribute(
          "transform",
          `translate(${s.pos.x} ${s.pos.y + bob}) scale(${s.facing.x} 1) rotate(${tilt})`,
        );
        florkRef.current.setAttribute("opacity", dim);
      }

      // enemies
      if (enemiesRef.current) {
        const g = enemiesRef.current;
        while (g.firstChild) g.removeChild(g.firstChild);
        for (const e of s.enemies) {
          const grp = document.createElementNS(svgNS, "g");
          const bob = Math.sin(e.bob) * (e.type === "bat" ? 5 : 3);
          const facing = s.pos.x < e.x ? -1 : 1;
          grp.setAttribute(
            "transform",
            `translate(${e.x} ${e.y + bob}) scale(${facing} 1)`,
          );
          // shadow
          const sh = document.createElementNS(svgNS, "ellipse");
          sh.setAttribute("cx", "0");
          sh.setAttribute("cy", String(e.r * 0.7 - bob));
          sh.setAttribute("rx", String(e.r * 0.7));
          sh.setAttribute("ry", String(e.r * 0.22));
          sh.setAttribute("fill", "rgba(0,0,0,0.4)");
          grp.appendChild(sh);
          // sprite
          const img = document.createElementNS(svgNS, "image");
          const size = e.r * 2.4;
          img.setAttribute("href",
            e.type === "boss" ? bossImg : e.type === "bat" ? batImg : slimeImg);
          img.setAttribute("x", String(-size / 2));
          img.setAttribute("y", String(-size / 2));
          img.setAttribute("width", String(size));
          img.setAttribute("height", String(size));
          if (e.hitFlash > 0) {
            img.setAttribute("style", "filter: brightness(2.5) drop-shadow(0 0 6px white)");
          } else {
            img.setAttribute("style", "filter: drop-shadow(0 4px 4px rgba(0,0,0,0.45))");
          }
          grp.appendChild(img);
          // hp bar
          if (e.hp < e.maxHp) {
            const bw = e.r * 1.6;
            const bg = document.createElementNS(svgNS, "rect");
            bg.setAttribute("x", String(-bw / 2));
            bg.setAttribute("y", String(-e.r - 10));
            bg.setAttribute("width", String(bw));
            bg.setAttribute("height", "4");
            bg.setAttribute("fill", "rgba(0,0,0,0.6)");
            bg.setAttribute("rx", "2");
            // counter-flip so bar is left-to-right regardless of sprite facing
            bg.setAttribute("transform", `scale(${facing} 1)`);
            grp.appendChild(bg);
            const fg = document.createElementNS(svgNS, "rect");
            fg.setAttribute("x", String(-bw / 2));
            fg.setAttribute("y", String(-e.r - 10));
            fg.setAttribute("width", String(bw * (e.hp / e.maxHp)));
            fg.setAttribute("height", "4");
            fg.setAttribute("fill", e.type === "boss" ? "#f87171" : "#a3e635");
            fg.setAttribute("rx", "2");
            fg.setAttribute("transform", `scale(${facing} 1)`);
            grp.appendChild(fg);
          }
          g.appendChild(grp);
        }
      }

      if (projRef.current) {
        const g = projRef.current;
        while (g.childNodes.length < s.projectiles.length) {
          const c = document.createElementNS(svgNS, "circle");
          c.setAttribute("r", "6");
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
            c.setAttribute("r", "9");
            c.setAttribute("fill", "url(#coinGrad)");
            c.setAttribute("filter", "url(#glow)");
            c.setAttribute("stroke", "#854d0e");
            c.setAttribute("stroke-width", "1.5");
            g.appendChild(c);
          } else {
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d",
              `M ${l.x} ${l.y + yo + 6} C ${l.x - 13} ${l.y + yo - 5}, ${l.x - 9} ${l.y + yo - 13}, ${l.x} ${l.y + yo - 4} C ${l.x + 9} ${l.y + yo - 13}, ${l.x + 13} ${l.y + yo - 5}, ${l.x} ${l.y + yo + 6} Z`,
            );
            path.setAttribute("fill", "#ef4444");
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

      if (s.tick % 6 === 0) {
        setHud({ hp: s.hp, gold: s.gold, wave: s.wave, kills: s.kills });
      }

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, fire]);

  const finalScore = hud.gold + hud.kills * 10;

  const submitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    const username = form.username.trim();
    const wallet = form.wallet.trim();
    if (username.length < 1 || username.length > 32) {
      setSubmitError("Username must be 1–32 characters.");
      return;
    }
    if (wallet.length < 4 || wallet.length > 128) {
      setSubmitError("Wallet must be 4–128 characters.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("leaderboard").insert({
      username,
      wallet,
      score: finalScore,
      wave: hud.wave,
      kills: hud.kills,
      gold: hud.gold,
    });
    setSubmitting(false);
    if (error) {
      setSubmitError(error.message);
      return;
    }
    setSubmitted(true);
  };

  return (
    <main
      className="min-h-screen w-full flex flex-col items-center px-3 py-4 md:py-6"
      style={{ background: "var(--gradient-sky)" }}
    >
      <h1
        className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight mb-1 text-transparent bg-clip-text text-center"
        style={{ backgroundImage: "var(--gradient-flork)" }}
      >
        FLORK HUNTER
      </h1>
      <p className="text-foreground/70 mb-3 text-xs sm:text-sm md:text-base text-center max-w-xl px-2">
        <span className="hidden md:inline">
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">WASD</kbd> move ·{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">Click</kbd> /{" "}
          <kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/20">Space</kbd> shoot toward cursor
        </span>
        <span className="md:hidden">Use joystick to move · tap screen to shoot</span>
      </p>

      {/* HUD */}
      <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-4 md:gap-6 mb-3 text-foreground">
        <div className="flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <span
              key={i}
              className="text-xl sm:text-2xl"
              style={{
                filter: i < hud.hp ? "none" : "grayscale(1) opacity(0.3)",
                transform: i < hud.hp ? "scale(1)" : "scale(0.85)",
              }}
            >
              ❤️
            </span>
          ))}
        </div>
        <div className="text-base sm:text-lg font-mono">
          🪙 <span className="font-bold">{hud.gold}</span>
        </div>
        <div className="text-base sm:text-lg font-mono">
          ⚔️ <span className="font-bold">{hud.kills}</span>
        </div>
        <div className="text-sm sm:text-lg font-bold px-3 py-1 rounded-full" style={{ background: "var(--gradient-flork)" }}>
          Wave {hud.wave}/7
        </div>
        <div className="text-xs sm:text-sm opacity-70">
          Best: <span className="font-mono font-bold">{best}</span>
        </div>
      </div>

      <div className="w-full max-w-[900px] grid lg:grid-cols-[1fr_280px] gap-4">
        <div
          className="relative w-full aspect-[9/5.6] rounded-3xl overflow-hidden border-2 border-white/20 select-none touch-none"
          style={{ boxShadow: "var(--shadow-glow)" }}
        >
          <svg
            ref={svgRef}
            viewBox={`0 0 ${GAME_W} ${GAME_H}`}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            preserveAspectRatio="xMidYMid slice"
            onPointerMove={onPointerMove}
            onPointerDown={(e) => {
              if (e.pointerType === "mouse") {
                running ? fire() : !gameOver && !won && start();
              } else {
                if (running) fire();
              }
            }}
          >
            <defs>
              <radialGradient id="projGrad">
                <stop offset="0%" stopColor="white" />
                <stop offset="100%" stopColor="#fbbf24" />
              </radialGradient>
              <radialGradient id="coinGrad">
                <stop offset="0%" stopColor="#fef3c7" />
                <stop offset="100%" stopColor="#eab308" />
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2.5" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* AI generated map background */}
            <image
              href={mapImg}
              x={0}
              y={0}
              width={GAME_W}
              height={GAME_H}
              preserveAspectRatio="xMidYMid slice"
            />
            {/* Subtle vignette */}
            <radialGradient id="vign" cx="50%" cy="50%" r="70%">
              <stop offset="60%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
            </radialGradient>
            <rect width={GAME_W} height={GAME_H} fill="url(#vign)" />

            {/* Trees */}
            {stateRef.current.trees.map((t, i) => (
              <g key={i}>
                <ellipse cx={t.x} cy={t.y + t.r * 0.55} rx={t.r * 0.85} ry={t.r * 0.22} fill="rgba(0,0,0,0.45)" />
                <image
                  href={treeImg}
                  x={t.x - t.r * 1.3}
                  y={t.y - t.r * 1.3}
                  width={t.r * 2.6}
                  height={t.r * 2.6}
                  style={{ filter: "drop-shadow(0 4px 4px rgba(0,0,0,0.4))" }}
                />
              </g>
            ))}

            <g ref={lootRef} />
            <g ref={projRef} />
            <g ref={enemiesRef} />

            {/* Flork player */}
            <g ref={florkRef}>
              <ellipse cx={0} cy={FLORK_SIZE / 2 - 4} rx={FLORK_SIZE / 2.6} ry={6} fill="rgba(0,0,0,0.45)" />
              <image
                href={florkImg}
                x={-FLORK_SIZE / 2}
                y={-FLORK_SIZE / 2}
                width={FLORK_SIZE}
                height={FLORK_SIZE}
                style={{ filter: "drop-shadow(0 6px 6px rgba(0,0,0,0.55))" }}
              />
            </g>

            <g ref={particlesRef} />

            {running && (
              <g pointerEvents="none">
                <circle cx={stateRef.current.mouse.x} cy={stateRef.current.mouse.y} r="11" fill="none" stroke="white" strokeOpacity="0.8" strokeWidth="2" />
                <circle cx={stateRef.current.mouse.x} cy={stateRef.current.mouse.y} r="2" fill="white" />
              </g>
            )}
          </svg>

          {/* Mobile joystick */}
          {running && (
            <div
              ref={joyRef}
              onPointerDown={onJoyStart}
              onPointerMove={onJoyMove}
              onPointerUp={onJoyEnd}
              onPointerCancel={onJoyEnd}
              className="lg:hidden absolute bottom-4 left-4 w-28 h-28 rounded-full bg-white/15 border-2 border-white/40 backdrop-blur-sm touch-none"
              style={{ touchAction: "none" }}
            >
              <div
                className="absolute top-1/2 left-1/2 w-12 h-12 rounded-full bg-white/70 border-2 border-white pointer-events-none"
                style={{
                  transform: `translate(calc(-50% + ${joyKnob.x}px), calc(-50% + ${joyKnob.y}px))`,
                  transition: joyKnob.active ? "none" : "transform 0.15s",
                }}
              />
            </div>
          )}

          {/* Mobile fire button */}
          {running && (
            <button
              onPointerDown={(e) => { e.stopPropagation(); fire(); }}
              className="lg:hidden absolute bottom-4 right-4 w-20 h-20 rounded-full font-bold text-white text-sm border-2 border-white/60 active:scale-95 transition-transform"
              style={{ background: "var(--gradient-flork)", boxShadow: "var(--shadow-glow)", touchAction: "none" }}
            >
              FIRE
            </button>
          )}

          {!running && !gameOver && !won && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm">
              <div className="text-2xl sm:text-3xl md:text-5xl font-black mb-2 text-white text-center px-4">
                Flork's Adventure
              </div>
              <p className="text-white/70 mb-5 text-xs sm:text-sm md:text-base text-center max-w-md px-4">
                Welcome to the mystical forest. Hunt monsters, collect coins, and survive 7 waves!
              </p>
              <button
                onClick={start}
                className="px-8 py-3 rounded-full font-bold text-white text-base sm:text-lg hover:scale-105 transition-transform"
                style={{ background: "var(--gradient-flork)", boxShadow: "var(--shadow-glow)" }}
              >
                START HUNTING
              </button>
            </div>
          )}

          {(gameOver || won) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm overflow-y-auto p-4">
              <div className={`text-3xl sm:text-4xl md:text-6xl font-black mb-1 ${won ? "text-transparent bg-clip-text" : "text-white"}`}
                style={won ? { backgroundImage: "var(--gradient-flork)" } : undefined}>
                {won ? "VICTORY! 🏆" : "GAME OVER"}
              </div>
              <div className="text-white/80 mb-1 text-sm sm:text-base">
                Wave {hud.wave} · {hud.kills} kills · 🪙 {hud.gold}
              </div>
              <div className="text-white/70 mb-3 text-xs sm:text-sm">
                Score: <span className="font-bold text-white text-base">{finalScore}</span> · Best: {best}
              </div>

              {!submitted ? (
                <form onSubmit={submitScore} className="w-full max-w-xs space-y-2 bg-white/10 rounded-2xl p-3 border border-white/20">
                  <div className="text-white/90 text-xs font-semibold text-center mb-1">Submit your score</div>
                  <input
                    type="text"
                    placeholder="Username"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    maxLength={32}
                    className="w-full px-3 py-2 rounded-lg bg-white/90 text-black text-sm placeholder:text-black/50 focus:outline-none focus:ring-2 focus:ring-pink-400"
                    required
                  />
                  <input
                    type="text"
                    placeholder="Wallet (e.g. 0x... or sol address)"
                    value={form.wallet}
                    onChange={(e) => setForm((f) => ({ ...f, wallet: e.target.value }))}
                    maxLength={128}
                    className="w-full px-3 py-2 rounded-lg bg-white/90 text-black text-sm placeholder:text-black/50 focus:outline-none focus:ring-2 focus:ring-pink-400"
                    required
                  />
                  {submitError && (
                    <div className="text-red-300 text-xs">{submitError}</div>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-1 py-2 rounded-full font-bold text-white text-sm disabled:opacity-60"
                      style={{ background: "var(--gradient-flork)" }}
                    >
                      {submitting ? "Saving..." : "Submit"}
                    </button>
                    <button
                      type="button"
                      onClick={start}
                      className="px-4 py-2 rounded-full font-bold text-white text-sm bg-white/20 border border-white/30"
                    >
                      Skip
                    </button>
                  </div>
                </form>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <div className="text-emerald-300 text-sm">✓ Submitted to leaderboard!</div>
                  <button
                    onClick={start}
                    className="px-8 py-2 rounded-full font-bold text-white"
                    style={{ background: "var(--gradient-flork)", boxShadow: "var(--shadow-glow)" }}
                  >
                    PLAY AGAIN
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <aside className="rounded-3xl border border-white/20 bg-white/5 backdrop-blur-sm p-3 sm:p-4 text-foreground">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-bold">🏆 Leaderboard</h2>
            <span className="text-[10px] uppercase tracking-wider opacity-60 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live
            </span>
          </div>
          {leaderboard.length === 0 ? (
            <p className="text-xs opacity-60">No scores yet. Be the first!</p>
          ) : (
            <ol className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
              {leaderboard.map((row, i) => (
                <li
                  key={row.id}
                  className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5"
                  style={{
                    background: i === 0
                      ? "linear-gradient(90deg, rgba(250,204,21,0.25), transparent)"
                      : i < 3
                        ? "rgba(255,255,255,0.06)"
                        : "transparent",
                  }}
                >
                  <span className="font-bold w-5 text-center opacity-70">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold truncate">{row.username}</div>
                    <div className="text-[10px] opacity-60 font-mono truncate">{shortWallet(row.wallet)}</div>
                  </div>
                  <span className="font-mono font-bold text-right">{row.score}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>

      <p className="mt-4 text-xs text-foreground/50 text-center px-4">
        🪙 Coin = +5 · ❤️ Heart = +1 HP · Boss appears from wave 5+
      </p>
    </main>
  );
}
