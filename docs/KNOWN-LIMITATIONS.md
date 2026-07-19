# Known limitations

The implementation includes Simple and Advanced controls, compositional aerials, bidirectional/switch surfing, three boards and conditions, a seeded wildlife/traffic/powerup world, local generated atlases with fallbacks, access settings, a reviewed 112-state browser gallery, and a static-host adapter. The remaining limitations require physical hardware, assistive-technology labs, representative low-powered devices, or rights-holder confirmation rather than missing core systems.

## Current limitations

- **Physical input coverage:** browser-level automated tests cover both control modes, standard gamepad mappings, and independent touch pointers, but the release still needs representative physical-device passes across controllers, trigger layouts, rumble implementations, phones, tablets, multi-touch stacks, orientation changes, and safe-area insets.
- **Assistive-technology coverage:** the menu, settings, focus targets, Canvas label, and live announcements are present, but hands-on audits with major desktop and mobile screen readers, switch control, voice control, and high-zoom/reflow combinations remain outstanding. The action game itself is not currently designed for screen-reader-only play.
- **Low-powered hardware coverage:** the fixed-step cap, bounded particle/callout pools, reduced-motion path, and compact Web Audio graph are implemented, but extended thermal, battery, audio-latency, and frame-pacing tests on older phones, integrated GPUs, and power-saving browser modes remain outstanding.
- **Character and reference rights:** written rightsholder confirmation is required before a public commercial, merchandising, or collectible release. The reference-only GLB/JPG and Kitty Kaki identity metadata are not proof of commercial character-art permission.

## Release follow-up

1. Run and record a physical controller/mobile matrix in both modes, including simultaneous direction plus Action/Trick, conditional Special, and B's gameplay-versus-results context.
2. Complete a screen-reader, keyboard-only, switch/voice, focus, and zoom audit; log concrete issues rather than assuming Canvas labels provide gameplay equivalence.
3. Profile long runs on representative low-powered devices in all three conditions with maximum world density, Web Audio, touch, Reduced Motion, High Contrast, and Full Wave Read.
4. Archive the rights grant and permitted-use scope alongside the reference and generated-art provenance before commercial distribution.
