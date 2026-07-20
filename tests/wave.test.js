import test from "node:test";
import assert from "node:assert/strict";

import { BOARDS } from "../js/config.js";
import { GameplayWave } from "../js/wave.js";
import {
  advanceWavePresentationClocks,
  breakerSkyWindow,
  createWavePresentationClocks,
  powerSeamFaceAt,
  waveGoldGlintOffset,
  waveGuideAt,
  waveProgressionBlend,
  waveSurfaceTravel,
  waveVisualTravel,
} from "../js/wave-visuals.js";

function snapshotWave(wave) {
  return JSON.parse(JSON.stringify(wave));
}

test("speedPotential is deterministic and side-effect free", () => {
  const wave = new GameplayWave(0x1234abcd);
  wave.update(2.25, 94, 2.8);
  const before = snapshotWave(wave);
  const options = {
    pumpCharge: 0.72,
    pumpReleased: true,
    faceVelocity: -0.38,
    board: BOARDS.mangoFish,
    breaking: false,
  };
  const optionsBefore = JSON.stringify(options);

  const first = wave.speedPotential(132, 0.41, options);
  const second = wave.speedPotential(132, 0.41, options);

  assert.deepEqual(second, first);
  assert.deepEqual(snapshotWave(wave), before);
  assert.equal(JSON.stringify(options), optionsBefore);
});

test("power target stays on the intended face and correction follows input-y convention", () => {
  const wave = new GameplayWave(0x51515151);
  wave.update(4, 108, 2.7);
  for (let x = 0; x <= 384; x += 12) {
    const target = wave.powerFaceAt(x);
    assert.ok(target >= 0.3 && target <= 0.5, `target ${target} at x=${x}`);
    assert.equal(wave.speedPotential(x, target).correction, 0);
    assert.equal(wave.speedPotential(x, target - 0.08).correction, 1, "below target carves down");
    assert.equal(wave.speedPotential(x, target + 0.08).correction, -1, "above target carves up");
  }
});

test("zones separate safe shoulder, sustainable power seam, and critical curl", () => {
  const wave = new GameplayWave(0x4b414b49);
  wave.pressure = 0.65;
  const safeX = wave.curlX + 190;
  const powerX = wave.curlX + 72;
  const criticalX = wave.curlX + 12;

  assert.equal(wave.speedPotential(safeX, wave.powerFaceAt(safeX), { breaking: false }).zone, "safe");
  assert.equal(wave.speedPotential(powerX, wave.powerFaceAt(powerX), { breaking: false }).zone, "power");
  assert.equal(wave.speedPotential(criticalX, wave.powerFaceAt(criticalX), { breaking: false }).zone, "critical");
  assert.equal(wave.speedPotential(powerX, wave.powerFaceAt(powerX) + 0.3, { breaking: false }).zone, "safe");
});

test("the readable seam improves response without gating broad useful acceleration", () => {
  const wave = new GameplayWave(0x4b414b49);
  wave.pressure = 1;
  const shoulderX = wave.curlX + 190;
  const powerX = wave.curlX + 72;
  const criticalX = wave.curlX + 28;
  const options = {
    breaking: false,
    pumpCharge: 1,
    pumpReleased: true,
    faceVelocity: 0.8,
    board: BOARDS.mangoFish,
  };
  const sustainable = wave.speedPotential(powerX, wave.powerFaceAt(powerX), options);
  const shoulder = wave.speedPotential(shoulderX, wave.powerFaceAt(shoulderX), options);
  const critical = wave.speedPotential(criticalX, wave.powerFaceAt(criticalX), options);
  const offLine = wave.speedPotential(powerX, wave.powerFaceAt(powerX) + 0.24, options);

  assert.equal(sustainable.zone, "power");
  assert.equal(sustainable.seamDrive, 1);
  assert.equal(sustainable.maxFlowEligible, true);
  assert.ok(sustainable.acceleration > offLine.acceleration);
  for (const result of [shoulder, critical, offLine]) {
    assert.equal(result.maxFlowEligible, false);
    assert.ok(result.seamDrive < 0.01);
    assert.ok(result.acceleration >= 0.32, "ordinary lines retain useful drive");
  }
  assert.equal(shoulder.zone, "safe");
  assert.equal(critical.zone, "critical");
  assert.equal(offLine.zone, "safe");
});

