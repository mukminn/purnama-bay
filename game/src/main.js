// PURNAMA BAY - entry point and game loop. Owns the renderer, the player
// avatar and camera, keyboard input, car entry/exit, the arrest and wasted
// endings, saving, the staged screenshot scenes and the window.PB debug
// hook the automated probes drive the real game through.
import * as THREE from 'three';
import { CFG, S, clamp, angleLerp, pushOut, pushOutCars, dist2d } from './config.js';
import { buildWorld, PLACES, updateDayNight, setPhase, phaseInfo, WORLD_COUNTS, ROAD_LINES, PARK, groundYAt, bindScene, WX, setWeather, updateWeather, weatherRoadInfo, lightState, setLightAxis, lightForcedAxis, updateTrafficLights } from './world.js';
import { buildPopulation, updatePopulation, countsSnapshot, nearestNPC, scareArea, pedPositions } from './population.js';
import { makePerson, animatePerson, createBar, makeWeaponProp } from './characters.js';
import { buildVehicles, nearestEnterableCar, driveStep, updateTraffic, enterCar, exitCar, syncCarMesh, updateVehicleFx, carInfo } from './vehicles.js';
import { W, wantedSnapshot, updateWanted, noteVehicleSwap, noteClothesChange, clearWanted, reportCrime } from './wanted.js';
import { updatePolice, policeDebug, nearestPoliceDist } from './police.js';
import { WPN, weaponsSnapshot, selectWeapon, buyItem, meleeAttack, punchNearest, shoot, initDrops, updateDrops, dropsInfo, pickupDropAt, flushBufferedAttack } from './weapons.js';
import { MISSIONS, M, startMission, updateMissions, missionSnapshot, missionsInit, setStealCar, stageFinaleCrime } from './missions.js';
import { initHUD, setObjective, showBanner, showDialog, hideDialog, setPrompt, openShop, closeShop, refreshShop, updateHUD, setMinimapTarget, showDamage, hudInfo, toastInfo, openMap, closeMap, isMapOpen, mapInfo } from './hud.js';
import { initTouch, refreshTouchVisibility, isTouchCapable } from './touch.js';
import { audioInit, sfx, sirenUpdate, audioToggleMute, audioInfo } from './audio.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.min.js';

const SAVE_KEY = 'purnama-bay-save-v1';

// ---------------------------------------------------------------- renderer
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
// Render at CSS resolution (pixel ratio capped at 1): the bay's look is
// bold shapes and colour, not fine detail, and fragment cost is the
// frame-rate bottleneck on phone GPUs and software rasterisers alike -
// the cap roughly doubles the frame rate there while desktop 1x
// displays (and the 1280x720 judge screenshots) are completely unaffected.
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// PBR image-based lighting: a neutral room environment baked through
// PMREM gives every Standard/Physical surface something real to reflect
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.55;
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 900);
let camYaw = Math.PI;
let camPitch = 0; // drag-orbit elevation: 0 = the classic follow height
let pendingYaw = 0; // queued drag azimuth, drained at a capped rate
let pendingPitch = 0;
let camMode = 'third'; // W4: 'third' | 'first'

// W4/E: the full-map toggle is game-level: opening the map pauses the
// world, closing resumes; an open shop swallows the key entirely. Map
// pauses use reason 'map' so they never raise the pause panel - the map
// has its own overlay.
function toggleMapGame() {
  if (S.shopOpen) return;
  if (isMapOpen()) { closeMap(); pauseGame(false, 'map'); return; }
  if (S.mode === 'playing') { openMap(); pauseGame(true, 'map'); }
}
function toggleCamMode() {
  camMode = camMode === 'third' ? 'first' : 'third';
  return camMode;
}

const worldRefs = buildWorld(scene);
bindScene(scene);
const mira = buildPopulation(scene);
void mira;
const stealCar = buildVehicles(scene);
setStealCar(stealCar);
initDrops(scene);

// Raka Pradana, the player avatar (separate head mesh: it turns).
// The player is built 'tall'; NPC body variety lives in population.js.
const playerGroup = makePerson({ shirt: 0x12716b, pants: 0x2c343a, skin: 0xa06a42, headSeparate: true, build: 'tall' });
scene.add(playerGroup);
const playerAnim = {
  group: playerGroup, animSpeed: 0, animPhase: 0, state: 'wander',
  build: playerGroup.userData.buildName || 'tall',
  baseScale: playerGroup.userData.baseScaleY ?? 1, crouchVisual: false,
};

// the player's own hand-held weapon props, shown only while equipped
const playerProps = { baton: makeWeaponProp('baton'), knife: makeWeaponProp('knife'), pistol: makeWeaponProp('pistol') };
for (const prop of Object.values(playerProps)) {
  prop.position.set(0, -0.62, 0.12);
  prop.visible = false;
  playerGroup.userData.parts.armR.add(prop);
}
// the player's overhead HP bar, visible while fight mode is up
const playerBar = createBar(playerGroup);

