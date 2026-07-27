#!/usr/bin/env python3
"""Clean Kaki-Land's reviewed Grok masters into native runtime art.

The selected source images remain checked in beside their provenance. This
deterministic offline pass reframes the continuous panorama around the shared
ocean anchor, resolves sub-pixel softness onto the native one-pixel grid,
chroma-keys the reviewed decor sheet, and builds the menu crop. Runtime
generation is never used.
"""

from __future__ import annotations

import hashlib
from collections import deque
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs/art-source/aerial/imagegen/kaki-land-continuous.png"
MENU = ROOT / "assets/backgrounds/kakiLand-menu.png"
ATLAS = ROOT / "assets/generated/kaki-land-decor-atlas.png"
NANO_REFERENCE = ROOT / "docs/art-source/aerial/nano/kaki-land-1.png"
GROK_PANORAMA = ROOT / "docs/art-source/aerial/grok/kaki-land-network-master.png"
GROK_DECOR = ROOT / "docs/art-source/atlases/grok/kaki-land-decor-sheet-v2.png"
RUNTIME_SIZE = (1536, 640)
HORIZON_Y = 502
SOURCE_HORIZON_RATIO = 393 / 576

COLORS = (
    "#00000000",  # transparent atlas index
    "#090c25",  # night ink
    "#17152f",  # ink
    "#242052",  # tile violet
    "#35316e",
    "#4a4d91",  # memory violet
    "#655b9a",
    "#9b7dd4",
    "#102d69",  # deep ocean
    "#124579",
    "#155f91",
    "#2089a7",
    "#3ccfc4",  # tide cyan
    "#85e6c8",  # mint
    "#a9d8c7",
    "#eee1c4",  # paper shade
    "#fff0cf",  # paper cream
    "#fff6df",
    "#ffd166",  # signal gold
    "#ef665f",  # danger coral
    "#e993a2",  # bloom pink
    "#d876bd",
    "#8879d9",  # rainbow violet
    "#5b8ee8",  # rainbow blue
    "#45c7d1",  # rainbow cyan
    "#69d18b",  # rainbow green
    "#f1c75b",  # rainbow gold
    "#d99052",  # tape/stylus
    "#6a4d67",  # repair thread
    "#2a82aa",  # Kaki blue
    "#76d4d2",
    "#f2ddc6",  # face cream
)

INK = 2
DEEP = 1
TILE = 3
TILE_LIGHT = 4
VIOLET = 5
MEMORY = 6
LAVENDER = 7
WATER_DEEP = 8
WATER_MID = 10
WATER = 11
CYAN = 12
MINT = 13
FOAM_SHADE = 14
PAPER_SHADE = 15
PAPER = 16
WHITE = 17
GOLD = 18
CORAL = 19
PINK = 20
MAGENTA = 21
RAINBOW = (22, 23, 24, 25, 26)
TAPE = 27
THREAD = 28
KAKI = 29
KAKI_LIGHT = 30
FACE = 31


def palette_bytes() -> list[int]:
    values: list[int] = []
    for color in COLORS:
        opaque = color[-6:]
        values.extend(int(opaque[index:index + 2], 16) for index in (0, 2, 4))
    values.extend([0, 0, 0] * (256 - len(COLORS)))
    return values


def canvas(size: tuple[int, int], fill: int = DEEP) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("P", size, fill)
    image.putpalette(palette_bytes())
    return image, ImageDraw.Draw(image)


def rect(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], color: int) -> None:
    draw.rectangle(box, fill=color)


