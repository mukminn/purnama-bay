// Fully articulated low-poly humans: head + hair, neck, torso, two-segment
// arms with hands, two-segment legs with shoes — all posed procedurally
// (idle / walk / run / sprint / drive / punch / kick / shoot / jump / crouch).
import * as THREE from '../vendor/three.module.min.js';

const matCache = new Map();
function mat(color, rough = 0.85) {
  // Lambert: far cheaper per-pixel than Standard in software rendering, and
  // with the warm sun + hemisphere light it keeps the same golden-hour read.
  const key = color + ':' + rough;
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(key);
}
function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

// opts: { skin, hair, shirt, pants, shoe, scale, cap }
export function createHuman(opts = {}) {
  const s = opts.scale || 1;
  const g = new THREE.Group();
  const skin = mat(opts.skin ?? 0xc68863);
  const hairM = mat(opts.hair ?? 0x241610, 0.95);
  const shirt = mat(opts.shirt ?? 0x3c78d8);
  const pants = mat(opts.pants ?? 0x2e3a46);
  const shoeM = mat(opts.shoe ?? 0x222222, 0.6);

  const hips = new THREE.Group(); hips.position.y = 0.92; g.add(hips);
  const torso = box(0.46, 0.58, 0.26, shirt, 0, 0.28, 0); hips.add(torso);
  const headG = new THREE.Group(); headG.position.y = 0.66; hips.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.155, 12, 10), skin);
  head.position.y = 0.1; head.castShadow = true; headG.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.162, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), hairM);
  hair.position.y = 0.125; hair.castShadow = true; headG.add(hair);
  if (opts.cap) {
    const cap = box(0.3, 0.06, 0.3, mat(opts.cap, 0.7), 0, 0.22, 0);
    const brim = box(0.28, 0.03, 0.18, mat(opts.cap, 0.7), 0, 0.2, 0.2);
    headG.add(cap); headG.add(brim);
  }

  function arm(side) {
    const sh = new THREE.Group(); sh.position.set(0.29 * side, 0.52, 0); hips.add(sh);
    const upper = box(0.13, 0.34, 0.13, shirt, 0, -0.15, 0); sh.add(upper);
    upper.castShadow = false;
    const el = new THREE.Group(); el.position.y = -0.32; sh.add(el);
    // forearm runs into the hand (one piece, same skin tone, mitten end)
    const fore = box(0.11, 0.42, 0.11, skin, 0, -0.19, 0); el.add(fore);
    fore.castShadow = false;
    return { sh, el };
  }
  function leg(side) {
    const hip = new THREE.Group(); hip.position.set(0.12 * side, 0.02, 0); g.add(hip);
    hip.position.y = 0.92;
    const thigh = box(0.16, 0.44, 0.16, pants, 0, -0.21, 0); hip.add(thigh);
    thigh.castShadow = false;
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    const shin = box(0.13, 0.4, 0.13, pants, 0, -0.18, 0); knee.add(shin);
    shin.castShadow = false;
    const shoe = box(0.14, 0.09, 0.27, shoeM, 0, -0.4, 0.05); knee.add(shoe);
    shoe.castShadow = false;
    return { hip, knee };
  }
  const armL = arm(-1), armR = arm(1);
  const legL = leg(-1), legR = leg(1);
  g.scale.setScalar(s);
  g.userData.parts = { hips, headG, armL, armR, legL, legR };
  g.userData.baseHipY = 0.92;
  return g;
}

// Weapon props attached to the right hand: baton stick or a blocky pistol.
export function attachWeaponProp(g, kind) {
  const p = g.userData.parts;
  if (g.userData.prop) { p.armR.el.remove(g.userData.prop); g.userData.prop = null; }
  if (kind === 'baton') {
    const prop = box(0.06, 0.62, 0.06, mat(0x2b2b30, 0.5), 0, -0.55, 0.04);
    prop.rotation.x = 0.4;
    p.armR.el.add(prop); g.userData.prop = prop;
  } else if (kind === 'pistol') {
    const grp = new THREE.Group();
    const body = box(0.07, 0.13, 0.3, mat(0x1c1e22, 0.35), 0, -0.36, 0.1);
    const grip = box(0.06, 0.16, 0.08, mat(0x111214, 0.5), 0, -0.44, 0.02);
    grp.add(body); grp.add(grip);
    p.armR.el.add(grp); g.userData.prop = grp;
  }
  return g;
}

