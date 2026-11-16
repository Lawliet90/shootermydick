// ShooterMyDick — boot, fixed 60 Hz sim decoupled from rendering,
// round flow, player shooting, plant/defuse, deathmatch, and deterministic
// shot mode. ?shot=start|play|plant|end|dm&seed=N renders one frozen frame
// and sets window.__shotReady = true.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createTouch } from './touch.js';
import { createPlayer } from './player.js';
import { createWeapon, createGrenades, WEAPONS, GEAR, byId } from './weapon.js';
import { createBots } from './bots.js';
import { createAudio } from './audio.js';
import { createHud } from './hud.js';
import { createGame } from './sim.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = shot ? mulberry32(seed) : Math.random;

// ---------- Renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyTop);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 260);
scene.add(camera);

const world = createWorld(scene);
const sfx = createAudio();
const hud = createHud();
const game = createGame();
const G = game.g;
const player = createPlayer(world.colliders);
const weapon = createWeapon(scene, camera, sfx);
const grenades = createGrenades(scene, sfx, weapon.effects);
const bots = createBots(scene, world, sfx);
// Smoke walls block bot line of sight (see weapon.effects.blocksLOS).
bots.los.smokeBlocks = (a, b) => weapon.effects.blocksLOS(a, b);
const input = createInput(renderer.domElement, onLockChange);
const touch = createTouch(input, { onSwap: cycleWeapon, onPause: togglePause, onGrenade: throwBestGrenade });
const raycaster = new THREE.Raycaster();
raycaster.far = 90;

// Debug handle for headless verification (position/yaw/phase/ammo/input).
// Inert in play; the artifact build and the game never read it.
window.__dustline = {
  get pos() { const p = player.state.position; return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]; },
  get yaw() { return +player.state.yaw.toFixed(3); },
  get eye() { return +player.state.eye.toFixed(2); },
  get phase() { return G.phase; },
  get mode() { return G.mode; },
  get paused() { return !!G.paused; },
  get alive() { return player.state.alive; },
  get hp() { return player.state.hp; },
  get armor() { return player.state.armor; },
  get money() { return G.money; },
  get mag() { return weapon.state.mag[weapon.state.current]; },
  get current() { return weapon.state.current; },
  get grenades() { return weapon.state.grenades; },
  get nades() { return { ...weapon.state.nades }; },
  get dmKills() { return { ...G.dmKills }; },
  get fx() { return weapon.effects.counts; },
  get ads() { return !!input.state.ads; },
  get firing() { return !!input.state.firing; },
  // Knife slash progress 0..1 (0 = idle) — probe hook for the swing fix.
  get swing() { const p = (G.time - weapon.state.swingStart) / 0.26; return weapon.state.current === 'knife' ? +Math.max(0, Math.min(1, p)).toFixed(2) : 0; },
  get glbReady() { return weapon.glbReady; },
  // Audio + mouse-lock diagnostics: a silent game or a dead mouse is
  // verifiable from these instead of guesswork.
  get audio() { return sfx.state; },
  get locked() { return !!input.state.locked; },
  get mouseFallback() { return input.fallback; },
  get lockFailed() { return input.lockFailed; },
  get keys() { return [...input.state.keys]; },
  get touch() { return touch.isTouch; },
  // Viewmodel screen position (NDC) — portrait verification: the gun must
  // sit inside the frame (|x| < 0.95) at every aspect, not off-screen right.
  get vmNdc() {
    const p = new THREE.Vector3();
    weapon.viewModel.getWorldPosition(p);
    p.project(camera);
    return [+p.x.toFixed(3), +p.y.toFixed(3)];
  },
  // Test-only hooks for headless probes (never used by the game itself).
  debug: {
    hurtPlayer(n) { damagePlayer(n); },
    fireOnce() { playerShoot(); },
    // Screen-pixel position of the last shot's impact point (probe-only):
    // proof that impacts land on the crosshair at screen centre.
    lastHitScreen() {
      if (!hasLastHit) return null;
      const v = _lastHit.clone().project(camera);
      return { x: +(((v.x + 1) / 2) * window.innerWidth).toFixed(1), y: +(((1 - v.y) / 2) * window.innerHeight).toFixed(1) };
    },
    botHp(i) { const b = bots.bots[i]; return b ? b.hp : null; },
    botPos(i) { const b = bots.bots[i]; return b ? [+b.pos.x.toFixed(2), +b.pos.z.toFixed(2)] : null; },
    // Teleport the player to a ground point (probe-only).
    place(x, z) { player.state.position.set(x, 0, z); syncCamera(); return true; },
    killBot(i) { const b = bots.bots[i]; if (b && b.alive) damageBot(b, 999, false, true); },
    botCount() { return bots.bots.length; },
    aliveBots() { return bots.bots.filter((b) => b.alive).length; },
    selectWeapon(id) { weapon.select(id); syncHud(); },
    giveWeapon(id) { weapon.give(id); return true; },
    // Force ADS on/off from a probe (the frame loop copies input.state.ads
    // into weapon.state.ads every step, so setting it here sticks).
    setAds(v) { input.state.ads = !!v; return true; },
    vmInfo() { return weapon.vmInfo(); },
    // Per-hand viewmodel measurements (probe-only): fist screen boxes,
    // grip-point overlap, forearm vs fist width, finger wrap distances.
    vmMeasure() { return weapon.handMeasure(); },
    // Barrel-axis vs crosshair measurement (probe-only): pixel distance
    // from the screen-centre crosshair to the bore line, muzzle position.
    barrelMeasure() { return weapon.barrelMeasure(); },
    // Teleport the player beside a bot and aim at it (side view of the gait).
    watchBot(i) {
      const b = bots.bots[i];
      if (!b) return false;
      player.state.position.set(b.pos.x + 5, 0, b.pos.z + 1.5);
      player.state.yaw = Math.atan2(-(b.pos.x - player.state.position.x), -(b.pos.z - player.state.position.z));
      player.state.pitch = -0.12;
      syncCamera();
      return true;
    },
    // Aim the camera at a world point (probe-only, e.g. to face the sun).
    lookAt(x, y, z) {
      const p = player.state;
      const dx = x - p.position.x, dy = y - (p.position.y + p.eye), dz = z - p.position.z;
      const len = Math.hypot(dx, dy, dz) || 1;
      p.yaw = Math.atan2(-dx, -dz);
      p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
      syncCamera();
      return true;
    },
    // Live leg angles — proves the gait is actually cycling, not frozen.
    botLegs(i) {
      const b = bots.bots[i];
      if (!b) return null;
      return {
        hipL: +b.legL.hip.rotation.x.toFixed(3), kneeL: +b.legL.knee.rotation.x.toFixed(3),
        hipR: +b.legR.hip.rotation.x.toFixed(3), kneeR: +b.legR.knee.rotation.x.toFixed(3),
        phase: +b.walkPhase.toFixed(2), speed: +b.moveSpeed.toFixed(2),
      };
    },
    // Skinned-soldier state: current clip name, or 'procedural' while the
    // GLB has not attached (or failed). Probe-only, like botLegs.
    botModel(i) {
      const b = bots.bots[i];
      if (!b) return null;
      return b.soldier ? b.soldier.clip : 'procedural';
    },
  },
};

