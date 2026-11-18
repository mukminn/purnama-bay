// Police response: foot officers and patrol cars with lightbars and sirens.
// Stars 1-2 arrest on sustained contact (1.2 s) -> BUSTED. Stars >=3 shoot
// back for small damage (stylised, no gore). Units pursue when they can see
// the player, search the last seen position when they cannot.
import * as THREE from '../vendor/three.module.min.js';
import { CFG } from './config.js';
import { createHuman, poseHuman } from './characters.js';
import { createCar, stepVehicle, chaseInput, updateCarCosmetics } from './vehicles.js';

const SPAWN_ROADS = [];
for (let x = -95; x <= 95; x += 10) { SPAWN_ROADS.push({ x, z: -60 }); SPAWN_ROADS.push({ x, z: 40 }); SPAWN_ROADS.push({ x, z: 80 }); }
for (let z = -50; z <= 70; z += 10) { SPAWN_ROADS.push({ x: -60, z }); SPAWN_ROADS.push({ x: 60, z }); SPAWN_ROADS.push({ x: 0, z }); }

export function createPolice(scene, world, audio) {
  const units = []; // {kind:'foot'|'car', ...}
  let footSeq = 0, carSeq = 0, arrestT = 0, goneT = 0;

  function spawnPointNear(playerPos, minD, maxD) {
    let best = null, bestScore = -1;
    for (const p of SPAWN_ROADS) {
      const d = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      if (d >= minD && d <= maxD) {
        const score = Math.random() * 10 - Math.abs(d - (minD + maxD) / 2) * 0.05;
        if (score > bestScore) { bestScore = score; best = p; }
      }
    }
    return best || { x: playerPos.x + 55, z: playerPos.z };
  }
  function spawnFoot(playerPos) {
    const sp = spawnPointNear(playerPos, 34, 52);
    const group = createHuman({ skin: 0xc68863, hair: 0x14100c, shirt: 0x1d3f6e, pants: 0x16283f, cap: 0x1d3f6e, scale: 0.98 });
    group.position.set(sp.x, 0, sp.z);
    scene.add(group);
    const u = { kind: 'foot', group, pos: group.position, heading: 0, phase: 0, shootCd: Math.random(), status: 'EN ROUTE', id: ++footSeq };
    units.push(u);
    return u;
  }
  function spawnCar(playerPos) {
    const sp = spawnPointNear(playerPos, 48, 70);
    const car = createCar('patrol', { x: sp.x, z: sp.z, heading: Math.atan2(playerPos.x - sp.x, playerPos.z - sp.z), driver: 'officer' });
    scene.add(car.group);
    const u = { kind: 'car', car, pos: car.pos, status: 'EN ROUTE', id: ++carSeq };
    units.push(u);
    return u;
  }
  function removeUnit(u) {
    if (u.kind === 'foot') scene.remove(u.group);
    else scene.remove(u.car.group);
    units.splice(units.indexOf(u), 1);
  }

  // Can any unit see the player right now? Crouching still and far reads as hidden.
  function computeSeen(ctx) {
    const { playerPos, playerCrouch, playerStill } = ctx;
    for (const u of units) {
      const d = Math.hypot(u.pos.x - playerPos.x, u.pos.z - playerPos.z);
      const range = u.kind === 'car' ? 46 : 38;
      if (d < range) {
        if (playerCrouch && playerStill && d > 9) continue;
        return true;
      }
    }
    return false;
  }

  function desiredCounts(stars) {
    if (stars <= 0) return { foot: 0, cars: 0 };
    return {
      foot: Math.min(1 + stars, 4),
      cars: stars === 1 ? 1 : Math.min(stars, 3),
    };
  }

  return {
    units,
    counts() {
      return {
        foot: units.filter((u) => u.kind === 'foot' && !u.downForever).length,
        cars: units.filter((u) => u.kind === 'car').length,
      };
    },
    // Up to 5 nearest units for the HUD response panel.
    panelInfo(playerPos) {
      return units
        .filter((u) => !u.downForever)
        .map((u) => ({
          kind: u.kind === 'car' ? 'PATROL CAR' : 'OFFICER',
          dist: Math.round(Math.hypot(u.pos.x - playerPos.x, u.pos.z - playerPos.z)),
          status: u.status,
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 5);
    },
    update(dt, ctx) {
      const { stars, playerPos, wanted } = ctx;
      const seen = computeSeen(ctx);
      ctx.onSight(seen);
      const want = desiredCounts(stars);
      const haveFoot = units.filter((u) => u.kind === 'foot').length;
      const haveCars = units.filter((u) => u.kind === 'car').length;
      if (stars > 0) {
        goneT = 0;
        if (haveFoot < want.foot) spawnFoot(playerPos);
        if (haveCars < want.cars) spawnCar(playerPos);
        audio.siren(true);
      } else {
        goneT += dt;
        audio.siren(false);
        if (goneT > 3.5) { while (units.length) removeUnit(units[0]); arrestT = 0; return { seen, arresting: false, arrestProgress: 0 }; }
      }
      let arresting = false;
      const searchTarget = wanted.lastSeenPos || playerPos;
      for (const u of [...units]) {
        const d = Math.hypot(u.pos.x - playerPos.x, u.pos.z - playerPos.z);
        if (u.kind === 'foot') updateFoot(u, dt, ctx, seen, searchTarget, d);
        else updateCarUnit(u, dt, ctx, seen, searchTarget, d);
        // arrest: stars 1-2, an officer in contact range holds the timer
        if (stars >= 1 && stars <= 2 && u.kind === 'foot' && d < 1.7 && ctx.playerMode === 'foot') {
          arresting = true;
          u.status = 'ARRESTING';
        }
        // NOTE: units are never distance-culled while wanted is active —
        // culling + respawning near the player would leak the player's
        // current position to the search, which the witness model forbids.
      }
      if (arresting) {
        arrestT += dt;
        if (arrestT >= CFG.arrestTime) { arrestT = 0; ctx.onBusted(); }
      } else arrestT = Math.max(0, arrestT - dt * 1.6);
      return { seen, arresting, arrestProgress: arrestT / CFG.arrestTime };
    },
    // Teleport-free helper for staged screenshots: bring one patrol car and
    // two officers in close, mid-pursuit, without touching wanted rules.
    stageChase(playerPos) {
      while (units.length < 2) spawnFoot(playerPos);
      if (!units.some((u) => u.kind === 'car')) spawnCar(playerPos);
      let i = 0;
      for (const u of units) {
        i++;
        const a = i * 2.2;
        u.pos.x = playerPos.x + Math.sin(a) * (6 + i * 2);
        u.pos.z = playerPos.z + Math.cos(a) * (6 + i * 2);
        u.status = 'PURSUIT';
        if (u.kind === 'car') { u.car.heading = a + Math.PI; u.car.group.rotation.y = u.car.heading; }
      }
    },
    reset() { while (units.length) removeUnit(units[0]); arrestT = 0; },
  };

  function updateFoot(u, dt, ctx, seen, searchTarget, d) {
    if (u.downForever) { u.status = 'DOWN'; return; }
    const { stars, playerPos } = ctx;
    const target = stars === 0 ? { x: u.pos.x + 30, z: u.pos.z + 30 } : seen ? playerPos : searchTarget;
    const shooting = stars >= 3 && seen && d < 30;
    const stopDist = shooting ? 7 : 1.2;
    let moving = false;
    if (Math.hypot(target.x - u.pos.x, target.z - u.pos.z) > stopDist) {
      const want = Math.atan2(target.x - u.pos.x, target.z - u.pos.z);
      let diff = want - u.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      u.heading += Math.max(-3.4 * dt, Math.min(3.4 * dt, diff * 7 * dt));
      const sp = stars >= 3 ? 5.6 : 5.1;
      let nx = u.pos.x + Math.sin(u.heading) * sp * dt;
      let nz = u.pos.z + Math.cos(u.heading) * sp * dt;
      [nx, nz] = world.collide(nx, nz, 0.42);
      u.pos.x = nx; u.pos.z = nz;
      u.phase += dt * 10.5;
      moving = true;
    }
    u.status = stars === 0 ? 'LEAVING' : seen ? (shooting ? 'ENGAGING' : 'PURSUIT') : (Math.hypot(searchTarget.x - u.pos.x, searchTarget.z - u.pos.z) < 4 ? 'SEARCHING' : 'SEARCH');
    if (d > 70 && stars > 0) u.status = 'EN ROUTE';
    poseHuman(u.group, { mode: 'walk', moving, speed01: moving ? 0.85 : 0, phase: u.phase, time: ctx.t, aim: shooting }, dt);
    u.group.rotation.y = u.heading;
    if (shooting) {
      u.shootCd -= dt;
      if (u.shootCd <= 0) {
        u.shootCd = CFG.policeShootInterval * (0.8 + Math.random() * 0.5);
        ctx.onPoliceShot(u, CFG.policeShootDamage);
      }
    }
  }

  function updateCarUnit(u, dt, ctx, seen, searchTarget, d) {
    const { stars, playerPos, playerMode } = ctx;
    const car = u.car;
    let input;
    if (stars === 0) {
      input = chaseInput(car, u.pos.x + Math.sin(car.heading) * 40, u.pos.z + Math.cos(car.heading) * 40, 14);
      u.status = 'LEAVING';
    } else if (seen) {
      const stopD = playerMode === 'car' ? 2 : 5.5;
      const tx = playerPos.x - Math.sin(car.heading) * 0 + (playerPos.x - car.pos.x) * 0; // direct chase
      input = chaseInput(car, playerPos.x, playerPos.z, d > stopD ? 31 : 0);
      u.status = d > 70 ? 'EN ROUTE' : 'PURSUIT';
      void tx;
    } else {
      input = chaseInput(car, searchTarget.x, searchTarget.z, Math.hypot(searchTarget.x - car.pos.x, searchTarget.z - car.pos.z) > 6 ? 20 : 0);
      u.status = Math.hypot(searchTarget.x - car.pos.x, searchTarget.z - car.pos.z) < 7 ? 'SEARCHING' : 'SEARCH';
    }
    stepVehicle(car, input, dt, world);
    updateCarCosmetics(car, dt, ctx.t, stars > 0);
  }
}
