// PURNAMA BAY - fists, baton and pistol. Weapons are only ever gained two
// ways: bought at PURNAMA ARMS, or picked up from the ring a fallen armed
// thug drops. There is no other source, and no weapon yields money.
import * as THREE from 'three';
import { S, CFG, dist2d } from './config.js';
import { damageNPC, scareArea } from './population.js';
import { reportCrime } from './wanted.js';
import { sfx } from './audio.js';
import { showHitMarker } from './hud.js';

export const WPN = {
  owned: { fists: true, baton: false, pistol: false },
  active: 'fists',
  ammo: 0,
};

export function weaponsSnapshot() {
  return { active: WPN.active, owned: { ...WPN.owned }, ammo: WPN.ammo };
}

export function selectWeapon(name) {
  if (WPN.owned[name]) { WPN.active = name; return true; }
  return false;
}

// The shop counter. Returns a message for the shop panel.
export function buyItem(item) {
  if (item === 'baton') {
    if (WPN.owned.baton) return 'You already own the baton.';
    if (S.money < CFG.priceBaton) { sfx.denied(); return 'Not enough money.'; }
    S.money -= CFG.priceBaton;
    WPN.owned.baton = true;
    sfx.buy();
    return 'Baton purchased. Press 1 to equip it.';
  }
  if (item === 'pistol') {
    if (WPN.owned.pistol) return 'You already own the pistol.';
    if (S.money < CFG.pricePistol) { sfx.denied(); return 'Not enough money.'; }
    S.money -= CFG.pricePistol;
    WPN.owned.pistol = true;
    WPN.ammo += CFG.ammoPack;
    sfx.buy();
    return 'Pistol purchased with 12 rounds. Press 2 to equip it.';
  }
  if (item === 'ammo') {
    if (!WPN.owned.pistol) return 'You need a pistol first.';
    if (S.money < CFG.priceAmmo) { sfx.denied(); return 'Not enough money.'; }
    S.money -= CFG.priceAmmo;
    WPN.ammo += CFG.ammoPack;
    sfx.buy();
    return '12 rounds added.';
  }
  return '';
}

function frontTarget(maxDist, arc) {
  const p = S.p;
  let best = null; let bd = maxDist;
  for (const n of S.npcs) {
    if (n.kind === 'child' || n.state === 'down') continue;
    const d = dist2d(p.x, p.z, n.x, n.z);
    if (d > bd) continue;
    const ang = Math.atan2(n.x - p.x, n.z - p.z);
    let diff = ang - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) <= arc) { best = n; bd = d; }
  }
  return best;
}

// Input buffer: a swing pressed a fraction before the cooldown ends is
// queued and fires the moment it can, instead of being silently dropped.
let bufferedKind = '';
export function flushBufferedAttack() {
  if (!bufferedKind) return;
  if (S.inCar || S.mode !== 'playing') { bufferedKind = ''; return; }
  if (S.combat.attackCd > 0) return;
  const kind = bufferedKind;
  bufferedKind = '';
  meleeAttack(kind);
}

// One melee swing through the normal combat path. kind: 'punch' | 'kick'.
// A baton in hand turns a punch into a baton strike.
export function meleeAttack(kind) {
  const c = S.combat;
  if (S.inCar || S.mode !== 'playing') return false;
  if (c.attackCd > 0) { bufferedKind = kind; return true; }
  const effective = kind === 'punch' && WPN.active === 'baton' ? 'baton' : kind;
  c.attackCd = CFG.attackCooldown;
  c.attackT = CFG.attackWindow;
  c.attackKind = effective;
  c.lastKind = kind;
  c.lastAt = S.time;
  if (kind === 'kick') sfx.kick(); else sfx.punch();
  const dmg = effective === 'baton' ? CFG.batonDamage : (kind === 'kick' ? CFG.kickDamage : CFG.punchDamage);
  const target = frontTarget(CFG.attackRange, 1.25);
  scareArea(S.p.x, S.p.z, 5);
  if (target) {
    const result = damageNPC(target, dmg);
    if (result !== 'immune') showHitMarker();
    if (result !== 'immune' && result !== 'fled') {
      reportCrime(S.p.x, S.p.z, target);
    }
    if (result === 'down' && target.kind === 'thug' && target.armed) {
      spawnDrop('pistol', target.x, target.z);
    }
  }
  return true;
}

// A directed punch at the nearest adult, wherever the player is facing:
// the player turns to them first, then the normal melee path runs.
export function punchNearest() {
  const p = S.p;
  let best = null; let bd = 30;
  for (const n of S.npcs) {
    if (n.kind === 'child' || n.kind === 'animal' || n.state === 'down') continue;
    const d = dist2d(p.x, p.z, n.x, n.z);
    if (d < bd) { bd = d; best = n; }
  }
  if (!best) return false;
  p.heading = Math.atan2(best.x - p.x, best.z - p.z);
  S.combat.attackCd = 0;
  return meleeAttack('punch');
}

export function shoot() {
  if (WPN.active !== 'pistol' || S.inCar || S.mode !== 'playing') return false;
  if (WPN.ammo <= 0) { sfx.dryFire(); return false; }
  WPN.ammo--;
  S.stats.shotsFired++;
  sfx.shot();
  scareArea(S.p.x, S.p.z, 14);
  const target = frontTarget(34, 0.32);
  if (target) {
    const result = damageNPC(target, CFG.bulletDamage);
    if (result !== 'immune') { showHitMarker(); reportCrime(S.p.x, S.p.z, target); }
    if (result === 'down' && target.kind === 'thug' && target.armed) {
      spawnDrop('pistol', target.x, target.z);
    }
  } else {
    reportCrime(S.p.x, S.p.z, null);
  }
  return true;
}

// A glowing ring on the ground where a fallen armed thug dropped a weapon.
const dropGroup = new THREE.Group();
let dropSceneReady = false;
export function initDrops(scene) {
  if (!dropSceneReady) { scene.add(dropGroup); dropSceneReady = true; }
}

export function spawnDrop(weapon, x, z) {
  const geo = new THREE.TorusGeometry(0.85, 0.09, 8, 24);
  const mat = new THREE.MeshBasicMaterial({ color: weapon === 'pistol' ? 0xffd34d : 0x7ec8e3 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, 0.35, z);
  dropGroup.add(mesh);
  S.drops.push({ weapon, ammo: weapon === 'pistol' ? 12 : 0, x, z, mesh });
  return mesh;
}

export function dropsInfo() {
  return S.drops.map((d) => ({ weapon: d.weapon, ammo: d.ammo, x: Math.round(d.x * 10) / 10, z: Math.round(d.z * 10) / 10 }));
}

export function updateDrops(dt) {
  for (const d of S.drops) {
    d.mesh.rotation.z += dt * 1.6;
    d.mesh.position.y = 0.35 + Math.sin(S.time * 3 + d.x) * 0.08;
  }
}

// The display name the HUD and banners use for a weapon id.
export function weaponLabel(id) {
  return { fists: 'Fists', baton: 'Harbour Baton', pistol: 'Marlin Pistol' }[id] || id;
}

// Walk-over pickup is NOT automatic: the player presses E beside the ring.
export function pickupDropAt(x, z) {
  for (let i = 0; i < S.drops.length; i++) {
    const d = S.drops[i];
    if (dist2d(x, z, d.x, d.z) <= 2.1) {
      WPN.owned[d.weapon] = true;
      if (d.weapon === 'pistol') WPN.ammo += d.ammo;
      dropGroup.remove(d.mesh);
      S.drops.splice(i, 1);
      sfx.pickup();
      return d;
    }
  }
  return null;
}
