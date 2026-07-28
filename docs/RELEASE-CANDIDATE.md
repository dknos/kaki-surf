# Release candidate 2.8.4

Date: 2026-07-28.

This checkpoint is a local release candidate. Nothing was pushed, deployed, tagged, or published.

## Baseline

- Branch: `agent/kaki-land-panorama-anchors`
- Starting SHA: `d33dda264607e272cbf783121a8525c5082e2766`
- Starting version: 2.8.3
- Upstream observed after fetch: `origin/main` at `0eafe063f83a3418f457e1e601ff507da7c8646e`; the starting tree matched that upstream tree.
- Untouched gates: 356/356 native tests, 41 JavaScript modules parsed, and `git diff --check` passed.
- Existing unrelated trailer work was present under `docs/video` and `tools/trailer`; it was preserved and excluded from the candidate.
- Canonical evidence was stale: 179 listed scenes, 182 checked-in gallery PNGs, and documentation claiming 178.

## Issue ledger

| Severity | Symptom and reproduction | Root cause | Smallest fix | Regression evidence |
| --- | --- | --- | --- | --- |
| P1 | In Kaki-Land High Contrast, Guestbook Gull drifted 71.88 px relative to its panorama route during a jump. | The code-authored fallback did not update the canonical panorama crop consumed by sky-life projection. | Make the fallback publish the same X/Y crop and aerial state as the raster panorama; retain a null-safe settings seam for minimal renderer fixtures. | Renderer unit coverage plus Full, Mobile, High Contrast, and Reduced Motion Gull probes; every mode measured zero world-Y and panorama-anchor drift. |
| P1 | Active touch controls referenced an undefined `--crest` color. | The shared root palette omitted the token used by the pressed-state treatment. | Add the existing mint crest color to the root palette. | CSS token assertion and inspected Simple/Advanced active-touch captures at DPR2. |
| P1 | Deterministic carrier/traffic QA scenes could render empty even though the requested fixture existed. | Production traffic permission correctly rejected the condition/layer, but forced QA fixtures used the same permission result. | Mark only forced reset fixtures as QA-visible and clear the marker on every reset; production scheduling and production whale weights remain unchanged. | World reset/non-leak tests and inspected rebuilt traffic/carrier captures. |
| P1 | Gallery lists and documentation disagreed with checked-in evidence. | Three supported Kaki-Land resident/access scenes were present on disk but absent from synchronized scene sources, and prior totals were not refreshed. | Add the three scene IDs to every gallery source and enforce exact ID/file equality. | Static-host regression; 182/182 source IDs and PNGs; rebuilt and inspected contact sheet. |
| P1 | Install/share presentation lacked complete icons, canonical social metadata, and a large share card. | Entry metadata stopped at title/description/favicon/manifest. | Add canonical Open Graph and Twitter metadata, Apple/192/512/maskable icons, accurate manifest copy, and one deterministic 1200 × 630 card built from a finished gameplay capture. | Static metadata tests, deterministic pixel check, local 200/MIME checks, and visual review. |
| P1 | Aerial and recovery acceptance scripts could fail against current shipped behavior or a returning save without exposing a game defect. | The aerial check retained retired shelf-era height thresholds; recovery inherited saved Advanced/assist settings. | Measure current continuous camera separation and explicitly reset the recovery probe to Simple/no landing assist. | Fresh Twilight and Kaki-Land aerial sequences, ordered Advanced Q/E/F/T run, and recovery pursuit evidence. |

No P0 defect was reproduced. Frozen physics, scoring, camera ownership, fixed-step timing, save schema, and production encounter weights were not retuned.

## Measured verification

- Native suite: 360/360 after the candidate fixes.
- Syntax: 41 JavaScript modules.
- Gallery: 182 deterministic 1280 × 720 captures; synchronized scene lists and files; 1200 × 16218 contact sheet.
- Responsive shell: 40 lifecycle captures across 1280 × 720, 1920 × 1080, 1366 × 768, 1024 × 768, 390 × 844, 812 × 375, 844 × 390, and 915 × 412, plus six focused tube/air captures.
- Kaki-Land chase: protected opening x20.52 to x108.78, right lead x-58.60, committed left cutback x-49.73, pursuit return x20.34, zero wipeouts.
- Recovery pursuit: break advanced 46.55 logical pixels through crash and 31.27 through recovery entry; minimum protected entry gap 122.09.
- Gull stability: zero simulation-Y drift and zero panorama-anchor drift in Full, Mobile, High Contrast, and Reduced Motion.
- Touch: 844 × 390 at DPR2; Simple Trick 68 px, Action 76 px, Turbo 152 × 44 px; Advanced Q/E/F/T 52 × 52 px; no target overlap; real CDP touch events queued and completed Varial through the production input path; blur and orientation cleared queued ownership.
- Browser load profiles: fresh, returning, and deliberately corrupt storage all launched. The deliberate invalid JSON produced the expected single recovery warning. Across the cache-disabled load scan there were zero uncaught exceptions, failed local requests, remote gameplay requests, or repeated asset warnings.
- Cold local load: first playable at 189.4 ms, 70 resources, 2,664,687 transfer bytes, one 384 × 216 Canvas. This is local headless Chromium timing, not public-network performance.
- Lifecycle: 40 start/pause/resume/restart/menu cycles across all four conditions and both modes. Canvas count remained 1, touch pointer count 0, and application DOM count 535 after every cycle.
- Frame pacing: Auto, Full, and Mobile each measured 16.666 ms mean, 16.7 ms p95, and 16.8 ms maximum over 180 headless Chromium frames. Auto resolved Full on the desktop probe; Mobile resolved Mobile. Presentation mode never changed the 384 × 216 Canvas or fixed-step tests.
- Memory observation: post-GC heap increased 1,113,788 bytes over cycles 1–20 and 672,196 bytes over cycles 21–40; DOM nodes changed 2344 to 2343, documents remained 2, and canvases remained 1. This is bounded lifecycle evidence, not a claim of leak certification.
- Runtime assets: 3,679,055 bytes total: audio 1,858,290; backgrounds 1,307,708; generated atlases 457,484; install icons 4,641; social card 50,502.

## Device and browser matrix

| Surface | Method | Status |
| --- | --- | --- |
| Desktop Chromium | AUTOMATED local browser/CDP | PASS |
| Chromium DPR2 touch and orientation | EMULATED CDP | PASS |
| Desktop Firefox | NOT RUN | NOT RUN |
| Desktop Safari/WebKit | NOT RUN | NOT RUN |
| Xbox-style mapping | AUTOMATED native and browser mapping | PASS |
| Physical Xbox-style controller | REAL DEVICE | NOT RUN |
| Android Chrome | REAL DEVICE | NOT RUN |
| iPhone Safari | REAL DEVICE | NOT RUN |
| Physical safe areas, browser chrome, notification switch, and sleep/wake | REAL DEVICE | NOT RUN |
| Audible mix/listening review | REAL DEVICE | NOT RUN |

Keyboard operation, High Contrast, Reduced Motion, Reduced Flash, save migration, mode-specific records, audio lifecycle state, and gamepad/touch contracts have automated coverage. This is not an accessibility certification, a physical-device sign-off, or an audible mix approval.

## Deployment state

The live Pages configuration serves `main` from the repository root. The live JavaScript revision was verified as `0eafe063f83a3418f457e1e601ff507da7c8646e` before this candidate. Candidate metadata and assets resolve locally with correct case and MIME types, but their public URLs cannot be verified until an authorized push and Pages deployment. The remaining ship action is therefore a deliberate release/deployment plus the physical-device matrix above.
