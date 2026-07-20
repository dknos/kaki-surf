import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TUNING } from "./config.js";
import { clamp, smoothstep } from "./math.js";
import { drawAtlasFrame } from "./asset-drawing.js";
import { projectWavePoint, sampleWaveSection } from "./wave.js";

const FACE_BAND_COLORS = Object.freeze([
  "#12315c",
  "#164168",
  "#1c5577",
  "#1f6488",
  "#278fa3",
  "#48c4c9",
  "#62e0d8",
]);

export function isHeroBarrelWave(wave) {
  return wave?.profileId === "heroBarrel" || wave?.profile?.renderer === "heroBarrel";
}

/**
 * Six authored silhouette beats driven by canonical threat pressure. The
 * result is continuous, deterministic, and independent of rider direction.
 */
export function heroBarrelStage(wave, player = null) {
  const section = sampleWaveSection(wave, player?.x, {});
  const curlTimer = Math.max(0, Number(player?.curlTimer ?? 0));
  const caught = curlTimer > 0
    || (player?.state === "wipeout" && Number(player?.x ?? Infinity) <= canonicalContactX(wave) + 3);
  const collapseMix = caught
    ? player?.state === "wipeout"
      ? 1
      : smoothstep(0, TUNING.curlCatchDelay, curlTimer)
    : 0;
  return {
    id: caught ? "collapse" : section.stage,
    pressure: section.pressure,
    mix: caught ? collapseMix : section.stageMix,
    index: caught ? 5 : section.stageIndex,
    collapseMix,
    section,
  };
}

/**
 * Stable key points for the 384x216 Twilight composition. The lip endpoint is
 * the exact GameplayWave contact query; visual threat and collision cannot
 * drift apart as the barrel advances.
 */
export function heroBarrelGeometry(wave, player = null) {
  const stage = heroBarrelStage(wave, player);
  const section = stage.section;
  const pressure = section.pressure;
  const growth = section.growth;
  const collapse = stage.collapseMix;
  const opening = section.aperture * (1 - collapse * 0.28);
  const contactX = clamp(canonicalContactX(wave), 52, LOGICAL_WIDTH - 18);
  const powerFace = clamp(Number(wave?.powerFaceAt?.(contactX) ?? 0.58), 0.46, 0.7);
  const powerY = clamp(Number(wave?.ridingY?.(contactX, powerFace) ?? 144), 124, 166);
  const crestY = clamp(Number(wave?.crestY?.(contactX) ?? 79), 72, 88);
  const shoulderX = clamp(contactX - (48 + growth * 62), 54, 132);
  const shoulderY = 72 - growth * 50 + collapse * 8;
  const outerEntryY = 158 - growth * 30 + collapse * 8;
  const lipY = crestY + 3 + growth * 10 + collapse * 10;
  const pocketY = powerY + 2 - collapse * 10;
  const apertureRadiusX = section.apertureRadiusX * (1 - collapse * 0.18);
  const apertureLeft = clamp(contactX - apertureRadiusX * 1.28, 30, contactX - 18);
  // The negative space cuts fully through the pitching edge. This keeps the
  // barrel open to the right instead of producing a closed donut or pillar.
  const apertureRight = contactX + 8 - collapse * 2;
  const apertureTop = Math.max(36, shoulderY + 8 - opening * 4 + collapse * 12);
  const apertureBottom = Math.max(apertureTop + 30, powerY - 3 + opening * 14 - collapse * 12);
  const riderX = clamp(Number(player?.x ?? 208), 156, 306);
  const availableReach = Math.max(0, riderX - contactX - 8);
  const focusX = clamp(contactX + 10 + availableReach * growth, contactX + 6, 312);
  const focusFace = clamp(Number(wave?.powerFaceAt?.(focusX) ?? powerFace), 0.46, 0.7);
  const focusY = clamp(Number(wave?.ridingY?.(focusX, focusFace) ?? powerY), 126, 168);

  return {
    stage,
    pressure,
    growth,
    opening,
    collapse,
    contactX,
    collisionX: contactX,
    powerFace,
    powerY,
    crestY,
    shoulderX,
    shoulderY,
    outerEntryY,
    lipY,
    pocketY,
    focusX,
    focusY,
    foamEnergy: clamp(0.08 + growth * 0.62 + collapse * 0.35, 0.08, 1),
    aperture: {
      left: apertureLeft,
      top: apertureTop,
      right: apertureRight,
      bottom: apertureBottom,
      centerX: apertureLeft + (apertureRight - apertureLeft) * 0.58,
      centerY: apertureTop + (apertureBottom - apertureTop) * 0.57,
    },
  };
}

