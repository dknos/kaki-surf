# Validation checklist and results

Date: 2026-07-19.

## Automated checkpoint

Commands:

```console
npm test
npm run check
git diff --check
```

The current native Node run passed **158 tests with 0 failures**. `npm run check` parsed **30 JavaScript modules** successfully. The final whitespace check is recorded with the handoff after documentation edits.

The current suite covers:

- Simple and Advanced control-mode selection, Twilight hero-barrel fresh-save default with returning-profile preservation, migration of older saves to Advanced, mode-switch clearing, keyboard aliases, 120 ms action edges, active-second-gamepad selection, dead zone, and independent touch pointers.
- Controller UI confirm/back edges, dominant-axis navigation, deliberate hold repeat, spatial focus selection, in-place range/select adjustment, and an allocation-free no-pad poll/consume path.
- Native slider/select/checkbox/button keyboard behavior while Settings is open, modal gameplay-input suppression, safe Escape cleanup, and scrollable touch surfaces outside the Canvas control zone.
- Simple context-Trick buffering, tap/hold interpretation, gated fallback, spin impulses, board-specific auto-level, and nearest regular/opposite landing alignment.
- Advanced Q/E/F/T on-wave context, direct aerial actions, ordered multi-trick manifests, rotation naming, trick gates, provisional scoring, exact-repeat decay, landing bank, and wipeout loss.
- Committed bidirectional reversals, signed `travelDirection` and `worldTravel`, velocity scrubbing, switch takeoff/landing data, score/Flow response, and sprite/wake direction contracts.
- Signed scenic parallax, six accumulated nonnegative decorative-water clocks, bounded camera influence that prevents traffic ping-pong, and boat-only far/mid waterline bands.
- Prioritized gameplay callouts with duplicate suppression, stale-message expiry, a bounded queue, readable minimum display beats, and no simultaneous text overlap; the polite live region independently queues 1.25-second announcements and promotes danger instead of replacing speech mid-phrase.
- Six-step Surf School progression driven by real drop, carve, launch, rotation, trick, and landing outcomes; wipeout recovery, one-time completion, save handoff, and replay reset.
- Event-led Flow integrity: idle and rapid input flicks cannot farm combo, while sustained arcs and rhythmically valid pumps beat spam.
- Escalating monotonic curl pressure, eight-second opening grace, skilled relief, bounded respawn recovery, deterministic idle/skilled threat windows, and collision-aligned profile-specific contact.
- Condition-first wave-profile installation, preserved `classic` geometry for Golden Coast/Stormbreak, Twilight `heroBarrel` ride/air bounds and entry alignment, six staged hero sections, a real open aperture, and canonical aerial collision at the visible pitching lip.
- Surface-gradient downhill acceleration, uphill cost, traverse drive, board hard caps, pump enhancement, speed-derived big air, landing carry, and separation of Speed from Flow.
- Board-specific steering, pop, air correction, landing windows, Simple correction strengths, and the 18% scoring reduction for explicit Steering/Landing assists.
- Seeded `WorldSimulation` traffic pools, layer capacity and culling, stable stream isolation, quiet periods, wildlife phase machines, swept collision/reachability, powerup collection/consumption, carrier/airshow state, and bounded signal queues.
- Bird reactions and harmless final-moment dodge, one-shot Feather Thread, courier and aircraft drops, no-penalty speedboat/jet-ski races, Dolphin/Fleet foam gates, and deterministic style-score integration.
- Dolphin/whale mount and dismount interactions, shark telegraph/contact/near-miss behavior, Mango Rush, Moon Pop, Star Foam, and semantic event/audio wiring.
- Lifecycle-owned audio transport with bounded scheduling after long pauses, finite saved gain values, separate board-contact and airborne-wind layers, priority ducking, a dynamics limiter, suspended-context resume, and persistent master mute.
- Asset-manifest paths for all 14 generated atlas families, generated-atlas dimensions, four-second optional-image timeout/fallback behavior, deterministic wave-source hashing, local-only static imports, 384 x 216 backing Canvas, and no runtime remote generation dependency.
- Capability-aware touch lifecycle gating, explicit 44 px Pause/top controls, unscaled 45 px short-landscape D-pad, a measured 24 px portrait gutter, accessible Settings name, and rotation-safe held-pointer neutralization.
- Fixed-step equivalence, finite-state assertions, event capacity, presentation/audio cleanup on retry, semantically corrupt-save normalization, monotonic records, and seeded random-input soak behavior.

