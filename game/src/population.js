// Population: citizens with jobs, shopkeepers at their shops, dockworkers on
// the pier, children (small figures near adults — NO health, never a combat
// or collision target, they only ever flee unharmed), dogs and cats, and a
// few armed dock thugs whose weapons can be looted when they fall.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { createHuman, poseHuman, poseFallen, blobShadow } from './characters.js';

const SKINS = [0x8a5a3b, 0xc68863, 0x6e4525, 0xe0ac82, 0x5a3a20];
const SHIRTS = [0xd8543c, 0x3c78d8, 0x5f8f5a, 0xf2b134, 0x9b59b6, 0xecf0f1, 0xe67e22, 0x16a085];
const PANTS = [0x2e3a46, 0x54442e, 0x243447, 0x5d6d7e, 0x3b2f2f];
const pick = (arr, i) => arr[i % arr.length];
let personSeq = 0;

function makePerson(kind, x, z, opts = {}) {
  const i = personSeq++;
  const isChild = kind === 'child';
  const group = createHuman({
    skin: pick(SKINS, i * 3), hair: [0x241610, 0x0f0a06, 0x4a2c14, 0x777777][i % 4],
    shirt: opts.shirt ?? pick(SHIRTS, i), pants: opts.pants ?? pick(PANTS, i * 2),
    cap: opts.cap, scale: isChild ? 0.58 : 0.92 + (i % 5) * 0.035,
  });
  group.position.set(x, 0, z);
  const person = {
    id: i, kind, group, pos: group.position,
    heading: Math.random() * Math.PI * 2,
    speed: 0, phase: Math.random() * 6, state: 'wander',
    target: null, waitT: Math.random() * 2, downT: 0,
    weapon: opts.weapon || null, hostile: false, attackCd: 0,
    home: { x, z }, owner: null,
  };
  // Children deliberately get NO health property at all: nothing in the game
  // can damage, knock back or target them. Adults carry health.
  if (!isChild) person.health = kind === 'thug' ? CFG.enemyHealth : CFG.citizenHealth;
  if (kind === 'thug') person.health = CFG.enemyHealth;
  group.userData.person = person;
  return person;
}

function makeAnimal(kind, x, z) {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: kind === 'dog' ? 0xa9743f : 0x8d8d94 });
  const s = kind === 'dog' ? 1 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34 * s, 0.3 * s, 0.62 * s), fur);
  body.position.y = 0.42 * s; body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26 * s, 0.24 * s, 0.28 * s), fur);
  head.position.set(0, 0.58 * s, 0.42 * s); head.castShadow = true;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07 * s, 0.07 * s, 0.34 * s), fur);
  tail.position.set(0, 0.52 * s, -0.42 * s); tail.rotation.x = -0.6;
  g.add(body); g.add(head); g.add(tail);
  for (const [lx, lz] of [[-0.11, 0.2], [0.11, 0.2], [-0.11, -0.2], [0.11, -0.2]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08 * s, 0.3 * s, 0.08 * s), fur);
    leg.position.set(lx * s, 0.15 * s, lz * s);
    g.add(leg);
  }
  g.add(blobShadow(0.4 * s));
  g.position.set(x, 0, z);
  return { kind, group: g, pos: g.position, heading: Math.random() * 6, speed: 0, phase: Math.random() * 6, owner: null, target: null, waitT: 0, tail };
}

const WALK_POINTS = [];
for (let x = -88; x <= 88; x += 16) for (const z of [-72, -22, 4, 48, 86]) WALK_POINTS.push({ x: x + (Math.random() - 0.5) * 6, z: z + (Math.random() - 0.5) * 4 });
const DOCK_POINTS = [
  { x: -42, z: 102 }, { x: -18, z: 104 }, { x: -30, z: 112 }, { x: -40, z: 88 },
  { x: -20, z: 90 }, { x: -46, z: 96 }, { x: -14, z: 96 },
];

