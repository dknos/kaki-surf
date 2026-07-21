import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9225";
const baseUrl = process.env.KAKI_SURF_QA_URL ?? "http://127.0.0.1:9876/index.html";
const outputDir = process.env.KAKI_SURF_QA_DIR
  ?? path.resolve("docs/images/qa");
const scenes = process.argv.slice(2);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!scenes.length) throw new Error("Pass at least one QA scene identifier");

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
const failures = [];
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
    failures.push(message.params?.exceptionDetails?.exception?.description ?? "Uncaught page exception");
  }
  if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
    failures.push(message.params.entry.text);
  }
  if (message.method === "Network.responseReceived") {
    const response = message.params?.response;
    if (Number(response?.status) >= 400) failures.push(`${response.status} ${response.url}`);
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

await mkdir(outputDir, { recursive: true });
await call("Runtime.enable");
await call("Log.enable");
await call("Network.enable");
await call("Page.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 720,
  screenWidth: 1280,
  screenHeight: 720,
  deviceScaleFactor: 1,
  mobile: false,
});

for (const scene of scenes) {
  const url = new URL(baseUrl);
  url.searchParams.set("qa", scene);
  url.searchParams.set("capture", "canonical-cdp");
  await call("Page.navigate", { url: url.toString() });
  await waitForReady();
  await sleep(180);
  const viewport = await evaluate("({ width: innerWidth, height: innerHeight })");
  if (viewport.width !== 1280 || viewport.height !== 720) {
    throw new Error(`${scene}: expected 1280x720, received ${viewport.width}x${viewport.height}`);
  }
  const screenshot = await call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(
    path.join(outputDir, `${scene}.png`),
    Buffer.from(screenshot.data, "base64"),
  );
}

socket.close();
if (failures.length) {
  throw new Error(`Browser QA reported ${failures.length} error(s):\n${failures.join("\n")}`);
}
console.log(`Captured ${scenes.length} deterministic 1280x720 browser QA scenes in ${outputDir}.`);
