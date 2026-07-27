# Kaki Surf

Kaki Surf is a standalone, no-bundler Canvas arcade surfing game with selectable KittyKaki, Soder Snek, and SimplyTerrell riders. Endless Surf is the primary survival run, with the original 78-second Score Attack preserved as a separate mode. It runs at a fixed 384 x 216 logical resolution with a 1/120-second simulation step and deploys unchanged to a static host.

**[Play Kaki Surf on GitHub Pages](https://dknos.github.io/kaki-surf/)**

![Kitty Kaki surfing a pixel wave](docs/images/ride.png)

## Quick play

Open the hosted game, or serve this directory over HTTP:

```console
python -m http.server 8000
```

Then visit `http://localhost:8000`, choose a mode, board, and condition, and select the gold start button. No build or package installation is required.

For the reward-free physics harness, open `http://localhost:8000/?qa=coreSurfLab`. It runs one board and one wave with no wildlife, pickups, score, tutorial, or callouts; the compact telemetry can be disabled through the simulation fixture.

Simple Controls are the default:

| Intent | Keyboard | Standard gamepad | Touch |
| --- | --- | --- | --- |
| Travel and carve; rotate and trim in air | Arrows or WASD | Left stick or D-pad | Analog surf stick |
| Action: 0.5 s tuck preload, pump, and pop | Space or Z | A or right trigger | **Action** |
| Turbo Boost | Hold either Shift | Left-stick press / L3 | Hold **Turbo** |
| Context trick / tube hold | F or X | X or B | **Trick** |
| Pause | Escape or P | Start | **II** pause button; Settings also pauses |

Advanced Controls can be selected in Settings: Q is Frontside Grab, E is Stalefish Grab, F is Board Varial, and T is Kaki Twist. On the face, F switches regular/goofy stance; in the air it remains the board-trick key. See [Controls and gameplay feel](docs/CONTROLS-AND-FEEL.md) for the complete contextual mappings.

The standard gamepad now owns the whole arcade loop: stick/D-pad navigation, A to activate, B to close dialogs or instantly retry results, and Start to pause/resume. Directional focus repeats deliberately, while sliders and selects adjust in place. Touch play uses a continuous radial analog stick plus independent Action, Trick, and Turbo pointers. Starting a mobile run requests fullscreen and a native landscape lock; unsupported browsers gate play behind a rotate-phone prompt instead of squeezing controls into portrait.

Visual Quality defaults to **Auto**. It starts with the lighter Mobile presentation on compact touch hardware and can make a one-way session downgrade after sustained missed frames. Players can force Full or Mobile in Settings. Mobile preserves the fixed 1/120 simulation, controls, collision, world scheduling, scoring, and saves while reducing particles, secondary wave texture, Turbo effects, far decorative traffic, and CSS backdrop blur.

## Surf both ways

The rider can commit to left- or right-going travel. Every fixed step derives one canonical path velocity from along-break travel plus face motion. Board heading, Kaki lean, wake, spray, camera lead, parallax, animation, audio, mount direction, and landing tangent consume that result instead of mirroring independently. A normal reversal now draws and scrubs through a 0.35–0.5 second arc before the new direction commits.

Wave geometry now supplies the main drive without continuously attracting the board toward a base target. Dropping adds substantial speed, climbing spends it, traversing keeps most of it, and a hard reversal or poor contact scrubs it. One committed drop carries enough energy into the next climb; Action enhances a good line instead of granting permission to move.

Speed, Turbo, and Flow have separate jobs:

- **Speed** is canonical path motion and is communicated primarily by the trajectory wake, tail spray, parallax, pose, and audio.
- **Turbo** is a common short overdrive in both control modes. Hold Shift, L3, or the touch Turbo button on the face to spend it; landed tricks refill it.
- **Flow** is the run's x1–x10 combo/style state. Valid full carves, timed pumps, direction changes, varied tricks, clean landings, and wildlife moments build it. A strong line can briefly sustain earned Flow, but passive riding, repetition, stalling, wobble, and wipeouts reduce it.

The persistent play HUD is limited to score, time or paws, Turbo, and a compact combo only while it is active. Speed, Flow, Set, powerup, and pump meters no longer compete with the wave read.

Simple Controls make Trick contextual: **Down + a quick grounded tap** switches regular/goofy stance; a deliberate hold inside Twilight's critical pocket tucks into the tube; and an aerial press is acknowledged immediately and buffered for up to 0.5 seconds around takeoff. A deterministic airtime prediction chooses the first completable unused move—Varial, Frontside, Stalefish, then Kaki Twist—so ordinary air falls back to a readable grab instead of eating the tap. Simple also releases a held grab during the final 0.16 seconds of predicted descent so its existing auto-level can prepare the board. Advanced Controls retain direct on-wave maneuvers and Q/E/F/T aerial selection, with 0.35-second eligibility buffering and readable 0.18-second quick grabs. Aerial points remain provisional until landing, and successful trick landings refill Turbo.

Fresh profiles open on **Twilight Glass** and receive six small contextual **Surf School** prompts: drop for speed, climb with carried speed, cut back, hit the lip, trick, and match the landing. Each lesson advances only after the physical action succeeds and can be armed again from Settings.

## Run modes

- **Endless Surf** is the default. There is no hidden clock: the run ends after three wipeouts. Every 36 seconds of active riding advances a visible Set, increases curl pressure, and raises the scoring stake through Set 7. Entry and wipeout recovery do not advance the set timer or distance.
- **Score Attack** preserves the focused 78-second run and countdown audio. It uses the same surfing, wildlife, conditions, and scoring systems without Endless escalation.

Each mode owns independent best score, Flow, distance, set, and survival-time records. Existing pre-mode saves migrate their previous score and Flow to Score Attack, while the additive v1 save schema, all-mode legacy best, settings, boards, tutorial state, and run count remain intact. Results show mode, active ride time, distance, highlights, and a compact breakdown; long trick names receive a full-width row instead of colliding with adjacent statistics.

Every condition is now staged on the same production side-view break. The whole playfield is one long rideable face; the breaking edge is assembled from narrow fixed screen columns whose noisy heads accelerate downward while their revealed foam tiles stay behind as whitewater. The diagonal edge is pinned to the simulation's catch contact, advances left-to-right from the opening seconds, and never mirrors or rewinds when Kaki reverses. Every condition uses a forward dead-zone camera: Kaki crosses most of the face before right-going overflow scrolls the level, then a left cutback uses the earned screen width without reversing the camera. High air now drives one coherent vertical camera: the surf stage pans while the single tall panorama counter-crops around the exact same ocean anchor, and the HUD remains fixed.

**Kaki-Land — The Last Guestbook Break** is the fourth immediately selectable condition. Its condition-owned `signalBreak` profile keeps a broad cyan/mint wall, strong carried momentum, predictable launches, later-set pressure, and one restrained rainbow route rather than recoloring the whole ocean. The run connects Tide, Bloom, and Ember signal bands across cloud artists, repaired web rings, symbol mosaics, and the distant nonhuman Last Relay. Presentation phase comes only from the current Endless Set or deterministic Score Attack milestones and never changes physics.

## A living coast

`WorldSimulation` owns a seeded, bounded world layer that is independent from the renderer. Far, mid, and near traffic includes sailboats, fishing boats, speedboats, birds, planes, helicopters, banner flights, and rare Fleet Airshow/carrier events. Signed `worldTravel` keeps scenic parallax direction-aware, while bounded camera influence prevents ambient traffic from ping-ponging when the rider reverses. Boat-only waterline bands and breaker-aware occlusion keep ordinary hulls off the curl while preserving deliberate wake-race craft ahead of it.

Wildlife and bonuses are gameplay, not decoration:

- dolphins offer a friendly ride and a special dismount launch;
- sharks use readable telegraphs, a collision consequence, and a near-miss/thread bonus;
- production whale scheduling is temporarily disabled; forced QA phases use one water/collision anchor, deterministic breach arc, foreground water mask, and displacement foam until the encounter is deliberately re-enabled;
- bird flocks dodge harmlessly for Feather Thread, couriers drop fair pickups, and speedboats or jet skis offer no-penalty wake races;
- Dolphin Ride and Fleet Airshow use simulation-owned foam-gate series;
- Kaki-Land's rare **Webring Relay** uses the same pooled gate contract for three direction-aware links, assembles one tiny mural, returns Approval, and grants one optional Signal Held Flow save;
- Mango Rush reduces uphill loss, Moon Pop boosts the next launch, and Star Foam protects Flow from one dangerous contact or wobble.

Spawn streams, quiet periods, capacities, culling, collision sweeps, interactions, and presentation events are all simulation-owned and deterministic for a seed.

## Boards and conditions

- **Foam Puff** is the beginner recovery board: rounded, stable, and easiest to auto-level in Simple mode.
- **Mango Fish** is the technical combo board: fast rails, strong grip, and quick spins.
- **Moon Log** is the expert glide board: the highest cap and pop, slower correction, and high-value long holds.

Golden Coast and Stormbreak retain the `classic` physics profile, Twilight Glass uses the deeper `heroBarrel` profile and rideable tube pocket, and Kaki-Land owns `signalBreak`. All four select the column-built long-face compositor, start with the visible catch edge at x=30, and share collision-registered presentation plus nearly full-screen ride/air bounds. `CONDITION_IDS`, `resolveConditionId`, and `resolveCondition` are the canonical registry seams; loaders and runtime systems derive from them so a fifth condition does not require another hardcoded list.

Audio follows the game lifecycle instead of free-running behind it. Ocean body, board contact/carve, and aerial wind use separate filtered layers; speed, pocket risk, and surface contact drive their mix. Pause, results, visibility loss, and resume fade or rebase the transport so missed beats never burst after a long interruption. Major landings, wipeouts, power moments, and records duck the music through a master limiter, and Settings includes independent music/effects/wave levels plus a persistent master mute.

## Local art pipeline

The static game loads four 1536 x 640 condition-specific panoramas plus the preserved lower condition sources and 16 compact generated atlas families. Each run uses one full-canvas draw with continuous signed horizontal parallax and continuous vertical camera crop; airborne height cannot select another shelf, blend a replacement sky, or repaint a panorama fragment. The crop and stage transforms are exact inverses, so their authored ocean anchor never separates. The active wave remains collision-aligned, with a crisp crest, darker trough, five queried contour/foam seams, a readable pocket and power seam, moving projected flecks, foreground water, and shared tube/whitewater contact. The board-contact effect is one sampled trajectory wake rather than overlapping sprite-local systems.

Every atlas is optional. `js/asset-loader.js` validates each family independently, and the Canvas renderer keeps a local code-authored fallback when one is absent or invalid. The browser never calls Grok, Vertex, Blender, an image API, a CDN, or a remote asset host. Exact Kaki-Land exploration, rejection, source hashes, and rebuild steps are recorded in [Kaki-Land visual provenance](docs/art-source/aerial/KAKI-LAND.md); the earlier families remain recorded in [Grok asset provenance](docs/GROK-ASSET-PROVENANCE.md).

## Validation

```console
npm test
npm run check
git diff --check
```

The native suite passes **352/352 tests** and the syntax gate checks **41 JavaScript modules**. New Kaki-Land invariants cover canonical condition resolution, `signalBreak` installation, save migration, panorama identity and anchoring, renderer/audio identity, bidirectional travel, aerial pursuit, deterministic Webring Relay scheduling, random-stream isolation, reachable gates in both directions, warning exclusion, mural completion, Approval, and Signal Held. The broader suite continues to cover pointer-event-to-manifest trick integration, Auto/Full/Mobile presentation scaling, wave/camera ownership, Turbo, wildlife, scoring, fixed-step equivalence, and the fixed 384 x 216 playfield. The local gallery contains **178 deterministic 1280 x 720 captures**, including Kaki-Land’s complete Relay sequence, four-condition comparison, access modes, and high-air reveal. `docs/images/qa-kaki-land-chase` adds a real-keyboard right-run, cutback, left return, and pursuing-break sequence.

## Static deployment and integration

Browsers require the native modules to be served over HTTP rather than opened through `file://`. All runtime imports and assets use relative local URLs; there is no bundle, generated application directory, remote gameplay asset, or runtime generation API.

`js/integration-adapter.js` exports `createKakiSurf({ host, input, audio, storage, settings, profile, onExit, onRunComplete, qaScene })`. It returns `start`, `pause`, `resume`, `restart`, `destroy`, and `getSnapshot` lifecycle methods.

Gameplay truth remains renderer-independent: `js/wave.js` owns profile-selected ride geometry, `js/simulation.js` owns rider physics and interactions, `js/world.js` owns the ambient/gameplay world, `js/tricks.js` owns the aerial manifest, and `js/scoring.js` owns Speed/Flow valuation and score banking. `js/hero-wave-visuals.js` presents the shared travelling break, tube opening, passed-sky window, and downward whitewater by consuming those canonical queries rather than inventing a visual-only surface. See [ADR-001](docs/ADR-001-standalone-canvas.md), [Asset manifest](docs/ASSET-MANIFEST.md), and [Hero source map](docs/HERO-SOURCE-MAP.md).
