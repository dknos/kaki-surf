# QA matrix

Date: 2026-07-20.

This document distinguishes automated truth from browser-capture evidence. The deterministic gallery and capture pipeline contain 122 checked-in browser states: six locked Twilight travelling-break stages, separate right/left whale rides, and dedicated rideable-tube, big-air-camera, and active-Turbo scenes. The refreshed [contact sheet](./images/qa-contact-sheet.png) contains the complete normalized set. A separate five-frame real-input chase sequence under `images/qa-chase` proves the temporal behavior that static fixtures cannot: opening motion without a fall, complete offscreen lead, fixed-camera cutback, and pursuing return.

## Automated gate

Run after the final code edit:

```console
npm test
npm run check
git diff --check
```

Current result: **187/187 tests pass** and **30 JavaScript modules pass syntax checking**. Detailed coverage is in [Validation results](./TEST-RESULTS.md).

## Browser capture matrix

| Group | Required scenes | What must be visible | Status |
| --- | --- | --- | --- |
| Entry/UI | Endless/Score Attack selector, menu, settings Simple, settings Advanced, six-step Surf School, results | Immediate start action before customization on portrait; mode-specific labels and records; Twilight travelling break and Simple selected for a fresh save; action-gated teaching and replay; no stale POWER meter or overlapping long result rows | Pass |
| Core ride | Neutral, right travel, left travel, committed reversal, downhill, all-condition column break, six Twilight stages, dynamic chase, rideable tube, max speed, Turbo, pump | Rider-facing and wake follow signed travel while the fixed-grid break never mirrors; the protected opening advances before any fall, the distant coast and diagonal face flecks show rightward speed without reversing, held steering crosses most of the screen, forward speed can send the complete break offscreen, a cutback leaves the camera fixed, and independent pressure brings the barrel back; Gather/Pitch/Pour/Deep/Maximum/Collapse advances gravity heads left-to-right while revealed foam stays fixed; Turbo adds a readable signed tail, real overdrive headroom, and a compact fuel meter without horizontal rails | Pass |
| Air/landing | Small/medium/huge air, dedicated Twilight big-air camera, clockwise/counter spin, grabs, varial, Kaki Twist, perfect, wobble, switch landing, wipeout | Clamped upward camera framing reveals more sky with no horizon seam; Reduced Motion stays fixed; board/body separation, nearest valid landing tangent, signed landing direction, and queued single-message callouts remain legible | Pass |
| Wildlife | Dolphin approach/ride/dismount/gates, shark telegraph/near miss/contact, whale distant/breach/ramp/right ride/left ride/splash, reduced variants | Minimum danger telegraph, friendly mount readability, mounted animal and rider facing follow both committed directions, no harmful animal reward, coherent phase silhouettes | Pass |
| Powerups | Mango Rush, Moon Pop, Star Foam, miss, active HUD, expiration, consumption, protected event, plane drop | Unique silhouettes and labels; active effect reads without obscuring Speed/Flow; consumption and harmless misses are visible | Pass |
| Ambient world | Calm/busy/reverse traffic, all bird/boat/aircraft families, scatter, Feather Thread, couriers, races, live banners | Parallax separation without traffic ping-pong, stable facing, breaker-aware occlusion, readable reactive text, and watercraft grounded in waterline bands | Pass |
| Set piece | Carrier haze, arrival, deck activity, launch, Fleet Airshow and foam gates | Whimsical/nonmilitary identity, horizon scale, airshow hierarchy, no gameplay collision | Pass |
| Conditions | Every board in Golden Coast, Twilight Glass, and Stormbreak; condition-specific traffic | Correct local strip, palette and readable player/world contrast | Pass |
| Access | Touch Simple, touch Advanced, touch Turbo, true 390 x 844 portrait, pause/settings lifecycle, native Settings keys, controller Settings/results flow, held-touch rotation, 844 x 390 touch scrolling, High Contrast, Reduced Motion, Reduced Flash | No clipped or overlapping primary controls, no modal input leak, scrollable short-screen Settings, hidden/inert controls outside play, readable danger and reduced effects | Pass |
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
- Verify Speed tiers read `STALLING`, `GLIDING`, `FAST`, `FLYING`, `BLASTING`; Flow remains a separate combo/style indicator.
- Hold Turbo on the face and verify its tank drains, speed can exceed the normal board cap, gold tail sparks follow signed travel, and release/air/mount states stop spending fuel. Bank varied clean/perfect tricks to refill it; empty pops, wobble, failure, and repeat spam must not produce equivalent fuel.
- Verify Surf School waits for each real drop, carve, launch, rotation, trick, and landing action and never teaches the narrow seam as a requirement.
- Verify Reduced Motion suppresses large presentation motion without changing seeded spawns or collisions; Reduced Flash suppresses flashes without removing state cues.
- Verify High Contrast remains readable when raster backgrounds or generated families fall back.
- In every condition, verify the broad broken crest, diagonal gravity front, long face, and impact churn read as one connected break; new column heads must fall top-to-bottom while older foam tiles remain fixed and the registered edge advances left-to-right, independent of rider reversal.
- Verify the passed-left region restores real level sky/backwater rather than a white slab, the rear whitewater fades without a vertical source seam, and no boats, aircraft, carrier art, or horizontal rail intrudes into the wave composition.
- Hold Simple Trick in the critical pocket, confirm Tube Tuck/Soul Arch scores continuously with reduced steering authority, then confirm release or leaving the pocket clears the pose.
- For large air, confirm the world and horizon pan together, the rider remains visible, the landing guide stays on-screen, and Reduced Motion suppresses the vertical pan.

## Contact-sheet result

The gallery scene list, capture script, contact-sheet source, and checked-in capture directory match at 122 identifiers. Every capture is normalized to 1280 x 720; the assembled contact sheet is 1200 x 10938. The active-Turbo fixture is distinct from ordinary max speed. The right/left whale rides, six staged Twilight frames, dedicated tube and big-air fixtures, and the cargo ship, fishing boat, sailboat, speedboat, and carrier scenes remain separately reviewable; the craft fixtures stay visibly staged behind the break in the safe far-right water band. Rebuild deterministically with:

```console
python3 tools/qa/build-contact-sheet.py
```

Future scene changes must update `js/qa-gallery.js`, `tools/qa/capture-browser.sh`, and `tools/qa/build-contact-sheet.py` together so captions, counts, and files cannot drift. The canonical capture script now keeps one Chromium/CDP session alive for the full matrix, checks page/runtime/network errors, and avoids the screenshot-mode shutdown hang seen in this environment.

The temporal chase evidence is rebuilt separately with `node tools/qa/capture-chase.mjs` while a CDP Chromium instance and local static server are running. Its JSON records wipeouts, player x, forward camera x, and visible break x at all five checkpoints.

This checkpoint is local: it verifies checked-in files, native tests, and local Chromium captures. It does not claim that the GitHub Pages CDN has received or served the same revision; deployment verification belongs to the release step after push.
