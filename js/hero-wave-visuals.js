import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TUNING } from "./config.js";
import { clamp, smoothstep } from "./math.js";
import { drawAtlasFrame } from "./asset-drawing.js";
import { projectWavePoint, sampleWaveSection } from "./wave.js";

const HORIZON_Y = 79;
const WATERFALL_FRAMES = Object.freeze(["pourA", "pourB", "pourC"]);
const CHURN_OFFSETS = Object.freeze([0, 8, 3, 14, 6, 19, 11, 24, 4, 16, 27, 9]);
const BREAK_COLUMN_STEP = 3;
const RENDER_BREAK_COLUMNS = [];

export function isHeroBarrelWave(wave) {
  return wave?.profileId === "heroBarrel" || wave?.profile?.renderer === "heroBarrel";
}

/**
 * Threat pressure still owns the authored gameplay beats, but the renderer no
 * longer scales one complete C-shaped wave through them. They now control the
 * reach, density, and tube depth of one passing breaker.
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
 * Canonical anchors for the Twilight side-scroller composition. The breaker
 * advances left-to-right from GameplayWave.contactX(); its internal water
 * falls downward and never reads rider direction.
 */
export function heroBarrelGeometry(wave, player = null) {
  const stage = heroBarrelStage(wave, player);
  const section = stage.section;
  const growth = section.growth;
  const collapse = stage.collapseMix;
  const opening = section.aperture * (1 - collapse * 0.18);
  const contactX = clamp(canonicalContactX(wave), 30, LOGICAL_WIDTH + 26);
  const sampledX = clamp(contactX, 0, LOGICAL_WIDTH);
  const powerFace = clamp(Number(wave?.powerFaceAt?.(sampledX) ?? 0.58), 0.3, 0.7);
  const powerY = clamp(Number(wave?.ridingY?.(sampledX, powerFace) ?? 144), 124, 166);
  const crestY = clamp(Number(wave?.crestY?.(sampledX) ?? HORIZON_Y), 73, 84);

  const curtainTopY = clamp(crestY - 4 - growth * 29 - collapse * 3, 42, 78);
  const curtainBaseY = clamp(powerY + 43 + collapse * 5, 181, 205);
  // The collision-facing edge falls almost vertically through board height.
  // Only the low rear wash leans back; this keeps the visible danger line
  // welded to GameplayWave.contactX() instead of lagging behind it.
  const curtainLean = 10 + growth * 10 + collapse * 4;
  const curtainEdgeX = contactX - 3;
  const curtainBaseX = contactX - curtainLean;
  const lipReach = clamp(46 + growth * 8 - collapse * 2, 44, 54);
  const lipTipX = contactX + lipReach;
  const lipTipY = HORIZON_Y + 1 - growth * 5 + collapse * 2;
  const tubeFloorY = clamp(powerY + 25 - opening * 5, 148, 184);
  const tubeDepth = clamp(0.22 + growth * 0.64 - collapse * 0.16, 0.18, 0.88);

  const riderX = clamp(Number(player?.x ?? 208), 0, LOGICAL_WIDTH);
  const focusX = clamp(riderX, Math.max(36, contactX + 8), LOGICAL_WIDTH - 18);
  const focusFace = clamp(Number(wave?.powerFaceAt?.(focusX) ?? powerFace), 0.3, 0.7);
  const focusY = clamp(Number(wave?.ridingY?.(focusX, focusFace) ?? powerY), 126, 172);
  const apertureTop = curtainTopY + 2;
  const apertureBottom = Math.max(apertureTop + 32, tubeFloorY);
  const apertureLeft = curtainEdgeX - 2;
  const apertureRight = Math.max(apertureLeft + 18, lipTipX);
  const breakSpan = columnBreakSpan(growth, collapse);
  const passedRight = clamp(lipTipX - breakSpan + 10, 0, LOGICAL_WIDTH);

  return {
    stage,
    pressure: section.pressure,
    growth,
    opening,
    collapse,
    contactX,
    collisionX: contactX,
    powerFace,
    powerY,
    crestY,
    // Compatibility fields retained for QA and read-assist consumers.
    shoulderX: contactX - 48,
    shoulderY: curtainTopY,
    outerEntryY: curtainBaseY - 8,
    lipY: lipTipY,
    pocketY: powerY,
    focusX,
    focusY,
    foamEnergy: clamp(0.42 + growth * 0.45 + collapse * 0.22, 0.38, 1),
    tubeDepth,
    aperture: {
      left: apertureLeft,
      top: apertureTop,
      right: apertureRight,
      bottom: apertureBottom,
      centerX: apertureLeft + (apertureRight - apertureLeft) * 0.54,
      centerY: apertureTop + (apertureBottom - apertureTop) * 0.56,
    },
    curtain: {
      topX: curtainEdgeX,
      topY: curtainTopY,
      edgeX: curtainEdgeX,
      baseX: curtainBaseX,
      baseY: curtainBaseY,
      lipTipX,
      lipTipY,
      lean: curtainLean,
    },
    passedWindow: {
      right: passedRight,
      shoulder: Math.max(0, passedRight - 34),
      top: 0,
      horizon: HORIZON_Y,
      fold: HORIZON_Y,
      bottom: LOGICAL_HEIGHT,
    },
  };
}

