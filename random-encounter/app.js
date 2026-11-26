// Random Encounter: browser app (8-bit overworld renderer, floating joystick, synthesized chiptune, level-up cards).
(() => {
  'use strict';
  const RE = window.RE, $ = (s) => document.querySelector(s);
  const ASSETS = window.PP_ASSETS || { img: {}, sfx: {} };
  const SKEY = 'random-encounter-v1';
  let S = null; try { S = JSON.parse(localStorage.getItem(SKEY)); } catch (e) { S = null; }
  if (!S || S.v !== 1) S = { v: 1, opts: { music: 2, sfx: 2 }, best: { t: 0, lv: 0 }, wins: 0, runs: 0, job: 'fighter' };
  const save = () => { try { localStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) { /* private mode */ } };

  // ================================================================ audio: chiptune synth + optional samples (engine shared with Koschei's Tower)
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
      hit: () => { noise(0.04, 0.03, 1.4); tone(420, 0.04, 0.5, 0.018, 200); },
      crit: () => { noise(0.08, 0.05, 0.9); tone(1300, 0.12, 0.125, 0.025, 800); },
      kill: () => { noise(0.12, 0.04, 0.6); tone(300, 0.08, 'triangle', 0.06, 120); },
      hurt: () => { noise(0.15, 0.06, 0.5); tone(180, 0.18, 0.5, 0.05, 70); },
      gem: (v) => tone(1046 * Math.pow(2, Math.min(12, v || 0) / 12), 0.04, 0.5, 0.012),
      levelup: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.09, 0.25, 0.04, 0, i * 0.07)); },
      join: () => { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 0.25, 0.045, 0, i * 0.09)); tone(131, 0.5, 'triangle', 0.12, 0, 0.1); },
      potion: () => { [784, 988, 1175].forEach((f, i) => tone(f, 0.08, 'triangle', 0.06, 0, i * 0.06)); },
      chest: () => { [523, 784, 659, 1047].forEach((f, i) => tone(f, 0.1, 0.25, 0.04, 0, i * 0.08)); },
      slash: () => { noise(0.06, 0.03, 1.8); },
      whirl: () => { noise(0.18, 0.04, 1.2); tone(600, 0.18, 0.125, 0.015, 300); },
      fire: () => { noise(0.1, 0.03, 0.7); tone(220, 0.1, 0.5, 0.02, 500); },
      blast: () => { noise(0.18, 0.05, 0.4); },
      thunder: () => { noise(0.25, 0.07, 1.9); tone(1600, 0.2, 0.5, 0.02, 150); },
      ice: () => { tone(2093, 0.06, 'triangle', 0.03); tone(2637, 0.06, 'triangle', 0.025, 0, 0.04); },
      holy: () => tone(1568, 0.08, 'triangle', 0.015),
      cure: () => { [659, 880, 1319].forEach((f, i) => tone(f, 0.12, 'triangle', 0.05, 0, i * 0.07)); },
      pillar: () => { tone(880, 0.3, 0.125, 0.03, 1760); noise(0.2, 0.03, 1.5); },
      dagger: () => tone(1800, 0.03, 0.5, 0.01, 1200),
      fist: () => { noise(0.03, 0.04, 1); tone(260, 0.04, 'triangle', 0.05, 120); },
      quake: () => { noise(0.4, 0.08, 0.2); tone(70, 0.35, 'triangle', 0.12, 40); },
      arrow: () => { noise(0.04, 0.02, 2.2); },
      rain: () => { noise(0.05, 0.02, 2.4); },
      foeShot: () => tone(330, 0.08, 0.5, 0.015, 220),
      boss: () => { tone(98, 1, 'triangle', 0.16, 87); noise(0.9, 0.05, 0.2); [196, 185, 175].forEach((f, i) => tone(f, 0.3, 0.25, 0.03, 0, 0.3 * i)); },
      elite: () => { tone(440, 0.12, 0.25, 0.03); tone(415, 0.2, 0.25, 0.03, 0, 0.12); },
      win: () => { [392, 523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 6 ? 0.6 : 0.13, 0.25, 0.05, 0, i * 0.12)); [131, 196, 262].forEach((f, i) => tone(f, 0.5, 'triangle', 0.12, 0, i * 0.3)); },
      lose: () => { [440, 392, 349, 294].forEach((f, i) => tone(f, 0.3, 0.25, 0.045, 0, i * 0.24)); tone(110, 1, 'triangle', 0.12, 82, 0.6); },
      select: () => { tone(988, 0.05, 0.25, 0.03); tone(1319, 0.07, 0.25, 0.03, 0, 0.05); },
      nope: () => tone(140, 0.12, 0.5, 0.04, 110),
    };
    const GAP = { hit: 45, gem: 35, dagger: 60, arrow: 60, holy: 400, hurt: 150, kill: 40, fist: 60, rain: 120, foeShot: 120, slash: 60, fire: 80, blast: 80, ice: 80 };
    function play(name, arg) {
      if (!ac || !S.opts.sfx) return;
      if (!ok(name, GAP[name] || 50)) return;
      if (sample(name)) return;
      const f = SYN[name]; if (f) f(arg);
    }

    // ---------------- music: original chiptune for a little overworld adventure (not arrangements of anything)
    // lead: one token per `tok` sixteenths; '-' holds, '.' rests. chords: one per bar.
    const SONGS = {
      field: { bpm: 118, tok: 2, bar: 16, duty: 0.25, bass: [[0, 0], [8, 7]], stab: [4, 12], kick: [0, 8], snare: [], hat: [4, 12],
        lead: ['C5 - E5 G5 C6 - B5 A5 G5 - E5 - C5 - - . D5 - F5 A5 D6 - C6 B5 A5 - G5 - . - - .',
          'E5 F5 G5 - A5 G5 F5 E5 D5 E5 F5 - G5 F5 E5 D5 C5 E5 G5 C6 B5 G5 D5 F5 E5 - C5 - . - - .'],
        chords: 'C C Dm G C Dm G C' },
      battle: { bpm: 150, tok: 2, bar: 16, duty: 0.5, bass: [[0, 0], [4, 12], [8, 7], [12, 12]], stab: [], kick: [0, 8], snare: [4, 12], hat: [2, 6, 10, 14],
        lead: ['A4 . A4 C5 E5 . D5 C5 B4 . G4 B4 D5 . C5 B4 A4 . A4 C5 E5 . A5 G5 F5 E5 D5 C5 B4 - E4 .',
          'F5 . F5 E5 D5 . C5 D5 E5 . E5 D5 C5 . B4 C5 D5 . D5 C5 B4 . A4 G#4 A4 - - . E5 D5 C5 B4'],
        chords: 'Am G Am E Dm Am E Am' },
      boss: { bpm: 160, tok: 2, bar: 16, duty: 0.25, bass: [[0, 0], [2, 0], [4, 12], [6, 0], [8, 0], [10, 0], [12, 12], [14, 7]], stab: [], kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14],
        lead: ['D5 D5 F5 D5 A5 D5 G5 F5 E5 E5 G5 E5 Bb5 A5 G5 E5 F5 F5 A5 F5 D6 C6 Bb5 A5 G5 F5 E5 C#5 D5 - - .',
          'Bb4 . Bb4 C5 D5 . F5 E5 C5 . C5 D5 E5 . G5 F5 D5 E5 F5 G5 A5 G5 F5 E5 C#5 D5 E5 C#5 D5 - - .'],
        chords: 'Dm C Dm A Bb C Dm A' },
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

  // ================================================================ art from the Media Helper (optional, true pixel art)
  const IMG = {};
  for (const n in (ASSETS.img || {})) { const im = new Image(); im.src = ASSETS.img[n]; im.onload = () => { IMG[n] = im; for (const k in cache) delete cache[k]; }; }
  function artSprite(name, size) {
    const im = IMG[name]; if (!im || new URLSearchParams(location.search).has('noart')) return null;
    const c = makeCanvas(size, size), x = c.getContext('2d'); x.imageSmoothingEnabled = false;
    x.drawImage(im, 1, 1, size - 2, size - 2);
    const d = x.getImageData(0, 0, size, size), a = d.data; for (let p = 0; p < a.length; p += 4) a[p + 3] = a[p + 3] < 128 ? 0 : 255;
    x.putImageData(d, 0, 0); return outline(c);
  }

  // ================================================================ sprites (code-drawn 8-bit; replaced by art when it arrives)
  const cache = {};
  const SKIN = '#f0c090';
  const HERO_ROWS = {
    fighter: ['....aaaa....', '...aaaaaa...', '...agggga...', '...asesea...', '....ssss....', '...bbbbbb.W.', '..sbbggbbsW.', '..sbbbbbbsW.', '...bbbbbb.g.', '...cccccc...', '...cc..cc...', '...cc..cc...'],
    mage: ['.....a......', '....aag.....', '...aaaaa....', '..aaaaaaa...', '.aaaaaaaaa..', '...seses....', '...wwwww..W.', '..bbwwwbb.W.', '..bbbbbbbbW.', '..bbbgbbb.W.', '..bbbbbbb...', '...c...c....'],
    cleric: ['....wwww....', '...wwrrww...', '...wwwwww...', '..wwsesewW..', '..wwssssw.W.', '...wwwwww.W.', '..swwrrwwsW.', '...wwrrww.W.', '...wwwwww...', '...wwwwww...', '...wwwwww...', '...c...c....'],
    thief: ['....aaaa....', '...aaaaaa...', '..aaaaaaaa..', '..asesesa...', '...kkkkk....', '...bbbbbb...', '..sbbbbbbsW.', '...bbggbb...', '...bbbbbb...', '...cc..cc...', '...cc..cc...', '..cc....cc..'],
    monk: ['............', '....ssss....', '...ssssss...', '...rrrrrr...', '...seseses..', '....ssss....', '..sbbbbbbs..', '.ss.bwwb.ss.', '...bbccbb...', '...bbbbbb...', '...bb..bb...', '...ss..ss...'],
    ranger: ['........r...', '...aaaaar...', '..aaaaaaaa..', '...seseh....', '...hssssh...', '..bbbbbbbW..', '.bbccccbbW..', '.bbccccbb.W.', '..bccccb..W.', '...cccc..W..', '...cc.cc....', '...cc.cc....'],
  };
  const HERO_PAL = {
    fighter: { a: '#c0bcc8', g: '#f0b43c', s: SKIN, e: INK, b: '#d8343c', c: '#4a3040', W: '#e8e8f0' },
    mage: { a: '#3c64b4', g: '#ffe08a', s: SKIN, e: INK, w: '#f4ecd8', b: '#6c3c9c', c: '#2a1a24', W: '#9c6c3c' },
    cleric: { w: '#f4ecd8', r: '#d8343c', s: SKIN, e: INK, W: '#f0b43c', c: '#7c4c2c' },
    thief: { a: '#2c6c3c', s: SKIN, e: INK, k: '#2a1a24', b: '#3c4c3c', g: '#f0b43c', c: '#2a1a24', W: '#c0bcc8' },
    monk: { s: SKIN, r: '#d8343c', e: INK, b: '#f08c3c', w: '#f4ecd8', c: '#2a1a24' },
    ranger: { a: '#7c4c2c', r: '#d8343c', s: SKIN, e: INK, h: '#b47c4c', b: '#2c6c3c', c: '#5c9c3c', W: '#b47c4c' },
  };
  function heroSprite(job, flip) {
    const k = 'h' + job + (flip ? 'f' : ''); if (cache[k]) return cache[k];
    let c = artSprite('hero-' + job, 18) || sprite(HERO_ROWS[job], HERO_PAL[job], 1);
    if (flip) { const o = makeCanvas(c.width, c.height), x = o.getContext('2d'); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); c = o; }
    return (cache[k] = c);
  }
  const FOE_ROWS = {
    slime: ['....gggg....', '...gGGggg...', '..gGggggggg.', '..ggekgekgg.', '..ggggggggg.', '.ggggggggggg', '.ggggggggggg', '..ddddddddd.'],
    bat: ['pp........pp', 'ppp..pp..ppp', 'pppppppppppp', '.ppppyypppp.', '..pp.pppp.pp', '...p..pp..p.'],
    goblin: ['..g......g..', '..gggggggg..', '...gyggyg...', '....gkkg....', '...bbbbbb...', '..gbbbbbbgW.', '...bbbbbb.W.', '...gg..gg...'],
    wolf: ['........gg..', '.......gggg.', 'g.....ggygk.', 'ggggggggggg.', '.gggggggg...', '.gg.gg..gg..', '.g..g...g...'],
    skeleton: ['....wwww....', '...wkwwkw...', '...wwwwww...', '....wkkw....', '..w.wwww.w..', '..wwwwwwww..', '....wwww....', '...ww..ww...', '...w....w...'],
    ghost: ['....wwww....', '...wwwwww...', '..wwkwwkww..', '..wwwwwwww..', '..wwwkkwww..', '..wwwwwwww..', '..w.ww.ww.w.'],
    imp: ['..r......r..', '...rrrrrr...', '..rryrryrr..', '...rrrrrr...', '.p.rrrrrr.p.', 'pp.rrrrrr.pp', '...rr..rr...'],
    ogre: ['....oooooo....', '...oooooooo...', '...oyooooyo...', '...oooooooo...', '....owwwwo....', '..oobbbbbboo..', '.oo.bbbbbb.oo.', '.o..bbbbbb..o.', '....bbbbbb....', '....oo..oo....', '...ooo..ooo...'],
    golem: ['.....gggggg.....', '....gggggggg....', '....gyggggyg....', '....gggggggg....', '..gggggggggggg..', '.gggg.gggg.gggg.', '.ggg..gggg..ggg.', '.gg...gggg...gg.', '......gggg......', '.....gg..gg.....', '....ggg..ggg....'],
    wyrm: ['..........rr........', '.........rrrr.......', '........rryrr.......', 'rr......rrrrrr......', 'rrr....rrrrrrr...rr.', '.rrrr.rrrrrrrrr.rrr.', '..rrrrrrrrrrrrrrrr..', '...rrrrryyyyrrrrr...', '....rrrryyyyrrrr....', '.....rrr....rrr.....', '....rrr......rrr....'],
  };
  const FOE_PAL = {
    slime: { g: '#5cbc4c', G: '#ace08c', d: '#2c6c3c', e: '#f4ecd8', k: INK }, bat: { p: '#7c4cb4', y: '#ff5c5c' }, goblin: { g: '#7cac3c', y: '#ffe08a', k: INK, b: '#7c4c2c', W: '#9c6c3c' },
    wolf: { g: '#8c8c9c', y: '#ffe08a', k: INK }, skeleton: { w: '#e8e4d8', k: INK }, ghost: { w: '#c8d8f0', k: '#3c4c8c' }, imp: { r: '#d8343c', y: '#ffe08a', p: '#8c1c2c' },
    ogre: { o: '#9c7c4c', y: '#ff5c5c', w: '#f4ecd8', b: '#5c4c3c' }, golem: { g: '#8c8494', y: '#6cff8c' }, wyrm: { r: '#c8342c', y: '#f0b43c' },
  };
  function foeSprite(type, elite) {
    const k = 'f' + type + (elite ? 'e' : ''); if (cache[k]) return cache[k];
    const d = RE.FOES[type], scale = d.boss ? 2 : 1;
    let c = artSprite('foe-' + type, d.boss === 2 ? 44 : d.boss ? 36 : type === 'ogre' ? 22 : 16);
    if (!c) c = sprite(FOE_ROWS[type], FOE_PAL[type], scale);
    if (elite) { const o = makeCanvas(Math.round(c.width * 1.5), Math.round(c.height * 1.5)), x = o.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(c, 0, 0, o.width, o.height); c = o; }
    return (cache[k] = c);
  }

  // ---------------- ground: an endless meadow with woods, sand and flowers
  const TILE = 16;
  const hash2 = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const smooth = (t) => t * t * (3 - 2 * t);
  function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = smooth(x - xi), yf = smooth(y - yi); const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1); return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf; }
  function tileKind(tx, ty) {
    const n = vnoise(tx / 7, ty / 7), m = hash2(tx, ty);
    if (n > 0.7) return m < 0.3 ? 'tree' : 'wood';
    if (n < 0.2) return m < 0.08 ? 'stone' : 'sand';
    if (m < 0.05) return 'flowerR'; if (m < 0.1) return 'flowerY'; if (m < 0.13) return 'flowerW'; if (m < 0.25) return 'tuft';
    return m < 0.6 ? 'grass' : 'grass2';
  }
  function tileCanvas(kind) {
    const k = 'tile' + kind; if (cache[k]) return cache[k];
    const c = makeCanvas(TILE, TILE), x = c.getContext('2d'), rnd = RE.rng(hash2(kind.length, kind.charCodeAt(0)) * 1e9);
    const P = (px, py, col) => { x.fillStyle = col; x.fillRect(px, py, 1, 1); };
    const base = kind === 'sand' || kind === 'stone' ? ['#c8a86c', '#b4945c', '#dcc08c'] : kind === 'wood' || kind === 'tree' ? ['#2c6c34', '#245c2c', '#3c7c3c'] : kind === 'grass2' ? ['#4c9c44', '#3c8c3c', '#6cb454'] : ['#4ca444', '#3c8c3c', '#6cbc5c'];
    x.fillStyle = base[0]; x.fillRect(0, 0, TILE, TILE);
    for (let i = 0; i < 14; i++) P(rnd.int(TILE), rnd.int(TILE), base[1]);
    for (let i = 0; i < 6; i++) P(rnd.int(TILE), rnd.int(TILE), base[2]);
    if (kind === 'tuft') for (const [px, py] of [[4, 9], [6, 8], [8, 9], [10, 7], [11, 9]]) { P(px, py, '#2c6c2c'); P(px, py - 1, '#6cbc5c'); }
    if (kind.startsWith('flower')) { const col = { flowerR: '#e84c4c', flowerY: '#f8d84c', flowerW: '#f4ecd8' }[kind]; for (const [px, py] of [[4, 5], [10, 9], [6, 12]]) { P(px, py, col); P(px + 1, py, col); P(px, py + 1, col); P(px + 1, py + 1, '#f0b43c'); } }
    if (kind === 'stone') { x.fillStyle = '#8c8494'; x.fillRect(5, 6, 6, 4); x.fillStyle = '#b4acbc'; x.fillRect(6, 6, 3, 1); x.fillStyle = '#5c5464'; x.fillRect(5, 10, 6, 1); }
    if (kind === 'sand') for (let i = 0; i < 3; i++) P(rnd.int(TILE), rnd.int(TILE), '#f0dca8');
    return (cache[k] = c);
  }
  const TREE = (() => sprite(['....gggg....', '..gggGgggg..', '.ggGGgggggg.', 'gggGgggggGgg', 'ggggggggGggg', '.gggggGgggg.', '..ggggggggg.', '....bbbb....', '....bbbb....', '...bbbbbb...'], { g: '#2c7c34', G: '#5cac4c', b: '#7c4c2c' }, 1))();

  // ================================================================ canvas + layout
  const cv = $('#cv'), ctx = cv.getContext('2d');
  const lc = makeCanvas(180, 320), g = lc.getContext('2d');
  let SC = 3, LW = 180, LH = 320, dpr = 1, offX = 0, offY = 0, padT = 0, padB = 0;
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;top:0;left:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none'; document.body.appendChild(probe);
  function resize() {
    dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    SC = Math.max(1, Math.min(Math.floor(cv.width / 176), Math.floor(cv.height / 300)));
    LW = Math.floor(cv.width / SC); LH = Math.floor(cv.height / SC); lc.width = LW; lc.height = LH;
    offX = Math.floor((cv.width - LW * SC) / 2); offY = Math.floor((cv.height - LH * SC) / 2);
    if (run) run.view = { w: LW, h: LH };
    const cs = getComputedStyle(probe); padT = Math.ceil(parseFloat(cs.paddingTop) * dpr / SC); padB = Math.ceil(parseFloat(cs.paddingBottom) * dpr / SC);
  }
  addEventListener('resize', resize);

  // ================================================================ run state
  let run = null, paused = false, fx = null, cam = { x: 0, y: 0 }, keys = {}, joy = null, gemChain = 0, gemT = 0, modalAt = 0;
  const newFx = () => ({ fl: [], parts: [], arcs: [], rings: [], bolts: [], pillars: [], pops: [], ban: [], shake: 0, red: 0, white: 0 });
  function startRun(job) {
    AU.init(); S.job = job; save();
    document.body.classList.add('run'); hideModal(); resize();
    run = RE.newRun({ seed: (Math.random() * 2 ** 31) | 0, job, view: { w: LW, h: LH } });
    fx = newFx(); paused = false; keys = {}; joy = null; cam = { x: 0, y: 0 };
    AU.music('battle'); eat();
  }
  const scr = (x, y) => ({ x: Math.round(x - cam.x + LW / 2), y: Math.round(y - cam.y + LH / 2) });
  function floater(x, y, t, col, s) { if (fx.fl.length > 70) fx.fl.shift(); fx.fl.push({ x, y, t: String(t), col, s: s || 1, life: 0.7, vy: -22 }); }
  function burst(x, y, col, n, sp) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = (0.3 + Math.random()) * (sp || 40); fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.4, col }); } if (fx.parts.length > 400) fx.parts.splice(0, fx.parts.length - 400); }
  function banner(t, col, big, dur) { fx.ban.push({ t, col: col || '#ffe08a', s: big ? 2 : 1, life: dur || 2, max: dur || 2 }); }
  const JOBCOL = Object.fromEntries(RE.JOB_IDS.map((j) => [j, RE.JOBS[j].color]));

  function eat() {
    for (const e of run.ev) {
      switch (e.type) {
        case 'hit': floater(e.x, e.y, e.dmg, e.crit ? '#ffe08a' : '#f4ecd8', e.crit ? 2 : 1); AU.play(e.crit ? 'crit' : 'hit'); break;
        case 'kill': burst(e.x, e.y, e.boss ? '#ffe08a' : '#f4ecd8', e.boss ? 40 : e.elite ? 16 : 6, e.boss ? 80 : 40); AU.play('kill'); if (e.elite) AU.play('chest'); break;
        case 'slash': fx.arcs.push({ x: e.x, y: e.y, ang: e.ang, r: e.r, life: 0.15, max: 0.15, col: '#f4ecd8' }); AU.play('slash'); break;
        case 'whirl': fx.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.25, max: 0.25, col: '#f4ecd8', fill: true }); AU.play('whirl'); break;
        case 'blast': fx.rings.push({ x: e.x, y: e.y, r: e.r, life: 0.22, max: 0.22, col: '#ff8a3c', fill: true }); burst(e.x, e.y, '#ffb84c', 6, 40); AU.play('blast'); break;
        case 'bolt': fx.bolts.push({ x: e.x, y: e.y, life: 0.18 }); fx.white = Math.max(fx.white, 0.05); AU.play('thunder'); break;
        case 'pillar': fx.pillars.push({ x: e.x, y: e.y, life: 0.35 }); AU.play('pillar'); break;
        case 'holy': if (e.any) AU.play('holy'); break;
        case 'cure': for (const h of run.party) burst(h.x, h.y - 6, '#9ce07c', 5, 20); AU.play('cure'); break;
        case 'fist': fx.pops.push({ x: e.x, y: e.y, life: 0.1 }); AU.play('fist'); break;
        case 'rain': for (let i = 0; i < 4; i++) fx.pops.push({ x: e.x + (Math.random() - 0.5) * e.r * 1.6, y: e.y + (Math.random() - 0.5) * e.r * 1.6, life: 0.12, arrow: true }); AU.play('rain'); break;
        case 'hurt': fx.red = 0.25; fx.shake = Math.max(fx.shake, 3); floater(run.x, run.y - 14, '-' + e.dmg, '#ff5c5c', 1); AU.play('hurt'); break;
        case 'heal': floater(run.x, run.y - 18, '+' + e.n, '#9ce07c', 1); break;
        case 'gem': gemChain = gemT > 0 ? gemChain + 1 : 0; gemT = 0.35; AU.play('gem', gemChain % 13); break;
        case 'level': AU.play('levelup'); break;
        case 'choice': modalAt = performance.now(); break;
        case 'join': if (run.party.length > 1) { banner(RE.JOBS[e.job].name.toUpperCase() + ' JOINS!', JOBCOL[e.job], true, 2.2); AU.play('join'); } break;
        case 'item': AU.play(e.kind === 'potion' ? 'potion' : e.kind === 'chest' ? 'chest' : 'levelup'); if (e.kind === 'magnet') banner('ALL GEMS COME TO YOU', '#8cd8f0'); burst(e.x, e.y, '#ffe08a', 8, 30); break;
        case 'boss': banner(e.name.toUpperCase(), '#ff8a5c', true, 3); AU.play('boss'); AU.music('boss'); break;
        case 'bossDown': banner('VICTORY OVER THE GOLEM', '#ffe08a', false, 2.5); AU.music('battle'); fx.white = 0.2; break;
        case 'elite': banner('A STRONG FOE APPROACHES', '#ff8a5c'); AU.play('elite'); break;
        case 'ring': banner('AMBUSH!', '#ff8a5c'); break;
        case 'foeShot': AU.play('foeShot'); break;
        case 'end': AU.music(null); if (e.why === 'won') { AU.play('win'); fx.white = 0.4; banner('THE WYRM FALLS!', '#ffe08a', true, 3); } else if (e.why === 'quit') banner('THE PARTY TURNS BACK', '#f4ecd8', true, 2); else { AU.play('lose'); banner('THE PARTY FALLS', '#ff5c5c', true, 3); } break;
      }
    }
    run.ev.length = 0;
  }

  // ================================================================ input: floating joystick anywhere, WASD/arrows, 1-3 for cards
  cv.addEventListener('pointerdown', (e) => {
    if (!run || paused) return; AU.init(); e.preventDefault();
    if (joy) return; // a second finger does nothing
    cv.setPointerCapture(e.pointerId);
    joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
  });
  cv.addEventListener('pointermove', (e) => { if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; } });
  const joyEnd = (e) => { if (joy && e.pointerId === joy.id) joy = null; };
  cv.addEventListener('pointerup', joyEnd); cv.addEventListener('pointercancel', joyEnd);
  const KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1], a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] };
  addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (run && run.pending && /^[123]$/.test(k)) { pickCard(+k - 1); return; }
    if (run && (k === 'Escape' || k === 'p') && !run.over && !run.pending) { togglePause(); return; }
    if (KEYS[k]) { keys[k] = true; e.preventDefault(); AU.init(); }
  });
  addEventListener('keyup', (e) => { const k = e.key.length === 1 ? e.key.toLowerCase() : e.key; keys[k] = false; });
  function readMove() {
    let x = 0, y = 0; for (const k in keys) if (keys[k] && KEYS[k]) { x += KEYS[k][0]; y += KEYS[k][1]; }
    if (joy) { const dx = joy.x - joy.x0, dy = joy.y - joy.y0, d = Math.hypot(dx, dy); if (d > 6) { const m = Math.min(1, (d - 6) / 30); x += dx / d * m; y += dy / d * m; } }
    const l = Math.hypot(x, y); return l > 1 ? { x: x / l, y: y / l } : { x, y };
  }

  // ================================================================ draw
  function draw() {
    const c = g; c.imageSmoothingEnabled = false;
    const sh = fx.shake > 0.5 ? Math.round((Math.random() - 0.5) * fx.shake) : 0, sv = fx.shake > 0.5 ? Math.round((Math.random() - 0.5) * fx.shake) : 0;
    c.save(); c.translate(sh, sv);
    // ground
    const x0 = Math.floor((cam.x - LW / 2) / TILE) - 1, y0 = Math.floor((cam.y - LH / 2) / TILE) - 1, nx = Math.ceil(LW / TILE) + 3, ny = Math.ceil(LH / TILE) + 3;
    const deco = [];
    for (let ty = y0; ty < y0 + ny; ty++) for (let tx = x0; tx < x0 + nx; tx++) {
      const k = tileKind(tx, ty), p = scr(tx * TILE, ty * TILE);
      c.drawImage(tileCanvas(k === 'tree' ? 'wood' : k), p.x, p.y);
      if (k === 'tree') deco.push({ y: ty * TILE + 12, draw: () => c.drawImage(TREE, p.x + 1, p.y - 2) });
    }
    // gems and items lie on the ground
    for (const gm of run.gems) { const p = scr(gm.x, gm.y); if (p.x < -4 || p.y < -4 || p.x > LW + 4 || p.y > LH + 4) continue; const col = gm.v >= 20 ? '#f0b43c' : gm.v >= 5 ? '#ff5c7c' : gm.v >= 2 ? '#6cf08c' : '#6cc8ff'; c.fillStyle = INK; c.fillRect(p.x - 2, p.y - 2, 5, 5); c.fillStyle = col; c.fillRect(p.x - 1, p.y - 2, 3, 5); c.fillRect(p.x - 2, p.y - 1, 5, 3); c.fillStyle = '#f4ecd8'; c.fillRect(p.x - 1, p.y - 1, 1, 1); }
    for (const it of run.items) { const p = scr(it.x, it.y), bob = Math.round(Math.sin(run.t * 4 + it.id) * 1); drawItem(c, it.kind, p.x, p.y + bob); }
    // lingering areas under the actors
    for (const a of run.areas) { const p = scr(a.x, a.y); if (a.kind === 'ring') ringPx(c, p.x, p.y, a.rad, '#ffd89c', 0.8); else if (a.kind === 'rain') ringPx(c, p.x, p.y, a.rad, '#b47c4c', 0.35); }
    for (const h of run.party) if (h.skills.holy) { const p = scr(h.x, h.y), rad = 28 + 3 * h.skills.holy; ringPx(c, p.x, p.y, rad + Math.sin(run.t * 6), '#ffe08a', 0.35); }
    // actors, sorted by feet
    const actors = deco;
    for (const f of run.foes) { const p = scr(f.x, f.y); if (p.x < -40 || p.y < -40 || p.x > LW + 40 || p.y > LH + 40) continue; actors.push({ y: f.y, draw: () => drawFoe(c, f, p) }); }
    run.party.forEach((h, i) => { const p = scr(h.x, h.y); actors.push({ y: h.y + 0.1, draw: () => drawHero(c, h, i, p) }); });
    actors.sort((a, b) => a.y - b.y); for (const a of actors) a.draw();
    // shots
    for (const s of run.shots) drawShot(c, s);
    for (const s of run.foeShots) { const p = scr(s.x, s.y), r = s.r; c.fillStyle = INK; c.fillRect(p.x - r, p.y - r + 1, r * 2, r * 2 - 2); c.fillRect(p.x - r + 1, p.y - r, r * 2 - 2, r * 2); c.fillStyle = r > 4 ? '#ff8a3c' : '#d0a0ff'; c.fillRect(p.x - r + 1, p.y - r + 2, r * 2 - 2, r * 2 - 4); c.fillRect(p.x - r + 2, p.y - r + 1, r * 2 - 4, r * 2 - 2); c.fillStyle = '#f4ecd8'; c.fillRect(p.x - 1, p.y - 1, 1, 1); }
    // effects
    for (const a of fx.arcs) { const p = scr(a.x, a.y), k = 1 - a.life / a.max; c.fillStyle = a.col; for (let t = -1.1; t <= 1.1; t += 0.12) { const an = a.ang + t; const rr = a.r * (0.6 + 0.4 * k); c.fillRect(Math.round(p.x + Math.cos(an) * rr), Math.round(p.y + Math.sin(an) * rr), 2, 2); } }
    for (const r2 of fx.rings) { const p = scr(r2.x, r2.y), k = r2.life / r2.max; ringPx(c, p.x, p.y, r2.r * (1.1 - k * 0.3), r2.col, k); if (r2.fill) { c.globalAlpha = 0.25 * k; c.fillStyle = r2.col; c.beginPath(); c.arc(p.x, p.y, r2.r * (1.1 - k * 0.3), 0, 7); c.fill(); c.globalAlpha = 1; } }
    for (const b of fx.bolts) { const p = scr(b.x, b.y); c.fillStyle = '#fff4a0'; let x = p.x, y = p.y - 120; while (y < p.y) { const ny2 = y + 6, nx2 = p.x + (Math.random() - 0.5) * 8; c.fillRect(Math.min(x, nx2), y, Math.abs(nx2 - x) + 2, 7); x = nx2; y = ny2; } c.fillStyle = '#f4ecd8'; c.fillRect(p.x - 3, p.y - 1, 7, 3); }
    for (const pl of fx.pillars) { const p = scr(pl.x, pl.y), k = pl.life / 0.35; c.globalAlpha = k; c.fillStyle = '#fff4c8'; c.fillRect(p.x - 4, p.y - 90, 9, 92); c.fillStyle = '#ffe08a'; c.fillRect(p.x - 6, p.y - 2, 13, 4); c.globalAlpha = 1; }
    for (const po of fx.pops) { const p = scr(po.x, po.y); c.fillStyle = po.arrow ? '#b47c4c' : '#f4ecd8'; if (po.arrow) c.fillRect(p.x, p.y - 4, 1, 5); else { c.fillRect(p.x - 2, p.y, 5, 1); c.fillRect(p.x, p.y - 2, 1, 5); } }
    for (const q of fx.parts) { const p = scr(q.x, q.y); c.fillStyle = q.col; c.fillRect(p.x, p.y, 1, 1); }
    for (const f of fx.fl) { const p = scr(f.x, f.y); c.globalAlpha = Math.min(1, f.life * 3); text(c, f.t, p.x, p.y, f.col, { a: 'c', s: f.s }); c.globalAlpha = 1; }
    c.restore();
    if (fx.white > 0) { c.globalAlpha = Math.min(0.5, fx.white * 2); c.fillStyle = '#f4ecd8'; c.fillRect(0, 0, LW, LH); c.globalAlpha = 1; }
    if (fx.red > 0) { c.globalAlpha = Math.min(0.3, fx.red); c.fillStyle = '#d8343c'; c.fillRect(0, 0, LW, LH); c.globalAlpha = 1; }
    drawHud(c);
    ctx.imageSmoothingEnabled = false; ctx.fillStyle = '#140c10'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(lc, 0, 0, LW, LH, offX, offY, LW * SC, LH * SC);
  }
  function ringPx(c, x, y, r, col, a) { c.globalAlpha = a; c.fillStyle = col; const n = Math.max(12, Math.round(r * 1.2)); for (let i = 0; i < n; i++) { const an = (i / n) * Math.PI * 2; c.fillRect(Math.round(x + Math.cos(an) * r), Math.round(y + Math.sin(an) * r * 0.8), 1, 1); } c.globalAlpha = 1; }
  function drawHero(c, h, i, p) {
    const moving = Math.hypot(run.move.x, run.move.y) > 0.1, flip = run.dir.x < 0, spr = heroSprite(h.job, flip);
    const bob = moving && Math.floor(run.t * 8 + i) % 2 ? -1 : 0, blink = i === 0 && run.inv > 0 && Math.floor(run.t * 20) % 2;
    c.fillStyle = '#00000050'; c.fillRect(p.x - 4, p.y + 1, 9, 2);
    if (!blink) c.drawImage(spr, p.x - Math.floor(spr.width / 2), p.y - spr.height + 2 + bob);
    if (i === 0) { const w = 16, f = run.hp / run.hpMax; c.fillStyle = INK; c.fillRect(p.x - w / 2 - 1, p.y + 3, w + 2, 3); c.fillStyle = '#3c2632'; c.fillRect(p.x - w / 2, p.y + 4, w, 1); c.fillStyle = f < 0.3 ? '#ff5c5c' : '#6cdc5c'; c.fillRect(p.x - w / 2, p.y + 4, Math.round(w * f), 1); }
  }
  function drawFoe(c, f, p) {
    const spr = foeSprite(f.type, f.elite), bob = Math.floor(run.t * 6 + f.id) % 2 ? -1 : 0, flip = f.x > run.x;
    c.fillStyle = '#00000050'; c.fillRect(p.x - f.r, p.y + 1, f.r * 2, 2);
    let s = f.flash > 0 ? flashOf(spr) : spr;
    if (f.chill > 0 && !(f.flash > 0)) s = tint(s, f.type + (f.elite ? 'e' : ''));
    if (flip && !f.boss) { c.save(); c.translate(p.x, 0); c.scale(-1, 1); c.drawImage(s, -Math.floor(s.width / 2), p.y - s.height + 2 + bob); c.restore(); }
    else c.drawImage(s, p.x - Math.floor(s.width / 2), p.y - s.height + 2 + bob);
    if (f.elite && !f.boss) { c.fillStyle = '#ffe08a'; c.fillRect(p.x - 1, p.y - s.height - 1 + bob, 3, 2); }
  }
  const FLASH = new WeakMap();
  function flashOf(sp) { let o = FLASH.get(sp); if (!o) { o = silhouette(sp, '#f4ecd8'); FLASH.set(sp, o); } return o; }
  function tint(sp, key) { const k = 'chill' + key; if (cache[k]) return cache[k]; const o = makeCanvas(sp.width, sp.height), x = o.getContext('2d'); x.drawImage(sp, 0, 0); x.globalCompositeOperation = 'source-atop'; x.globalAlpha = 0.45; x.fillStyle = '#8cd8f0'; x.fillRect(0, 0, o.width, o.height); return (cache[k] = o); }
  function drawShot(c, s) {
    const p = scr(s.x, s.y), v = Math.hypot(s.vx, s.vy) || 1, ux = s.vx / v, uy = s.vy / v;
    if (s.kind === 'fire') { c.fillStyle = '#ff8a3c'; c.fillRect(p.x - 2, p.y - 2, 5, 5); c.fillStyle = '#ffe08a'; c.fillRect(p.x - 1, p.y - 1, 3, 3); c.fillStyle = '#d8343c'; c.fillRect(Math.round(p.x - ux * 4), Math.round(p.y - uy * 4), 2, 2); }
    else if (s.kind === 'ice') { c.fillStyle = '#a8e8ff'; c.fillRect(p.x - 1, p.y - 1, 3, 3); c.fillStyle = '#f4ecd8'; c.fillRect(Math.round(p.x + ux * 2), Math.round(p.y + uy * 2), 1, 1); }
    else if (s.kind === 'wave') { c.fillStyle = '#f4ecd8'; for (let t = -1; t <= 1; t += 0.25) { const an = Math.atan2(uy, ux) + t; c.fillRect(Math.round(p.x + Math.cos(an) * 5), Math.round(p.y + Math.sin(an) * 5), 2, 2); } }
    else { const len = s.kind === 'arrow' ? 6 : 4; c.fillStyle = s.kind === 'arrow' ? '#b47c4c' : '#d0d0dc'; for (let i = 0; i < len; i++) c.fillRect(Math.round(p.x - ux * i), Math.round(p.y - uy * i), 1, 1); c.fillStyle = '#f4ecd8'; c.fillRect(p.x, p.y, 1, 1); }
  }
  function drawItem(c, kind, x, y) {
    const art = artSprite('item-' + kind, 12); if (art) { c.drawImage(art, x - 6, y - 10); return; }
    if (kind === 'potion') { c.fillStyle = INK; c.fillRect(x - 3, y - 7, 7, 8); c.fillStyle = '#d8343c'; c.fillRect(x - 2, y - 4, 5, 4); c.fillStyle = '#f4ecd8'; c.fillRect(x - 1, y - 7, 3, 2); c.fillStyle = '#ff8a8a'; c.fillRect(x - 1, y - 4, 1, 1); }
    else if (kind === 'chest') { c.fillStyle = INK; c.fillRect(x - 5, y - 7, 11, 8); c.fillStyle = '#9c6c3c'; c.fillRect(x - 4, y - 6, 9, 6); c.fillStyle = '#f0b43c'; c.fillRect(x - 4, y - 4, 9, 1); c.fillRect(x, y - 4, 1, 2); }
    else { c.fillStyle = '#d8343c'; c.fillRect(x - 3, y - 6, 2, 5); c.fillRect(x + 2, y - 6, 2, 5); c.fillRect(x - 3, y - 2, 7, 2); c.fillStyle = '#c0bcc8'; c.fillRect(x - 3, y - 7, 2, 1); c.fillRect(x + 2, y - 7, 2, 1); }
  }
  function drawHud(c) {
    const t0 = padT + 1;
    // experience bar across the top
    const need = RE.xpNeed(run.lv), xf = Math.min(1, run.xp / need);
    c.fillStyle = INK; c.fillRect(0, t0, LW, 5); c.fillStyle = '#1c2a5c'; c.fillRect(1, t0 + 1, LW - 2, 3); c.fillStyle = '#6cc8ff'; c.fillRect(1, t0 + 1, Math.round((LW - 2) * xf), 3);
    text(c, 'LV ' + run.lv, LW - 3, t0 + 7, '#f4ecd8', { a: 'r' });
    const m = Math.floor(run.t / 60), s = Math.floor(run.t % 60);
    text(c, m + ':' + String(s).padStart(2, '0'), LW / 2, t0 + 7, run.t >= RE.RUN_TIME ? '#ff8a5c' : '#f4ecd8', { a: 'c', s: 2 });
    text(c, 'HP ' + Math.ceil(run.hp) + '/' + run.hpMax, 3, t0 + 7, run.hp < run.hpMax * 0.3 ? '#ff5c5c' : '#9ce07c');
    text(c, 'KO ' + run.kills, 3, t0 + 14, '#b49c9c');
    // boss bar
    const boss = run.foes.find((f) => f.boss);
    if (boss) { const w = LW - 40, y = t0 + 22; text(c, RE.FOES[boss.type].name.toUpperCase(), LW / 2, y, '#ff8a5c', { a: 'c' }); c.fillStyle = INK; c.fillRect(19, y + 7, w + 2, 5); c.fillStyle = '#3c2632'; c.fillRect(20, y + 8, w, 3); c.fillStyle = '#d8343c'; c.fillRect(20, y + 8, Math.round(w * boss.hp / boss.max), 3); }
    // the party, bottom left: each hero and its skills
    const by = LH - padB - 16;
    run.party.forEach((h, i) => {
      const x = 4 + i * 26, spr = heroSprite(h.job);
      c.fillStyle = '#140c10c0'; c.fillRect(x - 1, by - 2, 24, 16); c.drawImage(spr, x, by - 1);
      RE.JOBS[h.job].skills.forEach((sk, k) => { const l = h.skills[sk] || 0; for (let q = 0; q < 6; q++) { c.fillStyle = q < l ? JOBCOL[h.job] : '#3c2632'; c.fillRect(x + 14 + k * 3, by + 10 - q * 2, 2, 1); } });
    });
    // joystick
    if (joy) { const r = cv.getBoundingClientRect(), jx = ((joy.x0 - r.left) * dpr - offX) / SC, jy = ((joy.y0 - r.top) * dpr - offY) / SC, kx = ((joy.x - r.left) * dpr - offX) / SC, ky = ((joy.y - r.top) * dpr - offY) / SC;
      const d = Math.hypot(kx - jx, ky - jy), mx = d > 14 ? jx + (kx - jx) / d * 14 : kx, my = d > 14 ? jy + (ky - jy) / d * 14 : ky;
      ringPx(c, jx, jy, 15, '#f4ecd8', 0.5); c.globalAlpha = 0.6; c.fillStyle = '#f4ecd8'; c.fillRect(Math.round(mx) - 2, Math.round(my) - 2, 5, 5); c.globalAlpha = 1; }
    // banners
    let y = Math.round(LH * 0.32);
    for (const b of fx.ban) { const a = Math.min(1, b.life * 2.5, (b.max - b.life) * 8 + 0.2); c.globalAlpha = a; const w = tw(b.t, b.s); c.fillStyle = '#140c10c0'; c.fillRect(Math.floor(LW / 2 - w / 2 - 3), y - 3, w + 6, 5 * b.s + 6); text(c, b.t, LW / 2, y, b.col, { a: 'c', s: b.s }); c.globalAlpha = 1; y += 5 * b.s + 9; }
  }
  function update(dt) {
    fx.shake = Math.max(0, fx.shake - dt * 14); fx.red = Math.max(0, fx.red - dt); fx.white = Math.max(0, fx.white - dt); gemT -= dt;
    for (const k of ['arcs', 'rings', 'bolts', 'pillars', 'pops']) { for (const o of fx[k]) o.life -= dt; fx[k] = fx[k].filter((o) => o.life > 0); }
    for (const q of fx.parts) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.92; q.vy *= 0.92; } fx.parts = fx.parts.filter((q) => q.life > 0);
    for (const f of fx.fl) { f.life -= dt; f.y += f.vy * dt; f.vy *= 0.92; } fx.fl = fx.fl.filter((f) => f.life > 0);
    if (fx.ban.length) { fx.ban[0].life -= dt; if (fx.ban.length > 2) fx.ban[0].life -= dt * 2; } fx.ban = fx.ban.filter((b) => b.life > 0);
    cam.x += (run.x - cam.x) * Math.min(1, dt * 10); cam.y += (run.y - cam.y) * Math.min(1, dt * 10);
  }

  let lastT = 0, acc = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (ts - lastT) / 1000)); lastT = ts;
    if (!run) return;
    if (!paused && !run.pending && !run.over) {
      run.move = readMove();
      acc += dt; let n = 0; while (acc >= 1 / 60 && n++ < 4) { acc -= 1 / 60; RE.step(run, 1 / 60); if (run.pending || run.over) { acc = 0; break; } }
    }
    eat(); update(dt);
    if (run.pending && modalEl.hidden) showCards();
    if (run.over && !run.shownEnd) { run.shownEnd = true; setTimeout(finishRun, run.reason === 'quit' ? 600 : 1800); }
    draw();
    if (window.__perf) { window.__perf.n++; window.__perf.ms += performance.now() - ts; }
  }
  requestAnimationFrame(frame);

  // ================================================================ DOM: cards, title, pause, results
  const modalEl = $('#modal'), mbox = modalEl.querySelector('.box');
  function modal(html, acts) { mbox.innerHTML = html; modalEl.hidden = false; mbox.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); AU.init(); const f = acts[b.dataset.a]; if (f) f(b); })); }
  function hideModal() { modalEl.hidden = true; }
  function spriteImg(spr, scale) { const c = makeCanvas(spr.width * scale, spr.height * scale), x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(spr, 0, 0, c.width, c.height); return c; }
  const PASSIVE_ICON = { vigor: '❤️', haste: '👢', reach: '🧲', might: '⚔️', guard: '🛡️', focus: '⏳', wisdom: '📖' };
  function showCards() {
    const p = run.pending; joy = null;
    modalAt = performance.now();
    mbox.className = 'box cards';
    mbox.innerHTML = `<h2>${p.recruit ? 'A HERO WANTS TO JOIN' : 'LEVEL UP!'}</h2><p class="sub">${p.recruit ? 'Choose who travels with you.' : 'Choose one.'}</p>` + p.cards.map((c, i) => {
      const t = RE.cardText(run, c); return `<button class="card" data-i="${i}"><span class="ic" data-ic="${i}"></span><span class="tx"><small>${t.tag}</small><b>${t.title}</b><span>${t.body}</span></span><kbd>${i + 1}</kbd></button>`;
    }).join('');
    p.cards.forEach((c, i) => {
      const slot = mbox.querySelector(`[data-ic="${i}"]`);
      if (c.kind === 'recruit') slot.appendChild(spriteImg(heroSprite(c.job), 3));
      else if (c.kind === 'learn' || c.kind === 'skill') slot.appendChild(spriteImg(heroSprite(run.party[c.hero].job), 2));
      else slot.textContent = PASSIVE_ICON[c.id] || '🧪';
    });
    modalEl.hidden = false;
    mbox.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => pickCard(+b.dataset.i)));
  }
  function pickCard(i) {
    if (!run || !run.pending) return;
    if (performance.now() - modalAt < 350) return; // the thumb that was steering must not pick by accident
    AU.play('select'); RE.choose(run, i); eat(); hideModal(); mbox.className = 'box';
    if (run.pending) setTimeout(showCards, 60);
  }
  function togglePause() {
    paused = !paused; joy = null;
    if (paused) modal(`<h2>PAUSED</h2><p class="sub">${Math.floor(run.t / 60)}:${String(Math.floor(run.t % 60)).padStart(2, '0')} · level ${run.lv} · ${run.kills} foes</p><div class="btns"><button class="btn go" data-a="go">RESUME</button><button class="btn" data-a="snd">${sndLabel()}</button><button class="btn" data-a="quit">Give up</button></div>`,
      { go: () => { paused = false; hideModal(); }, snd: (b) => { cycleSound(); b.textContent = sndLabel(); }, quit: () => { paused = false; hideModal(); run.over = true; run.reason = 'quit'; run.ev.push({ type: 'end', why: 'quit' }); } });
    else hideModal();
  }
  $('#pause').addEventListener('click', () => { if (run && !run.over && !run.pending) togglePause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (run && !run.over && !paused && !run.pending) togglePause(); AU.suspend(); } else AU.resume(); });
  const sndLabel = () => `Music: ${['Off', 'Low', 'Normal'][S.opts.music]} · Sound: ${['Off', 'Low', 'Normal'][S.opts.sfx]}`;
  function cycleSound() { const o = S.opts, seq = [[2, 2], [1, 1], [0, 2], [0, 0]]; let i = seq.findIndex(([m, s]) => m === o.music && s === o.sfx); i = (i + 1) % seq.length; o.music = seq[i][0]; o.sfx = seq[i][1]; AU.vol(); save(); }

  function finishRun() {
    const r = run, res = RE.result(r), won = res.won;
    S.runs++; if (won) S.wins++;
    const newBest = res.t > (S.best.t || 0); if (newBest) S.best = { t: Math.round(res.t), lv: res.lv }; save();
    const tt = `${Math.floor(res.t / 60)}:${String(Math.floor(res.t % 60)).padStart(2, '0')}`;
    modal(`<h2>${won ? 'VICTORY!' : r.reason === 'quit' ? 'YOU WITHDREW' : 'THE PARTY FELL'}</h2>
      <div class="party">${r.party.map((h) => `<span data-job="${h.job}"></span>`).join('')}</div>
      <div class="ln"><span>Time</span><b>${tt}${newBest ? ' · best!' : ''}</b></div><div class="ln"><span>Level</span><b>${res.lv}</b></div><div class="ln"><span>Foes defeated</span><b>${res.kills}</b></div><div class="ln"><span>Damage dealt</span><b>${Math.round(res.dmg)}</b></div>
      ${won ? '<p class="sub">The Ancient Wyrm is slain and the road is safe, for now.</p>' : ''}
      <div class="btns"><button class="btn go" data-a="again">TRY AGAIN AS ${RE.JOBS[S.job].name.toUpperCase()}</button><button class="btn" data-a="title">Choose another hero</button></div>`,
      { again: () => startRun(S.job), title: () => { hideModal(); toTitle(); } });
    mbox.querySelectorAll('[data-job]').forEach((el) => el.appendChild(spriteImg(heroSprite(el.dataset.job), 2)));
    run = null; document.body.classList.remove('run');
  }
  function toTitle() {
    run = null; document.body.classList.remove('run'); AU.music('field');
    const page = $('#page');
    page.innerHTML = `<div class="wrap"><h1>RANDOM<br>ENCOUNTER</h1><p class="sub">Walk the overworld. Every hero fights on their own; you just lead the way. Gather gems to level up, and pick up companions as you go. Survive until the Ancient Wyrm appears at 8:00, then slay it.</p>
      <h3>Choose your first hero</h3><div class="jobs">${RE.JOB_IDS.map((j) => `<button class="job ${S.job === j ? 'sel' : ''}" data-job="${j}"><span class="ic"></span><b>${RE.JOBS[j].name}</b><span>${RE.JOBS[j].blurb}</span><small>${RE.SKILLS[RE.JOBS[j].skills[0]].name}${j === 'mage' ? ' + Thunder soon' : ''}</small></button>`).join('')}</div>
      <p class="foot">Move: drag anywhere (a joystick appears) or WASD / arrows. Heroes join at levels ${RE.RECRUIT_AT.join(', ')}. ${S.runs ? `Best: ${Math.floor(S.best.t / 60)}:${String(S.best.t % 60).padStart(2, '0')}, level ${S.best.lv}. Wins: ${S.wins} of ${S.runs}.` : ''}</p>
      <div class="row"><button class="btn sm" id="snd2">${sndLabel()}</button></div></div>`;
    page.querySelectorAll('[data-job]').forEach((b) => { b.querySelector('.ic').appendChild(spriteImg(heroSprite(b.dataset.job), 3)); b.addEventListener('click', () => { AU.init(); AU.play('select'); startRun(b.dataset.job); }); });
    $('#snd2').addEventListener('click', (e) => { AU.init(); cycleSound(); e.target.textContent = sndLabel(); AU.music('field'); });
  }

  // ================================================================ boot
  resize(); toTitle();
  document.addEventListener('pointerdown', () => { AU.init(); if (!run) AU.music('field'); }, { once: true });
  if (new URLSearchParams(location.search).has('dev')) window.REDEV = { run: () => run, start: (j) => startRun(j || 'fighter'), pick: (i) => { modalAt = 0; pickCard(i); }, music: (n) => { AU.init(); AU.music(n); }, S: () => S };
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  document.body.dataset.ready = '1';
})();
