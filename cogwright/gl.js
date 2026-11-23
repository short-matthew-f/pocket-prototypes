// Cogwright 3D: real-time metal gears (three.js) under the 2D canvas.
// app.js stays in charge of layout and input; each frame it hands over a list of gears in CSS pixels and this file draws
// them as extruded, bevelled brass/copper/steel gears lit by a room environment, casting soft shadows on the bench.
// If WebGL is unavailable this file never sets window.CogGL.ready, and app.js keeps its 2D gear drawing.
import * as THREE from './vendor/three.module.min.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const METAL = { // per gear type: base colour, roughness
  main: ['#e0ac3e', 0.2], grunt: ['#c8702e', 0.28], archer: ['#4f9a6a', 0.3], brute: ['#a8482a', 0.3], tinker: ['#3f86b0', 0.26],
  haste: ['#e6b830', 0.22], overcharge: ['#d44f22', 0.28], lightning: ['#8a72f0', 0.24], shield: ['#4fb0c8', 0.24], engine: ['#9ca3ae', 0.18], collector: ['#d6a43a', 0.2],
};
const RARITY = { common: null, magic: '#6b9bff', rare: '#f2c14e', set: '#3fcf74', legendary: '#ff8a1f' };

let renderer, scene, camera, sun, under, underMesh, underTex, underKey = '';
const geoCache = {}, matCache = {}, pool = new Map();
let W = 1, H = 1, DPR = 1;

function gearShape(teeth) { // unit radius, trapezoid teeth, 5 lightening windows and a shaft hole
  const s = new THREE.Shape(), ro = 1, ri = 0.8, n = teeth;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, step = (Math.PI * 2) / n;
    const pts = [[a0, ri], [a0 + step * 0.22, ro], [a0 + step * 0.48, ro], [a0 + step * 0.7, ri]];
    pts.forEach(([a, r], j) => { const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i === 0 && j === 0) s.moveTo(x, y); else s.lineTo(x, y); });
  }
  s.closePath();
  const win = teeth >= 12 ? 6 : 5;
  for (let i = 0; i < win; i++) { // windows between spokes
    const a = (i / win) * Math.PI * 2, da = (Math.PI * 2) / win * 0.32, h = new THREE.Path();
    h.absarc(0, 0, 0.66, a - da, a + da, false); h.absarc(0, 0, 0.42, a + da, a - da, true); h.closePath(); s.holes.push(h);
  }
  return s;
}
function gearGeo(teeth) {
  if (geoCache['g' + teeth]) return geoCache['g' + teeth];
  const g = new THREE.ExtrudeGeometry(gearShape(teeth), { depth: 0.16, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.035, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -0.08); g.computeVertexNormals();
  return (geoCache['g' + teeth] = g);
}
const hubGeo = () => geoCache.hub || (geoCache.hub = new THREE.CylinderGeometry(0.34, 0.37, 0.34, 40).rotateX(Math.PI / 2));
const capGeo = () => geoCache.cap || (geoCache.cap = new THREE.CircleGeometry(0.3, 40));
const rimGeo = () => geoCache.rim || (geoCache.rim = new THREE.TorusGeometry(1.07, 0.03, 8, 64));
function springGeo() {
  if (geoCache.spring) return geoCache.spring;
  const pts = []; for (let i = 0; i <= 160; i++) { const a = i * 0.16, r = 0.06 + (i / 160) * 0.27; pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0.2 + i * 0.0004)); }
  return (geoCache.spring = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.018, 6, false));
}
function metal(base, state) {
  const k = base + ':' + state; if (matCache[k]) return matCache[k];
  const [c, rough] = METAL[base] || METAL.engine;
  const col = new THREE.Color(c);
  if (state === 'idle') col.lerp(new THREE.Color('#6d655b'), 0.65);
  const m = new THREE.MeshStandardMaterial({ color: col, metalness: 0.92, roughness: state === 'idle' ? 0.6 : rough, envMapIntensity: state === 'idle' ? 0.5 : 1.15 });
  if (state === 'jam') { m.emissive = new THREE.Color('#ff2a10'); m.emissiveIntensity = 0.35; }
  return (matCache[k] = m);
}
const glowMat = (c) => matCache['glow' + c] || (matCache['glow' + c] = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9 }));
const embTex = {};
function emblemMat(base, img) { // the hub cap: the Media Helper's emblem when it has landed, else a drawn glyph
  const key = base + (img ? ':img' : ''); if (matCache['cap' + key]) return matCache['cap' + key];
  let tex;
  if (img) tex = new THREE.Texture(img);
  else {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const gr = x.createRadialGradient(54, 50, 6, 64, 64, 64); gr.addColorStop(0, '#fff6d8'); gr.addColorStop(1, '#d9c08a');
    x.fillStyle = gr; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill(); x.lineWidth = 5; x.strokeStyle = '#7a5a26'; x.stroke();
    x.fillStyle = '#3a2614'; x.font = '900 84px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(window.CogData && window.CogData.GEARS[base] ? window.CogData.GEARS[base].icon : '⚙', 64, 68);
    tex = new THREE.CanvasTexture(c);
  }
  tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true; embTex[key] = tex;
  return (matCache['cap' + key] = new THREE.MeshStandardMaterial({ map: tex, metalness: 0.25, roughness: 0.45 }));
}

