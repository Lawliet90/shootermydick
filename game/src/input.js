// Keyboard + pointer-lock mouse input. Edge-triggered presses are queued
// and drained once per fixed step by the main loop.
// Touch controls (touch.js) write into the same state: addLook() feeds the
// look accumulator like mousemove, press() injects an edge-triggered key,
// and the virtual joystick synthesises WASD keys + touchMag (analog speed).
export function createInput(canvas, onLockChange) {
  const state = {
    keys: new Set(),
    firing: false,
    ads: false,
    locked: false,
    touchMag: 1, // analog move magnitude from the touch joystick (1 = full)
  };
  let lookX = 0;
  let lookY = 0;
  const pressed = new Set();
  // Fallback mouse-look: pointer lock is denied inside some embedded
  // webviews/iframes (the request rejects and 'locked' never turns true),
  // which used to leave the mouse completely dead — no look, no fire.
  // While fallback is on (main enables it during live rounds), plain
  // mousemove deltas steer the camera and clicks still fire; clicking the
  // canvas also retries pointer lock so a real desktop browser upgrades
  // back to true locked aim.
  let fallback = false;
  let lockFailed = false;
  let lastLockTry = 0;

  // Mouse input is live when locked, or when the fallback is on. Menu /
  // buy / pause overlays turn the fallback off so clicks there never
  // steer the camera or pull the trigger behind the panel.
  function mouseLive() { return state.locked || fallback; }

  function onKeyDown(e) {
    if (e.code === 'Space') e.preventDefault();
    if (!e.repeat) pressed.add(e.code);
    state.keys.add(e.code);
  }
  function onKeyUp(e) { state.keys.delete(e.code); }
  function onMouseMove(e) {
    if (!mouseLive()) return;
    lookX += e.movementX || 0;
    lookY += e.movementY || 0;
  }
  function onMouseDown(e) {
    if (!mouseLive()) return;
    if (e.button === 0) state.firing = true;
    if (e.button === 2) state.ads = true;
    // Unlocked fallback: a click on the 3D view retries pointer lock
    // (throttled — Chrome rejects re-locks fired too soon after an exit).
    if (!state.locked && e.target === canvas) {
      const now = performance.now();
      if (now - lastLockTry > 1500) { lastLockTry = now; api.requestLock(); }
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) state.firing = false;
    if (e.button === 2) state.ads = false;
  }
  function onLock() {
    state.locked = document.pointerLockElement === canvas;
    if (state.locked) lockFailed = false;
    if (onLockChange) onLockChange(state.locked);
  }
  function onLockError() { lockFailed = true; }
  function onContext(e) { e.preventDefault(); }
  function onBlur() { state.keys.clear(); state.firing = false; state.ads = false; }

  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLock);
  document.addEventListener('pointerlockerror', onLockError);
  document.addEventListener('contextmenu', onContext);
  window.addEventListener('blur', onBlur);

  const api = {
    state,
    // Main toggles this with the round phase: on while a round is live,
    // off whenever an overlay owns the mouse.
    setFallback(v) { fallback = !!v; if (!fallback) { state.firing = false; state.ads = false; } },
    get fallback() { return fallback; },
    get lockFailed() { return lockFailed; },
    takeLook() { const r = { x: lookX, y: lookY }; lookX = 0; lookY = 0; return r; },
    // Throw away deltas gathered while an overlay owned the mouse, so
    // the camera never lurches on the first live frame after a menu.
    discardLook() { lookX = 0; lookY = 0; },
    // Returns and clears keys pressed since the last drain.
    takePressed() { const r = new Set(pressed); pressed.clear(); return r; },
    // Touch path: feed look deltas (same units as mousemove) and inject an
    // edge-triggered press (e.g. 'KeyR' reload, 'KeyG' grenade).
    addLook(dx, dy) { lookX += dx; lookY += dy; },
    press(code) { pressed.add(code); },
    // Pointer lock can reject (no gesture, headless, denied) — the rejection
    // is a promise, so swallow it and mark the failure: the fallback look
    // keeps the mouse working and the game never pauses over a lock it
    // never held.
    requestLock() {
      try {
        const p = canvas.requestPointerLock();
        if (p && typeof p.catch === 'function') p.catch(() => { lockFailed = true; });
      } catch { lockFailed = true; /* pointer lock unavailable — fallback look covers it */ }
    },
    releaseLock() { if (document.pointerLockElement) document.exitPointerLock(); },
  };
  return api;
}
