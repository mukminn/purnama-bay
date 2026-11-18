// PURNAMA BAY - the five vehicles of the bay and the arcade driving model.
// Parked cars sit empty and can be taken; traffic cars carry a driver and
// never offer the ENTER prompt. One physics step drives the player's car.
import * as THREE from 'three';
import { S, CFG, dist2d, pushOut, clamp } from './config.js';
import { sfx } from './audio.js';

export const MODELS = {
  'Pijar City': { len: 3.6, wid: 1.7, hgt: 0.62, cabin: 0.5, maxSpeed: 17, accel: 11, color: 0xd96f32 },
  'Baruna 4D': { len: 4.4, wid: 1.8, hgt: 0.58, cabin: 0.48, maxSpeed: 19.6, accel: 12, color: 0x2e5f8a },
  'Gelora GT': { len: 4.3, wid: 1.85, hgt: 0.42, cabin: 0.34, maxSpeed: 24, accel: 15, color: 0xc22e2e },
  'Tangguh Pickup': { len: 4.8, wid: 1.95, hgt: 0.72, cabin: 0.55, maxSpeed: 18, accel: 10.5, color: 0x3f7d4e },
  'Patrol Unit': { len: 4.5, wid: 1.85, hgt: 0.6, cabin: 0.5, maxSpeed: 21, accel: 13, color: 0xf0f0f0 },
};
const PAINTS = [0xd96f32, 0x2e5f8a, 0xc9973f, 0x3f7d4e, 0x7a4a8c, 0xb8452e, 0xe8e3d5, 0x31435c];

function buildCarMesh(model, colorOverride) {
  const spec = MODELS[model];
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color: colorOverride !== undefined ? colorOverride : spec.color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2126 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x9fd4e8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(spec.wid, spec.hgt, spec.len), paint);
  body.position.y = 0.35 + spec.hgt / 2;
  body.castShadow = true;
  g.add(body);
  if (model === 'Tangguh Pickup') {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.92, spec.cabin, spec.len * 0.36), paint);
    cab.position.set(0, 0.35 + spec.hgt + spec.cabin / 2, spec.len * 0.22);
    cab.castShadow = true;
    g.add(cab);
    const win = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.94, spec.cabin * 0.55, spec.len * 0.3), glass);
    win.position.set(0, 0.35 + spec.hgt + spec.cabin * 0.62, spec.len * 0.22);
    g.add(win);
  } else {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(spec.wid * 0.86, spec.cabin, spec.len * 0.46), glass);
    cab.position.set(0, 0.35 + spec.hgt + spec.cabin / 2, -spec.len * 0.04);
    cab.castShadow = true;
    g.add(cab);
  }
  if (model === 'Patrol Unit') {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(spec.wid + 0.02, 0.2, spec.len * 0.7), dark);
    stripe.position.y = 0.62;
    g.add(stripe);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.14, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    bar.position.set(0, 0.35 + spec.hgt + spec.cabin + 0.08, -spec.len * 0.04);
    g.add(bar);
    g.userData.lightBar = bar;
  }
  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 10);
  const wheels = [];
  for (const [wx, wz] of [[-spec.wid / 2, spec.len * 0.32], [spec.wid / 2, spec.len * 0.32], [-spec.wid / 2, -spec.len * 0.32], [spec.wid / 2, -spec.len * 0.32]]) {
    const w = new THREE.Mesh(wheelGeo, dark);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.34, wz);
    g.add(w); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

function makeCarRecord(scene, model, x, z, heading, traffic, colorOverride) {
  const group = buildCarMesh(model, colorOverride);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  const rec = {
    model, group, x, z, heading,
    speed: 0, traffic: !!traffic,
    hasDriver: !!traffic,
    health: 100, dead: false,
    axis: Math.random() < 0.5 ? 'x' : 'z',
    line: 0, dir: 1, cruise: 7 + Math.random() * 3,
    isTarget: false, isStolen: false,
  };
  if (traffic) {
    // pin the car to a road line: it cruises one straight avenue forever
    if (rec.axis === 'x') { rec.line = z; rec.heading = Math.PI / 2; rec.dir = 1; }
    else { rec.line = x; rec.heading = 0; rec.dir = 1; }
    if (Math.random() < 0.5) { rec.dir = -1; rec.heading += Math.PI; }
  }
  S.cars.push(rec);
  return rec;
}

export function buildVehicles(scene) {
  // parked, empty, takeable - the first one waits by the mission pickup point
  makeCarRecord(scene, 'Baruna 4D', 3, 70, Math.PI / 2, false);
  makeCarRecord(scene, 'Pijar City', -46, 14, 0, false);
  makeCarRecord(scene, 'Gelora GT', 46, -34, Math.PI, false);
  makeCarRecord(scene, 'Tangguh Pickup', -14, -76, Math.PI / 2, false);
  makeCarRecord(scene, 'Pijar City', 86, 46, -Math.PI / 2, false, 0xc9973f);
  makeCarRecord(scene, 'Baruna 4D', -88, -66, 0, false, 0x7a4a8c);
  // the specific Gelora GT that mission 3 sends Raka to steal
  const steal = makeCarRecord(scene, 'Gelora GT', 88, -38, Math.PI / 2, false, 0x14666e);
  steal.isStolen = true;
  // traffic with drivers aboard
  const lines = [-80, -40, 0, 40, 80];
  const models = Object.keys(MODELS).filter((m) => m !== 'Patrol Unit');
  lines.forEach((ln, i) => {
    const c1 = makeCarRecord(scene, models[i % models.length], ln + 3, -100 + i * 47, 0, true, PAINTS[i % PAINTS.length]);
    c1.axis = 'z'; c1.line = ln + 3; c1.x = ln + 3; c1.z = -100 + i * 47;
    const c2 = makeCarRecord(scene, models[(i + 2) % models.length], -110 + i * 52, ln - 3, Math.PI / 2, true, PAINTS[(i + 3) % PAINTS.length]);
    c2.axis = 'x'; c2.line = ln - 3; c2.x = -110 + i * 52; c2.z = ln - 3;
  });
  return steal;
}

