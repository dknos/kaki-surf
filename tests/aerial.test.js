import assert from "node:assert/strict";
import test from "node:test";

import {
  AERIAL_MILESTONES,
  AERIAL_PANORAMA,
  aerialAltitudeForFlight,
  aerialCameraTarget,
  aerialPanoramaCropX,
  aerialPanoramaCropY,
  aerialZoneForAltitude,
  projectAirY,
  qualifyAerialLaunch,
} from "../js/aerial.js";
import { BOARDS, FIXED_STEP } from "../js/config.js";
import { SurfSimulation } from "../js/simulation.js";

const POOR_LINE = Object.freeze({
  launchStrength: 0.76,
  speedRatio: 0.24,
  uphillApproach: 0.08,
  charge: 0.12,
  pocketRisk: 0.2,
});

const STRONG_LINE = Object.freeze({
  launchStrength: 1.28,
  speedRatio: 0.96,
  uphillApproach: 0.76,
  charge: 0.92,
  pocketRisk: 0.72,
});

test("launch qualification separates beach, cloud, upper atmosphere, and earned space", () => {
  const coastal = qualifyAerialLaunch(POOR_LINE);
  const cloud = qualifyAerialLaunch({
    launchStrength: 0.94,
    speedRatio: 0.58,
    uphillApproach: 0.28,
    charge: 0.38,
    pocketRisk: 0.42,
  });
  const upper = qualifyAerialLaunch(STRONG_LINE);
  const wastedTurbo = qualifyAerialLaunch({ ...POOR_LINE, turboActive: true, turboOverdrive: 1 });
  const space = qualifyAerialLaunch({ ...STRONG_LINE, turboActive: true, turboOverdrive: 1 });

  assert.equal(coastal.zone, "coastalSky");
  assert.equal(cloud.zone, "cloudLayer");
  assert.equal(upper.zone, "upperAtmosphere");
  assert.equal(upper.spaceQualified, false, "a huge unboosted air does not reach space");
  assert.equal(wastedTurbo.spaceQualified, false, "Turbo cannot rescue a poor line");
  assert.equal(space.zone, "kakiSpace");
  assert.equal(space.spaceQualified, true);
  assert.ok(space.turboLiftMultiplier > wastedTurbo.turboLiftMultiplier);
  assert.ok(space.turboLiftMultiplier > 1.35, "a qualified Turbo lip adds material real lift");
});

test("canonical altitude rises nonlinearly and anticipates the wave on descent", () => {
  const profile = qualifyAerialLaunch({ ...STRONG_LINE, turboActive: true, turboOverdrive: 1 });
  const low = aerialAltitudeForFlight({
    state: "airborne",
    flightHeight: 12,
    surfaceClearance: 12,
    verticalVelocity: -80,
    ceiling: profile.ceiling,
    expectedHeight: profile.expectedHeight,
  });
  const apex = aerialAltitudeForFlight({
    state: "airborne",
    flightHeight: profile.expectedHeight,
    surfaceClearance: profile.expectedHeight,
    verticalVelocity: 0,
    ceiling: profile.ceiling,
    expectedHeight: profile.expectedHeight,
  });
  const returning = aerialAltitudeForFlight({
    state: "airborne",
    flightHeight: profile.expectedHeight * 0.45,
    surfaceClearance: 18,
    verticalVelocity: 82,
    ceiling: profile.ceiling,
    expectedHeight: profile.expectedHeight,
  });

  assert.ok(low < 0.2, "ordinary launch motion stays near the coast");
  assert.ok(apex > 0.98, "qualified apex reaches Kaki Space");
  assert.ok(returning < 0.12, "the camera begins restoring the wave before contact");
  assert.equal(aerialAltitudeForFlight({ state: "riding", flightHeight: 200, ceiling: 1 }), 0);
});

test("panorama crop covers every altitude and signed horizontal wrap without blank space", () => {
  const maxY = AERIAL_PANORAMA.height - AERIAL_PANORAMA.viewportHeight;
  assert.equal(aerialPanoramaCropY(0), maxY);
  assert.equal(aerialPanoramaCropY(1), 0);
  for (let step = 0; step <= 100; step += 1) {
    const y = aerialPanoramaCropY(step / 100);
    assert.ok(y >= 0 && y <= maxY);
  }

  const center = aerialPanoramaCropX(0);
  const right = aerialPanoramaCropX(240);
  const left = aerialPanoramaCropX(-240);
  assert.equal(center, 192, "the authored opening crop starts on the single coherent coast");
  assert.ok(right > center);
  assert.ok(left < center);
  for (const x of [aerialPanoramaCropX(-100000), aerialPanoramaCropX(100000)]) {
    assert.ok(x >= 0 && x < AERIAL_PANORAMA.width);
  }
});

test("camera shelves and zone thresholds escalate without a hard image swap", () => {
  const samples = [0, 0.1, 0.2, 0.36, 0.5, 0.62, 0.8, 0.88, 1];
  const targets = samples.map((altitude) => aerialCameraTarget(altitude));
  for (let index = 1; index < targets.length; index += 1) {
    assert.ok(targets[index] >= targets[index - 1]);
  }
  assert.equal(aerialZoneForAltitude(0.1).id, "coastalSky");
  assert.equal(aerialZoneForAltitude(0.36).id, "cloudLayer");
  assert.equal(aerialZoneForAltitude(0.62).id, "upperAtmosphere");
  assert.equal(aerialZoneForAltitude(0.88).id, "kakiSpace");
  assert.deepEqual(AERIAL_MILESTONES.map((milestone) => milestone.text), [
    "BIG AIR",
    "CLOUD BREAKER",
    "STRATOSPHERE KAKI",
    "KAKI IN ORBIT",
  ]);
});

