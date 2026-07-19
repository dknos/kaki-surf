import { BOARDS, FIXED_STEP, SCORE, TUNING } from "./config.js";
import { clamp, damp, shortestAngle, smoothstep, TAU } from "./math.js";
import { ScoreSystem } from "./scoring.js";
import { GameplayWave } from "./wave.js";

const EMPTY_INPUT = Object.freeze({
  x: 0,
  y: 0,
  edge: false,
  edgePressed: false,
  edgeReleased: false,
  style: false,
  stylePressed: false,
});

export class SurfSimulation {
  constructor({ seed = 0x4b414b49, tuning = TUNING } = {}) {
    this.tuning = tuning;
    this.wave = new GameplayWave(seed);
    this.score = new ScoreSystem();
    this.events = new Array(24);
    this.eventCount = 0;
    this._scoreScales = { speed: 1, pocket: 1, flow: 1 };
    this.assists = { steering: false, landing: false };
    this.board = BOARDS.foamPuff;
    this.player = createPlayer();
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
    this.elapsed = 0;
    this.timeRemaining = this.tuning.runDuration;
    this.wipeouts = 0;
    this.complete = false;
    this.started = false;
    this.flowRating = 0;
    this.eventCount = 0;
    resetPlayer(this.player);
    this.emit("state", { state: "entry" });
  }

  begin() {
    this.started = true;
  }

  update(dt = FIXED_STEP, input = EMPTY_INPUT) {
    if (!this.started || this.complete) return;

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
    const inputY = Math.abs(input.y) < 0.02 ? 0 : input.y;
    const inputX = Math.abs(input.x) < 0.02 ? 0 : input.x;

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

    if (input.edge) {
      player.charge = clamp(player.charge + this.tuning.pumpChargeRate * dt, 0, 1);
      player.compression = damp(player.compression, 1, 14, dt);
    } else {
      player.compression = damp(player.compression, 0, 10, dt);
    }

    if (input.edgeReleased && player.charge > 0.12 && player.face > 0.12) {
      const rhythm = 0.58 + Math.min(0.42, Math.abs(player.faceVelocity) * 0.32);
      const boost = this.tuning.pumpStrength * this.board.pump * player.charge * rhythm;
      player.speed += boost;
      this.score.bumpCombo(0.035 * player.charge);
      this.emit("pump", { strength: player.charge });
      player.charge = 0;
    } else if (!input.edge) {
      player.charge = Math.max(0, player.charge - dt * 0.55);
    }

    const downFaceDrive = Math.max(0, player.faceVelocity) * 17;
    const climbCost = Math.max(0, -player.faceVelocity) * 8.5;
    const pocketRisk = this.wave.pocketRisk(player.x);
    const powerZone = 0.54 + (1 - Math.abs(player.face - 0.42)) * 0.38;
    const targetSpeed = this.tuning.speed * this.board.acceleration + downFaceDrive - climbCost;
    player.speed = damp(player.speed, targetSpeed, 1.38, dt);
    player.speed += this.tuning.wavePush * powerZone * (0.82 + pocketRisk * 0.2) * dt;
    player.speed = clamp(player.speed, 34, this.tuning.maxSpeed * this.board.maxSpeed);

    const lateralDrive = (player.speed - 69) * 0.052 + inputX * (18 + player.speed * 0.035);
    player.x += lateralDrive * dt;
    player.x = clamp(player.x, 76, 338);

    const carveLean = inputY * 0.24 + player.faceVelocity * 0.16;
    const horizontalLean = inputX * 0.08;
    const surfaceAngle = this.wave.slopeAt(player.x, player.face);
    player.boardAngle = damp(player.boardAngle, surfaceAngle + carveLean + horizontalLean, 10.5, dt);
    player.bodyAngle = damp(player.bodyAngle, player.boardAngle - carveLean * 0.42, 8.5, dt);

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
    const launchEnergy = clamp(0.72 + Math.abs(player.faceVelocity) * 0.2 + player.charge * 0.3, 0.72, 1.28);
    player.airX = player.x;
    player.airY = this.wave.crestY(player.x) - 1;
    player.previousAirX = player.airX;
    player.previousAirY = player.airY;
    player.airVX = (player.speed - 62) * 0.115 + input.x * 7;
    player.airVY = -this.tuning.launchForce * this.board.launch * launchEnergy;
    player.launchY = player.airY;
    player.maxAirHeight = 0;
    player.rotationAccum = 0;
    player.angularVelocity = input.x * 1.6;
    player.bodyAngle = player.boardAngle;
    player.landingFace = clamp(0.12 + Math.max(0, player.face) * 0.25, 0.1, 0.24);
    player.grabbed = false;
    player.contactTimer = -1;
    player.charge = 0;
    this.setState("airborne");
    const potential = Math.max(0, -player.airVY - 70);
    this.score.registerLaunch(potential, this.currentMultiplier() * (this.tuning.scoreAir / 1.25));
    this.emit("launch", { strength: launchEnergy });
  }

