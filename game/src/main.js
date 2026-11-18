// PURNAMA BAY — main orchestration: boot, input, the player (on foot and in
// cars), camera, combat calls, the crime/witness pipeline, mission hooks,
// save/load, the debug hook (window.PB) and the one game loop.
import * as THREE from '../vendor/three.module.min.js';
import { CFG, PLACES } from './config.js';
import { createAudio } from './audio.js';
import { buildWorld } from './world.js';
import { createHuman, poseHuman, attachWeaponProp } from './characters.js';
import { createCar, stepVehicle, trafficInput, applyImpact, refreshDamageVisual, updateCarCosmetics } from './vehicles.js';
import { createPopulation, knockDown, standUp, witnessesAt, nearestTarget } from './population.js';
import { createWanted } from './wanted.js';
import { createPolice } from './police.js';
import { createWeapons, buyItem, createDrops, meleeTarget, rayHit, damageFor, cooldownFor, rangeFor } from './weapons.js';
import { createMissionRunner, MISSION_DEFS } from './missions.js';
import { createHUD } from './hud.js';
import { createTouch } from './touch.js';

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
// PCFSoft on real GPUs; plain PCF when software rendering (SwiftShader) is
// detected, where the soft kernel costs more than the whole rest of the frame.
{
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || '') : '';
  renderer.shadowMap.type = /swiftshader|software|llvmpipe/i.test(rendererName) ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.getElementById('game-holder').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf7b267);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 600);
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const audio = createAudio();
const world = buildWorld(scene);
const population = createPopulation(scene, world);
const wanted = createWanted(() => {});
const police = createPolice(scene, world, audio);
const weaponsInv = createWeapons();
const drops = createDrops(scene);

// ---------- cars ----------
const trafficCars = [], parkedCars = [];
const TRAFFIC_TYPES = ['pijar', 'baruna', 'tangguh', 'pijar', 'baruna', 'gelora', 'pijar'];
for (let i = 0; i < CFG.trafficCars; i++) {
  const car = createCar(TRAFFIC_TYPES[i], { driver: 'npc' });
  car.wp = i % 4;
  const wp = [{ x: -63, z: -63 }, { x: 57, z: -63 }, { x: 57, z: 37 }, { x: -63, z: 37 }][car.wp];
  car.pos.set(wp.x + (i * 13) % 30 - 15, 0, wp.z + (i * 7) % 16 - 8);
  car.heading = i * 1.3;
  // a driver sits inside (dark glass hides the figure, but the car is
  // occupied — that is exactly why traffic cars never offer an ENTER prompt)
  const driver = createHuman({ skin: 0xc68863, shirt: 0x777777, pants: 0x333333, scale: 0.95 });
  driver.position.set(0, 0.32, -0.1);
  poseHuman(driver, { mode: 'drive', moving: false, speed01: 0, phase: 0, time: 0 }, 0);
  driver.visible = false; // behind tinted glass; skipped by the renderer
  car.group.add(driver);
  scene.add(car.group);
  trafficCars.push(car);
}
const PARK_SPOTS = [
  { type: 'pijar', x: -2, z: 74, h: Math.PI / 2, legal: true },   // Raka's borrowed runabout (mission 1)
  { type: 'baruna', x: 8, z: 74, h: Math.PI / 2 },
  { type: 'tangguh', x: -52, z: 84, h: 0 },
  { type: 'pijar', x: 44, z: 34, h: -Math.PI / 2 },
  { type: 'baruna', x: -44, z: -16, h: Math.PI / 2 },
  { type: 'gelora', x: 12, z: -64, h: 0 },
  { type: 'pijar', x: 66, z: 46, h: Math.PI },
  { type: 'tangguh', x: -66, z: -56, h: 0.4 },
];
for (const s of PARK_SPOTS) {
  const car = createCar(s.type, { x: s.x, z: s.z, heading: s.h, driver: null });
  car.legal = !!s.legal;
  scene.add(car.group);
  parkedCars.push(car);
}
let stealCar = null, chaseCar = null, chaseStoppedFor = 0;

// ---------- player ----------
const playerGroup = createHuman({ skin: 0xa0663a, hair: 0x14100c, shirt: 0xd8543c, pants: 0x243447, shoe: 0xeeeeee, scale: 0.98 });
scene.add(playerGroup);
const SHIRT_CYCLE = [0xd8543c, 0x2e86ab, 0x5f8f5a, 0xf2b134, 0x8e44ad, 0xecf0f1];
let shirtIdx = 0;
const S = {
  mode: 'menu', // menu | playing | paused | ended
  money: 0, health: CFG.playerHealth,
  pos: playerGroup.position,
  heading: Math.PI, vy: 0, groundY: 0, coyote: 0, jumpBuf: 0,
  crouch: false, speedNow: 0, moving: false, still: true,
  phase: 0, attackT: 0, attackKind: 'punch', attackCd: 0, hitStop: 0,
  inCar: null, seenByPolice: false, panic: null, panicT: 0,
  time: 0, camYaw: Math.PI, camPitch: 0.32, shake: 0,
  shopOpen: false, escapeQueue: [], stepSndT: 0, savedOnce: false,
};
S.pos.set(CFG.spawn.x, 0, CFG.spawn.z);
function groundHeightAt(x, z) {
  if (x > -47 && x < -13 && z > 93 && z < 123) return 0.7; // the pier deck
  return 0;
}

// ---------- input ----------
const keys = {};
let mouseDown = false, lastMouse = null, clickQueued = false;
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  audio.unlock();
  if (S.mode === 'playing') {
    if (e.code === 'Space') { S.jumpBuf = CFG.jumpBuffer; e.preventDefault(); }
    if (e.code === 'KeyC') toggleCrouch();
    if (e.code === 'KeyJ') doMelee('punch');
    if (e.code === 'KeyK') doMelee('kick');
    if (e.code === 'KeyF') toggleCar();
    if (e.code === 'KeyE') doInteract();
    if (e.code === 'KeyQ') cycleWeapon();
    if (e.code === 'Digit1') selectWeapon('baton');
    if (e.code === 'Digit2') selectWeapon('pistol');
    if (e.code === 'Digit3') selectWeapon('fists');
    if (e.code === 'KeyM') { audio.setMuted(!audio.isMuted()); hud.showToast(audio.isMuted() ? 'Sound muted' : 'Sound on'); }
    if (e.code === 'KeyP' || e.code === 'Escape') pauseGame(true);
  } else if (S.mode === 'paused' && (e.code === 'KeyP' || e.code === 'Escape')) pauseGame(false);
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
renderer.domElement.addEventListener('mousedown', (e) => {
  audio.unlock();
  mouseDown = true; lastMouse = { x: e.clientX, y: e.clientY };
  if (S.mode === 'playing' && !hud.dialogOpen() && !S.shopOpen) clickQueued = true;
  if (hud.dialogOpen()) hud.advanceDialog();
});
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('mousemove', (e) => {
  if (!mouseDown || !lastMouse) return;
  const dx = e.clientX - lastMouse.x, dy = e.clientY - lastMouse.y;
  lastMouse = { x: e.clientX, y: e.clientY };
  S.camYaw -= dx * 0.0052;
  S.camPitch = Math.max(0.04, Math.min(1.15, S.camPitch + dy * 0.004));
});
function cycleWeapon() {
  const before = weaponsInv.active;
  const now = weaponsInv.cycle();
  attachWeaponProp(playerGroup, now === 'fists' ? null : now);
  if (now !== before) { audio.dialog(); hud.showToast(`Weapon: ${now.toUpperCase()}`); }
}
function selectWeapon(id) {
  if (weaponsInv.select(id)) {
    attachWeaponProp(playerGroup, id === 'fists' ? null : id);
    audio.dialog();
  } else hud.showToast(`${id.toUpperCase()} is locked — buy it at ${PLACES.shopName} or loot it.`);
}
function toggleCrouch() {
  S.crouch = !S.crouch;
  hud.showToast(S.crouch ? 'Crouching — quieter, harder to spot' : 'Standing', 1.2);
}

