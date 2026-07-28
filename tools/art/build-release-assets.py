#!/usr/bin/env python3
"""Build deterministic install icons and the Kaki Surf social card."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
ICON_DIR = ROOT / "assets" / "icons"
SOCIAL_DIR = ROOT / "assets" / "social"
SOCIAL_SOURCE = ROOT / "docs" / "images" / "qa" / "neutral.png"
MONO_BOLD = Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf")

INK = "#17172b"
DEEP_INK = "#0d1025"
PANEL = "#214c6b"
WATER = "#70c1d4"
FOAM = "#f7f2d7"
FOAM_SHADOW = "#9dd9c8"
GOLD = "#ffd166"
CORAL = "#ed6a5a"


def build_pixel_mark() -> Image.Image:
    image = Image.new("RGB", (32, 32), INK)
    draw = ImageDraw.Draw(image)
    draw.rectangle((2, 2, 29, 29), fill=PANEL)
    draw.polygon(
        (
            (2, 21), (9, 21), (9, 18), (14, 18), (14, 15), (21, 15),
            (21, 18), (25, 18), (25, 21), (30, 21), (30, 30), (2, 30),
        ),
        fill=WATER,
    )
    draw.polygon(
        (
            (2, 20), (9, 20), (9, 17), (14, 17), (14, 14), (21, 14),
            (21, 17), (26, 17), (26, 20), (30, 20), (30, 23), (23, 23),
            (23, 21), (18, 21), (18, 23), (11, 23), (11, 21), (2, 21),
        ),
        fill=FOAM,
    )
    # The compact angular K is the same code-authored mark as favicon.svg.
    draw.rectangle((8, 6, 11, 24), fill=GOLD)
    draw.rectangle((12, 13, 15, 20), fill=GOLD)
    draw.rectangle((15, 10, 18, 16), fill=GOLD)
    draw.rectangle((19, 6, 23, 9), fill=GOLD)
    draw.rectangle((16, 17, 19, 21), fill=GOLD)
    draw.rectangle((20, 21, 24, 24), fill=GOLD)
    return image


def centered_mark(size: int, mark_size: int) -> Image.Image:
    image = Image.new("RGB", (size, size), INK)
    mark = build_pixel_mark().resize((mark_size, mark_size), Image.Resampling.NEAREST)
    offset = (size - mark_size) // 2
    image.paste(mark, (offset, offset))
    return image


def build_social_card() -> Image.Image:
    source = Image.open(SOCIAL_SOURCE).convert("RGB")
    if source.size != (1280, 720):
        raise ValueError(f"Expected a 1280x720 gameplay capture, received {source.size}")
    card = source.crop((40, 45, 1240, 675))
    overlay = Image.new("RGBA", card.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # One disciplined title rail hides the gameplay HUD while leaving the
    # authored breaking edge and airborne rider as the card's main image.
    draw.rectangle((0, 0, 1199, 157), fill=(13, 16, 37, 255))
    draw.rectangle((0, 157, 1199, 164), fill=(23, 23, 43, 255))
    for x in range(0, 1200, 96):
        draw.rectangle((x, 157, min(1199, x + 62), 160), fill=(157, 217, 200, 255))
    draw.rectangle((0, 161, 1199, 164), fill=(255, 209, 102, 255))
    draw.rectangle((42, 20, 332, 121), fill=(255, 209, 102, 255))
    draw.rectangle((42, 121, 296, 131), fill=(255, 209, 102, 255))

    title_font = ImageFont.truetype(str(MONO_BOLD), 86)
    utility_font = ImageFont.truetype(str(MONO_BOLD), 23)
    tagline_font = ImageFont.truetype(str(MONO_BOLD), 28)
    kaki_x, title_y = 58, 23
    draw.text(
        (kaki_x, title_y),
        "KAKI",
        font=title_font,
        fill=FOAM,
        stroke_width=5,
        stroke_fill=INK,
    )
    kaki_width = draw.textbbox((kaki_x, title_y), "KAKI", font=title_font, stroke_width=5)[2] - kaki_x
    draw.text(
        (kaki_x + kaki_width + 14, title_y),
        "SURF",
        font=title_font,
        fill=CORAL,
        stroke_width=5,
        stroke_fill=INK,
    )
    draw.text((59, 126), "CHASE THE HORIZON", font=tagline_font, fill=FOAM_SHADOW)
    label = "PLUSH POCKET ARCADE"
    label_box = draw.textbbox((0, 0), label, font=utility_font)
    draw.text((1160 - (label_box[2] - label_box[0]), 36), label, font=utility_font, fill=GOLD)
    draw.text((858, 79), "DROP · LAUNCH · LAND", font=utility_font, fill=FOAM)

    card = Image.alpha_composite(card.convert("RGBA"), overlay).convert("RGB")
    # A restrained palette keeps the download compact and protects the
    # capture's deliberate pixel clusters.
    return card.quantize(colors=128, method=Image.Quantize.MEDIANCUT).convert("RGB")


def outputs() -> dict[Path, Image.Image]:
    return {
        ICON_DIR / "icon-192.png": centered_mark(192, 192),
        ICON_DIR / "icon-512.png": centered_mark(512, 512),
        ICON_DIR / "icon-maskable-512.png": centered_mark(512, 384),
        ICON_DIR / "apple-touch-icon.png": centered_mark(180, 160),
        SOCIAL_DIR / "kaki-surf-social-card.png": build_social_card(),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="verify checked-in outputs")
    args = parser.parse_args()

    generated = outputs()
    if args.check:
        for destination, expected in generated.items():
            if not destination.is_file():
                raise FileNotFoundError(destination)
            actual = Image.open(destination).convert("RGB")
            if actual.size != expected.size:
                raise ValueError(f"{destination}: expected {expected.size}, received {actual.size}")
            if actual.tobytes() != expected.convert("RGB").tobytes():
                raise ValueError(f"{destination}: checked-in pixels are stale")
        return

    ICON_DIR.mkdir(parents=True, exist_ok=True)
    SOCIAL_DIR.mkdir(parents=True, exist_ok=True)
    for destination, image in generated.items():
        image.save(destination, format="PNG", optimize=True)
        print(f"{destination.relative_to(ROOT)} {image.width}x{image.height} {destination.stat().st_size} bytes")


if __name__ == "__main__":
    main()