export function heroPassedSkyWindow(wave, player = null) {
  return heroBarrelGeometry(wave, player).passedWindow;
}

/**
 * California Games-style staggered waterfall columns. Screen-grid columns are
 * activated as the lip advances; their noisy head falls under a gravity-like
 * curve while every tile already left above it remains fixed. No rider input
 * or travel direction participates in this calculation.
 */
export function heroBreakColumns(wave, player = null, out = []) {
  return breakColumnsForGeometry(heroBarrelGeometry(wave, player), out);
}

/**
 * The three ordinary pour drawings loop only forward. Full collapse selects a
 * fourth dense frame. Reduced Motion holds one readable falling-water pose.
 */
export function heroWaterfallFrame(presentationClock = 0, collapseMix = 0, reducedMotion = false) {
  if (Number(collapseMix) >= 0.58) return "pourD";
  if (reducedMotion) return "pourB";
  const phase = Math.floor(Math.max(0, Number(presentationClock) || 0) * 0.46) % WATERFALL_FRAMES.length;
  return WATERFALL_FRAMES[phase];
}

export function drawHeroBackWater(ctx, simulation, palette, settings, presentationClock = 0) {
  const reduced = Boolean(settings?.reducedMotion);
  const clock = reduced ? 0 : Math.max(0, Number(presentationClock) || 0);
  // A low-resolution vertical gradient quantizes into broad horizontal bars.
  // Keep one uninterrupted deep face instead; sparse vertical flecks and the
  // structural crest provide depth without any scrolling rails or hard bands.
  ctx.fillStyle = palette.waterDeep;
  ctx.fillRect(0, HORIZON_Y - 1, LOGICAL_WIDTH, LOGICAL_HEIGHT - HORIZON_Y + 1);
  ctx.save();
  // Sparse diagonal depth flecks fall down-face. They do not change direction
  // when the rider reverses and stay subordinate to the breaker silhouette.
  ctx.fillStyle = palette.waterLight;
  ctx.globalAlpha = settings?.highContrast ? 0.26 : 0.12;
  const fall = Math.floor(clock * 0.24) % 17;
  for (let index = 0; index < 18; index += 1) {
    const x = 18 + (index * 47) % 366;
    const y = 96 + ((index * 19 + fall) % 88);
    const length = 3 + index % 5;
    for (let step = 0; step < length; step += 1) {
      ctx.fillRect(x - Math.floor(step * 0.5), y + step, 1, index % 5 === 0 ? 2 : 1);
    }
    if (index % 4 === 0) ctx.fillRect(x - 3, y + length + 1, 1, 2);
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
  repaintTrailingSky = null,
) {
  const wave = simulation.wave;
  const geometry = heroBarrelGeometry(wave, simulation.player);
  const clock = settings?.reducedMotion ? 0 : Number(presentationClocks?.fall ?? presentationClocks?.crest ?? 0);

  drawPassedSky(ctx, geometry, repaintTrailingSky);
  drawLongFaceCrest(ctx, geometry, palette, settings, clock);
  // The advancing break is built from screen-grid waterfall columns instead
  // of scaling a complete C-wave bitmap. Old columns keep their trails while
  // newly activated columns begin at the pitching lip and fall downward.
  drawColumnBreak(ctx, geometry, palette, settings, clock);
  drawTrailingWhitewater(ctx, geometry, palette, settings, clock);
  drawPowerTrack(ctx, wave, geometry, palette, settings);
  drawHeroReadAssist(ctx, simulation, geometry, palette, settings);
}

function breakColumnsForGeometry(g, out = []) {
  const c = g.curtain;
  const frontX = c.lipTipX;
  // Keep the oldest active columns just offscreen so the churn always enters
  // from the left edge instead of exposing a detached vertical rear seam.
  // Their opacity still fades toward that edge, allowing backwater through.
  const span = Math.max(columnBreakSpan(g.growth, g.collapse), frontX + BREAK_COLUMN_STEP * 3);
  const firstGrid = Math.floor((frontX - span) / BREAK_COLUMN_STEP);
  const lastGrid = Math.floor(frontX / BREAK_COLUMN_STEP);
  let count = 0;
  for (let grid = firstGrid; grid <= lastGrid; grid += 1) {
    const x = grid * BREAK_COLUMN_STEP;
    const distance = Math.max(0, frontX - x);
    const progress = clamp(distance / span, 0, 1);
    const topY = clamp(
      c.lipTipY + progress * 2 + positiveModulo(grid * 7, 3) - 1,
      HORIZON_Y - 8,
      HORIZON_Y + 4,
    );
    // Distance behind the advancing lip is proportional to time since this
    // column started. The quadratic term is the gravity-like acceleration.
    const fall = 4 + distance * 0.34 + distance * distance * (0.014 + g.growth * 0.002);
    const floorY = c.baseY - positiveModulo(grid * 7, 5);
    const headY = clamp(topY + fall, topY + 4, floorY);
    const column = out[count] ?? {};
    column.grid = grid;
    column.x = x;
    column.width = 2 + positiveModulo(grid * 5, 3);
    column.topY = topY;
    column.headY = headY;
    column.floorY = floorY;
    column.age = distance;
    column.progress = progress;
    column.settled = headY >= floorY - 0.5;
    out[count] = column;
    count += 1;
  }
  out.length = count;
  return out;
}

function drawColumnBreak(ctx, g, p, settings, clock) {
  const columns = breakColumnsForGeometry(g, RENDER_BREAK_COLUMNS);
  if (columns.length < 2) return;
  const first = columns[0];
  const highContrast = Boolean(settings?.highContrast);
  ctx.save();

  // The active sheet is translucent blue-white water between a nearly level
  // crest and the gravity curve of its falling heads. The playable wave face
  // remains the full dark water field behind it, matching the side-view game.
  const sheet = ctx.createLinearGradient(first.x, 0, first.x + 62, 0);
  sheet.addColorStop(0, colorWithAlpha(p.foamShade, 0));
  sheet.addColorStop(0.24, colorWithAlpha(p.waterLight, highContrast ? 0.34 : 0.18));
  sheet.addColorStop(0.68, colorWithAlpha(p.foamShade, highContrast ? 0.66 : 0.36));
  sheet.addColorStop(1, colorWithAlpha(p.foamShade, highContrast ? 0.82 : 0.48));
  ctx.fillStyle = sheet;
  ctx.globalAlpha = 1;
  traceColumnBody(ctx, columns);
  ctx.fill();

  // The broken crest thickens behind the newest column. Individual packets
  // remain locked to their screen columns, but together form the broad,
  // bright whitewater cap visible in the original side-view composition.
  for (const column of columns) {
    const seed = positiveModulo(column.grid * 31, 17);
    const columnFade = 1 - smoothstep(0.9, 1, column.progress);
    const crestDepth = 2 + Math.round(smoothstep(0.06, 0.62, column.progress) * 7) + seed % 3;
    ctx.fillStyle = seed % 3 === 0 ? p.foam : p.foamShade;
    ctx.globalAlpha = (highContrast ? 1 : seed % 3 === 0 ? 0.94 : 0.78) * columnFade;
    ctx.fillRect(
      Math.round(column.x - column.width * 0.5),
      Math.round(column.topY - 1 - seed % 2),
      column.width + (seed % 4 === 0 ? 1 : 0),
      crestDepth,
    );
  }

  // Stable contrail tiles: their positions depend only on screen-grid column
  // and segment number. Once revealed, they never slide or reverse direction.
  for (const column of columns) {
    const columnFade = 1 - smoothstep(0.88, 1, column.progress);
    const trailTop = Math.ceil(column.topY + 5);
    const trailBottom = Math.floor(column.headY - 3);
    const startOffset = positiveModulo(column.grid * 11, 4);
    for (let y = trailTop + startOffset, segment = 0; y <= trailBottom; segment += 1) {
      const seed = positiveModulo(column.grid * 17 + segment * 23, 19);
      const height = 2 + seed % 4;
      const width = Math.max(2, column.width - (seed % 4 === 0 ? 1 : 0));
      const jitterX = positiveModulo(seed * 7 + segment, 3) - 1;
      ctx.fillStyle = seed % 3 === 0 ? p.foam : seed % 2 === 0 ? p.foamShade : p.waterLight;
      ctx.globalAlpha = (highContrast ? 0.96 : seed % 3 === 0 ? 0.88 : 0.62) * columnFade;
      ctx.fillRect(
        Math.round(column.x - width * 0.5 + jitterX),
        y,
        width,
        Math.min(height, trailBottom - y + 1),
      );
      if (seed % 5 === 0 && y + height + 1 <= trailBottom) {
        ctx.fillStyle = p.foam;
        ctx.globalAlpha = (highContrast ? 1 : 0.72) * columnFade;
        ctx.fillRect(Math.round(column.x + jitterX), y + height + 1, 2, 2);
      }
      y += height + 2 + seed % 2;
    }
  }

  // Join the noisy heads into one readable advancing boundary. The polyline
  // follows the same fixed gravity samples as collision and does not use time
  // or rider direction, so it cannot detach, reverse, or oscillate.
  ctx.beginPath();
  ctx.moveTo(columns[0].x, columns[0].headY);
  for (let index = 1; index < columns.length; index += 1) {
    ctx.lineTo(columns[index].x, columns[index].headY);
  }
  ctx.strokeStyle = p.foamShade;
  ctx.lineWidth = highContrast ? 4 : 3;
  ctx.globalAlpha = highContrast ? 1 : 0.82;
  ctx.stroke();
  ctx.strokeStyle = p.foam;
  ctx.lineWidth = 1;
  ctx.globalAlpha = highContrast ? 1 : 0.88;
  ctx.stroke();

  // A thin underside seam ties the independently falling columns to the lip;
  // the connected swell behind it owns the outer silhouette.
  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    const seed = positiveModulo(column.grid * 13, 11);
    const packetWidth = BREAK_COLUMN_STEP + seed % 2;
    const packetHeight = 1 + seed % 3;
    ctx.fillStyle = seed % 4 === 0 ? p.foam : p.foamShade;
    const columnFade = 1 - smoothstep(0.9, 1, column.progress);
    ctx.globalAlpha = (highContrast ? 1 : seed % 4 === 0 ? 0.84 : 0.62) * columnFade;
    ctx.fillRect(
      Math.round(column.x - packetWidth * 0.55),
      Math.round(column.topY - packetHeight * 0.3),
      packetWidth,
      packetHeight,
    );
    if (index > columns.length * 0.62 && seed % 3 === 0) {
      ctx.fillStyle = p.foam;
      ctx.fillRect(Math.round(column.x - 1), Math.round(column.topY - packetHeight - 1), 2, 2);
    }
  }

  // Each moving head is a small noisy sprite. Its fall position comes from
  // gravity above; only the detached droplets use a forward-running clock.
  const fallPhase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, clock) * 0.72) % 17;
  for (const column of columns) {
    const columnFade = 1 - smoothstep(0.91, 1, column.progress);
    const seed = positiveModulo(column.grid * 29 + fallPhase, 17);
    const headWidth = column.width + 2 + seed % 3;
    const headHeight = 2 + seed % 3;
    ctx.fillStyle = seed % 3 === 0 ? p.foam : p.foamShade;
    ctx.globalAlpha = (highContrast ? 1 : 0.82) * columnFade;
    ctx.fillRect(
      Math.round(column.x - headWidth * 0.5),
      Math.round(column.headY - headHeight * 0.5),
      headWidth,
      headHeight,
    );
    if (seed % 2 === 0) {
      ctx.fillStyle = p.foam;
      ctx.globalAlpha = (highContrast ? 1 : 0.88) * columnFade;
      ctx.fillRect(
        Math.round(column.x - Math.max(2, headWidth - 3) * 0.5),
        Math.round(column.headY - headHeight * 0.5),
        Math.max(2, headWidth - 3),
        2,
      );
    }
    if (!column.settled && seed % 2 === 0) {
      ctx.fillStyle = p.foam;
      ctx.globalAlpha = (highContrast ? 0.94 : 0.68) * columnFade;
      ctx.fillRect(
        Math.round(column.x + 2 + seed % 5),
        Math.round(column.headY + 3 + seed % 7),
        seed % 5 === 0 ? 2 : 1,
        2 + seed % 3,
      );
    }
  }

  // A narrow, board-height wash makes the collision plane readable without
  // inventing a full vertical wall ahead of columns that have not fallen yet.
  const collisionColumn = nearestColumn(columns, g.contactX);
  if (collisionColumn) {
    const markerY = clamp(collisionColumn.headY, g.powerY - 12, g.curtain.baseY);
    ctx.fillStyle = p.foam;
    ctx.globalAlpha = highContrast ? 0.96 : 0.72;
    ctx.fillRect(Math.round(g.contactX - 2), Math.round(markerY - 3), 5, 4);
    ctx.fillStyle = p.foamShade;
    ctx.fillRect(Math.round(g.contactX - 1), Math.round(markerY + 2), 3, 5);
  }
  ctx.restore();
}

