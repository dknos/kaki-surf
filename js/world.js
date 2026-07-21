import { clamp, seededRandom } from "./math.js";
import {
  AIRCRAFT_DROP_PHASES,
  BANNER_MESSAGES,
  BIRD_REACTION_PHASES,
  CARRIER_PHASES,
  COURIER_PHASES,
  FOAM_GATE_CONFIG,
  POWERUP_CATALOG,
  RACE_PHASES,
  TRAFFIC_CATALOG,
  WILDLIFE_CATALOG,
  WORLD_LAYER_CONFIG,
  WORLD_LAYER_ORDER,
  WORLD_LIMITS,
  conditionWorldProfile,
  isAircraftKind,
  isBirdKind,
  isFlockBirdKind,
  trafficDefinition,
} from "./world-catalog.js";
import {
  isProjectedOffscreen,
  isReachablePickup,
  isSharkPathFair,
  projectWorldX,
  sweptCircleContact,
  sweptCircleDistanceSquared,
  worldXForScreenX,
} from "./world-collision.js";

const STREAM_SALTS = Object.freeze({
  far: 0x0f41a7c1,
  mid: 0x4d1d5eed,
  near: 0x0ea4f17b,
  wildlife: 0x71d11fe5,
  powerup: 0x50ae2a11,
  setPiece: 0xca221e42,
  bird: 0xb17d5ca7,
  courier: 0xc0471e12,
  race: 0x7ace4b01,
  aircraftDrop: 0xa17d20f5,
  gate: 0xf0a64a7e,
});

const WILDLIFE_KINDS = Object.freeze(["dolphin", "shark", "whale"]);
const POWERUP_KINDS = Object.freeze(["mangoRush", "moonPop", "starFoam"]);

export class WorldSimulation {
  constructor({ seed = 0x4b414b49, condition = "goldenCoast" } = {}) {
    this.traffic = Object.create(null);
    for (const layer of WORLD_LAYER_ORDER) {
      this.traffic[layer] = Array.from(
        { length: WORLD_LAYER_CONFIG[layer].capacity },
        (_, index) => createTrafficEntity(layer, index),
      );
    }
    this.wildlife = WILDLIFE_KINDS.map((kind, index) => createWildlifeEntity(kind, index));
    this.powerups = POWERUP_KINDS.map((kind, index) => createPowerupEntity(kind, index));
    this.bonuses = Object.fromEntries(POWERUP_KINDS.map((kind) => [kind, createBonusState(kind)]));
    this.carrier = createCarrierState();
    this.courier = createCourierState();
    this.race = createRaceState();
    this.aircraftDrop = createAircraftDropState();
    this.foamGateSeries = createFoamGateSeries();
    this.foamGates = Array.from(
      { length: WORLD_LIMITS.foamGateCapacity },
      (_, index) => createFoamGate(index),
    );
    this.events = Array.from({ length: WORLD_LIMITS.eventCapacity }, createSignalRecord);
    this.interactions = Array.from({ length: WORLD_LIMITS.interactionCapacity }, createSignalRecord);
    this.context = createStepContext();
    this.collisionScratch = createCollisionScratch();
    this.modifiers = createModifiers();
    this.nextAmbient = { far: 0, mid: 0, near: 0 };
    this.streams = Object.create(null);
    this.reset({ seed, condition });
  }

  reset({ seed = this.seed, condition = this.conditionId, qa = null } = {}) {
    this.seed = finite(seed, 0x4b414b49) >>> 0;
    this.profile = conditionWorldProfile(condition);
    this.conditionId = this.profile.id;
    this.elapsed = 0;
    this.eventCount = 0;
    this.interactionCount = 0;
    this.droppedEventCount = 0;
    this.droppedInteractionCount = 0;
    this.interactiveQuietUntil = WORLD_LIMITS.initialInteractiveGrace;
    this.lastInteractiveSpawn = -Infinity;
    this.lastCameraWorldX = 0;
    this.wipeoutReactionLatched = false;
    this.streams = createStreams(this.seed, this.conditionId);
    resetStepContext(this.context);

    for (const layer of WORLD_LAYER_ORDER) {
      for (const entity of this.traffic[layer]) resetTrafficEntity(entity);
      this.scheduleNextAmbient(layer, true);
    }
    for (const entity of this.wildlife) resetWildlifeEntity(entity);
    for (const entity of this.powerups) resetPowerupEntity(entity);
    for (const bonus of Object.values(this.bonuses)) resetBonusState(bonus);
    resetCarrierState(this.carrier);
    resetCourierState(this.courier);
    resetRaceState(this.race);
    resetAircraftDropState(this.aircraftDrop);
    resetFoamGateSeries(this.foamGateSeries);
    for (const gate of this.foamGates) resetFoamGate(gate);
    resetModifiers(this.modifiers);

    this.nextWildlifeCandidate = 8 + this.streams.wildlife() * 7;
    this.nextPowerupCandidate = 10 + this.streams.powerup() * 8;
    this.nextCarrierCandidate = 30 + this.streams.setPiece() * 24;
    this.nextCourierCandidate = 18 + this.streams.courier() * 16;
    this.nextRaceCandidate = 22 + this.streams.race() * 18;
    this.nextAircraftDropCandidate = 34 + this.streams.aircraftDrop() * 24;

    if (qa) this.applyQaOverride(qa);
    return this;
  }

  update(dt, context = null) {
    const seconds = clamp(finite(dt), 0, 0.25);
    if (!(seconds > 0)) return this;
    copyStepContext(this.context, context, this.lastCameraWorldX);
    this.lastCameraWorldX = this.context.cameraWorldX;
    this.elapsed += seconds;

    this.updateBonuses(seconds);
    this.updateReactiveBirdBeat();
    this.updateTraffic(seconds);
    this.updateWildlife(seconds);
    this.updatePowerups(seconds);
    this.updateCarrier(seconds);
    this.updateCourier(seconds);
    this.updateRace(seconds);
    this.updateAircraftDrop(seconds);
    this.updateFoamGates(seconds);
    if (this.profile.ambientTraffic !== false) this.updateAmbientScheduler();
    this.updateInteractiveSchedulers();
    if (this.profile.specialTraffic !== false) this.updateSpecialSchedulers();
    if (this.profile.carrierEnabled !== false) this.updateCarrierScheduler();
    this.refreshModifiers();
    return this;
  }

  spawnTraffic(kind, options = {}) {
    const definition = trafficDefinition(kind);
    if (!definition) return null;
    const requestedLayer = options.layer ?? definition.layers[0];
    const layer = definition.layers.includes(requestedLayer) ? requestedLayer : definition.layers[0];
    const pool = this.traffic[layer];
    const entity = pool.find((candidate) => !candidate.active);
    if (!entity) return null;

    const layerConfig = WORLD_LAYER_CONFIG[layer];
    const random = this.streams[layer];
    const direction = Number.isFinite(options.direction)
      ? signOr(options.direction, 1)
      : (options.sideRoll ?? random()) < 0.5 ? 1 : -1;
    const speed = Number.isFinite(options.speed) ? options.speed : randomBetween(random, definition.speed);
    const duration = Number.isFinite(options.duration) ? options.duration : randomBetween(random, definition.duration);
    const yRange = definition.boat
      ? layerConfig.waterYRange ?? layerConfig.yRange
      : layerConfig.yRange;
    const requestedY = Number.isFinite(options.y) ? options.y : randomBetween(random, yRange);
    const y = definition.boat
      ? clamp(requestedY, yRange[0], yRange[1])
      : requestedY;
    const screenX = finite(options.screenX, direction > 0 ? -28 : WORLD_LIMITS.logicalWidth + 28);
    const screenVelocity = direction * Math.abs(speed);

    entity.active = true;
    entity.kind = kind;
    entity.renderBand = definition.renderBand;
    entity.collidable = false;
    entity.phase = definition.banner ? "approach" : "cruise";
    entity.previousPhase = entity.phase;
    entity.phaseTime = 0;
    entity.spawnTime = this.elapsed;
    entity.despawnTime = this.elapsed + Math.max(0.25, duration);
    entity.worldX = worldXForScreenX(screenX, this.context.cameraWorldX, layerConfig.parallax, WORLD_LIMITS.centerX);
    entity.previousWorldX = entity.worldX;
    entity.y = y;
    entity.previousY = y;
    entity.vx = screenVelocity / layerConfig.parallax;
    entity.vy = finite(options.vy);
    entity.direction = direction;
    entity.scale = clamp(Number.isFinite(options.scale) ? options.scale : 0.82 + random() * 0.36, 0.5, 1.5);
    entity.animation = definition.animation;
    entity.animationTime = Number.isFinite(options.animationOffset) ? options.animationOffset : random() * 8;
    entity.eventSeed = (Number.isFinite(options.eventSeed) ? options.eventSeed : random() * 0xffffffff) >>> 0;
    entity.message = definition.banner
      ? String(options.message ?? selectBannerMessage(this.context, random()))
      : "";
    entity.payload = POWERUP_CATALOG[options.payload] ? options.payload : "";
    entity.activity = String(options.activity ?? "");
    entity.reaction = "";
    entity.reactionReason = "";
    entity.reactionTime = 0;
    entity.reactionDuration = 0;
    entity.baseVx = entity.vx;
    entity.baseVy = entity.vy;
    entity.threadAwarded = false;
    entity.dodged = false;
    entity.forceThread = false;
    entity.turning = false;
    this.emitEvent("trafficSpawned", entity);
    return entity;
  }

  requestWildlife(kind, options = {}) {
    return this.startWildlife(kind, options, false);
  }

  forceWildlife(kind, options = {}) {
    return this.startWildlife(kind, options, true);
  }

  requestPowerup(kind, options = {}) {
    return this.startPowerup(kind, options, false);
  }

  forcePowerup(kind, options = {}) {
    return this.startPowerup(kind, options, true);
  }

  requestBirdReaction(reaction = "scatter", options = {}) {
    return this.reactBirds(reaction, options, false);
  }

  forceBirdReaction(reaction = "scatter", options = {}) {
    return this.reactBirds(reaction, options, true);
  }

  forceFeatherThread(options = {}) {
    const kind = isFlockBirdKind(options.kind) ? options.kind : "gullFlock";
    const layer = options.layer === "mid" ? "mid" : "near";
    const entity = this.spawnTraffic(kind, {
      ...options,
      layer,
      screenX: finite(options.screenX, finite(options.x, this.context.player.x)),
      y: finite(options.y, this.context.player.y + this.context.player.radius + 13),
      speed: finite(options.speed, 0),
      duration: finite(options.duration, 3),
    });
    if (entity) entity.forceThread = true;
    return entity;
  }

  requestCourier(birdKind = "pelican", powerupKind = "mangoRush", options = {}) {
    return this.startCourier(birdKind, powerupKind, options, false);
  }

  forceCourier(birdKind = "pelican", powerupKind = "mangoRush", options = {}) {
    return this.startCourier(birdKind, powerupKind, options, true);
  }

  requestRace(kind = "speedboat", options = {}) {
    return this.startRace(kind, options, false);
  }

  forceRace(kind = "speedboat", options = {}) {
    return this.startRace(kind, options, true);
  }

  completeRace(success = true, reason = "manual") {
    if (!this.race.active || this.race.phase !== "racing") return false;
    this.finishRace(Boolean(success), reason);
    return true;
  }

  requestAircraftDrop(aircraftKind = "propPlane", powerupKind = "moonPop", options = {}) {
    return this.startAircraftDrop(aircraftKind, powerupKind, options, false);
  }

  forceAircraftDrop(aircraftKind = "propPlane", powerupKind = "moonPop", options = {}) {
    return this.startAircraftDrop(aircraftKind, powerupKind, options, true);
  }

  requestFoamGates(owner = "dolphin", options = {}) {
    return this.startFoamGates(owner, options, false);
  }

  forceFoamGates(owner = "dolphin", options = {}) {
    return this.startFoamGates(owner, options, true);
  }

