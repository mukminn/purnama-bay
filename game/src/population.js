// PURNAMA BAY - the living population: citizens on errands, shopkeepers at
// their doors, dockworkers on the pier, children at play, syndicate thugs,
// and the bay's dogs and cats. Counts are the game's census targets.
import * as THREE from 'three';
import { S, CFG, dist2d, pushOut, pushOutCars, clamp } from './config.js';
import { makePerson, makePersonRecord, makeAnimal, animatePerson, animateAnimal, attachProp, makeWeaponProp, createBar } from './characters.js';
import { PLACES, ROAD_LINES, SIDEWALK_OFFSET, isRoad, isSidewalk, inPark, PARK, groundYAt, WX } from './world.js';
import { reportCrime } from './wanted.js';
import { sfx } from './audio.js';

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

// ------------------------------------------------------------------
// The pedestrian network. People live on the sidewalks: a wander target
// is a point on a pavement strip, in the park, or at a pedestrian post,
// and the route to it follows the strips - along one strip to the
// corner, then along the crossing strip - so a walker only ever leaves
// the pavement at an intersection corner (where the zebras are).
function randomSidewalkPoint() {
  const r = ROAD_LINES[Math.floor(Math.random() * ROAD_LINES.length)];
  const s = Math.random() < 0.5 ? -SIDEWALK_OFFSET : SIDEWALK_OFFSET;
  const t = -138 + Math.random() * 276;
  return Math.random() < 0.5 ? [r + s, t] : [t, r + s];
}
function randomParkPoint() {
  return [PARK.x + (Math.random() * 2 - 1) * (PARK.halfW - 2), PARK.z + (Math.random() * 2 - 1) * (PARK.halfD - 2)];
}
// Which strip lines (if any) a point sits on: {v: x} for a vertical
// strip (constant x), {h: z} for a horizontal strip (constant z).
function stripLines(x, z) {
  let v = null; let h = null;
  for (const r of ROAD_LINES) {
    if (Math.abs(Math.abs(x - r) - SIDEWALK_OFFSET) < 1.1) v = x;
    if (Math.abs(Math.abs(z - r) - SIDEWALK_OFFSET) < 1.1) h = z;
  }
  return { v, h };
}
function nearestStripPoint(x, z) {
  let best = [x, z]; let bd = Infinity;
  for (const r of ROAD_LINES) {
    for (const s of [-SIDEWALK_OFFSET, SIDEWALK_OFFSET]) {
      const d1 = Math.abs(x - (r + s)); if (d1 < bd) { bd = d1; best = [r + s, z]; }
      const d2 = Math.abs(z - (r + s)); if (d2 < bd) { bd = d2; best = [x, r + s]; }
    }
  }
  return best;
}
// The park gate: the pavement corner south-east of Purnama Green,
// where the -80 avenue's east strip meets the 80 avenue's north strip.
const PARK_GATE = [ROAD_LINES[1] - SIDEWALK_OFFSET, ROAD_LINES[5] + SIDEWALK_OFFSET];

// Build a waypoint route from (x, z) to a target that keeps the walker
// on the pavement network the whole way. Park targets route via the
// gate corner; everything else is pure strip routing (routeStrips).
function routeTo(x, z, tx, tz) {
  if (inPark(tx, tz) && !inPark(x, z)) {
    const pts = routeStrips(x, z, PARK_GATE[0], PARK_GATE[1]);
    pts.push([tx, tz]);
    return pts;
  }
  if (inPark(x, z) && !inPark(tx, tz)) {
    const pts = [[PARK_GATE[0], PARK_GATE[1]]];
    pts.push(...routeStrips(PARK_GATE[0], PARK_GATE[1], tx, tz));
    return pts;
  }
  if (inPark(x, z) && inPark(tx, tz)) return [[tx, tz]];
  return routeStrips(x, z, tx, tz);
}

