// Koschei's Tower: browser app (8-bit renderer, touch + keyboard controls, synthesized chiptune, screens).
(() => {
  'use strict';
  const K = window.KT, $ = (s) => document.querySelector(s);
  const ASSETS = window.PP_ASSETS || { img: {}, sfx: {} };
  const W = K.W, R = K.R, HID = K.HID;

  // ================================================================ save
  const SKEY = 'koschei-tower-v1';
  let S = null; try { S = JSON.parse(localStorage.getItem(SKEY)); } catch (e) { S = null; }
  if (!S || S.v !== 1 || !S.heroes) S = K.newSave();
  S.opts = Object.assign({ music: 2, sfx: 2, helped: 0 }, S.opts || {});
  if (!S.heroes[S.who]) S.who = 'bogatyr';
  const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { /* private mode */ } };
  const H = () => S.heroes[S.who];
  const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K' : String(Math.floor(n));

  // ================================================================ audio: chiptune synth + optional samples
  const AU = (() => {
    let ac = null, master, mus, sfxG, noiseBuf; const waves = {}, bufs = {}, last = {};
    const MV = [0, 0.05, 0.1], SV = [0, 0.45, 1];
    function init() {
      if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      ac = new C(); master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      mus = ac.createGain(); mus.connect(master); sfxG = ac.createGain(); sfxG.connect(master); vol();
      const n = ac.sampleRate; noiseBuf = ac.createBuffer(1, n, n); const d = noiseBuf.getChannelData(0);
      let lf = 1, v = 0; for (let i = 0; i < n; i++) { if (i % 3 === 0) { const b = (lf ^ (lf >> 1)) & 1; lf = (lf >> 1) | (b << 14); v = (lf & 1) ? 0.6 : -0.6; } d[i] = v; }
      for (const duty of [0.125, 0.25, 0.5]) { const N = 40, re = new Float32Array(N), im = new Float32Array(N); for (let k = 1; k < N; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty); waves[duty] = ac.createPeriodicWave(re, im); }
      for (const name in (ASSETS.sfx || {})) fetch(ASSETS.sfx[name]).then((r) => r.arrayBuffer()).then((b) => ac.decodeAudioData(b)).then((b) => { bufs[name] = b; }).catch(() => {});
      setInterval(tick, 25);
    }
    function vol() { if (!ac) return; mus.gain.value = MV[S.opts.music]; sfxG.gain.value = SV[S.opts.sfx] * 0.9; }
    function mk(t, f, type) { const o = ac.createOscillator(); if (typeof type === 'number') o.setPeriodicWave(waves[type]); else o.type = type; o.frequency.setValueAtTime(f, t); return o; }
    function tone(f, dur, type = 0.5, v = 0.1, f2 = 0, delay = 0, dest = sfxG, t0) {
      if (!ac) return; const t = t0 != null ? t0 : ac.currentTime + delay; const o = mk(t, f, type), g = ac.createGain();
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.02);
    }
    function noise(dur, v = 0.1, rate = 1, delay = 0, dest = sfxG, t0) {
      if (!ac) return; const t = t0 != null ? t0 : ac.currentTime + delay; const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.playbackRate.value = rate;
      const g = ac.createGain(); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0006, t + dur);
      s.connect(g); g.connect(dest); s.start(t, Math.random() * 0.8); s.stop(t + dur + 0.02);
    }
    const ok = (k, ms) => { const now = performance.now(); if (now - (last[k] || 0) < ms) return false; last[k] = now; return true; };
    function sample(name, v = 1) { if (!bufs[name]) return false; const s = ac.createBufferSource(); s.buffer = bufs[name]; const g = ac.createGain(); g.gain.value = v; s.connect(g); g.connect(sfxG); s.start(); return true; }
    const SYN = {
      move: () => tone(1500, 0.018, 0.5, 0.01),
      rotate: () => tone(880, 0.04, 0.25, 0.022, 1320),
      lock: () => { tone(160, 0.07, 'triangle', 0.1, 70); noise(0.03, 0.015, 0.5); },
      clear: (n) => { const base = 523; for (let i = 0; i <= n; i++) tone(base * Math.pow(2, [0, 4, 7, 12, 16, 19][i] / 12), 0.09, 0.25, 0.035, 0, i * 0.045); },
      clear4: () => { [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone(523 * Math.pow(2, s / 12), 0.1, 0.25, 0.04, 0, i * 0.04)); tone(130, 0.5, 'triangle', 0.12, 260); },
      hit: () => { noise(0.05, 0.05, 1.3); tone(360, 0.06, 0.5, 0.03, 160); },
      crit: () => { noise(0.1, 0.07, 0.8); tone(1250, 0.2, 0.125, 0.035, 900); tone(200, 0.12, 0.5, 0.04, 90); },
      kill: () => { noise(0.45, 0.07, 0.35); [784, 587, 440, 294].forEach((f, i) => tone(f, 0.08, 0.5, 0.035, 0, i * 0.07)); },
      boss: () => { tone(110, 0.9, 'triangle', 0.16, 98); tone(116, 0.9, 0.5, 0.025, 104); noise(0.8, 0.04, 0.2); [220, 207, 196].forEach((f, i) => tone(f, 0.3, 0.25, 0.03, 0, 0.3 * i)); },
      attack: () => { noise(0.16, 0.06, 0.55); tone(130, 0.2, 0.5, 0.045, 55); },
      garbage: () => { noise(0.3, 0.05, 0.22); tone(70, 0.3, 'triangle', 0.1, 50); },
      rocks: () => { for (let i = 0; i < 4; i++) noise(0.03, 0.04, 1.6, i * 0.06); },
      overflow: () => { noise(0.6, 0.1, 0.3); tone(220, 0.55, 0.5, 0.05, 45); },
      fire: () => { noise(0.45, 0.07, 0.6); tone(300, 0.45, 0.25, 0.035, 1500); tone(1800, 0.2, 0.125, 0.02, 2600, 0.25); },
      ice: () => { [1568, 2093, 2637, 2093, 3136].forEach((f, i) => tone(f, 0.12, 'triangle', 0.05, 0, i * 0.05)); },
      earth: () => { noise(0.7, 0.1, 0.15); tone(60, 0.6, 'triangle', 0.15, 35); },
      storm: () => { noise(0.35, 0.12, 1.8); tone(2000, 0.3, 0.5, 0.03, 180); },
      levelup: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.1, 0.25, 0.04, 0, i * 0.08)); },
      coin: () => { tone(1319, 0.05, 0.5, 0.022); tone(1760, 0.09, 0.5, 0.022, 0, 0.05); },
      buy: () => { tone(784, 0.06, 0.5, 0.04); tone(1175, 0.1, 0.5, 0.04, 0, 0.06); },
      nope: () => tone(140, 0.14, 0.5, 0.05, 110),
      win: () => { [392, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 6 ? 0.6 : 0.14, 0.25, 0.05, 0, i * 0.13)); [131, 196, 262].forEach((f, i) => tone(f, 0.5, 'triangle', 0.12, 0, i * 0.35)); },
      lose: () => { [440, 415, 392, 330].forEach((f, i) => tone(f, 0.28, 0.25, 0.045, 0, i * 0.22)); tone(110, 1, 'triangle', 0.12, 82, 0.6); },
      warn: () => { tone(988, 0.06, 0.5, 0.03); tone(988, 0.06, 0.5, 0.03, 0, 0.12); },
    };
    const GAP = { move: 30, rotate: 40, hit: 60, coin: 80, rocks: 150, warn: 400 };
    function play(name, arg) {
      if (!ac || !S.opts.sfx) return;
      if (!ok(name, GAP[name] || 50)) return;
      if (sample(name === 'clear' && arg >= 4 ? 'clear4' : name)) return;
      const f = SYN[name === 'clear' && arg >= 4 ? 'clear4' : name]; if (f) f(arg);
    }

    // ---------------- music: original tunes in a Russian folk idiom (harmonic minor, oom-pah bass, tremolo lead)
    // lead: one token per `tok` sixteenths; '-' holds, '.' rests. chords: one per bar.
    const SONGS = {
      climb: { bpm: 132, tok: 2, bar: 8, duty: 0.25, bass: [[0, 0], [4, 7]], stab: [2, 6], kick: [0, 4], snare: [], hat: [2, 6],
        lead: ['E5 - A5 - G#5 F5 E5 D5 C5 D5 E5 C5 B4 - E4 - A4 B4 C5 A4 D5 C5 B4 A4 G#4 A4 B4 G#4 A4 - - .',
          'E5 - A5 - G#5 F5 E5 D5 C5 D5 E5 F5 G#5 - B5 - A5 G#5 F5 E5 D5 C5 B4 D5 C5 B4 A4 G#4 A4 - A5 .',
          'C5 C5 G5 - F5 E5 D5 C5 B4 B4 F5 - E5 D5 C5 B4 A4 A4 E5 - D5 C5 B4 A4 G#4 B4 D5 F5 E5 - - .',
          'C5 C5 G5 - F5 E5 D5 C5 D5 D5 A5 - G#5 F5 E5 D5 C5 E5 A5 E5 D5 F5 B5 F5 E5 D5 C5 B4 A4 - - .'],
        chords: 'Am E Am E Am Dm E Am Am E Am E Am Dm E Am C Dm G C Am Dm E E C Dm Dm E Am Dm E Am' },
      boss: { bpm: 152, tok: 2, bar: 8, duty: 0.5, bass: [[0, 0], [2, 12], [4, 7], [6, 12]], stab: [2, 6], kick: [0, 4], snare: [4], hat: [2, 6],
        lead: ['D5 . D5 . A4 . D5 E5 F5 E5 D5 C#5 D5 - A4 . Bb4 . Bb4 . A4 . G4 F4 E4 F4 G4 E4 A4 - - .',
          'D5 . D5 . A4 . D5 E5 F5 G5 A5 F5 D6 - A5 . Bb5 A5 G5 F5 E5 F5 G5 E5 C#5 D5 E5 C#5 D5 - - .',
          'F5 F5 E5 D5 C#5 D5 E5 A4 Bb4 Bb4 A4 G4 F4 G4 A4 . G4 A4 Bb4 C#5 D5 E5 F5 G5 A5 G5 F5 E5 D5 - D4 .'],
        chords: 'Dm Dm A Dm Gm Dm A A Dm Dm Dm Dm Gm A A Dm Dm A Gm Dm Gm Dm A Dm' },
      menu: { bpm: 92, tok: 4, bar: 12, duty: 0.125, trem: 1, bass: [[0, 0]], stab: [4, 8], kick: [], snare: [], hat: [],
        lead: ['E5 - - D5 C5 B4 A4 - B4 C5 - - B4 - A4 G4 F#4 E4 F#4 - D#4 E4 - -',
          'G5 - - F#5 E5 D#5 E5 - B4 C5 - - A4 B4 C5 B4 A4 G4 F#4 G4 D#4 E4 - -'],
        chords: 'Em G Am Am B Em B Em Em B Em Am Am Em B Em' },
      koschei: { bpm: 108, tok: 4, bar: 16, duty: 0.25, bass: [[0, 0], [2, 0], [4, 12], [6, 0], [8, 0], [10, 0], [12, 12], [14, 7]], stab: [], kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14],
        lead: ['C4 - Eb4 - D4 - B3 - C4 Eb4 G4 Ab4 G4 - - - F4 - Ab4 - G4 - Eb4 - D4 Eb4 F4 D4 B3 - - -',
          'C5 - Eb5 - D5 - B4 - C5 G4 Ab4 B4 C5 - - - Ab4 G4 F4 Eb4 F4 Eb4 D4 C4 B3 C4 D4 B3 C4 - - -'],
        chords: 'Cm G Cm Cm Fm Cm G G Cm G Ab Cm Fm Fm G Cm' },
    };
    const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const midi = (n) => { const m = /^([A-G])(#|b)?(\d)$/.exec(n); return 12 * (+m[3] + 1) + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); };
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
    function chordOf(c) { const m = /^([A-G])(#|b)?(m)?$/.exec(c); const r = 48 + SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return [r, r + (m[3] ? 3 : 4), r + 7]; }
    for (const k in SONGS) {
      const s = SONGS[k], toks = s.lead.join(' ').split(/\s+/), notes = [];
      toks.forEach((t, i) => { if (t === '-') { if (notes.length && notes[notes.length - 1].open) notes[notes.length - 1].d += s.tok; } else { if (notes.length) notes[notes.length - 1].open = false; if (t !== '.') notes.push({ at: i * s.tok, d: s.tok, m: midi(t), open: true }); } });
      s.notes = {}; for (const n of notes) s.notes[n.at] = n;
      s.len = toks.length * s.tok; s.ch = s.chords.split(' ').map(chordOf);
    }
    let song = null, step = 0, nextT = 0, tempo = 1;
    function tick() {
      if (!ac || !song || ac.state !== 'running') return;
      const spb = 60 / song.bpm / 4 / tempo;
      if (nextT < ac.currentTime - 0.2) nextT = ac.currentTime + 0.02;
      while (nextT < ac.currentTime + 0.14) { playStep(song, step, nextT, spb); nextT += spb; step = (step + 1) % song.len; }
    }
    function playStep(s, i, t, spb) {
      const n = s.notes[i];
      if (n) {
        const f = hz(n.m), d = n.d * spb;
        if (s.trem) { for (let k = 0; k < n.d; k++) tone(f, spb * 0.9, s.duty, 0.32 * (1 - k / (n.d + 2)), 0, 0, mus, t + k * spb); }
        else { const o = mk(t, f, s.duty), g = ac.createGain(); g.gain.setValueAtTime(0.34, t); g.gain.setValueAtTime(0.26, t + 0.03); g.gain.linearRampToValueAtTime(0.2, t + d * 0.8); g.gain.linearRampToValueAtTime(0.0001, t + d * 0.95);
          if (d > 0.35) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5.5; lg.gain.value = f * 0.012; l.connect(lg); lg.connect(o.frequency); l.start(t + 0.15); l.stop(t + d); }
          o.connect(g); g.connect(mus); o.start(t); o.stop(t + d); }
      }
      const bar = Math.floor(i / s.bar) % s.ch.length, pos = i % s.bar, ch = s.ch[bar];
      for (const [p, off] of s.bass) if (p === pos) tone(hz(ch[0] - 12 + off), spb * 1.7, 'triangle', 0.55, 0, 0, mus, t);
      for (const p of s.stab) if (p === pos) for (let k = 0; k < 3; k++) tone(hz(ch[k] + 12), spb / 3, 0.125, 0.12, 0, 0, mus, t + k * spb / 3);
      if (s.kick.includes(pos)) { tone(150, 0.09, 'triangle', 0.6, 45, 0, mus, t); }
      if (s.snare.includes(pos)) noise(0.08, 0.2, 0.9, 0, mus, t);
      if (s.hat.includes(pos)) noise(0.025, 0.08, 2.2, 0, mus, t);
    }
    function music(name) { if (!SONGS[name]) { song = null; return; } if (song === SONGS[name]) return; song = SONGS[name]; step = 0; if (ac) nextT = ac.currentTime + 0.05; }
    return { init, play, music, vol, setTempo: (x) => { tempo = x; }, suspend: () => ac && ac.suspend(), resume: () => ac && ac.state === 'suspended' && ac.resume(), get on() { return !!ac; } };
  })();

  // ================================================================ pixel font (3x5)
  const GL = {};
  ('A .#.#.#####.##.#|B ##.#.###.#.###.|C .###..#..#...##|D ##.#.##.##.###.|E ####..##.#..###|F ####..##.#..#..|G .###..#.##.#.##|H #.##.####.##.#|' +
   'I ###.#..#..#.###|J ..#..#..##.#.#.|K #.###.#..##.#.#|L #..#..#..#..###|M #.#####.##.##.#|N ##.#.##.##.##.#|O .#.#.##.##.#.#.|P ##.#.###.#..#..|' +
   'Q .#.#.##.###..##|R ##.#.###.#.##.#|S .###...#...###.|T ###.#..#..#..#.|U #.##.##.##.####|V #.##.##.##.#.#.|W #.##.#######.#|X #.##.#.#.#.##.#|' +
   'Y #.##.#.#..#..#.|Z ###..#.#.#..###|0 ####.##.##.####|1 .#.##..#..#.###|2 ##...#.#.#..###|3 ##...#.#...###.|4 #.##.####..#..#|5 ####..##...###.|' +
   '6 .###..####.####|7 ###..#.#..#..#.|8 ####.#####.####|9 ####.####..###.|. .............#.|, .........#.#...|! .#..#..#.....#.|? ##...#.#.....#.|' +
   '- ......###......|+ ....#.###.#....|: ....#.....#....|/ ..#..#.#.#..#..|% #....#.#.#....#|\' .#..#..........|( .#.#..#..#...#.|) .#...#..#..#.#.|' +
   'x ...#.#.#.#.#...|> #...#...#.#.#..|< ..#.#.#...#...#')
    .split('|').forEach((s) => { const ch = s[0], b = s.slice(2).padEnd(15, '.'); GL[ch] = b; });
  GL['H'] = '#.##.#####.##.#'; GL['M'] = '#.########.##.#'; GL['W'] = '#.##.########.#';
  function text(c, str, x, y, col, opt) {
    opt = opt || {}; const sc = opt.s || 1; str = String(str).toUpperCase().replace(/×/g, 'x');
    const w = str.length * 4 * sc - sc;
    if (opt.a === 'c') x -= Math.floor(w / 2); else if (opt.a === 'r') x -= w;
    x = Math.round(x); y = Math.round(y);
    if (opt.sh !== false) drawStr(c, str, x + sc, y + sc, opt.shc || '#140c10', sc);
    drawStr(c, str, x, y, col, sc); return w;
  }
  function drawStr(c, str, x, y, col, sc) {
    c.fillStyle = col;
    for (let i = 0; i < str.length; i++) {
      const g = GL[str[i]];
      if (!g) continue;
      for (let p = 0; p < 15; p++) if (g[p] === '#') c.fillRect(x + i * 4 * sc + (p % 3) * sc, y + Math.floor(p / 3) * sc, sc, sc);
    }
  }
  const tw = (s, sc = 1) => String(s).length * 4 * sc - sc;

  // ================================================================ sprites
  const INK = '#140c10';
  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  // rows: strings, pal: letter -> colour; s: scale; outlined with 1 px ink
  function sprite(rows, pal, s) {
    const h = rows.length, w = Math.max(...rows.map((r) => r.length));
    const c = makeCanvas(w * s + 2, h * s + 2), x = c.getContext('2d');
    for (let y = 0; y < h; y++) for (let i = 0; i < rows[y].length; i++) { const col = pal[rows[y][i]]; if (col) { x.fillStyle = col; x.fillRect(1 + i * s, 1 + y * s, s, s); } }
    return outline(c);
  }
  function outline(c) {
    const x = c.getContext('2d'), w = c.width, h = c.height, d = x.getImageData(0, 0, w, h), a = d.data, o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let i = 0; i < w; i++) if (!a[(y * w + i) * 4 + 3]) {
      if ((i > 0 && a[(y * w + i - 1) * 4 + 3]) || (i < w - 1 && a[(y * w + i + 1) * 4 + 3]) || (y > 0 && a[((y - 1) * w + i) * 4 + 3]) || (y < h - 1 && a[((y + 1) * w + i) * 4 + 3])) o[y * w + i] = 1;
    }
    for (let p = 0; p < w * h; p++) if (o[p]) { a[p * 4] = 20; a[p * 4 + 1] = 12; a[p * 4 + 2] = 16; a[p * 4 + 3] = 255; }
    x.putImageData(d, 0, 0); return c;
  }
  function silhouette(c, col) { const o = makeCanvas(c.width, c.height), x = o.getContext('2d'); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, o.width, o.height); return o; }

  const HERO_ROWS = [
    '....HH......', '...HHHH.....', '..HHHHHH....', '..hhhhhh....', '..FFFeFF....', '..FFFFFF.W..', '...FFFF..W..', '.CBBBBBB.W..',
    'CCBBBBBBaW..', 'CCBBbbBB.W..', 'CCBBBBBB.g..', '.CBBBBBB....', '..LL..LL....', '..LL..LL....', '..LL..LL....', '.DDD..DDD...'];
  const HERO_PAL = {
    bogatyr: { H: '#c0bcc8', h: '#f0b43c', F: '#f0c090', e: INK, B: '#d8343c', b: '#f0b43c', C: '#8c1c2c', L: '#4a3040', D: '#2a1a24', W: '#e8e8f0', a: '#f0c090', g: '#f0b43c' },
    vedma: { H: '#f0b43c', h: '#d8343c', F: '#f8d0a8', e: INK, B: '#3c64b4', b: '#f0b43c', C: '#b47c4c', L: '#1c2a5c', D: '#8c1c2c', W: '#8cd8f0', a: '#f8d0a8', g: '#f4ecd8' },
    skomorokh: { H: '#d8343c', h: '#f0b43c', F: '#f0c090', e: INK, B: '#f0b43c', b: '#d8343c', C: '#2c6c3c', L: '#d8343c', D: INK, W: '#b47c4c', a: '#f0c090', g: '#7c4c2c' },
  };
  const cache = {};
  function heroSprite(who, s = 2) {
    const k = 'h' + who + s; if (cache[k]) return cache[k];
    return (cache[k] = artSprite('hero-' + who, 16 * s + 2) || sprite(HERO_ROWS, HERO_PAL[who] || HERO_PAL.bogatyr, s));
  }
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const FOE_PALS = [['#d8343c', '#8c1c2c', '#ffe08a'], ['#6cb44c', '#2c6c3c', '#f0b43c'], ['#8c4cc8', '#4c2c7c', '#8cd8f0'], ['#8cd8f0', '#3c64b4', '#f4ecd8'], ['#b47c4c', '#7c4c2c', '#f0b43c'], ['#9c94a0', '#5c5464', '#d8343c'], ['#3c64b4', '#1c2a5c', '#ffe08a']];
  function foeSprite(foe, px) {
    px = px || (foe.boss ? 50 : 40);
    const k = 'f' + foe.id + foe.boss + '_' + px; if (cache[k]) return cache[k];
    const art = artSprite('foe-' + foe.id, px); if (art) return (cache[k] = art);
    const seed = hash(foe.id), r = K.rng(seed), n = foe.boss || px > 30 ? 16 : 12, hw = n / 2, g = [];
    for (let y = 0; y < n; y++) { g.push(new Array(n).fill('.')); for (let x = 0; x < hw; x++) { const dx = (hw - 1 - x) / hw, dy = Math.abs(y - n * 0.55) / (n / 2); const p = 0.8 - dx * 0.55 - dy * 0.5; if (r() < p) { let c = y > n * 0.72 || r() < 0.12 ? 'S' : 'B'; if (r() < 0.07) c = 'A'; g[y][x] = c; g[y][n - 1 - x] = c; } } }
    for (let x = hw - 2; x <= hw + 1; x++) for (let y = 2; y < n - 2; y++) if (g[y][x] === '.') g[y][x] = 'B'; // solid core
    const ey = Math.floor(n * 0.34), ex = hw - 3;
    for (const xx of [ex, n - 1 - ex]) { g[ey][xx] = 'E'; g[ey][xx + (xx < hw ? -0 : 0)] = 'E'; g[ey + 1][xx] = 'P'; for (const [ax, ay] of [[-1, 0], [1, 0], [0, -1], [-1, 1], [1, 1], [0, 2]]) if (g[ey + ay] && g[ey + ay][xx + ax] === '.') g[ey + ay][xx + ax] = 'B'; }
    for (let x = hw - 2; x <= hw + 1; x++) g[Math.floor(n * 0.6)][x] = x === hw - 2 || x === hw + 1 ? 'A' : 'M'; // mouth
    if (foe.boss) { for (let x = hw - 4; x < hw + 4; x++) { g[1][x] = 'G'; if ((x - hw) % 2 === 0) g[0][x] = 'G'; } }
    const pal = foe.id === 'koschei' ? ['#e8e4d8', '#9c94a0', '#6cff8c'] : FOE_PALS[seed % FOE_PALS.length];
    const map = { B: pal[0], S: pal[1], A: pal[2], E: foe.id === 'koschei' ? '#6cff8c' : '#f4ecd8', P: INK, M: INK, G: '#f0b43c' };
    return (cache[k] = sprite(g.map((row) => row.join('')), map, Math.max(1, Math.floor((px - 2) / n))));
  }
  // raster art from the Media Helper: reduced to `size` px, alpha snapped, outlined (8-bit look)
  const IMG = {};
  for (const n in (ASSETS.img || {})) { const im = new Image(); im.src = ASSETS.img[n]; im.onload = () => { IMG[n] = im; for (const k in cache) delete cache[k]; }; }
  function artSprite(name, size) {
    const im = IMG[name]; if (!im || new URLSearchParams(location.search).has('noart')) return null;
    // the art is already true pixel art on a fat-pixel grid: sample it nearest-neighbour so pixels stay crisp
    const c = makeCanvas(size, size), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(im, 1, 1, size - 2, size - 2);
    const d = x.getImageData(0, 0, size, size), a = d.data;
    for (let p = 0; p < a.length; p += 4) a[p + 3] = a[p + 3] < 128 ? 0 : 255;
    x.putImageData(d, 0, 0); return outline(c);
  }

  // cell tiles
  const ELC = { 1: ['#d8343c', '#ff8a5c', '#8c1c2c'], 2: ['#3c9cd8', '#a8e8ff', '#1c4c8c'], 3: ['#4c9c3c', '#9ce07c', '#2c5c2c'], 4: ['#8c4cc8', '#d0a0ff', '#4c2c7c'], 5: ['#6c6470', '#9c94a0', '#3c3440'], 6: ['#f0b43c', '#fff4b0', '#a0641c'], 7: ['#2a1a24', '#6c6470', INK] };
  const HERO_TILE = {
    1: ['..sss..', '.sssss.', '.skkks.', '.sfffs.', '..fff..', '.ccgcc.', 'ccccccc'],
    2: ['...h...', '..hhh..', '.hhhhh.', 'hhhhhhh', '.fkfkf.', '..www..', '.cwwwc.'],
    3: ['..hhh..', '.hhhhh.', '.hkfkh.', '.hfffh.', '..fff.b', '.ccccb.', 'cc.cc.b'],
    4: ['.ggggg.', '.......', '..fff..', '.fkfkf.', '..fff..', '.wwgww.', 'wwwgwww'],
  };
  function tile(code, C) {
    const k = 't' + code + '_' + C; if (cache[k]) return cache[k];
    const c = makeCanvas(C, C), x = c.getContext('2d'), [b, hi, lo] = ELC[code];
    const P = (px, py, col) => { x.fillStyle = col; x.fillRect(px, py, 1, 1); };
    x.fillStyle = b; x.fillRect(0, 0, C, C);
    x.fillStyle = hi; x.fillRect(0, 0, C, 1); x.fillRect(0, 0, 1, C);
    x.fillStyle = lo; x.fillRect(0, C - 1, C, 1); x.fillRect(C - 1, 0, 1, C);
    const m = Math.floor(C / 2), u = Math.max(1, Math.floor(C / 8));
    const blk = (px, py, col) => { x.fillStyle = col; x.fillRect(px, py, u, u); };
    if (code >= 1 && code <= 4 && C >= 7) {
      // each cell is a little hero: Knight, Mage, Archer, Priest
      const T = HERO_TILE[code], u7 = Math.max(1, Math.floor((C - 2) / 7)), o = Math.floor((C - 7 * u7) / 2);
      const map = { s: '#d0ccd8', k: INK, f: '#f0c090', c: hi, h: lo, w: '#f4ecd8', g: '#f0b43c', b: '#7c4c2c' };
      for (let yy = 0; yy < 7; yy++) for (let xx = 0; xx < 7; xx++) { const col = map[T[yy][xx]]; if (col) { x.fillStyle = col; x.fillRect(o + xx * u7, o + yy * u7, u7, u7); } }
    } else if (C >= 6) {
      if (code === 1) { blk(m - u, m - 2 * u, hi); blk(m - u, m - u, hi); blk(m - 2 * u, m - u, hi); blk(m, m - u, hi); blk(m - u, m, lo); blk(m - 2 * u, m, hi); blk(m, m, hi); blk(m - u, m + u, hi); }
      else if (code === 2) { blk(m - u, m - 2 * u, hi); blk(m - 2 * u, m - u, hi); blk(m, m - u, hi); blk(m - 3 * u, m, hi); blk(m + u, m, hi); blk(m - 2 * u, m + u, hi); blk(m, m + u, hi); blk(m - u, m + 2 * u, hi); }
      else if (code === 3) { blk(m - 2 * u, m - u, lo); blk(m + u, m - 2 * u, lo); blk(m, m + u, lo); blk(m - 2 * u, m + 2 * u, hi); }
      else if (code === 4) { blk(m, m - 2 * u, hi); blk(m - u, m - u, hi); blk(m - 2 * u, m, hi); blk(m - u, m, hi); blk(m, m, hi); blk(m - u, m + u, hi); blk(m - 2 * u, m + 2 * u, hi); }
      else if (code === 5) { blk(u * 2, u * 2, lo); blk(u * 3, u * 3, lo); blk(u * 3, u * 4, lo); blk(C - u * 3, C - u * 4, lo); P(C - 3, 2, hi); }
      else if (code === 6) { x.fillStyle = hi; x.fillRect(m - 2 * u, m - 2 * u, 4 * u, 4 * u); x.fillStyle = lo; x.fillRect(m - u, m - u, 2 * u, 2 * u); }
      else if (code === 7) { x.fillStyle = INK; x.fillRect(0, 0, C, C); x.fillStyle = '#3c3440'; x.fillRect(u, u * 2, C - 2 * u, C - 3 * u); x.fillStyle = '#9c94a0'; x.fillRect(u * 2, u * 3, u, u); x.fillStyle = '#ff8a3c'; x.fillRect(m, 0, u, u * 2); x.fillStyle = '#ffe08a'; x.fillRect(m + u, 0, u, u); }
    }
    return (cache[k] = c);
  }
  // tower backdrop strip
  function backdrop(w, h, kind) {
    const k = 'bg' + w + 'x' + h + kind; if (cache[k]) return cache[k];
    const c = makeCanvas(w, h), x = c.getContext('2d');
    const art = IMG[kind === 0 ? 'bg-tower' : 'bg-boss'];
    if (art) { x.imageSmoothingEnabled = true; const sc = Math.max(w / art.width, h / art.height); x.drawImage(art, (w - art.width * sc) / 2, (h - art.height * sc) / 2, art.width * sc, art.height * sc); x.fillStyle = '#140c1060'; x.fillRect(0, 0, w, h); return (cache[k] = c); }
    const wall = kind === 2 ? ['#16201a', '#223228'] : kind === 1 ? ['#2a1018', '#3c1822'] : ['#22141c', '#2e1c26'];
    x.fillStyle = wall[0]; x.fillRect(0, 0, w, h);
    x.fillStyle = wall[1];
    for (let y = 0; y < h - 12; y += 6) for (let i = -((y / 6) % 2) * 6; i < w; i += 12) x.fillRect(i + 1, y + 1, 10, 4);
    // carpet
    x.fillStyle = '#5c1420'; x.fillRect(0, h - 12, w, 12); x.fillStyle = '#8c1c2c'; x.fillRect(0, h - 11, w, 10);
    x.fillStyle = '#f0b43c'; for (let i = 0; i < w; i += 6) { x.fillRect(i, h - 9, 2, 1); x.fillRect(i + 3, h - 4, 2, 1); } x.fillRect(0, h - 11, w, 1);
    // windows
    x.fillStyle = '#0c0609'; for (const wx of [w * 0.3, w * 0.7]) { x.fillRect(Math.round(wx) - 4, 14, 8, 14); x.fillRect(Math.round(wx) - 3, 12, 6, 2); }
    x.fillStyle = kind === 2 ? '#2c5c3c' : '#1c2a5c'; for (const wx of [w * 0.3, w * 0.7]) x.fillRect(Math.round(wx) - 3, 15, 6, 12);
    x.fillStyle = '#f4ecd8'; for (const wx of [w * 0.3]) x.fillRect(Math.round(wx) + 1, 17, 1, 1);
    return (cache[k] = c);
  }

  // ================================================================ canvas + layout
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const lc = makeCanvas(160, 300), g = lc.getContext('2d');
  let SC = 3, LW = 160, LH = 300, dpr = 1, offX = 0, offY = 0, L = {};
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none'; document.body.appendChild(probe);
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    SC = Math.max(1, Math.min(Math.floor(cv.width / 164), Math.floor(cv.height / 300)));
    LW = Math.floor(cv.width / SC); LH = Math.floor(cv.height / SC); lc.width = LW; lc.height = LH;
    offX = Math.floor((cv.width - LW * SC) / 2); offY = Math.floor((cv.height - LH * SC) / 2);
    const cs = getComputedStyle(probe), st = Math.ceil(parseFloat(cs.paddingTop) * dpr / SC), sb = Math.ceil(parseFloat(cs.paddingBottom) * dpr / SC);
    const BH = 80, top = st + 2;
    const availW = Math.min(LW, 230);
    let C = Math.floor(Math.min((availW - 64) / 8, (LH - top - BH - 10 - sb) / 16)); C = Math.max(5, Math.min(18, C));
    const bw = W * C, cw = bw + 64, ox = Math.floor((LW - cw) / 2);
    const spare = Math.max(0, LH - sb - top - BH - 8 - 16 * C), BH2 = BH + Math.min(44, Math.floor(spare * 0.75));
    const by = top + BH2 + 4;
    L = { C, top, BH: BH2, ox, cw, bx: ox + 3, by, bw, sx: ox + bw + 9, sw: cw - bw - 11, sb };
  }
  addEventListener('resize', () => { resize(); });

  // ================================================================ run state
  let run = null, paused = false, endT = 0, fx = null, lastFoe = null, warned = -1, keys = {}, das = {};
  function newFx() { return { parts: [], fl: [], ban: [], shake: 0, flash: [], heroHit: 0, foeHit: 0, lunge: 0, hlunge: 0, dying: [], mon: new Map(), shots: [], enter: 0, bolt: 0, red: 0, tint: 0, quake: 0 }; }
  function startRun(floor) {
    AU.init();
    const h = H(), st = K.heroStats(S, S.who);
    run = K.newRun({ stats: st, seed: (Math.random() * 2 ** 31) | 0, floor, firstKill: h.bosses, who: S.who });
    fx = newFx(); paused = false; endT = 0; lastFoe = null; warned = -1; keys = {};
    document.body.classList.add('run'); hideModal(); resize();
    eat();
  }
  function banner(t, col, big, dur) { fx.ban.push({ t, col: col || '#ffe08a', s: big ? 2 : 1, life: dur || 1.3, max: dur || 1.3 }); }
  function floater(x, y, t, col, s) { fx.fl.push({ x, y, t, col, s: s || 1, life: 0.9, vy: -18 }); }
  function burst(x, y, col, n, sp, home) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * (sp || 40); fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 10, life: 0.4 + Math.random() * 0.5, col, home: home ? 0.15 + Math.random() * 0.2 : 0 }); } }
  const foePos = () => ({ x: L.ox + L.cw - 30, y: L.top + L.BH - 30 });
  const heroPos = () => ({ x: L.ox + 26, y: L.top + L.BH - 30 });
  const cellXY = (x, y) => ({ x: L.bx + x * L.C + L.C / 2, y: L.by + (y - HID) * L.C + L.C / 2 });
  const ATK_TXT = { garbage1: 'STONE ROW', garbage2: '2 STONE ROWS', garbage3: '3 STONE ROWS', rocks1: 'ROCKS', rocks2: 'ROCKS', rocks3: 'ROCKSLIDE', bite: 'BITE', fog: 'FOG', haste: 'HASTE', curse: 'CURSE', drain: 'MANA DRAIN' };
  const LINE_TXT = ['', '', 'DOUBLE', 'TRIPLE', 'BOGATYR!', 'LEGEND!'];

  const ma = (uid) => { let a = fx.mon.get(uid); if (!a) { a = { hit: 0, lunge: 0, enter: 0, warned: -1 }; fx.mon.set(uid, a); } return a; };
  const monRect = (m) => ({ x: L.bx + m.x * L.C, y: L.by + (m.y - HID) * L.C, w: m.w * L.C, h: m.h * L.C });
  const SHOT_COL = { 1: '#ffe08a', 2: '#a8e8ff', 3: '#9ce07c', 4: '#f4ecd8' };
  function eat() {
    for (const e of run.ev) {
      switch (e.type) {
        case 'floor': {
          warned = -1;
          if (e.boss) { banner('FLOOR ' + e.floor, '#f4ecd8', false, 2); banner(e.lead.name, '#ff8a5c', true, 2.2); AU.play('boss'); }
          else if (e.floor !== run.startFloor) banner('FLOOR ' + e.floor, '#f4ecd8');
          AU.music(e.floor === K.TOP ? 'koschei' : e.boss ? 'boss' : 'climb');
          break;
        }
        case 'mon': { const a = ma(e.m.uid); a.enter = 0.35; lastFoe = e.m; break; }
        case 'deathlessIntro': banner('HE CANNOT DIE...', '#6cff8c', false, 2.6); break;
        case 'cleared': banner('FLOOR CLEAR', '#9ce07c'); break;
        case 'lift': case 'flee': { const r = monRect(e.m); burst(r.x + r.w / 2, r.y + r.h / 2, '#b49c9c', 10, 40); break; }
        case 'rotate': AU.play('rotate'); break;
        case 'drop': fx.shake = Math.max(fx.shake, 1); break;
        case 'lock': AU.play('lock'); break;
        case 'shots': {
          // arrows, sparks and blessings fly from the heroes to their targets
          for (const s of e.shots) {
            const m = run.mons.find((o) => o.uid === s.uid); if (!m) continue;
            const from = cellXY(s.x, s.y), to = monRect(m);
            const tx = to.x + to.w / 2, ty = to.y + to.h / 2, d = Math.hypot(tx - from.x, ty - from.y) || 1, sp = e.mode === 'land' ? 260 : 160;
            fx.shots.push({ x: from.x, y: from.y, vx: (tx - from.x) / d * sp, vy: (ty - from.y) / d * sp, life: d / sp, col: SHOT_COL[s.code], code: s.code });
          }
          break;
        }
        case 'clear': {
          const lead = K.lead(run);
          for (const y of e.rows) { fx.flash.push({ y, life: 0.18 }); for (let x = 0; x < W; x += 2) { const p = cellXY(x, y); burst(p.x, p.y, ELC[1 + ((x + y) % 4)][1], 1, 30, !!lead); } }
          AU.play('clear', e.lines);
          if (e.chain) banner('CHAIN!', '#9ce07c');
          else if (e.lines >= 2) banner(LINE_TXT[Math.min(5, e.lines)], e.lines >= 4 ? '#ffe08a' : '#f4ecd8', e.lines >= 4);
          if (e.combo >= 1) floater(L.bx + L.bw / 2, L.by + 20, 'COMBO ' + (e.combo + 1), '#8cd8f0');
          if (e.lines >= 4) fx.shake = 4;
          break;
        }
        case 'hit': {
          const m = run.mons.find((o) => o.uid === e.uid); if (m) ma(e.uid).hit = 0.12;
          if (e.lead) fx.foeHit = 0.12;
          const p = cellXY(e.x - 0.5, e.y - 0.5);
          const col = e.crit ? '#ffe08a' : e.kind === 'spell' ? '#d0a0ff' : e.kind === 'tick' ? '#b49c9c' : '#f4ecd8';
          floater(p.x - 3 + Math.random() * 6, p.y - 4, (e.crit ? 'CRIT ' : '') + fmt(e.dmg), col, e.crit || e.dmg > run.st.atk * 5 ? 2 : 1);
          if (e.kind !== 'tick') AU.play(e.crit ? 'crit' : 'hit');
          if (e.crit) fx.shake = Math.max(fx.shake, 3);
          break;
        }
        case 'kill': {
          const p = cellXY(e.x - 0.5, e.y - 0.5), big = e.m.w * L.C;
          fx.dying.push({ m: e.m, t: 0 }); burst(p.x, p.y, '#ffe08a', 12 + big / 2, 60); burst(p.x, p.y, '#d8343c', 8 + big / 3, 50);
          floater(p.x, p.y - 8, '+' + fmt(e.k), '#f0b43c'); AU.play('kill'); setTimeout(() => AU.play('coin'), 180);
          if (e.feathers) setTimeout(() => run && floater(p.x, p.y - 16, '+' + e.feathers + ' FEATHER' + (e.feathers > 1 ? 'S' : ''), '#ff8a3c'), 400);
          if (e.relic) banner('RELIC: ' + K.RELICS[e.relic].name, '#ffe08a', false, 2.4);
          if (run.st.killTime) floater(L.ox + L.cw / 2, L.top + 10, '+' + run.st.killTime + 'S', '#ffe08a');
          break;
        }
        case 'attack': {
          ma(e.m.uid).lunge = 0.35; if (e.m === K.lead(run)) fx.lunge = 0.35; fx.heroHit = 0.25; AU.play('attack');
          const p = cellXY(e.x - 0.5, e.y - 0.5); floater(p.x, p.y - 10, ATK_TXT[e.kind] || '', '#ff8a5c');
          break;
        }
        case 'bite': for (const [x, y] of e.cells) { const p = cellXY(x, y); burst(p.x, p.y, '#d8343c', 6, 35); } break;
        case 'curse': banner('CURSED: STONE PIECE', '#d0a0ff'); break;
        case 'hurt': { const p = heroPos(); floater(p.x, p.y - 16, '-' + e.dmg, '#ff5c5c', e.why === 'overflow' ? 2 : 1); fx.red = 0.3; break; }
        case 'garbage': if (e.n) { AU.play('garbage'); fx.shake = Math.max(fx.shake, 2); } if (e.blocked) floater(L.bx + L.bw / 2, L.by + 16 * L.C - 10, 'BLOCKED ' + e.blocked, '#9ce07c'); break;
        case 'rocks': AU.play('rocks'); for (const [x, y] of e.cells) { const p = cellXY(x, y); burst(p.x, p.y, '#9c94a0', 3, 20); } break;
        case 'overflow': fx.shake = 6; fx.red = 0.6; banner(e.dmg ? 'OVERFLOW!' : 'SECOND WIND!', e.dmg ? '#ff5c5c' : '#9ce07c', true); AU.play('overflow'); break;
        case 'cast': {
          AU.play(e.el);
          if (e.el === 'fire') { for (let i = 0; i < 24; i++) setTimeout(() => run && burst(L.bx + (i / 24) * L.bw, L.by + L.C * 16 * (0.3 + 0.5 * Math.abs(Math.sin(i / 3))), i % 2 ? '#ff8a3c' : '#ffe08a', 3, 25), i * 15); banner('FIREBIRD', '#ff8a3c'); }
          else if (e.el === 'ice') { banner('FROST', '#a8e8ff'); }
          else if (e.el === 'earth') { fx.shake = 5; banner('QUAKE', '#9ce07c'); }
          else if (e.el === 'storm') { fx.bolt = 0.35; banner('THUNDER', '#d0a0ff'); }
          break;
        }
        case 'bomb': { const p = cellXY(e.x, e.y); burst(p.x, p.y, '#ff8a3c', 30, 70); burst(p.x, p.y, '#ffe08a', 16, 50); fx.shake = 5; AU.play('earth'); break; }
        case 'gold': floater(L.bx + L.bw / 2, L.by + L.C * 8, '+' + e.k, '#f0b43c'); AU.play('coin'); break;
        case 'water': banner('LIVING WATER', '#8cd8f0', true); AU.play('levelup'); break;
        case 'deathless': banner('DEATHLESS!', '#6cff8c', true, 2.5); banner('FIND THE NEEDLE', '#f4ecd8', false, 3); break;
        case 'win': banner('KOSCHEI FALLS!', '#ffe08a', true, 3); AU.play('win'); break;
        case 'end': AU.play(e.why === 'slain' ? 'lose' : e.why === 'candle' ? 'kill' : 'buy'); if (!run.won) banner(e.why === 'slain' ? 'YOU FELL' : e.why === 'candle' ? 'CANDLE OUT' : 'RETREAT', '#f4ecd8', true, 3); break;
      }
    }
    run.ev.length = 0;
  }

  // ================================================================ input
  function act(a) {
    if (!run || run.over || paused) return;
    if (a === 'L') { if (K.move(run, -1)) AU.play('move'); }
    else if (a === 'R') { if (K.move(run, 1)) AU.play('move'); }
    else if (a === 'D') K.soft(run);
    else if (a === 'cw') K.rotate(run, 1);
    else if (a === 'ccw') K.rotate(run, -1);
    else if (a === 'drop') K.hard(run);
    else if (a === 'hold') { if (!run.st.hold) { banner('BUY SATCHEL TO HOLD', '#b49c9c'); return; } K.hold(run); }
    else if (a.startsWith('sp:')) { const el = a.slice(3); if (!run.st.spells[el]) { banner('SPELL LOCKED', '#b49c9c'); AU.play('nope'); } else if (!K.cast(run, el)) AU.play('nope'); }
    eat();
  }
  const KEYMAP = { ArrowLeft: 'L', ArrowRight: 'R', ArrowDown: 'D', a: 'L', d: 'R', s: 'D', ArrowUp: 'cw', x: 'cw', w: 'cw', z: 'ccw', q: 'ccw', ' ': 'drop', c: 'hold', Shift: 'hold', 1: 'sp:fire', 2: 'sp:ice', 3: 'sp:earth', 4: 'sp:storm' };
  addEventListener('keydown', (e) => {
    if (!run) return;
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') { e.preventDefault(); if (!run.over) togglePause(); return; }
    const k = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (!k) return;
    e.preventDefault(); AU.init();
    if (e.repeat) return;
    if (k === 'L' || k === 'R' || k === 'D') { keys[k] = true; das[k] = { t: 0, n: 0 }; act(k); if (k !== 'D') keys[k === 'L' ? 'R' : 'L'] = false; }
    else act(k);
  });
  addEventListener('keyup', (e) => { const k = KEYMAP[e.key.length === 1 ? e.key.toLowerCase() : e.key]; if (k) keys[k] = false; });
  function keyRepeat(dt) {
    for (const k of ['L', 'R', 'D']) if (keys[k]) { const d = das[k]; d.t += dt; const delay = k === 'D' ? 0.05 : 0.16, rate = k === 'D' ? 0.04 : 0.045; while (d.t >= delay + d.n * rate) { d.n++; act(k); } }
  }
  // touch / mouse: drag sideways to move by columns, drag down to soft drop, flick down to drop, flick up to hold, tap to rotate
  let gest = null;
  const toLow = (e) => { const r = cv.getBoundingClientRect(); return { x: ((e.clientX - r.left) * dpr - offX) / SC, y: ((e.clientY - r.top) * dpr - offY) / SC }; };
  cv.addEventListener('pointerdown', (e) => {
    if (!run) return; AU.init(); e.preventDefault();
    if (paused || run.over) return;
    const p = toLow(e);
    for (const b of (L.btns || [])) if (p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h) { act(b.a); return; }
    cv.setPointerCapture(e.pointerId);
    gest = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), ax: 0, ay: 0, moved: false, soft: 0, hist: [[performance.now(), e.clientY]] };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!gest || e.pointerId !== gest.id || !run) return;
    const cell = Math.max(14, L.C * SC / dpr * 0.9);
    gest.ax += e.clientX - gest.x; gest.ay += e.clientY - gest.y; gest.x = e.clientX; gest.y = e.clientY;
    gest.hist.push([performance.now(), e.clientY]); if (gest.hist.length > 6) gest.hist.shift();
    if (Math.abs(gest.x - gest.x0) > 8 || Math.abs(gest.y - gest.y0) > 8) gest.moved = true;
    while (gest.ax >= cell) { gest.ax -= cell; act('R'); }
    while (gest.ax <= -cell) { gest.ax += cell; act('L'); }
    // slow downward drag = soft drop, only once the gesture is mostly vertical
    const vertical = Math.abs(gest.y - gest.y0) > Math.abs(gest.x - gest.x0) * 1.4;
    while (vertical && gest.ay >= cell * 1.1) { gest.ay -= cell * 1.1; act('D'); gest.soft++; }
    if (gest.ay < -cell * 3) gest.ay = -cell * 3;
  });
  const endGest = (e) => {
    if (!gest || e.pointerId !== gest.id) return; const gs = gest; gest = null; if (!run) return;
    const now = performance.now(), dt = now - gs.t0, dy = e.clientY - gs.y0, dx = e.clientX - gs.x0;
    const h0 = gs.hist[0], vy = (e.clientY - h0[1]) / Math.max(16, now - h0[0]); // px/ms over the last few moves
    if (!gs.moved && dt < 350) { const r = cv.getBoundingClientRect(); act(e.clientX - r.left < r.width * 0.33 ? 'ccw' : 'cw'); return; }
    if (dy > 40 && vy > 0.75 && Math.abs(dy) > Math.abs(dx)) act('drop');
    else if (dy < -40 && vy < -0.5 && Math.abs(dy) > Math.abs(dx) * 1.5) act('hold');
  };
  cv.addEventListener('pointerup', endGest); cv.addEventListener('pointercancel', (e) => { if (gest && e.pointerId === gest.id) gest = null; });

  // ================================================================ draw
  function draw() {
    const c = g; c.imageSmoothingEnabled = false;
    c.fillStyle = '#0c0609'; c.fillRect(0, 0, LW, LH);
    const sh = fx.shake > 0.3 ? Math.round((Math.random() - 0.5) * fx.shake) : 0, sv = fx.shake > 0.3 ? Math.round((Math.random() - 0.5) * fx.shake) : 0;
    c.save(); c.translate(sh, sv);
    drawStrip(c); drawBoard(c); drawSide(c);
    // particles
    const fp = foePos();
    for (const p of fx.parts) { c.fillStyle = p.col; c.fillRect(Math.round(p.x), Math.round(p.y), 2, 2); }
    for (const f of fx.fl) { const a = Math.min(1, f.life * 3); c.globalAlpha = a; text(c, f.t, f.x, f.y, f.col, { a: 'c', s: f.s }); c.globalAlpha = 1; }
    const lb = K.lead(run), lbr = lb && monRect(lb), fp2 = lbr ? { x: lbr.x + lbr.w / 2, y: lbr.y + lbr.h / 2 } : fp;
    if (fx.bolt > 0) { c.fillStyle = '#f4ecd8'; let x = fp2.x, y = L.by; for (let i = 0; i < 8; i++) { const ny = y + (fp2.y - L.by) / 8; const nx = fp2.x + (Math.random() - 0.5) * 12; c.fillRect(Math.min(x, nx), y, Math.abs(nx - x) + 2, ny - y + 1); x = nx; y = ny; } }
    c.restore();
    // banners
    let by = L.by + L.C * 5;
    for (const b of fx.ban) { const a = Math.min(1, b.life * 2.5, (b.max - b.life) * 8 + 0.2); c.globalAlpha = a; const w = tw(b.t, b.s); c.fillStyle = '#140c10c0'; c.fillRect(Math.floor(L.bx + L.bw / 2 - w / 2 - 3), by - 3, w + 6, 5 * b.s + 6); text(c, b.t, L.bx + L.bw / 2, by, b.col, { a: 'c', s: b.s }); c.globalAlpha = 1; by += 5 * b.s + 9; }
    if (fx.red > 0) { c.globalAlpha = Math.min(0.35, fx.red); c.fillStyle = '#d8343c'; c.fillRect(0, 0, LW, LH); c.globalAlpha = 1; }
    if (paused) { c.fillStyle = '#0c0609a0'; c.fillRect(0, 0, LW, LH); }
    ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#0c0609'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(lc, 0, 0, LW, LH, offX, offY, LW * SC, LH * SC);
  }
  function bar(c, x, y, w, h, frac, col, back) { c.fillStyle = INK; c.fillRect(x - 1, y - 1, w + 2, h + 2); c.fillStyle = back || '#3c2632'; c.fillRect(x, y, w, h); c.fillStyle = col; c.fillRect(x, y, Math.max(0, Math.round(w * Math.max(0, Math.min(1, frac)))), h); }
  function drawStrip(c) {
    const { ox, cw, top, BH } = L, lead = K.lead(run), foe = lead || lastFoe;
    const kind = foe && foe.floor === K.TOP ? 2 : foe && foe.boss ? 1 : 0;
    c.drawImage(backdrop(LW, BH + top, kind), 0, 0);
    // torches
    const tf = performance.now() / 90;
    for (const tx of [Math.round(LW * 0.15), Math.round(LW * 0.85)]) { c.fillStyle = '#7c4c2c'; c.fillRect(tx - 1, top + 36, 3, 8); const fl = Math.sin(tf + tx) > 0; c.fillStyle = kind === 2 ? '#6cff8c' : '#ff8a3c'; c.fillRect(tx - 1, top + 32 - (fl ? 1 : 0), 3, 4); c.fillStyle = '#ffe08a'; c.fillRect(tx, top + 33, 1, 2); }
    // HUD row 1
    text(c, 'F' + run.floor, ox + 3, top + 1, '#f0b43c');
    const cs = Math.ceil(run.candle), cx = ox + cw / 2;
    c.fillStyle = '#f4ecd8'; c.fillRect(cx - 12, top + 1, 3, 5); c.fillStyle = '#ff8a3c'; c.fillRect(cx - 12, top - 1 + (Math.sin(tf) > 0 ? 0 : 1), 3, 2);
    text(c, cs + 'S', cx - 6, top + 1, run.candle < 8 && Math.floor(run.t * 4) % 2 ? '#ff5c5c' : '#f4ecd8');
    // hero HP
    bar(c, ox + 3, top + 10, 56, 7, run.hp / run.hpMax, run.hp < run.hpMax * 0.3 ? '#d8343c' : '#6cb44c');
    text(c, Math.ceil(run.hp) + '/' + run.hpMax, ox + 5, top + 11, '#f4ecd8');
    text(c, '+' + fmt(run.kopeks), ox + 3, top + 20, '#f0b43c');
    // status chips
    let sx = ox + 3; const chips = [];
    if (run.fx.frozen) chips.push(['FROZEN', '#a8e8ff']); if (run.fx.haste) chips.push(['HASTE', '#ff8a5c']); if (run.fx.fog) chips.push(['FOG', '#b49c9c']); if (run.queue[0] && run.queue[0].curse) chips.push(['CURSED', '#d0a0ff']);
    for (const [t, col] of chips) { text(c, t, sx, top + 27, col); sx += tw(t) + 4; }
    // hero
    const hp = heroPos(), hs = heroSprite(S.who), hl = fx.hlunge > 0 ? 3 : 0;
    const hy = top + BH - 11 - hs.height + Math.round(Math.sin(run.t * 3) * 0.6);
    c.drawImage(fx.heroHit > 0 && Math.floor(fx.heroHit * 30) % 2 ? silhouette(hs, '#ff5c5c') : hs, Math.round(hp.x - hs.width / 2 + hl), hy);
    // the lead monster, big, on the right of the strip
    if (foe) {
      const fs = foeSprite(foe, foe.boss ? 50 : 40), fp = foePos();
      const fxo = fx.lunge > 0 ? -Math.round(Math.sin(fx.lunge / 0.35 * Math.PI) * 14) : 0;
      const fyy = top + BH - 11 - fs.height + Math.round(Math.sin(run.t * 2.2 + 1) * 1);
      if (!lead) { c.globalAlpha = 0.25; c.drawImage(silhouette(fs, '#f4ecd8'), Math.round(fp.x - fs.width / 2), fyy); c.globalAlpha = 1; }
      else {
        c.drawImage(fx.foeHit > 0 ? silhouette(fs, '#f4ecd8') : fs, Math.round(fp.x - fs.width / 2 + fxo), fyy);
        const f = lead, bw = 64, bx = ox + cw - 3 - bw, ty = top + 21;
        bar(c, bx, ty, bw, 7, f.hp / f.max, f.deathless && !run.st.needle && f.hp <= 1 ? '#6cff8c' : '#d8343c');
        text(c, fmt(Math.max(0, f.hp)), bx + 2, ty + 1, '#f4ecd8');
        const others = run.mons.length - 1;
        const nm = f.name.length > 15 ? f.name.split(' ')[0] : f.name;
        text(c, nm + (others > 0 ? ' +' + others : ''), ox + cw - 3, ty + 10, f.boss ? '#ff8a5c' : '#f4ecd8', { a: 'r' });
        const wi = K.EL.indexOf(f.weak); c.drawImage(tile(wi, 9), bx - 11, ty - 1); text(c, 'FEARS', bx - 13, ty + 1, '#b49c9c', { a: 'r' });
      }
    }
  }
  function drawMon(c, m) {
    const r = monRect(m), a = ma(m.uid), C = L.C;
    let ox = 0, oy = 0;
    if (a.enter > 0) oy = -Math.round(a.enter / 0.35 * (r.y - L.by + r.h));
    if (a.lunge > 0) ox = Math.round(Math.sin(a.lunge * 40) * 2);
    const X = r.x + ox, Y = Math.max(L.by - r.h, r.y + oy);
    c.fillStyle = m.boss ? '#3c1018' : '#2a1420'; c.fillRect(X, Y, r.w, r.h);
    c.fillStyle = m.boss ? '#d8343c' : '#6c3040'; c.fillRect(X, Y, r.w, 1); c.fillRect(X, Y + r.h - 1, r.w, 1); c.fillRect(X, Y, 1, r.h); c.fillRect(X + r.w - 1, Y, 1, r.h);
    const spr = foeSprite(m, r.w - 2);
    c.drawImage(a.hit > 0 ? silhouette(spr, '#f4ecd8') : spr, X + Math.round((r.w - spr.width) / 2), Y + Math.round((r.h - spr.height) / 2) + (Math.sin(run.t * 3 + m.uid) > 0.6 ? -1 : 0));
    // HP along the top, attack timer along the bottom
    c.fillStyle = INK; c.fillRect(X + 1, Y + 1, r.w - 2, 2);
    c.fillStyle = m.deathless && !run.st.needle && m.hp <= 1 ? '#6cff8c' : '#d8343c'; c.fillRect(X + 1, Y + 1, Math.max(1, Math.round((r.w - 2) * m.hp / m.max)), 2);
    const warn = m.atkT > m.every - 1.1, tt = Math.max(0, m.atkT / m.every);
    c.fillStyle = INK; c.fillRect(X + 1, Y + r.h - 3, r.w - 2, 2);
    c.fillStyle = warn && Math.floor(run.t * 8) % 2 ? '#ff5c5c' : '#f0b43c'; c.fillRect(X + 1, Y + r.h - 3, Math.round((r.w - 2) * tt), 2);
    if (warn && a.warned !== m.n) { a.warned = m.n; AU.play('warn'); }
    if (C >= 9 && m.w >= 2) c.drawImage(tile(K.EL.indexOf(m.weak), Math.max(7, Math.floor(C / 2))), X + r.w - Math.max(7, Math.floor(C / 2)) - 2, Y + 4);
  }
  function drawBoard(c) {
    const { C, bx, by, bw } = L, bh = 16 * C, gr = run.grid;
    // frame
    c.fillStyle = '#a0641c'; c.fillRect(bx - 3, by - 3, bw + 6, bh + 6); c.fillStyle = '#f0b43c'; c.fillRect(bx - 2, by - 2, bw + 4, bh + 4); c.fillStyle = INK; c.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    c.fillStyle = '#1a0f15'; c.fillRect(bx, by, bw, bh);
    c.fillStyle = '#24151d'; for (let y = 0; y < 16; y++) for (let x = 0; x < W; x++) if ((x + y) % 2 === 0) c.fillRect(bx + x * C + Math.floor(C / 2), by + y * C + Math.floor(C / 2), 1, 1);
    // corner ornaments
    c.fillStyle = '#d8343c'; for (const [x, y] of [[bx - 3, by - 3], [bx + bw + 1, by - 3], [bx - 3, by + bh + 1], [bx + bw + 1, by + bh + 1]]) c.fillRect(x, y, 2, 2);
    // danger glow
    let maxH = 0; for (let y = HID; y < R; y++) { let any = false; for (let x = 0; x < W; x++) if (gr[y * W + x]) any = true; if (any) { maxH = R - y; break; } }
    if (maxH > 11) { c.globalAlpha = 0.15 + 0.1 * Math.sin(run.t * 8); c.fillStyle = '#d8343c'; c.fillRect(bx, by, bw, C * 3); c.globalAlpha = 1; }
    for (let y = HID; y < R; y++) for (let x = 0; x < W; x++) { const v = gr[y * W + x]; if (v && v !== K.MON) c.drawImage(tile(v, C), bx + x * C, by + (y - HID) * C); }
    for (const m of run.mons) drawMon(c, m);
    for (const d of fx.dying) { const r = monRect(d.m); if (d.t < 0.5) { c.globalAlpha = 1 - d.t / 0.5; c.drawImage(silhouette(foeSprite(d.m, r.w - 2), '#f4ecd8'), r.x + 1, r.y + 1 - Math.round(d.t * 10)); c.globalAlpha = 1; } }
    for (const s of fx.shots) { c.fillStyle = s.col; const X = Math.round(s.x), Y = Math.round(s.y); if (s.code === 3) c.fillRect(X - 1, Y, 3, 1); else c.fillRect(X, Y, 2, 2); }
    for (const f of fx.flash) { c.globalAlpha = f.life / 0.18; c.fillStyle = '#f4ecd8'; c.fillRect(bx, by + (f.y - HID) * C, bw, C); c.globalAlpha = 1; }
    const p = run.piece;
    if (p && !run.over) {
      const cells = K.SHAPES[p.shape].rots[p.rot];
      if (!run.fx.fog) { const gy = K.ghostY(run); c.fillStyle = (ELC[p.el] || ELC[5])[1]; c.globalAlpha = 0.35; for (const [x, y] of cells) { const yy = gy + y - HID; if (yy >= 0) { const X = bx + (p.x + x) * C, Y = by + yy * C; c.fillRect(X, Y, C, 1); c.fillRect(X, Y + C - 1, C, 1); c.fillRect(X, Y, 1, C); c.fillRect(X + C - 1, Y, 1, C); } } c.globalAlpha = 1; }
      cells.forEach(([x, y], i) => { const yy = p.y + y - HID; if (yy >= 0) c.drawImage(tile(p.shape === 'BOMB' ? 7 : p.cells[i], C), bx + (p.x + x) * C, by + yy * C); });
    }
    if (run.fx.fog) { c.fillStyle = '#b49c9c'; c.globalAlpha = 0.5; for (let y = 0; y < bh * 0.55; y += 2) for (let x = (y / 2) % 2 ? 1 : 0; x < bw; x += 3) c.fillRect(bx + x, by + y, 1, 1); c.globalAlpha = 1; }
    if (run.fx.frozen) { c.globalAlpha = 0.18; c.fillStyle = '#8cd8f0'; c.fillRect(bx, by, bw, bh); c.globalAlpha = 1; c.fillStyle = '#a8e8ff'; for (let x = 0; x < bw; x += 5) c.fillRect(bx + x, by, 2, 2 + (x * 7) % 5); }
  }
  function piecePreview(c, pc, x, y, m, w, h) {
    if (!pc) return; const cells = K.SHAPES[pc.shape].rots[0];
    let mx = 9, Mx = -1, my = 9, My = -1; for (const [a, b] of cells) { mx = Math.min(mx, a); Mx = Math.max(Mx, a); my = Math.min(my, b); My = Math.max(My, b); }
    const ox = Math.round(x + (w - (Mx - mx + 1) * m) / 2), oy = Math.round(y + (h - (My - my + 1) * m) / 2);
    cells.forEach(([a, b], i) => c.drawImage(tile(pc.shape === 'BOMB' ? 7 : pc.cells[i], m), ox + (a - mx) * m, oy + (b - my) * m));
  }
  function box(c, x, y, w, h, hl) { c.fillStyle = hl ? '#f0b43c' : '#4a2c38'; c.fillRect(x, y, w, h); c.fillStyle = '#1a0f15'; c.fillRect(x + 1, y + 1, w - 2, h - 2); }
  function drawSide(c) {
    const { sx, sw, by, C } = L, st = run.st, fog = run.fx.fog > 0; L.btns = [];
    let y = by;
    text(c, 'NEXT', sx, y, '#b49c9c'); y += 7;
    const m1 = Math.max(4, Math.min(Math.floor(C * 0.7), Math.floor((sw - 4) / 4))), m2 = Math.max(3, Math.floor(m1 * 0.7));
    box(c, sx, y, sw, m1 * 3 + 4);
    const q = run.queue;
    if (fog) text(c, '?', sx + sw / 2, y + m1 + 1, '#b49c9c', { a: 'c', s: 2 }); else piecePreview(c, q[0], sx, y + 1, m1, sw, m1 * 3 + 2);
    y += m1 * 3 + 6;
    for (let i = 1; i < st.next; i++) { box(c, sx, y, sw, m2 * 2 + 4); if (!fog) piecePreview(c, q[i], sx, y + 1, m2, sw, m2 * 2 + 2); y += m2 * 2 + 6; }
    y += 3;
    // hold
    text(c, 'HOLD', sx, y, st.hold ? '#b49c9c' : '#4a2c38'); y += 7;
    const hh = m1 * 2 + 6;
    box(c, sx, y, sw, hh, st.hold && !run.holdUsed && false);
    if (st.hold) { if (run.held && !fog) { c.globalAlpha = run.holdUsed ? 0.4 : 1; piecePreview(c, run.held, sx, y + 1, m2 + 1, sw, hh - 2); c.globalAlpha = 1; } } else text(c, 'LOCKED', sx + sw / 2, y + hh / 2 - 2, '#4a2c38', { a: 'c', sh: false });
    L.btns.push({ x: sx - 2, y: y - 8, w: sw + 4, h: hh + 10, a: 'hold' });
    y += hh + 6;
    // spells 2x2
    text(c, 'SPELLS', sx, y, '#b49c9c'); y += 7;
    const bs = Math.floor((sw - 2) / 2), cost = st.spellCost;
    const NAMES = { fire: 'FIRE', ice: 'FROST', earth: 'QUAKE', storm: 'BOLT' };
    ['fire', 'ice', 'earth', 'storm'].forEach((el, i) => {
      const x = sx + (i % 2) * (bs + 2), yy = y + Math.floor(i / 2) * (bs + 2), code = i + 1, [b, hi, lo] = ELC[code];
      const have = st.spells[el], frac = Math.min(1, run.mana[el] / cost), ready = have && frac >= 1;
      c.fillStyle = ready && Math.floor(run.t * 4) % 2 ? '#f4ecd8' : have ? lo : '#2a1a24'; c.fillRect(x, yy, bs, bs);
      c.fillStyle = '#140c10'; c.fillRect(x + 1, yy + 1, bs - 2, bs - 2);
      const fh = Math.round((bs - 2) * frac); c.fillStyle = have ? b : '#3c2632'; c.fillRect(x + 1, yy + bs - 1 - fh, bs - 2, fh);
      c.drawImage(tile(code, Math.max(5, Math.floor(bs / 2.2))), Math.round(x + bs / 2 - Math.floor(bs / 2.2) / 2), Math.round(yy + 2));
      text(c, have ? NAMES[el] : 'LOCK', x + bs / 2, yy + bs - 7, have ? (ready ? '#ffe08a' : '#f4ecd8') : '#4a2c38', { a: 'c' });
      if (run.mana[el] >= cost * 2) text(c, 'x' + Math.floor(run.mana[el] / cost), x + bs - 2, yy + 2, '#ffe08a', { a: 'r' });
      L.btns.push({ x, y: yy, w: bs, h: bs, a: 'sp:' + el });
    });
  }

  function update(dt) {
    for (const k of ['shake']) fx[k] = Math.max(0, fx[k] - dt * 12);
    for (const k of ['foeHit', 'heroHit', 'lunge', 'hlunge', 'enter', 'bolt', 'red', 'quake']) fx[k] = Math.max(0, fx[k] - dt);
    for (const d of fx.dying) d.t += dt; fx.dying = fx.dying.filter((d) => d.t < 0.6);
    for (const a of fx.mon.values()) { a.hit = Math.max(0, a.hit - dt); a.lunge = Math.max(0, a.lunge - dt); a.enter = Math.max(0, a.enter - dt); }
    for (const s of fx.shots) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; } fx.shots = fx.shots.filter((s) => s.life > 0).slice(-120);
    const lm = K.lead(run), lr = lm && monRect(lm), fp = lr ? { x: lr.x + lr.w / 2, y: lr.y + lr.h / 2 } : foePos();
    for (const p of fx.parts) {
      p.life -= dt;
      if (p.home) { p.home -= dt; if (p.home <= 0) { const dx = fp.x - p.x, dy = fp.y - p.y, d = Math.hypot(dx, dy) || 1; p.vx += dx / d * 900 * dt; p.vy += dy / d * 900 * dt; if (d < 8) p.life = 0; } } else p.vy += 60 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
    fx.parts = fx.parts.filter((p) => p.life > 0).slice(-260);
    for (const f of fx.fl) { f.life -= dt; f.y += f.vy * dt; f.vy *= 0.94; }
    fx.fl = fx.fl.filter((f) => f.life > 0);
    if (fx.ban.length) { fx.ban[0].life -= dt; if (fx.ban.length > 3) fx.ban[0].life -= dt * 2; } fx.ban = fx.ban.filter((b) => b.life > 0);
    for (const f of fx.flash) f.life -= dt; fx.flash = fx.flash.filter((f) => f.life > 0);
    // tempo rises with danger and as the candle burns low (an accelerando, like a folk dance)
    let maxH = 0; for (let y = HID; y < R; y++) { let any = false; for (let x = 0; x < W; x++) if (run.grid[y * W + x]) any = true; if (any) { maxH = R - y; break; } }
    AU.setTempo(1 + (maxH > 10 ? 0.1 : 0) + Math.max(0, (10 - run.candle) / 10) * 0.22 + (lm && lm.boss ? (1 - lm.hp / lm.max) * 0.12 : 0));
  }

  let lastT = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (ts - lastT) / 1000)); lastT = ts;
    if (!run) return;
    if (!paused) {
      keyRepeat(dt);
      let left = dt; while (left > 1e-6 && !run.over) { const d = Math.min(left, 1 / 60); K.step(run, d); left -= d; }
      eat(); update(dt);
      if (run.over) { endT += dt; if (endT > (run.won ? 2.8 : 1.6)) { finishRun(); return; } }
    }
    draw();
  }
  requestAnimationFrame(frame);

  function togglePause() {
    if (!run) return; paused = !paused;
    if (paused) {
      modal(`<h2>PAUSED</h2><p>Floor <b>${run.floor}</b> · candle <b>${Math.ceil(run.candle)} s</b> · <b>${fmt(run.kopeks)}</b> kopeks so far.</p>
        <div class="btns"><button class="btn go" data-a="resume">RESUME</button><button class="btn" data-a="help">How to play</button><button class="btn" data-a="sound">${sndLabel()}</button><button class="btn" data-a="retreat">Retreat (keep loot)</button></div>`, {
        resume: () => { paused = false; hideModal(); }, help: () => showHelp(() => togglePause()), sound: (b) => { cycleSound(); b.textContent = sndLabel(); },
        retreat: () => { paused = false; hideModal(); run.over = true; run.reason = 'retreat'; run.ev.push({ type: 'end', why: 'retreat' }); eat(); },
      });
    } else hideModal();
  }
  $('#pause').addEventListener('click', () => { if (run && !run.over) togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (run && !run.over && !paused) togglePause(); AU.suspend(); } else AU.resume(); });

  function finishRun() {
    const r = run, res = K.result(r), h = H(), lv0 = h.lv;
    const out = K.applyRun(S, S.who, res); save();
    run = null; document.body.classList.remove('run'); resize(); AU.music('menu');
    const title = res.won ? 'KOSCHEI IS DEAD!' : res.reason === 'slain' ? 'YOU FELL' : res.reason === 'candle' ? 'THE CANDLE GUTTERS' : 'RETREAT';
    const lines = [['Floors', `${res.startFloor} → ${res.reached}`], ['Monsters slain', res.kills], ['Rows cleared', res.lines], ['Best hit', fmt(res.best.hit)], ['Kopeks', '+' + fmt(res.kopeks)]];
    if (res.feathers) lines.push(['Firebird feathers', '+' + res.feathers]);
    lines.push(['XP', '+' + fmt(res.xp) + (out.levelUps ? `  (LV ${lv0} → ${h.lv})` : '')]);
    let notes = '';
    for (const rl of out.relics) notes += `<p class="note">Relic: <b>${K.RELICS[rl].name}</b>. ${K.RELICS[rl].desc}</p>`;
    if (res.bossKills.length && !out.relics.length) notes += '';
    if (out.newWin) notes += `<p>Koschei's needle snaps and the tower crumbles. <b>${K.HEROES.find((x) => x.id === S.who).name}</b> has won.${out.unlocked ? ` A new hero arrives: <b>${K.HEROES.find((x) => x.id === out.unlocked).name} ${K.HEROES.find((x) => x.id === out.unlocked).title}</b> (Hero tab).` : ''} You can keep climbing past floor 30.</p>`;
    if (out.levelUps) setTimeout(() => AU.play('levelup'), 300);
    const can = affordable();
    modal(`<h2>${title}</h2>${lines.map(([a, b]) => `<div class="ln"><span>${a}</span><b>${b}</b></div>`).join('')}${notes}
      <div class="btns"><button class="btn ${can ? 'go' : ''}" data-a="tree">${can ? 'SPEND IN SKILLS' : 'Skills'}</button><button class="btn ${can ? '' : 'go'}" data-a="again">${can ? 'Climb again' : 'CLIMB AGAIN'}</button><button class="btn" data-a="tower">Tower</button></div>`, {
      tree: () => { hideModal(); tab('tree'); }, again: () => { hideModal(); startRun(pickFloor()); }, tower: () => { hideModal(); tab('tower'); },
    });
    tab(curTab, true);
  }

  // ================================================================ DOM screens
  const page = $('#page'), modalEl = $('#modal'), mbox = modalEl.querySelector('.box');
  function modal(html, acts) {
    mbox.innerHTML = html; modalEl.hidden = false;
    mbox.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); AU.init(); const f = acts[b.dataset.a]; if (f) f(b); }));
  }
  function hideModal() { modalEl.hidden = true; }
  function toast(t) { const el = $('#toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 1800); }
  const sndLabel = () => `Music: ${['Off', 'Low', 'Normal'][S.opts.music]} · Sound: ${['Off', 'Low', 'Normal'][S.opts.sfx]}`;
  function cycleSound() { // Normal -> Low -> Off (both) -> music off only -> Normal
    const o = S.opts; const st = o.music * 3 + o.sfx;
    const seq = [[2, 2], [1, 1], [0, 2], [0, 0]]; let i = seq.findIndex(([m, s]) => m * 3 + s === st); i = (i + 1) % seq.length;
    o.music = seq[i][0]; o.sfx = seq[i][1]; AU.vol(); save(); updHeader();
  }
  $('#snd').addEventListener('click', () => { AU.init(); cycleSound(); toast(sndLabel()); if (!run) AU.music('menu'); });
  function updHeader() {
    const h = H(); $('#kop').textContent = fmt(h.kopeks); $('#fea').textContent = h.feathers; $('#fwrap').hidden = !h.feathers && !Object.keys(h.bosses).length;
    $('#snd').textContent = S.opts.music ? '♪' : S.opts.sfx ? '♪̸' : 'X';
    const dot = document.querySelector('[data-tab=tree] .dot'); if (affordable()) { if (!dot) document.querySelector('[data-tab=tree]').insertAdjacentHTML('beforeend', '<i class="dot"></i>'); } else if (dot) dot.remove();
  }
  function affordable() { const h = H(); return K.NODES.some((n) => { const lv = h.levels[n.id] || 0; return lv < n.max && K.nodeOpen(n, h.levels, h) && K.nodeCost(n, lv) <= (n.cur === 'f' ? h.feathers : h.kopeks); }); }
  let curTab = 'tower', chosenFloor = null;
  function pickFloor() { const cps = K.checkpoints(H()); if (chosenFloor == null || !cps.includes(chosenFloor)) chosenFloor = cps[cps.length - 1]; return chosenFloor; }
  function tab(t, quiet) {
    curTab = t; document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    page.className = t === 'tree' ? 'tree' : ''; page.scrollTop = 0;
    if (t === 'tower') renderTower(); else if (t === 'tree') renderTree(); else renderHero();
    updHeader(); if (!quiet) AU.play('rotate');
  }
  document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => { AU.init(); AU.music('menu'); tab(b.dataset.tab); }));
  function spriteCanvas(spr, scale) { const c = makeCanvas(spr.width * scale, spr.height * scale), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(spr, 0, 0, c.width, c.height); return c; }
  const heroDef = (id) => K.HEROES.find((x) => x.id === id);

  function renderTower() {
    const h = H(), st = K.heroStats(S, S.who), hd = heroDef(S.who), cps = K.checkpoints(h), f0 = pickFloor();
    const nextBoss = [5, 10, 15, 20, 25, 30].find((f) => !h.bosses[f]);
    const nb = nextBoss && K.BOSSES[nextBoss];
    page.innerHTML = `<div class="wrap">
      <div class="card" id="hc"><div class="tx"><b>${hd.name} ${hd.title}</b><span>Level ${h.lv} · best floor ${h.best}${h.won ? ' · Koschei slain' : ''}</span><div class="bar"><i style="width:${Math.round(100 * h.xp / K.xpNeed(h.lv))}%"></i></div></div></div>
      <div class="stats"><div><span>Attack</span><b>${st.atk.toFixed(0)}</b></div><div><span>HP</span><b>${st.hp}</b></div><div><span>Candle</span><b>${st.candle} s</b></div><div><span>Crit</span><b>${Math.round(st.crit * 100)}%</b></div></div>
      <button class="btn go big" id="climb">CLIMB FROM FLOOR ${f0}</button>
      ${cps.length > 1 ? `<h3>Start floor</h3><div class="cps">${cps.map((f) => `<button class="chip ${f === f0 ? 'on' : ''}" data-f="${f}">${f}</button>`).join('')}</div><p class="sub" style="margin-top:8px">Higher floors pay more but hit harder. Each boss you beat opens the floor after it.</p>` : ''}
      ${nb ? `<h3>Next boss · floor ${nextBoss}</h3><div class="card"><canvas id="bc" width="1" height="1"></canvas><div class="tx"><b>${nb.name}</b><span>${nb.blurb}</span><span>Fears <b style="display:inline;font:inherit;color:var(--gold2)">${K.CLASS[nb.weak]}s</b>, shrugs off ${K.CLASS[nb.resist]}s. It fills a 3x3 space in the well.${nextBoss === 30 && !(h.levels.needle) ? ' He cannot die until you own The Needle.' : ''}</span></div></div>` : `<p class="sub">Beyond floor 30 the tower keeps going: echoes of old bosses, richer every floor.</p>`}
      <h3>The tower</h3><div class="floors">${Array.from({ length: 30 }, (_, i) => 30 - i).map((f) => `<div class="fl ${h.best >= f ? 'done' : ''} ${K.isBoss(f) ? 'boss' : ''} ${f === 30 ? 'k' : ''}">${K.isBoss(f) ? (f === 30 ? '☠' : '♛') : f}</div>`).join('')}</div>
      <p class="foot">Your pieces are parties of heroes. Land them against the monsters in the well to fight. Each hero class charges its own spell. Survive until the candle burns out, then spend kopeks in Skills.</p></div>`;
    $('#hc').prepend(spriteCanvas(heroSprite(S.who), 2));
    if (nb) { const bc = $('#bc'), spr = spriteCanvas(foeSprite(K.foe(nextBoss)), 1); bc.replaceWith(spr); }
    $('#climb').addEventListener('click', () => { AU.init(); if (!S.opts.helped) { S.opts.helped = 1; save(); showHelp(() => startRun(f0)); } else startRun(f0); });
    page.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { chosenFloor = +b.dataset.f; renderTower(); }));
  }
  function showHelp(then) {
    modal(`<h2>HOW TO PLAY</h2>
      <p>Every piece is a <b>party of heroes</b>. Monsters drop into the well; <b>land your heroes against them</b> to fight.</p>
      <p><b style="color:#ff8a5c">Knights</b> strike hard at monsters they touch. <b style="color:#a8e8ff">Mages</b> blast every monster within 2 cells. <b style="color:#9ce07c">Archers</b> shoot the nearest monster within 3. <b style="color:#d0a0ff">Priests</b> heal you. Heroes left touching a monster keep fighting every second.</p>
      <p>Full rows clear and fire a volley at every monster, but a row with a monster in it won't clear. When a monster dies, the heroes above it tumble into the gap, which can set off chains. Each monster shows the hero class it <b>fears</b>.</p>
      <p>Monsters strike on their own timer (the orange bar under each): stone rows, rocks, bites, fog, haste and curses. Overflowing the well costs HP.</p>
      <p><b>Touch:</b> drag sideways to move. Tap to rotate (left third of the screen turns the other way). Drag down to fall faster, flick down to drop, flick up to hold. Tap the spell squares to cast.</p>
      <p class="keys"><b>Keys:</b> <kbd>←</kbd><kbd>→</kbd> move · <kbd>↑</kbd>/<kbd>X</kbd> rotate · <kbd>Z</kbd> other way · <kbd>↓</kbd> soft drop · <kbd>Space</kbd> drop · <kbd>C</kbd> hold · <kbd>1-4</kbd> spells · <kbd>Esc</kbd> pause</p>
      <div class="btns"><button class="btn go" data-a="ok">TO THE TOWER</button></div>`, { ok: () => { hideModal(); if (then) then(); } });
  }

  // ---------------- tree
  const ICON = { sword: '⚔️', candle: '🕯️', heart: '❤️', coin: '🪙', eye: '👁️', drop: '💧', leaf: '🍃', hand: '✋', snow: '❄️', note: '🎵', pebble: '🪨', shield: '🛡️', rock: '🗿', cup: '🫖', wind: '🌬️', quake: '🌋', plume: '🪶', nugget: '💰', bag: '👛', book: '📖', rune: '🔮', orb: '🔵', bolt: '⚡', star: '✨', satchel: '🎒', hammer: '🔨', drum: '🥁', target: '🎯', anvil: '⚒️', flame: '🔥', skull: '💀', needle: '🪡' };
  let pan = null, selNode = 'str';
  const SP = 78;
  function renderTree() {
    const h = H(), xs = K.NODES.map((n) => n.x), ys = K.NODES.map((n) => n.y), mnx = Math.min(...xs), mny = Math.min(...ys);
    const P = (n) => [(n.x - mnx) * SP + 50, (n.y - mny) * SP + 50];
    const wpx = (Math.max(...xs) - mnx) * SP + 100, hpx = (Math.max(...ys) - mny) * SP + 100;
    let lines = '';
    for (const n of K.NODES) for (const r of n.req) { const a = P(n), b = P(K.NODE[r]); const on = (h.levels[r] || 0) > 0; lines += `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${on ? '#f0b43c' : '#4a2c38'}" stroke-width="4" ${n.reqAny ? 'stroke-dasharray="6 5"' : ''}/>`; }
    page.innerHTML = `<div id="tv"><div id="tl" style="width:${wpx}px;height:${hpx}px"><svg width="${wpx}" height="${hpx}">${lines}</svg>${K.NODES.map((n) => {
      const lv = h.levels[n.id] || 0, open = K.nodeOpen(n, h.levels, h), max = lv >= n.max, cost = K.nodeCost(n, lv), can = open && !max && cost <= (n.cur === 'f' ? h.feathers : h.kopeks);
      const [x, y] = P(n);
      return `<button class="nd ${open ? '' : 'lock'} ${max ? 'max' : ''} ${can ? 'can' : ''} ${n.cur === 'f' ? 'f' : ''} ${n.win ? 'win' : ''} ${n.id === selNode ? 'on' : ''}" data-n="${n.id}" style="left:${x}px;top:${y}px"><span class="ic">${ICON[n.icon] || '•'}</span><small>${max ? 'MAX' : lv + '/' + n.max}</small></button>`;
    }).join('')}</div><div id="thelp">DRAG TO LOOK AROUND<br>✦ DASHED = FEATHERS</div></div><div id="tinfo"></div>`;
    const tv = $('#tv'), tl = $('#tl');
    if (!pan) { const s = P(K.NODE.str); pan = { x: tv.clientWidth / 2 - s[0], y: (tv.clientHeight - 110) / 2 - s[1] }; }
    const apply = () => { const mx = 40, minX = tv.clientWidth - wpx - mx, minY = tv.clientHeight - hpx - 120; pan.x = Math.min(mx, Math.max(Math.min(minX, mx), pan.x)); pan.y = Math.min(mx, Math.max(Math.min(minY, mx), pan.y)); tl.style.transform = `translate(${pan.x}px,${pan.y}px)`; };
    apply();
    let drag = null;
    tv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false, id: e.pointerId }; });
    tv.addEventListener('pointermove', (e) => { if (!drag || e.pointerId !== drag.id) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 6) { drag.moved = true; } if (drag.moved) { pan.x = drag.px + dx; pan.y = drag.py + dy; apply(); } });
    tv.addEventListener('pointerup', (e) => { if (!drag) return; const d = drag; drag = null; if (d.moved) return; const b = e.target.closest('[data-n]'); if (b) { selNode = b.dataset.n; renderTree(); } });
    showInfo();
  }
  function showInfo() {
    const h = H(), n = K.NODE[selNode], lv = h.levels[n.id] || 0, open = K.nodeOpen(n, h.levels, h), max = lv >= n.max, cost = K.nodeCost(n, lv), have = n.cur === 'f' ? h.feathers : h.kopeks;
    const desc = typeof n.desc === 'function' ? n.desc(lv) : n.desc;
    const why = !open ? (n.reqBoss && !h.bosses[n.reqBoss] ? `Beat floor ${n.reqBoss} first.` : `Needs ${n.req.map((r) => K.NODE[r].name).join(n.reqAny ? ' or ' : ' and ')}.`) : '';
    const el = $('#tinfo');
    el.innerHTML = `<div class="tx"><b>${n.name}${n.max > 1 ? ` ${lv}/${n.max}` : ''}</b><p>${desc}${why ? ' <span style="color:#ff8a5c">' + why + '</span>' : ''}</p></div>
      <button class="btn ${!max && open && have >= cost ? 'gold' : ''}" id="buy" ${max || !open ? 'disabled' : ''}>${max ? 'MAX' : (n.cur === 'f' ? '✦ ' : '● ') + fmt(cost)}</button>`;
    $('#buy').addEventListener('click', () => {
      AU.init();
      if (K.buy(S, S.who, n.id)) { AU.play('buy'); save(); renderTree(); updHeader(); if (n.win) toast('The Needle is yours. Koschei can die now.'); }
      else { AU.play('nope'); toast(n.cur === 'f' ? 'Not enough Firebird feathers. Beat bosses to earn them.' : 'Not enough kopeks.'); }
    });
  }

  // ---------------- hero
  function renderHero() {
    const h = H(), st = K.heroStats(S, S.who);
    page.innerHTML = `<div class="wrap"><h2>HEROES</h2><div class="heroes">${K.HEROES.map((hd) => {
      const got = S.heroes[hd.id]; return `<button class="card ${hd.id === S.who ? 'sel' : ''} ${got ? '' : 'locked'}" data-h="${hd.id}" style="text-align:left;width:100%"><span class="tx"><b>${hd.name} ${hd.title}</b><span>${got ? hd.blurb + ` · LV ${got.lv}` : `Locked: win ${hd.unlock} time${hd.unlock > 1 ? 's' : ''} to unlock.`}</span></span></button>`;
    }).join('')}</div>
      <p class="sub" style="margin-top:8px">Each hero climbs with their own skills, kopeks and relics.</p>
      <h3>Relics</h3><div class="relics">${Object.entries(K.RELICS).map(([id, r]) => `<div class="relic ${h.relics[id] ? '' : 'no'}"><b>${h.relics[id] ? r.name : '???'}</b>${h.relics[id] ? r.desc : 'Dropped by a boss.'}</div>`).join('')}</div>
      <h3>Stats</h3><div class="stats">
        <div><span>Attack</span><b>${st.atk.toFixed(1)}</b></div><div><span>Max HP</span><b>${st.hp}</b></div>
        <div><span>Candle</span><b>${st.candle} s</b></div><div><span>Preview</span><b>${st.next}</b></div>
        <div><span>Crit</span><b>${Math.round(st.crit * 100)}% x${st.critMul.toFixed(1)}</b></div><div><span>Combo</span><b>+${Math.round(st.combo * 100)}%</b></div>
        <div><span>Armour</span><b>${Math.round((1 - st.armor) * 100)}%</b></div><div><span>Fall speed</span><b>${Math.round(100 / st.fall)}%</b></div>
        <div><span>Kopeks</span><b>x${st.gold.toFixed(2)}</b></div><div><span>Spell cost</span><b>${st.spellCost}</b></div>
        <div><span>Climbs</span><b>${h.runs}</b></div><div><span>Time</span><b>${Math.round(h.time / 60)} min</b></div></div>
      <h3>Settings</h3><div class="row" style="display:flex;flex-wrap:wrap;gap:8px">
        <button class="btn sm" id="mus">Music: ${['Off', 'Low', 'Normal'][S.opts.music]}</button><button class="btn sm" id="sfx">Sound: ${['Off', 'Low', 'Normal'][S.opts.sfx]}</button>
        <button class="btn sm" id="help">How to play</button><button class="btn sm" id="reset">Reset save</button></div>
      <p class="foot">Music: original chiptune in a Russian folk style. Monsters and bosses come from Slavic folklore.</p></div>`;
    page.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => { if (!S.heroes[b.dataset.h]) { AU.play('nope'); return; } S.who = b.dataset.h; chosenFloor = null; save(); AU.play('buy'); renderHero(); updHeader(); }));
    page.querySelectorAll('[data-h]').forEach((b) => { const spr = spriteCanvas(S.heroes[b.dataset.h] ? heroSprite(b.dataset.h) : silhouette(heroSprite(b.dataset.h), '#2a1a24'), 2); b.prepend(spr); });
    $('#mus').addEventListener('click', () => { AU.init(); S.opts.music = (S.opts.music + 2) % 3; AU.vol(); AU.music('menu'); save(); renderHero(); updHeader(); });
    $('#sfx').addEventListener('click', () => { AU.init(); S.opts.sfx = (S.opts.sfx + 2) % 3; AU.vol(); save(); AU.play('coin'); renderHero(); updHeader(); });
    $('#help').addEventListener('click', () => showHelp());
    $('#reset').addEventListener('click', () => modal('<h2>RESET?</h2><p>This wipes every hero, skill and relic.</p><div class="btns"><button class="btn" data-a="no">Keep my save</button><button class="btn" data-a="yes" style="border-color:var(--red)">Wipe it</button></div>', { no: hideModal, yes: () => { S = K.newSave(); save(); hideModal(); pan = null; tab('tower'); } }));
  }

  // ================================================================ boot
  resize(); tab('tower', true);
  document.addEventListener('pointerdown', () => { AU.init(); if (!run) AU.music('menu'); }, { once: true });
  if (new URLSearchParams(location.search).has('dev')) {
    window.KTDEV = { music: (n) => { AU.init(); AU.music(n); }, S: () => S, give: (k, f) => { H().kopeks += k || 1e5; H().feathers += f || 20; save(); tab(curTab, true); }, run: () => run, start: (f) => startRun(f || 1), act };
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  document.body.dataset.ready = '1';
})();