// Reused scratch objects (no per-frame allocation in hot paths).
const _dir = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _lastHit = new THREE.Vector3(); // last player-shot impact (probe hook)
let hasLastHit = false;
const _tmp = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();

let frozen = false;
let started = false;
let accumulator = 0;
let lastTime = performance.now();
let shakeT = 0;
let shakeMag = 0;
let defuseT = 0;
let defuseBeepT = 0;
let plantBeepT = 0;
let roundEndT = 0;
let endOverlayShown = false;
let playerRespawnT = 0;
const noiseEvents = [];
let vgEntries = [];
let jkEntries = [];
let carrierBot = null;
let roundSite = 'alpha';

function siteObj() { return roundSite === 'alpha' ? world.sites.alpha : world.sites.beta; }
function randomSpawn() {
  const all = world.spawns.vanguard.concat(world.spawns.jackal);
  return all[Math.floor(rng() * all.length)].clone();
}

// ---------- Round setup ----------
function spawnBots() {
  bots.clear();
  grenades.clear();
  vgEntries = [];
  jkEntries = [];
  carrierBot = null;
  // Player entry (shared object, alive flag refreshed each step).
  const playerEntry = { pos: player.state.position, isPlayer: true, bot: null, alive: true };
  vgEntries.push(playerEntry);
  // Competitive 5v5: player + 4 Police bots vs 5 Terrorist bots.
  world.spawns.vanguard.slice(0, 4).forEach((s, i) => {
    const b = bots.spawn('vanguard', i, s, false);
    b.destSite = roundSite;
    bots.setDestination(b, siteObj().center);
    vgEntries.push({ pos: b.pos, isPlayer: false, bot: b, alive: true });
  });
  // Deathmatch has no carrier — every bot is a free-for-all opponent.
  const carrierIdx = G.mode === 'dm' ? -1 : Math.floor(rng() * 5);
  world.spawns.jackal.forEach((s, i) => {
    const isCarrier = i === carrierIdx;
    const b = bots.spawn('jackal', i, s, isCarrier);
    if (isCarrier) carrierBot = b;
    b.destSite = roundSite;
    bots.setDestination(b, siteObj().center);
    jkEntries.push({ pos: b.pos, isPlayer: false, bot: b, alive: true });
  });
  G.carrierId = carrierBot ? carrierBot.id : -1;
}

// Mouse control for live rounds: try pointer lock, but ALWAYS arm the
// fallback look (input.js) so the mouse steers and fires even where the
// lock is denied (embedded webviews/iframes). An overlay taking the
// screen disarms it again so menu clicks never steer or shoot.
function armMouse() {
  if (touch.isTouch || shot) return;
  input.setFallback(true);
  input.discardLook();
  input.requestLock();
}
function disarmMouse() {
  if (touch.isTouch) return;
  input.setFallback(false);
}

function startRound() {
  roundSite = rng() < 0.5 ? 'alpha' : 'beta';
  game.startRound();
  player.reset(world.spawns.vanguard[4], 0);
  // Loadout carries into the round: armor, kit, helmet, grenades and the
  // bought primary all persist until used/depleted (CS-like). The buy
  // phase is where gear is bought — wiping it here made every gear
  // purchase vanish the moment the round started.
  spawnBots();
  weapon.effects.clearDecals();
  defuseT = 0;
  noiseEvents.length = 0;
  hud.hideOverlays();
  hud.banner('ROUND ' + G.round, 'Secure Relay ' + (roundSite === 'alpha' ? 'Alpha' : 'Beta') + ' — Terrorists carry the charge', 3000);
  sfx.horn();
  syncHud();
  armMouse();
}

function startBuyPhase(duration) {
  game.startBuy(duration);
  hud.showBuy({ weapons: WEAPONS, gear: GEAR }, G.money, weapon.state.owned, weapon.state.nades, weapon.state.hasKit, player.state.armor > 0, false, menuPick);
  // The buy menu owns the mouse (rows are clicked), so no pointer lock
  // and no fallback look here — the lock is taken when the round starts.
  disarmMouse();
  input.releaseLock();
}

// Deathmatch loadout screen: same armory, everything free.
function startLoadout() {
  hud.showBuy({ weapons: WEAPONS, gear: GEAR }, G.money, weapon.state.owned, weapon.state.nades, weapon.state.hasKit, player.state.armor > 0, true, menuPick);
  disarmMouse();
  input.releaseLock();
}

function startDMRound() {
  G.phase = 'live';
  G.dmTimer = 300;
  const armor = player.state.armor; // loadout armor survives the round start
  player.reset(randomSpawn(), rng() * Math.PI * 2);
  player.state.armor = armor;
  spawnBots();
  weapon.effects.clearDecals();
  defuseT = 0;
  playerRespawnT = 0;
  noiseEvents.length = 0;
  hud.hideOverlays();
  hud.banner('DEATHMATCH', 'First to 20 kills — respawn in 3 seconds', 3000);
  sfx.horn();
  syncHud();
  armMouse();
}

function respawnPlayer() {
  const armor = player.state.armor;
  player.reset(randomSpawn(), rng() * Math.PI * 2);
  player.state.armor = armor; // bought armor survives a deathmatch respawn
  hud.banner('BACK IN', '', 1200);
  syncHud();
}

