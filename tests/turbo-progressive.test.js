import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, FIXED_STEP, TUNING } from "../js/config.js";
import {
  progressiveTurboAccelerationMultiplier,
  progressiveTurboCapMultiplier,
  SurfSimulation,
  turboTierForProgress,
} from "../js/simulation.js";

function beginRiding({ turbo = 1, board = BOARDS.mangoFish, seed = 0x54555242 } = {}) {
  const simulation = new SurfSimulation({ seed, mode: "endless", controlMode: "advanced" });
  simulation.reset({ board, mode: "endless", controlMode: "advanced", tutorialEnabled: false });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "riding",
    stateTime: 1,
    x: 260,
    face: 0.48,
    speed: 72,
    turbo,
  });
  simulation.wave.curlX = -1_000;
  simulation.consumeEvents(() => {});
  return simulation;
}

function consume(simulation) {
  const events = [];
  simulation.consumeEvents((event) => events.push(event));
  return events;
}

function burn(simulation, maximumSteps = 600) {
  const events = [];
  const trace = [];
  for (let step = 0; step < maximumSteps; step += 1) {
    simulation.update(FIXED_STEP, { turbo: true, turboPressed: step === 0 });
    trace.push({
      turbo: simulation.player.turbo,
      spent: simulation.player.turboBurnSpent,
      progress: simulation.player.turboBurnProgress,
      tier: simulation.player.turboTier,
      speed: simulation.player.speed,
      cap: simulation.currentRideSpeedCap(),
      cooking: simulation.player.turboCookingTimer,
    });
    simulation.consumeEvents((event) => events.push(event));
    if (simulation.player.turbo <= 0) return { trace, events, duration: (step + 1) * FIXED_STEP };
  }
  throw new Error("Turbo burn did not empty within the bounded probe");
}

test("progressive Turbo tiers expose continuous authored acceleration and cap envelopes", () => {
  const checkpoints = [0, 0.2, 0.55, 0.9, 1];
  assert.deepEqual(checkpoints.map((progress) => turboTierForProgress(progress)), [
    "ignition",
    "surge",
    "redline",
    "redline",
    "redline",
  ]);
  assert.deepEqual(
    checkpoints.map((progress) => Number(progressiveTurboCapMultiplier(progress).toFixed(2))),
    [1.1, 1.14, 1.26, 1.42, 1.44],
  );
  assert.deepEqual(
    checkpoints.map((progress) => Number(progressiveTurboAccelerationMultiplier(progress).toFixed(2))),
    [1, 1.05, 1.22, 1.42, 1.5],
  );
  assert.equal(progressiveTurboCapMultiplier(1, true), 1.5);

  let previousCap = 0;
  let previousAcceleration = 0;
  for (let step = 0; step <= 100; step += 1) {
    const progress = step / 100;
    const cap = progressiveTurboCapMultiplier(progress);
    const acceleration = progressiveTurboAccelerationMultiplier(progress);
    assert.ok(cap >= previousCap, `cap regressed at ${progress}`);
    assert.ok(acceleration >= previousAcceleration, `acceleration regressed at ${progress}`);
    previousCap = cap;
    previousAcceleration = acceleration;
  }
});

test("continuous spend is monotonic and a longer uninterrupted burn earns more speed", () => {
  const simulation = beginRiding();
  const { trace } = burn(simulation);
  for (let index = 1; index < trace.length; index += 1) {
    assert.ok(trace[index].spent >= trace[index - 1].spent);
    assert.ok(trace[index].progress >= trace[index - 1].progress);
  }
  assert.ok(trace[180].cap > trace[30].cap * 1.12);
  assert.ok(trace[180].speed > trace[30].speed + 50);
});

test("short taps and partial tanks cannot accumulate or trigger Cooking", () => {
  const tapped = beginRiding();
  const events = [];
  for (let cycle = 0; cycle < 8; cycle += 1) {
    for (let step = 0; step < 6; step += 1) {
      tapped.update(FIXED_STEP, { turbo: true, turboPressed: step === 0 });
      tapped.consumeEvents((event) => events.push(event));
    }
    for (let step = 0; step < 24; step += 1) {
      tapped.update(FIXED_STEP, { turbo: false, turboReleased: step === 0 });
      tapped.consumeEvents((event) => events.push(event));
    }
    assert.equal(tapped.player.turboBurnProgress, 0);
  }
  assert.equal(events.filter((event) => event.type === "turboFullBurn").length, 0);

  const rapidTaps = beginRiding();
  const rapidEvents = [];
  for (let cycle = 0; cycle < 64; cycle += 1) {
    for (let step = 0; step < 3; step += 1) {
      rapidTaps.update(FIXED_STEP, { turbo: true, turboPressed: step === 0 });
      rapidTaps.consumeEvents((event) => rapidEvents.push(event));
    }
    for (let step = 0; step < 3; step += 1) {
      rapidTaps.update(FIXED_STEP, { turbo: false, turboReleased: step === 0 });
      rapidTaps.consumeEvents((event) => rapidEvents.push(event));
    }
  }
  assert.equal(
    rapidEvents.filter((event) => event.type === "turboFullBurn").length,
    0,
    "repeated sub-grace taps never qualify as one continuous full burn",
  );

  const partial = beginRiding({ turbo: 0.82 });
  const result = burn(partial);
  assert.equal(result.events.filter((event) => event.type === "turboFullBurn").length, 0);
  assert.equal(partial.player.turboCookingTimer, 0);
});