// ---------- HUD & touch ----------
const hud = createHUD({
  onBuy(item) {
    const res = buyItem(item, weaponsInv, spendMoney);
    if (res.ok) { audio.buy(); attachWeaponProp(playerGroup, weaponsInv.active === 'fists' ? null : weaponsInv.active); }
    else audio.denied();
    hud.refreshShopBalance(S.money);
    return res;
  },
  onShopClose() { closeShop(); },
  onDialogLine() { audio.dialog(); },
});
const touch = createTouch({
  onAnyTouch() { audio.unlock(); },
  onCameraDrag(dx, dy) { S.camYaw -= dx * 0.006; S.camPitch = Math.max(0.04, Math.min(1.15, S.camPitch + dy * 0.005)); },
  onAct() { if (hud.dialogOpen()) hud.advanceDialog(); else { doInteract(); if (!S.inCar && !nearInteractable()) toggleCar(); else if (S.inCar) toggleCar(); } },
  onJump() { S.jumpBuf = CFG.jumpBuffer; },
  onCrouch() { toggleCrouch(); },
  onKick() { doMelee('kick'); },
  onAttack() { if (weaponsInv.active === 'pistol') doShoot(); else doMelee('punch'); },
  onWeapon() { cycleWeapon(); },
  onPause() { if (S.mode === 'playing') pauseGame(true); },
});
// The ONLY money-out besides the busted fine: the shop till.
function spendMoney(amount) {
  if (S.money < amount) return false;
  S.money -= amount;
  return true;
}

// ---------- the crime pipeline (single door into wanted) ----------
function crimeEvent(kind, x, z, opts = {}) {
  const civ = witnessesAt(population.people, x, z, CFG.witnessRadius).length;
  let policeWit = !!opts.policeWitness;
  if (!policeWit) {
    for (const u of police.units) {
      if (Math.hypot(u.pos.x - x, u.pos.z - z) < CFG.policeWitnessRadius) { policeWit = true; break; }
    }
  }
  const res = wanted.reportCrime({ x, z, civilianWitnesses: civ, policeWitness: policeWit, inVehicle: !!S.inCar });
  if (kind === 'assault' || kind === 'shooting' || kind === 'reckless') {
    S.panic = { x, z, r: 16 }; S.panicT = 2.5;
  }
  if (res.raised) { audio.radioBlip(); hud.showToast(`WANTED ★ ${wanted.stars} — ${policeWit ? 'police saw it' : 'a witness called it in'}`, 2); }
  return res;
}
// Probe + mission 6 use this: a real crime through the exact gameplay path,
// with a witness staged the way a busy street would provide one.
function spawnWitnessCrime() {
  let witness = nearestTarget(population.people, S.pos.x, S.pos.z, 999, ['citizen', 'dockworker', 'shopkeeper']);
  if (witness && Math.hypot(witness.pos.x - S.pos.x, witness.pos.z - S.pos.z) > 2) {
    // stage the witness at arm's length, the way a crowded street would:
    // close enough to be punched through the real melee path, well inside
    // the witness radius the wanted model uses.
    witness.pos.x = S.pos.x + 1.6; witness.pos.z = S.pos.z + 0.4;
    witness.group.position.copy(witness.pos);
  }
  if (!witness) return { raised: false, error: 'no witness available' };
  S.heading = Math.atan2(witness.pos.x - S.pos.x, witness.pos.z - S.pos.z);
  const before = wanted.stars;
  const diag = { cd: Math.round(S.attackCd * 100) / 100, dlg: hud.dialogOpen(), mode: S.mode, dist: Math.round(Math.hypot(witness.pos.x - S.pos.x, witness.pos.z - S.pos.z) * 10) / 10 };
  doMelee('punch');
  return { raised: wanted.stars > before, stars: wanted.stars, witness: witness.kind, ...diag };
}

