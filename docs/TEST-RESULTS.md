# Validation checklist and results

Date: 2026-07-19.

## Automated checkpoint

Commands:

```console
npm test
npm run check
git diff --check
```

The final native Node run passed **93 tests with 0 failures**. `npm run check` parsed **26 JavaScript modules** successfully. The final whitespace check is recorded with the handoff after documentation edits.

The current suite covers:

- Simple and Advanced control-mode selection, new-save default, migration of older saves to Advanced, mode-switch clearing, keyboard aliases, 120 ms action edges, gamepad mapping, dead zone, and independent touch pointers.
- Simple context-Trick buffering, tap/hold interpretation, gated fallback, spin impulses, board-specific auto-level, and nearest regular/opposite landing alignment.
- Advanced Q/E/F/T on-wave context, direct aerial actions, ordered multi-trick manifests, rotation naming, trick gates, provisional scoring, exact-repeat decay, landing bank, and wipeout loss.
- Committed bidirectional reversals, signed `travelDirection` and `worldTravel`, velocity scrubbing, switch takeoff/landing data, score/Flow response, and sprite/wake direction contracts.
- Signed scenic parallax, monotonic decorative water flow, bounded camera influence that prevents traffic ping-pong, and boat-only far/mid waterline bands.
- Serialized gameplay callouts with duplicate suppression, a bounded FIFO queue, two-second minimum display windows, and no simultaneous text overlap.
- Surface-gradient downhill acceleration, uphill cost, traverse drive, board hard caps, pump enhancement, speed-derived big air, landing carry, and separation of Speed from Flow.
- Board-specific steering, pop, air correction, landing windows, Simple correction strengths, and the 18% scoring reduction for explicit Steering/Landing assists.
- Seeded `WorldSimulation` traffic pools, layer capacity and culling, stable stream isolation, quiet periods, wildlife phase machines, swept collision/reachability, powerup collection/consumption, carrier/airshow state, and bounded signal queues.
- Bird reactions and harmless final-moment dodge, one-shot Feather Thread, courier and aircraft drops, no-penalty speedboat/jet-ski races, Dolphin/Fleet foam gates, and deterministic style-score integration.
- Dolphin/whale mount and dismount interactions, shark telegraph/contact/near-miss behavior, Mango Rush, Moon Pop, Star Foam, and semantic event/audio wiring.
- Asset-manifest paths, generated-atlas dimensions and independent fallback behavior, local-only static imports, 384 x 216 backing Canvas, and no runtime remote generation dependency.
- Fixed-step equivalence, finite-state assertions, event capacity, clean reset/restart, defensive persistence, monotonic records, and seeded random-input soak behavior.

## Browser QA status

The final browser pass is complete:

- **112 deterministic Chromium captures** were rendered at 1280 x 720 from the native static-host route.
- The gallery, capture script, and contact-sheet source contain the same 112 scene identifiers.
- `docs/images/qa-contact-sheet.png` was rebuilt at 1200 x 10146 and inspected alongside native-size key captures.
- An exact-image hash scan found 109 unique renders; the only matching pairs are the three intentional Foam Puff/default-condition identity scenes.
- Representative console probes for menu, results, touch, ambient traffic, live banners, and Fleet Airshow exited successfully with **0 uncaught console errors or failed runtime loads**.
- A browser fault injection temporarily removed the dolphin atlas. Launch remained successful and the deterministic dolphin fallback stayed visibly readable; the production atlas was then restored and size-checked.
- Live banner text remains simulation-positioned on flexible cloth. Breaker-aware occlusion hides ordinary mid-watercraft before they enter the curl/player zone while retaining deliberate wake-race craft ahead of it, and gameplay callouts queue instead of stacking.
- Selected Grok sources, all 11 runtime atlases, menu/results, all four curl states, wildlife, controls, banners, races, carrier, and access modes were inspected at actual output size.
- The rendering-polish rerun confirmed a continuous lighter curl without a black-ring cavity, sparse monotonic water contours in place of reversing bar noise, grounded behind-wave boats, and readable Golden Coast, Twilight Glass, Stormbreak, High Contrast, and Reduced Motion output.

The [QA matrix](./QA.md) records the reviewed coverage, and [Visual audit](./VISUAL-AUDIT.md) records the adjustments made from that review.

## Not physically verified in this environment

- USB/Bluetooth controller feel, reconnect behavior, trigger variance, and hardware rumble.
- Multi-touch on physical iOS/Android devices, including safe areas and browser toolbars.
- VoiceOver/NVDA announcement pacing and switch/voice-control operation.
- Thermal, battery, audio-latency, and frame pacing on older phones, integrated GPUs, and low-powered Chromebooks.
- Return-to-town behavior inside Kitty Kaki Survivors; the lifecycle adapter exists, but the host repository was intentionally not modified.