function routeStrips(x, z, tx, tz) {
  const pts = [];
  let cx = x; let cz = z;
  let cur = stripLines(cx, cz);
  if (cur.v === null && cur.h === null) {
    const sp = nearestStripPoint(cx, cz);
    pts.push(sp); cx = sp[0]; cz = sp[1]; cur = stripLines(cx, cz);
  }
  const tgt = stripLines(tx, tz);
  if (tgt.v !== null && cur.v !== null && Math.abs(tgt.v - cur.v) < 0.6) { pts.push([tx, tz]); return pts; }
  if (tgt.h !== null && cur.h !== null && Math.abs(tgt.h - cur.h) < 0.6) { pts.push([tx, tz]); return pts; }
  // change strips at a corner: ride the current strip to the target's
  // crossing strip, turn, then ride that strip to the target
  if (cur.v !== null && tgt.h !== null) { pts.push([cur.v, tgt.h]); pts.push([tx, tz]); return pts; }
  if (cur.h !== null && tgt.v !== null) { pts.push([tgt.v, cur.h]); pts.push([tx, tz]); return pts; }
  if (cur.v !== null && tgt.v !== null) {
    const hz = nearestStripLineZ(tz);
    pts.push([cur.v, hz]); pts.push([tgt.v, hz]); pts.push([tx, tz]); return pts;
  }
  if (cur.h !== null && tgt.h !== null) {
    const vx = nearestStripLineX(tx);
    pts.push([vx, cur.h]); pts.push([vx, tgt.h]); pts.push([tx, tz]); return pts;
  }
  pts.push([tx, tz]);
  return pts;
}
function nearestStripLineZ(z) {
  let best = 0; let bd = Infinity;
  for (const r of ROAD_LINES) for (const s of [-SIDEWALK_OFFSET, SIDEWALK_OFFSET]) {
    const d = Math.abs(z - (r + s)); if (d < bd) { bd = d; best = r + s; }
  }
  return best;
}
function nearestStripLineX(x) { return nearestStripLineZ(x); }

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
  void hideCorner;
  // citizens and children start ON the pavement network / in the park;
  // citizens cycle through the four body builds by index
  const BUILD_CYCLE = ['slim', 'average', 'tall', 'broad'];
  for (let i = 0; i < CENSUS.citizen; i++) {
    const [x, z] = i % 4 === 3 ? randomParkPoint() : randomSidewalkPoint();
    addPerson(scene, 'citizen', x, z, { build: BUILD_CYCLE[i % 4] });
  }
  const shopSpots = [
    [CFG.shopDoor.x - 3, CFG.shopDoor.z - 2], [PLACES.cafe.x + 3, PLACES.cafe.z - 2],
    [PLACES.garage.x + 4, PLACES.garage.z - 2], [-72, -24],
    [-10, 72],
  ];
  shopSpots.forEach(([x, z], i) => {
    const rec = addPerson(scene, 'shopkeeper', x, z, { cap: 0x31435c, build: i % 2 ? 'broad' : 'average' });
    rec.state = 'stand'; rec.homeX = x; rec.homeZ = z;
  });
  // dockworkers pace the pier apron, clear of every carriageway band
  const dockXs = [-30, -23, -16, -9, 9, 16];
  for (let i = 0; i < CENSUS.dockworker; i++) {
    const x = dockXs[i % dockXs.length];
    const z = 96 + (i % 3) * 5;
    const rec = addPerson(scene, 'dockworker', x, z, { shirt: 0xd96f32, cap: 0xf5e9b8, build: i % 2 ? 'average' : 'broad' });
    rec.homeX = x; rec.homeZ = z;
  }
  for (let i = 0; i < CENSUS.child; i++) {
    const [x, z] = i % 2 === 0 ? randomParkPoint() : randomSidewalkPoint();
    addPerson(scene, 'child', x, z, { scale: i % 2 ? 0.66 : 0.58, skirt: i % 2 === 0 });
  }
  // syndicate thugs loiter ON pavements near the warehouse and the
  // docks; each carries the weapon listed for his index
  const thugSpots = [[87.35, -52], [87.35, -74], [-24, 87.35], [72.65, -52], [-30, 100]];
  const thugWeapons = ['pistol', 'baton', 'pistol', 'knife', null];
  thugSpots.forEach(([x, z], i) => {
    const rec = addPerson(scene, 'thug', x, z, { shirt: 0x23272c, pants: 0x17191c, cap: 0x101214, build: i % 2 ? 'tall' : 'broad' });
    rec.weapon = thugWeapons[i];
    rec.armed = !!rec.weapon;
    rec.homeX = x; rec.homeZ = z;
    if (rec.weapon) attachProp(rec, makeWeaponProp(rec.weapon));
  });
  for (let i = 0; i < CENSUS.animal; i++) {
    const [x, z] = scatter(WANDER_HALF, hideCorner);
    const rec = makeAnimal(x, z);
    scene.add(rec.group);
    S.npcs.push(rec);
  }
  // Mira Santoso, the mission contact, waits by the spawn plaza
  const mira = addPerson(scene, 'contact', CFG.miraSpot.x, CFG.miraSpot.z, { shirt: 0x0f7d8c, skirt: true, build: 'average' });
  mira.state = 'stand'; mira.homeX = CFG.miraSpot.x; mira.homeZ = CFG.miraSpot.z; mira.isMira = true;
  designateSocial(scene);
  return mira;
}

