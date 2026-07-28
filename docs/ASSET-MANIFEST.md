# Asset manifest and provenance

Kaki Surf ships local, static presentation assets only. The runtime contains eight condition backgrounds and 16 transparent atlas families. It makes no image-generation, model-hosting, asset-CDN, analytics, or other remote API request.

Gameplay truth remains code-owned. Raster art does not define wave collision, rider motion, wildlife phases, pickup reachability, scoring, or UI state; it renders simulation state and has an independent local fallback.

## Runtime composition

```text
GameplayWave + SurfSimulation + WorldSimulation + ScoreSystem
                         |
                         v
sprites.js + wave-visuals.js + hero-wave-visuals.js + world-visuals.js
       |             |              |                  |
       +-------------+--------------+------------------+--> optional generated atlases
                         |
                         +-------------------------------> renderer.js

condition aerial panoramas --> asset-loader.js --> optional background layer
                                              --> code-authored sky fallback

all layers --> 384 x 216 Canvas --> nearest-neighbor CSS scaling
```

`js/asset-loader.js` loads each background and generated family independently, validates expected dimensions, and records a missing family without rejecting the rest. `js/asset-manifest.js` supplies atlas dimensions, frame rectangles, and anchors. `assets/generated/manifest.json` is the build record written by the deterministic source conversion.

## Condition backgrounds

| Family | Files | Dimensions | Fallback |
| --- | --- | --- | --- |
| Gameplay aerial panoramas | `assets/backgrounds/{goldenCoast,twilightGlass,stormbreak,kakiLand}-aerial.png` | 1536 x 640 each | Condition-specific Canvas coast/cloud/space bands |
| Preserved coast sources | `assets/backgrounds/{goldenCoast,twilightGlass,stormbreak}-strip.png` | 384 x 80 each | Original lower-art references retained for comparison |
| Menu art | `assets/backgrounds/{goldenCoast,twilightGlass,stormbreak,kakiLand}-menu.png` | 768 x 432 each | CSS color treatment and readable menu shell |

The first three lower environment sources were generated offline, curated, then cropped and palette-reduced by `tools/art/build-background-assets.py`. Kaki-Land's menu, continuous source, and decor atlas are deterministically cleaned from a reviewed local Grok panorama, a reviewed ImageGen Kemonokaki resident sheet, and four licensed-reference ImageGen plush conversions by `tools/art/build-kaki-land-assets.py`. All four vertical masters are rebuilt from one reviewed continuous source per condition through `tools/art/build-aerial-panoramas.py`; selection and rejection decisions are documented in [Vertical aerial source selection](./art-source/aerial/README.md) and [Kaki-Land visual provenance](./art-source/aerial/KAKI-LAND.md).

## Generated runtime atlases

Sixteen families are loaded at runtime and remain optional. Missing or invalid art falls back independently; one bad family cannot block launch or suppress another family. The continuous side-break and six-cell travelling-break outputs remain in the offline build for provenance, but browser review rejected both as active MVP silhouettes and they are absent from `js/asset-manifest.js`.

