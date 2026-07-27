import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, FIXED_STEP, TUNING } from "../js/config.js";
import { CONTROL_MODES, InputManager } from "../js/input.js";
import { SurfSimulation } from "../js/simulation.js";

const MAX_AIR_STEPS = 420;

test("an 80ms Simple touch tap completes one visible trick on an ordinary air", () => {
  const harness = createHarness({ board: BOARDS.foamPuff });
  launch(harness, { speed: 40, charge: 0, faceVelocity: -0.1, slopeDrive: -0.1 });

  touchTap(harness, "trick", 0.08);
  runUntil(
    harness,
    () => harness.simulation.aerialSession?.manifest.sequence[0]?.complete
      && harness.simulation.aerialSession.active.length === 0,
  );

  const sequence = harness.simulation.aerialSession.manifest.sequence;
  assert.equal(sequence.length, 1);
  assert.equal(sequence[0].id, "frontRailGrab");
  assert.equal(sequence[0].complete, true);
  assert.equal(eventCount(harness, "trickQueued"), 1);
  assert.equal(eventCount(harness, "trickStarted"), 1);
  assert.equal(eventCount(harness, "trickCompleted"), 1);
});

test("a 220ms directional Simple touch hold selects and completes Stalefish", () => {
  const harness = createHarness({ board: BOARDS.mangoFish });
  launch(harness, { speed: 80, charge: 0.5 });
  stickDown(harness);
  harness.step();

  pointerDown(harness.button("trick"), 11);
  harness.advance(0.22);
  pointerUp(harness.button("trick"), 11);
  harness.step();
  runUntil(harness, () => harness.simulation.aerialSession?.manifest.sequence[0]?.complete);
  stickUp(harness);

  const entry = harness.simulation.aerialSession.manifest.sequence[0];
  assert.equal(entry.id, "tailGrab");
  assert.equal(entry.complete, true);
  assert.ok(entry.heldDuration >= TUNING.simpleGrabHoldThreshold);
});

test("pointer down and up between render frames survive into the fixed-step trick buffer", () => {
  const harness = createHarness({ board: BOARDS.foamPuff });
  launch(harness, { speed: 40, charge: 0, faceVelocity: -0.1, slopeDrive: -0.1 });

  pointerDown(harness.button("trick"), 12);
  pointerUp(harness.button("trick"), 12);
  harness.step();
  runUntil(harness, () => harness.simulation.aerialSession?.manifest.sequence[0]?.complete);

  assert.equal(harness.simulation.aerialSession.manifest.sequence[0]?.id, "frontRailGrab");
  assert.equal(harness.simulation.trickIntents.history.length, 1);
});

test("a Simple tap 250ms before takeoff stays queued without switching stance", () => {
  const harness = createHarness({ board: BOARDS.mangoFish });

  touchTap(harness, "trick", 0.08);
  harness.advance(0.16);
  assert.equal(harness.simulation.player.ridingStance, "regular");
  assert.equal(harness.simulation.player.contextTrick.pending, true);

  launch(harness, { speed: 96, charge: 0.8 });
  runUntil(harness, () => harness.simulation.aerialSession?.manifest.sequence[0]?.complete);

  assert.equal(harness.simulation.player.ridingStance, "regular");
  assert.equal(harness.simulation.player.stanceSwitches, 0);
  assert.equal(harness.simulation.aerialSession.manifest.sequence[0]?.id, "boardVarial");
});

test("Down plus a grounded touch tap is the explicit Simple stance gesture", () => {
  const harness = createHarness({ board: BOARDS.foamPuff });
  stickDown(harness);
  harness.step();
  pointerDown(harness.button("trick"), 13);
  pointerUp(harness.button("trick"), 13);
  harness.step();

  assert.equal(harness.simulation.player.ridingStance, "goofy");
  assert.equal(harness.simulation.player.stanceSwitches, 1);
  assert.equal(harness.simulation.trickIntents.queue.length, 0);
  assert.equal(eventCount(harness, "stanceSwitch"), 1);
  stickUp(harness);
});