// ---------- combat ----------
function doMelee(kind) {
  if (S.mode !== 'playing' || S.inCar || hud.dialogOpen()) return;
  if (S.attackCd > 0) { S.atkBuf = { kind, t: 0.7 }; return; } // buffered (window > longest cooldown), fires the moment the swing recovers
  S.attackCd = cooldownFor(kind, weaponsInv);
  S.attackKind = weaponsInv.active === 'baton' && kind === 'punch' ? 'baton' : kind;
  S.attackT = 0.3;
  S.lastAttack = { kind: S.attackKind, at: S.time };
  audio.swing();
  const range = rangeFor(kind, weaponsInv);
  const hit = meleeTarget(population.people, police.units, S.pos.x, S.pos.z, S.heading, range);
  if (!hit) return;
  const dmg = damageFor(kind, weaponsInv);
  S.hitStop = CFG.hitStopTime;
  audio.hit();
  hud.flashHitmarker();
  if (hit.kind === 'officer') {
    damageOfficer(hit.ref, dmg);
    crimeEvent('assault', S.pos.x, S.pos.z, { policeWitness: true });
    return;
  }
  const p = hit.ref;
  damagePerson(p, dmg, kind);
  if (p.kind !== 'thug' || !p.hostile) crimeEvent('assault', S.pos.x, S.pos.z);
}
function damagePerson(p, dmg, kind) {
  if (p.kind === 'child') return; // hard rule: children can never be damaged
  p.health -= dmg;
  // knockback for adults only
  const dx = p.pos.x - S.pos.x, dz = p.pos.z - S.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  p.pos.x += (dx / d) * 0.5; p.pos.z += (dz / d) * 0.5;
  if (p.kind === 'thug') p.hostile = true;
  if (p.health <= 0 && p.state !== 'down') {
    knockDown(p, 9999);
    audio.hurt();
    if (p.weapon) {
      drops.spawn(p.pos.x, p.pos.z, p.weapon, p.weapon === 'pistol' ? 12 : 0);
      p.weapon = null;
      hud.showToast('Weapon dropped! Walk to the gold ring and press E / ACT to take it.', 3.4);
    } else hud.showToast('Knocked out cold.', 1.4);
  } else if (p.kind !== 'thug') {
    p.state = 'flee'; p.fleeFrom = { x: S.pos.x, z: S.pos.z };
  }
  void kind;
}
function damageOfficer(u, dmg) {
  u.hp = (u.hp ?? 60) - dmg;
  hud.showToast('You hit a police officer!', 1.6);
  if (u.hp <= 0) {
    // officer down: removed from the response (no gore, just out of action)
    u.pos.x = 9999; u.group.position.set(9999, -10, 9999);
    u.status = 'DOWN';
    u.downForever = true;
  }
}
const muzzle = new THREE.PointLight(0xffc46b, 0, 18);
scene.add(muzzle);
const flashPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
scene.add(flashPlane);
let flashT = 0;
function doShoot() {
  if (S.mode !== 'playing' || S.inCar || S.attackCd > 0) return;
  if (weaponsInv.active !== 'pistol') { doMelee('punch'); return; }
  S.attackCd = CFG.pistolCooldown;
  if (weaponsInv.ammo <= 0) { audio.dryFire(); hud.showToast('Out of ammo — buy rounds at PURNAMA ARMS.', 2); return; }
  weaponsInv.ammo--;
  audio.shot();
  S.hitStop = 0.02;
  S.camPitch = Math.max(0.04, S.camPitch - 0.018); // recoil kick
  S.shake = Math.max(S.shake, 0.12);
  const origin = camera.position.clone();
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  flashT = 0.05;
  muzzle.position.copy(S.pos).y += 1.45;
  muzzle.position.add(dir.clone().multiplyScalar(1.1));
  muzzle.intensity = 26;
  flashPlane.position.copy(muzzle.position);
  flashPlane.lookAt(camera.position);
  flashPlane.material.opacity = 0.95;
  const allCars = [...trafficCars, ...parkedCars, ...(stealCar ? [stealCar] : []), ...(chaseCar ? [chaseCar] : [])];
  const hit = rayHit(origin, dir, population.people, police.units, allCars, world.colliders);
  crimeEvent('shooting', S.pos.x, S.pos.z);
  if (!hit) return;
  hud.flashHitmarker();
  audio.hit();
  if (hit.kind === 'person') {
    damagePerson(hit.ref, CFG.pistolDamage, 'shot');
    if (hit.ref.kind === 'thug') hit.ref.hostile = true;
  } else if (hit.kind === 'officer') {
    damageOfficer(hit.ref, CFG.pistolDamage);
  } else if (hit.kind === 'car') {
    hit.ref.health = Math.max(0, hit.ref.health - CFG.pistolDamage * 0.55);
    refreshDamageVisual(hit.ref);
    if (hit.ref.health <= 0) hit.ref.dead = true;
  }
}
function hurtPlayer(dmg) {
  if (S.mode !== 'playing') return;
  S.health -= dmg;
  hud.damageFlash();
  audio.hurt();
  if (S.health <= 0) wasted();
}
function busted() {
  if (S.mode !== 'playing') return;
  const fine = Math.min(S.money, CFG.bustedBaseFine + wanted.stars * CFG.bustedPerStar);
  S.money -= fine; // the busted fine: the only other money-out
  wanted.clearAll();
  police.reset();
  audio.busted();
  audio.siren(false);
  exitCar(true);
  S.pos.set(CFG.spawn.x, 0, CFG.spawn.z);
  S.health = CFG.playerHealth;
  showEnd('BUSTED', `The Purnama Bay police walk you to the station house.\nFine paid: ${CFG.currency} ${fine}. Your wanted level is wiped clean.`);
}
function wasted() {
  if (S.mode !== 'playing') return;
  wanted.clearAll();
  police.reset();
  audio.siren(false);
  exitCar(true);
  S.pos.set(-30, 0, 6); // outside Kopi Ombak — the bay's unofficial infirmary
  S.health = CFG.playerHealth;
  showEnd('WASTED', 'You wake up on a cafe bench with a splitting headache.\nThe bay gives you another day. Do not waste it.');
}
function showEnd(title, text) {
  S.mode = 'ended';
  document.getElementById('end-title').textContent = title;
  document.getElementById('end-title').style.color = title === 'BUSTED' ? '#4da3ff' : '#ff5a4d';
  document.getElementById('end-text').textContent = text;
  document.getElementById('screen-end').style.display = 'flex';
  touch.setPlaying(false, false);
}

