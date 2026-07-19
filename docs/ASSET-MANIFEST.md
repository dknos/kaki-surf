# Asset manifest and provenance

No NFT/gallery image, supplied JPG pixel, GLB mesh, GLB texture, copied game art, sampled song, or copyrighted California Games asset is shipped in Kaki Surf.

## Shipping assets

| Asset | Form | Authoring/provenance | Runtime status |
| --- | --- | --- | --- |
| Kitty Kaki surfer | Deterministic Canvas pixel clusters in `renderer.js` | Original side-view sprite authored from the canonical `tower-castle-plain.glb` silhouette and palette: blue bob, pale plush face/ears, black hoodie, oversized head; 16-color controlled palette; no source pixels or textures | Ships |
| Boards | Deterministic Canvas/CSS pixel shapes | Original Foam Puff, Mango Fish, and Moon Log silhouettes and patterns | Ships |
| Wave, curl, foam, sky, HUD | Deterministic Canvas primitives | Original stable gameplay wave plus independent visual animation | Ships |
| UI | HTML/CSS | Original arcade shell and accessibility panels | Ships |
| Music and effects | Web Audio synthesis | Original oscillator pattern, filtered noise, and event chirps; no samples | Ships |
| Trait data | `COSMETIC_MANIFEST` in `config.js` | Original deterministic schema; no chain or wallet dependency | Ships |
| Social preview | `public/og.png` in the optional wrapper | Built-in image generation from the finished menu/ride screenshots and user-supplied character reference; inspected for exact text and anatomy; never loaded by gameplay | Ships with wrapper only |

Pixel rules: 384×216 logical canvas; one logical-pixel grid; nearest-neighbor scaling; no image smoothing; no subpixel sprite placement; one-pixel navy outline; 8–10 colors per character pose; environmental dithering only; isolated pixels reserved for face marks, seams, spray, and sparkles. Pose changes are state-driven with compact transition budgets rather than interpolated high-resolution animation.

## User-supplied reference files

| Reference | SHA-256 | Status |
| --- | --- | --- |
| `057d4b5daab18a4858c438fd81441fe4.glb` | `4539D888DD46B4F019679D01899EA353C0166546B809D7370F6FB7B47F9EB301` | Reference-only; rights unverified; not shipped |
| `images (26).jpg` | `948309E1E589B0FD5468658C2E76CBEA2375A3533845BE7AFE670250A697FC23` | Reference-only; rights unverified; not shipped |

The GLB contains 815,432 vertices, 1.5 million triangles, three embedded 4096² textures, no animation rig, and no embedded copyright/license metadata. It is an offline turnaround reference only.

## Kitty Kaki Survivors hero sources

The Survivors repository is an additional first-party universe reference. Its exact mapping is recorded in `HERO-SOURCE-MAP.md` and exported as `SURVIVORS_HERO_SOURCES` from `config.js`.

- Kitty Kaki is avatar id `kitty` and uses the shared donor `assets/breakroom/tower-castle-plain.glb`.
- CowboyKaki is avatar id `cowboy` and uses `assets/breakroom/cowboykaki.glb`.
- Dedicated GLBs exist for the other named Survivors avatars; three hidden kitten variants reuse the Kitty donor with palette tints.
- The GLBs were rendered locally in Blender to validate silhouette and color translation. They remain reference-only and are not fetched, copied, or loaded by the standalone game.

## External style references

- `https://opensea.io/collection/kemonokaki` — reference-only; no downloaded or sampled pixels.
- `https://www.scatter.art/c/kaijukaki/gallery` — reference-only; no downloaded or sampled pixels.
- `https://dknos.github.io/kitty-kaki-survivors/` — universe and integration reference only.

The production direction uses generic neo-chibi proportions, plush deformation, limited palettes, clear silhouettes, and lost-handheld readability. It does not copy token trait stacks, collection backgrounds, logos, weapons, costumes, proprietary layouts, audio, or code.

The only generated raster is the optional social card. Its final prompt and execution record are in `SOCIAL-CARD-PROMPT.md`. All runtime/gameplay imagery remains deterministic Canvas/CSS work.

## Rights note

The user explicitly requested Kitty Kaki as the hero and supplied the reference files. Before a public commercial or collectible release, archive written authorization covering the Kitty Kaki character, Oekaki Maker #4272 if applicable, the plush design contribution, game/merchandising rights, and any NFT-related use. NFT ownership alone should not be treated as blanket commercial character-art permission.
