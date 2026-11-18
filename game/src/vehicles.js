// Vehicles: shaped bodies with rounded cabin, dark reflective glass, wheels,
// lit headlights/taillights at dusk, police lightbar; 5 types with distinct
// handling; staged damage (dent -> smoke -> fire -> dead).
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';

const glassMat = new THREE.MeshLambertMaterial({ color: 0x10161f });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14161a });
const hubMat = new THREE.MeshLambertMaterial({ color: 0xb9c2cc });
const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0xffdf7e });
const tailMat = new THREE.MeshLambertMaterial({ color: 0xff4b3e, emissive: 0xd21f12 });

let carSeq = 0;
export function createCar(type, opts = {}) {
  const spec = CFG.carTypes[type];
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: opts.color ?? spec.color });
  const L = type === 'tangguh' ? 4.6 : type === 'gelora' ? 4.3 : 4.0;
  const W = 1.9, bodyH = type === 'tangguh' ? 0.85 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(W, bodyH, L), paint);
  body.position.y = 0.55; body.castShadow = true;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(W * 0.92, bodyH * 0.55, 0.5), paint);
  nose.position.set(0, 0.48, L / 2 + 0.12); nose.castShadow = true;
  g.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(W * 0.82, 0.55, L * 0.45), glassMat);
  cabin.position.set(0, 1.1, type === 'tangguh' ? -0.5 : -0.15); cabin.castShadow = true;
  g.add(cabin);
  if (type === 'tangguh') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.4, 1.5), paint);
    bed.position.set(0, 0.95, 1.35); bed.castShadow = true;
    g.add(bed);
  }
  if (type === 'gelora') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(W * 0.9, 0.08, 0.4), paint);
    spoiler.position.set(0, 1.02, -L / 2 + 0.2);
    g.add(spoiler);
  }
  const wheels = [];
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
  for (const [wx, wz] of [[-W / 2, L / 2 - 0.75], [W / 2, L / 2 - 0.75], [-W / 2, -L / 2 + 0.75], [W / 2, -L / 2 + 0.75]]) {
    const wgrp = new THREE.Group();
    const tyre = new THREE.Mesh(wheelGeo, tyreMat);
    tyre.rotation.z = Math.PI / 2;
    wgrp.add(tyre);
    wgrp.position.set(wx, 0.36, wz);
    g.add(wgrp); wheels.push(wgrp);
  }
  void hubMat;
  const hl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.14, 0.06), headMat);
  hl.position.set(0, 0.58, L / 2 + 0.36); g.add(hl);
  const tl = new THREE.Mesh(new THREE.BoxGeometry(W * 0.78, 0.12, 0.06), tailMat);
  tl.position.set(0, 0.62, -L / 2 - 0.02); g.add(tl);
  let lightbar = null, lightR = null, lightB = null;
  if (type === 'patrol') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W + 0.02, 0.2, L * 0.7), new THREE.MeshLambertMaterial({ color: 0x2456a6 }));
    stripe.position.y = 0.56; g.add(stripe);
    lightbar = new THREE.Group();
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.3), tyreMat);
    lightR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.26), new THREE.MeshLambertMaterial({ color: 0xff2a20, emissive: 0xff1a10, emissiveIntensity: 0.4 }));
    lightR.position.x = -0.28;
    lightB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.26), new THREE.MeshLambertMaterial({ color: 0x2255ff, emissive: 0x1144ff, emissiveIntensity: 0.4 }));
    lightB.position.x = 0.28;
    lightbar.add(barBase); lightbar.add(lightR); lightbar.add(lightB);
    lightbar.position.set(0, 1.46, -0.15);
    g.add(lightbar);
  }
  // smoke / fire emitters (toggled by damage stage)
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), new THREE.MeshLambertMaterial({ color: 0x555c63, transparent: true, opacity: 0.55 }));
  smoke.position.set(0, 1.05, L / 2 - 0.4); smoke.visible = false;
  g.add(smoke);
  const fire = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 8), new THREE.MeshLambertMaterial({ color: 0xff7b24, emissive: 0xff5a00, emissiveIntensity: 2.4, transparent: true, opacity: 0.9 }));
  fire.position.set(0, 1.3, L / 2 - 0.4); fire.visible = false;
  g.add(fire);

  const car = {
    id: ++carSeq, type, spec, group: g, wheels, cabin, smoke, fire, lightR, lightB,
    pos: g.position, heading: opts.heading || 0,
    speed: 0, health: 100, dead: false, driver: opts.driver || null, // null = parked/empty
    isPlayer: false, lastImpactAt: 0, smokeT: 0,
  };
  g.position.set(opts.x || 0, 0, opts.z || 0);
  g.rotation.y = car.heading;
  return car;
}

