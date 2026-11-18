// PURNAMA BAY - police response. Foot units spill out of the Patrol Units
// and run the player down on foot; their numbers scale with the wanted
// level. They hunt the player's real position but only "see" inside the
// wanted model's sight radius, and they stand down when the stars are gone.
import * as THREE from 'three';
import { S, CFG, dist2d, pushOut, pushOutCars, clamp, pointBlocked } from './config.js';
import { makePerson, animatePerson } from './characters.js';
import { W } from './wanted.js';
import { sfx } from './audio.js';

function spawnUnit(scene, x, z) {
  const group = makePerson({ shirt: 0x22355e, pants: 0x1a2436, cap: 0x22355e });
  group.position.set(x, 0, z);
  scene.add(group);
  const unit = {
    kind: 'foot', group, x, z,
    heading: 0, speed: CFG.policeSpeed, status: 'pursue',
    animPhase: Math.random() * 6, animSpeed: 0,
    state: 'pursue', baseScale: 1, crouchVisual: false,
    shotCd: 1.4 + Math.random() * 1.4, aimPose: false, aimT: 0,
  };
  S.policeUnits.push(unit);
  return unit;
}

// Round 11 (P1-9): simple line-of-sight - sample the shot line every
// ~1.2 m; if any sample lands inside a building footprint, the shot is
// blocked and the unit must close in instead of firing through walls.
function hasLineOfSight(x1, z1, x2, z2) {
  const d = dist2d(x1, z1, x2, z2);
  const steps = Math.max(1, Math.ceil(d / 1.2));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointBlocked(x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, 0)) return false;
  }
  return true;
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
    const targetSpeed = u.status === 'pursue' ? CFG.policeSpeed : CFG.policeSearchSpeed;
    // round 11 (P1-9): a shot needs a clear line of sight AND a visible
    // aim pause first - the unit raises its weapon (aimPose) for
    // CFG.policeAimTime before the first round of each burst can land,
    // so taking cover or breaking the line genuinely saves the player
    const canShoot = W.stars >= 3 && !S.inCar && u.status === 'pursue' && d <= 17 && d >= 5.5
      && hasLineOfSight(u.x, u.z, p.x, p.z);
    if (canShoot) {
      // at 3+ stars a unit in mid-range stops and shoots instead of closing in
      u.animSpeed = 0;
      u.heading = Math.atan2(p.x - u.x, p.z - u.z);
      u.aimPose = true;
      u.aimT = (u.aimT || 0) + dt;
      u.shotCd -= dt;
      if (u.shotCd <= 0 && u.aimT >= CFG.policeAimTime) {
        u.shotCd = CFG.policeShotCd;
        sfx.shot();
        S.health -= CFG.bulletDamage;
        S.lastHurtAt = S.time;
        S.combat.fightT = CFG.fightModeTime;
      }
    } else if (dist2d(u.x, u.z, tx, tz) > 1.25) {
      u.aimT = 0;
      u.aimPose = false;
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
      u.aimPose = false;
      u.aimT = 0;
      u.animSpeed = 0;
      u.heading = Math.atan2(p.x - u.x, p.z - u.z);
    }
    const probe = { x: u.x, z: u.z };
    pushOut(probe, 0.55);
    pushOutCars(probe, 0.35); // foot units route around cars, not through
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
