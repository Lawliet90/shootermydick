// Kestrel Yard — original dusk desert freight yard.
// Sand ground, rust/teal containers, concrete barriers, a warehouse block,
// two plant sites (Relay Alpha west, Relay Beta east). All textures procedural.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  // The canvas art is authored in sRGB; without this flag three r152+
  // samples it as linear and the renderer brightens it a second time,
  // which is why the yard rendered washed-out and off-palette in game
  // versus how the colours were authored.
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(ctx, s, base, dots, n, aMin, aMax) {
  ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = dots[i % dots.length];
    ctx.globalAlpha = aMin + Math.random() * (aMax - aMin);
    const r = 1 + Math.random() * 3;
    ctx.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
  ctx.globalAlpha = 1;
}
function makeTextures() {
  const sand = canvasTex(256, (ctx, s) => speckle(ctx, s, '#c8a06a', ['#a67c4e', '#d9b983', '#8f6a3e', '#e8cfa0'], 2600, 0.15, 0.5));
  sand.repeat.set(24, 18);
  const rust = canvasTex(256, (ctx, s) => {
    speckle(ctx, s, '#b4552a', ['#7e3418', '#d97a45', '#5e2410'], 1400, 0.2, 0.55);
    ctx.fillStyle = 'rgba(60,25,8,0.35)';
    for (let x = 0; x < s; x += 32) ctx.fillRect(x, 0, 4, s); // container ribs
    ctx.fillStyle = 'rgba(242,234,217,0.16)';
    ctx.fillRect(0, 20, s, 10);
  });
  const teal = canvasTex(256, (ctx, s) => {
    speckle(ctx, s, '#2e7f7a', ['#1d4f4c', '#4aa39d', '#123936'], 1400, 0.2, 0.55);
    ctx.fillStyle = 'rgba(10,40,38,0.35)';
    for (let x = 0; x < s; x += 32) ctx.fillRect(x, 0, 4, s);
    ctx.fillStyle = 'rgba(242,234,217,0.14)';
    ctx.fillRect(0, 20, s, 10);
  });
  const concrete = canvasTex(256, (ctx, s) => speckle(ctx, s, '#8d8578', ['#5f594e', '#a39a88', '#6e675c'], 2000, 0.15, 0.45));
  concrete.repeat.set(6, 6);
  const steel = canvasTex(128, (ctx, s) => speckle(ctx, s, '#4a4f55', ['#2b2f33', '#6a7076'], 500, 0.2, 0.4));
  return { sand, rust, teal, concrete, steel };
}

// Push a circle (x,z radius r, y-span) out of every overlapping box collider.
export function resolveCircle(pos, r, y0, y1, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    if (b.max.y <= y0 || b.min.y >= y1) continue;
    const cx = Math.max(b.min.x, Math.min(pos.x, b.max.x));
    const cz = Math.max(b.min.z, Math.min(pos.z, b.max.z));
    const dx = pos.x - cx;
    const dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) {
      const d = Math.sqrt(d2);
      pos.x = cx + (dx / d) * r;
      pos.z = cz + (dz / d) * r;
    } else {
      // Centre inside the box: push out along the smallest penetration axis.
      const px = Math.min(pos.x - b.min.x + r, b.max.x - pos.x + r);
      const pz = Math.min(pos.z - b.min.z + r, b.max.z - pos.z + r);
      if (px < pz) pos.x = (pos.x - b.min.x < b.max.x - pos.x) ? b.min.x - r : b.max.x + r;
      else pos.z = (pos.z - b.min.z < b.max.z - pos.z) ? b.min.z - r : b.max.z + r;
    }
  }
}

