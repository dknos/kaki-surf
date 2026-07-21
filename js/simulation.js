import {
  BOARDS,
  CONDITIONS,
  DEFAULT_RUN_MODE_ID,
  FIXED_STEP,
  RUN_MODES,
  SCORE,
  TUNING,
} from "./config.js";
import {
  aerialAltitudeForFlight,
  aerialMilestoneForAltitude,
  aerialZoneForAltitude,
  qualifyAerialLaunch,
} from "./aerial.js";
import { clamp, damp, shortestAngle, smoothstep, TAU } from "./math.js";
import {
  boardTailContact,
  createWakeSample,
  deriveAirMotion,
  deriveCanonicalMotion,
  WAKE_SAMPLE_CAPACITY,
  WAKE_SAMPLE_LIFETIME,
} from "./motion.js";
import { ScoreSystem } from "./scoring.js";
import { SurfSchool } from "./tutorial.js";
import { AerialTrickSession, normalizeTrickInput } from "./tricks.js";
import { GameplayWave } from "./wave.js";
import { WorldSimulation } from "./world.js";

const EMPTY_INPUT = Object.freeze({
  x: 0,
  y: 0,
  edge: false,
  edgePressed: false,
  edgeReleased: false,
  turbo: false,
  turboPressed: false,
  turboReleased: false,
  trick1: false,
  trick1Pressed: false,
  trick1Released: false,
  trick2: false,
  trick2Pressed: false,
  trick2Released: false,
  trick3: false,
  trick3Pressed: false,
  trick3Released: false,
  trick4: false,
  trick4Pressed: false,
  trick4Released: false,
  style: false,
  stylePressed: false,
  styleReleased: false,
  trick: false,
  trickPressed: false,
  trickReleased: false,
  special: false,
  specialPressed: false,
  specialReleased: false,
  spinLeft: false,
  spinLeftPressed: false,
  spinLeftReleased: false,
  spinRight: false,
  spinRightPressed: false,
  spinRightReleased: false,
});

const SPEED_TIERS = Object.freeze([
  [52, "STALLING"],
  [78, "GLIDING"],
  [101, "FAST"],
  [124, "FLYING"],
  [Infinity, "BLASTING"],
]);

const PUMP_CHARGE_CUE_STEP = 0.25;
const COMBO_CUE_STEP = 0.5;
const POWERUP_NAMES = Object.freeze({
  mangoRush: "MANGO RUSH",
  moonPop: "MOON POP",
  starFoam: "STAR FOAM",
});

/**
 * Convert a banked aerial result into Turbo. Empty pops and wobble saves do
 * not pay fuel; rotation, completed entries, landing grade, and repetition
 * all remain visible in the economy.
 */
export function turboRefillForLanding(result, quality = "clean", tuning = TUNING) {
  if (quality !== "clean" && quality !== "perfect") return 0;
  const entries = Array.isArray(result?.entries) ? result.entries : [];
  const halfTurns = Math.floor(Math.abs(Number(result?.rotationDegrees) || 0) / 180);
  if (!entries.length && halfTurns < 1) return 0;

  const raw = finiteTuning(tuning.turboTrickBaseRefill, TUNING.turboTrickBaseRefill)
    + entries.length * finiteTuning(tuning.turboTrickEntryRefill, TUNING.turboTrickEntryRefill)
    + Math.min(6, halfTurns)
      * finiteTuning(tuning.turboSpinHalfTurnRefill, TUNING.turboSpinHalfTurnRefill);
  const repeatFactor = clamp(Number(result?.decay ?? result?.repeatFactor ?? 1) || 0, 0, 1);
  const repeatFloor = finiteTuning(
    tuning.turboRepeatRefillFloor,
    TUNING.turboRepeatRefillFloor,
  );
  const qualityFactor = quality === "perfect"
    ? finiteTuning(
      tuning.turboPerfectRefillMultiplier,
      TUNING.turboPerfectRefillMultiplier,
    )
    : 1;
  return clamp(raw * qualityFactor * (repeatFloor + (1 - repeatFloor) * repeatFactor), 0, 1);
}

export class SurfSimulation {
  constructor({
    seed = 0x4b414b49,
    tuning = TUNING,
    controlMode = "simple",
    tutorialEnabled = false,
    mode = DEFAULT_RUN_MODE_ID,
  } = {}) {
    this.seed = seed >>> 0;
    this.tuning = tuning;
    this.wave = new GameplayWave(this.seed);
    this.world = new WorldSimulation({ seed: this.seed, condition: "goldenCoast" });
    this.score = new ScoreSystem();
    this.tutorialEnabled = Boolean(tutorialEnabled);
    this.tutorial = new SurfSchool({ enabled: this.tutorialEnabled });
    this.events = new Array(64);
    this.eventCount = 0;
    this._scoreScales = { speed: 1, pocket: 1, flow: 1 };
    this._normalizedInput = {};
    this._threatContext = {
      playerX: 212,
      speed: TUNING.speed,
      skillMomentum: 0,
      active: false,
    };
    this.assists = { steering: false, landing: false };
    this.board = BOARDS.foamPuff;
    this.condition = CONDITIONS.goldenCoast;
    this.mode = resolveRunMode(mode);
    this.modeId = this.mode.id;
    this.controlMode = normalizeControlMode(controlMode);
    this.worldTravel = 0;
    this.cameraWorldX = 0;
    this.player = createPlayer();
    this.aerialSession = null;
    this.lastWipeoutAt = -Infinity;
    this.lastGiantTrickAt = -Infinity;
    this._worldPreviousPlayerY = 128;
    this._worldContext = createWorldStepContext();
    this.highlights = createRunHighlights();
    this.reset({ tutorialEnabled, mode });
  }

  reset({
    board = this.board,
    condition = this.condition,
    assists = this.assists,
    controlMode = this.controlMode,
    tutorialEnabled = this.tutorialEnabled,
    mode = this.mode,
    seed = this.seed,
    worldQa = null,
    coreSurfLab = false,
  } = {}) {
    this.seed = Number.isFinite(seed) ? seed >>> 0 : this.seed;
    this.board = typeof board === "string" ? BOARDS[board] ?? BOARDS.foamPuff : board;
    this.condition = typeof condition === "string"
      ? CONDITIONS[condition] ?? CONDITIONS.goldenCoast
      : condition?.id && CONDITIONS[condition.id]
        ? CONDITIONS[condition.id]
        : CONDITIONS.goldenCoast;
    this.mode = resolveRunMode(mode);
    this.modeId = this.mode.id;
    this.coreSurfLab = Boolean(coreSurfLab);
    this.coreSurfLabTelemetry = true;
    this.controlMode = normalizeControlMode(controlMode);
    this.assists = {
      steering: Boolean(assists.steering),
      landing: Boolean(assists.landing),
    };
    // The condition selects canonical surface and contact geometry. Install it
    // before reset so the first entry frame, world context, and every derived
    // slope/landing query agree with the renderer.
    this.wave.setProfile(this.condition.waveStyle);
    this.wave.reset(this.seed);
    this.world.reset({ seed: this.seed, condition: this.condition.id, qa: worldQa });
    this.score.reset();
    this.tutorialEnabled = Boolean(tutorialEnabled);
    this.tutorial.reset(this.tutorialEnabled);
    this.comboCueLevel = 1;
    this.elapsed = 0;
    this.activeTime = 0;
    this.rideDistance = 0;
    this.timeRemaining = this.mode.timed
      ? Number(this.mode.duration ?? this.tuning.runDuration)
      : Number.POSITIVE_INFINITY;
    this.endlessSet = 1;
    this.endlessThreatScale = this.mode.timed ? 1 : this.tuning.endlessThreatStart;
    this.endlessScoreBonus = 1;
    this.wipeouts = 0;
    this.complete = false;
    this.started = false;
    this.flowRating = 0;
    this.aerialSession = null;
    this.eventCount = 0;
    this.worldTravel = 0;
    this.cameraWorldX = 0;
    this.lastWipeoutAt = -Infinity;
    this.lastGiantTrickAt = -Infinity;
    resetRunHighlights(this.highlights);
    resetPlayer(
      this.player,
      true,
      this.tuning.speed,
      this.tuning.turboStartCharge,
    );
    if (this.wave.profileId === "heroBarrel") {
      const entryFace = this.wave.powerFaceAt(this.player.x);
      this.player.face = entryFace;
      this.player.previousFace = entryFace;
      this.player.boardAngle = this.wave.slopeAt(this.player.x, entryFace);
      this.player.bodyAngle = this.player.boardAngle;
    }
    this._worldPreviousPlayerY = this.wave.ridingY(this.player.x, this.player.face);
    this.emit("state", { state: "entry" });
  }

  begin() {
    this.started = true;
  }

  update(dt = FIXED_STEP, input = EMPTY_INPUT) {
    if (!this.started || this.complete) return;

    input = normalizeTrickInput(input, this._normalizedInput);
    this.captureSimpleControls(dt, input);
    const contextualDismount = input.edgePressed
      || input.trickPressed
      || input.trick1Pressed
      || input.trick2Pressed
      || input.trick3Pressed
      || input.trick4Pressed;
    if ((input.specialPressed || contextualDismount) && this.player.animalMount) {
      this.world.releaseMountedAnimal(this.player.animalMount, "special");
    }

    const player = this.player;
    const previousWorldTravel = this.worldTravel;
    const previousCameraWorldX = this.cameraWorldX;
    // Presentation tails are lifecycle state, not riding-only state. Aging
    // them here prevents a tube veil from freezing in the air and reappearing
    // after the next landing.
    player.tubeRide.visualExit = Math.max(
      0,
      Number(player.tubeRide.visualExit ?? 0) - dt,
    );
    player.previousX = player.x;
    player.previousFace = player.face;
    player.previousAirX = player.airX;
    player.previousAirY = player.airY;
    player.stateTime += dt;
    this.elapsed += dt;
    if (player.state !== "entry" && player.state !== "wipeout") {
      this.activeTime += dt;
      this.rideDistance += Math.max(0, player.speed) * dt * this.tuning.endlessDistanceScale;
    }
    this.updateEndlessEscalation();
    player.skillMomentum = clamp(
      player.skillMomentum - TUNING.skillMomentumDecay * dt,
      0,
      1,
    );
    this.updateTurboState(dt, input);

    if (this.mode.timed && player.state !== "entry" && player.state !== "wipeout") {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    }

    const waveSpeed = player.state === "airborne" ? Math.max(56, player.speed) : player.speed;
    const threatContext = this._threatContext;
    threatContext.playerX = player.state === "airborne" || player.state === "wipeout"
      ? player.airX
      : player.x;
    threatContext.speed = waveSpeed;
    threatContext.skillMomentum = player.skillMomentum;
    threatContext.active = player.state !== "entry" && player.state !== "wipeout";
    this.wave.update(
      dt,
      waveSpeed,
      this.tuning.curlSpeed * this.endlessThreatScale,
      waveSpeed * player.motionDirection,
      threatContext,
    );
    if (this.coreSurfLab) {
      this.wave.curlX = -520;
      this.wave.pressure = 0.46;
    }
    this.worldTravel = this.wave.worldTravel;
    player.worldTravel = this.worldTravel;
    // Legacy level profiles still use their signed travel camera. Twilight's
    // long face opts into a forward-only dead-zone camera below, so a cutback
    // moves Kaki across the screen instead of reversing every world object.
    if (!this.wave.profile.bounds?.cameraX) this.cameraWorldX = this.worldTravel;

    switch (player.state) {
      case "entry":
        this.updateEntry(dt, input);
        break;
      case "riding":
      case "lip":
        this.updateRiding(dt, input);
        break;
      case "airborne":
        this.updateAirborne(dt, input);
        break;
      case "landing":
      case "wobble":
        this.updateRecovery(dt, input);
        break;
      case "wipeout":
        this.updateWipeout(dt);
        break;
      default:
        break;
    }

    this.applyTurboAcceleration(dt);
    this.applyAnimalRideTuning(dt);
    this.syncCanonicalMotion(dt, true);
    this.updateWakeHistory(dt);
    this.updateWorld(dt, previousWorldTravel, previousCameraWorldX);
    if (this.coreSurfLab) this.score.reset();

    this.updateComboCue();
    player.speedTier = speedTierForSpeed(player.motionSpeed || player.speed);
    player.flow = this.score.flow;
    this.updateTutorialSignals(dt, input);

    if (!this.complete && this.mode.timed && this.timeRemaining <= 0 && player.state !== "airborne") {
      this.finishRun("time");
    }
  }

  updateEndlessEscalation() {
    if (this.mode.timed || this.coreSurfLab) return;
    const duration = Math.max(1, Number(this.tuning.endlessSetDuration) || 36);
    const maxSet = Math.max(1, Math.floor(Number(this.tuning.endlessMaxSet) || 1));
    const nextSet = Math.min(maxSet, Math.floor(this.activeTime / duration) + 1);
    // Entry and wipeout already own strong full-screen feedback. Hold a new
    // set until Kaki is active so its warning cannot be swallowed by recovery.
    if (nextSet > this.endlessSet && ["entry", "wipeout"].includes(this.player.state)) return;
    const changed = nextSet > this.endlessSet;
    this.endlessSet = nextSet;
    this.endlessThreatScale = this.tuning.endlessThreatStart
      + (this.endlessSet - 1) * this.tuning.endlessThreatStep;
    this.endlessScoreBonus = 1 + (this.endlessSet - 1) * this.tuning.endlessScoreStep;
    if (!changed) return;
    const finalSet = this.endlessSet >= maxSet;
    this.emit("endlessSet", {
      set: this.endlessSet,
      threatScale: this.endlessThreatScale,
      scoreBonus: this.endlessScoreBonus,
      final: finalSet,
    });
    this.emit("callout", {
      text: `SET ${this.endlessSet}`,
      subtext: finalSet ? "MAXIMUM BREAK" : "CURL SPEED UP",
      tone: finalSet ? "risk" : "flow",
      channel: "set",
    });
  }

