# Canonical hero source map

Kaki Surf uses the visual identities already defined by Kitty Kaki Survivors. This table prevents character names, donor models, and future sprite packs from drifting apart.

The model base path in Survivors is `assets/breakroom/`. These GLBs are source references and future host-integration identities; none are required or shipped by the standalone 2D game.

| Survivors avatar id | Display name | Canonical GLB | Kaki Surf status |
| --- | --- | --- | --- |
| `kitty` | Kitty Kaki | `tower-castle-plain.glb` | Primary hero; finished pixel surfer |
| `sote` | Sote | `sote.glb` | Future curated sprite set |
| `cowboy` | CowboyKaki | `cowboykaki.glb` | Future curated sprite set |
| `pipes` | Pipes | `pipes.glb` | Future curated sprite set |
| `bomdia` | Bom Dia | `bomdia.glb` | Future curated sprite set |
| `mothman` | Mothman | `mothman.glb` | Future curated sprite set |
| `camper` | Camper | `camper.glb` | Future curated sprite set |
| `space` | Space Kitty | `spacekitty.glb` | Future curated sprite set |
| `radcat` | Radcat | `radcat.glb` | Future curated sprite set |
| `mona` | Mona | `mona.glb` | Future curated sprite set |
| `bezelbug` | BezelBug | `bezelbug.glb` | Future curated sprite set |
| `rocker` | RockerKaki | `rockerkaki.glb` | Future curated sprite set |
| `borgirboss` | BorgirBoss | `borgirboss.glb` | Future curated sprite set |
| `rune_kitten` | Rune Kitten | `tower-castle-plain.glb` + cyan tint | Future palette variant |
| `mire_kitten` | Mire Kitten | `tower-castle-plain.glb` + green tint | Future palette variant |
| `shroud_kitten` | Shroud Kitten | `tower-castle-plain.glb` + violet tint | Future palette variant |

## Primary hero translation

The Blender reference render confirms Kitty Kaki as the blue-bob, pale-faced plush cat in a black hoodie. The gameplay sprite preserves the large head, tall soft ears, face fringe, hoodie body, pale paws, dark feet, compact seated-plush mass, and calm cat expression. It redraws those forms directly on the logical pixel grid rather than rasterizing or downscaling the model.

The supplied plush JPG describes the same Kitty Kaki identity and remains a secondary physical-material reference. The standalone game does not load `tower-castle-plain.glb`; this avoids a roughly 15 MB startup cost and keeps physics, rendering, and GitHub Pages deployment independent from the Three.js host.

## Integration contract

`SURVIVORS_HERO_SOURCES` in `js/config.js` is the machine-readable map. A later Survivors adapter should pass the selected `avatarId`; Kaki Surf can then choose an approved pixel sprite set while the Three.js host continues using its own GLB cache. Unsupported avatars must fall back to `kitty`, never to an unreviewed automatic rasterization.
