#!/usr/bin/env python3
"""Build Soder Snek's deterministic native-pixel production atlas.

The Grok image-edit sheet is preserved as concept/reference material only.
These 64x64 cells are authored at final resolution so runtime art has no
anti-aliased fringe, unstable lighting, or generated pose drift.
"""

from __future__ import annotations

import argparse
import io
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets" / "generated" / "soder-snek-atlas.png"
CELL = 64
COLUMNS = 8

PALETTE = {
    "ink": (22, 31, 47, 255),
    "ink_soft": (41, 54, 65, 255),
    "green_dark": (43, 92, 50, 255),
    "green": (83, 151, 56, 255),
    "green_light": (119, 184, 72, 255),
    "belly_dark": (111, 70, 43, 255),
    "belly": (166, 112, 61, 255),
    "belly_light": (202, 155, 91, 255),
    "face": (238, 225, 205, 255),
    "face_shadow": (205, 205, 184, 255),
    "white": (251, 248, 224, 255),
    "bang_dark": (45, 112, 139, 255),
    "bang": (89, 177, 193, 255),
    "tongue_dark": (151, 63, 103, 255),
    "tongue": (222, 105, 151, 255),
    "cheek": (181, 102, 151, 255),
    "stripe": (153, 91, 43, 255),
    "blush": (205, 77, 103, 255),
    "spark": (246, 210, 92, 255),
}


def spec(**overrides):
    result = {
        "crouch": 0,
        "stretch": 0,
        "lean": 0,
        "tail": "trail",
        "tongue": "down",
        "expression": "happy",
        # Keep the everyday mittens below the oversized hood so the sleeves
        # read as arms instead of two detached white pixels.
        "paw_left": (-11, -2),
        "paw_right": (10, -2),
        "leg_spread": 7,
        "coil": 0,
        "hood_flat": 0,
        "body_open": 0,
        "switch": 0,
        "accent": "",
    }
    result.update(overrides)
    return result


