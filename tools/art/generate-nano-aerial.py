#!/usr/bin/env python3
"""Generate one reference-controlled aerial panorama candidate with Vertex Nano Banana."""

from __future__ import annotations

import argparse
import subprocess
from pathlib import Path

from google import genai
from google.genai import types
from google.oauth2.credentials import Credentials


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--project", default="nemocloud2")
    parser.add_argument("--location", default="global")
    parser.add_argument("--model", default="gemini-2.5-flash-image")
    parser.add_argument("--seed", type=int, default=0x4B414B49)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    reference = args.reference.resolve()
    output = args.output.resolve()
    if not reference.is_file():
        raise FileNotFoundError(reference)

    # Use the same active gcloud token route as the workspace's Vertex tools.
    # Application-default credentials can belong to a stale restricted account
    # even while the explicitly active CLI account is healthy.
    token = subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    client = genai.Client(
        vertexai=True,
        project=args.project,
        location=args.location,
        credentials=Credentials(token=token),
    )
    response = client.models.generate_content(
        model=args.model,
        contents=[
            types.Part.from_bytes(data=reference.read_bytes(), mime_type="image/png"),
            args.prompt,
        ],
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
            seed=args.seed,
            image_config=types.ImageConfig(
                aspect_ratio="16:9",
                image_size=None if args.model == "gemini-2.5-flash-image" else "2K",
                output_mime_type="image/png",
            ),
        ),
    )

    image_bytes = None
    for candidate in response.candidates or []:
        for part in candidate.content.parts or []:
            if part.inline_data and part.inline_data.data:
                image_bytes = part.inline_data.data
                break
        if image_bytes:
            break
    if not image_bytes:
        feedback = getattr(response, "prompt_feedback", None)
        raise RuntimeError(f"Vertex returned no image candidate: {feedback}")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(image_bytes)
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
