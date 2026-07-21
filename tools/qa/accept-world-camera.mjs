import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9226";
const baseUrl = process.env.KAKI_SURF_QA_URL
  ?? `http://127.0.0.1:4173/index.html?debugCamera=1&qaBuild=${Date.now()}`;
const outputDir = process.env.KAKI_SURF_CAMERA_QA_DIR
  ?? path.resolve("docs/images/qa-world-camera");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const pages = await fetch(`${cdpHost}/json/list`).then((response) => response.json());
const target = pages.find((entry) => entry.type === "page");
if (!target) throw new Error("No debuggable Chromium page found");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});
let sequence = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(message.error.message));
  else waiter.resolve(message.result ?? {});
});
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const result = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
}
async function key(code, down) {
  const map = {
    ArrowRight: ["ArrowRight", 39], ArrowLeft: ["ArrowLeft", 37],
    ArrowUp: ["ArrowUp", 38], Space: [" ", 32], ShiftLeft: ["Shift", 16],
  };
  const [keyValue, windowsVirtualKeyCode] = map[code];
  await call("Input.dispatchKeyEvent", {
    type: down ? "keyDown" : "keyUp", code, key: keyValue, windowsVirtualKeyCode,
  });
}
async function hold(codes, ms) {
  for (const code of codes) await key(code, true);
  await sleep(ms);
  for (const code of [...codes].reverse()) await key(code, false);
}
async function telemetry(label) {
  const value = await evaluate(`({ label: ${JSON.stringify(label)}, ...kakiSurf.getCameraDebugSnapshot() })`);
  metrics.push(value);
  return value;
}
async function screenshot(name) {
  const result = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(path.join(outputDir, `${name}.png`), Buffer.from(result.data, "base64"));
}

await mkdir(outputDir, { recursive: true });
await call("Runtime.enable");
await call("Page.enable");
await call("Network.enable");
await call("Network.setCacheDisabled", { cacheDisabled: true });
await call("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await call("Page.navigate", { url: baseUrl });
for (let attempt = 0; attempt < 200; attempt += 1) {
  if (await evaluate("Boolean(globalThis.kakiSurf && document.readyState === 'complete')")) break;
  await sleep(50);
}
await evaluate(`(() => {
  const select=document.querySelector('[data-setting="controlMode"]');
  select.value='advanced'; select.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('[data-action="start"]').click();
})()`);
await sleep(800);

const metrics = [];
await telemetry("start");
await hold(["ArrowRight"], 5200);
await telemetry("right-held");
await screenshot("01-right-held");
await hold(["ArrowRight", "ShiftLeft"], 3000);
await telemetry("turbo-held");
await screenshot("02-turbo-lead");
await hold(["ArrowLeft"], 6500);
await telemetry("left-held");
await screenshot("03-left-reverse");

// Real line input plus held/released Action launches three physical jumps.
for (const [name, chargeMs, turbo] of [["small", 220, false], ["medium", 650, false], ["maximum", 1200, true]]) {
  await evaluate("kakiSurf.restart()");
  await sleep(900);
  if (name === "maximum") {
    await hold(["ArrowRight", "ShiftLeft"], 2200);
    await hold(["ArrowUp", "ArrowRight"], 350);
  }
  const keys = ["ArrowUp", "Space", ...(turbo ? ["ShiftLeft"] : [])];
  for (const code of keys) await key(code, true);
  await sleep(chargeMs);
  await key("Space", false);
  const finishClimb = Math.max(0, 1450 - chargeMs);
  await sleep(finishClimb);
  await key("ArrowUp", false);
  if (turbo) await key("ShiftLeft", false);
  let peak = await telemetry(`${name}-launch`);
  for (let attempt = 0; attempt < 180; attempt += 1) {
    await sleep(34);
    const sample = await telemetry(`${name}-flight`);
    if (sample.maxAirHeight > peak.maxAirHeight) {
      peak = sample;
      await screenshot(`04-${name}-peak`);
    }
    metrics.pop();
    if (sample.state !== "airborne" && attempt > 8) break;
  }
  metrics.push({ ...peak, label: `${name}-peak` });
}

await writeFile(path.join(outputDir, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
socket.close();
console.log(JSON.stringify(metrics, null, 2));
