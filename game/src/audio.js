// PURNAMA BAY - tiny WebAudio synth: no audio files, every effect is an
// oscillator or filtered noise burst shaped in code. The siren bed is two
// detuned oscillators whose gain follows the wanted level.
import { S } from './config.js';

let ctx = null;
let sirenNodes = null;
let muted = false;

export function audioInit() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch { ctx = null; }
}

export function audioToggleMute() {
  muted = !muted;
  if (sirenNodes) sirenNodes.gain.gain.value = muted ? 0 : 0.05;
  return muted;
}

export function audioIsMuted() { return muted; }

function tone(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'square';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(vol || 0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(ctx.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, freq) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq || 900;
  const g = ctx.createGain(); g.gain.value = vol || 0.2;
  src.connect(f); f.connect(g); g.connect(ctx.destination);
  src.start(t);
}

export const sfx = {
  punch() { noiseBurst(0.08, 0.25, 500); tone(120, 0.08, 'triangle', 0.15, 60); },
  kick() { noiseBurst(0.1, 0.3, 380); tone(95, 0.1, 'triangle', 0.18, 50); },
  shot() { noiseBurst(0.14, 0.4, 1800); tone(220, 0.1, 'sawtooth', 0.2, 55); },
  dryFire() { tone(1400, 0.04, 'square', 0.06); },
  pickup() { tone(660, 0.09, 'sine', 0.14); setTimeout(() => tone(990, 0.12, 'sine', 0.14), 70); },
  buy() { tone(880, 0.08, 'sine', 0.15); setTimeout(() => tone(1320, 0.14, 'sine', 0.15), 80); },
  denied() { tone(180, 0.16, 'square', 0.12, 120); },
  door() { tone(320, 0.07, 'triangle', 0.1, 210); },
  engine() { tone(70, 0.3, 'sawtooth', 0.08, 130); },
  missionDone() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sine', 0.14), i * 110)); },
  busted() { tone(392, 0.2, 'triangle', 0.16); setTimeout(() => tone(262, 0.34, 'triangle', 0.16), 180); },
  hurt() { tone(200, 0.09, 'sawtooth', 0.12, 140); },
  splash() { noiseBurst(0.22, 0.16, 620); },
  crate() { tone(150, 0.07, 'triangle', 0.16, 90); noiseBurst(0.05, 0.12, 800); },
};

// Siren bed: starts at 1+ stars, stops when the heat is gone.
export function sirenUpdate(stars) {
  if (!ctx) return;
  if (stars > 0 && !sirenNodes) {
    const o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = 700;
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 950;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 125;
    lfo.connect(lfoGain); lfoGain.connect(o1.frequency); lfoGain.connect(o2.frequency);
    const g = ctx.createGain(); g.gain.value = muted ? 0 : 0.045;
    o1.connect(g); o2.connect(g); g.connect(ctx.destination);
    o1.start(); o2.start(); lfo.start();
    sirenNodes = { o1, o2, lfo, gain: g };
  } else if (stars === 0 && sirenNodes) {
    try { sirenNodes.o1.stop(); sirenNodes.o2.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
    sirenNodes = null;
  }
  void S;
}
