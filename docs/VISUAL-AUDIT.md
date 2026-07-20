# Visual audit

Date: 2026-07-19.

## Baseline reviewed before this pass

The existing menu and condition environments already had a strong, cohesive neo-chibi handheld identity: clear board cards, warm coastal depth, readable Kitty silhouette, controlled navy/cream/coral/sea-glass palette, and a stable 384 x 216 composition.

The gameplay baseline had three presentation problems relevant to the continuation brief:

- the curl read as a rigid dark polygon wall rather than folding water;
- the POWER and Flow boxes competed while the narrow seam appeared to be the only legitimate source of speed;
- the otherwise rich horizon felt empty because traffic, wildlife, flyby bonuses, signed bidirectional travel, and set-piece depth were absent.

Those observations came from the previous contact sheet plus local baseline menu, neutral ride, and wipeout renders. They are baseline evidence only.

## Implemented visual direction

The current code and assets are structured to address those points:

- a deterministic four-stage Grok atlas gives the classic breaker distinct swell, pitch, open-curl, and collapse silhouettes; a broad code-authored fallback remains for High Contrast or asset failure;
- Twilight Glass selects a dedicated six-stage `heroBarrel` profile and `js/hero-wave-visuals.js` presentation: the same canonical profile queries drive its three-quarter perspective, real sky aperture, pitching-lip contact, collision, and rider line;
- the selected full Twilight barrel supplies the normal-palette hero silhouette, stage-scales around the canonical contact, and joins a continuous code-authored foreground water plane under Kaki; High Contrast or asset failure uses the complete procedural barrel instead;
- the classic breaker remains code-owned and terminates on the simulation contact, while generated stages decorate only its upper silhouette and a growing textured cutout repaints sky behind it so the wave reads as passing rather than as a solid wall;
- sparse curved swell contours and small face glints replace the previous dense horizontal-line texture; all six accumulated presentation clocks and fallback scenic parallax can change rate but never reverse when the rider turns;
- rider, board, wake, air carry, wildlife, pickups, and parallax use signed travel direction;
- far/mid/near boats, birds, aircraft, banners, wildlife, powerups, and a festival carrier fill the coast with bounded simulation state; every catalogued hull renders in a horizon/water-back band behind the wave, race craft stay small and distant, and intended screen travel survives camera reversals;
- Speed has physical tiers and redundant motion/audio cues, while Flow owns the style/combo presentation;
- Simple controls reduce the primary surface to Action plus context Trick, with optional spin and conditional Special;
- generated atlases use compact silhouettes and local fallbacks so presentation can degrade without hiding gameplay state;
- gameplay callouts use one active message plus a bounded priority queue, minimum readable beats, duplicate suppression, and stale-hint expiry, preventing new events from overlapping or surfacing late.

## Asset review notes

All selected Grok source sheets and all 14 output atlases were inspected at actual size during authoring, including the 1024 x 1024 modular wave source, 1280 x 720 staged-breaker source, 1280 x 720 full Twilight barrel source, and 1280 x 720 Twilight component source.

- Wave v2 was accepted only after removing literal feather/hand motifs; the staged breaker received a second tapered pass after native-size review exposed the first pass's heavy base.
- The full Twilight barrel candidate was accepted only after native-size staged review showed one coherent mass, nested perspective contours, an open aperture, a continuous trough, and clean right/bottom integration with runtime water.
- Normal Twilight rendering uses the full barrel plus component `contactSpray`. `foamCrown` is reserved for the procedural fallback; `faceRibbons` and `foregroundShoulder` remain packed for provenance but are not rendered because they read as a pasted fan and detached hump.
- Bird v2 removed visible panel dividers.
- UI v2 created adequate gutters and removed pseudo-writing.
- Dolphin, shark, and whale silhouettes remain playful and readable rather than realistic or violent.
- Carrier art reads as a toy-like festival fleet with no weapons or real insignia.
- Board top/rail/underside frames are usable; exaggerated flex-concept frames remain reference material while live flex stays code-driven.
- The airshow source produced four aircraft rather than the requested three; it remains an accepted fictional formation variance.

Exact provenance and prompts are in [Grok asset provenance](./GROK-ASSET-PROVENANCE.md).

## Final visual status

The completed production matrix contains 118 deterministic 1280 x 720 Chromium captures, including six locked Twilight hero-barrel stages. The refreshed 1200 x 10674 [production contact sheet](./images/qa-contact-sheet.png) contains the full set; `docs/images/menu.png` and `docs/images/ride.png` were refreshed from the same normalized capture run.

The final review confirmed:

- four curl positions read as one passing breaker with distinct growth/collapse phases, a shallow authored-sky trail painted after the curl, collision-aligned contact, no rectangular panels, near-native raster proportions, and restrained generated foam accents;
- the Twilight Gather/Pitch/Open/Deep/Maximum/Collapse sequence reads as one increasingly powerful three-quarter barrel, with nested concave depth bands, a continuous trough beneath Kaki, real sky/backwater through the open side, no direction-switching horizontal line field, no boats inside the wave shot, and no visible atlas seam;
- dolphin, shark, whale, boards, carrier, pickups, boats, birds, and aircraft retain readable silhouettes at 384 x 216;
- left/right travel, reversal, switch landing, wake, monotonic water contours, stable traffic travel, and reverse-parallax scenes remain directionally coherent;
- wildlife and pickup telegraphs stay readable in normal, High Contrast, and Reduced Motion scenes;
- the normal HUD says Speed and Flow, with no stale POWER meter or seam-required teaching;
- Simple and Advanced settings plus both touch layouts fit the 1280 x 720 landscape capture without clipping their primary controls;
- Fleet Airshow remains horizon spectacle while its generated foam gates stay distinct from hazards;
- a temporarily absent dolphin atlas produced a readable local fallback and no launch failure.

The review also drove concrete iteration: bird/aircraft QA heights were corrected, three initially cramped live banner messages gained flexible outlined cloth, and a redundant Airshow capture was removed. Follow-up passes removed wave-atlas rectangles, replaced the water barcode with sparse contours, constrained every hull to a behind-wave water band, moved race craft to the distant horizon, replaced the vertically stretched breaker with the tapered Grok pass, and made the post-curl sky composite final. The Twilight pass then replaced the weak left-side perspective with the selected full barrel, edge-blended it into continuous foreground water, suppressed condition traffic in the hero shot, and locked the six-stage progression. Targeted desktop curl/reversal/boat captures plus true 390 x 844 CDP emulation were inspected; the current browser play probe reported no console messages, uncaught exceptions, or failed runtime loads. The canonical gallery is the completed 118-scene matrix described above.

See [QA matrix](./QA.md) for the scene coverage and [Validation results](./TEST-RESULTS.md) for automated and browser totals.