  forceCarrier(options = {}) {
    if (this.carrier.active && !options.restart) return null;
    if (this.carrier.hasAppeared && !options.restart) return null;
    resetCarrierState(this.carrier, false);
    this.carrier.active = true;
    this.carrier.hasAppeared = true;
    this.carrier.phase = phaseOr(options.phase, CARRIER_PHASES, "haze");
    this.carrier.phaseTime = 0;
    this.carrier.eventSeed = (Number.isFinite(options.eventSeed) ? options.eventSeed : this.streams.setPiece() * 0xffffffff) >>> 0;
    this.carrier.direction = Number.isFinite(options.direction)
      ? signOr(options.direction, 1)
      : this.streams.setPiece() < 0.5 ? 1 : -1;
    this.carrier.collidable = false;
    this.interactiveQuietUntil = Math.max(this.interactiveQuietUntil, this.elapsed + 2.5);
    this.emitEvent("carrierPhase", this.carrier);
    if (this.carrier.phase === "airshow") {
      this.requestFoamGates("airshow", {
        direction: this.context.direction,
        eventSeed: this.carrier.eventSeed ^ 0xa17540f0,
      });
    }
    return this.carrier;
  }

  completeAirshow(success = true) {
    if (!this.carrier.active || this.carrier.phase !== "airshow" || this.carrier.airshowResolved) return false;
    this.carrier.airshowResolved = true;
    this.emitInteraction("fleetAirshowCompleted", this.carrier, {
      reason: success ? "success" : "expired",
      value: success ? 1 : 0,
    });
    if (this.foamGateSeries.active && this.foamGateSeries.owner === "airshow") {
      this.cancelFoamGateSeries(success ? "airshowCompleted" : "airshowExpired");
    }
    this.setCarrierPhase("depart");
    return true;
  }

  releaseMountedAnimal(kind = "", reason = "special") {
    const entity = this.wildlife.find((candidate) => candidate.active
      && candidate.phase === "mounted"
      && (!kind || candidate.kind === kind));
    if (!entity) return false;
    this.setWildlifePhase(entity, "dismount");
    this.emitInteraction("animalDismount", entity, { reason: reason || entity.kind });
    return true;
  }

  cancelMountedAnimals(reason = "wipeout") {
    let cancelled = 0;
    for (const entity of this.wildlife) {
      if (!entity.active || entity.phase !== "mounted") continue;
      this.setWildlifePhase(entity, entity.kind === "whale" ? "splash" : "depart");
      this.emitEvent("animalMountCancelled", entity, { reason });
      cancelled += 1;
    }
    if (cancelled > 0 && this.foamGateSeries.active && this.foamGateSeries.owner === "dolphin") {
      this.cancelFoamGateSeries(reason);
    }
    return cancelled;
  }

  consumePowerup(kind, reason = "used") {
    const bonus = this.bonuses[kind];
    if (!bonus?.active) return false;
    if (bonus.charges > 0) bonus.charges -= 1;
    if (bonus.charges <= 0 || kind === "mangoRush") {
      bonus.active = false;
      bonus.remaining = 0;
    }
    this.emitInteraction("powerupConsumed", bonus, { reason });
    this.refreshModifiers();
    return true;
  }

  consumeEvents(callback) {
    for (let index = 0; index < this.eventCount; index += 1) {
      callback(this.events[index]);
      clearSignalRecord(this.events[index]);
    }
    this.eventCount = 0;
  }

  consumeInteractions(callback) {
    for (let index = 0; index < this.interactionCount; index += 1) {
      callback(this.interactions[index]);
      clearSignalRecord(this.interactions[index]);
    }
    this.interactionCount = 0;
  }

  forEachTraffic(layer, callback) {
    const pool = this.traffic[layer];
    if (!pool) return;
    for (const entity of pool) if (entity.active) callback(entity);
  }

  forEachWildlife(callback) {
    for (const entity of this.wildlife) if (entity.active) callback(entity);
  }

  forEachPowerup(callback) {
    for (const entity of this.powerups) if (entity.active) callback(entity);
  }

  forEachFoamGate(callback) {
    for (const gate of this.foamGates) if (gate.active) callback(gate);
  }

  findTrafficEntity(id) {
    if (!id) return null;
    for (const layer of WORLD_LAYER_ORDER) {
      const entity = this.traffic[layer].find((candidate) => candidate.active && candidate.id === id);
      if (entity) return entity;
    }
    return null;
  }

  getModifiers() {
    return this.modifiers;
  }

  snapshot() {
    return {
      seed: this.seed,
      condition: this.conditionId,
      elapsed: this.elapsed,
      schedules: {
        ambient: { ...this.nextAmbient },
        wildlife: this.nextWildlifeCandidate,
        powerup: this.nextPowerupCandidate,
        carrier: this.nextCarrierCandidate,
        courier: this.nextCourierCandidate,
        race: this.nextRaceCandidate,
        aircraftDrop: this.nextAircraftDropCandidate,
        interactiveQuietUntil: this.interactiveQuietUntil,
      },
      traffic: Object.fromEntries(WORLD_LAYER_ORDER.map((layer) => [
        layer,
        this.traffic[layer].filter((entity) => entity.active).map(snapshotEntity),
      ])),
      wildlife: this.wildlife.filter((entity) => entity.active).map(snapshotEntity),
      powerups: this.powerups.filter((entity) => entity.active).map(snapshotEntity),
      bonuses: Object.fromEntries(POWERUP_KINDS.map((kind) => [kind, snapshotBonus(this.bonuses[kind])])),
      carrier: snapshotCarrier(this.carrier),
      courier: snapshotCourier(this.courier),
      race: snapshotRace(this.race),
      aircraftDrop: snapshotAircraftDrop(this.aircraftDrop),
      foamGateSeries: snapshotFoamGateSeries(this.foamGateSeries),
      foamGates: this.foamGates.map(snapshotEntity),
      modifiers: { ...this.modifiers },
      queuedEvents: this.eventCount,
      queuedInteractions: this.interactionCount,
      droppedEvents: this.droppedEventCount,
      droppedInteractions: this.droppedInteractionCount,
    };
  }

  getSnapshot() {
    return this.snapshot();
  }

  applyQaOverride(qa) {
    if (Array.isArray(qa.traffic)) {
      for (const descriptor of qa.traffic) this.spawnTraffic(descriptor.kind, descriptor);
    }
    if (qa.wildlife) {
      const descriptor = typeof qa.wildlife === "string" ? { kind: qa.wildlife } : qa.wildlife;
      this.forceWildlife(descriptor.kind, descriptor);
    }
    if (qa.powerup) {
      const descriptor = typeof qa.powerup === "string" ? { kind: qa.powerup } : qa.powerup;
      this.forcePowerup(descriptor.kind, descriptor);
    }
    if (qa.carrier) this.forceCarrier(typeof qa.carrier === "object" ? qa.carrier : {});
    if (qa.birdReaction) {
      const descriptor = typeof qa.birdReaction === "string"
        ? { reaction: qa.birdReaction }
        : qa.birdReaction;
      this.forceBirdReaction(descriptor.reaction, descriptor);
    }
    if (qa.featherThread) this.forceFeatherThread(typeof qa.featherThread === "object" ? qa.featherThread : {});
    if (qa.courier) {
      const descriptor = typeof qa.courier === "object" ? qa.courier : {};
      this.forceCourier(descriptor.birdKind, descriptor.powerupKind, descriptor);
    }
    if (qa.race) {
      const descriptor = typeof qa.race === "object" ? qa.race : {};
      this.forceRace(descriptor.kind, descriptor);
    }
    if (qa.aircraftDrop) {
      const descriptor = typeof qa.aircraftDrop === "object" ? qa.aircraftDrop : {};
      this.forceAircraftDrop(descriptor.aircraftKind, descriptor.powerupKind, descriptor);
    }
    if (qa.foamGates) {
      const descriptor = typeof qa.foamGates === "object" ? qa.foamGates : {};
      this.forceFoamGates(descriptor.owner, descriptor);
    }
  }

  reactBirds(reaction, options, force) {
    if (!Object.hasOwn(BIRD_REACTION_PHASES, reaction)) return 0;
    const requestedKind = isBirdKind(options.kind) ? options.kind : "";
    let candidates = [];
    for (const layer of WORLD_LAYER_ORDER) {
      for (const entity of this.traffic[layer]) {
        if (!entity.active || !isBirdKind(entity.kind) || entity.activity) continue;
        if (requestedKind && entity.kind !== requestedKind) continue;
        candidates.push(entity);
      }
    }

    if (force && candidates.length === 0) {
      const kind = requestedKind || "gullFlock";
      const definition = TRAFFIC_CATALOG[kind];
      const requestedLayer = options.layer;
      const layer = definition.layers.includes(requestedLayer)
        ? requestedLayer
        : definition.layers.includes("near") ? "near" : definition.layers[0];
      const entity = this.spawnTraffic(kind, {
        layer,
        screenX: finite(options.screenX, finite(options.x, this.context.player.x + 54 * -this.context.direction)),
        y: finite(options.y, clamp(this.context.player.y - 28, WORLD_LAYER_CONFIG[layer].yRange[0], WORLD_LAYER_CONFIG[layer].yRange[1])),
        direction: signOr(options.direction, this.context.direction),
        speed: finite(options.speed, 18),
        duration: finite(options.duration, 5),
        scale: finite(options.scale, 1),
        animationOffset: finite(options.animationOffset),
        eventSeed: finite(options.eventSeed, this.streams.bird() * 0xffffffff),
      });
      if (entity) candidates = [entity];
    }

    const maxCount = clamp(
      Math.floor(finite(options.maxCount, WORLD_LIMITS.maxBirdReactionsPerBeat)),
      1,
      WORLD_LIMITS.maxBirdReactionsPerBeat,
    );
    let reacted = 0;
    for (const entity of candidates) {
      if (reacted >= maxCount) break;
      if (this.triggerBirdReaction(entity, reaction, options.reason || reaction, force)) reacted += 1;
    }
    return reacted;
  }

  triggerBirdReaction(entity, reaction, reason, force = false) {
    if (!entity?.active || !isBirdKind(entity.kind) || entity.activity) return false;
    if (!force && entity.reaction) return false;
    entity.reaction = reaction;
    entity.reactionReason = String(reason || reaction);
    entity.reactionTime = 0;
    entity.reactionDuration = BIRD_REACTION_PHASES[reaction];
    entity.previousPhase = entity.phase;
    entity.phase = reaction;
    entity.baseVx = entity.baseVx || entity.vx;
    entity.baseVy = finite(entity.baseVy, entity.vy);
    if (reaction === "scatter") {
      const verticalDirection = signOr(entity.y - this.context.player.y, (entity.eventSeed & 1) ? 1 : -1);
      entity.vx = entity.baseVx * 1.12;
      entity.vy = verticalDirection * (22 + (entity.eventSeed % 9));
    } else if (reaction === "bank") {
      entity.vy = signOr(entity.y - this.context.player.y, -1) * 16;
    } else if (reaction === "dodge") {
      entity.dodged = true;
      entity.vy = signOr(entity.y - this.context.player.y, -1) * 34;
    } else if (reaction === "circle") {
      entity.vy = signOr(entity.direction, 1) * 9;
    } else if (reaction === "follow") {
      entity.vx = entity.baseVx * 1.08;
      entity.vy = clamp((this.context.player.y - entity.y) * 0.35, -12, 12);
    }
    this.emitEvent("birdReaction", entity, { reason: entity.reactionReason });
    return true;
  }

  updateReactiveBirdBeat() {
    const wipeoutSignal = this.context.player.state === "wipeout" || this.context.lastWipeoutAge <= 0.16;
    if (wipeoutSignal && !this.wipeoutReactionLatched) {
      this.requestBirdReaction("scatter", { reason: "wipeoutSplash" });
      this.wipeoutReactionLatched = true;
    } else if (!wipeoutSignal && this.context.lastWipeoutAge > 0.7) {
      this.wipeoutReactionLatched = false;
    }
  }

