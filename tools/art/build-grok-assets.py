#!/usr/bin/env python3
"""Build compact, transparent runtime atlases from approved Grok source sheets.

The source images remain in docs/art-source/grok. This script removes the
chroma-magenta field, extracts equal-grid cells, normalizes each silhouette,
reduces the palette, and writes small local PNG atlases plus frame metadata.
"""

from __future__ import annotations

import colorsys
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
SOURCE_DIR = ROOT / "docs" / "art-source" / "grok"
OUTPUT_DIR = ROOT / "assets" / "generated"


@dataclass(frozen=True)
class Family:
    source: str
    output: str
    columns: int
    rows: int
    cell: tuple[int, int]
    names: tuple[str, ...]
    anchor: tuple[float, float]
    colors: int = 28
    padding: int = 2
    foam_only: bool = False


FAMILIES = (
    Family(
        source="wave-breaker-source.jpg",
        output="wave-breaker-atlas.png",
        columns=4,
        rows=2,
        cell=(72, 64),
        names=(
            "crestFeatherA",
            "crestFeatherB",
            "risingCurl",
            "impact",
            "whitewaterChurn",
            "foamTendrils",
            "sprayBurst",
            "seaMist",
        ),
        anchor=(0.5, 1.0),
        colors=30,
        padding=4,
        foam_only=True,
    ),
    Family(
        source="dolphin-source.png",
        output="dolphin-atlas.png",
        columns=4,
        rows=2,
        cell=(56, 40),
        names=(
            "approach",
            "offer",
            "mountedGlide",
            "compress",
            "breach",
            "corkscrew",
            "tailSlap",
            "dismount",
        ),
        anchor=(0.5, 0.78),
        colors=24,
        padding=2,
    ),
    Family(
        source="shark-source.png",
        output="shark-atlas.png",
        columns=4,
        rows=2,
        cell=(56, 36),
        names=(
            "deepShadow",
            "finTelegraph",
            "closeFin",
            "crossing",
            "jumpUnder",
            "nearMiss",
            "comicSplash",
            "retreat",
        ),
        anchor=(0.5, 0.76),
        colors=22,
        padding=2,
    ),
    Family(
        source="whale-source.png",
        output="whale-atlas.png",
        columns=4,
        rows=2,
        cell=(88, 54),
        names=(
            "distantShadow",
            "blowTelegraph",
            "swellLift",
            "breachAnticipation",
            "breach",
            "rideableBack",
            "giantSplash",
            "departure",
        ),
        anchor=(0.5, 0.84),
        colors=26,
        padding=2,
    ),
    Family(
        source="birds-source.png",
        output="birds-atlas.png",
        columns=4,
        rows=2,
        cell=(34, 24),
        names=(
            "gullGlide",
            "gullFlap",
            "pelicanSkim",
            "pelicanCourier",
            "ternBank",
            "cormorantDive",
            "flock",
            "scatter",
        ),
        anchor=(0.5, 0.55),
        colors=22,
        padding=1,
    ),
    Family(
        source="boats-source.png",
        output="boats-atlas.png",
        columns=4,
        rows=2,
        cell=(64, 34),
        names=(
            "sailboat",
            "speedboat",
            "fishingBoat",
            "tugboat",
            "cargoShip",
            "jetSki",
            "rescueCraft",
            "escortBoat",
        ),
        anchor=(0.5, 0.82),
        colors=26,
        padding=1,
    ),
    Family(
        source="air-traffic-source.jpg",
        output="air-traffic-atlas.png",
        columns=4,
        rows=2,
        cell=(72, 32),
        names=(
            "propPlane",
            "seaplane",
            "helicopter",
            "fastPlane",
            "bannerPlane",
            "parachuteDrop",
            "airshowFormation",
            "launchClimb",
        ),
        anchor=(0.5, 0.52),
        colors=24,
        padding=1,
    ),
    Family(
        source="powerups-source.png",
        output="powerups-atlas.png",
        columns=4,
        rows=2,
        cell=(24, 24),
        names=(
            "mangoRush",
            "moonPop",
            "starFoam",
            "dolphinCall",
            "mangoHalo",
            "moonHalo",
            "starHalo",
            "pickupBurst",
        ),
        anchor=(0.5, 0.5),
        colors=22,
        padding=1,
    ),
    Family(
        source="boards-source.png",
        output="boards-atlas.png",
        columns=4,
        rows=3,
        cell=(64, 24),
        names=(
            "foamPuffTop",
            "foamPuffRail",
            "foamPuffFlexConcept",
            "foamPuffUnderside",
            "mangoFishTop",
            "mangoFishRail",
            "mangoFishFlexConcept",
            "mangoFishUnderside",
            "moonLogTop",
            "moonLogRail",
            "moonLogFlexConcept",
            "moonLogUnderside",
        ),
        anchor=(0.5, 0.62),
        colors=26,
        padding=1,
    ),
    Family(
        source="carrier-source.png",
        output="carrier-atlas.png",
        columns=4,
        rows=2,
        cell=(96, 50),
        names=(
            "hazeSilhouette",
            "festivalCarrier",
            "islandLights",
            "radarDish",
            "deckCrew",
            "deckAircraft",
            "escortVessel",
            "layeredWake",
        ),
        anchor=(0.5, 0.82),
        colors=26,
        padding=1,
    ),
    Family(
        source="ui-ornaments-source-v2.png",
        output="ui-ornaments-atlas.png",
        columns=4,
        rows=2,
        cell=(80, 52),
        names=(
            "titleCrest",
            "foamPuffEmblem",
            "mangoFishEmblem",
            "moonLogEmblem",
            "simpleControlsGlyph",
            "blankRibbon",
            "wildlifeSpecialBadge",
            "resultsMedallion",
        ),
        anchor=(0.5, 0.5),
        colors=28,
        padding=1,
    ),
)


