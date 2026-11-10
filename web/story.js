// Staging for "The Ancient Jar" (Bhookamp Batane Wala Prachin Ghada): every value is a pure function of the frame number.
// 132 AD ancient China, inventor Zhang Heng, the Emperor ("Samrat"), a bronze seismoscope jar with 8 golden
// dragons + bronze balls + stone frogs. Same kit engine as the Mountain Man; the Jar world replaces the ridge
// village: palace hall (0, 95), courtyard (0, 62), gate (0, 38), hill (0, 0), mechanism dome (22, 95),
// lava crack (0, 28). 18-line Hindi voiceover, 93.02 s, TOTAL 2790 frames @ 30 fps.
//
// PORTRAIT STAGING (9:16, horizontal half-FOV ~11.5 deg): frame width at distance D is ~0.4*D, so a group
// spanning W metres needs the camera ~2.5*W back; a single card (1.35 m wide) needs ~3.5 m, the 2.2 m jar
// ~8-9 m. Palace cameras sit INSIDE the hall (z 86-104; the south wall at z=105 blocks anything behind it).
// The seated emperor sits ON the throne cushion (y=1.35): the sit-mode figure's torso is buried in the seat
// box at y=0.6. Ball drops fall on the SOUTH side of the jar (dragons 0-3) except the last three (dragons
// 5-7, north side) and dragon 4 (north-west) -- each drop shot is staged from the side its balls fall on.
import { clamp, lin, smooth, smoother, easeOut, easeIn, easeInOut, back, spring, lerp, lerp3, add3, catmull, camKeys, kick, blinkAt, idle, q } from "./motion.js";
import { groundAt, chanEnd, floorH, terrainH } from "./terrain.js";
import { INVENTOR, EMPEROR, GUARD, COURT_1, COURT_2, COURT_3 } from "./castdefs.js";

export const FPS = 30, TOTAL = 2790;

// ---------------- world layout ----------------
// City (golden-roof buildings, kind 3) around the palace/courtyard; rice paddies beyond.
const houses = [];
{
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const rowL = [[-16, 56, 3], [-17, 70, 3], [-16, 84, 0], [-17, 112, 3], [-16, 122, 3], [-15, 46, 0]];
  const rowR = [[16, 56, 3], [17, 70, 0], [16, 84, 3], [17, 112, 0], [16, 122, 3], [15, 46, 3]];
  for (const [x, z, k] of rowL) houses.push([x, z, 5.5 + r() * 2, 4.5 + r() * 1.5, 3.0 + r() * 0.5, Math.PI / 2, k, r() < 0.4]);
  for (const [x, z, k] of rowR) houses.push([x, z, 5.5 + r() * 2, 4.5 + r() * 1.5, 3.0 + r() * 0.5, -Math.PI / 2, k, r() < 0.4]);
  houses.push([-11, 130, 6, 5, 3.2, 0, 3, false], [11, 130, 6, 5, 3.2, 0, 0, false]);
  houses.push([-24, 64, 5, 4.5, 3.0, Math.PI / 2, 0, false], [24, 66, 5, 4.5, 3.0, -Math.PI / 2, 3, false]);
}
export const VILLAGE = {
  houses,
  palms: [[-22, 52, 9], [22, 54, 8.5], [-24, 100, 10], [24, 108, 9], [-30, 70, 9.5], [30, 80, 9]],
  trees: [[-8, 48, 2.6, 2.4], [20, 66, 3, 2.8], [-20, 112, 2.8, 2.6], [40, 90, 3.2, 3], [-42, 60, 3, 2.8], [55, 70, 2.6, 2.4], [-50, 120, 2.8, 2.6], [70, -40, 3, 2.8], [-50, -48, 2.8, 2.6]],
  hay: [[-20, 64, 1], [20, 68, 0.9]],
  fields: [[85, 95, 70, 55, 1, 0.05], [-90, 100, 75, 60, 0, -0.04], [80, 150, 60, 45, 0, 0.1], [-85, 160, 70, 50, 1, 0], [60, -60, 80, 55, 0, 0.08], [-70, -70, 90, 60, 0, -0.05], [170, -40, 60, 70, 0, 0.1]],
};
// Path: palace (z 105) -> courtyard (z 62) -> gate (z 38) -> hill (z 4).
export const LANE = [[0.5, 104], [0.4, 84], [0.3, 62], [0.4, 46], [0.5, 38], [0.4, 24], [0.3, 12], [0.2, 4]];
export const ROAD = [[0.5, 104], [0.4, 84], [0.3, 62], [0.4, 46], [0.5, 38], [0.4, 24], [0.3, 12], [0.2, 4]];
export const SHORT = [[0.5, 60], [0.4, 40], [0.3, 20], [0.2, 4]];
export const CLINIC = [200, -200, 0.3]; // unused for the Jar; parked far away
export const MAPCAM = { pos: [0, 320, 60], look: [0, 0, 60], fov: 50 };

