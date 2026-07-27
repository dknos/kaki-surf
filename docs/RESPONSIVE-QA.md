# Responsive QA

Date: 2026-07-27.

The responsive browser matrix is separate from the canonical 1280 × 720 renderer gallery. It covers shell layout and lifecycle UI at these CSS viewports:

| Profile | Viewport | Active scene |
| --- | ---: | --- |
| Desktop | 1280 × 720 | Keyboard first-run teaching |
| Laptop | 1366 × 768 | Keyboard first-run teaching |
| Tablet | 1024 × 768 | Touch controls |
| Phone portrait | 390 × 844 | Landscape gate |
| Phone landscape | 844 × 390 | Touch controls |

Each profile captures menu, active play, pause, results, and options. Files are written to `docs/images/qa-responsive`; the script never writes to `docs/images/qa` or rebuilds the production contact sheet.

The travelling-break checkpoint adds six focused framing captures in the same directory:

| Scene | Desktop | Phone landscape | Phone portrait |
| --- | ---: | ---: | ---: |
| Rideable tube | `heroTube-desktop-1280x720.png` | `heroTube-phone-landscape-844x390.png` | `heroTube-phone-portrait-390x844.png` |
| Big-air camera | `heroAir-desktop-1280x720.png` | `heroAir-phone-landscape-844x390.png` | `heroAir-phone-portrait-390x844.png` |

These focused captures are rendering/framing evidence, not substitutes for the touch-lifecycle scenes. At all three sizes, the complete 16:9 playfield remains visible: the long face, fixed foam trail, and diagonal gravity front remain connected, the tube rider and live Tube panel are not clipped, the large-air camera reveals sky without separating the horizon, and the landing guide remains inside the Canvas. The portrait fixtures also document the deliberate centered letterbox above and below the fixed logical playfield.

The script launches one headless Chromium instance and applies each viewport through the Chrome DevTools Protocol. This avoids Chromium's roughly 500 px minimum layout width, which can silently crop a nominal 390 px `--window-size` screenshot instead of testing a real phone viewport. Serve the repository first, then run:

```console
bash tools/qa/capture-responsive.sh
```

Use `KAKI_SURF_QA_URL` to point the capture pass at another local static server and `KAKI_SURF_RESPONSIVE_DIR` to redirect evidence outside the repository.

For the focused trick-control acceptance, start Chromium with remote debugging
on port 9231 while the static build is served on port 9876, then run:

```console
node tools/qa/accept-trick-controls.mjs
```

That pass sends real CDP touch events through the production `InputManager`,
captures Simple and Advanced active-trick frames, measures every action target
and overlap, and verifies blur plus portrait/landscape queue cleanup. Override
the defaults with `KAKI_SURF_CDP_URL`, `KAKI_SURF_QA_URL`, and
`KAKI_SURF_TRICK_QA_DIR`.

## Touch lifecycle contract

- Touch controls are visible and interactive only while the lifecycle is `running`, the Allow Touch Controls setting is enabled, the settings dialog is closed, the device has a coarse primary pointer or a compact touch viewport, and the viewport is landscape. Fine-pointer desktops stay clear.
- Starting or resuming mobile play requests fullscreen and then `screen.orientation.lock("landscape")` from the activating gesture. The web app manifest independently declares fullscreen landscape presentation for installed launches.
- Browsers that reject fullscreen/orientation lock show a dedicated rotate-phone gate in portrait. Crossing into portrait pauses and neutralizes every held pointer; returning to landscape resumes an orientation-paused run automatically.
- Page/dialog surfaces use `touch-action: pan-y` while the Canvas and gameplay clusters retain `touch-action: none`; an emulated touch drag at 844 x 390 traversed the full 383 px Settings overflow range.
- Resuming restores the cluster only when Touch Controls remains enabled.
- Steering is one 112 px radial analog gate with a 42 px travel radius and a 12% radial dead zone. It reports continuous X/Y values and owns one pointer independently from Action, Trick, and Turbo.
- At 844 × 390, the Canvas consumes the full dynamic viewport height. The analog deck sits in the left letterbox/edge. Simple uses a 68 px Trick, 76 px Action, and wide Turbo target; Advanced keeps Q/E/F/T at 52 x 52 px in a stable 2 x 2 block. Pause and Exit form one compact top row, with Settings available from Pause.

## Current measured pass

A fresh Chrome DevTools Protocol audit applied true mobile device metrics. At 844 × 390, Simple measured 68 px Trick, 76 px Action, and 152 × 44 px Turbo targets; Advanced Q/E/F/T each measured 52 × 52 px. Neither layout had any overlap. Real 80 ms Simple and Advanced F touches each traversed `QUEUED` to `VARIAL` and produced exactly one completed manifest entry plus one 12 ms vibration request. Blur and portrait rotation cleared a held pre-takeoff queue, the portrait gate became active, and returning to 844 × 390 resumed with no queued action. The probe reported zero console, runtime, network, or HTTP errors.

The portrait menu and Settings remain scrollable so a player can choose a run before the landscape request. Gameplay itself no longer maintains a second, squeezed portrait control layout.

The 2026-07-20 hero-tube rerun captured 25 shell states to a temporary review directory and passed at 1280 x 720, 844 x 390, and 390 x 844. The crest clears the top HUD, Kaki/board remain centered inside the pocket, the bottom Tube panel clears Speed/Flow, the gravity front stays readable, and neither the whitewater edge nor the playfield clips. Because the active-scene override replaces the ordinary mobile fixture, this focused rerun validates composition only; the separate lifecycle matrix above remains the touch-control evidence.

The Endless-mode rerun repeated all 25 lifecycle captures after adding the two-card mode selector. At 390 x 844, Endless/Score Attack and the gold start action appear before the optional board/condition stack; at 844 x 390 the full selector, start row, boards, sessions, and control legend remain visible together. The in-canvas SET panel stays inside the existing center HUD slot. Results retain two compact columns, while Best Trick and Best Tube use a full-width row so long values do not collide.

The browser evidence above is local to the checked-out static build. Physical iOS/Android safe areas, browser chrome, multi-touch behavior, and post-deployment GitHub Pages caching remain outside this automated capture pass.

## Mobile quality checkpoint

The 2026-07-26 performance pass added one shared Auto/Full/Mobile setting instead of a second mobile build. A fresh 844 × 390 touch profile reported `requested: auto`, `resolved: mobile`, `data-quality-profile="mobile"`, and the visible Settings status `AUTO · MOBILE`. The scrolled Performance/Assists view remained readable, its dialog traversed the complete 514 px overflow range, Mobile removed backdrop blur, and the browser probe reported zero runtime exceptions or log errors.

An eight-second 844 × 390, device-scale-factor 2, 4× CPU-throttled comparison used the same runtime and active run for both explicit profiles. Full averaged 3.25 ms in `renderer.render()` with a 4.90 ms p95; Mobile averaged 2.53 ms with a 3.30 ms p95, roughly 22% lower average renderer time. Both retained the 384 × 216 backing Canvas and 1/120 simulation. This is reproducible desktop Chromium throttling evidence, not a substitute for thermal/frame-pacing validation on the physical phone that reported choppiness.
