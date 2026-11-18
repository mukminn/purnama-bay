// PURNAMA BAY - the HUD: status box, objective line, wanted stars, the
// circular minimap, the contextual prompt, Mira's dialog box and the
// PURNAMA ARMS shop panel. Pure DOM + one 2D canvas; no framework.
import { S, CFG } from './config.js';
import { drawPortrait } from './textures.js';
import { W } from './wanted.js';

const el = {};
let minimapTarget = null;
let lastMoney = -1; let lastHealth = -1; let lastStars = -1; let lastWeapon = '';
// genre-style combat feedback state (DOM overlays declared in index.html)
let dmgAt = -1e9; let dmgBearing = 0; let hitAt = -1e9;

// Red edge vignette + a direction arc showing where the blow came from.
// `bearing` is the attacker's direction relative to the camera view
// (0 = ahead on screen, positive = clockwise to the right).
export function showDamage(bearing) {
  dmgAt = performance.now();
  dmgBearing = bearing || 0;
  S.feedback.flashes++;
  if (el['dmg-dir']) el['dmg-dir'].style.transform = `translate(-50%, -50%) rotate(${dmgBearing}rad)`;
}

// A brief centre-screen marker when the player's own attack connects.
export function showHitMarker() {
  hitAt = performance.now();
  S.feedback.hits++;
}

export function setMinimapTarget(t) { minimapTarget = t; }

export function initHUD(hooks) {
  for (const id of ['objective', 'status-box', 'minimap', 'minimap-wrap', 'prompt',
    'hud-money', 'hud-health-fill', 'hud-stars', 'hud-weapon',
    'dialog', 'dialog-name', 'dialog-text', 'dialog-portrait', 'dialog-next',
    'shop', 'shop-msg', 'shop-money', 'banner',
    'dmg-vignette', 'dmg-dir', 'hitmarker']) {
    el[id] = document.getElementById(id);
  }
  el['dialog-next'].addEventListener('click', () => { hideDialog(); if (hooks && hooks.onDialog) hooks.onDialog(); });
  document.querySelectorAll('[data-buy]').forEach((b) => {
    b.addEventListener('click', () => { if (hooks && hooks.onBuy) hooks.onBuy(b.getAttribute('data-buy')); });
  });
  const close = document.getElementById('shop-close');
  if (close) close.addEventListener('click', () => closeShop());
}

export function setObjective(text) {
  if (el.objective) el.objective.textContent = text || '';
}

export function showBanner(text) {
  if (!el.banner) return;
  el.banner.textContent = text;
  el.banner.style.opacity = '1';
  setTimeout(() => { el.banner.style.opacity = '0'; }, 2600);
}

export function showDialog(who, name, text) {
  if (!el.dialog) return;
  S.dialogOpen = true;
  el.dialog.style.display = 'flex';
  el['dialog-name'].textContent = name;
  el['dialog-text'].textContent = text;
  const c = el['dialog-portrait'];
  const g = c.getContext('2d');
  drawPortrait(g, who, c.width, c.height);
}

export function hideDialog() {
  S.dialogOpen = false;
  if (el.dialog) el.dialog.style.display = 'none';
}

export function setPrompt(text) {
  S.prompt = text || '';
  if (!el.prompt) return;
  if (text) {
    el.prompt.textContent = text;
    el.prompt.style.display = 'block';
  } else {
    el.prompt.style.display = 'none';
  }
}

export function openShop() {
  S.shopOpen = true;
  if (el.shop) el.shop.style.display = 'block';
  refreshShop('');
}

export function closeShop() {
  S.shopOpen = false;
  if (el.shop) el.shop.style.display = 'none';
}

export function refreshShop(msg) {
  if (el['shop-msg']) el['shop-msg'].textContent = msg || '';
  if (el['shop-money']) el['shop-money'].textContent = `PB$ ${S.money}`;
}

