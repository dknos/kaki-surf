import assert from "node:assert/strict";
import test from "node:test";

import {
  POWERUP_CATALOG,
  TRAFFIC_CATALOG,
  WORLD_LAYER_CONFIG,
  WORLD_LAYER_ORDER,
  WORLD_LIMITS,
  isBoatKind,
} from "../js/world-catalog.js";
import {
  isReachablePickup,
  isSharkPathFair,
  projectWorldX,
  sweptAabbContact,
  sweptCircleContact,
  worldXForScreenX,
} from "../js/world-collision.js";
import { trafficScreenDirection, watercraftClearsBreaker } from "../js/world-visuals.js";
import { stableTrafficWorldDelta, WorldSimulation } from "../js/world.js";

const STEP = 1 / 120;

function context(overrides = {}) {
  const player = overrides.player ?? {};
  return {
    cameraWorldX: overrides.cameraWorldX ?? 0,
    previousCameraWorldX: overrides.previousCameraWorldX ?? overrides.cameraWorldX ?? 0,
    direction: overrides.direction ?? 1,
    upcomingWildlife: overrides.upcomingWildlife ?? "",
    paceBeatsBest: overrides.paceBeatsBest ?? false,
    lastWipeoutAge: overrides.lastWipeoutAge ?? Infinity,
    giantTrickAge: overrides.giantTrickAge ?? Infinity,
    waterlineY: overrides.waterlineY ?? 79,
    curlScreenX: overrides.curlScreenX,
    curlApproaching: overrides.curlApproaching ?? false,
    player: {
      x: player.x ?? 192,
      previousX: player.previousX ?? player.x ?? 192,
      y: player.y ?? 128,
      previousY: player.previousY ?? player.y ?? 128,
      vx: player.vx ?? 0,
      vy: player.vy ?? 0,
      radius: player.radius ?? 7,
      state: player.state ?? "riding",
      allowWhaleRide: player.allowWhaleRide ?? true,
    },
    control: {
      horizontalAcceleration: overrides.control?.horizontalAcceleration ?? 38,
      verticalAcceleration: overrides.control?.verticalAcceleration ?? 62,
      maxHorizontalSpeed: overrides.control?.maxHorizontalSpeed ?? 90,
      maxVerticalSpeed: overrides.control?.maxVerticalSpeed ?? 120,
      gravity: overrides.control?.gravity ?? 0,
    },
  };
}

function runFor(world, seconds, worldContext = context(), { events = null, interactions = null } = {}) {
  const steps = Math.ceil(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    world.update(STEP, worldContext);
    world.consumeEvents((event) => events?.push({ ...event }));
    world.consumeInteractions((interaction) => interactions?.push({ ...interaction }));
  }
}

test("catalog fixes bounded layer pools and only exposes the final three powerups", () => {
  assert.deepEqual(WORLD_LAYER_ORDER, ["far", "mid", "near"]);
  assert.deepEqual(
    Object.fromEntries(WORLD_LAYER_ORDER.map((layer) => [layer, WORLD_LAYER_CONFIG[layer].capacity])),
    { far: 8, mid: 8, near: 3 },
  );
  assert.deepEqual(Object.keys(POWERUP_CATALOG), ["mangoRush", "moonPop", "starFoam"]);
  for (const kind of ["sailboat", "speedboat", "fishingBoat", "tugboat", "cargoShip", "jetSki", "rescueCraft"]) {
    assert.equal(isBoatKind(kind), true, `${kind} is catalogued as a boat`);
    assert.ok(["horizon", "waterBack"].includes(TRAFFIC_CATALOG[kind].renderBand), `${kind} stays behind the wave`);
  }
  for (const kind of ["propPlane", "seaplane", "helicopter", "bannerPlane"]) {
    assert.equal(TRAFFIC_CATALOG[kind].aircraft, true);
  }
});

