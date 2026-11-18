// PURNAMA BAY - entry point and game loop. Owns the renderer, the player
// avatar and camera, keyboard input, car entry/exit, the arrest and wasted
// endings, saving, the staged screenshot scenes and the window.PB debug
// hook the automated probes drive the real game through.
import * as THREE from 'three';
import { CFG, S, clamp, angleLerp, pushOut, dist2d } from './config.js';
import { buildWorld, PLACES } from './world.js';
import { buildPopulation, updatePopulation, countsSnapshot, nearestNPC, scareArea } from './population.js';
import { makePerson, animatePerson } from './characters.js';
import { buildVehicles, nearestEnterableCar, driveStep, updateTraffic, enterCar, exitCar, syncCarMesh } from './vehicles.js';
import { W, wantedSnapshot, updateWanted, noteVehicleSwap, noteClothesChange, clearWanted, reportCrime } from './wanted.js';
import { updatePolice, policeDebug, nearestPoliceDist } from './police.js';
import { WPN, weaponsSnapshot, selectWeapon, buyItem, meleeAttack, punchNearest, shoot, initDrops, updateDrops, dropsInfo, pickupDropAt, flushBufferedAttack } from './weapons.js';
import { MISSIONS, M, startMission, updateMissions, missionSnapshot, missionsInit, setStealCar, stageFinaleCrime } from './missions.js';
import { initHUD, setObjective, showBanner, showDialog, hideDialog, setPrompt, openShop, closeShop, refreshShop, updateHUD, setMinimapTarget } from './hud.js';
import { initTouch, refreshTouchVisibility } from './touch.js';
import { audioInit, sfx, sirenUpdate, audioToggleMute } from './audio.js';

const SAVE_KEY = 'purnama-bay-save-v1';

// ---------------------------------------------------------------- renderer
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
let camYaw = Math.PI;

const worldRefs = buildWorld(scene);
const mira = buildPopulation(scene);
void mira;
const stealCar = buildVehicles(scene);
setStealCar(stealCar);
initDrops(scene);

// Raka Pradana, the player avatar
const playerGroup = makePerson({ shirt: 0x12716b, pants: 0x2c343a, skin: 0xa06a42 });
scene.add(playerGroup);
const playerAnim = { group: playerGroup, animSpeed: 0, animPhase: 0, state: 'wander', baseScale: 1, crouchVisual: false };

// a soft disc marker that floats over the current mission target
const marker = new THREE.Mesh(
  new THREE.CylinderGeometry(1.6, 1.6, 14, 20, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }));
marker.visible = false;
scene.add(marker);

missionsInit(scene, {
  onObjective: (t) => setObjective(t),
  onDialog: (who, name, text) => showDialog(who, name, text),
});
initHUD({
  onBuy: (item) => { const msg = buyItem(item); refreshShop(msg); },
  onDialog: () => {},
});

// ---------------------------------------------------------------- run state
function resetRun() {
  S.money = 0;
  S.health = 100;
  S.time = 0;
  clearWanted();
  WPN.owned = { fists: true, baton: false, pistol: false };
  WPN.active = 'fists';
  WPN.ammo = 0;
  if (S.inCar) exitCar();
  S.p.x = 0; S.p.z = 30; S.p.y = 0; S.p.heading = Math.PI; S.p.crouch = false;
  M.index = -1; M.active = null; M.completed = 0; M.stageIdx = 0;
}

function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: S.money, health: S.health,
      missionIndex: M.index, completed: M.completed,
      owned: WPN.owned, ammo: WPN.ammo, active: WPN.active,
      x: S.p.x, z: S.p.z,
    }));
  } catch { /* storage unavailable: saving is best-effort */ }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    S.money = d.money || 0;
    S.health = d.health || 100;
    WPN.owned = { fists: true, baton: !!d.owned?.baton, pistol: !!d.owned?.pistol };
    WPN.ammo = d.ammo || 0;
    WPN.active = WPN.owned[d.active] ? d.active : 'fists';
    S.p.x = typeof d.x === 'number' ? d.x : 0;
    S.p.z = typeof d.z === 'number' ? d.z : 30;
    const next = (d.completed || 0);
    if (next < MISSIONS.length) startMission(next + 1);
    M.completed = d.completed || 0;
    return true;
  } catch { return false; }
}

