// PURNAMA BAY - people and animals built from tapered, rounded segments;
// each person's static core is merged into one vertex-coloured mesh so
// the whole population costs a handful of draw calls per citizen.
// A person record carries its kind and (for adults only) a health value;
// children are built WITHOUT any health field on purpose - the safety law
// of the game is that a child can never be hurt, and the data shows it.
import * as THREE from 'three';
import { CFG } from './config.js';
import { mergeColored, coloredStandard } from './merge.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.min.js';

const SKIN = [0xc98a5e, 0xa06a42, 0x8a5a34, 0xe0aa72];
const SHIRTS = [0xd96f32, 0x0f7d8c, 0x3f7d4e, 0xc9973f, 0xb8452e, 0x7a4a8c, 0x2e5f8a, 0xe8e3d5];
const PANTS = [0x2c343a, 0x4a3b2a, 0x31435c, 0x5c5142, 0x704214];

let seed = 7;
function pick(arr) { seed = (seed * 16807) % 2147483647; return arr[seed % arr.length]; }

// Body variety: every person is built in one of four frames. The group
// is scaled (w, h, w) around the person's own scale factor, so a crowd
// reads as individuals instead of clones at one height.
export const BUILDS = {
  slim: { h: 0.98, w: 0.90 },
  average: { h: 1.0, w: 1.0 },
  tall: { h: 1.07, w: 0.97 },
  broad: { h: 1.01, w: 1.15 },
};

