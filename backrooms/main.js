// Backrooms: the loop. Streams chunks around you, moves you (dual sticks / mouse+keys / gamepad), pools the nearest
// fluorescent lights into a few real point lights, and keeps the place feeling wrong.
import { THREE, buildChunk, animateGlitch, materials } from './render.js';
import { generateChunk, BIOMES, CHUNK, CELL, CH, collide, hash } from './world.js';
import { createAudio } from './audio.js';

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');
let SEED = +(params.get('seed') || 0) || (() => { try { const s = +localStorage.getItem('backrooms.seed'); if (s) return s; } catch { /* no storage */ } return (Math.random() * 1e9) | 0; })();
try { localStorage.setItem('backrooms.seed', SEED); } catch { /* no storage */ }

// ---------------------------------------------------------------- renderer
const canvas = $('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 90);
scene.fog = new THREE.FogExp2(0xcbb76a, 0.05);
const hemi = new THREE.HemisphereLight(0xfff4d6, 0x5a4a2a, 0.5); scene.add(hemi);
const POOL = 6, plights = [];
for (let i = 0; i < POOL; i++) { const l = new THREE.PointLight(0xfff4d0, 0, 11, 1.6); scene.add(l); plights.push(l); }
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); const o = $('#ov'); o.width = w * devicePixelRatio; o.height = h * devicePixelRatio; }
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- world streaming
const DATA = new Map(), BUILT = new Map();
const key = (cx, cz) => cx + ',' + cz;
function dataOf(cx, cz) { const k = key(cx, cz); let d = DATA.get(k); if (!d) { d = generateChunk(SEED, cx, cz); DATA.set(k, d); if (DATA.size > 400) DATA.delete(DATA.keys().next().value); } return d; }
const heightOf = (b) => BIOMES[b].height;
const RADIUS = 2;
function stream(px, pz, all = false) {
  const pcx = Math.floor(px / CHUNK), pcz = Math.floor(pz / CHUNK);
  const want = [];
  for (let dx = -RADIUS; dx <= RADIUS; dx++) for (let dz = -RADIUS; dz <= RADIUS; dz++) { const k = key(pcx + dx, pcz + dz); if (!BUILT.has(k)) want.push([dx * dx + dz * dz, pcx + dx, pcz + dz]); }
  want.sort((a, b) => a[0] - b[0]);
  for (const [, cx, cz] of want.slice(0, all ? want.length : 1)) { const b = buildChunk(dataOf(cx, cz), heightOf); scene.add(b.group); BUILT.set(key(cx, cz), b); for (const it of b.items) if (picked.has(it.id)) it.mesh.visible = false; }
  for (const [k, b] of BUILT) { const [cx, cz] = k.split(',').map(Number); if (Math.abs(cx - pcx) > RADIUS + 1 || Math.abs(cz - pcz) > RADIUS + 1) { scene.remove(b.group); dispose(b.group); BUILT.delete(k); } }
}
function dispose(obj) { obj.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose(); if (o.material && o.material.userData && o.material.userData.own) o.material.dispose(); }); }
function solidsNear(x, z) {
  const out = [], pcx = Math.floor(x / CHUNK), pcz = Math.floor(z / CHUNK);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const d = dataOf(pcx + dx, pcz + dz), ox = d.cx * CHUNK, oz = d.cz * CHUNK;
    for (const s of d.solids) { const b = { x0: s.x0 + ox, x1: s.x1 + ox, z0: s.z0 + oz, z1: s.z1 + oz }; if (b.x1 > x - 3 && b.x0 < x + 3 && b.z1 > z - 3 && b.z0 < z + 3) out.push(b); }
  }
  return out;
}
function cellAt(x, z) { const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK), d = dataOf(cx, cz), i = Math.floor((x - cx * CHUNK) / CELL), j = Math.floor((z - cz * CHUNK) / CELL); return { d, c: d.cells[j * CH + i] }; }

