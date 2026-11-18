// PURNAMA BAY - the five vehicles of the bay and the arcade driving model.
// Parked cars sit empty and can be taken; traffic cars carry a driver and
// never offer the ENTER prompt. One physics step drives the player's car.
import * as THREE from 'three';
import { S, CFG, dist2d, pushOut, pushOutCars, clamp } from './config.js';
import { sfx } from './audio.js';
import { mergeColored, coloredLambert } from './merge.js';

const coloredBasic = new THREE.MeshBasicMaterial({ vertexColors: true });

export const MODELS = {
  'Pijar City': { len: 3.6, wid: 1.7, hgt: 0.62, cabin: 0.5, maxSpeed: 17, accel: 11, color: 0xd96f32 },
  'Baruna 4D': { len: 4.4, wid: 1.8, hgt: 0.58, cabin: 0.48, maxSpeed: 19.6, accel: 12, color: 0x2e5f8a },
  'Gelora GT': { len: 4.3, wid: 1.85, hgt: 0.42, cabin: 0.34, maxSpeed: 24, accel: 15, color: 0xc22e2e },
  'Tangguh Pickup': { len: 4.8, wid: 1.95, hgt: 0.72, cabin: 0.55, maxSpeed: 18, accel: 10.5, color: 0x3f7d4e },
  'Patrol Unit': { len: 4.5, wid: 1.85, hgt: 0.6, cabin: 0.5, maxSpeed: 21, accel: 13, color: 0xf0f0f0 },
};
// Dusk-coast metallic paints: bold but one family - sunset orange, deep
// sea teal, magenta dusk, neon cyan, warm gold, plum, coral, pearl.
const PAINTS = [0xe86a2a, 0x14666e, 0xd94f70, 0x1fa8b8, 0xd9a441, 0x6a4a9e, 0xe8e0cc, 0x274b63];

// Extrude a car's side profile (length x height) across its width with a
// small bevel, so hoods, windscreens, roofs and trunks slope and the
// corners read rounded instead of stacked-box. The shape's +X is the
// car's nose; after the rotation the nose faces +Z (the heading axis).
function profileGeometry(points, width) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const depth = Math.max(0.4, width - 0.14);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, steps: 1,
  });
  geo.rotateY(-Math.PI / 2);
  geo.translate(depth / 2, 0, 0);
  return geo;
}

