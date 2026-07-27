import assert from "node:assert/strict";
import test from "node:test";

import { audioConditionIdFor } from "../js/audio.js";
import {
  BOARDS,
  CONDITION_IDS,
  CONDITIONS,
  FIXED_STEP,
  WAVE_STYLES,
  resolveCondition,
  resolveConditionId,
} from "../js/config.js";
import { rendererConditionIdFor } from "../js/renderer.js";
import { SurfSimulation } from "../js/simulation.js";
import {
  CONDITION_WORLD_PROFILES,
  WEBRING_RELAY_CONFIG,
  conditionWorldProfile,
  trafficAllowedByProfile,
} from "../js/world-catalog.js";
import { isReachablePickup } from "../js/world-collision.js";
import { WorldSimulation } from "../js/world.js";

function worldContext(overrides = {}) {
  const player = overrides.player ?? {};
  return {
    cameraWorldX: overrides.cameraWorldX ?? 0,
    previousCameraWorldX: overrides.previousCameraWorldX ?? overrides.cameraWorldX ?? 0,
    direction: overrides.direction ?? 1,
    waterlineY: 79,
    curlWorldX: overrides.curlWorldX ?? -48,
    criticalHazardTelegraph: overrides.criticalHazardTelegraph ?? false,
    presentationPhase: overrides.presentationPhase ?? 0,
    player: {
      x: player.x ?? 192,
      previousX: player.previousX ?? player.x ?? 192,
      y: player.y ?? 128,
      previousY: player.previousY ?? player.y ?? 128,
      vx: player.vx ?? (overrides.direction ?? 1) * 76,
      vy: player.vy ?? 0,
      radius: player.radius ?? 7,
      state: player.state ?? "riding",
    },
    control: {
      horizontalAcceleration: 66,
      verticalAcceleration: 98,
      maxHorizontalSpeed: 112,
      maxVerticalSpeed: 132,
      gravity: 0,
    },
  };
}

function consumeWorldSignals(world) {
  const events = [];
  const interactions = [];
  world.consumeEvents((record) => events.push({ ...record }));
  world.consumeInteractions((record) => interactions.push({ ...record }));
  return { events, interactions };
}

test("Kaki-Land is the fourth canonical condition and every resolver preserves its identity", () => {
  assert.deepEqual(CONDITION_IDS, [
    "goldenCoast",
    "twilightGlass",
    "stormbreak",
    "kakiLand",
  ]);
  assert.equal(Object.keys(CONDITIONS).length, 4);
  assert.equal(CONDITIONS.kakiLand.name, "Kaki-Land");
  assert.equal(CONDITIONS.kakiLand.shortName, "KAKI-LAND");
  assert.equal(CONDITIONS.kakiLand.breakName, "The Last Guestbook Break");
  assert.equal(CONDITIONS.kakiLand.musicMode, "kakiLand");
  assert.equal(CONDITIONS.kakiLand.waveStyle, "signalBreak");
  assert.equal(resolveConditionId("kakiLand"), "kakiLand");
  assert.equal(resolveCondition({ id: "kakiLand" }), CONDITIONS.kakiLand);
  assert.equal(rendererConditionIdFor({ condition: CONDITIONS.kakiLand }), "kakiLand");
  assert.equal(audioConditionIdFor({ condition: CONDITIONS.kakiLand }), "kakiLand");
  assert.equal(resolveConditionId("removed-condition"), "goldenCoast");
});

test("Kaki-Land installs its condition-owned signal break and community world profile", () => {
  const simulation = new SurfSimulation({ seed: 0x4b414b49 });
  simulation.reset({ condition: "kakiLand", board: BOARDS.mangoFish });

  assert.equal(simulation.condition, CONDITIONS.kakiLand);
  assert.equal(simulation.wave.profileId, "signalBreak");
  assert.equal(simulation.wave.profile, WAVE_STYLES.signalBreak);
  assert.equal(simulation.wave.profile.renderer, "heroBarrel");
  assert.equal(simulation.wave.contactX(), 30);

  const profile = conditionWorldProfile("kakiLand");
  assert.equal(profile, CONDITION_WORLD_PROFILES.kakiLand);
  assert.equal(profile.farWaterTraffic, false);
  assert.equal(profile.midWaterTraffic, false);
  assert.deepEqual(profile.traffic.far, ["cloudArtist", "signalKeeper", "guestbookGull"]);
  assert.deepEqual(profile.traffic.mid, ["cloudArtist", "guestbookGull", "buttonMenace"]);
  for (const [layer, kinds] of Object.entries(profile.traffic)) {
    for (const kind of kinds) {
      assert.equal(trafficAllowedByProfile("kakiLand", kind, layer), true);
    }
  }
});

