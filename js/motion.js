import { clamp } from "./math.js";

export const WAKE_SAMPLE_CAPACITY = 56;
export const WAKE_SAMPLE_LIFETIME = 1.1;

/**
 * One canonical projection from along-break and face motion into screen/world
 * motion. Canvas sprites face +x in source art, so spriteAngle is the single
 * angle to use together with one horizontal direction flip.
 */
export function deriveCanonicalMotion(vx, faceVelocity, surfaceGradient = {}, fallbackDirection = 1) {
  const safeVX = finite(vx);
  const safeFaceVelocity = finite(faceVelocity);
  const gradientX = finite(surfaceGradient.x);
  const gradientFace = finite(surfaceGradient.face);
  const vy = gradientX * safeVX + gradientFace * safeFaceVelocity;
  const speed = Math.hypot(safeVX, vy);
  const direction = Math.abs(safeVX) > 1e-6
    ? Math.sign(safeVX)
    : Math.sign(fallbackDirection) || 1;
  const heading = speed > 1e-6 ? Math.atan2(vy, safeVX) : 0;
  const spriteAngle = direction * Math.atan2(vy, Math.max(1e-6, Math.abs(safeVX)));
  return {
    vx: safeVX,
    vy,
    speed,
    direction,
    heading,
    spriteAngle,
    downhill: speed > 1e-6 ? clamp(vy / speed, 0, 1) : 0,
    uphill: speed > 1e-6 ? clamp(-vy / speed, 0, 1) : 0,
  };
}

export function deriveAirMotion(vx, vy, fallbackDirection = 1) {
  const safeVX = finite(vx);
  const safeVY = finite(vy);
  const speed = Math.hypot(safeVX, safeVY);
  return {
    vx: safeVX,
    vy: safeVY,
    speed,
    direction: Math.abs(safeVX) > 1e-6
      ? Math.sign(safeVX)
      : Math.sign(fallbackDirection) || 1,
    heading: speed > 1e-6 ? Math.atan2(safeVY, safeVX) : 0,
    downhill: speed > 1e-6 ? clamp(safeVY / speed, 0, 1) : 0,
    uphill: speed > 1e-6 ? clamp(-safeVY / speed, 0, 1) : 0,
  };
}

export function spriteHeadingVector(spriteAngle, direction = 1) {
  const sign = Math.sign(direction) || 1;
  return {
    x: Math.cos(spriteAngle) * sign,
    y: Math.sin(spriteAngle) * sign,
  };
}

export function boardTailContact(x, y, heading, halfLength = 17) {
  return {
    x: finite(x) - Math.cos(finite(heading)) * Math.max(0, finite(halfLength)),
    y: finite(y) - Math.sin(finite(heading)) * Math.max(0, finite(halfLength)),
  };
}

/**
 * Wake/spray inherits opposite rider velocity plus bounded perpendicular
 * turbulence. The final projection guarantees it can never point ahead.
 */
export function wakeParticleVelocity(riderVX, riderVY, turbulence = 0, inherit = 0.34) {
  const vx = finite(riderVX);
  const vy = finite(riderVY);
  const speed = Math.hypot(vx, vy);
  if (speed <= 1e-6) return { vx: 0, vy: -Math.abs(finite(turbulence)) };
  const nx = vx / speed;
  const ny = vy / speed;
  const tx = -ny;
  const ty = nx;
  let wakeVX = -vx * clamp(finite(inherit), 0, 1) + tx * finite(turbulence);
  let wakeVY = -vy * clamp(finite(inherit), 0, 1) + ty * finite(turbulence);
  const ahead = wakeVX * vx + wakeVY * vy;
  if (ahead > 0) {
    const projection = ahead / Math.max(1e-6, speed * speed);
    wakeVX -= vx * projection;
    wakeVY -= vy * projection;
  }
  return { vx: wakeVX, vy: wakeVY };
}

export function createWakeSample() {
  return {
    active: false,
    worldX: 0,
    y: 0,
    vx: 0,
    vy: 0,
    sourceVX: 0,
    sourceVY: 0,
    speed: 0,
    age: 0,
  };
}

function finite(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}