function buildCarMesh(model, colorOverride) {
  const spec = MODELS[model];
  const L = spec.len; const Wd = spec.wid;
  const paintColor = colorOverride !== undefined ? colorOverride : spec.color;
  const g = new THREE.Group();
  const pickup = model === 'Tangguh Pickup';
  // side profile: nose low and sloped, windscreen rising to a flat roof,
  // short sloped tail. The pickup gets a forward cab and an open bed.
  const bodyPts = pickup
    ? [[-L / 2, 0.30], [L / 2, 0.30], [L / 2, 0.78], [L * 0.34, 0.86], [L * 0.26, 1.42], [L * 0.02, 1.46], [-L * 0.06, 0.92], [-L / 2, 0.90]]
    : [[-L / 2, 0.30], [L / 2, 0.30], [L / 2, 0.68], [L * 0.30, 0.82], [L * 0.10, 1.30], [-L * 0.16, 1.34], [-L * 0.30, 0.86], [-L / 2, 0.82]];
  // The whole car is four draw calls: metallic paint (profile + roof
  // panel merged), the glass canopy, one merged dark assembly (bumpers,
  // wheels, arch discs, bed, stripe) and one merged lamp strip.
  const roofLen = pickup ? L * 0.17 : L * 0.26;
  const roofZ = pickup ? L * 0.10 : -L * 0.025;
  const paintMesh = new THREE.Mesh(mergeColored([
    { geo: profileGeometry(bodyPts, Wd), color: paintColor },
    { geo: new THREE.BoxGeometry(Wd * 0.8, 0.055, roofLen), color: paintColor, y: pickup ? 1.475 : 1.365, z: roofZ },
  ]), new THREE.MeshPhongMaterial({ vertexColors: true, shininess: 70, specular: 0x8fa8bf }));
  paintMesh.castShadow = true;
  g.add(paintMesh);
  // glasshouse: one narrower sloped band fused into the body profile -
  // windscreen, side glass and rear screen read as a single canopy
  const glassPts = pickup
    ? [[L * 0.245, 0.90], [L * 0.175, 1.38], [L * 0.035, 1.41], [-L * 0.045, 0.92]]
    : [[L * 0.265, 0.84], [L * 0.095, 1.265], [-L * 0.145, 1.30], [-L * 0.265, 0.87]];
  const canopy = new THREE.Mesh(profileGeometry(glassPts, Wd * 0.82),
    new THREE.MeshPhongMaterial({ color: 0x16283a, shininess: 130, specular: 0xcfe8ff }));
  g.add(canopy);
  const DARK = 0x14181d;
  const darkParts = [
    { geo: new THREE.BoxGeometry(Wd * 0.96, 0.16, 0.14), color: DARK, y: 0.38, z: L / 2 + 0.03 },
    { geo: new THREE.BoxGeometry(Wd * 0.96, 0.16, 0.14), color: DARK, y: 0.38, z: -L / 2 - 0.03 },
  ];
  if (pickup) darkParts.push({ geo: new THREE.BoxGeometry(Wd * 0.94, 0.34, L * 0.34), color: DARK, y: 0.78, z: -L * 0.30 });
  if (model === 'Patrol Unit') darkParts.push({ geo: new THREE.BoxGeometry(Wd + 0.03, 0.18, L * 0.62), color: DARK, y: 0.58 });
  // wheels pushed out to the body's edge, dark arch disc behind each
  for (const [wx, wz] of [[-Wd / 2, L * 0.32], [Wd / 2, L * 0.32], [-Wd / 2, -L * 0.32], [Wd / 2, -L * 0.32]]) {
    darkParts.push({ geo: new THREE.CylinderGeometry(0.35, 0.35, 0.26, 14), color: DARK, x: wx, y: 0.35, z: wz, rz: Math.PI / 2 });
    darkParts.push({ geo: new THREE.CircleGeometry(0.47, 14, 0, Math.PI), color: DARK, x: wx + (wx < 0 ? -0.045 : 0.045), y: 0.35, z: wz, ry: wx < 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  g.add(new THREE.Mesh(mergeColored(darkParts), coloredLambert));
  const lampParts = [];
  for (const sx of [-1, 1]) {
    lampParts.push({ geo: new THREE.BoxGeometry(0.34, 0.11, 0.06), color: 0xffe9b0, x: sx * Wd * 0.32, y: 0.62, z: L / 2 + 0.055 });
    lampParts.push({ geo: new THREE.BoxGeometry(0.36, 0.10, 0.06), color: 0xd92b3a, x: sx * Wd * 0.32, y: 0.66, z: -L / 2 - 0.055 });
  }
  g.add(new THREE.Mesh(mergeColored(lampParts), coloredBasic));
  if (model === 'Patrol Unit') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.13, 0.38),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }));
    bar.position.set(0, 1.47, -L * 0.03);
    g.add(bar);
    g.userData.lightBar = bar;
  }
  g.userData.wheels = []; // wheels are merged into the dark assembly now
  return g;
}

function makeCarRecord(scene, model, x, z, heading, traffic, colorOverride) {
  const group = buildCarMesh(model, colorOverride);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  const rec = {
    model, group, x, z, heading,
    len: MODELS[model].len, wid: MODELS[model].wid,
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
  // solid against other cars: the driven car is resolved out of every
  // other car's box (its own bulk counts as 0.45 of its length), so it
  // crumples to a stop instead of ghosting through parked or moving cars
  const hitCar = pushOutCars(probe, spec.len * 0.45, car);
  if (hitCar || Math.abs(probe.x - car.x) > 0.01 || Math.abs(probe.z - car.z) > 0.01) {
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
