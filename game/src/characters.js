// PURNAMA BAY - people and animals built from tapered, rounded segments;
// each person's static core is merged into one vertex-coloured mesh so
// the whole population costs a handful of draw calls per citizen.
// A person record carries its kind and (for adults only) a health value;
// children are built WITHOUT any health field on purpose - the safety law
// of the game is that a child can never be hurt, and the data shows it.
import * as THREE from 'three';
import { mergeColored, coloredLambert } from './merge.js';

const SKIN = [0xc98a5e, 0xa06a42, 0x8a5a34, 0xe0aa72];
const SHIRTS = [0xd96f32, 0x0f7d8c, 0x3f7d4e, 0xc9973f, 0xb8452e, 0x7a4a8c, 0x2e5f8a, 0xe8e3d5];
const PANTS = [0x2c343a, 0x4a3b2a, 0x31435c, 0x5c5142, 0x704214];

let seed = 7;
function pick(arr) { seed = (seed * 16807) % 2147483647; return arr[seed % arr.length]; }

// A tapered limb as ONE mesh whose geometry hangs below its origin, so
// the mesh origin IS the joint (shoulder / hip) and rotating the mesh
// swings the limb from its real pivot, the way animatePerson expects.
function taperedLimb(rTop, rBottom, len, mat, jx, jy, flat = 1) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, len, 7);
  geo.translate(0, -len / 2, 0);
  if (flat !== 1) geo.scale(1, 1, flat);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(jx, jy, 0);
  return m;
}

// Build a person with human proportions (~1.78 m before opts.scale):
// shoulders wider than hips, arms and legs tapering toward the ends, a
// rounded head with a hair cap. The static core (pelvis, head, hair,
// optional cap and skirt) is merged into ONE vertex-coloured mesh - the
// bay holds ~50 people, and draw calls are the frame-rate currency.
// The torso stays a separate mesh so the safehouse shirt-swap in main
// can still repaint it. opts: {shirt, pants, skin, cap, scale, skirt}
export function makePerson(opts = {}) {
  const s = opts.scale || 1;
  const g = new THREE.Group();
  const skin = opts.skin ?? pick(SKIN);
  const shirtMat = new THREE.MeshLambertMaterial({ color: opts.shirt ?? pick(SHIRTS) });
  const pants = opts.pants ?? pick(PANTS);
  const coreParts = [
    { geo: new THREE.BoxGeometry(0.36, 0.18, 0.22), color: pants, y: 0.92 },
    { geo: new THREE.SphereGeometry(0.145, 10, 8), color: skin, y: 1.70, sx: 0.92, sy: 1.08, sz: 0.98 },
    { geo: new THREE.SphereGeometry(0.152, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52), color: 0x241a12, y: 1.725, z: -0.012, sx: 0.94, sy: 1.02, sz: 1.0 },
  ];
  if (opts.cap) {
    coreParts.push({ geo: new THREE.SphereGeometry(0.155, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.45), color: opts.cap, y: 1.735, sx: 0.95, sy: 0.8, sz: 1.0 });
    coreParts.push({ geo: new THREE.BoxGeometry(0.24, 0.03, 0.16), color: opts.cap, y: 1.76, z: 0.17 });
  }
  if (opts.skirt) {
    coreParts.push({ geo: new THREE.CylinderGeometry(0.175, 0.26, 0.36, 9, 1, true), color: pants, y: 0.76, sz: 0.72 });
  }
  const core = new THREE.Mesh(mergeColored(coreParts), coloredLambert);
  core.castShadow = true;
  // torso: chest wider than waist, flattened front-to-back
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.145, 0.58, 9), shirtMat);
  torso.position.set(0, 1.24, 0);
  torso.scale.z = 0.62;
  torso.castShadow = true;
  const armL = taperedLimb(0.062, 0.042, 0.60, shirtMat, -0.27, 1.45, 0.9);
  const armR = taperedLimb(0.062, 0.042, 0.60, shirtMat, 0.27, 1.45, 0.9);
  const legMat = new THREE.MeshLambertMaterial({ color: pants });
  const legL = taperedLimb(0.088, 0.048, 0.86, legMat, -0.105, 0.88, 0.9);
  const legR = taperedLimb(0.088, 0.048, 0.86, legMat, 0.105, 0.88, 0.9);
  g.add(core, torso, armL, armR, legL, legR);
  g.scale.setScalar(s);
  g.userData.parts = { armL, armR, legL, legR, torso, head: core };
  return g;
}

