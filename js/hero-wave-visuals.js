import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TUNING } from "./config.js";
import { clamp, smoothstep } from "./math.js";
import { drawAtlasFrame } from "./asset-drawing.js";
import { projectWavePoint, sampleWaveSection } from "./wave.js";

const HORIZON_Y = 79;
const WATERFALL_FRAMES = Object.freeze(["pourA", "pourB", "pourC"]);
const TRAVELLING_BREAK_FRAMES = Object.freeze([
  "spill",
  "steepen",
  "fall",
  "pocket",
  "curtain",
  "collapse",
]);
const FALL_OFFSETS = Object.freeze([0, 7, 3, 12, 5, 15, 2, 10, 6, 14, 4, 9]);
const CHURN_OFFSETS = Object.freeze([0, 8, 3, 14, 6, 19, 11, 24, 4, 16, 27, 9]);

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
  const lipReach = clamp(22 + growth * 38 - collapse * 3, 22, 60);
  const lipTipX = contactX + lipReach;
  const lipTipY = curtainTopY + 8 + growth * 5 + collapse * 11;
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
  const passedRight = clamp(contactX - 24, 0, LOGICAL_WIDTH);

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
      bottom: HORIZON_Y + 1,
    },
  };
}

export function heroPassedSkyWindow(wave, player = null) {
  return heroBarrelGeometry(wave, player).passedWindow;
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
  const depth = ctx.createLinearGradient(0, HORIZON_Y, 0, LOGICAL_HEIGHT);
  depth.addColorStop(0, palette.water);
  depth.addColorStop(0.44, palette.waterDeep);
  depth.addColorStop(1, palette.ink);
  ctx.fillStyle = depth;
  ctx.fillRect(0, HORIZON_Y - 1, LOGICAL_WIDTH, LOGICAL_HEIGHT - HORIZON_Y + 1);

  // One broken horizon crest communicates a long wave without the old rows of
  // horizontal speed lines. Its phase is monotonic and cannot mirror with Kaki.
  ctx.save();
  ctx.strokeStyle = settings?.highContrast ? palette.foam : palette.waterLight;
  ctx.lineWidth = settings?.highContrast ? 2 : 1;
  ctx.globalAlpha = settings?.highContrast ? 0.9 : 0.58;
  ctx.beginPath();
  ctx.moveTo(0, HORIZON_Y + 2);
  for (let x = 0; x <= LOGICAL_WIDTH + 8; x += 8) {
    const y = HORIZON_Y + 1 + ((Math.floor(x / 8) * 5 + Math.floor(clock * 0.08)) % 4);
    ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Sparse diagonal depth flecks fall down-face. They do not change direction
  // when the rider reverses and stay subordinate to the breaker silhouette.
  ctx.fillStyle = palette.waterLight;
  ctx.globalAlpha = settings?.highContrast ? 0.26 : 0.12;
  const fall = Math.floor(clock * 0.24) % 17;
  for (let index = 0; index < 12; index += 1) {
    const x = 28 + (index * 47) % 352;
    const y = 96 + ((index * 19 + fall) % 88);
    ctx.fillRect(x, y, index % 4 === 0 ? 2 : 1, 5 + index % 5);
    if (index % 3 === 0) ctx.fillRect(x + 2, y + 7, 1, 3);
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
  // One registered, full-height silhouette now owns the crest, tube, falling
  // curtain, and long face. Keeping those parts in one mask prevents the old
  // floating shelf and mismatched waterfall seams.
  drawAheadFaceVolume(ctx, wave, geometry, palette, settings);
  drawContinuousSideBreak(ctx, geometry, palette, settings, assets);
  drawTrailingWhitewater(ctx, geometry, palette, settings, clock);
  drawFallingCurtainBack(ctx, geometry, palette, settings, clock);
  // Keep the collision edge legible without painting it over Kaki. The whole
  // falling sheet belongs to the wave layer; catch particles and churn still
  // pass in front when the barrel finally closes.
  const edgeWash = clamp(0.16 + geometry.growth * 0.18 + heroPourMix(geometry) * 0.66, 0.16, 1);
  drawCurtainLeadingEdge(ctx, geometry, palette, settings, clock, edgeWash);
  drawPowerTrack(ctx, wave, geometry, palette, settings);
  drawHeroReadAssist(ctx, simulation, geometry, palette, settings);
}

function drawContinuousSideBreak(ctx, g, p, settings, assets) {
  const drawn = drawAtlasFrame(
    ctx,
    assets,
    "continuousSideBreak",
    "sideBreak",
    g.contactX,
    LOGICAL_HEIGHT * 0.5,
    {
      scaleX: 0.88 + g.growth * 0.12 + g.collapse * 0.02,
      scaleY: 0.84 + g.growth * 0.16 + g.collapse * 0.02,
      alpha: settings?.highContrast ? 0.76 : 0.9,
    },
  );
  if (drawn) return true;

  // Complete code-native fallback. Its upper boundary forms the outer crest,
  // hollow lip, and rideable trough in a single path; no rectangular shelf or
  // separately positioned curl can appear when optional art is unavailable.
  const c = g.curtain;
  const rearX = Math.max(-96, c.edgeX - 176);
  const peakX = c.edgeX - 72 - g.growth * 16;
  const peakY = c.topY - 2;
  const lipX = c.edgeX + 24 + g.growth * 16;
  const lipY = c.topY + 12;
  const troughX = Math.max(c.edgeX + 92, g.focusX + 24);
  const troughY = Math.max(g.focusY + 30, 166);
  const fill = ctx.createLinearGradient(peakX, peakY, troughX, troughY);
  fill.addColorStop(0, p.waterLight);
  fill.addColorStop(0.36, p.water);
  fill.addColorStop(1, p.waterDeep);

  ctx.save();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(rearX, LOGICAL_HEIGHT + 4);
  ctx.bezierCurveTo(rearX + 12, 156, peakX - 30, peakY + 8, peakX, peakY);
  ctx.bezierCurveTo(peakX + 42, peakY - 9, lipX - 12, lipY - 8, lipX, lipY);
  ctx.bezierCurveTo(lipX - 10, lipY + 26, c.edgeX + 25, g.powerY + 18, troughX, troughY);
  ctx.bezierCurveTo(troughX + 82, troughY + 6, LOGICAL_WIDTH - 42, troughY - 8, LOGICAL_WIDTH + 8, troughY + 4);
  ctx.lineTo(LOGICAL_WIDTH + 8, LOGICAL_HEIGHT + 8);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = p.foamShade;
  ctx.lineWidth = settings?.highContrast ? 8 : 5;
  ctx.beginPath();
  ctx.moveTo(rearX + 4, 166);
  ctx.bezierCurveTo(peakX - 32, peakY + 5, lipX - 16, lipY - 11, lipX, lipY);
  ctx.stroke();
  ctx.strokeStyle = p.foam;
  ctx.lineWidth = settings?.highContrast ? 3 : 2;
  ctx.stroke();
  ctx.restore();
  return false;
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

function drawAheadFaceVolume(ctx, wave, g, p, settings) {
  ctx.save();
  traceAheadFace(ctx, g);
  ctx.clip();

  const face = ctx.createLinearGradient(g.contactX, HORIZON_Y, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  face.addColorStop(0, p.waterDeep);
  face.addColorStop(0.42, p.water);
  face.addColorStop(1, p.ink);
  ctx.fillStyle = face;
  ctx.globalAlpha = settings?.highContrast ? 0.68 : 0.42;
  ctx.fillRect(g.contactX - 6, HORIZON_Y, LOGICAL_WIDTH - g.contactX + 12, LOGICAL_HEIGHT - HORIZON_Y);

  // One broad, edgeless light volume joins the authored trough to the live
  // face. Narrow diagonal beams read like moving lane markers, so the hero
  // level deliberately avoids them.
  const glow = ctx.createRadialGradient(
    g.focusX + 20,
    g.focusY + 18,
    8,
    g.focusX + 42,
    g.focusY + 34,
    126,
  );
  glow.addColorStop(0, colorWithAlpha(p.waterLight, settings?.highContrast ? 0.18 : 0.1));
  glow.addColorStop(1, colorWithAlpha(p.waterLight, 0));
  ctx.fillStyle = glow;
  ctx.globalAlpha = 1;
  ctx.fillRect(g.contactX, HORIZON_Y, LOGICAL_WIDTH - g.contactX + 8, LOGICAL_HEIGHT - HORIZON_Y);

  ctx.restore();
}

function drawTravellingHeroBreak(ctx, g, settings, assets) {
  if (settings?.highContrast) return false;
  const scale = 0.88 + g.growth * 0.08 + g.collapse * 0.04;
  let drawn = false;
  const weights = new Map();
  for (const [frame, alpha] of travellingBreakFrameBlend(g)) {
    if (alpha <= 0.01) continue;
    // The generated gather/steepen poses read as detached diagonal shards at
    // gameplay size. The live crest below already owns those beats; generated
    // detail enters only when gravity can make it unmistakably whitewater.
    if (frame === "spill" || frame === "steepen") continue;
    // The authored pocket is the cleanest connected waterfall. The sheet's
    // later curtain/collapse cells broaden into opaque foam blocks, so those
    // beats keep the pocket texture while live geometry adds density/churn.
    const runtimeFrame = frame === "curtain" || frame === "collapse" ? "pocket" : frame;
    weights.set(runtimeFrame, (weights.get(runtimeFrame) ?? 0) + alpha);
  }
  for (const [frame, alpha] of weights) {
    const frameAlpha = frame === "fall" ? 0.34 : 0.44;
    drawn = drawAtlasFrame(
      ctx,
      assets,
      "twilightTravellingBreak",
      frame,
      g.curtain.edgeX + 4,
      g.curtain.baseY + 3,
      {
        scale,
        scaleX: 0.78,
        scaleY: 1.34,
        alpha: frameAlpha * clamp(alpha, 0, 1),
      },
    ) || drawn;
  }
  return drawn;
}

function drawTubePocket(ctx, g, p, settings) {
  const c = g.curtain;
  const reach = clamp(c.lipTipX - c.topX, 20, 72);
  ctx.save();
  traceAheadFace(ctx, g);
  ctx.clip();

  const shadow = ctx.createRadialGradient(
    c.topX + reach * 0.42,
    c.topY + 54,
    4,
    c.topX + reach * 0.48,
    c.topY + 58,
    reach * 1.12,
  );
  shadow.addColorStop(0, p.ink);
  shadow.addColorStop(0.62, p.waterDeep);
  shadow.addColorStop(1, colorWithAlpha(p.waterDeep, 0));
  ctx.fillStyle = shadow;
  ctx.globalAlpha = settings?.highContrast ? 0.54 : 0.28 + g.tubeDepth * 0.2;
  ctx.beginPath();
  ctx.moveTo(c.topX - 1, c.topY + 6);
  ctx.bezierCurveTo(c.topX + reach * 0.35, c.topY + 1, c.lipTipX + 7, c.lipTipY + 9, c.lipTipX - 3, c.lipTipY + 18);
  ctx.bezierCurveTo(c.topX + reach * 0.82, g.aperture.bottom + 6, c.topX + 18, g.aperture.bottom + 19, c.baseX + 4, c.baseY - 7);
  ctx.bezierCurveTo(c.topX + 7, c.topY + 72, c.topX - 6, c.topY + 30, c.topX - 1, c.topY + 6);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
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

function travellingBreakFrameBlend(g) {
  const index = clamp(Math.floor(Number(g.stage?.index ?? 0)), 0, TRAVELLING_BREAK_FRAMES.length - 1);
  if (index >= TRAVELLING_BREAK_FRAMES.length - 1) return [[TRAVELLING_BREAK_FRAMES.at(-1), 1]];
  const mix = smoothstep(0.18, 0.82, clamp(Number(g.stage?.mix ?? 0), 0, 1));
  return [
    [TRAVELLING_BREAK_FRAMES[index], 1 - mix],
    [TRAVELLING_BREAK_FRAMES[index + 1], mix],
  ];
}

function heroPourMix(g) {
  if (g.collapse > 0) return 1;
  if (g.stage.index < 2) return 0;
  if (g.stage.index === 2) return clamp(Number(g.stage?.mix ?? 0), 0, 1);
  return 1;
}

function drawFallingCurtainBack(ctx, g, p, settings, clock) {
  const pourMix = heroPourMix(g);
  if (pourMix <= 0.04) return;
  const c = g.curtain;
  ctx.save();
  ctx.beginPath();
  ctx.rect(-8, HORIZON_Y - 12, Math.max(0, c.lipTipX + 12), LOGICAL_HEIGHT - HORIZON_Y + 20);
  ctx.clip();
  traceCurtainSheet(ctx, g);
  const sheet = ctx.createLinearGradient(c.lipTipX, c.lipTipY, c.baseX, c.baseY);
  sheet.addColorStop(0, p.foam);
  sheet.addColorStop(0.24, p.foamShade);
  sheet.addColorStop(0.62, p.waterLight);
  sheet.addColorStop(1, p.foamShade);
  ctx.fillStyle = sheet;
  ctx.globalAlpha = (settings?.highContrast ? 0.68 : 0.34 + g.foamEnergy * 0.14) * pourMix;
  ctx.fill();
  traceCurtainSheet(ctx, g);
  ctx.clip();
  const fallPhase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, clock) * 1.16) % 22;
  for (let lane = 0; lane < 12; lane += 1) {
    const across = lane / 11;
    ctx.fillStyle = lane % 3 === 0 ? p.foam : lane % 2 ? p.waterLight : p.foamShade;
    ctx.globalAlpha = (settings?.highContrast ? 0.86 : 0.34 + (lane % 3) * 0.1) * pourMix;
    const startProgress = ((FALL_OFFSETS[lane] + fallPhase) % 22) / 22;
    for (let segment = 0; segment < 4; segment += 1) {
      const progress = (startProgress + segment * (0.21 + lane % 2 * 0.018)) % 0.96;
      const segmentPoint = curtainEdgePoint(g, progress);
      const inset = across * (29 + g.foamEnergy * 18) * (1 - progress * 0.34);
      ctx.fillRect(
        Math.round(segmentPoint.x - inset),
        Math.round(segmentPoint.y),
        lane % 4 === 0 ? 4 : lane % 3 === 0 ? 3 : 2,
        7 + (lane * 3 + segment * 5) % 14,
      );
    }
  }
  ctx.restore();
}

function drawPitchingLip(ctx, g, p, settings) {
  const c = g.curtain;
  ctx.save();
  const rearBaseX = Math.max(-58, c.baseX - 112 - g.growth * 24);
  const rearCrestX = c.topX - 72 - g.growth * 12;
  const rearCrestY = c.topY + 16 + (1 - g.growth) * 7;
  const body = ctx.createLinearGradient(rearCrestX, c.topY + 18, c.lipTipX, c.baseY);
  body.addColorStop(0, p.waterDeep);
  body.addColorStop(0.58, p.water);
  body.addColorStop(0.86, p.waterLight);
  body.addColorStop(1, p.water);
  ctx.fillStyle = body;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.92;
  ctx.beginPath();
  ctx.moveTo(rearBaseX, c.baseY + 5);
  ctx.bezierCurveTo(rearBaseX + 11, c.topY + 82, rearCrestX - 20, rearCrestY + 13, rearCrestX, rearCrestY);
  ctx.bezierCurveTo(c.topX - 27, c.topY - 10, c.lipTipX - 12, c.lipTipY - 11, c.lipTipX, c.lipTipY);
  ctx.bezierCurveTo(c.lipTipX - 8, c.lipTipY + 10, c.edgeX + 10, c.topY + 15, c.edgeX + 8, c.topY + 31);
  ctx.bezierCurveTo(c.edgeX + 5, c.topY + 65, c.baseX + 15, c.baseY - 34, c.baseX + 9, c.baseY);
  ctx.quadraticCurveTo(c.baseX - 33, c.baseY + 12, rearBaseX, c.baseY + 5);
  ctx.closePath();
  ctx.fill();

  // A subdued joined band gives the crown physical continuity. Chunky packets
  // then roughen both edges so it does not become a smooth neon pipe.
  const crestStart = { x: rearCrestX, y: rearCrestY };
  const crestControlA = { x: c.topX - 30, y: c.topY - 10 };
  const crestControlB = { x: c.lipTipX - 13, y: c.lipTipY - 12 };
  const crestEnd = { x: c.lipTipX, y: c.lipTipY };

  // Broad descending channels give the wall volume without closing into a C
  // or laying horizontal rails across the rideable face.
  for (let lane = 0; lane < 4; lane += 1) {
    const start = cubicPoint(
      crestStart,
      crestControlA,
      crestControlB,
      crestEnd,
      0.13 + lane * 0.145,
    );
    const endX = rearBaseX + 30 + lane * 24;
    const bandWidth = 11 + lane * 3;
    ctx.fillStyle = lane === 2 ? p.waterLight : lane === 3 ? p.water : p.waterDeep;
    ctx.globalAlpha = settings?.highContrast ? 0.4 : 0.16 + lane * 0.045;
    ctx.beginPath();
    ctx.moveTo(start.x - bandWidth * 0.5, start.y + 5);
    ctx.bezierCurveTo(
      start.x - 17 - lane * 2,
      c.topY + 42 + lane * 7,
      endX - 6,
      c.baseY - 46 + lane * 4,
      endX,
      c.baseY - 6,
    );
    ctx.lineTo(endX + bandWidth, c.baseY - 8);
    ctx.bezierCurveTo(
      endX + bandWidth + 4,
      c.baseY - 48 + lane * 3,
      start.x + bandWidth * 0.6,
      c.topY + 38 + lane * 5,
      start.x + bandWidth * 0.5,
      start.y + 7,
    );
    ctx.closePath();
    ctx.fill();
  }

  // Irregular foam packets roughen the crest without filling a smooth cap.
  // The open gaps are important: a solid canopy reads like a hovering slab.
  const capDepth = 6 + Math.round(g.growth * 5 + g.collapse * 2);
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.88;
  for (let index = 0; index < 13; index += 1) {
    const t = 0.04 + index * 0.073;
    const point = cubicPoint(crestStart, crestControlA, crestControlB, crestEnd, t);
    const packetWidth = 5 + (index * 7) % 7;
    const packetHeight = 2 + (index * 5) % 4;
    ctx.fillRect(
      Math.round(point.x - packetWidth * 0.45),
      Math.round(point.y - 2 + ((index * 3) % 4)),
      packetWidth,
      packetHeight,
    );
    if (index > 6 && index % 2 === 0) {
      ctx.fillRect(Math.round(point.x - 1), Math.round(point.y + capDepth - 1), 2, 5 + index % 5);
    }
  }

  ctx.strokeStyle = p.foamShade;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.62;
  ctx.lineWidth = settings?.highContrast ? 8 : 6;
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(crestStart.x, crestStart.y);
  ctx.bezierCurveTo(
    crestControlA.x,
    crestControlA.y,
    crestControlB.x,
    crestControlB.y,
    crestEnd.x,
    crestEnd.y,
  );
  ctx.stroke();
  for (let index = 0; index < 18; index += 1) {
    const t = index / 17;
    const point = cubicPoint(crestStart, crestControlA, crestControlB, crestEnd, t);
    const width = 7 + (index * 7) % 6;
    const height = 3 + (index * 5) % 4;
    const jitterY = ((index * 7) % 5) - 2;
    ctx.fillStyle = index % 3 === 0 ? p.foam : p.foamShade;
    ctx.globalAlpha = settings?.highContrast ? 1 : 0.72 + (index % 3) * 0.08;
    ctx.fillRect(
      Math.round(point.x - width * 0.5),
      Math.round(point.y - height * 0.5 + jitterY),
      width,
      height,
    );
    if (index === 2 || index === 6 || index === 11 || index === 15) {
      ctx.globalAlpha *= 0.72;
      ctx.fillRect(Math.round(point.x - 2), Math.round(point.y - 8 - index % 3), 3, 4);
    }
  }

  // Torn foam bridges the hook directly into the falling edge.
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.72;
  for (let index = 0; index < 7; index += 1) {
    const x = Math.round(c.lipTipX - 5 - index * 6);
    const y = Math.round(c.lipTipY + 3 + (index * 7) % 10);
    ctx.fillRect(x, y, 3 + index % 4, 2 + index % 3);
  }
  ctx.restore();
}

function drawCurtainLeadingEdge(ctx, g, p, settings, clock, intensity = 1) {
  const c = g.curtain;
  const phase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, clock) * 0.84) % 13;
  ctx.save();

  // The visible edge is a chain of falling water packets, never a continuous
  // stroke. Gaps, alternating widths, and downward-only phase keep it reading
  // as a torn waterfall instead of a bright glass pipe.
  for (let index = 0; index < 13; index += 1) {
    const t = 0.055 + index * 0.072;
    const point = curtainEdgePoint(g, t);
    const width = 2 + (index * 5 + phase) % 6;
    const fall = (index * 3 + phase) % 6;
    ctx.fillStyle = index % 3 === 0 ? p.foam : p.foamShade;
    ctx.globalAlpha = (settings?.highContrast ? 1 : index % 3 === 0 ? 0.82 : 0.58) * intensity;
    ctx.fillRect(
      Math.round(point.x - width * 0.55),
      Math.round(point.y + fall),
      width,
      2 + index % 4,
    );
    if (index % 2 === 0) {
      ctx.globalAlpha *= 0.72;
      ctx.fillRect(Math.round(point.x - 2), Math.round(point.y + fall + 5), 1 + index % 2, 3);
    }
  }

  // Detached droplets may cross the collision edge; opaque water never does.
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = (settings?.highContrast ? 0.94 : 0.72) * intensity;
  const dropCount = 7 + Math.round(g.foamEnergy * 5);
  for (let index = 0; index < dropCount; index += 1) {
    const progress = 0.08 + ((index * 17 + phase * 3) % 78) / 100;
    const point = curtainEdgePoint(g, progress);
    const x = point.x + 3 + (index * 7 + phase) % 9;
    const y = point.y + (index * 5 + phase) % 8;
    ctx.fillRect(x, y, index % 5 === 0 ? 2 : 1, index % 4 === 0 ? 3 : 2);
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

function traceAheadFace(ctx, g) {
  const c = g.curtain;
  ctx.beginPath();
  ctx.moveTo(c.topX - 1, HORIZON_Y - 4);
  ctx.bezierCurveTo(c.edgeX + 7, c.topY + 27, c.baseX + 16, c.baseY - 31, c.baseX, c.baseY);
  ctx.lineTo(LOGICAL_WIDTH + 8, LOGICAL_HEIGHT + 8);
  ctx.lineTo(LOGICAL_WIDTH + 8, HORIZON_Y - 4);
  ctx.closePath();
}

function traceCurtainSheet(ctx, g) {
  const c = g.curtain;
  const thickness = 34 + g.foamEnergy * 20;
  ctx.beginPath();
  ctx.moveTo(c.lipTipX - thickness * 0.76, c.lipTipY - 3);
  ctx.bezierCurveTo(
    c.lipTipX - thickness * 0.62,
    c.lipTipY + 30,
    c.baseX - thickness * 0.58,
    c.baseY - 36,
    c.baseX - thickness * 0.24,
    c.baseY,
  );
  ctx.bezierCurveTo(
    c.baseX + 16,
    c.baseY + 2,
    c.baseX + 23,
    c.baseY - 27,
    c.lipTipX + 1,
    c.lipTipY + 2,
  );
  ctx.closePath();
}

function curtainEdgePoint(g, progress) {
  const c = g.curtain;
  return cubicPoint(
    { x: c.lipTipX, y: c.lipTipY + 1 },
    { x: c.lipTipX - 5, y: c.lipTipY + 32 },
    { x: c.baseX + 16, y: c.baseY - 35 },
    { x: c.baseX, y: c.baseY },
    progress,
  );
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

function cubicPoint(start, controlA, controlB, end, t) {
  const progress = clamp(t, 0, 1);
  const inverse = 1 - progress;
  const aa = inverse * inverse * inverse;
  const ab = 3 * inverse * inverse * progress;
  const bb = 3 * inverse * progress * progress;
  const cc = progress * progress * progress;
  return {
    x: start.x * aa + controlA.x * ab + controlB.x * bb + end.x * cc,
    y: start.y * aa + controlA.y * ab + controlB.y * bb + end.y * cc,
  };
}
