import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from "./config.js";
import { clamp, smoothstep } from "./math.js";
import { drawPixelText } from "./pixel-font.js";

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

export function drawLayeredWave(ctx, simulation, palette, settings, time, conditionId) {
  const wave = simulation.wave;
  const player = simulation.player;
  traceWaveFace(ctx, wave, 0, 1.36);
  ctx.fillStyle = palette.water;
  ctx.fill();

  drawFaceBand(ctx, wave, 0.04, 0.2, mixTone(palette.waterLight, palette.crest, conditionId));
  drawFaceBand(ctx, wave, 0.2, 0.43, palette.waterLight);
  drawFaceBand(ctx, wave, 0.43, 0.72, palette.water);
  drawFaceBand(ctx, wave, 0.72, 1.36, palette.waterDeep);
  drawDepthDither(ctx, wave, palette, time, conditionId);
  drawSafeShoulder(ctx, wave, palette, time);
  drawDirectionalStreaks(ctx, wave, palette, time, settings.reducedMotion);
  drawPowerSeam(ctx, wave, palette, time, settings);
  drawCurlMass(ctx, wave, palette, time, conditionId, settings.reducedMotion);
  drawCrestAndLip(ctx, wave, palette, time, conditionId, settings.reducedMotion);
  drawWaveReadAssist(ctx, wave, player, simulation.board, palette, settings, time);
}

function traceWaveFace(ctx, wave, topFace, bottomFace, start = 0, end = LOGICAL_WIDTH) {
  ctx.beginPath();
  ctx.moveTo(start, Math.round(wave.ridingY(start, topFace)));
  for (let x = start; x <= end; x += 4) ctx.lineTo(x, Math.round(wave.ridingY(x, topFace)));
  for (let x = end; x >= start; x -= 4) ctx.lineTo(x, Math.round(wave.ridingY(x, bottomFace)));
  ctx.closePath();
}

