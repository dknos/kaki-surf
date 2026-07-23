import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./config.js";
import { clamp } from "./math.js";

export const TURBO_EFFECT_LIMITS = Object.freeze({
  riderAfterimages: 4,
  speedDashes: 32,
  sparks: 48,
  shockRings: 3,
  trailHistory: 12,
});

const ACTIVE_RIDE_STATES = new Set(["riding", "lip", "landing", "wobble"]);

export function createTurboPresentationState() {
  return {
    time: 0,
    serial: 0,
    dashClock: 0,
    sparkClock: 0,
    echoClock: 0,
    ignitionLife: 0,
    cookingLife: 0,
    completionSnapLife: 0,
    lastTier: "idle",
    echoes: Array.from({ length: TURBO_EFFECT_LIMITS.riderAfterimages }, createEcho),
    dashes: Array.from({ length: TURBO_EFFECT_LIMITS.speedDashes }, createDash),
    sparks: Array.from({ length: TURBO_EFFECT_LIMITS.sparks }, createSpark),
    rings: Array.from({ length: TURBO_EFFECT_LIMITS.shockRings }, createRing),
    trail: Array.from({ length: TURBO_EFFECT_LIMITS.trailHistory }, createTrailPoint),
    echoCursor: 0,
    dashCursor: 0,
    sparkCursor: 0,
    ringCursor: 0,
    trailCursor: 0,
  };
}

export function resetTurboPresentationState(state = createTurboPresentationState()) {
  state.time = 0;
  state.serial = 0;
  state.dashClock = 0;
  state.sparkClock = 0;
  state.echoClock = 0;
  state.ignitionLife = 0;
  state.cookingLife = 0;
  state.completionSnapLife = 0;
  state.lastTier = "idle";
  state.echoCursor = 0;
  state.dashCursor = 0;
  state.sparkCursor = 0;
  state.ringCursor = 0;
  state.trailCursor = 0;
  clearPool(state.echoes);
  clearPool(state.dashes);
  clearPool(state.sparks);
  clearPool(state.rings);
  clearPool(state.trail);
  return state;
}

/** Renderer-owned update. It reads simulation state and cannot write it. */
export function updateTurboPresentation(state, dt, simulation, settings = {}) {
  const step = Math.max(0, Number(dt) || 0);
  const player = simulation?.player ?? {};
  state.time += step;
  state.ignitionLife = Math.max(0, state.ignitionLife - step);
  state.cookingLife = Math.max(0, state.cookingLife - step);
  state.completionSnapLife = Math.max(0, state.completionSnapLife - step);
  agePool(state.echoes, step);
  agePool(state.dashes, step, true);
  agePool(state.sparks, step, true);
  agePool(state.rings, step);
  agePool(state.trail, step);

  const tier = resolvedTurboTier(player);
  const intensity = turboPresentationIntensity(player);
  const direction = Math.sign(player.motionDirection ?? player.travelDirection ?? 1) || 1;
  const reducedMotion = Boolean(settings.reducedMotion);
  state.lastTier = tier;

  if (intensity > 0 && ACTIVE_RIDE_STATES.has(player.state)) {
    const dashRate = reducedMotion ? 0 : 3 + intensity * 13;
    state.dashClock += step * dashRate;
    while (state.dashClock >= 1) {
      state.dashClock -= 1;
      spawnDash(state, direction, intensity);
    }
    const sparkRate = reducedMotion ? 2 + intensity * 4 : 4 + intensity * 13;
    state.sparkClock += step * sparkRate;
    while (state.sparkClock >= 1) {
      state.sparkClock -= 1;
      spawnSpark(state, simulation, direction, intensity);
    }
  } else {
    state.dashClock = 0;
    state.sparkClock = 0;
  }

  if (!reducedMotion && (tier === "redline" || tier === "cooking")) {
    state.echoClock += step * (tier === "cooking" ? 18 : 10 + intensity * 4);
    while (state.echoClock >= 1) {
      state.echoClock -= 1;
      captureEcho(state, simulation, tier === "cooking" ? 0.24 : 0.18);
    }
  } else {
    state.echoClock = 0;
  }

  if (player.state === "airborne") captureTrailPoint(state, player);
  return state;
}

