import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TUNING } from "./config.js";
import { clamp, smoothstep } from "./math.js";
import { drawAtlasFrame } from "./asset-drawing.js";
import { projectWavePoint, sampleWaveSection } from "./wave.js";

const HORIZON_Y = 79;
const WATERFALL_FRAMES = Object.freeze(["pourA", "pourB", "pourC"]);
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
  const powerFace = clamp(Number(wave?.powerFaceAt?.(sampledX) ?? 0.58), 0.46, 0.7);
  const powerY = clamp(Number(wave?.ridingY?.(sampledX, powerFace) ?? 144), 124, 166);
  const crestY = clamp(Number(wave?.crestY?.(sampledX) ?? HORIZON_Y), 73, 84);

  const curtainTopY = clamp(crestY - 1 - growth * 4, 69, 82);
  const curtainBaseY = clamp(powerY + 43 + collapse * 5, 181, 205);
  // The collision-facing edge falls almost vertically through board height.
  // Only the low rear wash leans back; this keeps the visible danger line
  // welded to GameplayWave.contactX() instead of lagging behind it.
  const curtainLean = 7 + growth * 8 + collapse * 3;
  const curtainEdgeX = contactX - 3;
  const curtainBaseX = contactX - curtainLean;
  const lipReach = clamp(18 + growth * 28 - collapse * 4, 18, 46);
  const lipTipX = contactX + lipReach;
  const lipTipY = curtainTopY + 8 + growth * 5 + collapse * 11;
  const tubeFloorY = clamp(powerY + 25 - opening * 5, 148, 184);
  const tubeDepth = clamp(0.22 + growth * 0.64 - collapse * 0.16, 0.18, 0.88);

  const riderX = clamp(Number(player?.x ?? 208), 0, LOGICAL_WIDTH);
  const focusX = clamp(riderX, Math.max(36, contactX + 8), LOGICAL_WIDTH - 18);
  const focusFace = clamp(Number(wave?.powerFaceAt?.(focusX) ?? powerFace), 0.46, 0.7);
  const focusY = clamp(Number(wave?.ridingY?.(focusX, focusFace) ?? powerY), 126, 172);
  const apertureTop = curtainTopY + 2;
  const apertureBottom = Math.max(apertureTop + 32, tubeFloorY);
  const apertureLeft = curtainEdgeX - 2;
  const apertureRight = Math.max(apertureLeft + 18, lipTipX);
  const passedRight = clamp(contactX - 15, 0, LOGICAL_WIDTH);

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

  drawAheadFaceVolume(ctx, wave, geometry, palette, settings);
  drawPassedSky(ctx, geometry, repaintTrailingSky);
  drawTrailingWhitewater(ctx, geometry, palette, settings, clock);
  const authoredBreak = drawCoherentHeroBreak(ctx, geometry, palette, settings, assets);
  drawTubePocket(ctx, geometry, palette, settings);
  drawFallingCurtainBack(ctx, geometry, palette, settings, assets, clock, authoredBreak);
  // Keep the collision edge legible without painting it over Kaki. The whole
  // falling sheet belongs to the wave layer; catch particles and churn still
  // pass in front when the barrel finally closes.
  if (heroPourMix(geometry) > 0.04) {
    drawCurtainLeadingEdge(ctx, geometry, palette, settings, clock);
  }
  drawPowerTrack(ctx, wave, geometry, palette, settings);
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
  const geometry = heroBarrelGeometry(simulation.wave, simulation.player);
  const clock = settings?.reducedMotion ? 0 : Number(presentationClocks?.fall ?? presentationClocks?.crest ?? 0);
  if (heroPourMix(geometry) > 0.04) {
    drawImpactChurn(ctx, geometry, palette, settings, assets, clock, true);
  }
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

  // Curved down-face planes give the long wall depth. They are broad volume
  // marks, never moving left/right streaks.
  ctx.lineCap = "round";
  for (let lane = 0; lane < 3; lane += 1) {
    const t = lane / 2;
    ctx.strokeStyle = lane === 2 && settings?.highContrast ? p.foam : lane === 0 ? p.waterLight : p.crest;
    ctx.lineWidth = 8 - lane * 1.1;
    ctx.globalAlpha = settings?.highContrast ? 0.28 : 0.055 + t * 0.025;
    ctx.beginPath();
    ctx.moveTo(g.contactX + 9 + lane * 11, HORIZON_Y + 17 + lane * 7);
    ctx.bezierCurveTo(
      g.contactX + 23 + lane * 14,
      112 + lane * 7,
      g.focusX + 7 + lane * 10,
      g.focusY + 9 + lane * 8,
      Math.min(LOGICAL_WIDTH + 8, g.focusX + 106 + lane * 18),
      178 + lane * 9,
    );
    ctx.stroke();
  }
  ctx.restore();
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

  ctx.strokeStyle = p.waterLight;
  ctx.globalAlpha = settings?.highContrast ? 0.78 : 0.3;
  ctx.lineWidth = 2;
  for (let lane = 0; lane < 3; lane += 1) {
    ctx.beginPath();
    ctx.moveTo(c.topX + 5 + lane * 7, c.topY + 13 + lane * 5);
    ctx.bezierCurveTo(
      c.topX + 25 + lane * 9,
      c.topY + 25 + lane * 7,
      c.topX + 31 + lane * 12,
      g.aperture.bottom - 18 + lane * 5,
      c.baseX + 28 + lane * 10,
      c.baseY - 12 + lane * 2,
    );
    ctx.stroke();
  }
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
  ctx.beginPath();
  ctx.rect(0, HORIZON_Y + 4, Math.max(0, c.edgeX + 6), LOGICAL_HEIGHT - HORIZON_Y);
  ctx.clip();

  // Once the breaker has passed, the left side returns to low, dark backwater.
  // The moving edge—not a screen-sized rectangle or row of ribbons—owns the
  // read; only scattered churn remains behind it.
  const phase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, clock) * 0.72) % 19;

  // Chunky foam breakup moves downward only and becomes denser toward the
  // curtain impact. There is no rider-direction term anywhere in this phase.
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 0.68 : 0.22;
  const width = Math.max(18, Math.floor(c.edgeX + 4));
  for (let index = 0; index < 42; index += 1) {
    const x = (index * 47 + (index % 5) * 13) % width;
    const depth = (index * 31 + phase * 2) % Math.max(28, c.baseY - HORIZON_Y - 18);
    const y = HORIZON_Y + 18 + depth;
    const proximity = clamp(x / Math.max(1, c.edgeX), 0, 1);
    const size = proximity > 0.68 || index % 9 === 0 ? 2 : 1;
    ctx.fillRect(x, y, size, index % 6 === 0 ? 3 : size);
  }
  ctx.restore();

  if (heroPourMix(g) > 0.04) drawImpactChurn(ctx, g, p, settings, null, clock, false);
}

