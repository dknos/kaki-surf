# Research: Power-line-gated speed, quicker movement, and wave momentum

**Date:** 2026-07-19
**Backend:** inline (Codex sub-agent dispatch was attempted, but the active thread limit was reached)
**Scope:** Canonical wave queries, fixed-step riding and launch physics, movement input, aerial scoring, presentation consumers, tuning, history, and native tests. No production source was edited.

## Summary

Kaki Surf already has one deterministic power-seam query shared by simulation and rendering, and seam proximity affects continuous wave push and pump efficiency. The missing mechanical link is launch power: vertical impulse ignores both earned speed and seam quality, while a held pump charge can create the strongest pop without first riding the seam. Riding movement also feels velocity-served rather than inertial because horizontal movement has no stored velocity, face velocity loses roughly half its value every 0.14 seconds, and speed is exponentially pulled back toward a base target each step.

The clean implementation is to keep `GameplayWave.powerFaceAt()` canonical, add a narrow sustainable `seamDrive` output to `speedPotential()`, integrate that output into a persistent normalized `player.waveMomentum`, and make the global speed envelope plus launch energy depend on both actual speed and that earned reserve. This allows basic jumps everywhere while making maximum speed/pop require a deliberate seam-to-lip route. All new integration remains inside the existing 1/120-second simulation.

## Key Files

| File | Purpose |
| --- | --- |
| `js/config.js` | Fixed step, movement/launch tuning, board multipliers, speed tiers' underlying envelope |
| `js/wave.js` | Canonical seam geometry and pure speed-potential query |
| `js/simulation.js` | Face motion, pumping, speed, lateral movement, lip launch, airborne carry, reset state |
| `js/game.js` | Fixed-step accumulator and renderer interpolation boundary |
| `js/input.js` | Cross-device analog/digital directions and 120 ms action buffering |
| `js/trick-scoring.js` | Pure aerial valuation from launch potential and achieved height |
| `js/scoring.js` | Speed/pocket ride scoring and provisional-to-landed aerial transaction |
| `js/wave-visuals.js` | Renderer bridge that delegates to the canonical wave queries |
| `js/renderer.js` | Flow meter and published `speedPotential`/speed consumers |
| `tests/wave.test.js` | Wave determinism, zones, bounds, and renderer agreement |
| `tests/simulation.test.js` | Render-schedule determinism, board identity, launch/landing, and long-run invariants |

## Current Behavior

### The canonical seam is already the correct source of truth

- `GameplayWave.powerFaceAt(x)` is deterministic, side-effect free, animated from wave state, and constrained to face coordinate `0.31..0.49` (`js/wave.js:44-54`).
- `speedPotential()` compares the player face against that exact target and publishes correction, zone, risk, line quality, pump efficiency, and acceleration (`js/wave.js:61-137`).
- Presentation delegates to the same calls through `powerSeamFaceAt()` and `waveGuideAt()`; it does not duplicate the geometry (`js/wave-visuals.js:5-20`). Existing tests assert exact renderer/query agreement (`tests/wave.test.js:95-104`).
- The sustainable `power` label is currently broad: absolute face error at most `0.12` with pocket at least `0.16`; `critical` overrides it at pocket `0.78` or breaking water (`js/wave.js:116-120`).

### Seam proximity influences drive, but maximum drive is not exclusive enough

- `lineQuality` stays perfect through `0.035` error and falls to zero only at `0.27`, so substantial acceleration remains well outside the visible power zone (`js/wave.js:72-76`).
- Acceleration blends line quality, pocket support, pressure, breaking state, pump-release state, and board acceleration, then globally clamps at `1.25` (`js/wave.js:95-108`). Because the clamp is applied after the blend, both the sustainable seam and the critical curl can reach the same ceiling.
- A controlled query at full pressure with Mango Fish returned `1.25` acceleration at sustainable-pocket errors `0.00`, `0.035`, and `0.06`; an exact line in the near-curl critical zone also returned `1.25`. Thus the current maximum does not uniquely prove that the player rode the sustainable power line.
- Pump efficiency correctly reaches zero far off line, but the actual release impulse still has a `0.55` line-timing floor (`js/simulation.js:194-204`). A completely missed line therefore retains 55% of the timing multiplier before charge, rhythm, and board factors.

### There is no seam energy that can survive the climb to the lip

