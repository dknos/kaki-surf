import test from "node:test";
import assert from "node:assert/strict";

import {
  BUFFER_WINDOW,
  CONTROL_MODES,
  InputManager,
  KEY_BINDINGS,
  UI_REPEAT_DELAY,
  applyDeadZone,
  createInputStep,
  dominantUiDirection,
  pollGamepad,
} from "../js/input.js";

const STEP_FIELDS = [
  "x",
  "y",
  "edge",
  "edgePressed",
  "edgeReleased",
  "turbo",
  "turboPressed",
  "turboReleased",
  "trick1",
  "trick1Pressed",
  "trick1Released",
  "trick2",
  "trick2Pressed",
  "trick2Released",
  "trick3",
  "trick3Pressed",
  "trick3Released",
  "trick4",
  "trick4Pressed",
  "trick4Released",
  "style",
  "stylePressed",
  "styleReleased",
  "trick",
  "trickPressed",
  "trickReleased",
  "special",
  "specialPressed",
  "specialReleased",
  "spinLeft",
  "spinLeftPressed",
  "spinLeftReleased",
  "spinRight",
  "spinRightPressed",
  "spinRightReleased",
];

test("step contract is complete and navigator is optional", () => {
  assert.deepEqual(Object.keys(createInputStep()), STEP_FIELDS);

  const input = new InputManager({ target: new FakeTarget() });
  input.update(0);
  assert.deepEqual(snapshot(input.consumeStep()), createInputStep());
  assert.deepEqual(input.consumeMeta(), {
    restart: false,
    pause: false,
    retry: false,
    debug: false,
  });
  input.destroy();
});

test("gameplay keys leave native settings controls alone", () => {
  const target = new FakeTarget();
  const input = new InputManager({ target, getGamepads: () => [] });
  for (const tagName of ["INPUT", "SELECT", "BUTTON", "TEXTAREA"]) {
    const event = target.dispatch("keydown", { code: "Space", target: { tagName } });
    assert.equal(event.defaultPrevented, false, `${tagName} keeps its native Space behavior`);
    input.update(0);
    assert.equal(input.consumeStep().edgePressed, false);
  }

  const pauseEvent = target.dispatch("keydown", { code: "KeyP", target: { tagName: "BUTTON" } });
  assert.equal(pauseEvent.defaultPrevented, true, "pause remains global when a gameplay button owns focus");
  input.update(0);
  assert.equal(input.consumeMeta().pause, true);
  target.dispatch("keyup", { code: "KeyP", target: { tagName: "BUTTON" } });

  const retryEvent = target.dispatch("keydown", { code: "KeyR", target: { tagName: "BUTTON" } });
  assert.equal(retryEvent.defaultPrevented, true, "the documented R retry remains global on the results button");
  input.update(0);
  assert.equal(input.consumeMeta().restart, true);
  input.destroy();
});

test("Simple mode exposes line input, Action, Turbo, and the context trick", () => {
  const target = new FakeTarget();
  const input = new InputManager({ target, getGamepads: () => [] });
  assert.equal(input.controlMode, CONTROL_MODES.SIMPLE);

  for (const code of ["Space", "ShiftLeft", "KeyF", "KeyT", "KeyQ", "KeyE"]) {
    target.dispatch("keydown", { code });
  }
  input.update(0);
  let step = snapshot(input.consumeStep());
  for (const action of ["edge", "turbo", "trick"]) {
    assert.equal(step[action], true, `${action} held`);
    assert.equal(step[`${action}Pressed`], true, `${action} pressed`);
  }
  for (const action of [
    "special", "spinLeft", "spinRight",
    "trick1", "trick2", "trick3", "trick4", "style",
  ]) {
    assert.equal(step[action], false, `${action} stays inactive in Simple mode`);
    assert.equal(step[`${action}Pressed`], false, `${action} has no hidden Simple edge`);
  }

  for (const code of ["Space", "ShiftLeft", "KeyF", "KeyT", "KeyQ", "KeyE"]) {
    target.dispatch("keyup", { code });
  }
  input.update(0);
  step = snapshot(input.consumeStep());
  for (const action of ["edge", "turbo", "trick"]) {
    assert.equal(step[action], false, `${action} released hold`);
    assert.equal(step[`${action}Released`], true, `${action} release buffered`);
  }
  for (const action of ["special", "spinLeft", "spinRight"]) {
    assert.equal(step[`${action}Released`], false, `${action} never entered Simple state`);
  }

  input.destroy();
});

