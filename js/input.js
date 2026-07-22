import { clamp } from "./math.js";

export const DEAD_ZONE = 0.18;
export const BUFFER_WINDOW = 0.12;
export const UI_REPEAT_DELAY = 0.34;
export const UI_REPEAT_INTERVAL = 0.11;
export const UI_DIRECTION_THRESHOLD = 0.5;
export const TOUCH_STICK_RADIUS = 42;
export const TOUCH_STICK_DEAD_ZONE = 0.12;

export const CONTROL_MODES = Object.freeze({
  SIMPLE: "simple",
  ADVANCED: "advanced",
});

const TRICK1_KEYS = Object.freeze(["KeyQ", "KeyX", "KeyC"]);

export const KEY_BINDINGS = Object.freeze({
  left: Object.freeze(["ArrowLeft", "KeyA"]),
  right: Object.freeze(["ArrowRight", "KeyD"]),
  up: Object.freeze(["ArrowUp", "KeyW"]),
  down: Object.freeze(["ArrowDown", "KeyS"]),
  edge: Object.freeze(["Space", "KeyZ"]),
  trick: Object.freeze(["KeyF", "KeyX"]),
  turbo: Object.freeze(["ShiftLeft", "ShiftRight"]),
  special: Object.freeze(["KeyT"]),
  spinLeft: Object.freeze(["KeyQ"]),
  spinRight: Object.freeze(["KeyE"]),
  trick1: TRICK1_KEYS,
  trick2: Object.freeze(["KeyE"]),
  trick3: Object.freeze(["KeyF"]),
  trick4: Object.freeze(["KeyT"]),
  // `style` is the legacy name for trick1. Keep both names on the same keys.
  style: TRICK1_KEYS,
  restart: Object.freeze(["KeyR"]),
  pause: Object.freeze(["Escape", "KeyP"]),
  debug: Object.freeze(["Backquote"]),
});

const ADVANCED_ACTIONS = Object.freeze(["edge", "turbo", "trick1", "trick2", "trick3", "trick4"]);
const SIMPLE_ACTIONS = Object.freeze(["edge", "turbo", "trick"]);
const STEP_ACTIONS = Object.freeze([
  "edge",
  "turbo",
  "trick1",
  "trick2",
  "trick3",
  "trick4",
  "trick",
  "special",
  "spinLeft",
  "spinRight",
]);
const ADVANCED_ACTION_SET = new Set(ADVANCED_ACTIONS);
const SIMPLE_ACTION_SET = new Set(SIMPLE_ACTIONS);
const META_ACTIONS = Object.freeze(["restart", "pause", "retry", "debug"]);
const DIRECTION_CONTROLS = new Set(["left", "right", "up", "down"]);
const TOUCH_ACTIONS = new Set(STEP_ACTIONS);
const UI_AXES = Object.freeze(["x", "y"]);
const UI_ACTIONS = Object.freeze(["confirm", "cancel"]);
const UI_GAMEPAD_FIELDS = Object.freeze({ confirm: "uiConfirm", cancel: "uiCancel" });

export function createInputStep() {
  return {
    x: 0,
    y: 0,
    edge: false,
    edgePressed: false,
    edgeReleased: false,
    turbo: false,
    turboPressed: false,
    turboReleased: false,
    trick1: false,
    trick1Pressed: false,
    trick1Released: false,
    trick2: false,
    trick2Pressed: false,
    trick2Released: false,
    trick3: false,
    trick3Pressed: false,
    trick3Released: false,
    trick4: false,
    trick4Pressed: false,
    trick4Released: false,
    style: false,
    stylePressed: false,
    styleReleased: false,
    trick: false,
    trickPressed: false,
    trickReleased: false,
    special: false,
    specialPressed: false,
    specialReleased: false,
    spinLeft: false,
    spinLeftPressed: false,
    spinLeftReleased: false,
    spinRight: false,
    spinRightPressed: false,
    spinRightReleased: false,
  };
}

