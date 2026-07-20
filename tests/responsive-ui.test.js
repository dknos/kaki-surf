import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isTouchControlEnvironment,
  KakiSurfGame,
  qaWorldOverride,
  resolveViewportTransition,
  shouldShowTouchControls,
  stableViewportOrientation,
} from "../js/game.js";
import { watercraftClearsBreaker } from "../js/world-visuals.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GAME_SOURCE = readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
const STYLES = readFileSync(path.join(ROOT, "styles.css"), "utf8");

test("touch controls are interactive only during an enabled running lifecycle", () => {
  assert.equal(shouldShowTouchControls("running", true, false), true);
  assert.equal(shouldShowTouchControls("running", false, false), false);
  assert.equal(shouldShowTouchControls("running", true, true), false);
  assert.equal(shouldShowTouchControls("running", true, false, false), false);
  assert.equal(shouldShowTouchControls("qa", false, false, false, true), true);

  for (const state of ["menu", "paused", "results", "qa", "destroyed"]) {
    assert.equal(shouldShowTouchControls(state, true, false), false, `${state} must suppress touch input`);
  }
});

test("touch controls target coarse pointers and compact touchscreens, not fine-pointer desktops", () => {
  assert.equal(isTouchControlEnvironment({ coarsePointer: true }), true);
  assert.equal(isTouchControlEnvironment({ maxTouchPoints: 5, viewportWidth: 390 }), true);
  assert.equal(isTouchControlEnvironment({ maxTouchPoints: 1, viewportWidth: 1024 }), true);
  assert.equal(isTouchControlEnvironment({ maxTouchPoints: 0, viewportWidth: 390 }), false);
  assert.equal(isTouchControlEnvironment({ maxTouchPoints: 1, viewportWidth: 1440 }), false);
  assert.equal(isTouchControlEnvironment({ coarsePointer: false, maxTouchPoints: 0, viewportWidth: 1440 }), false);
});

test("only a stable portrait-landscape transition interrupts play", () => {
  assert.equal(stableViewportOrientation(844, 390), "landscape");
  assert.equal(stableViewportOrientation(390, 844), "portrait");
  assert.equal(stableViewportOrientation(800, 760), null, "near-square resizing is neutral");
  assert.equal(stableViewportOrientation(0, 760), null);

  assert.deepEqual(resolveViewportTransition("landscape", 800, 760), {
    orientation: "landscape",
    changed: false,
  });
  assert.deepEqual(resolveViewportTransition("landscape", 390, 844), {
    orientation: "portrait",
    changed: true,
  });
});

