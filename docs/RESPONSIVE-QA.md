# Responsive QA

Date: 2026-07-21.

The responsive browser matrix is separate from the canonical 1280 × 720 renderer gallery. It covers shell layout and lifecycle UI at these CSS viewports:

| Profile | Viewport | Active scene |
| --- | ---: | --- |
| Desktop | 1280 × 720 | Keyboard first-run teaching |
| Laptop | 1366 × 768 | Keyboard first-run teaching |
| Tablet | 1024 × 768 | Touch controls |
| Phone portrait | 390 × 844 | Touch controls |
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

- Touch controls are visible and interactive only while the lifecycle is `running`, the Allow Touch Controls setting is enabled, the settings dialog is closed, and the device has a coarse primary pointer or a compact touch viewport. Fine-pointer desktops stay clear even though touch support is allowed by default.
- Pause, settings, results, menu, visibility loss, blur, and stable portrait/landscape transitions clear active touch pointers before hiding and making the cluster inert.
- Page/dialog surfaces use `touch-action: pan-y` while the Canvas and gameplay clusters retain `touch-action: none`; an emulated touch drag at 844 x 390 traversed the full 383 px Settings overflow range.
- Resuming restores the cluster only when Touch Controls remains enabled.
- At 390 × 844, the D-pad ends at x = 152 and the action cluster starts at x = 176, leaving a 24 px gutter. Simple shows only Trick and Action; Advanced restores the upper Q/E/Turbo band and the T/Twist button without overlapping the right direction button.
- The explicit in-run **II** control, all top controls, and every directional target retain at least a 44 px physical hit area. On short landscape screens the top controls stack in the right letterbox instead of covering the FANS panel, and the D-pad remains unscaled at 45 px.

## Current measured pass

A Chrome DevTools Protocol audit applied real device metrics rather than relying on the headless browser's minimum window width. At 390 × 844 and DPR 2, the Canvas measured x = 3..387; every touch target remained inside x = 12..378. Simple mode exposes only the D-pad, Trick, and Action. Advanced retains its non-overlapping upper Q/E/Turbo row and lower Trick/T/Action row. At 844 × 390, both clusters retain a visible gutter and the 44 px top controls occupy the right letterbox. A held Action pointer was then carried through a real emulated orientation change: play paused, the active class cleared, and the touch layer became hidden/inert. Settings made the entire touch layer `display: none`, `hidden`, and inert.

A supplemental 320 × 700 pass covered menu, Settings, Simple touch, and Advanced touch. It keeps a 24 px gap between clusters, preserves 44–45 px essential targets without transform scaling, and keeps Advanced's Q/E/Turbo and Trick/T/Action grid distinct from the two-button Simple surface. The compact Settings value column remains wide enough to show the complete control-mode label.

The 2026-07-20 hero-tube rerun captured 25 shell states to a temporary review directory and passed at 1280 x 720, 844 x 390, and 390 x 844. The crest clears the top HUD, Kaki/board remain centered inside the pocket, the bottom Tube panel clears Speed/Flow, the gravity front stays readable, and neither the whitewater edge nor the playfield clips. Because the active-scene override replaces the ordinary mobile fixture, this focused rerun validates composition only; the separate lifecycle matrix above remains the touch-control evidence.

The Endless-mode rerun repeated all 25 lifecycle captures after adding the two-card mode selector. At 390 x 844, Endless/Score Attack and the gold start action appear before the optional board/condition stack; at 844 x 390 the full selector, start row, boards, sessions, and control legend remain visible together. The in-canvas SET panel stays inside the existing center HUD slot. Results retain two compact columns, while Best Trick and Best Tube use a full-width row so long values do not collide.

The browser evidence above is local to the checked-out static build. Physical iOS/Android safe areas, browser chrome, multi-touch behavior, and post-deployment GitHub Pages caching remain outside this automated capture pass.
