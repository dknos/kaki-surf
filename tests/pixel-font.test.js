import assert from "node:assert/strict";
import test from "node:test";

import { drawPixelText } from "../js/pixel-font.js";

function glyphPixels(character) {
  const pixels = [];
  const context = {
    globalAlpha: 1,
    fillStyle: "",
    fillRect(x, y, width, height) {
      pixels.push([x, y, width, height]);
    },
  };
  drawPixelText(context, character, 0, 0);
  return pixels;
}

test("Surf School direction markers have real glyphs instead of the question-mark fallback", () => {
  const fallback = glyphPixels("?");
  for (const marker of ["<", ">", "^"]) {
    const pixels = glyphPixels(marker);
    assert.ok(pixels.length > 0, `${marker} draws visible pixels`);
    assert.notDeepEqual(pixels, fallback, `${marker} does not render as ?`);
  }
});
