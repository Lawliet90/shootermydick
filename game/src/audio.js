// Weapon SFX: real samples from the GodotFPS-Template kit (bukkbeek,
// MIT) in assets/sfx-godot/ — pistol/smg shots, reload, weapon change,
// empty click. Everything else stays synthesized WebAudio; a sample that
// has not decoded yet falls back to the synth version, never to silence.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.6;
    // A gentle limiter so stacked gunfire/explosions never clip into mush.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 8;
    master.connect(comp);
    comp.connect(ctx.destination);
    const len = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    loadSamples();
    return ctx;
  }
  // --- GodotFPS sample kit (decoded lazily once the context exists) ---
  const SAMPLE_URLS = {
    pistol: 'assets/sfx-godot/pistol.wav',
    smg: 'assets/sfx-godot/smg.wav',
    reload: 'assets/sfx-godot/reload.wav',
    swap: 'assets/sfx-godot/change_weapon.wav',
    dry: 'assets/sfx-godot/no_bullets.wav',
  };
  const sampleBufs = {};
  let sampleLoadStarted = false;
  function loadSamples() {
    if (sampleLoadStarted || !ctx) return;
    sampleLoadStarted = true;
    for (const [name, url] of Object.entries(SAMPLE_URLS)) {
      fetch(url).then((r) => r.arrayBuffer())
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => { sampleBufs[name] = buf; })
        .catch(() => { /* synth fallback covers it */ });
    }
  }
  // Returns true when the sample actually played.
  function playSample(name, vol = 0.9) {
    if (!ensure() || muted) return false;
    const buf = sampleBufs[name];
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(master);
    src.start();
    return true;
  }
  // Sample at an explicit volume with a slight rate jitter — distant
  // guns (botShot) reuse the kit samples without sounding identical
  // to the player's own weapon.
  function playSampleAt(name, vol) {
    if (!ensure() || muted) return false;
    const buf = sampleBufs[name];
    if (!buf) return false;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = 0.93 + Math.random() * 0.1;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(master);
    src.start();
    return true;
  }
  function resume() {
    if (!ensure()) return;
    if (ctx.state === 'suspended') {
      const p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  }
  // Autoplay policy: a context created before the first real gesture starts
  // suspended and stays silent — that was the "no sound at all" report.
  // Retry the unlock on EVERY user gesture anywhere in the page (menu taps,
  // buy clicks, canvas clicks, key presses), not just the Deploy button, so
  // the first interaction the player makes anywhere turns the sound on.
  for (const ev of ['pointerdown', 'touchstart', 'mousedown', 'keydown']) {
    window.addEventListener(ev, resume, { passive: true });
  }
  function env(g, t0, peak, dur) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  }
  function noise(t0, dur, filterFreq, peak, type = 'lowpass') {
    if (!ensure() || muted) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    env(g, t0, peak, dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }
  function tone(t0, dur, freq0, freq1, peak, type = 'sine') {
    if (!ensure() || muted) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq0, t0);
    if (freq1 !== freq0) o.frequency.exponentialRampToValueAtTime(Math.max(freq1, 1), t0 + dur);
    const g = ctx.createGain();
    env(g, t0, peak, dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  const api = {
    resume,
    // 'not-created' | 'suspended' | 'running' — verification hook so a
    // silent build is diagnosable instead of guesswork.
    get state() { return ctx ? ctx.state : 'not-created'; },
    get muted() { return muted; },
    toggleMute() { muted = !muted; return muted; },
    click() { if (ensure()) tone(ctx.currentTime, 0.06, 1200, 900, 0.12, 'square'); },
    shot(id) {
      if (!ensure()) return;
      // Kit samples for the two weapons they were recorded for.
      if (id === 'p9' && playSample('pistol', 0.85)) return;
      if (id === 'ratter' && playSample('smg', 0.8)) return;
      const t = ctx.currentTime;
      const cfg = {
        p9: [900, 0.5], vk7: [700, 0.6], ratter: [1100, 0.45],
        breacher: [380, 0.9], longbow: [500, 0.9],
        ak47: [620, 0.7], awp: [420, 1.0], m4a1s: [1600, 0.22],
      }[id] || [700, 0.6];
      if (id === 'm4a1s') {
        // Suppressed: soft high click + short hiss, no low thump.
        noise(t, 0.09, 2400, 0.22, 'highpass');
        tone(t, 0.06, 1500, 700, 0.1, 'triangle');
        return;
      }
      if (id === 'awp') {
        noise(t, 0.22, 700, 1.0);
        tone(t, 0.28, 220, 40, 0.8, 'sine');
        noise(t + 0.05, 0.5, 240, 0.4);
        return;
      }
      noise(t, 0.12, cfg[0] * 2, cfg[1]);
      tone(t, 0.1, cfg[0], 90, 0.35, 'triangle');
    },
    // Bot gunfire, heard from the player's position: the Godot kit
    // samples for pistol/SMG, synth bursts for the rest, with distance
    // attenuation on BOTH volume and brightness — near bots crack, far
    // bots thud. The old distantShot was a single fixed 0.14-peak 500 Hz
    // puff for every bot shot: on a phone speaker it was effectively
    // silence, which is why only the player's own gun seemed to sound.
    botShot(kind, dist = 12) {
      if (!ensure() || muted) return;
      const d = Math.max(0, dist);
      const vol = Math.min(0.95, 3.2 / (3.2 + d * 0.55));
      if (vol < 0.03) return;
      if (kind === 'pistol' && playSampleAt('pistol', vol)) return;
      if (kind === 'smg' && playSampleAt('smg', vol * 0.9)) return;
      const t = ctx.currentTime;
      const bright = Math.max(320, 2400 - d * 70);
      if (kind === 'shotgun') {
        noise(t, 0.2, Math.min(bright, 900), vol);
        tone(t, 0.16, 300, 70, vol * 0.5, 'triangle');
      } else if (kind === 'sniper') {
        noise(t, 0.16, bright, vol);
        tone(t, 0.3, 200, 40, vol * 0.55, 'sine');
        noise(t + 0.04, 0.4, 220, vol * 0.3);
      } else if (kind === 'pistol') {
        noise(t, 0.09, bright, vol * 0.8);
        tone(t, 0.07, 800, 110, vol * 0.3, 'triangle');
      } else if (kind === 'smg') {
        noise(t, 0.08, bright * 1.2, vol * 0.75);
        tone(t, 0.06, 1000, 130, vol * 0.25, 'triangle');
      } else { // rifle
        noise(t, 0.11, bright, vol * 0.9);
        tone(t, 0.09, 620, 90, vol * 0.32, 'triangle');
      }
    },
    distantShot() { api.botShot('rifle', 14); },
    // Bot reload: two soft metallic clicks, distance-attenuated. Only
    // audible up close, which is the point — a bot reloading nearby is
    // tactical information.
    botReload(dist = 8) {
      if (!ensure() || muted) return;
      const vol = Math.min(0.5, 1.6 / (1.6 + dist * 0.5));
      if (vol < 0.04) return;
      const t = ctx.currentTime;
      tone(t, 0.04, 950, 700, vol, 'square');
      tone(t + 0.22, 0.04, 700, 950, vol, 'square');
      tone(t + 0.5, 0.05, 1150, 800, vol * 1.1, 'square');
    },
    // Bot footsteps: a short dull thud, only within earshot.
    botStep(dist = 6) {
      if (!ensure() || muted) return;
      const vol = Math.min(0.22, 1.1 / (1.1 + dist * 0.45));
      if (vol < 0.03) return;
      noise(ctx.currentTime, 0.05, 380, vol);
    },
    dry() { if (ensure() && !playSample('dry', 0.8)) tone(ctx.currentTime, 0.04, 1800, 1400, 0.12, 'square'); },
    swap() { if (ensure() && !playSample('swap', 0.7)) tone(ctx.currentTime, 0.06, 1200, 900, 0.12, 'square'); },
    reload() {
      if (!ensure()) return;
      if (playSample('reload', 0.85)) return;
      const t = ctx.currentTime;
      tone(t, 0.05, 900, 700, 0.14, 'square');
      tone(t + 0.18, 0.05, 700, 900, 0.14, 'square');
      tone(t + 0.45, 0.06, 1100, 800, 0.16, 'square');
    },
    hit(head) { if (ensure()) tone(ctx.currentTime, 0.07, head ? 2400 : 1700, head ? 2000 : 1500, 0.18, 'square'); },
    kill() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.09, 880, 880, 0.2, 'sine');
      tone(t + 0.09, 0.14, 1318, 1318, 0.2, 'sine');
    },
    hurt() { if (ensure()) tone(ctx.currentTime, 0.12, 220, 110, 0.3, 'sawtooth'); },
    beep(final) {
      if (!ensure()) return;
      tone(ctx.currentTime, final ? 0.22 : 0.09, final ? 1400 : 1050, final ? 1400 : 1050, 0.16, 'square');
    },
    plant() { if (ensure()) { const t = ctx.currentTime; tone(t, 0.1, 660, 660, 0.2, 'square'); tone(t + 0.12, 0.1, 660, 660, 0.2, 'square'); tone(t + 0.24, 0.2, 990, 990, 0.2, 'square'); } },
    explosion() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.9, 300, 1.0);
      tone(t, 0.8, 120, 30, 0.7, 'sine');
    },
    footstep(run) { if (ensure()) noise(ctx.currentTime, 0.05, 400, run ? 0.1 : 0.06); },
    horn() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.5, 196, 196, 0.22, 'sawtooth');
      tone(t, 0.5, 294, 294, 0.14, 'sawtooth');
    },
    roundEnd(win) {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const seq = win ? [523, 659, 784] : [392, 330, 262];
      seq.forEach((f, i) => tone(t + i * 0.13, 0.16, f, f, 0.18, 'triangle'));
    },
    // --- New: knife, buy, defuse, flashbang, smoke ---
    swing() {
      // Knife whoosh: band-passed noise sweep, fast attack.
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.16, 1800, 0.22, 'bandpass');
      noise(t + 0.03, 0.12, 900, 0.14, 'bandpass');
    },
    knifeHit() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.08, 700, 0.4);
      tone(t, 0.07, 320, 140, 0.25, 'triangle');
    },
    buy() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.07, 980, 980, 0.16, 'square');
      tone(t + 0.08, 0.1, 1320, 1320, 0.16, 'square');
    },
    defuseTick() { if (ensure()) tone(ctx.currentTime, 0.04, 1900, 1900, 0.1, 'square'); },
    defuseDone() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      tone(t, 0.1, 880, 880, 0.2, 'sine');
      tone(t + 0.1, 0.18, 1174, 1174, 0.2, 'sine');
    },
    flash() {
      // Flashbang: sharp pop + high ringing that fades.
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.06, 3200, 0.9, 'highpass');
      tone(t, 1.1, 2600, 2400, 0.16, 'sine');
      tone(t, 0.9, 3100, 2900, 0.09, 'sine');
    },
    smoke() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      noise(t, 0.9, 900, 0.25, 'bandpass');
    },
  };
  return api;
}
