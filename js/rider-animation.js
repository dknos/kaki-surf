import { clamp } from "./math.js";

export const LANDING_VARIANTS = Object.freeze({
  perfect: Object.freeze([
    "landingPawUp",
    "landingPowerCrouch",
    "landingStar",
    "landingLookBack",
  ]),
  clean: Object.freeze([
    "landingLowRide",
    "landingTailBalance",
    "landingPawSweep",
    "landingQuickSettle",
  ]),
});

export const TRICK_PHASES = Object.freeze({
  frontRailGrab: Object.freeze(["reach", "lock", "hold", "release"]),
  tailGrab: Object.freeze(["windup", "reach", "hold", "release"]),
  boardVarial: Object.freeze(["pop", "separate", "tuck", "reconnect"]),
  kakiTwist: Object.freeze(["windup", "cross", "maximum", "spot"]),
});

export const RIDER_LOCAL_SAFETY_BOUNDS = Object.freeze({
  pawX: Object.freeze([-17, 14]),
  pawY: Object.freeze([-24, -2]),
  headX: Object.freeze([-4, 4]),
  headY: Object.freeze([-4, 5]),
  tailX: Object.freeze([-16, -8]),
  tailY: Object.freeze([-19, -9]),
  crouch: Object.freeze([0, 6]),
  stretch: Object.freeze([0, 5]),
  lean: Object.freeze([-6, 6]),
  float: Object.freeze([-1, 5]),
  legSpread: Object.freeze([3, 9]),
  squash: Object.freeze([0, 1]),
});

const NUMERIC_FIELDS = Object.freeze([
  "crouch",
  "stretch",
  "lean",
  "float",
  "headX",
  "headY",
  "legSpread",
  "squash",
  "tailX",
  "tailY",
]);

const DEFAULT_POSE = Object.freeze({
  crouch: 0,
  stretch: 0,
  lean: 0,
  float: 0,
  headX: 0,
  headY: 0,
  leftPaw: Object.freeze([-10, -13]),
  rightPaw: Object.freeze([7, -13]),
  legSpread: 5,
  squash: 0,
  tailX: -11,
  tailY: -12,
  foldedEar: false,
  expression: "calm",
  loose: false,
});

const POSES = Object.freeze({
  regularRide: makePose({
    lean: -1,
    headX: 1,
    leftPaw: [-12, -13],
    rightPaw: [7, -10],
    legSpread: 6,
  }),
  goofyRide: makePose({
    crouch: 1,
    lean: -1,
    headX: 2,
    leftPaw: [-13, -12],
    rightPaw: [8, -11],
    legSpread: 7,
  }),
  rise: makePose({
    stretch: 3,
    headY: -2,
    leftPaw: [-12, -15],
    rightPaw: [8, -17],
    legSpread: 6,
  }),
  landingAnticipation: makePose({
    crouch: 4,
    headY: 2,
    leftPaw: [-10, -9],
    rightPaw: [7, -9],
    legSpread: 7,
    expression: "focus",
  }),
  perfectImpact: makePose({
    crouch: 5,
    headY: 3,
    leftPaw: [-13, -12],
    rightPaw: [10, -12],
    legSpread: 7,
    squash: 1,
    tailY: -10,
    expression: "bright",
  }),
  cleanImpact: makePose({
    crouch: 3,
    headY: 1,
    leftPaw: [-11, -11],
    rightPaw: [8, -11],
    legSpread: 6,
  }),
  landingPawUp: makePose({
    stretch: 1,
    headY: -1,
    leftPaw: [-12, -22],
    rightPaw: [9, -10],
    legSpread: 6,
    tailY: -14,
    expression: "bright",
  }),
  landingPowerCrouch: makePose({
    crouch: 6,
    headY: 3,
    leftPaw: [-16, -12],
    rightPaw: [12, -12],
    legSpread: 8,
    squash: 1,
    tailX: -14,
    tailY: -10,
    expression: "focus",
  }),
  landingStar: makePose({
    stretch: 2,
    float: 1,
    headY: -2,
    leftPaw: [-16, -19],
    rightPaw: [12, -19],
    legSpread: 7,
    tailY: -16,
    expression: "bright",
  }),
  landingLookBack: makePose({
    crouch: 1,
    lean: 2,
    headX: -3,
    leftPaw: [-7, -10],
    rightPaw: [10, -15],
    legSpread: 7,
    tailX: -15,
    tailY: -16,
    foldedEar: true,
    expression: "bright",
  }),
  landingLowRide: makePose({
    crouch: 4,
    lean: -2,
    headY: 2,
    leftPaw: [-13, -10],
    rightPaw: [8, -8],
    legSpread: 7,
    tailY: -11,
    expression: "focus",
  }),
  landingTailBalance: makePose({
    crouch: 2,
    lean: 1,
    leftPaw: [-15, -17],
    rightPaw: [12, -16],
    legSpread: 8,
    tailX: -16,
    tailY: -19,
    expression: "bright",
  }),
  landingPawSweep: makePose({
    crouch: 2,
    lean: 3,
    headX: 2,
    leftPaw: [-15, -7],
    rightPaw: [9, -14],
    legSpread: 7,
    tailY: -15,
    expression: "focus",
  }),
  landingQuickSettle: makePose({
    crouch: 2,
    lean: -1,
    headX: 1,
    leftPaw: [-11, -12],
    rightPaw: [7, -9],
    legSpread: 7,
    expression: "bright",
  }),
});