export class InputManager {
  constructor({
    target = globalThis.window ?? null,
    touchRoot = null,
    getGamepads = defaultGetGamepads,
    controlMode = CONTROL_MODES.SIMPLE,
  } = {}) {
    this.target = target;
    this.getGamepads = getGamepads;
    this.controlMode = normalizeControlMode(controlMode);
    this.activeActions = actionsForMode(this.controlMode);
    this.keys = new Set();
    this.touch = createTouchState();
    this.touchPointers = new Map();
    this.touchButtons = new Set();
    this.touchStick = createTouchStickState();
    this.touchStickElement = null;
    this.gamepad = DISCONNECTED_GAMEPAD;
    this.gamepadNeedsNeutral = false;
    this.previousActions = createBooleanRecord(STEP_ACTIONS);
    this.previousMeta = createBooleanRecord(META_ACTIONS);
    this.actionBuffers = createActionBuffers();
    this.restartBuffered = false;
    this.pauseBuffered = false;
    this.retryBuffered = false;
    this.debugBuffered = false;
    this.uiBuffered = createUiInput();
    this.uiConsumed = createUiInput();
    this.uiDirection = { x: 0, y: 0 };
    this.previousUi = createUiInput();
    this.uiRepeat = { x: 0, y: 0 };
    this.step = createInputStep();
    this.lastDevice = "keyboard";
    this.enabled = true;
    this.abort = new AbortController();
    this.bindKeyboard();
    if (touchRoot) this.bindTouch(touchRoot);
  }

  bindKeyboard() {
    if (!this.target?.addEventListener) return;
    const options = { signal: this.abort.signal };
    this.target.addEventListener("keydown", (event) => {
      if (!isBoundCode(event.code)) return;
      if (isTextOrFormControl(event.target) && !isMetaBindingCode(event.code)) return;
      event.preventDefault();
      if (!this.enabled) return;
      if (event.repeat) return;

      const wasDown = this.keys.has(event.code);
      this.keys.add(event.code);
      if (!wasDown) {
        this.lastDevice = "keyboard";
        this.refreshEdges();
      }
    }, options);
    this.target.addEventListener("keyup", (event) => {
      if (!isBoundCode(event.code)) return;
      if (isTextOrFormControl(event.target) && !isMetaBindingCode(event.code)) {
        this.keys.delete(event.code);
        this.refreshEdges();
        return;
      }
      event.preventDefault();
      this.keys.delete(event.code);
      this.refreshEdges();
    }, options);
    this.target.addEventListener("blur", () => this.clear(), options);
  }

