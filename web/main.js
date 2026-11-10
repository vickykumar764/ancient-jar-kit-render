// Engine: toon world + ink + grade + lens blur, canvas-drawn character cards. Exposes window.renderFrame(f).
import * as THREE from "three";
import * as T from "./toon.js";
import * as P from "./paint.js";
import { ridgeH, terrainH, groundAt, chanEnd, W0, CH, fbm } from "./terrain.js";
import { frameState, TOTAL, VILLAGE, ROAD, LANE, CLINIC, SHORT } from "./story.js";

const W = 1080, H = 1920, PX = W / 1080;
const NOINK = 1;
const canvas = document.createElement("canvas");
canvas.width = W; canvas.height = H;
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 3000);
camera.layers.enableAll();
scene.fog = new THREE.Fog(0xb8d0ec, 80, 900);

// ---------- toon materials ----------
const grad = (() => { const d = new Uint8Array([0, 0, 255, 255]); const t = new THREE.DataTexture(d, 4, 1, THREE.RedFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t; })();
const ctex = (c, rep = true) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; };
const toon = (opts) => new THREE.MeshToonMaterial({ gradientMap: grad, ...opts });
/** triplanar toon: world-space projected texture (scale = metres per tile) */
const triToon = (tex, scale, color = 0xffffff, extra = {}) => {
  const m = toon({ color, ...extra });
  m.customProgramCacheKey = () => "tri";
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tTri = { value: tex };
    sh.uniforms.triS = { value: 1 / scale };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vTP; varying vec3 vTN;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\n vTP = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D tTri; uniform float triS; varying vec3 vTP; varying vec3 vTN;")
      .replace("#include <map_fragment>", `{
        vec3 bw = pow(abs(vTN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 tc = texture2D(tTri, vTP.zy * triS).rgb * bw.x + texture2D(tTri, vTP.xz * triS).rgb * bw.y + texture2D(tTri, vTP.xy * triS).rgb * bw.z;
        vec3 ta = textureLod(tTri, vec2(0.5), 12.0).rgb;
        tc = mix(tc, ta, smoothstep(70.0, 320.0, distance(vTP, cameraPosition)) * 0.85);
        diffuseColor.rgb *= tc; }`);
  };
  return m;
};

const TEX = {
  rock: ctex(P.rockTex(11)), rock2: ctex(P.rockTex(23)), grass: ctex(P.grassTex(3)), dirt: ctex(P.dirtTex(2)),
  mud: ctex(P.mudTex(4)), mud2: ctex(P.mudTex(14, 512, "#d8a874")), mudW: ctex(P.mudTex(24, 512, "#e9dcc4")), tile: ctex(P.tileTex(5)), thatch: ctex(P.thatchTex(6)),
  wood: ctex(P.woodTex(7)), leaf: ctex(P.leafTex(8)), leaf2: ctex(P.leafTex(18, 512, "#4f7a34")), palm: ctex(P.leafTex(28, 512, "#5e8c3c")),
  bronze: ctex(P.bronzeTex(31)), goldTile: ctex(P.goldTileTex(32)), glass: ctex(P.stainedGlassTex(33)),
};
const MAT = {
  rock: triToon(TEX.rock, 9), boulder: triToon(TEX.rock2, 4),
  grass: triToon(TEX.grass, 14), dirt: triToon(TEX.dirt, 8), lane: triToon(TEX.dirt, 6, 0xf2e6d6),
  mud: triToon(TEX.mud, 4), mud2: triToon(TEX.mud2, 4), mudW: triToon(TEX.mudW, 4),
  tile: toon({ map: TEX.tile }), thatch: toon({ map: TEX.thatch }), wood: triToon(TEX.wood, 2),
  leaf: triToon(TEX.leaf, 3), leaf2: triToon(TEX.leaf2, 3), palm: toon({ color: 0x5f9a3e }), trunk: triToon(TEX.wood, 1.5, 0x9a8070),
  door: toon({ color: 0x3a2618 }), dark: toon({ color: 0x2a1f1a }), hay: triToon(TEX.thatch, 2.5),
  white: triToon(TEX.mudW, 3, 0xffffff), hill: toon({ color: 0x8c8fa8 }), hill2: toon({ color: 0x9a9db4 }),
  mustard: triToon(ctex(P.grassTex(41, 512, "#d9b93c")), 10), paddy: triToon(ctex(P.grassTex(42, 512, "#7fa84a")), 10),
  bronze: triToon(TEX.bronze, 1.6), gold: toon({ color: 0xd4a017 }), goldTile: triToon(TEX.goldTile, 2),
  stone: triToon(TEX.mudW, 3, 0xb0aca0), redCurtain: toon({ color: 0x9e2a24 }), jade: toon({ color: 0x5f8a6a }),
  lava: new THREE.MeshBasicMaterial({ color: 0xff5a1a }), glass: new THREE.MeshBasicMaterial({ map: TEX.glass }),
  rope: toon({ color: 0x8a6a40 }),
};
const world = []; // meshes that get inked
const addW = (mesh, cast = true, recv = true) => { mesh.castShadow = cast; mesh.receiveShadow = recv; mesh.layers.set(0); scene.add(mesh); world.push(mesh); return mesh; };

// ---------- world ----------
// ground
{
  const g = new THREE.PlaneGeometry(2400, 2400, 1, 1); g.rotateX(-Math.PI / 2);
  addW(new THREE.Mesh(g, MAT.grass), false, true);
}
// ridge heightfield: fine columns near the cut, coarse far away
const xs = [], zs = [];
{ let x = -620; while (x < 330) { xs.push(x); const a = Math.abs(x); x += a < 7 ? 0.25 : a < 22 ? 0.7 : a < 70 ? 2 : 5; } xs.push(330); }
{ let z = -62; while (z < 62) { zs.push(z); const a = Math.abs(z); z += a < 30 ? 0.45 : 1.6; } zs.push(62); }
const NX = xs.length, NZ = zs.length;
const ridgeGeo = new THREE.BufferGeometry();
const rPos = new Float32Array(NX * NZ * 3), rBase = new Float32Array(NX * NZ);
for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { const k = j * NX + i; rPos[k * 3] = xs[i]; rPos[k * 3 + 2] = zs[j]; rBase[k] = ridgeH(xs[i], zs[j]); }
{
  const idx = [];
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1; idx.push(a, c, b, b, c, d); }
  ridgeGeo.setIndex(idx);
  ridgeGeo.setAttribute("position", new THREE.BufferAttribute(rPos, 3));
}
let ridgeP = -1;
const setProgress = (p) => {
  p = Math.round(p * 400) / 400;
  if (p === ridgeP) return;
  ridgeP = p;
  for (let k = 0; k < NX * NZ; k++) rPos[k * 3 + 1] = terrainH(rPos[k * 3], rPos[k * 3 + 2], p, rBase[k]);
  ridgeGeo.attributes.position.needsUpdate = true;
  ridgeGeo.computeVertexNormals();
  ridgeGeo.computeBoundingSphere();
};
setProgress(0);
const ridge = addW(new THREE.Mesh(ridgeGeo, MAT.rock), true, true);

