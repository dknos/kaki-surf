import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BOARDS, FIXED_STEP } from "../js/config.js";
import {
  aerialRiderFrameOffset,
  createAerialBackdropState,
  updateAerialBackdropState,
} from "../js/aerial.js";
import { riderFrameCameraTarget } from "../js/camera.js";
import {
  backgroundPanoramaCropY,
  backgroundPanoramaTravel,
  backgroundParallaxPhase,
  KakiRenderer,
  riderScreenProjection,
} from "../js/renderer.js";
import { SurfSimulation } from "../js/simulation.js";
import { resolveKakiPose } from "../js/sprites.js";

function ridingSimulation() {
  const simulation = new SurfSimulation({ seed: 0xfeedbac });
  simulation.tutorialEnabled = false;
  simulation.reset({ board: BOARDS.mangoFish, controlMode: "advanced" });
  simulation.begin();
  simulation.player.state = "riding";
  simulation.player.stateTime = 1;
  simulation.player.x = 260;
  simulation.player.face = 0.48;
  simulation.player.faceVelocity = 0;
  simulation.wave.curlX = 40;
  drain(simulation);
  return simulation;
}

function drain(simulation) {
  const events = [];
  simulation.consumeEvents((event) => events.push(event));
  return events;
}

test("pump charge and combo-growth cues are thresholded instead of emitted every step", () => {
  const simulation = ridingSimulation();
  const pumpCues = [];
  for (let step = 0; step < 100; step += 1) {
    simulation.update(FIXED_STEP, { edge: true, edgePressed: step === 0 });
    pumpCues.push(...drain(simulation).filter((event) => event.type === "pumpCharge"));
  }
  assert.deepEqual(pumpCues.map((event) => event.payload.tier), [1, 2, 3, 4]);

  for (let step = 0; step < 60; step += 1) {
    simulation.update(FIXED_STEP, { edge: true });
    pumpCues.push(...drain(simulation).filter((event) => event.type === "pumpCharge"));
  }
  assert.equal(pumpCues.length, 4, "a full held charge does not spam audio events");

  simulation.update(FIXED_STEP, { edgeReleased: true });
  drain(simulation);
  for (let step = 0; step < 24; step += 1) {
    simulation.update(FIXED_STEP, { edge: true, edgePressed: step === 0 });
    pumpCues.push(...drain(simulation).filter((event) => event.type === "pumpCharge"));
  }
  assert.equal(pumpCues.at(-1).payload.tier, 1, "a new pump can teach the first charge tier again");

  simulation.score.flow = 0.35;
  simulation.score.syncCombo();
  simulation.update(FIXED_STEP, {});
  assert.equal(drain(simulation).filter((event) => event.type === "comboIncrease").length, 1);
  simulation.score.flow = 0.52;
  simulation.score.syncCombo();
  simulation.update(FIXED_STEP, {});
  assert.equal(drain(simulation).filter((event) => event.type === "comboIncrease").length, 1);
  simulation.score.flow = 0.45;
  simulation.score.syncCombo();
  simulation.update(FIXED_STEP, {});
  drain(simulation);
  simulation.score.flow = 0.52;
  simulation.score.syncCombo();
  simulation.update(FIXED_STEP, {});
  assert.equal(drain(simulation).filter((event) => event.type === "comboIncrease").length, 0, "minor decay cannot retrigger the same tier");
  simulation.score.flow = 0;
  simulation.score.syncCombo();
  simulation.update(FIXED_STEP, {});
  drain(simulation);
  simulation.score.flow = 0.2;
  simulation.score.syncCombo();
  simulation.update(FIXED_STEP, {});
  assert.equal(drain(simulation).filter((event) => event.type === "comboIncrease").length, 1, "a fully reset chain can grow again");
});