  updateBirdTraffic(entity, dt, config) {
    if (entity.reaction) {
      entity.reactionTime += dt;
      if (entity.reactionTime + 1e-9 >= entity.reactionDuration) {
        entity.reaction = "";
        entity.reactionReason = "";
        entity.reactionTime = 0;
        entity.reactionDuration = 0;
        entity.vx = entity.baseVx;
        entity.vy = entity.baseVy;
        entity.previousPhase = entity.phase;
        entity.phase = entity.activity ? entity.phase : "cruise";
      }
      return;
    }
    if (entity.activity) return;

    const { playerPrevious, playerCurrent, entityPrevious, entityCurrent } = this.prepareTrafficCollision(entity, config.parallax);
    const distanceSquared = sweptCircleDistanceSquared(playerPrevious, playerCurrent, entityPrevious, entityCurrent);
    const dodgeRadius = this.context.player.radius + (isFlockBirdKind(entity.kind) ? 19 : 14);
    if ((entity.forceThread || distanceSquared <= dodgeRadius * dodgeRadius) && !entity.dodged) {
      this.triggerBirdReaction(entity, "dodge", "playerNearMiss", true);
      entity.forceThread = false;
      if (isFlockBirdKind(entity.kind) && !entity.threadAwarded) {
        entity.threadAwarded = true;
        this.emitInteraction("featherThread", entity, { reason: entity.kind, value: 1 });
      }
      return;
    }

    if (Number.isFinite(this.context.curlScreenX)) {
      const birdX = entityCurrent.x;
      const curlDistance = Math.abs(birdX - this.context.curlScreenX);
      if (curlDistance <= 58 && (this.context.curlApproaching || curlDistance <= 34)) {
        this.triggerBirdReaction(entity, "bank", "incomingCurl");
      }
    }
  }

  startCourier(birdKind, powerupKind, options, force) {
    if ((birdKind !== "pelican" && birdKind !== "gullFlock") || !POWERUP_CATALOG[powerupKind]) return null;
    if (this.courier.active || this.aircraftDrop.active) return null;
    if (!force && (
      this.hasActiveInteractive()
      || this.elapsed < this.interactiveQuietUntil
      || this.bonuses[powerupKind].active
      || activeBonusCount(this.bonuses) >= WORLD_LIMITS.maxActiveBonuses
    )) return null;

    const direction = signOr(options.direction, this.context.direction);
    const dropDelay = COURIER_PHASES.telegraph + COURIER_PHASES.carry;
    const dropX = clamp(
      finite(options.dropX, finite(options.x, this.context.player.x + direction * 18)),
      46,
      338,
    );
    const dropY = clamp(
      finite(options.dropY, finite(options.y, this.context.player.y - 10 + finite(options.yOffset))),
      42,
      182,
    );
    const dropVx = direction * Math.abs(finite(options.dropSpeed, 7));
    const dropVy = finite(options.dropVy, 7);
    if (!force && !isReachablePickup({
      player: this.context.player,
      target: { x: dropX, y: dropY },
      interceptTime: dropDelay + 0.85,
      pickupRadius: POWERUP_CATALOG[powerupKind].radius,
      playerRadius: this.context.player.radius,
      control: this.context.control,
    })) return null;

    const birdSpeed = finite(options.speed, 42 + finite(options.speedRoll, 0.5) * 9);
    const layer = options.layer === "near" ? "near" : "mid";
    const bird = this.spawnTraffic(birdKind, {
      layer,
      direction,
      screenX: finite(options.screenX, dropX - direction * birdSpeed * dropDelay),
      y: clamp(finite(options.birdY, dropY - 22), WORLD_LAYER_CONFIG[layer].yRange[0], WORLD_LAYER_CONFIG[layer].yRange[1]),
      speed: birdSpeed,
      duration: finite(options.duration, 8),
      scale: finite(options.scale, 1.05),
      animationOffset: finite(options.animationOffset),
      eventSeed: finite(options.eventSeed, this.streams.courier() * 0xffffffff),
      payload: powerupKind,
      activity: "courier",
    });
    if (!bird) return null;

    resetCourierState(this.courier);
    this.courier.active = true;
    this.courier.kind = birdKind;
    this.courier.phase = "telegraph";
    this.courier.birdId = bird.id;
    this.courier.powerupKind = powerupKind;
    this.courier.direction = direction;
    this.courier.dropWorldX = worldXForScreenX(dropX, this.context.cameraWorldX, 1, WORLD_LIMITS.centerX);
    this.courier.dropY = dropY;
    this.courier.dropVx = dropVx;
    this.courier.dropVy = dropVy;
    this.courier.eventSeed = bird.eventSeed;
    this.courier.message = powerupKind;
    bird.phase = "courierTelegraph";
    bird.message = powerupKind;
    this.lastInteractiveSpawn = this.elapsed;
    this.interactiveQuietUntil = Math.max(
      this.interactiveQuietUntil,
      this.elapsed + dropDelay + POWERUP_CATALOG[powerupKind].availableFor + WORLD_LIMITS.minimumInteractiveQuiet,
    );
    this.emitEvent("courierPhase", this.courier);
    return this.courier;
  }

  setCourierPhase(phase, bird = null) {
    this.courier.phase = phase;
    this.courier.phaseTime = 0;
    if (bird) bird.phase = `courier${phase[0].toUpperCase()}${phase.slice(1)}`;
    this.emitEvent("courierPhase", this.courier);
  }

  updateCourier(dt) {
    if (!this.courier.active) return;
    this.courier.phaseTime += dt;
    const bird = this.findTrafficEntity(this.courier.birdId);
    if (!bird) {
      this.finishCourier("birdExited");
      return;
    }

    if (this.courier.phase === "telegraph" && this.courier.phaseTime >= COURIER_PHASES.telegraph) {
      this.setCourierPhase("carry", bird);
    } else if (this.courier.phase === "carry" && this.courier.phaseTime >= COURIER_PHASES.carry) {
      const screenX = projectWorldX(
        this.courier.dropWorldX,
        this.context.cameraWorldX,
        1,
        WORLD_LIMITS.centerX,
      );
      const powerup = this.startPowerup(this.courier.powerupKind, {
        phase: "available",
        screenX,
        y: this.courier.dropY,
        direction: this.courier.direction,
        speed: Math.abs(this.courier.dropVx),
        vy: this.courier.dropVy,
        eventSeed: this.courier.eventSeed ^ 0x6d616e67,
      }, true);
      if (!powerup) {
        this.emitEvent("courierCancelled", this.courier, { reason: "pickupUnavailable" });
        this.finishCourier("pickupUnavailable");
        return;
      }
      this.courier.dropped = true;
      bird.payload = "";
      this.setCourierPhase("drop", bird);
    } else if (this.courier.phase === "drop" && this.courier.phaseTime >= COURIER_PHASES.drop) {
      this.setCourierPhase("exit", bird);
    } else if (this.courier.phase === "exit" && this.courier.phaseTime >= COURIER_PHASES.exit) {
      this.finishCourier("complete");
    }
  }

  finishCourier(reason) {
    const bird = this.findTrafficEntity(this.courier.birdId);
    if (bird) {
      bird.activity = "";
      bird.payload = "";
      bird.previousPhase = bird.phase;
      bird.phase = "exit";
    }
    this.courier.active = false;
    this.courier.phase = reason === "complete" ? "complete" : "cancelled";
    this.courier.phaseTime = 0;
  }

  startRace(kind, options, force) {
    if (kind !== "speedboat" && kind !== "jetSki") return null;
    if (this.race.active) return null;
    if (!force && (this.hasActiveInteractive() || this.elapsed < this.interactiveQuietUntil)) return null;
    const direction = signOr(options.direction, this.context.direction);
    const safeRaceX = clamp(
      Math.max(
        finite(this.context.curlScreenX, 40) + 148,
        finite(this.context.player?.x, WORLD_LIMITS.centerX) + 98,
      ),
      294,
      WORLD_LIMITS.logicalWidth - 46,
    );
    const boat = this.spawnTraffic(kind, {
      layer: "mid",
      direction,
      screenX: finite(options.screenX, safeRaceX),
      y: clamp(
        finite(options.y, WORLD_LAYER_CONFIG.mid.waterYRange[0]),
        WORLD_LAYER_CONFIG.mid.waterYRange[0],
        WORLD_LAYER_CONFIG.mid.waterYRange[1],
      ),
      speed: finite(options.screenSpeed, kind === "jetSki" ? 18 : 15),
      duration: finite(options.duration, 12),
      scale: finite(options.scale, kind === "jetSki" ? 0.62 : 0.68),
      animationOffset: finite(options.animationOffset),
      eventSeed: finite(options.eventSeed, this.streams.race() * 0xffffffff),
      activity: "race",
    });
    if (!boat) return null;

    resetRaceState(this.race);
    this.race.active = true;
    this.race.kind = kind;
    this.race.phase = options.phase === "racing" ? "racing" : "telegraph";
    this.race.trafficId = boat.id;
    this.race.direction = direction;
    this.race.startCameraWorldX = this.context.cameraWorldX;
    this.race.finishDistance = clamp(finite(options.finishDistance, 240), 80, 520);
    this.race.competitorSpeed = clamp(finite(options.competitorSpeed, kind === "jetSki" ? 58 : 54), 12, 120);
    this.race.eventSeed = boat.eventSeed;
    this.race.message = kind;
    boat.phase = this.race.phase === "racing" ? "race" : "raceStart";
    this.interactiveQuietUntil = Math.max(this.interactiveQuietUntil, this.elapsed + 1.4);
    this.emitEvent("racePhase", this.race);
    return this.race;
  }

  updateRace(dt) {
    if (!this.race.active) return;
    this.race.phaseTime += dt;
    const boat = this.findTrafficEntity(this.race.trafficId);
    if (!boat) {
      if (this.race.phase === "racing") this.finishRace(false, "boatExited");
      else this.race.active = false;
      return;
    }

    if (this.race.phase === "telegraph" && this.race.phaseTime >= RACE_PHASES.telegraph) {
      this.race.phase = "racing";
      this.race.phaseTime = 0;
      this.race.startCameraWorldX = this.context.cameraWorldX;
      this.race.playerDistance = 0;
      this.race.competitorDistance = 0;
      boat.phase = "race";
      this.emitEvent("racePhase", this.race);
    } else if (this.race.phase === "racing") {
      this.race.playerDistance = Math.max(
        0,
        (this.context.cameraWorldX - this.race.startCameraWorldX) * this.race.direction,
      );
      this.race.competitorDistance = Math.min(
        this.race.finishDistance,
        this.race.competitorDistance + this.race.competitorSpeed * dt,
      );
      if (this.race.playerDistance + 1e-9 >= this.race.finishDistance) {
        this.finishRace(true, "finishMarker");
      } else if (this.race.competitorDistance + 1e-9 >= this.race.finishDistance) {
        this.finishRace(false, "competitorFinished");
      }
    } else if ((this.race.phase === "won" || this.race.phase === "lost")
      && this.race.phaseTime >= RACE_PHASES.finish) {
      boat.activity = "";
      boat.previousPhase = boat.phase;
      boat.phase = "exit";
      this.race.active = false;
      this.race.phase = "complete";
      this.race.phaseTime = 0;
    }
  }

  finishRace(success, reason) {
    if (!this.race.active || this.race.phase !== "racing") return;
    const boat = this.findTrafficEntity(this.race.trafficId);
    this.race.phase = success ? "won" : "lost";
    this.race.phaseTime = 0;
    this.race.result = success ? "won" : "lost";
    if (boat) boat.phase = success ? "raceWin" : "raceFinish";
    const margin = Math.max(0, this.race.finishDistance - this.race.competitorDistance);
    this.emitEvent("racePhase", this.race, {
      reason: success ? "success" : reason,
      value: success ? margin : 0,
    });
    if (success) {
      this.emitInteraction("speedboatRaceWon", this.race, {
        reason: this.race.kind,
        value: Math.max(1, Math.round(margin)),
      });
    }
  }

