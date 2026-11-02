// Void Drifter: a tiny Vampire Survivors in space. Drag anywhere to steer (virtual stick from where you touch),
// guns fire on their own at the nearest thing, salvage gets pulled in by your magnet, every few pickups = pick a boost.
// Plugs into the Pocket Prototypes kit (see ../README.md). Loads headless in Node for sim.js (module.exports below).
(function () {
  'use strict';
  const TAU = Math.PI * 2, rnd = Math.random;
  const BOSS_HP = 9000, BOSS_AT = 40, STORM_AT = 58, LEAD = 1.1;
  const CAP = { enemies: 70, bullets: 160, orbs: 110, parts: 280, ebullets: 110 };
  const HAS_DOM = typeof document !== 'undefined' && typeof window !== 'undefined';

  // ---------------------------------------------------------------- permanent tree
  // Layout: offense to the right, salvage/utility to the left, defence below, the pilot's own line straight up to the
  // Leviathan Lure. Every node hangs off one neighbouring node so no line crosses another node.
  const NODES = [
    { id: 'hull', name: 'Hull Plating', icon: '🛡️', desc: (l) => `+6 max hull (now +${6 * l})`, cost: 7, grow: 1.5, max: 10, req: [], x: 0, y: 0, fx: (s, l) => { s.hull += 6 * l; } },
    // offense (right)
    { id: 'dmg', name: 'Hot Barrels', icon: '🔥', desc: (l) => `+20% damage, all weapons (now x${(1.2 ** l).toFixed(2)})`, cost: 10, grow: 1.6, max: 10, req: ['hull'], x: 1, y: 0, fx: (s, l) => { s.dmg *= 1.2 ** l; } },
    { id: 'rate', name: 'Coolant', icon: '❄️', desc: '+12% fire rate (Wrecker: ball spin)', cost: 24, grow: 1.65, max: 8, req: ['dmg'], x: 2, y: 0, fx: (s, l) => { s.rate *= 1.12 ** l; } },
    { id: 'over', name: 'Overcharge', icon: '⚡', desc: '+25% damage, all weapons', cost: 3, grow: 1.8, max: 4, req: ['rate'], x: 3, y: 0, cur: 'shards', fx: (s, l) => { s.dmg *= 1.25 ** l; } },
    { id: 'over2', name: 'Overclock', icon: '🌡️', desc: '+15% fire rate and orbit speed', cost: 4, grow: 1.9, max: 3, req: ['over'], x: 4, y: 0, cur: 'shards', fx: (s, l) => { s.rate *= 1.15 ** l; s.spin *= 1.1 ** l; } },
    { id: 'crit', name: 'Targeting', icon: '🎯', desc: (l) => `+5% chance of a x2.5 crit (now ${5 * l}%)`, cost: 60, grow: 1.75, max: 6, req: ['rate'], x: 2, y: 1, fx: (s, l) => { s.crit += 0.05 * l; } },
    { id: 'streak', name: 'Bounty Streak', icon: '🔗', desc: 'Long kill streaks pay up to +25% more salvage', cost: 110, grow: 1.8, max: 4, req: ['crit'], x: 3, y: 1, fx: (s, l) => { s.streakPay += 0.25 * l; } },
    { id: 'blades', name: 'Orbit Blades', icon: '🌀', desc: 'Orbit Blades can appear in level-ups', cost: 82, max: 1, req: ['dmg'], x: 1, y: -1, fx: (s) => { s.poolBlades = 1; } },
    { id: 'wlvl', name: 'Weapon Mk', icon: '🔧', desc: 'Start each run +1 main weapon level', cost: 42, grow: 1.85, max: 5, req: ['dmg'], x: 2, y: -1, fx: (s, l) => { s.wlvl += l; } },
    { id: 'missiles', name: 'Seeker Pods', icon: '🚀', desc: 'Homing missiles can appear in level-ups', cost: 165, max: 1, req: ['wlvl'], x: 3, y: -1, fx: (s) => { s.poolMissiles = 1; } },
    { id: 'beam', name: 'Arc Lance', icon: '🌩️', desc: 'Chain lightning can appear in level-ups', cost: 240, max: 1, req: ['wlvl'], x: 2, y: -2, fx: (s) => { s.poolBeam = 1; } },
    { id: 'beamx', name: 'Capacitors', icon: '🔋', desc: 'Arc Lance hits +25% harder and jumps 1 more', cost: 3, grow: 1.9, max: 3, req: ['beam'], x: 3, y: -2, cur: 'shards', fx: (s, l) => { s.beamDmg *= 1.25 ** l; s.beamJump += l; } },
    { id: 'evo', name: 'Evolution Lab', icon: '🧪', desc: 'Maxed weapons can evolve into stronger forms', cost: 6, grow: 1, max: 1, req: ['blades', 'beam'], x: 1, y: -3, cur: 'shards', fx: (s) => { s.evo = 1; } },
    // defence (below)
    { id: 'armor', name: 'Armor', icon: '🧱', desc: (l) => `Take 8% less damage (now ${8 * l}% less)`, cost: 45, grow: 1.9, max: 5, req: ['hull'], x: 0, y: 1, fx: (s, l) => { s.armor += 0.08 * l; } },
    { id: 'nova', name: 'Nova Core', icon: '💫', desc: 'Shockwave pulses can appear in level-ups', cost: 120, max: 1, req: ['armor'], x: 0, y: 2, fx: (s) => { s.poolNova = 1; } },
    { id: 'regen', name: 'Nanites', icon: '🧬', desc: 'Hull repairs 0.2 per second', cost: 3, grow: 1.8, max: 3, req: ['armor'], x: 1, y: 1, cur: 'shards', fx: (s, l) => { s.regen += 0.2 * l; } },
    { id: 'hull2', name: 'Heavy Frame', icon: '🏗️', desc: '+15 max hull', cost: 3, grow: 1.9, max: 3, req: ['regen'], x: 1, y: 2, cur: 'shards', fx: (s, l) => { s.hull += 15 * l; } },
    { id: 'crate', name: 'Prep Crate', icon: '🎁', desc: 'Start each run with a free level-up', cost: 4, grow: 2.2, max: 2, req: ['armor'], x: -1, y: 1, cur: 'shards', fx: (s, l) => { s.headStart += l; } },
    { id: 'shield', name: 'Deflector', icon: '🔰', desc: (l) => `Blocks one hit, recharging every ${14 - 2 * l}s${l ? ` (now ${16 - 2 * l}s)` : ''}`, cost: 140, grow: 1.9, max: 4, req: ['armor'], x: -1, y: 2, fx: (s, l) => { s.shield = 16 - 2 * l; } },
    // salvage + mobility (left)
    { id: 'magnet', name: 'Tractor Beam', icon: '🧲', desc: (l) => `+30% magnet range (now +${30 * l}%)`, cost: 8, grow: 1.6, max: 6, req: ['hull'], x: -1, y: 0, fx: (s, l) => { s.magnet *= 1 + 0.3 * l; } },
    { id: 'speed', name: 'Thrusters', icon: '💨', desc: (l) => `+8% flight speed (now +${Math.round((1.08 ** l - 1) * 100)}%)`, cost: 18, grow: 1.6, max: 5, req: ['magnet'], x: -2, y: 0, fx: (s, l) => { s.speed *= 1.08 ** l; } },
    { id: 'wing', name: 'Wingmen', icon: '🛩️', desc: 'Escort fighters can appear in level-ups', cost: 220, max: 1, req: ['speed'], x: -3, y: 0, fx: (s) => { s.poolWing = 1; } },
    { id: 'wingx', name: 'Flight Deck', icon: '🛫', desc: 'Start with 1 wingman; wingmen fire 20% faster', cost: 4, grow: 2, max: 3, req: ['wing'], x: -4, y: 0, cur: 'shards', fx: (s, l) => { s.wingStart = 1; s.wingRate *= 1.2 ** l; } },
    { id: 'scan', name: 'Wreck Scanner', icon: '📡', desc: 'Derelict wrecks show up 25% more often', cost: 55, grow: 1.8, max: 4, req: ['magnet'], x: -2, y: 1, fx: (s, l) => { s.wrecks *= 1 + 0.25 * l; } },
    { id: 'salv', name: 'Scrap Haulers', icon: '📦', desc: (l) => `+25% salvage banked (now +${25 * l}%)`, cost: 27, grow: 1.85, max: 8, req: ['magnet'], x: -1, y: -1, fx: (s, l) => { s.value *= 1 + 0.25 * l; } },
    { id: 'lens', name: 'Void Lens', icon: '🔮', desc: '+40% void shard drops', cost: 2, grow: 1.9, max: 4, req: ['salv'], x: -2, y: -1, cur: 'shards', fx: (s, l) => { s.shardLuck *= 1 + 0.4 * l; } },
    { id: 'bounty', name: 'Elite Bounty', icon: '💰', desc: 'Elites drop 50% more salvage', cost: 90, grow: 1.8, max: 4, req: ['lens'], x: -3, y: -1, fx: (s, l) => { s.bounty += 0.5 * l; } },
    { id: 'salvx', name: 'Haggler', icon: '🤝', desc: '+20% salvage banked', cost: 4, grow: 1.9, max: 3, req: ['lens'], x: -2, y: -2, cur: 'shards', fx: (s, l) => { s.value *= 1 + 0.2 * l; } },
    { id: 'xp', name: 'Data Core', icon: '💾', desc: 'Level-ups need 8% less salvage', cost: 50, grow: 1.8, max: 5, req: ['salv'], x: -1, y: -2, fx: (s, l) => { s.xpMul *= 0.92 ** l; } },
    { id: 'choice', name: 'Wide Scanner', icon: '🃏', desc: 'Level-ups offer 4 boosts instead of 3', cost: 320, max: 1, req: ['xp'], x: -1, y: -3, fx: (s) => { s.choices = 4; } },
    // the pilot's own line (straight up)
    { id: 'waspsp', who: 'wasp', name: 'Stinger Rounds', icon: '🐝', desc: 'Pulse bolts pierce +1 and fire 8% faster', cost: 52, grow: 1.9, max: 5, req: ['hull'], x: 0, y: -1, fx: (s, l) => { s.pierce += l; s.rate *= 1.08 ** l; } },
    { id: 'wasp2', who: 'wasp', name: 'Afterburner', icon: '☄️', desc: 'Flying fast leaves a burning trail', cost: 150, grow: 1.9, max: 4, req: ['waspsp'], x: 0, y: -2, fx: (s, l) => { s.trail += l; } },
    { id: 'bulsp', who: 'bulwark', name: 'Reactive Plating', icon: '🪖', desc: 'Getting hit blasts flak all around; +4 hull', cost: 52, grow: 1.9, max: 5, req: ['hull'], x: 0, y: -1, fx: (s, l) => { s.reactive += l; s.hull += 4 * l; } },
    { id: 'bul2', who: 'bulwark', name: 'Ram Prow', icon: '🐏', desc: 'Ramming hits 2x harder, hurts you 15% less', cost: 150, grow: 1.9, max: 4, req: ['bulsp'], x: 0, y: -2, fx: (s, l) => { s.ram += l; } },
    { id: 'phasp', who: 'phantom', name: 'Phase Rift', icon: '👻', desc: 'Blink recharges 15% faster, leaves a damaging rift', cost: 52, grow: 1.9, max: 5, req: ['hull'], x: 0, y: -1, fx: (s, l) => { s.blinkCD *= 0.85 ** l; s.rift += l; } },
    { id: 'pha2', who: 'phantom', name: 'Echo Volley', icon: '🔦', desc: 'Blinking fires lasers at +1 nearby target', cost: 150, grow: 1.9, max: 4, req: ['phasp'], x: 0, y: -2, fx: (s, l) => { s.echo += l; } },
    { id: 'wrksp', who: 'wrecker', name: 'Heavy Ball', icon: '⚫', desc: '+25% ball damage and a bigger ball', cost: 52, grow: 1.9, max: 5, req: ['hull'], x: 0, y: -1, fx: (s, l) => { s.ballDmg *= 1.25 ** l; s.ballR += 2 * l; } },
    { id: 'wrk2', who: 'wrecker', name: 'Spiked Chain', icon: '⛓️', desc: 'The chain itself shreds what it sweeps', cost: 150, grow: 1.9, max: 4, req: ['wrksp'], x: 0, y: -2, fx: (s, l) => { s.chainDmg += l; } },
    { id: 'lure', name: 'Leviathan Lure', icon: '🐉', desc: `Next run the Void Leviathan comes at ${BOSS_AT}s. Kill it to win.`, cost: 4000, grow: 1, max: 1, req: ['evo', 'choice'], reqAll: 1, extra: { shards: 12 }, x: 0, y: -4, win: true },
  ];

  // ---------------------------------------------------------------- in-run level-up picks (shown with env.pick)
  const flail = (R) => R.s.weapon === 'flail';
  const lvTag = (n) => (n ? 'Lv ' + (n + 1) : 'NEW');
  const PICKS = [
    { id: 'rate', icon: '⚡', name: 'Overdrive', desc: (R) => (flail(R) ? '+20% spin: the ball whirls faster' : '+20% fire rate'), ok: () => true, take: (R) => { R.s.rate *= 1.2; } },
    { id: 'spread', icon: '🔱', name: 'Split Shot', desc: '+1 shot per volley', ok: (R) => !flail(R) && R.s.spread < 4, take: (R) => { R.s.spread++; } },
    { id: 'dmg', icon: '💥', name: 'Hot Rounds', desc: '+25% damage', ok: () => true, take: (R) => { R.s.dmg *= 1.25; } },
    { id: 'main', icon: '🔧', name: 'Weapon Mk+', desc: (R) => (flail(R) ? '+1 ball level: heavier, faster spin' : '+1 main weapon level'), ok: (R) => R.wp.main < 9, take: (R) => { R.wp.main++; } },
    { id: 'mag', icon: '🧲', name: 'Tractor', desc: '+40% magnet range', ok: (R) => R.s.magnet < 260, take: (R) => { R.s.magnet *= 1.4; } },
    { id: 'speed', icon: '💨', name: 'Thrusters', desc: '+12% flight speed', ok: (R) => R.s.speed < 280, take: (R) => { R.s.speed *= 1.12; } },
    { id: 'crit', icon: '🎯', name: 'Lock-On', desc: '+8% critical hit chance', ok: (R) => R.s.crit < 0.45, take: (R) => { R.s.crit += 0.08; } },
    { id: 'repair', icon: '🛠️', name: 'Patch Hull', desc: 'Repair 40% hull, +4 max hull', ok: (R) => R.hp < R.s.hull * 0.8, take: (R) => { R.s.hull += 4; R.hp = Math.min(R.s.hull, R.hp + R.s.hull * 0.4); } },
    { id: 'chain', icon: '➰', name: 'Longer Chain', desc: '+14 chain reach', ok: (R) => flail(R) && R.s.chain < 130, take: (R) => { R.s.chain += 14; } },
    { id: 'ball', icon: '⚫', name: 'Extra Ball', desc: '+1 wrecking ball on its own chain', w: 1.5, ok: (R) => flail(R) && R.wp.balls < 3, take: (R) => { R.wp.balls++; } },
    { id: 'blades', icon: '🌀', name: 'Orbit Blades', desc: '+1 blade circling your ship', w: 2, wp: 'blades', ok: (R) => R.s.poolBlades && R.wp.blades < 5, take: (R) => { R.wp.blades++; } },
    { id: 'missiles', icon: '🚀', name: 'Seeker Pod', desc: '+1 homing missile per salvo', w: 2, wp: 'missiles', ok: (R) => R.s.poolMissiles && R.wp.missiles < 4, take: (R) => { R.wp.missiles++; } },
    { id: 'nova', icon: '💫', name: 'Nova Pulse', desc: 'Shockwave every few seconds (bigger)', w: 2, wp: 'nova', ok: (R) => R.s.poolNova && R.wp.nova < 4, take: (R) => { R.wp.nova++; } },
    { id: 'beam', icon: '🌩️', name: 'Arc Lance', desc: 'Lightning jumps between enemies', w: 2, wp: 'beam', ok: (R) => R.s.poolBeam && R.wp.beam < 4, take: (R) => { R.wp.beam++; } },
    { id: 'wing', icon: '🛩️', name: 'Wingman', desc: '+1 escort fighter that shoots', w: 2, wp: 'wing', ok: (R) => R.s.poolWing && R.wp.wing < 4, take: (R) => { R.wp.wing++; } },
    // evolutions: a maxed weapon plus its partner boost (Evolution Lab node)
    { id: 'evo-blades', icon: '🪚', name: 'Buzzsaw Halo', desc: 'Blades grow, orbit wider and cut 2x harder', evo: 'blades', partner: 'mag', ok: (R) => R.wp.blades >= 5, take: (R) => { R.evo.blades = 1; } },
    { id: 'evo-missiles', icon: '🎆', name: 'Swarm Rack', desc: 'Missiles burst into 4 bomblets', evo: 'missiles', partner: 'dmg', ok: (R) => R.wp.missiles >= 4, take: (R) => { R.evo.missiles = 1; } },
    { id: 'evo-nova', icon: '🌟', name: 'Supernova', desc: 'Pulse twice as often; each pulse repairs hull', evo: 'nova', partner: 'speed', ok: (R) => R.wp.nova >= 4, take: (R) => { R.evo.nova = 1; } },
    { id: 'evo-beam', icon: '⛈️', name: 'Storm Lance', desc: 'Lightning jumps 4 more times, 50% harder', evo: 'beam', partner: 'crit', ok: (R) => R.wp.beam >= 4, take: (R) => { R.evo.beam = 1; } },
    { id: 'evo-wing', icon: '✈️', name: 'Ace Squadron', desc: 'Wingmen fire twin bolts that pierce', evo: 'wing', partner: 'main', ok: (R) => R.wp.wing >= 4, take: (R) => { R.evo.wing = 1; } },
  ];
  const PARTNER_NAME = { mag: 'Tractor', dmg: 'Hot Rounds', speed: 'Thrusters', crit: 'Lock-On', main: 'Weapon Mk+' };

  const SHIPS = { wasp: { c: '#ffd166', d: '#c98a00', c2: '#2b2d42', fl: '#ff9f1c' }, bulwark: { c: '#8ecae6', d: '#3d7ea6', c2: '#ff9f1c', fl: '#ffb703' },
    phantom: { c: '#c77dff', d: '#7b2cbf', c2: '#72efdd', fl: '#72efdd' }, wrecker: { c: '#ff8c42', d: '#b5541c', c2: '#3d405b', fl: '#ffd166' } };
  const CAUSE = { rock: 'Smashed by an asteroid', crystal: 'Smashed by a crystal', drone: 'Swarmed by drones', hunter: 'Torn apart by a hunter', lancer: 'Skewered by a lancer',
    wreck: 'Crushed by a wreck', boss: 'Devoured by the Leviathan', spit: 'Shot down by the Leviathan', well: 'Swallowed by a gravity well', storm: 'Lost in the void storm', brood: 'Swarmed by the brood' };

  // ---------------------------------------------------------------- the run
  function createRun(env) {
    const s = Object.assign({}, env.stats), W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, runNo = env.runNo || 1;
    const who = env.who, SY = H * 0.4; // ship sits 40% down the screen: above the thumb
    const R = {
      s, t: 0, lead: LEAD, over: false, won: false, quit: false, hp: s.hull, ship: { x: 0, y: 0, vx: 0, vy: 0, a: -Math.PI / 2 }, inv: 0,
      wp: { main: s.wlvl, blades: 0, missiles: 0, nova: 0, beam: 0, wing: s.wingStart, balls: 1 }, evo: {}, took: {}, cd: { main: 0.3, missiles: 1, nova: 2, beam: 1, wing: 0.5 },
      enemies: [], bullets: [], ebullets: [], orbs: [], parts: [], beams: [], arcs: [], hazards: [], trail: [], salv: 0, shards: 0, kills: 0, elites: 0, wrecksLooted: 0,
      xp: 0, need: Math.round(7 * s.xpMul), picks: 0, pending: s.headStart, picking: false,
      spawnT: 0.4, ringT: 7, eliteT: 0, wreckT: 9 / s.wrecks, wellT: 0, anchor: null, wasDown: false, blinkT: 0, blinks: 0, hurtT: -9, ending: 0, endT: 0, boss: null, warned: false, steered: false,
      bladeA: 0, flailA: 0, novaFx: [], shotSnd: 0, in: null, freeze: 0, streak: 0, streakT: 0, bestStreak: 0, popT: 0, banner: null, shieldUp: !!s.shield, shieldT: 0, cause: '', trailT: 0,
      balls: [], evt: 0, evtN: 0,
    };
    const ELITE_AT = Math.max(13, 22 - runNo * 0.3), LANCER_AT = Math.max(20, 30 - runNo * 0.3), WELL_AT = Math.max(30, 44 - runNo * 0.4);
    R.eliteT = ELITE_AT; R.wellT = WELL_AT;
    const view = Math.hypot(W / 2, H * 0.6) + 40;
    const ship = R.ship;
    const storm = () => Math.max(0, (R.t - STORM_AT) / 5) ** 2, hpMul = () => (1 + R.t / 24 + (R.t / 38) ** 2) * (1 + storm()), dmgMul = () => 1 + R.t / 30 + storm(); // past STORM_AT the void storm turns lethal

    // ---- spawning
    function spawn(kind, x, y, size) {
      if (R.enemies.length >= CAP.enemies && kind !== 'wreck') return null;
      if (x == null) {
        // mostly spawn ahead of where you're flying, so running away runs into things
        const mv = Math.hypot(ship.vx, ship.vy), a = mv > 40 && rnd() < 0.65 ? Math.atan2(ship.vy, ship.vx) + (rnd() - 0.5) * 2 : rnd() * TAU;
        x = ship.x + Math.cos(a) * view; y = ship.y + Math.sin(a) * view;
      }
      const m = hpMul(), e = { k: kind, x, y, vx: 0, vy: 0, rot: rnd() * TAU, spin: (rnd() - 0.5) * 2, flash: 0, bladeCD: 0, ballCD: 0, chainCD: 0, trailCD: 0, shape: [], born: R.t };
      if (kind === 'rock' || kind === 'crystal') {
        size = size || (rnd() < 0.5 ? 1 : rnd() < 0.6 ? 2 : 3);
        if (kind === 'crystal') size = 2;
        const T = [null, [13, 2, 1, 5], [20, 4.5, 2, 7], [30, 10, 3, 10]][size];
        Object.assign(e, { size, r: T[0], hp: T[1] * m * (kind === 'crystal' ? 1.4 : 1), val: T[2], dmg: T[3] });
        const a = Math.atan2(ship.y - y, ship.x - x) + (rnd() - 0.5) * 0.9, v = (48 + rnd() * 50) * (1 + R.t / 70) / Math.sqrt(size);
        e.vx = Math.cos(a) * v; e.vy = Math.sin(a) * v;
        for (let i = 0; i < 9; i++) e.shape.push(0.75 + rnd() * 0.3);
        e.craters = [[-0.3, -0.2, 0.22], [0.3, 0.25, 0.14], [0.1, -0.45, 0.1]];
      } else if (kind === 'drone') Object.assign(e, { r: 12, hp: 3 * m, val: 2, dmg: 7, sp: 100 * (1 + R.t / 80) * (1 + storm() * 0.15) });
      else if (kind === 'lancer') Object.assign(e, { r: 15, hp: 9 * m, val: 4, dmg: 13, sp: 70, mode: 'near', modeT: 0, dashA: 0 });
      else if (kind === 'wreck') {
        const gold = rnd() < 0.1;
        Object.assign(e, { r: 30, hp: 14 * Math.sqrt(m), val: 0, dmg: 4, gold, spin: (rnd() - 0.5) * 0.3 });
        const a = rnd() * TAU; e.vx = Math.cos(a) * 18; e.vy = Math.sin(a) * 18;
      } else Object.assign(e, { r: 19, hp: 22 * m, val: 6, dmg: 12, sp: 74 * (1 + R.t / 130) });
      e.max = e.hp; e.dmg *= dmgMul(); R.enemies.push(e); return e;
    }
    function makeElite(e) {
      if (!e) return;
      e.elite = true; e.hp *= 6; e.max = e.hp; e.r *= 1.35; e.val *= 5; e.dmg *= 1.3; if (e.sp) e.sp *= 0.9;
      sfx.tone(520, 0.25, 'triangle', 0.06, 1.5);
    }
    function spawnWave() {
      const t = R.t, r = rnd();
      const pDrone = Math.min(0.5, t < 4 ? 0 : 0.16 + t / 120), pHunter = t < 22 ? 0 : Math.min(0.14, (t - 22) / 300), pLancer = t < LANCER_AT ? 0 : Math.min(0.12, 0.04 + (t - LANCER_AT) / 250);
      if (r < pHunter) spawn('hunter');
      else if (r < pHunter + pLancer) spawn('lancer');
      else if (r < pHunter + pLancer + pDrone) { const n = t > 30 && rnd() < 0.35 ? 3 : 1, a = rnd() * TAU; for (let i = 0; i < n; i++) spawn('drone', ship.x + Math.cos(a + i * 0.12) * view, ship.y + Math.sin(a + i * 0.12) * view); }
      else spawn(rnd() < 0.025 * s.shardLuck ? 'crystal' : 'rock');
    }
    for (let i = 0; i < 7; i++) { const a = rnd() * TAU, d = 200 + rnd() * 160; const e = spawn('rock', Math.cos(a) * d, Math.sin(a) * d, 1 + (i % 2)); if (e) { e.vx *= 0.5; e.vy *= 0.5; } }

    function banner(title, sub, col, dur = 2.4) { R.banner = { title, sub, col, t: 0, dur }; }
    function sting(notes, type = 'sawtooth', v = 0.07, step = 0.16) { notes.forEach((f, i) => sfx.tone(f, step * 1.6, type, v, 1, i * step)); }
    function spawnBoss() {
      const a = Math.atan2(ship.vy || -1, ship.vx || 0), x = ship.x + Math.cos(a) * view, y = ship.y + Math.sin(a) * view;
      const segs = []; for (let i = 0; i < 16; i++) segs.push({ x: x + Math.cos(a) * i * 24, y: y + Math.sin(a) * i * 24, r: i === 0 ? 30 : Math.max(11, 26 - i * 0.9), seg: true, bladeCD: 0, ballCD: 0, chainCD: 0, trailCD: 0 });
      R.boss = { hp: BOSS_HP, max: BOSS_HP, bladeCD: 0, ballCD: 0, chainCD: 0, trailCD: 0, evt: -1, a: a + Math.PI, segs, fireT: 3, flash: 0, phase: 1, mode: 'swim', modeT: 0, spiralA: 0, spitT: 0, dashA: 0 };
      sfx.boom(); fx.shake = 12; R.freeze = 0.25;
      sting([110, 131, 98, 82, 55], 'sawtooth', 0.08, 0.2); sfx.tone(41, 1.6, 'sine', 0.16, 1, 0.9);
      banner('VOID LEVIATHAN', 'It has your scent. Keep moving.', '#f72585', 2.8);
    }

    // ---- particles (own: no gravity in space)
    function burst(x, y, n, cols, sp = 160, size = 3) {
      for (let i = 0; i < n && R.parts.length < CAP.parts; i++) { const a = rnd() * TAU, v = sp * (0.3 + rnd()); R.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: 0.35 + rnd() * 0.4, c: cols[i % cols.length], s: size * (0.6 + rnd() * 0.6) }); }
    }

    // ---- damage
    function hitE(e, d, crit) {
      if (crit !== false && s.crit && rnd() < s.crit) {
        d *= 2.5;
        if (R.t - R.popT > 0.12) { R.popT = R.t; fx.text(e.x, e.y - e.r - 6, Math.round(d) + '!', '#ffd166', 15); }
      }
      if (e.seg) {
        const B = R.boss; if (!B || B.hp <= 0) return;
        if (R.evt && B.evt === R.evt) return; B.evt = R.evt; // one hit per blast/beam, not one per segment
        B.hp -= d; B.flash = 0.08;
        if (B.phase === 1 && B.hp < B.max / 2) frenzy();
        if (B.hp <= 0) killBoss(); return;
      }
      if (e.dead) return;
      e.hp -= d; e.flash = 0.08;
      if (e.hp <= 0) kill(e);
    }
    function drop(x, y, v, shard) {
      if (R.orbs.length >= CAP.orbs && !shard) { let best = R.orbs[0]; for (const o of R.orbs) if (!o.shard && Math.hypot(o.x - ship.x, o.y - ship.y) < Math.hypot(best.x - ship.x, best.y - ship.y)) best = o; best.v += v; return; }
      const a = rnd() * TAU, sp = 40 + rnd() * 60;
      R.orbs.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, v, shard, t: 0 });
    }
    function kill(e) {
      e.dead = true; R.kills++;
      // streak: kills chained within 2s
      R.streak++; R.streakT = 2; if (R.streak > R.bestStreak) R.bestStreak = R.streak;
      if (R.streak === 10 || R.streak === 25 || R.streak % 50 === 0) { fx.text(ship.x, ship.y - 46, `STREAK x${R.streak}!`, '#ffd166', 20); sfx.tone(880 + R.streak * 4, 0.12, 'triangle', 0.07, 1.5); }
      const pay = 1 + s.streakPay * Math.min(1, R.streak / 40);
      const rockish = e.k === 'rock' || e.k === 'crystal';
      const cols = e.k === 'crystal' ? ['#c77dff', '#e0aaff', '#fff'] : rockish ? ['#a8977f', '#d6c6a8', '#6b5e53'] : e.k === 'drone' ? ['#ff6b6b', '#ffd166', '#fff'] : e.k === 'lancer' ? ['#ff9f1c', '#ffd166', '#fff'] : e.k === 'wreck' ? ['#9fb3c8', '#7bf1a8', '#fff', '#ffd166'] : ['#f72585', '#ff8fab', '#fff'];
      burst(e.x, e.y, rockish ? 6 + e.size * 3 : e.k === 'wreck' ? 26 : 10, e.elite ? cols.concat(['#ffd166', '#ffd166']) : cols, 150 + e.r * 3, rockish ? 3.5 : 3);
      if (rockish) sfx.crack(); else sfx.pop(e.k === 'hunter' || e.elite ? 0.6 : 1.2);
      if (e.k === 'hunter' || e.k === 'lancer') { fx.shake = Math.max(fx.shake, 4); fx.ring(e.x, e.y, 50, e.k === 'lancer' ? '#ff9f1c' : '#f72585'); R.freeze = Math.max(R.freeze, 0.03); }
      let val = e.val;
      if (e.elite) {
        R.elites++; val *= s.bounty; R.freeze = Math.max(R.freeze, 0.09); fx.shake = Math.max(fx.shake, 9); fx.ring(e.x, e.y, 90, '#ffd166'); sfx.boom();
        fx.text(e.x, e.y - 20, 'ELITE DOWN +' + env.fmt(val * pay * s.value), '#ffd166', 18);
        if (rnd() < 0.45 * s.shardLuck) drop(e.x, e.y, 1, true);
      }
      if (e.k === 'wreck') {
        R.wrecksLooted++; val = (16 + 4 * Math.log2(1 + R.t)) * (e.gold ? 3 : 1);
        R.freeze = Math.max(R.freeze, 0.06); fx.shake = Math.max(fx.shake, 7); fx.ring(e.x, e.y, 80, e.gold ? '#ffd166' : '#7bf1a8'); sfx.ding();
        fx.text(e.x, e.y - 24, (e.gold ? 'GOLDEN WRECK +' : 'WRECK LOOTED +') + env.fmt(val * pay * s.value), e.gold ? '#ffd166' : '#7bf1a8', 18);
        if (rnd() < (e.gold ? 1 : 0.3) * s.shardLuck) drop(e.x, e.y, 1, true);
      }
      val *= pay;
      for (let v = val; v > 0; v -= 2) drop(e.x + (rnd() - 0.5) * 14, e.y + (rnd() - 0.5) * 14, Math.min(2, v), false);
      const sc = e.k === 'crystal' ? 1 : e.k === 'hunter' ? 0.25 * s.shardLuck : e.k === 'lancer' ? 0.1 * s.shardLuck : e.k === 'drone' ? 0.006 * s.shardLuck : 0;
      if (!e.elite && rnd() < sc) drop(e.x, e.y, 1, true);
      if (e.k === 'rock' && e.size === 3) for (let i = 0; i < 2; i++) { const n = spawn('rock', e.x + (rnd() - 0.5) * 20, e.y + (rnd() - 0.5) * 20, 1); if (n) { const a = rnd() * TAU; n.vx = Math.cos(a) * 70 + e.vx; n.vy = Math.sin(a) * 70 + e.vy; } }
    }
    function frenzy() {
      const B = R.boss; B.phase = 2; B.mode = 'aim'; B.modeT = 1.1;
      R.freeze = 0.3; fx.shake = 16; sfx.boom();
      sting([196, 185, 175, 165, 147, 98], 'square', 0.06, 0.09);
      banner('FRENZY!', 'It sheds its tail and charges. Watch the red line.', '#ff4d6d', 2.6);
      const shed = B.segs.splice(10); // the tail breaks off into brood
      for (const g of shed) { burst(g.x, g.y, 10, ['#72efdd', '#f72585', '#fff'], 200, 3); const d = spawn('drone', g.x, g.y); if (d) { d.brood = true; d.sp *= 1.15; } }
    }
    function killBoss() {
      const B = R.boss; B.hp = 0; R.won = true; R.ending = 2.2; R.endT = 0; R.shards += 10; R.salv += 150;
      sfx.boom(); fx.shake = 18; R.freeze = 0.35;
      sting([523, 659, 784, 1046], 'triangle', 0.09, 0.13);
      for (const g of B.segs) { burst(g.x, g.y, 14, ['#72efdd', '#4cc9f0', '#fff', '#f72585'], 260, 4); fx.ring(g.x, g.y, 70, '#72efdd'); }
      banner('LEVIATHAN DOWN!', 'The void is quiet again.', '#72efdd', 3);
    }
    function hurt(d, fromX, fromY, cause) {
      if (R.inv > 0 || R.ending || R.lead > 0) return;
      if (R.shieldUp) { // deflector eats the hit
        R.shieldUp = false; R.shieldT = s.shield; R.inv = 0.6; fx.ring(ship.x, ship.y, 46, '#90e0ef'); fx.text(ship.x, ship.y - 26, 'BLOCKED', '#90e0ef', 16); sfx.tone(700, 0.18, 'sine', 0.08, 0.5);
        return;
      }
      d = Math.max(1, d * (1 - s.armor)); R.hp -= d; R.inv = 0.7; R.hurtT = R.t; R.cause = cause || '';
      if (R.streak >= 10) fx.text(ship.x + 30, ship.y - 40, 'streak lost', '#ff8fab', 14); R.streak = 0; // getting hit breaks the streak
      fx.shake = Math.max(fx.shake, 9); sfx.hit(); sfx.noise(0.15, 0.08, 300); R.freeze = Math.max(R.freeze, 0.05);
      fx.text(ship.x, ship.y - 22, '-' + Math.round(d), '#ff6b6b', 17);
      const a = Math.atan2(ship.y - fromY, ship.x - fromX); ship.vx += Math.cos(a) * 160; ship.vy += Math.sin(a) * 160;
      if (s.reactive) { for (let i = 0; i < 12; i++) { const b = i / 12 * TAU; fire(ship.x, ship.y, b, 420, 0.4, 1.4 * s.dmg * (0.6 + 0.4 * s.reactive), 'flak', 0); } fx.ring(ship.x, ship.y, 80, '#ffb703'); }
      if (R.hp <= 0) die();
    }
    function die() {
      R.hp = 0; R.ending = 1.6; R.endT = 0; R.freeze = 0.25; sfx.boom(); fx.shake = 16; burst(ship.x, ship.y, 40, ['#ffd166', '#ff6b6b', '#fff', SHIPS[who].c], 280, 4);
      banner('HULL DESTROYED', CAUSE[R.cause] || 'The void wins this one.', '#ff6b6b', 3);
    }

    // ---- weapons
    function fire(x, y, a, sp, life, dmg, kind, pierce) {
      if (R.bullets.length >= CAP.bullets) return null;
      const b = { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a, life, dmg, kind, pierce: pierce || 0, hits: [], r: kind === 'flak' ? 4 : kind === 'missile' ? 6 : kind === 'bomblet' ? 4 : 5 };
      R.bullets.push(b); return b;
    }
    const cdo = (e) => (e.seg ? R.boss : e); // the leviathan's segments share contact cooldowns
    const lvMul = () => 1 + 0.22 * R.wp.main, lvRate = () => 1 + 0.08 * R.wp.main;
    function weapons(dt, targets) {
      const tgt = targets[0], D = s.dmg * lvMul();
      R.cd.main -= dt;
      if (s.weapon !== 'flail' && tgt && R.cd.main <= 0) {
        const kind = s.weapon, base = Math.atan2(tgt.y - ship.y, tgt.x - ship.x), n = 1 + s.spread;
        if (kind === 'pulse') {
          R.cd.main = 0.48 / (s.rate * lvRate());
          for (let i = 0; i < n; i++) fire(ship.x, ship.y, base + (i - (n - 1) / 2) * 0.16, 560, 0.62, 1.5 * D, 'pulse', s.pierce);
          snd(660 + rnd() * 80, 'square');
        } else if (kind === 'flak') {
          R.cd.main = 0.9 / (s.rate * lvRate());
          const p = 5 + 2 * s.spread, fan = 0.7 + 0.08 * s.spread;
          for (let i = 0; i < p; i++) fire(ship.x, ship.y, base + (i / (p - 1) - 0.5) * fan + (rnd() - 0.5) * 0.08, 400 + rnd() * 80, 0.4, 1.1 * D, 'flak', 0);
          snd(180, 'sawtooth'); fx.shake = Math.max(fx.shake, 1.5);
        } else {
          R.cd.main = 0.95 / (s.rate * lvRate());
          for (let i = 0; i < n && i < targets.length; i++) laser(ship.x, ship.y, Math.atan2(targets[i].y - ship.y, targets[i].x - ship.x), 3.4 * D);
          snd(1200, 'sawtooth');
        }
      }
      if (s.weapon === 'flail') flailUpdate(dt, targets.all, D);
      // blades
      if (R.wp.blades) {
        const evo = R.evo.blades, rad = evo ? 84 : 62, br = evo ? 18 : 12;
        R.bladeA += dt * 3.4 * s.spin;
        for (let i = 0; i < R.wp.blades; i++) {
          const a = R.bladeA + i / R.wp.blades * TAU, bx = ship.x + Math.cos(a) * rad, by = ship.y + Math.sin(a) * rad;
          for (const e of targets.all) if (cdo(e).bladeCD <= 0 && Math.hypot(e.x - bx, e.y - by) < e.r + br) { hitE(e, 1.6 * s.dmg * (evo ? 2 : 1)); cdo(e).bladeCD = 0.3; burst(bx, by, 2, ['#72efdd', '#fff'], 90, 2); }
        }
      }
      // missiles
      if (R.wp.missiles) {
        R.cd.missiles -= dt;
        if (R.cd.missiles <= 0 && tgt) {
          R.cd.missiles = 1.7 / Math.sqrt(s.rate);
          for (let i = 0; i < R.wp.missiles; i++) { const b = fire(ship.x, ship.y, ship.a + Math.PI + (i - (R.wp.missiles - 1) / 2) * 0.7, 220, 2.2, 4 * s.dmg, 'missile', 0); if (b) b.tgt = targets[i % targets.length]; }
          sfx.tone(300, 0.15, 'triangle', 0.05, 2);
        }
      }
      // nova
      if (R.wp.nova) {
        R.cd.nova -= dt;
        if (R.cd.nova <= 0) {
          R.cd.nova = (4.4 - 0.5 * R.wp.nova) * (R.evo.nova ? 0.5 : 1); const rad = 100 + 25 * R.wp.nova; let hits = 0;
          R.evt = ++R.evtN; for (const e of targets.all) { const d = Math.hypot(e.x - ship.x, e.y - ship.y); if (d < rad + e.r) { hits++; hitE(e, 3 * s.dmg); if (!e.seg && e.k !== 'wreck') { e.vx += (e.x - ship.x) / (d || 1) * 180; e.vy += (e.y - ship.y) / (d || 1) * 180; } } } R.evt = 0;
          if (R.evo.nova && hits) R.hp = Math.min(s.hull, R.hp + Math.min(4, hits * 0.5));
          R.novaFx.push({ x: ship.x, y: ship.y, r: rad, t: 0 }); sfx.tone(140, 0.35, 'sine', 0.12, 3);
        }
      }
      // arc lance: lightning that jumps target to target
      if (R.wp.beam) {
        R.cd.beam -= dt;
        if (R.cd.beam <= 0 && tgt) {
          R.cd.beam = 1.3 / Math.sqrt(s.rate);
          const jumps = R.wp.beam + s.beamJump + (R.evo.beam ? 4 : 0), dmg = 2.4 * s.dmg * s.beamDmg * (1 + 0.25 * R.wp.beam) * (R.evo.beam ? 1.5 : 1);
          let from = { x: ship.x, y: ship.y }, cur = tgt; const hit = [], pts = [[ship.x, ship.y]];
          for (let j = 0; j <= jumps && cur; j++) {
            hit.push(cur); pts.push([cur.x, cur.y]); if (!(cur.seg && hit.some((h) => h !== cur && h.seg))) hitE(cur, dmg);
            from = cur; let nb = null, nd = 140;
            for (const e of targets.all) { if (hit.includes(e) || e.dead) continue; const d = Math.hypot(e.x - from.x, e.y - from.y); if (d < nd) { nd = d; nb = e; } }
            cur = nb;
          }
          R.arcs.push({ pts, t: 0, seed: rnd() * 100 }); sfx.zap();
        }
      }
      // wingmen: escorts in a V behind you, each with its own little gun
      if (R.wp.wing) {
        R.cd.wing -= dt;
        if (R.cd.wing <= 0 && tgt) {
          R.cd.wing = 0.75 / (s.wingRate * Math.sqrt(s.rate));
          for (let i = 0; i < R.wp.wing; i++) {
            const p = wingPos(i), a = Math.atan2(tgt.y - p.y, tgt.x - p.x);
            fire(p.x, p.y, a, 520, 0.6, 0.9 * s.dmg, 'wing', R.evo.wing ? 2 : 0);
            if (R.evo.wing) fire(p.x, p.y, a + 0.12, 520, 0.6, 0.9 * s.dmg, 'wing', 2);
          }
        }
      }
    }
    function wingPos(i) {
      const side = i % 2 ? 1 : -1, row = 1 + Math.floor(i / 2), back = ship.a + Math.PI, a = back + side * 0.75;
      return { x: ship.x + Math.cos(a) * 34 * row + Math.cos(R.t * 2 + i) * 3, y: ship.y + Math.sin(a) * 34 * row + Math.sin(R.t * 2.3 + i) * 3 };
    }
    function laser(x, y, a, dmg) {
      const L = 360, cx = Math.cos(a), cy = Math.sin(a);
      R.beams.push({ x, y, a, L, t: 0 });
      R.evt = ++R.evtN; for (const e of R.targetsAll || []) { const dx = e.x - x, dy = e.y - y, along = dx * cx + dy * cy; if (along < -e.r || along > L + e.r) continue; if (Math.abs(dx * cy - dy * cx) < e.r + 7) hitE(e, dmg); } R.evt = 0;
    }
    // wrecker: balls orbit on chains; the ship's own motion whips them, and faster balls hit harder
    function flailUpdate(dt, all, D) {
      while (R.balls.length < R.wp.balls) R.balls.push({ x: ship.x, y: ship.y + s.chain, vx: 0, vy: 0 });
      R.flailA += dt * (2.5 + 0.12 * R.wp.main) * s.spin * Math.sqrt(s.rate); // fire-rate boosts spin the ball faster
      const br = s.ballR + 1.2 * R.wp.main, n = R.balls.length;
      R.balls.forEach((b, i) => {
        const th = R.flailA + i / n * TAU, tx = ship.x + Math.cos(th) * s.chain, ty = ship.y + Math.sin(th) * s.chain;
        b.vx += ((tx - b.x) * 26 - b.vx * 5) * dt; b.vy += ((ty - b.y) * 26 - b.vy * 5) * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        const dx = b.x - ship.x, dy = b.y - ship.y, d = Math.hypot(dx, dy), L = s.chain * 1.25;
        if (d > L) { b.x = ship.x + dx / d * L; b.y = ship.y + dy / d * L; }
        const sp = Math.hypot(b.vx - ship.vx * 0.3, b.vy - ship.vy * 0.3), k = Math.max(0.45, Math.min(2.6, sp / 200));
        b.k = k;
        for (const e of all) {
          if (e.dead || cdo(e).ballCD > 0) continue;
          if (Math.abs(e.x - b.x) < e.r + br && Math.hypot(e.x - b.x, e.y - b.y) < e.r + br) {
            hitE(e, 3 * D * s.ballDmg * Math.sqrt(s.rate) * k); cdo(e).ballCD = 0.2;
            if (!e.seg && e.k !== 'wreck') { const a = Math.atan2(e.y - b.y, e.x - b.x); e.vx += Math.cos(a) * 160 * k; e.vy += Math.sin(a) * 160 * k; }
            burst(b.x, b.y, 3, ['#ffd166', '#ff8c42', '#fff'], 140, 2.5); if (k > 1.4) { sfx.hit(); fx.shake = Math.max(fx.shake, 2.5); }
          }
        }
        if (s.chainDmg) for (const e of all) { // the spiked chain cuts along its length
          if (e.dead || cdo(e).chainCD > 0) continue;
          const ex = e.x - ship.x, ey = e.y - ship.y, len2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, (ex * dx + ey * dy) / len2));
          if (Math.hypot(ex - dx * u, ey - dy * u) < e.r + 5) { hitE(e, 0.6 * D * s.chainDmg); cdo(e).chainCD = 0.3; }
        }
      });
    }
    function snd(f, type) { if (R.t - R.shotSnd < 0.09) return; R.shotSnd = R.t; sfx.tone(f, 0.05, type, 0.018, 0.6); }

    // ---- level-up choice: the kit's env.pick cards (the run is frozen until a card is tapped)
    function pickOptions() {
      const pool = PICKS.filter((p) => (p.evo ? s.evo && !R.evo[p.evo] && R.took[p.partner] && p.ok(R) : p.ok(R)));
      const evos = pool.filter((p) => p.evo), opts = evos.slice(0, 1); // an available evolution always shows
      const rest = pool.filter((p) => !opts.includes(p));
      while (opts.length < s.choices && rest.length) { let tot = 0; for (const p of rest) tot += p.w || 1; let r = rnd() * tot, k = 0; while ((r -= rest[k].w || 1) > 0) k++; opts.push(rest.splice(k, 1)[0]); }
      return opts;
    }
    function openPick() {
      const opts = pickOptions(); if (!opts.length) { R.pending = 0; return; }
      R.picking = true; R.anchor = null;
      const cards = opts.map((p) => {
        let desc = typeof p.desc === 'function' ? p.desc(R) : p.desc;
        if (p.wp && s.evo && !R.evo[p.wp]) { const ev = PICKS.find((q) => q.evo === p.wp); desc += ` · evolves with ${PARTNER_NAME[ev.partner]}`; }
        return { id: p.id, icon: p.icon, name: p.name, desc, tag: p.evo ? 'EVOLVE' : p.wp ? lvTag(R.wp[p.wp]) : p.id === 'main' ? 'Mk ' + (R.wp.main + 1) : '' };
      });
      const done = (i) => {
        const p = opts[i] || opts[0];
        p.take(R); R.took[p.id] = (R.took[p.id] || 0) + 1; R.picks++; R.pending--; R.picking = false;
        fx.ring(ship.x, ship.y, 70, p.evo ? '#ffd166' : '#4cc9f0');
        if (p.evo) { banner('EVOLVED!', p.name, '#ffd166', 1.8); sting([660, 880, 1320], 'triangle', 0.07, 0.08); R.freeze = 0.15; }
      };
      if (env.pick) env.pick(`Level ${R.picks + 2} · pick one`, cards, done); else done(0);
    }

    // ---- phantom's blink: a deliberate button in env.ui with a cooldown ring
    let blinkBtn = null, blinkShown = -1;
    if (s.blink && env.ui && env.ui.appendChild && HAS_DOM) {
      env.ui.insertAdjacentHTML('beforeend', `<div class="vd-bar"><button type="button" class="vd-blink" aria-label="Blink forward"><span class="vd-ring"></span><span class="vd-bl">Blink</span></button></div>`);
      blinkBtn = env.ui.querySelector('.vd-blink');
      blinkBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (!api.blink()) sfx.nope(); });
    }
    function syncBlinkBtn() {
      if (!blinkBtn) return;
      const k = R.blinkT > 0 ? Math.round((1 - R.blinkT / s.blinkCD) * 50) / 50 : 1;
      if (k === blinkShown) return; blinkShown = k;
      blinkBtn.style.setProperty('--k', k); blinkBtn.classList.toggle('ready', k >= 1);
    }

    const api = {
      get over() { return R.over; }, get t() { return R.t; }, R,
      blink() {
        if (!s.blink || R.blinkT > 0 || R.ending || R.over || R.lead > 0) return false;
        const mv = Math.hypot(ship.vx, ship.vy), nx = mv > 30 ? ship.vx / mv : Math.cos(ship.a), ny = mv > 30 ? ship.vy / mv : Math.sin(ship.a);
        doBlink(nx, ny); return true;
      },
      quit() { R.quit = true; },
      update(dtRaw, input) {
        R.in = input;
        if (R.over) return;
        if (R.freeze > 0) { R.freeze -= dtRaw; fx.update(dtRaw * 0.2); return; } // hit pause
        if (R.picking) return;
        if (R.pending > 0 && !R.ending && R.lead <= 0 && R.t > 0.25) { openPick(); if (R.picking) return; }
        const dt = R.ending > 0 ? dtRaw * 0.35 : dtRaw; // slow-mo while the run winds down
        if (R.banner && (R.banner.t += dtRaw) > R.banner.dur) R.banner = null;
        const ending = R.ending > 0;
        if (ending) { R.endT += dtRaw; if (R.endT >= R.ending) { R.over = true; return; } }

        // ---- steering: virtual stick anchored where the finger went down
        const down = input.down && !ending;
        if (down && (!R.wasDown || !R.anchor)) { const tp = input.taps && input.taps[input.taps.length - 1]; R.anchor = tp ? { x: tp.x, y: tp.y } : { x: input.x, y: input.y }; if (R.t > 0) sfx.tone(420, 0.04, 'sine', 0.03); }
        if (!down) R.anchor = null;
        R.wasDown = down;
        if (down) {
          let dx = input.x - R.anchor.x, dy = input.y - R.anchor.y; const len = Math.hypot(dx, dy), MAX = 60;
          if (len > MAX) { R.anchor.x = input.x - dx / len * MAX; R.anchor.y = input.y - dy / len * MAX; dx = dx / len * MAX; dy = dy / len * MAX; } // stick follows the finger past its edge
          if (len > 12) R.steered = true;
          const k = len < 6 ? 0 : Math.min(1, len / MAX), tvx = dx / (len || 1) * s.speed * k, tvy = dy / (len || 1) * s.speed * k;
          const f = Math.min(1, dt * 9); ship.vx += (tvx - ship.vx) * f; ship.vy += (tvy - ship.vy) * f;
        } else { const f = Math.max(0, 1 - dt * 1.6); ship.vx *= f; ship.vy *= f; }
        // gravity wells tug the ship
        for (const z of R.hazards) { const dx = z.x - ship.x, dy = z.y - ship.y, d = Math.hypot(dx, dy) || 1; if (d < z.r * 2.4) { const p = 260 * (1 - d / (z.r * 2.4)) * z.str; ship.vx += dx / d * p * dt; ship.vy += dy / d * p * dt; } }
        ship.x += ship.vx * dt; ship.y += ship.vy * dt;
        const sp = Math.hypot(ship.vx, ship.vy);
        if (sp > 25) { let da = Math.atan2(ship.vy, ship.vx) - ship.a; da = Math.atan2(Math.sin(da), Math.cos(da)); ship.a += da * Math.min(1, dt * 10); }
        R.blinkT -= dt; syncBlinkBtn();
        // ready lead-in: you can fly, nothing else moves yet
        if (R.lead > 0) { R.lead -= dt; if (R.lead <= 0) { sfx.tone(880, 0.12, 'triangle', 0.08); sfx.tone(1320, 0.16, 'triangle', 0.07, 1, 0.08); } updParts(dt); fx.update(dt); return; }
        R.t += dt;
        R.inv -= dt;
        if (s.regen && !ending) R.hp = Math.min(s.hull, R.hp + s.regen * dt);
        if (s.shield && !R.shieldUp && (R.shieldT -= dt) <= 0) { R.shieldUp = true; sfx.tone(990, 0.1, 'sine', 0.05); }
        if (R.streak && (R.streakT -= dt) <= 0) R.streak = 0;
        if (!ending && storm() > 0.6 && Math.floor(R.t * 2) !== Math.floor((R.t - dt) * 2)) { hurt(s.hull * 0.03 * storm(), ship.x, ship.y - 1, 'storm'); }

        // ---- spawns
        if (!ending) {
          R.spawnT -= dt;
          const rate = 0.75 / (1 + R.t / 11) * (R.boss ? 1.7 : 1);
          while (R.spawnT <= 0) { R.spawnT += Math.max(0.2, rate); spawnWave(); }
          if (R.t >= R.ringT) { // a ring of rocks and drones closes in from every side
            R.ringT += 13; const n = Math.min(26, 7 + Math.floor(R.t / 5)), off = rnd() * TAU;
            for (let i = 0; i < n; i++) { const a = off + i / n * TAU, e = spawn(i % 3 === 2 && R.t > 16 ? 'drone' : 'rock', ship.x + Math.cos(a) * view * 0.85, ship.y + Math.sin(a) * view * 0.85, 1); if (e && e.k === 'rock') { const v = 75 * (1 + R.t / 50); e.vx = -Math.cos(a) * v; e.vy = -Math.sin(a) * v; } }
            fx.text(ship.x, ship.y - 60, 'SWARM!', '#ff6b6b', 22); sfx.tone(110, 0.5, 'sawtooth', 0.07, 1.5);
          }
          if (R.t >= R.eliteT) { // elites: a gold-haloed tough one, more often as the run goes on
            R.eliteT += Math.max(8, 17 - R.t / 8);
            makeElite(spawn(R.t > 35 && rnd() < 0.5 ? 'hunter' : R.t > LANCER_AT && rnd() < 0.4 ? 'lancer' : 'drone'));
            fx.text(ship.x, ship.y - 74, 'ELITE INBOUND', '#ffd166', 18);
          }
          if (R.t >= R.wreckT) { // derelict wrecks: slow jackpots to crack open
            R.wreckT += (13 + rnd() * 6) / s.wrecks;
            const a = rnd() * TAU; spawn('wreck', ship.x + Math.cos(a) * view * 0.9, ship.y + Math.sin(a) * view * 0.9);
          }
          if (R.t >= R.wellT) { // gravity wells open near you late in a run
            R.wellT += 16 + rnd() * 6;
            const a = rnd() * TAU, d = 150 + rnd() * 90;
            R.hazards.push({ x: ship.x + Math.cos(a) * d, y: ship.y + Math.sin(a) * d, r: 44, t: 0, life: 9, str: 0 });
            fx.text(ship.x, ship.y - 60, 'GRAVITY WELL!', '#b388ff', 20); sfx.tone(70, 1.2, 'sine', 0.12, 0.5);
          }
          if (env.boss && !R.boss && R.t >= BOSS_AT) spawnBoss();
          if (env.boss && !R.warned && R.t >= BOSS_AT - 6) { R.warned = true; sfx.tone(90, 0.8, 'sawtooth', 0.08, 0.7); sfx.tone(85, 0.8, 'sawtooth', 0.06, 0.7, 0.9); }
        }
        for (const z of R.hazards) { z.t += dt; z.str = Math.min(1, z.t / 1.2, (z.life - z.t) / 1); if (!ending && Math.hypot(z.x - ship.x, z.y - ship.y) < 20 + 10 * z.str) hurt(10 * dmgMul(), z.x, z.y, 'well'); }
        R.hazards = R.hazards.filter((z) => z.t < z.life);

        // ---- enemies
        const keep = view * 1.5;
        for (const e of R.enemies) {
          e.flash -= dt; e.bladeCD -= dt; e.ballCD -= dt; e.chainCD -= dt; e.trailCD -= dt; e.rot += e.spin * dt;
          if (e.k === 'drone' || e.k === 'hunter') {
            const a = Math.atan2(ship.y - e.y, ship.x - e.x), turn = e.k === 'drone' ? 2.4 : 1.6;
            e.vx += (Math.cos(a) * e.sp - e.vx) * Math.min(1, dt * turn); e.vy += (Math.sin(a) * e.sp - e.vy) * Math.min(1, dt * turn);
            e.rot = a;
          } else if (e.k === 'lancer') { // approach, lock on (telegraph), dash, cool off
            const a = Math.atan2(ship.y - e.y, ship.x - e.x), d = Math.hypot(ship.x - e.x, ship.y - e.y);
            e.modeT -= dt;
            if (e.mode === 'near') { e.vx += (Math.cos(a) * e.sp - e.vx) * Math.min(1, dt * 2); e.vy += (Math.sin(a) * e.sp - e.vy) * Math.min(1, dt * 2); e.rot = a; if (d < 250) { e.mode = 'aim'; e.modeT = 0.85; } }
            else if (e.mode === 'aim') { e.vx *= 1 - dt * 4; e.vy *= 1 - dt * 4; if (e.modeT > 0.25) e.dashA = a; e.rot = e.dashA; if (e.modeT <= 0) { e.mode = 'dash'; e.modeT = 0.6; sfx.tone(240, 0.2, 'sawtooth', 0.04, 2); } }
            else if (e.mode === 'dash') { e.vx = Math.cos(e.dashA) * 470; e.vy = Math.sin(e.dashA) * 470; if (e.modeT <= 0) { e.mode = 'cool'; e.modeT = 1.3; } }
            else { e.vx *= 1 - dt * 2.5; e.vy *= 1 - dt * 2.5; if (e.modeT <= 0) e.mode = 'near'; }
          }
          for (const z of R.hazards) { const dx = z.x - e.x, dy = z.y - e.y, d = Math.hypot(dx, dy) || 1; if (d < z.r * 2.4 && e.k !== 'wreck') { e.vx += dx / d * 200 * z.str * dt; e.vy += dy / d * 200 * z.str * dt; if (d < 24) hitE(e, 30 * dt * hpMul(), false); } }
          e.x += e.vx * dt; e.y += e.vy * dt;
          const d = Math.hypot(e.x - ship.x, e.y - ship.y);
          if (d > keep * (e.k === 'wreck' ? 1.8 : 1)) e.dead = true;
          else if (!ending && d < e.r + 11) {
            const ram = s.ram ? 1 + s.ram : 1;
            hurt(e.dmg * (s.ram ? 0.85 ** s.ram : 1), e.x, e.y, e.brood ? 'brood' : e.k);
            hitE(e, 3 * s.dmg * ram * (e.k === 'wreck' ? 0.3 : 1));
            if (s.ram && !e.dead) fx.ring(e.x, e.y, 30, '#8ecae6');
            const nx = (e.x - ship.x) / (d || 1), ny = (e.y - ship.y) / (d || 1); e.vx = nx * 140; e.vy = ny * 140; e.x = ship.x + nx * (e.r + 12); e.y = ship.y + ny * (e.r + 12);
            if (e.k === 'lancer') { e.mode = 'cool'; e.modeT = 1.2; }
          }
        }
        // drones nudge apart so they read as a swarm, not one blob
        for (let i = 0; i < R.enemies.length; i++) { const a = R.enemies[i]; if (a.k === 'rock' || a.k === 'crystal' || a.k === 'wreck') continue; for (let j = i + 1; j < R.enemies.length; j++) { const b = R.enemies[j]; if (b.k === 'rock' || b.k === 'crystal' || b.k === 'wreck') continue; const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r; if (d < m && d > 0.01) { const p = (m - d) / 2 / d; a.x -= dx * p; a.y -= dy * p; b.x += dx * p; b.y += dy * p; } } }

        // ---- boss
        const B = R.boss;
        if (B && B.hp > 0) bossUpdate(B, dt, ending);
        for (const b of R.ebullets) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; if (!ending && Math.hypot(b.x - ship.x, b.y - ship.y) < 14) { hurt(6 * (1 + R.t / 60), b.x, b.y, 'spit'); b.life = 0; } }
        R.ebullets = R.ebullets.filter((b) => b.life > 0);

        // ---- targeting + weapons
        const all = R.enemies.filter((e) => !e.dead);
        if (B && B.hp > 0) all.push(...B.segs);
        R.targetsAll = all;
        const near = all.map((e) => [e, Math.hypot(e.x - ship.x, e.y - ship.y) - e.r]).filter((p) => p[1] < 300).sort((a, b) => a[1] - b[1]).map((p) => p[0]);
        if (B && B.hp > 0) { const seen = near.filter((e) => e.seg); if (seen.length > 1) for (const g of seen.slice(1)) near.splice(near.indexOf(g), 1); } // one boss target, not 16
        near.all = all;
        if (!ending) weapons(dt, near);
        // wasp afterburner: a burning trail behind a fast ship
        if (s.trail && !ending) {
          if ((R.trailT -= dt) <= 0 && sp > s.speed * 0.6) { R.trailT = 0.05; R.trail.push({ x: ship.x - Math.cos(ship.a) * 14, y: ship.y - Math.sin(ship.a) * 14, t: 0 }); }
          for (const p of R.trail) for (const e of all) if (cdo(e).trailCD <= 0 && Math.abs(e.x - p.x) < e.r + 12 && Math.hypot(e.x - p.x, e.y - p.y) < e.r + 12) { hitE(e, 0.9 * s.dmg * s.trail, false); cdo(e).trailCD = 0.25; }
        }
        for (const p of R.trail) p.t += dt; R.trail = R.trail.filter((p) => p.t < 0.8);

        // ---- bullets
        for (const b of R.bullets) {
          if (b.kind === 'missile') {
            if (!b.tgt || b.tgt.dead || (b.tgt.seg && (!B || B.hp <= 0))) b.tgt = near[0];
            const sp2 = Math.min(460, Math.hypot(b.vx, b.vy) + dt * 500);
            if (b.tgt) { const want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x); let da = want - b.a; da = Math.atan2(Math.sin(da), Math.cos(da)); b.a += Math.max(-1, Math.min(1, da)) * dt * 6; }
            b.vx = Math.cos(b.a) * sp2; b.vy = Math.sin(b.a) * sp2;
            if (R.parts.length < CAP.parts && rnd() < 0.6) R.parts.push({ x: b.x, y: b.y, vx: -b.vx * 0.1, vy: -b.vy * 0.1, t: 0, life: 0.3, c: '#ffb703', s: 2.5 });
          }
          b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
          for (const e of all) {
            if (e.dead || b.hits.includes(e)) continue;
            if (Math.abs(e.x - b.x) < e.r + b.r && Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r) {
              if (b.kind === 'missile' || b.kind === 'bomblet') { b.life = 0; break; }
              hitE(e, b.dmg); b.hits.push(e); burst(b.x, b.y, 2, b.kind === 'flak' ? ['#ffb703'] : ['#fff', SHIPS[who].c], 90, 2);
              if (e.seg) { b.life = 0; break; }
              if (b.pierce-- <= 0) { b.life = 0; break; }
            }
          }
          if ((b.kind === 'missile' || b.kind === 'bomblet') && b.life <= 0) {
            const rad = b.kind === 'missile' ? 55 : 34;
            R.evt = ++R.evtN; for (const e of all) if (Math.hypot(e.x - b.x, e.y - b.y) < rad + e.r) hitE(e, b.dmg); R.evt = 0;
            burst(b.x, b.y, b.kind === 'missile' ? 10 : 5, ['#ffb703', '#ff6b6b', '#fff'], 180, 3); fx.ring(b.x, b.y, rad, '#ffb703'); sfx.crack();
            if (b.kind === 'missile' && R.evo.missiles) for (let i = 0; i < 4; i++) fire(b.x, b.y, i / 4 * TAU + rnd(), 200, 0.35, b.dmg * 0.6, 'bomblet', 0);
          }
        }
        R.bullets = R.bullets.filter((b) => b.life > 0);
        R.enemies = R.enemies.filter((e) => !e.dead);

        // ---- salvage + magnet
        for (const o of R.orbs) {
          o.t += dt; const dx = ship.x - o.x, dy = ship.y - o.y, d = Math.hypot(dx, dy);
          if (!ending && d < s.magnet) { const pull = 140 + (1 - d / s.magnet) * 520; o.vx += (dx / d * pull - o.vx) * Math.min(1, dt * 7); o.vy += (dy / d * pull - o.vy) * Math.min(1, dt * 7); }
          else { o.vx *= 1 - dt * 2; o.vy *= 1 - dt * 2; }
          for (const z of R.hazards) { const zx = z.x - o.x, zy = z.y - o.y, zd = Math.hypot(zx, zy) || 1; if (zd < z.r * 2.4) { o.vx += zx / zd * 160 * z.str * dt; o.vy += zy / zd * 160 * z.str * dt; } }
          o.x += o.vx * dt; o.y += o.vy * dt;
          if (!ending && d < 18) {
            o.got = true;
            if (o.shard) { R.shards++; sfx.ding(); fx.text(ship.x, ship.y - 28, '+1 void shard', '#e0aaff', 17); }
            else { R.salv += o.v; R.xp += o.v; sfx.coin(); }
          }
          if (d > keep * 1.4) o.got = true;
        }
        R.orbs = R.orbs.filter((o) => !o.got);
        if (R.xp >= R.need) { R.xp -= R.need; R.need = Math.round((R.need / s.xpMul * 1.6 + 4) * s.xpMul); R.pending++; }

        updParts(dt);
        for (const b of R.beams) b.t += dt; R.beams = R.beams.filter((b) => b.t < 0.16);
        for (const a of R.arcs) a.t += dt; R.arcs = R.arcs.filter((a) => a.t < 0.2);
        for (const n of R.novaFx) n.t += dt; R.novaFx = R.novaFx.filter((n) => n.t < 0.4);
        fx.update(dt);
      },
      draw(g) { draw(g); },
      result() {
        const banked = R.salv * s.value, earned = { salvage: banked, shards: R.shards }, score = Math.floor(R.t);
        const lines = [`Survived ${score}s · ${R.kills} destroyed · ${R.picks} boosts`,
          `Best streak x${R.bestStreak}${R.elites ? ` · ${R.elites} elite${R.elites > 1 ? 's' : ''}` : ''}${R.wrecksLooted ? ` · ${R.wrecksLooted} wreck${R.wrecksLooted > 1 ? 's' : ''} looted` : ''}`];
        if (R.won) return { won: true, earned, lines, score };
        if (env.boss) lines.push(R.boss ? `The Leviathan had ${Math.ceil(R.boss.hp / R.boss.max * 100)}% left.` : `Survive to ${BOSS_AT}s to meet the Leviathan.`);
        const title = R.quit ? 'Back to base' : CAUSE[R.cause] || 'Hull destroyed';
        return { won: false, title, earned, lines, score };
      },
    };
    if (HAS_DOM && window.VoidDrifter) window.VoidDrifter.run = api; // handy for ?dev poking from the console
    return api;

    function updParts(dt) {
      for (const p of R.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2; }
      R.parts = R.parts.filter((p) => p.t < p.life);
    }
    function bossUpdate(B, dt, ending) {
      B.flash -= dt;
      const h = B.segs[0], want = Math.atan2(ship.y - h.y, ship.x - h.x);
      let da = want - B.a; da = Math.atan2(Math.sin(da), Math.cos(da));
      let v = 118, turn = 1.25;
      if (B.phase === 2) {
        B.modeT -= dt;
        if (B.mode === 'swim') { v = 150; turn = 1.9; if ((B.spitT -= dt) <= 0) { B.spitT = 0.1; B.spiralA += 0.55; for (const k of [0, Math.PI]) if (R.ebullets.length < CAP.ebullets) R.ebullets.push({ x: h.x, y: h.y, vx: Math.cos(B.spiralA + k) * 150, vy: Math.sin(B.spiralA + k) * 150, life: 3.5 }); } if (B.modeT <= 0) { B.mode = 'aim'; B.modeT = 0.9; sfx.tone(160, 0.8, 'sawtooth', 0.06, 2.2); } }
        else if (B.mode === 'aim') { v = 25; turn = 4; if (B.modeT > 0.25) B.dashA = want; if (B.modeT <= 0) { B.mode = 'dash'; B.modeT = 0.8; B.a = B.dashA; sfx.noise(0.4, 0.1, 200); fx.shake = Math.max(fx.shake, 8); } }
        else { v = 470; turn = 0; B.a = B.dashA; if (B.modeT <= 0) { B.mode = 'swim'; B.modeT = 2.4; } }
      } else {
        B.fireT -= dt;
        if (B.fireT <= 0) {
          B.fireT = 2.7; const n = 12, off = rnd() * TAU;
          for (let i = 0; i < n && R.ebullets.length < CAP.ebullets; i++) { const a = off + i / n * TAU; R.ebullets.push({ x: h.x, y: h.y, vx: Math.cos(a) * 140, vy: Math.sin(a) * 140, life: 4.5 }); }
          sfx.tone(200, 0.3, 'square', 0.05, 0.4);
        }
      }
      if (turn) B.a += Math.max(-1, Math.min(1, da)) * dt * turn;
      h.x += Math.cos(B.a) * v * dt; h.y += Math.sin(B.a) * v * dt;
      for (let i = 1; i < B.segs.length; i++) { const p = B.segs[i - 1], q = B.segs[i], dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, gap = 22; q.x = p.x + dx / d * gap; q.y = p.y + dy / d * gap; }
      B.bladeCD -= dt; B.ballCD -= dt; B.chainCD -= dt; B.trailCD -= dt; // segments share one set of contact cooldowns
      if (!ending) for (const g of B.segs) if (Math.hypot(g.x - ship.x, g.y - ship.y) < g.r + 10) { hurt(B.mode === 'dash' ? 18 : 12, g.x, g.y, 'boss'); break; }
      // a leviathan far off-screen swims back fast
      if (Math.hypot(h.x - ship.x, h.y - ship.y) > view * 1.3) { h.x += (ship.x - h.x) * dt * 0.8; h.y += (ship.y - h.y) * dt * 0.8; }
    }
    function doBlink(nx, ny) {
      const ox = ship.x, oy = ship.y; R.blinkT = s.blinkCD; R.blinks++;
      burst(ox, oy, 14, ['#c77dff', '#72efdd'], 140, 3);
      ship.x += nx * s.blinkDist; ship.y += ny * s.blinkDist; ship.vx = nx * s.speed; ship.vy = ny * s.speed; R.inv = Math.max(R.inv, 0.4);
      R.blinkFx = { ox, oy, x: ship.x, y: ship.y, t: R.t };
      burst(ship.x, ship.y, 10, ['#c77dff', '#fff'], 120, 3); sfx.tone(1400, 0.12, 'sine', 0.06, 0.4);
      if (s.rift) { fx.ring(ox, oy, 60, '#c77dff'); R.evt = ++R.evtN; for (const e of R.targetsAll || []) if (Math.hypot(e.x - ox, e.y - oy) < 60 + e.r) hitE(e, 3 * s.rift * s.dmg); R.evt = 0; }
      if (s.echo) { const near = (R.targetsAll || []).filter((e) => !e.dead).sort((a, b) => Math.hypot(a.x - ship.x, a.y - ship.y) - Math.hypot(b.x - ship.x, b.y - ship.y)).slice(0, 1 + s.echo); for (const e of near) laser(ship.x, ship.y, Math.atan2(e.y - ship.y, e.x - ship.x), 2.6 * s.dmg * lvMul()); }
    }

    // ---------------------------------------------------------------- drawing
    function draw(g) {
      const shx = (rnd() - 0.5) * fx.shake, shy = (rnd() - 0.5) * fx.shake;
      const ox = W / 2 - ship.x + shx, oy = SY - ship.y + shy;
      // backdrop: deep void, a far planet, slow nebulae, parallax stars
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#070a1c'); bg.addColorStop(1, '#03040b'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      { const px = mod(W * 0.78 - ship.x * 0.02, W + 400) - 200, py = mod(H * 0.22 - ship.y * 0.02, H + 400) - 200, pr = 70;
        const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr); pg.addColorStop(0, '#3a4a8c'); pg.addColorStop(0.7, '#1b2250'); pg.addColorStop(1, '#0b0e24');
        g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(160,190,255,.25)'; g.lineWidth = 3; g.beginPath(); g.ellipse(px, py, pr * 1.6, pr * 0.32, -0.35, 0, TAU); g.stroke(); }
      for (const [nx, ny, nr, col, f] of NEB) {
        const x = mod(nx - ship.x * f, 1400) - 300, y = mod(ny - ship.y * f, 1600) - 300;
        const gr = g.createRadialGradient(x, y, 0, x, y, nr); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - nr, y - nr, nr * 2, nr * 2);
      }
      for (const L of STARS) {
        g.fillStyle = L.c;
        for (const st of L.s) {
          const x = mod(st[0] - ship.x * L.f, 600), y = mod(st[1] - ship.y * L.f, 600);
          for (let tx = x; tx < W; tx += 600) for (let ty = y; ty < H; ty += 600) g.fillRect(tx, ty, L.z, L.z);
        }
      }
      if (storm() > 0) { g.fillStyle = `rgba(120,40,200,${Math.min(0.35, storm() * 0.12)})`; g.fillRect(0, 0, W, H); }
      g.save(); g.translate(ox, oy);
      for (const z of R.hazards) drawWell(g, z);
      // salvage
      for (const o of R.orbs) {
        if (o.shard) { const p = 1 + Math.sin(R.t * 8 + o.x) * 0.15; g.save(); g.translate(o.x, o.y); g.scale(p, p); const sg = g.createRadialGradient(0, 0, 2, 0, 0, 16); sg.addColorStop(0, 'rgba(224,170,255,.6)'); sg.addColorStop(1, 'rgba(199,125,255,0)'); g.fillStyle = sg; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill(); g.fillStyle = '#e0aaff'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 0); g.lineTo(0, 9); g.lineTo(-6, 0); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(-1.5, -4, 3, 4); g.restore(); }
        else { const z = o.v > 2 ? 6 : 4.5; g.save(); g.translate(o.x, o.y); g.rotate(o.t * 3 + o.x); g.fillStyle = 'rgba(123,241,168,.2)'; g.beginPath(); g.arc(0, 0, z + 5, 0, TAU); g.fill(); g.fillStyle = '#3fbf74'; g.fillRect(-z, -z, z * 2, z * 2); g.fillStyle = '#7bf1a8'; g.fillRect(-z, -z, z * 2 - 2, z * 2 - 2); g.fillStyle = '#e9fff1'; g.fillRect(-z * 0.5, -z * 0.5, z * 0.7, z * 0.7); g.restore(); }
      }
      // afterburner trail
      for (const p of R.trail) { const q = p.t / 0.8; g.fillStyle = `rgba(255,${160 - q * 100},40,${0.55 * (1 - q)})`; g.beginPath(); g.arc(p.x, p.y, 9 * (1 - q * 0.5), 0, TAU); g.fill(); }
      for (const e of R.enemies) drawEnemy(g, e);
      if (R.boss && R.boss.hp > 0) drawBoss(g, R.boss);
      // nova waves
      for (const n of R.novaFx) { const q = n.t / 0.4; g.strokeStyle = `rgba(114,239,221,${1 - q})`; g.lineWidth = 10 * (1 - q) + 2; g.beginPath(); g.arc(n.x, n.y, n.r * (0.3 + 0.7 * q), 0, TAU); g.stroke(); }
      // bullets
      for (const b of R.bullets) {
        if (b.kind === 'pulse' || b.kind === 'wing') { g.strokeStyle = b.kind === 'wing' ? '#90e0ef' : SHIPS[who].c; g.lineWidth = b.kind === 'wing' ? 3 : 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - b.vx * 0.022, b.y - b.vy * 0.022); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.arc(b.x, b.y, 2.5, 0, TAU); g.fill(); }
        else if (b.kind === 'flak' || b.kind === 'bomblet') { g.fillStyle = '#ffb703'; g.beginPath(); g.arc(b.x, b.y, 3.5, 0, TAU); g.fill(); g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(b.x, b.y, 1.5, 0, TAU); g.fill(); }
        else { g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.fillStyle = '#ff6b6b'; g.fillRect(-6, -3, 12, 6); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(6, -3); g.lineTo(10, 0); g.lineTo(6, 3); g.fill(); g.restore(); }
      }
      for (const b of R.ebullets) { g.fillStyle = 'rgba(247,37,133,.3)'; g.beginPath(); g.arc(b.x, b.y, 10, 0, TAU); g.fill(); g.fillStyle = '#ff8fab'; g.beginPath(); g.arc(b.x, b.y, 5, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(b.x, b.y, 2, 0, TAU); g.fill(); }
      for (const b of R.beams) { const q = 1 - b.t / 0.16; g.save(); g.translate(b.x, b.y); g.rotate(b.a); g.fillStyle = `rgba(114,239,221,${0.35 * q})`; g.fillRect(0, -7 * q - 2, b.L, (7 * q + 2) * 2); g.fillStyle = `rgba(255,255,255,${q})`; g.fillRect(0, -1.5, b.L, 3); g.restore(); }
      for (const a of R.arcs) { // jagged lightning
        const q = 1 - a.t / 0.2; g.lineCap = 'round'; g.lineJoin = 'round';
        for (const [w, c] of [[7, `rgba(144,224,239,${0.35 * q})`], [2.5, `rgba(255,255,255,${q})`]]) {
          g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.moveTo(a.pts[0][0], a.pts[0][1]);
          for (let i = 1; i < a.pts.length; i++) { const [x0, y0] = a.pts[i - 1], [x1, y1] = a.pts[i]; for (let k = 1; k <= 4; k++) { const u = k / 4, j = k < 4 ? Math.sin(a.seed + i * 7 + k * 3.1) * 9 : 0; g.lineTo(x0 + (x1 - x0) * u + j, y0 + (y1 - y0) * u - j); } }
          g.stroke();
        }
      }
      // blades
      if (R.wp.blades) { const evo = R.evo.blades, rad = evo ? 84 : 62, br = evo ? 16 : 11; for (let i = 0; i < R.wp.blades; i++) { const a = R.bladeA + i / R.wp.blades * TAU; g.save(); g.translate(ship.x + Math.cos(a) * rad, ship.y + Math.sin(a) * rad); g.rotate(R.t * 14); g.fillStyle = evo ? '#ffd166' : '#72efdd'; g.beginPath(); for (let k = 0; k < (evo ? 5 : 3); k++) { const b = k / (evo ? 5 : 3) * TAU; g.moveTo(0, 0); g.arc(0, 0, br, b, b + 0.8); } g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill(); g.restore(); } }
      // wrecker chains + balls
      if (s.weapon === 'flail' && !(R.ending && R.hp <= 0)) for (const b of R.balls) {
        const br = s.ballR + 1.2 * R.wp.main;
        g.strokeStyle = s.chainDmg ? '#e5e5e5' : '#9a8c98'; g.lineWidth = 3; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(ship.x, ship.y); g.lineTo(b.x, b.y); g.stroke(); g.setLineDash([]);
        if ((b.k || 0) > 1.3) { g.fillStyle = `rgba(255,140,66,${Math.min(0.5, (b.k - 1.3) * 0.5)})`; g.beginPath(); g.arc(b.x, b.y, br * 1.9, 0, TAU); g.fill(); }
        const bgr = g.createRadialGradient(b.x - br * 0.35, b.y - br * 0.35, br * 0.1, b.x, b.y, br); bgr.addColorStop(0, '#9aa5b1'); bgr.addColorStop(1, '#2b2d42');
        g.fillStyle = bgr; g.beginPath(); g.arc(b.x, b.y, br, 0, TAU); g.fill();
        g.fillStyle = '#ffd166'; for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + R.flailA; g.beginPath(); g.moveTo(b.x + Math.cos(a - 0.25) * br, b.y + Math.sin(a - 0.25) * br); g.lineTo(b.x + Math.cos(a) * (br + 6), b.y + Math.sin(a) * (br + 6)); g.lineTo(b.x + Math.cos(a + 0.25) * br, b.y + Math.sin(a + 0.25) * br); g.fill(); }
      }
      // wingmen
      for (let i = 0; i < R.wp.wing; i++) { const p = wingPos(i); drawShip(g, 'wing', p.x, p.y, ship.a, 0.6, 0.6, R.t + i); }
      // magnet halo (faint, so you learn your pull range), ship, shield
      if (!(R.ending && R.hp <= 0)) {
        g.strokeStyle = 'rgba(123,241,168,.08)'; g.lineWidth = 2; g.setLineDash([4, 8]); g.beginPath(); g.arc(ship.x, ship.y, s.magnet, 0, TAU); g.stroke(); g.setLineDash([]);
        if (R.blinkFx && R.t - R.blinkFx.t < 0.25) { const q = (R.t - R.blinkFx.t) / 0.25; g.strokeStyle = `rgba(199,125,255,${0.7 * (1 - q)})`; g.lineWidth = 10 * (1 - q); g.beginPath(); g.moveTo(R.blinkFx.ox, R.blinkFx.oy); g.lineTo(R.blinkFx.x, R.blinkFx.y); g.stroke(); }
        if (!(R.inv > 0 && Math.floor(R.t * 20) % 2)) drawShip(g, who, ship.x, ship.y, ship.a, 1.2, Math.min(1, Math.hypot(ship.vx, ship.vy) / s.speed), R.t);
        if (R.shieldUp) { g.strokeStyle = 'rgba(144,224,239,.55)'; g.lineWidth = 2; g.beginPath(); g.arc(ship.x, ship.y, 26 + Math.sin(R.t * 4) * 1.5, 0, TAU); g.stroke(); g.fillStyle = 'rgba(144,224,239,.08)'; g.fill(); }
      }
      for (const p of R.parts) { g.globalAlpha = 1 - p.t / p.life; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.s, 0, TAU); g.fill(); }
      g.globalAlpha = 1;
      fx.draw(g);
      g.restore();

      // hurt vignette
      const ht = R.t - R.hurtT;
      if (ht < 0.35) { const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, 'rgba(255,0,60,0)'); v.addColorStop(1, `rgba(255,0,60,${0.45 * (1 - ht / 0.35)})`); g.fillStyle = v; g.fillRect(0, 0, W, H); }

      // off-screen pointers: the boss (pink) and wrecks (green)
      const B = R.boss;
      const pointer = (wx, wy, col) => {
        const sx = wx + ox, sy = wy + oy;
        if (sx > -10 && sx < W + 10 && sy > 130 && sy < H + 10) return;
        const a = Math.atan2(sy - SY, sx - W / 2), px = Math.max(20, Math.min(W - 20, W / 2 + Math.cos(a) * W)), py = Math.max(142, Math.min(H - 24, SY + Math.sin(a) * W));
        g.save(); g.translate(px, py); g.rotate(a); g.fillStyle = col; g.beginPath(); g.moveTo(13, 0); g.lineTo(-8, -9); g.lineTo(-8, 9); g.fill(); g.restore();
      };
      if (B && B.hp > 0) pointer(B.segs[0].x, B.segs[0].y, '#f72585');
      for (const e of R.enemies) if (e.k === 'wreck') pointer(e.x, e.y, e.gold ? '#ffd166' : '#7bf1a8');

      // stick
      if (R.anchor && R.in?.down) {
        g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 3; g.beginPath(); g.arc(R.anchor.x, R.anchor.y, 60, 0, TAU); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(R.in.x, R.in.y, 24, 0, TAU); g.fill();
      }

      drawHud(g, B);
      drawBanner(g);

      // first-run hint, at the point of need: until you have steered (and a reminder in the first seconds of early runs)
      const hintOn = !R.ending && (!R.steered || (runNo <= 2 && R.t < 2.5));
      if (hintOn) {
        const a = R.steered ? Math.min(1, (2.5 - R.t) * 2) : 1;
        g.globalAlpha = Math.max(0, a);
        g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, 16, H * 0.62, W - 32, 48, 14); g.fill();
        g.textAlign = 'center'; g.fillStyle = '#fff'; g.font = '400 20px "Lilita One", system-ui'; g.fillText(s.weapon === 'flail' ? 'Drag anywhere to fly. Swing the ball into things.' : 'Drag anywhere to fly. Guns fire on their own.', W / 2, H * 0.62 + 31, W - 48);
        if (!R.steered) { // ghost finger showing the stick
          const fx0 = W / 2, fy0 = H * 0.8, k = (performance.now() / 1250) % 1, fxx = fx0 + Math.cos(k * TAU) * 34, fyy = fy0 + Math.sin(k * TAU) * 20;
          g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 3; g.beginPath(); g.arc(fx0, fy0, 40, 0, TAU); g.stroke();
          g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(fxx, fyy, 18, 0, TAU); g.fill();
        }
        g.globalAlpha = 1;
      } else if (blinkBtn && !R.blinks && R.t > 3 && R.t < 14 && !R.ending) { // phantom: point at the blink button once
        g.textAlign = 'right'; g.font = '800 14px Nunito, system-ui'; g.fillStyle = '#e0aaff'; g.fillText('Tap Blink to dash ahead ↘', W - 24, H - 120);
      }
    }
    // HUD: every element has a fixed slot. Bars stop 72px short of the right edge (pause button), numbers are
    // right- or left-anchored at fixed x so they grow away from their neighbours.
    function drawHud(g, B) {
      const sc = g.createLinearGradient(0, 0, 0, 96); sc.addColorStop(0, 'rgba(3,4,11,.7)'); sc.addColorStop(1, 'rgba(3,4,11,0)'); g.fillStyle = sc; g.fillRect(0, 0, W, 96); // scrim so the HUD reads over busy space
      const bw = W - 88; // 16px left gutter, ends at W-72: clear of the kit's pause button
      g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 16, 16, bw, 12, 6); g.fill();
      const hf = Math.max(0, R.hp / s.hull); g.fillStyle = hf < 0.3 ? '#ff6b6b' : hf < 0.6 ? '#ffd166' : '#7bd389'; rr(g, 16, 16, Math.max(0, bw * hf), 12, 6); g.fill();
      g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 16, 32, bw, 6, 3); g.fill();
      g.fillStyle = '#4cc9f0'; rr(g, 16, 32, bw * Math.min(1, R.xp / R.need), 6, 3); g.fill();
      g.font = '800 14px Nunito, system-ui'; g.textBaseline = 'alphabetic';
      g.textAlign = 'left'; g.fillStyle = '#fff'; g.fillText(`Hull ${Math.ceil(R.hp)}/${Math.round(s.hull)}`, 16, 60);
      g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,.75)'; g.fillText(`${Math.floor(R.t)}s`, W / 2 + 22, 60);
      g.fillStyle = '#7bf1a8'; g.fillText(`${env.fmt(R.salv * s.value)} salvage`, W - 16, 60);
      // row 2: streak (left) and shards (right); always in place, dim when idle
      g.textAlign = 'left'; g.fillStyle = R.streak >= 5 ? '#ffd166' : 'rgba(255,255,255,.35)'; g.fillText(`Streak x${R.streak}`, 16, 80);
      g.textAlign = 'right'; g.fillStyle = R.shards ? '#e0aaff' : 'rgba(224,170,255,.4)'; g.fillText(`${R.shards} void shard${R.shards === 1 ? '' : 's'}`, W - 16, 80);
      if (s.shield) { g.textAlign = 'left'; g.fillStyle = R.shieldUp ? '#90e0ef' : 'rgba(144,224,239,.4)'; g.fillText(R.shieldUp ? 'Deflector ready' : `Deflector ${Math.ceil(R.shieldT)}s`, 120, 80); }
      // row 3 (reserved): boss bar / countdown
      if (B && B.hp > 0) {
        g.textAlign = 'center'; g.fillStyle = '#f72585'; g.font = '400 16px "Lilita One", system-ui'; g.fillText(B.phase === 2 ? 'VOID LEVIATHAN · FRENZY' : 'VOID LEVIATHAN', W / 2, 102);
        g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, 24, 108, W - 48, 10, 5); g.fill();
        const bg2 = g.createLinearGradient(24, 0, W - 24, 0); bg2.addColorStop(0, '#f72585'); bg2.addColorStop(1, '#b5179e');
        g.fillStyle = bg2; rr(g, 24, 108, (W - 48) * Math.max(0, B.hp / B.max), 10, 5); g.fill();
        g.fillStyle = '#fff'; g.fillRect(W / 2 - 1, 106, 2, 14); // phase-two notch at half health
      } else if (env.boss && !B && R.t > BOSS_AT - 10) {
        g.textAlign = 'center'; g.fillStyle = Math.floor(R.t * 3) % 2 ? '#f72585' : '#ff8fab'; g.font = '400 20px "Lilita One", system-ui'; g.fillText(`Something huge stirs… ${Math.ceil(BOSS_AT - R.t)}`, W / 2, 108);
      } else if (env.boss && !B && R.t < 5 && R.lead <= 0) {
        g.textAlign = 'center'; g.fillStyle = '#ff8fab'; g.font = '800 15px Nunito, system-ui'; g.fillText(`The Leviathan comes at ${BOSS_AT}s. Survive!`, W / 2, 108);
      } else if (storm() > 0 && !R.ending) {
        g.textAlign = 'center'; g.fillStyle = '#c77dff'; g.font = '400 18px "Lilita One", system-ui'; g.fillText('VOID STORM: hull failing', W / 2, 108);
      }
    }
    // banners: one reserved slot a third of the way down; nothing else moves for them
    function drawBanner(g) {
      let title = null, sub = '', col = '#fff', k = 1;
      if (R.lead > 0) { title = R.lead > LEAD * 0.45 ? 'Ready…' : 'Go!'; col = '#4cc9f0'; sub = R.lead > LEAD * 0.45 ? '' : ''; }
      else if (R.banner) { const b = R.banner; title = b.title; sub = b.sub; col = b.col; k = Math.min(1, b.t * 5, (b.dur - b.t) * 3); }
      if (!title) return;
      const y = H * 0.27;
      g.globalAlpha = Math.max(0, k);
      g.fillStyle = 'rgba(5,6,15,.55)'; g.fillRect(0, y - 40, W, sub ? 78 : 58);
      g.textAlign = 'center'; g.fillStyle = col; g.font = `400 ${title.length > 14 ? 30 : 36}px "Lilita One", system-ui`; g.fillText(title, W / 2 + (1 - k) * 30, y, W - 32);
      if (sub) { g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '800 14px Nunito, system-ui'; g.fillText(sub, W / 2, y + 26, W - 32); }
      g.globalAlpha = 1;
    }
    function drawWell(g, z) {
      const k = z.str, r = z.r * 2.4;
      const wg = g.createRadialGradient(z.x, z.y, 4, z.x, z.y, r); wg.addColorStop(0, `rgba(0,0,0,${0.95 * k})`); wg.addColorStop(0.25, `rgba(60,20,110,${0.6 * k})`); wg.addColorStop(1, 'rgba(60,20,110,0)');
      g.fillStyle = wg; g.beginPath(); g.arc(z.x, z.y, r, 0, TAU); g.fill();
      g.strokeStyle = `rgba(179,136,255,${0.6 * k})`; g.lineWidth = 2;
      for (let i = 0; i < 4; i++) { const a = -z.t * 3 + i * TAU / 4; g.beginPath(); g.arc(z.x, z.y, z.r * (0.6 + i * 0.35), a, a + 1.6); g.stroke(); }
      g.fillStyle = '#000'; g.beginPath(); g.arc(z.x, z.y, 16 * k + 4, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,214,255,${k})`; g.lineWidth = 2; g.stroke();
    }
    function drawEnemy(g, e) {
      g.save(); g.translate(e.x, e.y);
      const fl = e.flash > 0;
      if (e.elite) { // rotating gold halo
        g.save(); g.rotate(R.t * 2); g.strokeStyle = 'rgba(255,209,102,.85)'; g.lineWidth = 2.5; g.beginPath();
        for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, rr2 = i % 2 ? e.r * 1.45 : e.r * 1.7; g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } g.closePath(); g.stroke(); g.restore();
        g.fillStyle = 'rgba(255,209,102,.14)'; g.beginPath(); g.arc(0, 0, e.r * 1.9, 0, TAU); g.fill();
      }
      if (e.k === 'rock' || e.k === 'crystal') {
        g.rotate(e.rot);
        const cr = e.k === 'crystal';
        if (cr) { g.fillStyle = 'rgba(199,125,255,.22)'; g.beginPath(); g.arc(0, 0, e.r * 1.6, 0, TAU); g.fill(); }
        const rg = g.createRadialGradient(-e.r * 0.35, -e.r * 0.35, e.r * 0.1, 0, 0, e.r);
        rg.addColorStop(0, cr ? '#b06cf0' : '#9a8b7a'); rg.addColorStop(1, cr ? '#4a1680' : '#4a4038');
        g.fillStyle = fl ? '#fff' : rg; g.beginPath();
        e.shape.forEach((k, i) => { const a = i / e.shape.length * TAU; g.lineTo(Math.cos(a) * e.r * k, Math.sin(a) * e.r * k); }); g.closePath(); g.fill();
        g.strokeStyle = cr ? '#e0aaff' : '#b8a78f'; g.lineWidth = 1.5; g.stroke();
        if (!fl) {
          g.fillStyle = cr ? '#e0aaff' : 'rgba(40,32,26,.6)';
          for (const [cx, cy, cr2] of e.craters) { g.beginPath(); g.arc(cx * e.r, cy * e.r, cr2 * e.r, 0, TAU); g.fill(); }
          if (cr) { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -e.r * 0.5); g.lineTo(e.r * 0.15, 0); g.lineTo(0, e.r * 0.3); g.lineTo(-e.r * 0.15, 0); g.fill(); }
        }
      } else if (e.k === 'drone') {
        g.fillStyle = e.brood ? 'rgba(114,239,221,.2)' : 'rgba(255,107,107,.18)'; g.beginPath(); g.arc(0, 0, e.r * 1.7, 0, TAU); g.fill();
        const dg = g.createRadialGradient(-e.r * 0.3, -e.r * 0.3, 1, 0, 0, e.r); dg.addColorStop(0, e.brood ? '#72efdd' : '#ff6b6b'); dg.addColorStop(1, e.brood ? '#16425b' : '#9d0208');
        g.fillStyle = fl ? '#fff' : dg; g.beginPath(); g.ellipse(0, 0, e.r, e.r * 0.8, 0, 0, TAU); g.fill();
        g.strokeStyle = e.elite ? '#ffd166' : '#ffd166aa'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, 0, e.r * 1.35, e.r * 0.45, Math.sin(R.t * 3 + e.x) * 0.3, 0, TAU); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, e.r * 0.42, 0, TAU); g.fill();
        g.fillStyle = '#111'; g.beginPath(); g.arc(Math.cos(e.rot) * 2.5, Math.sin(e.rot) * 2.5, e.r * 0.2, 0, TAU); g.fill();
      } else if (e.k === 'lancer') {
        if (e.mode === 'aim') { g.save(); g.rotate(e.dashA); const k = 1 - Math.max(0, e.modeT) / 0.85; g.strokeStyle = `rgba(255,77,109,${0.25 + 0.5 * k})`; g.lineWidth = 2 + 4 * k; g.setLineDash([10, 8]); g.beginPath(); g.moveTo(e.r, 0); g.lineTo(300, 0); g.stroke(); g.setLineDash([]); g.restore(); }
        g.rotate(e.rot);
        const lg = g.createLinearGradient(-e.r, 0, e.r * 1.4, 0); lg.addColorStop(0, '#9c4a00'); lg.addColorStop(1, '#ffb347');
        g.fillStyle = fl ? '#fff' : lg; g.beginPath(); g.moveTo(e.r * 1.5, 0); g.lineTo(-e.r, -e.r * 0.85); g.lineTo(-e.r * 0.45, 0); g.lineTo(-e.r, e.r * 0.85); g.closePath(); g.fill();
        g.strokeStyle = '#ffd166'; g.lineWidth = 1.5; g.stroke();
        g.fillStyle = e.mode === 'aim' ? '#ff4d6d' : '#fff'; g.beginPath(); g.arc(e.r * 0.35, 0, 3.5, 0, TAU); g.fill();
        if (e.mode === 'dash') { g.fillStyle = 'rgba(255,159,28,.5)'; g.beginPath(); g.moveTo(-e.r * 0.6, -5); g.lineTo(-e.r * 2.6, 0); g.lineTo(-e.r * 0.6, 5); g.fill(); }
      } else if (e.k === 'wreck') {
        g.rotate(e.rot);
        const wg = g.createLinearGradient(-e.r, -e.r, e.r, e.r); wg.addColorStop(0, e.gold ? '#ffe08a' : '#7d8ea3'); wg.addColorStop(1, e.gold ? '#9c6b00' : '#2f3a4a');
        g.fillStyle = fl ? '#fff' : wg; g.beginPath(); [[-1.1, -0.45], [0.6, -0.55], [1.15, -0.1], [0.9, 0.5], [-0.2, 0.55], [-0.5, 0.3], [-1.2, 0.35]].forEach(([px, py]) => g.lineTo(px * e.r, py * e.r)); g.closePath(); g.fill();
        g.strokeStyle = e.gold ? '#fff3c4' : '#c9d6e3'; g.lineWidth = 1.5; g.stroke();
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.moveTo(-0.3 * e.r, -0.5 * e.r); g.lineTo(-0.3 * e.r, 0.5 * e.r); g.moveTo(0.3 * e.r, -0.5 * e.r); g.lineTo(0.3 * e.r, 0.5 * e.r); g.stroke();
        g.fillStyle = Math.floor(R.t * 2 + e.x) % 2 ? '#7bf1a8' : '#1b4332'; g.beginPath(); g.arc(0.85 * e.r, 0, 3, 0, TAU); g.fill();
        g.fillStyle = '#ff6b6b'; g.beginPath(); g.arc(-0.9 * e.r, 0, 2.5, 0, TAU); g.fill();
        g.rotate(-e.rot); if (e.hp < e.max) { g.strokeStyle = 'rgba(123,241,168,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, e.r + 8, -1.57, -1.57 + TAU * e.hp / e.max); g.stroke(); }
      } else {
        g.rotate(e.rot);
        g.fillStyle = 'rgba(247,37,133,.2)'; g.beginPath(); g.arc(0, 0, e.r * 1.6, 0, TAU); g.fill();
        const hg = g.createRadialGradient(0, 0, 2, 0, 0, e.r * 1.1); hg.addColorStop(0, '#f72585'); hg.addColorStop(1, '#5a0a4a');
        g.fillStyle = fl ? '#fff' : hg; g.beginPath();
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + R.t, rr2 = i % 2 ? e.r * 0.65 : e.r * 1.1; g.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); } g.closePath(); g.fill();
        g.fillStyle = '#ffd6e8'; g.beginPath(); g.arc(0, 0, e.r * 0.42, 0, TAU); g.fill();
        g.fillStyle = '#240046'; g.beginPath(); g.arc(e.r * 0.15, 0, e.r * 0.2, 0, TAU); g.fill();
      }
      g.restore();
      if ((e.k === 'hunter' || e.elite) && e.hp < e.max) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3; g.beginPath(); g.arc(e.x, e.y, e.r + 7, -1.57, -1.57 + TAU * e.hp / e.max); g.stroke(); }
    }
    function drawBoss(g, B) {
      const fl = B.flash > 0, red = B.phase === 2;
      if (B.mode === 'aim') { const h = B.segs[0], k = 1 - Math.max(0, B.modeT) / 0.9; g.save(); g.translate(h.x, h.y); g.rotate(B.dashA); g.fillStyle = `rgba(255,77,109,${0.12 + 0.25 * k})`; g.fillRect(0, -34, 520, 68); g.strokeStyle = `rgba(255,77,109,${0.5 + 0.5 * k})`; g.lineWidth = 2; g.setLineDash([14, 10]); g.strokeRect(0, -34, 520, 68); g.setLineDash([]); g.restore(); }
      for (let i = B.segs.length - 1; i >= 1; i--) {
        const q = B.segs[i], p = B.segs[i - 1], a = Math.atan2(p.y - q.y, p.x - q.x);
        g.save(); g.translate(q.x, q.y); g.rotate(a);
        const sg = g.createRadialGradient(0, -q.r * 0.3, 2, 0, 0, q.r * 1.1); sg.addColorStop(0, red ? '#3a5f80' : '#2a6f97'); sg.addColorStop(1, i % 2 ? '#0b2e45' : '#092235');
        g.fillStyle = fl ? '#fff' : sg; g.beginPath(); g.ellipse(0, 0, q.r * 1.1, q.r, 0, 0, TAU); g.fill();
        g.strokeStyle = red ? '#ff4d6d' : '#72efdd'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, q.r * 0.8, -1.2, 1.2); g.stroke();
        const fin = 1 + Math.sin(R.t * 6 - i * 0.6) * 0.18;
        g.fillStyle = '#f72585'; g.beginPath(); g.moveTo(-q.r * 0.3, -q.r); g.lineTo(q.r * 0.2, -q.r * 1.5 * fin); g.lineTo(q.r * 0.4, -q.r * 0.9); g.fill();
        g.beginPath(); g.moveTo(-q.r * 0.3, q.r); g.lineTo(q.r * 0.2, q.r * 1.5 * fin); g.lineTo(q.r * 0.4, q.r * 0.9); g.fill();
        g.fillStyle = red ? '#ff4d6d' : '#72efdd'; g.beginPath(); g.arc(0, 0, 3 + Math.sin(R.t * 5 + i) * 1.5, 0, TAU); g.fill();
        g.restore();
      }
      const h = B.segs[0], jaw = (B.mode === 'dash' ? 0.6 : 0.35) + Math.sin(R.t * 6) * 0.2;
      g.save(); g.translate(h.x, h.y); g.rotate(B.a);
      const glow = g.createRadialGradient(0, 0, 4, 0, 0, h.r * 2); glow.addColorStop(0, red ? 'rgba(255,77,109,.45)' : 'rgba(247,37,133,.3)'); glow.addColorStop(1, 'rgba(247,37,133,0)');
      g.fillStyle = glow; g.beginPath(); g.arc(0, 0, h.r * 2, 0, TAU); g.fill();
      g.fillStyle = fl ? '#fff' : '#0b2e45';
      for (const sgn of [-1, 1]) { g.save(); g.rotate(sgn * jaw); g.beginPath(); g.moveTo(-h.r * 0.6, 0); g.quadraticCurveTo(h.r * 0.6, sgn * h.r * 1.1, h.r * 1.5, sgn * h.r * 0.15); g.lineTo(-h.r * 0.2, sgn * h.r * 0.2); g.closePath(); g.fill(); g.fillStyle = '#fff'; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(h.r * (0.4 + k * 0.3), sgn * h.r * 0.25); g.lineTo(h.r * (0.5 + k * 0.3), sgn * h.r * 0.05); g.lineTo(h.r * (0.6 + k * 0.3), sgn * h.r * 0.22); g.fill(); } g.fillStyle = fl ? '#fff' : '#0b2e45'; g.restore(); }
      const hg = g.createRadialGradient(-h.r * 0.4, -h.r * 0.3, 2, -h.r * 0.2, 0, h.r); hg.addColorStop(0, '#3a86b0'); hg.addColorStop(1, '#123552');
      g.fillStyle = fl ? '#fff' : hg; g.beginPath(); g.ellipse(-h.r * 0.2, 0, h.r, h.r * 0.85, 0, 0, TAU); g.fill();
      g.fillStyle = red ? '#ff4d6d' : '#f72585'; g.beginPath(); g.arc(h.r * 0.25, -h.r * 0.4, 5.5, 0, TAU); g.arc(h.r * 0.25, h.r * 0.4, 5.5, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(h.r * 0.3, -h.r * 0.42, 2, 0, TAU); g.arc(h.r * 0.3, h.r * 0.38, 2, 0, TAU); g.fill();
      g.restore();
    }
    function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  }

  const mod = (a, m) => ((a % m) + m) % m;
  const STARS = [{ f: 0.08, z: 1, c: 'rgba(255,255,255,.35)', n: 60 }, { f: 0.25, z: 1.5, c: 'rgba(200,220,255,.6)', n: 34 }, { f: 0.6, z: 2.2, c: '#fff', n: 16 }];
  for (const L of STARS) { L.s = []; for (let i = 0; i < L.n; i++) L.s.push([rnd() * 600, rnd() * 600]); }
  const NEB = [[200, 300, 320, 'rgba(76,201,240,.13)', 0.04], [900, 1100, 380, 'rgba(199,125,255,.12)', 0.05], [600, 600, 260, 'rgba(247,37,133,.08)', 0.06]];

  function drawShip(g, who, x, y, a, sc, thrust, t) {
    const C = who === 'wing' ? { c: '#90e0ef', d: '#3a7ca5', c2: '#1b263b', fl: '#90e0ef' } : SHIPS[who] || SHIPS.wasp;
    g.save(); g.translate(x, y); g.rotate(a + Math.PI / 2); g.scale(sc, sc);
    // engine glow + flame
    const fl = 6 + thrust * 14 + Math.sin(t * 40) * 2;
    const eg = g.createRadialGradient(0, 12, 1, 0, 12, 16 + fl * 0.6); eg.addColorStop(0, C.fl + 'aa'); eg.addColorStop(1, C.fl + '00');
    g.fillStyle = eg; g.beginPath(); g.arc(0, 12, 16 + fl * 0.6, 0, TAU); g.fill();
    g.fillStyle = C.fl; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(-5, 10); g.lineTo(0, 10 + fl); g.lineTo(5, 10); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-2.5, 10); g.lineTo(0, 10 + fl * 0.5); g.lineTo(2.5, 10); g.fill(); g.globalAlpha = 1;
    g.lineJoin = 'round'; g.strokeStyle = '#0b0a12'; g.lineWidth = 2.5;
    const body = g.createLinearGradient(-16, 0, 16, 0); body.addColorStop(0, C.d); body.addColorStop(0.45, C.c); body.addColorStop(1, C.d);
    if (who === 'bulwark') {
      g.fillStyle = body; g.beginPath(); [[0, -16], [13, -8], [17, 8], [8, 13], [-8, 13], [-17, 8], [-13, -8]].forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#5a7d8c'; g.fillRect(-15, 2, 7, 8); g.fillRect(8, 2, 7, 8);
      g.fillStyle = C.c2; rrect(g, -4, -9, 8, 9, 3); g.fill();
      g.fillStyle = '#fff8'; g.fillRect(-2, -8, 2, 4);
    } else if (who === 'phantom') {
      g.fillStyle = 'rgba(114,239,221,.25)'; g.beginPath(); g.arc(0, 0, 16 + Math.sin(t * 3) * 1.5, 0, TAU); g.fill();
      g.fillStyle = body; g.beginPath(); g.moveTo(0, -19); g.quadraticCurveTo(18, -2, 13, 14); g.quadraticCurveTo(0, 4, -13, 14); g.quadraticCurveTo(-18, -2, 0, -19); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = C.c2; g.beginPath(); g.moveTo(0, -11); g.lineTo(4, 0); g.lineTo(0, 4); g.lineTo(-4, 0); g.closePath(); g.fill();
    } else if (who === 'wrecker') {
      g.fillStyle = body; g.beginPath(); [[-6, -17], [6, -17], [16, -4], [16, 10], [6, 14], [-6, 14], [-16, 10], [-16, -4]].forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffd166'; for (let i = -1; i <= 1; i += 2) { g.beginPath(); g.moveTo(i * 16, -2); g.lineTo(i * 22, 3); g.lineTo(i * 16, 8); g.fill(); }
      g.fillStyle = C.c2; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); g.strokeStyle = '#ffd166'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.stroke();
      g.fillStyle = '#90e0ef'; g.beginPath(); g.ellipse(0, -10, 4, 2.5, 0, 0, TAU); g.fill();
    } else {
      g.fillStyle = body; g.beginPath(); [[0, -19], [6, -5], [15, 8], [5, 6], [0, 12], [-5, 6], [-15, 8], [-6, -5]].forEach(([px, py]) => g.lineTo(px, py)); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = C.c2; g.fillRect(-5, 0, 10, 2.5); g.fillRect(-4, 4.5, 8, 2.5);
      g.fillStyle = '#4cc9f0'; g.beginPath(); g.ellipse(0, -7, 2.8, 4.5, 0, 0, TAU); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(-0.8, -8.5, 0.9, 1.6, 0, 0, TAU); g.fill();
    }
    g.restore();
  }
  function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  function drawFace(g, who, x, y, r) {
    const bg = g.createRadialGradient(x - r * 0.4, y - r * 0.5, 2, x, y, r * 1.25); bg.addColorStop(0, '#1b2250'); bg.addColorStop(1, '#05060f');
    g.fillStyle = bg; g.beginPath(); g.arc(x, y, r * 1.25, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 9; i++) g.fillRect(x + Math.cos(i * 2.4) * r * (0.4 + (i % 3) * 0.25), y + Math.sin(i * 2.4) * r * (0.4 + (i % 3) * 0.25), 1.5, 1.5);
    if (who === 'wrecker') { // ship with its ball swung out on the chain
      const bx = x + r * 0.75, by = y + r * 0.55;
      g.strokeStyle = '#9a8c98'; g.lineWidth = 2; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(x - r * 0.15, y - r * 0.1); g.lineTo(bx, by); g.stroke(); g.setLineDash([]);
      const bgr = g.createRadialGradient(bx - 3, by - 3, 1, bx, by, r * 0.3); bgr.addColorStop(0, '#9aa5b1'); bgr.addColorStop(1, '#2b2d42');
      g.fillStyle = bgr; g.beginPath(); g.arc(bx, by, r * 0.3, 0, TAU); g.fill();
      drawShip(g, who, x - r * 0.2, y - r * 0.15, -Math.PI / 2, r / 21, 0.6, 0.3);
      return;
    }
    drawShip(g, who, x, y + 2, -Math.PI / 2, r / 17, 0.6, 0.3);
  }

  function baseStats(who) {
    const s = { hull: 24, speed: 175, armor: 0, dmg: 1, rate: 1, magnet: 75, value: 1, wlvl: 0, spread: 0, pierce: 0, regen: 0, shardLuck: 1, headStart: 0,
      poolBlades: 0, poolMissiles: 0, poolNova: 0, poolBeam: 0, poolWing: 0, weapon: 'pulse', blink: 0, blinkCD: 2.4, blinkDist: 95, rift: 0, reactive: 0,
      crit: 0, streakPay: 0, xpMul: 1, choices: 3, shield: 0, bounty: 1, wrecks: 1, evo: 0, beamDmg: 1, beamJump: 0, wingStart: 0, wingRate: 1, spin: 1,
      trail: 0, ram: 0, echo: 0, ballDmg: 1, ballR: 13, chain: 66, chainDmg: 0 };
    if (who === 'wasp') { s.speed = 200; s.hull = 18; }
    if (who === 'bulwark') { s.speed = 140; s.hull = 26; s.armor = 0.12; s.weapon = 'flak'; }
    if (who === 'phantom') { s.speed = 170; s.hull = 17; s.weapon = 'laser'; s.blink = 1; }
    if (who === 'wrecker') { s.speed = 185; s.hull = 34; s.armor = 0.12; s.weapon = 'flail'; s.value = 1.25; s.chain = 76; s.ballR = 15; }
    return s;
  }

  // in-run styles: the phantom's blink button (kit draws the pause button and the pick cards)
  const STYLE = `<style>
    #k-ui .vd-bar{width:fit-content;margin:0 0 14px auto;pointer-events:none}
    .vd-blink{pointer-events:auto;position:relative;width:76px;height:76px;border-radius:50%;border:0;padding:0;background:#160c28d9;color:#e0aaff;display:grid;place-items:center;opacity:.6;transition:opacity .15s,transform .08s;touch-action:none}
    .vd-blink.ready{opacity:1;color:#fff;box-shadow:0 0 18px #c77dff88}
    .vd-blink:active{transform:scale(.94)}
    .vd-ring{position:absolute;inset:0;border-radius:50%;background:conic-gradient(#c77dff calc(var(--k,1)*360deg),#ffffff22 0);-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 6px),#000 calc(100% - 5px));mask:radial-gradient(farthest-side,transparent calc(100% - 6px),#000 calc(100% - 5px))}
    .vd-bl{font:400 18px var(--display);letter-spacing:.02em}
  </style>`;

  const CONFIG = {
    id: 'void-drifter', title: 'Void Drifter', tagline: 'Drift through an asteroid field, let your guns do the shooting, haul salvage home, and lure out the Void Leviathan.',
    howTo: 'Drag anywhere to steer (the stick starts where you touch). Weapons aim and fire on their own. Fly over green salvage; every few pickups pick a boost. Hull at zero ends the run.',
    runVerb: 'Launch!', winTitle: 'Leviathan slain!', loseTitle: 'Hull destroyed', scoreName: 'seconds survived',
    colors: { accent: '#4cc9f0', bg: '#0b0d1a', card: '#18203a' },
    currencies: [{ id: 'salvage', name: 'salvage', color: '#7bf1a8' }, { id: 'shards', name: 'void shards', color: '#e0aaff' }],
    characters: [
      { id: 'wasp', name: 'Wasp', blurb: 'Fast and fragile. Rapid pulse cannon.', unlock: 0 },
      { id: 'bulwark', name: 'Bulwark', blurb: 'Slow, tanky, armored. Flak shotgun.', unlock: 1 },
      { id: 'phantom', name: 'Phantom', blurb: 'Piercing lasers. Tap Blink to dash.', unlock: 2 },
      { id: 'wrecker', name: 'Wrecker', blurb: 'No guns: a wrecking ball on a chain. +25% salvage.', unlock: 3 },
    ],
    drawFace, nodes: NODES, baseStats, createRun,
  };
  if (typeof module !== 'undefined') module.exports = { NODES, PICKS, CONFIG, createRun, baseStats, BOSS_AT, BOSS_HP, STORM_AT };
  if (HAS_DOM && typeof Kit !== 'undefined') {
    document.head.insertAdjacentHTML('beforeend', STYLE);
    window.VoidDrifter = { NODES, PICKS, createRun, BOSS_HP, BOSS_AT, baseStats };
    window.VoidDrifter.kit = Kit.game(CONFIG);
    document.body.dataset.ready = '1';
  }
})();