export function createPopulation(scene, world) {
  const people = [], animals = [];
  const add = (p) => { scene.add(p.group); people.push(p); return p; };
  for (let i = 0; i < CFG.pop.citizens; i++) {
    const wp = WALK_POINTS[(i * 7) % WALK_POINTS.length];
    add(makePerson('citizen', wp.x, wp.z));
  }
  world.shopFronts.forEach((s, i) => {
    if (i >= CFG.pop.shopkeepers) return;
    add(makePerson('shopkeeper', s.pos.x, s.pos.z, { shirt: 0x2c3e50, cap: 0xf4c95d }));
  });
  for (let i = 0; i < CFG.pop.dockworkers; i++) {
    const dp = DOCK_POINTS[i % DOCK_POINTS.length];
    const w = add(makePerson('dockworker', dp.x, dp.z, { shirt: 0xe67e22, cap: 0xf7f7f7 }));
    w.state = 'dock';
  }
  // children stay near a specific adult citizen
  const adults = people.filter((p) => p.kind === 'citizen');
  for (let i = 0; i < CFG.pop.children; i++) {
    const adult = adults[i % adults.length];
    const child = add(makePerson('child', adult.pos.x + 1.2, adult.pos.z + 0.6, { shirt: pick(SHIRTS, i + 3) }));
    child.owner = adult;
  }
  // armed thugs loiter at the dock; one carries a baton, one a pistol, one fists
  const thugWeapons = ['pistol', 'baton', null];
  for (let i = 0; i < CFG.pop.thugs; i++) {
    const t = add(makePerson('thug', -24 + i * 5, 92 + (i % 2) * 3, { shirt: 0x23272e, pants: 0x191919, weapon: thugWeapons[i] }));
    t.state = 'loiter';
  }
  for (let i = 0; i < CFG.pop.animals; i++) {
    const kind = i % 2 ? 'cat' : 'dog';
    const owner = adults[(i * 2 + 1) % adults.length];
    const a = makeAnimal(kind, owner.pos.x + 0.8, owner.pos.z - 0.8);
    a.owner = i % 3 === 0 ? null : owner; // some roam free
    scene.add(a.group);
    animals.push(a);
  }
  return { people, animals, update: (dt, ctx) => updatePopulation(people, animals, dt, ctx), counts: () => countPop(people, animals) };
}

function countPop(people, animals) {
  const c = { citizens: 0, shopkeepers: 0, dockworkers: 0, children: 0, thugs: 0, animals: animals.length };
  for (const p of people) {
    if (p.kind === 'citizen') c.citizens++;
    else if (p.kind === 'shopkeeper') c.shopkeepers++;
    else if (p.kind === 'dockworker') c.dockworkers++;
    else if (p.kind === 'child') c.children++;
    else if (p.kind === 'thug') c.thugs++;
  }
  return c;
}

function steerTo(p, tx, tz, speed, dt, world) {
  const dx = tx - p.pos.x, dz = tz - p.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 0.4) { p.speed = 0; return true; }
  const want = Math.atan2(dx, dz);
  let diff = want - p.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  p.heading += Math.max(-3.2 * dt, Math.min(3.2 * dt, diff * 6 * dt));
  p.speed = speed;
  let nx = p.pos.x + Math.sin(p.heading) * speed * dt;
  let nz = p.pos.z + Math.cos(p.heading) * speed * dt;
  [nx, nz] = world.collide(nx, nz, 0.4);
  p.pos.x = nx; p.pos.z = nz;
  p.phase += dt * (3 + speed * 1.9);
  return false;
}

