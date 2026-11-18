// PURNAMA BAY - the living population: citizens on errands, shopkeepers at
// their doors, dockworkers on the pier, children at play, syndicate thugs,
// and the bay's dogs and cats. Counts are the game's census targets.
import * as THREE from 'three';
import { S, CFG, dist2d, pushOut, clamp } from './config.js';
import { makePerson, makePersonRecord, makeAnimal, animatePerson, animateAnimal } from './characters.js';
import { PLACES } from './world.js';

export const CENSUS = { citizen: 16, shopkeeper: 5, dockworker: 6, child: 5, animal: 6, thug: 5 };

const WANDER_HALF = 112;

function scatter(half, avoid) {
  for (let tries = 0; tries < 24; tries++) {
    const x = (Math.random() * 2 - 1) * half;
    const z = (Math.random() * 2 - 1) * half;
    if (avoid && dist2d(x, z, avoid.x, avoid.z) < 26) continue;
    const probe = { x, z };
    pushOut(probe, 1.2);
    if (Math.abs(probe.x - x) < 0.01 && Math.abs(probe.z - z) < 0.01) return [x, z];
  }
  return [(Math.random() * 2 - 1) * half, (Math.random() * 2 - 1) * half];
}

function addPerson(scene, kind, x, z, opts) {
  const group = makePerson(opts);
  group.position.set(x, 0, z);
  scene.add(group);
  const rec = makePersonRecord(kind, group, x, z);
  S.npcs.push(rec);
  return rec;
}

export function buildPopulation(scene) {
  const hideCorner = { x: 130, z: -95 }; // kept empty: the quiet corner
  for (let i = 0; i < CENSUS.citizen; i++) {
    const [x, z] = scatter(WANDER_HALF, hideCorner);
    addPerson(scene, 'citizen', x, z, {});
  }
  const shopSpots = [
    [CFG.shopDoor.x - 3, CFG.shopDoor.z - 2], [PLACES.cafe.x + 3, PLACES.cafe.z - 2],
    [PLACES.garage.x + 4, PLACES.garage.z - 2], [PLACES.hotel.x + 4, PLACES.hotel.z - 2],
    [-6, 76],
  ];
  for (const [x, z] of shopSpots) {
    const rec = addPerson(scene, 'shopkeeper', x, z, { cap: 0x31435c });
    rec.state = 'stand'; rec.homeX = x; rec.homeZ = z;
  }
  for (let i = 0; i < CENSUS.dockworker; i++) {
    const x = -34 + i * 8 + (i % 2) * 3;
    const z = 96 + (i % 3) * 5;
    const rec = addPerson(scene, 'dockworker', x, z, { shirt: 0xd96f32, cap: 0xf5e9b8 });
    rec.homeX = x; rec.homeZ = z;
  }
  for (let i = 0; i < CENSUS.child; i++) {
    const [x, z] = scatter(50, hideCorner);
    addPerson(scene, 'child', x, z, { scale: 0.62, skirt: i % 2 === 0 });
  }
  // syndicate thugs loiter near the warehouse and the docks; two are armed
  const thugSpots = [[78, -52], [88, -74], [-24, 88], [70, -58], [-40, 100]];
  thugSpots.forEach(([x, z], i) => {
    const rec = addPerson(scene, 'thug', x, z, { shirt: 0x23272c, pants: 0x17191c, cap: 0x101214 });
    rec.armed = i % 2 === 0;
    rec.homeX = x; rec.homeZ = z;
  });
  for (let i = 0; i < CENSUS.animal; i++) {
    const [x, z] = scatter(WANDER_HALF, hideCorner);
    const rec = makeAnimal(x, z);
    scene.add(rec.group);
    S.npcs.push(rec);
  }
  // Mira Santoso, the mission contact, waits by the spawn plaza
  const mira = addPerson(scene, 'contact', CFG.miraSpot.x, CFG.miraSpot.z, { shirt: 0x0f7d8c, skirt: true });
  mira.state = 'stand'; mira.homeX = CFG.miraSpot.x; mira.homeZ = CFG.miraSpot.z; mira.isMira = true;
  return mira;
}

// Damage entry point for every person in the bay. The child law is enforced
// here first: a child record has no health and this function refuses it.
export function damageNPC(rec, dmg) {
  if (!rec || rec.kind === 'child') return 'immune';
  if (rec.state === 'down') return 'down';
  if (rec.kind === 'animal') { rec.state = 'flee'; rec.fleeT = 3; return 'fled'; }
  rec.health -= dmg;
  if (rec.health <= 0) {
    rec.state = 'down';
    rec.downT = 9;
    rec.animSpeed = 0;
    return 'down';
  }
  if (rec.kind === 'thug') { rec.state = 'hostile'; rec.hostileT = 14; }
  else { rec.state = 'flee'; rec.fleeT = 4; }
  return 'hurt';
}

// Scare everyone near a point (a swing, a shot, a crash).
export function scareArea(x, z, radius) {
  for (const n of S.npcs) {
    if (n.state === 'down' || n.kind === 'thug') continue;
    if (dist2d(n.x, n.z, x, z) < radius) { n.state = 'flee'; n.fleeT = 2.5; n.fleeX = x; n.fleeZ = z; }
  }
}

