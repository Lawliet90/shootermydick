// Bots: 4v4 — player + 3 Vanguard teammates vs 4 Jackals.
// State machine: advance along waypoints → hold → engage (LOS + reaction)
// → strafe/peek → retreat when low HP. Carrier plants; Jackals defend a
// planted charge; Vanguard bots defuse. Hearing: noise pulls nearby bots.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { resolveCircle } from './world.js';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from '../vendor/three/addons/utils/SkeletonUtils.js';

let botSeq = 0;
const NAMES_V = ['Rook', 'Sable', 'Iris', 'Mara'];
const NAMES_J = ['Fang', 'Vex', 'Hound', 'Rook-J', 'Nomad'];
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _ray = new THREE.Raycaster();

// Bot rifle built from parts: receiver + round barrel + magazine + stock,
// not a single box (a one-box gun reads as a plank). Barrel points +Z.
// Shared by the procedural body and the skinned soldier's hand socket.
function buildBotGun(dark) {
  const gun = new THREE.Group();
  const gReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.34), dark);
  const gBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 10), dark);
  gBarrel.rotation.x = Math.PI / 2;
  gBarrel.position.set(0, 0.02, 0.33);
  const gMag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.06), dark);
  gMag.position.set(0, -0.11, 0.05);
  gMag.rotation.x = 0.15;
  const gStock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.2), dark);
  gStock.position.set(0, -0.01, -0.26);
  gun.add(gReceiver, gBarrel, gMag, gStock);
  return gun;
}

function buildMesh(team) {
  const g = new THREE.Group();
  const isV = team === 'vanguard';
  const color = isV ? PALETTE.vanguard : PALETTE.jackal;
  const cloth = new THREE.MeshStandardMaterial({ color: isV ? 0x2e3a44 : 0x3a2e26, roughness: 0.9 });
  const trim = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a184, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.5, metalness: 0.5 });
  // Slimmer torso: capsule + chest plate + shoulder pads (team silhouette).
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.55, 4, 10), cloth);
  body.position.y = 1.0;
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.32, 0.34), trim);
  chest.position.set(0, 1.16, 0.04);
  const padGeo = new THREE.BoxGeometry(0.16, 0.1, 0.3);
  const padL = new THREE.Mesh(padGeo, trim); padL.position.set(-0.32, 1.34, 0);
  const padR = new THREE.Mesh(padGeo, trim); padR.position.set(0.32, 1.34, 0);
  // Head: skin sphere, team-differentiated helmet, dark visor.
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), skin);
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, isV ? Math.PI * 0.6 : Math.PI * 0.45), trim);
  helmet.position.y = 1.64;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.08), dark);
  visor.position.set(0, 1.64, 0.2);
  g.add(body, chest, padL, padR, head, visor, helmet);
  if (!isV) {
    // Jackal crest fin + backpack: readable from the front and the back.
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.16, 0.34), trim);
    crest.position.set(0, 1.86, 0);
    const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.4, 0.16), cloth);
    pack.position.set(0, 1.12, -0.26);
    g.add(crest, pack);
  }
  // Arms: shoulder pivots so they can swing and hold the gun forward.
  function arm(side) {
    const pivot = new THREE.Group();
    pivot.position.set(0.3 * side, 1.36, 0.06);
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 0.13), cloth);
    upper.position.y = -0.21;
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.12), skin);
    hand.position.y = -0.44;
    pivot.add(upper, hand);
    return pivot;
  }
  const armL = arm(-1), armR = arm(1);
  // Gun held forward at chest height, between both hands.
  const gun = buildBotGun(dark);
  gun.position.set(0.05, 1.22, 0.42);
  g.add(armL, armR, gun);
  // Sidearm holster + knife sheath: every agent carries a pistol and a knife.
  const holster = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.07), dark);
  holster.position.set(-0.24, 0.72, 0.14);
  const sheath = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.04), dark);
  sheath.position.set(0.24, 0.78, 0.12);
  sheath.rotation.z = -0.2;
  g.add(holster, sheath);
  // Legs: hip pivot + thigh, knee pivot + shin + boot. Two-piece legs with
  // a real knee bend so the walk reads at any distance: the thigh swings,
  // the knee flexes while the foot lifts through the swing, and the boot
  // plants flat. Single-piece legs swinging from the hip foreshorten to
  // nothing when the bot walks toward the camera — that is why the old
  // bots looked like they were gliding.
  function leg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.15 * side, 0.66, 0);
    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.34, 0.19), cloth);
    thigh.position.y = -0.17;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.34;
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.3, 0.16), cloth);
    shin.position.y = -0.15;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.09, 0.3), dark);
    boot.position.set(0, -0.29, 0.05);
    knee.add(shin, boot);
    hip.add(knee);
    return { hip, knee, boot };
  }
  const legL = leg(-1), legR = leg(1);
  g.add(legL.hip, legR.hip);
  // Leg meshes are their own hit zone (legs take reduced damage).
  legL.hip.traverse((o) => { if (o.isMesh) o.userData.part = 'legs'; });
  legR.hip.traverse((o) => { if (o.isMesh) o.userData.part = 'legs'; });
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { group: g, body, head, legL, legR, armL, armR };
}

