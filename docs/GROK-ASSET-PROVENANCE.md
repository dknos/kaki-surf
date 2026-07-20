# Grok asset provenance

Date: 2026-07-19.

These 16 source families were generated through the local Grok Imagine workflow for this repository. Generation happened offline; the browser never invokes Grok or reads its session cache. Selected outputs were copied into `docs/art-source/grok` without overwriting existing production assets, visually reviewed, and converted into compact transparent atlases.

## Rebuild command

From the repository root:

```console
python3 tools/art/build-grok-assets.py
```

The script reads the preserved sources, validates declared exact hashes and dimensions for contact-sensitive wave sheets, removes the chroma-magenta background, extracts each declared source grid, crops or preserves layout according to the family contract, downsamples with the family-specific filter, thresholds alpha, quantizes, sharpens where appropriate, repacks the stable runtime grids, and writes `assets/generated/manifest.json`. It does not modify the source sheets.

## Selected source and output record

The wave-breaker polish source is 1024 x 1024; the earlier full Twilight barrel, staged wave progression, Twilight components, final curtain/break sheets, and other selected sources are 1280 x 720. SHA-256 values identify the exact files used at this checkpoint.

| Family | Selection | Preserved source | Source SHA-256 | Runtime atlas | Atlas dimensions |
| --- | --- | --- | --- | --- | ---: |
| Twilight hero barrel | Candidate 4 selected for the earlier full-barrel pass; now retained for provenance but superseded in rendering | `docs/art-source/grok/twilight-hero-barrel-source.png` | `197f3eb67470ea3acf488fa6bfd236853f4d7e802b490ac7b2c4d7c144f10ecf` | `assets/generated/twilight-hero-barrel-atlas.png` | 256 x 144 |
| Wave breaker | Square polish pass selected; v2 preserved | `docs/art-source/grok/wave-breaker-source-v2.png` | `07554da55eb79d344d60dea70174384c6497146b33a5923e5c913fe98c6b9ca9` | `assets/generated/wave-breaker-atlas.png` | 288 x 128 |
| Wave progression | Tapered four-stage polish selected; first pass preserved | `docs/art-source/grok/wave-progression-source-v2.png` | `066da3c2e9466c319458502fdba299fd521371d42bf783a0784fcdb1f66f9070` | `assets/generated/wave-progression-atlas.png` | 320 x 192 |
| Twilight hero wave | Modular pass A selected; crown/spray approved for runtime, ribbons/shoulder retained but not rendered; whole-wave sheets and labeled pass B rejected | `docs/art-source/grok/twilight-hero-wave-components-source.png` | `bc6190965387909e41264f23c22e3aef1880271c33a5e9fb96f28c10cc996600` | `assets/generated/twilight-hero-wave-components-atlas.png` | 256 x 144 |
| Twilight waterfall curtain | Variant 2 of 2 selected as the initial downward-pour study and retained as restrained internal texture | `docs/art-source/grok/twilight-waterfall-curtain-source.png` | `5e0d4166e0b46681b9aaf477d37aeb8503989289ad67ea2552df1422291fb2c3` | `assets/generated/twilight-waterfall-curtain-atlas.png` | 352 x 112 |
| Twilight coherent break | Variant 1 of 4 selected as the final active crest/curl/pour/collapse silhouette | `docs/art-source/grok/twilight-breaking-wave-source.jpg` | `803b17d83dbf2b9f6c03973dfee5074b188b163d2077cb0efa2f14a2ca2f52e1` | `assets/generated/twilight-breaking-wave-atlas.png` | 512 x 136 |
| Dolphin | First reviewed pass selected | `docs/art-source/grok/dolphin-source.png` | `eac80e5862bb10b89c36fbd04e3f41b3869835d6c34d25edcfe1d0f4ff0f6740` | `assets/generated/dolphin-atlas.png` | 224 x 80 |
| Shark | First reviewed pass selected | `docs/art-source/grok/shark-source.png` | `044d588bac3ba9d81677228c4b7831859dc94d2bbe6b128c771935bf24f2bd0b` | `assets/generated/shark-atlas.png` | 224 x 72 |
| Whale | First reviewed pass selected | `docs/art-source/grok/whale-source.png` | `9ff5f93b1fd98a68402c03f8785c5d56e120a0eed2ebb42fd1a3f4770481ca14` | `assets/generated/whale-atlas.png` | 352 x 108 |
| Birds | Corrected pass selected; first pass rejected | `docs/art-source/grok/birds-source.png` | `cd9b1ebac9c5eee1f097d19b872aa57057d8c1b2b39bf00eec6e3b174c81d98c` | `assets/generated/birds-atlas.png` | 136 x 48 |
| Boats | First reviewed pass selected | `docs/art-source/grok/boats-source.png` | `31d6d8a98eece8ab7782e7c68ce12b533e21c8859f1c8d69a6e8a52ed7a32561` | `assets/generated/boats-atlas.png` | 256 x 68 |
| Air traffic | First reviewed pass selected | `docs/art-source/grok/air-traffic-source.jpg` | `f05b4d2d6010b4b4edb24e5cfd642f5920680157bbe868a11e1bf002220648b5` | `assets/generated/air-traffic-atlas.png` | 288 x 64 |
| Powerups | First reviewed pass selected | `docs/art-source/grok/powerups-source.png` | `7a8e4264488e42510f3a98aaaa88e73e1800131b5929a1b3730c3a2409df8ed9` | `assets/generated/powerups-atlas.png` | 96 x 48 |
| Boards | First reviewed pass selected | `docs/art-source/grok/boards-source.png` | `a66241da5d5c2ae38676e703d0c81e5ec3ef6c1045744371018fb2171d14cf23` | `assets/generated/boards-atlas.png` | 256 x 72 |
| Carrier | First reviewed pass selected | `docs/art-source/grok/carrier-source.png` | `b456a27cfb3fcd7aa593a68dcf5663f6db6743aa8b873ccdf60fbdd27c71e11c` | `assets/generated/carrier-atlas.png` | 384 x 100 |
| UI ornaments | Corrected v2 selected; v1 rejected and preserved | `docs/art-source/grok/ui-ornaments-source-v2.png` | `a5f59884adae0dfa6b624aeee8cedaf64d1ace2544ab65cf29b908363ff9ca8e` | `assets/generated/ui-ornaments-atlas.png` | 320 x 104 |

