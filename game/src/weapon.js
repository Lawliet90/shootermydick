// Weapons, firing, recoil/spread, tracers, muzzle flash, impacts, grenades.
// All geometry is procedural; all sound is synthesized (see audio.js).
// Viewmodels: detailed procedural guns (cylinders, capsules and layered
// receiver parts) plus TWO low-poly procedural hands — olive camo
// sleeves (canvas blotch texture, flat-shaded 7-sided segments with an
// elbow bend), bare skin wrists, and green fingerless gloves whose
// three-segment fingers (skin tips) wrap the part they hold. The right
// hand works the pistol grip with its index finger on the trigger; the
// left hand supports the pump / handguard / forend — or cups the pistol
// grip two-handed; the knife is one-handed (left = null). Posed per
// weapon by HAND_POSES below, matching the user's reference POV
// (2026-11-16). The old GodotFPS rigged-arms kit is gone: in the live
// build it rendered as a giant white clay rifle with no visible hands.
// Arms are two segments with a slight elbow bend, run mostly toward
// the viewer (foreshortened), and exit the BOTTOM edge near the
// centre of the frame; the viewmodel base sits low so the grips ride
// near the bottom and the visible forearm is ~a fifth of the screen
// height. One straight sleeve of any length read as a green pipe /
// camo column from the bottom corners in three straight playtests;
// rejected.
import * as THREE from 'three';

export const WEAPONS = [
  { id: 'p9', slot: 1, name: 'P9 Sidearm', price: 0, damage: 22, headMul: 2, rateMs: 300, auto: false, mag: 12, reserve: 48, spread: 0.011, recoil: 0.011, bloom: 0.004, reloadMs: 1100, speed: 1.0, falloff: 18, kind: 'pistol', desc: 'Reliable sidearm. Free, always owned.' },
  { id: 'vk7', slot: 2, name: 'VK-7 Carbine', price: 2700, damage: 30, headMul: 2, rateMs: 108, auto: true, mag: 30, reserve: 120, spread: 0.015, recoil: 0.013, bloom: 0.005, reloadMs: 1900, speed: 0.97, falloff: 28, kind: 'rifle', desc: 'Full-auto workhorse. Accurate at range.' },
  { id: 'ratter', slot: 3, name: 'Ratter-9 SMG', price: 1500, damage: 19, headMul: 2, rateMs: 74, auto: true, mag: 32, reserve: 128, spread: 0.021, recoil: 0.009, bloom: 0.005, reloadMs: 1600, speed: 1.0, falloff: 16, kind: 'rifle', desc: 'Fast close-quarters spray.' },
  { id: 'breacher', slot: 4, name: 'Breacher-12', price: 1200, damage: 9, headMul: 2, rateMs: 750, auto: false, mag: 6, reserve: 24, spread: 0.05, recoil: 0.05, bloom: 0.012, reloadMs: 2400, speed: 0.95, falloff: 10, pellets: 8, kind: 'shotgun', desc: '8-pellet shotgun. Devastating up close.' },
  { id: 'longbow', slot: 5, name: 'Longbow .338', price: 4750, damage: 95, headMul: 2, rateMs: 1400, auto: false, mag: 5, reserve: 20, spread: 0.004, recoil: 0.06, bloom: 0.02, reloadMs: 2800, speed: 0.9, falloff: 60, kind: 'sniper', desc: 'Bolt-action marksman rifle. One shot, one down.' },
  { id: 'ak47', slot: 6, name: 'AK-47', price: 2500, damage: 36, headMul: 2, rateMs: 100, auto: true, mag: 30, reserve: 90, spread: 0.016, recoil: 0.016, bloom: 0.006, reloadMs: 2000, speed: 0.96, falloff: 30, kind: 'rifle', desc: 'Hard-hitting rifle. Big kick, big damage.' },
  { id: 'awp', slot: 7, name: 'AWP', price: 4750, damage: 110, headMul: 2, rateMs: 1450, auto: false, mag: 5, reserve: 30, spread: 0.003, recoil: 0.07, bloom: 0.02, reloadMs: 3000, speed: 0.9, falloff: 80, kind: 'sniper', desc: 'Heavy bolt-action. Deletes whatever it touches.' },
  { id: 'm4a1s', slot: 8, name: 'M4A1-S', price: 2900, damage: 33, headMul: 2, rateMs: 96, auto: true, mag: 20, reserve: 80, spread: 0.013, recoil: 0.011, bloom: 0.005, reloadMs: 1800, speed: 0.98, falloff: 30, kind: 'rifle', suppressed: true, desc: 'Silenced carbine. Quiet, precise, 20-round mag.' },
  { id: 'knife', slot: 9, name: 'Combat Knife', price: 0, damage: 55, headMul: 1, rateMs: 450, auto: false, mag: 0, reserve: 0, spread: 0, recoil: 0.004, bloom: 0, reloadMs: 0, speed: 1.05, falloff: 0, kind: 'knife', melee: true, range: 2.6, desc: 'Silent and fast. Free, always owned.' },
];
export const GEAR = [
  { id: 'spark9', name: 'Spark-9 Frag', price: 300, desc: 'Frag grenade. G to throw. 1.2 s fuse, AoE damage.' },
  { id: 'flash', name: 'Flashbang', price: 200, desc: 'Blinds anyone looking at it. F to throw.' },
  { id: 'smoke', name: 'Smoke Grenade', price: 300, desc: 'Thick smoke wall, blocks sight. V to throw.' },
  { id: 'kit', name: 'Defuse Kit', price: 400, desc: 'Halves defuse time (5 s → 2.5 s).' },
  { id: 'kevlar', name: 'Kevlar Vest', price: 650, desc: '+50 armor. Absorbs half of incoming damage.' },
  { id: 'helmet', name: 'Armor + Helmet', price: 1000, desc: '+100 armor, full protection set.' },
];
export const byId = (id) => WEAPONS.find((w) => w.id === id);

