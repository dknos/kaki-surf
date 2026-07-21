#!/usr/bin/env python3
"""Stitch selected Nano/Grok aerial plates into compact seamless runtime panoramas."""

from __future__ import annotations

import argparse
import hashlib
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageColor, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
SIZE = (1536, 640)
COAST_TOP = 424
COAST_HEIGHT = 80
OVERLAP = 96
EDGE_BLEND = 72
BAYER_4 = (
    (0, 8, 2, 10),
    (12, 4, 14, 6),
    (3, 11, 1, 9),
    (15, 7, 13, 5),
)


@dataclass(frozen=True)
class Spec:
    slug: str
    asset_id: str
    nano: str
    grok: str
    boundary: int
    palette: tuple[str, ...]


SPECS = (
    Spec(
        "golden", "goldenCoast", "golden-2.png", "golden-1.jpg", 160,
        (
            "#07142c", "#0c2342", "#12375b", "#174c75", "#1c648d", "#267fa1",
            "#3599ae", "#52b2b6", "#84cbc0", "#bce0c8", "#f4efd0", "#fff4c2",
            "#ffe39d", "#ffc879", "#eca260", "#cf7c58", "#a85b55", "#704956",
            "#403c58", "#252d50", "#153456", "#31506b", "#5d7180", "#8d9290",
            "#c5b797", "#efd39e", "#fff0c0", "#173d46", "#22605b", "#358269",
            "#57a77d", "#8cc492", "#c5d5a0", "#fff9dc", "#0d1025", "#f7f2d7",
        ),
    ),
    Spec(
        "twilight", "twilightGlass", "twilight-2.png", "twilight-2.jpg", 350,
        (
            "#070b21", "#0c1335", "#121c4d", "#1b2868", "#29377d", "#3c468e",
            "#554f9c", "#704fa2", "#8a54a4", "#a75e9e", "#c6739c", "#e18f9e",
            "#f4ae9e", "#ffd39e", "#ffe8b3", "#e8e8ff", "#b9d8ff", "#83bad7",
            "#51a3bd", "#3087a7", "#1d688e", "#144b73", "#0d345b", "#092442",
            "#213158", "#39416b", "#5b4f78", "#7c5e88", "#9e789b", "#c5a1b2",
            "#d7d0ea", "#88e4d6", "#5bc9c7", "#3fa3b4", "#0b1630", "#eef9f4",
        ),
    ),
    Spec(
        "storm", "stormbreak", "storm-1.png", "storm-2.png", 350,
        (
            "#030814", "#07101e", "#0b192a", "#102438", "#173247", "#214157",
            "#2e5267", "#3d6478", "#52798a", "#6d909c", "#8da9ae", "#b1c4c2",
            "#d4ded4", "#f0edd7", "#19313d", "#234451", "#2f5a64", "#3d7074",
            "#508687", "#6c9d98", "#94b5aa", "#c1d0bc", "#183045", "#29405d",
            "#3e5274", "#59668b", "#777c9e", "#9d9db4", "#d3d4d6", "#f1f3e8",
            "#542f51", "#70406b", "#8d5c8b", "#b589aa", "#060b14", "#e4f7ef",
        ),
    ),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--nano-dir", type=Path, default=ROOT / "docs/art-source/aerial/nano")
    parser.add_argument("--grok-dir", type=Path, default=ROOT / "docs/art-source/aerial/grok")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets/backgrounds")
    return parser.parse_args()


def cover(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    # Keep both the star crown and coast floor. A cover crop would discard one
    # of the authored vertical endpoints when converting 16:9 candidates into
    # the wider 12:5 runtime master.
    return image.resize(size, Image.Resampling.LANCZOS)


def ordered_section_stitch(upper: Image.Image, lower: Image.Image, boundary: int) -> Image.Image:
    result = upper.copy()
    start = boundary - OVERLAP // 2
    end = boundary + OVERLAP // 2
    result.paste(lower.crop((0, end, SIZE[0], SIZE[1])), (0, end))
    upper_pixels = upper.load()
    lower_pixels = lower.load()
    pixels = result.load()
    for y in range(start, end):
        progress = (y - start) / max(1, end - start - 1)
        for x in range(SIZE[0]):
            threshold = (BAYER_4[y % 4][x % 4] + 0.5) / 16
            pixels[x, y] = lower_pixels[x, y] if progress >= threshold else upper_pixels[x, y]
    return result


def preserve_existing_coast(master: Image.Image, strip_path: Path) -> None:
    strip = Image.open(strip_path).convert("RGB")
    left = (SIZE[0] - strip.width) // 2
    base = master.copy()
    master.paste(strip, (left, COAST_TOP))
    # A short ordered-dither shoulder welds the locked 384x80 coast to the
    # selected outpainting without blurring its original pixel clusters.
    pixels = master.load()
    base_pixels = base.load()
    strip_pixels = strip.load()
    shoulder = 20
    for y in range(strip.height):
        for edge in range(shoulder):
            progress = edge / shoulder
            threshold = (BAYER_4[y % 4][edge % 4] + 0.5) / 16
            if progress < threshold:
                pixels[left + edge, COAST_TOP + y] = base_pixels[left + edge, COAST_TOP + y]
                pixels[left + strip.width - 1 - edge, COAST_TOP + y] = base_pixels[
                    left + strip.width - 1 - edge,
                    COAST_TOP + y,
                ]


def weld_horizontal_edges(master: Image.Image) -> None:
    source = master.copy()
    src = source.load()
    dst = master.load()
    for y in range(SIZE[1]):
        seam = tuple(round((a + b) * 0.5) for a, b in zip(src[0, y], src[SIZE[0] - 1, y]))
        dst[0, y] = seam
        dst[SIZE[0] - 1, y] = seam
        for distance in range(1, EDGE_BLEND):
            progress = distance / EDGE_BLEND
            threshold = (BAYER_4[y % 4][distance % 4] + 0.5) / 16
            dst[distance, y] = src[distance, y] if progress >= threshold else seam
            dst[SIZE[0] - 1 - distance, y] = (
                src[SIZE[0] - 1 - distance, y] if progress >= threshold else seam
            )


def palette_image(colors: tuple[str, ...]) -> Image.Image:
    rgb = [ImageColor.getrgb(color) for color in colors]
    rgb += [rgb[-1]] * (256 - len(rgb))
    palette = Image.new("P", (1, 1))
    palette.putpalette([channel for color in rgb for channel in color])
    return palette


def build(spec: Spec, args: argparse.Namespace) -> Path:
    with Image.open(args.nano_dir / spec.nano) as nano_source:
        lower = cover(nano_source.convert("RGB"), SIZE)
    with Image.open(args.grok_dir / spec.grok) as grok_source:
        upper = cover(grok_source.convert("RGB"), SIZE)
    master = ordered_section_stitch(upper, lower, spec.boundary)
    preserve_existing_coast(master, ROOT / "assets/backgrounds" / f"{spec.asset_id}-strip.png")
    weld_horizontal_edges(master)
    master = master.filter(ImageFilter.UnsharpMask(radius=0.45, percent=105, threshold=5))
    runtime = master.quantize(palette=palette_image(spec.palette), dither=Image.Dither.NONE)
    output = args.output_dir / f"{spec.asset_id}-aerial.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    runtime.save(output, optimize=True, compress_level=9)
    with Image.open(output) as verified:
        verified = verified.convert("RGB")
        if verified.size != SIZE:
            raise RuntimeError(f"{output} has size {verified.size}; expected {SIZE}")
        if list(verified.crop((0, 0, 1, SIZE[1])).get_flattened_data()) != list(
            verified.crop((SIZE[0] - 1, 0, SIZE[0], SIZE[1])).get_flattened_data()
        ):
            raise RuntimeError(f"{output} horizontal loop edges do not match")
    return output


def main() -> int:
    args = parse_args()
    for spec in SPECS:
        output = build(spec, args)
        digest = hashlib.sha256(output.read_bytes()).hexdigest()[:12]
        with Image.open(output) as image:
            colors = len(image.convert("RGB").getcolors(image.width * image.height) or [])
        print(f"{output.relative_to(ROOT)} {SIZE[0]}x{SIZE[1]} {colors} colors {output.stat().st_size} bytes sha256:{digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
