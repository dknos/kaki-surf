import test from "node:test";
import assert from "node:assert/strict";

import { BOARDS, TUNING, WAVE_STYLES } from "../js/config.js";
import {
  contactX,
  GameplayWave,
  projectWavePoint,
  resolveWaveStyle,
  sampleWaveSection,
} from "../js/wave.js";
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
import {
  heroBarrelGeometry,
  heroBarrelStage,
  heroPassedSkyWindow,
  heroWaterfallFrame,
  isHeroBarrelWave,
} from "../js/hero-wave-visuals.js";

function snapshotWave(wave) {
  return JSON.parse(JSON.stringify(wave));
}

test("classic profile preserves the shipped surface, pocket, and contact equations", () => {
  const wave = new GameplayWave(0x1234abcd);
  wave.time = 2.75;
  wave.travel = 468;
  wave.pressure = 0.64;
  const x = 173;
  const expectedCrest = 75
    + Math.sin(x * 0.015 + wave.travel * 0.003 + wave.phaseA) * 3.5
    + Math.sin(x * 0.043 - wave.time * 0.62 + wave.phaseB) * 1.25;
  const expectedDepth = 102 + Math.sin(x * 0.021 + wave.phaseB) * 5;
  const face = 0.47;

  assert.equal(wave.profileId, "classic");
  assert.equal(wave.profile, WAVE_STYLES.classic);
  assert.equal(wave.profile.renderer, "heroBarrel", "every shipped condition uses the continuous break compositor");
  assert.equal(wave.contactX(), 30, "the classic break starts fully behind the long ride lane");
  assert.equal(wave.crestY(x), expectedCrest);
  assert.equal(wave.faceDepth(x), expectedDepth);
  assert.equal(wave.ridingY(x, face), expectedCrest + face * (0.88 + face * 0.12) * expectedDepth);
  wave.curlX = 100;
  assert.equal(wave.contactX(), 113);
  assert.equal(contactX(wave), 113);
  assert.equal(wave.curlContact(113), true);
  assert.equal(wave.curlContact(113.001), false);
  assert.equal(wave.pocketRisk(177), 0.5);
  assert.equal(resolveWaveStyle("unknown"), WAVE_STYLES.classic);
});

test("Twilight hero barrel occupies the approved horizon, ride, and trough bands", () => {
  const wave = new GameplayWave(0x4b414b49, "heroBarrel");
  assert.equal(wave.contactX(), 30, "Twilight shares the same visible opening contact");
  wave.update(3.25, 104, 0, 104, { playerX: 226, speed: 104, skillMomentum: 0.4, active: false });

  assert.equal(wave.profileId, "heroBarrel");
  for (let x = 0; x <= 384; x += 24) {
    const crest = wave.crestY(x);
    const depth = wave.faceDepth(x);
    const powerFace = wave.powerFaceAt(x);
    const powerY = wave.ridingY(x, powerFace);
    const troughY = wave.ridingY(x, 1);
    const gradient = wave.surfaceGradientAt(x, powerFace);
    assert.ok(crest >= 74.5 && crest <= 81, `crest ${crest} at x=${x}`);
    assert.ok(depth >= 112 && depth <= 120, `depth ${depth} at x=${x}`);
    assert.ok(powerFace >= 0.53 && powerFace <= 0.66, `power face ${powerFace} at x=${x}`);
    assert.ok(powerY >= 132 && powerY <= 154, `ride band ${powerY} at x=${x}`);
    assert.ok(troughY >= 186.5 && troughY <= 202, `trough ${troughY} at x=${x}`);
    assert.ok(Number.isFinite(wave.slopeAt(x, powerFace)));
    assert.ok(Number.isFinite(gradient.x));
    assert.ok(gradient.face > 100 && gradient.face < 132);
  }
});

test("hero barrel has a broad readable pocket but one canonical contact edge", () => {
  const wave = new GameplayWave(0x54574c47, "heroBarrel");
  wave.curlX = 100;

  assert.equal(wave.contactX(), 196);
  assert.equal(contactX(wave), 196);
  assert.equal(contactX({ curlX: 100, profileId: "heroBarrel" }), 196);
  assert.equal(wave.curlContact(196), true);
  assert.equal(wave.curlContact(196.001), false);
  assert.equal(wave.pocketRisk(196), 1);
  assert.equal(wave.pocketRisk(252), 0.5);
  assert.equal(wave.pocketRisk(308), 0);
});

