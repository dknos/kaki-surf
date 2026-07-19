import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, FIXED_STEP } from "../js/config.js";
import { ScoreSystem } from "../js/scoring.js";
import { SurfSimulation } from "../js/simulation.js";
import { TRICK_CATALOG } from "../js/trick-catalog.js";
import {
  buildTrickSignature,
  formatTrickName,
} from "../js/trick-scoring.js";
import { AerialTrickSession, normalizeTrickInput } from "../js/tricks.js";

function context(overrides = {}) {
  return {
    maxHeight: 30,
    rotationAccumulated: 0,
    rotationDirection: 1,
    angularVelocity: 2,
    apex: false,
    descending: false,
    ...overrides,
  };
}

function runFor(session, seconds, input = {}, state = context()) {
  const dt = 1 / 120;
  const steps = Math.ceil(seconds / dt);
  const events = [];
  for (let index = 0; index < steps; index += 1) {
    events.push(...session.update(dt, input, state));
  }
  return events;
}

function completedEntry(id, overrides = {}) {
  const definition = TRICK_CATALOG[id];
  return {
    id,
    action: definition.action,
    category: definition.category,
    heldDuration: definition.hold ? 0.38 : 0,
    heldThroughApex: id === "tailGrab",
    lateHoldDuration: 0,
    completion: 1,
    poseProgress: 1,
    boardRelativeRotation: id === "boardVarial" ? Math.PI * 2 : 0,
    bodyPose: 0,
    risk: definition.risk,
    baseScore: definition.baseScore,
    complete: true,
    landed: true,
    direction: 1,
    signatureVariant: "",
    ...overrides,
  };
}

function manifest(sequence, rotationAccumulated = 0, overrides = {}) {
  return {
    sequence,
    heldDurations: {},
    completion: 1,
    boardRelativeRotation: 0,
    bodyPose: 0,
    risk: 0.25,
    rotationAccumulated,
    launchData: { potential: 18, multiplier: 1, boardStyle: 1 },
    maxHeight: 32,
    airtime: 1.2,
    landed: true,
    landingQuality: "clean",
    invalidBoardOrientation: false,
    provisionalScore: 0,
    provisionalTrickName: "",
    wipedOut: false,
    ...overrides,
  };
}

test("catalog exposes four distinct identities and legacy style normalizes to trick1", () => {
  assert.deepEqual(Object.keys(TRICK_CATALOG), [
    "frontRailGrab",
    "tailGrab",
    "boardVarial",
    "kakiTwist",
  ]);
  assert.equal(new Set(Object.values(TRICK_CATALOG).map((trick) => trick.baseScore)).size, 4);
  assert.equal(TRICK_CATALOG.frontRailGrab.hold, true);
  assert.equal(TRICK_CATALOG.boardVarial.discrete, true);
  assert.ok(TRICK_CATALOG.kakiTwist.minAirtime > TRICK_CATALOG.boardVarial.minAirtime);

  const normalized = normalizeTrickInput({
    style: true,
    stylePressed: true,
    styleReleased: true,
  });
  assert.equal(normalized.trick1, true);
  assert.equal(normalized.trick1Pressed, true);
  assert.equal(normalized.trick1Released, true);
});

test("one aerial sequences different tricks without repeated-key farming", () => {
  const session = new AerialTrickSession({ boardId: "mangoFish" });
  const startEvents = session.update(1 / 120, {
    trick2: true,
    trick2Pressed: true,
  }, context());
  assert.equal(startEvents.filter((event) => event.type === "trickStarted").length, 1);

  runFor(session, 0.2, { trick2: true, trick2Pressed: true });
  assert.equal(session.manifest.sequence.length, 1, "held/repeated pressed state cannot farm entries");
  session.update(1 / 120, { trick2Released: true }, context({ apex: true }));
  session.update(1 / 120, {}, context());

  session.update(1 / 120, { trick3: true, trick3Pressed: true }, context());
  runFor(session, 0.5, {}, context());
  assert.deepEqual(session.manifest.sequence.map((entry) => entry.id), ["tailGrab", "boardVarial"]);
  assert.ok(session.manifest.sequence.every((entry) => entry.complete));
});

