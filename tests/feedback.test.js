import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BOARDS, FIXED_STEP } from "../js/config.js";
import {
  AIR_PROJECTION,
  projectAirY,
} from "../js/aerial.js";
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

test("air projection is continuous, stateless, and never forms a fixed-Y clamp", () => {
  const threshold = AIR_PROJECTION.compressionStartY;
  const epsilon = 1e-6;
  assert.equal(projectAirY(140), 140, "ordinary air is rendered at its natural Y");
  assert.equal(projectAirY(60), 60, "medium air below the top threshold is unmodified");
  assert.ok(Math.abs(projectAirY(threshold - epsilon) - projectAirY(threshold + epsilon)) < epsilon * 3,
    "projection is continuous through compression entry");
  assert.equal(projectAirY(-20), projectAirY(-20), "ascent and descent use the same stateless mapping");

  const natural = [140, 110, 80, 60, 20, -20, -80];
  const final = natural.map((y) => projectAirY(y));
  for (let index = 1; index < final.length; index += 1) {
    assert.ok(final[index] < final[index - 1], "every meaningful physical rise remains a visible screen rise");
  }
  assert.ok(final.at(-1) > AIR_PROJECTION.minimumY);
  assert.ok(73 - projectAirY(-122) >= 40, "maximum supported air preserves forty logical pixels of travel");
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
  assert.equal(projection.finalY, projectAirY(-80));
  assert.equal(projection.finalY - projection.naturalY, projection.frameOffsetY);

  for (const worldY of [0, -42, -96, -132]) {
    const samePhysicalPose = riderScreenProjection({
      camera: { worldX: 40, worldY },
      player: { ...simulation.player },
    }, 0.5);
    assert.equal(samePhysicalPose.finalY, projection.finalY, "camera state cannot change rider projection");
  }

  const renderer = Object.create(KakiRenderer.prototype);
  Object.assign(renderer, { particles: [{ life: 1, maxLife: 1, foreground: true, kind: "star", size: 1, x: 224, y: -80, color: "#fff", space: "rider" }], renderCameraWorldX: 40, renderRiderOffsetY: projection.frameOffsetY });
  assert.ok(Math.abs(renderer.particles[0].y + renderer.renderRiderOffsetY - projection.finalY) < 1e-9);
  const surferSource = KakiRenderer.prototype.drawSurfer.toString();
  assert.match(surferSource, /y = projection\.finalY/);
  assert.match(surferSource, /drawBoardSprite\(this\.ctx, x, y \+ 1/);
  assert.match(surferSource, /drawKittySprite\(this\.ctx, x, y -/);
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

test("aerial panorama remains on the stable condition shelf for every jump height", () => {
  const coast = backgroundPanoramaCropY({
    player: { aerialAltitude: 0 },
    camera: { worldY: 0 },
  });
  const high = backgroundPanoramaCropY({
    player: { aerialAltitude: 0.38 },
    camera: { worldY: -24 },
  });
  const descending = backgroundPanoramaCropY({
    player: { aerialAltitude: 0.68 },
    camera: { worldY: -80 },
  });
  const extreme = backgroundPanoramaCropY({
    player: { aerialAltitude: 0.94 },
    camera: { worldY: -132 },
  });

  assert.equal(coast, 424);
  assert.deepEqual([high, descending, extreme], [coast, coast, coast]);
  assert.equal(backgroundPanoramaCropY({ conditionId: "twilightGlass", player: { aerialAltitude: 1 } }), coast);
  assert.equal(backgroundPanoramaCropY({ conditionId: "stormbreak", camera: { worldY: -500 } }), coast);
});

test("the full panorama is drawn once and covers both bottom corners and the final row", () => {
  const image = { complete: true, naturalWidth: 1536, naturalHeight: 640 };
  const calls = [];
  const ctx = {
    globalAlpha: 1,
    save() {},
    restore() {},
    drawImage(...args) { calls.push(args); },
  };
  const renderer = Object.create(KakiRenderer.prototype);
  Object.assign(renderer, {
    ctx,
    settings: { highContrast: false, reducedMotion: false },
    conditionId: "goldenCoast",
    visualAssets: { backgrounds: { goldenCoast: image } },
  });
  assert.equal(renderer.drawBackgroundAsset({ camera: { worldX: 0 } }), true);
  assert.equal(calls.length, 1, "no mask or passed-wave path may repaint the background");
  assert.deepEqual(calls[0].slice(1), [0, 424, 384, 216, 0, 0, 384, 216]);
  const [, , , sourceWidth, sourceHeight, destinationX, destinationY, width, height] = calls[0];
  assert.equal(sourceWidth, 384);
  assert.equal(sourceHeight, 216);
  assert.ok(destinationX <= 0 && destinationX + width >= 384, "bottom-right column is covered");
  assert.ok(destinationY <= 0 && destinationY + height >= 216, "last canvas row and both bottom corners are covered");
});

test("physics, scoring, spawning, and collision never read presentation-only framing", () => {
  for (const file of ["simulation.js", "world.js", "wave.js", "tricks.js"]) {
    const source = readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /riderFrameOffset|renderRiderOffset|aerialBackdrop/i, `${file} stays presentation-agnostic`);
  }
  assert.doesNotMatch(riderScreenProjection.toString(), /worldY|riderFrameSignal|cameraOffset|allowance/i,
    "rider projection cannot regain delayed camera state");
  assert.doesNotMatch(backgroundPanoramaCropY.toString(), /aerialAltitude|worldY|camera\?\./,
    "backdrop selection cannot regain an aerial or camera input");
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

test("passed-wave openings cannot repaint panorama fragments", () => {
  const rendererSource = readFileSync(new URL("../js/renderer.js", import.meta.url), "utf8");
  const waveSource = readFileSync(new URL("../js/wave-visuals.js", import.meta.url), "utf8");
  const heroSource = readFileSync(new URL("../js/hero-wave-visuals.js", import.meta.url), "utf8");
  assert.doesNotMatch(rendererSource, /drawPassedSkyBackdrop|drawMaskedPanoramaCrop/);
  assert.doesNotMatch(waveSource, /repaintTrailingSky|drawPassedSkyWindow/);
  assert.doesNotMatch(heroSource, /repaintTrailingSky|drawPassedSky\(/);
});