test("watercraft stay in water bands and face their projected screen motion", () => {
  const world = new WorldSimulation({ seed: 0x0cea51de });
  const speedboat = world.spawnTraffic("speedboat", {
    layer: "mid",
    screenX: 192,
    y: 30,
    speed: 0,
    duration: 20,
  });
  const sailboat = world.spawnTraffic("sailboat", {
    layer: "far",
    screenX: 192,
    y: 120,
    speed: 0,
    duration: 20,
  });
  assert.equal(speedboat.y, WORLD_LAYER_CONFIG.mid.waterYRange[0]);
  assert.equal(sailboat.y, WORLD_LAYER_CONFIG.far.waterYRange[1]);

  const projectedBoat = {
    previousWorldX: 100,
    worldX: 101,
    direction: 1,
  };
  assert.equal(trafficScreenDirection(projectedBoat, {
    context: { previousCameraWorldX: 0, cameraWorldX: 0 },
  }, "mid"), 1, "self-propelled screen motion faces right");
  const config = WORLD_LAYER_CONFIG.mid;
  const cameraContext = { previousCameraWorldX: 0, cameraWorldX: 10 };
  const stableDelta = stableTrafficWorldDelta({ vx: 12 / config.parallax }, config, cameraContext, STEP);
  const stableBoat = {
    previousWorldX: 100,
    worldX: 100 + stableDelta,
    direction: 1,
  };
  assert.equal(trafficScreenDirection(stableBoat, { context: cameraContext }, "mid"), 1,
    "camera motion changes boat speed without reversing its intended travel");

  const previousScreenX = projectWorldX(stableBoat.previousWorldX, cameraContext.previousCameraWorldX, config.parallax);
  const currentScreenX = projectWorldX(stableBoat.worldX, cameraContext.cameraWorldX, config.parallax);
  assert.ok(currentScreenX > previousScreenX, "forward-moving traffic never ping-pongs backward on screen");
});

test("ordinary boats disappear behind the curl while race craft remain safely ahead", () => {
  const simulation = { wave: { curlX: 72 }, player: { x: 232 } };
  assert.equal(watercraftClearsBreaker({ kind: "fishingBoat" }, 130, simulation), false);
  assert.equal(watercraftClearsBreaker({ kind: "fishingBoat" }, 300, simulation), true);
  assert.equal(watercraftClearsBreaker({ kind: "speedboat", activity: "race" }, 330, simulation), true);
  assert.equal(watercraftClearsBreaker({ kind: "speedboat", activity: "race" }, 204, simulation), false);
  assert.equal(watercraftClearsBreaker({ kind: "speedboat", activity: "race" }, 148, simulation), false);
});

test("spatial helpers catch swept contacts, invert projection, and distinguish reachable paths", () => {
  assert.equal(
    sweptCircleContact({ x: 0, y: 0 }, { x: 20, y: 0 }, 2, { x: 10, y: 0 }, { x: 10, y: 0 }, 2),
    true,
    "a fast body cannot tunnel through a circle",
  );
  assert.equal(
    sweptAabbContact({ x: 0, y: 0 }, { x: 20, y: 0 }, 2, 2, { x: 10, y: 0 }, { x: 10, y: 0 }, 2, 2),
    true,
  );

  const worldX = worldXForScreenX(310, 1200, 0.32);
  assert.equal(projectWorldX(worldX, 1200, 0.32), 310);
  assert.ok(projectWorldX(worldX, 1240, 0.32) < 310, "forward camera travel moves a fixed world object backward");
  assert.ok(projectWorldX(worldX, 1160, 0.32) > 310, "reversal changes apparent parallax coherently");

  const player = { x: 192, y: 128, vx: 0, vy: 0 };
  assert.equal(isReachablePickup({ player, target: { x: 212, y: 120 }, interceptTime: 1 }), true);
  assert.equal(
    isReachablePickup({
      player,
      target: { x: 360, y: 30 },
      interceptTime: 0.2,
      control: { horizontalAcceleration: 4, verticalAcceleration: 4, maxHorizontalSpeed: 20, maxVerticalSpeed: 20 },
    }),
    false,
  );
});

test("shark fairness rejects unavoidable or untelegraphed paths and accepts a real escape", () => {
  const trapped = {
    player: { x: 192, y: 128, vx: 0, vy: 0, state: "riding" },
    shark: { x: 192, y: 128, vx: 0, vy: 0 },
    timeToImpact: 1,
    telegraphTime: 1,
    control: { horizontalAcceleration: 0, verticalAcceleration: 0, maxHorizontalSpeed: 1, maxVerticalSpeed: 1 },
  };
  assert.equal(isSharkPathFair(trapped), false);
  assert.equal(isSharkPathFair({ ...trapped, telegraphTime: 0.3 }), false);
  assert.equal(
    isSharkPathFair({
      ...trapped,
      control: { horizontalAcceleration: 54, verticalAcceleration: 90, maxHorizontalSpeed: 90, maxVerticalSpeed: 120 },
    }),
    true,
  );
  assert.equal(isSharkPathFair({ ...trapped, player: { ...trapped.player, state: "wipeout" } }), false);
});

