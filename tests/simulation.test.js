import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, FIXED_STEP, TUNING } from "../js/config.js";
import { seededRandom, TAU } from "../js/math.js";
import { SurfSimulation } from "../js/simulation.js";
import { formatTrickName } from "../js/trick-scoring.js";

const VALID_STATES = new Set([
  "entry",
  "riding",
  "lip",
  "airborne",
  "landing",
  "wobble",
  "wipeout",
  "complete",
]);

function inputAtStep(step) {
  const phase = step % 240;
  const input = {
    x: Math.sin(step * 0.031) * 0.72,
    y: Math.cos(step * 0.023) * 0.68,
    edge: phase >= 48 && phase < 96,
    edgePressed: phase === 48,
    edgeReleased: phase === 96,
  };
  const trickStep = phase === 132 ? 1 : phase === 156 ? 2 : phase === 180 ? 3 : phase === 204 ? 4 : 0;
  if (trickStep) {
    input[`trick${trickStep}`] = true;
    input[`trick${trickStep}Pressed`] = true;
  }
  return input;
}

function simulationSnapshot(simulation) {
  const player = simulation.player;
  return {
    elapsed: simulation.elapsed,
    timeRemaining: simulation.timeRemaining,
    complete: simulation.complete,
    wipeouts: simulation.wipeouts,
    wave: {
      time: simulation.wave.time,
      travel: simulation.wave.travel,
      curlX: simulation.wave.curlX,
      pressure: simulation.wave.pressure,
    },
    player: {
      state: player.state,
      stateTime: player.stateTime,
      x: player.x,
      face: player.face,
      faceVelocity: player.faceVelocity,
      speed: player.speed,
      boardAngle: player.boardAngle,
      bodyAngle: player.bodyAngle,
      airX: player.airX,
      airY: player.airY,
      airVX: player.airVX,
      airVY: player.airVY,
      angularVelocity: player.angularVelocity,
      rotationAccum: player.rotationAccum,
      charge: player.charge,
      maneuver: { ...player.maneuver },
      speedPotential: { ...player.speedPotential },
    },
    score: {
      total: simulation.score.total,
      combo: simulation.score.combo,
      flow: simulation.score.flow,
      breakdown: { ...simulation.score.breakdown },
    },
  };
}