export function createWorld(scene) {
  const tex = makeTextures();
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const shootables = [];

  function mat(map, color, rough = 0.92, metal = 0.04) {
    return new THREE.MeshStandardMaterial({ map: map || null, color, roughness: rough, metalness: metal });
  }
  const M = {
    sand: mat(tex.sand, 0xffffff), rust: mat(tex.rust, 0xffffff, 0.85, 0.15),
    teal: mat(tex.teal, 0xffffff, 0.85, 0.15), concrete: mat(tex.concrete, 0xffffff),
    steel: mat(tex.steel, 0xffffff, 0.6, 0.4), darkSteel: mat(null, PALETTE.steelDark, 0.7, 0.3),
    sandDark: mat(null, PALETTE.sandDark), siteA: mat(null, 0x3f6fb5, 0.7, 0.1),
    siteB: mat(null, 0xc98a2e, 0.7, 0.1),
  };

  function box(w, h, d, x, y, z, material, collide = true, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground (not a collider — the floor is y=0).
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(72, 54), M.sand);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  shootables.push(ground);

  // Perimeter walls.
  box(72, 4.5, 1, 0, 2.25, -27, M.concrete);
  box(72, 4.5, 1, 0, 2.25, 27, M.concrete);
  box(1, 4.5, 54, -36, 2.25, 0, M.concrete);
  box(1, 4.5, 54, 36, 2.25, 0, M.concrete);

  // Warehouse block, north-centre (0,-19): big dark-steel shed with a door gap.
  box(18, 6, 8, -5.5, 3, -21, M.darkSteel);
  box(18, 6, 8, 11.5, 3, -21, M.darkSteel);
  box(7, 2, 8, 3, 5, -21, M.darkSteel); // lintel over the door gap
  box(20, 0.6, 10, 3, 6.3, -21, M.steel); // roof slab

  // Container stacks — lanes: main (x=0), container lane (x=-14), warehouse flank (x=+14).
  // West cluster (Alpha side)
  box(6, 2.6, 2.6, -22, 1.3, -6, M.rust);
  box(6, 2.6, 2.6, -22, 3.9, -6, M.teal); // stacked
  box(6, 2.6, 2.6, -22, 1.3, 2, M.teal, true, 0);
  box(6, 2.6, 2.6, -14, 1.3, -14, M.teal);
  box(2.6, 2.6, 6, -28, 1.3, -14, M.rust, true, 0);
  // Centre cover
  box(6, 2.6, 2.6, -4, 1.3, 0, M.rust);
  box(6, 2.6, 2.6, 6, 1.3, -4, M.teal);
  box(2.6, 2.6, 6, 0, 1.3, 8, M.rust);
  // East cluster (Beta side)
  box(6, 2.6, 2.6, 22, 1.3, -6, M.teal);
  box(6, 2.6, 2.6, 22, 3.9, -6, M.rust);
  box(6, 2.6, 2.6, 22, 1.3, 2, M.rust);
  box(6, 2.6, 2.6, 14, 1.3, -14, M.rust);
  box(2.6, 2.6, 6, 28, 1.3, -14, M.teal);
  // South cover near Vanguard spawn
  box(4, 1.2, 1.2, -8, 0.6, 14, M.concrete);
  box(4, 1.2, 1.2, 8, 0.6, 14, M.concrete);
  box(1.2, 1.2, 4, 0, 0.6, 18, M.concrete);
  // Concrete barriers mid-yard
  box(3, 1.1, 1, -10, 0.55, 6, M.concrete);
  box(3, 1.1, 1, 10, 0.55, 6, M.concrete);
  box(1, 1.1, 3, -16, 0.55, -2, M.concrete);
  box(1, 1.1, 3, 16, 0.55, -2, M.concrete);
  // Low crates
  box(1.4, 1.4, 1.4, -6, 0.7, -10, M.sandDark);
  box(1.4, 1.4, 1.4, 6, 0.7, -10, M.sandDark);
  box(1.4, 1.4, 1.4, -2, 0.7, 12, M.sandDark);

  // Plant sites: flat marked pads + corner posts + floating letter beacon.
  function site(cx, cz, material, letter) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.08, 24), material);
    pad.position.set(cx, 0.04, cz);
    pad.receiveShadow = true;
    group.add(pad);
    shootables.push(pad);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.09, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0xffffff }));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(cx, 0.12, cz);
    group.add(ring);
    for (const [px, pz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) {
      box(0.18, 1.6, 0.18, cx + px, 0.8, cz + pz, material, false);
    }
    return { center: new THREE.Vector3(cx, 0, cz), radius: 3.4, letter, ring };
  }
  const siteAlpha = site(-24, -14, M.siteA, 'A');
  const siteBeta = site(24, -14, M.siteB, 'B');

  // Bright daytime sky: blue gradient dome, visible sun disc + halo, light haze.
  // (Dust-2-style desert daylight mood — own map, own palette, no Valve content.)
  const sunDir = new THREE.Vector3(0.42, 0.72, 0.28).normalize();
  const skyGeo = new THREE.SphereGeometry(180, 16, 12);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, fog: false, depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.skyTop) },
      bottom: { value: new THREE.Color(PALETTE.skyBottom) },
      sunDir: { value: sunDir },
      sunColor: { value: new THREE.Color(0xfff6d8) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vP; void main(){ float h=clamp(vP.y/180.0*1.6+0.25,0.0,1.0); vec3 col=mix(bottom,top,pow(h,0.8)); float s=max(dot(normalize(vP),sunDir),0.0); col+=sunColor*(pow(s,350.0)*1.4+pow(s,24.0)*0.30); gl_FragColor=vec4(col,1.0); }',
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  scene.add(sky);
  scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 45, 150);

  // Bright warm daylight: strong hemisphere (blue sky / warm sand bounce),
  // high warm sun, cool sky fill. The yard reads clear, not dusk-dark.
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0xcfa96e, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 3.0);
  sun.position.set(24, 38, 14);
  sun.target.position.set(0, 0, -6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xaec6dd, 0.6);
  fill.position.set(-18, 14, 20);
  scene.add(fill);

  // Waypoint graph: lanes across the yard. links are node indices.
  const wp = [
    [0, 22], [-10, 22], [10, 22],          // 0-2 Vanguard spawn line
    [5, 12], [-12, 12], [12, 12],          // 3-5 mid-south (3 sits east of the centre container: the old [0,12] put the 0->3 and 3->6/7 edges straight through the (0,18) barrier and the (0,8) container)
    [-4, 4], [4, 4], [-14, 2], [14, 2],    // 6-9 centre
    [-8, -6], [8, -6], [-20, -8], [20, -8],// 10-13 approaches
    [-24, -14], [24, -14],                  // 14-15 sites A / B
    [3, -16], [-12, -16], [12, -16],        // 16-18 warehouse / north
    [0, -26], [-6, -12], [6, -12],          // 19-21 north corridor / north mid
    [-18, -22], [24, -22],                  // 22-23 warehouse ends / north corridor
  ];
  const links = [
    [1, 2, 3], [0, 4], [0, 5], [0, 6, 7], [1, 8], [2, 9],
    [3, 8, 10], [3, 6, 11], [4, 10], [5, 11],
    [6, 12, 17], [7, 13, 18], [8, 14], [9, 15],
    [12, 17], [13, 18], [17, 18, 20, 21], [10, 14, 16, 22], [11, 15, 16, 23],
    [22, 23], [10, 16], [11, 16],
    [17, 19], [18, 19],
  ];
  const waypoints = wp.map((p, i) => ({ pos: new THREE.Vector3(p[0], 0, p[1]), links: links[i] || [] }));

  // Spawns sit in open ground: Jackals south of the warehouse (their old
  // z=-22 spawns were inside the solid shed), Vanguard clear of the barrier.
  // Five per team for competitive 5v5: bots take indices 0-3 (Vanguard) /
  // 0-4 (Jackals), the player takes Vanguard index 4 — (0,23) is clear
  // ground (the old (0,20) sat against the (0,18) barrier and pinned the
  // player in place).
  const spawns = {
    // Vanguard bots (indices 0-3) spawn ~4.5 m ahead of the player
    // (index 4): on the old shared line the whole squad sprinted past
    // the camera at round start and one back filled the whole screen.
    vanguard: [new THREE.Vector3(-9, 0, 18.5), new THREE.Vector3(-3, 0, 18.5), new THREE.Vector3(3, 0, 18.5), new THREE.Vector3(9, 0, 18.5), new THREE.Vector3(0, 0, 23)],
    jackal: [new THREE.Vector3(-9, 0, -14), new THREE.Vector3(-3, 0, -14), new THREE.Vector3(3, 0, -14), new THREE.Vector3(9, 0, -14), new THREE.Vector3(0, 0, -12)],
  };

  return { colliders, shootables, group, sites: { alpha: siteAlpha, beta: siteBeta }, waypoints, spawns, sun };
}
