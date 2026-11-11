# Ore Sweeper: asset spec

**Style.** Cosy-gritty fantasy mining, seen face-on: a lamp-lit rock wall at night. Chunky painted shapes with a soft
rim light from a warm lantern (top-left), deep shadows, slightly toy-like proportions (think a storybook mine, not
grimdark). Palette: warm lamp amber `#ffb703` / `#ffd166`, coal brown `#2e241b` / `#140e09`, copper `#e09f3e`,
silver `#cbd5e1`, gold `#ffc300`, crystal violet `#b46cff`, mithril teal `#56cfe1`, gas green `#95d5b2`, magma
orange `#f97316`, heart red `#d62828`. Every ore sprite is a **lump of rock seen from the front with the metal or crystal
embedded in it**, roughly round, filling the 512 canvas with ~8% margin, transparent background, no cast shadow (the code
draws one). Avoid: text, UI frames, glow halos baked in past the silhouette, photo-real textures, busy backgrounds behind
sprites, anything that reads as a cute face on the ore. Backgrounds: very dark, low contrast in the middle 70%.

## Images (23)

| name | kind | subject | priority |
|---|---|---|---|
| hero-dwarf | hero bust | Brakka, a stout red-bearded dwarf woman in a brass miner's helmet with a lit lamp, grinning, braided beard with copper rings | 1 |
| hero-gnome | hero bust | Fizzwick, a wiry gnome tinkerer in a tall red pointed hat and round blue goggles, white beard, a tiny wrench behind his ear | 1 |
| hero-mole | hero bust | Grub, a plump purple-grey mole with a pink star nose, huge pink digging paws raised, squinting happily, a hard hat tipped back | 1 |
| hero-sala | hero bust | Cinder, an orange salamander with pink feathery gills, golden spots, a little flame flickering on its head, ember-bright eyes | 1 |
| boss-heart | boss | The Heart of the Mountain: a huge faceted ruby-red crystal heart embedded in black stone roots, glowing from inside, cracks of light; front view | 1 |
| obj-copper | ore | A lump of brown host rock studded with chunky glossy copper nuggets | 1 |
| obj-silver | ore | A lump of grey rock with bright white-silver metallic veins and nuggets catching the light | 1 |
| obj-gold | ore | A lump of dark rock with fat shining gold nuggets bursting out of it | 1 |
| obj-mithril | ore | A lump of dark blue-black rock with glowing pale-teal mithril crystals threaded through it | 2 |
| obj-crystal | ore | A rock bed with five violet amethyst prisms bursting upward out of it | 1 |
| obj-iron | ore | A large heavy boulder of dark iron ore with rust-red and steel-grey bands, visibly tougher than the rest | 2 |
| obj-geode | ore | A split-open round geode: rough brown shell, purple crystal-lined hollow, one bright gem in the middle | 2 |
| obj-cluster | ore | A cluster of icy pale-blue crystal spikes fanning out from a small rock base | 2 |
| obj-mother | ore | A big round motherlode boulder cracked open to reveal a glowing violet cavity full of crystals and gems | 1 |
| obj-granite | hazard | A blocky six-sided slab of hard dark granite, flecked grey, sharp edges, no ore at all | 1 |
| obj-gas | hazard | A puffy pale-green bubble of firedamp gas with a few smaller bubbles, translucent, slightly menacing | 2 |
| obj-sentinel | boss minion | A black volcanic magma stone with glowing orange cracks across it, about to erupt | 1 |
| obj-vein | boss minion | A short knot of blood-red crystal growing out of stone, a pulsing vein feeding the Heart | 2 |
| obj-flask | pickup | A small round glass flask of glowing amber lamp oil with a cork stopper and a leather cord | 1 |
| obj-cart | helper | A little wooden mine cart heaped with copper ore, iron-banded, two wheels visible, side view facing right | 2 |
| obj-vault | ore | A round ancient dwarven vault door of grey stone set in rock, iron bolt cross, teal glowing runes around the rim, front view | 2 |
| obj-dynamite | pickup | A single red stick of dynamite with a short lit fuse, tilted slightly | 3 |
| bg-rock | background | Portrait 780x1688 view of a dark mine tunnel wall: layered strata, faint wooden support beams at the edges, centre very dark and plain | 2 |

(23 images; the code draws everything else, including the drill, rubble and effects.)

## Sounds (14 + music)

| name | what it sounds like | length (s) |
|---|---|---|
| crack | a rock cracking open: sharp stone snap with a little gravel scatter | 0.25 |
| coin | a bright metal clink, like a nugget dropped in a tin pan | 0.2 |
| ding | a crystal chime, glassy and pure (gem found) | 0.4 |
| boom | a muffled underground explosion with rumbling debris | 0.8 |
| hit | a heavy pick strike on metal, short and solid (critical hit) | 0.15 |
| zap | a gas hiss igniting: short fizz then whoomp | 0.35 |
| grind | a short grinding whirr of a drill biting into hard granite (one layer chipped off) | 0.3 |
| cave | rocks rumbling and starting to fall from the ceiling (cave-in warning) | 0.6 |
| heart-beat | a deep, resonant single heartbeat thump inside stone | 0.5 |
| motherlode | a rising sparkly crystal arpeggio with a happy shimmer | 0.8 |
| flask | a cork pop and a glug of oil | 0.3 |
| glint | a bright two-note sparkle, like a gold coin catching the light | 0.4 |
| rush | a short excited fanfare of clinking picks and a rising chime (gold rush begins) | 0.8 |
| lastlight | a breathy whoosh as a lamp flares up bright one last time | 0.6 |
| music-loop | quiet low ambient mine: distant drips, soft low drone, faint pick taps far away, seamless | 30 |
