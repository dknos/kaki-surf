# Visual audit

Date: 2026-07-20.

## Baseline reviewed before this pass

The existing menu and condition environments already had a strong, cohesive neo-chibi handheld identity: clear board cards, warm coastal depth, readable Kitty silhouette, controlled navy/cream/coral/sea-glass palette, and a stable 384 x 216 composition.

The gameplay baseline had three presentation problems relevant to the continuation brief:

- the curl read as a rigid dark polygon wall rather than folding water;
- the POWER and Flow boxes competed while the narrow seam appeared to be the only legitimate source of speed;
- the otherwise rich horizon felt empty because traffic, wildlife, flyby bonuses, signed bidirectional travel, and set-piece depth were absent.

Those observations came from the previous contact sheet plus local baseline menu, neutral ride, and wipeout renders. They are baseline evidence only.

## Implemented visual direction

The current code and assets are structured to address those points:

- one selected 384 x 216 transparent Grok atlas supplies a continuous outer wall, hollow barrel, falling curtain, and long tapered face in every condition; its foremost falling edge is registered to canonical collision at 53% source width;
- Golden Coast and Stormbreak keep their `classic` physics while Twilight keeps `heroBarrel` tube rules, but all three use `js/hero-wave-visuals.js` so the retired mini-curl, white shelf, and detached-slab compositor cannot appear in a shipped level;
- the source's isolation black, tube opening, lower horizontal rail, left boundary, and lower/right continuation are removed or blended deterministically; live backwater and the condition sky show through rather than a white or opaque rectangle;
- the selected 336 x 208 travelling-break atlas and live waterfall packets add downward-only motion while pressure scales the connected mass, impact churn, and collapse around the same contact edge;
- Twilight removes the full-screen speed-line field. Its sparse horizon/depth marks and seven accumulated presentation clocks never reverse when the rider turns; the waterfall clock is driven by fixed-step wave time so its motion always reads top-to-bottom;
- rider, board, wake, air carry, wildlife, pickups, and parallax use signed travel direction;
- far/mid/near boats, birds, aircraft, banners, wildlife, powerups, and a festival carrier fill the coast with bounded simulation state; every catalogued hull renders in a horizon/water-back band behind the wave, race craft stay small and distant, and intended screen travel survives camera reversals;
- Speed has physical tiers and redundant motion/audio cues, while Flow owns the style/combo presentation;
- Simple controls reduce the primary surface to Action plus context Trick, with optional spin and conditional Special;
- held Simple Trick or Advanced T in Twilight's critical pocket now produces a scored Tube Tuck/Soul Arch with intentionally reduced steering, live tube HUD, entry/hold hysteresis, pocket grace, deliberate re-arm, coherent exit feedback, and a short foreground fade; large air receives a clamped vertical camera pan that keeps the horizon and landing guide coherent;
- generated atlases use compact silhouettes and local fallbacks so presentation can degrade without hiding gameplay state;
- gameplay callouts use one active message plus a bounded priority queue, minimum readable beats, duplicate suppression, and stale-hint expiry, preventing new events from overlapping or surfacing late.

## Asset review notes

All selected Grok source sheets and all 15 active output atlases were inspected at actual size during authoring, including the 1280 x 720 continuous side-break source, its 384 x 216 keyed runtime result, the 384 x 216 travelling-break sheet, and the 1024 x 1024 modular wave source.

- Wave v2 was accepted only after removing literal feather/hand motifs; the staged breaker received a second tapered pass after native-size review exposed the first pass's heavy base.
- The selected continuous side-break differs from the retired complete C studies: the leading waterfall is the registered contact, the entire mass translates left-to-right, the face tapers into live water, the lower rail is removed, and nearly full-screen rider bounds make the composition mechanically side-scrolling rather than a fixed backdrop.
- The first new curtain pass established credible top-to-bottom whitewater but still read as an isolated waterfall. The selected six-cell sheet now contributes only the clean fall/pocket texture; live geometry supplies the sweeping rear mass, lifted crest, broad connected curtain, and impact churn.
- Normal rendering uses the connected side-break texture, live face continuation, Kaki, segmented falling veil/foreground foam, and component `contactSpray`. The passed-left area restores real level sky/backwater, the long straight source rail is keyed out, and a missing optional wave uses the one-path procedural break.
- Three local Qwen edits were compared at source and runtime size. Two damaged framing/chroma or recreated horizontal rails; the travelling-break retry dropped two cells and produced block slabs. All remain documented rejected sources and are absent from the build.
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

- Golden Coast, Twilight, and Stormbreak now show the same production continuous break instead of the legacy miniature curl: the barrel enters from offscreen left, the broad face reaches the rider, the source dissolves into live water without a white shelf or hard image edge, and the foreground foam is registered to collision;
- the Gather/Pitch/Pour/Deep/Maximum/Collapse sequence moves the full connected mass left-to-right and grows it with pressure while broken whitewater packets fall downward; the rider can traverse at least 220 logical pixels, briefly occupy Twilight's pocket, and launch into the existing vertical camera without reversing any water animation;
- desktop, landscape-phone, and portrait-phone fixtures keep the tube rider, big-air rider, horizon, and landing guide visible; portrait preserves the complete 16:9 shot with deliberate letterboxing;
- dolphin, shark, whale, boards, carrier, pickups, boats, birds, and aircraft retain readable silhouettes at 384 x 216;
- left/right travel, reversal, switch landing, wake, monotonic water contours, stable traffic travel, and reverse-parallax scenes remain directionally coherent;
- wildlife and pickup telegraphs stay readable in normal, High Contrast, and Reduced Motion scenes;
- the normal HUD says Speed and Flow, with no stale POWER meter or seam-required teaching;
- Simple and Advanced settings plus both touch layouts fit the 1280 x 720 landscape capture without clipping their primary controls;
- Fleet Airshow remains horizon spectacle while its generated foam gates stay distinct from hazards;
- a temporarily absent dolphin atlas produced a readable local fallback and no launch failure.

The review also drove concrete iteration: bird/aircraft QA heights were corrected, cramped banner messages gained flexible cloth, wave-atlas rectangles and the water barcode were removed, hulls were constrained behind the break, and race craft moved to the distant horizon. The latest pass consolidates all shipped conditions onto one collision-registered long break, keys its tube and outside field back to the real world, removes its generated lower rail, widens riding/air bounds, strengthens bidirectional traversal, and starts the catch edge at x=30. The canonical gallery remains the 120-scene matrix described above; the focused post-change captures and release validation are recorded separately. This is local browser evidence until the GitHub Pages cache is verified after push.

See [QA matrix](./QA.md) for the scene coverage and [Validation results](./TEST-RESULTS.md) for automated and browser totals.
