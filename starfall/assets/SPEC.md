# Starfall Battery: asset spec

**Style.** Retro-futurist arcade sci-fi, like a glossy 1980s pinball backglass painted over a deep-space scene. Chunky readable
silhouettes, soft rim light, bold saturated colour on dark. Palette: space navy `#04041a` / indigo `#1f1250`, plasma cyan
`#7df9ff`, shield blue `#4cc9f0`, gold `#ffd166`, alarm red `#ff4d6d`, alien greens `#80ed99`, purples `#c77dff` / `#5a189a`,
hot pink `#f72585`, warm orange `#ff9f1c`. Aliens are cute-menacing (big eyes, gloss, tentacles), never gory. Player ships are
clean grey-blue hulls with cyan glow. Avoid: text, logos, UI frames, photo-realism, busy backgrounds behind sprites, heavy
black outlines thicker than ~4 px at 512, drop shadows baked onto the transparent area. Sprites on a plain flat backdrop
(transparent preferred) at 512x512, subject filling ~85% of the frame.

## Images (20)

| name | kind | subject | priority |
|---|---|---|---|
| hero-corvette | hero | Bust portrait of a confident young pilot in a sleek cyan-visored flight helmet, orange flight-suit collar, a small arrowhead starfighter decal on the helmet, 3/4 view facing the viewer. | 1 |
| hero-carrier | hero | Bust portrait of a calm older fleet captain with a grey beard and green-trimmed navy cap, tiny fighter-drone hologram hovering by the shoulder, 3/4 view. | 1 |
| hero-lancer | hero | Bust portrait of an intense sharpshooter with a magenta targeting monocle and a high-collared white armour coat, hot-pink light on one side of the face, 3/4 view. | 1 |
| hero-weaver | hero | Bust portrait of a serene engineer with violet hair tied up, glowing violet threads of light wound between their raised fingers, lavender tech headset, 3/4 view. | 1 |
| boss-mothership | boss | A huge flying-saucer mothership seen from slightly below: wide dark-purple hull, glowing pink-red glass dome with two menacing eye-lights inside, a ring of green and gold running lights round the rim. Wide format (subject about 2.5x wider than tall), centred. | 1 |
| enemy-drone | enemy | A small round green jellyfish-like alien saucer with a pale glass dome, two big black eyes and four short wiggly tentacles underneath, facing the viewer. | 1 |
| enemy-brute | enemy | A chunky purple armoured alien with two curved horns, red glowing eyes and short tentacles, heavy and squat, facing the viewer. | 1 |
| enemy-elite | enemy | A gleaming golden version of the small jellyfish alien saucer, with a thin bright halo ring around it and sparkling highlights, facing the viewer. | 1 |
| enemy-warded | enemy | A blue alien saucer-jelly with a crystalline cyan carapace and frosty eyes (no bubble: the code draws the shield bubble), facing the viewer. | 2 |
| enemy-swarm | enemy | A tiny red alien wasp with clear buzzing wings and two big dark eyes, seen from the front/top. | 2 |
| enemy-hive | enemy | A fat pink-purple egg-sac carrier alien, translucent belly full of glowing eggs, one red central eye, dangling tentacles, slow and bloated, facing the viewer. | 1 |
| enemy-pod | enemy | A hexagonal alien shield generator pod: dark crimson armour plates around a glowing pink energy core. | 2 |
| unit-corvette | unit | Top-of-screen view of a wide grey-blue battleship deck seen from the front and slightly above: flat hull with a cyan glowing bridge dome in the centre and two empty turret mounts left and right. Very wide (about 4x wider than tall), no guns (the code draws the turrets). | 2 |
| unit-carrier | unit | Same framing as the corvette deck but bulkier and wider, with green-lit hangar bay doors at both wing tips and a cyan bridge dome; no guns. About 4x wider than tall. | 3 |
| unit-lancer | unit | Same framing: a narrower sleek white-and-grey hull with a single central magenta-glowing cannon housing, no barrel. About 4x wider than tall. | 3 |
| unit-weaver | unit | Same framing: a violet ring-shaped hull with glowing lavender threads trailing from both sides and a cyan bridge dome; no guns. About 4x wider than tall. | 3 |
| unit-drone | unit | A tiny green arrowhead fighter drone with an orange engine glow, pointing straight up, seen from above. | 3 |
| obj-crate | obj | A chunky sci-fi supply crate with green glowing seams, a small parachute-like hover fin on top and a bright plus symbol shape (no text), 3/4 view. | 2 |
| bg-space | bg | Portrait deep-space scene: navy-to-indigo gradient, soft purple and cyan nebula clouds near the edges, a small ringed peach planet top right, sparse stars. Only the TOP ~40% of the image is ever visible (the pellet machine covers the rest), so put all the interest in the top third and keep its middle calm and dark (aliens fly there). | 1 |
| bg-boss | bg | The same deep-space framing but ominous: red-magenta nebula glow along the very top, a faint vast alien silhouette far behind. Again only the top ~40% shows; keep its middle dark and calm. | 2 |

## Sounds (12 + music)

| name | sounds like | length (s) |
|---|---|---|
| pop | A small wet alien pop/splat, bright and toy-like (pitch is varied by the code). | 0.12 |
| zap | A quick bright plasma release, "tssew", for tapping a pellet burst. | 0.15 |
| hit | The shield taking a hit: a thick electric thud with a crackle. | 0.25 |
| crack | An explosive pellet bursting: a short crunchy blast. | 0.25 |
| boom | A big deep explosion with a rumble tail (boss phase change, shield down). | 0.8 |
| ding | A crystalline two-note chime for a core pickup / jackpot. | 0.4 |
| gate | A short glassy "ting" of a pellet multiplying through a gate (played often, keep it soft). | 0.08 |
| bounce | A springy rubbery "boing" for the bounce pad. | 0.15 |
| shot | A tiny laser pew for one turret shot (played very often, keep it quiet and thin). | 0.06 |
| beam | A heavy charged-beam release: rising whine snapping into a deep zap (the Lancer). | 0.6 |
| siren | An alien warning siren, two falling minor notes, for the Mothership arriving. | 0.8 |
| crate | A mechanical latch pop and a cheerful whoosh: a supply crate opening. | 0.4 |
| music-loop | Quiet ambient synth pad with a slow pulsing arpeggio, spacey and tense but calm, seamless loop. | 30 |