test("hero section state and three-quarter projection are pure and collision aligned", () => {
  const wave = new GameplayWave(0x54574c47, "heroBarrel");
  wave.curlX = 100;
  const before = snapshotWave(wave);
  const stages = [
    [0.1, "gather"],
    [0.3, "pitch"],
    [0.56, "open"],
    [0.76, "deep"],
    [0.92, "hero"],
    [0.99, "collapse"],
  ];
  let previousOuterRadius = 0;
  for (const [pressure, expectedStage] of stages) {
    wave.pressure = pressure;
    const section = sampleWaveSection(wave, 170, {});
    assert.equal(section.profileId, "heroBarrel");
    assert.equal(section.heroBarrel, true);
    assert.equal(section.stage, expectedStage);
    assert.equal(section.contactX, 196);
    assert.equal(section.gap, -26);
    assert.equal(section.pocket, wave.pocketRisk(170));
    assert.ok(section.outerRadiusX >= previousOuterRadius);
    previousOuterRadius = section.outerRadiusX;
  }

  wave.pressure = 1;
  const closed = wave.sectionState(170, {});
  assert.equal(closed.stage, "collapse");
  assert.equal(closed.closure, 1);
  assert.ok(closed.aperture >= 0.339 && closed.aperture <= 0.341, "danger keeps visible tube negative space");

  const focusFace = wave.powerFaceAt(300);
  const canonical = projectWavePoint(wave, 300, focusFace, focusFace, {});
  assert.equal(canonical.x, 300);
  assert.equal(canonical.y, wave.ridingY(300, focusFace));
  const foreground = projectWavePoint(wave, 300, 0.9, focusFace, {});
  assert.ok(foreground.x > canonical.x, "deeper water fans toward screen-right");
  assert.ok(foreground.y > wave.ridingY(300, 0.9), "deeper water drops toward the foreground");

  const after = snapshotWave(wave);
  before.pressure = 1;
  assert.deepEqual(after, before, "sampling and projection never mutate gameplay state");
});

test("hero presentation stages keep an open aperture and the exact collision edge", () => {
  const wave = new GameplayWave(0x54574c47, "heroBarrel");
  wave.curlX = 76;
  const player = { x: 208, face: wave.powerFaceAt(208), state: "riding", curlTimer: 0 };
  assert.equal(isHeroBarrelWave(wave), true);

  const stages = [
    [0.12, "gather"],
    [0.34, "pitch"],
    [0.58, "open"],
    [0.78, "deep"],
    [0.94, "hero"],
    [1, "collapse"],
  ];
  for (const [pressure, expected] of stages) {
    wave.pressure = pressure;
    assert.equal(heroBarrelStage(wave, player).id, expected);
    const geometry = heroBarrelGeometry(wave, player);
    assert.equal(geometry.contactX, wave.contactX());
    assert.equal(geometry.collisionX, wave.contactX());
    assert.ok(geometry.aperture.right > geometry.aperture.left + 12);
    assert.ok(geometry.aperture.bottom > geometry.aperture.top + 28);
    if (expected === "open" || expected === "deep" || expected === "hero") {
      assert.ok(geometry.aperture.top < 79, `${expected} exposes real sky above the horizon`);
      assert.ok(geometry.aperture.bottom > 130, `${expected} exposes backwater below the horizon`);
    }
  }

  wave.pressure = 0.5;
  player.curlTimer = 0.2;
  const caughtStage = heroBarrelStage(wave, player);
  assert.equal(caughtStage.id, "collapse", "contact begins the authored collapse beat");
  assert.ok(caughtStage.collapseMix > 0 && caughtStage.collapseMix < 1, "collapse eases through the contact delay");
  const caughtGeometry = heroBarrelGeometry(wave, player);
  assert.ok(caughtGeometry.aperture.bottom > caughtGeometry.aperture.top + 28, "catch animation cannot close the sky window into a wall");
});