function showRoundEnd() {
  const won = G.roundWinner === 'vanguard';
  const title = G.phase === 'matchEnd'
    ? (G.matchWinner === 'vanguard' ? 'POLICE TAKE THE YARD' : 'TERRORISTS TAKE THE YARD')
    : (won ? 'POLICE WIN THE ROUND' : 'TERRORISTS WIN THE ROUND');
  const stats = `Round ${G.round - (G.phase === 'matchEnd' ? 0 : 1)} · ${G.roundReason}\nScore — Police ${G.wins.vanguard} : ${G.wins.jackal} Terrorists\nKills ${G.kills} · Money $${G.money}`;
  hud.showEnd(title, G.roundReason, stats);
  document.getElementById('restart').textContent = G.phase === 'matchEnd' ? 'PLAY AGAIN' : 'NEXT ROUND — BUY PHASE';
  disarmMouse();
  input.releaseLock();
  endOverlayShown = true;
}

function showDMMatchEnd() {
  const entries = Object.entries(G.dmKills).map(([id, k]) => {
    const name = id === 'player' ? 'You' : (bots.bots.find((b) => b.id === Number(id.slice(3))) || {}).name || id;
    return { name, k };
  }).sort((a, b) => b.k - a.k);
  const top = entries.slice(0, 5).map((e, i) => `${i + 1}. ${e.name} — ${e.k} kills`).join('\n');
  const won = G.dmWinner === 'player';
  const title = won ? 'YOU WIN THE DEATHMATCH' : `${(entries[0] || {}).name || 'RIVAL'} WINS THE DEATHMATCH`;
  hud.showEnd(title, `First to ${G.dmTarget} kills · 5:00 timer`, top + `\nYour kills: ${G.dmKills.player || 0}`);
  document.getElementById('restart').textContent = 'PLAY AGAIN';
  disarmMouse();
  input.releaseLock();
  endOverlayShown = true;
}

function endRound(winner, reason) {
  const kind = game.endRound(winner, reason);
  if (!kind) return;
  sfx.roundEnd(winner === 'vanguard');
  hud.banner(winner === 'vanguard' ? 'POLICE WIN' : 'TERRORISTS WIN', reason, 3200);
  hud.setCharge('', false);
  roundEndT = 3.0;
  endOverlayShown = false;
  syncHud();
}

function aliveCount(entries) {
  let n = 0;
  for (const e of entries) if (e.alive) n++;
  return n;
}

// ---------- Combat ----------
function damagePlayer(amount, fromPos, killer) {
  if (!player.state.alive || G.phase !== 'live') return;
  player.damage(amount);
  sfx.hurt();
  hud.blood();
  if (fromPos) {
    const dx = fromPos.x - player.state.position.x;
    const dz = fromPos.z - player.state.position.z;
    const worldAng = Math.atan2(dx, dz);
    const rel = (worldAng - player.state.yaw) * 180 / Math.PI;
    hud.damageFrom(rel);
  }
  if (!player.state.alive) {
    G.deaths += 1;
    if (G.mode === 'dm') {
      playerRespawnT = 3;
      if (killer) hud.killfeed(`${killer.name} ▸ You`, killer.team);
      else hud.killfeed('You were eliminated', 'jackal');
      let ended = false;
      if (killer) ended = !!game.dmAward('bot' + killer.id);
      if (ended) { showDMMatchEnd(); syncHud(); return; }
      hud.banner('YOU ARE DOWN', 'Respawning in 3 seconds', 2000);
    } else {
      hud.killfeed('You were eliminated', 'jackal');
      hud.banner('YOU ARE DOWN', 'Your squad fights on — spectate from the yard', 3000);
    }
  }
  syncHud();
}

// attacker: true = the player, a bot object = that bot, falsy = environment.
function damageBot(bot, amount, isHead, attacker) {
  const killed = bots.damage(bot, amount, isHead, attacker);
  if (killed) {
    weapon.effects.bloodDecal(bot.pos);
    const killerName = attacker === true ? 'You' : attacker ? attacker.name : '—';
    const killerTeam = attacker === true ? 'vanguard' : attacker ? attacker.team : 'jackal';
    hud.killfeed(`${killerName} ▸ ${bot.name} (${bot.team === 'jackal' ? 'Terrorist' : 'Police'})`, bot.team);
    if (G.mode === 'dm') {
      bot.respawnT = 3;
      const killerId = attacker === true ? 'player' : attacker ? 'bot' + attacker.id : null;
      if (killerId) {
        const ended = game.dmAward(killerId);
        if (attacker === true) sfx.kill();
        if (ended) showDMMatchEnd();
      }
    } else if (attacker === true) {
      game.awardKill();
      sfx.kill();
    }
  }
  return killed;
}

// The crosshair is drawn at the exact centre of the screen (see
// #crosshair / #hitmarker in index.html), so the aim ray is the camera
// forward. It is derived from the player's CURRENT yaw/pitch state —
// the fixed-step sim runs before syncCamera(), so reading the camera
// matrix raw would put shots a frame behind a fast flick. Shake, bob
// and strafe roll are render-only and stay out of the aim ray;
// syncCamera() reapplies them before render. Bullets, the knife ray
// and grenades therefore land on the dot at screen centre.
function crosshairDir(out) {
  const p = player.state;
  const cp = Math.cos(p.pitch);
  out.set(-Math.sin(p.yaw) * cp, Math.sin(p.pitch), -Math.cos(p.yaw) * cp);
  return out;
}

