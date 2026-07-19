import { clamp } from "./math.js";

const DEFAULT_BOUNDS = Object.freeze({ minX: 48, maxX: 352, minY: 30, maxY: 196 });

export function sweptCircleDistanceSquared(aPrevious, aCurrent, bPrevious, bCurrent) {
  const ax0 = finite(aPrevious?.x);
  const ay0 = finite(aPrevious?.y);
  const bx0 = finite(bPrevious?.x);
  const by0 = finite(bPrevious?.y);
  const relativeX = ax0 - bx0;
  const relativeY = ay0 - by0;
  const relativeDeltaX = (finite(aCurrent?.x, ax0) - ax0) - (finite(bCurrent?.x, bx0) - bx0);
  const relativeDeltaY = (finite(aCurrent?.y, ay0) - ay0) - (finite(bCurrent?.y, by0) - by0);
  const lengthSquared = relativeDeltaX * relativeDeltaX + relativeDeltaY * relativeDeltaY;
  const closestTime = lengthSquared > 1e-10
    ? clamp(-(relativeX * relativeDeltaX + relativeY * relativeDeltaY) / lengthSquared, 0, 1)
    : 0;
  const closestX = relativeX + relativeDeltaX * closestTime;
  const closestY = relativeY + relativeDeltaY * closestTime;
  return closestX * closestX + closestY * closestY;
}

export function sweptCircleContact(aPrevious, aCurrent, aRadius, bPrevious, bCurrent, bRadius) {
  const radius = Math.max(0, finite(aRadius)) + Math.max(0, finite(bRadius));
  return sweptCircleDistanceSquared(aPrevious, aCurrent, bPrevious, bCurrent) <= radius * radius;
}

export function sweptAabbContact(aPrevious, aCurrent, aHalfWidth, aHalfHeight, bPrevious, bCurrent, bHalfWidth, bHalfHeight) {
  const expandedX = Math.max(0, finite(aHalfWidth)) + Math.max(0, finite(bHalfWidth));
  const expandedY = Math.max(0, finite(aHalfHeight)) + Math.max(0, finite(bHalfHeight));
  const relativeStartX = finite(aPrevious?.x) - finite(bPrevious?.x);
  const relativeStartY = finite(aPrevious?.y) - finite(bPrevious?.y);
  const relativeEndX = finite(aCurrent?.x, finite(aPrevious?.x)) - finite(bCurrent?.x, finite(bPrevious?.x));
  const relativeEndY = finite(aCurrent?.y, finite(aPrevious?.y)) - finite(bCurrent?.y, finite(bPrevious?.y));
  return segmentIntersectsBox(relativeStartX, relativeStartY, relativeEndX, relativeEndY, expandedX, expandedY);
}

export function reachableEnvelope({ player = {}, time = 1, control = {}, bounds = DEFAULT_BOUNDS } = {}) {
  const seconds = clamp(finite(time, 1), 0, 8);
  const x = finite(player.x, 192);
  const y = finite(player.y, 120);
  const vx = finite(player.vx);
  const vy = finite(player.vy);
  const horizontalAcceleration = Math.max(0, finite(control.horizontalAcceleration, 38));
  const verticalAcceleration = Math.max(0, finite(control.verticalAcceleration, 62));
  const maxHorizontalSpeed = Math.max(1, finite(control.maxHorizontalSpeed, 90));
  const maxVerticalSpeed = Math.max(1, finite(control.maxVerticalSpeed, 120));
  const gravity = finite(control.gravity, 0);
  const baseX = x + vx * seconds;
  const baseY = y + vy * seconds + gravity * seconds * seconds * 0.5;
  const horizontalReach = Math.min(
    maxHorizontalSpeed * seconds,
    horizontalAcceleration * seconds * seconds * 0.5,
  );
  const verticalReach = Math.min(
    maxVerticalSpeed * seconds,
    verticalAcceleration * seconds * seconds * 0.5,
  );
  const minX = clamp(baseX - horizontalReach, finite(bounds.minX, 0), finite(bounds.maxX, 384));
  const maxX = clamp(baseX + horizontalReach, finite(bounds.minX, 0), finite(bounds.maxX, 384));
  const minY = clamp(baseY - verticalReach, finite(bounds.minY, 0), finite(bounds.maxY, 216));
  const maxY = clamp(baseY + verticalReach, finite(bounds.minY, 0), finite(bounds.maxY, 216));
  return { minX: Math.min(minX, maxX), maxX: Math.max(minX, maxX), minY: Math.min(minY, maxY), maxY: Math.max(minY, maxY) };
}