function makeGear(spec) {
  const grp = new THREE.Group();
  const body = new THREE.Mesh(gearGeo(spec.teeth), metal(spec.base, spec.state)); body.castShadow = true; body.receiveShadow = true; grp.add(body);
  const hub = new THREE.Mesh(hubGeo(), metal(spec.base === 'main' ? 'main' : 'engine', spec.state)); hub.castShadow = true; grp.add(hub);
  if (spec.base === 'main') { const sp = new THREE.Mesh(springGeo(), metal('main', 'spin')); sp.scale.set(2.2, 2.2, 1); sp.position.z = 0.02; grp.add(sp); }
  else { const cap = new THREE.Mesh(capGeo(), emblemMat(spec.base, spec.emblem)); cap.position.z = 0.175; grp.add(cap); grp.userData.cap = cap; }
  const rc = RARITY[spec.rarity]; if (rc) { const rim = new THREE.Mesh(rimGeo(), glowMat(rc)); rim.position.z = 0.02; grp.add(rim); grp.userData.rim = rim; }
  grp.userData.key = gearKey(spec); grp.userData.body = body; grp.userData.hub = hub;
  return grp;
}
const gearKey = (s) => [s.teeth, s.base, s.state, s.rarity, s.emblem ? 1 : 0].join('|');

function init() {
  const cv = document.getElementById('gl'); if (!cv) return;
  try { renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: 'high-performance' }); } catch { return; }
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setClearColor(0x000000, 0);
  scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  camera = new THREE.OrthographicCamera(0, 1, 0, -1, 1, 2000); camera.position.set(0, 0, 1000); camera.lookAt(0, 0, 0);
  scene.add(new THREE.HemisphereLight(0xfff1d6, 0x1a120c, 0.3));
  sun = new THREE.DirectionalLight(0xffe2b0, 2.4); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 6; sun.shadow.bias = -0.0005;
  scene.add(sun); scene.add(sun.target);
  underTex = new THREE.Texture(); underTex.colorSpace = THREE.SRGBColorSpace;
  underMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: underTex, roughness: 0.85, metalness: 0 }));
  underMesh.receiveShadow = true; underMesh.position.z = -40; scene.add(underMesh);
  window.CogGL = { ready: true, frame, icon, THREE };
}

function resize(w, h, dpr) {
  if (w === W && h === H && dpr === DPR) return; W = w; H = h; DPR = dpr;
  renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
  camera.left = 0; camera.right = w; camera.top = 0; camera.bottom = -h; camera.updateProjectionMatrix();
  const S = sun.shadow.camera; S.left = -w; S.right = w; S.top = h; S.bottom = -h; S.near = 1; S.far = 3000; S.updateProjectionMatrix();
  sun.position.set(w * 0.5 - 260, -h * 0.5 + 340, 1400); sun.target.position.set(w * 0.5, -h * 0.5, 0);
}

/** One frame. o = {W, H, dpr, under: canvas|null, underKey, region: {y, h}|null, gears: [{id, x, y, R, teeth, angle, base, rarity, state, sel, emblem}]} */
function frame(o) {
  resize(o.W, o.H, o.dpr);
  if (o.under) {
    if (o.underKey !== underKey) { underKey = o.underKey; underTex.image = o.under; underTex.needsUpdate = true; }
    underMesh.visible = true; underMesh.scale.set(o.W, o.H, 1); underMesh.position.set(o.W / 2, -o.H / 2, -40);
  } else underMesh.visible = false;
  const seen = new Set();
  for (const s of o.gears) {
    const id = s.id; seen.add(id);
    let g = pool.get(id);
    if (!g || g.userData.key !== gearKey(s)) { if (g) scene.remove(g); g = makeGear(s); pool.set(id, g); scene.add(g); }
    g.visible = true;
    g.position.set(s.x, -s.y, s.lift || 0); g.scale.set(s.R, s.R, s.R);
    g.rotation.z = -s.angle; // screen y points down, scene y points up
    if (s.state === 'jam') g.userData.body.material.emissiveIntensity = 0.25 + 0.2 * Math.sin(performance.now() / 90);
    if (g.userData.rim) g.userData.rim.material.opacity = s.sel ? 1 : 0.85;
  }
  for (const [id, g] of pool) if (!seen.has(id)) { scene.remove(g); pool.delete(id); }
  renderer.setScissorTest(!!o.region);
  if (o.region) { renderer.setViewport(0, 0, o.W, o.H); renderer.setScissor(0, o.H - o.region.y - o.region.h, o.W, o.region.h); }
  renderer.render(scene, camera);
  if (o.region) renderer.setScissorTest(false);
}

// small still renders of a gear (drawers, drag ghost, loot lists): cached canvases
const icons = {}; let iconR = null, iconScene = null, iconCam = null;
function icon(spec, px = 96) {
  const k = gearKey(spec) + '|' + px; if (icons[k]) return icons[k];
  if (!iconR) {
    iconR = new THREE.WebGLRenderTarget(px * 2, px * 2); iconR.texture.colorSpace = THREE.SRGBColorSpace;
    iconScene = new THREE.Scene(); iconScene.environment = scene.environment;
    iconScene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a1d12, 0.7)); const d = new THREE.DirectionalLight(0xffe2b0, 1.5); d.position.set(-0.6, 0.8, 1); iconScene.add(d);
    iconCam = new THREE.OrthographicCamera(-1.15, 1.15, 1.15, -1.15, 0.1, 10); iconCam.position.set(0, 0, 5);
  }
  const g = makeGear(spec); g.rotation.z = 0.2; iconScene.add(g);
  const size = px * 2; if (iconR.width !== size) iconR.setSize(size, size);
  renderer.setRenderTarget(iconR); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(iconScene, iconCam); renderer.setRenderTarget(null);
  const buf = new Uint8Array(size * size * 4); renderer.readRenderTargetPixels(iconR, 0, 0, size, size, buf);
  iconScene.remove(g);
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d'), img = x.createImageData(size, size);
  for (let y = 0; y < size; y++) img.data.set(buf.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4); // flip rows
  x.putImageData(img, 0, 0);
  return (icons[k] = c);
}

init();