  startAircraftDrop(aircraftKind, powerupKind, options, force) {
    if (!isAircraftKind(aircraftKind) || !POWERUP_CATALOG[powerupKind]) return null;
    if (this.aircraftDrop.active || this.courier.active) return null;
    if (!force && (
      this.hasActiveInteractive()
      || this.elapsed < this.interactiveQuietUntil
      || this.bonuses[powerupKind].active
      || activeBonusCount(this.bonuses) >= WORLD_LIMITS.maxActiveBonuses
    )) return null;

    const direction = signOr(options.direction, this.context.direction);
    const dropDelay = AIRCRAFT_DROP_PHASES.telegraph + AIRCRAFT_DROP_PHASES.approach;
    const dropX = clamp(
      finite(options.dropX, finite(options.x, this.context.player.x + direction * 16)),
      48,
      336,
    );
    const dropY = clamp(
      finite(options.dropY, finite(options.y, this.context.player.y - 34 + finite(options.yOffset))),
      44,
      166,
    );
    const dropVx = direction * Math.abs(finite(options.dropSpeed, 5));
    const dropVy = finite(options.dropVy, 12);
    if (!force && !isReachablePickup({
      player: this.context.player,
      target: { x: dropX, y: dropY },
      interceptTime: dropDelay + 0.9,
      pickupRadius: POWERUP_CATALOG[powerupKind].radius,
      playerRadius: this.context.player.radius,
      control: this.context.control,
    })) return null;

    const aircraftSpeed = finite(options.speed, aircraftKind === "helicopter" ? 30 : 39);
    const plane = this.spawnTraffic(aircraftKind, {
      layer: "mid",
      direction,
      screenX: finite(options.screenX, dropX - direction * aircraftSpeed * dropDelay),
      y: clamp(finite(options.aircraftY, dropY - 30), WORLD_LAYER_CONFIG.mid.yRange[0], WORLD_LAYER_CONFIG.mid.yRange[1]),
      speed: aircraftSpeed,
      duration: finite(options.duration, 8.5),
      scale: finite(options.scale, 1),
      animationOffset: finite(options.animationOffset),
      eventSeed: finite(options.eventSeed, this.streams.aircraftDrop() * 0xffffffff),
      payload: powerupKind,
      activity: "aircraftDrop",
    });
    if (!plane) return null;

    resetAircraftDropState(this.aircraftDrop);
    this.aircraftDrop.active = true;
    this.aircraftDrop.kind = aircraftKind;
    this.aircraftDrop.phase = options.phase === "approach" ? "approach" : "telegraph";
    this.aircraftDrop.trafficId = plane.id;
    this.aircraftDrop.powerupKind = powerupKind;
    this.aircraftDrop.direction = direction;
    this.aircraftDrop.dropWorldX = worldXForScreenX(dropX, this.context.cameraWorldX, 1, WORLD_LIMITS.centerX);
    this.aircraftDrop.dropY = dropY;
    this.aircraftDrop.dropVx = dropVx;
    this.aircraftDrop.dropVy = dropVy;
    this.aircraftDrop.eventSeed = plane.eventSeed;
    this.aircraftDrop.message = powerupKind;
    plane.phase = this.aircraftDrop.phase === "approach" ? "dropApproach" : "dropTelegraph";
    plane.message = powerupKind;
    this.lastInteractiveSpawn = this.elapsed;
    this.interactiveQuietUntil = Math.max(
      this.interactiveQuietUntil,
      this.elapsed + dropDelay + POWERUP_CATALOG[powerupKind].availableFor + WORLD_LIMITS.minimumInteractiveQuiet,
    );
    this.emitEvent("aircraftDropPhase", this.aircraftDrop);
    return this.aircraftDrop;
  }

  setAircraftDropPhase(phase, aircraft = null) {
    this.aircraftDrop.phase = phase;
    this.aircraftDrop.phaseTime = 0;
    if (aircraft) aircraft.phase = `drop${phase[0].toUpperCase()}${phase.slice(1)}`;
    this.emitEvent("aircraftDropPhase", this.aircraftDrop);
  }

  updateAircraftDrop(dt) {
    if (!this.aircraftDrop.active) return;
    this.aircraftDrop.phaseTime += dt;
    const aircraft = this.findTrafficEntity(this.aircraftDrop.trafficId);
    if (!aircraft) {
      this.finishAircraftDrop("aircraftExited");
      return;
    }

    if (this.aircraftDrop.phase === "telegraph"
      && this.aircraftDrop.phaseTime >= AIRCRAFT_DROP_PHASES.telegraph) {
      this.setAircraftDropPhase("approach", aircraft);
    } else if (this.aircraftDrop.phase === "approach"
      && this.aircraftDrop.phaseTime >= AIRCRAFT_DROP_PHASES.approach) {
      const screenX = projectWorldX(
        this.aircraftDrop.dropWorldX,
        this.context.cameraWorldX,
        1,
        WORLD_LIMITS.centerX,
      );
      const powerup = this.startPowerup(this.aircraftDrop.powerupKind, {
        phase: "available",
        screenX,
        y: this.aircraftDrop.dropY,
        direction: this.aircraftDrop.direction,
        speed: Math.abs(this.aircraftDrop.dropVx),
        vy: this.aircraftDrop.dropVy,
        eventSeed: this.aircraftDrop.eventSeed ^ 0x64726f70,
      }, true);
      if (!powerup) {
        this.emitEvent("aircraftDropCancelled", this.aircraftDrop, { reason: "pickupUnavailable" });
        this.finishAircraftDrop("pickupUnavailable");
        return;
      }
      this.aircraftDrop.dropped = true;
      aircraft.payload = "";
      this.setAircraftDropPhase("drop", aircraft);
    } else if (this.aircraftDrop.phase === "drop"
      && this.aircraftDrop.phaseTime >= AIRCRAFT_DROP_PHASES.drop) {
      this.setAircraftDropPhase("exit", aircraft);
    } else if (this.aircraftDrop.phase === "exit"
      && this.aircraftDrop.phaseTime >= AIRCRAFT_DROP_PHASES.exit) {
      this.finishAircraftDrop("complete");
    }
  }

  finishAircraftDrop(reason) {
    const aircraft = this.findTrafficEntity(this.aircraftDrop.trafficId);
    if (aircraft) {
      aircraft.activity = "";
      aircraft.payload = "";
      aircraft.previousPhase = aircraft.phase;
      aircraft.phase = "exit";
    }
    this.aircraftDrop.active = false;
    this.aircraftDrop.phase = reason === "complete" ? "complete" : "cancelled";
    this.aircraftDrop.phaseTime = 0;
  }

  startFoamGates(owner, options, force) {
    const normalizedOwner = owner === "fleetAirshow" ? "airshow" : owner;
    if (normalizedOwner !== "dolphin" && normalizedOwner !== "airshow") return null;
    if (this.foamGateSeries.active) return null;
    if (!force) {
      const validDolphin = normalizedOwner === "dolphin"
        && this.wildlife.some((entity) => entity.kind === "dolphin" && entity.active && entity.phase === "mounted");
      const validAirshow = normalizedOwner === "airshow" && this.carrier.active && this.carrier.phase === "airshow";
      if (!validDolphin && !validAirshow) return null;
    }

    const count = clamp(
      Math.floor(finite(options.count, WORLD_LIMITS.foamGateCapacity)),
      1,
      WORLD_LIMITS.foamGateCapacity,
    );
    const direction = signOr(options.direction, this.context.direction);
    const baseDistance = clamp(finite(options.baseDistance, FOAM_GATE_CONFIG.baseDistance), 12, 150);
    const spacing = clamp(finite(options.spacing, FOAM_GATE_CONFIG.spacing), 24, 96);
    const baseY = clamp(finite(options.y, this.context.player.y), 48, 176);
    const yPattern = [-10, 10, -4];
    const eventSeed = (Number.isFinite(options.eventSeed) ? options.eventSeed : this.streams.gate() * 0xffffffff) >>> 0;

    resetFoamGateSeries(this.foamGateSeries);
    this.foamGateSeries.active = true;
    this.foamGateSeries.phase = "available";
    this.foamGateSeries.owner = normalizedOwner;
    this.foamGateSeries.count = count;
    this.foamGateSeries.eventSeed = eventSeed;
    this.foamGateSeries.message = normalizedOwner;
    const desiredFirstX = finite(options.screenX, this.context.player.x + direction * baseDistance);
    const firstX = direction > 0
      ? clamp(desiredFirstX, 38, 346 - (count - 1) * spacing)
      : clamp(desiredFirstX, 38 + (count - 1) * spacing, 346);
    for (let index = 0; index < this.foamGates.length; index += 1) {
      const gate = this.foamGates[index];
      resetFoamGate(gate);
      if (index >= count) continue;
      const screenX = firstX + direction * spacing * index;
      gate.active = true;
      gate.phase = "available";
      gate.previousPhase = "available";
      gate.collidable = false;
      gate.worldX = worldXForScreenX(screenX, this.context.cameraWorldX, 1, WORLD_LIMITS.centerX);
      gate.previousWorldX = gate.worldX;
      gate.y = clamp(baseY + yPattern[index], 38, 190);
      gate.previousY = gate.y;
      gate.direction = direction;
      gate.radius = clamp(finite(options.radius, FOAM_GATE_CONFIG.radius), 8, 22);
      gate.eventSeed = (eventSeed + Math.imul(index + 1, 0x9e3779b9)) >>> 0;
      gate.message = normalizedOwner;
      gate.payload = normalizedOwner;
      this.emitEvent("foamGatePhase", gate, { reason: normalizedOwner });
    }
    this.emitEvent("foamGateSeriesPhase", this.foamGateSeries, { reason: normalizedOwner, value: count });
    return this.foamGateSeries;
  }

  updateFoamGates(dt) {
    if (!this.foamGateSeries.active) return;
    this.foamGateSeries.phaseTime += dt;
    let resolved = 0;
    for (const gate of this.foamGates) {
      if (!gate.active) {
        if (gate.phase === "cleared" || gate.phase === "missed") resolved += 1;
        continue;
      }
      gate.previousWorldX = gate.worldX;
      gate.previousY = gate.y;
      gate.previousPhase = gate.phase;
      gate.phaseTime += dt;
      const { playerPrevious, playerCurrent, entityPrevious, entityCurrent } = this.prepareCollision(gate);
      const contact = this.context.player.state !== "wipeout" && sweptCircleContact(
        playerPrevious,
        playerCurrent,
        this.context.player.radius,
        entityPrevious,
        entityCurrent,
        gate.radius,
      );
      if (contact) {
        gate.active = false;
        gate.phase = "cleared";
        gate.phaseTime = 0;
        this.foamGateSeries.cleared += 1;
        resolved += 1;
        this.emitInteraction("foamGateCleared", gate, {
          reason: this.foamGateSeries.owner,
          value: this.foamGateSeries.cleared,
        });
        continue;
      }

      const screenX = projectWorldX(gate.worldX, this.context.cameraWorldX, 1, WORLD_LIMITS.centerX);
      const passedBehind = gate.direction > 0 ? screenX < -32 : screenX > WORLD_LIMITS.logicalWidth + 32;
      if (this.foamGateSeries.phaseTime >= finite(FOAM_GATE_CONFIG.availableFor) || passedBehind) {
        gate.active = false;
        gate.phase = "missed";
        gate.phaseTime = 0;
        resolved += 1;
        this.emitEvent("foamGatePhase", gate, { reason: "missed" });
      }
    }

    if (resolved >= this.foamGateSeries.count) {
      const success = this.foamGateSeries.cleared >= this.foamGateSeries.count;
      this.completeFoamGateSeries(success);
    }
  }

  completeFoamGateSeries(success) {
    if (!this.foamGateSeries.active) return false;
    const owner = this.foamGateSeries.owner;
    this.foamGateSeries.active = false;
    this.foamGateSeries.phase = success ? "complete" : "missed";
    this.foamGateSeries.phaseTime = 0;
    this.emitEvent("foamGateSeriesPhase", this.foamGateSeries, {
      reason: success ? "success" : "expired",
      value: this.foamGateSeries.cleared,
    });
    if (success) {
      this.emitInteraction("foamGateSeriesCompleted", this.foamGateSeries, {
        reason: owner,
        value: this.foamGateSeries.cleared,
      });
    }
    if (owner === "airshow" && this.carrier.active && this.carrier.phase === "airshow") {
      this.completeAirshow(success);
    }
    return true;
  }

