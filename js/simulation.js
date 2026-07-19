import { BOARDS, FIXED_STEP, SCORE, TUNING } from "./config.js";
import { clamp, damp, shortestAngle, smoothstep, TAU } from "./math.js";
import { ScoreSystem } from "./scoring.js";
import { AerialTrickSession, normalizeTrickInput } from "./tricks.js";
import { GameplayWave } from "./wave.js";

const EMPTY_INPUT = Object.freeze({
  x: 0,
  y: 0,
  edge: false,
  edgePressed: false,
  edgeReleased: false,
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
});

const FLOW_TIERS = Object.freeze([
  [52, "STALLING"],
  [78, "GLIDING"],
  [101, "FLOWING"],
  [124, "FLYING"],
  [Infinity, "MAX FLOW"],
]);

const PUMP_CHARGE_CUE_STEP = 0.25;
const COMBO_CUE_STEP = 0.5;

export class SurfSimulation {
  constructor({ seed = 0x4b414b49, tuning = TUNING } = {}) {
    this.tuning = tuning;
    this.wave = new GameplayWave(seed);
    this.score = new ScoreSystem();
    this.events = new Array(24);
    this.eventCount = 0;
    this._scoreScales = { speed: 1, pocket: 1, flow: 1 };
    this._normalizedInput = {};
    this.assists = { steering: false, landing: false };
    this.board = BOARDS.foamPuff;
    this.player = createPlayer();
    this.aerialSession = null;
    this.reset();
  }

  reset({ board = this.board, assists = this.assists } = {}) {
    this.board = typeof board === "string" ? BOARDS[board] ?? BOARDS.foamPuff : board;
    this.assists = {
      steering: Boolean(assists.steering),
      landing: Boolean(assists.landing),
    };
    this.wave.reset();
    this.score.reset();
    this.comboCueLevel = 1;
    this.elapsed = 0;
    this.timeRemaining = this.tuning.runDuration;
    this.wipeouts = 0;
    this.complete = false;
    this.started = false;
    this.flowRating = 0;
    this.tutorialStage = 0;
    this.aerialSession = null;
    this.eventCount = 0;
    resetPlayer(this.player, true, this.tuning.speed);
    this.emit("state", { state: "entry" });
  }

  begin() {
    this.started = true;
  }

  update(dt = FIXED_STEP, input = EMPTY_INPUT) {
    if (!this.started || this.complete) return;

    input = normalizeTrickInput(input, this._normalizedInput);

    const player = this.player;
    player.previousX = player.x;
    player.previousFace = player.face;
    player.previousAirX = player.airX;
    player.previousAirY = player.airY;
    player.stateTime += dt;
    this.elapsed += dt;

    if (player.state !== "entry" && player.state !== "wipeout") {
      this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    }

    const waveSpeed = player.state === "airborne" ? Math.max(56, player.speed) : player.speed;
    this.wave.update(dt, waveSpeed, this.tuning.curlSpeed * (0.82 + this.wave.pressure * 0.34));

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

    this.updateComboCue();
    player.flowTier = flowTierForSpeed(player.speed);
    this.updateTutorialSignals();

    if (!this.complete && this.timeRemaining <= 0 && player.state !== "airborne") {
      this.finishRun("time");
    }
  }

  updateEntry(dt, input) {
    const player = this.player;
    const t = smoothstep(0, 0.72, player.stateTime);
    player.x = 324 - t * 112;
    player.face = 0.44 + Math.sin(t * Math.PI) * 0.05;
    player.boardAngle = this.wave.slopeAt(player.x, player.face);
    player.bodyAngle = player.boardAngle;
    player.speed = damp(player.speed, this.tuning.speed, 3, dt);
    if (player.stateTime >= 0.72 || input.edgePressed || Math.abs(input.x) + Math.abs(input.y) > 0.45) {
      this.setState("riding");
      this.emit("callout", { text: "FIND THE FAST LINE", tone: "hint" });
    }
  }

