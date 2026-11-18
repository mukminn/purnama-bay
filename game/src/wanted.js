// Wanted model — WITNESS based, with the house rules layered on top:
//  * a crime nobody sees never raises wanted;
//  * the first seen crime is EXACTLY 1 star;
//  * a continuing incident (within ~3.5 s and the same area) counts as ONE;
//  * +1 per new incident, at least 6 s between raises, never +2 from one act;
//  * 5 stars only by pressure escalation (kept in police sight at >=3 stars:
//    +1 per ~30 s, max 5);
//  * stars fall one at a time while unseen — crouching hidden falls faster;
//  * an unseen vehicle change / safehouse clothes change clears the matching
//    description (face / vehicle) and speeds the cooldown.
import { CFG } from './config.js';

export function createWanted(onChange) {
  const w = {
    stars: 0,
    knownFace: false,       // police know what the player looks like
    knownVehicle: false,    // police know the player's current vehicle
    now: 0,
    lastIncidentT: -99,
    lastIncidentPos: { x: 0, z: 0 },
    lastRaiseT: -99,
    lastSeenPos: null,      // last place police actually saw the player
    seenByPolice: false,
    escT: 0,
    decayT: 0,
    crimesSeen: 0,
    crimesUnseen: 0,
  };
  function setStars(n) {
    n = Math.max(0, Math.min(5, n));
    if (n !== w.stars) {
      w.stars = n;
      if (onChange) onChange(n);
    }
  }
  // The one and only door into wanted. Gameplay crime and the probe's
  // spawnWitnessCrime() both call exactly this.
  w.reportCrime = function ({ x, z, civilianWitnesses = 0, policeWitness = false, inVehicle = false }) {
    const witnessed = policeWitness || civilianWitnesses > 0;
    if (!witnessed) { w.crimesUnseen++; return { raised: false, unseen: true, stars: w.stars }; }
    w.crimesSeen++;
    if (inVehicle) w.knownVehicle = true; else w.knownFace = true;
    w.lastSeenPos = { x, z };
    const sinceIncident = w.now - w.lastIncidentT;
    const nearIncident = Math.hypot(x - w.lastIncidentPos.x, z - w.lastIncidentPos.z) < CFG.incidentRadius;
    if (sinceIncident < CFG.incidentWindow && nearIncident) {
      return { raised: false, sameIncident: true, stars: w.stars };
    }
    w.lastIncidentT = w.now;
    w.lastIncidentPos = { x, z };
    if (w.now - w.lastRaiseT < CFG.raiseCooldown) {
      return { raised: false, coolingDown: true, stars: w.stars };
    }
    if (w.stars < 5) {
      setStars(w.stars + 1); // exactly +1, always — never more from one act
      w.lastRaiseT = w.now;
      w.decayT = 0;
      return { raised: true, stars: w.stars };
    }
    return { raised: false, stars: w.stars };
  };
  w.update = function (dt, { seenByPolice, hidden }) {
    w.now += dt;
    w.seenByPolice = seenByPolice;
    if (w.stars === 0) { w.escT = 0; w.decayT = 0; return; }
    if (seenByPolice) {
      w.decayT = 0;
      if (w.stars >= 3 && w.stars < 5) {
        w.escT += dt;
        if (w.escT >= CFG.escalationInterval) {
          w.escT = 0;
          setStars(w.stars + 1);
          w.lastRaiseT = w.now;
        }
      } else w.escT = 0;
    } else {
      w.escT = 0;
      const interval = hidden ? CFG.decayIntervalHidden : CFG.decayInterval;
      w.decayT += dt;
      if (w.decayT >= interval) {
        w.decayT = 0;
        setStars(w.stars - 1); // one at a time
        if (w.stars === 0) { w.knownFace = false; w.knownVehicle = false; }
      }
    }
  };
  // Disguise: unseen vehicle swap clears the vehicle description; changing
  // clothes at the safehouse clears the face description. Both speed cooling.
  w.clearVehicleDescription = function () {
    if (w.knownVehicle) { w.knownVehicle = false; w.decayT += 4; }
  };
  w.clearFaceDescription = function () {
    if (w.knownFace) { w.knownFace = false; w.decayT += 4; }
  };
  // Search state for the HUD/minimap: police hunt the last seen position and
  // the ring shrinks as the cooldown progresses.
  w.searchInfo = function () {
    if (w.stars === 0 || !w.lastSeenPos) return null;
    const interval = CFG.decayInterval;
    const progress = Math.min(1, w.decayT / interval);
    return {
      x: w.lastSeenPos.x, z: w.lastSeenPos.z,
      radius: CFG.searchRadius * (1 - progress * 0.55),
      progress,
      seen: w.seenByPolice,
    };
  };
  // Snapshot for the debug hook / HUD (plain data, no live references).
  w.snapshot = function () {
    return {
      stars: w.stars, knownFace: w.knownFace, knownVehicle: w.knownVehicle,
      seenByPolice: w.seenByPolice, crimesSeen: w.crimesSeen, crimesUnseen: w.crimesUnseen,
      now: Math.round(w.now * 10) / 10, sinceIncident: Math.round((w.now - w.lastIncidentT) * 10) / 10,
      sinceRaise: Math.round((w.now - w.lastRaiseT) * 10) / 10,
    };
  };
  w.clearAll = function () { // busted / served: slate wiped
    setStars(0);
    w.knownFace = false; w.knownVehicle = false;
    w.escT = 0; w.decayT = 0; w.lastSeenPos = null;
  };
  return w;
}