  cancelFoamGateSeries(reason = "cancelled") {
    if (!this.foamGateSeries.active) return false;
    for (const gate of this.foamGates) {
      if (!gate.active) continue;
      gate.active = false;
      gate.phase = "missed";
      gate.phaseTime = 0;
    }
    this.foamGateSeries.active = false;
    this.foamGateSeries.phase = "cancelled";
    this.foamGateSeries.phaseTime = 0;
    this.emitEvent("foamGateSeriesPhase", this.foamGateSeries, { reason });
    return true;
  }

  updateAmbientScheduler() {
    for (const layer of WORLD_LAYER_ORDER) {
      if (this.elapsed + 1e-9 < this.nextAmbient[layer]) continue;
      const random = this.streams[layer];
      const candidates = this.profile.traffic[layer];
      const packet = {
        kind: candidates[Math.min(candidates.length - 1, Math.floor(random() * candidates.length))],
        direction: random() < 0.5 ? 1 : -1,
        yRoll: random(),
        speedRoll: random(),
        durationRoll: random(),
        scale: 0.78 + random() * 0.42,
        animationOffset: random() * 8,
        eventSeed: random() * 0xffffffff,
        messageRoll: random(),
      };
      const definition = TRAFFIC_CATALOG[packet.kind];
      const layerConfig = WORLD_LAYER_CONFIG[layer];
      const yRange = definition.boat
        ? layerConfig.waterYRange ?? layerConfig.yRange
        : layerConfig.yRange;
      this.spawnTraffic(packet.kind, {
        layer,
        direction: packet.direction,
        y: lerpRange(yRange, packet.yRoll),
        speed: lerpRange(definition.speed, packet.speedRoll),
        duration: lerpRange(definition.duration, packet.durationRoll),
        scale: packet.scale,
        animationOffset: packet.animationOffset,
        eventSeed: packet.eventSeed,
        message: definition.banner ? selectBannerMessage(this.context, packet.messageRoll) : "",
      });
      this.scheduleNextAmbient(layer, false);
    }
  }

  updateInteractiveSchedulers() {
    if (this.elapsed + 1e-9 >= this.nextWildlifeCandidate) {
      const random = this.streams.wildlife;
      const selectionRoll = random();
      const packet = {
        kind: weightedWildlife(this.profile.wildlifeWeights, selectionRoll),
        direction: random() < 0.5 ? 1 : -1,
        yOffset: (random() - 0.5) * 32,
        speedRoll: random(),
        eventSeed: random() * 0xffffffff,
      };
      this.requestWildlife(packet.kind, packet);
      this.nextWildlifeCandidate = this.elapsed + 13 + random() * 11;
    }

    if (this.elapsed + 1e-9 >= this.nextPowerupCandidate) {
      const random = this.streams.powerup;
      const packet = {
        kind: POWERUP_KINDS[Math.min(POWERUP_KINDS.length - 1, Math.floor(random() * POWERUP_KINDS.length))],
        direction: random() < 0.5 ? 1 : -1,
        yOffset: (random() - 0.5) * 34,
        speedRoll: random(),
        eventSeed: random() * 0xffffffff,
      };
      this.requestPowerup(packet.kind, packet);
      this.nextPowerupCandidate = this.elapsed + 15 + random() * 12;
    }
  }

  updateSpecialSchedulers() {
    if (this.elapsed + 1e-9 >= this.nextCourierCandidate) {
      const random = this.streams.courier;
      const birdKind = random() < 0.62 ? "pelican" : "gullFlock";
      const powerupKind = POWERUP_KINDS[Math.min(POWERUP_KINDS.length - 1, Math.floor(random() * POWERUP_KINDS.length))];
      const packet = {
        direction: random() < 0.5 ? 1 : -1,
        yOffset: (random() - 0.5) * 22,
        speedRoll: random(),
        eventSeed: random() * 0xffffffff,
      };
      this.requestCourier(birdKind, powerupKind, packet);
      this.nextCourierCandidate = this.elapsed + 24 + random() * 18;
    }

    if (this.elapsed + 1e-9 >= this.nextRaceCandidate) {
      const random = this.streams.race;
      const kind = random() < 0.58 ? "speedboat" : "jetSki";
      this.requestRace(kind, {
        direction: this.context.direction,
        finishDistance: 210 + random() * 80,
        competitorSpeed: 48 + random() * 14,
        eventSeed: random() * 0xffffffff,
      });
      this.nextRaceCandidate = this.elapsed + 29 + random() * 24;
    }

    if (this.elapsed + 1e-9 >= this.nextAircraftDropCandidate) {
      const random = this.streams.aircraftDrop;
      const aircraftKinds = ["propPlane", "seaplane", "helicopter"];
      const aircraftKind = aircraftKinds[Math.min(aircraftKinds.length - 1, Math.floor(random() * aircraftKinds.length))];
      const powerupKind = POWERUP_KINDS[Math.min(POWERUP_KINDS.length - 1, Math.floor(random() * POWERUP_KINDS.length))];
      this.requestAircraftDrop(aircraftKind, powerupKind, {
        direction: random() < 0.5 ? 1 : -1,
        yOffset: (random() - 0.5) * 20,
        eventSeed: random() * 0xffffffff,
      });
      this.nextAircraftDropCandidate = this.elapsed + 42 + random() * 30;
    }
  }

  updateCarrierScheduler() {
    if (this.carrier.hasAppeared || this.elapsed + 1e-9 < this.nextCarrierCandidate) return;
    const random = this.streams.setPiece;
    const appears = random() < 0.1;
    const packet = {
      direction: random() < 0.5 ? 1 : -1,
      eventSeed: random() * 0xffffffff,
    };
    if (appears) this.forceCarrier(packet);
    this.nextCarrierCandidate = this.elapsed + 34 + random() * 22;
  }

  scheduleNextAmbient(layer, initial) {
    const config = WORLD_LAYER_CONFIG[layer];
    const interval = randomBetween(this.streams[layer], config.interval) / Math.max(0.45, this.profile.density);
    this.nextAmbient[layer] = this.elapsed + interval + (initial ? 0.7 + this.streams[layer]() * 1.6 : 0);
  }

  updateTraffic(dt) {
    for (const layer of WORLD_LAYER_ORDER) {
      const config = WORLD_LAYER_CONFIG[layer];
      for (const entity of this.traffic[layer]) {
        if (!entity.active) continue;
        entity.previousWorldX = entity.worldX;
        entity.previousY = entity.y;
        entity.previousPhase = entity.phase;
        entity.worldX += stableTrafficWorldDelta(entity, config, this.context, dt);
        entity.y += entity.vy * dt;
        entity.phaseTime += dt;
        entity.animationTime += dt;
        const duration = Math.max(0.001, entity.despawnTime - entity.spawnTime);
        const progress = clamp((this.elapsed - entity.spawnTime) / duration, 0, 1);
        const definition = TRAFFIC_CATALOG[entity.kind];
        if (definition?.bird) this.updateBirdTraffic(entity, dt, config);
        if (!entity.reaction && !entity.activity) {
          if (definition?.banner) {
            entity.phase = progress < 0.18 ? "approach" : progress < 0.82 ? "tow" : "exit";
          } else if (definition?.boat) {
            entity.turning = progress >= 0.72 && progress < 0.9;
            entity.phase = entity.turning ? "turn" : progress >= 0.9 ? "exit" : "cruise";
          } else if (progress >= 0.88) {
            entity.phase = "exit";
          }
        }
        if (entity.phase !== entity.previousPhase && (definition?.banner || definition?.boat)) {
          this.emitEvent("trafficPhase", entity);
        }
        const offscreen = isProjectedOffscreen(entity.worldX, this.context.cameraWorldX, config.parallax, {
          width: WORLD_LIMITS.logicalWidth,
          margin: config.cullMargin,
          centerX: WORLD_LIMITS.centerX,
        });
        if (this.elapsed >= entity.despawnTime || (!entity.activity && offscreen && this.elapsed - entity.spawnTime > 0.35)) {
          resetTrafficEntity(entity);
        }
      }
    }
  }

  startWildlife(kind, options, force) {
    const definition = WILDLIFE_CATALOG[kind];
    const entity = this.wildlife.find((candidate) => candidate.kind === kind);
    if (!definition || !entity || entity.active) return null;
    if (!force && (this.hasActiveInteractive() || this.elapsed < this.interactiveQuietUntil || this.elapsed < entity.cooldownUntil)) return null;

    const direction = signOr(options.direction, 1);
    const baseSpeed = kind === "shark" ? 86 : kind === "dolphin" ? 48 : 32;
    const speed = finite(options.speed, baseSpeed * (0.88 + finite(options.speedRoll, 0.5) * 0.24));
    const defaultPhase = kind === "whale" ? "distant" : "telegraph";
    const phase = phaseOr(options.phase, definition.phases, defaultPhase);
    const approachTime = kind === "dolphin"
      ? definition.phases.approach + definition.phases.catchable * 0.45
      : kind === "shark"
        ? definition.phases.crossing * 0.48
        : definition.phases.breach + definition.phases.ramp * 0.35;
    const defaultX = this.context.player.x - direction * Math.abs(speed) * approachTime;
    const screenX = finite(options.screenX, finite(options.x, defaultX));
    const waterlineY = clamp(finite(this.context.waterlineY, 79), 64, 100);
    const requestedY = finite(
      options.y,
      kind === "whale"
        ? waterlineY + 38 + finite(options.yOffset)
        : this.context.player.y + finite(options.yOffset),
    );
    // Whale encounters originate from the ocean, never from Kaki's current
    // aerial height. Breach art may rise above this anchor, but its body/wake
    // remains registered to a band below the horizon.
    const screenY = kind === "whale"
      ? clamp(requestedY, waterlineY + 28, Math.min(172, waterlineY + 72))
      : clamp(requestedY, 36, 190);
    const sharkCandidate = {
      x: screenX,
      y: screenY,
      vx: direction * Math.abs(speed),
      vy: 0,
    };
    if (!force && kind === "shark" && !isSharkPathFair({
      player: this.context.player,
      shark: sharkCandidate,
      timeToImpact: definition.phases.crossing * 0.48,
      telegraphTime: definition.phases.telegraph,
      playerRadius: this.context.player.radius,
      sharkRadius: definition.radius,
      control: this.context.control,
    })) return null;

    entity.active = true;
    entity.phase = phase;
    entity.previousPhase = phase;
    entity.phaseTime = 0;
    entity.spawnTime = this.elapsed;
    entity.worldX = worldXForScreenX(screenX, this.context.cameraWorldX, 1, WORLD_LIMITS.centerX);
    entity.previousWorldX = entity.worldX;
    entity.y = screenY;
    entity.previousY = screenY;
    entity.vx = direction * Math.abs(speed);
    entity.vy = finite(options.vy);
    entity.direction = direction;
    entity.radius = definition.radius;
    entity.nearRadius = definition.nearRadius;
    entity.eventSeed = (Number.isFinite(options.eventSeed) ? options.eventSeed : this.streams.wildlife() * 0xffffffff) >>> 0;
    entity.hit = false;
    entity.nearAwarded = false;
    entity.nearCandidate = false;
    entity.collidable = phase === "catchable" || phase === "crossing" || phase === "ramp";
    entity.cooldownUntil = Math.max(entity.cooldownUntil, this.elapsed + definition.cooldown);
    this.lastInteractiveSpawn = this.elapsed;
    this.interactiveQuietUntil = Math.max(
      this.interactiveQuietUntil,
      this.elapsed + estimatedWildlifeDuration(kind, phase) + WORLD_LIMITS.minimumInteractiveQuiet,
    );
    this.emitEvent("wildlifePhase", entity);
    if (entity.kind === "dolphin" && entity.phase === "mounted") {
      this.requestFoamGates("dolphin", {
        direction: this.context.direction,
        eventSeed: entity.eventSeed ^ 0xf04a6a7e,
      });
    }
    return entity;
  }