// ---------------- light presets ----------------
const LP = {
  day: { az: 112, el: 50, sun: [1.2, 1.12, 0.97], amb: [0.36, 0.37, 0.46], gnd: [0.32, 0.27, 0.2], top: "#3f80d4", mid: "#8fb7e6", hor: "#c4d8ee", fog: [120, 1300], sat: 1.1, lift: [0.02, 0.025, 0.05], gain: [1, 1, 1], card: [1, 1, 1], cloud: [1, 1, 1], disc: 0 },
  morning: { az: 28, el: 20, sun: [1.38, 1.04, 0.74], amb: [0.34, 0.34, 0.47], gnd: [0.3, 0.24, 0.19], top: "#4f8ad8", mid: "#a6c3e4", hor: "#f0dcbc", fog: [110, 1200], sat: 1.12, lift: [0.025, 0.02, 0.05], gain: [1.02, 1, 0.97], card: [1.03, 0.98, 0.93], cloud: [1, 0.93, 0.86], disc: 0.003 },
  golden: { az: 168, el: 10, sun: [1.62, 0.98, 0.52], amb: [0.31, 0.28, 0.48], gnd: [0.27, 0.21, 0.19], top: "#6d7cc4", mid: "#e6a98e", hor: "#ffcf8e", fog: [90, 1100], sat: 1.14, lift: [0.03, 0.02, 0.06], gain: [1.04, 0.99, 0.94], card: [1.06, 0.94, 0.82], cloud: [1, 0.84, 0.72], disc: 0.004 },
  night: { az: 135, el: 42, sun: [0.45, 0.55, 0.85], amb: [0.22, 0.26, 0.42], gnd: [0.1, 0.11, 0.18], top: "#101d42", mid: "#26396a", hor: "#3d5480", fog: [80, 900], sat: 0.85, lift: [0.015, 0.025, 0.055], gain: [0.96, 1, 1.08], card: [0.62, 0.68, 0.92], cloud: [0.38, 0.45, 0.63], disc: 0 },
  memory: { az: 160, el: 13, sun: [1.0, 0.66, 0.58], amb: [0.23, 0.25, 0.43], gnd: [0.15, 0.14, 0.21], top: "#2a3a72", mid: "#7c6f96", hor: "#d29a84", fog: [80, 900], sat: 0.7, lift: [0.03, 0.03, 0.07], gain: [1, 0.97, 1.02], card: [0.85, 0.79, 0.88], cloud: [0.72, 0.6, 0.7], disc: 0.003 },
  palace: { az: 55, el: 32, sun: [1.35, 1.05, 0.72], amb: [0.38, 0.34, 0.42], gnd: [0.3, 0.24, 0.2], top: "#5a6a9a", mid: "#c8a06a", hor: "#e8c88a", fog: [90, 1100], sat: 1.1, lift: [0.03, 0.02, 0.05], gain: [1.02, 0.99, 0.95], card: [1.04, 0.97, 0.9], cloud: [1, 0.94, 0.85], disc: 0 },
  dusk: { az: 250, el: 8, sun: [0.9, 0.55, 0.9], amb: [0.18, 0.2, 0.36], gnd: [0.1, 0.1, 0.18], top: "#1a2448", mid: "#4a3a6a", hor: "#c86a4a", fog: [70, 900], sat: 0.9, lift: [0.02, 0.02, 0.05], gain: [0.98, 1, 1.05], card: [0.7, 0.72, 0.9], cloud: [0.5, 0.45, 0.6], disc: 0.004 },
  quake: { az: 200, el: 15, sun: [1.2, 0.5, 0.25], amb: [0.2, 0.18, 0.3], gnd: [0.12, 0.1, 0.14], top: "#101020", mid: "#3a2438", hor: "#e06a28", fog: [60, 800], sat: 0.95, lift: [0.02, 0.02, 0.04], gain: [1.02, 0.98, 0.95], card: [0.85, 0.8, 0.85], cloud: [0.4, 0.3, 0.35], disc: 0 },
};
const hexMix = (a, b, t) => { const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16); const ch = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t).toString(16).padStart(2, "0"); return `#${ch(16)}${ch(8)}${ch(0)}`; };
const blendL = (a, b, t) => {
  const o = {};
  for (const k of Object.keys(a)) {
    const x = a[k], y = b[k];
    o[k] = typeof x === "string" ? hexMix(x, y, t) : Array.isArray(x) ? x.map((v, i) => lerp(v, y[i], t)) : lerp(x, y, t);
  }
  let d = b.az - a.az; if (d > 180) d -= 360; if (d < -180) d += 360; o.az = a.az + d * t;
  return o;
};
const lightSeq = (seq, f) => {
  if (f <= seq[0][0]) return LP[seq[0][1]];
  for (let i = 0; i < seq.length - 1; i++) if (f <= seq[i + 1][0]) return blendL(LP[seq[i][1]], LP[seq[i + 1][1]], smooth(lin(seq[i][0], seq[i + 1][0], f)));
  return LP[seq[seq.length - 1][1]];
};

// ---------------- helpers ----------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dist = (a, b) => Math.hypot(...sub(a, b));
const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const camRight = (c) => norm(cross(sub(c.look, c.pos), [0, 1, 0]));
const camUp = (c) => norm(cross(camRight(c), sub(c.look, c.pos)));
const lightAng = (c, L, mirror = 1) => {
  const d = [Math.cos(L.el * Math.PI / 180) * Math.cos(L.az * Math.PI / 180), Math.sin(L.el * Math.PI / 180), Math.cos(L.el * Math.PI / 180) * Math.sin(L.az * Math.PI / 180)];
  const r = camRight(c), u = camUp(c);
  const sx = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) * mirror, sy = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  return q(Math.atan2(-Math.max(0.25, sy), sx), 0.35);
};
const mirrorOf = (c, dir) => { const r = camRight(c); return dir[0] * r[0] + dir[1] * r[2] < 0 ? -1 : 1; };
const ext = (f, a, b) => f >= a && f < b;
const ht = (x, z, p) => groundAt(x, z, p);
let CAMNOW = null;
const pullTo = (p, d = 0.9) => { if (!CAMNOW) return p; const v = sub(CAMNOW.pos, p), l = Math.hypot(...v) || 1; return add3(p, v.map((x) => (x * Math.min(d, l * 0.5)) / l)); };
const walkPhase = (d) => q(d / 1.25, 1 / 24);
// Ball-drop entries for the jar world state. Dragon 2 faces south (the usual camera);
// dragons 1 and 3 flank it. Continuity: each shot lists which balls are already gone.
const drop = (dragon, f0, dur = 27) => ({ dragon, f0, dur });
const jarAt = (x, z, opts = {}) => ({ pos: [x, 0, z], rotY: 0, dropped: [], drops: [], ...opts });
// Cart state: pos [x, y, z], rotY (PI = pull bar to the north), dist (cumulative metres, wheels turn),
// pitch (rad, positive when the ground rises toward the north, so the deck follows the slope).
const cartAt = (x, z, dist, p = 0, rotY = Math.PI) => {
  const y = ht(x, z, p);
  const pitch = Math.atan((ht(x, z - 1.4, p) - ht(x, z + 1.4, p)) / 2.8);
  return { pos: [x, y, z], rotY, dist, pitch };
};
// The jar riding on the cart: jar base sits on the deck top (cart y + 1.13), pitched with the cart.
const jarOnCart = (c, opts = {}) => ({ pos: [c.pos[0], c.pos[1] + 1.13, c.pos[2]], rotY: 0, pitch: c.pitch || 0, dropped: [], drops: [], ...opts });
// The drag rope: from the inventor's back (he walks north, facing away from the cart) to the
// cart's pull-bar tip (2.6 m north of the cart centre, ~0.45 m up). The inventor walks 4.2 m
// north of the cart centre, so the rope is ~1.3 m long and taut.
const ropeFor = (invZ, z) => {
  const invY = ht(0, invZ, 0), cartY = ht(0, z, 0);
  return { a: [0, invY + 1.05, invZ + 0.3], b: [0, cartY + 0.45, z - 2.6] };
};

// ---------------- shots ----------------
const SHOTS = [];
const shot = (id, a, b, fn) => SHOTS.push({ id, a, b, fn });

