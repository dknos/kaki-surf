import { clamp, smoothstep } from "./math.js";

export const AERIAL_ZONES = Object.freeze([
  Object.freeze({ id: "coastalSky", label: "COASTAL SKY", start: 0 }),
  Object.freeze({ id: "cloudLayer", label: "CLOUD LAYER", start: 0.2 }),
  Object.freeze({ id: "upperAtmosphere", label: "UPPER ATMOSPHERE", start: 0.5 }),
  Object.freeze({ id: "kakiSpace", label: "KAKI SPACE", start: 0.8 }),
]);

export const AERIAL_MILESTONES = Object.freeze([
  Object.freeze({ index: 1, altitude: 0.16, text: "BIG AIR" }),
  Object.freeze({ index: 2, altitude: 0.36, text: "CLOUD BREAKER" }),
  Object.freeze({ index: 3, altitude: 0.62, text: "STRATOSPHERE KAKI" }),
  Object.freeze({ index: 4, altitude: 0.88, text: "KAKI IN ORBIT" }),
]);

export const AERIAL_PANORAMA = Object.freeze({
  width: 1536,
  height: 640,
  viewportWidth: 384,
  viewportHeight: 216,
});

export const AIR_PROJECTION = Object.freeze({
  compressionStartY: 40,
  // The authored full-stack launch can now reach roughly 400 physical pixels
  // above the lip. Keep that complete range on the constant-slope branch so
  // even the highest earned air continues to move visibly on screen.
  highAirPivotY: -140,
  highAirPivotFinalY: 17.5,
  supportedMinimumY: -340,
  supportedFinalY: 9,
  minimumY: 6,
});

/**
 * Freeze takeoff intent into one authored aerial envelope. Space is gated by
 * the whole line: Turbo alone cannot rescue a slow, flat, uncompressed pop.
 */
export function qualifyAerialLaunch({
  launchStrength = 0,
  speedRatio = 0,
  uphillApproach = 0,
  charge = 0,
  pocketRisk = 0,
  turboActive = false,
  turboOverdrive = 0,
  launchScale = 1,
  waveMomentum = 0,
  mangoRushActive = false,
} = {}) {
  const speed = clamp(Number(speedRatio) || 0, 0, 1);
  const climb = clamp(Number(uphillApproach) || 0, 0, 1);
  const compression = clamp(Number(charge) || 0, 0, 1);
  const pocket = clamp(Number(pocketRisk) || 0, 0, 1);
  const strength = clamp(Number(launchStrength) || 0, 0, 2);
  const turbo = turboActive
    ? clamp(0.58 + (Number(turboOverdrive) || 0) * 0.42, 0, 1)
    : 0;
  const lineQuality = clamp(
    speed * 0.43 + climb * 0.29 + compression * 0.18 + pocket * 0.1,
    0,
    1,
  );
  const spaceQualified = turbo >= 0.72
    && speed >= 0.9
    && climb >= 0.45
    && compression >= 0.6
    && strength >= 1.12
    && lineQuality >= 0.72;

  let zone = "coastalSky";
  let ceiling = 0.18;
  if (strength >= 0.84 && speed >= 0.3) {
    zone = "cloudLayer";
    ceiling = 0.46;
  }
  if (strength >= 1.04 && speed >= 0.72 && climb >= 0.22) {
    zone = "upperAtmosphere";
    ceiling = 0.75;
  }
  if (spaceQualified) {
    zone = "kakiSpace";
    ceiling = 1;
  }

  // A qualified Turbo takeoff increases real airtime. The multiplier remains
  // line-weighted, so holding Turbo on a poor approach barely changes a pop.
  const turboLiftMultiplier = 1
    + turbo * lineQuality * 0.2
    + (spaceQualified ? 0.24 : 0);
  const scale = clamp(Number(launchScale) || 1, 0.5, 2);
  const momentum = clamp(Number(waveMomentum) || 0, 0, 1);
  const moonPop = smoothstep(1.001, 1.18, scale);
  const mangoRush = mangoRushActive ? 1 : 0;
  const boostStack = clamp(turbo * 0.38 + moonPop * 0.52 + mangoRush * 0.1, 0, 1);
  const momentumReadiness = smoothstep(0.62, 0.94, momentum)
    * smoothstep(0.68, 0.96, speed)
    * smoothstep(0.28, 0.72, climb)
    * smoothstep(0.45, 0.9, compression);
  // Extra height is earned only by carrying a strong line into stacked
  // boosts. Ordinary jumps retain their existing impulse exactly.
  const momentumLiftMultiplier = 1 + 0.24 * momentumReadiness * boostStack;
  const expectedHeight = clamp(
    18 + strength * strength * 54
      * scale
      * turboLiftMultiplier
      * momentumLiftMultiplier,
    18,
    420,
  );

  return Object.freeze({
    zone,
    ceiling,
    lineQuality,
    turbo,
    turboLiftMultiplier,
    momentumLiftMultiplier,
    momentumReadiness,
    boostStack,
    spaceQualified,
    expectedHeight,
  });
}