// ---------- cars: enter / exit / interact ----------
function nearestEnterableCar() {
  let best = null, bd = 3.4;
  for (const car of [...parkedCars, ...(stealCar ? [stealCar] : [])]) {
    if (car.driver || car.dead) continue;
    const d = Math.hypot(car.pos.x - S.pos.x, car.pos.z - S.pos.z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
function toggleCar() {
  if (S.mode !== 'playing') return;
  if (S.inCar) { exitCar(false); return; }
  const car = nearestEnterableCar();
  if (!car) return;
  S.inCar = car;
  car.isPlayer = true;
  S.crouch = false;
  audio.door(); audio.engine(true);
  if (!car.legal && car !== stealCar) crimeEvent('theft', car.pos.x, car.pos.z);
  if (car === stealCar) hud.showToast('You are in the Gelora GT. Take it to Bengkel Samudra.', 2.6);
  if (!S.seenByPolice) wanted.clearVehicleDescription();
  hud.showToast(`${car.spec.name} — W/S drive, A/D steer, Space brake, F exit`, 2.4);
  touch.setPlaying(true, true);
}
function exitCar(silent) {
  if (!S.inCar) return;
  const car = S.inCar;
  car.isPlayer = false;
  S.inCar = null;
  S.pos.set(car.pos.x + Math.cos(car.heading) * 1.8, groundHeightAt(car.pos.x, car.pos.z), car.pos.z - Math.sin(car.heading) * 1.8);
  S.heading = car.heading;
  if (!silent) audio.door();
  touch.setPlaying(true, false);
}
function nearInteractable() {
  if (drops.nearest(S.pos.x, S.pos.z)) return true;
  if (Math.hypot(CFG.shopPos.x - S.pos.x, CFG.shopPos.z - S.pos.z) < 3.6) return true;
  if (Math.hypot(CFG.safehouse.x - S.pos.x, CFG.safehouse.z - S.pos.z) < 3.6) return true;
  return false;
}
function doInteract() {
  if (S.mode !== 'playing' || S.inCar) return;
  if (hud.dialogOpen()) { hud.advanceDialog(); return; }
  const drop = drops.nearest(S.pos.x, S.pos.z);
  if (drop) {
    drops.take(drop);
    weaponsInv.gain(drop.weapon, drop.ammo);
    attachWeaponProp(playerGroup, drop.weapon);
    audio.pickup();
    hud.showToast(drop.weapon === 'pistol' ? `Picked up a PISTOL with ${drop.ammo} rounds.` : 'Picked up a BATON.', 2.6);
    return;
  }
  if (Math.hypot(CFG.shopPos.x - S.pos.x, CFG.shopPos.z - S.pos.z) < 3.6) { openShop(); return; }
  if (Math.hypot(CFG.safehouse.x - S.pos.x, CFG.safehouse.z - S.pos.z) < 3.6) {
    shirtIdx = (shirtIdx + 1) % SHIRT_CYCLE.length;
    recolorShirt();
    wanted.clearFaceDescription();
    audio.pickup();
    hud.showToast('Fresh clothes at the safehouse — police no longer know your face. Cooldown speeds up.', 3);
    saveGame();
    return;
  }
}
function recolorShirt() {
  // torso is the first box added to the hips group of the player figure
  const hips = playerGroup.userData.parts.hips;
  const torso = hips.children[0];
  if (torso) torso.material = new THREE.MeshLambertMaterial({ color: SHIRT_CYCLE[shirtIdx] });
}
function openShop() {
  S.shopOpen = true;
  hud.openShop(S.money);
  audio.dialog();
}
function closeShop() {
  S.shopOpen = false;
  hud.closeShop();
}

// ---------- missions ----------
const missions = createMissionRunner({
  scene,
  showDialog(lines, done) { hud.showDialog(lines, done); },
  onMissionStart(def) { hud.showToast(`MISSION ${def.id}: ${def.title} — reward ${CFG.currency} ${def.reward}`, 3.2); },
  onMissionComplete(def) {
    S.money += def.reward; // the single place money enters the game: mission rewards
    audio.missionDone();
    hud.showToast(`MISSION COMPLETE — +${CFG.currency} ${def.reward}`, 3.4);
    saveGame();
    if (missions.done) showEnd('CASE CLOSED', `Raka's name is cleared and the Kala Syndicate is finished in Purnama Bay.\nFinal balance: ${CFG.currency} ${S.money}. Free roam is yours — the bay stays alive.`);
  },
  onCollect(i, total) { audio.pickup(); hud.showToast(`Crate moved (${i + 1}/${total})`, 1.6); },
  onGuardAlarm(pos) {
    hud.showToast('SPOTTED! The guards raised the alarm.', 2.6);
    crimeEvent('trespass', pos.x, pos.z, {});
    // guards count as witnesses even if the street is empty:
    if (wanted.stars === 0) wanted.reportCrime({ x: pos.x, z: pos.z, civilianWitnesses: 2, policeWitness: false, inVehicle: false });
  },
  spawnStealCar() {
    if (stealCar) scene.remove(stealCar.group);
    stealCar = createCar('gelora', { x: 30, z: -38, heading: 0.3, driver: null, color: 0xf2d024 });
    stealCar.isStealTarget = true;
    scene.add(stealCar.group);
  },
  spawnChaseCar() {
    if (chaseCar) scene.remove(chaseCar.group);
    chaseCar = createCar('baruna', { x: 57, z: -40, heading: Math.PI, driver: 'target', color: 0x8e44ad });
    chaseCar.wp = 1;
    scene.add(chaseCar.group);
    chaseStoppedFor = 0;
  },
  triggerEscapeCrime() {
    const res = spawnWitnessCrime();
    S.escapeQueue = [S.time + 7.5, S.time + 15];
    hud.showToast('Every patrol in the bay has your face. RUN.', 3);
    void res;
  },
});

// gold objective beacon
const beacon = new THREE.Mesh(
  new THREE.CylinderGeometry(1.1, 1.1, 26, 18, 1, true),
  new THREE.MeshBasicMaterial({ color: 0xffd60a, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }),
);
beacon.position.y = 13;
beacon.visible = false;
scene.add(beacon);

// ---------- save / load / pause / start ----------
const SAVE_KEY = 'purnama-bay-save-v1';
function saveGame() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      x: S.pos.x, z: S.pos.z, money: S.money, health: S.health,
      owned: weaponsInv.owned, ammo: weaponsInv.ammo, active: weaponsInv.active,
      missionIndex: missions.index, shirtIdx,
    }));
    S.savedOnce = true;
  } catch { /* storage unavailable: the game still runs */ }
}
function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function applySave(d) {
  if (!d) return;
  S.pos.set(d.x ?? CFG.spawn.x, 0, d.z ?? CFG.spawn.z);
  S.money = d.money | 0;
  S.health = Math.max(20, d.health ?? 100);
  weaponsInv.owned.baton = !!d.owned?.baton;
  weaponsInv.owned.pistol = !!d.owned?.pistol;
  weaponsInv.ammo = d.ammo | 0;
  if (d.active && weaponsInv.select(d.active)) attachWeaponProp(playerGroup, d.active === 'fists' ? null : d.active);
  shirtIdx = d.shirtIdx | 0;
  recolorShirt();
  missions.index = Math.min(d.missionIndex | 0, MISSION_DEFS.length - 1);
}
function pauseGame(on) {
  if (on && S.mode === 'playing') {
    S.mode = 'paused';
    document.getElementById('menu-pause').style.display = 'flex';
    audio.siren(false);
  } else if (!on && S.mode === 'paused') {
    S.mode = 'playing';
    document.getElementById('menu-pause').style.display = 'none';
  }
}
function startGame(useSave) {
  if (touch.mustRotate()) { hud.showToast('Rotate your device to landscape first.', 2); return; }
  audio.unlock();
  document.getElementById('menu-start').style.display = 'none';
  document.getElementById('screen-end').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  S.mode = 'playing';
  if (useSave) applySave(loadSave());
  if (!missions.active && !missions.done) missions.start(missions.index);
  touch.setPlaying(true, !!S.inCar);
}
document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', () => pauseGame(false));
document.getElementById('btn-save').addEventListener('click', () => { saveGame(); hud.showToast('Saved.'); pauseGame(false); });
document.getElementById('btn-restart').addEventListener('click', () => { try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ } location.reload(); });
document.getElementById('btn-end-ok').addEventListener('click', () => {
  document.getElementById('screen-end').style.display = 'none';
  if (S.mode === 'ended') { S.mode = 'playing'; touch.setPlaying(true, false); }
  if (!missions.active && !missions.done) missions.start(missions.index);
});
if (loadSave()) document.getElementById('btn-continue').style.display = 'inline-block';