export function drawHeroBarrelFront(
  ctx,
  simulation,
  palette,
  settings,
  assets = null,
  presentationClocks = null,
) {
  const geometry = heroBarrelGeometry(simulation.wave, simulation.player);
  const clock = settings?.reducedMotion ? 0 : Number(presentationClocks?.fall ?? presentationClocks?.crest ?? 0);
  if (heroPourMix(geometry) > 0.04) {
    drawImpactChurn(ctx, geometry, palette, settings, assets, clock, true);
  }
  drawTubeRiderForeground(ctx, simulation, geometry, palette, settings, clock);
  drawBoardContactSpray(ctx, simulation, palette, settings, assets, Math.floor(clock * 0.42));
}

function drawPassedSky(ctx, g, repaintTrailingSky) {
  if (typeof repaintTrailingSky !== "function" || g.passedWindow.right < 4) return;
  const window = g.passedWindow;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, window.top);
  ctx.lineTo(window.shoulder, window.top);
  ctx.quadraticCurveTo(window.right - 5, 20, window.right, window.fold);
  ctx.quadraticCurveTo(window.shoulder, window.bottom - 4, 0, window.bottom);
  ctx.closePath();
  ctx.clip();
  repaintTrailingSky(window);
  ctx.restore();
}

function drawTrailingWhitewater(ctx, g, p, settings, clock) {
  const c = g.curtain;
  ctx.save();
  const washLeft = Math.max(0, c.edgeX - 96);
  ctx.beginPath();
  ctx.rect(washLeft, HORIZON_Y + 4, Math.max(0, c.edgeX - washLeft + 8), LOGICAL_HEIGHT - HORIZON_Y);
  ctx.clip();

  // Once the breaker has passed, the left side returns to low, dark backwater.
  // The moving edge—not a screen-sized rectangle or row of ribbons—owns the
  // read; only scattered churn remains behind it.
  const phase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, clock) * 0.72) % 19;

  // Chunky foam breakup moves downward only and becomes denser toward the
  // curtain impact. There is no rider-direction term anywhere in this phase.
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 0.68 : 0.22;
  const width = Math.max(18, Math.floor(c.edgeX - washLeft + 4));
  for (let index = 0; index < 34; index += 1) {
    const x = washLeft + (index * 47 + (index % 5) * 13) % width;
    const depth = (index * 31 + phase * 2) % Math.max(28, c.baseY - HORIZON_Y - 18);
    const y = HORIZON_Y + 18 + depth;
    const proximity = clamp(x / Math.max(1, c.edgeX), 0, 1);
    const size = proximity > 0.68 || index % 9 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, index % 6 === 0 ? 3 : size);
  }
  ctx.restore();

  if (heroPourMix(g) > 0.04) drawImpactChurn(ctx, g, p, settings, null, clock, false);
}

