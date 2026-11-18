// PURNAMA BAY - the five vehicles of the bay and the arcade driving model.
// Parked cars sit empty and can be taken; traffic cars carry a driver and
// never offer the ENTER prompt. One physics step drives the player's car.
import * as THREE from 'three';
import { S, CFG, dist2d, pushOut, pushOutCars, clamp } from './config.js';
import { sfx } from './audio.js';
import { mergeColored, coloredStandard } from './merge.js';
import { WX, lightState, TL_AXES } from './world.js';

const coloredStd = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 });

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
  // side profile: nose low and sloped (the HOOD), windscreen rising to a
  // flat roof, short sloped tail (the TRUNK). The pickup gets a forward
  // cab and an open bed.
  const bodyPts = pickup
    ? [[-L / 2, 0.30], [L / 2, 0.30], [L / 2, 0.78], [L * 0.34, 0.86], [L * 0.26, 1.42], [L * 0.02, 1.46], [-L * 0.06, 0.92], [-L / 2, 0.90]]
    : [[-L / 2, 0.30], [L / 2, 0.30], [L / 2, 0.68], [L * 0.30, 0.82], [L * 0.10, 1.30], [-L * 0.16, 1.34], [-L * 0.30, 0.86], [-L / 2, 0.82]];
  const roofLen = pickup ? L * 0.17 : L * 0.26;
  const roofZ = pickup ? L * 0.10 : -L * 0.025;
  const roofY = pickup ? 1.475 : 1.365;
  // PAINT assembly (one merged mesh): body profile, roof panel, the
  // A/B/C cabin pillars, mirror stalks and the hood/trunk shut-lines.
  const paintParts = [
    { geo: profileGeometry(bodyPts, Wd), color: paintColor },
    { geo: new THREE.BoxGeometry(Wd * 0.8, 0.055, roofLen), color: paintColor, y: roofY, z: roofZ },
  ];
  const pillar = (z, y, h, rx) => {
    for (const sx of [-1, 1]) paintParts.push({ geo: new THREE.BoxGeometry(0.07, h, 0.09), color: paintColor, x: sx * Wd * 0.40, y, z, rx });
  };
  if (!pickup) {
    pillar(L * 0.115, 1.13, 0.52, -0.5);   // A pillars, raked with the windscreen
    pillar(-L * 0.01, 1.16, 0.5, 0);       // B pillars, upright
    pillar(-L * 0.155, 1.13, 0.5, 0.45);   // C pillars, raked with the rear screen
  } else {
    pillar(L * 0.115, 1.16, 0.55, -0.45);
    pillar(-L * 0.03, 1.18, 0.55, 0.1);
  }
  for (const sx of [-1, 1]) { // mirror stalks in paint, heads in dark trim
    paintParts.push({ geo: new THREE.BoxGeometry(0.16, 0.04, 0.05), color: paintColor, x: sx * (Wd / 2 + 0.07), y: 1.12, z: L * 0.16 });
  }
  const paintMesh = new THREE.Mesh(mergeColored(paintParts),
    new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.1 }));
  paintMesh.castShadow = true;
  paintMesh.name = 'car-paint';
  g.add(paintMesh);
  // GLASS assembly (its own glossy material, separate from paint):
  // windscreen, rear screen and both side windows as distinct panes
  // sitting between the pillars.
  const glassParts = [];
  const GLASS = 0x2a4a6a;
  const wsZ = pickup ? L * 0.155 : L * 0.185; const wsRx = pickup ? -0.62 : -0.72;
  glassParts.push({ geo: new THREE.PlaneGeometry(Wd * 0.74, 0.52), color: GLASS, y: 1.13, z: wsZ, rx: wsRx }); // windscreen
  glassParts.push({ geo: new THREE.PlaneGeometry(Wd * 0.72, 0.46), color: GLASS, y: 1.13, z: pickup ? -L * 0.045 : -L * 0.20, rx: Math.PI - (pickup ? 0.35 : 0.62), ry: Math.PI }); // rear screen
  for (const sx of [-1, 1]) {
    glassParts.push({ geo: new THREE.PlaneGeometry(roofLen * 0.92, 0.4), color: GLASS, x: sx * (Wd * 0.415), y: 1.15, z: roofZ, ry: sx * Math.PI / 2 }); // side windows
  }
  const glassMesh = new THREE.Mesh(mergeColored(glassParts),
    new THREE.MeshPhysicalMaterial({ color: 0x10161f, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.4 }));
  glassMesh.name = 'car-glass';
  g.add(glassMesh);
  // DARK TRIM assembly: front/rear bumpers, wheel-arch discs, mirror
  // heads, door handles, pickup bed, patrol stripe.
  const DARK = 0x14181d;
  const darkParts = [
    { geo: new THREE.BoxGeometry(Wd * 0.96, 0.16, 0.14), color: DARK, y: 0.38, z: L / 2 + 0.03 },  // front bumper
    { geo: new THREE.BoxGeometry(Wd * 0.96, 0.16, 0.14), color: DARK, y: 0.38, z: -L / 2 - 0.03 }, // rear bumper
  ];
  if (pickup) darkParts.push({ geo: new THREE.BoxGeometry(Wd * 0.94, 0.34, L * 0.34), color: DARK, y: 0.78, z: -L * 0.30 });
  if (model === 'Patrol Unit') darkParts.push({ geo: new THREE.BoxGeometry(Wd + 0.03, 0.18, L * 0.62), color: DARK, y: 0.58 });
  for (const sx of [-1, 1]) {
    darkParts.push({ geo: new THREE.BoxGeometry(0.05, 0.11, 0.2), color: DARK, x: sx * (Wd / 2 + 0.15), y: 1.12, z: L * 0.16 }); // mirror head
    darkParts.push({ geo: new THREE.BoxGeometry(0.03, 0.045, 0.34), color: 0x2c343a, x: sx * (Wd / 2 + 0.045), y: 0.94, z: L * 0.02 });  // front door handle
    darkParts.push({ geo: new THREE.BoxGeometry(0.03, 0.045, 0.34), color: 0x2c343a, x: sx * (Wd / 2 + 0.045), y: 0.94, z: -L * 0.20 }); // rear door handle
  }
  // fender arch discs behind each wheel
  for (const [wx, wz] of [[-Wd / 2, L * 0.32], [Wd / 2, L * 0.32], [-Wd / 2, -L * 0.32], [Wd / 2, -L * 0.32]]) {
    darkParts.push({ geo: new THREE.CircleGeometry(0.47, 14, 0, Math.PI), color: DARK, x: wx + (wx < 0 ? -0.045 : 0.045), y: 0.35, z: wz, ry: wx < 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  const trimMesh = new THREE.Mesh(mergeColored(darkParts), coloredStandard);
  trimMesh.name = 'car-trim';
  g.add(trimMesh);
  // TYRES: near-black rubber, its own material - visibly distinct from
  // the lighter alloy HUBCAPS merged separately below.
  const tyreParts = []; const hubParts = [];
  for (const [wx, wz] of [[-Wd / 2, L * 0.32], [Wd / 2, L * 0.32], [-Wd / 2, -L * 0.32], [Wd / 2, -L * 0.32]]) {
    tyreParts.push({ geo: new THREE.CylinderGeometry(0.35, 0.35, 0.24, 14), color: 0x0c0d0f, x: wx, y: 0.35, z: wz, rz: Math.PI / 2 });
    hubParts.push({ geo: new THREE.CylinderGeometry(0.17, 0.17, 0.26, 10), color: 0xb9c2c9, x: wx, y: 0.35, z: wz, rz: Math.PI / 2 });
  }
  const tyreMesh = new THREE.Mesh(mergeColored(tyreParts), coloredStandard);
  tyreMesh.name = 'car-tyres';
  g.add(tyreMesh);
  const hubMesh = new THREE.Mesh(mergeColored(hubParts), coloredStandard);
  hubMesh.name = 'car-hubs';
  g.add(hubMesh);
  // LAMPS: pale headlights at the nose, red tail lights at the tail.
  const lampParts = [];
  for (const sx of [-1, 1]) {
    lampParts.push({ geo: new THREE.BoxGeometry(0.34, 0.11, 0.06), color: 0xffe9b0, x: sx * Wd * 0.32, y: 0.62, z: L / 2 + 0.055 });
    lampParts.push({ geo: new THREE.BoxGeometry(0.36, 0.10, 0.06), color: 0xd92b3a, x: sx * Wd * 0.32, y: 0.66, z: -L / 2 - 0.055 });
  }
  const lampMesh = new THREE.Mesh(mergeColored(lampParts), coloredStd);
  lampMesh.name = 'car-lamps';
  g.add(lampMesh);
  if (model === 'Patrol Unit') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.13, 0.38),
      new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xff2222, emissiveIntensity: 0.9, roughness: 0.4 }));
    bar.position.set(0, 1.47, -L * 0.03);
    g.add(bar);
    g.userData.lightBar = bar;
  }
  g.userData.wheels = []; // wheels are merged into the tyre/hub assemblies
  g.userData.structure = ['paint', 'glass', 'trim', 'tyres', 'hubs', 'lamps'];
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
    hardHits: 0, exploded: false, fx: null, lastCrashAt: -10,
    axis: Math.random() < 0.5 ? 'x' : 'z',
    line: 0, dir: 1, cruise: CFG.trafficCruiseBase + Math.random() * CFG.trafficCruiseVar,
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
  // parked, empty, takeable - the first one waits by the mission pickup
  // point, on the SHOULDER at x=6.5 (round 11, P1-11): the traffic lanes
  // run at x=+-3, and parking in one meant traffic ghosted through the
  // job-1 car and shoved it sideways when Raka first pulled away
  makeCarRecord(scene, 'Baruna 4D', 6.5, 70, Math.PI / 2, false);
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
  const preX = probe.x; const preZ = probe.z;
  // round 11 (P1-11): the building-collision radius follows the model's
  // own half-length, not one fixed 1.5 m circle - a 4.8 m pickup's nose
  // no longer sinks into walls, and a short city car is not held 1 m off
  pushOut(probe, spec.len / 2);
  const hitWall = Math.abs(probe.x - preX) > 0.01 || Math.abs(probe.z - preZ) > 0.01;
  // solid against other cars: the driven car is resolved out of every
  // other car's box (its own bulk counts as 0.45 of its length), so it
  // crumples to a stop instead of ghosting through parked or moving cars
  const hitCar = pushOutCars(probe, spec.len * 0.45, car);
  if (hitCar || hitWall) {
    car.x = probe.x; car.z = probe.z;
    const impact = Math.abs(car.speed);
    // one impact = one crash event (impacts in the same 0.35 s are the
    // same crunch, not several): light scrape vs hard hit sound differ,
    // and only HARD hits into solid scenery count toward the explosion
    if (impact > 2.2 && S.time - car.lastCrashAt > 0.35) {
      car.lastCrashAt = S.time;
      const hard = hitWall && impact >= CFG.hardHitSpeed;
      sfx.crash(hard);
      S.shakeKick = Math.max(S.shakeKick, hard ? 0.25 : 0.08); // P2-1 shake
      if (hard && !car.exploded) {
        car.hardHits++;
        if (car.hardHits >= CFG.hardHitsToExplode) explodeCar(car);
      }
    }
    // collision damage is deliberately gentler than the hard-hit
    // counter: ten hard hits must be reachable before the shell dies,
    // because the tenth is what blows the car up (see explodeCar)
    if (impact > 7) damageCar(car, (impact - 6) * 0.75);
    car.speed *= 0.35;
  }
  syncCarMesh(car);
}