- The simulation copies the current instantaneous query to renderer-facing state and emits line enter/leave events (`js/simulation.js:174-183`), but the player has no accumulated seam-power or drive-reserve field (`js/simulation.js:904-960`).
- This matters because launch occurs at `face <= 0.025` or during the lip coyote window (`js/simulation.js:252-266`), whereas the seam sits around `0.405` (`js/wave.js:49-53`). A launch-time `zone === "power"` check would always be the wrong design; earned energy must persist while the surfer climbs from seam to lip.
- The defensive `querySpeedPotential()` adapter also drops `lineQuality` and would drop any future seam-drive field unless its fallback, finite coercion, player state, and copier are extended together (`js/simulation.js:523-570`, `js/simulation.js:1021-1049`).

### Jump height is disconnected from speed and the power line

- Launch energy is only `0.72 + abs(faceVelocity)*0.2 + charge*0.3`, clamped to `0.72..1.28` (`js/simulation.js:272-283`). Neither `player.speed`, `speedPotential`, nor any seam history contributes to vertical impulse.
- Riding speed only changes horizontal air velocity through `(speed - 62)*0.115`; it does not change vertical pop (`js/simulation.js:282-283`). A direct probe with identical board/face velocity/charge produced the exact same `airVY = -99.68` at riding speeds 72 and 138, while changing only charge from 0 to 1 changed `airVY` from `-99.68` to `-133.28`.
- Because charge can remain held through the automatic face-threshold launch, a player can maximize the existing charge term without releasing on the seam (`js/simulation.js:185-208`, `js/simulation.js:263-265`). This contradicts the documented climb/hold/drop/release/return-to-lip rhythm (`docs/CONTROLS-AND-FEEL.md:71-83`).
- Scoring does not need a separate seam bonus to reflect a corrected launch: aerial valuation already consumes launch potential and achieved maximum height (`js/trick-scoring.js:128-135`), remains provisional in air, and banks only on landing (`js/scoring.js:93-113`, `js/scoring.js:115-146`).

### Riding has some velocity, but lateral control is not momentum based

- Face input integrates into `faceVelocity`, then removes `carveFriction * velocity * dt` every step (`js/simulation.js:148-161`). At the shipping friction 4.8 (`js/config.js:12-14`), a no-input probe decayed face velocity from 1.0 to 0.542 in 0.125 s, 0.086 in 0.5 s, and 0.0075 in 1 s.
- Speed is damped toward a base target at response 1.12, then receives wave push (`js/simulation.js:210-222`). A seam-positioned Mango Fish probe initialized at speed 120 fell to 100.26 after one second and 93.82 after two seconds. This is stable, but it reads as a target-speed servo more than carried momentum.
- Horizontal wave position has no velocity field. `lateralDrive` is recomputed directly from speed, live x-input, and a maneuver-only redirect every step, then immediately applied to `x` (`js/simulation.js:224-229`). In a probe, switching full x-input to neutral changed input-derived lateral speed immediately; `player` has no `lateralVelocity` (`js/simulation.js:904-960`).
- Airborne movement does have stored `airVX`/`airVY`, drag, and gravity (`js/simulation.js:327-382`), so the missing momentum is specifically the on-wave transition into launch.

### Determinism and input boundaries are sound

- `FIXED_STEP` is exactly `1/120` (`js/config.js:1-4`). The game accumulates render delta, consumes at most 14 fixed steps, and always calls `simulation.update(FIXED_STEP, controls)` (`js/game.js:180-224`).
- Direction input is live and normalized across touch, keyboard, and gamepad; pump/trick edges are buffered independently for 120 ms (`js/input.js:3-35`, `js/input.js:177-220`). No input-layer change is needed for this feature.
- The existing schedule test proves identical outcomes behind 30, 60, and 144 Hz render schedules (`tests/simulation.test.js:78-100`, `tests/simulation.test.js:179-188`). The randomized 24,000-step test checks finite/bounded state and restartability (`tests/simulation.test.js:291-362`).
- Baseline on 2026-07-19: `npm test` passes all 44 tests.

## Recommended Implementation

### 1. Add a narrow, sustainable drive output without changing seam geometry

Keep `powerFaceAt()` untouched. In `GameplayWave.speedPotential()`, retain broad `lineQuality` for readable guidance, but add a stricter normalized `seamDrive` used for top-end physics:

```js
const seamCore = 1 - smoothstep(0.025, 0.115, absoluteError);
const sustainableBand = smoothstep(0.16, 0.34, pocket)
  * (1 - smoothstep(0.68, 0.82, pocket))
  * Number(!breaking);
const seamDrive = clamp(seamCore * sustainableBand, 0, 1);
```

