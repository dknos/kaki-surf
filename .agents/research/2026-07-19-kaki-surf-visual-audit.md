# Research: Kaki Surf visual and asset audit

**Date:** 2026-07-19
**Backend:** inline (the Codex sub-agent backend was present, but all four thread slots were occupied)
**Scope:** `renderer.js`, `sprites.js`, `wave-visuals.js`, wave/config contracts, DOM/CSS menu and stage presentation, runtime asset policy, and the documentation screenshots/contact sheet. No production source or asset was changed.

## Summary

The runtime contains no 3D background or shipped raster art. The user's “cheap 3D” reaction is caused by pseudo-depth assembled from four broad wave-face contour bands, a large black polygonal curl, rotated CSS clip-path board cutouts, box shadows, and screen-wide gradients. These techniques dominate the frame while Kitty's sprite uses much smaller 1–2 pixel clusters, so the environment reads like crude vector/3D scaffolding behind a pixel character rather than one authored pixel-art world.

The best replacement is deliberately hybrid: native-resolution indexed raster layers for skies/coasts/menu presentation and authored sprite atlases for Kitty, boards, curl foam, wakes, and spray; keep the dynamic wave body and canonical seam code-driven so every visible riding surface still follows gameplay truth. Blender should be used only for orthographic proportion/rotation references and masks, and generated images only for explored compositions; final shipping pixels need palette reduction and manual cluster cleanup.

## Key files

| File | Purpose in the audit |
| --- | --- |
| `js/renderer.js` | Scene composition, condition skies, back water, surfer placement, particles, HUD, camera and flash |
| `js/wave-visuals.js` | Dynamic wave face, depth bands, seam, curl, crest, and assist label |
| `js/sprites.js` | Kitty pose data, board shapes, global sprite rotation, and wakes |
| `js/wave.js` | Canonical crest, face, riding surface, seam, and speed-potential queries that visual art must preserve |
| `js/config.js` | 384x216 resolution, condition palettes, settings, boards, and performance tuning |
| `js/game.js` | Accessible DOM structure plus generated board and condition cards |
| `styles.css` | Fractional stage scaling, scanline/vignette filters, CSS board art, menu panels, and condition thumbnails |
| `qa.css`, `js/qa-gallery.js`, `qa.html` | Contact-sheet layout and screenshot presentation |
| `docs/images/ride.png`, `docs/images/menu.png`, `docs/images/qa/*.png`, `docs/images/qa-contact-sheet.png` | Baseline visual evidence |
| `docs/ASSET-MANIFEST.md` | Confirms there is no runtime bitmap atlas, 3D model, or generated asset |

## Visual evidence and capture caveat

- The contact sheet makes the consistency problem obvious: nearly every play state repeats the same black left-wall curl, four horizontal face bands, gold dashed seam, and block horizon. Golden Coast, Twilight Glass, and Stormbreak mostly change the palette and a few horizon silhouettes, so they do not feel like distinct authored locations (`docs/images/qa-contact-sheet.png`; condition frames are `docs/images/qa/goldenCoast.png`, `twilightGlass.png`, and `stormbreak.png`).
- The saved captures are 1280x683, not native 384x216. The canvas is scaled with `width: min(100vw, 177.7778svh)` at arbitrary fractional ratios (`styles.css:81-98`), then a four-CSS-pixel scanline overlay is multiplied over it (`styles.css:100-106`).
- The QA page then forces those 1280x683 captures into 384x216 or 776x436 boxes with `object-fit: cover` (`qa.css:72-84`). This crops and resamples the already fractionally scaled output, and `.qa-shot` does not request pixelated rendering. The contact sheet therefore is suitable for composition review but not trustworthy for one-pixel cluster QA.
- The contact-sheet claim of “384x216 logical playfield” is technically true of the source canvas but misleading for the stored capture path (`qa.html:10-14`). Future QA should save the gameplay canvas directly at 384x216 and use a separate integer-scale capture for DOM screens.

## Ranked weaknesses

### 1. Wave face and curl — critical, largest visual failure