function updatePopulation(people, animals, dt, ctx) {
  const { world, playerPos, panic, onThugAttack } = ctx;
  for (const p of people) {
    if (p.state === 'down') {
      p.downT -= dt;
      if (p.downT <= 0 && p.kind === 'thug') { /* thugs stay down until the area resets */ p.downT = 30; }
      continue;
    }
    const dxP = playerPos.x - p.pos.x, dzP = playerPos.z - p.pos.z;
    const distP = Math.hypot(dxP, dzP);
    // panic: flee the panic point (children always flee, never harmed)
    if (panic && Math.hypot(p.pos.x - panic.x, p.pos.z - panic.z) < panic.r) p.state = 'flee', p.fleeFrom = panic;
    if (p.state === 'flee') {
      const fx = p.pos.x - (p.fleeFrom?.x ?? playerPos.x), fz = p.pos.z - (p.fleeFrom?.z ?? playerPos.z);
      const fd = Math.hypot(fx, fz) || 1;
      const arrived = steerTo(p, p.pos.x + (fx / fd) * 14, p.pos.z + (fz / fd) * 14, p.kind === 'child' ? 3.4 : 4.6, dt, world);
      poseHuman(p.group, { mode: 'walk', moving: true, speed01: 0.8, phase: p.phase, time: ctx.t }, dt);
      if (fd > 16 || arrived) { p.state = p.kind === 'dockworker' ? 'dock' : p.kind === 'thug' ? 'loiter' : 'wander'; }
      p.group.rotation.y = p.heading;
      continue;
    }
    if (p.kind === 'shopkeeper') {
      p.speed = 0;
      p.heading += Math.sin(ctx.t * 0.5 + p.id) * 0.002;
      poseHuman(p.group, { mode: 'idle', moving: false, speed01: 0, phase: 0, time: ctx.t + p.id }, dt);
      p.group.rotation.y = p.heading;
      continue;
    }
    if (p.kind === 'child') {
      // toddle near the adult they belong to
      const o = p.owner;
      if (o && Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) > 2.4) {
        steerTo(p, o.pos.x + Math.sin(p.id * 2.4) * 1.1, o.pos.z + Math.cos(p.id * 2.4) * 1.1, 2.6, dt, world);
        poseHuman(p.group, { mode: 'walk', moving: true, speed01: 0.4, phase: p.phase, time: ctx.t }, dt);
      } else {
        p.speed = 0;
        poseHuman(p.group, { mode: 'idle', moving: false, speed01: 0, phase: 0, time: ctx.t + p.id * 2 }, dt);
      }
      p.group.rotation.y = p.heading;
      continue;
    }
    if (p.kind === 'thug') {
      updateThug(p, dt, ctx, distP);
      p.group.rotation.y = p.heading;
      continue;
    }
    // citizens & dockworkers wander between points
    if (!p.target || p.waitT > 0) {
      p.waitT -= dt;
      p.speed = 0;
      poseHuman(p.group, { mode: 'idle', moving: false, speed01: 0, phase: 0, time: ctx.t + p.id }, dt);
      if (p.waitT <= 0) {
        const pool = p.kind === 'dockworker' ? DOCK_POINTS : WALK_POINTS;
        p.target = pool[(Math.random() * pool.length) | 0];
      }
    } else {
      const done = steerTo(p, p.target.x, p.target.z, p.kind === 'dockworker' ? 1.7 : 1.5, dt, world);
      poseHuman(p.group, { mode: 'walk', moving: p.speed > 0.1, speed01: 0.25, phase: p.phase, time: ctx.t }, dt);
      if (done) { p.target = null; p.waitT = 1 + Math.random() * 3.5; }
    }
    p.group.rotation.y = p.heading;
  }
  updateAnimals(animals, dt, ctx);
}