// ------------------------------------------------------------------
// The tenth HARD hit: the car explodes. Fire/smoke particles, an orange
// point light, the explosion sound, a scorched-black shell that can no
// longer be driven. A driver inside is thrown clear with heavy but
// survivable damage - never an instant death.
export function explodeCar(car) {
  if (car.exploded) return;
  car.exploded = true;
  car.dead = true;
  car.health = 0;
  const wasDriving = S.currentCar === car && S.inCar;
  car.speed = 0;
  sfx.explosion();
  S.shakeKick = Math.max(S.shakeKick, 0.45); // P2-1: the blast kicks the camera
  // scorch: every painted/glass surface goes charcoal (materials are
  // cloned per car first so the fleet does not share the burn)
  car.group.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      if (o.material.color) o.material.color.setHex(0x17181a);
      if ('vertexColors' in o.material) o.material.vertexColors = false;
    }
  });
  // particle burst from the POOL (round 11, P1-10): a burst of fire and
  // smoke points plus one point light, reused across explosions instead
  // of allocating new geometry/materials/lights for every wreck
  car.fx = spawnExplosionFx(car.group.parent, car.x, car.z);
  if (wasDriving) {
    // thrown clear of the wreck, hurt but alive
    exitCar();
    S.p.x = car.x + 3.4; S.p.z = car.z + 2.2;
    pushOut(S.p, 0.55);
    S.health = Math.max(18, S.health - CFG.explosionPlayerDamage);
    S.lastHurtAt = S.time;
  }
}