const TRICK_TIMELINES = Object.freeze({
  frontRailGrab: timeline([
    [0, POSES.rise, "reach"],
    [0.24, makePose({ crouch: 2, headX: 2, leftPaw: [-11, -10], rightPaw: [7, -13], legSpread: 5, expression: "focus" }), "reach"],
    [0.46, makePose({ crouch: 4, headY: 2, headX: 2, leftPaw: [-10, -5], rightPaw: [6, -10], legSpread: 3, expression: "focus" }), "lock"],
    [0.56, makePose({ crouch: 5, headY: 2, headX: 2, leftPaw: [-9, -5], rightPaw: [7, -9], legSpread: 3, tailY: -10, expression: "bright" }), "hold"],
    [1, makePose({ crouch: 2, headY: 1, leftPaw: [-12, -13], rightPaw: [9, -15], legSpread: 7, expression: "focus" }), "release"],
  ]),
  tailGrab: timeline([
    [0, POSES.rise, "windup"],
    [0.24, makePose({ crouch: 2, lean: 3, headX: -1, leftPaw: [-7, -12], rightPaw: [0, -10], legSpread: 5, tailX: -14, tailY: -14, expression: "focus" }), "windup"],
    [0.48, makePose({ crouch: 4, lean: 2, headY: 2, headX: -2, leftPaw: [-7, -9], rightPaw: [-8, -4], legSpread: 3, tailX: -15, tailY: -12, expression: "focus" }), "reach"],
    [0.58, makePose({ crouch: 5, lean: 1, headY: 3, headX: -2, leftPaw: [-6, -8], rightPaw: [-8, -3], legSpread: 3, squash: 1, tailX: -16, tailY: -10, expression: "bright" }), "hold"],
    [1, makePose({ crouch: 2, headY: 1, headX: 1, leftPaw: [-13, -14], rightPaw: [5, -12], legSpread: 7, tailY: -15, expression: "focus" }), "release"],
  ]),
  boardVarial: timeline([
    [0, makePose({ stretch: 3, headY: -2, leftPaw: [-12, -16], rightPaw: [9, -17], legSpread: 6, expression: "bright" }), "pop"],
    [0.24, makePose({ float: 3, stretch: 2, headY: -2, leftPaw: [-16, -20], rightPaw: [12, -20], legSpread: 8, tailY: -17, expression: "bright" }), "pop"],
    [0.5, makePose({ crouch: 5, float: 5, headY: 2, leftPaw: [-15, -21], rightPaw: [11, -21], legSpread: 4, squash: 1, tailY: -18, expression: "wide" }), "separate"],
    [0.76, makePose({ crouch: 3, float: 4, headY: 1, leftPaw: [-14, -19], rightPaw: [10, -19], legSpread: 5, tailY: -16, expression: "focus" }), "tuck"],
    [1, makePose({ crouch: 3, headY: 1, leftPaw: [-10, -10], rightPaw: [7, -10], legSpread: 7, expression: "focus" }), "reconnect"],
  ]),
  kakiTwist: timeline([
    [0, makePose({ crouch: 2, lean: -3, headX: -2, leftPaw: [-13, -11], rightPaw: [5, -16], legSpread: 6, expression: "focus" }), "windup"],
    [0.24, makePose({ crouch: 2, float: 2, lean: 2, headX: 1, leftPaw: [2, -13], rightPaw: [-6, -10], legSpread: 4, tailY: -15, expression: "focus" }), "cross"],
    [0.56, makePose({ crouch: 3, float: 3, lean: 5, headX: 3, leftPaw: [4, -15], rightPaw: [-8, -11], legSpread: 3, tailX: -15, tailY: -18, expression: "bright" }), "maximum"],
    [0.8, makePose({ crouch: 2, float: 2, lean: 2, headX: 2, leftPaw: [-9, -17], rightPaw: [9, -14], legSpread: 6, tailY: -16, expression: "bright" }), "maximum"],
    [1, POSES.landingAnticipation, "spot"],
  ]),
});