  updateRiding(dt, input) {
    const player = this.player;
    const earlyEase = smoothstep(0, this.tuning.entryGrace, this.elapsed);
    const earlyGrip = 1.22 - earlyEase * 0.22;
    const steeringAssist = this.assists.steering ? 1.2 : 1;
    const carveAccel = this.tuning.carveAcceleration * this.board.grip * earlyGrip * steeringAssist;
    const preliminaryPotential = this.querySpeedPotential(input);
    const steeringScale = this.updateRidingManeuvers(dt, input, preliminaryPotential);
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
    const previousWaveMomentum = Number.isFinite(player.waveMomentum)
      ? clamp(player.waveMomentum, 0, 1)
      : 0;
    const momentumResponse = speedPotential.seamDrive > previousWaveMomentum
      ? finiteTuning(this.tuning.waveMomentumBuild, TUNING.waveMomentumBuild)
      : finiteTuning(this.tuning.waveMomentumDecay, TUNING.waveMomentumDecay);
    player.waveMomentum = damp(
      previousWaveMomentum,
      speedPotential.seamDrive,
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

    if (input.edgeReleased && player.charge > 0.12 && player.face > 0.12) {
      const releasedCharge = player.charge;
      const rhythm = 0.58 + Math.min(0.42, Math.abs(player.faceVelocity) * 0.32);
      const lineTiming = 0.22 + speedPotential.pumpEfficiency * 0.98;
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
      this.score.bumpCombo(0.035 * releasedCharge);
      this.emit("pump", {
        strength: releasedCharge,
        efficiency: speedPotential.pumpEfficiency,
        zone: speedPotential.zone,
      });
      player.charge = 0;
    } else if (!input.edge) {
      player.charge = Math.max(0, player.charge - dt * 0.55);
    }

    const downFaceDrive = Math.max(0, player.faceVelocity) * 17;
    const climbCost = Math.max(0, -player.faceVelocity) * 8.5;
    const pocketRisk = Number.isFinite(speedPotential.risk)
      ? speedPotential.risk
      : this.wave.pocketRisk(player.x);
    const targetSpeed = this.tuning.speed * this.board.acceleration + downFaceDrive - climbCost;
    const glideResponse = player.maneuver.id === "floater"
      ? 0.42
      : finiteTuning(this.tuning.rideSpeedResponse, TUNING.rideSpeedResponse);
    player.speed = damp(player.speed, targetSpeed, glideResponse, dt);
    player.speed += this.tuning.wavePush
      * speedPotential.acceleration
      * this.board.acceleration
      * dt;
    player.speed = clamp(player.speed, 34, this.currentRideSpeedCap());

    const lateralTarget = (player.speed - (this.tuning.speed - 4)) * 0.06
      + inputX * (20 + player.speed * 0.045)
      + player.redirectVelocity;
    const lateralResponse = Math.abs(inputX) > 0.02 || Math.abs(player.redirectVelocity) > 0.5
      ? finiteTuning(this.tuning.lateralResponse, TUNING.lateralResponse)
      : finiteTuning(this.tuning.lateralCoast, TUNING.lateralCoast);
    const currentLateralVelocity = Number.isFinite(player.lateralVelocity)
      ? player.lateralVelocity
      : 0;
    player.lateralVelocity = clamp(
      damp(currentLateralVelocity, lateralTarget, lateralResponse, dt),
      -48,
      48,
    );
    player.x += player.lateralVelocity * dt;
    this.constrainRidingX();
    player.redirectVelocity = damp(player.redirectVelocity, 0, 4.2, dt);

    if (previousWaveMomentum < 0.9 && player.waveMomentum >= 0.9) {
      this.emit("fullPower", {
        momentum: player.waveMomentum,
        speed: player.speed,
      });
    }

    const carveLean = inputY * 0.24 + player.faceVelocity * 0.16;
    const horizontalLean = inputX * 0.08;
    const surfaceAngle = this.wave.slopeAt(player.x, player.face);
    player.boardAngle = damp(player.boardAngle, surfaceAngle + carveLean + horizontalLean, 10.5, dt);
    player.bodyAngle = damp(player.bodyAngle, player.boardAngle - carveLean * 0.42, 8.5, dt);
    updateLandingPreview(player, surfaceAngle, this.landingBands(), false);

    const multiplier = this.currentMultiplier();
    this.score.updateRide(
      dt,
      player.speed,
      pocketRisk,
      0.21 + Math.abs(player.faceVelocity) * 0.32,
      multiplier,
      this.scoreScales(),
    );
    if (Math.abs(player.faceVelocity) > SCORE.carveMinVelocity) {
      const carveCallout = this.score.registerCarve(player.faceVelocity, multiplier);
      if (carveCallout) this.emit("callout", { text: carveCallout, tone: "flow" });
    }

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

  launch(input) {
    const player = this.player;
    const sourceManeuver = player.maneuver.id;
    const baseSpeed = this.tuning.speed * this.board.acceleration;
    const hardMaxSpeed = Math.max(baseSpeed, this.tuning.maxSpeed * this.board.maxSpeed);
    const speedRange = Math.max(1, hardMaxSpeed - baseSpeed);
    const speedRatio = clamp((player.speed - baseSpeed) / speedRange, 0, 1);
    const launchMomentum = clamp(
      Number.isFinite(player.waveMomentum) ? player.waveMomentum : 0,
      0,
      1,
    );
    const earnedDrive = Math.min(speedRatio, launchMomentum);
    const launchEnergy = clamp(
      0.72
        + Math.abs(player.faceVelocity) * 0.16
        + player.charge * 0.1
        + earnedDrive * 0.44,
      0.72,
      1.32,
    );
    const launchMultiplier = this.currentMultiplier() * (this.tuning.scoreAir / 1.25);
    const launchRisk = this.wave.pocketRisk(player.x);
    player.airX = player.x;
    player.airY = this.wave.crestY(player.x) - 1;
    player.previousAirX = player.airX;
    player.previousAirY = player.airY;
    player.airVX = (player.speed - 58) * 0.14 + player.lateralVelocity * 0.22 + input.x * 5;
    player.airVY = -this.tuning.launchForce * this.board.launch * launchEnergy;
    player.launchY = player.airY;
    player.maxAirHeight = 0;
    player.rotationAccum = 0;
    player.angularVelocity = input.x * 1.6;
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
    this.setState("airborne");
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
        launchVelocity: player.airVY,
        pocketRisk: launchRisk,
        multiplier: launchMultiplier,
        boardStyle: this.board.style,
        sourceManeuver,
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
      pocketRisk: launchRisk,
      provisionalScore: player.provisionalScore,
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

    player.angularVelocity += input.x * this.tuning.rotationAcceleration * this.board.rotation * dt;
    player.angularVelocity -= player.angularVelocity * this.tuning.angularDrag * dt;
    player.bodyAngle += player.angularVelocity * dt;
    player.rotationAccum += player.angularVelocity * dt;

    const trickEvents = this.aerialSession.update(dt, input, {
      angularVelocity: player.angularVelocity,
      horizontalInput: input.x,
      rotationDirection: Math.sign(player.angularVelocity || input.x) || 1,
      rotationAccumulated: player.rotationAccum,
      maxHeight: player.maxAirHeight,
      apex,
      descending: player.airVY > 12,
    });
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

    player.airVY += this.tuning.gravity * gravityScale * dt;
    player.airVX += input.x * 3.2 * airControl * dt;
    player.airVX *= 1 - dt * 0.09;
    player.airX += player.airVX * dt;
    player.airY += player.airVY * dt;
    player.airX = clamp(player.airX, 58, 350);
    player.landingFace = clamp(player.landingFace + dt * (0.032 + Math.max(0, player.airVX) * 0.002), 0.1, 0.38);
    player.maxAirHeight = Math.max(player.maxAirHeight, player.launchY - player.airY);
    manifest.maxHeight = Math.max(manifest.maxHeight, player.maxAirHeight);
    manifest.rotationAccumulated = player.rotationAccum;

    const targetSlope = this.wave.slopeAt(player.airX, player.landingFace);
    updateLandingPreview(player, targetSlope, this.landingBands(), true);
    const preview = this.score.previewAerial(manifest, {
      boardStyle: this.board.style,
      multiplier: manifest.launchData.multiplier ?? 1,
    });
    this.applyAerialPreview(preview);

    if (apex && !player.apexFired) {
      player.apexFired = true;
      this.emit("apex", { height: player.maxAirHeight });
    }

    const surfaceY = this.wave.ridingY(player.airX, player.landingFace);
    if (player.airVY > 0 && player.airY >= surfaceY - 1) {
      this.resolveLanding(dt, surfaceY);
      return;
    }

    if (player.airY > 224 || player.airX <= this.wave.curlX + 4) {
      this.triggerWipeout("FOAM SNACK!", "air");
    }
  }

  resolveLanding(dt, surfaceY) {
    const player = this.player;
    const surfaceAngle = this.wave.slopeAt(player.airX, player.landingFace);
    const error = Math.abs(shortestAngle(player.boardAngle, surfaceAngle));
    const assistScale = this.assists.landing ? 1.4 : 1;
    const trickRisk = this.aerialSession?.manifest.risk ?? 0;
    const riskScale = 1 - trickRisk * 0.18;
    const tolerance = this.tuning.landingTolerance * this.board.landing * assistScale * riskScale;
    const recoveryLimit = Math.min(this.tuning.wipeoutThreshold, tolerance * 1.7);
    updateLandingPreview(player, surfaceAngle, {
      perfect: this.tuning.perfectTolerance * assistScale,
      clean: tolerance,
      recovery: recoveryLimit,
    }, true);

    if (error <= recoveryLimit) {
      let quality = "wobble";
      if (error <= this.tuning.perfectTolerance * assistScale) quality = "perfect";
      else if (error <= tolerance) quality = "clean";
      this.land(quality, error, surfaceAngle);
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

  land(quality, error, surfaceAngle) {
    const player = this.player;
    const turns = player.rotationAccum / TAU;
    const manifest = this.aerialSession
      ? this.aerialSession.finalizeLanding({
        rotationAccumulated: player.rotationAccum,
        quality,
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

    player.x = player.airX;
    player.face = player.landingFace;
    player.faceVelocity = quality === "wobble" ? 0.16 : 0.08;
    player.lateralVelocity = clamp(
      Number.isFinite(player.airVX) ? player.airVX * 0.55 : 0,
      -48,
      48,
    );
    const preservation = quality === "perfect" ? 1.035 : quality === "clean" ? 0.94 : 0.74;
    player.speed = clamp(player.speed * preservation, 38, this.currentRideSpeedCap());
    player.boardAngle = surfaceAngle;
    player.bodyAngle = surfaceAngle;
    player.compression = quality === "perfect" ? 1 : 0.78;
    player.wobble = quality === "wobble" ? clamp(error, 0.4, 1.2) : 0;
    player.contactTimer = -1;
    player.provisionalScore = 0;
    player.provisionalTrickName = result.trick;
    player.landingQuality = quality;
    player.lastLandingQuality = quality;
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
    });
    this.emit("callout", { text: result.callout, subtext: result.trick, tone: quality });
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
    const lateralTarget = (player.speed - (this.tuning.speed - 4)) * 0.05
      + input.x * (13 + player.speed * 0.02);
    const lateralResponse = Math.abs(input.x) > 0.02
      ? finiteTuning(this.tuning.lateralResponse, TUNING.lateralResponse) * this.board.recovery
      : finiteTuning(this.tuning.lateralCoast, TUNING.lateralCoast);
    const currentLateralVelocity = Number.isFinite(player.lateralVelocity)
      ? player.lateralVelocity
      : 0;
    player.lateralVelocity = clamp(
      damp(currentLateralVelocity, lateralTarget, lateralResponse, dt),
      -48,
      48,
    );
    player.x += player.lateralVelocity * dt;
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

  currentRideSpeedCap(momentum = this.player.waveMomentum) {
    const baseTarget = this.tuning.speed * this.board.acceleration;
    const hardMax = Math.max(baseTarget, this.tuning.maxSpeed * this.board.maxSpeed);
    const headroom = Math.max(
      0,
      finiteTuning(this.tuning.offLineSpeedHeadroom, TUNING.offLineSpeedHeadroom),
    );
    const offLineCap = Math.min(hardMax, baseTarget + headroom);
    const earned = clamp(Number.isFinite(momentum) ? momentum : 0, 0, 1);
    return offLineCap + (hardMax - offLineCap) * earned;
  }

  constrainRidingX() {
    const player = this.player;
    const nextX = clamp(player.x, 76, 338);
    if (nextX !== player.x) {
      const pushingOut = (nextX === 76 && player.lateralVelocity < 0)
        || (nextX === 338 && player.lateralVelocity > 0);
      if (pushingOut) player.lateralVelocity = 0;
      player.x = nextX;
    }
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
      pumpReleased: input.edgeReleased,
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
    if (presses.trick1) this.trySnap(potential);
    if (presses.trick2) this.tryCutback(potential);
    if (presses.trick3) this.tryFloater(potential);

    const tubeEligible = (potential.zone === "critical" || potential.risk >= 0.58)
      && player.face >= 0.16
      && player.face <= 0.76;
    if (input.trick4 && tubeEligible) {
      const id = this.board.id === "moonLog" ? "soulArch" : "tubeTuck";
      if (player.maneuver.id !== id) this.startManeuver(id, 0.8, potential);
      player.maneuverTime += dt;
      player.maneuver.progress = clamp(player.maneuverTime / 0.8, 0, 1);
      this.score.updateTube(dt, potential.risk, this.currentMultiplier());
      player.speed += this.tuning.wavePush * potential.acceleration * 0.08 * dt;
      return 0.46;
    }
    if (presses.trick4 && !tubeEligible) {
      this.rejectManeuver("trick4", "tubeTuck", "FIND POCKET");
    }
    if (!input.trick4 && (player.maneuver.id === "tubeTuck" || player.maneuver.id === "soulArch")) {
      player.maneuver.id = "";
      player.maneuver.progress = 0;
      player.maneuverTime = 0;
    }
    return 1;
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
    player.redirectVelocity = -28;
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

  updateTutorialSignals() {
    if (this.tutorialEnabled === false || this.elapsed > 12 || this.complete) return;
    let text = "";
    if (this.tutorialStage === 0 && this.player.state === "riding" && this.elapsed >= 0.8) {
      text = "CLIMB + HOLD PUMP";
    } else if (this.tutorialStage === 1 && (this.elapsed >= 4 || this.player.face < 0.32)) {
      text = "DROP TO POWER SEAM + RELEASE";
    } else if (this.tutorialStage === 2 && (this.elapsed >= 7 || this.player.state === "lip" || this.player.state === "airborne")) {
      text = "FIND LIP / Q E F T IN AIR";
    }
    if (!text) return;
    this.tutorialStage += 1;
    this.emit("tutorialStep", { index: this.tutorialStage, text });
    this.emit("callout", { text, tone: "hint" });
  }

  updateCurlDanger(dt, risk) {
    const player = this.player;
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
    player.wipeoutCause = cause;
    player.wipeoutSpin = player.angularVelocity || (cause === "curl" ? -5.4 : 4.7);
    player.airX = player.state === "airborne" ? player.airX : player.x;
    player.airY = player.state === "airborne" ? player.airY : this.wave.ridingY(player.x, player.face);
    player.airVX = player.state === "airborne" ? player.airVX : player.lateralVelocity || 9;
    player.airVY = player.state === "airborne" ? player.airVY : -28;
    player.waveMomentum = 0;
    player.lateralVelocity = 0;
    if (this.aerialSession) this.aerialSession.wipeout();
    player.provisionalScore = 0;
    player.provisionalTrickName = "";
    player.landingQuality = "";
    player.trickPose = "neutral";
    player.maneuver.id = "";
    player.maneuver.progress = 0;
    this.wipeouts += 1;
    this.score.wipeout();
    this.comboCueLevel = 1;
    this.setState("wipeout");
    this.emit("wipeout", { cause, count: this.wipeouts });
    this.emit("callout", { text, tone: "wipeout" });
  }

  updateWipeout(dt) {
    const player = this.player;
    player.airVY += this.tuning.gravity * 0.72 * dt;
    player.airX += player.airVX * dt;
    player.airY += player.airVY * dt;
    player.bodyAngle += player.wipeoutSpin * dt;
    player.boardAngle -= player.wipeoutSpin * 0.55 * dt;
    if (player.stateTime < 1.08) return;

    if (this.wipeouts >= this.tuning.maxWipeouts || this.timeRemaining <= 0) {
      this.finishRun(this.wipeouts >= this.tuning.maxWipeouts ? "wipeouts" : "time");
      return;
    }

    const retreat = Math.max(38, this.wave.curlX - 42);
    this.wave.curlX = retreat;
    resetPlayer(player, false, this.tuning.speed);
    this.aerialSession = null;
    player.x = clamp(this.wave.curlX + 122, 160, 282);
    player.face = 0.5;
    player.speed = this.tuning.speed * 0.92;
    this.setState("entry");
    this.emit("respawn", { remaining: this.tuning.maxWipeouts - this.wipeouts });
  }

  finishRun(reason) {
    this.complete = true;
    this.flowRating = Math.round((this.score.flow * 0.55 + Math.min(1, this.score.bestChain / 4.2) * 0.45) * 100);
    const rank = this.score.rank();
    this.player.resultWon = rank.grade !== "D";
    this.player.state = "complete";
    this.emit("complete", {
      reason,
      score: Math.round(this.score.total),
      rank,
      flow: this.flowRating,
      breakdown: { ...this.score.breakdown },
    });
  }

  currentMultiplier() {
    return this.score.multiplier(
      this.wave.pocketRisk(this.player.x),
      this.board.style,
      this.assists.steering || this.assists.landing,
    );
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
    flowTier: "GLIDING",
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
    compression: 0,
    charge: 0,
    lipMemory: 0,
    curlTimer: 0,
    pocketAnnounced: false,
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
    wobble: 0,
    wipeoutCause: "",
    wipeoutSpin: 0,
    lateralVelocity: 0,
    redirectVelocity: 0,
    maneuverCooldown: 0,
    maneuverTime: 0,
    maneuverDuration: 0,
    trickInputLocks: {
      trick1: false,
      trick2: false,
      trick3: false,
      trick4: false,
    },
  };
}

function resetPlayer(player, resetPosition = true, baseSpeed = TUNING.speed) {
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
  player.flowTier = "GLIDING";
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
  player.compression = 0;
  player.charge = 0;
  player.lipMemory = 0;
  player.curlTimer = 0;
  player.pocketAnnounced = false;
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
  player.wobble = 0;
  player.wipeoutCause = "";
  player.wipeoutSpin = 0;
  player.lateralVelocity = 0;
  player.redirectVelocity = 0;
  player.maneuverCooldown = 0;
  player.maneuverTime = 0;
  player.maneuverDuration = 0;
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
    error: 0,
    bands: { perfect: 0, clean: 0, recovery: 0 },
    improving: false,
  };
}

function resetLandingPreview(preview) {
  preview.boardAngle = 0;
  preview.targetAngle = 0;
  preview.error = 0;
  preview.bands.perfect = 0;
  preview.bands.clean = 0;
  preview.bands.recovery = 0;
  preview.improving = false;
}

function updateLandingPreview(player, targetAngle, bands, trackImprovement) {
  const preview = player.landingPreview;
  const nextError = Math.abs(shortestAngle(player.boardAngle, targetAngle));
  preview.improving = Boolean(trackImprovement && nextError + 0.002 < preview.error);
  preview.boardAngle = player.boardAngle;
  preview.targetAngle = targetAngle;
  preview.error = nextError;
  preview.bands.perfect = bands.perfect;
  preview.bands.clean = bands.clean;
  preview.bands.recovery = bands.recovery;
}

function flowTierForSpeed(speed) {
  for (const [threshold, label] of FLOW_TIERS) {
    if (speed < threshold) return label;
  }
  return "MAX FLOW";
}

function finiteOr(value, fallback, min, max) {
  return clamp(Number.isFinite(value) ? value : fallback, min, max);
}

function finiteTuning(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export { EMPTY_INPUT };
