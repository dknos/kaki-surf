# Responsive QA

The responsive browser matrix is separate from the canonical 1280 × 720 renderer gallery. It covers shell layout and lifecycle UI at these CSS viewports:

| Profile | Viewport | Active scene |
| --- | ---: | --- |
| Desktop | 1280 × 720 | Keyboard first-run teaching |
| Laptop | 1366 × 768 | Keyboard first-run teaching |
| Tablet | 1024 × 768 | Touch controls |
| Phone portrait | 390 × 844 | Touch controls |
| Phone landscape | 844 × 390 | Touch controls |

Each profile captures menu, active play, pause, results, and options. Files are written to `docs/images/qa-responsive`; the script never writes to `docs/images/qa` or rebuilds the production contact sheet.

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
- At 390 × 844, the D-pad ends at x = 152 and the action cluster starts at x = 176, leaving a 24 px gutter. Optional spin controls move to the upper row of the action cluster rather than overlapping the right direction button.
- The explicit in-run **II** control, all top controls, and every directional target retain at least a 44 px physical hit area. On short landscape screens the top controls stack in the right letterbox instead of covering the FANS panel, and the D-pad remains unscaled at 45 px.

## Current measured pass

A Chrome DevTools Protocol audit applied real device metrics rather than relying on the headless browser's minimum window width. At 390 × 844 and DPR 2, the Canvas measured x = 3..387; every touch target remained inside x = 12..378. The D-pad ended at x = 151, spin controls occupied x = 176..266, Trick x = 228..296, and Action x = 302..378. At 844 × 390, both control clusters move above the in-canvas FAST and FLOW panels with a visible gutter; the 44 px top controls occupy the right letterbox. A held Action pointer was then carried through a real emulated orientation change: play paused, the active class cleared, and the touch layer became hidden/inert. Settings made the entire touch layer `display: none`, `hidden`, and inert.

A supplemental 320 × 700 pass covered menu, Settings, Simple touch, and Advanced touch. It keeps a 16 px gap between clusters, preserves 44–64 px essential targets without transform scaling, lays Q/E/Special across a non-overlapping top row, and widens the compact Settings value column enough to show the complete control-mode label.