export function handleTurboPresentationEvent(state, event, simulation) {
  const type = typeof event === "string" ? event : event?.type;
  const payload = typeof event === "string" ? {} : event?.payload ?? {};
  if (!type) return state;
  if (type === "turboStart") {
    state.ignitionLife = 0.2;
    spawnRing(state, simulation, 0.24, "ignition", 5);
  } else if (type === "turboFullBurn") {
    state.cookingLife = Math.max(0.75, Number(payload.duration) || 0);
    spawnRing(state, simulation, 0.42, "cooking", 8);
    for (let index = 0; index < 4; index += 1) captureEcho(state, simulation, 0.28 + index * 0.035);
  } else if (type === "trickCompleted" || type === "trickComplete" || type === "varial") {
    state.completionSnapLife = 0.12;
  } else if (type === "land") {
    const quality = payload.quality ?? "clean";
    if (quality === "perfect") spawnRing(state, simulation, 0.28, "landing", 6);
    if (quality !== "wobble" && quality !== "sketchy") {
      const count = quality === "perfect" ? 12 : 7;
      const direction = Math.sign(payload.landingDirection
        ?? simulation?.player?.travelDirection
        ?? 1) || 1;
      for (let index = 0; index < count; index += 1) {
        spawnSpark(state, simulation, direction, quality === "perfect" ? 1 : 0.65, true);
      }
    }
  } else if (type === "wipeout") {
    state.cookingLife = 0;
    state.lastTier = "idle";
    clearPool(state.echoes);
  }
  return state;
}

export function turboPresentationIntensity(player = {}) {
  if ((Number(player.turboCookingTimer) || 0) > 0 || player.turboTier === "cooking") return 1;
  if (!player.turboActive && !(Number(player.turboReleaseGrace) > 0)) return 0;
  const progress = clamp(Number(player.turboBurnProgress) || 0, 0, 1);
  return 0.18 + progress * 0.82;
}

export function drawTurboStageEffects(ctx, state, simulation, palette, settings = {}) {
  if (!ctx || !state || !simulation?.player) return;
  ctx.save();
  try {
    drawWakeRibbon(ctx, state, simulation, palette, settings);
    drawRings(ctx, state, simulation, palette, settings);
    drawSparks(ctx, state, simulation, palette, settings);
  } finally {
    ctx.restore();
  }
}

export function drawTurboRiderEffects(ctx, state, simulation, palette, settings = {}) {
  if (!ctx || !state || !simulation?.player) return;
  ctx.save();
  try {
    if (!settings.reducedMotion) drawEchoes(ctx, state, simulation, palette);
    drawMoveEffects(ctx, state, simulation, palette, settings);
    drawPeakSeparation(ctx, simulation, palette, settings);
  } finally {
    ctx.restore();
  }
}

export function drawTurboScreenEffects(ctx, state, simulation, palette, settings = {}) {
  if (!ctx || !state) return;
  ctx.save();
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (!settings.reducedMotion) {
      for (const dash of state.dashes) {
        if (dash.life <= 0) continue;
        const alpha = quantizedAlpha(dash.life / dash.maxLife);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = dash.accent ? boardAccent(simulation?.board?.id, palette) : palette.foam;
        const x = Math.round(dash.x);
        const y = Math.round(dash.y);
        const tail = Math.round(dash.length * (Math.sign(dash.vx) || 1));
        ctx.fillRect(x, y, tail, dash.accent ? 2 : 1);
        ctx.fillRect(x - Math.sign(dash.vx), y + 2, Math.round(tail * 0.45), 1);
      }
    }
    ctx.globalAlpha = 1;
  } finally {
    ctx.restore();
  }
}

export function turboPresentationSnapshot(state) {
  return Object.freeze({
    tier: state.lastTier,
    echoes: activeCount(state.echoes),
    dashes: activeCount(state.dashes),
    sparks: activeCount(state.sparks),
    rings: activeCount(state.rings),
    limits: TURBO_EFFECT_LIMITS,
  });
}

function createEcho() {
  return { active: false, life: 0, maxLife: 0, worldX: 0, y: 0, bodyAngle: 0, boardAngle: 0, direction: 1, boardId: "foamPuff" };
}

function createDash() {
  return { active: false, life: 0, maxLife: 0, x: 0, y: 0, vx: 0, length: 0, accent: false };
}

function createSpark() {
  return { active: false, life: 0, maxLife: 0, worldX: 0, y: 0, vx: 0, vy: 0, size: 1, accent: false };
}

