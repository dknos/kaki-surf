# Known limitations

The shipped code includes four contextual trick actions, compositional aerials, three mechanically and visually distinct boards, three finished visual conditions, keyboard/gamepad/touch mappings, access settings, and a static-host adapter. The remaining limitations are validation and rights boundaries rather than placeholder gameplay features.

## Current limitations

- **Physical input coverage:** browser-level automated tests cover standard gamepad mappings and independent touch pointers, but the release still needs a representative physical-device pass across multiple controllers, trigger layouts, rumble implementations, phones, tablets, multi-touch stacks, orientation changes, and safe-area insets.
- **Assistive-technology coverage:** the menu, settings, focus targets, Canvas label, and live announcements are present, but hands-on audits with major desktop and mobile screen readers, switch control, voice control, and high-zoom/reflow combinations remain outstanding. The action game itself is not currently designed for screen-reader-only play.
- **Low-powered hardware coverage:** the fixed-step cap, bounded particle/callout pools, reduced-motion path, and compact Web Audio graph are implemented, but extended thermal, battery, audio-latency, and frame-pacing tests on older phones, integrated GPUs, and power-saving browser modes remain outstanding.
- **Character and reference rights:** written rightsholder confirmation is required before a public commercial, merchandising, or collectible release. The reference-only GLB/JPG and Kitty Kaki identity metadata are not proof of commercial character-art permission.

## Release follow-up

1. Run and record a physical controller/mobile matrix, including simultaneous direction plus held trick input and B's gameplay-versus-results context.
2. Complete a screen-reader, keyboard-only, switch/voice, focus, and zoom audit; log concrete issues rather than assuming Canvas labels provide gameplay equivalence.
3. Profile long runs on representative low-powered devices in all three conditions, with Web Audio, touch, Reduced Motion, High Contrast, and Full Wave Read enabled.
4. Archive the rights grant and permitted-use scope alongside the reference provenance before commercial distribution.
