// Bonk Knight: tap (or hold) the floor's monster to bonk it, sweep up the loot it spills before it fades,
// climb the tower before your stamina runs out. Piñata-tapping loop in fantasy clothes. Kit contract: ../README.md
// The tower has four zones (Dungeon, Caverns, Inferno, Crypt), each with its own monster family and a trait that
// changes how you fight. Chests, mimics and golden goblins phase in as you climb. Three build directions in the tree:
// Flurry (combo meter), Hunter's Eye (weak spots) and the Hoard (chests, goblins, a broom familiar).
(function () {
  'use strict';
  const NODES = [
    // ---- core (ids from the first build are kept)
    { id: 'blade', name: 'Sharper Blade', icon: '🗡️', desc: '+35% damage per level', cost: 6, grow: 1.9, max: 25, req: [], x: 0, y: 0, fx: (s, l) => { s.dmg *= 1.35 ** l; } },
    { id: 'grip', name: 'Quick Grip', icon: '🧤', desc: 'Swing 9% faster per level', cost: 10, grow: 2.2, max: 8, req: ['blade'], x: 1, y: 0, fx: (s, l) => { s.swing *= 0.91 ** l; } },
    { id: 'crit', name: 'Keen Edge', icon: '🎯', desc: '+5% crit chance per level', cost: 25, grow: 2.2, max: 8, req: ['grip'], x: 2, y: 0, fx: (s, l) => { s.crit += 0.05 * l; } },
    { id: 'critdmg', name: 'Brutal Crits', icon: '💢', desc: 'Crits deal +60% more per level', cost: 70, grow: 2.3, max: 6, req: ['crit'], x: 3, y: 0, fx: (s, l) => { s.critMul += 0.6 * l; } },
    { id: 'lungs', name: 'Deep Lungs', icon: '🫁', desc: '+2s stamina per level', cost: 10, grow: 2.2, max: 6, req: ['blade'], x: -1, y: 0, fx: (s, l) => { s.st += 2 * l; } },
    { id: 'wind', name: 'Second Wind', icon: '🍃', desc: 'Each kill refills +0.8s more stamina', cost: 35, grow: 2.4, max: 6, req: ['lungs'], x: -2, y: 0, fx: (s, l) => { s.refill += 0.8 * l; } },
    { id: 'skip', name: 'Tower Map', icon: '🗺️', desc: 'Start each climb 2 floors higher', cost: 300, grow: 3, max: 4, req: ['wind'], x: -3, y: 0, fx: (s, l) => { s.skip += 2 * l; } },
    { id: 'magnet', name: 'Loot Magnet', icon: '🧲', desc: '+14px sweep radius (base 40px)', cost: 8, grow: 2.0, max: 6, req: ['blade'], x: 0, y: 1, fx: (s, l) => { s.magnet += 14 * l; } },
    { id: 'sticky', name: 'Sticky Loot', icon: '🍯', desc: 'Loot stays on the floor +0.8s longer', cost: 20, grow: 2.2, max: 5, req: ['magnet'], x: 0, y: 2, fx: (s, l) => { s.life += 0.8 * l; } },
    { id: 'purse', name: 'Fat Purse', icon: '💰', desc: '+30% coin value per level', cost: 15, grow: 2.3, max: 12, req: ['magnet'], x: -1, y: 1, fx: (s, l) => { s.value *= 1 + 0.3 * l; } },
    { id: 'pockets', name: 'Loose Pockets', icon: '👝', desc: '+25% chance of an extra coin per hit', cost: 60, grow: 2.5, max: 6, req: ['purse'], x: -1, y: 2, fx: (s, l) => { s.extra += 0.25 * l; } },
    { id: 'gemfind', name: 'Gem Finder', icon: '💎', desc: 'Gems drop 60% more often', cost: 80, grow: 2.4, max: 6, req: ['purse'], x: -2, y: 1, fx: (s, l) => { s.gem *= 1 + 0.6 * l; s.gemKill += 0.08 * l; } },
    { id: 'fire', name: 'Ember Blade', icon: '🔥', desc: '+14% chance per hit to set the monster ablaze', cost: 150, grow: 2.3, max: 6, req: ['crit'], x: 2, y: -1, fx: (s, l) => { s.fire += 0.14 * l; s.burn += 0.25 * l; } },
    { id: 'chain', name: 'Chain Lightning', icon: '⚡', desc: 'Hits arc to +1 minion or armour plate', cost: 300, grow: 2.4, max: 5, req: ['fire'], x: 2, y: -2, fx: (s, l) => { s.chain += l; } },
    // ---- stamina wing
    { id: 'flask', name: 'Flask Belt', icon: '🧪', desc: 'Kills: +10% chance to drop a +1.5s stamina flask', cost: 60, grow: 2.3, max: 4, req: ['wind'], x: -2, y: -1, fx: (s, l) => { s.flask += 0.1 * l; } },
    { id: 'salt', name: 'Troll Salt', icon: '🧂', desc: 'Caverns regen 35% slower; +15% damage there', cost: 260, grow: 2.4, max: 3, req: ['wind'], x: -3, y: -1, fx: (s, l) => { s.regen *= 0.65 ** l; s.cavDmg += 0.15 * l; } },
    // ---- the Hoard: loot, chests, goblins
    { id: 'lockpick', name: 'Lockpicks', icon: '🗝️', desc: 'Chests +4% more often; +40% chest loot', cost: 90, grow: 2.3, max: 5, req: ['gemfind'], x: -3, y: 1, fx: (s, l) => { s.chest += 0.04 * l; s.chestLoot += 0.4 * l; } },
    { id: 'goldfever', name: 'Gold Fever', icon: '🤑', desc: 'Golden goblins +4% more often, 1 bonk less', cost: 240, grow: 2.5, max: 2, req: ['lockpick'], x: -4, y: 1, fx: (s, l) => { s.gob += 0.04 * l; s.gobNeed -= l; } },
    { id: 'broom', name: 'Broom Familiar', icon: '🧹', desc: 'A broom familiar sweeps loot; faster each level', cost: 120, grow: 2.3, max: 5, req: ['sticky'], x: 0, y: 3, fx: (s, l) => { s.broom += l; } },
    { id: 'vacuum', name: 'Hoover Hex', icon: '🌪️', desc: 'On a kill, +30% chance each floor coin flies to you', cost: 500, grow: 2.6, max: 3, req: ['broom'], x: 0, y: 4, fx: (s, l) => { s.vacuum += 0.3 * l; } },
    { id: 'boots', name: 'Ember Boots', icon: '🥾', desc: 'Sweep Inferno embers for coins, not burns', cost: 700, grow: 1, max: 1, req: ['sticky'], x: -1, y: 3, fx: (s) => { s.boots = 1; } },
    // ---- Flurry: the combo build
    { id: 'flurry', name: 'Flurry', icon: '👊', desc: 'Combo meter: +1% damage per hit in a row', cost: 40, grow: 2.1, max: 5, req: ['grip'], x: 1, y: 1, fx: (s, l) => { s.comboDmg += 0.01 * l; } },
    { id: 'momentum', name: 'Momentum', icon: '🌀', desc: 'Combos last +0.2s longer between hits', cost: 70, grow: 2.3, max: 3, req: ['flurry'], x: 1, y: 2, fx: (s, l) => { s.comboWin += 0.2 * l; } },
    { id: 'rhythm', name: 'Iron Rhythm', icon: '🥁', desc: '+10 combo cap (base 20)', cost: 110, grow: 2.4, max: 4, req: ['flurry'], x: 2, y: 2, fx: (s, l) => { s.comboCap += 10 * l; } },
    { id: 'finisher', name: 'Combo Smash', icon: '💥', desc: 'Every 20th combo hit smashes for x4 (+2 per level)', cost: 260, grow: 2.4, max: 4, req: ['momentum', 'rhythm'], x: 1, y: 3, fx: (s, l) => { s.smash += l; } },
    // ---- Hunter's Eye: the weak-spot build
    { id: 'eye', name: "Hunter's Eye", icon: '👁️', desc: 'A weak spot glows: tap it for a sure crit, +20%/level', cost: 60, grow: 2.2, max: 4, req: ['crit'], x: 3, y: 1, fx: (s, l) => { s.eye = 1; s.eyeMul += 0.2 * l; } },
    { id: 'eyewide', name: 'Wide Eye', icon: '🔍', desc: 'Weak spot +6px wider, stays put 0.5s longer', cost: 100, grow: 2.3, max: 3, req: ['eye'], x: 4, y: 1, fx: (s, l) => { s.eyeR += 6 * l; s.eyeMove += 0.5 * l; } },
    { id: 'exploit', name: 'Exploit', icon: '🩻', desc: 'Weak-spot hits deal +60% per level', cost: 170, grow: 2.4, max: 5, req: ['eye'], x: 3, y: 2, fx: (s, l) => { s.eyeMul += 0.6 * l; } },
    { id: 'sunder', name: 'Sunder', icon: '🔨', desc: 'Weak-spot hits crack armour 3x, pierce shields', cost: 400, grow: 1, max: 1, req: ['exploit'], x: 4, y: 2, fx: (s) => { s.sunder = 1; } },
    { id: 'lantern', name: 'Ghostlight', icon: '🏮', desc: 'Hit faded Crypt ghosts for 50% damage per level', cost: 1200, grow: 2.5, max: 2, req: ['chain'], x: 3, y: -2, fx: (s, l) => { s.ghost += 0.5 * l; } },
    // ---- gem nodes
    { id: 'mithril', name: 'Mithril Edge', icon: '⚔️', desc: '+50% damage and 5% faster swings per level', cost: 2, grow: 1.8, max: 5, req: ['storm'], x: 2, y: -4, cur: 'gems', fx: (s, l) => { s.dmg *= 1.5 ** l; s.swing *= 0.95 ** l; } },
    { id: 'hourglass', name: 'Hourglass', icon: '⏳', desc: 'Stamina drains 8% slower per level', cost: 2, grow: 1.8, max: 5, req: ['flask'], x: -1, y: -3, cur: 'gems', fx: (s, l) => { s.drain *= 0.92 ** l; } },
    { id: 'vault', name: 'Dragon Vault', icon: '🏦', desc: '+60% coin value per level', cost: 3, grow: 1.8, max: 5, req: ['hourglass'], x: -2, y: -4, cur: 'gems', fx: (s, l) => { s.value *= 1 + 0.6 * l; } },
    { id: 'storm', name: 'Stormcaller', icon: '🌩️', desc: 'Lightning arcs +1 and strikes the monster too', cost: 3, grow: 1.9, max: 4, req: ['chain'], x: 1, y: -3, cur: 'gems', fx: (s, l) => { s.chain += l; s.storm += 0.3 * l; } },
    { id: 'midas', name: 'Midas Touch', icon: '👑', desc: 'Chests, mimics and goblins drop +1 gem', cost: 3, grow: 1.9, max: 3, req: ['goldfever'], x: -4, y: 2, cur: 'gems', fx: (s, l) => { s.midas += l; } },
    { id: 'whirl', name: 'Whirlwind', icon: '🌬️', desc: 'Combo Smashes pop minions, crack armour, may drop gems', cost: 3, grow: 1.9, max: 3, req: ['finisher'], x: 1, y: 4, cur: 'gems', fx: (s, l) => { s.whirl += l; } },
    { id: 'gemeye', name: 'Gem Eye', icon: '💠', desc: 'Weak-spot hits: +3% gem chance per level', cost: 3, grow: 1.9, max: 3, req: ['exploit'], x: 3, y: 3, cur: 'gems', fx: (s, l) => { s.eyeGem += 0.03 * l; } },
    // ---- character nodes
    { id: 'frenzy', who: 'berserker', name: 'Blood Frenzy', icon: '🩸', desc: 'Rage hits harder at low stamina; swing 4% faster', cost: 50, grow: 2.3, max: 5, req: ['blade'], x: 0, y: -1, fx: (s, l) => { s.rage += 0.5 * l; s.swing *= 0.96 ** l; } },
    { id: 'warcry', who: 'berserker', name: 'War Cry', icon: '📯', desc: 'Kills below half stamina refill +0.4s more', cost: 120, grow: 2.4, max: 4, req: ['frenzy'], x: 0, y: -2, fx: (s, l) => { s.cry += 0.4 * l; } },
    { id: 'arcane', who: 'battlemage', name: 'Arcane Torrent', icon: '🔮', desc: 'Blasts +40% stronger; charge 12% faster', cost: 50, grow: 2.3, max: 5, req: ['blade'], x: 0, y: -1, fx: (s, l) => { s.blast *= 1.4 ** l; s.chargeT *= 0.88 ** l; } },
    { id: 'overload', who: 'battlemage', name: 'Overload', icon: '🌟', desc: 'Charge 25% past full; full blasts set it ablaze', cost: 120, grow: 2.6, max: 2, req: ['arcane'], x: 0, y: -2, fx: (s, l) => { s.chargeCap += 0.25 * l; s.blastFire = 1; } },
    { id: 'shadow', who: 'rogue', name: 'Shadow Chain', icon: '🌑', desc: 'Each chained crit: +3% crit chance, +25% power', cost: 50, grow: 2.3, max: 5, req: ['blade'], x: 0, y: -1, fx: (s, l) => { s.stackCrit += 0.03 * l; s.stackMul += 0.25 * l; } },
    { id: 'pickpocket', who: 'rogue', name: 'Pickpocket', icon: '🫳', desc: 'Crits drop a coin; 5+ chains may drop gems', cost: 120, grow: 2.4, max: 4, req: ['shadow'], x: 0, y: -2, fx: (s, l) => { s.pick += l; } },
    { id: 'tempo', who: 'bard', name: 'Tempo', icon: '🎵', desc: 'Perfect window +20ms; perfect hits +30%', cost: 50, grow: 2.3, max: 5, req: ['blade'], x: 0, y: -1, fx: (s, l) => { s.beatWin += 0.02 * l; s.perfMul += 0.3 * l; } },
    { id: 'encore', who: 'bard', name: 'Encore', icon: '🎤', desc: '8 perfects in a row: every hit perfect for 2s+', cost: 120, grow: 2.4, max: 4, req: ['tempo'], x: 0, y: -2, fx: (s, l) => { s.encore += l; } },
    // ---- capstone
    { id: 'lich', name: 'Crypt Key', icon: '💀', desc: 'Next climb starts at the Lich King. Destroy him to win.', cost: 700000, grow: 1, max: 1, req: ['mithril', 'hourglass', 'vault', 'storm'], reqAll: 3, extra: { gems: 10 }, x: 0, y: -4, win: true },
  ];

  const LICH_HP = 2.5e8;
  const hpFor = (f) => Math.round(12 * 1.6 ** (f - 1));
  const coinFor = (f) => 1 + 0.25 * (f - 1);
  const MONS = [
    { name: 'Slime', c: '#6ed37f', d: '#3f9a52', eyes: 2 },
    { name: 'Goblin', c: '#9bc34a', d: '#5f7f22', ears: 1, teeth: 1 },
    { name: 'Skeleton', c: '#ece6d2', d: '#a99f86', skull: 1 },
    { name: 'Orc', c: '#5e9c55', d: '#33612e', tusks: 1, helm: 1 },
    { name: 'Troll', c: '#6e9bb5', d: '#3d6077', horns: 1, teeth: 1 },
    { name: 'Golem', c: '#9a8f80', d: '#5f564b', rock: 1, eyes: 1 },
    { name: 'Fire Imp', c: '#e0613f', d: '#9c2f1a', horns: 1, tusks: 1 },
    { name: 'Wyrm', c: '#7a68c2', d: '#46378a', horns: 1, teeth: 1, eyes: 1 },
    { name: 'Shroom', c: '#efe0c4', d: '#b89c74', cap: 1 },
    { name: 'Crystal Golem', c: '#7fb8c9', d: '#40707f', rock: 1, crystal: 1, eyes: 1 },
    { name: 'Magma Blob', c: '#6b2a1c', d: '#331109', magma: 1, teeth: 1 },
    { name: 'Ghost', c: '#e4ecf7', d: '#93a6c4', ghost: 1 },
    { name: 'Bone Knight', c: '#ece6d2', d: '#a99f86', skull: 1, helm: 1 },
    { name: 'Wraith', c: '#3b4d5e', d: '#18222c', wraith: 1, eyes: 2 },
  ];
  // the tower's zones: a monster family, a look, and a trait that changes the fight
  const ZONES = [
    { id: 'dungeon', name: 'The Dungeon', from: 1, mons: [0, 1, 2, 3], trait: '', wall: ['#1b1830', '#2d2747'], floor: ['#4a3b2f', '#2a2019'], glow: '255,170,60' },
    { id: 'caverns', name: 'Crystal Caverns', from: 9, mons: [4, 8, 5, 9], trait: 'regen', tip: 'Monsters here regenerate when you stop hitting', wall: ['#0e1d27', '#1b3a47'], floor: ['#2c3d3a', '#141f1d'], glow: '110,220,255' },
    { id: 'inferno', name: 'The Inferno', from: 17, mons: [6, 10, 7], trait: 'embers', tip: 'Embers land in the loot: don’t sweep through them', wall: ['#2a0d0b', '#4d1a10'], floor: ['#3d1f15', '#1a0b07'], glow: '255,110,40' },
    { id: 'crypt', name: 'The Crypt', from: 25, mons: [11, 12, 13], trait: 'phase', tip: 'Ghosts fade out: sweep while they’re gone', wall: ['#11191a', '#21302c'], floor: ['#25302a', '#101613'], glow: '126,255,190' },
  ];
  const zoneOf = (f) => ZONES.filter((z) => f >= z.from).pop();
  // floor gimmicks: 3 armour, 4 minions, 5 shield, then cycling; from floor 10 two at once
  function gimmicks(f) {
    const g = { armour: false, minions: false, shield: false };
    const k = ['armour', 'minions', 'shield'];
    if (f >= 3) g[k[f % 3]] = true;
    if (f >= 10) g[k[(f + 1) % 3]] = true;
    return g;
  }
  const LICH = { name: 'The Lich King', c: '#3b2b5c', d: '#1d1430' };

  function createRun(env) {
    const s = env.stats, W = env.W, H = env.H, fx = env.fx, sfx = env.sfx, rnd = Math.random, who = env.who;
    const MX = W / 2, MY = H * 0.34, MR = Math.min(W * 0.27, H * 0.16);
    const FLOOR_TOP = H * 0.62;
    const R = { t: 0, over: false, won: false, st: env.boss ? s.st * 2 : s.st, coins: 0, gems: 0, lost: 0, floor: 1 + s.skip, top: 1 + s.skip, kills: 0, M: null,
      loot: [], minions: [], slashes: [], bolts: [], embers: [], skulls: [], chest: null, gob: null, broom: s.broom ? { x: W * 0.2, y: FLOOR_TOP + 40, a: 0 } : null,
      mx: MX, my: MY, cd: 0, tapCd: 0, holdT: 0, charge: 0, chargeMax: s.chargeCap, stack: 0, trans: 0, px: null, py: null, hitOnce: false, grabbed: 0, banner: null, burnT: 0,
      seen: {}, nums: [], stop: 0, intro: env.boss ? 1.8 : 0.9, introMax: env.boss ? 1.8 : 0.9, ending: 0, cause: '', taps: [], combo: 0, bestCombo: 0, lastHit: -9, crits: 0, weakHits: 0, perfects: 0, streak: 0, encoreT: 0,
      chests: 0, mimics: 0, gobs: 0, smashes: 0, burned: 0, zone: null, might: 1, greed: 1, breath: 1,
      eye: { on: false, x: 0, y: 0, ox: 0, oy: 0, next: 0, pop: 0 }, beat: who === 'bard' ? { dt: s.beat, next: 0.6, k: 0, flash: -1 } : null };
    const num = (x, y, str, c, size) => R.nums.push({ x, y, s: str, c, size, t: R.t, vx: (rnd() - 0.5) * 60 });
    const stMax = () => env.boss ? s.st * 2 : s.st + 4;
    const hitstop = (t) => { R.stop = Math.max(R.stop, t); };

    function sting(kind) {
      const T = sfx.tone; if (!T) return;
      if (kind === 'boss') { [[110, 0], [131, 0.2], [156, 0.4], [147, 0.6], [98, 0.85]].forEach(([f, d], i) => T(f, i === 4 ? 1.1 : 0.32, 'sawtooth', 0.06, 0, d)); T(55, 1.6, 'sine', 0.16, 0, 0.85); }
      else if (kind === 'phase') { [[196, 0], [185, 0.12], [175, 0.24], [165, 0.36], [82, 0.5]].forEach(([f, d], i) => T(f, i === 4 ? 0.9 : 0.16, 'square', 0.05, 0, d)); sfx.boom && sfx.boom(); }
      else if (kind === 'zone') [392, 494, 587].forEach((f, i) => T(f, 0.3, 'triangle', 0.07, 0, i * 0.09));
      else if (kind === 'jackpot') [784, 988, 1175, 1568].forEach((f, i) => T(f, 0.14, 'square', 0.04, 0, i * 0.06));
    }

    function newMonster() {
      const f = R.floor;
      R.eye.next = 0;
      if (env.boss) {
        R.M = { boss: true, name: LICH.name, type: LICH, f, hp: LICH_HP, max: LICH_HP, r: MR * 1.15, plates: platesFor(6, LICH_HP * 0.04), g: { armour: true, minions: true, shield: true },
          shieldAt: [0.75], shield: 0, sq: 0, flash: 0, born: R.t, burn: 0, minionT: 2, lastHit: 0, p2: false, skullT: 0, tpT: 0, fadeT: 0, toX: MX };
        R.zone = ZONES[3];
        banner('THE LICH KING', 'Break his armour, bonk his minions!');
        sting('boss'); fx.shake = 10;
        return;
      }
      const z = zoneOf(f), type = MONS[z.mons[(f - z.from) % z.mons.length]], g = gimmicks(f), hp = hpFor(f);
      R.M = { name: type.name, type, f, hp, max: hp, r: MR * (0.86 + Math.min(0.3, f * 0.012)), g, sq: 0, flash: 0, born: R.t, burn: 0, lastHit: R.t, trait: z.trait,
        plates: g.armour ? platesFor(2 + Math.min(3, Math.floor(f / 6)), hp * 0.14) : [], shieldAt: g.shield ? [0.55] : [], shield: 0, minionT: 0.6,
        emberT: 1.6, phaseT: 0, phased: false, regenT: 0, regenAcc: 0 };
      if (z !== R.zone) {
        const first = R.zone !== null; R.zone = z;
        if (first) { banner(z.name.toUpperCase(), z.tip || ''); sting('zone'); shrine(z); }
        else banner('FLOOR ' + f, type.name + ' · ' + z.name);
      } else {
        const tip = g.armour && !R.seen.armour ? 'Smash the armour plates!' : g.minions && !R.seen.minions ? 'Bonk the minions first!' : g.shield && !R.seen.shield ? 'Shielded? Sweep loot!' : '';
        banner('FLOOR ' + f, type.name + (tip ? ' · ' + tip : ''));
      }
      for (const k in g) if (g[k]) R.seen[k] = 1;
      if (f >= 7 && !R.gob && rnd() < s.gob) spawnGob();
    }
    function platesFor(n, hp) { return Array.from({ length: n }, (_, i) => ({ a: -0.35 + (i + 0.5) * ((Math.PI + 0.7) / n), hp, max: hp })); }
    function banner(a, b) { R.banner = { a, b, t: R.t }; }
    // a shrine between zones: one blessing for the rest of this climb
    function shrine(z) {
      if (!env.pick) return;
      env.pick('Shrine of ' + z.name.replace('The ', ''), [
        { icon: '⚔️', name: 'Might', desc: '+30% damage for this climb' },
        { icon: '🫁', name: 'Breath', desc: '+3s stamina now, kills refill 25% more' },
        { icon: '💰', name: 'Greed', desc: '+40% coin value for this climb' },
      ], (i) => { if (i === 0) R.might *= 1.3; else if (i === 1) { R.st = Math.min(stMax() + 3, R.st + 3); R.breath *= 1.25; } else R.greed *= 1.4; });
    }

    // ---- side targets: chests, mimics, the golden goblin
    function spawnChest(f) {
      const mimic = f >= 12 && rnd() < 0.3;
      R.chest = { k: 'chest', x: 60 + rnd() * (W - 120), y: FLOOR_TOP + 70 + rnd() * (H - FLOOR_TOP - 170), r: 30, hits: 0, need: 2, mimic, awake: false, t: 0, bite: 1.2, sq: 0, f };
      R.chest.y0 = R.chest.y;
      if (!R.seen.chest) { R.seen.chest = 1; fx.text(R.chest.x, R.chest.y - 50, 'TREASURE! Tap it', '#ffd166', 18); }
      sfx.ding();
    }
    function hitChest(c, x, y) {
      c.hits++; c.sq = 1; sfx.crack(); combo();
      if (c.mimic && !c.awake) {
        c.awake = true; c.need = 6 + Math.floor(c.f / 8); c.hits = 1; c.bite = 0.9;
        banner('MIMIC!', 'It bites! Bonk it fast'); fx.shake = 10; sfx.hit(); R.mimics++;
        return;
      }
      if (c.awake) { num(x, y - 20, (c.need - c.hits) + '', '#ff5d73', 20); drop(c.x, c.y - 10, 1, 'coin', 0.6, 2); }
      if (c.hits >= c.need) {
        c.dead = true; R.chests++;
        const n = Math.round((8 + c.f * 0.5) * (c.awake ? 1.6 : 1)), mul = (c.awake ? 3 : 2) * s.chestLoot;
        drop(c.x, c.y - 10, n, 'coin', 1.1, mul);
        const gems = (c.awake ? 1 : rnd() < 0.35 ? 1 : 0) + s.midas;
        if (gems) drop(c.x, c.y - 10, gems, 'gem', 0.8);
        fx.burst(c.x, c.y, 22, ['#ffd166', '#fff3b0', '#b07d18'], 260, 4.5); fx.ring(c.x, c.y, 70, '#ffd166');
        fx.text(c.x, c.y - 40, c.awake ? 'MIMIC SLAIN!' : 'TREASURE!', '#ffd166', 22); sting('jackpot'); hitstop(0.06); fx.shake = 8;
      }
    }
    function spawnGob() {
      const dir = rnd() < 0.5 ? 1 : -1;
      R.gob = { k: 'gob', x: dir > 0 ? -30 : W + 30, y: FLOOR_TOP + 80 + rnd() * (H - FLOOR_TOP - 180), vx: dir * (W + 60) / 5.2, r: 26, hits: 0, need: Math.max(3, s.gobNeed), t: 0, flash: 0 };
      R.gob.y0 = R.gob.y;
      banner('GOLDEN GOBLIN!', 'Bonk it before it escapes'); sting('jackpot');
    }
    function hitGob(gb) {
      gb.hits++; gb.flash = 1; combo(); sfx.coin(); sfx.pop(1.6);
      drop(gb.x, gb.y - 10, 2, 'coin', 0.7, 2);
      gb.vx *= -1; // it panics and doubles back
      if (gb.hits >= gb.need) {
        gb.dead = true; R.gobs++;
        drop(gb.x, gb.y - 10, 18, 'coin', 1.4, 3); drop(gb.x, gb.y - 10, 1 + s.midas, 'gem', 0.8);
        fx.burst(gb.x, gb.y, 30, ['#ffd166', '#fff3b0', '#ffe066'], 300, 5); fx.ring(gb.x, gb.y, 80, '#ffd166');
        fx.text(gb.x, gb.y - 40, 'JACKPOT!', '#ffd166', 26); sting('jackpot'); hitstop(0.08); fx.shake = 12;
      }
    }

    // ---- loot
    function drop(x, y, n, kind = 'coin', spread = 1, mul = 1) {
      const f = R.M ? R.M.f : R.floor;
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (rnd() - 0.5) * 2.6 * spread, v = 220 + rnd() * 260;
        R.loot.push({ kind, x: x + (rnd() - 0.5) * 20, y, vx: Math.cos(a) * v * 0.9, vy: Math.sin(a) * v - 60, gy: FLOOR_TOP + 18 + rnd() * (H - FLOOR_TOP - 54),
          v: kind === 'coin' ? s.value * coinFor(f) * (env.boss ? 4 : 1) * mul * R.greed : 1, t: 0, bounced: false, grab: 0, spin: rnd() * 6,
          life: s.life + (kind === 'gem' ? 2 : kind === 'flask' ? 1 : 0) });
      }
    }
    function updLoot(dt, inp) {
      const fly = [W - 70, 24];
      for (const L of R.loot) {
        L.t += dt;
        if (L.grab) { L.grab += dt; const k = Math.min(1, L.grab * 3.2); L.x += (fly[0] - L.x) * k; L.y += (fly[1] - L.y) * k; continue; }
        L.vy += 1250 * dt; L.x += L.vx * dt; L.y += L.vy * dt;
        if (L.x < 12) { L.x = 12; L.vx = Math.abs(L.vx) * 0.6; } if (L.x > W - 12) { L.x = W - 12; L.vx = -Math.abs(L.vx) * 0.6; }
        if (L.y > L.gy) { L.y = L.gy; L.bounced = true; if (Math.abs(L.vy) > 90) { L.vy = -L.vy * 0.42; L.vx *= 0.75; if (Math.abs(L.vy) > 140) sfx.tone && sfx.tone(2200 + rnd() * 600, 0.025, 'square', 0.012); } else { L.vy = 0; L.vx *= 0.85; } }
        if (inp.down && L.bounced) {
          const d = segDist(L.x, L.y, R.px ?? inp.x, R.py ?? inp.y, inp.x, inp.y);
          if (d < s.magnet) { collect(L); continue; }
          if (d < s.magnet * 2) { const dx = inp.x - L.x, dy = inp.y - L.y, m = Math.hypot(dx, dy) || 1; L.x += dx / m * 260 * dt; L.y += dy / m * 260 * dt; }
        }
        if (L.t > L.life) { L.dead = true; if (L.kind === 'coin') R.lost += L.v; }
      }
      R.loot = R.loot.filter((L) => !L.dead && !(L.grab && L.grab > 0.45));
    }
    function collect(L) {
      if (L.grab) return;
      L.grab = 0.0001; R.grabbed++;
      if (L.kind === 'gem') { R.gems += 1; sfx.ding(); fx.text(L.x, L.y - 10, '+1 gem', '#e0aaff', 18); }
      else if (L.kind === 'flask') { R.st = Math.min(stMax() + 2, R.st + 1.5); sfx.ding(); fx.text(L.x, L.y - 14, '+1.5s', '#7ae582', 20); fx.burst(L.x, L.y, 10, ['#ff5d73', '#ffb3c1', '#fff'], 140); }
      else { R.coins += L.v; sfx.coin(); }
    }
    function segDist(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
      return Math.hypot(px - ax - dx * t, py - ay - dy * t);
    }
    function updBroom(dt) {
      const B = R.broom; if (!B) return;
      const spd = 110 + 55 * s.broom; B.a += dt;
      let best = null, bd = 1e9; for (const L of R.loot) if (L.bounced && !L.grab) { const d = Math.hypot(L.x - B.x, L.y - B.y); if (d < bd) { bd = d; best = L; } }
      const tx = best ? best.x : W * 0.5 + Math.cos(B.a * 0.8) * W * 0.3, ty = best ? best.y - 6 : FLOOR_TOP + 50 + Math.sin(B.a * 1.3) * 20;
      const dx = tx - B.x, dy = ty - B.y, d = Math.hypot(dx, dy) || 1, k = Math.min(1, spd * dt / d);
      B.x += dx * k; B.y += dy * k; B.dir = dx < 0 ? -1 : 1;
      if (best && bd < 20) collect(best);
    }

    // ---- combat
    function combo() {
      R.combo++; R.lastHit = R.t; if (R.combo > R.bestCombo) R.bestCombo = R.combo;
      if ([10, 25, 50, 100, 200].includes(R.combo)) { fx.text(W / 2, H * 0.56, 'x' + R.combo + ' COMBO!', R.combo >= 50 ? '#ff9f1c' : '#ffd166', 22 + Math.min(14, R.combo / 8)); sfx.tone && sfx.tone(600 + Math.min(900, R.combo * 6), 0.12, 'triangle', 0.07, 1.5); }
    }
    function roll(force) {
      let d = s.dmg * R.might;
      if (who === 'berserker') d *= 1 + s.rage * Math.max(0, 1 - R.st / stMax());
      const cc = s.crit + (who === 'rogue' ? R.stack * s.stackCrit : 0), crit = force || rnd() < cc;
      if (crit) { d *= s.critMul + (who === 'rogue' ? R.stack * s.stackMul : 0); if (who === 'rogue') R.stack = Math.min(12, R.stack + 1); R.crits++; }
      else if (who === 'rogue') R.stack = 0;
      return { d, crit };
    }
    function targetAt(x, y) {
      for (const k of R.skulls) if (!k.dead && Math.hypot(k.x - x, k.y - y) < k.r + 18) return k;
      if (R.gob && !R.gob.dead && Math.hypot(R.gob.x - x, R.gob.y - 8 - y) < R.gob.r + 18) return R.gob;
      if (R.chest && !R.chest.dead && Math.hypot(R.chest.x - x, R.chest.y - 12 - y) < R.chest.r + 14) return R.chest;
      for (const m of R.minions) if (!m.dead && Math.hypot(m.x - x, m.y - y) < m.r + 16) return m;
      if (R.M && !R.trans && R.intro <= 0 && Math.hypot(R.mx - x, R.my - y) < R.M.r * 1.15) return R.M;
      return null;
    }
    function swing(tg, x, y, o = {}) {
      if (!R.hitOnce) { R.hitOnce = true; }
      if (tg.k === 'chest') { R.slashes.push({ x, y, a: rnd() * 6.28, t: R.t, crit: false }); hitChest(tg, x, y); return; }
      if (tg.k === 'gob') { R.slashes.push({ x, y, a: rnd() * 6.28, t: R.t, crit: true }); hitGob(tg); return; }
      if (tg.k === 'skull') { popSkull(tg); return; }
      // weak spot, beat and combo multipliers
      const weak = tg === R.M && R.eye.on && Math.hypot(x - R.eye.x, y - R.eye.y) < eyeR() + 8;
      let mult = o.mult || 1, perfect = false, smash = false;
      if (R.beat) {
        if (o.tap) {
          const prev = R.beat.next - R.beat.dt, err = Math.min(Math.abs(R.t - prev), Math.abs(R.beat.next - R.t));
          perfect = R.encoreT > 0 || err <= s.beatWin;
          if (perfect) { mult *= s.perfMul; R.perfects++; R.streak++; R.combo += 2; // the song counts: perfects build combo three at a time
            if (s.encore && R.streak >= 8 && R.encoreT <= 0) { R.encoreT = 2 + 0.6 * (s.encore - 1); R.streak = 0; banner('ENCORE!', 'Every hit is perfect'); sting('zone'); } }
          else { mult *= 0.7; R.streak = 0; }
        } else mult *= R.encoreT > 0 ? s.perfMul : 0.5;
      }
      const { d, crit } = roll(weak || o.big);
      let dm = d * mult;
      if (weak) { dm *= s.eyeMul; R.weakHits++; R.eye.next = R.t + 0.15; R.eye.pop = 1; if (s.eyeGem && rnd() < s.eyeGem) drop(x, y, 1, 'gem'); }
      if (s.comboDmg) dm *= 1 + s.comboDmg * Math.min(R.combo, s.comboCap);
      if (s.smash && tg === R.M && Math.floor((R.combo + 1) / 20) > Math.floor((R.lastSmash || 0) / 20)) { R.lastSmash = R.combo + 1; smash = true; dm *= 2 + 2 * s.smash; R.smashes++; }
      R.slashes.push({ x, y, a: rnd() * 6.28, t: R.t, crit: crit || o.big || smash, big: smash });
      if (perfect) { fx.text(x, y - 46, 'PERFECT', '#90e0ef', 16); sfx.tone && sfx.tone(1320, 0.06, 'sine', 0.05); }
      const landed = dealt(tg, dm, crit || o.big || smash, x, y, true, weak);
      if (landed) combo();
      if (smash) comboSmash(x, y, dm);
      if (s.chain) chainZap(x, y, d * 0.6 * mult);
      if (who === 'rogue' && crit && s.pick && tg.k !== 'minion') { drop(x, y, 1); if (R.stack >= 5 && rnd() < 0.005 * s.pick) drop(x, y, 1, 'gem'); }
    }
    function comboSmash(x, y, dm) {
      fx.ring(x, y, 90, '#ff9f1c'); fx.ring(x, y, 50, '#fff'); fx.text(W / 2, H * 0.53, 'COMBO SMASH!', '#ff9f1c', 26); fx.shake = 16; sfx.boom(); hitstop(0.09);
      drop(x, y, 6, 'coin', 1.3);
      if (s.whirl && R.M) {
        for (const m of R.minions) if (!m.dead) dealt(m, m.hp + 1, true, m.x, m.y);
        for (const p of R.M.plates) if (p.hp > 0) { p.hp -= p.max * 0.5; p.flash = 1; if (p.hp <= 0) plateBreak(p); }
        if (rnd() < 0.15 * s.whirl) drop(x, y, 1, 'gem');
      }
    }
    function platePos(p) { return [R.mx + Math.cos(p.a) * R.M.r * 0.75, R.my + Math.sin(p.a) * R.M.r * 0.75]; }
    function plateBreak(p) { const [px, py] = platePos(p); fx.burst(px, py, 14, ['#adb5bd', '#e9ecef', '#6c757d'], 220, 4.5); drop(px, py, 3); fx.shake = Math.max(fx.shake, 7); sfx.boom(); }
    // returns true if the hit landed (not blocked or whiffed)
    function dealt(tg, d, crit, x, y, fromSwing, weak) {
      if (tg.minion) {
        tg.hp -= d; tg.flash = 1; num(tg.x, tg.y - 14, env.fmt(Math.max(1, d)), crit ? '#ffd166' : '#fff', crit ? 20 : 15);
        sfx.pop(1.4);
        if (tg.hp <= 0 && !tg.dead) { tg.dead = true; fx.burst(tg.x, tg.y, 10, ['#b388eb', '#ffd166', '#fff'], 180); drop(tg.x, tg.y, 2, 'coin', 0.7); sfx.pop(0.7); }
        return true;
      }
      const M = tg;
      if (M.shield > 0 && !(weak && s.sunder)) { if (fromSwing) { fx.text(x, y - 20, 'BLOCKED', '#8ecae6', 16); fx.ring(R.mx, R.my, M.r * 1.3, '#8ecae6'); sfx.zap(); } return false; }
      if (M.phased || M.fadeT > 0) {
        if (!s.ghost || M.boss) { if (fromSwing) { fx.text(x, y - 20, 'WHIFF', '#c8d6e5', 16); sfx.zap(); } return false; }
        d *= s.ghost;
      }
      if (M.trait === 'regen') d *= 1 + s.cavDmg;
      M.sq = 1; M.flash = 1; M.lastHit = R.t;
      const plate = M.plates.find((p) => p.hp > 0);
      if (plate) {
        const pd = weak && s.sunder ? d * 3 : d;
        plate.hp -= pd; plate.flash = 1; sfx.crack(); num(x, y - 18, env.fmt(Math.max(1, pd)), '#ced4da', crit ? 22 : 16);
        if (plate.hp <= 0) plateBreak(plate);
        if (fromSwing) drop(x, y, 1);
        return true;
      }
      const ward = R.minions.some((m) => !m.dead);
      if (ward) d *= 0.25;
      M.hp -= d;
      num(x + (rnd() - 0.5) * 30, y - 20, env.fmt(Math.max(1, d)) + (crit ? '!' : ''), weak ? '#ff7ab6' : crit ? '#ffd166' : ward ? '#b8b8d0' : '#fff', weak ? 36 : crit ? 34 : 24);
      fx.shake = Math.max(fx.shake, crit ? 9 : 4);
      if (crit) { fx.ring(x, y, 40, weak ? '#ff7ab6' : '#ffd166'); sfx.hit(); if (weak || R.stop <= 0) hitstop(weak ? 0.05 : 0.025); }
      sfx.pop(0.6 + rnd() * 0.3);
      fx.burst(x, y, crit ? 9 : 5, [M.type.c, '#fff'], 170);
      if (fromSwing) {
        drop(x, y, 1 + (rnd() < s.extra % 1 ? 1 : 0) + Math.floor(s.extra));
        if (rnd() < s.gem) drop(x, y, 1, 'gem');
        if (s.fire && rnd() < s.fire) { if (M.burn <= 0) fx.text(R.mx, R.my - M.r - 10, 'ABLAZE', '#ff9f1c', 16); M.burn = 2.5; }
      }
      for (const a of M.shieldAt) if (M.hp / M.max < a && !M['sh' + a]) { M['sh' + a] = 1; M.shield = 2.4; sfx.zap(); banner('SHIELD UP', 'Sweep the loot while it holds!'); drop(R.mx, R.my, 6, 'coin', 1.2); }
      if (M.boss && !M.p2 && M.hp < M.max * 0.5) phase2(M);
      if (M.hp <= 0) kill();
      return true;
    }
    function chainZap(x, y, d) {
      const tg = [];
      for (const m of R.minions) if (!m.dead && tg.length < s.chain) tg.push(m);
      for (const k of R.skulls) if (!k.dead && tg.length < s.chain) tg.push(k);
      if (R.M) { const p = R.M.plates.filter((p) => p.hp > 0); for (const pl of p) if (tg.length < s.chain) tg.push(pl); }
      let ox = x, oy = y;
      for (const t of tg) {
        const [tx, ty] = t.minion || t.k === 'skull' ? [t.x, t.y] : platePos(t);
        R.bolts.push({ x0: ox, y0: oy, x1: tx, y1: ty, t: R.t }); ox = tx; oy = ty;
        if (t.minion) dealt(t, d, false, tx, ty); else if (t.k === 'skull') popSkull(t); else { t.hp -= d; t.flash = 1; if (t.hp <= 0) plateBreak(t); }
      }
      if (s.storm && R.M && R.M.shield <= 0 && !R.M.plates.some((p) => p.hp > 0)) { R.bolts.push({ x0: R.mx, y0: 0, x1: R.mx + (rnd() - 0.5) * 40, y1: R.my, t: R.t }); dealt(R.M, d * s.storm / 0.6, false, R.mx, R.my - 20); }
      if (tg.length) sfx.zap();
    }
    function blast(c) {
      const k = Math.min(R.chargeMax, c), mult = s.blast * k * k;
      fx.ring(R.mx, R.my, R.M.r * 2.2, '#9d4edd'); fx.ring(R.mx, R.my, R.M.r * 1.5, '#e0aaff'); fx.shake = 14; sfx.boom(); hitstop(0.07);
      for (const m of R.minions) if (!m.dead) dealt(m, s.dmg * mult, true, m.x, m.y);
      for (const k2 of R.skulls) if (!k2.dead) popSkull(k2);
      for (const p of R.M.plates) if (p.hp > 0) { p.hp -= s.dmg * mult * 0.5; p.flash = 1; if (p.hp <= 0) plateBreak(p); }
      if (s.blastFire && k >= 1 && R.M) { R.M.burn = 3; fx.text(R.mx, R.my - R.M.r - 10, 'ABLAZE', '#ff9f1c', 16); }
      const M = R.M;
      swing(M, R.mx, R.my, { mult, big: true });
      drop(R.mx, R.my, Math.round(3 + 5 * Math.min(1, k)), 'coin', 1.3);
    }
    function kill() {
      const M = R.M; R.kills++;
      fx.burst(R.mx, R.my, 30, [M.type.c, '#ffd166', '#fff'], 300, 5); fx.ring(R.mx, R.my, M.r * 2, '#ffd166'); fx.shake = 16; sfx.boom(); sfx.ding(); hitstop(M.boss ? 0.3 : 0.09);
      if (M.boss) { R.won = true; R.winT = R.t; drop(R.mx, R.my, 30, 'coin', 1.6); R.skulls = []; return; }
      drop(R.mx, R.my, 4 + Math.min(16, M.f), 'coin', 1.4);
      if (M.f >= 3 && rnd() < s.gemKill) drop(R.mx, R.my, 1, 'gem');
      if (s.flask && rnd() < s.flask) drop(R.mx, R.my, 1, 'flask', 0.6);
      let add = s.refill / (1 + R.kills / 6) * R.breath;
      if (who === 'berserker' && s.cry && R.st < stMax() * 0.5) add += s.cry;
      R.st = Math.min(stMax(), R.st + add); fx.text(110, 50, '+' + add.toFixed(1) + 's', '#7ae582', 18);
      if (s.vacuum) for (const L of R.loot) if (!L.grab && L.kind !== 'gem' && rnd() < s.vacuum) collect(L);
      if (M.f >= 4 && !R.chest && rnd() < s.chest) spawnChest(M.f);
      R.minions = []; R.trans = 0.9; R.M = null; R.floor++; R.top = Math.max(R.top, R.floor);
    }
    function updMinions(dt) {
      const M = R.M; if (!M || !M.g.minions || M.p2) return;
      M.minionT -= dt;
      if (M.minionT <= 0 && R.minions.filter((m) => !m.dead).length === 0) {
        M.minionT = M.boss ? 5 : 6.5;
        const n = M.boss ? 4 : 2 + Math.min(2, Math.floor(M.f / 8));
        for (let i = 0; i < n; i++) R.minions.push({ minion: true, k: 'minion', a: i / n * 6.283, r: 22, hp: hpFor(M.boss ? 16 : M.f) * 0.07, flash: 0, born: R.t, x: R.mx, y: R.my });
        sfx.pop(1.8);
      }
      for (const m of R.minions) { m.a += dt * 0.9; const rr = M.r * 1.55; m.x = R.mx + Math.cos(m.a) * rr; m.y = R.my + Math.sin(m.a) * rr * 0.55 + 10; m.flash = Math.max(0, m.flash - dt * 6); }
      R.minions = R.minions.filter((m) => !m.dead);
    }
    // ---- the Lich King's second phase: armour bursts, he blinks around the hall and lobs skull bombs at your loot
    function phase2(M) {
      M.p2 = true; M.shield = 0; M.shieldAt = []; M.r = MR * 0.95; M.tpT = 2.2; M.skullT = 1;
      for (const p of M.plates) if (p.hp > 0) { p.hp = 0; plateBreak(p); }
      for (const m of R.minions) if (!m.dead) { m.dead = true; fx.burst(m.x, m.y, 8, ['#b388eb', '#fff'], 160); }
      R.minions = [];
      banner('THE LICH UNBOUND', 'Pop his skulls, hit the green phylactery!'); sting('phase'); fx.shake = 22; hitstop(0.35);
      fx.ring(R.mx, R.my, M.r * 2.6, '#7effbe'); fx.ring(R.mx, R.my, M.r * 1.8, '#b388eb');
      drop(R.mx, R.my, 12, 'coin', 1.5);
    }
    function updBoss2(dt, M) {
      if (M.fadeT > 0) { const was = M.fadeT; M.fadeT -= dt; if (was > 0.25 && M.fadeT <= 0.25) { R.mx = M.toX; fx.burst(R.mx, R.my, 16, ['#7effbe', '#b388eb'], 200); } }
      M.tpT -= dt;
      if (M.tpT <= 0 && M.fadeT <= 0) { M.tpT = 3.4 + rnd(); M.fadeT = 0.5; const xs = [W * 0.3, W * 0.5, W * 0.7].filter((x) => Math.abs(x - R.mx) > 5); M.toX = xs[Math.floor(rnd() * xs.length)]; sfx.zap(); }
      M.skullT -= dt;
      if (M.skullT <= 0) {
        M.skullT = 1.5 + rnd() * 0.6;
        R.skulls.push({ k: 'skull', x0: R.mx, y0: R.my + 20, x: R.mx, y: R.my + 20, tx: 40 + rnd() * (W - 80), ty: FLOOR_TOP + 40 + rnd() * (H - FLOOR_TOP - 110), t: 0, dur: 2.6, r: 22 });
        sfx.tone && sfx.tone(300, 0.2, 'sawtooth', 0.04, 0.6);
      }
    }
    function popSkull(k) {
      if (k.dead) return; k.dead = true; combo();
      fx.burst(k.x, k.y, 12, ['#7effbe', '#e9e4d4', '#fff'], 200); sfx.pop(1.2); sfx.crack();
      drop(k.x, k.y, 2, 'coin', 0.7); R.st = Math.min(stMax(), R.st + 0.15);
    }
    function updSkulls(dt) {
      for (const k of R.skulls) {
        if (k.dead) continue;
        k.t += dt; const q = Math.min(1, k.t / k.dur);
        k.x = k.x0 + (k.tx - k.x0) * q; k.y = k.y0 + (k.ty - k.y0) * q - Math.sin(q * Math.PI) * 120;
        if (q >= 1) {
          k.dead = true; R.st -= 1.1; R.burned++; R.cause = 'skull'; R.causeT = R.t;
          fx.burst(k.x, k.y, 20, ['#7effbe', '#3b2b5c', '#fff'], 260, 5); fx.ring(k.x, k.y, 80, '#7effbe'); fx.text(k.x, k.y - 30, '-1.1s', '#ff5d73', 20); fx.shake = 12; sfx.boom();
          for (const L of R.loot) if (!L.grab && L.kind === 'coin' && Math.hypot(L.x - k.x, L.y - k.y) < 70) { L.dead = true; R.lost += L.v; }
        }
      }
      R.skulls = R.skulls.filter((k) => !k.dead);
    }
    // ---- zone traits
    function updTraits(dt, M, inp) {
      if (M.trait === 'regen' && M.burn <= 0 && R.t - M.lastHit > 1 && M.hp < M.max && M.shield <= 0) {
        const h = M.max * 0.05 * s.regen * dt; M.hp = Math.min(M.max, M.hp + h); M.regenAcc += h; M.regenT -= dt;
        if (M.regenT <= 0) { M.regenT = 0.45; num(R.mx + (rnd() - 0.5) * M.r, R.my - M.r * 0.6, '+' + env.fmt(Math.max(1, M.regenAcc)), '#7ae582', 15); M.regenAcc = 0; }
      }
      if (M.trait === 'embers') {
        M.emberT -= dt;
        if (M.emberT <= 0) {
          M.emberT = 2.1 + rnd() * 1.2;
          R.embers.push({ x0: R.mx, y0: R.my + M.r * 0.3, x: R.mx, y: R.my, tx: 30 + rnd() * (W - 60), ty: FLOOR_TOP + 30 + rnd() * (H - FLOOR_TOP - 80), t: 0, land: 0.65, life: 4.2 });
          sfx.tone && sfx.tone(180, 0.15, 'sawtooth', 0.03, 0.5);
        }
      }
      if (M.trait === 'phase') { M.phaseT += dt; M.phased = M.phaseT % 3.2 > 2.3; }
      for (const e of R.embers) {
        e.t += dt; const q = Math.min(1, e.t / e.land);
        e.x = e.x0 + (e.tx - e.x0) * q; e.y = e.y0 + (e.ty - e.y0) * q - Math.sin(q * Math.PI) * 90;
        if (q >= 1 && inp.down && !e.dead && segDist(e.x, e.y, R.px ?? inp.x, R.py ?? inp.y, inp.x, inp.y) < 24) {
          e.dead = true;
          if (s.boots) { const v = s.value * coinFor(R.floor) * 3 * R.greed; R.coins += v; fx.text(e.x, e.y - 18, '+' + env.fmt(v), '#ff9f1c', 18); sfx.coin(); fx.burst(e.x, e.y, 8, ['#ff9f1c', '#ffd166'], 120); }
          else { R.st -= 0.6; R.burned++; R.cause = 'ember'; R.causeT = R.t; fx.text(e.x, e.y - 18, 'OUCH -0.6s', '#ff5d73', 18); fx.burst(e.x, e.y, 12, ['#ff9f1c', '#ff5d73', '#ffe066'], 180); fx.shake = 8; sfx.hit(); }
        }
        if (e.t > e.land + e.life) e.dead = true;
      }
      R.embers = R.embers.filter((e) => !e.dead);
    }
    const eyeR = () => R.M && R.M.p2 ? 30 : s.eyeR;
    function updEye(M) {
      const E = R.eye;
      E.on = !!M && !R.trans && R.intro <= 0 && (s.eye > 0 || M.p2);
      if (!E.on) return;
      if (M.p2) { E.ox = 0; E.oy = M.r * 0.42; }
      else if (R.t >= E.next) { const a = rnd() * 6.283, d = M.r * (0.15 + rnd() * 0.45); E.ox = Math.cos(a) * d; E.oy = Math.sin(a) * d * 0.8; E.next = R.t + s.eyeMove; E.born = R.t; }
      E.x = R.mx + E.ox; E.y = R.my + E.oy; E.pop = Math.max(0, E.pop - 0.08);
    }

    newMonster();
    const run = {
      _R: R, MX, MY,
      get over() { return R.over; }, set over(v) { R.over = v; }, get t() { return R.t; },
      quit() { R.cause = 'quit'; },
      update(dt, input) {
        R.in = { x: input.x, y: input.y, down: input.down };
        if (R.over) return;
        fx.update(dt);
        if (R.ending > 0) { // the run is over: slow-mo freeze with the cause on screen, then hand over to the results
          R.ending -= dt; R.t += dt * 0.15; for (const L of R.loot) { L.t += dt * 0.15; } R.in.down = false;
          if (R.ending <= 0) { R.over = true; for (const L of R.loot) if (L.kind === 'coin' && !L.grab) R.lost += L.v; }
          return;
        }
        if (R.stop > 0) { R.stop -= dt; R.px = input.down ? input.x : null; R.py = input.down ? input.y : null; return; } // hit pause
        R.t += dt;
        if (R.won) { updLoot(dt, { ...input, down: true }); for (const L of R.loot) if (!L.grab && L.bounced) collect(L); if (R.t - R.winT > 1.6) R.over = true; return; }
        if (R.intro > 0) R.intro -= dt;
        if (R.trans > 0) { R.trans -= dt; if (R.trans <= 0) { R.trans = 0; newMonster(); } }
        else if (R.intro <= 0) R.st -= s.drain * (1 + Math.max(0, R.t - 10) / 20) * dt;
        if (R.beat) { while (R.t >= R.beat.next) { R.beat.next += R.beat.dt; R.beat.k++; R.beat.flash = R.t; sfx.tone && sfx.tone(R.beat.k % 4 ? 520 : 780, 0.05, 'triangle', 0.035); } }
        if (R.encoreT > 0) R.encoreT -= dt;
        const M = R.M;
        R.cd -= dt; R.tapCd -= dt;
        updEye(M);
        for (const tp of input.taps) {
          const tg = targetAt(tp.x, tp.y);
          if (tg && R.tapCd <= 0) { swing(tg, tp.x, tp.y, { tap: true }); R.tapCd = s.swing * 0.45; R.cd = s.swing; }
          else { R.taps.push({ x: tp.x, y: tp.y, t: R.t }); sfx.tone && sfx.tone(tg ? 700 : 420, 0.03, 'triangle', 0.025); } // a miss or a too-fast tap still answers
          R.holdT = 0;
        }
        const over = input.down ? targetAt(input.x, input.y) : null;
        if (over && R.M) {
          R.holdT += dt;
          if (who === 'battlemage' && over === R.M) { if (R.holdT > 0.22 && R.M.shield <= 0) R.charge = Math.min(R.chargeMax, R.charge + dt / s.chargeT); }
          else if (R.cd <= 0 && R.holdT > 0.1) { swing(over, input.x + (rnd() - 0.5) * 16, input.y + (rnd() - 0.5) * 16); R.cd = s.swing; }
        }
        if (R.charge > 0 && (!input.down || !over)) { if (R.charge > 0.2 && R.M) blast(R.charge); R.charge = 0; }
        if (R.trans > 0 || R.intro > 0) R.lastHit = Math.max(R.lastHit, R.t - s.comboWin * 0.5); // a combo survives the walk up the stairs
        if (R.combo && R.t - R.lastHit > s.comboWin) { if (R.combo >= 10) fx.text(W / 2, H * 0.56, 'combo x' + R.combo, '#a49eb8', 16); R.combo = 0; R.lastSmash = 0; }
        const M2 = R.M;
        if (M2 && M2.shield > 0) M2.shield -= dt;
        if (M2) {
          M2.sq = Math.max(0, M2.sq - dt * 6); M2.flash = Math.max(0, M2.flash - dt * 12);
          for (const p of M2.plates) p.flash = Math.max(0, (p.flash || 0) - dt * 8);
          if (M2.burn > 0 && M2.hp > 0) {
            M2.burn -= dt; R.burnT -= dt;
            if (R.burnT <= 0) { R.burnT = 0.4; const d = s.dmg * s.burn * 0.4 * R.might; if (!M2.plates.some((p) => p.hp > 0) && M2.shield <= 0 && !M2.phased && !(M2.fadeT > 0)) { M2.hp -= d; num(R.mx + (rnd() - 0.5) * M2.r, R.my - M2.r * 0.5, env.fmt(Math.max(1, d)), '#ff9f1c', 15); fx.burst(R.mx + (rnd() - 0.5) * M2.r, R.my, 3, ['#ff9f1c', '#ffd166'], 90); if (rnd() < 0.35) drop(R.mx, R.my, 1); if (M2.boss && !M2.p2 && M2.hp < M2.max * 0.5) phase2(M2); if (M2.hp <= 0) kill(); } }
          }
          if (R.M && !R.M.boss) updTraits(dt, R.M, input);
          if (R.M && R.M.p2) updBoss2(dt, R.M);
        }
        if (!R.M && R.embers.length) updTraits(dt, { trait: '' }, input);
        updSkulls(dt);
        if (R.chest) {
          const c = R.chest; c.t += dt; c.sq = Math.max(0, c.sq - dt * 6);
          if (c.awake) { c.bite -= dt; c.x += Math.sin(R.t * 3) * 30 * dt; if (c.bite <= 0) { c.bite = 1.3; R.st -= 0.5; R.burned++; R.cause = 'mimic'; R.causeT = R.t; fx.text(c.x, c.y - 50, 'CHOMP -0.5s', '#ff5d73', 18); fx.shake = 9; sfx.hit(); c.sq = 1.4; } }
          if (c.dead || c.t > (c.awake ? 12 : 6)) { if (!c.dead) fx.burst(c.x, c.y, 10, ['#8d6e4f', '#fff'], 120); R.chest = null; }
        }
        if (R.gob) {
          const gb = R.gob; gb.t += dt; gb.x += gb.vx * dt; gb.y = gb.y0 - Math.abs(Math.sin(gb.t * 10)) * 10; gb.flash = Math.max(0, gb.flash - dt * 6);
          if (gb.dead) R.gob = null;
          else if (gb.t > 8 || gb.x < -50 || gb.x > W + 50) { if (gb.t > 1) fx.text(Math.max(60, Math.min(W - 60, gb.x)), gb.y - 30, 'It got away!', '#a49eb8', 16); R.gob = null; }
        }
        updMinions(dt);
        updLoot(dt, input);
        updBroom(dt);
        R.px = input.down ? input.x : null; R.py = input.down ? input.y : null;
        R.nums = R.nums.filter((q) => R.t - q.t < 0.8); R.slashes = R.slashes.filter((q) => R.t - q.t < 0.18); R.bolts = R.bolts.filter((b) => R.t - b.t < 0.16); R.taps = R.taps.filter((q) => R.t - q.t < 0.25);
        if (R.st <= 0) { R.st = 0; R.ending = 1.1; R.endT = R.t; fx.shake = 10; sfx.end && sfx.end(); if (R.cause !== 'quit') R.cause = R.t - (R.causeT ?? -9) < 1.5 ? R.cause : 'breath'; }
      },
      draw(g) { drawRun(g, R, env, s, { MX, MY, W, H, FLOOR_TOP, stMax: stMax(), eyeR: eyeR() }); },
      result() {
        const zn = R.zone.name.replace('The ', 'the ');
        const bits = [`Best combo x${R.bestCombo}`];
        if (R.weakHits) bits.push(`${R.weakHits} weak-spot hits`);
        if (R.perfects) bits.push(`${R.perfects} perfects`);
        if (R.chests) bits.push(`${R.chests} chest${R.chests > 1 ? 's' : ''}`);
        if (R.gobs) bits.push(`${R.gobs} golden goblin${R.gobs > 1 ? 's' : ''}`);
        if (R.lost >= 1) bits.push(`${env.fmt(R.lost)} coins faded`);
        const lines = [env.boss ? `The Lich King had ${Math.ceil(100 * Math.max(0, R.M ? R.M.hp / R.M.max : 0))}% left${R.M && R.M.p2 ? ' (phase 2)' : ''} · ${Math.round(R.t)}s`
          : `Reached floor ${R.top} in ${zn} · ${R.kills} bonked in ${Math.round(R.t)}s`, bits.join(' · ')];
        const out = { won: R.won, earned: { coins: R.coins, gems: R.gems }, lines, score: R.top };
        if (!R.won) out.title = env.boss ? (R.cause === 'skull' ? 'Blasted by skull bombs' : 'The Lich King endures')
          : R.cause === 'quit' ? `Left on floor ${R.floor}` : R.cause === 'mimic' ? `Chomped by a mimic on floor ${R.floor}`
          : R.cause === 'ember' ? `Burned out on floor ${R.floor}` : `Out of breath on floor ${R.floor}`;
        return out;
      },
    };
    if (typeof window !== 'undefined') window.__bk = run; // debug handle
    return run;
  }

  // ---------------------------------------------------------------- drawing
  const BGS = {};
  function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); }
  function mix(a, b, k) {
    const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)), A = p(a), B = p(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
  }
  function background(W, H, FT, Z) {
    const key = Z.id + W + 'x' + H; if (BGS[key]) return BGS[key];
    const c = document.createElement('canvas'), dpr = Math.min(2, window.devicePixelRatio || 1); c.width = W * dpr; c.height = H * dpr;
    const g = c.getContext('2d'); g.scale(dpr, dpr);
    const wall = g.createLinearGradient(0, 0, 0, FT); wall.addColorStop(0, Z.wall[0]); wall.addColorStop(1, Z.wall[1]); g.fillStyle = wall; g.fillRect(0, 0, W, FT);
    let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    if (Z.id === 'dungeon' || Z.id === 'crypt') {
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
      for (let y = 0, row = 0; y < FT; y += 34, row++) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); for (let x = (row % 2) * 30; x < W; x += 60) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 34); g.stroke(); } }
      g.fillStyle = 'rgba(255,255,255,.03)'; for (let y = 0, row = 0; y < FT; y += 34, row++) for (let x = (row % 2) * 30; x < W; x += 60) g.fillRect(x + 3, y + 3, 54, 4);
      // arched window with a moon
      g.fillStyle = '#0d0b18'; g.beginPath(); g.moveTo(W / 2 - 70, FT); g.lineTo(W / 2 - 70, H * 0.2); g.arc(W / 2, H * 0.2, 70, Math.PI, 0); g.lineTo(W / 2 + 70, FT); g.fill();
      const sky = g.createLinearGradient(0, H * 0.1, 0, FT); sky.addColorStop(0, Z.id === 'crypt' ? '#0b1f1a' : '#14123a'); sky.addColorStop(1, '#0d0b18'); g.fillStyle = sky; g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 18; i++) { g.beginPath(); g.arc(W / 2 - 60 + r() * 120, H * 0.14 + r() * (FT - H * 0.18), r() * 1.3 + 0.3, 0, 6.28); g.fill(); }
      g.fillStyle = Z.id === 'crypt' ? '#cfe9dc' : '#f4ecd0'; g.beginPath(); g.arc(W / 2 + 26, H * 0.16, 16, 0, 6.28); g.fill(); g.fillStyle = Z.id === 'crypt' ? '#0b1f1a' : '#14123a'; g.beginPath(); g.arc(W / 2 + 33, H * 0.155, 14, 0, 6.28); g.fill();
      g.strokeStyle = Z.id === 'crypt' ? '#2f4a40' : '#3d3560'; g.lineWidth = 6; g.beginPath(); g.moveTo(W / 2 - 70, FT); g.lineTo(W / 2 - 70, H * 0.2); g.arc(W / 2, H * 0.2, 70, Math.PI, 0); g.lineTo(W / 2 + 70, FT); g.stroke();
      if (Z.id === 'crypt') { // tombstones and cobwebs
        g.fillStyle = '#1a2622'; for (const [x, w, h] of [[30, 34, 54], [W - 70, 40, 62], [W * 0.27, 26, 40], [W * 0.7, 28, 44]]) { rr(g, x, FT - h, w, h + 6, [w / 2, w / 2, 3, 3]); g.fill(); }
        g.strokeStyle = 'rgba(220,240,230,.18)'; g.lineWidth = 1; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0, 0); g.lineTo(70 * Math.cos(i * 0.3), 70 * Math.sin(i * 0.3)); g.stroke(); } for (let k = 1; k < 4; k++) { g.beginPath(); for (let i = 0; i < 6; i++) g.lineTo(k * 20 * Math.cos(i * 0.3), k * 20 * Math.sin(i * 0.3)); g.stroke(); }
      } else { // banners
        for (const x of [W * 0.16, W * 0.84]) { g.fillStyle = '#7a1f2b'; g.beginPath(); g.moveTo(x - 18, H * 0.08); g.lineTo(x + 18, H * 0.08); g.lineTo(x + 18, H * 0.24); g.lineTo(x, H * 0.21); g.lineTo(x - 18, H * 0.24); g.fill(); g.fillStyle = '#ffd166'; g.beginPath(); g.arc(x, H * 0.14, 6, 0, 6.28); g.fill(); }
      }
    } else if (Z.id === 'caverns') {
      for (let i = 0; i < 14; i++) { const x = r() * W, w = 14 + r() * 26, h = 30 + r() * 80; const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a141b'); gr.addColorStop(1, '#22495a'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - w / 2, 0); g.lineTo(x + w / 2, 0); g.lineTo(x, h); g.fill(); }
      for (let i = 0; i < 9; i++) { const x = r() * W, y = FT - 10 - r() * 50, h = 18 + r() * 36; g.fillStyle = `rgba(110,220,255,${0.25 + r() * 0.35})`; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + 8, y); g.lineTo(x - 8, y); g.fill(); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(x, y - h); g.lineTo(x + 2, y - h * 0.4); g.lineTo(x - 3, y); g.fill(); }
    } else { // inferno: cracked basalt and a lava glow
      g.strokeStyle = 'rgba(255,120,40,.22)'; g.lineWidth = 2;
      for (let i = 0; i < 16; i++) { let x = r() * W, y = r() * FT; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 60; y += r() * 40; g.lineTo(x, y); } g.stroke(); }
      const lg = g.createLinearGradient(0, FT - 120, 0, FT); lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(1, 'rgba(255,90,20,.35)'); g.fillStyle = lg; g.fillRect(0, FT - 120, W, 120);
    }
    // floor
    const fl = g.createLinearGradient(0, FT, 0, H); fl.addColorStop(0, Z.floor[0]); fl.addColorStop(1, Z.floor[1]); g.fillStyle = fl; g.fillRect(0, FT, W, H - FT);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 7; i++) { const y = FT + (H - FT) * (i / 7) ** 1.3; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let i = -6; i <= 6; i++) { g.beginPath(); g.moveTo(W / 2 + i * 40, FT); g.lineTo(W / 2 + i * 120, H); g.stroke(); }
    if (Z.id === 'inferno') { g.strokeStyle = 'rgba(255,140,40,.4)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { let x = r() * W, y = FT + 20 + r() * (H - FT - 40); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); } }
    const rug = g.createRadialGradient(W / 2, FT + 40, 10, W / 2, FT + 40, W * 0.6); rug.addColorStop(0, `rgba(${Z.glow},.12)`); rug.addColorStop(1, `rgba(${Z.glow},0)`); g.fillStyle = rug; g.fillRect(0, FT, W, H - FT);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, FT - 4, W, 8);
    BGS[key] = c; return c;
  }
  function torch(g, x, y, t, glow) {
    g.fillStyle = '#5b4636'; g.fillRect(x - 4, y, 8, 22); g.fillStyle = '#3e2f24'; g.fillRect(x - 7, y + 18, 14, 5);
    const f = 1 + Math.sin(t * 17 + x) * 0.12 + Math.sin(t * 7) * 0.08;
    const gl = g.createRadialGradient(x, y - 6, 2, x, y - 6, 70 * f); gl.addColorStop(0, `rgba(${glow},.38)`); gl.addColorStop(1, `rgba(${glow},0)`); g.fillStyle = gl; g.beginPath(); g.arc(x, y - 6, 70 * f, 0, 6.28); g.fill();
    g.fillStyle = `rgb(${glow})`; g.beginPath(); g.ellipse(x, y - 8, 7, 13 * f, 0, 0, 6.28); g.fill(); g.fillStyle = '#fff3c4'; g.beginPath(); g.ellipse(x, y - 5, 3.5, 7 * f, 0, 0, 6.28); g.fill();
  }
  function ambient(g, Z, W, H, FT, t) {
    // drifting motes: dust in the dungeon, sparkles in the caverns, rising embers in the inferno, fog in the crypt
    for (let i = 0; i < 16; i++) {
      const sd = i * 97.13, sp = 0.3 + (i % 5) * 0.12;
      if (Z.id === 'crypt') { const x = ((sd * 7 + t * 14 * sp) % (W + 200)) - 100, y = FT - 30 + Math.sin(i + t * 0.5) * 20 + (i % 3) * 30; const gr = g.createRadialGradient(x, y, 4, x, y, 60); gr.addColorStop(0, 'rgba(160,230,200,.09)'); gr.addColorStop(1, 'rgba(160,230,200,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 60, 0, 6.28); g.fill(); continue; }
      const up = Z.id === 'inferno', x = (sd * 13 + Math.sin(t * sp + i) * 20) % W, y = up ? FT - ((sd * 5 + t * 40 * sp) % FT) : (sd * 3 + t * 12 * sp) % FT;
      g.fillStyle = up ? `rgba(255,${120 + (i % 4) * 30},40,${0.5 + 0.3 * Math.sin(t * 5 + i)})` : Z.id === 'caverns' ? `rgba(160,235,255,${0.25 + 0.25 * Math.sin(t * 3 + i)})` : 'rgba(255,240,210,.12)';
      g.beginPath(); g.arc(x, y, up ? 2 : 1.6, 0, 6.28); g.fill();
    }
  }
  function drawRun(g, R, env, s, L) {
    const { W, H, FLOOR_TOP } = L, fx = env.fx, t = R.t, Z = R.zone || ZONES[0], MX = R.mx, MY = R.my;
    const sx = (Math.random() - 0.5) * fx.shake, sy = (Math.random() - 0.5) * fx.shake;
    g.save(); g.translate(sx, sy);
    g.drawImage(background(W, H, FLOOR_TOP, Z), 0, 0, W, H);
    if (Z.id === 'dungeon' || Z.id === 'crypt') { torch(g, 34, H * 0.3, t, Z.glow); torch(g, W - 34, H * 0.3, t, Z.glow); }
    ambient(g, Z, W, H, FLOOR_TOP, t);
    if (env.boss) { g.fillStyle = `rgba(20,0,40,${0.25 + 0.1 * Math.sin(t * 2)})`; g.fillRect(0, 0, W, H); }
    // embers (hazards) sit on the floor under the loot
    for (const e of R.embers) drawEmber(g, e, t, s.boots);
    if (R.chest) drawChest(g, R.chest, t);
    const M = R.M;
    if (M) {
      const intro = R.intro > 0 ? (R.intro / R.introMax) ** 2 * (env.boss ? 1 : 0.5) : 0;
      g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(MX, FLOOR_TOP + 14, M.r * 0.9 * (1 - intro * 0.6), 14, 0, 0, 6.28); g.fill();
      for (const m of R.minions) if (m.y < MY) drawMinion(g, m, t);
      if (R.minions.length) { g.strokeStyle = 'rgba(179,136,235,.45)'; g.lineWidth = 3; g.setLineDash([6, 6]); for (const m of R.minions) { g.beginPath(); g.moveTo(m.x, m.y); g.lineTo(MX, MY); g.stroke(); } g.setLineDash([]); }
      const alpha = M.fadeT > 0 ? Math.abs(M.fadeT - 0.25) / 0.25 : M.phased ? 0.28 + 0.08 * Math.sin(t * 20) : 1;
      g.globalAlpha = alpha;
      drawMonster(g, M, MX, MY - intro * 260, t, R.in);
      g.globalAlpha = 1;
      for (const m of R.minions) if (m.y >= MY) drawMinion(g, m, t);
      if (R.eye.on) drawEye(g, R.eye, L.eyeR, t, M.p2);
    }
    if (R.beat && M) drawBeat(g, R, MX, MY, M.r, t, s);
    for (const k of R.skulls) drawSkull(g, k, t);
    for (const l of R.loot) drawLoot(g, l, t);
    if (R.gob) drawGob(g, R.gob, t);
    if (R.broom) drawBroom(g, R.broom, t);
    // slashes + bolts
    for (const q of R.slashes) { const k = (t - q.t) / 0.18; g.strokeStyle = q.big ? `rgba(255,159,28,${1 - k})` : q.crit ? `rgba(255,209,102,${1 - k})` : `rgba(255,255,255,${1 - k})`; g.lineWidth = (q.big ? 14 : q.crit ? 9 : 6) * (1 - k) + 1; g.beginPath(); g.arc(q.x, q.y, (q.big ? 40 : 26) + k * 24, q.a, q.a + 2.2); g.stroke(); }
    for (const b of R.bolts) { g.strokeStyle = '#bde0fe'; g.lineWidth = 3; g.beginPath(); g.moveTo(b.x0, b.y0); for (let i = 1; i < 6; i++) { const k = i / 6; g.lineTo(b.x0 + (b.x1 - b.x0) * k + (Math.random() - 0.5) * 18, b.y0 + (b.y1 - b.y0) * k + (Math.random() - 0.5) * 18); } g.lineTo(b.x1, b.y1); g.stroke(); }
    for (const q of R.taps) { const k = (t - q.t) / 0.25; g.strokeStyle = `rgba(255,255,255,${0.6 * (1 - k)})`; g.lineWidth = 2; g.beginPath(); g.arc(q.x, q.y, 10 + 16 * k, 0, 6.28); g.stroke(); }
    fx.draw(g);
    g.textAlign = 'center'; g.lineJoin = 'round';
    for (const q of R.nums) { const k = (t - q.t) / 0.8, pop = 1 + Math.max(0, 0.25 - k) * 2.4; g.globalAlpha = Math.min(1, (1 - k) * 2.5); g.font = `${Math.round(q.size * pop)}px "Lilita One", system-ui`; const y = q.y - 50 * k + 40 * k * k, x = q.x + q.vx * k; g.strokeStyle = '#1b1830'; g.lineWidth = 5; g.strokeText(q.s, x, y); g.fillStyle = q.c; g.fillText(q.s, x, y); }
    g.globalAlpha = 1;
    g.restore();
    // charge orb (battlemage)
    if (R.charge > 0 && R.in) { const k = Math.min(1, R.charge), over = R.charge > 1; g.strokeStyle = over ? '#ffd166' : '#e0aaff'; g.lineWidth = 6; g.beginPath(); g.arc(R.in.x, R.in.y, 46, -1.57, -1.57 + 6.283 * k); g.stroke(); if (over) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(R.in.x, R.in.y, 54, -1.57, -1.57 + 6.283 * (R.charge - 1) / Math.max(0.01, R.chargeMax - 1)); g.stroke(); } const gr = g.createRadialGradient(R.in.x, R.in.y, 2, R.in.x, R.in.y, 20 + 30 * R.charge); gr.addColorStop(0, 'rgba(224,170,255,.9)'); gr.addColorStop(1, 'rgba(157,78,221,0)'); g.fillStyle = gr; g.beginPath(); g.arc(R.in.x, R.in.y, 20 + 30 * R.charge, 0, 6.28); g.fill(); if (k >= 1) { g.font = '800 14px Nunito, system-ui'; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText(R.charge >= R.chargeMax ? 'RELEASE!' : 'OVERLOAD…', R.in.x, R.in.y - 62); } }
    // sweep circle
    if (R.in?.down && !R.charge) { g.strokeStyle = 'rgba(255,214,102,.35)'; g.lineWidth = 2; g.beginPath(); g.arc(R.in.x, R.in.y, s.magnet, 0, 6.28); g.stroke(); }
    // low stamina vignette
    const frac = R.st / L.stMax;
    if (frac < 0.3 && !R.won) { const a = (0.3 - frac) * 1.6 * (0.7 + 0.3 * Math.sin(t * 10)); const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75); v.addColorStop(0, 'rgba(200,0,0,0)'); v.addColorStop(1, `rgba(200,0,30,${a})`); g.fillStyle = v; g.fillRect(0, 0, W, H); }
    drawHud(g, R, env, s, L, frac, M, t);
  }
  function drawHud(g, R, env, s, L, frac, M, t) {
    const { W, H, FLOOR_TOP } = L;
    // keep x > W-60 clear above y 56 for the kit's pause button
    const bw = W - 176;
    g.fillStyle = 'rgba(0,0,0,.55)'; rr(g, 14, 14, bw, 20, 10); g.fill();
    const sg = g.createLinearGradient(0, 14, 0, 34); sg.addColorStop(0, frac < 0.3 ? '#ff8fa0' : '#a6f3ac'); sg.addColorStop(1, frac < 0.3 ? '#e0405a' : '#4fbf63');
    g.fillStyle = sg; rr(g, 14, 14, Math.max(0, bw * Math.min(1, R.st / L.stMax)), 20, 10); g.fill();
    g.font = '800 12px Nunito, system-ui'; g.fillStyle = '#10251a'; g.textAlign = 'left'; g.fillText('STAMINA', 22, 29);
    g.textAlign = 'right'; g.font = '22px "Lilita One", system-ui'; g.lineJoin = 'round'; g.strokeStyle = '#1b1830'; g.lineWidth = 4;
    g.strokeText(env.fmt(R.coins), W - 86, 33); g.fillStyle = '#ffd166'; g.fillText(env.fmt(R.coins), W - 86, 33);
    coinIcon(g, W - 72, 25, 10, t);
    if (R.gems) { g.font = '18px "Lilita One", system-ui'; g.fillStyle = '#e0aaff'; g.fillText(R.gems + ' 💎', W - 86, 60); }
    g.textAlign = 'left'; g.font = '18px "Lilita One", system-ui'; g.fillStyle = '#fff';
    g.fillText(env.boss ? 'LICH KING' : 'FLOOR ' + R.floor, 16, 60);
    if (!env.boss && R.zone) { g.font = '800 12px Nunito, system-ui'; g.fillStyle = `rgb(${R.zone.glow})`; g.fillText(R.zone.name.toUpperCase(), 112, 59); }
    // one fixed slot for the character's own meter
    const hy = 82; g.font = '16px "Lilita One", system-ui';
    if (env.who === 'rogue' && R.stack > 0) { g.fillStyle = '#ffd166'; g.fillText('CRIT CHAIN x' + R.stack, 16, hy); }
    if (env.who === 'berserker' && frac < 0.5) { g.fillStyle = '#ff5d73'; g.fillText('RAGE +' + Math.round(s.rage * (1 - frac) * 100) + '%', 16, hy); }
    if (env.who === 'bard') { g.fillStyle = R.encoreT > 0 ? '#ffd166' : '#90e0ef'; g.fillText(R.encoreT > 0 ? 'ENCORE!' : 'SONG ' + R.streak + (s.encore ? '/8' : ''), 16, hy); }
    // combo meter: fixed slot on the right of the third HUD row (number right-aligned at a fixed x, label in its own slot)
    if (R.combo >= 3) {
      const k = Math.max(0, 1 - (R.t - R.lastHit) / s.comboWin), pop = 1 + Math.max(0, 0.12 - (R.t - R.lastHit)) * 2;
      g.textAlign = 'right'; g.font = `${Math.round(22 * pop)}px "Lilita One", system-ui`; g.lineWidth = 5; g.strokeStyle = '#1b1830';
      const txt = 'x' + R.combo; g.strokeText(txt, W - 16, 84); g.fillStyle = R.combo >= 50 ? '#ff9f1c' : R.combo >= 25 ? '#ffd166' : '#fff'; g.fillText(txt, W - 16, 84);
      g.fillStyle = 'rgba(0,0,0,.5)'; rr(g, W - 70, 88, 54, 4, 2); g.fill(); g.fillStyle = '#ffd166'; rr(g, W - 70, 88, 54 * k, 4, 2); g.fill();
      let lab = s.comboDmg ? `COMBO +${Math.round(100 * s.comboDmg * Math.min(R.combo, s.comboCap))}%` : 'COMBO';
      if (s.smash) { const n = (Math.floor((R.lastSmash || 0) / 20) + 1) * 20 - R.combo; lab += n <= 1 ? ' · SMASH NEXT' : ' · smash in ' + n; }
      g.font = '800 12px Nunito, system-ui'; g.fillStyle = '#ffd166'; g.fillText(lab, W - 78, 83);
    }
    if (M) {
      if (M.boss) { // boss bar across the top
        const bx = 16, bwid = W - 32, y = 100;
        g.fillStyle = 'rgba(0,0,0,.65)'; rr(g, bx, y, bwid, 16, 8); g.fill();
        const hg = g.createLinearGradient(bx, 0, bx + bwid, 0); hg.addColorStop(0, M.p2 ? '#7effbe' : '#b388eb'); hg.addColorStop(1, M.p2 ? '#2ec4b6' : '#7b2cbf');
        g.fillStyle = hg; rr(g, bx, y, bwid * Math.max(0, M.hp / M.max), 16, 8); g.fill();
        g.fillStyle = '#fff'; g.fillRect(bx + bwid * 0.5 - 1, y - 2, 2, 20);
        g.textAlign = 'center'; g.font = '800 12px Nunito, system-ui'; g.fillStyle = '#fff'; g.fillText(M.p2 ? 'THE LICH UNBOUND' : 'THE LICH KING', W / 2, y + 12);
      } else { // HP bar under the monster
        const hw = Math.min(W - 80, 240), hx = W / 2 - hw / 2, hy2 = L.MY + M.r + 30;
        g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, hx, hy2, hw, 12, 6); g.fill();
        g.fillStyle = '#ff6b6b'; rr(g, hx, hy2, hw * Math.max(0, M.hp / M.max), 12, 6); g.fill();
        const pl = M.plates.filter((p) => p.hp > 0).length; if (pl) { g.fillStyle = '#ced4da'; g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('ARMOUR ' + pl, W / 2, hy2 + 28); }
        else if (M.trait === 'regen' && R.t - M.lastHit > 1 && M.hp < M.max) { g.fillStyle = '#7ae582'; g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('REGENERATING', W / 2, hy2 + 28); }
        else if (M.phased) { g.fillStyle = '#c8d6e5'; g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('FADED: SWEEP!', W / 2, hy2 + 28); }
      }
    }
    // banner
    if (R.banner) { const k = t - R.banner.t; if (k < 2.2) { const a = Math.min(1, k * 5, (2.2 - k) * 3); g.globalAlpha = a; g.textAlign = 'center'; g.fillStyle = '#ffd166'; g.font = `${32 + Math.max(0, 1 - k * 4) * 16}px "Lilita One", system-ui`; g.strokeStyle = '#1b1830'; g.lineWidth = 6; const by = H * 0.18; g.strokeText(R.banner.a, W / 2, by); g.fillText(R.banner.a, W / 2, by); if (R.banner.b) { g.font = '800 14px Nunito, system-ui'; g.fillStyle = '#fff'; g.strokeText(R.banner.b, W / 2, by + 24); g.fillText(R.banner.b, W / 2, by + 24); } g.globalAlpha = 1; } }
    // lead-in and run end
    g.textAlign = 'center';
    if (R.intro > 0 || (R.t < R.introMax + 0.45 && !R.ending)) {
      const go = R.intro <= 0, k = go ? (R.t - R.introMax) / 0.45 : 0;
      g.globalAlpha = go ? Math.max(0, 1 - k) : Math.min(1, R.t * 4); g.font = `${go ? 44 + k * 20 : 36}px "Lilita One", system-ui`; g.lineWidth = 7; g.strokeStyle = '#1b1830';
      const txt = go ? 'BONK!' : 'READY?'; g.strokeText(txt, W / 2, FLOOR_TOP + 70); g.fillStyle = go ? '#ffd166' : '#fff'; g.fillText(txt, W / 2, FLOOR_TOP + 70); g.globalAlpha = 1;
    }
    if (R.ending > 0) {
      const k = Math.min(1, (1.1 - R.ending) * 3);
      g.fillStyle = `rgba(10,8,20,${0.55 * k})`; g.fillRect(0, 0, W, H);
      const cause = { breath: 'OUT OF BREATH', mimic: 'CHOMPED!', ember: 'BURNED OUT', skull: 'BLASTED!', quit: '' }[R.cause] || 'OUT OF BREATH';
      g.globalAlpha = k; g.font = `${40 + (1 - k) * 20}px "Lilita One", system-ui`; g.lineWidth = 7; g.strokeStyle = '#1b1830'; g.strokeText(cause, W / 2, H * 0.45); g.fillStyle = '#ff5d73'; g.fillText(cause, W / 2, H * 0.45);
      g.font = '800 15px Nunito, system-ui'; g.fillStyle = '#fff'; g.fillText(env.boss ? 'The Lich King endures…' : 'Floor ' + R.floor + ' · ' + env.fmt(R.coins) + ' coins', W / 2, H * 0.45 + 30); g.globalAlpha = 1;
    }
    // first-run hints
    if (!R.hitOnce && M && R.intro <= 0 && !R.ending) {
      const p = 0.5 + 0.5 * Math.sin(t * 6);
      g.strokeStyle = `rgba(255,255,255,${0.4 + p * 0.5})`; g.lineWidth = 4; g.beginPath(); g.arc(R.mx, R.my, 24 + p * 14, 0, 6.28); g.stroke();
      hintText(g, env.who === 'battlemage' ? 'Tap the monster! Hold to charge a blast' : env.who === 'bard' ? 'Tap the monster on the beat!' : 'Tap the monster! Hold to keep swinging', W / 2, FLOOR_TOP - 16);
    } else if (env.runNo <= 3 && R.hitOnce && R.grabbed === 0 && R.loot.some((l) => l.bounced)) {
      const l = R.loot.find((q) => q.bounced && !q.grab);
      hintText(g, 'Swipe over the coins to grab them!', W / 2, FLOOR_TOP - 16);
      if (l) { const k = (t * 1.2) % 1; g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(l.x - 50 + k * 100, l.y + 20, 9, 0, 6.28); g.fill(); }
    } else if (R.eye.on && !R.weakHits && env.runNo <= 40 && !M?.p2 && R.kills < 2) hintText(g, 'Tap the glowing weak spot for a sure crit', W / 2, FLOOR_TOP - 16);
    if (R.won) { g.fillStyle = 'rgba(255,209,102,.15)'; g.fillRect(0, 0, W, H); g.font = '44px "Lilita One", system-ui'; g.fillStyle = '#ffd166'; g.strokeStyle = '#1b1830'; g.lineWidth = 6; g.strokeText('LICH DESTROYED!', W / 2, H * 0.3); g.fillText('LICH DESTROYED!', W / 2, H * 0.3); }
  }
  function hintText(g, s, x, y) {
    g.font = '800 16px Nunito, system-ui'; const w = Math.min(g.measureText(s).width + 28, 380);
    g.fillStyle = 'rgba(0,0,0,.6)'; rr(g, x - w / 2, y - 21, w, 32, 16); g.fill(); g.fillStyle = '#fff'; g.fillText(s, x, y);
  }
  function coinIcon(g, x, y, r, t, spin = 0) {
    const w = Math.abs(Math.cos(t * 3 + spin)) * 0.7 + 0.3;
    g.fillStyle = '#b07d18'; g.beginPath(); g.ellipse(x, y + 1.5, r * w, r, 0, 0, 6.28); g.fill();
    const gr = g.createLinearGradient(x - r, y - r, x + r, y + r); gr.addColorStop(0, '#ffe8a3'); gr.addColorStop(1, '#f0b429');
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r * w, r, 0, 0, 6.28); g.fill();
    g.fillStyle = '#fff3b0'; g.beginPath(); g.ellipse(x - r * 0.3 * w, y - r * 0.3, r * 0.25 * w, r * 0.3, 0, 0, 6.28); g.fill();
  }
  function drawLoot(g, l, t) {
    const left = l.life - l.t;
    if (!l.grab && left < 1 && Math.sin(t * 30) > 0) return;
    const a = l.grab ? Math.max(0, 1 - l.grab * 2) : 1; g.globalAlpha = a;
    if (!l.grab) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(l.x, l.gy + 2, 9, 3, 0, 0, 6.28); g.fill(); }
    if (l.kind === 'gem') {
      g.save(); g.translate(l.x, l.y); g.rotate(Math.sin(t * 4 + l.spin) * 0.3);
      const gl = g.createRadialGradient(0, 0, 2, 0, 0, 24); gl.addColorStop(0, 'rgba(224,170,255,.6)'); gl.addColorStop(1, 'rgba(224,170,255,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 24, 0, 6.28); g.fill();
      g.fillStyle = '#9d4edd'; g.beginPath(); g.moveTo(0, -12); g.lineTo(10, -3); g.lineTo(0, 12); g.lineTo(-10, -3); g.closePath(); g.fill();
      g.fillStyle = '#e0aaff'; g.beginPath(); g.moveTo(0, -12); g.lineTo(5, -3); g.lineTo(0, 4); g.lineTo(-5, -3); g.closePath(); g.fill(); g.restore();
    } else if (l.kind === 'flask') {
      g.save(); g.translate(l.x, l.y - 10); g.rotate(Math.sin(t * 3 + l.spin) * 0.2);
      const gl = g.createRadialGradient(0, 4, 2, 0, 4, 22); gl.addColorStop(0, 'rgba(255,93,115,.5)'); gl.addColorStop(1, 'rgba(255,93,115,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, 4, 22, 0, 6.28); g.fill();
      g.fillStyle = '#dfe7f2'; g.fillRect(-3.5, -12, 7, 8); g.fillStyle = '#8d6e4f'; g.fillRect(-4.5, -15, 9, 4);
      g.fillStyle = '#ff5d73'; g.beginPath(); g.arc(0, 4, 9, 0, 6.28); g.fill(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(-3, 1, 3, 0, 6.28); g.fill(); g.restore();
    } else coinIcon(g, l.x, l.y - 7, 8 + Math.min(4, Math.log10(1 + l.v) * 1.5), t, l.spin);
    g.globalAlpha = 1;
  }
  function drawEmber(g, e, t, boots) {
    const landed = e.t >= e.land, k = landed ? Math.min(1, (e.land + e.life - e.t) / 0.6) : 1;
    g.globalAlpha = k;
    const gl = g.createRadialGradient(e.x, e.y, 2, e.x, e.y, landed ? 34 : 18); gl.addColorStop(0, boots ? 'rgba(255,209,102,.7)' : 'rgba(255,110,40,.75)'); gl.addColorStop(1, 'rgba(255,60,20,0)');
    g.fillStyle = gl; g.beginPath(); g.arc(e.x, e.y, landed ? 34 : 18, 0, 6.28); g.fill();
    const h = 14 + Math.sin(t * 22 + e.tx) * 5;
    g.fillStyle = '#ff6b1a'; g.beginPath(); g.moveTo(e.x - 9, e.y); g.quadraticCurveTo(e.x, e.y - h * 2, e.x + 9, e.y); g.fill();
    g.fillStyle = '#ffe066'; g.beginPath(); g.moveTo(e.x - 4, e.y); g.quadraticCurveTo(e.x, e.y - h, e.x + 4, e.y); g.fill();
    g.globalAlpha = 1;
  }
  function drawEye(g, E, r, t, phyl) {
    const p = 1 + 0.12 * Math.sin(t * 8) + E.pop * 0.4, rad = r * p;
    const col = phyl ? '126,255,190' : '255,122,182';
    const gl = g.createRadialGradient(E.x, E.y, 2, E.x, E.y, rad * 1.6); gl.addColorStop(0, `rgba(${col},.75)`); gl.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gl; g.beginPath(); g.arc(E.x, E.y, rad * 1.6, 0, 6.28); g.fill();
    g.strokeStyle = `rgba(${col},.95)`; g.lineWidth = 3; g.beginPath(); g.arc(E.x, E.y, rad * 0.75, 0, 6.28); g.stroke();
    g.save(); g.translate(E.x, E.y); g.rotate(t * 1.5);
    for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(rad * 0.45, 0); g.lineTo(rad * 1.05, 0); g.stroke(); }
    g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(E.x, E.y, 3.5, 0, 6.28); g.fill();
  }
  function drawBeat(g, R, x, y, r, t, s) {
    const k = 1 - (R.beat.next - t) / R.beat.dt, rad = r * (2.1 - 1.0 * k), hit = t - R.beat.flash < 0.1;
    g.strokeStyle = R.encoreT > 0 ? 'rgba(255,209,102,.9)' : `rgba(144,224,239,${0.25 + 0.6 * k})`; g.lineWidth = 3 + 3 * k;
    g.beginPath(); g.arc(x, y, rad, 0, 6.28); g.stroke();
    g.strokeStyle = 'rgba(144,224,239,.35)'; g.lineWidth = 2; g.setLineDash([4, 8]); g.beginPath(); g.arc(x, y, r * 1.1, 0, 6.28); g.stroke(); g.setLineDash([]);
    if (hit) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 6; g.beginPath(); g.arc(x, y, r * 1.1, 0, 6.28); g.stroke(); }
    // notes drifting off the song
    g.fillStyle = 'rgba(144,224,239,.8)'; g.font = '18px system-ui'; g.textAlign = 'center';
    for (let i = 0; i < Math.min(4, R.streak); i++) { const q = (t * 0.6 + i * 0.25) % 1; g.globalAlpha = 1 - q; g.fillText(i % 2 ? '♪' : '♫', x + r * 1.3 * Math.cos(i * 1.7), y - r * 0.6 - q * 60); }
    g.globalAlpha = 1;
  }
  function drawChest(g, c, t) {
    const sq = c.sq, appear = Math.min(1, c.t * 4), fall = (1 - appear) * -120;
    const fade = !c.awake && c.t > 5 ? Math.max(0, 1 - (c.t - 5)) : 1;
    g.save(); g.globalAlpha = fade; g.translate(c.x, c.y + fall); g.scale(1 + sq * 0.15, 1 - sq * 0.12);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(0, 4, 34, 8, 0, 0, 6.28); g.fill();
    const glow = g.createRadialGradient(0, -14, 4, 0, -14, 60); glow.addColorStop(0, c.awake ? 'rgba(255,93,115,.3)' : 'rgba(255,209,102,.35)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = glow; g.beginPath(); g.arc(0, -14, 60, 0, 6.28); g.fill();
    const open = c.awake ? 0.35 + 0.25 * Math.max(0, Math.sin(t * 9)) + (c.bite < 0.2 ? 0.3 : 0) : 0;
    const wood = g.createLinearGradient(0, -24, 0, 2); wood.addColorStop(0, '#a0703f'); wood.addColorStop(1, '#6b4423');
    g.fillStyle = wood; rr(g, -30, -24, 60, 26, 4); g.fill();
    if (c.awake) { g.fillStyle = '#3a1020'; g.fillRect(-27, -26, 54, 6); g.fillStyle = '#fff'; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 8 - 4, -24); g.lineTo(i * 8 + 4, -24); g.lineTo(i * 8, -16); g.fill(); } g.fillStyle = '#ff5d73'; g.beginPath(); g.ellipse(8, -22, 12, 5, 0.3, 0, 6.28); g.fill(); }
    g.save(); g.translate(0, -24); g.rotate(-open);
    const lid = g.createLinearGradient(0, -20, 0, 0); lid.addColorStop(0, '#b98250'); lid.addColorStop(1, '#7d5130');
    g.fillStyle = lid; g.beginPath(); g.moveTo(-30, 0); g.lineTo(-30, -10); g.quadraticCurveTo(0, -26, 30, -10); g.lineTo(30, 0); g.closePath(); g.fill();
    g.fillStyle = '#ffd166'; g.fillRect(-32, -3, 64, 4); g.fillRect(-4, -16, 8, 16);
    if (c.awake) { g.fillStyle = '#fff'; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * 8 - 4, 0); g.lineTo(i * 8 + 4, 0); g.lineTo(i * 8, 8); g.fill(); } g.fillStyle = '#ffd166'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * 14, -10, 4, 0, 6.28); g.fill(); g.fillStyle = '#1b1830'; g.beginPath(); g.arc(sd * 14, -10, 2, 0, 6.28); g.fill(); g.fillStyle = '#ffd166'; } }
    g.restore();
    g.fillStyle = '#ffd166'; g.fillRect(-32, -14, 64, 3); rr(g, -6, -18, 12, 12, 3); g.fill(); g.fillStyle = '#6b4423'; g.fillRect(-1.5, -14, 3, 5);
    if (c.mimic && !c.awake) { g.fillStyle = '#ff5d73'; g.beginPath(); g.ellipse(18, -23, 4, 2, 0, 0, 6.28); g.fill(); } // the tell: a tongue tip
    if (!c.awake) { const sp = (t * 2) % 1; g.fillStyle = `rgba(255,255,255,${1 - sp})`; g.beginPath(); g.arc(-20 + sp * 8, -38 - sp * 10, 2.5, 0, 6.28); g.fill(); }
    g.restore();
  }
  function drawGob(g, gb, t) {
    g.save(); g.translate(gb.x, gb.y); g.scale(gb.vx < 0 ? -1 : 1, 1);
    const glow = g.createRadialGradient(0, -10, 4, 0, -10, 50); glow.addColorStop(0, 'rgba(255,209,102,.5)'); glow.addColorStop(1, 'rgba(255,209,102,0)'); g.fillStyle = glow; g.beginPath(); g.arc(0, -10, 50, 0, 6.28); g.fill();
    const w = gb.flash > 0.4, c = w ? '#fff' : '#f2c14e', d = w ? '#fff' : '#b8860b';
    g.fillStyle = '#8d6e4f'; g.beginPath(); g.ellipse(-16, -8, 13, 15, -0.3, 0, 6.28); g.fill(); g.fillStyle = '#ffd166'; g.font = '800 12px Nunito, system-ui'; g.textAlign = 'center'; g.fillText('$', -16, -4);
    const legs = Math.sin(t * 20) * 6;
    g.strokeStyle = d; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-4, 4); g.lineTo(-6 + legs, 16); g.moveTo(5, 4); g.lineTo(7 - legs, 16); g.stroke();
    g.fillStyle = c; g.beginPath(); g.ellipse(0, -8, 15, 15, 0, 0, 6.28); g.fill();
    g.beginPath(); g.moveTo(8, -16); g.lineTo(24, -26); g.lineTo(12, -6); g.fill(); g.beginPath(); g.moveTo(-8, -16); g.lineTo(-18, -30); g.lineTo(-12, -8); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(5, -11, 4.5, 0, 6.28); g.fill(); g.fillStyle = '#1b1830'; g.beginPath(); g.arc(6.5, -11, 2.2, 0, 6.28); g.fill();
    g.fillStyle = '#3a1020'; g.beginPath(); g.ellipse(6, -1, 5, 3, 0, 0, 6.28); g.fill();
    g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.ellipse(-4, -15, 5, 3, -0.5, 0, 6.28); g.fill();
    g.restore();
    for (let i = 0; i < gb.need; i++) { g.fillStyle = i < gb.hits ? '#ffd166' : 'rgba(0,0,0,.5)'; g.beginPath(); g.arc(gb.x - (gb.need - 1) * 6 + i * 12, gb.y - 40, 4, 0, 6.28); g.fill(); }
  }
  function drawSkull(g, k, t) {
    for (let i = 1; i <= 4; i++) { const q = Math.max(0, k.t - i * 0.05) / k.dur; const x = k.x0 + (k.tx - k.x0) * q, y = k.y0 + (k.ty - k.y0) * q - Math.sin(Math.min(1, q) * Math.PI) * 120; g.fillStyle = `rgba(126,255,190,${0.3 - i * 0.06})`; g.beginPath(); g.arc(x, y, k.r * (1 - i * 0.12), 0, 6.28); g.fill(); }
    // landing marker
    const q = k.t / k.dur; g.strokeStyle = `rgba(255,93,115,${0.3 + 0.5 * q})`; g.lineWidth = 2; g.beginPath(); g.ellipse(k.tx, k.ty, 70 * (1.2 - q * 0.2), 22, 0, 0, 6.28); g.stroke();
    g.save(); g.translate(k.x, k.y); g.rotate(Math.sin(t * 8 + k.tx) * 0.3);
    const gl = g.createRadialGradient(0, 0, 4, 0, 0, 34); gl.addColorStop(0, 'rgba(126,255,190,.55)'); gl.addColorStop(1, 'rgba(126,255,190,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, 0, 34, 0, 6.28); g.fill();
    g.fillStyle = '#e9e4d4'; g.beginPath(); g.arc(0, -3, 16, 0, 6.28); g.fill(); g.fillRect(-9, 6, 18, 9);
    g.fillStyle = '#1b1830'; g.beginPath(); g.arc(-6, -3, 5, 0, 6.28); g.arc(6, -3, 5, 0, 6.28); g.fill();
    g.fillStyle = '#7effbe'; g.beginPath(); g.arc(-6, -3, 2, 0, 6.28); g.arc(6, -3, 2, 0, 6.28); g.fill();
    g.fillStyle = '#1b1830'; for (let i = -1; i <= 1; i++) g.fillRect(i * 5 - 1, 8, 2, 7);
    g.restore();
  }
  function drawBroom(g, B, t) {
    g.save(); g.translate(B.x, B.y - 18 + Math.sin(t * 6) * 4); g.scale(B.dir || 1, 1); g.rotate(-0.5 + Math.sin(t * 12) * 0.15);
    g.fillStyle = 'rgba(224,170,255,.35)'; for (let i = 1; i < 4; i++) { g.beginPath(); g.arc(-i * 9, 10 + i * 2, 3 - i * 0.6, 0, 6.28); g.fill(); }
    g.strokeStyle = '#8d6e4f'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 8); g.stroke();
    g.fillStyle = '#e9c46a'; g.beginPath(); g.moveTo(-8, 8); g.lineTo(8, 8); g.lineTo(12, 24); g.lineTo(-12, 24); g.closePath(); g.fill();
    g.strokeStyle = '#b5893b'; g.lineWidth = 1.5; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 3, 10); g.lineTo(i * 4.5, 23); g.stroke(); }
    g.fillStyle = '#7a1f2b'; g.fillRect(-8, 6, 16, 4);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-3, -2, 2.5, 0, 6.28); g.arc(3, -2, 2.5, 0, 6.28); g.fill(); g.fillStyle = '#1b1830'; g.beginPath(); g.arc(-2.5, -2, 1.2, 0, 6.28); g.arc(3.5, -2, 1.2, 0, 6.28); g.fill();
    g.restore();
  }
  function drawMinion(g, m, t) {
    const pop = Math.min(1, (t - m.born) * 5), r = m.r * pop, fl = Math.sin(t * 20 + m.a) * 0.5;
    g.save(); g.translate(m.x, m.y);
    g.fillStyle = m.flash > 0.4 ? '#fff' : '#5a3d8a';
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.5, -2); g.quadraticCurveTo(sd * r * 1.8, -r * (1.2 + fl), sd * r * 1.6, r * 0.3); g.quadraticCurveTo(sd * r, 0, sd * r * 0.5, 4); g.fill(); }
    const gr = g.createRadialGradient(-r * 0.2, -r * 0.3, 1, 0, 0, r * 0.8); gr.addColorStop(0, m.flash > 0.4 ? '#fff' : '#c3a3ee'); gr.addColorStop(1, m.flash > 0.4 ? '#fff' : '#6f48a8');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r * 0.75, 0, 6.28); g.fill();
    g.fillStyle = '#ffd166'; g.beginPath(); g.arc(-r * 0.28, -r * 0.1, r * 0.17, 0, 6.28); g.arc(r * 0.28, -r * 0.1, r * 0.17, 0, 6.28); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-r * 0.25, r * 0.3); g.lineTo(-r * 0.1, r * 0.5); g.lineTo(0, r * 0.3); g.lineTo(r * 0.1, r * 0.5); g.lineTo(r * 0.25, r * 0.3); g.fill();
    g.restore();
  }
  function drawMonster(g, M, x, y, t, inp) {
    const pop = Math.min(1, (t - M.born) * 4), drop = (1 - pop) * -180;
    const bob = Math.sin(t * 3) * 4, sq = M.sq, r = M.r;
    g.save(); g.translate(x + (Math.random() - 0.5) * sq * 8, y + bob + drop + sq * r * 0.12); g.scale(1 + sq * 0.2, 1 - sq * 0.16);
    const white = M.flash > 0.45;
    const T = M.type, c = white ? '#fff' : T.c, d = white ? '#eee' : T.d;
    const lx = inp ? Math.max(-1, Math.min(1, (inp.x - x) / 150)) : 0, ly = inp ? Math.max(-1, Math.min(1, (inp.y - y) / 200)) : 0;
    const blink = (t + (M.f || 0) * 0.7) % 3.7 < 0.12;
    if (M.boss) drawLich(g, M, r, c, d, white, t, lx, ly);
    else {
      if (T.horns) { g.fillStyle = white ? '#fff' : '#f1e3c8'; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.35, -r * 0.75); g.quadraticCurveTo(sd * r * 0.9, -r * 1.3, sd * r * 0.8, -r * 1.45); g.quadraticCurveTo(sd * r * 0.65, -r * 1.05, sd * r * 0.6, -r * 0.6); g.fill(); } }
      if (T.ears) { g.fillStyle = c; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.7, -r * 0.3); g.lineTo(sd * r * 1.35, -r * 0.7); g.lineTo(sd * r * 0.8, r * 0.05); g.fill(); } }
      // body, shaded
      const body = g.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.15);
      body.addColorStop(0, white ? '#fff' : mix(T.c, '#ffffff', 0.35)); body.addColorStop(0.55, c); body.addColorStop(1, d);
      if (T.ghost) {
        g.fillStyle = body; g.beginPath(); g.moveTo(-r * 0.9, r * 0.2); g.bezierCurveTo(-r * 0.95, -r * 1.2, r * 0.95, -r * 1.2, r * 0.9, r * 0.2);
        for (let i = 0; i <= 6; i++) { const xx = r * 0.9 - i * r * 1.8 / 6; g.lineTo(xx, r * (0.9 + (i % 2 ? -0.2 : 0.1) + Math.sin(t * 6 + i) * 0.06)); }
        g.closePath(); g.fill();
      } else if (T.wraith) {
        g.fillStyle = d; g.beginPath(); g.moveTo(-r * 1.05, r * 1.0); g.quadraticCurveTo(-r * 0.95, -r * 1.25, 0, -r * 1.2); g.quadraticCurveTo(r * 0.95, -r * 1.25, r * 1.05, r * 1.0);
        for (let i = 0; i <= 5; i++) g.lineTo(r * 1.05 - i * r * 2.1 / 5, r * (1.0 + (i % 2 ? -0.25 : 0) + Math.sin(t * 5 + i) * 0.05)); g.fill();
        g.fillStyle = body; g.beginPath(); g.moveTo(-r * 0.8, r * 0.9); g.quadraticCurveTo(-r * 0.75, -r * 0.95, 0, -r * 0.95); g.quadraticCurveTo(r * 0.75, -r * 0.95, r * 0.8, r * 0.9); g.fill();
        g.fillStyle = '#05080b'; g.beginPath(); g.ellipse(0, -r * 0.15, r * 0.52, r * 0.55, 0, 0, 6.28); g.fill();
      } else {
        g.fillStyle = d; g.beginPath(); g.ellipse(0, r * 0.08, r * 1.02, r * 0.98, 0, 0, 6.28); g.fill();
        g.fillStyle = body; g.beginPath();
        if (T.rock) { for (let i = 0; i < 9; i++) { const a = i / 9 * 6.283, q = r * (0.88 + 0.1 * Math.sin(i * 3.1)); g.lineTo(Math.cos(a) * q, Math.sin(a) * q); } g.closePath(); }
        else if (T.skull) g.ellipse(0, -r * 0.05, r * 0.85, r * 0.92, 0, 0, 6.28);
        else g.ellipse(0, 0, r * 0.97, r * 0.92 + Math.sin(t * 5) * r * 0.02, 0, 0, 6.28);
        g.fill();
      }
      if (T.magma) { g.strokeStyle = `rgba(255,${140 + 60 * Math.sin(t * 4)},40,.9)`; g.lineWidth = r * 0.06; g.lineCap = 'round'; for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.3; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25); g.lineTo(Math.cos(a + 0.2) * r * 0.6, Math.sin(a + 0.2) * r * 0.6); g.lineTo(Math.cos(a - 0.1) * r * 0.85, Math.sin(a - 0.1) * r * 0.85); g.stroke(); } }
      if (T.crystal) { for (const [a, h] of [[-2.1, 0.7], [-1.57, 0.95], [-1.0, 0.6], [-2.6, 0.45]]) { g.save(); g.rotate(a + Math.PI / 2); const cg = g.createLinearGradient(0, -r * 0.8, 0, -r * (0.8 + h)); cg.addColorStop(0, '#40a8c4'); cg.addColorStop(1, '#c9f6ff'); g.fillStyle = white ? '#fff' : cg; g.beginPath(); g.moveTo(-r * 0.12, -r * 0.78); g.lineTo(0, -r * (0.8 + h)); g.lineTo(r * 0.12, -r * 0.78); g.fill(); g.restore(); } }
      if (!T.ghost && !T.wraith) { g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.18, -0.5, 0, 6.28); g.fill(); }
      if (!T.skull && !T.rock && !T.ghost && !T.wraith && !T.magma) { g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.ellipse(0, r * 0.45, r * 0.55, r * 0.35, 0, 0, 6.28); g.fill(); }
      if (T.cap) { // mushroom cap with spots
        const cg = g.createLinearGradient(0, -r * 1.3, 0, -r * 0.2); cg.addColorStop(0, white ? '#fff' : '#ff6b6b'); cg.addColorStop(1, white ? '#eee' : '#a4161a');
        g.fillStyle = cg; g.beginPath(); g.moveTo(-r * 1.25, -r * 0.25); g.bezierCurveTo(-r * 1.2, -r * 1.45, r * 1.2, -r * 1.45, r * 1.25, -r * 0.25); g.quadraticCurveTo(0, -r * 0.45, -r * 1.25, -r * 0.25); g.fill();
        g.fillStyle = 'rgba(255,255,255,.85)'; for (const [a, b, q] of [[-0.6, -0.8, 0.16], [0.15, -1.0, 0.2], [0.7, -0.62, 0.13], [-0.15, -0.58, 0.1]]) { g.beginPath(); g.ellipse(a * r, b * r, q * r, q * r * 0.8, 0, 0, 6.28); g.fill(); }
      }
      if (T.helm) { g.fillStyle = white ? '#fff' : '#8d99ae'; g.beginPath(); g.arc(0, -r * 0.3, r * 0.92, Math.PI * 1.08, Math.PI * 1.92); g.closePath(); g.fill(); g.fillStyle = white ? '#fff' : '#adb5bd'; g.fillRect(-r * 0.08, -r * 1.2, r * 0.16, r * 0.4); }
      // face
      const ey = T.cap ? r * 0.02 : -r * 0.12, eyes = T.eyes === 1 ? [0] : [-0.33, 0.33];
      if (T.wraith) { for (const sd of [-1, 1]) { const gl = g.createRadialGradient(sd * r * 0.2, -r * 0.2, 1, sd * r * 0.2, -r * 0.2, r * 0.22); gl.addColorStop(0, '#d8fff0'); gl.addColorStop(0.4, '#7effbe'); gl.addColorStop(1, 'rgba(126,255,190,0)'); g.fillStyle = gl; g.beginPath(); g.arc(sd * r * 0.2 + lx * 3, -r * 0.2 + ly * 3, r * 0.22, 0, 6.28); g.fill(); } }
      else if (T.ghost) { g.fillStyle = '#1b1830'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * r * 0.3 + lx * 4, -r * 0.25 + ly * 4, r * 0.13, blink ? r * 0.02 : r * 0.2, 0, 0, 6.28); g.fill(); } g.beginPath(); g.ellipse(0, r * 0.25, r * 0.18, r * (0.14 + sq * 0.2), 0, 0, 6.28); g.fill(); }
      else {
        for (const ex of eyes) {
          const er = r * (eyes.length === 1 ? 0.3 : 0.2);
          g.fillStyle = T.skull ? '#1b1830' : '#fff'; g.beginPath(); g.arc(ex * r, ey, er, 0, 6.28); g.fill();
          if (blink && !T.skull) { g.fillStyle = c; g.beginPath(); g.arc(ex * r, ey, er + 1, 0, 6.28); g.fill(); g.strokeStyle = d; g.lineWidth = 2; g.beginPath(); g.moveTo(ex * r - er, ey); g.lineTo(ex * r + er, ey); g.stroke(); continue; }
          g.fillStyle = T.skull ? '#ff5d73' : T.magma ? '#ff9f1c' : '#1b1830'; g.beginPath(); g.arc(ex * r + lx * er * 0.4, ey + ly * er * 0.4, er * (T.skull ? 0.35 : 0.5), 0, 6.28); g.fill();
          if (!T.skull) { g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(ex * r + lx * er * 0.4 - er * 0.18, ey + ly * er * 0.4 - er * 0.2, er * 0.14, 0, 6.28); g.fill(); }
        }
        g.strokeStyle = '#1b1830'; g.lineWidth = r * 0.07; g.lineCap = 'round';
        for (const sd of [-1, 1]) { const ex = eyes.length === 1 ? sd * r * 0.15 : sd * r * 0.33; g.beginPath(); g.moveTo(ex - sd * r * 0.15 - (eyes.length === 1 ? sd * r * 0.12 : 0), ey - r * 0.32); g.lineTo(ex + sd * r * 0.12, ey - r * 0.22 + sq * r * 0.1); g.stroke(); }
        // mouth
        const open = 0.12 + sq * 0.25, my = T.cap ? r * 0.45 : r * 0.38;
        g.fillStyle = T.magma ? '#ff9f1c' : '#3a1020'; g.beginPath(); g.ellipse(0, my, r * 0.38, r * open, 0, 0, 6.28); g.fill();
        if (T.teeth || T.skull) { g.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * r * 0.13 - r * 0.05, my - r * open * 0.9); g.lineTo(i * r * 0.13 + r * 0.05, my - r * open * 0.9); g.lineTo(i * r * 0.13, my - r * open * 0.2); g.fill(); } }
        if (T.tusks) { g.fillStyle = white ? '#fff' : '#fffbe6'; for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(sd * r * 0.3, my + r * 0.04); g.quadraticCurveTo(sd * r * 0.42, my - r * 0.28, sd * r * 0.28, my - r * 0.4); g.lineTo(sd * r * 0.2, my + r * 0.04); g.fill(); } }
      }
    }
    // armour plates
    for (const p of M.plates) if (p.hp > 0) {
      const px = Math.cos(p.a) * r * 0.75, py = Math.sin(p.a) * r * 0.75;
      g.save(); g.translate(px, py); g.rotate(p.a + Math.PI / 2);
      const pg = g.createLinearGradient(0, -r * 0.14, 0, r * 0.14); pg.addColorStop(0, p.flash > 0.4 ? '#fff' : '#ced4da'); pg.addColorStop(1, p.flash > 0.4 ? '#fff' : '#6c757d');
      g.fillStyle = pg; rr(g, -r * 0.18, -r * 0.14, r * 0.36, r * 0.28, 6); g.fill();
      g.strokeStyle = '#495057'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#dee2e6'; for (const q of [-1, 1]) { g.beginPath(); g.arc(q * r * 0.14, -r * 0.09, 3, 0, 6.28); g.fill(); }
      if (p.hp < p.max * 0.66) { g.strokeStyle = '#212529'; g.lineWidth = 2; g.beginPath(); g.moveTo(-r * 0.12, -r * 0.15); g.lineTo(0, 0); g.lineTo(-r * 0.05, r * 0.15); if (p.hp < p.max * 0.33) { g.moveTo(0, 0); g.lineTo(r * 0.15, r * 0.05); } g.stroke(); }
      g.restore();
    }
    // fire
    if (M.burn > 0) for (let i = 0; i < 6; i++) { const a = i * 1.05 + t * 2, fx = Math.cos(a) * r * 0.6, fy = r * 0.1 + Math.sin(a) * r * 0.3, h = 16 + Math.sin(t * 20 + i) * 6; g.fillStyle = 'rgba(255,159,28,.85)'; g.beginPath(); g.moveTo(fx - 7, fy); g.quadraticCurveTo(fx, fy - h * 2, fx + 7, fy); g.fill(); g.fillStyle = 'rgba(255,224,102,.9)'; g.beginPath(); g.moveTo(fx - 3, fy); g.quadraticCurveTo(fx, fy - h, fx + 3, fy); g.fill(); }
    // shield bubble
    if (M.shield > 0) {
      const a = 0.35 + 0.15 * Math.sin(t * 12);
      g.fillStyle = `rgba(142,202,230,${a * 0.5})`; g.strokeStyle = `rgba(189,224,254,${a + 0.3})`; g.lineWidth = 5;
      g.beginPath(); g.arc(0, 0, r * 1.35, 0, 6.28); g.fill(); g.stroke();
      g.lineWidth = 2; for (let i = 0; i < 6; i++) { const an = i / 6 * 6.283 + t; g.beginPath(); g.arc(Math.cos(an) * r * 0.7, Math.sin(an) * r * 0.7, r * 0.35, 0, 6.28); g.stroke(); }
    }
    g.restore();
  }
  function drawLich(g, M, r, c, d, white, t, lx, ly) {
    const p2 = M.p2;
    // aura
    const au = g.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.8); au.addColorStop(0, p2 ? 'rgba(126,255,190,.25)' : 'rgba(179,136,235,.2)'); au.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = au; g.beginPath(); g.arc(0, 0, r * 1.8, 0, 6.28); g.fill();
    if (p2) { g.strokeStyle = 'rgba(126,255,190,.5)'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(0, 0, r * (1.25 + i * 0.12), t * (1 + i) , t * (1 + i) + 2); g.stroke(); } }
    // robe, with tattered hem
    const robe = g.createLinearGradient(0, -r * 0.4, 0, r * 1.1); robe.addColorStop(0, white ? '#fff' : '#4a3672'); robe.addColorStop(1, d);
    g.fillStyle = robe; g.beginPath(); g.moveTo(-r * 1.1, r * 1.1); g.quadraticCurveTo(-r * 0.9, -r * 0.2, 0, -r * 0.4); g.quadraticCurveTo(r * 0.9, -r * 0.2, r * 1.1, r * 1.1);
    for (let i = 0; i <= 6; i++) g.lineTo(r * 1.1 - i * r * 2.2 / 6, r * 1.1 + (i % 2 ? -r * 0.15 : 0) + Math.sin(t * 4 + i) * r * 0.03); g.fill();
    g.fillStyle = c; g.beginPath(); g.moveTo(-r * 0.75, r * 1); g.quadraticCurveTo(-r * 0.6, 0, 0, -r * 0.2); g.quadraticCurveTo(r * 0.6, 0, r * 0.75, r * 1); g.fill();
    // hands with a staff
    g.strokeStyle = '#5b4636'; g.lineWidth = r * 0.07; g.lineCap = 'round'; g.beginPath(); g.moveTo(r * 0.95, -r * 0.9); g.lineTo(r * 0.85, r * 1.1); g.stroke();
    const orb = g.createRadialGradient(r * 0.95, -r * 1.0, 1, r * 0.95, -r * 1.0, r * 0.2); orb.addColorStop(0, '#fff'); orb.addColorStop(0.4, p2 ? '#7effbe' : '#c77dff'); orb.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = orb; g.beginPath(); g.arc(r * 0.95, -r * 1.0, r * 0.2, 0, 6.28); g.fill();
    g.fillStyle = white ? '#fff' : '#e9e4d4'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * r * 0.85, r * 0.15, r * 0.1, 0, 6.28); g.fill(); }
    // phylactery on the chest
    if (!p2) { g.fillStyle = '#2b1f44'; g.beginPath(); g.arc(0, r * 0.42, r * 0.12, 0, 6.28); g.fill(); }
    // glow
    const gl = g.createRadialGradient(0, -r * 0.3, 4, 0, -r * 0.3, r * 1.4); gl.addColorStop(0, 'rgba(126,255,190,.25)'); gl.addColorStop(1, 'rgba(126,255,190,0)'); g.fillStyle = gl; g.beginPath(); g.arc(0, -r * 0.3, r * 1.4, 0, 6.28); g.fill();
    // skull
    const sk = g.createRadialGradient(-r * 0.15, -r * 0.55, 2, 0, -r * 0.35, r * 0.65); sk.addColorStop(0, '#fffdf3'); sk.addColorStop(1, white ? '#fff' : '#bdb59c');
    g.fillStyle = sk; g.beginPath(); g.ellipse(0, -r * 0.35, r * 0.55, r * 0.6, 0, 0, 6.28); g.fill();
    g.fillRect(-r * 0.3, -r * 0.05, r * 0.6, r * 0.3);
    g.fillStyle = '#1b1830'; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(sd * r * 0.22, -r * 0.4, r * 0.15, r * 0.18, 0, 0, 6.28); g.fill(); }
    g.fillStyle = '#7effbe'; for (const sd of [-1, 1]) { g.beginPath(); g.arc(sd * r * 0.22 + lx * 4, -r * 0.4 + ly * 4, r * (p2 ? 0.09 : 0.07) + Math.sin(t * 8) * 1.5, 0, 6.28); g.fill(); }
    g.fillStyle = '#1b1830'; g.beginPath(); g.moveTo(0, -r * 0.25); g.lineTo(-r * 0.06, -r * 0.12); g.lineTo(r * 0.06, -r * 0.12); g.fill();
    for (let i = -2; i <= 2; i++) g.fillRect(i * r * 0.11 - 2, r * 0.02, 3, r * 0.2);
    // crown
    const cr = g.createLinearGradient(0, -r * 1.3, 0, -r * 0.82); cr.addColorStop(0, '#fff3b0'); cr.addColorStop(1, '#d4a017');
    g.fillStyle = white ? '#fff' : cr; g.beginPath(); g.moveTo(-r * 0.5, -r * 0.82);
    for (let i = 0; i <= 4; i++) { g.lineTo(-r * 0.5 + i * r * 0.25, -r * (i % 2 ? 1.05 : 1.3)); } g.lineTo(r * 0.5, -r * 0.82); g.closePath(); g.fill();
    g.fillStyle = '#ff5d73'; g.beginPath(); g.arc(0, -r * 0.95, r * 0.07, 0, 6.28); g.fill();
  }
  function drawFace(g, who, x, y, r) {
    g.save(); g.translate(x, y);
    const skin = '#f2c6a0';
    const head = (cx, cy, rad) => { const gr = g.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 1, cx, cy, rad); gr.addColorStop(0, '#ffe0c4'); gr.addColorStop(1, '#d9a47c'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, rad, 0, 6.28); g.fill(); };
    if (who === 'berserker') {
      head(0, 0, r * 0.65);
      g.fillStyle = '#c1440e'; g.beginPath(); g.moveTo(-r * 0.62, r * 0.05); g.quadraticCurveTo(0, r * 1.45, r * 0.62, r * 0.05); g.quadraticCurveTo(0, r * 0.5, -r * 0.62, r * 0.05); g.fill();
      g.fillStyle = '#8d99ae'; g.beginPath(); g.arc(0, -r * 0.2, r * 0.68, Math.PI, 0); g.fill();
      g.fillStyle = '#f1e3c8'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.55, -r * 0.4); g.quadraticCurveTo(s * r * 1.2, -r * 0.6, s * r * 1.05, -r * 1.2); g.quadraticCurveTo(s * r * 0.9, -r * 0.7, s * r * 0.4, -r * 0.65); g.fill(); }
      g.fillStyle = '#222'; g.beginPath(); g.arc(-r * 0.24, -r * 0.02, 3, 0, 6.28); g.arc(r * 0.24, -r * 0.02, 3, 0, 6.28); g.fill();
      g.strokeStyle = '#222'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(-r * 0.4, -r * 0.18); g.lineTo(-r * 0.1, -r * 0.08); g.moveTo(r * 0.4, -r * 0.18); g.lineTo(r * 0.1, -r * 0.08); g.stroke();
    } else if (who === 'battlemage') {
      head(0, r * 0.1, r * 0.6);
      g.fillStyle = '#eee'; g.beginPath(); g.moveTo(-r * 0.5, r * 0.25); g.quadraticCurveTo(0, r * 1.4, r * 0.5, r * 0.25); g.fill();
      g.fillStyle = '#3a56c5'; g.beginPath(); g.moveTo(-r * 0.95, -r * 0.1); g.quadraticCurveTo(0, -r * 0.35, r * 0.95, -r * 0.1); g.lineTo(r * 0.15, -r * 1.35); g.lineTo(-r * 0.3, -r * 0.4); g.closePath(); g.fill();
      g.fillStyle = '#ffd166'; g.font = `900 ${r * 0.5}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', 0, -r * 0.55);
      g.fillStyle = '#90e0ef'; g.beginPath(); g.arc(-r * 0.22, r * 0.08, 4, 0, 6.28); g.arc(r * 0.22, r * 0.08, 4, 0, 6.28); g.fill();
    } else if (who === 'bard') {
      head(0, r * 0.1, r * 0.6);
      g.fillStyle = '#8a5a2b'; g.beginPath(); g.ellipse(0, r * 0.05, r * 0.66, r * 0.5, 0, Math.PI, 0); g.fill(); // hair
      g.fillStyle = '#2d6a4f'; g.beginPath(); g.moveTo(-r * 0.85, -r * 0.2); g.quadraticCurveTo(-r * 0.2, -r * 1.1, r * 0.75, -r * 0.55); g.quadraticCurveTo(r * 0.2, -r * 0.3, -r * 0.85, -r * 0.2); g.fill(); // cap
      g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(r * 0.3, -r * 0.6); g.quadraticCurveTo(r * 1.15, -r * 1.25, r * 1.05, -r * 0.35); g.quadraticCurveTo(r * 0.85, -r * 0.75, r * 0.3, -r * 0.6); g.fill(); // feather
      g.strokeStyle = '#a4161a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(r * 0.35, -r * 0.6); g.quadraticCurveTo(r * 0.9, -r * 0.9, r * 1.05, -r * 0.4); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(-r * 0.22, r * 0.08, 3, 0, 6.28); g.arc(r * 0.22, r * 0.08, 3, 0, 6.28); g.fill();
      g.strokeStyle = '#7a3b2e'; g.lineWidth = 2.5; g.lineCap = 'round'; g.beginPath(); g.arc(0, r * 0.28, r * 0.2, 0.3, Math.PI - 0.3); g.stroke(); // grin
      g.fillStyle = '#90e0ef'; g.font = `900 ${r * 0.45}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('♪', -r * 0.95, -r * 0.6);
    } else {
      g.fillStyle = '#2b2d42'; g.beginPath(); g.moveTo(0, -r * 1.1); g.quadraticCurveTo(r * 1.0, -r * 0.6, r * 0.8, r * 0.9); g.lineTo(-r * 0.8, r * 0.9); g.quadraticCurveTo(-r * 1.0, -r * 0.6, 0, -r * 1.1); g.fill();
      g.fillStyle = skin; g.beginPath(); g.ellipse(0, r * 0.05, r * 0.48, r * 0.55, 0, 0, 6.28); g.fill();
      g.fillStyle = '#5c677d'; g.fillRect(-r * 0.5, r * 0.15, r, r * 0.4);
      g.fillStyle = '#ffd166'; g.beginPath(); g.ellipse(-r * 0.2, -r * 0.05, 5, 3, 0, 0, 6.28); g.ellipse(r * 0.2, -r * 0.05, 5, 3, 0, 0, 6.28); g.fill();
    }
    g.restore();
  }

  function baseStats(who) {
    const s = { dmg: 3, swing: 0.32, crit: 0.04, critMul: 2.5, magnet: 40, life: 3.6, value: 1, extra: 0, gem: 0.005, gemKill: 0.12, st: 7, drain: 1, refill: 1.5,
      skip: 0, fire: 0, burn: 0.6, chain: 0, storm: 0, rage: 0, blast: 0, chargeT: 1.2, chargeCap: 1, blastFire: 0, stackCrit: 0, stackMul: 0, pick: 0, cry: 0,
      comboDmg: 0, comboWin: 0.7, comboCap: 20, smash: 0, whirl: 0, eye: 0, eyeR: 22, eyeMul: 1.4, eyeMove: 1.8, sunder: 0, eyeGem: 0,
      chest: 0.12, chestLoot: 1, gob: 0.06, gobNeed: 5, midas: 0, broom: 0, vacuum: 0, boots: 0, flask: 0, regen: 1, cavDmg: 0, ghost: 0,
      beat: 0, beatWin: 0.07, perfMul: 4.2, encore: 0 };
    if (who === 'berserker') { s.swing = 0.25; s.rage = 1; }
    if (who === 'battlemage') { s.dmg = 2.6; s.swing = 0.36; s.blast = 14; s.chargeT = 1.0; }
    if (who === 'rogue') { s.dmg = 2.4; s.crit = 0.18; s.stackCrit = 0.06; s.stackMul = 0.4; }
    if (who === 'bard') { s.dmg = 2.6; s.swing = 0.3; s.beat = 0.4; }
    return s;
  }

  const CHARACTERS = [
    { id: 'berserker', name: 'Hilda the Berserker', blurb: 'Fast swings. Hits harder the more out of breath she is.', unlock: 0 },
    { id: 'battlemage', name: 'Orrin the Battlemage', blurb: 'Hold on the monster to charge a huge arcane blast.', unlock: 1 },
    { id: 'rogue', name: 'Vex the Rogue', blurb: 'Crit chains: each crit in a row makes the next likelier and harder.', unlock: 2 },
    { id: 'bard', name: 'Wren the Bard', blurb: 'Tap on the beat for perfect hits. Keep the song going for an Encore.', unlock: 3 },
  ];
  if (typeof module !== 'undefined' && typeof window === 'undefined') { module.exports = { NODES, LICH_HP, ZONES, MONS, hpFor, coinFor, gimmicks, baseStats, createRun, CHARACTERS: CHARACTERS.map((c) => c.id) }; return; }
  window.BonkKnight = { NODES, LICH_HP, ZONES, hpFor, coinFor, gimmicks, baseStats, createRun };
  Kit.game({
    id: 'bonk-knight', title: 'Bonk Knight', tagline: 'Bonk the monster on every floor of the tower, sweep up the loot it spills, and climb until you run out of breath.',
    howTo: 'Tap or hold on the monster to bonk it. Swipe over coins on the floor before they fade. Treasure chests and golden goblins pay big; watch out for mimics. Spend coins on the upgrade map between climbs.',
    runVerb: 'Climb!', winTitle: 'The Lich King falls!', loseTitle: 'Out of breath', scoreName: 'floor',
    colors: { accent: '#ffd166', bg: '#15121f', card: '#26213a' },
    currencies: [{ id: 'coins', name: 'coins', color: '#ffd166' }, { id: 'gems', name: 'gems', color: '#e0aaff' }],
    characters: CHARACTERS,
    drawFace, nodes: NODES, touchOffset: 0, hoverIsDown: false,
    baseStats, createRun,
  });
  document.body.dataset.ready = '1';
})();
