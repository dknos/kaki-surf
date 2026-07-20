import assert from "node:assert/strict";
import test from "node:test";

import { KakiSurfGame } from "../js/game.js";
import { createDefaultSave } from "../js/persistence.js";
import { adjustFormControl, findDirectionalTarget } from "../js/ui-navigation.js";

test("directional navigation prefers aligned controls in the requested half-plane", () => {
  const current = elementAt(100, 100);
  const right = elementAt(180, 104);
  const farRight = elementAt(260, 100);
  const down = elementAt(102, 180);
  const diagonal = elementAt(155, 180);
  const candidates = [current, farRight, down, diagonal, right];

  assert.equal(findDirectionalTarget(current, candidates, 1, 0), right);
  assert.equal(findDirectionalTarget(current, candidates, 0, 1), down);
  assert.equal(findDirectionalTarget(current, candidates, -1, 0), null);
});

test("gamepad adjustment steps range and select controls without wrapping", () => {
  const events = [];
  const range = {
    tagName: "INPUT",
    type: "range",
    value: "0.5",
    min: "0",
    max: "1",
    step: "0.1",
    dispatchEvent: (event) => events.push(event.type),
  };
  assert.equal(adjustFormControl(range, 1), true);
  assert.equal(Number(range.value), 0.6);
  assert.deepEqual(events, ["input"]);
  range.value = "1";
  assert.equal(adjustFormControl(range, 1), true);
  assert.equal(range.value, "1");

  const selectEvents = [];
  const select = {
    tagName: "SELECT",
    options: [{}, {}, {}],
    selectedIndex: 1,
    dispatchEvent: (event) => selectEvents.push(event.type),
  };
  assert.equal(adjustFormControl(select, -1), true);
  assert.equal(select.selectedIndex, 0);
  assert.deepEqual(selectEvents, ["change"]);
  assert.equal(adjustFormControl(select, -1), true);
  assert.equal(select.selectedIndex, 0, "select stays at its first option");
});

test("gamepad UI integration focuses and activates the menu default without a gameplay edge", () => {
  const originalDocument = globalThis.document;
  const document = { activeElement: null };
  globalThis.document = document;
  const start = controlAt({ action: "start" }, 100, 180, document);
  const settings = controlAt({ action: "settings" }, 220, 180, document);
  const menu = container([start, settings]);
  const host = focusRoot([start, settings]);
  const game = {
    host,
    state: "menu",
    elements: {
      settingsDialog: { open: false },
      menuLayer: menu,
      pauseLayer: container([]),
      resultsLayer: container([]),
      startButton: start,
      resumeButton: null,
      retryButton: null,
    },
    preferredGamepadFocus: KakiSurfGame.prototype.preferredGamepadFocus,
  };

  try {
    assert.equal(KakiSurfGame.prototype.handleGamepadUi.call(game, { x: 0, y: -1, confirm: false, cancel: false }), true);
    assert.equal(document.activeElement, start);
    assert.equal(start.getAttribute("data-gamepad-focus"), "true");
    KakiSurfGame.prototype.handleGamepadUi.call(game, { x: 0, y: 0, confirm: true, cancel: false });
    assert.equal(start.clicks, 1);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test("gamepad Settings integration adjusts a focused range and B closes the dialog", () => {
  const originalDocument = globalThis.document;
  const document = { activeElement: null };
  globalThis.document = document;
  const range = controlAt({ setting: "effects" }, 180, 100, document, {
    tagName: "INPUT",
    type: "range",
    value: "0.5",
    min: "0",
    max: "1",
    step: "0.1",
  });
  const dialog = container([range]);
  dialog.open = true;
  dialog.querySelector = () => range;
  document.activeElement = range;
  let closed = 0;
  let backed = 0;
  const game = {
    host: focusRoot([range]),
    state: "paused",
    simulation: {},
    audio: { onEvent: (event) => { if (event === "uiBack") backed += 1; } },
    closeSettings: () => { closed += 1; dialog.open = false; },
    elements: {
      settingsDialog: dialog,
      menuLayer: container([]),
      pauseLayer: container([]),
      resultsLayer: container([]),
      startButton: null,
      resumeButton: null,
      retryButton: null,
    },
    preferredGamepadFocus: KakiSurfGame.prototype.preferredGamepadFocus,
  };

  try {
    KakiSurfGame.prototype.handleGamepadUi.call(game, { x: 1, y: 0, confirm: false, cancel: false });
    assert.equal(Number(range.value), 0.6);
    KakiSurfGame.prototype.handleGamepadUi.call(game, { x: 0, y: 0, confirm: false, cancel: true });
    assert.equal(closed, 1);
    assert.equal(backed, 1);
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});

test("resuming through controller UI clears the same A/B press before simulation", () => {
  let clears = 0;
  const game = {
    state: "paused",
    pausedFrom: "manual",
    accumulator: 4,
    announcer: { clear() {} },
    input: { clear: () => { clears += 1; } },
    audio: { setLifecycle() {} },
    elements: { canvas: { focus() {} } },
    showLayer() {},
    announce() {},
  };

  KakiSurfGame.prototype.resume.call(game);
  assert.equal(clears, 1);
  assert.equal(game.state, "running");
  assert.equal(game.accumulator, 0);
});

test("results transition neutralizes held gamepad direction before focusing Retry", () => {
  let clears = 0;
  let focused = 0;
  const game = {
    announcer: { clear() {} },
    input: { clear: () => { clears += 1; } },
    selectedBoard: "foamPuff",
    selectedCondition: "twilightGlass",
    save: createDefaultSave(),
    storage: null,
    renderer: { onEvent() {} },
    audio: { onEvent() {}, setLifecycle() {} },
    simulation: { elapsed: 1 },
    state: "running",
    renderResults() {},
    showLayer() {},
    elements: { retryButton: { focus: () => { focused += 1; } } },
    onRunComplete: null,
    announce() {},
  };

  KakiSurfGame.prototype.handleComplete.call(game, {
    score: 100,
    flow: 20,
    rank: { grade: "C", title: "Clean Line" },
  });
  assert.equal(clears, 1);
  assert.equal(game.state, "results");
  assert.equal(focused, 1);
});

function elementAt(left, top, width = 40, height = 24) {
  return { getBoundingClientRect: () => ({ left, top, width, height }) };
}

function controlAt(dataset, left, top, document, properties = {}) {
  const attributes = new Map();
  return {
    dataset: { ...dataset },
    tagName: properties.tagName ?? "BUTTON",
    type: properties.type ?? "button",
    value: properties.value ?? "",
    min: properties.min ?? "",
    max: properties.max ?? "",
    step: properties.step ?? "",
    hidden: false,
    disabled: false,
    clicks: 0,
    getBoundingClientRect: () => ({ left, top, width: 80, height: 36 }),
    getAttribute: (name) => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, value),
    removeAttribute: (name) => attributes.delete(name),
    closest: () => null,
    focus() { document.activeElement = this; },
    scrollIntoView() {},
    click() { this.clicks += 1; },
    dispatchEvent() {},
  };
}

function container(controls) {
  return {
    controls,
    querySelectorAll: () => controls,
    querySelector: () => null,
    contains: (element) => controls.includes(element),
  };
}

function focusRoot(controls) {
  return {
    querySelectorAll: () => controls.filter((control) => control.getAttribute("data-gamepad-focus") !== null),
  };
}
