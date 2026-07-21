# Known limitations

The implementation includes complete Endless Surf and Score Attack loops, simplified default controls plus optional Advanced controls, carried-energy surfing, compositional aerials, bidirectional/switch surfing, a rideable tube, three boards and conditions, a seeded wildlife/traffic/powerup world, local generated atlases with fallbacks, access settings, a synchronized 128-state browser QA matrix, and a static-host adapter. The broader commercial-arcade roadmap still has product work as well as physical-lab validation.

## Current limitations

- **Physical input coverage:** browser-level automated tests cover both control modes, standard gamepad mappings, and independent touch pointers, but the release still needs representative physical-device passes across controllers, trigger layouts, rumble implementations, phones, tablets, multi-touch stacks, orientation changes, and safe-area insets.
- **Mode and progression scope:** Endless Surf and the 78-second Score Attack now have complete mode selection, pacing, records, results, and instant retry. Big Air, Zen, daily seeds, challenges, unlock progression, achievements, and leaderboards have not yet been shipped.
- **Wave coverage:** Golden Coast, Twilight Glass, and Stormbreak now share the production long-face/gravity-column compositor while retaining different surface physics, palettes, and encounter pacing. Distinct authored silhouettes for the next two levels remain future work; the retired mini-curl, white shelf, and full-image C-wave renderers are no longer selected by any condition.
- **Twilight ambience scope:** ordinary boats, aircraft, and carrier traffic are deliberately suppressed in Twilight so they cannot appear in the sky opening or wave face. Adding richer wave-safe background life to this level remains future art-direction work.
- **Production whale encounters:** random whale encounter weights are deliberately zero while the new per-frame anchor contract is evaluated outside deterministic QA. Forced breach/ramp/mount scenes remain available for surface, collision, and masking validation.
- **Wave raster fallback:** the MVP silhouette no longer depends on a full-wave raster. Missing optional wave accents retain the collision-aligned long face, gravity columns, crest, foam trail, and churn, but lose the selected contact-spray and impact-churn detail.
- **Portrait composition:** touch UI supports portrait viewports, but gameplay keeps its fixed 16:9 logical Canvas and uses deliberate vertical letterboxing rather than recomposing the surf world for a tall screen.
- **Options scope:** remapping, text-size controls, quality presets, and automatic initialization from the operating system's Reduced Motion preference remain unimplemented. Existing persistent controls cover Simple/Advanced mode, audio, shake, flash, contrast, touch permission, wave-read guidance, and steering/landing assists.
- **Assistive-technology coverage:** the menu, settings, focus targets, Canvas label, and live announcements are present, but hands-on audits with major desktop and mobile screen readers, switch control, voice control, and high-zoom/reflow combinations remain outstanding. The action game itself is not currently designed for screen-reader-only play.
- **Low-powered hardware coverage:** the fixed-step cap, bounded particle/callout pools, reduced-motion path, and compact Web Audio graph are implemented, but extended thermal, battery, audio-latency, and frame-pacing tests on older phones, integrated GPUs, and power-saving browser modes remain outstanding.
- **Character and reference rights:** written rightsholder confirmation is required before a public commercial, merchandising, or collectible release. The reference-only GLB/JPG and Kitty Kaki identity metadata are not proof of commercial character-art permission.

## Release follow-up

1. Tune Endless set pacing from broader player data, then add progression/challenges without fragmenting the movement simulation.
2. Author level-specific Golden Coast and Stormbreak silhouettes on the locked continuous-wave contact/render contract rather than restoring the legacy compositor.
3. Run and record a physical controller/mobile matrix in both modes, including simultaneous direction plus Action/Trick, Advanced Turbo/Q/E/F/T, context mount release, L3 comfort, and B's gameplay-versus-results context.
4. Complete a screen-reader, keyboard-only, switch/voice, focus, and zoom audit; log concrete issues rather than assuming Canvas labels provide gameplay equivalence.
5. Add the missing remap/text-size/quality/OS-preference options and profile long runs on representative low-powered devices.
6. Archive the rights grant and permitted-use scope alongside the reference and generated-art provenance before commercial distribution.
