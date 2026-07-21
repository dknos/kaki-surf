import { clamp, shortestAngle, TAU } from "./math.js";
import {
  getBoardSpecialty,
  getTrickDefinition,
  TRICK_ACTIONS,
  TRICK_IDS,
  trickIdForAction,
} from "./trick-catalog.js";

const ACTION_FIELDS = Object.freeze(TRICK_ACTIONS.map((action) => Object.freeze({
  action,
  pressed: `${action}Pressed`,
  released: `${action}Released`,
})));

export function normalizeTrickInput(input = {}, target = {}) {
  target.x = Number.isFinite(input.x) ? input.x : 0;
  target.y = Number.isFinite(input.y) ? input.y : 0;
  target.edge = Boolean(input.edge || input.action);
  target.edgePressed = Boolean(input.edgePressed || input.actionPressed);
  target.edgeReleased = Boolean(input.edgeReleased || input.actionReleased);

  for (const action of ["turbo", "trick", "special", "spinLeft", "spinRight"]) {
    target[action] = Boolean(input[action]);
    target[`${action}Pressed`] = Boolean(input[`${action}Pressed`]);
    target[`${action}Released`] = Boolean(input[`${action}Released`]);
  }

  for (const fields of ACTION_FIELDS) {
    const legacy = fields.action === "trick1";
    target[fields.action] = Boolean(input[fields.action] || (legacy && input.style));
    target[fields.pressed] = Boolean(input[fields.pressed] || (legacy && input.stylePressed));
    target[fields.released] = Boolean(input[fields.released] || (legacy && input.styleReleased));
  }
  return target;
}

function heldDurationRecord() {
  return Object.fromEntries(TRICK_IDS.map((id) => [id, 0]));
}

function inputLockRecord() {
  return Object.fromEntries(TRICK_ACTIONS.map((action) => [action, false]));
}

function completionFor(entry) {
  return clamp(entry.elapsed / Math.max(0.001, entry.entryDuration), 0, 1);
}

function posePriority(id) {
  if (id === "kakiTwist") return 4;
  if (id === "tailGrab") return 3;
  if (id === "frontRailGrab") return 2;
  if (id === "boardVarial") return 1;
  return 0;
}

/**
 * Owns all renderer-independent truth for one launch. The public manifest is
 * intentionally plain data so renderers, replays, and tests can consume it.
 */
export class AerialTrickSession {
  constructor({ launchData = {}, boardId = "foamPuff" } = {}) {
    this.boardId = boardId;
    this.elapsed = 0;
    this.active = [];
    this.inputLocks = inputLockRecord();
    this.finalized = false;
    this.manifest = {
      version: 1,
      sequence: [],
      heldDurations: heldDurationRecord(),
      completion: 0,
      poseProgress: 0,
      trickPose: "neutral",
      boardRelativeRotation: 0,
      bodyPose: 0,
      risk: 0,
      repetitionSignature: "",
      rotationAccumulated: 0,
      rotationDegrees: 0,
      launchData: { ...launchData, boardId },
      maxHeight: 0,
      airtime: 0,
      landed: false,
      landingQuality: "",
      takeoffDirection: Math.sign(launchData.takeoffDirection) || 1,
      landingDirection: Math.sign(launchData.takeoffDirection) || 1,
      switchTakeoff: Boolean(launchData.switchTakeoff),
      switchLanding: false,
      invalidBoardOrientation: false,
      provisionalScore: 0,
      provisionalTrickName: "FLOATY POP",
      wipedOut: false,
    };
  }

  primeInput(input = {}) {
    const normalized = normalizeTrickInput(input);
    for (const fields of ACTION_FIELDS) {
      this.inputLocks[fields.action] = Boolean(
        normalized[fields.action] || normalized[fields.pressed],
      );
    }
  }