test("same seed and inputs reproduce schedules and pooled world state exactly", () => {
  const first = new WorldSimulation({ seed: 0x51a7c0de, condition: "twilightGlass" });
  const second = new WorldSimulation({ seed: 0x51a7c0de, condition: "twilightGlass" });
  let camera = 0;
  for (let step = 0; step < 5_400; step += 1) {
    const previousCamera = camera;
    const direction = step < 2_700 ? 1 : -1;
    camera += direction * 74 * STEP;
    const frameContext = context({ cameraWorldX: camera, previousCameraWorldX: previousCamera, direction });
    first.update(STEP, frameContext);
    second.update(STEP, frameContext);
    first.consumeEvents(() => {});
    second.consumeEvents(() => {});
    first.consumeInteractions(() => {});
    second.consumeInteractions(() => {});
    for (const world of [first, second]) {
      const activeInteractive = world.wildlife.filter((entity) => entity.active).length
        + world.powerups.filter((entity) => entity.active).length;
      assert.ok(activeInteractive <= 1, "interactive quiet ownership prevents overlap");
    }
  }
  assert.deepEqual(first.snapshot(), second.snapshot());
  assert.equal(first.droppedEventCount, 0);
  assert.equal(first.droppedInteractionCount, 0);
});

test("Twilight never schedules traffic-backed events hidden by the hero barrel", () => {
  const world = new WorldSimulation({ seed: 1262570313, condition: "twilightGlass" });
  const events = [];
  const interactions = [];
  runFor(world, 78, context({ cameraWorldX: 2200, previousCameraWorldX: 2199 }), {
    events,
    interactions,
  });

  assert.equal(Object.values(world.traffic).flat().some((entity) => entity.active), false);
  assert.equal(world.carrier.hasAppeared, false);
  assert.equal(world.courier.active, false);
  assert.equal(world.race.active, false);
  assert.equal(world.aircraftDrop.active, false);
  assert.equal(events.some((event) => ["trafficSpawned", "courierPhase", "racePhase", "aircraftDropPhase", "carrierPhase"].includes(event.type)), false);
  assert.equal(interactions.some((event) => ["speedboatRaceWon", "fleetAirshowCompleted"].includes(event.type)), false);
});

test("layer streams are isolated from wildlife and powerup scheduling", () => {
  const baseline = new WorldSimulation({ seed: 0x1a2b3c4d });
  const noisyFarLayer = new WorldSimulation({ seed: 0x1a2b3c4d });
  for (let index = 0; index < WORLD_LAYER_CONFIG.far.capacity; index += 1) {
    assert.ok(noisyFarLayer.spawnTraffic("cargoShip", { layer: "far" }));
  }

  const baselineGameplay = [];
  const noisyGameplay = [];
  for (let step = 0; step < 7_200; step += 1) {
    const frameContext = context();
    baseline.update(STEP, frameContext);
    noisyFarLayer.update(STEP, frameContext);
    baseline.consumeEvents((event) => {
      if (event.type === "wildlifePhase" || event.type === "powerupPhase" || event.type === "carrierPhase") {
        baselineGameplay.push([event.type, event.time, event.kind, event.phase]);
      }
    });
    noisyFarLayer.consumeEvents((event) => {
      if (event.type === "wildlifePhase" || event.type === "powerupPhase" || event.type === "carrierPhase") {
        noisyGameplay.push([event.type, event.time, event.kind, event.phase]);
      }
    });
    baseline.consumeInteractions(() => {});
    noisyFarLayer.consumeInteractions(() => {});
  }
  assert.deepEqual(noisyGameplay, baselineGameplay);
  assert.equal(noisyFarLayer.nextWildlifeCandidate, baseline.nextWildlifeCandidate);
  assert.equal(noisyFarLayer.nextPowerupCandidate, baseline.nextPowerupCandidate);
  assert.equal(noisyFarLayer.nextCarrierCandidate, baseline.nextCarrierCandidate);
});