// ---------------------------------------------------------------- player + state
const P = { x: CELL * 1.5, z: CELL * 1.5, y: 1.6, yaw: Math.PI * 0.25, pitch: 0, bob: 0, walked: 0, vx: 0, vz: 0 };
const picked = new Set(); let almond = 0;
try { const sv = JSON.parse(localStorage.getItem('backrooms.save.' + SEED) || 'null'); if (sv) { Object.assign(P, sv.p); almond = sv.almond || 0; for (const id of sv.picked || []) picked.add(id); } } catch { /* fresh */ }
let level = null, started = false, paused = false, sens = 1, invert = false;
try { const st = JSON.parse(localStorage.getItem('backrooms.settings') || '{}'); sens = st.sens || 1; invert = !!st.invert; } catch { /* defaults */ }
const audio = createAudio();
function save() { try { localStorage.setItem('backrooms.save.' + SEED, JSON.stringify({ p: { x: P.x, z: P.z, yaw: P.yaw, walked: P.walked }, almond, picked: [...picked].slice(-500) })); } catch { /* no storage */ } }
setInterval(() => { if (started) save(); }, 4000); addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (started) setPaused(true); } });

// ---------------------------------------------------------------- input: dual sticks, mouse + keys, gamepad
const sticks = { L: null, R: null }; const keys = new Set(); let mouseDX = 0, mouseDY = 0;
const isTouch = matchMedia('(pointer: coarse)').matches;
const ov = $('#ov');
ov.addEventListener('pointerdown', (e) => {
  if (!started || paused) return; audio.start();
  if (e.pointerType === 'mouse') { if (!document.pointerLockElement) lock(); return; }
  const side = e.clientX < innerWidth / 2 ? 'L' : 'R'; if (sticks[side]) return;
  sticks[side] = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY }; ov.setPointerCapture(e.pointerId);
});
ov.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') { if (document.pointerLockElement) { mouseDX += e.movementX; mouseDY += e.movementY; } return; }
  for (const s of ['L', 'R']) if (sticks[s] && sticks[s].id === e.pointerId) { sticks[s].x = e.clientX; sticks[s].y = e.clientY; }
});
const release = (e) => { for (const s of ['L', 'R']) if (sticks[s] && sticks[s].id === e.pointerId) sticks[s] = null; };
ov.addEventListener('pointerup', release); ov.addEventListener('pointercancel', release);
addEventListener('keydown', (e) => { keys.add(e.code); if (e.code === 'Escape' && started) setPaused(!paused); if (e.code === 'KeyM') { audio.start(); } });
addEventListener('keyup', (e) => keys.delete(e.code));
const STICK_R = 60;
function lock() { try { const p = ov.requestPointerLock && ov.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* no pointer lock here */ } }
function stickVec(s) { if (!s) return [0, 0]; let dx = (s.x - s.ox) / STICK_R, dy = (s.y - s.oy) / STICK_R; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; s.ox = s.x - dx * STICK_R; s.oy = s.y - dy * STICK_R; } return [dx, dy]; }
function readInput() {
  let [mx, my] = stickVec(sticks.L), [lx, ly] = stickVec(sticks.R);
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (keys.has('KeyA')) mx -= 1; if (keys.has('KeyD')) mx += 1; if (keys.has('ArrowLeft')) lx -= 0.8; if (keys.has('ArrowRight')) lx += 0.8;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const gp of pads) { if (!gp) continue; const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v); mx += dz(gp.axes[0]); my += dz(gp.axes[1]); lx += dz(gp.axes[2] || 0); ly += dz(gp.axes[3] || 0); if (gp.buttons[9] && gp.buttons[9].pressed && !padPause) { padPause = true; setPaused(!paused); } else if (gp.buttons[9] && !gp.buttons[9].pressed) padPause = false; if (started) audio.start(); }
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  return { mx, my, lx, ly, run: keys.has('ShiftLeft') || keys.has('ShiftRight') };
}
let padPause = false;

