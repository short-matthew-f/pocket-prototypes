// Backrooms sound: all synthesised with WebAudio (no files). Fluorescent hum, room reverb, footsteps by floor type,
// per-level ambience and distant events. Nothing in here is a creature: just a building that sounds wrong.
const LEVEL = { // hum level, reverb wet, ambience
  lobby: { hum: 1.0, wet: 0.28, hz: 60 }, office: { hum: 0.75, wet: 0.22, hz: 60 }, pool: { hum: 0.2, wet: 0.65, hz: 60 },
  play: { hum: 0.35, wet: 0.35, hz: 60 }, parking: { hum: 0.55, wet: 0.5, hz: 50 }, hotel: { hum: 0.3, wet: 0.16, hz: 60 },
};
export function createAudio() {
  let ac = null, master, dry, wet, conv, humGain, buzzGain, humOsc = [], lap, lapGain, rumbleGain, level = 'lobby', nextEvent = 8, muted = false, vol = 0.8;
  const A = {};
  function noiseBuf(sec = 2) { const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; }
  function impulse(sec = 3.2, decay = 2.6) { const b = ac.createBuffer(2, ac.sampleRate * sec, ac.sampleRate); for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, decay); } return b; }
  function loopNoise(filterType, freq, q = 1) { const s = ac.createBufferSource(); s.buffer = noiseBuf(3); s.loop = true; const f = ac.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q; const gn = ac.createGain(); gn.gain.value = 0; s.connect(f).connect(gn); s.start(); return { gn, f }; }
  A.start = () => {
    if (ac) { ac.resume(); return; }
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    master = ac.createGain(); master.gain.value = vol; master.connect(ac.destination);
    dry = ac.createGain(); dry.connect(master); conv = ac.createConvolver(); conv.buffer = impulse(); wet = ac.createGain(); wet.gain.value = 0.3; conv.connect(wet).connect(master);
    // the hum: mains + harmonics, and the high buzz of the tubes
    humGain = ac.createGain(); humGain.gain.value = 0; const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; humGain.connect(lp).connect(dry);
    for (const [m, type, g] of [[1, 'sine', 0.6], [2, 'sawtooth', 0.12], [3, 'sine', 0.18], [4, 'triangle', 0.05]]) { const o = ac.createOscillator(); o.type = type; o.frequency.value = 60 * m; const og = ac.createGain(); og.gain.value = g; o.connect(og).connect(humGain); o.start(); humOsc.push([o, m]); }
    const buzz = loopNoise('bandpass', 3200, 6); buzzGain = buzz.gn; buzzGain.connect(dry);
    const l = loopNoise('lowpass', 420, 0.7); lap = l; lapGain = l.gn; lapGain.connect(dry); lapGain.connect(conv);
    const rb = loopNoise('lowpass', 70, 0.7); rumbleGain = rb.gn; rumbleGain.connect(dry);
    A.setLevel(level, true);
  };
  A.setLevel = (lv, now) => {
    level = lv; if (!ac) return; const L = LEVEL[lv], t = ac.currentTime, k = now ? 0.05 : 2.5;
    humGain.gain.setTargetAtTime(0.05 * L.hum, t, k); buzzGain.gain.setTargetAtTime(0.012 * L.hum, t, k); wet.gain.setTargetAtTime(L.wet, t, k);
    for (const [o, m] of humOsc) o.frequency.setTargetAtTime(L.hz * m, t, k);
    lapGain.gain.setTargetAtTime(lv === 'pool' ? 0.05 : 0, t, k); rumbleGain.gain.setTargetAtTime(lv === 'parking' ? 0.09 : lv === 'hotel' ? 0.03 : 0, t, k);
  };
  A.blackout = (on) => { if (!ac) return; const t = ac.currentTime, L = LEVEL[level]; humGain.gain.setTargetAtTime(on ? 0.004 : 0.05 * L.hum, t, on ? 0.15 : 0.05); buzzGain.gain.setTargetAtTime(on ? 0 : 0.012 * L.hum, t, 0.05); if (!on) A.clunk(0); };
  A.mute = (m) => { muted = m; if (master) master.gain.setTargetAtTime(m ? 0 : vol, ac.currentTime, 0.1); };
  // one-shot helpers: pan -1..1, dist 0 (near) .. 1 (far, quieter, more reverb)
  function out(pan = 0, dist = 0) { const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); const g = ac.createGain(); g.gain.value = 1 - dist * 0.75; p.connect(g); g.connect(dry); const s = ac.createGain(); s.gain.value = 0.3 + dist * 0.9; g.connect(s).connect(conv); return p; }
  function burst(dest, { dur = 0.12, type = 'lowpass', f = 800, q = 1, v = 0.3, sweep = 0, at = 0 }) { const s = ac.createBufferSource(); s.buffer = noiseBuf(Math.max(0.3, dur + 0.05)); const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ac.createGain(), t = ac.currentTime + at; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); if (sweep) fl.frequency.exponentialRampToValueAtTime(f * sweep, t + dur); s.connect(fl).connect(g).connect(dest); s.start(t); s.stop(t + dur + 0.05); }
  function tone(dest, { f = 440, dur = 0.3, type = 'sine', v = 0.1, at = 0, slide = 0 }) { const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + at; o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05); }
  A.step = (floor, wading) => {
    if (!ac || muted) return; const d = out((Math.random() - 0.5) * 0.15, 0);
    if (wading) { burst(d, { dur: 0.35, type: 'bandpass', f: 900, q: 0.8, v: 0.22, sweep: 0.4 }); return; }
    const F = { carpet: { f: 500, v: 0.16, dur: 0.09 }, rug: { f: 420, v: 0.12, dur: 0.08 }, foam: { f: 300, v: 0.12, dur: 0.1 }, tile: { f: 2600, v: 0.14, dur: 0.06, type: 'highpass' }, concrete: { f: 1400, v: 0.16, dur: 0.07, type: 'bandpass' } }[floor] || { f: 600, v: 0.15, dur: 0.08 };
    burst(d, { dur: F.dur, type: F.type || 'lowpass', f: F.f * (0.9 + Math.random() * 0.2), v: F.v });
    if (floor === 'tile' || floor === 'concrete') tone(d, { f: 120 + Math.random() * 30, dur: 0.06, v: 0.05 });
  };
  A.clunk = (pan) => { if (!ac) return; const d = out(pan, 0.2); burst(d, { dur: 0.25, f: 180, v: 0.4 }); tone(d, { f: 2400, dur: 0.6, type: 'square', v: 0.008 }); };
  A.flick = () => { if (!ac) return; const d = out((Math.random() - 0.5) * 0.8, 0.1); for (let i = 0; i < 3; i++) burst(d, { dur: 0.03, type: 'bandpass', f: 4000, q: 4, v: 0.08, at: i * 0.05 }); };
  A.pickup = () => { if (!ac) return; const d = out(0, 0); tone(d, { f: 660, dur: 0.35, type: 'triangle', v: 0.12 }); tone(d, { f: 990, dur: 0.5, type: 'sine', v: 0.08, at: 0.08 }); burst(d, { dur: 0.2, type: 'highpass', f: 5000, v: 0.04 }); };
  A.noclip = () => { if (!ac) return; const d = out(0, 0); burst(d, { dur: 1.4, type: 'bandpass', f: 400, q: 2, v: 0.5, sweep: 12 }); tone(d, { f: 50, dur: 1.5, type: 'sawtooth', v: 0.15, slide: 6 }); };
  const EVENTS = {
    lobby: ['steps', 'buzz', 'thud', 'drip'], office: ['phone', 'steps', 'printer', 'buzz'], pool: ['drip', 'drip', 'splash', 'steps'],
    play: ['musicbox', 'giggleToy', 'thud', 'drip'], parking: ['drip', 'door', 'engine', 'thud'], hotel: ['knock', 'door', 'steps', 'elevator'],
  };
  A.event = (kind) => {
    if (!ac || muted) return; const pan = (Math.random() - 0.5) * 2, d = out(pan, 0.6 + Math.random() * 0.4);
    if (kind === 'steps') { const n = 4 + Math.floor(Math.random() * 5), gap = 0.45 + Math.random() * 0.2; for (let i = 0; i < n; i++) burst(d, { dur: 0.08, f: 500, v: 0.12 * (1 - i / n), at: i * gap }); } // someone else's footsteps, walking away
    if (kind === 'thud') burst(d, { dur: 0.5, f: 120, v: 0.5 });
    if (kind === 'drip') for (let i = 0; i < 1 + Math.random() * 3; i++) tone(d, { f: 1400 + Math.random() * 900, dur: 0.12, v: 0.07, at: i * (0.6 + Math.random()), slide: 0.6 });
    if (kind === 'splash') burst(d, { dur: 0.8, type: 'bandpass', f: 900, v: 0.2, sweep: 0.3 });
    if (kind === 'buzz') { A.flick(); }
    if (kind === 'phone') for (let r = 0; r < 3; r++) for (let i = 0; i < 2; i++) { tone(d, { f: 440, dur: 0.4, type: 'square', v: 0.03, at: r * 2.6 + i * 0.5 }); tone(d, { f: 480, dur: 0.4, type: 'square', v: 0.03, at: r * 2.6 + i * 0.5 }); }
    if (kind === 'printer') for (let i = 0; i < 6; i++) burst(d, { dur: 0.25, type: 'bandpass', f: 700 + (i % 2) * 300, q: 3, v: 0.08, at: i * 0.27 });
    if (kind === 'musicbox') { const notes = [659, 587, 523, 494, 440, 494, 523, 392], det = 0.97 + Math.random() * 0.05; notes.forEach((f, i) => tone(d, { f: f * det, dur: 1.2, type: 'sine', v: 0.06, at: i * 0.55 + Math.random() * 0.05 })); }
    if (kind === 'giggleToy') for (let i = 0; i < 4; i++) tone(d, { f: 700 + i * 60, dur: 0.12, type: 'triangle', v: 0.04, at: i * 0.13, slide: 1.3 });
    if (kind === 'door') { burst(d, { dur: 0.6, f: 160, v: 0.6 }); burst(d, { dur: 0.3, type: 'bandpass', f: 900, v: 0.1, at: 0.05 }); }
    if (kind === 'knock') for (let i = 0; i < 3; i++) burst(d, { dur: 0.1, f: 300, v: 0.35, at: i * 0.32 });
    if (kind === 'engine') burst(d, { dur: 3, f: 90, q: 2, v: 0.18, sweep: 1.4 });
    if (kind === 'elevator') { tone(d, { f: 880, dur: 0.8, v: 0.05 }); tone(d, { f: 698, dur: 1, v: 0.05, at: 0.35 }); }
  };
  A.tick = (dt, lv) => { if (!ac) return; nextEvent -= dt; if (nextEvent <= 0) { nextEvent = 10 + Math.random() * 25; const list = EVENTS[lv] || EVENTS.lobby; A.event(list[Math.floor(Math.random() * list.length)]); }
    if (lap && lv === 'pool') lap.f.frequency.value = 300 + Math.sin(performance.now() / 900) * 120; };
  A.ready = () => !!ac;
  return A;
}
