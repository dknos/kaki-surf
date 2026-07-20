# ADR-001: Standalone fixed-step Canvas core

Status: accepted 2026-07-19; amended for the premium wave, trick, and presentation overhaul.

## Decision

Kaki Surf remains a self-contained native JavaScript module set with a 384 x 216 Canvas renderer, a fixed 1/120-second gameplay simulation, relative local URLs, no bundler, and a narrow adapter for host input, audio, settings, storage, exit, and run-complete events.

The stable gameplay core is separated from presentation and browser lifecycle:

| Module | Owned truth |
| --- | --- |
| `js/config.js` | Shipping tuning, boards, conditions, palettes, settings, and metadata |
| `js/input.js` | Keyboard/gamepad/touch normalization and 120 ms action-edge buffers |
| `js/wave.js` | Seeded profile-selected wave geometry, surface gradient, curl, fast-line guidance, and signed world travel |
| `js/world-catalog.js` | Frozen traffic, wildlife, powerup, condition, layer, and capacity data |
| `js/world.js` / `js/world-collision.js` | Seeded pooled world state, phase machines, swept interaction, modifiers, and bounded signals |
| `js/trick-catalog.js` | Renderer-free trick definitions and board specialties |
| `js/tricks.js` | One-launch `AerialTrickSession` and plain-data manifest |
| `js/trick-scoring.js` | Pure completion filtering, rotation naming, signatures, and aerial valuation |
| `js/scoring.js` | Score buckets, Flow/combo, full-signature history, preview, and landing bank |
| `js/simulation.js` | Fixed-step signed rider physics, controls, contextual maneuvers, world interactions, launches, landings, and events |
| `js/sprites.js` | Production Kitty poses, board silhouettes, flex, and wake drawing |
| `js/wave-visuals.js` | Production face/curl/VFX drawing derived from canonical wave queries |
| `js/hero-wave-visuals.js` | Twilight's staged hero-barrel volume, real sky aperture, connected face bands, foam crown, and collision-aligned contact presentation |
| `js/world-visuals.js` | Traffic, wildlife, pickups, carrier, and procedural atlas fallbacks |
| `js/renderer.js` | Canvas composition, HUD, callouts, particles, and accessibility presentation |
| `js/asset-manifest.js` / `js/asset-loader.js` | Local atlas/background validation and independent optional-family loading |
| `js/audio.js` | Procedural music/wave sound and semantic-event cues |
| `js/persistence.js` | Defensive local save read/write and run records under `kaki-surf-meta-v1` |
| `js/integration-adapter.js` | Lazy game construction and frozen public lifecycle surface |

## Shared-query rule

The displayed wave may never approximate gameplay with a visual-only formula.

- `GameplayWave.ridingY(x, face)` and `slopeAt(x, face)` define the ride and landing surface.
- `GameplayWave.surfaceGradientAt(x, face)` defines the shared local slope used for downhill/uphill drive.
- `GameplayWave.powerFaceAt(x)` defines the readable fast-line guide, not a permission gate for the speed cap.
- `GameplayWave.speedPotential(x, face, options)` returns the local acceleration contribution, target/error/correction, zone, risk, pocket, pressure, breaking state, line quality, and pump efficiency used by simulation.
- `waveGuideAt` and `powerSeamFaceAt` in `js/wave-visuals.js` are pure presentation bridges to those exact methods.

Any future renderer, accessibility overlay, ghost, replay, or host view must consume these queries. It must not hard-code another surface, fast line, contact edge, or zone boundary. Golden Coast and Stormbreak currently select the `classic` profile; Twilight Glass selects `heroBarrel`. Those profiles may have different ride/air bounds, surface shapes, and contact placement, but each has one canonical collision and wave-drive truth shared by simulation and presentation. A future level may select another profile only through the same query contract.

## Determinism boundary

The simulation advances only in fixed `FIXED_STEP` increments and uses seeded `GameplayWave` and `WorldSimulation` instances. World spawn categories have isolated seeded streams so adding cosmetic traffic does not perturb wildlife or powerups. Trick state and score valuation are plain data with no Canvas, DOM, audio, wall-clock, or network dependency. Given the same seed, tuning, board, condition, control mode, and consumed step-input sequence, gameplay state is intended to reproduce independently of 30/60/144 Hz render pacing.

The deterministic boundary ends at presentation and metadata:

- Render interpolation, camera response, shake, and condition art do not write simulation values. Event-driven impact freeze can briefly suspend step consumption, but it does not calculate a different per-step outcome.
- Cosmetic spray/sparkle positions and procedural audio noise may use `Math.random()`; they are not replay or scoring truth.
- Web Audio scheduling, vibration/rumble availability, DOM focus, and persistence timestamps depend on the host environment.
- Local saves record rounded results and selected presentation state; they are not deterministic replay files.

This distinction permits rich feedback without making particles, audio timing, or frame rate authoritative.

## Static-host boundary

`index.html` loads `./styles.css` and `./js/main.js` as native local assets. The module graph contains only relative imports and does not depend on `dist`, `build`, bundles, `node_modules`, remote URLs, or GLBs. Curated generated atlases are checked-in relative PNGs under `assets/generated`; they are optional presentation files, not a runtime generation service or build dependency. Browsers must serve the directory over HTTP, but the host needs no compilation step or server-side application.

`npm test` uses Node's native test runner; it validates source behavior and static-host assumptions without becoming a runtime dependency.

## Host integration boundary

A future Kitty Kaki Survivors host mounts the exact standalone implementation through the adapter rather than importing town globals into the surf modules:

```js
const surf = await createKakiSurf({
  host,
  input,
  audio,
  storage,
  settings,
  profile,
  onExit,
  onRunComplete,
});

surf.start({
  immediate: true,
  board: "mangoFish",
  condition: "twilightGlass",
});
```

The frozen adapter surface is `start`, `pause`, `resume`, `restart`, `destroy`, and `getSnapshot`.

Host responsibilities are:

- provide a real `HTMLElement` and suspend competing gameplay listeners while Surf owns focus;
- if injecting input, provide the same held/pressed/released step contract and `update`, `consumeStep`, `consumeMeta`, and `clear` behavior; the game clears but does not destroy external input;
- unlock audio only after a user gesture and treat an injected audio facade as session-owned, because game teardown calls its optional `destroy` method;
- provide a Storage-compatible object if local browser storage is not desired;
- receive a snapshot on `onExit` and a board/condition-enriched result on `onRunComplete`;
- call `destroy()` when unmounting so animation frames, listeners, input state, audio, and DOM are released.

No Kitty Kaki Survivors save-schema change is required. The standalone save key remains separate, and a later host can translate rewards in `onRunComplete` without placing town progression inside the surfing simulation.

## Why

- Fixed-step simulation protects handling from render pacing.
- A fixed logical Canvas keeps Kitty, board trim, lip, curl, wildlife telegraphs, pickups, and landing tangent legible at handheld scale.
- Focused trick and scoring modules permit pure tests and prevent renderer-owned game rules.
- One wave-query source prevents misleading speed guidance.
- Code-authored fallbacks plus curated local atlases preserve pixel control without runtime generation or 3D dependencies.
- A narrow lifecycle boundary allows the standalone game and Kitty Kaki Survivors to evolve independently.

## Alternatives considered

1. **Embed directly into the mature Three.js town.** Rejected because global input/audio lifecycles and the wider integration surface create unrelated-mode regression risk.
2. **Use the supplied plush GLB at runtime.** Rejected because its geometry, large embedded textures, lack of a rig, and different rendering language do not fit a 384 x 216 pixel-action game.
3. **Let the renderer draw an approximate fast line.** Rejected because even a small mismatch teaches the wrong surfing behavior.
4. **Store tricks as unrelated booleans in `simulation.js`.** Rejected because sequencing, board-relative motion, preview scoring, landing finalization, and exact-repeat signatures need a coherent manifest.
5. **Use fluid or rigid-body water simulation.** Rejected because stable landing readability, seeded behavior, and fast tuning matter more than water realism.
6. **Add a component framework or build pipeline.** Rejected because the game must remain source-native and directly deployable to GitHub Pages.

## Consequences

The game ships deterministic rider/world simulation, code-authored production pixel work, and optional curated atlases instead of shared Three.js assets. A selected condition installs its wave profile before reset-derived geometry, and that profile remains deterministic for the run. Aerial value can be previewed without mutating score, then banked only through landing. Presentation may evolve freely as long as it consumes semantic state/events, preserves independent fallbacks, and obeys the shared-query rule; new level-specific waves belong in explicit profiles rather than renderer-only branches.

Cross-mode rewards, town entry, and broader profile use remain host-adapter concerns. Physical-device, assistive-technology, low-powered-hardware, and rights validation remain release follow-up items rather than reasons to merge the two projects.