FRAME_SPECS = (
    ("neutralRide", spec()),
    ("regularRide", spec(lean=1, tongue="flopA", tail="trail")),
    ("goofyRide", spec(lean=-1, tongue="flopB", tail="high", switch=1)),
    ("highLineCarve", spec(lean=-3, crouch=1, tail="counterDown", paw_left=(-10, -9))),
    ("downFaceCarve", spec(lean=4, crouch=2, tail="counterUp", paw_right=(10, -5))),
    ("deepCompression", spec(crouch=6, coil=1, tail="curl", tongue="short")),
    ("pumpRelease", spec(stretch=4, tail="low", paw_left=(-11, -14), paw_right=(10, -14))),
    ("snekSnap", spec(lean=-5, crouch=3, tail="whipUp", expression="focus", accent="snap")),
    ("coilCutback", spec(lean=5, crouch=2, tail="curl", expression="focus", paw_right=(12, -10))),
    ("lipAnticipation", spec(lean=-2, crouch=4, tail="counterUp", expression="focus")),
    ("serpentTuck", spec(crouch=7, coil=2, hood_flat=1, tail="wrap", tongue="short", expression="focus")),
    ("takeoffUncoil", spec(stretch=6, lean=-2, tail="low", paw_left=(-11, -16), paw_right=(10, -16))),
    ("risingStretch", spec(stretch=5, tail="low", paw_left=(-10, -15), paw_right=(10, -16))),
    ("floatingApex", spec(stretch=1, crouch=1, tail="float", expression="bright")),
    ("controlledFall", spec(crouch=2, tail="counterUp", expression="focus")),
    ("landingAnticipation", spec(crouch=5, tail="opposite", expression="focus", paw_left=(-10, -7), paw_right=(9, -7))),
    ("perfectImpactCoil", spec(crouch=7, coil=2, tail="wrap", expression="bright", accent="impact")),
    ("cleanImpact", spec(crouch=4, tail="curl")),
    ("wobble", spec(crouch=3, lean=5, tail="counterDown", tongue="flopB", expression="wide")),
    ("perfectRideAwayA", spec(stretch=2, tail="high", expression="bright", paw_left=(-11, -17))),
    ("perfectRideAwayB", spec(crouch=6, tail="wide", expression="focus", paw_left=(-12, -9), paw_right=(12, -9))),
    ("perfectRideAwayC", spec(stretch=3, tail="star", expression="bright", paw_left=(-13, -17), paw_right=(13, -17))),
    ("perfectRideAwayD", spec(lean=3, tail="lookBack", expression="bright", tongue="flick")),
    ("cleanRideAwayA", spec(crouch=4, lean=-2, tail="low", expression="focus")),
    ("cleanRideAwayB", spec(crouch=2, tail="balance", paw_left=(-12, -14), paw_right=(12, -14))),
    ("cleanRideAwayC", spec(lean=3, tail="sweep", paw_left=(-12, -4), expression="focus")),
    ("cleanRideAwayD", spec(crouch=2, tail="trail", expression="bright")),
    ("switchLanding", spec(crouch=4, tail="opposite", switch=1, expression="focus")),
    ("turboLanding", spec(crouch=6, lean=-4, tail="straight", tongue="stream", expression="bright", accent="impact")),
    ("wipeoutA", spec(lean=6, tail="tumble", tongue="flopA", expression="wide", body_open=1)),
    ("wipeoutB", spec(lean=-6, tail="tumbleReverse", tongue="flopB", expression="squint", body_open=1)),
    ("wipeoutC", spec(crouch=5, tail="knot", tongue="stream", expression="wide", coil=1)),
    ("curlWipeout", spec(crouch=6, tail="wrap", tongue="stream", expression="squint", coil=2)),
    ("tailKnotTumble", spec(lean=4, tail="knot", tongue="flopA", expression="wide", body_open=1)),
    ("tongueFlop", spec(crouch=4, tail="low", tongue="long", expression="squint")),
    ("victory", spec(stretch=4, tail="heart", tongue="flick", expression="bright", paw_left=(-12, -18), paw_right=(12, -18))),
    ("disappointed", spec(crouch=4, tail="low", tongue="long", expression="squint", hood_flat=1)),
    ("turboIgnition", spec(crouch=5, lean=-2, tail="straight", tongue="trail", expression="focus", accent="spark")),
    ("turboSurge", spec(crouch=4, lean=-4, tail="straight", tongue="stream", expression="focus")),
    ("turboRedline", spec(crouch=3, lean=-6, tail="straight", tongue="streamLong", expression="focus")),
    ("turboCooking", spec(crouch=2, stretch=2, lean=-5, tail="straight", tongue="streamLong", expression="bright", accent="spark")),
    ("turboRelease", spec(crouch=2, lean=-2, tail="trail", tongue="flopA", expression="happy")),
    ("tongueTapReach", spec(crouch=3, lean=2, tail="curl", tongue="reach", expression="focus")),
    ("tongueTapHold", spec(crouch=5, lean=2, tail="curl", tongue="board", expression="bright", accent="contact")),
    ("tongueTapRelease", spec(crouch=2, tail="counterUp", tongue="arc", expression="focus")),
    ("tailCoilReach", spec(crouch=4, lean=-2, tail="reachBoard", tongue="short", expression="focus")),
    ("tailCoilHold", spec(crouch=7, coil=2, tail="boardCoil", tongue="short", expression="bright")),
    ("tailCoilRelease", spec(crouch=3, tail="releaseCoil", expression="focus")),
    ("shedFlipOpen", spec(stretch=4, tail="wide", expression="bright", paw_left=(-13, -17), paw_right=(13, -17))),
    ("shedFlipSeparate", spec(crouch=5, stretch=2, tail="float", expression="wide", paw_left=(-13, -18), paw_right=(13, -18))),
    ("shedFlipReconnect", spec(crouch=4, tail="opposite", expression="focus", paw_left=(-9, -7), paw_right=(9, -7))),
    ("soderSpiralWindup", spec(crouch=3, lean=-4, tail="spiralA", tongue="lagA", expression="focus")),
    ("soderSpiralMaximum", spec(crouch=4, lean=5, tail="spiralB", tongue="lagB", expression="bright")),
    ("soderSpiralSpot", spec(crouch=4, tail="opposite", tongue="short", expression="focus")),
    ("dolphinMount", spec(crouch=5, coil=2, tail="mountWrap", tongue="flopA", expression="bright")),
    ("sharkStartled", spec(stretch=4, tail="alarm", tongue="stream", expression="wide", paw_left=(-12, -17), paw_right=(12, -17))),
)