  bindTouch(root) {
    const options = { signal: this.abort.signal };
    const controls = root.querySelectorAll?.("[data-control]") ?? [];
    controls.forEach((button) => {
      const rawControl = button.dataset.control;
      if (!isTouchControl(rawControl) || !button.addEventListener) return;
      this.touchButtons.add(button);

      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (!this.enabled) return;
        const control = normalizeTouchControl(rawControl, this.controlMode);
        this.activateTouchPointer(event.pointerId, button, control);
        try {
          button.setPointerCapture?.(event.pointerId);
        } catch {
          // The pointer may already have been cancelled; state still clears on its event.
        }
      }, options);

      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
        button.addEventListener(type, (event) => {
          event.preventDefault?.();
          this.releaseTouchPointer(event.pointerId, button);
        }, options);
      }
    });
    this.bindTouchStick(root, options);
  }

  bindTouchStick(root, options) {
    const stick = root.querySelector?.("[data-touch-stick]");
    if (!stick?.addEventListener) return;
    this.touchStickElement = stick;

    stick.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      if (!this.enabled || this.touchStick.pointerId !== null) return;
      this.touchStick.pointerId = event.pointerId;
      this.updateTouchStick(event);
      stick.classList?.toggle("is-active", true);
      try {
        stick.setPointerCapture?.(event.pointerId);
      } catch {
        // Lost/cancelled pointers are neutralized by the matching release event.
      }
      this.lastDevice = "touch";
    }, options);

    stick.addEventListener("pointermove", (event) => {
      if (event.pointerId !== this.touchStick.pointerId) return;
      event.preventDefault();
      this.updateTouchStick(event);
    }, options);

    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      stick.addEventListener(type, (event) => {
        if (event.pointerId !== this.touchStick.pointerId) return;
        event.preventDefault?.();
        this.resetTouchStick();
      }, options);
    }
  }

  updateTouchStick(event) {
    const stick = this.touchStickElement;
    const gate = stick?.querySelector?.("[data-stick-gate]") ?? stick;
    const rect = gate?.getBoundingClientRect?.();
    if (!rect) return;
    const radius = positiveNumber(stick.dataset?.stickRadius, TOUCH_STICK_RADIUS);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const vector = touchStickVector(
      Number(event.clientX) - centerX,
      Number(event.clientY) - centerY,
      radius,
    );
    this.touchStick.x = vector.x;
    this.touchStick.y = vector.y;
    stick.style?.setProperty?.("--stick-x", `${(vector.x * radius).toFixed(2)}px`);
    stick.style?.setProperty?.("--stick-y", `${(vector.y * radius).toFixed(2)}px`);
    this.syncTouchState();
  }

  resetTouchStick() {
    this.touchStick.pointerId = null;
    this.touchStick.x = 0;
    this.touchStick.y = 0;
    this.touchStickElement?.classList?.toggle("is-active", false);
    this.touchStickElement?.style?.setProperty?.("--stick-x", "0px");
    this.touchStickElement?.style?.setProperty?.("--stick-y", "0px");
    this.syncTouchState();
  }

  activateTouchPointer(pointerId, button, control) {
    const existing = this.touchPointers.get(pointerId);
    if (existing) this.touchPointers.delete(pointerId);
    this.touchPointers.set(pointerId, { button, control });
    this.syncTouchState();
    this.lastDevice = "touch";
  }

  releaseTouchPointer(pointerId, button) {
    const existing = this.touchPointers.get(pointerId);
    if (existing?.button === button) {
      this.touchPointers.delete(pointerId);
    } else if (pointerId === undefined) {
      for (const [id, pointer] of this.touchPointers) {
        if (pointer.button === button) this.touchPointers.delete(id);
      }
    }
    this.syncTouchState();
  }

  syncTouchState() {
    Object.assign(this.touch, createTouchState());
    for (const { control } of this.touchPointers.values()) {
      if (control === "left") this.touch.x -= 1;
      else if (control === "right") this.touch.x += 1;
      else if (control === "up") this.touch.y -= 1;
      else if (control === "down") this.touch.y += 1;
      else this.touch[control] = true;
    }
    this.touch.x = clamp(this.touch.x, -1, 1);
    this.touch.y = clamp(this.touch.y, -1, 1);
    this.touch.x = clamp(this.touch.x + this.touchStick.x, -1, 1);
    this.touch.y = clamp(this.touch.y + this.touchStick.y, -1, 1);
    this.touch.style = this.touch.trick1;

    for (const button of this.touchButtons) {
      const active = Array.from(this.touchPointers.values()).some((pointer) => pointer.button === button);
      button.classList?.toggle("is-active", active);
    }
    this.refreshActionEdges();
  }

  update(dt) {
    this.decayBuffers(dt);
    const polledGamepad = pollGamepad(this.getGamepads);
    if (this.gamepadNeedsNeutral) {
      if (!isGamepadActive(polledGamepad)) this.gamepadNeedsNeutral = false;
      this.gamepad = DISCONNECTED_GAMEPAD;
    } else {
      this.gamepad = polledGamepad;
    }
    this.refreshEdges();
    this.refreshUi(frameTime(dt));

    const keyboardX = Number(this.isDown("right")) - Number(this.isDown("left"));
    const keyboardY = Number(this.isDown("down")) - Number(this.isDown("up"));
    const direction = selectDirection(
      { x: this.touch.x, y: this.touch.y },
      { x: keyboardX, y: keyboardY },
      { x: this.gamepad.x, y: this.gamepad.y },
    );

    this.step.x = clamp(direction.x, -1, 1);
    this.step.y = clamp(direction.y, -1, 1);
    for (const action of STEP_ACTIONS) this.step[action] = this.isActionHeld(action);
    this.step.style = this.step.trick1;

    if (isGamepadActive(this.gamepad)
      && !keyboardX && !keyboardY && !this.hasKeyboardAction()
      && !this.touch.x && !this.touch.y && !this.hasTouchAction()) {
      this.lastDevice = "gamepad";
    }
  }

  consumeStep() {
    for (const action of STEP_ACTIONS) {
      const buffer = this.actionBuffers[action];
      this.step[`${action}Pressed`] = buffer.pressed > 0;
      this.step[`${action}Released`] = buffer.released > 0;
      buffer.pressed = 0;
      buffer.released = 0;
    }
    this.step.style = this.step.trick1;
    this.step.stylePressed = this.step.trick1Pressed;
    this.step.styleReleased = this.step.trick1Released;
    return this.step;
  }

  consumeMeta() {
    const meta = {
      restart: this.restartBuffered,
      pause: this.pauseBuffered,
      retry: this.retryBuffered,
      debug: this.debugBuffered,
    };
    this.restartBuffered = false;
    this.pauseBuffered = false;
    this.retryBuffered = false;
    this.debugBuffered = false;
    return meta;
  }

  consumeUi() {
    copyUiInput(this.uiConsumed, this.uiBuffered);
    resetUiInput(this.uiBuffered);
    return this.uiConsumed;
  }

  setControlMode(mode) {
    const nextMode = normalizeControlMode(mode);
    if (nextMode === this.controlMode) return this.controlMode;
    this.controlMode = nextMode;
    this.activeActions = actionsForMode(nextMode);
    this.clear();
    return this.controlMode;
  }

  isDown(action) {
    return (KEY_BINDINGS[action] ?? []).some((code) => this.keys.has(code));
  }

  isActionHeld(action) {
    if (!this.activeActions.has(action)) return false;
    return this.isDown(action) || this.touch[action] || this.gamepad[action];
  }

  hasKeyboardAction() {
    for (const action of this.activeActions) {
      if (this.isDown(action)) return true;
    }
    return false;
  }

  hasTouchAction() {
    for (const action of this.activeActions) {
      if (this.touch[action]) return true;
    }
    return false;
  }

  refreshEdges() {
    this.refreshActionEdges();
    this.refreshMetaEdges();
  }

  refreshActionEdges() {
    for (const action of STEP_ACTIONS) {
      const held = Boolean(this.isActionHeld(action));
      const previous = this.previousActions[action];
      if (held && !previous) this.actionBuffers[action].pressed = BUFFER_WINDOW;
      if (!held && previous) this.actionBuffers[action].released = BUFFER_WINDOW;
      this.previousActions[action] = held;
    }
  }

  refreshMetaEdges() {
    const meta = {
      restart: this.isDown("restart"),
      pause: this.isDown("pause") || this.gamepad.pause,
      retry: this.gamepad.retry,
      debug: this.isDown("debug"),
    };
    for (const action of META_ACTIONS) {
      if (meta[action] && !this.previousMeta[action]) this[`${action}Buffered`] = true;
      this.previousMeta[action] = Boolean(meta[action]);
    }
  }

  refreshUi(dt) {
    const direction = setDominantUiDirection(this.gamepad.x, this.gamepad.y, this.uiDirection);
    for (const axis of UI_AXES) {
      const value = direction[axis];
      const previous = this.previousUi[axis];
      if (!value) {
        this.uiRepeat[axis] = 0;
      } else if (value !== previous) {
        this.uiBuffered[axis] = value;
        this.uiRepeat[axis] = UI_REPEAT_DELAY;
      } else {
        this.uiRepeat[axis] -= dt;
        if (this.uiRepeat[axis] <= 0) {
          this.uiBuffered[axis] = value;
          // Rebase instead of catching up missed repeats after a long frame.
          this.uiRepeat[axis] = UI_REPEAT_INTERVAL;
        }
      }
      this.previousUi[axis] = value;
    }

    for (const action of UI_ACTIONS) {
      const held = Boolean(this.gamepad[UI_GAMEPAD_FIELDS[action]]);
      if (held && !this.previousUi[action]) this.uiBuffered[action] = true;
      this.previousUi[action] = held;
    }
  }

  decayBuffers(dt) {
    const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
    for (const action of STEP_ACTIONS) {
      const buffer = this.actionBuffers[action];
      buffer.pressed = Math.max(0, buffer.pressed - elapsed);
      buffer.released = Math.max(0, buffer.released - elapsed);
    }
  }

  clear() {
    this.keys.clear();
    this.touchPointers.clear();
    Object.assign(this.touch, createTouchState());
    for (const button of this.touchButtons) button.classList?.toggle("is-active", false);
    this.touchStick.pointerId = null;
    this.touchStick.x = 0;
    this.touchStick.y = 0;
    this.touchStickElement?.classList?.toggle("is-active", false);
    this.touchStickElement?.style?.setProperty?.("--stick-x", "0px");
    this.touchStickElement?.style?.setProperty?.("--stick-y", "0px");
    this.gamepad = DISCONNECTED_GAMEPAD;
    this.gamepadNeedsNeutral = true;
    for (const action of STEP_ACTIONS) {
      this.previousActions[action] = false;
      this.actionBuffers[action].pressed = 0;
      this.actionBuffers[action].released = 0;
    }
    for (const action of META_ACTIONS) this.previousMeta[action] = false;
    this.restartBuffered = false;
    this.pauseBuffered = false;
    this.retryBuffered = false;
    this.debugBuffered = false;
    resetUiInput(this.uiBuffered);
    resetUiInput(this.uiConsumed);
    resetUiInput(this.previousUi);
    this.uiDirection.x = 0;
    this.uiDirection.y = 0;
    this.uiRepeat.x = 0;
    this.uiRepeat.y = 0;
    Object.assign(this.step, createInputStep());
  }

  destroy() {
    this.enabled = false;
    this.abort.abort();
    this.clear();
  }
}