  updateWorld(dt, previousWorldTravel, previousCameraWorldX = this.cameraWorldX) {
    const player = this.player;
    const airborne = player.state === "airborne" || player.state === "wipeout";
    const context = this._worldContext;
    const currentY = airborne
      ? player.airY
      : this.wave.ridingY(player.x, player.face);
    context.worldTravel = this.worldTravel;
    context.previousWorldTravel = previousWorldTravel;
    context.cameraWorldX = this.cameraWorldX;
    context.previousCameraWorldX = previousCameraWorldX;
    context.direction = player.motionDirection;
    context.player.collisionX = airborne ? player.airX : player.x;
    context.player.previousCollisionX = airborne ? player.previousAirX : player.previousX;
    context.player.collisionY = currentY;
    context.player.previousCollisionY = this._worldPreviousPlayerY;
    context.player.vx = player.motionVX;
    context.player.vy = player.motionVY;
    context.player.radius = 7;
    context.player.state = player.state;
    context.player.allowWhaleRide = player.state !== "wipeout" && !this.complete;
    context.control.horizontalAcceleration = this.tuning.lateralResponse * 18;
    context.control.verticalAcceleration = this.tuning.carveAcceleration * this.board.grip;
    context.control.maxHorizontalSpeed = Math.max(48, Math.abs(player.airVX));
    context.control.maxVerticalSpeed = Math.max(96, this.tuning.gravity * 0.65);
    context.control.gravity = this.tuning.gravity;
    context.upcomingWildlife = this.upcomingWildlife();
    context.paceBeatsBest = Boolean(this.paceBeatsBest);
    context.lastWipeoutAge = this.elapsed - this.lastWipeoutAt;
    context.giantTrickAge = this.elapsed - this.lastGiantTrickAt;
    context.waterlineY = clamp(this.wave.crestY(airborne ? player.airX : player.x), 70, 92);
    context.curlScreenX = this.wave.contactX();
    context.curlApproaching = this.wave.pressure >= 0.56;

    this.world.update(dt, context);
    this.world.consumeInteractions((signal) => this.handleWorldInteraction(signal));
    this.world.consumeEvents((signal) => this.handleWorldEvent(signal));
    this._worldPreviousPlayerY = currentY;
  }

  /** Keep every presentation consumer on the same physical motion. */
  syncCanonicalMotion(dt = 0, alignBoard = false) {
    const player = this.player;
    const airborne = player.state === "airborne" || player.state === "wipeout";
    const gradient = airborne ? null : this.wave.surfaceGradientAt(player.x, player.face);
    const motion = airborne
      ? deriveAirMotion(player.airVX, player.airVY, player.motionDirection)
      : deriveCanonicalMotion(
        player.travelVelocity,
        player.faceVelocity,
        gradient,
        player.motionDirection,
      );
    player.motionVX = motion.vx;
    player.motionVY = motion.vy;
    player.motionSpeed = motion.speed;
    player.motionHeading = motion.heading;
    player.motionDirection = motion.direction;
    player.downhillComponent = motion.downhill;
    player.uphillComponent = motion.uphill;
    if (!airborne) {
      player.slopeDrive = motion.downhill - motion.uphill;
      player.surfaceGradientX = gradient.x;
      player.surfaceGradientFace = gradient.face;
      if (alignBoard) {
        // The board is the physical tangent indicator. Keep it exact; body
        // lean may ease for character appeal, but the board cannot lag behind
        // the path and briefly point across its own wake.
        player.boardAngle = motion.spriteAngle;
        player.bodyAngle = damp(player.bodyAngle, motion.spriteAngle, 11, dt);
      }
      const surfaceY = this.wave.ridingY(player.x, player.face);
      const tail = boardTailContact(
        player.x,
        surfaceY + 1,
        motion.heading,
        boardHalfLength(this.board),
      );
      player.tailX = tail.x;
      player.tailY = tail.y;
    }
    return motion;
  }

  updateWakeHistory(dt) {
    const player = this.player;
    for (const sample of player.wakeSamples) {
      if (!sample.active) continue;
      sample.age += dt;
      if (sample.age >= WAKE_SAMPLE_LIFETIME) sample.active = false;
    }

    const contact = ["riding", "lip", "landing", "wobble"].includes(player.state)
      && !player.animalMount;
    if (!contact || player.motionSpeed < 8) {
      player.wakeSampleClock = 0;
      return;
    }
    player.wakeSampleClock += dt;
    const interval = 1 / 60;
    if (player.wakeSampleClock + 1e-9 < interval) return;
    player.wakeSampleClock %= interval;
    const sample = player.wakeSamples[player.wakeSampleCursor];
    sample.active = true;
    sample.worldX = player.tailX + this.cameraWorldX;
    sample.y = player.tailY;
    sample.vx = -player.motionVX;
    sample.vy = -player.motionVY;
    sample.sourceVX = player.motionVX;
    sample.sourceVY = player.motionVY;
    sample.speed = player.motionSpeed;
    sample.age = 0;
    player.wakeSampleCursor = (player.wakeSampleCursor + 1) % player.wakeSamples.length;
  }

  upcomingWildlife() {
    let result = "";
    this.world.forEachWildlife((entity) => {
      if (!result && ["telegraph", "distant", "blow"].includes(entity.phase)) result = entity.kind;
    });
    return result;
  }

  applyAnimalRideTuning(dt) {
    const player = this.player;
    if (!player.animalMount || player.state === "wipeout" || player.state === "complete") return;
    player.animalMountTime += dt;
    const minimumSpeed = player.animalMount === "whale" ? 116 : 102;
    player.speed = clamp(Math.max(player.speed, minimumSpeed), 34, this.currentRideSpeedCap());
    player.waveMomentum = Math.max(player.waveMomentum, player.animalMount === "whale" ? 0.94 : 0.78);
    this.score.addFlow(dt * (player.animalMount === "whale" ? 0.055 : 0.04));
  }

  updateTurboState(dt, input) {
    const player = this.player;
    const rideable = ["riding", "lip", "landing", "wobble"].includes(player.state);
    const wasActive = Boolean(player.turboActive);
    const requested = this.controlMode === "advanced"
      && Boolean(input.turbo)
      && rideable
      && !player.animalMount;
    const drain = finiteTuning(
      this.tuning.turboDrainPerSecond,
      TUNING.turboDrainPerSecond,
    ) * dt;
    player.turboActive = requested && player.turbo > 0;

    if (player.turboActive) {
      player.turbo = Math.max(0, player.turbo - Math.min(player.turbo, drain));
      player.turboOverdrive = damp(
        player.turboOverdrive,
        1,
        finiteTuning(this.tuning.turboOverdriveBuild, TUNING.turboOverdriveBuild),
        dt,
      );
      if (player.turbo <= 0) player.turboActive = false;
    } else {
      player.turboOverdrive = Math.max(
        0,
        player.turboOverdrive
          - finiteTuning(this.tuning.turboOverdriveDecay, TUNING.turboOverdriveDecay) * dt,
      );
    }

    if (!wasActive && player.turboActive) {
      this.emit("turboStart", { level: player.turbo });
    } else if (wasActive && !player.turboActive) {
      this.emit("turboStop", {
        level: player.turbo,
        reason: player.turbo <= 0 ? "empty" : rideable ? "released" : "airborne",
      });
    }
  }

  applyTurboAcceleration(dt) {
    const player = this.player;
    if (!player.turboActive || !["riding", "lip", "landing", "wobble"].includes(player.state)) return;
    player.speed = Math.min(
      player.speed
        + finiteTuning(this.tuning.turboAcceleration, TUNING.turboAcceleration) * dt,
      this.currentRideSpeedCap(),
    );
  }

  refillTurboFromLanding(result, quality) {
    const refill = turboRefillForLanding(result, quality, this.tuning);
    if (refill <= 0) return 0;
    const previous = this.player.turbo;
    this.player.turbo = clamp(previous + refill, 0, 1);
    const applied = this.player.turbo - previous;
    if (applied > 0) {
      this.emit("turboRefill", {
        amount: applied,
        level: this.player.turbo,
        quality,
        tricks: result.entries.length,
        rotationDegrees: result.rotationDegrees,
      });
    }
    return applied;
  }

  handleWorldInteraction(signal) {
    const payload = {
      id: signal.id,
      kind: signal.kind,
      phase: signal.phase,
      reason: signal.reason,
      value: signal.value,
      x: signal.x,
      y: signal.y,
    };
    switch (signal.type) {
      case "dolphinMounted":
      case "whaleMounted":
        this.mountAnimal(signal.kind);
        this.emit(signal.type, payload);
        return;
      case "animalDismount":
        this.launchAnimalDismount(signal.kind || signal.reason);
        this.emit(signal.type, payload);
        return;
      case "sharkCollision": {
        const modifiers = this.world.getModifiers();
        if (modifiers.protectsFlow) {
          this.world.consumePowerup("starFoam", "sharkSave");
          this.score.addFlow(0.06);
          this.emit("starFoamSave", { ...payload, reason: "shark" });
          this.emit("callout", { text: "STAR FOAM SAVE", subtext: "SHARK DEFLECTED", tone: "perfect" });
        } else {
          this.triggerWipeout("SHARK SPLASH!", "shark");
        }
        this.emit(signal.type, payload);
        return;
      }
      case "sharkThread":
        this.highlights.nearMisses += 1;
        this.score.registerManeuver({ points: 240, multiplier: this.currentMultiplier(), combo: 0.16 });
        this.emit(signal.type, payload);
        return;
      case "featherThread":
        this.highlights.nearMisses += 1;
        this.score.registerManeuver({ points: 180, multiplier: this.currentMultiplier(), combo: 0.12 });
        this.emit(signal.type, payload);
        this.emit("callout", { text: "FEATHER THREAD", subtext: "FLOCK DODGED CLEAN", tone: "perfect" });
        return;
      case "speedboatRaceWon":
        this.score.registerManeuver({
          points: 260 + Math.min(140, Math.max(0, signal.value ?? 0)),
          multiplier: this.currentMultiplier(),
          combo: 0.14,
        });
        this.emit(signal.type, payload);
        this.emit("callout", { text: "WAKE RACE WON", subtext: "NO BRAKES KAKI", tone: "perfect" });
        return;
      case "foamGateCleared":
        this.score.registerManeuver({ points: 85, multiplier: this.currentMultiplier(), combo: 0.05 });
        this.emit(signal.type, payload);
        return;
      case "foamGateSeriesCompleted":
        this.score.registerManeuver({ points: 240, multiplier: this.currentMultiplier(), combo: 0.12 });
        this.emit(signal.type, payload);
        this.emit("callout", {
          text: signal.reason === "airshow" ? "AIRSHOW GATES" : "DOLPHIN GATES",
          subtext: "SERIES CLEARED",
          tone: "perfect",
        });
        return;
      case "powerupCollected": {
        this.highlights.powerups += 1;
        if (signal.kind === "mangoRush") {
          this.player.speed = clamp(
            this.player.speed + Math.max(0, signal.value),
            34,
            this.currentRideSpeedCap(),
          );
        }
        this.score.registerManeuver({ points: 110, multiplier: this.currentMultiplier(), combo: 0.08 });
        this.emit(signal.type, payload);
        this.emit("callout", {
          text: POWERUP_NAMES[signal.kind] ?? "BONUS CAUGHT",
          subtext: signal.kind === "moonPop" ? "NEXT LAUNCH BOOSTED" : signal.kind === "starFoam" ? "FLOW SAVE READY" : "UPHILL LOSS REDUCED",
          tone: "perfect",
        });
        return;
      }
      case "fleetAirshowCompleted":
        if (signal.value > 0) {
          this.score.registerManeuver({ points: 520, multiplier: this.currentMultiplier(), combo: 0.22 });
        }
        this.emit(signal.type, payload);
        return;
      default:
        this.emit(signal.type, payload);
    }
  }

  handleWorldEvent(signal) {
    const payload = {
      id: signal.id,
      kind: signal.kind,
      layer: signal.layer,
      phase: signal.phase,
      message: signal.message,
      reason: signal.reason,
      value: signal.value,
      x: signal.x,
      y: signal.y,
    };
    this.emit(signal.type, payload);
    if (signal.type === "powerupExpired") {
      this.emit("callout", { text: `${POWERUP_NAMES[signal.kind] ?? "BONUS"} ENDED`, tone: "hint" });
    } else if (signal.type === "courierPhase" && signal.phase === "carry") {
      this.emit("callout", { text: "COURIER INBOUND", subtext: POWERUP_NAMES[signal.message] ?? "CATCH THE GLOW", tone: "hint" });
    } else if (signal.type === "aircraftDropPhase" && signal.phase === "approach") {
      this.emit("callout", { text: "SKY DROP", subtext: POWERUP_NAMES[signal.message] ?? "BONUS INBOUND", tone: "hint" });
    } else if (signal.type === "racePhase" && signal.phase === "racing") {
      this.emit("callout", { text: "RACE THE WAKE", subtext: "LOSING COSTS NOTHING", tone: "risk" });
    } else if (signal.type === "racePhase" && signal.phase === "lost") {
      this.emit("callout", { text: "PHOTO FINISH", subtext: "KEEP SURFING", tone: "hint" });
    } else if (signal.type === "foamGateSeriesPhase" && signal.phase === "available") {
      this.emit("callout", { text: "FOAM GATES", subtext: "THREAD THE SET", tone: "perfect" });
    }
  }

  mountAnimal(kind) {
    const player = this.player;
    if (player.tubeRide.active) this.endTubeRide("animal");
    if (player.state === "airborne") {
      player.x = player.airX;
      player.face = player.landingFace;
      player.provisionalScore = 0;
      player.provisionalTrickName = "";
      this.score.provisionalAerial = null;
      this.score.pendingLaunchPotential = 0;
      this.aerialSession = null;
      this.setState("riding");
    }
    player.animalMount = kind;
    player.animalMountTime = 0;
    player.animalSpecialReady = true;
    this.highlights.animalBonuses += 1;
    player.compression = 0.4;
    player.speed = Math.max(player.speed, kind === "whale" ? 118 : 104);
    this.score.registerManeuver({
      points: kind === "whale" ? 420 : 240,
      multiplier: this.currentMultiplier(),
      combo: kind === "whale" ? 0.2 : 0.14,
    });
  }

