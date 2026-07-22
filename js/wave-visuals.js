import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./config.js";
import { clamp, smoothstep } from "./math.js";
import { drawAtlasFrame } from "./asset-drawing.js";

const EDGE_STEPS = Object.freeze([0, 1, 0, -1, 0, 2, 1, 0, -2, -1, 1, 0, 2, 0, -1, 0, 1, -2, 0, 1, 0, -1, 2, 1]);
const RIBBON_LENGTHS = Object.freeze([8, 15, 5, 22, 11, 18, 7, 26, 13, 9, 20, 6, 17, 12, 24, 10]);
const RIBBON_GAPS = Object.freeze([13, 7, 19, 11, 5, 17, 9, 21, 8, 15, 6, 18, 10, 23, 12, 7]);
const PRESENTATION_CLOCK_KEYS = Object.freeze([
  "backWater",
  "speedFeedback",
  "swellContours",
  "faceGlints",
  "powerSeam",
  "crest",
  "fall",
]);

/** Pure bridge used by renderer tests to prove the visual seam is canonical. */
export function powerSeamFaceAt(wave, x) {
  return wave.powerFaceAt(x);
}

export function waveVisualTravel(wave) {
  const signed = Number(wave?.worldTravel);
  if (Number.isFinite(signed)) return signed;
  const fallback = Number(wave?.travel);
  return Number.isFinite(fallback) ? fallback : 0;
}

/** Decorative water flow is monotonic; rider reversals must not reverse the sea. */
export function waveSurfaceTravel(wave) {
  const travel = Number(wave?.travel);
  if (Number.isFinite(travel)) return travel;
  return Math.abs(waveVisualTravel(wave));
}

/**
 * Decorative motion owns accumulated clocks instead of multiplying total
 * distance by a rate that can change every frame. Changing speed, momentum,
 * or rider direction therefore changes future motion rate, never phase sign.
 */
export function createWavePresentationClocks() {
  return {
    backWater: 0,
    speedFeedback: 0,
    swellContours: 0,
    faceGlints: 0,
    powerSeam: 0,
    crest: 0,
    fall: 0,
    surfaceTravel: null,
    waveTime: null,
  };
}

export function resetWavePresentationClocks(clocks) {
  for (const key of PRESENTATION_CLOCK_KEYS) clocks[key] = 0;
  clocks.surfaceTravel = null;
  clocks.waveTime = null;
  return clocks;
}

export function advanceWavePresentationClocks(
  clocks,
  wave,
  player,
  speedCap = 138,
  reducedMotion = false,
) {
  const surfaceTravel = waveSurfaceTravel(wave);
  const previousTravel = clocks.surfaceTravel;
  const waveTime = Number(wave?.time);
  const previousWaveTime = clocks.waveTime;
  if (!Number.isFinite(previousTravel)) {
    clocks.surfaceTravel = surfaceTravel;
    clocks.waveTime = Number.isFinite(waveTime) ? waveTime : null;
    return clocks;
  }

  // A run reset is the only allowed phase reset. Signed world travel is not
  // consulted here, so a rider reversal cannot make ambient water reverse.
  if (surfaceTravel + 0.001 < previousTravel) {
    resetWavePresentationClocks(clocks);
    clocks.surfaceTravel = surfaceTravel;
    clocks.waveTime = Number.isFinite(waveTime) ? waveTime : null;
    return clocks;
  }

  const deltaTravel = Math.max(0, surfaceTravel - previousTravel);
  const deltaWaveTime = Number.isFinite(waveTime) && Number.isFinite(previousWaveTime)
    ? Math.max(0, waveTime - previousWaveTime)
    : 0;
  clocks.surfaceTravel = surfaceTravel;
  clocks.waveTime = Number.isFinite(waveTime) ? waveTime : null;
  if (reducedMotion) return clocks;

  // Gravity owns the waterfall cadence. Wave time is fixed-step, pause-safe,
  // and independent of rider speed/direction, so the pour never slows into a
  // slideshow when Kaki carves back across the face.
  clocks.fall += deltaWaveTime * 14;
  if (deltaTravel <= 0) return clocks;

  const safeCap = Math.max(1, Number(speedCap) || 138);
  const speedRatio = clamp(Math.abs(Number(player?.motionSpeed ?? player?.speed ?? 0)) / safeCap, 0, 1);
  const momentum = clamp(Number(player?.waveMomentum ?? 0), 0, 1);
  const speedIntensity = smoothstep(0.68, 0.98, speedRatio);
  clocks.backWater += deltaTravel * (0.18 + speedRatio * 0.12);
  clocks.speedFeedback += deltaTravel * (0.54 + speedIntensity * 0.36);
  clocks.swellContours += deltaTravel * (0.035 + speedRatio * 0.028);
  clocks.faceGlints += deltaTravel * (0.075 + speedRatio * 0.065);
  clocks.powerSeam += deltaTravel * (0.22 + momentum * 0.16);
  clocks.crest += deltaTravel * 0.14;
  return clocks;
}