function runAccumulatorSchedule(renderHz, targetSteps = 960) {
  const simulation = new SurfSimulation({ seed: 0x51a7c0de });
  simulation.tutorialEnabled = false;
  simulation.reset({ board: BOARDS.mangoFish });
  simulation.begin();

  const frameDelta = 1 / renderHz;
  let accumulator = 0;
  let frames = 0;
  let steps = 0;
  while (steps < targetSteps) {
    accumulator += frameDelta;
    frames += 1;
    while (accumulator + Number.EPSILON >= FIXED_STEP && steps < targetSteps) {
      simulation.update(FIXED_STEP, inputAtStep(steps));
      simulation.consumeEvents(() => {});
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    assert.ok(frames < targetSteps * 2, `render schedule ${renderHz} Hz stalled`);
  }
  return { frames, snapshot: simulationSnapshot(simulation) };
}

function beginRiding(board) {
  const simulation = new SurfSimulation({ seed: 0x4b414b49 });
  simulation.tutorialEnabled = false;
  simulation.reset({ board });
  simulation.begin();
  simulation.player.state = "riding";
  simulation.player.stateTime = 1;
  simulation.player.x = 260;
  simulation.player.face = 0.48;
  simulation.wave.curlX = 40;
  simulation.consumeEvents(() => {});
  return simulation;
}

function prepareLaunch(board = BOARDS.mangoFish) {
  const simulation = beginRiding(board);
  const player = simulation.player;
  player.state = "lip";
  player.stateTime = 0.1;
  player.face = 0.02;
  player.faceVelocity = -0.85;
  player.speed = 96;
  player.charge = 0.8;
  simulation.update(FIXED_STEP, {});
  assert.equal(player.state, "airborne", `${board.id} should leave the lip`);
  assert.ok(simulation.aerialSession, "launch creates an aerial session");
  return simulation;
}

function boardProbe(board) {
  const steering = beginRiding(board);
  steering.update(FIXED_STEP, { y: 1 });
  const faceVelocity = steering.player.faceVelocity;

  const speed = beginRiding(board);
  speed.player.speed = 240;
  speed.update(FIXED_STEP, {});
  const cappedSpeed = speed.player.speed;

  const launch = prepareLaunch(board);
  const launchVelocity = launch.player.airVY;

  return {
    faceVelocity,
    cappedSpeed,
    launchVelocity,
    cleanLandingBand: launch.landingBands().clean,
  };
}

function collectEvents(simulation) {
  const events = [];
  simulation.consumeEvents((event) => events.push(event));
  return events;
}

function forceContact(simulation, angleOffset) {
  const player = simulation.player;
  const surfaceY = simulation.wave.ridingY(player.airX, player.landingFace);
  const surfaceAngle = simulation.wave.slopeAt(player.airX, player.landingFace);
  player.airY = surfaceY - 0.5;
  player.previousAirY = player.airY;
  player.airVY = 20;
  player.airVX = 0;
  player.angularVelocity = 0;
  player.boardAngle = surfaceAngle + angleOffset;
  player.bodyAngle = player.boardAngle;
}

function assertFiniteObjectNumbers(object, label) {
  for (const [key, value] of Object.entries(object)) {
    if (typeof value === "number") {
      assert.ok(Number.isFinite(value), `${label}.${key} became ${value}`);
    }
  }
}

test("fixed-step outcomes are identical behind 30, 60, and 144 Hz render schedules", () => {
  const thirty = runAccumulatorSchedule(30);
  const sixty = runAccumulatorSchedule(60);
  const oneFortyFour = runAccumulatorSchedule(144);

  assert.notEqual(thirty.frames, sixty.frames);
  assert.notEqual(sixty.frames, oneFortyFour.frames);
  assert.deepEqual(sixty.snapshot, thirty.snapshot);
  assert.deepEqual(oneFortyFour.snapshot, thirty.snapshot);
});

test("all boards produce measurably different steering, speed, pop, and landing outcomes", () => {
  const foam = boardProbe(BOARDS.foamPuff);
  const fish = boardProbe(BOARDS.mangoFish);
  const log = boardProbe(BOARDS.moonLog);

  assert.equal(new Set([foam, fish, log].map((probe) => JSON.stringify(probe))).size, 3);
  assert.ok(fish.faceVelocity > foam.faceVelocity && foam.faceVelocity > log.faceVelocity);
  assert.ok(log.cappedSpeed > fish.cappedSpeed && fish.cappedSpeed > foam.cappedSpeed);
  assert.ok(Math.abs(log.launchVelocity) > Math.abs(fish.launchVelocity));
  assert.ok(Math.abs(fish.launchVelocity) > Math.abs(foam.launchVelocity));
  assert.ok(foam.cleanLandingBand > log.cleanLandingBand);
  assert.ok(log.cleanLandingBand > fish.cleanLandingBand);
});

test("gameplay assists widen recovery while applying the documented score penalty", () => {
  const unassisted = beginRiding(BOARDS.mangoFish);
  unassisted.score.combo = 2.2;
  const baseMultiplier = unassisted.currentMultiplier();
  const baseLandingBand = unassisted.landingBands().clean;

  const assisted = beginRiding(BOARDS.mangoFish);
  assisted.score.combo = 2.2;
  assisted.assists = { steering: true, landing: true };
  const assistedMultiplier = assisted.currentMultiplier();
  const assistedLandingBand = assisted.landingBands().clean;

  assert.ok(Math.abs(assistedMultiplier / baseMultiplier - 0.82) < 1e-12);
  assert.ok(Math.abs(assistedLandingBand / baseLandingBand - 1.4) < 1e-12);
});

test("a launched aerial banks only after a perfect landing and returns to riding", () => {
  const simulation = prepareLaunch();
  const launchEvents = collectEvents(simulation);
  assert.ok(launchEvents.some((event) => event.type === "launch"));
  const preLandingTotal = simulation.score.total;
  assert.equal(simulation.score.breakdown.air, 0, "launch air value remains provisional");
  assert.equal(simulation.score.breakdown.style, 0, "launch style value remains provisional");
  assert.equal(simulation.score.breakdown.landings, 0);
  assert.ok(simulation.player.provisionalScore > 0);

  forceContact(simulation, 0);
  simulation.update(FIXED_STEP, {});
  const landingEvents = collectEvents(simulation);
  const landing = landingEvents.find((event) => event.type === "land");
  assert.equal(landing?.payload.quality, "perfect");
  assert.equal(simulation.player.state, "landing");
  assert.equal(simulation.player.landingQuality, "perfect");
  assert.ok(simulation.score.total > preLandingTotal);
  assert.equal(simulation.score.total, simulation.score.bucketTotal());

  for (let step = 0; step < 40; step += 1) simulation.update(FIXED_STEP, {});
  assert.equal(simulation.player.state, "riding");
  assert.equal(simulation.aerialSession, null);
});

test("a misaligned landing wipes out, respawns, and reset provides a clean restart", () => {
  const simulation = prepareLaunch(BOARDS.moonLog);
  assert.ok(simulation.player.provisionalScore > 0);
  collectEvents(simulation);
  forceContact(simulation, Math.PI);

  for (let step = 0; step < 24 && simulation.player.state !== "wipeout"; step += 1) {
    simulation.update(FIXED_STEP, {});
  }
  const wipeoutEvents = collectEvents(simulation);
  assert.equal(simulation.player.state, "wipeout");
  assert.equal(simulation.wipeouts, 1);
  assert.equal(simulation.player.provisionalScore, 0);
  assert.ok(wipeoutEvents.some((event) => event.type === "wipeout"));

  for (let step = 0; step < 140 && simulation.player.state === "wipeout"; step += 1) {
    simulation.update(FIXED_STEP, {});
  }
  const respawnEvents = collectEvents(simulation);
  assert.equal(simulation.player.state, "entry");
  assert.ok(respawnEvents.some((event) => event.type === "respawn"));

  simulation.reset({ board: BOARDS.foamPuff, assists: { steering: true, landing: true } });
  assert.equal(simulation.started, false);
  assert.equal(simulation.complete, false);
  assert.equal(simulation.elapsed, 0);
  assert.equal(simulation.timeRemaining, TUNING.runDuration);
  assert.equal(simulation.wipeouts, 0);
  assert.equal(simulation.score.total, 0);
  assert.equal(simulation.player.state, "entry");
  assert.equal(simulation.aerialSession, null);
  assert.equal(simulation.board.id, "foamPuff");
  simulation.begin();
  simulation.update(FIXED_STEP, { edgePressed: true });
  assert.ok(simulation.elapsed > 0, "the restarted run advances normally");
});

test("720-degree rotation is named from the actual accumulated rotation", () => {
  const manifest = {
    sequence: [],
    rotationAccumulated: TAU * 2,
  };
  assert.equal(formatTrickName(manifest), "720 AIR SPIN");
  assert.equal(formatTrickName(manifest, { quality: "perfect" }), "PERFECT 720 AIR SPIN");
});

test("long seeded randomized play remains finite, bounded, and restartable", () => {
  const random = seededRandom(0x5eedcafe);
  const boardIds = Object.keys(BOARDS);
  let boardIndex = 0;
  const simulation = new SurfSimulation({ seed: 0x5eedcafe });
  simulation.tutorialEnabled = false;
  simulation.reset({ board: BOARDS[boardIds[boardIndex]] });
  simulation.begin();
  collectEvents(simulation);

  const held = { edge: false, trick1: false, trick2: false, trick3: false, trick4: false };
  let x = 0;
  let y = 0;
  let completedRuns = 0;

  for (let step = 0; step < 24_000; step += 1) {
    if (step % 18 === 0) {
      x = random() * 2 - 1;
      y = random() * 2 - 1;
    }
    const previous = { ...held };
    held.edge = held.edge ? random() >= 0.035 : random() < 0.018;
    for (let index = 1; index <= 4; index += 1) {
      const action = `trick${index}`;
      held[action] = held[action] ? random() >= 0.16 : random() < 0.009;
    }
    const input = {
      x,
      y,
      edge: held.edge,
      edgePressed: held.edge && !previous.edge,
      edgeReleased: !held.edge && previous.edge,
    };
    for (let index = 1; index <= 4; index += 1) {
      const action = `trick${index}`;
      input[action] = held[action];
      input[`${action}Pressed`] = held[action] && !previous[action];
      input[`${action}Released`] = !held[action] && previous[action];
    }

    simulation.update(FIXED_STEP, input);
    assertFiniteObjectNumbers(simulation.player, "player");
    assertFiniteObjectNumbers(simulation.player.speedPotential, "speedPotential");
    assertFiniteObjectNumbers(simulation.player.landingPreview, "landingPreview");
    assertFiniteObjectNumbers(simulation.wave, "wave");
    assertFiniteObjectNumbers(simulation.score.breakdown, "score.breakdown");
    assert.ok(VALID_STATES.has(simulation.player.state), simulation.player.state);
    assert.ok(simulation.player.face >= -0.061 && simulation.player.face <= 1.001);
    assert.ok(simulation.player.x >= 58 && simulation.player.x <= 350);
    assert.ok(simulation.player.airX >= 50 && simulation.player.airX <= 360);
    assert.ok(simulation.player.charge >= 0 && simulation.player.charge <= 1);
    assert.ok(simulation.player.speed >= 0);
    assert.ok(simulation.player.speed <= TUNING.maxSpeed * simulation.board.maxSpeed + 2);
    assert.ok(simulation.timeRemaining >= 0 && simulation.timeRemaining <= TUNING.runDuration);
    assert.ok(simulation.wipeouts >= 0 && simulation.wipeouts <= TUNING.maxWipeouts);
    assert.ok(simulation.score.total >= 0);
    assert.equal(simulation.score.total, simulation.score.bucketTotal());
    assert.ok(simulation.eventCount <= simulation.events.length);
    collectEvents(simulation);

    if (simulation.complete) {
      completedRuns += 1;
      boardIndex = (boardIndex + 1) % boardIds.length;
      simulation.reset({ board: BOARDS[boardIds[boardIndex]] });
      simulation.begin();
      for (const action of Object.keys(held)) held[action] = false;
      collectEvents(simulation);
    }
  }

  assert.ok(completedRuns >= 2, `expected multiple completed runs, saw ${completedRuns}`);
});