## Browser QA status

The canonical browser matrix contains 118 completed deterministic captures, including the six locked Twilight hero-barrel stages:

- The gallery, capture script, and contact-sheet source contain the same **118 scene identifiers**.
- The checked-in capture directory contains all **118 normalized 1280 x 720 renders**. `docs/images/qa-contact-sheet.png` is the complete 1200 x 10674 assembly and includes Gather, Pitch, Open, Deep, Maximum, and Collapse.
- An exact-image hash scan found 114 unique bitmaps. Three intentional board/condition identity groups render identically; the dedicated cargo ship, fishing boat, and sailboat fixtures are distinct and visibly staged in the safe far-right water band.
- The current CDP play probe exercised menu, native Settings slider input, modal Space suppression, native dialog close, start, pause, resume, corrupt-save reload, and a 100-restart stress loop with a stable 436-node DOM. It completed with **0 console errors, 0 uncaught exceptions, and 0 failed runtime loads**; the checked-in SVG favicon also removes the previous optional 404.
- The responsive rerun captured menu, active play, pause, results, and options at 1280 x 720, 1366 x 768, 1024 x 768, 390 x 844, and 844 x 390. A real emulated touch drag scrolled the 844 x 390 Settings dialog from 0 to its 383 px maximum while the dialog reported `touch-action: pan-y`.
- A browser fault injection temporarily removed the dolphin atlas. Launch remained successful and the deterministic dolphin fallback stayed visibly readable; the production atlas was then restored and size-checked.
- Live banner text remains simulation-positioned on flexible cloth. Breaker-aware occlusion hides ordinary mid-watercraft before they enter the curl/player zone while retaining deliberate wake-race craft ahead of it, and gameplay callouts queue instead of stacking.
- Selected Grok sources, all 14 runtime atlases, menu/results, all four classic curl states in three conditions plus High Contrast, distant race craft, wildlife, controls, banners, carrier, and access modes were inspected at actual output size. Normal Twilight rendering uses the full authored barrel plus `contactSpray`; its procedural fallback may use `foamCrown` and `contactSpray`. Packed `faceRibbons` and `foregroundShoulder` are not rendered.
- The current rendering-polish rerun confirmed distinct classic swell/pitch/curl/collapse silhouettes and a coherent Twilight Gather/Pitch/Open/Deep/Maximum/Collapse progression. The hero barrel preserves a real sky/backwater aperture, collision-aligned contact, a continuous trough under Kaki, no horizontal direction-switching line field, no stray traffic inside the wave composition, and no visible atlas boundary.
- A fresh-storage controller-only CDP run selected Moon Log, started Twilight, paused and resumed without leaking A/B into gameplay, opened Settings, changed Effects volume, closed with B, navigated Results, and retried with A. A second real mobile run verified 44 px Pause, visible touch clusters, and pause/neutralization while Action remained held through landscape-to-portrait rotation. The 25-scene responsive matrix plus supplemental 320 × 700 Simple/Advanced passes were captured to temporary review directories and visually inspected.

The [QA matrix](./QA.md) records the reviewed coverage, and [Visual audit](./VISUAL-AUDIT.md) records the adjustments made from that review.

## Not physically verified in this environment

- USB/Bluetooth controller feel, reconnect behavior, trigger variance, and hardware rumble.
- Multi-touch on physical iOS/Android devices, including safe areas and browser toolbars.
- VoiceOver/NVDA announcement pacing and switch/voice-control operation.
- Thermal, battery, audio-latency, and frame pacing on older phones, integrated GPUs, and low-powered Chromebooks.
- Return-to-town behavior inside Kitty Kaki Survivors; the lifecycle adapter exists, but the host repository was intentionally not modified.