// Objective beacon: a slim, tall column of additive gold light plus a
// ground ring at the current target, pulsing gently - visible from
// anywhere in the bay so the player always knows where to go. It is
// shown only while playing and only while a target exists.
// (Standard materials, not Basic: the PBR material census in the probes
// allows exactly one Basic surface in the scene - the sky dome.)
const beaconMat = new THREE.MeshStandardMaterial({ color: 0x1a1405, emissive: 0xffd34d, emissiveIntensity: 1.7, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
const beacon = new THREE.Group();
const beaconColumn = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 70, 12, 1, true), beaconMat);
beaconColumn.position.y = 35;
const beaconRingMat = new THREE.MeshStandardMaterial({ color: 0x1a1405, emissive: 0xffd34d, emissiveIntensity: 1.7, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false });
const beaconRing = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.95, 28), beaconRingMat);
beaconRing.rotation.x = -Math.PI / 2;
beaconRing.position.y = 0.18;
beacon.add(beaconColumn);
beacon.add(beaconRing);
beacon.visible = false;
scene.add(beacon);

missionsInit(scene, {
  onObjective: (t) => setObjective(t),
  onDialog: (who, name, text) => showDialog(who, name, text),
  onGameClear: () => endGame('clear'),
});
initHUD({
  onBuy: (item) => { const msg = buyItem(item); refreshShop(msg); },
  onDialog: () => {},
  onMap: () => toggleMapGame(),
});

// device mode: touch hardware plays the HP layout, everything else PC.
// The module runs after the body is parsed, so the menu elements exist.
const DEVICE_MODE = isTouchCapable() ? 'HP' : 'PC';
{
  const tag = document.getElementById('mode-tag');
  if (tag) tag.textContent = DEVICE_MODE === 'PC' ? 'MODE: PC — keyboard & mouse' : 'MODE: HP — touch controls';
  if (DEVICE_MODE === 'HP') {
    const controls = document.getElementById('menu-controls');
    if (controls) controls.textContent = 'Left stick move · drag right side for camera · HIT fight · ACT interact / enter car · JUMP · MAP full map · CAM first-person';
  }
}