test("one qualified full tank emits one full burn and Cooking expires in its bounded window", () => {
  const simulation = beginRiding();
  const result = burn(simulation);
  const fullBurnEvents = result.events.filter((event) => event.type === "turboFullBurn");
  assert.equal(fullBurnEvents.length, 1);
  assert.ok(result.duration >= 2.77 && result.duration <= 2.79, result.duration);
  assert.equal(simulation.player.turboTier, "cooking");
  assert.ok(simulation.player.turboCookingTimer > 0.74);
  assert.ok(simulation.currentRideSpeedCap() <= simulation.baseRideSpeedCap() * 1.5 + 1e-9);

  const timerAtStart = simulation.player.turboCookingTimer;
  let elapsed = 0;
  while (simulation.player.turboCookingTimer > 0 && elapsed < 2) {
    simulation.update(FIXED_STEP, {});
    simulation.consumeEvents((event) => result.events.push(event));
    elapsed += FIXED_STEP;
  }
  assert.ok(elapsed >= timerAtStart && elapsed <= timerAtStart + FIXED_STEP + 1e-9);
  assert.equal(simulation.player.turboTier, "idle");
  assert.equal(result.events.filter((event) => event.type === "turboFullBurn").length, 1);
});

test("release grace tolerates one jitter gap but a meaningful release resets the burn", () => {
  const simulation = beginRiding();
  for (let step = 0; step < 80; step += 1) simulation.update(FIXED_STEP, { turbo: true });
  const before = simulation.player.turboBurnProgress;
  simulation.update(FIXED_STEP, { turboReleased: true });
  for (let step = 0; step < 8; step += 1) simulation.update(FIXED_STEP, {});
  simulation.update(FIXED_STEP, { turbo: true, turboPressed: true });
  assert.ok(simulation.player.turboBurnProgress > before, "sub-grace jitter preserves spent fuel");

  simulation.update(FIXED_STEP, { turboReleased: true });
  for (let step = 0; step < 24; step += 1) simulation.update(FIXED_STEP, {});
  assert.equal(simulation.player.turboBurnProgress, 0);
  assert.equal(simulation.player.turboTier, "idle");
});

test("wipeout cancels Cooking and refill cannot retrigger it without another qualified depletion", () => {
  const simulation = beginRiding();
  const result = burn(simulation);
  assert.ok(simulation.player.turboCookingTimer > 0);
  simulation.triggerWipeout("TEST", "test");
  assert.equal(simulation.player.turboCookingTimer, 0);
  assert.equal(simulation.player.turboTier, "idle");

  simulation.player.state = "riding";
  simulation.player.turbo = 0.2;
  simulation.refillTurboFromLanding({
    entries: [{ id: "frontRailGrab" }],
    rotationDegrees: 360,
    decay: 1,
  }, "perfect");
  const postRefillEvents = consume(simulation);
  assert.ok(postRefillEvents.some((event) => event.type === "turboRefill"));
  for (let step = 0; step < 80; step += 1) simulation.update(FIXED_STEP, { turbo: true });
  assert.equal(consume(simulation).filter((event) => event.type === "turboFullBurn").length, 0);
  assert.equal(result.events.filter((event) => event.type === "turboFullBurn").length, 1);
});

test("Cooking at the lip inherits maximum launch intensity without changing aerial tuning", () => {
  const simulation = beginRiding({ board: BOARDS.moonLog });
  Object.assign(simulation.player, {
    state: "lip",
    face: 0.02,
    faceVelocity: -0.82,
    slopeDrive: -0.82,
    speed: simulation.baseRideSpeedCap() * 1.44,
    charge: 1,
    waveMomentum: 1,
    turboActive: false,
    turboOverdrive: 0,
    turboCookingTimer: 0.5,
    turboTier: "cooking",
  });
  simulation.launch({ x: 0 });
  assert.equal(simulation.player.aerialTurboLaunch, 1);
  assert.equal(simulation.player.trickManifest.launchData.turboLaunch, 1);
});

test("full-burn runs are deterministic and maximum speed stays below the Cooking cap", () => {
  const probe = () => {
    const simulation = beginRiding({ seed: 0x1234abcd });
    const result = burn(simulation);
    return {
      duration: result.duration,
      events: result.events.map((event) => [event.type, event.payload]),
      trace: result.trace.map((sample) => [
        sample.turbo,
        sample.spent,
        sample.progress,
        sample.tier,
        sample.speed,
        sample.cap,
        sample.cooking,
      ]),
    };
  };
  const first = probe();
  const second = probe();
  assert.deepEqual(second, first);
  const maximumSpeed = Math.max(...first.trace.map((sample) => sample[4]));
  assert.ok(maximumSpeed <= TUNING.maxSpeed * BOARDS.mangoFish.maxSpeed * 1.5 + 1e-9);
});

test("the known-good no-Turbo replay remains identical", () => {
  const simulation = beginRiding();
  const frames = new Set([0, 30, 60, 120, 180, 240, 330, 360]);
  const actual = [];
  for (let frame = 0; frame <= 360; frame += 1) {
    if (frames.has(frame)) {
      actual.push([
        frame,
        Number(simulation.player.speed.toFixed(6)),
        Number(simulation.player.worldX.toFixed(6)),
        Number(simulation.camera.worldX.toFixed(6)),
        Number(simulation.camera.worldY.toFixed(6)),
      ]);
    }
    if (frame < 360) simulation.update(FIXED_STEP, { x: 1 });
    simulation.consumeEvents(() => {});
  }
  assert.deepEqual(actual, [
    [0, 72, 260, 0, 0],
    [30, 73.171018, 268.704922, 0, 0],
    [60, 74.006647, 279.382026, 0, 0],
    [120, 74.239666, 300.931433, 0.824777, 0],
    [180, 72.97303, 322.444951, 18.617149, 0],
    [240, 71.126249, 343.816854, 39.967739, 0],
    [330, 68.109511, 375.525023, 71.779418, 0],
    [360, 67.239509, 386.00119, 82.288771, 0],
  ]);
});
