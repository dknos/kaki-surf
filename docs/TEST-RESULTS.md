# Validation checklist and results

Date: 2026-07-19.

## Automated

- Pass: deterministic identical-seed/input snapshots.
- Pass: equivalent fixed-step state when fed at 30, 60, and 144 Hz.
- Pass: fractional scoring, bucket-total invariant, assist penalty, and repeat-trick decay.
- Pass: explicit launch, landing/recovery, and wipeout paths.
- Pass: intentional held-up carve reaches a launch in under three simulated seconds.
- Pass: Foam Puff, Mango Fish, and Moon Log have distinct side-grade handling and launch metrics.
- Pass: canonical hero metadata maps Kitty Kaki to `tower-castle-plain.glb` and CowboyKaki to `cowboykaki.glb` without introducing runtime GLB loading.
- Pass: malformed/old/future save payloads fail to defaults; best score never decreases; only `kaki-surf-meta-v1` is written.
- Pass: bounded random-input soak completes without non-finite critical state.
- Pass: production build and server-rendered launcher contract.

## Browser QA

- Pass: launcher loads with three selectable board personalities and keyboard focus styling.
- Pass: Drop In reaches a running game with no console errors or required-request failures.
- Pass: HUD, board, wave slope, lip, curl, and landing guide remain distinct at the tested desktop viewport.
- Pass: a complete 78-second no-input run reaches results and persists a new personal best.
- Pass: retry button starts a new run in about 250 ms in the browser check.
- Pass: settings dialog exposes named volume controls, reduced motion, flash reduction, shake, high contrast, touch controls, steering assist, and landing assist.
- Pass: tab visibility/blur hooks pause and clear accumulated simulation time by design and automated inspection.
- Pass: responsive letterboxing keeps a 16:9 pixel canvas without changing the 384×216 backing resolution.

## Not physically verified in this environment

- A specific USB/Bluetooth gamepad and reconnect behavior.
- Multi-touch on physical iOS/Android hardware.
- Screen-reader announcement pacing on VoiceOver/NVDA.
- Long-run profiling on a low-powered Chromebook or older phone.
- Return-to-town behavior inside Kitty Kaki Survivors; the adapter exists, but the host has intentionally not been changed.
