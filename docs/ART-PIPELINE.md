# Kaki Surf offline art pipeline

Environment art and modular sprite sheets are produced offline and checked into the static game as compact local PNG files. Image generation and Blender are reference/source tools only; neither is called by the browser at runtime.

## Generated environment sources

All three source images were created with the built-in image-generation tool at 1672 x 941 RGB. Golden Coast is the composition master. Twilight Glass and Stormbreak use the Golden Coast image as a reference so the coast, pier, lifeguard tower, palms, and horizon remain spatially consistent.

| Condition | Source role | Source filename | SHA-256 |
| --- | --- | --- | --- |
| Golden Coast | Master generated environment | `exec-c3c593d2-e3a1-45a5-8c71-8effcac7cf08.png` | `6F3D9DAA30CC8FC7E69A5B13430186A5BA13A6A70DF2D15F6F3435A917E001D0` |
| Twilight Glass | Lighting/weather edit using Golden Coast as Image 1 | `exec-53020920-5c15-482e-b8af-ff2572f7d65c.png` | `2A89ED40CBD40D0E306D7FF2FD80252193B4F259426E633EE11F1918244A90D5` |
| Stormbreak | Lighting/weather edit using Golden Coast as Image 1 | `exec-70dbd373-248e-45bb-b3ff-ff7b82d828bd.png` | `410942FD60D6EDAFC6F0DDE5D53BCAF956070D839637206F945551F764A56B31` |

The selected source files remain under the local Codex generated-image store and are not runtime assets. The build script has those local paths as convenience defaults and accepts explicit replacement paths for portable rebuilds.

### Golden Coast prompt

```text
Use case: stylized-concept
Asset type: production game environment background for a 384x216 arcade surfing game
Primary request: an original Golden Coast California surf break backdrop with a warm headland, low weathered pier, a tiny lifeguard tower, a few wind-shaped palms, distant seabirds, and a broad open ocean horizon; no surfer and no foreground wave
Style/medium: premium authored late-16-bit handheld pixel art, deliberate connected pixel clusters, chunky navy outlines only on important silhouettes, controlled 20-color palette, no antialiasing, no 3D render look
Composition/framing: wide 16:9 side view; sky and distant coast occupy the upper 45 percent, clean open horizon across the center, lower half is quiet ocean color that can be covered by a gameplay wave; readable at 384x216
Lighting/mood: sun-bleached late afternoon with atmospheric depth, warm coral cliffs, sea-glass turquoise, cream foam, deep navy shadows
Constraints: original game art; strong layered silhouettes; restrained detail; no character; no board; no giant wave; no text; no logo; no watermark
Avoid: photorealism, smooth gradients, low-poly 3D, isometric ground plane, generic rectangular skyline, repetitive horizontal noise, blurry AI texture
```

### Twilight Glass prompt

```text
Use case: lighting-weather
Asset type: production Twilight Glass environment background variant for a 384x216 arcade surfing game
Input images: Image 1 is the Golden Coast master backdrop and composition anchor
Primary request: transform the same original coastline into calm blue-hour twilight after sunset; preserve the coastline, pier, lifeguard tower, palms, horizon, crop, and pixel-cluster geometry, but replace warm daylight with a violet-to-indigo sky, a low apricot moon, thin luminous offshore haze, subtle first stars, and cool teal glassy water
Style/medium: preserve the premium authored late-16-bit handheld pixel art, crisp connected clusters, controlled 20-color palette, no antialiasing, no 3D render look
Constraints: change only lighting, atmosphere, sky details, and palette; keep scene geometry and framing unchanged; no character; no board; no giant wave; no text; no logo; no watermark
Avoid: photorealism, smooth gradients, low-poly 3D, neon cyberpunk, blurry AI texture
```

### Stormbreak prompt