Then make the top of `pumpEfficiency` and `acceleration` depend on `seamDrive`, not only broad `potential`. A conservative acceleration shape is `clamp(0.18 + potential*0.70 + seamDrive*0.38, 0.15, 1.25)`, with existing board/pressure contributions retained but normalized so only `seamDrive` near 1 can reach 1.25. Exact line on the shoulder and exact line in the critical curl should remain useful, but must stay below the sustainable-seam ceiling.

Publish `seamDrive` (and optionally `maxFlowEligible = seamDrive >= 0.85`) in the returned plain object. Extend `querySpeedPotential()`, its fallback, `createSpeedPotentialState()`, and `copySpeedPotential()` in one change so simulation and renderer continue to share one contract.

### 2. Integrate earned wave momentum in fixed-step state

Add `player.waveMomentum` in `createPlayer()` and clear it in every reset/respawn path. During riding, integrate toward `speedPotential.seamDrive`:

```js
const response = speedPotential.seamDrive > player.waveMomentum
  ? tuning.waveMomentumBuild
  : tuning.waveMomentumDecay;
player.waveMomentum = damp(
  player.waveMomentum,
  speedPotential.seamDrive,
  response,
  dt,
);
```

On a successful seam pump release, add a small bounded impulse such as `0.14 * charge * pumpEfficiency`. Recommended build/decay rates are `1.9/s` and `0.55/s`: an exact line reaches about 85% reserve in one second, while leaving it retains about 58% after one second. That persistence is essential for the seam-to-lip climb and is the actual momentum fantasy.

Use the reserve to unlock the speed envelope rather than hard-switching it:

```text
baseTarget = tuning.speed * board.acceleration
hardMax = tuning.maxSpeed * board.maxSpeed
offLineCap = baseTarget + tuning.offLineSpeedHeadroom
unlockedCap = lerp(offLineCap, hardMax, waveMomentum)
```

Pump and wave drive should approach/clamp to `unlockedCap`; a small overspeed decay can preserve brief downhill/external boosts. Keep the final absolute `hardMax` clamp. Reduce the missed-pump floor from the current 0.55 to about `0.22`, e.g. `0.22 + pumpEfficiency*0.98`, so pumping away from the seam remains movement but cannot farm top speed.

### 3. Give on-wave horizontal movement actual inertia

Add `player.lateralVelocity`. Compute a target from speed drift, input, and `redirectVelocity`, then damp toward it quickly while input is held and more slowly while coasting:

```js
const targetLateral = (player.speed - 72) * 0.06
  + inputX * (20 + player.speed * 0.045)
  + player.redirectVelocity;
const response = Math.abs(inputX) > 0.02
  ? tuning.lateralResponse
  : tuning.lateralCoast;
player.lateralVelocity = damp(player.lateralVelocity, targetLateral, response, dt);
player.x += player.lateralVelocity * dt;
```

At the x bounds, remove only outward velocity (or retain a small 0.15 bounce) so stale momentum cannot pin the player into a clamp. Feed a fraction of `lateralVelocity` into `airVX` at launch, which makes the board carry its approach direction into the aerial instead of replacing it with the current input sample.

### 4. Make maximum pop require both earned speed and seam reserve

Compute a normalized actual speed ratio between the board's base target and hard maximum, then use `earnedDrive = min(speedRatio, waveMomentum)`. Replace the charge-dominant launch formula with a split such as:

```js
const launchEnergy = clamp(
  0.72
    + Math.abs(player.faceVelocity) * 0.16
    + player.charge * 0.10
    + earnedDrive * 0.44,
  0.72,
  1.32,
);
```

Basic lip launches remain available at the existing 0.72 floor. Holding charge off-line can improve a jump, but only high actual speed backed by stored seam momentum can reach the top of the range. Add `waveMomentum`, `speedRatio`, and `seamDrive` to `launchData` for QA and future results telemetry; the existing `potential = max(0, -airVY - 70)` automatically carries the higher pop into provisional/landed scoring.

### 5. Conservative first tuning pass

