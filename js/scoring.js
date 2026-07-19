import { SCORE } from "./config.js";
import { clamp } from "./math.js";

const REPEAT_WINDOW = 4;

export class ScoreSystem {
  constructor() {
    this.history = new Array(8).fill("");
    this.reset();
  }

  reset() {
    this.total = 0;
    this.combo = 1;
    this.comboHeat = 0;
    this.history.fill("");
    this.historyIndex = 0;
    this.breakdown = {
      ride: 0,
      speed: 0,
      pocket: 0,
      carves: 0,
      air: 0,
      style: 0,
      landings: 0,
    };
    this.bestChain = 1;
    this.flow = 0;
    this.lastCarveSign = 0;
    this.carveCooldown = 0;
  }

  multiplier(risk, boardStyle = 1, assists = false) {
    const assistFactor = assists ? 0.82 : 1;
    return clamp(this.combo * (1 + risk * 0.7) * boardStyle * assistFactor, 0.72, 6.5);
  }

  add(bucket, points, multiplier = 1) {
    const awarded = Math.max(0, points * multiplier);
    this.total += awarded;
    this.breakdown[bucket] += awarded;
    return awarded;
  }

  updateRide(dt, speed, risk, flowScale, multiplier, scales = DEFAULT_SCORE_SCALES) {
    this.add("ride", SCORE.ridePerSecond * dt, multiplier * 0.35);
    if (speed > SCORE.speedThreshold) {
      this.add("speed", (speed - SCORE.speedThreshold) * dt * 0.34 * scales.speed, multiplier);
    }
    if (risk > SCORE.pocketStart) {
      const pocket = (risk - SCORE.pocketStart) / (1 - SCORE.pocketStart);
      this.add("pocket", SCORE.pocketMax * pocket * dt * 30 * scales.pocket, multiplier);
    }
    this.flow = clamp(this.flow + dt * flowScale * scales.flow - dt * 0.055, 0, 1);
    this.comboHeat = Math.max(0, this.comboHeat - dt * 0.08);
    this.carveCooldown = Math.max(0, this.carveCooldown - dt);
  }

  registerCarve(faceVelocity, multiplier) {
    const sign = Math.sign(faceVelocity);
    if (!sign || sign === this.lastCarveSign || this.carveCooldown > 0) return null;
    this.lastCarveSign = sign;
    this.carveCooldown = 0.18;
    this.bumpCombo(0.08);
    this.add("carves", SCORE.carvePoints, multiplier);
    return sign < 0 ? "HIGH LINE" : "POWER CARVE";
  }

  registerLaunch(heightPotential, multiplier) {
    this.add("air", SCORE.launchBase + heightPotential * 0.18, multiplier);
    this.bumpCombo(0.08);
  }

  registerLanding({ turns, maxHeight, grabbed, quality, boardStyle, multiplier }) {
    const absTurns = Math.abs(turns);
    const halfTurns = Math.floor(absTurns * 2 + 0.16);
    const trick = halfTurns >= 2 ? `${Math.floor(halfTurns / 2)}x PLUSH ROTATION` : halfTurns === 1 ? "PLUSH HALF" : "FLOATY POP";
    const decay = this.repeatFactor(trick);
    let trickPoints = SCORE.airHeightScale * maxHeight;
    if (halfTurns === 1) trickPoints += SCORE.halfRotation;
    if (halfTurns >= 2) trickPoints += SCORE.fullRotation + Math.max(0, halfTurns - 2) * SCORE.extraRotation;
    trickPoints *= decay;
    this.add("air", trickPoints, multiplier * boardStyle);

    if (grabbed) this.add("style", SCORE.grab, multiplier * decay);

    let callout = "CLEAN!";
    if (quality === "perfect") {
      this.add("landings", SCORE.perfectLanding, multiplier);
      this.bumpCombo(0.34);
      callout = halfTurns >= 2 ? "RADICAL!" : "PERFECT!";
    } else if (quality === "clean") {
      this.add("landings", SCORE.cleanLanding, multiplier);
      this.bumpCombo(0.2);
    } else {
      this.add("landings", SCORE.wobbleSave, multiplier * 0.5);
      this.bumpCombo(0.05);
      callout = "WOBBLE SAVE";
    }

    this.pushHistory(trick);
    return { trick, callout, decay };
  }

  wipeout() {
    this.combo = 1;
    this.comboHeat = 0;
    this.flow *= 0.25;
  }

  bumpCombo(amount) {
    this.comboHeat = clamp(this.comboHeat + amount, 0, 1);
    this.combo = clamp(1 + this.comboHeat * 3.2, 1, SCORE.comboMax);
    this.bestChain = Math.max(this.bestChain, this.combo);
  }

  repeatFactor(trick) {
    let repeats = 0;
    for (let offset = 0; offset < REPEAT_WINDOW; offset += 1) {
      const index = (this.historyIndex - 1 - offset + this.history.length) % this.history.length;
      if (this.history[index] === trick) repeats += 1;
    }
    return Math.pow(SCORE.repeatDecay, repeats);
  }

  pushHistory(trick) {
    this.history[this.historyIndex] = trick;
    this.historyIndex = (this.historyIndex + 1) % this.history.length;
  }

  rank() {
    if (this.total >= 16000) return { grade: "S", title: "LEGENDARY PLUSH" };
    if (this.total >= 10500) return { grade: "A", title: "KAKI FLOW" };
    if (this.total >= 6500) return { grade: "B", title: "CURL HUGGER" };
    if (this.total >= 3400) return { grade: "C", title: "SUNNY CARVER" };
    return { grade: "D", title: "DAMP BUT DETERMINED" };
  }
}

const DEFAULT_SCORE_SCALES = Object.freeze({ speed: 1, pocket: 1, flow: 1 });
