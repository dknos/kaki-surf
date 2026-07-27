import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9231";
const baseUrl = process.env.KAKI_SURF_QA_URL ?? "http://127.0.0.1:9876/index.html";
const outputDir = process.env.KAKI_SURF_TRICK_QA_DIR
  ?? path.join("/tmp", "kaki-surf-trick-controls");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pages = await fetch(`${cdpHost}/json/list`).then((response) => response.json());
const page = pages.find((entry) => entry.type === "page");
if (!page) throw new Error("No debuggable Chromium page was found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
const browserErrors = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id) {
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
    else waiter.resolve(message.result ?? {});
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    browserErrors.push(message.params.exceptionDetails?.exception?.description ?? "runtime exception");
  }
  if (message.method === "Runtime.consoleAPICalled"
    && ["error", "warning"].includes(message.params.type)) {
    browserErrors.push(message.params.args?.map((arg) => arg.value ?? arg.description).join(" "));
  }
  if (message.method === "Network.loadingFailed" && !message.params.canceled) {
    browserErrors.push(`network: ${message.params.errorText}`);
  }
  if (message.method === "Network.responseReceived"
    && message.params.response.status >= 400) {
    browserErrors.push(`HTTP ${message.params.response.status}: ${message.params.response.url}`);
  }
});

function call(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description ?? result.exceptionDetails.text,
    );
  }
  return result.result?.value;
}

async function waitFor(check, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const result = await check();
    if (result) return result;
    await sleep(12);
  }
  throw new Error(`${label} timed out`);
}

