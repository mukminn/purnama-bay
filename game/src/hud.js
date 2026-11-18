// PURNAMA BAY - the HUD: status box, objective line, wanted stars, the
// circular minimap, the contextual prompt, Mira's dialog box and the
// PURNAMA ARMS shop panel. Pure DOM + one 2D canvas; no framework.
import { S, CFG } from './config.js';
import { drawPortrait } from './textures.js';
import { W, decayProgress } from './wanted.js';
import { sfx } from './audio.js';
import { PLACES, PARK, ROAD_LINES } from './world.js';

const el = {};
let minimapTarget = null;
let lastMoney = -1; let lastHealth = -1; let lastStars = -1; let lastWeapon = '';
let lastSeenKey = ''; let lastStarBanner = ''; let lastDecayW = '';
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

// ------------------------------------------------------------------
// Round 11 (P2-1): floating texts - damage numbers over a hurt enemy
// and gold "+PB$" over the player when a job pays. World-anchored DOM
// nodes from a fixed pool; main.js supplies the world->screen projector
// (it owns the camera) and calls updateFloaters() every frame.
const floaters = [];
let floaterProjector = null;
export function setFloaterProjector(fn) { floaterProjector = fn; }
export function floatText(x, z, text, color) {
  const f = floaters.find((k) => !k.active) || floaters[0];
  if (!f) return;
  f.active = true;
  f.x = x; f.z = z;
  f.born = performance.now();
  f.el.textContent = text;
  f.el.style.color = color || '#ffffff';
  f.el.style.display = 'block';
}
export function updateFloaters() {
  const now = performance.now();
  for (const f of floaters) {
    if (!f.active) continue;
    const age = now - f.born;
    if (age > f.life || !floaterProjector) {
      f.active = false;
      f.el.style.display = 'none';
      continue;
    }
    const rise = age / f.life; // climbs ~46 px over its life
    const pr = floaterProjector(f.x, 2.1, f.z);
    if (!pr || !pr.visible) { f.el.style.display = 'none'; continue; }
    f.el.style.display = 'block';
    f.el.style.left = `${pr.sx}px`;
    f.el.style.top = `${pr.sy - rise * 46}px`;
    f.el.style.opacity = String(Math.max(0, 1 - rise * rise));
  }
}

// Round 11 (P2-5): the objective's distance in metres, a small line
// under the objective toast; during job 5's chase stage main appends
// the tail progress to the same line (P1-14).
let objDistText = '';
export function updateObjectiveDist(text) {
  const t = text || '';
  if (t === objDistText) return; // called per frame: write DOM only on change
  objDistText = t;
  if (!el['obj-dist']) return;
  if (objDistText) {
    el['obj-dist'].textContent = objDistText;
    el['obj-dist'].style.display = 'block';
  } else {
    el['obj-dist'].style.display = 'none';
  }
}

export function setMinimapTarget(t) { minimapTarget = t; }

// The last drawn player-arrow angle (canvas radians) and the heading of
// the player's actual velocity vector, for the direction probe.
const arrowState = { drawn: 0, vel: 0 };
export function hudInfo() {
  let d = arrowState.drawn - arrowState.vel;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return {
    arrowAngle: Math.round(arrowState.drawn * 1000) / 1000,
    velAngle: Math.round(arrowState.vel * 1000) / 1000,
    diffDeg: Math.round(Math.abs(d) * 180 / Math.PI * 10) / 10,
    speedKmh: S.inCar && S.currentCar ? Math.round(Math.abs(S.currentCar.speed) * 3.6) : 0,
    // round 11: the seen/unseen indicator state, the decay ring value,
    // the last wanted banner and the live floater count - all readable
    // by probes because none of it is audible/visible to a headless run
    seen: W.seenByPolice,
    decay: Math.round(decayProgress() * 100) / 100,
    seenText: el['hud-seen'] ? el['hud-seen'].textContent : '',
    wantedBanner: lastStarBanner,
    floaters: floaters.filter((f) => f.active).length,
    objDist: objDistText,
  };
}