test("Simple keyboard aliases share one trick edge and Advanced deliberately restores Q/E/F/T", () => {
  const target = new FakeTarget();
  const input = new InputManager({ target, getGamepads: () => [] });

  target.dispatch("keydown", { code: "KeyF" });
  input.update(0);
  assert.equal(input.consumeStep().trickPressed, true);
  target.dispatch("keydown", { code: "KeyX" });
  input.update(0);
  assert.equal(input.consumeStep().trickPressed, false, "F and X are one Simple trick action");
  target.dispatch("keyup", { code: "KeyF" });
  input.update(0);
  assert.equal(input.consumeStep().trickReleased, false, "X keeps the Simple trick held");

  target.dispatch("keydown", { code: "ShiftLeft" });
  input.update(0);
  let shifted = input.consumeStep();
  assert.equal(shifted.turboPressed, true, "Simple mode keeps the common Turbo action");
  assert.equal(shifted.specialPressed, false, "Shift no longer spends an animal special");
  target.dispatch("keydown", { code: "KeyT" });
  input.update(0);
  shifted = input.consumeStep();
  assert.equal(shifted.specialPressed, false, "Simple mode folds mounts into Action or Trick");
  assert.equal(shifted.turboPressed, false, "T does not duplicate Turbo");
  target.dispatch("keyup", { code: "ShiftLeft" });
  input.update(0);
  shifted = input.consumeStep();
  assert.equal(shifted.turboReleased, true);
  assert.equal(shifted.specialReleased, false);
  target.dispatch("keyup", { code: "KeyT" });
  input.update(0);
  assert.equal(input.consumeStep().specialReleased, false);

  assert.equal(input.setControlMode("advanced"), CONTROL_MODES.ADVANCED);
  assert.deepEqual(snapshot(input.consumeStep()), createInputStep(), "mode changes clear every held edge");
  target.dispatch("keyup", { code: "KeyX" });
  target.dispatch("keydown", { code: "KeyF" });
  input.update(0);
  let step = snapshot(input.consumeStep());
  assert.equal(step.trick3Pressed, true);
  assert.equal(step.trick, false);

  assert.equal(input.setControlMode("unsupported"), CONTROL_MODES.SIMPLE);
  assert.deepEqual(snapshot(input.consumeStep()), createInputStep());
  input.destroy();
});

test("Simple keyboard, gamepad, and touch presses survive the shared 120ms edge buffer", () => {
  const keyboardTarget = new FakeTarget();
  const keyboard = new InputManager({ target: keyboardTarget, getGamepads: () => [] });
  keyboardTarget.dispatch("keydown", { code: "KeyF" });
  keyboard.update(BUFFER_WINDOW - 0.001);
  assert.equal(keyboard.consumeStep().trickPressed, true);
  keyboard.destroy();

  const pad = createPad();
  const gamepad = new InputManager({ target: new FakeTarget(), getGamepads: () => [pad] });
  pressButtons(pad, 2);
  gamepad.update(0);
  gamepad.update(BUFFER_WINDOW - 0.001);
  assert.equal(gamepad.consumeStep().trickPressed, true);
  gamepad.destroy();

  const trickButton = new FakeButton("trick");
  const touch = new InputManager({
    target: new FakeTarget(),
    touchRoot: new FakeTouchRoot([trickButton]),
    getGamepads: () => [],
  });
  trickButton.dispatch("pointerdown", { pointerId: 1 });
  touch.update(BUFFER_WINDOW - 0.001);
  assert.equal(touch.consumeStep().trickPressed, true);
  touch.destroy();
});

