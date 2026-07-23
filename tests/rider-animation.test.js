import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { cameraLayerOffset } from "../js/camera.js";
import { BOARDS, FIXED_STEP, PALETTES } from "../js/config.js";
import {
  backgroundPanoramaCropY,
  backgroundPanoramaTravel,
} from "../js/renderer.js";
import {
  beginLandingPresentation,
  cancelLandingPresentation,
  createRiderAnimationState,
  deterministicLandingVariant,
  interpolatePixelPose,
  LANDING_VARIANTS,
  landingPresentationPose,
  poseWithinSafetyBounds,
  sampleLandingVariant,
  sampleTrickPose,
  TRICK_PHASES,
  updateRiderAnimation,
} from "../js/rider-animation.js";
import { SurfSimulation } from "../js/simulation.js";
import { drawBoardSprite, drawKittySprite } from "../js/sprites.js";
import { TRICK_CATALOG } from "../js/trick-catalog.js";

test("landing variants are deterministic, reproducible, and never immediately duplicate", () => {
  const sequence = (seed) => {
    const variants = [];
    let previousVariant = "";
    for (let serial = 1; serial <= 24; serial += 1) {
      const variant = deterministicLandingVariant({
        seed,
        serial,
        quality: serial % 3 === 0 ? "perfect" : "clean",
        trickSignature: `CHAIN-${serial % 4}`,
        boardId: serial % 2 ? "foamPuff" : "moonLog",
        direction: serial % 5 ? 1 : -1,
        previousVariant,
      });
      assert.notEqual(variant, previousVariant);
      variants.push(variant);
      previousVariant = variant;
    }
    return variants;
  };
  assert.deepEqual(sequence(0x4b414b49), sequence(0x4b414b49));
  assert.notDeepEqual(sequence(0x4b414b49), sequence(0x5a5a5a5a));
});

test("wobble never starts a celebration and active ride-aways cancel on gameplay actions", () => {
  const state = createRiderAnimationState();
  assert.equal(beginLandingPresentation(state, { quality: "wobble" }), null);
  assert.equal(state.landing, null);

  const cancellationStates = [
    { state: "airborne" },
    { state: "lip" },
    { state: "wipeout" },
    { state: "complete" },
    { state: "riding", maneuver: { id: "cutback" } },
    { state: "riding", compression: 0.8 },
    { state: "riding", charge: 0.8 },
    { state: "riding", animalMount: "dolphin" },
  ];
  for (const player of cancellationStates) {
    beginLandingPresentation(state, { quality: "clean", seed: 4 });
    updateRiderAnimation(state, 1 / 60, player);
    assert.equal(state.landing, null, `did not cancel for ${JSON.stringify(player)}`);
  }

  beginLandingPresentation(state, { quality: "perfect", seed: 4 });
  cancelLandingPresentation(state);
  assert.equal(state.landing, null);
});

test("every trick has entry, maximum, release, and landing-read poses", () => {
  for (const [id, phases] of Object.entries(TRICK_PHASES)) {
    const entry = sampleTrickPose(id, 0);
    const midpoint = sampleTrickPose(id, 0.56);
    const release = sampleTrickPose(id, 1);
    const landingRead = sampleTrickPose(id, 0.84, { airVY: 86 });
    assert.ok(entry?.pose && midpoint?.pose && release?.pose && landingRead?.pose, id);
    assert.equal(entry.progress, 0);
    assert.equal(release.progress, 1);
    assert.ok(phases.includes(entry.phase));
    assert.ok(phases.includes(midpoint.phase));
    assert.equal(release.phase, phases.at(-1));
    assert.equal(landingRead.phase, "landingRead");
    assert.notDeepEqual(entry.pose, midpoint.pose);
    assert.notDeepEqual(midpoint.pose, release.pose);
  }
});

test("Kaki Twist board specialties produce three distinct rider-local silhouettes", () => {
  const variants = ["softPaw", "mangoWhip", "moonArc"]
    .map((signatureVariant) => sampleTrickPose("kakiTwist", 0.56, { signatureVariant }).pose);
  assert.equal(new Set(variants.map(poseSignature)).size, 3);
});

test("pixel-pose interpolation is smooth, integer-snapped, and switches discrete art at boundaries", () => {
  const from = sampleTrickPose("frontRailGrab", 0).pose;
  const to = sampleTrickPose("frontRailGrab", 0.52).pose;
  const beforeBoundary = interpolatePixelPose(from, to, 0.999);
  const boundary = interpolatePixelPose(from, to, 1);
  for (const value of numericPoseValues(beforeBoundary)) assert.equal(Number.isInteger(value), true);
  assert.equal(beforeBoundary.expression, from.expression);
  assert.equal(boundary.expression, to.expression);
  assert.deepEqual(interpolatePixelPose(from, to, 0), from);
  assert.deepEqual(interpolatePixelPose(from, to, 1), to);
});