test("pressure, pocket position, breaking, and pump timing produce bounded variation", () => {
  const wave = new GameplayWave(0x0badf00d);
  const shoulderX = wave.curlX + 190;
  const pocketX = wave.curlX + 72;
  wave.pressure = 0;
  const shoulder = wave.speedPotential(shoulderX, wave.powerFaceAt(shoulderX), { breaking: false });
  const pocketLowPressure = wave.speedPotential(pocketX, wave.powerFaceAt(pocketX), { breaking: false });
  wave.pressure = 1;
  const pocketHighPressure = wave.speedPotential(pocketX, wave.powerFaceAt(pocketX), { breaking: false });
  const breaking = wave.speedPotential(pocketX, wave.powerFaceAt(pocketX), { breaking: true });
  const timedPump = wave.speedPotential(pocketX, wave.powerFaceAt(pocketX), {
    breaking: false,
    pumpCharge: 1,
    pumpReleased: true,
    faceVelocity: 0.8,
    board: BOARDS.mangoFish,
  });
  const missedPump = wave.speedPotential(pocketX, wave.powerFaceAt(pocketX) + 0.35, {
    breaking: false,
    pumpCharge: 1,
    pumpReleased: true,
    faceVelocity: 0.8,
    board: BOARDS.mangoFish,
  });

  assert.ok(pocketLowPressure.acceleration > shoulder.acceleration);
  assert.ok(pocketHighPressure.acceleration > pocketLowPressure.acceleration);
  assert.ok(breaking.acceleration < pocketHighPressure.acceleration);
  assert.ok(breaking.risk > pocketHighPressure.risk);
  assert.ok(timedPump.pumpEfficiency > missedPump.pumpEfficiency);
  for (const result of [shoulder, pocketLowPressure, pocketHighPressure, breaking, timedPump, missedPump]) {
    assert.ok(result.potential >= 0 && result.potential <= 1);
    assert.ok(result.lineQuality >= 0 && result.lineQuality <= 1);
    assert.ok(result.seamDrive >= 0 && result.seamDrive <= 1);
    assert.equal(typeof result.maxFlowEligible, "boolean");
    assert.ok(result.pumpEfficiency >= 0 && result.pumpEfficiency <= 1);
    assert.ok(result.acceleration >= 0.32 && result.acceleration <= 1.12);
  }
});

test("surface gradients are deterministic, side-effect free, and world travel is signed", () => {
  const wave = new GameplayWave(0x5150cafe);
  wave.update(2.5, 96, 2.4, 96);
  const before = snapshotWave(wave);
  const first = wave.surfaceGradientAt(174, 0.46);
  const second = wave.surfaceGradientAt(174, 0.46);
  assert.deepEqual(second, first);
  assert.deepEqual(snapshotWave(wave), before);
  assert.ok(Number.isFinite(first.x));
  assert.ok(first.face > 90, "face coordinate follows the physical face depth");

  const unsignedBefore = wave.travel;
  const signedBefore = wave.worldTravel;
  wave.update(0.5, 80, 0, -80);
  assert.equal(wave.travel, unsignedBefore + 40);
  assert.equal(wave.worldTravel, signedBefore - 40);
});

test("visual water travel follows signed world travel through reversals", () => {
  assert.equal(waveVisualTravel({ travel: 120, worldTravel: 34 }), 34);
  assert.equal(waveVisualTravel({ travel: 180, worldTravel: -12 }), -12);
  assert.equal(waveVisualTravel({ travel: 22 }), 22);
});

