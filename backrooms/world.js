// Backrooms world: an endless, seeded grid of chunks. Pure data (no three.js), so node can test it.
// A chunk is CH x CH cells of CELL metres. Inside a chunk a random spanning tree guarantees every cell is reachable;
// every chunk border has at least two doorways, so the whole infinite plane is connected: you can never be walled in.
export const CELL = 4, CH = 8, CHUNK = CELL * CH;

export const BIOMES = {
  lobby:   { level: 'Level 0', name: 'The Lobby', height: 3.0, open: 0.5, fog: [0.80, 0.72, 0.42], fogD: 0.055, amb: 0.55, lightP: 0.72, deadP: 0.1, flickerP: 0.12, floor: 'carpet', hum: 1.0 },
  office:  { level: 'Level 4', name: 'The Abandoned Office', height: 3.0, open: 0.72, fog: [0.55, 0.58, 0.6], fogD: 0.05, amb: 0.45, lightP: 0.8, deadP: 0.18, flickerP: 0.1, floor: 'carpet', hum: 0.8 },
  pool:    { level: 'Level 37', name: 'The Poolrooms', height: 4.2, open: 0.78, fog: [0.78, 0.9, 0.95], fogD: 0.04, amb: 0.95, lightP: 0.55, deadP: 0.02, flickerP: 0.02, floor: 'tile', hum: 0.25 },
  play:    { level: 'Level Fun', name: 'The Playrooms', height: 3.2, open: 0.6, fog: [0.42, 0.3, 0.36], fogD: 0.07, amb: 0.3, lightP: 0.45, deadP: 0.25, flickerP: 0.2, floor: 'foam', hum: 0.35 },
  parking: { level: 'Level 2', name: 'The Parking Levels', height: 2.8, open: 0.92, fog: [0.16, 0.13, 0.1], fogD: 0.07, amb: 0.22, lightP: 0.45, deadP: 0.3, flickerP: 0.3, floor: 'concrete', hum: 0.6 },
  hotel:   { level: 'Level 5', name: 'The Hotel', height: 2.9, open: 0.1, fog: [0.22, 0.1, 0.08], fogD: 0.065, amb: 0.32, lightP: 0.45, deadP: 0.12, flickerP: 0.15, floor: 'rug', hum: 0.3 },
};
export const BIOME_KEYS = Object.keys(BIOMES);

// ---------------------------------------------------------------- hashing + noise
export function hash(...a) { let h = 2166136261 >>> 0; for (const v of a) { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; h ^= h >>> 16; } return h >>> 0; }
export function rng(seed) { let s = seed >>> 0; const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; r.int = (n) => Math.floor(r() * n); r.pick = (a) => a[Math.floor(r() * a.length)]; return r; }
const lattice = (seed, x, z) => hash(seed, x, z) / 4294967296;
function vnoise(seed, x, z) { // smooth value noise
  const x0 = Math.floor(x), z0 = Math.floor(z), fx = x - x0, fz = z - z0, s = (t) => t * t * (3 - 2 * t);
  const a = lattice(seed, x0, z0), b = lattice(seed, x0 + 1, z0), c = lattice(seed, x0, z0 + 1), d = lattice(seed, x0 + 1, z0 + 1);
  return (a + (b - a) * s(fx)) + ((c + (d - c) * s(fx)) - (a + (b - a) * s(fx))) * s(fz);
}

/** Which level a chunk belongs to. The Lobby is the most common; the others appear as large patches. */
export function biomeAt(seed, cx, cz) {
  if (Math.abs(cx) <= 1 && Math.abs(cz) <= 1) return 'lobby'; // you always wake up in the Lobby
  const n = vnoise(seed ^ 0x51, cx / 4.5, cz / 4.5);
  if (n < 0.46) return 'lobby';
  const m = vnoise(seed ^ 0x9e37, cx / 3.2 + 100, cz / 3.2 - 100);
  const others = ['office', 'pool', 'play', 'parking', 'hotel'];
  return others[Math.min(others.length - 1, Math.floor(m * others.length * 1.0))];
}

// a chunk border: X/Z is the border line index (in chunks), k the cell along it
function border(seed, vertical, X, Z, k, openA, openB) {
  const h = hash(seed, vertical ? 1 : 2, X, Z);
  const g1 = h % CH, g2 = (h >>> 8) % CH;
  if (k === g1 || k === g2) return false; // two guaranteed doorways per border
  return lattice(seed ^ (vertical ? 77 : 88), X * 131 + k, Z * 71 + k) > Math.min(openA, openB) * 0.55;
}