test("Kaki-Land keeps forward scrolling and commits a real left reversal", () => {
  const simulation = new SurfSimulation({ seed: 0x7363726f });
  simulation.tutorialEnabled = false;
  simulation.reset({ condition: "kakiLand", board: BOARDS.mangoFish });
  simulation.begin();
  Object.assign(simulation.player, {
    state: "riding",
    stateTime: 1,
    x: 260,
    previousX: 260,
    face: simulation.wave.powerFaceAt(260),
    speed: 112,
  });
  simulation.wave.curlX = -1_000;

  for (let step = 0; step < 480; step += 1) simulation.update(FIXED_STEP, { x: 1 });
  const forwardWorldX = simulation.player.worldX;
  const forwardCameraX = simulation.cameraWorldX;
  assert.ok(forwardWorldX > WAVE_STYLES.signalBreak.bounds.cameraX[1]);
  assert.ok(forwardCameraX > 70);

  for (let step = 0; step < 720 && simulation.player.travelDirection === 1; step += 1) {
    simulation.update(FIXED_STEP, { x: -1 });
  }
  assert.equal(simulation.player.travelDirection, -1);
  assert.equal(simulation.player.switchStance, true);
  const reversedWorldX = simulation.player.worldX;
  for (let step = 0; step < 120; step += 1) simulation.update(FIXED_STEP, { x: -1 });
  assert.ok(simulation.player.worldX < reversedWorldX);
  assert.ok(simulation.cameraWorldX <= forwardCameraX);
});

test("Webring Relay scheduling and pooled state are deterministic for identical seeds", () => {
  const first = new WorldSimulation({ seed: 0x7e1a9b42, condition: "kakiLand" });
  const second = new WorldSimulation({ seed: 0x7e1a9b42, condition: "kakiLand" });
  assert.ok(first.nextWebringRelayCandidate >= 48);
  assert.ok(first.nextWebringRelayCandidate <= 72);
  assert.equal(first.nextWebringRelayCandidate, second.nextWebringRelayCandidate);
  for (const world of [first, second]) {
    world.interactiveQuietUntil = 0;
    world.nextWebringRelayCandidate = 0;
    world.update(FIXED_STEP, worldContext({ direction: 1, presentationPhase: 1 }));
  }

  assert.equal(first.webringRelay.active, true);
  assert.equal(first.foamGateSeries.owner, "webringRelay");
  assert.deepEqual(first.snapshot(), second.snapshot());
  assert.deepEqual(consumeWorldSignals(first), consumeWorldSignals(second));
  assert.equal(first.foamGates.length, second.foamGates.length);
  assert.equal(first.droppedEventCount, 0);
  assert.equal(first.droppedInteractionCount, 0);
});

test("the Webring Relay random stream cannot perturb ambient, wildlife, or pickup streams", () => {
  const baseline = new WorldSimulation({ seed: 0x51a7c0de, condition: "kakiLand" });
  const relayAdvanced = new WorldSimulation({ seed: 0x51a7c0de, condition: "kakiLand" });

  for (let index = 0; index < 19; index += 1) relayAdvanced.streams.webringRelay();
  for (const stream of ["far", "mid", "near", "wildlife", "powerup", "setPiece", "gate"]) {
    assert.equal(
      relayAdvanced.streams[stream](),
      baseline.streams[stream](),
      `${stream} must remain isolated from the relay stream`,
    );
  }
});

test("all three relay gates are fair and ordered in both travel directions", () => {
  for (const direction of [1, -1]) {
    const world = new WorldSimulation({ seed: 0x72696e67, condition: "kakiLand" });
    world.update(FIXED_STEP, worldContext({ direction }));
    const relay = world.forceWebringRelay({
      direction,
      screenX: 192 + direction * WEBRING_RELAY_CONFIG.baseDistance,
      stationScreenX: direction > 0 ? 322 : 62,
      eventSeed: 0x67756573,
    });
    assert.ok(relay);

    const gates = world.foamGates.filter((gate) => gate.active);
    assert.equal(gates.length, 3);
    for (let index = 1; index < gates.length; index += 1) {
      assert.equal(
        Math.sign(gates[index].worldX - gates[index - 1].worldX),
        direction,
        "gate order follows current travel",
      );
    }
    for (const gate of gates) {
      const interceptTime = Math.max(0.35, Math.abs(gate.worldX - 192) / 76);
      assert.equal(isReachablePickup({
        player: { x: 192, y: 128, vx: direction * 76, vy: 0, state: "riding" },
        target: { x: gate.worldX, y: gate.y },
        interceptTime,
        pickupRadius: gate.radius,
        control: world.context.control,
      }), true, `${direction > 0 ? "right" : "left"} gate at ${gate.worldX},${gate.y} is reachable`);
    }
  }
});