// ---------- per-frame updates ----------
function playerMoveInput() {
  let ix = 0, iz = 0;
  if (keys.KeyW || keys.ArrowUp) iz -= 1;
  if (keys.KeyS || keys.ArrowDown) iz += 1;
  if (keys.KeyA || keys.ArrowLeft) ix -= 1;
  if (keys.KeyD || keys.ArrowRight) ix += 1;
  const ts = touch.state;
  if (ts.moveMag > 0.12) { ix = ts.moveX; iz = ts.moveY; }
  const mag = Math.min(1, Math.hypot(ix, iz));
  if (mag < 0.01) return { mag: 0, dx: 0, dz: 0, tier: 0 };
  // rotate screen-space input into world space by camera yaw
  const sin = Math.sin(S.camYaw), cos = Math.cos(S.camYaw);
  const dx = (ix * cos - iz * sin) / (Math.hypot(ix, iz) || 1);
  const dz = (iz * cos + ix * sin) / (Math.hypot(ix, iz) || 1);
  let tier;
  if (ts.moveMag > 0.12) tier = ts.moveMag < 0.45 ? 0 : ts.moveMag < 0.82 ? 1 : 2;
  else tier = keys.AltLeft || keys.AltRight ? 0 : (keys.ShiftLeft || keys.ShiftRight) ? 2 : 1;
  return { mag, dx, dz, tier };
}
function updatePlayer(dt) {
  S.attackCd = Math.max(0, S.attackCd - dt);
  S.attackT = Math.max(0, S.attackT - dt);
  if (S.atkBuf) {
    S.atkBuf.t -= dt;
    if (S.atkBuf.t <= 0) S.atkBuf = null;
    else if (S.attackCd <= 0) { const k = S.atkBuf.kind; S.atkBuf = null; doMelee(k); }
  }
  if (S.pos.y > (S.peakY || 0)) S.peakY = S.pos.y;
  if (touch.state.atk && weaponsInv.active !== 'pistol') doMelee('punch');
  if (touch.state.atk && weaponsInv.active === 'pistol') doShoot();
  const input = S.shopOpen ? { mag: 0 } : playerMoveInput();
  const speeds = [CFG.walkSpeed, CFG.runSpeed, CFG.sprintSpeed];
  let targetSpeed = input.mag > 0 ? speeds[input.tier] * Math.max(0.35, input.mag) : 0;
  if (S.crouch) targetSpeed *= CFG.crouchSpeedFactor;
  const rate = targetSpeed > S.speedNow ? CFG.accel : CFG.decel;
  S.speedNow += Math.max(-rate * dt, Math.min(rate * dt, targetSpeed - S.speedNow));
  S.moving = S.speedNow > 0.25 && input.mag > 0;
  S.still = S.speedNow < 0.25;
  if (S.moving) {
    const want = Math.atan2(input.dx, input.dz);
    let diff = want - S.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    S.heading += Math.max(-11 * dt, Math.min(11 * dt, diff * 9 * dt));
    let nx = S.pos.x + Math.sin(S.heading) * S.speedNow * dt * (Math.abs(diff) > 2.6 ? 0.3 : 1);
    let nz = S.pos.z + Math.cos(S.heading) * S.speedNow * dt * (Math.abs(diff) > 2.6 ? 0.3 : 1);
    [nx, nz] = world.collide(nx, nz, CFG.playerRadius);
    // soft people collision: adults yield a little, children never move —
    // the player is the one who gets pushed out.
    for (const p of population.people) {
      const d = Math.hypot(p.pos.x - nx, p.pos.z - nz);
      const minD = 0.75;
      if (d < minD && d > 0.001) {
        if (p.kind === 'child' || p.state === 'down') {
          nx = S.pos.x; nz = S.pos.z;
        } else {
          p.pos.x += (p.pos.x - nx) / d * (minD - d) * 0.7;
          p.pos.z += (p.pos.z - nz) / d * (minD - d) * 0.7;
        }
      }
    }
    S.pos.x = nx; S.pos.z = nz;
    S.phase += dt * (4 + S.speedNow * 1.55);
    S.stepSndT -= dt;
    if (S.stepSndT <= 0 && S.groundY === S.pos.y) { audio.step(S.speedNow > 6); S.stepSndT = S.speedNow > 6 ? 0.27 : 0.4; }
  }
  // jumping: coyote time + jump buffer, honest gravity
  const gy = groundHeightAt(S.pos.x, S.pos.z);
  S.groundY = gy;
  const onGround = S.pos.y <= gy + 0.001;
  if (onGround) S.coyote = CFG.coyoteTime; else S.coyote -= dt;
  S.jumpBuf -= dt;
  if (S.jumpBuf > 0 && S.coyote > 0 && !S.crouch) {
    S.vy = CFG.jumpVelocity;
    S.jumpBuf = 0; S.coyote = 0;
    audio.jump();
  }
  if (!onGround || S.vy > 0) {
    S.vy -= CFG.gravity * dt;
    S.pos.y += S.vy * dt;
    if (S.pos.y <= gy) {
      if (S.vy < -6) audio.land();
      S.pos.y = gy; S.vy = 0;
    }
  } else S.pos.y = gy;
  playerGroup.position.copy(S.pos);
  playerGroup.rotation.y = S.heading;
  const mode = S.crouch ? 'crouch' : !onGround ? 'jump' : 'walk';
  poseHuman(playerGroup, {
    mode, moving: S.moving, speed01: Math.min(1, S.speedNow / CFG.sprintSpeed),
    phase: S.phase, time: S.time, attackT: S.attackT, attackKind: S.attackKind,
    aim: weaponsInv.active === 'pistol',
  }, dt);
}

function updateDriving(dt) {
  const car = S.inCar;
  let throttle = 0, steer = 0, brake = false;
  if (!S.shopOpen) {
    if (keys.KeyW || keys.ArrowUp) throttle = 1;
    if (keys.KeyS || keys.ArrowDown) throttle = -1;
    if (keys.KeyA || keys.ArrowLeft) steer = 1;
    if (keys.KeyD || keys.ArrowRight) steer = -1;
    if (keys.Space) brake = true;
    const ts = touch.state;
    if (ts.moveMag > 0.12) { throttle = -ts.moveY; steer = -ts.moveX; }
    if (ts.brake) brake = true;
  }
  // child safety assist: the car brakes itself rather than ever touch a child
  const fx = Math.sin(car.heading), fz = Math.cos(car.heading);
  for (const p of population.people) {
    if (p.kind !== 'child') continue;
    const relX = p.pos.x - car.pos.x, relZ = p.pos.z - car.pos.z;
    const ahead = relX * fx + relZ * fz;
    const side = Math.abs(relX * fz - relZ * fx);
    if (ahead > 0 && ahead < 5.5 && side < 1.9 && car.speed > 0) { brake = true; throttle = 0; }
  }
  const prevSpeed = car.speed;
  stepVehicle(car, { throttle, steer, brake }, dt, world);
  S.speedNow = Math.abs(car.speed);
  S.heading = car.heading;
  // sit the player in the driver's seat
  playerGroup.position.set(car.pos.x, car.pos.y + 0.32, car.pos.z);
  playerGroup.rotation.y = car.heading;
  poseHuman(playerGroup, { mode: 'drive', moving: false, speed01: 0, phase: 0, time: S.time }, dt);
  carCollisions(car, prevSpeed, true);
}

