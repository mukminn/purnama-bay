// PURNAMA BAY - central tuning table and shared game state.
// Every key number of the game lives in this one file so the balance can be
// audited at a glance: movement tiers, prices, rewards, wanted timings.

export const CFG = {
  // movement tiers (metres per second, measured by the probes)
  walkSpeed: 2.3,
  runSpeed: 5.5,
  sprintSpeed: 8.8,
  crouchSpeed: 1.6,
  jumpVelocity: 7.0,
  gravity: 20.0,
  // camera heights (world Y of the camera while on foot)
  camHeightStand: 3.78,
  camHeightCrouch: 2.42,
  camHeightCar: 3.4,
  camDistance: 6.4,
  // wanted model timings (seconds)
  incidentWindow: 3.5,     // crimes inside this window count as one incident
  raiseCooldown: 6.0,      // minimum gap between two star raises
  decayStand: 12.0,        // unseen seconds to shed one star while standing
  decayCrouch: 7.0,        // unseen seconds to shed one star crouched + still
  pressureEvery: 30.0,     // visible seconds at 3+ stars that add one more
  witnessRadius: 16,       // adults inside this radius can witness a crime
  policeSeeRadius: 26,     // police inside this radius keep the player "seen"
  // shop prices (PB$)
  priceBaton: 250,
  pricePistol: 900,
  priceKnife: 400,
  priceAmmo: 60,
  ammoPack: 12,
  // mission rewards (PB$) - the ONLY source of money in the game
  rewards: [400, 350, 600, 750, 900, 1500],
  // world layout anchors (all on footpath / plaza ground, never on a
  // carriageway: shopDoor is the street-corner entrance point of the
  // PURNAMA ARMS block, safehouse and miraSpot sit inside city blocks)
  shopDoor: { x: 34, z: 29 },
  safehouse: { x: 100, z: -100 },
  miraSpot: { x: 10, z: 31 },
  worldHalf: 148,
  // combat
  punchDamage: 10,
  kickDamage: 10,
  batonDamage: 20, // the baton IS now a baseball bat
  knifeDamage: 15,
  bulletDamage: 30,
  fightModeTime: 5, // seconds the fight mode (pose + HP bars) stays up
  attackRange: 2.3,
  attackCooldown: 0.35,
  attackWindow: 0.7,       // how long an attack reads as "active" (attackT)
  bustedRadius: 1.5,
  bustedTime: 3.5,
  // round 11: numbers that used to be scattered across police.js,
  // population.js, vehicles.js and the main loop now live here too -
  // police response
  policeSpeed: 6.2,          // foot pursuit speed (m/s)
  policeSearchSpeed: 4.2,    // speed while hunting the last seen spot
  policeShotCd: 2.6,         // seconds between police shots at 3+ stars
  policeAimTime: 0.5,        // visible aim pause before a police shot lands
  // NPC combat
  npcHealth: 100,            // every adult human (children: no health at all)
  npcHostileT: 8,            // seconds a hurt CIVILIAN stays hostile
  thugHostileT: 14,          // thugs stay hostile longer
  npcDownT: 9,               // seconds a felled adult stays down
  npcHitCd: 1.1,             // seconds between an NPC's landed melee hits
  npcShotCd: 1.7,            // seconds between an NPC's pistol shots
  npcWindup: 0.4,            // melee telegraph: raised-arm wind-up (seconds)
  carKillSpeed: 5.0,         // a car must be at least this fast (m/s) to kill
  // endings & survival
  bustedFine: 100,           // PB$ bail/fine, capped at the player's money
  wastedFine: 100,           // PB$ clinic bill, same cap (round 11)
  regenDelay: 9,             // seconds without damage before HP regen starts
  regenRate: 0.7,            // HP per second once regen is running
  explosionPlayerDamage: 26, // HP lost when your car blows up around you
  // traffic
  trafficCruiseBase: 7,      // cruise = base + random * var (m/s)
  trafficCruiseVar: 3,
  // day / night cycle (seconds of game time for one full turn) and the
  // hard-impact count that blows a car up
  dayCycle: 300,
  hardHitSpeed: 8.5,       // impact speed (m/s) that counts as a HARD hit
  hardHitsToExplode: 10,
  // round 12: accumulation cleanup - every temporary entity in the game
  // carries BOTH a count cap and a lifetime, and on expiry it is removed
  // from the three.js scene AND spliced from its JS array (never just
  // hidden). These are the only numbers the cleanup paths read.
  maxDrops: 6,               // live weapon-drop rings at once (drop pool size too)
  dropDespawnT: 45,          // seconds a drop ring waits before it despawns
  maxCorpses: 6,             // dead adult bodies kept in the world at once
  corpseT: 25,               // seconds a dead body stays before it is removed
  maxFloaters: 12,           // pooled floating-text DOM nodes (hud.js)
  maxExplosionFx: 4,         // pooled explosion bursts (vehicles.js)
  explosionParticles: 70,    // fixed particle buffer size per pooled burst
  // presentation
  cityName: 'PURNAMA BAY',
  heroName: 'Raka Pradana',
  contactName: 'Mira Santoso',
  syndicateName: 'Kala Syndicate',
};