test("critical warnings postpone the story event and an active relay owns the interactive lane", () => {
  const world = new WorldSimulation({ seed: 0x7761726e, condition: "kakiLand" });
  world.interactiveQuietUntil = 0;
  world.nextWebringRelayCandidate = 0;
  world.update(FIXED_STEP, worldContext({ criticalHazardTelegraph: true }));
  assert.equal(world.webringRelay.active, false);
  assert.ok(world.nextWebringRelayCandidate >= world.elapsed + WEBRING_RELAY_CONFIG.retryDelay - 1e-9);

  world.nextWebringRelayCandidate = world.elapsed;
  world.update(FIXED_STEP, worldContext());
  assert.equal(world.webringRelay.active, true);
  assert.equal(world.requestWildlife("shark", { direction: 1 }), null);
  assert.equal(world.requestPowerup("starFoam", { direction: 1 }), null);
});

test("three cleared links assemble the mural, return Approval, and award one Signal Held save", () => {
  const world = new WorldSimulation({ seed: 0x61727421, condition: "kakiLand" });
  world.update(FIXED_STEP, worldContext());
  world.forceWebringRelay({ direction: 1, screenX: 224, eventSeed: 0x6d757261 });
  const interactions = [];

  for (const gate of world.foamGates.filter((candidate) => candidate.active)) {
    world.update(FIXED_STEP, worldContext({
      player: {
        x: gate.worldX,
        previousX: gate.worldX,
        y: gate.y,
        previousY: gate.y,
      },
    }));
    world.consumeEvents(() => {});
    world.consumeInteractions((record) => interactions.push({ ...record }));
  }

  const snapshot = world.snapshot();
  assert.equal(snapshot.webringRelay.links, 3);
  assert.equal(snapshot.webringRelay.phase, "approval");
  assert.equal(snapshot.webringRelay.muralComplete, true);
  assert.equal(snapshot.webringRelay.approval, true);
  assert.equal(snapshot.signalHeld.active, true);
  assert.equal(snapshot.signalHeld.charges, 1);
  assert.equal(snapshot.modifiers.protectsFlow, true);
  assert.equal(interactions.filter((record) => record.type === "foamGateCleared").length, 3);
  assert.equal(interactions.some((record) => record.type === "webringRelayCompleted"), true);
  assert.equal(interactions.some((record) => record.type === "signalHeldAwarded"), true);

  assert.equal(world.consumeFlowProtection("testSave"), true);
  assert.equal(world.signalHeld.active, false);
  assert.equal(world.getModifiers().protectsFlow, false);
});

test("Relay completion is present in simulation results without making the event mandatory", () => {
  const simulation = new SurfSimulation({ seed: 0x72657375 });
  simulation.tutorialEnabled = false;
  simulation.reset({ condition: "kakiLand", board: BOARDS.foamPuff });
  simulation.begin();
  for (let link = 1; link <= 3; link += 1) {
    simulation.handleWorldInteraction({
      type: "foamGateCleared",
      reason: "webringRelay",
      value: link,
    });
  }
  simulation.handleWorldInteraction({ type: "signalHeldAwarded", reason: "webringRelay", value: 1 });
  simulation.handleWorldInteraction({
    type: "webringRelayCompleted",
    reason: "galleryComplete",
    value: 3,
  });
  simulation.finishRun("test");

  const events = [];
  simulation.consumeEvents((event) => events.push(event));
  const complete = events.find((event) => event.type === "complete");
  assert.ok(complete);
  assert.equal(complete.payload.highlights.relayLinks, 3);
  assert.equal(complete.payload.highlights.galleryComplete, 1);
  assert.equal(complete.payload.highlights.signalHeld, 1);

  const ordinary = new SurfSimulation({ seed: 0x6f707469 });
  ordinary.reset({ condition: "kakiLand" });
  ordinary.finishRun("test");
  const ordinaryEvents = [];
  ordinary.consumeEvents((event) => ordinaryEvents.push(event));
  assert.deepEqual(
    {
      relayLinks: ordinaryEvents.at(-1).payload.highlights.relayLinks,
      galleryComplete: ordinaryEvents.at(-1).payload.highlights.galleryComplete,
      signalHeld: ordinaryEvents.at(-1).payload.highlights.signalHeld,
    },
    { relayLinks: 0, galleryComplete: 0, signalHeld: 0 },
  );
});