test("ordinary trick limb endpoints stay within the four-pixel frame-to-frame budget", () => {
  for (const [id, definition] of Object.entries(TRICK_CATALOG)) {
    const frames = Math.ceil(definition.entryDuration * 60);
    let previous = sampleTrickPose(id, 0).pose;
    let largest = 0;
    for (let frame = 1; frame <= frames; frame += 1) {
      const progress = Math.min(1, frame / (definition.entryDuration * 60));
      const current = sampleTrickPose(id, progress).pose;
      for (const paw of ["leftPaw", "rightPaw"]) {
        largest = Math.max(
          largest,
          Math.abs(current[paw][0] - previous[paw][0]),
          Math.abs(current[paw][1] - previous[paw][1]),
        );
      }
      previous = current;
    }
    assert.ok(largest <= 4, `${id} moved a limb ${largest}px in one 60 FPS frame`);
  }
});

test("all authored and interpolated poses remain inside the rider-local safety box", () => {
  for (const variants of Object.values(LANDING_VARIANTS)) {
    for (const variant of variants) {
      for (let sample = 0; sample <= 120; sample += 1) {
        assert.equal(poseWithinSafetyBounds(sampleLandingVariant(variant, sample / 120).pose), true, variant);
      }
    }
  }
  for (const id of Object.keys(TRICK_PHASES)) {
    for (const signatureVariant of ["", "softPaw", "mangoWhip", "moonArc"]) {
      for (let sample = 0; sample <= 120; sample += 1) {
        assert.equal(poseWithinSafetyBounds(sampleTrickPose(id, sample / 120, { signatureVariant }).pose), true, `${id}:${signatureVariant}`);
      }
    }
  }
});

test("landing presentation samples are stable at 30, 60, and 120 updates per second", () => {
  const samples = [0.1, 0.24, 0.48, 0.66, 0.8];
  const atRate = (rate) => samples.map((target) => {
    const state = createRiderAnimationState();
    beginLandingPresentation(state, {
      seed: 99,
      quality: "perfect",
      trickSignature: "540-VARIAL",
      boardId: "moonLog",
      majorTrick: true,
    });
    let elapsed = 0;
    while (elapsed < target - 1e-10) {
      const dt = Math.min(1 / rate, target - elapsed);
      updateRiderAnimation(state, dt, { state: "landing", ridingStance: "regular" });
      elapsed += dt;
    }
    return landingPresentationPose(state, { state: "landing", ridingStance: "regular" })?.pose;
  });
  assert.deepEqual(atRate(30), atRate(60));
  assert.deepEqual(atRate(60), atRate(120));
});

test("travel and stance mirroring stay in the existing sprite transform", () => {
  const combinations = [
    [1, 1, 1],
    [-1, 1, -1],
    [1, -1, -1],
    [-1, -1, 1],
  ];
  for (const [direction, stanceDirection, expected] of combinations) {
    const context = new RecordingContext();
    drawKittySprite(context, 120, 90, 0, {
      state: "riding",
      ridingStance: stanceDirection < 0 ? "goofy" : "regular",
      presentationPose: sampleLandingVariant("landingPawUp", 0.5).pose,
      presentationPoseId: "landingPawUp",
    }, PALETTES.standard, { direction, stanceDirection });
    assert.deepEqual(context.scales[0], [expected, 1]);
    assert.equal(context.depth, 0);
  }
});

test("pose changes cannot move the rider root or board and draw calls keep save/restore balanced", () => {
  const draw = (presentationPose) => {
    const context = new RecordingContext();
    drawBoardSprite(context, 192, 121, 0, BOARDS.foamPuff, PALETTES.standard, { direction: 1 });
    drawKittySprite(context, 192, 120, 0, {
      state: "airborne",
      airVY: 0,
      presentationPose,
      presentationPoseId: "test",
    }, PALETTES.standard, { direction: 1, stanceDirection: 1 });
    assert.equal(context.depth, 0);
    return context.rootTranslations;
  };
  const baseline = draw(sampleTrickPose("frontRailGrab", 0).pose);
  const maximum = draw(sampleTrickPose("frontRailGrab", 0.56).pose);
  assert.deepEqual(maximum.slice(0, 2), baseline.slice(0, 2));
});

test("pixel differences remain inside an expanded Kaki-and-board rectangle", () => {
  const baseline = renderRiderFrame(null);
  const animated = renderRiderFrame(sampleTrickPose("boardVarial", 0.5).pose);
  const bounds = { left: 148, right: 236, top: 60, bottom: 142 };
  let outsideDifferences = 0;
  let insideDifferences = 0;
  for (let y = 0; y < 216; y += 1) {
    for (let x = 0; x < 384; x += 1) {
      const changed = baseline[y * 384 + x] !== animated[y * 384 + x];
      if (!changed) continue;
      if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) insideDifferences += 1;
      else outsideDifferences += 1;
    }
  }
  assert.ok(insideDifferences > 0, "animation must visibly change rider-local pixels");
  assert.equal(outsideDifferences, 0, "world/HUD pixels outside rider bounds must stay byte-identical");
});