test("Twilight's passing curtain advances right without following rider direction", () => {
  const wave = new GameplayWave(0x54574c47, "heroBarrel");
  const player = { x: 224, face: 0.58, state: "riding", curlTimer: 0, travelDirection: 1 };
  const samples = [];
  for (const curlX of [28, 64, 108, 164]) {
    wave.curlX = curlX;
    const right = heroPassedSkyWindow(wave, player).right;
    const geometry = heroBarrelGeometry(wave, player);
    samples.push(right);
    assert.ok(right < geometry.contactX, "revealed sky remains behind the falling edge");
    assert.equal(geometry.curtain.edgeX, geometry.contactX - 3);
    assert.ok(geometry.curtain.baseX < geometry.curtain.edgeX, "the waterfall leans back into churn");

    player.travelDirection = -1;
    assert.equal(heroPassedSkyWindow(wave, player).right, right, "reversal cannot mirror the passing wave");
    assert.equal(heroBarrelGeometry(wave, player).curtain.edgeX, geometry.curtain.edgeX);
    player.travelDirection = 1;
  }
  assert.deepEqual(samples, [...samples].sort((a, b) => a - b));
  assert.equal(new Set(samples).size, samples.length, "each advancing contact reveals more horizon");
});

test("Twilight waterfall frames pour forward, freeze for Reduced Motion, and densify on collapse", () => {
  const sequence = Array.from({ length: 18 }, (_, index) => heroWaterfallFrame(index * 0.5, 0, false));
  assert.ok(sequence.includes("pourA"));
  assert.ok(sequence.includes("pourB"));
  assert.ok(sequence.includes("pourC"));
  assert.equal(heroWaterfallFrame(0, 0, true), "pourB");
  assert.equal(heroWaterfallFrame(999, 0, true), "pourB");
  assert.equal(heroWaterfallFrame(0, 0.7, false), "pourD");
});

test("contact collapse deepens the curtain without making its lip retreat", () => {
  const wave = new GameplayWave(0x54574c47, "heroBarrel");
  wave.curlX = 92;
  wave.pressure = 0.88;
  const player = { x: 224, face: 0.58, state: "riding", curlTimer: 0 };
  const safe = heroBarrelGeometry(wave, player);
  player.curlTimer = TUNING.curlCatchDelay * 0.7;
  const caught = heroBarrelGeometry(wave, player);
  assert.equal(caught.curtain.edgeX, safe.curtain.edgeX);
  assert.equal(caught.contactX, safe.contactX);
  assert.ok(caught.curtain.baseX < safe.curtain.baseX, "collapse adds downward/backward wash only");
});

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
  const wave = { travel: 0, worldTravel: 0, time: 0 };
  const player = { speed: 132, waveMomentum: 1, travelDirection: 1 };
  const phaseKeys = ["backWater", "speedFeedback", "swellContours", "faceGlints", "powerSeam", "crest", "fall"];
  advanceWavePresentationClocks(clocks, wave, player, 138);

  const samples = [
    { travel: 96, worldTravel: 96, time: 1, speed: 132, momentum: 1, direction: 1 },
    { travel: 97, worldTravel: 95, time: 2, speed: 8, momentum: 0.02, direction: -1 },
    { travel: 101, worldTravel: 91, time: 3, speed: 42, momentum: 0.18, direction: -1 },
    { travel: 109, worldTravel: 99, time: 4, speed: 96, momentum: 0.76, direction: 1 },
  ];
  let previous = Object.fromEntries(phaseKeys.map((key) => [key, clocks[key]]));
  for (const sample of samples) {
    Object.assign(wave, { travel: sample.travel, worldTravel: sample.worldTravel, time: sample.time });
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

test("waterfall gravity clock advances from wave time, not rider speed", () => {
  const clocks = createWavePresentationClocks();
  const wave = { travel: 0, worldTravel: 0, time: 0 };
  const player = { speed: 8, waveMomentum: 0, travelDirection: -1 };
  advanceWavePresentationClocks(clocks, wave, player, 138);

  Object.assign(wave, { travel: 2, time: 1 });
  advanceWavePresentationClocks(clocks, wave, player, 138);
  const slowDelta = clocks.fall;

  Object.assign(wave, { travel: 142, time: 2 });
  Object.assign(player, { speed: 138, waveMomentum: 1, travelDirection: 1 });
  advanceWavePresentationClocks(clocks, wave, player, 138);
  assert.equal(clocks.fall - slowDelta, slowDelta);

  const frozen = clocks.fall;
  Object.assign(wave, { travel: 282, time: 3 });
  advanceWavePresentationClocks(clocks, wave, player, 138, true);
  assert.equal(clocks.fall, frozen, "Reduced Motion freezes falling-water animation");
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