function playerShoot() {
  const now = G.time;
  const w = weapon.fire(now);
  if (!w) return;
  const sprinting = input.state.keys.has('ShiftLeft') && player.state.speed > 4 && !weapon.state.ads;
  if (sprinting && !w.melee) return; // guns can't fire mid-sprint; a knife slash can
  // Aim ray = the crosshair, exactly: the camera forward from the
  // player's yaw/pitch — see crosshairDir() above. Shots land on the
  // dot at screen centre.
  _origin.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  crosshairDir(_dir);
  // Knife: short-range swing, no noise event for bots.
  if (w.melee) {
    // Visible slash streak in front of the camera on EVERY swing, hit or
    // miss. Before this, a whiff produced nothing on screen at all — the
    // swing animation also lives in weapon.step (state.swingStart).
    _right.setFromMatrixColumn(camera.matrixWorld, 0);
    _up.setFromMatrixColumn(camera.matrixWorld, 1);
    _v1.copy(_origin).addScaledVector(_dir, 1.15).addScaledVector(_right, 0.55).addScaledVector(_up, 0.38);
    _tmp.copy(_origin).addScaledVector(_dir, 1.15).addScaledVector(_right, -0.55).addScaledVector(_up, -0.30);
    weapon.effects.tracer(_v1, _tmp);
    raycaster.set(_origin, _dir);
    raycaster.far = w.range;
    const targets = world.shootables;
    const extra = [];
    for (const b of bots.bots) {
      if (!b.alive) continue;
      b.group.traverse((o) => { if (o.isMesh) extra.push(o); });
    }
    const hits = raycaster.intersectObjects(targets.concat(extra), false);
    raycaster.far = 90;
    let hitBot = false;
    if (hits.length) {
      const hit = hits[0];
      _lastHit.copy(hit.point); hasLastHit = true;
      const bot = hit.object.userData.bot;
      if (bot && bot.alive) {
        hitBot = true;
        const part = hit.object.userData.part || 'body';
        const zoneMul = part === 'head' ? w.headMul : part === 'legs' ? 0.75 : 1;
        _hitPoint.copy(hit.point);
        weapon.effects.blood(_hitPoint, part === 'head');
        damageBot(bot, w.damage * zoneMul, part === 'head', true);
        hud.hitmarker(part === 'head');
        sfx.hit(part === 'head');
        sfx.knifeHit();
      } else {
        weapon.effects.impact(hit.point, 0xd9c9a8);
      }
    }
    if (!hitBot) {
      // A slash is a sweep, not a pin-point ray: any bot whose chest is
      // inside the swing cone still gets cut, even if the centre ray
      // threaded between its hitboxes. Closest such bot takes the hit.
      let best = null;
      let bestDist = w.range + 0.35;
      for (const b of bots.bots) {
        if (!b.alive) continue;
        _tmp.copy(b.pos); _tmp.y += 1.15; _tmp.sub(_origin);
        const d = _tmp.length();
        if (d > bestDist) continue;
        _tmp.normalize();
        if (_tmp.dot(_dir) < 0.55) continue; // ~57° half-angle cone
        best = b; bestDist = d;
      }
      if (best) {
        _hitPoint.copy(best.pos); _hitPoint.y += 1.15;
        weapon.effects.blood(_hitPoint, false);
        damageBot(best, w.damage, false, true);
        hud.hitmarker(false);
        sfx.hit(false);
        sfx.knifeHit();
      }
    }
    player.recoil(w.recoil, (rng() - 0.5) * w.recoil * 0.6);
    return;
  }
  const pellets = w.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    // Single-projectile weapons fire EXACTLY along the crosshair ray:
    // hip-fire spread used to scatter every shot randomly around the
    // crosshair, so bullets visibly landed off the dot the player was
    // aiming with. Spread now lives only in the crosshair gap + recoil
    // (which moves the aim itself, crosshair and all). The shotgun keeps
    // its pellet pattern — centred on the same ray, as a shotgun must.
    if (pellets === 1) {
      _tmp.copy(_dir);
    } else {
      const spread = weapon.spreadNow(player.state.speed, !player.state.onGround, player.state.crouch);
      _tmp.set(
        _dir.x + (rng() - 0.5) * 2 * spread,
        _dir.y + (rng() - 0.5) * 2 * spread,
        _dir.z + (rng() - 0.5) * 2 * spread,
      ).normalize();
    }
    // Hit targets: world surfaces + alive bot meshes (head / body / legs).
    const targets = world.shootables;
    const extra = [];
    for (const b of bots.bots) {
      if (!b.alive) continue;
      b.group.traverse((o) => { if (o.isMesh) extra.push(o); });
    }
    raycaster.set(_origin, _tmp);
    const hits = raycaster.intersectObjects(targets.concat(extra), false);
    const end = _tmp.clone().multiplyScalar(90).add(_origin);
    if (hits.length) {
      const hit = hits[0];
      _hitPoint.copy(hit.point);
      _lastHit.copy(_hitPoint); hasLastHit = true;
      weapon.effects.tracer(_origin, _hitPoint);
      const bot = hit.object.userData.bot;
      if (bot && bot.alive) {
        const part = hit.object.userData.part || 'body';
        const isHead = part === 'head';
        // Hit zones: head 2x, body 1x, legs 0.75x.
        const zoneMul = isHead ? w.headMul : part === 'legs' ? 0.75 : 1;
        let dmg = w.damage * zoneMul;
        const dist = hit.distance;
        if (dist > w.falloff) dmg *= Math.max(0.4, 1 - (dist - w.falloff) / 70);
        weapon.effects.blood(_hitPoint, isHead);
        damageBot(bot, dmg, isHead, true);
        hud.hitmarker(isHead);
        sfx.hit(isHead);
        weapon.effects.impact(_hitPoint, isHead ? 0xff6b57 : 0xffd9a0);
      } else {
        weapon.effects.impact(_hitPoint, 0xd9c9a8);
        // A shot that strikes a surface leaves a bullet hole behind.
        if (hit.face) {
          const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
          weapon.effects.addHole(_hitPoint, n);
        }
      }
    } else {
      weapon.effects.tracer(_origin, end);
    }
  }
  player.recoil(w.recoil, (rng() - 0.5) * w.recoil * 0.6);
  noiseEvents.push({ pos: player.state.position.clone(), t: now });
  if (noiseEvents.length > 8) noiseEvents.shift();
}

function explodeGrenade(pos) {
  shakeT = 0.5; shakeMag = 0.05;
  weapon.effects.impact(pos, 0xff9a4d);
  noiseEvents.push({ pos: pos.clone(), t: G.time });
  const pd = player.state.position.distanceTo(pos);
  if (pd < 7 && player.state.alive) damagePlayer(Math.max(8, 95 * (1 - pd / 7)), pos);
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const d = b.pos.distanceTo(pos);
    if (d < 7) damageBot(b, Math.max(8, 95 * (1 - d / 7)), false, true);
  }
}

// Flashbang pop: the player whites out if they face it (or partly if turned
// away); bots with a clear line to the pop are blinded for a few seconds.
function onFlash(pos) {
  camera.getWorldDirection(_dir);
  _tmp.copy(pos).sub(camera.position);
  const dist = _tmp.length();
  if (dist < 22 && player.state.alive) {
    _tmp.normalize();
    const facing = _dir.dot(_tmp);
    const exposure = Math.max(0, 1.15 - dist / 20) * (facing > 0 ? 1 : 0.35);
    if (exposure > 0.05) hud.flash(exposure);
  }
  for (const b of bots.bots) {
    if (!b.alive) continue;
    const d = b.pos.distanceTo(pos);
    if (d > 20) continue;
    _tmp.copy(pos); _tmp.y = 1.4;
    _v1.copy(b.pos); _v1.y = 1.5;
    if (bots.los(_v1, _tmp)) b.blindT = Math.max(b.blindT, 2.5 * (1 - d / 24));
  }
}