// A capsule limb segment as ONE merged vertex-coloured mesh whose
// geometry hangs below its origin, so the mesh origin IS the joint
// (shoulder / hip / elbow / knee) and rotating the mesh swings the limb
// from its real pivot. Joint spheres (shoulder, elbow, hip, knee),
// hands and shoes are baked into the same merge, so the mesh count per
// person never grows - capsules just replace the old tapered cylinders.
function capsuleSegment(r, len, color) {
  const geo = new THREE.CapsuleGeometry(r, len - 2 * r, 4, 10);
  geo.translate(0, -len / 2, 0);
  return { geo, color };
}
function limbMesh(parts, shadow = true) {
  const m = new THREE.Mesh(mergeColored(parts), coloredStandard);
  // round 11 (draw calls): forearm/shin segments skip the shadow pass -
  // the upper segments still cast the limb's shadow, and every skipped
  // caster is one less draw in the shadow map for ~44 people on screen
  m.castShadow = shadow;
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
  const build = BUILDS[opts.build] || BUILDS.average;
  const g = new THREE.Group();
  const skin = opts.skin ?? pick(SKIN);
  const shirtColor = opts.shirt ?? pick(SHIRTS);
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.85, metalness: 0 });
  const pants = opts.pants ?? pick(PANTS);
  const coreParts = [
    // pelvis: a squashed sphere in trouser colour, not a box
    { geo: new THREE.SphereGeometry(0.19, 10, 8), color: pants, y: 0.95, sx: 1.05, sy: 0.62, sz: 0.72 },
    { geo: new THREE.SphereGeometry(0.105, 10, 8), color: skin, y: 1.655, sx: 0.92, sy: 1.05, sz: 0.98 },
    { geo: new THREE.SphereGeometry(0.112, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.52), color: 0x241a12, y: 1.68, z: -0.012, sx: 0.94, sy: 1.02, sz: 1.0 },
    // implied eyes on the front of the head
    { geo: new THREE.SphereGeometry(0.012, 6, 5), color: 0x191008, x: -0.038, y: 1.68, z: 0.096 },
    { geo: new THREE.SphereGeometry(0.012, 6, 5), color: 0x191008, x: 0.038, y: 1.68, z: 0.096 },
    // neck between torso and head
    { geo: new THREE.CylinderGeometry(0.05, 0.05, 0.11, 8), color: skin, y: 1.545 },
  ];
  if (opts.cap) {
    coreParts.push({ geo: new THREE.SphereGeometry(0.155, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.45), color: opts.cap, y: 1.735, sx: 0.95, sy: 0.8, sz: 1.0 });
    coreParts.push({ geo: new THREE.BoxGeometry(0.24, 0.03, 0.16), color: opts.cap, y: 1.715, z: 0.17 });
  }
  if (opts.skirt) {
    coreParts.push({ geo: new THREE.CylinderGeometry(0.175, 0.26, 0.36, 9, 1, true), color: pants, y: 0.76, sz: 0.72 });
  }
  // The player's head is a separate mesh so it can turn toward the
  // camera / travel direction; everyone else keeps the merged head.
  let core; let headMesh = null;
  if (opts.headSeparate) {
    const headParts = coreParts.splice(1, 4); // head sphere + hair cap + both eyes
    core = new THREE.Mesh(mergeColored(coreParts), coloredStandard);
    headMesh = new THREE.Mesh(mergeColored(headParts), coloredStandard);
    headMesh.castShadow = true;
    // head geometry is authored around y=1.66; re-pivot it at the neck
    headMesh.geometry.translate(0, -1.655, 0);
    headMesh.position.set(0, 1.655, 0);
    g.add(headMesh);
  } else {
    core = new THREE.Mesh(mergeColored(coreParts), coloredStandard);
  }
  core.castShadow = true;
  // torso: chest wider than waist, flattened front-to-back. Its geometry
  // is re-pivoted at the waist so it can lean and sway as its own joint.
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.145, 0.58, 12), shirtMat);
  torso.geometry.translate(0, 0.29, 0);
  torso.position.set(0, 0.95, 0);
  torso.scale.z = 0.62;
  torso.castShadow = true;
  // arms: capsule upper arm from the shoulder (shoulder ball baked in)
  // + a capsule forearm child at the elbow (elbow ball + skin hand)
  function makeArm(side) {
    const upper = limbMesh([
      capsuleSegment(0.055, 0.32, shirtColor),
      { geo: new THREE.SphereGeometry(0.075, 8, 6), color: shirtColor },
    ]);
    upper.position.set(side * 0.27, 1.45, 0);
    const fore = limbMesh([
      capsuleSegment(0.045, 0.30, shirtColor),
      { geo: new THREE.SphereGeometry(0.05, 8, 6), color: shirtColor },
      { geo: new THREE.SphereGeometry(0.052, 8, 6), color: skin, y: -0.30 },
    ], false);
    fore.position.set(0, -0.32, 0);
    upper.add(fore);
    return { upper, fore };
  }
  // legs: capsule thigh from the hip (hip ball baked in) + a capsule
  // shin child at the knee (knee ball + a dark rounded shoe)
  function makeLeg(side) {
    const thigh = limbMesh([
      capsuleSegment(0.085, 0.46, pants),
      { geo: new THREE.SphereGeometry(0.095, 8, 6), color: pants },
    ]);
    thigh.position.set(side * 0.105, 0.88, 0);
    const shin = limbMesh([
      capsuleSegment(0.06, 0.42, pants),
      { geo: new THREE.SphereGeometry(0.065, 8, 6), color: pants },
      { geo: new RoundedBoxGeometry(0.10, 0.07, 0.24, 2, 0.03), color: 0x1d1d20, y: -0.42, z: 0.045 },
    ], false);
    shin.position.set(0, -0.46, 0);
    thigh.add(shin);
    return { upper: thigh, fore: shin };
  }
  const armL = makeArm(-1); const armR = makeArm(1);
  const legL = makeLeg(-1); const legR = makeLeg(1);
  g.add(core, torso, armL.upper, armR.upper, legL.upper, legR.upper);
  g.scale.set(build.w * s, build.h * s, build.w * s);
  g.userData.buildName = opts.build || 'average';
  g.userData.baseScaleY = build.h * s;
  g.userData.parts = {
    armL: armL.upper, armR: armR.upper, legL: legL.upper, legR: legR.upper,
    foreL: armL.fore, foreR: armR.fore, shinL: legL.fore, shinR: legR.fore,
    torso, head: headMesh || core, headMesh,
  };
  return g;
}

const JOINT_KEYS = ['legL', 'legR', 'shinL', 'shinR', 'armL', 'armR', 'foreL', 'foreR', 'torsoX', 'torsoZ', 'torsoYaw', 'bodyX', 'headYaw'];