test("traffic pools enforce caps, cull offscreen, and keep all ambience non-collidable", () => {
  const world = new WorldSimulation({ seed: 9 });
  const firstReference = world.traffic.far[0];
  for (const layer of WORLD_LAYER_ORDER) {
    const kinds = world.profile.traffic[layer];
    for (let index = 0; index < WORLD_LAYER_CONFIG[layer].capacity; index += 1) {
      const kind = kinds.find((candidate) => TRAFFIC_CATALOG[candidate].layers.includes(layer));
      const entity = world.spawnTraffic(kind, { layer, screenX: 192, speed: 0, duration: 30 });
      assert.ok(entity);
      assert.equal(entity.collidable, false);
    }
    const overflowKind = kinds.find((candidate) => TRAFFIC_CATALOG[candidate].layers.includes(layer));
    assert.equal(world.spawnTraffic(overflowKind, { layer }), null, `${layer} refuses overflow`);
  }

  world.traffic.far[0].worldX = 1_000_000;
  world.traffic.far[0].previousWorldX = 1_000_000;
  world.update(0.2, context());
  world.update(0.2, context());
  assert.equal(world.traffic.far[0].active, false, "offscreen traffic returns to its pool");
  world.reset({ seed: 9 });
  assert.equal(world.traffic.far[0], firstReference, "reset reuses fixed records");
});

test("dolphin, shark, and whale phase machines publish sparse deterministic interactions", () => {
  const playerContext = context();

  const dolphin = new WorldSimulation({ seed: 21 });
  dolphin.forceWildlife("dolphin", { phase: "catchable", x: 192, y: 128, speed: 0 });
  const dolphinInteractions = [];
  runFor(dolphin, STEP, playerContext, { interactions: dolphinInteractions });
  assert.equal(dolphin.wildlife[0].phase, "mounted");
  assert.ok(dolphinInteractions.some((record) => record.type === "dolphinMounted"));
  runFor(dolphin, 4.9, playerContext, { interactions: dolphinInteractions });
  assert.ok(dolphinInteractions.some((record) => record.type === "animalDismount" && record.reason === "dolphin"));

  const sharkHit = new WorldSimulation({ seed: 22 });
  sharkHit.forceWildlife("shark", { phase: "crossing", x: 192, y: 128, speed: 0 });
  const sharkHitInteractions = [];
  runFor(sharkHit, STEP, playerContext, { interactions: sharkHitInteractions });
  assert.ok(sharkHitInteractions.some((record) => record.type === "sharkCollision"));

  const sharkThread = new WorldSimulation({ seed: 23 });
  sharkThread.forceWildlife("shark", { phase: "crossing", x: 192, y: 151, speed: 0 });
  sharkThread.wildlife[1].phaseTime = 1.65 - STEP * 0.5;
  const sharkThreadInteractions = [];
  runFor(sharkThread, STEP, playerContext, { interactions: sharkThreadInteractions });
  assert.ok(sharkThreadInteractions.some((record) => record.type === "sharkThread"));
  assert.equal(sharkThreadInteractions.some((record) => record.type === "sharkCollision"), false);

  const whale = new WorldSimulation({ seed: 24 });
  whale.forceWildlife("whale", { phase: "ramp", x: 192, y: 128, speed: 0 });
  const whaleInteractions = [];
  runFor(whale, STEP, playerContext, { interactions: whaleInteractions });
  assert.equal(whale.wildlife[2].phase, "mounted");
  assert.ok(whaleInteractions.some((record) => record.type === "whaleMounted"));
  runFor(whale, 4.3, playerContext, { interactions: whaleInteractions });
  assert.ok(whaleInteractions.some((record) => record.type === "animalDismount" && record.reason === "whale"));
});

test("whales stay registered to the ocean even when requested during big air", () => {
  const world = new WorldSimulation({ seed: 0x0cea51de, condition: "twilightGlass" });
  const skyContext = context({
    waterlineY: 79,
    player: { x: 224, y: 38, state: "airborne" },
  });
  world.update(STEP, skyContext);
  const whale = world.forceWildlife("whale", {
    phase: "distant",
    screenX: 270,
    y: 38,
    speed: 0,
  });

  assert.ok(whale.y >= 107, `whale anchor escaped into the sky at y=${whale.y}`);
  assert.ok(whale.y <= 151, `whale anchor sank below the encounter band at y=${whale.y}`);
});

test("mounted animal direction follows the rider's stable world direction", () => {
  const world = new WorldSimulation({ seed: 0xb1d1, condition: "twilightGlass" });
  const whale = world.forceWildlife("whale", {
    phase: "mounted",
    screenX: 232,
    y: 128,
    speed: 0,
    direction: 1,
  });

  world.update(STEP, context({ direction: -1 }));
  assert.equal(whale.direction, -1);
  world.update(STEP, context({ direction: 1 }));
  assert.equal(whale.direction, 1);
});

