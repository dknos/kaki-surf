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
| Context trick / tube hold | F or X | X or B | **Trick** |
| Optional spin impulses | Q / E | Left / right bumper | Left / right **Spin** |
| Mounted-animal special | T or Shift | Y | **Special** when ready |
| Pause | Escape or P | Start | **II** pause button; Settings also pauses |

Advanced Controls preserve the original Q/E/F/T map and can be selected in Settings: Q is Rail, E is Tail, F is Flip, and T is Twist. See [Controls and gameplay feel](docs/CONTROLS-AND-FEEL.md) for the complete contextual mappings.

The standard gamepad now owns the whole arcade loop: stick/D-pad navigation, A to activate, B to close dialogs or instantly retry results, and Start to pause/resume. Directional focus repeats deliberately, while sliders and selects adjust in place. Touch controls appear automatically on coarse-pointer or compact touch devices, stay off fine-pointer desktops, and neutralize safely when the device rotates.

## Surf both ways

The rider can commit to left- or right-going travel. A reversal must scrub through the existing board velocity before the new direction commits, and the surfer, wake, airborne approach, world parallax, and switch-stance scoring all follow that signed direction. The board's maximum speed is a real cap, not a target that every line receives automatically.

Wave geometry now supplies the main drive. Dropping down the face adds speed, climbing costs speed, and traversing retains a smaller glide. Action is an enhancer: compress and release to pump, or carry speed to the lip for bigger air. Launch height combines current speed, uphill approach, charge, board identity, pocket position, and any active bonus. Perfect and clean landings preserve useful carry into the next line.

Speed and Flow are separate:

- **Speed** is physical motion, reported as `STALLING`, `GLIDING`, `FAST`, `FLYING`, or `BLASTING` and reinforced by wake, spray, parallax, animation, and audio.
- **Flow** is the run's combo/style state. Valid full carves, timed pumps, direction changes, varied tricks, clean landings, and wildlife moments build it. A strong line can briefly sustain earned Flow, but passive riding, repetition, stalling, wobble, and wipeouts reduce it.

Simple Controls make Trick contextual: hold it inside Twilight's critical pocket to tuck into the tube, or use it around a launch to buffer an eligible aerial move. A large move that no longer fits falls back to a readable grab, and late descent begins helping the board toward the nearest valid landing tangent. Advanced Controls retain direct on-wave maneuvers, a dedicated held Tube Tuck/Soul Arch, and compositional Q/E/F/T aerial inputs. Aerial points remain provisional until landing.

Fresh profiles open on **Twilight Glass**, the finished travelling-break session, and receive a six-step in-play **Surf School**: drop, carve, launch, rotate, trick, and land. Each lesson advances only after the physical action succeeds, persists until learned, and can be armed again from Settings. Returning profiles keep their explicit board and condition choices.

Twilight is staged as a long side-scrolling wave face. Its coherent curl and breaking edge travel left-to-right while the whitewater pours downward under its own pause-safe presentation clock; carving back across the face never mirrors either motion. The passed area opens back to the real twilight sky, the pocket remains briefly rideable before the barrel catches up, and large aerials smoothly pan upward for extra sky and landing room. Reduced Motion freezes the falling-water cycle and vertical camera shift without changing gameplay.

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

Golden Coast and Stormbreak currently use the `classic` wave profile. Twilight Glass uses the dedicated `heroBarrel` profile identifier for its long travelling break, authored ride/air bounds, rideable tube pocket, and one collision-aligned pitching-lip contact. Every profile still goes through the same canonical wave-query, movement, landing, and scoring contracts. Future levels can select their own deliberate wave profiles without teaching the renderer a second version of gameplay geometry.

Audio follows the game lifecycle instead of free-running behind it. Ocean body, board contact/carve, and aerial wind use separate filtered layers; speed, pocket risk, and surface contact drive their mix. Pause, results, visibility loss, and resume fade or rebase the transport so missed beats never burst after a long interruption. Major landings, wipeouts, power moments, and records duck the music through a master limiter, and Settings includes independent music/effects/wave levels plus a persistent master mute.

## Local art pipeline

The static game includes six condition backgrounds and 16 compact generated atlas families. Twilight's active art stack uses a four-frame coherent curl/pour/collapse atlas, restrained internal texture from the four-frame falling-curtain study, and board-contact spray; the earlier full-barrel study remains a coherent secondary fallback for High Contrast or a missing primary atlas. The remaining atlases cover classic wave progression, modular breaker pieces, dolphin, shark, whale, birds, boats, air traffic, powerups, boards, the festival carrier, and UI ornaments. Original Grok sheets are preserved under `docs/art-source/grok`. `tools/art/build-grok-assets.py` validates source hashes, removes connected chroma, extracts cells, downsamples, quantizes, feathers only declared continuation edges, and rebuilds the transparent atlases under `assets/generated`.

Every atlas is optional. `js/asset-loader.js` validates each family independently, and the Canvas renderer keeps a local code-authored fallback when one is absent or invalid. The browser never calls Grok, Blender, an image API, a CDN, or a remote asset host. Exact prompts, selections, source hashes, and output dimensions are recorded in [Grok asset provenance](docs/GROK-ASSET-PROVENANCE.md).

## Validation

```console
npm test
npm run check
git diff --check
```

The native suite passes **164/164 tests**, and the syntax gate checks **30 JavaScript modules**. The canonical local-browser gallery contains **120 deterministic 1280 x 720 captures**, including six travelling-break stages plus dedicated rideable-tube and big-air-camera scenes; the lifecycle/audio/wave pass additionally covers pause/resume, corrupt-save recovery, 100-restart, controller-only menu/settings/results flow, rotation with held touch, native Settings input, touch-scroll, boat depth, and 25-state responsive checks. This checkpoint records local evidence and does not by itself claim that the GitHub Pages deployment has refreshed. See [Validation results](docs/TEST-RESULTS.md), [QA matrix](docs/QA.md), [Responsive QA](docs/RESPONSIVE-QA.md), and the [vertical highlight brief](docs/HIGHLIGHT-BRIEF.md).

## Static deployment and integration

Browsers require the native modules to be served over HTTP rather than opened through `file://`. All runtime imports and assets use relative local URLs; there is no bundle, generated application directory, remote gameplay asset, or runtime generation API.

`js/integration-adapter.js` exports `createKakiSurf({ host, input, audio, storage, settings, profile, onExit, onRunComplete, qaScene })`. It returns `start`, `pause`, `resume`, `restart`, `destroy`, and `getSnapshot` lifecycle methods.

Gameplay truth remains renderer-independent: `js/wave.js` owns profile-selected ride geometry, `js/simulation.js` owns rider physics and interactions, `js/world.js` owns the ambient/gameplay world, `js/tricks.js` owns the aerial manifest, and `js/scoring.js` owns Speed/Flow valuation and score banking. `js/hero-wave-visuals.js` presents Twilight's travelling break, tube opening, passed-sky window, and downward whitewater by consuming those canonical queries rather than inventing a visual-only surface. See [ADR-001](docs/ADR-001-standalone-canvas.md), [Asset manifest](docs/ASSET-MANIFEST.md), and [Hero source map](docs/HERO-SOURCE-MAP.md).
