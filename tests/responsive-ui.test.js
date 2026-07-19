import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { shouldShowTouchControls } from "../js/game.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME_SOURCE = readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
const STYLES = readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("touch controls are interactive only during an enabled running lifecycle", () => {
  assert.equal(shouldShowTouchControls("running", true, false), true);
  assert.equal(shouldShowTouchControls("running", false, false), false);
  assert.equal(shouldShowTouchControls("running", true, true), false);

  for (const state of ["menu", "paused", "results", "qa", "destroyed"]) {
    assert.equal(shouldShowTouchControls(state, true, false), false, `${state} must suppress touch input`);
  }
});

test("every layer transition re-synchronizes touch visibility and inert state", () => {
  const showLayer = GAME_SOURCE.slice(
    GAME_SOURCE.indexOf("  showLayer(name)"),
    GAME_SOURCE.indexOf("  announce(message)"),
  );
  assert.match(showLayer, /this\.syncTouchControlsVisibility\(\);/);
  assert.match(showLayer, /controls\.hidden = !visible;/);
  assert.match(showLayer, /controls\.inert = !visible;/);
  assert.match(showLayer, /aria-hidden/);

  assert.match(STYLES, /\.touch-controls\[hidden\][\s\S]*pointer-events:\s*none\s*!important;/);
  assert.match(STYLES, /\.touch-controls\[inert\][\s\S]*pointer-events:\s*none\s*!important;/);
});

test("390px portrait touch clusters have a deterministic non-overlapping gutter", () => {
  assert.match(STYLES, /@media \(max-width:\s*430px\) and \(orientation:\s*portrait\)/);
  assert.match(STYLES, /\.touch-actions\s*\{[\s\S]*?width:\s*202px;[\s\S]*?height:\s*132px;/);
  assert.match(STYLES, /\.touch-actions \.touch-spin\s*\{[\s\S]*?top:\s*0;[\s\S]*?bottom:\s*auto;[\s\S]*?width:\s*44px;/);

  const viewportWidth = 390;
  const safeEdge = 12;
  const dpadWidth = 140;
  const actionClusterWidth = 202;
  const dpadRight = safeEdge + dpadWidth;
  const actionClusterLeft = viewportWidth - safeEdge - actionClusterWidth;
  assert.equal(dpadRight, 152);
  assert.equal(actionClusterLeft, 176);
  assert.ok(actionClusterLeft - dpadRight >= 24, "portrait controls retain a 24px gutter");
});

test("short landscape touch clusters clear the lower HUD", () => {
  assert.match(
    STYLES,
    /@media \(max-height: 560px\) and \(orientation: landscape\)[\s\S]*?bottom:\s*max\(62px,/,
  );
});