// ---- L01 (0-214) "places a ball, tells the emperor" ----
// 1a hook (0-107): palace, the inventor places a ball in the dragon's mouth. Camera in the
// south-east corner of the hall (inside; the south wall at z=105 blocks anything behind it).
shot("hook", 0, 108, (f) => {
  const cam = camKeys([
    { f: 0, pos: [9.5, 2.6, 103.5], look: [3.0, 1.6, 97.2], fov: 44 },
    { f: 108, pos: [9, 2.5, 103], look: [3.0, 1.6, 97.2], fov: 43, ease: (t) => t },
  ], f);
  CAMNOW = cam;
  const L = LP.palace, id = idle(f, 21);
  const actors = [
    { id: "inv", kind: "front", outfit: INVENTOR, pos: [1.2, 97.5], opts: { expr: f < 70 ? "neutral" : "stern", armR: "point", blink: blinkAt(f, 21), seed: 21, light: -2.2, tilt: q(id.tilt * 0.6, 0.5) } },
  ];
  const fx = [];
  if (f >= 60 && f < 75) fx.push({ id: "spark", kind: "burst", pos: pullTo([4.2, 2.3, 98.0]), size: 0.9, t: q((f - 60) / 15, 0.07), col: "#ffe08a" });
  return { cam, L, actors, fx, p: 0, world: { jar: jarAt(4, 97) }, kicks: [{ f: 60, a: 0.008 }], dof: { focus: dist(cam.pos, [3, 1.5, 97]), cInf: 9 }, shadow: { c: [3, 0, 97], r: 12 } };
});

// 1b throne (108-214): the inventor points at the emperor on his throne. Camera north in the
// hall looking south; the emperor sits ON the cushion (y=1.35) so his torso clears the seat.
shot("throne", 108, 215, (f) => {
  const cam = camKeys([
    { f: 108, pos: [-2.5, 2.4, 92.5], look: [-1.0, 1.9, 101.5], fov: 40 },
    { f: 215, pos: [-2.4, 2.3, 93], look: [-1.0, 1.85, 101.5], fov: 39, ease: (t) => t },
  ], f);
  const L = LP.palace;
  const actors = [
    { id: "emp", kind: "front", outfit: EMPEROR, pos: [0, 102.4], y: 1.35, scale: 1.25, opts: { mode: "sit", expr: "neutral", blink: blinkAt(f, 22), seed: 22, light: -2.2 } },
    { id: "inv", kind: "front", outfit: INVENTOR, pos: [-2.6, 99.5], opts: { expr: f < 160 ? "neutral" : "stern", armL: "point", blink: blinkAt(f, 21), seed: 21, light: -2.2 } },
  ];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [-1.0, 1.8, 101]), cInf: 8 }, shadow: { c: [0, 0, 99], r: 14 } };
});

// ---- L02 (215-273) "the whole court burst out laughing" ----
// Wide group shot from the north end of the hall (the only way to fit 4 people in 9:16).
shot("laugh1", 215, 274, (f) => {
  const cam = camKeys([
    { f: 215, pos: [-0.5, 2.6, 90], look: [-0.5, 1.8, 100.5], fov: 44 },
    { f: 274, pos: [-0.5, 2.5, 90.5], look: [-0.5, 1.75, 100.5], fov: 43, ease: (t) => smooth(t) },
  ], f);
  const L = LP.palace;
  const laugh = f >= 232, bounce = (s) => (laugh ? q(4 * Math.sin((f - 232) * 1.05 + s), 1) : 0);
  const actors = [
    { id: "emp", kind: "front", outfit: EMPEROR, pos: [0, 102.4], y: 1.35, scale: 1.25, opts: { mode: "sit", expr: laugh ? "laugh" : "neutral", blink: blinkAt(f, 22), seed: 22, light: -2.2, tilt: bounce(1), bob: laugh ? q(Math.abs(Math.sin((f - 232) * 0.52)) * -6, 1) : 0 } },
    { id: "inv", kind: "front", outfit: INVENTOR, pos: [-1.8, 99], opts: { expr: "nervous", blink: blinkAt(f, 21), seed: 21, light: -2.2 } },
    { id: "c1", kind: "front", outfit: COURT_1, pos: [1.6, 100], opts: { expr: laugh ? "laugh" : "smile", armL: laugh ? "belly" : "hang", armR: laugh ? "belly" : "hang", blink: blinkAt(f, 24), seed: 24, light: -2.2, tilt: bounce(2) } },
    { id: "c2", kind: "front", outfit: COURT_2, pos: [-2.4, 100], opts: { expr: laugh ? "laugh" : "smile", armL: laugh ? "belly" : "hang", blink: blinkAt(f, 25), seed: 25, light: -2.2, tilt: bounce(3) } },
  ];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [-0.5, 1.7, 100]), cInf: 10 }, shadow: { c: [0, 0, 99], r: 14 } };
});

// ---- L03 (274-587) "look at the jar: 8 dragons, balls, a frog" ----
// 3a jar pan (274-378): from the south-east corner, the whole jar + rim + dragons in frame.
shot("jarpan", 274, 379, (f) => {
  const cam = { pos: [9.5, 2.6, 103.5], look: [4, 1.7, 97], fov: 44 };
  return { cam, L: LP.palace, actors: [], fx: [], p: 0, world: { jar: jarAt(4, 97) }, kicks: [], dof: { focus: 9.9, cInf: 4 }, shadow: { c: [4, 0, 97], r: 8 } };
});
// 3b jar push-in (379-482): push in on the dragons + balls.
shot("jarpush", 379, 483, (f) => {
  const t = smooth(lin(379, 483, f));
  const cam = { pos: lerp3([9, 2.4, 102.5], [8.5, 2.3, 102], t), look: [4, 1.8, 97], fov: lerp(42, 41, t) };
  return { cam, L: LP.palace, actors: [], fx: [], p: 0, world: { jar: jarAt(4, 97) }, kicks: [], dof: { focus: dist(cam.pos, [4, 1.8, 97]), cInf: 3 }, shadow: { c: [4, 0, 97], r: 8 } };
});
// 3c jar tilt to frogs (483-587): tilt down to the frogs at the base.
shot("jarfrogs", 483, 588, (f) => {
  const t = smooth(lin(483, 588, f));
  const cam = { pos: lerp3([8.5, 1.6, 102], [8.5, 1.2, 101], t), look: lerp3([4, 1.2, 97], [4, 0.35, 97], t), fov: lerp(42, 40, t) };
  return { cam, L: LP.palace, actors: [], fx: [], p: 0, world: { jar: jarAt(4, 97) }, kicks: [], dof: { focus: dist(cam.pos, [4, 0.4, 97]), cInf: 3 }, shadow: { c: [4, 0, 97], r: 8 } };
});