export function nearestEnterableCar(x, z, maxDist) {
  let best = null; let bd = maxDist || 3.4;
  for (const c of S.cars) {
    if (c.traffic || c.dead) continue;
    if (S.currentCar === c) continue;
    const d = dist2d(x, z, c.x, c.z);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function syncCarMesh(c) {
  c.group.position.x = c.x;
  c.group.position.z = c.z;
  c.group.rotation.y = c.heading;
  const spin = c.speed * 0.12;
  for (const w of c.group.userData.wheels || []) w.rotation.x += spin;
  const bar = c.group.userData.lightBar;
  if (bar) bar.material.color.setHex(Math.floor(S.time * 4) % 2 ? 0xff4444 : 0x4466ff);
}

// One arcade physics step for the car the player is driving.
export function driveStep(car, dt, throttle, steer, brake) {
  const spec = MODELS[car.model];
  if (car.dead) { car.speed = 0; return; }
  if (brake) {
    const dec = 26 * dt;
    car.speed = Math.abs(car.speed) <= dec ? 0 : car.speed - Math.sign(car.speed) * dec;
  } else if (throttle > 0.05) {
    car.speed += spec.accel * throttle * dt * (car.speed < 0 ? 2.2 : 1);
    if (car.speed > spec.maxSpeed) car.speed = spec.maxSpeed;
  } else if (throttle < -0.05) {
    car.speed += spec.accel * 0.62 * throttle * dt * (car.speed > 0 ? 2.2 : 1);
    if (car.speed < -6.5) car.speed = -6.5;
  } else {
    car.speed -= car.speed * 0.55 * dt;
    if (Math.abs(car.speed) < 0.04) car.speed = 0;
  }
  if (steer && Math.abs(car.speed) > 0.2) {
    const grip = clamp(Math.abs(car.speed) / 6, 0.25, 1);
    car.heading += steer * 1.55 * grip * dt * Math.sign(car.speed);
  }
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  car.x = clamp(car.x, -CFG.worldHalf + 2, CFG.worldHalf - 2);
  car.z = clamp(car.z, -CFG.worldHalf + 2, CFG.worldHalf + 20);
  const probe = { x: car.x, z: car.z };
  pushOut(probe, 1.5);
  if (Math.abs(probe.x - car.x) > 0.01 || Math.abs(probe.z - car.z) > 0.01) {
    car.x = probe.x; car.z = probe.z;
    if (Math.abs(car.speed) > 7) damageCar(car, (Math.abs(car.speed) - 6) * 1.4);
    car.speed *= 0.35;
  }
  syncCarMesh(car);
}

export function damageCar(car, dmg) {
  car.health -= dmg;
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    car.speed = 0;
    car.group.traverse((o) => { if (o.material && o.material.color) o.material = o.material.clone(); });
  }
}

export function updateTraffic(dt) {
  for (const c of S.cars) {
    if (!c.traffic || c.dead) continue;
    // slow for the player's car ahead, otherwise cruise the avenue
    let speed = c.cruise;
    if (S.currentCar) {
      const ahead = c.axis === 'x'
        ? (S.currentCar.z - c.z) * 0 + (Math.abs(S.currentCar.z - c.line) < 4 ? (S.currentCar.x - c.x) * c.dir : -1)
        : (Math.abs(S.currentCar.x - c.line) < 4 ? (S.currentCar.z - c.z) * c.dir : -1);
      if (ahead > 0 && ahead < 9) speed = Math.min(speed, Math.max(0, Math.abs(S.currentCar.speed)));
    }
    c.speed = speed * c.dir;
    if (c.axis === 'x') {
      c.x += c.speed * dt;
      c.z = c.line;
      c.heading = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (c.x > CFG.worldHalf - 4) c.x = -CFG.worldHalf + 4;
      if (c.x < -CFG.worldHalf + 4) c.x = CFG.worldHalf - 4;
    } else {
      c.z += c.speed * dt;
      c.x = c.line;
      c.heading = c.dir > 0 ? 0 : Math.PI;
      if (c.z > CFG.worldHalf - 4) c.z = -CFG.worldHalf + 4;
      if (c.z < -CFG.worldHalf + 4) c.z = CFG.worldHalf - 4;
    }
    syncCarMesh(c);
  }
}

// Top speed of a model in km/h, for the garage talk in dialog.
export function topSpeedKmh(model) {
  return Math.round((MODELS[model] ? MODELS[model].maxSpeed : 0) * 3.6);
}

export function enterCar(car) {
  S.inCar = true;
  S.currentCar = car;
  S.p.x = car.x; S.p.z = car.z;
  sfx.engine();
}

export function exitCar() {
  const car = S.currentCar;
  if (!car) { S.inCar = false; return; }
  S.inCar = false;
  S.currentCar = null;
  S.p.x = car.x + Math.cos(car.heading) * 2.2;
  S.p.z = car.z - Math.sin(car.heading) * 2.2;
  S.p.heading = car.heading;
}
