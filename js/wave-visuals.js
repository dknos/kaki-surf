import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./config.js";
import { clamp } from "./math.js";
import { drawAtlasFrame } from "./asset-drawing.js";

const EDGE_STEPS = Object.freeze([0, 1, 0, -1, 0, 2, 1, 0, -2, -1, 1, 0, 2, 0, -1, 0, 1, -2, 0, 1, 0, -1, 2, 1]);
const RIBBON_LENGTHS = Object.freeze([8, 15, 5, 22, 11, 18, 7, 26, 13, 9, 20, 6, 17, 12, 24, 10]);
const RIBBON_GAPS = Object.freeze([13, 7, 19, 11, 5, 17, 9, 21, 8, 15, 6, 18, 10, 23, 12, 7]);
const CURL_WHITEWATER = Object.freeze([
  [-72, 7, 28, 3], [-55, 13, 35, 4], [-82, 20, 24, 3], [-64, 27, 42, 4],
  [-89, 36, 31, 4], [-69, 45, 48, 5], [-94, 57, 37, 4], [-76, 68, 55, 5],
  [-101, 82, 42, 5], [-81, 94, 59, 5], [-105, 108, 51, 6], [-84, 123, 63, 6],
]);
const CURL_FINGERS = Object.freeze([
  [-30, 8, 17, 3], [-25, 18, 11, 3], [-31, 30, 19, 4], [-22, 44, 12, 3],
  [-29, 57, 16, 4], [-20, 72, 10, 3], [-27, 88, 15, 4], [-18, 105, 9, 3],
]);

/** Pure bridge used by renderer tests to prove the visual seam is canonical. */
export function powerSeamFaceAt(wave, x) {
  return wave.powerFaceAt(x);
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

  drawRampBand(ctx, wave, 0.015, 0.78, palette.water, 5);
  drawRampBand(ctx, wave, 0.015, 0.43, palette.waterLight, 13);
  drawRampBand(ctx, wave, 0.01, 0.17, mixTone(palette.waterLight, palette.crest, conditionId), 19);
  drawDeepSwellMasses(ctx, wave, palette, time, settings, speedRatio, momentum);
  drawCurrentRibbons(ctx, wave, palette, time, settings, speedRatio, momentum);
  drawPowerSeam(ctx, wave, player, palette, time, settings);
  drawCurlMass(ctx, wave, palette, time, conditionId, settings, assets);
  drawCrestAndLip(ctx, wave, player, palette, time, conditionId, settings, speedRatio, momentum);
  drawWaveReadAssist(ctx, wave, player, simulation.board, palette, settings, time);
}

function traceWaveFace(ctx, wave, topFace, bottomFace, start = 0, end = LOGICAL_WIDTH) {
  ctx.beginPath();
  ctx.moveTo(start, Math.round(wave.ridingY(start, topFace)));
  for (let x = start; x <= end; x += 4) ctx.lineTo(x, Math.round(wave.ridingY(x, topFace)));
  for (let x = end; x >= start; x -= 4) ctx.lineTo(x, Math.round(wave.ridingY(x, bottomFace)));
  ctx.closePath();
}