export function initHUD(hooks) {
  for (const id of ['toast', 'stats', 'minimap', 'minimap-wrap', 'prompt',
    'hud-money', 'hud-health-fill', 'hud-stars', 'hud-weapon', 'speedo',
    'dialog', 'dialog-name', 'dialog-text', 'dialog-portrait', 'dialog-next',
    'shop', 'shop-msg', 'shop-money', 'banner',
    'hud-seen', 'hud-decay-fill', 'obj-dist',
    'dmg-vignette', 'dmg-dir', 'hitmarker', 'bigmap', 'map-overlay']) {
    el[id] = document.getElementById(id);
  }
  // round 11 (P2-1): the floating-text pool - a fixed set of DOM nodes
  // recycled for damage numbers and PB$ gains, never allocated per event
  const hudRoot = document.getElementById('hud');
  if (hudRoot && !floaters.length) {
    for (let i = 0; i < 12; i++) {
      const d = document.createElement('div');
      d.className = 'floater';
      d.style.display = 'none';
      hudRoot.appendChild(d);
      floaters.push({ el: d, active: false, x: 0, z: 0, born: 0, life: 1100 });
    }
  }
  el['dialog-next'].addEventListener('click', () => { hideDialog(); if (hooks && hooks.onDialog) hooks.onDialog(); });
  document.querySelectorAll('[data-buy]').forEach((b) => {
    b.addEventListener('click', () => { if (hooks && hooks.onBuy) hooks.onBuy(b.getAttribute('data-buy')); });
  });
  const close = document.getElementById('shop-close');
  if (close) close.addEventListener('click', () => closeShop());
  const wrap = document.getElementById('minimap-wrap');
  if (wrap) wrap.addEventListener('click', () => { if (hooks && hooks.onMap) hooks.onMap(); });
  const mapClose = document.getElementById('map-close');
  if (mapClose) mapClose.addEventListener('click', () => { if (hooks && hooks.onMap) hooks.onMap(); });
}

// ------------------------------------------------------------------
// Objective TOAST: the stage label appears centred at the top, stays
// ~4 s, then fades away - it never sits on screen permanently. Setting
// the same text twice in a row is ignored; empty text hides it at once.
let toastText = '';
let toastShownAt = 0;
let toastVisible = false;
export function setObjective(text) {
  const t = text || '';
  if (!el.toast) return;
  if (!t) {
    toastText = '';
    toastVisible = false;
    el.toast.style.opacity = '0';
    return;
  }
  if (t === toastText && toastVisible) return;
  toastText = t;
  el.toast.textContent = t;
  el.toast.style.opacity = '1';
  toastVisible = true;
  toastShownAt = performance.now();
}
export function toastInfo() {
  return {
    text: toastText,
    visible: toastVisible,
    shownAgoMs: toastShownAt ? Math.round(performance.now() - toastShownAt) : -1,
  };
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
    const prevStars = lastStars;
    lastStars = W.stars;
    el['hud-stars'].textContent = W.stars > 0 ? '★'.repeat(W.stars) + '☆'.repeat(5 - W.stars) : '';
    // round 11 (P2-2): a star change gets a banner + a hard sting, up
    // or down - not just a quiet glyph change in the corner
    if (prevStars >= 0 && S.mode === 'playing') {
      if (W.stars > prevStars) {
        lastStarBanner = `WANTED ${'★'.repeat(W.stars)}`;
        showBanner(lastStarBanner);
        sfx.wantedUp();
      } else if (W.stars < prevStars) {
        lastStarBanner = W.stars === 0 ? 'HEAT LOST - YOU ARE CLEAR' : `HEAT FADING ${'★'.repeat(W.stars)}`;
        showBanner(lastStarBanner);
        sfx.wantedDown();
      }
    }
  }
  // round 11 (P1-6): the seen/unseen eye beside the stars, plus the
  // decay ring (a slim bar) that fills while the player stays unseen -
  // it reads seenByPolice and decayProgress() straight from wanted.js
  if (el['hud-seen']) {
    const seenNow = W.stars > 0 && W.seenByPolice;
    const hiddenNow = W.stars > 0 && !W.seenByPolice;
    const seenKey = W.stars === 0 ? 'off' : (seenNow ? 'seen' : 'hidden');
    if (seenKey !== lastSeenKey) {
      lastSeenKey = seenKey;
      if (seenKey === 'off') {
        el['hud-seen'].style.display = 'none';
      } else {
        el['hud-seen'].style.display = 'block';
        el['hud-seen'].textContent = seenNow ? '👁 SEEN' : '👁‍🗨 HIDDEN';
        el['hud-seen'].style.color = seenNow ? '#ff6b57' : '#7ec8e3';
      }
    }
    if (el['hud-decay-fill']) {
      const w = hiddenNow ? `${Math.round(decayProgress() * 100)}%` : '0%';
      if (w !== lastDecayW) { lastDecayW = w; el['hud-decay-fill'].style.width = w; }
    }
  }
  const wtxt = weaponSnap.active === 'pistol' ? `PISTOL · ${weaponSnap.ammo}`
    : weaponSnap.active === 'baton' ? 'BASEBALL BAT'
      : weaponSnap.active === 'knife' ? 'KNIFE'
        : 'FISTS';
  if (wtxt !== lastWeapon) {
    lastWeapon = wtxt;
    el['hud-weapon'].textContent = wtxt;
  }
  // speedometer: only while driving
  if (el.speedo) {
    if (S.inCar && S.currentCar) {
      el.speedo.style.display = 'block';
      el.speedo.textContent = `${Math.round(Math.abs(S.currentCar.speed) * 3.6)} km/h`;
    } else {
      el.speedo.style.display = 'none';
    }
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
  // the objective toast fades out 4 s after it was shown
  if (toastVisible && el.toast && now - toastShownAt > 4000) {
    toastVisible = false;
    el.toast.style.opacity = '0';
  }
  drawMinimap();
}

