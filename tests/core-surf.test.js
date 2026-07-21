import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, FIXED_STEP } from "../js/config.js";
import { persistentHudContract } from "../js/hud-contract.js";
import {
  deriveCanonicalMotion,
  spriteHeadingVector,
  wakeParticleVelocity,
} from "../js/motion.js";
import { SurfSimulation } from "../js/simulation.js";
import {
  whaleAnchorError,
  whaleForegroundMask,
  whaleFrameMetadata,
} from "../js/whale-contract.js";
import { conditionWorldProfile, WILDLIFE_CATALOG } from "../js/world-catalog.js";
import { drawWorldWildlifeContact } from "../js/world-visuals.js";
import { WorldSimulation } from "../js/world.js";

function beginRide({ x = 212, face = 0.28, speed = 72, travelVelocity = 30 } = {}) {
  const simulation = new SurfSimulation({ seed: 0xc0deface, controlMode: "simple" });
  simulation.tutorialEnabled = false;
  simulation.reset({
    board: BOARDS.mangoFish,
    controlMode: "simple",
    worldQa: { quiet: true },
  });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "riding",
    stateTime: 1,
    x,
    previousX: x,
    face,
    previousFace: face,
    speed,
    travelVelocity,
    lateralVelocity: travelVelocity,
  });
  simulation.wave.curlX = -500;
  simulation.consumeEvents(() => {});
  return simulation;
}

function run(simulation, seconds, input) {
  const steps = Math.round(seconds / FIXED_STEP);
  for (let step = 0; step < steps; step += 1) {
    simulation.update(FIXED_STEP, typeof input === "function" ? input(step) : input);
    simulation.consumeEvents(() => {});
  }
}

test("canonical board heading agrees with the actual path in every quadrant", () => {
  const cases = [
    [42, 0.46, { x: 0.12, face: 86 }],
    [-42, 0.46, { x: -0.12, face: 86 }],
    [38, -0.4, { x: 0.08, face: 90 }],
    [-38, -0.4, { x: -0.08, face: 90 }],
  ];
  for (const [vx, faceVelocity, gradient] of cases) {
    const motion = deriveCanonicalMotion(vx, faceVelocity, gradient);
    const heading = spriteHeadingVector(motion.spriteAngle, motion.direction);
    const path = { x: motion.vx / motion.speed, y: motion.vy / motion.speed };
    assert.ok(Math.abs(heading.x - path.x) < 1e-12);
    assert.ok(Math.abs(heading.y - path.y) < 1e-12);
  }
  const verticalLeft = deriveCanonicalMotion(0, 0.5, { x: 0, face: 80 }, -1);
  assert.equal(verticalLeft.direction, -1, "zero-crossing preserves the incoming mirror side");
  assert.ok(spriteHeadingVector(verticalLeft.spriteAngle, -1).y > 0.999);
});

test("left and right wake velocities are exact mirrors and never point ahead", () => {
  for (const turbulence of [-9, -3, 0, 4, 10]) {
    const right = wakeParticleVelocity(48, 32, turbulence, 0.38);
    const left = wakeParticleVelocity(-48, 32, -turbulence, 0.38);
    assert.ok(Math.abs(right.vx + left.vx) < 1e-12);
    assert.ok(Math.abs(right.vy - left.vy) < 1e-12);
    assert.ok(right.vx * 48 + right.vy * 32 <= 1e-9);
    assert.ok(left.vx * -48 + left.vy * 32 <= 1e-9);
  }
});

