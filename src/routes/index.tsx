import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import florkImg from "@/assets/flork.png";
import florkHeroImg from "@/assets/flork-hero.png";
import florkTitleImg from "@/assets/flork-hunter-title.png";
import btnStartImg from "@/assets/btn-start-hunting.png";
import btnLeaderboardImg from "@/assets/btn-leaderboard.png";
import mapForestTile from "@/assets/map-tile-forest.png";
import mapSwampTile from "@/assets/map-tile-swamp.png";
import mapRuinsTile from "@/assets/map-tile-ruins.png";
import slimeImg from "@/assets/enemy-slime.png";
import batImg from "@/assets/enemy-bat.png";
import bossImg from "@/assets/enemy-boss.png";
import ghostImg from "@/assets/enemy-ghost.png";
import wolfImg from "@/assets/enemy-wolf.png";
import treeImg from "@/assets/tree.png";
// Score submission and leaderboard are now on-chain (FlorkGame contract). No Supabase imports needed.
import {
  sfx,
  startMusic,
  stopMusic,
  unlockAudio,
  setMusicEnabled,
  setSfxEnabled,
} from "@/lib/audio";
import { Globe, Send, Trophy, X, Sparkles } from "lucide-react";
import { useAccount } from "wagmi";
import { WalletConnect } from "@/components/WalletConnect";
import { CharacterSelect, type SelectedCharacter } from "@/components/CharacterSelect";
import { SelectedFlorkPill } from "@/components/SelectedFlorkPill";
import { OnChainSubmit } from "@/components/OnChainSubmit";
import { OnChainLeaderboard } from "@/components/OnChainLeaderboard";
import { RARITY_BONUS } from "@/lib/web3/nft";

// Inline X (Twitter) logo — lucide doesn't ship a brand icon for it.
function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M18.244 2H21l-6.52 7.45L22 22h-6.99l-4.7-6.14L4.8 22H2.04l6.98-7.97L2 2h7.13l4.24 5.62L18.244 2Zm-2.45 18h1.86L7.27 4h-1.9l10.42 16Z" />
    </svg>
  );
}

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Flork Hunter — Forest Adventure" },
      {
        name: "description",
        content:
          "A fullscreen top-down hunting adventure: explore mystical maps with Flork, defeat monsters, collect loot, and climb the realtime leaderboard!",
      },
    ],
  }),
});

// World is much bigger than viewport — camera follows player
const WORLD_W = 2400;
const WORLD_H = 1800;
const VIEW_W = 1280; // svg viewBox width (camera window)
const VIEW_H = 800;  // svg viewBox height
const FLORK_SIZE = 64;
const FLORK_SPEED = 2.6;
const PROJ_SPEED = 6;
const ENEMY_SPEED_BASE = 0.6;
const MAP_TILE_SIZE = 1024;

const MAPS = [mapForestTile, mapSwampTile, mapRuinsTile];

