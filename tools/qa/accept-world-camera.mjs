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
async function scheduleTimedCanvasFrames(prefix) {
  await evaluate(`(() => {
    globalThis.__kakiTimedFrames = {};
    const source = document.querySelector('canvas');
    const grab = (label) => requestAnimationFrame(() => {
      const target = document.createElement('canvas');
      target.width = source.width;
      target.height = source.height;
      target.getContext('2d').drawImage(source, 0, 0);
      globalThis.__kakiTimedFrames[label] = target.toDataURL('image/png');
    });
    grab('launch-000ms');
    setTimeout(() => grab('launch-100ms'), 100);
    setTimeout(() => grab('launch-250ms'), 250);
  })()`);
  return prefix;
}
async function persistTimedCanvasFrames(prefix) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const frames = await evaluate("globalThis.__kakiTimedFrames ?? {}");
    if (Object.keys(frames).length === 3) {
      for (const [label, dataUrl] of Object.entries(frames)) {
        await writeFile(path.join(outputDir, `${prefix}-${label}.png`), Buffer.from(dataUrl.split(",")[1], "base64"));
      }
      return;
    }
    await sleep(10);
  }
  throw new Error(`${prefix}: timed logical-canvas frames were not captured`);
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

async function configureReducedMotion(enabled) {
  await evaluate(`(() => {
    const input = document.querySelector('[data-setting="reducedMotion"]');
    input.checked = ${enabled ? "true" : "false"};
    input.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
}

async function captureCheckpoint(run, label) {
  const sample = await telemetry(`${run.name}-${label}`);
  metrics.pop();
  const enriched = {
    ...sample,
    elapsedFromLaunchMs: run.launchAt ? Date.now() - run.launchAt : null,
    legacyStageOffsetY: -(Number(sample.cameraWorldY) || 0),
  };
  run.checkpoints.push(enriched);
  await screenshot(`${run.prefix}-${label}`);
  return enriched;
}

async function capturePhysicalAir({ name, prefix, chargeMs, turbo = false, direction = 1, reducedMotion = false }) {
  await configureReducedMotion(reducedMotion);
  await evaluate("kakiSurf.restart()");
  await sleep(900);
  const directionKey = direction < 0 ? "ArrowLeft" : "ArrowRight";
  if (direction < 0) await hold(["ArrowLeft"], 2200);
  if (turbo) {
    await hold([directionKey, "ShiftLeft"], 2200);
    await hold(["ArrowUp", directionKey], 350);
  }

  const run = {
    name,
    prefix,
    chargeMs,
    turbo,
    direction,
    reducedMotion,
    launchAt: 0,
    checkpoints: [],
    timeline: [],
  };
  await captureCheckpoint(run, "riding");
  const held = [directionKey, "ArrowUp", "Space", ...(turbo ? ["ShiftLeft"] : [])];
  for (const code of held) await key(code, true);
  const inputStartedAt = Date.now();
  let lipCaptured = false;
  let firstAirborne = null;
  while (Date.now() - inputStartedAt < chargeMs) {
    await sleep(10);
    const sample = await telemetry(`${name}-charge`);
    metrics.pop();
    if (!lipCaptured && sample.state === "lip") {
      lipCaptured = true;
      run.checkpoints.push({ ...sample, label: `${name}-lip`, elapsedFromLaunchMs: null, legacyStageOffsetY: -(Number(sample.cameraWorldY) || 0) });
      await screenshot(`${prefix}-lip`);
    }
    if (sample.state === "airborne") {
      firstAirborne = sample;
      break;
    }
  }
  await key("Space", false);

  if (!firstAirborne) {
    for (let attempt = 0; attempt < 180; attempt += 1) {
      await sleep(8);
      const sample = await telemetry(`${name}-await-launch`);
      metrics.pop();
      if (sample.state === "lip" && !lipCaptured) {
        lipCaptured = true;
        run.checkpoints.push({ ...sample, label: `${name}-lip`, elapsedFromLaunchMs: null, legacyStageOffsetY: -(Number(sample.cameraWorldY) || 0) });
        await screenshot(`${prefix}-lip`);
      }
      if (sample.state === "airborne") {
        firstAirborne = sample;
        break;
      }
    }
  }
  if (!firstAirborne) throw new Error(`${name}: physical input never launched Kaki`);
  run.launchAt = Date.now();
  run.checkpoints.push({ ...firstAirborne, label: `${name}-launch-000ms`, elapsedFromLaunchMs: 0, legacyStageOffsetY: -(Number(firstAirborne.cameraWorldY) || 0) });
  await scheduleTimedCanvasFrames(prefix);
  await sleep(Math.max(0, run.launchAt + 100 - Date.now()));
  {
    const sample = await telemetry(`${name}-launch-100ms`);
    metrics.pop();
    run.checkpoints.push({ ...sample, elapsedFromLaunchMs: Date.now() - run.launchAt, legacyStageOffsetY: -(Number(sample.cameraWorldY) || 0) });
  }
  await sleep(Math.max(0, run.launchAt + 250 - Date.now()));
  {
    const sample = await telemetry(`${name}-launch-250ms`);
    metrics.pop();
    run.checkpoints.push({ ...sample, elapsedFromLaunchMs: Date.now() - run.launchAt, legacyStageOffsetY: -(Number(sample.cameraWorldY) || 0) });
  }
  await persistTimedCanvasFrames(prefix);

  let releasedLine = false;
  let apexCaptured = false;
  let descentCaptured = false;
  let reentryCaptured = false;
  let peakAltitude = firstAirborne.aerialAltitude;
  let previous = firstAirborne;
  for (let attempt = 0; attempt < 360; attempt += 1) {
    await sleep(16);
    if (!releasedLine && Date.now() - inputStartedAt >= 1450) {
      await key("ArrowUp", false);
      await key(directionKey, false);
      if (turbo) await key("ShiftLeft", false);
      releasedLine = true;
    }
    const sample = await telemetry(`${name}-timeline`);
    metrics.pop();
    const elapsedFromLaunchMs = Date.now() - run.launchAt;
    const enriched = { ...sample, elapsedFromLaunchMs, legacyStageOffsetY: -(Number(sample.cameraWorldY) || 0) };
    run.timeline.push(enriched);
    peakAltitude = Math.max(peakAltitude, Number(sample.aerialAltitude) || 0);
    if (!apexCaptured && (Number(previous.airVY) || 0) < 0 && (Number(sample.airVY) || 0) >= 0) {
      apexCaptured = true;
      run.checkpoints.push({ ...enriched, label: `${name}-apex` });
      await screenshot(`${prefix}-apex`);
    }
    if (!descentCaptured && (Number(sample.airVY) || 0) > 24) {
      descentCaptured = true;
      run.checkpoints.push({ ...enriched, label: `${name}-descent` });
      await screenshot(`${prefix}-descent`);
    }
    if (!reentryCaptured && peakAltitude >= 0.22 && (Number(sample.airVY) || 0) > 0 && (Number(sample.aerialAltitude) || 0) < 0.2) {
      reentryCaptured = true;
      run.checkpoints.push({ ...enriched, label: `${name}-reentry` });
      await screenshot(`${prefix}-reentry`);
    }
    if (sample.state !== "airborne") {
      const touchdownAt = Date.now();
      run.checkpoints.push({ ...enriched, label: `${name}-touchdown` });
      await screenshot(`${prefix}-touchdown`);
      await sleep(Math.max(0, touchdownAt + 300 - Date.now()));
      await captureCheckpoint(run, "landing-plus-300ms");
      break;
    }
    previous = sample;
  }
  if (!releasedLine) {
    await key("ArrowUp", false);
    await key(directionKey, false);
    if (turbo) await key("ShiftLeft", false);
  }

  const all = [...run.checkpoints, ...run.timeline];
  let maximumRiderPresentationDeltaPerFrame = 0;
  let maximumExcessRiderMotionPerFrame = 0;
  for (let index = 1; index < run.timeline.length; index += 1) {
    const before = run.timeline[index - 1];
    const after = run.timeline[index];
    const elapsed = Math.max(1, after.elapsedFromLaunchMs - before.elapsedFromLaunchMs);
    const offsetDelta = Math.abs((Number(after.riderFrameOffsetY) || 0) - (Number(before.riderFrameOffsetY) || 0));
    maximumRiderPresentationDeltaPerFrame = Math.max(
      maximumRiderPresentationDeltaPerFrame,
      offsetDelta * Math.min(1, (1000 / 60) / elapsed),
    );
    const finalDelta = Math.abs((Number(after.finalPlayerScreenY) || 0) - (Number(before.finalPlayerScreenY) || 0));
    const naturalDelta = Math.abs((Number(after.naturalPlayerY) || 0) - (Number(before.naturalPlayerY) || 0));
    maximumExcessRiderMotionPerFrame = Math.max(
      maximumExcessRiderMotionPerFrame,
      Math.max(0, finalDelta - naturalDelta) * Math.min(1, (1000 / 60) / elapsed),
    );
  }
  const checkpoint = (suffix) => run.checkpoints.find((sample) => sample.label === `${name}-${suffix}`);
  run.summary = {
    maximumLegacyStageTranslation: Math.max(...all.map((sample) => Math.abs(Number(sample.legacyStageOffsetY) || 0))),
    maximumStageOffset: Math.max(...all.map((sample) => Math.abs(Number(sample.stageOffsetY) || 0))),
    maximumHudOffset: Math.max(...all.map((sample) => Math.abs(Number(sample.hudOffsetY) || 0))),
    horizonRange: Math.max(...all.map((sample) => Number(sample.horizonScreenY) || 0))
      - Math.min(...all.map((sample) => Number(sample.horizonScreenY) || 0)),
    maximumBackdropDelta: Math.max(...all.map((sample) => Number(sample.maximumPerFrameBackdropDelta) || 0)),
    peakNaturalHeight: Math.min(...all.map((sample) => Number(sample.naturalPlayerY) || 0)),
    peakFinalPlayerY: Math.min(...all.map((sample) => Number(sample.finalPlayerScreenY) || 0)),
    maximumRiderFrameOffset: Math.max(...all.map((sample) => Number(sample.riderFrameOffsetY) || 0)),
    maximumRiderPresentationDeltaPerFrame,
    maximumExcessRiderMotionPerFrame,
    peakBackdropAltitude: Math.max(...all.map((sample) => Number(sample.backdropAltitude) || 0)),
    backdropAtTouchdown: Number(checkpoint("touchdown")?.backdropAltitude) || 0,
    backdropAfterLanding: Number(checkpoint("landing-plus-300ms")?.backdropAltitude) || 0,
    riderOffsetAtTouchdown: Number(checkpoint("touchdown")?.riderFrameOffsetY) || 0,
    launch100msActual: Number(checkpoint("launch-100ms")?.elapsedFromLaunchMs) || 0,
    launch250msActual: Number(checkpoint("launch-250ms")?.elapsedFromLaunchMs) || 0,
    landedState: run.checkpoints.some((sample) => sample.label.endsWith("touchdown") && sample.state !== "airborne"),
  };
  delete run.launchAt;
  return run;
}

const runs = [];
runs.push(await capturePhysicalAir({ name: "ordinary-right", prefix: "10-ordinary-right", chargeMs: 220 }));
runs.push(await capturePhysicalAir({ name: "maximum-right", prefix: "20-maximum-right", chargeMs: 1200, turbo: true }));
runs.push(await capturePhysicalAir({ name: "ordinary-left", prefix: "30-ordinary-left", chargeMs: 220, direction: -1 }));
runs.push(await capturePhysicalAir({ name: "maximum-reduced", prefix: "40-maximum-reduced", chargeMs: 1200, turbo: true, reducedMotion: true }));

const report = {
  logicalCanvas: { width: 384, height: 216 },
  horizontalCheckpoints: metrics,
  runs,
};
await writeFile(path.join(outputDir, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`);
socket.close();
console.log(JSON.stringify(runs.map(({ name, summary }) => ({ name, ...summary })), null, 2));
