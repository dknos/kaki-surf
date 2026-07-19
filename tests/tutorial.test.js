import assert from "node:assert/strict";
import test from "node:test";

import { SurfSchool, SURF_SCHOOL_STEPS } from "../js/tutorial.js";

function rider(overrides = {}) {
  return {
    state: "riding",
    faceVelocity: 0,
    slopeDrive: 0,
    rotationAccum: 0,
    charge: 0,
    landingPreview: { error: 1, bands: { recovery: 0.8 } },
    ...overrides,
  };
}

test("Surf School never advances from elapsed time alone", () => {
  const school = new SurfSchool({ enabled: true });
  const player = rider();
  let signal = null;
  for (let index = 0; index < 1200; index += 1) {
    signal = school.update(1 / 120, { elapsed: 10 + index / 120, player, input: { x: 0, y: 0 } }) ?? signal;
  }
  assert.equal(signal?.type, "tutorialStep", "the first prompt becomes visible");
  assert.equal(school.snapshot().id, "drop");
  assert.equal(school.snapshot().progress, 0);
});

test("Surf School requires the ordered drop, carve, launch, rotation, trick, and landing actions", () => {
  const school = new SurfSchool({ enabled: true });
  const player = rider();
  const step = (input = {}, dt = 1 / 120) => school.update(dt, {
    elapsed: 2,
    player,
    input: { x: 0, y: 0, ...input },
  });

  assert.equal(step()?.payload.id, "drop");
  Object.assign(player, { faceVelocity: 0.32, slopeDrive: 0.52 });
  for (let index = 0; index < 36; index += 1) step({ y: 1 });
  assert.equal(school.snapshot().id, "carve");

  Object.assign(player, { faceVelocity: -0.28, slopeDrive: -0.4 });
  for (let index = 0; index < 32; index += 1) step({ y: -1 });
  assert.equal(school.snapshot().id, "launch");

  school.observe("launch", { strength: 1 });
  player.state = "airborne";
  step();
  assert.equal(school.snapshot().id, "rotate");

  player.rotationAccum = Math.PI;
  step({ x: 1 });
  assert.equal(school.snapshot().id, "trick");

  school.observe("trickStarted", { id: "frontRailGrab" });
  step();
  assert.equal(school.snapshot().id, "land");

  school.observe("land", { quality: "clean" });
  const complete = step();
  assert.equal(complete?.type, "tutorialComplete");
  assert.equal(school.snapshot().complete, true);
  assert.equal(school.snapshot().text, "SURF SCHOOL CLEAR");
  assert.equal(SURF_SCHOOL_STEPS.length, 6);
});

test("a wipeout clears stale airborne milestones without erasing completed lessons", () => {
  const school = new SurfSchool({ enabled: true });
  const player = rider({ faceVelocity: 0.4, slopeDrive: 0.5 });
  school.update(1 / 120, { elapsed: 2, player, input: { y: 1 } });
  for (let index = 0; index < 36; index += 1) {
    school.update(1 / 120, { elapsed: 2, player, input: { y: 1 } });
  }
  player.faceVelocity = -0.4;
  for (let index = 0; index < 32; index += 1) {
    school.update(1 / 120, { elapsed: 2, player, input: { y: -1 } });
  }
  school.observe("launch");
  school.observe("trickStarted");
  school.observe("wipeout");
  player.state = "wipeout";
  school.update(1 / 120, { elapsed: 4, player, input: {} });

  assert.equal(school.snapshot().id, "launch");
  assert.equal(school.snapshot().progress, 0);
});

test("replay reset restores the first lesson after completion or disable", () => {
  const school = new SurfSchool({ enabled: false });
  assert.equal(school.snapshot().enabled, false);
  school.setEnabled(true);
  assert.deepEqual(
    { id: school.snapshot().id, complete: school.snapshot().complete, progress: school.snapshot().progress },
    { id: "drop", complete: false, progress: 0 },
  );
});
