import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { BOARDS, FIXED_STEP } from "../js/config.js";
import { KakiRenderer } from "../js/renderer.js";
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

test("gameplay callouts queue one at a time and remain readable", () => {
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
  assert.deepEqual(renderer.calloutQueue.map((callout) => callout.text), ["SECOND", "THIRD"]);

  renderer.activeCallout.life = 0;
  renderer.activateNextCallout();
  assert.equal(renderer.activeCallout.text, "SECOND");
  assert.deepEqual(renderer.calloutQueue.map((callout) => callout.text), ["THIRD"]);
});