  update(dt, input = {}, context = {}) {
    if (this.finalized) return [];
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    const normalized = normalizeTrickInput(input);
    const events = [];
    this.elapsed += step;
    this.manifest.airtime = this.elapsed;
    this.manifest.maxHeight = Math.max(
      this.manifest.maxHeight,
      Number.isFinite(context.maxHeight) ? context.maxHeight : 0,
    );
    if (Number.isFinite(context.rotationAccumulated)) {
      this.manifest.rotationAccumulated = context.rotationAccumulated;
    }

    for (const fields of ACTION_FIELDS) {
      const signaled = normalized[fields.action] || normalized[fields.pressed];
      if (signaled && !this.inputLocks[fields.action]) {
        this.inputLocks[fields.action] = true;
        const event = this.tryStart(trickIdForAction(fields.action), context);
        if (event) events.push(event);
      }
      if (!signaled) {
        this.inputLocks[fields.action] = false;
      }
    }

    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const entry = this.active[index];
      const definition = getTrickDefinition(entry.id);
      entry.elapsed = this.elapsed - entry.startTime;
      entry.poseProgress = completionFor(entry);

      if (definition.hold) {
        const held = normalized[definition.action];
        if (held) {
          entry.heldDuration += step;
          this.manifest.heldDurations[entry.id] += step;
          if (context.apex) entry.heldThroughApex = true;
          if (context.descending) entry.lateHoldDuration += step;
        }
        entry.completion = entry.poseProgress;
        if (entry.poseProgress >= 1) entry.complete = true;
        this.updateEntryMotion(entry, definition);
        if (!held && (normalized[`${definition.action}Released`] || entry.elapsed > step)) {
          this.finishEntry(entry, index);
          events.push({
            type: entry.complete ? "trickCompleted" : "trickRejected",
            id: entry.id,
            hint: entry.complete ? "" : "HOLD IT",
          });
        }
        continue;
      }

      entry.completion = entry.poseProgress;
      this.updateEntryMotion(entry, definition);
      const enoughAir = this.elapsed >= definition.minAirtime;
      if (entry.poseProgress >= definition.completionThreshold && enoughAir) {
        entry.complete = true;
        entry.completion = 1;
        entry.poseProgress = 1;
        this.updateEntryMotion(entry, definition);
        this.finishEntry(entry, index);
        events.push({ type: "trickCompleted", id: entry.id, hint: "" });
      }
    }