export function createBots(scene, world, sfx) {
  const bots = [];
  const shootables = world.shootables;

  // ---- Skinned soldier model -------------------------------------------
  // 'Game Ready Military Character' by jayb3e (Sketchfab, CC-BY), converted
  // to assets/military-character.glb: 6 skinned meshes on a 65-bone rig,
  // clips belong to this skeleton (no retargeting). The armature is
  // cm-scale, so a 0.1 holder lands the soldier at ~1.77 m, facing +Z like
  // the procedural body, with in-place clips (no root drift). When it
  // loads, each bot's procedural body becomes an invisible hitbox (head /
  // body / legs zones unchanged) and the soldier is what renders. If the
  // load fails the procedural bots stay, untouched.
  let soldierTemplate = null; // { scene, clips: Map<name, AnimationClip> }
  let modelReady = false; // settles true on success OR failure
  const teamMats = { vanguard: null, jackal: null };
  const HIT_ONLY = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const SOLDIER_CLIPS = ['Walk With Rifle', 'Rifle Run (1)', 'Rifle Idle', 'Rifle Aiming Idle', 'Punching'];

  // Team identity via material clones (never mutate the shared template):
  // vest + hat take a strong team tint, pants a lighter one; skin and face
  // stay natural.
  function buildTeamMats(team) {
    const tint = new THREE.Color(team === 'vanguard' ? PALETTE.vanguard : PALETTE.jackal);
    const white = new THREE.Color(0xffffff);
    const set = {};
    soldierTemplate.scene.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m || set[m.name]) continue;
        const c = m.clone();
        if (m.name === 'knitted_hat_01') {
          // The beanie is the team marker (the old bots had team helmets):
          // drop its grey-green base map, keep the knit normal map, and
          // wear the flat team colour so friend/foe reads at any range.
          c.map = null;
          c.color.copy(tint);
        } else if (m.name === 'tactical_vest_male') c.color.copy(tint).lerp(white, 0.05);
        else if (m.name === 'harvey_pantsbootsv1') c.color.copy(tint).lerp(white, 0.35);
        set[m.name] = c;
      }
    });
    return set;
  }

  function playClip(bot, name) {
    const s = bot.soldier;
    if (!s || s.clip === name) return;
    const next = s.actions[name];
    if (!next) return;
    const prev = s.clip ? s.actions[s.clip] : null;
    s.clip = name;
    next.reset();
    next.enabled = true;
    if (name === 'Punching') {
      // Knife swing: one fast chop, then the state machine takes over again.
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
      next.timeScale = 2.4;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
      next.timeScale = 1;
    }
    // First clip on a fresh soldier snaps to full weight: fading in from
    // the bind pose would show a half-T-pose. Later switches crossfade.
    if (prev) { next.fadeIn(0.15); prev.fadeOut(0.15); }
    next.play();
  }

  function attachSoldier(bot) {
    if (!soldierTemplate || bot.soldier) return;
    const mats = teamMats[bot.team] || (teamMats[bot.team] = buildTeamMats(bot.team));
    // Current procedural meshes become the hitbox: same zones, no render.
    const proxies = [];
    bot.group.traverse((o) => { if (o.isMesh) proxies.push(o); });
    const root = cloneSkeleton(soldierTemplate.scene);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; // skinned bounds are bind-pose; bones move them
      o.castShadow = true;
      const swap = (m) => mats[m.name] || m;
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
      o.userData.bot = bot;
      o.userData.part = o.name.indexOf('pantsboots') !== -1 ? 'legs' : 'body';
    });
    const holder = new THREE.Group();
    holder.scale.setScalar(0.1);
    holder.add(root);
    bot.group.add(holder);
    // No gun mesh ships in the file: the bot rifle rides the RightHand
    // bone. Bone space is cm, so the metre-built gun scales x100; the
    // quaternion was measured from the Rifle Aiming Idle pose so the
    // barrel follows the two-hand grip line (stock hand -> support hand).
    const hand = root.getObjectByName('RightHand');
    if (hand) {
      const gun = buildBotGun(new THREE.MeshStandardMaterial({ color: 0x1e2124, roughness: 0.5, metalness: 0.5 }));
      gun.quaternion.set(-0.433, -0.4404, -0.608, 0.4989);
      gun.scale.setScalar(100);
      gun.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; o.userData.bot = bot; o.userData.part = 'body'; }
      });
      hand.add(gun);
    }
    for (const m of proxies) { m.material = HIT_ONLY; m.castShadow = false; }
    const mixer = new THREE.AnimationMixer(root);
    const actions = {};
    for (const name of SOLDIER_CLIPS) {
      const clip = soldierTemplate.clips.get(name);
      if (clip) actions[name] = mixer.clipAction(clip);
    }
    bot.soldier = { holder, mixer, actions, clip: null };
    playClip(bot, 'Rifle Idle');
    mixer.update(0.05); // settle out of the T-pose bind frame immediately
  }

  // One retry on failure: a single dropped fetch of the 9 MB model on a
  // phone connection used to mean procedural block bots for the whole
  // session. A failed attach on ONE bot likewise must not strand the
  // rest — each attach is isolated, and a bot whose attach throws keeps
  // its procedural body (and stays fully hittable).
  function loadSoldier(attempt) {
    new GLTFLoader().loadAsync('assets/military-character.glb').then((gltf) => {
      const clips = new Map();
      for (const c of gltf.animations) clips.set(c.name, c);
      soldierTemplate = { scene: gltf.scene, clips };
      modelReady = true;
      for (const b of bots) {
        try { attachSoldier(b); } catch (e) { console.warn('[bots] soldier attach failed for one bot; it stays procedural:', e); }
      }
    }).catch((e) => {
      if (attempt < 2) {
        console.warn('[bots] military-character.glb load failed (attempt ' + attempt + '), retrying:', e);
        setTimeout(() => loadSoldier(attempt + 1), 1500);
      } else {
        console.warn('[bots] military-character.glb failed to load; keeping procedural bots:', e);
        modelReady = true;
      }
    });
  }
  loadSoldier(1);

  function los(from, to) {
    _v1.copy(to).sub(from);
    const dist = _v1.length();
    if (dist < 0.01) return true;
    _ray.set(from, _v1.normalize());
    _ray.far = dist;
    const hit = _ray.intersectObjects(shootables, false)[0];
    if (hit && hit.distance < dist - 0.35) return false;
    // A live smoke wall blocks sight too.
    if (los.smokeBlocks && los.smokeBlocks(from, to)) return false;
    return true;
  }

  function spawn(team, index, spawnPos, isCarrier) {
    const id = botSeq++;
    const name = team === 'vanguard' ? NAMES_V[index % 3] : NAMES_J[index % 4];
    const { group, body, head, legL, legR, armL, armR } = buildMesh(team);
    group.position.copy(spawnPos);
    scene.add(group);
    const bot = {
      id, name, team, index, isCarrier,
      group, bodyMesh: body, headMesh: head,
      legL, legR, armL, armR,
      pos: group.position, // alias: group.position
      yaw: team === 'vanguard' ? 0 : Math.PI,
      visYaw: team === 'vanguard' ? 0 : Math.PI,
      hp: 100, alive: true,
      mode: 'advance', destSite: null, holdPos: null,
      wpIndex: -1, path: [], pathI: 0,
      reaction: 0, seenAt: -999, lastShot: -999, fireBurst: 0,
      strafeDir: 1, strafeT: 0, plantT: 0, defuseT: 0,
      hearPos: null, speed: 3.4, aimErr: 0.035,
      walkPhase: 0, moveSpeed: 0, prevX: spawnPos.x, prevZ: spawnPos.z,
      turnLean: 0, strafeLeanV: 0, slideDir: 0,
      mag: 30, blindT: 0, respawnT: 0, knifeT: 0, armSwingT: 0, holdSince: 0,
      // SFX identity only (damage/rate stay the shared bot profile): the
      // gunshot timbre the player hears when this bot fires.
      gunKind: ['rifle', 'rifle', 'smg', 'rifle', 'pistol'][(index + (team === 'jackal' ? 2 : 0)) % 5],
      stepSfxT: 0,
      soldier: null, // skinned model state once attachSoldier runs
    };
    // Every body part is hittable: head 2x, body 1x, legs 0.75x
    // (the 'legs' tag set in buildMesh is kept, not overwritten).
    group.traverse((o) => {
      if (o.isMesh) { o.userData.bot = bot; o.userData.part = o === head ? 'head' : (o.userData.part || 'body'); }
    });
    bots.push(bot);
    if (soldierTemplate) {
      try { attachSoldier(bot); } catch (e) { console.warn('[bots] soldier attach failed at spawn; bot stays procedural:', e); }
    }
    return bot;
  }

  function clear() {
    for (const b of bots) {
      if (b.soldier) b.soldier.mixer.stopAllAction();
      scene.remove(b.group);
    }
    bots.length = 0;
  }

  function nearestWaypoint(pos) {
    let best = 0; let bd = Infinity;
    world.waypoints.forEach((w, i) => {
      const d = w.pos.distanceToSquared(pos);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  // BFS over the waypoint graph.
  function findPath(fromIdx, toIdx) {
    if (fromIdx === toIdx) return [toIdx];
    const prev = new Map([[fromIdx, -1]]);
    const q = [fromIdx];
    while (q.length) {
      const cur = q.shift();
      for (const n of world.waypoints[cur].links) {
        if (prev.has(n)) continue;
        prev.set(n, cur);
        if (n === toIdx) {
          const path = [n];
          let c = cur;
          while (c !== -1) { path.unshift(c); c = prev.get(c); }
          return path;
        }
        q.push(n);
      }
    }
    return [toIdx];
  }
  function setDestination(bot, targetPos) {
    const from = nearestWaypoint(bot.pos);
    const to = nearestWaypoint(targetPos);
    bot.path = findPath(from, to);
    bot.pathI = 0;
    bot.holdPos = targetPos.clone();
  }
  function pickSiteTarget(bot, rng) {
    const site = bot.destSite === 'alpha' ? world.sites.alpha : world.sites.beta;
    const p = site.center.clone();
    p.x += (rng() - 0.5) * 3;
    p.z += (rng() - 0.5) * 3;
    return p;
  }

  // ctx: { now, dt, rng, player, playerPos, enemiesOf(bot)->[{pos,alive,isPlayer,bot?}],
  //   planted, plantSite, sites, onShootBot(bot, targetPos, damage), onPlantDone(site),
  //   onDefuseDone(), damagePlayer(amount, fromPos), effects, sfx, noise: [{pos, t}] }
  function step(bot, ctx) {
    if (!bot.alive) return;
    const dt = ctx.dt;
    const now = ctx.now;
    if (bot.blindT > 0) bot.blindT -= dt;

    // Choose a target: nearest visible enemy (player or opposing bot).
    let target = null; let targetDist = Infinity;
    for (const e of ctx.enemiesOf(bot)) {
      if (!e.alive) continue;
      const d = bot.pos.distanceTo(e.pos);
      if (d > 48) continue;
      _v2.copy(e.pos); _v2.y += 1.3;
      const eye = _v1.copy(bot.pos); eye.y = 1.5;
      if (!los(eye, _v2)) continue;
      if (d < targetDist) { targetDist = d; target = e; }
    }
    if (target) {
      // Reaction counts from FIRST sighting only: re-arming it every step
      // while the target stays visible means it never elapses and the bot
      // never engages or shoots. Reset on losing the target instead.
      if (bot.seenAt < 0) bot.reaction = now + 0.45 + ctx.rng() * 0.45;
      bot.seenAt = now;
    } else {
      bot.seenAt = -999;
    }
    // A flashed bot cannot see, plant, or defuse until the white clears.
    if (bot.blindT > 0) target = null;

    // Hearing: recent gunfire/grenade pulls the bot toward the noise.
    for (const n of ctx.noise) {
      if (now - n.t < 1.2 && bot.pos.distanceTo(n.pos) < 26 && bot.mode !== 'engage') {
        bot.hearPos = n.pos.clone();
      }
    }

    const lowHp = bot.hp < 35;
    let moveTarget = null;
    let wantPlant = false;
    let wantDefuse = false;

    if (ctx.dm && bot.mode === 'hold' && now - (bot.holdSince || 0) > 2.5) {
      // Deathmatch: keep roaming — pick a fresh random waypoint.
      bot.mode = 'advance';
      setDestination(bot, world.waypoints[Math.floor(ctx.rng() * world.waypoints.length)].pos);
      moveTarget = bot.holdPos;
    } else if (bot.team === 'jackal' && ctx.planted) {
      // Defend the planted charge: hold near the site.
      if (!bot.holdPos || bot.mode !== 'defend') {
        bot.mode = 'defend';
        setDestination(bot, ctx.plantSite.center);
      }
      if (bot.pos.distanceTo(ctx.plantSite.center) < 6) moveTarget = null;
      else moveTarget = bot.holdPos;
    } else if (bot.team === 'vanguard' && ctx.planted) {
      // Push the site and defuse.
      const dSite = bot.pos.distanceTo(ctx.plantSite.center);
      if (dSite < 2.2 && bot.blindT <= 0) wantDefuse = true;
      else { bot.mode = 'advance'; moveTarget = ctx.plantSite.center; }
    } else if (bot.isCarrier && bot.team === 'jackal' && !ctx.planted) {
      const site = bot.destSite === 'alpha' ? world.sites.alpha : world.sites.beta;
      const dSite = bot.pos.distanceTo(site.center);
      if (dSite < 2.4 && !target && bot.blindT <= 0) wantPlant = true;
      else if (bot.mode !== 'advance' || !bot.holdPos) { bot.mode = 'advance'; setDestination(bot, pickSiteTarget(bot, ctx.rng)); moveTarget = bot.holdPos; }
      else moveTarget = bot.holdPos;
    } else if (lowHp && target && bot.mode !== 'retreat') {
      bot.mode = 'retreat';
      const away = bot.pos.clone().sub(target.pos).normalize().multiplyScalar(8);
      setDestination(bot, bot.pos.clone().add(away));
      moveTarget = bot.holdPos;
    } else if (bot.mode === 'retreat' && !target) {
      // Retreat done (lost the enemy): resume the advance to the site instead
      // of standing frozen with no orders.
      bot.mode = 'advance';
      setDestination(bot, pickSiteTarget(bot, ctx.rng));
      moveTarget = bot.holdPos;
    } else if (target && now >= bot.reaction) {
      bot.mode = 'engage';
      moveTarget = null; // plant feet and shoot; strafe below
    } else if (bot.hearPos && bot.mode !== 'engage') {
      bot.mode = 'advance';
      setDestination(bot, bot.hearPos);
      bot.hearPos = null;
      moveTarget = bot.holdPos;
    } else if (bot.mode === 'advance' && bot.holdPos) {
      moveTarget = bot.holdPos;
    } else if (bot.mode === 'advance') {
      // No orders yet: advance to a hold point near the assigned site.
      bot.mode = 'advance';
      setDestination(bot, pickSiteTarget(bot, ctx.rng));
      moveTarget = bot.holdPos;
    }

    // Plant / defuse progress (channelled, interrupted by taking damage or moving).
    if (wantPlant) {
      bot.plantT += dt;
      bot.mode = 'plant';
      if (bot.plantT >= 3) { bot.plantT = 0; ctx.onPlantDone(bot.destSite); }
    } else bot.plantT = 0;
    if (wantDefuse) {
      bot.defuseT += dt;
      bot.mode = 'defuse';
      if (bot.defuseT >= 5) { bot.defuseT = 0; ctx.onDefuseDone(bot); }
    } else bot.defuseT = 0;

    // Movement along waypoint path toward moveTarget.
    if (moveTarget && !wantPlant && !wantDefuse) {
      let wpTarget = moveTarget;
      if (bot.path.length && bot.pathI < bot.path.length) {
        wpTarget = world.waypoints[bot.path[bot.pathI]].pos;
        if (bot.pos.distanceTo(wpTarget) < 1.2) { bot.pathI += 1; bot.slideDir = 0; }
      }
      const dx = wpTarget.x - bot.pos.x;
      const dz = wpTarget.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.4) {
        const sp = bot.speed * (bot.mode === 'retreat' ? 1.15 : 1);
        const ix = (dx / d) * sp * dt, iz = (dz / d) * sp * dt;
        bot.pos.x += ix;
        bot.pos.z += iz;
        // Wall slide: trigger on actual contact (resolveCircle pushed the bot),
        // not on a moved-ratio heuristic — a mostly-lateral step against a
        // wall still "moves" ~50%, which made the old trigger flip-flop and
        // wedge the bot. Commit to one side until a contact-free step.
        const rx = bot.pos.x, rz = bot.pos.z;
        resolveCircle(bot.pos, 0.4, 0, 1.7, world.colliders);
        const pushed = Math.hypot(bot.pos.x - rx, bot.pos.z - rz);
        if (pushed > 0.001) {
          if (bot.slideDir === 0) {
            const tx = -dz / d, tz = dx / d;
            const s = sp * dt * 0.8;
            const d1 = Math.hypot(wpTarget.x - (bot.pos.x + tx * s), wpTarget.z - (bot.pos.z + tz * s));
            const d2 = Math.hypot(wpTarget.x - (bot.pos.x - tx * s), wpTarget.z - (bot.pos.z - tz * s));
            bot.slideDir = d1 <= d2 ? 1 : -1;
          }
          const tx = -dz / d * bot.slideDir, tz = dx / d * bot.slideDir;
          const s = sp * dt * 0.9;
          bot.pos.x += tx * s;
          bot.pos.z += tz * s;
          resolveCircle(bot.pos, 0.4, 0, 1.7, world.colliders);
        } else {
          bot.slideDir = 0;
        }
        bot.yaw = Math.atan2(dx, dz);
      } else if (bot.pathI >= bot.path.length && bot.mode === 'advance') {
        bot.mode = 'hold';
        bot.holdPos = bot.pos.clone();
        bot.holdSince = now;
      }
    }

    // Keep bots out of the player's camera: bots used to path straight
    // through the player and park inside the near plane, filling the
    // whole screen with one giant helmet. A soft 0.8 m bubble around
    // the player pushes them aside (they can still knife from 2.2 m).
    if (ctx.player && ctx.player.state.alive) {
      const pp = ctx.player.state.position;
      const pdx = bot.pos.x - pp.x, pdz = bot.pos.z - pp.z;
      const pd2 = pdx * pdx + pdz * pdz;
      if (pd2 < 0.64 && pd2 > 1e-6) {
        const pd = Math.sqrt(pd2);
        bot.pos.x = pp.x + (pdx / pd) * 0.8;
        bot.pos.z = pp.z + (pdz / pd) * 0.8;
        resolveCircle(bot.pos, 0.4, 0, 1.7, world.colliders);
      }
    }

    // Facing: face the target when engaging, else face movement / site.
    if (target) {
      bot.yaw = Math.atan2(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
    }
    // Smooth turns: the visible heading chases the logical yaw, never snaps.
    // The heading's angular velocity also drives a lean into the turn.
    const prevVis = bot.visYaw;
    let dyaw = bot.yaw - bot.visYaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    const maxTurn = 9 * dt;
    bot.visYaw += Math.max(-maxTurn, Math.min(maxTurn, dyaw));
    bot.group.rotation.y = bot.visYaw;
    const turnRate = (bot.visYaw - prevVis) / Math.max(dt, 1e-4);
    bot.turnLean += (Math.max(-0.12, Math.min(0.12, -turnRate * 0.03)) - bot.turnLean) * Math.min(1, dt * 8);
    // Lean into the strafe while engaging.
    const strafeLeanT = bot.mode === 'engage' ? bot.strafeDir * 0.05 : 0;
    bot.strafeLeanV += (strafeLeanT - bot.strafeLeanV) * Math.min(1, dt * 6);

    // Engage strafe: sidestep and peek instead of planting feet and standing still.
    if (bot.mode === 'engage' && target) {
      bot.strafeT += dt;
      if (bot.strafeT > 1.1 + ctx.rng() * 0.5) {
        bot.strafeT = 0;
        if (ctx.rng() < 0.65) bot.strafeDir *= -1;
      }
      const tx = target.pos.x - bot.pos.x, tz = target.pos.z - bot.pos.z;
      const tl = Math.hypot(tx, tz) || 1;
      // Sidestep perpendicular to the line of fire.
      bot.pos.x += (-tz / tl) * bot.strafeDir * 1.5 * dt;
      bot.pos.z += (tx / tl) * bot.strafeDir * 1.5 * dt;
      // Drift back into the preferred 8–18 m band.
      if (targetDist > 20) { bot.pos.x += (tx / tl) * dt; bot.pos.z += (tz / tl) * dt; }
      else if (targetDist < 6) { bot.pos.x -= (tx / tl) * dt; bot.pos.z -= (tz / tl) * dt; }
      resolveCircle(bot.pos, 0.4, 0, 1.7, world.colliders);
    }

    // --- Locomotion: stride frequency follows real speed, never a fixed clock.
    const dxm = bot.pos.x - bot.prevX, dzm = bot.pos.z - bot.prevZ;
    const instSpeed = Math.hypot(dxm, dzm) / Math.max(dt, 1e-4);
    bot.moveSpeed += (instSpeed - bot.moveSpeed) * Math.min(1, dt * 10);
    bot.prevX = bot.pos.x; bot.prevZ = bot.pos.z;
    const sf = Math.min(1, bot.moveSpeed / 3.2); // stride amount 0..1
    const moving = bot.moveSpeed > 0.4;
    if (moving) bot.walkPhase += dt * bot.moveSpeed * 4.2;
    // Audible footsteps inside earshot, timed roughly to the stride —
    // a bot pushing your flank should be hearable before it is visible.
    if (moving && sfx.botStep) {
      bot.stepSfxT -= dt;
      if (bot.stepSfxT <= 0) {
        bot.stepSfxT = 0.37;
        const pd = Math.hypot(bot.pos.x - ctx.player.state.position.x, bot.pos.z - ctx.player.state.position.z);
        if (pd < 13) sfx.botStep(pd);
      }
    }
    // Two-piece gait: thighs swing wide (±0.62 rad), knees flex while the
    // foot lifts through the forward swing and straighten on plant, boots
    // stay near-flat so the step reads as a step instead of a pendulum.
    const swL = Math.sin(bot.walkPhase) * 0.62 * sf;
    const swR = -swL;
    const kneeL = Math.max(0, Math.sin(bot.walkPhase - 1.2)) * 0.9 * sf;
    const kneeR = Math.max(0, Math.sin(bot.walkPhase + Math.PI - 1.2)) * 0.9 * sf;
    bot.legL.hip.rotation.x = swL;
    bot.legR.hip.rotation.x = swR;
    bot.legL.knee.rotation.x = kneeL;
    bot.legR.knee.rotation.x = kneeR;
    bot.legL.boot.rotation.x = -(swL + kneeL) * 0.35;
    bot.legR.boot.rotation.x = -(swR + kneeR) * 0.35;
    // Arms hold the gun forward, counter-swinging slightly against the stride,
    // with a faint idle sway when standing still. A knife swing adds a fast
    // forward chop on the right arm.
    const armBase = -1.05;
    const idleSway = Math.sin(now * 1.8) * 0.02;
    if (bot.armSwingT > 0) bot.armSwingT -= dt;
    const swing = bot.armSwingT > 0 ? Math.sin((0.4 - bot.armSwingT) / 0.4 * Math.PI) * -0.9 : 0;
    bot.armL.rotation.x = armBase + Math.sin(bot.walkPhase) * 0.07 * sf + idleSway;
    bot.armR.rotation.x = armBase - Math.sin(bot.walkPhase) * 0.07 * sf + idleSway + swing;
    // Forward lean grows with speed (walk -> run); lateral roll combines the
    // stride sway, the turn lean and the strafe lean.
    const leanT = moving ? (0.05 + 0.07 * sf) : 0;
    bot.group.rotation.x += (leanT - bot.group.rotation.x) * Math.min(1, dt * 8);
    bot.group.rotation.z = Math.sin(bot.walkPhase) * 0.035 * sf + bot.turnLean + bot.strafeLeanV;
    bot.group.position.y = moving ? Math.abs(Math.sin(bot.walkPhase)) * 0.06 * sf : 0;

    // Skinned soldier (once loaded): the clips carry all body motion —
    // in-place, no root drift — so cancel the procedural lean/bob above
    // (the group keeps only its yaw) and drive the animation state
    // machine instead: run / walk-with-rifle by ground speed, aiming
    // idle while engaging or just fired, rifle idle standing, and a
    // punching one-shot for the knife swing.
    if (bot.soldier) {
      bot.group.rotation.x = 0;
      bot.group.rotation.z = 0;
      bot.group.position.y = 0;
      let clip = 'Rifle Idle';
      if (bot.armSwingT > 0) clip = 'Punching';
      else if (bot.moveSpeed > 3.6) clip = 'Rifle Run (1)';
      else if (bot.moveSpeed > 0.4) clip = 'Walk With Rifle';
      else if (bot.mode === 'engage' || now - bot.lastShot < 0.35) clip = 'Rifle Aiming Idle';
      playClip(bot, clip);
      const act = bot.soldier.actions[bot.soldier.clip];
      if (act && bot.soldier.clip === 'Walk With Rifle') {
        act.timeScale = Math.max(0.75, Math.min(1.35, bot.moveSpeed / 3.2));
      } else if (act && bot.soldier.clip === 'Rifle Run (1)') {
        act.timeScale = Math.max(0.8, Math.min(1.3, bot.moveSpeed / 3.9));
      }
      bot.soldier.mixer.update(dt);
    }

    // Knife: point-blank targets get a melee swing instead of a shot.
    if (target && targetDist < 2.2 && now >= bot.knifeT) {
      bot.knifeT = now + 0.9;
      bot.armSwingT = 0.4;
      sfx.swing();
      if (target.isPlayer) ctx.damagePlayer(25, bot.pos, bot);
      else ctx.damageBot(target.bot, 25, false, bot);
    }
    // Shooting: bursts with aim error, worse at range and while target moves.
    if (target && now >= bot.reaction && now - bot.lastShot > 0.13) {
      const eye = _v1.copy(bot.pos); eye.y = 1.5;
      _v2.copy(target.pos); _v2.y += 1.35;
      if (los(eye, _v2)) {
        // Magazine: 30 rounds, then a 1.6 s reload pause (audible up
        // close — a reloading bot is a free push, the player should hear it).
        if (bot.mag <= 0) {
          bot.mag = 30; bot.lastShot = now + 1.6;
          if (sfx.botReload) sfx.botReload(bot.pos.distanceTo(ctx.player.state.position));
        }
        else {
          bot.mag -= 1;
          bot.lastShot = now;
          bot.fireBurst += 1;
          const err = bot.aimErr * (1 + targetDist / 30) * (target.isPlayer && ctx.playerMoving ? 1.4 : 1);
          const hitChance = Math.max(0.12, 0.62 - targetDist * 0.009 - err * 4);
          const hit = ctx.rng() < hitChance;
          const from = bot.pos.clone(); from.y = 1.45;
          const to = target.pos.clone(); to.y = 1.3;
          if (!hit) { to.x += (ctx.rng() - 0.5) * 2; to.y += (ctx.rng() - 0.5) * 1.2; to.z += (ctx.rng() - 0.5) * 2; }
          const shotDir = to.clone().sub(from).normalize();
          ctx.effects.tracer(from, to);
          ctx.effects.muzzle(from, shotDir);
          // Gunshot with distance attenuation from the PLAYER's ears:
          // near bots crack, far bots thud (see audio.js botShot).
          if (sfx.botShot) sfx.botShot(bot.gunKind, bot.pos.distanceTo(ctx.player.state.position));
          else sfx.distantShot();
          if (hit) {
            const dmg = 9 + ctx.rng() * 14;
            if (target.isPlayer) ctx.damagePlayer(dmg, bot.pos, bot);
            else {
              ctx.effects.blood(_v2.set(target.pos.x, 1.3, target.pos.z), false);
              ctx.damageBot(target.bot, dmg, false, bot);
            }
          } else {
            // A missed shot leaves a bullet hole where it strikes a surface.
            _ray.set(from, shotDir);
            _ray.far = from.distanceTo(to) + 4;
            const wh = _ray.intersectObjects(shootables, false)[0];
            if (wh && wh.face) {
              const n = wh.face.normal.clone().transformDirection(wh.object.matrixWorld);
              ctx.effects.addHole(wh.point, n);
            }
          }
          if (bot.fireBurst > 4) { bot.fireBurst = 0; bot.lastShot = now + 0.5 + ctx.rng() * 0.6; }
        }
      }
    }
  }

  function damage(bot, amount, isHead, attacker) {
    if (!bot.alive) return false;
    bot.hp -= amount;
    bot.plantT = 0; bot.defuseT = 0;
    if (bot.hp <= 0) {
      bot.hp = 0; bot.alive = false;
      bot.group.visible = false;
      return true;
    }
    return false;
  }

  function respawn(bot, pos) {
    bot.hp = 100; bot.alive = true; bot.mag = 30;
    bot.group.visible = true;
    bot.pos.copy(pos);
    bot.plantT = 0; bot.defuseT = 0; bot.respawnT = 0;
    bot.mode = 'advance'; bot.path = []; bot.pathI = 0; bot.holdPos = null;
    bot.seenAt = -999; bot.reaction = 0; bot.fireBurst = 0; bot.blindT = 0;
  }

  return { bots, spawn, clear, step, damage, los, setDestination, pickSiteTarget, respawn, get modelReady() { return modelReady; } };
}
