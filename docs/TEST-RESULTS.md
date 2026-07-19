# Validation checklist and results

Date: 2026-07-19.

## Automated validation

Commands:

```console
npm test
npm run check
git diff --check
```

Final result: 49 tests passed, 0 failed; all 20 JavaScript modules passed syntax checking; the patch passed Git whitespace validation.

The native Node suite covers:

- Complete Q/E/F/T keyboard edges and holds, legacy aliases, pause/restart, buffered input, blur/reset behavior, independent multi-pointer touch, gamepad mappings, dead zones, and B's gameplay-versus-results context.
- Fixed-step equivalence behind 30, 60, and 144 Hz frame schedules.
- Measurably distinct steering, speed cap, launch pop, and landing bands for Foam Puff, Mango Fish, and Moon Log, plus the wider landing band and 18% scoring penalty applied by gameplay assists.
- Canonical power-line targeting, zone separation, wave variation bounds, renderer-guide agreement with the physics query, and exclusive full seam drive on the sustainable power line.
- Persistent wave-momentum build and decay, the momentum-gated ride-speed cap, the off-line speed ceiling, single full-power threshold signaling, and stronger equal-speed launches only after momentum is earned. A natural-input route proves the rider can acquire the seam, climb to the lip, and retain the earned reserve into launch without teleporting simulation state.
- Faster on-wave steering response, bounded lateral velocity, release coasting, and deterministic decay toward the baseline drift.
- Four trick identities, ordered multi-trick aerial strings, actual-rotation 360/540/720 naming, hold/completion gates, board orientation, contextual move rejection, repeat decay, provisional scoring, landing banking, and wipeout loss.
- Presentation feedback wiring for thresholded pump charge, non-spamming combo growth, trick start/completion/rejection events, recoverable landing anticipation, perfect landings, and victory/disappointed results.
- Launch, perfect landing, recovery, bad landing, wipeout, respawn, and clean restart paths.
- A 24,000-step seeded random-input soak with finite-state, score-bucket, event-capacity, and gameplay-bound assertions across repeated runs.
- Backward-compatible save loading, malformed/future-save fallback, monotonic best scores, board/condition metadata, and the unchanged `kaki-surf-meta-v1` storage key.
- Relative static-host paths, local-only native module imports, absence of remote runtime assets/APIs or generated-build dependencies, the 384 x 216 backing canvas, the integration lifecycle surface, and local QA-page assets.

## Browser QA

Status for this production pass: **passed** for the local static build and deterministic renderer states.

Tested from the production launcher on a local static server in both the Codex in-app browser and Chrome:

- Loaded the updated menu with all three boards and the new Golden Coast backdrop.
- Verified Golden Coast power-line charge and seam-earned max-speed states, including the POWER meter, seam marker, wake, gold glints, and speed streaks.
- Verified dedicated Golden Coast, Twilight Glass, and Stormbreak runtime strips and matching `data-condition` values.
- Verified High Contrast intentionally bypasses raster environment art and retains the simpler code-authored background for legibility.
- Captured and decoded all 26 required real-renderer states at a normalized 1280 x 720 documentation viewport.
- Captured no console warnings or errors in the condition and max-speed health pass.

The current visual matrix is the refreshed [production QA contact sheet](images/qa-contact-sheet.png). Movement provenance and seam-to-lip accessibility are covered by the deterministic natural-input simulation test; subjective hardware feel remains part of device testing below.

## Not physically verified in this environment

- USB/Bluetooth controller feel, reconnect behavior, and hardware rumble differences.
- Multi-touch behavior on physical iOS/Android devices, including notch and browser-toolbar safe areas.
- VoiceOver/NVDA announcement pacing and switch/voice-control operation.
- Thermal, battery, audio-latency, and frame-pacing behavior on older phones, integrated GPUs, or low-powered Chromebooks.
- Return-to-town behavior inside Kitty Kaki Survivors; the lifecycle adapter exists, but the host repository was intentionally not modified.
