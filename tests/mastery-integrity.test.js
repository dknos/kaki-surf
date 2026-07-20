import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, FIXED_STEP } from "../js/config.js";
import { SurfSimulation } from "../js/simulation.js";
import { GameplayWave } from "../js/wave.js";

function beginRiding({ curlX = -1_000 } = {}) {
  const simulation = new SurfSimulation({ seed: 0x4b414b49 });
  simulation.tutorialEnabled = false;
  simulation.reset({ board: BOARDS.mangoFish, controlMode: "advanced" });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "riding",
    stateTime: 1,
    x: 260,
    face: 0.4,
  });
  simulation.wave.curlX = curlX;
  simulation.consumeEvents(() => {});
  return simulation;
}

function runFor(simulation, seconds, inputForStep = () => ({})) {
  const metrics = { pumps: 0, carves: 0, firstWipeout: 0, wipeoutCause: "" };
  const steps = Math.round(seconds / FIXED_STEP);
  for (let step = 0; step < steps && !simulation.complete; step += 1) {
    simulation.update(FIXED_STEP, inputForStep(step, simulation.player));
    simulation.consumeEvents((event) => {
      if (event.type === "pump") metrics.pumps += 1;
      if (event.type === "callout"
        && (event.payload.text === "HIGH LINE" || event.payload.text === "POWER CARVE")) {
        metrics.carves += 1;
      }
      if (event.type === "wipeout" && !metrics.firstWipeout) {
        metrics.firstWipeout = simulation.elapsed;
        metrics.wipeoutCause = event.payload.cause;
      }
    });
    if (metrics.firstWipeout) break;
  }
  return metrics;
}

function createArcController({ pump = false } = {}) {
  let phase = "drop";
  let held = false;
  return (_step, player) => {
    if (phase === "drop" && player.face >= 0.56) phase = "rise";
    if (phase === "rise" && player.face <= 0.34) {
      phase = "drop";
      held = false;
    }

    if (phase === "drop") {
      const input = { y: 1 };
      if (pump) {
        input.edge = true;
        input.edgePressed = !held;
        held = true;
      }
      return input;
    }

    const input = { y: -1 };
    if (!pump) return input;
    if (held && player.faceVelocity <= -0.18 && player.face <= 0.54) {
      input.edgeReleased = true;
      held = false;
    } else {
      input.edge = held;
    }
    return input;
  };
}

function gap(simulation) {
  return simulation.player.x - simulation.wave.curlX;
}

function assertFiniteState(simulation) {
  for (const [name, value] of Object.entries(simulation.player)) {
    if (typeof value === "number") assert.ok(Number.isFinite(value), `player.${name} is finite`);
  }
  for (const [name, value] of Object.entries(simulation.wave)) {
    if (typeof value === "number") assert.ok(Number.isFinite(value), `wave.${name} is finite`);
  }
}

test("thirty seconds of idle riding stays at zero Flow and x1", () => {
  const simulation = beginRiding();
  const metrics = runFor(simulation, 30);

  assert.equal(metrics.pumps, 0);
  assert.equal(simulation.score.flow, 0);
  assert.equal(simulation.score.combo, 1);
  assert.equal(simulation.player.skillMomentum, 0);
  assertFiniteState(simulation);
});

test("five-hertz action spam cannot bank charge, pump, or build Flow", () => {
  const simulation = beginRiding();
  const metrics = runFor(simulation, 30, (step) => {
    const phase = step % 24;
    return {
      edge: phase < 12,
      edgePressed: phase === 0,
      edgeReleased: phase === 12,
    };
  });

  assert.equal(metrics.pumps, 0);
  assert.equal(simulation.score.flow, 0);
  assert.equal(simulation.score.combo, 1);
  assert.equal(simulation.player.skillMomentum, 0);
  assert.equal(simulation.player.charge, 0);
});

