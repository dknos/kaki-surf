import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, FIXED_STEP } from "../js/config.js";
import { SurfSimulation } from "../js/simulation.js";

function createSimulation({ tutorialEnabled = true } = {}) {
  const simulation = new SurfSimulation({
    seed: 0x5c4001,
    controlMode: "advanced",
    tutorialEnabled,
  });
  simulation.reset({
    board: BOARDS.mangoFish,
    controlMode: "advanced",
    tutorialEnabled,
  });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "riding",
    stateTime: 1,
    x: 260,
    face: 0.4,
  });
  simulation.elapsed = 0.8;
  simulation.wave.curlX = -1_000;
  drain(simulation);
  return simulation;
}

function drain(simulation) {
  const events = [];
  simulation.consumeEvents((event) => events.push(event));
  return events;
}

function update(simulation, input = {}, sink = []) {
  simulation.update(FIXED_STEP, input);
  sink.push(...drain(simulation));
  return sink;
}

function advancePhysicalBasics(simulation, events = []) {
  update(simulation, {}, events);
  assert.equal(simulation.tutorial.snapshot().id, "drop");

  for (let step = 0; step < 120 && simulation.tutorial.snapshot().id === "drop"; step += 1) {
    update(simulation, { y: 1 }, events);
  }
  assert.equal(simulation.tutorial.snapshot().id, "carve");

  for (let step = 0; step < 180 && simulation.tutorial.snapshot().id === "carve"; step += 1) {
    update(simulation, { y: -1 }, events);
  }
  assert.equal(simulation.tutorial.snapshot().id, "launch");
  return events;
}

test("simulation reset option and legacy tutorialEnabled assignment both control Surf School", () => {
  const defaultSimulation = createSimulation({ tutorialEnabled: false });
  const quietEvents = [];
  for (let step = 0; step < 120; step += 1) update(defaultSimulation, { y: 1 }, quietEvents);
  assert.equal(defaultSimulation.tutorialEnabled, false);
  assert.equal(defaultSimulation.tutorial.snapshot().enabled, false);
  assert.equal(
    quietEvents.some((event) => event.type.startsWith("tutorial")),
    false,
  );

  defaultSimulation.reset({ tutorialEnabled: true, controlMode: "advanced" });
  assert.equal(defaultSimulation.tutorial.snapshot().enabled, true);
  assert.equal(defaultSimulation.tutorial.snapshot().id, "drop");

  defaultSimulation.reset({ tutorialEnabled: false, controlMode: "advanced" });
  defaultSimulation.tutorialEnabled = true;
  defaultSimulation.begin();
  Object.assign(defaultSimulation.player, { state: "riding", stateTime: 1 });
  defaultSimulation.elapsed = 0.8;
  drain(defaultSimulation);
  const enabledEvents = update(defaultSimulation);
  assert.equal(defaultSimulation.tutorial.snapshot().enabled, true);
  assert.equal(enabledEvents.filter((event) => event.type === "tutorialStep").length, 1);
  assert.equal(enabledEvents.find((event) => event.type === "tutorialStep")?.payload.id, "drop");

  defaultSimulation.tutorialEnabled = false;
  const disabledEvents = update(defaultSimulation, { y: 1 }, []);
  assert.equal(defaultSimulation.tutorial.snapshot().enabled, false);
  assert.equal(disabledEvents.some((event) => event.type.startsWith("tutorial")), false);
});

test("physical play and real semantic events complete Surf School exactly once", () => {
  const simulation = createSimulation();
  const events = advancePhysicalBasics(simulation);
  const player = simulation.player;

  Object.assign(player, {
    state: "lip",
    stateTime: 0.1,
    face: 0.02,
    faceVelocity: -0.85,
    speed: 104,
    charge: 0.8,
    slopeDrive: -0.5,
  });
  update(simulation, {}, events);
  assert.equal(player.state, "airborne");
  assert.equal(simulation.tutorial.snapshot().id, "rotate");
  assert.ok(events.some((event) => event.type === "launch"));

  const surfaceY = simulation.wave.ridingY(player.airX, player.landingFace);
  player.airY = surfaceY - 140;
  player.previousAirY = player.airY;
  player.airVY = -20;
  for (let step = 0; step < 360 && simulation.tutorial.snapshot().id === "rotate"; step += 1) {
    update(simulation, { x: 1 }, events);
  }
  assert.equal(simulation.tutorial.snapshot().id, "trick");
  assert.ok(Math.abs(player.rotationAccum) >= Math.PI);

  update(simulation, { trick1: true, trick1Pressed: true }, events);
  assert.equal(simulation.tutorial.snapshot().id, "land");
  assert.ok(events.some((event) => event.type === "trickStarted"));

  const landingY = simulation.wave.ridingY(player.airX, player.landingFace);
  const landingAngle = simulation.wave.slopeAt(player.airX, player.landingFace);
  Object.assign(player, {
    airY: landingY - 0.5,
    previousAirY: landingY - 0.5,
    airVY: 20,
    angularVelocity: 0,
    boardAngle: landingAngle,
    bodyAngle: landingAngle,
  });
  update(simulation, { trick1Released: true }, events);
  assert.equal(simulation.tutorial.snapshot().complete, true);
  assert.ok(events.some((event) => event.type === "land"));

  for (let step = 0; step < 240; step += 1) update(simulation, {}, events);
  const steps = events.filter((event) => event.type === "tutorialStep");
  const completions = events.filter((event) => event.type === "tutorialComplete");
  assert.deepEqual(steps.map((event) => event.payload.id), [
    "drop",
    "carve",
    "launch",
    "rotate",
    "trick",
    "land",
  ]);
  assert.equal(new Set(steps.map((event) => event.payload.sequence)).size, steps.length);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].payload.completed, "land");
});

test("wipeout and respawn clear stale semantic milestones without replaying completed basics", () => {
  const simulation = createSimulation();
  const events = advancePhysicalBasics(simulation);

  simulation.emit("launch", { strength: 1 });
  simulation.emit("trickStarted", { id: "frontRailGrab" });
  simulation.emit("land", { quality: "clean" });
  assert.equal(simulation.tutorial.launchSeen, true);
  assert.equal(simulation.tutorial.trickSeen, true);
  assert.equal(simulation.tutorial.landSeen, true);

  simulation.triggerWipeout("TEST WIPEOUT", "landing");
  events.push(...drain(simulation));
  assert.equal(simulation.tutorial.launchSeen, false);
  assert.equal(simulation.tutorial.trickSeen, false);
  assert.equal(simulation.tutorial.landSeen, false);
  assert.equal(simulation.tutorial.snapshot().id, "launch");

  for (let step = 0; step < 180 && simulation.player.state === "wipeout"; step += 1) {
    update(simulation, {}, events);
  }
  assert.equal(simulation.player.state, "entry");
  assert.equal(simulation.tutorial.snapshot().id, "launch");
  assert.ok(events.some((event) => event.type === "wipeout"));
  assert.ok(events.some((event) => event.type === "respawn"));
  assert.equal(events.some((event) => event.type === "tutorialComplete"), false);
});