function createRing() {
  return { active: false, life: 0, maxLife: 0, worldX: 0, y: 0, radius: 0, speed: 0, kind: "ignition" };
}

function createTrailPoint() {
  return { active: false, life: 0, maxLife: 0, worldX: 0, y: 0, rotation: 0, halfTurns: 0 };
}

function clearPool(pool) {
  for (const item of pool) {
    item.active = false;
    item.life = 0;
  }
}

function agePool(pool, dt, integrate = false) {
  for (const item of pool) {
    if (item.life <= 0) continue;
    item.life = Math.max(0, item.life - dt);
    item.active = item.life > 0;
    if (!integrate || !item.active) continue;
    item.x += (item.vx || 0) * dt;
    item.worldX += (item.vx || 0) * dt;
    item.y += (item.vy || 0) * dt;
    if ("vy" in item) item.vy += 28 * dt;
  }
}

function activeCount(pool) {
  let count = 0;
  for (const item of pool) if (item.life > 0) count += 1;
  return count;
}

function resolvedTurboTier(player) {
  if ((Number(player.turboCookingTimer) || 0) > 0) return "cooking";
  if (player.turboActive || (Number(player.turboReleaseGrace) || 0) > 0) {
    return player.turboTier || "ignition";
  }
  return "idle";
}

function spawnDash(state, direction, intensity) {
  const dash = state.dashes[state.dashCursor];
  state.dashCursor = (state.dashCursor + 1) % state.dashes.length;
  state.serial += 1;
  dash.active = true;
  dash.maxLife = 0.16 + (state.serial % 3) * 0.025;
  dash.life = dash.maxLife;
  dash.x = direction > 0 ? LOGICAL_WIDTH - 4 : 4;
  dash.y = 30 + ((state.serial * 37) % (LOGICAL_HEIGHT - 42));
  dash.vx = -direction * (76 + intensity * 84 + (state.serial % 5) * 7);
  dash.length = 3 + Math.round(intensity * 8) + state.serial % 4;
  dash.accent = state.serial % 4 === 0;
}

function spawnSpark(state, simulation, direction, intensity, landing = false) {
  const player = simulation?.player;
  if (!player) return;
  const spark = state.sparks[state.sparkCursor];
  state.sparkCursor = (state.sparkCursor + 1) % state.sparks.length;
  state.serial += 1;
  const rootY = player.state === "airborne"
    ? Number(player.airY) || 0
    : simulation.wave.ridingY(player.worldX, player.face);
  const lane = state.serial % 7;
  spark.active = true;
  spark.maxLife = landing ? 0.32 : 0.18 + (state.serial % 3) * 0.04;
  spark.life = spark.maxLife;
  spark.worldX = Number(player.worldX) - direction * (10 + lane * 2);
  spark.y = rootY + (landing ? 1 + lane : 3 + lane % 4);
  spark.vx = -direction * (landing ? 28 + lane * 7 : 18 + intensity * 34 + lane * 3);
  spark.vy = landing ? -16 - lane * 3 : -4 - lane;
  spark.size = state.serial % 5 === 0 ? 2 : 1;
  spark.accent = state.serial % 3 === 0;
}

function spawnRing(state, simulation, lifetime, kind, speed) {
  const player = simulation?.player;
  if (!player) return;
  const ring = state.rings[state.ringCursor];
  state.ringCursor = (state.ringCursor + 1) % state.rings.length;
  ring.active = true;
  ring.maxLife = lifetime;
  ring.life = lifetime;
  ring.worldX = Number(player.worldX) || 0;
  ring.y = player.state === "airborne"
    ? Number(player.airY) || 0
    : simulation.wave.ridingY(player.worldX, player.face);
  ring.radius = kind === "cooking" ? 7 : 4;
  ring.speed = speed;
  ring.kind = kind;
}

function captureEcho(state, simulation, lifetime) {
  const player = simulation?.player;
  if (!player) return;
  const echo = state.echoes[state.echoCursor];
  state.echoCursor = (state.echoCursor + 1) % state.echoes.length;
  echo.active = true;
  echo.maxLife = lifetime;
  echo.life = lifetime;
  echo.worldX = Number(player.worldX) || 0;
  echo.y = player.state === "airborne"
    ? Number(player.airY) || 0
    : simulation.wave.ridingY(player.worldX, player.face);
  echo.bodyAngle = Number(player.bodyAngle) || 0;
  echo.boardAngle = Number(player.boardAngle) || 0;
  echo.direction = Math.sign(player.motionDirection ?? player.travelDirection ?? 1) || 1;
  echo.boardId = simulation.board?.id ?? "foamPuff";
}