test("rapid carve flicks score nothing while complete alternating arcs score", () => {
  const spam = beginRiding();
  const spamMetrics = runFor(spam, 15, (step) => ({ y: step % 12 < 6 ? 1 : -1 }));
  assert.equal(spamMetrics.carves, 0);
  assert.equal(spam.score.breakdown.carves, 0);
  assert.equal(spam.score.flow, 0);
  assert.equal(spam.player.skillMomentum, 0);

  const arcs = beginRiding();
  const arcMetrics = runFor(arcs, 15, createArcController());
  assert.ok(arcMetrics.carves >= 4, `expected full arcs, saw ${arcMetrics.carves}`);
  assert.ok(arcs.score.breakdown.carves > 0);
  assert.ok(arcs.score.flow > spam.score.flow);
  assert.ok(arcs.player.skillMomentum > spam.player.skillMomentum);
});

test("rhythmic carved pumps outperform action spam and remain finite", () => {
  const spam = beginRiding();
  const spamMetrics = runFor(spam, 20, (step) => {
    const phase = step % 24;
    return {
      edge: phase < 12,
      edgePressed: phase === 0,
      edgeReleased: phase === 12,
    };
  });

  const rhythm = beginRiding();
  const rhythmMetrics = runFor(rhythm, 20, createArcController({ pump: true }));
  assert.equal(spamMetrics.pumps, 0);
  assert.ok(rhythmMetrics.pumps >= 8, `expected rhythmic pumps, saw ${rhythmMetrics.pumps}`);
  assert.ok(rhythm.score.flow > spam.score.flow);
  assert.ok(rhythm.player.skillMomentum > spam.player.skillMomentum);
  assert.ok(rhythm.score.total > spam.score.total);
  assertFiniteState(rhythm);
});

test("the opening grace cannot catch even a rider reversing toward the curl", () => {
  const simulation = beginRiding({ curlX: 48 });
  const initialCurlX = simulation.wave.curlX;
  const metrics = runFor(simulation, 8, () => ({ x: -1 }));

  assert.equal(metrics.firstWipeout, 0);
  assert.equal(simulation.wipeouts, 0);
  assert.ok(simulation.wave.curlX >= initialCurlX);
  assert.ok(simulation.wave.curlX - initialCurlX < 1e-6);
  assert.ok(gap(simulation) > 13);
});

test("an idle rider is caught in the intended late-run window", () => {
  const simulation = beginRiding({ curlX: 48 });
  const metrics = runFor(simulation, 70);

  assert.equal(metrics.wipeoutCause, "curl");
  assert.ok(
    metrics.firstWipeout >= 50 && metrics.firstWipeout <= 70,
    `idle catch was ${metrics.firstWipeout.toFixed(3)}s`,
  );

  const recovery = runFor(simulation, 3);
  assert.equal(recovery.firstWipeout, 0, "entry recovery cannot cascade into an immediate re-catch");
  assert.equal(simulation.wipeouts, 1);
});

test("full arcs and timed pumps preserve substantially more threat gap", () => {
  const idle = beginRiding({ curlX: 48 });
  runFor(idle, 58);

  const skilled = beginRiding({ curlX: 48 });
  const metrics = runFor(skilled, 58, createArcController({ pump: true }));

  assert.equal(idle.wipeouts, 0);
  assert.equal(skilled.wipeouts, 0);
  assert.ok(metrics.pumps > 20);
  assert.ok(gap(skilled) > gap(idle) + 80, `${gap(skilled)} vs ${gap(idle)}`);
});

test("curl advance stays monotonic through signed travel reversals", () => {
  const wave = new GameplayWave(0x4b414b49);
  const context = { playerX: 260, speed: 110, skillMomentum: 0.4, active: true };
  const initialCurlX = wave.curlX;
  let previousCurlX = wave.curlX;
  for (let step = 0; step < 3_600; step += 1) {
    const direction = step < 1_800 ? 1 : -1;
    wave.update(FIXED_STEP, 110, 2.35, 110 * direction, context);
    assert.ok(wave.curlX >= previousCurlX, `${wave.curlX} reversed from ${previousCurlX}`);
    previousCurlX = wave.curlX;
  }

  assert.ok(Math.abs(wave.worldTravel) < 1e-8);
  assert.ok(wave.travel > 3_000);
  assert.ok(wave.curlX > initialCurlX);
});