test("the same Simple tap falls back on low air and chains deterministically on large air", () => {
  const low = createHarness({ board: BOARDS.foamPuff });
  launch(low, { speed: 40, charge: 0, faceVelocity: -0.1, slopeDrive: -0.1 });
  touchTap(low, "trick", 0.08);
  runUntil(low, () => low.simulation.aerialSession?.manifest.sequence[0]?.complete);
  assert.equal(low.simulation.aerialSession.manifest.sequence[0]?.id, "frontRailGrab");
  assert.equal(low.simulation.aerialSession.manifest.sequence[0]?.fallbackFrom, "boardVarial");

  const large = createHarness({ board: BOARDS.mangoFish });
  launch(large, { speed: 96, charge: 0.8 });
  touchTap(large, "trick", 0.08);
  runUntil(large, () => large.simulation.aerialSession?.manifest.sequence[0]?.complete);
  assert.equal(large.simulation.aerialSession.manifest.sequence[0]?.id, "boardVarial");

  touchTap(large, "trick", 0.08, 22);
  runUntil(large, () => large.simulation.aerialSession?.manifest.sequence[1]?.complete);
  assert.deepEqual(
    large.simulation.aerialSession.manifest.sequence.slice(0, 2).map((entry) => entry.id),
    ["boardVarial", "frontRailGrab"],
  );
});

test("an exceptional Simple air exposes the full ordered chain through Kaki Twist", () => {
  const harness = createHarness({ board: BOARDS.moonLog });
  launch(harness, { speed: 150, charge: 1 });

  for (let index = 0; index < 4; index += 1) {
    touchTap(harness, "trick", 0.08, 60 + index);
    runUntil(
      harness,
      () => harness.simulation.aerialSession?.manifest.sequence[index]?.complete
        && !harness.simulation.aerialSession.active.some(
          (entry) => entry === harness.simulation.aerialSession.manifest.sequence[index],
        ),
    );
  }

  assert.deepEqual(
    harness.simulation.aerialSession.manifest.sequence.map((entry) => entry.id),
    ["boardVarial", "frontRailGrab", "tailGrab", "kakiTwist"],
  );
});

test("Simple landing safety auto-releases a held touch grab before contact", () => {
  const harness = createHarness({ board: BOARDS.mangoFish });
  launch(harness, { speed: 80, charge: 0.5 });
  pointerDown(harness.button("trick"), 14);
  harness.advance(0.24);
  runUntil(harness, () => harness.simulation.aerialSession?.active[0]?.complete);

  const player = harness.simulation.player;
  const surfaceY = harness.simulation.wave.ridingY(player.airX, player.landingFace);
  const surfaceAngle = harness.simulation.wave.slopeAt(player.airX, player.landingFace);
  Object.assign(player, {
    airY: surfaceY - 6,
    previousAirY: surfaceY - 6,
    airVY: 55,
    boardAngle: surfaceAngle,
    bodyAngle: surfaceAngle,
    angularVelocity: 0,
    rotationAccum: 0,
  });

  runUntil(harness, () => eventCount(harness, "trickAutoReleased") === 1, 30);
  const heldAtRelease = harness.simulation.aerialSession.manifest.sequence[0].heldDuration;
  runUntil(harness, () => harness.simulation.player.state !== "airborne", 90);

  assert.equal(eventCount(harness, "trickAutoReleased"), 1);
  assert.notEqual(harness.simulation.player.state, "wipeout");
  assert.equal(
    harness.simulation.aerialSession.manifest.sequence[0].heldDuration,
    heldAtRelease,
    "automatic release cannot keep adding hold score",
  );
  harness.step(5);
  assert.equal(
    harness.simulation.trickIntents.queue.length,
    0,
    "the same still-held pointer cannot re-arm after landing",
  );
  pointerUp(harness.button("trick"), 14);
});

test("Advanced F queues before minStartAirtime and starts without a second press", () => {
  const harness = createHarness({
    board: BOARDS.mangoFish,
    controlMode: CONTROL_MODES.ADVANCED,
  });
  launch(harness, { speed: 80, charge: 0.5 });
  harness.events.length = 0;

  touchTapBetweenSteps(harness, "trick", 31);
  assert.equal(eventCount(harness, "trickQueued"), 1);
  assert.equal(eventCount(harness, "trickStarted"), 0);
  runUntil(harness, () => eventCount(harness, "trickStarted") === 1);

  assert.equal(harness.simulation.aerialSession.manifest.sequence[0]?.id, "boardVarial");
  assert.equal(eventCount(harness, "trickStarted"), 1);
});

