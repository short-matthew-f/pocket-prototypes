// Orrery: the app. Screens (Levels, Hangar, Shop, Lab), the run renderer, input and synth sound. Rules live in model.js (window.OM).
(() => {
  'use strict';
  const M = window.OM, W = M.W, H = M.H, TAU = Math.PI * 2;
  const $ = (s) => document.querySelector(s);
  const KEY = 'orrery-save-v1';
  let save;
  try { save = M.load(localStorage.getItem(KEY)); } catch (e) { save = M.newSave(); }
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* private mode: play on without saving */ } };
  const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k' : String(Math.floor(n)));

  // ---------------------------------------------------------------- sound: a tiny synth
  const sfx = (() => {
    // Chiptune voices only (square, triangle and stepped noise), a low master level, a soft limiter,
    // and a budget: busy moments drop the small sounds (shots, hits, coins) before anything that matters.
    let ac = null, master = null, nbuf = null; const last = {}; let recent = [];
    const LEVEL = [0, 0.14, 0.3]; // off, low, normal
    const ctx = () => {
      if (!ac) { try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ac.createDynamicsCompressor(); comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
        const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000; // takes the fizz off the squares
        master = ac.createGain(); master.connect(lp); lp.connect(comp); comp.connect(ac.destination);
        const n = ac.sampleRate, b = ac.createBuffer(1, n, n), d = b.getChannelData(0); let v = 0; // 8-bit style noise: random steps held for a few samples
        for (let i = 0; i < n; i++) { if (i % 6 === 0) v = Math.random() < 0.5 ? -1 : 1; d[i] = v; } nbuf = b;
      } catch (e) { ac = null; } }
      if (ac) { master.gain.value = LEVEL[vol()]; if (ac.state === 'suspended') ac.resume(); }
      return ac;
    };
    const vol = () => (save.vol == null ? (save.sfx === false ? 0 : 1) : save.vol);
    // pri 0 = chatter (dropped first), 1 = feedback, 2 = always plays
    const ok = (name, gap, pri = 1) => {
      if (!vol()) return false; const now = performance.now();
      if (last[name] && now - last[name] < gap) return false;
      recent = recent.filter((t) => now - t < 120);
      if (recent.length >= (pri === 0 ? 2 : pri === 1 ? 4 : 99)) return false;
      last[name] = now; recent.push(now); return !!ctx();
    };
    function tone(f, dur, type = 'square', v = 0.1, slide = 0, delay = 0) {
      const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
      o.type = type === 'sawtooth' || type === 'sine' ? (type === 'sine' ? 'triangle' : 'square') : type;
      o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + dur);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, v = 0.1, rate = 1, delay = 0) {
      const t = ac.currentTime + delay, src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = nbuf; src.playbackRate.value = rate; src.loop = true;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
      src.connect(g); g.connect(master); src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
    }
    let coinStep = 0, coinT = 0; const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
    return {
      unlock: () => ctx(),
      vol, cycle: () => { save.vol = (vol() + 2) % 3; save.sfx = save.vol > 0; if (ac) master.gain.value = LEVEL[save.vol]; return save.vol; },
      shoot: () => ok('shoot', 160, 0) && tone(1100, 0.03, 'square', 0.02, 0.7),
      fire: (g) => ok('fire', 170, 0) && (g === 'cannon' ? (tone(160, 0.12, 'square', 0.05, 0.5), noise(0.08, 0.03, 0.4)) : g === 'missile' ? noise(0.15, 0.025, 0.6) : tone(g === 'spread' ? 620 : 980, 0.035, 'square', 0.018, 0.6)),
      laser: () => ok('laser', 300, 0) && tone(1200, 0.18, 'square', 0.025, 0.5),
      hit: () => ok('hit', 110, 0) && tone(260 + Math.random() * 40, 0.035, 'triangle', 0.05, 0.7),
      kill: (big) => ok('kill', big ? 0 : 90, big ? 2 : 1) && (noise(big ? 0.45 : 0.1, big ? 0.09 : 0.04, big ? 0.3 : 0.7), tone(big ? 110 : 220, big ? 0.35 : 0.08, 'triangle', big ? 0.12 : 0.06, 0.4)),
      boom: () => ok('boom', 120, 1) && (noise(0.22, 0.06, 0.35), tone(90, 0.2, 'triangle', 0.1, 0.5)),
      coin: () => { const now = performance.now(); if (now - coinT > 700) coinStep = 0; if (!ok('coin', 90, 0)) return; coinT = now; tone(988 * Math.pow(2, SCALE[coinStep % SCALE.length] / 12), 0.05, 'square', 0.02); coinStep++; },
      hurt: () => ok('hurt', 200, 2) && (noise(0.2, 0.07, 0.5), tone(150, 0.22, 'square', 0.06, 0.5)),
      block: () => ok('block', 130, 0) && tone(1500, 0.03, 'triangle', 0.04, 0.6),
      dash: () => ok('dash', 200, 1) && tone(440, 0.15, 'square', 0.03, 2),
      warn: () => ok('warn', 500, 2) && [0, 0.3, 0.6].forEach((d) => tone(220, 0.18, 'square', 0.05, 1, d)),
      win: () => ok('win', 500, 2) && [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.05, 1, i * 0.1)),
      lose: () => ok('lose', 500, 2) && [392, 330, 262, 196].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, 1, i * 0.14)),
      buy: () => ok('buy', 60, 2) && (tone(784, 0.06, 'square', 0.045), tone(1175, 0.09, 'square', 0.04, 1, 0.06)),
      nope: () => ok('nope', 120, 2) && tone(140, 0.12, 'square', 0.05, 0.8),
      tick: () => ok('tick', 40, 2) && tone(1568, 0.025, 'square', 0.025),
      zap: () => ok('zap', 160, 0) && (noise(0.06, 0.03, 1.4), tone(1400, 0.06, 'square', 0.02, 0.4)),
      lash: () => ok('lash', 160, 0) && noise(0.05, 0.035, 1.2),
      pop: () => ok('pop', 120, 1) && tone(660, 0.1, 'triangle', 0.08, 2),
      nova: () => ok('nova', 300, 2) && (noise(0.45, 0.08, 0.3), tone(110, 0.45, 'triangle', 0.12, 0.3), tone(880, 0.2, 'square', 0.03, 2)),
      power: () => ok('power', 300, 2) && [440, 659, 880].forEach((f, i) => tone(f, 0.12, 'square', 0.035, 1, i * 0.06)),
      hole: () => ok('hole', 300, 2) && (tone(180, 0.9, 'triangle', 0.1, 0.25), noise(0.7, 0.025, 0.2)),
      slow: () => ok('slow', 300, 2) && tone(587, 0.6, 'triangle', 0.08, 0.3),
    };
  })();

  // ---------------------------------------------------------------- 8-bit look: low-res buffers, one fixed palette, ordered dither
  const PAL = ['#08081a', '#161a3a', '#262d5e', '#3b4a8f', '#5a6fc0', '#8fa0e0', '#e8ecff', '#7fdcff', '#2f9fd0', '#a0fff0', '#6bff9e', '#1f8a5c',
    '#ffe066', '#ffb36b', '#ff7a3d', '#ff4d6d', '#8a1f45', '#ff5ad2', '#ffa0d8', '#b07bff', '#5c3aa8', '#9aa6b8', '#b6ff6b', '#ffcf3f']
    .map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
  const PX = 0.5; // run buffer: one pixel per two world units (180 x 320)
  const LUT = new Uint8Array(32768);
  for (let i = 0; i < 32768; i++) {
    const r = ((i >> 10) & 31) * 8 + 4, g = ((i >> 5) & 31) * 8 + 4, b = (i & 31) * 8 + 4; let best = 0, bd = 1e9;
    for (let j = 0; j < PAL.length; j++) { const P = PAL[j], dr = r - P[0], dg = g - P[1], db = b - P[2], d = 2 * dr * dr + 4 * dg * dg + 3 * db * db; if (d < bd) { bd = d; best = j; } }
    LUT[i] = best;
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => Math.round((v / 16 - 0.47) * 26));
  function crunch(cv) { // snap every pixel to the palette; soft edges become hard ones
    const c = cv.getContext('2d'), w = cv.width, h = cv.height; if (!w || !h) return;
    const im = c.getImageData(0, 0, w, h), d = im.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4; if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
      const P0 = PAL[LUT[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]];
      if (Math.abs(d[i] - P0[0]) + Math.abs(d[i + 1] - P0[1]) + Math.abs(d[i + 2] - P0[2]) < 14) { d[i] = P0[0]; d[i + 1] = P0[1]; d[i + 2] = P0[2]; d[i + 3] = 255; continue; } // already a palette colour: no dither
      const o = BAYER[((y & 3) << 2) | (x & 3)], r = Math.max(0, Math.min(255, d[i] + o)), g = Math.max(0, Math.min(255, d[i + 1] + o)), b = Math.max(0, Math.min(255, d[i + 2] + o));
      const P = PAL[LUT[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)]]; d[i] = P[0]; d[i + 1] = P[1]; d[i + 2] = P[2]; d[i + 3] = 255;
    }
    c.putImageData(im, 0, 0);
  }
  const PIXF = '"Press Start 2P",monospace';

  // ---------------------------------------------------------------- drawing parts
  const MCOL = { rotor: '#7fdcff', pendulum: '#ffb36b', slider: '#b9a2ff', piston: '#ff7f9f', cam: '#8dffb7', stepper: '#ffe066', flywheel: '#ff8af0' };
  const ARM = ['#c8d2ff', '#a7b4ec', '#8693cf', '#6c78b2', '#56618f'];
  function drawJoint(c, m, x, y, a, s, t, hub) {
    const col = MCOL[m] || '#fff', r = (hub ? 11 : 8) * s;
    c.save(); c.translate(x, y);
    c.fillStyle = '#0b0e1f'; c.strokeStyle = col; c.lineWidth = 2.2 * s;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
    c.rotate(a); c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 1.6 * s;
    switch (m) {
      case 'rotor': for (let i = 0; i < 3; i++) { c.rotate(TAU / 3); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r * 0.75); c.stroke(); } break;
      case 'pendulum': c.beginPath(); c.moveTo(0, -r * 0.6); c.lineTo(0, r * 0.3); c.stroke(); c.beginPath(); c.arc(0, r * 0.4, r * 0.32, 0, TAU); c.fill(); break;
      case 'slider': c.fillRect(-r * 0.7, -r * 0.3, r * 1.4, r * 0.6); break;
      case 'piston': c.fillRect(-r * 0.35, -r * 0.7, r * 0.7, r * 0.9); c.fillRect(-r * 0.55, r * 0.15, r * 1.1, r * 0.3); break;
      case 'cam': c.beginPath(); c.ellipse(0, 0, r * 0.7, r * 0.38, 0, 0, TAU); c.fill(); break;
      case 'stepper': c.beginPath(); c.moveTo(0, -r * 0.7); c.lineTo(r * 0.6, 0); c.lineTo(0, r * 0.7); c.lineTo(-r * 0.6, 0); c.closePath(); c.stroke(); c.beginPath(); c.arc(0, -r * 0.7, 1.6 * s, 0, TAU); c.fill(); break;
      case 'flywheel': c.lineWidth = 3 * s; c.beginPath(); c.arc(0, 0, r * 0.55, 0, TAU); c.stroke(); c.beginPath(); c.arc(r * 0.55, 0, 2 * s, 0, TAU); c.fill(); break;
    }
    c.restore();
  }
  function drawGadget(c, g, x, y, a, s, t) {
    const G = M.GADGETS[g], col = G.color;
    c.save(); c.translate(x, y); c.rotate(a);
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 2 * s;
    switch (g) {
      case 'blaster': c.fillRect(-2.2 * s, -11 * s, 4.4 * s, 9 * s); c.beginPath(); c.arc(0, 0, 5.5 * s, 0, TAU); c.fill(); break;
      case 'spread': c.beginPath(); c.moveTo(0, 2 * s); c.lineTo(-7 * s, -9 * s); c.lineTo(7 * s, -9 * s); c.closePath(); c.fill(); c.beginPath(); c.arc(0, 2 * s, 4.5 * s, 0, TAU); c.fill(); break;
      case 'laser': c.beginPath(); c.moveTo(0, -11 * s); c.lineTo(6 * s, 0); c.lineTo(0, 6 * s); c.lineTo(-6 * s, 0); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -3 * s, 2.2 * s, 0, TAU); c.fill(); break;
      case 'missile': c.fillRect(-7 * s, -8 * s, 14 * s, 13 * s); c.fillStyle = '#0b0e1f'; c.fillRect(-5 * s, -7 * s, 4 * s, 5 * s); c.fillRect(1 * s, -7 * s, 4 * s, 5 * s); break;
      case 'saw': { c.rotate(t * 18); c.beginPath(); for (let i = 0; i < 16; i++) { const rr = i % 2 ? 9 * s : 13 * s, aa = (i / 16) * TAU; c.lineTo(Math.sin(aa) * rr, -Math.cos(aa) * rr); } c.closePath(); c.fill(); c.fillStyle = '#0b0e1f'; c.beginPath(); c.arc(0, 0, 3 * s, 0, TAU); c.fill(); break; }
      case 'mortar': c.fillRect(-4.5 * s, -12 * s, 9 * s, 10 * s); c.beginPath(); c.arc(0, 0, 7.5 * s, 0, TAU); c.fill(); c.fillStyle = '#0b0e1f'; c.beginPath(); c.arc(0, -11 * s, 3 * s, 0, TAU); c.fill(); break;
      case 'chain': c.beginPath(); c.arc(0, 0, 6 * s, 0, TAU); c.fill(); c.lineWidth = 1.6 * s; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, -6 * s - i * 2.6 * s, (5 - i) * s, 1.6 * s, 0, 0, TAU); c.stroke(); } c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -14 * s, 2.2 * s, 0, TAU); c.fill(); break;
      case 'mines': c.beginPath(); c.arc(0, 0, 6.5 * s, 0, TAU); c.fill(); for (let i = 0; i < 6; i++) { const aa = i / 6 * TAU; c.fillRect(Math.sin(aa) * 8 * s - 1.5 * s, -Math.cos(aa) * 8 * s - 1.5 * s, 3 * s, 3 * s); } c.fillStyle = '#ff4d6d'; c.beginPath(); c.arc(0, 0, 2.2 * s, 0, TAU); c.fill(); break;
      case 'drill': c.beginPath(); c.moveTo(-6 * s, 0); c.lineTo(0, -24 * s); c.lineTo(6 * s, 0); c.closePath(); c.fill(); c.strokeStyle = '#0b0e1f'; c.lineWidth = 1.4 * s; for (let i = 0; i < 4; i++) { const y = -4 * s - i * 5 * s + ((t * 30) % 5) * s, hw = 6 * s * (1 + y / (24 * s)); c.beginPath(); c.moveTo(-hw, y); c.lineTo(hw, y - 2.5 * s); c.stroke(); } c.fillStyle = col; c.fillRect(-7 * s, -1 * s, 14 * s, 6 * s); break;
      case 'sword': c.beginPath(); c.moveTo(-3 * s, -4 * s); c.lineTo(0, -38 * s); c.lineTo(3 * s, -4 * s); c.closePath(); c.fill(); c.fillStyle = '#ffffff'; c.globalAlpha = 0.7; c.fillRect(-0.6 * s, -34 * s, 1.2 * s, 28 * s); c.globalAlpha = 1; c.fillStyle = '#ffcf3f'; c.fillRect(-7 * s, -4 * s, 14 * s, 3 * s); c.beginPath(); c.arc(0, 1 * s, 3.5 * s, 0, TAU); c.fill(); break;
      case 'flail': c.beginPath(); c.arc(0, 0, 4.5 * s, 0, TAU); c.fill(); break;
      case 'whip': c.beginPath(); c.arc(0, 0, 4.5 * s, 0, TAU); c.fill(); c.fillStyle = '#5a2a3a'; c.fillRect(-2 * s, -9 * s, 4 * s, 8 * s); break;
      case 'deflector': c.lineWidth = 3 * s; c.beginPath(); c.moveTo(-14 * s, -6 * s); c.lineTo(0, -14 * s); c.lineTo(14 * s, -6 * s); c.stroke(); c.globalAlpha = 0.3; c.lineTo(0, 0); c.closePath(); c.fill(); c.globalAlpha = 1; c.beginPath(); c.arc(0, 0, 4 * s, 0, TAU); c.fill(); break;
      case 'bubble': c.globalAlpha = 0.45; c.beginPath(); c.arc(0, 0, 9 * s, 0, TAU); c.fill(); c.globalAlpha = 1; c.lineWidth = 1.5 * s; c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.arc(-3 * s, -3 * s, 2 * s, 0, TAU); c.fill(); break;
      case 'pointdef': c.beginPath(); c.arc(0, 0, 6 * s, 0, TAU); c.fill(); c.fillRect(-4 * s, -12 * s, 2.4 * s, 9 * s); c.fillRect(1.6 * s, -12 * s, 2.4 * s, 9 * s); break;
      case 'decoy': c.globalAlpha = 0.5 + 0.3 * Math.sin(t * 8); c.beginPath(); c.moveTo(0, -10 * s); c.lineTo(7 * s, 8 * s); c.lineTo(0, 4 * s); c.lineTo(-7 * s, 8 * s); c.closePath(); c.fill(); c.globalAlpha = 1; break;
      case 'repair': c.beginPath(); c.arc(0, 0, 7 * s, 0, TAU); c.fill(); c.fillStyle = '#0b0e1f'; c.fillRect(-1.5 * s, -4.5 * s, 3 * s, 9 * s); c.fillRect(-4.5 * s, -1.5 * s, 9 * s, 3 * s); c.strokeStyle = col; c.lineWidth = 1.5 * s; c.beginPath(); c.moveTo(-9 * s, -8 * s); c.lineTo(9 * s, -8 * s); c.stroke(); c.beginPath(); c.ellipse(0, -8 * s, 5 * s, 1.5 * s, (t * 30) % TAU, 0, TAU); c.stroke(); break;
      case 'shield': c.globalAlpha = 0.35; c.beginPath(); c.arc(0, 0, 17 * s, -2.4, -0.74); c.arc(0, 0, 11 * s, -0.74, -2.4, true); c.closePath(); c.fill(); c.globalAlpha = 1; c.lineWidth = 2.5 * s; c.beginPath(); c.arc(0, 0, 17 * s, -2.4, -0.74); c.stroke(); c.beginPath(); c.arc(0, 0, 4 * s, 0, TAU); c.fill(); break;
      case 'magnet': c.lineWidth = 4.5 * s; c.beginPath(); c.arc(0, 1 * s, 6 * s, 0, Math.PI); c.stroke(); c.beginPath(); c.moveTo(-6 * s, 1 * s); c.lineTo(-6 * s, -8 * s); c.moveTo(6 * s, 1 * s); c.lineTo(6 * s, -8 * s); c.stroke(); c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(-6 * s, -6 * s); c.lineTo(-6 * s, -9 * s); c.moveTo(6 * s, -6 * s); c.lineTo(6 * s, -9 * s); c.stroke(); break;
    }
    c.restore();
  }
  function drawShip(c, x, y, s, t, blink) {
    c.save(); c.translate(x, y); if (blink) c.globalAlpha = 0.45;
    const g = c.createRadialGradient(0, 4 * s, 2, 0, 4 * s, 26 * s); g.addColorStop(0, '#7fdcff66'); g.addColorStop(1, '#7fdcff00');
    c.fillStyle = g; c.beginPath(); c.arc(0, 4 * s, 26 * s, 0, TAU); c.fill();
    c.fillStyle = '#ff9a4d'; c.beginPath(); c.moveTo(-5 * s, 14 * s); c.lineTo(0, (20 + Math.sin(t * 40) * 3) * s); c.lineTo(5 * s, 14 * s); c.fill();
    c.fillStyle = '#dfe7ff'; c.strokeStyle = '#7fdcff'; c.lineWidth = 1.5 * s;
    c.beginPath(); c.moveTo(0, -17 * s); c.lineTo(12 * s, 13 * s); c.lineTo(0, 7 * s); c.lineTo(-12 * s, 13 * s); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
  const HCOL = { disc: '#7fdcff', cross: '#ffcf3f', needle: '#ff9be6', blob: '#8dffb7', hexagon: '#b9a2ff', spine: '#ffb36b', ring: '#9ff0ff' };
  // The hull body under the sockets.
  function drawHull(c, hu, t, s) {
    const col = HCOL[hu.h] || '#7fdcff', HU = M.HULLS[hu.h];
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    c.fillStyle = col + '22'; c.strokeStyle = col; c.lineWidth = 2.5 * s;
    const poly = (pts) => { c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.closePath(); c.fill(); c.stroke(); };
    const rotPt = (x, y) => { const cs = Math.cos(hu.a), sn = Math.sin(hu.a); return { x: hu.x + (x * cs - y * sn) * s, y: hu.y + (x * sn + y * cs) * s }; };
    switch (hu.h) {
      case 'disc': c.beginPath(); c.arc(hu.x, hu.y, 30 * s, 0, TAU); c.fill(); c.stroke(); c.setLineDash([4 * s, 5 * s]); c.lineDashOffset = -hu.a * 30; c.beginPath(); c.arc(hu.x, hu.y, 22 * s, 0, TAU); c.stroke(); c.setLineDash([]); break;
      case 'cross': for (const [x, y] of HU.sockets) { const p = rotPt(x, y); c.lineWidth = 7 * s; c.strokeStyle = col + '66'; c.beginPath(); c.moveTo(hu.x, hu.y); c.lineTo(p.x, p.y); c.stroke(); } c.lineWidth = 2.5 * s; c.strokeStyle = col; c.beginPath(); c.arc(hu.x, hu.y, 14 * s, 0, TAU); c.fill(); c.stroke(); break;
      case 'needle': poly(HU.body.map(([x, y]) => rotPt(x, y))); break;
      case 'hexagon': poly(HU.sockets.map(([x, y]) => rotPt(x, y))); break;
      case 'ring': c.lineWidth = 6 * s; c.strokeStyle = col + '55'; c.beginPath(); c.arc(hu.x, hu.y, 42 * s, 0, TAU); c.stroke(); c.lineWidth = 2 * s; c.strokeStyle = col; c.beginPath(); c.arc(hu.x, hu.y, 42 * s, 0, TAU); c.stroke(); break;
      case 'blob': if (hu.rim.length) { const pts = hu.rim; c.beginPath(); for (let i = 0; i < pts.length; i++) { const p0 = pts[i], p1 = pts[(i + 1) % pts.length]; const mx = (p0.x + p1.x) / 2, my = (p0.y + p1.y) / 2; if (!i) c.moveTo(mx, my); const p2 = pts[(i + 2) % pts.length]; c.quadraticCurveTo(p1.x, p1.y, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2); } c.closePath(); c.fillStyle = col + '33'; c.fill(); c.stroke(); } break;
      case 'spine': { const segs = hu.segs; c.lineWidth = 3 * s; c.strokeStyle = col + '88'; c.beginPath(); c.moveTo(hu.x, hu.y); for (const g of segs) c.lineTo(g.x, g.y); c.stroke(); c.lineWidth = 2 * s; c.strokeStyle = col; for (let i = segs.length - 1; i >= 0; i--) { const g = segs[i]; c.fillStyle = '#0b0e1f'; c.beginPath(); c.arc(g.x, g.y, (9 - i * 0.6) * s, 0, TAU); c.fill(); c.stroke(); c.fillStyle = col + '44'; c.fill(); } break; }
    }
    c.restore();
  }
  // The whole contraption: hull, arms, rails, joints, gadgets. P = M.pose(...). opts.melee: the run's live flails and lashes.
  function drawRig(c, P, t, s, opts = {}) {
    c.lineCap = 'round';
    if (P.hull) drawHull(c, P.hull, t, s);
    for (const r of P.rails) {
      c.strokeStyle = '#ffffff30'; c.lineWidth = 3 * s;
      if (r.ellipse) { c.beginPath(); c.ellipse(r.x, r.y, r.rx * s, r.ry * s, r.a, 0, TAU); c.setLineDash([3 * s, 4 * s]); c.stroke(); c.setLineDash([]); }
      else { c.beginPath(); c.moveTo(r.x1, r.y1); c.lineTo(r.x2, r.y2); c.stroke(); }
    }
    for (const a of P.arms) { if (a.hull && P.hull && P.hull.h !== 'disc') continue; c.strokeStyle = ARM[Math.min(ARM.length - 1, a.depth)]; c.lineWidth = Math.max(1.5, 4 - a.depth) * s; c.beginPath(); c.moveTo(a.x1, a.y1); c.lineTo(a.x2, a.y2); c.stroke(); }
    if (opts.sockets) for (const so of P.sockets) {
      const on = opts.sel && so.path.join('.') === opts.sel;
      c.strokeStyle = on ? '#fff' : '#7fdcffaa'; c.fillStyle = on ? '#7fdcff55' : '#0b0e1fcc'; c.lineWidth = 2 * s; c.setLineDash(on ? [] : [3 * s, 3 * s]);
      c.beginPath(); c.arc(so.x, so.y, 9 * s, 0, TAU); c.fill(); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#7fdcff'; c.font = `800 ${12 * s}px Nunito,sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+', so.x, so.y + 0.5 * s);
    }
    for (const j of P.joints) {
      if (j.depth === 0) { if (opts.ship) drawShip(c, j.x, j.y, s * 0.8, t, opts.blink); if (opts.sel === '') { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(j.x, j.y, 20 * s, 0, TAU); c.stroke(); } continue; }
      drawJoint(c, j.node.m, j.x, j.y, j.a, s, t, false);
      if (opts.sel != null && j.path.join('.') === opts.sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(j.x, j.y, 15 * s, 0, TAU); c.stroke(); }
    }
    // flails and lashes: live in a run, at rest in the hangar
    const melee = opts.melee || P.gadgets.filter((g) => g.node.g === 'flail' || g.node.g === 'whip').map((g) => {
      const L = g.node.g === 'flail' ? M.GADGETS.flail.len : 22; const x2 = g.x + Math.sin(g.a) * L * s, y2 = g.y - Math.cos(g.a) * L * s;
      return g.node.g === 'flail' ? { k: 'flail', x1: g.x, y1: g.y, x2, y2 } : { k: 'whip', x1: g.x, y1: g.y, x2, y2, mx: (g.x + x2) / 2 + 5 * s, my: (g.y + y2) / 2 };
    });
    for (const m of melee) {
      if (m.k === 'flail') {
        c.strokeStyle = '#8a86a8'; c.lineWidth = 1.5 * s; c.setLineDash([2 * s, 2 * s]); c.beginPath(); c.moveTo(m.x1, m.y1); c.lineTo(m.x2, m.y2); c.stroke(); c.setLineDash([]);
        c.fillStyle = '#c9b8ff'; c.beginPath(); for (let i = 0; i < 12; i++) { const rr = i % 2 ? 6.5 * s : 10 * s, aa = i / 12 * TAU + t * 3; c.lineTo(m.x2 + Math.sin(aa) * rr, m.y2 - Math.cos(aa) * rr); } c.closePath(); c.fill();
      } else if (m.k === 'whip') {
        c.strokeStyle = m.on ? '#ffb3cf' : '#ff7fa8'; c.lineWidth = (m.on ? 3 : 2) * s; c.beginPath(); c.moveTo(m.x1, m.y1); c.quadraticCurveTo(m.mx, m.my, m.x2, m.y2); c.stroke();
        if (m.on) { c.fillStyle = '#fff'; c.beginPath(); c.arc(m.x2, m.y2, 2.5 * s, 0, TAU); c.fill(); }
      }
    }
    for (const g of P.gadgets) {
      drawGadget(c, g.node.g, g.x, g.y, g.a, s, t);
      if (opts.sel != null && g.key === opts.sel) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(g.x, g.y, 16 * s, 0, TAU); c.stroke(); }
    }
  }
  const SCOL = { nova: '#ffcf3f', overdrive: '#ff8af0', blackhole: '#b07bff', tractor: '#7fdcff', timeslow: '#8dffb7' };
  function drawSpecIcon(c, id, r) {
    const col = SCOL[id]; c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = r * 0.1; c.lineCap = 'round';
    switch (id) {
      case 'nova': for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; c.beginPath(); c.moveTo(Math.sin(a) * r * 0.35, -Math.cos(a) * r * 0.35); c.lineTo(Math.sin(a) * r * 0.85, -Math.cos(a) * r * 0.85); c.stroke(); } c.beginPath(); c.arc(0, 0, r * 0.25, 0, TAU); c.fill(); break;
      case 'overdrive': for (const k of [0, 1]) { c.beginPath(); c.arc(0, 0, r * (0.75 - k * 0.3), -2.6 + k, 1.6 + k); c.stroke(); } c.beginPath(); c.moveTo(r * 0.1, -r * 0.6); c.lineTo(-r * 0.2, r * 0.05); c.lineTo(r * 0.12, r * 0.05); c.lineTo(-r * 0.1, r * 0.6); c.stroke(); break;
      case 'blackhole': c.fillStyle = '#05070f'; c.beginPath(); c.arc(0, 0, r * 0.35, 0, TAU); c.fill(); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, 0, r * (0.5 + i * 0.15), i * 2, i * 2 + 3.2); c.stroke(); } break;
      case 'tractor': c.globalAlpha = 0.4; c.beginPath(); c.moveTo(-r * 0.2, r * 0.6); c.lineTo(-r * 0.6, -r * 0.8); c.lineTo(r * 0.6, -r * 0.8); c.lineTo(r * 0.2, r * 0.6); c.closePath(); c.fill(); c.globalAlpha = 1; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, -r * 0.1 - i * r * 0.25, r * (0.2 + i * 0.1), 0.3, Math.PI - 0.3); c.stroke(); } break;
      case 'timeslow': c.beginPath(); c.arc(0, 0, r * 0.7, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -r * 0.5); c.moveTo(0, 0); c.lineTo(r * 0.35, r * 0.15); c.stroke(); break;
    }
    c.restore();
  }
  const ICONS = {};
  function iconURL(k) {
    if (ICONS[k]) return ICONS[k];
    const cv = document.createElement('canvas'); cv.width = cv.height = 96; const c = cv.getContext('2d'); c.translate(48, 48);
    if (M.MOTIONS[k]) { c.strokeStyle = '#a7b4ec'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(-30, 22); c.lineTo(30, -22); c.stroke(); drawJoint(c, k, 0, 0, 0.6, 3.2, 0, false); }
    else if (k === 'flail' || k === 'whip') { c.scale(2.2, 2.2); const P = { gadgets: [{ node: { g: k }, x: k === 'flail' ? -8 : -10, y: k === 'flail' ? 10 : 12, a: k === 'flail' ? 0.7 : 0.5, key: '0' }], joints: [], arms: [], rails: [], sockets: [] }; drawRig(c, P, 0.3, 1); }
    else if (M.GADGETS[k]) drawGadget(c, k, 0, k === 'shield' ? 14 : k === 'sword' ? 30 : k === 'drill' ? 16 : 4, 0, k === 'sword' ? 1.9 : 2.6, 0.3);
    else if (k === 'hub') { drawShip(c, 0, 6, 2.2, 0, false); }
    else if (k.startsWith('hull:')) { const h = k.slice(5), tr = { h, m: 'fixed', kids: M.HULLS[h].sockets.map(() => null) }; const P = M.pose(tr, 0, 0, h === 'spine' ? -40 : 0); const sc = h === 'spine' ? 0.62 : h === 'ring' ? 0.85 : 1.1; c.scale(sc, sc); drawHull(c, P.hull, 0, 1); c.fillStyle = HCOL[h]; for (const so of P.sockets) { c.beginPath(); c.arc(so.x, so.y, 4, 0, TAU); c.fill(); } }
    else if (k.startsWith('spec:')) drawSpecIcon(c, k.slice(5), 38);
    const sm = document.createElement('canvas'); sm.width = sm.height = 32; const sc2 = sm.getContext('2d', { willReadFrequently: true }); sc2.drawImage(cv, 0, 0, 32, 32); crunch(sm);
    return (ICONS[k] = sm.toDataURL());
  }

  // ---------------------------------------------------------------- UI shell
  const page = $('#page');
  let tab = 'levels';
  function refreshTop() {
    $('#coins').textContent = fmt(save.coins); $('#cores').textContent = fmt(save.cores);
    $('#snd').textContent = ['🔇', '🔉', '🔊'][sfx.vol()];
    document.querySelectorAll('#tabs button').forEach((b) => {
      b.classList.toggle('on', b.dataset.tab === tab);
      let dot = false;
      if (b.dataset.tab === 'lab') dot = M.BLUEPRINTS.some((bp) => !M.canUnlock(save, bp.id));
      if (b.dataset.tab === 'hangar') dot = M.pose(save.tree, 0, 0, 0).sockets.length > 0 && Object.keys(save.inv).some((k) => save.unl[k] && M.available(save, k) > 0);
      let d = b.querySelector('.dot'); if (dot && !d) { d = document.createElement('i'); d.className = 'dot'; b.appendChild(d); } else if (!dot && d) d.remove();
    });
  }
  let toastT = 0;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }
  function showModal(html, onClick) {
    const m = $('#modal'), box = m.querySelector('.box'); box.innerHTML = html; m.hidden = false;
    box.onclick = (e) => { const b = e.target.closest('[data-a]'); if (b) onClick(b.dataset.a, b); };
  }
  const hideModal = () => { $('#modal').hidden = true; };
  function setTab(t) { tab = t; render(); page.scrollTop = 0; }
  document.querySelectorAll('#tabs button').forEach((b) => b.addEventListener('click', () => { sfx.unlock(); sfx.tick(); setTab(b.dataset.tab); }));
  $('#snd').addEventListener('click', () => { const v = sfx.cycle(); persist(); refreshTop(); toast(['Sound off', 'Sound: low', 'Sound: normal'][v]); if (v) { sfx.unlock(); sfx.tick(); } });
  function render() {
    refreshTop();
    stopPreview();
    if (tab === 'levels') renderLevels();
    else if (tab === 'hangar') renderHangar();
    else if (tab === 'shop') renderShop();
    else renderLab();
  }

  // ---------------------------------------------------------------- Levels
  let pickLevel = null;
  function renderLevels() {
    const top = save.unlocked, lv = pickLevel && pickLevel <= top ? pickLevel : top;
    const n = Math.max(10, Math.ceil((top + 3) / 5) * 5);
    const starStr = (k) => '★'.repeat(k) + '☆'.repeat(3 - k);
    const total = Object.values(save.stars).reduce((a, b) => a + b, 0);
    page.innerHTML = `<h2>Sector map</h2><p class="sub">Clear a level to open the next. Every new star pays a <b style="color:var(--core)">◆ core</b>. Each 5th level holds a boss.</p>
      <button class="btn go big" data-a="go">Launch level ${lv}${M.isBoss(lv) ? ' · BOSS' : ''}</button>
      <p class="sub" style="text-align:center;margin-top:4px">${save.stars[lv] ? `Best: <span style="color:var(--gold)">${starStr(save.stars[lv])}</span>` : 'Not cleared yet'} · ★ clear · ★★ hull above half · ★★★ also shoot down 85%</p>
      <h3>Levels</h3><div class="grid">${Array.from({ length: n }, (_, i) => i + 1).map((k) => `<button class="lvl${M.isBoss(k) ? ' boss' : ''}${k === lv ? ' cur' : ''}" data-a="pick" data-k="${k}" ${k > top ? 'disabled' : ''}>${M.isBoss(k) ? '☠' : k}<small>${k <= top ? starStr(save.stars[k] || 0) : ''}</small></button>`).join('')}</div>
      <div class="statline">${total} stars · ${fmt(save.stats.kills)} kills · ${save.stats.wins}/${save.stats.runs} levels won</div>`;
    page.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return; sfx.unlock();
      if (b.dataset.a === 'pick') { pickLevel = +b.dataset.k; sfx.tick(); renderLevels(); }
      if (b.dataset.a === 'go') startRun(lv);
    };
  }

  // ---------------------------------------------------------------- Hangar: the contraption editor
  let SEL = null; // path string: '' = hub, '0.1' = a socket or part
  let PV = { raf: 0, t: 0, play: true, trails: null, trailKey: '', scale: 1, last: 0, P: null, comet: [] };
  function stopPreview() { cancelAnimationFrame(PV.raf); PV.raf = 0; }
  const pathOf = (s) => (s === '' || s == null ? [] : s.split('.').map(Number));
  function treeRows() {
    const rows = [], st = M.stats(save);
    const tuneTxt = (n) => `${n.spd}× ${n.rev ? '⟲' : '⟳'}${n.ph ? ' · ' + n.ph * 90 + '°' : ''}`;
    rows.push(`<button class="tr${SEL === '' ? ' on' : ''}" data-p=""><img src="${iconURL('hull:' + save.tree.h)}">${M.HULLS[save.tree.h].name} hull · ${save.tree.m === 'fixed' ? 'fixed' : M.MOTIONS[save.tree.m].name}<small>${save.tree.m === 'fixed' ? '' : tuneTxt(save.tree)}</small></button>`);
    const walk = (node, path, depth) => node.kids.forEach((k, i) => {
      const p = path.concat(i), key = p.join('.'), pad = `style="padding-left:${6 + depth * 18}px"`;
      if (!k) rows.push(`<button class="tr empty${SEL === key ? ' on' : ''}" data-p="${key}" ${pad}><span style="width:26px;text-align:center">＋</span>empty socket</button>`);
      else if (k.m) { rows.push(`<button class="tr${SEL === key ? ' on' : ''}" data-p="${key}" ${pad}><img src="${iconURL(k.m)}">${M.MOTIONS[k.m].name}<small>${tuneTxt(k)}</small></button>`); walk(k, p, depth + 1); }
      else rows.push(`<button class="tr${SEL === key ? ' on' : ''}" data-p="${key}" ${pad}><img src="${iconURL(k.g)}">${M.GADGETS[k.g].name}<small>${save.up.g[k.g] ? 'power ' + save.up.g[k.g] : ''}</small></button>`);
    });
    walk(save.tree, [], 1);
    void st; return rows.join('');
  }
  function tuneControls(n, isHub) {
    const st = `<div class="lab">Speed</div><div class="chips">${M.SPEEDS.map((v) => `<button class="chip${n.spd === v ? ' on' : ''}" data-a="spd" data-v="${v}">${v}×</button>`).join('')}</div>
      <div class="lab">Direction · start angle</div><div class="chips"><button class="chip${!n.rev ? ' on' : ''}" data-a="rev" data-v="0">⟳ clockwise</button><button class="chip${n.rev ? ' on' : ''}" data-a="rev" data-v="1">⟲ anti</button>${[0, 1, 2, 3].map((v) => `<button class="chip${(n.ph || 0) === v ? ' on' : ''}" data-a="ph" data-v="${v}">${v * 90}°</button>`).join('')}</div>`;
    const mot = isHub ? `<div class="lab">Hull spin (free to swap)</div><div class="chips">${M.HULL_MOTIONS.map((m) => `<button class="chip${n.m === m ? ' on' : ''}" data-a="hubm" data-v="${m}" ${m === 'fixed' || save.unl[m] ? '' : 'disabled'}>${m === 'fixed' ? 'Fixed' : M.MOTIONS[m].name}</button>`).join('')}</div>` : '';
    return mot + (isHub && n.m === 'fixed' ? `<div class="lab">Facing</div><div class="chips">${[0, 1, 2, 3].map((v) => `<button class="chip${(n.ph || 0) === v ? ' on' : ''}" data-a="ph" data-v="${v}">${v * 90}°</button>`).join('')}</div>` : st);
  }
  function selPanel() {
    const st = M.stats(save);
    if (SEL == null) return `<div class="sel"><p>Tap a <b style="color:var(--accent)">＋ socket</b> to fit a part, or tap a part to tune or remove it. Joints carry more sockets; gadgets fight. ${st.maxDepth} levels of nesting, ${st.jointSockets} arms per joint.</p></div>`;
    const path = pathOf(SEL), n = M.nodeAt(save.tree, path);
    if (path.length === 0) { const HU = M.HULLS[n.h]; return `<div class="sel"><div class="hd"><img src="${iconURL('hull:' + n.h)}"><b>${HU.name} hull</b></div><p>${HU.desc} Hull ${st.hull}, speed ×${HU.spd}. The ship always fires its nose gun straight up.</p>
      <div class="lab">Hull shape</div><div class="parts">${Object.keys(M.HULLS).map((h) => `<button class="part${h === n.h ? ' on' : ''}" data-a="hull" data-v="${h}" ${save.hulls[h] ? '' : 'disabled'} style="${h === n.h ? 'border-color:var(--accent)' : ''}"><img src="${iconURL('hull:' + h)}">${M.HULLS[h].name}<small>${save.hulls[h] ? M.HULLS[h].sockets.length + ' sockets' : 'Lab'}</small></button>`).join('')}</div>
      ${tuneControls(n, true)}</div>`; }
    if (n === undefined) { SEL = null; return selPanel(); }
    if (!n) {
      const groups = [['Joints', Object.keys(M.MOTIONS)], ...Object.entries(M.GROUPS).map(([g, nm]) => [nm, Object.keys(M.GADGETS).filter((k) => M.GADGETS[k].grp === g)])];
      const btn = (k) => { const av = M.available(save, k), e = M.canPlace(save, path, k); return `<button class="part" data-a="put" data-k="${k}" ${e ? 'disabled' : ''}><img src="${iconURL(k)}">${M.partName(k)}<small>${M.isMotion(k) && path.length >= st.maxDepth ? 'too deep' : av + ' free'}</small></button>`; };
      return `<div class="sel"><div class="hd"><b>Empty socket · level ${path.length}</b></div>
        ${groups.map(([nm, ks]) => { const u = ks.filter((k) => save.unl[k]); return u.length ? `<div class="lab">${nm}</div><div class="parts">${u.map(btn).join('')}</div>` : ''; }).join('')}
        <p>${path.length >= st.maxDepth ? 'Joints can’t go this deep yet: unlock deeper nesting in the Lab. ' : ''}Buy more parts in the Shop.</p></div>`;
    }
    if (n.m) return `<div class="sel"><div class="hd"><img src="${iconURL(n.m)}"><b>${M.MOTIONS[n.m].name} joint</b><button class="btn sm" data-a="rm">Remove</button></div><p>${M.MOTIONS[n.m].desc}</p>${tuneControls(n, false)}</div>`;
    const G = M.GADGETS[n.g];
    return `<div class="sel"><div class="hd"><img src="${iconURL(n.g)}"><b>${G.name}</b><button class="btn sm" data-a="rm">Remove</button></div><p>${G.desc}${save.up.g[n.g] ? ` Power level ${save.up.g[n.g]}.` : ''}</p></div>`;
  }
  function specPanel() {
    const st = M.stats(save), owned = Object.keys(M.SPECIALS).filter((k) => save.specs[k]);
    let h = `<p class="sub">Specials ride in their own slots and get a button during a level. Tap one to fire it; the ring shows the cooldown.</p><div class="cards">`;
    for (let i = 0; i < st.specSlots; i++) {
      const cur = save.spec[i];
      h += `<div class="card" style="flex-direction:column;align-items:stretch"><b>Slot ${i + 1}${cur ? ': ' + M.SPECIALS[cur].name : ': empty'}</b><div class="chips">${owned.map((k) => `<button class="chip${cur === k ? ' on' : ''}" data-a="spec" data-slot="${i}" data-v="${k}">${M.SPECIALS[k].name}</button>`).join('')}${cur ? `<button class="chip" data-a="spec" data-slot="${i}" data-v="">Empty</button>` : ''}</div>${cur ? `<span>${M.SPECIALS[cur].desc} Cooldown ${Math.round(M.SPECIALS[cur].cd * st.capMul)} s.</span>` : ''}</div>`;
    }
    return h + `</div>${Object.keys(M.SPECIALS).length > owned.length ? '<p class="sub" style="margin-top:6px">More specials, and more slots, in the Lab.</p>' : ''}`;
  }
  function renderHangar() {
    page.innerHTML = `<h2>Hangar</h2><p class="sub">Your ship is a clockwork orrery. Every joint moves on its own, carrying whatever sits on its arms.</p>
      <div class="pv"><canvas id="pv"></canvas><div class="pvb"><button class="btn sm" data-a="play">${PV.play ? '❚❚' : '▶'}</button></div><div class="pvhint">The faint lines are the paths your gadgets trace.</div></div>
      <div id="selwrap">${selPanel()}</div>
      <div class="tree" id="tree">${treeRows()}</div>
      <div class="row"><button class="btn" data-a="auto">Auto-build</button><button class="btn" data-a="clear">Clear all</button></div>
      <h3>Specials</h3><div id="specwrap">${specPanel()}</div>`;
    PV.trailKey = '';
    const cv = $('#pv');
    cv.addEventListener('pointerdown', (e) => {
      sfx.unlock();
      const rc = cv.getBoundingClientRect(), x = (e.clientX - rc.left), y = (e.clientY - rc.top);
      const P = PV.P; if (!P) return;
      let best = null, bd = 26 * 26;
      const consider = (px, py, key) => { const d = (px - x) ** 2 + (py - y) ** 2; if (d < bd) { bd = d; best = key; } };
      for (const s of P.sockets) consider(s.x, s.y, s.path.join('.'));
      for (const g of P.gadgets) consider(g.x, g.y, g.key);
      for (const j of P.joints) consider(j.x, j.y, j.path.join('.'));
      if (best != null) { SEL = best; PV.play = false; sfx.tick(); updHangar(); }
    });
    page.onclick = hangarClick;
    startPreview();
  }
  function updHangar() {
    const sw = $('#selwrap'); if (!sw) return;
    sw.innerHTML = selPanel(); $('#tree').innerHTML = treeRows();
    const pb = page.querySelector('[data-a="play"]'); if (pb) pb.textContent = PV.play ? '❚❚' : '▶';
    PV.trailKey = ''; refreshTop(); persist();
  }
  function hangarClick(e) {
    const row = e.target.closest('.tr'); if (row) { SEL = row.dataset.p; sfx.tick(); updHangar(); return; }
    const b = e.target.closest('[data-a]'); if (!b) return; sfx.unlock();
    const a = b.dataset.a, path = pathOf(SEL); let err = '';
    if (a === 'play') { PV.play = !PV.play; b.textContent = PV.play ? '❚❚' : '▶'; return; }
    if (a === 'auto') { M.autoBuild(save); SEL = null; sfx.buy(); }
    else if (a === 'clear') { save.tree.kids = save.tree.kids.map(() => null); SEL = ''; sfx.tick(); }
    else if (a === 'put') { err = M.place(save, path, b.dataset.k); if (!err) { sfx.buy(); if (M.isGadget(b.dataset.k)) { SEL = null; PV.play = true; } } }
    else if (a === 'rm') { err = M.remove(save, path); if (!err) sfx.tick(); }
    else if (a === 'spd') err = M.tune(save, path, 'spd', +b.dataset.v);
    else if (a === 'rev') err = M.tune(save, path, 'rev', b.dataset.v === '1');
    else if (a === 'ph') err = M.tune(save, path, 'ph', +b.dataset.v);
    else if (a === 'hubm') err = M.tune(save, [], 'm', b.dataset.v);
    else if (a === 'hull') { err = M.setHull(save, b.dataset.v); if (!err) { sfx.buy(); PV.play = true; } }
    else if (a === 'spec') { err = M.setSpecial(save, +b.dataset.slot, b.dataset.v || null); if (!err) { sfx.tick(); $('#specwrap').innerHTML = specPanel(); persist(); refreshTop(); return; } }
    if (err) { toast(err); sfx.nope(); }
    else if (['spd', 'rev', 'ph', 'hubm'].includes(a)) { sfx.tick(); PV.play = true; }
    updHangar();
  }
  function startPreview() {
    const cv = $('#pv'); if (!cv) return;
    const c = cv.getContext('2d', { willReadFrequently: true });
    const loop = (now) => {
      PV.raf = requestAnimationFrame(loop);
      if (!cv.isConnected) { stopPreview(); return; }
      const dpr = 0.5, w = cv.clientWidth, h = cv.clientHeight; // two CSS px per pixel
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); PV.trailKey = ''; }
      const dt = PV.last ? Math.min(0.05, (now - PV.last) / 1000) : 0; PV.last = now;
      if (PV.play) PV.t += dt;
      const key = JSON.stringify(save.tree) + w + 'x' + h;
      if (PV.trailKey !== key) { // trace the long spirograph once per change
        PV.trailKey = key;
        let maxR = 40; for (let t = 0; t < 12; t += 0.25) { const P = M.pose(save.tree, t, 0, 0); for (const g of P.gadgets) maxR = Math.max(maxR, Math.hypot(g.x, g.y) + 16); for (const s of P.sockets) maxR = Math.max(maxR, Math.hypot(s.x, s.y) + 12); }
        PV.scale = Math.min(2.2, (Math.min(w, h) / 2 - 10) / maxR);
        const tr = {}; for (let t = 0; t < 24; t += 1 / 40) { const P = M.pose(save.tree, t, 0, 0); for (const g of P.gadgets) (tr[g.key] = tr[g.key] || { g: g.node.g, pts: [] }).pts.push(g.x, g.y); }
        PV.trails = tr;
      }
      const s = PV.scale, cx = w / 2, cy = h / 2;
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      // spirograph
      c.lineWidth = 2; c.globalAlpha = 0.45;
      for (const k in PV.trails) { const T = PV.trails[k]; c.strokeStyle = M.GADGETS[T.g].color; c.beginPath(); for (let i = 0; i < T.pts.length; i += 2) { const x = cx + T.pts[i] * s, y = cy + T.pts[i + 1] * s; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
      c.globalAlpha = 1;
      // comet tails over the last second
      for (let i = 0; i < 24; i++) {
        const t2 = PV.t - i * 0.04; const P2 = M.pose(save.tree, t2, cx / s, cy / s);
        c.globalAlpha = 0.5 * (1 - i / 24);
        for (const g of P2.gadgets) { c.fillStyle = M.GADGETS[g.node.g].color; c.beginPath(); c.arc(g.x * s, g.y * s, 2.4 * (1 - i / 30), 0, TAU); c.fill(); }
      }
      c.globalAlpha = 1;
      // the rig itself, posed in world units around the centre and scaled
      const P = M.pose(save.tree, PV.t, cx / s, cy / s);
      c.save(); c.scale(s, s); drawRig(c, P, PV.t, 1, { sockets: true, sel: SEL, ship: true }); c.restore(); crunch(cv);
      // hit-test copy in CSS px
      PV.P = { sockets: P.sockets.map((o) => ({ ...o, x: o.x * s, y: o.y * s })), gadgets: P.gadgets.map((o) => ({ ...o, x: o.x * s, y: o.y * s })), joints: P.joints.map((o) => ({ ...o, x: o.x * s, y: o.y * s })) };
    };
    PV.last = 0; PV.raf = requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------- Shop
  function renderShop() {
    const parts = [...Object.keys(M.MOTIONS), ...Object.keys(M.GADGETS)].filter((k) => save.unl[k]);
    const grpOf = (k) => (M.MOTIONS[k] ? 'Joints' : M.GROUPS[M.GADGETS[k].grp]);
    const locked = [...Object.keys(M.GADGETS), ...Object.keys(M.MOTIONS)].filter((k) => !save.unl[k]).length;
    const ups = ['hull', 'nose', 'tractor', ...(save.spec.length ? ['cap'] : []), ...Object.keys(M.GADGETS).filter((g) => save.unl[g] && g !== 'decoy').map((g) => 'g:' + g)];
    const upName = (k) => (k.startsWith('g:') ? M.GADGETS[k.slice(2)].name + ' power' : M.UPGRADES[k].name);
    const UPTXT = { shield: 'bigger plate', deflector: 'bigger plate, harder bounces', pointdef: 'longer reach', magnet: 'longer reach', bubble: 'regrows faster', repair: 'repairs faster' };
    const upDesc = (k) => { const l = M.upLevel(save, k), g = k.slice(2); return k.startsWith('g:') ? `Level ${l}: ${UPTXT[g] || `damage ×${(1 + 0.3 * l).toFixed(1)} → ×${(1 + 0.3 * (l + 1)).toFixed(1)}`}` : M.UPGRADES[k].desc(l); };
    page.innerHTML = `<h2>Shop</h2><p class="sub">Spend <b style="color:var(--gold)">● coins</b> on more parts and stronger ones. Fit new parts in the Hangar.</p>
      ${['Joints', ...Object.values(M.GROUPS)].map((gn) => { const ps = parts.filter((k) => grpOf(k) === gn); return ps.length ? `<h3>${gn}</h3><div class="cards">${ps.map((k) => { const c = M.partPrice(save, k); return `<div class="card"><img src="${iconURL(k)}"><div class="tx"><b>${M.partName(k)}</b><span>${(M.GADGETS[k] || M.MOTIONS[k]).desc}</span><span>Owned ${save.inv[k] || 0} · ${M.available(save, k)} unfitted</span></div><button class="btn${save.coins >= c ? ' go' : ''}" data-a="buy" data-k="${k}" ${save.coins >= c ? '' : 'disabled'}>● ${fmt(c)}</button></div>`; }).join('')}</div>` : ''; }).join('')}
      ${locked ? `<p class="sub" style="margin-top:8px">${locked} more parts wait in the Lab.</p>` : ''}
      <h3>Upgrades</h3><div class="cards">${ups.map((k) => { const c = M.upCost(save, k); return `<div class="card${c == null ? ' done' : ''}"><img src="${iconURL(k.startsWith('g:') ? k.slice(2) : k === 'cap' ? 'spec:nova' : 'hub')}"><div class="tx"><b>${upName(k)} ${M.upLevel(save, k) ? '· ' + M.upLevel(save, k) : ''}</b><span>${c == null ? 'Maxed out' : upDesc(k)}</span></div>${c == null ? '' : `<button class="btn${save.coins >= c ? ' go' : ''}" data-a="up" data-k="${k}" ${save.coins >= c ? '' : 'disabled'}>● ${fmt(c)}</button>`}</div>`; }).join('')}</div>`;
    page.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return; sfx.unlock();
      const err = b.dataset.a === 'buy' ? M.buyPart(save, b.dataset.k) : M.buyUp(save, b.dataset.k);
      if (err) { toast(err); sfx.nope(); return; }
      sfx.buy(); persist(); const y = page.scrollTop; renderShop(); refreshTop(); page.scrollTop = y;
      if (b.dataset.a === 'buy') toast(`${M.partName(b.dataset.k)} bought: fit it in the Hangar`);
    };
  }

  // ---------------------------------------------------------------- Lab
  function renderLab() {
    const bps = M.BLUEPRINTS;
    page.innerHTML = `<h2>Lab</h2><p class="sub">Spend <b style="color:var(--core)">◆ cores</b> on blueprints. You earn a core for each new star and three for each boss. A part blueprint comes with one free.</p>
      <div class="cards">${bps.map((b) => { const done = !!save.bp[b.id], e = M.canUnlock(save, b.id), lockedReq = b.req && !save.bp[b.req];
        const desc = b.part ? (M.GADGETS[b.part] || M.MOTIONS[b.part]).desc : b.desc;
        const ic = b.part || (b.hull ? 'hull:' + b.hull : b.spec ? 'spec:' + b.spec : b.id.startsWith('spec') ? 'spec:nova' : 'rotor');
        return `<div class="card${done ? ' done' : ''}"><img src="${iconURL(ic)}"><div class="tx"><b>${b.name}</b><span>${desc}</span>${lockedReq ? `<span>Needs ${M.BP[b.req].name}</span>` : ''}</div>${done ? '<span style="color:var(--green);font-weight:800">Built</span>' : `<button class="btn${e ? '' : ' pink'}" data-a="bp" data-k="${b.id}" ${e ? 'disabled' : ''}>◆ ${b.cost}</button>`}</div>`; }).join('')}</div>`;
    page.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return; sfx.unlock();
      const err = M.unlock(save, b.dataset.k); if (err) { toast(err); sfx.nope(); return; }
      sfx.buy(); persist(); const y = page.scrollTop; renderLab(); refreshTop(); page.scrollTop = y; toast(`${M.BP[b.dataset.k].name} unlocked`);
    };
  }

  // ---------------------------------------------------------------- the run
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const lo = document.createElement('canvas'); lo.width = W * PX; lo.height = H * PX; const lctx = lo.getContext('2d', { willReadFrequently: true });
  let run = null, view = { s: 1, ox: 0, oy: 0, dpr: 1 }, paused = false, raf = 0, lastT = 0, acc = 0;
  let parts = [], floats = [], rings = [], trails = {}, shake = 0, flashT = 0, banner = null, target = null, drag = null;
  const stars = Array.from({ length: 90 }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + (i % 3) * 0.35 }));
  function fit() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const s = Math.min(w / W, h / H); view = { s, ox: (w - W * s) / 2, oy: (h - H * s) / 2, dpr, w, h };
  }
  window.addEventListener('resize', () => { if (run) fit(); });
  function startRun(level) {
    hideModal(); sfx.unlock();
    document.body.classList.add('run'); stopPreview();
    run = M.createRun(save, level); paused = false;
    parts = []; floats = []; rings = []; trails = {}; shake = 0; flashT = 0; target = { x: run.S.hub.x, y: run.S.hub.y }; drag = null;
    banner = { text: M.isBoss(level) ? `LEVEL ${level} · BOSS` : `LEVEL ${level}`, t: 0 };
    $('#hlv').textContent = 'L' + level;
    $('#specs').innerHTML = run.S.spec.map((sp, i) => `<button class="spb" data-i="${i}" aria-label="${M.SPECIALS[sp.id].name}"><img src="${iconURL('spec:' + sp.id)}"><i></i></button>`).join('');
    requestAnimationFrame(() => { fit(); lastT = performance.now(); acc = 0; cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); });
  }
  const toWorld = (cx, cy) => ({ x: (cx - view.ox) / view.s, y: (cy - view.oy) / view.s });
  cv.addEventListener('pointerdown', (e) => {
    if (!run || paused) return; sfx.unlock();
    cv.setPointerCapture(e.pointerId);
    drag = { id: e.pointerId, px: e.clientX, py: e.clientY, hx: run.S.hub.x, hy: run.S.hub.y };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!run || !drag || e.pointerId !== drag.id) return;
    const k = 1.35 / view.s; // relative drag, a little faster than the finger, so your thumb never hides the ship
    target = { x: drag.hx + (e.clientX - drag.px) * k, y: drag.hy + (e.clientY - drag.py) * k };
  });
  const endDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null; };
  cv.addEventListener('pointerup', endDrag); cv.addEventListener('pointercancel', endDrag);
  const keys = {};
  window.addEventListener('keydown', (e) => { keys[e.key] = true; if (e.key === 'Escape' && run && !paused) pause(); });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });
  $('#pause').addEventListener('click', () => pause());
  $('#specs').addEventListener('pointerdown', (e) => { const b = e.target.closest('.spb'); if (!b || !run || paused) return; e.stopPropagation(); e.preventDefault(); if (!run.special(+b.dataset.i)) sfx.nope(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && run && !paused) pause(); });
  function pause() {
    if (!run || run.S.over) return; paused = true;
    showModal(`<h2>Paused</h2><p>Level ${run.S.level}. Retreating keeps the coins you've already picked up.</p><div class="btns"><button class="btn go" data-a="go">Resume</button><button class="btn" data-a="quit">Retreat</button></div>`, (a) => {
      if (a === 'go') { hideModal(); paused = false; lastT = performance.now(); }
      if (a === 'quit') { hideModal(); paused = false; run.quit(); }
    });
  }
  const burst = (x, y, n, col, sp = 120, life = 0.5, size = 2.5) => { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = sp * (0.3 + Math.random()); parts.push({ x, y, vx: Math.sin(a) * v, vy: -Math.cos(a) * v, life, max: life, col, size }); } };
  function handleEvents(S) {
    for (const e of S.ev) {
      switch (e.k) {
        case 'shoot': sfx.shoot(); break;
        case 'fire': sfx.fire(e.g); break;
        case 'laser': sfx.laser(); break;
        case 'hit': burst(e.x, e.y, 3, e.kind === 'nose' ? '#fff' : '#7fdcff', 80, 0.25, 1.8); sfx.hit(); break;
        case 'kill': { const col = M.ENEMIES[e.type].color, big = e.type === 'tank' || e.type === 'boss'; burst(e.x, e.y, big ? 40 : 14, col, big ? 200 : 130, big ? 0.9 : 0.5, big ? 3.5 : 2.6); burst(e.x, e.y, 6, '#fff', 60, 0.3, 2); rings.push({ x: e.x, y: e.y, r: e.r, max: e.r * 3, life: 0.35, t: 0, col }); sfx.kill(big); if (big) shake = Math.max(shake, 6); break; }
        case 'boom': rings.push({ x: e.x, y: e.y, r: 6, max: e.r, life: 0.3, t: 0, col: '#ff9a4d' }); burst(e.x, e.y, 12, '#ffb36b', 110, 0.4, 2.6); sfx.boom(); shake = Math.max(shake, 2.5); break;
        case 'hurt': shake = Math.max(shake, 9); flashT = 0.25; burst(e.x, e.y, 16, '#ff5b6e', 160, 0.5, 2.6); sfx.hurt(); if (navigator.vibrate) try { navigator.vibrate(40); } catch (x) { /* no vibration */ } break;
        case 'coin': floats.push({ x: e.x, y: e.y, text: '+' + Math.max(1, Math.round(e.v)), t: 0, col: '#ffcf3f' }); sfx.coin(); break;
        case 'block': burst(e.x, e.y, 5, '#6bffd8', 90, 0.25, 2); sfx.block(); break;
        case 'spark': burst(e.x, e.y, 2, '#ffffff', 140, 0.2, 1.6); break;
        case 'dash': sfx.dash(); break;
        case 'efire': break;
        case 'ering': rings.push({ x: e.x, y: e.y, r: 10, max: 60, life: 0.4, t: 0, col: '#ff4d6d' }); break;
        case 'boss': banner = { text: '⚠ DREADNOUGHT ⚠', t: 0, col: '#ff4d6d' }; sfx.warn(); break;
        case 'bossdown': shake = 16; for (let i = 0; i < 5; i++) burst(e.x + (Math.random() - 0.5) * 60, e.y + (Math.random() - 0.5) * 40, 30, i % 2 ? '#ff4d6d' : '#ffcf3f', 240, 1.1, 3.5); sfx.kill(true); break;
        case 'zap': sfx.zap(); break;
        case 'mine': break;
        case 'lash': sfx.lash(); break;
        case 'crack': burst(e.x, e.y, 6, '#ffb3cf', 120, 0.25, 2); sfx.hit(); break;
        case 'pd': burst(e.x, e.y, 4, '#ffa0a0', 70, 0.2, 2); sfx.block(); break;
        case 'reflect': burst(e.x, e.y, 5, '#a0fff0', 90, 0.25, 2); sfx.block(); break;
        case 'pop': rings.push({ x: e.x, y: e.y, r: 14, max: 40, life: 0.35, t: 0, col: '#8fd3ff' }); burst(e.x, e.y, 14, '#8fd3ff', 140, 0.4, 2.2); sfx.pop(); break;
        case 'bubble': rings.push({ x: e.x, y: e.y, r: 30, max: 18, life: 0.3, t: 0, col: '#8fd3ff' }); break;
        case 'special': specFx(e); break;
        case 'win': case 'lose': break;
      }
    }
  }
  function specFx(e) {
    const S = run.S;
    if (e.id === 'nova') { rings.push({ x: e.x, y: e.y, r: 10, max: 160, life: 0.45, t: 0, col: '#ffcf3f' }); rings.push({ x: e.x, y: e.y, r: 10, max: 130, life: 0.35, t: 0, col: '#ffffff' }); burst(e.x, e.y, 40, '#ffcf3f', 300, 0.6, 3); shake = Math.max(shake, 8); sfx.nova(); }
    else if (e.id === 'overdrive') { banner = { text: 'OVERDRIVE', t: 0.2, col: '#ff8af0' }; sfx.power(); }
    else if (e.id === 'blackhole') sfx.hole();
    else if (e.id === 'tractor') sfx.power();
    else if (e.id === 'timeslow') { banner = { text: 'TIME SLOW', t: 0.2, col: '#8dffb7' }; sfx.slow(); }
    void S;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!run) return;
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const S = run.S;
    if (!paused && !S.over) {
      // keyboard nudges the target too
      const kx = (keys.ArrowRight || keys.d ? 1 : 0) - (keys.ArrowLeft || keys.a ? 1 : 0), ky = (keys.ArrowDown || keys.s ? 1 : 0) - (keys.ArrowUp || keys.w ? 1 : 0);
      if (kx || ky) target = { x: S.hub.x + kx * 40, y: S.hub.y + ky * 40 };
      acc += dt; let n = 0;
      while (acc >= 1 / 60 && n < 5) {
        acc -= 1 / 60; n++;
        run.update(1 / 60, { tx: target.x, ty: target.y });
        handleEvents(S);
        // trails: gadget paths relative to the hub
        if (S.pose) for (const g of S.pose.gadgets) { const T = trails[g.key] || (trails[g.key] = { col: M.GADGETS[g.node.g].color, pts: [] }); T.pts.push(g.x - S.hub.x, g.y - S.hub.y); if (T.pts.length > 300) T.pts.splice(0, 2); }
        if (S.over) break;
      }
      if (!kx && !ky && !drag) target = { x: target.x, y: target.y };
    }
    // effects tick even while paused-free; they're cosmetic
    if (!paused) {
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; p.life -= dt; }
      parts = parts.filter((p) => p.life > 0); if (parts.length > 600) parts.splice(0, parts.length - 600);
      for (const f of floats) f.t += dt; floats = floats.filter((f) => f.t < 0.8);
      for (const r of rings) r.t += dt; rings = rings.filter((r) => r.t < r.life);
      shake = Math.max(0, shake - 30 * dt); flashT = Math.max(0, flashT - dt);
      for (const s of stars) { s.y += s.z * 40 * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
      if (banner) { banner.t += dt; if (banner.t > 2.2) banner = null; }
    }
    if (S.over && !S.endQueued) { S.endQueued = true; const R = run; setTimeout(() => { if (run === R) endRun(); }, S.outcome === 'win' ? 900 : 700); }
    draw(S);
    // HUD
    const f = Math.max(0, S.hub.hp / S.hub.max), hb = $('#hull'); hb.firstElementChild.style.width = (f * 100).toFixed(1) + '%'; hb.classList.toggle('low', f < 0.35);
    $('#hgot').textContent = '● ' + fmt(S.coinsGot);
    document.querySelectorAll('#specs .spb').forEach((b, i) => { const sp = S.spec[i]; if (!sp) return; const k = 1 - sp.cd / sp.max; b.style.setProperty('--k', (k * 360).toFixed(0) + 'deg'); b.classList.toggle('ready', sp.cd <= 0); });
  }
  function draw(S) {
    const { s, ox, oy, dpr } = view; let c = lctx; c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#161a3a'; c.fillRect(0, 0, lo.width, lo.height);
    const sx = shake ? (Math.random() - 0.5) * shake : 0, sy = shake ? (Math.random() - 0.5) * shake : 0;
    c.setTransform(PX, 0, 0, PX, Math.round(sx * PX), Math.round(sy * PX)); c.save();
    c.fillStyle = '#161a3a'; c.fillRect(0, 0, W, H);
    for (const st of stars) { c.globalAlpha = st.z * 0.8; c.fillStyle = '#cfd8ff'; c.fillRect(st.x, st.y, st.z * 2, st.z * 2); }
    c.globalAlpha = 1;
    // spirograph trails around the hub
    c.lineWidth = 1.2; c.lineJoin = 'round';
    for (const k in trails) {
      const T = trails[k], p = T.pts; if (p.length < 4) continue;
      c.strokeStyle = T.col; c.globalAlpha = 0.55; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i < p.length; i += 2) { const x = S.hub.x + p[i], y = S.hub.y + p[i + 1]; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    c.globalAlpha = 1;
    // tractor beam
    if (S.tractorT > 0) { const g = c.createLinearGradient(0, 0, 0, S.hub.y); g.addColorStop(0, '#7fdcff00'); g.addColorStop(1, '#7fdcff40'); c.fillStyle = g; c.fillRect(S.hub.x - 40, 0, 80, S.hub.y); }
    // black holes
    for (const h of S.holes) { const k = Math.min(1, h.t * 4, (h.dur - h.t) * 4); c.save(); c.translate(h.x, h.y); c.rotate(-h.t * 5); for (let i = 0; i < 4; i++) { c.strokeStyle = `rgba(176,123,255,${0.5 * k})`; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, (30 + i * 22) * k, i, i + 2.4); c.stroke(); } c.fillStyle = '#000'; c.beginPath(); c.arc(0, 0, 16 * k, 0, TAU); c.fill(); c.strokeStyle = '#d9c2ff'; c.lineWidth = 1.5; c.stroke(); c.restore(); }
    // mines
    for (const m of S.mines) { c.fillStyle = '#ffe066'; c.beginPath(); c.arc(m.x, m.y, 5, 0, TAU); c.fill(); if (m.t > 0.4 && Math.floor(m.t * 4) % 2) { c.fillStyle = '#ff4d6d'; c.beginPath(); c.arc(m.x, m.y, 2.2, 0, TAU); c.fill(); } c.strokeStyle = '#ffe06633'; c.beginPath(); c.arc(m.x, m.y, 14, 0, TAU); c.stroke(); }
    // decoys
    for (const d of S.decoys) { c.globalAlpha = 0.35 + 0.15 * Math.sin(S.t * 9); drawShip(c, d.x, d.y, 0.7, S.t, false); c.globalAlpha = 1; }
    // coins
    for (const co of S.coins) { c.fillStyle = '#ffcf3f'; c.beginPath(); c.arc(co.x, co.y, 3.6, 0, TAU); c.fill(); c.fillStyle = '#fff6c0'; c.fillRect(co.x - 1, co.y - 2, 1.6, 1.6); }
    // lasers
    for (const b of S.beams) {
      const w = 3 + 4 * Math.sin(Math.PI * b.k);
      c.strokeStyle = '#ff5ad244'; c.lineWidth = w * 3; c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke();
      c.strokeStyle = '#ff9be6'; c.lineWidth = w; c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = w * 0.35; c.stroke();
    }
    // lightning and point-defence tracers
    for (const z of S.zaps) { c.strokeStyle = '#9ff0ff'; c.lineWidth = 2.2; c.globalAlpha = 1 - z.t / 0.18; c.beginPath(); for (let i = 0; i < z.pts.length; i += 2) { if (!i) { c.moveTo(z.pts[0], z.pts[1]); continue; } const x0 = z.pts[i - 2], y0 = z.pts[i - 1], x1 = z.pts[i], y1 = z.pts[i + 1]; for (let k = 1; k <= 4; k++) { const u = k / 4; c.lineTo(x0 + (x1 - x0) * u + (k < 4 ? (Math.random() - 0.5) * 12 : 0), y0 + (y1 - y0) * u + (k < 4 ? (Math.random() - 0.5) * 12 : 0)); } } c.stroke(); c.globalAlpha = 1; }
    for (const z of S.tracers) { c.strokeStyle = '#ffa0a0'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(z.x1, z.y1); c.lineTo(z.x2, z.y2); c.stroke(); }
    // player shots
    for (const p of S.shots) {
      if (p.kind === 'mortar') { c.fillStyle = '#ff9a4d'; c.beginPath(); c.arc(p.x, p.y, 5.5, 0, TAU); c.fill(); c.fillStyle = '#fff3'; c.beginPath(); c.arc(p.x, p.y, 9, 0, TAU); c.fill(); continue; }
      if (p.kind === 'missile') { c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.fillStyle = '#b6ff6b'; c.fillRect(-2, -6, 4, 10); c.fillStyle = '#ffb36b'; c.fillRect(-1.5, 4, 3, 4 + Math.random() * 4); c.restore(); continue; }
      const col = p.kind === 'nose' ? '#ffffff' : p.kind === 'pellet' ? '#ffd36b' : p.kind === 'reflect' ? '#a0fff0' : '#7fdcff', v = Math.hypot(p.vx, p.vy) || 1;
      c.strokeStyle = col; c.lineWidth = p.kind === 'pellet' ? 2.6 : 2.4; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - (p.vx / v) * 9, p.y - (p.vy / v) * 9); c.stroke();
    }
    // enemies
    for (const e of S.enemies) drawEnemy(c, e, S);
    // enemy bullets
    for (const b of S.eshots) { c.fillStyle = '#ff4d6d55'; c.beginPath(); c.arc(b.x, b.y, 7, 0, TAU); c.fill(); c.fillStyle = '#ffd0d8'; c.beginPath(); c.arc(b.x, b.y, 3.2, 0, TAU); c.fill(); }
    // the ship
    if (S.pose) {
      const blink = S.hub.inv > 0 && Math.floor(S.t * 20) % 2 === 0;
      if (!(S.over && S.outcome === 'lose')) drawRig(c, S.pose, S.rigT, 1, { ship: true, blink, melee: S.melee });
      if (S.bubble.ch > 0) for (let i = 0; i < S.bubble.ch; i++) { c.strokeStyle = `rgba(143,211,255,${0.55 - i * 0.12})`; c.lineWidth = 2; c.beginPath(); c.arc(S.hub.x, S.hub.y, 20 + i * 5 + Math.sin(S.t * 4 + i) * 1.5, 0, TAU); c.stroke(); }
      c.strokeStyle = '#7fdcff22'; c.lineWidth = 1; c.beginPath(); c.arc(S.hub.x, S.hub.y, S.st.tractor, 0, TAU); c.stroke();
    }
    // particles, rings, floaters
    for (const r of rings) { const k = r.t / r.life; c.strokeStyle = r.col; c.globalAlpha = 1 - k; c.lineWidth = 3 * (1 - k) + 0.5; c.beginPath(); c.arc(r.x, r.y, r.r + (r.max - r.r) * k, 0, TAU); c.stroke(); }
    for (const p of parts) { c.globalAlpha = Math.max(0, p.life / p.max); c.fillStyle = p.col; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    c.globalAlpha = 1;
    // boss bar
    const boss = S.enemies.find((e) => e.type === 'boss');
    if (boss) { const f = Math.max(0, boss.hp / boss.max); c.fillStyle = '#08081a'; c.fillRect(30, 46, W - 60, 8); c.fillStyle = '#ff4d6d'; c.fillRect(30, 46, (W - 60) * f, 8); c.strokeStyle = '#e8ecff'; c.lineWidth = 2; c.strokeRect(30, 46, W - 60, 8); }
    c.restore(); crunch(lo);
    // up to the screen with hard pixel edges, then text and flashes at full resolution
    c = ctx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, view.w, view.h);
    c.imageSmoothingEnabled = false; c.drawImage(lo, ox, oy, W * s, H * s);
    c.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy); c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const f of floats) { c.globalAlpha = 1 - f.t / 0.8; c.fillStyle = f.col; c.font = `8px ${PIXF}`; c.fillText(f.text, Math.round(f.x), Math.round(f.y - f.t * 30)); }
    c.globalAlpha = 1;
    if (banner) { const a = banner.t < 0.3 ? banner.t / 0.3 : banner.t > 1.8 ? (2.2 - banner.t) / 0.4 : 1; c.globalAlpha = Math.max(0, a); c.fillStyle = banner.col || '#e8ecff'; c.font = `18px ${PIXF}`; c.fillStyle = '#08081a'; c.fillText(banner.text, W / 2 + 2, H * 0.36 + 2); c.fillStyle = banner.col || '#e8ecff'; c.fillText(banner.text, W / 2, H * 0.36); c.globalAlpha = 1; }
    if (S.slow > 0) { c.fillStyle = 'rgba(80,255,170,0.07)'; c.fillRect(0, 0, W, H); }
    if (S.od > 0) { c.strokeStyle = `rgba(255,138,240,${0.35 + 0.2 * Math.sin(S.t * 20)})`; c.lineWidth = 6; c.strokeRect(3, 3, W - 6, H - 6); }
    if (flashT > 0) { c.fillStyle = `rgba(255,60,80,${flashT * 0.9})`; c.fillRect(0, 0, W, H); }
    c.restore();
  }
  function drawEnemy(c, e, S) {
    const D = M.ENEMIES[e.type], col = e.flash > 0 ? '#ffffff' : D.color, r = e.r;
    c.save(); c.translate(e.x, e.y);
    c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 2;
    const glow = c.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.8); glow.addColorStop(0, D.color + '44'); glow.addColorStop(1, D.color + '00'); c.fillStyle = glow; c.beginPath(); c.arc(0, 0, r * 1.8, 0, TAU); c.fill(); c.fillStyle = col;
    const eye = (y = 0) => { c.fillStyle = '#0b0e1f'; c.beginPath(); c.arc(0, y, r * 0.28, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(r * 0.06, y + r * 0.08, r * 0.1, 0, TAU); c.fill(); };
    switch (e.type) {
      case 'drone': c.beginPath(); c.moveTo(0, r); c.lineTo(r, -r * 0.7); c.lineTo(0, -r * 0.3); c.lineTo(-r, -r * 0.7); c.closePath(); c.fill(); eye(-r * 0.15); break;
      case 'weaver': c.rotate(Math.sin(e.t * 1.7 + e.ph) * 0.5); c.beginPath(); c.moveTo(0, r); c.lineTo(r, 0); c.lineTo(0, -r); c.lineTo(-r, 0); c.closePath(); c.fill(); eye(); break;
      case 'swarm': c.beginPath(); c.moveTo(0, r * 1.2); c.lineTo(r, -r); c.lineTo(-r, -r); c.closePath(); c.fill(); break;
      case 'gunner': c.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; c.lineTo(Math.sin(a) * r, Math.cos(a) * r); } c.closePath(); c.fill(); { const a = Math.atan2(S.hub.x - e.x, -(S.hub.y - e.y)); c.save(); c.rotate(a); c.fillRect(-2.5, -r - 6, 5, 10); c.restore(); } eye(); break;
      case 'dasher':
        if (e.st === 1) { c.save(); c.rotate(e.aim || Math.PI); c.strokeStyle = '#6be0ff' + (Math.floor(e.t2 * 12) % 2 ? '88' : '33'); c.lineWidth = 1.5; c.setLineDash([5, 5]); c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -500); c.stroke(); c.restore(); c.setLineDash([]); }
        c.rotate(e.st === 2 ? Math.atan2(e.vx, -e.vy) : Math.PI); c.beginPath(); c.moveTo(0, -r * 1.3); c.lineTo(r, r); c.lineTo(0, r * 0.4); c.lineTo(-r, r); c.closePath(); c.fill(); break;
      case 'tank': c.beginPath(); c.roundRect ? c.roundRect(-r, -r * 0.8, 2 * r, 1.6 * r, 6) : c.rect(-r, -r * 0.8, 2 * r, 1.6 * r); c.fill(); c.fillStyle = '#0b0e1f'; c.fillRect(-r * 0.8, -r * 0.2, r * 1.6, r * 0.4); eye(-r * 0.0); break;
      case 'splitter': c.beginPath(); c.arc(-r * 0.35, 0, r * 0.75, 0, TAU); c.arc(r * 0.35, 0, r * 0.75, 0, TAU); c.fill(); c.strokeStyle = '#0b0e1f'; c.beginPath(); c.moveTo(0, -r); c.lineTo(0, r); c.stroke(); break;
      case 'boss': {
        c.rotate(Math.sin(e.t) * 0.05);
        c.beginPath(); c.moveTo(-r * 1.4, -r * 0.4); c.lineTo(-r * 0.6, -r); c.lineTo(r * 0.6, -r); c.lineTo(r * 1.4, -r * 0.4); c.lineTo(r * 0.9, r * 0.7); c.lineTo(0, r * 1.05); c.lineTo(-r * 0.9, r * 0.7); c.closePath(); c.fill();
        c.save(); c.rotate(e.t * 1.5); c.strokeStyle = '#0b0e1f'; c.lineWidth = 3; for (let i = 0; i < 6; i++) { c.rotate(TAU / 6); c.beginPath(); c.moveTo(0, r * 0.3); c.lineTo(0, r * 0.6); c.stroke(); } c.restore();
        c.fillStyle = '#0b0e1f'; c.beginPath(); c.arc(0, 0, r * 0.32, 0, TAU); c.fill(); c.fillStyle = e.hp < e.max * 0.5 ? '#ffcf3f' : '#ff4d6d'; c.beginPath(); c.arc(0, 0, r * 0.18, 0, TAU); c.fill();
        break;
      }
    }
    c.restore();
    if ((e.type === 'tank' || e.type === 'gunner' || e.type === 'splitter') && e.hp < e.max) { c.fillStyle = '#00000088'; c.fillRect(e.x - r, e.y - r - 8, 2 * r, 3); c.fillStyle = D.color; c.fillRect(e.x - r, e.y - r - 8, 2 * r * Math.max(0, e.hp / e.max), 3); }
  }
  function endRun() {
    if (!run) return;
    const res = run.result(), out = M.applyResult(save, res);
    persist();
    if (res.win) sfx.win(); else sfx.lose();
    const stars = `${'★'.repeat(res.stars)}<i>${'★'.repeat(3 - res.stars)}</i>`;
    const next = res.level + 1;
    showModal(`<h2>${res.win ? (res.boss ? 'Boss down!' : 'Level clear!') : res.hpFrac > 0 ? 'Retreated' : 'Hull breached'}</h2>
      ${res.win ? `<div class="stars">${stars}</div>` : '<p style="text-align:center">Your coins are safe. Upgrade and try again.</p>'}
      <div class="ln"><span>Shot down</span><span>${res.kills} / ${res.spawned}</span></div>
      <div class="ln"><span>Hull left</span><span>${Math.round(res.hpFrac * 100)}%</span></div>
      <div class="ln"><span>Coins picked up</span><b>● ${fmt(out.coins)}</b></div>
      ${res.win ? `<div class="ln"><span>Clear bonus</span><b>● ${fmt(out.bonus)}</b></div>` : ''}
      ${out.cores ? `<div class="ln"><span>${out.firstBoss ? 'New stars + boss' : 'New stars'}</span><b class="c">◆ ${out.cores}</b></div>` : ''}
      <div class="btns">${res.win ? `<button class="btn go" data-a="next">Level ${next}${M.isBoss(next) ? ' · BOSS' : ''}</button>` : ''}<button class="btn${res.win ? '' : ' go'}" data-a="retry">Retry level ${res.level}</button><button class="btn" data-a="hangar">Hangar & shop</button></div>`, (a) => {
      sfx.tick();
      if (a === 'next') startRun(next);
      else if (a === 'retry') startRun(res.level);
      else { hideModal(); leaveRun(); setTab(save.cores && M.BLUEPRINTS.some((b) => !M.canUnlock(save, b.id)) ? 'lab' : 'shop'); }
    });
  }
  function leaveRun() { run = null; cancelAnimationFrame(raf); document.body.classList.remove('run'); pickLevel = null; }

  // ---------------------------------------------------------------- boot
  render();
  if (!save.seen.intro) {
    showModal(`<h2>Orrery</h2><p>Your ship is a clockwork contraption. The hub turns, joints on its arms turn on their own, and every gadget on them fires the way it happens to be facing.</p><p><b>Drag anywhere</b> to fly. Shoot down what comes from the top, scoop up the coins, and clear the level.</p><p>Between levels, buy parts in the <b>Shop</b>, fit and tune them in the <b>Hangar</b>, and spend stars' cores in the <b>Lab</b>.</p><div class="btns"><button class="btn go" data-a="ok">Launch level 1</button><button class="btn" data-a="look">Look at my ship first</button></div>`, (a) => {
      save.seen.intro = 1; persist(); hideModal(); sfx.unlock();
      if (a === 'ok') startRun(1); else setTab('hangar');
    });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  document.body.dataset.ready = '1';
  window.__orrery = { get save() { return save; }, get run() { return run; }, startRun, setTab, M };
})();
