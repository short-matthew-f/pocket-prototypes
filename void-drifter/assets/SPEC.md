# Void Drifter: asset spec

**Style.** Top-down arcade space, seen from straight above. Chunky, readable silhouettes with a dark outline (#0b0a12),
soft painted shading, small glowing details; like a polished mobile shmup, not photoreal. Deep-space mood: the void is
near-black navy (#070a1c to #03040b) with faint cyan (#4cc9f0), violet (#c77dff) and magenta (#f72585) nebula haze.
Ships are warm and friendly (wasp yellow #ffd166, bulwark ice-blue #8ecae6, phantom violet #c77dff with teal #72efdd,
wrecker orange #ff8c42); enemies read hostile (drones red #ff6b6b, hunters magenta #f72585, lancers amber #ff9f1c);
salvage is mint green (#7bf1a8), void shards lilac (#e0aaff). The Leviathan is deep-sea blue (#123552 to #3a86b0)
with magenta fins and teal bioluminescent spots. Avoid: text, UI frames, lens flares, motion blur, drop shadows on the
ground (there is no ground), busy backgrounds behind sprites (plain flat backdrop please), and any perspective other than
top-down for in-run sprites. Ships, the lancer and the Leviathan head must **point UP (nose to the top of the image)**;
the code rotates them to their heading. Round things (rocks, drones, balls, pickups) can be any orientation.

## Images

| name | kind | subject | priority |
|---|---|---|---|
| hero-wasp | hero bust | A cocky young pilot in a yellow-and-black striped flight helmet with bee-like antennae and an amber visor, grinning, 3/4 view. | 1 |
| hero-bulwark | hero bust | A broad, calm veteran pilot in a bulky ice-blue armored suit with a riveted visor pushed up, orange shoulder lights, 3/4 view. | 1 |
| hero-phantom | hero bust | A mysterious pilot in a sleek violet hooded flight suit, face hidden behind a teal glowing visor that trails wisps of light, 3/4 view. | 1 |
| hero-wrecker | hero bust | A grinning salvage-yard brawler in a scuffed orange work suit and welding goggles, a heavy chain slung over one shoulder, 3/4 view. | 1 |
| unit-wasp | player ship | Top-down slim yellow dart fighter with swept wings, black stripes and a small cyan canopy, nose pointing up. | 1 |
| unit-bulwark | player ship | Top-down chunky hexagonal ice-blue gunboat with armor plates, twin side flak pods and an orange cockpit, nose up. | 1 |
| unit-phantom | player ship | Top-down sleek violet crescent-winged stealth ship with a teal diamond core glowing in the middle, nose up. | 1 |
| unit-wrecker | player ship | Top-down stubby octagonal orange salvage tug with yellow side spikes and a round winch hub in the centre, nose up. | 1 |
| unit-wingman | escort | Top-down small pale-cyan escort fighter, simple twin-tail shape, nose up. | 2 |
| enemy-rock | asteroid | A lumpy brown-grey asteroid with three craters and pale edges, seen from above. | 1 |
| enemy-crystal | asteroid | An asteroid split open by glowing violet crystal spikes, lilac light inside. | 2 |
| enemy-drone | enemy | A round red alien drone with a single white eye and a thin gold ring around it, from above. | 1 |
| enemy-hunter | enemy | A spiky magenta alien star-creature with a pale pink core and a dark pupil, menacing, from above. | 1 |
| enemy-lancer | enemy | An amber arrowhead-shaped alien dart with a hot orange tip and a single red eye, pointing up. | 1 |
| enemy-wreck | prop | A drifting derelict cargo ship hull, grey-blue panels, broken in places, one blinking green light, top-down, wider than tall. | 1 |
| boss-leviathan-head | boss | A huge space-eel head from above, deep-blue armored skull, open fanged jaws, two glowing magenta eyes, mouth pointing up. | 1 |
| boss-leviathan-segment | boss | One round armored body segment of the space eel from above, deep blue plates, two magenta fins on the sides, teal glow spot in the centre. | 1 |
| obj-salvage | pickup | A small mint-green glowing scrap cube with a bright highlight. | 2 |
| obj-shard | pickup | A lilac diamond-shaped void crystal shard with a white glint and soft violet glow. | 2 |
| obj-ball | weapon | A dark steel wrecking ball with six short gold spikes, from above. | 2 |
| bg-void | background | Deep space, near-black navy, faint cyan and violet nebula wisps at the edges, sparse tiny stars; the centre stays dark and empty. 780x1688 portrait. | 1 |
| bg-storm | background | The same deep space torn by a violet void storm: purple lightning veins and swirling magenta clouds at the edges, centre still dark. 780x1688 portrait. | 3 |

22 images.

## Sounds

| name | what it sounds like | length (s) |
|---|---|---|
| pop | a small alien drone bursting: wet electric pop | 0.15 |
| crack | an asteroid cracking apart: dry rocky crunch | 0.25 |
| hit | your hull taking a hit: heavy metal clang with a short alarm blip | 0.3 |
| zap | arc lance chain lightning: crackling electric snap | 0.25 |
| boom | big explosion (elite, wreck, boss): deep space boom, short tail | 0.8 |
| coin | salvage pickup: tiny bright glassy tick (plays very often, keep it soft) | 0.06 |
| ding | void shard pickup: crystalline chime | 0.4 |
| win | Leviathan slain: triumphant rising synth fanfare | 0.8 |
| end | hull destroyed: descending power-down whine | 0.8 |
| blink | phantom blink: airy reverse-whoosh teleport | 0.3 |
| roar | the Leviathan appears / enters frenzy: deep alien whale roar | 0.8 |
| alarm | elite inbound / gravity well: two-tone warning klaxon blip | 0.5 |
| nova | nova shockwave pulse: soft bass thump with shimmer | 0.4 |
| levelup | a level-up is ready: bright rising arpeggio sparkle | 0.5 |
| music-loop | quiet ambient synth pad, slow pulse, deep-space mood, seamless loop (mp3; the kit plays it softly during runs) | 30 |

14 sounds + music-loop (played automatically by the kit during runs).