function throwGrenade(kind) {
  if (weapon.state.nades[kind] <= 0) { sfx.dry(); return; }
  weapon.state.nades[kind] -= 1;
  weapon.state.grenades = weapon.state.nades.frag;
  // Grenades fly at the crosshair too (the same centred aim ray), from the eye.
  crosshairDir(_dir);
  _origin.set(player.state.position.x, player.state.position.y + player.state.eye, player.state.position.z);
  grenades.throwFrom(_origin, _dir, kind);
  sfx.click();
  syncHud();
}

// Touch FRAG button: throws the best grenade available (frag, then flash,
// then smoke) since there is one button for all three.
function throwBestGrenade() {
  if (weapon.state.nades.frag > 0) throwGrenade('frag');
  else if (weapon.state.nades.flash > 0) throwGrenade('flash');
  else if (weapon.state.nades.smoke > 0) throwGrenade('smoke');
  else sfx.dry();
}

// ---------- HUD ----------
function syncHud() {
  hud.setHealth(player.state.hp, player.state.armor);
  const w = byId(weapon.state.current);
  if (w.melee) hud.setAmmo('—', '', 'COMBAT KNIFE', false);
  else hud.setAmmo(weapon.state.mag[weapon.state.current], weapon.state.reserve[weapon.state.current], w.name, G.time < weapon.state.reloadingUntil);
  hud.setNades(weapon.state.nades.frag, weapon.state.nades.flash, weapon.state.nades.smoke);
  hud.setMoney(G.money);
  hud.setCrosshair(weapon.spreadNow(player.state.speed, !player.state.onGround, player.state.crouch) * 900);
  if (G.mode === 'dm') {
    hud.setTimer(G.dmTimer);
    let topName = 'RIVAL'; let topK = 0;
    for (const [id, k] of Object.entries(G.dmKills)) {
      if (id === 'player') continue;
      if (k > topK) { topK = k; topName = (bots.bots.find((b) => b.id === Number(id.slice(3))) || {}).name || 'RIVAL'; }
    }
    hud.setDM(G.dmKills.player || 0, topK, topName);
    document.getElementById('round-label').textContent = 'DEATHMATCH · FIRST TO ' + G.dmTarget;
    hud.setCharge('', false);
  } else {
    hud.setTimer(G.phase === 'buy' ? G.buyTimer : G.timer);
    hud.setScore(G.wins.vanguard, G.wins.jackal, aliveCount(vgEntries), aliveCount(jkEntries));
    hud.setTeams('POLICE', 'TERRORISTS');
    document.getElementById('round-label').textContent = 'ROUND ' + G.round + ' · FIRST TO 5';
    if (G.planted) {
      const urgent = G.fuse < 10;
      hud.setCharge(`CHARGE PLANTED — RELAY ${G.plantSite === 'alpha' ? 'ALPHA' : 'BETA'} · ${Math.ceil(G.fuse)}s${defuseT > 0 ? ' · DEFUSING ' + Math.ceil((weapon.state.hasKit ? 2.5 : 5) - defuseT) + 's' : ''}`, urgent);
    } else if (G.phase === 'live') {
      hud.setCharge(`CHARGE WITH ${carrierBot && carrierBot.alive ? carrierBot.name : 'TERRORISTS'} · RELAY ${roundSite === 'alpha' ? 'ALPHA' : 'BETA'}`, false);
    } else {
      hud.setCharge('', false);
    }
  }
  // Touch: show the DEFUSE button only while a charge is planted and the
  // player stands on the site (holding it channels KeyE, like desktop).
  if (touch.isTouch) {
    const near = !!G.planted && player.state.alive
      && player.state.position.distanceTo(siteObj().center) < 2.6;
    touch.setDefuseVisible(near);
  }
}

// ---------- Input actions (edge-triggered) ----------
function togglePause() {
  if (G.phase !== 'live' && !G.paused) return;
  G.paused = !G.paused;
  if (G.paused) { hud.showPause(); disarmMouse(); input.releaseLock(); }
  else { hud.hideOverlays(); armMouse(); }
}

// Touch SWAP button: cycle primary → pistol → knife → primary (same select()
// path as the keyboard digit keys).
function cycleWeapon() {
  const owned = WEAPONS.filter((w) => weapon.state.owned[w.id]);
  if (owned.length < 2) return;
  // Order the cycle primary, pistol, knife so it matches the 1/2/3 keys.
  const order = [];
  const prim = owned.filter((w) => w.kind !== 'pistol' && !w.melee);
  const pist = owned.filter((w) => w.kind === 'pistol');
  const knf = owned.filter((w) => w.melee);
  order.push(...prim, ...pist, ...knf);
  const i = order.findIndex((w) => w.id === weapon.state.current);
  weapon.select(order[(i + 1) % order.length].id);
  syncHud();
}

function handlePressed(pressed) {
  if (pressed.has('KeyM')) { const m = sfx.toggleMute(); hud.banner(m ? 'SOUND MUTED' : 'SOUND ON', '', 1200); }
  if (pressed.has('KeyP')) togglePause();
  if (G.phase === 'buy') {
    if (pressed.has('KeyB')) { hud.hideBuy(); if (G.mode === 'dm') startDMRound(); else startRound(); return; }
    for (let i = 0; i < WEAPONS.length; i++) {
      if (pressed.has('Digit' + (i + 1))) buyItem(WEAPONS[i].id);
    }
    if (pressed.has('Enter')) { hud.hideBuy(); if (G.mode === 'dm') startDMRound(); else startRound(); }
    return;
  }
  if (G.phase !== 'live' || G.paused) return;
  if (pressed.has('KeyR')) weapon.reload(G.time);
  if (pressed.has('KeyG')) throwGrenade('frag');
  if (pressed.has('KeyF')) throwGrenade('flash');
  if (pressed.has('KeyV')) throwGrenade('smoke');
  // Weapon slots: 1 = primary, 2 = pistol, 3 = knife, 4+ = primaries in order.
  if (pressed.has('Digit1')) {
    const p = weapon.state.owned[weapon.state.primary] ? weapon.state.primary
      : (WEAPONS.find((w) => weapon.state.owned[w.id] && w.kind !== 'pistol' && !w.melee) || {}).id;
    if (p) weapon.select(p);
  } else if (pressed.has('Digit2')) weapon.select('p9');
  else if (pressed.has('Digit3')) weapon.select('knife');
  else {
    const primaries = WEAPONS.filter((w) => w.kind !== 'pistol' && !w.melee);
    for (let i = 0; i < primaries.length; i++) {
      if (pressed.has('Digit' + (i + 4))) weapon.select(primaries[i].id);
    }
  }
  // Defuse is hold-to-channel (KeyE), handled in step().
}