/**
 * Opacity driver for the seam-safe cloud veil. The panorama crop never moves;
 * only this soft overlay fades in for an earned high-air altitude.
 */
export function aerialCloudLayerPresence(altitude = 0) {
  return smoothstep(0.24, 0.58, clamp(Number(altitude) || 0, 0, 1));
}

/**
 * Canonical normalized altitude. It is derived from the authored launch
 * envelope and clearance, never from screen-space camera translation.
 */
export function aerialAltitudeForFlight({
  state = "riding",
  flightHeight = 0,
  surfaceClearance = 0,
  verticalVelocity = 0,
  ceiling = 0,
  expectedHeight = 64,
} = {}) {
  if (state !== "airborne") return 0;
  const expected = clamp(Number(expectedHeight) || 64, 18, 420);
  const rise = smoothstep(3, Math.max(18, expected * 0.74), Math.max(0, Number(flightHeight) || 0));
  let altitude = clamp(Number(ceiling) || 0, 0, 1) * rise;
  if ((Number(verticalVelocity) || 0) > 0) {
    // Restore the real wave before the dangerous landing window. This changes
    // only presentation altitude; horizontal world position remains intact.
    const descentReturn = smoothstep(
      7,
      Math.max(24, expected * 0.68),
      Math.max(0, Number(surfaceClearance) || 0),
    );
    altitude *= descentReturn;
  }
  return clamp(altitude, 0, 1);
}

export function aerialZoneForAltitude(altitude = 0) {
  const value = clamp(Number(altitude) || 0, 0, 1);
  for (let index = AERIAL_ZONES.length - 1; index >= 0; index -= 1) {
    if (value + 1e-9 >= AERIAL_ZONES[index].start) return AERIAL_ZONES[index];
  }
  return AERIAL_ZONES[0];
}

export function aerialMilestoneForAltitude(altitude = 0) {
  const value = clamp(Number(altitude) || 0, 0, 1);
  let result = null;
  for (const milestone of AERIAL_MILESTONES) {
    if (value + 1e-9 >= milestone.altitude) result = milestone;
  }
  return result;
}

/** Smooth authored camera shelves keep normal airs quiet and space expansive. */
export function aerialCameraTarget(altitude = 0, reducedMotion = false) {
  const value = clamp(Number(altitude) || 0, 0, 1);
  const target = 14 * smoothstep(0.02, 0.2, value)
    + 54 * smoothstep(0.2, 0.5, value)
    + 56 * smoothstep(0.5, 0.8, value)
    + 50 * smoothstep(0.8, 1, value);
  // Framing is required to keep Kaki visible; Reduced Motion scales travel
  // instead of disabling the camera and allowing exceptional airs off-screen.
  return target * (reducedMotion ? 0.72 : 1);
}

/**
 * Stateless high-air compression. The rational curve is continuous at the
 * threshold, strictly monotonic for every finite Y, and approaches (without
 * reaching) the complete-rider top bound. It has no camera or flight-history
 * input, so ascent and descent always use the same projection.
 */