test("Mango Rush, Moon Pop, and Star Foam collect, modify, consume, expire, and reset independently", () => {
  for (const kind of Object.keys(POWERUP_CATALOG)) {
    const world = new WorldSimulation({ seed: 100 + kind.length });
    world.forcePowerup(kind, { phase: "available", x: 192, y: 128, speed: 0 });
    const interactions = [];
    runFor(world, STEP, context(), { interactions });
    assert.ok(interactions.some((record) => record.type === "powerupCollected" && record.kind === kind));
    assert.equal(world.bonuses[kind].active, true);
    if (kind === "mangoRush") {
      assert.equal(world.getModifiers().uphillLossScale, 0.55);
      runFor(world, POWERUP_CATALOG[kind].activeFor + 0.1, context());
      assert.equal(world.bonuses[kind].active, false);
      assert.equal(world.getModifiers().uphillLossScale, 1);
    } else {
      assert.equal(world.consumePowerup(kind, "test"), true);
      assert.equal(world.bonuses[kind].active, false);
      assert.equal(kind === "moonPop" ? world.getModifiers().launchScale : world.getModifiers().protectsFlow, kind === "moonPop" ? 1 : false);
    }
    world.reset({ seed: world.seed });
    assert.equal(world.bonuses[kind].active, false);
  }

  const missed = new WorldSimulation({ seed: 501 });
  missed.forcePowerup("moonPop", { phase: "available", x: 30, y: 35, speed: 0 });
  const missEvents = [];
  const missInteractions = [];
  runFor(missed, POWERUP_CATALOG.moonPop.availableFor + 0.5, context({ player: { x: 340, y: 188 } }), {
    events: missEvents,
    interactions: missInteractions,
  });
  assert.ok(missEvents.some((record) => record.type === "powerupPhase" && record.phase === "missed"));
  assert.equal(missInteractions.some((record) => record.type === "powerupCollected"), false);
  assert.equal(missed.bonuses.moonPop.active, false);
});

test("reactive banner planes, boats, and the carrier remain harmless stateful spectacle", () => {
  const world = new WorldSimulation({ seed: 0xcafef00d, condition: "stormbreak" });
  world.update(STEP, context({ upcomingWildlife: "shark" }));
  world.consumeEvents(() => {});
  const banner = world.spawnTraffic("bannerPlane", { layer: "mid", screenX: 192, speed: 0, duration: 20 });
  assert.equal(banner.message, "SHARK WATCH");
  assert.equal(banner.collidable, false);

  for (const kind of ["speedboat", "fishingBoat", "tugboat", "jetSki", "rescueCraft"]) {
    const boat = world.spawnTraffic(kind, { layer: "mid", screenX: 192, speed: 0, duration: 20 });
    assert.ok(boat, kind);
    assert.equal(boat.collidable, false);
  }
  for (const kind of ["cargoShip", "sailboat"]) {
    const boat = world.spawnTraffic(kind, { layer: "far", screenX: 192, speed: 0, duration: 20 });
    assert.ok(boat, kind);
    assert.equal(boat.collidable, false);
  }

  const carrier = world.forceCarrier({ eventSeed: 7, direction: -1 });
  assert.ok(carrier);
  assert.equal(carrier.collidable, false);
  const carrierEvents = [];
  const carrierInteractions = [];
  runFor(world, 13, context(), { events: carrierEvents, interactions: carrierInteractions });
  assert.equal(world.carrier.phase, "airshow");
  assert.ok(carrierEvents.some((record) => record.type === "carrierPhase" && record.phase === "launch"));
  assert.ok(carrierEvents.some((record) => record.type === "carrierPhase" && record.phase === "airshow"));
  assert.equal(world.completeAirshow(true), true);
  world.consumeInteractions((record) => carrierInteractions.push({ ...record }));
  assert.ok(carrierInteractions.some((record) => record.type === "fleetAirshowCompleted" && record.reason === "success"));
  assert.equal(world.forceCarrier(), null, "a carrier appears at most once per run");
});

