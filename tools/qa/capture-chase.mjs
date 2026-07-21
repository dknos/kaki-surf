import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9227";
const baseUrl = process.env.KAKI_SURF_QA_URL ?? "http://127.0.0.1:9876/index.html";
const outputDir = process.env.KAKI_SURF_CHASE_DIR
  ?? path.resolve("docs/images/qa-chase");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const captureUrl = new URL(baseUrl);
captureUrl.searchParams.set("capture", "chase");

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

async function waitForReady(timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate("Boolean(globalThis.kakiSurf && document.readyState === 'complete')")) return;
    await sleep(50);
  }
  throw new Error("Timed out waiting for Kaki Surf");
}

async function capture(name) {
  const screenshot = await call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outputDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));
}

async function waitForSnapshot(predicate, timeout, label) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const snapshot = await evaluate(`(() => {
      const value = globalThis.kakiSurf.getSnapshot();
      return {
        lifecycle: value.lifecycle,
        state: value.state,
        elapsed: value.elapsed,
        wipeouts: value.wipeouts,
        travelDirection: value.travelDirection,
        playerX: value.playerX,
        cameraWorldX: value.cameraWorldX,
        breakX: value.breakX,
      };
    })()`);
    if (predicate(snapshot)) return snapshot;
    await sleep(50);
  }
  const snapshot = await evaluate(`(() => {
    const value = globalThis.kakiSurf.getSnapshot();
    return {
      lifecycle: value.lifecycle,
      state: value.state,
      elapsed: value.elapsed,
      wipeouts: value.wipeouts,
      travelDirection: value.travelDirection,
      playerX: value.playerX,
      cameraWorldX: value.cameraWorldX,
      breakX: value.breakX,
    };
  })()`);
  throw new Error(`${label} timed out: ${JSON.stringify(snapshot)}`);
}

async function key(code, down) {
  const keyCode = code === "ArrowRight" ? 39 : 37;
  await call("Input.dispatchKeyEvent", {
    type: down ? "keyDown" : "keyUp",
    key: code,
    code,
    windowsVirtualKeyCode: keyCode,
    nativeVirtualKeyCode: keyCode,
  });
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
await call("Page.navigate", { url: captureUrl.toString() });
await waitForReady();
await call("Page.bringToFront");
await evaluate("(() => { globalThis.kakiSurf.start({ immediate: true, board: 'mangoFish', condition: 'twilightGlass', mode: 'endless' }); return true; })()");
await waitForSnapshot((snapshot) => snapshot.lifecycle === "running", 5_000, "run start");

const openingStart = await waitForSnapshot(
  (snapshot) => snapshot.state === "riding",
  5_000,
  "opening ride",
);
await capture("00a-opening-start");
const openingMove = await waitForSnapshot(
  (snapshot) => snapshot.elapsed >= 3 && snapshot.wipeouts === 0,
  6_000,
  "opening motion",
);
await capture("00b-opening-moving");

await key("ArrowRight", true);
const lead = await waitForSnapshot(
  (snapshot) => snapshot.cameraWorldX > 110 && snapshot.breakX < -58,
  18_000,
  "offscreen lead",
);
await capture("01-barrel-offscreen");

await key("ArrowRight", false);
await key("ArrowLeft", true);
const cutback = await waitForSnapshot(
  (snapshot) => snapshot.travelDirection === -1 && snapshot.playerX < 200,
  15_000,
  "screen-crossing cutback",
);
await capture("02-cutback-fixed-camera");

const returning = await waitForSnapshot(
  (snapshot) => snapshot.breakX >= 20,
  55_000,
  "barrel pursuit return",
);
await capture("03-barrel-pursuit-return");
await key("ArrowLeft", false);

const metrics = { openingStart, openingMove, lead, cutback, return: returning };
if (!(openingMove.breakX > openingStart.breakX + 8 && openingMove.wipeouts === 0)) {
  throw new Error(`Barrel froze during the protected opening: ${JSON.stringify(metrics)}`);
}
if (!(lead.breakX < -58)) throw new Error(`Lead did not clear the complete barrel: ${lead.breakX}`);
if (!(cutback.playerX < 220 && cutback.travelDirection === -1)) {
  throw new Error(`Cutback did not cross the face: ${JSON.stringify(cutback)}`);
}
if (Math.abs(cutback.cameraWorldX - returning.cameraWorldX) > 0.5) {
  throw new Error("Camera reversed during the return line");
}
if (!(returning.breakX >= 20)) {
  throw new Error(`Barrel did not pursue back: ${returning.breakX}`);
}

await writeFile(
  path.join(outputDir, "chase-metrics.json"),
  `${JSON.stringify(metrics, null, 2)}\n`,
);
socket.close();
console.log(`Captured California-style chase states in ${outputDir}`);