| Family key | Runtime file | Dimensions | Frame responsibility | Local fallback |
| --- | --- | ---: | --- | --- |
| `twilightHeroWave` | `twilight-hero-wave-components-atlas.png` | 256 x 144 | `contactSpray` at the board; `foamCrown`, `faceRibbons`, and `foregroundShoulder` remain packed for reproducibility but are not currently rendered | Procedural board-contact spray |
| `waveBreaker` | `wave-breaker-atlas.png` | 288 x 128 | Foam-isolated crest, spray, mist, impact, churn, and tendril accents | Continuous procedural face, curl, foam, spray |
| `waveProgression` | `wave-progression-atlas.png` | 320 x 192 | Four tapered threat stages: rounded swell, pitching lip, open curl, airy whitewater impact | Collision-aligned procedural shoulder, folding lip, shadow wedge, and churn |
| `dolphin` | `dolphin-atlas.png` | 224 x 80 | Approach, offer, mounted ride, breach, dismount | Code-authored animal silhouette |
| `shark` | `shark-atlas.png` | 224 x 72 | Shadow, fair fin telegraph, crossing, near miss, retreat | Code-authored shadow/fin/splash |
| `whale` | `whale-atlas.png` | 352 x 108 | Distant cue, blow, breach, ramp/ride, splash, departure | Code-authored whale/event shapes |
| `birds` | `birds-atlas.png` | 136 x 48 | Gulls, pelican, tern, cormorant, flock reactions | Small procedural bird silhouettes |
| `boats` | `boats-atlas.png` | 256 x 68 | Sail, speed, fishing, tug, cargo, ski, rescue, escort | Layer-appropriate hull silhouettes |
| `airTraffic` | `air-traffic-atlas.png` | 288 x 64 | Planes, helicopter, banner, drop, formation, climb | Procedural aircraft/banner marks |
| `powerups` | `powerups-atlas.png` | 96 x 48 | Mango Rush, Moon Pop, Star Foam, courier/halos/burst | Distinct geometric pickup icons |
| `boards` | `boards-atlas.png` | 256 x 72 | Top, rail, flex concept, underside for three boards | Existing inspectable board renderer |
| `carrier` | `carrier-atlas.png` | 384 x 100 | Haze, festival carrier, lights, radar, crew, airshow, wake | Layered festival-fleet silhouette |
| `uiOrnaments` | `ui-ornaments-atlas.png` | 320 x 104 | Crest, board emblems, controls, ribbon, badge, medal | Existing Canvas/CSS panels and glyphs |
| `kakiLandDecor` | `kaki-land-decor-atlas.png` | 256 x 192 | Original Kemonokaki maintenance residents; cloud station, Approval, Last Relay reactions; Chii, Rockstar, Mermaid, and Kitty licensed-reference plush frames | Code-authored artists, station, stamp, and signal shrine; secondary plush gallery may be omitted if the optional atlas is unavailable |
| `soderSnek` | `soder-snek-atlas.png` | 512 x 448 | Complete 56-pose Soder rider timeline | Code-authored Soder renderer |
| `simplyTerrell` | `simply-terrell-atlas.png` | 512 x 448 | Complete 56-pose comedian-surfer timeline with balanced arms | Code-authored SimplyTerrell renderer |

The flexible-board concept cells are source references; live board deformation remains code-driven so physics state, landing angle, and sprite alignment stay coherent. The renderer can use top/rail/underside art without treating a baked bent pose as collision truth.

Exact source paths, hashes, selection decisions, all Grok prompts including rejected iterations, and the rebuild command are recorded in [Grok asset provenance](./GROK-ASSET-PROVENANCE.md).
The SimplyTerrell identity reference, ImageGen prompt, source hash, and
deterministic rebuild command are recorded in
[SimplyTerrell character source](./art-source/imagegen/SIMPLY-TERRELL.md).

## Shipping code assets

| Source | Responsibility |
| --- | --- |
| `js/sprites.js` | Kitty poses, board deformation, signed facing, wake, and atlas-aware board drawing |
| `js/wave-visuals.js` | Ride surface, face bands, fast-line guidance, curl geometry, foam, wave-atlas accents, and monotonic presentation clocks including the wave-time-driven fall clock |
| `js/hero-wave-visuals.js` | Long side-view face, fixed-grid gravity columns, persistent contrail foam, passed-sky/backwater window, rideable tube presentation, collision-aligned edge, board spray, and impact churn |
| `js/world-visuals.js` | Traffic layers, wildlife phases, powerups, carrier/airshow, Webring Relay gates/station/mural, and their procedural fallbacks |
| `js/asset-drawing.js` | Shared atlas-frame drawing with anchor, scale, direction, alpha, and transform controls |
| `js/renderer.js` | Layer composition, interpolation, HUD, particles, callouts, access presentation, and state-driven VFX |
| `js/pixel-font.js` | Compact Canvas glyph data and text drawing |
| `js/audio.js` | Lifecycle-safe procedural music, ocean/board/wind layers, limiter/ducking, speed state, wildlife/powerup/event cues; no samples |
| `js/game.js` and `styles.css` | Menu, touch controls, settings, results, responsive shell, and nearest-neighbor stage |

## Offline source and deterministic conversion

Kaki-Land's checked-in palette-controlled art is rebuilt independently:

```console
python3 tools/art/build-kaki-land-assets.py
python3 tools/art/build-aerial-panoramas.py --condition kakiLand
```

