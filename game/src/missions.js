// PURNAMA BAY - Mira Santoso's six jobs for Raka Pradana, strictly in
// order. Completing a job is the ONLY way money enters the game: the
// reward line in completeMission() is the single place the balance grows.
import * as THREE from 'three';
import { S, CFG, dist2d } from './config.js';
import { PLACES } from './world.js';
import { reportCrime, clearWanted } from './wanted.js';
import { nearestNPC } from './population.js';
import { sfx } from './audio.js';
import { floatText } from './hud.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.min.js';

export const MISSIONS = [
  {
    name: 'First Run', reward: CFG.rewards[0],
    intro: 'Raka, take the package by the shore road and drive it to the pier, then drop it at the cafe yard. Quietly.',
    stages: [
      { type: 'goto', x: -2, z: 74, label: 'Reach the pickup point by the shore road' },
      // round 11 (P1-1): the pier drop sits at z=91, a few metres south
      // of the dockworkers' pacing apron (homes z=96..106), so a careful
      // delivery roll no longer has to cross their walking lines
      { type: 'driveTo', x: -18, z: 91, label: 'Drive the package to Purnama Pier' },
      { type: 'driveTo', x: -30, z: 4, label: 'Drop the package at the cafe yard' },
    ],
  },
  {
    name: 'Dock Hands', reward: CFG.rewards[1],
    intro: 'Three crates fell off a boat at the pier. Collect all three on foot and bring yourself back to me.',
    stages: [
      { type: 'collect', label: 'Collect the 3 lost crates on the pier' },
      { type: 'goto', x: CFG.miraSpot.x, z: CFG.miraSpot.z, label: 'Return to Mira at the pier' },
    ],
  },
  {
    name: 'Borrowed Wheels', reward: CFG.rewards[2],
    intro: 'A teal Gelora GT is parked east, near the palms. Its owner owes the wrong people. Take it to Bengkel Samudra.',
    stages: [
      { type: 'goto', x: 88, z: -38, label: 'Find the teal Gelora GT by the east palms' },
      { type: 'enterStolen', label: 'Get in the Gelora GT' },
      { type: 'driveTo', x: PLACES.garage.x, z: PLACES.garage.z, label: 'Deliver the car to Bengkel Samudra' },
    ],
  },
  {
    name: 'Quiet Warehouse', reward: CFG.rewards[3],
    intro: 'Gudang Pelita No. 9 holds the ledger that clears your name. Crouch past the two guards and reach the office desk.',
    stages: [
      { type: 'goto', x: 84, z: -50, label: 'Reach Gudang Pelita No. 9 warehouse' },
      { type: 'sneak', x: 84, z: -54, label: 'Crouch past the guards to the ledger desk' },
    ],
  },
  {
    name: 'Tail Breaker', reward: CFG.rewards[4],
    intro: 'A Kala courier is looping the avenues in a marked car. Stay on its tail until the driver gives up and stops.',
    stages: [
      { type: 'chase', label: 'Tail the courier car until it stops' },
    ],
  },
  {
    name: 'Last Ferry Out', reward: CFG.rewards[5],
    intro: 'This is it. The syndicate is coming for you in force. Lose them and get home to your house. Do not stop.',
    stages: [
      { type: 'driveTo', x: CFG.safehouse.x, z: CFG.safehouse.z, label: 'Escape to your safehouse', anyVehicle: true },
    ],
  },
];

export const M = {
  index: -1,          // 0-based current mission, -1 = none started
  stageIdx: 0,        // stages completed in the current mission
  active: null,       // current mission name or null
  completed: 0,
  crates: [],
  tailT: 0,
  targetCar: null,
  stealCar: null,
  guards: [],
};

let sceneRef = null;
let onObjective = () => {};
let onDialog = () => {};
let onGameClear = () => {};
let onSave = () => {};

export function missionsInit(scene, hooks) {
  sceneRef = scene;
  if (hooks) {
    onObjective = hooks.onObjective || onObjective;
    onDialog = hooks.onDialog || onDialog;
    onGameClear = hooks.onGameClear || onGameClear;
    onSave = hooks.onSave || onSave;
  }
}

export function setStealCar(car) { M.stealCar = car; }

export function missionSnapshot() {
  const stage = M.active ? MISSIONS[M.index].stages[M.stageIdx] : null;
  return {
    index: Math.max(0, M.index),
    done: M.completed,
    active: M.active,
    stage: stage ? stage.label : '',
    stageIdx: M.stageIdx,
    // round 11 (P1-14): the tail target's live distance + held time
    tailDist: M.targetCar ? Math.round(dist2d(S.p.x, S.p.z, M.targetCar.x, M.targetCar.z) * 10) / 10 : null,
    tailT: Math.round(M.tailT * 10) / 10,
  };
}

function currentStage() {
  if (!M.active) return null;
  return MISSIONS[M.index].stages[M.stageIdx] || null;
}

export function startMission(n) {
  const idx = n - 1;
  if (idx < 0 || idx >= MISSIONS.length) return false;
  clearStageProps();
  M.index = idx;
  M.stageIdx = 0;
  M.active = MISSIONS[idx].name;
  M.tailT = 0;
  setupStage();
  onDialog('mira', 'Mira Santoso', MISSIONS[idx].intro);
  pushObjective();
  // round 11 (P1-2): the job-6 finale heat is staged from THIS internal
  // path - the one talk-to-Mira and the completeMission chain actually
  // take - not only from the debug hook, so a real run meets the
  // syndicate frame-up the intro promises
  if (idx === 5) stageFinaleCrime();
  return true;
}

