# Kaki Surf

Kaki Surf is a standalone, no-bundler Canvas score-attack game starring Kitty Kaki. It runs at a fixed 384 x 216 logical resolution with a 1/120-second simulation step and deploys unchanged to a static host.

**[Play Kaki Surf on GitHub Pages](https://dknos.github.io/kaki-surf/)**

![Kitty Kaki surfing a pixel wave](docs/images/ride.png)

## Quick play

Open the hosted game, or serve this directory over HTTP:

```console
python -m http.server 8000
```

Then visit `http://localhost:8000`, choose a board and condition, and select **Drop In**. No build or package installation is required.

Simple Controls are the default:

| Intent | Keyboard | Standard gamepad | Touch |
| --- | --- | --- | --- |
| Travel, carve, and trim | Arrows or WASD | Left stick or D-pad | Direction pad |
| Action: compress, pump, and pop | Space or Z | A or right trigger | **Action** |
| Context trick | F or X | X or B | **Trick** |
| Optional spin impulses | Q / E | Left / right bumper | Left / right **Spin** |
| Mounted-animal special | T or Shift | Y | **Special** when ready |
| Pause | Escape or P | Start | Settings |

Advanced Controls preserve the original Q/E/F/T map and can be selected in Settings: Q is Rail, E is Tail, F is Flip, and T is Twist. See [Controls and gameplay feel](docs/CONTROLS-AND-FEEL.md) for the complete contextual mappings.

## Surf both ways

The rider can commit to left- or right-going travel. A reversal must scrub through the existing board velocity before the new direction commits, and the surfer, wake, airborne approach, world parallax, and switch-stance scoring all follow that signed direction. The board's maximum speed is a real cap, not a target that every line receives automatically.

Wave geometry now supplies the main drive. Dropping down the face adds speed, climbing costs speed, and traversing retains a smaller glide. Action is an enhancer: compress and release to pump, or carry speed to the lip for bigger air. Launch height combines current speed, uphill approach, charge, board identity, pocket position, and any active bonus. Perfect and clean landings preserve useful carry into the next line.

Speed and Flow are separate:

- **Speed** is physical motion, reported as `STALLING`, `GLIDING`, `FAST`, `FLYING`, or `BLASTING` and reinforced by wake, spray, parallax, animation, and audio.
- **Flow** is the run's combo/style state. Valid full carves, timed pumps, direction changes, varied tricks, clean landings, and wildlife moments build it. A strong line can briefly sustain earned Flow, but passive riding, repetition, stalling, wobble, and wipeouts reduce it.

Simple Controls buffer one Trick request into the aerial context, choose an eligible move, fall back to a readable grab when a large move no longer fits, and begin helping the board toward the nearest valid landing tangent late in descent. Advanced Controls retain direct on-wave maneuvers and compositional Q/E/F/T aerial inputs. Aerial points remain provisional until landing.

Fresh profiles receive a six-step in-play **Surf School**: drop, carve, launch, rotate, trick, and land. Each lesson advances only after the physical action succeeds, persists until learned, and can be armed again from Settings.

## A living coast

`WorldSimulation` owns a seeded, bounded world layer that is independent from the renderer. Far, mid, and near traffic includes sailboats, fishing boats, speedboats, birds, planes, helicopters, banner flights, and rare Fleet Airshow/carrier events. Signed `worldTravel` keeps scenic parallax direction-aware, while bounded camera influence prevents ambient traffic from ping-ponging when the rider reverses. Boat-only waterline bands and breaker-aware occlusion keep ordinary hulls off the curl while preserving deliberate wake-race craft ahead of it.

Wildlife and bonuses are gameplay, not decoration:

- dolphins offer a friendly ride and a special dismount launch;
- sharks use readable telegraphs, a collision consequence, and a near-miss/thread bonus;
- whales progress through distant, blow, breach, ramp, ride, splash, and departure phases;
- bird flocks dodge harmlessly for Feather Thread, couriers drop fair pickups, and speedboats or jet skis offer no-penalty wake races;
- Dolphin Ride and Fleet Airshow use simulation-owned foam-gate series;
- Mango Rush reduces uphill loss, Moon Pop boosts the next launch, and Star Foam protects Flow from one dangerous contact or wobble.

Spawn streams, quiet periods, capacities, culling, collision sweeps, interactions, and presentation events are all simulation-owned and deterministic for a seed.

## Boards and conditions

- **Foam Puff** is the beginner recovery board: rounded, stable, and easiest to auto-level in Simple mode.
- **Mango Fish** is the technical combo board: fast rails, strong grip, and quick spins.
- **Moon Log** is the expert glide board: the highest cap and pop, slower correction, and high-value long holds.

Golden Coast, Twilight Glass, and Stormbreak share fair gameplay geometry while changing palette, horizon treatment, traffic mix, atmosphere, and reactive music.

Audio follows the game lifecycle instead of free-running behind it. Ocean body, board contact/carve, and aerial wind use separate filtered layers; speed, pocket risk, and surface contact drive their mix. Pause, results, visibility loss, and resume fade or rebase the transport so missed beats never burst after a long interruption. Major landings, wipeouts, power moments, and records duck the music through a master limiter, and Settings includes independent music/effects/wave levels plus a persistent master mute.

## Local art pipeline

The static game includes six condition backgrounds and 12 compact generated atlas families for four-stage wave progression, modular breaker pieces, dolphin, shark, whale, birds, boats, air traffic, powerups, boards, the festival carrier, and UI ornaments. Their original Grok source sheets are preserved under `docs/art-source/grok`; the modular wave source is 1024 x 1024, the staged swell/pitch/curl/collapse source is 1280 x 720, and the other selected sheets are 1280 x 720. `tools/art/build-grok-assets.py` deterministically validates source hashes, removes connected chroma, extracts cells, downsamples, quantizes, and rebuilds the transparent atlases under `assets/generated`.

Every atlas is optional. `js/asset-loader.js` validates each family independently, and the Canvas renderer keeps a local code-authored fallback when one is absent or invalid. The browser never calls Grok, Blender, an image API, a CDN, or a remote asset host. Exact prompts, selections, source hashes, and output dimensions are recorded in [Grok asset provenance](docs/GROK-ASSET-PROVENANCE.md).

## Validation

```console
npm test
npm run check
git diff --check
```

The native suite passes **125/125 tests**, and the syntax gate checks **27 JavaScript modules**. The canonical real-browser gallery contains **112 deterministic 1280 x 720 captures**; the current lifecycle/audio/wave pass additionally has real-browser pause/resume, corrupt-save recovery, 100-restart, console/network, native Settings input, touch-scroll, boat-depth, and 25-state responsive checks. See [Validation results](docs/TEST-RESULTS.md), [QA matrix](docs/QA.md), and [Responsive QA](docs/RESPONSIVE-QA.md).

## Static deployment and integration

Browsers require the native modules to be served over HTTP rather than opened through `file://`. All runtime imports and assets use relative local URLs; there is no bundle, generated application directory, remote gameplay asset, or runtime generation API.

`js/integration-adapter.js` exports `createKakiSurf({ host, input, audio, storage, settings, profile, onExit, onRunComplete, qaScene })`. It returns `start`, `pause`, `resume`, `restart`, `destroy`, and `getSnapshot` lifecycle methods.

Gameplay truth remains renderer-independent: `js/wave.js` owns ride geometry, `js/simulation.js` owns rider physics and interactions, `js/world.js` owns the ambient/gameplay world, `js/tricks.js` owns the aerial manifest, and `js/scoring.js` owns Speed/Flow valuation and score banking. See [ADR-001](docs/ADR-001-standalone-canvas.md), [Asset manifest](docs/ASSET-MANIFEST.md), and [Hero source map](docs/HERO-SOURCE-MAP.md).