export function createRiderAnimationState() {
  return {
    landingSerial: 0,
    previousLandingVariant: "",
    landing: null,
  };
}

export function resetRiderAnimationState(state = createRiderAnimationState()) {
  state.landingSerial = 0;
  state.previousLandingVariant = "";
  state.landing = null;
  return state;
}

export function deterministicLandingVariant({
  seed = 0,
  serial = 0,
  quality = "clean",
  trickSignature = "",
  boardId = "foamPuff",
  direction = 1,
  previousVariant = "",
  majorTrick = true,
} = {}) {
  const tier = quality === "perfect" ? "perfect" : "clean";
  const fullPool = LANDING_VARIANTS[tier];
  const pool = tier === "perfect" && !majorTrick
    ? fullPool.filter((variant) => variant !== "landingStar")
    : fullPool;
  const hash = hashParts(seed, serial, tier, trickSignature, boardId, Math.sign(direction) || 1);
  let index = hash % pool.length;
  if (pool.length > 1 && pool[index] === previousVariant) index = (index + 1) % pool.length;
  return pool[index];
}

export function beginLandingPresentation(state, {
  seed = 0,
  quality = "clean",
  trickSignature = "",
  boardId = "foamPuff",
  direction = 1,
  majorTrick = false,
} = {}) {
  state.landingSerial += 1;
  if (quality === "wobble" || quality === "sketchy") {
    state.landing = null;
    return null;
  }
  const tier = quality === "perfect" ? "perfect" : "clean";
  const variant = deterministicLandingVariant({
    seed,
    serial: state.landingSerial,
    quality: tier,
    trickSignature,
    boardId,
    direction,
    previousVariant: state.previousLandingVariant,
    majorTrick,
  });
  state.previousLandingVariant = variant;
  state.landing = {
    active: true,
    elapsed: 0,
    quality: tier,
    variant,
    duration: tier === "perfect" ? 0.82 : 0.68,
  };
  return state.landing;
}

export function cancelLandingPresentation(state) {
  state.landing = null;
}

export function updateRiderAnimation(state, dt, player = {}) {
  if (!state.landing) return state;
  if (landingPresentationMustCancel(player)) {
    cancelLandingPresentation(state);
    return state;
  }
  state.landing.elapsed = Math.min(
    state.landing.duration,
    state.landing.elapsed + Math.max(0, Number(dt) || 0),
  );
  if (state.landing.elapsed >= state.landing.duration) cancelLandingPresentation(state);
  return state;
}

