# High Roller: art and sound wish list

The game currently uses CSS, emoji and canvas drawing plus WebAudio synth sounds, and plays fine without any of this. This is the list to send the Media Helper when we want real assets. File names are the contract. The import step (`tools/assets.py import high-roller`) would need a small loader added to `app.js` first.

Style: a warm, slightly retro Las Vegas lounge with deep burgundy, gold trim and green felt. Glossy and friendly, not gritty. Transparent backgrounds (or a plain backdrop that can be keyed out) unless noted.

## Images

| Name | Size / format | What |
|---|---|---|
| `sym-cherry`, `sym-lemon`, `sym-grapes`, `sym-bell`, `sym-bar`, `sym-seven`, `sym-wild`, `sym-star` | 256×256 PNG | Slot reel symbols in one consistent glossy style. Seven is red with gold edging. BAR is a black bar with gold border. WILD is a purple-pink badge. Star is gold (it's the scatter). |
| `cabinet-top` | 780×160 PNG | Slot machine marquee with bulbs reading "LUCKY SEVENS". |
| `felt` | 780×520 PNG, opaque | Blackjack table felt, top-down, with a faint gold arc and "BLACKJACK PAYS" lettering space. |
| `card-back` | 200×280 PNG | Card back: burgundy lattice with a gold "HR" monogram. |
| `poker-bezel` | 780×300 PNG | Video poker cabinet frame, blue screen glow, chrome edges. |
| `wheel` | 600×600 PNG | Roulette wheel face without numbers, so the game can keep drawing its own numbers on top. |
| `chip-red`, `chip-gold`, `chip-blue`, `chip-black` | 128×128 PNG | Casino chips, top-down, used for the chip counter and coin showers. |
| `icon-slots`, `icon-blackjack`, `icon-poker`, `icon-roulette`, `icon-lounge` | 128×128 PNG | Tab-bar icons, in the same style as the symbols. |
| `vip-star` | 128×128 PNG | Gold VIP star with a sparkle. |
| `app-icon` | 1024×1024 PNG, opaque | Home-screen icon: a gold seven on a burgundy chip. |

## Sounds (mono, short, normalized)

| Name | Length | What |
|---|---|---|
| `reel-spin` | 1.5 s loop | Mechanical reel whir. |
| `reel-stop` | 0.15 s | One reel clunking to a stop. |
| `card-deal` | 0.12 s | A card snapped onto felt. |
| `card-flip` | 0.15 s | A card turned over. |
| `chip` | 0.1 s | One chip clack. |
| `chips-stack` | 0.6 s | A stack of chips pushed across felt (for wins). |
| `win-small` | 0.8 s | A short bright jingle. |
| `win-big` | 2.5 s | Bells, coin rain and a fanfare. |
| `lose` | 0.4 s | A soft, not-mean "wah". |
| `ball-roll` | 3 s | A roulette ball rolling, then rattling into a pocket. |
| `level-up` | 1.2 s | Casino-floor ding-ding with a rising arpeggio. |
| `buy` | 0.3 s | A register "cha-ching". |
| `lounge-music` | 60–90 s loop | Low-key lounge jazz: brushed drums, upright bass, vibes. |