test("decorative surface flow stays monotonic when the rider reverses", () => {
  assert.equal(waveSurfaceTravel({ travel: 180, worldTravel: 34 }), 180);
  assert.equal(waveSurfaceTravel({ travel: 210, worldTravel: -12 }), 210);
  assert.equal(waveSurfaceTravel({ worldTravel: -22 }), 22);
});

test("presentation clocks never reverse across sharp speed, momentum, or direction changes", () => {
  const clocks = createWavePresentationClocks();
  const wave = { travel: 0, worldTravel: 0 };
  const player = { speed: 132, waveMomentum: 1, travelDirection: 1 };
  const phaseKeys = ["backWater", "speedFeedback", "swellContours", "faceGlints", "powerSeam", "crest"];
  advanceWavePresentationClocks(clocks, wave, player, 138);

  const samples = [
    { travel: 96, worldTravel: 96, speed: 132, momentum: 1, direction: 1 },
    { travel: 97, worldTravel: 95, speed: 8, momentum: 0.02, direction: -1 },
    { travel: 101, worldTravel: 91, speed: 42, momentum: 0.18, direction: -1 },
    { travel: 109, worldTravel: 99, speed: 96, momentum: 0.76, direction: 1 },
  ];
  let previous = Object.fromEntries(phaseKeys.map((key) => [key, clocks[key]]));
  for (const sample of samples) {
    Object.assign(wave, { travel: sample.travel, worldTravel: sample.worldTravel });
    Object.assign(player, {
      speed: sample.speed,
      waveMomentum: sample.momentum,
      travelDirection: sample.direction,
    });
    advanceWavePresentationClocks(clocks, wave, player, 138);
    for (const key of phaseKeys) {
      assert.ok(clocks[key] >= previous[key], `${key} cannot run backward`);
      previous[key] = clocks[key];
    }
  }
});

test("wave progression stages and gold glints follow readable forward motion", () => {
  assert.deepEqual(waveProgressionBlend({ pressure: 0.1 }, {}), { from: "swell", to: "pitch", mix: 0 });
  const folding = waveProgressionBlend({ pressure: 0.68 }, {});
  assert.equal(folding.from, "pitch");
  assert.equal(folding.to, "curl");
  assert.ok(folding.mix > 0 && folding.mix < 1);
  assert.equal(waveProgressionBlend({ pressure: 0.94 }, {}).to, "impact");
  assert.equal(waveProgressionBlend({ pressure: 0.4 }, { curlTimer: 0.5 }).to, "impact");

  assert.equal(waveGoldGlintOffset(5, 0), -5);
  assert.equal(waveGoldGlintOffset(6, 0), -6, "glints advance left with the ambient flow");
  assert.ok(waveGoldGlintOffset(12, 3) <= 0);
});

test("the passing breaker reveals a growing sky window behind its contact edge", () => {
  const wave = {
    curlX: 42,
    crestY: () => 78,
  };
  const early = breakerSkyWindow(wave);
  wave.curlX = 176;
  const late = breakerSkyWindow(wave);
  assert.ok(late.right > early.right + 100, "the cleared sky grows as the breaker passes");
  assert.ok(late.right < wave.curlX + 13, "the reveal stays behind the collision/contact edge");
  assert.ok(late.bottom > late.fold && late.fold > late.top, "the opening has a readable trailing slope");
  assert.equal(late.horizon, 80, "the authored horizon anchors the sky extension");
  assert.ok(late.bottom <= 110, "the textured sky extension stays shallow");
});

test("renderer guide reads the exact canonical power face", () => {
  const wave = new GameplayWave(0xcafef00d);
  wave.update(5.75, 117, 3.1);
  for (const x of [0, 47, 96, 173, 271, 384]) {
    assert.equal(powerSeamFaceAt(wave, x), wave.powerFaceAt(x));
  }
  const player = { x: 144, face: 0.44, charge: 0.6, faceVelocity: -0.3, state: "riding" };
  const guide = waveGuideAt(wave, player, BOARDS.moonLog);
  assert.equal(guide.targetFace, powerSeamFaceAt(wave, player.x));
});
