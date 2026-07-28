import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9227";
const baseUrl = process.env.KAKI_SURF_QA_URL ?? "http://127.0.0.1:9876/index.html";
const outputDir = process.env.KAKI_SURF_RECOVERY_DIR
  ?? path.resolve("docs/images/qa-recovery");
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
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
  else waiter.resolve(message.result ?? {});
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
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function snapshot() {
  return evaluate(`(() => {
    const value = globalThis.kakiSurf.getSnapshot();
    const camera = globalThis.kakiSurf.getCameraDebugSnapshot();
    return {
      lifecycle: value.lifecycle,
      state: value.state,
      elapsed: value.elapsed,
      wipeouts: value.wipeouts,
      curlX: camera.curlWorldX,
      contactX: value.breakX,
      cameraWorldX: camera.cameraWorldX,
      playerWorldX: camera.playerWorldX,
      playerScreenX: camera.playerScreenX,
      breakScreenX: value.breakX - camera.cameraWorldX,
      contactGap: camera.playerWorldX - value.breakX,
    };
  })()`);
}

async function waitForReady(timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate("Boolean(globalThis.kakiSurf && document.readyState === 'complete')")) return;
    await sleep(50);
  }
  throw new Error("Timed out waiting for Kaki Surf");
}

async function waitFor(predicate, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await snapshot();
    if (predicate(value)) return value;
    await sleep(50);
  }
  throw new Error(`${label} timed out: ${JSON.stringify(await snapshot())}`);
}

async function key(code, down) {
  const keyCodes = {
    ArrowUp: 38,
    KeyF: 70,
  };
  await call("Input.dispatchKeyEvent", {
    type: down ? "keyDown" : "keyUp",
    key: code,
    code,
    windowsVirtualKeyCode: keyCodes[code],
    nativeVirtualKeyCode: keyCodes[code],
  });
}

async function capture(name) {
  const screenshot = await call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outputDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));
}

await mkdir(outputDir, { recursive: true });
await call("Runtime.enable");
await call("Page.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 720,
  screenWidth: 1280,
  screenHeight: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
await call("Page.navigate", { url: baseUrl });
await waitForReady();
await waitFor(
  (value) => value.lifecycle === "menu",
  10_000,
  "game load",
);
await evaluate(`(() => {
  const controlMode = document.querySelector('[data-setting="controlMode"]');
  controlMode.value = "simple";
  controlMode.dispatchEvent(new Event("change", { bubbles: true }));
  const landingAssist = document.querySelector('[data-setting="landingAssist"]');
  landingAssist.checked = false;
  landingAssist.dispatchEvent(new Event("change", { bubbles: true }));
  globalThis.kakiSurf.start({
    immediate: true,
    board: "foamPuff",
    condition: "twilightGlass",
    mode: "endless",
  });
  return true;
})()`);
const riding = await waitFor(
  (value) => value.lifecycle === "running" && value.state === "riding",
  5_000,
  "opening ride",
);
await capture("00-riding");

await key("ArrowUp", true);
const airborne = await waitFor(
  (value) => value.state === "airborne",
  8_000,
  "real keyboard jump",
);
await key("ArrowUp", false);
await key("KeyF", true);
await capture("01-airborne");
const wipeout = await waitFor(
  (value) => value.state === "wipeout" && value.wipeouts === 1,
  10_000,
  "held-trick landing crash",
);
await key("KeyF", false);
await capture("02-wipeout");

const samples = [wipeout];
let entryCaptured = false;
while (samples.at(-1).state !== "riding" || samples.at(-1).wipeouts !== 1) {
  await sleep(50);
  const value = await snapshot();
  samples.push(value);
  if (!entryCaptured && value.state === "entry") {
    entryCaptured = true;
    await capture("03-moving-entry");
  }
  if (samples.length > 120) {
    throw new Error(`Recovery did not finish: ${JSON.stringify(samples.at(-1))}`);
  }
}
await capture("04-riding-again");

for (let index = 1; index < samples.length; index += 1) {
  if (!(samples[index].curlX > samples[index - 1].curlX)) {
    throw new Error(
      `Wave stopped or reversed at sample ${index}: `
      + `${samples[index - 1].curlX} -> ${samples[index].curlX}`,
    );
  }
}
const entrySamples = samples.filter((value) => value.state === "entry");
if (!entrySamples.length) throw new Error("Recovery skipped its protected entry");
if (Math.min(...entrySamples.map((value) => value.contactGap)) < 121) {
  throw new Error(`Recovery gap collapsed: ${JSON.stringify(entrySamples)}`);
}

const metrics = {
  riding,
  airborne,
  wipeout,
  recovered: samples.at(-1),
  crashAdvance: entrySamples[0].curlX - wipeout.curlX,
  entryAdvance: samples.at(-1).curlX - entrySamples[0].curlX,
  minimumEntryGap: Math.min(...entrySamples.map((value) => value.contactGap)),
  samples,
};
await writeFile(
  path.join(outputDir, "recovery-metrics.json"),
  `${JSON.stringify(metrics, null, 2)}\n`,
);
socket.close();
console.log(`Captured monotonic crash recovery in ${outputDir}`);