The rejected UI v1 is preserved as `docs/art-source/grok/ui-ornaments-source.jpg` with SHA-256 `75e36bd84e0c36d17c5b36b5c8dd6307bec95074ca21dcc17c5e9a96b75f10e7`. It was not used by the atlas build. Wave v2 remains preserved as `docs/art-source/grok/wave-breaker-source.jpg`; the rejected first wave and first bird sheets were not promoted from their generation sessions.

The first staged wave came from local Grok session `019f7c03-7e1e-7570-acac-8cb1fe5f7ee7`. Its untouched JPEG and deterministic keyed PNG remain preserved as `wave-progression-original.jpg` and `wave-progression-source.png`; the latter hashes to `4f94dc3224049cf3f2e6cce60be8316a97875b2ba87d725e1452891a4d669173` and is now superseded.

The selected tapered polish came from local Grok session `019f7ced-ca4a-7003-97bb-7ded6e4a97cd`. Variant A was copied without modification to `docs/art-source/grok/wave-progression-source-v2.png`; its source and preserved copy both hash to `066da3c2e9466c319458502fdba299fd521371d42bf783a0784fcdb1f66f9070`. Variant B was rejected because its broad dark mounds and circular highlight shapes did not read as the same flowing breaker at runtime.

The earlier full Twilight barrel came from local Grok session `019f7d79-2944-7941-a08e-27439bd9e68c`. Candidate 4 was copied without modification to `docs/art-source/grok/twilight-hero-barrel-source.png`; the 1280 x 720 source and preserved copy hash to `197f3eb67470ea3acf488fa6bfd236853f4d7e802b490ac7b2c4d7c144f10ecf`. It was selected because its single continuous mass, asymmetric open aperture, nested concave face bands, broad trough, and clean chroma perimeter survived native-size compositing. Candidate 1 read as a donut, candidate 2 introduced an extra wave, and candidate 3 introduced a secondary hump. The deterministic build still preserves that 256 x 144 atlas and its edge treatment, but the current renderer no longer samples it after in-motion review found that a complete screen-shaped wave could not sell the required travelling side-scroller perspective.

The selected Twilight component sheet came from local Grok session `019f7d11-7e31-70b0-bbf0-e8e1f5d85f0a`. Candidate A was copied without modification to `docs/art-source/grok/twilight-hero-wave-components-source.png`; the source and preserved copy are 1280 x 720 and hash to `bc6190965387909e41264f23c22e3aef1880271c33a5e9fb96f28c10cc996600`. Native-size in-motion review approved `contactSpray`. `foamCrown`, `faceRibbons`, and `foregroundShoulder` remain packed for reproducibility but are not sampled by the current renderer; the ribbons read as a pasted triangular fan and the shoulder as a detached lower-right hump. Candidate B was rejected because visible A/B/C/D labels and heavier panel-like shapes made it unsuitable for compositing. Earlier whole-wave animation-sheet attempts were not promoted because their circular C-shaped mass, flat base, and rectangular framing repeated the perspective problem seen in the previous runtime wave.