test("presentation observation leaves deterministic physics, camera, wave, tricks, and timing byte-identical", () => {
  const baseline = maximumAirSimulation();
  const animated = maximumAirSimulation();
  const animation = createRiderAnimationState();
  const baselineFrames = [];
  const animatedFrames = [];
  const baselineMarks = eventMarks();
  const animatedMarks = eventMarks();

  drainEvents(baseline, baselineMarks);
  drainEvents(animated, animatedMarks, animation);
  for (let frame = 0; frame < 720; frame += 1) {
    const input = replayInput(frame);
    baseline.update(FIXED_STEP, input);
    animated.update(FIXED_STEP, input);
    drainEvents(baseline, baselineMarks);
    drainEvents(animated, animatedMarks, animation);
    updateRiderAnimation(animation, FIXED_STEP, animated.player);
    baselineFrames.push(simulationSnapshot(baseline));
    animatedFrames.push(simulationSnapshot(animated));
  }

  assert.deepEqual(animatedFrames, baselineFrames);
  assert.deepEqual(animatedMarks, baselineMarks);
  assert.ok(baselineMarks.takeoff >= 0);
  assert.ok(baselineMarks.apex > baselineMarks.takeoff);
  assert.ok(baselineMarks.touchdown > baselineMarks.apex);
  assert.ok(baselineMarks.recovery >= baselineMarks.touchdown);
});