export function isBoundCode(code) {
  return Object.values(KEY_BINDINGS).some((codes) => codes.includes(code));
}

export function isTextOrFormControl(target) {
  const tagName = String(target?.tagName ?? "").toUpperCase();
  return Boolean(target?.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tagName));
}

function isMetaBindingCode(code) {
  return [
    ...KEY_BINDINGS.restart,
    ...KEY_BINDINGS.pause,
    ...KEY_BINDINGS.debug,
  ].includes(code);
}

export function applyDeadZone(value) {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(value);
  if (magnitude <= DEAD_ZONE) return 0;
  return Math.sign(value) * ((magnitude - DEAD_ZONE) / (1 - DEAD_ZONE));
}

export function touchStickVector(
  deltaX,
  deltaY,
  radius = TOUCH_STICK_RADIUS,
  deadZone = TOUCH_STICK_DEAD_ZONE,
) {
  const x = Number(deltaX);
  const y = Number(deltaY);
  const travel = Number(radius);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !(travel > 0)) return { x: 0, y: 0 };
  const distance = Math.hypot(x, y);
  if (!distance) return { x: 0, y: 0 };
  const rawMagnitude = Math.min(distance / travel, 1);
  const threshold = clamp(Number(deadZone) || 0, 0, 0.95);
  if (rawMagnitude <= threshold) return { x: 0, y: 0 };
  const magnitude = (rawMagnitude - threshold) / (1 - threshold);
  return {
    x: (x / distance) * magnitude,
    y: (y / distance) * magnitude,
  };
}