export function landingPresentationPose(state, player = {}, { reducedMotion = false } = {}) {
  const landing = state?.landing;
  if (!landing?.active) return null;
  const ridePose = player.ridingStance === "goofy" ? POSES.goofyRide : POSES.regularRide;
  const impact = landing.quality === "perfect" ? POSES.perfectImpact : POSES.cleanImpact;
  const variant = POSES[landing.variant] ?? ridePose;
  const frames = landingTimeline(landing.quality, impact, variant, ridePose, reducedMotion);
  const sample = samplePoseTimeline(frames, landing.elapsed, { reducedMotion });
  return {
    id: landing.variant,
    phase: sample.phase,
    pose: sample.pose,
    progress: clamp(landing.elapsed / landing.duration, 0, 1),
  };
}

export function trickPresentationPose(player = {}, { reducedMotion = false } = {}) {
  if (player.state !== "airborne") return null;
  const manifest = player.trickManifest;
  const id = manifest?.trickPose ?? player.trickPose;
  const frames = TRICK_TIMELINES[id];
  if (!frames) return null;
  const entry = latestTrickEntry(manifest?.sequence, id);
  const rawProgress = clamp(Number(manifest?.poseProgress ?? entry?.poseProgress) || 0, 0, 1);
  const signatureVariant = entry?.signatureVariant ?? "";
  const progress = remapSignatureProgress(rawProgress, signatureVariant);
  const sample = samplePoseTimeline(frames, progress, { reducedMotion, normalized: true });
  let pose = applySignatureVariant(sample.pose, signatureVariant, progress);
  const landingBlend = lateLandingBlend(player);
  if (landingBlend > 0) {
    pose = interpolatePixelPose(pose, POSES.landingAnticipation, landingBlend, { reducedMotion });
  }
  return {
    id,
    phase: landingBlend >= 0.65 ? "landingRead" : sample.phase,
    pose,
    progress: rawProgress,
    signatureVariant,
  };
}

export function resolveRiderPresentationPose(state, player = {}, options = {}) {
  return landingPresentationPose(state, player, options)
    ?? trickPresentationPose(player, options);
}

export function interpolatePixelPose(from, to, amount, { reducedMotion = false } = {}) {
  let t = clamp(Number(amount) || 0, 0, 1);
  if (reducedMotion) t = Math.round(t * 2) / 2;
  const eased = t * t * (3 - 2 * t);
  const result = {};
  for (const field of NUMERIC_FIELDS) {
    result[field] = Math.round(lerp(Number(from[field]) || 0, Number(to[field]) || 0, eased));
  }
  result.leftPaw = Object.freeze([
    Math.round(lerp(from.leftPaw[0], to.leftPaw[0], eased)),
    Math.round(lerp(from.leftPaw[1], to.leftPaw[1], eased)),
  ]);
  result.rightPaw = Object.freeze([
    Math.round(lerp(from.rightPaw[0], to.rightPaw[0], eased)),
    Math.round(lerp(from.rightPaw[1], to.rightPaw[1], eased)),
  ]);
  const discrete = t >= 1 ? to : from;
  result.foldedEar = Boolean(discrete.foldedEar);
  result.expression = discrete.expression;
  result.loose = Boolean(discrete.loose);
  return Object.freeze(result);
}

export function sampleLandingVariant(variant, progress, {
  quality = LANDING_VARIANTS.perfect.includes(variant) ? "perfect" : "clean",
  ridingStance = "regular",
  reducedMotion = false,
} = {}) {
  const duration = quality === "perfect" ? 0.82 : 0.68;
  const state = {
    landing: {
      active: true,
      elapsed: clamp(Number(progress) || 0, 0, 1) * duration,
      duration,
      quality,
      variant,
    },
  };
  return landingPresentationPose(state, { ridingStance }, { reducedMotion });
}