def draw_tail(draw: ImageDraw.ImageDraw, tail_name: str, body_x: int, body_y: int) -> None:
    points = {
        "trail": [(body_x - 5, body_y + 8), (body_x - 15, body_y + 11), (10, body_y + 9), (5, body_y + 5)],
        "high": [(body_x - 4, body_y + 7), (17, body_y + 8), (10, body_y + 2), (12, body_y - 7)],
        "counterDown": [(body_x - 5, body_y + 8), (18, body_y + 12), (9, body_y + 15), (5, body_y + 12)],
        "counterUp": [(body_x - 5, body_y + 8), (18, body_y + 6), (10, body_y - 2), (13, body_y - 9)],
        "curl": [(body_x - 5, body_y + 9), (18, body_y + 13), (9, body_y + 8), (10, body_y - 1), (18, body_y - 4)],
        "wrap": [(body_x - 4, body_y + 10), (19, body_y + 14), (10, body_y + 10), (10, body_y + 1), (19, body_y)],
        "straight": [(body_x - 4, body_y + 8), (18, body_y + 9), (8, body_y + 8), (3, body_y + 7)],
        "low": [(body_x - 5, body_y + 10), (18, body_y + 14), (8, body_y + 15), (4, body_y + 13)],
        "float": [(body_x - 4, body_y + 8), (19, body_y + 7), (11, body_y + 1), (14, body_y - 6)],
        "opposite": [(body_x - 4, body_y + 8), (18, body_y + 6), (8, body_y + 9), (5, body_y + 15)],
        "whipUp": [(body_x - 4, body_y + 8), (18, body_y + 5), (9, body_y - 2), (14, body_y - 11)],
        "wide": [(body_x - 5, body_y + 8), (16, body_y + 12), (7, body_y + 6), (5, body_y - 2)],
        "star": [(body_x - 5, body_y + 8), (16, body_y + 13), (8, body_y + 10), (4, body_y + 4)],
        "lookBack": [(body_x - 5, body_y + 8), (18, body_y + 5), (11, body_y - 4), (18, body_y - 8)],
        "balance": [(body_x - 5, body_y + 8), (17, body_y + 4), (8, body_y - 2), (14, body_y - 10)],
        "sweep": [(body_x - 5, body_y + 8), (16, body_y + 13), (7, body_y + 14), (3, body_y + 11)],
        "tumble": [(body_x - 4, body_y + 8), (17, body_y + 4), (8, body_y - 5), (15, body_y - 10)],
        "tumbleReverse": [(body_x - 4, body_y + 8), (18, body_y + 13), (9, body_y + 15), (4, body_y + 10)],
        "reachBoard": [(body_x - 4, body_y + 8), (18, body_y + 13), (9, body_y + 16), (16, body_y + 18)],
        "releaseCoil": [(body_x - 4, body_y + 8), (18, body_y + 11), (9, body_y + 7), (13, body_y - 1)],
        "mountWrap": [(body_x - 4, body_y + 8), (19, body_y + 13), (11, body_y + 8), (15, body_y)],
        "alarm": [(body_x - 4, body_y + 8), (17, body_y + 5), (9, body_y - 5), (15, body_y - 12)],
        "heart": [(body_x - 4, body_y + 8), (17, body_y + 3), (9, body_y - 4), (14, body_y - 9)],
    }.get(tail_name)

    if tail_name in {"knot", "boardCoil", "spiralA", "spiralB"}:
        box = (6, body_y - 5, 30, body_y + 19)
        draw.arc(box, 10, 350, fill=PALETTE["ink"], width=10)
        draw.arc(box, 10, 350, fill=PALETTE["green_dark"], width=6)
        draw.arc((10, body_y - 1, 26, body_y + 15), 25, 340, fill=PALETTE["green"], width=3)
        if tail_name in {"boardCoil", "spiralB"}:
            draw.line((19, body_y + 14, 31, body_y + 17), fill=PALETTE["ink"], width=7)
            draw.line((19, body_y + 14, 31, body_y + 17), fill=PALETTE["green"], width=4)
        return

    if tail_name == "spiralA":
        return
    points = points or [(body_x - 4, body_y + 8), (17, body_y + 10), (8, body_y + 8), (6, body_y + 5)]
    points = [(max(6, min(58, x)), max(6, min(58, y))) for x, y in points]
    draw.line(points, fill=PALETTE["ink"], width=11, joint="curve")
    draw.line(points, fill=PALETTE["green_dark"], width=7, joint="curve")
    draw.line(points[1:], fill=PALETTE["green"], width=3, joint="curve")
    for index in range(1, min(3, len(points))):
        x, y = points[index]
        draw.line((x - 1, y - 2, x + 2, y), fill=PALETTE["stripe"], width=1)