test("real aerial events use the names consumed by renderer and audio", () => {
  const simulation = ridingSimulation();
  Object.assign(simulation.player, {
    state: "airborne",
    stateTime: 0.2,
    airX: 230,
    previousAirX: 230,
    airY: 30,
    previousAirY: 30,
    airVX: 0,
    airVY: -5,
    launchY: 72,
    maxAirHeight: 42,
    landingFace: 0.2,
    speed: 92,
  });
  simulation.aerialSession = null;

  simulation.update(FIXED_STEP, { trick1: true, trick1Pressed: true });
  const started = drain(simulation).find((event) => event.type === "trickStarted");
  assert.equal(started?.payload.id, "frontRailGrab");
  for (let step = 0; step < 12; step += 1) {
    simulation.update(FIXED_STEP, { trick1: true });
    drain(simulation);
  }
  simulation.update(FIXED_STEP, { trick1Released: true });
  const completed = drain(simulation).find((event) => event.type === "trickCompleted");
  assert.equal(completed?.payload.id, "frontRailGrab");

  const rendererSource = readFileSync(new URL("../js/renderer.js", import.meta.url), "utf8");
  const audioSource = readFileSync(new URL("../js/audio.js", import.meta.url), "utf8");
  for (const name of ["trickStarted", "trickCompleted"]) {
    assert.match(rendererSource, new RegExp(`case \\"${name}\\"`));
    assert.match(audioSource, new RegExp(`case \\"${name}\\"`));
  }
  assert.match(audioSource, /case "trickRejected"/);
});

test("landing and result poses resolve from state the simulation actually publishes", () => {
  assert.equal(resolveKakiPose({
    state: "airborne",
    airVY: 32,
    landingPreview: { error: 0.3, improving: false, bands: { recovery: 0.7 } },
  }), "landingAnticipation");
  assert.equal(resolveKakiPose({
    state: "airborne",
    airVY: 32,
    landingPreview: { error: 1.2, improving: true, bands: { recovery: 0.7 } },
  }), "fall");
  assert.equal(resolveKakiPose({ state: "landing", landingQuality: "perfect" }), "perfectLanding");

  const lowRun = ridingSimulation();
  lowRun.score.total = 0;
  lowRun.finishRun("time");
  assert.equal(lowRun.player.resultWon, false);
  assert.equal(resolveKakiPose(lowRun.player), "disappointed");

  const strongRun = ridingSimulation();
  strongRun.score.total = 7000;
  strongRun.finishRun("time");
  assert.equal(strongRun.player.resultWon, true);
  assert.equal(resolveKakiPose(strongRun.player), "victory");
});

test("rapid retry clears stale particles, callouts, freeze, shake, and wave clocks", () => {
  const renderer = new KakiRenderer({
    getContext: () => ({ imageSmoothingEnabled: false }),
  }, {
    highContrast: false,
    reducedMotion: false,
    reducedFlash: false,
    screenShake: 1,
  });
  renderer.particles[0].life = 4;
  renderer.pushCallout("OLD RUN", "SHOULD CLEAR", "risk");
  renderer.freeze = 1;
  renderer.shake = 3;
  renderer.flash = 1;
  renderer.wavePresentationClocks.surface = 42;

  renderer.resetRunPresentation();

  assert.equal(renderer.particles.some((particle) => particle.life > 0), false);
  assert.equal(renderer.activeCallout.life, 0);
  assert.equal(renderer.calloutQueue.length, 0);
  assert.equal(renderer.freeze, 0);
  assert.equal(renderer.shake, 0);
  assert.equal(renderer.flash, 0);
  assert.notEqual(renderer.wavePresentationClocks.surface, 42);
});