async function key(code, down) {
  const keys = {
    ArrowRight: ["ArrowRight", 39],
    ArrowUp: ["ArrowUp", 38],
    Space: [" ", 32],
  };
  const [keyValue, windowsVirtualKeyCode] = keys[code];
  await call("Input.dispatchKeyEvent", {
    type: down ? "keyDown" : "keyUp",
    code,
    key: keyValue,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
}

async function touch(control, {
  pointerId = 1,
  duration = 80,
  release = true,
} = {}) {
  const point = await evaluate(`(() => {
    const element = document.querySelector('[data-control="${control}"]');
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await call("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, id: pointerId, radiusX: 8, radiusY: 8, force: 1 }],
  });
  if (duration > 0) await sleep(duration);
  if (release) {
    await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  }
  return point;
}

async function snapshot() {
  return evaluate("globalThis.kakiSurf.getSnapshot()");
}

async function buttonState(control) {
  return evaluate(`(() => {
    const element = document.querySelector('[data-control="${control}"]');
    return {
      state: element.dataset.trickState,
      status: element.querySelector('[data-touch-status]')?.textContent ?? "",
      active: element.classList.contains('is-active'),
    };
  })()`);
}

async function layout(mode) {
  const controls = mode === "simple"
    ? ["turbo", "trick", "edge"]
    : ["spinLeft", "spinRight", "trick", "special", "turbo", "edge"];
  return evaluate(`(() => {
    const controls = ${JSON.stringify(controls)};
    const rects = Object.fromEntries(controls.map((control) => {
      const rect = document.querySelector('[data-control="' + control + '"]').getBoundingClientRect();
      return [control, {
        left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom,
        width: rect.width, height: rect.height,
      }];
    }));
    const overlap = (a, b) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
      * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    const pairs = [];
    for (let left = 0; left < controls.length; left += 1) {
      for (let right = left + 1; right < controls.length; right += 1) {
        const area = overlap(rects[controls[left]], rects[controls[right]]);
        if (area > 0.01) pairs.push([controls[left], controls[right], area]);
      }
    }
    return { viewport: { width: innerWidth, height: innerHeight }, rects, overlaps: pairs };
  })()`);
}

async function screenshot(name) {
  const result = await call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outputDir, `${name}.png`), Buffer.from(result.data, "base64"));
}

async function navigate(mode) {
  const url = new URL(baseUrl);
  url.searchParams.set("trickQa", `${mode}-${Date.now()}`);
  await call("Page.navigate", { url: url.toString() });
  await waitFor(
    () => evaluate("Boolean(globalThis.kakiSurf && document.readyState === 'complete')"),
    10_000,
    `${mode} page ready`,
  );
  await evaluate(`(() => {
    const select = document.querySelector('[data-setting="controlMode"]');
    select.value = ${JSON.stringify(mode)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    globalThis.kakiSurf.start({
      immediate: true,
      board: 'mangoFish',
      condition: 'goldenCoast',
      mode: 'endless',
    });
  })()`);
  await waitFor(
    async () => (await snapshot()).lifecycle === "running",
    5_000,
    `${mode} running`,
  );
  await waitFor(
    async () => (await snapshot()).state === "riding",
    5_000,
    `${mode} riding`,
  );
}

async function launchPhysicalAir() {
  await key("ArrowRight", true);
  await sleep(900);
  await key("ArrowUp", true);
  await key("Space", true);
  const air = await waitFor(
    async () => {
      const value = await snapshot();
      return value.state === "airborne" ? value : null;
    },
    3_500,
    "physical keyboard launch",
  );
  await key("Space", false);
  await key("ArrowUp", false);
  await key("ArrowRight", false);
  return air;
}

async function runTouchTrick({ mode, control, pointerId }) {
  await navigate(mode);
  const measuredLayout = await layout(mode);
  await launchPhysicalAir();

  const touchPromise = touch(control, { pointerId, duration: 80 });
  const queued = await waitFor(
    async () => {
      const value = await buttonState(control);
      return value.state === "queued" ? value : null;
    },
    300,
    `${mode} queued feedback`,
  );
  await touchPromise;

  const transitions = [queued];
  let activeCaptured = false;
  const complete = await waitFor(async () => {
    const state = await buttonState(control);
    if (state.state !== transitions.at(-1)?.state
      || state.status !== transitions.at(-1)?.status) {
      transitions.push(state);
    }
    if (state.state === "active" && !activeCaptured) {
      activeCaptured = true;
      await screenshot(`${mode}-active`);
    }
    const value = await snapshot();
    return value.trickSequence[0]?.complete ? value : null;
  }, 2_500, `${mode} completed trick`);
  await sleep(40);
  const resolved = await buttonState(control);
  if (resolved.state !== transitions.at(-1)?.state) transitions.push(resolved);
  return {
    layout: measuredLayout,
    transitions,
    sequence: complete.trickSequence,
    vibrations: await evaluate("globalThis.__kakiVibrations ?? []"),
  };
}

await mkdir(outputDir, { recursive: true });
await call("Runtime.enable");
await call("Page.enable");
await call("Network.enable");
await call("Network.setCacheDisabled", { cacheDisabled: true });
await call("Emulation.setDeviceMetricsOverride", {
  width: 844,
  height: 390,
  screenWidth: 844,
  screenHeight: 390,
  deviceScaleFactor: 2,
  mobile: true,
});
await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await call("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    globalThis.__kakiVibrations = [];
    try {
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (pattern) => {
          globalThis.__kakiVibrations.push(pattern);
          return true;
        },
      });
    } catch {}
  })();`,
});

const simple = await runTouchTrick({ mode: "simple", control: "trick", pointerId: 101 });
const advanced = await runTouchTrick({ mode: "advanced", control: "trick", pointerId: 102 });

await navigate("simple");
await touch("trick", { pointerId: 103, duration: 0, release: false });
await waitFor(
  async () => (await snapshot()).trickQueue.length === 1,
  300,
  "pre-takeoff queue before blur",
);
await evaluate("window.dispatchEvent(new Event('blur'))");
const cleared = await waitFor(async () => {
  const value = await snapshot();
  const feedback = await buttonState("trick");
  return value.lifecycle === "paused"
    && value.trickQueue.length === 0
    && feedback.state === "idle"
    ? { lifecycle: value.lifecycle, queue: value.trickQueue, feedback }
    : null;
}, 500, "blur queue clear");
await call("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });

await evaluate("globalThis.kakiSurf.resume()");
await waitFor(
  async () => (await snapshot()).lifecycle === "running",
  500,
  "resume before orientation change",
);
await touch("trick", { pointerId: 104, duration: 0, release: false });
await waitFor(
  async () => (await snapshot()).trickQueue.length === 1,
  300,
  "pre-takeoff queue before orientation change",
);
await call("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  screenWidth: 390,
  screenHeight: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
const orientationPaused = await waitFor(async () => {
  const value = await snapshot();
  const feedback = await buttonState("trick");
  const gate = await evaluate(`(() => {
    const element = document.querySelector(".orientation-gate");
    return { hidden: element.hidden, inert: element.inert };
  })()`);
  return value.lifecycle === "paused"
    && value.trickQueue.length === 0
    && feedback.state === "idle"
    && !gate.hidden
    ? { lifecycle: value.lifecycle, queue: value.trickQueue, feedback, gate }
    : null;
}, 800, "portrait orientation queue clear");
await call("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
await call("Emulation.setDeviceMetricsOverride", {
  width: 844,
  height: 390,
  screenWidth: 844,
  screenHeight: 390,
  deviceScaleFactor: 2,
  mobile: true,
});
const orientationResumed = await waitFor(async () => {
  const value = await snapshot();
  return value.lifecycle === "running" && value.trickQueue.length === 0
    ? { lifecycle: value.lifecycle, queue: value.trickQueue }
    : null;
}, 800, "landscape orientation resume");

await call("Emulation.setDeviceMetricsOverride", {
  width: 667,
  height: 375,
  screenWidth: 667,
  screenHeight: 375,
  deviceScaleFactor: 2,
  mobile: true,
});
await waitFor(
  () => evaluate("innerWidth === 667 && innerHeight === 375"),
  500,
  "short landscape viewport",
);
const shortSimple = await layout("simple");
await evaluate(`(() => {
  const select = document.querySelector('[data-setting="controlMode"]');
  select.value = "advanced";
  select.dispatchEvent(new Event("change", { bubbles: true }));
})()`);
const shortAdvanced = await waitFor(async () => {
  const value = await layout("advanced");
  return value.rects.special.width > 0 ? value : null;
}, 500, "short landscape Advanced layout");
await call("Emulation.setDeviceMetricsOverride", {
  width: 844,
  height: 390,
  screenWidth: 844,
  screenHeight: 390,
  deviceScaleFactor: 2,
  mobile: true,
});

for (const [name, result] of Object.entries({
  simple,
  advanced,
  shortSimple: { layout: shortSimple },
  shortAdvanced: { layout: shortAdvanced },
})) {
  if (result.layout.overlaps.length) {
    throw new Error(`${name} controls overlap: ${JSON.stringify(result.layout.overlaps)}`);
  }
}
for (const measured of [simple.layout, shortSimple]) {
  if (measured.rects.trick.width < 68 || measured.rects.edge.width < 76) {
    throw new Error(`Simple targets are too small: ${JSON.stringify(measured.rects)}`);
  }
}
for (const measured of [advanced.layout, shortAdvanced]) {
  for (const control of ["spinLeft", "spinRight", "trick", "special"]) {
    const rect = measured.rects[control];
    if (rect.width < 52 || rect.height < 52) {
      throw new Error(`Advanced ${control} target is too small: ${JSON.stringify(rect)}`);
    }
  }
}
if (!simple.transitions.some((state) => state.state === "queued")
  || !simple.transitions.some((state) => state.state === "active")) {
  throw new Error(`Simple feedback transitions incomplete: ${JSON.stringify(simple.transitions)}`);
}
if (!advanced.transitions.some((state) => state.state === "queued")
  || !advanced.transitions.some((state) => state.state === "active")) {
  throw new Error(`Advanced feedback transitions incomplete: ${JSON.stringify(advanced.transitions)}`);
}
if (simple.sequence.length !== 1 || advanced.sequence.length !== 1) {
  throw new Error("One browser touch press did not produce exactly one trick entry");
}
if (advanced.sequence[0].id !== "boardVarial") {
  throw new Error(`Advanced F produced ${advanced.sequence[0].id}`);
}
if (browserErrors.length) {
  throw new Error(`Browser errors: ${JSON.stringify(browserErrors)}`);
}

const report = {
  viewport: { width: 844, height: 390, deviceScaleFactor: 2 },
  simple,
  advanced,
  blurClear: cleared,
  orientationClear: {
    portrait: orientationPaused,
    landscape: orientationResumed,
  },
  shortLandscape: {
    simple: shortSimple,
    advanced: shortAdvanced,
  },
  browserErrors,
};
await writeFile(
  path.join(outputDir, "report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
socket.close();
console.log(`Trick-control browser acceptance passed. Evidence: ${outputDir}`);