function drawCoherentHeroBreak(ctx, g, p, settings, assets) {
  const scale = 0.9 + g.growth * 0.07;
  const anchorX = g.curtain.edgeX + 16;
  const anchorY = g.curtain.baseY + 5;
  let authored = false;
  if (!settings?.highContrast) {
    for (const [frame, alpha] of heroBreakFrameBlend(g)) {
      if (alpha <= 0.01) continue;
      authored = drawAtlasFrame(ctx, assets, "twilightHeroBreak", frame, anchorX, anchorY, {
        scale,
        alpha: 0.9 * alpha,
      }) || authored;
    }
  }
  if (authored) return true;

  // The previous coherent curl remains a local secondary fallback. It is not
  // the production silhouette, but it preserves a connected surf shape if the
  // staged breaker fails or High Contrast bypasses the softer source art.
  const legacyScale = 0.75 + g.growth * 0.1;
  const legacy = drawAtlasFrame(
    ctx,
    assets,
    "twilightHeroBarrel",
    "heroBarrel",
    g.curtain.edgeX - 112,
    g.curtain.topY - 5,
    {
      scale: legacyScale,
      alpha: settings?.highContrast ? 1 : 0.82,
    },
  );
  if (legacy) return true;

  // Complete procedural fallback: one joined curling lip and torn falling
  // sheet, never the former detached cap-plus-rectangle silhouette.
  drawPitchingLip(ctx, g, p, settings);
  return false;
}