function traceIrregularWaveFace(ctx, wave, topFace, bottomFace, seed) {
  ctx.beginPath();
  for (let x = 0; x <= LOGICAL_WIDTH; x += 2) {
    const index = (Math.floor(x / 4) + seed) % EDGE_STEPS.length;
    const face = clamp(topFace + EDGE_STEPS[index] * 0.0045, 0, 1.36);
    const y = Math.round(wave.ridingY(x, face));
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  for (let x = LOGICAL_WIDTH; x >= 0; x -= 2) {
    const index = (Math.floor(x / 5) + seed * 3 + 7) % EDGE_STEPS.length;
    const face = clamp(bottomFace + EDGE_STEPS[index] * 0.007, 0, 1.36);
    ctx.lineTo(x, Math.round(wave.ridingY(x, face)));
  }
  ctx.closePath();
}

function drawRampBand(ctx, wave, top, bottom, color, seed) {
  traceIrregularWaveFace(ctx, wave, top, bottom, seed);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawDeepSwellMasses(ctx, wave, p, time, settings, speedRatio, momentum) {
  const clock = settings.reducedMotion ? 0 : wave.travel * (0.05 + speedRatio * 0.045) + time * momentum * 8;
  ctx.save();
  ctx.globalAlpha = settings.highContrast ? 0.42 : 0.3;
  for (let lane = 0; lane < 5; lane += 1) {
    const face = 0.55 + lane * 0.145;
    for (let segment = 0; segment < 8; segment += 1) {
      const pattern = (segment + lane * 5) % RIBBON_LENGTHS.length;
      const travel = segment * 67 + lane * 29 + RIBBON_GAPS[pattern] - clock * (0.24 + lane * 0.035);
      const x = Math.round(((travel % 520) + 520) % 520) - 72;
      if (x <= wave.curlX + 12) continue;
      const length = 28 + RIBBON_LENGTHS[pattern] + Math.round(momentum * 12);
      const y = Math.round(wave.ridingY(x, face)) + EDGE_STEPS[(pattern + lane) % EDGE_STEPS.length];
      ctx.fillStyle = lane % 2 === 0 ? p.deepInk : p.waterDeep;
      ctx.fillRect(x, y, length, 3);
      ctx.fillRect(x + 9, y + 3, Math.max(7, length - 19), 2);
    }
  }
  ctx.restore();
}

function drawCurrentRibbons(ctx, wave, p, time, settings, speedRatio, momentum) {
  const clock = settings.reducedMotion ? 0 : wave.travel * (0.11 + speedRatio * 0.14) + time * (5 + momentum * 16);
  for (let lane = 0; lane < 9; lane += 1) {
    const face = 0.14 + lane * 0.105;
    for (let segment = 0; segment < 12; segment += 1) {
      const pattern = (segment * 3 + lane * 7) % RIBBON_LENGTHS.length;
      const travel = segment * 43 + lane * 17 + RIBBON_GAPS[pattern] - clock * (0.55 + lane * 0.035);
      const x = Math.round(((travel % 470) + 470) % 470) - 43;
      if (x <= wave.curlX + 24) continue;
      const guide = wave.speedPotential(x, face, { breaking: false });
      const nearSeam = Math.abs(face - powerSeamFaceAt(wave, x)) < 0.1;
      const length = RIBBON_LENGTHS[pattern] + Math.round(speedRatio * 6 + guide.potential * 5);
      const y = Math.round(wave.ridingY(x, face)) + EDGE_STEPS[(pattern + lane) % EDGE_STEPS.length];
      ctx.fillStyle = nearSeam ? p.crest : lane > 5 ? p.waterLight : lane % 3 === 0 ? p.foamShade : p.crest;
      ctx.fillRect(x, y, length, 1);
      if (length > 13) ctx.fillRect(x + 4, y + 2, Math.max(3, length - 10), 1);
      if (guide.potential > 0.78 && pattern % 4 === 0) ctx.fillRect(x + length - 2, y - 1, 2, 1);
    }
  }
}

function drawPowerSeam(ctx, wave, player, p, time, settings) {
  const strong = Boolean(settings.highContrast);
  const momentum = clamp(Number(player?.waveMomentum ?? 0), 0, 1);
  const start = Math.max(0, Math.floor(wave.curlX + 49));
  const phase = settings.reducedMotion ? 0 : Math.floor((wave.travel * 0.4 + time * (13 + momentum * 20)) % 19);
  for (let index = 0; index < 18; index += 1) {
    const pattern = (index * 5 + 3) % RIBBON_LENGTHS.length;
    const x = start + index * 27 + EDGE_STEPS[(pattern + index) % EDGE_STEPS.length] * 2 - phase;
    if (x < start || x >= LOGICAL_WIDTH) continue;
    const face = powerSeamFaceAt(wave, x);
    const y = Math.round(wave.ridingY(x, face));
    const length = 4 + (RIBBON_LENGTHS[pattern] % 7) + Math.round(momentum * 4);
    if (strong) {
      ctx.fillStyle = p.waterDeep;
      ctx.fillRect(x - 1, y + 1, length + 2, 1);
    }
    ctx.globalAlpha = strong ? 0.78 : 0.34;
    ctx.fillStyle = index % 3 === 0 ? p.foam : p.crest;
    ctx.fillRect(x, y, length, 1);
    ctx.fillRect(x + 2, y - 1, Math.max(2, length - 5), 1);
    if (momentum > 0.72 && index % 5 === 0) ctx.fillRect(x + length - 2, y - 3, 2, 2);
  }
  ctx.globalAlpha = 1;
}

function drawCurlMass(ctx, wave, p, time, conditionId, settings, assets) {
  const curl = Math.round(wave.curlX);
  const crest = Math.round(wave.crestY(curl));
  const pulse = settings.reducedMotion ? 0 : EDGE_STEPS[Math.floor(time * 7) % EDGE_STEPS.length];

  if (drawGeneratedCurl(ctx, wave, p, time, settings, assets, curl, crest, pulse)) return;

  // Connected foam islands create mass without the old horizontal barcode.
  ctx.fillStyle = p.foamShade;
  for (let index = 0; index < CURL_WHITEWATER.length; index += 1) {
    const cluster = CURL_WHITEWATER[index];
    const x = curl + cluster[0] + (index % 3 === 0 ? pulse : 0);
    const y = crest + cluster[1];
    ctx.fillRect(x, y, cluster[2], cluster[3]);
    ctx.fillRect(x + 5, y - 2, Math.max(4, cluster[2] - 13), 2);
    if (index % 3 === 1) {
      ctx.fillStyle = p.foam;
      ctx.fillRect(x + 2, y, Math.max(5, cluster[2] - 9), 2);
      ctx.fillStyle = p.foamShade;
    }
  }

  // A glassy folding face surrounds a smaller, readable tube shadow.
  ctx.save();
  ctx.globalAlpha = settings.highContrast ? 1 : 0.86;
  ctx.fillStyle = p.waterDeep;
  ctx.beginPath();
  ctx.moveTo(curl - 35, crest + 1);
  ctx.lineTo(curl + 10, crest + 2);
  ctx.lineTo(curl + 25 + pulse, crest + 19);
  ctx.lineTo(curl + 20, crest + 44);
  ctx.lineTo(curl + 7, crest + 70);
  ctx.lineTo(curl - 13, crest + 92);
  ctx.lineTo(curl - 37, LOGICAL_HEIGHT - 5);
  ctx.lineTo(curl - 51, LOGICAL_HEIGHT - 5);
  ctx.lineTo(curl - 36, crest + 75);
  ctx.lineTo(curl - 28, crest + 36);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = settings.highContrast ? 0.82 : 0.55;
  ctx.fillStyle = p.waterLight;
  ctx.beginPath();
  ctx.moveTo(curl - 27, crest + 3);
  ctx.lineTo(curl + 8, crest + 4);
  ctx.lineTo(curl + 18 + pulse, crest + 20);
  ctx.lineTo(curl + 9, crest + 43);
  ctx.lineTo(curl - 10, crest + 62);
  ctx.lineTo(curl - 26, crest + 61);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = settings.highContrast ? 1 : 0.82;
  ctx.fillStyle = p.deepInk;
  ctx.beginPath();
  ctx.moveTo(curl - 9, crest + 9);
  ctx.lineTo(curl + 7, crest + 10);
  ctx.lineTo(curl + 14 + pulse, crest + 23);
  ctx.lineTo(curl + 7, crest + 45);
  ctx.lineTo(curl - 7, crest + 63);
  ctx.lineTo(curl - 19, crest + 72);
  ctx.lineTo(curl - 24, crest + 61);
  ctx.lineTo(curl - 14, crest + 35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  if (conditionId === "twilightGlass") {
    ctx.fillStyle = p.violet;
    ctx.fillRect(curl - 24, crest + 8, 25, 2);
  } else if (conditionId === "stormbreak") {
    ctx.fillStyle = p.haze;
    ctx.fillRect(curl - 27, crest + 6, 19, 2);
  }

  // Inward hooks and light beads communicate the critical pocket by shape.
  for (let index = 0; index < CURL_FINGERS.length; index += 1) {
    const finger = CURL_FINGERS[index];
    const x = curl + finger[0] + (index % 2 === 0 ? pulse : 0);
    const y = crest + finger[1];
    ctx.fillStyle = index % 3 === 0 ? p.foam : p.foamShade;
    ctx.fillRect(x, y, finger[2], finger[3]);
    ctx.fillRect(x + finger[2] - 4, y + finger[3], 4, 2);
  }

  ctx.fillStyle = p.crest;
  ctx.fillRect(curl - 5, crest + 17, 8, 1);
  ctx.fillRect(curl - 10, crest + 34, 6, 1);
  ctx.fillRect(curl - 15, crest + 51, 5, 1);
}

function drawGeneratedCurl(ctx, wave, p, time, settings, assets, curl, crest, pulse) {
  const hasAtlas = Boolean(assets?.generated?.waveBreaker && assets?.generatedManifest?.waveBreaker);
  if (!hasAtlas) return false;

  // Simulation geometry still owns the danger boundary; generated modular
  // water pieces supply the readable feather, fold, impact, and recovery.
  ctx.save();
  ctx.globalAlpha = settings.highContrast ? 0.92 : 0.74;
  ctx.fillStyle = p.waterDeep;
  ctx.beginPath();
  ctx.moveTo(curl - 39, crest + 3);
  ctx.bezierCurveTo(curl + 30, crest - 5, curl + 34, crest + 29, curl + 9, crest + 56);
  ctx.bezierCurveTo(curl - 15, crest + 81, curl - 31, crest + 112, curl - 43, LOGICAL_HEIGHT);
  ctx.lineTo(curl - 78, LOGICAL_HEIGHT);
  ctx.bezierCurveTo(curl - 55, crest + 105, curl - 48, crest + 38, curl - 39, crest + 3);
  ctx.fill();
  ctx.restore();

  const phase = settings.reducedMotion ? 0 : Math.floor((time * 5 + wave.pressure * 7) % 4);
  drawAtlasFrame(ctx, assets, "waveBreaker", phase < 2 ? "crestFeatherA" : "crestFeatherB", curl - 5 + pulse, crest - 5, {
    scale: 0.82,
    scaleX: 1.14,
    alpha: 0.94,
  });
  drawAtlasFrame(ctx, assets, "waveBreaker", "risingCurl", curl - 3, crest + 23, {
    scale: 1.05,
    scaleX: 1.12,
    scaleY: 1.22,
  });
  drawAtlasFrame(ctx, assets, "waveBreaker", "impact", curl - 29 - pulse, crest + 70, {
    scale: 1.08,
    scaleX: 1.12,
  });
  drawAtlasFrame(ctx, assets, "waveBreaker", "whitewaterChurn", curl - 35, crest + 112, {
    scale: 1.14,
    scaleX: 1.22,
  });
  drawAtlasFrame(ctx, assets, "waveBreaker", "foamTendrils", curl + 12 + pulse, crest + 91, {
    scale: 0.86,
    scaleY: 1.18,
    alpha: 0.9,
  });
  if (!settings.reducedMotion) {
    drawAtlasFrame(ctx, assets, "waveBreaker", "sprayBurst", curl + 8, crest + 4 - phase * 2, {
      scale: 0.72,
      alpha: 0.72,
    });
    drawAtlasFrame(ctx, assets, "waveBreaker", "seaMist", curl + 22, crest + 49 + pulse, {
      scale: 0.86,
      scaleX: 1.2,
      alpha: 0.42,
    });
  }
  return true;
}

function drawCrestAndLip(ctx, wave, player, p, time, conditionId, settings, speedRatio, momentum) {
  const phase = settings.reducedMotion ? 0 : Math.floor((time * 9 + wave.travel * 0.12) % 31);
  ctx.fillStyle = p.crest;
  for (let x = 0; x < LOGICAL_WIDTH; x += 2) {
    const y = Math.round(wave.crestY(x));
    const nearCurl = x < wave.curlX + 42;
    const pattern = EDGE_STEPS[(Math.floor(x / 4) + phase) % EDGE_STEPS.length];
    const thickness = nearCurl ? 4 + Math.max(0, pattern) : 2 + Number(pattern > 0);
    ctx.fillRect(x, y - 1, 3, thickness);
  }

  ctx.fillStyle = p.foam;
  for (let index = 0; index < 30; index += 1) {
    const pattern = (index * 7 + 2) % RIBBON_LENGTHS.length;
    const travel = index * 23 + EDGE_STEPS[pattern] * 3 - phase;
    const x = Math.round(((travel % 430) + 430) % 430) - 22;
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
