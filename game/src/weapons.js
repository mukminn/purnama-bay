// Weapons & economy: fists from the start, everything else earned — either
// bought at PURNAMA ARMS with mission money, or looted from a fallen armed
// thug (gold ring pickup, ACT to take, limited ammo). Locked slots stay
// visible in the HUD, greyed with a lock, and cannot be selected.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

export function createWeapons() {
  const inv = {
    owned: { baton: false, pistol: false },
    active: 'fists',
    ammo: 0,
    select(id) {
      if (id === 'fists') { inv.active = 'fists'; return true; }
      if (!inv.owned[id]) return false; // locked: refuse, HUD shows the lock
      inv.active = id;
      return true;
    },
    cycle() {
      const order = ['fists', 'baton', 'pistol'];
      for (let step = 1; step <= 3; step++) {
        const next = order[(order.indexOf(inv.active) + step) % 3];
        if (next === 'fists' || inv.owned[next]) { inv.active = next; return inv.active; }
      }
      return inv.active;
    },
    gain(id, ammo = 0) {
      if (id === 'baton') inv.owned.baton = true;
      if (id === 'pistol') { inv.owned.pistol = true; inv.ammo += ammo; }
      inv.active = id;
    },
  };
  return inv;
}

// The shop till. spend(amount) is supplied by main (the only place money
// moves besides mission rewards and the busted fine) and returns false when
// the balance cannot cover it.
export function buyItem(item, inv, spend) {
  if (item === 'baton') {
    if (inv.owned.baton) return { ok: false, msg: 'You already own the baton.' };
    if (!spend(CFG.prices.baton)) return { ok: false, msg: `Not enough money — baton costs ${CFG.currency} ${CFG.prices.baton}.` };
    inv.owned.baton = true;
    return { ok: true, msg: `Baton bought for ${CFG.currency} ${CFG.prices.baton}. Slot 1 unlocked.` };
  }
  if (item === 'pistol') {
    if (inv.owned.pistol) return { ok: false, msg: 'You already own the pistol. Buy ammo instead.' };
    if (!spend(CFG.prices.pistol)) return { ok: false, msg: `Not enough money — pistol costs ${CFG.currency} ${CFG.prices.pistol}.` };
    inv.owned.pistol = true;
    inv.ammo += 12;
    return { ok: true, msg: `Pistol bought for ${CFG.currency} ${CFG.prices.pistol} (12 rounds included).` };
  }
  if (item === 'ammo') {
    if (!inv.owned.pistol) return { ok: false, msg: 'You need a pistol before buying ammo.' };
    if (!spend(CFG.prices.ammo)) return { ok: false, msg: `Not enough money — ammo costs ${CFG.currency} ${CFG.prices.ammo}.` };
    inv.ammo += CFG.ammoPack;
    return { ok: true, msg: `+${CFG.ammoPack} rounds for ${CFG.currency} ${CFG.prices.ammo}.` };
  }
  return { ok: false, msg: 'Unknown item.' };
}

// --- loot drops: a gold ring on the ground where an armed thug fell ---
export function createDrops(scene) {
  const drops = [];
  const ringGeo = new THREE.TorusGeometry(0.85, 0.07, 8, 24);
  const ringMat = new THREE.MeshLambertMaterial({ color: 0xffc93c, emissive: 0xa87408, emissiveIntensity: 1.4 });
  return {
    drops,
    spawn(x, z, weapon, ammo = 0) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 0.12, z);
      scene.add(ring);
      const icon = new THREE.Mesh(
        new THREE.BoxGeometry(weapon === 'pistol' ? 0.16 : 0.1, weapon === 'pistol' ? 0.26 : 0.7, weapon === 'pistol' ? 0.5 : 0.1),
        new THREE.MeshLambertMaterial({ color: 0x22242a }),
      );
      icon.position.set(x, 0.55, z);
      scene.add(icon);
      drops.push({ x, z, weapon, ammo, ring, icon });
    },
    update(t) {
      for (const d of drops) {
        d.ring.rotation.z = t * 1.4;
        d.icon.position.y = 0.55 + Math.sin(t * 3 + d.x) * 0.08;
        d.icon.rotation.y = t * 1.1;
      }
    },
    nearest(x, z, maxD = 2.2) {
      let best = null, bd = maxD;
      for (const d of drops) {
        const dist = Math.hypot(d.x - x, d.z - z);
        if (dist < bd) { bd = dist; best = d; }
      }
      return best;
    },
    take(drop) {
      scene.remove(drop.ring); scene.remove(drop.icon);
      drops.splice(drops.indexOf(drop), 1);
    },
    clear() { while (drops.length) this.take(drops[0]); },
  };
}