test("Q, E, F, and T produce one buffered press, a held state, and a buffered release", () => {
  const target = new FakeTarget();
  const input = createManager(target);
  const mappings = [
    ["KeyQ", "trick1"],
    ["KeyE", "trick2"],
    ["KeyF", "trick3"],
    ["KeyT", "trick4"],
  ];

  for (const [code, action] of mappings) {
    assert.equal(target.dispatch("keydown", { code }).defaultPrevented, true);
    input.update(0);
    let step = snapshot(input.consumeStep());
    assert.equal(step[action], true, `${code} should hold ${action}`);
    assert.equal(step[`${action}Pressed`], true, `${code} should press ${action}`);
    assert.equal(step[`${action}Released`], false);

    input.update(0.016);
    step = snapshot(input.consumeStep());
    assert.equal(step[action], true, `${action} stays held`);
    assert.equal(step[`${action}Pressed`], false, `${action} press is discrete`);

    assert.equal(target.dispatch("keyup", { code }).defaultPrevented, true);
    input.update(0);
    step = snapshot(input.consumeStep());
    assert.equal(step[action], false);
    assert.equal(step[`${action}Released`], true, `${code} should release ${action}`);

    if (action === "trick1") {
      assert.equal(step.style, step.trick1);
      assert.equal(step.stylePressed, step.trick1Pressed);
      assert.equal(step.styleReleased, step.trick1Released);
    }
  }

  input.destroy();
});

test("pressed and released edges remain available for about 120ms, then expire", () => {
  const target = new FakeTarget();
  const input = createManager(target);

  target.dispatch("keydown", { code: "KeyF" });
  input.update(0);
  input.update(BUFFER_WINDOW - 0.001);
  assert.equal(input.consumeStep().trick3Pressed, true);

  target.dispatch("keyup", { code: "KeyF" });
  input.update(0);
  input.update(BUFFER_WINDOW - 0.001);
  assert.equal(input.consumeStep().trick3Released, true);

  target.dispatch("keydown", { code: "KeyE" });
  input.update(0);
  input.update(BUFFER_WINDOW + 0.001);
  let step = snapshot(input.consumeStep());
  assert.equal(step.trick2, true);
  assert.equal(step.trick2Pressed, false);

  target.dispatch("keyup", { code: "KeyE" });
  input.update(0);
  input.update(BUFFER_WINDOW + 0.001);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick2, false);
  assert.equal(step.trick2Released, false);

  input.destroy();
});

test("keyboard repeat and overlapping X/C aliases never duplicate a trick1 edge", () => {
  const target = new FakeTarget();
  const input = createManager(target);

  target.dispatch("keydown", { code: "KeyX" });
  input.update(0);
  let step = snapshot(input.consumeStep());
  assert.equal(step.trick1Pressed, true);
  assertLegacyStyle(step);

  target.dispatch("keydown", { code: "KeyX", repeat: true });
  target.dispatch("keydown", { code: "KeyX", repeat: true });
  input.update(0.016);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick1, true);
  assert.equal(step.trick1Pressed, false);

  target.dispatch("keydown", { code: "KeyC" });
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick1, true);
  assert.equal(step.trick1Pressed, false, "a second alias is not a second logical press");

  target.dispatch("keyup", { code: "KeyX" });
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick1, true);
  assert.equal(step.trick1Released, false, "one alias can keep trick1 held");

  target.dispatch("keyup", { code: "KeyC" });
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick1, false);
  assert.equal(step.trick1Released, true);
  assertLegacyStyle(step);

  target.dispatch("keydown", { code: "KeyC" });
  input.update(0);
  assert.equal(input.consumeStep().trick1Pressed, true, "C also starts trick1 by itself");

  input.destroy();
});