function isPortrait() { return window.innerHeight > window.innerWidth; }

function startGame(useSave) {
  if (isPortrait()) return false;
  audioInit();
  hideEnd();
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  S.mode = 'playing';
  S.paused = false;
  if (useSave && loadGame()) {
    showBanner('Welcome back to Purnama Bay');
  } else {
    resetRun();
    startMission(1);
  }
  refreshTouchVisibility();
  return true;
}

function pauseGame(on) {
  if (S.mode !== 'playing' && S.mode !== 'paused') return;
  S.paused = !!on;
  S.mode = on ? 'paused' : 'playing';
}

function endGame(kind) {
  if (S.mode === 'ended') return;
  S.mode = 'ended';
  S.endedKind = kind;
  const overlay = document.getElementById('end-overlay');
  const title = document.getElementById('end-title');
  const text = document.getElementById('end-text');
  if (kind === 'busted') {
    const fine = Math.min(S.money, 100);
    S.money -= fine;
    title.textContent = 'BUSTED';
    text.textContent = `The harbour police finally cornered Raka. Bail and fines cost PB$ ${fine}, and the bay forgets his face - for now.`;
    sfx.busted();
  } else {
    title.textContent = 'WASTED';
    text.textContent = 'Raka wakes up at the dock clinic with an empty head and a long bill. The bay gives him another morning.';
  }
  overlay.style.display = 'flex';
  clearWanted();
}

function hideEnd() {
  document.getElementById('end-overlay').style.display = 'none';
}

function respawn() {
  hideEnd();
  S.health = 100;
  S.p.x = CFG.safehouse.x;
  S.p.z = CFG.safehouse.z;
  S.p.y = 0;
  if (S.inCar) exitCar();
  clearWanted();
  S.mode = 'playing';
  S.paused = false;
  document.getElementById('hud').style.display = 'block';
}

// ---------------------------------------------------------------- input
function doJump() {
  if (S.mode !== 'playing' || S.inCar) return;
  if (S.p.onGround) {
    S.p.vy = CFG.jumpVelocity;
    S.p.onGround = false;
    S.p.peakY = S.p.y;
  }
}

function tryEnterExit() {
  if (S.mode !== 'playing') return;
  if (S.inCar) { exitCar(); setPrompt(''); return; }
  const car = nearestEnterableCar(S.p.x, S.p.z, 3.4);
  if (car) {
    enterCar(car);
    noteVehicleSwap(car);
    if (car.isStolen) reportCrime(S.p.x, S.p.z, null);
    camYaw = car.heading;
  }
}

function tryInteract() {
  if (S.mode !== 'playing' || S.inCar) return;
  const drop = pickupDropAt(S.p.x, S.p.z);
  if (drop) { showBanner(`Picked up: ${drop.weapon.toUpperCase()}`); return; }
  if (dist2d(S.p.x, S.p.z, CFG.shopDoor.x, CFG.shopDoor.z) < 4.6) { openShop(); return; }
  if (dist2d(S.p.x, S.p.z, CFG.safehouse.x, CFG.safehouse.z) < 4.5) {
    noteClothesChange();
    playerGroup.userData.parts.torso.material = new THREE.MeshLambertMaterial({ color: 0xc9973f });
    showBanner('Fresh shirt. The description of Raka fades.');
    return;
  }
  const near = nearestNPC(S.p.x, S.p.z, (n) => !!n.isMira);
  if (near && near.dist < 4) {
    if (!M.active && M.completed < MISSIONS.length) startMission(M.completed + 1);
    else showDialog('mira', 'Mira Santoso', 'One job at a time, Raka. Finish what is on the table.');
  }
}

function onAct() {
  if (S.mode !== 'playing') return;
  if (S.inCar) { tryEnterExit(); return; }
  if (nearestEnterableCar(S.p.x, S.p.z, 3.4)) { tryEnterExit(); return; }
  tryInteract();
}

