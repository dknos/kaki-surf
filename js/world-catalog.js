export const WORLD_LAYER_ORDER = Object.freeze(["far", "mid", "near"]);

export const WORLD_LAYER_CONFIG = Object.freeze({
  far: Object.freeze({
    capacity: 8,
    parallax: 0.08,
    interval: Object.freeze([4.8, 8.2]),
    yRange: Object.freeze([48, 78]),
    cullMargin: 72,
  }),
  mid: Object.freeze({
    capacity: 8,
    parallax: 0.32,
    interval: Object.freeze([3.2, 6.4]),
    yRange: Object.freeze([34, 91]),
    cullMargin: 82,
  }),
  near: Object.freeze({
    capacity: 3,
    parallax: 0.88,
    interval: Object.freeze([7.5, 12.5]),
    yRange: Object.freeze([24, 142]),
    cullMargin: 96,
  }),
});

export const WORLD_LIMITS = Object.freeze({
  logicalWidth: 384,
  logicalHeight: 216,
  centerX: 192,
  eventCapacity: 32,
  interactionCapacity: 16,
  wildlifeCapacity: 3,
  powerupCapacity: 3,
  maxActiveBonuses: 2,
  foamGateCapacity: 3,
  maxBirdReactionsPerBeat: 6,
  minimumInteractiveQuiet: 3.5,
  initialInteractiveGrace: 7,
});

const traffic = {
  cargoShip: {
    layers: ["far"],
    renderBand: "horizon",
    speed: Object.freeze([2.2, 4.2]),
    duration: Object.freeze([26, 42]),
    animation: "cruise",
    boat: true,
  },
  sailboat: {
    layers: ["far", "mid"],
    renderBand: "waterBack",
    speed: Object.freeze([3, 6]),
    duration: Object.freeze([22, 38]),
    animation: "heel",
    boat: true,
  },
  fishingBoat: {
    layers: ["far", "mid"],
    renderBand: "waterBack",
    speed: Object.freeze([3.2, 6.5]),
    duration: Object.freeze([20, 34]),
    animation: "bob",
    boat: true,
  },
  tugboat: {
    layers: ["mid"],
    renderBand: "waterBack",
    speed: Object.freeze([5, 8]),
    duration: Object.freeze([17, 28]),
    animation: "bob",
    boat: true,
  },
  speedboat: {
    layers: ["mid"],
    renderBand: "waterBack",
    speed: Object.freeze([13, 20]),
    duration: Object.freeze([10, 17]),
    animation: "race",
    boat: true,
  },
  jetSki: {
    layers: ["mid"],
    renderBand: "waterBack",
    speed: Object.freeze([16, 23]),
    duration: Object.freeze([8, 14]),
    animation: "race",
    boat: true,
  },
  rescueCraft: {
    layers: ["mid"],
    renderBand: "waterBack",
    speed: Object.freeze([9, 15]),
    duration: Object.freeze([13, 21]),
    animation: "rescueLights",
    boat: true,
  },
  gullFlock: {
    layers: ["mid", "near"],
    renderBand: "skyTraffic",
    speed: Object.freeze([14, 24]),
    duration: Object.freeze([10, 18]),
    animation: "flap",
    bird: true,
  },
  ternFlock: {
    layers: ["mid"],
    renderBand: "skyTraffic",
    speed: Object.freeze([17, 27]),
    duration: Object.freeze([9, 15]),
    animation: "bank",
    bird: true,
  },
  cormorantFlock: {
    layers: ["far", "mid"],
    renderBand: "skyTraffic",
    speed: Object.freeze([12, 19]),
    duration: Object.freeze([12, 21]),
    animation: "glide",
    bird: true,
  },
  pelican: {
    layers: ["mid", "near"],
    renderBand: "skyTraffic",
    speed: Object.freeze([13, 22]),
    duration: Object.freeze([11, 18]),
    animation: "skim",
    bird: true,
  },
  propPlane: {
    layers: ["far", "mid"],
    renderBand: "skyTraffic",
    speed: Object.freeze([18, 31]),
    duration: Object.freeze([12, 20]),
    animation: "cruise",
    aircraft: true,
  },
  seaplane: {
    layers: ["mid"],
    renderBand: "skyTraffic",
    speed: Object.freeze([17, 27]),
    duration: Object.freeze([13, 20]),
    animation: "cruise",
    aircraft: true,
  },
  helicopter: {
    layers: ["mid"],
    renderBand: "skyTraffic",
    speed: Object.freeze([10, 18]),
    duration: Object.freeze([14, 23]),
    animation: "hover",
    aircraft: true,
  },
  bannerPlane: {
    layers: ["mid", "near"],
    renderBand: "skyTraffic",
    speed: Object.freeze([12, 20]),
    duration: Object.freeze([16, 24]),
    animation: "tow",
    aircraft: true,
    banner: true,
  },
  fishSchool: {
    layers: ["near"],
    renderBand: "playfieldFront",
    speed: Object.freeze([18, 30]),
    duration: Object.freeze([5, 9]),
    animation: "jump",
  },
};

for (const definition of Object.values(traffic)) {
  definition.layers = Object.freeze(definition.layers);
  Object.freeze(definition);
}

export const TRAFFIC_CATALOG = Object.freeze(traffic);

