// PURNAMA BAY - fists, baton and pistol. Weapons are only ever gained two
// ways: bought at PURNAMA ARMS, or picked up from the ring a fallen armed
// thug drops. There is no other source, and no weapon yields money.
import * as THREE from 'three';
import { S, CFG, dist2d } from './config.js';
import { damageNPC, scareArea } from './population.js';
import { reportCrime } from './wanted.js';
import { sfx } from './audio.js';
import { showHitMarker, floatText } from './hud.js';

export const WPN = {
  owned: { fists: true, baton: false, pistol: false, knife: false },
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
    if (WPN.owned.baton) return 'You already own the baseball bat.';
    if (S.money < CFG.priceBaton) { sfx.denied(); return 'Not enough money.'; }
    S.money -= CFG.priceBaton;
    WPN.owned.baton = true;
    sfx.buy();
    return 'Baseball bat purchased. Press 1 to equip it.';
  }
  if (item === 'knife') {
    if (WPN.owned.knife) return 'You already own the knife.';
    if (S.money < CFG.priceKnife) { sfx.denied(); return 'Not enough money.'; }
    S.money -= CFG.priceKnife;
    WPN.owned.knife = true;
    sfx.buy();
    return 'Knife purchased. Press 4 to equip it.';
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
    if (n.kind === 'child' || n.state === 'down' || n.state === 'dead') continue;
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
  const effective = kind === 'punch' && WPN.active === 'baton' ? 'baton'
    : (kind === 'punch' && WPN.active === 'knife' ? 'knife' : kind);
  c.attackCd = CFG.attackCooldown;
  c.attackT = CFG.attackWindow;
  c.attackKind = effective;
  c.lastKind = kind;
  c.lastAt = S.time;
  S.combat.fightT = CFG.fightModeTime;
  if (kind === 'kick') sfx.kick(); else sfx.punch();
  const dmg = effective === 'baton' ? CFG.batonDamage
    : (effective === 'knife' ? CFG.knifeDamage : (kind === 'kick' ? CFG.kickDamage : CFG.punchDamage));
  const target = frontTarget(CFG.attackRange, 1.25);
  scareArea(S.p.x, S.p.z, 5);
  if (target) {
    const result = damageNPC(target, dmg);
    if (result !== 'immune') { showHitMarker(); floatText(target.x, target.z, `-${dmg}`, '#ffffff'); }
    if (result !== 'immune' && result !== 'fled') {
      reportCrime(S.p.x, S.p.z, target);
    }
    if (result === 'down' && target.kind === 'thug' && target.weapon && !target.hasDropped) {
      target.hasDropped = true; // round 11: a risen thug never drops twice
      spawnDrop(target.weapon, target.x, target.z);
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
    if (n.kind === 'child' || n.kind === 'animal' || n.state === 'down' || n.state === 'dead') continue;
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
  S.combat.fightT = CFG.fightModeTime;
  sfx.shot();
  scareArea(S.p.x, S.p.z, 14);
  const target = frontTarget(34, 0.32);
  if (target) {
    const result = damageNPC(target, CFG.bulletDamage);
    if (result !== 'immune') { showHitMarker(); floatText(target.x, target.z, `-${CFG.bulletDamage}`, '#ffffff'); reportCrime(S.p.x, S.p.z, target); }
    if (result === 'down' && target.kind === 'thug' && target.weapon && !target.hasDropped) {
      target.hasDropped = true; // round 11: a risen thug never drops twice
      spawnDrop(target.weapon, target.x, target.z);
    }
  } else {
    reportCrime(S.p.x, S.p.z, null);
  }
  return true;
}

// A glowing ring on the ground where a fallen armed thug dropped a
// weapon. Round 11 (P1-10): rings come from a small POOL - a picked-up
// ring's mesh is hidden and reused for the next drop instead of a new
// geometry/material being allocated for every felled thug.
// Round 12: the pool alone did NOT bound S.drops - records accumulated
// without limit, and when the pool ran dry spawnDrop stole dropPool[0],
// a mesh another live record still pointed at (two records, one ring:
// picking one up hid the other). Now S.drops is hard-capped at
// CFG.maxDrops with oldest-first eviction, every drop ages out after
// CFG.dropDespawnT seconds, and a mesh is only ever reused once its
// owning record has been spliced out of S.drops.
const dropGroup = new THREE.Group();
let dropSceneReady = false;
const dropPool = [];
export function initDrops(scene) {
  if (!dropSceneReady) { scene.add(dropGroup); dropSceneReady = true; }
}

// Return the drop at index i to the pool: hide its ring and SPLICE the
// record out of S.drops. This is the single exit path for drops
// (pickup, despawn and eviction all go through it).
function releaseDropAt(i) {
  const d = S.drops[i];
  if (!d) return null;
  if (d.mesh) d.mesh.visible = false; // ring returns to the pool
  S.drops.splice(i, 1);
  return d;
}

export function spawnDrop(weapon, x, z) {
  // hard cap: evict the OLDEST live drops until there is room - their
  // rings go back to the pool, so the mesh reuse below can never steal
  // a ring that a live record still owns
  while (S.drops.length >= CFG.maxDrops) releaseDropAt(0);
  const dropColor = weapon === 'pistol' ? 0xffd34d : (weapon === 'knife' ? 0x9fd4ff : (weapon === 'baton' ? 0xc9973f : 0x7ec8e3));
  let mesh = dropPool.find((m) => !m.visible);
  if (!mesh && dropPool.length < CFG.maxDrops) {
    const geo = new THREE.TorusGeometry(0.85, 0.09, 8, 24);
    const mat = new THREE.MeshStandardMaterial({ color: dropColor, emissive: dropColor, emissiveIntensity: 0.9, roughness: 0.4 });
    mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = Math.PI / 2;
    dropGroup.add(mesh);
    dropPool.push(mesh);
  }
  if (!mesh) return null; // unreachable while the cap invariant holds
  mesh.material.color.setHex(dropColor);
  mesh.material.emissive.setHex(dropColor);
  mesh.position.set(x, 0.35, z);
  mesh.visible = true;
  S.drops.push({ weapon, ammo: weapon === 'pistol' ? 12 : 0, x, z, mesh, age: 0 });
  return mesh;
}

export function dropsInfo() {
  return S.drops.map((d) => ({ weapon: d.weapon, ammo: d.ammo, x: Math.round(d.x * 10) / 10, z: Math.round(d.z * 10) / 10 }));
}

export function updateDrops(dt) {
  // backwards walk: a drop that outlives CFG.dropDespawnT despawns in
  // place - record spliced from S.drops, ring hidden back into the pool
  for (let i = S.drops.length - 1; i >= 0; i--) {
    const d = S.drops[i];
    d.age = (d.age || 0) + dt;
    if (d.age >= CFG.dropDespawnT) { releaseDropAt(i); continue; }
    d.mesh.rotation.z += dt * 1.6;
    d.mesh.position.y = 0.35 + Math.sin(S.time * 3 + d.x) * 0.08;
  }
}

// The display name the HUD and banners use for a weapon id.
export function weaponLabel(id) {
  return { fists: 'Fists', baton: 'Slugger Baseball Bat', knife: 'Dock Knife', pistol: 'Marlin Pistol' }[id] || id;
}

// Walk-over pickup is NOT automatic: the player presses E beside the ring.
export function pickupDropAt(x, z) {
  for (let i = 0; i < S.drops.length; i++) {
    const d = S.drops[i];
    if (dist2d(x, z, d.x, d.z) <= 2.1) {
      WPN.owned[d.weapon] = true;
      if (d.weapon === 'pistol') WPN.ammo += d.ammo;
      releaseDropAt(i); // ring back into the pool, record spliced out
      sfx.pickup();
      return d;
    }
  }
  return null;
}