function buyItem(id) {
  const free = G.mode === 'dm'; // deathmatch loadout: everything is free
  const w = byId(id);
  if (w) {
    if (weapon.state.owned[id]) { weapon.select(id); syncHud(); return; }
    if (!free && !game.spend(w.price)) { sfx.dry(); return; }
    weapon.give(id);
    weapon.select(id);
    sfx.buy();
  } else if (id === 'spark9') {
    if (!free && !game.spend(300)) { sfx.dry(); return; }
    weapon.state.nades.frag += 1;
    sfx.buy();
  } else if (id === 'flash') {
    if (!free && !game.spend(200)) { sfx.dry(); return; }
    weapon.state.nades.flash += 1;
    sfx.buy();
  } else if (id === 'smoke') {
    if (!free && !game.spend(300)) { sfx.dry(); return; }
    weapon.state.nades.smoke += 1;
    sfx.buy();
  } else if (id === 'kit') {
    if (weapon.state.hasKit || (!free && !game.spend(400))) { sfx.dry(); return; }
    weapon.state.hasKit = true;
    sfx.buy();
  } else if (id === 'kevlar') {
    if (player.state.armor > 0 || (!free && !game.spend(650))) { sfx.dry(); return; }
    player.state.armor = 50;
    sfx.buy();
  } else if (id === 'helmet') {
    if (player.state.armor >= 100 || (!free && !game.spend(1000))) { sfx.dry(); return; }
    player.state.armor = 100;
    weapon.state.helmet = true;
    sfx.buy();
  }
  weapon.state.grenades = weapon.state.nades.frag;
  if (G.phase === 'buy') hud.showBuy({ weapons: WEAPONS, gear: GEAR }, G.money, weapon.state.owned, weapon.state.nades, weapon.state.hasKit, player.state.armor > 0, free, menuPick);
  syncHud();
}

// ---------- Fixed-step simulation ----------
function step(dt) {
  G.time += dt;
  const pressed = input.takePressed();
  handlePressed(pressed);

  if (G.phase === 'buy') {
    G.buyTimer -= dt;
    input.takeLook(); // drain: menu mouse movement must not spin the camera at round start
    weapon.step(dt, G.time, player.state);
    if (G.buyTimer <= 0) { hud.hideBuy(); if (G.mode === 'dm') startDMRound(); else startRound(); }
    syncHud();
    return;
  }
  if (G.phase === 'roundEnd' || G.phase === 'matchEnd') {
    roundEndT -= dt;
    weapon.step(dt, G.time, player.state);
    if (roundEndT <= 0 && !endOverlayShown) showRoundEnd();
    return;
  }
  if (G.phase !== 'live' || G.paused) return;

  // Player look + movement.
  const look = input.takeLook();
  const bobSinBefore = Math.sin(player.state.bobPhase);
  player.look(look.x, look.y);
  const sprinting = input.state.keys.has('ShiftLeft') && !weapon.state.ads && !player.state.crouch;
  player.state.sprinting = sprinting && player.state.speed > 5;
  player.state.moveSpeedMul = byId(weapon.state.current).speed;
  // Touch joystick analog magnitude (1 on desktop / idle) — player.step
  // multiplies target speed by state.touchMag.
  player.state.touchMag = input.state.touchMag;
  player.step(dt, input.state.keys, sprinting);
  weapon.state.ads = input.state.ads && player.state.alive;
  weapon.step(dt, G.time, player.state);

  // Firing (sprint blocks gunfire, never a knife slash).
  const canShoot = input.state.firing && player.state.alive
    && (byId(weapon.state.current).melee || !(sprinting && player.state.speed > 4));
  if (canShoot && weapon.canFire(G.time)) playerShoot();
  else if (input.state.firing && !byId(weapon.state.current).melee && weapon.state.mag[weapon.state.current] === 0 && weapon.ready(G.time)) weapon.reload(G.time);

  // Footsteps synced to the stride: a step lands each time the bob cycle
  // crosses zero, so the sound matches the visible footfall.
  if (player.state.speed > 1 && player.state.onGround) {
    const s = Math.sin(player.state.bobPhase);
    if (s !== 0 && Math.sign(s) !== Math.sign(bobSinBefore)) sfx.footstep(sprinting);
  }

  // Refresh entry alive flags, then step bots.
  for (const e of vgEntries) e.alive = e.isPlayer ? player.state.alive : e.bot.alive;
  for (const e of jkEntries) e.alive = e.bot.alive;
  const allEntries = vgEntries.concat(jkEntries);
  const ctx = {
    now: G.time, dt, rng, dm: G.mode === 'dm',
    player, playerMoving: player.state.speed > 2,
    planted: G.planted, plantSite: G.planted ? siteObj() : null,
    enemiesOf: (bot) => (G.mode === 'dm'
      ? allEntries.filter((e) => e.bot !== bot)
      : (bot.team === 'vanguard' ? jkEntries : vgEntries)),
    damagePlayer: (amt, from, killer) => damagePlayer(amt, from, killer),
    damageBot: (b, amt, head, atk) => damageBot(b, amt, head, atk),
    onPlantDone: (site) => {
      game.onPlanted(site);
      game.awardPlant();
      sfx.plant();
      hud.banner('CHARGE PLANTED', 'Relay ' + (site === 'alpha' ? 'Alpha' : 'Beta') + ' — defuse it before the fuse runs out', 3200);
      hud.killfeed('Terrorists planted the charge', 'jackal');
    },
    onDefuseDone: (bot) => {
      hud.killfeed(`${bot.name} defused the charge`, 'vanguard');
      endRound('vanguard', 'Charge defused by ' + bot.name);
    },
    effects: weapon.effects, sfx, noise: noiseEvents,
  };
  for (const b of bots.bots) bots.step(b, ctx);
  if (G.phase !== 'live') { syncHud(); return; }

  // Grenades.
  grenades.step(dt, world.colliders, explodeGrenade, onFlash);

  // Deathmatch: 5:00 timer + 3 s respawns, no bomb, no elimination wins.
  if (G.mode === 'dm') {
    G.dmTimer -= dt;
    if (!player.state.alive && playerRespawnT > 0) {
      playerRespawnT -= dt;
      if (playerRespawnT <= 0) respawnPlayer();
    }
    for (const b of bots.bots) {
      if (!b.alive && b.respawnT > 0) {
        b.respawnT -= dt;
        if (b.respawnT <= 0) bots.respawn(b, randomSpawn());
      }
    }
    if (G.dmTimer <= 0) {
      game.dmEndOnTime();
      showDMMatchEnd();
      return;
    }
    syncHud();
    return;
  }

  // Player defuse: hold E near the planted site.
  if (G.planted) {
    const site = siteObj();
    const near = player.state.alive && player.state.position.distanceTo(site.center) < 2.6;
    if (near && input.state.keys.has('KeyE')) {
      defuseT += dt;
      defuseBeepT -= dt;
      if (defuseBeepT <= 0) { sfx.defuseTick(); defuseBeepT = 0.5; }
      const need = weapon.state.hasKit ? 2.5 : 5;
      if (defuseT >= need) { defuseT = 0; sfx.defuseDone(); endRound('vanguard', 'Charge defused by you'); }
    } else defuseT = 0;
  }

  // Round timer + fuse.
  G.timer -= dt;
  if (G.planted) {
    G.fuse -= dt;
    plantBeepT -= dt;
    const interval = G.fuse > 20 ? 1.0 : G.fuse > 10 ? 0.6 : 0.35;
    if (plantBeepT <= 0) { sfx.beep(G.fuse < 5); plantBeepT = interval; }
    if (G.fuse <= 0) { endRound('jackal', 'Charge detonated at Relay ' + (G.plantSite === 'alpha' ? 'Alpha' : 'Beta')); return; }
  }
  if (G.timer <= 0) {
    endRound(G.planted ? 'jackal' : 'vanguard', G.planted ? 'Time expired — charge detonated' : 'Time expired — charge never planted');
    return;
  }
  // Elimination wins.
  if (aliveCount(jkEntries) === 0) { endRound('vanguard', 'Terrorist team eliminated'); return; }
  if (aliveCount(vgEntries) === 0) { endRound('jackal', 'Police team eliminated'); return; }

  syncHud();
}