const FX_POOL = [];
const FX_PARTICLES = 70;
function spawnExplosionFx(parent, x, z) {
  let fx = FX_POOL.find((f) => !f.active);
  if (!fx && FX_POOL.length < 4) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(FX_PARTICLES * 3), 3));
    const mat = new THREE.PointsMaterial({ color: 0xff7a26, size: 0.55, transparent: true, opacity: 1 });
    const points = new THREE.Points(geo, mat);
    points.name = 'explosion-fx';
    const light = new THREE.PointLight(0xff7a26, 60, 17, 1.8);
    fx = { points, light, vel: [], t: 0, active: false };
    FX_POOL.push(fx);
  }
  if (!fx) fx = FX_POOL[0]; // pool exhausted: steal the oldest burst
  if (fx.points.parent !== parent && parent) { parent.add(fx.points); parent.add(fx.light); }
  const pos = fx.points.geometry.attributes.position;
  fx.vel.length = 0;
  for (let i = 0; i < FX_PARTICLES; i++) {
    pos.array[i * 3] = x; pos.array[i * 3 + 1] = 0.8; pos.array[i * 3 + 2] = z;
    const a = Math.random() * Math.PI * 2;
    fx.vel.push([Math.sin(a) * (1 + Math.random() * 2.4), 2.4 + Math.random() * 3.6, Math.cos(a) * (1 + Math.random() * 2.4)]);
  }
  pos.needsUpdate = true;
  fx.points.material.color.setHex(0xff7a26);
  fx.points.material.opacity = 1;
  fx.points.visible = true;
  fx.light.position.set(x, 1.6, z);
  fx.light.intensity = 60;
  fx.t = 0;
  fx.active = true;
  return fx;
}