test("quiet ownership, flat sparse records, snapshot, and reset form a stable integration contract", () => {
  const world = new WorldSimulation({ seed: 0x600dbeef });
  const initial = new WorldSimulation({ seed: 0x600dbeef }).snapshot();
  const dolphin = world.forceWildlife("dolphin", { phase: "telegraph", x: 192, y: 128, speed: 0 });
  assert.ok(dolphin);
  assert.equal(world.requestPowerup("mangoRush", { x: 192, y: 128 }), null, "interactive events cannot overlap");
  const records = [];
  world.consumeEvents((record) => records.push({ ...record }));
  runFor(world, 0.6, context(), { events: records });
  assert.ok(records.length <= 2, "wildlife does not emit per fixed step");
  for (const record of records) {
    assert.deepEqual(Object.keys(record), ["type", "time", "id", "kind", "layer", "phase", "message", "reason", "value", "x", "y"]);
  }
  world.reset({ seed: 0x600dbeef, condition: "goldenCoast" });
  assert.deepEqual(world.snapshot(), initial);
  assert.equal(world.eventCount, 0);
  assert.equal(world.interactionCount, 0);
  assert.equal(world.events.length, WORLD_LIMITS.eventCapacity);
  assert.equal(world.interactions.length, WORLD_LIMITS.interactionCapacity);
});

test("birds react, dodge harmlessly, and award Feather Thread only once", () => {
  const threadWorld = new WorldSimulation({ seed: 0xfea7e2 });
  const flock = threadWorld.forceFeatherThread({ kind: "gullFlock", speed: 0 });
  assert.ok(flock);
  assert.equal(flock.collidable, false);
  const interactions = [];
  const events = [];
  runFor(threadWorld, 0.8, context(), { interactions, events });
  assert.equal(interactions.filter((record) => record.type === "featherThread").length, 1);
  assert.ok(events.some((record) => record.type === "birdReaction" && record.phase === "dodge"));
  assert.equal(flock.dodged, true);

  const curlWorld = new WorldSimulation({ seed: 0xb17d });
  const tern = curlWorld.spawnTraffic("ternFlock", {
    layer: "mid",
    screenX: 258,
    y: 68,
    speed: 0,
    duration: 8,
  });
  curlWorld.update(STEP, context({ curlScreenX: 258, curlApproaching: true }));
  assert.equal(tern.phase, "bank");
  assert.equal(tern.collidable, false);

  const splashWorld = new WorldSimulation({ seed: 0x5ca77e2 });
  const pelican = splashWorld.spawnTraffic("pelican", {
    layer: "mid",
    screenX: 92,
    y: 62,
    speed: 0,
    duration: 8,
  });
  splashWorld.update(STEP, context({ player: { state: "wipeout" }, lastWipeoutAge: 0 }));
  assert.equal(pelican.phase, "scatter");
  assert.equal(splashWorld.forceBirdReaction("not-a-reaction"), 0);
});

test("pelican and gull couriers telegraph one fair pooled pickup with no miss penalty", () => {
  const world = new WorldSimulation({ seed: 0xc0471e2 });
  runFor(world, 8, context({ player: { x: 40, y: 188 } }));
  assert.equal(world.requestCourier("pelican", "mangoRush", {
    dropX: 338,
    dropY: 44,
  }), null, "an unreachable requested courier path is rejected");

  const courier = world.forceCourier("gullFlock", "mangoRush", {
    dropX: 184,
    dropY: 92,
    direction: 1,
    eventSeed: 17,
  });
  assert.ok(courier);
  const bird = world.findTrafficEntity(courier.birdId);
  assert.equal(bird.collidable, false);
  assert.equal(bird.payload, "mangoRush");
  const events = [];
  const interactions = [];
  runFor(world, 2, context({ player: { x: 340, y: 188 } }), { events, interactions });
  assert.equal(world.courier.dropped, true);
  assert.ok(world.powerups.find((entity) => entity.kind === "mangoRush").active);
  assert.ok(events.some((record) => record.type === "courierPhase" && record.phase === "carry"));
  assert.ok(events.some((record) => record.type === "courierPhase" && record.phase === "drop"));

  runFor(world, POWERUP_CATALOG.mangoRush.availableFor + 1, context({ player: { x: 340, y: 188 } }), {
    events,
    interactions,
  });
  assert.ok(events.some((record) => record.type === "powerupPhase" && record.phase === "missed"));
  assert.equal(interactions.some((record) => record.type === "powerupCollected"), false);
  assert.equal(interactions.some((record) => record.type.includes("Penalty")), false);
});