// The single shared state object every module reads and writes.
export const S = {
  mode: 'menu',            // menu | playing | paused | ended
  paused: false,
  endedKind: '',           // 'busted' | 'wasted'
  time: 0,                 // game clock, seconds; frozen unless playing
  money: 0,
  health: 100,
  // player avatar state (plain data; the three.js group lives in main)
  p: {
    x: 0, y: 0, z: 30, heading: 0, vy: 0,
    speed: 0, moving: false, crouch: false,
    peakY: 0, onGround: true,
    vel: 0,               // ramped ground speed (analogue acceleration)
    velHeading: 0,        // heading of the actual velocity vector
    groundY: 0,           // pavement height under the feet (sidewalk 0.12)
  },
  inCar: false,
  currentCar: null,        // vehicle record while driving
  lastHurtAt: -100,        // game time the player last took damage (regen gate)
  arresting: false,        // true while the bust meter is filling (main.js)
  shakeKick: 0,            // screen-shake impulse set by vehicles.js events
  cameraY: CFG.camHeightStand,
  prompt: '',
  shopOpen: false,
  dialogOpen: false,
  colliders: [],           // {minX,maxX,minZ,maxZ} building footprints
  npcs: [],                // population records
  cars: [],                // vehicle records (parked + traffic)
  policeUnits: [],         // police records
  drops: [],               // weapon drop records
  input: {
    keys: new Set(),
    joyX: 0, joyY: 0, joyActive: false,
    brakeTouch: false, actQueued: false,
    altHeld: false, shiftHeld: false,
  },
  combat: {
    attackT: 0, attackKind: '', attackCd: 0,
    lastKind: '', lastAt: -10,
    fightT: 0,
  },
  // genre-style feedback counters: hit-marker flashes for the player's own
  // landed attacks, red vignette flashes when the player takes damage
  feedback: { hits: 0, flashes: 0 },
  stats: {
    shotsFired: 0, crimesSeen: 0, crimesUnseen: 0,
    // clarity-round run statistics for the NAME CLEARED summary screen:
    // earned = total PB$ paid by Mira's jobs this run, busted / wasted =
    // how many times the run ended that way, playT = seconds played
    earned: 0, busted: 0, wasted: 0, playT: 0,
  },
};

export function dist2d(ax, az, bx, bz) {
  const dx = ax - bx; const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

export function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export function pointBlocked(x, z, pad) {
  for (const c of S.colliders) {
    if (x > c.minX - pad && x < c.maxX + pad && z > c.minZ - pad && z < c.maxZ + pad) return c;
  }
  return null;
}

// Resolve a position out of every car's oriented bounding box. Each car
// record carries len/wid (metres); the box is expanded by `radius` on all
// sides, and the position is pushed out along the shallower penetration
// axis in the car's local frame. Returns true when a car was hit. `ignore`
// skips one record (the car being driven). This is the single collision
// representation used for the walking player, NPCs, police and the driven
// car, so nothing on foot or on wheels can ever end a frame inside a car.
export function pushOutCars(p, radius, ignore) {
  let hit = false;
  for (const c of S.cars) {
    if (c === ignore || c.dead) continue;
    const hl = (c.len || 4.4) / 2 + radius;
    const hw = (c.wid || 1.85) / 2 + radius;
    const dx = p.x - c.x; const dz = p.z - c.z;
    const fx = Math.sin(c.heading); const fz = Math.cos(c.heading); // forward
    const rx = Math.cos(c.heading); const rz = -Math.sin(c.heading); // right
    const lf = dx * fx + dz * fz;
    const lr = dx * rx + dz * rz;
    if (Math.abs(lf) >= hl || Math.abs(lr) >= hw) continue;
    const penF = hl - Math.abs(lf);
    const penR = hw - Math.abs(lr);
    let nlf = lf; let nlr = lr;
    if (penR < penF) nlr = (lr < 0 ? -hw : hw);
    else nlf = (lf < 0 ? -hl : hl);
    p.x = c.x + fx * nlf + rx * nlr;
    p.z = c.z + fz * nlf + rz * nlr;
    hit = true;
  }
  return hit;
}

// Resolve a position out of any building footprint it sits inside.
export function pushOut(p, radius) {
  const c = pointBlocked(p.x, p.z, radius);
  if (!c) return;
  const left = p.x - (c.minX - radius);
  const right = (c.maxX + radius) - p.x;
  const back = p.z - (c.minZ - radius);
  const front = (c.maxZ + radius) - p.z;
  const m = Math.min(left, right, back, front);
  if (m === left) p.x = c.minX - radius;
  else if (m === right) p.x = c.maxX + radius;
  else if (m === back) p.z = c.minZ - radius;
  else p.z = c.maxZ + radius;
}