window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  S.input.keys.add(e.code);
  if (e.altKey || e.code === 'AltLeft' || e.code === 'AltRight') S.input.altHeld = true;
  if (e.shiftKey || e.code === 'ShiftLeft' || e.code === 'ShiftRight') S.input.shiftHeld = true;
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  audioInit();
  switch (e.code) {
    case 'Space': doJump(); break;
    case 'KeyC': if (S.mode === 'playing' && !S.inCar) S.p.crouch = !S.p.crouch; break;
    case 'KeyJ': meleeAttack('punch'); break;
    case 'KeyK': meleeAttack('kick'); break;
    case 'KeyF': tryEnterExit(); break;
    case 'KeyE': tryInteract(); break;
    case 'Digit1': selectWeapon('baton'); break;
    case 'Digit2': selectWeapon('pistol'); break;
    case 'Digit3': selectWeapon('fists'); break;
    case 'KeyM': audioToggleMute(); break;
    case 'KeyP': case 'Escape':
      if (S.shopOpen) closeShop();
      else if (S.mode === 'playing' || S.mode === 'paused') pauseGame(S.mode === 'playing');
      break;
  }
});
window.addEventListener('keyup', (e) => {
  S.input.keys.delete(e.code);
  if (e.code === 'AltLeft' || e.code === 'AltRight') S.input.altHeld = false;
  if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') S.input.shiftHeld = false;
});
window.addEventListener('blur', () => { S.input.keys.clear(); S.input.altHeld = false; S.input.shiftHeld = false; });
renderer.domElement.addEventListener('mousedown', () => {
  if (S.mode !== 'playing') return;
  audioInit();
  if (WPN.active === 'pistol') shoot();
  else meleeAttack('punch');
});

initTouch({
  onAct,
  onJump: doJump,
  onHit: () => { if (WPN.active === 'pistol') shoot(); else meleeAttack('punch'); },
});

document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-end-ok').addEventListener('click', () => respawn());
if (hasSave()) document.getElementById('btn-continue').style.display = 'inline-block';

// ---------------------------------------------------------------- per-frame
function updatePlayer(dt) {
  const p = S.p;
  const keys = S.input.keys;
  if (S.inCar && S.currentCar) {
    const car = S.currentCar;
    let throttle = 0; let steer = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) throttle = 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) throttle = -1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) steer = 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) steer = -1;
    if (S.input.joyActive) {
      throttle = clamp(-S.input.joyY, -1, 1);
      steer = clamp(-S.input.joyX, -1, 1);
    }
    const brake = keys.has('Space') || S.input.brakeTouch;
    driveStep(car, dt, throttle, steer, brake);
    p.x = car.x; p.z = car.z; p.y = 0;
    p.heading = car.heading;
    p.speed = Math.abs(car.speed);
    p.moving = Math.abs(car.speed) > 0.3;
    playerGroup.visible = false;
    camYaw = angleLerp(camYaw, car.heading, Math.min(1, dt * 3.2));
    return;
  }
  playerGroup.visible = true;
  // movement direction, camera-relative
  let ix = 0; let iz = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) iz += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) iz -= 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) ix -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) ix += 1;
  if (S.input.joyActive) { ix += S.input.joyX; iz += -S.input.joyY; }
  const mag = Math.sqrt(ix * ix + iz * iz);
  p.moving = mag > 0.12;
  let speed = 0;
  if (p.moving) {
    const tier = p.crouch ? CFG.crouchSpeed
      : (keys.has('AltLeft') || keys.has('AltRight') || S.input.altHeld) ? CFG.walkSpeed
        : (keys.has('ShiftLeft') || keys.has('ShiftRight') || S.input.shiftHeld) ? CFG.sprintSpeed
          : CFG.runSpeed;
    speed = tier * clamp(mag, 0, 1);
    const dirWorld = Math.atan2(
      Math.sin(camYaw) * iz + Math.cos(camYaw) * ix,
      Math.cos(camYaw) * iz - Math.sin(camYaw) * ix);
    p.heading = angleLerp(p.heading, dirWorld, Math.min(1, dt * 14));
    p.x += Math.sin(p.heading) * speed * dt;
    p.z += Math.cos(p.heading) * speed * dt;
    camYaw = angleLerp(camYaw, p.heading, Math.min(1, dt * 4.5));
  }
  p.speed = speed;
  // vertical: jump arc
  if (!p.onGround) {
    p.y += p.vy * dt;
    p.vy -= CFG.gravity * dt;
    if (p.y > p.peakY) p.peakY = p.y;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  }
  pushOut(p, 0.55);
  p.x = clamp(p.x, -CFG.worldHalf + 2, CFG.worldHalf - 2);
  p.z = clamp(p.z, -CFG.worldHalf + 2, CFG.worldHalf + 20);
  playerGroup.position.set(p.x, p.y, p.z);
  playerGroup.rotation.y = p.heading;
  playerAnim.animSpeed = speed;
  playerAnim.crouchVisual = p.crouch;
  animatePerson(playerAnim, dt);
}

