// First-person movement: WASD acceleration, sprint, jump, crouch,
// gravity, AABB circle collision against world boxes.
import * as THREE from 'three';
import { resolveCircle } from './world.js';

const EYE_STAND = 1.62;
const EYE_CROUCH = 1.08;
const RADIUS = 0.38;
const GRAVITY = 22;
const JUMP_V = 7.2;

export function createPlayer(colliders) {
  const state = {
    position: new THREE.Vector3(0, 0, 22),
    vel: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    eye: EYE_STAND,
    hp: 100, armor: 0, alive: true,
    crouch: false, onGround: true,
    speed: 0, // horizontal speed, for spread/recoil
    moveSpeedMul: 1, // weapon weight
    bobPhase: 0, // view-bob cycle, driven by real speed
    landDip: 0, // eye dip after a hard landing, decays fast
    strafeLean: 0, // smoothed camera roll from strafing
    lookSX: 0, lookSY: 0, // smoothed look deltas — viewmodel sway lags the mouse
    sprinting: false,
  };

  function reset(spawn, yaw) {
    state.position.copy(spawn);
    state.vel.set(0, 0, 0);
    state.yaw = yaw; state.pitch = 0;
    state.hp = 100; state.alive = true;
    // Armor is loadout, not per-life: it persists across rounds and
    // respawns until depleted (a fresh match resets it — see main.js).
    state.crouch = false; state.eye = EYE_STAND;
    state.bobPhase = 0; state.landDip = 0; state.strafeLean = 0;
    state.lookSX = 0; state.lookSY = 0; state.sprinting = false;
  }
  function look(dx, dy) {
    state.yaw -= dx * 0.0021;
    state.pitch -= dy * 0.0021;
    const lim = Math.PI / 2 - 0.02;
    state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
    state.lookSX = state.lookSX * 0.75 + dx * 0.25;
    state.lookSY = state.lookSY * 0.75 + dy * 0.25;
  }
  function recoil(pitchKick, yawKick) {
    state.pitch += pitchKick;
    state.yaw += yawKick;
    const lim = Math.PI / 2 - 0.02;
    state.pitch = Math.max(-lim, Math.min(lim, state.pitch));
  }
  // Returns damage actually applied to HP after armor absorbs 50%.
  function damage(amount) {
    if (!state.alive) return 0;
    let rest = amount;
    if (state.armor > 0) {
      const absorbed = Math.min(state.armor, rest * 0.5);
      state.armor -= absorbed;
      rest -= absorbed;
    }
    state.hp -= rest;
    if (state.hp <= 0) { state.hp = 0; state.alive = false; }
    return rest;
  }

  function step(dt, keys, sprint) {
    if (!state.alive) return;
    const wantCrouch = keys.has('ControlLeft') || keys.has('KeyC');
    state.crouch = wantCrouch;
    const targetEye = wantCrouch ? EYE_CROUCH : EYE_STAND;
    state.eye += (targetEye - state.eye) * Math.min(1, dt * 12);

    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(state.yaw), cos = Math.cos(state.yaw);
    // Forward on the ground plane for yaw (YXZ, yaw 0 faces -z).
    let mx = -sin * fwd + cos * strafe;
    let mz = -cos * fwd - sin * strafe;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    const base = wantCrouch ? 2.6 : sprint ? 7.4 : 5.2;
    // touchMag is the touch joystick's analog magnitude (1 when idle or on
    // keyboard/mouse, so desktop play is byte-for-byte unaffected).
    const target = base * state.moveSpeedMul * (state.touchMag ?? 1);
    // Exponential approach to target velocity (acceleration-based movement).
    // A softer rate keeps starts/stops smooth instead of snapping.
    const k = 1 - Math.exp(-dt * (state.onGround ? 9 : 2.5));
    state.vel.x += (mx * target - state.vel.x) * k;
    state.vel.z += (mz * target - state.vel.z) * k;

    if (keys.has('Space') && state.onGround) {
      state.vel.y = JUMP_V;
      state.onGround = false;
    }
    const wasGround = state.onGround;
    state.vel.y -= GRAVITY * dt;
    state.position.x += state.vel.x * dt;
    state.position.z += state.vel.z * dt;
    resolveCircle(state.position, RADIUS, state.position.y, state.position.y + 1.7, colliders);
    const fallV = state.vel.y;
    state.position.y += state.vel.y * dt;
    if (state.position.y <= 0) {
      state.position.y = 0;
      if (!wasGround && fallV < -4) state.landDip = Math.min(0.13, -fallV * 0.013);
      state.vel.y = 0; state.onGround = true;
    }
    state.position.x = Math.max(-35, Math.min(35, state.position.x));
    state.position.z = Math.max(-26, Math.min(26, state.position.z));
    state.speed = Math.hypot(state.vel.x, state.vel.z);
    // View-bob cycle follows real speed; strafe lean + landing dip decay.
    if (state.onGround && state.speed > 0.5) state.bobPhase += dt * state.speed * 1.9;
    state.landDip *= Math.exp(-dt * 7);
    const leanT = strafe * 0.028;
    state.strafeLean += (leanT - state.strafeLean) * Math.min(1, dt * 10);
  }

  return { state, reset, look, recoil, damage, step };
}