function syncCamera() {
  const p = player.state;
  let shakeX = 0; let shakeY = 0;
  if (shakeT > 0) {
    shakeX = (Math.random() - 0.5) * shakeMag;
    shakeY = (Math.random() - 0.5) * shakeMag;
    shakeT -= 1 / 60;
  }
  // View bob: small, speed-scaled, lateral along the camera-right axis.
  const sf = Math.min(1, p.speed / 5);
  const bobY = p.onGround ? Math.sin(p.bobPhase * 2) * 0.028 * sf : 0;
  const bobX = p.onGround ? Math.cos(p.bobPhase) * 0.012 * sf : 0;
  const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
  camera.position.set(
    p.position.x + rx * bobX,
    p.position.y + p.eye - p.landDip + bobY,
    p.position.z + rz * bobX);
  const sprinting = input.state.keys.has('ShiftLeft') && !weapon.state.ads && p.speed > 5;
  camera.rotation.set(p.pitch + shakeY, p.yaw + shakeX, p.strafeLean + Math.sin(p.bobPhase) * 0.005 * sf, 'YXZ');
  const targetFov = weapon.state.ads ? 55 : sprinting ? 80 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.25;
    camera.updateProjectionMatrix();
  }
  const yawDeg = ((-p.yaw * 180 / Math.PI) % 360 + 360) % 360;
  hud.setCompass(yawDeg);
}