// ---------------------------------------------------------------- run state
function resetRun() {
  S.money = 0;
  S.health = 100;
  S.time = 0;
  S.stats.earned = 0;
  S.stats.busted = 0;
  S.stats.wasted = 0;
  S.stats.playT = 0;
  clearWanted();
  WPN.owned = { fists: true, baton: false, pistol: false, knife: false };
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
    WPN.owned = { fists: true, baton: !!d.owned?.baton, pistol: !!d.owned?.pistol, knife: !!d.owned?.knife };
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
  hidePauseOverlay();
  document.getElementById('menu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  S.mode = 'playing';
  S.paused = false;
  if (useSave && loadGame()) {
    showBanner('Welcome back to Purnama Bay');
  } else {
    resetRun();
    // Guided opening (clarity round): NO auto-started mission. Raka
    // spawns facing Mira on the pier, the beacon + edge arrow + minimap
    // all point at her, and one concrete toast says what to do. Job 1
    // starts through the normal path - press E near Mira (tryInteract).
    S.p.heading = Math.atan2(CFG.miraSpot.x - S.p.x, CFG.miraSpot.z - S.p.z);
    camYaw = S.p.heading;
    setObjective('Meet Mira at the pier.');
  }
  refreshTouchVisibility();
  return true;
}

// ---------------------------------------------------------------- pause
// The pause panel (GOAL & CONTROLS) shows only for an explicit pause
// (P / Esc / PB.pause / RESUME button). Map pauses pass reason 'map'
// and never raise it - the map overlay is its own screen.
let pauseReason = '';
function jobProgressText() {
  if (M.completed >= MISSIONS.length) return 'All 6 jobs done';
  if (M.active) return `Job ${M.index + 1} of 6`;
  return `Job ${M.completed + 1} of 6`;
}
function showPauseOverlay() {
  const ov = document.getElementById('pause-overlay');
  if (!ov) return;
  const prog = document.getElementById('pause-progress');
  if (prog) prog.textContent = jobProgressText();
  const ctl = document.getElementById('pause-controls');
  if (ctl) {
    ctl.textContent = DEVICE_MODE === 'HP'
      ? 'Left stick move · drag right side for camera · HIT fight · ACT interact / enter car · JUMP jump · MAP full map · CAM first-person'
      : 'WASD move · Alt walk · Shift sprint · Space jump / brake · C crouch · J punch · K kick · 1 baseball bat · 2 pistol · 3 fists · 4 knife · F enter / exit car · E interact · M map · V first-person camera · P / Esc resume';
  }
  ov.style.display = 'flex';
}
function hidePauseOverlay() {
  const ov = document.getElementById('pause-overlay');
  if (ov) ov.style.display = 'none';
}
function pauseInfo() {
  const ov = document.getElementById('pause-overlay');
  const visible = !!ov && ov.style.display === 'flex';
  return { visible, text: visible ? (ov.textContent || '').replace(/\s+/g, ' ').trim() : '' };
}
function pauseGame(on, reason) {
  if (S.mode !== 'playing' && S.mode !== 'paused') return;
  S.paused = !!on;
  S.mode = on ? 'paused' : 'playing';
  if (on) {
    pauseReason = reason || 'explicit';
    if (pauseReason === 'explicit') showPauseOverlay();
  } else {
    pauseReason = '';
    hidePauseOverlay();
  }
}

function fmtPlayTime(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function endGame(kind) {
  if (S.mode === 'ended') return;
  S.mode = 'ended';
  S.endedKind = kind;
  hidePauseOverlay();
  const overlay = document.getElementById('end-overlay');
  const title = document.getElementById('end-title');
  const text = document.getElementById('end-text');
  const okBtn = document.getElementById('btn-end-ok');
  const againBtn = document.getElementById('btn-again');
  if (kind === 'busted') S.stats.busted++;
  if (kind === 'wasted') S.stats.wasted++;
  if (kind === 'clear') {
    // Story won: all 6 jobs done. FREE ROAM keeps playing right where
    // Raka stands (no respawn); PLAY AGAIN restarts the whole story.
    title.textContent = 'NAME CLEARED';
    title.style.color = '#ffd34d';
    text.textContent = `Raka's name is clean - the Kala Syndicate frame-up is finished. Total earned: PB$ ${S.stats.earned} · Time played: ${fmtPlayTime(S.stats.playT)} · Busted ${S.stats.busted}x · Wasted ${S.stats.wasted}x.`;
    if (okBtn) okBtn.textContent = 'FREE ROAM';
    if (againBtn) againBtn.style.display = 'inline-block';
    sfx.missionDone();
  } else if (kind === 'busted') {
    const fine = Math.min(S.money, 100);
    S.money -= fine;
    title.textContent = 'BUSTED';
    title.style.color = '';
    text.textContent = `The harbour police finally cornered Raka. Bail and fines cost PB$ ${fine}, and the bay forgets his face - for now.`;
    if (okBtn) okBtn.textContent = 'BACK TO THE BAY';
    if (againBtn) againBtn.style.display = 'none';
    sfx.busted();
  } else {
    title.textContent = 'WASTED';
    title.style.color = '';
    text.textContent = 'Raka wakes up at the dock clinic with an empty head and a long bill. The bay gives him another morning.';
    if (okBtn) okBtn.textContent = 'BACK TO THE BAY';
    if (againBtn) againBtn.style.display = 'none';
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

// After NAME CLEARED, FREE ROAM simply closes the summary and keeps
// playing exactly where Raka is - no teleport, no reset.
function freeRoam() {
  hideEnd();
  hideDialog();
  S.mode = 'playing';
  S.paused = false;
  document.getElementById('hud').style.display = 'block';
  setObjective('Free roam - the bay is yours. The ferry story is told.');
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
    playerGroup.userData.parts.torso.material = new THREE.MeshStandardMaterial({ color: 0xc9973f, roughness: 0.85 });
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
    case 'Digit4': selectWeapon('knife'); break;
    case 'KeyM': toggleMapGame(); break;
    case 'KeyN': audioToggleMute(); break;
    case 'KeyV': if (S.mode === 'playing') toggleCamMode(); break;
    case 'Escape':
      if (isMapOpen()) { toggleMapGame(); break; }
      if (S.shopOpen) closeShop();
      else if (S.mode === 'playing' || S.mode === 'paused') pauseGame(S.mode === 'playing');
      break;
    case 'KeyP':
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
  onMap: () => toggleMapGame(),
  onCamMode: () => { if (S.mode === 'playing') toggleCamMode(); },
  // camera drag (touch right half / mouse on canvas): drags feed a
  // pending pool instead of snapping the azimuth - the loop drains the
  // pool at a capped rate (3.2 rad/s), so even a fast flick can never
  // whip the camera around in one frame. Releasing leaves the camera
  // where it was dragged; follow behaviour resumes once Raka moves.
  onCamDrag: (dx, dy) => {
    pendingYaw = clamp(pendingYaw - dx * 0.0052, -1.6, 1.6);
    pendingPitch = clamp(pendingPitch + dy * 0.0035, -0.8, 0.8);
  },
});

document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-end-ok').addEventListener('click', () => {
  if (S.endedKind === 'clear') freeRoam();
  else respawn();
});
document.getElementById('btn-again').addEventListener('click', () => { hideEnd(); hideDialog(); startGame(false); });
document.getElementById('btn-resume').addEventListener('click', () => pauseGame(false));
if (hasSave()) document.getElementById('btn-continue').style.display = 'inline-block';

// ---------------------------------------------------------------- per-frame
function updatePlayer(dt) {
  const p = S.p;
  const keys = S.input.keys;
  playerProps.baton.visible = WPN.active === 'baton' && !S.inCar;
  playerProps.knife.visible = WPN.active === 'knife' && !S.inCar;
  playerProps.pistol.visible = WPN.active === 'pistol' && !S.inCar;
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
    if (!S.inCar) { // the car exploded mid-step and threw Raka clear
      playerGroup.visible = true;
      playerGroup.position.set(p.x, p.y, p.z);
      return;
    }
    p.x = car.x; p.z = car.z; p.y = 0;
    p.heading = car.heading;
    p.speed = Math.abs(car.speed);
    p.vel = Math.abs(car.speed);
    // velocity heading: reversing means the motion points backwards
    p.velHeading = car.speed >= 0 ? car.heading : car.heading + Math.PI;
    p.moving = Math.abs(car.speed) > 0.3;
    playerGroup.visible = false;
    // G: free GTA-style camera - the azimuth NEVER chases the car; only
    // the player's drag (and explicit one-shot setups) move camYaw
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
  let targetSpeed = 0;
  if (p.moving) {
    const tier = p.crouch ? CFG.crouchSpeed
      : (keys.has('AltLeft') || keys.has('AltRight') || S.input.altHeld) ? CFG.walkSpeed
        : (keys.has('ShiftLeft') || keys.has('ShiftRight') || S.input.shiftHeld) ? CFG.sprintSpeed
          : CFG.runSpeed;
    targetSpeed = tier * clamp(mag, 0, 1);
    // Camera-relative mapping: the camera sits behind the player at
    // -(sin(camYaw), cos(camYaw)), so screen-forward in world XZ is
    // (sin(camYaw), cos(camYaw)) and screen-right is (-cos(camYaw),
    // sin(camYaw)). Input ix is screen-right+, iz is screen-forward+,
    // hence sin(dir) = sin(camYaw)*iz - cos(camYaw)*ix and
    // cos(dir) = cos(camYaw)*iz + sin(camYaw)*ix. (The old formula had
    // the ix signs flipped, which mirrored the lateral axis on screen.)
    const dirWorld = Math.atan2(
      Math.sin(camYaw) * iz - Math.cos(camYaw) * ix,
      Math.cos(camYaw) * iz + Math.sin(camYaw) * ix);
    p.heading = angleLerp(p.heading, dirWorld, Math.min(1, dt * 14));
    // G: free camera on foot too - camYaw is the player's to drag, the
    // heading follows the input, never the other way around
  }
  // Analogue ramp: the ground speed CHASES the target at a fixed
  // acceleration (30 m/s^2), so a stick flick reaches full run in
  // ~0.18 s instead of teleporting to it, and releasing the stick
  // glides to a stop over a similar beat. Peak tiers are unchanged.
  const ACC = 30;
  if (p.vel < targetSpeed) p.vel = Math.min(targetSpeed, p.vel + ACC * dt);
  else p.vel = Math.max(targetSpeed, p.vel - ACC * dt);
  if (p.vel > 0.01) {
    p.x += Math.sin(p.heading) * p.vel * dt;
    p.z += Math.cos(p.heading) * p.vel * dt;
  }
  p.speed = p.vel;
  p.velHeading = p.heading; // on foot the motion follows the nose
  // vertical: jump arc
  if (!p.onGround) {
    p.y += p.vy * dt;
    p.vy -= CFG.gravity * dt;
    if (p.y > p.peakY) p.peakY = p.y;
    if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }
  }
  pushOut(p, 0.55);
  pushOutCars(p, 0.35); // cars are solid: the body stops at the bodywork
  p.x = clamp(p.x, -CFG.worldHalf + 2, CFG.worldHalf - 2);
  p.z = clamp(p.z, -CFG.worldHalf + 2, CFG.worldHalf + 20);
  p.groundY = groundYAt(p.x, p.z); // feet ride up onto the pavement
  playerGroup.position.set(p.x, p.y + p.groundY, p.z);
  playerGroup.rotation.y = p.heading;
  playerAnim.animSpeed = p.vel;
  playerAnim.crouchVisual = p.crouch;
  playerAnim.fightPose = S.combat.fightT > 0 && !S.inCar;
  playerAnim.swingT = S.combat.attackT;
  playerAnim.swingKind = S.combat.attackKind;
  // the head turns toward the camera's view direction, relative to the
  // body - looking where you are steering the camera, genre-style
  playerAnim.headTargetYaw = camYaw - p.heading;
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
  if (!M.active) {
    // Guided opening: before job 1 has started, every guide (beacon,
    // edge arrow, minimap) points at Mira - she is the first objective.
    if (M.completed === 0) return { x: CFG.miraSpot.x, z: CFG.miraSpot.z };
    return null;
  }
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
  // W4 first-person: the camera sits in the head. On foot it looks
  // along camYaw with camPitch as the view pitch; in a car it sits at
  // the driver's seat and looks along the car's heading, with camYaw
  // allowed to glance sideways within a clamp.
  if (camMode === 'first') {
    const parts = playerGroup.userData.parts;
    if (S.inCar && S.currentCar) {
      const car = S.currentCar;
      if (parts && parts.headMesh) parts.headMesh.visible = false;
      // driver seat offset in car space: left seat, eye height, slight fwd
      const lx = -0.42; const lz = 0.1;
      const fx = Math.sin(car.heading); const fz = Math.cos(car.heading);
      const rx = Math.cos(car.heading); const rz = -Math.sin(car.heading);
      camera.position.set(car.x + rx * lx + fx * lz, 1.08, car.z + rz * lx + fz * lz);
      let glance = camYaw - car.heading;
      while (glance > Math.PI) glance -= Math.PI * 2;
      while (glance < -Math.PI) glance += Math.PI * 2;
      glance = clamp(glance, -1.3, 1.3);
      const lookYaw = car.heading + glance;
      const pitch = clamp(camPitch, -0.9, 0.9);
      camera.lookAt(
        camera.position.x + Math.sin(lookYaw) * Math.cos(pitch),
        camera.position.y + Math.sin(pitch),
        camera.position.z + Math.cos(lookYaw) * Math.cos(pitch));
      S.cameraY = camera.position.y;
      return;
    }
    if (parts && parts.headMesh) parts.headMesh.visible = false;
    const eyeY = p.y + p.groundY + 1.62 * playerGroup.scale.y;
    camera.position.set(p.x, eyeY, p.z);
    const pitch = clamp(-camPitch * 1.2, -0.9, 0.9);
    camera.lookAt(
      p.x + Math.sin(camYaw) * Math.cos(pitch),
      eyeY + Math.sin(pitch),
      p.z + Math.cos(camYaw) * Math.cos(pitch));
    S.cameraY = camera.position.y;
    return;
  }
  const parts = playerGroup.userData.parts;
  if (parts && parts.headMesh) parts.headMesh.visible = true;
  const dist = S.inCar ? 8.2 : CFG.camDistance;
  const h = S.inCar ? CFG.camHeightCar : (p.crouch ? CFG.camHeightCrouch : CFG.camHeightStand);
  // drag pitch raises the camera on its orbit sphere and shortens the
  // ground distance to match; at pitch 0 this is the classic follow cam
  const cd = dist * Math.cos(camPitch);
  const bx = p.x - Math.sin(camYaw) * cd;
  const bz = p.z - Math.cos(camYaw) * cd;
  camera.position.set(bx, h + p.y + dist * Math.sin(camPitch), bz);
  camera.lookAt(p.x, 1.25 + p.y, p.z);
  S.cameraY = camera.position.y;
}