test("gameplay callouts queue one at a time, preserve a readable beat, and prioritize danger", () => {
  const canvas = {
    getContext() {
      return { imageSmoothingEnabled: false };
    },
  };
  const renderer = new KakiRenderer(canvas, {
    highContrast: false,
    reducedMotion: true,
    reducedFlash: true,
    screenShake: 0,
  });
  renderer.pushCallout("FIRST", "ONE", "flow");
  renderer.pushCallout("SECOND", "TWO", "perfect");
  renderer.pushCallout("THIRD", "THREE", "risk");

  assert.equal(renderer.activeCallout.text, "FIRST");
  assert.ok(renderer.activeCallout.duration >= 2, "ordinary messages stay up long enough to read");
  assert.deepEqual(renderer.calloutQueue.map((callout) => callout.text), ["THIRD", "SECOND"]);
  assert.ok(renderer.activeCallout.life >= 1, "risk feedback cannot erase a freshly shown message");

  renderer.activeCallout.life = 0;
  renderer.activateNextCallout();
  assert.equal(renderer.activeCallout.text, "THIRD");
  assert.deepEqual(renderer.calloutQueue.map((callout) => callout.text), ["SECOND"]);
});

test("stale queued hints expire instead of replacing current action feedback late", () => {
  const canvas = {
    getContext() {
      return { imageSmoothingEnabled: false };
    },
  };
  const renderer = new KakiRenderer(canvas, {
    highContrast: false,
    reducedMotion: true,
    reducedFlash: true,
    screenShake: 0,
  });
  renderer.pushCallout("CURRENT", "", "perfect");
  renderer.pushCallout("OLD HINT", "", "hint");
  renderer.time = 1.6;
  renderer.pruneStaleCallouts();
  assert.deepEqual(renderer.calloutQueue, []);
});

test("tube state callouts replace stale states after one readable beat", () => {
  const canvas = {
    getContext() {
      return { imageSmoothingEnabled: false };
    },
  };
  const renderer = new KakiRenderer(canvas, {
    highContrast: false,
    reducedMotion: true,
    reducedFlash: true,
    screenShake: 0,
  });
  renderer.pushCallout("TUBE OPEN", "HOLD T TO TUCK", "hint", { channel: "tube" });
  renderer.time = 0.2;
  renderer.activeCallout.life = renderer.activeCallout.duration - 0.2;
  renderer.pushCallout("TUBE TUCK", "HOLD THE POCKET", "risk", { channel: "tube" });
  renderer.time = 0.55;
  renderer.pushCallout("CLEAN TUBE EXIT", "0.5S  +120", "perfect", { channel: "tube" });

  assert.equal(renderer.activeCallout.text, "TUBE OPEN");
  assert.deepEqual(renderer.calloutQueue.map((callout) => callout.text), ["CLEAN TUBE EXIT"]);
  renderer.activeCallout.life = 0;
  renderer.calloutGap = 0;
  renderer.activateNextCallout();
  assert.equal(renderer.activeCallout.text, "CLEAN TUBE EXIT");
});

test("tube state callouts replace queued predecessors behind unrelated feedback", () => {
  const canvas = {
    getContext() {
      return { imageSmoothingEnabled: false };
    },
  };
  const renderer = new KakiRenderer(canvas, {
    highContrast: false,
    reducedMotion: true,
    reducedFlash: true,
    screenShake: 0,
  });
  renderer.pushCallout("PERFECT LANDING", "", "perfect");
  renderer.pushCallout("TUBE OPEN", "HOLD T TO TUCK", "hint", { channel: "tube" });
  renderer.pushCallout("TUBE TUCK", "HOLD THE POCKET", "risk", { channel: "tube" });
  renderer.pushCallout("CLEAN TUBE EXIT", "0.5S  +120", "perfect", { channel: "tube" });

  assert.equal(renderer.activeCallout.text, "PERFECT LANDING");
  assert.deepEqual(renderer.calloutQueue.map((callout) => callout.text), ["CLEAN TUBE EXIT"]);
});