export function pollGamepad(getGamepads = defaultGetGamepads) {
  let pads;
  try {
    pads = typeof getGamepads === "function"
      ? getGamepads()
      : getGamepads?.getGamepads?.();
  } catch {
    return DISCONNECTED_GAMEPAD;
  }
  if (!pads) return DISCONNECTED_GAMEPAD;
  let first = null;
  for (let index = 0; index < pads.length; index += 1) {
    const pad = pads[index];
    if (!pad) continue;
    const snapshot = snapshotGamepad(pad);
    first ??= snapshot;
    if (isGamepadActive(snapshot)) return snapshot;
  }
  return first ?? DISCONNECTED_GAMEPAD;
}

function snapshotGamepad(pad) {
  const dpadX = Number(buttonPressed(pad, 15)) - Number(buttonPressed(pad, 14));
  const dpadY = Number(buttonPressed(pad, 13)) - Number(buttonPressed(pad, 12));
  return {
    connected: true,
    x: dpadX || applyDeadZone(pad.axes?.[0] ?? 0),
    y: dpadY || applyDeadZone(pad.axes?.[1] ?? 0),
    edge: buttonPressed(pad, 0) || buttonPressed(pad, 7),
    turbo: buttonPressed(pad, 10),
    trick: buttonPressed(pad, 2) || buttonPressed(pad, 1),
    special: buttonPressed(pad, 3),
    spinLeft: buttonPressed(pad, 4),
    spinRight: buttonPressed(pad, 5),
    trick1: buttonPressed(pad, 2) || buttonPressed(pad, 4),
    trick2: buttonPressed(pad, 3) || buttonPressed(pad, 5),
    trick3: buttonPressed(pad, 1),
    trick4: buttonPressed(pad, 6) || buttonPressed(pad, 11),
    pause: buttonPressed(pad, 9),
    retry: buttonPressed(pad, 1),
    uiConfirm: buttonPressed(pad, 0),
    uiCancel: buttonPressed(pad, 1),
  };
}