type EnemyType = "slime" | "bat" | "boss" | "ghost" | "wolf";
type Vec = { x: number; y: number };
type Enemy = {
  x: number; y: number;
  hp: number; maxHp: number; r: number;
  type: EnemyType;
  hitFlash: number; bob: number;
  attackFlash: number;
};
type Projectile = { x: number; y: number; vx: number; vy: number; life: number };
type Loot = { x: number; y: number; type: "coin" | "heart"; bob: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
type Tree = { x: number; y: number; r: number };
type SlashFx = { x: number; y: number; life: number };
// Leaderboard rows are read directly from the FlorkGame contract — no local DB row type needed.

const ENEMY_SPRITES: Record<EnemyType, string> = {
  slime: slimeImg, bat: batImg, boss: bossImg, ghost: ghostImg, wolf: wolfImg,
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
  const [mapIdx, setMapIdx] = useState(0);
  const [musicOn, setMusicOn] = useState(true);
  const [sfxOn, setSfxOn] = useState(true);
  // Bug #1 fix: read localStorage in effect (not initializer) to avoid SSR/CSR hydration mismatch (React error #418).
  const [best, setBest] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = Number(localStorage.getItem("flork-hunter-best") || 0);
    if (!Number.isNaN(v)) setBest(v);
  }, []);
  const [showLB, setShowLB] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingPct, setLoadingPct] = useState(0);

  // ===== Web3 / NFT integration =====
  const { address: walletAddress, isConnected, chainId } = useAccount();
  const onPulseChain = isConnected && chainId === 369;
  const [showCharSelect, setShowCharSelect] = useState(false);
  const [selectedChar, setSelectedChar] = useState<SelectedCharacter>({ kind: "guest" });
  const bonus = selectedChar.kind === "nft" ? RARITY_BONUS[selectedChar.rarity] : RARITY_BONUS.Common;
  // Keep a ref so the running game loop reads the latest bonuses without restarting.
  const bonusRef = useRef(bonus);
  useEffect(() => { bonusRef.current = bonus; }, [bonus]);


  // Bug #2 fix: trees rendered from JSX must come from React state, not from a ref
  // (otherwise new trees from a fresh game don't repaint).
  const [trees, setTrees] = useState<Tree[]>([]);
  // Bug #3 fix: drive the crosshair from React state so it follows the mouse smoothly,
  // not just every 6 ticks when HUD updates.
  const [crosshair, setCrosshair] = useState<Vec>({ x: VIEW_W / 2, y: VIEW_H / 2 });

  const stateRef = useRef({
    pos: { x: WORLD_W / 2, y: WORLD_H / 2 } as Vec,
    cam: { x: WORLD_W / 2, y: WORLD_H / 2 } as Vec,
    facing: { x: 1, y: 0 } as Vec,
    moveDir: { x: 0, y: 0 } as Vec,
    keys: {} as Record<string, boolean>,
    mouse: { x: WORLD_W / 2 + 80, y: WORLD_H / 2 } as Vec, // world coords
    enemies: [] as Enemy[],
    projectiles: [] as Projectile[],
    loot: [] as Loot[],
    particles: [] as Particle[],
    slashes: [] as SlashFx[],
    trees: [] as Tree[],
    hp: 5, iframes: 0, gold: 0, kills: 0,
    wave: 1, waveSpawned: 0, waveTarget: 5, waveCooldown: 0,
    fireCooldown: 0, running: false, tick: 0, walkPhase: 0,
    shake: 0,
  });

  const florkRef = useRef<SVGGElement>(null);
  const enemiesRef = useRef<SVGGElement>(null);
  const projRef = useRef<SVGGElement>(null);
  const lootRef = useRef<SVGGElement>(null);
  const particlesRef = useRef<SVGGElement>(null);
  const slashesRef = useRef<SVGGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Leaderboard is now read on-chain inside <OnChainLeaderboard />.


  const start = useCallback(() => {
    unlockAudio();
    if (musicOn) startMusic();
    const trees: Tree[] = [];
    for (let i = 0; i < 32; i++) {
      trees.push({
        x: 120 + Math.random() * (WORLD_W - 240),
        y: 120 + Math.random() * (WORLD_H - 240),
        r: 26 + Math.random() * 18,
      });
    }
    const cx = WORLD_W / 2, cy = WORLD_H / 2;
    const filtered = trees.filter((t) => (t.x - cx) ** 2 + (t.y - cy) ** 2 > 180 ** 2);
    const newMap = Math.floor(Math.random() * MAPS.length);
    setMapIdx(newMap);
    // Bug #2 fix: push trees to React state so JSX repaints them on a fresh game.
    setTrees(filtered);

    stateRef.current = {
      pos: { x: cx, y: cy },
      cam: { x: cx, y: cy },
      facing: { x: 1, y: 0 },
      moveDir: { x: 0, y: 0 },
      keys: {},
      mouse: { x: cx + 80, y: cy },
      enemies: [], projectiles: [], loot: [], particles: [], slashes: [],
      trees: filtered,
      hp: 5 + bonusRef.current.extraLives, iframes: 0, gold: 0, kills: 0,
      wave: 1, waveSpawned: 0, waveTarget: 5, waveCooldown: 60,
      fireCooldown: 0, running: true, tick: 0, walkPhase: 0, shake: 0,
    };
    setHud({ hp: 5 + bonusRef.current.extraLives, gold: 0, wave: 1, kills: 0 });
    setGameOver(false); setWon(false);
    setRunning(true);
  }, [musicOn]);

  // Loading bar wrapper for the start button — gives a polished "loading" feel.
  const handleStart = useCallback(() => {
    if (loading) return;
    unlockAudio();
    setLoading(true);
    setLoadingPct(0);
    const startTs = performance.now();
    const DURATION = 1100;
    const tick = () => {
      const elapsed = performance.now() - startTs;
      const pct = Math.min(100, (elapsed / DURATION) * 100);
      setLoadingPct(pct);
      if (pct < 100) {
        requestAnimationFrame(tick);
      } else {
        setLoading(false);
        setLoadingPct(0);
        start();
      }
    };
    requestAnimationFrame(tick);
  }, [loading, start]);

  // keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      stateRef.current.keys[e.key.toLowerCase()] = true;
      if (e.code === "Space" && stateRef.current.running) e.preventDefault();
      if (!stateRef.current.running && (e.code === "Space" || e.key === "Enter")) {
        if (!gameOver && !won) start();
      }
    };
    const up = (e: KeyboardEvent) => { stateRef.current.keys[e.key.toLowerCase()] = false; };
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
      x: s.pos.x, y: s.pos.y,
      vx: (dx / len) * PROJ_SPEED,
      vy: (dy / len) * PROJ_SPEED,
      life: 110,
    });
    s.fireCooldown = Math.max(4, Math.round(20 / bonusRef.current.fireRate));
    sfx.shoot();
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // viewport coords -> world coords (camera-relative)
    const vx = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    const vy = ((e.clientY - rect.top) / rect.height) * VIEW_H;
    const s = stateRef.current;
    s.mouse = {
      x: s.cam.x - VIEW_W / 2 + vx,
      y: s.cam.y - VIEW_H / 2 + vy,
    };
    // Bug #3 fix: keep React-driven crosshair in sync with pointer.
    setCrosshair({ x: vx, y: vy });
  }, []);

  // Joystick
  const joyRef = useRef<HTMLDivElement>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0, active: false });
  const onJoyStart = (e: React.PointerEvent<HTMLDivElement>) => {
    // Bug #6 fix: capture on currentTarget (the joystick container), not e.target
    // — the inner knob has pointer-events:none so capturing on it silently fails on mobile.
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
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
    const kx = dx * k, ky = dy * k;
    setJoyKnob({ x: kx, y: ky, active: true });
    const nlen = Math.hypot(kx, ky) / max; // 0..1
    const DEAD = 0.2;
    if (nlen < DEAD) {
      stateRef.current.moveDir = { x: 0, y: 0 };
    } else {
      // Analog magnitude with smooth easing — slower near center, full speed only at edge.
      const t = (nlen - DEAD) / (1 - DEAD);
      const mag = Math.min(1, t * t); // ease-in for gentler control
      const l = Math.hypot(kx, ky) || 1;
      stateRef.current.moveDir = { x: (kx / l) * mag, y: (ky / l) * mag };
    }
  };

  // game loop
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    const svgNS = "http://www.w3.org/2000/svg";

    const collidesTree = (x: number, y: number, r: number) => {
      for (const t of stateRef.current.trees) {
        const dx = x - t.x, dy = y - t.y;
        if (dx * dx + dy * dy < (t.r * 0.55 + r) ** 2) return true;
      }
      return false;
    };

    const spawnEnemy = (s: typeof stateRef.current) => {
      // spawn around the player at off-screen radius
      const angle = Math.random() * Math.PI * 2;
      const dist = 600 + Math.random() * 200;
      let x = s.pos.x + Math.cos(angle) * dist;
      let y = s.pos.y + Math.sin(angle) * dist;
      x = Math.max(40, Math.min(WORLD_W - 40, x));
      y = Math.max(40, Math.min(WORLD_H - 40, y));

      const isBoss = s.wave >= 5 && s.waveSpawned === 0 && Math.random() < 0.6;
      if (isBoss) {
        s.enemies.push({ x, y, hp: 16 + s.wave * 2, maxHp: 16 + s.wave * 2, r: 40, type: "boss", hitFlash: 0, bob: Math.random() * 6, attackFlash: 0 });
        return;
      }
      // weighted variety based on wave
      const roll = Math.random();
      let type: EnemyType = "slime";
      if (s.wave >= 4 && roll < 0.2) type = "wolf";
      else if (s.wave >= 3 && roll < 0.4) type = "ghost";
      else if (s.wave >= 2 && roll < 0.65) type = "bat";
      else type = "slime";

      const stats: Record<EnemyType, { hp: number; r: number }> = {
        slime: { hp: 2 + Math.floor(s.wave / 2), r: 22 },
        bat:   { hp: 2, r: 18 },
        ghost: { hp: 3, r: 20 },
        wolf:  { hp: 4 + Math.floor(s.wave / 3), r: 24 },
        boss:  { hp: 16, r: 40 },
      };
      const st = stats[type];
      s.enemies.push({ x, y, hp: st.hp, maxHp: st.hp, r: st.r, type, hitFlash: 0, bob: Math.random() * 6, attackFlash: 0 });
    };

    const burst = (s: typeof stateRef.current, x: number, y: number, color: string, n = 10) => {
      for (let i = 0; i < n; i++) {
        s.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 5,
          vy: (Math.random() - 0.5) * 5,
          life: 22 + Math.random() * 14,
          color,
        });
      }
    };

    const finishGame = (didWin: boolean) => {
      const s = stateRef.current;
      s.running = false;
      stopMusic();
      if (didWin) sfx.victory(); else sfx.gameOver();
      setRunning(false);
      const finalScore = s.gold + s.kills * 10;
      setBest((b) => {
        const nb = Math.max(b, finalScore);
        if (typeof window !== "undefined") localStorage.setItem("flork-hunter-best", String(nb));
        return nb;
      });
      if (didWin) setWon(true);
      else setGameOver(true);
    };

    const enemySpeed = (e: Enemy) => {
      if (e.type === "bat") return ENEMY_SPEED_BASE * 1.7;
      if (e.type === "ghost") return ENEMY_SPEED_BASE * 1.2;
      if (e.type === "wolf") return ENEMY_SPEED_BASE * 1.5;
      if (e.type === "boss") return ENEMY_SPEED_BASE * 0.65;
      return ENEMY_SPEED_BASE;
    };

    const loop = () => {
      const s = stateRef.current;
      if (!s.running) return;
      s.tick++;

      // movement
      let dx = 0, dy = 0;
      let usingKeys = false;
      if (s.keys["w"] || s.keys["arrowup"]) { dy -= 1; usingKeys = true; }
      if (s.keys["s"] || s.keys["arrowdown"]) { dy += 1; usingKeys = true; }
      if (s.keys["a"] || s.keys["arrowleft"]) { dx -= 1; usingKeys = true; }
      if (s.keys["d"] || s.keys["arrowright"]) { dx += 1; usingKeys = true; }
      if (usingKeys) {
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
      } else {
        // Joystick already provides analog magnitude (0..1)
        dx = s.moveDir.x; dy = s.moveDir.y;
      }

      const mag = Math.hypot(dx, dy);
      const moving = mag > 0.001;
      if (moving) {
        const sp = FLORK_SPEED * bonusRef.current.speed;
        const nx = s.pos.x + dx * sp;
        const ny = s.pos.y + dy * sp;
        if (nx > 30 && nx < WORLD_W - 30 && !collidesTree(nx, s.pos.y, FLORK_SIZE / 2 - 14)) s.pos.x = nx;
        if (ny > 30 && ny < WORLD_H - 30 && !collidesTree(s.pos.x, ny, FLORK_SIZE / 2 - 14)) s.pos.y = ny;
        s.walkPhase += 0.28;
      } else {
        s.walkPhase *= 0.9;
      }

      // camera lerp toward player + shake
      const camLerp = 0.12;
      s.cam.x += (s.pos.x - s.cam.x) * camLerp;
      s.cam.y += (s.pos.y - s.cam.y) * camLerp;
      s.cam.x = Math.max(VIEW_W / 2, Math.min(WORLD_W - VIEW_W / 2, s.cam.x));
      s.cam.y = Math.max(VIEW_H / 2, Math.min(WORLD_H - VIEW_H / 2, s.cam.y));
      const shakeX = s.shake > 0 ? (Math.random() - 0.5) * s.shake : 0;
      const shakeY = s.shake > 0 ? (Math.random() - 0.5) * s.shake : 0;
      if (s.shake > 0) s.shake *= 0.85;

      const fx = s.mouse.x - s.pos.x;
      s.facing.x = fx >= 0 ? 1 : -1;

      if (s.keys[" "] || s.keys["space"]) fire();
      if (s.fireCooldown > 0) s.fireCooldown--;
      if (s.iframes > 0) s.iframes--;

      // wave control
      if (s.waveCooldown > 0) {
        s.waveCooldown--;
      } else if (s.waveSpawned < s.waveTarget) {
        if (s.tick % 60 === 0) {
          spawnEnemy(s);
          s.waveSpawned++;
        }
      } else if (s.enemies.length === 0) {
        s.wave++;
        if (s.wave > 7) { finishGame(true); return; }
        s.waveSpawned = 0;
        s.waveTarget = 4 + s.wave * 2;
        s.waveCooldown = 110;
        sfx.wave();
      }

      // projectiles
      for (const p of s.projectiles) { p.x += p.vx; p.y += p.vy; p.life--; }
      s.projectiles = s.projectiles.filter((p) => p.life > 0 && p.x > -20 && p.x < WORLD_W + 20 && p.y > -20 && p.y < WORLD_H + 20);

      // enemies move
      for (const e of s.enemies) {
        const ex = s.pos.x - e.x, ey = s.pos.y - e.y;
        const len = Math.hypot(ex, ey) || 1;
        const sp = enemySpeed(e);
        e.x += (ex / len) * sp;
        e.y += (ey / len) * sp;
        e.bob += 0.15;
        if (e.hitFlash > 0) e.hitFlash--;
        if (e.attackFlash > 0) e.attackFlash--;
      }

      // proj vs enemy
      for (const p of s.projectiles) {
        for (const e of s.enemies) {
          const dx2 = p.x - e.x, dy2 = p.y - e.y;
          if (dx2 * dx2 + dy2 * dy2 < e.r * e.r) {
            e.hp -= bonusRef.current.damage; e.hitFlash = 6; p.life = 0;
            burst(s, p.x, p.y, "#ffd166", 5);
            sfx.hit();
            if (e.hp <= 0) {
              s.kills++;
              burst(s, e.x, e.y, "#ff6bd6", 16);
              sfx.enemyDie();
              if (e.type === "boss") {
                for (let i = 0; i < 3; i++) {
                  s.loot.push({ x: e.x + (Math.random() - 0.5) * 30, y: e.y + (Math.random() - 0.5) * 30, type: "coin", bob: Math.random() * Math.PI * 2 });
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
          const dx2 = s.pos.x - e.x, dy2 = s.pos.y - e.y;
          if (dx2 * dx2 + dy2 * dy2 < (e.r + FLORK_SIZE / 2 - 12) ** 2) {
            s.hp--; s.iframes = 70;
            burst(s, s.pos.x, s.pos.y, "#ef4444", 14);
            // attack visual
            e.attackFlash = 14;
            s.slashes.push({ x: s.pos.x, y: s.pos.y, life: 16 });
            s.shake = 12;
            sfx.playerHurt();
            if (s.hp <= 0) { finishGame(false); return; }
            break;
          }
        }
      }

      // loot pickup
      for (const l of s.loot) {
        l.bob += 0.15;
        const dx2 = s.pos.x - l.x, dy2 = s.pos.y - l.y;
        if (dx2 * dx2 + dy2 * dy2 < 36 * 36) {
          if (l.type === "coin") { s.gold += 5; burst(s, l.x, l.y, "#fde047", 6); sfx.coin(); }
          else { s.hp = Math.min(5 + bonusRef.current.extraLives, s.hp + 1); burst(s, l.x, l.y, "#f87171", 8); sfx.heart(); }
          (l as Loot & { taken?: boolean }).taken = true;
        }
      }
      s.loot = s.loot.filter((l) => !(l as Loot & { taken?: boolean }).taken);

      // particles
      for (const p of s.particles) { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; p.life--; }
      s.particles = s.particles.filter((p) => p.life > 0);

      // slashes
      for (const sl of s.slashes) sl.life--;
      s.slashes = s.slashes.filter((sl) => sl.life > 0);

      // ===== camera transform on world group =====
      if (worldRef.current) {
        const tx = -(s.cam.x - VIEW_W / 2) + shakeX;
        const ty = -(s.cam.y - VIEW_H / 2) + shakeY;
        worldRef.current.setAttribute("transform", `translate(${tx} ${ty})`);
      }

      // ===== flork =====
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
          const bob = Math.sin(e.bob) * (e.type === "bat" || e.type === "ghost" ? 6 : 3);
          const facing = s.pos.x < e.x ? -1 : 1;
          grp.setAttribute("transform", `translate(${e.x} ${e.y + bob}) scale(${facing} 1)`);
          // shadow
          const sh = document.createElementNS(svgNS, "ellipse");
          sh.setAttribute("cx", "0");
          sh.setAttribute("cy", String(e.r * 0.7 - bob));
          sh.setAttribute("rx", String(e.r * 0.7));
          sh.setAttribute("ry", String(e.r * 0.22));
          sh.setAttribute("fill", "rgba(0,0,0,0.4)");
          grp.appendChild(sh);
          // attack ring
          if (e.attackFlash > 0) {
            const ring = document.createElementNS(svgNS, "circle");
            ring.setAttribute("r", String(e.r + (14 - e.attackFlash) * 2));
            ring.setAttribute("fill", "none");
            ring.setAttribute("stroke", "#ff3355");
            ring.setAttribute("stroke-width", "3");
            ring.setAttribute("opacity", String(e.attackFlash / 14));
            grp.appendChild(ring);
          }
          // sprite
          const img = document.createElementNS(svgNS, "image");
          const size = e.r * 2.4;
          img.setAttribute("href", ENEMY_SPRITES[e.type]);
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
          c.setAttribute("r", "7");
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
            c.setAttribute("r", "10");
            c.setAttribute("fill", "url(#coinGrad)");
            c.setAttribute("filter", "url(#glow)");
            c.setAttribute("stroke", "#854d0e");
            c.setAttribute("stroke-width", "1.5");
            g.appendChild(c);
          } else {
            const path = document.createElementNS(svgNS, "path");
            path.setAttribute("d",
              `M ${l.x} ${l.y + yo + 6} C ${l.x - 14} ${l.y + yo - 5}, ${l.x - 10} ${l.y + yo - 14}, ${l.x} ${l.y + yo - 4} C ${l.x + 10} ${l.y + yo - 14}, ${l.x + 14} ${l.y + yo - 5}, ${l.x} ${l.y + yo + 6} Z`,
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
        while (g.childNodes.length < s.particles.length) g.appendChild(document.createElementNS(svgNS, "circle"));
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

      // slashes (attack effect)
      if (slashesRef.current) {
        const g = slashesRef.current;
        while (g.firstChild) g.removeChild(g.firstChild);
        for (const sl of s.slashes) {
          const a = sl.life / 16;
          const r = (16 - sl.life) * 4 + 18;
          const c = document.createElementNS(svgNS, "circle");
          c.setAttribute("cx", String(sl.x));
          c.setAttribute("cy", String(sl.y));
          c.setAttribute("r", String(r));
          c.setAttribute("fill", "none");
          c.setAttribute("stroke", "#fff");
          c.setAttribute("stroke-width", "3");
          c.setAttribute("opacity", String(a));
          g.appendChild(c);
          // X slash
          const path = document.createElementNS(svgNS, "path");
          path.setAttribute("d", `M ${sl.x - 14} ${sl.y - 14} L ${sl.x + 14} ${sl.y + 14} M ${sl.x - 14} ${sl.y + 14} L ${sl.x + 14} ${sl.y - 14}`);
          path.setAttribute("stroke", "#ff3355");
          path.setAttribute("stroke-width", "4");
          path.setAttribute("stroke-linecap", "round");
          path.setAttribute("opacity", String(a));
          g.appendChild(path);
        }
      }

      if (s.tick % 6 === 0) setHud({ hp: s.hp, gold: s.gold, wave: s.wave, kills: s.kills });

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, fire]);

  // stop music on unmount
  useEffect(() => () => stopMusic(), []);

  const toggleMusic = () => {
    const next = !musicOn;
    setMusicOn(next);
    setMusicEnabled(next);
    if (next && running) startMusic(); else stopMusic();
  };
  const toggleSfx = () => {
    const next = !sfxOn;
    setSfxOn(next);
    setSfxEnabled(next);
  };

  const finalScore = hud.gold + hud.kills * 10;

  // Score submission is handled on-chain by <OnChainSubmit /> on the Game Over panel.


  return (
    <main className="fixed inset-0 w-screen h-screen overflow-hidden select-none touch-none" style={{ background: "var(--gradient-sky)" }}>
      {/* Game canvas — fullscreen */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid slice"
        // Bug #7 fix: hide native cursor — we render our own crosshair sprite below.
        className="absolute inset-0 w-full h-full"
        style={{ cursor: "none" }}
        onPointerMove={onPointerMove}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          unlockAudio();
          // Ignore right / middle / aux mouse buttons so they don't open the
          // browser context menu, drag-select the SVG, or otherwise break input.
          if (e.pointerType === "mouse" && e.button !== 0) {
            e.preventDefault();
            return;
          }
          if (e.pointerType === "mouse") {
            if (running) fire();
            else if (!gameOver && !won) start();
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
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <radialGradient id="vign" cx="50%" cy="50%" r="70%">
            <stop offset="55%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(0,0,0,0.6)" />
          </radialGradient>
          <pattern
            id="mapTile"
            x="0"
            y="0"
            width={MAP_TILE_SIZE}
            height={MAP_TILE_SIZE}
            patternUnits="userSpaceOnUse"
          >
            <image
              href={MAPS[mapIdx]}
              x="0"
              y="0"
              width={MAP_TILE_SIZE}
              height={MAP_TILE_SIZE}
              preserveAspectRatio="none"
              imageRendering="auto"
            />
          </pattern>
        </defs>

        {/* World (camera-translated) */}
        <g ref={worldRef}>
          <rect x="0" y="0" width={WORLD_W} height={WORLD_H} fill="url(#mapTile)" />

          {/* Trees */}
          {trees.map((t, i) => (
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

          {/* Flork */}
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
          <g ref={slashesRef} />
        </g>

        {/* Vignette overlay (screen-space) */}
        <rect width={VIEW_W} height={VIEW_H} fill="url(#vign)" pointerEvents="none" />

        {/* Crosshair (screen-space) */}
        {running && (
          <g pointerEvents="none" transform={`translate(${crosshair.x} ${crosshair.y})`}>
            <circle r="13" fill="none" stroke="white" strokeOpacity="0.85" strokeWidth="2" />
            <circle r="2" fill="white" />
          </g>
        )}
      </svg>

      {/* Top HUD */}
      {running && (
        <div className="absolute top-0 left-0 right-0 p-3 sm:p-4 flex items-start justify-between gap-2 pointer-events-none z-10">
          <div className="flex flex-col gap-2 pointer-events-auto">
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-white">
              <div className="flex items-center gap-0.5 bg-black/40 backdrop-blur-sm rounded-full px-2 py-1">
                {Array.from({ length: 5 + bonus.extraLives }).map((_, i) => (
                  <span key={i} className="text-base sm:text-lg" style={{ filter: i < hud.hp ? "none" : "grayscale(1) opacity(0.3)" }}>❤️</span>
                ))}
              </div>
              <div className="bg-black/40 backdrop-blur-sm rounded-full px-3 py-1 text-sm font-mono">🪙 <span className="font-bold">{hud.gold}</span></div>
              <div className="bg-black/40 backdrop-blur-sm rounded-full px-3 py-1 text-sm font-mono">⚔️ <span className="font-bold">{hud.kills}</span></div>
              <div className="text-sm font-bold px-3 py-1 rounded-full text-white" style={{ background: "var(--gradient-flork)" }}>Wave {hud.wave}/7</div>
              <div className="hidden sm:block bg-black/40 backdrop-blur-sm rounded-full px-3 py-1 text-xs">Best: <span className="font-mono font-bold">{best}</span></div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-2 pointer-events-auto">
            <div className="flex gap-2">
              <button onClick={toggleMusic} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 text-white hover:bg-black/70 transition-colors" title="Toggle music">
                {musicOn ? "🎵" : "🔇"}
              </button>
              <button onClick={toggleSfx} className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 text-white hover:bg-black/70 transition-colors" title="Toggle SFX">
                {sfxOn ? "🔊" : "🔈"}
              </button>
              <button onClick={() => setShowLB((v) => !v)} className="px-4 h-10 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 text-white text-sm font-bold hover:bg-black/70 transition-colors">
                🏆 {showLB ? "Hide" : "Leaderboard"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leaderboard modal — full-screen overlay (outside the game viewport) */}
      {showLB && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowLB(false)}
        >
          <div
            className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl border-2 border-white/30 bg-gradient-to-b from-zinc-900/95 to-black/95 p-5 sm:p-6 text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ boxShadow: "0 0 80px rgba(168, 85, 247, 0.35)" }}
          >
            <button
              onClick={() => setShowLB(false)}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 text-white flex items-center justify-center transition-colors"
              aria-label="Close leaderboard"
            >
              <X className="w-4 h-4" />
            </button>
            <OnChainLeaderboard />

          </div>
        </div>
      )}

      {/* Mobile joystick */}
      {running && (
        <div
          ref={joyRef}
          onPointerDown={onJoyStart}
          onPointerMove={onJoyMove}
          onPointerUp={onJoyEnd}
          onPointerCancel={onJoyEnd}
          className="lg:hidden absolute bottom-6 left-6 w-32 h-32 rounded-full bg-white/15 border-2 border-white/40 backdrop-blur-sm touch-none z-20"
          style={{ touchAction: "none" }}
        >
          <div
            className="absolute top-1/2 left-1/2 w-14 h-14 rounded-full bg-white/70 border-2 border-white pointer-events-none"
            style={{
              transform: `translate(calc(-50% + ${joyKnob.x}px), calc(-50% + ${joyKnob.y}px))`,
              transition: joyKnob.active ? "none" : "transform 0.15s",
            }}
          />
        </div>
      )}

      {/* Mobile fire */}
      {running && (
        <button
          onPointerDown={(e) => { e.stopPropagation(); fire(); }}
          className="lg:hidden absolute bottom-6 right-6 w-24 h-24 rounded-full font-bold text-white text-base border-2 border-white/60 active:scale-95 transition-transform z-20"
          style={{ background: "var(--gradient-flork)", boxShadow: "var(--shadow-glow)", touchAction: "none" }}
        >
          FIRE
        </button>
      )}

      {/* Start overlay — TOP: title + tagline (above PulseChain logo) · MIDDLE: artwork visible · BOTTOM: buttons + socials */}
      {!running && !gameOver && !won && (
        <div
          className="absolute inset-0 z-30 overflow-hidden"
          style={{
            backgroundImage: `url(${florkHeroImg})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Top + bottom scrim — keeps middle (artwork) clear */}
          <div className="absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/85 via-black/55 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/90 via-black/65 to-transparent" />

          {/* Fixed overlay zones: top stays above PulseChain logo, bottom stays below the character art */}
          <div className="relative z-10 h-full w-full px-4">
            {/* Wallet connect — top right */}
            <div className="absolute top-3 right-3 sm:top-5 sm:right-5 z-20">
              <WalletConnect />
            </div>

            <div className="absolute inset-x-0 top-3 sm:top-5 md:top-7 flex flex-col items-center text-center pointer-events-none">
              <img
                src={florkTitleImg}
                alt="Flork Hunter"
                width={1584}
                height={672}
                className="w-full max-w-[400px] sm:max-w-[540px] md:max-w-[640px] h-auto select-none drop-shadow-[0_10px_35px_rgba(0,0,0,0.78)]"
                draggable={false}
              />
              <p className="font-game-body mt-1 sm:mt-2 text-[11px] sm:text-xs md:text-sm text-white drop-shadow-[0_2px_6px_rgba(0,0,0,1)] tracking-[0.18em] uppercase">
                Hunt monsters · Collect coins · Survive 7 waves
              </p>
            </div>

            <div className="absolute inset-x-0 bottom-5 sm:bottom-7 md:bottom-8 flex flex-col items-center gap-3">
              {/* Selected Flork status */}
              <SelectedFlorkPill
                selected={selectedChar}
                connected={onPulseChain}
                onOpen={() => setShowCharSelect(true)}
              />

              <div className="font-game-body text-white/85 text-xs sm:text-sm text-center drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                <span className="hidden md:inline">
                  <kbd className="font-game-body text-[11px] px-2 py-1 rounded bg-white/15 border border-white/30 mr-1">WASD</kbd>move ·{" "}
                  <kbd className="font-game-body text-[11px] px-2 py-1 rounded bg-white/15 border border-white/30 mr-1">MOUSE</kbd>aim ·{" "}
                  <kbd className="font-game-body text-[11px] px-2 py-1 rounded bg-white/15 border border-white/30 mr-1">CLICK</kbd>shoot
                </span>
                <span className="md:hidden">Joystick to move · FIRE to shoot</span>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <button
                  onClick={handleStart}
                  disabled={loading}
                  aria-label="Start Hunting"
                  className="relative hover:scale-105 active:scale-95 transition-transform disabled:cursor-wait disabled:hover:scale-100 drop-shadow-[0_8px_18px_rgba(217,70,239,0.55)]"
                >
                  <img
                    src={btnStartImg}
                    alt=""
                    width={1024}
                    height={512}
                    loading="lazy"
                    draggable={false}
                    className="w-[220px] sm:w-[250px] md:w-[270px] h-auto select-none"
                  />
                  {loading && (
                    <span className="absolute inset-0 flex items-center justify-center font-game text-white text-base sm:text-lg tracking-wider drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                      LOADING {Math.round(loadingPct)}%
                    </span>
                  )}
                </button>
                <button
                  onClick={() => setShowLB(true)}
                  disabled={loading}
                  aria-label="Leaderboard"
                  className="relative hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 drop-shadow-[0_8px_18px_rgba(34,211,238,0.45)]"
                >
                  <img
                    src={btnLeaderboardImg}
                    alt=""
                    width={1024}
                    height={512}
                    loading="lazy"
                    draggable={false}
                    className="w-[220px] sm:w-[250px] md:w-[270px] h-auto select-none"
                  />
                </button>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <a
                  href="https://pulsechainflork.fun"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Website"
                  className="w-12 h-12 rounded-full bg-black/70 border-2 border-white/30 text-white hover:bg-black/90 hover:border-white/60 hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
                >
                  <Globe className="w-5 h-5" />
                </a>
                <a
                  href="https://x.com/FlorkOGPLS"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="X (Twitter)"
                  className="w-12 h-12 rounded-full bg-black/70 border-2 border-white/30 text-white hover:bg-black/90 hover:border-white/60 hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
                >
                  <XIcon className="w-5 h-5" />
                </a>
                <a
                  href="https://t.me/Flork_PLS"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Telegram"
                  className="w-12 h-12 rounded-full bg-black/70 border-2 border-white/30 text-white hover:bg-black/90 hover:border-white/60 hover:scale-110 active:scale-95 transition-all flex items-center justify-center"
                >
                  <Send className="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Character / NFT selection modal */}
      <CharacterSelect
        open={showCharSelect}
        onClose={() => setShowCharSelect(false)}
        onSelect={(s) => {
          setSelectedChar(s);
          setShowCharSelect(false);
        }}
      />


      {(gameOver || won) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm overflow-y-auto p-4 z-30">
          <div className={`text-4xl sm:text-5xl md:text-6xl font-black mb-2 ${won ? "text-transparent bg-clip-text" : "text-white"}`}
            style={won ? { backgroundImage: "var(--gradient-flork)" } : undefined}>
            {won ? "VICTORY! 🏆" : "GAME OVER"}
          </div>
          <div className="text-white/80 mb-1 text-sm sm:text-base">Wave {hud.wave} · {hud.kills} kills · 🪙 {hud.gold}</div>
          <div className="text-white/70 mb-4 text-sm">Score: <span className="font-bold text-white text-base">{finalScore}</span> · Best: {best}</div>

          <OnChainSubmit
            selected={selectedChar}
            score={finalScore}
            wave={hud.wave}
            kills={hud.kills}
            onShowLeaderboard={() => setShowLB(true)}
            onPlayAgain={start}
          />

        </div>
      )}
    </main>
  );
}