// Procedural joint animation. Every joint angle is a SMOOTHED value:
// targets come from the gait cycle (continuous sine swings, elbows and
// knees bending in counter-phase), and the actual angles chase the
// targets through an exponential damp, so pose changes - idle, walk,
// run, crouch, attack, falling - are interpolated over ~120 ms instead
// of snapping. The torso leans into speed and sways with the stride;
// the head (player only) turns toward the travel/camera direction.
// rec.joints is the live joint snapshot the probes read.
export function animatePerson(rec, dt) {
  const parts = rec.group.userData.parts;
  if (!parts) return;
  const down = rec.state === 'down' || rec.state === 'dead';
  const moving = rec.animSpeed > 0.15 && !down;
  // amplitude first: the phase rate is derived from it, so foot speed
  // tracks ground speed (stride length ~ amp * 0.88) instead of sliding;
  // idle still advances the phase slowly for breathing / readiness.
  const amp = rec.state === 'dead' ? 0 : (0.30 + Math.min(0.30, rec.animSpeed * 0.045));
  rec.animPhase += dt * (moving ? Math.max(2, Math.min(14, rec.animSpeed / (amp * 0.88))) : 1.4);
  const ph = rec.animPhase;
  const sw = moving ? Math.sin(ph) : 0;
  const T = { // targets
    legL: sw * amp, legR: -sw * amp,
    shinL: Math.max(0, -Math.sin(ph)) * amp * 0.9 + 0.04,
    shinR: Math.max(0, Math.sin(ph)) * amp * 0.9 + 0.04,
    armL: -sw * amp * 0.8, armR: sw * amp * 0.8,
    foreL: 0.22 + Math.max(0, -Math.sin(ph)) * 0.5,
    foreR: 0.22 + Math.max(0, Math.sin(ph)) * 0.5,
    torsoX: moving ? Math.min(0.16, rec.animSpeed * 0.016) : 0.02,
    torsoZ: moving ? Math.sin(ph) * 0.05 : Math.sin(ph * 0.35) * 0.012,
    torsoYaw: moving ? Math.sin(ph) * 0.07 : 0,
    bodyX: down ? -Math.PI / 2 : 0,
    headYaw: 0,
  };
  if (rec.state === 'attack') {
    T.armR = -2.0 + Math.sin(ph * 3) * 0.4;
    T.foreR = 0.25;
    T.armL = 0.3;
  }
  // W5 idle-social poses: a phone held up at the chest, or the small
  // slow gestures of a person chatting with a partner
  if (rec.armPose === 'phone' && rec.state === 'stand') {
    T.armR = -0.55;
    T.foreR = 1.15;
  }
  if (rec.state === 'social') {
    const gph = rec.animPhase * 0.55 + (rec.gestureSeed || 0);
    T.armR = -0.35 + Math.sin(gph) * 0.16;
    T.foreR = 0.55 + Math.cos(gph * 0.83) * 0.14;
  }
  if (rec.crouchVisual) { T.torsoX = 0.30; T.legL = 0.5; T.legR = -0.35; T.shinL = 0.9; T.shinR = 0.7; }
  // combat poses, lowest priority first so the later ones win:
  // hostile guard < aim < fight pose < swing (down beats them all)
  if (!down && rec.state === 'hostile') {
    T.armL = -0.5; T.foreL = 1.5;
  }
  if (!down && rec.aimPose) {
    T.armR = -1.35; T.foreR = 0.05;
  }
  if (!down && rec.fightPose) {
    rec.guardPhase = (rec.guardPhase || 0) + dt * 7;
    T.armL = -0.62; T.armR = -0.62;
    T.foreL = 1.85; T.foreR = 1.85;
    T.torsoX = 0.14 + Math.sin(rec.guardPhase) * 0.03;
    T.legL = 0.22; T.legR = -0.18;
    T.shinL = 0.35; T.shinR = 0.30;
    T.torsoZ = Math.sin(rec.guardPhase) * 0.03;
  }
  if (!down && rec.swingT > 0) {
    if (rec.swingKind === 'kick') {
      T.legR = -1.15; T.shinR = 0.25;
    } else {
      T.armR = -1.5; T.foreR = 0.08;
    }
  }
  // the player's head looks toward the camera heading when one is given
  // (headTargetYaw is the desired head yaw relative to the body)
  if (parts.headMesh && typeof rec.headTargetYaw === 'number') {
    let d = rec.headTargetYaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    T.headYaw = Math.max(-0.7, Math.min(0.7, d));
  }
  if (!rec.joints) {
    rec.joints = { legL: 0, legR: 0, shinL: 0, shinR: 0, armL: 0, armR: 0, foreL: 0.3, foreR: 0.3, torsoX: 0, torsoZ: 0, torsoYaw: 0, bodyX: 0, headYaw: 0, scaleY: rec.baseScale || 1 };
  }
  const J = rec.joints;
  const k = 1 - Math.exp(-dt * 14); // ~120 ms pose interpolation
  for (const key of JOINT_KEYS) J[key] += (T[key] - J[key]) * k;
  const targetScaleY = (rec.baseScale || 1) * (rec.crouchVisual ? 0.72 : 1);
  J.scaleY += (targetScaleY - J.scaleY) * k;
  parts.legL.rotation.x = J.legL; parts.legR.rotation.x = J.legR;
  parts.shinL.rotation.x = J.shinL; parts.shinR.rotation.x = J.shinR;
  parts.armL.rotation.x = J.armL; parts.armR.rotation.x = J.armR;
  // arms hang with a slight natural outward angle that breathes with the stride
  parts.armL.rotation.z = 0.09 + Math.sin(ph) * 0.02;
  parts.armR.rotation.z = -0.09 - Math.sin(ph) * 0.02;
  parts.foreL.rotation.x = -J.foreL; parts.foreR.rotation.x = -J.foreR;
  parts.torso.rotation.x = J.torsoX; parts.torso.rotation.z = J.torsoZ;
  parts.torso.rotation.y = J.torsoYaw;
  if (parts.headMesh) {
    parts.headMesh.rotation.y = J.headYaw;
    parts.headMesh.rotation.x = Math.sin(ph * 2) * 0.035 * Math.min(1, rec.animSpeed / 4);
  }
  rec.group.rotation.x = J.bodyX;
  rec.group.scale.y = J.scaleY;
  // body bob: feet leave the ground mid-stride; idle is a soft breath.
  // Callers always set group.position.y fresh before animatePerson, so
  // the += here lands on this frame's ground height exactly once.
  if (!down) {
    rec.group.position.y += moving
      ? Math.abs(Math.sin(ph)) * 0.05 * Math.min(1, rec.animSpeed / 3)
      : Math.sin(ph * 0.5) * 0.006;
  }
  if (down) rec.group.position.y = 0.25;
}

