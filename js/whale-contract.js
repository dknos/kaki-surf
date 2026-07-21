import { clamp } from "./math.js";

const PHASE_VISUALS = Object.freeze({
  distant: Object.freeze({ scale: 0.56, contactY: 5, collisionY: 4, radiusScale: 0.6, rotation: 0, occlusionDepth: 3, foamX: 0 }),
  blow: Object.freeze({ scale: 0.68, contactY: 4, collisionY: 3, radiusScale: 0.7, rotation: 0, occlusionDepth: 4, foamX: 0 }),
  breach: Object.freeze({ scale: 0.82, contactY: 0, collisionY: -5, radiusScale: 0.82, rotation: 0.48, occlusionDepth: 5, foamX: 0 }),
  ramp: Object.freeze({ scale: 0.92, contactY: 0, collisionY: -7, radiusScale: 0.88, rotation: 0.06, occlusionDepth: 7, foamX: -4 }),
  mounted: Object.freeze({ scale: 1, contactY: 0, collisionY: -8, radiusScale: 1, rotation: 0, occlusionDepth: 8, foamX: -8 }),
  dismount: Object.freeze({ scale: 0.9, contactY: 0, collisionY: -6, radiusScale: 0.9, rotation: 0.28, occlusionDepth: 5, foamX: 0 }),
  splash: Object.freeze({ scale: 0.96, contactY: 0, collisionY: 0, radiusScale: 0.9, rotation: 0, occlusionDepth: 9, foamX: 0 }),
  depart: Object.freeze({ scale: 0.66, contactY: 4, collisionY: 3, radiusScale: 0.7, rotation: 0, occlusionDepth: 4, foamX: 4 }),
});

/**
 * Per-phase art/collision contract. `waterAnchorY` is simulation truth and is
 * never replaced by a frame-family anchor. A breach begins and ends on it.
 */
export function whaleFrameMetadata(entity = {}) {
  const phase = Object.hasOwn(PHASE_VISUALS, entity.phase) ? entity.phase : "distant";
  const visual = PHASE_VISUALS[phase];
  const duration = Math.max(1e-6, finite(entity.phaseDuration, 1));
  const progress = clamp(finite(entity.phaseTime) / duration, 0, 1);
  const direction = Math.sign(entity.direction) || 1;
  const waterY = finite(entity.waterAnchorY, finite(entity.y, 126));
  const breachLift = phase === "breach" ? Math.sin(progress * Math.PI) * 44 : 0;
  const dismountLift = phase === "dismount" ? Math.sin(progress * Math.PI) * 24 : 0;
  const lift = breachLift + dismountLift;
  const travelArcX = phase === "breach" ? direction * (progress - 0.5) * 18 : 0;
  const drawY = waterY - lift - (phase === "breach" ? 15 : phase === "dismount" ? 11 : 7);
  const collisionY = waterY - lift + visual.collisionY;
  return {
    phase,
    progress,
    drawAnchor: Object.freeze({ x: travelArcX, y: drawY }),
    waterContactAnchor: Object.freeze({ x: 0, y: waterY + visual.contactY }),
    collision: Object.freeze({ x: 0, y: collisionY, radiusScale: visual.radiusScale }),
    phaseScale: visual.scale,
    rotation: direction * visual.rotation * (phase === "breach" ? 1 - progress * 2 : 1),
    rotationAllowance: Math.abs(visual.rotation),
    occlusionDepth: visual.occlusionDepth,
    foamOrigin: Object.freeze({ x: visual.foamX * direction, y: waterY }),
    lift,
  };
}

export function whaleAnchorError(entity = {}) {
  const metadata = whaleFrameMetadata(entity);
  return Math.abs(metadata.foamOrigin.y - finite(entity.waterAnchorY, metadata.foamOrigin.y));
}

export function whaleForegroundMask(metadata = {}) {
  const scale = clamp(finite(metadata.phaseScale, 1), 0.4, 1.4);
  const y = finite(metadata.foamOrigin?.y);
  const depth = Math.max(2, Math.round(finite(metadata.occlusionDepth, 5)));
  return Object.freeze({
    halfWidth: Math.round(31 * scale),
    y,
    depth,
  });
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}