// ---------------------------------------------------------------- level + lights
const fogCol = new THREE.Color(), targetFog = new THREE.Color(), lampCol = new THREE.Color();
let fogD = 0.05, ampTarget = 0.5, blackout = 0, nextBlackout = 70 + Math.random() * 90, lightTimer = 0, chosen = [];
const LAMP = { lobby: 0xfff1c8, office: 0xe8f0ff, pool: 0xf4fdff, play: 0xffcfb0, parking: 0xffa24a, hotel: 0xffbf80 };
function enterLevel(b) {
  if (b === level) return; level = b; const B = BIOMES[b];
  targetFog.setRGB(...B.fog); audio.setLevel(b);
  const t = $('#title'); t.innerHTML = `<b>${B.level}</b><span>${B.name}</span>`; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on');
  try { const seen = JSON.parse(localStorage.getItem('backrooms.levels') || '[]'); if (!seen.includes(b)) { seen.push(b); localStorage.setItem('backrooms.levels', JSON.stringify(seen)); } } catch { /* fine */ }
}
function poolLights(dt, t) {
  lightTimer -= dt;
  if (lightTimer <= 0) { lightTimer = 0.2; const all = []; for (const b of BUILT.values()) for (const L of b.lamps) if (!L.dead) { const d = (L.x - P.x) ** 2 + (L.z - P.z) ** 2; if (d < 400) all.push([d, L]); } all.sort((a, b) => a[0] - b[0]); chosen = all.slice(0, POOL).map((a) => a[1]); }
  const B = BIOMES[level || 'lobby'], base = level === 'pool' ? 2.2 : level === 'parking' ? 2.4 : level === 'play' ? 1.6 : 1.8;
  lampCol.setHex(LAMP[level || 'lobby']);
  plights.forEach((l, i) => {
    const L = chosen[i]; if (!L) { l.intensity = 0; return; }
    l.position.set(L.x, L.y, L.z); l.color.copy(lampCol);
    let f = 1; if (L.flicker) { const n = Math.sin(t * 23 + L.phase) * Math.sin(t * 7.1 + L.phase * 3); f = n > 0.85 - L.flicker * 0.3 ? 0.05 : 0.85 + 0.15 * Math.sin(t * 50 + L.phase); if (f < 0.1 && Math.random() < 0.02) audio.flick(); }
    l.intensity = base * f * (1 - blackout) * (B ? 1 : 1);
  });
  for (const k of Object.keys(BIOMES)) { const M = materials(k); if (M.lamp) M.lamp.color.setHex(LAMP[k]).multiplyScalar(1 - blackout * 0.92); }
}

// ---------------------------------------------------------------- noclip (walk into a glitch)
let noclipT = 0;
function noclip() {
  const a = Math.random() * Math.PI * 2, dist = (40 + Math.random() * 160) * CHUNK;
  const cx = Math.floor((P.x + Math.cos(a) * dist) / CHUNK), cz = Math.floor((P.z + Math.sin(a) * dist) / CHUNK);
  P.x = cx * CHUNK + CELL * (0.5 + Math.floor(Math.random() * CH)); P.z = cz * CHUNK + CELL * (0.5 + Math.floor(Math.random() * CH));
  const { c } = cellAt(P.x, P.z); if (c && c.pool) P.x += CELL;
  const safe = collide(P.x, P.z, 0.35, solidsNear(P.x, P.z)); P.x = safe.x; P.z = safe.z;
  for (const [k, b] of BUILT) { scene.remove(b.group); dispose(b.group); BUILT.delete(k); }
  stream(P.x, P.z, true); noclipT = 1.2; audio.noclip(); level = null;
  const n = $('#noclip'); n.classList.remove('on'); void n.offsetWidth; n.classList.add('on');
}