The initial waterfall-curtain study came from local Grok session `019f7dde-2241-7401-9691-16a05a9153f8`. Variant 2 of 2 was copied without modification to `docs/art-source/grok/twilight-waterfall-curtain-source.png`; the 1280 x 720 RGB source hashes to `5e0d4166e0b46681b9aaf477d37aeb8503989289ad67ea2552df1422291fb2c3`. The deterministic conversion uses exterior-connected chroma removal, nearest-neighbor reduction, a 24-color palette, two-pixel packing padding, and no sharpening. It produces the 352 x 112 RGBA `assets/generated/twilight-waterfall-curtain-atlas.png`, whose SHA-256 is `9e5aa8412611348888b75b7879833c8377dd7b2bbd8b72beea0dd7e8d27ddb43`. Its 4 x 1 cells are `pourA`, `pourB`, `pourC`, and `pourD`, each 88 x 112 with anchor `[0.5, 1]`. Runtime review found that the downward motion was useful but the isolated curtain did not by itself read as one connected ocean wave, so it is sampled only at low opacity inside an already coherent rendered break and never becomes the base silhouette.

The final coherent breaking-wave sheet came from local Grok session `019f7e05-f8fe-7bc2-ba7b-3134ed884a95`. Variant 1 of 4 was copied without modification to `docs/art-source/grok/twilight-breaking-wave-source.jpg`; the 1280 x 720 JPEG hashes to `803b17d83dbf2b9f6c03973dfee5074b188b163d2077cb0efa2f14a2ca2f52e1`. The deterministic conversion uses exterior-connected chroma removal, nearest-neighbor reduction, a 28-color palette, two-pixel packing padding, no sharpening, and an irregular alpha feather only along the lower/side continuation that joins procedural water. It produces the 512 x 136 RGBA `assets/generated/twilight-breaking-wave-atlas.png`, whose SHA-256 is `bb95f18871965a39cc414a563094e6eaec802ad2cadfac807abed764b2fd8cd0`. Its 4 x 1 cells are `curlA`, `curlB`, `pour`, and `collapse`, each 128 x 136 with anchor `[0.66, 1]`. This is the active normal-palette Twilight breaker; pressure cross-fades its connected crest/curl/pour poses and curl contact cross-fades into collapse.

## Review decisions

- Wave v1 was rejected because the model interpreted “crest feather” and “foam fingers” literally. Wave v2 removed those motifs but was superseded after runtime review found its reduced foam clusters muddy. The selected square pass has cleaner isolated silhouettes; only restrained crest and spray accents are used over simulation-owned geometry.
- The first four-stage progression still produced a tall block when stretched to the Canvas bottom. The selected polish has wider tapered silhouettes and a larger open curl; it renders near native aspect at the simulation-owned contact while code owns the connected lower face, sky cutout, collision, and complete fallback.
- The complete earlier Twilight barrel is retained for provenance but no longer rendered. The active normal-palette silhouette is the final coherent-break atlas welded to simulation-owned face volume, tube shadow, trailing churn, and collision contact.
- The first curtain pass proved the downward waterfall cadence but looked isolated without a connected crest and shoulder. It is now low-opacity internal texture only after the coherent-break atlas succeeds. A missing primary atlas or High Contrast selects the earlier coherent full-barrel study; if that also fails, one connected procedural curl/pour remains.
- The Twilight component pass now contributes only `contactSpray`. `foamCrown`, `faceRibbons`, and `foregroundShoulder` remain packed for reproducibility but are not rendered. Real sky reappears behind the passing edge, the playable surface stays collision-aligned, and the break and falling-water clocks never mirror with the rider.
- Birds v1 was rejected because visible grid dividers became part of the sheet. The corrected prompt required one uninterrupted field with no cell borders, seams, panels, or boxes.
- UI v1 was rejected because ornaments overlapped or cropped and contained pseudo-text. The corrected prompt reduced each ornament to the middle 60% of its implied cell and prohibited every form of writing.
- The selected airshow cell contains a four-plane formation rather than the requested three-plane formation. It remains a readable, fictional, nonmilitary airshow sprite and is accepted as a presentation variance.
- The board flex-concept cells exaggerate bend and remain reference cells. Runtime deformation is code-driven; top, rail, and underside silhouettes are the approved practical frames.

## Exact prompt record

### 1. Wave breaker v1 — rejected

