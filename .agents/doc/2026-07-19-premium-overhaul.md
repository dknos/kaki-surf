# Documentation report: Premium overhaul

- **Date:** 2026-07-19
- **Project type:** CODING
- **Scope:** Kaki Surf standalone premium wave, trick, board, presentation, and integration overhaul

## Coverage

Requested documentation coverage is 9 of 9 feature areas (100%). This measures the explicitly requested documentation surfaces, not JavaScript symbol-level comment coverage or test-case counts.

| Area | Primary documentation |
| --- | --- |
| Keyboard, gamepad, touch, edge buffering, and legacy alias | `README.md`, `docs/CONTROLS-AND-FEEL.md`, `docs/TRICK-GRAMMAR.md` |
| Contextual on-wave eligibility and rejection | `docs/CONTROLS-AND-FEEL.md`, `docs/TRICK-GRAMMAR.md` |
| Aerial composition, gates, sequencing, naming, repeat signatures, and bank/loss | `docs/TRICK-GRAMMAR.md`, `docs/TUNING.md` |
| Shared wave truth, three zones, assist modes, teaching, and speed/pump cues | `docs/CONTROLS-AND-FEEL.md`, `docs/TUNING.md`, ADR-001 |
| Board specialties, ratings, silhouettes, and modifiers | `README.md`, `docs/TUNING.md`, `docs/ASSET-MANIFEST.md` |
| Golden Coast, Twilight Glass, and Stormbreak | `README.md`, `docs/TUNING.md`, `docs/ASSET-MANIFEST.md` |
| Static hosting, 384 x 216 Canvas, no bundler, and determinism boundary | `README.md`, ADR-001 |
| Code-authored sprite/wave/VFX pipeline and provenance | `docs/ASSET-MANIFEST.md`, ADR-001 |
| Persistence, lifecycle adapter, validation, and real release limitations | `README.md`, ADR-001, `docs/KNOWN-LIMITATIONS.md` |

## Generated

- Added `docs/TRICK-GRAMMAR.md` as the gameplay/API reference for input, contextual moves, catalog data, session lifecycle, manifest/entry fields, body/board composition, examples, naming, signatures, scoring, landing, and host adapters.
- Added this report at `.agents/doc/2026-07-19-premium-overhaul.md`.

## Updated

- `README.md`: quick play, four-action control map, boards/conditions, `npm test`, static deployment, module ownership, and adapter surface.
- `docs/CONTROLS-AND-FEEL.md`: final keyboard/gamepad/touch mappings, 120 ms edge semantics, eligibility/hints, aerial feel, wave zones, assist modes, staged teaching, speed cues, and banking.
- `docs/TUNING.md`: runtime/physics defaults, shared wave ranges, trick gates, landing formula, board statistics and specialties, conditions, score values, and exact-repeat decay.
- `docs/ASSET-MANIFEST.md`: production pipeline, `sprites.js` and `wave-visuals.js` status, code-authored provenance, runtime exclusions, board/condition assets, references, and rights.
- `docs/KNOWN-LIMITATIONS.md`: removed stale one-condition and generic-style claims; retained only physical-device, assistive-technology, low-powered-hardware, and rights follow-up.
- `docs/ADR-001-standalone-canvas.md`: focused module boundaries, shared-query rule, deterministic/non-deterministic boundary, static-host contract, and host responsibilities.

## Gaps found

- Final physical controller, rumble, mobile multi-touch/orientation, screen-reader/switch/voice, and low-powered-device evidence does not yet exist; the docs identify these as release follow-up rather than claiming completion.
- Written commercial character/reference rights confirmation remains external to the repository.
- `docs/TEST-RESULTS.md` is intentionally outside this workstream. The main task owner will record the final integrated suite and browser evidence after all concurrent changes settle.

No requested gameplay/API documentation area remains uncovered.

## Validation issues resolved

- Replaced the stale single `Style`/generic-grab presentation with Q/E/F/T plus X/C compatibility language.
- Corrected the input description: pressed and released edges are buffered for 120 ms; held state is live rather than a delayed pulse.
- Replaced generic 58% trick-repeat wording with full-signature matching and trick-specific decay floors.
- Replaced the stale one-condition limitation with all three production conditions.
- Corrected sprite provenance from an all-in-`renderer.js` description to the production `sprites.js` import and documented `wave-visuals.js` as the production wave path.
- Separated deterministic simulation from cosmetic particle/audio randomness and persistence timestamps.
- Made Wave Read distinct from score-affecting Steering/Landing assists.

## Validation approach

The documentation was checked against the current implementation rather than prior prose:

- read `config`, `input`, `wave`, trick catalog/session/scoring, score system, simulation, renderer, sprites, wave visuals, audio, game shell, persistence, integration adapter, and launcher source;
- inspected package scripts and native tests for input, trick grammar/scoring, fixed-step simulation, wave truth, persistence, and static-host contracts;
- compared documented field names, thresholds, action aliases, gamepad button indices, event hints, formulas, lifecycle methods, and save defaults directly with source;
- checked Markdown for a single H1, non-skipped heading hierarchy, fenced-code language tags, and resolvable relative links;
- ran the repository's native `npm test` validation and `npm run check` syntax commands after edits. This report intentionally omits pinned counts so `docs/TEST-RESULTS.md` can remain the single final integrated test record.

## Next steps

- [x] Main task owner recorded final integrated automated and browser results in `docs/TEST-RESULTS.md`.
- [ ] Run the physical-device and assistive-technology matrices described in `docs/KNOWN-LIMITATIONS.md`.
- [ ] Archive written rights authorization before commercial distribution.