// ---------------------------------------------------------------- the loop
let last = performance.now(), clock = 0, stepPhase = 0;
const g2 = ov.getContext('2d');
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; clock += dt;
  if (started && !paused) update(dt);
  render();
  requestAnimationFrame(frame);
}
function update(dt) {
  const I = readInput();
  // look
  P.yaw -= (I.lx * 2.6 * dt + mouseDX * 0.0024) * sens; P.pitch -= (I.ly * 1.8 * dt + mouseDY * 0.0024) * sens * (invert ? -1 : 1); mouseDX = mouseDY = 0;
  P.pitch = Math.max(-1.35, Math.min(1.35, P.pitch));
  // move (relative to where you look)
  const here = cellAt(P.x, P.z), wading = !!(here.c && here.c.pool);
  const sp = (wading ? 1.5 : 2.9) * (I.run ? 1.55 : 1), fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const tx = (fx * -I.my + rx * I.mx) * sp, tz = (fz * -I.my + rz * I.mx) * sp;
  P.vx += (tx - P.vx) * Math.min(1, dt * 10); P.vz += (tz - P.vz) * Math.min(1, dt * 10);
  const nx = P.x + P.vx * dt, nz = P.z + P.vz * dt, c = collide(nx, nz, 0.3, solidsNear(nx, nz));
  const moved = Math.hypot(c.x - P.x, c.z - P.z); P.x = c.x; P.z = c.z; P.walked += moved;
  // head bob + footsteps
  const targetY = wading ? 0.25 : 1.6; P.y += (targetY - P.y) * Math.min(1, dt * 4);
  if (moved > 0.0005) { stepPhase += moved * (wading ? 1.6 : 2.2); if (stepPhase > Math.PI) { stepPhase -= Math.PI; audio.step(BIOMES[here.d.biome].floor, wading); } }
  P.bob = Math.sin(stepPhase) * Math.min(1, moved / dt / 3) * 0.035;
  stream(P.x, P.z);
  enterLevel(here.d.biome);
  // pickups + glitches
  for (const b of BUILT.values()) {
    for (const it of b.items) if (!picked.has(it.id) && Math.hypot(it.x - P.x, it.z - P.z) < 0.9) { picked.add(it.id); it.mesh.visible = false; almond++; audio.pickup(); flash(`Almond water ×${almond}`); }
    if (b.glitch && Math.hypot(b.gx - P.x, b.gz - P.z) < 0.7) { noclip(); break; }
  }
  // blackouts: every couple of minutes the lights die for a few seconds
  nextBlackout -= dt;
  if (nextBlackout <= 0 && blackout === 0) { blackout = 0.001; audio.blackout(true); setTimeout(() => { blackoutEnd = true; }, 2500 + Math.random() * 4000); }
  if (blackout > 0) { blackout = blackoutEnd ? Math.max(0, blackout - dt * 6) : Math.min(1, blackout + dt * 8); if (blackoutEnd && blackout === 0) { blackoutEnd = false; nextBlackout = 80 + Math.random() * 120; audio.blackout(false); } }
  audio.tick(dt, level || 'lobby');
  noclipT = Math.max(0, noclipT - dt);
  // fog + ambient follow the level you're in
  const B = BIOMES[level || 'lobby'];
  fogCol.lerp(targetFog, Math.min(1, dt * 1.5)); fogD += (B.fogD * (1 + blackout * 1.2) - fogD) * Math.min(1, dt * 1.5);
  scene.fog.color.copy(fogCol).multiplyScalar(1 - blackout * 0.85); scene.fog.density = fogD; renderer.setClearColor(scene.fog.color);
  ampTarget = B.amb * (1 - blackout * 0.9); hemi.intensity += (ampTarget - hemi.intensity) * Math.min(1, dt * 2); hemi.color.copy(fogCol); hemi.groundColor.copy(fogCol).multiplyScalar(0.75);
  $('#hud-dist').textContent = `${Math.floor(P.walked)} m`; $('#hud-water').textContent = almond;
}
let blackoutEnd = false;
function render() {
  poolLights(0.016, clock); animateGlitch(clock);
  for (const b of BUILT.values()) for (const it of b.items) if (it.mesh.visible) it.mesh.rotation.y = clock * 1.5;
  camera.position.set(P.x, P.y + P.bob, P.z); camera.rotation.set(P.pitch, P.yaw, noclipT * Math.sin(clock * 40) * 0.05, 'YXZ');
  camera.fov = 72 + noclipT * 30; camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  drawSticks();
}
function drawSticks() {
  const d = devicePixelRatio; g2.setTransform(d, 0, 0, d, 0, 0); g2.clearRect(0, 0, innerWidth, innerHeight);
  if (!started || paused || !isTouch) return;
  for (const s of ['L', 'R']) {
    const st = sticks[s], ox = st ? st.ox : s === 'L' ? 90 : innerWidth - 90, oy = st ? st.oy : innerHeight - 110;
    g2.globalAlpha = st ? 0.5 : 0.18; g2.strokeStyle = '#f4ecc8'; g2.lineWidth = 2; g2.beginPath(); g2.arc(ox, oy, STICK_R, 0, 7); g2.stroke();
    const [vx, vy] = stickVec(st); g2.fillStyle = '#f4ecc8'; g2.beginPath(); g2.arc(ox + vx * STICK_R, oy + vy * STICK_R, 22, 0, 7); g2.fill();
    if (!st) { g2.globalAlpha = 0.3; g2.font = '16px VT323, monospace'; g2.textAlign = 'center'; g2.fillText(s === 'L' ? 'MOVE' : 'LOOK', ox, oy + STICK_R + 22); }
  }
  g2.globalAlpha = 1;
}
let flashT = 0;
function flash(msg) { const f = $('#flash'); f.textContent = msg; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); clearTimeout(flashT); }