def draw_face(draw: ImageDraw.ImageDraw, head_x: int, head_y: int, expression: str) -> None:
    if expression == "wide":
        draw.rectangle((head_x - 7, head_y + 15, head_x - 5, head_y + 18), fill=PALETTE["ink"])
        draw.rectangle((head_x + 5, head_y + 15, head_x + 7, head_y + 18), fill=PALETTE["ink"])
    elif expression == "focus":
        draw.line((head_x - 8, head_y + 16, head_x - 4, head_y + 15), fill=PALETTE["ink"], width=2)
        draw.line((head_x + 4, head_y + 15, head_x + 8, head_y + 16), fill=PALETTE["ink"], width=2)
    elif expression == "squint":
        draw.line((head_x - 8, head_y + 17, head_x - 4, head_y + 17), fill=PALETTE["ink"], width=2)
        draw.line((head_x + 4, head_y + 17, head_x + 8, head_y + 17), fill=PALETTE["ink"], width=2)
    else:
        draw.line((head_x - 8, head_y + 17, head_x - 6, head_y + 15, head_x - 4, head_y + 17), fill=PALETTE["ink"], width=2)
        draw.line((head_x + 4, head_y + 17, head_x + 6, head_y + 15, head_x + 8, head_y + 17), fill=PALETTE["ink"], width=2)
    mouth_y = head_y + 22
    draw.line((head_x - 3, mouth_y, head_x, mouth_y + 2, head_x + 3, mouth_y), fill=PALETTE["ink"], width=1)
    if expression == "bright":
        draw.rectangle((head_x - 2, mouth_y + 1, head_x + 2, mouth_y + 2), fill=PALETTE["ink"])
    draw.rectangle((head_x - 10, head_y + 19, head_x - 8, head_y + 20), fill=PALETTE["blush"])
    draw.rectangle((head_x + 8, head_y + 19, head_x + 10, head_y + 20), fill=PALETTE["blush"])
    draw.point((head_x - 9, head_y + 22), fill=PALETTE["blush"])
    draw.point((head_x + 9, head_y + 22), fill=PALETTE["blush"])


