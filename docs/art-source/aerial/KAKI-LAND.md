# Kaki-Land visual source and provenance

Kaki-Land uses one reviewed Grok-derived 1536 x 640 panorama, one 768 x 432
menu image, and one optional 256 x 144 decor atlas. Grok was used offline for
source exploration and production source sheets. The checked-in conversion is
deterministic; the browser does not call an image model, generate pixels, fetch
a CDN, or depend on these rasters for gameplay geometry.

## Vertex/Nano exploration

The first exploration pass used the repository's established
`tools/art/generate-nano-aerial.py` workflow:

- provider: Vertex AI;
- model: `gemini-2.5-flash-image`;
- project: `nemocloud2`;
- seed: `1262570313`;
- output: `docs/art-source/aerial/nano/kaki-land-1.png`;
- dimensions: 1344 x 768;
- SHA-256:
  `649f384a2fcb8ed44439fdce843dd05099f3727332a50419300f723dc2141f62`.

The exploration prompt was:

```text
Original late-16-bit pixel-art panoramic world for Kaki-Land, a surfable handmade community network above an ocean. Bottom region: readable side-view cyan and deep-blue ocean with a pale foam wave and restrained five-band rainbow power seam. Above: paper-cream cloud islands connected by repaired rainbow web rings and taped cables; tiny fictional pixel artists working at CRT-and-stylus desks; guestbook gulls carrying damp drawings; old-web button mosaics made from symbols with no readable words; tiled night starfield; enormous distant nonhuman signal angel with cloud-paper wings, cable halo and one carefully repaired wing. Night ink, Kaki blue, sea mint, signal gold, memory violet and restrained coral. Hard pixel clusters, authored palette bands, stepped dithering, no antialiasing, no smooth airbrush gradients, no text, no logos, no recognizable anime character, no collage, no glossy 3D, no modern flat UI, no generic vaporwave.
```

Native-size review rejected this candidate for runtime use. Its large centered
humanoid figure read too close to a generic angel/anime composition, its
foreground competed with the rider, and its generated texture did not meet the
game's hard pixel-grid contract. It remains checked in only as evidence that
Vertex/Nano was explored first. None of its pixels are copied into a runtime
asset.

## Grok production selection

The local `grok-gen` workflow produced the production source candidates. The
selected panorama began in session
`019fa4c3-df65-7021-9ef3-b6bae3644cd9`. The requested 12:5 aspect was not
supported by the provider, so the closest supported 20:9 output was used. Four
native-size candidates were reviewed. Candidate 1 was selected for its clear
ocean, continuous cloud-community route, repaired bridges, small maintenance
rituals, and empty gameplay lanes. Candidates 2-4 were rejected for a black
sky slash, an overly diagrammatic composition, or insufficient community
detail.

That selected candidate still contained a humanoid guardian. Session
`019fa4cb-e43f-7b90-bc24-ecc035628960` made one constrained edit: remove the
figure, wings, cables, halo, and suitcase, and restore the tiled starfield
without changing the cloud network. Edit A was selected and is preserved
unchanged as:

`docs/art-source/aerial/grok/kaki-land-network-master.png`

Session `019fa4c5-98c3-7db2-bbaa-120e249c3378` explored the corrected,
clearly nonhuman Relay design. Its first edit was selected as the visual
reference: a rounded-square navy face-grid device, direct paper wings, an
imperfect cable halo, and one visibly repaired wing. The runtime guardian is
not baked into the panorama; it comes from the reaction atlas so
notice/deform/settle remains state-driven.

Quality review later tested four alternate panorama compositions in session
`019fa540-fe31-7ab1-8c93-0fd703580df0`. Candidate 4 had the strongest clean
pixel direction, but all four left the normal-riding crop too empty. They were
rejected after native-resolution browser review, and the richer continuous
network master remains selected.

Session `019fa4c8-8f3e-7bd0-ad4f-d07aa80d37b2` generated the original 4 x 3
decor sheet. It is preserved but superseded. Session
`019fa544-1d8d-7362-82ae-580c62112d84` generated three stricter replacements;
candidate 2 was selected for its harder one-pixel silhouettes, clearer props,
and consistently nonhuman Relay. The offline build removes only
border-connected chroma, reduces each cell to a 64 x 48 frame, caps each sprite
to 15 opaque colors, and manually replaces generated Relay face marks with the
canonical Kaki face grid. No generated pseudo-text remains readable at
runtime.

The selected ultra-wide production prompt was:

```text
Wide production panorama for Kaki Surf KAKI-LAND, built for a 1536 by 640 side-scrolling game background. Late-16-bit handmade pixel art with dense authored clusters and crisp edges. Horizontal composition across a 12:5 canvas: bottom 22 percent is uninterrupted readable deep Kaki-blue ocean with cyan and mint wave bands; its pale horizon is a single level anchor. Middle is a lively archipelago of small paper-cream cloud islands connected by repaired cable bridges and only a few restrained five-color rainbow web-ring arcs. Populate the islands with many tiny, wholly original round Kaki artist spirits: one repairs a single pixel at a CRT, one raises a four-symbol reaction card, one tends a lamp, one dries damp drawings, a guestbook gull stamps a picture, and a tiny menace rearranges abstract web buttons. No readable writing anywhere. Upper half opens into layered navy and memory-violet tiled starfield. THE LAST RELAY appears only in the far upper-right distance, small enough to discover during high air: nonhuman dark face-grid body, paper-cloud wings, cable-ring halo, one visibly stitched wing, calm maintenance worker silhouette, low contrast. Warm, funny, lonely, sacred network atmosphere; strong depth; rich but controlled details; clear empty breathing lanes behind gameplay. Palette limited to night ink, Kaki blue, cyan, sea mint, paper cream, violet, signal gold, coral used only as tiny danger accents. No anime, no humanoid angel, no giant foreground face, no centered portrait, no vaporwave, no pastel wash, no text, no logos, no gibberish screens, no modern UI, no glossy 3D, no blur, no smooth gradients.
```

The selected clean-panorama edit prompt was:

```text
Use image_edit on this exact source panorama: /home/nemoclaw/.grok/sessions/%2Fhome%2Fnemoclaw%2Fkaki-surf/019fa4c3-df65-7021-9ef3-b6bae3644cd9/images/1.jpg. Preserve every cloud island, tiny artist, CRT, drawing line, bridge, cable, ocean band, star, palette, and pixel texture. Make one surgical removal only: erase the entire black humanoid figure, its wings, halo, hanging cables, and suitcase from the upper-right sky. Reconstruct that area as the same quiet navy-violet tiled starfield and sparse gold stars already behind it, with no visible patch edge and no replacement character. Do not alter or add anything else. No text, letters, logos, new figures, gradients, blur, or smooth repainting. Output two edited 20:9 versions.
```

The selected nonhuman Relay reference edit prompt was:

```text
Use image_edit on this exact source image: /home/nemoclaw/.grok/sessions/%2Fhome%2Fnemoclaw%2Fkaki-surf/019fa4c3-df65-7021-9ef3-b6bae3644cd9/images/1.jpg. Preserve its ultra-wide composition, cloud islands, artist spirits, bridges, ocean, palette, crisp pixel-art texture, and every other scene detail. Make one surgical replacement only: remove the black humanoid angel in the upper-right and replace it with THE LAST RELAY, a clearly nonhuman floating Kaki signal guardian. It should be an asymmetrical dark navy rounded-square face-grid module with no torso, arms, legs, clothes, suitcase, or human anatomy; two paper-cream cloud wings attach directly to the module, one wing visibly repaired with coral stitches and mint tape; a thin imperfect cable/web-ring halo loops behind it; tiny cyan square eyes and a calm three-pixel expression. Keep it distant, low-contrast, mysterious, about the same overall footprint, and visibly an ordinary repaired network device rather than a person. No new text, letters, logos, symbols that resemble writing, anime, human figure, or smooth rendering. Output three edited 20:9 variants.
```

The superseded first decor-sheet prompt was:

```text
Production sprite-atlas source for Kaki Surf KAKI-LAND. Exact 4 columns by 3 rows of twelve equal isolated cells, no labels and no borders, every cell on the same perfectly flat solid chroma-magenta #ff00ff background for clean removal. Late-16-bit crisp pixel art, hard clusters, consistent tiny-game-sprite scale, front or clean three-quarter view, no shadows, no antialias glow, 6 to 12 colors per sprite. Row 1: quiet round blue Kaki artist repairing one pixel at a taped CRT; alarmed coral-accent artist fixing a cable; deadpan artist holding a cream card with exactly four abstract colored shapes; late-night signal keeper with one gold lamp. Row 2: collector drying three damp drawings; white guestbook gull pressing a gold approval stamp; tiny violet menace rearranging six abstract web buttons; compact cream approval stamp containing a repaired rainbow ring and no writing. Row 3: THE LAST RELAY notice pose, deform reaction pose, settle pose—same clearly nonhuman rounded-square navy face-grid device with paper wings, cable halo, one stitched wing, no anatomy—then a small cloud artist station with repaired CRT and rainbow ring. Wholly original Kaki silhouettes, warm handmade personality, no words, letters, numbers, logos, anime, humans, generic fantasy, gradients, ground plane, scenery, or overlapping cells.
```

The selected decor-sheet v2 prompt was:

```text
Game-production sprite atlas source for Kaki Surf KAKI-LAND, exact 4 columns by 3 rows of twelve equal isolated cells on one perfectly flat solid chroma-magenta #ff00ff background, no labels, no borders, no grid lines. Authentic late-16-bit pixel art with visible square pixels, hard stair-step contours, zero antialiasing, zero smooth shading, 8 to 14 flat palette colors per sprite, bold navy silhouette outlines, consistent 48x40-ish subject footprint inside each cell and generous separation. Row 1: quiet round blue Kaki artist repairing one bright pixel on a taped beige CRT; alarmed coral Kaki artist immediately repairing a snapped cable; deadpan violet Kaki artist holding a cream card with exactly four abstract colored geometric marks and no writing; night-ink signal keeper tending one tiny gold lamp. Row 2: mint collector carefully drying three damp miniature drawings; original paper-cream guestbook gull pressing one gold approval stamp; tiny violet button menace rearranging six abstract old-web badge tiles; compact cream approval stamp shaped like a repaired five-band rainbow ring. Row 3: THE LAST RELAY notice, deform, and settle poses—same clearly nonhuman rounded-square navy face-grid signal device, direct paper-cloud wings, imperfect cable halo, one wing visibly repaired with mint tape and coral stitches, no torso or limbs—then a small cloud artist station with repaired CRT and one rainbow ring. Wholly original Kaki silhouettes, one emotional read and one peculiar prop each. No words, letters, numbers, logos, pseudo-text, real avatars, humans, anime, generic fantasy angel, gradients, blur, glow, glossy 3D, ground plane, scenery, shadows, overlapping cells, watermark, or cropped subjects.
```

## Selected production conversion

`tools/art/build-kaki-land-assets.py` reads the preserved Grok masters and:

- reframes the continuous panorama around one y=502 ocean anchor;
- maps the tiled heaven into the camera's physically reachable high-air band
  without adding shelves, plate swaps, or a second backdrop;
- retains native one-pixel detail and reduces the artwork to 80 colors;
- builds menu/card art from the same panorama and reviewed Relay silhouette;
- packs compact frames for fictional artist functions, the cloud station,
  Approval, and the Last Relay notice/deform/settle reaction.

The fictional artists are aggregate social functions only: repairer, alarm
fixer, reaction-card holder, lamp keeper, drawing collector, approval gull, and
button menace. No private phrases, usernames, member avatars, source emoji,
community screenshots, or identifiable member likenesses were used.

| File | Role | Dimensions | SHA-256 |
| --- | --- | ---: | --- |
| `docs/art-source/aerial/grok/kaki-land-network-master.png` | Selected Grok network master | 1280 x 576 | `6f2273079b98d5d3e6eea03e05293bd7f51bab167e4ddb40cb3a7f02b245edb0` |
| `docs/art-source/aerial/grok/kaki-land-last-relay-concept.jpg` | Selected Relay design reference | 1280 x 576 | `5233faee85f3b7c25d7302dbe2c7f02c164bb1bb3613517af50ad07700722f5c` |
| `docs/art-source/atlases/grok/kaki-land-decor-sheet.jpg` | Superseded 4 x 3 Grok decor source | 1280 x 720 | `3b7221bbcdca68d411302437a917e8fac8059fefbab33d9944c8e3868eb1768b` |
| `docs/art-source/atlases/grok/kaki-land-decor-sheet-v2.png` | Selected crisp 4 x 3 Grok decor source | 1280 x 720 | `ee20eef2543b734aab9dc4efd3802c04c7af46fedc621f021a63c3866fe9fee6` |
| `docs/art-source/aerial/imagegen/kaki-land-continuous.png` | Clean continuous build source | 1536 x 640 | `685f38217fc7706d896e8634d2941050fd01797863caa75e7ce99f21cfd8886d` |
| `assets/backgrounds/kakiLand-aerial.png` | Indexed runtime panorama | 1536 x 640 | `35766d9ba1a71686691a35de29a82da82b1064ced1071a1a01fc927574b0ed29` |
| `assets/backgrounds/kakiLand-menu.png` | Menu and condition-card art | 768 x 432 | `b0937ab0f24be5df3d1f43b4719bc24c21e8764a9bf591b9836fb8d089535053` |
| `assets/generated/kaki-land-decor-atlas.png` | Optional artist/reaction atlas | 256 x 144 | `fa782fe6f4ec7d12dad1da825322385cc68198e092f10cd6337a06c9ad8a72ed` |

The runtime panorama is 289,890 bytes and uses 80 colors. It is non-tileable,
drawn once per frame, and never defines collision. The Last Relay remains an
asymmetric nonhuman signal device with a Kaki face grid, paper wings, a cable
halo, visible repair, and a state-driven reaction. The Guestbook Gull is
deliberately non-reactive to rider altitude, so jumping does not pull its
authored route up or down.

## Rebuild and validation

From the repository root:

```console
python3 tools/art/build-kaki-land-assets.py
python3 tools/art/build-aerial-panoramas.py --condition kakiLand
python3 tools/art/build-aerial-panoramas.py --check
node tools/qa/accept-kaki-gull-stability.mjs
```

The first three commands are deterministic and offline. The first reads only
the preserved local masters. The second performs the shared continuous reframe, palette
reduction, compression, dimension validation, continuity checks, and
static-host size check. Rebuilding requires Pillow only at authoring time. The
final command uses the standard local static host and Chromium debugging ports
to capture a real keyboard jump across a naturally scheduled Guestbook Gull;
its frames and zero-drift metrics live in
`docs/images/qa-gull-stability`.