// (The old status-box summary is gone with the box itself: the HUD is
// stars + money + health + weapon, one objective line, and nothing else.)

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
  // Player arrow: it must point along the ACTUAL velocity vector.
  // Map space: world +x -> canvas +x, world +z -> canvas -y (north up).
  // A world heading a has forward (sin a, cos a), which lands on the
  // canvas as (sin a, -cos a) - exactly what rotating the up-pointing
  // arrow by +a (canvas rotation is clockwise, y down) produces. The
  // old code rotated by -heading, which mirrored the arrow: it pointed
  // backwards/sideways against the real motion. When reversing, the
  // velocity heading is heading+PI (S.p.velHeading), so the arrow
  // flips with the motion, not with the nose.
  const velA = (S.p.moving || Math.abs(S.p.speed) > 0.2) ? S.p.velHeading : S.p.heading;
  arrowState.drawn = velA;
  arrowState.vel = velA;
  g.translate(half, half);
  g.rotate(velA);
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

// ------------------------------------------------------------------
// The full city map overlay: the whole bay on one 1000x800 canvas -
// water, land slab, beach, the road grid, building blocks, the park,
// the pier, place labels, live police / thug dots, the gold objective
// marker and the player's white arrow. World extent x [-165, 165],
// z [-165, 185], north (+z) up.
let mapOpenFlag = false;
let mapDrewPlayer = false;
let mapDrewObjective = false;
export function isMapOpen() { return mapOpenFlag; }
export function mapInfo() {
  return { open: mapOpenFlag, player: mapDrewPlayer, objective: mapDrewObjective };
}
export function openMap() {
  drawBigMap();
  const ov = document.getElementById('map-overlay');
  if (ov) ov.style.display = 'flex';
  mapOpenFlag = true;
}
export function closeMap() {
  const ov = document.getElementById('map-overlay');
  if (ov) ov.style.display = 'none';
  mapOpenFlag = false;
}
export function toggleMap() {
  if (mapOpenFlag) closeMap(); else openMap();
  return mapOpenFlag;
}
export function drawBigMap() {
  const c = el.bigmap || document.getElementById('bigmap');
  if (!c) return;
  const g = c.getContext('2d');
  const Wd = c.width; const Ht = c.height;
  const sx = Wd / 330; const sy = Ht / 350;
  const scale = (sx + sy) / 2;
  const X = (x) => (x + 165) * sx;
  const Y = (z) => Ht - (z + 165) * sy;
  // water everywhere first
  g.fillStyle = '#14607e'; g.fillRect(0, 0, Wd, Ht);
  // the city land slab + beach band
  g.fillStyle = '#9a8f74';
  g.fillRect(X(-148), Y(148), 296 * sx, 296 * sy);
  g.fillStyle = '#e6cf9a';
  g.fillRect(X(-148), Y(161), 296 * sx, 26 * sy);
  // roads, both axes
  g.strokeStyle = '#2e3237';
  g.lineWidth = 13 * scale;
  for (const r of ROAD_LINES) {
    g.beginPath(); g.moveTo(X(r), 0); g.lineTo(X(r), Ht); g.stroke();
    g.beginPath(); g.moveTo(0, Y(r)); g.lineTo(Wd, Y(r)); g.stroke();
  }
  // building blocks
  for (const b of S.colliders) {
    g.fillStyle = '#a8763e';
    g.strokeStyle = 'rgba(40,26,14,0.8)'; g.lineWidth = 1;
    const bx = X(b.minX); const by = Y(b.maxZ);
    const bw = (b.maxX - b.minX) * sx; const bh = (b.maxZ - b.minZ) * sy;
    g.fillRect(bx, by, bw, bh);
    g.strokeRect(bx, by, bw, bh);
  }
  // the park
  g.fillStyle = '#3e7d3a';
  g.fillRect(X(PARK.x - PARK.halfW), Y(PARK.z + PARK.halfD), PARK.halfW * 2 * sx, PARK.halfD * 2 * sy);
  // the pier deck
  g.fillStyle = '#8a6844';
  g.fillRect(X(PLACES.pier.x - 5), Y(182), 10 * sx, 44 * sy);
  // labels
  g.fillStyle = '#ffffff';
  g.font = 'bold 13px system-ui, sans-serif';
  g.textAlign = 'center';
  const label = (txt, x, z) => {
    g.strokeStyle = 'rgba(10,16,24,0.85)'; g.lineWidth = 3;
    g.strokeText(txt, X(x), Y(z));
    g.fillText(txt, X(x), Y(z));
  };
  label('PURNAMA ARMS', CFG.shopDoor.x, CFG.shopDoor.z);
  label('MIRA', CFG.miraSpot.x, CFG.miraSpot.z);
  label('SAFEHOUSE', CFG.safehouse.x, CFG.safehouse.z);
  label('HOTEL BULAN', PLACES.hotel.x, PLACES.hotel.z);
  label('GUDANG PELITA', PLACES.warehouse.x, PLACES.warehouse.z);
  label('PURNAMA GREEN', PARK.x, PARK.z);
  label('PIER', PLACES.pier.x, PLACES.pier.z);
  const dot = (x, z, color, r) => {
    g.fillStyle = color;
    g.beginPath(); g.arc(X(x), Y(z), r, 0, Math.PI * 2); g.fill();
  };
  for (const n of S.npcs) if (n.kind === 'thug') dot(n.x, n.z, '#3a3f45', 4);
  for (const u of S.policeUnits) dot(u.x, u.z, '#ff3b30', 5);
  dot(CFG.shopDoor.x, CFG.shopDoor.z, '#7ec8e3', 5);
  mapDrewObjective = !!minimapTarget;
  if (minimapTarget) {
    dot(minimapTarget.x, minimapTarget.z, '#ffd34d', 6);
    g.strokeStyle = '#ffd34d'; g.lineWidth = 2.5;
    g.beginPath(); g.arc(X(minimapTarget.x), Y(minimapTarget.z), 11, 0, Math.PI * 2); g.stroke();
  }
  // player arrow, rotated by the velocity heading (same maths as the
  // minimap arrow: world +z is canvas up, rotation is the heading)
  const velA = (S.p.moving || Math.abs(S.p.speed) > 0.2) ? S.p.velHeading : S.p.heading;
  g.save();
  g.translate(X(S.p.x), Y(S.p.z));
  g.rotate(velA);
  g.fillStyle = '#ffffff';
  g.strokeStyle = '#1d2733'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8); g.closePath();
  g.fill(); g.stroke();
  g.restore();
  g.fillStyle = '#ffffff';
  g.font = 'bold 12px system-ui, sans-serif';
  g.strokeStyle = 'rgba(10,16,24,0.85)'; g.lineWidth = 3;
  g.strokeText('YOU', X(S.p.x), Y(S.p.z) - 14);
  g.fillText('YOU', X(S.p.x), Y(S.p.z) - 14);
  mapDrewPlayer = true;
}
