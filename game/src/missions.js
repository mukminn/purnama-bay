// Story missions: Raka Pradana, a dock courier framed by the Kala Syndicate,
// works off his debt for harbour contact Mira Santoso. Six missions in a row:
// drive a delivery, haul dock crates on foot, steal one specific car, sneak
// crouched into a warehouse, run a target car to a stop, and a final escape
// to the safehouse under a full police response. Rewards are the ONLY way
// money enters the game.
import * as THREE from '../vendor/three.module.min.js';
import { createHuman, poseHuman } from './characters.js';

export const MISSION_DEFS = [
  {
    id: 1, title: 'First Run', reward: 400,
    intro: [
      { who: 'Mira', text: 'Raka. The syndicate says you lost their crate. I say you were framed — but talk is cheap on this dock.' },
      { who: 'Mira', text: 'Prove you can still work. Take the parked car, pick up the package by the pier and bring it to Kopi Ombak Cafe.' },
      { who: 'Raka', text: 'One clean run. Then we talk about who set me up.' },
    ],
    stages: [
      { type: 'goTo', text: 'Get in the parked Pijar by the shore road', target: { x: -2, z: 74 }, radius: 4, anyMode: true },
      { type: 'driveTo', text: 'Drive to the package at the pier', target: { x: -18, z: 98 }, radius: 5.5 },
      { type: 'driveTo', text: 'Deliver the package to Kopi Ombak Cafe', target: { x: -30, z: 4 }, radius: 6 },
    ],
    outro: [{ who: 'Mira', text: 'Clean and quick. That is PB$ 400 — and a name: the night clerk at Gudang Pelita signed your fake manifest.' }],
  },
  {
    id: 2, title: 'Dock Hands', reward: 350,
    intro: [
      { who: 'Mira', text: 'The dock crew is short-handed and the foreman owes me. Move three crates onto the pier marks before the tide bell.' },
      { who: 'Raka', text: 'On foot, in this heat. You drive a hard bargain, Mira.' },
    ],
    stages: [
      { type: 'collect', text: 'Carry crates to the pier marks', points: [{ x: -40, z: 88 }, { x: -16, z: 90 }, { x: -34, z: 112 }], radius: 2.6 },
    ],
    outro: [{ who: 'Mira', text: 'The foreman paid in cash — PB$ 350. He also saw a yellow Gelora GT the night you were framed.' }],
  },
  {
    id: 3, title: 'Borrowed Wheels', reward: 600,
    intro: [
      { who: 'Mira', text: 'That yellow Gelora GT belongs to a Kala money-runner. It is parked behind Hotel Bulan, unwatched.' },
      { who: 'Mira', text: 'Borrow it. Bring it to Bengkel Samudra — the papers inside are worth more than the car.' },
    ],
    stages: [
      { type: 'stealCar', text: 'Steal the yellow Gelora GT behind Hotel Bulan', target: { x: 30, z: -38 }, radius: 5, anyMode: true },
      { type: 'driveTo', text: 'Bring the Gelora GT to Bengkel Samudra garage', target: { x: 62, z: -12 }, radius: 6.5, needsStealCar: true },
    ],
    outro: [{ who: 'Mira', text: 'The glovebox held a ledger copy and PB$ 600 for your trouble. The original ledger sits in Gudang Pelita No. 9.' }],
  },
  {
    id: 4, title: 'Quiet Warehouse', reward: 750,
    intro: [
      { who: 'Mira', text: 'Gudang Pelita No. 9, on the dock spur. Two guards, one red ledger. Crouch, stay low, stay unseen.' },
      { who: 'Raka', text: 'If they spot me?' },
      { who: 'Mira', text: 'Then it stops being quiet. Grab the ledger and get out to the pier gate anyway.' },
    ],
    stages: [
      { type: 'sneak', text: 'Crouch (C) and sneak to the red ledger inside Gudang Pelita', target: { x: -46, z: 63 }, radius: 2.4 },
      { type: 'goTo', text: 'Slip out to the pier gate', target: { x: -46, z: 84 }, radius: 3.5, anyMode: true },
    ],
    outro: [{ who: 'Mira', text: 'The ledger names the real thief: Dario Kala himself. PB$ 750. One problem — he knows you have it.' }],
  },
  {
    id: 5, title: 'Tail Breaker', reward: 900,
    intro: [
      { who: 'Mira', text: 'Dario is running. His Baruna just left the ring road — chase it down and stop it. Ram it, shoot its tyres, whatever works.' },
      { who: 'Raka', text: 'Stop the car, not the man. Understood.' },
    ],
    stages: [
      { type: 'chase', text: 'Chase the fleeing Baruna and force it to stop', target: { x: 57, z: -40 }, radius: 9, anyMode: true },
    ],
    outro: [{ who: 'Mira', text: 'Dario talked. He will testify — if you live long enough to deliver him. PB$ 900. Get home, Raka. Now.' }],
  },
  {
    id: 6, title: 'Last Ferry Out', reward: 1500,
    intro: [
      { who: 'Mira', text: 'The syndicate torched a Kala warehouse and pinned it on you — every patrol in Purnama Bay has your face.' },
      { who: 'Mira', text: 'Reach your safehouse by the shore and lie low until the ferry. Do not get caught.' },
    ],
    stages: [
      { type: 'escape', text: 'Escape to your safehouse (Rumah Raka, shore road)', target: { x: -12, z: 88 }, radius: 5, anyMode: true },
    ],
    outro: [
      { who: 'Mira', text: 'You made it. Dario testifies at dawn; the frame collapses; the bay is yours again.' },
      { who: 'Raka', text: 'Purnama Bay. Home — crooked, golden, and home.' },
    ],
  },
];

