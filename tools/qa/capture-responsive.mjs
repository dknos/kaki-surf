import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9224";
const baseUrl = process.env.KAKI_SURF_QA_URL ?? "http://127.0.0.1:9876/index.html";
const outputDir = process.env.KAKI_SURF_RESPONSIVE_DIR
  ?? path.resolve("docs/images/qa-responsive");
const activeSceneOverride = process.env.KAKI_SURF_ACTIVE_QA_SCENE ?? "";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const profiles = [
  { name: "desktop-1280x720", width: 1280, height: 720, active: "simpleKeyboard", mobile: false },
  { name: "laptop-1366x768", width: 1366, height: 768, active: "simpleKeyboard", mobile: false },
  { name: "tablet-1024x768", width: 1024, height: 768, active: "touch", mobile: true },
  { name: "phone-portrait-390x844", width: 390, height: 844, active: "touch", mobile: true },
  { name: "phone-landscape-844x390", width: 844, height: 390, active: "touch", mobile: true },
];
const states = [
  ["menu", "menu"],
  ["active", null],
  ["pause", "pause"],
  ["results", "results"],
  ["options", "settingsSimple"],
];

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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
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
await call("Page.enable");

let captured = 0;
for (const profile of profiles) {
  await call("Emulation.setDeviceMetricsOverride", {
    width: profile.width,
    height: profile.height,
    screenWidth: profile.width,
    screenHeight: profile.height,
    deviceScaleFactor: 1,
    mobile: profile.mobile,
  });
  await call("Emulation.setTouchEmulationEnabled", {
    enabled: profile.mobile,
    maxTouchPoints: profile.mobile ? 5 : 1,
  });

  for (const [state, fixedScene] of states) {
    const scene = fixedScene ?? (activeSceneOverride || profile.active);
    const url = `${baseUrl}?qa=${encodeURIComponent(scene)}&capture=responsive-cdp`;
    await call("Page.navigate", { url });
    await waitForReady();
    await sleep(250);
    const viewport = await evaluate("({ width: innerWidth, height: innerHeight })");
    if (viewport.width !== profile.width || viewport.height !== profile.height) {
      throw new Error(`${profile.name}: expected ${profile.width}x${profile.height}, received ${viewport.width}x${viewport.height}`);
    }
    const screenshot = await call("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(
      path.join(outputDir, `${profile.name}-${state}.png`),
      Buffer.from(screenshot.data, "base64"),
    );
    captured += 1;
  }
}

socket.close();
console.log(`Captured ${captured} true-viewport responsive scenes in ${outputDir}.`);