```text
Production source sheet for a 384x216 neo-chibi plush surf arcade game: one cohesive family of animated breaking-wave and whitewater pixel-art elements, arranged as eight clean equal cells in a 4-column by 2-row layout showing distant crest feather, rising curl, folding lip, impact, churn, foam fingers, spray burst, and dissipating mist; powerful water with chunky hand-cleaned pixel clusters, strong deep-navy contour accents, controlled turquoise sea-glass cream and coral palette, late-8-bit handheld clarity with modern animation density, each element centered with generous padding on a perfectly flat solid chroma-magenta background. No surfer, board, animals, scenery, UI, text, labels, logos, signature, watermark, grid lines, photorealism, gradients, noisy microtexture, or cropped elements.
```

### 2. Wave breaker v2 — superseded and preserved

Selected source: `docs/art-source/grok/wave-breaker-source.jpg`.

```text
Production source sheet for a 384x216 neo-chibi plush surf arcade game: one cohesive family of eight animated breaking-wave and whitewater pixel-art elements, arranged as exact equal cells in a 4-column by 2-row layout: distant crest feathering made only of water spray, rising curl, folding lip, impact, whitewater churn, narrow branching foam tendrils, directional spray burst, and dissipating sea mist; powerful water with chunky hand-cleaned pixel clusters, strong deep-navy contour accents, controlled turquoise sea-glass cream and coral palette, late-8-bit handheld clarity, every water element centered with generous padding on a perfectly flat solid chroma-magenta background. Water and foam only: absolutely no literal feathers, hands, fingers, arms, animals, faces, surfer, board, scenery, UI, text, labels, logos, signature, watermark, grid lines, photorealism, gradients, noisy microtexture, or cropped elements.
```

### 2b. Wave breaker square polish — selected

Selected source: `docs/art-source/grok/wave-breaker-source-v2.png`.

```text
Production game-asset source sheet for a side-view 384x216 neo-chibi plush surf arcade game. Exactly eight isolated modular breaking-wave foam pieces arranged in a clean 4 columns by 2 rows grid with generous separation: crest feather, curling lip foam, rising curl spray, impact burst, whitewater churn, foam tendrils, directional spray fan, and soft sea mist. Chunky hand-cleaned pixel clusters, rounded powerful ocean shapes, deep navy outlines only where needed, controlled seafoam white, pale aqua, turquoise, and muted blue palette. Every piece must have a crisp readable silhouette and stay fully inside its grid cell. Flat solid chroma-magenta background #ff00ff. No full rectangular water panels, no dark barrel holes, no scenery, no horizon, no boats, no surfers, no animals, no text, no logos, no watermark, no photorealism, no noisy microtexture, no gradients bleeding into the background.
```

Grok returned the eight requested subjects in a 2 x 4 source arrangement. The build record declares that source layout explicitly and repacks the same ordered frames into the existing 4 x 2 runtime atlas.

### 2c. Four-stage wave progression v1 — superseded and preserved

Selected original: `docs/art-source/grok/wave-progression-original.jpg`. Deterministic build source: `docs/art-source/grok/wave-progression-source.png`.

```text
Production sprite-sheet source for a side-view 384x216 neo-chibi plush arcade surfing game. A clean 2 columns by 2 rows grid containing four visibly different sequential animation frames of the SAME left-side breaker, with identical base alignment, scale, palette and lighting. TOP LEFT: low broad rising swell with no hollow barrel yet. TOP RIGHT: shoulder steepening and lip beginning to pitch right. BOTTOM LEFT: fully formed but open readable curl with a broad diagonal shoulder and heavy water base. BOTTOM RIGHT: collapsed whitewater impact with chunky foam and spray. Solid wave mass enters from the left and bottom of every cell; energy travels toward the right. Premium hand-cleaned pixel art with large deliberate clusters, crisp silhouette, deep navy water shadows, turquoise, pale aqua and seafoam cream, tiny coral highlights only in impact foam. Perfectly uniform flat pure chroma-magenta #ff00ff background in every cell and gutter, no lighting or texture on the background. Wide magenta gutters separate every cell and every wave stays fully inside its cell. No surfer, board, animals, boats, aircraft, scenery, horizon, UI, text, numbers, logo, watermark, rectangular water panels, dark circular barrel hole, black donut, thin vertical pillar, horizontal speed lines, extra waves, blurry gradients, noisy microtexture, cropped foam, or photorealism.
```

### 2d. Tapered four-stage wave progression — selected

Selected source: `docs/art-source/grok/wave-progression-source-v2.png`.