test("ordinary trajectory-wake samples record a no-front-wake invariant", () => {
  const simulation = beginRide({ speed: 108, travelVelocity: 36 });
  run(simulation, 0.8, { x: 0.7, y: 0.4 });
  const active = simulation.player.wakeSamples.filter((sample) => sample.active);
  assert.ok(active.length >= 20);
  for (const sample of active) {
    const ahead = sample.vx * sample.sourceVX + sample.vy * sample.sourceVY;
    assert.ok(ahead <= 1e-9, `wake sample points ahead by ${ahead}`);
  }

  for (const sample of simulation.player.wakeSamples) sample.active = false;
  simulation.player.state = "airborne";
  Object.assign(simulation.player, { airX: 220, airY: 90, airVX: 55, airVY: -35 });
  run(simulation, 0.2, {});
  assert.equal(
    simulation.player.wakeSamples.some((sample) => sample.active),
    false,
    "airborne Kaki creates no board-contact trail",
  );
});

test("one drop creates carried energy that remains useful through the next climb", () => {
  const simulation = beginRide();
  const startingSpeed = simulation.player.speed;
  run(simulation, 0.6, { y: 1 });
  const dropSpeed = simulation.player.speed;
  assert.ok(dropSpeed > startingSpeed + 45, `${startingSpeed} -> ${dropSpeed}`);

  run(simulation, 0.8, { y: -1 });
  const climbSpeed = simulation.player.speed;
  assert.ok(climbSpeed < dropSpeed, "climbing spends carried speed");
  assert.ok(climbSpeed > startingSpeed + 25, "the climb does not instantly erase the drop");
  assert.ok(simulation.player.face < 0.4, "the carried drop reaches back toward the lip");
});

test("Core Surf Lab keeps rewards and spectacle out of the sixty-second feel test", () => {
  const simulation = beginRide();
  simulation.coreSurfLab = true;
  run(simulation, 2, (step) => ({
    y: step < 120 ? 1 : -1,
    edge: step % 60 < 32,
    edgePressed: step % 60 === 0,
    edgeReleased: step % 60 === 32,
  }));
  assert.equal(simulation.score.total, 0);
  assert.equal(simulation.score.flow, 0);
  assert.equal(simulation.world.snapshot().wildlife.length, 0);
  assert.equal(simulation.world.snapshot().powerups.length, 0);
  assert.equal(simulation.wave.curlX, -520);
});

test("a committed cutback completes in 0.35 to 0.5 seconds and scrubs speed", () => {
  const simulation = beginRide({ speed: 120, travelVelocity: 32 });
  const startSpeed = simulation.player.speed;
  let steps = 0;
  while (simulation.player.travelDirection > 0 && steps < 120) {
    simulation.update(FIXED_STEP, { x: -1 });
    steps += 1;
  }
  const duration = steps * FIXED_STEP;
  assert.ok(duration >= 0.35 && duration <= 0.5, `cutback took ${duration.toFixed(3)}s`);
  assert.ok(simulation.player.speed < startSpeed - 4);
});

test("held steering traverses the full usable face in both directions", () => {
  const simulation = beginRide({ x: 212, speed: 86, travelVelocity: 20 });
  let rightmost = simulation.player.x;
  let leftmost = simulation.player.x;
  for (let step = 0; step < 360; step += 1) {
    simulation.update(FIXED_STEP, { x: 1 });
    rightmost = Math.max(rightmost, simulation.player.x);
  }
  for (let step = 0; step < 720; step += 1) {
    simulation.update(FIXED_STEP, { x: -1 });
    leftmost = Math.min(leftmost, simulation.player.x);
  }
  assert.ok(rightmost >= 320);
  assert.ok(leftmost <= 90);
  assert.ok(rightmost - leftmost >= 225);
});

test("whale phase metadata keeps water, collision, and foam on one anchor", () => {
  const world = new WorldSimulation({ seed: 0x57a1e });
  const whale = world.forceWildlife("whale", {
    phase: "ramp",
    phaseTime: 0.3,
    screenX: 202,
    y: 136,
    direction: -1,
  });
  assert.ok(whale);
  const metadata = whaleFrameMetadata(whale);
  assert.equal(whale.collisionY, metadata.collision.y);
  assert.equal(whale.collisionRadius, whale.radius * metadata.collision.radiusScale);
  assert.equal(whale.foamOriginY, whale.waterAnchorY);
  assert.ok(whaleAnchorError(whale) <= 3);
  assert.ok(Math.abs(whale.collisionY - whale.waterAnchorY) <= 8);
});

