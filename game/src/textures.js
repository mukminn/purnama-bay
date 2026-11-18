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

// Data maps (roughness / normal) must NOT be sRGB: linear values only.
function toDataTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 1;
  return t;
}

// Derive a tangent-space normal map from a colour canvas: Sobel gradients
// of the luminance become the XY tilt, Z stays dominant. `strength` scales
// the tilt (0.6 roads, 0.8 plaza, 1.0 facades by default).
export function normalFromCanvas(src, strength = 1) {
  const w = src.width; const h = src.height;
  const [sc, sg] = canvasOf(w, h);
  sg.drawImage(src, 0, 0);
  const data = sg.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
  const [c, g] = canvasOf(w, h);
  const out = g.createImageData(w, h);
  const at = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1)) - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
      let nx = -dx * strength; let ny = dy * strength; let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      const o = (y * w + x) * 4;
      out.data[o] = ((nx / len) * 0.5 + 0.5) * 255;
      out.data[o + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      out.data[o + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      out.data[o + 3] = 255;
    }
  }
  g.putImageData(out, 0, 0);
  void sc;
  return toDataTexture(c);
}

// A bright-day facade with LAYERED PBR maps painted in one pass: the
// colour canvas (warm plaster, windows reflecting the daytime sky, a
// diagonal shine streak on some panes, ~10% of windows lit), a roughness
// canvas painted in the same loop (plaster ~235 rough, glass ~46 smooth,
// trim band ~128) and a Sobel normal map derived from the colour canvas.
export function facadeMaps(base, trim, floors) {
  const [c, g] = canvasOf(256, 256);
  const [rc, rg] = canvasOf(256, 256);
  rg.fillStyle = 'rgb(235,235,235)'; rg.fillRect(0, 0, 256, 256); // plaster
  g.fillStyle = base; g.fillRect(0, 0, 256, 256);
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 300; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  g.fillStyle = 'rgba(70,40,20,0.10)'; // faint weather streaks under the eaves
  for (let i = 0; i < 12; i++) { const x = Math.random() * 256; g.fillRect(x, 0, 3, 40 + Math.random() * 60); }
  g.fillStyle = trim; g.fillRect(0, 0, 256, 14);
  rg.fillStyle = 'rgb(128,128,128)'; rg.fillRect(0, 0, 256, 14); // trim band
  g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, 14, 256, 3);
  const rows = floors || 4;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < 4; col++) {
      const x = 18 + col * 60; const y = 30 + r * 56;
      const lit = Math.random() < 0.10;
      g.fillStyle = '#20303a'; g.fillRect(x, y, 34, 38);
      rg.fillStyle = 'rgb(46,46,46)'; rg.fillRect(x, y, 34, 38); // glass
      if (lit) { // a lit interior: warm amber with a blind line
        g.fillStyle = '#ffca7a'; g.fillRect(x + 3, y + 3, 28, 32);
        g.fillStyle = 'rgba(120,60,10,0.55)'; g.fillRect(x + 3, y + 16, 28, 3);
      } else { // glass reflecting the bright daytime sky
        const grad = g.createLinearGradient(x, y, x, y + 38);
        grad.addColorStop(0, 'rgba(190,225,250,0.9)');
        grad.addColorStop(1, 'rgba(70,120,170,0.65)');
        g.fillStyle = grad; g.fillRect(x + 3, y + 3, 28, 32);
        if ((r + col) % 3 === 0) { // one diagonal shine streak across the pane
          g.save();
          g.beginPath(); g.rect(x + 3, y + 3, 28, 32); g.clip();
          g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 5;
          g.beginPath(); g.moveTo(x - 4, y + 30); g.lineTo(x + 26, y - 2); g.stroke();
          g.restore();
        }
      }
      g.fillStyle = 'rgba(32,48,58,0.9)'; g.fillRect(x + 16, y + 3, 2, 32);
      g.fillStyle = trim; g.fillRect(x - 3, y + 38, 40, 5);
      rg.fillStyle = 'rgb(128,128,128)'; rg.fillRect(x - 3, y + 38, 40, 5);
    }
  }
  const map = toTexture(c);
  const roughnessMap = toDataTexture(rc);
  const normalMap = normalFromCanvas(c, 1.0);
  for (const t of [roughnessMap, normalMap]) { t.wrapS = t.wrapT = map.wrapS; }
  return { map, roughnessMap, normalMap };
}

