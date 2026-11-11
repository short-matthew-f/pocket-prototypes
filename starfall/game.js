// Starfall Battery: hold and drag to pour plasma pellets from the reactor through moving multiplier gates and bounce pads;
// every pellet that reaches the collector becomes a turret shot fired up at the alien waves. Run ends when the shield breaks.
// Plugs into the Pocket Prototypes kit (see ../README.md). Structure follows ore-sweeper/game.js.
// createRun() is DOM-free apart from draw(), so sim.js drives the real model in node (exports at the bottom).
(function () {
  'use strict';
  const TAU = 6.283;
  const TIERS = [2, 3, 5, 8, 12];
  // grid: y up is negative. Turret upgrades grow up, the gate machine right, the pinball machine left, defence down.
  const NODES = [
    { id: 'core', name: 'Reactor Output', icon: '⚛️', desc: '+25% plasma recharge, +15% tank', cost: 5, grow: 1.68, max: 10, req: [], x: 0, y: 0, fx: (s, l) => { s.regen *= 1.25 ** l; s.cap *= 1.15 ** l; s.flow *= 1.12 ** l; } },
    { id: 'gun', name: 'Turret Damage', icon: '🔫', desc: '+30% shot damage', cost: 10, grow: 1.7, max: 12, req: ['core'], x: 0, y: -1, fx: (s, l) => { s.dmg *= 1.3 ** l; } },
    { id: 'shield', name: 'Shield Cells', icon: '🛡️', desc: '+1 shield', cost: 12, grow: 1.75, max: 6, req: ['core'], x: 0, y: 1, fx: (s, l) => { s.shield += l; } },
    { id: 'wide', name: 'Wide Gates', icon: '↔️', desc: (l) => `Multiplier gates 20% wider (${Math.round(74 * 1.2 ** l)} → ${Math.round(74 * 1.2 ** (l + 1))} px)`, cost: 15, grow: 1.75, max: 6, req: ['core'], x: 1, y: 0, fx: (s, l) => { s.gateW *= 1.2 ** l; } },
    // excl 'machine': the gate stack (more gates, higher tiers: aim matters) or the pinball (splitters, magnets, portals: volume)
    { id: 'gate', excl: 'machine', name: 'Extra Gate', icon: '🚪', desc: (l) => `Gate Stack: +1 moving multiplier gate (${l + 1} → ${l + 2}). Leads to Gate Tier.`, cost: 38, grow: 2.8, max: 3, req: ['wide'], x: 2, y: 0, fx: (s, l) => { s.gates += l; } },
    { id: 'tier', name: 'Gate Tier', icon: '✖️', desc: (l) => `All gates upgrade: x${[2, 3, 5][Math.min(l, 2)]} → x${[3, 5, 5][Math.min(l, 2)]}`, cost: 170, grow: 3.4, max: 2, req: ['gate'], x: 3, y: 0, fx: (s, l) => { s.mult = [2, 3, 5][l]; } },
    { id: 'glide', name: 'Gate Glide', icon: '〰️', desc: 'Gates sweep 25% faster across the stream', cost: 26, grow: 2, max: 4, req: ['wide'], x: 2, y: -1, fx: (s, l) => { s.gateSpeed *= 1.25 ** l; } },
    { id: 'pad', name: 'Bounce Pad', icon: '🦘', desc: (l) => `+1 trampoline that kicks pellets back up (${l + 1} → ${l + 2})`, cost: 19, grow: 2.5, max: 3, req: ['core'], x: -1, y: 0, fx: (s, l) => { s.pads += l; } },
    { id: 'spring', name: 'Springy Pads', icon: '🌀', desc: 'Each pellet can bounce +1 more time', cost: 58, grow: 2.6, max: 3, req: ['pad'], x: -2, y: 0, fx: (s, l) => { s.padBounce += l; } },
    { id: 'burst', name: 'Capacitor', icon: '🔋', desc: 'Taps release +3 pellets; +20% tank', cost: 12, grow: 1.85, max: 5, req: ['core'], x: -1, y: 1, fx: (s, l) => { s.burst += 3 * l; s.cap *= 1.2 ** l; } },
    { id: 'salvage', name: 'Salvage Crew', icon: '🧲', desc: '+25% credits per kill', cost: 24, grow: 1.85, max: 8, req: ['gun'], x: -1, y: -1, fx: (s, l) => { s.salvage *= 1 + 0.25 * l; } },
    { id: 'pierce', name: 'Piercing Rounds', icon: '📌', desc: (l) => `Shots punch through +1 alien (now ${l})`, cost: 76, grow: 2.7, max: 3, req: ['gun'], x: 0, y: -2, fx: (s, l) => { s.pierce += l; s.beamW += 10 * l; } },
    { id: 'scan', name: 'Core Scanner', icon: '📡', desc: '+3% golden elites, +10% core drops', cost: 44, grow: 2.1, max: 5, req: ['shield'], x: 1, y: 1, fx: (s, l) => { s.elite += 0.03 * l; s.coreDrop += 0.1 * l; } },
    { id: 'boom', name: 'Explosive Pellets', icon: '💥', desc: '+8% of pellets become explosive shots', cost: 2, grow: 1.9, max: 5, req: ['tier'], x: 4, y: 0, cur: 'cores', fx: (s, l) => { s.explode += 0.08 * l; } },
    { id: 'split', name: 'Splitting Pellets', icon: '🧬', desc: '+10% chance a pellet splits on its first peg', cost: 2, grow: 1.9, max: 5, req: ['spring'], x: -3, y: 0, cur: 'cores', fx: (s, l) => { s.split += 0.1 * l; } },
    { id: 'rail', name: 'Railgun Coils', icon: '⚡', desc: '+50% shot damage', cost: 3, grow: 2, max: 4, req: ['pierce'], x: 0, y: -3, cur: 'cores', fx: (s, l) => { s.dmg *= 1.5 ** l; } },
    { id: 'aegis', name: 'Aegis Field', icon: '💠', desc: '+3 shield; the shield slowly recharges', cost: 3, grow: 2, max: 4, req: ['salvage'], x: -1, y: -2, cur: 'cores', fx: (s, l) => { s.shield += 3 * l; s.shieldRegen += 0.06 * l; } },
    // ---- turret line
    { id: 'feed', name: 'Turret Feed', icon: '⚙️', desc: '+15% fire rate, +10% damage', cost: 30, grow: 1.8, max: 8, req: ['gun'], x: 1, y: -2, fx: (s, l) => { s.rate *= 1.15 ** l; s.dmg *= 1.1 ** l; } },
    // excl 'ordnance': chain lightning for crowds, or big homing blasts for tanky targets
    { id: 'arc', excl: 'ordnance', name: 'Arc Rounds', icon: '🌩️', desc: 'Hits arc to +1 nearby alien for half damage. Best against swarms.', cost: 150, grow: 2.6, max: 3, req: ['feed'], x: 1, y: -3, fx: (s, l) => { s.arc += l; } },
    { id: 'missile', excl: 'ordnance', name: 'Missile Pod', icon: '🚀', desc: (l) => `Every ${[36, 26, 18][Math.min(l, 2)]} collected pellets launch a homing blast missile. Best against hives and the boss.`, cost: 120, grow: 2.4, max: 3, req: ['feed'], x: 2, y: -3, fx: (s, l) => { s.missile = [0, 36, 26, 18][l]; s.missDmg = 1 + 0.25 * (l - 1); } },
    { id: 'storm', name: 'Storm Lattice', icon: '🕸️', desc: 'Arcs jump +1 more alien, +30% arc damage', cost: 3, grow: 2, max: 3, req: ['arc'], x: 1, y: -4, cur: 'cores', fx: (s, l) => { s.arc += l; s.arcDmg += 0.3 * l; } },
    { id: 'streak', name: 'Bounty Streak', icon: '🔥', desc: '+0.3% credits per streak kill (max 60)', cost: 40, grow: 1.9, max: 5, req: ['salvage'], x: -2, y: -1, fx: (s, l) => { s.streak += 0.003 * l; } },
    // ---- gate machine (right): line the gates up
    { id: 'sync', name: 'Gate Sync', icon: '🎚️', desc: 'Lower gates drift 25% toward the top gate', cost: 110, grow: 2.3, max: 3, req: ['glide'], x: 3, y: -1, fx: (s, l) => { s.sync += 0.25 * l; } },
    { id: 'prism', name: 'Prism Gate', icon: '🔺', desc: 'Top gate is one multiplier tier higher', cost: 320, grow: 3, max: 2, req: ['tier'], x: 3, y: 1, fx: (s, l) => { s.prism += l; } },
    // excl 'fortune': active greed (more, longer jackpot gates to aim for) or passive income (cores over time)
    { id: 'luck', excl: 'fortune', name: 'Jackpot Sensor', icon: '🎰', desc: 'Golden x10 gates come 30% more often and last 1.2 s longer; each jackpot pays +1 core', cost: 60, grow: 2, max: 4, req: ['scan'], x: 2, y: 1, fx: (s, l) => { s.jackpot += l; } },
    // ---- pinball machine (left): the other build direction
    { id: 'splitter', excl: 'machine', name: 'Splitter Pegs', icon: '🟡', desc: (l) => `Pinball: +2 gold pegs that split pellets in two (now ${2 * l}). Leads to the Portal.`, cost: 45, grow: 2.3, max: 3, req: ['pad'], x: -2, y: 1, fx: (s, l) => { s.splitters += 2 * l; } },
    { id: 'magnet', name: 'Magnet Gates', icon: '🧿', desc: 'Gates tug falling pellets toward them', cost: 80, grow: 2.2, max: 4, req: ['splitter'], x: -3, y: 1, fx: (s, l) => { s.magnet += l; } },
    { id: 'portal', name: 'Portal Loop', icon: '🕳️', desc: (l) => `Floor portal re-drops pellets from the top, each loop doubling their worth (${l} → ${l + 1} loops)`, cost: 300, grow: 2.5, max: 3, req: ['magnet'], x: -4, y: 1, fx: (s, l) => { s.portal += l; } },
    { id: 'warp', name: 'Warp Echo', icon: '🪐', desc: '+30% chance a looped pellet comes out as two', cost: 3, grow: 2, max: 3, req: ['portal'], x: -5, y: 1, cur: 'cores', fx: (s, l) => { s.warp += 0.3 * l; } },
    // ---- defence (down)
    { id: 'supercap', name: 'Supercapacitor', icon: '🔌', desc: '+30% tank, +10% recharge', cost: 26, grow: 1.85, max: 6, req: ['burst'], x: -1, y: 2, fx: (s, l) => { s.cap *= 1.3 ** l; s.regen *= 1.1 ** l; } },
    { id: 'nova', name: 'Shield Nova', icon: '🎇', desc: 'Shield hits blast every alien near the shield', cost: 40, grow: 2, max: 4, req: ['shield'], x: 0, y: 2, fx: (s, l) => { s.nova += l; } },
    { id: 'reserve', name: 'Backup Generator', icon: '♻️', desc: 'Once per run, a broken shield reboots at half', cost: 260, grow: 2, max: 1, req: ['nova'], x: 0, y: 3, fx: (s) => { s.reserve = 1; } },
    { id: 'refinery', excl: 'fortune', name: 'Scrap Refinery', icon: '🏭', desc: '+12% credits; +1 core per 40 s survived', cost: 70, grow: 2.1, max: 3, req: ['scan'], x: 1, y: 2, fx: (s, l) => { s.salvage *= 1 + 0.12 * l; s.refine += l; } },
    // ---- character nodes
    { id: 'ace', who: 'corvette', name: 'Overcharge', icon: '🛩️', desc: 'Taps release +2 pellets, +15% damage', cost: 50, grow: 2.1, max: 5, req: ['gun'], x: 1, y: -1, fx: (s, l) => { s.burst += 2 * l; s.dmg *= 1.15 ** l; } },
    { id: 'salvo', who: 'corvette', name: 'Flak Salvo', icon: '🎆', desc: '+25% of tap-released pellets are explosive', cost: 90, grow: 2.2, max: 3, req: ['ace'], x: 2, y: -2, fx: (s, l) => { s.tapEx += 0.25 * l; } },
    { id: 'hangar', who: 'carrier', name: 'Hangar Bay', icon: '🛸', desc: '+2% drone launches, drones fly 2 s longer', cost: 50, grow: 2.1, max: 5, req: ['gun'], x: 1, y: -1, fx: (s, l) => { s.drone += 0.02 * l; s.droneLife += 2 * l; } },
    { id: 'wing', who: 'carrier', name: 'Wing Commander', icon: '✈️', desc: '+3 drone slots, drones hit 50% harder', cost: 90, grow: 2.2, max: 3, req: ['hangar'], x: 2, y: -2, fx: (s, l) => { s.droneMax += 3 * l; s.droneDmg += 0.5 * l; } },
    { id: 'focus', who: 'lancer', name: 'Focusing Lens', icon: '🔭', desc: 'Beam +12 px wide, +20% beam damage', cost: 50, grow: 2.1, max: 5, req: ['gun'], x: 1, y: -1, fx: (s, l) => { s.beamW += 12 * l; s.dmg *= 1.2 ** l; } },
    { id: 'twin', who: 'lancer', name: 'Split Beam', icon: '🔱', desc: 'A second beam hits another target (+35%)', cost: 90, grow: 2.2, max: 3, req: ['focus'], x: 2, y: -2, fx: (s, l) => { s.twin += 0.35 * l; } },
    { id: 'tether', who: 'weaver', name: 'Gate Tether', icon: '🪢', desc: '+1 more gate follows your finger (adds a gate if you have too few)', cost: 60, grow: 2.6, max: 2, req: ['gun'], x: 1, y: -1, fx: (s, l) => { s.steer += l; s.gates = Math.max(s.gates, s.steer); } },
    { id: 'loom', who: 'weaver', name: 'Loom', icon: '🧵', desc: 'Steered gates 15% wider; reactor sweeps slower', cost: 70, grow: 2.1, max: 4, req: ['tether'], x: 2, y: -2, fx: (s, l) => { s.steerW *= 1.15 ** l; s.sweep *= 0.88 ** l; } },
    { id: 'mother', name: 'Summon the Mothership', icon: '👾', desc: 'Next run draws out the Mothership. Destroy it to win.', cost: 2400, grow: 1, max: 1, req: ['rail', 'storm', 'aegis'], reqAll: 2, extra: { cores: 10 }, x: 0, y: -5, win: true },
  ];

  const BOSS_HP = 5e6, CAP = 300, G = 950;
  // wave hp: gentle growth, then a wall that every build hits within roughly a minute
  const hpAt = (t) => 2 * 1.075 ** t * (1 + t / 20) * 1.16 ** Math.max(0, t - 26) * 1.4 ** Math.max(0, t - 40);
  const ALIEN = { // r, hp x, speed x, shield dmg, credits
    drone: [11, 1, 1, 1, 1], brute: [17, 4, 0.62, 2, 4], elite: [12, 2.5, 1.15, 1, 3],
    warded: [13, 1.6, 0.85, 1, 2.5], swarm: [7, 0.3, 1.55, 1, 0.5], hive: [24, 9, 0.38, 3, 12], pod: [16, 1, 0, 0, 30],
  };
  const COLS = { drone: ['#2d6a4f', '#80ed99', '#b7efc5'], brute: ['#5a189a', '#c77dff', '#e0aaff'], elite: ['#b5651d', '#ffd166', '#fff3b0'],
    warded: ['#1d4e89', '#4cc9f0', '#caf0f8'], swarm: ['#9d0208', '#ff6b6b', '#ffc9c9'], hive: ['#3c096c', '#ff9ef0', '#ffd6f5'], pod: ['#6a040f', '#ff4d6d', '#ffccd5'] };
  const MULC = { 2: '#4cc9f0', 3: '#80ed99', 5: '#f72585', 8: '#ff9f1c', 12: '#e0aaff' };
  // run modifiers (from run 7, not on boss runs): each changes how a run plays, announced on the start banner
  const MODS = [
    { name: 'Gold Rush', desc: 'Golden elites are 3x as common', go: (s) => { s.elite *= 3; } },
    { name: 'Ion Storm', desc: 'Gates 30% wider, aliens 15% faster', go: (s) => { s.gateW *= 1.3; s.alienSp = 1.15; } },
    { name: 'Overcharge', desc: 'Tank +60%, recharge +30%, shield -1', go: (s) => { s.cap *= 1.6; s.regen *= 1.3; s.shield = Math.max(1, s.shield - 1); } },
    { name: 'Swarm Season', desc: 'Swarms twice as often; kills pay +25%', go: (s) => { s.swarmX = 2; s.salvage *= 1.25; } },
    { name: 'Bounce House', desc: '+1 bounce pad; pellets bounce once more', go: (s) => { s.pads += 1; s.padBounce += 1; } },
  ];
  // what each early run introduces (per character, since each one replays the tree)
  const NEWS = { 2: ['NEW: REPAIR BIN', 'Pellets in the cyan bin fix your shield'], 3: ['NEW: JACKPOT GATES', 'Gold x10 gates! Save plasma for them'],
    4: ['NEW: WARDED ALIENS', 'A bubble blocks their first hit'], 5: ['NEW: SWARMS', 'Fast wasps in packs. Arcs and blasts help'], 8: ['NEW: HIVE CARRIERS', 'Big and slow. Each drops a supply crate'] };
  let spr = () => false; // env.sprite once a run starts (the sim has none: vector art)
  // a sprite plus an additive copy of itself for the hit flash (a white blob would hide the art)
  function sprFlash(g, name, x, y, w, hit, o) {
    if (!spr(g, name, x, y, w, null, o)) return false;
    if (hit > 0) { const op = g.globalCompositeOperation; g.globalCompositeOperation = 'lighter'; spr(g, name, x, y, w, null, { ...o, alpha: 0.7 * hit }); g.globalCompositeOperation = op; }
    return true;
  }

  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, rnd = Math.random, runNo = env.runNo || 1;
    spr = env.sprite || (() => false);
    const mod = !env.boss && runNo >= 7 && !NEWS[runNo] && (runNo === 7 || rnd() < 0.7) ? MODS[Math.floor(rnd() * MODS.length)] : null;
    if (mod) mod.go(s);
    const SP = Math.round(H * 0.4), MY = SP, MH = H - SP;
    // number pops: never inside the HUD rows (top ~100 px, which includes the pause button) or against the screen edges
    if (fx.text) { const raw = fx.text.bind(fx); fx.text = (x, y, str, c, size) => raw(Math.max(40, Math.min(W - 40, x)), Math.max(env.boss ? 128 : 112, y), str, c, size); }
    const shieldY = SP - 44, railY = MY + 18;
    const slotY = [0.2, 0.38, 0.56, 0.72].map((f) => MY + MH * f), jackY = MY + MH * 0.47;
    const padY = MY + MH * 0.85, binY = H - 30, PR = 3.6, PEGR = 4.5, HIT2 = (PR + PEGR) ** 2;
    const pegs = [];
    [0.29, 0.47, 0.645].forEach((f, i) => { const n = i % 2 ? 5 : 6; for (let k = 0; k < n; k++) pegs.push({ x: W * (k + (i % 2 ? 1 : 0.5)) / 6, y: MY + MH * f, hit: 0, gi: -1 }); });
    [8, 2, 14, 3, 9, 13].slice(0, Math.min(6, s.splitters)).forEach((pi, k) => { if (pegs[pi]) pegs[pi].gi = k; }); // gold splitter pegs
    const tierUp = (m, n = 1) => TIERS[Math.min(TIERS.length - 1, Math.max(0, TIERS.indexOf(m)) + n)];
    const steer = s.steer || 0;
    const gates = Array.from({ length: Math.min(4, s.gates) }, (_, i) => {
      const w = Math.min(W * 0.7, s.gateW * (i < steer ? s.steerW : 1));
      return { y: slotY[i], w, sp: (0.6 + 0.13 * i) * s.gateSpeed * (i % 2 ? -1 : 1), ph: i * 1.9, x: W / 2, flash: 0, mult: i === 0 && s.prism ? tierUp(s.mult, s.prism) : s.mult, amp: Math.max(0, (W - w) / 2 - 10), steer: i < steer };
    });
    const npads = Math.min(4, s.pads), padXs = [[], [0.5], [0.28, 0.72], [0.18, 0.5, 0.82], [0.14, 0.38, 0.62, 0.86]][npads];
    const pads = padXs.map((f) => ({ x: W * f, w: 56, sq: 0 }));
    const stars = Array.from({ length: 80 }, () => ({ x: rnd() * W, y: rnd() * SP, s: rnd() * 1.6 + 0.3, v: 6 + rnd() * 20, tw: rnd() * TAU }));
    const R = { t: 0, over: false, won: false, dying: 0, charge: s.cap, emitAcc: 0, rx: W / 2, pellets: [], overflow: 0, overEx: 0,
      ammo: 0, ammoEx: 0, fireT: 0, turret: 0, recoil: [0, 0, 0], shots: [], aliens: [], spawnAcc: -0.3, waveT: 8, shield: s.shield, shMax: s.shield, shieldFlash: 0,
      gates, cr: 0, cores: 0, kills: 0, peak: 0, chain: 1, made: 0, beam: 0, beamT: 0, beams: [], drones: [], pulses: [], touched: false, boss: null, bossT: 0, in: null,
      freeze: 0, streak: 0, bestStreak: 0, banner: null, arcs: [], missiles: [], missAcc: 0, jack: null, jackT: 6, jackpots: 0, swarmT: 18, hiveT: 6, crates: 0, crateQ: 0,
      rateMul: 1, surgeT: 0, floodT: 0, bountyT: 0, reserveUsed: false, loops: 0, refineT: 0, portal: s.portal ? { x: W / 2, w: 40 + 10 * s.portal, flash: 0 } : null, intro: 0, sweepT: 0, cause: '', dmgAcc: 0, dpsE: 0,
      // the repair bin (from run 2): a slow cyan cup on the collector floor. Pellets caught in it fix the shield instead of
      // firing, so where you pour is offence vs defence. Each repair costs 50% more pellets than the last.
      bin: runNo >= 2 || env.boss ? { x: W * 0.3, w: 52, rep: 0, need: 22, flash: 0, ph: rnd() * TAU } : null, repairs: 0,
      jackTell: 0, jackPh: 0, jamT: 5, jamSeen: false, drops: [], lowWarn: false, mod };
    if (env.boss) {
      const r = Math.min(W * 0.2, 80);
      R.boss = { kind: 'boss', x: W / 2, y: -r, ty: 92 + r * 0.45, r, hp: BOSS_HP, max: BOSS_HP, sp: 1.4, dmg: 999, val: 400, inc: 0, hitT: -1, wob: 0, phase: 1, immune: true };
      R.aliens.push(R.boss); R.intro = 2.8;
      banner('WARNING', 'The Mothership is coming', '#ff4d6d', 2.8);
      // music sting: a falling minor siren, a low drone and a staccato pulse
      if (!sfx.play('siren', 0.8)) [[392, 0], [370, 0.18], [311, 0.36], [294, 0.54]].forEach(([f, d]) => sfx.tone(f, 0.22, 'square', 0.05, 0.98, d));
      sfx.tone(73.4, 2.2, 'sawtooth', 0.09, 0.9, 0.7); sfx.tone(110, 2, 'triangle', 0.07, 0.85, 0.75);
      for (let i = 0; i < 6; i++) sfx.tone(587, 0.06, 'square', 0.03, 1, 1.0 + i * 0.22);
    } else if (mod) banner(mod.name.toUpperCase(), mod.desc, '#80ed99', 2.6);
    else if (NEWS[runNo]) banner(NEWS[runNo][0], NEWS[runNo][1], '#ffd166', 2.6);
    else banner('READY', runNo <= 1 ? 'Aliens incoming: fill the guns!' : `Run ${runNo}`, '#7df9ff', 1.2);

    function banner(text, sub, col, life = 1.8) { R.banner = { text, sub, col, t: 0, life }; }
    function emit(tap) {
      if (R.charge < 1) return false;
      R.charge -= 1;
      const p = { x: R.rx + (rnd() - 0.5) * 6, y: railY + 10, vx: (rnd() - 0.5) * 50, vy: 80, ex: rnd() < s.explode || (tap && rnd() < s.tapEx), b: 0, pass: 0, age: 0, sp: false, sm: 0, loop: 0, m: 1 };
      if (R.pellets.length < CAP) R.pellets.push(p); else addOverflow(p.ex, 1);
      return true;
    }
    function tapBurst() {
      let n = 0; for (let i = 0; i < s.burst; i++) if (emit(true)) n++;
      if (n) { sfx.zap(); fx.ring(R.rx, railY, 22 + n, '#7df9ff'); } else { sfx.tone(160, 0.08, 'square', 0.03); fx.ring(R.rx, railY, 16, '#ff4d6d'); R.empty = 0.6; }
    }
    function addOverflow(ex, n) { if (ex) R.overEx += n; else R.overflow += n; }
    function collect(p) {
      if (p.m > R.chain) R.chain = p.m;
      load(p.ex, p.w || 1); // a portal-looped pellet is worth 2^loops shots
      if (s.drone && rnd() < s.drone && R.drones.length < s.droneMax) { R.drones.push({ life: s.droneLife, a: rnd() * TAU, fireT: 0.2, x: W / 2, y: shieldY - 50 }); sfx.zap(); }
      if (R.pulses.length < 24) R.pulses.push({ side: p.x < W / 2 ? 0 : 1, t: 0, ex: p.ex });
    }
    function load(ex, n) {
      if (s.beam) R.beam += n * (ex ? 1.6 : 1);
      else if (ex) R.ammoEx += n; else R.ammo += n;
      if (s.missile) R.missAcc += n;
    }
    function targetable(a) { return !a.dead && !(a.kind === 'boss' && a.immune); }
    function pick() {
      let best = null;
      for (const a of R.aliens) if (targetable(a) && a.inc < a.hp && (!best || a.y > best.y)) best = a;
      if (!best) for (const a of R.aliens) if (targetable(a) && (!best || a.y > best.y)) best = a;
      return best;
    }
    function shoot(x, y, dmg, ex, pierce, kind) {
      const tg = pick(); if (!tg) return false;
      const dx = tg.x - x, dy = tg.y - y, d = Math.hypot(dx, dy) || 1, v = 1050;
      tg.inc += dmg;
      R.shots.push({ x, y, vx: dx / d * v, vy: dy / d * v, dmg, ex, pierce, tg, last: null, kind, pw: Math.min(4, 1 + Math.log2(1 + dmg / s.dmg) * 0.6) });
      return true;
    }
    function hitAlien(a, d) {
      if (a.dead) return;
      if (a.kind === 'boss' && a.immune) { a.hitT = R.t; a.shimmer = 1; return; }
      if (a.bub) { a.bub = 0; a.bubT = R.t; a.hitT = R.t; fx.burst(a.x, a.y, 6, ['#caf0f8', '#4cc9f0'], 120, 2.5); sfx.tone(1400, 0.06, 'triangle', 0.04, 0.6); return; }
      if (a.kind === 'boss' && a.phase === 3) d *= 1.25;
      a.hp -= d; a.hitT = R.t; R.dmgAcc += Math.min(d, a.hp + d);
      if (a.kind === 'boss') bossCheck(a);
      if (a.hp <= 0) kill(a);
    }
    function bossCheck(B) {
      if (B.phase === 1 && B.hp <= B.max * 0.5) {
        B.hp = B.max * 0.5; B.phase = 2; B.immune = true; R.freeze = 0.35; fx.shake = 14;
        banner('PHASE 2', 'Shield pods! Break both to expose the core', '#ff9ef0', 2.4);
        sfx.boom(); [196, 233, 277, 330].forEach((f, i) => sfx.tone(f, 0.18, 'sawtooth', 0.06, 1, 0.1 + i * 0.1));
        fx.ring(B.x, B.y, 160, '#ff9ef0');
        for (let i = 0; i < 2; i++) {
          const hp = B.max * 0.06;
          R.aliens.push({ kind: 'pod', x: B.x, y: B.y, r: ALIEN.pod[0], hp, max: hp, sp: 0, dmg: 0, val: ALIEN.pod[4], inc: 0, hitT: -1, wob: i * Math.PI, dead: false, orbit: i * Math.PI });
        }
      }
    }
    function kill(a) {
      a.dead = true; R.kills++; R.streak++;
      if (R.streak > R.bestStreak) R.bestStreak = R.streak;
      if (R.streak % 25 === 0) { const k = Math.min(12, R.streak / 25); fx.text(W / 2, SP * 0.3, `STREAK ${R.streak}!`, '#ffb703', 22); sfx.tone(660 + k * 70, 0.12, 'triangle', 0.07); sfx.tone(990 + k * 105, 0.14, 'triangle', 0.05, 1, 0.07); }
      const v = a.val * 1.25 * s.salvage * (1 + R.t / 60) * (1 + Math.min(R.streak, 60) * s.streak) * (R.bountyT > 0 ? 1.6 : 1); R.cr += v;
      const col = COLS[a.kind] ? [COLS[a.kind][1], COLS[a.kind][2]] : ['#ff4d6d', '#ffd166', '#fff'];
      const big = a.kind === 'brute' || a.kind === 'hive' || a.kind === 'pod';
      fx.burst(a.x, a.y, a.kind === 'boss' ? 60 : big ? 16 : a.kind === 'swarm' ? 4 : 8, col, a.kind === 'boss' ? 320 : 170);
      if (a.kind !== 'swarm' || rnd() < 0.3) fx.text(a.x, a.y - 6, '+' + env.fmt(v), '#ffe8b0', 14);
      sfx.pop(big ? 0.6 : a.kind === 'swarm' ? 1.6 : 1.2);
      if (a.kind === 'elite' && rnd() < s.coreDrop) { R.cores++; sfx.ding(); fx.text(a.x, a.y - 26, '+1 core', '#ff9ef0', 17); R.freeze = Math.max(R.freeze, 0.04); }
      if (a.kind === 'brute') { fx.shake = Math.max(fx.shake, 3); R.freeze = Math.max(R.freeze, 0.025); }
      if (a.kind === 'hive') {
        fx.shake = Math.max(fx.shake, 6); R.freeze = Math.max(R.freeze, 0.07); fx.ring(a.x, a.y, 70, '#ff9ef0'); R.cores++;
        for (let i = 0; i < 4; i++) spawn('swarm', a.x + (i - 1.5) * 14, a.y);
        if (R.crates < 2 && env.pick) { R.crates++; R.drops.push({ x: a.x, y: a.y, y0: a.y, t: 0 }); } // a crate falls to the deck, then opens
      }
      if (a.kind === 'pod') {
        fx.shake = 10; R.freeze = 0.12; sfx.boom(); fx.ring(a.x, a.y, 90, '#ff4d6d');
        const B = R.boss; if (B && !B.dead && !R.aliens.some((o) => o.kind === 'pod' && !o.dead)) {
          B.phase = 3; B.immune = false; B.sp = 2.1; R.bossT = 1;
          banner('CORE EXPOSED', 'It is diving. Pour everything!', '#ffd166', 2); sfx.tone(880, 0.3, 'sawtooth', 0.06, 0.5);
        }
      }
      if (a.kind === 'boss') { R.won = true; R.cores += 5; fx.shake = 18; R.freeze = 0.4; sfx.boom(); fx.ring(a.x, a.y, 220, '#ffd166'); fx.ring(a.x, a.y, 140, '#fff'); R.dying = 0.01; banner('MOTHERSHIP DOWN', '', '#ffd166', 2); }
    }
    function explode(x, y, d, r = 46) {
      fx.ring(x, y, r, '#ff9f1c'); sfx.crack();
      for (const a of R.aliens) if (!a.dead && Math.hypot(a.x - x, a.y - y) < r + a.r) hitAlien(a, d);
    }
    function spawn(kind, x, y) {
      const t = R.t, hp = R.boss ? hpAt(Math.min(t, 32)) * 0.8 : hpAt(t); // boss runs: adds stop growing; the Mothership's dive is the clock
      if (!kind) {
        if (rnd() < s.elite) kind = 'elite';
        else if (runNo >= 4 && t > 10 && rnd() < Math.min(0.22, (t - 10) / 110)) kind = 'warded';
        else kind = rnd() < Math.min(0.28, t / 110) ? 'brute' : 'drone';
      }
      const k = ALIEN[kind], r = k[0];
      const a = { kind, x: x ?? r + 8 + rnd() * (W - 2 * r - 16), y: y ?? 30 - r, r, hp: hp * k[1] * (runNo <= 1 ? 0.85 : 1), max: hp * k[1] * (runNo <= 1 ? 0.85 : 1), sp: (32 + t * 0.6 + rnd() * 8) * k[2] * (s.alienSp || 1), dmg: k[3], val: k[4], inc: 0, hitT: -1, wob: rnd() * TAU, dead: false };
      if (kind === 'warded') { a.bub = 1; a.bubT = -9; }
      R.aliens.push(a);
      return a;
    }

    function stepPellets(dt) {
      const P = R.pellets;
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i], py = p.y;
        p.age += dt; p.vy = Math.min(720, p.vy + G * dt); p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 0.4 * dt;
        if (p.x < PR + 4) { p.x = PR + 4; p.vx = Math.abs(p.vx) * 0.6; } else if (p.x > W - PR - 4) { p.x = W - PR - 4; p.vx = -Math.abs(p.vx) * 0.6; }
        for (const g of pegs) {
          const dx = p.x - g.x, dy = p.y - g.y, d2 = dx * dx + dy * dy;
          if (d2 < HIT2 && d2 > 0.01) {
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, vn = p.vx * nx + p.vy * ny;
            p.x = g.x + nx * (PR + PEGR); p.y = g.y + ny * (PR + PEGR);
            if (vn < 0) { p.vx -= 1.5 * vn * nx; p.vy -= 1.5 * vn * ny; }
            p.vx += (rnd() - 0.5) * 50; g.hit = 1;
            if (!p.sp) { p.sp = true; if (s.split && rnd() < s.split) { const c = { ...p, vx: -p.vx + (rnd() - 0.5) * 40 }; if (P.length < CAP) P.push(c); else addOverflow(c.ex, 1); } }
            if (g.gi >= 0 && !(p.sm & (1 << g.gi))) {
              p.sm |= 1 << g.gi; R.made++;
              const c = { ...p, vx: -p.vx * 0.9 + (rnd() - 0.5) * 60 }; if (P.length < CAP) P.push(c); else addOverflow(c.ex, 1);
              if (rnd() < 0.08) sfx.tone(1700 + rnd() * 300, 0.04, 'sine', 0.02);
            }
          }
        }
        for (let gi = 0; gi < gates.length; gi++) {
          const g = gates[gi], bit = 1 << gi;
          if (s.magnet && !(p.pass & bit) && p.y < g.y && g.y - p.y < 80) {
            const dx = g.x - p.x; if (Math.abs(dx) < g.w / 2 + 26 * s.magnet) p.vx += dx * 6.6 * s.magnet * dt;
          }
          if (!(p.pass & bit) && py < g.y && p.y >= g.y && Math.abs(p.x - g.x) < g.w / 2) multiply(p, g, bit, R.surgeT > 0 ? tierUp(g.mult) : g.mult);
        }
        const J = R.jack;
        if (J && !(p.pass & 32) && py < J.y && p.y >= J.y && Math.abs(p.x - J.x) < J.w / 2) multiply(p, J, 32, 10);
        if (py < padY && p.y >= padY && p.b < s.padBounce) {
          for (const pd of pads) if (Math.abs(p.x - pd.x) < pd.w / 2) {
            p.y = padY; p.b++; p.pass = 0;
            p.vy = -Math.sqrt(2 * G * (padY - (MY + MH * 0.1))) * (0.85 + rnd() * 0.2); p.vx = (rnd() - 0.5) * 160 + (pd.x - W / 2) * -0.3;
            pd.sq = 1; if (rnd() < 0.2) sfx.play('bounce', 0.4, 0.9 + rnd() * 0.2) || sfx.pop(1.6);
            break;
          }
        }
        const Q = R.portal;
        if (Q && p.y >= binY - 6 && p.loop < s.portal && Math.abs(p.x - Q.x) < Q.w / 2) {
          p.loop++; R.loops++; p.pass = 0; p.sm = 0; p.b = 0; p.w = (p.w || 1) * 2; p.age = 0; p.x = W - Q.x + (rnd() - 0.5) * 10; p.y = railY + 14; p.vy = 40; p.vx = (rnd() - 0.5) * 60; Q.flash = 1;
          if (s.warp && rnd() < s.warp) { const c = { ...p, vx: -p.vx + (rnd() - 0.5) * 50 }; if (P.length < CAP) P.push(c); else addOverflow(c.ex, 1); }
          continue;
        }
        if (p.y >= binY && R.bin && R.shield < R.shMax && Math.abs(p.x - R.bin.x) < R.bin.w / 2) { repair(); P[i] = P[P.length - 1]; P.pop(); continue; }
        if (p.y >= binY || p.age > 9) { collect(p); P[i] = P[P.length - 1]; P.pop(); }
      }
    }
    function repair() {
      const b = R.bin; b.rep++; b.flash = Math.max(b.flash, 0.5);
      if (b.rep < b.need) return;
      const n = Math.min(R.shMax - R.shield, Math.max(1, Math.round(R.shMax * 0.15)));
      R.shield += n; b.rep = 0; b.need = Math.round(b.need * 1.5); b.flash = 1; R.repairs++; R.shieldFlash = 1;
      fx.text(b.x, binY - 30, `+${Math.ceil(n)} shield`, '#7df9ff', 17); fx.ring(b.x, binY - 8, 40, '#7df9ff'); fx.ring(W / 2, shieldY, 120, '#7df9ff');
      sfx.tone(660, 0.1, 'triangle', 0.07); sfx.tone(990, 0.16, 'triangle', 0.06, 1, 0.08);
    }
    function multiply(p, g, bit, mult) {
      const P = R.pellets;
      if (g.jam > 0) return; // jammed by the Mothership: no multiply
      if (g === R.jack && s.jackpot && !g.paid) { g.paid = true; R.cores++; fx.text(g.x, g.y - 30, '+1 core', '#ff9ef0', 17); sfx.ding(); }
      p.pass |= bit; p.m = Math.min(9999, p.m * mult); g.flash = 1;
      const n = mult - 1; R.made += n;
      for (let k = 0; k < n; k++) {
        if (P.length < CAP) P.push({ ...p, vx: p.vx + (k - (n - 1) / 2 + (rnd() - 0.5)) * 70 + (k % 2 ? 30 : -30), vy: p.vy * (0.8 + rnd() * 0.2) });
        else addOverflow(p.ex, 1);
      }
      if (rnd() < 0.15) sfx.play('gate', 0.35, 0.8 + Math.min(mult, 12) * 0.05) || sfx.tone(600 + Math.min(mult, 12) * 120 + rnd() * 80, 0.05, 'sine', 0.025);
    }
    function openCrate() {
      const all = [
        { icon: '⚙️', name: 'Overclock', desc: 'Turrets fire 50% faster for the rest of the run', go: () => { R.rateMul *= 1.5; R.beamBoost = (R.beamBoost || 1) * 1.3; } },
        { icon: '✖️', name: 'Gate Surge', desc: 'Every gate is one tier higher for 12 s', go: () => { R.surgeT = 12; } },
        { icon: '🛡️', name: 'Shield Patch', desc: '+2 max shield, refilled now', go: () => { R.shMax += 2; R.shield = R.shMax; } },
        { icon: '⚛️', name: 'Plasma Flood', desc: 'Tank refilled; recharge doubled for 12 s', go: () => { R.charge = s.cap; R.floodT = 12; } },
        { icon: '💰', name: 'Bounty Hunt', desc: '+60% credits per kill for 15 s', go: () => { R.bountyT = 15; } },
      ];
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
      const opts = all.slice(0, 3);
      sfx.play('crate', 0.8);
      env.pick('Supply crate! Pick one', opts.map(({ icon, name, desc }) => ({ icon, name, desc })), (i) => {
        const o = opts[i]; if (!o) return;
        o.go(); banner(o.name, o.desc, '#80ed99', 1.6); fx.ring(W / 2, SP * 0.5, 90, '#80ed99');
      });
    }

    const run = {
      get over() { return R.over; }, get t() { return R.t; }, R,
      update(dt, input) {
        R.in = { x: input.x, y: input.y, down: input.down };
        if (R.over) return;
        if (R.banner) { R.banner.t += dt; if (R.banner.t > R.banner.life) R.banner = null; }
        if (R.dying) { // slow-mo end: the world keeps drifting at quarter speed under the cause banner
          R.dying += dt; fx.update(dt * 0.35);
          for (const a of R.aliens) if (a.kind !== 'pod') a.y += a.sp * dt * 0.25;
          if (R.dying > 1.6) R.over = true; return;
        }
        if (R.freeze > 0) { R.freeze -= dt; fx.update(dt * 0.25); return; } // hit pause
        R.dpsE += (R.dmgAcc / Math.max(dt, 1e-3) - R.dpsE) * Math.min(1, dt / 3); R.dmgAcc = 0; // ~3 s average of damage dealt
        R.t += dt; R.empty = Math.max(0, (R.empty || 0) - dt);
        // reactor: follows the finger, taps burst, holding streams. The Weaver's reactor sweeps by itself and the finger steers gates.
        if (input.down || input.taps.length) R.touched = true;
        R.charge = Math.min(s.cap, R.charge + s.regen * (R.floodT > 0 ? 2 : 1) * dt);
        if (s.auto) {
          R.sweepT += dt * s.sweep;
          R.rx = W / 2 + (Math.sin(R.sweepT * 0.85) * 0.75 + Math.sin(R.sweepT * 2.1 + 1) * 0.25) * (W / 2 - 34);
          for (let i = 0; i < input.taps.length; i++) tapBurst();
          R.emitAcc += s.flow * dt; while (R.emitAcc >= 1) { R.emitAcc -= 1; if (!emit(false)) { R.emitAcc = 0; break; } }
        } else {
          if (input.down) R.rx += (Math.max(20, Math.min(W - 20, input.x)) - R.rx) * Math.min(1, dt * 14);
          for (const tp of input.taps) { R.rx = Math.max(20, Math.min(W - 20, tp.x)); tapBurst(); }
          if (input.down) { R.emitAcc += s.flow * dt; while (R.emitAcc >= 1) { R.emitAcc -= 1; if (!emit(false)) { R.emitAcc = 0; break; } } }
        }
        // gates & pads
        const g0 = gates[0];
        for (let i = 0; i < gates.length; i++) {
          const g = gates[i];
          if (g.steer) { if (input.down) { const tx = Math.max(W / 2 - g.amp, Math.min(W / 2 + g.amp, input.x)); g.x += (tx - g.x) * Math.min(1, dt * 12); } }
          else { g.x = W / 2 + Math.sin(R.t * g.sp + g.ph) * g.amp; if (i && s.sync) g.x += (g0.x - g.x) * Math.min(0.9, s.sync); }
          g.flash = Math.max(0, g.flash - dt * 5);
          if (g.tell > 0) { g.tell -= dt; if (g.tell <= 0) { g.jam = 4; sfx.crack(); fx.burst(g.x, g.y, 10, ['#ff4d6d', '#adb5bd'], 120); } }
          if (g.jam > 0) g.jam -= dt;
        }
        for (const pd of pads) pd.sq = Math.max(0, pd.sq - dt * 6);
        for (const pg of pegs) pg.hit = Math.max(0, pg.hit - dt * 6);
        if (R.portal) { const Q = R.portal; Q.x = W / 2 + Math.sin(R.t * 0.7 + 2) * (W / 2 - Q.w / 2 - 12); Q.flash = Math.max(0, Q.flash - dt * 3); }
        // jackpot gate: a rare golden x10 gate that sweeps through the middle of the machine (from run 3). A 1.6 s pre-tell
        // shows where it will open, so the play is: stop pouring, let the tank fill, then dump it through the gold gate.
        const JW = 54, JA = (W - JW) / 2 - 12;
        if (R.jack) { const J = R.jack; J.t -= dt; J.x = W / 2 + Math.sin(R.t * 1.3 + J.ph) * J.amp; J.flash = Math.max(0, J.flash - dt * 5); if (J.t <= 0) R.jack = null; }
        else if (R.jackTell > 0) {
          R.jackTell -= dt;
          if (R.jackTell <= 0) {
            const life = 4 + 1.2 * s.jackpot; R.jack = { y: jackY, w: JW, x: W / 2, amp: JA, ph: R.jackPh, t: life, life, flash: 0, mult: 10 }; R.jackpots++;
            sfx.ding(); sfx.tone(1568, 0.2, 'triangle', 0.06, 1, 0.12);
          }
        } else if (runNo >= 3 && !R.boss && R.t > 6) {
          R.jackT -= dt;
          if (R.jackT <= 0) {
            R.jackT = (16 + rnd() * 10) / (1 + 0.3 * s.jackpot); R.jackTell = 1.6; R.jackPh = rnd() * TAU;
            banner('JACKPOT INCOMING', 'Let go to save plasma, then pour on the x10', '#ffd166', 1.6);
            [988, 1175, 1319].forEach((f, i) => sfx.tone(f, 0.09, 'triangle', 0.05, 1, i * 0.12));
          }
        }
        R.jackX = W / 2 + Math.sin(R.t * 1.3 + R.jackPh) * JA; // where the tell is drawn
        if (R.bin) { const b = R.bin; b.x = W / 2 + Math.sin(R.t * 0.42 + b.ph) * (W / 2 - 44); b.flash = Math.max(0, b.flash - dt * 3); }
        for (const d of R.drops) { d.t += dt; d.y = d.y0 + (SP - 40 - d.y0) * Math.min(1, d.t / 0.8) ** 2; if (d.t >= 0.95) { d.done = true; R.crateQ++; fx.ring(d.x, d.y, 40, '#80ed99'); } }
        R.drops = R.drops.filter((d) => !d.done);
        const sub = dt > 0.02 ? 2 : 1; for (let i = 0; i < sub; i++) stepPellets(dt / sub);
        R.peak = Math.max(R.peak, R.pellets.length);
        if (R.overflow || R.overEx) { load(false, R.overflow); load(true, R.overEx); R.overflow = R.overEx = 0; }
        for (const pu of R.pulses) pu.t += dt * 3; R.pulses = R.pulses.filter((p) => p.t < 1);
        R.surgeT = Math.max(0, R.surgeT - dt); R.floodT = Math.max(0, R.floodT - dt); R.bountyT = Math.max(0, R.bountyT - dt);
        if (s.refine) { R.refineT += dt * s.refine; if (R.refineT >= 40) { R.refineT -= 40; R.cores++; fx.text(W - 100, 110, '+1 core', '#ff9ef0', 15); } }
        // aliens
        const B = R.boss;
        if (R.intro > 0) {
          R.intro -= dt; B.y += (B.ty - B.y) * Math.min(1, dt * 2.2);
          if (R.intro <= 0) { B.immune = false; B.y = B.ty; }
        } else {
          const rate = (0.8 + 0.05 * R.t) * (B ? 0.55 : 1);
          R.spawnAcc += rate * dt; while (R.spawnAcc >= 1) { R.spawnAcc -= 1; spawn(); }
          R.waveT -= dt; if (R.waveT <= 0) { R.waveT = 9; const n = 5; for (let i = 0; i < n; i++) spawn('drone', W * (i + 0.5) / n); }
          // swarms (from run 6) and hive carriers (from run 9) phase in over the run
          if (runNo >= 5 && R.t > 16) { R.swarmT -= dt * (s.swarmX || 1); if (R.swarmT <= 0) { R.swarmT = 11 + rnd() * 5; const cx = 50 + rnd() * (W - 100); for (let i = 0; i < 6; i++) spawn('swarm', cx + (i - 2.5) * 13, 20 - Math.abs(i - 2.5) * 10); sfx.tone(300, 0.2, 'sawtooth', 0.03, 1.8); } }
          if (runNo >= 8 && R.t > 22 && !B) { R.hiveT -= dt; if (R.hiveT <= 0) { R.hiveT = 20 + rnd() * 6; spawn('hive'); sfx.tone(90, 0.5, 'sawtooth', 0.06, 0.7); } }
          if (B && !B.dead) { R.bossT -= dt; if (R.bossT <= 0) { R.bossT = B.phase === 3 ? 0.7 : 1.4; spawn(B.phase === 3 ? 'swarm' : 'drone', B.x + (rnd() - 0.5) * B.r, B.y + B.r * 0.3); } }
          // the Mothership jams a gate: it glows red for 1.3 s (the tell), then stops multiplying for 4 s. Phase 3 jams faster.
          if (B && !B.dead && gates.length) {
            R.jamT -= dt;
            if (R.jamT <= 0 && !gates.some((gt) => gt.jam > 0 || gt.tell > 0)) {
              const gt = gates[Math.floor(rnd() * gates.length)]; gt.tell = 1.3; R.jamT = B.phase === 3 ? 4.5 : 7;
              sfx.tone(520, 0.12, 'square', 0.04); sfx.tone(390, 0.18, 'square', 0.04, 1, 0.14);
              if (!R.jamSeen) { R.jamSeen = true; banner('GATE JAM', 'The red gate shuts off: aim elsewhere!', '#ff4d6d', 1.8); }
            }
          }
        }
        for (const a of R.aliens) {
          if (a.dead) continue;
          if (a.kind === 'pod') { a.orbit += dt * 1.4; a.x = B.x + Math.cos(a.orbit) * B.r * 1.25; a.y = B.y + Math.sin(a.orbit) * B.r * 0.5 + B.r * 0.15; continue; }
          if (a.kind === 'boss' && R.intro > 0) continue;
          a.y += a.sp * dt; a.x += Math.sin(R.t * (a.kind === 'swarm' ? 4 : 1.6) + a.wob) * (a.kind === 'boss' ? 12 : a.kind === 'swarm' ? 40 : 18) * dt;
          a.x = Math.max(a.r, Math.min(W - a.r, a.x));
          if (a.kind === 'warded' && !a.bub && R.t - a.bubT > 2.5) a.bub = 1;
          if (a.kind !== 'boss' && a.y + a.r * 0.6 >= shieldY) {
            const dmg = Math.round(a.dmg * (B ? 1 : 1 + Math.max(0, R.t - 40) / 3) + (B ? 0 : R.shMax * Math.max(0, R.t - 40) / 50)); // late waves hit harder: runs end crisply
            a.dead = true; R.shield -= dmg; R.shieldFlash = 1; fx.shake = Math.max(fx.shake, dmg > 1 ? 9 : 6); sfx.hit(); sfx.crack(); R.freeze = Math.max(R.freeze, 0.05);
            if (R.streak >= 10) fx.text(W / 2, shieldY - 40, 'streak lost', '#ff8fa3', 14);
            R.streak = 0; R.cause = a.kind === 'hive' ? 'A hive carrier' : a.kind === 'brute' ? 'A brute' : a.kind === 'swarm' ? 'The swarm' : 'An alien';
            fx.burst(a.x, shieldY, 10, ['#4cc9f0', '#caf0f8'], 160); fx.text(a.x, shieldY - 14, '-' + Math.min(dmg, 99) + ' shield', '#ff8fa3', 15);
            if (s.nova) { const d = R.dpsE * 0.6 * s.nova + 2 * s.dmg; fx.ring(a.x, shieldY, 150, '#7df9ff'); for (const o of R.aliens) if (!o.dead && o.kind !== 'boss' && o.kind !== 'pod' && o.y > shieldY - 150) hitAlien(o, d); }
          }
        }
        R.shield = Math.min(R.shMax, R.shield + s.shieldRegen * dt); R.shieldFlash = Math.max(0, R.shieldFlash - dt * 3);
        // low-shield warning: once per dip, in words and sound (the bar colour alone is not enough)
        const low = R.shield > 0 && R.shield <= Math.max(1, R.shMax * 0.25);
        if (low && !R.lowWarn) { R.lowWarn = R.lowEver = true; sfx.tone(880, 0.12, 'square', 0.05); sfx.tone(660, 0.16, 'square', 0.05, 1, 0.15); fx.text(W / 2, shieldY - 30, R.bin && !s.auto ? 'LOW SHIELD: pour into the repair bin!' : 'LOW SHIELD!', '#ff4d6d', 16); }
        else if (R.shield > R.shMax * 0.5) R.lowWarn = false;
        // turrets
        if (s.beam) {
          R.beamT += dt;
          const tg = R.beam > 0 && pick(), bd = s.dmg * 0.9 * (R.beamBoost || 1);
          if (tg && (R.beam * bd >= tg.hp || R.beamT > 1.1 || R.beam > 400)) {
            const d = R.beam * bd, x = tg.x, w = s.beamW;
            for (const a of R.aliens) if (!a.dead && Math.abs(a.x - x) < w / 2 + a.r) hitAlien(a, d);
            R.beams.push({ x, w: w * Math.min(2, 0.8 + Math.log10(1 + R.beam) * 0.4), t: 0 });
            if (s.twin) {
              let t2 = null; for (const a of R.aliens) if (targetable(a) && Math.abs(a.x - x) > w / 2 + a.r && (!t2 || a.y > t2.y)) t2 = a;
              if (t2) { const x2 = t2.x; for (const a of R.aliens) if (!a.dead && Math.abs(a.x - x2) < w / 2 + a.r) hitAlien(a, d * s.twin); R.beams.push({ x: x2, w: w * 0.7, t: 0, twin: true }); }
            }
            const big = d >= tg.max * 0.5; // hit-stop and a heavier kick on a beam that deletes a big target
            R.beam = 0; R.beamT = 0; R.recoil[2] = 1;
            if (!sfx.play('beam', 0.7)) { sfx.zap(); sfx.tone(180, 0.18, 'sawtooth', 0.05, 2.2); }
            fx.shake = Math.max(fx.shake, big && tg.r > 14 ? 5 : 2); if (big && tg.r > 14) R.freeze = Math.max(R.freeze, 0.05);
          }
        } else {
          R.fireT -= dt;
          const q = R.ammo + R.ammoEx, rate = s.rate * R.rateMul;
          if (!q || !R.aliens.some(targetable)) R.fireT = Math.max(R.fireT, 0);
          while (R.fireT <= 0 && R.ammo + R.ammoEx > 0) {
            const tot = R.ammo + R.ammoEx, pw = Math.max(1, Math.ceil(tot / (rate * 0.5)));
            const ex = R.ammoEx > 0, n = Math.min(pw, ex ? R.ammoEx : R.ammo);
            const tx = W / 2 + (R.turret ? 50 : -50);
            if (!shoot(tx, SP - 30, n * s.dmg, ex, s.pierce, 0)) break;
            if (ex) R.ammoEx -= n; else R.ammo -= n;
            R.recoil[R.turret] = 1; R.turret ^= 1; R.fireT += 1 / rate;
            if (rnd() < 0.5) sfx.play('shot', 0.25, 0.9 + rnd() * 0.25) || sfx.tone(1200 + rnd() * 300, 0.04, 'square', 0.018, 0.5);
          }
        }
        // missiles: every s.missile collected pellets build one; it carries that batch's damage x0.8 as a wide blast
        if (s.missile && R.missAcc >= s.missile && R.missiles.length < 6 && R.aliens.some(targetable)) {
          const side = R.missiles.length % 2;
          R.missiles.push({ x: W / 2 + (side ? 80 : -80), y: SP - 16, vx: (side ? 1 : -1) * 120, vy: -260, dmg: R.missAcc * s.dmg * 0.8 * (s.missDmg || 1) * (s.beam ? 0.5 : 1), tg: pick(), trail: [] });
          R.missAcc = 0; sfx.tone(240, 0.16, 'sawtooth', 0.03, 2.5);
        }
        for (const m of R.missiles) {
          if (!m.tg || !targetable(m.tg)) m.tg = pick();
          if (m.tg) { const dx = m.tg.x - m.x, dy = m.tg.y - m.y, d = Math.hypot(dx, dy) || 1; m.vx += (dx / d * 700 - m.vx) * Math.min(1, dt * 4); m.vy += (dy / d * 700 - m.vy) * Math.min(1, dt * 4); if (d < m.tg.r + 8) { hitAlien(m.tg, m.dmg); explode(m.x, m.y, m.dmg * 0.6, 64); fx.shake = Math.max(fx.shake, 3); m.done = true; } }
          m.x += m.vx * dt; m.y += m.vy * dt; m.trail.push(m.x, m.y); if (m.trail.length > 16) m.trail.splice(0, 2);
          if (m.y < -40 || m.y > SP + 40) m.done = true;
        }
        R.missiles = R.missiles.filter((m) => !m.done);
        for (const d of R.drones) {
          d.life -= dt; d.a += dt * 0.9; d.x = W / 2 + Math.cos(d.a) * W * 0.36; d.y = shieldY - 50 + Math.sin(d.a * 2) * 22;
          d.fireT -= dt;
          if (d.fireT <= 0) { // drones also draw from the ammo queue, hitting harder than the turrets
            d.fireT = 0.3 / R.rateMul; const n = Math.max(0, Math.min(R.ammo, Math.ceil(R.ammo / (s.rate * 0.5))));
            if (shoot(d.x, d.y, s.dmg * (s.droneDmg + n * 1.6), false, 0, 1)) R.ammo -= n;
          }
        }
        R.drones = R.drones.filter((d) => d.life > 0);
        for (let i = 0; i < 3; i++) R.recoil[i] = Math.max(0, R.recoil[i] - dt * 8);
        for (const b of R.beams) b.t += dt; R.beams = R.beams.filter((b) => b.t < 0.3);
        for (const a of R.arcs) a.t += dt; R.arcs = R.arcs.filter((a) => a.t < 0.18);
        // shots
        for (const sh of R.shots) {
          sh.x += sh.vx * dt; sh.y += sh.vy * dt;
          for (const a of R.aliens) {
            if (a.dead || a === sh.last || sh.done) continue;
            const dx = a.x - sh.x, dy = a.y - sh.y;
            if (dx * dx + dy * dy < (a.r + 5) ** 2) {
              hitAlien(a, sh.dmg); if (sh.ex) explode(sh.x, sh.y, sh.dmg * 0.8);
              if (s.arc) arc(a, sh.dmg * (0.5 + s.arcDmg));
              if (sh.tg === a) { a.inc -= sh.dmg; sh.tg = null; }
              if (!a.dead || a.kind !== 'boss') fx.burst(sh.x, sh.y, 2, ['#caf0f8'], 80, 2);
              if (sh.pierce-- <= 0) sh.done = true; sh.last = a;
            }
          }
          if (sh.y < -20 || sh.x < -20 || sh.x > W + 20) sh.done = true;
          if (sh.done && sh.tg) { sh.tg.inc -= sh.dmg; sh.tg = null; }
        }
        R.shots = R.shots.filter((sh) => !sh.done);
        R.aliens = R.aliens.filter((a) => !a.dead);
        for (const st of stars) { st.y += st.v * dt; if (st.y > SP) { st.y = 0; st.x = rnd() * W; } }
        fx.update(dt);
        if (R.crateQ && !R.won) { R.crateQ--; openCrate(); }
        if (R.won) return;
        if (B && !B.dead && B.y + B.r * 0.6 >= shieldY) { R.shield = 0; R.reserveUsed = true; R.cause = 'The Mothership'; }
        if (R.shield <= 0 && s.reserve && !R.reserveUsed) {
          R.reserveUsed = true; R.shield = Math.ceil(R.shMax * 0.5); R.freeze = 0.25; fx.shake = 12;
          banner('BACKUP ONLINE', 'Shield rebooted at half strength', '#7df9ff', 1.6); sfx.tone(220, 0.4, 'triangle', 0.08, 3); fx.ring(W / 2, shieldY, 260, '#7df9ff');
          for (const o of R.aliens) if (o.kind !== 'boss' && o.kind !== 'pod' && o.y > shieldY - 120) hitAlien(o, R.dpsE * 2 + 5 * s.dmg);
        }
        if (R.shield <= 0) {
          R.shield = 0; R.dying = 0.01; sfx.boom(); fx.shake = 14; fx.burst(W / 2, SP - 10, 40, ['#ff4d6d', '#ffd166', '#4cc9f0'], 280, 4);
          banner(B ? 'BREACHED' : 'SHIELD DOWN', `${R.cause || 'An alien'} broke through at ${Math.floor(R.t)} s`, '#ff4d6d', 1.8);
        }
      },
      draw(g) { drawRun(g); },
      quit() { R.quit = true; },
      result() {
        const lines = [`${R.kills} aliens downed in ${Math.round(R.t)} s · best streak ${R.bestStreak}`,
          `Peak ${R.peak} pellets · best chain x${R.chain >= 9999 ? '9999+' : R.chain}${R.jackpots ? ` · ${R.jackpots} jackpot gate${R.jackpots > 1 ? 's' : ''}` : ''}${R.repairs ? ` · ${R.repairs} repair${R.repairs > 1 ? 's' : ''}` : ''}${R.loops ? ` · ${env.fmt(R.loops)} portal loops` : ''}`];
        if (R.mod) lines.push(`Modifier: ${R.mod.name}`);
        const earned = { credits: R.cr, cores: R.cores };
        if (R.won) return { won: true, earned, lines, score: R.kills };
        // a next-step hint: the first that applies
        const L = env.levels || {}, has = (id) => (L[id] || 0) > 0;
        const tip = [[!has('gun'), 'Next: Turret Damage makes every shot count'], [!has('wide'), 'Next: Wide Gates catch more of your stream'],
          [!has('shield'), 'Next: Shield Cells let you take more hits'], [R.bin && !s.auto && !R.repairs && R.lowEver && runNo <= 8, 'Tip: when the shield is low, pour into the cyan repair bin'],
          [R.cause === 'The swarm' && !has('arc') && !has('nova'), 'Swarms: Arc Rounds or Shield Nova clear packs'],
          [R.cause === 'A hive carrier' && !has('pierce'), 'Hives: Piercing Rounds and missiles chew through them'],
          [!has('gate') && !has('splitter'), 'Pick a build: Extra Gate (stack) or Splitter Pegs (pinball)'],
          [!has('feed'), 'Next: Turret Feed fires faster']].find((x) => x[0]);
        if (tip && !R.quit) lines.push(tip[1]);
        const title = R.quit ? 'Run ended' : R.boss ? 'The Mothership broke through' : `Shield down: ${(R.cause || 'an alien').toLowerCase()} got through`;
        return { won: false, title, earned, lines, score: R.kills };
      },
    };
    function arc(from, d) {
      let src = from;
      const hitSet = [from];
      for (let k = 0; k < s.arc; k++) {
        let best = null, bd = 110 * 110;
        for (const a of R.aliens) { if (a.dead || hitSet.includes(a) || !targetable(a)) continue; const dx = a.x - src.x, dy = a.y - src.y, q = dx * dx + dy * dy; if (q < bd) { bd = q; best = a; } }
        if (!best) break;
        if (R.arcs.length < 40) R.arcs.push({ x1: src.x, y1: src.y, x2: best.x, y2: best.y, t: 0 });
        hitSet.push(best); hitAlien(best, d); src = best;
      }
    }

    // ------------------------------------------------------------------ drawing
    function drawRun(g) {
      const sx = (rnd() - 0.5) * fx.shake, sy = (rnd() - 0.5) * fx.shake;
      g.save(); g.translate(sx, sy);
      drawSpace(g);
      for (const a of R.aliens) a.kind === 'boss' ? drawBoss(g, a, R.t) : drawAlien(g, a, R.t);
      for (const d of R.drops) { // supply crates falling from a hive to the deck
        const wob = Math.sin(d.t * 14) * 0.2 * (1 - d.t);
        if (!spr(g, 'obj-crate', d.x, d.y, 32, null, { rot: wob })) {
          g.save(); g.translate(d.x, d.y); g.rotate(wob); g.fillStyle = '#2d6a4f'; rr(g, -13, -11, 26, 22, 4); g.fill(); g.strokeStyle = '#80ed99'; g.lineWidth = 2; g.stroke();
          g.fillStyle = '#b7efc5'; g.fillRect(-2, -7, 4, 14); g.fillRect(-7, -2, 14, 4); g.restore();
        }
      }
      for (const b of R.beams) {
        const q = 1 - b.t / 0.3, c = b.twin ? '199,125,255' : '247,37,133';
        g.fillStyle = `rgba(${c},${0.35 * q})`; g.fillRect(b.x - b.w / 2, 0, b.w, SP - 24);
        g.fillStyle = `rgba(255,220,240,${0.9 * q})`; g.fillRect(b.x - b.w * 0.18, 0, b.w * 0.36, SP - 24);
      }
      g.lineCap = 'round';
      for (const sh of R.shots) {
        g.strokeStyle = sh.kind ? '#b7efc5' : sh.ex ? '#ff9f1c' : '#7df9ff'; g.lineWidth = 2.2 * sh.pw;
        g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(sh.x - sh.vx * 0.022, sh.y - sh.vy * 0.022); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(sh.x, sh.y, 1.4 * sh.pw, 0, TAU); g.fill();
      }
      if (R.arcs.length) {
        g.strokeStyle = '#d0f4ff'; g.lineWidth = 2; g.shadowColor = '#7df9ff'; g.shadowBlur = 8; g.beginPath();
        for (const a of R.arcs) { g.moveTo(a.x1, a.y1); const n = 4; for (let k = 1; k <= n; k++) { const f = k / n, j = k < n ? 14 : 0; g.lineTo(a.x1 + (a.x2 - a.x1) * f + (rnd() - 0.5) * j, a.y1 + (a.y2 - a.y1) * f + (rnd() - 0.5) * j); } }
        g.stroke(); g.shadowBlur = 0;
      }
      for (const m of R.missiles) {
        g.strokeStyle = 'rgba(255,183,3,.5)'; g.lineWidth = 3; g.beginPath(); for (let k = 0; k < m.trail.length; k += 2) k ? g.lineTo(m.trail[k], m.trail[k + 1]) : g.moveTo(m.trail[k], m.trail[k + 1]); g.stroke();
        g.save(); g.translate(m.x, m.y); g.rotate(Math.atan2(m.vy, m.vx)); g.fillStyle = '#e9ecef'; rr(g, -7, -2.5, 12, 5, 2); g.fill(); g.fillStyle = '#ff4d6d'; g.beginPath(); g.moveTo(5, -2.5); g.lineTo(9, 0); g.lineTo(5, 2.5); g.fill();
        g.fillStyle = '#ffb703'; g.beginPath(); g.arc(-8, 0, 2.5 + rnd() * 1.5, 0, TAU); g.fill(); g.restore();
      }
      for (const d of R.drones) {
        g.save(); g.translate(d.x, d.y); g.rotate(Math.sin(d.a) * 0.3);
        if (spr(g, 'unit-drone', 0, 0, 22)) { g.fillStyle = '#ffb703'; g.fillRect(-1.5, 9, 3, 2 + rnd() * 3); g.restore(); continue; }
        g.fillStyle = 'rgba(128,237,153,.25)'; g.beginPath(); g.arc(0, 4, 7, 0, TAU); g.fill();
        g.fillStyle = '#80ed99'; g.beginPath(); g.moveTo(0, -9); g.lineTo(7, 5); g.lineTo(0, 2); g.lineTo(-7, 5); g.closePath(); g.fill();
        g.fillStyle = '#fff'; g.fillRect(-1, -4, 2, 4); g.fillStyle = '#ffb703'; g.fillRect(-1.5, 3, 3, 2 + rnd() * 2); g.restore();
      }
      // shield line
      const sf = R.shield / Math.max(1, R.shMax), sc = sf > 0.5 ? '76,201,240' : sf > 0.25 ? '255,209,102' : '255,77,109';
      const sg = g.createLinearGradient(0, shieldY - 16, 0, shieldY + 6); sg.addColorStop(0, `rgba(${sc},0)`); sg.addColorStop(1, `rgba(${sc},${0.25 + R.shieldFlash * 0.4})`);
      g.fillStyle = sg; g.fillRect(0, shieldY - 16, W, 22);
      g.strokeStyle = `rgba(${sc},${0.7 + R.shieldFlash * 0.3})`; g.lineWidth = 2 + R.shieldFlash * 3; g.setLineDash([10, 6]); g.lineDashOffset = -R.t * 30;
      g.beginPath(); g.moveTo(0, shieldY); g.lineTo(W, shieldY); g.stroke(); g.setLineDash([]);
      drawMachine(g);
      drawShip(g, env.who, W / 2, SP, R.recoil, R.t);
      fx.draw(g);
      g.restore();
      drawHud(g);
    }
    function drawSpace(g) {
      // painted backdrop (top-anchored, the machine covers its lower part) under a scrim, else the vector sky
      const bgName = R.boss && env.art && env.art('bg-boss') ? 'bg-boss' : 'bg-space', im = env.art && env.art(bgName);
      if (im && spr(g, bgName, W / 2, W * im.naturalHeight / im.naturalWidth / 2 - 10, W + 20)) { g.fillStyle = 'rgba(4,4,26,.35)'; g.fillRect(-20, -20, W + 40, SP + 20); }
      else {
      const bg = g.createLinearGradient(0, 0, 0, SP); bg.addColorStop(0, '#04041a'); bg.addColorStop(0.6, '#110c3a'); bg.addColorStop(1, '#1f1250');
      g.fillStyle = bg; g.fillRect(-20, -20, W + 40, SP + 20);
      const nb = (x, y, r, c) => { const q = g.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, c); q.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = q; g.fillRect(x - r, y - r, r * 2, r * 2); };
      nb(W * 0.2, SP * 0.35, W * 0.45, R.boss ? 'rgba(255,77,109,.16)' : 'rgba(114,9,183,.18)');
      nb(W * 0.85, SP * 0.7, W * 0.4, 'rgba(76,201,240,.12)');
      const px = W * 0.8 + Math.sin(R.t * 0.05) * 8, py = SP * 0.42, pr = Math.min(30, W * 0.08); // ringed planet
      const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, 2, px, py, pr); pg.addColorStop(0, '#ffb4a2'); pg.addColorStop(1, '#6d2e46');
      g.globalAlpha = 0.5; g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,214,165,.6)'; g.lineWidth = 2; g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.42, -0.35, 0, TAU); g.stroke(); g.globalAlpha = 1;
      }
      g.fillStyle = '#ffffff';
      for (const st of stars) { g.globalAlpha = (0.3 + st.s * 0.35) * (0.75 + 0.25 * Math.sin(R.t * 3 + st.tw)); g.fillRect(st.x, st.y, st.s, st.s * (1 + st.v / 14)); }
      g.globalAlpha = 1;
    }
    function drawMachine(g) {
      const mg = g.createLinearGradient(0, MY, 0, H); mg.addColorStop(0, '#1f2840'); mg.addColorStop(1, '#0b0e17');
      g.fillStyle = mg; g.fillRect(-20, MY, W + 40, MH + 20);
      g.strokeStyle = 'rgba(125,249,255,.045)'; g.lineWidth = 1; g.beginPath();
      for (let y = MY + 20; y < H; y += 24) { g.moveTo(0, y); g.lineTo(W, y); }
      for (let x = 24; x < W; x += 48) { g.moveTo(x, MY); g.lineTo(x, H); }
      g.stroke();
      for (const side of [0, 1]) { const x = side ? W - 5 : 5; const cg = g.createLinearGradient(x - 3, 0, x + 3, 0); cg.addColorStop(0, '#1b2238'); cg.addColorStop(0.5, '#3a4a70'); cg.addColorStop(1, '#1b2238'); g.fillStyle = cg; g.fillRect(x - 3, SP, 6, binY - SP + 6); }
      for (const pu of R.pulses) { const x = pu.side ? W - 5 : 5, y = binY - (binY - SP) * pu.t; g.fillStyle = pu.ex ? '#ff9f1c' : '#7df9ff'; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill(); }
      for (const pg of pegs) {
        const gold = pg.gi >= 0, r = PEGR + (gold ? 1.5 : 0);
        if (gold) { g.fillStyle = `rgba(255,209,102,${0.18 + 0.1 * Math.sin(R.t * 5 + pg.x)})`; g.beginPath(); g.arc(pg.x, pg.y, r + 6, 0, TAU); g.fill(); }
        const q = g.createRadialGradient(pg.x - 1.5, pg.y - 1.5, 0.5, pg.x, pg.y, r);
        q.addColorStop(0, pg.hit ? '#fff' : gold ? '#fff3b0' : '#a3b1cc'); q.addColorStop(1, gold ? '#e09f3e' : '#3d4866');
        g.fillStyle = q; g.beginPath(); g.arc(pg.x, pg.y, r, 0, TAU); g.fill();
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const gt of gates) drawGate(g, gt, R.surgeT > 0 ? tierUp(gt.mult) : gt.mult, false);
      if (R.jack) drawGate(g, R.jack, 10, true);
      if (R.jackTell > 0) { // pre-tell: a dashed gold outline sweeping where the jackpot gate will open
        const a = 0.75 + 0.25 * Math.sin(R.t * 16), x = R.jackX;
        g.globalAlpha = a; g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.setLineDash([5, 4]); rr(g, x - 27, jackY - 9, 54, 18, 4); g.stroke(); g.setLineDash([]);
        g.font = '400 16px "Lilita One", system-ui'; g.fillStyle = '#ffd166'; g.fillText(`x10 in ${Math.ceil(R.jackTell)}`, x, jackY - 20); g.globalAlpha = 1;
      }
      if (R.bin) drawBin(g, R.bin);
      for (const pd of pads) {
        const q = pd.sq, y = padY + q * 4;
        g.strokeStyle = '#6c757d'; g.lineWidth = 2;
        g.beginPath(); for (const sd of [-1, 1]) { const bx = pd.x + sd * (pd.w / 2 - 6); g.moveTo(bx, y); for (let k = 1; k <= 4; k++) g.lineTo(bx + (k % 2 ? 4 : -4), y + (padY + 14 - y) * k / 4); } g.stroke();
        g.fillStyle = '#3a4766'; rr(g, pd.x - pd.w / 2, padY + 13, pd.w, 5, 2); g.fill();
        g.strokeStyle = q > 0.2 ? '#fff3b0' : '#ffb703'; g.lineWidth = 5; g.beginPath(); g.moveTo(pd.x - pd.w / 2, padY); g.quadraticCurveTo(pd.x, y + 8 * q, pd.x + pd.w / 2, padY); g.stroke();
      }
      if (R.portal) {
        const Q = R.portal;
        for (const [x, y, c] of [[Q.x, binY - 4, '#c77dff'], [W - Q.x, railY + 14, '#7df9ff']]) {
          g.save(); g.translate(x, y); g.strokeStyle = c; g.lineWidth = 3 + Q.flash * 2;
          for (let k = 0; k < 3; k++) { const a0 = (R.t * (3 + k)) % TAU; g.globalAlpha = 0.9 - k * 0.25; g.beginPath(); g.ellipse(0, 0, Q.w / 2 - k * 5, 6 - k * 1.5, 0, a0, a0 + 4.5); g.stroke(); }
          g.globalAlpha = 1; g.restore();
        }
      }
      const cg = g.createLinearGradient(0, binY, 0, H); cg.addColorStop(0, '#16203a'); cg.addColorStop(1, '#090c14');
      g.fillStyle = cg; g.fillRect(0, binY, W, H - binY + 20);
      g.fillStyle = s.beam ? '#f72585' : '#7df9ff'; g.globalAlpha = 0.5 + 0.2 * Math.sin(R.t * 6); g.fillRect(0, binY, W, 3); g.globalAlpha = 1;
      g.font = '800 13px Nunito, system-ui'; g.fillStyle = '#a9b8d6';
      g.textAlign = 'right'; g.fillText(s.beam ? `BEAM ${env.fmt(R.beam)}` : `AMMO ${env.fmt(R.ammo + R.ammoEx)}`, W / 2 - 10, binY + 15);
      g.textAlign = 'left'; g.fillStyle = R.pellets.length >= CAP ? '#ff9f1c' : '#a9b8d6'; g.fillText(`${R.pellets.length}${R.pellets.length >= CAP ? ' MAX' : ''} pellets`, W / 2 + 10, binY + 15);
      g.fillStyle = '#3a4766'; g.fillRect(W / 2 - 1, binY + 8, 2, 14); g.textAlign = 'center';
      drawPellets(g, false); drawPellets(g, true);
      g.strokeStyle = '#3a4766'; g.lineWidth = 4; g.beginPath(); g.moveTo(14, railY); g.lineTo(W - 14, railY); g.stroke();
      const cf = R.charge / s.cap, held = R.in?.down && !s.auto;
      const rg = g.createRadialGradient(R.rx, railY, 2, R.rx, railY, 28); rg.addColorStop(0, `rgba(125,249,255,${0.35 + cf * 0.4})`); rg.addColorStop(1, 'rgba(125,249,255,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(R.rx, railY, 28, 0, TAU); g.fill();
      const hg = g.createLinearGradient(R.rx, railY - 12, R.rx, railY + 12); hg.addColorStop(0, '#4a5b85'); hg.addColorStop(1, '#1f2840');
      g.fillStyle = hg; g.beginPath(); g.arc(R.rx, railY, 12, 0, TAU); g.fill();
      g.strokeStyle = cf < 0.15 || R.empty ? '#ff4d6d' : '#7df9ff'; g.lineWidth = 3; g.beginPath(); g.arc(R.rx, railY, 12, -1.57, -1.57 + TAU * cf); g.stroke();
      g.fillStyle = held ? '#fff' : '#7df9ff'; g.beginPath(); g.arc(R.rx, railY, 5 + (held ? Math.sin(R.t * 30) : 0), 0, TAU); g.fill();
    }
    function drawGate(g, gt, mult, gold) {
      const jam = gt.jam > 0, tell = gt.tell > 0 && Math.sin(R.t * 28) > -0.2;
      const c = jam ? '#6c757d' : tell ? '#ff4d6d' : gold ? '#ffd166' : MULC[mult] || '#4cc9f0', l = gt.x - gt.w / 2;
      const fade = gold ? Math.max(0, Math.min(1, (gt.life - gt.t) * 3, gt.t * 2)) : 1;
      const fg = g.createLinearGradient(0, gt.y - 9, 0, gt.y + 9); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, c); fg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = fade * (0.28 + gt.flash * 0.4); g.fillStyle = fg; g.fillRect(l, gt.y - 9, gt.w, 18);
      g.globalAlpha = fade * 0.4; g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath();
      for (let x = l + ((R.t * 40) % 10) + 3; x < l + gt.w; x += 10) { g.moveTo(x, gt.y - 4); g.lineTo(x - 3, gt.y + 4); }
      g.stroke(); g.globalAlpha = fade;
      g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.moveTo(l, gt.y); g.lineTo(l + gt.w, gt.y); g.stroke();
      for (const px of [l, l + gt.w]) { const pg = g.createLinearGradient(px - 4, 0, px + 4, 0); pg.addColorStop(0, '#2b3550'); pg.addColorStop(0.5, c); pg.addColorStop(1, '#2b3550'); g.fillStyle = pg; rr(g, px - 4, gt.y - 11, 8, 22, 3); g.fill(); }
      if (gt.steer) { g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.5; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(gt.x, gt.y + 12); g.lineTo(gt.x, gt.y + 22); g.stroke(); g.setLineDash([]); }
      g.font = `400 ${(gold ? 18 : 15) + gt.flash * 4}px "Lilita One", system-ui`; g.fillStyle = gt.flash > 0.3 ? '#fff' : c; g.fillText(jam ? 'JAMMED' : gt.tell > 0 ? `x${mult} !` : 'x' + mult, gt.x, gt.y - 18);
      g.globalAlpha = 1;
    }
    function drawHud(g) {
      // fixed slots: shield bar + label top-left, streak at a fixed x, credits/time right-aligned left of the pause button
      const bandH = R.boss ? 96 : 70, tb = g.createLinearGradient(0, 0, 0, bandH); tb.addColorStop(0, 'rgba(4,4,26,.92)'); tb.addColorStop(0.72, 'rgba(4,4,26,.82)'); tb.addColorStop(1, 'rgba(4,4,26,0)'); g.fillStyle = tb; g.fillRect(0, 0, W, bandH);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      const sf = R.shield / Math.max(1, R.shMax), sc = sf > 0.5 ? '76,201,240' : sf > 0.25 ? '255,209,102' : '255,77,109';
      const bw = Math.min(150, W * 0.36);
      g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 14, 12, bw, 12, 6); g.fill();
      g.fillStyle = `rgb(${sc})`; rr(g, 14, 12, Math.max(0, bw * sf), 12, 6); g.fill();
      g.font = '800 13px Nunito, system-ui'; g.fillStyle = '#fff'; g.fillText(`Shield ${Math.ceil(R.shield)}/${R.shMax}`, 16, 40);
      if (R.lowWarn && R.shield > 0) { const lw = g.measureText(`Shield ${Math.ceil(R.shield)}/${R.shMax}`).width; g.fillStyle = Math.sin(R.t * 10) > 0 ? '#ff4d6d' : '#ffb3c1'; g.fillText('LOW!', 24 + lw, 40); }
      if (R.streak >= 5) { g.fillStyle = R.streak >= 25 ? '#ffb703' : '#ffd6a5'; g.fillText(`Streak ${R.streak}${s.streak ? ` · +${Math.round(Math.min(R.streak, 60) * s.streak * 100)}%` : ''}`, 16, 58); }
      const rx = W - 62;
      g.textAlign = 'right'; g.font = '800 15px Nunito, system-ui'; g.fillStyle = '#ffd166';
      g.fillText(`${env.fmt(R.cr)} credits`, rx, 24);
      g.font = '800 13px Nunito, system-ui'; g.fillStyle = R.cores ? '#ff9ef0' : '#a9b8d6'; g.fillText(`${R.cores ? R.cores + ' cores · ' : ''}${Math.floor(R.t)} s`, rx, 42);
      const buffs = [R.surgeT > 0 && `Surge ${Math.ceil(R.surgeT)}s`, R.floodT > 0 && `Flood ${Math.ceil(R.floodT)}s`, R.bountyT > 0 && `Bounty ${Math.ceil(R.bountyT)}s`].filter(Boolean);
      if (buffs.length && !R.boss) { g.textAlign = 'right'; g.fillStyle = '#80ed99'; g.fillText(buffs.join(' · '), rx, 58); }
      const B = R.boss;
      if (B && !B.dead) {
        const w = W - 32, y = 78;
        g.textAlign = 'center'; g.fillStyle = B.phase === 3 ? '#ffd166' : '#ff4d6d'; g.font = '400 14px "Lilita One", system-ui';
        g.fillText(B.phase === 1 ? 'MOTHERSHIP' : B.phase === 2 ? 'MOTHERSHIP · SHIELDED' : 'MOTHERSHIP · CORE EXPOSED', W / 2, y - 5);
        g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 16, y, w, 9, 4); g.fill();
        const hg = g.createLinearGradient(16, 0, 16 + w, 0); hg.addColorStop(0, '#ff4d6d'); hg.addColorStop(1, '#ffd166');
        g.fillStyle = B.immune && R.intro <= 0 ? '#c77dff' : hg; rr(g, 16, y, Math.max(0, w * B.hp / B.max), 9, 4); g.fill();
        g.fillStyle = '#fff'; g.fillRect(16 + w * 0.5 - 1, y - 2, 2, 13);
        const pods = R.aliens.filter((a) => a.kind === 'pod').length;
        if (pods) { g.font = '800 12px Nunito, system-ui'; g.fillStyle = '#ff9ef0'; g.fillText(`${pods} shield pod${pods > 1 ? 's' : ''} left`, W / 2, y + 23); }
      }
      if (R.banner) { // reserved banner slot in the middle of the sky; overlays, never moves anything
        const b = R.banner, a = Math.max(0, Math.min(1, b.t * 8, (b.life - b.t) * 5)), sc2 = 1 + Math.max(0, 0.15 - b.t) * 1.5;
        g.save(); g.globalAlpha = a; g.translate(W / 2, R.boss ? shieldY - 58 : SP * 0.52); g.scale(sc2, sc2); g.textAlign = 'center';
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-W / 2, -40, W, 80); // scrim
        g.fillStyle = 'rgba(8,6,32,.94)'; rr(g, -W / 2 + 10, -32, W - 20, 62, 14); g.fill();
        g.strokeStyle = b.col; g.lineWidth = 2; g.stroke();
        g.font = '400 30px "Lilita One", system-ui'; g.lineJoin = 'round'; g.lineWidth = 5; g.strokeStyle = '#05051a'; g.strokeText(b.text, 0, 2); g.fillStyle = b.col; g.fillText(b.text, 0, 2);
        if (b.sub) { g.font = '800 14px Nunito, system-ui'; g.fillStyle = '#fff'; g.fillText(b.sub, 0, 21); }
        g.restore();
      }
      // first-run hint, at the point of need; gone once the player has poured
      const hintT = R.touched ? R.t - (R.firstTouch ??= R.t) : 0;
      if (!R.touched || (runNo <= 2 && hintT < 2.5)) {
        g.textAlign = 'center'; g.font = '800 19px Nunito, system-ui'; const a = 0.75 + Math.sin(R.t * 5) * 0.2;
        g.fillStyle = `rgba(255,255,255,${a})`;
        if (!R.touched) {
          g.fillText(s.auto ? 'Drag to steer the gate under the stream' : 'Hold & drag to pour plasma', W / 2, MY + MH * 0.47);
          g.font = '800 14px Nunito, system-ui'; g.fillStyle = 'rgba(169,184,214,.9)'; g.fillText('Through the gates: more pellets = more shots', W / 2, MY + MH * 0.47 + 22);
          const fy = MY + MH * 0.47 + 50 + Math.sin(R.t * 4) * 6; g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(W / 2 + Math.sin(R.t * 1.5) * 50, fy, 12, 0, TAU); g.fill();
        } else g.fillText(`Aim the stream through the x${gates[0].mult} gate!`, W / 2, MY + MH * 0.47);
      }
    }
    function drawBin(g, b) {
      // the repair bin: a cyan cup on the collector floor with a fill meter; dim when the shield is full
      const need = R.shield < R.shMax, low = need && R.shield <= R.shMax * 0.5, x = b.x, w = b.w, top = binY - 18;
      g.globalAlpha = need || (runNo === 2 && R.t < 5) ? 1 : 0.45; // full strength while run 2 introduces it
      if (need) { const q = g.createRadialGradient(x, binY, 2, x, binY, w); q.addColorStop(0, `rgba(125,249,255,${0.25 + 0.35 * b.flash})`); q.addColorStop(1, 'rgba(125,249,255,0)'); g.fillStyle = q; g.fillRect(x - w, top - 20, w * 2, 40); }
      g.fillStyle = '#0d2a3a'; g.beginPath(); g.moveTo(x - w / 2, top); g.lineTo(x + w / 2, top); g.lineTo(x + w / 2 - 5, binY); g.lineTo(x - w / 2 + 5, binY); g.closePath(); g.fill();
      const f = need ? b.rep / b.need : 0; g.fillStyle = '#7df9ff'; g.fillRect(x - w / 2 + 5, binY - 18 * f, w - 10, 18 * f);
      g.strokeStyle = need ? '#7df9ff' : '#6c757d'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - w / 2, top); g.lineTo(x - w / 2 + 5, binY); g.lineTo(x + w / 2 - 5, binY); g.lineTo(x + w / 2, top); g.stroke();
      g.fillStyle = need ? '#fff' : '#adb5bd'; g.fillRect(x - 1.5, top + 3, 3, 11); g.fillRect(x - 5.5, top + 7, 11, 3); // a plus: "repair"
      if (low) { const ay = top - 14 + Math.sin(R.t * 8) * 3; g.fillStyle = '#ff8fa3'; g.beginPath(); g.moveTo(x - 7, ay - 6); g.lineTo(x + 7, ay - 6); g.lineTo(x, ay + 2); g.fill(); }
      g.globalAlpha = 1;
    }
    function drawPellets(g, ex) {
      const P = R.pellets;
      g.fillStyle = ex ? 'rgba(255,159,28,.28)' : 'rgba(125,249,255,.22)'; g.beginPath();
      for (const p of P) if (p.ex === ex) { g.moveTo(p.x + 6.5, p.y); g.arc(p.x, p.y, 6.5, 0, TAU); }
      g.fill();
      g.fillStyle = ex ? '#ffd29a' : '#d7fdff'; g.beginPath();
      for (const p of P) if (p.ex === ex) { g.moveTo(p.x + PR, p.y); g.arc(p.x, p.y, PR, 0, TAU); }
      g.fill();
    }
    return run;
  }
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }

  function drawAlien(g, a, t) {
    const hit = Math.max(0, 1 - (t - a.hitT) * 9), r = a.r, col = COLS[a.kind] || COLS.drone;
    g.save(); g.translate(a.x, a.y);
    const body = g.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r * 1.2); body.addColorStop(0, hit ? '#fff' : col[1]); body.addColorStop(1, hit ? '#ddd' : col[0]);
    const sw = 2 * r * (a.kind === 'hive' ? 1.25 : a.kind === 'pod' ? 1.15 : 1.3); // art sized to the hit circle
    if (sprFlash(g, 'enemy-' + a.kind, 0, Math.sin(t * 3 + a.wob) * 1.2, sw, hit, { rot: a.kind === 'pod' ? t : a.kind === 'swarm' ? Math.sin(t * 9 + a.wob) * 0.18 : 0 })) {
      if (a.kind === 'elite') { g.strokeStyle = '#fff3b0'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, r + 5 + Math.sin(t * 6) * 1.5, 0, TAU); g.stroke(); }
    } else {
    g.fillStyle = body;
    if (a.kind === 'swarm') { // little wasp
      g.beginPath(); g.ellipse(0, 0, r, r * 0.8, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.45)'; const fl = Math.sin(t * 40 + a.wob) * 0.4; g.beginPath(); g.ellipse(-r * 0.9, -r * 0.5, r * 0.7, r * 0.3, -0.6 + fl, 0, TAU); g.ellipse(r * 0.9, -r * 0.5, r * 0.7, r * 0.3, 0.6 - fl, 0, TAU); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(-r * 0.35, r * 0.1, r * 0.22, 0, TAU); g.arc(r * 0.35, r * 0.1, r * 0.22, 0, TAU); g.fill();
    } else if (a.kind === 'hive') { // a fat egg-sac carrier
      g.beginPath(); g.ellipse(0, 0, r * 1.1, r * 0.85, 0, 0, TAU); g.fill();
      g.fillStyle = col[2]; for (let i = 0; i < 4; i++) { const ang = i * 1.57 + t * 0.6; g.globalAlpha = 0.5 + 0.5 * Math.sin(t * 4 + i); g.beginPath(); g.arc(Math.cos(ang) * r * 0.55, Math.sin(ang) * r * 0.4, r * 0.16, 0, TAU); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = '#111'; g.beginPath(); g.arc(0, -r * 0.05, r * 0.2, 0, TAU); g.fill(); g.fillStyle = '#ff4d6d'; g.beginPath(); g.arc(0, -r * 0.05, r * 0.09, 0, TAU); g.fill();
      g.strokeStyle = col[1]; g.lineWidth = 2; g.beginPath(); for (let i = 0; i < 5; i++) { const x0 = -r * 0.8 + i * r * 0.4; g.moveTo(x0, r * 0.7); g.quadraticCurveTo(x0 + Math.sin(t * 5 + i) * 5, r * 1.1, x0, r * 1.35); } g.stroke();
    } else if (a.kind === 'pod') {
      g.beginPath(); for (let i = 0; i < 6; i++) { const ang = i * TAU / 6 + t; g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); } g.closePath(); g.fill();
      g.fillStyle = col[2]; g.beginPath(); g.arc(0, 0, r * 0.4 + Math.sin(t * 8) * 2, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,158,240,.6)'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.arc(0, 0, r + 5, t * 2, t * 2 + TAU); g.stroke(); g.setLineDash([]);
    } else {
      g.beginPath(); g.arc(0, 0, r, Math.PI, 0); g.lineTo(r, r * 0.4);
      for (let i = 0; i < 4; i++) { const x0 = r - (i + 0.5) * (2 * r / 4); g.lineTo(x0, r * (0.55 + 0.25 * Math.sin(t * 8 + i + a.wob))); g.lineTo(x0 - r / 4, r * 0.4); }
      g.closePath(); g.fill();
      g.fillStyle = col[2]; g.globalAlpha = 0.7; g.beginPath(); g.arc(0, -r * 0.2, r * 0.55, Math.PI, 0); g.fill(); g.globalAlpha = 1;
      g.fillStyle = '#111'; g.beginPath(); g.arc(-r * 0.32, 0, r * 0.17, 0, TAU); g.arc(r * 0.32, 0, r * 0.17, 0, TAU); g.fill();
      g.fillStyle = a.kind === 'brute' ? '#ff4d6d' : '#fff'; g.beginPath(); g.arc(-r * 0.28, -r * 0.04, r * 0.06, 0, TAU); g.arc(r * 0.36, -r * 0.04, r * 0.06, 0, TAU); g.fill();
      if (a.kind === 'brute') { g.fillStyle = col[0]; g.beginPath(); g.moveTo(-r * 0.7, -r * 0.6); g.lineTo(-r * 0.95, -r * 1.15); g.lineTo(-r * 0.35, -r * 0.85); g.moveTo(r * 0.7, -r * 0.6); g.lineTo(r * 0.95, -r * 1.15); g.lineTo(r * 0.35, -r * 0.85); g.fill(); }
      if (a.kind === 'elite') { g.strokeStyle = '#fff3b0'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, 0, r + 4 + Math.sin(t * 6) * 1.5, 0, TAU); g.stroke(); }
    }
    }
    if (a.bub) { // warded: a bubble that eats one hit, then regrows
      const bg = g.createRadialGradient(-r * 0.4, -r * 0.5, 1, 0, 0, r + 7); bg.addColorStop(0, 'rgba(202,240,248,.5)'); bg.addColorStop(0.75, 'rgba(76,201,240,.12)'); bg.addColorStop(1, 'rgba(76,201,240,.55)');
      g.fillStyle = bg; g.beginPath(); g.arc(0, 0, r + 7, 0, TAU); g.fill();
      g.strokeStyle = `rgba(202,240,248,${0.6 + 0.3 * Math.sin(t * 7 + a.wob)})`; g.lineWidth = 1.5; g.stroke();
    }
    g.restore();
    if (a.hp < a.max) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(a.x - r, a.y - r - 8, 2 * r, 3); g.fillStyle = '#ff4d6d'; g.fillRect(a.x - r, a.y - r - 8, 2 * r * Math.max(0, a.hp / a.max), 3); }
  }
  function drawBoss(g, B, t) {
    const hit = Math.max(0, 1 - (t - B.hitT) * 12), r = B.r;
    g.save(); g.translate(B.x + (Math.random() - 0.5) * hit * 3, B.y);
    const gl = g.createRadialGradient(0, 0, 4, 0, 0, r * 1.6); gl.addColorStop(0, B.phase === 3 ? 'rgba(255,209,102,.4)' : 'rgba(255,77,109,.35)'); gl.addColorStop(1, 'rgba(255,77,109,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(0, 0, r * 1.6, 0, TAU); g.fill();
    if (B.phase === 3) { g.fillStyle = `rgba(255,209,102,${0.08 + 0.05 * Math.sin(t * 10)})`; g.beginPath(); g.moveTo(-r * 0.3, r * 0.3); g.lineTo(r * 0.3, r * 0.3); g.lineTo(r * 0.9, r * 2.2); g.lineTo(-r * 0.9, r * 2.2); g.fill(); }
    const art = sprFlash(g, 'boss-mothership', 0, 0, r * 2.7, hit * 0.6, {});
    if (art && B.phase === 3) { g.globalCompositeOperation = 'lighter'; spr(g, 'boss-mothership', 0, 0, r * 2.7, null, { alpha: 0.18 + 0.12 * Math.sin(t * 10) }); g.globalCompositeOperation = 'source-over'; }
    if (!art) {
    const hull = g.createLinearGradient(0, -r * 0.3, 0, r * 0.5); hull.addColorStop(0, '#7b2cbf'); hull.addColorStop(1, '#240046');
    g.fillStyle = hull; g.beginPath(); g.ellipse(0, r * 0.1, r * 1.25, r * 0.42, 0, 0, TAU); g.fill();
    g.strokeStyle = '#c77dff'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, r * 0.1, r * 1.25, r * 0.42, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    const dome = g.createRadialGradient(-r * 0.15, -r * 0.35, 2, 0, -r * 0.05, r * 0.6);
    dome.addColorStop(0, B.phase === 3 ? '#fff3b0' : '#ffb3c1'); dome.addColorStop(1, B.phase === 3 ? '#e85d04' : '#c9184a');
    g.fillStyle = dome; g.beginPath(); g.arc(0, -r * 0.05, r * 0.55, Math.PI, 0); g.fill();
    if (B.phase >= 2) { g.strokeStyle = '#240046'; g.lineWidth = 2; g.beginPath(); g.moveTo(-r * 0.1, -r * 0.55); g.lineTo(r * 0.05, -r * 0.35); g.lineTo(-r * 0.05, -r * 0.2); g.moveTo(r * 0.25, -r * 0.45); g.lineTo(r * 0.35, -r * 0.25); g.stroke(); }
    for (let i = 0; i < 7; i++) { const x = -r + i * (2 * r / 6); g.fillStyle = (Math.floor(t * (B.phase === 3 ? 14 : 6)) + i) % 2 ? '#ffd166' : '#80ed99'; g.beginPath(); g.arc(x, r * 0.22, r * 0.07, 0, TAU); g.fill(); }
    g.fillStyle = '#111'; g.beginPath(); g.arc(-r * 0.2, -r * 0.2, r * 0.09, 0, TAU); g.arc(r * 0.2, -r * 0.2, r * 0.09, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-r * 0.17, -r * 0.23, r * 0.03, 0, TAU); g.arc(r * 0.23, -r * 0.23, r * 0.03, 0, TAU); g.fill();
    if (hit) { g.globalAlpha = 0.25 * hit; g.fillStyle = '#fff'; g.beginPath(); g.ellipse(0, r * 0.05, r * 1.25, r * 0.5, 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
    }
    if (B.immune) { g.strokeStyle = `rgba(199,125,255,${0.35 + 0.25 * Math.sin(t * 6) + (B.shimmer || 0) * 0.3})`; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, r * 1.45, r * 0.78, 0, 0, TAU); g.stroke(); B.shimmer = Math.max(0, (B.shimmer || 0) - 0.08); }
    g.restore();
  }
  function drawShip(g, who, x, y, rec, t) {
    g.save(); g.translate(x, y);
    const wide = who === 'carrier' ? 1.25 : who === 'lancer' ? 0.85 : 1;
    const metal = g.createLinearGradient(-8, 0, 8, 0); metal.addColorStop(0, '#6c757d'); metal.addColorStop(0.5, '#dee2e6'); metal.addColorStop(1, '#6c757d');
    if (who === 'lancer') { g.fillStyle = metal; g.fillRect(-7, -48 + rec[2] * 8, 14, 34); g.fillStyle = '#f72585'; g.fillRect(-4, -50 + rec[2] * 8, 8, 6); }
    else for (const [i, sx] of [[0, -50], [1, 50]]) { g.save(); g.translate(sx, 0); g.fillStyle = metal; g.fillRect(-4, -38 + rec[i] * 6, 8, 22); g.fillStyle = '#7df9ff'; g.fillRect(-3, -40 + rec[i] * 6, 6, 4); g.restore(); }
    if (spr(g, 'unit-' + who, 0, -5, 200 * wide)) { // deck art; the code keeps the barrels (and their recoil) on top
      g.restore(); g.save(); g.translate(x, y);
      if (who === 'lancer') { g.fillStyle = metal; g.fillRect(-7, -48 + rec[2] * 8, 14, 34); g.fillStyle = '#f72585'; g.fillRect(-4, -50 + rec[2] * 8, 8, 6); }
      else for (const [i, sx] of [[0, -50], [1, 50]]) { g.fillStyle = metal; g.fillRect(sx - 4, -38 + rec[i] * 6, 8, 22); g.fillStyle = '#7df9ff'; g.fillRect(sx - 3, -40 + rec[i] * 6, 6, 4); g.fillStyle = '#2b3550'; g.beginPath(); g.arc(sx, -18, 10, Math.PI, 0); g.fill(); }
      g.restore(); return;
    }
    const hull = g.createLinearGradient(0, -22, 0, 12); hull.addColorStop(0, '#6c7fa6'); hull.addColorStop(1, '#2b3550');
    g.fillStyle = hull; g.beginPath(); g.moveTo(-95 * wide, 6); g.lineTo(-62 * wide, -22); g.lineTo(62 * wide, -22); g.lineTo(95 * wide, 6); g.lineTo(80 * wide, 12); g.lineTo(-80 * wide, 12); g.closePath(); g.fill();
    g.fillStyle = '#8fa3cc'; g.fillRect(-62 * wide, -22, 124 * wide, 3);
    g.fillStyle = '#ffd166'; for (let i = -3; i <= 3; i++) { g.globalAlpha = 0.4 + 0.4 * Math.sin(t * 3 + i); g.fillRect(i * 20 * wide - 2, -4, 4, 3); } g.globalAlpha = 1;
    if (who !== 'lancer') for (const sx of [-50, 50]) { g.fillStyle = '#2b3550'; g.beginPath(); g.arc(sx, -18, 10, Math.PI, 0); g.fill(); }
    g.fillStyle = '#7df9ff'; g.globalAlpha = 0.7 + Math.sin(t * 3) * 0.2; g.beginPath(); g.ellipse(0, -14, 16, 7, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
    if (who === 'carrier') { g.fillStyle = '#80ed99'; g.fillRect(-112, -6, 16, 6); g.fillRect(96, -6, 16, 6); }
    if (who === 'weaver') { g.strokeStyle = '#e0aaff'; g.lineWidth = 2; g.beginPath(); for (let k = -1; k <= 1; k += 2) { g.moveTo(k * 70, -10); g.quadraticCurveTo(k * 82, 10 + Math.sin(t * 4) * 4, k * 70, 16); } g.stroke(); }
    g.restore();
  }
  function drawFace(g, who, x, y, r) {
    g.save(); g.translate(x, y);
    const bg = g.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r * 1.05); bg.addColorStop(0, '#2a1f6b'); bg.addColorStop(1, '#0b0b1e');
    g.fillStyle = bg; g.beginPath(); g.arc(0, 0, r * 1.05, 0, TAU); g.fill();
    g.fillStyle = '#fff'; for (let i = 0; i < 6; i++) g.fillRect(Math.cos(i * 2.4) * r * 0.8, Math.sin(i * 1.7) * r * 0.8, 1.5, 1.5);
    if (who === 'corvette') {
      g.fillStyle = '#6c7fa6'; g.beginPath(); g.moveTo(0, -r * 0.8); g.lineTo(r * 0.55, r * 0.5); g.lineTo(0, r * 0.25); g.lineTo(-r * 0.55, r * 0.5); g.closePath(); g.fill();
      g.fillStyle = '#7df9ff'; g.beginPath(); g.ellipse(0, -r * 0.15, r * 0.12, r * 0.25, 0, 0, TAU); g.fill();
      g.fillStyle = '#ff9f1c'; g.beginPath(); g.moveTo(-r * 0.15, r * 0.35); g.lineTo(0, r * 0.75); g.lineTo(r * 0.15, r * 0.35); g.fill();
    } else if (who === 'carrier') {
      g.fillStyle = '#495a7a'; rr(g, -r * 0.75, -r * 0.25, r * 1.5, r * 0.6, 6); g.fill();
      g.fillStyle = '#7df9ff'; g.fillRect(-r * 0.2, -r * 0.42, r * 0.4, r * 0.2);
      g.fillStyle = '#80ed99'; for (const [dx, dy] of [[-0.55, -0.65], [0.55, -0.65], [0, -0.85]]) { g.beginPath(); g.moveTo(dx * r, dy * r - 6); g.lineTo(dx * r + 5, dy * r + 4); g.lineTo(dx * r - 5, dy * r + 4); g.fill(); }
    } else if (who === 'weaver') { // a ring ship trailing threads, with a little gate in its loom
      g.strokeStyle = '#e0aaff'; g.lineWidth = 2;
      g.beginPath(); for (let k = 0; k < 3; k++) { g.moveTo(-r * 0.6 + k * r * 0.6, r * 0.2); g.quadraticCurveTo(-r * 0.4 + k * r * 0.6, r * 0.7, -r * 0.6 + k * r * 0.6, r * 0.95); } g.stroke();
      const hb = g.createLinearGradient(0, -r * 0.55, 0, r * 0.35); hb.addColorStop(0, '#9d4edd'); hb.addColorStop(1, '#3c096c');
      g.fillStyle = hb; g.beginPath(); g.ellipse(0, -r * 0.1, r * 0.75, r * 0.45, 0, 0, TAU); g.fill();
      g.fillStyle = '#0b0b1e'; g.beginPath(); g.ellipse(0, -r * 0.1, r * 0.45, r * 0.22, 0, 0, TAU); g.fill();
      g.fillStyle = '#4cc9f0'; g.fillRect(-r * 0.4, -r * 0.13, r * 0.8, r * 0.06); g.fillRect(-r * 0.46, -r * 0.24, r * 0.1, r * 0.28); g.fillRect(r * 0.36, -r * 0.24, r * 0.1, r * 0.28);
      g.fillStyle = '#7df9ff'; g.beginPath(); g.arc(0, -r * 0.6, r * 0.1, 0, TAU); g.fill();
    } else {
      g.fillStyle = 'rgba(247,37,133,.5)'; g.fillRect(-r * 0.12, -r * 1.05, r * 0.24, r * 0.75);
      g.fillStyle = '#adb5bd'; g.beginPath(); g.moveTo(0, -r * 0.45); g.lineTo(r * 0.3, r * 0.65); g.lineTo(-r * 0.3, r * 0.65); g.closePath(); g.fill();
      g.fillStyle = '#f72585'; g.beginPath(); g.arc(0, -r * 0.35, r * 0.12, 0, TAU); g.fill();
    }
    g.restore();
  }

  function baseStats(who) {
    const s = { regen: 3.5, cap: 12, flow: 14, burst: 4, gates: 1, mult: 2, gateW: 74, gateSpeed: 1, pads: 1, padBounce: 1,
      dmg: 1, pierce: 0, rate: 26, shield: 3, shieldRegen: 0, explode: 0, split: 0, salvage: 1, elite: 0.05, coreDrop: 0.35,
      drone: 0, droneDmg: 1, droneLife: 6, droneMax: 10, beam: false, beamW: 34,
      arc: 0, arcDmg: 0, missile: 0, streak: 0.002, sync: 0, prism: 0, jackpot: 0, splitters: 0, magnet: 0, portal: 0, warp: 0,
      nova: 0, reserve: 0, refine: 0, tapEx: 0, twin: 0, steer: 0, steerW: 1, auto: false, sweep: 1 };
    if (who === 'corvette') { s.burst += 2; s.shield += 1; }
    if (who === 'carrier') { s.drone = 0.06; s.droneDmg = 2; }
    if (who === 'lancer') { s.beam = true; }
    if (who === 'weaver') { s.auto = true; s.steer = 1; s.steerW = 1.35; }
    return s;
  }

  const CONFIG = {
    id: 'starfall', title: 'Starfall Battery', tagline: 'Pour plasma through moving multiplier gates and bounce pads; every pellet that drops into the collector becomes a shot at the alien waves above.',
    howTo: 'Hold and drag in the machine to pour plasma from the reactor. Pellets through a gate multiply; pads bounce them back up. Each pellet in the collector fires a shot. Spend credits between runs.',
    runVerb: 'Launch!', winTitle: 'Mothership destroyed!', loseTitle: 'Shield down', scoreName: 'aliens downed',
    colors: { accent: '#7df9ff', bg: '#0b0b1e', card: '#1a1a3a' },
    currencies: [{ id: 'credits', name: 'credits', color: '#ffd166' }, { id: 'cores', name: 'cores', color: '#ff9ef0' }],
    characters: [
      { id: 'corvette', name: 'Corvette', blurb: 'Balanced. Bigger tap bursts and an extra shield.', unlock: 0 },
      { id: 'carrier', name: 'Carrier', blurb: 'Some pellets also launch little fighter drones.', unlock: 1 },
      { id: 'lancer', name: 'Lancer', blurb: 'Pellets charge one big piercing beam instead of many shots.', unlock: 2 },
      { id: 'weaver', name: 'Weaver', blurb: 'The reactor sweeps by itself. You steer the top gate under the stream.', unlock: 3 },
    ],
    drawFace, nodes: NODES, touchOffset: 0, baseStats, createRun,
  };
  const API = { NODES, BOSS_HP, CONFIG, createRun, baseStats, hpAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (typeof window !== 'undefined') { window.Starfall = API; Kit.game(CONFIG); }
})();