The wave occupies roughly two thirds of every gameplay frame, so its shortcomings dominate everything else.

- `drawLayeredWave` fills the face, then lays four uninterrupted bands across identical geometry (`js/wave-visuals.js:23-40`). The fixed ranges `0.04..0.2`, `0.2..0.43`, `0.43..0.72`, and `0.72..1.36` read like topographic elevation slices or extruded terrain, not water volume.
- `traceWaveFace` samples every four pixels and connects the samples with Canvas paths (`js/wave-visuals.js:43-49`). The path is mechanically correct but has no authored stepped contour language; every layer inherits the same smooth mathematical edge.
- Depth, shoulder and directional texture use obvious modular grids: x steps of 17, 44, and 34 pixels (`js/wave-visuals.js:57-105`). The repeated horizontal dashes are immediately visible and feel procedural rather than hand composed.
- The “power line” is a nearly continuous gold/teal dashed track built every three pixels (`js/wave-visuals.js:108-123`). It communicates gameplay, but it looks like UI painted on the sea—the exact “glowing track” look the aesthetic brief rejects.
- `drawCurlMass` creates a huge deep-ink polygon from the crest to y=184 and wraps it in horizontal `fillRect` foam bars (`js/wave-visuals.js:125-176`). In captures it reads as a black cliff or vertical 3D wall, while the repeated whitewater bars read as a barcode. Red vertical danger ticks further make it look like a debug/collision overlay.
- Crest foam is another uniform loop across the whole 384-pixel width (`js/wave-visuals.js:178-197`), so lip, shoulder and pocket have little authored hierarchy.

**Replacement:** keep `GameplayWave.crestY`, `ridingY`, `powerFaceAt`, and `speedPotential` as geometry (`js/wave.js:29-53`, `61-137`), but render a five-value water ramp with irregular interlocked clusters rather than parallel bands. Add an indexed curl/foam mask atlas with 8–12 cleaned frames, three families of 2–12 pixel directional streak stamps, and authored crest chunks selected by zone/speed. Anchor every stamp to the canonical wave sample; assets may decorate but never define collision.

The seam should become diegetic: localized luminous foam beads, curved surface reflections, and faster streak cadence within the canonical seam corridor. Retain a small patterned marker/arrow only for Full Wave Read. It must remain visible by luminance and shape, not gold alone.

### 2. Sky, coast and “ground” depth — severe

- Each normal sky is three full-width rectangles (`js/renderer.js:223-229`); Twilight and Storm repeat the same approach (`js/renderer.js:244-290`). That creates broad layer-cake bands before any art appears.
- Golden Coast has only three block clouds, two hills made from three rectangles each, one palm, and three bird glyphs (`js/renderer.js:230-242`, helper shapes at `js/renderer.js:861-903`). Storm clouds, pier and Twilight silhouettes are similarly coarse (`js/renderer.js:270-290`, `906-923`). At this scale these shapes read as placeholder primitives, not economical pixel art.
- `drawBackWater` is one deep-water rectangle plus four rows of evenly spaced single-pixel bars (`js/renderer.js:292-305`). It does not establish an independent ocean plane, swell cadence, reflection path, or depth cue.
- Condition palettes are competent, but composition barely changes. Palette variation cannot substitute for location-specific silhouettes, cloud shapes, horizon activity and reflected light (`js/config.js:227-327`).

**Replacement:** ship native indexed PNG layers per condition:

1. `sky` — 384x80, non-looping, three/four curated value steps with hand-cleaned dithering;
2. `far-coast` — 768x32 seamless strip, two low-contrast depth planes, moving at approximately 0.015x/0.035x travel;
3. `horizon-water` — 768x24 seamless strip with swells, glare and distant foam, moving at approximately 0.06x travel;
4. sparse condition-specific ambient silhouettes in a small atlas (birds, buoy, pier/boat, rain curtain), seeded decoratively and bounded.

