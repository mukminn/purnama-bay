// Tiny Web Audio synth: every sound is an oscillator/noise recipe, no files.
// Audio starts only after the first user gesture (browser policy).
export function createAudio() {
  let ctx = null, master = null, muted = false, sirenNodes = null;
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }
  function tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }
  function noise(dur, vol = 0.25, freq = 1200, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, (dur * ctx.sampleRate) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }
  return {
    unlock() { ensure(); },
    setMuted(m) { muted = m; if (m) this.siren(false); },
    isMuted() { return muted; },
    punch() { noise(0.09, 0.3, 700); tone(120, 0.08, 'sine', 0.25, 60); },
    kick() { noise(0.13, 0.38, 500); tone(90, 0.13, 'sine', 0.3, 45); },
    swing() { noise(0.07, 0.1, 2400); },
    shot() { noise(0.16, 0.5, 3200); tone(160, 0.1, 'sawtooth', 0.2, 50); },
    dryFire() { tone(900, 0.04, 'square', 0.12); },
    hit() { tone(520, 0.06, 'square', 0.16, 300); },
    hurt() { tone(190, 0.14, 'sawtooth', 0.2, 90); },
    jump() { tone(280, 0.12, 'sine', 0.1, 420); },
    land() { noise(0.06, 0.12, 500); },
    coin() { tone(880, 0.09, 'square', 0.16); tone(1320, 0.14, 'square', 0.16, null, 0.08); },
    buy() { tone(660, 0.08, 'square', 0.15); tone(990, 0.12, 'square', 0.15, null, 0.07); },
    denied() { tone(160, 0.18, 'square', 0.18, 110); },
    door() { tone(140, 0.1, 'sine', 0.2, 90); noise(0.08, 0.1, 900); },
    crash(big = 1) { noise(0.3 * big, 0.4, 800); tone(70, 0.25, 'sine', 0.3, 40); },
    engine(on) { if (on) tone(80, 0.4, 'sawtooth', 0.08, 130); },
    pickup() { tone(520, 0.07, 'square', 0.15); tone(780, 0.1, 'square', 0.15, null, 0.06); },
    missionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.18, null, i * 0.1)); },
    busted() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'triangle', 0.18, null, i * 0.14)); },
    dialog() { tone(740, 0.05, 'square', 0.07); },
    step(run) { noise(0.04, run ? 0.1 : 0.05, 600); },
    splashStep() { noise(0.09, 0.08, 1500); },
    dogBark() { tone(300, 0.07, 'square', 0.1, 190); tone(320, 0.07, 'square', 0.1, 200, null, 0.11); },
    catMeow() { tone(620, 0.16, 'sine', 0.07, 880); },
    horn() { tone(370, 0.22, 'square', 0.12); tone(466, 0.22, 'square', 0.1, null, 0.01); },
    radioBlip() { tone(1180, 0.05, 'square', 0.06); tone(940, 0.06, 'square', 0.06, null, 0.07); },
    siren(on) {
      if (!ensure()) return;
      if (on && !sirenNodes && !muted) {
        const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = 760;
        lfo.frequency.value = 0.7; lg.gain.value = 190;
        lfo.connect(lg); lg.connect(o.frequency);
        g.gain.value = 0.045;
        o.connect(g); g.connect(master);
        o.start(); lfo.start();
        sirenNodes = { o, lfo };
      } else if (!on && sirenNodes) {
        try { sirenNodes.o.stop(); sirenNodes.lfo.stop(); } catch { /* already stopped */ }
        sirenNodes = null;
      }
    },
  };
}
