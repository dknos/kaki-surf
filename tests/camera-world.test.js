import test from "node:test";
import assert from "node:assert/strict";
import { BOARDS, FIXED_STEP, LOGICAL_HEIGHT, LOGICAL_WIDTH } from "../js/config.js";
import { SurfSimulation } from "../js/simulation.js";
import {
  cameraLayerOffset,
  createCameraState,
  fixedStageOffset,
  updateCamera,
} from "../js/camera.js";
import {
  backgroundPanoramaCropY,
  KakiRenderer,
  riderScreenProjection,
} from "../js/renderer.js";
import { PALETTES } from "../js/config.js";

const RIGHT = { x: 1, y: 0, turbo: false };

function riding(seed = 41, cameraSettings = {}, controlMode = "simple") {
  const simulation = new SurfSimulation({ seed, cameraSettings, controlMode });
  simulation.reset({ controlMode, worldQa: { quiet: true } });
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
  const initialPlayerX = simulation.player.worldX;
  const initialGap = simulation.player.worldX - simulation.wave.curlWorldX;
  for (let frame = 0; frame < 900; frame += 1) simulation.update(FIXED_STEP, { ...RIGHT, turbo: true });
  assert.ok(simulation.wave.curlWorldX - simulation.camera.worldX < 0);
  assert.ok(simulation.player.worldX - initialPlayerX > LOGICAL_WIDTH);
  assert.ok(simulation.player.worldX - simulation.wave.curlWorldX > initialGap + 180);
});

test("the protected opening still shows the barrel advancing through world space", () => {
  const simulation = new SurfSimulation({ seed: 41, controlMode: "advanced" });
  simulation.begin();
  simulation.player.state = "riding";
  const initialCurl = simulation.wave.curlWorldX;
  for (let frame = 0; frame < 600; frame += 1) simulation.update(FIXED_STEP, RIGHT);
  assert.ok(simulation.wave.curlWorldX > initialCurl + 150,
    `barrel only advanced ${simulation.wave.curlWorldX - initialCurl}`);
  assert.ok(simulation.player.worldX > simulation.wave.contactX(), "opening pursuit must not silently overtake Kaki");
});

