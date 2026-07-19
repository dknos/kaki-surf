# Central tuning reference

Shipping values live in `js/config.js` under `TUNING`, `BOARDS`, `CONDITIONS`, `SCORE`, and `DEFAULT_SETTINGS`. Aerial definitions and board-specific trick modifiers live in `js/trick-catalog.js`. Press backtick during play to open Surf Lab; its edits mutate the in-memory `TUNING` object only and a reload restores source defaults.

## Runtime envelope

| Constant | Default | Meaning |
| --- | ---: | --- |
| `LOGICAL_WIDTH` / `LOGICAL_HEIGHT` | 384 / 216 | Fixed logical Canvas playfield |
| `FIXED_STEP` | 1/120 s | Simulation step |
| `MAX_FRAME_DELTA` | 0.1 s | Largest accepted render-frame delta |
| `runDuration` | 78 s | Timed score-attack ride |
| `entryGrace` | 8 s | Early extra-grip easing period |
| `maxWipeouts` | 3 | Paws available before the run ends |

The game loop accumulates at most 14 fixed steps per frame. Render interpolation, camera motion, particles, and Web Audio do not calculate gameplay outcomes. Event-driven impact freeze may briefly pause fixed-step consumption, but it does not write simulation fields or change per-step physics.

## Riding and wave defaults

| Key | Default | Meaning |
| --- | ---: | --- |
| `speed` / `maxSpeed` | 76 / 144 | Base target and hard speed envelope before board modifiers |
| `carveAcceleration` | 3.65 | Face-direction response before board grip and assists |
| `carveFriction` | 4 | Rate at which face velocity settles |
| `faceEdgeBounce` | 0.28 | Trough-edge rebound retained from impact |
| `downhillAcceleration` | 104 | Acceleration from positive surface-gradient drive |
| `uphillSpeedCost` | 40 | Speed loss from climbing against the surface gradient |
| `traverseDrive` | 3.2 | Small drive retained near a cross-slope traverse |
| `reversalCommitTime` | 0.085 s | Time above the signed-velocity threshold before facing commits |
| `reversalCommitSpeed` | 7 | Minimum signed travel speed for a direction change |
| `reversalScrub` | 13.5 | Speed cost while opposite input fights existing travel |
| `wavePush` | 15.5 | Acceleration scaled by shared speed potential |
| `curlSpeed` | 2.35 | Base advance of the breaking curl |
| `curlCatchDelay` | 0.58 s | Continuous curl contact before a wipeout |
| `curlGrace` / `curlRampEnd` | 8 s / 72 s | No-advance opening and end of the smooth threat ramp |
| `curlThreatMaxSpeed` | 10.8 | Maximum late-run threat advance before skill relief |
| `curlSkillRelief` / `curlSpeedRelief` / `curlMaxRelief` | 0.46 / 0.18 / 0.58 | Bounded reduction earned by recent valid play and real speed |
| `pumpStrength` | 18.5 | Maximum pump impulse before line, rhythm, and board factors |
| `pumpChargeRate` | 1.55/s | Hold-to-compress charge rate |
| `pumpMinCharge` / `pumpMinEfficiency` | 0.28 / 0.15 | Minimum stored compression and useful line quality |
| `pumpCooldown` | 0.34 s | Cadence floor between valid pump releases |
| `carveArcMinDuration` / `carveArcMinExcursion` | 0.18 s / 0.075 | Full-arc gate that rejects rapid direction flicks |
| `flowEventHold` / `flowPassiveDecay` | 0.9 s / 0.055/s | Brief sustain after a scored action, then ordinary decay |
| `rideSpeedResponse` | 0.82/s | Pull toward base target; lower values retain earned speed longer |
| `waveMomentumBuild` / `waveMomentumDecay` | 1.9/s / 0.55/s | Response rates for the smooth natural-momentum signal |
| `waveMomentumPumpGain` | 0.14 | Momentum signal added by a fully charged, efficient release |
| `offLineSpeedHeadroom` | 26 | Legacy tuning retained for compatibility; not used as a cap gate |
| `lateralResponse` / `lateralCoast` | 12/s / 3/s | Signed travel response and release inertia |

