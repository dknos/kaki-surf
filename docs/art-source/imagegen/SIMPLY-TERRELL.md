# SimplyTerrell character source

SimplyTerrell is an LA stand-up comedian. A user-supplied stage photo in the
project conversation was used strictly as a visual reference and is not
redistributed in this repository. The preserved offline concept sheet is
`simply-terrell-concept.png` (SHA-256
`e6e01cff7d9fcc37e1a1f89e46694de09025978c5bad24b3753dee6bee54ea28`).
It is documentation/source material only and is never requested by the browser.

The runtime atlas is rebuilt deterministically:

```bash
python3 tools/art/build-simply-terrell-atlas.py
python3 tools/art/build-simply-terrell-atlas.py --check
```

The native-pixel atlas preserves the reference traits that survive gameplay
scale: shoulder-length locs, warm brown skin, a loose navy tracksuit with gray
shoulder panels, a red collar accent, and one black/silver handheld microphone
in every pose. It does not embed the photo or its stage background.

## ImageGen prompt

```text
Use case: stylized-concept
Asset type: production game character concept sheet for Kaki Surf
Input image role: the supplied photo is a strict visual reference for SimplyTerrell, an LA stand-up comedian; do not edit the photo or reproduce its stage background.
Primary request: create a recognizable pixel-art surfer character based on the supplied reference, performing on a surfboard while always carrying a handheld stand-up microphone.
Subject invariants: Black adult man; shoulder-length locs framing the face; warm confident comedian expression; dark navy loose tracksuit with light gray shoulder panels; small red shirt accent visible at the open collar; black handheld microphone with silver grille. Preserve these traits consistently in every pose.
Pose sheet: four clearly separated full-body poses—neutral surf stance with microphone near mouth, airborne jump with microphone held safely, deep carve with the free hand gesturing, and clean landing/recovery. Keep the microphone legible in every pose. Board is a simple pale surfboard with no logos.
Style/medium: crisp 16-bit arcade pixel art, chunky readable silhouettes, restrained shading, suitable for downscaling into 64x64 gameplay sprites.
Composition/framing: 2x2 pose sheet, one character per quadrant, generous separation and padding, no overlap, consistent scale and viewing angle.
Scene/backdrop: perfectly uniform flat chroma-key green #00FF00 across the entire background, with no shadows, texture, gradient, vignette, floor, border, or scenery.
Color palette: navy, charcoal, warm brown skin, dark locs, light gray shoulder panels, small red collar accent, silver microphone grille, pale board. Do not use green anywhere on the character or board.
Constraints: no text, no captions, no logos, no watermark, no extra people, no extra limbs, exactly one microphone per pose, full body and entire board visible in every pose.
```