test("vertical camera target is continuous through the apex and covers the viewport", () => {
  const before = createCameraState();
  const after = createCameraState();
  before.worldY = after.worldY = -80;
  before.verticalTracking = after.verticalTracking = true;
  updateCamera(before, { state: "airborne", airY: -120, airVY: -1e-9 }, FIXED_STEP);
  updateCamera(after, { state: "airborne", airY: -120, airVY: 1e-9 }, FIXED_STEP);
  assert.ok(Math.abs(before.worldY - after.worldY) < 0.5);
  assert.ok(Math.abs(before.velocityY - after.velocityY) < 48);
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

test("vertical camera state moves the complete stage while rider geometry stays world-local", () => {
  const camera = createCameraState();
  const player = {
    state: "airborne",
    previousAirY: 36,
    airY: 36,
    maxAirHeight: 2,
    aerialExpectedHeight: 174,
    aerialAltitudeCeiling: 1,
    previousWorldX: 192,
    worldX: 192,
  };
  updateCamera(camera, player, FIXED_STEP);
  assert.ok(camera.velocityY < 0, "qualified air starts a real upward camera pan");
  assert.equal(riderScreenProjection({ camera, player }, 1).frameOffsetY, 0);
  player.previousAirY = player.airY = -80;
  const expected = riderScreenProjection({ camera: { worldY: 0 }, player }, 1).finalY;
  for (const worldY of [0, -42, -96, -132]) {
    const projection = riderScreenProjection({ camera: { worldY }, player }, 1);
    assert.equal(projection.finalY, expected);
    assert.equal(projection.finalY + cameraLayerOffset("stage", { worldY }).y, expected - worldY);
  }
  assert.equal(cameraLayerOffset("stage", camera).y, -camera.worldY);
});

test("stage and panorama use exact inverse sides of one vertical camera", () => {
  for (const worldY of [0, -42, -96, -132]) {
    const camera = { worldY };
    assert.deepEqual(cameraLayerOffset("sky", camera, 7, -4), { x: 0, y: 0 });
    assert.deepEqual(cameraLayerOffset("hud", camera, 7, -4), { x: 0, y: 0 });
    assert.deepEqual(cameraLayerOffset("world", camera, 7, -4), { x: 7, y: -worldY - 4 });
    assert.equal(cameraLayerOffset("stage", camera, 0, 0).x, 0);
    assert.equal(cameraLayerOffset("stage", camera, 0, 0).y, -worldY || 0);
    assert.equal(backgroundPanoramaCropY({ camera }) + cameraLayerOffset("stage", camera).y, 424,
      "embedded coast and surf stage retain one ocean anchor");
  }
  assert.deepEqual(cameraLayerOffset("world", { worldY: -96 }, 7, -4), { x: 7, y: 92 });
  assert.deepEqual(cameraLayerOffset("world", { worldY: -96 }, 7, -4, true), { x: 0, y: 96 });
  assert.deepEqual(fixedStageOffset(3, 1, false), { x: 3, y: 1 });
});

test("a real simulated maximum jump pans and returns one continuous vertical camera", () => {
  const simulation = new SurfSimulation({ seed: 0xa3117, controlMode: "simple" });
  simulation.reset({
    board: BOARDS.moonLog,
    controlMode: "simple",
    assists: { landing: true },
    worldQa: { quiet: true },
  });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "lip",
    face: 0.01,
    faceVelocity: -0.84,
    slopeDrive: -0.84,
    speed: 154,
    charge: 0.94,
    turboActive: true,
    turboOverdrive: 1,
  });
  Object.assign(simulation.player.speedPotential, { pocket: 0.8, seamDrive: 0.9 });
  simulation.wave.curlX = -520;
  simulation.launch({ x: 1 });

  const frames = [];
  while (simulation.player.state === "airborne" && frames.length < 480) {
    simulation.update(FIXED_STEP, {});
    if (simulation.player.state !== "airborne") break;
    const projection = riderScreenProjection(simulation, 1);
    const stageY = cameraLayerOffset("stage", simulation.camera).y;
    frames.push({
      naturalY: projection.naturalY,
      finalY: projection.finalY + stageY,
      cameraY: simulation.camera.worldY,
      stageY,
      backdropY: backgroundPanoramaCropY(simulation),
      airVY: simulation.player.airVY,
      state: simulation.player.state,
      rotation: simulation.player.rotationAccum,
      activeTime: simulation.activeTime,
    });
    simulation.consumeEvents(() => {});
  }

  assert.ok(frames.length > 120 && frames.length < 480, "flight completes in the expected duration");
  assert.ok(frames.at(-1).activeTime > frames[0].activeTime);
  assert.ok(Math.abs(frames.at(-1).rotation - frames[0].rotation) > 0.5, "rotation advances during flight");
  for (let index = 1; index < frames.length; index += 1) {
    assert.ok(frames[index].activeTime > frames[index - 1].activeTime, "active simulation time advances every frame");
    assert.ok(Math.abs(frames[index].stageY - frames[index - 1].stageY)
      <= simulation.camera.settings.maxVelocityY * FIXED_STEP + 0.01,
    "camera pan is velocity-bounded");
    assert.ok(Math.abs((frames[index].backdropY + frames[index].stageY) - 424) < 1e-6,
      "panorama and stage cannot separate during the pan");
  }
  assert.ok(Math.min(...frames.map((frame) => frame.cameraY)) < -80, "maximum air must visibly pan upward");
  assert.ok(Math.max(...frames.map((frame) => frame.finalY)) < LOGICAL_HEIGHT - 24,
    "camera keeps the rider readable during re-entry");

  for (let frame = 0; frame < 360; frame += 1) {
    simulation.update(FIXED_STEP, {});
  }
  assert.ok(["riding", "landing"].includes(simulation.player.state), "the jump returns to playable surf state");
  assert.ok(Math.abs(simulation.camera.worldY) < 0.01, "camera returns to the coast without a landing snap");
});

test("stable fallback backdrop covers every logical canvas row", () => {
  const fills = [];
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    fillRect(x, y, width, height) { fills.push({ x, y, width, height, alpha: this.globalAlpha }); },
  };
  const renderer = Object.create(KakiRenderer.prototype);
  Object.assign(renderer, {
    ctx,
    palette: PALETTES.standard,
    conditionId: "goldenCoast",
    aerialBackdrop: { altitude: 1 },
  });
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
