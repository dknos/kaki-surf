import { clamp, smoothstep } from "./math.js";

export class GameplayWave {
  constructor(seed = 0x4b414b49) {
    this.seed = seed;
    this.phaseA = ((seed >>> 4) & 255) / 255 * Math.PI * 2;
    this.phaseB = ((seed >>> 12) & 255) / 255 * Math.PI * 2;
    this.time = 0;
    this.travel = 0;
    this.curlX = 48;
    this.pressure = 0;
  }

  reset() {
    this.time = 0;
    this.travel = 0;
    this.curlX = 48;
    this.pressure = 0;
  }

  update(dt, speed, curlSpeed) {
    this.time += dt;
    this.travel += speed * dt;
    const pulse = Math.sin(this.time * 0.44 + this.phaseB) * 0.22;
    this.curlX += (curlSpeed + pulse) * dt;
    this.pressure = smoothstep(0, 72, this.time);
  }

  crestY(x) {
    const broad = Math.sin(x * 0.015 + this.travel * 0.003 + this.phaseA) * 3.5;
    const detail = Math.sin(x * 0.043 - this.time * 0.62 + this.phaseB) * 1.25;
    return 75 + broad + detail;
  }

  faceDepth(x) {
    return 102 + Math.sin(x * 0.021 + this.phaseB) * 5;
  }

  ridingY(x, face) {
    const easedFace = face * (0.88 + face * 0.12);
    return this.crestY(x) + easedFace * this.faceDepth(x);
  }

  /**
   * Returns the normalized face coordinate of the sustainable power seam.
   * This is the canonical query for both physics and presentation; callers
   * must never recreate the line with a separate visual-only formula.
   */
  powerFaceAt(x) {
    const broad = Math.sin(x * 0.018 + this.phaseA + this.travel * 0.0007) * 0.024;
    const pulse = Math.sin(x * 0.006 - this.time * 0.11 + this.phaseB) * 0.009;
    const pressureLift = (clamp(this.pressure, 0, 1) - 0.5) * 0.022;
    return clamp(0.405 + broad + pulse + pressureLift, 0.31, 0.49);
  }

  /**
   * Side-effect-free description of the acceleration available at a point on
   * the wave. Positive correction means carve down the face (positive input
   * y); negative correction means carve up toward the lip.
   */
  speedPotential(playerX, face, options = {}) {
    const x = Number.isFinite(playerX) ? playerX : 0;
    const currentFace = Number.isFinite(face) ? face : 0.5;
    const targetFace = this.powerFaceAt(x);
    const error = currentFace - targetFace;
    const absoluteError = Math.abs(error);
    const correction = Math.sign(targetFace - currentFace);
    const pocket = this.pocketRisk(x);
    const pressure = clamp(this.pressure, 0, 1);
    const breaking = Boolean(options.breaking ?? this.curlContact(x));

    // A broad enough window to be learned by feel, with a small glassy core.
    const lineQuality = 1 - smoothstep(0.035, 0.27, absoluteError);
    const pocketDrive = 0.34 + smoothstep(0.06, 0.68, pocket) * 0.66;
    const criticalLoss = smoothstep(0.76, 1, pocket) * 0.38;
    const sustainablePocket = clamp(pocketDrive - criticalLoss, 0.24, 1);
    const pressureContribution = 0.78 + pressure * 0.22;
    const breakingContribution = breaking ? 0.72 : 1;

    const board = options.board ?? null;
    const boardPump = clamp(Number(board?.pump ?? 1), 0.65, 1.35);
    const boardAcceleration = clamp(Number(board?.acceleration ?? 1), 0.65, 1.35);
    const pumpCharge = clamp(Number(options.pumpCharge ?? 0), 0, 1);
    const faceVelocity = clamp(Math.abs(Number(options.faceVelocity ?? 0)), 0, 1.5);
    const movementTiming = 0.78 + Math.min(0.22, faceVelocity * 0.2);
    const pumpEfficiency = clamp(
      lineQuality * sustainablePocket * (0.62 + pumpCharge * 0.38) * movementTiming * boardPump,
      0,
      1,
    );
    const pumpContribution = options.pumpReleased
      ? 0.82 + pumpEfficiency * 0.28
      : 1;

    const potential = clamp(
      lineQuality * 0.63 + sustainablePocket * 0.24 + pressure * 0.13,
      0,
      1,
    );
    const acceleration = clamp(
      (0.15 + potential * 1.1)
        * pressureContribution
        * breakingContribution
        * pumpContribution
        * (0.84 + boardAcceleration * 0.16),
      0.15,
      1.25,
    );
    const risk = clamp(
      pocket * 0.78
        + smoothstep(0.72, 1.04, currentFace) * 0.12
        + (breaking ? 0.18 : 0),
      0,
      1,
    );
    const zone = breaking || pocket >= 0.78
      ? "critical"
      : absoluteError <= 0.12 && pocket >= 0.16
        ? "power"
        : "safe";

    return {
      targetFace,
      error,
      correction,
      zone,
      risk,
      pocket,
      pressure,
      breaking,
      lineQuality,
      potential,
      pumpEfficiency,
      acceleration,
      pressureContribution,
      breakingContribution,
    };
  }

  slopeAt(x, face = 0.25) {
    const epsilon = 2;
    return Math.atan2(
      this.ridingY(x + epsilon, face) - this.ridingY(x - epsilon, face),
      epsilon * 2,
    );
  }

  pocketRisk(playerX) {
    const distance = playerX - this.curlX;
    return clamp(1 - (distance - 14) / 126, 0, 1);
  }

  curlContact(playerX) {
    return playerX <= this.curlX + 13;
  }
}
