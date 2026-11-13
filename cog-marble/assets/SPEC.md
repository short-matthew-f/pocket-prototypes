# Cog & Marble: asset spec

**Style.** A warm Victorian-tinkerer workshop seen from straight above: dark walnut pegboard, polished brass and copper,
glass and steel marbles that look like real toys. Friendly and toy-like (think a handmade marble run), not grimy steampunk.
Palette: walnut #3a2a1b / #2b1f14, brass #c9a46a / #e2c48d, copper #b87333, steel #8c96a3, accent gold #ffcf6e.
Soft top-left light, gentle shadows. Avoid: text, logos, UI frames, characters or brand likenesses, busy detail on the
board (the plates, grooves and marbles must read on top of it), copying any existing game's art.
Everything except bg-* and hero-* is seen **from directly above** (top-down), centred, on a plain backdrop.

| name | kind | subject | priority |
|---|---|---|---|
| bg-board | bg 780x1688 | A dark walnut pegboard filling the frame, evenly drilled with small round holes, faint wood grain, darker vignette at the edges; calm and low-contrast in the middle | 1 |
| obj-plate | sprite | A round brass turntable disc seen from directly above: a smooth brushed-brass face with a thin darker rim and a small centre hub. **No grooves, slots or markings** (the game cuts the grooves). Perfect circle filling the square | 1 |
| obj-vault | sprite | A small squat iron strongbox seen from the front, riveted, with a brass keyhole plate and a slot on top where marbles fall in; wider than tall (about 4:1 box) | 2 |
| tower-pin | sprite | Top-down: a little brass turret with a short pin-gun barrel pointing up (north), round base, blue enamel band | 1 |
| tower-hammer | sprite | Top-down: a round base with a stubby steam-hammer head on a short arm, rust-red enamel, rivets | 1 |
| tower-magnet | sprite | Top-down: a round base holding a big red-and-silver horseshoe magnet, faint purple shimmer | 1 |
| mar-clay | sprite | Top-down: a matte terracotta clay marble with a soft highlight | 1 |
| mar-glass | sprite | Top-down: a clear pale-blue glass marble with a white swirl inside and a bright glint | 1 |
| mar-shard | sprite | Top-down: a small chipped chunk of pale-blue glass, rounded so it still reads as a little marble | 2 |
| mar-rubber | sprite | Top-down: a glossy hot-pink rubber bouncy ball with a thin darker stripe | 1 |
| mar-steel | sprite | Top-down: a polished chrome ball bearing reflecting a dim workshop | 1 |
| mar-cannon | sprite | Top-down: a huge black iron cannonball, pitted, with a riveted band and a glowing orange crack (the boss) | 1 |
| hero-tilly | hero bust | Tilly the Tinker: young woman, freckles, ginger bob under a brown cap, brass goggles pushed up, a pencil behind her ear, cheerful | 1 |
| hero-gus | hero bust | Gus the Gearwright: big grey-bearded older man, leather apron, a gear-shaped monocle, grease on his cheek, kindly | 1 |
| hero-marla | hero bust | Marla Magnet: woman with dark curly hair, a long purple coat, a horseshoe-magnet brooch, faint sparks in her hair, mischievous smile | 1 |

## Sounds (mono, short, no leading silence)
| name | what it sounds like | length |
|---|---|---|
| tick | one soft clockwork escapement click (the machine plays it every ~0.6 s, so very quiet and pleasant) | 0.05 |
| clunk | a heavy gear being slotted onto a peg | 0.25 |
| jump | a marble hopping a gap: a quick light "tok" on wood | 0.15 |
| clink | a pin glancing off a steel marble | 0.1 |
| pin | a small spring-gun firing a pin, a crisp "pew-tick" | 0.12 |
| pop | a clay marble cracking apart (replaces the synth pop for every marble) | 0.2 |
| hit | a steam hammer slamming down | 0.3 |
| zap | a short magnet zap, electric crackle | 0.2 |
| boom | a marble crashing into the iron vault, metal thud plus rattle | 0.6 |
| coin | brass coins dropping into a tray | 0.3 |
| ding | a little brass bell (new wave) | 0.5 |
| win | a music-box flourish | 1.5 |
| music-loop | a gentle music-box / ticking-clock workshop tune, seamless loop | 30 |
