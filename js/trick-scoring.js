import { SCORE } from "./config.js";
import { clamp, TAU } from "./math.js";
import { getTrickDefinition } from "./trick-catalog.js";

const RAD_TO_DEG = 180 / Math.PI;

export function quantizeRotationDegrees(rotationRadians = 0) {
  if (!Number.isFinite(rotationRadians)) return 0;
  const actualDegrees = rotationRadians * RAD_TO_DEG;
  if (Math.abs(actualDegrees) < 135) return 0;
  return Math.sign(actualDegrees) * Math.round(Math.abs(actualDegrees) / 180) * 180;
}

export function completedTrickEntries(manifest, { requireLanding = false } = {}) {
  const sequence = Array.isArray(manifest?.sequence) ? manifest.sequence : [];
  return sequence.filter((entry) => {
    if (!entry?.complete) return false;
    if (requireLanding && !entry.landed) return false;
    return true;
  });
}

function holdBand(entry) {
  if (entry.category !== "grab") return "complete";
  if (entry.heldDuration >= 0.55) return "long";
  if (entry.heldDuration >= 0.28) return "held";
  return "tap";
}

export function buildTrickSignature(manifest, options = {}) {
  const rotationDegrees = quantizeRotationDegrees(
    options.rotationAccumulated ?? manifest?.rotationAccumulated ?? 0,
  );
  const entries = completedTrickEntries(manifest, {
    requireLanding: Boolean(options.requireLanding),
  });
  const entryDirection = entries.find((entry) => entry.direction)?.direction ?? 1;
  const direction = Math.sign(rotationDegrees || entryDirection) >= 0 ? "cw" : "ccw";
  const sequence = entries.map((entry) => {
    const variant = entry.id === "kakiTwist" && entry.signatureVariant
      ? `:${entry.signatureVariant}`
      : "";
    const apex = entry.heldThroughApex ? ":apex" : "";
    return `${entry.id}:${holdBand(entry)}${apex}${variant}`;
  }).join(">");
  return `${direction}:${Math.abs(rotationDegrees)}:${sequence || "air"}`;
}

function displayLabel(entry, hasRotation, entryCount, quality) {
  const definition = getTrickDefinition(entry.id);
  if (!definition) return entry.id.toUpperCase();
  if (entry.id === "frontRailGrab" && hasRotation) return definition.comboName;
  if (entry.id === "boardVarial") {
    if (entryCount > 1 || quality === "perfect") return definition.comboName;
    return definition.displayName;
  }
  return hasRotation || entryCount > 1 ? definition.comboName : definition.displayName;
}

export function formatTrickName(manifest, {
  quality = "",
  requireLanding = false,
  rotationAccumulated = manifest?.rotationAccumulated ?? 0,
} = {}) {
  const rotationDegrees = quantizeRotationDegrees(rotationAccumulated);
  const entries = completedTrickEntries(manifest, { requireLanding });
  const hasRotation = rotationDegrees !== 0;
  let name;

  if (!entries.length) {
    name = hasRotation ? `${Math.abs(rotationDegrees)} AIR SPIN` : "FLOATY POP";
  } else {
    const labels = entries.map((entry) => displayLabel(
      entry,
      hasRotation,
      entries.length,
      quality,
    ));
    name = `${hasRotation ? `${Math.abs(rotationDegrees)} ` : ""}${labels.join(" + ")}`;
  }

  return quality === "perfect" ? `PERFECT ${name}` : name;
}

function rotationPoints(rotationDegrees) {
  const halfTurns = Math.abs(rotationDegrees) / 180;
  if (halfTurns < 1) return 0;
  if (halfTurns === 1) return SCORE.halfRotation;
  return SCORE.fullRotation + Math.max(0, halfTurns - 2) * SCORE.extraRotation;
}

function qualityFactor(quality) {
  if (quality === "perfect") return 1.1;
  if (quality === "wobble" || quality === "sketchy") return 0.55;
  return 1;
}

function landingPoints(quality) {
  if (quality === "perfect") return SCORE.perfectLanding;
  if (quality === "clean") return SCORE.cleanLanding;
  return SCORE.wobbleSave;
}

export function repeatDecayForEntries(entries) {
  let decay = SCORE.repeatDecay;
  for (const entry of entries) {
    const definition = getTrickDefinition(entry.id);
    if (definition) decay = Math.min(decay, definition.repeatDecay);
  }
  return decay;
}