let bustT = 0;
function updateArrest(dt) {
  if (W.stars <= 0) { bustT = 0; return; }
  const slow = !S.inCar || Math.abs(S.currentCar ? S.currentCar.speed : 0) < 1;
  if (slow && W.seenByPolice && nearestPoliceDist() < CFG.bustedRadius) {
    bustT += dt;
    if (bustT >= CFG.bustedTime) { bustT = 0; endGame('busted'); }
  } else {
    bustT = Math.max(0, bustT - dt * 1.6);
  }
}

function updatePrompt() {
  if (S.mode !== 'playing') { setPrompt(''); return; }
  if (S.inCar) { setPrompt(''); return; }
  if (nearestEnterableCar(S.p.x, S.p.z, 3.4)) { setPrompt('ENTER CAR — F'); return; }
  if (S.drops.some((d) => dist2d(S.p.x, S.p.z, d.x, d.z) <= 2.1)) { setPrompt('PICK UP — E'); return; }
  if (dist2d(S.p.x, S.p.z, CFG.shopDoor.x, CFG.shopDoor.z) < 4.6) { setPrompt('PURNAMA ARMS — E'); return; }
  setPrompt('');
}

function currentTarget() {
  if (!M.active) return null;
  const st = MISSIONS[M.index].stages[M.stageIdx];
  if (!st) return null;
  if (st.type === 'collect') {
    const c = M.crates.find((k) => !k.taken);
    return c ? { x: c.x, z: c.z } : { x: CFG.miraSpot.x, z: CFG.miraSpot.z };
  }
  if (st.type === 'chase') return M.targetCar ? { x: M.targetCar.x, z: M.targetCar.z } : null;
  if (st.type === 'enterStolen') return M.stealCar ? { x: M.stealCar.x, z: M.stealCar.z } : null;
  if (typeof st.x === 'number') return { x: st.x, z: st.z };
  return null;
}

function updateCamera() {
  const p = S.p;
  const dist = S.inCar ? 8.2 : CFG.camDistance;
  const h = S.inCar ? CFG.camHeightCar : (p.crouch ? CFG.camHeightCrouch : CFG.camHeightStand);
  const bx = p.x - Math.sin(camYaw) * dist;
  const bz = p.z - Math.cos(camYaw) * dist;
  camera.position.set(bx, h + p.y, bz);
  camera.lookAt(p.x, 1.25 + p.y, p.z);
  S.cameraY = camera.position.y;
}

// ---------------------------------------------------------------- PB hook
function stateSnapshot() {
  const p = S.p;
  return {
    mode: S.mode,
    time: S.time,
    player: {
      x: p.x, y: p.y, z: p.z, heading: p.heading,
      speed: p.speed, crouch: p.crouch, moving: p.moving, peakY: p.peakY,
    },
    money: S.money,
    health: Math.round(S.health),
    wanted: wantedSnapshot(),
    weapons: weaponsSnapshot(),
    mission: missionSnapshot(),
    inCar: S.inCar,
    cameraY: S.cameraY,
    combat: {
      attackT: S.combat.attackT, attackKind: S.combat.attackKind,
      attackCd: S.combat.attackCd, lastKind: S.combat.lastKind, lastAt: S.combat.lastAt,
    },
    vehicle: S.currentCar ? { model: S.currentCar.model, heading: S.currentCar.heading, speed: S.currentCar.speed, health: S.currentCar.health } : null,
    prompt: S.prompt,
    shopOpen: S.shopOpen,
    dialogOpen: S.dialogOpen,
    paused: S.paused,
  };
}

