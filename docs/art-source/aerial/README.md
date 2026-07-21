# Vertical aerial source selection

## 2.0.1 continuity repair

The first 2.0.0 runtime masters were rejected after live review. They combined
different provider images across altitude bands and then pasted the original
384 x 80 coast strip into the center of the result. Once horizontal parallax
moved beyond that strip, the browser exposed hard rectangular joins, duplicate
horizons, and mismatched coast scale.

Version 2.0.1 uses one reviewed continuous source per condition:

| Condition | Continuous production source | Source lock |
| --- | --- | --- |
| Golden Coast | `imagegen/golden-continuous.png` | `nano/golden-2.png` |
| Twilight Glass | `imagegen/twilight-continuous.png` | `nano/twilight-2.png` |
| Stormbreak | `imagegen/storm-continuous.png` | `nano/storm-1.png` |

Each repair source was generated as an edit of the strongest coherent Nano
candidate after the Grok/Nano composites were compared in-game. The production
step now performs only a continuous vertical reframe, palette reduction, and
sharpening. It does not paste the old coast strip, splice providers, blur a
section boundary, or weld the outer columns into a grey band. The authored
horizon is placed at master y=500, which is screen y=76 for normal riding.

The exact repair prompt set is checked in beside the sources in
[`imagegen/README.md`](./imagegen/README.md).

## Original competing candidates

The browser never calls either generator. These are reviewed offline candidates; `tools/art/build-aerial-panoramas.py` is the deterministic production step that publishes the three 1536 x 640 indexed PNGs in `assets/backgrounds`.

## Candidate matrix

| Condition | Grok candidates | Vertex/Nano candidates | Selected components |
| --- | --- | --- | --- |
| Golden Coast | `grok/golden-1.jpg`, `grok/golden-2.jpg` | `nano/golden-1.png`, `nano/golden-2.png` | Grok 1 space crown and shooting-star spectacle; Nano 2 cloud, coast, and horizon continuity |
| Twilight Glass | `grok/twilight-1.jpg`, `grok/twilight-2.jpg` | `nano/twilight-1.png`, `nano/twilight-2.png` | Grok 2 upper aurora/moon/nebula; Nano 2 violet cloud and coast continuity |
| Stormbreak | `grok/storm-1.png`, `grok/storm-2.png` | `nano/storm-1.png`, `nano/storm-2.png` | Grok 2 stars and above-storm crown; Nano 1 storm interior, coast, and ocean continuity |

These candidates remain checked in as the provider comparison record. They are
not directly spliced into the repaired runtime masters.

## Grok prompts

Generated with the local `grok-gen image ... --count 2 --aspect 16:9 --mode yolo` workflow.

### Golden Coast

```text
Kaki Surf production environment source, Golden Coast vertical sky-to-space panorama, wide 16:9 master composed in four vertically continuous tiers: lower quarter preserves a warm Southern California coastline and ocean horizon with palms and peach beach haze, middle has towering peach-and-cream cloud banks with sun rays and small contrails, upper has deep cobalt atmosphere with a curved golden rim, top has a playful sparse starfield, tiny satellite and one shooting star. Neo-chibi plush pixel-art game identity, deep navy outlines, clean chunky shapes, controlled warm teal cobalt palette, clear horizontal depth, side-scrolling background only, no characters, no surfboard, no text, no logos, no UI, no mirrored repetition, no central focal object, no soft painterly mush, no photorealism. Leave safe readable open sky paths for a small rider sprite.
```

### Twilight Glass

```text
Kaki Surf production environment source, Twilight Glass vertical sky-to-space panorama, wide 16:9 master composed in four vertically continuous tiers: lower quarter preserves a violet sunset cold-water coast and luminous horizon, middle has huge violet clouds with moonlit cream-blue tops and drifting wisps, upper has indigo atmosphere with curved lavender haze and subtle aurora, top has bright crisp stars, a large moon placed off-center, faint luminous nebula and tiny satellite. Neo-chibi plush pixel-art game identity, deep navy outlines, clean chunky shapes, controlled violet indigo teal palette, clear horizontal depth, side-scrolling background only, no characters, no surfboard, no text, no logos, no UI, no mirrored repetition, no central focal object, no soft painterly mush, no photorealism. Leave safe readable open sky paths for a small rider sprite.
```

### Stormbreak

```text
Kaki Surf production environment source, Stormbreak vertical sky-to-space panorama, wide 16:9 master composed in four vertically continuous tiers: lower quarter is a dark storm coast with rain and a silver ocean horizon, middle is the interior of enormous thunderheads with a few clean lightning forks, upper emerges above glowing cold moonlit thunderhead tops into blue-black atmosphere, top has sparse stars visible above the storm with distant lightning illuminating clouds below and one tiny meteor. Neo-chibi plush pixel-art game identity, deep navy outlines, clean chunky shapes, controlled blue-black steel teal palette, clear horizontal depth, side-scrolling background only, no characters, no surfboard, no text, no logos, no UI, no mirrored repetition, no central focal object, no soft painterly mush, no photorealism. Leave safe readable open sky paths for a small rider sprite.
```

## Vertex/Nano prompts

Generated through Vertex AI with `gemini-2.5-flash-image`, two fixed-seed candidates per condition, and the existing condition menu PNG as the image reference. The common control suffix was: `The four altitude regions must read as one continuous world. Keep wide open flight corridors and distributed detail. Pixel-art production source, sharp silhouettes, no text, no characters, no surfboard, no UI, no logos, no duplicated or mirrored motifs, no photorealism, no painterly blur.`

- Golden Coast: preserve the attached coastline, horizon height, peach haze, palms, palette, chunky clusters, and deep-navy outlines; outpaint upward into peach-and-cream clouds, sun rays, cobalt atmosphere, curved gold rim, sparse stars, and a tiny satellite.
- Twilight Glass: preserve the attached violet coast and luminous cold-water horizon; outpaint upward into moonlit violet clouds, indigo atmosphere, lavender haze, aurora, bright stars, an off-center moon, nebula, and a tiny satellite.
- Stormbreak: preserve the attached dark storm coast, silver horizon, rain palette, and silhouettes; outpaint upward through thunderhead interiors and clean lightning, above glowing cold cloud tops, then into blue-black stars and a tiny meteor.

## Rebuild

```console
python3 tools/art/generate-nano-aerial.py --reference path/to/reference.png --output path/to/candidate.png --prompt "..."
python3 tools/art/build-aerial-panoramas.py
```

The first command is an authoring operation that requires an authenticated Vertex project. The second is local and deterministic once the twelve checked-in candidates exist.