// Visual effects pool: tracers, muzzle flash + smoke, impact bursts,
// blood, bullet-hole decals, smoke clouds. Reused objects only.
export function createEffects(scene) {
  const tracers = [];
  const bursts = [];
  const flashes = [];
  const puffs = [];
  const holes = [];
  const decals = [];
  const clouds = [];
  const tracerGeo = new THREE.BufferGeometry();
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9 });
  const flash = new THREE.PointLight(0xffb347, 0, 9, 2);
  scene.add(flash);
  const burstGeo = new THREE.SphereGeometry(0.07, 6, 5);
  const burstMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  const bloodMat = new THREE.MeshBasicMaterial({ color: 0xa01812 });
  const bloodGeo = new THREE.SphereGeometry(0.05, 6, 5);

  // Soft radial sprite texture, shared by muzzle flash and smoke puffs.
  const softTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();

  function tracer(from, to) {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(g, tracerMat.clone());
    line.material.transparent = true;
    scene.add(line);
    tracers.push({ line, life: 0.07 });
  }
  // Muzzle flash: light + a bright additive sprite at the muzzle + a thin
  // smoke puff that drifts up and fades. dir is the shot direction (smoke
  // drifts along it, then rises).
  function muzzle(pos, dir) {
    flash.position.copy(pos);
    flash.intensity = 26;
    const sm = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softTex, color: 0xffd27a, transparent: true, opacity: 0.95,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    sm.position.copy(pos);
    sm.scale.setScalar(0.55 + Math.random() * 0.25);
    scene.add(sm);
    flashes.push({ sprite: sm, life: 0.06 });
    for (let i = 0; i < 3; i++) {
      const pm = new THREE.SpriteMaterial({
        map: softTex, color: 0x9a938a, transparent: true, opacity: 0.32, depthWrite: false,
      });
      const p = new THREE.Sprite(pm);
      p.position.copy(pos);
      if (dir) p.position.addScaledVector(dir, 0.12 + Math.random() * 0.15);
      p.scale.setScalar(0.14 + Math.random() * 0.1);
      scene.add(p);
      puffs.push({
        sprite: p, life: 1.1 + Math.random() * 0.4,
        vel: new THREE.Vector3(
          (dir ? dir.x : 0) * 0.4 + (Math.random() - 0.5) * 0.3,
          0.35 + Math.random() * 0.3,
          (dir ? dir.z : 0) * 0.4 + (Math.random() - 0.5) * 0.3),
      });
    }
  }
  function impact(point, color = 0xffd9a0) {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(burstGeo, burstMat.clone());
      m.material.color.setHex(color);
      m.position.copy(point);
      scene.add(m);
      bursts.push({
        mesh: m, life: 0.35,
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3 + 1, (Math.random() - 0.5) * 4),
      });
    }
  }
  // Blood burst at a hit point (red particles, gravity, short life).
  function blood(point, head) {
    const n = head ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(bloodGeo, bloodMat);
      m.position.copy(point);
      scene.add(m);
      bursts.push({
        mesh: m, life: 0.45 + Math.random() * 0.2, blood: true,
        vel: new THREE.Vector3((Math.random() - 0.5) * 3.4, Math.random() * 2.4 + 0.6, (Math.random() - 0.5) * 3.4),
      });
    }
  }
  // Dark red pool on the ground where a lethal hit landed. Persists the round.
  function bloodDecal(point) {
    if (decals.length >= 20) { const d = decals.shift(); scene.remove(d); d.geometry.dispose(); d.material.dispose(); }
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(0.55 + Math.random() * 0.3, 14),
      new THREE.MeshBasicMaterial({ color: 0x5d0d08, transparent: true, opacity: 0.75, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(point.x, 0.03, point.z);
    scene.add(m);
    decals.push(m);
  }
  // Bullet hole: small dark decal on the surface that was hit. Persists the
  // round (cap 120 — nine bots trade fire constantly, so a small cap churns
  // faster than the player can see it; oldest removed first).
  // normal = surface normal.
  function addHole(point, normal) {
    if (holes.length >= 120) { const h = holes.shift(); scene.remove(h); h.geometry.dispose(); h.material.dispose(); }
    const m = new THREE.Mesh(
      new THREE.CircleGeometry(0.07 + Math.random() * 0.03, 10),
      new THREE.MeshBasicMaterial({ color: 0x14100c, transparent: true, opacity: 0.9, depthWrite: false }));
    m.position.copy(point).addScaledVector(normal, 0.012);
    m.lookAt(point.clone().add(normal));
    scene.add(m);
    holes.push(m);
  }
  function clearDecals() {
    for (const h of holes) { scene.remove(h); h.geometry.dispose(); h.material.dispose(); }
    holes.length = 0;
    for (const d of decals) { scene.remove(d); d.geometry.dispose(); d.material.dispose(); }
    decals.length = 0;
  }
  // Smoke wall: a cluster of big soft puffs, ~15 s, blocks line of sight.
  function addSmokeCloud(pos) {
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const pm = new THREE.SpriteMaterial({
        map: softTex, color: 0x8f8a82, transparent: true, opacity: 0.55, depthWrite: false,
      });
      const p = new THREE.Sprite(pm);
      p.position.set(pos.x + (Math.random() - 0.5) * 3.4, 0.8 + Math.random() * 1.6, pos.z + (Math.random() - 0.5) * 3.4);
      p.scale.setScalar(2.2 + Math.random() * 1.6);
      scene.add(p);
      parts.push(p);
    }
    clouds.push({ pos: pos.clone(), r: 3.4, life: 15, parts });
  }
  // Segment-sphere test: does the a->b line pass through any live smoke cloud?
  function blocksLOS(a, b) {
    for (const c of clouds) {
      const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
      const apx = c.pos.x - a.x, apy = c.pos.y - a.y, apz = c.pos.z - a.z;
      const len2 = abx * abx + aby * aby + abz * abz || 1;
      let t = (apx * abx + apy * aby + apz * abz) / len2;
      t = Math.max(0, Math.min(1, t));
      const dx = a.x + abx * t - c.pos.x, dy = a.y + aby * t - c.pos.y, dz = a.z + abz * t - c.pos.z;
      if (dx * dx + dy * dy + dz * dz < c.r * c.r) return true;
    }
    return false;
  }
  function step(dt) {
    flash.intensity = Math.max(0, flash.intensity - dt * 220);
    for (let i = tracers.length - 1; i >= 0; i--) {
      const t = tracers[i];
      t.life -= dt;
      t.line.material.opacity = Math.max(0, t.life / 0.07) * 0.9;
      if (t.life <= 0) { scene.remove(t.line); t.line.geometry.dispose(); t.line.material.dispose(); tracers.splice(i, 1); }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.life -= dt;
      b.vel.y -= (b.blood ? 12 : 9) * dt;
      b.mesh.position.addScaledVector(b.vel, dt);
      b.mesh.scale.setScalar(Math.max(0.01, b.life / 0.35));
      if (b.life <= 0) { scene.remove(b.mesh); b.mesh.material.dispose(); bursts.splice(i, 1); }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life -= dt;
      f.sprite.material.opacity = Math.max(0, f.life / 0.06) * 0.95;
      f.sprite.scale.multiplyScalar(1 + dt * 6);
      if (f.life <= 0) { scene.remove(f.sprite); f.sprite.material.dispose(); flashes.splice(i, 1); }
    }
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i];
      p.life -= dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      p.sprite.scale.multiplyScalar(1 + dt * 0.9);
      p.sprite.material.opacity = Math.max(0, Math.min(0.32, p.life * 0.3));
      if (p.life <= 0) { scene.remove(p.sprite); p.sprite.material.dispose(); puffs.splice(i, 1); }
    }
    for (let i = clouds.length - 1; i >= 0; i--) {
      const c = clouds[i];
      c.life -= dt;
      const fade = c.life < 2 ? Math.max(0, c.life / 2) : 1;
      for (const p of c.parts) {
        p.material.opacity = 0.55 * fade;
        p.position.y += dt * 0.08;
        p.scale.multiplyScalar(1 + dt * 0.02);
      }
      if (c.life <= 0) {
        for (const p of c.parts) { scene.remove(p); p.material.dispose(); }
        clouds.splice(i, 1);
      }
    }
  }
  return {
    tracer, muzzle, impact, blood, bloodDecal, addHole, clearDecals,
    addSmokeCloud, blocksLOS, step,
    // Verification hook: live counts of the transient effect pools.
    get counts() {
      return { holes: holes.length, decals: decals.length, clouds: clouds.length, puffs: puffs.length, flashes: flashes.length };
    },
  };
}