  launchAnimalDismount(kind) {
    const player = this.player;
    const mountKind = kind === "whale" ? "whale" : "dolphin";
    player.animalMount = "";
    player.animalSpecialReady = false;
    if (player.state === "wipeout" || player.state === "complete") return;

    if (player.state !== "airborne") {
      player.face = Math.min(player.face, 0.03);
      player.faceVelocity = Math.min(player.faceVelocity, -0.72);
      player.slopeDrive = Math.min(player.slopeDrive, -0.72);
      player.speed = Math.max(player.speed, mountKind === "whale" ? 126 : 112);
      player.charge = 1;
      this.launch(EMPTY_INPUT);
    }
    const dismountVelocity = mountKind === "whale" ? -226 : -186;
    player.airVY = Math.min(player.airVY, dismountVelocity);
    player.maxAirHeight = Math.max(player.maxAirHeight, mountKind === "whale" ? 28 : 18);
    if (this.aerialSession?.manifest?.launchData) {
      this.aerialSession.manifest.launchData.animalAssist = mountKind;
      this.aerialSession.manifest.launchData.launchStrength = Math.max(
        this.aerialSession.manifest.launchData.launchStrength ?? 0,
        mountKind === "whale" ? 1.6 : 1.38,
      );
    }
    this.score.registerManeuver({
      points: mountKind === "whale" ? 520 : 300,
      multiplier: this.currentMultiplier(),
      combo: mountKind === "whale" ? 0.22 : 0.16,
    });
    this.lastGiantTrickAt = this.elapsed;
  }

  updateEntry(dt, input) {
    const player = this.player;
    const t = smoothstep(0, 0.72, player.stateTime);
    player.x = 324 - t * 112;
    player.face = this.wave.profileId === "heroBarrel"
      ? this.wave.powerFaceAt(player.x)
      : 0.44 + Math.sin(t * Math.PI) * 0.05;
    player.boardAngle = this.wave.slopeAt(player.x, player.face);
    player.bodyAngle = player.boardAngle;
    player.speed = damp(player.speed, this.tuning.speed, 3, dt);
    if (player.stateTime >= 0.72 || input.edgePressed || Math.abs(input.x) + Math.abs(input.y) > 0.45) {
      this.setState("riding");
      this.emit("callout", { text: "FIND THE FAST LINE", tone: "hint" });
    }
  }

  captureSimpleControls(dt, input) {
    const state = this.player.contextTrick;
    if (this.controlMode !== "simple") {
      resetContextTrick(state);
      return;
    }
    if (input.trickPressed) {
      state.requestId += 1;
      state.pending = true;
      state.buffer = finiteTuning(this.tuning.simpleTrickBuffer, TUNING.simpleTrickBuffer);
      state.held = 0;
      state.holding = true;
      state.released = false;
      state.vertical = input.y;
    }
    if (input.trick) {
      state.holding = true;
      state.held += dt;
      state.vertical = input.y;
    }
    if (input.trickReleased) {
      state.holding = false;
      state.released = true;
    }
    if (state.pending && !state.holding) state.buffer = Math.max(0, state.buffer - dt);
    if (state.pending && state.buffer <= 0 && this.player.state !== "airborne") {
      state.pending = false;
      state.released = false;
    }
  }

  updateSimpleAerialTrick(dt, input, context) {
    const state = this.player.contextTrick;
    const directEvents = [];
    const mapped = {
      x: input.x,
      y: input.y,
      trick1: false,
      trick1Pressed: false,
      trick1Released: false,
      trick2: false,
      trick2Pressed: false,
      trick2Released: false,
      trick3: false,
      trick3Pressed: false,
      trick3Released: false,
      trick4: false,
      trick4Pressed: false,
      trick4Released: false,
    };

    if (state.pending && state.requestId !== state.consumedId) {
      const wantsHold = state.holding
        && state.held >= finiteTuning(this.tuning.simpleGrabHold, TUNING.simpleGrabHold);
      const wantsTap = state.released;
      let requestedId = "";
      if (wantsHold) {
        requestedId = state.vertical > 0.32 ? "tailGrab" : "frontRailGrab";
      } else if (wantsTap) {
        requestedId = simpleTapTrickFor(this.aerialSession.manifest);
      }

      if (requestedId) {
        let event = this.aerialSession.tryStart(requestedId, context);
        const shouldFallback = wantsTap
          && event?.type === "trickRejected"
          && (state.buffer <= 0 || context.descending);
        if (shouldFallback) {
          const fallbackId = simpleFallbackGrabFor(this.aerialSession.manifest);
          if (fallbackId) {
            const rejectedId = requestedId;
            event = this.aerialSession.tryStart(fallbackId, context);
            if (event?.type === "trickStarted") {
              requestedId = fallbackId;
              state.syntheticHold = Math.max(
                state.syntheticHold,
                0.16,
              );
              const entry = this.aerialSession.manifest.sequence.at(-1);
              if (entry) entry.fallbackFrom = rejectedId;
            }
          }
        }

        if (event?.type === "trickStarted") {
          state.consumedId = state.requestId;
          state.pending = false;
          state.released = false;
          state.activeAction = actionForSimpleTrick(requestedId);
          if (wantsHold && (requestedId === "frontRailGrab" || requestedId === "tailGrab")) {
            const entry = this.aerialSession.manifest.sequence.at(-1);
            const recognizedHold = Math.max(0, state.held - dt);
            if (entry) {
              entry.startTime = Math.max(0, this.aerialSession.elapsed - recognizedHold);
              entry.heldDuration = recognizedHold;
              this.aerialSession.manifest.heldDurations[requestedId] = recognizedHold;
            }
          }
          if (wantsTap && (requestedId === "frontRailGrab" || requestedId === "tailGrab")) {
            state.syntheticHold = Math.max(state.syntheticHold, 0.16);
          }
          this.aerialSession.inputLocks[state.activeAction] = true;
          directEvents.push(event);
        } else if (event && !shouldFallback && state.buffer <= 0) {
          state.consumedId = state.requestId;
          state.pending = false;
          state.released = false;
          directEvents.push({ ...event, hint: "FLOAT IT" });
        }
      }
    }

    if (state.activeAction) {
      const held = state.holding || state.syntheticHold > 0;
      mapped[state.activeAction] = held;
      if (state.syntheticHold > 0) state.syntheticHold = Math.max(0, state.syntheticHold - dt);
      if (!held) mapped[`${state.activeAction}Released`] = true;
    }

    const events = this.aerialSession.update(dt, mapped, context);
    if (state.activeAction
      && !this.aerialSession.active.some((entry) => entry.action === state.activeAction)) {
      state.activeAction = "";
      state.holding = false;
      state.syntheticHold = 0;
    }
    return directEvents.concat(events);
  }

  updateRiding(dt, input) {
    const player = this.player;
    const earlyEase = smoothstep(0, this.tuning.entryGrace, this.elapsed);
    const earlyGrip = 1.22 - earlyEase * 0.22;
    const steeringAssist = this.assists.steering ? 1.2 : 1;
    const carveAccel = this.tuning.carveAcceleration * this.board.grip * earlyGrip * steeringAssist;
    const preliminaryPotential = this.querySpeedPotential(input);
    const steeringScale = this.controlMode === "advanced"
      ? this.updateRidingManeuvers(dt, input, preliminaryPotential)
      : this.updateSimpleRidingManeuver(dt, input, preliminaryPotential);
    const inputY = (Math.abs(input.y) < 0.02 ? 0 : input.y) * steeringScale;
    const inputX = (Math.abs(input.x) < 0.02 ? 0 : input.x) * steeringScale;

    player.faceVelocity += inputY * carveAccel * dt;
    player.faceVelocity -= player.faceVelocity * this.tuning.carveFriction * dt;
    player.face += player.faceVelocity * dt;

    if (player.face > 1) {
      const impact = player.faceVelocity;
      player.face = 1;
      player.faceVelocity *= -this.tuning.faceEdgeBounce;
      if (impact > 0.94 && this.elapsed > 4) {
        this.triggerWipeout("TOO DEEP!", "trough");
        return;
      }
    }
    player.face = Math.max(-0.06, player.face);

    this.updateTravelMotion(dt, inputX);

    const speedPotential = this.querySpeedPotential(input);
    const previousZone = player.speedPotential.zone;
    copySpeedPotential(player.speedPotential, speedPotential);
    if (previousZone !== speedPotential.zone) {
      if (speedPotential.zone === "power") {
        this.emit("powerLineEnter", { potential: speedPotential.potential });
      } else if (previousZone === "power") {
        this.emit("powerLineLeave", { zone: speedPotential.zone });
      }
    }
    const motion = this.syncCanonicalMotion();
    player.slopeDrive = motion.downhill - motion.uphill;

    const previousWaveMomentum = Number.isFinite(player.waveMomentum)
      ? clamp(player.waveMomentum, 0, 1)
      : 0;
    const naturalMomentum = clamp(
      Math.max(0, player.slopeDrive) * 0.62
        + speedPotential.lineQuality * 0.2
        + speedPotential.pocket * 0.18,
      0,
      1,
    );
    const momentumResponse = naturalMomentum > previousWaveMomentum
      ? finiteTuning(this.tuning.waveMomentumBuild, TUNING.waveMomentumBuild)
      : finiteTuning(this.tuning.waveMomentumDecay, TUNING.waveMomentumDecay);
    player.waveMomentum = damp(
      previousWaveMomentum,
      naturalMomentum,
      momentumResponse,
      dt,
    );

    if (input.edge) {
      const previousCharge = player.charge;
      player.charge = clamp(player.charge + this.tuning.pumpChargeRate * dt, 0, 1);
      this.emitPumpChargeCue(previousCharge, player.charge);
      player.compression = damp(player.compression, 1, 14, dt);
    } else {
      player.compression = damp(player.compression, 0, 10, dt);
    }

    const pumpRelease = input.edgeReleased && player.face > 0.12 && player.state !== "lip";
    const pumpReady = pumpRelease
      && player.charge >= TUNING.pumpMinCharge
      && speedPotential.pumpEfficiency >= TUNING.pumpMinEfficiency
      && inputY <= -TUNING.pumpUpwardIntent
      && player.faceVelocity <= TUNING.pumpReleaseFaceVelocity
      && this.elapsed - player.lastPumpAt >= TUNING.pumpCooldown;
    if (pumpReady) {
      const releasedCharge = player.charge;
      const rhythm = 0.58 + Math.min(0.42, Math.abs(player.faceVelocity) * 0.32);
      const lineTiming = 0.55 + speedPotential.pumpEfficiency * 0.45;
      const boost = this.tuning.pumpStrength * this.board.pump * releasedCharge * rhythm * lineTiming;
      player.waveMomentum = clamp(
        player.waveMomentum
          + finiteTuning(this.tuning.waveMomentumPumpGain, TUNING.waveMomentumPumpGain)
            * releasedCharge
            * speedPotential.pumpEfficiency,
        0,
        1,
      );
      player.speed = Math.min(player.speed + boost, this.currentRideSpeedCap());
      this.score.addFlow(
        TUNING.pumpFlowGain
          * releasedCharge
          * (0.7 + speedPotential.pumpEfficiency * 0.3),
      );
      player.skillMomentum = clamp(
        player.skillMomentum + TUNING.pumpSkillGain,
        0,
        1,
      );
      player.lastPumpAt = this.elapsed;
      this.emit("pump", {
        strength: releasedCharge,
        efficiency: speedPotential.pumpEfficiency,
        rhythm,
        zone: speedPotential.zone,
      });
      player.charge = 0;
    } else if (pumpRelease) {
      // Every off-lip release consumes the stored crouch. Rapid tapping cannot
      // accumulate charge until a later valid release.
      player.charge = 0;
    } else if (!input.edge && !input.edgeReleased) {
      player.charge = Math.max(0, player.charge - dt * 0.55);
    }

    const pocketRisk = Number.isFinite(speedPotential.risk)
      ? speedPotential.risk
      : this.wave.pocketRisk(player.x);
    const worldModifiers = this.world.getModifiers();
    // Speed is carried energy. Gravity does the meaningful work; a quiet
    // traverse loses only a little, while climbing and reversals spend what
    // the previous drop earned. There is no invisible attraction to a target.
    const traverseRatio = 1 - Math.abs(player.slopeDrive);
    const passiveDrag = finiteTuning(this.tuning.rideEnergyDrag, TUNING.rideEnergyDrag)
      * (player.maneuver.id === "floater" ? 0.45 : 1)
      * (0.78 + traverseRatio * 0.22);
    player.speed += (
      finiteTuning(this.tuning.downhillAcceleration, TUNING.downhillAcceleration)
        * Math.max(0, player.slopeDrive)
      - finiteTuning(this.tuning.uphillSpeedCost, TUNING.uphillSpeedCost)
        * Math.max(0, -player.slopeDrive)
        * worldModifiers.uphillLossScale
      - passiveDrag
    ) * this.board.acceleration * dt;
    player.speed += this.tuning.wavePush
      * speedPotential.acceleration
      * 0.08
      * this.board.acceleration
      * dt;
    if (player.landingCarryTimer > 0) {
      player.landingCarryTimer = Math.max(0, player.landingCarryTimer - dt);
      const carryRatio = player.landingCarryDuration > 0
        ? player.landingCarryTimer / player.landingCarryDuration
        : 0;
      player.speed = Math.max(player.speed, player.landingCarrySpeed * (0.9 + carryRatio * 0.1));
    }
    player.speed = clamp(player.speed, 34, this.currentRideSpeedCap());

    player.lateralVelocity = player.travelVelocity;
    player.x += player.travelVelocity * dt;
    this.constrainRidingX();
    player.redirectVelocity = damp(player.redirectVelocity, 0, 4.2, dt);

    if (previousWaveMomentum < 0.9 && player.waveMomentum >= 0.9) {
      this.emit("fullPower", {
        momentum: player.waveMomentum,
        speed: player.speed,
      });
    }

    const finalMotion = this.syncCanonicalMotion();
    const carveLean = inputY * 0.09 + player.faceVelocity * 0.05;
    const surfaceAngle = this.wave.slopeAt(player.x, player.face);
    player.boardAngle = finalMotion.spriteAngle;
    player.bodyAngle = damp(player.bodyAngle, finalMotion.spriteAngle - carveLean * 0.25, 11, dt);
    updateLandingPreview(player, surfaceAngle, this.landingBands(), false);

    const multiplier = this.currentMultiplier();
    this.score.updateRide(
      dt,
      player.speed,
      pocketRisk,
      clamp(
        smoothstep(0.08, 0.58, Math.abs(player.faceVelocity))
            * smoothstep(0.06, 0.5, Math.abs(inputY))
            * 0.66
          + smoothstep(0.08, 0.7, Math.max(0, player.slopeDrive))
            * smoothstep(0.08, 0.55, Math.max(0, inputY))
            * 0.34,
        0,
        1,
      ),
      multiplier,
      this.scoreScales(),
    );
    this.updateCarveArc(dt, inputY, multiplier);

    if (player.face < 0.13 && player.faceVelocity < -0.12) {
      player.lipMemory = this.tuning.launchCoyote;
      if (player.state !== "lip") {
        this.setState("lip");
        this.emit("lip", { charge: player.charge });
      }
    } else {
      player.lipMemory = Math.max(0, player.lipMemory - dt);
      if (player.state === "lip" && player.face > 0.17) this.setState("riding");
    }

    const launchCommitted = player.face <= 0.025 || (player.state === "lip" && input.edgeReleased && player.lipMemory > 0);
    if (launchCommitted && player.faceVelocity < -0.08) {
      this.launch(input);
      return;
    }

    this.updateCurlDanger(dt, pocketRisk);
  }