  updateAirborne(dt, input) {
    const player = this.player;
    const airControl = this.tuning.airControl * this.board.airControl;
    const apex = Math.abs(player.airVY) < 14;
    const gravityScale = apex ? 0.42 : 1;

    player.angularVelocity += input.x * this.tuning.rotationAcceleration * this.board.rotation * dt;
    player.angularVelocity -= player.angularVelocity * this.tuning.angularDrag * dt;
    player.bodyAngle += player.angularVelocity * dt;
    player.rotationAccum += player.angularVelocity * dt;
    const trim = input.y * 0.5 * airControl;
    player.boardAngle = damp(player.boardAngle, player.bodyAngle + trim, 8.5 * airControl, dt);
    player.grabbed ||= input.style && player.stateTime > 0.16;

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
    const tolerance = this.tuning.landingTolerance * this.board.landing * assistScale;
    const recoveryLimit = Math.min(this.tuning.wipeoutThreshold, tolerance * 1.7);

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
    const result = this.score.registerLanding({
      turns,
      maxHeight: player.maxAirHeight,
      grabbed: player.grabbed,
      quality,
      boardStyle: this.board.style,
      multiplier: this.currentMultiplier() * (this.tuning.scoreAir / 1.25),
    });

    player.x = player.airX;
    player.face = player.landingFace;
    player.faceVelocity = quality === "wobble" ? 0.16 : 0.08;
    const preservation = quality === "perfect" ? 1.035 : quality === "clean" ? 0.94 : 0.74;
    player.speed = clamp(player.speed * preservation, 38, this.tuning.maxSpeed * this.board.maxSpeed);
    player.boardAngle = surfaceAngle;
    player.bodyAngle = surfaceAngle;
    player.compression = quality === "perfect" ? 1 : 0.78;
    player.wobble = quality === "wobble" ? clamp(error, 0.4, 1.2) : 0;
    player.contactTimer = -1;
    this.setState(quality === "wobble" ? "wobble" : "landing");
    this.emit("land", { quality, error, turns, grabbed: player.grabbed });
    this.emit("callout", { text: result.callout, subtext: result.trick, tone: quality });
  }

  updateRecovery(dt, input) {
    const player = this.player;
    const surfaceAngle = this.wave.slopeAt(player.x, player.face);
    const duration = player.state === "wobble" ? 0.48 / this.board.recovery : 0.24;
    const correction = input.y * 0.18 + input.x * 0.08;
    player.boardAngle = damp(player.boardAngle, surfaceAngle + correction, 10 * this.board.recovery, dt);
    player.bodyAngle = surfaceAngle + Math.sin(player.stateTime * 28) * player.wobble * (1 - player.stateTime / duration) * 0.18;
    player.compression = damp(player.compression, 0, 8, dt);
    player.speed = Math.max(36, player.speed - (player.state === "wobble" ? 8 : -2) * dt);
    player.x = clamp(player.x + (player.speed - 70) * 0.035 * dt + input.x * 11 * dt, 76, 338);
    const pocketRisk = this.wave.pocketRisk(player.x);
    this.score.updateRide(dt, player.speed, pocketRisk, 0.12, this.currentMultiplier(), this.scoreScales());
    this.updateCurlDanger(dt, pocketRisk);
    if (player.stateTime >= duration) {
      player.wobble = 0;
      this.setState("riding");
    }
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
    player.airVX = player.state === "airborne" ? player.airVX : 9;
    player.airVY = player.state === "airborne" ? player.airVY : -28;
    this.wipeouts += 1;
    this.score.wipeout();
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
    resetPlayer(player, false);
    player.x = clamp(this.wave.curlX + 122, 160, 282);
    player.face = 0.5;
    player.speed = this.tuning.speed * 0.92;
    this.setState("entry");
    this.emit("respawn", { remaining: this.tuning.maxWipeouts - this.wipeouts });
  }

  finishRun(reason) {
    this.complete = true;
    this.flowRating = Math.round((this.score.flow * 0.55 + Math.min(1, this.score.bestChain / 4.2) * 0.45) * 100);
    this.player.state = "complete";
    this.emit("complete", {
      reason,
      score: Math.round(this.score.total),
      rank: this.score.rank(),
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
    speed: 72,
    boardAngle: 0,
    bodyAngle: 0,
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
  };
}

function resetPlayer(player, resetPosition = true) {
  player.state = "entry";
  player.stateTime = 0;
  if (resetPosition) {
    player.x = 212;
    player.face = 0.48;
  }
  player.previousX = player.x;
  player.previousFace = player.face;
  player.faceVelocity = 0;
  player.speed = 72;
  player.boardAngle = 0;
  player.bodyAngle = 0;
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
}

export { EMPTY_INPUT };
