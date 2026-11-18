// Procedural canvas textures: building facades with varied lit windows, shop
// signs and AC units, noisy asphalt with markings, tiled sidewalks, dock wood
// and moving gradient water. No external image is ever loaded.
import * as THREE from '../vendor/three.module.min.js';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, rx = 1, ry = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let seed = 7;
function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

export function facadeTexture(base, sign, signColor) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  // grime streaks
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.03 + rnd() * 0.06})`;
    g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 5, 20 + rnd() * 60);
  }
  const cols = 5, rows = 7;
  for (let x = 0; x < cols; x++) for (let y = 0; y < rows; y++) {
    const lit = rnd() > 0.45;
    g.fillStyle = lit ? (rnd() > 0.3 ? '#ffd98a' : '#bfe3ff') : '#22303e';
    g.fillRect(14 + x * 47, 14 + y * 30, 30, 19);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(14 + x * 47, 14 + y * 30, 30, 4);
    if (rnd() > 0.72) { // AC unit under a window
      g.fillStyle = '#9aa4ab'; g.fillRect(18 + x * 47, 35 + y * 30, 20, 9);
      g.fillStyle = '#6c757c'; g.fillRect(20 + x * 47, 37 + y * 30, 16, 2);
    }
  }
  if (sign) {
    g.fillStyle = '#14202b'; g.fillRect(0, 226, 256, 30);
    g.fillStyle = signColor || '#ffb347';
    g.font = 'bold 19px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText(sign, 128, 248);
  }
  return tex(c);
}

export function asphaltTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#33373c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5200; i++) {
    const v = 40 + rnd() * 40;
    g.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
    g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
  }
  for (let i = 0; i < 7; i++) { // cracks and patches
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    let x = rnd() * 256, y = rnd() * 256;
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) { x += (rnd() - 0.5) * 60; y += (rnd() - 0.5) * 60; g.lineTo(x, y); }
    g.stroke();
  }
  return tex(c, 6, 6);
}

export function sidewalkTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#8d9299'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) {
    const v = 120 + rnd() * 40;
    g.fillStyle = `rgb(${v},${v},${v - 4})`;
    g.fillRect(rnd() * 128, rnd() * 128, 2, 2);
  }
  g.strokeStyle = '#5f646a'; g.lineWidth = 3;
  g.strokeRect(0, 0, 128, 128);
  g.beginPath(); g.moveTo(64, 0); g.lineTo(64, 128); g.stroke();
  return tex(c, 8, 8);
}

export function waterTexture() {
  const [c, g] = canvas(256, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#1d6f8e');
  grad.addColorStop(0.55, '#14586f');
  grad.addColorStop(1, '#0d4258');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) { // sparkle strokes the caller scrolls via offset
    g.strokeStyle = `rgba(190,235,255,${0.05 + rnd() * 0.16})`;
    g.lineWidth = 1 + rnd() * 1.6;
    const x = rnd() * 256, y = rnd() * 256, len = 8 + rnd() * 26;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y); g.stroke();
  }
  return tex(c, 10, 4);
}

export function sandTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#c9a66b'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1500; i++) {
    const v = 170 + rnd() * 60;
    g.fillStyle = `rgb(${v},${v - 28},${v - 84})`;
    g.fillRect(rnd() * 128, rnd() * 128, 2, 2);
  }
  return tex(c, 14, 14);
}

// A small painted portrait for the mission contact, drawn once on a canvas.
export function portraitDataURL() {
  const [c, g] = canvas(96, 96);
  g.fillStyle = '#274b63'; g.fillRect(0, 0, 96, 96);
  g.fillStyle = '#12303f'; g.fillRect(0, 66, 96, 30); // jacket
  g.fillStyle = '#e8b08a'; g.beginPath(); g.arc(48, 42, 19, 0, Math.PI * 2); g.fill(); // face
  g.fillStyle = '#2b1c10'; g.beginPath(); g.arc(48, 31, 19, Math.PI, Math.PI * 2); g.fill(); // hair
  g.fillRect(29, 28, 6, 22); g.fillRect(61, 28, 6, 22);
  g.fillStyle = '#1d130a';
  g.beginPath(); g.arc(41, 43, 2.2, 0, Math.PI * 2); g.arc(55, 43, 2.2, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#8a4b2a'; g.lineWidth = 2;
  g.beginPath(); g.arc(48, 50, 7, 0.25, Math.PI - 0.25); g.stroke();
  g.fillStyle = '#f4c95d'; g.fillRect(44, 66, 8, 12); // radio badge
  return c.toDataURL();
}

export function woodTexture() {
  const [c, g] = canvas(128, 128);
  g.fillStyle = '#7a5a38'; g.fillRect(0, 0, 128, 128);
  for (let p = 0; p < 4; p++) {
    g.fillStyle = p % 2 ? '#83643d' : '#70522f';
    g.fillRect(0, p * 32, 128, 30);
    for (let i = 0; i < 26; i++) {
      g.strokeStyle = `rgba(40,24,8,${0.12 + rnd() * 0.2})`;
      g.lineWidth = 1;
      const y = p * 32 + rnd() * 28;
      g.beginPath(); g.moveTo(0, y); g.lineTo(128, y + (rnd() - 0.5) * 4); g.stroke();
    }
  }
  return tex(c, 4, 4);
}