test("directions, edge aliases, pause, restart, and bound-key default prevention are preserved", () => {
  const target = new FakeTarget();
  const input = createManager(target);

  target.dispatch("keydown", { code: "ArrowLeft" });
  target.dispatch("keydown", { code: "KeyW" });
  target.dispatch("keydown", { code: "Space" });
  input.update(0);
  let step = snapshot(input.consumeStep());
  assert.equal(step.x, -1);
  assert.equal(step.y, -1);
  assert.equal(step.edge, true);
  assert.equal(step.edgePressed, true);

  target.dispatch("keydown", { code: "KeyZ" });
  target.dispatch("keyup", { code: "Space" });
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.equal(step.edge, true);
  assert.equal(step.edgePressed, false);
  assert.equal(step.edgeReleased, false);

  target.dispatch("keyup", { code: "KeyZ" });
  input.update(0);
  assert.equal(input.consumeStep().edgeReleased, true);

  target.dispatch("keydown", { code: "KeyR" });
  target.dispatch("keydown", { code: "Escape" });
  assert.deepEqual(input.consumeMeta(), {
    restart: true,
    pause: true,
    retry: false,
    debug: false,
  });

  input.clear();
  for (const code of new Set(Object.values(KEY_BINDINGS).flat())) {
    assert.equal(target.dispatch("keydown", { code }).defaultPrevented, true, `${code} keydown`);
    assert.equal(target.dispatch("keyup", { code }).defaultPrevented, true, `${code} keyup`);
  }

  input.destroy();
});

test("gamepad mappings expose all actions and keep B retry separate from live restart", () => {
  const target = new FakeTarget();
  const pad = createPad();
  const input = new InputManager({
    target,
    getGamepads: () => [pad],
    controlMode: CONTROL_MODES.ADVANCED,
  });

  pressButtons(pad, 15, 12, 0, 2, 3, 1, 6, 9);
  input.update(0);
  let step = snapshot(input.consumeStep());
  assert.equal(step.x, 1);
  assert.equal(step.y, -1);
  for (const action of ["edge", "trick1", "trick2", "trick3", "trick4"]) {
    assert.equal(step[action], true, `${action} held`);
    assert.equal(step[`${action}Pressed`], true, `${action} pressed`);
  }
  assertLegacyStyle(step);
  assert.deepEqual(input.consumeMeta(), {
    restart: false,
    pause: true,
    retry: true,
    debug: false,
  });

  input.update(0.016);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick3, true);
  assert.equal(step.trick3Pressed, false);
  assert.deepEqual(input.consumeMeta(), {
    restart: false,
    pause: false,
    retry: false,
    debug: false,
  });

  releaseButtons(pad);
  input.update(0);
  step = snapshot(input.consumeStep());
  for (const action of ["edge", "trick1", "trick2", "trick3", "trick4"]) {
    assert.equal(step[action], false, `${action} released hold`);
    assert.equal(step[`${action}Released`], true, `${action} release edge`);
  }

  pad.axes = [0.5, -0.5];
  pressButtons(pad, 7, 4, 5, 11);
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.ok(step.x > 0 && step.x < 0.5, "left stick uses its dead zone");
  assert.ok(step.y < 0 && step.y > -0.5, "left stick uses its dead zone");
  assert.equal(step.edgePressed, true, "RT maps edge");
  assert.equal(step.trick1Pressed, true, "LB maps trick1");
  assert.equal(step.trick2Pressed, true, "RB maps trick2");
  assert.equal(step.trick4Pressed, true, "R3 maps trick4");
  assert.equal(step.trick3, false);

  target.dispatch("keydown", { code: "KeyR" });
  assert.equal(input.consumeMeta().restart, true, "keyboard R remains the restart edge");
  input.destroy();
});

test("an active second controller wins over an idle first controller", () => {
  const idle = createPad();
  const active = createPad();
  active.axes[0] = -0.8;
  pressButtons(active, 0);
  const input = new InputManager({ target: new FakeTarget(), getGamepads: () => [idle, active] });

  input.update(0);
  const step = input.consumeStep();
  assert.ok(step.x < -0.7);
  assert.equal(step.edgePressed, true);
  input.destroy();
});