test("Kaki Twist enforces meaningful airtime/height and exposes counter-rotation", () => {
  const session = new AerialTrickSession({ boardId: "moonLog" });
  const rejected = session.update(1 / 120, {
    trick4: true,
    trick4Pressed: true,
  }, context({ maxHeight: 2 }));
  assert.equal(rejected[0].type, "trickRejected");
  assert.match(rejected[0].hint, /AIR|POP/);

  session.update(1 / 120, {}, context({ maxHeight: 24 }));
  runFor(session, 0.3, {}, context({ maxHeight: 24 }));
  session.update(1 / 120, { trick4: true, trick4Pressed: true }, context({ maxHeight: 24 }));
  runFor(session, 0.3, {}, context({ maxHeight: 28 }));
  assert.equal(session.manifest.trickPose, "kakiTwist");
  assert.notEqual(session.manifest.boardRelativeRotation, 0);
  assert.notEqual(session.manifest.bodyPose, 0);
  assert.notEqual(Math.sign(session.manifest.boardRelativeRotation), Math.sign(session.manifest.bodyPose));
  runFor(session, 0.6, {}, context({ maxHeight: 32 }));
  assert.equal(session.manifest.sequence.at(-1).complete, true);
});

test("names quantize actual final rotation and preserve ordered identities", () => {
  const tailVarial = manifest([
    completedEntry("tailGrab"),
    completedEntry("boardVarial"),
  ], Math.PI * 2);
  assert.equal(formatTrickName(tailVarial), "360 TAIL GRAB + VARIAL");

  const perfectVarial = manifest([completedEntry("boardVarial")], Math.PI * 3);
  assert.equal(formatTrickName(perfectVarial, { quality: "perfect" }), "PERFECT 540 VARIAL");

  const kaki = manifest([completedEntry("kakiTwist")], 0);
  assert.equal(formatTrickName(kaki), "KAKI TWIST");

  const unwound = manifest([completedEntry("tailGrab")], Math.PI * 2 - Math.PI * 2);
  assert.equal(formatTrickName(unwound), "TAIL GRAB");
});

test("aerial value remains provisional until landing and wipeout loses it", () => {
  const score = new ScoreSystem();
  const session = new AerialTrickSession({
    boardId: "foamPuff",
    launchData: { potential: 24, multiplier: 1.2, boardStyle: 1 },
  });
  session.update(1 / 120, { trick1: true, trick1Pressed: true }, context());
  runFor(session, 0.16, { trick1: true }, context({ apex: true }));
  session.update(1 / 120, { trick1Released: true }, context());
  session.manifest.maxHeight = 34;

  const preview = score.beginAerial(session.manifest, { boardStyle: 1, multiplier: 1.2 });
  assert.ok(preview.provisional > 0);
  assert.equal(score.total, 0);
  assert.equal(score.breakdown.air, 0);
  assert.equal(score.breakdown.style, 0);

  session.finalizeLanding({ rotationAccumulated: Math.PI * 2, quality: "clean" });
  const banked = score.registerLanding({
    manifest: session.manifest,
    quality: "clean",
    boardStyle: 1,
    multiplier: 1.2,
  });
  assert.ok(banked.total > 0);
  assert.equal(score.total, score.bucketTotal());
  assert.ok(score.breakdown.air > 0);
  assert.ok(score.breakdown.style > 0);

  const wipeoutScore = new ScoreSystem();
  const wipedSession = new AerialTrickSession({ launchData: { potential: 30 } });
  const wipedPreview = wipeoutScore.beginAerial(wipedSession.manifest);
  assert.ok(wipedPreview.provisional > 0);
  wipedSession.wipeout();
  wipeoutScore.wipeout();
  assert.equal(wipeoutScore.total, 0);
  assert.equal(wipedSession.manifest.provisionalScore, 0);
});

