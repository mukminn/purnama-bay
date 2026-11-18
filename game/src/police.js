// PURNAMA BAY - police response. Foot units spill out of the Patrol Units
// and run the player down on foot; their numbers scale with the wanted
// level. They hunt the player's real position but only "see" inside the
// wanted model's sight radius, and they stand down when the stars are gone.
import * as THREE from 'three';
import { S, CFG, dist2d, pushOut, clamp } from './config.js';
import { makePerson, animatePerson } from './characters.js';
import { W } from './wanted.js';

function spawnUnit(scene, x, z) {
  const group = makePerson({ shirt: 0x22355e, pants: 0x1a2436, cap: 0x22355e });
  group.position.set(x, 0, z);
  scene.add(group);
  const unit = {
    kind: 'foot', group, x, z,
    heading: 0, speed: 6.2, status: 'pursue',
    animPhase: Math.random() * 6, animSpeed: 0,
    state: 'pursue', baseScale: 1, crouchVisual: false,
  };
  S.policeUnits.push(unit);
  return unit;
}

function desiredUnits() {
  if (W.stars <= 0) return 0;
  return Math.min(2 + W.stars, 8);
}

export function updatePolice(scene, dt) {
  const want = desiredUnits();
  // stand down: remove units when the heat is gone
  while (S.policeUnits.length > want) {
    const u = S.policeUnits.pop();
    scene.remove(u.group);
  }
  while (S.policeUnits.length < want) {
    // units respond to the scene of the crime (the last place the player
    // was actually seen), never to wherever a hidden player really is
    const a = Math.random() * Math.PI * 2;
    const r = 45 + Math.random() * 10;
    let x = clamp(W.lastSeenX + Math.sin(a) * r, -CFG.worldHalf + 4, CFG.worldHalf - 4);
    let z = clamp(W.lastSeenZ + Math.cos(a) * r, -CFG.worldHalf + 4, CFG.worldHalf - 4);
    const probe = { x, z };
    pushOut(probe, 1);
    x = probe.x; z = probe.z;
    spawnUnit(scene, x, z);
  }
  const p = S.p;
  for (const u of S.policeUnits) {
    const d = dist2d(u.x, u.z, p.x, p.z);
    u.status = d <= CFG.policeSeeRadius ? 'pursue' : 'search';
    // unseen, a unit hunts the last place the player was actually seen -
    // it does not magically know where a hidden player went
    const tx = u.status === 'pursue' ? p.x : W.lastSeenX;
    const tz = u.status === 'pursue' ? p.z : W.lastSeenZ;
    const targetSpeed = u.status === 'pursue' ? 6.2 : 4.2;
    if (dist2d(u.x, u.z, tx, tz) > 1.25) {
      const wantHeading = Math.atan2(tx - u.x, tz - u.z);
      let diff = wantHeading - u.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      u.heading += clamp(diff, -3.4 * dt, 3.4 * dt);
      const step = Math.min(dist2d(u.x, u.z, tx, tz) - 1.1, targetSpeed * dt);
      u.x += Math.sin(u.heading) * step;
      u.z += Math.cos(u.heading) * step;
      u.animSpeed = targetSpeed;
    } else {
      u.animSpeed = 0;
      u.heading = Math.atan2(p.x - u.x, p.z - u.z);
    }
    const probe = { x: u.x, z: u.z };
    pushOut(probe, 0.55);
    u.x = probe.x; u.z = probe.z;
    u.group.position.set(u.x, 0, u.z);
    u.group.rotation.y = u.heading;
    animatePerson(u, dt);
  }
  void THREE;
}

export function policeDebug() {
  return S.policeUnits.map((u) => ({
    x: Math.round(u.x * 10) / 10,
    z: Math.round(u.z * 10) / 10,
    kind: u.kind,
    status: u.status,
  }));
}

// How many units are actively hunting right now (HUD flavour text).
export function unitsHunting() {
  return S.policeUnits.filter((u) => u.status === 'pursue').length;
}

// Distance to the nearest unit (Infinity when none are out).
export function nearestPoliceDist() {
  let d = Infinity;
  for (const u of S.policeUnits) d = Math.min(d, dist2d(u.x, u.z, S.p.x, S.p.z));
  return d;
}