export function facadeTexture(base, trim, floors) {
  return facadeMaps(base, trim, floors).map;
}

export function groundMaps(kind) {
  const [c, g] = canvasOf(256, 256);
  const [rc, rg] = canvasOf(256, 256);
  if (kind === 'sand') {
    g.fillStyle = '#e6cf9a'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(160,130,70,0.25)';
    for (let i = 0; i < 500; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    rg.fillStyle = 'rgb(250,250,250)'; rg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i++) { const v = 238 + Math.floor(Math.random() * 17); rg.fillStyle = `rgb(${v},${v},${v})`; rg.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
  } else if (kind === 'grass') {
    g.fillStyle = '#5d9c4e'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(30,90,30,0.35)';
    for (let i = 0; i < 700; i++) g.fillRect(Math.random() * 256, Math.random() * 256, 2, 4);
    rg.fillStyle = 'rgb(250,250,250)'; rg.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i++) { const v = 238 + Math.floor(Math.random() * 17); rg.fillStyle = `rgb(${v},${v},${v})`; rg.fillRect(Math.random() * 256, Math.random() * 256, 3, 3); }
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
    rg.fillStyle = 'rgb(230,230,230)'; rg.fillRect(0, 0, 256, 256); // tiles
    rg.strokeStyle = 'rgb(250,250,250)'; rg.lineWidth = 3; // grout lines rougher
    for (let i = 0; i <= 4; i++) {
      rg.beginPath(); rg.moveTo(i * 64, 0); rg.lineTo(i * 64, 256); rg.stroke();
      rg.beginPath(); rg.moveTo(0, i * 64); rg.lineTo(256, i * 64); rg.stroke();
    }
  }
  const map = toTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const roughnessMap = toDataTexture(rc);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  const out = { map, roughnessMap };
  if (kind === 'plaza') {
    out.normalMap = normalFromCanvas(c, 0.8);
    out.normalMap.wrapS = out.normalMap.wrapT = THREE.RepeatWrapping;
  }
  return out;
}

export function groundTexture(kind) {
  return groundMaps(kind).map;
}

export function roadMaps() {
  const [c, g] = canvasOf(256, 256);
  const [rc, rg] = canvasOf(256, 256);
  // dark asphalt: heavy speckle, tar patches, a few wandering cracks,
  // and edge lines worn down to dashes of paint. Roughness is painted in
  // the same pass: asphalt ~240, tar patches ~140 (smoother, shinier
  // when wet), edge paint ~180.
  rg.fillStyle = 'rgb(240,240,240)'; rg.fillRect(0, 0, 256, 256);
  g.fillStyle = '#2e3237'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2.4, 1.8);
  }
  g.fillStyle = 'rgba(12,14,17,0.35)';
  rg.fillStyle = 'rgb(140,140,140)';
  for (let i = 0; i < 5; i++) {
    const px = Math.random() * 200; const py = Math.random() * 200;
    const pw = 34 + Math.random() * 40; const ph = 22 + Math.random() * 30;
    g.fillRect(px, py, pw, ph);
    rg.fillRect(px, py, pw, ph);
  }
  g.strokeStyle = 'rgba(10,10,12,0.5)'; g.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    let x = Math.random() * 256; let y = Math.random() * 256;
    g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { x += (Math.random() - 0.5) * 36; y += Math.random() * 22; g.lineTo(x, y); }
    g.stroke();
  }
  rg.fillStyle = 'rgb(180,180,180)';
  rg.fillRect(2, 0, 5, 256); rg.fillRect(248, 0, 5, 256); // edge paint bands
  for (const ex of [2, 248]) { // worn edge paint: broken segments
    for (let y = 0; y < 256; y += 16) {
      if (Math.random() < 0.22) continue;
      g.fillStyle = `rgba(216,216,208,${0.35 + Math.random() * 0.4})`;
      g.fillRect(ex, y, 5, 11 + Math.random() * 4);
    }
  }
  const map = toTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const roughnessMap = toDataTexture(rc);
  roughnessMap.wrapS = roughnessMap.wrapT = THREE.RepeatWrapping;
  const normalMap = normalFromCanvas(c, 0.6);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  return { map, roughnessMap, normalMap };
}

export function roadTexture() {
  return roadMaps().map;
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