```text
Use case: lighting-weather
Asset type: production Stormbreak environment background variant for a 384x216 arcade surfing game
Input images: Image 1 is the Golden Coast master backdrop and composition anchor
Primary request: transform the same original coastline into a dramatic offshore storm; preserve the coastline, pier, lifeguard tower, palms, horizon, crop, and pixel-cluster geometry, but bend the palms in wind, darken the pier, replace the warm sky with layered charcoal-blue squall clouds, a narrow pale break in the horizon, distant rain curtains, one subtle cloud-contained lightning glow, and cold steel-teal water
Style/medium: preserve the premium authored late-16-bit handheld pixel art, crisp connected clusters, controlled 20-color palette, no antialiasing, no 3D render look
Constraints: change only weather, lighting, atmosphere, small wind response, and palette; keep scene geometry and framing recognizable; exciting but readable; no character; no board; no giant wave; no text; no logo; no watermark
Avoid: photorealism, smooth gradients, low-poly 3D, disaster imagery, giant lightning bolt, blurry AI texture
```

## Pillow production build

`tools/art/build-background-assets.py` performs the deterministic production conversion:

- center cover-crop for the 16:9 menu art;
- a condition-specific scenic crop for the shallow Canvas horizon strip;
- Lanczos reduction and restrained unsharp masking;
- fixed, hand-curated 32-entry palettes with dithering disabled;
- indexed `P`-mode PNG output with maximum lossless compression;
- dimension, file-integrity, palette-size, byte-size, and SHA-256 verification.

Run with the recorded local sources:

```console
python tools/art/build-background-assets.py
```

Run portably after moving the sources:

```console
python tools/art/build-background-assets.py --golden path/to/golden.png --twilight path/to/twilight.png --storm path/to/storm.png
```

The case-sensitive output names intentionally match the condition IDs used by the game:

| Output | Use | Dimensions |
| --- | --- | --- |
| `assets/backgrounds/goldenCoast-strip.png` | Golden Coast Canvas horizon | 384 x 80 |
| `assets/backgrounds/twilightGlass-strip.png` | Twilight Glass Canvas horizon | 384 x 80 |
| `assets/backgrounds/stormbreak-strip.png` | Stormbreak Canvas horizon | 384 x 80 |
| `assets/backgrounds/goldenCoast-menu.png` | Golden Coast menu backdrop | 768 x 432 |
| `assets/backgrounds/twilightGlass-menu.png` | Twilight Glass menu backdrop | 768 x 432 |
| `assets/backgrounds/stormbreak-menu.png` | Stormbreak menu backdrop | 768 x 432 |

The 384 x 80 crops end at the coast rather than duplicating a foreground ocean. The live gameplay wave remains a separate layer and stays readable over the scenic strip.

## Vertical aerial panorama build

The sky-to-space extension keeps six reviewed Grok candidates and six reference-controlled Vertex/Nano candidates as the comparison matrix. After live continuity review, each runtime master was rebuilt from one continuous edit source rather than a provider splice. The repair decisions, prompts, and filenames are recorded in [Vertical aerial source selection](./art-source/aerial/README.md).

`tools/art/build-aerial-panoramas.py` reframes each single continuous source so its authored horizon lands at the normal-riding camera shelf, sharpens restrainedly, and quantizes to a compact 64- or 72-color indexed PNG. Its `--check` mode guards the old pasted-strip boundaries and static-host budget without rewriting assets.

```console
python3 tools/art/build-aerial-panoramas.py
```

| Output | Vertical identity | Dimensions |
| --- | --- | ---: |
| `assets/backgrounds/goldenCoast-aerial.png` | Peach cloud towers, cobalt atmosphere, gold rim, playful stars/satellite | 1536 x 640 |
| `assets/backgrounds/twilightGlass-aerial.png` | Violet cloud tops, indigo atmosphere, aurora, moon and nebula | 1536 x 640 |
| `assets/backgrounds/stormbreak-aerial.png` | Storm interior, lightning, glowing thunderhead tops, cold stars | 1536 x 640 |

The renderer preserves signed horizontal camera parallax but does not vertically scroll these masters with Kaki. It keeps four fixed 384 x 216 authored shelves (coast, cloud, upper atmosphere, and space) and reveals them through a narrow top-down atmospheric mask driven only by the stateful, rate-limited canonical `aerialAltitude`. A coast dead zone and hysteresis keep ordinary lip pops locked; the full coastal crop always covers the canvas beneath the masks. The wave, collision, rider, and world traffic remain code-driven layers; the panorama never defines a gameplay surface.

## Grok modular atlas build