function heroBreakFrameBlend(g) {
  const mix = clamp(Number(g.stage?.mix ?? 0), 0, 1);
  if (g.collapse > 0.01) return [["pour", 1 - g.collapse], ["collapse", g.collapse]];
  if (g.stage.index <= 0) return [["curlA", 1]];
  if (g.stage.index === 1) return [["curlA", 1 - mix], ["curlB", mix]];
  if (g.stage.index === 2) return [["curlB", 1 - mix], ["pour", mix]];
  return [["pour", 1]];
}

function heroPourMix(g) {
  if (g.collapse > 0) return 1;
  if (g.stage.index < 2) return 0;
  if (g.stage.index === 2) return clamp(Number(g.stage?.mix ?? 0), 0, 1);
  return 1;
}

function drawFallingCurtainBack(ctx, g, p, settings, assets, clock, coherentBreak = false) {
  const pourMix = heroPourMix(g);
  if (pourMix <= 0.04) return;
  const c = g.curtain;
  const scale = 0.76 + g.growth * 0.18 + g.collapse * 0.06;
  const frame = heroWaterfallFrame(clock, g.collapse, settings?.reducedMotion);
  ctx.save();
  ctx.beginPath();
  ctx.rect(-8, HORIZON_Y - 12, Math.max(0, c.edgeX + 12), LOGICAL_HEIGHT - HORIZON_Y + 20);
  ctx.clip();
  // The first Grok waterfall study contributes only internal falling texture
  // inside the accepted coherent curl. It is never allowed to become the base
  // silhouette, so a missing final atlas cannot regress to a pasted pillar.
  if (coherentBreak && !settings?.highContrast) {
    drawAtlasFrame(ctx, assets, "twilightHeroCurtain", frame, c.edgeX - 15, c.baseY + 4, {
      scale,
      scaleX: 1.38,
      alpha: (0.13 + g.foamEnergy * 0.06) * pourMix,
    });
  }

  traceCurtainSheet(ctx, g);
  ctx.clip();
  const fallPhase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, clock) * 1.16) % 22;
  for (let lane = 0; lane < 9; lane += 1) {
    const t = lane / 8;
    const x = c.topX - 4 - t * (c.lean + 24);
    const y = c.topY + ((FALL_OFFSETS[lane] + fallPhase) % 22);
    ctx.fillStyle = lane % 3 === 0 ? p.foam : lane % 2 ? p.waterLight : p.foamShade;
    ctx.globalAlpha = (settings?.highContrast ? 0.86 : 0.4 + (lane % 3) * 0.12) * pourMix;
    ctx.fillRect(Math.round(x), Math.round(y), lane % 4 === 0 ? 3 : 2, 26 + (lane * 7) % 34);
    ctx.fillRect(Math.round(x - 2), Math.round(y + 38 + lane % 5), 1, 12 + lane % 9);
  }
  ctx.restore();
}