export function drawHeroBackWater(ctx, simulation, palette, settings, presentationClock = 0) {
  const p = palette;
  const reduced = Boolean(settings?.reducedMotion);
  const pulse = reduced ? 0 : Math.floor(Math.max(0, presentationClock) * 0.07) % 4;

  const depth = ctx.createLinearGradient(0, 78, 0, LOGICAL_HEIGHT);
  depth.addColorStop(0, p.water);
  depth.addColorStop(0.42, p.water);
  depth.addColorStop(1, p.waterDeep);
  ctx.fillStyle = depth;
  ctx.fillRect(0, 78, LOGICAL_WIDTH, LOGICAL_HEIGHT - 78);

  // The passed-water window is intentionally calm. Sparse static sparkles
  // imply depth without direction-changing speed lines or polygonal slabs.
  ctx.save();
  ctx.globalAlpha = settings?.highContrast ? 0.82 : 0.38;
  ctx.fillStyle = p.violet;
  for (let index = 0; index < 9; index += 1) {
    const column = index % 5;
    const row = Math.floor(index / 5);
    const x = 294 + column * 15 + ((row * 3 + index) % 4);
    const y = 88 + row * 19 + ((index * 7 + pulse) % 7);
    const size = index % 4 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.fillStyle = p.gold;
  for (let index = 0; index < 5; index += 1) {
    const x = 314 + (index * 19) % 55;
    const y = 94 + (index * 13) % 37;
    const size = index % 3 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

export function drawHeroBarrelBack(
  ctx,
  simulation,
  palette,
  settings,
  assets = null,
  presentationClocks = null,
) {
  const wave = simulation.wave;
  const player = simulation.player;
  const geometry = heroBarrelGeometry(wave, player);
  const flowClock = settings?.reducedMotion ? 0 : Number(presentationClocks?.swellContours ?? 0);
  const foamClock = settings?.reducedMotion ? 0 : Number(presentationClocks?.crest ?? 0);

  // The approved authored barrel supplies the hero silhouette when available;
  // deterministic canvas geometry remains a complete offline fallback.
  const authored = drawBarrelMass(ctx, wave, geometry, palette, settings, assets, flowClock);
  if (!authored) drawConnectedFaceBands(ctx, wave, geometry, palette, settings);
  drawPowerTrack(ctx, wave, geometry, palette, settings);
  if (!authored) drawFoamCrown(ctx, geometry, palette, settings, assets, foamClock);
  else drawAuthoredCrestMotion(ctx, geometry, palette, settings, foamClock);
  drawHeroReadAssist(ctx, simulation, geometry, palette, settings);
}

export function drawHeroBarrelFront(
  ctx,
  simulation,
  palette,
  settings,
  assets = null,
  presentationClocks = null,
) {
  const wave = simulation.wave;
  const player = simulation.player;
  const geometry = heroBarrelGeometry(wave, player);
  const clock = settings?.reducedMotion ? 0 : Number(presentationClocks?.crest ?? 0);
  const phase = Math.floor(clock * 0.3) % 7;

  // Only the last few foam fingers cross in front. Opaque foam terminates at
  // the canonical contact; detached spray may travel beyond it.
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = palette.foamShade;
  ctx.fillStyle = palette.foam;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.82;
  const lipContactX = visualCrownContactX(geometry);
  const fingerCount = 3 + Number(geometry.stage.index >= 3);
  for (let index = 0; index < fingerCount; index += 1) {
    const t = fingerCount <= 1 ? 0 : index / (fingerCount - 1);
    const x = lipContactX - 31 + t * 25;
    const y = geometry.lipY - 2 + t * 4;
    const drop = 4 + ((index * 7 + phase) % 6) + geometry.foamEnergy * 5;
    ctx.lineWidth = index === fingerCount - 1 ? 2 : 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 4, y + drop * 0.34, Math.min(lipContactX - 2, x + 5 + t * 3), y + drop);
    ctx.stroke();
  }

  const sprayCount = 3 + Math.round(geometry.foamEnergy * 6);
  for (let index = 0; index < sprayCount; index += 1) {
    const x = geometry.contactX + 3 + ((index * 13 + phase * 3) % 31);
    const y = geometry.lipY - 12 + ((index * 17 + phase) % 27);
    const size = index % 4 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();

  drawBoardContactSpray(ctx, simulation, palette, settings, assets, phase);
  drawCollapseBreak(ctx, geometry, palette, settings, phase);
}

function drawCollapseBreak(ctx, g, p, settings, phase) {
  if (g.collapse <= 0.02) return;
  const energy = smoothstep(0.02, 0.88, g.collapse);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = (settings?.highContrast ? 0.98 : 0.74) * energy;
  ctx.strokeStyle = p.foamShade;
  ctx.lineWidth = 4;

  // The lip folds down in three staggered sheets before breaking into pixels.
  // This is authored collapse motion, not an extra collision surface.
  const lipContactX = visualCrownContactX(g);
  for (let sheet = 0; sheet < 3; sheet += 1) {
    const x = lipContactX - 29 + sheet * 10;
    const y = g.lipY + 2 + sheet * 3;
    const drop = 13 + sheet * 7 + energy * 12;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 8, y + 5, x + 3, y + drop - 4, x + 10, y + drop);
    ctx.stroke();
  }

  ctx.fillStyle = p.foam;
  const sprayCount = 9 + Math.round(energy * 18);
  for (let index = 0; index < sprayCount; index += 1) {
    const x = g.contactX - 40 + ((index * 17 + phase * 5) % 70);
    const y = g.lipY + 8 + ((index * 23 + phase * 3) % 60);
    const size = index % 6 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function drawBarrelMass(ctx, wave, g, p, settings, assets, clock) {
  if (!settings?.highContrast && assets?.generated?.twilightHeroBarrel) {
    drawHeroForegroundWater(ctx, g, p, settings);
    drawAuthoredBarrel(ctx, g, settings, assets, clock);
    return true;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // One contour owns the wall, pocket, trough, and foreground. The negative
  // space above the trough is the real sky/backwater drawn earlier.
  ctx.fillStyle = p.waterDeep;
  ctx.globalAlpha = 1;
  traceBarrelBody(ctx, g);
  ctx.fill();

  ctx.save();
  traceBarrelBody(ctx, g);
  ctx.clip();

  // A broad mid-face value makes the wave a volume instead of a thin pipe.
  const faceLight = ctx.createLinearGradient(4, g.shoulderY, 282, 198);
  faceLight.addColorStop(0, p.waterDeep);
  faceLight.addColorStop(0.44, p.water);
  faceLight.addColorStop(0.78, p.waterLight);
  faceLight.addColorStop(1, p.water);
  ctx.fillStyle = faceLight;
  ctx.globalAlpha = settings?.highContrast ? 0.92 : 0.78;
  traceFaceVolume(ctx, g);
  ctx.fill();

  // A darker foreground belly weights the board-height trough without making
  // a detached platform.
  ctx.fillStyle = p.ink;
  ctx.globalAlpha = settings?.highContrast ? 0.34 : 0.18;
  ctx.beginPath();
  ctx.moveTo(-12, 204);
  ctx.bezierCurveTo(72, 190, 132, 187, g.focusX - 20, g.focusY + 22);
  ctx.bezierCurveTo(278, 184, 338, 205, LOGICAL_WIDTH + 8, 198);
  ctx.lineTo(LOGICAL_WIDTH + 8, LOGICAL_HEIGHT + 8);
  ctx.lineTo(-12, LOGICAL_HEIGHT + 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  return false;
}

function drawAuthoredBarrel(ctx, g, settings, assets, clock) {
  const widths = [156, 184, 212, 232, 252, 258];
  const heights = [78, 96, 116, 132, 144, 150];
  const index = clamp(Math.floor(g.stage.index), 0, widths.length - 1);
  const next = Math.min(widths.length - 1, index + 1);
  const mix = index === widths.length - 1 ? g.collapse : g.stage.mix;
  const width = widths[index] + (widths[next] - widths[index]) * mix;
  const height = heights[index] + (heights[next] - heights[index]) * mix;
  const motion = settings?.reducedMotion ? 0 : Math.sin(Math.max(0, clock) * 0.16) * 0.8;
  const contactX = visualCrownContactX(g);
  const troughY = clamp(g.focusY + 12 + g.collapse * 3, 145, 181);
  const x = contactX - width * 0.86;
  const y = troughY - height * 0.79 + motion;

  drawAtlasFrame(ctx, assets, "twilightHeroBarrel", "heroBarrel", x, y, {
    scale: 1,
    scaleX: width / 256,
    scaleY: height / 144,
    alpha: settings?.highContrast ? 1 : 0.98,
  });
}

function drawHeroForegroundWater(ctx, g, p, settings) {
  const topY = clamp(g.focusY + 8, 142, 177);
  const rightY = clamp(topY + 16 + g.growth * 5, 158, 194);
  ctx.save();
  const depth = ctx.createLinearGradient(0, topY, 0, LOGICAL_HEIGHT);
  depth.addColorStop(0, p.water);
  depth.addColorStop(0.5, p.waterDeep);
  depth.addColorStop(1, p.ink);
  ctx.fillStyle = depth;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.92;
  ctx.beginPath();
  ctx.moveTo(-10, LOGICAL_HEIGHT + 6);
  ctx.lineTo(-10, Math.min(190, topY + 27));
  ctx.bezierCurveTo(68, topY + 38, g.focusX - 55, topY + 12, g.focusX - 4, topY);
  ctx.bezierCurveTo(g.focusX + 48, topY - 5, 320, rightY + 8, LOGICAL_WIDTH + 8, rightY);
  ctx.lineTo(LOGICAL_WIDTH + 8, LOGICAL_HEIGHT + 6);
  ctx.closePath();
  ctx.fill();

  // One soft, broad shoulder value joins the authored face to the runtime
  // foreground. It has no line direction to mirror when Kaki reverses.
  ctx.globalAlpha = settings?.highContrast ? 0.66 : 0.23;
  ctx.fillStyle = p.waterLight;
  ctx.beginPath();
  ctx.moveTo(g.focusX - 46, topY + 12);
  ctx.bezierCurveTo(g.focusX + 8, topY + 1, 286, topY + 27, LOGICAL_WIDTH + 8, topY + 13);
  ctx.lineTo(LOGICAL_WIDTH + 8, topY + 29);
  ctx.bezierCurveTo(302, topY + 44, g.focusX + 10, topY + 17, g.focusX - 46, topY + 24);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAuthoredCrestMotion(ctx, g, p, settings, clock) {
  const phase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, clock) * 0.28) % 11;
  const lipX = visualCrownContactX(g);
  const amount = 2 + Math.round(g.foamEnergy * 5);
  ctx.save();
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 0.96 : 0.68;
  for (let index = 0; index < amount; index += 1) {
    const x = lipX - 7 + ((index * 11 + phase * 2) % 29);
    const y = g.lipY - 10 + ((index * 17 + phase) % 21);
    const size = index % 4 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function traceBarrelBody(ctx, g) {
  const a = g.aperture;
  const lipX = visualCrownContactX(g) - 1;
  const lipY = g.lipY + 1;
  const innerTopX = clamp(a.left + 26, g.shoulderX + 16, lipX - 15);
  const innerTopY = a.top + 12;
  const innerBaseX = clamp(a.left + 10, 62, lipX - 28);
  const innerBaseY = clamp(Math.max(a.bottom + 3, g.powerY + 7), 139, 179);
  const rightSurfaceY = clamp(g.focusY + 13 + g.growth * 5, 146, 181);
  ctx.beginPath();
  ctx.moveTo(-12, LOGICAL_HEIGHT + 7);
  ctx.lineTo(-12, g.outerEntryY + 7);
  ctx.bezierCurveTo(
    18,
    g.outerEntryY - 48,
    g.shoulderX - 48,
    g.shoulderY + 3,
    g.shoulderX,
    g.shoulderY,
  );
  ctx.bezierCurveTo(
    g.shoulderX + 46,
    g.shoulderY - 4,
    lipX - 28,
    lipY - 18,
    lipX,
    lipY,
  );
  ctx.bezierCurveTo(
    lipX - 8,
    lipY + 8,
    innerTopX + 12,
    innerTopY - 7,
    innerTopX,
    innerTopY,
  );
  ctx.bezierCurveTo(
    a.left - 12,
    a.top + 23,
    a.left - 18,
    a.bottom - 19,
    innerBaseX,
    innerBaseY,
  );
  ctx.bezierCurveTo(
    innerBaseX + 36,
    innerBaseY + 13,
    g.focusX - 38,
    g.focusY - 3,
    g.focusX + 4,
    g.focusY + 5,
  );
  ctx.bezierCurveTo(
    g.focusX + 66,
    g.focusY + 18,
    330,
    rightSurfaceY - 10,
    LOGICAL_WIDTH + 8,
    rightSurfaceY,
  );
  ctx.lineTo(LOGICAL_WIDTH + 8, LOGICAL_HEIGHT + 8);
  ctx.lineTo(-12, LOGICAL_HEIGHT + 8);
  ctx.closePath();
}

function traceFaceVolume(ctx, g) {
  const a = g.aperture;
  const innerBaseX = clamp(a.left + 8, 60, visualCrownContactX(g) - 29);
  const innerBaseY = clamp(Math.max(a.bottom + 2, g.powerY + 7), 139, 179);
  ctx.beginPath();
  ctx.moveTo(-16, 207);
  ctx.bezierCurveTo(
    22,
    167 - g.growth * 20,
    g.shoulderX - 28,
    g.shoulderY + 22,
    g.shoulderX + 5,
    g.shoulderY + 25,
  );
  ctx.bezierCurveTo(
    g.shoulderX + 45,
    g.shoulderY + 25,
    a.left - 12,
    a.bottom - 26,
    innerBaseX,
    innerBaseY,
  );
  ctx.bezierCurveTo(
    innerBaseX + 37,
    innerBaseY + 10,
    g.focusX - 28,
    g.focusY - 2,
    g.focusX + 7,
    g.focusY + 7,
  );
  ctx.bezierCurveTo(g.focusX + 71, g.focusY + 24, 333, 174, LOGICAL_WIDTH + 9, 166);
  ctx.lineTo(LOGICAL_WIDTH + 9, LOGICAL_HEIGHT + 9);
  ctx.lineTo(-16, LOGICAL_HEIGHT + 9);
  ctx.closePath();
}

function traceWallBand(ctx, g, lane, laneCount) {
  const a = g.aperture;
  const t = laneCount <= 1 ? 0 : lane / (laneCount - 1);
  const lipX = visualCrownContactX(g);
  const innerBaseX = clamp(a.left - 10 + t * 33, 42, lipX - 22);
  const innerBaseY = clamp(Math.max(a.bottom + 20 - t * 13, g.powerY + 13 - t * 4), 140, 186);
  const focusX = g.focusX - 18 + t * 8;
  const focusY = g.focusY + 17 + t * 2 + g.collapse * (2 + t * 5);
  const endX = focusX + 34 + t * 4;
  const endY = focusY + 2 + t * 2;
  ctx.beginPath();
  ctx.moveTo(-24 + t * 70, 218 - t * 17);
  ctx.bezierCurveTo(
    8 + t * 20,
    170 - g.growth * 23 - t * 10,
    g.shoulderX - 66 + t * 58,
    g.shoulderY + 54 + t * 9,
    g.shoulderX - 42 + t * 52,
    g.shoulderY + 48 + t * 13,
  );
  ctx.bezierCurveTo(
    g.shoulderX - 3 + t * 35,
    g.shoulderY + 43 + t * 15,
    innerBaseX - 27,
    a.bottom - 27 + t * 6,
    innerBaseX,
    innerBaseY,
  );
  ctx.bezierCurveTo(
    innerBaseX + 34,
    innerBaseY + 8,
    focusX - 31,
    focusY - 7,
    focusX,
    focusY,
  );
  ctx.bezierCurveTo(focusX + 12, focusY + 2, endX - 8, endY + 1, endX, endY);
}

function drawConnectedFaceBands(ctx, wave, g, p, settings) {
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  traceBarrelBody(ctx, g);
  ctx.clip();
  const laneCount = [3, 4, 5, 6, 7, 8][g.stage.index] ?? 6;

  for (let lane = 0; lane < laneCount; lane += 1) {
    const t = laneCount <= 1 ? 0 : lane / (laneCount - 1);
    const paletteIndex = Math.min(FACE_BAND_COLORS.length - 1, lane);
    const color = settings?.highContrast && lane === laneCount - 1 ? p.foam : FACE_BAND_COLORS[paletteIndex];
    const laneTailX = g.focusX + 24 + t * 12;
    const fade = ctx.createLinearGradient(g.focusX - 35, 0, laneTailX, 0);
    fade.addColorStop(0, color);
    fade.addColorStop(0.68, color);
    fade.addColorStop(1, colorWithAlpha(color, 0));
    ctx.globalAlpha = settings?.highContrast ? 0.96 : 0.5 + t * 0.34;
    ctx.strokeStyle = fade;
    ctx.lineWidth = Math.max(2, 7.5 - lane * 0.5 + g.growth * 0.7);
    traceWallBand(ctx, g, lane, laneCount);
    ctx.stroke();
  }

  // A broad curved shoulder plane, rather than a thin speed line, carries the
  // trough into the foreground. It is deterministic wave-space geometry.
  ctx.globalAlpha = settings?.highContrast ? 0.72 : 0.28;
  ctx.fillStyle = p.waterLight;
  ctx.beginPath();
  ctx.moveTo(g.focusX - 31, g.focusY + 11);
  ctx.bezierCurveTo(g.focusX + 12, g.focusY + 2, 284, g.focusY + 31, 350, g.focusY + 15);
  ctx.bezierCurveTo(305, g.focusY + 39, 253, g.focusY + 28, g.focusX - 31, g.focusY + 20);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = settings?.highContrast ? 0.9 : 0.68;
  ctx.strokeStyle = p.foamShade;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(g.focusX - 22, g.focusY + 10);
  ctx.bezierCurveTo(g.focusX - 1, g.focusY + 5, g.focusX + 18, g.focusY + 8, g.focusX + 37, g.focusY + 13);
  ctx.stroke();
  ctx.restore();
}

function drawPowerTrack(ctx, wave, g, p, settings) {
  if (!settings?.highContrast || String(settings.waveReadAssist ?? "full").toLowerCase() !== "full") return;
  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(g.contactX + 2, projectedSurfaceY(wave, g, g.contactX + 2, g.powerFace));
  for (let x = g.contactX + 8; x <= LOGICAL_WIDTH + 4; x += 8) {
    ctx.lineTo(x, projectedSurfaceY(wave, g, x, g.powerFace));
  }
  ctx.stroke();
  ctx.restore();
}

function drawFoamCrown(ctx, g, p, settings, assets, clock) {
  const motion = settings?.reducedMotion ? 0 : Math.floor(clock * 0.22) % 3;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // A single narrow underside anchors the generated foam silhouette to the
  // body. The old stacked mass/strokes/blocks made the wave read as snow.
  ctx.fillStyle = p.foamShade;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.74;
  traceCrownMass(ctx, g);
  ctx.fill();

  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.68;
  traceCrownCap(ctx, g);
  ctx.fill();

  ctx.strokeStyle = p.foamShade;
  ctx.lineWidth = settings?.highContrast ? 6 : 3;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.88;
  traceCrown(ctx, g, 4);
  ctx.stroke();

  if (!settings?.highContrast && assets?.generated?.twilightHeroWave) {
    ctx.save();
    traceCrownMass(ctx, g);
    ctx.clip();
    const crownContactX = visualCrownContactX(g);
    drawAtlasFrame(ctx, assets, "twilightHeroWave", "foamCrown", crownContactX * 0.5, g.shoulderY + 28, {
      scale: 1,
      scaleX: Math.max(0.82, (crownContactX + 12) / 128),
      scaleY: 0.22 + g.growth * 0.12 + g.collapse * 0.05,
      alpha: 0.24 + g.foamEnergy * 0.28,
    });
    ctx.restore();
  } else {
    ctx.strokeStyle = p.foam;
    ctx.lineWidth = 3;
    traceCrown(ctx, g, 0);
    ctx.stroke();
  }

  // A few irregular fingers and broken highlights retain pixel-art motion
  // without rebuilding a uniform semicircle over the atlas art.
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.76;
  const clusters = 3 + Number(g.stage.index >= 3) + Number(g.collapse > 0.45);
  for (let index = 0; index < clusters; index += 1) {
    const t = 0.61 + index * (0.28 / Math.max(1, clusters - 1));
    const point = crownPoint(g, t, -1);
    const depth = 3 + ((index * 5 + motion) % 6);
    ctx.fillRect(Math.round(point.x - 2), Math.round(point.y + depth), 3 + index % 3, 2);
    if (index % 2 === 0) ctx.fillRect(Math.round(point.x + 2), Math.round(point.y + depth + 3), 2, 2);
  }
  ctx.restore();
}

function drawBoardContactSpray(ctx, simulation, p, settings, assets, phase) {
  const player = simulation.player;
  if (!player || player.state === "airborne" || player.state === "wipeout" || player.state === "complete") return;
  const x = Number(player.x ?? 208);
  const y = Number(simulation.wave.ridingY(x, player.face ?? 0.58));
  const speedRatio = clamp(Number(player.speed ?? 0) / Math.max(1, Number(simulation.currentRideSpeedCap?.() ?? 138)), 0, 1);
  if (speedRatio < 0.34) return;

  if (!settings?.highContrast && assets?.generated?.twilightHeroWave) {
    const direction = Math.sign(player.travelDirection ?? 1) || 1;
    drawAtlasFrame(ctx, assets, "twilightHeroWave", "contactSpray", x - 10, y - 2, {
      scale: 0.42 + speedRatio * 0.18,
      flipX: direction < 0,
      alpha: 0.22 + speedRatio * 0.23,
    });
  }

  ctx.save();
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 0.95 : 0.58;
  for (let index = 0; index < 7; index += 1) {
    const direction = Math.sign(player.travelDirection ?? 1) || 1;
    const dx = direction * (-5 - index * 3);
    const dy = -2 - ((index * 5 + phase) % 9);
    ctx.fillRect(Math.round(x + dx), Math.round(y + dy), index % 3 === 0 ? 2 : 1, index % 4 === 0 ? 2 : 1);
  }
  ctx.restore();
}

function drawHeroReadAssist(ctx, simulation, g, p, settings) {
  if (!settings?.highContrast || String(settings.waveReadAssist ?? "full").toLowerCase() !== "full") return;
  const player = simulation.player;
  if (!player || player.state === "airborne" || player.state === "wipeout" || player.state === "complete") return;
  const x = clamp(Math.round(player.x + 28), 24, LOGICAL_WIDTH - 24);
  const y = clamp(Math.round(simulation.wave.ridingY(player.x, g.powerFace)), 96, 178);
  ctx.fillStyle = p.ink;
  ctx.fillRect(x - 3, y - 6, 7, 13);
  ctx.fillStyle = p.gold;
  ctx.fillRect(x - 1, y - 4, 3, 9);
}

function traceCrown(ctx, g, offset = 0) {
  const contactX = visualCrownContactX(g);
  ctx.beginPath();
  ctx.moveTo(-5, g.outerEntryY - 4 + offset);
  ctx.bezierCurveTo(18, g.outerEntryY - 47 + offset, g.shoulderX - 46, g.shoulderY + offset, g.shoulderX, g.shoulderY + offset);
  ctx.bezierCurveTo(g.shoulderX + 43, g.shoulderY - 2 + offset, contactX - 26, g.lipY - 14 + offset, contactX, g.lipY + offset);
}

function traceCrownMass(ctx, g) {
  const contactX = visualCrownContactX(g);
  const thickness = 3 + g.foamEnergy * 3;
  ctx.beginPath();
  ctx.moveTo(-6, g.outerEntryY - 5);
  ctx.bezierCurveTo(18, g.outerEntryY - 47, g.shoulderX - 46, g.shoulderY - 1, g.shoulderX, g.shoulderY - 1);
  ctx.bezierCurveTo(g.shoulderX + 43, g.shoulderY - 4, contactX - 27, g.lipY - 15, contactX, g.lipY);
  ctx.bezierCurveTo(
    contactX - 7,
    g.lipY + thickness,
    contactX - 25,
    g.lipY + thickness + 1,
    contactX - 38,
    g.lipY + 6,
  );
  ctx.bezierCurveTo(
    g.shoulderX + 38,
    g.shoulderY + thickness,
    g.shoulderX - 39,
    g.shoulderY + thickness + 2,
    -6,
    g.outerEntryY + 5,
  );
  ctx.closePath();
}

function traceCrownCap(ctx, g) {
  const contactX = visualCrownContactX(g);
  const thickness = 2 + g.foamEnergy * 2;
  ctx.beginPath();
  ctx.moveTo(-6, g.outerEntryY - 6);
  ctx.bezierCurveTo(18, g.outerEntryY - 48, g.shoulderX - 46, g.shoulderY - 3, g.shoulderX, g.shoulderY - 3);
  ctx.bezierCurveTo(g.shoulderX + 43, g.shoulderY - 6, contactX - 28, g.lipY - 17, contactX - 1, g.lipY - 2);
  ctx.bezierCurveTo(
    contactX - 9,
    g.lipY + thickness,
    contactX - 27,
    g.lipY + thickness,
    contactX - 40,
    g.lipY + 3,
  );
  ctx.bezierCurveTo(
    g.shoulderX + 39,
    g.shoulderY + thickness,
    g.shoulderX - 40,
    g.shoulderY + thickness + 1,
    -6,
    g.outerEntryY + 1,
  );
  ctx.closePath();
}

function projectedSurfaceY(wave, g, x, face) {
  return projectWavePoint(wave, x, face, g.powerFace, {}).y;
}

function canonicalContactX(wave) {
  const queried = Number(wave?.contactX?.());
  if (Number.isFinite(queried)) return queried;
  return Number(wave?.curlX ?? 48) + 13;
}

function colorWithAlpha(color, alpha) {
  const value = String(color ?? "").trim();
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return `rgba(72, 196, 201, ${clamp(alpha, 0, 1)})`;
  const number = Number.parseInt(match[1], 16);
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${clamp(alpha, 0, 1)})`;
}

function crownPoint(g, progress, offset = 0) {
  const contactX = visualCrownContactX(g);
  const start = { x: -5, y: g.outerEntryY - 4 + offset };
  const shoulder = { x: g.shoulderX, y: g.shoulderY + offset };
  const end = { x: contactX, y: g.lipY + offset };
  if (progress < 0.46) {
    return cubicPoint(
      start,
      { x: 18, y: g.outerEntryY - 47 + offset },
      { x: g.shoulderX - 46, y: g.shoulderY + offset },
      shoulder,
      progress / 0.46,
    );
  }
  return cubicPoint(
    shoulder,
    { x: g.shoulderX + 43, y: g.shoulderY - 2 + offset },
    { x: contactX - 26, y: g.lipY - 14 + offset },
    end,
    (progress - 0.46) / 0.54,
  );
}

function visualCrownContactX(g) {
  // Keep the visible lip just behind the board at maximum pressure; the
  // canonical contact and spray still communicate the exact gameplay edge.
  return g.contactX - 7 - g.collapse * 14;
}

function cubicPoint(start, controlA, controlB, end, t) {
  const clamped = clamp(t, 0, 1);
  const inverse = 1 - clamped;
  const aa = inverse * inverse * inverse;
  const ab = 3 * inverse * inverse * clamped;
  const bb = 3 * inverse * clamped * clamped;
  const cc = clamped * clamped * clamped;
  return {
    x: start.x * aa + controlA.x * ab + controlB.x * bb + end.x * cc,
    y: start.y * aa + controlA.y * ab + controlB.y * bb + end.y * cc,
  };
}