function heroPourMix(g) {
  if (g.collapse > 0) return 1;
  if (g.stage.index < 2) return 0;
  if (g.stage.index === 2) return clamp(Number(g.stage?.mix ?? 0), 0, 1);
  return 1;
}

function drawLongFaceCrest(ctx, g, p, settings) {
  const startX = clamp(g.curtain.lipTipX - 3, 0, LOGICAL_WIDTH);
  const crestY = g.curtain.lipTipY + 1;
  const highContrast = Boolean(settings?.highContrast);
  ctx.save();

  // One structural crest runs across the long surfable face. It is broken into
  // fixed packets rather than animated horizontal lines, so reversing Kaki can
  // never make the ocean reverse or ping-pong.
  for (let index = 0, x = startX; x < LOGICAL_WIDTH + 8; index += 1, x += 12) {
    const seed = positiveModulo(index * 17 + Math.round(startX), 13);
    const width = 6 + seed % 7;
    const y = Math.round(crestY + seed % 3 - 1);
    ctx.fillStyle = index < 4 || seed % 5 === 0 ? p.foamShade : p.waterLight;
    ctx.globalAlpha = highContrast ? 0.94 : index < 5 ? 0.7 : 0.44;
    ctx.fillRect(Math.round(x), y, width, index < 3 ? 2 : 1);
  }

  // Sparse hooked face marks establish the upright wave plane without laying
  // repeated rails across the player's route.
  for (let index = 0; index < 7; index += 1) {
    const x = startX + 18 + index * 39;
    if (x > LOGICAL_WIDTH - 5) break;
    const seed = positiveModulo(index * 11 + Math.round(startX), 9);
    const top = crestY + 12 + seed;
    ctx.fillStyle = index % 3 === 0 ? p.foamShade : p.waterLight;
    ctx.globalAlpha = highContrast ? 0.58 : 0.18;
    ctx.fillRect(Math.round(x), Math.round(top), 2, 5 + seed % 4);
    ctx.fillRect(Math.round(x - 2), Math.round(top + 6 + seed % 2), 2, 4);
  }
  ctx.restore();
}

