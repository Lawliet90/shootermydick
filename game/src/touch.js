// Touch controls for ShooterMyDick (mobile / iPad Safari).
// Left virtual joystick (dynamic origin) + right-half drag-look + DOM
// buttons (FIRE / ADS / JUMP / RLD / SWAP / FRAG / CRCH / DEFUSE / pause).
// Writes into the same input.state the keyboard/mouse path uses, so the sim
// never knows which device is driving it — desktop play is untouched.
// Shown only on touch devices (pointer:coarse / ontouchstart) or with
// ?touch=1, which forces the UI on for verification. No pointer lock is
// ever requested on touch: the deploy/resume flow skips it (see main.js).
const LOOK_SENS = 2.2; // look px per drag px (same units as mousemove deltas)
const JOY_RADIUS = 56; // px, joystick travel
const DEADZONE = 0.18; // joystick deadzone, fraction of radius
const SPRINT_EDGE = 0.92; // push past this and the joystick sprints

export function createTouch(input, actions) {
  const params = new URLSearchParams(window.location.search);
  const isTouch = params.get('touch') === '1'
    || window.matchMedia('(pointer: coarse)').matches
    || 'ontouchstart' in window;
  if (!isTouch) return { isTouch: false, setDefuseVisible() {} };

  const state = input.state;
  document.body.classList.add('touch');

  const ui = document.createElement('div');
  ui.id = 'touch-ui';
  ui.innerHTML = `
    <div id="look-zone"></div>
    <div id="joy-zone"><div id="joy-base"><div id="joy-knob"></div></div></div>
    <button type="button" class="tbtn" id="t-fire">FIRE</button>
    <button type="button" class="tbtn" id="t-ads">ADS</button>
    <button type="button" class="tbtn" id="t-jump">JUMP</button>
    <button type="button" class="tbtn" id="t-rld">RLD</button>
    <button type="button" class="tbtn" id="t-swap">SWAP</button>
    <button type="button" class="tbtn" id="t-frag">FRAG</button>
    <button type="button" class="tbtn" id="t-crch">CRCH</button>
    <button type="button" class="tbtn wide" id="t-defuse">DEFUSE</button>
    <button type="button" class="tbtn" id="t-pause">II</button>`;
  document.body.appendChild(ui);
  const $ = (id) => ui.querySelector('#' + id);

  // ---------- Virtual joystick (dynamic origin, left zone) ----------
  const joyZone = $('joy-zone');
  const joyBase = $('joy-base');
  const joyKnob = $('joy-knob');
  const JOY_KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft'];
  let joyId = null;
  let joyOX = 0;
  let joyOY = 0;

  function setJoyKeys(sx, sy, mag) {
    // sx: strafe -1..1 (right+), sy: forward -1..1 (forward+).
    for (const k of JOY_KEYS) state.keys.delete(k);
    if (sy > DEADZONE) state.keys.add('KeyW');
    if (sy < -DEADZONE) state.keys.add('KeyS');
    if (sx > DEADZONE) state.keys.add('KeyD');
    if (sx < -DEADZONE) state.keys.add('KeyA');
    if (mag > SPRINT_EDGE) state.keys.add('ShiftLeft');
    // Analog magnitude: full stick = full speed, light touch = slow walk.
    state.touchMag = mag <= DEADZONE ? 1 : Math.max(0.35, Math.min(1, mag));
  }
  function joyReset() {
    joyId = null;
    joyBase.classList.remove('on');
    for (const k of JOY_KEYS) state.keys.delete(k);
    state.touchMag = 1;
  }
  joyZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (joyId !== null) return;
    const t = e.changedTouches[0];
    joyId = t.identifier;
    joyOX = t.clientX;
    joyOY = t.clientY;
    joyBase.style.left = joyOX + 'px';
    joyBase.style.top = joyOY + 'px';
    joyBase.classList.add('on');
    joyKnob.style.transform = 'translate(0px, 0px)';
  }, { passive: false });
  joyZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== joyId) continue;
      let dx = (t.clientX - joyOX) / JOY_RADIUS;
      let dy = (t.clientY - joyOY) / JOY_RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      const mag = Math.min(1, len);
      joyKnob.style.transform = `translate(${dx * JOY_RADIUS * 0.7}px, ${dy * JOY_RADIUS * 0.7}px)`;
      setJoyKeys(dx, -dy, mag);
    }
  }, { passive: false });
  const joyEnd = (e) => {
    for (const t of e.changedTouches) if (t.identifier === joyId) joyReset();
  };
  joyZone.addEventListener('touchend', joyEnd);
  joyZone.addEventListener('touchcancel', joyEnd);

  // ---------- Drag-look (right half) ----------
  const lookZone = $('look-zone');
  let lookId = null;
  let lookLX = 0;
  let lookLY = 0;
  lookZone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (lookId !== null) return;
    const t = e.changedTouches[0];
    lookId = t.identifier;
    lookLX = t.clientX;
    lookLY = t.clientY;
  }, { passive: false });
  lookZone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier !== lookId) continue;
      input.addLook((t.clientX - lookLX) * LOOK_SENS, (t.clientY - lookLY) * LOOK_SENS);
      lookLX = t.clientX;
      lookLY = t.clientY;
    }
  }, { passive: false });
  const lookEnd = (e) => {
    for (const t of e.changedTouches) if (t.identifier === lookId) lookId = null;
  };
  lookZone.addEventListener('touchend', lookEnd);
  lookZone.addEventListener('touchcancel', lookEnd);

  // ---------- Buttons ----------
  function bindHold(el, on, off) {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      el.classList.add('on');
      on();
    }, { passive: false });
    const end = (e) => {
      e.preventDefault();
      el.classList.remove('on');
      off();
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }
  function bindTap(el, fn) {
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      el.classList.add('on');
      setTimeout(() => el.classList.remove('on'), 120);
      fn();
    }, { passive: false });
  }

  bindHold($('t-fire'), () => { state.firing = true; }, () => { state.firing = false; });
  bindHold($('t-ads'), () => { state.ads = true; }, () => { state.ads = false; });
  bindHold($('t-jump'), () => { state.keys.add('Space'); }, () => { state.keys.delete('Space'); });
  bindTap($('t-rld'), () => input.press('KeyR'));
  // FRAG throws the best grenade available: frag, then flash, then smoke.
  bindTap($('t-frag'), () => { if (actions.onGrenade) actions.onGrenade(); });
  bindTap($('t-swap'), () => { if (actions.onSwap) actions.onSwap(); });
  bindTap($('t-pause'), () => { if (actions.onPause) actions.onPause(); });

  let crouched = false;
  const crch = $('t-crch');
  bindTap(crch, () => {
    crouched = !crouched;
    crch.classList.toggle('on', crouched);
    if (crouched) state.keys.add('KeyC');
    else state.keys.delete('KeyC');
  });

  const defuseBtn = $('t-defuse');
  bindHold(defuseBtn, () => { state.keys.add('KeyE'); }, () => { state.keys.delete('KeyE'); });

  // A lost window (incoming call, home button) must never leave a stuck
  // key, a held trigger, or a half-speed joystick behind.
  window.addEventListener('blur', () => {
    joyReset();
    state.firing = false;
    state.ads = false;
    state.keys.delete('Space');
    state.keys.delete('KeyE');
  });

  return {
    isTouch: true,
    // Shown only while a charge is planted and the player stands on the site.
    setDefuseVisible(show) { defuseBtn.classList.toggle('show', !!show); },
  };
}