`GameplayWave.powerFaceAt(x)` produces a moving fast-line guide near face coordinate 0.405 and clamps it to 0.31-0.49. `speedPotential(x, face, options)` is the authoritative local-wave query for physics and presentation. It returns target/error/correction data plus `safe`, `power`, or `critical` zone, risk, pocket pressure, broad line quality, narrow `seamDrive`, pump efficiency, and a bounded local acceleration contribution.

The power zone requires an absolute face error no greater than 0.12 and pocket value at least 0.16. Breaking water or pocket value at least 0.78 is critical; remaining positions are safe. These are strategic labels, not three fixed color strips.

`seamDrive` has a glassy core through 0.025 face error, fades out by 0.115, enters across pocket values 0.16-0.34, and fades before the critical band across 0.68-0.82. It remains useful for pump efficiency, presentation, and compatibility telemetry. It no longer grants permission to reach the board's hard speed cap.

Primary drive comes from `GameplayWave.surfaceGradientAt(x, face)`. Simulation projects signed x travel and face movement through that gradient to produce `slopeDrive` in `-1..1`. Positive values receive `downhillAcceleration`, negative values pay `uphillSpeedCost`, and a traverse receives `traverseDrive`. Mango Rush scales uphill loss while active. The fast-line query adds a smaller broad local contribution and a released pump adds a bounded burst.

A release qualifies as a pump only after enough charge, a useful line, upward intent, compatible face velocity, and the cadence floor. Invalid releases consume their partial charge so tapping cannot bank hidden energy. Carve score/Flow likewise requires a sustained arc with real face excursion and peak velocity. These gates make rhythm and line choice outperform input spam.

The curl stays at its start point through `curlGrace`, then accelerates smoothly toward `curlThreatMaxSpeed`. Recent valid pumps, full carves, reversals, clean landings, and high physical speed provide bounded relief; signed rider travel never reverses the threat. Recovery may explicitly retreat the curl to a safe respawn position.

`player.waveMomentum` follows a mix of downhill drive, line quality, and pocket position. It is a smooth presentation/launch-history value rather than a speed-cap gate. A correctly timed pump can still add up to 0.14. The ride cap is:

```text
baseTarget = speed * board.acceleration
hardMax = max(baseTarget, maxSpeed * board.maxSpeed)
rideCap = hardMax
```

Travel velocity is bounded to `-48..48`. Same-direction input accelerates toward its signed target. Opposite input responds more slowly at high speed, scrubs velocity, and must satisfy both reversal thresholds before `travelDirection` changes. Releasing input coasts toward the current signed glide. Playfield edges remove only the outward component.

## Air and landing defaults

| Key | Default | Meaning |
| --- | ---: | --- |
| `launchForce` | 112 | Base vertical lip impulse |
| `gravity` | 176 | Airborne gravity |
| `rotationAcceleration` | 13.6 | Body-spin authority before board rotation identity |
| `angularDrag` | 1.65 | Spin damping |
| `airControl` | 0.92 | Shared air steering and trim authority |
| `landingTolerance` | 0.46 rad | Clean window before board, assist, and risk modifiers |
| `perfectTolerance` | 0.115 rad | Perfect tangent error; multiplied only by Landing Assist |
| `landingCoyote` | 0.095 s | Time to recover an initially bad contact |
| `launchCoyote` | 0.11 s | Lip-memory window for a committed release |
| `simpleAutoLevelStart` | 18 | Downward velocity at which Simple auto-level starts |
| `simpleTrickBuffer` | 0.34 s | Context Trick request lifetime |
| `simpleGrabHold` | 0.115 s | Hold threshold that selects a grab |
| `simpleSpinImpulse` | 1.8 | Q/E or bumper spin impulse in Simple mode |
| `perfectLandingCarry` | 0.58 s | Speed-preservation window after a perfect landing |
| `cleanLandingCarry` | 0.40 s | Speed-preservation window after a clean landing |
| `wobbleLandingCarry` | 0.18 s | Reduced carry after a wobble |
| `wipeoutThreshold` | 1.18 rad | Hard cap for the recovery band |

