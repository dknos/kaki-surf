# Gameplay Truth Workstream

## Outcome

Implemented the renderer-independent Q/E/F/T trick and contextual maneuver system in the assigned gameplay files. The simulation owns aerial truth, renderer-facing state is plain data, and `ScoreSystem` is the only banking boundary.

## Contract

- `normalizeTrickInput()` accepts `trick1..trick4`, each with held/`Pressed`/`Released`, and maps legacy `style`, `stylePressed`, and `styleReleased` onto Trick 1.
- Catalog identities are `frontRailGrab`, `tailGrab`, `boardVarial`, and `kakiTwist`. Each has distinct entry timing, gating, risk, base score, hold/discrete behavior, and Foam Puff/Mango Fish/Moon Log specialties.
- `AerialTrickSession.manifest` owns ordered sequence entries, held durations, completion/pose progress, board-relative rotation, body pose, risk, launch data, landing state, invalid orientation, repetition signature, and provisional name/score.
- A held or buffered press can start an identity only once per physical press, and the same identity cannot be farmed repeatedly within one aerial. Different identities can overlap or sequence during a long aerial.
- Board Varial rotates the board independently, requires 0.44 seconds of air and near-complete progress, scores only as a completed landed entry, and leaves a physically bad board angle when interrupted.
- Kaki Twist requires 0.28 seconds before entry, 18 pixels of height, and 0.78 seconds total airtime. Its body and board counter-rotate, board specialties alter its motion/score/risk, and exact repeats use a strong 0.34 decay base.
- Rotation naming uses the actual final accumulated angle, quantized in 180-degree increments. Ordered sequence, rotation size, direction, hold band/apex, and signature variant contribute to the repeat key. Verified names include `360 TAIL GRAB + VARIAL`, `PERFECT 540 VARIAL`, and `KAKI TWIST`.
- `player` publishes `trickPose`, `boardRelativeAngle`, `provisionalTrickName`, `provisionalScore`, `maneuver: { id, progress }`, `landingPreview`, `flowTier`, `trickManifest`, and the canonical `speedPotential` snapshot as numeric/string/plain-data state.
- Q/E/F/T while riding resolve to Snap, Cutback, Floater, and held Tube Tuck/Soul Arch. Eligibility failures emit `trickRejected` plus a short hint and award no maneuver points; successes emit semantic `maneuver` events and alter redirect, speed preservation, pocket position, or steering authority.
- First-run deterministic tutorial signals emit `CLIMB + HOLD PUMP`, `DROP TO POWER SEAM + RELEASE`, and `FIND LIP / Q E F T IN AIR` during the opening 12 seconds, gated by `simulation.tutorialEnabled !== false`.

## Scoring and Physics Invariants

- Launch and airborne activity only update a provisional preview. No air/style/landing points enter `total` until `registerLanding()` commits the finalized manifest.
- Perfect, clean, and wobble apply distinct landing/quality behavior. Wipeout clears provisional state and combo without banking the aerial.
- Exact-repeat decay is calculated from the complete landed signature, not a display-name shortcut. Kaki Twist uses the strongest participating trick decay.
- `ScoreSystem.add()` derives `total` from all breakdown buckets after every award; therefore `score.total === score.bucketTotal()` remains exact. Contextual moves use the dedicated `maneuvers` bucket; tube accrual remains `style`.
- Riding acceleration consumes `GameplayWave.speedPotential(playerX, face, options)`. Its normalized `acceleration` drives `wavePush`, and `pumpEfficiency` scales pump release. A defensive fallback exposes the same field/sign convention if the query is absent.

## Files

- `js/trick-catalog.js`: immutable identities and board specialties.
- `js/tricks.js`: input normalization and deterministic aerial session state machine.
- `js/trick-scoring.js`: pure naming, signatures, rotation quantization, and aerial valuation.
- `js/scoring.js`: provisional transaction, landing bank, repeat history, maneuver scoring, bucket invariant.
- `js/simulation.js`: fixed-step integration, public renderer state, wave query, maneuvers, landing/wipeout/reset, tutorials.
- `tests/tricks.test.js`: focused renderer-free gameplay tests.

## Verification

Fresh final command:

```text
node --check <six assigned JS files>
node --test
git diff --check -- <assigned files>
```

Result: 34 tests passed, 0 failed, including 8 focused trick/scoring/maneuver tests. Module syntax checks and diff whitespace checks exited 0. Git reported only its normal LF-to-CRLF working-copy warning for the two pre-existing tracked JS files.

The optional `ao` and `bd` CLIs were unavailable, so no ratchet/beads record was created. No commit was made because this workstream is being integrated by the coordinating parent agent.