test("rider-only framing stays dormant until Kaki actually clears the safe top band", () => {
  const highAir = {
    state: "airborne",
    airY: -82,
    maxAirHeight: 94,
    aerialAltitude: 0.7,
  };
  assert.equal(riderFrameCameraTarget(highAir), -150);
  assert.equal(aerialRiderFrameOffset({ state: "riding", airY: -82 }, 130), 0);
  assert.equal(aerialRiderFrameOffset({ state: "airborne", airY: 70 }, 130), 0);
  assert.equal(aerialRiderFrameOffset(highAir, 130), 130);
  assert.equal(aerialRiderFrameOffset(highAir, 200), 134,
    "only the exact amount needed to reach the safe band is applied");
});

test("Kaki, board, and rider effects share one interpolated rider-space offset", () => {
  const simulation = {
    camera: { worldX: 40, worldY: -160 },
    player: {
      state: "airborne",
      previousWorldX: 220,
      worldX: 224,
      previousAirY: -78,
      airY: -82,
      maxAirHeight: 174,
    },
  };
  const projection = riderScreenProjection(simulation, 0.5);
  assert.equal(projection.naturalY, -80);
  assert.equal(projection.frameOffsetY, 148);
  assert.equal(projection.finalY, 68);
  assert.equal(projection.finalY - projection.naturalY, projection.frameOffsetY);

  const latent = riderScreenProjection({
    camera: { worldX: 40, worldY: 0 },
    player: { ...simulation.player },
  }, 0.5);
  assert.equal(latent.finalY, 68, "qualified maximum air remains readable before the smooth signal catches up");

  const renderer = Object.create(KakiRenderer.prototype);
  Object.assign(renderer, { particles: [{ life: 1, maxLife: 1, foreground: true, kind: "star", size: 1, x: 224, y: -80, color: "#fff", space: "rider" }], renderCameraWorldX: 40, renderRiderOffsetY: projection.frameOffsetY });
  assert.equal(renderer.particles[0].y + renderer.renderRiderOffsetY, projection.finalY);
});

test("aerial panorama parallax preserves signed travel and freezes to the center crop", () => {
  const center = backgroundParallaxPhase({ cameraWorldX: 0 });
  const forward = backgroundParallaxPhase({ cameraWorldX: 420 });
  const reverse = backgroundParallaxPhase({ cameraWorldX: -180 });

  assert.ok(forward > center);
  assert.ok(reverse < center);
  assert.equal(backgroundParallaxPhase({ cameraWorldX: 900 }, true), center);
  assert.equal(backgroundPanoramaTravel({ camera: { worldX: 420 } }), 33.6);
  assert.equal(backgroundPanoramaTravel({ camera: { worldX: -180 } }), -14.4);
  assert.equal(backgroundPanoramaTravel({ camera: { worldX: 900 } }, true), 0);
});

test("aerial panorama uses stable authored shelves and never camera.worldY", () => {
  const coast = backgroundPanoramaCropY({
    player: { aerialAltitude: 0 },
    camera: { worldY: 0 },
  });
  const cloud = backgroundPanoramaCropY({
    player: { aerialAltitude: 0.38 },
    camera: { worldY: -24 },
  });
  const upper = backgroundPanoramaCropY({
    player: { aerialAltitude: 0.68 },
    camera: { worldY: -80 },
  });
  const space = backgroundPanoramaCropY({
    player: { aerialAltitude: 0.94 },
    camera: { worldY: -132 },
  });

  assert.equal(coast, 424);
  assert.ok(coast > cloud && cloud > upper && upper > space);
  assert.equal(space, 0);
  assert.equal(backgroundPanoramaCropY({ player: { aerialAltitude: 0.1 }, camera: { worldY: -132 } }), coast,
    "routine air stays on the coastal crop regardless of camera framing");
  assert.equal(backgroundPanoramaCropY({ player: { aerialAltitude: 0.39 }, camera: { worldY: 0 } }), cloud);
  assert.equal(backgroundPanoramaCropY({ player: { aerialAltitude: 0.39 }, camera: { worldY: -132 } }), cloud);
});