/** Pure aerial valuation. It never mutates ScoreSystem or total buckets. */
export function scoreAerialManifest(manifest, {
  quality = "clean",
  boardStyle = 1,
  multiplier = 1,
  repeatFactor = 1,
  preview = false,
} = {}) {
  if (!manifest || manifest.wipedOut) {
    return emptyAerialResult();
  }

  const landed = Boolean(manifest.landed);
  const entries = completedTrickEntries(manifest, { requireLanding: !preview });
  const rotationDegrees = quantizeRotationDegrees(manifest.rotationAccumulated);
  const launchData = manifest.launchData ?? {};
  const launchPotential = Math.max(0, Number(
    launchData.potential ?? launchData.heightPotential ?? 0,
  ) || 0);
  const maxHeight = Math.max(0, Number(manifest.maxHeight) || 0);
  let airBase = SCORE.launchBase + launchPotential * 0.18;
  airBase += SCORE.airHeightScale * maxHeight;
  airBase += rotationPoints(rotationDegrees);
  let styleBase = 0;

  for (const entry of entries) {
    const definition = getTrickDefinition(entry.id);
    if (!definition) continue;
    let entryPoints = Math.max(0, Number(entry.baseScore) || definition.baseScore || 0);
    if (definition.hold) {
      entryPoints += Math.min(entry.heldDuration, definition.durationCap)
        * definition.durationScore;
      if (entry.heldThroughApex) entryPoints += definition.id === "tailGrab" ? 52 : 24;
      if (entry.lateHoldDuration > 0.2) entryPoints *= 0.84;
    }
    if (definition.category === "board") airBase += entryPoints;
    else styleBase += entryPoints;
  }

  const distinctCount = new Set(entries.map((entry) => entry.id)).size;
  const varietyFactor = 1 + Math.max(0, distinctCount - 1) * 0.14;
  if (distinctCount > 1) styleBase += 42 * (distinctCount - 1);
  const riskFactor = 1 + clamp(Number(manifest.risk) || 0, 0, 1) * 0.1;
  const landingFactor = qualityFactor(quality);
  const sharedFactor = Math.max(0, multiplier) * Math.max(0, boardStyle)
    * Math.max(0, repeatFactor) * varietyFactor * riskFactor * landingFactor;
  const buckets = {
    air: airBase * sharedFactor,
    style: styleBase * sharedFactor,
    landings: preview || !landed ? 0 : landingPoints(quality) * Math.max(0, multiplier),
  };
  const name = formatTrickName(manifest, {
    quality: preview ? "" : quality,
    requireLanding: !preview,
  });
  const signature = buildTrickSignature(manifest, { requireLanding: !preview });

  return {
    name,
    trick: name,
    signature,
    rotationDegrees,
    entries,
    repeatFactor,
    buckets,
    provisional: buckets.air + buckets.style,
    total: buckets.air + buckets.style + buckets.landings,
    callout: quality === "perfect"
      ? "PERFECT!"
      : quality === "clean"
        ? "CLEAN!"
        : "WOBBLE SAVE",
  };
}

export function createLegacyAerialManifest({
  turns = 0,
  maxHeight = 0,
  grabbed = false,
  launchPotential = 0,
} = {}) {
  const sequence = grabbed ? [{
    id: "frontRailGrab",
    action: "trick1",
    category: "grab",
    startTime: 0,
    endTime: 0.3,
    heldDuration: 0.3,
    heldThroughApex: false,
    lateHoldDuration: 0,
    completion: 1,
    poseProgress: 1,
    boardRelativeRotation: 0,
    bodyPose: 0,
    risk: 0.07,
    baseScore: getTrickDefinition("frontRailGrab").baseScore,
    complete: true,
    landed: true,
    direction: Math.sign(turns) || 1,
  }] : [];
  return {
    sequence,
    heldDurations: { frontRailGrab: grabbed ? 0.3 : 0 },
    completion: grabbed ? 1 : 0,
    boardRelativeRotation: 0,
    bodyPose: 0,
    risk: grabbed ? 0.07 : 0,
    rotationAccumulated: turns * TAU,
    launchData: { potential: launchPotential },
    maxHeight,
    airtime: 0,
    landed: true,
    landingQuality: "clean",
    invalidBoardOrientation: false,
    provisionalScore: 0,
    provisionalTrickName: "",
    wipedOut: false,
  };
}

function emptyAerialResult() {
  return {
    name: "",
    trick: "",
    signature: "",
    rotationDegrees: 0,
    entries: [],
    repeatFactor: 1,
    buckets: { air: 0, style: 0, landings: 0 },
    provisional: 0,
    total: 0,
    callout: "",
  };
}