Use top-right lighting consistently. Golden Coast should use sun-bleached peach/teal with headlands and warm glare; Twilight should use violet/indigo, harbor lights and a moon path; Stormbreak should use slate/green, rain curtains and hard whitecaps. Background layers should use lower contrast and fewer navy outlines than Kitty/wave foreground so depth comes from value hierarchy, not fake extrusion or blur.

### 3. Fractional scaling, scanlines and vignette — severe presentation multiplier

- `image-rendering: pixelated` is enabled, but the canvas dimensions are arbitrary viewport dimensions rather than an integer multiple of 384x216 (`styles.css:81-98`). The 1280x683 stored captures imply approximately 3.16x vertical logical scaling, so logical pixels receive uneven physical widths/heights.
- The scanline overlay is defined in CSS pixels, not logical pixels (`styles.css:100-106`). It beats against the fractional nearest-neighbor scale and uniformly muddies the palette.
- Menu and layer backdrops use multiple full-screen CSS gradients, translucent vignettes, and blur (`styles.css:114-124`, `393-399`, `794-800`). These are smooth display-space effects laid over coarse native pixels, producing the “cheap remaster filter” look.

**Replacement:** remove scanlines, blur and vignette as default presentation. If CRT styling remains, make it an optional setting. Choose the largest integer stage scale that fits desktop/tablet, center it in authored matte art, and use a documented fractional fallback only when small landscape devices cannot fit a useful integer scale. All screenshot QA should use exact 1x or integer scaling.

### 4. Menu board/condition art and typography — severe language mismatch

- Board cards do not use the gameplay boards. `buildBoardCards` emits an empty span/i/em construction (`js/game.js:326-337`); CSS turns it into a rotated clip-path slab with inset shadows and a tiny rectangle standing in for Kitty (`styles.css:886-950`). It reads like a generic pseudo-3D product card, not a faithful preview.
- Condition cards are CSS linear-gradient thumbnails plus a skewed line (`styles.css:982-1025`), so all three previews are palette bars rather than miniature places.
- The title is large anti-aliased Courier text with `-webkit-text-stroke` (`styles.css:127-150`), while gameplay uses a custom Canvas bitmap glyph set. Tiny 7–10px DOM Courier labels, text shadows and the global scanline pass make menu copy visibly noisy.
- The title layer is a generic card grid on top of the gameplay frame (`js/game.js:763-787`). There is no authored title-screen composition or animated hero, despite the brief.

**Replacement:** keep real DOM buttons, focus semantics and `aria-pressed`, but place native sprite-sheet previews inside them. Reuse the exact board art frames drawn in gameplay, provide 96x54 two/four-frame condition preview strips, add a cleaned native-resolution logo asset, and use one local bitmap font family with large/small cuts. Nine-slice indexed PNG frames can provide ornament without smooth gradients. Do not bake required labels into images.

### 5. Kitty and boards — medium/severe; strongest current element but still under-authored

- Pose selection is broad and semantically useful (`js/sprites.js:9-37`, `95-131`), but each pose only changes offsets on the same rectangle-built body. There are no authored anticipation/follow-through frames inside a pose.
- `drawBoardSprite` rotates the whole vector-like board path (`js/sprites.js:171-185`), and `drawKittySprite` rotates the entire block construction (`js/sprites.js:243-304`). Angles are snapped, but Canvas rotation still creates unstable stair steps and makes Kitty look like a rigid sticker tilting on the wave.
- Board shapes are distinct in code (`js/sprites.js:187-241`), yet at play scale their palette blocks and global rotation are more noticeable than rail, tail and thickness identity.
- `renderer.js` still contains unused legacy wave/board/Kitty drawing functions after the imported production paths (`js/renderer.js:613-810`). They do not affect output, but duplicate ownership makes future art work error-prone and should be removed when integration begins.

**Replacement:** author native atlas frames at approximately 48x56 cells for Kitty and 48x16 for boards. Use cleaned directional frames rather than rotating arbitrary rectangles: 8–16 board directions with 2–3 flex/contact states, plus deliberate Kitty ride/carve/compression/release/aerial/landing/wipeout keyframes. Preserve the semantic pose router; change its output from offsets to frame IDs. Menu cards should draw from the same atlas.