test("whale breach begins and ends at the same water surface", () => {
  const phaseDuration = WILDLIFE_CATALOG.whale.phases.breach;
  const base = { phase: "breach", phaseDuration, waterAnchorY: 134, direction: 1 };
  const start = whaleFrameMetadata({ ...base, phaseTime: 0 });
  const apex = whaleFrameMetadata({ ...base, phaseTime: phaseDuration / 2 });
  const end = whaleFrameMetadata({ ...base, phaseTime: phaseDuration });
  assert.equal(start.lift, 0);
  assert.ok(apex.lift >= 43);
  assert.ok(Math.abs(end.lift) < 1e-12);
  assert.equal(start.waterContactAnchor.y, end.waterContactAnchor.y);
  assert.equal(start.foamOrigin.y, end.foamOrigin.y);
  assert.equal(start.drawAnchor.y, end.drawAnchor.y);
});

test("foreground water masks the whale below its canonical contact before drawing foam", () => {
  const entity = {
    kind: "whale",
    phase: "ramp",
    phaseTime: 0.4,
    phaseDuration: 1,
    worldX: 204,
    previousWorldX: 204,
    waterAnchorY: 137,
    direction: 1,
  };
  const rectangles = [];
  const fills = [];
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() { fills.push({ color: this.fillStyle, alpha: this.globalAlpha }); },
    fillRect(x, y, width, height) {
      rectangles.push({ x, y, width, height, color: this.fillStyle });
    },
  };
  const world = {
    context: { previousCameraWorldX: 0, cameraWorldX: 0 },
    lastCameraWorldX: 0,
    forEachWildlife(visitor) { visitor(entity); },
  };
  const palette = { waterDeep: "deep", deepInk: "ink", foamShade: "shade", foam: "foam" };
  drawWorldWildlifeContact(ctx, { world }, palette, 1, { reducedMotion: true });
  const metadata = whaleFrameMetadata(entity);
  const mask = whaleForegroundMask(metadata);
  assert.equal(fills[0].color, palette.waterDeep);
  assert.equal(mask.y, entity.waterAnchorY);
  assert.ok(mask.depth >= metadata.occlusionDepth);
  assert.ok(mask.halfWidth * 2 > metadata.phaseScale * 60);
  assert.ok(rectangles.some((rectangle) => rectangle.color === palette.foam));
});

test("production scheduling disables whales until the repaired contract is deliberately enabled", () => {
  for (const condition of ["goldenCoast", "twilightGlass", "stormbreak"]) {
    assert.equal(conditionWorldProfile(condition).wildlifeWeights.whale, 0);
  }
});

test("persistent HUD contains score, run resource, Turbo, and contextual combo", () => {
  const base = {
    coreSurfLab: false,
    mode: { timed: false },
    player: { state: "riding", tubeRide: { active: false } },
    score: { comboHeat: 0 },
    currentMultiplier: () => 1,
  };
  assert.deepEqual(persistentHudContract(base).fields, ["score", "paws", "turbo"]);
  const timed = { ...base, mode: { timed: true } };
  assert.deepEqual(persistentHudContract(timed).fields, ["score", "time", "turbo"]);
  const combo = {
    ...base,
    score: { comboHeat: 0.6 },
    currentMultiplier: () => 1.8,
  };
  assert.deepEqual(persistentHudContract(combo).fields, ["score", "paws", "turbo", "combo"]);
  for (const forbidden of ["speed", "flow", "set", "pump", "special"]) {
    assert.equal(persistentHudContract(combo).fields.includes(forbidden), false);
  }
  assert.deepEqual(
    persistentHudContract({ coreSurfLab: true, coreSurfLabTelemetry: false }).fields,
    [],
  );
});