// ---------------------------------------------------------------- menus
function setPaused(p) { paused = p; $('#pause').hidden = !p; if (p) { audio.mute(true); document.exitPointerLock?.(); $('#seed').textContent = SEED; $('#sens').value = sens; $('#invert').checked = invert; showLevels(); } else audio.mute(false); }
function showLevels() { let seen = []; try { seen = JSON.parse(localStorage.getItem('backrooms.levels') || '[]'); } catch { /* none */ } $('#levels').innerHTML = Object.entries(BIOMES).map(([k, B]) => `<li class="${seen.includes(k) ? 'seen' : ''}">${seen.includes(k) ? `${B.level}: ${B.name}` : '???'}</li>`).join(''); }
$('#start').onclick = () => { started = true; $('#intro').hidden = true; audio.start(); audio.setLevel('lobby', true); if (!isTouch) lock(); };
$('#pausebtn').onclick = () => { if (started) setPaused(true); };
$('#resume').onclick = () => setPaused(false);
$('#sens').oninput = (e) => { sens = +e.target.value; try { localStorage.setItem('backrooms.settings', JSON.stringify({ sens, invert })); } catch { /* fine */ } };
$('#invert').onchange = (e) => { invert = e.target.checked; try { localStorage.setItem('backrooms.settings', JSON.stringify({ sens, invert })); } catch { /* fine */ } };
$('#newworld').onclick = () => { try { localStorage.removeItem('backrooms.seed'); } catch { /* fine */ } location.href = location.pathname; };
document.addEventListener('pointerlockchange', () => { if (!document.pointerLockElement && started && !paused && !isTouch) setPaused(true); });

stream(P.x, P.z, true); enterLevel(cellAt(P.x, P.z).d.biome); $('#title').classList.remove('on');
fogCol.copy(targetFog); requestAnimationFrame(frame);
if (DEV) window.__br = { P, get level() { return level; }, start: () => $('#start').click(), noclip, BUILT, dataOf, setPaused, renderer };
