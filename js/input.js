import { clamp } from "./math.js";

export const DEAD_ZONE = 0.18;
export const BUFFER_WINDOW = 0.12;

const TRICK1_KEYS = Object.freeze(["KeyQ", "KeyX", "KeyC"]);

export const KEY_BINDINGS = Object.freeze({
  left: Object.freeze(["ArrowLeft", "KeyA"]),
  right: Object.freeze(["ArrowRight", "KeyD"]),
  up: Object.freeze(["ArrowUp", "KeyW"]),
  down: Object.freeze(["ArrowDown", "KeyS"]),
  edge: Object.freeze(["Space", "KeyZ"]),
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

const STEP_ACTIONS = Object.freeze(["edge", "trick1", "trick2", "trick3", "trick4"]);
const META_ACTIONS = Object.freeze(["restart", "pause", "retry", "debug"]);
const DIRECTION_CONTROLS = new Set(["left", "right", "up", "down"]);
const TOUCH_ACTIONS = new Set(STEP_ACTIONS);

export function createInputStep() {
  return {
    x: 0,
    y: 0,
    edge: false,
    edgePressed: false,
    edgeReleased: false,
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
  };
}

export class InputManager {
  constructor({
    target = globalThis.window ?? null,
    touchRoot = null,
    getGamepads = defaultGetGamepads,
  } = {}) {
    this.target = target;
    this.getGamepads = getGamepads;
    this.keys = new Set();
    this.touch = createTouchState();
    this.touchPointers = new Map();
    this.touchButtons = new Set();
    this.gamepad = DISCONNECTED_GAMEPAD;
    this.gamepadNeedsNeutral = false;
    this.previousActions = createBooleanRecord(STEP_ACTIONS);
    this.previousMeta = createBooleanRecord(META_ACTIONS);
    this.actionBuffers = createActionBuffers();
    this.restartBuffered = false;
    this.pauseBuffered = false;
    this.retryBuffered = false;
    this.debugBuffered = false;
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
      const control = normalizeTouchControl(button.dataset.control);
      if (!control || !button.addEventListener) return;
      this.touchButtons.add(button);

      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        if (!this.enabled) return;
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

  isDown(action) {
    return (KEY_BINDINGS[action] ?? []).some((code) => this.keys.has(code));
  }

  isActionHeld(action) {
    return this.isDown(action) || this.touch[action] || this.gamepad[action];
  }

  hasKeyboardAction() {
    return STEP_ACTIONS.some((action) => this.isDown(action));
  }

  hasTouchAction() {
    return STEP_ACTIONS.some((action) => this.touch[action]);
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

export function applyDeadZone(value) {
  if (!Number.isFinite(value)) return 0;
  const magnitude = Math.abs(value);
  if (magnitude <= DEAD_ZONE) return 0;
  return Math.sign(value) * ((magnitude - DEAD_ZONE) / (1 - DEAD_ZONE));
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
  const pad = Array.from(pads ?? []).find(Boolean);
  if (!pad) return DISCONNECTED_GAMEPAD;

  const dpadX = Number(buttonPressed(pad, 15)) - Number(buttonPressed(pad, 14));
  const dpadY = Number(buttonPressed(pad, 13)) - Number(buttonPressed(pad, 12));
  return {
    connected: true,
    x: dpadX || applyDeadZone(pad.axes?.[0] ?? 0),
    y: dpadY || applyDeadZone(pad.axes?.[1] ?? 0),
    edge: buttonPressed(pad, 0) || buttonPressed(pad, 7),
    trick1: buttonPressed(pad, 2) || buttonPressed(pad, 4),
    trick2: buttonPressed(pad, 3) || buttonPressed(pad, 5),
    trick3: buttonPressed(pad, 1),
    trick4: buttonPressed(pad, 6) || buttonPressed(pad, 11),
    pause: buttonPressed(pad, 9),
    retry: buttonPressed(pad, 1),
  };
}

export const DISCONNECTED_GAMEPAD = Object.freeze({
  connected: false,
  x: 0,
  y: 0,
  edge: false,
  trick1: false,
  trick2: false,
  trick3: false,
  trick4: false,
  pause: false,
  retry: false,
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
    trick1: false,
    trick2: false,
    trick3: false,
    trick4: false,
    style: false,
  };
}

function createBooleanRecord(actions) {
  return Object.fromEntries(actions.map((action) => [action, false]));
}

function createActionBuffers() {
  return Object.fromEntries(STEP_ACTIONS.map((action) => [action, { pressed: 0, released: 0 }]));
}

function normalizeTouchControl(control) {
  if (control === "style") return "trick1";
  if (DIRECTION_CONTROLS.has(control) || TOUCH_ACTIONS.has(control)) return control;
  return null;
}

function selectDirection(...sources) {
  return sources.find(({ x, y }) => x || y) ?? { x: 0, y: 0 };
}

function isGamepadActive(gamepad) {
  return gamepad.x || gamepad.y || STEP_ACTIONS.some((action) => gamepad[action]) || gamepad.pause || gamepad.retry;
}