function drawTubeRiderForeground(ctx, simulation, g, p, settings, clock) {
  const player = simulation?.player;
  const tube = player?.tubeRide;
  const tubeId = String(tube?.id || player?.maneuver?.id || "");
  if (!tube?.active && Number(tube?.visualExit ?? 0) <= 0
    && tubeId !== "tubeTuck" && tubeId !== "soulArch") return;
  if (player.state !== "riding" && player.state !== "lip") return;

  const c = g.curtain;
  const riderX = clamp(Number(player.x) || g.focusX, c.edgeX + 5, LOGICAL_WIDTH - 12);
  const riderY = clamp(
    Number(simulation.wave.ridingY(riderX, player.face ?? g.powerFace)) || g.focusY,
    126,
    180,
  );
  const entry = tube?.active
    ? smoothstep(0, 0.18, Number(tube?.time ?? player.maneuverTime ?? 0))
    : smoothstep(0, 0.18, Number(tube?.visualExit ?? 0));
  const phase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, clock) * 0.82) % 11;
  ctx.save();

  // The authored back lip already forms the roof. Sparse front droplets and
  // low rail foam put Kaki between layers without drawing a second pipe-like
  // arc across the opening. Their clock moves down only.
  ctx.fillStyle = p.foamShade;
  ctx.globalAlpha = (settings?.highContrast ? 0.32 : 0.16) * entry;
  for (let lane = 0; lane < 6; lane += 1) {
    const x = Math.round(riderX - 10 + lane * 7);
    const top = Math.round(Math.min(riderY - 25, c.lipTipY + 12) + ((lane * 5 + phase) % 8));
    const height = 7 + (lane * 3 + phase) % 11;
    ctx.fillRect(x, top, lane % 3 === 0 ? 2 : 1, height);
  }

  // Low foreground foam occludes only the board's lower rail, welding it to
  // the trough rather than making Kaki look pasted above the wave.
  ctx.strokeStyle = p.foamShade;
  ctx.globalAlpha = (settings?.highContrast ? 0.9 : 0.58) * entry;
  ctx.lineWidth = settings?.highContrast ? 6 : 4;
  ctx.beginPath();
  ctx.moveTo(c.edgeX + 3, g.aperture.bottom - 2);
  ctx.quadraticCurveTo(riderX - 7, riderY + 7, riderX + 25, riderY + 4);
  ctx.stroke();
  ctx.strokeStyle = p.foam;
  ctx.globalAlpha = (settings?.highContrast ? 0.94 : 0.68) * entry;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawImpactChurn(ctx, g, p, settings, assets, clock, front) {
  const c = g.curtain;
  const phase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, Number(clock) || 0) * 0.68) % 9;
  const centerX = c.baseX + 7;
  const y = c.baseY - (front ? 1 : 4);
  ctx.save();

  if (!front && !settings?.highContrast && assets) {
    drawAtlasFrame(ctx, assets, "waveBreaker", "whitewaterChurn", centerX - 8, y + 5, {
      scale: 0.62 + g.foamEnergy * 0.18,
      alpha: 0.38,
    });
  }

  ctx.fillStyle = front ? p.foam : p.foamShade;
  ctx.globalAlpha = settings?.highContrast ? (front ? 0.98 : 0.84) : (front ? 0.82 : 0.56);
  const count = front ? 8 : 12;
  for (let index = 0; index < count; index += 1) {
    const x = centerX - 38 + CHURN_OFFSETS[index] * 3 + (phase + index) % 4;
    const lift = (index * 7 + phase * 3) % (front ? 13 : 20);
    const width = 4 + (index * 5) % 11;
    const top = Math.round(y - lift * 0.42);
    ctx.fillRect(Math.round(x - width * 0.5), top, width, 3 + index % 2);
    if (width > 6) ctx.fillRect(Math.round(x - width * 0.34), top - 2, Math.max(2, width - 4), 2);
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

function drawPowerTrack(ctx, wave, g, p, settings) {
  if (!settings?.highContrast || String(settings.waveReadAssist ?? "full").toLowerCase() !== "full") return;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = p.gold;
  ctx.lineWidth = 3;
  ctx.beginPath();
  const start = Math.max(0, g.contactX + 3);
  for (let x = start; x <= LOGICAL_WIDTH + 4; x += 8) {
    const y = projectWavePoint(wave, x, g.powerFace, g.powerFace, {}).y;
    if (x === start) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
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

function traceColumnBody(ctx, columns) {
  ctx.beginPath();
  ctx.moveTo(columns[0].x - BREAK_COLUMN_STEP, columns[0].topY);
  for (const column of columns) ctx.lineTo(column.x, column.topY);
  for (let index = columns.length - 1; index >= 0; index -= 1) {
    const column = columns[index];
    ctx.lineTo(column.x, column.headY);
  }
  ctx.closePath();
}

function nearestColumn(columns, x) {
  let nearest = null;
  let nearestDistance = Infinity;
  for (const column of columns) {
    const distance = Math.abs(column.x - x);
    if (distance >= nearestDistance) continue;
    nearest = column;
    nearestDistance = distance;
  }
  return nearest;
}

function columnBreakSpan(growth, collapse) {
  return clamp(126 + growth * 22 + collapse * 8, 126, 156);
}

function positiveModulo(value, divisor) {
  return ((value % divisor) + divisor) % divisor;
}

function canonicalContactX(wave) {
  const queried = Number(wave?.contactX?.());
  if (Number.isFinite(queried)) return queried;
  const offset = wave?.profileId === "heroBarrel" ? 96 : 13;
  return Number(wave?.curlX ?? 48) + offset;
}

function colorWithAlpha(color, alpha) {
  const value = String(color ?? "").trim();
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return `rgba(22, 65, 104, ${clamp(alpha, 0, 1)})`;
  const number = Number.parseInt(match[1], 16);
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${clamp(alpha, 0, 1)})`;
}