function carCollisions(car, prevSpeed, isPlayerCar) {
  const others = [...trafficCars, ...parkedCars, ...(stealCar ? [stealCar] : []), ...(chaseCar ? [chaseCar] : []),
    ...police.units.filter((u) => u.kind === 'car').map((u) => u.car)];
  for (const other of others) {
    if (other === car) continue;
    const d = Math.hypot(other.pos.x - car.pos.x, other.pos.z - car.pos.z);
    if (d < 2.35 && d > 0.001) {
      const impact = Math.abs(car.speed - other.speed) + Math.abs(car.speed) * 0.4;
      if (impact > 4) {
        applyImpact(car, impact);
        applyImpact(other, impact * 0.8);
        audio.crash(Math.min(1.4, impact / 10));
        S.shake = Math.max(S.shake, Math.min(0.5, impact * 0.03));
        if (isPlayerCar && other.driver) crimeEvent('reckless', car.pos.x, car.pos.z);
        car.speed *= 0.35; other.speed *= -0.15;
      }
      // separate
      const push = (2.35 - d) / 2;
      const ux = (other.pos.x - car.pos.x) / d, uz = (other.pos.z - car.pos.z) / d;
      other.pos.x += ux * push; other.pos.z += uz * push;
      if (!isPlayerCar || true) { car.pos.x -= ux * push * 0.4; car.pos.z -= uz * push * 0.4; }
    }
  }
  // people: adults are hurt by a fast car (a witnessed crime); children are
  // excluded from this loop entirely — cars brake for them instead.
  if (Math.abs(car.speed) > 4) {
    for (const p of population.people) {
      if (p.kind === 'child' || p.state === 'down') continue;
      const d = Math.hypot(p.pos.x - car.pos.x, p.pos.z - car.pos.z);
      if (d < 1.6) {
        if (isPlayerCar) {
          p.health -= Math.abs(car.speed) * 1.6;
          crimeEvent('reckless', car.pos.x, car.pos.z);
          if (p.health <= 0) knockDown(p, 9999);
          else { p.state = 'flee'; p.fleeFrom = { x: car.pos.x, z: car.pos.z }; }
          car.speed *= 0.55;
        }
      }
    }
  }
}

function updateTraffic(dt) {
  const blockers = population.people.map((p) => ({ x: p.pos.x, z: p.pos.z }));
  blockers.push({ x: S.pos.x, z: S.pos.z });
  if (S.inCar) blockers.push({ x: S.inCar.pos.x, z: S.inCar.pos.z });
  for (const car of trafficCars) {
    if (car.dead) continue;
    const input = trafficInput(car, dt, [...blockers, ...trafficCars.filter((c) => c !== car).map((c) => ({ x: c.pos.x, z: c.pos.z }))]);
    const prev = car.speed;
    stepVehicle(car, input, dt, world);
    if (car !== S.inCar) carCollisions(car, prev, false);
    updateCarCosmetics(car, dt, S.time, false);
  }
  if (stealCar) updateCarCosmetics(stealCar, dt, S.time, false);
  for (const car of parkedCars) updateCarCosmetics(car, dt, S.time, false);
}

function updateChaseCar(dt) {
  if (!chaseCar || chaseCar.dead) { chaseStoppedFor = 0; return; }
  const active = missions.active && missions.active.def.id === 5;
  if (!active) return;
  // flee along the ring, faster when the player is close
  const target = [{ x: -63, z: -63 }, { x: 57, z: -63 }, { x: 57, z: 37 }, { x: -63, z: 37 }][chaseCar.wp || 0];
  if (Math.hypot(target.x - chaseCar.pos.x, target.z - chaseCar.pos.z) < 7) chaseCar.wp = ((chaseCar.wp || 0) + 1) % 4;
  const dP = Math.hypot(S.pos.x - chaseCar.pos.x, S.pos.z - chaseCar.pos.z);
  const want = Math.atan2(target.x - chaseCar.pos.x, target.z - chaseCar.pos.z);
  let diff = want - chaseCar.heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 1.9));
  const desired = dP < 14 ? 26 : 19;
  const prev = chaseCar.speed;
  stepVehicle(chaseCar, { throttle: chaseCar.speed < desired ? 1 : 0, steer, brake: chaseCar.speed > desired + 3 }, dt, world);
  carCollisions(chaseCar, prev, false);
  if (Math.abs(chaseCar.speed) < 0.6 && dP < 16) chaseStoppedFor += dt;
  else if (Math.abs(chaseCar.speed) >= 0.6) chaseStoppedFor = 0;
  updateCarCosmetics(chaseCar, dt, S.time, false);
}

function updateCamera(dt) {
  const target = S.inCar ? S.inCar.pos : S.pos;
  // the sun (and its shadow frustum) follows the player for crisp shadows
  world.sun.position.set(target.x - 70, 55, target.z - 40);
  world.sun.target.position.set(target.x, 0, target.z);
  world.sun.target.updateMatrixWorld();
  const dist = S.inCar ? 9.5 : S.crouch ? 5.6 : 7.4;
  const height = S.inCar ? 3.1 : S.crouch ? 1.15 : 2.1;
  const fx = Math.sin(S.camYaw), fz = Math.cos(S.camYaw);
  let cx = target.x - fx * dist * Math.cos(S.camPitch);
  let cz = target.z - fz * dist * Math.cos(S.camPitch);
  let cy = target.y + height + Math.sin(S.camPitch) * dist * 0.72;
  [cx, cz] = world.collide(cx, cz, 0.4);
  cy = Math.max(0.6, cy);
  const k = 1 - Math.pow(0.0001, dt); // smooth follow
  camera.position.x += (cx - camera.position.x) * k;
  camera.position.y += (cy - camera.position.y) * k;
  camera.position.z += (cz - camera.position.z) * k;
  if (S.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * S.shake;
    camera.position.y += (Math.random() - 0.5) * S.shake * 0.6;
    S.shake = Math.max(0, S.shake - dt * 1.4);
  }
  camera.lookAt(target.x, target.y + (S.inCar ? 1.2 : 1.45), target.z);
  // while driving, ease the camera behind the car when the player is hands-off
  if (S.inCar && !mouseDown) {
    let diff = S.inCar.heading - S.camYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    S.camYaw += diff * Math.min(1, dt * 1.6);
  }
  if (S.inCar) S.heading = S.inCar.heading;
}

