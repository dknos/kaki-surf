# Visual audit

Date: 2026-07-21.

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
- the Twilight barrel now travels visibly during its collision-safe opening grace, while mirrored edge-joined background strips and diagonal face flecks provide layered leftward parallax from the first ride frames without introducing horizontal speed rails or reversal ping-pong;
- rider, board, wake, and air carry use signed travel direction; wildlife, pickups, and parallax keep their authored trajectories under Twilight's forward-only camera instead of flipping when Kaki turns;
- far/mid/near boats, birds, aircraft, banners, wildlife, powerups, and a festival carrier fill the coast with bounded simulation state; every catalogued hull renders in a horizon/water-back band behind the wave, race craft stay small and distant, and intended screen travel survives camera reversals;
- Speed has physical tiers and redundant motion/audio cues driven by the canonical board velocity, while Flow is compact style/combo feedback only;
- Simple controls keep line choice, Action, context Trick, and the common Turbo action; direct spin/trick keys appear only when Advanced Controls are deliberately selected;
- held Simple Trick or Advanced T in Twilight's critical pocket now produces a scored Tube Tuck/Soul Arch with intentionally reduced steering, live tube HUD, entry/hold hysteresis, pocket grace, deliberate re-arm, coherent exit feedback, and a short foreground fade;
- large air now follows a canonical nonlinear altitude through authored Coastal Sky, Cloud Layer, Upper Atmosphere, and Kaki Space crops; launch speed, lip climb, compression, and Turbo jointly qualify the ceiling, while signed horizontal panorama travel, cloud depth, altitude audio, re-entry rush, early camera return, and the landing guide keep the flight connected to the wave;
- generated atlases use compact silhouettes and local fallbacks so presentation can degrade without hiding gameplay state;
- gameplay callouts use one active message plus a bounded priority queue, minimum readable beats, duplicate suppression, and stale-hint expiry, preventing new events from overlapping or surfacing late.

## Asset review notes

All selected Grok source sheets and all 15 atlas build outputs were inspected at actual size during authoring. The aerial pass separately compared six Grok and six Vertex/Nano candidates, selected components per condition, and inspected all three 1536 x 640 runtime panoramas at native and browser scale. Thirteen atlas families remain in the browser manifest; the 1280 x 720 continuous side-break and 384 x 216 travelling-break studies are preserved for provenance but no longer loaded or rendered.

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

The completed production matrix contains 141 deterministic 1280 x 720 Chromium captures. It includes the isolated Core Surf Lab, left/right and downhill mirror pairs, carried uphill motion, reversal, launch/landing, all four altitude tiers in all three conditions, Golden Coast re-entry guidance, and whale takeoff/apex/return alongside the existing production states. The refreshed 1200 x 12522 [production contact sheet](./images/qa-contact-sheet.png) contains the full set. Six additional focused responsive captures cover the tube and air fixtures at 1280 x 720, 844 x 390, and 390 x 844.

The final review confirmed:

- Golden Coast, Twilight, and Stormbreak now show the same production side-view break instead of the legacy miniature curl: a long face reaches across the playfield, dense whitewater occupies the passed side, and the diagonal falling ridge is registered to collision without a white shelf or source edge;
- Golden Coast rises through peach cloud towers into cobalt/gold space, Twilight through moonlit violet clouds into aurora and nebula, and Stormbreak through lightning-lit thunderheads into cold stars; every tier remains one continuous condition-specific crop with no exposed solid band;
- the Gather/Pitch/Pour/Deep/Maximum/Collapse sequence advances the staggered columns left-to-right while each column head falls downward and its trail remains fixed; the rider can traverse at least 220 logical pixels, briefly occupy Twilight's pocket, and launch into the existing vertical camera without reversing any water animation;
- desktop, landscape-phone, and portrait-phone fixtures keep the tube rider, big-air rider, horizon, and landing guide visible; portrait preserves the complete 16:9 shot with deliberate letterboxing;
- dolphin, shark, whale, boards, carrier, pickups, boats, birds, and aircraft retain readable silhouettes at 384 x 216;
- whale breach art, collision, foam, and masking share per-phase water metadata; takeoff and return use the same canonical surface anchor, while random production whale encounters remain disabled;
- mounted whales and Kaki now flip together after stable left/right direction commits, and the animal-assisted dismount inherits that active direction;
- left/right travel, reversal, switch landing, wake, monotonic water contours, stable traffic travel, and reverse-parallax scenes remain directionally coherent;
- wildlife and pickup telegraphs stay readable in normal, High Contrast, and Reduced Motion scenes;
- the normal HUD shows only score, time or paws, and a compact active combo; speed is communicated through the trajectory wake, spray, pose, camera, parallax, audio, and water read instead of extra meters;
- Simple and Advanced settings plus both touch layouts fit the 1280 x 720 landscape capture without clipping their primary controls;
- Fleet Airshow remains horizon spectacle while its generated foam gates stay distinct from hazards;
- a temporarily absent dolphin atlas produced a readable local fallback and no launch failure.

The review also drove concrete iteration: the rider now has one path vector, continuous base-speed attraction was replaced by carried energy, all board-contact effects were consolidated into a historical trajectory wake, and the wave gained collision-queried crest, trough, contour, pocket, and power-seam structure. Whale frames now composite rear spray, body, rider, foreground water, and contact foam around one water anchor. The canonical gallery is the 141-scene matrix described above; this remains local browser evidence until a release is pushed and GitHub Pages is verified.

See [QA matrix](./QA.md) for the scene coverage and [Validation results](./TEST-RESULTS.md) for automated and browser totals.
