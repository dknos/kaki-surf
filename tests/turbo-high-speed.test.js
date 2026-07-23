import assert from "node:assert/strict";
import test from "node:test";

import { BOARDS, FIXED_STEP, TUNING } from "../js/config.js";
import { SurfSimulation } from "../js/simulation.js";
import { WORLD_LAYER_CONFIG } from "../js/world-catalog.js";
import { projectWorldX } from "../js/world-collision.js";
import { WorldSimulation } from "../js/world.js";

const MAX_COOKING_SPEED = TUNING.maxSpeed
  * Math.max(...Object.values(BOARDS).map((board) => board.maxSpeed))
  * TUNING.turboCookingSpeedCapMultiplier;

test("swept high-speed traversal still catches wildlife, powerups, and foam gates", () => {
  const crossing = worldContext({
    player: { previousX: 170, x: 222, previousY: 128, y: 128, vx: MAX_COOKING_SPEED },
  });

  const sharkWorld = new WorldSimulation({ seed: 0x51a4 });
  sharkWorld.forceWildlife("shark", { phase: "crossing", x: 196, y: 128, speed: 0 });
  const sharkInteractions = updateWorld(sharkWorld, crossing);
  assert.ok(sharkInteractions.some((event) => event.type === "sharkCollision"));

  for (const kind of ["mangoRush", "moonPop", "starFoam"]) {
    const powerupWorld = new WorldSimulation({ seed: 0x5000 + kind.length });
    powerupWorld.forcePowerup(kind, { phase: "available", x: 196, y: 128, speed: 0 });
    const interactions = updateWorld(powerupWorld, crossing);
    assert.ok(interactions.some((event) => event.type === "powerupCollected" && event.kind === kind), kind);
  }

  const gateWorld = new WorldSimulation({ seed: 0xf0a6 });
  gateWorld.forceFoamGates("dolphin", { count: 1, screenX: 196, y: 128, eventSeed: 9 });
  const gateInteractions = updateWorld(gateWorld, crossing);
  assert.ok(gateInteractions.some((event) => event.type === "foamGateCleared"));
  assert.ok(gateInteractions.some((event) => event.type === "foamGateSeriesCompleted"));
});

test("Cooking-speed lip takeoff and landing detection remain continuous", () => {
  const simulation = beginRiding(BOARDS.moonLog);
  Object.assign(simulation.player, {
    state: "riding",
    face: 0.02,
    faceVelocity: -0.82,
    slopeDrive: -0.82,
    speed: simulation.baseRideSpeedCap() * 1.44,
    charge: 1,
    waveMomentum: 1,
    turbo: 0,
    turboActive: false,
    turboTier: "cooking",
    turboCookingTimer: 0.6,
  });
  simulation.update(FIXED_STEP, { x: 1 });
  assert.equal(simulation.player.state, "airborne");
  assert.ok(simulation.player.airVY < 0);
  assert.equal(simulation.player.aerialTurboLaunch, 1);

  const surfaceY = simulation.wave.ridingY(simulation.player.airX, simulation.player.landingFace);
  const surfaceAngle = simulation.wave.slopeAt(simulation.player.airX, simulation.player.landingFace);
  Object.assign(simulation.player, {
    airY: surfaceY - 0.2,
    previousAirY: surfaceY - 4,
    airVY: 82,
    airVX: 38,
    boardAngle: surfaceAngle,
    bodyAngle: surfaceAngle,
    angularVelocity: 0,
  });
  simulation.update(FIXED_STEP, {});
  assert.ok(["landing", "riding"].includes(simulation.player.state), simulation.player.state);
  assert.notEqual(simulation.player.state, "wipeout");
});

test("maximum progressive Turbo remains bounded through left and right traversal", () => {
  for (const direction of [-1, 1]) {
    const simulation = beginRiding(BOARDS.mangoFish);
    simulation.player.directionIntent = direction;
    simulation.player.travelDirection = direction;
    simulation.player.motionDirection = direction;
    let maximum = 0;
    for (let step = 0; step < 420; step += 1) {
      simulation.update(FIXED_STEP, { x: direction, turbo: true });
      simulation.consumeEvents(() => {});
      maximum = Math.max(maximum, simulation.player.speed);
      assert.ok(Number.isFinite(simulation.player.worldX));
      assert.ok(Number.isFinite(simulation.camera.worldX));
    }
    assert.ok(maximum > simulation.baseRideSpeedCap() * 1.3, `${direction}: ${maximum}`);
    assert.ok(maximum <= simulation.baseRideSpeedCap() * 1.5 + 1e-9);
    assert.equal(Math.sign(simulation.player.travelDirection), direction);
  }
});

test("curl contact and world-object culling remain valid beyond the new maximum speed", () => {
  const simulation = beginRiding(BOARDS.moonLog);
  simulation.wave.time = TUNING.curlGrace + 1;
  simulation.wave.curlX = simulation.player.worldX;
  assert.equal(simulation.wave.curlContact(simulation.player.worldX), true);

  const world = new WorldSimulation({ seed: 0xc011 });
  const entity = world.spawnTraffic("propPlane", {
    layer: "far",
    screenX: 370,
    speed: MAX_COOKING_SPEED,
    direction: 1,
    duration: 10,
  });
  assert.ok(entity);
  let previousCameraWorldX = 0;
  let cameraWorldX = 0;
  for (let step = 0; step < 360 && entity.active; step += 1) {
    previousCameraWorldX = cameraWorldX;
    cameraWorldX += MAX_COOKING_SPEED * FIXED_STEP;
    world.update(FIXED_STEP, worldContext({ cameraWorldX, previousCameraWorldX }));
  }
  assert.equal(entity.active, false, "high-speed camera traversal returns offscreen traffic to its pool");
  assert.ok(Number.isFinite(projectWorldX(entity.worldX, cameraWorldX, WORLD_LAYER_CONFIG.far.parallax)));
});

function beginRiding(board) {
  const simulation = new SurfSimulation({ seed: 0x48494748, mode: "endless", controlMode: "advanced" });
  simulation.reset({ board, mode: "endless", controlMode: "advanced", tutorialEnabled: false });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "riding",
    stateTime: 1,
    x: 260,
    face: 0.48,
    speed: 110,
  });
  simulation.wave.curlX = -1_000;
  simulation.consumeEvents(() => {});
  return simulation;
}

function updateWorld(world, context) {
  const interactions = [];
  world.update(FIXED_STEP, context);
  world.consumeInteractions((event) => interactions.push({ ...event }));
  return interactions;
}

function worldContext(overrides = {}) {
  const player = overrides.player ?? {};
  return {
    cameraWorldX: overrides.cameraWorldX ?? 0,
    previousCameraWorldX: overrides.previousCameraWorldX ?? overrides.cameraWorldX ?? 0,
    direction: overrides.direction ?? 1,
    upcomingWildlife: "",
    paceBeatsBest: false,
    lastWipeoutAge: Infinity,
    giantTrickAge: Infinity,
    waterlineY: 79,
    curlApproaching: false,
    player: {
      x: player.x ?? 192,
      previousX: player.previousX ?? player.x ?? 192,
      y: player.y ?? 128,
      previousY: player.previousY ?? player.y ?? 128,
      vx: player.vx ?? 0,
      vy: player.vy ?? 0,
      radius: 7,
      state: "riding",
      allowWhaleRide: true,
    },
    control: {
      horizontalAcceleration: 38,
      verticalAcceleration: 62,
      maxHorizontalSpeed: MAX_COOKING_SPEED,
      maxVerticalSpeed: 120,
      gravity: 0,
    },
  };
}