test("atmospheric progression is hysteretic, monotonic, rate-limited, and returns without snapping", () => {
  const state = createAerialBackdropState();
  const rise = [];
  for (let frame = 0; frame < 240; frame += 1) {
    updateAerialBackdropState(state, { state: "airborne", aerialAltitude: 0.94 }, FIXED_STEP);
    rise.push(state.altitude);
    assert.ok(state.frameDelta <= 0.52 * FIXED_STEP + 1e-12);
  }
  for (let index = 1; index < rise.length; index += 1) assert.ok(rise[index] >= rise[index - 1]);
  const apex = state.altitude;
  assert.ok(apex > 0.9);

  const descent = [];
  for (let frame = 0; frame < 180; frame += 1) {
    updateAerialBackdropState(state, { state: "airborne", aerialAltitude: 0.08 }, FIXED_STEP);
    descent.push(state.altitude);
    assert.ok(state.frameDelta <= 1.05 * FIXED_STEP + 1e-12);
  }
  for (let index = 1; index < descent.length; index += 1) assert.ok(descent[index] <= descent[index - 1]);
  assert.ok(descent[0] < apex && descent[0] > 0, "re-entry starts easing instead of snapping to coast");

  const routine = createAerialBackdropState();
  for (let frame = 0; frame < 300; frame += 1) {
    updateAerialBackdropState(routine, { state: "airborne", aerialAltitude: 0.18 }, FIXED_STEP);
  }
  assert.equal(routine.altitude, 0, "normal aerial never leaves the coastal dead zone");

  const hitch = createAerialBackdropState();
  updateAerialBackdropState(hitch, { state: "airborne", aerialAltitude: 1 }, 0.5);
  assert.ok(hitch.frameDelta <= 0.52 / 60 + 1e-12,
    "a stalled render frame slows the mask instead of jumping it");
});

test("physics, scoring, spawning, and collision never read presentation-only framing", () => {
  for (const file of ["simulation.js", "world.js", "wave.js", "tricks.js"]) {
    const source = readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /riderFrameOffset|renderRiderOffset|aerialBackdrop/i, `${file} stays presentation-agnostic`);
  }
  assert.doesNotMatch(backgroundPanoramaCropY.toString(), /worldY|camera\?\./,
    "backdrop selection cannot regain a physical-camera fallback");
});

test("asset-backed coastline is never redrawn in the world camera", () => {
  const drawCalls = [];
  const renderer = Object.create(KakiRenderer.prototype);
  Object.assign(renderer, {
    ctx: {
      save() {},
      restore() {},
      drawImage(...args) { drawCalls.push(args); },
    },
    settings: { highContrast: false },
    conditionId: "goldenCoast",
    visualAssets: {
      backgrounds: {
        goldenCoast: { complete: true, naturalWidth: 1536, naturalHeight: 640 },
      },
    },
  });

  renderer.drawCoastline({ camera: { worldX: 0, worldY: -80 } });
  assert.equal(drawCalls.length, 0);
});

test("passed-break cutouts restore the continuous screen panorama", () => {
  const calls = [];
  const transforms = ["world"];
  const ctx = {
    save() {
      transforms.push(transforms.at(-1));
    },
    restore() {
      transforms.pop();
    },
    setTransform() {
      transforms[transforms.length - 1] = "screen";
    },
  };
  const renderer = {
    ctx,
    drawSky() {
      calls.push(["sky", transforms.at(-1)]);
    },
    drawCoastline() {
      calls.push(["coastline", transforms.at(-1)]);
    },
  };

  KakiRenderer.prototype.drawPassedSkyBackdrop.call(renderer, {
    camera: { worldY: -118 },
  }, { bottom: 80 });

  assert.deepEqual(calls, [
    ["sky", "screen"],
    ["coastline", "world"],
  ]);
});