  updateCarveArc(dt, inputY, multiplier) {
    const player = this.player;
    const velocity = player.faceVelocity;
    const sign = Math.abs(velocity) >= SCORE.carveMinVelocity ? Math.sign(velocity) : 0;

    if (!player.carveArcSign) {
      if (sign) beginCarveArc(player, sign);
      return;
    }

    if (sign === player.carveArcSign) {
      player.carveArcDuration += dt;
      player.carveArcExcursion = Math.max(
        player.carveArcExcursion,
        Math.abs(player.face - player.carveArcStartFace),
      );
      player.carveArcPeakVelocity = Math.max(player.carveArcPeakVelocity, Math.abs(velocity));
      player.carveArcIdle = 0;
      return;
    }

    if (!sign) {
      if (Math.abs(inputY) < 0.08) player.carveArcIdle += dt;
      else player.carveArcIdle = 0;
      if (player.carveArcIdle >= TUNING.carveArcPauseReset) resetCarveArcState(player);
      return;
    }

    const completedSign = player.carveArcSign;
    const qualified = player.carveArcDuration >= TUNING.carveArcMinDuration
      && player.carveArcExcursion >= TUNING.carveArcMinExcursion
      && player.carveArcPeakVelocity >= TUNING.carveArcMinPeakVelocity;
    beginCarveArc(player, sign);
    if (!qualified) return;

    const carveCallout = this.score.registerCarve(completedSign, multiplier);
    if (!carveCallout) return;
    player.skillMomentum = clamp(
      player.skillMomentum + TUNING.carveSkillGain,
      0,
      1,
    );
    this.emit("callout", { text: carveCallout, tone: "flow" });
  }

  launch(input) {
    const player = this.player;
    const mountAtLaunch = player.animalMount;
    const worldModifiers = this.world.getModifiers();
    const sourceManeuver = player.maneuver.id;
    if (player.tubeRide.active) this.endTubeRide("launch");
    const baseSpeed = this.tuning.speed * this.board.acceleration;
    const hardMaxSpeed = Math.max(baseSpeed, this.tuning.maxSpeed * this.board.maxSpeed);
    const speedRange = Math.max(1, hardMaxSpeed - 34);
    const speedRatio = clamp((player.speed - 34) / speedRange, 0, 1);
    const launchMomentum = clamp(
      Number.isFinite(player.waveMomentum) ? player.waveMomentum : 0,
      0,
      1,
    );
    const uphillApproach = clamp(
      Math.max(-player.slopeDrive, Math.max(0, -player.faceVelocity) * 0.72),
      0,
      1,
    );
    const pocketLaunch = clamp(player.speedPotential?.pocket ?? this.wave.pocketRisk(player.x), 0, 1);
    const launchCharge = clamp(Number(player.charge) || 0, 0, 1);
    const turboAtLaunch = Boolean(player.turboActive);
    const turboOverdriveAtLaunch = clamp(Number(player.turboOverdrive) || 0, 0, 1);
    const launchEnergy = clamp(
      0.68
        + speedRatio * 0.42
        + uphillApproach * 0.18
        + player.charge * 0.1
        + pocketLaunch * 0.04,
      0.68,
      1.36,
    );
    const aerialProfile = qualifyAerialLaunch({
      launchStrength: launchEnergy,
      speedRatio,
      uphillApproach,
      charge: launchCharge,
      pocketRisk: pocketLaunch,
      turboActive: turboAtLaunch,
      turboOverdrive: turboOverdriveAtLaunch,
      launchScale: worldModifiers.launchScale,
    });
    const launchMultiplier = this.currentMultiplier() * (this.tuning.scoreAir / 1.25);
    const launchRisk = this.wave.pocketRisk(player.x);
    player.airX = player.x;
    player.airY = this.wave.crestY(player.x) - 1;
    player.previousAirX = player.airX;
    player.previousAirY = player.airY;
    player.airVX = player.travelDirection * (player.speed - 52) * 0.14
      + player.travelVelocity * 0.28
      + input.x * 3;
    player.airVY = -this.tuning.launchForce
      * this.board.launch
      * launchEnergy
      * worldModifiers.launchScale
      * aerialProfile.turboLiftMultiplier;
    player.launchY = player.airY;
    player.maxAirHeight = 0;
    player.aerialAltitude = 0;
    player.previousAerialAltitude = 0;
    player.aerialAltitudeCeiling = aerialProfile.ceiling;
    player.aerialExpectedHeight = Math.max(
      aerialProfile.expectedHeight,
      player.airVY * player.airVY / Math.max(1, this.tuning.gravity * 2),
    );
    player.aerialZone = "coastalSky";
    player.aerialLaunchQuality = aerialProfile.lineQuality;
    player.aerialTurboLaunch = aerialProfile.turbo;
    player.aerialSpaceQualified = aerialProfile.spaceQualified;
    player.aerialMilestoneTier = 0;
    player.aerialReentryFired = false;
    player.rotationAccum = 0;
    player.angularVelocity = input.x * 1.6;
    player.takeoffDirection = player.travelDirection;
    player.landingDirection = player.travelDirection;
    player.bodyAngle = player.boardAngle;
    player.landingFace = clamp(0.12 + Math.max(0, player.face) * 0.25, 0.1, 0.24);
    player.grabbed = false;
    player.landingQuality = "";
    player.trickPose = "neutral";
    player.boardRelativeAngle = 0;
    player.maneuver.id = "";
    player.maneuver.progress = 0;
    player.contactTimer = -1;
    player.charge = 0;
    resetCarveArcState(player);
    this.setState("airborne");
    if (worldModifiers.launchScale > 1) this.world.consumePowerup("moonPop", "launch");
    if (mountAtLaunch) this.world.releaseMountedAnimal(mountAtLaunch, "launch");
    const potential = Math.max(0, -player.airVY - 70);
    this.aerialSession = new AerialTrickSession({
      boardId: this.board.id,
      launchData: {
        potential,
        launchStrength: launchEnergy,
        launchSpeed: player.speed,
        speedRatio,
        waveMomentum: launchMomentum,
        seamDrive: player.speedPotential.seamDrive,
        slopeDrive: player.slopeDrive,
        uphillApproach,
        launchVelocity: player.airVY,
        launchScale: worldModifiers.launchScale,
        aerialCeiling: aerialProfile.ceiling,
        aerialZone: aerialProfile.zone,
        aerialLineQuality: aerialProfile.lineQuality,
        turboLaunch: aerialProfile.turbo,
        spaceQualified: aerialProfile.spaceQualified,
        pocketRisk: launchRisk,
        multiplier: launchMultiplier,
        boardStyle: this.board.style,
        sourceManeuver,
        takeoffDirection: player.travelDirection,
        switchTakeoff: player.switchStance,
      },
    });
    this.aerialSession.primeInput(input);
    player.trickManifest = this.aerialSession.manifest;
    const preview = this.score.beginAerial(player.trickManifest, {
      boardStyle: this.board.style,
      multiplier: launchMultiplier,
    });
    this.applyAerialPreview(preview);
    this.emit("launch", {
      strength: launchEnergy,
      momentum: launchMomentum,
      speedRatio,
      slopeDrive: player.slopeDrive,
      takeoffDirection: player.travelDirection,
      switch: player.switchStance,
      pocketRisk: launchRisk,
      provisionalScore: player.provisionalScore,
      aerialZone: aerialProfile.zone,
      aerialCeiling: aerialProfile.ceiling,
      spaceQualified: aerialProfile.spaceQualified,
    });
  }

  updateAirborne(dt, input) {
    const player = this.player;
    if (!this.aerialSession) {
      this.aerialSession = new AerialTrickSession({ boardId: this.board.id });
      player.trickManifest = this.aerialSession.manifest;
    }
    let airControl = this.tuning.airControl * this.board.airControl;
    const apex = Math.abs(player.airVY) < 14;
    const gravityScale = apex ? 0.42 : 1;

    if (this.controlMode === "simple") {
      if (input.spinLeftPressed) player.angularVelocity -= finiteTuning(
        this.tuning.simpleSpinImpulse,
        TUNING.simpleSpinImpulse,
      );
      if (input.spinRightPressed) player.angularVelocity += finiteTuning(
        this.tuning.simpleSpinImpulse,
        TUNING.simpleSpinImpulse,
      );
    }
    player.angularVelocity += input.x * this.tuning.rotationAcceleration * this.board.rotation * dt;
    player.angularVelocity -= player.angularVelocity * this.tuning.angularDrag * dt;
    player.bodyAngle += player.angularVelocity * dt;
    player.rotationAccum += player.angularVelocity * dt;

    const trickContext = {
      angularVelocity: player.angularVelocity,
      horizontalInput: input.x,
      rotationDirection: Math.sign(player.angularVelocity || input.x) || 1,
      rotationAccumulated: player.rotationAccum,
      maxHeight: player.maxAirHeight,
      apex,
      descending: player.airVY > 12,
    };
    const trickEvents = this.controlMode === "simple"
      ? this.updateSimpleAerialTrick(dt, input, trickContext)
      : this.aerialSession.update(dt, input, trickContext);
    for (const event of trickEvents) {
      this.emit(event.type, {
        id: event.id,
        hint: event.hint,
        context: "air",
      });
      if (event.type === "trickRejected" && event.hint) {
        this.emit("callout", { text: event.hint, tone: "hint" });
      }
    }

    const manifest = this.aerialSession.manifest;
    airControl *= 1 - manifest.risk * 0.16;
    const trim = input.y * 0.5 * airControl * this.aerialSession.trimSensitivity();
    player.boardRelativeAngle = manifest.boardRelativeRotation;
    const boardTarget = player.bodyAngle + trim + player.boardRelativeAngle;
    player.boardAngle = damp(player.boardAngle, boardTarget, 8.5 * airControl, dt);
    player.trickPose = manifest.trickPose;
    player.grabbed = manifest.sequence.some((entry) => entry.category === "grab" && entry.complete);

    if (this.assists.landing && player.airVY > 20) {
      const targetSlope = this.wave.slopeAt(player.airX, player.landingFace);
      player.boardAngle += shortestAngle(player.boardAngle, targetSlope) * dt * 1.05;
    }
    if (this.controlMode === "simple"
      && player.airVY > finiteTuning(this.tuning.simpleAutoLevelStart, TUNING.simpleAutoLevelStart)) {
      const targetSlope = this.wave.slopeAt(player.airX, player.landingFace);
      const alignment = nearestLandingAlignment(
        player.boardAngle,
        targetSlope,
        player.takeoffDirection,
      );
      player.boardAngle += shortestAngle(player.boardAngle, alignment.targetAngle)
        * dt
        * finiteTuning(this.board.simpleAutoLevel, 0.8);
    }

    player.airVY += this.tuning.gravity * gravityScale * dt;
    player.airVX += input.x * 3.2 * airControl * dt;
    player.airVX *= 1 - dt * 0.09;
    player.airX += player.airVX * dt;
    player.airY += player.airVY * dt;
    this.advanceForwardCamera("airX");
    const [airMinX, airMaxX] = this.wave.profile.bounds.airX;
    player.airX = clamp(player.airX, airMinX, airMaxX);
    player.landingFace = clamp(
      player.landingFace + dt * (0.032 + Math.abs(player.airVX) * 0.002),
      0.1,
      0.38,
    );
    const surfaceY = this.wave.ridingY(player.airX, player.landingFace);
    player.previousAerialAltitude = player.aerialAltitude;
    player.aerialAltitude = aerialAltitudeForFlight({
      state: player.state,
      flightHeight: player.launchY - player.airY,
      surfaceClearance: surfaceY - player.airY,
      verticalVelocity: player.airVY,
      ceiling: player.aerialAltitudeCeiling,
      expectedHeight: player.aerialExpectedHeight,
    });
    player.aerialZone = aerialZoneForAltitude(player.aerialAltitude).id;
    const milestone = aerialMilestoneForAltitude(player.aerialAltitude);
    if (milestone && milestone.index > player.aerialMilestoneTier) {
      player.aerialMilestoneTier = milestone.index;
      this.emit("aerialMilestone", {
        index: milestone.index,
        altitude: player.aerialAltitude,
        zone: player.aerialZone,
        text: milestone.text,
      });
      this.emit("callout", {
        text: milestone.text,
        subtext: aerialZoneForAltitude(player.aerialAltitude).label,
        tone: "perfect",
        channel: "aerial",
      });
    }
    if (!player.aerialReentryFired
      && player.airVY > 18
      && player.previousAerialAltitude >= 0.62
      && player.aerialAltitude < 0.62) {
      player.aerialReentryFired = true;
      this.emit("aerialReentry", {
        altitude: player.aerialAltitude,
        speed: player.airVY,
      });
    }
    player.maxAirHeight = Math.max(player.maxAirHeight, player.launchY - player.airY);
    manifest.maxHeight = Math.max(manifest.maxHeight, player.maxAirHeight);
    manifest.rotationAccumulated = player.rotationAccum;

    const targetSlope = this.wave.slopeAt(player.airX, player.landingFace);
    const landingAlignment = nearestLandingAlignment(
      player.boardAngle,
      targetSlope,
      player.takeoffDirection,
    );
    player.landingDirection = landingAlignment.direction;
    updateLandingPreview(
      player,
      landingAlignment.targetAngle,
      this.landingBands(),
      true,
      landingAlignment.direction,
    );
    const preview = this.score.previewAerial(manifest, {
      boardStyle: this.board.style,
      multiplier: manifest.launchData.multiplier ?? 1,
    });
    this.applyAerialPreview(preview);

    if (apex && !player.apexFired) {
      player.apexFired = true;
      this.emit("apex", { height: player.maxAirHeight });
    }

    if (player.airVY > 0 && player.airY >= surfaceY - 1) {
      this.resolveLanding(dt, surfaceY);
      return;
    }

    const curlReachedAir = this.wave.time >= this.tuning.curlGrace
      && this.wave.curlContact(player.airX);
    if (player.airY > 224 || curlReachedAir) {
      this.triggerWipeout("FOAM SNACK!", "air");
    }
  }

