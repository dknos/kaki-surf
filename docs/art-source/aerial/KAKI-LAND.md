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

Session `019fa4c8-8f3e-7bd0-ad4f-d07aa80d37b2` generated and refined the
4 x 3 decor sheet. Candidate 9 was selected after native review. The offline
build removes only border-connected chroma, reduces each cell to a 64 x 48
frame, caps each sprite to 15 opaque colors, and manually replaces generated
Relay face marks with the canonical Kaki face grid. No generated pseudo-text
remains readable at runtime.

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

The selected decor-sheet prompt was:

```text
Production sprite-atlas source for Kaki Surf KAKI-LAND. Exact 4 columns by 3 rows of twelve equal isolated cells, no labels and no borders, every cell on the same perfectly flat solid chroma-magenta #ff00ff background for clean removal. Late-16-bit crisp pixel art, hard clusters, consistent tiny-game-sprite scale, front or clean three-quarter view, no shadows, no antialias glow, 6 to 12 colors per sprite. Row 1: quiet round blue Kaki artist repairing one pixel at a taped CRT; alarmed coral-accent artist fixing a cable; deadpan artist holding a cream card with exactly four abstract colored shapes; late-night signal keeper with one gold lamp. Row 2: collector drying three damp drawings; white guestbook gull pressing a gold approval stamp; tiny violet menace rearranging six abstract web buttons; compact cream approval stamp containing a repaired rainbow ring and no writing. Row 3: THE LAST RELAY notice pose, deform reaction pose, settle pose—same clearly nonhuman rounded-square navy face-grid device with paper wings, cable halo, one stitched wing, no anatomy—then a small cloud artist station with repaired CRT and rainbow ring. Wholly original Kaki silhouettes, warm handmade personality, no words, letters, numbers, logos, anime, humans, generic fantasy, gradients, ground plane, scenery, or overlapping cells.
```

## Selected production conversion

`tools/art/build-kaki-land-assets.py` reads the preserved Grok masters and:

- reframes the continuous panorama around one y=502 ocean anchor;
- maps the tiled heaven into the camera's physically reachable high-air band
  without adding shelves, plate swaps, or a second backdrop;
- reduces the artwork to 64 colors on a native two-pixel grid;
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
| `docs/art-source/atlases/grok/kaki-land-decor-sheet.jpg` | Selected 4 x 3 Grok decor source | 1280 x 720 | `3b7221bbcdca68d411302437a917e8fac8059fefbab33d9944c8e3868eb1768b` |
| `docs/art-source/aerial/imagegen/kaki-land-continuous.png` | Clean continuous build source | 1536 x 640 | `5766102880edbcdc6fb656b823ff3bb4f9d26f1323239ca2843a31f15e32d743` |
| `assets/backgrounds/kakiLand-aerial.png` | Indexed runtime panorama | 1536 x 640 | `edcb566f4b33e43169260d7812fd2395d7d5925f2b8514565c6e263f3d4e4c83` |
| `assets/backgrounds/kakiLand-menu.png` | Menu and condition-card art | 768 x 432 | `0f1eb6938919b6a1a4abf4f70e7654feec8a5b2fd8ae5fd4917789f88faab31e` |
| `assets/generated/kaki-land-decor-atlas.png` | Optional artist/reaction atlas | 256 x 144 | `901f04e557a57d8e03c4f22e411030c02e95d2c3d72c9de5d023dab5fd55d235` |

The runtime panorama is 125,257 bytes and uses 64 colors. It is non-tileable,
drawn once per frame, and never defines collision. The Last Relay remains an
asymmetric nonhuman signal device with a Kaki face grid, paper wings, a cable
halo, visible repair, and a state-driven reaction.

## Rebuild and validation

From the repository root:

```console
python3 tools/art/build-kaki-land-assets.py
python3 tools/art/build-aerial-panoramas.py --condition kakiLand
python3 tools/art/build-aerial-panoramas.py --check
```

Both commands are deterministic and offline. The first reads only the preserved
local masters. The second performs the shared continuous reframe, palette
reduction, compression, dimension validation, continuity checks, and
static-host size check. Rebuilding requires Pillow only at authoring time.
