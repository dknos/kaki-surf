# Asset manifest and provenance

Kaki Surf ships no raw or downscaled AI artwork, Blender render, NFT/gallery image, supplied reference JPG, GLB mesh, GLB texture, copied game art, sampled song, or California Games asset as runtime content. It makes no runtime image-generation, model-hosting, asset-CDN, or other remote API request.

The production gameplay look is code-authored at the 384 x 216 logical resolution. Canvas primitives, curated pose data, palette constants, and HTML/CSS create the final pixels directly; generated concepts or offline 3D references are not gameplay frames.

## Production pipeline

```text
simulation state + semantic events
              |
              +--> sprites.js ------> Kitty poses, board shapes, flex, wake
              +--> wave-visuals.js -> face bands, shared power seam, curl, foam
              +--> renderer.js -----> conditions, HUD, particles, composition
                                      |
                                      v
                           384 x 216 Canvas pixels
                                      |
                                      v
                         nearest-neighbor CSS scaling
```

`renderer.js` consumes gameplay state but does not invent trick, landing, or speed-potential truth. Pose selection reads state, maneuvers, `trickPose`, and landing data. Wave presentation calls the same `powerFaceAt` and `speedPotential` queries used by simulation. Semantic events add bounded-pool spray, seam glints, trick marks, landing impacts, wobble/wipeout effects, and personal-best sparkles.

## Shipping asset sources

| Source | Form and responsibility | Provenance | Production status |
| --- | --- | --- | --- |
| `js/sprites.js` | Code-authored Kitty sprite renderer, 27 state/trick pose definitions, three board draw paths, angle snapping, flex, and board-specific wakes | Original connected pixel clusters informed by the approved Kitty Kaki identity; no copied source pixels or textures | **Production; imported by `renderer.js`** |
| `js/wave-visuals.js` | Layered face bands, dither, safe shoulder, directional streaks, canonical power seam, tube shadow, curl mass, foam fingers, crest feathering, and Wave Read overlay | Original Canvas construction; physical seam comes from `GameplayWave` queries | **Production; imported by `renderer.js`** |
| `js/renderer.js` | Golden Coast, Twilight Glass, and Stormbreak backgrounds; HUD; landing/trick panels; event VFX; camera, shake, flash, and particle composition | Original Canvas code using local modules and controlled palettes | **Production** |
| `js/pixel-font.js` | Compact Canvas glyph data and pixel-text drawing | Original local glyph definitions | **Production** |
| `js/config.js` | Board colors, condition palettes, Kitty cosmetic/identity metadata | Original palette and schema data; Survivor paths are metadata only | **Production data** |
| `js/game.js` and `styles.css` | Menu, board/condition cards, responsive touch controls, settings, results, and nearest-neighbor stage shell | Original HTML/CSS UI | **Production** |
| `js/audio.js` | Oscillator music patterns, filtered generated wave noise, and semantic event chirps | Original Web Audio synthesis; no audio samples | **Production** |
| `docs/images/menu.png` and `docs/images/ride.png` | Documentation screenshots | Captures of the running code-authored game | Documentation only; never loaded by gameplay |

There is no bitmap sprite atlas in the runtime build: `js/sprites.js` is the production pose asset. It uses discrete logical-pixel rectangles and paths so pose silhouettes, outline weight, facial marks, and board deformation remain inspectable in source. `js/wave-visuals.js` is likewise the production wave/VFX asset rather than a placeholder or concept renderer.

## Pixel rules

- Fixed 384 x 216 logical Canvas with integer-positioned sprite clusters.
- `imageSmoothingEnabled = false` and CSS `image-rendering: pixelated` / `crisp-edges`.
- Strong navy outlines, controlled condition palettes, and readable silhouettes at gameplay scale.
- Snapped board/sprite rotation to avoid continuously filtered edges.
- Connected clusters for anatomy and boards; isolated pixels reserved for intentional face marks, seam beads, spray, rain, and sparkles.
- State-driven anticipation, compression, trick, landing, and wipeout poses rather than a filtered high-resolution animation.
- Alpha is used deliberately for HUD panels, particles, impact flash, and fades, not to disguise antialiased source art.

## Board and condition assets

The three boards have independent gameplay and menu silhouettes:

- Foam Puff is short, thick, rounded, yellow/coral, softly flexing, and uses a round wake profile.
- Mango Fish is compact, sharp-railed, swallow-tailed, orange/indigo, and uses a narrow slash wake.
- Moon Log is long and narrow, lavender/navy, with a heavy extended wake and slower-feeling flex.

Golden Coast, Twilight Glass, and Stormbreak each have a dedicated palette, sky/horizon composition, ambient treatment, and music pattern. They share the same stable gameplay-wave geometry rather than duplicating collision art.

## Reference-only files

| Reference | SHA-256 | Runtime status |
| --- | --- | --- |
| `057d4b5daab18a4858c438fd81441fe4.glb` | `4539D888DD46B4F019679D01899EA353C0166546B809D7370F6FB7B47F9EB301` | Offline silhouette/color reference; rights unverified; not shipped or fetched |
| `images (26).jpg` | `948309E1E589B0FD5468658C2E76CBEA2375A3533845BE7AFE670250A697FC23` | Offline visual reference; rights unverified; not shipped or fetched |

The supplied GLB was assessed as an offline turnaround reference: 815,432 vertices, roughly 1.5 million triangles, three embedded 4096-square textures, and no animation rig or embedded copyright/license metadata. None of that geometry or texture data enters the standalone runtime.

## Kitty Kaki Survivors identity sources

The Survivors repository is an additional first-party-universe reference. Its exact mapping is recorded in [Hero source map](./HERO-SOURCE-MAP.md) and exported as `SURVIVORS_HERO_SOURCES` from `js/config.js`.

- Kitty Kaki is avatar ID `kitty` and refers to `assets/breakroom/tower-castle-plain.glb`.
- CowboyKaki is avatar ID `cowboy` and refers to `assets/breakroom/cowboykaki.glb`.
- Other named Survivors have dedicated metadata paths; three hidden kitten variants reuse the Kitty donor identity with palette tints.
- `runtimePolicy: "reference-only"` is explicit. The standalone game does not fetch, copy, parse, or render those GLBs.

## External style references

- [Kemono Kaki on OpenSea](https://opensea.io/collection/kemonokaki) - reference only; no downloaded or sampled pixels.
- [Kaiju Kaki gallery](https://www.scatter.art/c/kaijukaki/gallery) - reference only; no downloaded or sampled pixels.
- [Kitty Kaki Survivors](https://dknos.github.io/kitty-kaki-survivors/) - universe and integration reference only.

The production direction uses broad neo-chibi plush proportions, limited palettes, clear silhouettes, and handheld-scale readability. It does not copy token trait stacks, collection backgrounds, logos, weapons, costumes, proprietary layouts, audio, or code.

An optional social card outside the gameplay runtime may use generated raster work derived from inspected menu/ride captures and an authorized character reference. Its process is recorded in [Social card prompt](./SOCIAL-CARD-PROMPT.md). It is not a gameplay asset and is not loaded by `index.html` or the native module graph.

## Rights note

The user requested Kitty Kaki as the hero and supplied the reference files. Before a public commercial, merchandising, or collectible release, archive written authorization covering the Kitty Kaki character, Oekaki Maker #4272 if applicable, the plush design contribution, game and merchandising rights, and any NFT-related use. NFT ownership alone should not be treated as blanket permission for commercial character art.