| Tuning | Current | Suggested | Intent |
| --- | ---: | ---: | --- |
| `speed` | 72 | 76 | +5.6% base pace |
| `maxSpeed` | 138 | 144 | Slightly higher earned ceiling |
| `carveAcceleration` | 3.35 | 3.65 | Faster face response |
| `carveFriction` | 4.8 | 4.0 | More carve carry without floatiness |
| `wavePush` | 13.5 | 15.5 | Stronger reward, now seam-gated |
| `pumpStrength` | 17 | 18.5 | More satisfying correct release |
| `rideSpeedResponse` | implicit 1.12 | 0.82 | Slower loss of earned speed |
| `waveMomentumBuild` | absent | 1.9/s | Roughly one-second acquisition |
| `waveMomentumDecay` | absent | 0.55/s | Seam-to-lip carry window |
| `waveMomentumPumpGain` | absent | 0.14 | Rewards a timed seam release |
| `offLineSpeedHeadroom` | absent | 26 | Useful cruising without MAX FLOW |
| `lateralResponse` | absent | 12/s | Responsive input onset |
| `lateralCoast` | absent | 3/s | Readable release/reversal inertia |

Expose the new response values in Surf Lab (`js/game.js:9-28`) during tuning. Do not change fixed-step rate, run timing, landing windows, input dead zone, or action buffering in the same feel pass.

## Required Invariants

1. `powerFaceAt()` remains the only geometric seam query used by physics and rendering.
2. `speedPotential()` remains pure, deterministic, finite, bounded, and non-mutating.
3. Basic launches remain possible without seam reserve; only the maximum speed/pop envelope is gated.
4. Maximum sustainable acceleration is impossible in both the safe shoulder and critical curl, even when face error is zero.
5. Leaving the seam does not zero power instantly; reserve decays over the climb-to-lip window.
6. Board order remains intact: Mango accelerates/carves quickest, Moon Log has the highest absolute cap/pop, Foam Puff remains most forgiving.
7. `waveMomentum` stays in `0..1`; `lateralVelocity` and all speed-potential fields stay finite; speed never exceeds `tuning.maxSpeed * board.maxSpeed` except no allowed tolerance beyond the existing randomized-test epsilon.
8. Reset, respawn, wipeout, and new-run paths clear new motion state consistently.
9. Gameplay uses only fixed-step `dt`; no render delta, wall clock, `Math.random()`, renderer state, or audio state enters physics.
10. Aerial points remain provisional until landing and continue to satisfy `score.total === score.bucketTotal()`.

## Tests to Add or Extend

### `tests/wave.test.js`

- Assert `seamDrive` is 1 (or near 1) at the canonical line in the sustainable pocket and falls smoothly with face error.
- Assert exact-line safe shoulder and critical curl cannot reach the sustainable maximum acceleration or `maxFlowEligible` state.
- Assert off-line, shoulder, power, critical, breaking, and pump variants keep every new field in `0..1` and acceleration in its documented bounds.
- Extend the existing deterministic/non-mutating snapshot test to include the new fields; keep renderer equality against `powerFaceAt()`.

### `tests/simulation.test.js`

- Run controlled equal-duration tracks at the seam and at `targetFace + 0.24`; assert only the seam track builds substantial `waveMomentum`, unlocks the upper speed envelope, and produces the stronger pump result.
- Build momentum, leave the seam for 0.75-1.0 s, and assert reserve/speed carry rather than snapping to zero; after a longer coast, assert deterministic decay.
- Launch three otherwise identical riders: low speed/no reserve, high speed/no reserve, and high speed/high reserve. Assert high speed alone cannot equal the high-reserve vertical impulse and only the earned case approaches maximum pop.
- Hold lateral input, release it, and assert `lateralVelocity` carries x in the same direction for several steps, then decays; reverse input and assert a finite, bounded transition.
- Add `waveMomentum` and `lateralVelocity` to `simulationSnapshot()` so the 30/60/144 Hz deep-equality test covers the new physics.
- Extend the randomized long-run assertions for `0 <= waveMomentum <= 1`, finite/bounded lateral velocity, speed cap, and clean resets/respawns.
- Keep the board-probe ordering checks and provisional-landing transaction tests unchanged to catch regressions.

### `tests/feedback.test.js` (optional presentation contract)

- If a semantic `maxFlowReady` or momentum-tier event is added, assert threshold crossing emits once rather than every fixed step. Audio/renderer should consume the event or published state; neither may calculate eligibility.

## Coverage and Gaps

- Wave truth and gating: depth 4/4.
- Riding, launch, reset, and fixed-step paths: depth 4/4.
- Scoring consequences: depth 4/4.
- Input and presentation consumers: depth 3/4; enough to establish that neither should own the new physics.
- The remaining gap is subjective browser play feel. The values above are a conservative first pass and should be validated with keyboard and analog gamepad after implementation, especially seam acquisition time, reversal coast, and Moon Log's slower acceleration versus higher cap.
