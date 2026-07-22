import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9226";
const baseUrl = process.env.KAKI_SURF_QA_URL
  ?? `http://127.0.0.1:4173/index.html?stabilityBuild=${Date.now()}`;
const outputDir = process.env.KAKI_SURF_AERIAL_QA_DIR
  ?? path.resolve("docs/images/qa-aerial-stability");
const conditionId = process.env.KAKI_SURF_QA_CONDITION ?? "twilightGlass";
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
const browserFailures = [];
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
    browserFailures.push(message.params?.exceptionDetails?.exception?.description ?? "Uncaught page exception");
  }
  if (message.method === "Log.entryAdded" && message.params?.entry?.level === "error") {
    browserFailures.push(message.params.entry.text);
  }
  if (message.method === "Network.responseReceived" && Number(message.params?.response?.status) >= 400) {
    browserFailures.push(`${message.params.response.status} ${message.params.response.url}`);
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
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
}

const keyMap = {
  ArrowRight: ["ArrowRight", 39],
  ArrowLeft: ["ArrowLeft", 37],
  ArrowUp: ["ArrowUp", 38],
  ArrowDown: ["ArrowDown", 40],
  Space: [" ", 32],
  ShiftLeft: ["Shift", 16],
};

async function key(code, down) {
  const [keyValue, windowsVirtualKeyCode] = keyMap[code];
  await call("Input.dispatchKeyEvent", {
    type: down ? "keyDown" : "keyUp",
    code,
    key: keyValue,
    windowsVirtualKeyCode,
  });
}

async function releaseAll() {
  for (const code of Object.keys(keyMap)) await key(code, false);
}

async function hold(codes, milliseconds) {
  for (const code of codes) await key(code, true);
  await sleep(milliseconds);
  for (const code of [...codes].reverse()) await key(code, false);
}

async function telemetry() {
  return evaluate("globalThis.kakiSurf.getCameraDebugSnapshot()");
}

function aerialFrame(sample, elapsedMs) {
  return {
    state: sample.state,
    naturalY: sample.naturalPlayerY,
    finalY: sample.finalPlayerScreenY,
    rotation: sample.rotation,
    activeTime: sample.activeTime,
    airVY: sample.airVY,
    stageOffsetY: sample.stageOffsetY,
    backdropAltitude: sample.backdropAltitude,
    backdropSourceX: sample.backdropSourceX,
    backdropSourceY: sample.backdropSourceY,
    elapsedMs,
  };
}