function updateThug(p, dt, ctx, distP) {
  const { world, playerPos, onThugAttack } = ctx;
  if (p.hostile && distP < 16) {
    if (distP > 1.7) {
      steerTo(p, playerPos.x, playerPos.z, 4.4, dt, world);
      poseHuman(p.group, { mode: 'walk', moving: true, speed01: 0.75, phase: p.phase, time: ctx.t }, dt);
    } else {
      p.speed = 0;
      p.attackCd -= dt;
      poseHuman(p.group, { mode: 'idle', moving: false, speed01: 0, phase: 0, time: ctx.t, attackT: p.attackCd > 0.28 ? 0.2 : 0, attackKind: p.weapon === 'baton' ? 'baton' : 'punch', aim: p.weapon === 'pistol' }, dt);
      if (p.attackCd <= 0) {
        p.attackCd = p.weapon === 'pistol' ? 1.3 : 0.9;
        if (onThugAttack) onThugAttack(p);
      }
    }
  } else {
    p.speed = 0;
    p.heading = p.home ? Math.atan2(playerPos.x - p.pos.x, playerPos.z - p.pos.z) * 0 + p.id : p.heading;
    poseHuman(p.group, { mode: 'idle', moving: false, speed01: 0, phase: 0, time: ctx.t + p.id, aim: false }, dt);
  }
}

function updateAnimals(animals, dt, ctx) {
  const { world } = ctx;
  for (const a of animals) {
    const o = a.owner;
    if (o) {
      const d = Math.hypot(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
      if (d > 1.6) {
        const want = Math.atan2(o.pos.x - a.pos.x, o.pos.z - a.pos.z);
        a.heading = want;
        const sp = a.kind === 'dog' ? 3.4 : 2.8;
        a.pos.x += Math.sin(a.heading) * sp * dt;
        a.pos.z += Math.cos(a.heading) * sp * dt;
        [a.pos.x, a.pos.z] = world.collide(a.pos.x, a.pos.z, 0.3);
        a.phase += dt * 11;
      }
    } else {
      a.waitT -= dt;
      if (!a.target || a.waitT <= 0) {
        a.target = { x: a.pos.x + (Math.random() - 0.5) * 22, z: a.pos.z + (Math.random() - 0.5) * 22 };
        a.waitT = 4 + Math.random() * 4;
      }
      const dx = a.target.x - a.pos.x, dz = a.target.z - a.pos.z;
      if (Math.hypot(dx, dz) > 0.6) {
        a.heading = Math.atan2(dx, dz);
        a.pos.x += Math.sin(a.heading) * 1.6 * dt;
        a.pos.z += Math.cos(a.heading) * 1.6 * dt;
        [a.pos.x, a.pos.z] = world.collide(a.pos.x, a.pos.z, 0.3);
        a.phase += dt * 9;
      }
    }
    a.group.position.y = Math.abs(Math.sin(a.phase)) * 0.05;
    a.group.rotation.y = a.heading;
    a.tail.rotation.x = -0.6 + Math.sin(ctx.t * 6 + a.phase) * 0.3;
  }
}

// Everyone who could see a point: adults within witness radius (children are
// never witnesses for the wanted model and never returned as targets).
export function witnessesAt(people, x, z, radius) {
  const out = [];
  for (const p of people) {
    if (p.kind === 'child' || p.state === 'down') continue;
    if (Math.hypot(p.pos.x - x, p.pos.z - z) <= radius) out.push(p);
  }
  return out;
}

// Nearest living adult person of the given kinds (combat targeting helper —
// children are excluded here at the source, not just by callers).
export function nearestTarget(people, x, z, maxDist, kinds = null) {
  let best = null, bestD = maxDist;
  for (const p of people) {
    if (p.kind === 'child' || p.state === 'down') continue;
    if (kinds && !kinds.includes(p.kind)) continue;
    const d = Math.hypot(p.pos.x - x, p.pos.z - z);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

// Knock a person down (adults only — children are never passed here).
export function knockDown(p, seconds = 6) {
  if (p.kind === 'child') return false;
  p.state = 'down';
  p.downT = seconds;
  p.speed = 0;
  poseFallen(p.group);
  p.group.position.y = 0.12;
  return true;
}
export function standUp(p) {
  if (p.state !== 'down') return;
  p.state = p.kind === 'dockworker' ? 'dock' : p.kind === 'thug' ? 'loiter' : 'wander';
  p.group.rotation.x = 0;
  p.group.position.y = 0;
}