// Damage table per attack kind (single source, mirrors CFG).
export function damageFor(kind, inv) {
  if (kind === 'kick') return CFG.kickDamage;
  if (kind === 'punch') return inv && inv.active === 'baton' ? CFG.batonDamage : CFG.punchDamage;
  if (kind === 'shot') return CFG.pistolDamage;
  return CFG.punchDamage;
}
export function cooldownFor(kind, inv) {
  if (kind === 'kick') return CFG.kickCooldown;
  if (kind === 'shot') return CFG.pistolCooldown;
  if (inv && inv.active === 'baton') return CFG.batonCooldown;
  return CFG.punchCooldown;
}
export function rangeFor(kind, inv) {
  if (kind === 'kick') return CFG.kickRange;
  if (inv && inv.active === 'baton') return CFG.batonRange;
  return CFG.punchRange;
}

// Melee: find the best adult target in front of the attacker. Children are
// filtered out here — they can never be a melee target.
export function meleeTarget(people, policeUnits, x, z, heading, range) {
  let best = null, bestScore = -Infinity;
  const fx = Math.sin(heading), fz = Math.cos(heading);
  function consider(px, pz, ref, kind) {
    const dx = px - x, dz = pz - z;
    const d = Math.hypot(dx, dz);
    if (d > range + 0.35) return;
    const dot = d < 0.001 ? 1 : (dx * fx + dz * fz) / d;
    if (d > 0.8 && dot < 0.25) return;
    const score = dot * 2 - d;
    if (score > bestScore) { bestScore = score; best = { ref, kind, dist: d }; }
  }
  for (const p of people) {
    if (p.kind === 'child' || p.state === 'down') continue;
    consider(p.pos.x, p.pos.z, p, 'person');
  }
  for (const u of policeUnits) {
    if (u.kind !== 'foot') continue;
    consider(u.pos.x, u.pos.z, u, 'officer');
  }
  return best;
}

// Pistol ray: manual sphere tests against adults, officers and cars, plus a
// building stop via the world colliders. Children are never in the list.
export function rayHit(origin, dir, people, policeUnits, cars, colliders, maxDist = CFG.pistolRange) {
  let best = null;
  function sphere(cx, cy, cz, r, ref, kind) {
    const ox = cx - origin.x, oy = cy - origin.y, oz = cz - origin.z;
    const t = ox * dir.x + oy * dir.y + oz * dir.z;
    if (t < 0 || t > maxDist) return;
    const px = origin.x + dir.x * t, py = origin.y + dir.y * t, pz = origin.z + dir.z * t;
    const d = Math.hypot(cx - px, cy - py, cz - pz);
    if (d < r && (!best || t < best.t)) best = { t, ref, kind, point: { x: px, y: py, z: pz } };
  }
  for (const p of people) {
    if (p.kind === 'child' || p.state === 'down') continue;
    const s = (p.group.scale.x || 1);
    sphere(p.pos.x, 1.05 * s, p.pos.z, 0.55, p, 'person');
  }
  for (const u of policeUnits) {
    if (u.kind === 'foot') sphere(u.pos.x, 1.05, u.pos.z, 0.55, u, 'officer');
    else sphere(u.pos.x, 0.8, u.pos.z, 1.9, u.car, 'car');
  }
  for (const c of cars) sphere(c.pos.x, 0.8, c.pos.z, 1.9, c, 'car');
  // buildings stop the bullet
  for (const col of colliders) {
    // slab test on the XZ footprint at chest height
    let tmin = 0, tmax = maxDist;
    const axes = [['x', col.minX, col.maxX], ['z', col.minZ, col.maxZ]];
    let ok = true;
    for (const [axis, mn, mx] of axes) {
      const o = origin[axis], d = dir[axis];
      if (Math.abs(d) < 1e-6) { if (o < mn || o > mx) { ok = false; break; } }
      else {
        let t1 = (mn - o) / d, t2 = (mx - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
        if (tmin > tmax) { ok = false; break; }
      }
    }
    if (ok && tmin > 0 && tmin < maxDist && (!best || tmin < best.t)) {
      best = { t: tmin, ref: null, kind: 'wall', point: { x: origin.x + dir.x * tmin, y: origin.y + dir.y * tmin, z: origin.z + dir.z * tmin } };
    }
  }
  return best;
}