The deterministic offline build still publishes 15 generated families from reviewed sources. The browser manifest loads 13: the rejected 1280 x 720 continuous side-break and 384 x 216 six-cell travelling-break outputs remain preserved for auditability but are no longer downloaded or composited. The production MVP silhouette is built directly from the canonical wave state as a long face plus fixed-grid gravity columns and persistent foam contrails.

`tools/art/build-grok-assets.py` is the deterministic production conversion. Its declared family records define source directory, source and output grids, fixed cell size, frame names, anchor, palette size, and padding. The script removes chroma magenta or the continuous wave's narrow black isolation field, extracts each cell, applies contact-preserving layout rules, removes the source's straight lower rail, blends continuation edges, quantizes the local sprite, packs transparent RGBA atlases, and writes `assets/generated/manifest.json`.

Normal rendering in every condition pins the gravity front to canonical collision, advances newly activated columns left-to-right, accelerates their heads downward, and leaves revealed foam packets fixed behind them. Runtime geometry owns the playable surface, collision, stage pressure, passed-sky extent, tube rules, collapse, and break direction; generated art is limited to subordinate churn/contact accents and is never required for the silhouette.

```console
python3 tools/art/build-grok-assets.py
```

Outputs are the 15 PNGs under `assets/generated`:

| Family | Atlas dimensions |
| --- | ---: |
| Continuous side break | 384 x 216 |
| Twilight travelling break | 336 x 208 |
| Wave breaker | 288 x 128 |
| Wave progression | 320 x 192 |
| Twilight hero wave | 256 x 144 |
| Dolphin | 224 x 80 |
| Shark | 224 x 72 |
| Whale | 352 x 108 |
| Birds | 136 x 48 |
| Boats | 256 x 68 |
| Air traffic | 288 x 64 |
| Powerups | 96 x 48 |
| Boards | 256 x 72 |
| Carrier | 384 x 100 |
| UI ornaments | 320 x 104 |

The source sheets, SHA-256 values, selected/rejected decisions, and every Grok prompt are in [Grok asset provenance](./GROK-ASSET-PROVENANCE.md). The runtime/frame mapping is in [Asset manifest](./ASSET-MANIFEST.md).

`tools/art/run-qwen-edit.mjs` is an optional offline experiment helper for the local ComfyUI Qwen Image Edit workflow. It is not part of the deterministic build. Three preserved experiments were rejected after they damaged framing/chroma, regenerated horizontal rails, or dropped sprite cells into block slabs; the browser never loads them.

## Blender wave/curl study

`tools/blender/build-wave-reference.py` builds a fully procedural orthographic Eevee scene with a readable side silhouette, layered face bands, foam crown, barrel pocket, gold power-seam guide, directional spray arcs, droplets, toon lighting, and dark line work. It saves both the editable source and a 768 x 432 reference render.

Run against the verified Blender 5.1 installation:

```console
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python tools/blender/build-wave-reference.py
```

Optional output override:

```console
"C:\Program Files\Blender Foundation\Blender 5.1\blender.exe" --background --factory-startup --python tools/blender/build-wave-reference.py -- --output-dir path/to/output
```

Generated reference files:

- `docs/art-source/blender/wave-curl-reference.blend`
- `docs/art-source/blender/wave-curl-reference.png`

## Runtime policy

- The browser may load the compact files under `assets/backgrounds` and `assets/generated`; it must never read a Grok session store or other authoring cache.
- Each background and atlas family is optional presentation. A failed or dimension-invalid image uses its code-authored fallback without suppressing unrelated families; High Contrast may bypass raster background art for palette-safe readability.
- Menu backgrounds may be preloaded for CSS/cache use, but a missing menu image must not block launch or gameplay.
- `docs/art-source/blender` is offline source/reference material and is never gameplay geometry, collision truth, or a runtime dependency.
- The canonical ride surface, fast-line guidance, slope drive, curl risk, signed world travel, wildlife/powerup phases, and Flow remain simulation-owned. Art consumes those semantics and cannot redefine them.
- No image-generation API, Blender executable, remote asset host, or build server is required at runtime.
- Source generation is curated: generated pixels are cropped, reduced, palette-checked, visually reviewed, and rebuilt through a checked-in script before use.
