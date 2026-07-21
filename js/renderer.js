import { LOGICAL_HEIGHT, LOGICAL_WIDTH, PALETTES, TUNING } from "./config.js";
import { clamp, damp, lerp, smoothstep } from "./math.js";
import { drawPixelText } from "./pixel-font.js";
import { drawBoardSprite, drawBoardWake, drawKittySprite, getBoardVisualProfile } from "./sprites.js";
import {
  advanceWavePresentationClocks,
  createWavePresentationClocks,
  drawLayeredWave,
  waveGuideAt,
  waveSurfaceTravel,
} from "./wave-visuals.js";
import {
  drawHeroBackWater,
  drawHeroBarrelBack,
  drawHeroBarrelFront,
  isHeroBarrelWave,
} from "./hero-wave-visuals.js";
import {
  drawActivePowerupHud,
  drawCarrierEvent,
  drawWorldFoamGates,
  drawWorldPowerups,
  drawWorldTraffic,
  drawWorldWildlife,
} from "./world-visuals.js";

const PARTICLE_COUNT = 176;
const CALLOUT_QUEUE_LIMIT = 4;
const CALLOUT_GAP = 0.14;
const CALLOUT_MIN_READ_TIME = 1.05;

/**
 * Positive Canvas translation moves the world down and reveals more sky,
 * which is the camera-up motion a large aerial needs. The previous negative
 * offset pushed high jumps farther offscreen.
 */
export function verticalCameraTarget(player, reducedMotion = false) {
  if (reducedMotion || player?.state !== "airborne") return 0;
  const airY = Number.isFinite(Number(player.airY)) ? Number(player.airY) : 74;
  const height = clamp(Number(player.maxAirHeight ?? 0) / 110, 0, 1);
  return clamp(Math.max(0, 68 - airY) * 0.72 + height * 10, 0, 62);
}

/** Distant coast travel is monotonic and therefore cannot flip on a cutback. */
export function backgroundParallaxPhase(wave, reducedMotion = false) {
  if (reducedMotion) return 0;
  const cycle = LOGICAL_WIDTH * 2;
  const raw = Math.floor(waveSurfaceTravel(wave) * 0.045);
  return ((raw % cycle) + cycle) % cycle;
}

