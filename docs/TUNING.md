# Central tuning reference

All shipping values live in `js/config.js` under `TUNING`, `BOARDS`, and `SCORE`. Press backtick in the game to open the live Surf Lab. Changes are temporary until promoted into `config.js`.

## Physics defaults

| Key | Default | Meaning |
| --- | ---: | --- |
| `runDuration` | 78 s | Score-attack run length |
| `speed` / `maxSpeed` | 72 / 138 | Base and hard speed envelope |
| `carveAcceleration` | 3.35 | Face-direction response |
| `carveFriction` | 4.8 | How fast carve velocity settles |
| `wavePush` | 13.5 | Power-zone acceleration |
| `curlSpeed` | 2.35 | Base curl advance |
| `pumpStrength` | 17 | Maximum timed pump boost |
| `launchForce` | 112 | Base vertical lip impulse |
| `gravity` | 176 | Airborne gravity |
| `rotationAcceleration` | 13.6 | Aerial rotational authority |
| `airControl` | 0.92 | Board trim and air steering |
| `landingTolerance` | 0.46 rad | Clean landing window before board modifiers |
| `perfectTolerance` | 0.115 rad | Perfect landing window |
| `wipeoutThreshold` | 1.18 rad | Maximum recoverable contact error |

## Feel windows

`entryGrace` makes the first eight seconds more forgiving. `launchCoyote` is 110 ms; `landingCoyote` is 95 ms. Apex gravity falls to 42% while vertical speed is within 14 units/second. `cameraResponse` and `juiceIntensity` affect presentation only.

## Scoring multipliers

`scoreSpeed`, `scorePocket`, `scoreFlow`, and `scoreAir` are normalized against their documented defaults and exposed in Surf Lab. Thresholds and base awards live in `SCORE`. Board stats are explicit personality modifiers, not opaque upgrade levels.
