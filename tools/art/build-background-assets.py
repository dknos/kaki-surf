#!/usr/bin/env python3
"""Build compact, palette-controlled Kaki Surf condition backgrounds.

The supplied generated images are offline source art. This script performs the
repeatable production step: focal cropping, high-quality reduction, restrained
sharpening, fixed-palette quantization without dithering, and optimized PNG
output. Runtime code consumes only the files written to assets/backgrounds.
"""

from __future__ import annotations

import argparse
import hashlib
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageColor, ImageFilter, ImageOps


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_DIR = REPO_ROOT / "assets" / "backgrounds"

DEFAULT_SOURCES = {
    "golden-coast": Path(
        r"C:\Users\rneeb\.codex\generated_images\019f7b10-3423-7b90-b122-1dd953289eeb"
        r"\exec-c3c593d2-e3a1-45a5-8c71-8effcac7cf08.png"
    ),
    "twilight-glass": Path(
        r"C:\Users\rneeb\.codex\generated_images\019f7b10-3423-7b90-b122-1dd953289eeb"
        r"\exec-53020920-5c15-482e-b8af-ff2572f7d65c.png"
    ),
    "stormbreak": Path(
        r"C:\Users\rneeb\.codex\generated_images\019f7b10-3423-7b90-b122-1dd953289eeb"
        r"\exec-70dbd373-248e-45bb-b3ff-ff7b82d828bd.png"
    ),
}


@dataclass(frozen=True)
class ConditionSpec:
    slug: str
    asset_id: str
    strip_top: float
    palette: tuple[str, ...]


CONDITIONS = (
    ConditionSpec(
        slug="golden-coast",
        asset_id="goldenCoast",
        strip_top=0.205,
        palette=(
            "#0a1c35", "#142d4b", "#203e59", "#354c5b",
            "#514e54", "#735659", "#965f59", "#b96f5d",
            "#d98967", "#eca86f", "#f7c27c", "#ffd68a",
            "#ffe69a", "#fff0b1", "#e8d48d", "#c8ca91",
            "#a6c39a", "#7cbd99", "#51b99c", "#2da696",
            "#148f8d", "#107d85", "#0e6d7c", "#0d5d71",
            "#0b4d64", "#174449", "#28574c", "#426b53",
            "#64825e", "#9b7b72", "#c39a82", "#fff5d2",
        ),
    ),
    ConditionSpec(
        slug="twilight-glass",
        asset_id="twilightGlass",
        strip_top=0.190,
        palette=(
            "#080e29", "#0e163a", "#111b48", "#16245a",
            "#1c2c69", "#23357b", "#2d3e8a", "#3c4a98",
            "#4c4b9f", "#5a4598", "#68448f", "#784987",
            "#8b5088", "#a35d89", "#bd718e", "#d78a94",
            "#eeaa99", "#f7c99b", "#ffdda2", "#dfe8ff",
            "#061f3d", "#033150", "#043c61", "#06486e",
            "#09547b", "#12628a", "#1e7097", "#317fa3",
            "#4b8daa", "#24284a", "#40365b", "#5b4468",
        ),
    ),
    ConditionSpec(
        slug="stormbreak",
        asset_id="stormbreak",
        strip_top=0.115,
        palette=(
            "#03121c", "#061b27", "#092632", "#0d323e",
            "#123e49", "#174a54", "#1d575f", "#27666c",
            "#32757a", "#43858a", "#5a979a", "#78aaac",
            "#9bbdbc", "#c0d2cf", "#dfe8df", "#f2eed6",
            "#192c3a", "#203947", "#294858", "#355768",
            "#466a79", "#5a7e89", "#75969f", "#042b38",
            "#063744", "#07444f", "#09515a", "#4e3f3b",
            "#6a5146", "#896953", "#ad876a", "#d0ad87",
        ),
    ),
)

MENU_SIZE = (768, 432)
STRIP_SIZE = (384, 80)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--golden", type=Path, default=DEFAULT_SOURCES["golden-coast"])
    parser.add_argument("--twilight", type=Path, default=DEFAULT_SOURCES["twilight-glass"])
    parser.add_argument("--storm", type=Path, default=DEFAULT_SOURCES["stormbreak"])
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    return parser.parse_args()