test("rider animation remains a renderer-only dependency", () => {
  for (const file of ["camera.js", "aerial.js", "simulation.js", "wave.js", "tricks.js", "trick-scoring.js"]) {
    const source = readFileSync(new URL(`../js/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /rider-animation|presentationPose|landingPresentation/,
      `${file} must never consume rider presentation state`);
  }
  const renderer = readFileSync(new URL("../js/renderer.js", import.meta.url), "utf8");
  assert.match(renderer, /from "\.\/rider-animation\.js"/);
});

function maximumAirSimulation() {
  const simulation = new SurfSimulation({ seed: 0xa3117, controlMode: "advanced" });
  simulation.reset({
    board: BOARDS.moonLog,
    controlMode: "advanced",
    assists: { landing: true },
    worldQa: { quiet: true },
  });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "lip",
    face: 0.01,
    faceVelocity: -0.84,
    slopeDrive: -0.84,
    speed: 154,
    charge: 0.94,
    turboActive: true,
    turboOverdrive: 1,
  });
  Object.assign(simulation.player.speedPotential, { pocket: 0.8, seamDrive: 0.9 });
  simulation.wave.curlX = -520;
  simulation.launch({ x: 0 });
  return simulation;
}

function replayInput(frame) {
  const input = {};
  if (frame >= 5 && frame <= 26) input.trick1 = true;
  if (frame === 5) input.trick1Pressed = true;
  if (frame === 27) input.trick1Released = true;
  if (frame >= 36 && frame <= 68) input.trick2 = true;
  if (frame === 36) input.trick2Pressed = true;
  if (frame === 69) input.trick2Released = true;
  if (frame === 80) input.trick3 = input.trick3Pressed = true;
  if (frame === 82) input.trick3Released = true;
  if (frame === 180) input.trick4 = input.trick4Pressed = true;
  if (frame === 182) input.trick4Released = true;
  return input;
}

function simulationSnapshot(simulation) {
  const player = simulation.player;
  const surfaceX = player.state === "airborne" ? player.airX : player.x;
  const surfaceFace = player.state === "airborne" ? player.landingFace : player.face;
  const stage = cameraLayerOffset("stage", simulation.camera, 0, 0, true);
  return {
    state: player.state,
    stateTime: player.stateTime,
    activeTime: simulation.activeTime,
    world: [player.worldX, player.x, player.face, player.faceVelocity, player.motionVX, player.motionVY],
    air: [player.airX, player.airY, player.airVX, player.airVY, player.maxAirHeight],
    camera: [simulation.camera.worldX, simulation.camera.worldY, simulation.camera.velocityX, simulation.camera.velocityY],
    stage: [stage.x, stage.y],
    backdrop: [backgroundPanoramaTravel(simulation), backgroundPanoramaCropY(simulation)],
    surface: [surfaceX, surfaceFace, simulation.wave.ridingY(surfaceX, surfaceFace), simulation.wave.slopeAt(surfaceX, surfaceFace)],
    scoring: [simulation.score.total, simulation.currentMultiplier(), player.provisionalScore, player.landingQuality, player.lastLandingQuality],
    trick: (player.trickManifest?.sequence ?? []).map((entry) => [
      entry.id,
      entry.poseProgress,
      entry.complete,
      entry.boardRelativeRotation,
      entry.bodyPose,
    ]),
  };
}

function eventMarks() {
  return { frame: 0, takeoff: -1, apex: -1, touchdown: -1, recovery: -1, previousAirVY: null };
}

function drainEvents(simulation, marks, animation = null) {
  simulation.consumeEvents((event) => {
    if (event.type === "launch" && marks.takeoff < 0) marks.takeoff = marks.frame;
    if (event.type === "land" && marks.touchdown < 0) {
      marks.touchdown = marks.frame;
      if (animation) beginLandingPresentation(animation, {
        seed: simulation.seed,
        quality: event.payload.quality,
        trickSignature: event.payload.signature,
        boardId: simulation.board.id,
        direction: event.payload.landingDirection,
        majorTrick: event.payload.banked >= 500,
      });
    }
  });
  const airVY = Number(simulation.player.airVY);
  if (simulation.player.state === "airborne" && marks.previousAirVY < 0 && airVY >= 0 && marks.apex < 0) marks.apex = marks.frame;
  if (simulation.player.state === "riding" && marks.touchdown >= 0 && marks.recovery < 0) marks.recovery = marks.frame;
  marks.previousAirVY = simulation.player.state === "airborne" ? airVY : null;
  marks.frame += 1;
}

function numericPoseValues(pose) {
  return Object.entries(pose).flatMap(([key, value]) => {
    if (key === "expression" || typeof value === "boolean") return [];
    return Array.isArray(value) ? value : [value];
  });
}

function poseSignature(pose) {
  return JSON.stringify(pose);
}

class RecordingContext {
  constructor() {
    this.depth = 0;
    this.scales = [];
    this.rootTranslations = [];
    this.fillStyle = "";
    this.imageSmoothingEnabled = false;
  }

  save() { this.depth += 1; }
  restore() { this.depth -= 1; }
  translate(x, y) { if (this.depth === 1) this.rootTranslations.push([x, y]); }
  rotate() {}
  scale(x, y) { this.scales.push([x, y]); }
  fillRect() {}
}

function renderRiderFrame(presentationPose) {
  const context = new RasterContext(384, 216);
  context.fillStyle = "#123456";
  context.fillRect(0, 0, 384, 216);
  drawBoardSprite(context, 192, 121, 0, BOARDS.foamPuff, PALETTES.standard, { direction: 1 });
  drawKittySprite(context, 192, 120, 0, {
    state: "airborne",
    airVY: 0,
    presentationPose,
    presentationPoseId: presentationPose ? "animation" : undefined,
  }, PALETTES.standard, { direction: 1, stanceDirection: 1 });
  assert.equal(context.stack.length, 0);
  return context.pixels;
}

class RasterContext {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint32Array(width * height);
    this.stack = [];
    this.transform = [1, 0, 0, 1, 0, 0];
    this.fillStyle = "#000";
    this.imageSmoothingEnabled = false;
  }

  save() {
    this.stack.push({ transform: [...this.transform], fillStyle: this.fillStyle });
  }

  restore() {
    const state = this.stack.pop();
    this.transform = state.transform;
    this.fillStyle = state.fillStyle;
  }

  translate(x, y) { this.multiply([1, 0, 0, 1, x, y]); }
  scale(x, y) { this.multiply([x, 0, 0, y, 0, 0]); }
  rotate(angle) {
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    this.multiply([cosine, sine, -sine, cosine, 0, 0]);
  }

  multiply(next) {
    const [a, b, c, d, e, f] = this.transform;
    const [g, h, i, j, k, l] = next;
    this.transform = [
      a * g + c * h,
      b * g + d * h,
      a * i + c * j,
      b * i + d * j,
      a * k + c * l + e,
      b * k + d * l + f,
    ];
  }

  fillRect(x, y, width, height) {
    const corners = [
      this.point(x, y),
      this.point(x + width, y),
      this.point(x, y + height),
      this.point(x + width, y + height),
    ];
    const left = Math.max(0, Math.floor(Math.min(...corners.map(([px]) => px))));
    const right = Math.min(this.width, Math.ceil(Math.max(...corners.map(([px]) => px))));
    const top = Math.max(0, Math.floor(Math.min(...corners.map(([, py]) => py))));
    const bottom = Math.min(this.height, Math.ceil(Math.max(...corners.map(([, py]) => py))));
    const color = colorHash(this.fillStyle);
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) this.pixels[py * this.width + px] = color;
    }
  }

  point(x, y) {
    const [a, b, c, d, e, f] = this.transform;
    return [a * x + c * y + e, b * x + d * y + f];
  }
}

function colorHash(value) {
  let hash = 2166136261;
  for (const character of String(value)) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}