```text
Production sprite-sheet source for a side-view 384x216 neo-chibi plush arcade surfing game. Exactly four sequential frames of the same LEFT-SIDE ocean breaker arranged in a clean 2 columns by 2 rows grid with identical contact anchor, scale, palette, and lighting. TOP LEFT: a low rounded swell crest entering from the left. TOP RIGHT: the shoulder rises and a thin lip pitches to the right. BOTTOM LEFT: an elegant open curling lip with a large clear hollow and a tapered trailing edge so background sky can visibly show behind the passing wave. BOTTOM RIGHT: a collapsing but airy whitewater crown and spray, not a solid wall. Draw only the upper breaker silhouette, lip, foam and small attached water shoulder; every frame must taper organically into transparency/chroma and must NOT contain a heavy rectangular base. Premium hand-cleaned pixel art with large rounded deliberate clusters, crisp readable silhouette, restrained deep navy shadows, turquoise, pale aqua and seafoam cream, tiny coral accents only in impact foam, coherent late-handheld arcade style. Perfectly uniform flat pure chroma-magenta #ff00ff background in every cell and wide gutters; all art fully inside each cell. No surfer, board, animals, boats, aircraft, scenery, horizon, UI, text, numbers, logos, watermark, borders, cell dividers, rectangular water panels, solid bottom slabs, dark donut barrel, vertical pillar, horizontal speed lines, extra waves, blur, gradients, noisy microtexture, or photorealism.
```

### 2e. Twilight full hero barrel — selected

Selected source: `docs/art-source/grok/twilight-hero-barrel-source.png`.

```text
Single isolated production game sprite of one spectacular Twilight Glass barrel wave for a 384x216 premium pixel-art surfing game, composed in the same three-quarter side perspective as a classic arcade surfing screen. The wave is one continuous water mass: a broad deep-navy and turquoise face rises from the lower-left and foreground, arches overhead, then pitches a tapered lip to the right; a large asymmetric D-shaped open barrel aperture cuts through the center and remains fully open to the right; a wide curved trough and foreground shoulder flow from the pocket beneath the future rider position toward the lower-right edge. Show six or seven clearly separated nested concave cyan/teal face bands climbing the wall and sweeping into the trough, not straight lines. Add a shadowed underside, irregular white and pale-aqua foam crown with three to five tapered fingers, sparse directional spray, and deliberate chunky late-handheld pixel clusters with crisp stair-step edges. Upper-right twilight lighting; palette limited to midnight navy, indigo, saturated teal, luminous cyan, pale aqua, and white. The future rider/contact point is empty, approximately 56 percent across and 67 percent down. Pure perfectly flat #ff00ff chroma-magenta background visible everywhere around the wave and through the open barrel. No surfer, board, animals, boats, aircraft, scenery, sky, horizon, UI, text, letters, numbers, logos, watermark, panel borders, extra waves, circular donut, closed tunnel, detached fins, flat wall, rectangular slab, neon platform, thin horizontal water lines, blur, antialias haze, photorealism, or cropped lip.
```

### 2f. Twilight hero-wave modular components — selected

Selected source: `docs/art-source/grok/twilight-hero-wave-components-source.png`.

```text
Production modular sprite-sheet source for the Twilight Glass hero-barrel animation in a 384x216 premium pixel-art surfing game. Exactly four isolated reusable wave components arranged in a clean 2 columns by 2 rows grid with identical upper-right twilight lighting, palette, pixel density, pure flat #ff00ff chroma-magenta background, and wide gutters. TOP LEFT: a long airy white seafoam crown that curves from upper left toward lower right, with tapered hanging foam fingers and sparse detached spray. TOP RIGHT: five concave turquoise/cyan inner-face ribbons that fan in perspective from a tight lower-right contact point toward the upper-left barrel wall; ribbons must be curved, tapered, separated, and must not form horizontal lines. BOTTOM LEFT: a foreground water shoulder ribbon seen at water level in three-quarter perspective, sweeping in a broad rising arc from lower left toward mid-right and tapering at both ends, with two thin foam edges. BOTTOM RIGHT: a compact board-contact spray burst with directional droplets fanning up-left and a low tapered wake extending right. Every component floats independently and ends in chroma on all sides; no solid wave body or rectangular base. Hand-cleaned late-handheld pixel art with large deliberate clusters, crisp 1-pixel stair-step curves, deep midnight navy, saturated turquoise, cyan edge light, pale aqua, white seafoam, subtle violet bounce. No surfer, board, animals, scenery, sky, sun, horizon, UI, text, numbers, logos, watermark, borders, cell labels, gradients on the chroma background, flat vertical wall, circular barrel hole, heavy water slab, horizontal speed lines, extra waves, blur, antialias haze, photorealism, or cropped edges.
```

### 2g. Twilight waterfall curtain — selected as internal texture

Session: `019f7dde-2241-7401-9691-16a05a9153f8`. Variant 2 of 2 selected. Preserved source: `docs/art-source/grok/twilight-waterfall-curtain-source.png`.

