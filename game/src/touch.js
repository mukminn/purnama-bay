// PURNAMA BAY - touch controls for phones held in landscape: an analogue
// joystick bottom-left and big thumb buttons bottom-right (every button at
// least 56 px, most are 64). Mouse input drives the same state on desktop
// so the layout can be tested without a phone.
import { S } from './config.js';

export function isTouchCapable() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
}

let joyId = null;
let joyCenter = { x: 0, y: 0 };
const RADIUS = 44;

function setKnob(dx, dy) {
  const knob = document.getElementById('joy-knob');
  if (knob) knob.style.transform = `translate(${dx}px, ${dy}px)`;
  S.input.joyX = dx / RADIUS;
  S.input.joyY = dy / RADIUS;
  S.input.joyActive = Math.abs(dx) > 4 || Math.abs(dy) > 4;
}

function joyPoint(t) {
  let dx = t.clientX - joyCenter.x;
  let dy = t.clientY - joyCenter.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len > RADIUS) { dx = dx / len * RADIUS; dy = dy / len * RADIUS; }
  setKnob(dx, dy);
}

function bindButton(id, onDown, onUp) {
  const b = document.getElementById(id);
  if (!b) return;
  let lastFire = 0;
  const fire = (e) => {
    const now = performance.now();
    if (now - lastFire < 250) return;
    lastFire = now;
    if (e) e.preventDefault();
    onDown();
  };
  b.addEventListener('touchstart', fire, { passive: false });
  b.addEventListener('click', fire);
  if (onUp) {
    b.addEventListener('touchend', (e) => { e.preventDefault(); onUp(); });
    b.addEventListener('touchcancel', () => onUp());
  }
}

export function initTouch(hooks) {
  const base = document.getElementById('joy-base');
  if (base) {
    const rect = () => { const r = base.getBoundingClientRect(); joyCenter = { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
    base.addEventListener('touchstart', (e) => {
      rect();
      const t = e.changedTouches[0];
      joyId = t.identifier;
      joyPoint(t);
      e.preventDefault();
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      if (joyId === null) return;
      for (const t of e.changedTouches) if (t.identifier === joyId) joyPoint(t);
    }, { passive: true });
    const endJoy = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) { joyId = null; setKnob(0, 0); S.input.joyActive = false; }
      }
      void e;
    };
    window.addEventListener('touchend', endJoy);
    window.addEventListener('touchcancel', endJoy);
    // mouse drag mirrors the stick for desktop testing
    let mouseDown = false;
    base.addEventListener('mousedown', (e) => { rect(); mouseDown = true; joyPoint(e); });
    window.addEventListener('mousemove', (e) => { if (mouseDown) joyPoint(e); });
    window.addEventListener('mouseup', () => { if (mouseDown) { mouseDown = false; setKnob(0, 0); S.input.joyActive = false; } });
  }
  bindButton('btn-act', () => { if (hooks && hooks.onAct) hooks.onAct(); });
  bindButton('btn-jump', () => { if (hooks && hooks.onJump) hooks.onJump(); });
  bindButton('btn-hit', () => { if (hooks && hooks.onHit) hooks.onHit(); });
  bindButton('btn-brake',
    () => { S.input.brakeTouch = true; },
    () => { S.input.brakeTouch = false; });
}

// Current stick deflection as a plain snapshot (debug + future gamepad).
export function stickSnapshot() {
  return { x: S.input.joyX, y: S.input.joyY, active: S.input.joyActive };
}

export function refreshTouchVisibility() {
  const ui = document.getElementById('touch-ui');
  if (!ui) return;
  const show = isTouchCapable() && S.mode === 'playing';
  ui.style.display = show ? 'block' : 'none';
  const brake = document.getElementById('btn-brake');
  if (brake) brake.style.display = show && S.inCar ? 'flex' : 'none';
  const hit = document.getElementById('btn-hit');
  if (hit) hit.style.display = show && !S.inCar ? 'flex' : 'none';
}