test("gamepad UI input has discrete confirm/back edges and deliberate directional repeat", () => {
  const pad = createPad();
  const input = new InputManager({ target: new FakeTarget(), getGamepads: () => [pad] });

  pad.axes[0] = 0.85;
  input.update(0);
  assert.deepEqual(input.consumeUi(), { x: 1, y: 0, confirm: false, cancel: false });

  input.update(UI_REPEAT_DELAY - 0.01);
  assert.deepEqual(input.consumeUi(), { x: 0, y: 0, confirm: false, cancel: false });
  input.update(0.02);
  assert.deepEqual(input.consumeUi(), { x: 1, y: 0, confirm: false, cancel: false });
  input.update(0.01);
  assert.deepEqual(input.consumeUi(), { x: 0, y: 0, confirm: false, cancel: false }, "repeat rebases after a missed frame");

  pad.axes[0] = 0;
  pressButtons(pad, 0);
  input.update(0);
  assert.deepEqual(input.consumeUi(), { x: 0, y: 0, confirm: true, cancel: false });
  input.update(0.5);
  assert.deepEqual(input.consumeUi(), { x: 0, y: 0, confirm: false, cancel: false }, "held A never repeats");

  pressButtons(pad, 1);
  input.update(0);
  assert.deepEqual(input.consumeUi(), { x: 0, y: 0, confirm: false, cancel: true });
  input.clear();
  assert.deepEqual(input.consumeUi(), { x: 0, y: 0, confirm: false, cancel: false });

  input.update(0);
  assert.deepEqual(input.consumeUi(), { x: 0, y: 0, confirm: false, cancel: false }, "clear suppresses held UI buttons");
  releaseButtons(pad);
  input.update(0);
  pressButtons(pad, 0);
  input.update(0);
  assert.equal(input.consumeUi().confirm, true, "confirm returns after the pad reaches neutral");
  input.destroy();
});

test("UI direction rejects drift and resolves diagonals to one dominant axis", () => {
  assert.deepEqual(dominantUiDirection(0.49, -0.49), { x: 0, y: 0 });
  assert.deepEqual(dominantUiDirection(-0.8, 0.55), { x: -1, y: 0 });
  assert.deepEqual(dominantUiDirection(0.55, 0.9), { x: 0, y: 1 });
  assert.deepEqual(dominantUiDirection(-1, -1), { x: -1, y: 0 });
});

test("gamepad polling walks sparse pad lists without an intermediate array pipeline", () => {
  const idle = createPad();
  const active = createPad();
  pressButtons(active, 0);
  const pads = { 0: null, 2: idle, 4: active, length: 5 };
  const snapshot = pollGamepad(() => pads);
  assert.equal(snapshot.edge, true);
  assert.equal(snapshot.uiConfirm, true);
  assert.equal(pollGamepad(() => null).connected, false);
  assert.equal(pollGamepad(() => { throw new Error("denied"); }).connected, false);
});

test("Simple gamepad maps A/RT, L3 Turbo, and X/B without exposing Special or spin buttons", () => {
  const pad = createPad();
  const input = new InputManager({ target: new FakeTarget(), getGamepads: () => [pad] });

  pressButtons(pad, 0, 7, 10, 2, 1, 3, 4, 5);
  input.update(0);
  let step = snapshot(input.consumeStep());
  for (const action of ["edge", "turbo", "trick"]) {
    assert.equal(step[action], true, `${action} held`);
    assert.equal(step[`${action}Pressed`], true, `${action} pressed`);
  }
  for (const action of [
    "special", "spinLeft", "spinRight",
    "trick1", "trick2", "trick3", "trick4",
  ]) {
    assert.equal(step[action], false, `${action} inactive`);
  }
  assert.equal(input.consumeMeta().retry, true, "B remains the results retry edge");

  releaseButtons(pad);
  input.update(0);
  step = snapshot(input.consumeStep());
  for (const action of ["edge", "turbo", "trick"]) {
    assert.equal(step[`${action}Released`], true, `${action} released`);
  }
  for (const action of ["special", "spinLeft", "spinRight"]) {
    assert.equal(step[`${action}Released`], false, `${action} was never active`);
  }
  input.destroy();
});