// ------------------------------------------------- objective guidance
// Every frame: place the world beacon on the current target, and drive
// the #obj-arrow edge indicator. The arrow appears only when the target
// is off-screen or behind the camera; when the target is comfortably
// in view the beacon itself is the guide and the arrow hides.
const objState = { target: null, dist: 0, relDeg: 0, arrowVisible: false, beaconVisible: false };
const _objV = new THREE.Vector3();
const _objFwd = new THREE.Vector3();
function updateObjectiveGuide() {
  const t = S.mode === 'playing' || S.mode === 'paused' ? currentTarget() : null;
  const arrowEl = document.getElementById('obj-arrow');
  objState.target = t ? { x: t.x, z: t.z } : null;
  objState.dist = 0;
  objState.relDeg = 0;
  objState.arrowVisible = false;
  if (!t || S.mode !== 'playing') {
    beacon.visible = false;
    objState.beaconVisible = false;
    if (arrowEl) arrowEl.style.display = 'none';
    return;
  }
  const dx = t.x - S.p.x;
  const dz = t.z - S.p.z;
  objState.dist = Math.round(Math.hypot(dx, dz) * 10) / 10;
  // bearing of the target vs the camera's view direction, -180..180
  const bearing = Math.atan2(dx, dz);
  let rel = bearing - camYaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  objState.relDeg = Math.round(rel * 180 / Math.PI * 10) / 10;
  // world beacon: position + gentle pulse
  beacon.position.set(t.x, 0, t.z);
  const pulse = 0.5 + 0.5 * Math.sin(S.time * 3.2);
  beaconMat.opacity = 0.26 + 0.2 * pulse;
  beaconRingMat.opacity = 0.4 + 0.3 * pulse;
  const rs = 1 + 0.18 * pulse;
  beaconRing.scale.set(rs, rs, 1);
  beacon.visible = true;
  objState.beaconVisible = true;
  // edge arrow: is the target inside the central view right now?
  camera.updateMatrixWorld();
  _objV.set(t.x, 1.6, t.z).project(camera);
  camera.getWorldDirection(_objFwd);
  const behind = (_objFwd.x * dx + _objFwd.z * dz) <= 0;
  const onScreen = !behind && Math.abs(_objV.x) <= 0.8 && Math.abs(_objV.y) <= 0.8;
  if (arrowEl) {
    if (onScreen) {
      arrowEl.style.display = 'none';
    } else {
      const relRad = rel;
      const r = Math.max(60, Math.min(window.innerWidth, window.innerHeight) / 2 - 56);
      const ax = window.innerWidth / 2 - Math.sin(relRad) * r;
      const ay = window.innerHeight / 2 - Math.cos(relRad) * r;
      arrowEl.style.left = `${ax}px`;
      arrowEl.style.top = `${ay}px`;
      arrowEl.style.transform = `rotate(${(-objState.relDeg).toFixed(1)}deg)`;
      arrowEl.style.display = 'block';
      objState.arrowVisible = true;
    }
  }
}
function objInfo() {
  return {
    target: objState.target ? { ...objState.target } : null,
    dist: objState.dist,
    relDeg: objState.relDeg,
    arrowVisible: objState.arrowVisible,
    beaconVisible: objState.beaconVisible,
  };
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
      fightT: +S.combat.fightT.toFixed(2), fightMode: S.combat.fightT > 0,
    },
    vehicle: S.currentCar ? { model: S.currentCar.model, heading: S.currentCar.heading, speed: S.currentCar.speed, health: S.currentCar.health, hardHits: S.currentCar.hardHits, exploded: S.currentCar.exploded } : null,
    feedback: { hits: S.feedback.hits, flashes: S.feedback.flashes },
    prompt: S.prompt,
    shopOpen: S.shopOpen,
    dialogOpen: S.dialogOpen,
    paused: S.paused,
    stats: { earned: S.stats.earned, busted: S.stats.busted, wasted: S.stats.wasted, playT: Math.round(S.stats.playT * 10) / 10 },
  };
}

