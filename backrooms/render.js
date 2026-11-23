// Backrooms rendering: procedural canvas textures per level, and one merged mesh per material per chunk.
import * as THREE from './vendor/three.module.min.js';
import { CELL, CH, CHUNK, BIOMES, rng, hash } from './world.js';

// ---------------------------------------------------------------- textures
const TEX = {};
function canvasTex(key, size, draw, repeat = true) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return (TEX[key] = t);
}
function noise(g, s, n, alpha, col = [0, 0, 0], size = 1.5, seed = 1) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) { const a = alpha * r(); g.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${a})`; const w = size * (0.5 + r()); g.fillRect(r() * s, r() * s, w, w); }
}
function stains(g, s, n, col, seed, maxR = 0.35) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * s, y = r() * s, rad = s * (0.08 + r() * maxR), gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${col[0]},${col[1]},${col[2]},${0.18 + r() * 0.2})`); gr.addColorStop(0.7, `rgba(${col[0]},${col[1]},${col[2]},0.06)`); gr.addColorStop(1, `rgba(${col[0]},${col[1]},${col[2]},0)`);
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
const T = {
  wallpaper: () => canvasTex('wallpaper', 512, (g, s) => {
    g.fillStyle = '#c8b25a'; g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 32) { g.fillStyle = 'rgba(120,96,30,0.10)'; g.fillRect(x, 0, 12, s); }
    g.strokeStyle = 'rgba(110,88,28,0.16)'; g.lineWidth = 2; // faint chevrons
    for (let y = 16; y < s; y += 48) for (let x = 0; x < s; x += 32) { g.beginPath(); g.moveTo(x + 4, y + 8); g.lineTo(x + 16, y); g.lineTo(x + 28, y + 8); g.stroke(); }
    noise(g, s, 4000, 0.06, [60, 50, 20], 2, 3); stains(g, s, 7, [110, 85, 30], 4);
    const gr = g.createLinearGradient(0, s * 0.82, 0, s); gr.addColorStop(0, 'rgba(70,55,20,0)'); gr.addColorStop(1, 'rgba(70,55,20,0.45)'); g.fillStyle = gr; g.fillRect(0, s * 0.82, s, s * 0.18);
  }),
  carpet: () => canvasTex('carpet', 512, (g, s) => { g.fillStyle = '#9c8a52'; g.fillRect(0, 0, s, s); noise(g, s, 30000, 0.12, [40, 32, 10], 1.5, 5); noise(g, s, 8000, 0.08, [255, 240, 180], 1.2, 6); stains(g, s, 6, [60, 48, 18], 7, 0.4); }),
  ceiling: () => canvasTex('ceiling', 256, (g, s) => {
    g.fillStyle = '#d8d2bd'; g.fillRect(0, 0, s, s); noise(g, s, 6000, 0.16, [120, 110, 90], 1.4, 8);
    g.fillStyle = '#9a927c'; g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s); g.fillRect(0, s / 2, s, 3); g.fillRect(s / 2, 0, 3, s); stains(g, s, 2, [140, 110, 60], 9, 0.2);
  }),
  officeWall: () => canvasTex('officeWall', 256, (g, s) => { g.fillStyle = '#bcb6a8'; g.fillRect(0, 0, s, s); noise(g, s, 5000, 0.06, [60, 60, 60], 2, 10); stains(g, s, 2, [90, 80, 60], 11, 0.25); }),
  officeCarpet: () => canvasTex('officeCarpet', 256, (g, s) => { g.fillStyle = '#4e5864'; g.fillRect(0, 0, s, s); noise(g, s, 16000, 0.18, [20, 24, 30], 1.4, 12); for (let y = 0; y < s; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < s; x += 16) { g.fillStyle = 'rgba(120,130,145,0.12)'; g.fillRect(x, y, 6, 6); } }),
  fabric: () => canvasTex('fabric', 128, (g, s) => { g.fillStyle = '#6e737b'; g.fillRect(0, 0, s, s); noise(g, s, 6000, 0.2, [30, 30, 35], 1, 13); }),
  tile: () => canvasTex('tile', 256, (g, s) => {
    g.fillStyle = '#b9cdd2'; g.fillRect(0, 0, s, s); const r = rng(14);
    for (let y = 0; y < s; y += 32) for (let x = 0; x < s; x += 32) { const l = 236 + r() * 14; g.fillStyle = `rgb(${l - 6},${l},${l + 2})`; g.fillRect(x + 2, y + 2, 28, 28); g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(x + 4, y + 4, 10, 3); }
  }),
  foam: () => canvasTex('foam', 256, (g, s) => {
    const cols = ['#d98fa6', '#7fbfb8', '#e3c76a', '#a596c9']; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = cols[(x + y * 3) % 4]; g.fillRect(x * 64, y * 64, 64, 64); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(x * 64 + 1, y * 64 + 1, 62, 62); }
    noise(g, s, 4000, 0.12, [0, 0, 0], 1.5, 15); stains(g, s, 3, [40, 20, 30], 16, 0.3);
  }),
  playWall: () => canvasTex('playWall', 512, (g, s) => {
    const cols = ['#e7b7c3', '#b8dcd6', '#efe0a5', '#c9bfe0']; for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % 4]; g.fillRect(0, (i * s) / 8, s, s / 8); }
    const r = rng(17); g.lineCap = 'round'; // faded crayon doodles
    for (let i = 0; i < 14; i++) { g.strokeStyle = `rgba(${r() * 200},${r() * 120},${r() * 200},0.35)`; g.lineWidth = 3 + r() * 4; g.beginPath(); let x = r() * s, y = s * 0.45 + r() * s * 0.45; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 3; i++) { const x = r() * s, y = s * 0.55 + r() * s * 0.3; g.strokeStyle = 'rgba(200,140,0,0.35)'; g.lineWidth = 4; g.beginPath(); g.arc(x, y, 18, 0, 7); g.stroke(); for (let k = 0; k < 8; k++) { const a = k * 0.785; g.beginPath(); g.moveTo(x + Math.cos(a) * 24, y + Math.sin(a) * 24); g.lineTo(x + Math.cos(a) * 34, y + Math.sin(a) * 34); g.stroke(); } }
    noise(g, s, 6000, 0.06, [0, 0, 0], 2, 18); stains(g, s, 5, [50, 30, 30], 19, 0.3);
  }),
  concrete: () => canvasTex('concrete', 512, (g, s) => { g.fillStyle = '#6c6862'; g.fillRect(0, 0, s, s); noise(g, s, 40000, 0.16, [20, 20, 20], 2, 20); noise(g, s, 10000, 0.08, [200, 200, 190], 1.5, 21); stains(g, s, 8, [30, 26, 20], 22, 0.3); }),
  rug: () => canvasTex('rug', 256, (g, s) => {
    g.fillStyle = '#5a1414'; g.fillRect(0, 0, s, s); g.strokeStyle = '#b08a3a'; g.lineWidth = 3;
    for (let y = 0; y <= s; y += 64) for (let x = 0; x <= s; x += 64) { g.beginPath(); g.moveTo(x, y - 24); g.lineTo(x + 24, y); g.lineTo(x, y + 24); g.lineTo(x - 24, y); g.closePath(); g.stroke(); }
    noise(g, s, 12000, 0.2, [20, 0, 0], 1.4, 23);
  }),
  hotelWall: () => canvasTex('hotelWall', 512, (g, s) => { // wood wainscot below, green damask above (mapped floor→ceiling)
    g.fillStyle = '#2f4a36'; g.fillRect(0, 0, s, s * 0.62); g.fillStyle = 'rgba(160,140,80,0.18)';
    for (let y = 20; y < s * 0.6; y += 46) for (let x = (y / 46) % 2 ? 23 : 0; x < s; x += 46) { g.beginPath(); g.ellipse(x, y, 7, 13, 0, 0, 7); g.fill(); }
    g.fillStyle = '#4a2c18'; g.fillRect(0, s * 0.62, s, s * 0.38); g.fillStyle = '#6a4024'; for (let x = 0; x < s; x += 128) g.fillRect(x + 10, s * 0.67, 108, s * 0.28);
    g.fillStyle = '#2a170b'; g.fillRect(0, s * 0.62, s, 8); noise(g, s, 8000, 0.1, [0, 0, 0], 2, 24); stains(g, s, 3, [20, 10, 5], 25, 0.25);
  }),
  door: () => canvasTex('door', 256, (g, s) => {
    g.fillStyle = '#5b3520'; g.fillRect(0, 0, s, s); g.strokeStyle = '#3a2112'; g.lineWidth = 6; g.strokeRect(30, 22, s - 60, s * 0.38); g.strokeRect(30, s * 0.5, s - 60, s * 0.42);
    noise(g, s, 5000, 0.12, [0, 0, 0], 2, 26); g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(s - 44, s * 0.52, 9, 0, 7); g.fill();
  }),
  metal: () => canvasTex('metal', 128, (g, s) => { g.fillStyle = '#4a4c50'; g.fillRect(0, 0, s, s); noise(g, s, 3000, 0.2, [0, 0, 0], 1.5, 27); stains(g, s, 2, [90, 50, 20], 28, 0.3); }),
  screen: () => canvasTex('screen', 128, (g, s) => { g.fillStyle = '#163a5a'; g.fillRect(0, 0, s, s); g.fillStyle = 'rgba(150,220,255,0.5)'; for (let y = 12; y < s; y += 14) g.fillRect(10, y, 20 + ((y * 37) % 80), 5); }),
};
function textTex(text, color = 'rgba(70,10,10,0.85)') {
  return canvasTex('txt:' + text + color, 512, (g, s) => {
    g.clearRect(0, 0, s, s); g.fillStyle = color; g.font = `900 ${text.length > 14 ? 46 : 64}px "Courier New", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(s / 2, s / 2); g.rotate(-0.06); g.fillText(text, 0, 0);
    g.globalAlpha = 0.35; g.fillText(text, 2, 3); g.restore(); // drips
    const r = rng(hash(text.length, text.charCodeAt(0))); for (let i = 0; i < 8; i++) { const x = s / 2 + (r() - 0.5) * text.length * 30, y = s / 2 + 20; g.fillRect(x, y, 3, 10 + r() * 50); }
  }, false);
}

// ---------------------------------------------------------------- materials per level
const MAT = {};
const lam = (o) => new THREE.MeshLambertMaterial(o);
function rep(t, x, y) { const c = t.clone(); c.needsUpdate = true; c.repeat.set(x, y); return c; }
export function materials(biome) {
  if (MAT[biome]) return MAT[biome];
  const m = {};
  if (biome === 'lobby') { m.wall = lam({ map: T.wallpaper() }); m.floor = lam({ map: T.carpet() }); m.ceil = lam({ map: T.ceiling() }); }
  if (biome === 'office') { m.wall = lam({ map: T.officeWall() }); m.floor = lam({ map: T.officeCarpet() }); m.ceil = lam({ map: T.ceiling() }); }
  if (biome === 'pool') { m.wall = lam({ map: T.tile() }); m.floor = lam({ map: T.tile() }); m.ceil = lam({ map: T.tile(), color: 0xf4fbff }); }
  if (biome === 'play') { m.wall = lam({ map: T.playWall() }); m.floor = lam({ map: T.foam() }); m.ceil = lam({ map: T.ceiling(), color: 0xd8c8d0 }); }
  if (biome === 'parking') { m.wall = lam({ map: T.concrete(), color: 0xa8a49c }); m.floor = lam({ map: T.concrete(), color: 0x8a867e }); m.ceil = lam({ map: T.concrete(), color: 0x77736c }); }
  if (biome === 'hotel') { m.wall = lam({ map: T.hotelWall() }); m.floor = lam({ map: T.rug() }); m.ceil = lam({ map: T.ceiling(), color: 0xb8ab90 }); }
  const lc = { lobby: 0xfff4d0, office: 0xeef4ff, pool: 0xffffff, play: 0xffd8c0, parking: 0xffb060, hotel: 0xffc88a }[biome];
  m.lamp = new THREE.MeshBasicMaterial({ color: lc }); m.lampDead = lam({ color: 0x3a3a36 });
  m.fabric = lam({ map: T.fabric() }); m.desk = lam({ color: 0x8a7a62 }); m.dark = lam({ color: 0x24262a }); m.screen = new THREE.MeshBasicMaterial({ map: T.screen() });
  m.metal = lam({ map: T.metal() }); m.door = lam({ map: T.door() }); m.yellow = lam({ color: 0xc9a227 }); m.fur = lam({ color: 0x6b4a2e });
  m.toys = [0xd94a4a, 0x3f7fd0, 0xe8c23a, 0x4aa86a].map((c) => lam({ color: c }));
  m.water = new THREE.MeshLambertMaterial({ color: 0x7fd3e0, transparent: true, opacity: 0.55, emissive: 0x104050, depthWrite: false });
  return (MAT[biome] = m);
}

// ---------------------------------------------------------------- geometry builder (one merged mesh per material)
class Builder {
  constructor() { this.p = []; this.n = []; this.u = []; this.i = []; }
  quad(a, b, c, d, nrm, uv) { // corners in order, uv = [[u,v] x4]
    const o = this.p.length / 3; for (const q of [a, b, c, d]) this.p.push(q[0], q[1], q[2]);
    for (let k = 0; k < 4; k++) this.n.push(nrm[0], nrm[1], nrm[2]);
    for (const t of uv) this.u.push(t[0], t[1]); this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  // axis-aligned box; s = metres per texture repeat (sides use length × height), vMode 'h' maps v to 0..1 over the box height
  box(x0, y0, z0, x1, y1, z1, s = 2, vMode = null, faces = 'all') {
    const V = (y) => (vMode === 'h' ? (y - y0) / (y1 - y0) : y / s);
    const f = (k) => faces === 'all' || faces.includes(k);
    if (f('top')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [[x0 / s, z1 / s], [x1 / s, z1 / s], [x1 / s, z0 / s], [x0 / s, z0 / s]]);
    if (f('bot')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], [[x0 / s, z0 / s], [x1 / s, z0 / s], [x1 / s, z1 / s], [x0 / s, z1 / s]]);
    if (f('n')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [[-x1 / s, V(y0)], [-x0 / s, V(y0)], [-x0 / s, V(y1)], [-x1 / s, V(y1)]]);
    if (f('s')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [[x0 / s, V(y0)], [x1 / s, V(y0)], [x1 / s, V(y1)], [x0 / s, V(y1)]]);
    if (f('w')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [[z0 / s, V(y0)], [z1 / s, V(y0)], [z1 / s, V(y1)], [z0 / s, V(y1)]]);
    if (f('e')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [[-z1 / s, V(y0)], [-z0 / s, V(y0)], [-z0 / s, V(y1)], [-z1 / s, V(y1)]]);
  }
  mesh(mat) {
    if (!this.i.length) return null; const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2)); g.setIndex(this.i);
    g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; m.updateMatrix(); return m;
  }
}

const sphereGeo = new THREE.SphereGeometry(1, 10, 8), bottleGeo = new THREE.CylinderGeometry(0.07, 0.08, 0.3, 10);
sphereGeo.userData.shared = bottleGeo.userData.shared = true;
const own = (m) => { m.userData.own = true; return m; };

/** Build the meshes for one chunk. Returns {group, lamps: [{x,y,z,dead,flicker}], items: [{id, mesh}], glitch: mesh|null}. */
export function buildChunk(ch, heightOf) {
  const M = materials(ch.biome), H = ch.height, group = new THREE.Group();
  group.position.set(ch.cx * CHUNK, 0, ch.cz * CHUNK);
  const b = { wall: new Builder(), floor: new Builder(), ceil: new Builder(), lamp: new Builder(), lampDead: new Builder(), fabric: new Builder(), desk: new Builder(), dark: new Builder(), screen: new Builder(), metal: new Builder(), door: new Builder(), yellow: new Builder(), water: new Builder(), fur: new Builder(), toy0: new Builder(), toy1: new Builder(), toy2: new Builder(), toy3: new Builder() };
  const ws = ch.biome === 'hotel' || ch.biome === 'play' ? 'h' : null, wsz = ch.biome === 'hotel' ? 3 : ch.biome === 'play' ? 4 : ch.biome === 'lobby' ? 2.5 : 2;
  // floors, ceilings, pools
  for (const c of ch.cells) {
    const x0 = c.i * CELL, z0 = c.j * CELL, x1 = x0 + CELL, z1 = z0 + CELL, fs = ch.biome === 'pool' ? 2 : ch.biome === 'parking' ? 4 : 2;
    if (c.pool) {
      const d = -1.3; b.floor.box(x0, d - 0.1, z0, x1, d, z1, fs, null, ['top']);
      b.floor.box(x0, d, z0, x1, 0, z0 + 0.001, fs, null, ['s']); b.floor.box(x0, d, z1 - 0.001, x1, 0, z1, fs, null, ['n']);
      b.floor.box(x0, d, z0, x0 + 0.001, 0, z1, fs, null, ['e']); b.floor.box(x1 - 0.001, d, z0, x1, 0, z1, fs, null, ['w']);
      b.water.quad([x0, -0.18, z1], [x1, -0.18, z1], [x1, -0.18, z0], [x0, -0.18, z0], [0, 1, 0], [[0, 1], [1, 1], [1, 0], [0, 0]]);
    } else b.floor.quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0], [[x0 / fs, z1 / fs], [x1 / fs, z1 / fs], [x1 / fs, z0 / fs], [x0 / fs, z0 / fs]]);
    b.ceil.quad([x0, H, z0], [x1, H, z0], [x1, H, z1], [x0, H, z1], [0, -1, 0], [[x0 / 2, z0 / 2], [x1 / 2, z0 / 2], [x1 / 2, z1 / 2], [x0 / 2, z1 / 2]]);
  }
  // walls: this chunk owns its west and north borders and everything inside; east/south borders belong to the neighbours
  const nbH = { w: heightOf(ch.nb.w), n: heightOf(ch.nb.n) };
  for (let i = 0; i < CH; i++) for (let j = 0; j < CH; j++) {
    if (ch.v[i][j]) { const h = i === 0 ? Math.max(H, nbH.w) : H; b.wall.box(i * CELL - 0.1, 0, j * CELL - 0.1, i * CELL + 0.1, h, (j + 1) * CELL + 0.1, ws ? h : wsz, ws); }
    if (ch.h[i][j]) { const h = j === 0 ? Math.max(H, nbH.n) : H; b.wall.box(i * CELL - 0.1, 0, j * CELL - 0.1, (i + 1) * CELL + 0.1, h, j * CELL + 0.1, ws ? h : wsz, ws); }
  }
  // lights
  const lamps = [];
  for (const L of ch.lights) {
    const t = L.dead ? b.lampDead : b.lamp;
    if (L.kind === 'tube') t.box(L.x - 0.7, H - 0.08, L.z - 0.06, L.x + 0.7, H - 0.01, L.z + 0.06, 1);
    else if (L.kind === 'lamp') t.box(L.x - 0.25, H - 0.12, L.z - 0.25, L.x + 0.25, H - 0.01, L.z + 0.25, 1);
    else t.box(L.x - 0.6, H - 0.03, L.z - 0.3, L.x + 0.6, H - 0.005, L.z + 0.3, 1);
    lamps.push({ x: L.x + ch.cx * CHUNK, y: H - 0.3, z: L.z + ch.cz * CHUNK, dead: L.dead, flicker: L.flicker, phase: (L.x * 7 + L.z * 13) % 6.28 });
  }
  // props
  const r = rng(hash(ch.cx, ch.cz, 99));
  for (const p of ch.props) {
    if (p.type === 'desk') {
      const rotd = p.rot % 2, w = rotd ? 0.8 : 1.6, d = rotd ? 1.6 : 0.8;
      b.desk.box(p.x - w / 2, 0.72, p.z - d / 2, p.x + w / 2, 0.76, p.z + d / 2, 1);
      b.desk.box(p.x - w / 2, 0, p.z - d / 2, p.x - w / 2 + 0.04, 0.72, p.z + d / 2, 1); b.desk.box(p.x + w / 2 - 0.04, 0, p.z - d / 2, p.x + w / 2, 0.72, p.z + d / 2, 1);
      const mx = p.x + (p.rot === 1 ? -0.2 : p.rot === 3 ? 0.2 : 0), mz = p.z + (p.rot === 0 ? -0.2 : p.rot === 2 ? 0.2 : 0);
      b.dark.box(mx - 0.25, 0.76, mz - 0.04, mx + 0.25, 1.1, mz + 0.04, 1);
      (p.on ? b.screen : b.dark).box(mx - 0.22, 0.79, mz + (p.rot === 2 ? -0.05 : 0.041), mx + 0.22, 1.07, mz + (p.rot === 2 ? -0.041 : 0.05), 0.5, 'h', p.rot === 2 ? ['n'] : ['s']);
      const cxp = p.x + (p.rot === 1 ? 0.7 : p.rot === 3 ? -0.7 : 0) * 1.0, czp = p.z + (p.rot === 0 ? 0.75 : p.rot === 2 ? -0.75 : 0);
      b.dark.box(cxp - 0.22, 0.42, czp - 0.22, cxp + 0.22, 0.48, czp + 0.22, 1); b.dark.box(cxp - 0.03, 0, czp - 0.03, cxp + 0.03, 0.42, czp + 0.03, 1);
    } else if (p.type === 'partition') { const l = 1.0; if (p.rot % 2) b.fabric.box(p.x - 0.04, 0, p.z - l, p.x + 0.04, 1.45, p.z + l, 1); else b.fabric.box(p.x - l, 0, p.z - 0.04, p.x + l, 1.45, p.z + 0.04, 1); }
    else if (p.type === 'pillar') b.wall.box(p.x - p.s / 2, 0, p.z - p.s / 2, p.x + p.s / 2, H, p.z + p.s / 2, ws ? H : wsz, ws);
    else if (p.type === 'column') { b.wall.box(p.x - 0.4, 0, p.z - 0.4, p.x + 0.4, H, p.z + 0.4, 2); }
    else if (p.type === 'line') { if (p.rot) b.yellow.box(p.x - 0.06, 0.005, p.z - 1.6, p.x + 0.06, 0.01, p.z + 1.6, 1, null, ['top']); else b.yellow.box(p.x - 1.6, 0.005, p.z - 0.06, p.x + 1.6, 0.01, p.z + 0.06, 1, null, ['top']); }
    else if (p.type === 'pipe') { b.metal.box(p.x - CELL / 2, H - 0.45, p.z - 0.09, p.x + CELL / 2, H - 0.27, p.z + 0.09, 1); b.metal.box(p.x - CELL / 2, H - 0.32, p.z + 0.3, p.x + CELL / 2, H - 0.22, p.z + 0.4, 1); }
    else if (p.type === 'door') {
      const x0 = p.i * CELL, z0 = p.j * CELL, mid = (a) => a + CELL / 2;
      if (p.side === 'n') b.door.box(mid(x0) - 0.55, 0, z0 + 0.1, mid(x0) + 0.55, 2.15, z0 + 0.16, 1.1, 'h');
      if (p.side === 's') b.door.box(mid(x0) - 0.55, 0, z0 + CELL - 0.16, mid(x0) + 0.55, 2.15, z0 + CELL - 0.1, 1.1, 'h');
      if (p.side === 'w') b.door.box(x0 + 0.1, 0, mid(z0) - 0.55, x0 + 0.16, 2.15, mid(z0) + 0.55, 1.1, 'h');
      if (p.side === 'e') b.door.box(x0 + CELL - 0.16, 0, mid(z0) - 0.55, x0 + CELL - 0.1, 2.15, mid(z0) + 0.55, 1.1, 'h');
    } else if (p.type === 'ballpit') {
      const s = 1.2; b.fabric.box(p.x - s, 0, p.z - s, p.x + s, 0.55, p.z - s + 0.1, 1); b.fabric.box(p.x - s, 0, p.z + s - 0.1, p.x + s, 0.55, p.z + s, 1); b.fabric.box(p.x - s, 0, p.z - s, p.x - s + 0.1, 0.55, p.z + s, 1); b.fabric.box(p.x + s - 0.1, 0, p.z - s, p.x + s, 0.55, p.z + s, 1);
      const rr = rng(p.seed), cols = [0xd94a4a, 0x3f7fd0, 0xe8c23a, 0x4aa86a, 0xc06ad0], n = 70;
      const inst = new THREE.InstancedMesh(sphereGeo, own(new THREE.MeshLambertMaterial()), n), m4 = new THREE.Matrix4(), col = new THREE.Color();
      for (let k = 0; k < n; k++) { m4.makeScale(0.11, 0.11, 0.11); m4.setPosition(p.x + (rr() - 0.5) * 2.1, 0.12 + rr() * 0.35, p.z + (rr() - 0.5) * 2.1); inst.setMatrixAt(k, m4); inst.setColorAt(k, col.setHex(cols[k % cols.length]).multiplyScalar(0.7)); }
      group.add(inst);
    } else if (p.type === 'blocks') {
      const rr = rng(p.seed), n = 3 + Math.floor(rr() * 5);
      for (let k = 0; k < n; k++) { const s = 0.15 + rr() * 0.15, x = p.x + (rr() - 0.5) * 2.4, z = p.z + (rr() - 0.5) * 2.4, y = k > 2 && rr() < 0.5 ? s * 2 : 0; b['toy' + (k % 4)].box(x - s, y, z - s, x + s, y + s * 2, z + s, 0.5); }
    } else if (p.type === 'bear') { // a teddy bear, sitting, watching (it doesn't move)
      const bear = new THREE.Group(), fur = M.fur, ball = (x, y, z, s) => { const m = new THREE.Mesh(sphereGeo, fur); m.position.set(x, y, z); m.scale.setScalar(s); bear.add(m); };
      ball(0, 0.22, 0, 0.22); ball(0, 0.52, 0.02, 0.16); ball(-0.11, 0.64, 0.02, 0.06); ball(0.11, 0.64, 0.02, 0.06); ball(-0.17, 0.08, 0.12, 0.08); ball(0.17, 0.08, 0.12, 0.08);
      const eye = (x) => { const m = new THREE.Mesh(sphereGeo, M.dark); m.position.set(x, 0.55, 0.16); m.scale.setScalar(0.022); bear.add(m); }; eye(-0.05); eye(0.05);
      bear.position.set(p.x, 0, p.z); bear.rotation.y = p.rot; group.add(bear);
    }
  }
  // scrawls on walls
  for (const s of ch.scrawls) {
    const x0 = s.i * CELL, z0 = s.j * CELL, pl = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), own(new THREE.MeshLambertMaterial({ map: textTex(s.text), transparent: true, depthWrite: false })));
    const off = 0.115, y = 1.5;
    if (s.side === 'n') { pl.position.set(x0 + CELL / 2, y, z0 + off); }
    if (s.side === 's') { pl.position.set(x0 + CELL / 2, y, z0 + CELL - off); pl.rotation.y = Math.PI; }
    if (s.side === 'w') { pl.position.set(x0 + off, y, z0 + CELL / 2); pl.rotation.y = Math.PI / 2; }
    if (s.side === 'e') { pl.position.set(x0 + CELL - off, y, z0 + CELL / 2); pl.rotation.y = -Math.PI / 2; }
    group.add(pl);
  }
  if (ch.exit) { const sign = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.28, 0.08), new THREE.MeshBasicMaterial({ map: textTex('EXIT', '#5bff8a') , color: 0xffffff })); sign.material.map.repeat.set(1, 1); sign.position.set((ch.exit.i + 0.5) * CELL, H - 0.35, ch.exit.j * CELL + 0.2); group.add(sign); const bk = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.3, 0.06), new THREE.MeshBasicMaterial({ color: 0x0d3a1a })); bk.position.copy(sign.position); bk.position.z -= 0.02; group.add(bk); }
  for (const [k, bl] of Object.entries(b)) {
    const mat = k.startsWith('toy') ? M.toys[+k[3]] : M[k]; const m = bl.mesh(mat); if (m) group.add(m);
  }
  // almond water
  const items = [];
  for (const it of ch.items) { const m = new THREE.Mesh(bottleGeo, own(new THREE.MeshLambertMaterial({ color: 0xf2efe2, emissive: 0x6a6450 }))); m.position.set(it.x, 0.17 + (ch.cells.find((c) => c.i === Math.floor(it.x / CELL) && c.j === Math.floor(it.z / CELL))?.pool ? -1.3 : 0), it.z); group.add(m); items.push({ id: it.id, mesh: m, x: it.x + ch.cx * CHUNK, z: it.z + ch.cz * CHUNK }); }
  let glitch = null;
  if (ch.glitch) { glitch = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.4), glitchMat()); glitch.position.set(ch.glitch.x, 1.2, ch.glitch.z); group.add(glitch); }
  void r;
  return { group, lamps, items, glitch, gx: ch.glitch ? ch.glitch.x + ch.cx * CHUNK : 0, gz: ch.glitch ? ch.glitch.z + ch.cz * CHUNK : 0 };
}

// a shimmering tear in the world (shared animated texture)
let GL_TEX = null, GL_MAT = null;
function glitchMat() {
  if (GL_MAT) return GL_MAT;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; GL_TEX = new THREE.CanvasTexture(c); GL_TEX.magFilter = THREE.NearestFilter;
  GL_MAT = new THREE.MeshBasicMaterial({ map: GL_TEX, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  return GL_MAT;
}
export function animateGlitch(t) {
  if (!GL_TEX) return; const c = GL_TEX.image, g = c.getContext('2d'); g.clearRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 2) { const w = 20 + Math.sin(y * 0.3 + t * 9) * 14 + Math.random() * 12; const v = Math.random() * 255 | 0; g.fillStyle = `rgba(${v},${255 - v / 2},${200 + Math.random() * 55},${0.15 + Math.random() * 0.6})`; g.fillRect(32 - w / 2 + Math.sin(t * 20 + y) * 4, y, w, 2); }
  GL_TEX.needsUpdate = true;
}
export { THREE };