function steer(rec, tx, tz, speed, dt) {
  const dx = tx - rec.x; const dz = tz - rec.z;
  const d = Math.sqrt(dx * dx + dz * dz);
  if (d < 0.4) { rec.animSpeed = 0; return true; }
  const want = Math.atan2(dx, dz);
  let diff = want - rec.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  rec.heading += clamp(diff, -3.2 * dt, 3.2 * dt);
  const step = Math.min(d, speed * dt);
  rec.x += Math.sin(rec.heading) * step;
  rec.z += Math.cos(rec.heading) * step;
  rec.animSpeed = speed;
  return false;
}

export function updatePopulation(dt) {
  const p = S.p;
  for (const n of S.npcs) {
    if (n.state === 'down') {
      n.downT -= dt;
      if (n.downT <= 0 && n.kind !== 'child') {
        n.state = 'wander';
        if ('health' in n) n.health = Math.max(10, n.health);
      }
      syncMesh(n); continue;
    }
    if (n.state === 'stand') {
      n.animSpeed = 0;
      // shopkeepers and Mira idle at home, turning slowly to watch the street
      n.heading += Math.sin(S.time * 0.4 + n.animPhase) * 0.1 * dt;
      syncMesh(n); continue;
    }
    if (n.state === 'flee') {
      n.fleeT -= dt;
      const fx = n.fleeX !== undefined ? n.fleeX : p.x;
      const fz = n.fleeZ !== undefined ? n.fleeZ : p.z;
      const away = Math.atan2(n.x - fx, n.z - fz);
      steer(n, n.x + Math.sin(away) * 12, n.z + Math.cos(away) * 12, n.kind === 'child' ? 3.4 : 4.4, dt);
      if (n.fleeT <= 0) n.state = 'wander';
    } else if (n.state === 'hostile' || n.state === 'attack') {
      // thugs close on the player and swing; they give up after hostileT
      n.hostileT -= dt;
      const d = dist2d(n.x, n.z, p.x, p.z);
      if (n.hostileT <= 0 || S.inCar) { n.state = 'wander'; }
      else if (d > 1.7) { n.state = 'hostile'; steer(n, p.x, p.z, 4.6, dt); }
      else {
        n.state = 'attack'; n.animSpeed = 0;
        n.heading = Math.atan2(p.x - n.x, p.z - n.z);
        n.hitCd = (n.hitCd || 0) - dt;
        if (n.hitCd <= 0 && !S.inCar && S.mode === 'playing') {
          n.hitCd = 1.1;
          S.health -= n.armed ? 7 : 4;
        }
      }
    } else { // wander
      n.retargetT -= dt;
      const arrived = steer(n, n.tx, n.tz, n.kind === 'animal' ? 1.7 : (n.kind === 'child' ? 2.4 : 1.35), dt);
      if (arrived || n.retargetT <= 0) {
        n.retargetT = 4 + Math.random() * 6;
        if (n.homeX !== undefined && Math.random() < 0.6) { n.tx = n.homeX + (Math.random() * 8 - 4); n.tz = n.homeZ + (Math.random() * 8 - 4); }
        else { const [x, z] = scatter(60, null); n.tx = n.x + clamp(x, -40, 40); n.tz = n.z + clamp(z, -40, 40); }
        n.tx = clamp(n.tx, -WANDER_HALF, WANDER_HALF);
        n.tz = clamp(n.tz, -WANDER_HALF, WANDER_HALF + 14);
      }
    }
    const probe = { x: n.x, z: n.z };
    pushOut(probe, 0.55);
    n.x = probe.x; n.z = probe.z;
    n.x = clamp(n.x, -CFG.worldHalf + 2, CFG.worldHalf - 2);
    n.z = clamp(n.z, -CFG.worldHalf + 2, CFG.worldHalf + 22);
    syncMesh(n);
    if (n.kind === 'animal') animateAnimal(n, dt); else animatePerson(n, dt);
  }
}

function syncMesh(n) {
  n.group.position.x = n.x;
  n.group.position.z = n.z;
  if (n.state !== 'down') n.group.position.y = 0;
  n.group.rotation.y = n.heading;
}

export function countsSnapshot() {
  const by = (k) => S.npcs.filter((n) => n.kind === k).length;
  return {
    citizens: by('citizen'),
    shopkeepers: by('shopkeeper'),
    dockworkers: by('dockworker'),
    children: by('child'),
    animals: by('animal'),
    thugs: by('thug'),
    police: S.policeUnits.length,
    parkedCars: S.cars.filter((c) => c.traffic === false).length,
    trafficCars: S.cars.filter((c) => c.traffic === true).length,
    childrenDetail: S.npcs.filter((n) => n.kind === 'child').map((n) => ({
      hasHealth: 'health' in n,
      state: n.state,
    })),
  };
}

// Adults who could plausibly witness something at a point (probe + wanted).
export function adultsNear(x, z, radius) {
  return S.npcs.filter((n) => n.kind !== 'child' && n.kind !== 'animal'
    && n.state !== 'down' && dist2d(x, z, n.x, n.z) <= radius);
}

export function nearestNPC(x, z, filter) {
  let best = null; let bd = Infinity;
  for (const n of S.npcs) {
    if (filter && !filter(n)) continue;
    const d = dist2d(x, z, n.x, n.z);
    if (d < bd) { bd = d; best = n; }
  }
  return best ? { rec: best, dist: bd } : null;
}

export { THREE };