// ---- L04 (588-785) "the emperor had the biggest army" ----
// 4a courtyard army (588-686): from the palace doorway looking north over the courtyard.
shot("army", 588, 687, (f) => {
  const cam = camKeys([
    { f: 588, pos: [0, 3.2, 90], look: [0, 1.8, 64], fov: 42 },
    { f: 687, pos: [0, 3.1, 89], look: [0, 1.75, 64], fov: 41, ease: (t) => t },
  ], f);
  const L = LP.day;
  const actors = [
    { id: "emp", kind: "front", outfit: EMPEROR, pos: [0, 63], opts: { expr: "stern", armR: "point", blink: blinkAt(f, 22), seed: 22, light: -2.2 } },
    { id: "g1", kind: "front", outfit: GUARD, pos: [-3, 64.5], opts: { expr: "stern", blink: blinkAt(f, 23), seed: 23, light: -2.2 } },
    { id: "g2", kind: "front", outfit: GUARD, pos: [3, 64.5], opts: { expr: "stern", blink: blinkAt(f, 27), seed: 27, light: -2.2 } },
    { id: "g3", kind: "front", outfit: GUARD, pos: [-4.5, 67], opts: { expr: "neutral", blink: blinkAt(f, 28), seed: 28, light: -2.2 } },
    { id: "g4", kind: "front", outfit: GUARD, pos: [4.5, 67], opts: { expr: "neutral", blink: blinkAt(f, 29), seed: 29, light: -2.2 } },
  ];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [0, 1.6, 64]), cInf: 10 }, shadow: { c: [0, 0, 64], r: 16 } };
});
// 4b throne point (687-785): the emperor points, the inventor bows.
shot("thronepoint", 687, 786, (f) => {
  const cam = camKeys([
    { f: 687, pos: [-2.5, 2.4, 92.5], look: [-1.0, 1.9, 101.5], fov: 40 },
    { f: 786, pos: [-2.4, 2.3, 93], look: [-1.0, 1.85, 101.5], fov: 39, ease: (t) => smooth(t) },
  ], f);
  const L = LP.palace;
  const bow = smoother(lin(700, 730, f));
  const actors = [
    { id: "emp", kind: "front", outfit: EMPEROR, pos: [0, 102.4], y: 1.35, scale: 1.25, opts: { mode: "sit", expr: "stern", armR: "point", blink: blinkAt(f, 22), seed: 22, light: -2.2 } },
    { id: "inv", kind: "front", outfit: INVENTOR, pos: [-2.6, 99.5], opts: { expr: "nervous", blink: blinkAt(f, 21), seed: 21, light: -2.2, tilt: q(bow * 22, 0.5) } },
  ];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [-1, 1.8, 101]), cInf: 8 }, shadow: { c: [0, 0, 99], r: 14 } };
});

// ---- L05 (786-913) "one ball fell, but nothing happened" ----
// Jar-only shot from the south-east corner; dragon 2's frog is at (3.5, 0.3, 98.2).
shot("ball1", 786, 914, (f) => {
  const cam = camKeys([
    { f: 786, pos: [9.5, 2.3, 103], look: [4, 1.4, 97], fov: 42 },
    { f: 846, pos: [9, 2.1, 102], look: [4, 1.3, 97], fov: 40, ease: (t) => t },
    { f: 914, pos: [9, 2.1, 102], look: [4, 1.3, 97], fov: 40, ease: (t) => t },
  ], f);
  CAMNOW = cam;
  const L = LP.palace;
  const fx = [];
  if (f >= 846 && f < 846 + 9) fx.push({ id: "tink", kind: "burst", pos: pullTo([3.5, 0.45, 98.2]), size: 0.8, t: q((f - 846 + 1) / 9, 0.11), col: "#ffe08a" });
  return { cam, L, actors: [], fx, p: 0, world: { jar: jarAt(4, 97, { drops: [drop(2, 846)] }) }, kicks: [{ f: 846, a: 0.014 }], dof: { focus: dist(cam.pos, [4, 1.2, 97]), cInf: 3 }, shadow: { c: [4, 0, 97], r: 8 } };
});

// ---- L06 (914-1010) "not a ripple in the emperor's wine" ----
// Big close-up: the emperor's face fills the frame, the wine cup below.
shot("wine", 914, 1011, (f) => {
  const t = smooth(lin(914, 1011, f));
  const cam = { pos: lerp3([0.3, 2.3, 99.8], [0.25, 2.25, 99.4], t), look: [0, 2.4, 102.4], fov: lerp(30, 29, t) };
  const L = LP.palace;
  const actors = [{ id: "emp", kind: "front", outfit: EMPEROR, pos: [0, 102.4], y: 1.35, scale: 1.6, opts: { mode: "sit", expr: f < 960 ? "laugh" : "neutral", blink: blinkAt(f, 22), seed: 22, light: -2.2 } }];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [0, 2.4, 102.4]), cInf: 2 }, shadow: { c: [0, 0, 101], r: 8 } };
});

// ---- L07 (1011-1074) "now they laughed even harder" ----
shot("laugh2", 1011, 1075, (f) => {
  const cam = camKeys([
    { f: 1011, pos: [-0.5, 2.6, 90], look: [-0.5, 1.8, 100.5], fov: 44 },
    { f: 1075, pos: [-0.5, 2.5, 90.5], look: [-0.5, 1.75, 100.5], fov: 43, ease: (t) => smooth(t) },
  ], f);
  const L = LP.palace;
  const bounce = (s) => q(5 * Math.sin((f - 1011) * 1.15 + s), 1);
  const actors = [
    { id: "c1", kind: "front", outfit: COURT_1, pos: [1.6, 100], opts: { expr: "laugh", armL: "belly", armR: "belly", blink: blinkAt(f, 24), seed: 24, light: -2.2, tilt: bounce(1) } },
    { id: "c2", kind: "front", outfit: COURT_2, pos: [-2.4, 100], opts: { expr: "laugh", armL: "belly", armR: "belly", blink: blinkAt(f, 25), seed: 25, light: -2.2, tilt: bounce(2) } },
    { id: "emp", kind: "front", outfit: EMPEROR, pos: [0, 102.4], y: 1.35, scale: 1.25, opts: { mode: "sit", expr: "laugh", blink: blinkAt(f, 22), seed: 22, light: -2.2, tilt: bounce(3) } },
    { id: "inv", kind: "front", outfit: INVENTOR, pos: [-1.8, 99], opts: { expr: "nervous", blink: blinkAt(f, 21), seed: 21, light: -2.2 } },
  ];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [-0.5, 1.7, 100]), cInf: 10 }, shadow: { c: [0, 0, 99], r: 14 } };
});