test("Advanced T waits for real height eligibility and then starts the original press", () => {
  const harness = createHarness({
    board: BOARDS.moonLog,
    controlMode: CONTROL_MODES.ADVANCED,
  });
  launch(harness, { speed: 80, charge: 1 });
  runUntil(
    harness,
    () => harness.simulation.player.maxAirHeight >= 46
      && harness.simulation.player.maxAirHeight < 52
      && harness.simulation.player.airVY < 0,
  );
  harness.events.length = 0;

  touchTapBetweenSteps(harness, "special", 32);
  assert.equal(eventCount(harness, "trickQueued"), 1);
  assert.equal(eventCount(harness, "trickStarted"), 0);
  runUntil(harness, () => eventCount(harness, "trickStarted") === 1, 80);

  assert.equal(harness.simulation.aerialSession.manifest.sequence[0]?.id, "kakiTwist");
  assert.ok(harness.simulation.aerialSession.manifest.maxHeight >= 52);
});

test("Advanced touch presses between steps retain their physical order", () => {
  const harness = createHarness({
    board: BOARDS.moonLog,
    controlMode: CONTROL_MODES.ADVANCED,
  });
  launch(harness, { speed: 80, charge: 1 });
  runUntil(
    harness,
    () => harness.simulation.player.maxAirHeight >= 46
      && harness.simulation.player.maxAirHeight < 52
      && harness.simulation.player.airVY < 0,
  );

  pointerDown(harness.button("special"), 71);
  pointerUp(harness.button("special"), 71);
  pointerDown(harness.button("trick"), 72);
  pointerUp(harness.button("trick"), 72);
  harness.step();
  assert.deepEqual(
    harness.simulation.trickIntents.queue.map((intent) => intent.id),
    ["kakiTwist", "boardVarial"],
  );
  assert.ok(
    harness.simulation.trickIntents.queue[0].inputOrder
      < harness.simulation.trickIntents.queue[1].inputOrder,
  );

  runUntil(harness, () => harness.simulation.aerialSession.manifest.sequence.length === 2, 90);
  assert.deepEqual(
    harness.simulation.aerialSession.manifest.sequence.map((entry) => entry.id),
    ["kakiTwist", "boardVarial"],
  );
});

test("Advanced quick grabs synthesize one readable minimum while real holds extend normally", () => {
  const quick = createHarness({
    board: BOARDS.mangoFish,
    controlMode: CONTROL_MODES.ADVANCED,
  });
  launch(quick, { speed: 80, charge: 0.5 });
  touchTapBetweenSteps(quick, "spinLeft", 33);
  runUntil(
    quick,
    () => quick.simulation.aerialSession?.manifest.sequence[0]?.complete
      && quick.simulation.aerialSession.active.length === 0,
  );
  const quickEntry = quick.simulation.aerialSession.manifest.sequence[0];
  assert.equal(quickEntry.id, "frontRailGrab");
  assert.ok(quickEntry.heldDuration >= TUNING.advancedQuickGrabMinimum);
  assert.ok(quickEntry.heldDuration < TUNING.advancedQuickGrabMinimum + 0.03);
  assert.equal(quick.simulation.aerialSession.manifest.sequence.length, 1);

  const held = createHarness({
    board: BOARDS.mangoFish,
    controlMode: CONTROL_MODES.ADVANCED,
  });
  launch(held, { speed: 80, charge: 0.5 });
  pointerDown(held.button("spinRight"), 34);
  held.advance(0.38);
  pointerUp(held.button("spinRight"), 34);
  held.step();
  runUntil(held, () => held.simulation.aerialSession.active.length === 0);
  const heldEntry = held.simulation.aerialSession.manifest.sequence[0];
  assert.equal(heldEntry.id, "tailGrab");
  assert.ok(
    heldEntry.heldDuration > quickEntry.heldDuration + 0.05,
    "time physically held after entry extends beyond the quick-tap minimum",
  );
  assert.equal(held.simulation.aerialSession.manifest.sequence.length, 1);
});