  updateWildlife(dt) {
    for (const entity of this.wildlife) {
      if (!entity.active) continue;
      const definition = WILDLIFE_CATALOG[entity.kind];
      entity.previousWorldX = entity.worldX;
      entity.previousY = entity.y;
      entity.previousPhase = entity.phase;
      entity.phaseTime += dt;

      if (entity.phase === "mounted") {
        entity.worldX = worldXForScreenX(this.context.player.x, this.context.cameraWorldX, 1, WORLD_LIMITS.centerX);
        entity.y = this.context.player.y + (entity.kind === "whale" ? 9 : 5);
      } else if (entity.phase !== "telegraph" && entity.phase !== "distant" && entity.phase !== "blow") {
        entity.worldX += entity.vx * dt;
        entity.y += entity.vy * dt;
      }

      if (entity.kind === "dolphin") this.updateDolphin(entity, definition);
      else if (entity.kind === "shark") this.updateShark(entity, definition);
      else this.updateWhale(entity, definition);
    }
  }

  updateDolphin(entity, definition) {
    if (entity.phase === "telegraph" && entity.phaseTime >= definition.phases.telegraph) {
      this.setWildlifePhase(entity, "approach");
    } else if (entity.phase === "approach" && entity.phaseTime >= definition.phases.approach) {
      this.setWildlifePhase(entity, "catchable");
    } else if (entity.phase === "catchable") {
      if (this.wildlifeTouchesPlayer(entity)) {
        this.setWildlifePhase(entity, "mounted");
        this.emitInteraction("dolphinMounted", entity);
      } else if (entity.phaseTime >= definition.phases.catchable) {
        this.setWildlifePhase(entity, "depart");
      }
    } else if (entity.phase === "mounted" && entity.phaseTime >= definition.phases.mounted) {
      this.setWildlifePhase(entity, "dismount");
      this.emitInteraction("animalDismount", entity, { reason: "dolphin" });
    } else if (entity.phase === "dismount" && entity.phaseTime >= definition.phases.dismount) {
      this.setWildlifePhase(entity, "depart");
    } else if (entity.phase === "depart" && entity.phaseTime >= definition.phases.depart) {
      this.finishWildlife(entity);
    }
  }

  updateShark(entity, definition) {
    if (entity.phase === "telegraph" && entity.phaseTime >= definition.phases.telegraph) {
      this.setWildlifePhase(entity, "crossing");
    } else if (entity.phase === "crossing") {
      const { playerPrevious, playerCurrent, entityPrevious: sharkPrevious, entityCurrent: sharkCurrent } = this.prepareCollision(entity);
      const collision = sweptCircleContact(
        playerPrevious,
        playerCurrent,
        this.context.player.radius,
        sharkPrevious,
        sharkCurrent,
        definition.radius,
      );
      if (collision && !entity.hit) {
        entity.hit = true;
        this.emitInteraction("sharkCollision", entity);
        this.setWildlifePhase(entity, "depart");
      } else if (!entity.nearAwarded) {
        const nearRadius = this.context.player.radius + definition.nearRadius;
        const distanceSquared = sweptCircleDistanceSquared(playerPrevious, playerCurrent, sharkPrevious, sharkCurrent);
        if (distanceSquared <= nearRadius * nearRadius) {
          entity.nearCandidate = true;
        }
      }
      if (entity.phase === "crossing" && entity.phaseTime >= definition.phases.crossing) {
        if (entity.nearCandidate && !entity.hit && !entity.nearAwarded) {
          entity.nearAwarded = true;
          this.emitInteraction("sharkThread", entity);
        }
        this.setWildlifePhase(entity, "depart");
      }
    } else if (entity.phase === "depart" && entity.phaseTime >= definition.phases.depart) {
      this.finishWildlife(entity);
    }
  }

  updateWhale(entity, definition) {
    if (entity.phase === "distant" && entity.phaseTime >= definition.phases.distant) {
      this.setWildlifePhase(entity, "blow");
    } else if (entity.phase === "blow" && entity.phaseTime >= definition.phases.blow) {
      this.setWildlifePhase(entity, "breach");
    } else if (entity.phase === "breach" && entity.phaseTime >= definition.phases.breach) {
      this.setWildlifePhase(entity, "ramp");
    } else if (entity.phase === "ramp") {
      if (this.context.player.allowWhaleRide && this.wildlifeTouchesPlayer(entity)) {
        this.setWildlifePhase(entity, "mounted");
        this.emitInteraction("whaleMounted", entity);
      } else if (entity.phaseTime >= definition.phases.ramp) {
        this.setWildlifePhase(entity, "splash");
      }
    } else if (entity.phase === "mounted" && entity.phaseTime >= definition.phases.mounted) {
      this.setWildlifePhase(entity, "dismount");
      this.emitInteraction("animalDismount", entity, { reason: "whale" });
    } else if (entity.phase === "dismount" && entity.phaseTime >= definition.phases.dismount) {
      this.setWildlifePhase(entity, "splash");
    } else if (entity.phase === "splash" && entity.phaseTime >= definition.phases.splash) {
      this.setWildlifePhase(entity, "depart");
    } else if (entity.phase === "depart" && entity.phaseTime >= definition.phases.depart) {
      this.finishWildlife(entity);
    }
  }

  setWildlifePhase(entity, phase) {
    entity.previousPhase = entity.phase;
    entity.phase = phase;
    entity.phaseTime = 0;
    entity.collidable = phase === "catchable" || phase === "crossing" || phase === "ramp";
    this.emitEvent("wildlifePhase", entity);
    if (entity.kind === "dolphin" && phase === "mounted") {
      this.requestBirdReaction("circle", { reason: "dolphinCelebration", maxCount: 3 });
      this.requestFoamGates("dolphin", {
        direction: this.context.direction,
        eventSeed: entity.eventSeed ^ 0xf04a6a7e,
      });
    } else if (entity.kind === "whale" && (phase === "breach" || phase === "splash")) {
      this.requestBirdReaction("scatter", { reason: "whaleBreach" });
    }
  }

  finishWildlife(entity) {
    const cooldownUntil = entity.cooldownUntil;
    resetWildlifeEntity(entity, false);
    entity.cooldownUntil = cooldownUntil;
  }

  wildlifeTouchesPlayer(entity) {
    if (!entity.collidable) return false;
    const { playerPrevious, playerCurrent, entityPrevious, entityCurrent } = this.prepareCollision(entity);
    return sweptCircleContact(
      playerPrevious,
      playerCurrent,
      this.context.player.radius,
      entityPrevious,
      entityCurrent,
      entity.radius,
    );
  }

  startPowerup(kind, options, force) {
    const definition = POWERUP_CATALOG[kind];
    const entity = this.powerups.find((candidate) => candidate.kind === kind);
    if (!definition || !entity || entity.active) return null;
    if (!force && (
      this.hasActiveInteractive()
      || this.elapsed < this.interactiveQuietUntil
      || this.bonuses[kind].active
      || activeBonusCount(this.bonuses) >= WORLD_LIMITS.maxActiveBonuses
    )) return null;

    const phase = options.phase === "available" ? "available" : "telegraph";
    const direction = signOr(options.direction, 1);
    const speed = finite(options.speed, 11 + finite(options.speedRoll, 0.5) * 7);
    const screenVelocity = direction * Math.abs(speed);
    const screenX = finite(options.screenX, finite(options.x, this.context.player.x - screenVelocity * 1.2));
    const screenY = clamp(finite(options.y, this.context.player.y + finite(options.yOffset)), 34, 190);
    const interceptTime = phase === "available" ? 0.35 : 1.45;
    if (!force && !isReachablePickup({
      player: this.context.player,
      target: { x: screenX, y: screenY, vx: screenVelocity, vy: finite(options.vy) },
      interceptTime,
      pickupRadius: definition.radius,
      playerRadius: this.context.player.radius,
      control: this.context.control,
    })) return null;

    entity.active = true;
    entity.phase = phase;
    entity.previousPhase = phase;
    entity.phaseTime = 0;
    entity.spawnTime = this.elapsed;
    entity.worldX = worldXForScreenX(screenX, this.context.cameraWorldX, 1, WORLD_LIMITS.centerX);
    entity.previousWorldX = entity.worldX;
    entity.y = screenY;
    entity.previousY = screenY;
    entity.vx = screenVelocity;
    entity.vy = finite(options.vy);
    entity.direction = direction;
    entity.radius = definition.radius;
    entity.eventSeed = (Number.isFinite(options.eventSeed) ? options.eventSeed : this.streams.powerup() * 0xffffffff) >>> 0;
    entity.collidable = phase === "available";
    this.lastInteractiveSpawn = this.elapsed;
    this.interactiveQuietUntil = Math.max(
      this.interactiveQuietUntil,
      this.elapsed + 0.7 + definition.availableFor + WORLD_LIMITS.minimumInteractiveQuiet,
    );
    this.emitEvent("powerupPhase", entity);
    return entity;
  }

  updatePowerups(dt) {
    for (const entity of this.powerups) {
      if (!entity.active) continue;
      const definition = POWERUP_CATALOG[entity.kind];
      entity.previousWorldX = entity.worldX;
      entity.previousY = entity.y;
      entity.previousPhase = entity.phase;
      entity.phaseTime += dt;
      if (entity.phase !== "telegraph") {
        entity.worldX += entity.vx * dt;
        entity.y += entity.vy * dt;
      }

      if (entity.phase === "telegraph" && entity.phaseTime >= 0.7) {
        this.setPowerupPhase(entity, "available");
      } else if (entity.phase === "available") {
        const { playerPrevious, playerCurrent, entityPrevious, entityCurrent } = this.prepareCollision(entity);
        const contact = sweptCircleContact(
          playerPrevious,
          playerCurrent,
          this.context.player.radius,
          entityPrevious,
          entityCurrent,
          definition.radius,
        );
        if (contact) {
          this.activateBonus(entity.kind);
          this.emitInteraction("powerupCollected", entity, {
            value: finite(definition.effect.speedBurst),
          });
          this.setPowerupPhase(entity, "collected");
        } else if (entity.phaseTime >= definition.availableFor) {
          this.setPowerupPhase(entity, "missed");
        }
      } else if ((entity.phase === "collected" || entity.phase === "missed") && entity.phaseTime >= 0.35) {
        resetPowerupEntity(entity);
      }
    }
  }

  setPowerupPhase(entity, phase) {
    entity.previousPhase = entity.phase;
    entity.phase = phase;
    entity.phaseTime = 0;
    entity.collidable = phase === "available";
    this.emitEvent("powerupPhase", entity);
  }

  activateBonus(kind) {
    const definition = POWERUP_CATALOG[kind];
    const bonus = this.bonuses[kind];
    bonus.active = true;
    bonus.remaining = definition.activeFor;
    bonus.charges = finite(definition.charges);
    bonus.collectedAt = this.elapsed;
    this.refreshModifiers();
  }

  updateBonuses(dt) {
    for (const bonus of Object.values(this.bonuses)) {
      if (!bonus.active) continue;
      bonus.remaining = Math.max(0, bonus.remaining - dt);
      if (bonus.remaining <= 0) {
        bonus.active = false;
        bonus.charges = 0;
        this.emitEvent("powerupExpired", bonus);
      }
    }
  }

  refreshModifiers() {
    const mango = this.bonuses.mangoRush;
    const moon = this.bonuses.moonPop;
    const star = this.bonuses.starFoam;
    this.modifiers.uphillLossScale = mango.active ? POWERUP_CATALOG.mangoRush.effect.uphillLossScale : 1;
    this.modifiers.launchScale = moon.active && moon.charges > 0 ? POWERUP_CATALOG.moonPop.effect.launchScale : 1;
    this.modifiers.protectsFlow = Boolean(star.active && star.charges > 0);
    this.modifiers.mangoRushRemaining = mango.remaining;
    this.modifiers.moonPopCharges = moon.charges;
    this.modifiers.starFoamCharges = star.charges;
  }

  updateCarrier(dt) {
    if (!this.carrier.active) return;
    this.carrier.phaseTime += dt;
    const duration = CARRIER_PHASES[this.carrier.phase];
    if (!(duration > 0) || this.carrier.phaseTime < duration) return;
    const next = {
      haze: "arrival",
      arrival: "deckActivity",
      deckActivity: "launch",
      launch: "airshow",
      airshow: "depart",
      depart: "dormant",
    }[this.carrier.phase];
    if (next === "dormant") {
      this.carrier.active = false;
      this.carrier.phase = "dormant";
      this.carrier.phaseTime = 0;
      return;
    }
    if (this.carrier.phase === "airshow" && !this.carrier.airshowResolved) {
      this.emitInteraction("fleetAirshowCompleted", this.carrier, { reason: "expired", value: 0 });
      this.carrier.airshowResolved = true;
    }
    this.setCarrierPhase(next);
  }

