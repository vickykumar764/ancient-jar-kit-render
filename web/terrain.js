// The ridge and the cut, shared by the world builder (main.js) and the staging (story.js).
// Ridge runs along x; the village is on the +z (south) side; the cut is dug along z at x = 0 from the south foot
// (progress 0) through to the north foot (progress 1).
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
const vnoise = (x, y) => {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
export const fbm = (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let k = 0; k < oct; k++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s / 0.9375; };

export const W0 = 20; // half thickness of the ridge at the saddle
export const crest = (x) => {
  const ax = Math.abs(x);
  let c = 10 + 22 * sstep(9, 60, ax) + 16 * sstep(70, 180, ax) + 8 * (fbm(x * 0.012 + 3, 1.7, 3) - 0.5);
  c *= 1 - sstep(112, 165, x);
  return Math.max(0, c);
};
export const halfW = (x) => 15 + 0.55 * crest(x);
export const ridgeH = (x, z) => {
  const c = crest(x), w = halfW(x), t = Math.abs(z) / w;
  let h = t < 1 ? c * Math.pow(1 - Math.pow(t, 3.0), 1.25) : 0;
  const skirt = 1.4 * (1 - sstep(0.8, 1.3, t)) * Math.min(1, c / 4);
  const n = (fbm(x * 0.05, z * 0.05) - 0.5) * (2.0 + 0.1 * c) + (fbm(x * 0.22 + 7, z * 0.22) - 0.5) * 0.8;
  return h + skirt + n * Math.min(1, (h + skirt + 0.2) / 3);
};
export const CH = { half: 3.3, rim: 1.4 };
export const chanEnd = (p) => (W0 + 4) - p * (2 * W0 + 10);
export const floorH = (z) => 0.2 + 1.0 * Math.max(0, 1 - (z / (W0 + 2)) ** 2);
/** channel blend s (0 outside .. 1 inside) and floor height */
export const chan = (x, z, p) => {
  if (p <= 0) return 0;
  const ze = chanEnd(p), ax = Math.abs(x);
  const sx = 1 - sstep(CH.half, CH.half + CH.rim, ax);
  const d = z - ze + 1.3 * (ax / CH.half) ** 2;
  return sx * sstep(-0.5, 1.1, d);
};
export const terrainH = (x, z, p, base) => {
  let h = (base ?? ridgeH(x, z)) - 0.35;
  const s = chan(x, z, p);
  if (s > 0) {
    const fl = floorH(z) + 0.18 * (fbm(x * 0.9 + 11, z * 0.9) - 0.5);
    if (h > fl) h += (fl - h) * s;
  }
  return h;
};
export const groundAt = (x, z, p) => Math.max(0, terrainH(x, z, p));
