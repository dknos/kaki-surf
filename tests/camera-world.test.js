import test from "node:test";
import assert from "node:assert/strict";
import { FIXED_STEP, LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../js/config.js";
import { SurfSimulation } from "../js/simulation.js";
import { cameraLayerOffset, createCameraState, updateCamera } from "../js/camera.js";
import { KakiRenderer } from "../js/renderer.js";
import { PALETTES } from "../js/config.js";

const RIGHT = { x: 1, y: 0, turbo: false };

function riding(seed = 41, cameraSettings = {}, controlMode = "simple") {
  const simulation = new SurfSimulation({ seed, cameraSettings, controlMode });
  simulation.begin();
  simulation.player.state = "riding";
  simulation.wave.curlWorldX = -1000;
  return simulation;
}

test("camera settings cannot change canonical gameplay state", () => {
  const a = riding(81, { horizontalFrequency: 2, left: 20, right: 360 });
  const b = riding(81, { horizontalFrequency: 20, left: 140, right: 220 });
  for (let frame = 0; frame < 1200; frame += 1) {
    const input = frame < 760 ? RIGHT : { ...RIGHT, x: -1, turbo: frame > 240 && frame < 620 };
    a.update(FIXED_STEP, input);
    b.update(FIXED_STEP, input);
  }
  assert.equal(a.player.worldX, b.player.worldX);
  assert.equal(a.wave.curlWorldX, b.wave.curlWorldX);
  assert.equal(a.score.total, b.score.total);
  assert.equal(a.player.state, b.player.state);
  assert.equal(a.wave.pressure, b.wave.pressure);
});

test("right travel exceeds 1000 world pixels without clamping", () => {
  const simulation = riding(41, {}, "advanced");
  for (let frame = 0; frame < 3600; frame += 1) simulation.update(FIXED_STEP, RIGHT);
  assert.ok(simulation.player.worldX > 1212, `worldX=${simulation.player.worldX}`);
  assert.ok(simulation.camera.worldX > 800, `camera=${simulation.camera.worldX}`);
  assert.ok(simulation.player.worldX - simulation.camera.worldX >= 88);
});

test("left reversal moves a viewport and reverses camera smoothly", () => {
  const simulation = riding();
  for (let frame = 0; frame < 2200; frame += 1) simulation.update(FIXED_STEP, RIGHT);
  const rightEdge = simulation.player.worldX;
  const cameraPeak = simulation.camera.worldX;
  let previous = cameraPeak;
  let largestStep = 0;
  for (let frame = 0; frame < 2400; frame += 1) {
    simulation.update(FIXED_STEP, { ...RIGHT, x: -1 });
    largestStep = Math.max(largestStep, Math.abs(simulation.camera.worldX - previous));
    previous = simulation.camera.worldX;
  }
  assert.ok(rightEdge - simulation.player.worldX > LOGICAL_WIDTH);
  assert.ok(simulation.camera.worldX < cameraPeak - 100);
  assert.ok(largestStep <= 1.51, `camera jumped ${largestStep}`);
});

test("Turbo creates world-space separation after the barrel is offscreen", () => {
  const simulation = riding(41, {}, "advanced");
  const initialGap = simulation.player.worldX - simulation.wave.curlWorldX;
  for (let frame = 0; frame < 900; frame += 1) simulation.update(FIXED_STEP, { ...RIGHT, turbo: true });
  assert.ok(simulation.wave.curlWorldX - simulation.camera.worldX < 0);
  assert.ok(simulation.player.worldX - simulation.wave.curlWorldX > initialGap + LOGICAL_WIDTH);
});

test("vertical camera target is continuous through the apex and covers the viewport", () => {
  const before = createCameraState();
  const after = createCameraState();
  before.worldY = after.worldY = -80;
  before.verticalTracking = after.verticalTracking = true;
  updateCamera(before, { state: "airborne", airY: -120, airVY: -1e-9 }, FIXED_STEP);
  updateCamera(after, { state: "airborne", airY: -120, airVY: 1e-9 }, FIXED_STEP);
  assert.equal(before.worldY, after.worldY);
  assert.equal(before.velocityY, after.velocityY);
  assert.equal(LOGICAL_HEIGHT, 216);
});

test("ordinary hops leave the horizon fixed until physical air clears the upper dead zone", () => {
  const camera = createCameraState();
  for (let frame = 0; frame < 180; frame += 1) {
    updateCamera(camera, { state: "airborne", airY: 44, maxAirHeight: 33 }, FIXED_STEP);
  }
  assert.equal(camera.worldY, 0);
  updateCamera(camera, { state: "airborne", airY: 38, maxAirHeight: 40 }, FIXED_STEP);
  assert.ok(camera.velocityY < 0);
});

test("launch and landing shake is isolated from sky and HUD", () => {
  const camera = { worldY: -96 };
  assert.deepEqual(cameraLayerOffset("sky", camera, 7, -4), { x: 0, y: 0 });
  assert.deepEqual(cameraLayerOffset("hud", camera, 7, -4), { x: 0, y: 0 });
  assert.deepEqual(cameraLayerOffset("world", camera, 7, -4), { x: 7, y: 92 });
  assert.deepEqual(cameraLayerOffset("world", camera, 7, -4, true), { x: 0, y: 96 });
});

test("maximum supported air keeps every sky pixel covered by authored atmosphere", () => {
  const fills = [];
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    fillRect(x, y, width, height) { fills.push({ x, y, width, height, alpha: this.globalAlpha }); },
  };
  const renderer = Object.create(KakiRenderer.prototype);
  Object.assign(renderer, { ctx, palette: PALETTES.standard, conditionId: "goldenCoast" });
  renderer.drawAerialFallback({ camera: { worldY: -500 } });
  for (let y = 0; y < LOGICAL_HEIGHT; y += 1) {
    assert.ok(fills.some((fill) => fill.alpha > 0 && fill.x <= 0 && fill.x + fill.width >= LOGICAL_WIDTH
      && fill.y <= y && fill.y + fill.height > y), `uncovered sky row ${y}`);
  }
});

test("wake reversal remains continuous in world coordinates", () => {
  const simulation = riding();
  for (let frame = 0; frame < 480; frame += 1) simulation.update(FIXED_STEP, RIGHT);
  for (let frame = 0; frame < 100; frame += 1) simulation.update(FIXED_STEP, { ...RIGHT, x: -1 });
  const samples = simulation.player.wakeSamples.filter((sample) => sample.active).sort((a, b) => a.age - b.age);
  assert.ok(samples.length > 10);
  for (let index = 1; index < samples.length; index += 1) {
    assert.ok(Math.abs(samples[index].worldX - samples[index - 1].worldX) < 42);
  }
  assert.ok(samples.some((sample, index) => index && sample.worldX > samples[index - 1].worldX));
  assert.ok(samples.some((sample, index) => index && sample.worldX < samples[index - 1].worldX));
});
