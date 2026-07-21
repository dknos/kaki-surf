#!/usr/bin/env python3
"""Build coherent aerial panoramas from one reviewed source per condition."""

from __future__ import annotations

import argparse
import hashlib
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageFilter, ImageStat


ROOT = Path(__file__).resolve().parents[2]
SIZE = (1536, 640)
HORIZON_Y = 500


@dataclass(frozen=True)
class Spec:
    slug: str
    asset_id: str
    source: str
    horizon_ratio: float
    colors: int


SPECS = (
    Spec("golden", "goldenCoast", "golden-continuous.png", 0.868, 72),
    Spec("twilight", "twilightGlass", "twilight-continuous.png", 0.906, 72),
    Spec("storm", "stormbreak", "storm-continuous.png", 0.878, 64),
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source-dir",
        type=Path,
        default=ROOT / "docs/art-source/aerial/imagegen",
    )
    parser.add_argument("--output-dir", type=Path, default=ROOT / "assets/backgrounds")
    parser.add_argument(
        "--check",
        action="store_true",
        help="validate the checked-in runtime panoramas without rewriting them",
    )
    return parser.parse_args()


def reframe_vertical_world(source: Image.Image, horizon_ratio: float) -> Image.Image:
    """Place the single authored horizon at the normal-riding camera shelf.

    The upper world is compressed more than the ocean floor so normal play sees
    the coast at y=76 while maximum altitude still reaches the star crown.
    This is one continuous source transform; no altitude plate is pasted in.
    """

    proportional_height = round(source.height * SIZE[0] / source.width)
    wide = source.resize((SIZE[0], proportional_height), Image.Resampling.LANCZOS)
    horizon = max(1, min(wide.height - 1, round(wide.height * horizon_ratio)))
    sky = wide.crop((0, 0, SIZE[0], horizon)).resize(
        (SIZE[0], HORIZON_Y),
        Image.Resampling.LANCZOS,
    )
    water = wide.crop((0, horizon, SIZE[0], wide.height)).resize(
        (SIZE[0], SIZE[1] - HORIZON_Y),
        Image.Resampling.LANCZOS,
    )
    result = Image.new("RGB", SIZE)
    result.paste(sky, (0, 0))
    result.paste(water, (0, HORIZON_Y))
    return result


def adjacent_column_difference(image: Image.Image, x1: int, x2: int) -> float:
    difference = Image.new("RGB", (1, image.height))
    first = image.crop((x1, 0, x1 + 1, image.height))
    second = image.crop((x2, 0, x2 + 1, image.height))
    difference = Image.frombytes(
        "RGB",
        difference.size,
        bytes(abs(a - b) for a, b in zip(first.tobytes(), second.tobytes())),
    )
    return sum(ImageStat.Stat(difference).mean) / 3


def validate_runtime(output: Path) -> None:
    with Image.open(output) as opened:
        image = opened.convert("RGB")
    if image.size != SIZE:
        raise RuntimeError(f"{output} has size {image.size}; expected {SIZE}")
    if output.stat().st_size >= 512 * 1024:
        raise RuntimeError(f"{output} exceeds the 512 KiB static-host budget")

    # The original defect was a 384px coast pasted into the middle of unrelated
    # art. Guard both of its old vertical boundaries against returning. The
    # actual outer wrap is allowed to introduce coastline from open ocean.
    interior = sorted(
        adjacent_column_difference(image, x - 1, x)
        for x in range(1, image.width, 8)
    )
    ordinary_high = interior[max(0, round(len(interior) * 0.95) - 1)]
    for boundary in (576, 960):
        boundary_jump = adjacent_column_difference(image, boundary - 1, boundary)
        if boundary_jump > ordinary_high * 1.8 + 3:
            raise RuntimeError(
                f"{output} has a pasted vertical plate at x={boundary}: "
                f"{boundary_jump:.2f} > {ordinary_high:.2f}"
            )


def build(spec: Spec, args: argparse.Namespace) -> Path:
    source_path = args.source_dir / spec.source
    with Image.open(source_path) as opened:
        source = opened.convert("RGB")
    master = reframe_vertical_world(source, spec.horizon_ratio)
    master = master.filter(ImageFilter.UnsharpMask(radius=0.38, percent=80, threshold=5))
    runtime = master.quantize(
        colors=spec.colors,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    output = args.output_dir / f"{spec.asset_id}-aerial.png"
    output.parent.mkdir(parents=True, exist_ok=True)
    runtime.save(output, optimize=True, compress_level=9)
    validate_runtime(output)
    return output


def main() -> int:
    args = parse_args()
    for spec in SPECS:
        output = args.output_dir / f"{spec.asset_id}-aerial.png"
        if not args.check:
            output = build(spec, args)
        validate_runtime(output)
        digest = hashlib.sha256(output.read_bytes()).hexdigest()[:12]
        with Image.open(output) as image:
            colors = len(image.convert("RGB").getcolors(image.width * image.height) or [])
        print(
            f"{output.relative_to(ROOT)} {SIZE[0]}x{SIZE[1]} "
            f"{colors} colors {output.stat().st_size} bytes sha256:{digest}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
