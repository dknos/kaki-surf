const DEFAULT_SPECIALTY = Object.freeze({
  entryMultiplier: 1,
  scoreMultiplier: 1,
  riskMultiplier: 1,
  boardMotionMultiplier: 1,
  trimMultiplier: 1,
});

function specialty(overrides = {}) {
  return Object.freeze({ ...DEFAULT_SPECIALTY, ...overrides });
}

function trick(definition) {
  return Object.freeze({
    canChain: true,
    hold: false,
    discrete: false,
    minStartAirtime: 0,
    minAirtime: 0,
    minHeight: 0,
    durationScore: 0,
    durationCap: 0,
    boardTurns: 0,
    bodyPose: 0,
    boardCounterRotation: 0,
    lateHoldRiskRate: 0,
    repeatDecay: 0.58,
    specialties: Object.freeze({}),
    ...definition,
  });
}

/**
 * Renderer-independent trick tuning. Values are simulation seconds, radians,
 * or score units; catalog records never contain callbacks or renderer state.
 */
export const TRICK_CATALOG = Object.freeze({
  frontRailGrab: trick({
    id: "frontRailGrab",
    action: "trick1",
    category: "grab",
    name: "Frontside Grab",
    displayName: "FRONTSIDE GRAB",
    comboName: "FRONTSIDE GRAB",
    entryDuration: 0.12,
    hold: true,
    minStartAirtime: 0,
    minHeight: 0,
    baseScore: 105,
    durationScore: 92,
    durationCap: 0.68,
    bodyPose: 0.46,
    risk: 0.07,
    specialties: Object.freeze({
      foamPuff: specialty({ entryMultiplier: 0.88, riskMultiplier: 0.72 }),
      mangoFish: specialty({ scoreMultiplier: 1.08, bodyPoseMultiplier: 1.08 }),
      moonLog: specialty({ scoreMultiplier: 1.04, entryMultiplier: 1.08 }),
    }),
  }),
  tailGrab: trick({
    id: "tailGrab",
    action: "trick2",
    category: "grab",
    name: "Stalefish Grab",
    displayName: "STALEFISH GRAB",
    comboName: "STALEFISH",
    entryDuration: 0.2,
    hold: true,
    minStartAirtime: 0,
    minHeight: 12,
    baseScore: 172,
    durationScore: 128,
    durationCap: 0.78,
    bodyPose: -0.68,
    risk: 0.16,
    trimMultiplier: 1.32,
    lateHoldRiskRate: 0.72,
    specialties: Object.freeze({
      foamPuff: specialty({ entryMultiplier: 0.92, riskMultiplier: 0.78, trimMultiplier: 0.9 }),
      mangoFish: specialty({ scoreMultiplier: 1.13, trimMultiplier: 1.12, riskMultiplier: 1.1 }),
      moonLog: specialty({ scoreMultiplier: 1.08, entryMultiplier: 1.12, trimMultiplier: 1.18 }),
    }),
  }),
  boardVarial: trick({
    id: "boardVarial",
    action: "trick3",
    category: "board",
    name: "Board Varial",
    displayName: "BOARD VARIAL",
    comboName: "VARIAL",
    entryDuration: 0.58,
    discrete: true,
    minStartAirtime: 0.08,
    minAirtime: 0.58,
    minHeight: 28,
    completionThreshold: 0.985,
    boardTurns: 1,
    baseScore: 292,
    risk: 0.34,
    repeatDecay: 0.5,
    specialties: Object.freeze({
      foamPuff: specialty({ entryMultiplier: 1.1, riskMultiplier: 0.76, scoreMultiplier: 0.92 }),
      mangoFish: specialty({ entryMultiplier: 0.82, boardMotionMultiplier: 1.08, scoreMultiplier: 1.16 }),
      moonLog: specialty({ entryMultiplier: 1.2, boardMotionMultiplier: 0.9, scoreMultiplier: 1.2, riskMultiplier: 1.16 }),
    }),
  }),
  kakiTwist: trick({
    id: "kakiTwist",
    action: "trick4",
    category: "signature",
    name: "Kaki Twist",
    displayName: "KAKI TWIST",
    comboName: "KAKI TWIST",
    entryDuration: 0.92,
    discrete: true,
    minStartAirtime: 0.34,
    minAirtime: 1.08,
    minHeight: 70,
    completionThreshold: 0.99,
    boardCounterRotation: -1.88,
    bodyPose: 1.08,
    baseScore: 470,
    risk: 0.62,
    repeatDecay: 0.34,
    specialties: Object.freeze({
      foamPuff: specialty({
        entryMultiplier: 0.94,
        scoreMultiplier: 0.88,
        riskMultiplier: 0.68,
        boardMotionMultiplier: 0.82,
        signatureVariant: "softPaw",
      }),
      mangoFish: specialty({
        entryMultiplier: 0.84,
        scoreMultiplier: 1.12,
        riskMultiplier: 1.12,
        boardMotionMultiplier: 1.18,
        signatureVariant: "mangoWhip",
      }),
      moonLog: specialty({
        entryMultiplier: 1.12,
        scoreMultiplier: 1.3,
        riskMultiplier: 1.2,
        boardMotionMultiplier: 0.72,
        signatureVariant: "moonArc",
      }),
    }),
  }),
});

export const TRICK_ACTIONS = Object.freeze([
  "trick1",
  "trick2",
  "trick3",
  "trick4",
]);

export const TRICK_IDS = Object.freeze(Object.keys(TRICK_CATALOG));

const ACTION_TO_ID = Object.freeze(Object.fromEntries(
  Object.values(TRICK_CATALOG).map((definition) => [definition.action, definition.id]),
));

export function getTrickDefinition(idOrAction) {
  const id = ACTION_TO_ID[idOrAction] ?? idOrAction;
  return TRICK_CATALOG[id] ?? null;
}

export function getBoardSpecialty(definitionOrId, boardId = "foamPuff") {
  const definition = typeof definitionOrId === "string"
    ? getTrickDefinition(definitionOrId)
    : definitionOrId;
  if (!definition) return DEFAULT_SPECIALTY;
  return definition.specialties[boardId] ?? DEFAULT_SPECIALTY;
}

export function trickIdForAction(action) {
  return ACTION_TO_ID[action] ?? "";
}
