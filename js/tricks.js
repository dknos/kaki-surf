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
  pressOrder: `${action}PressOrder`,
  released: `${action}Released`,
})));

const DEFAULT_ELIGIBILITY_BUFFER = 0.35;
const DEFAULT_QUICK_GRAB_MINIMUM = 0.18;
const TRANSIENT_REJECTION_HINTS = new Set(["WAIT FOR AIR", "NEED MORE POP"]);

export function isTransientTrickRejection(event) {
  return event?.type === "trickRejected"
    && TRANSIENT_REJECTION_HINTS.has(event.hint);
}

/**
 * Ordered, renderer-free intent storage shared by the pre-takeoff Simple
 * grammar and the in-air Advanced grammar. Records leave `queue` exactly once
 * and remain inspectable in the bounded history for deterministic QA.
 */
export class TrickIntentBuffer {
  constructor() {
    this.queue = [];
    this.history = [];
    this.inputLocks = {};
    this.nextOrder = 1;
  }

  enqueue({
    action = "",
    id = "",
    held = false,
    released = false,
    x = 0,
    y = 0,
    duration = DEFAULT_ELIGIBILITY_BUFFER,
    queuedBeforeLaunch = false,
    source = "advanced",
    queuedEmitted = false,
    creditHoldDuration = 0,
    syntheticHoldMinimum = 0,
    inputOrder = 0,
  } = {}) {
    if (!action && !id) return null;
    const bufferDuration = Math.max(0, Number.isFinite(duration)
      ? duration
      : DEFAULT_ELIGIBILITY_BUFFER);
    const intent = {
      action,
      id,
      order: this.nextOrder,
      inputOrder: Math.max(0, Number(inputOrder) || 0),
      held: Boolean(held),
      released: Boolean(released),
      heldDuration: 0,
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
      remaining: bufferDuration,
      duration: bufferDuration,
      consumed: false,
      queuedBeforeLaunch: Boolean(queuedBeforeLaunch),
      source,
      queuedEmitted: Boolean(queuedEmitted),
      creditHoldDuration: Math.max(0, Number(creditHoldDuration) || 0),
      syntheticHoldMinimum: Math.max(0, Number(syntheticHoldMinimum) || 0),
      lastTransientHint: "",
      outcome: "",
    };
    this.nextOrder += 1;
    this.queue.push(intent);
    return intent;
  }

  captureAction(action, input = {}, {
    duration = DEFAULT_ELIGIBILITY_BUFFER,
    queuedBeforeLaunch = false,
    source = "advanced",
  } = {}) {
    const held = Boolean(input[action]);
    const pressed = Boolean(input[`${action}Pressed`]);
    const released = Boolean(input[`${action}Released`]);
    const signaled = held || pressed;
    let created = null;

    if (signaled && !this.inputLocks[action]) {
      this.inputLocks[action] = true;
      created = this.enqueue({
        action,
        held,
        released,
        x: input.x,
        y: input.y,
        duration,
        queuedBeforeLaunch,
        source,
        inputOrder: input[`${action}PressOrder`],
      });
    }

    const pending = created ?? this.latestForAction(action);
    if (pending) {
      if (held) pending.held = true;
      if (released) {
        pending.held = false;
        pending.released = true;
      }
    }
    if (!held) this.inputLocks[action] = false;
    return created;
  }

  latestForAction(action) {
    for (let index = this.queue.length - 1; index >= 0; index -= 1) {
      const intent = this.queue[index];
      if (!intent.consumed && intent.action === action) return intent;
    }
    return null;
  }

  get(order) {
    return this.queue.find((intent) => intent.order === order) ?? null;
  }

  setIdentity(intent, { action = intent?.action, id = intent?.id } = {}) {
    if (!intent || intent.consumed) return null;
    intent.action = action;
    intent.id = id;
    return intent;
  }

  advanceHeld(dt, predicate = null) {
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    for (const intent of this.queue) {
      if (intent.consumed || !intent.held || (predicate && !predicate(intent))) continue;
      intent.heldDuration += step;
    }
  }

  advanceTime(dt, predicate = null) {
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    const expired = [];
    for (const intent of [...this.queue]) {
      if (intent.consumed || (predicate && !predicate(intent))) continue;
      intent.remaining = Math.max(0, intent.remaining - step);
      if (intent.remaining <= 0) {
        this.consume(intent, "expired");
        expired.push(intent);
      }
    }
    return expired;
  }