  resolveLanding(dt, surfaceY) {
    const player = this.player;
    const surfaceAngle = this.wave.slopeAt(player.airX, player.landingFace);
    const alignment = nearestLandingAlignment(
      player.boardAngle,
      surfaceAngle,
      player.takeoffDirection,
    );
    const error = alignment.error;
    const assistScale = this.assists.landing ? 1.4 : 1;
    const trickRisk = this.aerialSession?.manifest.risk ?? 0;
    const riskScale = 1 - trickRisk * 0.18;
    const tolerance = this.tuning.landingTolerance * this.board.landing * assistScale * riskScale;
    const recoveryLimit = Math.min(this.tuning.wipeoutThreshold, tolerance * 1.7);
    updateLandingPreview(player, alignment.targetAngle, {
      perfect: this.tuning.perfectTolerance * assistScale,
      clean: tolerance,
      recovery: recoveryLimit,
    }, true, alignment.direction);

    if (error <= recoveryLimit) {
      let quality = "wobble";
      if (error <= this.tuning.perfectTolerance * assistScale) quality = "perfect";
      else if (error <= tolerance) quality = "clean";
      this.land(quality, error, surfaceAngle, alignment.direction);
      return;
    }

    if (player.contactTimer < 0) player.contactTimer = 0;
    player.contactTimer += dt;
    player.airY = surfaceY - 1;
    player.airVY = Math.min(player.airVY, 12);
    if (player.contactTimer > this.tuning.landingCoyote) {
      this.triggerWipeout(error > 2.25 ? "BOARD FIRST!" : "TOO GREEDY!", "landing");
    }
  }

  land(quality, error, surfaceAngle, landingDirection = this.player.takeoffDirection) {
    const player = this.player;
    if (quality === "wobble" && this.world.getModifiers().protectsFlow) {
      quality = "clean";
      this.world.consumePowerup("starFoam", "landingSave");
      this.emit("starFoamSave", { reason: "landing" });
      this.emit("callout", { text: "STAR FOAM SAVE", subtext: "FLOW PROTECTED", tone: "perfect" });
    }
    const turns = player.rotationAccum / TAU;
    const manifest = this.aerialSession
      ? this.aerialSession.finalizeLanding({
        rotationAccumulated: player.rotationAccum,
        quality,
        landingDirection,
        switchLanding: landingDirection !== player.takeoffDirection,
      })
      : null;
    const result = this.score.registerLanding({
      manifest,
      turns,
      maxHeight: player.maxAirHeight,
      grabbed: player.grabbed,
      quality,
      boardStyle: this.board.style,
      multiplier: manifest?.launchData.multiplier
        ?? this.currentMultiplier() * (this.tuning.scoreAir / 1.25),
    });
    this.refillTurboFromLanding(result, quality);
    const landingSkill = quality === "perfect" ? 1 : quality === "clean" ? 0.68 : 0.2;
    player.skillMomentum = clamp(
      player.skillMomentum + TUNING.landingSkillGain * landingSkill,
      0,
      1,
    );

    player.x = player.airX;
    player.face = player.landingFace;
    player.faceVelocity = quality === "wobble" ? 0.16 : 0.08;
    player.travelDirection = Math.sign(landingDirection) || player.travelDirection;
    const landingTravelSpeed = clamp(
      Number.isFinite(player.airVX) ? Math.abs(player.airVX) * 0.55 : 0,
      0,
      48,
    );
    player.travelVelocity = player.travelDirection * landingTravelSpeed;
    player.lateralVelocity = player.travelVelocity;
    player.landingDirection = player.travelDirection;
    player.switchStance = player.travelDirection !== player.runStartDirection;
    const preservation = quality === "perfect" ? 1.035 : quality === "clean" ? 0.94 : 0.74;
    player.speed = clamp(player.speed * preservation, 38, this.currentRideSpeedCap());
    player.landingCarryDuration = quality === "perfect"
      ? finiteTuning(this.tuning.perfectLandingCarry, TUNING.perfectLandingCarry)
      : quality === "clean"
        ? finiteTuning(this.tuning.cleanLandingCarry, TUNING.cleanLandingCarry)
        : finiteTuning(this.tuning.wobbleLandingCarry, TUNING.wobbleLandingCarry);
    player.landingCarryTimer = player.landingCarryDuration;
    player.landingCarrySpeed = player.speed;
    player.boardAngle = surfaceAngle;
    player.bodyAngle = surfaceAngle;
    player.compression = quality === "perfect" ? 1 : 0.78;
    player.wobble = quality === "wobble" ? clamp(error, 0.4, 1.2) : 0;
    player.contactTimer = -1;
    player.provisionalScore = 0;
    player.provisionalTrickName = result.trick;
    player.landingQuality = quality;
    player.lastLandingQuality = quality;
    player.aerialAltitude = 0;
    player.previousAerialAltitude = 0;
    player.aerialZone = "coastalSky";
    resetCarveArcState(player);
    this.highlights.biggestAir = Math.max(this.highlights.biggestAir, player.maxAirHeight);
    this.highlights.bestTrick = result.trick || this.highlights.bestTrick;
    if (quality === "perfect") this.highlights.perfectLandings += 1;
    if (manifest?.switchLanding || manifest?.launchData?.switchTakeoff) this.highlights.switchBonuses += 1;
    if (manifest) {
      manifest.provisionalScore = 0;
      manifest.provisionalTrickName = result.trick;
      manifest.repetitionSignature = result.signature;
      manifest.rotationDegrees = result.rotationDegrees;
    }
    this.setState(quality === "wobble" ? "wobble" : "landing");
    this.emit("land", {
      quality,
      error,
      turns,
      grabbed: player.grabbed,
      trick: result.trick,
      signature: result.signature,
      banked: result.total,
      landingDirection,
      switch: Boolean(manifest?.switchLanding),
    });
    this.emit("callout", { text: result.callout, subtext: result.trick, tone: quality });
    if (player.maxAirHeight >= 68 && this.world.carrier?.phase === "airshow") {
      this.world.completeAirshow(true);
      this.lastGiantTrickAt = this.elapsed;
    }
  }

  updateRecovery(dt, input) {
    const player = this.player;
    const surfaceAngle = this.wave.slopeAt(player.x, player.face);
    const duration = player.state === "wobble" ? 0.48 / this.board.recovery : 0.24;
    const correction = input.y * 0.18 + input.x * 0.08;
    player.boardAngle = damp(player.boardAngle, surfaceAngle + correction, 10 * this.board.recovery, dt);
    player.bodyAngle = surfaceAngle + Math.sin(player.stateTime * 28) * player.wobble * (1 - player.stateTime / duration) * 0.18;
    updateLandingPreview(player, surfaceAngle, this.landingBands(), false);
    player.compression = damp(player.compression, 0, 8, dt);
    player.speed = clamp(
      player.speed - (player.state === "wobble" ? 8 : -2) * dt,
      36,
      this.currentRideSpeedCap(),
    );
    if (player.landingCarryTimer > 0) {
      player.landingCarryTimer = Math.max(0, player.landingCarryTimer - dt);
      player.speed = Math.max(player.speed, player.landingCarrySpeed * 0.94);
    }
    this.updateTravelMotion(dt, input.x);
    player.lateralVelocity = player.travelVelocity;
    player.x += player.travelVelocity * dt;
    this.constrainRidingX();
    const pocketRisk = this.wave.pocketRisk(player.x);
    this.score.updateRide(dt, player.speed, pocketRisk, 0.12, this.currentMultiplier(), this.scoreScales());
    this.updateCurlDanger(dt, pocketRisk);
    if (player.stateTime >= duration) {
      player.wobble = 0;
      player.trickPose = "neutral";
      player.boardRelativeAngle = 0;
      player.provisionalTrickName = "";
      player.provisionalScore = 0;
      player.trickManifest = null;
      this.aerialSession = null;
      player.landingQuality = "";
      this.setState("riding");
    }
  }

  updateTravelMotion(dt, inputX) {
    const player = this.player;
    const directionInput = Math.abs(inputX) >= 0.22 ? Math.sign(inputX) : 0;
    const intent = directionInput || player.travelDirection;
    player.directionIntent = intent;

    const speedRatio = clamp(
      (player.speed - 34) / Math.max(1, this.currentRideSpeedCap() - 34),
      0,
      1,
    );
    const glideMagnitude = finiteTuning(this.tuning.sideScrollGlideBase, TUNING.sideScrollGlideBase)
      + player.speed * finiteTuning(this.tuning.sideScrollGlideSpeed, TUNING.sideScrollGlideSpeed);
    const steeringMagnitude = Math.abs(inputX) * (
      finiteTuning(this.tuning.sideScrollSteerBase, TUNING.sideScrollSteerBase)
        + player.speed * finiteTuning(this.tuning.sideScrollSteerSpeed, TUNING.sideScrollSteerSpeed)
    );
    const target = intent * (glideMagnitude + steeringMagnitude) + player.redirectVelocity;
    const opposing = directionInput !== 0 && directionInput !== player.travelDirection;
    const baseResponse = Math.abs(inputX) > 0.02 || Math.abs(player.redirectVelocity) > 0.5
      ? finiteTuning(this.tuning.lateralResponse, TUNING.lateralResponse) * this.board.grip
      : finiteTuning(this.tuning.lateralCoast, TUNING.lateralCoast);
    const response = opposing ? baseResponse * (0.72 - speedRatio * 0.34) : baseResponse;
    const previousVelocity = Number.isFinite(player.travelVelocity)
      ? player.travelVelocity
      : Number(player.lateralVelocity) || player.travelDirection * glideMagnitude;
    const maxSideScrollSpeed = finiteTuning(
      this.tuning.sideScrollMaxSpeed,
      TUNING.sideScrollMaxSpeed,
    );
    player.travelVelocity = clamp(
      damp(previousVelocity, target, response, dt),
      -maxSideScrollSpeed,
      maxSideScrollSpeed,
    );
    player.turnForce = clamp(
      Math.abs(player.travelVelocity - previousVelocity) / Math.max(0.01, dt * 72),
      0,
      1,
    );

    if (opposing) {
      player.speed = Math.max(
        34,
        player.speed - finiteTuning(this.tuning.reversalScrub, TUNING.reversalScrub)
          * (0.5 + speedRatio * 0.75)
          * Math.abs(inputX)
          * dt,
      );
    }

    const candidateDirection = Math.sign(player.travelVelocity);
    const canCommit = candidateDirection !== 0
      && candidateDirection !== player.travelDirection
      && Math.abs(player.travelVelocity) >= finiteTuning(
        this.tuning.reversalCommitSpeed,
        TUNING.reversalCommitSpeed,
      );
    player.directionCommit = canCommit
      ? player.directionCommit + dt
      : Math.max(0, player.directionCommit - dt * 2);
    if (player.directionCommit < finiteTuning(
      this.tuning.reversalCommitTime,
      TUNING.reversalCommitTime,
    )) return;

    const from = player.travelDirection;
    player.travelDirection = candidateDirection;
    player.directionCommit = 0;
    player.switchStance = player.travelDirection !== player.runStartDirection;
    player.reversalCount += 1;
    this.score.registerDirectionChange({
      speed: player.speed,
      turnForce: player.turnForce,
      switchStance: player.switchStance,
    });
    player.skillMomentum = clamp(
      player.skillMomentum + TUNING.reversalSkillGain,
      0,
      1,
    );
    this.emit("directionChange", {
      from,
      to: player.travelDirection,
      speed: player.speed,
      turnForce: player.turnForce,
      switch: player.switchStance,
    });
  }

  baseRideSpeedCap() {
    const baseTarget = this.tuning.speed * this.board.acceleration;
    return Math.max(baseTarget, this.tuning.maxSpeed * this.board.maxSpeed);
  }

  currentRideSpeedCap(overdrive = this.player.turboOverdrive) {
    const base = this.baseRideSpeedCap();
    const envelope = clamp(Number(overdrive) || 0, 0, 1);
    const multiplier = finiteTuning(
      this.tuning.turboSpeedCapMultiplier,
      TUNING.turboSpeedCapMultiplier,
    );
    return base * (1 + envelope * (multiplier - 1));
  }

