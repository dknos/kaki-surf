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

- modular wave-breaker frames add crest feathering made of spray, rising curl, impact, churn, foam tendrils, directional spray, and mist while procedural geometry remains collision truth;
- rider, board, wake, air carry, wildlife, pickups, and parallax use signed travel direction;
- far/mid/near boats, birds, aircraft, banners, wildlife, powerups, and a festival carrier fill the coast with bounded simulation state;
- Speed has physical tiers and redundant motion/audio cues, while Flow owns the style/combo presentation;
- Simple controls reduce the primary surface to Action plus context Trick, with optional spin and conditional Special;
- generated atlases use compact silhouettes and local fallbacks so presentation can degrade without hiding gameplay state.

## Asset review notes

All selected 1280 x 720 source sheets and all 11 output atlases were inspected at actual size during authoring.

- Wave v2 was accepted only after removing literal feather/hand motifs.
- Bird v2 removed visible panel dividers.
- UI v2 created adequate gutters and removed pseudo-writing.
- Dolphin, shark, and whale silhouettes remain playful and readable rather than realistic or violent.
- Carrier art reads as a toy-like festival fleet with no weapons or real insignia.
- Board top/rail/underside frames are usable; exaggerated flex-concept frames remain reference material while live flex stays code-driven.
- The airshow source produced four aircraft rather than the requested three; it remains an accepted fictional formation variance.

Exact provenance and prompts are in [Grok asset provenance](./GROK-ASSET-PROVENANCE.md).

## Final visual status

The post-integration set is complete: 112 deterministic 1280 x 720 Chromium captures feed a reviewed 1200 x 10146 [production contact sheet](./images/qa-contact-sheet.png). `docs/images/menu.png` and `docs/images/ride.png` are refreshed from that same normalized set.

The final review confirmed:

- four curl positions read as an advancing breaker, with generated feather, fold, impact, churn, tendrils, and mist anchored to simulation geometry;
- dolphin, shark, whale, boards, carrier, pickups, boats, birds, and aircraft retain readable silhouettes at 384 x 216;
- left/right travel, reversal, switch landing, wake, and reverse-parallax scenes remain directionally coherent;
- wildlife and pickup telegraphs stay readable in normal, High Contrast, and Reduced Motion scenes;
- the normal HUD says Speed and Flow, with no stale POWER meter or seam-required teaching;
- Simple and Advanced settings plus both touch layouts fit the 1280 x 720 landscape capture without clipping their primary controls;
- Fleet Airshow remains horizon spectacle while its generated foam gates stay distinct from hazards;
- a temporarily absent dolphin atlas produced a readable local fallback and no launch failure.

The review also drove concrete iteration: hidden mid-watercraft were moved to a visible post-wave background pass, bird/aircraft QA heights were corrected, three initially cramped live banner messages gained flexible outlined cloth, and a redundant Airshow capture was removed. An exact-image hash scan then found no duplicate gallery frames, and representative console probes reported no uncaught runtime errors.

See [QA matrix](./QA.md) for the scene coverage and [Validation results](./TEST-RESULTS.md) for automated and browser totals.