test("touch tracks independent direction and action pointers with visible active states", () => {
  const controls = [
    "left",
    "right",
    "up",
    "edge",
    "turbo",
    "trick1",
    "trick2",
    "trick3",
    "trick4",
    "style",
  ];
  const buttons = Object.fromEntries(controls.map((control) => [control, new FakeButton(control)]));
  const root = new FakeTouchRoot(Object.values(buttons));
  const input = new InputManager({
    target: new FakeTarget(),
    touchRoot: root,
    getGamepads: () => [],
    controlMode: CONTROL_MODES.ADVANCED,
  });

  const active = ["left", "up", "edge", "turbo", "trick1", "trick2", "trick3", "trick4"];
  active.forEach((control, index) => buttons[control].dispatch("pointerdown", { pointerId: index + 1 }));
  input.update(0);
  let step = snapshot(input.consumeStep());
  assert.equal(step.x, -1);
  assert.equal(step.y, -1);
  for (const action of ["edge", "turbo", "trick1", "trick2", "trick3", "trick4"]) {
    assert.equal(step[action], true);
    assert.equal(step[`${action}Pressed`], true);
  }
  for (const control of active) assert.equal(buttons[control].classList.contains("is-active"), true);

  buttons.right.dispatch("pointerdown", { pointerId: 20 });
  input.update(0);
  assert.equal(input.consumeStep().x, 0, "opposing independent pointers cancel");
  buttons.right.dispatch("pointerup", { pointerId: 20 });
  input.update(0);
  assert.equal(input.consumeStep().x, -1, "releasing right preserves held left");
  assert.equal(buttons.left.classList.contains("is-active"), true);
  assert.equal(buttons.right.classList.contains("is-active"), false);

  buttons.trick2.dispatch("pointerdown", { pointerId: 21 });
  buttons.trick2.dispatch("pointerup", { pointerId: 6 });
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick2, true, "another pointer keeps the same button held");
  assert.equal(step.trick2Released, false);
  assert.equal(buttons.trick2.classList.contains("is-active"), true);
  buttons.trick2.dispatch("pointercancel", { pointerId: 21 });
  input.update(0);
  assert.equal(input.consumeStep().trick2Released, true);

  buttons.style.dispatch("pointerdown", { pointerId: 30 });
  buttons.trick1.dispatch("pointerup", { pointerId: 5 });
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick1, true, "legacy style touch control maps to trick1");
  assertLegacyStyle(step);
  buttons.style.dispatch("lostpointercapture", { pointerId: 30 });
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick1, false);
  assert.equal(step.trick1Released, true);
  assert.equal(buttons.style.classList.contains("is-active"), false);

  input.destroy();
});

test("Simple multitouch keeps direction, Action, Turbo, and Trick independent while hiding extra systems", () => {
  const controls = ["left", "up", "edge", "turbo", "trick", "special", "spinLeft", "spinRight"];
  const buttons = Object.fromEntries(controls.map((control) => [control, new FakeButton(control)]));
  const input = new InputManager({
    target: new FakeTarget(),
    touchRoot: new FakeTouchRoot(Object.values(buttons)),
    getGamepads: () => [],
  });

  controls.forEach((control, index) => buttons[control].dispatch("pointerdown", { pointerId: index + 1 }));
  input.update(0);
  let step = snapshot(input.consumeStep());
  assert.equal(step.x, -1);
  assert.equal(step.y, -1);
  for (const action of ["edge", "turbo", "trick"]) {
    assert.equal(step[action], true, `${action} held`);
    assert.equal(step[`${action}Pressed`], true, `${action} pressed`);
  }
  for (const action of ["special", "spinLeft", "spinRight"]) {
    assert.equal(step[action], false, `${action} is unavailable in Simple mode`);
  }

  buttons.trick.dispatch("pointerdown", { pointerId: 20 });
  buttons.trick.dispatch("pointerup", { pointerId: 5 });
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick, true, "a second pointer keeps TRICK held");
  assert.equal(step.trickReleased, false);
  buttons.trick.dispatch("pointercancel", { pointerId: 20 });
  input.update(0);
  assert.equal(input.consumeStep().trickReleased, true);

  input.destroy();
});

