import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  isTouchControlEnvironment,
  KakiSurfGame,
  lockMobileLandscape,
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

test("mobile run entry requests fullscreen before locking the screen to landscape", async () => {
  const calls = [];
  const result = await lockMobileLandscape({
    host: {
      async requestFullscreen(options) {
        calls.push(["fullscreen", options]);
      },
    },
    documentRef: { fullscreenElement: null },
    screenRef: {
      orientation: {
        async lock(value) {
          calls.push(["orientation", value]);
        },
      },
    },
  });
  assert.deepEqual(calls, [
    ["fullscreen", { navigationUI: "hide" }],
    ["orientation", "landscape"],
  ]);
  assert.deepEqual(result, { fullscreen: true, locked: true });

  calls.length = 0;
  assert.deepEqual(await lockMobileLandscape({ enabled: false }), { fullscreen: false, locked: false });
  assert.deepEqual(calls, []);
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

test("turning a landscape-gated run sideways resumes it automatically", () => {
  const originalWindow = globalThis.window;
  let resumes = 0;
  globalThis.window = { innerWidth: 844, innerHeight: 390 };
  const game = {
    viewportOrientation: "portrait",
    state: "paused",
    pausedFrom: "orientation",
    input: { clear() {} },
    resume: () => { resumes += 1; },
    syncTouchControlsVisibility() {},
    syncOrientationGate() {},
  };
  try {
    KakiSurfGame.prototype.handleViewportChange.call(game, false);
    assert.equal(game.viewportOrientation, "landscape");
    assert.equal(resumes, 1);
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

test("whale ride QA fixtures preserve distinct right- and left-going mount art", () => {
  assert.equal(qaWorldOverride("whaleRide").wildlife.direction, 1);
  assert.equal(qaWorldOverride("whaleRideLeft").wildlife.direction, -1);
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

test("portrait mobile play is gated instead of rendering a second control layout", () => {
  assert.match(GAME_SOURCE, /touchEnvironment && this\.viewportOrientation !== "portrait"/);
  assert.match(GAME_SOURCE, /class="game-layer orientation-gate" hidden inert/);
  assert.match(STYLES, /\.orientation-gate\s*\{[\s\S]*?z-index:\s*20;/);
  assert.match(STYLES, /@keyframes turn-phone/);
});

test("short landscape uses a continuous stick, large actions, and dynamic viewport units", () => {
  assert.match(GAME_SOURCE, /data-touch-stick data-stick-radius="42"/);
  assert.doesNotMatch(GAME_SOURCE, /class="touch-dpad"/);
  assert.match(STYLES, /\.touch-stick__gate\s*\{[\s\S]*?width:\s*112px;[\s\S]*?height:\s*112px;/);
  assert.match(STYLES, /\.touch-stick__knob\s*\{[\s\S]*?--stick-x/);
  assert.match(STYLES, /width:\s*min\(100dvw,\s*177\.7778dvh\)/);
  assert.match(STYLES, /Keep the mobile deck last[\s\S]*?\.touch-actions[\s\S]*?width:\s*244px;[\s\S]*?height:\s*124px;/);
  assert.match(STYLES, /Keep the mobile deck last[\s\S]*?\.touch-trick[\s\S]*?width:\s*68px;[\s\S]*?height:\s*68px;/);
  assert.match(STYLES, /Keep the mobile deck last[\s\S]*?\[data-control="edge"\][\s\S]*?width:\s*76px;[\s\S]*?height:\s*76px;/);
  assert.match(STYLES, /data-control-mode="advanced"[\s\S]*?\.touch-spin[\s\S]*?width:\s*52px;[\s\S]*?height:\s*52px;/);
  assert.match(STYLES, /\.touch-controls button\.is-queued[\s\S]*?animation:\s*trick-intent-pulse/);
  assert.match(STYLES, /\.touch-controls button\.is-trick-active/);
  assert.match(STYLES, /\.touch-controls button\.is-release/);
});

test("simulation trick events persist queued, active, and release states until resolution", () => {
  const button = feedbackButton("trick");
  const game = {
    settings: { controlMode: "simple" },
    host: { dataset: { controlMode: "simple" } },
    elements: {
      touchControls: { querySelector: () => button },
      touchTrickButtons: [button],
      touchSpecial: null,
    },
    rumbleCalls: 0,
    rumble() {
      this.rumbleCalls += 1;
    },
    setTouchTrickFeedback: KakiSurfGame.prototype.setTouchTrickFeedback,
    resetTouchTrickFeedback: KakiSurfGame.prototype.resetTouchTrickFeedback,
  };

  KakiSurfGame.prototype.syncTouchTrickFeedback.call(game, {
    type: "trickQueued",
    payload: { action: "trick", order: 4 },
  });
  assert.equal(button.dataset.trickState, "queued");
  assert.equal(button.status.textContent, "QUEUED");
  assert.equal(game.rumbleCalls, 1);

  KakiSurfGame.prototype.syncTouchActionState.call(game);
  assert.equal(button.dataset.trickState, "queued", "an ordinary render sync cannot erase feedback");

  KakiSurfGame.prototype.syncTouchTrickFeedback.call(game, {
    type: "trickStarted",
    payload: { id: "frontRailGrab", action: "trick1", order: 4 },
  });
  assert.equal(button.dataset.trickState, "active");
  assert.equal(button.status.textContent, "FRONTSIDE GRAB");

  KakiSurfGame.prototype.syncTouchTrickFeedback.call(game, {
    type: "trickAutoReleased",
    payload: { id: "frontRailGrab", action: "trick1", order: 4 },
  });
  assert.equal(button.dataset.trickState, "release");
  assert.equal(button.status.textContent, "RELEASE");

  KakiSurfGame.prototype.syncTouchTrickFeedback.call(game, {
    type: "trickCompleted",
    payload: { id: "frontRailGrab", action: "trick1", order: 4 },
  });
  assert.equal(button.dataset.trickState, "idle");
  assert.equal(button.status.textContent, "TAP / HOLD");
});

test("settings dialog has a programmatic accessible name", () => {
  assert.match(GAME_SOURCE, /<dialog class="settings-dialog" aria-labelledby="settings-title">/);
  assert.match(GAME_SOURCE, /<h2 id="settings-title">SETTINGS<\/h2>/);
});

function feedbackButton(control) {
  const classes = new Set();
  const status = {
    dataset: { simpleLabel: "TAP / HOLD", advancedLabel: "VARIAL" },
    textContent: "TAP / HOLD",
  };
  return {
    dataset: { control, trickState: "idle", intentOrder: "0" },
    status,
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name),
    },
    querySelector: (selector) => selector === "[data-touch-status]" ? status : null,
  };
}

test("settings dialog includes the creator and inspiration credits", () => {
  assert.match(GAME_SOURCE, /<section class="credits-section" aria-labelledby="credits-heading">/);
  assert.match(GAME_SOURCE, /MADE BY <strong>@dknos<\/strong>/);
  assert.match(
    GAME_SOURCE,
    /Thanks to Oekaki Connect for inspiring me to learn about video games, web3, and cute neo-chibi drawings\./,
  );
});

test("touch users receive an explicit pause target and top controls meet the 44px minimum", () => {
  assert.match(GAME_SOURCE, /data-action="pause-run" aria-label="Pause surfing"/);
  assert.match(STYLES, /\.top-controls button\s*\{[\s\S]*?min-width:\s*44px;[\s\S]*?min-height:\s*44px;/);
});
