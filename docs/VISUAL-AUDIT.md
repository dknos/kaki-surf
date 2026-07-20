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
- Twilight Glass selects a dedicated six-stage `heroBarrel` profile identifier and `js/hero-wave-visuals.js` presentation: the same canonical profile queries drive its long side-scroller face, left-to-right travelling edge, passed-sky window, pitching-lip contact, collision, and rider line;
- the final four-frame coherent-break atlas supplies the normal-palette curl/pour/collapse silhouette. It cross-fades around the canonical contact and joins code-authored face volume, tube shadow, trailing churn, and foreground water; the earlier full-barrel atlas remains preserved but is no longer rendered;
- the initial four-frame curtain atlas provides restrained downward-pour texture inside the coherent-break family, while the earlier coherent curl and a complete procedural curl/curtain provide ordered fallbacks;
- the classic breaker remains code-owned and terminates on the simulation contact, while generated stages decorate only its upper silhouette and a growing textured cutout repaints sky behind it so the wave reads as passing rather than as a solid wall;
- Twilight removes the full-screen speed-line field. Its sparse horizon/depth marks and seven accumulated presentation clocks never reverse when the rider turns; the waterfall clock is driven by fixed-step wave time so its motion always reads top-to-bottom;
- rider, board, wake, air carry, wildlife, pickups, and parallax use signed travel direction;
- far/mid/near boats, birds, aircraft, banners, wildlife, powerups, and a festival carrier fill the coast with bounded simulation state; every catalogued hull renders in a horizon/water-back band behind the wave, race craft stay small and distant, and intended screen travel survives camera reversals;
- Speed has physical tiers and redundant motion/audio cues, while Flow owns the style/combo presentation;
- Simple controls reduce the primary surface to Action plus context Trick, with optional spin and conditional Special;
- held Simple Trick in Twilight's critical pocket now produces a scored Tube Tuck/Soul Arch with intentionally reduced steering, and large air receives a clamped vertical camera pan that keeps the horizon and landing guide coherent;
- generated atlases use compact silhouettes and local fallbacks so presentation can degrade without hiding gameplay state;
- gameplay callouts use one active message plus a bounded priority queue, minimum readable beats, duplicate suppression, and stale-hint expiry, preventing new events from overlapping or surfacing late.

## Asset review notes

All selected Grok source sheets and all 16 output atlases were inspected at actual size during authoring, including the 1024 x 1024 modular wave source and the 1280 x 720 staged-breaker, earlier full-barrel, component, waterfall-curtain, and coherent-break sources.

- Wave v2 was accepted only after removing literal feather/hand motifs; the staged breaker received a second tapered pass after native-size review exposed the first pass's heavy base.
- The earlier full Twilight barrel candidate passed its original native-size review, but subsequent play review showed that scaling a complete C-shaped composition did not communicate a long passing wave. It remains reproducible provenance, not active runtime art.
- The first new curtain pass established credible top-to-bottom whitewater but still read as an isolated waterfall. The final selected break connects a rounded swell, curling hook, falling sheet, and impact cloud in each frame; only its lower/side continuation is alpha-feathered into runtime water.
- Normal Twilight rendering uses the coherent break, low-opacity internal curtain texture, and component `contactSpray`. High Contrast or a missing primary atlas uses the earlier coherent curl before the complete procedural fallback; `foamCrown`, `faceRibbons`, and `foregroundShoulder` remain packed for provenance but are not rendered.
- Bird v2 removed visible panel dividers.
- UI v2 created adequate gutters and removed pseudo-writing.
- Dolphin, shark, and whale silhouettes remain playful and readable rather than realistic or violent.
- Carrier art reads as a toy-like festival fleet with no weapons or real insignia.
- Board top/rail/underside frames are usable; exaggerated flex-concept frames remain reference material while live flex stays code-driven.
- The airshow source produced four aircraft rather than the requested three; it remains an accepted fictional formation variance.

Exact provenance and prompts are in [Grok asset provenance](./GROK-ASSET-PROVENANCE.md).

## Final visual status

The completed production matrix contains 120 deterministic 1280 x 720 Chromium captures, including six locked Twilight travelling-break stages plus dedicated tube-pocket and big-air-camera fixtures. The refreshed 1200 x 10674 [production contact sheet](./images/qa-contact-sheet.png) contains the full set. Six additional focused responsive captures cover those two fixtures at 1280 x 720, 844 x 390, and 390 x 844.

The final review confirmed:

- four curl positions read as one passing breaker with distinct growth/collapse phases, a shallow authored-sky trail painted after the curl, collision-aligned contact, no rectangular panels, near-native raster proportions, and restrained generated foam accents;
- the Twilight Gather/Pitch/Pour/Deep/Maximum/Collapse sequence reads as one connected break moving left-to-right across a long face: its whitewater falls downward, the passed-left region restores real twilight sky, the pocket remains briefly rideable, the collision edge stays exact, rider reversals never mirror water motion, and no boats, full-screen horizontal line field, rectangular pillar, or hard atlas boundary intrudes;
- desktop, landscape-phone, and portrait-phone fixtures keep the tube rider, big-air rider, horizon, and landing guide visible; portrait preserves the complete 16:9 shot with deliberate letterboxing;
- dolphin, shark, whale, boards, carrier, pickups, boats, birds, and aircraft retain readable silhouettes at 384 x 216;
- left/right travel, reversal, switch landing, wake, monotonic water contours, stable traffic travel, and reverse-parallax scenes remain directionally coherent;
- wildlife and pickup telegraphs stay readable in normal, High Contrast, and Reduced Motion scenes;
- the normal HUD says Speed and Flow, with no stale POWER meter or seam-required teaching;
- Simple and Advanced settings plus both touch layouts fit the 1280 x 720 landscape capture without clipping their primary controls;
- Fleet Airshow remains horizon spectacle while its generated foam gates stay distinct from hazards;
- a temporarily absent dolphin atlas produced a readable local fallback and no launch failure.

The review also drove concrete iteration: bird/aircraft QA heights were corrected, three initially cramped live banner messages gained flexible outlined cloth, and a redundant Airshow capture was removed. Follow-up passes removed wave-atlas rectangles, replaced the water barcode with sparse contours, constrained every hull to a behind-wave water band, moved race craft to the distant horizon, and made the post-curl sky composite final. The first Twilight full-barrel pass fixed silhouette quality but not the side-scroller perspective; the final iteration replaced it at runtime with the coherent travelling break, independent downward fall clock, passed-sky reveal, rideable tube, clean hero-shot traffic suppression, and big-air camera. The canonical gallery is the completed 120-scene matrix described above. This is local browser evidence; GitHub Pages network/cache validation is recorded separately by release engineering after push.

See [QA matrix](./QA.md) for the scene coverage and [Validation results](./TEST-RESULTS.md) for automated and browser totals.