  constrainRidingX() {
    const player = this.player;
    this.advanceForwardCamera("x");
    const [ridingMinX, ridingMaxX] = this.wave.profile.bounds.ridingX;
    const nextX = clamp(player.x, ridingMinX, ridingMaxX);
    if (nextX !== player.x) {
      const pushingOut = (nextX === ridingMinX && player.lateralVelocity < 0)
        || (nextX === ridingMaxX && player.lateralVelocity > 0);
      if (pushingOut) player.lateralVelocity = 0;
      if (pushingOut) player.travelVelocity = 0;
      player.x = nextX;
    }
  }

  /**
   * California Games-style forward camera dead zone. Kaki crosses most of the
   * visible face before the camera follows. Only forward overflow advances the
   * camera; a cutback traverses the screen toward the independently pursuing
   * barrel instead of instantly dragging the whole world backward.
   */
  advanceForwardCamera(positionKey = "x") {
    const cameraBounds = this.wave.profile.bounds.cameraX;
    if (!cameraBounds) return 0;
    const maxX = Number(cameraBounds[1]);
    const current = Number(this.player[positionKey]);
    if (!Number.isFinite(maxX) || !Number.isFinite(current) || current <= maxX) return 0;
    const shift = current - maxX;
    this.player[positionKey] = maxX;
    const previousKey = positionKey === "airX" ? "previousAirX" : "previousX";
    this.player[previousKey] = Math.min(Number(this.player[previousKey]) || maxX, maxX);
    this.cameraWorldX += shift;
    // curlX is the break's projected screen coordinate. Moving the camera
    // forward pushes the world-space barrel left and can take it fully out of
    // frame; GameplayWave's own update keeps pursuing to screen-right.
    this.wave.curlX -= shift;
    return shift;
  }

  querySpeedPotential(input = EMPTY_INPUT) {
    const player = this.player;
    const fallbackRisk = this.wave.pocketRisk(player.x);
    const fallbackTarget = clamp(0.42 - this.wave.pressure * 0.035, 0.3, 0.5);
    const fallbackError = player.face - fallbackTarget;
    const absoluteFallbackError = Math.abs(fallbackError);
    const fallbackLineQuality = 1 - smoothstep(0.035, 0.27, absoluteFallbackError);
    const fallbackSeamCore = 1 - smoothstep(0.025, 0.115, absoluteFallbackError);
    const fallbackSustainableBand = smoothstep(0.16, 0.34, fallbackRisk)
      * (1 - smoothstep(0.68, 0.82, fallbackRisk))
      * Number(player.state !== "lip");
    const fallbackSeamDrive = clamp(fallbackSeamCore * fallbackSustainableBand, 0, 1);
    const fallbackPotential = clamp(
      fallbackLineQuality * 0.68 + fallbackRisk * 0.22 + fallbackSeamDrive * 0.1,
      0,
      1,
    );
    const fallbackZone = fallbackRisk >= 0.78 || player.state === "lip"
      ? "critical"
      : absoluteFallbackError <= 0.12 && fallbackRisk >= 0.16
        ? "power"
        : "safe";
    const fallback = {
      acceleration: clamp(
        0.18 + fallbackPotential * 0.7 + fallbackSeamDrive * 0.38,
        0.15,
        1.25,
      ),
      targetFace: fallbackTarget,
      error: fallbackError,
      correction: Math.sign(fallbackTarget - player.face),
      zone: fallbackZone,
      risk: fallbackRisk,
      pocket: fallbackRisk,
      pressure: this.wave.pressure,
      breaking: player.state === "lip" ? 1 : 0,
      lineQuality: fallbackLineQuality,
      seamDrive: fallbackSeamDrive,
      maxFlowEligible: fallbackSeamDrive >= 0.85,
      pumpEfficiency: clamp(
        (fallbackLineQuality * 0.25 + fallbackSeamDrive * 0.75)
          * (0.78 + fallbackRisk * 0.22),
        0,
        1,
      ),
      potential: fallbackPotential,
    };

    if (typeof this.wave.speedPotential !== "function") return fallback;
    const result = this.wave.speedPotential(player.x, player.face, {
      pumpCharge: player.charge,
      // A raw release is not a pump. updateRiding validates charge, line,
      // direction and cadence before applying the discrete pump impulse.
      pumpReleased: false,
      board: this.board,
      breaking: player.state === "lip",
      faceVelocity: player.faceVelocity,
      speed: player.speed,
    }) ?? fallback;
    return {
      acceleration: finiteOr(result.acceleration, fallback.acceleration, 0.15, 1.25),
      targetFace: finiteOr(result.targetFace, fallback.targetFace, 0.3, 0.5),
      error: finiteOr(result.error, fallback.error, -1, 1),
      correction: Math.sign(finiteOr(result.correction, fallback.correction, -1, 1)),
      zone: result.zone === "power" || result.zone === "critical" ? result.zone : "safe",
      risk: finiteOr(result.risk, fallback.risk, 0, 1),
      pocket: finiteOr(result.pocket, fallback.pocket, 0, 1),
      pressure: finiteOr(result.pressure, fallback.pressure, 0, 1),
      breaking: finiteOr(Number(result.breaking), fallback.breaking, 0, 1),
      lineQuality: finiteOr(result.lineQuality, fallback.lineQuality, 0, 1),
      seamDrive: finiteOr(result.seamDrive, fallback.seamDrive, 0, 1),
      maxFlowEligible: Boolean(result.maxFlowEligible ?? fallback.maxFlowEligible),
      pumpEfficiency: finiteOr(result.pumpEfficiency, fallback.pumpEfficiency, 0, 1),
      potential: finiteOr(result.potential, fallback.potential, 0, 1),
    };
  }

  updateRidingManeuvers(dt, input, potential) {
    const player = this.player;
    player.maneuverCooldown = Math.max(0, player.maneuverCooldown - dt);
    if (player.maneuver.id && player.maneuver.id !== "tubeTuck" && player.maneuver.id !== "soulArch") {
      player.maneuverTime += dt;
      player.maneuver.progress = clamp(
        player.maneuverTime / Math.max(0.01, player.maneuverDuration),
        0,
        1,
      );
      if (player.maneuver.progress >= 1) {
        player.maneuver.id = "";
        player.maneuver.progress = 0;
      }
    }

    const presses = this.consumeTrickPresses(input);
    const tubeEligible = isTubeRideEligible(potential, player, this.tuning);
    const tubeScale = this.updateTubeRide(dt, {
      held: input.trick4,
      pressed: presses.trick4,
    }, potential);
    if (tubeScale !== null) return tubeScale;
    // A live barrel session owns the maneuver channel for the whole step.
    // Ordinary lip tricks resume on the next step after a deliberate exit,
    // never score underneath Tube Tuck or restart its pose in the same frame.
    if (presses.trick1) this.trySnap(potential);
    if (presses.trick2) this.tryCutback(potential);
    if (presses.trick3) this.tryFloater(potential);
    if (presses.trick4 && !tubeEligible) {
      this.rejectManeuver("trick4", "tubeTuck", "FIND POCKET");
    }
    return 1;
  }

  updateSimpleRidingManeuver(dt, input, potential) {
    const tubeScale = this.updateTubeRide(dt, {
      held: input.trick,
      pressed: input.trickPressed,
    }, potential);
    if (tubeScale !== null) return tubeScale;
    return 1;
  }

  updateTubeRide(dt, input, potential) {
    const player = this.player;
    const tube = player.tubeRide;
    if (!input.held) tube.releaseRequired = false;
    const entryEligible = isTubeRideEligible(potential, player, this.tuning);
    const holdEligible = isTubeRideEligible(potential, player, this.tuning, true);
    const ready = entryEligible && !tube.active && !tube.releaseRequired;
    player.tubeReady = ready;

    if (ready && !tube.wasReady && !tube.hintShown && !input.held
      && (!this.tutorialEnabled || this.tutorial.complete)) {
      tube.hintShown = true;
      this.emit("tubeReady", {
        action: this.controlMode === "advanced" ? "T" : "TRICK",
        risk: potential.risk,
      });
      this.emit("callout", {
        text: "TUBE OPEN",
        subtext: this.controlMode === "advanced" ? "HOLD T TO TUCK" : "HOLD TRICK TO TUCK",
        tone: "hint",
        channel: "tube",
      });
    }
    tube.wasReady = ready;

    if (input.held && !tube.active && entryEligible && !tube.releaseRequired) {
      this.beginTubeRide(potential);
      return this.sustainTubeRide(dt, potential);
    }
    if (input.held && tube.active) {
      if (holdEligible) {
        tube.exitGrace = finiteTuning(this.tuning.tubeExitGrace, TUNING.tubeExitGrace);
        return this.sustainTubeRide(dt, potential);
      }
      tube.exitGrace = Math.max(0, tube.exitGrace - dt);
      if (tube.exitGrace > 0) return finiteTuning(
        this.tuning.tubeSteeringScale,
        TUNING.tubeSteeringScale,
      );
      this.endTubeRide("pocket", { requireRelease: true });
      return 1;
    }
    if (tube.active) {
      this.endTubeRide("release");
      return 1;
    }
    return null;
  }

  beginTubeRide(potential) {
    const player = this.player;
    const tube = player.tubeRide;
    const id = this.board.id === "moonLog" ? "soulArch" : "tubeTuck";
    tube.active = true;
    tube.id = id;
    tube.time = 0;
    tube.score = 0;
    tube.exitGrace = finiteTuning(this.tuning.tubeExitGrace, TUNING.tubeExitGrace);
    tube.releaseRequired = false;
    tube.visualExit = 0;
    player.tubeReady = false;
    this.highlights.tubeRides += 1;
    if (this.controlMode === "simple") {
      // Context Trick belongs to the tube once it starts; it must not be
      // replayed as an aerial request when the same hold is released.
      const context = player.contextTrick;
      context.consumedId = context.requestId;
      context.pending = false;
      context.released = false;
      context.activeAction = "";
      context.syntheticHold = 0;
    }
    this.startManeuver(id, 0.8, potential);
    this.emit("callout", {
      text: id === "soulArch" ? "SOUL ARCH" : "TUBE TUCK",
      subtext: "HOLD THE POCKET",
      tone: "risk",
      channel: "tube",
    });
  }

  sustainTubeRide(dt, potential) {
    const player = this.player;
    const tube = player.tubeRide;
    const id = tube.id || (this.board.id === "moonLog" ? "soulArch" : "tubeTuck");
    if (!tube.active) this.beginTubeRide(potential);
    if (player.maneuver.id !== id) this.startManeuver(id, 0.8, potential);
    player.maneuverTime += dt;
    player.maneuver.progress = clamp(player.maneuverTime / 0.8, 0, 1);
    const awarded = this.score.updateTube(dt, potential.risk, this.currentMultiplier());
    tube.time += dt;
    tube.score += awarded;
    this.highlights.longestTube = Math.max(this.highlights.longestTube, tube.time);
    if (tube.score > this.highlights.bestTubeScore) {
      this.highlights.bestTubeScore = tube.score;
      this.highlights.bestTubeDuration = tube.time;
    }
    player.speed += this.tuning.wavePush
      * potential.acceleration
      * finiteTuning(this.tuning.tubeSpeedPushScale, TUNING.tubeSpeedPushScale)
      * dt;
    return finiteTuning(this.tuning.tubeSteeringScale, TUNING.tubeSteeringScale);
  }

  endTubeRide(reason = "release", { failure = false, requireRelease = false, silent = false } = {}) {
    const player = this.player;
    const tube = player.tubeRide;
    if (!tube.active) return null;
    const payload = {
      id: tube.id,
      reason,
      duration: tube.time,
      score: tube.score,
    };
    tube.active = false;
    tube.id = "";
    tube.exitGrace = 0;
    tube.wasReady = false;
    tube.releaseRequired = Boolean(requireRelease);
    tube.visualExit = failure || silent ? 0 : 0.18;
    player.tubeReady = false;
    if (isTubeManeuver(player.maneuver.id)) {
      player.maneuver.id = "";
      player.maneuver.progress = 0;
      player.maneuverTime = 0;
    }
    if (failure) {
      this.emit("tubeFail", payload);
      return payload;
    }
    if (silent) return payload;
    this.emit("tubeExit", payload);
    if (payload.duration >= finiteTuning(
      this.tuning.tubeCleanExitTime,
      TUNING.tubeCleanExitTime,
    )) {
      this.emit("callout", {
        text: "CLEAN TUBE EXIT",
        subtext: `${payload.duration.toFixed(1)}S  +${Math.round(payload.score)}`,
        tone: "perfect",
        channel: "tube",
      });
    }
    return payload;
  }

  consumeTrickPresses(input) {
    const result = { trick1: false, trick2: false, trick3: false, trick4: false };
    for (let index = 1; index <= 4; index += 1) {
      const action = `trick${index}`;
      const signaled = input[action] || input[`${action}Pressed`];
      if (signaled && !this.player.trickInputLocks[action]) {
        result[action] = true;
        this.player.trickInputLocks[action] = true;
      }
      if (!signaled) {
        this.player.trickInputLocks[action] = false;
      }
    }
    return result;
  }

  trySnap(potential) {
    const player = this.player;
    if (player.maneuverCooldown > 0 || Math.abs(player.faceVelocity) < SCORE.carveMinVelocity) {
      this.rejectManeuver("trick1", "snap", "CARVE FIRST");
      return;
    }
    const redirect = potential.correction || -Math.sign(player.faceVelocity) || 1;
    const turnVelocity = Math.max(0.46, Math.abs(player.faceVelocity) * 0.86);
    player.faceVelocity = redirect * turnVelocity;
    player.speed = Math.max(34, player.speed - (potential.potential < 0.3 ? 5 : 2));
    this.score.registerManeuver({
      points: 46 + turnVelocity * 58,
      multiplier: this.currentMultiplier(),
      combo: 0.08,
    });
    player.maneuverCooldown = 0.24;
    this.startManeuver("snap", 0.22, potential);
  }