```text
Production pixel-art sprite source sheet for a 384x216 side-view arcade surfing game. Pure flat #D10072 magenta chroma-key background. Four clearly separated whitewater waterfall-curtain components in one horizontal row, each showing the same moving breaking-wave lip at successive animation moments: rounded pale-aqua crest folding forward, dense white and mint water pouring nearly straight downward in long irregular strands, turbulent foamy impact cloud and short left-side churn at the base. The breaking edge travels left-to-right; water motion itself falls top-to-bottom. Premium 16-bit arcade pixel art, chunky deliberate pixels, limited palette of deep navy, teal, cyan, pale mint, and white, light from upper right, strong readable silhouette at 64x96 game size. Each component fully visible with generous clean spacing and no overlap. Transparent-ready hard edges. No complete barrel, no circular wave, no surfer, no board, no animals, no boats, no aircraft, no scenery, no text, no logo, no frame borders, no gradients outside the artwork, no shadows on the magenta background.
```

### 2h. Twilight coherent travelling break — selected

Session: `019f7e05-f8fe-7bc2-ba7b-3134ed884a95`. Variant 1 of 4 selected. Preserved source: `docs/art-source/grok/twilight-breaking-wave-source.jpg`.

```text
Production sprite-source sheet for Kaki Surf, a premium 16-bit pixel-art side-scrolling arcade game at 384x216. Pure flat #D10072 magenta chroma-key background. Four clearly separated animation frames in one horizontal row, each showing ONLY the same coherent breaking ocean-wave crest and falling whitewater at successive moments as the break travels left-to-right. Three-quarter side perspective: a thick rounded teal swell enters from the upper left of each frame, curls forward into a tapered hook, then becomes a wide irregular sheet of white and mint water pouring downward like a real waterfall, with a broad turbulent impact cloud at the bottom. The crest, curl, falling sheet, and base foam must be one connected natural silhouette. Strong forward pitch and depth; curved lip underside; asymmetrical torn foam; long downward strands; spray thrown forward; no straight horizontal cap, no umbrella shape, no rectangular pillar, no square side edges, no isolated waterfall, no full background scene. Premium chunky deliberate pixels, controlled palette of deep navy, cobalt, teal, cyan, pale mint, and white, upper-right light, crisp alpha-ready edges, readable around 90x120 pixels. Each frame fully visible with generous spacing and no overlap. No surfer, no board, no animals, no boats, no aircraft, no scenery, no text, no logo, no borders, no shadows on the magenta background.
```

### 3. Dolphin — selected

Selected source: `docs/art-source/grok/dolphin-source.png`.

```text
Production animation source sheet for a 384x216 neo-chibi plush surf arcade game: one consistent friendly rideable dolphin character in eight exact equal cells arranged 4 columns by 2 rows, side-view facing right, showing approach swim, glowing surface offer, mounted-ready glide with a clear saddle-back silhouette but no rider, compress, joyful breach, corkscrew pose, tail slap, and celebratory dismount arc; chunky hand-cleaned pixel clusters, strong deep-navy outline, soft toy-like curves, sea-glass turquoise body with cream belly and coral accents, expressive but readable at 48x32 pixels, identical markings and proportions in every cell, generous padding on perfectly flat chroma-magenta. No text, labels, logos, watermark, grid lines, extra dolphins, human, cat, rider, equipment, scenery, realistic anatomy detail, gradients, or noisy AI texture.
```

### 4. Shark — selected

Selected source: `docs/art-source/grok/shark-source.png`.

```text
Production animation source sheet for a 384x216 neo-chibi plush surf arcade game: one consistent toy-like shark character and its readable danger telegraph in eight exact equal cells arranged 4 columns by 2 rows, side-view facing right, showing deep shadow silhouette, distant fin and wake, close fin approach, fair crossing swim, Kaki-safe jump-under pose with no rider shown, startled near-miss reaction, harmless comic collision splash pose, and retreat; chunky hand-cleaned pixel clusters, strong deep-navy outline, slate blue body, cream belly, coral accent, readable at 52x28 pixels, identical markings and proportions, generous padding on perfectly flat chroma-magenta. Playful danger, never gore or aggression. No text, labels, logos, watermark, grid lines, extra sharks, surfer, cat, scenery, weapons, blood, photorealism, gradients, or noisy AI texture.
```

### 5. Whale — selected

Selected source: `docs/art-source/grok/whale-source.png`.

