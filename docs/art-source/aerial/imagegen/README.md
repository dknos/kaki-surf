# Continuous aerial repair prompts

The original three project-bound sources were produced with the built-in image
generation edit workflow. Each named Nano image was the edit target and style
lock. The shared requirements were: one vertically continuous scene, exactly
one coastline and horizon, compatible left/right border content, a safe flight
corridor, crisp authored pixel art, and no pasted rectangles, collage borders,
hard section seams, mirrored repetition, characters, UI, text, or logos.

## Golden Coast

Preserve the Southern California cliff, palms, lifeguard tower, pier, warm
peach haze, teal ocean, chunky clusters, and deep-navy outlines. Extend upward
through peach-and-cream cloud banks, clean sun rays and contrails, deep cobalt
upper atmosphere, a thin curved golden rim, then a sparse playful starfield
with one tiny satellite and one shooting star.

## Twilight Glass

Preserve the cold-water cliff, palms, lifeguard tower, pier, violet sunset,
luminous horizon, chunky clusters, and deep-navy outlines. Extend upward through
moonlit violet cloud banks and wisps, indigo atmosphere, lavender haze, subtle
turquoise aurora, crisp stars, one off-center moon, a faint nebula, and one tiny
satellite.

## Stormbreak

Preserve the dark storm coast, palms, lifeguard tower, pier, steel-teal ocean,
rain-dark palette, chunky clusters, and deep-navy outlines. Extend upward
through enormous thunderheads with sparse clean lightning, above cold glowing
cloud tops into blue-black atmosphere, then sparse stars and one small meteor.

## Kaki-Land

`kaki-land-continuous.png` is emitted by
`tools/art/build-kaki-land-assets.py` from the selected local Grok network
master. The deterministic conversion maps the continuous scene to the live
camera range, enforces a two-pixel grid and 64-color cap, and retains one
y=502 ocean anchor. The Last Relay remains a separate reactive atlas layer
rather than a baked second guardian. See
[`../KAKI-LAND.md`](../KAKI-LAND.md) for exact sessions, prompts, hashes,
rejections, and the privacy record.
