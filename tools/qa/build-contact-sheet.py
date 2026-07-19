#!/usr/bin/env python3
"""Normalize browser QA captures and rebuild the visual contact sheet."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[2]
QA_DIR = ROOT / "docs" / "images" / "qa"
SHEET_PATH = ROOT / "docs" / "images" / "qa-contact-sheet.png"

SCENES = (
    ("menu", "Updated menu — three boards"),
    ("results", "Results breakdown"),
    ("neutral", "Neutral riding"),
    ("powerLine", "Power-line momentum charge"),
    ("maxSpeed", "Seam-earned max speed"),
    ("pumpCompression", "Pump compression"),
    ("pumpRelease", "Pump release"),
    ("snap", "Snap / slash"),
    ("cutback", "Cutback / layback"),
    ("floater", "Floater / re-entry"),
    ("tubeTuck", "Tube tuck / soul arch"),
    ("launch", "Lip launch"),
    ("frontRail", "Front Rail Grab"),
    ("tailGrab", "Tail Grab"),
    ("varial", "Board Varial"),
    ("kakiTwist", "Kaki Twist"),
    ("combo360", "360 Tail Grab + Varial"),
    ("combo540", "Perfect 540 Varial"),
    ("perfectLanding", "Perfect landing"),
    ("wobble", "Wobble recovery"),
    ("wipeout", "Affectionate wipeout"),
    ("touch", "Touch trick diamond"),
    ("highContrast", "High-contrast presentation"),
    ("goldenCoast", "Condition — Golden Coast"),
    ("twilightGlass", "Condition — Twilight Glass"),
    ("stormbreak", "Condition — Stormbreak"),
)

BACKGROUND = "#0d0f24"
CARD = "#121b31"
BORDER = "#294d65"
TEXT = "#f7f2d7"
MUTED = "#9dd9c8"
ACCENT = "#ffd166"


def load_font(size: int, *, bold: bool = False) -> ImageFont.ImageFont:
    candidates = (
        Path("C:/Windows/Fonts/consolab.ttf" if bold else "C:/Windows/Fonts/consola.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"),
    )
    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), size=size)
    return ImageFont.load_default()


def normalize_capture(path: Path) -> Image.Image:
    image = Image.open(path).convert("RGB")

    # Chrome's screenshot bridge reports the DPR-scaled surface while this
    # environment paints the CSS viewport in its upper-left quadrant.
    viewport = image if image.size == (1280, 720) else image.crop(
        (0, 0, max(1, image.width // 2), max(1, image.height // 2))
    )
    if viewport.size == (1280, 720):
        normalized = viewport
    else:
        fitted = ImageOps.contain(viewport, (1280, 720), method=Image.Resampling.NEAREST)
        normalized = Image.new("RGB", (1280, 720), BACKGROUND)
        normalized.paste(fitted, ((1280 - fitted.width) // 2, (720 - fitted.height) // 2))

    save_indexed(normalized, path)
    return normalized


def save_indexed(image: Image.Image, path: Path) -> None:
    indexed = image.quantize(
        colors=128,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    indexed.save(path, optimize=True)


def build_sheet(captures: dict[str, Image.Image]) -> Image.Image:
    width = 1200
    columns = 3
    outer = 24
    gap = 14
    header_height = 104
    card_width = (width - outer * 2 - gap * (columns - 1)) // columns
    image_width = card_width - 12
    image_height = round(image_width * 9 / 16)
    label_height = 34
    card_height = image_height + label_height + 12
    rows = (len(SCENES) + columns - 1) // columns
    height = header_height + rows * card_height + (rows - 1) * gap + outer

    sheet = Image.new("RGB", (width, height), BACKGROUND)
    draw = ImageDraw.Draw(sheet)
    title_font = load_font(30, bold=True)
    subtitle_font = load_font(15)
    label_font = load_font(15, bold=True)

    draw.text((outer, 20), "KAKI SURF — PRODUCTION QA", fill=TEXT, font=title_font)
    draw.text(
        (outer, 62),
        "26 states • power-line momentum • authored condition art • 49 tests",
        fill=MUTED,
        font=subtitle_font,
    )
    draw.rectangle((outer, 91, width - outer, 94), fill=ACCENT)

    for index, (scene, label) in enumerate(SCENES):
        row, column = divmod(index, columns)
        x = outer + column * (card_width + gap)
        y = header_height + row * (card_height + gap)
        draw.rectangle((x, y, x + card_width - 1, y + card_height - 1), fill=CARD, outline=BORDER, width=2)
        thumb = ImageOps.fit(
            captures[scene],
            (image_width, image_height),
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )
        sheet.paste(thumb, (x + 6, y + 6))
        draw.text((x + 9, y + image_height + 13), label, fill=TEXT, font=label_font)

    return sheet


def main() -> None:
    missing = [str(QA_DIR / f"{scene}.png") for scene, _ in SCENES if not (QA_DIR / f"{scene}.png").is_file()]
    if missing:
        raise SystemExit("Missing QA captures:\n" + "\n".join(missing))

    captures = {
        scene: normalize_capture(QA_DIR / f"{scene}.png")
        for scene, _ in SCENES
    }
    save_indexed(captures["menu"], ROOT / "docs" / "images" / "menu.png")
    save_indexed(captures["powerLine"], ROOT / "docs" / "images" / "ride.png")
    build_sheet(captures).save(SHEET_PATH, optimize=True)

    print(f"Normalized {len(captures)} QA captures to 1280x720")
    print(f"Wrote {SHEET_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