def draw_tongue(draw: ImageDraw.ImageDraw, head_x: int, head_y: int, tongue: str) -> None:
    if tongue == "short":
        points = [(head_x, head_y + 3), (head_x + 1, head_y + 10)]
        width = 4
    elif tongue in {"stream", "streamLong", "lagA", "lagB"}:
        length = 15 if tongue in {"stream", "lagA"} else 21
        bend = -4 if tongue in {"stream", "streamLong", "lagA"} else 5
        points = [(head_x, head_y + 3), (head_x - 2, head_y + 9), (head_x - length, head_y + 10 + bend)]
        width = 5
    elif tongue in {"reach", "board"}:
        end_y = head_y + (34 if tongue == "board" else 29)
        points = [(head_x, head_y + 3), (head_x + 2, head_y + 16), (head_x + 9, end_y)]
        width = 5
    elif tongue == "arc":
        points = [(head_x, head_y + 3), (head_x + 3, head_y + 13), (head_x + 11, head_y + 17)]
        width = 4
    elif tongue == "long":
        points = [(head_x, head_y + 3), (head_x + 1, head_y + 20), (head_x + 8, head_y + 27)]
        width = 6
    elif tongue == "flick":
        points = [(head_x, head_y + 3), (head_x + 1, head_y + 12), (head_x + 5, head_y + 14)]
        width = 4
    else:
        flop = -2 if tongue == "flopA" else 2 if tongue == "flopB" else 0
        points = [(head_x, head_y + 3), (head_x + flop, head_y + 14), (head_x + flop + 2, head_y + 18)]
        width = 5
    draw.line(points, fill=PALETTE["tongue_dark"], width=width + 2, joint="curve")
    draw.line(points, fill=PALETTE["tongue"], width=width, joint="curve")
    end_x, end_y = points[-1]
    draw.point((end_x + 1, end_y), fill=PALETTE["white"])


def draw_paw(draw: ImageDraw.ImageDraw, x: int, y: int) -> None:
    draw.rounded_rectangle((x - 3, y - 3, x + 3, y + 3), radius=2, fill=PALETTE["ink"])
    draw.rectangle((x - 2, y - 2, x + 2, y + 2), fill=PALETTE["white"])
    draw.point((x + 1, y - 1), fill=PALETTE["face_shadow"])


def draw_arm(
    draw: ImageDraw.ImageDraw,
    shoulder: tuple[int, int],
    mitten: tuple[int, int],
) -> None:
    """Draw a readable sleeved arm over the hood/body overlap."""
    shoulder_x, shoulder_y = shoulder
    mitten_x, mitten_y = mitten
    side = -1 if mitten_x < shoulder_x else 1
    elbow = (
        round((shoulder_x + mitten_x) * 0.5) + side * 2,
        round((shoulder_y + mitten_y) * 0.5) + 2,
    )
    points = (shoulder, elbow, mitten)
    draw.line(points, fill=PALETTE["ink"], width=7, joint="curve")
    draw.line(points, fill=PALETTE["green_dark"], width=5, joint="curve")
    draw.line(points, fill=PALETTE["green"], width=3, joint="curve")
    draw_paw(draw, mitten_x, mitten_y)


def draw_leg(
    draw: ImageDraw.ImageDraw,
    hip: tuple[int, int],
    foot: tuple[int, int],
) -> None:
    """Draw one short chibi leg and a flat board-contact foot."""
    hip_x, hip_y = hip
    foot_x, foot_y = foot
    side = -1 if foot_x < hip_x else 1
    knee = (
        round((hip_x + foot_x) * 0.5) + side,
        max(hip_y + 3, foot_y - 5),
    )
    points = (hip, knee, foot)
    draw.line(points, fill=PALETTE["ink"], width=8, joint="curve")
    draw.line(points, fill=PALETTE["green_dark"], width=6, joint="curve")
    draw.line(points, fill=PALETTE["green"], width=3, joint="curve")


def draw_foot(draw: ImageDraw.ImageDraw, foot: tuple[int, int], side: int) -> None:
    foot_x, foot_y = foot
    toe_x = foot_x + side * 3
    draw.rounded_rectangle(
        (
            min(foot_x - 2, toe_x - 2),
            foot_y - 2,
            max(foot_x + 2, toe_x + 2),
            foot_y + 2,
        ),
        radius=2,
        fill=PALETTE["ink"],
    )
    draw.line((foot_x - side, foot_y, toe_x, foot_y), fill=PALETTE["green_light"], width=2)


