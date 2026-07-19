import { LOGICAL_HEIGHT, LOGICAL_WIDTH, PALETTES, TUNING } from "./config.js";
import { clamp, damp, lerp, smoothstep } from "./math.js";
import { drawPixelText } from "./pixel-font.js";

const PARTICLE_COUNT = 176;
const CALLOUT_COUNT = 4;

export class KakiRenderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.ctx.imageSmoothingEnabled = false;
    this.settings = settings;
    this.palette = settings.highContrast ? PALETTES.contrast : PALETTES.standard;
    this.particles = Array.from({ length: PARTICLE_COUNT }, createParticle);
    this.callouts = Array.from({ length: CALLOUT_COUNT }, createCallout);
    this.particleCursor = 0;
    this.calloutCursor = 0;
    this.cameraY = 0;
    this.shake = 0;
    this.impact = 0;
    this.flash = 0;
    this.freeze = 0;
    this.sprayClock = 0;
    this.time = 0;
  }

  applySettings(settings) {
    this.settings = settings;
    this.palette = settings.highContrast ? PALETTES.contrast : PALETTES.standard;
  }

  onEvent(event, simulation) {
    const player = simulation.player;
    switch (event.type) {
      case "callout":
        this.pushCallout(event.payload.text, event.payload.subtext ?? "", event.payload.tone);
        break;
      case "pump":
        this.spawnSpray(player.x - 6, simulation.wave.ridingY(player.x, player.face), 7, 1.1);
        break;
      case "lip":
        this.spawnSpray(player.x, simulation.wave.crestY(player.x), 8, 1.25);
        this.shake = Math.max(this.shake, 0.8);
        break;
      case "launch":
        this.spawnSpray(player.x, simulation.wave.crestY(player.x), 17, 1.6);
        this.shake = Math.max(this.shake, 1.25);
        break;
      case "apex":
        this.spawnSparkles(player.airX, player.airY, 6);
        this.freeze = this.settings.reducedMotion ? 0 : 0.025;
        break;
      case "land": {
        const strength = event.payload.quality === "perfect" ? 2.3 : event.payload.quality === "wobble" ? 1.3 : 1.8;
        this.spawnSpray(player.x, simulation.wave.ridingY(player.x, player.face), 22, strength);
        this.shake = Math.max(this.shake, strength);
        this.impact = Math.max(this.impact, strength * 0.65);
        this.freeze = this.settings.reducedMotion ? 0 : event.payload.quality === "perfect" ? 0.045 : 0.025;
        this.flash = event.payload.quality === "perfect" && !this.settings.reducedFlash ? 0.12 : 0;
        break;
      }
      case "wipeout":
        this.spawnWipeout(player.airX, player.airY);
        this.shake = Math.max(this.shake, 3.2);
        this.impact = Math.max(this.impact, 1.8);
        break;
      default:
        break;
    }
  }

  shouldFreeze() {
    return this.freeze > 0;
  }

  update(dt, simulation) {
    this.time += dt;
    this.freeze = Math.max(0, this.freeze - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.impact = Math.max(0, this.impact - dt * 3.8);
    this.shake = Math.max(0, this.shake - dt * 7.5);

    const player = simulation.player;
    let cameraTarget = 0;
    if (player.state === "airborne") {
      cameraTarget = clamp((player.airY - 74) * 0.18, -19, 0);
    }
    if (this.settings.reducedMotion) cameraTarget = 0;
    this.cameraY = damp(this.cameraY, cameraTarget, TUNING.cameraResponse, dt);

    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= 1 - particle.drag * dt;
    }

    for (const callout of this.callouts) {
      if (callout.life > 0) callout.life -= dt;
    }

    const riding = player.state === "riding" || player.state === "lip" || player.state === "landing" || player.state === "wobble";
    if (riding && player.speed > 54) {
      this.sprayClock += dt * (player.speed - 48) * 0.18;
      while (this.sprayClock >= 1) {
        this.sprayClock -= 1;
        const y = simulation.wave.ridingY(player.x, player.face);
        this.spawnParticle(player.x - 12, y + 1, -16 - player.speed * 0.08, -8 - Math.random() * 13, 0.3, this.palette.foam, 1, 52, 0.9);
      }
    }
  }

  render(simulation, alpha = 1) {
    const ctx = this.ctx;
    const palette = this.palette;
    const motionScale = this.settings.reducedMotion ? 0 : this.settings.screenShake * TUNING.juiceIntensity;
    const shakeX = Math.round(Math.sin(this.time * 71) * this.shake * motionScale);
    const shakeY = Math.round(Math.cos(this.time * 53) * this.shake * motionScale * 0.55);
    const cameraY = Math.round(this.cameraY);
    ctx.setTransform(1, 0, 0, 1, shakeX, shakeY);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.sky;
    ctx.fillRect(-4, -4, LOGICAL_WIDTH + 8, LOGICAL_HEIGHT + 8);

    this.drawSky(simulation);
    ctx.save();
    ctx.translate(0, cameraY);
    this.drawBackWater(simulation);
    this.drawWave(simulation);
    this.drawParticles(false);
    this.drawSurfer(simulation, alpha);
    this.drawParticles(true);
    ctx.restore();
    this.drawHud(simulation);
    this.drawCallouts();

    if (this.flash > 0) {
      ctx.globalAlpha = clamp(this.flash * 2.8, 0, 0.28);
      ctx.fillStyle = palette.white;
      ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      ctx.globalAlpha = 1;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawSky(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    ctx.fillStyle = p.skyTop;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, 26);
    ctx.fillStyle = p.sky;
    ctx.fillRect(0, 26, LOGICAL_WIDTH, 40);
    ctx.fillStyle = p.haze;
    ctx.fillRect(0, 66, LOGICAL_WIDTH, 15);

    drawPixelSun(ctx, 318, 28, 16, p.sun, p.gold);
    const cloudShift = Math.floor((simulation.wave.travel * 0.018) % 440);
    drawCloud(ctx, 58 - cloudShift * 0.12, 29, p.white, p.haze);
    drawCloud(ctx, 212 - cloudShift * 0.06, 18, p.white, p.haze);
    drawCloud(ctx, 430 - cloudShift * 0.1, 42, p.white, p.haze);

    const islandShift = Math.floor((simulation.wave.travel * 0.035) % 450);
    ctx.fillStyle = p.distant;
    drawSteppedHill(ctx, -24 - islandShift * 0.06, 71, 120, 15);
    drawSteppedHill(ctx, 250 - islandShift * 0.04, 73, 152, 12);
    drawPalm(ctx, 42 - islandShift * 0.08, 61, p.deepInk, p.distant);
  }

  drawBackWater(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    ctx.fillStyle = p.waterDeep;
    ctx.fillRect(0, 78, LOGICAL_WIDTH, LOGICAL_HEIGHT - 78);
    const shift = Math.floor(simulation.wave.travel * 0.14) % 28;
    ctx.fillStyle = p.waterLight;
    for (let row = 0; row < 4; row += 1) {
      const y = 84 + row * 8;
      for (let x = -32 + shift + row * 9; x < LOGICAL_WIDTH; x += 42) {
        ctx.fillRect(x, y, 12 + (row % 2) * 5, 1);
      }
    }
  }

  drawWave(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    const wave = simulation.wave;
    traceWaveFace(ctx, wave, 0, 1.35);
    ctx.fillStyle = p.water;
    ctx.fill();

    traceWaveBand(ctx, wave, 0.18, 0.44);
    ctx.fillStyle = p.waterLight;
    ctx.fill();
    traceWaveBand(ctx, wave, 0.44, 0.7);
    ctx.fillStyle = p.water;
    ctx.fill();
    traceWaveBand(ctx, wave, 0.7, 1.35);
    ctx.fillStyle = p.waterDeep;
    ctx.fill();

    drawCurl(ctx, wave, p, this.time);
    drawCrest(ctx, wave, p, this.time);
    drawFaceHighlights(ctx, wave, p, simulation.wave.travel);
  }

  drawSurfer(simulation, alpha) {
    const player = simulation.player;
    const wave = simulation.wave;
    let x;
    let y;
    if (player.state === "airborne" || player.state === "wipeout") {
      x = lerp(player.previousAirX, player.airX, alpha);
      y = lerp(player.previousAirY, player.airY, alpha);
    } else {
      x = lerp(player.previousX, player.x, alpha);
      const face = lerp(player.previousFace, player.face, alpha);
      y = wave.ridingY(x, face);
    }
    x = Math.round(x);
    y = Math.round(y);

    if (player.state === "airborne") this.drawLandingGuide(simulation);
    if (player.state === "wipeout") {
      drawBoard(this.ctx, x + 12, y + 5, player.boardAngle, simulation.board, this.palette, 1);
      drawKittyKaki(this.ctx, x - 4, y - 1, player.bodyAngle, player, this.palette, true);
      if (player.stateTime > 0.62) drawEmbarrassedPaw(this.ctx, x - 2, Math.min(188, y + 13), this.palette);
      return;
    }

    drawBoard(this.ctx, x, y + 1, player.boardAngle, simulation.board, this.palette, player.compression);
    drawKittyKaki(this.ctx, x, y, player.bodyAngle, player, this.palette, false);
  }

  drawLandingGuide(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    const player = simulation.player;
    const surfaceY = simulation.wave.ridingY(player.airX, player.landingFace);
    const slope = simulation.wave.slopeAt(player.airX, player.landingFace);
    ctx.save();
    ctx.translate(Math.round(player.airX), Math.round(surfaceY));
    ctx.rotate(slope);
    ctx.fillStyle = p.gold;
    for (let x = -16; x <= 16; x += 5) ctx.fillRect(x, 0, 3, 1);
    ctx.restore();
    if (this.settings.highContrast) {
      drawPixelText(ctx, "MATCH", player.airX, surfaceY + 5, { scale: 1, align: "center", color: p.gold, shadow: p.ink });
    }
  }

  drawParticles(foreground) {
    const ctx = this.ctx;
    for (const particle of this.particles) {
      if (particle.life <= 0 || particle.foreground !== foreground) continue;
      const alpha = clamp(particle.life / particle.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      const size = particle.kind === "bubble" ? Math.max(1, Math.round(particle.size * (1 - alpha * 0.3))) : particle.size;
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), size, size);
      if (particle.kind === "star" && size >= 2) {
        ctx.fillRect(Math.round(particle.x) - 1, Math.round(particle.y) + 1, size + 2, 1);
        ctx.fillRect(Math.round(particle.x) + 1, Math.round(particle.y) - 1, 1, size + 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  drawHud(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    const score = String(Math.round(simulation.score.total)).padStart(6, "0");
    const seconds = Math.ceil(simulation.timeRemaining);
    const multiplier = simulation.currentMultiplier();
    const risk = simulation.wave.pocketRisk(simulation.player.x);

    panel(ctx, 5, 5, 90, 19, p.deepInk, p.waterDeep);
    drawPixelText(ctx, "SCORE", 10, 9, { color: p.foamShade, shadow: p.ink });
    drawPixelText(ctx, score, 89, 9, { scale: 2, spacing: 1, align: "right", color: p.white, shadow: p.ink });

    panel(ctx, 166, 5, 52, 19, p.deepInk, p.waterDeep);
    drawPixelText(ctx, `${seconds}`, 192, 9, { scale: 2, spacing: 1, align: "center", color: seconds <= 10 ? p.danger : p.sun, shadow: p.ink });

    panel(ctx, 288, 5, 91, 19, p.deepInk, p.waterDeep);
    drawPixelText(ctx, "PAWS", 293, 9, { color: p.foamShade, shadow: p.ink });
    for (let index = 0; index < simulation.tuning.maxWipeouts; index += 1) {
      drawPaw(ctx, 338 + index * 12, 10, index < simulation.tuning.maxWipeouts - simulation.wipeouts ? p.gold : p.danger, p.ink);
    }

    panel(ctx, 6, 190, 111, 20, p.deepInk, p.waterDeep);
    drawPixelText(ctx, "POCKET", 11, 195, { color: risk > 0.68 ? p.gold : p.foamShade, shadow: p.ink });
    ctx.fillStyle = p.ink;
    ctx.fillRect(56, 195, 53, 7);
    ctx.fillStyle = risk > 0.78 ? p.danger : risk > 0.48 ? p.gold : p.foamShade;
    ctx.fillRect(58, 197, Math.round(49 * risk), 3);

    panel(ctx, 294, 190, 84, 20, p.deepInk, p.waterDeep);
    drawPixelText(ctx, `X${multiplier.toFixed(1)}`, 371, 195, { align: "right", color: multiplier > 2.2 ? p.gold : p.white, shadow: p.ink });

    if (simulation.assists.steering || simulation.assists.landing) {
      drawPixelText(ctx, "ASSIST", 192, 198, { align: "center", color: p.foamShade, shadow: p.ink });
    }
    if (simulation.elapsed < 6.5 && simulation.player.state !== "airborne") {
      const alpha = clamp((6.5 - simulation.elapsed) / 1.5, 0, 1);
      panel(ctx, 85, 162, 214, 18, p.deepInk, p.waterDeep, alpha * 0.88);
      drawPixelText(ctx, "CARVE: ARROWS  PUMP: Z/SPACE  STYLE: X", 192, 168, {
        align: "center",
        color: p.white,
        shadow: p.ink,
        alpha,
      });
    }
  }

  drawCallouts() {
    const ctx = this.ctx;
    const p = this.palette;
    for (let index = 0; index < this.callouts.length; index += 1) {
      const callout = this.callouts[index];
      if (callout.life <= 0) continue;
      const age = callout.duration - callout.life;
      const inAlpha = smoothstep(0, 0.1, age);
      const outAlpha = smoothstep(0, 0.25, callout.life);
      const alpha = inAlpha * outAlpha;
      const rise = Math.round(age * 5);
      const toneColor = callout.tone === "wipeout" ? p.danger : callout.tone === "perfect" ? p.gold : callout.tone === "risk" ? p.sun : p.white;
      drawPixelText(ctx, callout.text, 192, 42 - rise + index * 2, {
        scale: 2,
        spacing: 2,
        align: "center",
        color: toneColor,
        shadow: p.ink,
        alpha,
      });
      if (callout.subtext) {
        drawPixelText(ctx, callout.subtext, 192, 55 - rise + index * 2, {
          align: "center",
          color: p.foam,
          shadow: p.ink,
          alpha,
        });
      }
    }
  }

  pushCallout(text, subtext = "", tone = "flow") {
    const callout = this.callouts[this.calloutCursor];
    callout.text = text;
    callout.subtext = subtext;
    callout.tone = tone;
    callout.duration = tone === "hint" ? 2.2 : 1.25;
    callout.life = callout.duration;
    this.calloutCursor = (this.calloutCursor + 1) % this.callouts.length;
  }

  spawnSpray(x, y, count, force) {
    for (let index = 0; index < count; index += 1) {
      const direction = index % 2 ? -1 : 1;
      this.spawnParticle(
        x + (Math.random() - 0.5) * 12,
        y + (Math.random() - 0.5) * 4,
        direction * (5 + Math.random() * 25) * force - 9,
        -(10 + Math.random() * 31) * force,
        0.32 + Math.random() * 0.32,
        index % 4 === 0 ? this.palette.foamShade : this.palette.foam,
        Math.random() > 0.78 ? 2 : 1,
        66,
        0.9,
        "spray",
        index % 3 === 0,
      );
    }
  }

  spawnSparkles(x, y, count) {
    for (let index = 0; index < count; index += 1) {
      this.spawnParticle(x + (index - count / 2) * 6, y - 3 + (index % 2) * 5, (index - count / 2) * 2.5, -6, 0.48, this.palette.gold, 2, 10, 0.2, "star", true);
    }
  }

  spawnWipeout(x, y) {
    this.spawnSpray(x, y, 35, 1.8);
    for (let index = 0; index < 10; index += 1) {
      this.spawnParticle(x - 10 + Math.random() * 20, y + Math.random() * 8, -4 + Math.random() * 8, -9 - Math.random() * 14, 0.72, this.palette.white, index % 3 === 0 ? 2 : 1, 16, 0.4, "bubble", true);
    }
  }

  spawnParticle(x, y, vx, vy, life, color, size, gravity, drag, kind = "spray", foreground = false) {
    const particle = this.particles[this.particleCursor];
    particle.x = x;
    particle.y = y;
    particle.vx = vx;
    particle.vy = vy;
    particle.life = life;
    particle.maxLife = life;
    particle.color = color;
    particle.size = size;
    particle.gravity = gravity;
    particle.drag = drag;
    particle.kind = kind;
    particle.foreground = foreground;
    this.particleCursor = (this.particleCursor + 1) % this.particles.length;
  }
}

function traceWaveFace(ctx, wave, topFace, bottomFace) {
  ctx.beginPath();
  ctx.moveTo(0, wave.ridingY(0, topFace));
  for (let x = 0; x <= LOGICAL_WIDTH; x += 4) ctx.lineTo(x, Math.round(wave.ridingY(x, topFace)));
  for (let x = LOGICAL_WIDTH; x >= 0; x -= 4) ctx.lineTo(x, Math.round(wave.ridingY(x, bottomFace)));
  ctx.closePath();
}

function traceWaveBand(ctx, wave, topFace, bottomFace) {
  traceWaveFace(ctx, wave, topFace, bottomFace);
}

function drawCrest(ctx, wave, p, time) {
  ctx.fillStyle = p.crest;
  for (let x = 0; x < LOGICAL_WIDTH; x += 3) {
    const y = Math.round(wave.crestY(x));
    const thickness = 2 + ((x + Math.floor(time * 9)) % 13 < 4 ? 2 : 0);
    ctx.fillRect(x, y - 1, 4, thickness);
  }
  ctx.fillStyle = p.foam;
  for (let x = 2; x < LOGICAL_WIDTH; x += 11) {
    const y = Math.round(wave.crestY(x));
    ctx.fillRect(x, y - 3 - ((x / 11) % 2), 6, 2);
    if ((x + Math.floor(time * 13)) % 33 < 11) ctx.fillRect(x + 2, y - 5, 2, 2);
  }
}

function drawCurl(ctx, wave, p, time) {
  const curl = Math.round(wave.curlX);
  ctx.fillStyle = p.deepInk;
  ctx.beginPath();
  ctx.moveTo(curl - 26, 76);
  ctx.lineTo(curl + 10, 76);
  ctx.lineTo(curl + 21, 91);
  ctx.lineTo(curl + 16, 122);
  ctx.lineTo(curl + 6, 151);
  ctx.lineTo(curl - 17, 183);
  ctx.lineTo(curl - 32, 183);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.waterDeep;
  ctx.beginPath();
  ctx.moveTo(curl - 22, 78);
  ctx.lineTo(curl + 4, 78);
  ctx.lineTo(curl + 12, 91);
  ctx.lineTo(curl + 5, 117);
  ctx.lineTo(curl - 13, 136);
  ctx.lineTo(curl - 25, 136);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = p.foam;
  for (let y = 78; y < 184; y += 6) {
    const wobble = Math.round(Math.sin(y * 0.23 + time * 6) * 3);
    ctx.fillRect(curl - 27 + wobble, y, 9 + (y % 12 ? 2 : 6), 3);
  }
  ctx.fillStyle = p.danger;
  for (let y = 92; y < 177; y += 10) ctx.fillRect(curl + 16, y, 2, 4);
}

function drawFaceHighlights(ctx, wave, p, travel) {
  const shift = Math.floor(travel * 0.22) % 31;
  ctx.fillStyle = p.crest;
  for (let row = 0; row < 6; row += 1) {
    const face = 0.18 + row * 0.12;
    for (let x = -25 + shift + row * 9; x < LOGICAL_WIDTH; x += 42) {
      if (x < wave.curlX + 18) continue;
      const y = Math.round(wave.ridingY(x, face));
      ctx.fillRect(x, y, 12 + (row % 3) * 3, 1);
      if ((x + row) % 3 === 0) ctx.fillRect(x + 3, y + 3, 2, 1);
    }
  }
}

function drawBoard(ctx, x, y, angle, board, p, compression) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  const squash = compression > 0.8 ? 1 : 0;
  ctx.fillStyle = p.ink;
  ctx.fillRect(-17, -2 + squash, 34, 5 - squash);
  ctx.fillStyle = board.color;
  ctx.fillRect(-15, -1 + squash, 30, 3 - squash);
  ctx.fillStyle = board.accent;
  ctx.fillRect(-5, -1 + squash, 10, 2);
  ctx.fillRect(10, -1 + squash, 3, 2);
  ctx.fillStyle = p.white;
  ctx.fillRect(2, -1 + squash, 2, 1);
  ctx.fillStyle = p.ink;
  ctx.fillRect(-16, 2, 3, 1);
  ctx.fillRect(13, 2, 3, 1);
  ctx.restore();
}

function drawKittyKaki(ctx, x, y, angle, player, p, loose) {
  const crouch = clamp(player.compression, 0, 1);
  const state = player.state;
  const airborne = state === "airborne";
  const carve = clamp(player.faceVelocity * 0.8, -1, 1);
  const wobble = state === "wobble" ? Math.sin(player.stateTime * 30) : 0;
  const stretch = airborne ? 1 : 0;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  if (loose) ctx.rotate(Math.sin(player.stateTime * 18) * 0.18);

  // Tail and rear plush mass.
  ctx.fillStyle = p.ink;
  ctx.fillRect(-9 - Math.round(carve * 2), -11 + Math.round(crouch * 3), 6, 4);
  ctx.fillStyle = p.plush;
  ctx.fillRect(-8 - Math.round(carve * 2), -10 + Math.round(crouch * 3), 4, 2);

  // Legs stay visually separate from the board.
  const legSpread = airborne && player.grabbed ? 2 : 5;
  ctx.fillStyle = p.ink;
  ctx.fillRect(-legSpread - 3, -6 + Math.round(crouch * 2), 5, 7 - Math.round(crouch * 2));
  ctx.fillRect(legSpread - 2, -6 + Math.round(crouch * 2), 5, 7 - Math.round(crouch * 2));
  ctx.fillStyle = p.hoodie;
  ctx.fillRect(-legSpread - 2, -5 + Math.round(crouch * 2), 3, 5 - Math.round(crouch * 2));
  ctx.fillRect(legSpread - 1, -5 + Math.round(crouch * 2), 3, 5 - Math.round(crouch * 2));

  // Bean-shaped hoodie body.
  const bodyY = -14 + Math.round(crouch * 4) - stretch;
  ctx.fillStyle = p.ink;
  ctx.fillRect(-7, bodyY, 14, 11 - Math.round(crouch * 2) + stretch);
  ctx.fillRect(-5, bodyY - 2, 10, 2);
  ctx.fillStyle = p.hoodie;
  ctx.fillRect(-6, bodyY + 1, 12, 8 - Math.round(crouch * 2) + stretch);
  ctx.fillStyle = p.white;
  ctx.fillRect(-1, bodyY + 1, 1, 6);
  ctx.fillRect(1, bodyY + 1, 1, 6);

  // Paws communicate carve, grab, and wobble.
  let leftPawX = -10 - Math.round(carve * 2);
  let rightPawX = 7 - Math.round(carve * 2);
  let pawY = bodyY + 1;
  if (airborne && player.grabbed) {
    leftPawX = -8;
    rightPawX = 5;
    pawY = bodyY + 7;
  }
  if (state === "wobble") {
    leftPawX -= Math.round(wobble * 4);
    rightPawX += Math.round(wobble * 4);
    pawY -= 3;
  }
  ctx.fillStyle = p.ink;
  ctx.fillRect(leftPawX, pawY, 5, 5);
  ctx.fillRect(rightPawX, pawY, 5, 5);
  ctx.fillStyle = p.plushLight;
  ctx.fillRect(leftPawX + 1, pawY + 1, 3, 3);
  ctx.fillRect(rightPawX + 1, pawY + 1, 3, 3);

  // Oversized plush head, ears, blue bob, and connected highlight clusters.
  const headLead = loose ? 0 : 2 + Math.round(carve * 1.5);
  const headY = bodyY - 17 - stretch * 2;
  ctx.translate(headLead, 0);
  ctx.fillStyle = p.ink;
  ctx.fillRect(-11, headY + 2, 22, 16);
  ctx.fillRect(-9, headY, 18, 2);
  drawEar(ctx, -10, headY - 7, false, p, state === "wobble");
  drawEar(ctx, 5, headY - 7, true, p, false);
  ctx.fillStyle = p.face;
  ctx.fillRect(-8, headY + 5, 16, 11);
  ctx.fillRect(-6, headY + 3, 12, 2);
  ctx.fillStyle = p.plush;
  ctx.fillRect(-10, headY + 1, 20, 5);
  ctx.fillRect(-10, headY + 5, 4, 10);
  ctx.fillRect(6, headY + 5, 4, 10);
  ctx.fillRect(-8, headY + 3, 5, 3);
  ctx.fillStyle = p.plushDark;
  ctx.fillRect(-9, headY + 12, 3, 3);
  ctx.fillRect(7, headY + 10, 2, 5);
  ctx.fillStyle = p.plushLight;
  ctx.fillRect(-6, headY + 1, 7, 2);
  ctx.fillRect(4, headY + 3, 5, 2);
  ctx.fillRect(-9, headY + 7, 2, 3);

  // One-pixel face marks are reserved for expression and seams.
  ctx.fillStyle = p.ink;
  if (state === "wobble" || loose) {
    ctx.fillRect(-4, headY + 9, 2, 2);
    ctx.fillRect(3, headY + 9, 2, 2);
  } else {
    ctx.fillRect(-5, headY + 10, 3, 1);
    ctx.fillRect(3, headY + 10, 3, 1);
    ctx.fillRect(-6, headY + 9, 1, 1);
    ctx.fillRect(6, headY + 9, 1, 1);
  }
  ctx.fillRect(0, headY + 12, 1, 1);
  ctx.fillRect(-3, headY + 13, 2, 1);
  ctx.fillRect(2, headY + 13, 2, 1);
  ctx.fillRect(-1, headY + 14, 3, 1);
  ctx.fillStyle = p.cheek;
  ctx.fillRect(-7, headY + 12, 2, 1);
  ctx.fillRect(6, headY + 12, 2, 1);
  ctx.restore();
}

function drawEar(ctx, x, y, right, p, folded) {
  ctx.fillStyle = p.ink;
  if (folded) {
    ctx.fillRect(x, y + 3, 6, 4);
    ctx.fillRect(x + 2, y + 1, 4, 3);
  } else {
    ctx.fillRect(x, y + 2, 6, 6);
    ctx.fillRect(x + (right ? 2 : 0), y, 4, 3);
  }
  ctx.fillStyle = p.white;
  ctx.fillRect(x + 1, y + 3, 4, 4);
  ctx.fillStyle = p.plush;
  ctx.fillRect(x + (right ? 3 : 1), y + 1, 2, 3);
}

function drawEmbarrassedPaw(ctx, x, y, p) {
  ctx.fillStyle = p.foam;
  ctx.fillRect(x - 7, y + 3, 15, 4);
  ctx.fillStyle = p.ink;
  ctx.fillRect(x - 2, y - 3, 6, 7);
  ctx.fillStyle = p.plushLight;
  ctx.fillRect(x - 1, y - 2, 4, 5);
  ctx.fillStyle = p.ink;
  ctx.fillRect(x - 4, y - 4, 2, 4);
  ctx.fillRect(x + 4, y - 4, 2, 4);
}

function panel(ctx, x, y, width, height, outer, inner, alpha = 0.88) {
  const previous = ctx.globalAlpha;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = outer;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = inner;
  ctx.fillRect(x + 2, y + 2, width - 4, height - 4);
  ctx.globalAlpha = previous;
}

function drawPaw(ctx, x, y, color, outline) {
  ctx.fillStyle = outline;
  ctx.fillRect(x, y + 4, 7, 6);
  ctx.fillRect(x, y, 2, 3);
  ctx.fillRect(x + 3, y - 1, 2, 3);
  ctx.fillRect(x + 6, y, 2, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 5, 5, 4);
  ctx.fillRect(x + 1, y + 1, 1, 2);
  ctx.fillRect(x + 4, y, 1, 2);
  ctx.fillRect(x + 7, y + 1, 1, 2);
}

function drawPixelSun(ctx, x, y, radius, color, shade) {
  for (let row = -radius; row <= radius; row += 2) {
    const width = Math.floor(Math.sqrt(radius * radius - row * row));
    ctx.fillStyle = row > radius * 0.3 ? shade : color;
    ctx.fillRect(x - width, y + row, width * 2, 2);
  }
}

function drawCloud(ctx, x, y, color, shade) {
  const px = Math.round(x);
  ctx.fillStyle = shade;
  ctx.fillRect(px, y + 5, 30, 6);
  ctx.fillStyle = color;
  ctx.fillRect(px + 2, y + 3, 27, 6);
  ctx.fillRect(px + 8, y, 9, 5);
  ctx.fillRect(px + 19, y + 1, 6, 4);
}

function drawSteppedHill(ctx, x, y, width, height) {
  ctx.fillRect(Math.round(x), y, width, height);
  ctx.fillRect(Math.round(x + width * 0.12), y - 5, width * 0.64, 6);
  ctx.fillRect(Math.round(x + width * 0.25), y - 9, width * 0.35, 5);
}

function drawPalm(ctx, x, y, trunk, leaves) {
  const px = Math.round(x);
  ctx.fillStyle = trunk;
  ctx.fillRect(px, y, 2, 12);
  ctx.fillStyle = leaves;
  ctx.fillRect(px - 8, y - 3, 18, 2);
  ctx.fillRect(px - 5, y - 6, 12, 2);
  ctx.fillRect(px - 1, y - 8, 3, 8);
}

function createParticle() {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    color: "#fff",
    size: 1,
    gravity: 0,
    drag: 0,
    kind: "spray",
    foreground: false,
  };
}

function createCallout() {
  return { text: "", subtext: "", tone: "flow", life: 0, duration: 1 };
}