// ---- L08 (1075-1301) "exiled with the jar" ----
// 8a palace drag (1075-1188): the inventor drags the cart out of the hall, guards flank him.
// Cart z 99 -> 91 (8 m at ~2.1 m/s, a weary walk); the inventor walks 4.2 m north of the cart.
shot("exile1", 1075, 1189, (f) => {
  const t = lin(1075, 1189, f);
  const z = lerp(99, 91, t), cdist = (99 - z);
  const cart = cartAt(0, z, cdist);
  const invZ = z - 4.2;
  const cam = { pos: [7, 2.8, z + 5], look: [0, 1.5, z - 2.1], fov: 46 };
  CAMNOW = cam;
  const L = LP.palace, mir = mirrorOf(cam, [0, -1]);
  const actors = [
    { id: "inv", kind: "side", wide: true, outfit: INVENTOR, pos: [0, invZ], dir: [0, -1], opts: { mode: "walk", phase: walkPhase(94.8 - invZ), expr: "pained", seed: 21, light: lightAng(cam, L, mir), lean0: 14 } },
    { id: "g1", kind: "side", outfit: GUARD, pos: [-1.5, z - 0.5], dir: [0, -1], opts: { mode: "walk", phase: walkPhase((99 - (z - 0.5)) + 0.4), expr: "stern", seed: 23, light: lightAng(cam, L, mir) } },
    { id: "g2", kind: "side", outfit: GUARD, pos: [1.5, z - 0.5], dir: [0, -1], opts: { mode: "walk", phase: walkPhase((99 - (z - 0.5)) + 0.9), expr: "stern", seed: 27, light: lightAng(cam, L, mir) } },
  ];
  return { cam, L, actors, fx: [], p: 0, world: { cart, jar: jarOnCart(cart, { dropped: [2] }), rope: ropeFor(invZ, z) }, kicks: [], dof: { focus: dist(cam.pos, [0, 1.4, z - 2.1]), cInf: 10 }, shadow: { c: [0, 0, z], r: 16 } };
});
// 8b courtyard drag (1189-1301): the same procession crosses the courtyard, z 88 -> 80.
shot("exile2", 1189, 1302, (f) => {
  const t = lin(1189, 1302, f);
  const z = lerp(88, 80, t), cdist = 8 + (88 - z);
  const cart = cartAt(0, z, cdist);
  const invZ = z - 4.2;
  const cam = { pos: [7, 2.8, z + 5], look: [0, 1.5, z - 2.1], fov: 46 };
  CAMNOW = cam;
  const L = LP.day, mir = mirrorOf(cam, [0, -1]);
  const actors = [
    { id: "inv", kind: "side", wide: true, outfit: INVENTOR, pos: [0, invZ], dir: [0, -1], opts: { mode: "walk", phase: walkPhase(8 + (83.8 - invZ)), expr: "pained", seed: 21, light: lightAng(cam, L, mir), lean0: 14 } },
    { id: "g1", kind: "side", outfit: GUARD, pos: [-1.5, z - 0.5], dir: [0, -1], opts: { mode: "walk", phase: walkPhase(8 + (88 - (z - 0.5)) + 0.4), expr: "stern", seed: 23, light: lightAng(cam, L, mir) } },
    { id: "g2", kind: "side", outfit: GUARD, pos: [1.5, z - 0.5], dir: [0, -1], opts: { mode: "walk", phase: walkPhase(8 + (88 - (z - 0.5)) + 0.9), expr: "stern", seed: 27, light: lightAng(cam, L, mir) } },
  ];
  return { cam, L, actors, fx: [], p: 0, world: { cart, jar: jarOnCart(cart, { dropped: [2] }), rope: ropeFor(invZ, z) }, kicks: [], dof: { focus: dist(cam.pos, [0, 1.4, z - 2.1]), cInf: 10 }, shadow: { c: [0, 0, z], r: 16 } };
});

// ---- L09 (1302-1493) "dragged the jar up a hill, lived alone" ----
// 9a hill climb (1302-1398): the cart climbs the steep hill foot, z 20 -> 12 (8 m, the deck
// pitched to the slope so the wheels stay on the ground).
shot("hillclimb", 1302, 1399, (f) => {
  const t = lin(1302, 1399, f);
  const z = lerp(20, 12, t), cdist = 16 + (20 - z);
  const cart = cartAt(0, z, cdist);
  const invZ = z - 4.2;
  const cam = { pos: [9, ht(0, z + 8, 0) + 2.6, z + 9], look: [0, ht(0, z, 0) + 1.4, z - 2.1], fov: 44 };
  CAMNOW = cam;
  const L = LP.golden, mir = mirrorOf(cam, [0, -1]);
  const actors = [{ id: "inv", kind: "side", wide: true, outfit: INVENTOR, pos: [0, invZ], dir: [0, -1], opts: { mode: "walk", phase: walkPhase(16 + (15.8 - invZ)), expr: "pained", seed: 21, light: lightAng(cam, L, mir), lean0: 16 } }];
  return { cam, L, actors, fx: [], p: 0, world: { cart, jar: jarOnCart(cart, { dropped: [2] }), rope: ropeFor(invZ, z) }, kicks: [], dof: { focus: dist(cam.pos, [0, ht(0, z, 0) + 1.4, z - 2.1]), cInf: 10 }, shadow: { c: [0, 0, z], r: 16 } };
});
// 9b night hill (1399-1493): the inventor pants by the jar on the hilltop, lantern glowing.
shot("hillnight", 1399, 1494, (f) => {
  const cam = camKeys([
    { f: 1399, pos: [4.5, ht(0, 12, 0) + 3.2, 15], look: [-0.7, ht(0, 6, 0) + 1.5, 6.5], fov: 38 },
    { f: 1494, pos: [4.3, ht(0, 12, 0) + 3.1, 14.5], look: [-0.7, ht(0, 6, 0) + 1.5, 6.5], fov: 37, ease: (t) => t },
  ], f);
  const L = LP.night;
  const actors = [{ id: "inv", kind: "front", outfit: INVENTOR, pos: [-1.8, 7.5], scale: 1.3, opts: { expr: "pained", blink: blinkAt(f, 21), seed: 21, light: -2.2, tilt: q(6 * Math.sin(f * 0.09), 0.5) } }];
  const fx = [{ id: "lamp", kind: "glow", pos: [2.2, ht(2.2, 7.5, 0) + 0.8, 7.5], size: 5, alpha: 0.9 }];
  const cart = cartAt(0, 6, 24);
  return { cam, L, actors, fx, p: 0, world: { cart, jar: jarOnCart(cart, { dropped: [2] }) }, kicks: [], dof: { focus: dist(cam.pos, [0, ht(0, 6, 0) + 1.4, 6]), cInf: 8 }, shadow: { c: [0, 0, 7], r: 12 } };
});

