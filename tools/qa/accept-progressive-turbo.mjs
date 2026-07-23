import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9231";
const baseUrl = process.env.KAKI_SURF_QA_URL
  ?? `http://127.0.0.1:4173/index.html?debugCamera=1&turboBuild=${Date.now()}`;
const outputDir = process.env.KAKI_SURF_TURBO_QA_DIR
  ?? path.resolve("tmp/qa-progressive-turbo");
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

const keyMap = {
  ArrowRight: ["ArrowRight", 39],
  ArrowLeft: ["ArrowLeft", 37],
  ArrowUp: ["ArrowUp", 38],
  ArrowDown: ["ArrowDown", 40],
  Space: [" ", 32],
  ShiftLeft: ["Shift", 16],
  KeyQ: ["q", 81],
  KeyE: ["e", 69],
  KeyF: ["f", 70],
  KeyT: ["t", 84],
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

async function telemetry() {
  return evaluate("globalThis.kakiSurf.getCameraDebugSnapshot()");
}

async function canvasCoverage() {
  return evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let allOpaque = true;
    let lastRowOpaque = true;
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] !== 255) { allOpaque = false; break; }
    }
    const rowStart = (canvas.height - 1) * canvas.width * 4;
    for (let index = rowStart + 3; index < data.length; index += 4) {
      if (data[index] !== 255) { lastRowOpaque = false; break; }
    }
    const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
    return {
      width: canvas.width,
      height: canvas.height,
      allOpaque,
      lastRowOpaque,
      bottomLeft: pixel(0, canvas.height - 1),
      bottomRight: pixel(canvas.width - 1, canvas.height - 1),
    };
  })()`);
}

async function configure({ board = "mangoFish", reducedMotion = false, reducedFlash = false } = {}) {
  await evaluate(`(() => {
    document.querySelector(${JSON.stringify(`[data-board="${board}"]`)})?.click();
    const mode = document.querySelector('[data-setting="controlMode"]');
    mode.value = 'advanced';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    const landing = document.querySelector('[data-setting="landingAssist"]');
    landing.checked = true;
    landing.dispatchEvent(new Event('change', { bubbles: true }));
    const motion = document.querySelector('[data-setting="reducedMotion"]');
    motion.checked = ${reducedMotion};
    motion.dispatchEvent(new Event('change', { bubbles: true }));
    const flash = document.querySelector('[data-setting="reducedFlash"]');
    flash.checked = ${reducedFlash};
    flash.dispatchEvent(new Event('change', { bubbles: true }));
    if (globalThis.kakiSurf.getSnapshot().lifecycle === 'menu') {
      document.querySelector('[data-action="start"]').click();
    } else {
      globalThis.kakiSurf.restart();
    }
  })()`);
  await waitForState(["riding", "landing"], 4_000);
}

async function waitForState(states, timeout = 4_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const sample = await telemetry();
    if (states.includes(sample.state)) return sample;
    if (sample.state === "complete") throw new Error("Run completed during QA");
    await sleep(16);
  }
  throw new Error(`Timed out waiting for ${states.join("/")}`);
}

async function prepareNearLip() {
  await key("ArrowUp", true);
  const started = Date.now();
  let sample = await telemetry();
  while (Date.now() - started < 1_200 && sample.face > 0.22 && sample.state !== "airborne") {
    await sleep(16);
    sample = await telemetry();
  }
  await key("ArrowUp", false);
  if (sample.state === "airborne") throw new Error("Near-lip preparation launched early");
  await key("ArrowDown", true);
  const counterStarted = Date.now();
  while (Date.now() - counterStarted < 500 && sample.faceVelocity < 0.015) {
    await sleep(12);
    sample = await telemetry();
  }
  await key("ArrowDown", false);
  await sleep(220);
  sample = await telemetry();
  if (sample.face < 0.14 || sample.face > 0.34 || Math.abs(sample.faceVelocity) > 0.08) {
    throw new Error(`Near-lip setup was unstable (face ${sample.face}, velocity ${sample.faceVelocity})`);
  }
  return sample;
}

async function holdTracked(codes, duration, label, interval = 50) {
  for (const code of codes) await key(code, true);
  const started = Date.now();
  const samples = [];
  while (Date.now() - started < duration) {
    await sleep(Math.min(interval, duration - (Date.now() - started)));
    samples.push({ label, elapsedMs: Date.now() - started, ...await telemetry() });
  }
  for (const code of [...codes].reverse()) await key(code, false);
  return samples;
}

async function burnUntilCooking(direction = 1, timeout = 3_600) {
  const directionKey = direction < 0 ? "ArrowLeft" : "ArrowRight";
  await key(directionKey, true);
  await key("ShiftLeft", true);
  const started = Date.now();
  const samples = [];
  let cooking = null;
  while (Date.now() - started < timeout) {
    await sleep(33);
    const sample = { elapsedMs: Date.now() - started, ...await telemetry() };
    samples.push(sample);
    if (sample.state === "airborne") throw new Error("Full burn launched before Cooking");
    if (sample.turboTier === "cooking" && sample.turboCookingTimer > 0) {
      cooking = sample;
      break;
    }
  }
  await key("ShiftLeft", false);
  await key(directionKey, false);
  if (!cooking) throw new Error("Full tank did not reach Cooking");
  return { samples, cooking, durationMs: cooking.elapsedMs };
}

async function startCanvasRecorder() {
  await evaluate(`(() => {
    const canvas = document.querySelector('canvas');
    clearInterval(globalThis.__kakiTurboRecordTimer);
    globalThis.__kakiTurboFrames = [];
    globalThis.__kakiTurboRecordTimer = setInterval(() => {
      if (globalThis.__kakiTurboFrames.length >= 360) return;
      globalThis.__kakiTurboFrames.push(canvas.toDataURL('image/png'));
    }, 1000 / 15);
  })()`);
}

async function stopCanvasRecorder() {
  await evaluate("clearInterval(globalThis.__kakiTurboRecordTimer); globalThis.__kakiTurboRecordTimer = 0");
  const frameDir = path.join(outputDir, "clip-frames");
  await mkdir(frameDir, { recursive: true });
  let frameIndex = 0;
  while (await evaluate("globalThis.__kakiTurboFrames.length")) {
    const batch = await evaluate("globalThis.__kakiTurboFrames.splice(0, 24)");
    for (const dataUrl of batch) {
      const name = `frame-${String(frameIndex).padStart(4, "0")}.png`;
      await writeFile(path.join(frameDir, name), Buffer.from(dataUrl.split(",")[1], "base64"));
      frameIndex += 1;
    }
  }
  return { frameDir, frameCount: frameIndex, fps: 15 };
}

async function runShortTapProbe() {
  await configure();
  const samples = [];
  for (let tap = 0; tap < 4; tap += 1) {
    samples.push(...await holdTracked(["ShiftLeft"], 90, `tap-${tap}`));
    await sleep(240);
    samples.push({ label: `tap-${tap}-reset`, ...await telemetry() });
  }
  return summarizeProbe("short-taps", samples);
}

async function runHalfBurnProbe() {
  await configure();
  const samples = await holdTracked(["ArrowRight", "ShiftLeft"], 1_390, "half-burn", 33);
  await sleep(240);
  samples.push({ label: "half-burn-reset", ...await telemetry() });
  return summarizeProbe("half-burn", samples);
}

async function runEarlyReleaseProbe() {
  await configure();
  const samples = await holdTracked(["ArrowRight", "ShiftLeft"], 900, "early-first", 33);
  await sleep(260);
  samples.push({ label: "early-reset", ...await telemetry() });
  samples.push(...await holdTracked(["ArrowRight", "ShiftLeft"], 900, "early-second", 33));
  return summarizeProbe("release-repress", samples);
}

async function runBoardBurnProbe(board, direction = 1, settings = {}) {
  await configure({ board, ...settings });
  const burn = await burnUntilCooking(direction);
  return {
    name: `full-burn-${board}-${direction < 0 ? "left" : "right"}`,
    board,
    direction,
    settings,
    durationMs: burn.durationMs,
    maximumSpeed: Math.max(...burn.samples.map((sample) => Number(sample.speed) || 0)),
    tiers: [...new Set(burn.samples.map((sample) => sample.turboTier))],
    fullBurnEventsInferred: burn.samples.filter((sample) => sample.turboTier === "cooking").length,
    cookingTimer: burn.cooking.turboCookingTimer,
    coverage: await canvasCoverage(),
  };
}

async function runFullBurnWipeoutProbe() {
  await configure({ board: "mangoFish" });
  const burn = await burnUntilCooking(1);
  await key("ArrowDown", true);
  const started = Date.now();
  const samples = [];
  let wipeout = null;
  while (Date.now() - started < 2_500) {
    await sleep(16);
    const sample = { elapsedMs: Date.now() - started, ...await telemetry() };
    samples.push(sample);
    if (sample.state === "wipeout") {
      wipeout = sample;
      break;
    }
  }
  await key("ArrowDown", false);
  if (!wipeout) throw new Error("Full-burn real-input wipeout probe did not wipe out");
  if (wipeout.turboCookingTimer !== 0) throw new Error("Wipeout failed to cancel Cooking");
  return {
    name: "full-burn-wipeout",
    burnDurationMs: burn.durationMs,
    wipeoutCause: wipeout.wipeoutCause,
    cookingTimerAtWipeout: wipeout.turboCookingTimer,
    samples,
  };
}

async function runFullBurnLaunchClip() {
  await configure({ board: "moonLog" });
  await prepareNearLip();
  await startCanvasRecorder();
  await key("Space", true);
  const burn = await burnUntilCooking(1);
  const timeline = burn.samples.map((sample) => ({ phase: "burn", ...sample }));
  const cookingAt = Date.now();
  await key("ArrowRight", true);
  await key("ArrowUp", true);
  let launch = null;
  while (Date.now() - cookingAt < 900) {
    await sleep(12);
    const sample = { phase: "launch", elapsedMs: Date.now() - cookingAt, ...await telemetry() };
    timeline.push(sample);
    if (sample.state === "airborne") {
      launch = sample;
      break;
    }
  }
  await key("Space", false);
  await key("ArrowUp", false);
  await key("ArrowRight", false);
  if (!launch) throw new Error("Cooking carry did not produce a real-input launch");
  if (launch.aerialBoostStack < 0.3) {
    throw new Error(`Cooking launch did not inherit Turbo (${launch.aerialBoostStack})`);
  }

  const launchStarted = Date.now();
  const trickSchedule = [
    { code: "KeyQ", at: 120, duration: 260 },
    { code: "KeyE", at: 520, duration: 320 },
    { code: "KeyF", at: 980, duration: 80 },
    { code: "KeyT", at: 1_520, duration: 80 },
  ];
  for (const trick of trickSchedule) {
    trick.down = false;
    trick.up = false;
  }
  let landing = null;
  let apex = launch;
  let landingTrimKey = null;
  while (Date.now() - launchStarted < 7_000) {
    await sleep(16);
    const elapsedMs = Date.now() - launchStarted;
    for (const trick of trickSchedule) {
      if (!trick.down && elapsedMs >= trick.at) {
        await key(trick.code, true);
        trick.down = true;
      }
      if (trick.down && !trick.up && elapsedMs >= trick.at + trick.duration) {
        await key(trick.code, false);
        trick.up = true;
      }
    }
    const sample = { phase: "flight", elapsedMs, ...await telemetry() };
    timeline.push(sample);
    if (sample.naturalPlayerY < apex.naturalPlayerY) apex = sample;
    if (Number(sample.airVY) > 8
      && Number.isFinite(sample.boardAngle)
      && Number.isFinite(sample.landingTargetAngle)) {
      const rawDelta = sample.landingTargetAngle - sample.boardAngle;
      const delta = Math.atan2(Math.sin(rawDelta), Math.cos(rawDelta));
      const predicted = delta - (Number(sample.angularVelocity) || 0) * 0.13;
      const desired = Math.abs(predicted) > 0.045
        ? predicted > 0 ? "ArrowRight" : "ArrowLeft"
        : null;
      if (desired !== landingTrimKey) {
        if (landingTrimKey) await key(landingTrimKey, false);
        if (desired) await key(desired, true);
        landingTrimKey = desired;
      }
    }
    if (sample.state !== "airborne") {
      if (landingTrimKey) await key(landingTrimKey, false);
      landing = sample;
      break;
    }
  }
  await releaseAll();
  if (!landing) throw new Error("Full-burn flight did not resolve within seven seconds");
  await sleep(600);
  timeline.push({ phase: "recovery", ...await telemetry() });
  const recording = await stopCanvasRecorder();
  const coverage = await canvasCoverage();
  const trickIds = new Set(timeline.flatMap((sample) => sample.trickSequence ?? []).map((entry) => entry.id));
  return {
    name: "full-burn-huge-launch",
    burnDurationMs: burn.durationMs,
    takeoffY: launch.naturalPlayerY,
    apexY: apex.naturalPlayerY,
    visibleTravel: launch.finalPlayerScreenY - apex.finalPlayerScreenY,
    physicalHeight: Math.max(...timeline.map((sample) => Number(sample.maxAirHeight) || 0)),
    landingState: landing.state,
    landingQuality: landing.landingQuality,
    landingTimeMs: landing.elapsedMs,
    maximumSpeed: Math.max(...timeline.map((sample) => Number(sample.speed) || 0)),
    stageOffsetRange: range(timeline, "stageOffsetY"),
    cameraWorldYRange: range(timeline, "cameraWorldY"),
    backdropSourceXRange: range(timeline, "backdropSourceX"),
    backdropSourceYRange: range(timeline, "backdropSourceY"),
    maximumBackdropDelta: Math.max(...timeline.map((sample) => Number(sample.maximumPerFrameBackdropDelta) || 0)),
    effectPoolMaxima: {
      echoes: Math.max(...timeline.map((sample) => Number(sample.turboEffects?.echoes) || 0)),
      dashes: Math.max(...timeline.map((sample) => Number(sample.turboEffects?.dashes) || 0)),
      sparks: Math.max(...timeline.map((sample) => Number(sample.turboEffects?.sparks) || 0)),
      rings: Math.max(...timeline.map((sample) => Number(sample.turboEffects?.rings) || 0)),
    },
    trickIds: [...trickIds],
    coverage,
    recording,
    timeline,
  };
}

function summarizeProbe(name, samples) {
  return {
    name,
    maximumProgress: Math.max(...samples.map((sample) => Number(sample.turboBurnProgress) || 0)),
    finalProgress: Number(samples.at(-1)?.turboBurnProgress) || 0,
    maximumSpeed: Math.max(...samples.map((sample) => Number(sample.speed) || 0)),
    cookingObserved: samples.some((sample) => sample.turboTier === "cooking"),
    samples,
  };
}

function range(samples, key) {
  const values = samples.map((sample) => Number(sample[key]) || 0);
  return [Math.min(...values), Math.max(...values)];
}

await mkdir(outputDir, { recursive: true });
await call("Runtime.enable");
await call("Log.enable");
await call("Page.enable");
await call("Network.enable");
await call("Network.setCacheDisabled", { cacheDisabled: true });
await call("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 720,
  screenWidth: 1280,
  screenHeight: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
await call("Page.navigate", { url: baseUrl });
for (let attempt = 0; attempt < 200; attempt += 1) {
  if (await evaluate("Boolean(globalThis.kakiSurf && document.readyState === 'complete')")) break;
  await sleep(50);
}
browserFailures.length = 0;

const report = {
  baseUrl,
  logicalCanvas: { width: 384, height: 216 },
  probes: [],
};
report.probes.push(await runShortTapProbe());
report.probes.push(await runHalfBurnProbe());
report.probes.push(await runEarlyReleaseProbe());
for (const board of ["foamPuff", "mangoFish", "moonLog"]) {
  report.probes.push(await runBoardBurnProbe(board));
}
report.probes.push(await runBoardBurnProbe("mangoFish", -1));
report.probes.push(await runBoardBurnProbe("mangoFish", 1, { reducedMotion: true, reducedFlash: true }));
report.probes.push(await runFullBurnWipeoutProbe());
report.fullSequence = await runFullBurnLaunchClip();
report.browserFailures = browserFailures;

if (report.probes[0].cookingObserved || report.probes[0].finalProgress !== 0) {
  throw new Error("Short taps accumulated toward Cooking");
}
if (report.probes[1].cookingObserved || report.probes[1].finalProgress !== 0) {
  throw new Error("Half burn triggered or retained Cooking progress");
}
if (report.probes[2].cookingObserved) throw new Error("Release/re-press triggered Cooking");
if (report.probes.filter((probe) => Array.isArray(probe.tiers)).some((probe) => (
  !probe.tiers.includes("ignition")
  || !probe.tiers.includes("surge")
  || !probe.tiers.includes("redline")
  || !probe.tiers.includes("cooking")
))) {
  throw new Error("A full-burn board/direction/accessibility probe skipped a Turbo tier");
}
if (report.probes.filter((probe) => probe.coverage).some((probe) => (
  !probe.coverage.allOpaque || !probe.coverage.lastRowOpaque
))) {
  throw new Error("A full-burn probe exposed canvas coverage");
}
if (report.fullSequence.effectPoolMaxima.echoes > 4
  || report.fullSequence.effectPoolMaxima.dashes > 32
  || report.fullSequence.effectPoolMaxima.sparks > 48
  || report.fullSequence.effectPoolMaxima.rings > 3) {
  throw new Error("A Turbo effect pool exceeded its hard maximum");
}
if (!report.fullSequence.coverage.allOpaque || !report.fullSequence.coverage.lastRowOpaque) {
  throw new Error("Full-burn launch clip exposed the logical canvas");
}
if (browserFailures.length) throw new Error(`Browser failures: ${browserFailures.join(" | ")}`);

const summary = {
  probes: report.probes.map(({ name, durationMs, maximumProgress, finalProgress, maximumSpeed, tiers, coverage }) => ({
    name,
    durationMs,
    maximumProgress,
    finalProgress,
    maximumSpeed,
    tiers,
    coverage,
  })),
  fullSequence: { ...report.fullSequence, timeline: undefined },
};
await writeFile(path.join(outputDir, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
socket.close();