// Shared arcade driving step. input: { throttle -1..1, steer -1..1, brake bool }
export function stepVehicle(car, input, dt, world) {
  if (car.dead) { car.speed = 0; return; }
  const sp = car.spec;
  const maxF = sp.maxSpeed, maxR = -7;
  if (input.brake) {
    car.speed -= Math.sign(car.speed) * sp.brake * dt;
    if (Math.abs(car.speed) < 0.4) car.speed = 0;
  } else if (input.throttle > 0) {
    car.speed = Math.min(maxF, car.speed + sp.accel * input.throttle * dt * (1 - Math.max(0, car.speed) / (maxF * 1.6)));
  } else if (input.throttle < 0) {
    if (car.speed > 0.5) car.speed = Math.max(0, car.speed - sp.brake * dt);
    else car.speed = Math.max(maxR, car.speed + sp.accel * 0.6 * input.throttle * dt);
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 3.2 * dt); // engine drag
  }
  const steerAuthority = Math.min(1, Math.abs(car.speed) / 6 + 0.15);
  if (Math.abs(car.speed) > 0.05) {
    car.heading -= input.steer * sp.grip * 0.42 * steerAuthority * dt * Math.sign(car.speed);
  }
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let nx = car.pos.x + fx * car.speed * dt;
  let nz = car.pos.z + fz * car.speed * dt;
  const before = Math.hypot(car.pos.x - nx, car.pos.z - nz);
  [nx, nz] = world.collide(nx, nz, 1.5);
  const after = Math.hypot(car.pos.x - nx, car.pos.z - nz);
  // blocked by a building while moving fast = an impact
  if (before - after > 0.02 && Math.abs(car.speed) > 5) {
    applyImpact(car, Math.abs(car.speed));
    car.speed *= 0.25;
  }
  car.pos.x = nx; car.pos.z = nz;
  car.group.rotation.y = car.heading;
  const spin = car.speed * dt / 0.36;
  car.wheels.forEach((w, i) => {
    w.rotation.x += spin;
    if (i < 2) w.rotation.y = -input.steer * 0.42;
  });
}

export function applyImpact(car, impactSpeed) {
  const dmg = Math.max(0, impactSpeed - 3.5) * CFG.collisionDamageFactor;
  if (dmg <= 0) return 0;
  car.health = Math.max(0, car.health - dmg);
  refreshDamageVisual(car);
  if (car.health <= 0) car.dead = true;
  return dmg;
}

export function refreshDamageVisual(car) {
  if (car.health < 72) { // light dent: cabin sits a touch crooked
    car.cabin.rotation.z = 0.03;
    car.cabin.position.y = 1.08;
  }
  car.smoke.visible = car.health < 55 && !car.dead;
  car.fire.visible = car.health < 26;
  if (car.dead) { car.smoke.visible = true; car.fire.visible = false; }
}

// Traffic brain: follow the rectangular road loop, keep a lane offset, and
// brake for anything alive or solid within 6 m ahead. Never hits pedestrians:
// the caller passes blockers and traffic stops dead rather than touch them.
export const TRAFFIC_LOOP = [
  { x: -63, z: -63 }, { x: 57, z: -63 }, { x: 57, z: 37 }, { x: -63, z: 37 },
];
export function trafficInput(car, dt, blockers) {
  const target = TRAFFIC_LOOP[car.wp || 0];
  const dx = target.x - car.pos.x, dz = target.z - car.pos.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 6) car.wp = ((car.wp || 0) + 1) % TRAFFIC_LOOP.length;
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.6));
  // blocker scan ahead
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  let blocked = false;
  for (const b of blockers) {
    const bx = b.x - car.pos.x, bz = b.z - car.pos.z;
    const ahead = bx * fx + bz * fz;
    const side = Math.abs(bx * fz - bz * fx);
    if (ahead > 0.5 && ahead < 6 && side < 1.7) { blocked = true; break; }
  }
  car.blocked = blocked;
  if (blocked) return { throttle: 0, steer: 0, brake: true };
  const cruise = 8.5;
  return { throttle: car.speed < cruise ? 0.7 : 0, steer, brake: car.speed > cruise + 2 };
}

// Police / target-car steering toward a point with a desired speed.
export function chaseInput(car, tx, tz, desiredSpeed) {
  const dx = tx - car.pos.x, dz = tz - car.pos.z;
  const want = Math.atan2(dx, dz);
  let diff = want - car.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.9));
  const dist = Math.hypot(dx, dz);
  if (Math.abs(diff) > 2.4 && car.speed > 4) return { throttle: 0, steer, brake: true };
  if (dist < 3 && desiredSpeed === 0) return { throttle: 0, steer: 0, brake: true };
  return { throttle: car.speed < desiredSpeed ? 1 : 0.1, steer, brake: car.speed > desiredSpeed + 4 };
}

// Per-frame cosmetic update: lightbar strobes, smoke puffs grow and fade.
export function updateCarCosmetics(car, dt, t, sirenActive) {
  if (car.lightR) {
    const phase = Math.sin(t * 11) > 0;
    car.lightR.material.emissiveIntensity = sirenActive && phase ? 3.2 : 0.35;
    car.lightB.material.emissiveIntensity = sirenActive && !phase ? 3.2 : 0.35;
  }
  if (car.smoke.visible) {
    car.smokeT += dt;
    const s = 0.7 + (car.smokeT % 0.9) * 1.5;
    car.smoke.scale.setScalar(s);
    car.smoke.position.y = 1.05 + (car.smokeT % 0.9) * 0.9;
    car.smoke.material.opacity = 0.55 - (car.smokeT % 0.9) * 0.4;
  }
  if (car.fire.visible) {
    car.fire.scale.set(1 + Math.sin(t * 23) * 0.18, 1 + Math.sin(t * 29) * 0.3, 1);
  }
}
