import { clamp } from "./math.js";

export const SURF_SCHOOL_STEPS = Object.freeze([
  Object.freeze({
    id: "drop",
    title: "DROP FOR SPEED",
    hint: "DOWN",
  }),
  Object.freeze({
    id: "carve",
    title: "CLIMB WITH CARRIED SPEED",
    hint: "UP",
  }),
  Object.freeze({
    id: "cutback",
    title: "CUT BACK",
    hint: "REVERSE YOUR LINE",
  }),
  Object.freeze({
    id: "launch",
    title: "HIT THE LIP",
    hint: "ACTION AT THE CREST",
  }),
  Object.freeze({
    id: "trick",
    title: "TRICK",
    hint: "F OR X",
  }),
  Object.freeze({
    id: "land",
    title: "MATCH THE LANDING",
    hint: "FOLLOW THE TANGENT",
  }),
]);

const DROP_HOLD = 0.28;
const CARVE_HOLD = 0.24;

/**
 * Renderer-independent first-run lesson. Progress comes from physical state
 * and semantic gameplay events, never from a timer alone.
 */
export class SurfSchool {
  constructor({ enabled = false } = {}) {
    this.reset(enabled);
  }

  reset(enabled = this.enabled) {
    this.enabled = Boolean(enabled);
    this.complete = false;
    this.started = false;
    this.stepIndex = 0;
    this.progress = 0;
    this.dropHold = 0;
    this.carveHold = 0;
    this.launchSeen = false;
    this.trickSeen = false;
    this.landSeen = false;
    this.lastLandingQuality = "";
    this.sequence = 0;
    return this.snapshot();
  }

  setEnabled(enabled) {
    if (!enabled) {
      this.enabled = false;
      return this.snapshot();
    }
    return this.reset(true);
  }

  observe(type, payload = null) {
    if (!this.enabled || this.complete) return;
    if (type === "launch") {
      this.launchSeen = true;
      this.trickSeen = false;
      this.landSeen = false;
      this.lastLandingQuality = "";
    } else if (type === "trickStarted" || type === "trickCompleted") {
      this.trickSeen = true;
    } else if (type === "land") {
      this.landSeen = true;
      this.lastLandingQuality = String(payload?.quality ?? "clean");
    } else if (type === "wipeout" || type === "respawn") {
      this.launchSeen = false;
      this.trickSeen = false;
      this.landSeen = false;
      this.lastLandingQuality = "";
    }
  }

  update(dt, { elapsed = 0, player = null, input = null } = {}) {
    if (!this.enabled || this.complete) return null;
    const seconds = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const state = String(player?.state ?? "");

    if (!this.started) {
      if (elapsed < 0.8 || (state !== "riding" && state !== "lip")) return null;
      this.started = true;
      this.progress = 0;
      return this.stepSignal("start");
    }

    let satisfied = false;
    switch (SURF_SCHOOL_STEPS[this.stepIndex]?.id) {
      case "drop": {
        const active = (Number(input?.y) || 0) >= 0.32
          && (Number(player?.faceVelocity) || 0) >= 0.1
          && (Number(player?.slopeDrive) || 0) >= 0.16
          && (state === "riding" || state === "lip");
        this.dropHold = active
          ? Math.min(DROP_HOLD, this.dropHold + seconds)
          : Math.max(0, this.dropHold - seconds * 1.8);
        this.progress = clamp(this.dropHold / DROP_HOLD, 0, 1);
        satisfied = this.progress >= 1;
        break;
      }
      case "carve": {
        const active = (Number(input?.y) || 0) <= -0.32
          && (Number(player?.faceVelocity) || 0) <= -0.1
          && (state === "riding" || state === "lip");
        this.carveHold = active
          ? Math.min(CARVE_HOLD, this.carveHold + seconds)
          : Math.max(0, this.carveHold - seconds * 1.8);
        this.progress = clamp(this.carveHold / CARVE_HOLD, 0, 1);
        satisfied = this.progress >= 1;
        break;
      }
      case "cutback":
        this.progress = clamp(Number(player?.turnForce) || 0, 0, 1);
        satisfied = (Number(player?.reversalCount) || 0) > 0;
        break;
      case "launch":
        this.progress = this.launchSeen ? 1 : clamp(Number(player?.charge) || 0, 0, 0.92);
        satisfied = this.launchSeen;
        break;
      case "trick":
        this.progress = this.trickSeen ? 1 : 0;
        satisfied = this.trickSeen;
        break;
      case "land":
        this.progress = this.landSeen ? 1 : landingAlignmentProgress(player?.landingPreview);
        satisfied = this.landSeen && ["perfect", "clean", "wobble", "sketchy"].includes(this.lastLandingQuality);
        break;
      default:
        break;
    }

    if (!satisfied) return null;
    const completedStep = SURF_SCHOOL_STEPS[this.stepIndex];
    this.stepIndex += 1;
    this.progress = 0;
    this.sequence += 1;

    if (this.stepIndex >= SURF_SCHOOL_STEPS.length) {
      this.complete = true;
      return {
        type: "tutorialComplete",
        payload: {
          completed: completedStep.id,
          total: SURF_SCHOOL_STEPS.length,
          sequence: this.sequence,
        },
      };
    }
    return this.stepSignal("advance", completedStep.id);
  }

  stepSignal(reason, completed = "") {
    const step = SURF_SCHOOL_STEPS[this.stepIndex];
    return {
      type: "tutorialStep",
      payload: {
        index: this.stepIndex + 1,
        total: SURF_SCHOOL_STEPS.length,
        id: step.id,
        text: step.title,
        hint: step.hint,
        reason,
        completed,
        sequence: this.sequence,
      },
    };
  }

  snapshot() {
    const step = SURF_SCHOOL_STEPS[this.stepIndex] ?? null;
    return {
      enabled: this.enabled,
      complete: this.complete,
      started: this.started,
      index: step ? this.stepIndex + 1 : SURF_SCHOOL_STEPS.length,
      total: SURF_SCHOOL_STEPS.length,
      id: step?.id ?? "complete",
      text: step?.title ?? "SURF SCHOOL CLEAR",
      hint: step?.hint ?? "GO MAKE IT WEIRD",
      progress: clamp(this.progress, 0, 1),
      sequence: this.sequence,
    };
  }
}

function landingAlignmentProgress(preview) {
  const error = Number(preview?.error);
  const recovery = Number(preview?.bands?.recovery);
  if (!Number.isFinite(error) || !Number.isFinite(recovery) || recovery <= 0) return 0;
  return clamp(1 - error / recovery, 0, 0.92);
}
