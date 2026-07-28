import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9225";
const baseUrl = process.env.KAKI_SURF_QA_URL
  ?? `http://127.0.0.1:9876/index.html?gullStability=${Date.now()}`;
const outputDir = process.env.KAKI_SURF_GULL_QA_DIR
  ?? path.resolve("docs/images/qa-gull-stability");
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

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
  if (message.method === "Network.responseReceived"
    && Number(message.params?.response?.status) >= 400) {
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
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(predicate, label, timeout = 5_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = await sample();
    if (predicate(value)) return value;
    await sleep(16);
  }
  throw new Error(`${label} timed out`);
}

async function sample() {
  return evaluate(`(() => {
    const game = globalThis.kakiSurf;
    const snapshot = game?.getSnapshot?.();
    const camera = game?.getCameraDebugSnapshot?.();
    const traffic = [
      ...(snapshot?.world?.traffic?.far ?? []),
      ...(snapshot?.world?.traffic?.mid ?? []),
    ];
    let gull = traffic.find((entity) => entity.id === globalThis.__kakiGullId);
    if (!gull) {
      gull = traffic.find((entity) =>
        entity.kind === "guestbookGull" && entity.y >= 36 && entity.y <= 72
      );
      if (gull) globalThis.__kakiGullId = gull.id;
    }
    return {
      lifecycle: snapshot?.lifecycle,
      playerState: snapshot?.state,
      playerScreenY: camera?.playerScreenY,
      cameraWorldY: camera?.cameraWorldY,
      backdropSourceY: camera?.backdropSourceY,
      gull: gull ? {
        id: gull.id,
        layer: gull.layer,
        y: gull.y,
        renderY: gull.y - (Number(camera?.cameraWorldY) || 0),
        panoramaAnchorY: gull.y
          - (Number(camera?.cameraWorldY) || 0)
          + (Number(camera?.backdropSourceY) || 0),
        previousY: gull.previousY,
        vy: gull.vy,
        reaction: gull.reaction,
        phase: gull.phase,
      } : null,
    };
  })()`);
}

async function capture(name) {
  const dataUrl = await evaluate(`document.querySelector("canvas").toDataURL("image/png")`);
  await writeFile(
    path.join(outputDir, `${name}.png`),
    Buffer.from(dataUrl.split(",")[1], "base64"),
  );
}

async function key(code, keyValue, keyCode, down) {
  await call("Input.dispatchKeyEvent", {
    type: down ? "keyDown" : "keyUp",
    code,
    key: keyValue,
    windowsVirtualKeyCode: keyCode,
  });
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

for (let attempt = 0; attempt < 300; attempt += 1) {
  if (await evaluate("Boolean(globalThis.kakiSurf && document.readyState === 'complete')")) break;
  await sleep(16);
}
browserFailures.length = 0;

await evaluate(`(() => {
  const game = globalThis.kakiSurf;
  game.start({
    immediate: true,
    board: "foamPuff",
    condition: "kakiLand",
    mode: "endless",
  });
  return true;
})()`);
await waitFor(
  (value) => value.lifecycle === "running" && value.playerState === "riding",
  "Kaki-Land opening ride",
);

const before = await waitFor(
  (value) => Boolean(value.gull),
  "naturally scheduled Guestbook Gull",
  45_000,
);
await capture("01-before-jump");

await key("ArrowRight", "ArrowRight", 39, true);
await sleep(350);
await key("ArrowRight", "ArrowRight", 39, false);
await key("Space", " ", 32, true);
await key("ArrowUp", "ArrowUp", 38, true);
await key("ShiftLeft", "Shift", 16, true);
await waitFor((value) => value.playerState === "airborne", "airborne state");
await key("Space", " ", 32, false);
await sleep(90);
await key("ArrowUp", "ArrowUp", 38, false);
await key("ShiftLeft", "Shift", 16, false);

const samples = [];
let crossingCaptured = false;
const flightStarted = Date.now();
while (Date.now() - flightStarted < 5_000) {
  const value = await sample();
  samples.push(value);
  if (!crossingCaptured && value.gull
    && Math.abs(Number(value.playerScreenY) - Number(value.gull.renderY)) < 4) {
    crossingCaptured = true;
    await capture("02-player-crossing-gull");
  }
  if (samples.length > 3 && value.playerState !== "airborne") break;
  await sleep(16);
}
await key("Space", " ", 32, false);
await key("ArrowUp", "ArrowUp", 38, false);
await key("ShiftLeft", "Shift", 16, false);
await capture("03-after-landing");

const gullSamples = [before, ...samples].map((value) => value.gull).filter(Boolean);
if (!gullSamples.length) throw new Error("Guestbook Gull disappeared before it could be measured");
const yValues = gullSamples.map((gull) => Number(gull.y));
const renderYValues = gullSamples.map((gull) => Number(gull.renderY));
const panoramaAnchorValues = gullSamples.map((gull) => Number(gull.panoramaAnchorY));
const report = {
  condition: "kakiLand",
  gullId: before.gull.id,
  gullLayer: before.gull.layer,
  playerReachedAirborne: samples.some((value) => value.playerState === "airborne"),
  playerCrossedGullHeight: samples.some((value) =>
    Math.abs(Number(value.playerScreenY) - Number(value.gull?.renderY)) < 4),
  samples: gullSamples.length,
  gullYRange: [Math.min(...yValues), Math.max(...yValues)],
  renderedGullYRange: [Math.min(...renderYValues), Math.max(...renderYValues)],
  panoramaAnchorYRange: [
    Math.min(...panoramaAnchorValues),
    Math.max(...panoramaAnchorValues),
  ],
  maximumGullVerticalDrift: Math.max(...yValues) - Math.min(...yValues),
  maximumPanoramaAnchorDrift:
    Math.max(...panoramaAnchorValues) - Math.min(...panoramaAnchorValues),
  reactions: [...new Set(gullSamples.map((gull) => gull.reaction).filter(Boolean))],
  verticalVelocities: [...new Set(gullSamples.map((gull) => Number(gull.vy)))],
};
await writeFile(path.join(outputDir, "metrics.json"), `${JSON.stringify(report, null, 2)}\n`);

if (!report.playerReachedAirborne) throw new Error("Real keyboard input never launched Kaki");
if (!report.playerCrossedGullHeight) throw new Error("The jump never crossed the gull's authored height");
if (report.maximumGullVerticalDrift > 1e-6) {
  throw new Error(`Guestbook Gull drifted vertically by ${report.maximumGullVerticalDrift}`);
}
if (report.maximumPanoramaAnchorDrift > 1e-6) {
  throw new Error(
    `Guestbook Gull detached from the panorama by ${report.maximumPanoramaAnchorDrift}`,
  );
}
if (report.reactions.length) {
  throw new Error(`Guestbook Gull inherited jump reactions: ${report.reactions.join(", ")}`);
}
if (report.verticalVelocities.some((velocity) => velocity !== 0)) {
  throw new Error(`Guestbook Gull inherited vertical velocity: ${report.verticalVelocities.join(", ")}`);
}
if (browserFailures.length) {
  throw new Error(`Browser reported ${browserFailures.length} error(s):\n${browserFailures.join("\n")}`);
}

socket.close();
console.log(JSON.stringify(report, null, 2));