// W5 - idle social life, designated once from ordinary citizens:
// three phone users stand on pavements near the shops with a little
// emissive-screened phone in the right hand (armPose 'phone' drives
// the pose in animatePerson), and two pairs of citizens stand facing
// each other in 'social' state, chatting with small gestures for
// 10-22 s before wandering off again.
function designateSocial(scene) {
  void scene;
  const citizens = S.npcs.filter((n) => n.kind === 'citizen');
  const phoneSpots = [[27.35, 24], [32.65, 36], [-7.35, 64]];
  citizens.slice(0, 3).forEach((rec, i) => {
    const [x, z] = phoneSpots[i];
    rec.x = x; rec.z = z; rec.homeX = x; rec.homeZ = z;
    rec.state = 'stand';
    rec.armPose = 'phone';
    rec.group.position.set(x, 0, z);
    const phone = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.10),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.4, metalness: 0.4 }));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.075, 0.125),
      new THREE.MeshStandardMaterial({ color: 0x0a141c, emissive: 0x9fd4ff, emissiveIntensity: 1.1, roughness: 0.3 }));
    screen.position.set(0, 0, 0.026);
    phone.add(body, screen);
    attachProp(rec, phone);
  });
  const pairSpots = [
    [[PARK.x - 3, PARK.z - 3], [PARK.x - 1.8, PARK.z - 3]],
    [[47.35, -20], [47.35, -18.8]],
  ];
  const pairRecs = citizens.slice(3, 7);
  pairSpots.forEach(([a, b], pi) => {
    const r1 = pairRecs[pi * 2]; const r2 = pairRecs[pi * 2 + 1];
    if (!r1 || !r2) return;
    r1.x = a[0]; r1.z = a[1]; r2.x = b[0]; r2.z = b[1];
    r1.heading = Math.atan2(b[0] - a[0], b[1] - a[1]);
    r2.heading = Math.atan2(a[0] - b[0], a[1] - b[1]);
    for (const r of [r1, r2]) {
      r.state = 'social';
      r.socialT = 10 + Math.random() * 12;
      r.animSpeed = 0;
      r.group.position.set(r.x, 0, r.z);
    }
    r1.socialPartner = r2; r2.socialPartner = r1;
  });
}

// Kill an adult outright (a car impact at speed). The state is 'dead'
// and it is PERMANENT: no downT, no getting back up - the body stays.
// Children can never reach this function (see checkCarHits).
export function killNPC(rec) {
  if (!rec || rec.kind === 'child' || rec.kind === 'animal') return false;
  rec.state = 'dead';
  rec.health = 0;
  rec.animSpeed = 0;
  return true;
}

// Damage entry point for every person in the bay. The child law is enforced
// here first: a child record has no health and this function refuses it.
export function damageNPC(rec, dmg) {
  if (!rec || rec.kind === 'child') return 'immune';
  if (rec.state === 'down' || rec.state === 'dead') return 'down';
  if (rec.kind === 'animal') { rec.state = 'flee'; rec.fleeT = 3; return 'fled'; }
  rec.health -= dmg;
  if (rec.health <= 0) {
    rec.state = 'down';
    rec.downT = 9;
    rec.animSpeed = 0;
    return 'down';
  }
  // every surviving adult human fights back now, whatever their job
  if (rec.state === 'stand' && rec.homeState === undefined) rec.homeState = 'stand';
  rec.state = 'hostile';
  rec.hostileT = 14;
  rec.barT = 5;
  rec.fightPose = true;
  return 'hurt';
}