// Create the data record for a person. Children deliberately get NO
// health property at all - not zero, not undefined: absent.
export function makePersonRecord(kind, group, x, z) {
  const rec = {
    kind, group,
    x, z, heading: Math.random() * Math.PI * 2,
    speed: 0, animSpeed: 0, animPhase: Math.random() * 6,
    state: 'wander',           // wander | flee | hostile | attack | down | stand | social
    tx: x, tz: z,               // current wander target
    retargetT: Math.random() * 4,
    downT: 0, hostileT: 0,
    build: group.userData.buildName || 'average',
    baseScale: group.userData.baseScaleY ?? group.scale.x,
    crouchVisual: false,
    armed: false,
    armPose: null,              // W5: 'phone' while standing with a phone
    gestureSeed: Math.random() * 6.28,
    socialT: 0, socialPartner: null,
  };
  if (kind !== 'child') rec.health = CFG.npcHealth;
  return rec;
}

// Overhead HP bar: a small canvas sprite that only redraws when the
// fraction or its visibility actually changes.
export function createBar(group) {
  const canvas = document.createElement('canvas');
  canvas.width = 96; canvas.height = 12;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.15, 0.145, 1);
  sprite.position.set(0, 2.05, 0);
  sprite.visible = false;
  group.add(sprite);
  let lastFrac = -1;
  let lastVisible = false;
  function barColor(frac) {
    const green = [0x57, 0xc2, 0x56]; const yellow = [0xe8, 0xc8, 0x32]; const red = [0xd9, 0x4f, 0x3d];
    let a; let b; let t;
    if (frac > 0.5) { a = yellow; b = green; t = (frac - 0.5) * 2; }
    else { a = red; b = yellow; t = frac * 2; }
    const r = Math.round(a[0] + (b[0] - a[0]) * t);
    const g = Math.round(a[1] + (b[1] - a[1]) * t);
    const bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }
  return {
    sprite,
    set(frac, visible) {
      const f = Math.max(0, Math.min(1, frac));
      if (Math.abs(f - lastFrac) <= 0.005 && visible === lastVisible) return;
      lastFrac = f; lastVisible = visible;
      sprite.visible = visible;
      ctx.clearRect(0, 0, 96, 12);
      ctx.fillStyle = 'rgba(10,10,14,0.72)';
      ctx.fillRect(0, 0, 96, 12);
      ctx.strokeStyle = 'rgba(10,10,14,0.72)';
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, 95, 11);
      ctx.fillStyle = barColor(f);
      ctx.fillRect(2, 2, f * (96 - 4), 12 - 4);
      tex.needsUpdate = true;
    },
  };
}

// A small hand-held weapon prop (bat / knife / pistol) for the right hand.
export function makeWeaponProp(kind) {
  if (kind === 'baton') {
    const geo = new THREE.CylinderGeometry(0.026, 0.034, 0.72, 8);
    geo.translate(0, -0.30, 0);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x9a6a38, roughness: 0.8, metalness: 0 }));
    m.castShadow = false;
    return m;
  }
  if (kind === 'knife') {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.045),
      new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.7, metalness: 0.1 }));
    handle.position.set(0, -0.055, 0);
    handle.castShadow = false;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.17, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.35, metalness: 0.7 }));
    blade.position.set(0, -0.195, 0);
    blade.castShadow = false;
    g.add(handle, blade);
    return g;
  }
  // pistol
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.20),
    new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.5, metalness: 0.4 }));
  body.position.set(0, -0.06, 0);
  body.castShadow = false;
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.045, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.5, metalness: 0.4 }));
  barrel.position.set(0, -0.02, 0.14);
  barrel.castShadow = false;
  g.add(body, barrel);
  return g;
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
  const body = new THREE.Mesh(mergeColored(parts), coloredStandard);
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
