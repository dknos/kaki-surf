# Validation checklist and results

Date: 2026-07-20.

## Automated checkpoint

Commands:

```console
npm test
npm run check
git diff --check
```

The current native Node run passed **184 tests with 0 failures**. `npm run check` parsed **30 JavaScript modules** successfully. The final whitespace check is recorded with the handoff after documentation edits.

The current suite covers:

- Simple and Advanced control-mode selection, Twilight travelling-break fresh-save default with returning-profile preservation, migration of older saves to Advanced, mode-switch clearing, keyboard aliases, 120 ms action edges, active-second-gamepad selection, dead zone, and independent touch pointers.
- Controller UI confirm/back edges, dominant-axis navigation, deliberate hold repeat, spatial focus selection, in-place range/select adjustment, and an allocation-free no-pad poll/consume path.
- Native slider/select/checkbox/button keyboard behavior while Settings is open, modal gameplay-input suppression, safe Escape cleanup, and scrollable touch surfaces outside the Canvas control zone.
- Simple context-Trick buffering, tap/hold interpretation, scored held Tube Tuck/Soul Arch in the eligible pocket, entry/hold hysteresis, pocket-exit grace, release-required re-arm, exclusive tube maneuver ownership, coherent best-ride duration/score records, finish-run grading, short foreground exit tail, pose cleanup, gated aerial fallback, spin impulses, board-specific auto-level, and nearest regular/opposite landing alignment.
- Advanced Q/E/F/T on-wave context, direct aerial actions, ordered multi-trick manifests, rotation naming, trick gates, provisional scoring, exact-repeat decay, landing bank, and wipeout loss.
- Committed bidirectional reversals, nearly full-screen held-input side-scroller traversal, visible protected-opening barrel advance, monotonic distant-coast/face-fleck parallax, forward-only Twilight camera advance, an earned fully offscreen barrel gap, independent break pursuit, signed `travelDirection` and legacy `worldTravel`, velocity scrubbing, switch takeoff/landing data, score/Flow response, and sprite/wake direction contracts.
- Signed scenic parallax, seven accumulated nonnegative decorative-water clocks, a pause-safe fall clock driven by simulation wave time rather than rider speed/direction, bounded camera influence that prevents traffic ping-pong, and boat-only far/mid waterline bands.
- Prioritized gameplay callouts with duplicate suppression, stale-message expiry, a bounded queue, readable minimum display beats, mechanic-channel replacement for Tube Open/Tuck/Clean Exit, and no simultaneous text overlap; the polite live region independently queues 1.25-second announcements and promotes danger instead of replacing speech mid-phrase.
- Six-step Surf School progression driven by real drop, carve, launch, rotation, trick, and landing outcomes; wipeout recovery, one-time completion, save handoff, and replay reset.
- Event-led Flow integrity: idle and rapid input flicks cannot farm combo, while sustained arcs and rhythmically valid pumps beat spam.
- Escalating monotonic curl pressure, eight-second opening grace, skilled relief, bounded respawn recovery, deterministic idle/skilled threat windows, and collision-aligned profile-specific contact.
- Condition-first wave-profile installation, shared long-face rendering across `classic` and `heroBarrel` physics, x=30 opening contact, expanded ride/air bounds, six staged travelling-break sections, a monotonically growing passed-sky window, fixed-grid gravity columns with persistent contrails, one nonmirroring collision edge, and canonical aerial collision at the visible pitching lip.
- Surface-gradient downhill acceleration, uphill cost, traverse drive, board hard caps, pump enhancement, speed-derived big air, landing carry, and separation of Speed from Flow.
- Board-specific steering, pop, air correction, landing windows, Simple correction strengths, and the 18% scoring reduction for explicit Steering/Landing assists.
- Seeded `WorldSimulation` traffic pools, layer capacity and culling, stable stream isolation, quiet periods, wildlife phase machines, swept collision/reachability, powerup collection/consumption, carrier/airshow state, and bounded signal queues.
- Bird reactions and harmless final-moment dodge, one-shot Feather Thread, courier and aircraft drops, no-penalty speedboat/jet-ski races, Dolphin/Fleet foam gates, and deterministic style-score integration.
- Dolphin/whale mount and dismount interactions, right/left mounted-animal facing and directional dismount carry, ocean-registered whale spawn anchors during big air, shark telegraph/contact/near-miss behavior, Mango Rush, Moon Pop, Star Foam, and semantic event/audio wiring.
- Lifecycle-owned audio transport with bounded scheduling after long pauses, finite saved gain values, separate board-contact and airborne-wind layers, priority ducking, a dynamics limiter, suspended-context resume, and persistent master mute.
- Asset-manifest paths for all 13 runtime atlas families, generated-atlas dimensions, four-second optional-image timeout/fallback behavior, preserved offline wave-source hashing and conversion, local-only static imports, 384 x 216 backing Canvas, and no runtime remote generation dependency.
- Capability-aware touch lifecycle gating, explicit 44 px Pause/top controls, unscaled 45 px short-landscape D-pad, a measured 24 px portrait gutter, accessible Settings name, and rotation-safe held-pointer neutralization.
- Fixed-step equivalence, finite-state assertions, event capacity, presentation/audio cleanup on retry, semantically corrupt-save normalization, monotonic records, and seeded random-input soak behavior.
- Endless no-clock completion on the third wipeout, 36-second active-time Set escalation through the capped final set, increasing threat/score stakes, preserved 78-second Score Attack completion, mode-safe reset/result payloads, independent mode records, and legacy pre-mode best migration to Score Attack.