test("Advanced hold risk remains and repeated pointerdown cannot farm entries", () => {
  const risk = createHarness({
    board: BOARDS.mangoFish,
    controlMode: CONTROL_MODES.ADVANCED,
  });
  launch(risk, { speed: 80, charge: 0.5 });
  pointerDown(risk.button("spinLeft"), 35);
  risk.advance(0.22);
  const player = risk.simulation.player;
  const surfaceY = risk.simulation.wave.ridingY(player.airX, player.landingFace);
  const surfaceAngle = risk.simulation.wave.slopeAt(player.airX, player.landingFace);
  Object.assign(player, {
    airY: surfaceY - 2,
    previousAirY: surfaceY - 2,
    airVY: 70,
    boardAngle: surfaceAngle,
    bodyAngle: surfaceAngle,
  });
  runUntil(risk, () => risk.simulation.player.state === "wipeout", 30);
  assert.equal(risk.simulation.player.wipeoutCause, "heldTrickLanding");

  const repeat = createHarness({
    board: BOARDS.mangoFish,
    controlMode: CONTROL_MODES.ADVANCED,
  });
  launch(repeat, { speed: 96, charge: 0.8 });
  pointerDown(repeat.button("trick"), 36);
  for (let step = 0; step < 90; step += 1) {
    if (step % 8 === 0) pointerDown(repeat.button("trick"), 36);
    repeat.step();
  }
  pointerUp(repeat.button("trick"), 36);
  repeat.step();
  assert.equal(repeat.simulation.aerialSession.manifest.sequence.length, 1);
  assert.equal(repeat.simulation.aerialSession.manifest.sequence[0].id, "boardVarial");
  assert.equal(eventCount(repeat, "trickStarted"), 1);
});

test("an impossible Advanced touch request expires once and is cleared at air end", () => {
  const harness = createHarness({
    board: BOARDS.foamPuff,
    controlMode: CONTROL_MODES.ADVANCED,
  });
  launch(harness, { speed: 40, charge: 0, faceVelocity: -0.1, slopeDrive: -0.1 });
  harness.events.length = 0;
  touchTapBetweenSteps(harness, "special", 37);
  harness.advance(0.5);

  const rejections = harness.events.filter(
    (event) => event.type === "trickRejected" && event.payload.expired,
  );
  assert.equal(rejections.length, 1);
  assert.match(rejections[0].payload.hint, /POP/);
  assert.equal(harness.simulation.aerialSession.manifest.sequence.length, 0);

  runUntil(harness, () => harness.simulation.player.state !== "airborne", MAX_AIR_STEPS);
  harness.advance(0.2);
  assert.equal(
    harness.events.filter((event) => event.type === "trickRejected").length,
    1,
  );
  assert.equal(harness.simulation.trickIntents.queue.length, 0);
});

test("keyboard, gamepad, and touch create the same Advanced discrete-trick manifest", () => {
  const manifests = ["keyboard", "gamepad", "touch"].map(runAdvancedVarial);
  assert.deepEqual(manifests[1], manifests[0]);
  assert.deepEqual(manifests[2], manifests[0]);
});

function createHarness({
  board = BOARDS.foamPuff,
  controlMode = CONTROL_MODES.SIMPLE,
  pad = null,
} = {}) {
  const target = new FakeTarget();
  const controls = ["edge", "turbo", "spinLeft", "spinRight", "trick", "special"]
    .map((control) => new FakeButton(control));
  const stick = new FakeTouchStick();
  const input = new InputManager({
    target,
    touchRoot: new FakeTouchRoot(controls, stick),
    getGamepads: () => (pad ? [pad] : []),
    controlMode,
  });
  const simulation = new SurfSimulation({ seed: 0x54524943 });
  simulation.tutorialEnabled = false;
  simulation.reset({ board, controlMode, mode: "endless" });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "riding",
    stateTime: 1,
    x: 260,
    previousX: 260,
    face: 0.48,
    previousFace: 0.48,
    speed: 72,
  });
  simulation.wave.curlX = -1_000;
  simulation.consumeEvents(() => {});
  const events = [];

  const harness = {
    target,
    pad,
    input,
    simulation,
    controls: new Map(controls.map((button) => [button.dataset.control, button])),
    stick,
    events,
    button(control) {
      return this.controls.get(control);
    },
    step(count = 1) {
      for (let index = 0; index < count; index += 1) {
        this.input.update(FIXED_STEP);
        this.simulation.update(FIXED_STEP, { ...this.input.consumeStep() });
        this.simulation.consumeEvents((event) => this.events.push(event));
      }
    },
    advance(seconds) {
      this.step(Math.max(1, Math.round(seconds / FIXED_STEP)));
    },
  };
  return harness;
}