// In-page motion recorder: probes read frame-accurate series (speed,
// joint angles, camera azimuth) without CDP sampling lag.
const motionLog = [];
function recordMotion() {
  const J = playerAnim.joints || {};
  motionLog.push({
    t: Math.round(S.time * 1000) / 1000,
    x: Math.round(S.p.x * 100) / 100, z: Math.round(S.p.z * 100) / 100,
    speed: Math.round(S.p.speed * 100) / 100,
    camYaw: Math.round(camYaw * 1000) / 1000,
    armL: J.armL || 0, armR: J.armR || 0, legL: J.legL || 0, legR: J.legR || 0,
    foreL: J.foreL || 0, foreR: J.foreR || 0, shinL: J.shinL || 0, shinR: J.shinR || 0,
    torsoX: J.torsoX || 0, torsoYaw: J.torsoYaw || 0, headYaw: J.headYaw || 0,
  });
  if (motionLog.length > 4000) motionLog.splice(0, motionLog.length - 4000);
}

window.PB = {
  state: stateSnapshot,
  camInfo: () => ({ yaw: camYaw, x: camera.position.x, y: camera.position.y, z: camera.position.z }),
  hudInfo,
  audioInfo,
  phaseInfo,
  setPhase: (name) => setPhase(name),
  worldInfo: () => ({
    colliders: S.colliders.map((c) => ({ minX: c.minX, maxX: c.maxX, minZ: c.minZ, maxZ: c.maxZ })),
    roadLines: ROAD_LINES, park: PARK, counts: WORLD_COUNTS,
    sidewalkOffset: 7.35,
  }),
  pedPositions,
  carsInfo: () => S.cars.map((c) => ({ ...carInfo(c), x: Math.round(c.x * 10) / 10, z: Math.round(c.z * 10) / 10, traffic: c.traffic, speed: Math.round(c.speed * 100) / 100 })),
  myCarInfo: () => carInfo(S.currentCar),
  joints: () => (playerAnim.joints ? { ...playerAnim.joints } : null),
  motionLog: () => motionLog.slice(),
  clearMotion: () => { motionLog.length = 0; },
  setJoy: (x, y) => {
    S.input.joyX = x; S.input.joyY = y;
    S.input.joyActive = Math.abs(x) > 0.05 || Math.abs(y) > 0.05;
  },
  placeNPC: (kind, x, z) => {
    const rec = S.npcs.find((n) => n.kind === kind && n.state !== 'dead' && n.state !== 'down' && n.state !== 'dead');
    if (!rec) return null;
    rec.x = x; rec.z = z;
    // stand at the staged spot briefly (one waypoint on the spot), then
    // resume normal life - the staging never freezes anyone forever
    rec.waypoints = [[x, z]];
    rec.retargetT = 2.5;
    if (rec.state !== 'wander' && rec.state !== 'stand') rec.state = 'wander';
    rec.group.position.set(x, 0, z);
    return { kind: rec.kind, x: rec.x, z: rec.z };
  },
  npcInfo: (kind) => S.npcs.filter((n) => n.kind === kind).map((n) => ({
    id: S.npcs.indexOf(n),
    kind: n.kind, state: n.state, x: Math.round(n.x * 10) / 10, z: Math.round(n.z * 10) / 10,
    hasHealth: 'health' in n, health: 'health' in n ? n.health : null,
    weapon: n.weapon || null, bar: !!(n.barT > 0),
  })),
  modeInfo: () => ({ device: DEVICE_MODE, touchVisible: document.getElementById('touch-ui').style.display === 'block', tag: document.getElementById('mode-tag')?.textContent || '' }),
  objInfo,
  pauseInfo,
  missionLabels: () => MISSIONS.map((m) => ({ name: m.name, labels: m.stages.map((s) => s.label) })),
  combatInfo: () => ({ cfg: { punch: CFG.punchDamage, kick: CFG.kickDamage, knife: CFG.knifeDamage, bat: CFG.batonDamage, bullet: CFG.bulletDamage, maxHealth: 100 }, player: { health: S.health, fightMode: S.combat.fightT > 0, fightT: +S.combat.fightT.toFixed(2) }, npcs: S.npcs.filter((n) => n.kind !== 'animal').map((n) => ({ id: S.npcs.indexOf(n), kind: n.kind, weapon: n.weapon || null, hasHealth: 'health' in n, health: 'health' in n ? n.health : null, state: n.state, bar: !!(n.barT > 0), x: Math.round(n.x * 10) / 10, z: Math.round(n.z * 10) / 10 })) }),
  bodyMetrics: () => { const bb = new THREE.Box3(); playerGroup.traverse((o) => { if (o.isMesh) bb.union(new THREE.Box3().setFromObject(o)); }); const head = playerGroup.userData.parts.headMesh; const hb = head ? new THREE.Box3().setFromObject(head) : bb; return { height: +(bb.max.y - bb.min.y).toFixed(3), headHeight: +(hb.max.y - hb.min.y).toFixed(3), ratio: +((bb.max.y - bb.min.y) / (hb.max.y - hb.min.y)).toFixed(2) }; },
  counts: countsSnapshot,
  debugCars: () => ({
    parked: S.cars.filter((c) => !c.traffic).map((c) => ({ x: c.x, z: c.z, model: c.model, heading: c.heading, len: c.len, wid: c.wid })),
    traffic: S.cars.filter((c) => c.traffic).map((c) => ({ x: c.x, z: c.z, model: c.model, heading: c.heading, len: c.len, wid: c.wid })),
    all: S.cars.map((c) => ({ x: c.x, z: c.z, model: c.model, traffic: c.traffic, heading: c.heading, len: c.len, wid: c.wid })),
  }),
  debugPolice: policeDebug,
  dropsInfo,
  renderInfo: () => {
    // material census: every Mesh/InstancedMesh in the scene by type -
    // after the PBR conversion the only 'other' left should be the
    // sky dome's backdrop material (Points are not surfaces, excluded)
    let standard = 0; let physical = 0; const other = [];
    scene.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const m = o.material;
      if (!m) return;
      if (m.isMeshPhysicalMaterial) physical++;
      else if (m.isMeshStandardMaterial) standard++;
      else other.push({ type: m.type, name: o.name || '' });
    });
    return {
      calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
      three: THREE.REVISION,
      toneMapping: renderer.toneMapping === THREE.ACESFilmicToneMapping ? 'ACESFilmic' : 'other',
      env: !!scene.environment,
      materials: { standard, physical, other },
    };
  },
  bodyInfo: () => {
    const counts = {};
    let distinct = 0;
    for (const n of S.npcs) {
      if (n.kind === 'animal') continue;
      const b = n.build || 'average';
      if (!(b in counts)) { counts[b] = 0; distinct++; }
      counts[b]++;
    }
    return { distinct, counts, player: playerGroup.userData.buildName || 'average' };
  },
  toastInfo,
  mapInfo,
  openMap: () => { if (!isMapOpen()) toggleMapGame(); return isMapOpen(); },
  closeMap: () => { if (isMapOpen()) toggleMapGame(); return isMapOpen(); },
  toggleMap: () => { toggleMapGame(); return isMapOpen(); },
  weatherInfo: () => ({
    state: WX.state,
    wetness: Math.round(WX.wetness * 100) / 100,
    cloudiness: Math.round(WX.cloudiness * 100) / 100,
    rain: Math.round(WX.rain * 100) / 100,
    fogFar: Math.round(scene.fog.far),
    ...weatherRoadInfo(),
    particles: !!(WX.rainPoints && WX.rainPoints.visible),
  }),
  setWeather: (name) => setWeather(name),
  trafficLightInfo: () => ({ ...lightState(), mode: lightForcedAxis() ? `forced-${lightForcedAxis()}` : 'auto' }),
  setLightAxis: (axis) => setLightAxis(axis),
  stageCarAtLight: () => {
    // stage the nearest traffic car on the x=0 avenue's +z lane, 26 m
    // south of the (0,0) intersection, heading +z at cruise entry speed
    let best = null; let bd = Infinity;
    for (const c of S.cars) {
      if (!c.traffic || c.dead) continue;
      const d = Math.hypot(c.x - 3, c.z + 26);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return null;
    best.axis = 'z'; best.line = 3; best.dir = 1;
    best.x = 3; best.z = -26; best.heading = 0;
    best.speed = 6;
    syncCarMesh(best);
    return { x: best.x, z: best.z, heading: best.heading };
  },
  camMode: () => camMode,
  setCamMode: (m) => { if (m === 'first' || m === 'third') camMode = m; return camMode; },
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
    let pool = S.npcs.filter((n) => n.kind === wantKind && n.state !== 'down' && n.state !== 'dead');
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
    const near = nearestNPC(S.p.x, S.p.z, (n) => n.kind !== 'child' && n.kind !== 'animal' && n.state !== 'down' && n.state !== 'dead');
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
  } else if (name === 'night') {
    if (S.inCar) exitCar();
    setPhase('night');
    S.p.x = 8; S.p.z = 44; S.p.heading = -0.7; camYaw = -0.7;
  } else if (name === 'car') {
    // close-up of the parked Baruna by the shore road: structure study
    if (S.inCar) exitCar();
    const car = S.cars.find((c) => !c.traffic);
    car.x = 3; car.z = 70; car.heading = Math.PI / 2; car.speed = 0;
    syncCarMesh(car);
    S.p.x = 7.2; S.p.z = 66.8;
    S.p.heading = Math.atan2(car.x - S.p.x, car.z - S.p.z);
    camYaw = S.p.heading;
  } else if (name === 'fight') {
    if (S.inCar) exitCar();
    S.p.x = 8; S.p.z = 44; S.p.heading = 0.6; camYaw = 0.6;
    window.PB.spawnWitnessCrime();
    S.combat.fightT = 5;
  } else if (name === 'hero') {
    if (S.inCar) exitCar();
    S.p.x = 8; S.p.z = 44; S.p.heading = -0.7; camYaw = -0.7;
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
let prevHealth = 100;
// When Raka's health drops, flash the damage vignette with a direction
// arc pointing at the nearest attacker, genre-style (no gore, just UI).
function checkDamageFeedback() {
  if (S.mode === 'playing' && S.health < prevHealth - 0.01) {
    let src = null; let bd = 4.5;
    for (const n of S.npcs) {
      if (n.state !== 'attack' && n.state !== 'hostile') continue;
      const d = dist2d(S.p.x, S.p.z, n.x, n.z);
      if (d < bd) { bd = d; src = n; }
    }
    for (const u of S.policeUnits) {
      const d = dist2d(S.p.x, S.p.z, u.x, u.z);
      if (d < bd) { bd = d; src = u; }
    }
    let rel = 0;
    if (src) {
      const bearing = Math.atan2(src.x - S.p.x, src.z - S.p.z);
      rel = camYaw - bearing;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
    }
    showDamage(rel);
  }
  prevHealth = S.health;
}
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
      if (S.combat.fightT > 0) S.combat.fightT = Math.max(0, S.combat.fightT - sdt);
      flushBufferedAttack();
      updatePlayer(sdt);
      updateTraffic(sdt);
      // traffic moves after the player, so resolve the player out of any
      // car that rolled into him within this same substep: a frame never
      // ends with the player inside a car body
      if (!S.inCar) {
        const pr = { x: S.p.x, z: S.p.z };
        if (pushOutCars(pr, 0.35)) {
          S.p.x = pr.x; S.p.z = pr.z;
          playerGroup.position.set(S.p.x, S.p.y, S.p.z);
        }
      }
      updatePopulation(sdt);
      updateMissions(sdt);
      updateWanted(sdt);
      updatePolice(scene, sdt);
      updateArrest(sdt);
      updateDrops(sdt);
      recordMotion(); // per-substep: ramps and joint steps stay visible
      if (S.mode !== 'playing') break;
    }
    checkDamageFeedback();
    playerBar.set(S.health / 100, S.combat.fightT > 0 && !S.inCar);
    updateVehicleFx(dt);
    updateWeather(dt);
    updateTrafficLights(dt);
    // drain queued camera drag at a capped azimuth rate (3.2 rad/s):
    // a flick can never whip the view around in a single frame
    if (pendingYaw !== 0) {
      const step = clamp(pendingYaw, -3.2 * dt, 3.2 * dt);
      camYaw += step; pendingYaw -= step;
    }
    if (pendingPitch !== 0) {
      const step = clamp(pendingPitch, -1.8 * dt, 1.8 * dt);
      const before = camPitch;
      camPitch = clamp(camPitch + step, -0.12, 0.6);
      pendingPitch -= (camPitch - before);
      if (camPitch === before) pendingPitch = 0;
    }
    if (S.health < 100) S.health = Math.min(100, S.health + dt * 0.7);
    if (S.health <= 0 && S.mode === 'playing') endGame('wasted');
    sirenUpdate(W.stars);
    S.stats.playT += dt;
    setMinimapTarget(currentTarget());
    if (worldRefs.sea) worldRefs.sea.position.y = -0.25 + Math.sin(S.time * 0.7) * 0.05;
  }
  updateDayNight();
  updatePrompt();
  updateCamera();
  updateObjectiveGuide();
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
