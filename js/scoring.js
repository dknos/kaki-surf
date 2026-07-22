import { SCORE, TUNING } from "./config.js";
import { clamp } from "./math.js";
import {
  createLegacyAerialManifest,
  repeatDecayForEntries,
  scoreAerialManifest,
} from "./trick-scoring.js";

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
      maneuvers: 0,
      air: 0,
      style: 0,
      landings: 0,
    };
    this.bestChain = 1;
    this.flow = 0;
    this.flowPeak = 0;
    this.flowEventHold = 0;
    this.lastCarveSign = 0;
    this.carveCooldown = 0;
    this.provisionalAerial = null;
    this.pendingLaunchPotential = 0;
  }

  multiplier(risk, boardStyle = 1, assists = false) {
    const assistFactor = assists ? 0.82 : 1;
    return clamp(this.combo * (1 + risk * 0.7) * boardStyle * assistFactor, 0.72, 10);
  }

  add(bucket, points, multiplier = 1) {
    const awarded = Math.max(0, points * multiplier);
    if (!Object.hasOwn(this.breakdown, bucket)) this.breakdown[bucket] = 0;
    this.breakdown[bucket] += awarded;
    this.total = this.bucketTotal();
    return awarded;
  }

  bucketTotal() {
    return Object.values(this.breakdown).reduce((total, value) => total + value, 0);
  }

  updateRide(dt, speed, risk, flowScale, multiplier, scales = DEFAULT_SCORE_SCALES) {
    const seconds = Math.max(0, Number(dt) || 0);
    this.add("ride", SCORE.ridePerSecond * seconds, multiplier * 0.35);
    if (speed > SCORE.speedThreshold) {
      this.add("speed", (speed - SCORE.speedThreshold) * seconds * 0.34 * scales.speed, multiplier);
    }
    if (risk > SCORE.pocketStart) {
      const pocket = (risk - SCORE.pocketStart) / (1 - SCORE.pocketStart);
      this.add("pocket", SCORE.pocketMax * pocket * seconds * 30 * scales.pocket, multiplier);
    }

    // Riding a clean line protects recently earned Flow, but never creates it.
    // Flow comes from discrete acts (carves, pumps, tricks, landings), making
    // passive cruising and action-button spam score-neutral.
    const heldSeconds = Math.min(seconds, this.flowEventHold);
    this.flowEventHold = Math.max(0, this.flowEventHold - seconds);
    const decaySeconds = seconds - heldSeconds;
    const scaledActivity = (Number(flowScale) || 0) * (Number(scales.flow) || 0);
    const sustain = clamp(
      (scaledActivity - TUNING.flowLineSustainStart)
        / Math.max(0.001, TUNING.flowLineSustainFull - TUNING.flowLineSustainStart),
      0,
      1,
    );
    const passiveRate = TUNING.flowPassiveDecay
      * (1 - sustain * TUNING.flowLineSustainLimit);
    const stallRate = speed < 52 ? TUNING.flowStallDecay : 0;
    this.addFlow(-decaySeconds * (passiveRate + stallRate));
    this.carveCooldown = Math.max(0, this.carveCooldown - seconds);
  }

  registerCarve(faceVelocity, multiplier) {
    const sign = Math.sign(faceVelocity);
    if (!sign || sign === this.lastCarveSign || this.carveCooldown > 0) return null;
    this.lastCarveSign = sign;
    this.carveCooldown = 0.18;
    this.addFlow(0.08);
    this.add("carves", SCORE.carvePoints, multiplier);
    return sign < 0 ? "HIGH LINE" : "POWER CARVE";
  }

  registerLaunch(heightPotential, multiplier) {
    this.pendingLaunchPotential = Math.max(0, Number(heightPotential) || 0);
    this.provisionalAerial = {
      provisional: (SCORE.launchBase + this.pendingLaunchPotential * 0.18)
        * Math.max(0, Number(multiplier) || 0),
      name: "FLOATY POP",
      signature: "cw:0:air",
    };
    return this.provisionalAerial.provisional;
  }

  beginAerial(manifest, options = {}) {
    return this.previewAerial(manifest, options);
  }

  previewAerial(manifest, { boardStyle = 1, multiplier = 1 } = {}) {
    const firstPass = scoreAerialManifest(manifest, {
      boardStyle,
      multiplier,
      preview: true,
    });
    const decayBase = repeatDecayForEntries(firstPass.entries);
    const repeatFactor = this.repeatFactor(firstPass.signature, decayBase);
    const result = scoreAerialManifest(manifest, {
      boardStyle,
      multiplier,
      repeatFactor,
      preview: true,
    });
    this.provisionalAerial = result;
    return result;
  }

  registerLanding({
    manifest = null,
    turns = 0,
    maxHeight = 0,
    grabbed = false,
    quality = "clean",
    boardStyle = 1,
    multiplier = 1,
  } = {}) {
    const landedManifest = manifest ?? createLegacyAerialManifest({
      turns,
      maxHeight,
      grabbed,
      launchPotential: this.pendingLaunchPotential,
    });
    const firstPass = scoreAerialManifest(landedManifest, {
      quality,
      boardStyle,
      multiplier,
    });
    const decayBase = repeatDecayForEntries(firstPass.entries);
    const decay = this.repeatFactor(firstPass.signature, decayBase);
    const result = scoreAerialManifest(landedManifest, {
      quality,
      boardStyle,
      multiplier,
      repeatFactor: decay,
    });

    this.add("air", result.buckets.air);
    this.add("style", result.buckets.style);
    this.add("landings", result.buckets.landings);

    const landingFlow = quality === "perfect" ? 0.22 : quality === "clean" ? 0.12 : 0.03;
    const completedTricks = result.entries.length;
    const halfTurns = Math.abs(result.rotationDegrees) / 180;
    const trickFlow = Math.min(0.48, completedTricks * 0.105 + halfTurns * 0.028);
    if (quality === "wobble" || quality === "sketchy") {
      this.flow *= 0.55;
    }
    this.addFlow((landingFlow + trickFlow) * (0.4 + decay * 0.6));
    if (decay < 1) this.addFlow(-(1 - decay) * 0.38);

    this.pushHistory(result.signature);
    this.provisionalAerial = null;
    this.pendingLaunchPotential = 0;
    return { ...result, decay, trick: result.name };
  }

  registerManeuver({ points, multiplier = 1, bucket = "maneuvers", combo = 0.07 } = {}) {
    const awarded = this.add(bucket, Math.max(0, Number(points) || 0), multiplier);
    if (awarded > 0) this.addFlow(combo);
    return awarded;
  }

  updateTube(dt, risk, multiplier) {
    const seconds = Math.max(0, Number(dt) || 0);
    const awarded = this.add(
      "style",
      seconds * SCORE.tubeStylePerSecond * (1 + clamp(Number(risk) || 0, 0, 1) * 0.55),
      multiplier,
    );
    if (awarded > 0) this.addFlow(seconds * 0.025);
    return awarded;
  }

  wipeout() {
    this.combo = 1;
    this.comboHeat = 0;
    this.flow *= 0.25;
    this.flowEventHold = 0;
    this.syncCombo();
    this.provisionalAerial = null;
    this.pendingLaunchPotential = 0;
  }

  bumpCombo(amount) {
    return this.addFlow(amount);
  }

  addFlow(amount) {
    const delta = Number(amount) || 0;
    this.flow = clamp(this.flow + delta, 0, 1);
    if (delta > 0) this.flowEventHold = Math.max(this.flowEventHold, TUNING.flowEventHold);
    this.flowPeak = Math.max(this.flowPeak, this.flow);
    this.syncCombo();
    return this.flow;
  }

  registerDirectionChange({ speed = 0, turnForce = 0, switchStance = false } = {}) {
    const speedFactor = clamp((Number(speed) - 42) / 102, 0, 1);
    const force = clamp(Number(turnForce) || 0, 0, 1);
    this.addFlow(0.045 + speedFactor * 0.055 + force * 0.045 + Number(switchStance) * 0.025);
    return this.flow;
  }

  syncCombo() {
    this.comboHeat = this.flow;
    this.combo = clamp(1 + this.flow * (SCORE.comboMax - 1), 1, SCORE.comboMax);
    this.bestChain = Math.max(this.bestChain, this.combo);
  }

  repeatFactor(trick, decay = SCORE.repeatDecay) {
    let repeats = 0;
    for (let offset = 0; offset < REPEAT_WINDOW; offset += 1) {
      const index = (this.historyIndex - 1 - offset + this.history.length) % this.history.length;
      if (this.history[index] === trick) repeats += 1;
    }
    return Math.pow(clamp(decay, 0.05, 1), repeats);
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