export function sampleTrickPose(id, progress, {
  signatureVariant = "",
  airVY = 0,
  reducedMotion = false,
} = {}) {
  return trickPresentationPose({
    state: "airborne",
    airVY,
    landingPreview: { error: 0.1, bands: { recovery: 0.7 } },
    trickPose: id,
    trickManifest: {
      trickPose: id,
      poseProgress: progress,
      sequence: [{ id, poseProgress: progress, signatureVariant }],
    },
  }, { reducedMotion });
}

export function poseWithinSafetyBounds(pose) {
  if (!pose) return false;
  const inside = (value, bounds) => Number.isFinite(value) && value >= bounds[0] && value <= bounds[1];
  return inside(pose.leftPaw?.[0], RIDER_LOCAL_SAFETY_BOUNDS.pawX)
    && inside(pose.rightPaw?.[0], RIDER_LOCAL_SAFETY_BOUNDS.pawX)
    && inside(pose.leftPaw?.[1], RIDER_LOCAL_SAFETY_BOUNDS.pawY)
    && inside(pose.rightPaw?.[1], RIDER_LOCAL_SAFETY_BOUNDS.pawY)
    && inside(pose.headX, RIDER_LOCAL_SAFETY_BOUNDS.headX)
    && inside(pose.headY, RIDER_LOCAL_SAFETY_BOUNDS.headY)
    && inside(pose.tailX, RIDER_LOCAL_SAFETY_BOUNDS.tailX)
    && inside(pose.tailY, RIDER_LOCAL_SAFETY_BOUNDS.tailY)
    && inside(pose.crouch, RIDER_LOCAL_SAFETY_BOUNDS.crouch)
    && inside(pose.stretch, RIDER_LOCAL_SAFETY_BOUNDS.stretch)
    && inside(pose.lean, RIDER_LOCAL_SAFETY_BOUNDS.lean)
    && inside(pose.float, RIDER_LOCAL_SAFETY_BOUNDS.float)
    && inside(pose.legSpread, RIDER_LOCAL_SAFETY_BOUNDS.legSpread)
    && inside(pose.squash, RIDER_LOCAL_SAFETY_BOUNDS.squash);
}

function landingPresentationMustCancel(player) {
  if (!["landing", "riding"].includes(player.state)) return true;
  if (player.animalMount || player.mountKind || player.mountType) return true;
  if (player.maneuver?.id || player.tubeTucked || player.tubeAction) return true;
  if (player.state === "riding" && (
    (Number(player.compression) || 0) > 0.34
    || (Number(player.charge) || 0) > 0.34
    || player.pumpReleased
    || player.justPumped
  )) return true;
  return false;
}

function landingTimeline(quality, impact, variant, ridePose, reducedMotion) {
  if (quality === "perfect") {
    if (reducedMotion) return timeline([
      [0, impact, "impact"],
      [0.14, impact, "impact"],
      [0.52, variant, "rideAway"],
      [0.82, ridePose, "return"],
    ]);
    return timeline([
      [0, impact, "impact"],
      [0.14, impact, "impact"],
      [0.3, variant, "rideAway"],
      [0.52, accentLandingPose(variant), "accent"],
      [0.66, variant, "settle"],
      [0.82, ridePose, "return"],
    ]);
  }
  if (reducedMotion) return timeline([
    [0, impact, "impact"],
    [0.12, impact, "impact"],
    [0.42, variant, "rideAway"],
    [0.68, ridePose, "return"],
  ]);
  return timeline([
    [0, impact, "impact"],
    [0.12, impact, "impact"],
    [0.26, variant, "rideAway"],
    [0.42, accentLandingPose(variant), "accent"],
    [0.54, variant, "settle"],
    [0.68, ridePose, "return"],
  ]);
}

function accentLandingPose(pose) {
  return makePose({
    ...pose,
    crouch: clamp(pose.crouch - 1, 0, 6),
    headY: clamp(pose.headY - 1, -4, 5),
    tailY: clamp(pose.tailY - 1, -19, -9),
  });
}