// ---- L10 (1494-1660) "one ball fell. Then a second. Then all eight." ----
// 10a one ball (1494-1577): night, one ball drops (dragon 1, frog at (0.5, ., 7.2)).
shot("nightball1", 1494, 1578, (f) => {
  const cam = { pos: [0.5, ht(0, 16, 0) + 2.4, 16], look: [-0.8, ht(0, 6, 0) + 1.5, 6], fov: 38 };
  CAMNOW = cam;
  const L = LP.night;
  const actors = [{ id: "inv", kind: "front", outfit: INVENTOR, pos: [-1.8, 7.5], scale: 1.3, opts: { expr: f < 1530 ? "nervous" : "shock", blink: blinkAt(f, 21), seed: 21, light: -2.2 } }];
  const fx = [{ id: "lamp", kind: "glow", pos: [2.2, ht(2.2, 7.5, 0) + 0.8, 7.5], size: 5, alpha: 0.9 }];
  const jy = ht(0, 6, 0) + 1.13;
  if (f >= 1530 && f < 1539) fx.push({ id: "tink1", kind: "burst", pos: pullTo([0.5, jy + 0.4, 7.2]), size: 0.8, t: q((f - 1530 + 1) / 9, 0.11), col: "#ffe08a" });
  const cart = cartAt(0, 6, 24);
  return { cam, L, actors, fx, p: 0, world: { cart, jar: jarOnCart(cart, { dropped: [2], drops: [drop(1, 1530)] }) }, kicks: [{ f: 1530, a: 0.014 }], dof: { focus: dist(cam.pos, [0, jy + 1, 6]), cInf: 4 }, shadow: { c: [0, 0, 6], r: 10 } };
});
// 10b two more balls (1578-1660): punch + shake as two balls fall (dragons 3 and 0,
// frogs at (-1.2, ., 6.5) and (1.2, ., 6.5)).
shot("nightball2", 1578, 1661, (f) => {
  const cam = { pos: [0.5, ht(0, 15, 0) + 2.2, 15], look: [-0.6, ht(0, 6, 0) + 1.5, 6], fov: lerp(38, 36, smooth(lin(1578, 1620, f))) };
  CAMNOW = cam;
  const L = LP.night;
  const actors = [{ id: "inv", kind: "front", outfit: INVENTOR, pos: [-1.8, 7.5], scale: 1.45, opts: { expr: "shock", blink: blinkAt(f, 21), seed: 21, light: -2.2 } }];
  const fx = [{ id: "lamp", kind: "glow", pos: [2.2, ht(2.2, 7.5, 0) + 0.8, 7.5], size: 5, alpha: 0.9 }];
  const jy = ht(0, 6, 0) + 1.13;
  if (f >= 1593 && f < 1602) fx.push({ id: "tink2", kind: "burst", pos: pullTo([-1.2, jy + 0.4, 6.5]), size: 0.9, t: q((f - 1593 + 1) / 9, 0.11), col: "#ffe08a" });
  if (f >= 1623 && f < 1632) fx.push({ id: "tink3", kind: "burst", pos: pullTo([1.2, jy + 0.4, 6.5]), size: 0.9, t: q((f - 1623 + 1) / 9, 0.11), col: "#ffe08a" });
  const cart = cartAt(0, 6, 24);
  return { cam, L, actors, fx, p: 0, world: { cart, jar: jarOnCart(cart, { dropped: [2, 1], drops: [drop(3, 1593), drop(0, 1623)] }) }, kicks: [{ f: 1593, a: 0.016 }, { f: 1623, a: 0.016 }], dof: { focus: dist(cam.pos, [0, jy + 1, 6]), cInf: 4 }, shadow: { c: [0, 0, 6], r: 10 } };
});

// ---- L11 (1661-1793) "he ran to the city gate, shouting" ----
// 11a hill run approach (1661-1727): side profile, the inventor sprints down the hill toward
// the gate; he grows as he nears the camera.
shot("runhill", 1661, 1728, (f) => {
  const t = lin(1661, 1728, f);
  const z = lerp(16, 26, t), s = lerp(0.55, 1.05, t);
  const cam = { pos: [6, 2.6, 30], look: [0, ht(0, z, 0) + 1.2, z], fov: 36 };
  CAMNOW = cam;
  const L = LP.day, mir = mirrorOf(cam, [0, 1]);
  const actors = [{ id: "inv", kind: "side", wide: true, outfit: INVENTOR, pos: [0, z], dir: [0, 1], scale: s, opts: { mode: "walk", phase: walkPhase((z - 16) * 1.6), stride: 1.6, expr: "shock", seed: 21, light: lightAng(cam, L, mir), lean0: 10 } }];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [0, ht(0, z, 0) + 1.2, z]), cInf: 8 }, shadow: { c: [0, 0, z], r: 12 } };
});
// 11b gate run (1728-1793): he runs through the gate.
shot("rungate", 1728, 1794, (f) => {
  const t = lin(1728, 1794, f);
  const z = lerp(30, 40, t);
  const cam = { pos: [8, 2.4, 30], look: [0, 1.5, z], fov: 44 };
  CAMNOW = cam;
  const L = LP.day, mir = mirrorOf(cam, [0, 1]);
  const actors = [{ id: "inv", kind: "side", wide: true, outfit: INVENTOR, pos: [0, z], dir: [0, 1], opts: { mode: "walk", phase: walkPhase(10 * 1.6 + (z - 30) * 1.6), stride: 1.6, expr: "shock", seed: 21, light: lightAng(cam, L, mir), lean0: 10 } }];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [0, 1.5, z]), cInf: 8 }, shadow: { c: [0, 0, 38], r: 12 } };
});

// ---- L12 (1794-1922) "the toy man is back! are your frogs hungry?" ----
shot("gatelaugh", 1794, 1923, (f) => {
  const cam = camKeys([
    { f: 1794, pos: [0, 2.4, 53], look: [0, 1.7, 40.5], fov: 40 },
    { f: 1923, pos: [0, 2.3, 52.5], look: [0, 1.65, 40.5], fov: 39, ease: (t) => smooth(t) },
  ], f);
  const L = LP.day;
  const bounce = (s) => q(4 * Math.sin((f - 1794) * 1.05 + s), 1);
  const actors = [
    { id: "g1", kind: "front", outfit: GUARD, pos: [-2.0, 39.5], opts: { expr: "laugh", armL: "belly", armR: "belly", blink: blinkAt(f, 23), seed: 23, light: -2.2, tilt: bounce(1) } },
    { id: "g2", kind: "front", outfit: GUARD, pos: [2.0, 39.5], opts: { expr: "laugh", armL: "belly", armR: "belly", blink: blinkAt(f, 27), seed: 27, light: -2.2, tilt: bounce(2) } },
    { id: "inv", kind: "front", outfit: INVENTOR, pos: [0, 42.5], scale: 1.3, opts: { expr: "nervous", blink: blinkAt(f, 21), seed: 21, light: -2.2, tilt: q(4 * Math.sin(f * 0.09), 0.5) } },
  ];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [0, 1.6, 40]), cInf: 9 }, shadow: { c: [0, 0, 40], r: 14 } };
});