  setCarrierPhase(phase) {
    this.carrier.previousPhase = this.carrier.phase;
    this.carrier.phase = phase;
    this.carrier.phaseTime = 0;
    this.emitEvent("carrierPhase", this.carrier);
    if (phase === "airshow") {
      this.requestFoamGates("airshow", {
        direction: this.context.direction,
        eventSeed: this.carrier.eventSeed ^ 0xa17540f0,
      });
    }
  }

  hasActiveInteractive() {
    return this.wildlife.some((entity) => entity.active)
      || this.powerups.some((entity) => entity.active)
      || this.courier.active
      || this.aircraftDrop.active
      || this.race.active
      || this.foamGateSeries.active;
  }

  prepareCollision(entity) {
    const scratch = this.collisionScratch;
    scratch.playerPrevious.x = this.context.player.previousX;
    scratch.playerPrevious.y = this.context.player.previousY;
    scratch.playerCurrent.x = this.context.player.x;
    scratch.playerCurrent.y = this.context.player.y;
    scratch.entityPrevious.x = projectWorldX(
      entity.previousWorldX,
      this.context.previousCameraWorldX,
      1,
      WORLD_LIMITS.centerX,
    );
    scratch.entityPrevious.y = entity.previousY;
    scratch.entityCurrent.x = projectWorldX(
      entity.worldX,
      this.context.cameraWorldX,
      1,
      WORLD_LIMITS.centerX,
    );
    scratch.entityCurrent.y = entity.y;
    return scratch;
  }

  prepareTrafficCollision(entity, parallax) {
    const scratch = this.collisionScratch;
    scratch.playerPrevious.x = this.context.player.previousX;
    scratch.playerPrevious.y = this.context.player.previousY;
    scratch.playerCurrent.x = this.context.player.x;
    scratch.playerCurrent.y = this.context.player.y;
    scratch.entityPrevious.x = projectWorldX(
      entity.previousWorldX,
      this.context.previousCameraWorldX,
      parallax,
      WORLD_LIMITS.centerX,
    );
    scratch.entityPrevious.y = entity.previousY;
    scratch.entityCurrent.x = projectWorldX(
      entity.worldX,
      this.context.cameraWorldX,
      parallax,
      WORLD_LIMITS.centerX,
    );
    scratch.entityCurrent.y = entity.y;
    return scratch;
  }

  emitEvent(type, source, details = null) {
    if (this.eventCount >= this.events.length) {
      this.droppedEventCount += 1;
      return;
    }
    writeSignalRecord(this.events[this.eventCount], type, this.elapsed, source, details);
    this.eventCount += 1;
  }

  emitInteraction(type, source, details = null) {
    if (this.interactionCount >= this.interactions.length) {
      this.droppedInteractionCount += 1;
      return;
    }
    writeSignalRecord(this.interactions[this.interactionCount], type, this.elapsed, source, details);
    this.interactionCount += 1;
  }
}

/**
 * Preserve an ambient traffic entity's intended screen direction while still
 * allowing a small parallax response to rider movement. Camera reversals can
 * change its apparent speed, but can no longer make it ping-pong backward.
 */
export function stableTrafficWorldDelta(entity, config, context, dt) {
  const seconds = Math.max(0, finite(dt));
  const parallax = Math.max(0.0001, finite(config?.parallax, 1));
  const selfWorldDelta = finite(entity?.vx) * seconds;
  const cameraDelta = finite(context?.cameraWorldX) - finite(context?.previousCameraWorldX);
  const selfScreenDelta = selfWorldDelta * parallax;
  const cameraScreenDelta = cameraDelta * parallax;
  const retainedParallax = clamp(
    cameraScreenDelta,
    -Math.abs(selfScreenDelta) * 0.35,
    Math.abs(selfScreenDelta) * 0.35,
  );
  return selfWorldDelta + cameraDelta - retainedParallax / parallax;
}

function createStreams(seed, conditionId) {
  const conditionSeed = hashString(conditionId);
  const streams = Object.create(null);
  for (const [name, salt] of Object.entries(STREAM_SALTS)) {
    streams[name] = seededRandom(mixSeed(seed, salt ^ conditionSeed));
  }
  return streams;
}

function createTrafficEntity(layer, index) {
  return {
    id: `${layer}-${index}`,
    active: false,
    kind: "",
    layer,
    renderBand: "",
    collidable: false,
    phase: "idle",
    previousPhase: "idle",
    phaseTime: 0,
    spawnTime: 0,
    despawnTime: 0,
    worldX: 0,
    previousWorldX: 0,
    y: 0,
    previousY: 0,
    vx: 0,
    vy: 0,
    direction: 1,
    scale: 1,
    animation: "",
    animationTime: 0,
    eventSeed: 0,
    message: "",
    payload: "",
    activity: "",
    reaction: "",
    reactionReason: "",
    reactionTime: 0,
    reactionDuration: 0,
    baseVx: 0,
    baseVy: 0,
    threadAwarded: false,
    dodged: false,
    forceThread: false,
    turning: false,
  };
}

function resetTrafficEntity(entity) {
  entity.active = false;
  entity.kind = "";
  entity.renderBand = "";
  entity.collidable = false;
  entity.phase = "idle";
  entity.previousPhase = "idle";
  entity.phaseTime = 0;
  entity.spawnTime = 0;
  entity.despawnTime = 0;
  entity.worldX = 0;
  entity.previousWorldX = 0;
  entity.y = 0;
  entity.previousY = 0;
  entity.vx = 0;
  entity.vy = 0;
  entity.direction = 1;
  entity.scale = 1;
  entity.animation = "";
  entity.animationTime = 0;
  entity.eventSeed = 0;
  entity.message = "";
  entity.payload = "";
  entity.activity = "";
  entity.reaction = "";
  entity.reactionReason = "";
  entity.reactionTime = 0;
  entity.reactionDuration = 0;
  entity.baseVx = 0;
  entity.baseVy = 0;
  entity.threadAwarded = false;
  entity.dodged = false;
  entity.forceThread = false;
  entity.turning = false;
}

function createWildlifeEntity(kind, index) {
  return {
    id: `wildlife-${index}`,
    active: false,
    kind,
    layer: "near",
    renderBand: "playfieldBack",
    collidable: false,
    phase: "idle",
    previousPhase: "idle",
    phaseTime: 0,
    spawnTime: 0,
    worldX: 0,
    previousWorldX: 0,
    y: 0,
    previousY: 0,
    vx: 0,
    vy: 0,
    direction: 1,
    radius: 0,
    nearRadius: 0,
    eventSeed: 0,
    hit: false,
    nearAwarded: false,
    nearCandidate: false,
    cooldownUntil: 0,
  };
}

function resetWildlifeEntity(entity, resetCooldown = true) {
  entity.active = false;
  entity.collidable = false;
  entity.phase = "idle";
  entity.previousPhase = "idle";
  entity.phaseTime = 0;
  entity.spawnTime = 0;
  entity.worldX = 0;
  entity.previousWorldX = 0;
  entity.y = 0;
  entity.previousY = 0;
  entity.vx = 0;
  entity.vy = 0;
  entity.direction = 1;
  entity.radius = 0;
  entity.nearRadius = 0;
  entity.eventSeed = 0;
  entity.hit = false;
  entity.nearAwarded = false;
  entity.nearCandidate = false;
  if (resetCooldown) entity.cooldownUntil = 0;
}

function createPowerupEntity(kind, index) {
  return {
    id: `powerup-${index}`,
    active: false,
    kind,
    layer: "near",
    renderBand: "playfieldFront",
    collidable: false,
    phase: "idle",
    previousPhase: "idle",
    phaseTime: 0,
    spawnTime: 0,
    worldX: 0,
    previousWorldX: 0,
    y: 0,
    previousY: 0,
    vx: 0,
    vy: 0,
    direction: 1,
    radius: 0,
    eventSeed: 0,
  };
}

function resetPowerupEntity(entity) {
  entity.active = false;
  entity.collidable = false;
  entity.phase = "idle";
  entity.previousPhase = "idle";
  entity.phaseTime = 0;
  entity.spawnTime = 0;
  entity.worldX = 0;
  entity.previousWorldX = 0;
  entity.y = 0;
  entity.previousY = 0;
  entity.vx = 0;
  entity.vy = 0;
  entity.direction = 1;
  entity.radius = 0;
  entity.eventSeed = 0;
}

function createBonusState(kind) {
  return {
    id: `bonus-${kind}`,
    kind,
    active: false,
    remaining: 0,
    charges: 0,
    collectedAt: -1,
  };
}

function resetBonusState(bonus) {
  bonus.active = false;
  bonus.remaining = 0;
  bonus.charges = 0;
  bonus.collectedAt = -1;
}

function createCarrierState() {
  return {
    id: "carrier-0",
    kind: "carrier",
    active: false,
    hasAppeared: false,
    collidable: false,
    phase: "dormant",
    previousPhase: "dormant",
    phaseTime: 0,
    direction: 1,
    eventSeed: 0,
    airshowResolved: false,
  };
}

function resetCarrierState(carrier, resetAppearance = true) {
  carrier.active = false;
  if (resetAppearance) carrier.hasAppeared = false;
  carrier.collidable = false;
  carrier.phase = "dormant";
  carrier.previousPhase = "dormant";
  carrier.phaseTime = 0;
  carrier.direction = 1;
  carrier.eventSeed = 0;
  carrier.airshowResolved = false;
}

function createCourierState() {
  return {
    id: "courier-0",
    kind: "",
    active: false,
    phase: "dormant",
    phaseTime: 0,
    birdId: "",
    powerupKind: "",
    direction: 1,
    dropWorldX: 0,
    dropY: 0,
    dropVx: 0,
    dropVy: 0,
    eventSeed: 0,
    dropped: false,
    message: "",
  };
}

function resetCourierState(state) {
  state.kind = "";
  state.active = false;
  state.phase = "dormant";
  state.phaseTime = 0;
  state.birdId = "";
  state.powerupKind = "";
  state.direction = 1;
  state.dropWorldX = 0;
  state.dropY = 0;
  state.dropVx = 0;
  state.dropVy = 0;
  state.eventSeed = 0;
  state.dropped = false;
  state.message = "";
}

function createRaceState() {
  return {
    id: "race-0",
    kind: "",
    active: false,
    phase: "dormant",
    phaseTime: 0,
    trafficId: "",
    direction: 1,
    startCameraWorldX: 0,
    finishDistance: 0,
    playerDistance: 0,
    competitorDistance: 0,
    competitorSpeed: 0,
    eventSeed: 0,
    result: "",
    message: "",
  };
}

function resetRaceState(state) {
  state.kind = "";
  state.active = false;
  state.phase = "dormant";
  state.phaseTime = 0;
  state.trafficId = "";
  state.direction = 1;
  state.startCameraWorldX = 0;
  state.finishDistance = 0;
  state.playerDistance = 0;
  state.competitorDistance = 0;
  state.competitorSpeed = 0;
  state.eventSeed = 0;
  state.result = "";
  state.message = "";
}

function createAircraftDropState() {
  return {
    id: "aircraft-drop-0",
    kind: "",
    active: false,
    phase: "dormant",
    phaseTime: 0,
    trafficId: "",
    powerupKind: "",
    direction: 1,
    dropWorldX: 0,
    dropY: 0,
    dropVx: 0,
    dropVy: 0,
    eventSeed: 0,
    dropped: false,
    message: "",
  };
}

function resetAircraftDropState(state) {
  state.kind = "";
  state.active = false;
  state.phase = "dormant";
  state.phaseTime = 0;
  state.trafficId = "";
  state.powerupKind = "";
  state.direction = 1;
  state.dropWorldX = 0;
  state.dropY = 0;
  state.dropVx = 0;
  state.dropVy = 0;
  state.eventSeed = 0;
  state.dropped = false;
  state.message = "";
}

