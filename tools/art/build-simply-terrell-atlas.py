#!/usr/bin/env python3
"""Build SimplyTerrell's deterministic native-pixel production atlas.

The user-supplied photo and ImageGen concept sheet establish identity and
wardrobe. Runtime cells are authored at final resolution for hard alpha,
stable landmarks, and consistent microphone readability.
"""

from __future__ import annotations

import argparse
import hashlib
import io
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "docs" / "art-source" / "imagegen" / "simply-terrell-concept.png"
SOURCE_SHA256 = "e6e01cff7d9fcc37e1a1f89e46694de09025978c5bad24b3753dee6bee54ea28"
OUTPUT = ROOT / "assets" / "generated" / "simply-terrell-atlas.png"
CELL = 64
COLUMNS = 8

FRAME_NAMES = (
    "neutralRide", "regularRide", "goofyRide", "highLineCarve",
    "downFaceCarve", "deepCompression", "pumpRelease", "snekSnap",
    "coilCutback", "lipAnticipation", "serpentTuck", "takeoffUncoil",
    "risingStretch", "floatingApex", "controlledFall", "landingAnticipation",
    "perfectImpactCoil", "cleanImpact", "wobble", "perfectRideAwayA",
    "perfectRideAwayB", "perfectRideAwayC", "perfectRideAwayD", "cleanRideAwayA",
    "cleanRideAwayB", "cleanRideAwayC", "cleanRideAwayD", "switchLanding",
    "turboLanding", "wipeoutA", "wipeoutB", "wipeoutC",
    "curlWipeout", "tailKnotTumble", "tongueFlop", "victory",
    "disappointed", "turboIgnition", "turboSurge", "turboRedline",
    "turboCooking", "turboRelease", "tongueTapReach", "tongueTapHold",
    "tongueTapRelease", "tailCoilReach", "tailCoilHold", "tailCoilRelease",
    "shedFlipOpen", "shedFlipSeparate", "shedFlipReconnect", "soderSpiralWindup",
    "soderSpiralMaximum", "soderSpiralSpot", "dolphinMount", "sharkStartled",
)

P = {
    "ink": (22, 31, 47, 255),
    "locs": (23, 20, 33, 255),
    "loc_highlight": (85, 52, 38, 255),
    "skin_dark": (105, 55, 37, 255),
    "skin": (169, 99, 63, 255),
    "skin_light": (208, 138, 91, 255),
    "navy_dark": (26, 33, 65, 255),
    "navy": (32, 41, 76, 255),
    "navy_light": (52, 61, 104, 255),
    "shoulder": (150, 154, 168, 255),
    "red": (187, 52, 79, 255),
    "silver_dark": (123, 129, 143, 255),
    "silver": (216, 219, 226, 255),
    "white": (248, 241, 225, 255),
    "shoe_dark": (75, 74, 82, 255),
    "shoe": (171, 169, 169, 255),
    "spark": (247, 211, 94, 255),
}


def pose(name: str, index: int) -> dict:
    lower = name.lower()
    crouch = 0
    if any(term in lower for term in ("compression", "impact", "tuck", "coil", "hold", "mount")):
        crouch = 4
    if any(term in lower for term in ("landing", "wobble", "wipeout", "tumble")):
        crouch = max(crouch, 3)
    stretch = 3 if any(term in lower for term in ("takeoff", "rising", "victory", "cooking")) else 0
    lean = 0
    if any(term in lower for term in ("downface", "cutback", "maximum", "wipeouta", "lookback")):
        lean = 3
    elif any(term in lower for term in ("highline", "snap", "windup", "wipeoutb")):
        lean = -3
    elif name in {"regularRide", "turboSurge", "turboRedline"}:
        lean = -1
    elif name == "goofyRide":
        lean = 1

    gesture = "rest"
    if any(term in lower for term in ("victory", "star", "release", "cooking", "startled")):
        gesture = "high"
    elif any(term in lower for term in ("snap", "cutback", "wobble", "wipeout", "spiral", "flip")):
        gesture = "wide"
    elif any(term in lower for term in ("grab", "tap", "coil", "tuck", "compression")):
        gesture = "low"
    elif index & 1:
        gesture = "talk"
    return {"crouch": crouch, "stretch": stretch, "lean": lean, "gesture": gesture}


def line(draw: ImageDraw.ImageDraw, points, outer, inner, outer_width=7, inner_width=4):
    draw.line(points, fill=outer, width=outer_width, joint="curve")
    draw.line(points, fill=inner, width=inner_width, joint="curve")