function samplePoseTimeline(frames, value, { reducedMotion = false, normalized = false } = {}) {
  const end = frames.at(-1).at;
  const position = clamp(Number(value) || 0, 0, normalized ? 1 : end);
  if (position <= frames[0].at) return { pose: frames[0].pose, phase: frames[0].phase };
  for (let index = 1; index < frames.length; index += 1) {
    const next = frames[index];
    if (position > next.at) continue;
    const previous = frames[index - 1];
    const amount = (position - previous.at) / Math.max(1e-9, next.at - previous.at);
    return {
      pose: interpolatePixelPose(previous.pose, next.pose, amount, { reducedMotion }),
      phase: amount >= 1 ? next.phase : previous.phase,
    };
  }
  return { pose: frames.at(-1).pose, phase: frames.at(-1).phase };
}

function applySignatureVariant(pose, signatureVariant, progress) {
  if (!signatureVariant || progress <= 0 || progress >= 1) return pose;
  if (signatureVariant === "softPaw") {
    return makePose({
      ...pose,
      crouch: clamp(pose.crouch - 1, 0, 6),
      float: clamp(pose.float + 1, -1, 5),
      leftPaw: [pose.leftPaw[0] - 1, clamp(pose.leftPaw[1] - 2, -24, -2)],
      expression: progress > 0.35 ? "bright" : pose.expression,
    });
  }
  if (signatureVariant === "mangoWhip") {
    return makePose({
      ...pose,
      lean: clamp(pose.lean + 1, -6, 6),
      rightPaw: [clamp(pose.rightPaw[0] + 2, -17, 14), pose.rightPaw[1]],
      tailX: -16,
      tailY: clamp(pose.tailY - 1, -19, -9),
      expression: "focus",
    });
  }
  if (signatureVariant === "moonArc") {
    return makePose({
      ...pose,
      stretch: clamp(pose.stretch + 1, 0, 5),
      float: clamp(pose.float + 1, -1, 5),
      leftPaw: [clamp(pose.leftPaw[0] - 2, -17, 14), clamp(pose.leftPaw[1] - 1, -24, -2)],
      rightPaw: [clamp(pose.rightPaw[0] + 1, -17, 14), clamp(pose.rightPaw[1] - 2, -24, -2)],
      expression: "bright",
    });
  }
  return pose;
}

function remapSignatureProgress(progress, signatureVariant) {
  if (signatureVariant === "softPaw") return Math.pow(progress, 0.92);
  if (signatureVariant === "mangoWhip") return Math.pow(progress, 0.82);
  if (signatureVariant === "moonArc") return Math.pow(progress, 1.12);
  return progress;
}

function lateLandingBlend(player) {
  const airVY = Number(player.airVY) || 0;
  const error = Number(player.landingPreview?.error);
  const recovery = Number(player.landingPreview?.bands?.recovery);
  if (airVY <= 22 || !Number.isFinite(error) || !Number.isFinite(recovery) || error > recovery) return 0;
  return smoothstep01((airVY - 22) / 54);
}

function latestTrickEntry(sequence, id) {
  if (!Array.isArray(sequence)) return null;
  for (let index = sequence.length - 1; index >= 0; index -= 1) {
    if (sequence[index]?.id === id) return sequence[index];
  }
  return null;
}

function timeline(entries) {
  return Object.freeze(entries.map(([at, pose, phase]) => Object.freeze({ at, pose, phase })));
}

function makePose(overrides = {}) {
  return Object.freeze({
    ...DEFAULT_POSE,
    ...overrides,
    leftPaw: Object.freeze([...(overrides.leftPaw ?? DEFAULT_POSE.leftPaw)]),
    rightPaw: Object.freeze([...(overrides.rightPaw ?? DEFAULT_POSE.rightPaw)]),
  });
}

function hashParts(...parts) {
  let hash = 0x811c9dc5;
  for (const character of parts.join("|")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function smoothstep01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}