test("clear, blur, and destroy reset every held, buffered, and previous state", () => {
  const target = new FakeTarget();
  const edgeButton = new FakeButton("edge");
  const pad = createPad();
  pressButtons(pad, 1, 9);
  const input = new InputManager({
    target,
    touchRoot: new FakeTouchRoot([edgeButton]),
    getGamepads: () => [pad],
    controlMode: CONTROL_MODES.ADVANCED,
  });

  target.dispatch("keydown", { code: "KeyQ" });
  target.dispatch("keydown", { code: "KeyR" });
  edgeButton.dispatch("pointerdown", { pointerId: 1 });
  input.update(0);
  target.dispatch("keyup", { code: "KeyQ" });
  input.clear();

  assert.deepEqual(snapshot(input.consumeStep()), createInputStep());
  assert.deepEqual(input.consumeMeta(), {
    restart: false,
    pause: false,
    retry: false,
    debug: false,
  });
  assert.equal(input.keys.size, 0);
  assert.equal(input.touchPointers.size, 0);
  assert.equal(edgeButton.classList.contains("is-active"), false);
  assert.equal(Object.values(input.previousActions).every((value) => value === false), true);
  assert.deepEqual(Object.values(input.previousMeta), [false, false, false, false]);

  input.update(0);
  let step = snapshot(input.consumeStep());
  assert.equal(step.trick3, false, "clear suppresses a stale gamepad hold until neutral");
  assert.deepEqual(input.consumeMeta(), {
    restart: false,
    pause: false,
    retry: false,
    debug: false,
  });

  releaseButtons(pad);
  input.update(0);
  pressButtons(pad, 1);
  input.update(0);
  step = snapshot(input.consumeStep());
  assert.equal(step.trick3Pressed, true, "a fresh gamepad press works after neutral");
  assert.deepEqual(input.consumeMeta(), {
    restart: false,
    pause: false,
    retry: true,
    debug: false,
  });

  target.dispatch("blur");
  assert.deepEqual(snapshot(input.consumeStep()), createInputStep());
  assert.deepEqual(input.consumeMeta(), {
    restart: false,
    pause: false,
    retry: false,
    debug: false,
  });

  edgeButton.dispatch("pointerdown", { pointerId: 2 });
  target.dispatch("keydown", { code: "KeyE" });
  input.update(0);
  input.destroy();
  assert.equal(input.enabled, false);
  assert.deepEqual(snapshot(input.consumeStep()), createInputStep());
  assert.equal(edgeButton.classList.contains("is-active"), false);
});

test("dead-zone helper is deterministic for external adapters", () => {
  assert.equal(applyDeadZone(0.18), 0);
  assert.equal(applyDeadZone(-0.1), 0);
  assert.equal(applyDeadZone(Number.NaN), 0);
  assert.equal(applyDeadZone(1), 1);
  assert.equal(applyDeadZone(-1), -1);
});

function createManager(target) {
  return new InputManager({
    target,
    getGamepads: () => [],
    controlMode: CONTROL_MODES.ADVANCED,
  });
}

function snapshot(step) {
  return { ...step };
}

function assertLegacyStyle(step) {
  assert.equal(step.style, step.trick1);
  assert.equal(step.stylePressed, step.trick1Pressed);
  assert.equal(step.styleReleased, step.trick1Released);
}

function createPad() {
  return {
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
}

function pressButtons(pad, ...indices) {
  for (const index of indices) {
    pad.buttons[index].pressed = true;
    pad.buttons[index].value = 1;
  }
}

function releaseButtons(pad) {
  for (const button of pad.buttons) {
    button.pressed = false;
    button.value = 0;
  }
}

class FakeTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    options.signal?.addEventListener("abort", () => listeners.delete(listener), { once: true });
  }

  dispatch(type, properties = {}) {
    const event = {
      defaultPrevented: false,
      repeat: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
      ...properties,
    };
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
    return event;
  }
}

class FakeButton extends FakeTarget {
  constructor(control) {
    super();
    this.dataset = { control };
    this.classes = new Set();
    this.classList = {
      contains: (name) => this.classes.has(name),
      toggle: (name, active) => {
        if (active) this.classes.add(name);
        else this.classes.delete(name);
        return active;
      },
    };
    this.capturedPointers = new Set();
  }

  setPointerCapture(pointerId) {
    this.capturedPointers.add(pointerId);
  }
}

class FakeTouchRoot {
  constructor(buttons) {
    this.buttons = buttons;
  }

  querySelectorAll(selector) {
    assert.equal(selector, "[data-control]");
    return this.buttons;
  }
}