export function createWeapon(scene, camera, sfx) {
  const effects = createEffects(scene);
  // View-model render pass: the gun lives in its OWN scene with its own
  // camera that mirrors the main camera every frame. main.js renders the
  // world first, then clears the depth buffer and renders this scene —
  // so the viewmodel can NEVER be occluded by walls, barriers or bots.
  // That was the real-phone bug: the player hugs cover (collision radius
  // 0.38 m), the gun sits 0.73–1.58 m out, so it sank inside the wall.
  // Depth testing still works WITHIN the viewmodel, so gun parts occlude
  // each other correctly.
  const vmScene = new THREE.Scene();
  const vmCamera = new THREE.PerspectiveCamera(74, camera.aspect, 0.05, 10);
  vmScene.add(vmCamera);
  // Base fill for the viewmodel scene (the world's sun/hemi do not light
  // this scene — lights are per-scene). The warm point light below is
  // the key light; this hemi keeps the shaded side readable.
  const vmHemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 1.9);
  vmScene.add(vmHemi);
  function syncVmCamera(mainCam) {
    vmCamera.position.copy(mainCam.position);
    vmCamera.quaternion.copy(mainCam.quaternion);
    vmCamera.fov = mainCam.fov;
    vmCamera.aspect = mainCam.aspect;
    vmCamera.updateProjectionMatrix();
    vmCamera.updateMatrixWorld(true);
  }
  // View-model: the gun + two low-poly hands (user call, 2026-11-16)
  // — parented to the viewmodel camera (not the main camera —
  // see the render-pass note above). It rides the bob/sway/ADS/sprint
  // motion in step() because all of that moves this one group.
  const vm = new THREE.Group();
  // Low metalness on purpose: the viewmodel scene has no environment
  // map, and high-metal PBR with no envmap renders nearly black (the
  // old 0.65/0.9 metalness is why the gun read as a black slab). Painted-
  // metal look: mostly diffuse, lit by the hemi + viewmodel light.
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x626d77, roughness: 0.42, metalness: 0.35 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.8, metalness: 0.1 });
  const tanMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 0.7, metalness: 0.2 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0xb9bec4, roughness: 0.32, metalness: 0.4 });

  // --- Detailed viewmodels + two low-poly hands ----------------------------
  // The guns are assembled from
  // round stock first (per the threejs-materials skill: MeshStandardMaterial
  // parts lit by the vm key + fill lights): cylinders for barrels,
  // suppressors, scopes and handguards, capsules for grips and stocks,
  // tori for trigger guards, an extruded taper for the knife blade. Boxes
  // survive only where a real gun is slab-sided (the receiver core), and
  // even there they are layered with a railed top, ejection port, charging
  // handle and controls so the silhouette breaks up.
  const gunGroup = new THREE.Group();
  vm.add(gunGroup);
  // Gun-local space: origin at the receiver centre, bore line at y = 0,
  // muzzle toward -Z, stock toward +Z. gunGroup is offset inside the
  // viewmodel group; muzzleLocal is kept in viewmodel space for fire().
  const VM_GUN_POS = new THREE.Vector3(0, -0.03, -0.38);
  gunGroup.position.copy(VM_GUN_POS);
  let muzzleLocal = new THREE.Vector3(0, -0.03, -0.85);
  // Gun-space muzzle (bore height + tip), kept for the barrel probe and
  // the muzzle-flash anchor; vm-space muzzleLocal is re-derived from it
  // every frame in step() so it follows the aim pose below.
  let muzzleGunLocal = new THREE.Vector3(0, 0.008, -0.47);
  // Base gun pose (the knife's ready cant) + per-weapon barrel-aim pose;
  // step() composes them every frame so the aim pose fades out on ADS.
  let gunBaseRot = { x: 0, y: 0, z: 0 };
  let gunAimRot = { rx: 0, ry: 0 };
  let gunAimDy = 0;
  let lastVmInfo = null;
  // Viewmodels are 100% procedural (built synchronously below), so the
  // model gate main.js waits on for shot captures is settled from the
  // start — no async kit can leave the gun handless or invisible.
  const glbReady = true;

  const darkMat = new THREE.MeshStandardMaterial({ color: 0x33383f, roughness: 0.6, metalness: 0.3 });
  const polymerMat = new THREE.MeshStandardMaterial({ color: 0x3d434a, roughness: 0.82, metalness: 0.08 });
  const greenMat = new THREE.MeshStandardMaterial({ color: 0x46543f, roughness: 0.72, metalness: 0.1 });
  const lensMat = new THREE.MeshStandardMaterial({ color: 0x2a4a66, roughness: 0.12, metalness: 0.2, emissive: 0x0d2438, emissiveIntensity: 0.9 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0x9a7a34, roughness: 0.35, metalness: 0.5 });

  function part(geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    gunGroup.add(m);
    return m;
  }
  const B = (w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0) => part(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
  // Cylinder along Z (barrels, suppressors, scopes, handguards).
  const CZ = (r, len, mat, x, y, z, seg = 20, rEnd) => part(new THREE.CylinderGeometry(rEnd === undefined ? r : rEnd, r, len, seg), mat, x, y, z, Math.PI / 2);
  // Cylinder along X (charging handles, bolt handles, knife guards).
  const CX = (r, len, mat, x, y, z, seg = 14) => part(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z, 0, 0, Math.PI / 2);
  // Cylinder along Y (sight posts, scope turrets).
  const CY = (r, len, mat, x, y, z, seg = 14) => part(new THREE.CylinderGeometry(r, r, len, seg), mat, x, y, z);
  const CAP = (r, len, mat, x, y, z, rx = 0, ry = 0, rz = 0) => part(new THREE.CapsuleGeometry(r, len, 4, 12), mat, x, y, z, rx, ry, rz);
  const BALL = (r, mat, x, y, z) => part(new THREE.SphereGeometry(r, 14, 10), mat, x, y, z);
  // Ring lying in the XY plane (trigger guards run in the YZ plane: ry 90°).
  const RING = (r, tube, mat, x, y, z, ry = 0) => part(new THREE.TorusGeometry(r, tube, 10, 24), mat, x, y, z, 0, ry, 0);

  // Shared rifle furniture -------------------------------------------------
  function addRail(zFrom, zTo, y) {
    B(0.032, 0.01, zTo - zFrom, darkMat, 0, y, (zFrom + zTo) / 2);
    for (let z = zFrom + 0.02; z < zTo; z += 0.042) B(0.038, 0.012, 0.018, darkMat, 0, y + 0.008, z);
  }
  function addGrip(z, mat) {
    CAP(0.02, 0.04, mat, 0, -0.10, z, 0.48);
  }
  function addTriggerGuard(z) { RING(0.027, 0.0055, darkMat, 0, -0.068, z, Math.PI / 2); }
  function addStock(mat, cheek = false) {
    CZ(0.018, 0.09, mat, 0, -0.012, 0.20); // neck
    B(0.034, 0.092, 0.085, mat, 0, -0.042, 0.258, -0.1); // butt
    B(0.036, 0.096, 0.013, darkMat, 0, -0.046, 0.303, -0.1); // buttpad
    if (cheek) B(0.032, 0.018, 0.075, darkMat, 0, 0.008, 0.255);
  }
  function addMagStraight(len, mat) {
    B(0.04, len, 0.058, mat, 0, -0.075 - len / 2, -0.045, 0.1);
    B(0.047, 0.015, 0.066, darkMat, 0, -0.082 - len, -0.045 + len * 0.05, 0.1);
  }
  function addMagCurved(mat) {
    // Three progressively rotated segments read as the AK banana curve.
    for (let i = 0; i < 3; i++) {
      B(0.04, 0.075, 0.055, mat, 0, -0.115 - i * 0.058, -0.048 - i * 0.026, 0.22 + i * 0.2);
    }
    B(0.046, 0.014, 0.062, darkMat, 0, -0.30, -0.135, 0.75);
  }
  function addReceiver(accent) {
    B(0.07, 0.055, 0.31, bodyMat, 0, -0.026, 0.01); // lower receiver
    B(0.06, 0.048, 0.35, bodyMat, 0, 0.024, -0.01); // upper receiver
    B(0.004, 0.02, 0.075, darkMat, 0.033, 0.02, -0.04); // ejection port (right side)
    B(0.012, 0.012, 0.03, brassMat, 0.033, 0.02, -0.075); // port detail
    CX(0.008, 0.075, darkMat, 0, 0.028, 0.185); // charging handle
    CX(0.007, 0.02, darkMat, 0.04, -0.03, 0.03); // mag release
    CY(0.009, 0.014, darkMat, -0.038, -0.02, 0.05); // selector stub
    if (accent) B(0.072, 0.02, 0.1, accent, 0, -0.058, 0.06); // accent grip frame band
  }
  function addRedDot(z) {
    CY(0.008, 0.03, darkMat, 0, 0.075, z);
    CZ(0.021, 0.055, darkMat, 0, 0.098, z);
    CZ(0.017, 0.004, lensMat, 0, 0.098, z - 0.028);
    CZ(0.019, 0.01, bodyMat, 0, 0.098, z + 0.028);
  }
  function addIronSights(zFront) {
    CY(0.004, 0.032, darkMat, 0, 0.075, zFront);
    B(0.03, 0.008, 0.006, darkMat, 0, 0.062, zFront);
    B(0.006, 0.026, 0.006, darkMat, -0.013, 0.07, 0.13);
    B(0.006, 0.026, 0.006, darkMat, 0.013, 0.07, 0.13);
  }

  // Rifles / carbine / SMG. opts: handguard length+mat, exposed barrel
  // length, muzzle style, optic, magazine style, foregrip, wire stock.
  function buildRifle(o) {
    addReceiver(o.accent);
    addRail(-0.19, 0.14, 0.052);
    addGrip(0.055, polymerMat);
    addTriggerGuard(-0.01);
    if (o.mag === 'curved') addMagCurved(darkMat); else addMagStraight(o.magLen || 0.13, darkMat);
    if (o.wireStock) {
      CZ(0.006, 0.17, steelMat, -0.018, -0.005, 0.25, 10);
      CZ(0.006, 0.17, steelMat, 0.018, -0.005, 0.25, 10);
      B(0.045, 0.07, 0.012, polymerMat, 0, -0.01, 0.34);
    } else addStock(o.stockMat || polymerMat);
    // Handguard: a fat cylinder around the barrel, collars at both ends.
    const hgZ = -0.185 - o.hg / 2;
    CZ(0.034, o.hg, o.hgMat, 0, 0.008, hgZ, 18);
    CZ(0.037, 0.02, darkMat, 0, 0.008, -0.19, 18);
    CZ(0.036, 0.016, darkMat, 0, 0.008, hgZ - o.hg / 2 + 0.01, 18);
    for (let i = 0; i < 3; i++) CZ(0.0355, 0.008, darkMat, 0, 0.008, hgZ - 0.03 - i * (o.hg - 0.06) / 2, 18);
    if (o.foregrip) CAP(0.017, 0.045, polymerMat, 0, -0.062, hgZ - o.hg * 0.3, 0.35);
    // Exposed barrel + muzzle device.
    const bStart = hgZ - o.hg / 2;
    CZ(0.0135, o.barrel, steelMat, 0, 0.008, bStart - o.barrel / 2);
    let tip = bStart - o.barrel;
    if (o.suppressor) {
      CZ(0.026, 0.2, darkMat, 0, 0.008, tip - 0.09, 22);
      CZ(0.0275, 0.016, bodyMat, 0, 0.008, tip - 0.185, 22);
      CZ(0.02, 0.006, darkMat, 0, 0.008, tip - 0.196, 22);
      tip -= 0.2;
    } else {
      CZ(0.019, 0.065, darkMat, 0, 0.008, tip - 0.03, 16); // muzzle brake
      CZ(0.021, 0.012, darkMat, 0, 0.008, tip - 0.055, 16);
      tip -= 0.065;
    }
    if (o.optic === 'dot') addRedDot(-0.06); else addIronSights(bStart + 0.03);
    return tip;
  }

  function buildPistol() {
    B(0.048, 0.042, 0.23, bodyMat, 0, -0.012, -0.045); // frame
    B(0.052, 0.038, 0.27, steelMat, 0, 0.026, -0.055); // slide
    CZ(0.0255, 0.27, steelMat, 0, 0.045, -0.055, 18); // rounded slide top
    CZ(0.011, 0.025, darkMat, 0, 0.028, -0.195, 14); // muzzle
    B(0.008, 0.02, 0.008, darkMat, 0, 0.082, -0.175); // front sight
    B(0.03, 0.016, 0.008, darkMat, 0, 0.078, 0.075); // rear sight block
    B(0.014, 0.02, 0.02, darkMat, 0, 0.03, 0.095); // hammer
    CAP(0.0235, 0.062, polymerMat, 0, -0.098, 0.038, 0.3); // grip
    B(0.046, 0.014, 0.055, darkMat, 0, -0.148, 0.055, 0.3); // mag baseplate
    RING(0.024, 0.005, darkMat, 0, -0.055, -0.055, Math.PI / 2); // trigger guard
    CX(0.006, 0.056, darkMat, 0, 0.0, 0.088); // takedown pin line
    return -0.21;
  }

  function buildShotgun() {
    B(0.068, 0.06, 0.3, bodyMat, 0, -0.01, 0.02);
    addGrip(0.06, woodMat);
    addTriggerGuard(0.0);
    addStock(woodMat);
    CZ(0.023, 0.6, steelMat, 0, 0.032, -0.42, 22); // barrel
    CZ(0.015, 0.48, darkMat, 0, -0.02, -0.36, 16); // magazine tube
    CZ(0.031, 0.13, woodMat, 0, -0.02, -0.35, 18); // pump grip
    for (let i = 0; i < 3; i++) CZ(0.0325, 0.01, darkMat, 0, -0.02, -0.395 + i * 0.045, 18);
    CZ(0.024, 0.03, darkMat, 0, 0.032, -0.715, 22); // muzzle collar
    BALL(0.006, steelMat, 0, 0.06, -0.7); // bead sight
    B(0.05, 0.02, 0.09, woodMat, 0, -0.045, -0.1); // fore-end wood under receiver
    return -0.73;
  }

  function buildSniper(accentMat) {
    addReceiver(null);
    addGrip(0.055, polymerMat);
    addTriggerGuard(-0.01);
    addMagStraight(0.09, darkMat);
    addStock(accentMat, true);
    CZ(0.03, 0.22, accentMat, 0, 0.008, -0.28, 16); // barrel shroud / fore-end
    CZ(0.013, 0.42, steelMat, 0, 0.008, -0.6, 16); // long barrel
    CZ(0.02, 0.07, darkMat, 0, 0.008, -0.845, 16); // muzzle brake
    CZ(0.022, 0.012, darkMat, 0, 0.008, -0.87, 16);
    // Scope: mounts, main tube, objective bell + glass, eyepiece, turret.
    CY(0.007, 0.035, darkMat, -0.0, 0.07, -0.1);
    CY(0.007, 0.035, darkMat, 0, 0.07, 0.06);
    CZ(0.024, 0.23, darkMat, 0, 0.095, -0.02, 20);
    CZ(0.033, 0.055, darkMat, 0, 0.095, -0.155, 20, 0.026);
    CZ(0.029, 0.005, lensMat, 0, 0.095, -0.184, 20);
    CZ(0.019, 0.045, darkMat, 0, 0.095, 0.115, 16);
    CY(0.015, 0.028, darkMat, 0, 0.128, -0.02); // elevation turret
    CX(0.011, 0.02, darkMat, 0.032, 0.095, -0.02); // windage turret
    // Bolt handle with a round knob, right side.
    CX(0.006, 0.05, steelMat, 0.045, 0.005, 0.09);
    BALL(0.013, darkMat, 0.072, 0.005, 0.09);
    // Bipod: two splayed legs under the fore-end.
    part(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 8), darkMat, -0.045, -0.085, -0.36, 0.25, 0, 0.5);
    part(new THREE.CylinderGeometry(0.005, 0.005, 0.17, 8), darkMat, 0.045, -0.085, -0.36, 0.25, 0, -0.5);
    return -0.885;
  }

  function buildKnife() {
    // Handle along Z at the rear, guard across X, blade extruded from a
    // tapered 2D profile so it ends in a real point, not a box tip.
    CAP(0.02, 0.085, polymerMat, 0, -0.02, 0.02, Math.PI / 2 - 0.25);
    for (let i = 0; i < 3; i++) RING(0.0215, 0.0035, darkMat, 0, -0.028 + i * 0.008, 0.045 - i * 0.02);
    CX(0.007, 0.085, steelMat, 0, 0.005, -0.075);
    CY(0.016, 0.012, darkMat, 0, -0.045, 0.075); // pommel
    const s = new THREE.Shape();
    s.moveTo(0, -0.026);
    s.lineTo(0.2, -0.02);
    s.quadraticCurveTo(0.27, -0.014, 0.315, 0.012); // swept point
    s.lineTo(0.05, 0.02);
    s.lineTo(0, 0.02);
    s.closePath();
    const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.005, bevelEnabled: true, bevelThickness: 0.0015, bevelSize: 0.0015, bevelSegments: 1 }), steelMat);
    blade.rotation.y = Math.PI / 2; // shape +X (blade length) -> -Z
    blade.position.set(0.004, 0.005, -0.08);
    gunGroup.add(blade);
    return -0.40;
  }

  // --- Two low-poly hands: camo sleeves + fingerless gloves ----------------
  // The user's reference POV (2026-11-16): TWO arms out of the bottom
  // corners of the frame — olive CAMO sleeves, a bare skin band at each
  // wrist, green FINGERLESS gloves (skin fingertips), the right hand on
  // the pistol grip with its index finger reaching the trigger, the
  // left hand supporting the front of the gun. Everything is faceted
  // low-poly (boxes, 7-sided cylinders, flatShading) — no smooth
  // capsules anywhere, so nothing reads as a green tube. The camo is a
  // tiny canvas texture (olive base, darker/lighter blotches) generated
  // once with a fixed seed: same pattern every load, nothing to fetch.
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x4d7d55, roughness: 0.85, metalness: 0, flatShading: true });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xdca57f, roughness: 0.65, metalness: 0, flatShading: true });
  const cuffMat = new THREE.MeshStandardMaterial({ color: 0x2e4a2f, roughness: 0.92, metalness: 0, flatShading: true });
  const camoMat = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#5a6b3f';
    g.fillRect(0, 0, 256, 256);
    const cols = ['#44532e', '#6d7c46', '#37491f', '#7d8a52', '#2f3d1e'];
    let s = 123456789;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < 140; i++) {
      g.fillStyle = cols[(rnd() * cols.length) | 0];
      const x = rnd() * 256, y = rnd() * 256, r = 7 + rnd() * 30;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.35 + rnd() * 0.5), rnd() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, metalness: 0, flatShading: true });
  })();
  // Each weapon now carries TWO poses: right (trigger hand on the
  // pistol grip) and left (support hand), left = null for the one-handed
  // knife. pos = grip point in gun space; rot = fist Euler; arm =
  // forearm direction in gun space, from the wrist outward.
  // FIST ORIENTATION (the 2026-11-16 playtest bug): the fist model wraps
  // its fingers around its local X axis (knuckle row along X, fingers
  // curling in the YZ plane). A pose only reads as a grip when that X
  // axis is aligned with the gripped part's long axis — pistol grip
  // (near-vertical, in the YZ plane) needs rot.z ~ -90 deg, forends /
  // pump / knife handle (along Z) need rot.y ~ 90 deg. Poses that left
  // the wrap axis perpendicular to the grip made the fingers stand up
  // beside the gun in a raised-fist salute and the weapon floated.
  // The support-hand positions are the ones verified against in-game
  // captures for the old single hand; the trigger hand reuses the
  // verified P9 grip pose on every gun's grip (all grips sit at the
  // same receiver station, z ~ 0.05).
  // Arm directions (2026-11-16, third fix — the user's 14:49 VK-7
  // playtest screenshot still showed both sleeves as long straight
  // camo columns from the bottom corners, left armLenPx 373 at
  // 1440x900 = 41% of screen height): each arm is now TWO segments
  // with a slight elbow bend (~11 deg). ARM_* is the forearm
  // direction (wrist -> elbow), ARM_*2 the upper-arm direction
  // (elbow -> off frame). Both run mostly TOWARD the viewer (+Z,
  // foreshortened) and down; the negative gun-space X compensates
  // the viewmodel's 0.3 rad hip yaw, which otherwise rotates +Z
  // into screen-right and threw the right arm out of the bottom-
  // right corner. Combined with the lowered viewmodel base in
  // step() (grips sit at ~74-89% of screen height instead of
  // ~62-70%), the sleeves exit the BOTTOM edge near the centre —
  // left ~40-47% of width, right ~55-65% — with a visible length
  // of roughly a fifth of the screen height, matching the user's
  // reference POV (short forearms out of the bottom-centre, hands
  // low). The grip points themselves are unchanged.
  const ARM_R = [-0.21, -0.52, 0.83];
  const ARM_L = [-0.55, -0.50, 0.68];
  const ARM_R2 = [-0.28, -0.34, 0.87];
  const ARM_L2 = [-0.63, -0.32, 0.72];
  const GRIP_ROT = [0.3, 0, -1.57];
  const HAND_POSES = {
    p9: {
      right: { pos: [0.002, -0.098, 0.050], rot: GRIP_ROT, arm: ARM_R, trigger: true },
      // Two-handed pistol grip: left fist cups the grip from the
      // left/FRONT — offset forward (−z), lower and angled across
      // the right fist, so the pair reads as two stacked hands, not
      // one merged blob (the 14:0x capture at the old near-identical
      // pose fused them into a single green lump under the slide).
      left: { pos: [-0.040, -0.110, 0.032], rot: [0.55, 0.3, -1.3], arm: ARM_L, scale: 1.3 },
    },
    knife: {
      right: { pos: [0, -0.022, 0.035], rot: [0, 1.35, 0], arm: ARM_R },
      left: null,
    },
    breacher: {
      right: { pos: [0, -0.098, 0.058], rot: GRIP_ROT, arm: ARM_R, trigger: true },
      left: { pos: [0, -0.055, -0.35], rot: [0, 1.57, 0], arm: ARM_L },
    },
    vk7: {
      right: { pos: [0, -0.098, 0.052], rot: GRIP_ROT, arm: ARM_R, trigger: true },
      left: { pos: [0.004, -0.074, -0.373], rot: [0.3, 1.57, 0], arm: ARM_L },
    },
    ratter: {
      right: { pos: [0, -0.098, 0.052], rot: GRIP_ROT, arm: ARM_R, trigger: true },
      left: { pos: [0.004, -0.074, -0.301], rot: [0.3, 1.57, 0], arm: ARM_L },
    },
    ak47: {
      right: { pos: [0, -0.098, 0.052], rot: GRIP_ROT, arm: ARM_R, trigger: true },
      left: { pos: [0, -0.048, -0.30], rot: [0.1, 1.57, 0], arm: ARM_L },
    },
    m4a1s: {
      right: { pos: [0, -0.098, 0.052], rot: GRIP_ROT, arm: ARM_R, trigger: true },
      left: { pos: [0, -0.048, -0.34], rot: [0.1, 1.57, 0], arm: ARM_L },
    },
    longbow: {
      right: { pos: [0, -0.098, 0.052], rot: GRIP_ROT, arm: ARM_R, trigger: true },
      left: { pos: [0, -0.042, -0.29], rot: [0.1, 1.57, 0], arm: ARM_L },
    },
    awp: {
      right: { pos: [0, -0.098, 0.052], rot: GRIP_ROT, arm: ARM_R, trigger: true },
      left: { pos: [0, -0.042, -0.29], rot: [0.1, 1.57, 0], arm: ARM_L },
    },
  };
  // Per-weapon barrel-aim pose (Duck.ai convergence, 2026-11-16 —
  // replaces the 2026-11-16 counter-yaw solve). The old solve put the
  // projected bore line THROUGH the crosshair (lineDist ~0 px): that
  // target was wrong. The camera ray and the bore are skew lines
  // (parallax) — they can only meet at ONE distance, so forcing the
  // line through the crosshair flattened the gun straight-on (total
  // yaw ~-0.03): the barrel read as a vertical stub, the muzzle/front
  // sight sat on the crosshair's own line, and the reticle lost
  // contrast. The new pose converges on a DISTANCE, not a pixel: the
  // gun keeps a real side-profile yaw, and the bore is aimed so its
  // projected vanishing point lands just left of the crosshair, at
  // crosshair height — the barrel reads as pointing at the target at
  // engagement range while the reticle stays in clear sky.
  // Geometry note (verified, not assumed): a LITERAL 15 m 3D
  // convergence — bore through the point (0,0,-15) on the view ray —
  // forces total yaw ≈ +0.01 rad and total pitch ≈ +0.03 rad, i.e.
  // straight-on again; that is exactly the pose that was just removed.
  // It was built and captured first (candidate 1: ry +0.012, the
  // pivot lookAt mapping, atan(0.18/15)): side profile restored and
  // crosshair clear, but the barrel pointed ~50 deg / ~190 px away
  // from the crosshair — it read as aiming up-left of the target, so
  // it failed the visual check. Any visible side profile (total yaw
  // >= 0.1 rad) puts the bore ~2 m off the view ray at 15 m; the
  // parallax price is unavoidable and irrelevant, because shots still
  // leave exactly along the crosshair ray (camera forward), as always.
  // So the implemented convergence is the PROJECTED one: total yaw
  // 0.15 rad (half the 0.3 hip yaw — clearly diagonal, not straight-
  // on) and total pitch ~-0.03 (bore VP level with the crosshair).
  // Offline replica (barrel-align/converge-scan.mjs) + live probe agree
  // to <1 px: bore screen angle ~55 deg (was 73), projected bore line
  // ~100 px from the crosshair, muzzle (746, 652) at 1440x900 — lower
  // third, clear of the reticle. Hands and arms are children of
  // gunGroup, so they ride along and the fists stay on their grips by
  // construction (gripInsideFist is still verified by vmMeasure after
  // every change). Applied in step() scaled by (1 - adsBlend): ADS
  // already puts the sights on the crosshair, so the aim pose fades
  // out as ADS blends in. The drop (dy) fades with it so ADS lifts
  // the gun back to the old sight line. rx > 0 pitches the muzzle up
  // (lifts the bore vanishing point to crosshair height), ry is the
  // convergence yaw above, dy lowers the whole gun in hip fire (fades
  // out on ADS like the rest). Rotation order stays the default 'XYZ':
  // at these angles the XYZ-vs-'YXZ' difference is ~rx*ry ≈ 0.005
  // rad, below what the eye can judge, and the offline solver uses
  // the same order. User's final viewmodel fix (2026-11-16): the
  // straight-on barrel made the crosshair read badly, so the hip gun
  // drops to Y -0.12 total (VM_GUN_POS.y -0.03 + dy -0.09) — barrel
  // clearly below the crosshair, gap visible, crosshair uncovered.
  // VM_GUN_POS.y itself stays -0.03: it is also the ADS base, and
  // changing it would drop the ADS sights ~97 px off the crosshair;
  // the drop lives in the hip-only dy, which fades out on ADS like
  // the rest of GUN_AIM.
  // Design range (m) the projected convergence is judged at: the
  // engagement distance the barrel is read against. The bore sits
  // ~2 m left of the aim point at this range (parallax, see note
  // above) — the crosshair ray, not the bore, is the trajectory.
  const CONVERGE_DIST = 15;
  // Convergence yaw (rad) on the gun: hip yaw 0.3 - 0.15 = total yaw
  // 0.15 rad, which puts the bore vanishing point ~90 px left of the
  // crosshair at 1440x900. Deliberately NOT the literal pivot value
  // atan(0.18/15) ≈ 0.012 — see the candidate-1 note above.
  const CONVERGE_YAW = -0.15;
  // Convergence pitch (rad) on the gun: vm pitch -0.06 + 0.03 ≈ -0.03
  // total, which puts the bore vanishing point at crosshair height.
  const CONVERGE_RX = 0.03;
  const GUN_AIM = {
    p9: { rx: 0.20, ry: CONVERGE_YAW, dy: -0.06 },
    vk7: { rx: CONVERGE_RX, ry: CONVERGE_YAW, dy: -0.09 },
    ratter: { rx: CONVERGE_RX, ry: CONVERGE_YAW, dy: -0.09 },
    breacher: { rx: CONVERGE_RX, ry: CONVERGE_YAW, dy: -0.09 },
    longbow: { rx: CONVERGE_RX, ry: CONVERGE_YAW, dy: -0.09 },
    ak47: { rx: CONVERGE_RX, ry: CONVERGE_YAW, dy: -0.09 },
    awp: { rx: CONVERGE_RX, ry: CONVERGE_YAW, dy: -0.09 },
    m4a1s: { rx: CONVERGE_RX, ry: CONVERGE_YAW, dy: -0.09 },
    knife: { rx: 0, ry: 0, dy: 0 },
  };
  // Probe anchors for the current viewmodel's hands (rebuilt by
  // buildViewModel): handMeasure() below turns these into the screen-
  // space proof that the fists sit on their grips and the arms stay
  // proportionate — the user has rejected "looks fine" claims three
  // times, so the numbers ship with the build.
  let handAnchors = [];
  // buildArm — adapted from the user's snippet (2026-11-16): a root
  // group at the grip point, a rotated/scaled hand group inside it
  // (addPart builds the palm + fingers there), and the arm as separate
  // cylinder segments placed along armDir with a quaternion
  // (addSeg: setFromUnitVectors(Y, dir)) on the ROOT, so the fist's
  // grip rotation never tips the arm. Adaptations, per the user's
  // rules: the snippet's dark glove palette is NOT used — the glove
  // stays green, fingertips stay bare skin, the sleeve keeps the camo
  // canvas texture; the snippet's inconsistent scales are normalised
  // to this viewmodel (hand scale 1.3, its palm capsule verbatim; arm
  // segments in unscaled gun space); and the poses come from
  // HAND_POSES per weapon instead of the snippet's two hardcoded
  // calls. The finger curl keeps the proven three-segment arc around
  // the wrap axis (the snippet's stub fingers did not wrap a grip).
  function buildArm(pose, side) {
    const root = new THREE.Group();
    const hand = new THREE.Group();
    hand.rotation.set(pose.rot[0], pose.rot[1], pose.rot[2]);
    hand.scale.setScalar(pose.scale || 1.3);
    root.add(hand);
    const wrapPts = []; // finger segment meshes, for handMeasure()
    const addPart = (geo, mat, px, py, pz, rx = 0, ry = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.rotation.set(rx, ry, rz);
      hand.add(m);
      return m;
    };
    // Palm (snippet): a capsule along the wrap axis (local X) — the
    // gripped part passes through it. Plus a knuckle pad across the
    // finger bases on the curl side.
    addPart(new THREE.CapsuleGeometry(0.025, 0.028, 4, 8), gloveMat, 0, 0, 0, 0, 0, Math.PI / 2);
    addPart(new THREE.BoxGeometry(0.062, 0.018, 0.024), gloveMat, 0, 0.023, -0.013, -0.5, 0, 0);
    // Fingers: three segments per finger along an arc of radius R
    // around the wrap axis, so the curl is real geometry. Segments
    // 1–2 wear the green glove; segment 3 is bare skin — the
    // fingerless read from the reference.
    const R = 0.0315;
    const arcSeg = (fx, th0, th1, w, t, mat, rs) => {
      const thc = (th0 + th1) / 2, r = R * rs;
      const m = addPart(new THREE.BoxGeometry(w, r * (th1 - th0), t), mat, fx, r * Math.cos(thc), -r * Math.sin(thc), -(thc + Math.PI / 2), 0, 0);
      wrapPts.push(m);
      return m;
    };
    const fingerLen = [1.0, 1.05, 0.98, 0.84]; // index..pinky
    for (let i = 0; i < 4; i++) {
      const fx = -0.027 + i * 0.018;
      const rs = fingerLen[i];
      if (pose.trigger && i === 0) {
        // Trigger finger: leaves the grip and reaches forward (local
        // -Z is gun-forward in the grip pose) into the trigger guard,
        // curling down at the skin tip.
        wrapPts.push(addPart(new THREE.BoxGeometry(0.0155, 0.032, 0.0145), gloveMat, fx, 0.012, -0.036, -Math.PI / 2, 0, 0));
        wrapPts.push(addPart(new THREE.BoxGeometry(0.015, 0.026, 0.014), gloveMat, fx, 0.004, -0.060, -Math.PI / 2 - 0.85, 0, 0));
        wrapPts.push(addPart(new THREE.BoxGeometry(0.014, 0.020, 0.013), skinMat, fx, -0.006, -0.070, -Math.PI / 2 - 1.7, 0, 0));
        continue;
      }
      arcSeg(fx, 0.09, 1.08, 0.0155, 0.0145, gloveMat, rs);
      arcSeg(fx, 1.08, 2.06, 0.015, 0.014, gloveMat, rs);
      arcSeg(fx, 2.06, 2.93, 0.014, 0.013, skinMat, rs);
    }
    // Thumb across the back of the grip (local +Z face), skin tip.
    addPart(new THREE.BoxGeometry(0.016, 0.032, 0.015), gloveMat, -0.016, -0.006, 0.030, 0.55, 0, 0.5);
    addPart(new THREE.BoxGeometry(0.0145, 0.024, 0.0135), skinMat, -0.026, 0.010, 0.036, 0.95, 0, 0.75);
    // Arm segments: TWO runs with a slight elbow bend between them
    // (third fix — a single straight run read as a camo pipe no
    // matter how it was angled). Each cylinder is centred on its
    // run's direction and oriented by a quaternion from +Y to that
    // direction. CylinderGeometry(radiusTop, radiusBottom): top is
    // the far (+Y -> dir) end. Forearm run (along armDir), wrist
    // out: bare SKIN band (the reference shows skin between glove
    // and sleeve), green glove band, dark cuff ring, then the CAMO
    // forearm tapering up to the elbow at 0.25. A camo elbow ball
    // caps the joint; the upper-arm run (along armDir2, ~11 deg off
    // the forearm) is one slimmer camo segment that leaves the
    // frame through the bottom edge. Radii are ~20% slimmer than
    // the old single-tube stack (sleeve 0.030-0.038, was
    // 0.043-0.046): the near-camera end of a toward-viewer arm is
    // perspective-magnified, and the fat end cap was half of what
    // made the old arms read as columns. Radial segments 8 and
    // flatShading keep the faceted low-poly read.
    const armDir = new THREE.Vector3(pose.arm[0], pose.arm[1], pose.arm[2]).normalize();
    const armDir2 = new THREE.Vector3(...(pose.arm2 || (side === 'left' ? ARM_L2 : ARM_R2))).normalize();
    const YUP = new THREE.Vector3(0, 1, 0);
    const addSeg = (geo, mat, centre, dir) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(centre);
      m.quaternion.setFromUnitVectors(YUP, dir);
      root.add(m);
      return m;
    };
    const along = (dir, dist) => dir.clone().multiplyScalar(dist);
    addSeg(new THREE.CylinderGeometry(0.027, 0.029, 0.038, 8), skinMat, along(armDir, 0.032), armDir);
    addSeg(new THREE.CylinderGeometry(0.0305, 0.029, 0.036, 8), gloveMat, along(armDir, 0.066), armDir);
    addSeg(new THREE.CylinderGeometry(0.0335, 0.0315, 0.028, 8), cuffMat, along(armDir, 0.096), armDir);
    const fore = addSeg(new THREE.CylinderGeometry(0.0355, 0.030, 0.15, 8), camoMat, along(armDir, 0.175), armDir);
    const elbowPt = along(armDir, 0.25);
    const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.036, 8, 6), camoMat);
    elbowBall.position.copy(elbowPt);
    root.add(elbowBall);
    addSeg(new THREE.CylinderGeometry(0.033, 0.0375, 0.34, 8), camoMat, elbowPt.clone().addScaledVector(armDir2, 0.17), armDir2);
    root.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    gunGroup.add(root);
    handAnchors.push({
      side, hand: root, fist: hand, fore, wrapPts, armDir, armDir2,
      axisPoint: new THREE.Vector3(pose.pos[0], pose.pos[1], pose.pos[2]),
      elbowPoint: new THREE.Vector3(pose.pos[0], pose.pos[1], pose.pos[2]).addScaledVector(armDir, 0.25),
      endPoint: new THREE.Vector3(pose.pos[0], pose.pos[1], pose.pos[2]).addScaledVector(armDir, 0.25).addScaledVector(armDir2, 0.34),
      axisDir: new THREE.Vector3(1, 0, 0).applyEuler(hand.rotation).normalize(),
    });
    return root;
  }

  // Probe-only measurement (window.__game.debug.vmMeasure): projects
  // the live viewmodel through the viewmodel camera and reports, per
  // hand, the fist's screen box, whether the grip point projects INSIDE
  // that box (the overlap proof), the forearm's screen width vs the
  // fist's (the not-a-tube proof), and — in gun space — how far the
  // finger segments sit from the grip axis and how wide an arc they
  // cover around it (the wrap proof). Never used by the game itself.
  function handMeasure() {
    gunGroup.updateWorldMatrix(true, true);
    vmCamera.updateMatrixWorld(true);
    const W = window.innerWidth, H = window.innerHeight;
    const proj = (v) => {
      const p = v.clone().project(vmCamera);
      return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
    };
    const boxPx = (obj) => {
      const b = new THREE.Box3().setFromObject(obj);
      let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (const cx of [b.min.x, b.max.x]) for (const cy of [b.min.y, b.max.y]) for (const cz of [b.min.z, b.max.z]) {
        const p = proj(new THREE.Vector3(cx, cy, cz));
        x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
      }
      return { x0: +x0.toFixed(0), y0: +y0.toFixed(0), x1: +x1.toFixed(0), y1: +y1.toFixed(0), w: +(x1 - x0).toFixed(0), h: +(y1 - y0).toFixed(0) };
    };
    return handAnchors.map((a) => {
      const gripPx = proj(gunGroup.localToWorld(a.axisPoint.clone()));
      const fistPx = boxPx(a.fist);
      const helper = Math.abs(a.axisDir.y) > 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
      const u = new THREE.Vector3().crossVectors(a.axisDir, helper).normalize();
      const v = new THREE.Vector3().crossVectors(a.axisDir, u);
      const dists = [], angles = [];
      for (const m of a.wrapPts) {
        const p = gunGroup.worldToLocal(m.getWorldPosition(new THREE.Vector3()));
        const rel = p.sub(a.axisPoint);
        const radial = rel.clone().addScaledVector(a.axisDir, -rel.dot(a.axisDir));
        dists.push(+radial.length().toFixed(3));
        angles.push(Math.atan2(radial.dot(v), radial.dot(u)));
      }
      angles.sort((x, y) => x - y);
      let maxGap = 0;
      for (let i = 0; i < angles.length; i++) {
        const nxt = angles[(i + 1) % angles.length] + (i === angles.length - 1 ? Math.PI * 2 : 0);
        maxGap = Math.max(maxGap, nxt - angles[i]);
      }
      // True forearm width: project the segment's diameter (through
      // its midpoint, along the camera-right axis) — an AABB width
      // would mix in the arm's diagonal run and overstate it.
      const foreMid = a.fore.getWorldPosition(new THREE.Vector3());
      const camRight = new THREE.Vector3(1, 0, 0).applyQuaternion(vmCamera.quaternion);
      const fp0 = proj(foreMid.clone().addScaledVector(camRight, -0.04));
      const fp1 = proj(foreMid.clone().addScaledVector(camRight, 0.04));
      const foreW = +Math.hypot(fp1[0] - fp0[0], fp1[1] - fp0[1]).toFixed(0);
      // Arm on screen: project the bent polyline grip -> elbow ->
      // sleeve end and measure the part INSIDE the frame — that is
      // the visible arm length the user judges (the straight-line
      // grip->end distance understates a bent arm, and the old
      // single-run 0.64 m chain projected 373-947 px here). exitXPx
      // is where the polyline crosses the bottom edge (null when
      // the sleeve end stays on screen).
      const elbowPx = proj(gunGroup.localToWorld(a.elbowPoint.clone()));
      const armEndPx = proj(gunGroup.localToWorld(a.endPoint.clone()));
      const clipSeg = (p, q) => {
        // Liang-Barsky clip of segment p->q against the frame rect.
        let t0 = 0, t1 = 1;
        const dx = q[0] - p[0], dy = q[1] - p[1];
        const edges = [[-dx, p[0]], [dx, W - p[0]], [-dy, p[1]], [dy, H - p[1]]];
        for (const [pe, qe] of edges) {
          if (Math.abs(pe) < 1e-9) { if (qe < 0) return 0; continue; }
          const r = qe / pe;
          if (pe < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
          if (t0 > t1) return 0;
        }
        return Math.hypot(dx, dy) * (t1 - t0);
      };
      const armLenPx = +(clipSeg(gripPx, elbowPx) + clipSeg(elbowPx, armEndPx)).toFixed(0);
      let exitXPx = null;
      for (const [p, q] of [[gripPx, elbowPx], [elbowPx, armEndPx]]) {
        if (p[1] < H && q[1] >= H) { exitXPx = +(p[0] + (q[0] - p[0]) * ((H - p[1]) / (q[1] - p[1]))).toFixed(0); break; }
      }
      return {
        side: a.side,
        gripPx: [+gripPx[0].toFixed(0), +gripPx[1].toFixed(0)],
        fistPx,
        gripInsideFist: gripPx[0] >= fistPx.x0 && gripPx[0] <= fistPx.x1 && gripPx[1] >= fistPx.y0 && gripPx[1] <= fistPx.y1,
        handPx: boxPx(a.hand),
        foreW,
        elbowPx: [+elbowPx[0].toFixed(0), +elbowPx[1].toFixed(0)],
        armEndPx: [+armEndPx[0].toFixed(0), +armEndPx[1].toFixed(0)],
        armLenPx,
        armPctH: +(armLenPx / H * 100).toFixed(1),
        exitXPx,
        fingerAxisDist: dists,
        fingerArcDeg: +((Math.PI * 2 - maxGap) * 180 / Math.PI).toFixed(0),
      };
    });
  }

  // Probe-only barrel measurement (window.__dustline.debug.barrelMeasure):
  // projects the bore line (muzzle + a second bore point) through the
  // viewmodel camera and reports the pixel distance from the screen-centre
  // crosshair to that line, plus where the muzzle itself projects. Since
  // the 2026-11-16 convergence change the line is NOT supposed to pass
  // through the crosshair (the bore is converged at 15 m, the gun keeps
  // its side profile, and the reticle must stay clear of the barrel) —
  // lineDistPx is now a clearance reading, not an error to zero. The
  // crosshair is the aim point for SHOTS (camera ray), not for the bore.
  function barrelMeasure() {
    gunGroup.updateWorldMatrix(true, true);
    vmCamera.updateMatrixWorld(true);
    const W = window.innerWidth, H = window.innerHeight;
    const cx = W / 2, cy = H / 2;
    const proj = (v) => {
      const p = gunGroup.localToWorld(v.clone()).project(vmCamera);
      return [((p.x + 1) / 2) * W, ((1 - p.y) / 2) * H];
    };
    const m0 = proj(muzzleGunLocal);
    const m1 = proj(muzzleGunLocal.clone().add(new THREE.Vector3(0, 0, 0.3)));
    const dx = m1[0] - m0[0], dy = m1[1] - m0[1];
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular distance from the crosshair to the bore line.
    const lineDist = Math.abs((cx - m0[0]) * dy - (cy - m0[1]) * dx) / len;
    // Closest point on the line to the crosshair (for the report).
    const t = ((cx - m0[0]) * dx + (cy - m0[1]) * dy) / (len * len);
    const closest = [m0[0] + dx * t, m0[1] + dy * t];
    return {
      weapon: state.current,
      muzzlePx: [+m0[0].toFixed(1), +m0[1].toFixed(1)],
      borePx: [+m1[0].toFixed(1), +m1[1].toFixed(1)],
      lineDistPx: +lineDist.toFixed(1),
      closestPx: [+closest[0].toFixed(1), +closest[1].toFixed(1)],
      muzzleDistPx: +Math.hypot(m0[0] - cx, m0[1] - cy).toFixed(1),
      lineAngleDeg: +(Math.atan2(dy, dx) * 180 / Math.PI).toFixed(1),
    };
  }

  // Builds the viewmodel for a weapon id from the detailed part builders
  // above, then poses the two low-poly hands on that weapon's grip points.
  function buildViewModel(id) {
    while (gunGroup.children.length) {
      const c = gunGroup.children.pop();
      c.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
    }
    const w = byId(id);
    let tipZ;
    if (w.kind === 'knife') tipZ = buildKnife();
    else if (w.kind === 'pistol') tipZ = buildPistol();
    else if (w.kind === 'shotgun') tipZ = buildShotgun();
    else if (w.kind === 'sniper') tipZ = buildSniper(id === 'awp' ? greenMat : tanMat);
    else if (id === 'ak47') tipZ = buildRifle({ hg: 0.2, hgMat: woodMat, barrel: 0.17, mag: 'curved', optic: 'iron', accent: woodMat });
    else if (id === 'm4a1s') tipZ = buildRifle({ hg: 0.26, hgMat: polymerMat, barrel: 0.04, suppressor: true, mag: 'straight', optic: 'dot' });
    else if (id === 'ratter') tipZ = buildRifle({ hg: 0.15, hgMat: polymerMat, barrel: 0.1, mag: 'straight', magLen: 0.17, optic: 'iron', wireStock: true, foregrip: true });
    else tipZ = buildRifle({ hg: 0.24, hgMat: polymerMat, barrel: 0.15, mag: 'straight', optic: 'dot', accent: tanMat, foregrip: true }); // vk7
    // Bore line in gun space: the muzzle plus a second bore point 0.3 m
    // behind it (any two bore points define the same axis line). boreY is
    // the barrel centre height: rifles/snipers 0.008, pistol slide 0.028,
    // shotgun barrel 0.032.
    const boreY = w.kind === 'pistol' ? 0.028 : w.kind === 'shotgun' ? 0.032 : 0.008;
    muzzleGunLocal.set(0, boreY, tipZ);
    muzzleLocal.copy(VM_GUN_POS).add(muzzleGunLocal);
    // The knife is short and its blade is a flat extrusion: held straight
    // it reads as an invisible edge-on sliver. Angle the whole knife in
    // the hand — blade tipped across the view, flat catching the light,
    // in a ready-to-slash pose (the swing animation in step() composes
    // on top of this via the vm group).
    if (w.kind === 'knife') gunBaseRot = { x: 0.38, y: 0.15, z: 0 };
    else gunBaseRot = { x: 0, y: 0, z: 0 };
    gunAimRot = GUN_AIM[id] || { rx: 0, ry: 0, dy: 0 };
    gunAimDy = gunAimRot.dy || 0;
    gunGroup.position.set(VM_GUN_POS.x, VM_GUN_POS.y + gunAimDy, VM_GUN_POS.z);
    gunGroup.rotation.set(gunBaseRot.x + gunAimRot.rx, gunBaseRot.y + gunAimRot.ry, gunBaseRot.z);
    const pose = HAND_POSES[id] || HAND_POSES.vk7;
    handAnchors = [];
    if (pose.right) buildArm(pose.right, 'right');
    if (pose.left) buildArm(pose.left, 'left');
    let parts = 0;
    gunGroup.traverse((o) => { if (o.isMesh) parts++; });
    lastVmInfo = {
      parts,
      hands: pose.left ? 'two-lowpoly' : 'one-lowpoly',
      pose: id,
      muzzle: muzzleLocal.toArray().map((v) => +v.toFixed(3)),
    };
  }
  buildViewModel('p9');

  // Dedicated viewmodel light, parented to the viewmodel camera: the gun
  // and hands face away from the sun, so without it they render nearly
  // black. Warm, short-range, so it never washes out the world or the HUD.
  const vmLight = new THREE.PointLight(0xffe2b8, 3.4, 2.6, 1.4);
  vmLight.position.set(0.12, 0.18, -0.1);
  vmCamera.add(vmLight);
  // Cool fill from the left (key + fill per the materials skill) so the
  // round parts — barrel, handguard, suppressor — shade with a visible
  // gradient instead of one flat tone across the whole gun.
  const vmFill = new THREE.PointLight(0xbcd4ff, 1.4, 2.6, 1.4);
  vmFill.position.set(-0.25, 0.05, -0.15);
  vmCamera.add(vmFill);
  // Sits low-right in the frame. The base Y is LOW on purpose (third
  // arm fix): the grips ride at ~74-89% of screen height so the
  // forearms only cross the last fifth of the frame before exiting
  // the bottom — at the old -0.11 the grips sat at ~62-70% and the
  // sleeves had 40%+ of the frame to cross as straight columns.
  // NOTE: the base X is recomputed every frame in step() from the real
  // horizontal FOV — see below. 0.28 is the landscape value only.
  vm.position.set(0.28, -0.36, -0.55);
  // Angled toward the centre so the player sees the gun's side profile
  // (slide, barrel, grip) instead of the flat back of the receiver.
  // step() keeps this yaw every frame (ADS straightens it).
  vm.rotation.y = 0.3;
  vmCamera.add(vm);

  const state = {
    current: 'p9',
    primary: 'vk7', // last selected primary (slot 1); pistol is slot 2, knife slot 3
    owned: { p9: true, knife: true },
    mag: {}, reserve: {},
    bloom: 0, lastShot: -999, swingStart: -999, reloadingUntil: -999, reloadWeapon: null,
    grenades: 0, hasKit: false, ads: false, adsBlend: 0,
    nades: { frag: 0, flash: 0, smoke: 0 },
    helmet: false,
  };
  for (const w of WEAPONS) { state.mag[w.id] = w.mag; state.reserve[w.id] = w.reserve; }
  // Viewmodels are procedural (built synchronously above): glbReady is already true.
  let viewKick = 0;
  // Smoothed first-person presentation layers (merged from the user's own
  // viewmodel fix, 2026-11-16). These are kept separate from the weapon's
  // base transform so movement, reload and mouse sway never accumulate
  // rotations or distort the arm rig — every frame step() re-derives the
  // base pose absolutely, then adds these layers on top.
  let swayX = 0, swayY = 0, idleClock = 0;
  let reloadStartedAt = -999;
  let switchBlend = 0;

  function def() { return byId(state.current); }
  function give(id) {
    state.owned[id] = true;
    const w = byId(id);
    state.mag[id] = w.mag; state.reserve[id] = w.reserve;
    if (w.kind !== 'pistol' && !w.melee) state.primary = id;
  }
  function select(id) {
    if (!state.owned[id] || state.current === id) return false;
    state.current = id;
    state.reloadingUntil = -999;
    // Switching cancels any in-flight reload outright (a stale
    // reloadWeapon would otherwise complete on the next step, because
    // reloadingUntil was just reset) and starts the settle-in blend so
    // the new viewmodel raises into place instead of popping in.
    state.reloadWeapon = null;
    reloadStartedAt = -999;
    switchBlend = 1;
    state.bloom = Math.max(0, state.bloom * 0.5);
    const w = byId(id);
    if (w.kind !== 'pistol' && !w.melee) state.primary = id;
    buildViewModel(id);
    if (sfx.swap) sfx.swap(); else sfx.click();
    return true;
  }
  function ready(now) {
    return now >= state.lastShot + def().rateMs / 1000 && now >= state.reloadingUntil;
  }
  function canFire(now) { return ready(now) && (def().melee || state.mag[state.current] > 0); }
  function spreadNow(moveSpeed, airborne, crouch) {
    const w = def();
    let s = w.spread + state.bloom;
    if (moveSpeed > 1) s += 0.012 * Math.min(1, moveSpeed / 6);
    if (airborne) s += 0.03;
    if (crouch) s *= 0.7;
    if (state.ads) s *= 0.45;
    return s;
  }
  // Consumes a round and returns the weapon def, or null if it cannot fire.
  // Melee (knife) never consumes ammo: it swings and returns the def.
  function fire(now) {
    const w = def();
    if (!ready(now)) return null;
    if (w.melee) {
      state.lastShot = now;
      // Starts the slash animation step() plays over the next 0.26 s.
      // Before this the knife's only feedback was this same viewKick at
      // recoil 0.004 (≈0.2°) — the swing was literally invisible, so the
      // knife read as a frozen prop that could not attack.
      state.swingStart = now;
      viewKick = Math.min(0.09, viewKick + 0.02);
      sfx.swing();
      return w;
    }
    if (state.mag[w.id] <= 0) { sfx.dry(); state.lastShot = now; return null; }
    state.mag[w.id] -= 1;
    state.lastShot = now;
    state.bloom = Math.min(0.05, state.bloom + w.bloom);
    viewKick = Math.min(0.09, viewKick + w.recoil * 0.9);
    sfx.shot(w.id);
    // Muzzle tip from the real barrel end (follows the yaw): vm-local
    // muzzle offset, scaled, rotated by the viewmodel, placed by the
    // camera. One frame stale at most — the flash lives 0.06 s.
    const tip = muzzleLocal.clone().multiplyScalar(vm.scale.x)
      .applyEuler(vm.rotation).add(vm.position).applyMatrix4(camera.matrixWorld);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    effects.muzzle(tip, dir);
    return w;
  }
  function reload(now) {
    const w = def();
    if (w.melee) return false;
    if (now < state.reloadingUntil || state.mag[w.id] === w.mag || state.reserve[w.id] <= 0) return false;
    state.reloadingUntil = now + w.reloadMs / 1000;
    state.reloadWeapon = w.id;
    reloadStartedAt = now;
    sfx.reload();
    return true;
  }
  // bob: player.state (optional) — drives viewmodel sway/bob from real movement.
  function step(dt, now, bob) {
    state.bloom = Math.max(0, state.bloom - dt * 0.045);
    viewKick = Math.max(0, viewKick - dt * 0.35);
    idleClock += dt;
    switchBlend *= Math.exp(-dt * 11);
    // ADS blend: the gun slides toward the centre of the screen, CS2-style,
    // instead of snapping. Smooth, never instant.
    state.adsBlend += ((state.ads ? 1 : 0) - state.adsBlend) * Math.min(1, dt * 10);
    const ab = state.adsBlend;
    // Aspect-aware placement: the viewmodel sits at a fixed fraction of the
    // frame width, not a fixed world X. At portrait aspect the old 0.28 put
    // the gun ~29 deg off-axis while the horizontal half-FOV is only ~19
    // deg — the whole gun fell outside the frustum and the player
    // saw no weapon at all. Clamped so landscape keeps the proven 0.28.
    const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const halfH = Math.atan(Math.tan(vHalf) * camera.aspect);
    const frameX = THREE.MathUtils.clamp(Math.tan(halfH) * 0.5 * 0.45, 0.05, 0.28);
    // CS2-sized viewmodel: pushed back and scaled so the gun sits in the
    // lower-right quadrant. Landscape needs scale ~1.0 to read at a 100 deg
    // horizontal FOV; portrait (38 deg) needs 0.78 — the old single scale
    // was a giant slab in portrait and a speck in landscape.
    vm.scale.setScalar(camera.aspect < 0.85 ? 0.78 : 1.0);
    const baseX = frameX * (1 - ab);
    // Side profile: yaw angles the gun toward the centre so the player
    // sees the slide, barrel and grip — not the flat back of the receiver
    // (which read as a dark slab on the real phone). ADS straightens it
    // so the sights sit on the crosshair. PORTRAIT gets a much smaller
    // yaw and a higher base Y: at a ~38° horizontal FOV the landscape
    // 0.3 rad yaw is half the screen width, so the barrel pointed far
    // left of — and well below — the centred crosshair, and the
    // crosshair looked like it had drifted up off the gun's aim line.
    // Shots have always left from the exact screen centre (the
    // crosshair); this makes the gun visibly agree with that.
    const portrait = camera.aspect < 0.85;
    const hipYaw = portrait ? 0.13 : 0.3;
    vm.rotation.y = hipYaw * (1 - ab) + 0.02 * ab;
    // Base Y must match the vm.position set above (-0.36): this line
    // runs every frame and overwrites it. The hip base is low (third
    // arm fix — grips near the bottom edge, short forearms); ADS
    // lifts the gun back up by the blend amount so the sights rise
    // to the crosshair line as before (lift brings the ADS base back
    // to the old -0.11/-0.10, applied through ab so it animates with
    // the ADS slide instead of snapping).
    vm.position.y = (portrait ? -0.31 : -0.36) + viewKick * 0.9 + ab * (portrait ? 0.21 : 0.25);
    vm.position.z = -0.55 + viewKick * 1.4 - ab * 0.08;
    // Slight muzzle-down hip pitch (third arm fix): rotating about
    // the viewmodel origin drops far points more than near ones, so
    // the forward support grip (z ~ -0.75) sinks ~2.3x as much as
    // the near trigger grip (z ~ -0.31) — exactly the asymmetry the
    // two grips need to both land near the bottom edge. ADS blends
    // it out so the sights stay on the crosshair line.
    vm.rotation.x = -0.06 * (1 - ab) + viewKick * 1.6;
    // Per-weapon barrel-aim pose: fades out with ADS (ab), which already
    // centres the sights — the aim pose only corrects hip fire. The drop
    // (dy) fades with it so ADS lifts the gun back to the old sight line.
    gunGroup.rotation.set(
      gunBaseRot.x + gunAimRot.rx * (1 - ab),
      gunBaseRot.y + gunAimRot.ry * (1 - ab),
      gunBaseRot.z);
    gunGroup.position.set(VM_GUN_POS.x, VM_GUN_POS.y + gunAimDy * (1 - ab), VM_GUN_POS.z);
    // Muzzle-flash anchor follows the aim pose (gunGroup rotation about
    // its own origin; gunGroup.position is VM_GUN_POS in vm space).
    muzzleLocal.copy(muzzleGunLocal).applyEuler(gunGroup.rotation).add(gunGroup.position);
    if (lastVmInfo) lastVmInfo.muzzle = muzzleLocal.toArray().map((v) => +v.toFixed(3));
    // Base roll is reset every frame: the layers below (breathing,
    // reload cant, strafe lean, knife swing) only ever ADD to a known
    // base, so nothing accumulates across frames or repeated actions.
    vm.rotation.z = 0;
    // Subtle idle breathing: deliberately low amplitude so the muzzle and
    // crosshair remain visually aligned during precision aiming.
    vm.position.y += Math.sin(idleClock * 1.65) * 0.0025 * (1 - ab);
    vm.rotation.z += Math.sin(idleClock * 0.85) * 0.003 * (1 - ab);
    // Weapon switch settles into the new viewmodel instead of popping in.
    vm.position.y -= switchBlend * 0.035;
    vm.position.z += switchBlend * 0.055;
    vm.rotation.x += switchBlend * 0.045;
    // Reload presentation: dip and cant the complete weapon/arm group as
    // a single unit (gun and hand are both children of vm, so the grip
    // between them cannot distort). The animation is time-normalized
    // over the weapon's reloadMs and returns exactly to the base pose,
    // avoiding transform drift across repeated reloads.
    if (state.reloadWeapon && reloadStartedAt > -900) {
      const rw = byId(state.reloadWeapon);
      const progress = THREE.MathUtils.clamp((now - reloadStartedAt) / Math.max(0.1, rw.reloadMs / 1000), 0, 1);
      const reloadArc = Math.sin(progress * Math.PI);
      vm.position.y -= reloadArc * 0.075;
      vm.position.z += reloadArc * 0.035;
      vm.rotation.x += reloadArc * 0.085;
      vm.rotation.z -= reloadArc * 0.075;
    }
    if (bob) {
      const sf = Math.min(1, (bob.speed || 0) / 5) * (state.ads ? 0.35 : 1);
      const bp = bob.bobPhase || 0;
      vm.position.x = baseX + Math.sin(bp) * 0.014 * sf - (bob.strafeLean || 0) * 0.4;
      vm.position.y += Math.sin(bp * 2) * 0.008 * sf;
      // Additive on the reset base roll (see above), so the breathing
      // and reload-cant layers underneath survive the lean.
      vm.rotation.z += (bob.strafeLean || 0) * 0.8;
      // Look sway: the viewmodel lags the mouse, CS2-style, around the
      // base side-profile yaw set above. The lag is exponentially
      // smoothed (user fix): the raw per-frame mouse deltas used to be
      // applied 1:1, so every flick snapped the gun — and the arm rig
      // riding it — instantly to the new angle.
      const lx = Math.max(-60, Math.min(60, bob.lookSX || 0));
      const ly = Math.max(-60, Math.min(60, bob.lookSY || 0));
      const swayRate = 1 - Math.exp(-dt * 13);
      swayX += (lx - swayX) * swayRate;
      swayY += (ly - swayY) * swayRate;
      vm.rotation.y -= swayX * 0.00085 * (1 - ab);
      vm.rotation.x += swayY * 0.00055 * (1 - ab);
      // Crouch dips the gun, airborne lifts it, landing dips it with the eye.
      if (bob.crouch) vm.position.y -= 0.03;
      if (!bob.onGround) vm.position.y += 0.02;
      vm.position.y -= (bob.landDip || 0) * 0.4;
      // Sprint lowers the rifle, CS2-style.
      if (bob.sprinting) { vm.position.y -= 0.04; vm.rotation.x += 0.25; }
    }
    // Knife slash: a fast diagonal sweep of the whole viewmodel group,
    // so the blade sweeps with it.
    // 0.26 s, sine envelope — every term is 0 at both ends, so the knife
    // settles back to its idle pose with no pop. Runs after the bob block
    // so it composes with (never fights) sway/bob/kick.
    if (def().melee && state.swingStart > -999) {
      const p = (now - state.swingStart) / 0.26;
      if (p >= 0 && p < 1) {
        const s = Math.sin(p * Math.PI);
        vm.position.x -= s * 0.13;
        vm.position.y += s * 0.05 - p * 0.03;
        vm.position.z -= s * 0.07;
        vm.rotation.z += (0.5 - p) * 1.2 * s;
        vm.rotation.y -= s * 0.3;
        vm.rotation.x += s * 0.12;
      }
    }
    if (state.reloadWeapon && now >= state.reloadingUntil) {
      const w = byId(state.reloadWeapon);
      const need = w.mag - state.mag[w.id];
      const take = Math.min(need, state.reserve[w.id]);
      state.mag[w.id] += take;
      state.reserve[w.id] -= take;
      state.reloadWeapon = null;
    }
    effects.step(dt);
  }
  return { state, def, give, select, ready, canFire, spreadNow, fire, reload, step, effects, viewModel: vm, vmScene, vmCamera, syncVmCamera, get glbReady() { return glbReady; }, vmInfo() { return lastVmInfo; }, handMeasure, barrelMeasure };
}

