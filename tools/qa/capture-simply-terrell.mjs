import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9232";
const baseUrl = process.env.KAKI_SURF_QA_URL ?? "http://127.0.0.1:9876/index.html";
const outputDir = process.env.KAKI_SURF_TERRELL_DIR
  ?? path.resolve("docs/images/qa-simply-terrell");
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

async function waitFor(expression, label, timeout = 10_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate(expression)) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function capture(name) {
  const screenshot = await call("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path.join(outputDir, `${name}.png`), Buffer.from(screenshot.data, "base64"));
}

async function key(code, down) {
  const keyCodes = {
    ArrowUp: 38,
    ShiftLeft: 16,
  };
  const keys = {
    ArrowUp: "ArrowUp",
    ShiftLeft: "Shift",
  };
  await call("Input.dispatchKeyEvent", {
    type: down ? "keyDown" : "keyUp",
    key: keys[code] ?? code,
    code,
    windowsVirtualKeyCode: keyCodes[code] ?? 0,
    nativeVirtualKeyCode: keyCodes[code] ?? 0,
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
await call("Page.navigate", { url: `${baseUrl}?capture=simply-terrell-cdp&character=simplyTerrell` });
await waitFor(
  "Boolean(globalThis.kakiSurf && document.readyState === 'complete')",
  "game load",
);

const menuContract = await evaluate(`(() => {
  const game = globalThis.kakiSurf;
  document.querySelector('button[data-character="simplyTerrell"]')?.click();
  const cards = [...document.querySelectorAll("button[data-character]")];
  const selected = document.querySelector('button[data-character="simplyTerrell"]');
  const grid = document.querySelector(".character-grid").getBoundingClientRect();
  return {
    cardCount: cards.length,
    selected: selected?.classList.contains("is-selected"),
    ariaPressed: selected?.getAttribute("aria-pressed"),
    selectedName: document.querySelector("[data-stat=character]")?.textContent,
    gridFitsViewport: grid.left >= 0 && grid.right <= innerWidth,
    atlasLoaded: performance.getEntriesByType("resource")
      .some((entry) => entry.name.endsWith("/assets/generated/simply-terrell-atlas.png")),
  };
})()`);
if (
  menuContract.cardCount !== 3
  || !menuContract.selected
  || menuContract.ariaPressed !== "true"
  || menuContract.selectedName !== "SIMPLYTERRELL"
  || !menuContract.gridFitsViewport
  || !menuContract.atlasLoaded
) {
  throw new Error(`SimplyTerrell menu contract failed: ${JSON.stringify(menuContract)}`);
}
await sleep(150);
await capture("00-menu-selected");

await evaluate(`Boolean(globalThis.kakiSurf.start({
  immediate: true,
  character: "simplyTerrell",
  board: "foamPuff",
  condition: "twilightGlass",
  mode: "endless",
}))`);
await waitFor(
  `(() => {
    const snapshot = globalThis.kakiSurf.getSnapshot();
    return snapshot.lifecycle === "running"
      && snapshot.state === "riding"
      && snapshot.character === "simplyTerrell"
      && document.querySelector("#kaki-surf-root").dataset.characterAsset === "atlas";
  })()`,
  "SimplyTerrell riding with production atlas",
);
await capture("01-riding");

await key("ShiftLeft", true);
await waitFor(
  `(() => {
    const snapshot = globalThis.kakiSurf.getSnapshot();
    return snapshot.state === "riding"
      && snapshot.turboActive
      && snapshot.character === "simplyTerrell";
  })()`,
  "SimplyTerrell Turbo contact",
);
await sleep(350);
await capture("01b-turbo");
const turboReport = await evaluate(`(() => {
  const snapshot = globalThis.kakiSurf.getSnapshot();
  return {
    character: snapshot.character,
    state: snapshot.state,
    turboActive: snapshot.turboActive,
    turboTier: snapshot.turboTier,
  };
})()`);
await key("ShiftLeft", false);
await sleep(120);

await key("ArrowUp", true);
await waitFor(
  `(() => {
    const snapshot = globalThis.kakiSurf.getSnapshot();
    return snapshot.state === "airborne" && snapshot.character === "simplyTerrell";
  })()`,
  "real-keyboard SimplyTerrell jump",
);
await key("ArrowUp", false);
await capture("02-airborne");

const report = await evaluate(`(() => {
  const snapshot = globalThis.kakiSurf.getSnapshot();
  return {
    character: snapshot.character,
    state: snapshot.state,
    characterAsset: document.querySelector("#kaki-surf-root").dataset.characterAsset,
    hostCharacter: document.querySelector("#kaki-surf-root").dataset.character,
  };
})()`);

await call("Emulation.setDeviceMetricsOverride", {
  width: 844,
  height: 390,
  screenWidth: 844,
  screenHeight: 390,
  deviceScaleFactor: 1,
  mobile: true,
});
await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
await call("Page.navigate", {
  url: `${baseUrl}?capture=simply-terrell-mobile&character=simplyTerrell`,
});
await waitFor(
  "Boolean(globalThis.kakiSurf && document.readyState === 'complete')",
  "mobile game load",
);
const mobileMenuContract = await evaluate(`(() => {
  const selected = document.querySelector('button[data-character="simplyTerrell"]');
  const grid = document.querySelector(".character-grid").getBoundingClientRect();
  return {
    viewport: [innerWidth, innerHeight],
    selected: selected?.classList.contains("is-selected"),
    selectedName: document.querySelector("[data-stat=character]")?.textContent,
    gridFitsViewport: grid.left >= 0 && grid.right <= innerWidth,
  };
})()`);
if (
  mobileMenuContract.viewport[0] !== 844
  || mobileMenuContract.viewport[1] !== 390
  || !mobileMenuContract.selected
  || mobileMenuContract.selectedName !== "SIMPLYTERRELL"
  || !mobileMenuContract.gridFitsViewport
) {
  throw new Error(`SimplyTerrell mobile menu contract failed: ${JSON.stringify(mobileMenuContract)}`);
}
await sleep(150);
await capture("03-mobile-menu-selected");
await evaluate(`Boolean(globalThis.kakiSurf.start({
  immediate: true,
  character: "simplyTerrell",
  board: "foamPuff",
  condition: "twilightGlass",
  mode: "endless",
}))`);
await waitFor(
  `(() => {
    const snapshot = globalThis.kakiSurf.getSnapshot();
    return snapshot.lifecycle === "running"
      && snapshot.state === "riding"
      && snapshot.character === "simplyTerrell"
      && snapshot.quality.resolved === "mobile"
      && document.querySelector("#kaki-surf-root").dataset.characterAsset === "atlas";
  })()`,
  "mobile SimplyTerrell riding with shared physics and production atlas",
);
await capture("04-mobile-riding");
const mobileReport = await evaluate(`(() => {
  const snapshot = globalThis.kakiSurf.getSnapshot();
  return {
    character: snapshot.character,
    state: snapshot.state,
    resolvedQuality: snapshot.quality.resolved,
    characterAsset: document.querySelector("#kaki-surf-root").dataset.characterAsset,
  };
})()`);
await writeFile(
  path.join(outputDir, "report.json"),
  `${JSON.stringify({ menuContract, turboReport, report, mobileMenuContract, mobileReport }, null, 2)}\n`,
);

socket.close();
if (failures.length) {
  throw new Error(`Browser QA reported ${failures.length} error(s):\n${failures.join("\n")}`);
}
console.log(`SimplyTerrell browser QA passed: ${JSON.stringify({
  menuContract,
  turboReport,
  report,
  mobileMenuContract,
  mobileReport,
})}`);
