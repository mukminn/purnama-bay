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
  punchDamage: 12,
  kickDamage: 16,
  batonDamage: 20,
  bulletDamage: 34,
  attackRange: 2.3,
  attackCooldown: 0.35,
  attackWindow: 0.7,       // how long an attack reads as "active" (attackT)
  bustedRadius: 1.5,
  bustedTime: 3.5,
  // day / night cycle (seconds of game time for one full turn) and the
  // hard-impact count that blows a car up
  dayCycle: 300,
  hardHitSpeed: 8.5,       // impact speed (m/s) that counts as a HARD hit
  hardHitsToExplode: 10,
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
  },
  // genre-style feedback counters: hit-marker flashes for the player's own
  // landed attacks, red vignette flashes when the player takes damage
  feedback: { hits: 0, flashes: 0 },
  stats: { shotsFired: 0, crimesSeen: 0, crimesUnseen: 0 },
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