function currentPrompt() {
  if (S.mode !== 'playing' || S.shopOpen) return null;
  if (hud.dialogOpen()) return `<b>E</b> NEXT`;
  if (S.inCar) return null; // driving hints live in the toast; exit is F
  const drop = drops.nearest(S.pos.x, S.pos.z);
  if (drop) return `<b>E</b> TAKE ${drop.weapon.toUpperCase()}`;
  if (Math.hypot(CFG.shopPos.x - S.pos.x, CFG.shopPos.z - S.pos.z) < 3.6) return `<b>E</b> ${PLACES.shopName} — WEAPONS SHOP`;
  if (Math.hypot(CFG.safehouse.x - S.pos.x, CFG.safehouse.z - S.pos.z) < 3.6) return `<b>E</b> SAFEHOUSE — CHANGE CLOTHES / SAVE`;
  const car = nearestEnterableCar();
  if (car) return `<b>F</b> ENTER CAR — ${car.spec.name}`;
  return null;
}

let dialogAutoT = 0;
function update(dt) {
  S.time += dt;
  if (S.panicT > 0) { S.panicT -= dt; if (S.panicT <= 0) S.panic = null; }
  // mission 6 follow-up witnessed incidents (each a separate, lawful incident)
  for (let i = S.escapeQueue.length - 1; i >= 0; i--) {
    if (S.time >= S.escapeQueue[i]) { S.escapeQueue.splice(i, 1); spawnWitnessCrime(); }
  }
  if (hud.dialogOpen()) {
    dialogAutoT += dt;
    if (dialogAutoT > 5) { dialogAutoT = 0; hud.advanceDialog(); }
  } else dialogAutoT = 0;
  if (clickQueued) {
    clickQueued = false;
    if (!S.inCar) { if (weaponsInv.active === 'pistol') doShoot(); else doMelee('punch'); }
  }
  if (S.inCar) updateDriving(dt); else updatePlayer(dt);
  updateTraffic(dt);
  updateChaseCar(dt);
  // thug attacks land here
  population.update(dt, {
    world, playerPos: S.inCar ? S.inCar.pos : S.pos, panic: S.panic, t: S.time,
    onThugAttack(p) {
      if (p.weapon === 'pistol') {
        audio.shot();
        if (Math.random() < 0.55) hurtPlayer(7);
      } else {
        audio.swing();
        hurtPlayer(p.weapon === 'baton' ? 8 : 5);
        S.shake = Math.max(S.shake, 0.15);
      }
    },
  });
  // keep feet on the pier deck for dock folk
  for (const p of population.people) {
    if (p.state !== 'down') p.group.position.y = groundHeightAt(p.pos.x, p.pos.z) * (p.group.scale.x >= 0.9 ? 1 : 1);
  }
  const playerPos = S.inCar ? S.inCar.pos : S.pos;
  const policeRes = police.update(dt, {
    stars: wanted.stars, playerPos, playerMode: S.inCar ? 'car' : 'foot',
    playerCrouch: S.crouch, playerStill: S.still, wanted, t: S.time,
    onSight(seen) { S.seenByPolice = seen; if (seen) wanted.lastSeenPos = { x: playerPos.x, z: playerPos.z }; },
    onBusted() { busted(); },
    onPoliceShot(u, dmg) {
      audio.shot();
      if (Math.random() < 0.6) hurtPlayer(dmg);
      void u;
    },
  });
  const hidden = S.crouch && S.still && !S.seenByPolice;
  wanted.update(dt, { seenByPolice: S.seenByPolice, hidden });
  // police car ramming a walking player hurts a little, never lethal spam
  if (!S.inCar) {
    for (const u of police.units) {
      if (u.kind !== 'car') continue;
      const d = Math.hypot(u.pos.x - S.pos.x, u.pos.z - S.pos.z);
      if (d < 2 && Math.abs(u.car.speed) > 5 && S.time - (S.lastRamT || 0) > 0.9) {
        S.lastRamT = S.time;
        hurtPlayer(5);
      }
    }
  }
  // missions
  const stage = missions.stage();
  missions.update(dt, {
    playerPos, mode: S.inCar ? 'car' : 'foot', playerCrouch: S.crouch, playerStill: S.still,
    wantedStars: wanted.stars, inStealCar: S.inCar === stealCar && !!stealCar,
    chaseCar, chaseStoppedFor, t: S.time,
  });
  // beacon on the current target
  let target = null;
  if (missions.active && stage) {
    target = stage.type === 'chase' && chaseCar ? { x: chaseCar.pos.x, z: chaseCar.pos.z }
      : stage.type === 'collect' ? (stage.points.find((pt, i) => !missions.active.collected.has(i)) || stage.target)
      : stage.target;
  }
  if (target) {
    beacon.visible = true;
    beacon.position.x = target.x; beacon.position.z = target.z;
    beacon.material.opacity = 0.22 + Math.sin(S.time * 3) * 0.07;
  } else beacon.visible = false;
  drops.update(S.time);
  world.update(dt, S.time);
  if (flashT > 0) { flashT -= dt; if (flashT <= 0) { muzzle.intensity = 0; flashPlane.material.opacity = 0; } }
  updateCamera(dt);
  // HUD + minimap refresh at ~8 Hz: rebuilding DOM panels every physics
  // substep would burn more CPU than the simulation itself.
  S.hudT = (S.hudT || 0) + dt;
  if (S.hudT < 0.12) return;
  S.hudT = 0;
  hud.setPrompt(currentPrompt());
  hud.update({
    missionTitle: missions.active ? `MISSION ${missions.active.def.id} — ${missions.active.def.title}` : (missions.done ? 'STORY COMPLETE — FREE ROAM' : 'PURNAMA BAY'),
    objective: missions.active ? missions.stageText() : 'Explore the bay. Earn PB$ from Mira\'s jobs, gear up at PURNAMA ARMS.',
    objectiveSub: missions.active ? `Reward ${CFG.currency} ${missions.active.def.reward} · Mission ${missions.index + 1} of ${MISSION_DEFS.length}` : '',
    wanted: wanted.stars, knownFace: wanted.knownFace, knownVehicle: wanted.knownVehicle,
    health: S.health, money: S.money,
    owned: weaponsInv.owned, activeWeapon: weaponsInv.active, ammo: weaponsInv.ammo,
    mode: S.inCar ? 'car' : 'foot',
    vehicle: S.inCar ? { speed: S.inCar.speed, name: S.inCar.spec.name, health: S.inCar.health } : null,
    policePanel: police.panelInfo(playerPos),
    arresting: policeRes.arresting, arrestProgress: policeRes.arrestProgress,
    playerPos, playerHeading: S.inCar ? S.inCar.heading : S.heading,
    missionTarget: target, search: wanted.searchInfo(),
    policeBlips: police.units.filter((u) => !u.downForever).map((u) => ({ x: u.pos.x, z: u.pos.z })),
    thugBlips: population.people.filter((p) => p.kind === 'thug' && p.state !== 'down').map((p) => ({ x: p.pos.x, z: p.pos.z })),
  });
}