  consume(intent, outcome = "consumed") {
    if (!intent || intent.consumed) return null;
    intent.consumed = true;
    intent.outcome = outcome;
    const index = this.queue.indexOf(intent);
    if (index >= 0) this.queue.splice(index, 1);
    this.history.push(intent);
    if (this.history.length > 32) this.history.splice(0, this.history.length - 32);
    return intent;
  }

  clear(predicate = null, outcome = "cleared", resetLocks = false) {
    for (const intent of [...this.queue]) {
      if (!predicate || predicate(intent)) this.consume(intent, outcome);
    }
    if (resetLocks) {
      for (const action of Object.keys(this.inputLocks)) this.inputLocks[action] = false;
    }
  }

  reset() {
    this.queue.length = 0;
    this.history.length = 0;
    this.nextOrder = 1;
    for (const action of Object.keys(this.inputLocks)) this.inputLocks[action] = false;
  }
}

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
  target.trickPressOrder = Math.max(0, Number(input.trickPressOrder) || 0);

  for (const fields of ACTION_FIELDS) {
    const legacy = fields.action === "trick1";
    target[fields.action] = Boolean(input[fields.action] || (legacy && input.style));
    target[fields.pressed] = Boolean(input[fields.pressed] || (legacy && input.stylePressed));
    target[fields.pressOrder] = Math.max(
      0,
      Number(input[fields.pressOrder] || (legacy && input.stylePressOrder)) || 0,
    );
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
  constructor({
    launchData = {},
    boardId = "foamPuff",
    intentBuffer = null,
    eligibilityBuffer = DEFAULT_ELIGIBILITY_BUFFER,
    quickGrabMinimum = DEFAULT_QUICK_GRAB_MINIMUM,
  } = {}) {
    this.boardId = boardId;
    this.elapsed = 0;
    this.active = [];
    this.intentBuffer = intentBuffer ?? new TrickIntentBuffer();
    this.inputLocks = this.intentBuffer.inputLocks;
    for (const [action, unlocked] of Object.entries(inputLockRecord())) {
      if (!(action in this.inputLocks)) this.inputLocks[action] = unlocked;
    }
    this.eligibilityBuffer = Math.max(
      0,
      Number.isFinite(eligibilityBuffer) ? eligibilityBuffer : DEFAULT_ELIGIBILITY_BUFFER,
    );
    this.quickGrabMinimum = Math.max(
      0,
      Number.isFinite(quickGrabMinimum) ? quickGrabMinimum : DEFAULT_QUICK_GRAB_MINIMUM,
    );
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

  update(dt, input = {}, context = {}, { captureIntents = true } = {}) {
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

    if (captureIntents) {
      let orderedFields = ACTION_FIELDS;
      if (ACTION_FIELDS.some((fields) => normalized[fields.pressOrder] > 0)) {
        orderedFields = ACTION_FIELDS.slice().sort((left, right) => {
          const leftOrder = normalized[left.pressOrder] || Number.MAX_SAFE_INTEGER;
          const rightOrder = normalized[right.pressOrder] || Number.MAX_SAFE_INTEGER;
          return leftOrder - rightOrder;
        });
      }
      for (const fields of orderedFields) {
        const intent = this.intentBuffer.captureAction(fields.action, normalized, {
          duration: this.eligibilityBuffer,
          queuedBeforeLaunch: false,
          source: "advanced",
        });
        if (intent) {
          intent.id = trickIdForAction(fields.action);
          intent.queuedEmitted = true;
          events.push({
            type: "trickQueued",
            id: intent.id,
            action: intent.action,
            order: intent.order,
            hint: "QUEUED",
          });
        }
      }
    }
    // Simple's one-button classifier owns its pre-recognition hold clock so
    // the same fixed step cannot be credited twice after launch.
    this.intentBuffer.advanceHeld(step, (intent) => intent.source !== "simple");

    const nextIntent = this.intentBuffer.queue[0];
    if (nextIntent?.id) {
      const event = this.tryStart(nextIntent.id, {
        ...context,
        horizontalInput: nextIntent.x,
      });
      if (event?.type === "trickStarted") {
        const entry = this.active.at(-1);
        if (entry) this.applyIntentToEntry(entry, nextIntent);
        this.intentBuffer.consume(nextIntent, "started");
        events.push({
          ...event,
          action: nextIntent.action,
          order: nextIntent.order,
          source: nextIntent.source,
        });
      } else if (isTransientTrickRejection(event)) {
        nextIntent.lastTransientHint = event.hint;
      } else {
        this.intentBuffer.consume(nextIntent, "rejected");
        if (event) {
          events.push({
            ...event,
            action: nextIntent.action,
            order: nextIntent.order,
            source: nextIntent.source,
          });
        }
      }
    }

    for (let index = this.active.length - 1; index >= 0; index -= 1) {
      const entry = this.active[index];
      const definition = getTrickDefinition(entry.id);
      entry.elapsed = this.elapsed - entry.startTime;
      entry.poseProgress = completionFor(entry);

      if (definition.hold) {
        const physicalHeld = normalized[definition.action];
        const released = normalized[`${definition.action}Released`]
          || (entry.wasPhysicallyHeld && !physicalHeld);
        if (released) {
          entry.releaseRequested = true;
          if (entry.source === "advanced" && entry.elapsed < this.quickGrabMinimum) {
            entry.syntheticHoldRemaining = Math.max(
              entry.syntheticHoldRemaining,
              this.quickGrabMinimum - entry.elapsed,
            );
          }
        }
        const syntheticHeld = entry.syntheticHoldRemaining > 0;
        const held = physicalHeld || syntheticHeld;
        if (held) {
          entry.heldDuration += step;
          this.manifest.heldDurations[entry.id] += step;
          if (context.apex) entry.heldThroughApex = true;
          if (context.descending) entry.lateHoldDuration += step;
        }
        if (syntheticHeld) {
          entry.syntheticHoldRemaining = Math.max(0, entry.syntheticHoldRemaining - step);
        }
        entry.wasPhysicallyHeld = physicalHeld;
        entry.completion = entry.poseProgress;
        if (entry.poseProgress >= 1) entry.complete = true;
        this.updateEntryMotion(entry, definition);
        if (!held && (entry.releaseRequested || released || entry.elapsed > step)) {
          this.finishEntry(entry, index);
          events.push({
            type: entry.complete ? "trickCompleted" : "trickRejected",
            id: entry.id,
            action: entry.action,
            order: entry.intentOrder,
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
        events.push({
          type: "trickCompleted",
          id: entry.id,
          action: entry.action,
          order: entry.intentOrder,
          hint: "",
        });
      }
    }

    const expired = this.intentBuffer.advanceTime(step);
    for (const intent of expired) {
      events.push({
        type: "trickRejected",
        id: intent.id,
        action: intent.action,
        order: intent.order,
        hint: intent.lastTransientHint,
        source: intent.source,
        expired: true,
      });
    }

    this.updateAggregate();
    return events;
  }

  applyIntentToEntry(entry, intent) {
    const definition = getTrickDefinition(entry.id);
    entry.intentOrder = intent.order;
    entry.source = intent.source;
    entry.releaseRequested = Boolean(definition?.hold && intent.released);
    entry.wasPhysicallyHeld = Boolean(definition?.hold && intent.held);
    entry.syntheticHoldRemaining = Math.max(0, intent.syntheticHoldMinimum);
    const credited = Math.max(0, Number(intent.creditHoldDuration) || 0);
    if (credited > 0) {
      entry.startTime = Math.max(0, this.elapsed - credited);
      entry.elapsed = this.elapsed - entry.startTime;
      entry.heldDuration = credited;
      this.manifest.heldDurations[entry.id] = credited;
    }
    if (definition?.hold && entry.source === "advanced" && intent.released) {
      entry.syntheticHoldRemaining = Math.max(
        entry.syntheticHoldRemaining,
        this.quickGrabMinimum,
      );
    }
  }

  tryStart(id, context = {}) {
    const definition = getTrickDefinition(id);
    if (this.finalized) {
      return { type: "trickRejected", id, hint: "AIR ENDED", transient: false };
    }
    if (!definition) {
      return { type: "trickRejected", id, hint: "INVALID TRICK", transient: false };
    }
    if (this.manifest.sequence.some((entry) => entry.id === id)) {
      return { type: "trickRejected", id, hint: "CHAIN ANOTHER", transient: false };
    }
    if (this.elapsed < definition.minStartAirtime) {
      return { type: "trickRejected", id, hint: "WAIT FOR AIR", transient: true };
    }
    if (this.manifest.maxHeight < definition.minHeight) {
      return { type: "trickRejected", id, hint: "NEED MORE POP", transient: true };
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
      intentOrder: 0,
      source: "direct",
      releaseRequested: false,
      wasPhysicallyHeld: false,
      syntheticHoldRemaining: 0,
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
    this.intentBuffer.clear(null, "landing");
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
    this.intentBuffer.clear(null, "wipeout");
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