function captureTrailPoint(state, player) {
  const previousIndex = (state.trailCursor + state.trail.length - 1) % state.trail.length;
  const previous = state.trail[previousIndex];
  const rotation = Number(player.rotationAccum) || 0;
  const halfTurns = Math.floor(Math.abs(rotation) / Math.PI);
  if (previous.life > 0 && previous.halfTurns === halfTurns) return;
  const point = state.trail[state.trailCursor];
  state.trailCursor = (state.trailCursor + 1) % state.trail.length;
  point.active = true;
  point.maxLife = 0.42;
  point.life = point.maxLife;
  point.worldX = Number(player.worldX) || 0;
  point.y = Number(player.airY) || 0;
  point.rotation = rotation;
  point.halfTurns = halfTurns;
}

function drawWakeRibbon(ctx, state, simulation, palette, settings) {
  const player = simulation.player;
  const intensity = turboPresentationIntensity(player);
  if (intensity <= 0 || !ACTIVE_RIDE_STATES.has(player.state) || player.animalMount) return;
  const cameraX = Number(simulation.camera?.worldX) || 0;
  const direction = Math.sign(player.motionDirection ?? player.travelDirection ?? 1) || 1;
  const x = Math.round(player.worldX - cameraX - direction * 12);
  const y = Math.round(simulation.wave.ridingY(player.worldX, player.face) + 3);
  const length = Math.round(10 + intensity * (simulation.board?.id === "moonLog" ? 36 : 27));
  const accent = boardAccent(simulation.board?.id, palette);
  ctx.globalAlpha = 0.45 + intensity * 0.35;
  ctx.fillStyle = palette.foam;
  ctx.fillRect(x - direction * length, y, direction * length, 2);
  ctx.fillStyle = accent;
  ctx.fillRect(x - direction * Math.round(length * 0.78), y + 3, direction * Math.round(length * 0.78), 1);
  const accents = settings.reducedMotion ? 2 : 4;
  for (let index = 0; index < accents; index += 1) {
    const offset = 5 + index * Math.max(4, Math.floor(length / accents));
    drawBoardAccentShape(ctx, simulation.board?.id, x - direction * offset, y + 2 + index % 2, direction, accent);
  }
  ctx.globalAlpha = 1;
}

function drawRings(ctx, state, simulation, palette, settings) {
  const cameraX = Number(simulation.camera?.worldX) || 0;
  for (const ring of state.rings) {
    if (ring.life <= 0) continue;
    const progress = 1 - ring.life / ring.maxLife;
    const radius = Math.round(ring.radius + progress * ring.speed * 4);
    const x = Math.round(ring.worldX - cameraX);
    const y = Math.round(ring.y);
    const reducedFlash = Boolean(settings.reducedFlash);
    ctx.globalAlpha = quantizedAlpha(1 - progress);
    ctx.fillStyle = reducedFlash
      ? palette.gold
      : ring.kind === "cooking" ? palette.white : palette.gold;
    drawPixelRing(ctx, x, y, radius, ring.kind === "cooking" ? 2 : 1);
  }
  ctx.globalAlpha = 1;
}

function drawSparks(ctx, state, simulation, palette, settings) {
  const cameraX = Number(simulation.camera?.worldX) || 0;
  const reducedLimit = settings.reducedMotion ? 16 : state.sparks.length;
  let drawn = 0;
  for (const spark of state.sparks) {
    if (spark.life <= 0 || drawn >= reducedLimit) continue;
    drawn += 1;
    ctx.globalAlpha = quantizedAlpha(spark.life / spark.maxLife);
    ctx.fillStyle = spark.accent ? boardAccent(simulation.board?.id, palette) : palette.foam;
    ctx.fillRect(
      Math.round(spark.worldX - cameraX),
      Math.round(spark.y),
      spark.size,
      spark.size,
    );
  }
  ctx.globalAlpha = 1;
}