export function waveProgressionBlend(wave, player, curlCatchDelay = 0.58) {
  const pressure = clamp(Number(wave?.pressure ?? 0), 0, 1);
  const curlTimer = Math.max(0, Number(player?.curlTimer ?? 0));
  const caught = player?.state === "wipeout" && Number(player?.x ?? Infinity) <= Number(wave?.curlX ?? 0) + 18;
  const impact = Math.max(
    smoothstep(0.86, 1, pressure),
    smoothstep(0.04, Math.max(0.08, curlCatchDelay * 0.85), curlTimer),
    Number(caught),
  );
  if (impact > 0) return Object.freeze({ from: "curl", to: "impact", mix: impact });
  if (pressure < 0.54) {
    return Object.freeze({ from: "swell", to: "pitch", mix: smoothstep(0.18, 0.54, pressure) });
  }
  return Object.freeze({ from: "pitch", to: "curl", mix: smoothstep(0.5, 0.86, pressure) });
}

export function waveGoldGlintOffset(presentationClock, index = 0) {
  const phase = Math.floor(Math.max(0, Number(presentationClock) || 0));
  return -(((phase + index * 7) % 13 + 13) % 13);
}

export function breakerSkyWindow(wave) {
  const curl = clamp(Number(wave?.curlX ?? 0), 0, LOGICAL_WIDTH);
  const crest = clamp(Number(wave?.crestY?.(curl) ?? 78), 54, 112);
  const right = clamp(curl - 8, 0, LOGICAL_WIDTH - 20);
  const horizon = 80;
  return {
    right,
    shoulder: Math.max(0, right - 44),
    top: 0,
    horizon,
    fold: clamp(crest - 1, 60, horizon - 3),
    // This cutout reveals only sky. Repainting the aerial panorama below the
    // horizon creates the large yellow bite that looked like missing scenery
    // after a breaker passed.
    bottom: horizon,
  };
}

export function waveGuideAt(wave, player, board, options = {}) {
  const x = Number(player?.x ?? 0);
  const face = Number(player?.face ?? 0.5);
  return wave.speedPotential(x, face, {
    pumpCharge: player?.charge,
    pumpReleased: player?.pumpReleased,
    board,
    breaking: player?.state === "lip",
    faceVelocity: player?.faceVelocity,
    ...options,
  });
}

