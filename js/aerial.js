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

export const AERIAL_BACKDROP = Object.freeze({
  enterAltitude: 0.22,
  exitAltitude: 0.14,
  riseRate: 0.52,
  returnRate: 1.05,
  cloudStart: 0.2,
  cloudEnd: 0.46,
  upperStart: 0.48,
  upperEnd: 0.74,
  spaceStart: 0.78,
  spaceEnd: 0.94,
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
  const expectedHeight = clamp(
    18 + strength * strength * 54 * scale * turboLiftMultiplier,
    18,
    236,
  );

  return Object.freeze({
    zone,
    ceiling,
    lineQuality,
    turbo,
    turboLiftMultiplier,
    spaceQualified,
    expectedHeight,
  });
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
  const expected = clamp(Number(expectedHeight) || 64, 18, 236);
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
 * High airs use a rider-only framing offset. The physical wave stays locked to
 * its authored screen shelf, while Kaki is held inside the readable top band
 * only after the real flight path would otherwise leave the frame.
 */
export function aerialRiderFrameOffset(
  player,
  cameraOffset = 0,
  safeBoardY = 52,
  naturalAirY = player?.airY,
) {
  if (player?.state !== "airborne") return 0;
  const airY = Number(naturalAirY);
  if (!Number.isFinite(airY)) return 0;
  const required = Math.max(0, Number(safeBoardY) - airY);
  return Math.min(required, Math.max(0, Number(cameraOffset) || 0));
}

/** Stateful atmospheric presentation. It never reads physical camera state. */
export function createAerialBackdropState(initialAltitude = 0) {
  const altitude = clamp(Number(initialAltitude) || 0, 0, 1);
  return {
    active: altitude >= AERIAL_BACKDROP.enterAltitude,
    altitude,
    previousAltitude: altitude,
    frameDelta: 0,
    maximumFrameDelta: 0,
    blend: aerialBackdropBlendState(altitude),
  };
}

export function updateAerialBackdropState(state, player, dt) {
  const next = state ?? createAerialBackdropState();
  const authored = player?.state === "airborne"
    ? clamp(Number(player?.aerialAltitude) || 0, 0, 1)
    : 0;
  if (!next.active && authored >= AERIAL_BACKDROP.enterAltitude) next.active = true;
  if (next.active && authored <= AERIAL_BACKDROP.exitAltitude) next.active = false;
  const target = next.active ? authored : 0;
  // A browser hitch must slow the transition rather than jump the mask.
  const seconds = Math.min(1 / 60, Math.max(0, Number(dt) || 0));
  const rate = target > next.altitude
    ? AERIAL_BACKDROP.riseRate
    : AERIAL_BACKDROP.returnRate;
  const maximumStep = rate * seconds;
  const delta = clamp(target - next.altitude, -maximumStep, maximumStep);
  next.previousAltitude = next.altitude;
  next.altitude = clamp(next.altitude + delta, 0, 1);
  next.frameDelta = Math.abs(delta);
  next.maximumFrameDelta = Math.max(next.maximumFrameDelta, next.frameDelta);
  next.blend = aerialBackdropBlendState(next.altitude);
  return next;
}

export function aerialBackdropBlendState(altitude = 0) {
  const value = clamp(Number(altitude) || 0, 0, 1);
  return Object.freeze({
    coastToCloud: smoothstep(AERIAL_BACKDROP.cloudStart, AERIAL_BACKDROP.cloudEnd, value),
    cloudToUpper: smoothstep(AERIAL_BACKDROP.upperStart, AERIAL_BACKDROP.upperEnd, value),
    upperToSpace: smoothstep(AERIAL_BACKDROP.spaceStart, AERIAL_BACKDROP.spaceEnd, value),
  });
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
