// PURNAMA BAY - procedural canvas textures. No image files are loaded:
// every facade, sign and portrait is painted at boot on offscreen canvases.
import * as THREE from 'three';

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function toTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // anisotropy stays 1: at grazing angles (roads and plaza fill the
  // screen) anisotropic taps are the single most expensive fragment
  // cost on software rasterisers and integrated GPUs - measured in the
  // probe environment, aniso 4 on the road texture alone cost ~40% of
  // the frame. Mipmapped bilinear still reads clean at these texel sizes.
  t.anisotropy = 1;
  return t;
}

// A dusk-coast facade: warm plaster, rows of windows (some already lit
// amber for the evening), a neon-trim band along the top and sills.
export function facadeTexture(base, trim, floors) {
  const [c, g] = canvasOf(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  g.fillStyle = 'rgba(70,40,20,0.10)'; // faint weather streaks under the eaves
  for (let i = 0; i < 12; i++) { const x = Math.random() * 256; g.fillRect(x, 0, 3, 40 + Math.random() * 60); }
  g.fillStyle = trim; g.fillRect(0, 0, 256, 14);
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 14, 256, 3);
  const rows = floors || 4;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < 4; col++) {
      const x = 18 + col * 60; const y = 30 + r * 56;
      const lit = Math.random() < 0.16;
      g.fillStyle = '#20303a'; g.fillRect(x, y, 34, 38);
      if (lit) { // evening-lit window: warm amber with a blind line
        g.fillStyle = '#ffca7a'; g.fillRect(x + 3, y + 3, 28, 32);
        g.fillStyle = 'rgba(120,60,10,0.55)'; g.fillRect(x + 3, y + 16, 28, 3);
      } else { // glass catching the sunset sky
        const grad = g.createLinearGradient(x, y, x, y + 38);
        grad.addColorStop(0, 'rgba(255,170,120,0.75)');
        grad.addColorStop(1, 'rgba(90,140,190,0.55)');
        g.fillStyle = grad; g.fillRect(x + 3, y + 3, 28, 32);
      }
      g.fillStyle = 'rgba(32,48,58,0.9)'; g.fillRect(x + 16, y + 3, 2, 32);
      g.fillStyle = trim; g.fillRect(x - 3, y + 38, 40, 5);
    }
  }
  return toTexture(c);
}