def cover_crop(image: Image.Image, target_size: tuple[int, int]) -> Image.Image:
    """Crop around center to the requested aspect ratio without stretching."""
    target_ratio = target_size[0] / target_size[1]
    source_ratio = image.width / image.height
    if source_ratio > target_ratio:
        width = round(image.height * target_ratio)
        left = (image.width - width) // 2
        box = (left, 0, left + width, image.height)
    else:
        height = round(image.width / target_ratio)
        top = (image.height - height) // 2
        box = (0, top, image.width, top + height)
    return image.crop(box)


def strip_crop(image: Image.Image, top_fraction: float) -> Image.Image:
    """Extract a wide scenic band that leaves the gameplay wave unobstructed."""
    crop_height = round(image.width / (STRIP_SIZE[0] / STRIP_SIZE[1]))
    max_top = image.height - crop_height
    top = min(max(round(image.height * top_fraction), 0), max_top)
    return image.crop((0, top, image.width, top + crop_height))


def palette_image(hex_colors: tuple[str, ...]) -> Image.Image:
    colors = [ImageColor.getrgb(color) for color in hex_colors]
    padded = colors + [colors[-1]] * (256 - len(colors))
    palette = Image.new("P", (1, 1))
    palette.putpalette([channel for color in padded for channel in color])
    return palette


def reduce_to_palette(
    image: Image.Image,
    target_size: tuple[int, int],
    hex_colors: tuple[str, ...],
) -> Image.Image:
    """Downsample cleanly, restore edge definition, and apply a fixed palette."""
    reduced = ImageOps.fit(
        image.convert("RGB"),
        target_size,
        method=Image.Resampling.LANCZOS,
        centering=(0.5, 0.5),
    )
    reduced = reduced.filter(ImageFilter.UnsharpMask(radius=0.55, percent=120, threshold=4))
    return reduced.quantize(
        palette=palette_image(hex_colors),
        dither=Image.Dither.NONE,
    )


def save_optimized(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, format="PNG", optimize=True, compress_level=9)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def unique_rgb_count(path: Path) -> int:
    with Image.open(path) as image:
        colors = image.convert("RGB").getcolors(maxcolors=image.width * image.height)
        if colors is None:
            raise RuntimeError(f"Could not count colors in {path}")
        return len(colors)


def build_condition(spec: ConditionSpec, source_path: Path, output_dir: Path) -> list[Path]:
    if not source_path.is_file():
        raise FileNotFoundError(f"Missing source image: {source_path}")

    with Image.open(source_path) as source:
        source.load()
        source = source.convert("RGB")
        menu = reduce_to_palette(cover_crop(source, MENU_SIZE), MENU_SIZE, spec.palette)
        strip = reduce_to_palette(strip_crop(source, spec.strip_top), STRIP_SIZE, spec.palette)

    menu_path = output_dir / f"{spec.asset_id}-menu.png"
    strip_path = output_dir / f"{spec.asset_id}-strip.png"
    save_optimized(menu, menu_path)
    save_optimized(strip, strip_path)
    return [menu_path, strip_path]


def verify(path: Path) -> tuple[tuple[int, int], str, int, int]:
    expected = STRIP_SIZE if path.stem.endswith("-strip") else MENU_SIZE
    with Image.open(path) as image:
        image.verify()
    with Image.open(path) as image:
        if image.size != expected:
            raise RuntimeError(f"{path} has size {image.size}; expected {expected}")
        if image.mode != "P":
            raise RuntimeError(f"{path} has mode {image.mode}; expected palette mode P")
    colors = unique_rgb_count(path)
    if colors > 32:
        raise RuntimeError(f"{path} uses {colors} colors; expected at most 32")
    return expected, sha256(path), colors, path.stat().st_size


def main() -> int:
    args = parse_args()
    sources = {
        "golden-coast": args.golden.resolve(),
        "twilight-glass": args.twilight.resolve(),
        "stormbreak": args.storm.resolve(),
    }
    output_dir = args.output_dir.resolve()
    built: list[Path] = []

    for spec in CONDITIONS:
        built.extend(build_condition(spec, sources[spec.slug], output_dir))

    print("Built Kaki Surf condition backgrounds:")
    for path in built:
        size, digest, colors, byte_count = verify(path)
        relative = path.relative_to(REPO_ROOT) if path.is_relative_to(REPO_ROOT) else path
        print(
            f"  {relative} {size[0]}x{size[1]} P/{colors} colors "
            f"{byte_count} bytes sha256={digest}"
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
