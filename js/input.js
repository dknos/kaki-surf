import { clamp } from "./math.js";

const DEAD_ZONE = 0.18;
const BUFFER_WINDOW = 0.12;

const KEY_BINDINGS = {
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  edge: ["Space", "KeyZ"],
  style: ["KeyX", "KeyC"],
  restart: ["KeyR"],
  pause: ["Escape", "KeyP"],
  debug: ["Backquote"],
};

export class InputManager {
  constructor({ target = window, touchRoot = null } = {}) {
    this.target = target;
    this.keys = new Set();
    this.touch = { x: 0, y: 0, edge: false, style: false };
    this.previousEdge = false;
    this.previousStyle = false;
    this.previousRestart = false;
    this.previousPause = false;
    this.previousDebug = false;
    this.edgeBuffer = 0;
    this.edgeReleaseBuffer = 0;
    this.styleBuffer = 0;
    this.restartBuffered = false;
    this.pauseBuffered = false;
    this.debugBuffered = false;
    this.step = {
      x: 0,
      y: 0,
      edge: false,
      edgePressed: false,
      edgeReleased: false,
      style: false,
      stylePressed: false,
    };
    this.lastDevice = "keyboard";
    this.enabled = true;
    this.abort = new AbortController();
    this.bindKeyboard();
    if (touchRoot) this.bindTouch(touchRoot);
  }

  bindKeyboard() {
    const options = { signal: this.abort.signal };
    this.target.addEventListener("keydown", (event) => {
      if (!this.enabled) return;
      if (isBoundCode(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
        this.lastDevice = "keyboard";
      }
    }, options);
    this.target.addEventListener("keyup", (event) => {
      if (isBoundCode(event.code)) {
        event.preventDefault();
        this.keys.delete(event.code);
      }
    }, options);
    this.target.addEventListener("blur", () => this.keys.clear(), options);
  }

  bindTouch(root) {
    const options = { signal: this.abort.signal };
    const controls = root.querySelectorAll("[data-control]");
    controls.forEach((button) => {
      const control = button.dataset.control;
      const set = (active) => {
        if (control === "left") this.touch.x = active ? -1 : this.touch.x === -1 ? 0 : this.touch.x;
        if (control === "right") this.touch.x = active ? 1 : this.touch.x === 1 ? 0 : this.touch.x;
        if (control === "up") this.touch.y = active ? -1 : this.touch.y === -1 ? 0 : this.touch.y;
        if (control === "down") this.touch.y = active ? 1 : this.touch.y === 1 ? 0 : this.touch.y;
        if (control === "edge") this.touch.edge = active;
        if (control === "style") this.touch.style = active;
        if (active) this.lastDevice = "touch";
        button.classList.toggle("is-active", active);
      };
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        set(true);
      }, options);
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
        button.addEventListener(type, () => set(false), options);
      }
    });
  }

  update(dt) {
    let x = Number(this.isDown("right")) - Number(this.isDown("left"));
    let y = Number(this.isDown("down")) - Number(this.isDown("up"));
    let edge = this.isDown("edge");
    let style = this.isDown("style");
    let restart = this.isDown("restart");
    let pause = this.isDown("pause");
    let debug = this.isDown("debug");

    const gamepad = pollGamepad();
    if (gamepad.connected) {
      const keyboardActive = x || y || edge || style;
      if (!keyboardActive && (Math.abs(gamepad.x) > 0.01 || Math.abs(gamepad.y) > 0.01 || gamepad.edge || gamepad.style)) {
        x = gamepad.x;
        y = gamepad.y;
        edge = gamepad.edge;
        style = gamepad.style;
        this.lastDevice = "gamepad";
      }
      restart ||= gamepad.restart;
      pause ||= gamepad.pause;
    }

    if (this.touch.x || this.touch.y || this.touch.edge || this.touch.style) {
      x = this.touch.x;
      y = this.touch.y;
      edge = this.touch.edge;
      style = this.touch.style;
    }

    this.step.x = clamp(x, -1, 1);
    this.step.y = clamp(y, -1, 1);
    this.step.edge = edge;
    this.step.style = style;

    if (edge && !this.previousEdge) this.edgeBuffer = BUFFER_WINDOW;
    if (!edge && this.previousEdge) this.edgeReleaseBuffer = BUFFER_WINDOW;
    if (style && !this.previousStyle) this.styleBuffer = BUFFER_WINDOW;
    if (restart && !this.previousRestart) this.restartBuffered = true;
    if (pause && !this.previousPause) this.pauseBuffered = true;
    if (debug && !this.previousDebug) this.debugBuffered = true;

    this.edgeBuffer = Math.max(0, this.edgeBuffer - dt);
    this.edgeReleaseBuffer = Math.max(0, this.edgeReleaseBuffer - dt);
    this.styleBuffer = Math.max(0, this.styleBuffer - dt);
    this.previousEdge = edge;
    this.previousStyle = style;
    this.previousRestart = restart;
    this.previousPause = pause;
    this.previousDebug = debug;
  }

  consumeStep() {
    this.step.edgePressed = this.edgeBuffer > 0;
    this.step.edgeReleased = this.edgeReleaseBuffer > 0;
    this.step.stylePressed = this.styleBuffer > 0;
    this.edgeBuffer = 0;
    this.edgeReleaseBuffer = 0;
    this.styleBuffer = 0;
    return this.step;
  }

  consumeMeta() {
    const meta = {
      restart: this.restartBuffered,
      pause: this.pauseBuffered,
      debug: this.debugBuffered,
    };
    this.restartBuffered = false;
    this.pauseBuffered = false;
    this.debugBuffered = false;
    return meta;
  }

  isDown(action) {
    return KEY_BINDINGS[action].some((code) => this.keys.has(code));
  }

  clear() {
    this.keys.clear();
    this.touch.x = 0;
    this.touch.y = 0;
    this.touch.edge = false;
    this.touch.style = false;
    this.edgeBuffer = 0;
    this.edgeReleaseBuffer = 0;
    this.styleBuffer = 0;
  }

  destroy() {
    this.abort.abort();
    this.clear();
  }
}

function isBoundCode(code) {
  return Object.values(KEY_BINDINGS).some((codes) => codes.includes(code));
}

function applyDeadZone(value) {
  const magnitude = Math.abs(value);
  if (magnitude <= DEAD_ZONE) return 0;
  return Math.sign(value) * ((magnitude - DEAD_ZONE) / (1 - DEAD_ZONE));
}

function pollGamepad() {
  const pads = navigator.getGamepads?.() ?? [];
  const pad = Array.from(pads).find(Boolean);
  if (!pad) return DISCONNECTED_GAMEPAD;
  const dpadX = Number(pad.buttons[15]?.pressed) - Number(pad.buttons[14]?.pressed);
  const dpadY = Number(pad.buttons[13]?.pressed) - Number(pad.buttons[12]?.pressed);
  return {
    connected: true,
    x: dpadX || applyDeadZone(pad.axes[0] ?? 0),
    y: dpadY || applyDeadZone(pad.axes[1] ?? 0),
    edge: Boolean(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed),
    style: Boolean(pad.buttons[2]?.pressed || pad.buttons[4]?.pressed),
    restart: Boolean(pad.buttons[1]?.pressed),
    pause: Boolean(pad.buttons[9]?.pressed),
  };
}

const DISCONNECTED_GAMEPAD = Object.freeze({
  connected: false,
  x: 0,
  y: 0,
  edge: false,
  style: false,
  restart: false,
  pause: false,
});