// ---- L13 (1923-2038) "the guards laughed him back up the hill" ----
// 13a walk back from gate (1923-1980): he walks away from the gate, receding (z 40 -> 33).
shot("walkback", 1923, 1981, (f) => {
  const t = lin(1923, 1981, f);
  const z = lerp(40, 33, t), s = lerp(1.0, 0.85, t);
  const cam = { pos: [5, 2.0, 47], look: [0, 1.4, 36], fov: 32 };
  CAMNOW = cam;
  const L = LP.day, mir = mirrorOf(cam, [0, -1]);
  const actors = [{ id: "inv", kind: "side", wide: true, outfit: INVENTOR, pos: [0, z], dir: [0, -1], scale: s, opts: { mode: "walk", phase: walkPhase((40 - z)), expr: "pained", seed: 21, light: lightAng(cam, L, mir), lean0: 4 } }];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [0, 1.5, z]), cInf: 8 }, shadow: { c: [0, 0, 36], r: 12 } };
});
// 13b walk up hill, receding (1981-2038): he walks up the slope, growing smaller (z 30 -> 24).
shot("walkhill", 1981, 2039, (f) => {
  const t = lin(1981, 2039, f);
  const z = lerp(30, 24, t), s = lerp(0.85, 0.65, t);
  const cam = { pos: [5, 3.0, 33], look: [0, ht(0, z, 0) + 1.2, z], fov: 32 };
  CAMNOW = cam;
  const L = LP.day, mir = mirrorOf(cam, [0, -1]);
  const actors = [{ id: "inv", kind: "side", wide: true, outfit: INVENTOR, pos: [0, z], dir: [0, -1], scale: s, opts: { mode: "walk", phase: walkPhase(7 + (30 - z)), expr: "pained", seed: 21, light: lightAng(cam, L, mir), lean0: 4 } }];
  return { cam, L, actors, fx: [], p: 0, kicks: [], dof: { focus: dist(cam.pos, [0, ht(0, z, 0) + 1.2, z]), cInf: 8 }, shadow: { c: [0, 0, 22], r: 12 } };
});

// ---- L14 (2039-2140) "next morning, the palace was rubble" ----
shot("rubble", 2039, 2141, (f) => {
  const cam = camKeys([
    { f: 2039, pos: [6, 3, 108], look: [0, 1.2, 96], fov: 42 },
    { f: 2141, pos: [5.5, 2.8, 106], look: [0, 1.1, 96], fov: 41, ease: (t) => t },
  ], f);
  const L = LP.morning;
  const fx = [];
  for (let i = 0; i < 3; i++) fx.push({ id: "dust" + i, kind: "smoke", pos: [[-6, 3, 98], [4, 3, 92], [0, 3.5, 100]][i], size: 5, t: q(((f * 0.012 + i * 0.31) % 1), 0.02), alpha: 0.7 });
  return { cam, L, actors: [], fx, p: 0, world: { rubble: true }, kicks: [], dof: { focus: dist(cam.pos, [0, 1.5, 95]), cInf: 0 }, shadow: { c: [0, 0, 97], r: 30 } };
});

// ---- L15 (2141-2302) "a heavy pendulum hung inside, a rod to each dragon" ----
// 15a dome pendulum wide (2141-2221): the mechanism chamber, pendulum swinging gently.
// The dome opens west, so the camera sits west looking east into it.
shot("domewide", 2141, 2222, (f) => {
  const cam = { pos: [10, 3.4, 99], look: [22, 4.2, 95], fov: 44 };
  const L = LP.palace;
  const pend = 5 * Math.sin((f - 2141) * (2 * Math.PI / 60));
  return { cam, L, actors: [], fx: [], p: 0, world: { pend }, kicks: [], dof: { focus: dist(cam.pos, [22, 4.2, 95]), cInf: 5 }, shadow: { c: [22, 0, 95], r: 10 } };
});
// 15b dome close (2222-2302): close on the pendulum + rods.
shot("domeclose", 2222, 2303, (f) => {
  const cam = { pos: lerp3([13.5, 3.6, 96.5], [14.5, 3.5, 96], smooth(lin(2222, 2303, f))), look: [22, 4.3, 95], fov: 36 };
  const L = LP.palace;
  const pend = 6 * Math.sin((f - 2141) * (2 * Math.PI / 60));
  return { cam, L, actors: [], fx: [], p: 0, world: { pend }, kicks: [], dof: { focus: dist(cam.pos, [22, 4.2, 95]), cInf: 3 }, shadow: { c: [22, 0, 95], r: 8 } };
});

// ---- L16 (2303-2522) "a tremor, the pendulum hits a rod, the jaw opens" ----
// 16a tremor, rod-hit spark (2303-2412): the pendulum swings hard and hits a rod; the spark
// sits where the ball is at full north swing (22, 4.4, 94.1).
shot("tremor", 2303, 2413, (f) => {
  const cam = { pos: [12, 3.4, 97.5], look: [22, 4.2, 95], fov: 40 };
  CAMNOW = cam;
  const L = LP.palace;
  const amp = lerp(6, 16, smooth(lin(2303, 2378, f)));
  const pend = amp * Math.sin((f - 2141) * (2 * Math.PI / 48));
  const fx = [];
  if (f >= 2378 && f < 2390) fx.push({ id: "hit", kind: "burst", pos: pullTo([22, 4.4, 94.1]), size: 1.1, t: q((f - 2378 + 1) / 12, 0.08), col: "#ffe08a" });
  return { cam, L, actors: [], fx, p: 0, world: { pend }, kicks: [{ f: 2378, a: 0.02 }], dof: { focus: dist(cam.pos, [22, 4.2, 95]), cInf: 3 }, shadow: { c: [22, 0, 95], r: 8 } };
});
// 16b jar ball falls (2413-2522): from the NORTH, looking south at the jar -- dragon 4's
// frog is on the north-west side (2.8, ., 96.5), with the throne behind.
shot("mechball", 2413, 2523, (f) => {
  const cam = { pos: [0, 2.3, 88], look: [4, 1.5, 97], fov: 37 };
  CAMNOW = cam;
  const L = LP.palace;
  const fx = [];
  if (f >= 2443 && f < 2452) fx.push({ id: "tink4", kind: "burst", pos: pullTo([2.8, 0.45, 96.5]), size: 0.8, t: q((f - 2443 + 1) / 9, 0.11), col: "#ffe08a" });
  return { cam, L, actors: [], fx, p: 0, world: { jar: jarAt(4, 97, { dropped: [2, 1, 3, 0], drops: [drop(4, 2443)] }) }, kicks: [{ f: 2443, a: 0.012 }], dof: { focus: dist(cam.pos, [4, 1.2, 97]), cInf: 3 }, shadow: { c: [4, 0, 97], r: 8 } };
});