    this.updateAggregate();
    return events;
  }

  tryStart(id, context = {}) {
    const definition = getTrickDefinition(id);
    if (!definition) return null;
    if (this.manifest.sequence.some((entry) => entry.id === id)) {
      return { type: "trickRejected", id, hint: "CHAIN ANOTHER" };
    }
    if (this.elapsed < definition.minStartAirtime) {
      return { type: "trickRejected", id, hint: "WAIT FOR AIR" };
    }
    if (this.manifest.maxHeight < definition.minHeight) {
      return { type: "trickRejected", id, hint: "NEED MORE POP" };
    }

    if (definition.category === "grab") {
      for (let index = this.active.length - 1; index >= 0; index -= 1) {
        const activeDefinition = getTrickDefinition(this.active[index].id);
        if (activeDefinition.category === "grab") this.finishEntry(this.active[index], index);
      }
    }

    const specialty = getBoardSpecialty(definition, this.boardId);
    const direction = Math.sign(
      context.rotationDirection
      ?? context.angularVelocity
      ?? context.horizontalInput
      ?? 1,
    ) || 1;
    const entry = {
      id: definition.id,
      action: definition.action,
      category: definition.category,
      startTime: this.elapsed,
      endTime: null,
      elapsed: 0,
      heldDuration: 0,
      heldThroughApex: false,
      lateHoldDuration: 0,
      completion: 0,
      poseProgress: 0,
      boardRelativeRotation: 0,
      bodyPose: 0,
      risk: definition.risk * specialty.riskMultiplier,
      baseScore: definition.baseScore * specialty.scoreMultiplier,
      repetitionSignature: "",
      complete: false,
      landed: false,
      invalidBoardOrientation: false,
      direction,
      entryDuration: definition.entryDuration * specialty.entryMultiplier,
      boardMotionMultiplier: specialty.boardMotionMultiplier,
      trimMultiplier: (definition.trimMultiplier ?? 1) * specialty.trimMultiplier,
      signatureVariant: specialty.signatureVariant ?? "",
    };
    this.manifest.sequence.push(entry);
    this.active.push(entry);
    this.updateAggregate();
    return { type: "trickStarted", id, hint: "" };
  }

  updateEntryMotion(entry, definition) {
    const progress = clamp(entry.poseProgress, 0, 1);
    const motionProgress = Math.pow(progress, 1 / Math.max(0.2, entry.boardMotionMultiplier));
    if (definition.id === "boardVarial") {
      entry.boardRelativeRotation = directionOrOne(entry.direction)
        * definition.boardTurns
        * TAU
        * motionProgress;
      entry.bodyPose = Math.sin(progress * Math.PI) * 0.2;
      return;
    }
    if (definition.id === "kakiTwist") {
      const arc = Math.sin(progress * Math.PI);
      entry.boardRelativeRotation = definition.boardCounterRotation
        * entry.boardMotionMultiplier
        * directionOrOne(entry.direction)
        * arc;
      entry.bodyPose = definition.bodyPose * directionOrOne(entry.direction) * arc;
      return;
    }
    entry.boardRelativeRotation = 0;
    entry.bodyPose = definition.bodyPose * progress;
  }

  finishEntry(entry, activeIndex) {
    entry.endTime = this.elapsed;
    if (activeIndex >= 0) this.active.splice(activeIndex, 1);
  }

  updateAggregate() {
    let boardRelativeRotation = 0;
    let bodyPose = 0;
    let risk = 0;
    let completed = 0;
    let pose = "neutral";
    let poseProgress = 0;
    let priority = 0;

    for (const entry of this.manifest.sequence) {
      boardRelativeRotation += entry.boardRelativeRotation;
      risk += entry.risk * Math.max(0.25, entry.poseProgress);
      risk += entry.lateHoldDuration * (getTrickDefinition(entry.id).lateHoldRiskRate ?? 0);
      if (entry.complete) completed += 1;
    }
    for (const entry of this.active) {
      bodyPose += entry.bodyPose;
      const candidatePriority = posePriority(entry.id);
      if (candidatePriority >= priority) {
        priority = candidatePriority;
        pose = entry.id;
        poseProgress = entry.poseProgress;
      }
    }

    this.manifest.boardRelativeRotation = boardRelativeRotation;
    this.manifest.bodyPose = bodyPose;
    this.manifest.risk = clamp(risk, 0, 1);
    this.manifest.trickPose = pose;
    this.manifest.poseProgress = poseProgress;
    this.manifest.completion = this.manifest.sequence.length
      ? completed / this.manifest.sequence.length
      : 0;
  }

  trimSensitivity() {
    let sensitivity = 1;
    for (const entry of this.active) sensitivity *= entry.trimMultiplier;
    return clamp(sensitivity, 0.7, 1.75);
  }

  finalizeLanding({
    rotationAccumulated = 0,
    quality = "clean",
    landingDirection = this.manifest.takeoffDirection,
    switchLanding = false,
  } = {}) {
    if (this.finalized) return this.manifest;
    this.manifest.rotationAccumulated = rotationAccumulated;
    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const entry = this.active[index];
      const definition = getTrickDefinition(entry.id);
      entry.elapsed = this.elapsed - entry.startTime;
      entry.poseProgress = completionFor(entry);
      entry.completion = entry.poseProgress;
      if (definition.hold && entry.poseProgress >= 1) entry.complete = true;
      if (definition.discrete) {
        entry.complete = entry.poseProgress >= definition.completionThreshold
          && this.elapsed >= definition.minAirtime;
      }
      this.updateEntryMotion(entry, definition);
      this.finishEntry(entry, index);
    }
    this.updateAggregate();
    const orientationError = Math.abs(shortestAngle(this.manifest.boardRelativeRotation, 0));
    this.manifest.invalidBoardOrientation = orientationError > 0.34;
    this.manifest.landed = true;
    this.manifest.landingQuality = quality;
    this.manifest.landingDirection = Math.sign(landingDirection) || this.manifest.takeoffDirection;
    this.manifest.switchLanding = Boolean(switchLanding);
    for (const entry of this.manifest.sequence) {
      entry.landed = true;
      entry.invalidBoardOrientation = !entry.complete
        && Math.abs(shortestAngle(entry.boardRelativeRotation, 0)) > 0.34;
    }
    this.finalized = true;
    return this.manifest;
  }

  wipeout() {
    if (!this.finalized) {
      for (let index = this.active.length - 1; index >= 0; index -= 1) {
        this.finishEntry(this.active[index], index);
      }
      this.updateAggregate();
    }
    this.manifest.landed = false;
    this.manifest.wipedOut = true;
    this.manifest.provisionalScore = 0;
    this.manifest.provisionalTrickName = "";
    for (const entry of this.manifest.sequence) entry.landed = false;
    this.finalized = true;
    return this.manifest;
  }
}

function directionOrOne(value) {
  return Math.sign(value) || 1;
}

export function createAerialSession(options) {
  return new AerialTrickSession(options);
}