  tryCutback(potential) {
    const player = this.player;
    if (potential.risk > 0.9 || player.x - this.wave.curlX < 24) {
      this.rejectManeuver("trick2", "cutback", "TOO DEEP");
      return;
    }
    if (player.maneuverCooldown > 0 || Math.abs(player.faceVelocity) < 0.2) {
      this.rejectManeuver("trick2", "cutback", "CARVE FIRST");
      return;
    }
    player.faceVelocity *= -0.78;
    player.directionIntent = -player.travelDirection;
    player.redirectVelocity = -player.travelDirection * 28;
    player.speed = Math.max(36, player.speed * 0.92);
    this.score.registerManeuver({
      points: 78 + potential.risk * 54,
      multiplier: this.currentMultiplier(),
      combo: 0.11,
    });
    player.maneuverCooldown = 0.38;
    this.startManeuver("cutback", 0.42, potential);
  }

  tryFloater(potential) {
    const player = this.player;
    if (player.face > 0.14 && player.state !== "lip") {
      this.rejectManeuver("trick3", "floater", "NEED LIP");
      return;
    }
    if (player.maneuverCooldown > 0) {
      this.rejectManeuver("trick3", "floater", "TIME THE LIP");
      return;
    }
    player.speed = Math.max(player.speed, this.tuning.speed * this.board.acceleration * 0.98);
    player.faceVelocity = Math.min(player.faceVelocity, -0.1);
    player.lipMemory = Math.max(player.lipMemory, this.tuning.launchCoyote);
    player.compression = Math.max(player.compression, 0.5);
    this.score.registerManeuver({
      points: 92 + player.speed * 0.18,
      multiplier: this.currentMultiplier(),
      combo: 0.12,
    });
    player.maneuverCooldown = 0.36;
    this.startManeuver("floater", 0.46, potential);
  }

  startManeuver(id, duration, potential) {
    const player = this.player;
    player.maneuver.id = id;
    player.maneuver.progress = 0;
    player.maneuverTime = 0;
    player.maneuverDuration = duration;
    this.emit("maneuver", {
      id,
      progress: 0,
      targetFace: potential.targetFace,
      zone: potential.zone,
    });
  }

  rejectManeuver(action, id, hint) {
    this.emit("trickRejected", {
      action,
      id,
      hint,
      context: "wave",
    });
    this.emit("callout", { text: hint, tone: "hint" });
  }

  applyAerialPreview(preview) {
    const player = this.player;
    player.provisionalScore = Math.max(0, preview.provisional);
    player.provisionalTrickName = preview.name;
    if (!player.trickManifest) return;
    player.trickManifest.provisionalScore = player.provisionalScore;
    player.trickManifest.provisionalTrickName = player.provisionalTrickName;
    player.trickManifest.repetitionSignature = preview.signature;
    player.trickManifest.rotationDegrees = preview.rotationDegrees;
  }

  emitPumpChargeCue(previousCharge, nextCharge) {
    const previousTier = Math.floor((previousCharge + Number.EPSILON) / PUMP_CHARGE_CUE_STEP);
    const nextTier = Math.floor((nextCharge + Number.EPSILON) / PUMP_CHARGE_CUE_STEP);
    if (nextTier <= previousTier) return;
    this.emit("pumpCharge", {
      charge: nextCharge,
      tier: Math.min(4, nextTier),
    });
  }

  updateComboCue() {
    const nextLevel = Math.max(
      1,
      Math.floor((this.score.combo + Number.EPSILON) / COMBO_CUE_STEP) * COMBO_CUE_STEP,
    );
    if (nextLevel <= 1) {
      this.comboCueLevel = 1;
      return;
    }
    if (nextLevel > this.comboCueLevel) {
      this.emit("comboIncrease", {
        combo: this.score.combo,
        level: nextLevel,
      });
      this.comboCueLevel = nextLevel;
    }
  }

  landingBands() {
    const assistScale = this.assists.landing ? 1.4 : 1;
    const clean = this.tuning.landingTolerance * this.board.landing * assistScale;
    return {
      perfect: this.tuning.perfectTolerance * assistScale,
      clean,
      recovery: Math.min(this.tuning.wipeoutThreshold, clean * 1.7),
    };
  }

  updateTutorialSignals(dt, input) {
    this.syncTutorialEnabled();
    const signal = this.tutorial.update(dt, {
      elapsed: this.elapsed,
      player: this.player,
      input,
    });
    if (signal) this.emit(signal.type, signal.payload);
  }

  syncTutorialEnabled() {
    const enabled = Boolean(this.tutorialEnabled);
    if (enabled !== this.tutorial.enabled) this.tutorial.setEnabled(enabled);
  }

  updateCurlDanger(dt, risk) {
    const player = this.player;
    if (player.animalMount) {
      player.curlTimer = 0;
      return;
    }
    // `curlGrace` protects the opening read/teaching beat, not only the
    // breaker's advance rate. Twilight's visible lip starts farther forward,
    // so collision must honor the same contract explicitly.
    if (this.wave.time < this.tuning.curlGrace) {
      player.curlTimer = 0;
      return;
    }
    if (this.wave.curlContact(player.x)) {
      player.curlTimer += dt;
      if (player.curlTimer >= this.tuning.curlCatchDelay) {
        this.triggerWipeout("CURL ATE IT!", "curl");
      }
    } else {
      player.curlTimer = Math.max(0, player.curlTimer - dt * 2.4);
    }
    if (risk > 0.7 && !player.pocketAnnounced) {
      player.pocketAnnounced = true;
      this.emit("callout", { text: "CURL HUGGER", tone: "risk" });
    } else if (risk < 0.48) {
      player.pocketAnnounced = false;
    }
  }

  triggerWipeout(text, cause) {
    if (this.player.state === "wipeout" || this.complete) return;
    const player = this.player;
    const failedTube = player.tubeRide.active
      ? this.endTubeRide(cause || "wipeout", { failure: true })
      : null;
    if (failedTube && cause === "curl") text = "TUBE CLOSED!";
    if (player.animalMount) this.world.cancelMountedAnimals(cause || "wipeout");
    player.animalMount = "";
    player.animalSpecialReady = false;
    player.turbo = clamp(
      player.turbo * (1 - finiteTuning(this.tuning.turboWipeoutLoss, TUNING.turboWipeoutLoss)),
      0,
      1,
    );
    player.turboActive = false;
    player.turboOverdrive = 0;
    player.wipeoutCause = cause;
    player.wipeoutSpin = player.angularVelocity || (cause === "curl" ? -5.4 : 4.7);
    player.airX = player.state === "airborne" ? player.airX : player.x;
    player.airY = player.state === "airborne" ? player.airY : this.wave.ridingY(player.x, player.face);
    player.airVX = player.state === "airborne" ? player.airVX : player.lateralVelocity || 9;
    player.airVY = player.state === "airborne" ? player.airVY : -28;
    player.waveMomentum = 0;
    player.lateralVelocity = 0;
    player.travelVelocity = 0;
    resetCarveArcState(player);
    resetContextTrick(player.contextTrick);
    if (this.aerialSession) this.aerialSession.wipeout();
    player.provisionalScore = 0;
    player.provisionalTrickName = "";
    player.landingQuality = "";
    player.trickPose = "neutral";
    player.maneuver.id = "";
    player.maneuver.progress = 0;
    this.wipeouts += 1;
    this.lastWipeoutAt = this.elapsed;
    this.score.wipeout();
    this.comboCueLevel = 1;
    this.setState("wipeout");
    this.emit("wipeout", { cause, count: this.wipeouts });
    this.emit("callout", { text, tone: "wipeout" });
  }

  updateWipeout(dt) {
    const player = this.player;
    player.previousAerialAltitude = player.aerialAltitude;
    player.aerialAltitude = Math.max(0, player.aerialAltitude - dt * 1.8);
    player.aerialZone = aerialZoneForAltitude(player.aerialAltitude).id;
    player.airVY += this.tuning.gravity * 0.72 * dt;
    player.airX += player.airVX * dt;
    const boundedAirX = clamp(player.airX, 50, 360);
    if (boundedAirX !== player.airX) player.airVX *= -0.18;
    player.airX = boundedAirX;
    player.airY += player.airVY * dt;
    player.bodyAngle += player.wipeoutSpin * dt;
    player.boardAngle -= player.wipeoutSpin * 0.55 * dt;
    if (player.stateTime < 1.08) return;

    if (this.wipeouts >= this.tuning.maxWipeouts || (this.mode.timed && this.timeRemaining <= 0)) {
      this.finishRun(this.wipeouts >= this.tuning.maxWipeouts ? "wipeouts" : "time");
      return;
    }

    // Respawning is an explicit recovery reset, not ordinary threat motion.
    // Keep the curl behind the entry endpoint so one mistake cannot cascade
    // into unavoidable re-catches while the entry animation owns control.
    const retreat = Math.max(
      38,
      Math.min(
        this.wave.curlX - TUNING.curlRespawnRetreat,
        TUNING.curlRespawnSafeX,
      ),
    );
    this.wave.curlX = retreat;
    const preservedTurbo = player.turbo;
    resetPlayer(player, false, this.tuning.speed);
    player.turbo = preservedTurbo;
    this.aerialSession = null;
    player.x = clamp(this.wave.curlX + 122, 160, 282);
    player.face = 0.5;
    player.speed = this.tuning.speed * 0.92;
    this.setState("entry");
    this.emit("respawn", { remaining: this.tuning.maxWipeouts - this.wipeouts });
  }

  finishRun(reason) {
    if (this.player.tubeRide.active) this.endTubeRide("complete", { silent: true });
    this.complete = true;
    this.flowRating = Math.round(clamp(this.score.flowPeak, 0, 1) * 100);
    const rank = this.score.rank();
    this.player.resultWon = rank.grade !== "D";
    this.player.state = "complete";
    this.emit("complete", {
      reason,
      score: Math.round(this.score.total),
      rank,
      flow: this.flowRating,
      mode: this.modeId,
      duration: Math.round(this.activeTime),
      distance: Math.round(this.rideDistance),
      set: this.endlessSet,
      breakdown: { ...this.score.breakdown },
      highlights: { ...this.highlights },
    });
  }

  currentMultiplier() {
    return Math.min(7.5, this.score.multiplier(
      this.wave.pocketRisk(this.player.x),
      this.board.style,
      this.assists.steering || this.assists.landing,
    ) * this.endlessScoreBonus);
  }

  scoreScales() {
    this._scoreScales.speed = this.tuning.scoreSpeed / 0.22;
    this._scoreScales.pocket = this.tuning.scorePocket / 1.05;
    this._scoreScales.flow = this.tuning.scoreFlow / 0.38;
    return this._scoreScales;
  }

  setState(state) {
    this.player.state = state;
    this.player.stateTime = 0;
    if (state === "airborne") this.player.apexFired = false;
    this.emit("state", { state });
  }

  emit(type, payload = null) {
    this.syncTutorialEnabled();
    this.tutorial.observe(type, payload);
    if (this.eventCount >= this.events.length) return;
    this.events[this.eventCount] = { type, payload, time: this.elapsed };
    this.eventCount += 1;
  }

  consumeEvents(callback) {
    for (let index = 0; index < this.eventCount; index += 1) {
      callback(this.events[index]);
      this.events[index] = undefined;
    }
    this.eventCount = 0;
  }
}