// A soft blob shadow disc (used under animals and as a grounding aid).
export function blobShadow(r = 0.5, opacity = 0.32) {
  const m = new THREE.Mesh(
    new THREE.CircleGeometry(r, 14),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.03;
  return m;
}

// Pose a fallen body: lying flat, limbs loose. Used for knocked-out NPCs.
export function poseFallen(g) {
  const p = g.userData.parts;
  g.rotation.x = -Math.PI / 2 + 0.06;
  p.armL.sh.rotation.z = 1.2; p.armR.sh.rotation.z = -0.7;
  p.legL.hip.rotation.x = 0.14; p.legR.hip.rotation.x = -0.1;
  return g;
}

// Pose a human. state: { mode, phase, speed01, crouch01, attackT, attackKind, aim }
export function poseHuman(g, st, dt) {
  const p = g.userData.parts;
  const t = st.time || 0;
  const sw = Math.sin(st.phase || 0);
  const sw2 = Math.sin((st.phase || 0) + Math.PI);
  const amp = 0.25 + 0.55 * (st.speed01 || 0);
  let hipY = g.userData.baseHipY;
  // legs swing opposite, knees bend on the lifting leg
  p.legL.hip.rotation.x = sw * amp * (st.moving ? 1 : 0);
  p.legR.hip.rotation.x = sw2 * amp * (st.moving ? 1 : 0);
  p.legL.knee.rotation.x = Math.max(0, -sw2) * 0.9 * (st.moving ? 1 : 0) + (st.moving ? 0.08 : 0);
  p.legR.knee.rotation.x = Math.max(0, -sw) * 0.9 * (st.moving ? 1 : 0) + (st.moving ? 0.08 : 0);
  // arms swing opposite to legs; idle breathing
  const breathe = Math.sin(t * 1.7) * 0.03;
  p.armL.sh.rotation.x = sw2 * amp * 0.8 * (st.moving ? 1 : 0) + breathe;
  p.armR.sh.rotation.x = sw * amp * 0.8 * (st.moving ? 1 : 0) - breathe;
  p.armL.el.rotation.x = -0.25 - (st.moving ? 0.3 : 0);
  p.armR.el.rotation.x = -0.25 - (st.moving ? 0.3 : 0);
  p.armL.sh.rotation.z = 0.08; p.armR.sh.rotation.z = -0.08;
  p.hips.rotation.x = (st.moving ? 0.06 + 0.08 * (st.speed01 || 0) : 0.01);
  p.headG.rotation.y = Math.sin(t * 0.4) * 0.06;
  p.headG.rotation.x = 0;

  if (st.mode === 'crouch') {
    hipY -= 0.34;
    p.legL.hip.rotation.x = -1.5; p.legR.hip.rotation.x = -0.4;
    p.legL.knee.rotation.x = 1.9; p.legR.knee.rotation.x = 1.5;
    p.hips.rotation.x = 0.42;
    p.armL.sh.rotation.x = -0.5; p.armR.sh.rotation.x = -0.5;
    p.headG.rotation.x = -0.25;
  } else if (st.mode === 'jump') {
    p.legL.hip.rotation.x = -0.55; p.legR.hip.rotation.x = 0.3;
    p.legL.knee.rotation.x = 0.8; p.legR.knee.rotation.x = 0.5;
    p.armL.sh.rotation.x = -0.7; p.armR.sh.rotation.x = -0.7;
  } else if (st.mode === 'drive') {
    hipY -= 0.42;
    p.legL.hip.rotation.x = -1.35; p.legR.hip.rotation.x = -1.35;
    p.legL.knee.rotation.x = 1.25; p.legR.knee.rotation.x = 1.25;
    p.armL.sh.rotation.x = -0.95; p.armR.sh.rotation.x = -0.95;
    p.armL.el.rotation.x = -0.25; p.armR.el.rotation.x = -0.25;
    p.armL.sh.rotation.z = 0.35; p.armR.sh.rotation.z = -0.35;
    p.hips.rotation.x = 0.05;
  }
  // attacks overlay on the right arm / right leg
  const at = st.attackT || 0;
  if (at > 0 && st.attackKind === 'punch') {
    const k = Math.sin(Math.min(1, 1 - at / 0.22) * Math.PI);
    p.armR.sh.rotation.x = -1.5 * k - 0.2;
    p.armR.el.rotation.x = -0.15 * (1 - k);
    p.hips.rotation.y = 0.3 * k;
  } else if (at > 0 && st.attackKind === 'baton') {
    const k = Math.sin(Math.min(1, 1 - at / 0.3) * Math.PI);
    p.armR.sh.rotation.x = -2.2 * k + 0.4;
    p.armR.el.rotation.x = -0.4 * (1 - k);
    p.hips.rotation.y = 0.35 * k;
  } else if (at > 0 && st.attackKind === 'kick') {
    const k = Math.sin(Math.min(1, 1 - at / 0.4) * Math.PI);
    p.legR.hip.rotation.x = -1.6 * k;
    p.legR.knee.rotation.x = 0.25 * (1 - k);
    p.hips.rotation.y = -0.25 * k;
    hipY -= 0.03 * k;
  } else if (st.mode !== 'drive') {
    p.hips.rotation.y *= 0.8;
  }
  if (st.aim) { // pistol: both arms forward, steady
    p.armR.sh.rotation.x = -1.45; p.armR.el.rotation.x = -0.06;
    p.armL.sh.rotation.x = -1.3; p.armL.el.rotation.x = -0.35;
    p.headG.rotation.x = 0.05;
  }
  p.hips.position.y = hipY + (st.moving ? Math.abs(Math.cos(st.phase || 0)) * 0.045 : Math.sin(t * 1.7) * 0.008);
  return g;
}