### 6. Wakes, spray and speed hierarchy — medium

- Board wakes are repeated 1–2 pixel bars with a length/profile multiplier (`js/sprites.js:149-169`). They distinguish boards numerically but not as authored hydrodynamic shapes.
- The renderer's 176-particle pool is appropriately bounded (`js/renderer.js:7-20`), but particles render only squares and simple crosses (`js/renderer.js:385-399`), and spray emitters randomize uniform points (`js/renderer.js:542-609`). Major events therefore read as denser confetti, not sheets, fans, curtains or droplets with mass.

**Replacement:** retain the bounded pool but add a small indexed VFX atlas: streak, wedge, droplet, foam clump, glint and star silhouettes. Emit them along deterministic/art-directed arcs with size/shape tiers; reduced-motion uses fewer frames and particles. Use three board-specific wake stamp families and escalate wake width, crest tearing, spray foreground droplets and cadence by flow tier.

## Cohesive production art specification

### Pixel rules

- One art pixel equals one logical 384x216 canvas pixel; no antialiasing, dirty transparency, or fractional source cropping.
- Use a controlled 16–24 color master palette with condition remaps. Foreground characters/wave lip may use a 1–2 pixel navy outline; far backgrounds should use value separation rather than the same heavy outline.
- Light comes from the upper right across sun/moon, Kitty highlights, board rails, wave reflection and foam.
- Favor connected clusters and stepped organic S-curves. Single isolated pixels are reserved for sparkle/rain/face marks; water texture uses irregular clusters, not evenly spaced one-pixel confetti.
- Animate environment tiles at 6–12 Hz with 2–4 cleaned frames. Reduced motion selects stable frames and freezes parallax drift while leaving required gameplay telegraphs clear.

### Recommended asset/code split

| Element | Recommended production form | Why |
| --- | --- | --- |
| Sky/coast/horizon | Indexed native PNG layers | Static composition benefits most from hand-authored detail and very few draw calls |
| Dynamic wave body | Code paths + cached ramp/mask rendering | Must follow `ridingY`, crest, seam, curl and landing truth exactly |
| Curl/foam/crest/wakes/spray | Small transparent indexed atlases, positioned by code | Authored silhouettes without disconnecting art from physics |
| Kitty and boards | Native sprite atlases selected by semantic pose/direction | Avoids rigid rotated primitives and allows readable animation |
| Menu logo/cards/previews | Native logo, atlas previews, nine-slice frames inside accessible DOM | Keeps focus/keyboard/touch semantics while matching gameplay art |
| HUD meters/text | Code/DOM with bitmap font and limited icon atlas | Values remain dynamic and accessible; presentation stays pixel-consistent |

### Offline tool use

- Grok Image is appropriate for 6–12 broad compositions per condition/title and for foam/curl silhouette exploration. Never ship a first raw generation.
- Blender is useful for orthographic Kitty/board/wildlife proportions, turn angles, flat toon lighting and object masks. It should not provide runtime 3D or baked smooth AO/gradients.
- Finalize with nearest-neighbor downsampling, indexed palette mapping, manual silhouette/cluster cleanup, alpha cleanup, frame registration and sprite-sheet metadata. Retain prompts, Blender files and generated intermediates outside runtime assets.

## Exact integration map