export function drawLayeredWave(
  ctx,
  simulation,
  palette,
  settings,
  time,
  conditionId,
  assets = null,
  presentationClocks = null,
) {
  const wave = simulation.wave;
  const player = simulation.player;
  const speedCap = publishedSpeedCap(simulation);
  const speedRatio = clamp(Number(player?.motionSpeed ?? player?.speed ?? 0) / speedCap, 0, 1);
  const momentum = clamp(Number(player?.waveMomentum ?? 0), 0, 1);
  traceWaveFace(ctx, wave, 0, 1.36);
  ctx.fillStyle = palette.waterDeep;
  ctx.fill();

  drawRampBand(ctx, wave, 0.015, 0.78, palette.water);
  drawRampBand(ctx, wave, 0.015, 0.43, palette.waterLight);
  drawRampBand(ctx, wave, 0.01, 0.17, mixTone(palette.waterLight, palette.crest, conditionId));
  drawSwellContours(ctx, wave, palette, settings, speedRatio, momentum, presentationClocks?.swellContours ?? 0);
  drawFaceGlints(ctx, wave, palette, settings, speedRatio, momentum, presentationClocks?.faceGlints ?? 0);
  drawPowerSeam(ctx, wave, player, palette, settings, presentationClocks?.powerSeam ?? 0);
  drawCurlMass(ctx, simulation, palette, time, conditionId, settings, assets);
  drawCrestAndLip(ctx, wave, player, palette, conditionId, settings, speedRatio, momentum, presentationClocks?.crest ?? 0);
  drawWaveReadAssist(ctx, wave, player, simulation.board, palette, settings, time);
}

function traceWaveFace(ctx, wave, topFace, bottomFace, start = 0, end = LOGICAL_WIDTH) {
  ctx.beginPath();
  ctx.moveTo(start, Math.round(wave.ridingY(start, topFace)));
  for (let x = start; x <= end; x += 2) ctx.lineTo(x, Math.round(wave.ridingY(x, topFace)));
  for (let x = end; x >= start; x -= 2) ctx.lineTo(x, Math.round(wave.ridingY(x, bottomFace)));
  ctx.closePath();
}

