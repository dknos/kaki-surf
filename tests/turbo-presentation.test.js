import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, FIXED_STEP, PALETTES } from "../js/config.js";
import {
  createRiderAnimationState,
  poseWithinSafetyBounds,
  resolveRiderPresentationPose,
  sampleTurboPose,
  updateRiderAnimation,
} from "../js/rider-animation.js";
import { SurfSimulation } from "../js/simulation.js";
import {
  createTurboPresentationState,
  drawTurboRiderEffects,
  drawTurboScreenEffects,
  drawTurboStageEffects,
  handleTurboPresentationEvent,
  resetTurboPresentationState,
  TURBO_EFFECT_LIMITS,
  turboPresentationSnapshot,
  updateTurboPresentation,
} from "../js/turbo-presentation.js";

function beginRiding(board = BOARDS.mangoFish) {
  const simulation = new SurfSimulation({ seed: 0x50524553, mode: "endless" });
  simulation.reset({ board, mode: "endless", tutorialEnabled: false });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "riding",
    stateTime: 1,
    x: 260,
    face: 0.48,
    speed: 120,
    turbo: 1,
  });
  simulation.wave.curlX = -1_000;
  simulation.consumeEvents(() => {});
  return simulation;
}

test("all progressive Turbo rider poses remain crisp and inside the rider-local safety box", () => {
  const signatures = [];
  for (const tier of ["ignition", "surge", "redline", "cooking"]) {
    const sample = sampleTurboPose(tier, tier === "ignition" ? 0.08 : 0.72);
    assert.ok(sample?.pose, tier);
    assert.equal(poseWithinSafetyBounds(sample.pose), true, tier);
    for (const value of poseNumbers(sample.pose)) assert.equal(Number.isInteger(value), true, tier);
    signatures.push(JSON.stringify(sample.pose));
  }
  assert.equal(new Set(signatures).size, 4, "every tier has a distinct silhouette");
  const release = sampleTurboPose("redline", 0.8, { releasing: true });
  assert.equal(release.id, "turboRelease");
  assert.equal(poseWithinSafetyBounds(release.pose), true);
});

test("carves, lip, tricks, landings, wobble, mounts, and compression override Turbo poses", () => {
  const blocked = [
    { state: "lip" },
    { state: "airborne", trickManifest: { trickPose: "frontRailGrab", poseProgress: 0.5, sequence: [] } },
    { state: "landing" },
    { state: "wobble" },
    { state: "riding", animalMount: "dolphin" },
    { state: "riding", compression: 0.8 },
    { state: "riding", faceVelocity: 0.6 },
    { state: "riding", maneuver: { id: "cutback" } },
    { state: "riding", tubeRide: { active: true } },
  ];
  for (const player of blocked) {
    const state = createRiderAnimationState();
    updateRiderAnimation(state, FIXED_STEP, {
      turboActive: true,
      turboTier: "redline",
      turboBurnProgress: 0.8,
      maneuver: { id: "" },
      tubeRide: { active: false },
      ...player,
    });
    const resolved = resolveRiderPresentationPose(state, {
      turboActive: true,
      turboTier: "redline",
      turboBurnProgress: 0.8,
      maneuver: { id: "" },
      tubeRide: { active: false },
      ...player,
    });
    assert.notEqual(resolved?.id, "turboRedline", JSON.stringify(player));
  }
});

test("Turbo release blends back to the correct regular or goofy base pose deterministically", () => {
  const run = (ridingStance) => {
    const state = createRiderAnimationState();
    const player = {
      state: "riding",
      ridingStance,
      turboActive: true,
      turboTier: "surge",
      turboBurnProgress: 0.4,
      maneuver: { id: "" },
      tubeRide: { active: false },
    };
    updateRiderAnimation(state, 0.1, player);
    player.turboActive = false;
    updateRiderAnimation(state, 0.11, player);
    const midpoint = resolveRiderPresentationPose(state, player);
    updateRiderAnimation(state, 0.12, player);
    const complete = resolveRiderPresentationPose(state, player);
    return { midpoint, complete };
  };
  const regular = run("regular");
  const goofy = run("goofy");
  assert.equal(regular.midpoint.id, "turboRelease");
  assert.equal(goofy.midpoint.id, "turboRelease");
  assert.notDeepEqual(regular.midpoint.pose, goofy.midpoint.pose);
  assert.equal(regular.complete, null);
  assert.equal(goofy.complete, null);
});

test("bounded Turbo pools never exceed their hard limits and Reduced Motion removes echoes and dashes", () => {
  const simulation = beginRiding();
  const state = createTurboPresentationState();
  for (let step = 0; step < 480; step += 1) {
    simulation.update(FIXED_STEP, { turbo: true });
    simulation.consumeEvents((event) => handleTurboPresentationEvent(state, event, simulation));
    updateTurboPresentation(state, FIXED_STEP, simulation, {});
  }
  const snapshot = turboPresentationSnapshot(state);
  assert.ok(snapshot.echoes <= TURBO_EFFECT_LIMITS.riderAfterimages);
  assert.ok(snapshot.dashes <= TURBO_EFFECT_LIMITS.speedDashes);
  assert.ok(snapshot.sparks <= TURBO_EFFECT_LIMITS.sparks);
  assert.ok(snapshot.rings <= TURBO_EFFECT_LIMITS.shockRings);

  resetTurboPresentationState(state);
  simulation.player.turbo = 1;
  simulation.player.turboActive = true;
  simulation.player.turboTier = "redline";
  simulation.player.turboBurnProgress = 0.8;
  for (let step = 0; step < 120; step += 1) {
    updateTurboPresentation(state, FIXED_STEP, simulation, { reducedMotion: true });
  }
  const reduced = turboPresentationSnapshot(state);
  assert.equal(reduced.echoes, 0);
  assert.equal(reduced.dashes, 0);
  assert.ok(reduced.sparks <= 16);
});