let wasLocked = false;
function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    wasLocked = true;
    started = true;
    sfx.resume();
    // Only the start/pause overlays yield to the lock. The buy menu must
    // stay up for the whole buy phase — it owns the cursor (the old code
    // hid it the instant the lock engaged, killing the buy screen).
    if (G.phase === 'live') hud.hideOverlays();
  } else {
    const hadLock = wasLocked;
    wasLocked = false;
    // Auto-pause only when a lock we actually held drops mid-round. If
    // the lock was denied (embedded webview), the fallback look is
    // driving the mouse and there is nothing to pause for.
    if (hadLock && !G.paused && G.phase === 'live' && started) {
      hud.showPause();
      G.paused = true;
      disarmMouse();
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderAll();
}

// Two-pass render: the world first, then the viewmodel scene with the
// depth buffer cleared, so the gun always draws on top of the
// world (never swallowed by a wall, barrier or bot the player hugs).
function renderAll() {
  renderer.render(scene, camera);
  weapon.syncVmCamera(camera);
  renderer.autoClear = false;
  renderer.clearDepth();
  renderer.render(weapon.vmScene, weapon.vmCamera);
  renderer.autoClear = true;
}

// ---------- Wiring ----------
if (touch.isTouch) {
  document.getElementById('pause-text').textContent = 'Tap Resume to get back in the yard.';
}
// Touch (and iOS Safari): the AudioContext must resume from a user gesture.
window.addEventListener('touchstart', () => sfx.resume(), { passive: true });
// Fresh-match loadout: pistol + knife, no armor, no gear, no owned
// primaries. Called when a new match starts (menu deploy, DM deploy,
// PLAY AGAIN) — never between rounds, where the loadout persists.
function resetLoadout() {
  player.state.armor = 0;
  weapon.state.nades = { frag: 0, flash: 0, smoke: 0 };
  weapon.state.grenades = 0;
  weapon.state.hasKit = false;
  weapon.state.helmet = false;
  weapon.state.owned = { p9: true, knife: true };
  weapon.state.primary = null;
  weapon.select('p9');
}
// Pre-game loadout pick: chosen on the start screen, before PLAY GAME.
// Deathmatch grants it free; Competitive marks it YOUR PICK in the Armory.
let menuPick = 'vk7';
hud.buildLoadout(WEAPONS.filter((w) => w.kind !== 'pistol' && !w.melee), menuPick, (id) => {
  menuPick = id;
  sfx.resume();
  sfx.click();
});
// PLAY GAME only opens the mode select — the match starts from there.
// No pointer lock anywhere in the menus: the cards need a free cursor.
// startRound()/startDMRound() take the lock the moment play begins.
hud.onPlayGame(() => {
  sfx.resume();
  sfx.click(); // audible proof the sound is on, right at the first tap
  if (G.phase === 'menu') hud.showMode(byId(menuPick).name);
});
hud.onModeBack(() => { sfx.click(); hud.showStart(); });
hud.onModeComp(() => {
  sfx.resume();
  sfx.click();
  if (G.phase === 'menu') { game.startMatch('comp'); resetLoadout(); startBuyPhase(35); }
});
hud.onModeDm(() => {
  sfx.resume();
  sfx.click();
  if (G.phase === 'menu') {
    game.startMatch('dm'); resetLoadout();
    weapon.give(menuPick); weapon.select(menuPick); // the loadout pick, free in DM
    startLoadout(); syncHud();
  }
});
hud.onRestart(() => {
  sfx.resume();
  if (G.phase === 'matchEnd') {
    if (G.mode === 'dm') { game.startMatch('dm'); resetLoadout(); startLoadout(); }
    else { game.startMatch('comp'); resetLoadout(); startBuyPhase(35); }
  } else { startBuyPhase(15); }
});
hud.onBuy((id) => buyItem(id));
hud.onCloseBuy(() => { if (G.phase === 'buy') { hud.hideBuy(); if (G.mode === 'dm') startDMRound(); else startRound(); } });
hud.onResume(() => { G.paused = false; hud.hideOverlays(); armMouse(); });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Deterministic shot mode ----------
function settle(steps) { for (let i = 0; i < steps; i++) step(FIXED_STEP); }
function aimAt(point) {
  const p = player.state;
  const dx = point.x - p.position.x;
  const dy = point.y - (p.position.y + p.eye);
  const dz = point.z - p.position.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(Math.max(-1, Math.min(1, dy / len)));
  syncCamera();
}
// Deterministic shots wait for the GLBs: painting the frozen frame
// before they load would capture the procedural fallback models.
function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderAll();
    if (!weapon.glbReady || !bots.modelReady) return; // models still loading; don't count this frame
    painted += 1;
    if (painted === 2) { window.__shotReady = true; frozen = true; }
  }
  requestAnimationFrame(paint);
}
function runShot(name) {
  hud.hideOverlays();
  if (name === 'dm') {
    game.startMatch('dm');
    startDMRound();
    const target = bots.bots[0];
    target.pos.set(0, 0, 4);
    target.mode = 'hold'; target.holdPos = target.pos.clone();
    player.state.position.set(0, 0, 14);
    player.state.yaw = 0; player.state.pitch = 0;
    G.dmTimer = 287;
    weapon.give('ak47'); weapon.select('ak47');
    settle(4);
    aimAt(new THREE.Vector3(0, 1.4, 4));
    playerShoot();
    settle(2);
    hud.hitmarker(false);
    syncHud();
    paintTwiceThenReady();
    return;
  }
  if (name === 'mode') {
    player.reset(world.spawns.vanguard[4], 0);
    settle(10);
    aimAt(new THREE.Vector3(-6, 2, -14));
    syncHud();
    hud.showMode(byId(menuPick).name);
    paintTwiceThenReady();
    return;
  }
  game.startMatch('comp');
  if (name === 'start') {
    player.reset(world.spawns.vanguard[4], 0);
    settle(10);
    aimAt(new THREE.Vector3(-6, 2, -14));
    G.money = 800;
    syncHud();
    hud.showStart();
    paintTwiceThenReady();
    return;
  }
  startRound();
  if (name === 'play') {
    // Mid-firefight: bots pushed into the yard, player aiming at an enemy.
    const jk = bots.bots.filter((b) => b.team === 'jackal');
    const vg = bots.bots.filter((b) => b.team === 'vanguard');
    const spots = [[-4, 4], [8, -2], [-12, -6], [14, 8], [0, -10]];
    jk.forEach((b, i) => { b.pos.set(spots[i][0], 0, spots[i][1]); b.mode = 'hold'; b.holdPos = b.pos.clone(); });
    vg.forEach((b, i) => { b.pos.set([-6 + i * 3, 0, 10][0], 0, 10); b.mode = 'hold'; });
    player.state.position.set(0, 0, 14);
    player.state.yaw = 0; player.state.pitch = 0;
    G.timer = 62; G.wins.vanguard = 2; G.wins.jackal = 1; G.money = 1400; G.kills = 3;
    // ?wpn=<id> swaps the shot's weapon (viewmodel captures per weapon).
    const wid = byId(params.get('wpn') || 'vk7') ? (params.get('wpn') || 'vk7') : 'vk7';
    weapon.give(wid); weapon.select(wid);
    if (wid === 'vk7') weapon.state.mag.vk7 = 24;
    settle(6);
    const target = jk[0];
    aimAt(new THREE.Vector3(target.pos.x, 1.4, target.pos.z));
    playerShoot();
    settle(2);
    hud.hitmarker(false);
    hud.killfeed('Rook ▸ Vex (Terrorist)', 'vanguard');
    syncHud();
    paintTwiceThenReady();
    return;
  }
  if (name === 'plant') {
    game.onPlanted('alpha');
    G.fuse = 18; G.timer = 55;
    const jk = bots.bots.filter((b) => b.team === 'jackal');
    jk.forEach((b, i) => { b.pos.set([-18 + i * 3, 0, -17 + (i % 2) * 3][0], 0, -17 + (i % 2) * 3); b.mode = 'defend'; b.holdPos = b.pos.clone(); });
    player.state.position.set(-19, 0, -8);
    player.state.yaw = 0; player.state.pitch = 0;
    defuseT = 1.2;
    weapon.give('vk7'); weapon.select('vk7');
    settle(4);
    aimAt(new THREE.Vector3(-24, 1.2, -14));
    syncHud();
    paintTwiceThenReady();
    return;
  }
  // end
  G.wins.vanguard = 3; G.wins.jackal = 2; G.kills = 5; G.money = 2100;
  G.roundWinner = 'vanguard'; G.roundReason = 'Terrorist team eliminated';
  G.phase = 'roundEnd';
  player.state.position.set(2, 0, 16);
  settle(4);
  aimAt(new THREE.Vector3(-4, 2, -8));
  syncHud();
  hud.showEnd('POLICE WIN THE ROUND', 'Terrorist team eliminated', 'Round 5 · Terrorist team eliminated\nScore — Police 3 : 2 Terrorists\nKills 5 · Money $2100');
  paintTwiceThenReady();
}

// ---------- Boot ----------
player.reset(world.spawns.vanguard[4], 0);
syncCamera();
syncHud();
if (shot) runShot(shot);
else {
  hud.showStart();
  requestAnimationFrame(frame);
}
