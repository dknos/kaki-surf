#!/usr/bin/env python3
"""Build compact, transparent runtime atlases from approved Grok source sheets.

The source images remain in docs/art-source/grok. This script removes the
chroma-magenta field, extracts equal-grid cells, normalizes each silhouette,
reduces the palette, and writes small local PNG atlases plus frame metadata.
"""

from __future__ import annotations

import colorsys
import hashlib
import json
from collections import deque
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
    source_columns: int | None = None
    source_rows: int | None = None
    connected_chroma: bool = False
    preserve_layout: bool = False
    source_inset: int = 0
    resample: str = "lanczos"
    sharpen: bool = True
    source_size: tuple[int, int] | None = None
    source_sha256: str | None = None


FAMILIES = (
    Family(
        source="wave-breaker-source-v2.png",
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
        source_columns=2,
        source_rows=4,
    ),
    Family(
        source="wave-progression-source-v2.png",
        output="wave-progression-atlas.png",
        columns=2,
        rows=2,
        cell=(160, 96),
        names=("swell", "pitch", "curl", "impact"),
        # The breaker advances from screen-left, so the right/bottom corner is
        # the stable runtime contact anchor for every stage.
        anchor=(1.0, 1.0),
        colors=20,
        padding=0,
        connected_chroma=True,
        preserve_layout=True,
        source_inset=16,
        resample="nearest",
        sharpen=False,
        source_size=(1280, 720),
        source_sha256="066da3c2e9466c319458502fdba299fd521371d42bf783a0784fcdb1f66f9070",
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


def remove_connected_chroma(image: Image.Image) -> Image.Image:
    """Flood-key only exterior magenta, including JPEG fringe variation.

    Generated sheets can contain intentional coral pixels with a magenta hue.
    A global hue key can erase those accents. Starting at the cell boundary and
    removing only connected chroma keeps enclosed art while clearing gradients,
    grid gutters, and compression noise around the silhouette.
    """
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pixels = list(rgba.get_flattened_data())
    candidates = bytearray(
        is_chroma_magenta(red, green, blue)
        for red, green, blue, _alpha in pixels
    )
    exterior = bytearray(width * height)
    queue: deque[int] = deque()

    def seed(x: int, y: int) -> None:
        index = y * width + x
        if candidates[index] and not exterior[index]:
            exterior[index] = 1
            queue.append(index)

    for x in range(width):
        seed(x, 0)
        seed(x, height - 1)
    for y in range(1, height - 1):
        seed(0, y)
        seed(width - 1, y)

    while queue:
        index = queue.popleft()
        x = index % width
        y = index // width
        for neighbor in (
            index - 1 if x else -1,
            index + 1 if x + 1 < width else -1,
            index - width if y else -1,
            index + width if y + 1 < height else -1,
        ):
            if neighbor >= 0 and candidates[neighbor] and not exterior[neighbor]:
                exterior[neighbor] = 1
                queue.append(neighbor)

    rgba.putdata([
        (0, 0, 0, 0) if exterior[index] else (red, green, blue, alpha)
        for index, (red, green, blue, alpha) in enumerate(pixels)
    ])
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
    source_columns = family.source_columns or family.columns
    source_rows = family.source_rows or family.rows
    column = index % source_columns
    row = index // source_columns
    left = round(source.width * column / source_columns)
    top = round(source.height * row / source_rows)
    right = round(source.width * (column + 1) / source_columns)
    bottom = round(source.height * (row + 1) / source_rows)
    source_cell = source.crop((left, top, right, bottom))
    keyed = remove_connected_chroma(source_cell) if family.connected_chroma else remove_chroma(source_cell)
    if family.foam_only:
        keyed = isolate_wave_foam(keyed)

    if family.preserve_layout:
        inset = max(0, family.source_inset)
        if inset * 2 >= keyed.width or inset * 2 >= keyed.height:
            raise ValueError(f"{family.output}: source inset exceeds cell bounds")
        subject = keyed.crop((inset, inset, keyed.width - inset, keyed.height - inset))
        resampling = Image.Resampling.NEAREST if family.resample == "nearest" else Image.Resampling.LANCZOS
        subject = subject.resize(family.cell, resampling)
        subject_alpha = subject.getchannel("A").point(lambda value: 255 if value >= 80 else 0)
        quantized = subject.convert("RGB").quantize(
            colors=family.colors,
            method=Image.Quantize.MEDIANCUT,
        ).convert("RGBA")
        quantized.putalpha(subject_alpha)
        return quantized.filter(ImageFilter.SHARPEN) if family.sharpen else quantized

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
    resampling = Image.Resampling.NEAREST if family.resample == "nearest" else Image.Resampling.LANCZOS
    subject = subject.resize(size, resampling)

    # A crisp alpha edge and a compact palette turn the large source into an
    # authored logical-pixel sprite rather than a filtered thumbnail.
    subject_alpha = subject.getchannel("A").point(lambda value: 255 if value >= 80 else 0)
    rgb = subject.convert("RGB")
    quantized = rgb.quantize(colors=family.colors, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    quantized.putalpha(subject_alpha)
    if family.sharpen:
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
    source_digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
    if family.source_sha256 and source_digest != family.source_sha256:
        raise ValueError(
            f"{family.output}: source SHA-256 {source_digest} does not match {family.source_sha256}"
        )
    source = Image.open(source_path)
    if family.source_size and source.size != family.source_size:
        raise ValueError(f"{family.output}: source size {source.size} does not match {family.source_size}")
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
        "sourceSha256": source_digest,
    }


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "version": 2,
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