export function projectAirY(
  naturalY,
  compressionStartY = AIR_PROJECTION.compressionStartY,
) {
  const physicalY = Number(naturalY);
  if (!Number.isFinite(physicalY)) return 0;
  const start = Number.isFinite(Number(compressionStartY))
    ? Number(compressionStartY)
    : AIR_PROJECTION.compressionStartY;
  if (physicalY >= start) return physicalY;

  // Use two constant-slope spans through the complete authored flight range.
  // The first preserves the strong visual motion of existing big airs; the
  // second fits the newly earned full-stack range without pinning the rider.
  // The retired rational curve approached its top bound asymptotically, which
  // collapsed 7+ physical pixels into the same rendered row near the apex.
  const supportedBottom = Math.min(start - 1, AIR_PROJECTION.supportedMinimumY);
  const supportedFinal = Math.max(
    AIR_PROJECTION.minimumY + 0.001,
    Math.min(start - 0.001, AIR_PROJECTION.supportedFinalY),
  );
  const pivotY = Math.max(
    supportedBottom + 1,
    Math.min(start - 1, AIR_PROJECTION.highAirPivotY),
  );
  const pivotFinalY = Math.max(
    supportedFinal + 0.001,
    Math.min(start - 0.001, AIR_PROJECTION.highAirPivotFinalY),
  );
  const upperRatio = (start - pivotFinalY) / (start - pivotY);
  if (physicalY >= pivotY) {
    return start + (physicalY - start) * upperRatio;
  }
  const extremeRatio = (pivotFinalY - supportedFinal) / (pivotY - supportedBottom);
  if (physicalY >= supportedBottom) {
    return pivotFinalY + (physicalY - pivotY) * extremeRatio;
  }

  // Unsupported heights retain the same derivative at the join, then ease
  // toward the canvas top without a clamp or discontinuity.
  const tailSpan = supportedFinal - AIR_PROJECTION.minimumY;
  const tailRise = supportedBottom - physicalY;
  return AIR_PROJECTION.minimumY
    + tailSpan / (1 + (extremeRatio / tailSpan) * tailRise);
}

/** Keep the complete rider silhouette inside the canvas at earned extreme air. */
export function riderScaleForProjectedY(projectedY, topExtent = 50) {
  const y = Number(projectedY);
  const extent = Math.max(1, Number(topExtent) || 50);
  if (!Number.isFinite(y)) return 1;
  return clamp((y - 1) / extent, 0.18, 1);
}

export function aerialBackdropCropShelves(
  height = AERIAL_PANORAMA.height,
  viewportHeight = AERIAL_PANORAMA.viewportHeight,
) {
  const travel = Math.max(0, Number(height) - Number(viewportHeight));
  return Object.freeze({
    coast: Math.round(travel),
    cloud: Math.round(travel * (252 / 424)),
    upper: Math.round(travel * (104 / 424)),
    space: 0,
  });
}

export function aerialPanoramaCropY(
  altitude = 0,
  height = AERIAL_PANORAMA.height,
  viewportHeight = AERIAL_PANORAMA.viewportHeight,
) {
  const travel = Math.max(0, Number(height) - Number(viewportHeight));
  return Math.round(travel * (1 - smoothstep(0, 1, clamp(Number(altitude) || 0, 0, 1))));
}

export function aerialPanoramaCropX(
  cameraWorldX = 0,
  width = AERIAL_PANORAMA.width,
  viewportWidth = AERIAL_PANORAMA.viewportWidth,
  parallax = 0.22,
) {
  const span = Math.max(1, Number(width) || AERIAL_PANORAMA.width);
  // The reviewed panoramas put their single coastal landmark at this authored
  // shelf. Starting here also keeps the repaired outer-edge join outside the
  // opening crop while leaving useful signed travel in both directions.
  const base = Math.max(0, Math.min(span - Number(viewportWidth || 0), span * 0.125));
  const signed = base + (Number(cameraWorldX) || 0) * (Number(parallax) || 0);
  return ((signed % span) + span) % span;
}
