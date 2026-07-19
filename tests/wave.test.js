import test from "node:test";
import assert from "node:assert/strict";

import { BOARDS } from "../js/config.js";
import { GameplayWave } from "../js/wave.js";
import { powerSeamFaceAt, waveGuideAt } from "../js/wave-visuals.js";

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
    assert.ok(result.pumpEfficiency >= 0 && result.pumpEfficiency <= 1);
    assert.ok(result.acceleration >= 0.15 && result.acceleration <= 1.25);
  }
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

