# Responsive QA

Date: 2026-07-21.

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

## Touch lifecycle contract

- Touch controls are visible and interactive only while the lifecycle is `running`, the Allow Touch Controls setting is enabled, the settings dialog is closed, the device has a coarse primary pointer or a compact touch viewport, and the viewport is landscape. Fine-pointer desktops stay clear.
- Starting or resuming mobile play requests fullscreen and then `screen.orientation.lock("landscape")` from the activating gesture. The web app manifest independently declares fullscreen landscape presentation for installed launches.
- Browsers that reject fullscreen/orientation lock show a dedicated rotate-phone gate in portrait. Crossing into portrait pauses and neutralizes every held pointer; returning to landscape resumes an orientation-paused run automatically.
- Page/dialog surfaces use `touch-action: pan-y` while the Canvas and gameplay clusters retain `touch-action: none`; an emulated touch drag at 844 x 390 traversed the full 383 px Settings overflow range.
- Resuming restores the cluster only when Touch Controls remains enabled.
- Steering is one 112 px radial analog gate with a 42 px travel radius and a 12% radial dead zone. It reports continuous X/Y values and owns one pointer independently from Action, Trick, and Turbo.
- At 844 × 390, the Canvas consumes the full dynamic viewport height. The analog deck sits in the left letterbox/edge while 60–76 px Simple actions sit at the right edge; Pause and Exit form one compact top row, with Settings available from Pause.

## Current measured pass

A fresh Chrome DevTools Protocol audit applied true mobile device metrics. At 844 × 390, the Canvas measured 693.33 × 389.98 at x=75.34; the 116 × 126 stick deck begins at x=12 and the 164 × 120 Simple action deck ends at x=832. A diagonal DOM pointer drag reported x=0.564/y=-0.705 while Action and Turbo remained held, then releasing only the stick returned X/Y to zero without releasing either action. At 390 × 844, active play becomes the opaque `TURN PHONE / SURF HORIZONTAL` gate and the touch layer stays hidden/inert. The probe reported zero runtime exceptions.

The portrait menu and Settings remain scrollable so a player can choose a run before the landscape request. Gameplay itself no longer maintains a second, squeezed portrait control layout.

The 2026-07-20 hero-tube rerun captured 25 shell states to a temporary review directory and passed at 1280 x 720, 844 x 390, and 390 x 844. The crest clears the top HUD, Kaki/board remain centered inside the pocket, the bottom Tube panel clears Speed/Flow, the gravity front stays readable, and neither the whitewater edge nor the playfield clips. Because the active-scene override replaces the ordinary mobile fixture, this focused rerun validates composition only; the separate lifecycle matrix above remains the touch-control evidence.

The Endless-mode rerun repeated all 25 lifecycle captures after adding the two-card mode selector. At 390 x 844, Endless/Score Attack and the gold start action appear before the optional board/condition stack; at 844 x 390 the full selector, start row, boards, sessions, and control legend remain visible together. The in-canvas SET panel stays inside the existing center HUD slot. Results retain two compact columns, while Best Trick and Best Tube use a full-width row so long values do not collide.

The browser evidence above is local to the checked-out static build. Physical iOS/Android safe areas, browser chrome, multi-touch behavior, and post-deployment GitHub Pages caching remain outside this automated capture pass.