function createWorldStepContext() {
  return {
    worldTravel: 0,
    previousWorldTravel: 0,
    cameraWorldX: 0,
    previousCameraWorldX: 0,
    direction: 1,
    player: {
      collisionX: 212,
      previousCollisionX: 212,
      collisionY: 128,
      previousCollisionY: 128,
      vx: 0,
      vy: 0,
      radius: 7,
      state: "entry",
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
    curlScreenX: 0,
    curlApproaching: false,
  };
}

function createRunHighlights() {
  return {
    biggestAir: 0,
    bestTrick: "",
    perfectLandings: 0,
    switchBonuses: 0,
    animalBonuses: 0,
    nearMisses: 0,
    powerups: 0,
    tubeRides: 0,
    longestTube: 0,
    bestTubeScore: 0,
    bestTubeDuration: 0,
  };
}

function resetRunHighlights(highlights) {
  highlights.biggestAir = 0;
  highlights.bestTrick = "";
  highlights.perfectLandings = 0;
  highlights.switchBonuses = 0;
  highlights.animalBonuses = 0;
  highlights.nearMisses = 0;
  highlights.powerups = 0;
  highlights.tubeRides = 0;
  highlights.longestTube = 0;
  highlights.bestTubeScore = 0;
  highlights.bestTubeDuration = 0;
}

function beginCarveArc(player, sign) {
  player.carveArcSign = Math.sign(sign);
  player.carveArcStartFace = player.face;
  player.carveArcDuration = 0;
  player.carveArcExcursion = 0;
  player.carveArcPeakVelocity = Math.abs(player.faceVelocity);
  player.carveArcIdle = 0;
}

function resetCarveArcState(player) {
  player.carveArcSign = 0;
  player.carveArcStartFace = player.face;
  player.carveArcDuration = 0;
  player.carveArcExcursion = 0;
  player.carveArcPeakVelocity = 0;
  player.carveArcIdle = 0;
}

function createPlayer() {
  return {
    state: "entry",
    stateTime: 0,
    x: 212,
    previousX: 212,
    face: 0.48,
    previousFace: 0.48,
    faceVelocity: 0,
    speed: TUNING.speed,
    speedTier: "GLIDING",
    turbo: TUNING.turboStartCharge,
    turboActive: false,
    turboOverdrive: 0,
    flowTier: "",
    flow: 0,
    travelDirection: 1,
    runStartDirection: 1,
    takeoffDirection: 1,
    landingDirection: 1,
    directionIntent: 1,
    directionCommit: 0,
    switchStance: false,
    reversalCount: 0,
    travelVelocity: 12,
    worldTravel: 0,
    turnForce: 0,
    slopeDrive: 0,
    surfaceGradientX: 0,
    surfaceGradientFace: 0,
    motionVX: 12,
    motionVY: 0,
    motionSpeed: 12,
    motionHeading: 0,
    motionDirection: 1,
    downhillComponent: 0,
    uphillComponent: 0,
    tailX: 195,
    tailY: 128,
    wakeSamples: Array.from({ length: WAKE_SAMPLE_CAPACITY }, createWakeSample),
    wakeSampleCursor: 0,
    wakeSampleClock: 0,
    boardAngle: 0,
    bodyAngle: 0,
    trickPose: "neutral",
    boardRelativeAngle: 0,
    provisionalTrickName: "",
    provisionalScore: 0,
    trickManifest: null,
    landingQuality: "",
    lastLandingQuality: "clean",
    resultWon: null,
    maneuver: { id: "", progress: 0 },
    landingPreview: createLandingPreview(),
    speedPotential: createSpeedPotentialState(),
    waveMomentum: 0,
    skillMomentum: 0,
    compression: 0,
    charge: 0,
    lastPumpAt: -1e6,
    carveArcSign: 0,
    carveArcStartFace: 0.48,
    carveArcDuration: 0,
    carveArcExcursion: 0,
    carveArcPeakVelocity: 0,
    carveArcIdle: 0,
    contextTrick: createContextTrick(),
    lipMemory: 0,
    curlTimer: 0,
    pocketAnnounced: false,
    tubeReady: false,
    tubeRide: createTubeRide(),
    airX: 212,
    previousAirX: 212,
    airY: 118,
    previousAirY: 118,
    airVX: 0,
    airVY: 0,
    angularVelocity: 0,
    rotationAccum: 0,
    launchY: 0,
    maxAirHeight: 0,
    landingFace: 0.16,
    contactTimer: -1,
    grabbed: false,
    apexFired: false,
    aerialAltitude: 0,
    previousAerialAltitude: 0,
    aerialAltitudeCeiling: 0.18,
    aerialExpectedHeight: 28,
    aerialZone: "coastalSky",
    aerialLaunchQuality: 0,
    aerialTurboLaunch: 0,
    aerialSpaceQualified: false,
    aerialMilestoneTier: 0,
    aerialReentryFired: false,
    wobble: 0,
    wipeoutCause: "",
    wipeoutSpin: 0,
    lateralVelocity: 12,
    redirectVelocity: 0,
    maneuverCooldown: 0,
    maneuverTime: 0,
    maneuverDuration: 0,
    landingCarryTimer: 0,
    landingCarryDuration: 0,
    landingCarrySpeed: 0,
    animalMount: "",
    animalMountTime: 0,
    animalSpecialReady: false,
    trickInputLocks: {
      trick1: false,
      trick2: false,
      trick3: false,
      trick4: false,
    },
  };
}

function resetPlayer(
  player,
  resetPosition = true,
  baseSpeed = TUNING.speed,
  turboStart = TUNING.turboStartCharge,
) {
  player.state = "entry";
  player.stateTime = 0;
  if (resetPosition) {
    player.x = 212;
    player.face = 0.48;
  }
  player.previousX = player.x;
  player.previousFace = player.face;
  player.faceVelocity = 0;
  player.speed = baseSpeed;
  player.speedTier = "GLIDING";
  player.turbo = clamp(
    finiteTuning(turboStart, TUNING.turboStartCharge),
    0,
    1,
  );
  player.turboActive = false;
  player.turboOverdrive = 0;
  player.flowTier = "";
  player.flow = 0;
  player.travelDirection = 1;
  player.runStartDirection = 1;
  player.takeoffDirection = 1;
  player.landingDirection = 1;
  player.directionIntent = 1;
  player.directionCommit = 0;
  player.switchStance = false;
  player.reversalCount = 0;
  player.travelVelocity = 12;
  player.worldTravel = 0;
  player.turnForce = 0;
  player.slopeDrive = 0;
  player.surfaceGradientX = 0;
  player.surfaceGradientFace = 0;
  player.motionVX = 12;
  player.motionVY = 0;
  player.motionSpeed = 12;
  player.motionHeading = 0;
  player.motionDirection = 1;
  player.downhillComponent = 0;
  player.uphillComponent = 0;
  player.tailX = player.x - 17;
  player.tailY = 128;
  player.wakeSampleCursor = 0;
  player.wakeSampleClock = 0;
  for (const sample of player.wakeSamples) {
    sample.active = false;
    sample.age = 0;
    sample.sourceVX = 0;
    sample.sourceVY = 0;
  }
  player.boardAngle = 0;
  player.bodyAngle = 0;
  player.trickPose = "neutral";
  player.boardRelativeAngle = 0;
  player.provisionalTrickName = "";
  player.provisionalScore = 0;
  player.trickManifest = null;
  player.landingQuality = "";
  player.lastLandingQuality = "clean";
  player.resultWon = null;
  player.maneuver.id = "";
  player.maneuver.progress = 0;
  resetLandingPreview(player.landingPreview);
  copySpeedPotential(player.speedPotential, createSpeedPotentialState());
  player.waveMomentum = 0;
  player.skillMomentum = 0;
  player.compression = 0;
  player.charge = 0;
  player.lastPumpAt = -1e6;
  resetCarveArcState(player);
  resetContextTrick(player.contextTrick);
  player.lipMemory = 0;
  player.curlTimer = 0;
  player.pocketAnnounced = false;
  player.tubeReady = false;
  resetTubeRide(player.tubeRide);
  player.airX = player.x;
  player.previousAirX = player.x;
  player.airY = 118;
  player.previousAirY = 118;
  player.airVX = 0;
  player.airVY = 0;
  player.angularVelocity = 0;
  player.rotationAccum = 0;
  player.launchY = 0;
  player.maxAirHeight = 0;
  player.landingFace = 0.16;
  player.contactTimer = -1;
  player.grabbed = false;
  player.apexFired = false;
  player.aerialAltitude = 0;
  player.previousAerialAltitude = 0;
  player.aerialAltitudeCeiling = 0.18;
  player.aerialExpectedHeight = 28;
  player.aerialZone = "coastalSky";
  player.aerialLaunchQuality = 0;
  player.aerialTurboLaunch = 0;
  player.aerialSpaceQualified = false;
  player.aerialMilestoneTier = 0;
  player.aerialReentryFired = false;
  player.wobble = 0;
  player.wipeoutCause = "";
  player.wipeoutSpin = 0;
  player.lateralVelocity = 12;
  player.redirectVelocity = 0;
  player.maneuverCooldown = 0;
  player.maneuverTime = 0;
  player.maneuverDuration = 0;
  player.landingCarryTimer = 0;
  player.landingCarryDuration = 0;
  player.landingCarrySpeed = 0;
  player.animalMount = "";
  player.animalMountTime = 0;
  player.animalSpecialReady = false;
  player.trickInputLocks.trick1 = false;
  player.trickInputLocks.trick2 = false;
  player.trickInputLocks.trick3 = false;
  player.trickInputLocks.trick4 = false;
}

function createSpeedPotentialState() {
  return {
    acceleration: 0.5,
    targetFace: 0.42,
    error: 0,
    correction: 0,
    zone: "safe",
    risk: 0,
    pocket: 0,
    pressure: 0,
    breaking: 0,
    lineQuality: 0,
    seamDrive: 0,
    maxFlowEligible: false,
    pumpEfficiency: 0,
    potential: 0,
  };
}

function copySpeedPotential(target, source) {
  target.acceleration = Number(source.acceleration) || 0;
  target.targetFace = Number(source.targetFace) || 0;
  target.error = Number(source.error) || 0;
  target.correction = Number(source.correction) || 0;
  target.zone = typeof source.zone === "string" ? source.zone : "safe";
  target.risk = Number(source.risk) || 0;
  target.pocket = Number(source.pocket) || 0;
  target.pressure = Number(source.pressure) || 0;
  target.breaking = Number(source.breaking) || 0;
  target.lineQuality = Number(source.lineQuality) || 0;
  target.seamDrive = Number(source.seamDrive) || 0;
  target.maxFlowEligible = Boolean(source.maxFlowEligible);
  target.pumpEfficiency = Number(source.pumpEfficiency) || 0;
  target.potential = Number(source.potential) || 0;
  return target;
}

function createLandingPreview() {
  return {
    boardAngle: 0,
    targetAngle: 0,
    targetDirection: 1,
    error: 0,
    bands: { perfect: 0, clean: 0, recovery: 0 },
    improving: false,
  };
}

function resetLandingPreview(preview) {
  preview.boardAngle = 0;
  preview.targetAngle = 0;
  preview.targetDirection = 1;
  preview.error = 0;
  preview.bands.perfect = 0;
  preview.bands.clean = 0;
  preview.bands.recovery = 0;
  preview.improving = false;
}

function updateLandingPreview(player, targetAngle, bands, trackImprovement, targetDirection = player.travelDirection) {
  const preview = player.landingPreview;
  const nextError = Math.abs(shortestAngle(player.boardAngle, targetAngle));
  preview.improving = Boolean(trackImprovement && nextError + 0.002 < preview.error);
  preview.boardAngle = player.boardAngle;
  preview.targetAngle = targetAngle;
  preview.targetDirection = Math.sign(targetDirection) || 1;
  preview.error = nextError;
  preview.bands.perfect = bands.perfect;
  preview.bands.clean = bands.clean;
  preview.bands.recovery = bands.recovery;
}

function speedTierForSpeed(speed) {
  for (const [threshold, label] of SPEED_TIERS) {
    if (speed < threshold) return label;
  }
  return "BLASTING";
}

function createContextTrick() {
  return {
    requestId: 0,
    consumedId: 0,
    pending: false,
    buffer: 0,
    held: 0,
    holding: false,
    released: false,
    vertical: 0,
    activeAction: "",
    syntheticHold: 0,
  };
}

function resetContextTrick(state) {
  if (!state) return;
  state.requestId = 0;
  state.consumedId = 0;
  state.pending = false;
  state.buffer = 0;
  state.held = 0;
  state.holding = false;
  state.released = false;
  state.vertical = 0;
  state.activeAction = "";
  state.syntheticHold = 0;
}

function isTubeRideEligible(potential, player, tuning = TUNING, holding = false) {
  const risk = Number(potential?.risk ?? 0);
  const minimumRisk = finiteTuning(
    holding ? tuning.tubeHoldRisk : tuning.tubeEntryRisk,
    holding ? TUNING.tubeHoldRisk : TUNING.tubeEntryRisk,
  );
  const minimumFace = finiteTuning(
    holding ? tuning.tubeHoldFaceMin : tuning.tubeEntryFaceMin,
    holding ? TUNING.tubeHoldFaceMin : TUNING.tubeEntryFaceMin,
  );
  const maximumFace = finiteTuning(
    holding ? tuning.tubeHoldFaceMax : tuning.tubeEntryFaceMax,
    holding ? TUNING.tubeHoldFaceMax : TUNING.tubeEntryFaceMax,
  );
  return (potential?.zone === "critical" || risk >= minimumRisk)
    && Number(player?.face ?? 0) >= minimumFace
    && Number(player?.face ?? 0) <= maximumFace;
}

function isTubeManeuver(id) {
  return id === "tubeTuck" || id === "soulArch";
}

function createTubeRide() {
  return {
    active: false,
    id: "",
    time: 0,
    score: 0,
    exitGrace: 0,
    releaseRequired: false,
    visualExit: 0,
    hintShown: false,
    wasReady: false,
  };
}

function resetTubeRide(tube) {
  if (!tube) return;
  tube.active = false;
  tube.id = "";
  tube.time = 0;
  tube.score = 0;
  tube.exitGrace = 0;
  tube.releaseRequired = false;
  tube.visualExit = 0;
  tube.hintShown = false;
  tube.wasReady = false;
}

function simpleTapTrickFor(manifest) {
  const ids = new Set((manifest?.sequence ?? []).map((entry) => entry.id));
  if (!ids.has("boardVarial")) return "boardVarial";
  if (!ids.has("frontRailGrab")) return "frontRailGrab";
  if (!ids.has("tailGrab")) return "tailGrab";
  return "kakiTwist";
}

function simpleFallbackGrabFor(manifest) {
  const ids = new Set((manifest?.sequence ?? []).map((entry) => entry.id));
  if (!ids.has("frontRailGrab")) return "frontRailGrab";
  if (!ids.has("tailGrab")) return "tailGrab";
  return "";
}

function actionForSimpleTrick(id) {
  if (id === "frontRailGrab") return "trick1";
  if (id === "tailGrab") return "trick2";
  if (id === "boardVarial") return "trick3";
  if (id === "kakiTwist") return "trick4";
  return "";
}

function nearestLandingAlignment(boardAngle, surfaceAngle, takeoffDirection = 1) {
  const regularError = Math.abs(shortestAngle(boardAngle, surfaceAngle));
  const reverseAngle = surfaceAngle + Math.PI;
  const reverseError = Math.abs(shortestAngle(boardAngle, reverseAngle));
  if (reverseError + 1e-9 < regularError) {
    return {
      error: reverseError,
      targetAngle: reverseAngle,
      direction: -(Math.sign(takeoffDirection) || 1),
    };
  }
  return {
    error: regularError,
    targetAngle: surfaceAngle,
    direction: Math.sign(takeoffDirection) || 1,
  };
}

function normalizeControlMode(mode) {
  return String(mode).toLowerCase() === "advanced" ? "advanced" : "simple";
}

function resolveRunMode(mode) {
  const id = typeof mode === "string" ? mode : mode?.id;
  return RUN_MODES[id] ?? RUN_MODES[DEFAULT_RUN_MODE_ID];
}

function finiteOr(value, fallback, min, max) {
  return clamp(Number.isFinite(value) ? value : fallback, min, max);
}

function finiteTuning(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function boardHalfLength(board) {
  if (board?.id === "moonLog") return 22;
  if (board?.id === "mangoFish") return 16;
  return 17;
}

export { EMPTY_INPUT };
