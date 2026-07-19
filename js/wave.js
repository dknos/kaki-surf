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
