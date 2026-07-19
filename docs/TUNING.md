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
| `speed` / `maxSpeed` | 72 / 138 | Base target and hard speed envelope before board modifiers |
| `carveAcceleration` | 3.35 | Face-direction response before board grip and assists |
| `carveFriction` | 4.8 | Rate at which face velocity settles |
| `faceEdgeBounce` | 0.28 | Trough-edge rebound retained from impact |
| `wavePush` | 13.5 | Acceleration scaled by shared speed potential |
| `curlSpeed` | 2.35 | Base advance of the breaking curl |
| `curlCatchDelay` | 0.58 s | Continuous curl contact before a wipeout |
| `pumpStrength` | 17 | Maximum pump impulse before line, rhythm, and board factors |
| `pumpChargeRate` | 1.55/s | Hold-to-compress charge rate |

`GameplayWave.powerFaceAt(x)` produces a moving target near face coordinate 0.405 and clamps it to 0.31-0.49. `speedPotential(x, face, options)` is the one authoritative query for physics and presentation. It returns target/error/correction data plus `safe`, `power`, or `critical` zone, risk, pocket pressure, line quality, pump efficiency, and a bounded 0.15-1.25 acceleration factor.

The power zone requires an absolute face error no greater than 0.12 and pocket value at least 0.16. Breaking water or pocket value at least 0.78 is critical; remaining positions are safe. These are strategic labels, not three fixed color strips.

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
| `wipeoutThreshold` | 1.18 rad | Hard cap for the recovery band |

At the apex, gravity is 42% while vertical speed is within 14 units/second. The resolved clean tolerance is:

```text
landingTolerance * board.landing * assistScale * (1 - trickRisk * 0.18)
```

`assistScale` is 1.4 with Landing Assist and 1 otherwise. The recovery limit is the smaller of `wipeoutThreshold` and 1.7 times the resolved clean tolerance. Perfect ignores board and trick-risk modifiers. A landing more than 2.25 radians out of line receives the `BOARD FIRST!` wipeout language after the contact window.

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

`cameraResponse` is 5.8 and `juiceIntensity` is 1; both are presentation-only. New saves use Wave Read Assist `full`, Reduced Flash on, 70% screen shake, touch controls on, and steering/landing assists off. Either steering or landing assistance multiplies the score by 0.82. Reduced Motion, Reduced Flash, High Contrast, and Wave Read modes do not change physics or scoring.