test("speedboat and jet-ski races have deterministic start/finish and no loss penalty", () => {
  const winner = new WorldSimulation({ seed: 0x7ace });
  const race = winner.forceRace("speedboat", {
    phase: "racing",
    finishDistance: 80,
    competitorSpeed: 20,
    eventSeed: 9,
  });
  assert.ok(race);
  const competitor = winner.findTrafficEntity(race.trafficId);
  assert.equal(competitor.collidable, false);
  assert.equal(competitor.renderBand, "waterBack");
  assert.equal(competitor.y, WORLD_LAYER_CONFIG.mid.waterYRange[0]);
  assert.equal(competitor.scale, 0.68);
  const competitorX = projectWorldX(competitor.worldX, winner.context.cameraWorldX, WORLD_LAYER_CONFIG.mid.parallax);
  assert.ok(competitorX >= 294, "race craft starts on the distant safe side of the playfield");
  assert.ok(watercraftClearsBreaker(competitor, competitorX, { wave: { curlX: 40 }, player: { x: 192 } }));
  const winInteractions = [];
  let camera = 0;
  for (let step = 0; step < 180; step += 1) {
    const previousCamera = camera;
    camera += 84 * STEP;
    winner.update(STEP, context({ cameraWorldX: camera, previousCameraWorldX: previousCamera, direction: 1 }));
    winner.consumeEvents(() => {});
    winner.consumeInteractions((record) => winInteractions.push({ ...record }));
  }
  assert.equal(winner.race.result, "won");
  assert.equal(winInteractions.filter((record) => record.type === "speedboatRaceWon").length, 1);

  const loser = new WorldSimulation({ seed: 0x1057 });
  loser.forceRace("jetSki", {
    phase: "racing",
    finishDistance: 40,
    competitorSpeed: 40,
  });
  const lossInteractions = [];
  runFor(loser, 2.4, context(), { interactions: lossInteractions });
  assert.equal(loser.race.result, "lost");
  assert.equal(lossInteractions.length, 0, "losing a spectacle race never mutates score or Flow");
});

test("aircraft drops telegraph before handing off one reachable non-aircraft pickup", () => {
  const world = new WorldSimulation({ seed: 0xa17d20 });
  runFor(world, 8, context({ player: { x: 42, y: 188 } }));
  assert.equal(world.requestAircraftDrop("propPlane", "moonPop", {
    dropX: 336,
    dropY: 44,
  }), null, "an unreachable requested aircraft drop is rejected");

  const drop = world.forceAircraftDrop("seaplane", "moonPop", {
    dropX: 188,
    dropY: 90,
    direction: -1,
    eventSeed: 31,
  });
  assert.ok(drop);
  assert.equal(world.findTrafficEntity(drop.trafficId).collidable, false);
  const events = [];
  runFor(world, 2.1, context({ player: { x: 340, y: 188 } }), { events });
  assert.equal(world.aircraftDrop.dropped, true);
  assert.ok(events.some((record) => record.type === "aircraftDropPhase" && record.phase === "approach"));
  assert.ok(events.some((record) => record.type === "aircraftDropPhase" && record.phase === "drop"));
  assert.equal(world.powerups.find((entity) => entity.kind === "moonPop").active, true);
});

test("fixed foam gates support dolphin and Fleet Airshow bonuses without becoming obstacles", () => {
  const world = new WorldSimulation({ seed: 0xf0a6 });
  const series = world.forceFoamGates("dolphin", {
    count: 1,
    screenX: 192,
    y: 128,
    eventSeed: 3,
  });
  assert.ok(series);
  assert.equal(world.foamGates.length, WORLD_LIMITS.foamGateCapacity);
  assert.equal(world.foamGates[0].collidable, false);
  const interactions = [];
  runFor(world, STEP, context(), { interactions });
  assert.ok(interactions.some((record) => record.type === "foamGateCleared"));
  assert.ok(interactions.some((record) => record.type === "foamGateSeriesCompleted" && record.reason === "dolphin"));
  assert.equal(world.foamGateSeries.phase, "complete");

  const airshow = new WorldSimulation({ seed: 0xa175 });
  airshow.forceCarrier({ phase: "airshow", eventSeed: 12 });
  assert.equal(airshow.foamGateSeries.active, true);
  assert.equal(airshow.foamGateSeries.owner, "airshow");
  assert.equal(airshow.snapshot().foamGates.length, WORLD_LIMITS.foamGateCapacity);
});