// Scare everyone near a point (a swing, a shot, a crash).
export function scareArea(x, z, radius) {
  for (const n of S.npcs) {
    if (n.state === 'down' || n.state === 'dead' || n.kind === 'thug') continue;
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

// ------------------------------------------------------------------
// Cars vs people. A car moving at speed checks its own footprint
// against every person each tick:
//  - an ADULT inside the footprint is killed outright (killNPC) - with
//    the crash sound, a scare ripple, and, when it is the player's car,
//    a crime report through the normal witnessed wanted pipeline;
//  - a CHILD is never touched: the child darts sideways out of the
//    car's path, whole and unharmed, and keeps no health to lose;
//  - animals scatter.
function checkCarHits(n) {
  for (const c of S.cars) {
    if (c.dead) continue;
    const spd = Math.abs(c.speed);
    if (spd < 2.4) continue;
    const dx = n.x - c.x; const dz = n.z - c.z;
    if (dx * dx + dz * dz > 16) continue;
    const fx = Math.sin(c.heading); const fz = Math.cos(c.heading);
    const rx = Math.cos(c.heading); const rz = -Math.sin(c.heading);
    const lf = dx * fx + dz * fz;
    const lr = dx * rx + dz * rz;
    if (Math.abs(lf) > (c.len || 4.4) / 2 + 0.25 || Math.abs(lr) > (c.wid || 1.85) / 2 + 0.3) continue;
    if (n.kind === 'child') {
      // dart aside, perpendicular to the car's travel, whole and safe
      const side = lr >= 0 ? 1 : -1;
      n.x += rx * side * 1.6; n.z += rz * side * 1.6;
      n.state = 'flee'; n.fleeT = 2.2; n.fleeX = c.x; n.fleeZ = c.z;
      n.waypoints = [];
      return;
    }
    if (n.kind === 'animal') { n.state = 'flee'; n.fleeT = 3; n.fleeX = c.x; n.fleeZ = c.z; return; }
    if (killNPC(n)) {
      sfx.crash(spd >= CFG.hardHitSpeed);
      scareArea(n.x, n.z, 9);
      if (S.currentCar === c && S.inCar) reportCrime(n.x, n.z, n);
    }
    return;
  }
}

export function updatePopulation(dt) {
  const p = S.p;
  for (const n of S.npcs) {
    if (n.state === 'dead') { syncMesh(n); continue; } // a body stays a body
    if (n.state === 'down') {
      n.downT -= dt;
      if (n.downT <= 0 && n.kind !== 'child') {
        n.state = 'wander';
        if ('health' in n) n.health = 100;
      }
      syncMesh(n); continue;
    }
    if (n.kind !== 'animal') checkCarHits(n);
    if (n.state === 'dead') { syncMesh(n); continue; }
    if (n.swingT > 0) n.swingT -= dt;
    // HP bar + fight pose for every adult human, refreshed each frame
    // before animatePerson runs below
    if (n.kind !== 'animal' && n.kind !== 'child') {
      if (n.barT > 0) {
        n.barT -= dt;
        if (!n.bar) n.bar = createBar(n.group);
        n.bar.set(n.health / 100, true);
      } else if (n.bar) {
        n.bar.set(n.health / 100, false);
      }
      n.fightPose = (n.state === 'hostile' || n.state === 'attack');
    }
    if (n.closeT && n.state !== 'hostile' && n.state !== 'attack') n.closeT = 0; // pinned-at-close-range timer only lives in a fight
    if (n.armPose && n.state !== 'stand') n.armPose = null; // W5: pose drops when life interrupts
    if (n.state === 'stand') {
      n.animSpeed = 0;
      // shopkeepers and Mira idle at home, turning slowly to watch the street
      n.heading += Math.sin(S.time * 0.4 + n.animPhase) * 0.1 * dt;
      syncMesh(n);
      animatePerson(n, dt); // idle breathing + the W5 phone pose
      continue;
    }
    if (n.state === 'social') {
      // W5: chat with the partner, face to face, then wander off
      n.animSpeed = 0;
      n.socialT -= dt;
      const partner = n.socialPartner;
      if (partner && partner.state === 'social') {
        n.heading = Math.atan2(partner.x - n.x, partner.z - n.z);
      }
      if (n.socialT <= 0 || !partner || partner.state !== 'social') {
        n.state = 'wander';
        n.socialPartner = null;
        n.retargetT = 0.5;
      }
      syncMesh(n);
      animatePerson(n, dt);
      continue;
    }
    if (n.state === 'flee') {
      n.fleeT -= dt;
      const fx = n.fleeX !== undefined ? n.fleeX : p.x;
      const fz = n.fleeZ !== undefined ? n.fleeZ : p.z;
      const away = Math.atan2(n.x - fx, n.z - fz);
      steer(n, n.x + Math.sin(away) * 12, n.z + Math.cos(away) * 12, n.kind === 'child' ? 3.4 : 4.4, dt);
      if (n.fleeT <= 0) n.state = 'wander';
    } else if (n.state === 'hostile' || n.state === 'attack') {
      // fighters close on the player and strike; they give up after hostileT
      n.hostileT -= dt;
      const d = dist2d(n.x, n.z, p.x, p.z);
      if (n.hostileT <= 0 || S.inCar) {
        n.aimPose = false;
        if (n.homeX !== undefined && n.homeState === 'stand') n.state = 'return';
        else n.state = 'wander';
      } else if (n.weapon === 'pistol' && !S.inCar) {
        // pistol fighters keep their distance and shoot from mid-range
        if (d > 10) { n.state = 'hostile'; n.aimPose = false; n.closeT = 0; steer(n, p.x, p.z, 4.6, dt); }
        else if (d < 4.5) {
          n.closeT = (n.closeT || 0) + dt;
          if (n.closeT > 1.2) {
            // pinned against a wall at close range too long: stop
            // retreating and shoot from here, like the stand-and-shoot band
            n.state = 'hostile'; n.animSpeed = 0;
            n.heading = Math.atan2(p.x - n.x, p.z - n.z);
            n.aimPose = true;
            n.shotCd = (n.shotCd || 1.2) - dt;
            if (n.shotCd <= 0 && S.mode === 'playing') {
              n.shotCd = 1.7;
              n.closeT = 0;
              sfx.shot();
              n.swingT = 0.3;
              n.barT = 5;
              if (d <= 16) S.health -= CFG.bulletDamage;
              S.combat.fightT = CFG.fightModeTime;
            }
          } else {
            n.state = 'hostile'; n.aimPose = false;
            const ax = d > 0.01 ? (n.x - p.x) / d : 1; const az = d > 0.01 ? (n.z - p.z) / d : 0;
            steer(n, n.x + ax * 10, n.z + az * 10, 3.8, dt);
          }
        } else {
          n.state = 'hostile'; n.animSpeed = 0; n.closeT = 0;
          n.heading = Math.atan2(p.x - n.x, p.z - n.z);
          n.aimPose = true;
          n.shotCd = (n.shotCd || 1.2) - dt;
          if (n.shotCd <= 0 && S.mode === 'playing') {
            n.shotCd = 1.7;
            sfx.shot();
            n.swingT = 0.3;
            n.barT = 5;
            if (d <= 16) S.health -= CFG.bulletDamage;
            S.combat.fightT = CFG.fightModeTime;
          }
        }
      } else if (d > 1.7) { n.state = 'hostile'; n.aimPose = false; steer(n, p.x, p.z, 4.6, dt); }
      else {
        n.state = 'attack'; n.animSpeed = 0; n.aimPose = false;
        n.heading = Math.atan2(p.x - n.x, p.z - n.z);
        n.hitCd = (n.hitCd || 0) - dt;
        if (n.hitCd <= 0 && !S.inCar && S.mode === 'playing') {
          n.hitCd = 1.1;
          S.health -= n.weapon === 'baton' ? CFG.batonDamage : (n.weapon === 'knife' ? CFG.knifeDamage : CFG.punchDamage);
          S.combat.fightT = CFG.fightModeTime;
          n.swingT = 0.35;
          n.swingKind = 'punch';
          n.barT = 5;
        }
      }
    } else if (n.state === 'return') {
      // walk back to the post they were dragged away from, then resume it
      n.aimPose = false;
      if (n.homeX === undefined) { n.state = 'wander'; }
      else if (steer(n, n.homeX, n.homeZ, 3.2, dt)) { n.state = n.homeState || 'wander'; }
    } else { // wander - along the pavement network, waypoint by waypoint
      n.retargetT -= dt;
      if (n.kind === 'animal') {
        const arrived = steer(n, n.tx, n.tz, 1.7, dt);
        if (arrived || n.retargetT <= 0) {
          n.retargetT = 4 + Math.random() * 6;
          const [x, z] = scatter(60, null);
          n.tx = clamp(n.x + clamp(x, -40, 40), -WANDER_HALF, WANDER_HALF);
          n.tz = clamp(n.z + clamp(z, -40, 40), -WANDER_HALF, WANDER_HALF + 14);
        }
      } else {
        if (!n.waypoints) n.waypoints = [];
        if (!n.waypoints.length && n.retargetT <= 0) {
          n.retargetT = 6 + Math.random() * 8;
          let tx; let tz;
          if (n.homeX !== undefined && n.kind === 'dockworker') {
            tx = n.homeX + (Math.random() * 6 - 3); tz = n.homeZ + (Math.random() * 6 - 3);
            if (isRoad(tx, tz)) { tx = n.homeX; tz = n.homeZ; }
            n.waypoints = [[tx, tz]];
          } else if (n.homeX !== undefined && Math.random() < 0.45) {
            // home-based kinds stroll to a pavement point near home
            const hx = n.homeX + (Math.random() * 10 - 5); const hz = n.homeZ + (Math.random() * 10 - 5);
            const sp = nearestStripPoint(hx, hz);
            n.waypoints = routeTo(n.x, n.z, sp[0], sp[1]);
          } else if (Math.random() < 0.22) {
            const [px2, pz2] = randomParkPoint();
            n.waypoints = routeTo(n.x, n.z, px2, pz2);
          } else {
            const [sx, sz] = randomSidewalkPoint();
            n.waypoints = routeTo(n.x, n.z, sx, sz);
          }
          const last = n.waypoints[n.waypoints.length - 1];
          if (last) { n.tx = last[0]; n.tz = last[1]; }
        }
        const wp = n.waypoints[0];
        if (wp) {
          // rain makes every pedestrian hurry (up to +60%)
          const arrived = steer(n, wp[0], wp[1], (n.kind === 'child' ? 2.4 : 1.35) * (1 + 0.6 * WX.rain), dt);
          if (arrived) n.waypoints.shift();
        } else {
          n.animSpeed = 0;
          if (n.retargetT > 2.5) n.retargetT = 2.5; // brief pause, then stroll on
        }
      }
    }
    const probe = { x: n.x, z: n.z };
    pushOut(probe, 0.55);
    pushOutCars(probe, 0.35); // pedestrians never clip through cars either
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
  if (n.state === 'down' || n.state === 'dead') {
    // fallen: flat on the ground, and a dead body never gets up again
    n.group.rotation.x = -Math.PI / 2;
    n.group.position.y = 0.25;
  } else {
    n.group.rotation.x = 0;
    // feet follow the pavement: 0.12 on a sidewalk, 0 elsewhere
    n.group.position.y = n.kind === 'animal' ? 0 : groundYAt(n.x, n.z);
  }
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
    deadCount: S.npcs.filter((n) => n.state === 'dead').length,
    socialPhone: S.npcs.filter((n) => n.armPose === 'phone').length,
    socialChat: S.npcs.filter((n) => n.state === 'social').length,
  };
}

// Position census for the pedestrian-network probe: every human's
// position, kind, state and whether they are on a carriageway.
export function pedPositions() {
  return S.npcs.filter((n) => n.kind !== 'animal').map((n) => ({
    kind: n.kind, x: Math.round(n.x * 10) / 10, z: Math.round(n.z * 10) / 10,
    state: n.state, onRoad: isRoad(n.x, n.z), onSidewalk: isSidewalk(n.x, n.z),
    inPark: inPark(n.x, n.z), animSpeed: Math.round(n.animSpeed * 100) / 100,
    hasHealth: 'health' in n,
  }));
}

// Adults who could plausibly witness something at a point (probe + wanted).
export function adultsNear(x, z, radius) {
  return S.npcs.filter((n) => n.kind !== 'child' && n.kind !== 'animal'
    && n.state !== 'down' && n.state !== 'dead' && dist2d(x, z, n.x, n.z) <= radius);
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