// ---------- debug hook for the automated probe ----------
function punchNearest() {
  const t = nearestTarget(population.people, S.pos.x, S.pos.z, 8);
  if (!t) return false;
  S.heading = Math.atan2(t.pos.x - S.pos.x, t.pos.z - S.pos.z);
  S.attackCd = 0;
  doMelee('punch');
  return true;
}
window.PB = {
  version: CFG.version,
  startGame: (useSave = false) => startGame(useSave),
  state() {
    return {
      mode: S.mode, time: S.time,
      player: { x: S.pos.x, y: S.pos.y, z: S.pos.z, heading: S.heading, speed: S.speedNow, crouch: S.crouch, moving: S.moving, peakY: S.peakY || 0 },
      money: S.money, health: S.health,
      wanted: wanted.snapshot(),
      weapons: { active: weaponsInv.active, owned: { ...weaponsInv.owned }, ammo: weaponsInv.ammo },
      mission: {
        index: missions.index, done: missions.done,
        active: missions.active ? missions.active.def.title : null,
        stage: missions.active ? missions.stageText() : null,
        stageIdx: missions.active ? missions.active.stageIdx : -1,
      },
      inCar: !!S.inCar,
      cameraY: camera.position.y,
      combat: { attackT: S.attackT, attackKind: S.attackKind, attackCd: S.attackCd, lastKind: S.lastAttack?.kind || null, lastAt: S.lastAttack?.at ?? -1 },
      vehicle: S.inCar ? { name: S.inCar.spec.name, speed: S.inCar.speed, health: S.inCar.health, heading: S.inCar.heading } : null,
      prompt: currentPrompt(),
      shopOpen: S.shopOpen,
      dialogOpen: hud.dialogOpen(),
      paused: S.mode === 'paused',
    };
  },
  counts() {
    const pop = population.counts();
    const pol = police.counts();
    return {
      ...pop, policeFoot: pol.foot, policeCars: pol.cars,
      trafficCars: trafficCars.length, parkedCars: parkedCars.length,
      childrenDetail: population.people.filter((p) => p.kind === 'child').map((p) => ({
        x: p.pos.x, z: p.pos.z, hasHealth: 'health' in p, state: p.state,
      })),
    };
  },
  teleport(x, z) { if (S.inCar) exitCar(true); S.pos.set(x, groundHeightAt(x, z), z); S.vy = 0; S.peakY = 0; },
  teleportCar(x, z, heading) {
    if (!S.inCar) return false;
    S.inCar.pos.set(x, 0, z);
    if (typeof heading === 'number') { S.inCar.heading = heading; S.inCar.speed = 0; S.inCar.group.rotation.y = heading; }
    return true;
  },
  teleportNear(kind, armedFirst = false) {
    let pool = population.people.filter((p) => p.kind === kind && p.state !== 'down');
    if (armedFirst) pool = pool.filter((p) => p.weapon) ;
    if (!pool.length) return false;
    const p = pool[0];
    if (S.inCar) exitCar(true);
    S.pos.set(p.pos.x + 1.3, groundHeightAt(p.pos.x + 1.3, p.pos.z), p.pos.z);
    S.heading = Math.atan2(p.pos.x - S.pos.x, p.pos.z - S.pos.z);
    return true;
  },
  debugCars() {
    return {
      traffic: trafficCars.map((c) => ({ x: c.pos.x, z: c.pos.z, driver: !!c.driver })),
      parked: parkedCars.map((c) => ({ x: c.pos.x, z: c.pos.z, name: c.spec.name })),
    };
  },
  debugPolice() {
    return police.units.filter((u) => !u.downForever).map((u) => ({ kind: u.kind, x: u.pos.x, z: u.pos.z, status: u.status }));
  },
  dropsInfo() { return drops.drops.map((d) => ({ x: d.x, z: d.z, weapon: d.weapon, ammo: d.ammo })); },
  renderInfo() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; },
  startMission(n) {
    if (stealCar) { scene.remove(stealCar.group); stealCar = null; }
    if (chaseCar) { scene.remove(chaseCar.group); chaseCar = null; }
    missions.clearGuards();
    missions.index = n - 1;
    missions.done = false;
    missions.start(n - 1);
  },
  commitCrime() { return punchNearest(); },
  punchNearest,
  spawnWitnessCrime,
  dismissDialog() { while (hud.dialogOpen()) hud.advanceDialog(); },
  pause(on) { pauseGame(on); },
  save: () => saveGame(),
  setupShot(name) {
    if (S.mode === 'menu') startGame(false);
    PB.dismissDialog();
    if (name === 'drive') {
      PB.teleport(-2, 74);
      toggleCar();
      if (S.inCar) { S.inCar.pos.set(-30, 0, 74); S.inCar.heading = Math.PI / 2; S.inCar.speed = 13; S.camYaw = Math.PI / 2; }
    } else if (name === 'chase') {
      PB.teleport(30, 74); // open shore road, no facades near the camera
      spawnWitnessCrime();
      spawnWitnessCrime();
      police.stageChase(S.pos);
      S.health = 82;
      // aim the player and camera at the staged patrol car so the pursuit is in frame
      const carUnit = police.units.find((u) => u.kind === 'car') || police.units[0];
      if (carUnit) {
        const aim = Math.atan2(carUnit.pos.x - S.pos.x, carUnit.pos.z - S.pos.z);
        S.heading = aim; S.camYaw = aim;
      }
    } else if (name === 'walk') {
      PB.teleport(8, 55); // open shore road: player centred, sea and palms ahead
      S.heading = 0.15; S.camYaw = 0.15;
    } else if (name === 'mission') {
      PB.startMission(1);
    } else if (name === 'crowd') {
      PB.teleport(-28, 10);
      S.camYaw = 2.6; S.heading = 2.6;
    }
  },
};

// staged scenes via ?shot= for the repository screenshots
const shotParam = new URLSearchParams(location.search).get('shot');
if (shotParam) {
  startGame(false);
  window.PB.setupShot(shotParam === 'start' ? 'walk' : shotParam);
}

// ---------- the loop ----------
let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.85, (now - lastT) / 1000);
  lastT = now;
  if (S.hitStop > 0) { S.hitStop -= dt; dt *= 0.12; }
  if (S.mode === 'playing') {
    // Fixed-substep catch-up: even on a slow display the simulation advances
    // in real time, in slices no larger than 1/20 s so physics stays stable.
    let remaining = dt;
    while (remaining > 0.0001) {
      const step = Math.min(remaining, 1 / 20);
      update(step);
      remaining -= step;
    }
  } else if (S.mode === 'menu') {
    // slow menu orbit over the bay
    const t = now / 1000;
    camera.position.set(Math.sin(t * 0.05) * 55, 26, 60 + Math.cos(t * 0.05) * 30);
    camera.lookAt(0, 2, 0);
    world.update(dt, t);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);