export const DISCONNECTED_GAMEPAD = Object.freeze({
  connected: false,
  x: 0,
  y: 0,
  edge: false,
  turbo: false,
  trick: false,
  special: false,
  spinLeft: false,
  spinRight: false,
  trick1: false,
  trick2: false,
  trick3: false,
  trick4: false,
  pause: false,
  retry: false,
  uiConfirm: false,
  uiCancel: false,
});

function defaultGetGamepads() {
  return globalThis.navigator?.getGamepads?.() ?? [];
}

function buttonPressed(pad, index) {
  const button = pad.buttons?.[index];
  if (typeof button === "number") return button > 0.5;
  return Boolean(button?.pressed || button?.value > 0.5);
}

function createTouchState() {
  return {
    x: 0,
    y: 0,
    edge: false,
    turbo: false,
    trick: false,
    special: false,
    spinLeft: false,
    spinRight: false,
    trick1: false,
    trick2: false,
    trick3: false,
    trick4: false,
    style: false,
  };
}

function createTouchStickState() {
  return { pointerId: null, x: 0, y: 0 };
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function createBooleanRecord(actions) {
  return Object.fromEntries(actions.map((action) => [action, false]));
}

function createActionBuffers() {
  return Object.fromEntries(STEP_ACTIONS.map((action) => [action, { pressed: 0, released: 0 }]));
}

function createUiInput() {
  return { x: 0, y: 0, confirm: false, cancel: false };
}

function frameTime(dt) {
  return Number.isFinite(dt) && dt > 0 ? dt : 0;
}

export function dominantUiDirection(x, y) {
  return setDominantUiDirection(x, y, { x: 0, y: 0 });
}

function setDominantUiDirection(x, y, result) {
  const horizontal = Math.abs(x) >= UI_DIRECTION_THRESHOLD ? Math.sign(x) : 0;
  const vertical = Math.abs(y) >= UI_DIRECTION_THRESHOLD ? Math.sign(y) : 0;
  result.x = !vertical || (horizontal && Math.abs(x) >= Math.abs(y)) ? horizontal : 0;
  result.y = result.x ? 0 : vertical;
  return result;
}

function copyUiInput(target, source) {
  target.x = source.x;
  target.y = source.y;
  target.confirm = source.confirm;
  target.cancel = source.cancel;
}

function resetUiInput(target) {
  target.x = 0;
  target.y = 0;
  target.confirm = false;
  target.cancel = false;
}

function isTouchControl(control) {
  return control === "style" || DIRECTION_CONTROLS.has(control) || TOUCH_ACTIONS.has(control);
}

function normalizeTouchControl(control, mode) {
  if (DIRECTION_CONTROLS.has(control) || control === "edge" || control === "turbo") return control;
  if (mode === CONTROL_MODES.ADVANCED) {
    if (control === "style" || control === "spinLeft") return "trick1";
    if (control === "spinRight") return "trick2";
    if (control === "trick") return "trick3";
    if (control === "special") return "trick4";
    if (TOUCH_ACTIONS.has(control)) return control;
    return null;
  }
  if (control === "style" || control === "trick" || control === "trick3") return "trick";
  if (control === "special" || control === "trick4") return "special";
  if (control === "spinLeft" || control === "trick1") return "spinLeft";
  if (control === "spinRight" || control === "trick2") return "spinRight";
  return null;
}

function selectDirection(...sources) {
  return sources.find(({ x, y }) => x || y) ?? { x: 0, y: 0 };
}

function isGamepadActive(gamepad) {
  return gamepad.x || gamepad.y || STEP_ACTIONS.some((action) => gamepad[action]) || gamepad.pause || gamepad.retry;
}

export function normalizeControlMode(mode) {
  return String(mode).toLowerCase() === CONTROL_MODES.ADVANCED
    ? CONTROL_MODES.ADVANCED
    : CONTROL_MODES.SIMPLE;
}

function actionsForMode(mode) {
  return mode === CONTROL_MODES.ADVANCED ? ADVANCED_ACTION_SET : SIMPLE_ACTION_SET;
}
