import { clamp } from "./math.js";

export const DEFAULT_CAMERA_SETTINGS = Object.freeze({
  left: 88,
  right: 296,
  upper: 48,
  returnY: 72,
  horizontalFrequency: 5.2,
  verticalRiseFrequency: 6.4,
  verticalReturnFrequency: 3.2,
  minimumTrackingAir: 36,
  maxVelocityX: 180,
  maxAccelerationX: 720,
  maxVelocityY: 120,
  maxAccelerationY: 620,
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
  if (airborne && !camera.verticalTracking
    && screenY < settings.upper
    && (Number(player?.maxAirHeight) || 0) >= settings.minimumTrackingAir) {
    camera.verticalTracking = true;
    camera.verticalAnchorY = Math.min(0, playerWorldY - settings.upper);
  } else if ((!airborne || screenY > settings.returnY) && camera.verticalTracking) {
    camera.verticalTracking = false;
  }
  if (camera.verticalTracking) {
    camera.verticalAnchorY = Math.min(camera.verticalAnchorY, playerWorldY - settings.upper);
  }
  const targetY = camera.verticalTracking ? camera.verticalAnchorY : 0;
  const frequency = targetY < camera.worldY
    ? settings.verticalRiseFrequency
    : settings.verticalReturnFrequency;
  stepAxis(camera, "worldY", "velocityY", targetY, frequency,
    settings.maxVelocityY, settings.maxAccelerationY, dt);
  if (!airborne && Math.abs(camera.worldY) < 0.001 && Math.abs(camera.velocityY) < 0.01) {
    camera.worldY = 0;
    camera.velocityY = 0;
    camera.verticalAnchorY = 0;
  }
  return camera;
}

export function cameraLayerOffset(layer, camera, shakeX = 0, shakeY = 0, reducedMotion = false) {
  if (layer !== "world") return { x: 0, y: 0 };
  return {
    x: reducedMotion ? 0 : Number(shakeX) || 0,
    y: (reducedMotion ? 0 : Number(shakeY) || 0) - (Number(camera?.worldY) || 0),
  };
}

function stepAxis(camera, positionKey, velocityKey, target, frequency, maxVelocity, maxAcceleration, dt) {
  if (!(dt > 0)) return;
  const position = Number(camera[positionKey]) || 0;
  const velocity = Number(camera[velocityKey]) || 0;
  const omega = Math.max(0.01, Number(frequency) || 1) * 2;
  const desiredAcceleration = omega * omega * (target - position) - 2 * omega * velocity;
  const acceleration = clamp(desiredAcceleration, -maxAcceleration, maxAcceleration);
  const nextVelocity = clamp(velocity + acceleration * dt, -maxVelocity, maxVelocity);
  camera[velocityKey] = nextVelocity;
  camera[positionKey] = position + nextVelocity * dt;
}
