// PURNAMA BAY — every tuning number lives in this one object (design rule:
// key numbers in ONE config, never scattered through the code).
export const CFG = {
  title: 'PURNAMA BAY',
  version: '1.0.0',
  currency: 'PB$',
  // --- player movement (metres / second, measured tiers) ---
  walkSpeed: 2.3,
  runSpeed: 5.5,
  sprintSpeed: 8.8,
  crouchSpeedFactor: 0.45,
  accel: 26,
  decel: 30,
  jumpVelocity: 7.4,
  gravity: 19.5,
  coyoteTime: 0.12,
  jumpBuffer: 0.12,
  playerRadius: 0.42,
  playerHealth: 100,
  // --- combat ---
  punchDamage: 12,
  punchRange: 1.9,
  punchCooldown: 0.34,
  kickDamage: 21,
  kickRange: 2.1,
  kickCooldown: 0.62,
  batonDamage: 27,
  batonRange: 2.2,
  batonCooldown: 0.46,
  pistolDamage: 34,
  pistolRange: 90,
  pistolCooldown: 0.24,
  enemyHealth: 60,
  citizenHealth: 40,
  hitStopTime: 0.045,
  // --- economy (money ONLY enters through mission rewards) ---
  prices: { baton: 250, pistol: 900, ammo: 60 },
  ammoPack: 12,
  bustedBaseFine: 40,
  bustedPerStar: 35,
  // --- wanted model (witness based) ---
  witnessRadius: 19,
  policeWitnessRadius: 30,
  incidentWindow: 3.5,
  incidentRadius: 26,
  raiseCooldown: 6,
  escalationInterval: 30,
  decayInterval: 13,
  decayIntervalHidden: 6.5,
  arrestTime: 1.2,
  policeShootDamage: 4,
  policeShootInterval: 1.15,
  searchRadius: 55,
  // --- vehicles ---
  carTypes: {
    pijar:  { name: 'Pijar City',  maxSpeed: 26, accel: 13, brake: 26, grip: 3.4, mass: 1.0, color: 0xd8543c },
    baruna: { name: 'Baruna 4D',   maxSpeed: 31, accel: 15, brake: 28, grip: 3.1, mass: 1.15, color: 0x3c78d8 },
    gelora: { name: 'Gelora GT',   maxSpeed: 43, accel: 23, brake: 34, grip: 3.8, mass: 0.95, color: 0xf2b134 },
    tangguh:{ name: 'Tangguh Pickup', maxSpeed: 24, accel: 11, brake: 24, grip: 2.7, mass: 1.5, color: 0x5f8f5a },
    patrol: { name: 'Patrol Unit', maxSpeed: 36, accel: 19, brake: 32, grip: 3.5, mass: 1.2, color: 0xf2f2f2 },
  },
  collisionDamageFactor: 2.6,
  // --- world layout ---
  worldHalf: 150,
  waterZ: 118,
  dockZ: 96,
  safehouse: { x: -12, z: 88 },
  shopPos: { x: 34, z: 28 },
  spawn: { x: -8, z: 82 },
  // --- population targets ---
  pop: { citizens: 16, shopkeepers: 5, dockworkers: 6, children: 5, animals: 6, thugs: 3 },
  trafficCars: 7,
  parkedCars: 8,
};
// Road network: rectangular circuits traffic follows, plus cross streets.
export const ROADS = {
  ringX: [-60, 60],       // vertical avenues at x = -60 and x = 60
  ringZ: [-60, 40],       // horizontal streets at z = -60 and z = 40
  midX: 0,                // central avenue x = 0
  midZ: -10,              // central street z = -10
  width: 11,
};
// Named original places of Purnama Bay.
export const PLACES = {
  city: 'Purnama Bay',
  syndicate: 'Kala Syndicate',
  hero: 'Raka Pradana',
  contact: 'Mira Santoso',
  shopName: 'PURNAMA ARMS',
  cafe: 'Kopi Ombak Cafe',
  garage: 'Bengkel Samudra',
  warehouse: 'Gudang Pelita No. 9',
};
export const WEAPON_SLOTS = [
  { id: 'fists', label: 'Fists', key: '0' },
  { id: 'baton', label: 'Baton', key: '1' },
  { id: 'pistol', label: 'Pistol', key: '2' },
];
