# Wave / Presentation Workstream

Status: complete and verified on 2026-07-19.

## Owned Changes

- `js/wave.js`: canonical power-seam and speed-potential gameplay queries.
- `js/wave-visuals.js`: pure renderer bridge plus layered wave, zones, curl, crest, seam, and Full-assist guidance.
- `js/sprites.js`: board-specific pixel silhouettes, wake profiles, and state/trick-driven Kitty Kaki pose atlas.
- `js/renderer.js`: three-condition presentation, event VFX, impact/wake detail, staged first-run teaching, aerial/landing/charge/flow HUD.
- `js/audio.js`: reactive procedural score and semantic cues with safe teardown.
- `tests/wave.test.js`: deterministic wave-contract and renderer-agreement coverage.

## Public Contracts

### `GameplayWave.powerFaceAt(x)`

Returns the canonical normalized power-seam face coordinate, constrained to `0.31..0.49`. It is deterministic for a wave snapshot and does not mutate wave state.

### `GameplayWave.speedPotential(playerX, face, options)`

Accepted options: `pumpCharge`, `pumpReleased`, `board`, `breaking`, `faceVelocity`, and optional extra caller data. Returned data:

```text
targetFace, error, correction, zone, risk, pocket, pressure, breaking,
lineQuality, potential, pumpEfficiency, acceleration,
pressureContribution, breakingContribution
```

Conventions:

- `error = face - targetFace`.
- `correction = sign(targetFace - face)`; `+1` means carve down/positive input-y and `-1` means carve up.
- `zone` is `safe`, `power`, or `critical`.
- `potential` and `pumpEfficiency` are bounded to `0..1`.
- `acceleration` is bounded to `0.15..1.25` for `wavePush * acceleration * dt` consumption.

### Renderer guide bridge

`powerSeamFaceAt(wave, x)` delegates directly to `wave.powerFaceAt(x)`. `waveGuideAt(...)` delegates to `wave.speedPotential(...)`; rendering contains no duplicate fast-line formula.

## Presentation Notes

- Golden Coast, Twilight Glass, and Stormbreak select condition palettes and distinct skies, horizons, water accents, atmosphere, and procedural instrumentation. High contrast overrides all condition palettes.
- Full/Subtle/Off wave read behavior preserves the natural animated seam in every mode; only Full adds arrows, labels, and the staged first-run lesson. The lesson also respects `simulation.tutorialEnabled === false`.
- Foam Puff, Mango Fish, and Moon Log have short/thick/round, swallow-tail/sharp, and long/round silhouettes plus different flex, wake, and spray profiles.
- Pose routing covers riding carves, pump compression/release, lip/takeoff/rise/apex/fall, four aerial tricks, maneuvers, landing qualities, wobble, three wipeout variants, and result fallbacks.
- Semantic VFX/audio handlers cover power-line enter/leave, pump, maneuver events and IDs, trick start/complete, direct varial/signature events, launch/apex, landing qualities, wipeout, combo growth, and personal best.
- Audio reacts to condition, flow tier, power/pocket risk, airtime, combo, and final seconds. `destroy()` is idempotent and safely stops/disconnects/closes its graph.

## Verification Evidence

- All JS syntax: `Get-ChildItem js -Filter *.js | ForEach-Object { node --check $_.FullName ... }` — exit 0.
- Focused wave tests: `node --test tests/wave.test.js` — 5 passed, 0 failed.
- Full suite: `npm test` — 26 passed, 0 failed.
- Renderer smoke: exercised riding, all three conditions, airborne HUD, and wipeout using a no-op context — `renderer-smoke-ok false` (`imageSmoothingEnabled` remained false).
- Audio lifecycle smoke: construct, repeated `destroy()`, and post-destroy `unlock()` — `audio-destroy-ok`.

`npm run check` is not the syntax evidence above because its `node --check js/*.js` wildcard is not expanded by Windows; the direct per-file syntax command is the platform-correct equivalent.