function drawFaceBand(ctx, wave, top, bottom, color) {
  traceWaveFace(ctx, wave, top, bottom);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawDepthDither(ctx, wave, p, time, conditionId) {
  const phase = Math.floor(time * 6);
  const colors = conditionId === "twilightGlass"
    ? [p.violet, p.waterDeep]
    : conditionId === "stormbreak"
      ? [p.haze, p.deepInk]
      : [p.crest, p.waterDeep];
  for (let row = 0; row < 8; row += 1) {
    const face = 0.19 + row * 0.105;
    ctx.fillStyle = colors[row & 1];
    for (let x = ((row * 13 + phase) % 17) - 17; x < LOGICAL_WIDTH; x += 17) {
      if (x <= wave.curlX + 18) continue;
      const y = Math.round(wave.ridingY(x, face));
      const size = row > 4 ? 2 : 1;
      ctx.fillRect(x, y + ((x + row) & 1), size, 1);
    }
  }
}

function drawSafeShoulder(ctx, wave, p, time) {
  const start = Math.max(190, Math.round(wave.curlX + 142));
  const drift = Math.floor((wave.travel * 0.08 + time * 3) % 38);
  ctx.fillStyle = p.waterLight;
  for (let row = 0; row < 5; row += 1) {
    const face = 0.24 + row * 0.13;
    for (let x = start - drift + row * 9; x < LOGICAL_WIDTH; x += 44) {
      ctx.fillRect(x, Math.round(wave.ridingY(x, face)), 13 + (row & 1) * 5, 1);
    }
  }
}

function drawDirectionalStreaks(ctx, wave, p, time, reducedMotion) {
  const clock = reducedMotion ? 0 : time;
  for (let row = 0; row < 7; row += 1) {
    const baseFace = 0.16 + row * 0.105;
    for (let column = 0; column < 11; column += 1) {
      const sampleX = wave.curlX + 27 + column * 34;
      if (sampleX >= LOGICAL_WIDTH + 22) continue;
      const seam = powerSeamFaceAt(wave, sampleX);
      const guide = wave.speedPotential(sampleX, baseFace, { breaking: false });
      const drift = Math.floor((wave.travel * (0.06 + guide.potential * 0.18) + clock * guide.potential * 20 + row * 11) % 31);
      const x = Math.round(sampleX + drift - 15);
      const y = Math.round(wave.ridingY(x, baseFace));
      const length = 2 + Math.round(guide.potential * 9);
      ctx.fillStyle = Math.abs(baseFace - seam) < 0.12 ? p.crest : p.waterLight;
      ctx.fillRect(x, y, length, 1);
      if (guide.potential > 0.72 && (column + row) % 3 === 0) ctx.fillRect(x + length - 2, y + 2, 2, 1);
    }
  }
}

function drawPowerSeam(ctx, wave, p, time, settings) {
  const assist = String(settings.waveReadAssist ?? "full").toLowerCase();
  const strong = settings.highContrast || assist === "full";
  const phase = Math.floor((wave.travel * 0.28 + (settings.reducedMotion ? 0 : time * 22)) % 23);
  for (let x = Math.max(0, Math.floor(wave.curlX + 18)); x < LOGICAL_WIDTH; x += 3) {
    const face = powerSeamFaceAt(wave, x);
    const y = Math.round(wave.ridingY(x, face));
    const bead = (x + phase) % 23;
    ctx.fillStyle = bead < 8 ? p.gold : p.crest;
    ctx.fillRect(x, y, strong && bead < 5 ? 4 : 3, strong && bead < 3 ? 2 : 1);
    if (bead === 0 || bead === 1) {
      ctx.fillStyle = p.foam;
      ctx.fillRect(x + 1, y - 2, 1, 1);
    }
  }
}

function drawCurlMass(ctx, wave, p, time, conditionId, reducedMotion) {
  const curl = Math.round(wave.curlX);
  const pulse = reducedMotion ? 0 : Math.round(Math.sin(time * 5.7) * 2);

  // Whitewater behind the breaking wall.
  ctx.fillStyle = p.foamShade;
  for (let y = 82; y < LOGICAL_HEIGHT; y += 5) {
    const width = 34 + Math.floor((y - 82) * 0.22);
    ctx.fillRect(curl - width - 24 + ((y + pulse) % 7), y, width, 3);
  }
  ctx.fillStyle = p.foam;
  for (let y = 85; y < LOGICAL_HEIGHT; y += 9) {
    ctx.fillRect(curl - 53 + ((y * 3 + pulse) % 14), y, 25 + (y % 13), 2);
  }

  // Tube shadow, folding face, and thick critical edge.
  ctx.fillStyle = p.deepInk;
  ctx.beginPath();
  ctx.moveTo(curl - 28, Math.round(wave.crestY(curl - 28)));
  ctx.lineTo(curl + 12, Math.round(wave.crestY(curl + 12)));
  ctx.lineTo(curl + 24 + pulse, 94);
  ctx.lineTo(curl + 16, 130);
  ctx.lineTo(curl - 10, 158);
  ctx.lineTo(curl - 33, 184);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.waterDeep;
  ctx.beginPath();
  ctx.moveTo(curl - 20, 80);
  ctx.lineTo(curl + 5, 79);
  ctx.lineTo(curl + 14 + pulse, 93);
  ctx.lineTo(curl + 5, 119);
  ctx.lineTo(curl - 15, 138);
  ctx.lineTo(curl - 28, 137);
  ctx.closePath();
  ctx.fill();
  if (conditionId === "twilightGlass") {
    ctx.fillStyle = p.violet;
    ctx.fillRect(curl - 16, 84, 20, 2);
  }

  // Falling foam and inward-reaching fingers distinguish danger from speed.
  for (let y = 79; y < 188; y += 6) {
    const inward = Math.round(Math.sin(y * 0.21 + time * (reducedMotion ? 0 : 5)) * 3);
    const length = 8 + ((y / 6) % 3) * 3;
    ctx.fillStyle = y % 18 === 0 ? p.foam : p.foamShade;
    ctx.fillRect(curl - 29 + inward, y, length, 3);
    if (y > 97) ctx.fillRect(curl - 14 + inward, y + 3, 7 + (y % 11), 2);
  }
  ctx.fillStyle = p.danger;
  for (let y = 94; y < 178; y += 13) ctx.fillRect(curl + 17 + (y % 2), y, 2, 4);
}

function drawCrestAndLip(ctx, wave, p, time, conditionId, reducedMotion) {
  const phase = reducedMotion ? 0 : Math.floor(time * 13);
  ctx.fillStyle = p.crest;
  for (let x = 0; x < LOGICAL_WIDTH; x += 3) {
    const y = Math.round(wave.crestY(x));
    const nearCurl = x < wave.curlX + 36;
    const thickness = nearCurl ? 5 : 2 + ((x + phase) % 17 < 5 ? 2 : 0);
    ctx.fillRect(x, y - 1, 4, thickness);
  }
  ctx.fillStyle = p.foam;
  for (let x = 1; x < LOGICAL_WIDTH; x += 9) {
    const y = Math.round(wave.crestY(x));
    const feather = (x + phase) % 27;
    ctx.fillRect(x, y - 3, 6 + (x % 4), 2);
    if (feather < 9) {
      ctx.fillRect(x + 1, y - 6 - (feather % 2), 2, 3);
      if (conditionId === "stormbreak") ctx.fillRect(x + 4, y - 8, 1, 2);
    }
  }
}

function drawWaveReadAssist(ctx, wave, player, board, p, settings, time) {
  if (String(settings.waveReadAssist ?? "full").toLowerCase() !== "full") return;
  if (!player || player.state === "airborne" || player.state === "wipeout" || player.state === "complete") return;
  const guide = player.speedPotential ?? waveGuideAt(wave, player, board);
  const x = clamp(Math.round(player.x + (player.x > 310 ? -30 : 29)), 24, LOGICAL_WIDTH - 24);
  const seamY = Math.round(wave.ridingY(player.x, guide.targetFace));
  const y = clamp(seamY, 91, 172);
  const pulse = settings.reducedMotion ? 0 : Math.round(Math.sin(time * 8));
  ctx.fillStyle = guide.zone === "power" ? p.gold : p.foam;
  ctx.fillRect(x - 1, y - 4, 3, 9);
  if (guide.correction > 0) {
    ctx.fillRect(x - 4, y + 2 + pulse, 9, 2);
    ctx.fillRect(x - 2, y + 4 + pulse, 5, 2);
  } else if (guide.correction < 0) {
    ctx.fillRect(x - 4, y - 4 + pulse, 9, 2);
    ctx.fillRect(x - 2, y - 6 + pulse, 5, 2);
  } else {
    ctx.fillRect(x - 4, y - 1, 9, 3);
  }
  const useful = guide.zone === "power"
    ? "POWER LINE"
    : Math.abs(guide.error) < 0.025
      ? "HOLD LINE"
      : guide.correction > 0
        ? "TOO HIGH"
        : "TOO LOW";
  drawPixelText(ctx, useful, x, clamp(y + 10, 104, 181), {
    align: "center",
    color: guide.zone === "power" ? p.gold : p.foam,
    shadow: p.ink,
  });
}

function mixTone(light, accent, conditionId) {
  return conditionId === "twilightGlass" ? accent : light;
}
