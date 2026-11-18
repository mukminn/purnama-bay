// PURNAMA BAY - touch controls for phones held in landscape: a slim
// analogue joystick bottom-left and thumb buttons bottom-right sized
// 48-54 px (see index.html), plus camera drag: a finger dragged over the
// right half of the open game view orbits the camera, and a mouse drag
// on the canvas does the same on desktop. Mouse input also drives the
// stick on desktop so the layout can be tested without a phone.
import { S } from './config.js';

export function isTouchCapable() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
}

// Round 11 (P2-4): the PC/HP mode is no longer frozen at page load.
// A manual override (the pause panel's MODE button) wins; otherwise
// touch hardware means HP, and on hardware that reports no touch a
// first real touch input still flips the session to HP.
let modeOverride = null; // 'PC' | 'HP' | null
let firstInputTouch = false;
export function deviceMode() {
  if (modeOverride) return modeOverride;
  if (isTouchCapable() || firstInputTouch) return 'HP';
  return 'PC';
}
export function setModeOverride(m) { modeOverride = (m === 'PC' || m === 'HP') ? m : null; }
export function modeOverrideValue() { return modeOverride; }
export function cycleDeviceMode() {
  setModeOverride(deviceMode() === 'HP' ? 'PC' : 'HP');
  return deviceMode();
}

let joyId = null;
let joyCenter = { x: 0, y: 0 };
// stick travel in px: matches the slimmed 96 px base / 44 px knob, and a
// drag past the base edge still clamps to full deflection
const RADIUS = 28;

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
  window.addEventListener('touchstart', () => { firstInputTouch = true; }, { passive: true });
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
  // ---- camera drag: orbit with a finger on the open right half of the
  // screen, or with the mouse on the canvas. Touches that START on the
  // joystick, a button or any panel never rotate the camera, and button
  // taps keep working because those touches are claimed elsewhere.
  const isUiTarget = (t) => !!(t && t.closest
    && t.closest('#joy-base, .tbtn, button, #dialog, #shop, #menu, #end-overlay, #rotate-overlay, #map-overlay, #minimap-wrap'));
  let camTouchId = null;
  let camLast = { x: 0, y: 0 };
  window.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (camTouchId !== null) continue;
      if (isUiTarget(e.target)) continue;
      if (t.clientX < window.innerWidth * 0.5) continue; // right half only
      camTouchId = t.identifier;
      camLast = { x: t.clientX, y: t.clientY };
    }
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (camTouchId === null) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== camTouchId) continue;
      const dx = t.clientX - camLast.x;
      const dy = t.clientY - camLast.y;
      camLast = { x: t.clientX, y: t.clientY };
      if ((dx || dy) && hooks && hooks.onCamDrag) hooks.onCamDrag(dx, dy);
    }
  }, { passive: true });
  const endCam = (e) => {
    for (const t of e.changedTouches) if (t.identifier === camTouchId) camTouchId = null;
  };
  window.addEventListener('touchend', endCam);
  window.addEventListener('touchcancel', endCam);
  // desktop: drag the game canvas itself (clicks still fire via main.js)
  const sceneEl = document.getElementById('scene');
  if (sceneEl) {
    let camMouse = false;
    sceneEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || !e.target || e.target.tagName !== 'CANVAS') return;
      camMouse = true;
      camLast = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('mousemove', (e) => {
      if (!camMouse) return;
      const dx = e.clientX - camLast.x;
      const dy = e.clientY - camLast.y;
      camLast = { x: e.clientX, y: e.clientY };
      if ((dx || dy) && hooks && hooks.onCamDrag) hooks.onCamDrag(dx, dy);
    });
    window.addEventListener('mouseup', () => { camMouse = false; });
  }

  bindButton('btn-act', () => { if (hooks && hooks.onAct) hooks.onAct(); });
  bindButton('btn-jump', () => { if (hooks && hooks.onJump) hooks.onJump(); });
  bindButton('btn-hit', () => { if (hooks && hooks.onHit) hooks.onHit(); });
  bindButton('btn-brake',
    () => { S.input.brakeTouch = true; },
    () => { S.input.brakeTouch = false; });
  bindButton('btn-map', () => { if (hooks && hooks.onMap) hooks.onMap(); });
  bindButton('btn-cam', () => { if (hooks && hooks.onCamMode) hooks.onCamMode(); });
}

// Current stick deflection as a plain snapshot (debug + future gamepad).
export function stickSnapshot() {
  return { x: S.input.joyX, y: S.input.joyY, active: S.input.joyActive };
}

export function refreshTouchVisibility() {
  const ui = document.getElementById('touch-ui');
  if (!ui) return;
  const show = deviceMode() === 'HP' && S.mode === 'playing';
  ui.style.display = show ? 'block' : 'none';
  const brake = document.getElementById('btn-brake');
  if (brake) brake.style.display = show && S.inCar ? 'flex' : 'none';
  const hit = document.getElementById('btn-hit');
  if (hit) hit.style.display = show && !S.inCar ? 'flex' : 'none';
}