export function groundTexture(kind) {
  const [c, g] = canvasOf(256, 256);
  if (kind === 'sand') {
    g.fillStyle = '#e6cf9a'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(160,130,70,0.25)';
    for (let i = 0; i < 500; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  } else if (kind === 'grass') {
    g.fillStyle = '#5d9c4e'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(30,90,30,0.35)';
    for (let i = 0; i < 700; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 4);
  } else { // plaza paving: large tiles, each tinted a touch differently
    g.fillStyle = '#a89a80'; g.fillRect(0, 0, 256, 256);
    for (let ty = 0; ty < 4; ty++) {
      for (let tx = 0; tx < 4; tx++) {
        const v = (Math.random() - 0.5) * 0.13;
        g.fillStyle = v > 0 ? `rgba(255,244,220,${v})` : `rgba(40,30,20,${-v})`;
        g.fillRect(tx * 64, ty * 64, 64, 64);
      }
    }
    g.fillStyle = 'rgba(60,50,38,0.20)';
    for (let i = 0; i < 650; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    g.strokeStyle = 'rgba(80,68,50,0.55)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke();
      g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke();
    }
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function roadTexture() {
  const [c, g] = canvasOf(256, 256);
  // dark, slightly wet-look dusk asphalt: heavy speckle, tar patches,
  // a few wandering cracks, and edge lines worn down to dashes of paint
  g.fillStyle = '#2e3237'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2.4, 1.8);
  }
  g.fillStyle = 'rgba(12,14,17,0.35)';
  for (let i = 0; i < 5; i++) g.fillRect(Math.random() * 200, Math.random() * 200, 34 + Math.random() * 40, 22 + Math.random() * 30);
  g.strokeStyle = 'rgba(10,10,12,0.5)'; g.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    let x = Math.random() * 256; let y = Math.random() * 256;
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (Math.random() - 0.5) * 36; y += Math.random() * 22; g.lineTo(x, y); }
    g.stroke();
  }
  for (const ex of [2, 248]) { // worn edge paint: broken segments
    for (let y = 0; y < 256; y += 16) {
      if (Math.random() < 0.22) continue;
      g.fillStyle = `rgba(216,216,208,${0.35 + Math.random() * 0.4})`;
      g.fillRect(ex, y, 5, 11 + Math.random() * 4);
    }
  }
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A neon shop sign: dark board, glowing tube lettering in the accent
// colour (canvas shadowBlur gives the tube its halo).
export function signTexture(text, bg, fg) {
  const [c, g] = canvasOf(512, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.shadowColor = fg; g.shadowBlur = 16;
  g.strokeStyle = fg; g.lineWidth = 4; g.strokeRect(10, 10, 492, 108);
  g.fillStyle = fg;
  g.font = 'bold 52px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
  g.fillText(text, 256, 66); // second pass deepens the glow core
  g.shadowBlur = 0;
  return toTexture(c);
}

// A stylised portrait head for the dialog box, painted per character.
export function drawPortrait(g, who, w, h) {
  const skin = who === 'mira' ? '#c98a5e' : '#a06a42';
  const hair = who === 'mira' ? '#241a14' : '#17120e';
  const shirt = who === 'mira' ? '#0f7d8c' : '#12716b';
  g.fillStyle = '#f3d9a4'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#7ec8e3'; g.fillRect(0, 0, w, h * 0.45);
  g.fillStyle = shirt;
  g.beginPath(); g.ellipse(w / 2, h * 1.02, w * 0.42, h * 0.34, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = skin;
  g.beginPath(); g.ellipse(w / 2, h * 0.52, w * 0.21, h * 0.26, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = hair;
  g.beginPath(); g.ellipse(w / 2, h * 0.36, w * 0.23, h * 0.16, 0, Math.PI, Math.PI * 2); g.fill();
  if (who === 'mira') { g.fillRect(w * 0.27, h * 0.36, w * 0.07, h * 0.34); g.fillRect(w * 0.66, h * 0.36, w * 0.07, h * 0.34); }
  g.fillStyle = '#1c1410';
  g.beginPath(); g.ellipse(w * 0.43, h * 0.52, w * 0.022, h * 0.02, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(w * 0.57, h * 0.52, w * 0.022, h * 0.02, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#7a4a2c'; g.lineWidth = Math.max(2, w * 0.012);
  g.beginPath(); g.arc(w / 2, h * 0.62, w * 0.07, 0.25, Math.PI - 0.25); g.stroke();
}

export function portraitTexture(who) {
  const [c, g] = canvasOf(128, 128);
  drawPortrait(g, who, 128, 128);
  return toTexture(c);
}

// A woven awning stripe for market stalls and cafe fronts.
export function awningTexture(a, b) {
  const [c, g] = canvasOf(128, 64);
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 16, 0, 16, 64); }
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 52, 128, 12);
  return toTexture(c);
}

// Palm frond texture with alpha, used on crossed planes for cheap trees:
// nine drooping fronds in two greens, each with fine leaflets implied by
// a second thinner stroke alongside the rib.
export function frondTexture() {
  const [c, g] = canvasOf(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.35;
    const ex = 64 + Math.cos(a) * 60; const ey = 64 + Math.sin(a) * 60 + 16; // tips droop
    const mx = 64 + Math.cos(a) * 34; const my = 64 + Math.sin(a) * 34 - 10;
    g.strokeStyle = i % 2 ? '#2e7d32' : '#43a047'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(64, 64);
    g.quadraticCurveTo(mx, my, ex, ey);
    g.stroke();
    g.strokeStyle = 'rgba(120,200,110,0.7)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(64, 64);
    g.quadraticCurveTo(mx + 3, my + 2, ex, ey);
    g.stroke();
  }
  return toTexture(c);
}