def draw_frame(name: str, index: int) -> Image.Image:
    frame = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(frame)
    specification = pose(name, index)
    crouch = specification["crouch"]
    stretch = specification["stretch"]
    lean = specification["lean"]
    body_x = 32 + lean
    body_top = 28 + crouch - stretch
    hip_y = body_top + 19
    foot_y = 58
    head_x = 32 + round(lean * 0.65)
    head_top = max(7, body_top - 21)

    # Legs and independent board-contact shoes.
    left_foot = (21 + max(0, lean), foot_y)
    right_foot = (43 + min(0, lean), foot_y - (1 if name == "goofyRide" else 0))
    line(draw, [(body_x - 5, hip_y - 2), (body_x - 7, hip_y + 5), left_foot],
         P["ink"], P["navy"], 8, 5)
    line(draw, [(body_x + 5, hip_y - 2), (body_x + 7, hip_y + 5), right_foot],
         P["ink"], P["navy"], 8, 5)
    for foot_x, y in (left_foot, right_foot):
        draw.rectangle((foot_x - 5, y - 2, foot_x + 5, y + 1), fill=P["ink"])
        draw.rectangle((foot_x - 3, y - 2, foot_x + 4, y - 1), fill=P["shoe"])
        draw.point((foot_x + 4, y - 2), fill=P["white"])

    # Gesture arm behind torso; the open hand is the stand-up silhouette cue.
    shoulder_left = (body_x - 8, body_top + 4)
    gesture = specification["gesture"]
    gesture_end = {
        "high": (max(7, body_x - 16), max(6, body_top - 14)),
        "wide": (max(10, body_x - 23), body_top + 2),
        "low": (max(8, body_x - 17), min(55, body_top + 19)),
        "talk": (max(8, body_x - 19), body_top + 8),
        "rest": (max(10, body_x - 14), body_top + 14),
    }[gesture]
    elbow = (body_x - 13, round((body_top + gesture_end[1]) / 2) + 3)
    line(draw, [shoulder_left, elbow, gesture_end], P["ink"], P["navy"], 8, 5)
    draw.rectangle((gesture_end[0] - 3, gesture_end[1] - 2,
                    gesture_end[0] + 3, gesture_end[1] + 3), fill=P["skin_dark"])
    draw.rectangle((gesture_end[0] - 2, gesture_end[1] - 2,
                    gesture_end[0] + 2, gesture_end[1] + 2), fill=P["skin"])
    if gesture in {"high", "wide", "talk"}:
        draw.line((gesture_end[0] - 3, gesture_end[1] - 3,
                   gesture_end[0] - 5, gesture_end[1] - 5), fill=P["skin"], width=2)
        draw.line((gesture_end[0] + 2, gesture_end[1] - 2,
                   gesture_end[0] + 4, gesture_end[1] - 4), fill=P["skin"], width=2)

    # Loose navy tracksuit torso with gray shoulder panels and red shirt peek.
    draw.polygon([
        (body_x - 10, body_top),
        (body_x + 10, body_top),
        (body_x + 9, hip_y),
        (body_x - 9, hip_y),
    ], fill=P["ink"])
    draw.rectangle((body_x - 8, body_top + 1, body_x + 8, hip_y - 1), fill=P["navy"])
    draw.rectangle((body_x - 8, body_top + 10, body_x + 8, body_top + 14), fill=P["navy_light"])
    draw.polygon([
        (body_x - 8, body_top + 1), (body_x - 3, body_top + 1),
        (body_x - 6, body_top + 7), (body_x - 9, body_top + 6),
    ], fill=P["shoulder"])
    draw.polygon([
        (body_x + 3, body_top + 1), (body_x + 8, body_top + 1),
        (body_x + 9, body_top + 6), (body_x + 6, body_top + 7),
    ], fill=P["shoulder"])
    draw.polygon([
        (body_x - 3, body_top + 1), (body_x + 3, body_top + 1),
        (body_x, body_top + 7),
    ], fill=P["red"])
    draw.line((body_x, body_top + 6, body_x, hip_y - 2), fill=P["silver_dark"], width=1)

    # Bent microphone arm; this never disappears in trick or recovery frames.
    shoulder_right = (body_x + 8, body_top + 4)
    mic_hand = (head_x + 8, head_top + 14)
    mic_elbow = (body_x + 14, body_top + 12)
    line(draw, [shoulder_right, mic_elbow, mic_hand], P["ink"], P["navy"], 8, 5)
    draw.rectangle((mic_hand[0] - 2, mic_hand[1] - 2,
                    mic_hand[0] + 3, mic_hand[1] + 3), fill=P["skin_dark"])
    draw.rectangle((mic_hand[0] - 1, mic_hand[1] - 2,
                    mic_hand[0] + 2, mic_hand[1] + 2), fill=P["skin"])

    # Hair mass and individual shoulder-length locs.
    draw.rectangle((head_x - 11, head_top - 2, head_x + 11, head_top + 18), fill=P["locs"])
    draw.rectangle((head_x - 8, head_top - 5, head_x + 7, head_top + 1), fill=P["locs"])
    loc_roots = (-10, -7, -4, 5, 8, 11)
    for loc_index, offset in enumerate(loc_roots):
        end_y = head_top + 24 + ((index + loc_index) % 3)
        bend = -1 if offset < 0 else 1
        draw.line(
            (head_x + offset, head_top + 2, head_x + offset + bend, end_y),
            fill=P["locs"],
            width=3,
        )
        draw.point((head_x + offset + bend, head_top + 8 + loc_index), fill=P["loc_highlight"])

    # Face, eyes, beard edge, and a warm on-stage smile.
    draw.rectangle((head_x - 7, head_top + 3, head_x + 7, head_top + 16), fill=P["skin"])
    draw.rectangle((head_x - 5, head_top + 4, head_x - 1, head_top + 6), fill=P["skin_light"])
    draw.rectangle((head_x - 5, head_top + 9, head_x - 3, head_top + 10), fill=P["ink"])
    draw.rectangle((head_x + 3, head_top + 9, head_x + 5, head_top + 10), fill=P["ink"])
    draw.point((head_x, head_top + 12), fill=P["skin_dark"])
    draw.rectangle((head_x - 4, head_top + 14, head_x + 4, head_top + 16), fill=P["skin_dark"])
    draw.rectangle((head_x - 2, head_top + 14, head_x + 3, head_top + 14), fill=P["white"])

    # One handheld microphone per frame, close enough to read at 0.76x.
    draw.line(
        (mic_hand[0] + 1, mic_hand[1], head_x + 7, head_top + 7),
        fill=P["ink"],
        width=3,
    )
    draw.rectangle((head_x + 5, head_top + 4, head_x + 10, head_top + 8), fill=P["silver_dark"])
    draw.rectangle((head_x + 6, head_top + 4, head_x + 9, head_top + 6), fill=P["silver"])
    draw.point((head_x + 7, head_top + 4), fill=P["white"])

    if any(term in name for term in ("turbo", "Cooking", "victory")):
        draw.rectangle((55, 14 + (index % 3) * 5, 57, 16 + (index % 3) * 5), fill=P["spark"])
        draw.point((54, 15 + (index % 3) * 5), fill=P["white"])

    validate_cell(name, frame)
    return frame