test("Turbo presentation observation and drawing cannot mutate simulation state", () => {
  const simulation = beginRiding(BOARDS.moonLog);
  simulation.player.turboActive = true;
  simulation.player.turboTier = "redline";
  simulation.player.turboBurnProgress = 0.78;
  const state = createTurboPresentationState();
  const before = simulationSnapshot(simulation);
  for (let step = 0; step < 30; step += 1) {
    updateTurboPresentation(state, FIXED_STEP, simulation, {});
  }
  const ctx = new ContextProbe();
  drawTurboStageEffects(ctx, state, simulation, PALETTES.standard, {});
  drawTurboRiderEffects(ctx, state, simulation, PALETTES.standard, {});
  drawTurboScreenEffects(ctx, state, simulation, PALETTES.standard, {});
  assert.deepEqual(simulationSnapshot(simulation), before);
});

test("every Turbo draw entry balances canvas state and leaks no transform, alpha, clip, or composite", () => {
  const simulation = beginRiding();
  simulation.player.turboActive = true;
  simulation.player.turboTier = "redline";
  simulation.player.turboBurnProgress = 0.84;
  const state = createTurboPresentationState();
  handleTurboPresentationEvent(state, { type: "turboStart" }, simulation);
  handleTurboPresentationEvent(state, { type: "turboFullBurn", payload: { duration: 0.75 } }, simulation);
  for (let step = 0; step < 20; step += 1) updateTurboPresentation(state, FIXED_STEP, simulation, {});
  const ctx = new ContextProbe();
  ctx.globalAlpha = 0.73;
  ctx.globalCompositeOperation = "source-over";
  ctx.transform = "sentinel";
  ctx.clipState = "unclipped";
  const expected = ctx.snapshot();

  drawTurboStageEffects(ctx, state, simulation, PALETTES.standard, {});
  drawTurboRiderEffects(ctx, state, simulation, PALETTES.standard, {});
  drawTurboScreenEffects(ctx, state, simulation, PALETTES.standard, {});

  assert.equal(ctx.depth, 0);
  assert.deepEqual(ctx.snapshot(), expected);
  assert.ok(ctx.drawCalls > 0);
});

test("Reduced Flash substitutes gold outlines for full-burn white rings", () => {
  const simulation = beginRiding();
  const state = createTurboPresentationState();
  handleTurboPresentationEvent(state, { type: "turboFullBurn", payload: { duration: 0.75 } }, simulation);
  const normal = new ContextProbe();
  drawTurboStageEffects(normal, state, simulation, PALETTES.standard, { reducedFlash: false });
  const reduced = new ContextProbe();
  drawTurboStageEffects(reduced, state, simulation, PALETTES.standard, { reducedFlash: true });
  assert.ok(normal.styles.has(PALETTES.standard.white));
  assert.equal(reduced.styles.has(PALETTES.standard.white), false);
  assert.ok(reduced.styles.has(PALETTES.standard.gold));
});

function simulationSnapshot(simulation) {
  const player = simulation.player;
  return {
    state: player.state,
    position: [player.worldX, player.face, player.airY],
    velocity: [player.speed, player.airVX, player.airVY, player.angularVelocity],
    turbo: [player.turbo, player.turboActive, player.turboBurnSpent, player.turboBurnProgress, player.turboCookingTimer],
    camera: [simulation.camera.worldX, simulation.camera.worldY],
    wave: [simulation.wave.time, simulation.wave.worldTravel, simulation.wave.curlX],
    score: [simulation.score.total, simulation.score.combo],
  };
}

function poseNumbers(pose) {
  return [
    pose.crouch,
    pose.stretch,
    pose.lean,
    pose.float,
    pose.headX,
    pose.headY,
    ...pose.leftPaw,
    ...pose.rightPaw,
    pose.legSpread,
    pose.squash,
    pose.tailX,
    pose.tailY,
  ];
}

class ContextProbe {
  constructor() {
    this.depth = 0;
    this.stack = [];
    this.globalAlpha = 1;
    this.globalCompositeOperation = "source-over";
    this.fillStyle = "#000";
    this.transform = "identity";
    this.clipState = "unclipped";
    this.drawCalls = 0;
    this.styles = new Set();
  }

  snapshot() {
    return {
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      fillStyle: this.fillStyle,
      transform: this.transform,
      clipState: this.clipState,
    };
  }

  save() {
    this.stack.push(this.snapshot());
    this.depth += 1;
  }

  restore() {
    const saved = this.stack.pop();
    assert.ok(saved, "restore without matching save");
    Object.assign(this, saved);
    this.depth -= 1;
  }

  setTransform(...values) { this.transform = `set:${values.join(",")}`; }
  translate(x, y) { this.transform += `:t${x},${y}`; }
  scale(x, y) { this.transform += `:s${x},${y}`; }
  rotate(value) { this.transform += `:r${value}`; }
  fillRect() {
    this.drawCalls += 1;
    this.styles.add(this.fillStyle);
  }
}