Launch pop reads physical speed and the climb into the lip:

```text
speedRatio = clamp((speed - 34) / (hardMax - 34), 0, 1)
uphillApproach = clamp(max(-slopeDrive, max(0, -faceVelocity) * 0.72), 0, 1)
launchEnergy = clamp(0.68 + speedRatio * 0.42
  + uphillApproach * 0.18 + charge * 0.10
  + pocket * 0.04, 0.68, 1.36)
```

The 0.68 floor keeps ordinary lip jumps available. Moon Pop multiplies the final vertical impulse and is consumed on launch. Signed travel contributes `(speed - 52) * 0.14`, while travel velocity contributes another 28%, so approach direction survives takeoff.

At the apex, gravity is 42% while vertical speed is within 14 units/second. The resolved clean tolerance is:

```text
landingTolerance * board.landing * assistScale * (1 - trickRisk * 0.18)
```

`assistScale` is 1.4 with Landing Assist and 1 otherwise. The recovery limit is the smaller of `wipeoutThreshold` and 1.7 times the resolved clean tolerance. Perfect ignores board and trick-risk modifiers. A landing more than 2.25 radians out of line receives the `BOARD FIRST!` wipeout language after the contact window.

Simple mode begins board-specific auto-level after downward velocity exceeds 18. It chooses the nearer of the surface tangent and that tangent plus π, allowing a real opposite-facing landing without guaranteeing it. Landing direction commits to signed travel on contact. Perfect, clean, and wobble speed preservation factors are 1.035, 0.94, and 0.74, followed by their short carry windows.

## World envelope

`js/world-catalog.js` keeps world tuning separate from rider tuning. Far, mid, and near traffic pools have capacities 8, 8, and 3 with parallax 0.08, 0.32, and 0.88. Wildlife and powerup pools each have capacity 3; at most two bonuses can be active. Interactions and presentation events use fixed 16- and 32-record arrays. A 7-second initial grace and 3.5-second minimum interactive quiet period prevent immediate or stacked hazards.

Condition profiles change wind, density, traffic lists, and dolphin/shark/whale weights while rider collision geometry remains shared. Spawn streams are separately seeded so adding cosmetic traffic does not perturb interactive wildlife or powerup timing.

## Aerial trick gates

| Trick | Entry | Start gate | Completion gate | Height gate | Base score | Base risk |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Front Rail Grab | 0.075 s | None | Hold through entry | None | 105 | 0.07 |
| Tail Grab | 0.14 s | None | Hold through entry | None | 172 | 0.16 |
| Board Varial | 0.46 s | 0.08 s in air | 98.5% entry and 0.44 s total air | 4 px | 292 | 0.34 |
| Kaki Twist | 0.66 s | 0.28 s in air | 99% entry and 0.78 s total air | 18 px | 470 | 0.62 |

Board specialty `entryMultiplier` changes the listed entry duration. Front Rail adds 92 points/second of hold up to 0.68 seconds and 24 for holding through the apex. Tail Grab adds 128 points/second up to 0.78 seconds and 52 through the apex. More than 0.2 seconds of descending Tail hold applies a 0.84 scoring factor, while late Tail hold adds risk at 0.72/second. Tail's base trim sensitivity is 1.32 before its board modifier.

Discrete board motion is separate from body rotation. Board Varial completes one board-relative turn. Kaki Twist uses a counter-rotation arc and board-specific pose/motion; incomplete board motion can make the landing orientation invalid.

## Board identities

The menu's six five-point ratings are communication fields; the numeric multipliers below are the simulation values.

| Board | Silhouette and specialty | Ratings: speed/carve/pump/pop/spin/landing | Accel | Max | Grip | Pump | Launch | Spin | Air | Landing | Recovery | Style |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Foam Puff | Short, thick rounded puff; **Recovery + Quick Grabs**, Beginner | 2/3/3/3/2/5 | 0.96 | 0.93 | 1.08 | 0.92 | 0.94 | 0.84 | 1.08 | 1.28 | 1.24 | 0.94 |
| Mango Fish | Compact swallow-tail fish; **Snaps + Combo Chains**, Technical | 4/5/4/3/5/2 | 1.12 | 1.04 | 1.18 | 1.08 | 1.00 | 1.08 | 1.00 | 0.94 | 0.96 | 1.08 |
| Moon Log | Long narrow log; **Big Pop + Long Holds**, Expert | 5/2/4/5/2/3 | 0.88 | 1.12 | 0.86 | 1.04 | 1.22 | 0.76 | 0.80 | 1.02 | 0.88 | 1.14 |