export class KakiRenderer {
  constructor(canvas, settings, visualAssets = null) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.ctx.imageSmoothingEnabled = false;
    this.settings = settings;
    this.visualAssets = visualAssets;
    this.palette = settings.highContrast ? PALETTES.contrast : PALETTES.standard;
    this.conditionId = "goldenCoast";
    this.currentBoard = null;
    this.particles = Array.from({ length: PARTICLE_COUNT }, createParticle);
    this.activeCallout = createCallout();
    this.calloutQueue = [];
    this.calloutSequence = 0;
    this.particleCursor = 0;
    this.calloutGap = 0;
    this.cameraY = 0;
    this.shake = 0;
    this.impact = 0;
    this.flash = 0;
    this.freeze = 0;
    this.sprayClock = 0;
    this.time = 0;
    this.pumpRelease = 0;
    this.turboPulse = 0;
    this.turboRefillAmount = 0;
    this.turboSparkClock = 0;
    this.lastLandingQuality = "clean";
    this.wavePresentationClocks = createWavePresentationClocks();
  }

  applySettings(settings) {
    this.settings = { ...this.settings, ...settings };
    this.palette = this.settings.highContrast ? PALETTES.contrast : paletteForCondition(this.conditionId);
  }

  resetRunPresentation(simulation = null) {
    for (const particle of this.particles) particle.life = 0;
    this.activeCallout = createCallout();
    this.calloutQueue.length = 0;
    this.calloutSequence = 0;
    this.particleCursor = 0;
    this.calloutGap = 0;
    this.cameraY = 0;
    this.shake = 0;
    this.impact = 0;
    this.flash = 0;
    this.freeze = 0;
    this.sprayClock = 0;
    this.pumpRelease = 0;
    this.turboPulse = 0;
    this.turboRefillAmount = 0;
    this.turboSparkClock = 0;
    this.lastLandingQuality = "clean";
    this.currentBoard = simulation?.board ?? null;
    this.wavePresentationClocks = createWavePresentationClocks();
  }

  onEvent(event, simulation) {
    const player = simulation.player;
    this.currentBoard = simulation.board;
    const payload = event.payload ?? {};
    const ridingY = simulation.wave.ridingY(player.x, player.face);
    switch (event.type) {
      case "callout":
        this.pushCallout(payload.text ?? "", payload.subtext ?? "", payload.tone, {
          channel: payload.channel,
        });
        break;
      case "pump":
        this.spawnSpray(player.x - 6, ridingY, 6 + Math.round((payload.strength ?? 0.5) * 8), 0.8 + (payload.efficiency ?? payload.strength ?? 0.5) * 0.75);
        this.impact = Math.max(this.impact, (payload.efficiency ?? payload.strength ?? 0.5) * 0.7);
        this.pumpRelease = 0.2;
        break;
      case "turboStart":
        this.spawnSeamGlints(player.x, ridingY, 11);
        this.spawnSpray(player.x - player.travelDirection * 9, ridingY, 12, 1.4);
        this.impact = Math.max(this.impact, 0.75);
        this.shake = Math.max(this.shake, 0.7);
        this.turboPulse = Math.max(this.turboPulse, 0.42);
        break;
      case "turboRefill":
        this.spawnSparkles(player.x, ridingY - 8, 11);
        this.turboPulse = 0.95;
        this.turboRefillAmount = Number(payload.amount) || 0;
        break;
      case "powerLineEnter":
        this.spawnSeamGlints(player.x, ridingY, 9);
        break;
      case "fullPower":
        this.spawnSeamGlints(player.x, ridingY, 18);
        this.spawnSpray(player.x - 9, ridingY, 12, 1.35);
        this.impact = Math.max(this.impact, 0.9);
        if (!this.settings.reducedFlash) this.flash = Math.max(this.flash, 0.055);
        break;
      case "powerLineLeave":
        this.spawnSpray(player.x - 8, ridingY, 4, 0.55);
        break;
      case "maneuver":
      case "maneuverStart":
      case "maneuverComplete":
      case "snap":
      case "cutback":
      case "floater":
      case "tubeTuck": {
        const id = payload.id ?? event.type;
        const tube = isTubeId(id);
        const force = id === "floater" ? 1.15 : tube ? 0.65 : 1.35;
        this.spawnSpray(player.x, ridingY, tube ? 5 : 13, force);
        this.shake = Math.max(this.shake, id === "snap" || id === "cutback" ? 0.95 : 0.45);
        break;
      }
      case "tubeExit":
        if (payload.reason === "complete") break;
        this.spawnSeamGlints(player.x, ridingY, 9);
        this.spawnSpray(player.x, ridingY, 8, 0.82);
        if ((payload.duration ?? 0) >= TUNING.tubeCleanExitTime) {
          this.freeze = this.settings.reducedMotion ? 0 : 0.022;
        }
        break;
      case "tubeFail":
        this.spawnSpray(player.x, ridingY, 14, 1.4);
        this.impact = Math.max(this.impact, 1.1);
        break;
      case "trickStarted":
      case "trickStart":
        this.spawnTrickMarks(player.airX ?? player.x, player.airY ?? ridingY, payload.id, 5);
        break;
      case "trickCompleted":
      case "trickComplete":
        this.spawnTrickMarks(player.airX ?? player.x, player.airY ?? ridingY, payload.id, 10);
        this.freeze = this.settings.reducedMotion ? 0 : 0.018;
        break;
      case "varial":
        this.spawnTrickMarks(player.airX ?? player.x, player.airY ?? ridingY, "varial", 11);
        break;
      case "signature":
      case "kakiTwist":
        this.spawnTrickMarks(player.airX ?? player.x, player.airY ?? ridingY, "kakiTwist", 14);
        if (!this.settings.reducedFlash) this.flash = Math.max(this.flash, 0.055);
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
        this.lastLandingQuality = payload.quality ?? "clean";
        const strength = payload.quality === "perfect" ? 2.3 : payload.quality === "wobble" || payload.quality === "sketchy" ? 1.3 : 1.8;
        this.spawnSpray(player.x, simulation.wave.ridingY(player.x, player.face), 22, strength);
        this.shake = Math.max(this.shake, strength);
        this.impact = Math.max(this.impact, strength * 0.65);
        this.freeze = this.settings.reducedMotion ? 0 : payload.quality === "perfect" ? 0.045 : 0.025;
        this.flash = payload.quality === "perfect" && !this.settings.reducedFlash ? 0.12 : 0;
        break;
      }
      case "wipeout":
        this.spawnWipeout(player.airX, player.airY);
        this.shake = Math.max(this.shake, 3.2);
        this.impact = Math.max(this.impact, 1.8);
        break;
      case "combo":
      case "comboIncrease":
        this.spawnSparkles(player.state === "airborne" ? player.airX : player.x, player.state === "airborne" ? player.airY : ridingY, 4 + Math.min(6, Math.round(payload.combo ?? payload.value ?? 1)));
        break;
      case "personalBest":
        this.spawnSparkles(192, 42, 14);
        if (!this.settings.reducedFlash) this.flash = Math.max(this.flash, 0.09);
        this.pushCallout("NEW PERSONAL BEST", "KAKI FLOW", "perfect");
        break;
      case "tutorialComplete":
        this.spawnSparkles(192, 64, 12);
        this.pushCallout("SURF SCHOOL CLEAR", "THE FULL WAVE IS YOURS", "perfect");
        break;
      case "reversal":
      case "switch":
      case "directionReversed":
      case "directionChange":
        this.spawnSpray(player.x, ridingY, 15, 1.25);
        this.shake = Math.max(this.shake, 0.65);
        this.pushCallout("DEEP CUTBACK", payload.switchStance || payload.switch ? "SWITCH STANCE" : "MOMENTUM CARRIED", "risk");
        break;
      case "dolphinMounted":
        this.spawnSparkles(player.x, ridingY - 4, 12);
        this.freeze = this.settings.reducedMotion ? 0 : 0.028;
        this.pushCallout("DOLPHIN RIDE", "STEER FOR THE FINAL BREACH", "perfect");
        break;
      case "whaleMounted":
        this.spawnSpray(player.x, ridingY, 24, 2.2);
        this.shake = Math.max(this.shake, 2.2);
        this.freeze = this.settings.reducedMotion ? 0 : 0.038;
        this.pushCallout("WHALE RIDE", "THE BIGGEST AIR", "perfect");
        break;
      case "animalDismount":
        this.spawnSpray(player.x, ridingY, 26, 2.35);
        this.shake = Math.max(this.shake, 2.35);
        break;
      case "sharkThread":
        this.spawnSparkles(player.state === "airborne" ? player.airX : player.x, player.state === "airborne" ? player.airY : ridingY, 10);
        this.pushCallout("SHARK THREAD", "DANGER BONUS", "risk");
        break;
      case "featherThread":
        this.spawnSparkles(player.state === "airborne" ? player.airX : player.x, player.state === "airborne" ? player.airY : ridingY, 9);
        this.pushCallout("FEATHER THREAD", "FLOCK DODGED CLEAN", "perfect");
        break;
      case "speedboatRaceWon":
        this.spawnSeamGlints(player.x, ridingY, 12);
        this.pushCallout("WAKE RACE WON", "STYLE BONUS", "perfect");
        break;
      case "foamGateCleared":
        this.spawnSparkles(payload.x ?? player.x, payload.y ?? ridingY, 8);
        break;
      case "foamGateSeriesCompleted":
        this.spawnSparkles(player.x, ridingY - 8, 14);
        break;
      case "powerupCollected":
        this.spawnSparkles(player.state === "airborne" ? player.airX : player.x, player.state === "airborne" ? player.airY : ridingY, 12);
        if (!this.settings.reducedFlash) this.flash = Math.max(this.flash, 0.045);
        break;
      case "fleetAirshowCompleted":
        if ((payload.value ?? 0) > 0) {
          this.spawnSparkles(192, 42, 16);
          this.pushCallout("FLEET AIRSHOW", "GIANT AIR BONUS", "perfect");
        }
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
    this.pumpRelease = Math.max(0, this.pumpRelease - dt);
    this.turboPulse = Math.max(0, this.turboPulse - dt);
    this.shake = Math.max(0, this.shake - dt * 7.5);

    const player = simulation.player;
    advanceWavePresentationClocks(
      this.wavePresentationClocks,
      simulation.wave,
      player,
      rideSpeedCapFor(simulation),
      this.settings.reducedMotion,
    );
    const cameraTarget = verticalCameraTarget(player, this.settings.reducedMotion);
    this.cameraY = damp(this.cameraY, cameraTarget, TUNING.cameraResponse, dt);

    for (const particle of this.particles) {
      if (particle.life <= 0) continue;
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += particle.gravity * dt;
      particle.vx *= 1 - particle.drag * dt;
    }

    if (this.activeCallout.life > 0) {
      this.activeCallout.life = Math.max(0, this.activeCallout.life - dt);
      if (this.activeCallout.life === 0) this.calloutGap = CALLOUT_GAP;
    }
    this.calloutGap = Math.max(0, this.calloutGap - dt);
    this.pruneStaleCallouts();
    if (this.activeCallout.life <= 0 && this.calloutGap <= 0) this.activateNextCallout();

    const riding = player.state === "riding" || player.state === "lip" || player.state === "landing" || player.state === "wobble";
    if (riding && player.speed > 54) {
      this.sprayClock += dt * (player.speed - 48) * 0.18;
      while (this.sprayClock >= 1) {
        this.sprayClock -= 1;
        const y = simulation.wave.ridingY(player.x, player.face);
        this.spawnParticle(player.x - 12, y + 1, -16 - player.speed * 0.08, -8 - Math.random() * 13, 0.3, this.palette.foam, 1, 52, 0.9);
      }
    }
    if (riding && player.turboActive) {
      this.turboSparkClock += dt * 22;
      while (this.turboSparkClock >= 1) {
        this.turboSparkClock -= 1;
        const direction = Math.sign(player.travelDirection) || 1;
        const y = simulation.wave.ridingY(player.x, player.face);
        this.spawnParticle(
          player.x - direction * 13,
          y - 1,
          -direction * (28 + player.speed * 0.08),
          -7 - Math.random() * 10,
          0.24,
          this.palette.gold,
          1,
          44,
          0.88,
        );
      }
    } else {
      this.turboSparkClock = 0;
    }
  }

  render(simulation, alpha = 1) {
    const ctx = this.ctx;
    this.conditionId = conditionIdFor(simulation, this.settings);
    this.palette = this.settings.highContrast ? PALETTES.contrast : paletteForCondition(this.conditionId);
    ctx.imageSmoothingEnabled = false;
    const palette = this.palette;
    const motionScale = this.settings.reducedMotion ? 0 : this.settings.screenShake * TUNING.juiceIntensity;
    const shakeX = Math.round(Math.sin(this.time * 71) * this.shake * motionScale);
    const shakeY = Math.round(Math.cos(this.time * 53) * this.shake * motionScale * 0.55);
    const cameraY = Math.round(this.cameraY);
    const heroBarrel = isHeroBarrelWave(simulation.wave);
    const allowsBackgroundTraffic = this.conditionId !== "twilightGlass";
    ctx.setTransform(1, 0, 0, 1, shakeX, shakeY);
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.skyTop;
    ctx.fillRect(-4, -4, LOGICAL_WIDTH + 8, LOGICAL_HEIGHT + 8);
    this.drawSkyExtension(cameraY);

    // The sky and horizon are part of the same camera world as the wave. Moving
    // only the water created an empty color band during big air; translating
    // both exposes additional sky above the scene with no horizon seam.
    ctx.save();
    ctx.translate(0, cameraY);
    this.drawSky(simulation);
    // Twilight keeps a pristine hero-wave sky. Other conditions retain only
    // correctly depth-sorted traffic behind the break: no craft is allowed to
    // paste across the barrel, rider, or falling-water curtain.
    if (allowsBackgroundTraffic) {
      drawCarrierEvent(ctx, simulation, this.visualAssets, palette, this.settings);
      drawWorldTraffic(ctx, simulation, this.visualAssets, palette, "far", alpha, this.settings);
      drawWorldTraffic(ctx, simulation, this.visualAssets, palette, "near", alpha, this.settings, "background");
    }
    ctx.restore();
    ctx.save();
    ctx.translate(0, cameraY);
    this.drawBackWater(simulation);
    if (allowsBackgroundTraffic) drawWorldTraffic(ctx, simulation, this.visualAssets, palette, "mid", alpha, this.settings, "background");
    this.drawWave(simulation);
    // The continuous break owns the entire playable foreground. Near and
    // playfield-front traffic is deliberately omitted so boats cannot float on
    // the wave face or appear inside the tube.
    this.drawMaxSpeedFeedback(simulation);
    this.drawImpactCavity(simulation);
    drawWorldWildlife(ctx, simulation, this.visualAssets, palette, alpha, false, this.settings);
    drawWorldPowerups(ctx, simulation, this.visualAssets, palette, alpha);
    drawWorldFoamGates(ctx, simulation, this.visualAssets, palette, alpha, this.settings);
    this.drawParticles(false);
    this.drawSurfer(simulation, alpha);
    if (heroBarrel) this.drawWaveFront(simulation);
    drawWorldWildlife(ctx, simulation, this.visualAssets, palette, alpha, true, this.settings);
    this.drawParticles(true);
    ctx.restore();
    this.drawHud(simulation);
    drawActivePowerupHud(ctx, simulation, this.visualAssets, palette);
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
    if (this.drawBackgroundAsset(simulation)) return;
    if (this.conditionId === "twilightGlass") {
      this.drawTwilightSky(simulation);
      return;
    }
    if (this.conditionId === "stormbreak") {
      this.drawStormSky(simulation);
      return;
    }
    ctx.fillStyle = p.skyTop;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, 26);
    ctx.fillStyle = p.sky;
    ctx.fillRect(0, 26, LOGICAL_WIDTH, 40);
    ctx.fillStyle = p.haze;
    ctx.fillRect(0, 66, LOGICAL_WIDTH, 15);

    drawPixelSun(ctx, 318, 28, 16, p.sun, p.gold);
    const visualTravel = waveSurfaceTravel(simulation.wave);
    const cloudShift = Math.floor((visualTravel * 0.018) % 440);
    drawCloud(ctx, 58 - cloudShift * 0.12, 29, p.white, p.haze);
    drawCloud(ctx, 212 - cloudShift * 0.06, 18, p.white, p.haze);
    drawCloud(ctx, 430 - cloudShift * 0.1, 42, p.white, p.haze);

    const islandShift = Math.floor((visualTravel * 0.035) % 450);
    ctx.fillStyle = p.distant;
    drawSteppedHill(ctx, -24 - islandShift * 0.06, 71, 120, 15);
    drawSteppedHill(ctx, 250 - islandShift * 0.04, 73, 152, 12);
    drawPalm(ctx, 42 - islandShift * 0.08, 61, p.deepInk, p.distant);
    drawBirds(ctx, 116 - islandShift * 0.025, 31, p.deepInk, 3);
  }

  drawSkyExtension(cameraY) {
    const height = clamp(Math.ceil(Number(cameraY) || 0) + 2, 0, 68);
    if (height <= 2) return;
    const ctx = this.ctx;
    const p = this.palette;
    ctx.save();
    ctx.fillStyle = p.skyTop;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, height);
    ctx.fillStyle = this.conditionId === "stormbreak" ? p.foamShade : p.white;
    ctx.globalAlpha = this.settings.highContrast ? 0.75 : 0.34;
    const count = this.conditionId === "twilightGlass" ? 12 : 7;
    for (let index = 0; index < count; index += 1) {
      const x = (17 + index * 53) % LOGICAL_WIDTH;
      const y = 4 + (index * 17) % Math.max(5, height - 4);
      ctx.fillRect(x, y, index % 5 === 0 ? 2 : 1, 1);
    }
    ctx.restore();
  }

  drawBackgroundAsset(simulation) {
    if (this.settings.highContrast) return false;
    const image = this.visualAssets?.backgrounds?.[this.conditionId];
    if (!image?.complete || !(image.naturalWidth > 0)) return false;
    const phase = backgroundParallaxPhase(simulation?.wave, this.settings.reducedMotion);
    if (phase === 0) {
      this.ctx.drawImage(image, 0, 0, LOGICAL_WIDTH, 80);
      return true;
    }

    // The 384px source strip was not authored as a tile. Alternate normal and
    // mirrored copies so matching source edges meet without a white seam while
    // the distant coast moves steadily left beneath Kaki's forward progress.
    const cycle = LOGICAL_WIDTH * 2;
    for (let x = -phase; x < LOGICAL_WIDTH; x += cycle) {
      this.ctx.drawImage(image, x, 0, LOGICAL_WIDTH, 80);
      this.ctx.save();
      this.ctx.translate(x + LOGICAL_WIDTH * 2, 0);
      this.ctx.scale(-1, 1);
      this.ctx.drawImage(image, 0, 0, LOGICAL_WIDTH, 80);
      this.ctx.restore();
    }
    return true;
  }

  drawTwilightSky(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    ctx.fillStyle = p.skyTop;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, 31);
    ctx.fillStyle = p.sky;
    ctx.fillRect(0, 31, LOGICAL_WIDTH, 35);
    ctx.fillStyle = p.haze;
    ctx.fillRect(0, 66, LOGICAL_WIDTH, 13);
    drawPixelSun(ctx, 321, 34, 12, p.sun, p.gold);
    ctx.fillStyle = p.white;
    for (let index = 0; index < 13; index += 1) {
      const x = (index * 43 + 17) % LOGICAL_WIDTH;
      const y = 8 + (index * 19) % 43;
      ctx.fillRect(x, y, index % 4 === 0 ? 2 : 1, 1);
    }
    const shift = Math.floor(waveSurfaceTravel(simulation.wave) * 0.025) % 460;
    ctx.fillStyle = p.distant;
    drawSteppedHill(ctx, -48 - shift * 0.025, 72, 178, 10);
    drawSteppedHill(ctx, 226 - shift * 0.018, 70, 190, 12);
    ctx.fillStyle = p.deepInk;
    ctx.fillRect(272 - shift * 0.03, 65, 34, 2);
    ctx.fillRect(280 - shift * 0.03, 61, 2, 6);
    drawBirds(ctx, 88 - shift * 0.02, 25, p.ink, 2);
  }

  drawStormSky(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    ctx.fillStyle = p.skyTop;
    ctx.fillRect(0, 0, LOGICAL_WIDTH, 27);
    ctx.fillStyle = p.sky;
    ctx.fillRect(0, 27, LOGICAL_WIDTH, 38);
    ctx.fillStyle = p.distant;
    ctx.fillRect(0, 65, LOGICAL_WIDTH, 15);
    const shift = Math.floor((waveSurfaceTravel(simulation.wave) * 0.02 + (this.settings.reducedMotion ? 0 : this.time * 5)) % 430);
    drawStormCloud(ctx, 24 - shift * 0.08, 16, p.deepInk, p.distant);
    drawStormCloud(ctx, 178 - shift * 0.04, 7, p.ink, p.distant);
    drawStormCloud(ctx, 342 - shift * 0.07, 22, p.deepInk, p.distant);
    if (!this.settings.reducedMotion) {
      ctx.fillStyle = p.haze;
      for (let x = (Math.floor(this.time * 34) % 17) - 17; x < LOGICAL_WIDTH; x += 19) ctx.fillRect(x, 43 + (x % 17), 1, 7);
    }
    ctx.fillStyle = p.deepInk;
    drawSteppedHill(ctx, -30, 72, 144, 12);
    drawPier(ctx, 291 - shift * 0.015, 69, p.deepInk);
  }

  drawBackWater(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    const player = simulation.player;
    const speedCap = rideSpeedCapFor(simulation);
    const speedRatio = clamp(Number(player?.speed ?? 0) / speedCap, 0, 1);
    const momentum = clamp(Number(player?.waveMomentum ?? 0), 0, 1);
    if (isHeroBarrelWave(simulation.wave)) {
      drawHeroBackWater(
        ctx,
        simulation,
        p,
        this.settings,
        this.wavePresentationClocks.backWater,
      );
      return;
    }
    ctx.fillStyle = p.waterDeep;
    ctx.fillRect(0, 78, LOGICAL_WIDTH, LOGICAL_HEIGHT - 78);

    const clock = this.settings.reducedMotion ? 0 : this.wavePresentationClocks.backWater;
    const horizonColor = this.conditionId === "twilightGlass" ? p.violet : this.conditionId === "stormbreak" ? p.foamShade : p.crest;
    ctx.save();
    ctx.strokeStyle = horizonColor;
    ctx.lineWidth = 1;
    ctx.globalAlpha = this.settings.highContrast ? 0.9 : 0.68;
    for (let segment = 0; segment < 12; segment += 1) {
      const length = 7 + ((segment * 7 + 5) % 11);
      const x = Math.round(((segment * 43 - clock * 0.12) % 450 + 450) % 450) - 28;
      const y = 79 + ((segment * 7) % 3);
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.quadraticCurveTo(x + length * 0.5, y - 2, x + length, y);
      ctx.stroke();
    }

    ctx.globalAlpha = this.settings.highContrast ? 0.42 : 0.22;
    for (let row = 0; row < 5; row += 1) {
      const baseY = 88 + row * 13;
      const rowClock = clock * (0.3 + row * 0.055);
      ctx.fillStyle = row < 2 ? p.waterLight : row < 4 ? p.water : p.crest;
      for (let segment = 0; segment < 7; segment += 1) {
        const x = Math.round(((segment * 73 + row * 29 - rowClock) % 500 + 500) % 500) - 58;
        const width = 7 + ((segment * 11 + row * 7) % 13) + Math.round(momentum * 3);
        const height = 2 + ((segment + row) % 2);
        const y = baseY + ((segment * 5 + row * 3) % 7) - 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + width * 0.45, y - height, x + width, y + 1);
        ctx.quadraticCurveTo(x + width * 0.55, y + height, x, y);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  drawWave(simulation) {
    if (isHeroBarrelWave(simulation.wave)) {
      drawHeroBarrelBack(
        this.ctx,
        simulation,
        this.palette,
        this.settings,
        this.visualAssets,
        this.wavePresentationClocks,
        (window) => this.drawPassedSkyBackdrop(simulation, window),
      );
      return;
    }
    drawLayeredWave(
      this.ctx,
      simulation,
      this.palette,
      this.settings,
      this.time,
      this.conditionId,
      this.visualAssets,
      this.wavePresentationClocks,
      (window) => {
        // Repaint a sky-only crop through the trailing opening in the same
        // camera space as the wave so the horizon remains welded together.
        this.drawPassedSkyBackdrop(simulation, window);
      },
    );
  }

  drawWaveFront(simulation) {
    drawHeroBarrelFront(
      this.ctx,
      simulation,
      this.palette,
      this.settings,
      this.visualAssets,
      this.wavePresentationClocks,
    );
  }

  drawPassedSkyBackdrop(simulation, window) {
    const ctx = this.ctx;
    const bottom = Math.round(window?.bottom ?? 104);
    // The sky painter owns only the authored strip above the horizon. Below it
    // the already-rendered backwater remains visible through the passed wave,
    // so the opening can never turn into the old white/haze shelf.
    this.drawSky(simulation);
    if (bottom <= 80) return;
    ctx.fillStyle = this.palette.water;
    ctx.globalAlpha = this.settings.highContrast ? 0.32 : 0.1;
    ctx.fillRect(0, 79, LOGICAL_WIDTH, Math.min(4, bottom - 79));
    ctx.globalAlpha = 1;
  }

  drawMaxSpeedFeedback(simulation) {
    // The hero face already carries converging perspective ribbons and board
    // spray. Full-screen streaks would flatten it back into horizontal bands.
    if (isHeroBarrelWave(simulation.wave)) return;
    const player = simulation.player;
    const speedCap = rideSpeedCapFor(simulation);
    const speedRatio = clamp(Number(player?.speed ?? 0) / speedCap, 0, 1);
    const intensity = smoothstep(0.68, 0.98, speedRatio);
    if (intensity <= 0.03 || player?.state === "complete") return;

    const ctx = this.ctx;
    const p = this.palette;
    const reduced = this.settings.reducedMotion;
    const fullPower = speedRatio >= 0.94;
    const streakCount = reduced ? 4 : 5 + Math.round(intensity * 5);
    const phase = reduced ? 0 : this.wavePresentationClocks.speedFeedback;
    ctx.save();
    ctx.globalAlpha = 0.22 + intensity * 0.42;
    for (let index = 0; index < streakCount; index += 1) {
      const lane = (index * 5 + 2) % 13;
      const y = 92 + lane * 8 + ((index * 7) % 3);
      const travel = ((index * 71 - phase * (0.72 + index % 3 * 0.12)) % 480 + 480) % 480;
      const x = travel - 42;
      const length = 6 + ((index * 7) % 9) + Math.round(intensity * 7);
      ctx.fillStyle = fullPower && index % 4 === 0 ? p.gold : index % 3 === 0 ? p.foam : p.crest;
      ctx.beginPath();
      ctx.moveTo(x, y + 1);
      ctx.lineTo(x + length, y - 2);
      ctx.lineTo(x + length - 3, y + 1);
      ctx.lineTo(x + 2, y + 3);
      ctx.closePath();
      ctx.fill();
      if (fullPower && index % 3 === 0) ctx.fillRect(Math.round(x + length - 2), y - 4, 2, 2);
    }
    ctx.restore();
  }

  drawImpactCavity(simulation) {
    if (this.impact <= 0) return;
    const player = simulation.player;
    const x = Math.round(player.state === "airborne" ? player.airX : player.x);
    const face = player.state === "airborne" ? player.landingFace : player.face;
    const y = Math.round(simulation.wave.ridingY(x, face));
    const size = Math.max(2, Math.round(this.impact * 7));
    this.ctx.fillStyle = this.palette.deepInk;
    this.ctx.fillRect(x - size, y - 1, size * 2, 3);
    this.ctx.fillStyle = this.palette.foam;
    this.ctx.fillRect(x - size - 2, y + 2, Math.max(2, size - 1), 2);
    this.ctx.fillRect(x + 3, y + 2, Math.max(2, size - 1), 2);
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
      const direction = Math.sign(player.travelDirection ?? 1) || 1;
      drawBoardSprite(this.ctx, x + direction * 12, y + 5, resolvedBoardAngle(player), simulation.board, this.palette, {
        compression: 1,
        direction,
        assets: this.visualAssets,
        airborne: true,
      });
      drawKittySprite(this.ctx, x - direction * 4, y - 1, player.bodyAngle, this.presentationPlayer(player), this.palette, { direction });
      if (player.stateTime > 0.62) drawEmbarrassedPaw(this.ctx, x - 2, Math.min(188, y + 13), this.palette);
      return;
    }

    const boardAngle = resolvedBoardAngle(player);
    const direction = Math.sign(player.travelDirection ?? player.takeoffDirection ?? 1) || 1;
    const mounted = Boolean(player.animalMount || player.mountKind || player.mountType);
    if (!mounted) {
      drawBoardWake(this.ctx, x, y + 2, boardAngle, simulation.board, player, this.palette, this.time, this.settings.reducedMotion);
      drawBoardSprite(this.ctx, x, y + 1, boardAngle, simulation.board, this.palette, {
        compression: player.compression,
        direction,
        assets: this.visualAssets,
        airborne: player.state === "airborne",
      });
    }
    drawKittySprite(this.ctx, x, y - (mounted ? 5 : 0), player.bodyAngle, this.presentationPlayer(player), this.palette, { direction });
  }

  presentationPlayer(player) {
    if (this.pumpRelease <= 0 && player.state !== "landing") return player;
    return {
      ...player,
      justPumped: this.pumpRelease > 0,
      lastLandingQuality: this.lastLandingQuality,
    };
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
    ctx.fillStyle = p.foamShade;
    ctx.fillRect(-23, -1, 46, 3);
    ctx.fillStyle = p.foam;
    ctx.fillRect(-17, -1, 34, 3);
    ctx.fillStyle = p.gold;
    ctx.fillRect(-8, -2, 16, 5);
    ctx.fillStyle = p.ink;
    for (let x = -20; x <= 20; x += 5) ctx.fillRect(x, 0, 2, 1);
    ctx.restore();
    if (this.settings.highContrast || String(this.settings.waveReadAssist).toLowerCase() === "full") drawPixelText(ctx, "LAND", player.airX, surfaceY + 5, { scale: 1, align: "center", color: p.gold, shadow: p.ink });
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
    if (!simulation.started) return;
    const ctx = this.ctx;
    const p = this.palette;
    const score = String(Math.round(simulation.score.total)).padStart(6, "0");
    const timed = simulation.mode?.timed !== false;
    const seconds = timed ? Math.ceil(simulation.timeRemaining) : null;
    const multiplier = simulation.currentMultiplier();
    const player = simulation.player;
    const guide = player.speedPotential ?? waveGuideAt(simulation.wave, player, simulation.board);
    const speedCap = rideSpeedCapFor(simulation);
    const speedTier = speedTierFor(player, simulation);

    panel(ctx, 5, 5, 90, 19, p.deepInk, p.waterDeep);
    drawPixelText(ctx, "SCORE", 10, 9, { color: p.foamShade, shadow: p.ink });
    drawPixelText(ctx, score, 89, 9, { scale: 2, spacing: 1, align: "right", color: p.white, shadow: p.ink });

    this.drawSpeedMeter(player, speedCap);
    this.drawTurboMeter(player);

    panel(ctx, 166, 5, 52, 19, p.deepInk, p.waterDeep);
    if (timed) {
      drawPixelText(ctx, `${seconds}`, 192, 9, { scale: 2, spacing: 1, align: "center", color: seconds <= 10 ? p.danger : p.sun, shadow: p.ink });
    } else {
      drawPixelText(ctx, "SET", 174, 11, { color: p.foamShade, shadow: p.ink });
      drawPixelText(ctx, `${simulation.endlessSet}`, 210, 9, { scale: 2, spacing: 1, align: "right", color: simulation.endlessSet >= simulation.tuning.endlessMaxSet ? p.danger : p.sun, shadow: p.ink });
    }

    panel(ctx, 288, 5, 91, 19, p.deepInk, p.waterDeep);
    drawPixelText(ctx, "PAWS", 293, 9, { color: p.foamShade, shadow: p.ink });
    for (let index = 0; index < simulation.tuning.maxWipeouts; index += 1) {
      drawPaw(ctx, 338 + index * 12, 10, index < simulation.tuning.maxWipeouts - simulation.wipeouts ? p.gold : p.danger, p.ink);
    }

    panel(ctx, 6, 190, 122, 20, p.deepInk, p.waterDeep);
    drawPixelText(ctx, speedTier.name, 11, 194, { color: speedTier.color === "gold" ? p.gold : speedTier.color === "danger" ? p.danger : p.foamShade, shadow: p.ink });
    ctx.fillStyle = p.ink;
    ctx.fillRect(69, 195, 51, 7);
    ctx.fillStyle = speedTier.level >= 4 ? p.gold : speedTier.level <= 0 ? p.danger : p.foamShade;
    ctx.fillRect(71, 197, Math.round(47 * speedTier.fill), 3);

    panel(ctx, 294, 190, 84, 20, p.deepInk, p.waterDeep);
    drawPixelText(ctx, "FLOW", 299, 195, { color: p.foamShade, shadow: p.ink });
    drawPixelText(ctx, `X${multiplier.toFixed(1)}`, 371, 195, { align: "right", color: multiplier > 2.2 ? p.gold : p.white, shadow: p.ink });

    if (player.state === "airborne") {
      this.drawAerialHud(simulation);
      this.drawLandingHud(simulation);
    } else if (player.tubeRide?.active) {
      this.drawTubeHud(player.tubeRide);
    } else if ((player.charge ?? 0) > 0.02) {
      panel(ctx, 144, 190, 96, 20, p.deepInk, p.waterDeep);
      drawPixelText(ctx, "PUMP", 150, 195, { color: p.foamShade, shadow: p.ink });
      ctx.fillStyle = p.ink;
      ctx.fillRect(182, 195, 50, 7);
      ctx.fillStyle = guide.pumpEfficiency > 0.6 ? p.gold : p.foamShade;
      ctx.fillRect(184, 197, Math.round(46 * clamp(player.charge, 0, 1)), 3);
    }

    if (simulation.assists.steering || simulation.assists.landing) {
      drawPixelText(ctx, "ASSIST", 270, 198, { align: "center", color: p.foamShade, shadow: p.ink });
    }
    this.drawTeachingOverlay(simulation);
  }

  drawTubeHud(tube) {
    const ctx = this.ctx;
    const p = this.palette;
    panel(ctx, 136, 190, 116, 20, p.deepInk, p.waterDeep, 0.94);
    drawPixelText(ctx, `TUBE ${Number(tube.time ?? 0).toFixed(1)}S`, 142, 195, {
      color: p.gold,
      shadow: p.ink,
    });
    drawPixelText(ctx, `+${Math.round(Number(tube.score) || 0)}`, 245, 195, {
      align: "right",
      color: p.white,
      shadow: p.ink,
    });
  }

  drawSpeedMeter(player, speedCap) {
    const ctx = this.ctx;
    const p = this.palette;
    const speedRatio = clamp(Number(player?.speed ?? 0) / Math.max(1, speedCap), 0, 1);
    panel(ctx, 101, 5, 58, 19, p.deepInk, p.waterDeep);
    drawPixelText(ctx, "SPEED", 106, 8, { color: speedRatio >= 0.94 ? p.gold : p.foamShade, shadow: p.ink });
    ctx.fillStyle = p.ink;
    ctx.fillRect(106, 17, 48, 4);
    ctx.fillStyle = speedRatio >= 0.94 ? p.gold : speedRatio >= 0.62 ? p.crest : p.foamShade;
    ctx.fillRect(107, 18, Math.round(46 * speedRatio), 2);
    if (speedRatio >= 0.94) {
      ctx.fillStyle = p.gold;
      ctx.fillRect(153, 8, 2, 2);
      ctx.fillRect(152, 9, 4, 1);
    }
  }

  drawTurboMeter(player) {
    const ctx = this.ctx;
    const p = this.palette;
    const level = clamp(Number(player?.turbo) || 0, 0, 1);
    const active = Boolean(player?.turboActive);
    const pulse = this.turboPulse > 0;
    panel(ctx, 224, 5, 58, 19, p.deepInk, p.waterDeep);
    drawPixelText(ctx, "TURBO", 229, 8, {
      color: active || pulse ? p.gold : level <= 0.02 ? p.danger : p.foamShade,
      shadow: p.ink,
    });
    if (pulse && this.turboRefillAmount > 0) {
      drawPixelText(ctx, `+${Math.round(this.turboRefillAmount * 100)}`, 277, 8, {
        align: "right",
        color: p.gold,
        shadow: p.ink,
      });
    }
    ctx.fillStyle = p.ink;
    ctx.fillRect(229, 17, 48, 4);
    ctx.fillStyle = active ? p.gold : level <= 0.02 ? p.danger : p.crest;
    ctx.fillRect(230, 18, Math.round(46 * level), 2);
  }

  drawAerialHud(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    const player = simulation.player;
    const provisional = provisionalView(simulation);
    const x = (player.airX ?? player.x) < 192 ? 246 : 7;
    panel(ctx, x, 29, 131, 27, p.deepInk, p.waterDeep, 0.9);
    drawPixelText(ctx, provisional.name, x + 65, 34, { align: "center", color: p.gold, shadow: p.ink });
    drawPixelText(ctx, `+${Math.round(provisional.score)}`, x + 65, 45, { align: "center", color: p.white, shadow: p.ink });
  }

  drawLandingHud(simulation) {
    const ctx = this.ctx;
    const p = this.palette;
    const player = simulation.player;
    const preview = player.landingPreview ?? simulation.tricks?.landingPreview ?? {};
    const target = Number(preview.targetAngle ?? simulation.wave.slopeAt(player.airX, player.landingFace));
    const current = Number(preview.boardAngle ?? preview.currentAngle ?? player.boardAngle);
    const error = Number.isFinite(preview.error) ? preview.error : Math.abs(normalizeAngle(current - target));
    panel(ctx, 139, 190, 106, 20, p.deepInk, p.waterDeep);
    drawPixelText(ctx, "LAND", 145, 195, { color: p.foamShade, shadow: p.ink });
    drawAlignmentBands(ctx, 178, 196, 53, error, p);
    drawTrendArrow(ctx, 234, 196, preview.improving, p);
  }

  drawTeachingOverlay(simulation) {
    const lesson = simulation.tutorial?.snapshot?.() ?? null;
    const qaText = String(simulation.qaControlHint ?? "").trim();
    if (!qaText && (!lesson?.enabled || lesson.complete)) return;
    const player = simulation.player;
    if (player.state === "wipeout" || player.state === "complete") return;
    const text = qaText || lesson.text;
    const subtext = qaText
      ? "DROP = SPEED / LIP = AIR"
      : lesson.hint;
    const playerX = player.state === "airborne" ? player.airX : player.x;
    const x = playerX < LOGICAL_WIDTH * 0.5 ? 197 : 6;
    const width = 181;
    const progress = qaText ? 0.18 : clamp(Number(lesson.progress) || 0, 0, 1);
    const step = qaText ? "SURF SCHOOL" : `SURF SCHOOL ${lesson.index}/${lesson.total}`;
    panel(this.ctx, x, 150, width, 38, this.palette.deepInk, this.palette.waterDeep, 0.92);
    drawPixelText(this.ctx, step, x + 6, 154, { color: this.palette.foamShade, shadow: this.palette.ink });
    drawPixelText(this.ctx, text, x + width / 2, 164, { align: "center", color: this.palette.white, shadow: this.palette.ink });
    drawPixelText(this.ctx, subtext, x + width / 2, 174, { align: "center", color: this.palette.gold, shadow: this.palette.ink });
    this.ctx.fillStyle = this.palette.ink;
    this.ctx.fillRect(x + 6, 183, width - 12, 3);
    this.ctx.fillStyle = this.palette.crest;
    this.ctx.fillRect(x + 7, 184, Math.round((width - 14) * progress), 1);
  }

  drawCallouts() {
    const ctx = this.ctx;
    const p = this.palette;
    const callout = this.activeCallout;
    if (callout.life <= 0) return;
    const age = callout.duration - callout.life;
    const outAlpha = smoothstep(0, 0.34, callout.life);
    const alpha = outAlpha;
    const rise = Math.round(smoothstep(0, 1.1, age) * 2);
    const toneColor = callout.tone === "wipeout" ? p.danger : callout.tone === "perfect" ? p.gold : callout.tone === "risk" ? p.sun : p.white;
    drawPixelText(ctx, callout.text, 192, 42 - rise, {
      scale: 2,
      spacing: 2,
      align: "center",
      color: toneColor,
      shadow: p.ink,
      alpha,
    });
    if (callout.subtext) {
      drawPixelText(ctx, callout.subtext, 192, 56 - rise, {
        align: "center",
        color: p.foam,
        shadow: p.ink,
        alpha,
      });
    }
  }

  pushCallout(text, subtext = "", tone = "flow", options = {}) {
    const nextText = String(text).trim();
    if (!nextText) return;
    const nextSubtext = String(subtext).trim();
    const duplicate = (callout) => callout.text === nextText && callout.subtext === nextSubtext;
    if (this.activeCallout.life > 0 && duplicate(this.activeCallout)) {
      this.activeCallout.life = Math.max(this.activeCallout.life, 1.1);
      return;
    }
    if (this.calloutQueue.some(duplicate)) return;

    const callout = createCallout();
    callout.text = nextText;
    callout.subtext = nextSubtext;
    callout.tone = tone;
    callout.channel = String(options.channel ?? "").trim();
    callout.priority = calloutPriority(tone);
    callout.sequence = this.calloutSequence;
    callout.enqueuedAt = this.time;
    this.calloutSequence += 1;
    callout.duration = tone === "hint"
      ? 2.8
      : tone === "perfect" || tone === "risk" || tone === "wipeout"
        ? 2.5
        : 2.25;
    callout.life = callout.duration;

    // A mechanic channel represents one evolving state machine. Remove its
    // queued predecessor even when another mechanic currently owns the active
    // slot, otherwise OPEN -> TUCK -> EXIT can replay after it is already over.
    if (callout.channel) {
      for (let index = this.calloutQueue.length - 1; index >= 0; index -= 1) {
        if (this.calloutQueue[index].channel === callout.channel) this.calloutQueue.splice(index, 1);
      }
    }
    if (this.activeCallout.life <= 0 && this.calloutGap <= 0) {
      callout.activatedAt = this.time;
      this.activeCallout = callout;
      return;
    }

    // State changes from one mechanic replace that mechanic's queued copy.
    // Preserve a single readable beat for the current state, then show the
    // newest truth instead of replaying stale entry/hold/exit messages.
    if (callout.channel && this.activeCallout.channel === callout.channel) {
      const activeAge = Math.max(0, this.time - this.activeCallout.activatedAt);
      if (activeAge >= CALLOUT_MIN_READ_TIME) {
        callout.activatedAt = this.time;
        this.activeCallout = callout;
      } else {
        this.activeCallout.life = Math.min(
          this.activeCallout.life,
          Math.max(0.28, CALLOUT_MIN_READ_TIME - activeAge),
        );
        this.calloutQueue.unshift(callout);
      }
      return;
    }

    // Urgent feedback may shorten an old low-priority hint, but never before
    // that hint has had a full readable beat. Only one callout is rendered.
    if (callout.priority >= 4 && callout.priority > this.activeCallout.priority) {
      const activeAge = Math.max(0, this.time - this.activeCallout.activatedAt);
      const requiredLife = Math.max(0, CALLOUT_MIN_READ_TIME - activeAge);
      this.activeCallout.life = Math.min(this.activeCallout.life, Math.max(0.28, requiredLife));
    }

    this.calloutQueue.push(callout);
    this.calloutQueue.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
    if (this.calloutQueue.length > CALLOUT_QUEUE_LIMIT) this.calloutQueue.length = CALLOUT_QUEUE_LIMIT;
  }

  activateNextCallout() {
    this.pruneStaleCallouts();
    const next = this.calloutQueue.shift();
    if (!next) return;
    next.activatedAt = this.time;
    this.activeCallout = next;
  }

  pruneStaleCallouts() {
    for (let index = this.calloutQueue.length - 1; index >= 0; index -= 1) {
      const callout = this.calloutQueue[index];
      if (this.time - callout.enqueuedAt > calloutMaxWait(callout.tone)) {
        this.calloutQueue.splice(index, 1);
      }
    }
  }

  spawnSpray(x, y, count, force) {
    const profile = getBoardVisualProfile(this.currentBoard);
    const adjustedCount = Math.max(1, Math.round(count * (this.settings.reducedMotion ? 0.45 : 1)));
    for (let index = 0; index < adjustedCount; index += 1) {
      const direction = index % 2 ? -1 : 1;
      const heavy = profile.spray === "heavy";
      const round = profile.spray === "round";
      this.spawnParticle(
        x + (Math.random() - 0.5) * 12,
        y + (Math.random() - 0.5) * 4,
        direction * (5 + Math.random() * (heavy ? 19 : 28)) * force - 9,
        -(10 + Math.random() * (heavy ? 25 : 34)) * force,
        0.32 + Math.random() * 0.32,
        index % 4 === 0 ? this.palette.foamShade : this.palette.foam,
        round || (heavy && index % 3 === 0) || Math.random() > 0.82 ? 2 : 1,
        66,
        0.9,
        "spray",
        index % 3 === 0,
      );
    }
  }

  spawnSeamGlints(x, y, count) {
    const amount = this.settings.reducedMotion ? Math.ceil(count * 0.45) : count;
    for (let index = 0; index < amount; index += 1) {
      this.spawnParticle(x - 17 + index * 4, y - 3 + (index & 1) * 3, -5 + index, -7 - (index % 3) * 2, 0.38, index & 1 ? this.palette.crest : this.palette.gold, index % 4 === 0 ? 2 : 1, 18, 0.3, "star", true);
    }
  }

  spawnTrickMarks(x, y, id = "", count = 6) {
    const key = String(id).toLowerCase();
    const color = key.includes("tail") ? this.palette.danger : key.includes("varial") ? this.palette.violet : key.includes("twist") || key.includes("signature") ? this.palette.gold : this.palette.crest;
    const amount = this.settings.reducedMotion ? Math.ceil(count * 0.4) : count;
    for (let index = 0; index < amount; index += 1) {
      const angle = (index / Math.max(1, amount)) * Math.PI * 2;
      this.spawnParticle(x + Math.cos(angle) * 11, y + Math.sin(angle) * 7, Math.cos(angle) * 10, Math.sin(angle) * 7 - 4, 0.42, color, index % 3 === 0 ? 2 : 1, 8, 0.15, "star", true);
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

function drawBirds(ctx, x, y, color, count) {
  ctx.fillStyle = color;
  for (let index = 0; index < count; index += 1) {
    const px = Math.round(x + index * 17);
    const py = y + (index & 1) * 5;
    ctx.fillRect(px, py, 3, 1);
    ctx.fillRect(px + 3, py + 1, 2, 1);
    ctx.fillRect(px + 5, py, 3, 1);
  }
}

function drawStormCloud(ctx, x, y, dark, light) {
  const px = Math.round(x);
  ctx.fillStyle = dark;
  ctx.fillRect(px, y + 7, 64, 9);
  ctx.fillRect(px + 11, y + 3, 37, 8);
  ctx.fillRect(px + 23, y, 18, 7);
  ctx.fillStyle = light;
  ctx.fillRect(px + 4, y + 6, 47, 3);
}

function drawPier(ctx, x, y, color) {
  const px = Math.round(x);
  ctx.fillStyle = color;
  ctx.fillRect(px, y, 74, 3);
  for (let post = 5; post < 72; post += 15) ctx.fillRect(px + post, y, 3, 13);
  ctx.fillRect(px + 42, y - 8, 14, 8);
  ctx.fillRect(px + 47, y - 13, 4, 6);
}

function conditionIdFor(simulation, settings) {
  const candidate = simulation?.condition?.id ?? simulation?.condition ?? settings?.condition ?? "goldenCoast";
  return candidate === "twilightGlass" || candidate === "stormbreak" ? candidate : "goldenCoast";
}

function isTubeId(id) {
  const value = String(id ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return value.includes("tube") || value.includes("soularch");
}

function paletteForCondition(conditionId) {
  if (conditionId === "twilightGlass") return PALETTES.twilightGlass ?? PALETTES.standard;
  if (conditionId === "stormbreak") return PALETTES.stormbreak ?? PALETTES.standard;
  return PALETTES.standard;
}

function rideSpeedCapFor(simulation) {
  const published = Number(simulation?.baseRideSpeedCap?.());
  if (Number.isFinite(published) && published > 0) return published;
  const tuningMax = Number(simulation?.tuning?.maxSpeed ?? TUNING.maxSpeed);
  const boardMax = Number(simulation?.board?.maxSpeed ?? 1);
  return Math.max(1, tuningMax * boardMax);
}

function speedTierFor(player, simulation) {
  const explicit = String(player.speedTier ?? "").toUpperCase().replace(/_/g, " ");
  const names = ["STALLING", "GLIDING", "FAST", "FLYING", "BLASTING"];
  const maxSpeed = Math.max(90, (simulation.tuning?.maxSpeed ?? 138) * (simulation.board?.maxSpeed ?? 1));
  const fill = clamp(((player.speed ?? 0) - 34) / (maxSpeed - 34), 0, 1);
  let level = Math.min(4, Math.floor(fill * 5));
  if (names.includes(explicit)) level = names.indexOf(explicit);
  return { name: names[level], level, fill, color: level === 0 ? "danger" : level >= 3 ? "gold" : "foam" };
}

function provisionalView(simulation) {
  const player = simulation.player;
  const view = simulation.tricks?.viewData ?? simulation.tricks?.view ?? simulation.tricks?.provisional ?? {};
  const name = player.provisionalTrickName ?? view.name ?? view.trickName ?? "FLOATY POP";
  const score = player.provisionalScore ?? view.score ?? view.value ?? 0;
  return { name: String(name).toUpperCase().slice(0, 22), score: Number(score) || 0 };
}

function resolvedBoardAngle(player) {
  if (Number.isFinite(player.boardAngle)) return player.boardAngle;
  return Number(player.bodyAngle ?? 0) + Number(player.boardRelativeAngle ?? 0);
}

function normalizeAngle(angle) {
  let value = (angle + Math.PI) % (Math.PI * 2);
  if (value < 0) value += Math.PI * 2;
  return value - Math.PI;
}

function drawAlignmentBands(ctx, x, y, width, error, p) {
  ctx.fillStyle = p.foamShade;
  ctx.fillRect(x, y, width, 5);
  ctx.fillStyle = p.white;
  ctx.fillRect(x + Math.round(width * 0.2), y, Math.round(width * 0.6), 5);
  ctx.fillStyle = p.gold;
  ctx.fillRect(x + Math.round(width * 0.39), y - 1, Math.round(width * 0.22), 7);
  const marker = clamp(Math.round((error / 1.18) * (width / 2)), 0, width / 2);
  ctx.fillStyle = error < 0.13 ? p.gold : error < 0.48 ? p.white : p.danger;
  ctx.fillRect(Math.round(x + width / 2 + marker - 1), y - 2, 3, 9);
}

function drawTrendArrow(ctx, x, y, improving, p) {
  ctx.fillStyle = improving ? p.gold : p.danger;
  if (improving) {
    ctx.fillRect(x + 2, y - 2, 2, 2);
    ctx.fillRect(x + 1, y, 4, 2);
    ctx.fillRect(x, y + 2, 6, 2);
  } else {
    ctx.fillRect(x, y - 2, 6, 2);
    ctx.fillRect(x + 1, y, 4, 2);
    ctx.fillRect(x + 2, y + 2, 2, 2);
  }
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
  return {
    text: "",
    subtext: "",
    tone: "flow",
    life: 0,
    duration: 1,
    priority: 0,
    sequence: 0,
    enqueuedAt: 0,
    activatedAt: 0,
    channel: "",
  };
}

function calloutPriority(tone) {
  if (tone === "wipeout") return 5;
  if (tone === "risk") return 4;
  if (tone === "perfect") return 3;
  if (tone === "flow") return 2;
  return 1;
}

function calloutMaxWait(tone) {
  if (tone === "wipeout") return 3.8;
  if (tone === "risk" || tone === "perfect") return 3;
  if (tone === "flow") return 1.9;
  return 1.5;
}