// ---- L17 (2523-2621) "one ball: a tremor far away" ----
shot("tremor1", 2523, 2622, (f) => {
  const cam = camKeys([
    { f: 2523, pos: [0, 3.2, 90], look: [0, 1.8, 64], fov: 42 },
    { f: 2622, pos: [0, 3.1, 89], look: [0, 1.75, 64], fov: 41, ease: (t) => t },
  ], f);
  const L = LP.day;
  const shake = f >= 2560 ? 0.5 * Math.sin(f * 1.4) : 0;
  const actors = [
    { id: "g1", kind: "front", outfit: GUARD, pos: [-3, 64.5], opts: { expr: "shock", blink: blinkAt(f, 23), seed: 23, light: -2.2, tilt: q(shake * 2, 0.5) } },
    { id: "g2", kind: "front", outfit: GUARD, pos: [3, 64.5], opts: { expr: "shock", blink: blinkAt(f, 27), seed: 27, light: -2.2, tilt: q(-shake * 2, 0.5) } },
    { id: "c1", kind: "front", outfit: COURT_1, pos: [0, 66.5], opts: { expr: "worried", blink: blinkAt(f, 24), seed: 24, light: -2.2 } },
  ];
  return { cam, L, actors, fx: [], p: 0, kicks: [{ f: 2560, a: 0.012 }], dof: { focus: dist(cam.pos, [0, 1.6, 64]), cInf: 10 }, shadow: { c: [0, 0, 64], r: 16 } };
});

// ---- L18 (2622-2789) "all eight: the biggest quake, right underneath" ----
// 18a three balls, punch + shake (2622-2706): from the NORTH of the hilltop, looking south --
// dragons 5, 6, 7 drop on the north side (frogs at (-0.5, ., 4.8), (0.5, ., 4.8), (1.2, ., 5.5)).
shot("quakeballs", 2622, 2707, (f) => {
  const cam = { pos: [3, ht(0, -2, 0) + 2.2, -2], look: [-0.8, ht(0, 6, 0) + 1.5, 6], fov: lerp(38, 33, smooth(lin(2622, 2660, f))) };
  CAMNOW = cam;
  const L = LP.night;
  const actors = [{ id: "inv", kind: "front", outfit: INVENTOR, pos: [-1.5, 5], scale: 1.25, opts: { expr: "shock", blink: blinkAt(f, 21), seed: 21, light: -2.2 } }];
  const fx = [{ id: "lamp", kind: "glow", pos: [2.2, ht(2.2, 4.5, 0) + 0.8, 4.5], size: 5, alpha: 0.9 }];
  const jy = ht(0, 6, 0) + 1.13;
  for (const [fi, x, zz] of [[2631, -0.5, 4.8], [2646, 0.5, 4.8], [2661, 1.2, 5.5]]) if (f >= fi && f < fi + 9) fx.push({ id: "tink" + fi, kind: "burst", pos: pullTo([x, jy + 0.4, zz]), size: 0.9, t: q((f - fi + 1) / 9, 0.11), col: "#ffe08a" });
  const cart = cartAt(0, 6, 24);
  return { cam, L, actors, fx, p: 0, world: { cart, jar: jarOnCart(cart, { dropped: [2, 1, 3, 0, 4], drops: [drop(5, 2631), drop(6, 2646), drop(7, 2661)] }) }, kicks: [{ f: 2631, a: 0.018 }, { f: 2646, a: 0.018 }, { f: 2661, a: 0.02 }], dof: { focus: dist(cam.pos, [0, jy + 1, 6]), cInf: 4 }, shadow: { c: [0, 0, 6], r: 10 } };
});
// 18b QUAKE payoff (2707-2789): the ground splits with glowing lava under the city.
shot("quake", 2707, 2790, (f) => {
  const t = smoother(lin(2707, 2789, f));
  const cam = { pos: lerp3([0, 14, 8], [0, 15, 10], t), look: [0, 1.5, 34], fov: lerp(48, 46, t) };
  const L = LP.quake;
  const fx = [];
  for (let i = 0; i < 5; i++) fx.push({ id: "qsmoke" + i, kind: "smoke", pos: [[-12, 2, 28], [-5, 2.5, 27], [0, 3, 28], [7, 2.5, 29], [13, 2, 27]][i], size: 7, t: q(((f * 0.01 + i * 0.19) % 1), 0.02), alpha: 0.8 });
  for (let i = 0; i < 3; i++) fx.push({ id: "qglow" + i, kind: "glow", pos: [[-8, 1.2, 28], [1, 1.4, 28], [9, 1.2, 28]][i], size: 4 + i * 2, alpha: 0.7 });
  return { cam, L, actors: [], fx, p: 0, world: { lava: true }, kicks: [{ f: 2707, a: 0.025 }, { f: 2750, a: 0.02 }], dof: { focus: 40, cInf: 0 }, shadow: { c: [0, 0, 30], r: 40 } };
});

export const SHOTLIST = SHOTS.map((s) => ({ id: s.id, a: s.a, b: s.b }));
export const shotAt = (f) => SHOTS.find((s) => f >= s.a && f < s.b) || SHOTS[SHOTS.length - 1];

export const frameState = (f) => {
  const s = shotAt(f), r = s.fn(f);
  const cam = { ...r.cam, pos: [...r.cam.pos], look: [...r.cam.look] };
  const [kx, ky] = kick(f, r.kicks || []);
  if (kx || ky) {
    const d = dist(cam.pos, cam.look), R = camRight(cam), U = camUp(cam);
    cam.look = add3(cam.look, [R[0] * kx * d + U[0] * ky * d, R[1] * kx * d + U[1] * ky * d, R[2] * kx * d + U[2] * ky * d]);
  }
  const world = { progress: r.p ?? 0, slab: null, plug: null, short: false, ...(r.world || {}) };
  return { shot: s.id, cam, light: r.L, actors: r.actors || [], fx: r.fx || [], world, flash: r.flash || 0, vign: r.vign ?? 0.18, dof: r.dof, shadow: r.shadow };
};
