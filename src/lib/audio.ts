// Lightweight Web Audio synth for SFX + background music — no external assets.
let ctx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let musicGain: GainNode | null = null;
let sfxGain: GainNode | null = null;
let musicTimer: number | null = null;
let musicEnabled = true;
let sfxEnabled = true;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.7;
    masterGain.connect(ctx.destination);
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.18;
    musicGain.connect(masterGain);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = 0.45;
    sfxGain.connect(masterGain);
  }
  return ctx;
}

export async function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") {
    try { await c.resume(); } catch { /* ignore */ }
  }
}

function envBeep(freq: number, dur: number, type: OscillatorType, vol = 1, slideTo?: number) {
  const c = getCtx();
  if (!c || !sfxGain || !sfxEnabled) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(sfxGain);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBurst(dur: number, vol = 0.5, filterFreq = 1200) {
  const c = getCtx();
  if (!c || !sfxGain || !sfxEnabled) return;
  const t = c.currentTime;
  const buffer = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filter = c.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter); filter.connect(g); g.connect(sfxGain);
  src.start(t);
}

export const sfx = {
  shoot() { envBeep(880, 0.09, "square", 0.35, 320); },
  hit() { envBeep(220, 0.12, "sawtooth", 0.45, 90); noiseBurst(0.08, 0.25, 1800); },
  enemyDie() { envBeep(180, 0.25, "triangle", 0.5, 60); noiseBurst(0.18, 0.35, 800); },
  playerHurt() { envBeep(140, 0.3, "sawtooth", 0.5, 70); noiseBurst(0.2, 0.4, 600); },
  coin() { envBeep(1200, 0.08, "square", 0.3); setTimeout(() => envBeep(1800, 0.12, "square", 0.3), 60); },
  heart() { envBeep(660, 0.1, "sine", 0.4); setTimeout(() => envBeep(990, 0.16, "sine", 0.4), 80); },
  wave() { envBeep(440, 0.15, "triangle", 0.4); setTimeout(() => envBeep(660, 0.2, "triangle", 0.4), 120); },
  victory() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => envBeep(f, 0.25, "triangle", 0.45), i * 130));
  },
  gameOver() {
    [392, 330, 262, 196].forEach((f, i) => setTimeout(() => envBeep(f, 0.3, "sawtooth", 0.4), i * 160));
  },
};

// Simple looping bassline + arpeggio
const MUSIC_NOTES = [196, 220, 262, 294, 330, 392, 440, 523]; // A minor pentatonic-ish
const BASS_NOTES = [98, 98, 110, 98, 130, 98, 110, 87];

export function startMusic() {
  const c = getCtx();
  if (!c || !musicGain || musicTimer !== null || !musicEnabled) return;
  let step = 0;
  const beat = 280; // ms per step
  const playStep = () => {
    if (!c || !musicGain) return;
    const t = c.currentTime;
    // bass
    const bassFreq = BASS_NOTES[step % BASS_NOTES.length];
    const bo = c.createOscillator();
    const bg = c.createGain();
    bo.type = "triangle";
    bo.frequency.value = bassFreq;
    bg.gain.setValueAtTime(0, t);
    bg.gain.linearRampToValueAtTime(0.5, t + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    bo.connect(bg); bg.connect(musicGain);
    bo.start(t); bo.stop(t + 0.3);
    // arp
    if (step % 2 === 0) {
      const note = MUSIC_NOTES[(step * 3) % MUSIC_NOTES.length];
      const ao = c.createOscillator();
      const ag = c.createGain();
      ao.type = "square";
      ao.frequency.value = note;
      ag.gain.setValueAtTime(0, t);
      ag.gain.linearRampToValueAtTime(0.18, t + 0.005);
      ag.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      ao.connect(ag); ag.connect(musicGain);
      ao.start(t); ao.stop(t + 0.2);
    }
    step++;
  };
  playStep();
  musicTimer = window.setInterval(playStep, beat);
}

export function stopMusic() {
  if (musicTimer !== null) {
    clearInterval(musicTimer);
    musicTimer = null;
  }
}

export function setMusicEnabled(on: boolean) {
  musicEnabled = on;
  if (!on) stopMusic();
}
export function setSfxEnabled(on: boolean) { sfxEnabled = on; }
export function isMusicEnabled() { return musicEnabled; }
export function isSfxEnabled() { return sfxEnabled; }
