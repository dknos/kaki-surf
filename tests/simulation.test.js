import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, CONDITIONS, FIXED_STEP, TUNING, WAVE_STYLES } from "../js/config.js";
import { seededRandom, shortestAngle, TAU } from "../js/math.js";
import { ScoreSystem } from "../js/scoring.js";
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
    activeTime: simulation.activeTime,
    rideDistance: simulation.rideDistance,
    timeRemaining: simulation.timeRemaining,
    complete: simulation.complete,
    wipeouts: simulation.wipeouts,
    wave: {
      time: simulation.wave.time,
      travel: simulation.wave.travel,
      worldTravel: simulation.wave.worldTravel,
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
      waveMomentum: player.waveMomentum,
      skillMomentum: player.skillMomentum,
      lastPumpAt: player.lastPumpAt,
      carveArcSign: player.carveArcSign,
      carveArcDuration: player.carveArcDuration,
      carveArcExcursion: player.carveArcExcursion,
      lateralVelocity: player.lateralVelocity,
      travelVelocity: player.travelVelocity,
      tubeRide: { ...player.tubeRide },
      travelDirection: player.travelDirection,
      directionIntent: player.directionIntent,
      directionCommit: player.directionCommit,
      switchStance: player.switchStance,
      reversalCount: player.reversalCount,
      worldTravel: player.worldTravel,
      slopeDrive: player.slopeDrive,
      speedTier: player.speedTier,
      flow: player.flow,
      landingCarryTimer: player.landingCarryTimer,
      contextTrick: { ...player.contextTrick },
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

function beginRiding(board, { controlMode = "simple", condition = CONDITIONS.goldenCoast, mode = "endless" } = {}) {
  const simulation = new SurfSimulation({ seed: 0x4b414b49, mode });
  simulation.tutorialEnabled = false;
  simulation.reset({ board, controlMode, condition, mode });
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

function runMovementLoop({ board = BOARDS.mangoFish, steps = 1_800, pump = false } = {}) {
  const simulation = beginRiding(board);
  const player = simulation.player;
  player.face = 0.35;
  player.speed = TUNING.speed;
  simulation.wave.curlX = -1_000;
  let dropping = true;
  let topSpeed = player.speed;

  for (let step = 0; step < steps; step += 1) {
    if (player.face > 0.88) dropping = false;
    if (player.face < 0.22) dropping = true;
    const phase = step % 96;
    simulation.update(FIXED_STEP, {
      y: dropping ? 1 : -0.75,
      edge: pump && phase < 60,
      edgePressed: pump && phase === 0,
      edgeReleased: pump && phase === 60,
    });
    simulation.consumeEvents(() => {});
    assert.ok(player.state === "riding" || player.state === "lip");
    topSpeed = Math.max(topSpeed, player.speed);
  }

  return {
    simulation,
    topSpeed,
    speedCap: simulation.currentRideSpeedCap(),
  };
}

function boardProbe(board) {
  const steering = beginRiding(board);
  steering.update(FIXED_STEP, { y: 1 });
  const faceVelocity = steering.player.faceVelocity;

  const speed = beginRiding(board);
  speed.player.speed = 240;
  speed.player.waveMomentum = 1;
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

function forceContact(simulation, angleOffset, { airVX = 0 } = {}) {
  const player = simulation.player;
  const surfaceY = simulation.wave.ridingY(player.airX, player.landingFace);
  const surfaceAngle = simulation.wave.slopeAt(player.airX, player.landingFace);
  player.airY = surfaceY - 0.5;
  player.previousAirY = player.airY;
  player.airVY = 20;
  player.airVX = airVX;
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

test("travel direction commits only after a stable reversal and signed world travel follows it", () => {
  const simulation = beginRiding(BOARDS.mangoFish);
  const player = simulation.player;
  player.speed = 112;
  simulation.wave.curlX = -500;

  for (let step = 0; step < 48; step += 1) simulation.update(FIXED_STEP, { x: -0.12 });
  assert.equal(player.travelDirection, 1, "dead-band samples cannot flip presentation");
  const rightwardWorld = simulation.worldTravel;

  const directionEvents = [];
  for (let step = 0; step < 120 && player.travelDirection === 1; step += 1) {
    simulation.update(FIXED_STEP, { x: -1 });
    simulation.consumeEvents((event) => {
      if (event.type === "directionChange") directionEvents.push(event);
    });
  }
  assert.equal(player.travelDirection, -1);
  assert.equal(player.switchStance, true);
  assert.equal(player.reversalCount, 1);
  assert.equal(directionEvents.length, 1);
  assert.deepEqual(directionEvents[0].payload.from, 1);
  assert.deepEqual(directionEvents[0].payload.to, -1);

  const committedWorld = simulation.worldTravel;
  for (let step = 0; step < 120; step += 1) simulation.update(FIXED_STEP, { x: -1 });
  assert.ok(committedWorld > rightwardWorld);
  assert.ok(simulation.worldTravel < committedWorld, "world distance moves with committed direction");

  for (let step = 0; step < 240; step += 1) {
    simulation.update(FIXED_STEP, { x: step % 2 ? 1 : -1 });
    simulation.consumeEvents((event) => {
      if (event.type === "directionChange") directionEvents.push(event);
    });
  }
  assert.equal(player.travelDirection, -1, "alternating samples do not flicker facing");
  assert.equal(directionEvents.length, 1);
});

test("held steering traverses the long face in both directions like a side scroller", () => {
  const simulation = beginRiding(BOARDS.mangoFish);
  const player = simulation.player;
  simulation.wave.curlX = -500;
  player.x = 212;
  player.previousX = 212;
  let rightmost = player.x;
  let leftmost = player.x;

  for (let step = 0; step < 360; step += 1) {
    simulation.update(FIXED_STEP, { x: 1 });
    rightmost = Math.max(rightmost, player.x);
  }
  for (let step = 0; step < 720; step += 1) {
    simulation.update(FIXED_STEP, { x: -1 });
    leftmost = Math.min(leftmost, player.x);
  }

  assert.ok(rightmost >= 320, `right traverse reached only ${rightmost}`);
  assert.ok(leftmost <= 90, `left traverse reached only ${leftmost}`);
  assert.ok(rightmost - leftmost >= 220, "the rider can use most of the visible wave face");
  assert.equal(player.travelDirection, -1);
});

test("high-speed reversals draw a heavier arc and scrub more speed than low-speed pivots", () => {
  const reverse = (speed) => {
    const simulation = beginRiding(BOARDS.mangoFish);
    Object.assign(simulation.player, { speed, travelVelocity: 12, lateralVelocity: 12 });
    simulation.wave.curlX = -500;
    let steps = 0;
    while (simulation.player.travelDirection === 1 && steps < 120) {
      simulation.update(FIXED_STEP, { x: -1 });
      steps += 1;
    }
    return { steps, speed: simulation.player.speed, turnForce: simulation.player.turnForce };
  };

  const low = reverse(50);
  const high = reverse(130);
  assert.ok(high.steps >= low.steps);
  assert.ok(130 - high.speed > 4);
  assert.ok(low.speed >= 50, "the low-speed pivot does not pay the high-speed scrub cost");
  assert.ok(high.turnForce >= low.turnForce * 0.9);
});

test("surface-projected motion accelerates downhill, glides on traverse, and costs speed uphill", () => {
  const probe = (faceVelocity) => {
    const simulation = beginRiding(BOARDS.mangoFish);
    Object.assign(simulation.player, {
      speed: 90,
      face: 0.5,
      faceVelocity,
      travelVelocity: 12,
      lateralVelocity: 12,
    });
    simulation.wave.curlX = -500;
    simulation.wave.surfaceGradientAt = () => ({ x: 0, face: 100 });
    simulation.update(FIXED_STEP, {});
    return { speed: simulation.player.speed, slopeDrive: simulation.player.slopeDrive };
  };

  const downhill = probe(0.6);
  const traverse = probe(0);
  const uphill = probe(-0.6);
  assert.ok(downhill.slopeDrive > 0.9);
  assert.ok(Math.abs(traverse.slopeDrive) < 1e-12);
  assert.ok(uphill.slopeDrive < -0.9);
  assert.ok(downhill.speed > traverse.speed);
  assert.ok(traverse.speed > uphill.speed);
});

test("movement alone reaches the hard board cap and wave momentum is not a permission gate", () => {
  const first = runMovementLoop();
  const second = runMovementLoop();
  const hardMax = TUNING.maxSpeed * BOARDS.mangoFish.maxSpeed;

  assert.equal(first.speedCap, hardMax);
  assert.equal(first.simulation.currentRideSpeedCap(0), hardMax);
  assert.equal(first.simulation.currentRideSpeedCap(1), hardMax);
  assert.equal(first.topSpeed, hardMax);
  assert.equal(second.topSpeed, first.topSpeed, "movement loop remains deterministic");
  assert.ok(first.simulation.player.charge < 0.01, "cap is reachable without pumping");
});

test("launch energy is led by approach speed and uphill slope while Pump remains an enhancer", () => {
  const launch = ({ speed, slopeDrive, charge = 0, waveMomentum = 0 }) => {
    const simulation = beginRiding(BOARDS.mangoFish);
    Object.assign(simulation.player, {
      state: "lip",
      stateTime: 0.1,
      face: 0.02,
      faceVelocity: 0,
      speed,
      charge,
      waveMomentum,
      slopeDrive,
      travelVelocity: 12,
      lateralVelocity: 12,
    });
    simulation.launch({ x: 0 });
    return {
      airVY: simulation.player.airVY,
      launchData: { ...simulation.aerialSession.manifest.launchData },
    };
  };

  const slow = launch({ speed: 60, slopeDrive: -0.45 });
  const fast = launch({ speed: 130, slopeDrive: -0.45 });
  const downhillLip = launch({ speed: 130, slopeDrive: 0.45 });
  const pumped = launch({ speed: 130, slopeDrive: -0.45, charge: 1 });
  const legacyMomentum = launch({ speed: 130, slopeDrive: -0.45, waveMomentum: 1 });

  assert.ok(fast.airVY < slow.airVY - 20, "actual speed creates obviously larger air");
  assert.ok(fast.airVY < downhillLip.airVY - 5, "uphill lip approach contributes to pop");
  assert.ok(pumped.airVY < fast.airVY, "Pump enhances an already useful launch");
  assert.equal(legacyMomentum.airVY, fast.airVY, "hidden momentum no longer gates pop");
  assert.equal(fast.launchData.launchSpeed, 130);
  assert.equal(fast.launchData.slopeDrive, -0.45);
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

test("Simple context trick buffers before air, holds a directional grab, and chains a tap", () => {
  const simulation = beginRiding(BOARDS.mangoFish, { controlMode: "simple" });
  const player = simulation.player;
  Object.assign(player, {
    state: "lip",
    stateTime: 0.1,
    face: 0.02,
    faceVelocity: -0.85,
    speed: 120,
    charge: 0.5,
    slopeDrive: -0.4,
  });

  simulation.update(FIXED_STEP, { trick: true, trickPressed: true });
  assert.equal(player.state, "airborne");
  assert.equal(player.contextTrick.pending, true, "the on-wave press survives the launch transition");
  simulation.update(FIXED_STEP, { trickReleased: true });
  for (let step = 0; step < 60 && !simulation.aerialSession.manifest.sequence.length; step += 1) {
    simulation.update(FIXED_STEP, {});
  }
  assert.equal(simulation.aerialSession.manifest.sequence[0]?.id, "boardVarial");
  assert.ok(simulation.aerialSession.elapsed >= 0.08, "tap executes at the first valid aerial moment");

  simulation.update(FIXED_STEP, { trick: true, trickPressed: true, y: -1 });
  simulation.update(FIXED_STEP, { trickReleased: true, y: -1 });
  for (let step = 0; step < 36; step += 1) simulation.update(FIXED_STEP, {});
  assert.deepEqual(
    simulation.aerialSession.manifest.sequence.slice(0, 2).map((entry) => entry.id),
    ["boardVarial", "frontRailGrab"],
  );
  assert.equal(simulation.aerialSession.manifest.sequence[1].complete, true);

  const held = prepareLaunch(BOARDS.foamPuff);
  for (let step = 0; step < 24; step += 1) {
    held.update(FIXED_STEP, {
      y: 1,
      trick: true,
      trickPressed: step === 0,
    });
  }
  held.update(FIXED_STEP, { y: 1, trickReleased: true });
  assert.equal(held.aerialSession.manifest.sequence[0]?.id, "tailGrab");
  assert.ok(held.aerialSession.manifest.sequence[0].heldDuration >= TUNING.simpleGrabHold);
});

test("Simple TRICK holds a scored tube tuck inside Twilight's rideable pocket", () => {
  const simulation = beginRiding(BOARDS.mangoFish, {
    controlMode: "simple",
    condition: CONDITIONS.twilightGlass,
  });
  const player = simulation.player;
  simulation.wave.curlX = 100;
  simulation.wave.pressure = 0.82;
  simulation.wave.time = TUNING.curlGrace + 0.2;
  player.x = simulation.wave.contactX() + 13;
  player.previousX = player.x;
  player.face = simulation.wave.powerFaceAt(player.x);
  player.previousFace = player.face;
  player.speed = 116;
  const styleBefore = simulation.score.breakdown.style;

  simulation.update(FIXED_STEP, { trick: true, trickPressed: true });

  assert.equal(player.state, "riding");
  assert.equal(player.maneuver.id, "tubeTuck");
  assert.ok(player.maneuver.progress > 0);
  assert.ok(simulation.score.breakdown.style > styleBefore, "tube time scores continuously");
  assert.equal(player.contextTrick.pending, false, "the pocket consumes the contextual press");

  player.x = simulation.wave.contactX() + 112;
  player.previousX = player.x;
  simulation.update(FIXED_STEP, { trick: true });
  assert.equal(player.maneuver.id, "tubeTuck", "brief pocket jitter keeps the tuck stable");
  for (let step = 0; step < Math.ceil(TUNING.tubeExitGrace / FIXED_STEP) + 2; step += 1) {
    simulation.update(FIXED_STEP, { trick: true });
  }
  assert.equal(player.maneuver.id, "", "sustained pocket loss clears the tuck after grace");

  player.x = simulation.wave.contactX() + 13;
  player.previousX = player.x;
  player.face = simulation.wave.powerFaceAt(player.x);
  simulation.update(FIXED_STEP, { trick: true });
  assert.equal(player.maneuver.id, "", "a held input cannot silently create a second tube session");
  simulation.update(FIXED_STEP, { trickReleased: true });
  simulation.update(FIXED_STEP, { trick: true, trickPressed: true });
  assert.equal(player.maneuver.id, "tubeTuck", "release and press explicitly re-arm Tube Tuck");
  simulation.update(FIXED_STEP, { trickReleased: true });
  assert.equal(player.maneuver.id, "");
});

test("Tube sessions expose one readable entry, persistent value, clean exit, and failure", () => {
  const simulation = beginRiding(BOARDS.moonLog, {
    controlMode: "advanced",
    condition: CONDITIONS.twilightGlass,
  });
  const player = simulation.player;
  simulation.wave.curlX = 100;
  simulation.wave.pressure = 0.84;
  simulation.wave.time = TUNING.curlGrace + 0.4;
  player.x = simulation.wave.contactX() + 13;
  player.previousX = player.x;
  player.face = simulation.wave.powerFaceAt(player.x);
  player.previousFace = player.face;
  collectEvents(simulation);

  for (let step = 0; step < 72; step += 1) {
    simulation.update(FIXED_STEP, {
      trick4: true,
      trick4Pressed: step === 0,
    });
  }
  const holdEvents = collectEvents(simulation);
  assert.equal(player.tubeRide.active, true);
  assert.equal(player.tubeRide.id, "soulArch");
  assert.equal(player.maneuver.id, "soulArch");
  assert.ok(player.tubeRide.time >= 0.59 && player.tubeRide.time <= 0.61);
  assert.ok(player.tubeRide.score > 0);
  assert.equal(holdEvents.filter((event) => event.type === "maneuver").length, 1);
  assert.equal(simulation.highlights.tubeRides, 1);

  const scoreBeforeBlockedSnap = simulation.score.total;
  simulation.update(FIXED_STEP, {
    trick4: true,
    trick1: true,
    trick1Pressed: true,
  });
  const blockedSnapEvents = collectEvents(simulation);
  assert.equal(player.maneuver.id, "soulArch");
  assert.equal(blockedSnapEvents.some((event) => event.type === "maneuver"
    && event.payload.id === "snap"), false, "tube ownership blocks overlapping lip tricks");
  assert.ok(simulation.score.total - scoreBeforeBlockedSnap < 10, "only continuous tube value is added");

  simulation.update(FIXED_STEP, { trick4Released: true });
  const exitEvents = collectEvents(simulation);
  const exit = exitEvents.find((event) => event.type === "tubeExit");
  assert.ok(exit);
  assert.equal(exit.payload.id, "soulArch");
  assert.ok(exit.payload.duration >= TUNING.tubeCleanExitTime);
  assert.equal(player.tubeRide.active, false);
  assert.ok(player.tubeRide.visualExit > 0, "front foam receives a short release tail");
  assert.ok(exitEvents.some((event) => event.type === "callout"
    && event.payload.text === "CLEAN TUBE EXIT"));

  player.x = simulation.wave.contactX() + 13;
  player.previousX = player.x;
  player.face = simulation.wave.powerFaceAt(player.x);
  simulation.update(FIXED_STEP, { trick4: true, trick4Pressed: true });
  collectEvents(simulation);
  simulation.triggerWipeout("CURL ATE IT!", "curl");
  const failEvents = collectEvents(simulation);
  assert.equal(failEvents.filter((event) => event.type === "tubeFail").length, 1);
  assert.equal(failEvents.filter((event) => event.type === "wipeout").length, 1);
  assert.ok(failEvents.some((event) => event.type === "callout"
    && event.payload.text === "TUBE CLOSED!"));
  assert.equal(player.tubeRide.active, false);
});

test("Tube prompt uses the mapped Advanced key and a held exit must re-arm", () => {
  const simulation = beginRiding(BOARDS.mangoFish, {
    controlMode: "advanced",
    condition: CONDITIONS.twilightGlass,
  });
  simulation.tutorialEnabled = false;
  const player = simulation.player;
  simulation.wave.curlX = 100;
  simulation.wave.pressure = 0.84;
  simulation.wave.time = TUNING.curlGrace + 0.4;
  player.x = simulation.wave.contactX() + 13;
  player.previousX = player.x;
  player.face = simulation.wave.powerFaceAt(player.x);
  player.previousFace = player.face;
  collectEvents(simulation);

  simulation.update(FIXED_STEP, {});
  const readyEvents = collectEvents(simulation);
  assert.equal(readyEvents.find((event) => event.type === "tubeReady")?.payload.action, "T");
  assert.equal(readyEvents.find((event) => event.type === "callout")?.payload.subtext, "HOLD T TO TUCK");

  simulation.update(FIXED_STEP, { trick4: true, trick4Pressed: true });
  collectEvents(simulation);
  assert.equal(player.tubeRide.active, true);
  assert.equal(simulation.highlights.tubeRides, 1);

  player.x = simulation.wave.contactX() + 112;
  player.previousX = player.x;
  for (let step = 0; step < Math.ceil(TUNING.tubeExitGrace / FIXED_STEP) + 2; step += 1) {
    simulation.update(FIXED_STEP, { trick4: true });
    collectEvents(simulation);
  }
  assert.equal(player.tubeRide.active, false);
  assert.equal(player.tubeRide.releaseRequired, true);

  player.x = simulation.wave.contactX() + 13;
  player.previousX = player.x;
  player.face = simulation.wave.powerFaceAt(player.x);
  for (let step = 0; step < 8; step += 1) simulation.update(FIXED_STEP, { trick4: true });
  collectEvents(simulation);
  assert.equal(player.tubeRide.active, false, "returning while held cannot create a second session");
  assert.equal(simulation.highlights.tubeRides, 1);

  simulation.update(FIXED_STEP, { trick4Released: true });
  collectEvents(simulation);
  simulation.update(FIXED_STEP, { trick4: true, trick4Pressed: true });
  assert.equal(player.tubeRide.active, true, "release explicitly re-arms the tube input");
  assert.equal(simulation.highlights.tubeRides, 2);
});

test("Best Tube keeps one real duration-score tuple and timer completion is not a clean exit", () => {
  const simulation = beginRiding(BOARDS.mangoFish, {
    controlMode: "advanced",
    condition: CONDITIONS.twilightGlass,
  });
  const lowRisk = { risk: 0, acceleration: 0.5 };
  simulation.beginTubeRide(lowRisk);
  simulation.sustainTubeRide(0.8, lowRisk);
  simulation.endTubeRide("release");
  collectEvents(simulation);

  simulation.score.flow = 1;
  simulation.score.syncCombo();
  const highRisk = { risk: 1, acceleration: 0.5 };
  simulation.beginTubeRide(highRisk);
  simulation.sustainTubeRide(0.4, highRisk);
  assert.equal(simulation.highlights.longestTube, 0.8);
  assert.equal(simulation.highlights.bestTubeDuration, 0.4);
  assert.ok(simulation.highlights.bestTubeScore > 100);

  collectEvents(simulation);
  simulation.finishRun("time");
  const finishEvents = collectEvents(simulation);
  assert.equal(finishEvents.some((event) => event.type === "tubeExit"), false,
    "timer completion does not impersonate a player-earned tube exit");
  assert.equal(finishEvents.some((event) => event.type === "callout"
    && event.payload.text === "CLEAN TUBE EXIT"), false);
});

test("tube foreground exit tail ages while airborne and cannot reappear after landing", () => {
  const simulation = beginRiding(BOARDS.mangoFish, {
    controlMode: "advanced",
    condition: CONDITIONS.twilightGlass,
  });
  simulation.beginTubeRide({ risk: 0.8, acceleration: 0.5 });
  simulation.launch({ x: 0 });

  assert.equal(simulation.player.state, "airborne");
  assert.ok(simulation.player.tubeRide.visualExit > 0);
  for (let step = 0; step < Math.ceil(0.18 / FIXED_STEP) + 2; step += 1) {
    simulation.update(FIXED_STEP, {});
  }
  assert.equal(simulation.player.tubeRide.visualExit, 0);
  simulation.setState("riding");
  assert.equal(simulation.player.tubeRide.visualExit, 0,
    "returning to the face cannot resurrect stale foreground foam");
});

test("Simple failed advanced tap becomes a readable fallback grab without rejection spam", () => {
  const simulation = prepareLaunch(BOARDS.foamPuff);
  const player = simulation.player;
  player.airY = simulation.wave.ridingY(player.airX, player.landingFace) - 40;
  player.previousAirY = player.airY;
  player.airVY = 22;
  player.maxAirHeight = 2;
  simulation.aerialSession.manifest.maxHeight = 2;
  collectEvents(simulation);

  simulation.update(FIXED_STEP, { trick: true, trickPressed: true });
  collectEvents(simulation);
  simulation.update(FIXED_STEP, { trickReleased: true });
  const events = collectEvents(simulation);
  const entry = simulation.aerialSession.manifest.sequence[0];
  assert.equal(entry.id, "frontRailGrab");
  assert.equal(entry.fallbackFrom, "boardVarial");
  assert.ok(events.some((event) => event.type === "trickStarted"));
  assert.equal(events.some((event) => event.type === "trickRejected"), false);

  for (let step = 0; step < 24; step += 1) simulation.update(FIXED_STEP, {});
  assert.equal(entry.complete, true);
});

test("Simple late auto-level is board-specific while Advanced remains fully manual", () => {
  const probe = (board, controlMode) => {
    const simulation = beginRiding(board, { controlMode });
    Object.assign(simulation.player, {
      state: "lip",
      stateTime: 0.1,
      face: 0.02,
      faceVelocity: -0.8,
      speed: 100,
      slopeDrive: -0.5,
    });
    simulation.launch({ x: 0 });
    const player = simulation.player;
    const surfaceAngle = simulation.wave.slopeAt(player.airX, player.landingFace);
    player.airY = simulation.wave.ridingY(player.airX, player.landingFace) - 70;
    player.previousAirY = player.airY;
    player.airVY = 30;
    player.boardAngle = surfaceAngle + 1;
    player.bodyAngle = player.boardAngle;
    player.angularVelocity = 0;
    for (let step = 0; step < 12; step += 1) simulation.update(FIXED_STEP, {});
    return Math.abs(shortestAngle(player.boardAngle, surfaceAngle));
  };

  const foamSimple = probe(BOARDS.foamPuff, "simple");
  const fishSimple = probe(BOARDS.mangoFish, "simple");
  const logSimple = probe(BOARDS.moonLog, "simple");
  const foamAdvanced = probe(BOARDS.foamPuff, "advanced");
  assert.ok(foamSimple < fishSimple && fishSimple < logSimple);
  assert.ok(logSimple < foamAdvanced);
  assert.ok(Math.abs(foamAdvanced - 1) < 1e-12);
});

test("Flow owns style/combo truth independently from physical speed tiers", () => {
  const score = new ScoreSystem();
  score.addFlow(0.2);
  const initial = score.flow;
  score.updateRide(TUNING.flowEventHold, 90, 0, 1, 1);
  assert.equal(score.flow, initial, "a strong line protects a recent skill event");
  score.updateRide(1, 90, 0, 1, 1);
  assert.ok(score.flow < initial, "passive riding cannot manufacture Flow");
  const ridingFlow = score.flow;
  score.updateRide(1, 40, 0, 0, 1);
  assert.ok(score.flow < ridingFlow, "stalling drains Flow");
  const stalledFlow = score.flow;
  score.registerDirectionChange({ speed: 110, turnForce: 0.8, switchStance: true });
  assert.ok(score.flow > stalledFlow, "a committed switch reversal builds Flow");
  assert.equal(score.combo, 1 + score.flow * 3.2);

  const first = score.registerLanding({ turns: 1, maxHeight: 24, quality: "clean" });
  const afterVariety = score.flow;
  const repeated = score.registerLanding({ turns: 1, maxHeight: 24, quality: "clean" });
  assert.equal(first.decay, 1);
  assert.ok(repeated.decay < 1);
  assert.ok(score.flow < afterVariety, "repeating the exact trick drains style Flow");

  const simulation = beginRiding(BOARDS.mangoFish);
  simulation.player.speed = simulation.currentRideSpeedCap();
  simulation.score.addFlow(0.42);
  simulation.update(FIXED_STEP, {});
  assert.equal(simulation.player.speedTier, "BLASTING");
  assert.equal(simulation.player.flow, simulation.score.flow);
  assert.notEqual(simulation.player.speedTier, simulation.player.flow);
});

test("reset owns canonical condition, control mode, and signed-travel cleanup", () => {
  const simulation = beginRiding(BOARDS.mangoFish);
  Object.assign(simulation.player, {
    travelDirection: -1,
    switchStance: true,
    reversalCount: 3,
    worldTravel: -220,
  });
  simulation.reset({ condition: "stormbreak", controlMode: "advanced" });
  assert.equal(simulation.condition, CONDITIONS.stormbreak);
  assert.equal(simulation.controlMode, "advanced");
  assert.equal(simulation.player.travelDirection, 1);
  assert.equal(simulation.player.switchStance, false);
  assert.equal(simulation.player.reversalCount, 0);
  assert.equal(simulation.player.worldTravel, 0);
  assert.equal(simulation.worldTravel, 0);
  assert.equal(simulation.wave.worldTravel, 0);

  simulation.reset();
  assert.equal(simulation.condition, CONDITIONS.stormbreak, "ordinary reset preserves the selected condition");
  simulation.reset({ condition: { id: "twilightGlass" }, controlMode: "invalid" });
  assert.equal(simulation.condition, CONDITIONS.twilightGlass);
  assert.equal(simulation.controlMode, "simple");
});

test("condition installs its canonical wave profile before reset-derived geometry", () => {
  const simulation = new SurfSimulation({ seed: 0x10203040 });
  assert.equal(simulation.condition, CONDITIONS.goldenCoast);
  assert.equal(simulation.wave.profileId, "classic");
  assert.equal(simulation.wave.profile, WAVE_STYLES.classic);

  simulation.wave.time = 11;
  simulation.wave.travel = 900;
  simulation.wave.curlX = 166;
  simulation.reset({ condition: "twilightGlass", seed: 0x54574c47 });
  assert.equal(simulation.condition, CONDITIONS.twilightGlass);
  assert.equal(simulation.wave.profileId, "heroBarrel");
  assert.equal(simulation.wave.profile, WAVE_STYLES.heroBarrel);
  assert.equal(simulation.wave.seed, 0x54574c47);
  assert.equal(simulation.wave.time, 0);
  assert.equal(simulation.wave.travel, 0);
  assert.equal(simulation.wave.curlX, -66);
  assert.equal(simulation.wave.contactX(), 30, "the visible travelling edge starts at the left screen margin");
  assert.equal(
    simulation._worldPreviousPlayerY,
    simulation.wave.ridingY(simulation.player.x, simulation.player.face),
    "the first collision/world sample uses the selected profile",
  );
  const targetFace = simulation.wave.powerFaceAt(simulation.player.x);
  const targetY = simulation.wave.ridingY(simulation.player.x, targetFace);
  assert.ok(targetFace >= 0.53 && targetFace <= 0.66);
  assert.ok(targetY >= 132 && targetY <= 154);
  assert.equal(simulation.player.face, targetFace, "Twilight entry starts board-first on the visible power line");
  assert.equal(simulation.player.previousFace, targetFace);

  simulation.reset({ condition: "stormbreak" });
  assert.equal(simulation.condition, CONDITIONS.stormbreak);
  assert.equal(simulation.wave.profileId, "classic");
  assert.equal(simulation.wave.profile, WAVE_STYLES.classic);
  simulation.reset({ condition: "goldenCoast" });
  assert.equal(simulation.wave.profileId, "classic");
});

test("Twilight entry remains aligned to the hero barrel power line through handoff", () => {
  const simulation = new SurfSimulation({ seed: 0x54574c47 });
  simulation.tutorialEnabled = false;
  simulation.reset({ condition: "twilightGlass" });
  simulation.begin();

  for (let step = 0; step < 120 && simulation.player.state === "entry"; step += 1) {
    simulation.update(FIXED_STEP, {});
    const targetFace = simulation.wave.powerFaceAt(simulation.player.x);
    assert.ok(
      Math.abs(simulation.player.face - targetFace) < 1e-12,
      `entry face ${simulation.player.face} drifted from hero power line ${targetFace}`,
    );
  }

  assert.equal(simulation.player.state, "riding");
  assert.equal(simulation.player.x, 212);
  assert.equal(simulation.player.face, simulation.wave.powerFaceAt(simulation.player.x));
});

test("wave profiles preserve classic travel bounds and frame Twilight's authored face", () => {
  const simulation = new SurfSimulation({ seed: 0x54574c47 });
  simulation.reset({ condition: "twilightGlass" });
  simulation.player.x = 999;
  simulation.constrainRidingX();
  assert.equal(simulation.player.x, 338);
  simulation.player.x = -999;
  simulation.constrainRidingX();
  assert.equal(simulation.player.x, 72);

  simulation.reset({ condition: "goldenCoast" });
  simulation.player.x = 999;
  simulation.constrainRidingX();
  assert.equal(simulation.player.x, 338);
  simulation.player.x = -999;
  simulation.constrainRidingX();
  assert.equal(simulation.player.x, 76);
});

test("Twilight aerial collision uses the visible hero lip contact", () => {
  const simulation = beginRiding(BOARDS.mangoFish, { condition: CONDITIONS.twilightGlass });
  const player = simulation.player;
  simulation.wave.curlX = -100;
  player.state = "lip";
  player.stateTime = 0.1;
  player.face = 0.02;
  player.faceVelocity = -0.85;
  player.speed = 96;
  player.charge = 0.8;
  simulation.update(FIXED_STEP, {});
  assert.equal(player.state, "airborne");

  player.airX = 400;
  player.previousAirX = 400;
  player.airY = 20;
  player.previousAirY = 20;
  player.airVY = -20;
  simulation.update(FIXED_STEP, {});
  assert.equal(player.airX, 352, "Twilight aerials stay inside the expanded side-scroller landing window");

  simulation.wave.curlX = 100;
  assert.equal(simulation.wave.contactX(), 196);
  player.airX = 150;
  player.previousAirX = 150;
  player.airY = 20;
  player.previousAirY = 20;
  player.airVY = -20;
  simulation.update(FIXED_STEP, {});

  assert.equal(player.state, "airborne", "the hero lip cannot eat an aerial during opening grace");

  simulation.wave.time = TUNING.curlGrace + 0.1;
  player.airX = 150;
  player.previousAirX = 150;
  player.airY = 20;
  player.previousAirY = 20;
  player.airVY = -20;
  simulation.update(FIXED_STEP, {});

  assert.equal(player.state, "wipeout");
  assert.equal(player.wipeoutCause, "air");
});

test("Twilight's forward hero lip still honors the full opening grace", () => {
  const simulation = new SurfSimulation({ seed: 0x54574c47 });
  simulation.tutorialEnabled = false;
  simulation.reset({ condition: "twilightGlass" });
  simulation.begin();
  simulation.player.state = "riding";
  simulation.player.x = simulation.wave.contactX() - 12;
  simulation.player.previousX = simulation.player.x;

  for (let step = 0; step < Math.floor((TUNING.curlGrace - 0.08) / FIXED_STEP); step += 1) {
    simulation.update(FIXED_STEP, { x: -1, y: 0 });
    simulation.consumeEvents(() => {});
    assert.notEqual(simulation.player.state, "wipeout");
    assert.equal(simulation.player.curlTimer, 0);
  }
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

  simulation.player.waveMomentum = 0;
  const landingSpeedCap = simulation.currentRideSpeedCap();
  simulation.player.speed = landingSpeedCap;
  forceContact(simulation, 0);
  simulation.update(FIXED_STEP, {});
  const landingEvents = collectEvents(simulation);
  const landing = landingEvents.find((event) => event.type === "land");
  assert.equal(landing?.payload.quality, "perfect");
  assert.equal(simulation.player.state, "landing");
  assert.equal(simulation.player.landingQuality, "perfect");
  assert.equal(simulation.player.speed, landingSpeedCap);
  assert.equal(simulation.player.landingCarryDuration, TUNING.perfectLandingCarry);
  assert.equal(simulation.player.landingCarryTimer, TUNING.perfectLandingCarry);
  assert.ok(simulation.score.total > preLandingTotal);
  assert.equal(simulation.score.total, simulation.score.bucketTotal());

  const carrySpeed = simulation.player.landingCarrySpeed;
  for (let step = 0; step < 12; step += 1) simulation.update(FIXED_STEP, {});
  assert.ok(simulation.player.landingCarryTimer > 0);
  assert.ok(simulation.player.speed >= carrySpeed * 0.94);
  for (let step = 0; step < 40; step += 1) simulation.update(FIXED_STEP, {});
  assert.equal(simulation.player.state, "riding");
  assert.equal(simulation.aerialSession, null);
});

test("the opposite surface tangent is a valid switch landing with signed carry and bonus", () => {
  const simulation = prepareLaunch(BOARDS.mangoFish);
  const player = simulation.player;
  collectEvents(simulation);
  forceContact(simulation, Math.PI, { airVX: 26 });
  simulation.update(FIXED_STEP, {});
  const events = collectEvents(simulation);
  const landing = events.find((event) => event.type === "land");

  assert.equal(player.state, "landing");
  assert.equal(player.takeoffDirection, 1);
  assert.equal(player.landingDirection, -1);
  assert.equal(player.travelDirection, -1);
  assert.equal(player.switchStance, true);
  assert.ok(player.travelVelocity < 0);
  assert.equal(simulation.aerialSession.manifest.switchLanding, true);
  assert.match(simulation.aerialSession.manifest.repetitionSignature, /switch-land/);
  assert.equal(landing.payload.switch, true);
  assert.equal(landing.payload.landingDirection, -1);
  assert.ok(simulation.score.breakdown.air >= 135, "switch-landing bonus is banked");
});

test("a misaligned landing wipes out, respawns, and reset provides a clean restart", () => {
  const simulation = prepareLaunch(BOARDS.moonLog);
  assert.ok(simulation.player.provisionalScore > 0);
  simulation.player.waveMomentum = 1;
  simulation.player.lateralVelocity = 36;
  collectEvents(simulation);
  forceContact(simulation, Math.PI / 2);

  for (let step = 0; step < 24 && simulation.player.state !== "wipeout"; step += 1) {
    simulation.update(FIXED_STEP, {});
  }
  const wipeoutEvents = collectEvents(simulation);
  assert.equal(simulation.player.state, "wipeout");
  assert.equal(simulation.wipeouts, 1);
  assert.equal(simulation.player.provisionalScore, 0);
  assert.equal(simulation.player.waveMomentum, 0);
  assert.equal(simulation.player.lateralVelocity, 0);
  assert.ok(wipeoutEvents.some((event) => event.type === "wipeout"));

  for (let step = 0; step < 140 && simulation.player.state === "wipeout"; step += 1) {
    simulation.update(FIXED_STEP, {});
  }
  const respawnEvents = collectEvents(simulation);
  assert.equal(simulation.player.state, "entry");
  assert.equal(simulation.player.waveMomentum, 0);
  assert.equal(simulation.player.lateralVelocity, 12);
  assert.equal(simulation.player.travelVelocity, 12);
  assert.equal(simulation.player.travelDirection, 1);
  assert.ok(respawnEvents.some((event) => event.type === "respawn"));

  simulation.reset({ board: BOARDS.foamPuff, assists: { steering: true, landing: true }, mode: "scoreAttack" });
  assert.equal(simulation.started, false);
  assert.equal(simulation.complete, false);
  assert.equal(simulation.elapsed, 0);
  assert.equal(simulation.activeTime, 0);
  assert.equal(simulation.rideDistance, 0);
  assert.equal(simulation.timeRemaining, TUNING.runDuration);
  assert.equal(simulation.wipeouts, 0);
  assert.equal(simulation.score.total, 0);
  assert.equal(simulation.player.state, "entry");
  assert.equal(simulation.aerialSession, null);
  assert.equal(simulation.player.waveMomentum, 0);
  assert.equal(simulation.player.lateralVelocity, 12);
  assert.equal(simulation.player.travelVelocity, 12);
  assert.equal(simulation.board.id, "foamPuff");
  simulation.begin();
  simulation.update(FIXED_STEP, { edgePressed: true });
  assert.ok(simulation.elapsed > 0, "the restarted run advances normally");
});

test("Endless Surf replaces the clock with deterministic escalating sets and capped stakes", () => {
  const simulation = beginRiding(BOARDS.mangoFish, { mode: "endless" });
  assert.equal(simulation.modeId, "endless");
  assert.equal(simulation.timeRemaining, Number.POSITIVE_INFINITY);
  assert.equal(simulation.endlessSet, 1);
  const openingThreat = simulation.endlessThreatScale;
  const openingMultiplier = simulation.currentMultiplier();

  simulation.activeTime = TUNING.endlessSetDuration - FIXED_STEP / 2;
  simulation.update(FIXED_STEP, {});
  const setEvents = collectEvents(simulation);
  assert.equal(simulation.endlessSet, 2);
  assert.ok(simulation.endlessThreatScale > openingThreat);
  assert.ok(simulation.currentMultiplier() > openingMultiplier);
  assert.equal(setEvents.filter((event) => event.type === "endlessSet").length, 1);
  assert.ok(setEvents.some((event) => event.type === "callout" && event.payload.text === "SET 2"));
  assert.equal(simulation.complete, false, "survival is not ended by a hidden timer");

  simulation.activeTime = TUNING.endlessSetDuration * 100;
  simulation.update(FIXED_STEP, {});
  assert.equal(simulation.endlessSet, TUNING.endlessMaxSet);
  assert.ok(simulation.currentMultiplier() <= 7.5);
});

test("Score Attack preserves the 78-second finish while Endless ends on the third wipeout", () => {
  const attack = beginRiding(BOARDS.foamPuff, { mode: "scoreAttack" });
  assert.equal(attack.timeRemaining, TUNING.runDuration);
  attack.timeRemaining = FIXED_STEP / 2;
  attack.update(FIXED_STEP, {});
  assert.equal(attack.complete, true);
  assert.ok(collectEvents(attack).some((event) => event.type === "complete" && event.payload.reason === "time"));

  const endless = beginRiding(BOARDS.foamPuff, { mode: "endless" });
  endless.elapsed = 1;
  endless.activeTime = 1;
  endless.wipeouts = TUNING.maxWipeouts - 1;
  endless.triggerWipeout("FOAM SNACK!", "landing");
  endless.player.stateTime = 1.08;
  endless.update(FIXED_STEP, {});
  const complete = collectEvents(endless).find((event) => event.type === "complete");
  assert.equal(endless.complete, true);
  assert.equal(complete.payload.reason, "wipeouts");
  assert.equal(complete.payload.mode, "endless");
  assert.ok(complete.payload.duration >= 1);
  assert.ok(complete.payload.distance >= 0);
  assert.equal(complete.payload.set, endless.endlessSet);
});

test("720-degree rotation is named from the actual accumulated rotation", () => {
  const manifest = {
    sequence: [],
    rotationAccumulated: TAU * 2,
  };
  assert.equal(formatTrickName(manifest), "720 AIR SPIN");
  assert.equal(formatTrickName(manifest, { quality: "perfect" }), "PERFECT 720 AIR SPIN");
});

test("simulation-owned wildlife mounts, steers, and creates a deterministic dismount air", () => {
  const simulation = beginRiding(BOARDS.foamPuff);
  const player = simulation.player;
  const ridingY = simulation.wave.ridingY(player.x, player.face);
  simulation.world.forceWildlife("dolphin", {
    phase: "catchable",
    screenX: player.x,
    y: ridingY,
    speed: 0,
  });
  simulation.update(FIXED_STEP, { x: -1 });
  let events = collectEvents(simulation);
  assert.equal(player.animalMount, "dolphin");
  assert.equal(player.animalSpecialReady, true);
  assert.ok(events.some((event) => event.type === "dolphinMounted"));

  const mounted = simulation.world.wildlife.find((entity) => entity.kind === "dolphin");
  mounted.phaseTime = 4.8;
  simulation.update(FIXED_STEP, { x: -1 });
  events = collectEvents(simulation);
  assert.equal(player.animalMount, "");
  assert.equal(player.state, "airborne");
  assert.ok(player.airVY <= -186);
  assert.equal(simulation.aerialSession.manifest.launchData.animalAssist, "dolphin");
  assert.ok(events.some((event) => event.type === "animalDismount"));
});

test("Star Foam saves one shark collision and Moon Pop is consumed by the next launch", () => {
  const protectedRide = beginRiding(BOARDS.mangoFish);
  const protectedPlayer = protectedRide.player;
  protectedRide.world.activateBonus("starFoam");
  protectedRide.world.forceWildlife("shark", {
    phase: "crossing",
    screenX: protectedPlayer.x,
    y: protectedRide.wave.ridingY(protectedPlayer.x, protectedPlayer.face),
    speed: 0,
  });
  protectedRide.update(FIXED_STEP, {});
  const protectedEvents = collectEvents(protectedRide);
  assert.notEqual(protectedPlayer.state, "wipeout");
  assert.equal(protectedRide.world.getModifiers().protectsFlow, false);
  assert.ok(protectedEvents.some((event) => event.type === "starFoamSave"));

  const plain = beginRiding(BOARDS.mangoFish);
  const boosted = beginRiding(BOARDS.mangoFish);
  for (const simulation of [plain, boosted]) {
    simulation.player.state = "lip";
    simulation.player.face = 0.02;
    simulation.player.faceVelocity = -0.85;
    simulation.player.speed = 104;
    simulation.player.charge = 0.7;
  }
  boosted.world.activateBonus("moonPop");
  plain.update(FIXED_STEP, {});
  boosted.update(FIXED_STEP, {});
  collectEvents(plain);
  const boostedEvents = collectEvents(boosted);
  assert.equal(plain.player.state, "airborne");
  assert.equal(boosted.player.state, "airborne");
  assert.ok(boosted.player.airVY < plain.player.airVY * 1.1, "Moon Pop visibly enlarges the launch");
  assert.equal(boosted.world.getModifiers().moonPopCharges, 0);
  assert.ok(boostedEvents.some((event) => event.type === "powerupConsumed"));
});

test("Feather Thread, wake-race wins, and foam gates feed deterministic style scoring", () => {
  const featherRide = beginRiding(BOARDS.mangoFish);
  featherRide.world.forceFeatherThread({
    screenX: featherRide.player.x,
    y: featherRide.wave.ridingY(featherRide.player.x, featherRide.player.face),
    speed: 0,
  });
  const featherScore = featherRide.score.total;
  featherRide.update(FIXED_STEP, {});
  const featherEvents = collectEvents(featherRide);
  assert.ok(featherEvents.some((event) => event.type === "featherThread"));
  assert.ok(featherRide.score.total > featherScore);
  assert.equal(featherRide.highlights.nearMisses, 1);

  const raceRide = beginRiding(BOARDS.mangoFish);
  raceRide.world.forceRace("speedboat", { phase: "racing", screenX: 184, y: 84 });
  assert.equal(raceRide.world.completeRace(true, "testFinish"), true);
  const raceScore = raceRide.score.total;
  raceRide.update(FIXED_STEP, {});
  const raceEvents = collectEvents(raceRide);
  assert.ok(raceEvents.some((event) => event.type === "speedboatRaceWon"));
  assert.ok(raceRide.score.total > raceScore);

  const gateRide = beginRiding(BOARDS.foamPuff);
  const gateY = gateRide.wave.ridingY(gateRide.player.x, gateRide.player.face);
  gateRide.world.forceFoamGates("dolphin", {
    count: 1,
    screenX: gateRide.player.x,
    y: gateY + 10,
    radius: 18,
  });
  const gateScore = gateRide.score.total;
  gateRide.update(FIXED_STEP, {});
  const gateEvents = collectEvents(gateRide);
  assert.ok(gateEvents.some((event) => event.type === "foamGateCleared"));
  assert.ok(gateEvents.some((event) => event.type === "foamGateSeriesCompleted"));
  assert.ok(gateRide.score.total > gateScore);
});

test("long seeded randomized play remains finite, bounded, and restartable", () => {
  const random = seededRandom(0x5eedcafe);
  const boardIds = Object.keys(BOARDS);
  let boardIndex = 0;
  const simulation = new SurfSimulation({ seed: 0x5eedcafe, mode: "scoreAttack" });
  simulation.tutorialEnabled = false;
  simulation.reset({ board: BOARDS[boardIds[boardIndex]], mode: "scoreAttack" });
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
    assert.ok(simulation.player.waveMomentum >= 0 && simulation.player.waveMomentum <= 1);
    assert.ok(Math.abs(simulation.player.lateralVelocity) <= TUNING.sideScrollMaxSpeed);
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