function pushObjective() {
  const st = currentStage();
  // the HUD shows ONE short line: the current stage's label, nothing more
  if (st) onObjective(st.label);
  else if (M.completed >= MISSIONS.length) onObjective('Free roam - the bay is yours.');
  else onObjective('');
}

function setupStage() {
  const st = currentStage();
  if (!st || !sceneRef) return;
  if (st.type === 'collect') {
    const spots = [[-26, 100], [-12, 108], [-20, 96]];
    for (const [x, z] of spots) {
      const mesh = new THREE.Mesh(
        new RoundedBoxGeometry(0.9, 0.9, 0.9, 2, 0.06),
        new THREE.MeshStandardMaterial({ color: 0xc9973f, roughness: 0.8 }));
      mesh.position.set(x, 0.45, z);
      mesh.castShadow = true;
      sceneRef.add(mesh);
      M.crates.push({ x, z, mesh, taken: false });
    }
  }
  if (st.type === 'chase') {
    const traffic = S.cars.find((c) => c.traffic && !c.dead);
    if (traffic) { M.targetCar = traffic; traffic.isTarget = true; }
  }
  if (st.type === 'sneak') {
    M.guards = S.npcs.filter((n) => n.kind === 'thug' && dist2d(n.x, n.z, 84, -60) < 26);
  }
}

function clearStageProps() {
  for (const c of M.crates) if (sceneRef) sceneRef.remove(c.mesh);
  M.crates = [];
  if (M.targetCar) { M.targetCar.isTarget = false; M.targetCar = null; }
}

function advanceStage() {
  clearStageProps();
  M.stageIdx++;
  if (M.stageIdx >= MISSIONS[M.index].stages.length) { completeMission(); return; }
  setupStage();
  pushObjective();
}

// The reward line: the one and only place the player's balance grows.
function completeMission() {
  const def = MISSIONS[M.index];
  S.money += def.reward;
  S.stats.earned += def.reward;
  M.completed++;
  sfx.missionDone();
  floatText(S.p.x, S.p.z, `+PB$ ${def.reward}`, '#ffd34d');
  onSave(); // round 11 (P0-1): a finished job is a save point
  onDialog('mira', 'Mira Santoso', `Job done, Raka. PB$ ${def.reward} - it is yours, clean.`);
  if (M.index === 5) clearWanted();
  const next = M.index + 1;
  M.active = null;
  if (next < MISSIONS.length) {
    startMission(next + 1);
  } else {
    M.index = MISSIONS.length - 1;
    onObjective('Free roam - the bay is yours. The ferry story is told.');
    // the story is won: main.js shows the NAME CLEARED summary screen
    onGameClear();
  }
}

export function updateMissions(dt) {
  const st = currentStage();
  if (!st) return;
  const p = S.p;
  if (st.type === 'goto') {
    if (dist2d(p.x, p.z, st.x, st.z) < 3.6) advanceStage();
  } else if (st.type === 'driveTo') {
    if (S.inCar && dist2d(p.x, p.z, st.x, st.z) < 6.5) advanceStage();
    else if (st.anyVehicle && dist2d(p.x, p.z, st.x, st.z) < 6.5 && S.inCar) advanceStage();
  } else if (st.type === 'enterStolen') {
    if (S.inCar && S.currentCar === M.stealCar) advanceStage();
    else if (S.inCar && S.currentCar && S.currentCar.model === 'Gelora GT' && S.currentCar.isStolen) advanceStage();
  } else if (st.type === 'collect') {
    let left = 0;
    for (const c of M.crates) {
      if (c.taken) continue;
      if (!S.inCar && dist2d(p.x, p.z, c.x, c.z) < 2.3) {
        c.taken = true;
        sceneRef.remove(c.mesh);
        sfx.pickup();
      } else left++;
    }
    if (left === 0) advanceStage();
  } else if (st.type === 'sneak') {
    // round 12: a guard whose corpse was cleaned up leaves this list
    // too, instead of shoving the player from beyond the grave
    if (M.guards.some((g) => g.removed)) M.guards = M.guards.filter((g) => !g.removed);
    // guards shove a standing intruder back to the warehouse gate
    for (const gNpc of M.guards) {
      if (!p.crouch && dist2d(p.x, p.z, gNpc.x, gNpc.z) < 4.2) {
        p.x = 84; p.z = -48;
        onObjective('Crouch now - slip past the guards to the ledger desk.');
        return;
      }
    }
    if (dist2d(p.x, p.z, st.x, st.z) < 3.2) advanceStage();
  } else if (st.type === 'chase') {
    const t = M.targetCar;
    if (!t) { advanceStage(); return; }
    if (dist2d(p.x, p.z, t.x, t.z) < 8) {
      M.tailT += dt;
      if (M.tailT >= 3) {
        t.traffic = false; t.hasDriver = false; t.speed = 0;
        advanceStage();
      }
    } else {
      M.tailT = Math.max(0, M.tailT - dt * 0.5);
    }
  }
}

// Total PB$ the whole story can pay - the economy's hard ceiling.
export function storyTotalReward() {
  return MISSIONS.reduce((sum, m) => sum + m.reward, 0);
}

// Mission 6 opens with the syndicate's frame-up: a staged, genuinely
// witnessed crime through the normal wanted pipeline (never a grant).
export function stageFinaleCrime() {
  const near = nearestNPC(S.p.x, S.p.z, (n) => n.kind !== 'child' && n.kind !== 'animal' && n.state !== 'down' && n.state !== 'dead');
  if (near) {
    near.rec.x = S.p.x + Math.sin(S.p.heading) * 1.6;
    near.rec.z = S.p.z + Math.cos(S.p.heading) * 1.6;
  }
  reportCrime(S.p.x, S.p.z, near ? near.rec : null);
}
