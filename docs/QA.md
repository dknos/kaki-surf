# QA matrix

Date: 2026-07-21.

This document distinguishes automated truth from browser-capture evidence. The deterministic gallery contains 141 checked-in browser states, including Core Surf Lab, left/right and downhill mirror pairs, carried uphill motion, reversal, launch/landing, all four aerial tiers in all three conditions, and whale takeoff/apex/return.

## Automated gate

Run after the final code edit:

```console
npm test
npm run check
git diff --check
```

Current result: **209/209 tests pass** and **34 JavaScript modules pass syntax checking**.

## Browser capture matrix

| Group | Required scenes | What must be visible | Status |
| --- | --- | --- | --- |
| Entry/UI | Endless/Score Attack selector, menu, settings Simple, settings Advanced, six-step Surf School, results | Immediate start action before customization on portrait; mode-specific labels and records; Twilight travelling break and Simple selected for a fresh save; action-gated teaching and replay; no stale POWER meter or overlapping long result rows | Pass |
| Core ride | Core Surf Lab, right/left travel, downhill-right/downhill-left, uphill, reversal, launch, landing | One canonical path vector owns board, rider, wake, spray, camera, and audio; trajectory foam always trails; the drop/climb/cutback line reads without rewards or wildlife | Pass |
| Air/landing | Small/medium/huge air, Coastal Sky/Cloud Layer/Upper Atmosphere/Kaki Space in all conditions, re-entry, clockwise/counter spin, grabs, varial, Kaki Twist, perfect, wobble, switch landing, wipeout | Canonical nonlinear altitude samples a seamless tall panorama; only a qualified Turbo lip launch reaches space; signed horizontal travel, foreground cloud depth, altitude audio, early camera return, landing guide, board/body separation, and landing tangent remain legible | Pass |
| Wildlife | Dolphin and shark phases; whale distant, breach start/apex/return, ramp, rides, and splash | Whale art, collision, foam, and foreground mask share one water anchor; production whale weights remain zero | Pass |
| Powerups | Mango Rush, Moon Pop, Star Foam, miss, expiration, consumption, protected event, plane drop | Unique silhouettes and temporary callouts; no persistent powerup meter; consumption and harmless misses remain visible | Pass |
| Ambient world | Calm/busy/reverse traffic, all bird/boat/aircraft families, scatter, Feather Thread, couriers, races, live banners | Parallax separation without traffic ping-pong, stable facing, breaker-aware occlusion, readable reactive text, and watercraft grounded in waterline bands | Pass |
| Set piece | Carrier haze, arrival, deck activity, launch, Fleet Airshow and foam gates | Whimsical/nonmilitary identity, horizon scale, airshow hierarchy, no gameplay collision | Pass |
| Conditions | Every board in Golden Coast, Twilight Glass, and Stormbreak; condition-specific traffic | Correct local strip, palette and readable player/world contrast | Pass |
| Access | Simple keyboard/gamepad/touch, Advanced controls, Settings, High Contrast, Reduced Motion, Reduced Flash | Simple shows only line, Action, and Trick; Advanced deliberately restores Turbo and Q/E/F/T | Pass |
| Audio lifecycle | Running, pause, visibility, resume, results, record, rapid retry, mute | No missed-beat catch-up, stale board/wind bed, stacked completion fanfare, invalid gain, or unbounded major-event peak | Pass |
| Asset failure | Manifest and dimension rejection plus an absent-dolphin-atlas browser injection | Game starts; semantic fallback remains visible; restored production asset revalidates | Pass |

## Capture review checklist

- Use a stable normalized viewport and record browser/device pixel ratio.
- Confirm the console has no uncaught exceptions, failed local module imports, or repeated asset warnings.
- Inspect transparent atlas edges against light and dark condition palettes.
- Inspect native 384 x 216 pixels as well as the scaled screenshot; smooth resampling can hide broken pixel clusters.
- Verify the rider does not face away from the wake after reversal, takeoff, animal dismount, or switch landing.
- Verify the world never renders a pickup or hazard that the simulation has already culled.
- Verify far traffic remains behind the wave, ordinary mid-watercraft disappear before entering the curl/player zone, and near traffic stays decorative without covering actionable telegraphs.
- Verify every boat hull intersects its assigned waterline and preserves intended travel through camera reversals; only deliberate wake-race craft may remain visible ahead of the breaker.
- On Twilight, hold Right until the camera advances and the barrel clears the left edge, then hold Left: Kaki must cross the screen while the camera and scenery remain fixed, and the break must eventually pursue back from the left.
- Before entering any input, confirm the protected opening advances its break at least eight pixels, carries Kaki right, and scrolls the coast left with zero wipeouts.
- Force a whale while the rider is high in the air and verify its anchor, shadow, wake, and splash remain registered to the ocean rather than inheriting the rider's airborne Y.
- While mounted on a whale, commit left and right reversals and verify the whale, Kaki, wake, and eventual dismount carry all follow the active direction.
- Trigger several callouts rapidly and verify only one message is visible at a time; danger may follow a readable minimum beat while stale hints expire instead of surfacing late.
- Verify Simple mode has no Turbo, Flow, Set, pump, powerup, or Special HUD/control clutter; verify Advanced Turbo separately.
- Verify Surf School waits for drop, climb, cutback, lip, trick, and landing actions.
- Verify Reduced Motion scales down aerial framing and suppresses foreground-cloud occlusion without changing seeded spawns or collisions; Reduced Flash suppresses flashes without removing state cues.
- Verify High Contrast remains readable when raster backgrounds or generated families fall back.
- In every condition, verify the broad broken crest, diagonal gravity front, long face, and impact churn read as one connected break; new column heads must fall top-to-bottom while older foam tiles remain fixed and the registered edge advances left-to-right, independent of rider reversal.
- Verify the passed-left region restores real level sky/backwater rather than a white slab, the rear whitewater fades without a vertical source seam, and no boats, aircraft, carrier art, or horizontal rail intrudes into the wave composition.
- Hold Simple Trick in the critical pocket, confirm Tube Tuck/Soul Arch scores continuously with reduced steering authority, then confirm release or leaving the pocket clears the pose.
- For large air, confirm the coast drops continuously, each authored altitude tier enters without blank exposure or a hard swap, signed horizontal parallax survives reversal, the rider remains visible, and the landing guide appears before the dangerous descent.

## Contact-sheet result

The gallery scene list, capture script, contact-sheet source, and checked-in capture directory match at 141 identifiers. Every capture is 1280 x 720; the assembled contact sheet is 1200 x 12522. Rebuild deterministically with:

```console
python3 tools/qa/build-contact-sheet.py
```

Future scene changes must update `js/qa-gallery.js`, `tools/qa/capture-browser.sh`, and `tools/qa/build-contact-sheet.py` together so captions, counts, and files cannot drift. The canonical capture script now keeps one Chromium/CDP session alive for the full matrix, checks page/runtime/network errors, and avoids the screenshot-mode shutdown hang seen in this environment.

The temporal chase evidence is rebuilt separately with `node tools/qa/capture-chase.mjs` while a CDP Chromium instance and local static server are running. Its JSON records wipeouts, player x, forward camera x, and visible break x at all five checkpoints.

This checkpoint is local: it verifies checked-in files, native tests, and local Chromium captures. It does not claim that the GitHub Pages CDN has received or served the same revision; deployment verification belongs to the release step after push.