## Browser QA status

The canonical local-browser matrix contains 121 completed deterministic captures, including six locked Twilight travelling-break stages, separate right/left whale rides, and the rideable-tube and big-air-camera fixtures:

- The gallery, capture script, and contact-sheet source contain the same **121 scene identifiers**.
- The checked-in capture directory contains all **121 normalized 1280 x 720 renders**. `docs/images/qa-contact-sheet.png` is the complete assembly and includes Gather, Pitch, Pour, Deep, Maximum, Collapse, Tube, Air, and both whale-ride directions.
- An exact-image hash scan found 117 unique bitmaps. Intentional shared states are Golden Coast/Foam Puff, Stormbreak/Foam Puff, and the Twilight Foam Puff/condition/traffic trio; right/left whale rides, staged Twilight frames, tube, big-air, cargo ship, fishing boat, sailboat, speedboat, and carrier fixtures remain distinct.
- The current CDP play probe exercised menu, native Settings slider input, modal Space suppression, native dialog close, start, pause, resume, corrupt-save reload, and a 100-restart stress loop with a stable 436-node DOM. It completed with **0 console errors, 0 uncaught exceptions, and 0 failed runtime loads**; the checked-in SVG favicon also removes the previous optional 404.
- A fresh five-scene CDP release scan loaded menu, maximum-break, active-tube, big-air, and results states from the final local tree with **0 console errors, 0 uncaught exceptions, and 0 failed or HTTP-error runtime loads**.
- Fresh Chromium interaction probes selected and started both modes. Score Attack exposed `START SCORE ATTACK`, `78 SECONDS`, a finite 78-second snapshot, and the `78 SEC BEST` record; Endless exposed `CHASE THE HORIZON`, `3 PAWS / NO CLOCK`, a null public timer, Set 1, and the `ENDLESS BEST` record. Both probes reported **0 page errors**.
- The responsive rerun captured menu, active play, pause, results, and options at 1280 x 720, 1366 x 768, 1024 x 768, 390 x 844, and 844 x 390. A real emulated touch drag scrolled the 844 x 390 Settings dialog from 0 to its 383 px maximum while the dialog reported `touch-action: pan-y`.
- A browser fault injection temporarily removed the dolphin atlas. Launch remained successful and the deterministic dolphin fallback stayed visibly readable; the production atlas was then restored and size-checked.
- Live banner text remains simulation-positioned on flexible cloth. Breaker-aware occlusion hides ordinary mid-watercraft before they enter the curl/player zone while retaining deliberate wake-race craft ahead of it, and gameplay callouts queue instead of stacking.
- Selected Grok sources, all 13 runtime atlases, menu/results, the shared column break in Golden Coast/Stormbreak/Twilight, distant race craft, wildlife, controls, banners, carrier, and access modes were inspected at actual output size. The active break is code-native and consumes canonical contact directly.
- The focused rendering-polish capture rerun confirmed a coherent Gather/Maximum/Collapse progression plus Golden Coast and Stormbreak. The gravity front advances left-to-right, newly activated heads pour top-to-bottom, revealed packets remain fixed, the whitewater continues offscreen without a vertical rear seam or horizontal rail, and the visible front edge matches collision.
- A real-keyboard CDP chase began from an ordinary Twilight Endless run rather than a QA fixture. Before any input or wipeout, Kaki moved from x212 to x248 and the barrel visibly advanced from x30 to x40. Right travel then advanced the camera beyond 120 logical pixels and sent the complete break to x=-59; a committed left cutback crossed Kaki below x200 while the forward camera stayed near 125; the same fixed camera then observed the break pursue back to x20. The five screenshots and exact metrics are checked in under `docs/images/qa-chase`.
- A real-input CDP run caught and held a Tube Tuck through 1.1 seconds/+151, 2.2 seconds/+322, and 3.2 seconds/+519 before the barrel closed. The 82.3-second browser session completed at 3,651 points with two wipeouts; a later second tube session began only after a genuine button release and repress, validating the re-arm path outside deterministic fixtures.
- The dedicated Twilight air fixture confirms clamped upward camera framing with extra sky and a coherent horizon; the unit contract caps the target at 62 logical pixels and returns zero under Reduced Motion or outside airborne state.
- A fresh-storage controller-only CDP run selected Moon Log, started Twilight, paused and resumed without leaking A/B into gameplay, opened Settings, changed Effects volume, closed with B, navigated Results, and retried with A. A second real mobile run verified 44 px Pause, visible touch clusters, and pause/neutralization while Action remained held through landscape-to-portrait rotation. The 25-scene responsive matrix plus supplemental 320 × 700 Simple/Advanced passes were captured to temporary review directories and visually inspected.
- The refreshed 25-scene responsive pass verified that the mode selector and start action remain visible before board/condition customization at 390 x 844, the complete menu fits at 844 x 390, the Endless SET panel clears the top HUD, and full-width Best Trick/Best Tube rows do not overlap either results column.
- A 36,000-step Endless soak simulated five wall-clock minutes with the wipeout limit raised only for the probe. It reached capped Set 7, 273 seconds of active ride time, 5,675 displayed metres, 23 recoveries, and 28,291 points in 268.2 ms of Node time; state remained finite, the run remained active, and reported heap use was 9.3 MB. This is a deterministic simulation throughput observation, not a claim about mobile rendering frame rate.

The [QA matrix](./QA.md) records the reviewed coverage, and [Visual audit](./VISUAL-AUDIT.md) records the adjustments made from that review.

This evidence is local to the checked-out static build. It does not represent a post-push network or cache validation of the GitHub Pages deployment.

## Not physically verified in this environment

- USB/Bluetooth controller feel, reconnect behavior, trigger variance, and hardware rumble.
- Multi-touch on physical iOS/Android devices, including safe areas and browser toolbars.
- VoiceOver/NVDA announcement pacing and switch/voice-control operation.
- Thermal, battery, audio-latency, and frame pacing on older phones, integrated GPUs, and low-powered Chromebooks.
- Return-to-town behavior inside Kitty Kaki Survivors; the lifecycle adapter exists, but the host repository was intentionally not modified.