function drawEchoes(ctx, state, simulation, palette) {
  const cameraX = Number(simulation.camera?.worldX) || 0;
  for (const echo of state.echoes) {
    if (echo.life <= 0) continue;
    const progress = echo.life / echo.maxLife;
    const x = Math.round(echo.worldX - cameraX);
    const y = Math.round(echo.y);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(echo.direction, 1);
    ctx.globalAlpha = progress > 0.66 ? 0.42 : progress > 0.33 ? 0.28 : 0.16;
    ctx.fillStyle = boardAccent(echo.boardId, palette);
    ctx.rotate(echo.boardAngle);
    const halfLength = echo.boardId === "moonLog" ? 20 : echo.boardId === "mangoFish" ? 16 : 17;
    ctx.fillRect(-halfLength, 0, halfLength * 2, 2);
    ctx.rotate(echo.bodyAngle - echo.boardAngle);
    ctx.fillStyle = echo.boardId === "moonLog" ? palette.violet : palette.gold;
    ctx.fillRect(-6, -17, 12, 10);
    ctx.fillRect(-9, -31, 18, 13);
    ctx.fillRect(-12, -29, 4, 7);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function drawMoveEffects(ctx, state, simulation, palette, settings) {
  const player = simulation.player;
  if (player.state !== "airborne") return;
  const manifest = player.trickManifest;
  const id = manifest?.trickPose ?? player.trickPose;
  const progress = clamp(Number(manifest?.poseProgress) || 0, 0, 1);
  const cameraX = Number(simulation.camera?.worldX) || 0;
  const x = Math.round(player.worldX - cameraX);
  const y = Math.round(player.airY);
  const direction = Math.sign(player.motionDirection ?? player.travelDirection ?? 1) || 1;
  const accent = chainAccent(manifest?.sequence, simulation.board?.id, palette);
  ctx.globalAlpha = settings.reducedMotion ? 0.62 : 0.78;
  ctx.fillStyle = accent;

  if (id === "frontRailGrab") {
    drawReachTrail(ctx, x - direction * 5, y - 14, x + direction * 5, y, progress, direction);
    if (progress >= 0.42 && progress <= 0.84) drawPixelGlint(ctx, x + direction * 6, y, palette.white, accent);
  } else if (id === "tailGrab") {
    drawReachTrail(ctx, x - direction * 2, y - 13, x - direction * 14, y, progress, -direction, true);
    if (progress >= 0.46 && progress <= 0.86) drawPixelGlint(ctx, x - direction * 15, y, palette.white, accent);
  } else if (id === "boardVarial") {
    const count = settings.reducedMotion ? 1 : 3;
    for (let index = 1; index <= count; index += 1) {
      ctx.save();
      ctx.translate(x, y + 1);
      ctx.rotate((Number(player.boardAngle) || 0) - direction * index * 0.24 * progress);
      ctx.globalAlpha = 0.18 + index * 0.08;
      ctx.fillStyle = index === count ? accent : palette.foamShade;
      ctx.fillRect(-15, -1, 30, 2);
      ctx.restore();
    }
    if (state.completionSnapLife > 0) drawPixelGlint(ctx, x + direction * 9, y, palette.white, accent);
  } else if (id === "kakiTwist") {
    const twistDirection = Math.sign(player.angularVelocity || player.rotationAccum || direction) || direction;
    const count = settings.reducedMotion ? 3 : 6;
    for (let index = 0; index < count; index += 1) {
      const phase = progress * Math.PI * 2 * twistDirection + index * Math.PI * 2 / count;
      const radius = 7 + (index % 3) * 3;
      const starX = x + Math.round(Math.cos(phase) * radius);
      const starY = y - 13 + Math.round(Math.sin(phase) * radius * 0.55);
      ctx.fillRect(starX, starY, index % 2 ? 1 : 2, 1);
    }
  }

  let streaks = 0;
  for (const point of state.trail) {
    if (point.life <= 0 || point.halfTurns <= 0 || streaks >= 4) continue;
    streaks += 1;
    const px = Math.round(point.worldX - cameraX);
    const py = Math.round(point.y - 15);
    ctx.fillStyle = streaks % 2 ? accent : palette.foam;
    ctx.fillRect(px - direction * (3 + streaks), py + streaks * 2, direction * (5 + streaks), 1);
  }
  ctx.globalAlpha = 1;
}

function drawPeakSeparation(ctx, simulation, palette, settings) {
  if (settings.reducedMotion) return;
  const player = simulation.player;
  const intensity = turboPresentationIntensity(player);
  if (intensity < 0.82) return;
  const cameraX = Number(simulation.camera?.worldX) || 0;
  const x = Math.round(player.worldX - cameraX);
  const y = Math.round(player.state === "airborne"
    ? player.airY
    : simulation.wave.ridingY(player.worldX, player.face));
  ctx.globalAlpha = 0.42;
  ctx.fillStyle = palette.crest;
  ctx.fillRect(x - 10, y - 25, 1, 18);
  ctx.fillStyle = palette.gold;
  ctx.fillRect(x + 10, y - 24, 1, 17);
  ctx.globalAlpha = 1;
}

function drawReachTrail(ctx, fromX, fromY, toX, toY, progress, direction, curved = false) {
  const amount = clamp(progress / 0.58, 0, 1);
  const steps = 4;
  for (let index = 0; index < steps; index += 1) {
    const t = (index + 1) / steps * amount;
    const x = Math.round(fromX + (toX - fromX) * t);
    const bend = curved ? Math.round(Math.sin(t * Math.PI) * 4) : 0;
    const y = Math.round(fromY + (toY - fromY) * t + bend);
    ctx.fillRect(x - direction * (steps - index), y, 2, 1);
  }
}

function drawPixelGlint(ctx, x, y, core, accent) {
  ctx.fillStyle = accent;
  ctx.fillRect(x - 3, y, 7, 1);
  ctx.fillRect(x, y - 3, 1, 7);
  ctx.fillStyle = core;
  ctx.fillRect(x, y, 2, 2);
}

function drawPixelRing(ctx, x, y, radius, thickness) {
  const diagonal = Math.max(1, Math.round(radius * 0.7));
  ctx.fillRect(x - diagonal, y - radius, diagonal * 2, thickness);
  ctx.fillRect(x - diagonal, y + radius, diagonal * 2, thickness);
  ctx.fillRect(x - radius, y - diagonal, thickness, diagonal * 2);
  ctx.fillRect(x + radius, y - diagonal, thickness, diagonal * 2);
  ctx.fillRect(x - diagonal - 2, y - diagonal - 2, thickness + 1, thickness + 1);
  ctx.fillRect(x + diagonal, y - diagonal - 2, thickness + 1, thickness + 1);
  ctx.fillRect(x - diagonal - 2, y + diagonal, thickness + 1, thickness + 1);
  ctx.fillRect(x + diagonal, y + diagonal, thickness + 1, thickness + 1);
}

function drawBoardAccentShape(ctx, boardId, x, y, direction, color) {
  ctx.fillStyle = color;
  if (boardId === "mangoFish") {
    ctx.fillRect(x - direction * 3, y, direction * 5, 1);
    ctx.fillRect(x - direction, y - 1, direction * 3, 1);
  } else if (boardId === "moonLog") {
    ctx.fillRect(x - direction * 3, y, direction * 5, 2);
    ctx.fillRect(x - direction * 2, y + 2, direction * 3, 1);
  } else {
    ctx.fillRect(x - 2, y - 1, 4, 4);
    ctx.fillRect(x - 3, y, 6, 2);
  }
}

function boardAccent(boardId, palette) {
  if (boardId === "mangoFish") return palette.gold;
  if (boardId === "moonLog") return palette.violet;
  return palette.foam;
}

function chainAccent(sequence, boardId, palette) {
  const varied = uniqueTrickCount(sequence);
  if (varied >= 3) return palette.gold;
  if (varied >= 2) return palette.crest;
  return boardAccent(boardId, palette);
}

function uniqueTrickCount(sequence) {
  if (!Array.isArray(sequence)) return 0;
  let count = 0;
  for (let index = 0; index < sequence.length; index += 1) {
    const id = sequence[index]?.id;
    if (!id) continue;
    let seen = false;
    for (let previous = 0; previous < index; previous += 1) {
      if (sequence[previous]?.id === id) {
        seen = true;
        break;
      }
    }
    if (!seen) count += 1;
  }
  return Math.min(3, count);
}

function quantizedAlpha(value) {
  const amount = clamp(Number(value) || 0, 0, 1);
  if (amount >= 0.75) return 0.82;
  if (amount >= 0.5) return 0.58;
  if (amount >= 0.25) return 0.34;
  return 0.16;
}
