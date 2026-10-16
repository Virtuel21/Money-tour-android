# Money Tour credits

Original code licensed under MIT; see LICENSE. The project is not affiliated with another publisher and does not reuse assets from the reference game.

## Original models and interface

Original creations for Julien, MIT: scripts/art_*.py and scripts/build_models.py, apps/web/public/models/money-tour.glb (current export: board, tiles, dice, gardens, palm trees and special pieces; characters, architecture and islands remain in the Blender sources), apps/web/src/board/Board3D.tsx (scene composition), App.tsx, styles.css, favicon.svg and social-card.svg/png. Modelled in Blender 5.2.2 through its connected MCP. The three artworks supplied by Julien are art direction references; their source files are not redistributed in the repository. System fonts Trebuchet MS/Arial; no font files are redistributed.

## Generated images

`apps/web/public/textures/special-tiles-v1.webp`: original Chance/Tax atlas generated with ChatGPT's integrated image tool on 26 September 2026, then encoded as WebP at quality 90. No third-party assets are incorporated in this atlas. Exact prompt in `docs/IMAGE_PROMPTS.md`.

Original creations with ChatGPT's integrated image generator: apps/web/public/textures/ocean.webp (old sea, retained but unused since the artwork update), chance.webp (card), travelers-v3.webp (four detailed characters), architecture-v3.webp (house, hotel and four dioramas). Scene illustrations are sprites, not 3D meshes. Prompts and provenance in docs/IMAGE_PROMPTS.md.

## Audio supplied by Julien

The twenty reactions (`apps/web/public/taunts/*.webp`) are original creations generated with the integrated imagegen tool from the faces in `travelers-v3.webp`, then encoded as transparent 320 × 320 WebP. Five expressions per character; no illustration extracted from another game. Exact prompts: [TAUNTS_ART.md](docs/TAUNTS_ART.md).

- apps/web/public/audio/menu.mp3: “Property Party - main menu.mp3”.
- apps/web/public/audio/game.mp3: “Property Party - Party running song.mp3”.
- apps/web/public/audio/game-2.mp3: “Property Party - party running song 2.mp3”.
- apps/web/public/audio/game-3.mp3: “Property Party - party running song 3.mp3”.

The two new tracks are complete, encoded as 64 kb/s stereo MP3 for download. The playlist alternates the three in-game tracks; only one file loads at a time, without preloading the playlist.

`models/wealth.glb` and `scripts/wealth_models.py`: eight-layer banknote bundles, paper bands, bevelled gold bars and stamps, created in Blender through MCP for each player's reserves. Original creations, MIT.

Sources: local Money tour assets/songs folder, supplied for game integration. These recordings are separate from the code's MIT licence; no CC0 licence is assigned to them.

## Library sound effects

Author: Kenney. [Interface Sounds](https://kenney.nl/assets/interface-sounds) pack, [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) licence; attribution is optional. Redistributed files: apps/web/public/audio/switch_001.ogg (dice), drop_001.ogg (steps), select_001.ogg (card), confirmation_001.ogg (construction). Notice retained in audio/Kenney-LICENSE.txt. Purchase, rent, victory and bankruptcy effects remain original Web Audio syntheses, MIT.

## Libraries

React, Three.js, Vite, Vitest, Trystero and Zod: MIT. TypeScript and Sharp: Apache-2.0. Their notices remain in the dependency distributions. Blender is the model creation tool, not a browser runtime dependency.

## Fortune, alliance and duel

models/fortune.glb and scripts/casino_models.py: roulette, slot machine, shield/house and Karma scales, four roots and 117 objects created in Blender 5.2.2 through MCP. Original creations, MIT. Editable scene delivered: money-tour-fortune.blend; existing scenes retained.

textures/expansion-v1.webp: original atlas generated with ChatGPT's integrated image tool, native 1254 × 1254, WebP quality 95. [Exact prompt and provenance](docs/FORTUNE_ART.md). No third-party assets incorporated.

[@noble/hashes](https://github.com/paulmillr/noble-hashes), version 2.4.0, MIT, verifies SHA-256 commitments for duel choices.

## Special spaces and Festival (v15)

Five original illustrations generated with the integrated imagegen tool: `lost-island-v1.webp`, `festival-stage-v1.webp`, `chance-tile-v2.webp`, `tax-tile-v2.webp`, `insurance-tile-v2.webp`. Style reference: our `architecture-v3.webp` atlas. No new third-party assets. Native 1254 × 1254 dioramas and 1024 × 1536 textures; delivered as 768 × 768 and 768 × 1152 WebP. [Exact prompts, provenance and integration](docs/SPECIAL_TILES_ART.md).