```text
Production animation source sheet for a 384x216 neo-chibi plush surf arcade game: one consistent majestic friendly whale in eight exact equal cells arranged 4 columns by 2 rows, side-view facing right, showing distant underwater shadow, blow plume telegraph, swell-lift back, breach anticipation, huge breach arc, rideable-back glide with a clean flat mount silhouette but no rider, giant readable splash, and calm departure; chunky hand-cleaned pixel clusters, strong deep-navy outline, indigo-to-sea-glass body, cream belly and soft coral accents, toy-like warmth, readable at 88x52 pixels, identical markings and proportions, generous padding on perfectly flat chroma-magenta. No text, labels, logos, watermark, grid lines, extra whales, rider, cat, scenery, ships, weapons, photorealism, gradients, or noisy AI texture.
```

### 6. Coastal birds v1 — rejected

```text
Production sprite source sheet for a 384x216 neo-chibi plush surf arcade game: one cohesive family of coastal birds in eight exact equal cells arranged 4 columns by 2 rows, each a clean side-view sprite: gull glide, gull flap, pelican skim with pouch, pelican courier carrying one glowing pickup beneath it, tern bank, cormorant dive, three-bird flock silhouette, and startled scatter formation; chunky hand-cleaned pixel clusters, strong deep-navy outlines on near birds, warm cream slate blue coral and sea-glass accents, distinct readable species silhouettes at 28x20 pixels, generous padding on perfectly flat chroma-magenta. Animal-friendly and playful. No text, labels, logos, watermark, grid lines, scenery, planes, boats, surfers, injury, photorealism, gradients, or noisy AI texture.
```

### 7. Coastal birds v2 — selected

Selected source: `docs/art-source/grok/birds-source.png`.

```text
Corrected production sprite source sheet for a 384x216 neo-chibi plush surf arcade game: eight coastal bird sprites positioned at the centers of an implied 4-by-2 layout on one completely uninterrupted flat chroma-magenta field with absolutely no visible cell borders, dividers, panel lines, boxes, shadows, or background seams. Sprites: gull glide, gull flap, pelican skim, pelican courier carrying one glow orb, tern bank, cormorant dive, three-bird flock, startled scatter. Chunky hand-cleaned pixel clusters, deep-navy near-sprite outlines, cream slate blue coral and sea-glass accents, distinct animal-friendly silhouettes, generous separation and padding. No text, labels, logos, watermark, scenery, planes, boats, surfers, injury, photorealism, gradients, or noisy AI texture.
```

### 8. Coastal craft — selected

Selected source: `docs/art-source/grok/boats-source.png`.

```text
Production sprite source sheet for a 384x216 neo-chibi plush surf arcade game: eight original fictional coastal craft centered in an implied 4-by-2 layout on one uninterrupted flat chroma-magenta field with no borders: heeling sailboat, fast speedboat with wake, busy fishing boat with tiny bird silhouettes, chunky tugboat, distant cargo ship, playful jet ski, rescue-style craft with original star markings, and a small escort boat; side-view facing right, cohesive toy-like design, chunky hand-cleaned pixel clusters, deep-navy outlines, cream sea-glass coral gold and slate palette, readable from 32 to 68 pixels, hull bob and wake silhouettes built into each pose, generous separation. No real flags, brands, insignia, weapons, text, labels, logos, watermark, grid lines, scenery, photorealism, gradients, or noisy AI texture.
```

### 9. Air traffic — selected

Selected source: `docs/art-source/grok/air-traffic-source.jpg`.

```text
Production sprite source sheet for a 384x216 neo-chibi plush surf arcade game: eight original fictional air-traffic sprites centered in an implied 4-by-2 layout on one uninterrupted flat chroma-magenta field with no borders: cheerful prop plane, compact seaplane, toy-like rescue helicopter, fast celebratory aircraft silhouette, banner plane with only flexible rope and blank cream cloth with absolutely no writing, parachuting supply orb, three-plane airshow formation, and carrier-launch climb pose; clean side-view facing right, chunky hand-cleaned pixel clusters, deep-navy outlines, cream sea-glass coral gold and slate palette, readable at 30 to 72 pixels, playful and nonmilitary. No real insignia, flags, brands, weapons, combat, text, labels, logos, watermark, grid lines, scenery, photorealism, gradients, or noisy AI texture.
```

### 10. Powerups — selected

Selected source: `docs/art-source/grok/powerups-source.png`.

```text
Production icon source sheet for a 384x216 neo-chibi plush surf arcade game: eight readable flyby-powerup sprites centered in an implied 4-by-2 layout on one uninterrupted flat chroma-magenta field with no borders: Mango Rush as a winged golden mango with speed streaks, Moon Pop as a lavender crescent spring with upward spark, Star Foam as a cream foam star shield, Dolphin Call as a turquoise shell with tiny dolphin-wave motif, then a compact glowing active halo for each of Mango Rush Moon Pop and Star Foam, and one universal pickup burst; chunky hand-cleaned pixel clusters, strong deep-navy outline, controlled coral gold cream sea-glass and violet palette, unique silhouettes readable at 18x18 pixels, generous separation. No words, letters, numbers, labels, logos, watermark, grid lines, scenery, characters, photorealism, gradients, or noisy AI texture.
```