export function updateHUD(weaponSnap) {
  if (!el['hud-money']) return;
  if (S.money !== lastMoney) {
    lastMoney = S.money;
    el['hud-money'].textContent = `PB$ ${S.money}`;
    if (S.shopOpen) refreshShop(el['shop-msg'] ? el['shop-msg'].textContent : '');
  }
  const hp = Math.max(0, Math.round(S.health));
  if (hp !== lastHealth) {
    lastHealth = hp;
    el['hud-health-fill'].style.width = `${hp}%`;
    el['hud-health-fill'].style.background = hp > 35 ? '#57c256' : '#d94f3d';
  }
  if (W.stars !== lastStars) {
    lastStars = W.stars;
    el['hud-stars'].textContent = W.stars > 0 ? '★'.repeat(W.stars) + '☆'.repeat(5 - W.stars) : '';
  }
  const wtxt = weaponSnap.active === 'pistol' ? `PISTOL · ${weaponSnap.ammo}` : weaponSnap.active.toUpperCase();
  if (wtxt !== lastWeapon) {
    lastWeapon = wtxt;
    el['hud-weapon'].textContent = wtxt;
  }
  // fade the combat feedback overlays (damage flash ~0.55 s, hit ~0.22 s)
  const now = performance.now();
  if (el['dmg-vignette']) {
    const k = Math.max(0, 1 - (now - dmgAt) / 550);
    el['dmg-vignette'].style.opacity = (k * 0.85).toFixed(3);
    if (el['dmg-dir']) el['dmg-dir'].style.opacity = (k * 0.95).toFixed(3);
  }
  if (el['hitmarker']) {
    const k = Math.max(0, 1 - (now - hitAt) / 220);
    el['hitmarker'].style.opacity = k.toFixed(3);
  }
  drawMinimap();
}

// A one-line summary for the status box tooltip (money, heat, weapon).
export function statusSummary(weaponSnap) {
  return `PB$ ${S.money} · ${W.stars} star${W.stars === 1 ? '' : 's'} · ${weaponSnap.active}`;
}

// The minimap disc: sea to the north, sand, road grid, blocks, then the
// living dots - player arrow centre-ish, mission gold, police red.
function drawMinimap() {
  const c = el.minimap;
  if (!c) return;
  const g = c.getContext('2d');
  const size = c.width;
  const half = size / 2;
  const range = 95; // metres visible from centre to edge
  const scale = half / range;
  const px = S.p.x; const pz = S.p.z;
  g.clearRect(0, 0, size, size);
  g.save();
  g.beginPath(); g.arc(half, half, half - 1, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#8a8f66'; g.fillRect(0, 0, size, size);
  // sea band (world north, z high)
  const seaY = half - (148 - pz) * scale;
  g.fillStyle = '#14607e'; g.fillRect(0, 0, size, Math.max(0, seaY + 26 * scale));
  g.fillStyle = '#e6cf9a'; g.fillRect(0, Math.max(0, seaY), size, 26 * scale);
  // roads
  g.strokeStyle = '#2e3237'; g.lineWidth = Math.max(2, 13 * scale);
  for (const r of [-120, -80, -40, 0, 40, 80, 120]) {
    const vx = half + (r - px) * scale;
    g.beginPath(); g.moveTo(vx, 0); g.lineTo(vx, size); g.stroke();
    const hz = half - (r - pz) * scale;
    g.beginPath(); g.moveTo(0, hz); g.lineTo(size, hz); g.stroke();
  }
  // buildings as warm blocks
  g.fillStyle = '#c97e3f';
  for (const b of S.colliders) {
    const bx = half + ((b.minX + b.maxX) / 2 - px) * scale;
    const bz = half - ((b.minZ + b.maxZ) / 2 - pz) * scale;
    const bw = Math.max(2, (b.maxX - b.minX) * scale);
    const bh = Math.max(2, (b.maxZ - b.minZ) * scale);
    g.fillRect(bx - bw / 2, bz - bh / 2, bw, bh);
  }
  const dot = (x, z, color, r) => {
    const dx = half + (x - px) * scale;
    const dy = half - (z - pz) * scale;
    if (dx < -4 || dy < -4 || dx > size + 4 || dy > size + 4) return;
    g.fillStyle = color;
    g.beginPath(); g.arc(dx, dy, r, 0, Math.PI * 2); g.fill();
  };
  for (const car of S.cars) dot(car.x, car.z, car.isTarget ? '#ff9d2e' : '#d8d8d8', 2);
  for (const n of S.npcs) if (n.kind === 'thug') dot(n.x, n.z, '#8c2e2e', 2);
  for (const u of S.policeUnits) dot(u.x, u.z, '#ff3b30', 2.6);
  if (minimapTarget) dot(minimapTarget.x, minimapTarget.z, '#ffd34d', 4);
  dot(CFG.shopDoor.x, CFG.shopDoor.z, '#7ec8e3', 2.6);
  // player arrow, rotated to heading (map north = world +z up)
  g.translate(half, half);
  g.rotate(-S.p.heading);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1d2733';
  g.beginPath(); g.moveTo(0, -6); g.lineTo(4.4, 5); g.lineTo(0, 2.4); g.lineTo(-4.4, 5); g.closePath();
  g.fill(); g.stroke();
  g.restore();
  g.strokeStyle = 'rgba(20,30,40,0.65)'; g.lineWidth = 3;
  g.beginPath(); g.arc(half, half, half - 2, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#ffffff';
  g.font = 'bold 11px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('N', half, 13);
}