const rnd = P.rng(77);
// boulders on the ridge (kept out of the cut corridor)
{
  const geo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 260; i++) {
    const x = -260 + rnd() * 500, z = (rnd() - 0.5) * 70;
    if (Math.abs(x) < 12) continue;
    const h = ridgeH(x, z) - 0.35;
    if (h < 0.3) { if (rnd() < 0.7 || Math.abs(z) > 30) continue; }
    const m = new THREE.Mesh(geo, MAT.boulder), s = 0.6 + rnd() * rnd() * 3.2;
    m.scale.set(s * (0.8 + rnd() * 0.6), s * (0.5 + rnd() * 0.4), s * (0.8 + rnd() * 0.6));
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.position.set(x, Math.max(0, h) + s * 0.15, z);
    addW(m);
  }
}
// scrub on the ridge + plains
const blobTree = (x, z, s, mat = MAT.leaf, trunkH = 0) => {
  const y0 = groundAt(x, z, 0);
  const g = new THREE.Group();
  if (trunkH) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.2 * s, trunkH, 7), MAT.trunk); t.position.y = trunkH / 2; g.add(t); }
  const n = trunkH ? 5 : 2 + ((rnd() * 2) | 0);
  for (let i = 0; i < n; i++) {
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(s * (0.55 + rnd() * 0.35), 1), mat);
    b.position.set((rnd() - 0.5) * s * 1.2, trunkH + s * (0.3 + rnd() * 0.5), (rnd() - 0.5) * s * 1.2);
    b.scale.y = 0.75; g.add(b);
  }
  g.position.set(x, y0, z);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; world.push(o); } });
  scene.add(g);
  return g;
};
for (let i = 0; i < 140; i++) {
  const x = -300 + rnd() * 560, z = (rnd() - 0.5) * 60;
  if (Math.abs(x) < 10 && Math.abs(z) < 30) continue;
  if (ridgeH(x, z) < 1.5) continue;
  blobTree(x, z, 0.6 + rnd() * 0.9, rnd() < 0.5 ? MAT.leaf : MAT.leaf2);
}
// palm (toddy palm)
const palm = (x, z, h = 9) => {
  const y0 = groundAt(x, z, 0), g = new THREE.Group();
  const lean = (rnd() - 0.5) * 0.25;
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.3, h, 7, 4), MAT.trunk); t.position.y = h / 2; t.rotation.z = lean; g.add(t);
  const top = new THREE.Vector3(-Math.sin(lean) * h, Math.cos(lean) * h, 0);
  const cr = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6, 0), MAT.palm); cr.position.copy(top); g.add(cr);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2, f = new THREE.Mesh(new THREE.ConeGeometry(0.9, 3.2, 4), MAT.palm);
    f.scale.set(1, 1, 0.18); f.position.copy(top).add(new THREE.Vector3(Math.cos(a) * 1.3, 0.2, Math.sin(a) * 1.3));
    f.rotation.set(0, -a, 0); f.rotateZ(-Math.PI / 2 - 0.35); g.add(f);
  }
  g.position.set(x, y0, z); g.rotation.y = rnd() * 6;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; world.push(o); } });
  scene.add(g);
};
// house: mud walls, khapra or thatch gable roof, door, window
const roofGeo = (w, d, rise, over) => {
  const hw = w / 2 + over, hd = d / 2 + over, g = new THREE.BufferGeometry();
  const v = [-hw, 0, hd, hw, 0, hd, hw, rise, 0, -hw, rise, 0, -hw, rise, 0, hw, rise, 0, hw, 0, -hd, -hw, 0, -hd];
  const uv = [0, 0, w / 2.2, 0, w / 2.2, hd / 1.6, 0, hd / 1.6, 0, hd / 1.6, w / 2.2, hd / 1.6, w / 2.2, 0, 0, 0];
  g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]); g.computeVertexNormals();
  return g;
};
const house = (x, z, w, d, hgt, rot, kind = 0) => {
  const g = new THREE.Group(), y0 = groundAt(x, z, 0);
  const wallMat = kind === 3 ? MAT.mudW : [MAT.mud, MAT.mud2, MAT.mudW][kind % 3];
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, hgt, d), wallMat); wall.position.y = hgt / 2; g.add(wall);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3), MAT.dirt); plinth.position.y = 0.17; g.add(plinth);
  const rise = 1.4 + 0.2 * w, over = 0.45;
  const roof = new THREE.Mesh(roofGeo(w, d, rise, over), kind === 3 ? MAT.goldTile : kind % 2 ? MAT.thatch : MAT.tile); roof.position.y = hgt; roof.material.side = THREE.DoubleSide; g.add(roof);
  const gable = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, rise - 0.05)].map((p) => new THREE.Vector2(p.x, p.y)));
  void gable;
  const gab = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise * (d / 2) / (d / 2 + over) - 0.02)]), { depth: w - 0.02, bevelEnabled: false }), wallMat);
  gab.rotation.y = Math.PI / 2; gab.position.set(-w / 2 + 0.01, hgt, 0); g.add(gab);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.8, 0.08), MAT.door); door.position.set(w * 0.15, 0.95, d / 2 + 0.02); g.add(door);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.08), MAT.dark); win.position.set(-w * 0.25, hgt * 0.62, d / 2 + 0.02); g.add(win);
  g.position.set(x, y0, z); g.rotation.y = rot;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; world.push(o); } });
  scene.add(g);
  return g;
};
const haystack = (x, z, s = 1) => {
  const g = new THREE.Group(), y0 = groundAt(x, z, 0);
  const b = new THREE.Mesh(new THREE.CylinderGeometry(1.3 * s, 1.4 * s, 1.4 * s, 10), MAT.hay); b.position.y = 0.7 * s; g.add(b);
  const c = new THREE.Mesh(new THREE.ConeGeometry(1.45 * s, 1.6 * s, 10), MAT.hay); c.position.y = 2.2 * s; g.add(c);
  g.position.set(x, y0, z);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; world.push(o); } });
  scene.add(g);
};
// village
const chimneys = [];
for (const h of VILLAGE.houses) { house(h[0], h[1], h[2], h[3], h[4], h[5], h[6]); if (h[7]) chimneys.push([h[0], groundAt(h[0], h[1], 0) + h[4] + 2, h[1]]); }
for (const t of VILLAGE.palms) palm(t[0], t[1], t[2]);
for (const t of VILLAGE.trees) blobTree(t[0], t[1], t[2], MAT.leaf, t[3]);
for (const t of VILLAGE.hay) haystack(t[0], t[1], t[2]);
// fields
for (const fl of VILLAGE.fields) {
  const g = new THREE.PlaneGeometry(fl[2], fl[3]); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, fl[4] ? MAT.mustard : MAT.paddy); m.position.set(fl[0], 0.04, fl[1]); m.rotation.y = fl[5] || 0;
  addW(m, false, true);
}
// ribbons (lane, road)
const ribbon = (pts, w, mat, lift = 0.06) => {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], 0, p[1])));
  const L = curve.getLength(), n = Math.max(8, Math.round(L / 1.5)), pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), d = curve.getTangentAt(t), nx = -d.z, nz = d.x;
    for (const s of [-1, 1]) { const x = p.x + nx * s * w / 2, z = p.z + nz * s * w / 2; pos.push(x, groundAt(x, z, 1) + lift, z); uv.push(s * 0.5, (t * L) / w); }
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  return addW(new THREE.Mesh(g, mat), false, true);
};
ribbon(ROAD, 8, MAT.lane, 0.08);
ribbon(LANE, 4.5, MAT.lane);
// route lines (map view): unlit dashed strip that reveals along its length
const routeLine = (pts, color, w) => {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], 0, p[1])));
  const L = curve.getLength(), n = Math.round(L / 1.2), pos = [], uv = [], idx = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, p = curve.getPointAt(t), d = curve.getTangentAt(t), nx = -d.z, nz = d.x;
    for (const s of [-1, 1]) { const x = p.x + nx * s * w / 2, z = p.z + nz * s * w / 2; pos.push(x, groundAt(x, z, 1) + 0.35, z); uv.push(s * 0.5, t * L); }
    if (i < n) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { col: { value: new THREE.Color(color).convertSRGBToLinear() }, reveal: { value: 0 }, alpha: { value: 1 }, dash: { value: 12 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 col; uniform float reveal; uniform float alpha; uniform float dash; varying vec2 vUv;
      void main(){ if (vUv.y > reveal) discard; if (fract(vUv.y / dash) > 0.62) discard;
        vec3 c = mix(col, vec3(0.012), step(0.36, abs(vUv.x))); gl_FragColor = vec4(c, alpha); }`,
  });
  const mesh = new THREE.Mesh(g, mat); mesh.layers.set(NOINK); mesh.renderOrder = 2; scene.add(mesh);
  return { mesh, mat, L };
};
const routeLong = routeLine(ROAD, "#e8382e", 5.5), routeShort = routeLine(SHORT, "#3fd15a", 5.5);
const shortRoad = ribbon(SHORT, 3.6, MAT.lane);
// distant hills
for (let i = 0; i < 16; i++) {
  const a = (i / 16) * Math.PI * 2 + rnd() * 0.3, r = 700 + rnd() * 350;
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), i % 2 ? MAT.hill : MAT.hill2);
  m.scale.set(120 + rnd() * 160, 40 + rnd() * 70, 80 + rnd() * 80); m.position.set(Math.cos(a) * r, -10, Math.sin(a) * r - 150);
  addW(m, false, false);
}
// clinic: whitewashed box, parapet, lantern
const clinic = new THREE.Group();
{
  const b = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 5), MAT.white); b.position.y = 1.7; clinic.add(b);
  const par = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.5, 5.4), MAT.white); par.position.y = 3.6; clinic.add(par);
  const d = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.1, 0.1), MAT.door); d.position.set(0, 1.05, 2.53); clinic.add(d);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), new THREE.MeshBasicMaterial({ color: 0xffc56a })); w.position.set(s * 2.3, 1.9, 2.53); clinic.add(w); }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0b0 })); lamp.position.set(0.9, 2.4, 2.75); clinic.add(lamp);
  clinic.position.set(CLINIC[0], 0, CLINIC[1]); clinic.rotation.y = CLINIC[2];
  clinic.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; world.push(o); } });
  scene.add(clinic);
  blobTree(CLINIC[0] - 7, CLINIC[1] - 2, 2.2, MAT.leaf, 2.5);
}
// set pieces: slab (losing) and the last wall (breakthrough)
const slab = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), MAT.boulder);
slab.scale.set(3.4, 1.6, 2.6); addW(slab); slab.visible = false;
const plug = [];
{
  const geo = new THREE.DodecahedronGeometry(1, 0);
  for (let j = 0; j < 4; j++) for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(geo, MAT.boulder), s = 1.15 + rnd() * 0.5;
    m.scale.set(s, s * 0.9, s * 0.8); m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.userData.home = [(i - 2) * 1.75 + (rnd() - 0.5) * 0.4, 0.9 + j * 1.55 + (rnd() - 0.5) * 0.3, (rnd() - 0.5) * 0.8];
    m.userData.vel = [(i - 2) * 1.6 + (rnd() - 0.5) * 2, 4 + rnd() * 5, -(9 + rnd() * 9)];
    m.userData.spin = [(rnd() - 0.5) * 9, (rnd() - 0.5) * 9, (rnd() - 0.5) * 9];
    m.userData.rot0 = [m.rotation.x, m.rotation.y, m.rotation.z];
    addW(m); m.visible = false; plug.push(m);
  }
}

// ---------- Ancient Jar set pieces ----------
// Layout (kit coords; +z = south toward the city, -z = north toward the hill):
// palace hall (0, 95), throne (0, 88), gate (0, 38), mechanism dome (22, 95),
// lava crack (0, 28), courtyard (0, 62), hill / inventor's hut (0, 4).
const rndJ = P.rng(1234);
const addSet = (group, mesh) => { mesh.castShadow = true; mesh.receiveShadow = true; mesh.layers.set(0); group.add(mesh); world.push(mesh); return mesh; };
const addSetNoInk = (group, mesh) => { mesh.layers.set(NOINK); group.add(mesh); return mesh; };

// --- palace hall (0, 95): floor, south back wall + stained glass, curtains, columns, throne ---
// The throne is against the SOUTH wall; the hall opens NORTH onto the courtyard,
// so the cart can be dragged straight out toward the hill.
const palaceGroup = new THREE.Group();
{
  const fl = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(26, 0.12, 20), MAT.stone)); fl.position.set(0, 0, 95);
  const wall = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(26, 7, 0.8), MAT.stone)); wall.position.set(0, 3.5, 105);
  const glass = addSetNoInk(palaceGroup, new THREE.Mesh(new THREE.PlaneGeometry(4.5, 6), MAT.glass)); glass.position.set(0, 4.3, 104.55); glass.rotation.y = Math.PI;
  for (const s of [-1, 1]) {
    const cur = addSet(palaceGroup, new THREE.Mesh(new THREE.PlaneGeometry(5.2, 7), MAT.redCurtain));
    cur.position.set(s * 6.8, 3.5, 104.54); cur.rotation.y = Math.PI;
    const trim = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.28, 0.12), MAT.gold));
    trim.position.set(s * 6.8, 0.15, 104.5);
    const rod = addSet(palaceGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 5.6, 8), MAT.gold));
    rod.rotation.z = Math.PI / 2; rod.position.set(s * 6.8, 7.05, 104.5);
  }
  for (const [cx, cz] of [[-9, 90], [9, 90], [-9, 101], [9, 101]]) {
    const col = addSet(palaceGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 6.5, 10), MAT.stone));
    col.position.set(cx, 3.25, cz);
    const cap = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.3), MAT.gold));
    cap.position.set(cx, 6.7, cz);
    const base = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.3), MAT.stone));
    base.position.set(cx, 0.2, cz);
  }
  // throne at (0, 102): dais + gold seat + tall back + red cushion
  const d1 = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.3, 4.2), MAT.stone)); d1.position.set(0, 0.15, 102);
  const d2 = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.3, 3.2), MAT.stone)); d2.position.set(0, 0.45, 102);
  const seat = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 1.5), MAT.gold)); seat.position.set(0, 0.85, 102);
  const back = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.7, 0.32), MAT.gold)); back.position.set(0, 1.65, 102.75);
  const cush = addSet(palaceGroup, new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.28, 1.2), MAT.redCurtain)); cush.position.set(0, 1.22, 102);
  const orb = addSet(palaceGroup, new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), MAT.gold)); orb.position.set(0, 2.65, 102.75);
}
scene.add(palaceGroup);

// --- city gate (0, 38): stone pillars + lintel + gold-tile gable + wooden doors ---
const gateGroup = new THREE.Group();
{
  for (const s of [-1, 1]) {
    const p = addSet(gateGroup, new THREE.Mesh(new THREE.BoxGeometry(1.4, 6.5, 1.4), MAT.stone)); p.position.set(s * 3.2, 3.25, 38);
    const cap = addSet(gateGroup, new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 1.8), MAT.gold)); cap.position.set(s * 3.2, 6.7, 38);
  }
  const lin = addSet(gateGroup, new THREE.Mesh(new THREE.BoxGeometry(8.4, 0.9, 1.6), MAT.stone)); lin.position.set(0, 7.0, 38);
  const gr = addSet(gateGroup, new THREE.Mesh(roofGeo(8.4, 2.2, 1.6, 0.5), MAT.goldTile)); gr.position.set(0, 7.45, 38); gr.material.side = THREE.DoubleSide;
  const dR = addSet(gateGroup, new THREE.Mesh(new THREE.BoxGeometry(2.6, 5, 0.18), MAT.door)); dR.position.set(1.7, 2.5, 38);
  const dL = addSet(gateGroup, new THREE.Mesh(new THREE.BoxGeometry(2.6, 5, 0.18), MAT.door)); dL.position.set(-1.7, 2.5, 38.6); dL.rotation.y = 0.95;
}
scene.add(gateGroup);

// --- mechanism dome (22, 95): open-front tiled dome, pendulum + rods inside ---
const mechGroup = new THREE.Group();
let pendGroup;
const mechRods = [];
{
  const wallM = addSet(mechGroup, new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 4.5, 20, 1, true, 0, Math.PI), MAT.stone));
  wallM.position.set(22, 2.25, 95); wallM.material.side = THREE.DoubleSide;
  const domeM = addSet(mechGroup, new THREE.Mesh(new THREE.SphereGeometry(3.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), MAT.goldTile));
  domeM.position.set(22, 4.5, 95); domeM.material.side = THREE.DoubleSide;
  const floorM = addSet(mechGroup, new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 0.15, 20), MAT.stone));
  floorM.position.set(22, 0.07, 95);
  // rods radiating from the centre at the pendulum's swing height
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rod = addSet(mechGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.5, 6), MAT.gold));
    rod.rotation.z = Math.PI / 2; rod.rotation.y = -a;
    rod.position.set(22 + Math.cos(a) * 1.9, 4.4, 95 + Math.sin(a) * 1.9);
    mechRods.push(rod);
  }
  // pendulum: pivot at the dome top, rod + heavy bronze ball
  pendGroup = new THREE.Group();
  const rodP = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.1, 8), MAT.dark);
  rodP.position.y = -1.55; rodP.castShadow = true; rodP.layers.set(0); pendGroup.add(rodP); world.push(rodP);
  const ballP = new THREE.Mesh(new THREE.SphereGeometry(0.38, 14, 10), MAT.bronze);
  ballP.position.y = -3.1; ballP.castShadow = true; ballP.layers.set(0); pendGroup.add(ballP); world.push(ballP);
  pendGroup.position.set(22, 7.4, 95);
  mechGroup.add(pendGroup);
}
scene.add(mechGroup);

// --- rubble (palace after the quake, shown in place of the hall) ---
const rubbleGroup = new THREE.Group();
{
  for (let i = 0; i < 4; i++) {
    const col = addSet(rubbleGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 3.2 + rndJ() * 1.5, 10), MAT.stone));
    col.position.set((rndJ() - 0.5) * 18, 0.5, 95 + (rndJ() - 0.5) * 14);
    col.rotation.set(Math.PI / 2 * (0.85 + rndJ() * 0.3), 0, rndJ() * 3);
  }
  for (let i = 0; i < 16; i++) {
    const b = addSet(rubbleGroup, new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), MAT.boulder));
    const s = 0.5 + rndJ() * 1.3;
    b.scale.set(s, s * 0.7, s);
    b.position.set((rndJ() - 0.5) * 22, 0.4, 95 + (rndJ() - 0.5) * 16);
    b.rotation.set(rndJ() * 3, rndJ() * 3, rndJ() * 3);
  }
  const cw = addSet(rubbleGroup, new THREE.Mesh(new THREE.BoxGeometry(9, 4, 0.8), MAT.stone));
  cw.position.set(-6, 1.0, 100); cw.rotation.set(0.45, 0.3, 0.25);
  const cw2 = addSet(rubbleGroup, new THREE.Mesh(new THREE.BoxGeometry(7, 3, 0.8), MAT.stone));
  cw2.position.set(7, 0.8, 90); cw2.rotation.set(-0.3, -0.5, 0.15);
  const thr = addSet(rubbleGroup, new THREE.Mesh(new THREE.BoxGeometry(1.9, 2.4, 0.32), MAT.gold));
  thr.position.set(0.6, 1.1, 102.5); thr.rotation.set(0.9, 0.4, 0.2);
}
rubbleGroup.visible = false;
scene.add(rubbleGroup);

// --- lava crack (0, 28): glowing fissure + heaved slabs, only in the payoff ---
const lavaGroup = new THREE.Group();
{
  for (let x = -17; x <= 17; x += 3.5) {
    const seg = addSetNoInk(lavaGroup, new THREE.Mesh(new THREE.BoxGeometry(6, 1.0, 2.5), MAT.lava));
    seg.position.set(x + (rndJ() - 0.5) * 1.4, 0.5, 28 + (rndJ() - 0.5) * 2.2);
    seg.rotation.y = (rndJ() - 0.5) * 0.5;
    for (const s of [-1, 1]) {
      const lip = addSet(lavaGroup, new THREE.Mesh(new THREE.BoxGeometry(5, 0.5, 0.8), MAT.dark));
      lip.position.set(x + (rndJ() - 0.5) * 1.2, 0.25, 28 + s * 1.5 + (rndJ() - 0.5) * 1.4);
      lip.rotation.y = (rndJ() - 0.5) * 0.5;
    }
  }
  for (const s of [-1, 1]) {
    const slab = addSet(lavaGroup, new THREE.Mesh(new THREE.BoxGeometry(16, 1.0, 6.5), MAT.rock));
    slab.position.set(s * 9, 1.0, 28 + s * 2.6);
    slab.rotation.set(s * 0.4, 0, s * 0.1);
  }
  for (const [x, z] of [[-14, 26], [-6, 30], [4, 26], [12, 30]]) {
    const b = addSet(lavaGroup, new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), MAT.boulder));
    const sc = 0.8 + rndJ() * 0.8; b.scale.set(sc, sc * 0.7, sc);
    b.position.set(x, 0.5, z); b.rotation.set(rndJ() * 3, rndJ() * 3, rndJ() * 3);
  }
}
lavaGroup.visible = false;
scene.add(lavaGroup);

// --- the seismoscope jar (built once, reused in every shot) ---
// One consistent bronze prop, ~1.5x a man's height (2.55 m body + plinth), 8 golden
// dragons around the rim (each holding a bronze ball), 8 stone frogs at the base.
const jarGroup = new THREE.Group();
const jarDragonMouth = [], jarFrogMouth = [], jarDropBalls = [];
{
  const prof = [[0.0, 0.0], [0.72, 0.0], [0.9, 0.12], [1.02, 0.45], [1.1, 0.95], [1.06, 1.5], [0.92, 1.95], [0.74, 2.15], [0.86, 2.32], [0.88, 2.45], [0.8, 2.5]];
  const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
  const body = addSet(jarGroup, new THREE.Mesh(new THREE.LatheGeometry(pts, 26), MAT.bronze));
  const rim = addSet(jarGroup, new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 10, 26), MAT.gold));
  rim.rotation.x = Math.PI / 2; rim.position.y = 2.48;
  const plinth = addSet(jarGroup, new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.15, 0.22, 20), MAT.stone));
  plinth.position.y = -0.11;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const dx = Math.cos(a), dz = Math.sin(a);
    // dragon head: gold snout + skull + jaw + horns, snout pointing out and down
    const head = new THREE.Group();
    const snout = new THREE.Mesh(new THREE.ConeGeometry(0.10, 0.5, 8), MAT.gold);
    snout.rotation.z = Math.PI / 2 + 0.28; snout.position.set(0.2, -0.04, 0); snout.castShadow = true; head.add(snout);
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), MAT.gold);
    skull.position.set(-0.06, 0.07, 0); skull.castShadow = true; head.add(skull);
    const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.12), MAT.gold);
    jaw.position.set(0.14, -0.16, 0); jaw.rotation.z = -0.25; jaw.castShadow = true; head.add(jaw);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 6), MAT.gold);
      horn.position.set(-0.12, 0.2, s * 0.07); horn.rotation.z = -0.5; horn.castShadow = true; head.add(horn);
    }
    head.position.set(dx * 0.88, 2.52, dz * 0.88);
    head.rotation.y = -a + Math.PI / 2;
    head.traverse((o) => { if (o.isMesh) { o.layers.set(0); world.push(o); } });
    jarGroup.add(head);
    jarDragonMouth.push([dx * 1.15, 2.28, dz * 1.15]);
    // frog at the base, between dragons (offset 22.5 deg)
    const b = a + Math.PI / 8, fx = Math.cos(b), fz = Math.sin(b);
    const frog = new THREE.Group();
    const fb = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 10), MAT.jade);
    fb.scale.set(1, 0.55, 1.15); fb.position.y = 0.18; fb.castShadow = true; frog.add(fb);
    const fh = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), MAT.jade);
    fh.position.set(0.12, 0.34, 0); fh.castShadow = true; frog.add(fh);
    const fm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.06, 0.16), MAT.dark);
    fm.position.set(0.28, 0.34, 0); frog.add(fm);
    frog.position.set(fx * 1.08, 0, fz * 1.08);
    frog.rotation.y = -b + Math.PI / 2;
    frog.traverse((o) => { if (o.isMesh) { o.layers.set(0); world.push(o); } });
    jarGroup.add(frog);
    jarFrogMouth.push([fx * 1.3, 0.3, fz * 1.3]);
    // the drop ball (starts in the dragon's mouth)
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), MAT.bronze);
    ball.castShadow = true; ball.layers.set(0); jarGroup.add(ball); world.push(ball);
    jarDropBalls.push(ball);
  }
}
jarGroup.visible = false;
scene.add(jarGroup);

// --- wooden cart (deck + 2 spoked wheels + pull bar) ---
const cartGroup = new THREE.Group();
const cartWheels = [];
{
  const deck = addSet(cartGroup, new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 2.8), MAT.wood));
  deck.position.y = 0.95;
  for (const s of [-1, 1]) {
    const rail = addSet(cartGroup, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.22, 2.8), MAT.wood));
    rail.position.set(s * 0.93, 1.08, 0);
  }
  for (const s of [-1, 1]) {
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.07, 10, 20), MAT.wood);
    rim.rotation.y = Math.PI / 2; rim.castShadow = true; wheel.add(rim);
    for (let k = 0; k < 6; k++) {
      const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.82, 0.05), MAT.wood);
      sp.rotation.x = (k / 6) * Math.PI; sp.castShadow = true; wheel.add(sp);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.14, 8), MAT.dark);
    hub.rotation.z = Math.PI / 2; hub.castShadow = true; wheel.add(hub);
    wheel.position.set(s * 1.07, 0.45, 0);
    wheel.traverse((o) => { if (o.isMesh) { o.layers.set(0); world.push(o); } });
    cartGroup.add(wheel);
    cartWheels.push(wheel);
  }
  const bar = addSet(cartGroup, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), MAT.wood));
  bar.rotation.x = Math.PI / 2 - 0.5; bar.position.set(0, 0.8, 1.9);
}
cartGroup.visible = false;
scene.add(cartGroup);

// --- drag rope (thin cylinder stretched between two points) ---
const ropeMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 6), MAT.rope);
ropeMesh.layers.set(NOINK); ropeMesh.visible = false; scene.add(ropeMesh);
const setRope = (a, b) => {
  const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), d = vb.clone().sub(va), len = d.length();
  ropeMesh.position.copy(va).addScaledVector(d, 0.5);
  ropeMesh.scale.set(1, len, 1);
  ropeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
};

// ---------- sky + clouds ----------
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunCol: { value: new THREE.Color() }, sunSize: { value: 0 } },
  vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }",
  fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunSize; varying vec3 vD;
  void main(){ float h = clamp(vD.y, 0.0, 1.0); vec3 c = mix(mix(hor, mid, smoothstep(0.0, 0.22, h)), top, smoothstep(0.18, 0.85, h));
    float s = max(dot(normalize(vD), sunDir), 0.0); c += sunCol * (pow(s, 12.0) * 0.35 + smoothstep(1.0 - sunSize, 1.0 - sunSize * 0.7, s) * 2.0);
    gl_FragColor = vec4(c, 1.0); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), skyMat);
sky.layers.set(NOINK); sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);
const clouds = [];
for (let i = 0; i < 10; i++) {
  const t = ctex(P.cloudCanvas(i + 3), false);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  const a = (i / 10) * Math.PI * 2 + 0.3, r = 850 + (i % 3) * 120;
  m.userData.base = [Math.cos(a) * r, 160 + (i % 4) * 45, Math.sin(a) * r - 100]; m.scale.setScalar(260 + (i % 3) * 90);
  m.layers.set(NOINK); scene.add(m); clouds.push(m);
}

// ---------- lights ----------
const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
scene.add(sun); scene.add(sun.target);

// ---------- cards ----------
const SC = 0.00225; // metres per design unit
const cards = new Map();
const drawFn = {
  front: (p, a) => T.bodyFrontX(p, a.outfit, a.opts),
  side: (p, a) => T.bodySideX(p, a.outfit, a.opts),
};
const blobTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; T.fxBlob(new T.Pen(c.getContext("2d")), "#7d7f96"); return ctex(c, false); })();
const multiply = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.ZeroFactor, blendDst: THREE.SrcColorFactor, fog: false, polygonOffset: true, polygonOffsetFactor: -2 });
const ndCardMat = (map, pullU) => new THREE.ShaderMaterial({
  uniforms: { map: { value: map }, uPull: pullU }, side: THREE.DoubleSide,
  vertexShader: "uniform float uPull; varying vec2 vUv; varying float vZ; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); float d = length(mv.xyz); mv.xyz *= max(0.15, (d - uPull) / d); vZ = -mv.z; gl_Position = projectionMatrix * mv; }",
  fragmentShader: "uniform sampler2D map; varying vec2 vUv; varying float vZ; void main(){ if (texture2D(map, vUv).a < 0.5) discard; gl_FragColor = vec4(0.0, 0.0, 0.0, vZ); }",
});
const getCard = (id, DW, DH) => {
  let c = cards.get(id);
  if (c && c.DW === DW && c.DH === DH) return c;
  if (c) { scene.remove(c.mesh); scene.remove(c.blob); }
  const sc = DW > 600 ? 1.6 : 2;
  const cv = document.createElement("canvas"); cv.width = Math.round(DW * sc); cv.height = Math.round(DH * sc);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const geo = new THREE.PlaneGeometry(DW * SC, DH * SC); geo.translate(0, (DH * SC) / 2 - 25 * SC, 0);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
  const pullU = { value: 0.3 };
  mat.customProgramCacheKey = () => "cardpull";
  mat.onBeforeCompile = (sh) => { sh.uniforms.uPull = pullU; sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uPull;").replace("#include <project_vertex>", "#include <project_vertex>\n{ float d = length(mvPosition.xyz); mvPosition.xyz *= max(0.15, (d - uPull) / d); gl_Position = projectionMatrix * mvPosition; }"); };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.order = "YXZ"; mesh.castShadow = true; mesh.layers.set(NOINK);
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  mesh.userData.nd = ndCardMat(tex, pullU);
  const bg = new THREE.PlaneGeometry(1.1, 0.55); bg.rotateX(-Math.PI / 2);
  const blob = new THREE.Mesh(bg, multiply(blobTex)); blob.layers.set(NOINK);
  scene.add(mesh); scene.add(blob);
  c = { id, DW, DH, sc, cv, g: cv.getContext("2d"), tex, mesh, blob, key: "", pullU };
  cards.set(id, c);
  return c;
};
const fxCards = new Map();
const fxDraw = {
  burst: (p, s) => T.fxBurst(p, s.t, s.col || "#fff3b0"), puff: (p, s) => T.fxPuff(p, s.t), chips: (p, s) => T.fxChips(p, s.t, s.seed || 1),
  shards: (p, s) => T.fxShards(p, s.seed || 1), pot: (p) => T.fxPot(p), bird: (p, s) => T.fxBird(p, s.t), smoke: (p, s) => T.fxSmoke(p, s.t),
  glow: (p) => T.fxGlow(p), hammer: (p) => T.fxHammerProp(p),
};
const FXSIZE = { burst: [500, 500], puff: [300, 300], chips: [400, 400], shards: [400, 200], pot: [300, 300], bird: [200, 100], smoke: [300, 600], glow: [256, 256], hammer: [420, 200] };
const getFx = (id, kind) => {
  let c = fxCards.get(id);
  if (c && c.kind === kind) return c;
  const [w, h] = FXSIZE[kind];
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, h / w), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: kind !== "glow", blending: kind === "glow" ? THREE.AdditiveBlending : THREE.NormalBlending }));
  mesh.layers.set(NOINK); scene.add(mesh);
  c = { id, kind, cv, g: cv.getContext("2d"), tex, mesh, key: "" };
  fxCards.set(id, c);
  return c;
};

// ---------- post ----------
const rtColor = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 0 });
const rtND = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
const rtPost = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType });
const ndWorld = new THREE.ShaderMaterial({
  side: THREE.DoubleSide,
  vertexShader: "varying vec3 vN; varying float vZ; void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vZ = -mv.z; gl_Position = projectionMatrix * mv; }",
  fragmentShader: "varying vec3 vN; varying float vZ; void main(){ vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n, vZ); }",
});
const FSV = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }";
const fsScene = new THREE.Scene(), fsCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const fsQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); fsQuad.frustumCulled = false; fsScene.add(fsQuad);
const inkMat = new THREE.ShaderMaterial({
  uniforms: {
    tColor: { value: rtColor.texture }, tND: { value: rtND.texture }, texel: { value: new THREE.Vector2(1 / W, 1 / H) }, px: { value: PX },
    inkCol: { value: new THREE.Color(0x0b0a0c) }, fogCol: { value: new THREE.Color() }, sat: { value: 1.08 }, expo: { value: 1 },
    lift: { value: new THREE.Vector3(0.02, 0.025, 0.05) }, gain: { value: new THREE.Vector3(1, 1, 1) }, vign: { value: 0.18 }, flash: { value: 0 }, inkK: { value: 1 }, dbg: { value: 0 },
  },
  vertexShader: FSV,
  fragmentShader: `uniform sampler2D tColor; uniform sampler2D tND; uniform vec2 texel; uniform float px; uniform vec3 inkCol; uniform vec3 fogCol;
  uniform float sat; uniform float expo; uniform vec3 lift; uniform vec3 gain; uniform float vign; uniform float flash; uniform float inkK; uniform float dbg; varying vec2 vUv;
  vec3 shoulder(vec3 x){ return mix(x, 0.78 + 0.3 * (1.0 - exp(-(x - 0.78) / 0.3)), step(0.78, x)); }
  void main(){
    vec3 c = texture2D(tColor, vUv).rgb * expo;
    vec4 nd = texture2D(tND, vUv); float zc = nd.a > 0.0 ? nd.a : 1e5; vec3 nc = nd.xyz;
    float ink = 0.0;
    if (dot(nc, nc) > 0.25 && zc < 4000.0) {
      float w = mix(5.0, 3.2, smoothstep(1.8, 4.5, log(zc))) * px;
      float bD = 99.0, bC = 99.0;
      for (int d = 0; d < 4; d++) {
        vec2 st = d == 0 ? vec2(1.0, 0.0) : d == 1 ? vec2(0.0, 1.0) : d == 2 ? vec2(0.7071, 0.7071) : vec2(0.7071, -0.7071);
        for (int s = 1; s <= 6; s++) {
          float fs = float(s);
          float fl = fs * (d > 1 ? 1.4142 : 1.0);
          if (fl > w + 1.0) break;
          vec2 o = st * texel * fs;
          vec4 a = texture2D(tND, vUv + o), b = texture2D(tND, vUv - o);
          if (a.a <= 0.0) a.a = 1e5; if (b.a <= 0.0) b.a = 1e5;
          float k = 2.0 - zc / a.a - zc / b.a;
          if (k > 0.02) bD = min(bD, fl);
          if (dot(a.xyz, a.xyz) > 0.25 && abs(a.a - zc) < zc * 0.03 && dot(a.xyz, nc) < 0.7) bC = min(bC, fl);
          if (dot(b.xyz, b.xyz) > 0.25 && abs(b.a - zc) < zc * 0.03 && dot(b.xyz, nc) < 0.7) bC = min(bC, fl);
        }
      }
      float iD = 1.0 - smoothstep(w - 0.6, w + 0.4, bD);
      float iC = (1.0 - smoothstep(w * 0.7 - 0.6, w * 0.7 + 0.4, bC)) * 0.85;
      ink = max(iD, iC) * (1.0 - smoothstep(170.0, 560.0, zc)) * inkK;
    }
    vec3 ic = mix(inkCol, fogCol * 0.55, 0.3 * smoothstep(60.0, 400.0, zc));
    c = mix(c, ic, ink);
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, sat);
    c = c * gain + lift * (1.0 - clamp(c, 0.0, 1.0));
    c = shoulder(c);
    vec2 q = (vUv - 0.5) * vec2(0.75, 1.0);
    c *= 1.0 - vign * smoothstep(0.25, 0.75, length(q));
    c = mix(c, vec3(1.0), flash);
    if (dbg > 0.5) c = vec3(ink, zc / 60.0, dot(nc, nc));
    gl_FragColor = vec4(c, 1.0);
  }`,
});
const dofMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: rtPost.texture }, tND: { value: rtND.texture }, texel: { value: new THREE.Vector2(1 / W, 1 / H) }, focus: { value: 10 }, cInf: { value: 0 }, cMax: { value: 18 } },
  vertexShader: FSV,
  fragmentShader: `uniform sampler2D tColor; uniform sampler2D tND; uniform vec2 texel; uniform float focus; uniform float cInf; uniform float cMax; varying vec2 vUv;
  float coc(float z){ z = z > 0.0 ? z : 1e5; return min(cMax, cInf * abs(1.0 - focus / max(z, 0.05))); }
  vec3 enc(vec3 c){ c = clamp(c, 0.0, 1.0); return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main(){
    vec3 c0 = texture2D(tColor, vUv).rgb;
    float cc = coc(texture2D(tND, vUv).a);
    if (cInf < 0.3 || cc < 0.6) { gl_FragColor = vec4(enc(c0), 1.0); return; }
    vec3 acc = c0; float ws = 1.0;
    for (int i = 0; i < 48; i++) {
      float fi = float(i) + 0.5, r = sqrt(fi / 48.0) * cc, a = fi * 2.39996;
      vec2 uv = vUv + vec2(cos(a), sin(a)) * r * texel;
      float cq = coc(texture2D(tND, uv).a);
      float w = clamp(cq - r + 1.0, 0.0, 1.0);
      acc += texture2D(tColor, uv).rgb * w; ws += w;
    }
    gl_FragColor = vec4(enc(acc / ws), 1.0);
  }`,
});

// ---------- per-frame ----------
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const col = (c) => new THREE.Color(c);
const applyLight = (L, S) => {
  const d = new THREE.Vector3(Math.cos(L.el * Math.PI / 180) * Math.cos(L.az * Math.PI / 180), Math.sin(L.el * Math.PI / 180), Math.cos(L.el * Math.PI / 180) * Math.sin(L.az * Math.PI / 180)).normalize();
  sun.color.setRGB(L.sun[0], L.sun[1], L.sun[2]); sun.intensity = Math.PI;
  hemi.color.setRGB(L.amb[0], L.amb[1], L.amb[2]); hemi.groundColor.setRGB(L.gnd[0], L.gnd[1], L.gnd[2]); hemi.intensity = Math.PI;
  const c = v3(S.shadow.c), r = S.shadow.r;
  sun.position.copy(c).addScaledVector(d, 200); sun.target.position.copy(c);
  const sc = sun.shadow.camera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 420; sc.updateProjectionMatrix();
  skyMat.uniforms.top.value.copy(col(L.top)).convertSRGBToLinear(); skyMat.uniforms.hor.value.copy(col(L.hor)).convertSRGBToLinear(); skyMat.uniforms.mid.value.copy(col(L.mid)).convertSRGBToLinear();
  skyMat.uniforms.sunDir.value.copy(d); skyMat.uniforms.sunCol.value.setRGB(L.sun[0] * 0.6, L.sun[1] * 0.5, L.sun[2] * 0.4); skyMat.uniforms.sunSize.value = L.disc || 0;
  scene.fog.color.copy(col(L.hor)).convertSRGBToLinear(); scene.fog.near = L.fog[0]; scene.fog.far = L.fog[1];
  inkMat.uniforms.fogCol.value.copy(scene.fog.color);
  inkMat.uniforms.sat.value = L.sat; inkMat.uniforms.expo.value = L.expo ?? 1;
  inkMat.uniforms.lift.value.set(L.lift[0], L.lift[1], L.lift[2]); inkMat.uniforms.gain.value.set(L.gain[0], L.gain[1], L.gain[2]);
  return d;
};

const camRightOf = () => { const r = new THREE.Vector3(); camera.matrixWorld.extractBasis(r, new THREE.Vector3(), new THREE.Vector3()); return r; };

window.renderFrame = (f) => {
  const S = frameState(f);
  setProgress(S.world.progress);
  shortRoad.visible = !!S.world.short;
  for (const [r, v] of [[routeLong, S.world.routeLong], [routeShort, S.world.routeShort]]) {
    r.mesh.visible = !!v && v.reveal > 0;
    if (v) { r.mat.uniforms.reveal.value = v.reveal * r.L; r.mat.uniforms.alpha.value = v.alpha ?? 1; }
  }
  // camera
  camera.position.set(...S.cam.pos); camera.up.set(0, 1, 0); camera.lookAt(...S.cam.look);
  camera.fov = S.cam.fov; camera.updateProjectionMatrix();
  if (S.cam.roll) camera.rotateZ((S.cam.roll * Math.PI) / 180);
  camera.updateMatrixWorld();
  const camR = camRightOf();
  applyLight(S.light, S);
  // set pieces
  slab.visible = !!S.world.slab;
  if (S.world.slab) { const s = S.world.slab; slab.position.set(...s.pos); slab.rotation.set(...s.rot); }
  for (const [i, m] of plug.entries()) {
    const pg = S.world.plug;
    m.visible = !!pg;
    if (!pg) continue;
    const h = m.userData.home, t = Math.max(0, pg.t), v = m.userData.vel, sp = m.userData.spin, r0 = m.userData.rot0;
    m.position.set(pg.pos[0] + h[0] + v[0] * t, Math.max(0.6, pg.pos[1] + h[1] + v[1] * t - 4.9 * t * t), pg.pos[2] + h[2] + v[2] * t);
    m.rotation.set(r0[0] + sp[0] * t, r0[1] + sp[1] * t, r0[2] + sp[2] * t);
    void i;
  }
  // --- Ancient Jar set pieces ---
  palaceGroup.visible = !S.world.rubble;
  rubbleGroup.visible = !!S.world.rubble;
  lavaGroup.visible = !!S.world.lava;
  if (S.world.jar) {
    const j = S.world.jar;
    jarGroup.visible = true;
    jarGroup.position.set(j.pos[0], j.pos[1], j.pos[2]);
    jarGroup.rotation.set(j.pitch || 0, j.rotY || 0, 0);
    const drops = j.drops || [], dropped = new Set(j.dropped || []);
    for (let i = 0; i < 8; i++) {
      const ball = jarDropBalls[i];
      const d = drops.find((x) => x.dragon === i);
      const m = jarDragonMouth[i], g = jarFrogMouth[i];
      if (!d) {
        if (dropped.has(i)) ball.position.set(g[0], g[1], g[2]);
        else ball.position.set(m[0], m[1], m[2]);
        continue;
      }
      const t = (f - d.f0) / d.dur;
      if (t <= 0) { ball.position.set(m[0], m[1], m[2]); continue; }
      if (t < 1) {
        const e = t * t;
        // bulge outward mid-fall so the ball clears the jar's belly (radius ~1.1)
        const mx = (m[0] + g[0]) / 2, mz = (m[2] + g[2]) / 2, ml = Math.hypot(mx, mz) || 1, bulge = 0.18 * Math.sin(Math.PI * t);
        ball.position.set(m[0] + (g[0] - m[0]) * e + (mx / ml) * bulge, m[1] + (g[1] - m[1]) * e, m[2] + (g[2] - m[2]) * e + (mz / ml) * bulge);
      } else {
        const bt = Math.min(1, (t - 1) / 0.45);
        const bounce = bt < 1 ? 0.14 * Math.abs(Math.sin(bt * Math.PI * 2)) * (1 - bt) : 0;
        ball.position.set(g[0], g[1] + bounce, g[2]);
      }
    }
  } else jarGroup.visible = false;
  if (S.world.cart) {
    const c = S.world.cart;
    cartGroup.visible = true;
    cartGroup.position.set(c.pos[0], c.pos[1], c.pos[2]);
    cartGroup.rotation.set(c.pitch || 0, c.rotY || 0, 0);
    const ang = (c.dist || 0) / 0.45;
    for (const w of cartWheels) w.rotation.x = ang;
  } else cartGroup.visible = false;
  if (S.world.pend !== undefined && S.world.pend !== null) { pendGroup.rotation.x = (S.world.pend * Math.PI) / 180; pendGroup.rotation.z = 0; }
  if (S.world.rope) { setRope(S.world.rope.a, S.world.rope.b); ropeMesh.visible = true; }
  else ropeMesh.visible = false;
  // cards
  const seen = new Set();
  for (const a of S.actors) {
    const DW = a.wide ? 1000 : 600, DH = a.wide ? 1150 : 1000;
    const c = getCard(a.id, DW, DH); seen.add(a.id);
    const key = a.kind + JSON.stringify(a.opts) + (a.outfitKey || "");
    if (key !== c.key) {
      c.key = key;
      c.g.setTransform(1, 0, 0, 1, 0, 0); c.g.clearRect(0, 0, c.cv.width, c.cv.height);
      c.g.setTransform(c.sc, 0, 0, c.sc, 0, 0); c.g.translate((DW - 600) / 2, DH - 1000);
      drawFn[a.kind](new T.Pen(c.g), a);
      c.tex.needsUpdate = true;
    }
    const y = a.y ?? groundAt(a.pos[0], a.pos[1], S.world.progress);
    c.mesh.position.set(a.pos[0], y + (a.lift || 0), a.pos[1]);
    const s = a.scale || 1;
    let mirror = 1;
    if (a.kind === "side" && a.dir) mirror = a.dir[0] * camR.x + a.dir[1] * camR.z < 0 ? -1 : 1;
    c.mesh.scale.set(s * mirror, s, s);
    c.mesh.rotation.set(0, Math.atan2(camera.position.x - a.pos[0], camera.position.z - a.pos[1]), ((a.roll || 0) * Math.PI) / 180);
    c.mesh.material.color.setRGB(...S.light.card);
    c.pullU.value = a.pull ?? 0.3;
    c.mesh.visible = a.visible !== false;
    c.blob.visible = a.visible !== false && a.blob !== false && !a.lift;
    c.blob.position.set(a.pos[0], groundAt(a.pos[0], a.pos[1], S.world.progress) + 0.03, a.pos[1]);
    c.blob.scale.setScalar(s);
    c.blob.rotation.y = c.mesh.rotation.y;
  }
  for (const [id, c] of cards) if (!seen.has(id)) { c.mesh.visible = false; c.blob.visible = false; }
  // fx
  const seenFx = new Set();
  for (const e of (window.NOFX ? [] : S.fx)) {
    const c = getFx(e.id, e.kind); seenFx.add(e.id);
    const key = JSON.stringify([e.t, e.seed, e.col]);
    if (key !== c.key) {
      c.key = key; c.g.setTransform(1, 0, 0, 1, 0, 0); c.g.clearRect(0, 0, c.cv.width, c.cv.height);
      fxDraw[e.kind](new T.Pen(c.g), e); c.tex.needsUpdate = true;
    }
    c.mesh.position.set(...e.pos);
    if (e.flat) { c.mesh.rotation.set(-Math.PI / 2, 0, e.rot || 0); }
    else { c.mesh.quaternion.copy(camera.quaternion); if (e.rot) c.mesh.rotateZ(e.rot); }
    c.mesh.scale.set(e.size * (e.mirror ? -1 : 1), e.size, e.size);
    c.mesh.material.opacity = e.alpha ?? 1;
    c.mesh.material.color.setRGB(...(e.kind === "glow" ? [1, 1, 1] : S.light.card));
    c.mesh.visible = true;
  }
  for (const [id, c] of fxCards) if (!seenFx.has(id)) c.mesh.visible = false;
  // clouds drift
  for (const [i, m] of clouds.entries()) { const b = m.userData.base; m.position.set(b[0] + f * 0.25 * (1 + (i % 3) * 0.3), b[1], b[2]); m.quaternion.copy(camera.quaternion); m.material.color.setRGB(...S.light.cloud); }
  sky.position.copy(camera.position);

  // pass 1: colour
  renderer.shadowMap.enabled = true; renderer.shadowMap.needsUpdate = true;
  renderer.setRenderTarget(rtColor); renderer.setClearColor(0x000000, 1); renderer.clear();
  renderer.render(scene, camera);
  // pass 2: normal + depth (world inked, cards = depth only, everything else hidden)
  const hidden = [], swapped = [];
  scene.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    if (o.userData.nd) { swapped.push([o, o.material]); o.material = o.userData.nd; }
    else if (world.includes(o)) { swapped.push([o, o.material]); o.material = ndWorld; }
    else { hidden.push(o); o.visible = false; }
  });
  const fog = scene.fog; scene.fog = null; renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rtND); renderer.setClearColor(0x000000, 0); renderer.clear();
  renderer.render(scene, camera);
  scene.fog = fog;
  for (const [o, m] of swapped) o.material = m;
  for (const o of hidden) o.visible = true;
  // pass 3: ink + grade
  inkMat.uniforms.dbg.value = window.INKDBG ? 1 : 0;
  inkMat.uniforms.flash.value = S.flash || 0; inkMat.uniforms.vign.value = S.vign ?? 0.18;
  fsQuad.material = inkMat; renderer.setRenderTarget(rtPost); renderer.render(fsScene, fsCam);
  // pass 4: lens blur -> screen
  dofMat.uniforms.focus.value = S.dof.focus; dofMat.uniforms.cInf.value = window.NODOF ? 0 : S.dof.cInf * PX;
  fsQuad.material = dofMat; renderer.setRenderTarget(null); renderer.render(fsScene, fsCam);
  return canvas.toDataURL("image/jpeg", 0.95);
};
window.TOTAL = TOTAL;
window.dbgND = () => { const out = []; const buf = new Float32Array(4); for (const [x, y] of [[540, 1700], [540, 1200], [540, 900], [540, 700], [300, 300], [800, 1500]]) { renderer.readRenderTargetPixels(rtND, x, y, 1, 1, buf); out.push([x, y, ...Array.from(buf).map((v) => +v.toFixed(3))]); } return JSON.stringify(out); };
window.ready = true;