export const CONDITION_WORLD_PROFILES = Object.freeze({
  goldenCoast: Object.freeze({
    id: "goldenCoast",
    wind: 0.28,
    density: 1,
    traffic: Object.freeze({
      far: Object.freeze(["sailboat", "cargoShip", "fishingBoat", "cormorantFlock", "propPlane"]),
      mid: Object.freeze(["gullFlock", "pelican", "sailboat", "speedboat", "fishingBoat", "bannerPlane", "seaplane"]),
      near: Object.freeze(["pelican", "gullFlock", "fishSchool", "bannerPlane"]),
    }),
    wildlifeWeights: Object.freeze({ dolphin: 0.62, shark: 0.3, whale: 0.08 }),
  }),
  twilightGlass: Object.freeze({
    id: "twilightGlass",
    wind: 0.18,
    density: 0.9,
    traffic: Object.freeze({
      far: Object.freeze(["fishingBoat", "cargoShip", "sailboat", "cormorantFlock", "propPlane"]),
      mid: Object.freeze(["fishingBoat", "ternFlock", "gullFlock", "helicopter", "bannerPlane", "seaplane"]),
      near: Object.freeze(["ternFlock", "pelican", "fishSchool", "bannerPlane"]),
    }),
    wildlifeWeights: Object.freeze({ dolphin: 0.52, shark: 0.34, whale: 0.14 }),
  }),
  stormbreak: Object.freeze({
    id: "stormbreak",
    wind: 0.82,
    density: 0.78,
    traffic: Object.freeze({
      far: Object.freeze(["cargoShip", "fishingBoat", "cormorantFlock", "propPlane"]),
      mid: Object.freeze(["gullFlock", "rescueCraft", "tugboat", "helicopter", "bannerPlane"]),
      near: Object.freeze(["gullFlock", "pelican", "bannerPlane"]),
    }),
    wildlifeWeights: Object.freeze({ dolphin: 0.38, shark: 0.48, whale: 0.14 }),
  }),
});

export const WILDLIFE_CATALOG = Object.freeze({
  dolphin: Object.freeze({
    radius: 11,
    nearRadius: 20,
    cooldown: 24,
    phases: Object.freeze({
      telegraph: 1.1,
      approach: 1.35,
      catchable: 1.8,
      mounted: 4.8,
      dismount: 0.55,
      depart: 1.15,
    }),
  }),
  shark: Object.freeze({
    radius: 10,
    nearRadius: 24,
    cooldown: 18,
    minimumTelegraph: 0.9,
    phases: Object.freeze({
      telegraph: 1.25,
      crossing: 1.65,
      depart: 0.85,
    }),
  }),
  whale: Object.freeze({
    radius: 18,
    nearRadius: 30,
    cooldown: 42,
    phases: Object.freeze({
      distant: 1.8,
      blow: 1.2,
      breach: 1.45,
      ramp: 2.3,
      mounted: 4.2,
      dismount: 0.7,
      splash: 1.4,
      depart: 1.7,
    }),
  }),
});

export const POWERUP_CATALOG = Object.freeze({
  mangoRush: Object.freeze({
    name: "MANGO RUSH",
    radius: 8,
    availableFor: 3.4,
    activeFor: 4.5,
    effect: Object.freeze({ speedBurst: 13, uphillLossScale: 0.55 }),
  }),
  moonPop: Object.freeze({
    name: "MOON POP",
    radius: 8,
    availableFor: 3.8,
    activeFor: 14,
    charges: 1,
    effect: Object.freeze({ launchScale: 1.18 }),
  }),
  starFoam: Object.freeze({
    name: "STAR FOAM",
    radius: 8,
    availableFor: 4.1,
    activeFor: 16,
    charges: 1,
    effect: Object.freeze({ protectsFlow: true }),
  }),
});

export const BANNER_MESSAGES = Object.freeze({
  generic: Object.freeze([
    "BIG AIR WEATHER",
    "KAKI RULES THE BREAK",
    "MOON LOG CLUB",
  ]),
  dolphin: "DOLPHINS AHEAD",
  shark: "SHARK WATCH",
  personalBest: "CHASE THAT BEST",
  wipeout: "SHAKE OFF THE SPLASH",
  giantTrick: "GIANT AIR KAKI",
});

export const CARRIER_PHASES = Object.freeze({
  haze: 2.8,
  arrival: 4.2,
  deckActivity: 3.6,
  launch: 2.1,
  airshow: 8,
  depart: 5.5,
});

export const BIRD_REACTION_PHASES = Object.freeze({
  bank: 0.72,
  dodge: 0.58,
  scatter: 1.15,
  follow: 1.4,
  circle: 1.7,
});

export const COURIER_PHASES = Object.freeze({
  telegraph: 0.72,
  carry: 0.9,
  drop: 0.32,
  exit: 1.25,
});

export const RACE_PHASES = Object.freeze({
  telegraph: 0.85,
  finish: 1.1,
});

export const AIRCRAFT_DROP_PHASES = Object.freeze({
  telegraph: 0.82,
  approach: 0.92,
  drop: 0.35,
  exit: 1.4,
});

export const FOAM_GATE_CONFIG = Object.freeze({
  radius: 13,
  baseDistance: 54,
  spacing: 48,
  availableFor: 7.5,
});

export function conditionWorldProfile(condition) {
  const id = typeof condition === "string" ? condition : condition?.id;
  return CONDITION_WORLD_PROFILES[id] ?? CONDITION_WORLD_PROFILES.goldenCoast;
}

export function trafficDefinition(kind) {
  return TRAFFIC_CATALOG[kind] ?? null;
}

export function isBoatKind(kind) {
  return Boolean(TRAFFIC_CATALOG[kind]?.boat);
}

export function isAircraftKind(kind) {
  return Boolean(TRAFFIC_CATALOG[kind]?.aircraft);
}

export function isBirdKind(kind) {
  return Boolean(TRAFFIC_CATALOG[kind]?.bird);
}

export function isFlockBirdKind(kind) {
  return kind === "gullFlock" || kind === "ternFlock" || kind === "cormorantFlock";
}