1. Add a local asset loader/cache module; decode once before title/play and retain the existing code renderer as a graceful fallback.
2. Replace `KakiRenderer.drawSky`, `drawTwilightSky`, `drawStormSky`, and `drawBackWater` (`js/renderer.js:212-305`) with layer draws and bounded ambient sprites.
3. Rebuild `drawLayeredWave` internals while preserving `powerSeamFaceAt` and `waveGuideAt` bridges (`js/wave-visuals.js:5-40`). Do not duplicate formulas from `GameplayWave`.
4. Convert the semantic pose and board selection in `sprites.js` to atlas frame selection; preserve `resolveKakiPose` and board IDs (`js/sprites.js:91-147`).
5. Replace board/condition placeholder markup visuals in `buildBoardCards` and `buildConditionCards` (`js/game.js:326-354`) with actual local art while retaining buttons, labels and ARIA state.
6. Remove default display-space scanlines/blur/gradients and establish integer stage scaling (`styles.css:73-124`, `393-399`, `794-800`).
7. Repair QA capture: direct 384x216 canvas blobs for gameplay; exact integer-scale DOM captures for menu/results; no `object-fit: cover` resampling (`qa.css:72-84`).
8. Update `docs/ASSET-MANIFEST.md` after integration: it currently explicitly says there is no bitmap atlas and calls primitive renderers production assets (`docs/ASSET-MANIFEST.md:3-5`, `25-38`).

## Performance constraints

- Preserve the 384x216 render target, fixed 120 Hz simulation, 60 FPS presentation, static-host/no-bundler architecture and local-only assets (`js/config.js:1-3`; `docs/ADR-001-standalone-canvas.md:5-7`, `52-56`).
- Decode atlases once; never create images, canvases, arrays or large paths per frame. Cache condition backgrounds and any palette-tinted masks in offscreen canvases.
- Keep gameplay art to a small number of background `drawImage` calls plus bounded wave/foam stamps. A sensible target is below 1.5 MB compressed runtime art and below roughly 8 MB decoded RGBA memory.
- Retain a bounded VFX pool; quality tiers may reduce foam stamps and foreground droplets, but not collision, seam, landing or hazard readability.
- Decorative parallax/random selection must not feed simulation or scoring. Gameplay visuals continue consuming the canonical seeded wave queries.

## Accessibility constraints

- Preserve `reducedMotion`, `screenShake`, `reducedFlash`, `highContrast`, and Wave Read Full/Subtle/Off (`js/config.js:155-167`). Raster additions need explicit high-contrast variants or a tested palette-remap path; baking one palette would regress the current palette-switch behavior.
- Power, critical and safe zones need distinct value, pattern and motion—not hue alone. Full assist may add a compact outlined arrow/reticle; Subtle/Off still need diegetic readable water.
- Reduced motion freezes parallax/tile cycles and reduces spray, but must not remove telegraph silhouettes, seam position, landing tangent or timing information.
- Keep real DOM labels, focus outlines, `aria-pressed`, live-region updates and canvas description (`styles.css:58-64`; `js/game.js:326-379`, `751-862`). Do not bake instructions or interactive labels exclusively into raster images.
- Avoid making Stormbreak so dark that Kitty, seam, foam or HUD drop below readable luminance contrast. High-contrast art should also use silhouette/outline changes, not only brighter cyan/gold.

## Validation quality

**Coverage:** renderer, dynamic wave, sprites, palettes, wave contracts, DOM/CSS menu, QA pipeline, asset policy, prior research, screenshots and scoped git history were inspected. Git history contains only the launch and one premium-overhaul commit for these visual files.

**Depth:** wave/curl 4/4; backgrounds 4/4; stage/CSS and QA scaling 4/4; sprites 3/4; motion/VFX 3/4. Static captures cannot establish frame pacing, parallax cadence, or animation jitter; those require a live browser playthrough after implementation.

**Assumptions:** the checked-in captures represent the current commit. Their state names and compositions match the current QA scene setup, but they are not native pixel dumps. No conclusion above assumes the presence of runtime Blender/Grok assets; the manifest and file tree confirm none exist.

## Recommendation

Start the art implementation with one complete gameplay vertical slice: Golden Coast background layers + rebuilt wave face/curl + seam readability + one cleaned Kitty/board ride cycle + max-speed wake/spray. Capture it directly at native resolution and compare it against `docs/images/qa/goldenCoast.png`, `powerLine.png`, and `maxSpeed.png`. Do not scale the asset pipeline to all conditions/poses until that one slice eliminates the black-cliff curl, contour-band “ground,” primitive horizon, rotated-sticker character and display-filter artifacts together.