`Spin` in the table maps to the `rotation` multiplier. Air controls trim and horizontal air acceleration; Landing widens the clean window; Recovery shortens post-landing recovery; Style multiplies aerial valuation and risk multiplier response.

### Discrete trick specialties

| Board | Varial: entry/score/risk/motion | Kaki Twist: entry/score/risk/motion | Signature variant |
| --- | --- | --- | --- |
| Foam Puff | 1.10 / 0.92 / 0.76 / 1.00 | 0.94 / 0.88 / 0.68 / 0.82 | `softPaw` |
| Mango Fish | 0.82 / 1.16 / 1.08 / 1.08 | 0.84 / 1.12 / 1.12 / 1.18 | `mangoWhip` |
| Moon Log | 1.20 / 1.20 / 1.16 / 0.90 | 1.12 / 1.30 / 1.20 / 0.72 | `moonArc` |

The four numbers multiply base entry duration, points, risk, and board-motion timing respectively. Grab specialties also tune entry, score, risk, and Tail trim, and remain defined with each catalog record rather than hidden in simulation branches.

## Conditions

| ID | Name | Presentation identity |
| --- | --- | --- |
| `goldenCoast` | Golden Coast | Sunlit coast, warm seafoam palette, sunset music pattern |
| `twilightGlass` | Twilight Glass | Violet horizon, star points, cool glass palette, night arrangement |
| `stormbreak` | Stormbreak | Squalls, rain, pier silhouette, silver-green face, storm arrangement |

Conditions share the same collision and speed-potential model, so selection changes atmosphere rather than competitive physics. Board and condition selections persist locally.

## Score values

| Value | Default | Use |
| --- | ---: | --- |
| `ridePerSecond` | 20 | Base ride bucket before the ride multiplier share |
| `speedThreshold` | 82 | Speed bucket begins above this value |
| `pocketStart` | 0.42 | Pocket bucket begins above this risk |
| `carvePoints` | 34 | Alternating qualified carve base |
| `launchBase` | 45 | Base aerial value |
| `airHeightScale` | 1.8 | Points per logical pixel of maximum height |
| `halfRotation` | 95 | 180-degree spin value |
| `fullRotation` | 260 | 360-degree spin value |
| `extraRotation` | 175 | Each additional 180 degrees after 360 |
| `perfectLanding` | 240 | Perfect landing bucket |
| `cleanLanding` | 95 | Clean landing bucket |
| `wobbleSave` | 55 | Wobble landing bucket |
| `comboMax` | 4.2 | Combo component cap |

Rotation names and points use actual accumulated rotation quantized to the nearest 180 degrees after a 135-degree meaningful threshold. Perfect multiplies air/style by 1.1, clean by 1, and wobble by 0.55. Aerial buckets also receive board style, launch multiplier, full-signature repeat factor, variety, and manifest risk.

Exact signatures retain direction, rotation size, ordered trick IDs, grab hold band, apex status, and Kaki board variant. The score history checks the last four landed signatures. Exact repeats multiply by 0.58 per prior match, or the strictest trick-specific factor in the string: 0.50 for a Varial and 0.34 for a Kaki Twist.

## Presentation and access defaults

`cameraResponse` is 5.8 and `juiceIntensity` is 1; both are presentation-only. New saves use Simple Controls, Wave Read Assist `full`, Reduced Flash on, 70% screen shake, touch controls on, and steering/landing assists off. Saves created before `controlMode` existed migrate to Advanced so their learned mapping remains intact; fresh and malformed saves use Simple. Either steering or landing assistance multiplies the score by 0.82. Reduced Motion, Reduced Flash, High Contrast, and Wave Read modes do not change physics or scoring.