const SCRAWLS = ['IT\'S SAFE HERE?', 'DON\'T TRUST THE HUM', 'I\'VE BEEN HERE BEFORE', 'KEEP WALKING', 'THE EXIT IS A LIE', 'COUNT THE LIGHTS', 'NOT THIS WAY', '→ →', 'WHO TURNED OFF THE LIGHTS', 'DAY 41', 'IT GOES ON FOREVER', 'NO ONE ELSE IS HERE', 'LISTEN', 'YOU NOCLIPPED TOO', 'ALMOND WATER HELPS', 'THE CARPET IS WET'];

/** Generate one chunk: walls, cells, lights, props and pickups, all in chunk-local metres (x right, z down). */
export function generateChunk(seed, cx, cz) {
  const biome = biomeAt(seed, cx, cz), B = BIOMES[biome], r = rng(hash(seed, cx, cz, 7));
  const nb = { w: biomeAt(seed, cx - 1, cz), e: biomeAt(seed, cx + 1, cz), n: biomeAt(seed, cx, cz - 1), s: biomeAt(seed, cx, cz + 1) };
  // v[i][j]: wall on the vertical line x = i (0..CH) at row j; h[i][j]: wall on the horizontal line z = j (0..CH) at column i
  const v = [], hz = [];
  for (let i = 0; i <= CH; i++) { v.push(new Array(CH).fill(true)); hz.push(new Array(CH + 1).fill(true)); }
  for (let j = 0; j < CH; j++) { v[0][j] = border(seed, true, cx, cz, j, B.open, BIOMES[nb.w].open); v[CH][j] = border(seed, true, cx + 1, cz, j, B.open, BIOMES[nb.e].open); }
  for (let i = 0; i < CH; i++) { hz[i][0] = border(seed, false, cx, cz, i, B.open, BIOMES[nb.n].open); hz[i][CH] = border(seed, false, cx, cz + 1, i, B.open, BIOMES[nb.s].open); }
  // spanning tree (randomised depth-first) so every cell connects
  const seen = new Uint8Array(CH * CH), stack = [[r.int(CH), r.int(CH)]]; seen[stack[0][1] * CH + stack[0][0]] = 1;
  while (stack.length) {
    const [i, j] = stack[stack.length - 1];
    const opts = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => { const x = i + a, y = j + b; return x >= 0 && y >= 0 && x < CH && y < CH && !seen[y * CH + x]; });
    if (!opts.length) { stack.pop(); continue; }
    const [a, b] = r.pick(opts), x = i + a, y = j + b;
    if (a === 1) v[i + 1][j] = false; else if (a === -1) v[i][j] = false; else if (b === 1) hz[i][j + 1] = false; else hz[i][j] = false;
    seen[y * CH + x] = 1; stack.push([x, y]);
  }
  for (let i = 1; i < CH; i++) for (let j = 0; j < CH; j++) if (v[i][j] && r() < B.open) v[i][j] = false;
  for (let i = 0; i < CH; i++) for (let j = 1; j < CH; j++) if (hz[i][j] && r() < B.open) hz[i][j] = false;

  const cells = [], lights = [], props = [], items = [], scrawls = [], solids = [];
  const at = (i, j) => ({ x: (i + 0.5) * CELL, z: (j + 0.5) * CELL });
  for (let j = 0; j < CH; j++) for (let i = 0; i < CH; i++) {
    const c = { i, j, pool: false };
    cells.push(c);
    const { x, z } = at(i, j);
    if (r() < B.lightP) lights.push({ x, z, y: B.height - 0.02, dead: r() < B.deadP, flicker: r() < B.flickerP ? 0.3 + r() * 0.7 : 0, kind: biome === 'parking' ? 'tube' : biome === 'hotel' ? 'lamp' : 'panel' });
    const open = (k) => !(k === 'e' ? v[i + 1][j] : k === 'w' ? v[i][j] : k === 's' ? hz[i][j + 1] : hz[i][j]);
    if (biome === 'pool' && r() < 0.28 && i > 0 && j > 0 && i < CH - 1 && j < CH - 1) c.pool = true;
    if (biome === 'office' && r() < 0.55) { // a cubicle: desk, monitor, chair and two partitions
      const rot = r.int(4), d = { type: 'desk', x, z, rot, on: r() < 0.35 }; props.push(d);
      solids.push(box(x, z, rot % 2 ? 0.9 : 1.7, rot % 2 ? 1.7 : 0.9));
      if (r() < 0.7) { const px = x + (rot === 1 ? -1.2 : rot === 3 ? 1.2 : 0), pz = z + (rot === 0 ? -1.2 : rot === 2 ? 1.2 : 0); props.push({ type: 'partition', x: px, z: pz, rot }); solids.push(rot % 2 ? box(px, pz, 0.08, 2.0) : box(px, pz, 2.0, 0.08)); }
    }
    if (biome === 'lobby' && r() < 0.06) { props.push({ type: 'pillar', x, z, s: 0.7 }); solids.push(box(x, z, 0.7, 0.7)); }
    if (biome === 'parking' && i % 2 === 0 && j % 2 === 0) { props.push({ type: 'pillar', x: i * CELL + 0.01, z: j * CELL + 0.01, s: 0.8 }); solids.push(box(i * CELL, j * CELL, 0.8, 0.8)); }
    if (biome === 'parking' && r() < 0.35) props.push({ type: 'line', x, z, rot: r.int(2) });
    if (biome === 'parking' && j % 2 === 1) props.push({ type: 'pipe', x, z });
    if (biome === 'pool' && !c.pool && r() < 0.12) { props.push({ type: 'column', x, z }); solids.push(box(x, z, 0.8, 0.8)); }
    if (biome === 'play') {
      const roll = r();
      if (roll < 0.1) { props.push({ type: 'ballpit', x, z, seed: hash(seed, cx, cz, i, j) }); solids.push(box(x, z, 2.4, 2.4)); }
      else if (roll < 0.32) props.push({ type: 'blocks', x, z, seed: hash(seed, cx, cz, i, j, 3) });
      else if (roll < 0.38) { props.push({ type: 'bear', x, z, rot: r() * 6.28 }); }
    }
    if (biome === 'hotel') for (const k of ['n', 's', 'e', 'w']) if (!open(k) && r() < 0.45) props.push({ type: 'door', i, j, side: k, n: 100 + r.int(900) });
    if (r() < 0.025) items.push({ id: `${cx},${cz},${i},${j}`, x: x + (r() - 0.5) * 2, z: z + (r() - 0.5) * 2 });
    if (r() < 0.035) { const walls = ['n', 's', 'e', 'w'].filter((k) => !open(k)); if (walls.length) scrawls.push({ i, j, side: r.pick(walls), text: r.pick(SCRAWLS) }); }
  }
  // an EXIT sign over a doorway now and then (it never leads anywhere)
  const exit = (biome === 'lobby' || biome === 'hotel' || biome === 'office') && r() < 0.25 ? { i: r.int(CH), j: r.int(CH) } : null;
  // a glitch in the walls: walk into it and you noclip somewhere far away
  const glitch = r() < 0.05 && !(cx === 0 && cz === 0) ? { ...at(r.int(CH), r.int(CH)) } : null;
  // wall solids (0.2 m thick)
  for (let i = 0; i <= CH; i++) for (let j = 0; j < CH; j++) if (v[i][j]) solids.push({ x0: i * CELL - 0.1, x1: i * CELL + 0.1, z0: j * CELL - 0.1, z1: (j + 1) * CELL + 0.1 });
  for (let i = 0; i < CH; i++) for (let j = 0; j <= CH; j++) if (hz[i][j]) solids.push({ x0: i * CELL - 0.1, x1: (i + 1) * CELL + 0.1, z0: j * CELL - 0.1, z1: j * CELL + 0.1 });
  return { cx, cz, biome, nb, v, h: hz, cells, lights, props, items, scrawls, solids, exit, glitch, height: B.height };
}
function box(x, z, w, d) { return { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }; }

/** Push a circle (player) out of a list of boxes. Returns the corrected position. */
export function collide(x, z, rad, solids) {
  for (let pass = 0; pass < 2; pass++) for (const b of solids) {
    const nx = Math.max(b.x0, Math.min(x, b.x1)), nz = Math.max(b.z0, Math.min(z, b.z1)), dx = x - nx, dz = z - nz, d2 = dx * dx + dz * dz;
    if (d2 < rad * rad) {
      if (d2 > 1e-9) { const d = Math.sqrt(d2), p = rad - d; x += (dx / d) * p; z += (dz / d) * p; }
      else { const l = x - b.x0, rr = b.x1 - x, t = z - b.z0, bo = b.z1 - z, m = Math.min(l, rr, t, bo); if (m === l) x = b.x0 - rad; else if (m === rr) x = b.x1 + rad; else if (m === t) z = b.z0 - rad; else z = b.z1 + rad; }
    }
  }
  return { x, z };
}
