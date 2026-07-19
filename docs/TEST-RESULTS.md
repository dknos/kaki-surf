# Validation checklist and results

Date: 2026-07-19.

## Automated validation

Commands:

```console
npm test
npm run check
git diff --check
```

Final result: 44 tests passed, 0 failed; all 19 JavaScript modules passed syntax checking; the patch passed Git whitespace validation.

The native Node suite covers:

- Complete Q/E/F/T keyboard edges and holds, legacy aliases, pause/restart, buffered input, blur/reset behavior, independent multi-pointer touch, gamepad mappings, dead zones, and B's gameplay-versus-results context.
- Fixed-step equivalence behind 30, 60, and 144 Hz frame schedules.
- Measurably distinct steering, speed cap, launch pop, and landing bands for Foam Puff, Mango Fish, and Moon Log, plus the wider landing band and 18% scoring penalty applied by gameplay assists.
- Canonical power-line targeting, zone separation, wave variation bounds, and renderer-guide agreement with the physics query.
- Four trick identities, ordered multi-trick aerial strings, actual-rotation 360/540/720 naming, hold/completion gates, board orientation, contextual move rejection, repeat decay, provisional scoring, landing banking, and wipeout loss.
- Presentation feedback wiring for thresholded pump charge, non-spamming combo growth, trick start/completion/rejection events, recoverable landing anticipation, perfect landings, and victory/disappointed results.
- Launch, perfect landing, recovery, bad landing, wipeout, respawn, and clean restart paths.
- A 24,000-step seeded random-input soak with finite-state, score-bucket, event-capacity, and gameplay-bound assertions across repeated runs.
- Backward-compatible save loading, malformed/future-save fallback, monotonic best scores, board/condition metadata, and the unchanged `kaki-surf-meta-v1` storage key.
- Relative static-host paths, local-only native module imports, absence of remote runtime assets/APIs or generated-build dependencies, the 384 x 216 backing canvas, the integration lifecycle surface, and local QA-page assets.

## In-app browser QA

Tested from a local static server in the Codex in-app browser:

- Loaded the production launcher, selected the game, and completed a real 78-second no-input run through the results screen; the run persisted a new personal best of 1,325.
- Exercised Q/E/F/T while riding and confirmed context-specific coaching instead of false aerial awards.
- Paused with P, resumed from the dialog, and verified the results retry/change-board actions.
- Opened Access + Audio, verified Full/Subtle/Off Wave Read Assist, enabled High Contrast, and visually checked the changed wave markers.
- At 390 x 844, all nine touch targets were visible, inside the viewport, at least 45 px on their shortest side, and pairwise non-overlapping.
- Captured all 26 required real-renderer states. The gallery reported 26 loaded images and zero broken images.
- The normal gameplay tab and a fresh launcher-to-gallery health tab produced no captured console warnings or errors.

The resulting visual matrix is [the production QA contact sheet](images/qa-contact-sheet.png).

## Not physically verified in this environment

- USB/Bluetooth controller feel, reconnect behavior, and hardware rumble differences.
- Multi-touch behavior on physical iOS/Android devices, including notch and browser-toolbar safe areas.
- VoiceOver/NVDA announcement pacing and switch/voice-control operation.
- Thermal, battery, audio-latency, and frame-pacing behavior on older phones, integrated GPUs, or low-powered Chromebooks.
- Return-to-town behavior inside Kitty Kaki Survivors; the lifecycle adapter exists, but the host repository was intentionally not modified.
