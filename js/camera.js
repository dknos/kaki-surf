import { clamp } from "./math.js";

export const DEFAULT_CAMERA_SETTINGS = Object.freeze({
  left: 88,
  right: 296,
  upper: 40,
  returnY: 88,
  riderSafeY: 52,
  exceptionalRiderSafeY: 68,
  exceptionalTrackingAir: 64,
  horizontalFrequency: 5.2,
  verticalRiseFrequency: 6.4,
  verticalReturnFrequency: 4.2,
  minimumTrackingAir: 36,
  maxVelocityX: 180,
  maxAccelerationX: 720,
  maxVelocityY: 340,
  maxAccelerationY: 2800,
});

export function createCameraState(settings = {}) {
  return {
    worldX: 0,
    worldY: 0,
    velocityX: 0,
    velocityY: 0,
    verticalTracking: false,
    verticalAnchorY: 0,
    settings: { ...DEFAULT_CAMERA_SETTINGS, ...settings },
  };
}

/** Presentation-only, acceleration-limited critically damped camera. */
export function updateCamera(camera, player, dt) {
  const settings = camera.settings;
  const playerWorldX = Number(player?.worldX) || 0;
  const screenX = playerWorldX - camera.worldX;
  let targetX = camera.worldX;
  if (screenX > settings.right) targetX = playerWorldX - settings.right;
  else if (screenX < settings.left) targetX = playerWorldX - settings.left;
  stepAxis(camera, "worldX", "velocityX", targetX, settings.horizontalFrequency,
    settings.maxVelocityX, settings.maxAccelerationX, dt);

  const airborne = player?.state === "airborne" || player?.state === "wipeout";
  const playerWorldY = Number(player?.airY) || 0;
  const screenY = playerWorldY - camera.worldY;
  const qualifiedAirHeight = Math.max(
    Number(player?.maxAirHeight) || 0,
    Number(player?.aerialExpectedHeight) || 0,
  );
  if (airborne && !camera.verticalTracking
    && screenY < settings.upper
    && qualifiedAirHeight >= settings.minimumTrackingAir) {
    camera.verticalTracking = true;
    camera.verticalAnchorY = Math.min(0, playerWorldY - settings.upper);
    // Match most of the launch velocity immediately without moving position.
    // This prevents a powerful rebound from outrunning the camera in its first
    // few frames while preserving a continuous takeoff screen coordinate.
    camera.velocityY = Math.min(
      camera.velocityY,
      clamp(Number(player?.airVY) || 0, -settings.maxVelocityY, 0),
    );
  } else if (!airborne && camera.verticalTracking) {
    camera.verticalTracking = false;
  }
  let targetVelocityY = 0;
  if (camera.verticalTracking) {
    if ((Number(player?.airVY) || 0) <= 0) {
      camera.verticalAnchorY = Math.min(camera.verticalAnchorY, playerWorldY - settings.upper);
      targetVelocityY = Number(player?.airVY) || 0;
    } else {
      // Follow re-entry down on the same camera path. Keeping tracking armed
      // for the complete flight prevents release/reacquire oscillation.
      const descentTarget = playerWorldY - settings.returnY;
      if (descentTarget > camera.verticalAnchorY) {
        camera.verticalAnchorY = Math.min(0, descentTarget);
        targetVelocityY = descentTarget < 0 ? Number(player?.airVY) || 0 : 0;
      }
    }
  }
  const targetY = camera.verticalTracking ? camera.verticalAnchorY : 0;
  const frequency = targetY < camera.worldY
    ? settings.verticalRiseFrequency
    : settings.verticalReturnFrequency;
  stepAxis(camera, "worldY", "velocityY", targetY, frequency,
    settings.maxVelocityY, settings.maxAccelerationY, dt, targetVelocityY);
  if (camera.worldY > 0) {
    camera.worldY = 0;
    camera.velocityY = 0;
  }
  if (!airborne && Math.abs(camera.worldY) < 0.001 && Math.abs(camera.velocityY) < 0.01) {
    camera.worldY = 0;
    camera.velocityY = 0;
    camera.verticalAnchorY = 0;
  }
  return camera;
}

export function cameraLayerOffset(layer, camera, shakeX = 0, shakeY = 0, reducedMotion = false) {
  if (layer !== "world" && layer !== "stage") return { x: 0, y: 0 };
  return worldCameraOffset(camera, shakeX, shakeY, reducedMotion);
}

/**
 * One physical presentation camera owns the complete surf stage. Looking up
 * makes worldY negative, so world content moves down by the inverse amount.
 * Reduced Motion removes impact shake but retains required camera framing.
 */
export function worldCameraOffset(camera, shakeX = 0, shakeY = 0, reducedMotion = false) {
  return {
    x: reducedMotion ? 0 : Number(shakeX) || 0,
    y: -(Number(camera?.worldY) || 0) + (reducedMotion ? 0 : Number(shakeY) || 0),
  };
}

/** Bounded shake helper retained for non-camera impact effects. */
export function fixedStageOffset(shakeX = 0, shakeY = 0, reducedMotion = false) {
  return {
    x: reducedMotion ? 0 : Number(shakeX) || 0,
    y: reducedMotion ? 0 : Number(shakeY) || 0,
  };
}

/** Positive presentation allowance derived from the legacy signed signal. */
export function riderFrameSignal(camera) {
  return Math.max(0, -(Number(camera?.worldY) || 0));
}

/** Board anchor band leaves room for Kaki's upright high-air silhouette. */
export function riderSafeTopY(player, settings = DEFAULT_CAMERA_SETTINGS) {
  const exceptional = (Number(player?.maxAirHeight) || 0)
      >= (Number(settings?.exceptionalTrackingAir) || 64)
    || (Number(player?.aerialAltitudeCeiling) || 0) >= 0.5
    || Boolean(player?.aerialSpaceQualified);
  return exceptional
    ? Number(settings?.exceptionalRiderSafeY) || 68
    : Number(settings?.riderSafeY) || 52;
}

/** Settled rider-only target used by deterministic visual fixtures. */
export function riderFrameCameraTarget(player, safeTopY = riderSafeTopY(player)) {
  if (player?.state !== "airborne") return 0;
  const naturalY = Number(player?.airY);
  if (!Number.isFinite(naturalY)) return 0;
  return Math.min(0, naturalY - (Number(safeTopY) || DEFAULT_CAMERA_SETTINGS.riderSafeY));
}

function stepAxis(camera, positionKey, velocityKey, target, frequency, maxVelocity, maxAcceleration, dt, targetVelocity = 0) {
  if (!(dt > 0)) return;
  const position = Number(camera[positionKey]) || 0;
  const velocity = Number(camera[velocityKey]) || 0;
  const omega = Math.max(0.01, Number(frequency) || 1) * 2;
  const desiredAcceleration = omega * omega * (target - position)
    + 2 * omega * ((Number(targetVelocity) || 0) - velocity);
  const acceleration = clamp(desiredAcceleration, -maxAcceleration, maxAcceleration);
  const nextVelocity = clamp(velocity + acceleration * dt, -maxVelocity, maxVelocity);
  camera[velocityKey] = nextVelocity;
  camera[positionKey] = position + nextVelocity * dt;
}