test("repeat decay keys the full directional, rotational, ordered signature", () => {
  const clockwise = manifest([
    completedEntry("tailGrab", { direction: 1 }),
    completedEntry("boardVarial", { direction: 1 }),
  ], Math.PI * 2);
  const counterClockwise = manifest([
    completedEntry("tailGrab", { direction: -1 }),
    completedEntry("boardVarial", { direction: -1 }),
  ], -Math.PI * 2);
  const reversedSequence = manifest([
    completedEntry("boardVarial"),
    completedEntry("tailGrab"),
  ], Math.PI * 2);
  assert.notEqual(buildTrickSignature(clockwise), buildTrickSignature(counterClockwise));
  assert.notEqual(buildTrickSignature(clockwise), buildTrickSignature(reversedSequence));

  const score = new ScoreSystem();
  const first = score.registerLanding({ manifest: clockwise, quality: "clean" });
  const second = score.registerLanding({ manifest: clockwise, quality: "clean" });
  assert.equal(first.decay, 1);
  assert.ok(second.decay < 1);
  assert.ok(second.total < first.total);
});

test("varial completion and landed-orientation gates prevent partial awards", () => {
  const partial = new AerialTrickSession({ launchData: { potential: 10 } });
  runFor(partial, 0.1, {}, context({ maxHeight: 8 }));
  partial.update(1 / 120, { trick3: true, trick3Pressed: true }, context({ maxHeight: 8 }));
  runFor(partial, 0.14, {}, context({ maxHeight: 12 }));
  partial.finalizeLanding({ quality: "wobble" });
  assert.equal(partial.manifest.sequence[0].complete, false);
  assert.equal(partial.manifest.invalidBoardOrientation, true);

  const score = new ScoreSystem();
  const result = score.registerLanding({ manifest: partial.manifest, quality: "wobble" });
  assert.equal(result.entries.some((entry) => entry.id === "boardVarial"), false);

  const complete = new AerialTrickSession({ boardId: "mangoFish" });
  runFor(complete, 0.1, {}, context({ maxHeight: 12 }));
  complete.update(1 / 120, { trick3: true, trick3Pressed: true }, context({ maxHeight: 12 }));
  runFor(complete, 0.5, {}, context({ maxHeight: 26 }));
  complete.finalizeLanding({ quality: "clean" });
  assert.equal(complete.manifest.sequence[0].complete, true);
  assert.equal(complete.manifest.invalidBoardOrientation, false);
});

test("invalid contextual maneuvers emit restrained rejection and award no move score", () => {
  const simulation = new SurfSimulation();
  simulation.tutorialEnabled = false;
  simulation.reset({ board: BOARDS.foamPuff });
  simulation.begin();
  simulation.player.state = "riding";
  simulation.player.stateTime = 1;
  simulation.player.face = 0.5;
  simulation.player.faceVelocity = 0;

  simulation.update(FIXED_STEP, { trick1: true, trick1Pressed: true });
  const events = [];
  simulation.consumeEvents((event) => events.push(event));
  const rejection = events.find((event) => event.type === "trickRejected");
  assert.equal(rejection.payload.hint, "CARVE FIRST");
  assert.equal(simulation.score.breakdown.maneuvers, 0);

  simulation.update(FIXED_STEP, {});
  simulation.player.faceVelocity = 0.5;
  simulation.player.maneuverCooldown = 0;
  simulation.update(FIXED_STEP, { trick1: true, trick1Pressed: true });
  assert.ok(simulation.score.breakdown.maneuvers > 0);
  assert.equal(typeof simulation.player.maneuver.id, "string");
  assert.equal(typeof simulation.player.landingPreview.error, "number");
  assert.equal(typeof simulation.player.flowTier, "string");
});