async function captureCanvas(name) {
  const frame = await evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let allOpaque = true;
    let lastRowOpaque = true;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 255) allOpaque = false;
    }
    const rowStart = (canvas.height - 1) * canvas.width * 4;
    for (let index = rowStart + 3; index < pixels.length; index += 4) {
      if (pixels[index] !== 255) lastRowOpaque = false;
    }
    const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      coverage: {
        width: canvas.width,
        height: canvas.height,
        allOpaque,
        lastRowOpaque,
        bottomLeft: pixel(0, canvas.height - 1),
        bottomRight: pixel(canvas.width - 1, canvas.height - 1),
      },
    };
  })()`);
  await writeFile(path.join(outputDir, `${name}.png`), Buffer.from(frame.dataUrl.split(",")[1], "base64"));
  return frame.coverage;
}

async function waitForPlayable(timeout = 5000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const sample = await telemetry();
    if (["riding", "landing"].includes(sample.state)) return sample;
    if (sample.state === "wipeout" || sample.state === "complete") {
      throw new Error(`Run became unplayable before the next jump: ${sample.state}`);
    }
    await sleep(16);
  }
  throw new Error("Timed out waiting for the next playable riding state");
}

function summarizeJump(name, frames, landing, coverage) {
  const apex = frames.reduce((best, frame) => frame.naturalY < best.naturalY ? frame : best);
  let currentPlateau = 0;
  let longestNonApexPlateau = 0;
  let renderedPlateau = 0;
  let longestRenderedNonApexPlateau = 0;
  for (let index = 1; index < frames.length; index += 1) {
    const before = frames[index - 1];
    const after = frames[index];
    const naturalDelta = after.naturalY - before.naturalY;
    const finalDelta = after.finalY - before.finalY;
    const nearApex = Math.abs(after.airVY) < 3 || Math.abs(before.airVY) < 3;
    if (!nearApex && Math.abs(naturalDelta) > 0.02 && Math.abs(finalDelta) < 1e-6) {
      currentPlateau += 1;
      longestNonApexPlateau = Math.max(longestNonApexPlateau, currentPlateau);
    } else {
      currentPlateau = 0;
    }
    if (!nearApex && Math.abs(naturalDelta) > 0.02
      && Math.round(before.finalY) === Math.round(after.finalY)) {
      renderedPlateau += 1;
      longestRenderedNonApexPlateau = Math.max(longestRenderedNonApexPlateau, renderedPlateau);
    } else {
      renderedPlateau = 0;
    }
    if (Math.abs(naturalDelta) > 0.02 && Math.sign(finalDelta) !== Math.sign(naturalDelta)) {
      throw new Error(`${name}: projected Y moved opposite physical Y at frame ${index}`);
    }
  }
  const backdropSources = new Set(frames.map((frame) => frame.backdropSourceY));
  const stageOffsets = frames.map((frame) => frame.stageOffsetY);
  const backdropSourceXs = frames.map((frame) => frame.backdropSourceX);
  let maximumBackdropSourceXDelta = 0;
  for (let index = 1; index < backdropSourceXs.length; index += 1) {
    maximumBackdropSourceXDelta = Math.max(
      maximumBackdropSourceXDelta,
      Math.abs(backdropSourceXs[index] - backdropSourceXs[index - 1]),
    );
  }
  let minimumQuarterSecondTravel = Number.POSITIVE_INFINITY;
  for (let index = 0; index < frames.length; index += 1) {
    const before = frames[index];
    let later = index + 1;
    while (later < frames.length && frames[later].elapsedMs - before.elapsedMs < 240) later += 1;
    if (later >= frames.length || frames[later].elapsedMs - before.elapsedMs > 300) continue;
    const after = frames[later];
    if (Math.abs(before.airVY) < 10 || Math.abs(after.airVY) < 10) continue;
    if (Math.min(before.naturalY, after.naturalY) > 30) continue;
    minimumQuarterSecondTravel = Math.min(
      minimumQuarterSecondTravel,
      Math.abs(after.finalY - before.finalY),
    );
  }
  return {
    takeoffNaturalY: frames[0].naturalY,
    takeoffFinalY: frames[0].finalY,
    apexNaturalY: apex.naturalY,
    apexFinalY: apex.finalY,
    visibleTravel: frames[0].finalY - apex.finalY,
    longestNonApexPlateau,
    longestRenderedNonApexPlateau,
    minimumQuarterSecondTravel,
    landingTimeMs: landing.elapsedMs,
    landingState: landing.state,
    activeTimeStart: frames[0].activeTime,
    activeTimeEnd: landing.activeTime,
    rotationStart: frames[0].rotation,
    rotationEnd: landing.rotation,
    rotationRange: Math.max(...frames.map((frame) => frame.rotation))
      - Math.min(...frames.map((frame) => frame.rotation)),
    stageOffsetRange: [Math.min(...stageOffsets), Math.max(...stageOffsets)],
    backdropAltitudes: [Math.min(...frames.map((frame) => frame.backdropAltitude)), Math.max(...frames.map((frame) => frame.backdropAltitude))],
    backdropSources: [...backdropSources],
    backdropSourceXRange: [Math.min(...backdropSourceXs), Math.max(...backdropSourceXs)],
    maximumBackdropSourceXDelta,
    capturedFrames: coverage.length,
    fullCanvasCoverage: coverage.every((entry) => entry.allOpaque
      && entry.lastRowOpaque
      && entry.width === 384
      && entry.height === 216),
    bottomCorners: coverage.map(({ bottomLeft, bottomRight }) => ({ bottomLeft, bottomRight })),
  };
}

async function performJump({
  name,
  prep = [],
  prepMs = 0,
  approachMs = 0,
  turbo = false,
  releaseAfterMs = 50,
  spin = false,
  chargeMs = 0,
}) {
  await waitForPlayable();
  if (prepMs > 0) await hold(prep, prepMs);
  if (approachMs > 0) await hold(["ArrowUp", "ArrowRight"], approachMs);

  await key("Space", true);
  if (chargeMs > 0) await sleep(chargeMs);
  const held = ["ArrowUp", ...(turbo ? ["ShiftLeft"] : [])];
  for (const code of held) await key(code, true);
  const inputStartedAt = Date.now();
  let first = null;
  while (Date.now() - inputStartedAt < 3000) {
    await sleep(8);
    const sample = await telemetry();
    if (sample.state === "airborne") {
      first = sample;
      break;
    }
  }
  await key("Space", false);
  if (!first) throw new Error(`${name}: real input did not launch Kaki`);

  const launchAt = Date.now();
  const frames = [aerialFrame(first, 0)];
  const coverage = [await captureCanvas(`${name}-0000ms`)];
  if (spin) await key("ArrowRight", true);
  let nextCaptureAt = 250;
  let lineReleased = false;
  let spinPhase = spin ? "right" : "done";
  let landing = null;
  while (Date.now() - launchAt < 5000) {
    await sleep(16);
    const elapsedMs = Date.now() - launchAt;
    if (!lineReleased && elapsedMs >= releaseAfterMs) {
      await key("ArrowUp", false);
      if (turbo) await key("ShiftLeft", false);
      lineReleased = true;
    }
    if (spinPhase === "right" && elapsedMs >= 260) {
      await key("ArrowRight", false);
      await key("ArrowLeft", true);
      spinPhase = "left";
    } else if (spinPhase === "left" && elapsedMs >= 540) {
      await key("ArrowLeft", false);
      spinPhase = "done";
    }
    const sample = await telemetry();
    if (sample.state !== "airborne") {
      landing = { ...sample, elapsedMs };
      coverage.push(await captureCanvas(`${name}-landing`));
      break;
    }
    frames.push(aerialFrame(sample, elapsedMs));
    if (elapsedMs >= nextCaptureAt) {
      coverage.push(await captureCanvas(`${name}-${String(nextCaptureAt).padStart(4, "0")}ms`));
      nextCaptureAt += 250;
    }
  }
  await releaseAll();
  if (!landing) throw new Error(`${name}: flight did not finish within five seconds`);
  if (landing.state === "wipeout") throw new Error(`${name}: jump ended in a wipeout`);
  await waitForPlayable();
  coverage.push(await captureCanvas(`${name}-ready`));
  return { name, frames, summary: summarizeJump(name, frames, landing, coverage) };
}

await mkdir(outputDir, { recursive: true });
await call("Runtime.enable");
await call("Log.enable");
await call("Network.enable");
await call("Network.setCacheDisabled", { cacheDisabled: true });
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
const expectedUrl = new URL(baseUrl).href;
for (let attempt = 0; attempt < 200; attempt += 1) {
  if (await evaluate(`location.href === ${JSON.stringify(expectedUrl)}
    && Boolean(globalThis.kakiSurf && document.readyState === 'complete')`)) break;
  await sleep(50);
}
// Runtime.enable may replay an exception from the page that existed before
// navigation. Only failures from the build under test belong to this run.
browserFailures.length = 0;
await evaluate(`(() => {
  document.querySelector(${JSON.stringify(`[data-condition="${conditionId}"]`)})?.click();
  const select = document.querySelector('[data-setting="controlMode"]');
  select.value = 'simple';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  const landingAssist = document.querySelector('[data-setting="landingAssist"]');
  landingAssist.checked = true;
  landingAssist.dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('[data-action="start"]').click();
})()`);
await sleep(800);

const jumps = [];
jumps.push(await performJump({
  name: "01-small",
  prep: ["ArrowLeft"],
  prepMs: 1800,
}));
jumps.push(await performJump({
  name: "02-medium",
  turbo: true,
}));
jumps.push(await performJump({
  name: "03-huge",
  prep: ["ArrowDown", "ArrowRight"],
  prepMs: 2000,
  turbo: true,
  spin: true,
}));

const report = {
  conditionId,
  logicalCanvas: { width: 384, height: 216 },
  consecutiveWithoutRestart: true,
  captureIntervalMs: 250,
  jumps,
};
await writeFile(path.join(outputDir, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(jumps.map(({ name, summary }) => ({ name, ...summary })), null, 2));

if (!(jumps[0].summary.visibleTravel < jumps[1].summary.visibleTravel
  && jumps[1].summary.visibleTravel < jumps[2].summary.visibleTravel)) {
  throw new Error("Real-input jump sequence did not increase from small to medium to huge");
}
if (jumps[2].summary.visibleTravel < 40) {
  throw new Error(`Huge air exposed only ${jumps[2].summary.visibleTravel.toFixed(2)} logical pixels`);
}
if (jumps.some((jump) => jump.summary.longestNonApexPlateau > 0)) {
  throw new Error("A non-apex rider screen-position plateau was detected");
}
if (!(jumps[2].summary.minimumQuarterSecondTravel >= 0.8)) {
  throw new Error(`Huge air moved only ${jumps[2].summary.minimumQuarterSecondTravel.toFixed(2)}px in a non-apex quarter second`);
}
if (jumps.some((jump) => jump.summary.backdropAltitudes.some((value) => value !== 0)
  || jump.summary.backdropSources.some((value) => value !== 424))) {
  throw new Error("A jump changed the stable condition backdrop");
}
if (jumps.some((jump) => jump.summary.maximumBackdropSourceXDelta > 1)) {
  throw new Error("Panorama source travel jumped to an unrelated part of the artwork");
}
if (jumps.some((jump) => !jump.summary.fullCanvasCoverage)) {
  throw new Error("A captured frame failed full-canvas coverage");
}
if (browserFailures.length) {
  throw new Error(`Browser QA reported ${browserFailures.length} error(s):\n${browserFailures.join("\n")}`);
}

socket.close();
