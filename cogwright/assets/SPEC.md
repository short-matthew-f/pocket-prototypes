# Cogwright: asset spec

Game page: https://short-matthew-f.github.io/pocket-prototypes/cogwright/. It's a phone game, played in portrait.

The gears are real-time 3D (three.js), so they don't need art. This spec covers everything else:

- the battle lane's backgrounds and characters
- the hub emblems pressed into the 3D gears
- the upgrade icons
- a title painting
- sound

## Style

**Look.** Clockwork storybook with a steampunk workshop under siege. Think warm polished brass and copper, dark walnut, soot, and ember glow, with teal patina and a little cream enamel as accents.

**Shapes.** Chunky readable shapes, soft painterly cel shading and a thick dark outline (#1a120c). Everything must read at 40–90 px on a phone.

**Tone.** Charming, not grim: no gore, no text or letters, no UI frames, and no shadows baked under the feet (the code draws them). Sprites sit on a plain flat light backdrop or transparent, centred, with a clear margin.

**Palette.**
- Brass: #d4a94e, #a37b2c
- Copper: #c0703e
- Walnut: #2b211a, #3a2c21
- Ember: #ff9a3c
- Steel: #8c8f99
- Verdigris: #5fb3a0
- Cream: #f3e6c6

**Directions.**
- **Troops** are little wind-up brass toy soldiers, each with a winding key on its back. They walk UP the screen, so draw them from behind and slightly above, heading away from the viewer.
- **Enemies** walk DOWN toward the viewer, so draw them in 3/4 view facing the viewer.

## Delivery

- Images go to `deliveries/pocket-prototypes/cogwright/assets/img/<name>.png`. Sprites are 512×512. `bg-*` images are 780×1688 and opaque.
- Sounds go to `deliveries/pocket-prototypes/cogwright/assets/sfx/<name>.mp3`.
- Priority 1 first, please.

## Images

### Backgrounds (opaque, 780×1688 portrait)

| name | subject | priority |
|---|---|---|
| bg-bench | Top-down view of a craftsman's walnut workbench. Brass corner fittings, a few tools (calipers, screwdriver, oil can) and loose screws pushed to the very edges. The middle 70% is plain warm wood, low contrast, because a hex board of 3D gears sits on top. | 1 |
| bg-foundry | Top-down battle lane through an old iron foundry floor: soot-dark flagstones, faint glowing ember cracks and a pair of rails running top to bottom. Very low contrast in the middle; brighter ember glow at the top edge. | 1 |
| bg-mines | Top-down battle lane through a flooded mine tunnel: wet dark rock, shallow teal puddles, mine-cart rails top to bottom, a few lanterns at the edges only. Low contrast in the middle. | 1 |
| bg-tower | Top-down battle lane across a clocktower floor: dark purple-grey wooden planks with brass inlaid clock-face circles, faint, low contrast in the middle; giant cogs half-visible at the side edges. | 1 |
| bg-title | Title painting: a cosy walnut workshop at night, a large glowing brass mainspring gear on the bench, little brass toy soldiers marching out of a door, ember light from a window. Leave the top 25% fairly plain (the title is drawn there). | 2 |

### Troops (seen from behind, walking up)

| name | subject | priority |
|---|---|---|
| unit-grunt | Wind-up brass toy soldier with a round helmet and a short sword, winding key on its back | 1 |
| unit-archer | Wind-up brass toy soldier with a verdigris-green hood and a crossbow, winding key on its back | 1 |
| unit-brute | Big barrel-chested copper wind-up toy knight with a large rivet shield and a hammer, huge winding key | 1 |
| unit-tinker | Little brass toy engineer with a teal apron, a wrench and a glowing oil can, winding key on its back | 1 |

### Enemies (3/4 view facing the viewer, walking down)

| name | subject | priority |
|---|---|---|
| enemy-foundry-basic | Rustling: a small scrappy rust gremlin made of flaking iron bits, glowing orange eyes | 1 |
| enemy-foundry-tank | Slagger: a lumpy hulking golem of cooled black slag with lava glowing in its cracks | 1 |
| enemy-foundry-ranged | Sparkfly: a glowing ember beetle-fly with sooty wings, spitting sparks | 1 |
| enemy-foundry-armor | Smelter: a squat armoured furnace on legs with a riveted door belly and a smoking chimney head | 1 |
| boss-foundry | The Foreman: a towering foundry boss with a smokestack top hat, a crucible of molten metal in one hand and a giant hammer, ember eyes | 1 |
| enemy-mines-basic | Drowner: a soggy shuffling miner ghoul in a dented helmet, dripping water, glowing teal eyes | 1 |
| enemy-mines-tank | Silt Brute: a hulking mud-and-rock beast with a pickaxe stuck in its back | 1 |
| enemy-mines-ranged | Lamp Eel: a slithering eel with a glowing lantern lure, spitting light | 1 |
| enemy-mines-armor | Pump Golem: a riveted iron pump machine on stubby legs with hoses and a pressure gauge face | 1 |
| boss-mines | The Dredge: a huge dredging machine-creature with a bucket-chain mouth, dripping silt, one great lamp eye | 1 |
| enemy-tower-basic | Tick: a small clockwork spider with a pocket-watch body | 1 |
| enemy-tower-tank | Pendulum Knight: a tall knight whose torso is a swinging pendulum blade, brass and violet | 1 |
| enemy-tower-ranged | Cuckoo: a wooden mechanical cuckoo bird bursting from a tiny clock house, beak open to shoot | 1 |
| enemy-tower-armor | Bell Golem: a heavy bronze bell body on stone legs with a clapper tongue | 1 |
| boss-tower | The Horologist: a tall clockmaker sorcerer with a clock-face halo, many tiny gears orbiting, violet robes | 1 |

### Battle objects

| name | subject | priority |
|---|---|---|
| obj-gate-foundry | The enemy gate, front view, wider than tall: a soot-black iron foundry gate with glowing ember slots and spikes | 1 |
| obj-gate-mines | The enemy gate, front view, wider than tall: a timber-braced mine entrance with a rusted grille and lanterns | 1 |
| obj-gate-tower | The enemy gate, front view, wider than tall: an ornate clocktower archway with a giant clock face above a brass portcullis | 1 |
| obj-door | The player's workshop door seen from above at a slight angle, wider than tall: a sturdy walnut double door with brass hinges and a little round window | 1 |
| obj-scrap | A small glinting pile of brass scrap: nuts, bolts, a tiny cog | 1 |

### Gear hub emblems (top-down)

These are round enamel-and-brass badges pressed into the middle of the 3D gears: a flat round brass cap with a raised enamel emblem, filling the frame. Keep them simple and bold.

| name | emblem | priority |
|---|---|---|
| emblem-grunt | crossed short swords | 1 |
| emblem-archer | a crossbow | 1 |
| emblem-brute | a rivet shield and hammer | 1 |
| emblem-tinker | a wrench over an oil drop | 1 |
| emblem-haste | three forward chevrons | 1 |
| emblem-overcharge | a jagged power spark | 1 |
| emblem-lightning | a forked lightning bolt | 1 |
| emblem-shield | a hexagonal ward shield | 1 |
| emblem-engine | a piston | 1 |
| emblem-collector | a small coin chest | 1 |

### Upgrade icons (priority 2)

These are round engraved brass medallions with a simple bold emblem, all in one consistent set.

| name | emblem |
|---|---|
| icon-root | a workshop gear and hammer |
| icon-w_dmg | a heavy wrench |
| icon-w_rad | a wrench inside a wide ring |
| icon-w_pick | a horseshoe magnet |
| icon-w_crit | a spark star |
| icon-w_auto | a tiny clockwork fairy |
| icon-w_heal | an oil can with a heart |
| icon-s_time | a stopwatch |
| icon-s_door | a wooden door |
| icon-s_crank | a winding key |
| icon-s_crankx | a coiled spring |
| icon-s_vac | a broom |
| icon-s_hold | a barred door with a brace |
| icon-t_dmg | a whetstone and blade |
| icon-t_hp | a riveted breastplate |
| icon-t_spd | a winged boot |
| icon-t_cap | a barracks tent |
| icon-t_gate | a grappling hook |
| icon-t_rank | an anvil with a star |
| icon-b_torque | a mainspring spiral |
| icon-b_inv | a chest of drawers |
| icon-b_board | a hexagon grid |
| icon-b_engine | a gearbox |
| icon-b_spell | an alchemy flask |
| icon-b_vault | a strongbox with a lock |
| icon-l_drop | a gift crate |
| icon-l_mf | a jeweller's loupe |
| icon-l_brass | a crucible pouring |
| icon-l_filter | a sieve |
| icon-l_ilvl | a deep pocket with gems |
| icon-c_scrap | a pile of scrap with a nose sniffing |
| icon-i_cap | a lantern and moon |
| icon-i_eff | a sleeping coffer |
| icon-i_night | a night-shift clock with stars |
| icon-bp_scrap | a ledger book |
| icon-bp_power | crossed hammers |
| icon-bp_mf | a treasure map |
| icon-bp_vault | a vault door |
| icon-bp_start | a fast-forward gear |
| icon-bp_wrench | a golden wrench |
| icon-bp_time | an hourglass |
| icon-bp_idle | a dreaming moon over a factory |

## Sounds

| name | what it sounds like | length (s) |
|---|---|---|
| tick | a tiny crisp clock tick | 0.05 |
| clank | two heavy brass gears clunking together as they mesh | 0.3 |
| merge | a satisfying ratcheting click-click-CLUNK as two gears fuse, with a little shimmer | 0.6 |
| zap | a short electric wrench zap, crackly | 0.15 |
| hit | a small metallic toy-sword clink | 0.12 |
| pop | an enemy breaking apart: a soft crunchy pop of scrap | 0.2 |
| coin | a bright single brass-nut clink being picked up | 0.12 |
| loot | a gear drop: a warm chime | 0.5 |
| loot-rare | a rarer drop: a brighter rising two-note chime with sparkle | 0.7 |
| loot-legendary | a legendary drop: a big resonant bell chord with a shimmering tail | 1.5 |
| crank | a fast ratcheting wind-up of a mainspring | 0.8 |
| spell | a soft magical whoosh with a clockwork tick inside it | 0.4 |
| bolt | a crackling lightning snap | 0.3 |
| door | a heavy thud on a wooden door | 0.3 |
| boss | a deep mechanical roar with grinding gears | 1.5 |
| win | a short triumphant brass fanfare with a clock chime | 2.0 |
| lose | a winding-down clockwork slump (a spring unwinding to a stop) | 1.2 |
| buy | a cheerful cash-register ding with a ratchet | 0.4 |
| nope | a dull low clunk | 0.15 |
| music-bench | seamless loop: calm cosy workshop music, music-box and soft strings over a gentle clock tick, warm | 45–60 |
| music-battle | seamless loop: brisk adventurous clockwork march, pizzicato strings, brass, snare, ticking percussion | 45–60 |