test("high-air projection is natural below the threshold and monotonic above it", () => {
  assert.equal(projectAirY(140), 140);
  assert.equal(projectAirY(80), 80);
  assert.equal(projectAirY(60), 60);
  const natural = [140, 110, 80, 60, 20, -20, -80];
  const projected = natural.map((y) => projectAirY(y));
  for (let index = 1; index < projected.length; index += 1) {
    assert.ok(projected[index] < projected[index - 1], `${natural[index]} must remain visibly above ${natural[index - 1]}`);
  }
  assert.ok(projectAirY(-1e9) > 8, "unsupported height approaches but never crosses the rider top bound");
  assert.ok(projectAirY(-122) >= 16, "the authored maximum remains inside the complete-rider band");
  assert.ok(projectAirY(-35) - projectAirY(-40) > 0.7,
    "five physical pixels near a real apex must remain visibly separated");
  assert.ok(71 - projectAirY(-122) >= 40, "the supported maximum air retains at least 40 pixels of visible rise");
});

test("only a strong Turbo lip launch reaches orbit in the fixed-step simulation", () => {
  const launch = ({ turbo, speed, slopeDrive, charge, controlMode = "advanced" }) => {
    const simulation = new SurfSimulation({ seed: 0xa3117, controlMode });
    simulation.reset({ board: BOARDS.moonLog, controlMode, worldQa: { quiet: true } });
    simulation.begin();
    Object.assign(simulation.player, {
      state: "lip",
      face: 0.01,
      faceVelocity: slopeDrive,
      slopeDrive,
      speed,
      charge,
      turboActive: turbo,
      turboOverdrive: turbo ? 1 : 0,
    });
    Object.assign(simulation.player.speedPotential, { pocket: 0.78, seamDrive: 0.86 });
    simulation.wave.curlX = -520;
    simulation.launch({ x: 0 });
    const initialVY = simulation.player.airVY;
    const events = [];
    let maxAltitude = 0;
    for (let step = 0; step < 360 && simulation.player.state === "airborne"; step += 1) {
      simulation.update(FIXED_STEP, {});
      maxAltitude = Math.max(maxAltitude, simulation.player.aerialAltitude);
      simulation.consumeEvents((event) => events.push(event));
    }
    return { simulation, initialVY, maxAltitude, events };
  };

  const weakTurbo = launch({ turbo: true, speed: 62, slopeDrive: -0.08, charge: 0.12 });
  const huge = launch({ turbo: false, speed: 154, slopeDrive: -0.82, charge: 0.92 });
  const orbit = launch({ turbo: true, speed: 154, slopeDrive: -0.82, charge: 0.92 });
  const simpleOrbit = launch({
    turbo: true,
    speed: 154,
    slopeDrive: -0.82,
    charge: 0.92,
    controlMode: "simple",
  });

  assert.equal(weakTurbo.simulation.player.aerialSpaceQualified, false);
  assert.equal(huge.simulation.player.aerialSpaceQualified, false);
  assert.equal(orbit.simulation.player.aerialSpaceQualified, true);
  assert.equal(simpleOrbit.simulation.player.aerialSpaceQualified, true);
  assert.ok(huge.maxAltitude >= 0.62 && huge.maxAltitude < 0.8);
  assert.ok(orbit.maxAltitude >= 0.88);
  assert.ok(simpleOrbit.maxAltitude >= 0.88);
  assert.ok(orbit.initialVY < huge.initialVY * 1.3, "qualified Turbo adds a materially larger launch impulse");
  assert.ok(orbit.events.some((event) => event.type === "aerialMilestone" && event.payload.index === 4));
  assert.equal(huge.events.some((event) => event.type === "aerialMilestone" && event.payload.index === 4), false);
});

test("a full orbital ascent and descent keeps altitude and horizontal world position continuous", () => {
  const simulation = new SurfSimulation({ seed: 0x0b17a1, controlMode: "advanced" });
  simulation.reset({ board: BOARDS.moonLog, controlMode: "advanced", worldQa: { quiet: true } });
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

  const altitude = [];
  const worldX = [];
  let descendingAt = -1;
  for (let step = 0; step < 420 && simulation.player.state === "airborne"; step += 1) {
    simulation.update(FIXED_STEP, {});
    altitude.push(simulation.player.aerialAltitude);
    worldX.push(simulation.player.airX + simulation.cameraWorldX);
    if (descendingAt < 0 && simulation.player.airVY > 0) descendingAt = altitude.length - 1;
    simulation.consumeEvents(() => {});
  }

  assert.ok(descendingAt > 0);
  assert.ok(Math.max(...altitude) >= 0.88);
  for (let index = 1; index < altitude.length; index += 1) {
    assert.ok(Math.abs(altitude[index] - altitude[index - 1]) < 0.045, "no vertical panorama swap may jump");
    assert.ok(Math.abs(worldX[index] - worldX[index - 1]) < 2, "camera handoff retains horizontal world position");
  }
  const descent = altitude.slice(descendingAt + 3);
  for (let index = 1; index < descent.length; index += 1) {
    assert.ok(descent[index] <= descent[index - 1] + 1e-9, "descent returns through the same panorama");
  }
  assert.ok(altitude.at(-1) < 0.08, "the real wave is restored before landing contact");
});