// Animate live explosion effects (called from the main loop).
export function updateVehicleFx(dt) {
  for (const car of S.cars) {
    const fx = car.fx;
    if (!fx || !fx.active) continue;
    fx.t += dt;
    const pos = fx.points.geometry.attributes.position;
    for (let i = 0; i < fx.vel.length; i++) {
      pos.array[i * 3] += fx.vel[i][0] * dt;
      pos.array[i * 3 + 1] += fx.vel[i][1] * dt;
      pos.array[i * 3 + 2] += fx.vel[i][2] * dt;
      fx.vel[i][1] -= 1.6 * dt; // fire rises then settles into smoke
    }
    pos.needsUpdate = true;
    fx.points.material.color.setHex(fx.t < 0.7 ? 0xff7a26 : 0x555049); // flame -> smoke
    fx.points.material.opacity = Math.max(0, 1 - fx.t / 2.6);
    fx.light.intensity = Math.max(0, 60 * (1 - fx.t / 1.4));
    if (fx.t > 2.6) { fx.active = false; fx.points.visible = false; fx.light.intensity = 0; }
  }
}

// Read-only car census for probes: structure, damage and explosion state.
export function carInfo(car) {
  if (!car) return null;
  const names = [];
  car.group.traverse((o) => { if (o.isMesh && o.name) names.push(o.name); });
  return {
    model: car.model, health: Math.round(car.health), dead: car.dead,
    hardHits: car.hardHits, exploded: car.exploded,
    fxActive: !!(car.fx && car.fx.active),
    fxLight: car.fx ? Math.round(car.fx.light.intensity) : 0,
    structure: names,
  };
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
  const ls = lightState();
  for (const c of S.cars) {
    if (!c.traffic || c.dead) continue;
    // slow for the player's car ahead, otherwise cruise the avenue
    // (rain trims every traffic car's pace by up to 35%)
    let speed = c.cruise * (1 - 0.35 * WX.rain);
    if (S.currentCar) {
      const ahead = c.axis === 'x'
        ? (S.currentCar.z - c.z) * 0 + (Math.abs(S.currentCar.z - c.line) < 4 ? (S.currentCar.x - c.x) * c.dir : -1)
        : (Math.abs(S.currentCar.x - c.line) < 4 ? (S.currentCar.z - c.z) * c.dir : -1);
      if (ahead > 0 && ahead < 9) speed = Math.min(speed, Math.max(0, Math.abs(S.currentCar.speed)));
    }
    // queue behind another traffic car on the same avenue and lane:
    // match its pace, and never close the last few metres into it
    for (const o of S.cars) {
      if (o === c || !o.traffic || o.dead || o.axis !== c.axis) continue;
      if (Math.abs(o.line - c.line) > 2) continue;
      const gap = ((c.axis === 'x' ? o.x - c.x : o.z - c.z) * c.dir) - (c.len + o.len) / 2;
      if (gap > -1 && gap < 7) speed = Math.min(speed, gap < 3 ? 0 : Math.abs(o.speed));
    }
    // W3: stop at the line (8.6 m before the centre) when this car's
    // axis is red or yellow at a main intersection ahead
    const axisState = c.axis === 'x' ? ls.xState : ls.zState;
    if (axisState !== 'green' && TL_AXES.some((a) => Math.abs(c.line - a) < 6.5)) {
      const pos = c.axis === 'x' ? c.x : c.z;
      for (const ic of TL_AXES) {
        const d = (ic - c.dir * 8.6 - pos) * c.dir; // metres to the stop line
        if (d > -0.5 && d < 16) speed = Math.min(speed, Math.max(0, (d - 1.2) * 0.9));
      }
    }
    c.speed = speed * c.dir;
    // round 11 (P1-14): the job-5 tail target NEVER wraps - teleporting
    // from one map edge to the other would break the tail through no
    // fault of the player's. It turns around at the edge instead, so
    // its loop stays one continuous, followable route while targeted.
    if (c.axis === 'x') {
      c.x += c.speed * dt;
      c.z = c.line;
      c.heading = c.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      if (c.x > CFG.worldHalf - 4) { if (c.isTarget) { c.x = CFG.worldHalf - 4; c.dir = -1; } else c.x = -CFG.worldHalf + 4; }
      if (c.x < -CFG.worldHalf + 4) { if (c.isTarget) { c.x = -CFG.worldHalf + 4; c.dir = 1; } else c.x = CFG.worldHalf - 4; }
    } else {
      c.z += c.speed * dt;
      c.x = c.line;
      c.heading = c.dir > 0 ? 0 : Math.PI;
      if (c.z > CFG.worldHalf - 4) { if (c.isTarget) { c.z = CFG.worldHalf - 4; c.dir = -1; } else c.z = -CFG.worldHalf + 4; }
      if (c.z < -CFG.worldHalf + 4) { if (c.isTarget) { c.z = -CFG.worldHalf + 4; c.dir = 1; } else c.z = CFG.worldHalf - 4; }
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