### 11. Surfboards — selected

Selected source: `docs/art-source/grok/boards-source.png`.

```text
Production surfboard animation source sheet for a 384x216 neo-chibi plush surf arcade game: exactly twelve board sprites centered in an implied 4-column by 3-row layout on one uninterrupted flat chroma-magenta field with no borders. Row one is Foam Puff: rounded thick top view, side rail, flex/compression, underside air view. Row two is Mango Fish: sharp swallow-tail top view, side rail, hard-carve flex, underside air view. Row three is Moon Log: long narrow top view, side rail, heavy compression, underside air view. Keep each board's markings and proportions consistent across its row; yellow-coral Foam Puff, mango-orange-indigo Fish, lavender-deep-navy Log. Chunky hand-cleaned pixel clusters, strong deep-navy outline, readable at 46x14 pixels, generous separation. Boards only: no rider, cat, hands, feet, water, text, labels, logos, watermark, grid lines, scenery, photorealism, gradients, or noisy AI texture.
```

### 12. Festival carrier — selected

Selected source: `docs/art-source/grok/carrier-source.png`.

```text
Production set-piece source sheet for a 384x216 neo-chibi plush surf arcade game: one fictional whimsical offshore aircraft-carrier event broken into eight reusable sprites centered in an implied 4-by-2 layout on one uninterrupted flat chroma-magenta field with no borders: hazy distant carrier silhouette, clean full toy-like carrier hull and island side view, glowing island lights layer, rotating radar dish, tiny celebratory deck crew cluster, tiny parked fantasy aircraft, small escort vessel, and long layered ocean wake; original rounded festival-fleet design, chunky hand-cleaned pixel clusters, deep-navy outlines, slate sea-glass cream coral and gold palette, readable from 16 to 118 pixels. Absolutely no weapons, combat, real flags, real insignia, real carrier silhouette, text, labels, logos, watermark, grid lines, scenery, photorealism, gradients, or noisy AI texture.
```

### 13. UI ornaments v1 — rejected and preserved

Preserved rejected source: `docs/art-source/grok/ui-ornaments-source.jpg`.

```text
Production UI ornament source sheet for a 384x216 neo-chibi plush surf arcade game: eight original interface sprites centered in an implied 4-by-2 layout on one uninterrupted flat chroma-magenta field with no borders: wide blank title crest shaped like a curling wave, round Foam Puff board emblem, sharp Mango Fish board emblem, long Moon Log board emblem, three-button Simple Controls glyph cluster with arrows action star and special shell but no letters, flowing combo ribbon ornament, wildlife-special paw-and-wave badge, and celebratory results medallion with blank center; chunky hand-cleaned pixel clusters, strong deep-navy outline, cream coral gold sea-glass and violet palette, crisp at small UI sizes, generous separation. No words, letters, numbers, labels, logos, watermark, grid lines, characters, scenery, photorealism, gradients, or noisy AI texture.
```

### 14. UI ornaments v2 — selected

Selected source: `docs/art-source/grok/ui-ornaments-source-v2.png`.

```text
Corrected production UI ornament sheet for a 384x216 neo-chibi plush surf arcade game: eight small independent ornaments, each fully contained within the middle 60 percent of its own implied cell, centered at four evenly spaced columns and two rows on one uninterrupted flat chroma-magenta field; generous empty magenta gutters prevent any overlap or cropping. Top: compact blank curling-wave crest, round yellow-coral Foam Puff emblem, orange-indigo fish-tail emblem, lavender longboard-moon emblem. Bottom: arrows plus star plus shell Simple Controls glyph with no letters, completely blank coral-and-cream ribbon with no marks, paw-and-wave special badge, blank-center gold results medallion. Chunky hand-cleaned pixel clusters, deep-navy outline, controlled cream coral gold sea-glass violet palette. Absolutely no words, pseudo-writing, letters, numbers, labels, logos, watermark, borders, grid lines, scenery, characters, photorealism, gradients, or noisy AI texture.
```

## Runtime policy

- Original source dimensions are preserved for provenance and future curation but are not runtime dependencies.
- Runtime PNGs are local, relative, independently optional, and dimension-validated.
- Code-authored fallback art remains available for every generated gameplay family.
- A generated pose never owns collision or scoring. The wave, world, rider, trick, and bonus simulations select semantics first; presentation chooses a frame second.
- Re-running the build is expected to reproduce the atlas geometry and metadata from the selected sources. A new Grok generation is a new provenance event and must be reviewed and recorded separately.