test("a significant live orientation transition clears held input and pauses with an explicit reason", () => {
  const originalWindow = globalThis.window;
  const calls = { clear: 0, layer: null, announcement: "" };
  globalThis.window = { innerWidth: 390, innerHeight: 844 };
  const game = {
    viewportOrientation: "landscape",
    state: "running",
    pausedFrom: null,
    input: { clear: () => { calls.clear += 1; } },
    announcer: { clear() {} },
    audio: { onEvent() {}, setLifecycle() {} },
    simulation: {},
    elements: { resumeButton: { focus() {} } },
    showLayer: (layer) => { calls.layer = layer; },
    announce: (message) => { calls.announcement = message; },
    syncTouchControlsVisibility() {},
    pause: KakiSurfGame.prototype.pause,
  };

  try {
    KakiSurfGame.prototype.handleViewportChange.call(game, false);
    assert.equal(game.state, "paused");
    assert.equal(game.pausedFrom, "orientation");
    assert.equal(game.viewportOrientation, "portrait");
    assert.equal(calls.clear, 1);
    assert.equal(calls.layer, "pause");
    assert.equal(calls.announcement, "Surfing paused.");
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("dedicated far-boat QA fixtures clear both the breaker and rider exclusion bands", () => {
  const simulation = { wave: { curlX: 72 }, player: { x: 232 } };
  for (const scene of ["cargoShip", "fishingBoat", "sailboat"]) {
    const [boat] = qaWorldOverride(scene).traffic;
    assert.equal(boat.layer, "far", `${scene} remains distant background traffic`);
    assert.equal(
      watercraftClearsBreaker(boat, boat.screenX, simulation),
      true,
      `${scene} must remain visible in its deterministic QA frame`,
    );
  }
});

test("direct game construction degrades safely when the global storage getter is denied", () => {
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const reachedDomBoundary = new Error("reached DOM initialization");
  let storageReads = 0;
  const host = {};
  Object.defineProperty(host, "innerHTML", {
    set() {
      throw reachedDomBoundary;
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      storageReads += 1;
      throw new DOMException("Storage access denied", "SecurityError");
    },
  });

  try {
    assert.throws(() => new KakiSurfGame({ host }), (error) => error === reachedDomBoundary);
    assert.equal(storageReads, 1, "the guarded boundary resolves global storage once");
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else delete globalThis.localStorage;
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

test("320px portrait keeps every essential touch target at least 44px without scaling", () => {
  assert.match(
    STYLES,
    /@media \(max-width:\s*370px\) and \(orientation:\s*portrait\)[\s\S]*?\.touch-dpad\s*\{[\s\S]*?transform:\s*none;/,
  );
  assert.match(
    STYLES,
    /@media \(max-width:\s*370px\) and \(orientation:\s*portrait\)[\s\S]*?\.touch-actions\s*\{[\s\S]*?width:\s*calc\(100vw - 172px\);[\s\S]*?transform:\s*none;/,
  );
  assert.doesNotMatch(STYLES, /@media \(max-width:\s*350px\)[\s\S]*?transform:\s*scale\(0\.8\)/);

  const viewportWidth = 320;
  const dpadRight = 8 + 140;
  const actionsLeft = viewportWidth - 8 - (viewportWidth - 172);
  assert.equal(actionsLeft - dpadRight, 16);
  for (const size of [45, 44, 58, 64]) assert.ok(size >= 44);

  const narrowActionWidth = viewportWidth - 172;
  const topRow = [
    [0, 44],
    [46, 90],
    [narrowActionWidth - 54, narrowActionWidth],
  ];
  for (let index = 0; index < topRow.length - 1; index += 1) {
    assert.ok(topRow[index][1] <= topRow[index + 1][0], "spin and Special targets do not overlap");
  }
});

test("short landscape touch clusters clear the lower HUD", () => {
  assert.match(
    STYLES,
    /@media \(max-height: 560px\) and \(orientation: landscape\)[\s\S]*?bottom:\s*max\(62px,/,
  );
  assert.match(
    STYLES,
    /@media \(max-height: 560px\) and \(orientation: landscape\)[\s\S]*?\.touch-dpad\s*\{[\s\S]*?transform:\s*none;/,
  );
  assert.match(
    STYLES,
    /@media \(max-height: 560px\) and \(orientation: landscape\)[\s\S]*?\.top-controls\s*\{[\s\S]*?flex-direction:\s*column;/,
  );
  assert.match(
    STYLES,
    /@media \(max-height: 560px\) and \(orientation: landscape\)[\s\S]*?\.touch-actions\s*\{[\s\S]*?width:\s*156px;[\s\S]*?transform:\s*none;/,
  );

  const targetSize = 45;
  const buttonPositions = [[47, 0], [0, 48], [47, 48], [94, 48]];
  for (const [index, [x, y]] of buttonPositions.entries()) {
    assert.ok(targetSize >= 44, `direction ${index} retains a 44px physical target`);
    for (const [otherX, otherY] of buttonPositions.slice(index + 1)) {
      const overlaps = x < otherX + targetSize
        && x + targetSize > otherX
        && y < otherY + targetSize
        && y + targetSize > otherY;
      assert.equal(overlaps, false, `direction ${index} does not overlap another target`);
    }
  }

  const landscapeTopRow = [[0, 44], [46, 90], [102, 156]];
  const landscapeBottomRow = [[32, 90], [92, 156]];
  for (const row of [landscapeTopRow, landscapeBottomRow]) {
    for (let index = 0; index < row.length - 1; index += 1) {
      assert.ok(row[index][1] <= row[index + 1][0], "landscape actions keep distinct hit areas");
    }
  }
});

test("settings dialog has a programmatic accessible name", () => {
  assert.match(GAME_SOURCE, /<dialog class="settings-dialog" aria-labelledby="settings-title">/);
  assert.match(GAME_SOURCE, /<h2 id="settings-title">SETTINGS<\/h2>/);
});

test("touch users receive an explicit pause target and top controls meet the 44px minimum", () => {
  assert.match(GAME_SOURCE, /data-action="pause-run" aria-label="Pause surfing"/);
  assert.match(STYLES, /\.top-controls button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/);
});