// Swing limbs for a walk cycle; phase advances with distance travelled.
export function animatePerson(rec, dt) {
  const parts = rec.group.userData.parts;
  if (!parts) return;
  const moving = rec.animSpeed > 0.15 && rec.state !== 'down';
  rec.animPhase += dt * (moving ? rec.animSpeed * 3.4 : 0);
  const sw = moving ? Math.sin(rec.animPhase) * 0.55 : 0;
  parts.legL.rotation.x = sw;
  parts.legR.rotation.x = -sw;
  if (rec.state === 'attack') {
    parts.armR.rotation.x = -2.1 + Math.sin(rec.animPhase * 3) * 0.5;
    parts.armL.rotation.x = 0.3;
  } else {
    parts.armL.rotation.x = -sw * 0.8;
    parts.armR.rotation.x = sw * 0.8;
  }
  if (rec.state === 'down') {
    rec.group.rotation.x = -Math.PI / 2;
    rec.group.position.y = 0.25;
  } else if (rec.group.rotation.x !== 0) {
    rec.group.rotation.x = 0;
    rec.group.position.y = 0;
  }
  if (rec.crouchVisual) rec.group.scale.y = (rec.baseScale || 1) * 0.72;
  else if (rec.group.scale.y !== (rec.baseScale || 1)) rec.group.scale.y = rec.baseScale || 1;
}

// Create the data record for a person. Children deliberately get NO
// health property at all - not zero, not undefined: absent.
export function makePersonRecord(kind, group, x, z) {
  const rec = {
    kind, group,
    x, z, heading: Math.random() * Math.PI * 2,
    speed: 0, animSpeed: 0, animPhase: Math.random() * 6,
    state: 'wander',           // wander | flee | hostile | attack | down | stand
    tx: x, tz: z,               // current wander target
    retargetT: Math.random() * 4,
    downT: 0, hostileT: 0,
    baseScale: group.scale.x,
    crouchVisual: false,
    armed: false,
  };
  if (kind !== 'child') rec.health = kind === 'thug' ? 36 : 30;
  return rec;
}

// A small quadruped: body, head, ears, tail - dogs and cats of the bay,
// merged into a single vertex-coloured mesh (animals never articulate,
// they only bob, so one draw call each is enough).
export function makeAnimal(x, z) {
  const g = new THREE.Group();
  const fur = pick([0xb08954, 0x6e5136, 0xd8d3c3, 0x3a3a3a, 0xc96f2e]);
  const parts = [
    { geo: new THREE.BoxGeometry(0.72, 0.4, 0.34), color: fur, y: 0.48 },
    { geo: new THREE.BoxGeometry(0.3, 0.3, 0.3), color: fur, x: 0.48, y: 0.62 },
    { geo: new THREE.BoxGeometry(0.08, 0.16, 0.08), color: fur, x: 0.42, y: 0.84, z: 0.09 },
    { geo: new THREE.BoxGeometry(0.08, 0.16, 0.08), color: fur, x: 0.42, y: 0.84, z: -0.09 },
    { geo: new THREE.BoxGeometry(0.3, 0.08, 0.08), color: fur, x: -0.48, y: 0.62, rz: 0.7 },
  ];
  for (const [lx, lz] of [[0.24, 0.11], [0.24, -0.11], [-0.24, 0.11], [-0.24, -0.11]]) {
    parts.push({ geo: new THREE.BoxGeometry(0.09, 0.34, 0.09), color: fur, x: lx, y: 0.17, z: lz });
  }
  const body = new THREE.Mesh(mergeColored(parts), coloredLambert);
  body.castShadow = true;
  g.add(body);
  g.position.set(x, 0, z);
  const rec = {
    kind: 'animal', group: g, x, z,
    heading: Math.random() * Math.PI * 2,
    speed: 0, animSpeed: 0, animPhase: 0,
    state: 'wander', tx: x, tz: z, retargetT: Math.random() * 5,
    downT: 0, hostileT: 0, baseScale: 1, crouchVisual: false, armed: false,
  };
  rec.health = 10; // animals scatter when scared; they are never a target
  return rec;
}

// A held prop (crate, bag, baton) parented to the right hand.
export function attachProp(rec, mesh) {
  const parts = rec.group.userData.parts;
  if (!parts) return;
  mesh.position.set(0, -0.62, 0.12);
  parts.armR.add(mesh);
  rec.prop = mesh;
}

export function animateAnimal(rec, dt) {
  rec.animPhase += dt * 6 * (rec.animSpeed > 0.1 ? 1 : 0);
  rec.group.position.y = rec.animSpeed > 0.1 ? Math.abs(Math.sin(rec.animPhase)) * 0.05 : 0;
}