export function isReachablePickup({ player = {}, target = {}, interceptTime = 1.4, pickupRadius = 8, playerRadius = 7, control, bounds } = {}) {
  const seconds = clamp(finite(interceptTime, 1.4), 0.1, 8);
  const envelope = reachableEnvelope({ player, time: seconds, control, bounds });
  const targetX = finite(target.x, 192) + finite(target.vx) * seconds;
  const targetY = finite(target.y, 120) + finite(target.vy) * seconds;
  const radius = Math.max(0, finite(pickupRadius, 8)) + Math.max(0, finite(playerRadius, 7));
  return targetX + radius >= envelope.minX
    && targetX - radius <= envelope.maxX
    && targetY + radius >= envelope.minY
    && targetY - radius <= envelope.maxY;
}

export function isSharkPathFair({
  player = {},
  shark = {},
  timeToImpact = 1.2,
  telegraphTime = 1.2,
  playerRadius = 7,
  sharkRadius = 10,
  clearance = 5,
  control,
  bounds = DEFAULT_BOUNDS,
} = {}) {
  const playerState = String(player.state ?? "riding");
  if (playerState === "entry" || playerState === "wipeout" || playerState === "landing" || playerState === "mounted" || playerState === "complete") return false;
  const seconds = clamp(finite(timeToImpact, 1.2), 0.05, 8);
  if (finite(telegraphTime, 1.2) < 0.75 || seconds < 0.45) return false;

  const envelope = reachableEnvelope({ player, time: seconds, control, bounds });
  const sharkX = finite(shark.x, 192) + finite(shark.vx) * seconds;
  const sharkY = finite(shark.y, 128) + finite(shark.vy) * seconds;
  const blockedRadius = Math.max(0, finite(playerRadius, 7))
    + Math.max(0, finite(sharkRadius, 10))
    + Math.max(0, finite(clearance, 5));

  const canPassAbove = envelope.minY <= sharkY - blockedRadius;
  const canPassBelow = envelope.maxY >= sharkY + blockedRadius;
  const canPassLeft = envelope.minX <= sharkX - blockedRadius;
  const canPassRight = envelope.maxX >= sharkX + blockedRadius;
  return canPassAbove || canPassBelow || canPassLeft || canPassRight;
}

export function projectWorldX(worldX, cameraWorldX, parallax, centerX = 192) {
  return finite(centerX, 192) + (finite(worldX) - finite(cameraWorldX)) * Math.max(0.0001, finite(parallax, 1));
}

export function worldXForScreenX(screenX, cameraWorldX, parallax, centerX = 192) {
  return finite(cameraWorldX) + (finite(screenX, centerX) - finite(centerX, 192)) / Math.max(0.0001, finite(parallax, 1));
}

export function isProjectedOffscreen(worldX, cameraWorldX, parallax, { width = 384, margin = 64, centerX = 192 } = {}) {
  const screenX = projectWorldX(worldX, cameraWorldX, parallax, centerX);
  return screenX < -Math.max(0, finite(margin, 64)) || screenX > finite(width, 384) + Math.max(0, finite(margin, 64));
}

function segmentIntersectsBox(x0, y0, x1, y1, halfWidth, halfHeight) {
  let enter = 0;
  let exit = 1;
  const deltaX = x1 - x0;
  const deltaY = y1 - y0;
  const pairs = [
    [-deltaX, x0 + halfWidth],
    [deltaX, halfWidth - x0],
    [-deltaY, y0 + halfHeight],
    [deltaY, halfHeight - y0],
  ];
  for (const [p, q] of pairs) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return false;
      continue;
    }
    const ratio = q / p;
    if (p < 0) enter = Math.max(enter, ratio);
    else exit = Math.min(exit, ratio);
    if (enter > exit) return false;
  }
  return true;
}

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