export function createMissionRunner(hooks) {
  const runner = {
    index: 0,           // next mission to run (0-based)
    active: null,       // { def, stageIdx, collected:Set, startedAt }
    done: false,
    guards: [],
    start(i) {
      const def = MISSION_DEFS[i];
      if (!def) { this.done = true; return; }
      this.active = { def, stageIdx: 0, collected: new Set(), t: 0, alarmed: false };
      hooks.onMissionStart(def);
      hooks.showDialog(def.intro, () => {});
      if (def.id === 3) hooks.spawnStealCar();
      if (def.id === 4) this.spawnGuards();
      if (def.id === 5) hooks.spawnChaseCar();
      if (def.id === 6) hooks.triggerEscapeCrime();
    },
    stage() { return this.active ? this.active.def.stages[this.active.stageIdx] : null; },
    stageText() {
      const s = this.stage();
      if (!s) return '';
      if (s.type === 'collect') return `${s.text} (${this.active.collected.size}/${s.points.length})`;
      return s.text;
    },
    advance() {
      const a = this.active;
      a.stageIdx++;
      a.collected = new Set();
      if (a.stageIdx >= a.def.stages.length) {
        const def = a.def;
        this.active = null;
        this.clearGuards();
        hooks.showDialog(def.outro, () => {});
        hooks.onMissionComplete(def); // <- the reward is paid here, nowhere else
        this.index++;
        if (this.index >= MISSION_DEFS.length) this.done = true;
        else this.start(this.index);
      }
    },
    spawnGuards() {
      this.clearGuards();
      for (let i = 0; i < 2; i++) {
        const group = createHuman({ skin: 0x8a5a3b, hair: 0x0f0a06, shirt: 0x3a3f45, pants: 0x23272e, cap: 0xb03a2e, scale: 0.97 });
        hooks.scene.add(group);
        this.guards.push({
          group, pos: group.position, heading: i * Math.PI, phase: 0,
          a: { x: -52 + i * 10, z: 60 }, b: { x: -40 - i * 2, z: 70 },
          toB: i === 0, seeT: 0,
        });
        const g = this.guards[this.guards.length - 1];
        g.pos.set(g.a.x, 0, g.a.z);
      }
    },
    clearGuards() {
      for (const g of this.guards) hooks.scene.remove(g.group);
      this.guards = [];
    },
    // Guards patrol the warehouse; a standing or moving player in their view
    // raises the alarm once (a witnessed trespass through the real crime path).
    updateGuards(dt, snap) {
      if (!this.active || this.active.def.id !== 4 || this.active.stageIdx !== 0) return;
      for (const g of this.guards) {
        const target = g.toB ? g.b : g.a;
        const dx = target.x - g.pos.x, dz = target.z - g.pos.z;
        if (Math.hypot(dx, dz) < 0.6) g.toB = !g.toB;
        else {
          g.heading = Math.atan2(dx, dz);
          g.pos.x += Math.sin(g.heading) * 1.5 * dt;
          g.pos.z += Math.cos(g.heading) * 1.5 * dt;
          g.phase += dt * 6;
        }
        g.group.position.copy(g.pos);
        g.group.rotation.y = g.heading;
        poseHuman(g.group, { mode: 'walk', moving: true, speed01: 0.3, phase: g.phase, time: snap.t }, dt);
        // vision: 10 m cone; a crouched, still player reads as hidden past 4 m
        const pd = Math.hypot(snap.playerPos.x - g.pos.x, snap.playerPos.z - g.pos.z);
        const fx = Math.sin(g.heading), fz = Math.cos(g.heading);
        const dot = pd < 0.01 ? 1 : ((snap.playerPos.x - g.pos.x) * fx + (snap.playerPos.z - g.pos.z) * fz) / pd;
        const hidden = snap.playerCrouch && snap.playerStill && pd > 4;
        if (pd < 10 && dot > 0.35 && !hidden && !this.active.alarmed) {
          g.seeT += dt;
          if (g.seeT > 0.7) {
            this.active.alarmed = true;
            hooks.onGuardAlarm(g.pos);
          }
        } else g.seeT = Math.max(0, g.seeT - dt);
      }
    },
    // Chase stage resolution, fed by main each frame while mission 5 runs:
    // the target counts as stopped when its car is wrecked or held still.
    chaseResolved(snap) {
      const a = this.active;
      if (!a || a.def.id !== 5) return false;
      return !!(snap.chaseCar && (snap.chaseCar.dead || snap.chaseCar.health <= 22 || snap.chaseStoppedFor > 2.5));
    },
    update(dt, snap) {
      const a = this.active;
      if (!a) return;
      if (this.chaseResolved(snap)) { this.advance(); return; }
      a.t += dt;
      this.updateGuards(dt, snap);
      const s = this.stage();
      if (!s) return;
      const p = snap.playerPos;
      if (s.type === 'collect') {
        s.points.forEach((pt, i) => {
          if (a.collected.has(i)) return;
          if (Math.hypot(p.x - pt.x, p.z - pt.z) < s.radius && snap.mode === 'foot') {
            a.collected.add(i);
            hooks.onCollect(i, s.points.length);
          }
        });
        if (a.collected.size >= s.points.length) this.advance();
        return;
      }
      const d = Math.hypot(p.x - s.target.x, p.z - s.target.z);
      if (d > s.radius) return;
      if (s.type === 'driveTo' && snap.mode !== 'car' && !s.anyMode) return;
      if (s.needsStealCar && !snap.inStealCar) return;
      if (s.type === 'stealCar' && !snap.inStealCar) return;
      if (s.type === 'sneak' && !(snap.playerCrouch || snap.playerStill)) {
        // reaching the ledger standing still counts too — it is inside the shed
        if (!snap.playerCrouch && snap.mode !== 'foot') return;
      }
      if (s.type === 'escape' && snap.wantedStars === 0 && a.t > 4) { /* still must arrive */ }
      this.advance();
    },
  };
  return runner;
}
