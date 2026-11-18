// Touch controls: analogue joystick bottom-left (magnitude walks -> runs ->
// sprints on foot; steers + throttles in a car), action buttons bottom-right
// (all >= 56 px, thumb spaced), right-half drag for the camera, and the
// landscape gate: a portrait touch device shows ROTATE YOUR DEVICE and the
// game does not start until the device is landscape.
export function createTouch(handlers) {
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches);
  const ui = document.getElementById('touch-ui');
  const rotate = document.getElementById('rotate-overlay');
  const base = document.getElementById('joy-base');
  const stick = document.getElementById('joy-stick');
  const state = {
    isTouch,
    moveX: 0, moveY: 0, moveMag: 0,
    brake: false, atk: false,
    joyId: null, camId: null, camLast: null,
  };
  function portrait() { return window.innerHeight > window.innerWidth; }
  function mustRotate() { return isTouch && portrait(); }
  function refreshGate() {
    rotate.style.display = mustRotate() ? 'flex' : 'none';
  }
  window.addEventListener('resize', refreshGate);
  window.addEventListener('orientationchange', refreshGate);
  refreshGate();

  function setPlaying(playing, driving) {
    ui.style.display = isTouch && playing ? 'block' : 'none';
    document.getElementById('btn-brake').style.display = driving ? 'flex' : 'none';
    document.getElementById('btn-jump').style.display = driving ? 'none' : 'flex';
    document.getElementById('btn-crouch').style.display = driving ? 'none' : 'flex';
    document.getElementById('btn-kick').style.display = driving ? 'none' : 'flex';
  }

  // --- joystick ---
  function joyMove(t) {
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const len = Math.hypot(dx, dy), max = r.width / 2 - 6;
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    stick.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    state.moveX = dx / max;
    state.moveY = dy / max;
    state.moveMag = Math.min(1, Math.hypot(state.moveX, state.moveY));
  }
  function joyEnd() {
    state.joyId = null; state.moveX = 0; state.moveY = 0; state.moveMag = 0;
    stick.style.transform = 'translate(-50%,-50%)';
  }
  base.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    state.joyId = t.identifier;
    joyMove(t);
    handlers.onAnyTouch();
  }, { passive: false });
  window.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === state.joyId) joyMove(t);
      else if (t.identifier === state.camId && state.camLast) {
        handlers.onCameraDrag(t.clientX - state.camLast.x, t.clientY - state.camLast.y);
        state.camLast = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === state.joyId) joyEnd();
      if (t.identifier === state.camId) state.camId = null;
    }
  });

  // --- camera drag on the right half of the game canvas ---
  const holder = document.getElementById('game-holder');
  holder.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX > window.innerWidth * 0.45 && state.camId === null) {
        state.camId = t.identifier;
        state.camLast = { x: t.clientX, y: t.clientY };
      }
    }
  }, { passive: true });

  // --- buttons ---
  function bind(id, down, up) {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); down(); handlers.onAnyTouch(); }, { passive: false });
    if (up) el.addEventListener('touchend', (e) => { e.preventDefault(); up(); }, { passive: false });
  }
  bind('btn-act', () => handlers.onAct());
  bind('btn-jump', () => handlers.onJump());
  bind('btn-crouch', () => handlers.onCrouch());
  bind('btn-kick', () => handlers.onKick());
  bind('btn-weapon', () => handlers.onWeapon());
  bind('btn-pause-t', () => handlers.onPause());
  bind('btn-atk', () => { state.atk = true; handlers.onAttack(); }, () => { state.atk = false; });
  bind('btn-brake', () => { state.brake = true; }, () => { state.brake = false; });

  // Mouse fallback so the joystick can be exercised on a desktop too.
  let mouseJoy = false;
  base.addEventListener('mousedown', (e) => { mouseJoy = true; joyMove(e); });
  window.addEventListener('mousemove', (e) => { if (mouseJoy) joyMove(e); });
  window.addEventListener('mouseup', () => { if (mouseJoy) { mouseJoy = false; joyEnd(); } });

  return { state, isTouch, mustRotate, refreshGate, setPlaying };
}