def validate_cell(name: str, cell: Image.Image) -> None:
    pixels = list(cell.get_flattened_data())
    if not {pixel[3] for pixel in pixels}.issubset({0, 255}):
        raise SystemExit(f"{name}: semitransparent pixels")
    colors = {pixel for pixel in pixels if pixel[3]}
    for required in ("navy", "shoulder", "red", "locs", "skin", "silver"):
        if P[required] not in colors:
            raise SystemExit(f"{name}: missing {required} landmark")
    if len(colors) > 20:
        raise SystemExit(f"{name}: palette grew to {len(colors)} colors")
    for position in range(CELL):
        if cell.getpixel((position, 0))[3] or cell.getpixel((position, CELL - 1))[3]:
            raise SystemExit(f"{name}: touches a horizontal edge")
        if cell.getpixel((0, position))[3] or cell.getpixel((CELL - 1, position))[3]:
            raise SystemExit(f"{name}: touches a vertical edge")


def build_atlas() -> Image.Image:
    atlas = Image.new("RGBA", (COLUMNS * CELL, 7 * CELL), (0, 0, 0, 0))
    for index, name in enumerate(FRAME_NAMES):
        atlas.alpha_composite(
            draw_frame(name, index),
            ((index % COLUMNS) * CELL, (index // COLUMNS) * CELL),
        )
    return atlas


def validate_source() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing concept source: {SOURCE.relative_to(ROOT)}")
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if digest != SOURCE_SHA256:
        raise SystemExit(f"Concept source hash changed: {digest}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    validate_source()
    atlas = build_atlas()
    encoded = io.BytesIO()
    atlas.save(encoded, format="PNG", optimize=True)
    if args.check:
        if not OUTPUT.is_file():
            raise SystemExit(f"Missing {OUTPUT.relative_to(ROOT)}")
        if encoded.getvalue() != OUTPUT.read_bytes():
            raise SystemExit("SimplyTerrell atlas is stale; run tools/art/build-simply-terrell-atlas.py")
        print(f"Validated {OUTPUT.relative_to(ROOT)}: 512x448, {len(FRAME_NAMES)} frames")
        return
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(encoded.getvalue())
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: 512x448, {len(FRAME_NAMES)} frames")


if __name__ == "__main__":
    main()