window.PB = {
  state: stateSnapshot,
  counts: countsSnapshot,
  debugCars: () => ({
    parked: S.cars.filter((c) => !c.traffic).map((c) => ({ x: c.x, z: c.z, model: c.model })),
    traffic: S.cars.filter((c) => c.traffic).map((c) => ({ x: c.x, z: c.z, model: c.model })),
    all: S.cars.map((c) => ({ x: c.x, z: c.z, model: c.model, traffic: c.traffic })),
  }),
  debugPolice: policeDebug,
  dropsInfo,
  renderInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }),
  teleport: (x, z) => {
    if (S.inCar && S.currentCar) {
      S.currentCar.x = x; S.currentCar.z = z;
      syncCarMesh(S.currentCar);
    }
    S.p.x = x; S.p.z = z;
  },
  teleportCar: (x, z, heading) => {
    const car = S.currentCar || nearestEnterableCar(S.p.x, S.p.z, 400);
    if (!car) return;
    car.x = x; car.z = z;
    if (typeof heading === 'number') car.heading = heading;
    syncCarMesh(car);
    if (S.inCar) { S.p.x = x; S.p.z = z; camYaw = car.heading; }
  },
  teleportNear: (kind, armedFirst) => {
    const wantKind = kind === 'citizen' ? 'citizen' : kind;
    let pool = S.npcs.filter((n) => n.kind === wantKind && n.state !== 'down');
    if (wantKind === 'thug' && armedFirst) {
      const armed = pool.filter((n) => n.armed);
      if (armed.length) pool = armed;
    }
    if (!pool.length) return null;
    const rec = pool[0];
    S.p.x = rec.x + 2.0;
    S.p.z = rec.z;
    S.p.heading = Math.atan2(S.p.x - rec.x, S.p.z - rec.z); // face away: a plain swing whiffs
    return { x: rec.x, z: rec.z, kind: rec.kind };
  },
  startMission: (n) => {
    if (S.mode === 'menu') startGame(false);
    const ok = startMission(n);
    if (ok && n === 6) stageFinaleCrime();
    return ok;
  },
  commitCrime: () => punchNearest(),
  punchNearest: () => punchNearest(),
  spawnWitnessCrime: () => {
    const near = nearestNPC(S.p.x, S.p.z, (n) => n.kind !== 'child' && n.kind !== 'animal' && n.state !== 'down');
    if (!near) return { raised: false, stars: W.stars, witness: null, cd: 0, dlg: S.dialogOpen, mode: S.mode, dist: -1 };
    const rec = near.rec;
    rec.x = S.p.x + Math.sin(S.p.heading) * 1.6;
    rec.z = S.p.z + Math.cos(S.p.heading) * 1.6;
    rec.group.position.set(rec.x, 0, rec.z);
    const before = W.stars;
    punchNearest();
    return {
      raised: W.stars > before, stars: W.stars, witness: rec.kind,
      cd: S.combat.attackCd, dlg: S.dialogOpen, mode: S.mode, dist: 1.6,
    };
  },
  dismissDialog: () => hideDialog(),
  pause: (on) => pauseGame(on),
  save: () => saveGame(),
  startGame: (useSave) => startGame(!!useSave),
  setupShot: (name) => setupShot(name),
};