The first command creates the continuous source, menu art, and decor atlas from
the preserved reviewed Grok panorama, ImageGen Kemonokaki decor master, and four
selected licensed-reference plush i2i masters. It retains native one-pixel
detail, applies an 80-color panorama cap, removes each source's connected
chroma field, limits each plush frame to 15 colors, adds a one-pixel silhouette
outline, and enforces the canonical Relay face grid. The shared
panorama build then fixes the 1536 x 640 contract, y=502 ocean anchor,
continuity, and compression. The rejected Vertex/Nano exploration is
reference-only and never enters these outputs.

The selected Grok sheets are preserved at their original dimensions under `docs/art-source/grok`; the selected Kemonokaki resident sheet and four 1254 x 1254 plush i2i masters are preserved under `docs/art-source/atlases/imagegen`. The four original user-supplied portraits are not checked into the repository; their filenames and SHA-256 identifiers are retained in the Kaki-Land provenance record. The retired continuous side-break source is 1280 x 720, the retired travelling-break sheet is 384 x 216, the active wave-breaker polish source is 1024 x 1024, and the staged progression, Twilight components, other studies, and remaining selected sheets retain their documented source sizes. Rejected local Qwen comparisons are preserved separately under `docs/art-source/qwen`. Source sheets are documentation assets and are never loaded by the browser. `tools/art/build-grok-assets.py`:

1. reads each selected source without overwriting it;
2. identifies and removes the chroma-magenta field while preserving coral accents; the continuous wave uses a narrow black key so its isolation field and tube opening reveal the live world without erasing saturated navy water;
3. extracts each declared source grid and repacks it into the stable runtime atlas grid;
4. crops each non-empty silhouette and fits it into a fixed local frame; contact-sensitive families instead retain shared grid alignment, including the continuous wave's 53%-width contact anchor, the staged wave's right/bottom anchor, and the Twilight components' stable 2 x 2 layout;
5. downsamples with the family-declared filter, thresholds alpha unless a soft continuation is declared, quantizes the RGB palette, sharpens only where declared, and feathers or steps only declared continuation edges into runtime water/sky;
6. packs transparent RGBA PNG atlases and writes frame metadata.

Run from the repository root:

```console
python3 tools/art/build-grok-assets.py
```

The conversion requires Pillow only at authoring time. Generated PNGs and the manifest are checked in, so deployment still requires no Python or build step.

## Pixel rules

- Fixed 384 x 216 logical Canvas with `imageSmoothingEnabled = false`.
- CSS uses `image-rendering: pixelated` / `crisp-edges`.
- Strong deep-navy silhouettes and controlled condition palettes remain readable at native scale.
- Signed direction flips rider-facing sprites and wakes at the drawing boundary; the gravity-column break, structural crest, and falling-water phases never mirror when the rider reverses.
- State-driven anticipation, compression, trick, landing, mount, collision, and wipeout poses are selected from simulation state.
- Alpha is deliberate for transparent atlases, HUD panels, particles, impact flash, and fades.

## Documentation-only and reference-only files

`docs/images/*` and `docs/images/qa/*` are browser captures and are never loaded by gameplay. The checked-in Blender wave study is art direction only:

| Reference | SHA-256 | Runtime status |
| --- | --- | --- |
| `docs/art-source/blender/wave-curl-reference.blend` | `94C5B07293B72697484CFEC5A69305736CF1DE42857B4C2E1903DD5FC66F9F8F` | Editable offline study; never loaded |
| `docs/art-source/blender/wave-curl-reference.png` | `F10632A9D872055E7C61DD9E1A975262181B10A0A6DE22CCDC15DBFFA7D8E0EB` | Offline render; never composited |

The supplied `057d4b5daab18a4858c438fd81441fe4.glb` and `images (26).jpg` were reference-only inputs with unverified rights; neither is shipped or fetched by this standalone game. The Kitty Kaki Survivors identity mapping is documented in [Hero source map](./HERO-SOURCE-MAP.md) and remains metadata-only.

## Rights note

The user requested Kitty Kaki as the hero and supplied the reference files. Before a public commercial, merchandising, collectible, or NFT-related release, archive written authorization covering the character, plush contribution, game use, and merchandising scope. Generated source sheets do not replace that character-rights confirmation.
