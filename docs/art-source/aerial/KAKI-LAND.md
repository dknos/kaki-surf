# Kaki-Land visual source and provenance

Kaki-Land uses one reviewed Grok-derived 1536 x 640 panorama, one 768 x 432
menu image, and one optional 256 x 144 decor atlas. Grok and built-in ImageGen
were used offline for source exploration and production source sheets. The
checked-in conversion is deterministic; the browser does not call an image
model, generate pixels, fetch a CDN, or depend on these rasters for gameplay
geometry.

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
and consistently nonhuman Relay. It is now also preserved but superseded by
the Kemonokaki resident pass below. The offline build removes only
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

## Kemonokaki resident pass

On 2026-07-28 the public [Kemonokaki site](https://www.kemonokaki.net/) was
reviewed as the explicit character reference requested for Kaki-Land. It
describes Kemonokaki as hand-drawn neo-chibi kemonomimi across 19 species
groups. The production sheet does not reproduce any collectible portrait,
hairstyle, outfit, token frame, username, or site image. It translates the
aggregate species language into seven original maintenance residents: kitty,
dragon, lamb, moth, mouse, ghost, and a second kitty station keeper. No
downloaded site artwork ships in the repository.

The selected built-in ImageGen output is preserved unchanged at
`docs/art-source/atlases/imagegen/kaki-land-kemonokaki-decor-sheet.png`.
Generation record: `019fa480-5048-7e93-9854-0c8e62d046b8`. Image 1 was the
superseded Kaki-Land sheet as a layout reference; Image 2 was a temporary
contact sheet of the public species grid as a style/species reference only.

The selected prompt was:

```text
Use case: stylized-concept
Asset type: production source sheet for a 384x216 pixel-art game background decor atlas
Input images: Image 1 is the existing Kaki-Land 4-column by 3-row atlas source and defines the exact cell layout, poses, props, framing, and flat chroma-magenta background. Image 2 is the official public Kemonokaki species overview and is a style/species reference only; do not reproduce any exact portrait, hairstyle, outfit, token, or frame.
Primary request: redraw Image 1 so Kaki-Land's anonymous round background artists are unmistakably original Kemonokaki residents while preserving every cell's job. Exact 4 columns by 3 rows, twelve isolated cells, no labels, no borders, wide gutters, perfectly flat uniform #d10072 chroma-magenta field. Row 1: blue kitty Kemonokaki repairing one pixel at a taped beige CRT; coral dragon Kemonokaki with tiny horns and tail immediately repairing a snapped cable; violet lamb Kemonokaki holding a cream reaction card with exactly four abstract colored shapes; dark moth Kemonokaki with small antennae and folded wings tending one gold lamp. Row 2: mint mouse Kemonokaki carefully drying three damp drawings; keep the paper-cream Guestbook Gull and approval stamp action; tiny violet ghost Kemonokaki rearranging six abstract old-web badge tiles; keep the repaired five-band rainbow approval stamp. Row 3: preserve THE LAST RELAY as the same clearly nonhuman rounded-square navy face-grid network device in notice, deform, and settle poses, then a repaired CRT cloud station maintained by a small cream kitty Kemonokaki. Every Kemonokaki has a huge neo-chibi head, tiny body, large dark sparkling eyes readable after reduction, one clear species silhouette feature, one emotional read, and one prop. Transform the reference language into crisp late-16-bit game sprites with bold navy outlines, hard stair-step contours, visible square pixel clusters, 8-14 flat colors per sprite, consistent 48x40-ish subject footprint. Wholly original fictional composites only.
Color palette: night ink, Kaki blue, cyan, mint, paper cream, memory violet, signal gold, restrained coral and pink.
Constraints: preserve the exact twelve-cell semantic order and all props; no exact copied portrait or outfit; no readable words, letters, numbers, pseudo-text, logos, NFT frames, humans, generic anime bodies, gradients, blur, glow, glossy 3D, scenery, shadows, ground plane, grid lines, watermark, overlaps, or cropped subjects.
```

The same resident brief was also explored through local Grok session
`019fa94e-3533-7532-8210-6def44a72929`:

```text
Production source sheet for Kaki Surf KAKI-LAND background residents, exact 4 columns by 3 rows of twelve isolated cells on one perfectly flat uniform chroma-magenta #D10072 field, no borders or labels. Translate the public Kemonokaki neo-chibi kemonomimi language into wholly original late-16-bit game sprites: huge cute heads, tiny bodies, sparkling dark eyes, bold navy outlines, one clear species silhouette and one prop each, never copy an existing collectible portrait, hairstyle or outfit. Row 1: blue kitty repairs one bright pixel at taped beige CRT; coral baby dragon with horns and tail fixes snapped cable; violet lamb holds cream card with exactly four abstract color shapes; dark moth with antennae and folded wings tends gold lamp. Row 2: mint mouse dries three damp drawings; paper-cream Guestbook Gull stamps an open book; tiny violet ghost rearranges six abstract old-web badge tiles; repaired five-band rainbow approval stamp. Row 3: same nonhuman navy rounded-square face-grid Last Relay device in notice, deform, settle poses with cream routing wings, cable halo, one repaired wing; final cell cream kitty maintaining repaired CRT and rainbow ring on cloud. Crisp hard square pixel clusters, consistent 48x40-ish silhouette per cell after reduction, 8-14 flat colors, generous gutters. Kaki palette: night ink, blue, cyan, mint, paper cream, violet, gold, restrained coral and pink. No exact token copies, readable text, letters, numbers, pseudo-text, logos, NFT portrait frames, humans, generic anime bodies, gradients, blur, glow, glossy 3D, scenery, shadows, grid lines, watermark, overlaps or crops.
```

Both Grok candidates were rejected: one added a gradient field and readable
`APPROVED`; the other added cell panels and readable `REPAIRED`. Neither is
copied into the repository or runtime.

## User-licensed plush i2i pass

On 2026-07-28 the user supplied four 300 x 300 RGBA character portraits and
stated that they own the corresponding Kemonokaki NFTs and hold the license
needed to use the portraits. This record captures that rights assertion; it
does not infer rights from NFT ownership independently. The original portraits
are not checked into the public repository. Their exact local inputs were:

| Supplied filename | Intended identity | SHA-256 |
| --- | --- | --- |
| `chii.png` | Chii | `2791388be17d0141b3737038bd0268383645c8663531f280436147ef1ee63f42` |
| `rockstar.png` | Rockstar | `7132e86e1fa537f172baf1db7a66db80a6734ebeb151d78bfa00e1fbc57ae93f` |
| `mermaid.png` | Mermaid | `a26edfcb6d9b87cd57bf1faab83fa7a7c0b8fe8226b96efdb9cc067da9c48544` |
| `kitty.png` | Kitty | `2a23688af2dad9230d15b81902411323a8f600b284e6b06711008e89057eea47` |

Each portrait was inspected locally, then edited separately with built-in
ImageGen in generation record `019fa480-5048-7e93-9854-0c8e62d046b8`.
Each image had one role: identity-preserving edit target. The shared prompt
contract was:

```text
Use case: style-transfer
Asset type: licensed character reference converted into a Kaki Surf background plush sprite source
Primary request: transform the pictured character into one charming handmade sewn plush doll, full body, seated front or clean three-quarter view, designed to remain recognizable after reduction into late-16-bit pixel art.
Style/medium: matte felt and short-pile fabric, extra-large soft head, tiny stuffed body, short rounded limbs, crisp silhouette, minimal shading, visible seam stitches, one repaired patch, and handcrafted Kaki warmth.
Composition: one isolated character only, fully visible and centered with generous padding.
Scene/backdrop: perfectly flat uniform solid #00FF00 chroma-key background with no floor, shadow, gradient, texture, glow, reflection, scenery, or lighting variation.
Constraints: preserve identity and comic expression; change only the presentation into a plush doll; no realistic anatomy, words, letters, numbers, logos, watermark, frame, UI, duplicate, or extra object.
Avoid: glossy 3D, plastic toy, realistic person, anime body, detailed fingers, loose fur, blurry edges, painterly background.
```

The identity locks added to that shared contract were:

- Chii: long taupe-brown hair and straight fringe, pale face, navy sparkling
  eyes, pink pointed ears, white halo, white robe, narrow red cord, quiet
  expression.
- Rockstar: charcoal hair with two round buns and braided fringe, red
  underlayer and side locks, cool pale face, indigo eyes, three forehead dots,
  white frilled blouse, black ribbon, cheerful expression.
- Mermaid: long sea-mint hair, pink face, violet-blue eyes, cream spiral shell,
  pink fin ears, purple starfish, striped sailor top, and one curled turquoise
  plush tail.
- Kitty: plum cat ears and fringe, white bow, cream face, closed eyes, two
  bright cyan comic tears, raised paw pads, chest camera, curled tail, and
  overwhelmed happy-crying expression.

The 1254 x 1254 selected outputs are preserved under
`docs/art-source/atlases/imagegen/plushers`. The offline build removes only the
border-connected neon-green field, erodes its high-resolution fringe before
reduction, fits each full silhouette into 64 x 48, limits it to 15 colors, and
adds one dark pixel outline. No runtime image generation occurs.

## Selected production conversion

`tools/art/build-kaki-land-assets.py` reads the preserved Grok panorama and
ImageGen Kemonokaki decor and plush masters and:

- reframes the continuous panorama around one y=502 ocean anchor;
- maps the tiled heaven into the camera's physically reachable high-air band
  without adding shelves, plate swaps, or a second backdrop;
- retains native one-pixel detail and reduces the artwork to 80 colors;
- builds menu/card art from the same panorama, all four named plushers, and
  the reviewed Relay silhouette;
- packs compact frames for seven original Kemonokaki maintenance residents,
  the Guestbook Gull, Approval, and the Last Relay notice/deform/settle
  reaction, then adds Chii, Rockstar, Mermaid, and Kitty as a fourth atlas row.

The fictional artists are aggregate social functions only: repairer, alarm
fixer, reaction-card holder, lamp keeper, drawing collector, approval gull, and
button menace. The public Kemonokaki species language supplies silhouette
traits, not member identity. The four named plushers are the explicit exception:
they intentionally derive from the four user-supplied, user-licensed portraits
listed above. No other private phrases, usernames, member avatars, source emoji,
community screenshots, collectible portraits, or identifiable likenesses were
used.

| File | Role | Dimensions | SHA-256 |
| --- | --- | ---: | --- |
| `docs/art-source/aerial/grok/kaki-land-network-master.png` | Selected Grok network master | 1280 x 576 | `6f2273079b98d5d3e6eea03e05293bd7f51bab167e4ddb40cb3a7f02b245edb0` |
| `docs/art-source/aerial/grok/kaki-land-last-relay-concept.jpg` | Selected Relay design reference | 1280 x 576 | `5233faee85f3b7c25d7302dbe2c7f02c164bb1bb3613517af50ad07700722f5c` |
| `docs/art-source/atlases/grok/kaki-land-decor-sheet.jpg` | Superseded 4 x 3 Grok decor source | 1280 x 720 | `3b7221bbcdca68d411302437a917e8fac8059fefbab33d9944c8e3868eb1768b` |
| `docs/art-source/atlases/grok/kaki-land-decor-sheet-v2.png` | Superseded crisp 4 x 3 Grok decor source | 1280 x 720 | `ee20eef2543b734aab9dc4efd3802c04c7af46fedc621f021a63c3866fe9fee6` |
| `docs/art-source/atlases/imagegen/kaki-land-kemonokaki-decor-sheet.png` | Selected original Kemonokaki resident sheet | 1672 x 941 | `83db466f1ee9c67327d73df46fc1e13b9c39350462c75544edd271f9e1f9083f` |
| `docs/art-source/atlases/imagegen/plushers/chii-plusher-i2i.png` | Selected Chii plush i2i master | 1254 x 1254 | `ba417dbb36694d33dd05a02111d7eac3fec31bbef677793b4d5d4bcdfb1f00de` |
| `docs/art-source/atlases/imagegen/plushers/rockstar-plusher-i2i.png` | Selected Rockstar plush i2i master | 1254 x 1254 | `78195c51c3657a1678609d5d977f0f10226bdeeba608f6ab9c2b8caf5347aeb7` |
| `docs/art-source/atlases/imagegen/plushers/mermaid-plusher-i2i.png` | Selected Mermaid plush i2i master | 1254 x 1254 | `08999c136f9a18bac5cd5886ec6653494dd9bec51e9b47e6355246ac9f78727e` |
| `docs/art-source/atlases/imagegen/plushers/kitty-plusher-i2i.png` | Selected Kitty plush i2i master | 1254 x 1254 | `1e3cf7db9ad7bbaf7920d64cd790997b82c13cd7d6edf0290936514ff16b3730` |
| `docs/art-source/aerial/imagegen/kaki-land-continuous.png` | Clean continuous build source | 1536 x 640 | `685f38217fc7706d896e8634d2941050fd01797863caa75e7ce99f21cfd8886d` |
| `assets/backgrounds/kakiLand-aerial.png` | Indexed runtime panorama | 1536 x 640 | `35766d9ba1a71686691a35de29a82da82b1064ced1071a1a01fc927574b0ed29` |
| `assets/backgrounds/kakiLand-menu.png` | Menu and condition-card art | 768 x 432 | `49d4f0441f5cb0a9462888cb79dfd3ed3e695f544f90d96dfa8f7fe024bbcfaf` |
| `assets/generated/kaki-land-decor-atlas.png` | Optional Kemonokaki artist/reaction/plusher atlas | 256 x 192 | `769ab6168fca68ff38a6db297c293692d302f94b25965c2c79dfa38f481b5288` |

The runtime panorama is 289,890 bytes and uses 80 colors. It is non-tileable,
drawn once per frame, and never defines collision. The Last Relay remains an
asymmetric nonhuman signal device with a Kaki face grid, paper wings, a cable
halo, visible repair, and a state-driven reaction. The Guestbook Gull is
deliberately non-reactive to rider altitude, so jumping does not pull its
authored route up or down. The four plushers are anchored to their authored
panorama cloud shelf, never traffic-bobbed or player-reactive. Early runs show
Chii and Rockstar, mid runs add Mermaid, and late signal convergence completes
the gallery with Kitty; the menu contains all four.

## Rebuild and validation

From the repository root:

```console
python3 tools/art/build-kaki-land-assets.py
python3 tools/art/build-aerial-panoramas.py --condition kakiLand
python3 tools/art/build-aerial-panoramas.py --check
node tools/qa/accept-kaki-gull-stability.mjs
```

The first three commands are deterministic and offline. The first reads only
the preserved local masters. The second performs the shared continuous
reframe, palette reduction, compression, dimension validation, continuity
checks, and static-host size check. Rebuilding requires Pillow only at
authoring time. `plushers-kakiLand` is the deterministic browser scene for the
complete four-character gallery. The final command uses the standard local
static host and Chromium debugging ports to capture a real keyboard jump across
a naturally scheduled Guestbook Gull; its frames and zero-drift metrics live in
`docs/images/qa-gull-stability`.
