// PURNAMA BAY - low-poly people and animals assembled from boxes.
// A person record carries its kind and (for adults only) a health value;
// children are built WITHOUT any health field on purpose - the safety law
// of the game is that a child can never be hurt, and the data shows it.
import * as THREE from 'three';

const SKIN = [0xc98a5e, 0xa06a42, 0x8a5a34, 0xe0aa72];
const SHIRTS = [0xd96f32, 0x0f7d8c, 0x3f7d4e, 0xc9973f, 0xb8452e, 0x7a4a8c, 0x2e5f8a, 0xe8e3d5];
const PANTS = [0x2c343a, 0x4a3b2a, 0x31435c, 0x5c5142, 0x704214];

let seed = 7;
function pick(arr) { seed = (seed * 16807) % 2147483647; return arr[seed % arr.length]; }

function limb(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// Build a person. opts: {shirt, pants, skin, cap, scale, skirt}
export function makePerson(opts = {}) {
  const s = opts.scale || 1;
  const g = new THREE.Group();
  const skinMat = new THREE.MeshLambertMaterial({ color: opts.skin ?? pick(SKIN) });
  const shirtMat = new THREE.MeshLambertMaterial({ color: opts.shirt ?? pick(SHIRTS) });
  const pantsMat = new THREE.MeshLambertMaterial({ color: opts.pants ?? pick(PANTS) });
  const torso = limb(0.62, 0.72, 0.34, shirtMat, 0, 1.06, 0);
  const head = limb(0.4, 0.44, 0.4, skinMat, 0, 1.66, 0);
  const armL = limb(0.16, 0.66, 0.16, shirtMat, -0.4, 1.08, 0);
  const armR = limb(0.16, 0.66, 0.16, shirtMat, 0.4, 1.08, 0);
  const legL = limb(0.2, 0.72, 0.2, pantsMat, -0.16, 0.36, 0);
  const legR = limb(0.2, 0.72, 0.2, pantsMat, 0.16, 0.36, 0);
  g.add(torso, head, armL, armR, legL, legR);
  if (opts.cap) {
    const capMat = new THREE.MeshLambertMaterial({ color: opts.cap });
    g.add(limb(0.46, 0.12, 0.46, capMat, 0, 1.92, 0));
    g.add(limb(0.46, 0.05, 0.3, capMat, 0, 1.88, 0.34));
  }
  if (opts.skirt) {
    const skirt = limb(0.66, 0.4, 0.4, pantsMat, 0, 0.78, 0);
    g.add(skirt);
  }
  g.scale.setScalar(s);
  g.userData.parts = { armL, armR, legL, legR, torso, head };
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

// A small quadruped: body, head, ears, tail - dogs and cats of the bay.
export function makeAnimal(x, z) {
  const g = new THREE.Group();
  const fur = pick([0xb08954, 0x6e5136, 0xd8d3c3, 0x3a3a3a, 0xc96f2e]);
  const mat = new THREE.MeshLambertMaterial({ color: fur });
  const body = limb(0.72, 0.4, 0.34, mat, 0, 0.48, 0);
  const head = limb(0.3, 0.3, 0.3, mat, 0.48, 0.62, 0);
  const earL = limb(0.08, 0.16, 0.08, mat, 0.42, 0.84, 0.09);
  const earR = limb(0.08, 0.16, 0.08, mat, 0.42, 0.84, -0.09);
  const tail = limb(0.3, 0.08, 0.08, mat, -0.48, 0.62, 0);
  tail.rotation.z = 0.7;
  g.add(body, head, earL, earR, tail);
  for (const [lx, lz] of [[0.24, 0.11], [0.24, -0.11], [-0.24, 0.11], [-0.24, -0.11]]) {
    g.add(limb(0.09, 0.34, 0.09, mat, lx, 0.17, lz));
  }
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