// ---------------------------------------------------------------- screenshots
function setupShot(name) {
  if (S.mode === 'menu') startGame(false);
  hideDialog();
  closeShop();
  if (name === 'drive') {
    const car = S.cars.find((c) => !c.traffic);
    enterCar(car);
    car.x = 14; car.z = 80; car.heading = Math.PI / 2; car.speed = 9;
    syncCarMesh(car);
    S.p.x = car.x; S.p.z = car.z;
    camYaw = car.heading;
  } else if (name === 'chase') {
    const car = S.cars.find((c) => !c.traffic);
    enterCar(car);
    car.x = -6; car.z = 40; car.heading = 0; car.speed = 7;
    syncCarMesh(car);
    S.p.x = car.x; S.p.z = car.z;
    camYaw = 0;
    window.PB.spawnWitnessCrime();
    setTimeout(() => {
      S.policeUnits.forEach((u, i) => {
        u.x = car.x - 5 + i * 3.4;
        u.z = car.z - 9 - (i % 2) * 3;
        u.group.position.set(u.x, 0, u.z);
      });
    }, 1400);
  } else if (name === 'walk') {
    if (S.inCar) exitCar();
    S.p.x = 8; S.p.z = 44; S.p.heading = -0.7; camYaw = -0.7;
    let placed = 0;
    for (const n of S.npcs) {
      if (placed >= 4) break;
      if (n.kind === 'citizen' || n.kind === 'child') {
        n.x = S.p.x + 2.5 + placed * 1.7;
        n.z = S.p.z + 2 - placed;
        placed++;
      }
    }
  } else if (name === 'mission') {
    if (S.inCar) exitCar();
    startMission(1);
    hideDialog();
    S.p.x = -6; S.p.z = 66; S.p.heading = 0.5; camYaw = 0.5;
  } else if (name === 'crowd') {
    if (S.inCar) exitCar();
    S.p.x = 0; S.p.z = 30; S.p.heading = Math.PI; camYaw = Math.PI;
    let placed = 0;
    for (const n of S.npcs) {
      if (placed >= 9) break;
      if (n.kind === 'animal') continue;
      const a = (placed / 9) * Math.PI * 2;
      n.x = S.p.x + Math.sin(a) * (3 + (placed % 3));
      n.z = S.p.z + Math.cos(a) * (3 + (placed % 3));
      placed++;
    }
  }
}

const shotParam = new URLSearchParams(window.location.search).get('shot');
if (shotParam) {
  setTimeout(() => { startGame(false); setupShot(shotParam); }, 500);
}

// ---------------------------------------------------------------- loop
let lastNow = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  let dt = (now - lastNow) / 1000;
  lastNow = now;
  if (dt > 0.25) dt = 0.25;
  if (dt < 0) dt = 0;
  if (S.mode === 'playing') {
    // physics runs in fixed substeps so a slow frame can never stretch a
    // jump arc or a braking distance
    const steps = Math.max(1, Math.min(10, Math.ceil(dt / 0.033)));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      S.time += sdt;
      if (S.combat.attackT > 0) S.combat.attackT = Math.max(0, S.combat.attackT - sdt);
      if (S.combat.attackCd > 0) S.combat.attackCd = Math.max(0, S.combat.attackCd - sdt);
      flushBufferedAttack();
      updatePlayer(sdt);
      updateTraffic(sdt);
      updatePopulation(sdt);
      updateMissions(sdt);
      updateWanted(sdt);
      updatePolice(scene, sdt);
      updateArrest(sdt);
      updateDrops(sdt);
      if (S.mode !== 'playing') break;
    }
    if (S.health < 100) S.health = Math.min(100, S.health + dt * 0.7);
    if (S.health <= 0 && S.mode === 'playing') endGame('wasted');
    sirenUpdate(W.stars);
    const t = currentTarget();
    setMinimapTarget(t);
    marker.visible = !!t && !S.inCar;
    if (t) {
      marker.position.set(t.x, 7, t.z);
      marker.rotation.y += dt;
    }
    if (worldRefs.sea) worldRefs.sea.position.y = -0.25 + Math.sin(S.time * 0.7) * 0.05;
  }
  updatePrompt();
  updateCamera();
  updateHUD(weaponsSnapshot());
  refreshTouchVisibility();
  renderer.render(scene, camera);
}
loop();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

void PLACES;
void scareArea;

// Session flavour: the bay's name and the hour, for logs and future saves.
const SESSION_TAG = `${CFG.cityName} · ${CFG.heroName} · v1 rebuild`;
void SESSION_TAG;