// Grenades: thrown with an arc, 1.2 s fuse.
// kind 'frag' explodes (AoE via onExplode), 'flash' blinds (via onFlash),
// 'smoke' lays a smoke wall (effects.addSmokeCloud).
export function createGrenades(scene, sfx, effects) {
  const list = [];
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.4, metalness: 0.7 });
  function throwFrom(origin, dir, kind = 'frag', speed = 13) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    scene.add(mesh);
    list.push({ mesh, vel: dir.clone().multiplyScalar(speed).add(new THREE.Vector3(0, 3.2, 0)), fuse: 1.2, bounced: 0, kind });
  }
  // Steps grenades; onExplode(pos) for frags, onFlash(pos) for flashbangs.
  function step(dt, colliders, onExplode, onFlash) {
    for (let i = list.length - 1; i >= 0; i--) {
      const g = list[i];
      g.fuse -= dt;
      g.vel.y -= 14 * dt;
      g.mesh.position.addScaledVector(g.vel, dt);
      if (g.mesh.position.y < 0.09) {
        g.mesh.position.y = 0.09;
        g.vel.y = Math.abs(g.vel.y) * 0.35;
        g.vel.x *= 0.6; g.vel.z *= 0.6;
      }
      if (g.fuse <= 0) {
        const pos = g.mesh.position.clone();
        scene.remove(g.mesh);
        list.splice(i, 1);
        if (g.kind === 'flash') {
          sfx.flash();
          if (onFlash) onFlash(pos);
        } else if (g.kind === 'smoke') {
          sfx.smoke();
          if (effects) effects.addSmokeCloud(pos);
        } else {
          sfx.explosion();
          onExplode(pos);
        }
      }
    }
  }
  function clear() { for (const g of list) scene.remove(g.mesh); list.length = 0; }
  return { throwFrom, step, clear, list };
}
