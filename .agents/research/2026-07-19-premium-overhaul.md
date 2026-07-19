# Research: Kaki Surf premium overhaul

**Date:** 2026-07-19  
**Backend:** codex-sub-agents  
**Scope:** Input, deterministic simulation, wave truth, aerial scoring, boards, rendering, audio, persistence, integration, and validation.

## Summary

Kaki Surf already has a clean fixed-step, no-bundler module boundary, but its major gameplay signals are represented as renderer-local decoration or single booleans. The overhaul should preserve the stable surface queries and host lifecycle while adding explicit trick manifests and a shared wave-speed query consumed by both simulation and rendering.

## Key files

| File | Purpose |
| --- | --- |
| `js/input.js` | Keyboard, gamepad, touch, and 120 ms action buffering |
| `js/simulation.js` | Fixed-step player state, riding, launch, landing, and wipeout truth |
| `js/scoring.js` | Score buckets, combo, landing awards, and repeat history |
| `js/wave.js` | Stable crest/face geometry, curl position, and pocket risk |
| `js/renderer.js` | Canvas world, surfer, wave, VFX, landing guide, and HUD |
| `js/game.js` | Lifecycle, UI, fixed-step loop, settings, persistence, and adapters |
| `js/audio.js` | Procedural reactive music, wave noise, and event cues |
| `js/config.js` | Central tuning, board modifiers, settings, and palettes |

## Findings

- The deterministic core is sound: the game advances `SurfSimulation` at `FIXED_STEP` inside an accumulator and caps catch-up work (`js/game.js:162-204`). The renderer receives interpolated state and cannot advance gameplay (`js/renderer.js:116-147`).
- Surface alignment is already shared through `GameplayWave.ridingY()` and `slopeAt()` (`js/wave.js:39-50`), including the landing guide (`js/renderer.js:238-253`). This boundary should be extended, not replaced.
- Acceleration truth is currently inline in `updateRiding()`: the apparent power zone is calculated from a fixed target near face `0.42` (`js/simulation.js:154-161`). The renderer independently paints fixed bands and generic highlights (`js/renderer.js:187-208`, `js/renderer.js:468-479`), so it cannot explain actual speed gain or correction direction.
- Aerial truth is only accumulated body rotation plus one `grabbed` boolean (`js/simulation.js:218-243`). The renderer consequently has one grab silhouette (`js/renderer.js:502-606`).
- Aerial naming collapses to `FLOATY POP`, `PLUSH HALF`, or `Nx PLUSH ROTATION`; repeat decay keys only that generated name (`js/scoring.js:74-103`, `js/scoring.js:117-129`). Different pose/board tricks cannot create distinct signatures.
- Launch points are added directly to the score before landing (`js/scoring.js:69-72`), while `wipeout()` only resets combo/flow (`js/scoring.js:105-109`). This violates provisional aerial banking.
- Input exposes one `style` action mapped to X/C, one gamepad family, and one touch button; it has no style-release edge (`js/input.js:6-16`, `js/input.js:69-93`, `js/input.js:200-214`). The external adapter is narrow and should continue consuming a renderer-independent action contract (`js/integration-adapter.js:5-36`).
- Board scalar modifiers are already meaningful side-grades (`js/config.js:38-93`), but Canvas and menu rendering use the same silhouette (`js/renderer.js:482-500`, `styles.css:262-283`). Board identity work should retain those modifiers while exposing them through distinct geometry, motion, wake, specialty, and comparison bars.
- Settings are merged over defaults, so adding Wave Read Assist and condition defaults is backward compatible without changing the save key (`js/persistence.js:16-33`). Lifecycle methods already clear owned input on pause/destroy (`js/game.js:113-131`, `js/game.js:397-404`); new action state must join that clearing path.
- The repository contains no tracked automated test files or package manifest. `docs/TEST-RESULTS.md:5-35` records historical claims but cannot be rerun. A native Node test harness is required for fresh evidence.

## Implementation decomposition

1. **Gameplay truth:** add trick catalog/session/scoring modules; integrate explicit manifests, provisional values, complete signatures, board-relative rotation, contextual maneuvers, and landing banking into simulation/scoring.
2. **Input contract:** replace generic style state with four pressed/held/released actions across keyboard, controller, touch, legacy aliases, clearing, and external normalization.
3. **Wave and presentation:** add `speedPotential()` as the shared source of truth; render its seam/zones, distinct boards/poses/conditions/VFX/HUD; expand semantic audio events.
4. **Shell and validation:** expose board stats/conditions/settings/tutorial/touch diamond, add Node tests and a real-renderer QA gallery, update documentation, then browser-playtest and capture the matrix.

## Risks and constraints

- Keep all simulation math deterministic and avoid renderer state feeding back into physics.
- Avoid shared-file edits across concurrent agents; integrate `game.js`, `config.js`, CSS, and docs after the core contracts settle.
- Preserve version-1 save compatibility, relative URLs, 384×216 backing resolution, and `createKakiSurf()` lifecycle semantics.