def draw_frame(specification: dict) -> Image.Image:
    image = Image.new("RGBA", (CELL, CELL), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    crouch = int(specification["crouch"])
    stretch = int(specification["stretch"])
    lean = int(specification["lean"])
    coil = int(specification["coil"])
    body_x = 33 + lean // 2
    body_y = 35 + crouch // 2 - stretch // 2
    head_x = 34 + lean
    head_y = max(2, 5 + crouch - stretch)

    draw_tail(draw, specification["tail"], body_x, body_y)

    # Legs sit behind the torso but remain visible on either side of the belly.
    # Their feet share a stable authored board-contact row; crouch and stretch
    # alter the bends without changing the gameplay board transform.
    leg_spread = int(specification["leg_spread"]) + (2 if coil else 0)
    if specification["body_open"]:
        leg_spread += 3
    foot_y = max(body_y + 11, min(59, 56 + crouch // 3 - stretch // 2))
    left_foot = (max(5, body_x - leg_spread), foot_y)
    right_foot = (min(58, body_x + leg_spread), foot_y - (1 if specification["switch"] else 0))
    draw_leg(draw, (body_x - 5, body_y + 7), left_foot)
    draw_leg(draw, (body_x + 5, body_y + 7), right_foot)

    if coil:
        body_box = (body_x - 12 - coil, body_y - 2, body_x + 11, min(57, body_y + 19 - stretch))
    else:
        body_box = (body_x - 9, body_y - 7, body_x + 9, min(57, body_y + 18 - stretch))
    draw.rounded_rectangle(body_box, radius=7, fill=PALETTE["ink"])
    inner_body = tuple(value + offset for value, offset in zip(body_box, (2, 2, -2, -2)))
    draw.rounded_rectangle(inner_body, radius=5, fill=PALETTE["green_dark"])
    draw.rectangle((body_x - 5, body_y - 3, body_x + 4, min(55, body_y + 15 - stretch)), fill=PALETTE["belly_dark"])
    draw.rectangle((body_x - 3, body_y - 2, body_x + 3, min(54, body_y + 14 - stretch)), fill=PALETTE["belly"])
    for segment_y in range(body_y + 1, min(55, body_y + 14 - stretch), 4):
        draw.line((body_x - 3, segment_y, body_x + 3, segment_y), fill=PALETTE["belly_light"])

    if specification["body_open"]:
        draw.line((body_x - 6, body_y + 2, body_x - 11, body_y + 10), fill=PALETTE["green"], width=4)
        draw.line((body_x + 6, body_y + 2, body_x + 12, body_y + 9), fill=PALETTE["green"], width=4)

    hood_height = 27 - int(specification["hood_flat"]) * 2
    draw.rounded_rectangle(
        (head_x - 19, head_y, head_x + 18, head_y + hood_height),
        radius=8,
        fill=PALETTE["ink"],
    )
    draw.rounded_rectangle(
        (head_x - 17, head_y + 2, head_x + 16, head_y + hood_height - 2),
        radius=7,
        fill=PALETTE["green_dark"],
    )
    draw.rectangle((head_x - 14, head_y + 4, head_x + 13, head_y + 10), fill=PALETTE["green"])
    draw.line((head_x - 16, head_y + 12, head_x - 12, head_y + 13), fill=PALETTE["stripe"], width=2)
    draw.line((head_x + 11, head_y + 12, head_x + 15, head_y + 13), fill=PALETTE["stripe"], width=2)
    draw.line((head_x - 16, head_y + 17, head_x - 13, head_y + 18), fill=PALETTE["stripe"], width=1)
    draw.line((head_x + 12, head_y + 17, head_x + 15, head_y + 18), fill=PALETTE["stripe"], width=1)

    draw.ellipse((head_x - 13, head_y + 5, head_x - 9, head_y + 13), fill=PALETTE["ink"])
    draw.ellipse((head_x + 8, head_y + 5, head_x + 12, head_y + 13), fill=PALETTE["ink"])
    draw.point((head_x - 11, head_y + 6), fill=PALETTE["white"])
    draw.point((head_x + 10, head_y + 6), fill=PALETTE["white"])
    draw.ellipse((head_x - 17, head_y + 15, head_x - 12, head_y + 20), fill=PALETTE["cheek"])
    draw.ellipse((head_x + 11, head_y + 15, head_x + 16, head_y + 20), fill=PALETTE["cheek"])

    opening_bottom = head_y + hood_height - 2
    draw.rounded_rectangle(
        (head_x - 12, head_y + 10, head_x + 11, opening_bottom),
        radius=6,
        fill=PALETTE["face_shadow"],
    )
    draw.rectangle((head_x - 10, head_y + 12, head_x + 9, opening_bottom - 1), fill=PALETTE["face"])
    draw.rectangle((head_x - 9, head_y + 10, head_x + 8, head_y + 13), fill=PALETTE["bang_dark"])
    draw.polygon(
        (
            (head_x - 9, head_y + 11),
            (head_x - 4, head_y + 9),
            (head_x, head_y + 13),
            (head_x + 4, head_y + 9),
            (head_x + 9, head_y + 11),
            (head_x + 8, head_y + 14),
            (head_x - 9, head_y + 14),
        ),
        fill=PALETTE["bang"],
    )
    draw_face(draw, head_x, head_y, specification["expression"])
    draw_tongue(draw, head_x, head_y, specification["tongue"])

    # Paint the sleeves last. Previously the oversized hood covered almost the
    # entire arm stroke, leaving Soder's white mittens looking detached.
    paw_left = specification["paw_left"]
    paw_right = specification["paw_right"]
    draw_arm(
        draw,
        (body_x - 6, body_y - 1),
        (body_x + paw_left[0], body_y + paw_left[1]),
    )
    draw_arm(
        draw,
        (body_x + 6, body_y - 1),
        (body_x + paw_right[0], body_y + paw_right[1]),
    )

    if specification["switch"]:
        draw.rectangle((body_x - 11, min(57, body_y + 16), body_x - 7, min(59, body_y + 18)), fill=PALETTE["white"])
    if specification["accent"] in {"spark", "contact", "snap"}:
        accent_x = min(59, head_x + 19)
        accent_y = max(3, head_y + 9)
        draw.line((accent_x - 2, accent_y, accent_x + 2, accent_y), fill=PALETTE["spark"])
        draw.line((accent_x, accent_y - 2, accent_x, accent_y + 2), fill=PALETTE["spark"])
    if specification["accent"] == "impact":
        draw.line((body_x - 13, 57, body_x + 13, 57), fill=PALETTE["spark"], width=2)

    # Paint the board-contact feet after torso, switch, and landing accents so
    # deep coils and impact glints cannot erase the leg silhouette.
    draw_foot(draw, left_foot, -1)
    draw_foot(draw, right_foot, 1)

    return image


def validate_limb_landmarks(name: str, cell: Image.Image, specification: dict) -> None:
    crouch = int(specification["crouch"])
    stretch = int(specification["stretch"])
    lean = int(specification["lean"])
    coil = int(specification["coil"])
    body_x = 33 + lean // 2
    body_y = 35 + crouch // 2 - stretch // 2
    green_colors = {
        PALETTE["green_dark"],
        PALETTE["green"],
        PALETTE["green_light"],
    }

    def has_green_near(x: int, y: int, radius: int = 1) -> bool:
        return any(
            cell.getpixel((sample_x, sample_y)) in green_colors
            for sample_x in range(max(1, x - radius), min(CELL - 1, x + radius + 1))
            for sample_y in range(max(1, y - radius), min(CELL - 1, y + radius + 1))
        )

    for side_name, paw in (
        ("left", specification["paw_left"]),
        ("right", specification["paw_right"]),
    ):
        mitten = (body_x + paw[0], body_y + paw[1])
        if cell.getpixel(mitten) != PALETTE["white"]:
            raise SystemExit(f"{name}: {side_name} mitten landmark is missing")
        shoulder_x = body_x + (-6 if side_name == "left" else 6)
        shoulder_y = body_y - 1
        side = -1 if mitten[0] < shoulder_x else 1
        elbow = (
            round((shoulder_x + mitten[0]) * 0.5) + side * 2,
            round((shoulder_y + mitten[1]) * 0.5) + 2,
        )
        sleeve_probe = (
            round((shoulder_x + elbow[0]) * 0.5),
            round((shoulder_y + elbow[1]) * 0.5),
        )
        if not has_green_near(*sleeve_probe):
            raise SystemExit(f"{name}: {side_name} sleeve landmark is missing")

    leg_spread = int(specification["leg_spread"]) + (2 if coil else 0)
    if specification["body_open"]:
        leg_spread += 3
    foot_y = max(body_y + 11, min(59, 56 + crouch // 3 - stretch // 2))
    for side_name, side, foot_x in (
        ("left", -1, max(5, body_x - leg_spread)),
        ("right", 1, min(58, body_x + leg_spread)),
    ):
        toe_x = foot_x + side * 3
        toe_y = foot_y - (1 if side_name == "right" and specification["switch"] else 0)
        if not has_green_near(toe_x, toe_y):
            raise SystemExit(f"{name}: {side_name} board-contact foot landmark is missing")


def validate_cell(name: str, cell: Image.Image, specification: dict) -> None:
    pixels = list(cell.getdata())
    alphas = {pixel[3] for pixel in pixels}
    if not alphas.issubset({0, 255}):
        raise SystemExit(f"{name}: semitransparent pixels found: {sorted(alphas)}")
    colors = {pixel for pixel in pixels if pixel[3]}
    if len(colors) > 24:
        raise SystemExit(f"{name}: palette grew to {len(colors)} colors")
    for x in range(CELL):
        if cell.getpixel((x, 0))[3] or cell.getpixel((x, CELL - 1))[3]:
            raise SystemExit(f"{name}: touches a horizontal cell edge")
    for y in range(CELL):
        if cell.getpixel((0, y))[3] or cell.getpixel((CELL - 1, y))[3]:
            raise SystemExit(f"{name}: touches a vertical cell edge")
    validate_limb_landmarks(name, cell, specification)


def build_atlas() -> Image.Image:
    rows = (len(FRAME_SPECS) + COLUMNS - 1) // COLUMNS
    atlas = Image.new("RGBA", (COLUMNS * CELL, rows * CELL), (0, 0, 0, 0))
    for index, (name, specification) in enumerate(FRAME_SPECS):
        frame = draw_frame(specification)
        validate_cell(name, frame, specification)
        atlas.alpha_composite(frame, ((index % COLUMNS) * CELL, (index // COLUMNS) * CELL))
    return atlas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    atlas = build_atlas()
    if args.check:
        if not OUTPUT.is_file():
            raise SystemExit(f"Missing {OUTPUT.relative_to(ROOT)}")
        encoded = io.BytesIO()
        atlas.save(encoded, format="PNG", optimize=True)
        if encoded.getvalue() != OUTPUT.read_bytes():
            raise SystemExit("Soder atlas is stale; run tools/art/build-soder-snek-atlas.py")
        print(f"Validated {OUTPUT.relative_to(ROOT)}: {atlas.width}x{atlas.height}, {len(FRAME_SPECS)} frames")
        return
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(OUTPUT, optimize=True)
    print(f"Wrote {OUTPUT.relative_to(ROOT)}: {atlas.width}x{atlas.height}, {len(FRAME_SPECS)} frames")


if __name__ == "__main__":
    main()
