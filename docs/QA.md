# QA matrix

Date: 2026-07-19.

This document distinguishes automated truth from browser-capture evidence. The files under `docs/images/qa` are the refreshed production set for the bidirectional/world pass. The assembled [contact sheet](./images/qa-contact-sheet.png) contains 112 reviewed browser states.

## Automated gate

Run after the final code edit:

```console
npm test
npm run check
git diff --check
```

Final result: **90/90 tests pass** and **26 JavaScript modules pass syntax checking**. Detailed coverage is in [Validation results](./TEST-RESULTS.md).

## Browser capture matrix

| Group | Required scenes | What must be visible | Status |
| --- | --- | --- | --- |
| Entry/UI | Menu, settings Simple, settings Advanced, keyboard/gamepad teaching, results | Simple selected for a fresh save; Advanced legacy mapping; no stale POWER meter or seam-required copy; score and Flow distinct | Pass |
| Core ride | Neutral, right travel, left travel, committed reversal, downhill, four curl states, max speed, pump | Facing, board, wake, sparse water contours, and parallax agree with direction; curl has no rectangular seams; reversal reads as committed movement | Pass |
| Air/landing | Small/medium/huge air, clockwise/counter spin, grabs, varial, Kaki Twist, perfect, wobble, switch landing, wipeout | Big-air scale; board/body separation; nearest valid landing tangent; signed landing direction; carry and callout hierarchy | Pass |
| Wildlife | Dolphin approach/ride/dismount/gates, shark telegraph/near miss/contact, whale distant/breach/ramp/ride/splash, reduced variants | Minimum danger telegraph, friendly mount readability, no harmful animal reward, coherent phase silhouettes | Pass |
| Powerups | Mango Rush, Moon Pop, Star Foam, miss, active HUD, expiration, consumption, protected event, plane drop | Unique silhouettes and labels; active effect reads without obscuring Speed/Flow; consumption and harmless misses are visible | Pass |
| Ambient world | Calm/busy/reverse traffic, all bird/boat/aircraft families, scatter, Feather Thread, couriers, races, live banners | Parallax separation, signed movement, projected facing, layer ordering, readable reactive text, and watercraft grounded in waterline bands | Pass |
| Set piece | Carrier haze, arrival, deck activity, launch, Fleet Airshow and foam gates | Whimsical/nonmilitary identity, horizon scale, airshow hierarchy, no gameplay collision | Pass |
| Conditions | Every board in Golden Coast, Twilight Glass, and Stormbreak; condition-specific traffic | Correct local strip, palette and readable player/world contrast | Pass |
| Access | Touch Simple, touch Advanced, High Contrast, Reduced Motion, Reduced Flash | No clipped primary controls, hidden Simple Special until ready, readable danger and reduced effects | Pass |
| Asset failure | Manifest and dimension rejection plus an absent-dolphin-atlas browser injection | Game starts; semantic fallback remains visible; restored production asset revalidates | Pass |

## Capture review checklist

- Use a stable normalized viewport and record browser/device pixel ratio.
- Confirm the console has no uncaught exceptions, failed local module imports, or repeated asset warnings.
- Inspect transparent atlas edges against light and dark condition palettes.
- Inspect native 384 x 216 pixels as well as the scaled screenshot; smooth resampling can hide broken pixel clusters.
- Verify the rider does not face away from the wake after reversal, takeoff, animal dismount, or switch landing.
- Verify the world never renders a pickup or hazard that the simulation has already culled.
- Verify far and mid traffic stay behind the wave/player and near traffic stays decorative without covering actionable telegraphs.
- Verify every boat hull intersects its assigned waterline and faces its projected screen motion when the camera overtakes or reverses past it.
- Verify Speed tiers read `STALLING`, `GLIDING`, `FAST`, `FLYING`, `BLASTING`; Flow remains a separate combo/style indicator.
- Verify Simple teaching says to drop for speed and hit the lip for air, not that a narrow seam is required.
- Verify Reduced Motion suppresses large presentation motion without changing seeded spawns or collisions; Reduced Flash suppresses flashes without removing state cues.
- Verify High Contrast remains readable when raster backgrounds or generated families fall back.

## Contact-sheet result

The gallery scene list, capture script, and contact-sheet source match at 112 identifiers. Every capture exists; an exact-hash scan reports 109 unique renders, with only the three intentional Foam Puff/default-condition identity pairs matching. The assembled sheet plus key native-size states were inspected. Rebuild deterministically with:

```console
python3 tools/qa/build-contact-sheet.py
```

Future scene changes must update `js/qa-gallery.js`, `tools/qa/capture-browser.sh`, and `tools/qa/build-contact-sheet.py` together so captions, counts, and files cannot drift.