function createFoamGateSeries() {
  return {
    id: "foam-gate-series-0",
    kind: "foamGateSeries",
    active: false,
    phase: "dormant",
    phaseTime: 0,
    owner: "",
    count: 0,
    cleared: 0,
    eventSeed: 0,
    message: "",
  };
}

function resetFoamGateSeries(state) {
  state.active = false;
  state.phase = "dormant";
  state.phaseTime = 0;
  state.owner = "";
  state.count = 0;
  state.cleared = 0;
  state.eventSeed = 0;
  state.message = "";
}

function createFoamGate(index) {
  return {
    id: `foam-gate-${index}`,
    kind: "foamGate",
    active: false,
    layer: "near",
    renderBand: "playfieldFront",
    collidable: false,
    phase: "idle",
    previousPhase: "idle",
    phaseTime: 0,
    worldX: 0,
    previousWorldX: 0,
    y: 0,
    previousY: 0,
    vx: 0,
    vy: 0,
    direction: 1,
    radius: FOAM_GATE_CONFIG.radius,
    eventSeed: 0,
    message: "",
    payload: "",
  };
}

function resetFoamGate(gate) {
  gate.active = false;
  gate.collidable = false;
  gate.phase = "idle";
  gate.previousPhase = "idle";
  gate.phaseTime = 0;
  gate.worldX = 0;
  gate.previousWorldX = 0;
  gate.y = 0;
  gate.previousY = 0;
  gate.vx = 0;
  gate.vy = 0;
  gate.direction = 1;
  gate.radius = FOAM_GATE_CONFIG.radius;
  gate.eventSeed = 0;
  gate.message = "";
  gate.payload = "";
}

function createStepContext() {
  return {
    cameraWorldX: 0,
    previousCameraWorldX: 0,
    direction: 1,
    player: {
      x: 192,
      previousX: 192,
      y: 128,
      previousY: 128,
      vx: 0,
      vy: 0,
      radius: 7,
      state: "riding",
      allowWhaleRide: true,
    },
    control: {
      horizontalAcceleration: 38,
      verticalAcceleration: 62,
      maxHorizontalSpeed: 90,
      maxVerticalSpeed: 120,
      gravity: 0,
    },
    upcomingWildlife: "",
    paceBeatsBest: false,
    lastWipeoutAge: Infinity,
    giantTrickAge: Infinity,
    waterlineY: 79,
    curlScreenX: NaN,
    curlApproaching: false,
  };
}

function createCollisionScratch() {
  return {
    playerPrevious: { x: 0, y: 0 },
    playerCurrent: { x: 0, y: 0 },
    entityPrevious: { x: 0, y: 0 },
    entityCurrent: { x: 0, y: 0 },
  };
}

function resetStepContext(context) {
  copyStepContext(context, null, 0);
}

function copyStepContext(target, source, previousCameraFallback) {
  const context = source ?? {};
  const player = context.player ?? {};
  const control = context.control ?? {};
  target.previousCameraWorldX = finite(
    context.previousCameraWorldX,
    finite(context.previousWorldTravel, previousCameraFallback),
  );
  target.cameraWorldX = finite(context.cameraWorldX, finite(context.worldTravel, target.previousCameraWorldX));
  target.direction = signOr(context.direction, finite(player.travelDirection, 1));
  target.player.x = finite(player.collisionX, finite(player.screenX, finite(player.x, 192)));
  target.player.previousX = finite(player.previousCollisionX, finite(player.previousScreenX, finite(player.previousX, target.player.x)));
  target.player.y = finite(player.collisionY, finite(player.y, 128));
  target.player.previousY = finite(player.previousCollisionY, finite(player.previousY, target.player.y));
  target.player.vx = finite(player.vx, finite(player.airVX));
  target.player.vy = finite(player.vy, finite(player.airVY));
  target.player.radius = Math.max(1, finite(player.radius, 7));
  target.player.state = String(player.state ?? "riding");
  target.player.allowWhaleRide = player.allowWhaleRide !== false;
  target.control.horizontalAcceleration = Math.max(0, finite(control.horizontalAcceleration, 38));
  target.control.verticalAcceleration = Math.max(0, finite(control.verticalAcceleration, 62));
  target.control.maxHorizontalSpeed = Math.max(1, finite(control.maxHorizontalSpeed, 90));
  target.control.maxVerticalSpeed = Math.max(1, finite(control.maxVerticalSpeed, 120));
  target.control.gravity = finite(control.gravity);
  target.upcomingWildlife = WILDLIFE_CATALOG[context.upcomingWildlife] ? context.upcomingWildlife : "";
  target.paceBeatsBest = Boolean(context.paceBeatsBest);
  target.lastWipeoutAge = finite(context.lastWipeoutAge, Infinity);
  target.giantTrickAge = finite(context.giantTrickAge, Infinity);
  target.waterlineY = clamp(finite(context.waterlineY, 79), 64, 100);
  target.curlScreenX = Number.isFinite(context.curlScreenX)
    ? context.curlScreenX
    : Number.isFinite(context.curlX) ? context.curlX : NaN;
  target.curlApproaching = Boolean(context.curlApproaching || context.incomingCurl);
}

function createModifiers() {
  return {
    uphillLossScale: 1,
    launchScale: 1,
    protectsFlow: false,
    mangoRushRemaining: 0,
    moonPopCharges: 0,
    starFoamCharges: 0,
  };
}

function resetModifiers(modifiers) {
  modifiers.uphillLossScale = 1;
  modifiers.launchScale = 1;
  modifiers.protectsFlow = false;
  modifiers.mangoRushRemaining = 0;
  modifiers.moonPopCharges = 0;
  modifiers.starFoamCharges = 0;
}

function createSignalRecord() {
  return {
    type: "",
    time: 0,
    id: "",
    kind: "",
    layer: "",
    phase: "",
    message: "",
    reason: "",
    value: 0,
    x: 0,
    y: 0,
  };
}

function writeSignalRecord(record, type, time, source = null, details = null) {
  record.type = type;
  record.time = time;
  record.id = String(source?.id ?? "");
  record.kind = String(source?.kind ?? "");
  record.layer = String(source?.layer ?? "");
  record.phase = String(source?.phase ?? "");
  record.message = String(source?.message ?? "");
  record.reason = String(details?.reason ?? "");
  record.value = finite(details?.value);
  record.x = finite(source?.worldX);
  record.y = finite(source?.y);
}

function clearSignalRecord(record) {
  record.type = "";
  record.time = 0;
  record.id = "";
  record.kind = "";
  record.layer = "";
  record.phase = "";
  record.message = "";
  record.reason = "";
  record.value = 0;
  record.x = 0;
  record.y = 0;
}

function snapshotEntity(entity) {
  return {
    id: entity.id,
    kind: entity.kind,
    layer: entity.layer,
    renderBand: entity.renderBand,
    collidable: entity.collidable,
    phase: entity.phase,
    phaseTime: entity.phaseTime,
    worldX: entity.worldX,
    previousWorldX: entity.previousWorldX,
    y: entity.y,
    previousY: entity.previousY,
    vx: entity.vx,
    vy: entity.vy,
    direction: entity.direction,
    eventSeed: entity.eventSeed,
    message: entity.message ?? "",
    payload: entity.payload ?? "",
    activity: entity.activity ?? "",
    reaction: entity.reaction ?? "",
    reactionReason: entity.reactionReason ?? "",
    reactionTime: entity.reactionTime ?? 0,
    threadAwarded: Boolean(entity.threadAwarded),
  };
}

function snapshotBonus(bonus) {
  return {
    active: bonus.active,
    remaining: bonus.remaining,
    charges: bonus.charges,
    collectedAt: bonus.collectedAt,
  };
}

function snapshotCarrier(carrier) {
  return {
    active: carrier.active,
    hasAppeared: carrier.hasAppeared,
    collidable: carrier.collidable,
    phase: carrier.phase,
    phaseTime: carrier.phaseTime,
    direction: carrier.direction,
    eventSeed: carrier.eventSeed,
    airshowResolved: carrier.airshowResolved,
  };
}

function snapshotCourier(state) {
  return {
    active: state.active,
    phase: state.phase,
    phaseTime: state.phaseTime,
    birdKind: state.kind,
    birdId: state.birdId,
    powerupKind: state.powerupKind,
    direction: state.direction,
    dropWorldX: state.dropWorldX,
    dropY: state.dropY,
    eventSeed: state.eventSeed,
    dropped: state.dropped,
  };
}

function snapshotRace(state) {
  return {
    active: state.active,
    phase: state.phase,
    phaseTime: state.phaseTime,
    kind: state.kind,
    trafficId: state.trafficId,
    direction: state.direction,
    startCameraWorldX: state.startCameraWorldX,
    finishDistance: state.finishDistance,
    playerDistance: state.playerDistance,
    competitorDistance: state.competitorDistance,
    competitorSpeed: state.competitorSpeed,
    eventSeed: state.eventSeed,
    result: state.result,
  };
}

function snapshotAircraftDrop(state) {
  return {
    active: state.active,
    phase: state.phase,
    phaseTime: state.phaseTime,
    aircraftKind: state.kind,
    trafficId: state.trafficId,
    powerupKind: state.powerupKind,
    direction: state.direction,
    dropWorldX: state.dropWorldX,
    dropY: state.dropY,
    eventSeed: state.eventSeed,
    dropped: state.dropped,
  };
}

function snapshotFoamGateSeries(state) {
  return {
    active: state.active,
    phase: state.phase,
    phaseTime: state.phaseTime,
    owner: state.owner,
    count: state.count,
    cleared: state.cleared,
    eventSeed: state.eventSeed,
  };
}

function selectBannerMessage(context, roll) {
  if (context.upcomingWildlife === "dolphin") return BANNER_MESSAGES.dolphin;
  if (context.upcomingWildlife === "shark") return BANNER_MESSAGES.shark;
  if (context.paceBeatsBest) return BANNER_MESSAGES.personalBest;
  if (context.giantTrickAge <= 6) return BANNER_MESSAGES.giantTrick;
  if (context.lastWipeoutAge <= 7) return BANNER_MESSAGES.wipeout;
  return BANNER_MESSAGES.generic[Math.min(
    BANNER_MESSAGES.generic.length - 1,
    Math.floor(clamp(finite(roll, 0.5), 0, 0.999999) * BANNER_MESSAGES.generic.length),
  )];
}

function weightedWildlife(weights, roll) {
  const value = clamp(finite(roll, 0.5), 0, 0.999999);
  let cumulative = 0;
  for (const kind of WILDLIFE_KINDS) {
    cumulative += Math.max(0, finite(weights[kind]));
    if (value <= cumulative) return kind;
  }
  return "dolphin";
}

function estimatedWildlifeDuration(kind, startingPhase) {
  const phases = WILDLIFE_CATALOG[kind].phases;
  const order = kind === "dolphin"
    ? ["telegraph", "approach", "catchable", "mounted", "dismount", "depart"]
    : kind === "shark"
      ? ["telegraph", "crossing", "depart"]
      : ["distant", "blow", "breach", "ramp", "mounted", "dismount", "splash", "depart"];
  const startIndex = Math.max(0, order.indexOf(startingPhase));
  let duration = 0;
  for (let index = startIndex; index < order.length; index += 1) duration += finite(phases[order[index]]);
  return duration;
}

function activeBonusCount(bonuses) {
  let count = 0;
  for (const bonus of Object.values(bonuses)) if (bonus.active) count += 1;
  return count;
}

function phaseOr(value, phases, fallback) {
  return Object.hasOwn(phases, value) ? value : fallback;
}

function randomBetween(random, range) {
  return lerpRange(range, random());
}

function lerpRange(range, amount) {
  return range[0] + (range[1] - range[0]) * clamp(finite(amount), 0, 1);
}

function signOr(value, fallback) {
  const sign = Math.sign(finite(value));
  return sign || Math.sign(finite(fallback, 1)) || 1;
}

function mixSeed(seed, salt) {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

function hashString(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
