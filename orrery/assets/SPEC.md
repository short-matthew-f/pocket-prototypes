# Orrery: art and sound wish list for the Media Helper

The game ships with vector art drawn in code. This list is what we'd ask the Media Helper for later. **The names below are the contract** the code will look up. Nothing here has been requested yet.

**Style for everything:** neon clockwork in deep space. Brass-and-glass machinery with glowing edges. Saturated cyan, magenta and gold on a near-black navy (#0b0e1f). Clean silhouettes that read at 24–48 px on a phone.

For images:
- Deliver each sprite on a plain flat backdrop so it can be keyed out.
- Sprites are seen from the top down and point **up** (angle 0 = up).

## Ship and hulls (`img/hull-*.webp`, 384 px square)
Top-down, sockets visible as small brass rings.

| Name | Subject |
|---|---|
| `hull-disc` | Round saucer with 3 rim sockets |
| `hull-cross` | Plus-shaped spar frame with 4 tip sockets |
| `hull-needle` | Long thin triangle, 5 sockets (nose + 2 per side) |
| `hull-blob` | Soft jelly body with 5 rim sockets. It needs a squash-and-stretch look; it will be deformed in code. |
| `hull-hexagon` | Armoured hexagon with 6 corner sockets |
| `hull-spine` | One caterpillar segment, reused 5 times |
| `hull-ring` | Thin halo ring with 8 sockets |
| `ship-core` | The little arrowhead pilot pod at the centre, with an engine glow |

## Joints (`img/joint-*.webp`, 192 px)
| Name | Subject |
|---|---|
| `joint-rotor` | Spoked hub |
| `joint-pendulum` | Pivot with a weight |
| `joint-slider` | Carriage on a rail |
| `joint-piston` | Hydraulic piston |
| `joint-cam` | Oval cam |
| `joint-stepper` | Ratchet wheel |
| `joint-flywheel` | Heavy flywheel |

## Gadgets (`img/gadget-*.webp`, 192 px, pointing up)
- **Melee:**

  | Name | Subject |
  |---|---|
  | `gadget-saw` | Saw blade |
  | `gadget-flail` | Spiked ball only; the chain is drawn in code |
  | `gadget-drill` | Drill bit |
  | `gadget-whip` | Whip handle |
  | `gadget-sword` | Long blade, tall aspect |

- **Ranged:**

  | Name | Subject |
  |---|---|
  | `gadget-blaster` | Blaster |
  | `gadget-spread` | Scattergun |
  | `gadget-laser` | Laser |
  | `gadget-missile` | Missile pod |
  | `gadget-mortar` | Mortar |
  | `gadget-chain` | Tesla coil |
  | `gadget-mines` | Mine layer |

- **Defence:**

  | Name | Subject |
  |---|---|
  | `gadget-shield` | Curved plate |
  | `gadget-deflector` | Chevron mirror |
  | `gadget-bubble` | Bubble |
  | `gadget-pointdef` | Twin-barrel mini turret |
  | `gadget-decoy` | Ghost ship |
  | `gadget-repair` | Repair drone with a rotor |
  | `gadget-magnet` | Horseshoe magnet |

## Specials (`img/spec-*.webp`, 192 px round button icons)
| Name | Subject |
|---|---|
| `spec-nova` | Nova burst |
| `spec-overdrive` | Overdrive |
| `spec-blackhole` | Black hole |
| `spec-tractor` | Tractor beam |
| `spec-timeslow` | Time slow |

## Enemies (`img/enemy-*.webp`, 256 px, pointing **down**)
Glowing alien machines in red, orange, pink and violet.

| Name | Subject |
|---|---|
| `enemy-drone` | Small arrowhead |
| `enemy-weaver` | Diamond that sways |
| `enemy-swarm` | Tiny dart |
| `enemy-gunner` | Hexagon with a turret |
| `enemy-dasher` | Spearhead that charges |
| `enemy-tank` | Armoured block |
| `enemy-splitter` | Twin-lobed cell |
| `enemy-boss` | Dreadnought, 512 px, wide and menacing, with a spinning core |

## Effects and backdrop
| Name | Subject |
|---|---|
| `bg-space` | 780 px wide, tall portrait, seamless vertical scroll. Dark nebula, very low contrast so the bullets read. |
| `fx-coin` | 64 px gold cog-coin |

## Sounds (`sfx/*.mp3`, mono, short, punchy)
| Name | Length | Description |
|---|---|---|
| `shoot` | 0.05 s | Soft tick for the nose gun. It plays constantly, so it must stay quiet. |
| `blaster` | 0.08 s | Pew |
| `spread` | | Shotgun puff |
| `mortar` | | Thunk |
| `missile` | | Whoosh |
| `laser` | 0.35 s | Laser hum |
| `zap` | | Electric crackle |
| `mine` | | Mine drop |
| `lash` | | Whip crack |
| `saw` | | Grind (a loop would be nice) |
| `hit` | | Metallic tink |
| `kill` | | Small pop-explosion |
| `kill-big` | | Large explosion for tanks and bosses |
| `coin` | | Coin blip |
| `hurt` | | Hull hit, crunchy |
| `pop` | | Bubble pop |
| `block` | | Shield ping |
| `nova` | | Nova whoomp |
| `overdrive` | | Overdrive spin-up |
| `blackhole` | | Black hole drone |
| `timeslow` | | Time-slow pitch-down |
| `boss-warn` | | Boss klaxon |
| `win` | | Win fanfare (short) |
| `lose` | | Lose sting |
| `buy` | | Shop buy |
| `nope` | | Can't-afford buzz |
| `music-run` | ~60–90 s loop | Driving synthwave |
| `music-hangar` | ~60–90 s loop | Calm clockwork ambient |