function launch(harness, {
  speed = 80,
  charge = 0.5,
  faceVelocity = -0.85,
  slopeDrive = -0.4,
} = {}) {
  Object.assign(harness.simulation.player, {
    state: "lip",
    stateTime: 0.1,
    face: 0.02,
    previousFace: 0.02,
    faceVelocity,
    speed,
    charge,
    slopeDrive,
  });
  harness.step();
  assert.equal(harness.simulation.player.state, "airborne");
  assert.ok(harness.simulation.aerialSession);
}

function runUntil(harness, predicate, maxSteps = MAX_AIR_STEPS) {
  for (let step = 0; step <= maxSteps; step += 1) {
    if (predicate()) return step;
    harness.step();
  }
  assert.fail(`condition did not become true within ${maxSteps} fixed steps`);
}

function touchTap(harness, control, duration, pointerId = 21) {
  const button = harness.button(control);
  pointerDown(button, pointerId);
  harness.advance(duration);
  pointerUp(button, pointerId);
  harness.step();
}

function touchTapBetweenSteps(harness, control, pointerId) {
  const button = harness.button(control);
  pointerDown(button, pointerId);
  pointerUp(button, pointerId);
  harness.step();
}

function pointerDown(button, pointerId) {
  button.dispatch("pointerdown", { pointerId });
}

function pointerUp(button, pointerId) {
  button.dispatch("pointerup", { pointerId });
}

function stickDown(harness, pointerId = 90) {
  harness.stick.dispatch("pointerdown", {
    pointerId,
    clientX: 60,
    clientY: 102,
  });
}

function stickUp(harness, pointerId = 90) {
  harness.stick.dispatch("pointerup", { pointerId });
}

function eventCount(harness, type) {
  return harness.events.filter((event) => event.type === type).length;
}

function runAdvancedVarial(device) {
  const pad = device === "gamepad" ? createPad() : null;
  const harness = createHarness({
    board: BOARDS.mangoFish,
    controlMode: CONTROL_MODES.ADVANCED,
    pad,
  });
  launch(harness, { speed: 96, charge: 0.8 });
  harness.events.length = 0;

  if (device === "keyboard") {
    harness.target.dispatch("keydown", { code: "KeyF" });
    harness.step();
    harness.target.dispatch("keyup", { code: "KeyF" });
    harness.step();
  } else if (device === "gamepad") {
    setPadButton(pad, 1, true);
    harness.step();
    setPadButton(pad, 1, false);
    harness.step();
  } else {
    touchTapBetweenSteps(harness, "trick", 50);
    harness.step();
  }
  runUntil(harness, () => harness.simulation.aerialSession?.manifest.sequence[0]?.complete);

  const entry = harness.simulation.aerialSession.manifest.sequence[0];
  return {
    id: entry.id,
    action: entry.action,
    category: entry.category,
    complete: entry.complete,
    completion: entry.completion,
    direction: entry.direction,
    entryDuration: entry.entryDuration,
    boardRelativeRotation: entry.boardRelativeRotation,
    sequenceLength: harness.simulation.aerialSession.manifest.sequence.length,
    startedEvents: eventCount(harness, "trickStarted"),
    completedEvents: eventCount(harness, "trickCompleted"),
  };
}

function createPad() {
  return {
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
}

function setPadButton(pad, index, pressed) {
  pad.buttons[index].pressed = pressed;
  pad.buttons[index].value = Number(pressed);
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
  }

  setPointerCapture() {}
}

class FakeTouchRoot {
  constructor(buttons, stick) {
    this.buttons = buttons;
    this.stick = stick;
  }

  querySelectorAll(selector) {
    assert.equal(selector, "[data-control]");
    return this.buttons;
  }

  querySelector(selector) {
    assert.equal(selector, "[data-touch-stick]");
    return this.stick;
  }
}

class FakeTouchStick extends FakeTarget {
  constructor() {
    super();
    this.dataset = { touchStick: "", stickRadius: "42" };
    this.styles = new Map();
    this.classList = { toggle() {} };
    this.style = { setProperty: (name, value) => this.styles.set(name, value) };
  }

  getBoundingClientRect() {
    return { left: 4, top: 4, width: 112, height: 132 };
  }

  querySelector(selector) {
    assert.equal(selector, "[data-stick-gate]");
    return { getBoundingClientRect: () => ({ left: 4, top: 4, width: 112, height: 112 }) };
  }

  setPointerCapture() {}
}