function drawRampBand(ctx, wave, top, bottom, color) {
  traceWaveFace(ctx, wave, top, bottom);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSwellContours(ctx, wave, p, settings, speedRatio, momentum, presentationClock) {
  const clock = settings.reducedMotion ? 0 : presentationClock;
  ctx.save();
  ctx.globalAlpha = settings.highContrast ? 0.3 : 0.18;
  ctx.lineWidth = 1;
  for (let lane = 0; lane < 4; lane += 1) {
    const face = 0.58 + lane * 0.18;
    ctx.strokeStyle = lane % 2 === 0 ? p.deepInk : p.waterLight;
    for (let segment = 0; segment < 6; segment += 1) {
      const pattern = (segment + lane * 5) % RIBBON_LENGTHS.length;
      const travel = segment * 89 + lane * 31 + RIBBON_GAPS[pattern] - clock * (0.31 + lane * 0.04);
      const x = Math.round(((travel % 520) + 520) % 520) - 68;
      if (x <= wave.curlX + 18) continue;
      const length = 12 + (RIBBON_LENGTHS[pattern] % 12) + Math.round(momentum * 4);
      const y = Math.round(wave.ridingY(x, face)) + EDGE_STEPS[(pattern + lane) % EDGE_STEPS.length];
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.quadraticCurveTo(x + length * 0.48, y - 2 - lane % 2, x + length, y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawFaceGlints(ctx, wave, p, settings, speedRatio, momentum, presentationClock) {
  const clock = settings.reducedMotion ? 0 : presentationClock;
  ctx.save();
  ctx.globalAlpha = settings.highContrast ? 0.62 : 0.38;
  for (let lane = 0; lane < 6; lane += 1) {
    const face = 0.17 + lane * 0.15;
    for (let segment = 0; segment < 7; segment += 1) {
      const pattern = (segment * 3 + lane * 7) % RIBBON_LENGTHS.length;
      const travel = segment * 71 + lane * 23 + RIBBON_GAPS[pattern] - clock * (0.42 + lane * 0.035);
      const x = Math.round(((travel % 480) + 480) % 480) - 48;
      if (x <= wave.curlX + 28) continue;
      const guide = wave.speedPotential(x, face, { breaking: false });
      const nearSeam = Math.abs(face - powerSeamFaceAt(wave, x)) < 0.1;
      const y = Math.round(wave.ridingY(x, face)) + EDGE_STEPS[(pattern + lane) % EDGE_STEPS.length];
      ctx.fillStyle = nearSeam ? p.crest : lane >= 4 ? p.waterLight : lane % 3 === 0 ? p.foamShade : p.crest;
      const size = 2 + (pattern % 4) + Math.round((speedRatio + guide.potential) * 0.75);
      ctx.fillRect(x, y, size, 1);
      ctx.fillRect(x + Math.max(1, size - 2), y - 1, 2, 1);
      if (momentum > 0.74 && pattern % 4 === 0) ctx.fillRect(x + size + 2, y + 1, 1, 1);
    }
  }
  ctx.restore();
}

function drawPowerSeam(ctx, wave, player, p, settings, presentationClock) {
  const strong = Boolean(settings.highContrast);
  const momentum = clamp(Number(player?.waveMomentum ?? 0), 0, 1);
  const start = Math.max(0, Math.floor(wave.curlX + 49));
  const phase = settings.reducedMotion
    ? 0
    : Math.floor(presentationClock % 31);
  ctx.save();
  ctx.globalAlpha = strong ? 0.76 : 0.3;
  for (let index = 0; index < 12; index += 1) {
    const pattern = (index * 5 + 3) % RIBBON_LENGTHS.length;
    const x = start + index * 36 + EDGE_STEPS[(pattern + index) % EDGE_STEPS.length] * 2 - phase;
    if (x < start || x >= LOGICAL_WIDTH) continue;
    const face = powerSeamFaceAt(wave, x);
    const y = Math.round(wave.ridingY(x, face));
    if (strong) {
      ctx.fillStyle = p.waterDeep;
      ctx.fillRect(x - 1, y - 2, 6, 6);
    }
    ctx.fillStyle = index % 3 === 0 ? p.foam : p.crest;
    ctx.fillRect(x, y - 1, 4 + Math.round(momentum * 2), 2);
    ctx.fillRect(x + 2, y - 3, 2, 1);
    if (momentum > 0.72 && index % 4 === 0) ctx.fillRect(x + 5, y - 4, 2, 2);
  }
  ctx.restore();
}

function drawCurlMass(ctx, simulation, p, time, conditionId, settings, assets) {
  const wave = simulation.wave;
  const player = simulation.player;
  const curl = Math.round(wave.curlX);
  const contactX = curl + 13;
  const crest = Math.round(wave.crestY(curl));
  const pressure = clamp(Number(wave.pressure ?? 0), 0, 1);
  const progression = waveProgressionBlend(wave, player, simulation.tuning?.curlCatchDelay);

  const hasProgression = Boolean(
    assets?.generated?.waveProgression
      && assets?.generatedManifest?.waveProgression,
  );
  // Continuous water mass always remains code-owned and collision-aligned.
  // Generated stages decorate its upper silhouette instead of replacing it.
  drawCodeCurlFallback(
    ctx,
    p,
    settings,
    curl,
    contactX,
    crest,
    pressure,
    hasProgression && !settings.highContrast,
  );
  if (hasProgression && !settings.highContrast) {
    const baseAlpha = conditionId === "twilightGlass" ? 0.78 : conditionId === "stormbreak" ? 0.84 : 0.9;
    const options = { scale: 1, scaleX: 0.94, scaleY: 0.96 };
    const impactStage = progression.to === "impact";
    const overlayDepth = impactStage ? 72 : 92;
    const overlayAnchorY = crest + overlayDepth;
    const fromAlpha = impactStage
      ? baseAlpha * (1 - progression.mix * 0.62)
      : baseAlpha * (1 - progression.mix);
    const toAlpha = impactStage
      ? baseAlpha * progression.mix * 0.34
      : baseAlpha * progression.mix;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-4, -4);
    ctx.lineTo(contactX + 4, -4);
    ctx.lineTo(contactX + 4, crest + overlayDepth * 0.58);
    ctx.bezierCurveTo(
      contactX - 34,
      crest + overlayDepth,
      contactX - 79,
      crest + overlayDepth * 0.72,
      contactX - 118,
      crest + overlayDepth * 0.9,
    );
    ctx.lineTo(-4, crest + overlayDepth);
    ctx.lineTo(-4, -4);
    ctx.closePath();
    ctx.clip();
    drawAtlasFrame(ctx, assets, "waveProgression", progression.from, contactX + 1, overlayAnchorY, {
      ...options,
      alpha: fromAlpha,
    });
    drawAtlasFrame(ctx, assets, "waveProgression", progression.to, contactX + 1, overlayAnchorY, {
      ...options,
      alpha: toAlpha,
    });
    ctx.restore();
  }

  const accent = conditionId === "twilightGlass"
    ? p.violet
    : conditionId === "stormbreak"
      ? p.haze
      : p.crest;
  ctx.save();
  ctx.globalAlpha = settings.highContrast ? 0.9 : 0.56;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(curl - 44, crest + 22);
  ctx.quadraticCurveTo(curl - 19, crest + 7, contactX - 3, crest + 16 + pressure * 8);
  ctx.stroke();
  ctx.restore();

  drawGeneratedCurlAccents(
    ctx,
    wave,
    time,
    settings,
    assets,
    curl,
    contactX,
    crest,
    progression.to === "impact" ? progression.mix : 0,
  );
}

function drawCodeCurlFallback(ctx, p, settings, curl, contactX, crest, pressure, decorated = false) {
  const lipDrop = 17 + Math.round(pressure * 18);
  const shoulderLift = Math.round(pressure * 7);
  const massAlpha = decorated ? 0.82 : 1;
  ctx.save();

  // A single broad shoulder folds back into the already-rendered face. Both
  // masses close locally, so the breaker can never become a pillar to the
  // bottom of the screen or expose a rectangular sprite base.
  ctx.globalAlpha = settings.highContrast ? 1 : 0.96 * massAlpha;
  ctx.fillStyle = p.waterLight;
  ctx.beginPath();
  ctx.moveTo(curl - 126, crest + 52);
  ctx.bezierCurveTo(curl - 107, crest + 30, curl - 84, crest + 11, curl - 61, crest + 16);
  ctx.bezierCurveTo(curl - 39, crest - 4 - shoulderLift, curl - 10, crest - 10, contactX - 4, crest + 3);
  ctx.quadraticCurveTo(contactX, crest + 10, contactX, crest + lipDrop);
  ctx.bezierCurveTo(contactX - 4, crest + lipDrop + 15, curl - 9, crest + 49, curl - 33, crest + 65);
  ctx.bezierCurveTo(curl - 62, crest + 78, curl - 100, crest + 75, curl - 126, crest + 62);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = settings.highContrast ? 0.96 : 0.86 * massAlpha;
  ctx.fillStyle = p.water;
  ctx.beginPath();
  ctx.moveTo(curl - 82, crest + 48);
  ctx.bezierCurveTo(curl - 70, crest + 38, curl - 61, crest + 29, curl - 51, crest + 25);
  ctx.bezierCurveTo(curl - 31, crest + 6, curl - 7, crest + 2, contactX - 7, crest + 13);
  ctx.quadraticCurveTo(contactX - 2, crest + 21, contactX - 3, crest + lipDrop);
  ctx.bezierCurveTo(contactX - 8, crest + 44, curl - 20, crest + 58, curl - 41, crest + 76);
  ctx.bezierCurveTo(curl - 59, crest + 76, curl - 74, crest + 65, curl - 82, crest + 58);
  ctx.closePath();
  ctx.fill();

  // An attached blue wedge supplies depth without enclosing a dark donut.
  ctx.globalAlpha = settings.highContrast ? 0.9 : 0.68 * massAlpha;
  ctx.fillStyle = p.waterDeep;
  ctx.beginPath();
  ctx.moveTo(curl - 24, crest + 19);
  ctx.quadraticCurveTo(contactX - 5, crest + 14, contactX - 4, crest + lipDrop - 1);
  ctx.quadraticCurveTo(curl - 3, crest + 44, curl - 25, crest + 56);
  ctx.lineTo(curl - 12, crest + 38);
  ctx.quadraticCurveTo(curl - 12, crest + 27, curl - 24, crest + 19);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = settings.highContrast ? 1 : decorated ? 0.7 : 0.95;
  ctx.strokeStyle = p.foam;
  ctx.lineWidth = settings.highContrast ? 5 : 4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(curl - 62, crest + 14);
  ctx.bezierCurveTo(curl - 43, crest - 7 - shoulderLift, curl - 14, crest - 10, contactX - 5, crest + 5);
  ctx.quadraticCurveTo(contactX, crest + 12, contactX - 2, crest + lipDrop - 4);
  ctx.quadraticCurveTo(contactX - 5, crest + lipDrop + 2, curl - 7, crest + lipDrop + 8);
  ctx.stroke();

  const churn = decorated ? 2 : 2 + Math.round(pressure * 3);
  ctx.fillStyle = p.foam;
  ctx.globalAlpha = settings.highContrast ? 0.92 : decorated ? 0.42 : 0.68;
  for (let index = 0; index < churn; index += 1) {
    const x = curl - 82 + index * 19;
    const y = crest + 68 + ((index * 7) % 11) + Math.round(pressure * 5);
    ctx.fillRect(x, y, 3, 3);
    ctx.fillRect(x + 3, y - 2, 3, 4);
    ctx.fillRect(x + 6, y + 1, 2, 2);
  }
  ctx.restore();
}

function drawGeneratedCurlAccents(ctx, wave, time, settings, assets, curl, contactX, crest, impactMix) {
  const hasAtlas = Boolean(assets?.generated?.waveBreaker && assets?.generatedManifest?.waveBreaker);
  if (!hasAtlas || settings.highContrast) return;

  const lift = settings.reducedMotion ? 0 : Math.floor((time * 5 + wave.pressure * 7) % 4);
  drawAtlasFrame(ctx, assets, "waveBreaker", "crestFeatherA", curl - 12, crest + 8, {
    scale: 0.27,
    scaleX: 1.14,
    alpha: 0.48,
  });
  if (impactMix > 0.05) {
    drawAtlasFrame(ctx, assets, "waveBreaker", "whitewaterChurn", curl - 38, crest + 72, {
      scale: 0.34,
      scaleX: 1.35,
      alpha: 0.25 + impactMix * 0.38,
    });
    drawAtlasFrame(ctx, assets, "waveBreaker", "impact", contactX - 8, crest + 52 - lift, {
      scale: 0.3,
      alpha: 0.2 + impactMix * 0.34,
    });
  }
  if (!settings.reducedMotion) {
    drawAtlasFrame(ctx, assets, "waveBreaker", "sprayBurst", contactX - 5, crest - 1 - lift, {
      scale: 0.28,
      alpha: 0.38 + impactMix * 0.18,
    });
  }
}

function drawCrestAndLip(ctx, wave, player, p, conditionId, settings, speedRatio, momentum, presentationClock) {
  const phase = settings.reducedMotion ? 0 : Math.floor(presentationClock % 31);
  ctx.fillStyle = p.crest;
  for (let x = 0; x < LOGICAL_WIDTH; x += 2) {
    const y = Math.round(wave.crestY(x));
    const nearCurl = x < wave.curlX + 42;
    const pattern = EDGE_STEPS[(Math.floor(x / 4) + phase) % EDGE_STEPS.length];
    const thickness = nearCurl ? 4 + Math.max(0, pattern) : 2 + Number(pattern > 0);
    ctx.fillRect(x, y - 1, 3, thickness);
  }

  ctx.fillStyle = p.foam;
  for (let index = 0; index < 20; index += 1) {
    const pattern = (index * 7 + 2) % RIBBON_LENGTHS.length;
    const travel = index * 34 + EDGE_STEPS[pattern] * 3 - phase;
    const x = Math.round(((travel % 450) + 450) % 450) - 26;
    if (x < 0 || x >= LOGICAL_WIDTH) continue;
    const y = Math.round(wave.crestY(x));
    const length = 5 + (RIBBON_LENGTHS[pattern] % 9) + Math.round(speedRatio * 3);
    ctx.fillRect(x, y - 3, length, 2);
    ctx.fillRect(x + 2, y - 5 - (pattern % 2), Math.max(2, Math.min(4, length - 3)), 2);
    if (momentum > 0.72 && index % 4 === 0) ctx.fillRect(x + length - 2, y - 7, 2, 2);
    if (conditionId === "stormbreak" && index % 3 === 0) ctx.fillRect(x + 1, y - 9, 1, 3);
  }

  if (Number(player?.waveMomentum ?? 0) >= 0.9) {
    ctx.fillStyle = p.gold;
    for (let index = 0; index < 6; index += 1) {
      const x = 104 + index * 49 + waveGoldGlintOffset(presentationClock, index);
      const y = Math.round(wave.crestY(x)) - 8 - (index % 2) * 2;
      ctx.fillRect(x, y, 3, 1);
      ctx.fillRect(x + 1, y - 1, 1, 3);
    }
  }
}

function drawWaveReadAssist(ctx, wave, player, board, p, settings, time) {
  if (!settings.highContrast || String(settings.waveReadAssist ?? "full").toLowerCase() !== "full") return;
  if (!player || player.state === "airborne" || player.state === "wipeout" || player.state === "complete") return;
  const guide = player.speedPotential ?? waveGuideAt(wave, player, board);
  const x = clamp(Math.round(player.x + (player.x > 310 ? -30 : 29)), 24, LOGICAL_WIDTH - 24);
  const seamFace = powerSeamFaceAt(wave, player.x);
  const seamY = Math.round(wave.ridingY(player.x, seamFace));
  const y = clamp(seamY, 91, 172);
  const pulse = settings.reducedMotion ? 0 : Math.round(Math.sin(time * 8));
  const color = guide.zone === "power" ? p.gold : p.foam;
  ctx.fillStyle = p.ink;
  ctx.fillRect(x - 2, y - 5, 5, 11);
  ctx.fillStyle = color;
  ctx.fillRect(x - 1, y - 4, 3, 9);
  if (guide.correction > 0) {
    ctx.fillRect(x - 4, y + 2 + pulse, 9, 2);
    ctx.fillRect(x - 2, y + 4 + pulse, 5, 2);
  } else if (guide.correction < 0) {
    ctx.fillRect(x - 4, y - 4 + pulse, 9, 2);
    ctx.fillRect(x - 2, y - 6 + pulse, 5, 2);
  } else {
    ctx.fillRect(x - 4, y - 1, 9, 3);
    ctx.fillStyle = p.foam;
    ctx.fillRect(x, y - 4, 1, 9);
  }
}

function mixTone(light, accent, conditionId) {
  return conditionId === "twilightGlass" ? accent : light;
}

function publishedSpeedCap(simulation) {
  const published = Number(simulation?.currentRideSpeedCap?.());
  if (Number.isFinite(published) && published > 0) return published;
  const tuningMax = Number(simulation?.tuning?.maxSpeed ?? 138);
  const boardMax = Number(simulation?.board?.maxSpeed ?? 1);
  return Math.max(1, tuningMax * boardMax);
}
