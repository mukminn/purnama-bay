// PURNAMA BAY - the wanted model. Stars are earned ONLY through witnessed
// crime, never granted directly:
//  - an unseen crime raises nothing;
//  - the first witnessed crime of an incident is exactly one star;
//  - a continuing incident (inside the window, same area) counts once;
//  - each genuinely new incident, after the raise cooldown, adds exactly
//    one star - the level can never jump by two;
//  - at 3+ stars, staying visible under pressure for a long stretch adds
//    one more star at a time;
//  - unseen, stars decay one at a time - faster crouched, still and hidden;
//  - an unseen vehicle swap or a safehouse clothes change clears the
//    police description (knownFace / knownVehicle).
import { S, CFG, dist2d } from './config.js';

export const W = {
  stars: 0,
  knownFace: false,
  knownVehicle: false,
  seenByPolice: false,
  crimesSeen: 0,
  crimesUnseen: 0,
  incidentStart: -100,
  incidentX: 0, incidentZ: 0,
  lastSeenX: 0, lastSeenZ: 0,
  lastRaise: -100,
  lastSeen: -100,
  unseenFor: 0,
  pressureFor: 0,
  vehiclePlate: '',
};

export function wantedSnapshot() {
  return {
    stars: W.stars,
    knownFace: W.knownFace,
    knownVehicle: W.knownVehicle,
    seenByPolice: W.seenByPolice,
    crimesSeen: W.crimesSeen,
    crimesUnseen: W.crimesUnseen,
    now: S.time,
    sinceIncident: S.time - W.incidentStart,
    sinceRaise: S.time - W.lastRaise,
  };
}

// Is there a witness for a crime committed at (x, z)? Adults nearby count,
// the victim included; children never count and are never involved; a
// police unit nearby also sees it.
export function crimeIsWitnessed(x, z, victim) {
  for (const n of S.npcs) {
    if (n.kind === 'child' || n.kind === 'animal' || n.state === 'down' || n.state === 'dead') continue;
    if (dist2d(x, z, n.x, n.z) <= CFG.witnessRadius) return true;
  }
  if (victim && victim.kind !== 'child' && victim.kind !== 'animal') return true;
  for (const u of S.policeUnits) {
    if (dist2d(x, z, u.x, u.z) <= CFG.policeSeeRadius) return true;
  }
  return false;
}

// Report a crime through the one pipeline every crime uses.
// Returns {seen, raised}.
export function reportCrime(x, z, victim) {
  const seen = crimeIsWitnessed(x, z, victim);
  if (!seen) {
    W.crimesUnseen++;
    S.stats.crimesUnseen++;
    return { seen: false, raised: false };
  }
  W.crimesSeen++;
  S.stats.crimesSeen++;
  W.lastSeen = S.time;
  W.lastSeenX = x;
  W.lastSeenZ = z;
  if (S.inCar && S.currentCar) { W.knownVehicle = true; W.vehiclePlate = S.currentCar.model; }
  else W.knownFace = true;
  const inIncident = (S.time - W.incidentStart) <= CFG.incidentWindow
    && dist2d(x, z, W.incidentX, W.incidentZ) <= 26;
  if (inIncident) return { seen: true, raised: false };
  W.incidentStart = S.time; W.incidentX = x; W.incidentZ = z;
  if (S.time - W.lastRaise < CFG.raiseCooldown) return { seen: true, raised: false };
  if (W.stars >= 5) return { seen: true, raised: false };
  W.stars += 1;
  W.lastRaise = S.time;
  W.unseenFor = 0;
  return { seen: true, raised: true };
}

// Is the player currently visible to the law (police close, or committing
// in front of witnesses while wanted)?
export function playerIsSeen() {
  const p = S.p;
  for (const u of S.policeUnits) {
    if (dist2d(p.x, p.z, u.x, u.z) <= CFG.policeSeeRadius) return true;
  }
  return false;
}

export function updateWanted(dt) {
  const seen = playerIsSeen();
  W.seenByPolice = seen;
  if (seen) {
    W.lastSeen = S.time;
    W.lastSeenX = S.p.x;
    W.lastSeenZ = S.p.z;
    W.unseenFor = 0;
    if (W.stars >= 3) {
      W.pressureFor += dt;
      if (W.pressureFor >= CFG.pressureEvery && W.stars < 5 && S.time - W.lastRaise >= CFG.raiseCooldown) {
        W.stars += 1;
        W.lastRaise = S.time;
        W.pressureFor = 0;
      }
    }
  } else {
    W.pressureFor = 0;
    if (W.stars > 0) {
      W.unseenFor += dt;
      const hiddenStill = S.p.crouch && !S.p.moving && !S.inCar;
      const need = hiddenStill ? CFG.decayCrouch : CFG.decayStand;
      if (W.unseenFor >= need) {
        W.stars -= 1;
        W.unseenFor = 0;
        if (W.stars === 0) { W.knownFace = false; W.knownVehicle = false; }
      }
    }
  }
}

// An unseen change of vehicle breaks the vehicle description.
export function noteVehicleSwap(car) {
  if (!playerIsSeen() && W.knownVehicle && car && car.model !== W.vehiclePlate) {
    W.knownVehicle = false;
  }
}

// Changing clothes at the safehouse breaks the face description.
export function noteClothesChange() {
  if (!playerIsSeen()) W.knownFace = false;
}

// Seconds of grace left before the next decay step lands (HUD flavour).
export function decayProgress() {
  if (W.stars <= 0) return 1;
  const hiddenStill = S.p.crouch && !S.p.moving && !S.inCar;
  const need = hiddenStill ? CFG.decayCrouch : CFG.decayStand;
  return Math.min(1, W.unseenFor / need);
}

export function clearWanted() {
  W.stars = 0; W.knownFace = false; W.knownVehicle = false;
  W.unseenFor = 0; W.pressureFor = 0;
}