function drawPitchingLip(ctx, g, p, settings) {
  const c = g.curtain;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const body = ctx.createLinearGradient(c.topX - 66, c.topY + 28, c.lipTipX, c.baseY);
  body.addColorStop(0, p.waterDeep);
  body.addColorStop(0.48, p.water);
  body.addColorStop(0.76, p.waterLight);
  body.addColorStop(1, p.foamShade);
  ctx.fillStyle = body;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.92;
  ctx.beginPath();
  ctx.moveTo(c.baseX - 72, c.baseY + 5);
  ctx.bezierCurveTo(c.topX - 72, c.topY + 58, c.topX - 53, c.topY + 2, c.topX - 24, c.topY - 7);
  ctx.bezierCurveTo(c.topX + 3, c.topY - 12, c.lipTipX - 7, c.lipTipY - 7, c.lipTipX, c.lipTipY);
  ctx.bezierCurveTo(c.lipTipX - 8, c.lipTipY + 7, c.edgeX + 9, c.topY + 11, c.edgeX + 7, c.topY + 24);
  ctx.bezierCurveTo(c.edgeX + 6, c.topY + 54, c.baseX + 12, c.baseY - 32, c.baseX + 8, c.baseY);
  ctx.quadraticCurveTo(c.baseX - 27, c.baseY + 12, c.baseX - 72, c.baseY + 5);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.84;
  ctx.lineWidth = settings?.highContrast ? 3 : 2;
  ctx.beginPath();
  ctx.moveTo(c.topX - 53, c.topY + 2);
  ctx.bezierCurveTo(c.topX - 28, c.topY - 9, c.topX + 3, c.topY - 12, c.lipTipX, c.lipTipY);
  ctx.stroke();

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

function drawCurtainLeadingEdge(ctx, g, p, settings, clock) {
  const c = g.curtain;
  const phase = settings?.reducedMotion ? 0 : Math.floor(Math.max(0, clock) * 0.84) % 13;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = p.foamShade;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.76;
  ctx.lineWidth = settings?.highContrast ? 8 : 6;
  traceCurtainEdge(ctx, g, phase * 0.18);
  ctx.stroke();
  ctx.strokeStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 0.92 : 0.34;
  ctx.lineWidth = settings?.highContrast ? 3 : 2;
  traceCurtainEdge(ctx, g, 0);
  ctx.stroke();

  // Broken foam clusters keep the edge bright without turning it into one
  // perfectly straight white cable.
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 1 : 0.86;
  for (let index = 0; index < 8; index += 1) {
    const t = 0.08 + index * 0.115;
    const point = curtainEdgePoint(g, t);
    const width = 3 + (index * 5 + phase) % 5;
    ctx.fillRect(Math.round(point.x - width * 0.55), Math.round(point.y), width, 2 + index % 3);
    if (index % 2 === 0) ctx.fillRect(Math.round(point.x - 2), Math.round(point.y + 4), 2, 3);
  }

  // Detached droplets may cross the collision edge; opaque water never does.
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings?.highContrast ? 0.94 : 0.72;
  const dropCount = 7 + Math.round(g.foamEnergy * 5);
  for (let index = 0; index < dropCount; index += 1) {
    const x = c.edgeX + 3 + ((index * 11 + phase * 3) % 22);
    const y = c.topY + 14 + ((index * 17 + phase * 5) % 71);
    ctx.fillRect(x, y, index % 5 === 0 ? 2 : 1, index % 4 === 0 ? 3 : 2);
  }
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
  const thickness = 26 + g.foamEnergy * 16;
  ctx.beginPath();
  ctx.moveTo(c.topX - thickness, c.topY + 1);
  ctx.bezierCurveTo(c.topX - thickness + 9, c.topY + 28, c.baseX - thickness * 0.35, c.baseY - 34, c.baseX - thickness * 0.18, c.baseY);
  ctx.bezierCurveTo(c.baseX + 12, c.baseY + 2, c.baseX + 15, c.baseY - 21, c.edgeX, c.topY + 2);
  ctx.closePath();
}

function traceCurtainEdge(ctx, g, offset = 0) {
  const c = g.curtain;
  ctx.beginPath();
  ctx.moveTo(c.edgeX + offset, c.topY + 1);
  ctx.bezierCurveTo(
    c.edgeX + 5 - offset,
    c.topY + 30,
    c.baseX + 16 + offset,
    c.baseY - 35,
    c.baseX + offset,
    c.baseY,
  );
}

function curtainEdgePoint(g, progress) {
  const c = g.curtain;
  return cubicPoint(
    { x: c.edgeX, y: c.topY + 1 },
    { x: c.edgeX + 5, y: c.topY + 30 },
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