def cloud(draw: ImageDraw.ImageDraw, x: int, y: int, width: int, height: int) -> None:
    """Chunky paper cloud island with a single readable underside."""
    rect(draw, (x + 4, y + height // 2, x + width - 4, y + height), PAPER_SHADE)
    rect(draw, (x, y + height // 2 + 4, x + width, y + height - 4), PAPER)
    lobes = (
        (x + width // 8, y + height // 3, width // 4, height // 2),
        (x + width // 3, y + 2, width // 3, height * 2 // 3),
        (x + width * 5 // 8, y + height // 4, width // 4, height // 2),
    )
    for left, top, lobe_width, lobe_height in lobes:
        draw.ellipse(
            (left, top, left + lobe_width, top + lobe_height),
            fill=PAPER,
        )
    rect(draw, (x + 8, y + height - 5, x + width - 8, y + height - 2), FOAM_SHADE)
    rect(draw, (x + width // 2 - 5, y + height - 1, x + width // 2 + 6, y + height + 2), THREAD)


def stepped_line(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    color: int,
    width: int = 1,
) -> None:
    """Pixel-stair cable without antialiasing."""
    x0, y0 = start
    x1, y1 = end
    steps = max(abs(x1 - x0), abs(y1 - y0), 1)
    for index in range(steps + 1):
        amount = index / steps
        x = round(x0 + (x1 - x0) * amount)
        y = round(y0 + (y1 - y0) * amount)
        rect(draw, (x, y, x + width - 1, y + width - 1), color)


def rainbow_cable(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    complete_bands: int = 5,
) -> None:
    for offset, color in enumerate(RAINBOW[:complete_bands]):
        stepped_line(
            draw,
            (start[0], start[1] + offset),
            (end[0], end[1] + offset),
            color,
        )


def web_ring(draw: ImageDraw.ImageDraw, x: int, y: int, radius: int, repaired: bool = False) -> None:
    for offset, color in enumerate(RAINBOW):
        draw.arc(
            (x - radius + offset, y - radius + offset, x + radius - offset, y + radius - offset),
            198,
            522,
            fill=color,
            width=1,
        )
    if repaired:
        rect(draw, (x + radius - 3, y - 2, x + radius + 3, y + 3), TAPE)
        rect(draw, (x + radius - 1, y - 4, x + radius + 1, y + 5), THREAD)


def crt_station(draw: ImageDraw.ImageDraw, x: int, y: int, role: str = "repair") -> None:
    """One silhouette, one emotion, one prop."""
    # Desk and repaired CRT.
    rect(draw, (x, y + 11, x + 23, y + 13), INK)
    rect(draw, (x + 3, y - 2, x + 15, y + 9), INK)
    rect(draw, (x + 5, y, x + 13, y + 6), CYAN if role != "lamp" else GOLD)
    rect(draw, (x + 8, y + 7, x + 10, y + 11), INK)
    rect(draw, (x + 12, y - 4, x + 16, y - 1), TAPE)
    # Tiny Kaki artist and its single emotional read.
    rect(draw, (x + 18, y + 2, x + 24, y + 9), KAKI)
    rect(draw, (x + 19, y + 1, x + 20, y + 2), INK)
    rect(draw, (x + 23, y + 1, x + 24, y + 2), INK)
    rect(draw, (x + 19, y + 4, x + 19, y + 4), INK)
    rect(draw, (x + 22, y + 4, x + 22, y + 4), INK)
    if role == "alarm":
        rect(draw, (x + 25, y - 2, x + 27, y), CORAL)
        rect(draw, (x + 27, y - 5, x + 28, y - 3), CORAL)
    elif role == "lamp":
        rect(draw, (x + 25, y + 3, x + 27, y + 11), THREAD)
        rect(draw, (x + 23, y, x + 29, y + 4), GOLD)
    elif role == "card":
        rect(draw, (x + 25, y, x + 32, y + 8), PAPER)
        for index, color in enumerate((GOLD, CYAN, PINK, VIOLET)):
            rect(draw, (x + 26 + (index % 2) * 3, y + 1 + (index // 2) * 3,
                        x + 27 + (index % 2) * 3, y + 2 + (index // 2) * 3), color)
    else:
        rect(draw, (x + 25, y + 3, x + 30, y + 4), GOLD)


def button_mosaic(draw: ImageDraw.ImageDraw, x: int, y: int, count: int = 6) -> None:
    colors = (CYAN, PINK, GOLD, MINT, VIOLET, CORAL)
    for index in range(count):
        left = x + (index % 3) * 7
        top = y + (index // 3) * 6
        rect(draw, (left, top, left + 5, top + 4), INK)
        rect(draw, (left + 1, top + 1, left + 4, top + 3), colors[index % len(colors)])
        rect(draw, (left + 2, top + 2, left + 2, top + 2), PAPER)


def signal_guardian(draw: ImageDraw.ImageDraw, x: int, y: int, phase: str = "settle") -> None:
    """Large nonhuman relay shrine: face-grid, routing wings, repaired cable."""
    deform = 5 if phase == "deform" else 0
    notice = -2 if phase == "notice" else 0
    # Cable/web-ring halo.
    draw.ellipse((x - 31, y - 13 + notice, x + 31, y + 8 + notice), outline=MEMORY, width=3)
    draw.arc((x - 27, y - 10 + notice, x + 27, y + 5 + notice), 180, 350, fill=GOLD, width=2)
    rect(draw, (x + 22, y - 8 + notice, x + 28, y - 4 + notice), TAPE)
    # Paper routing wings are asymmetric and abstract, not anatomical.
    left_steps = ((-18, 13), (-35, 6), (-51, 10), (-67, 3), (-79, 9))
    right_steps = ((18, 13), (34, 6), (49, 12), (63, 7), (75, 14))
    for points, repaired in ((left_steps, False), (right_steps, True)):
        previous = (x, y + 24)
        for index, (dx, dy) in enumerate(points):
            current = (x + dx + (deform if dx > 0 else -deform), y + 24 + dy + index * 7)
            stepped_line(draw, previous, current, PAPER_SHADE, 3)
            stepped_line(draw, (previous[0], previous[1] - 2), (current[0], current[1] - 2), PAPER, 2)
            previous = current
        if repaired:
            rect(draw, (x + 48 + deform, y + 44, x + 56 + deform, y + 49), TAPE)
            rect(draw, (x + 51 + deform, y + 39, x + 53 + deform, y + 54), THREAD)
    # Calm signal housing; deliberately no human torso or limbs.
    rect(draw, (x - 15, y + 5, x + 15, y + 57), MEMORY)
    rect(draw, (x - 12, y + 9, x + 12, y + 53), PAPER_SHADE)
    rect(draw, (x - 9, y + 13, x + 9, y + 34), PAPER)
    # Kaki face-grid expression.
    rect(draw, (x - 6, y + 19, x - 3, y + 22), VIOLET)
    rect(draw, (x + 3, y + 19, x + 6, y + 22), VIOLET)
    rect(draw, (x - 1, y + 27, x + 2 + deform // 3, y + 29), GOLD)
    # Ordinary maintenance cable exits the sacred housing.
    stepped_line(draw, (x, y + 54), (x + 10, y + 65), THREAD, 2)
    rect(draw, (x + 7, y + 61, x + 14, y + 66), TAPE)


def signal_guardian_small(
    draw: ImageDraw.ImageDraw,
    left: int,
    top: int,
    phase: str,
) -> None:
    """Self-contained 64x48 guardian reaction frame."""
    deform = 3 if phase == "deform" else 0
    notice = -1 if phase == "notice" else 0
    draw.ellipse((left + 21, top + 3 + notice, left + 43, top + 11 + notice),
                 outline=MEMORY, width=2)
    draw.arc((left + 23, top + 4 + notice, left + 41, top + 10 + notice),
             180, 350, fill=GOLD, width=1)
    rect(draw, (left + 39, top + 5 + notice, left + 43, top + 8 + notice), TAPE)
    stepped_line(draw, (left + 27, top + 19), (left + 15 - deform, top + 24), PAPER, 2)
    stepped_line(draw, (left + 15 - deform, top + 24), (left + 5, top + 33), PAPER_SHADE, 2)
    stepped_line(draw, (left + 37, top + 19), (left + 49 + deform, top + 24), PAPER, 2)
    stepped_line(draw, (left + 49 + deform, top + 24), (left + 59, top + 34), PAPER_SHADE, 2)
    rect(draw, (left + 50 + deform, top + 22, left + 55 + deform, top + 26), TAPE)
    rect(draw, (left + 26, top + 11, left + 38, top + 40), MEMORY)
    rect(draw, (left + 28, top + 13, left + 36, top + 37), PAPER)
    rect(draw, (left + 29, top + 19, left + 30, top + 21), VIOLET)
    rect(draw, (left + 34, top + 19, left + 35, top + 21), VIOLET)
    rect(draw, (left + 31, top + 26, left + 33 + deform // 2, top + 27), GOLD)
    stepped_line(draw, (left + 32, top + 39), (left + 38, top + 46), THREAD)


def star(draw: ImageDraw.ImageDraw, x: int, y: int, color: int, large: bool = False) -> None:
    rect(draw, (x, y, x, y), color)
    if large:
        rect(draw, (x - 2, y, x + 2, y), color)
        rect(draw, (x, y - 2, x, y + 2), color)


def draw_panorama() -> Image.Image:
    if not GROK_PANORAMA.is_file():
        raise FileNotFoundError(f"missing reviewed Grok panorama: {GROK_PANORAMA}")
    with Image.open(GROK_PANORAMA) as opened:
        source = opened.convert("RGB")

    # Work directly on the runtime pixel grid. The former half-resolution pass
    # enlarged every source cluster to two logical pixels, which erased the
    # tiny maintenance gestures and made Kaki-Land visibly coarser than the
    # other production conditions.
    proportional_height = round(source.height * RUNTIME_SIZE[0] / source.width)
    wide = source.resize(
        (RUNTIME_SIZE[0], proportional_height),
        Image.Resampling.LANCZOS,
    )
    source_horizon = max(
        1,
        min(wide.height - 1, round(wide.height * SOURCE_HORIZON_RATIO)),
    )
    runtime_horizon = HORIZON_Y
    # The live camera can reveal source rows 274..490 at exceptional air; it
    # never reaches row zero. Expand the authored tiled heaven down to that
    # reachable band, then compress the lower cloud network toward the normal
    # coast crop. This is one continuous vertical map, not a shelf swap.
    upper_source_break = round(wide.height * (220 / 576))
    upper_target_break = 410
    upper_sky = wide.crop((0, 0, wide.width, upper_source_break)).resize(
        (RUNTIME_SIZE[0], upper_target_break),
        Image.Resampling.LANCZOS,
    )
    lower_sky = wide.crop((
        0,
        upper_source_break,
        wide.width,
        source_horizon,
    )).resize(
        (RUNTIME_SIZE[0], runtime_horizon - upper_target_break),
        Image.Resampling.LANCZOS,
    )
    water = wide.crop((0, source_horizon, wide.width, wide.height)).resize(
        (RUNTIME_SIZE[0], RUNTIME_SIZE[1] - runtime_horizon),
        Image.Resampling.LANCZOS,
    )
    cleaned = Image.new("RGB", RUNTIME_SIZE)
    cleaned.paste(upper_sky, (0, 0))
    cleaned.paste(lower_sky, (0, upper_target_break))
    cleaned.paste(water, (0, runtime_horizon))
    cleaned = cleaned.filter(
        ImageFilter.UnsharpMask(radius=0.42, percent=105, threshold=3),
    )
    return cleaned.quantize(
        colors=80,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )


def draw_menu(panorama: Image.Image, atlas: Image.Image) -> Image.Image:
    # A 16:9 crop keeps the full vertical story and favors the busiest cloud
    # handoff. The reactive Relay is composited from the same runtime atlas so
    # card art and gameplay share one silhouette language.
    crop_width = round(panorama.height * 16 / 9)
    crop_left = 176
    crop = panorama.convert("RGB").crop(
        (crop_left, 0, crop_left + crop_width, panorama.height),
    )
    menu = crop.resize((768, 432), Image.Resampling.LANCZOS).convert("RGBA")
    relay = atlas.crop((128, 96, 192, 144)).resize(
        (192, 144),
        Image.Resampling.NEAREST,
    )
    relay_alpha = relay.getchannel("A").point(lambda value: round(value * 0.78))
    relay.putalpha(relay_alpha)
    menu.alpha_composite(relay, (548, 22))
    return menu.convert("RGB").quantize(
        colors=64,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )


def atlas_frame(draw: ImageDraw.ImageDraw, index: int, name: str) -> None:
    left = (index % 4) * 64
    top = (index // 4) * 48
    if name == "quietRepair":
        cloud(draw, left + 4, top + 27, 56, 16)
        crt_station(draw, left + 17, top + 17, "repair")
    elif name == "alarmFixer":
        cloud(draw, left + 4, top + 27, 56, 16)
        crt_station(draw, left + 17, top + 17, "alarm")
    elif name == "reactionCard":
        cloud(draw, left + 4, top + 27, 56, 16)
        crt_station(draw, left + 13, top + 17, "card")
    elif name == "signalKeeper":
        cloud(draw, left + 4, top + 27, 56, 16)
        crt_station(draw, left + 14, top + 17, "lamp")
    elif name == "collector":
        cloud(draw, left + 4, top + 28, 56, 15)
        crt_station(draw, left + 12, top + 19, "repair")
        for offset, color in enumerate((PINK, CYAN, GOLD)):
            rect(draw, (left + 43 + offset * 5, top + 18, left + 46 + offset * 5, top + 23), color)
    elif name == "guestbookGull":
        rect(draw, (left + 13, top + 19, left + 26, top + 22), PAPER)
        rect(draw, (left + 27, top + 21, left + 37, top + 24), PAPER)
        rect(draw, (left + 22, top + 25, left + 31, top + 32), PINK)
        rect(draw, (left + 34, top + 31, left + 44, top + 38), PAPER)
        rect(draw, (left + 37, top + 33, left + 41, top + 36), GOLD)
    elif name == "buttonMenace":
        cloud(draw, left + 4, top + 28, 56, 15)
        rect(draw, (left + 8, top + 18, left + 15, top + 28), KAKI)
        rect(draw, (left + 9, top + 21, left + 9, top + 21), INK)
        rect(draw, (left + 13, top + 21, left + 13, top + 21), INK)
        button_mosaic(draw, left + 24, top + 20)
        rect(draw, (left + 41, top + 16, left + 46, top + 20), CORAL)
    elif name == "approvalStamp":
        rect(draw, (left + 14, top + 9, left + 50, top + 38), INK)
        rect(draw, (left + 17, top + 12, left + 47, top + 35), PAPER)
        web_ring(draw, left + 32, top + 24, 9, repaired=True)
        rect(draw, (left + 29, top + 21, left + 35, top + 27), GOLD)
    elif name.startswith("lastRelay"):
        phase = {
            "lastRelayNotice": "notice",
            "lastRelayDeform": "deform",
            "lastRelaySettle": "settle",
        }[name]
        signal_guardian_small(draw, left, top, phase)
    elif name == "cloudStation":
        cloud(draw, left + 3, top + 23, 58, 20)
        crt_station(draw, left + 16, top + 15, "repair")
        web_ring(draw, left + 50, top + 18, 7, repaired=True)


def is_chroma(pixel: tuple[int, int, int]) -> bool:
    """Broad source-magenta test used only by border-connected flood fill."""
    red, green, blue = pixel
    return (
        red >= 145
        # The source mat stays below this range; the alarm artist's coral body
        # does not. Keeping the key narrow avoids eating that silhouette.
        and green <= 76
        and 48 <= blue <= 205
        and red - green >= 62
        and red - blue >= 28
    )


def extract_grok_cell(
    sheet: Image.Image,
    column: int,
    row: int,
    frame_size: tuple[int, int] = (64, 48),
) -> Image.Image:
    cell_width = sheet.width // 4
    cell_height = sheet.height // 3
    cell = sheet.crop((
        column * cell_width,
        row * cell_height,
        (column + 1) * cell_width,
        (row + 1) * cell_height,
    )).convert("RGBA")
    rgb = cell.convert("RGB")
    source_pixels = rgb.load()
    width, height = rgb.size
    visited = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()

    def enqueue(x: int, y: int) -> None:
        offset = y * width + x
        if visited[offset] or not is_chroma(source_pixels[x, y]):
            return
        visited[offset] = 1
        queue.append((x, y))

    for x in range(width):
        enqueue(x, 0)
        enqueue(x, height - 1)
    for y in range(height):
        enqueue(0, y)
        enqueue(width - 1, y)
    while queue:
        x, y = queue.popleft()
        if x > 0:
            enqueue(x - 1, y)
        if x + 1 < width:
            enqueue(x + 1, y)
        if y > 0:
            enqueue(x, y - 1)
        if y + 1 < height:
            enqueue(x, y + 1)

    background = Image.new("L", cell.size)
    background.putdata([255 if value else 0 for value in visited])
    # Remove the high-resolution chroma fringe before the 5x reduction.
    background = background.filter(ImageFilter.MaxFilter(5))
    cell.putalpha(ImageChops.invert(background))
    bounds = cell.getbbox()
    if not bounds:
        raise RuntimeError(f"Grok decor cell {column},{row} has no keyed subject")
    subject = cell.crop(bounds)
    frame_width, frame_height = frame_size
    fit = min((frame_width - 4) / subject.width, (frame_height - 4) / subject.height)
    target = (
        max(1, round(subject.width * fit)),
        max(1, round(subject.height * fit)),
    )
    subject = subject.resize(target, Image.Resampling.LANCZOS)
    alpha = subject.getchannel("A").point(lambda value: 255 if value >= 104 else 0)
    opaque = Image.new("RGB", subject.size, (13, 16, 37))
    opaque.paste(subject.convert("RGB"), mask=alpha)
    opaque = opaque.quantize(
        colors=15,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    ).convert("RGB")
    result = opaque.convert("RGBA")
    result.putalpha(alpha)
    frame = Image.new("RGBA", frame_size, (0, 0, 0, 0))
    frame.alpha_composite(
        result,
        ((frame_width - target[0]) // 2, (frame_height - target[1]) // 2),
    )
    return frame


def clean_relay_face(frame: Image.Image, phase: str) -> None:
    """Replace generated pseudo-glyphs with the canonical Kaki face grid."""
    draw = ImageDraw.Draw(frame)
    draw.rounded_rectangle((22, 17, 42, 37), radius=3, fill="#11172f", outline="#2f78a2")
    if phase == "notice":
        draw.rectangle((26, 22, 28, 25), fill="#70c1d4")
        draw.rectangle((36, 22, 38, 25), fill="#70c1d4")
        draw.rectangle((30, 31, 34, 32), fill="#ffd166")
    elif phase == "deform":
        draw.rectangle((25, 22, 28, 26), fill="#70c1d4")
        draw.rectangle((36, 21, 39, 25), fill="#70c1d4")
        draw.rectangle((29, 30, 36, 32), fill="#ed6a5a")
    else:
        draw.rectangle((26, 23, 28, 25), fill="#51b7bd")
        draw.rectangle((36, 23, 38, 25), fill="#51b7bd")
        draw.rectangle((30, 30, 34, 31), fill="#ffd166")


def draw_atlas() -> Image.Image:
    if not GROK_DECOR.is_file():
        raise FileNotFoundError(f"missing reviewed Grok decor sheet: {GROK_DECOR}")
    with Image.open(GROK_DECOR) as opened:
        sheet = opened.convert("RGB")
    atlas = Image.new("RGBA", (256, 144), (0, 0, 0, 0))
    for row in range(3):
        for column in range(4):
            frame = extract_grok_cell(sheet, column, row)
            if row == 2 and column < 3:
                clean_relay_face(
                    frame,
                    ("notice", "deform", "settle")[column],
                )
            atlas.alpha_composite(frame, (column * 64, row * 48))
    return atlas


def save(image: Image.Image, path: Path, transparency: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs = {"format": "PNG", "optimize": True, "compress_level": 9}
    if transparency and image.mode == "P":
        kwargs["transparency"] = 0
    image.save(path, **kwargs)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> int:
    panorama = draw_panorama()
    atlas = draw_atlas()
    menu = draw_menu(panorama, atlas)
    save(panorama, SOURCE)
    save(menu, MENU)
    save(atlas, ATLAS, transparency=True)
    for path in (SOURCE, MENU, ATLAS):
        with Image.open(path) as opened:
            colors = len(opened.convert("RGBA").getcolors(opened.width * opened.height) or [])
            print(
                f"{path.relative_to(ROOT)} {opened.width}x{opened.height} "
                f"{colors} colors {path.stat().st_size} bytes sha256:{digest(path)[:12]}"
            )
    if NANO_REFERENCE.is_file():
        print(f"reference-only sha256:{digest(NANO_REFERENCE)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