def is_chroma_magenta(red: int, green: int, blue: int) -> bool:
    """Identify the generated background while preserving coral accents."""
    hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    return value > 0.28 and saturation > 0.28 and 0.82 <= hue <= 0.98


def remove_chroma(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    pixels = list(rgba.get_flattened_data())
    cleaned: list[tuple[int, int, int, int]] = []
    for red, green, blue, _alpha in pixels:
        if is_chroma_magenta(red, green, blue):
            cleaned.append((0, 0, 0, 0))
        else:
            cleaned.append((red, green, blue, 255))
    rgba.putdata(cleaned)
    return rgba


def isolate_wave_foam(image: Image.Image) -> Image.Image:
    """Keep organic foam and its nearby ink while dropping rectangular water fill."""
    rgba = image.convert("RGBA")
    pixels = list(rgba.get_flattened_data())
    foam_core: list[int] = []
    for red, green, blue, alpha in pixels:
        if not alpha:
            foam_core.append(0)
            continue
        _hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        foam_core.append(255 if value >= 0.58 and saturation <= 0.34 else 0)

    core_mask = Image.new("L", rgba.size, 0)
    core_mask.putdata(foam_core)
    nearby_mask = core_mask.filter(ImageFilter.MaxFilter(9))
    nearby = list(nearby_mask.get_flattened_data())

    isolated: list[tuple[int, int, int, int]] = []
    for (red, green, blue, alpha), core, close_to_foam in zip(pixels, foam_core, nearby):
        if not alpha or not close_to_foam:
            isolated.append((0, 0, 0, 0))
            continue
        _hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
        keep_edge = value <= 0.36 or saturation <= 0.55
        isolated.append((red, green, blue, 255 if core or keep_edge else 0))

    rgba.putdata(isolated)
    return rgba


def extract_cell(source: Image.Image, family: Family, index: int) -> Image.Image:
    column = index % family.columns
    row = index // family.columns
    left = round(source.width * column / family.columns)
    top = round(source.height * row / family.rows)
    right = round(source.width * (column + 1) / family.columns)
    bottom = round(source.height * (row + 1) / family.rows)
    keyed = remove_chroma(source.crop((left, top, right, bottom)))
    if family.foam_only:
        keyed = isolate_wave_foam(keyed)
    alpha = keyed.getchannel("A")
    bounds = alpha.getbbox()
    if not bounds:
        return Image.new("RGBA", family.cell, (0, 0, 0, 0))

    subject = keyed.crop(bounds)
    target_width = max(1, family.cell[0] - family.padding * 2)
    target_height = max(1, family.cell[1] - family.padding * 2)
    scale = min(target_width / subject.width, target_height / subject.height)
    size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.resize(size, Image.Resampling.LANCZOS)

    # A crisp alpha edge and a compact palette turn the large source into an
    # authored logical-pixel sprite rather than a filtered thumbnail.
    subject_alpha = subject.getchannel("A").point(lambda value: 255 if value >= 80 else 0)
    rgb = subject.convert("RGB")
    quantized = rgb.quantize(colors=family.colors, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    quantized.putalpha(subject_alpha)
    quantized = quantized.filter(ImageFilter.SHARPEN)

    cell = Image.new("RGBA", family.cell, (0, 0, 0, 0))
    x = (family.cell[0] - quantized.width) // 2
    y = family.cell[1] - family.padding - quantized.height
    cell.alpha_composite(quantized, (x, y))
    return cell


def build_family(family: Family) -> dict[str, object]:
    source_path = SOURCE_DIR / family.source
    if not source_path.is_file():
        raise FileNotFoundError(source_path)
    source = Image.open(source_path)
    expected = family.columns * family.rows
    if len(family.names) != expected:
        raise ValueError(f"{family.output}: expected {expected} frame names")

    atlas = Image.new(
        "RGBA",
        (family.columns * family.cell[0], family.rows * family.cell[1]),
        (0, 0, 0, 0),
    )
    frames: dict[str, object] = {}
    for index, name in enumerate(family.names):
        cell = extract_cell(source, family, index)
        x = (index % family.columns) * family.cell[0]
        y = (index // family.columns) * family.cell[1]
        atlas.alpha_composite(cell, (x, y))
        frames[name] = {
            "x": x,
            "y": y,
            "width": family.cell[0],
            "height": family.cell[1],
            "anchor": list(family.anchor),
        }

    output_path = OUTPUT_DIR / family.output
    atlas.save(output_path, optimize=True)
    return {
        "image": family.output,
        "width": atlas.width,
        "height": atlas.height,
        "frames": frames,
        "source": f"docs/art-source/grok/{family.source}",
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": 1,
        "generator": "tools/art/build-grok-assets.py",
        "families": {},
    }
    for family in FAMILIES:
        manifest["families"][Path(family.output).stem] = build_family(family)

    manifest_path = OUTPUT_DIR / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(FAMILIES)} Grok atlas families in {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
