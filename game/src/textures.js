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
  t.anisotropy = 4;
  return t;
}

// A sun-bleached tropical facade: plaster wall, rows of windows, trim band.
export function facadeTexture(base, trim, floors) {
  const [c, g] = canvasOf(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  g.fillStyle = trim; g.fillRect(0, 0, 256, 14);
  const rows = floors || 4;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < 4; col++) {
      const x = 18 + col * 60; const y = 30 + r * 56;
      g.fillStyle = '#20303a'; g.fillRect(x, y, 34, 38);
      g.fillStyle = 'rgba(150,220,255,0.55)'; g.fillRect(x + 3, y + 3, 28, 15);
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
  } else { // plaza paving
    g.fillStyle = '#b8ab90'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(90,80,60,0.5)'; g.lineWidth = 2;
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
  g.fillStyle = '#3c4147'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(255,255,255,0.05)';
  for (let i = 0; i < 260; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 2);
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, 6, 256); g.fillRect(250, 0, 6, 256);
  const t = toTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// A painted shop sign with real lettering.
export function signTexture(text, bg, fg) {
  const [c, g] = canvasOf(512, 128);
  g.fillStyle = bg; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, 496, 112);
  g.fillStyle = fg;
  g.font = 'bold 52px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 256, 66);
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

// Palm frond texture with alpha, used on crossed planes for cheap trees.
export function frondTexture() {
  const [c, g] = canvasOf(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#2e7d32'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    g.beginPath(); g.moveTo(64, 64);
    g.quadraticCurveTo(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34 - 8, 64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58 + 10);
    g.stroke();
  }
  return toTexture(c);
}
