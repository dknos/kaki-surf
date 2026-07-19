import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./config.js";
import { clamp } from "./math.js";
import { drawAtlasFrame } from "./asset-drawing.js";

const EDGE_STEPS = Object.freeze([0, 1, 0, -1, 0, 2, 1, 0, -2, -1, 1, 0, 2, 0, -1, 0, 1, -2, 0, 1, 0, -1, 2, 1]);
const RIBBON_LENGTHS = Object.freeze([8, 15, 5, 22, 11, 18, 7, 26, 13, 9, 20, 6, 17, 12, 24, 10]);
const RIBBON_GAPS = Object.freeze([13, 7, 19, 11, 5, 17, 9, 21, 8, 15, 6, 18, 10, 23, 12, 7]);

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

export function drawLayeredWave(ctx, simulation, palette, settings, time, conditionId, assets = null) {
  const wave = simulation.wave;
  const player = simulation.player;
  const speedCap = publishedSpeedCap(simulation);
  const speedRatio = clamp(Number(player?.speed ?? 0) / speedCap, 0, 1);
  const momentum = clamp(Number(player?.waveMomentum ?? 0), 0, 1);
  traceWaveFace(ctx, wave, 0, 1.36);
  ctx.fillStyle = palette.waterDeep;
  ctx.fill();

  drawRampBand(ctx, wave, 0.015, 0.78, palette.water);
  drawRampBand(ctx, wave, 0.015, 0.43, palette.waterLight);
  drawRampBand(ctx, wave, 0.01, 0.17, mixTone(palette.waterLight, palette.crest, conditionId));
  drawSwellContours(ctx, wave, palette, settings, speedRatio, momentum);
  drawFaceGlints(ctx, wave, palette, settings, speedRatio, momentum);
  drawPowerSeam(ctx, wave, player, palette, settings);
  drawCurlMass(ctx, wave, palette, time, conditionId, settings, assets);
  drawCrestAndLip(ctx, wave, player, palette, conditionId, settings, speedRatio, momentum);
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

function drawSwellContours(ctx, wave, p, settings, speedRatio, momentum) {
  const clock = settings.reducedMotion
    ? 0
    : waveSurfaceTravel(wave) * (0.035 + speedRatio * 0.028);
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

function drawFaceGlints(ctx, wave, p, settings, speedRatio, momentum) {
  const clock = settings.reducedMotion
    ? 0
    : waveSurfaceTravel(wave) * (0.075 + speedRatio * 0.065);
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

function drawPowerSeam(ctx, wave, player, p, settings) {
  const strong = Boolean(settings.highContrast);
  const momentum = clamp(Number(player?.waveMomentum ?? 0), 0, 1);
  const start = Math.max(0, Math.floor(wave.curlX + 49));
  const phase = settings.reducedMotion
    ? 0
    : Math.floor((waveSurfaceTravel(wave) * (0.22 + momentum * 0.16)) % 31);
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

function drawCurlMass(ctx, wave, p, time, conditionId, settings, assets) {
  const curl = Math.round(wave.curlX);
  const crest = Math.round(wave.crestY(curl));
  const pulse = settings.reducedMotion ? 0 : EDGE_STEPS[Math.floor(time * 7) % EDGE_STEPS.length];
  const fold = Math.round(clamp(Number(wave.pressure ?? 0), 0, 1) * 4);

  // A broad water-colored shoulder and compact shaded pocket read as a folding
  // breaker. The old near-black ring made the curl look like a hole.
  ctx.save();
  ctx.globalAlpha = settings.highContrast ? 1 : 0.96;
  ctx.fillStyle = p.waterLight;
  ctx.beginPath();
  ctx.moveTo(curl - 78, LOGICAL_HEIGHT);
  ctx.bezierCurveTo(curl - 75, crest + 116, curl - 67, crest + 44, curl - 47, crest + 17);
  ctx.bezierCurveTo(curl - 34, crest - 1, curl - 8, crest - 8, curl + 15, crest + 1);
  ctx.bezierCurveTo(curl + 34, crest + 7, curl + 45 + fold + pulse, crest + 20, curl + 44 + fold, crest + 34);
  ctx.bezierCurveTo(curl + 43, crest + 49, curl + 26, crest + 61, curl + 14, crest + 75);
  ctx.bezierCurveTo(curl - 3, crest + 94, curl - 7, crest + 121, curl - 5, LOGICAL_HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = settings.highContrast ? 0.94 : 0.88;
  ctx.fillStyle = p.water;
  ctx.beginPath();
  ctx.moveTo(curl - 66, LOGICAL_HEIGHT);
  ctx.bezierCurveTo(curl - 62, crest + 107, curl - 57, crest + 48, curl - 39, crest + 25);
  ctx.bezierCurveTo(curl - 23, crest + 5, curl + 2, crest + 1, curl + 23, crest + 11);
  ctx.bezierCurveTo(curl + 38, crest + 19, curl + 40 + fold, crest + 31, curl + 34, crest + 41);
  ctx.bezierCurveTo(curl + 25, crest + 55, curl + 8, crest + 67, curl - 1, crest + 88);
  ctx.bezierCurveTo(curl - 13, crest + 116, curl - 19, crest + 133, curl - 17, LOGICAL_HEIGHT);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = settings.highContrast ? 0.78 : 0.46;
  ctx.strokeStyle = p.waterLight;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(curl - 52, LOGICAL_HEIGHT);
  ctx.bezierCurveTo(curl - 50, crest + 102, curl - 43, crest + 48, curl - 27, crest + 28);
  ctx.bezierCurveTo(curl - 13, crest + 11, curl + 4, crest + 8, curl + 18, crest + 14);
  ctx.stroke();

  // The barrel shadow is deliberately small and blue, never a black donut.
  ctx.globalAlpha = settings.highContrast ? 0.94 : 0.82;
  ctx.fillStyle = p.waterDeep;
  ctx.beginPath();
  ctx.moveTo(curl + 4, crest + 16);
  ctx.bezierCurveTo(curl + 18, crest + 10, curl + 33 + fold, crest + 18, curl + 34 + fold, crest + 30);
  ctx.bezierCurveTo(curl + 35, crest + 42, curl + 23, crest + 51, curl + 12, crest + 58);
  ctx.bezierCurveTo(curl + 20, crest + 46, curl + 20, crest + 33, curl + 13, crest + 27);
  ctx.bezierCurveTo(curl + 7, crest + 22, curl + 1, crest + 23, curl - 5, crest + 29);
  ctx.bezierCurveTo(curl - 2, crest + 22, curl, crest + 18, curl + 4, crest + 16);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = settings.highContrast ? 1 : 0.94;
  ctx.lineCap = "round";
  ctx.strokeStyle = p.foam;
  ctx.lineWidth = settings.highContrast ? 5 : 4;
  ctx.beginPath();
  ctx.moveTo(curl - 49, crest + 14);
  ctx.bezierCurveTo(curl - 31, crest - 5, curl - 4, crest - 8, curl + 18, crest + 2);
  ctx.bezierCurveTo(curl + 34, crest + 9, curl + 41 + fold, crest + 19, curl + 40 + fold + pulse, crest + 31);
  ctx.stroke();

  ctx.globalAlpha = settings.highContrast ? 0.9 : 0.72;
  ctx.strokeStyle = p.crest;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(curl - 40, crest + 29);
  ctx.bezierCurveTo(curl - 25, crest + 10, curl - 4, crest + 7, curl + 12, crest + 14);
  ctx.stroke();

  ctx.globalAlpha = settings.highContrast ? 0.92 : 0.62;
  ctx.strokeStyle = p.foamShade;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(curl - 61, crest + 65);
  ctx.bezierCurveTo(curl - 52, crest + 58, curl - 43, crest + 58, curl - 35, crest + 65);
  ctx.stroke();
  ctx.restore();

  if (conditionId === "twilightGlass") {
    ctx.strokeStyle = p.violet;
  } else if (conditionId === "stormbreak") {
    ctx.strokeStyle = p.haze;
  } else {
    ctx.strokeStyle = p.crest;
  }
  ctx.save();
  ctx.globalAlpha = 0.56;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(curl - 36, crest + 22);
  ctx.quadraticCurveTo(curl - 18, crest + 10, curl + 2, crest + 15);
  ctx.stroke();
  ctx.restore();

  drawGeneratedCurlAccents(ctx, wave, time, settings, assets, curl, crest, pulse);
}

function drawGeneratedCurlAccents(ctx, wave, time, settings, assets, curl, crest, pulse) {
  const hasAtlas = Boolean(assets?.generated?.waveBreaker && assets?.generatedManifest?.waveBreaker);
  if (!hasAtlas || settings.highContrast) return;

  const phase = settings.reducedMotion ? 0 : Math.floor((time * 5 + wave.pressure * 7) % 4);
  drawAtlasFrame(ctx, assets, "waveBreaker", "crestFeatherA", curl - 10 + pulse, crest + 8, {
    scale: 0.27,
    scaleX: 1.14,
    alpha: 0.5,
  });
  if (!settings.reducedMotion) {
    drawAtlasFrame(ctx, assets, "waveBreaker", "sprayBurst", curl + 4, crest - 1 - phase, {
      scale: 0.28,
      alpha: 0.4,
    });
  }
}

function drawCrestAndLip(ctx, wave, player, p, conditionId, settings, speedRatio, momentum) {
  const phase = settings.reducedMotion
    ? 0
    : Math.floor((waveSurfaceTravel(wave) * 0.14) % 31);
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
      const x = 104 + index * 49 + ((phase + index * 7) % 13);
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
