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

- one code-native long face fills the water field while a deterministic 3-pixel column grid builds the advancing break; every column starts at the crest, accelerates downward under a gravity curve, and leaves fixed foam tiles behind;
- Golden Coast and Stormbreak keep their `classic` physics while Twilight keeps `heroBarrel` tube rules, but all three use `js/hero-wave-visuals.js` so the retired mini-curl, white shelf, and detached-slab compositor cannot appear in a shipped level;
- the rejected full-wave isolation field, tube cutout, lower rail, and pasted image boundary are absent from the live compositor; real sky and low backwater are repainted behind the passed whitewater instead of a white or opaque rectangle;
- fixed contrail packets, a broad broken crest, a collision-registered foamy leading ridge, and live churn create downward-only motion while pressure advances the same edge left-to-right;
- Twilight removes the full-screen speed-line field. Its crest is a connected irregular pixel edge rather than a repeating row of horizontal dashes; sparse depth marks and seven accumulated presentation clocks never reverse when the rider turns, while the waterfall clock is driven by fixed-step wave time so its motion always reads top-to-bottom;
- Twilight's rider owns nearly the full screen and a forward-only camera dead zone. Fast right travel can send the break completely offscreen; cutting left moves Kaki across the face without pulling scenery backward, while the barrel continues its own escalating pursuit;
- rider, board, wake, and air carry use signed travel direction; wildlife, pickups, and parallax keep their authored trajectories under Twilight's forward-only camera instead of flipping when Kaki turns;
- far/mid/near boats, birds, aircraft, banners, wildlife, powerups, and a festival carrier fill the coast with bounded simulation state; every catalogued hull renders in a horizon/water-back band behind the wave, race craft stay small and distant, and intended screen travel survives camera reversals;
- Speed has physical tiers and redundant motion/audio cues, while Flow owns the style/combo presentation;
- Simple controls reduce the primary surface to Action plus context Trick, with optional spin and conditional Special;
- held Simple Trick or Advanced T in Twilight's critical pocket now produces a scored Tube Tuck/Soul Arch with intentionally reduced steering, live tube HUD, entry/hold hysteresis, pocket grace, deliberate re-arm, coherent exit feedback, and a short foreground fade; large air receives a clamped vertical camera pan that keeps the horizon and landing guide coherent;
- generated atlases use compact silhouettes and local fallbacks so presentation can degrade without hiding gameplay state;
- gameplay callouts use one active message plus a bounded priority queue, minimum readable beats, duplicate suppression, and stale-hint expiry, preventing new events from overlapping or surfacing late.

## Asset review notes

All selected Grok source sheets and all 15 build outputs were inspected at actual size during authoring. Thirteen atlas families remain in the browser manifest; the 1280 x 720 continuous side-break and 384 x 216 travelling-break studies are preserved for provenance but no longer loaded or rendered.

- Wave v2 was accepted only after removing literal feather/hand motifs; the staged breaker received a second tapered pass after native-size review exposed the first pass's heavy base.
- Full-image C-wave studies were rejected after browser review because their perspective, lower rail, and source boundaries read as a pasted object rather than a surfable side-scroller.
- The selected live treatment follows the narrow-column/contrail construction used by the California Games reference: staggered gravity heads define the diagonal edge and revealed tiles remain fixed as dense whitewater.
- Normal rendering uses the code-native face, gravity columns, fixed foam trail, Kaki, foreground churn, and component `contactSpray`. The passed-left area restores real level sky/backwater, and no optional full-wave bitmap is required for the MVP silhouette.
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

- Golden Coast, Twilight, and Stormbreak now show the same production side-view break instead of the legacy miniature curl: a long face reaches across the playfield, dense whitewater occupies the passed side, and the diagonal falling ridge is registered to collision without a white shelf or source edge;
- the Gather/Pitch/Pour/Deep/Maximum/Collapse sequence advances the staggered columns left-to-right while each column head falls downward and its trail remains fixed; the rider can traverse at least 220 logical pixels, briefly occupy Twilight's pocket, and launch into the existing vertical camera without reversing any water animation;
- desktop, landscape-phone, and portrait-phone fixtures keep the tube rider, big-air rider, horizon, and landing guide visible; portrait preserves the complete 16:9 shot with deliberate letterboxing;
- dolphin, shark, whale, boards, carrier, pickups, boats, birds, and aircraft retain readable silhouettes at 384 x 216;
- whales forced during big air remain ocean-registered and receive a surface shadow, wake, and state-specific foam instead of inheriting the rider's sky position;
- left/right travel, reversal, switch landing, wake, monotonic water contours, stable traffic travel, and reverse-parallax scenes remain directionally coherent;
- wildlife and pickup telegraphs stay readable in normal, High Contrast, and Reduced Motion scenes;
- the normal HUD says Speed and Flow, with no stale POWER meter or seam-required teaching;
- Simple and Advanced settings plus both touch layouts fit the 1280 x 720 landscape capture without clipping their primary controls;
- Fleet Airshow remains horizon spectacle while its generated foam gates stay distinct from hazards;
- a temporarily absent dolphin atlas produced a readable local fallback and no launch failure.

The review also drove concrete iteration: bird/aircraft QA heights were corrected, cramped banner messages gained flexible cloth, wave-atlas rectangles and the water barcode were removed, hulls were constrained behind the break, and race craft moved to the distant horizon. The latest pass retires the pasted full-wave textures from the runtime manifest, consolidates all shipped conditions onto one collision-registered column break, restores the real world behind it, widens riding/air bounds, strengthens bidirectional traversal, and starts the catch edge at x=30. The canonical gallery remains the 120-scene matrix described above; the focused post-change captures and release validation are recorded separately. This is local browser evidence until the GitHub Pages cache is verified after push.

See [QA matrix](./QA.md) for the scene coverage and [Validation results](./TEST-RESULTS.md) for automated and browser totals.
