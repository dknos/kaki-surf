import { clamp, lerp } from "./math.js";
import { drawPixelText } from "./pixel-font.js";
import { drawAtlasFrame } from "./asset-drawing.js";
import { isBoatKind, WORLD_LAYER_CONFIG } from "./world-catalog.js";
import { projectWorldX } from "./world-collision.js";
import { whaleForegroundMask, whaleFrameMetadata } from "./whale-contract.js";

export { drawAtlasFrame } from "./asset-drawing.js";

const TRAFFIC_FRAMES = Object.freeze({
  cargoShip: ["boats", "cargoShip"],
  sailboat: ["boats", "sailboat"],
  fishingBoat: ["boats", "fishingBoat"],
  tugboat: ["boats", "tugboat"],
  speedboat: ["boats", "speedboat"],
  jetSki: ["boats", "jetSki"],
  rescueCraft: ["boats", "rescueCraft"],
  gullFlock: ["birds", "flock"],
  ternFlock: ["birds", "ternBank"],
  cormorantFlock: ["birds", "cormorantDive"],
  pelican: ["birds", "pelicanSkim"],
  propPlane: ["airTraffic", "propPlane"],
  seaplane: ["airTraffic", "seaplane"],
  helicopter: ["airTraffic", "helicopter"],
  bannerPlane: ["airTraffic", "bannerPlane"],
});

const POWERUP_HALO = Object.freeze({
  mangoRush: "mangoHalo",
  moonPop: "moonHalo",
  starFoam: "starHalo",
});

const CARRIER_ACTIVITY_PHASES = new Set(["deckActivity", "launch", "airshow"]);
const BIRD_SCATTER_PHASES = new Set(["scatter", "dodge"]);
const DROP_DRAW_PHASES = new Set(["dropApproach", "dropDrop"]);
const WHALE_FOAM_PHASES = new Set(["blow", "breach", "splash"]);
const BIRD_SCATTER_FRAME = Object.freeze(["birds", "scatter"]);
const TERN_BANK_FRAME = Object.freeze(["birds", "ternBank"]);
const CORMORANT_BANK_FRAME = Object.freeze(["birds", "cormorantDive"]);
const PELICAN_COURIER_FRAME = Object.freeze(["birds", "pelicanCourier"]);
const GULL_COURIER_FRAME = Object.freeze(["birds", "gullFlap"]);
const DOLPHIN_VISUAL_FRAMES = Object.freeze({
  telegraph: Object.freeze(["dolphin", "offer"]),
  approach: Object.freeze(["dolphin", "approach"]),
  catchable: Object.freeze(["dolphin", "offer"]),
  mounted: Object.freeze(["dolphin", "mountedGlide"]),
  dismount: Object.freeze(["dolphin", "dismount"]),
  depart: Object.freeze(["dolphin", "approach"]),
});
const SHARK_VISUAL_FRAMES = Object.freeze({
  telegraph: Object.freeze(["shark", "finTelegraph"]),
  crossing: Object.freeze(["shark", "crossing"]),
  retreat: Object.freeze(["shark", "retreat"]),
  splash: Object.freeze(["shark", "comicSplash"]),
  fallback: Object.freeze(["shark", "deepShadow"]),
});
const WHALE_VISUAL_FRAMES = Object.freeze({
  distant: Object.freeze(["whale", "distantShadow"]),
  blow: Object.freeze(["whale", "blowTelegraph"]),
  breach: Object.freeze(["whale", "breach"]),
  ramp: Object.freeze(["whale", "swellLift"]),
  mounted: Object.freeze(["whale", "rideableBack"]),
  dismount: Object.freeze(["whale", "breachAnticipation"]),
  splash: Object.freeze(["whale", "giantSplash"]),
  depart: Object.freeze(["whale", "departure"]),
});

export function drawWorldTraffic(ctx, simulation, assets, palette, layer, alpha = 1, settings = {}, pass = "all") {
  const world = simulation?.world;
  if (!world?.forEachTraffic) return;
  const config = WORLD_LAYER_CONFIG[layer];
  if (!config) return;
  const camera = interpolatedCamera(world, alpha);
  world.forEachTraffic(layer, (entity) => {
    const renderBand = entity.renderBand || (isBoatKind(entity.kind) ? "waterBack" : "skyTraffic");
    const watercraft = isBoatKind(entity.kind) || entity.activity === "race";
    if (pass === "background" && renderBand === "playfieldFront") return;
    if (pass === "foreground" && renderBand !== "playfieldFront") return;
    const x = projectWorldX(
      lerp(entity.previousWorldX, entity.worldX, alpha),
      camera,
      config.parallax,
    );
    if (watercraft && !watercraftClearsBreaker(entity, x, simulation)) return;
    const y = lerp(entity.previousY, entity.y, alpha) + trafficBob(entity, settings);
    const visualDirection = trafficScreenDirection(entity, world, layer);
    const frame = trafficFrame(entity);
    if (frame) {
      const baseScale = layer === "far" ? 0.52 : layer === "mid" ? watercraft ? 0.58 : 0.72 : 1;
      const drawn = drawAtlasFrame(ctx, assets, frame[0], frame[1], x, y, {
        flipX: visualDirection < 0,
        scale: baseScale * entity.scale,
        alpha: layer === "far" ? 0.68 : 0.94,
      });
      if (!drawn) drawTrafficFallback(ctx, entity, x, y, palette, layer);
      if (entity.kind === "bannerPlane" && entity.message) {
        drawLiveBannerText(
          ctx,
          entity.message,
          x,
          y,
          visualDirection,
          palette,
          baseScale * entity.scale,
          entity.animationTime,
          settings,
        );
      }
      drawTrafficActivity(ctx, entity, assets, palette, x, y, baseScale * entity.scale, visualDirection);
    } else {
      drawTrafficFallback(ctx, entity, x, y, palette, layer);
    }
  });
}

export function watercraftClearsBreaker(entity, x, simulation) {
  const curlX = Number(simulation?.wave?.curlX);
  if (!Number.isFinite(curlX)) return true;
  const race = entity?.activity === "race" || String(entity?.phase ?? "").startsWith("race");
  const curlMargin = race ? 132 : 112;
  if (x <= curlX + curlMargin) return false;
  const playerX = Number(simulation?.player?.x);
  const playerMargin = race ? 90 : 64;
  return !Number.isFinite(playerX) || Math.abs(x - playerX) >= playerMargin;
}

export function drawWorldFoamGates(ctx, simulation, assets, palette, alpha = 1, settings = {}) {
  const world = simulation?.world;
  if (!world?.forEachFoamGate) return;
  const camera = interpolatedCamera(world, alpha);
  world.forEachFoamGate((gate) => {
    const x = projectWorldX(lerp(gate.previousWorldX, gate.worldX, alpha), camera, 1);
    const y = lerp(gate.previousY, gate.y, alpha);
    const pulse = settings.reducedMotion ? 0 : Math.sin((gate.phaseTime ?? 0) * 7 + (gate.eventSeed & 7)) * 0.08;
    const scale = clamp((gate.radius ?? 12) / 10 + pulse, 0.88, 1.72);
    if (settings.highContrast) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = palette.ink;
      ctx.beginPath();
      ctx.arc(Math.round(x), Math.round(y), Math.round((gate.radius ?? 12) + 2), 0, Math.PI * 2);
      ctx.arc(Math.round(x), Math.round(y), Math.max(2, Math.round((gate.radius ?? 12) - 4)), 0, Math.PI * 2, true);
      ctx.fill("evenodd");
      ctx.restore();
    }
    const drawn = drawAtlasFrame(ctx, assets, "powerups", "starHalo", x, y, {
      scale,
      alpha: 0.78,
      rotation: settings.reducedMotion ? 0 : (gate.phaseTime ?? 0) * 0.18,
    });
    if (!drawn) drawFoamGateFallback(ctx, x, y, gate.radius ?? 12, palette);
  });
}

export function drawCarrierEvent(ctx, simulation, assets, palette, settings = {}) {
  const carrier = simulation?.world?.carrier;
  if (!carrier?.active) return;
  const direction = carrier.direction || 1;
  const reduced = Boolean(settings.reducedMotion);
  const phaseProgress = reduced ? 0.5 : (carrier.phaseTime % 1);
  const baseX = direction > 0 ? 302 : 82;
  const x = baseX + Math.sin(carrier.phaseTime * 0.7) * (reduced ? 0 : 2);
  const y = 73 + Math.sin(carrier.phaseTime * 1.4) * (reduced ? 0 : 1);
  const frame = carrier.phase === "haze" ? "hazeSilhouette" : "festivalCarrier";
  const carrierDrawn = drawAtlasFrame(ctx, assets, "carrier", frame, x, y, {
    flipX: direction < 0,
    scale: carrier.phase === "haze" ? 0.76 : 0.92,
    alpha: carrier.phase === "haze" ? clamp(0.28 + carrier.phaseTime * 0.18, 0.28, 0.7) : 0.88,
  });
  if (!carrierDrawn) drawCarrierFallback(ctx, carrier, x, y, palette);
  if (CARRIER_ACTIVITY_PHASES.has(carrier.phase)) {
    drawAtlasFrame(ctx, assets, "carrier", "islandLights", x + direction * 9, y - 14, {
      scale: 0.34,
      alpha: 0.62 + phaseProgress * 0.3,
    });
    drawAtlasFrame(ctx, assets, "carrier", "radarDish", x - direction * 12, y - 14, {
      flipX: direction < 0,
      scale: 0.27,
      rotation: reduced ? 0 : carrier.phaseTime * 1.7,
    });
  }
  if (carrier.phase === "launch" || carrier.phase === "airshow") {
    drawAtlasFrame(ctx, assets, "airTraffic", carrier.phase === "launch" ? "launchClimb" : "airshowFormation", 190, carrier.phase === "airshow" ? 55 : 42, {
      flipX: direction < 0,
      scale: carrier.phase === "launch" ? 0.7 : 0.92,
      alpha: 0.92,
    });
    if (carrier.phase === "airshow") {
      drawAtlasFrame(ctx, assets, "uiOrnaments", "blankRibbon", 192, 29, {
        scale: 0.62,
        scaleX: 1.35,
        alpha: 0.88,
      });
      drawPixelText(ctx, "FLEET AIRSHOW", 192, 26, {
        align: "center",
        color: palette.gold,
        shadow: palette.ink,
      });
    }
  }
}

export function drawWorldWildlife(ctx, simulation, assets, palette, alpha = 1, foreground = false, settings = {}) {
  const world = simulation?.world;
  if (!world?.forEachWildlife) return;
  const camera = interpolatedCamera(world, alpha);
  world.forEachWildlife((entity) => {
    const front = entity.phase === "dismount" || entity.phase === "splash";
    if (front !== foreground) return;
    let x = projectWorldX(lerp(entity.previousWorldX, entity.worldX, alpha), camera, 1);
    let y = lerp(entity.previousY, entity.y, alpha);
    const [family, frame] = wildlifeFrame(entity);
    let scale = entity.kind === "whale" ? 1 : entity.kind === "dolphin" ? 0.9 : 0.82;
    let rotation = 0;
    if (entity.kind === "whale") {
      const metadata = whaleFrameMetadata(entity);
      drawWhaleRearSpray(ctx, entity, x, metadata, palette, settings);
      x += metadata.drawAnchor.x;
      y = metadata.drawAnchor.y;
      scale = metadata.phaseScale;
      rotation = metadata.rotation;
    }
    const drawn = drawAtlasFrame(ctx, assets, family, frame, x, y, {
      flipX: entity.direction < 0,
      scale,
      rotation,
      alpha: entity.phase === "distant" ? 0.48 : 1,
    });
    if (!drawn) drawWildlifeFallback(ctx, entity, x, y, palette);
    if (entity.kind === "shark" && entity.phase === "telegraph") {
      drawAtlasFrame(ctx, assets, "shark", "deepShadow", x - entity.direction * 5, y + 9, {
        flipX: entity.direction < 0,
        scale: 0.76,
        alpha: 0.36,
      });
    }
    if (entity.kind === "dolphin" && (entity.phase === "telegraph" || entity.phase === "catchable")) {
      drawAtlasFrame(ctx, assets, "powerups", "starHalo", x, y - 2, {
        scale: 1.42 + Math.sin(entity.phaseTime * 7) * 0.08,
        alpha: 0.46,
      });
    } else if (entity.kind === "shark" && entity.phase === "telegraph") {
      drawDangerWake(ctx, x, y, palette, entity.phaseTime);
    }
  });
}

export function drawWorldWildlifeContact(ctx, simulation, palette, alpha = 1, settings = {}) {
  const world = simulation?.world;
  if (!world?.forEachWildlife) return;
  const camera = interpolatedCamera(world, alpha);
  world.forEachWildlife((entity) => {
    if (entity.kind !== "whale") return;
    const metadata = whaleFrameMetadata(entity);
    const baseX = projectWorldX(lerp(entity.previousWorldX, entity.worldX, alpha), camera, 1);
    const x = baseX + metadata.foamOrigin.x;
    const waterY = metadata.foamOrigin.y;
    const mask = whaleForegroundMask(metadata);
    const width = mask.halfWidth;
    const rippleSeed = Number(entity.eventSeed) || 0;
    ctx.save();
    // This is the foreground water mask. It deliberately covers the lower
    // body before contact foam is added, so no phase can hover over its anchor.
    ctx.fillStyle = palette.waterDeep;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(Math.round(x - width), Math.round(waterY + 2));
    for (let step = 0; step <= 8; step += 1) {
      const px = x - width + width * 2 * step / 8;
      const ripple = ((step * 7 + rippleSeed) % 5) - 2;
      ctx.lineTo(Math.round(px), Math.round(waterY + ripple));
    }
    ctx.lineTo(Math.round(x + width - 5), Math.round(waterY + mask.depth));
    ctx.lineTo(Math.round(x - width + 7), Math.round(waterY + mask.depth - 1));
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.waterLight;
    ctx.globalAlpha = 0.34;
    ctx.fillRect(Math.round(x - width + 5), Math.round(waterY + 2), Math.round(width * 0.54), 1);
    ctx.fillRect(Math.round(x + 2), Math.round(waterY + 3), Math.round(width * 0.64), 1);
    drawWhaleContactFoam(ctx, entity, x, waterY, palette, settings);
    ctx.restore();
  });
}

function drawWhaleContactFoam(ctx, entity, x, waterY, palette, settings = {}) {
  const phase = String(entity.phase ?? "distant");
  const foamy = WHALE_FOAM_PHASES.has(phase) || phase === "ramp" || phase === "mounted";
  const pulse = settings.reducedMotion ? 0 : Math.round(Math.sin(entity.phaseTime * 5) * 2);
  ctx.fillStyle = palette.waterLight;
  ctx.globalAlpha = phase === "distant" ? 0.18 : 0.36;
  ctx.fillRect(Math.round(x - 28), Math.round(waterY), 20, 1);
  ctx.fillRect(Math.round(x + 5), Math.round(waterY + 1), 25, 1);
  if (foamy) {
    ctx.fillStyle = palette.foamShade;
    ctx.globalAlpha = 0.76;
    ctx.fillRect(Math.round(x - 34 - pulse), Math.round(waterY - 2), 24, 2);
    ctx.fillRect(Math.round(x + 9), Math.round(waterY - 1), 28 + pulse, 2);
    ctx.fillStyle = palette.foam;
    ctx.globalAlpha = 0.82;
    ctx.fillRect(Math.round(x - 22), Math.round(waterY - 4), 13, 2);
    ctx.fillRect(Math.round(x + 14 + pulse), Math.round(waterY - 3), 10, 2);
  }
}

function drawWhaleRearSpray(ctx, entity, x, metadata, palette, settings = {}) {
  if (!WHALE_FOAM_PHASES.has(entity.phase)) return;
  const amount = settings.reducedMotion ? 3 : 6;
  ctx.save();
  ctx.fillStyle = palette.foamShade;
  ctx.globalAlpha = 0.58;
  for (let index = 0; index < amount; index += 1) {
    const direction = entity.direction || 1;
    const dx = direction * (-18 + index * 7);
    const lift = 4 + ((index * 5 + Math.floor(entity.phaseTime * 12)) % 13);
    ctx.fillRect(Math.round(x + dx), Math.round(metadata.foamOrigin.y - lift), index % 3 === 0 ? 2 : 1, 2);
  }
  ctx.restore();
}

export function drawWorldPowerups(ctx, simulation, assets, palette, alpha = 1) {
  const world = simulation?.world;
  if (!world?.forEachPowerup) return;
  const camera = interpolatedCamera(world, alpha);
  world.forEachPowerup((entity) => {
    const x = projectWorldX(lerp(entity.previousWorldX, entity.worldX, alpha), camera, 1);
    const y = lerp(entity.previousY, entity.y, alpha);
    const bob = Math.sin(entity.phaseTime * 9 + (entity.eventSeed & 7)) * 2;
    const drawn = drawAtlasFrame(ctx, assets, "powerups", entity.kind, x, y + bob, {
      flipX: entity.direction < 0,
      scale: entity.phase === "telegraph" ? 0.72 : 1,
      alpha: entity.phase === "missed" ? 0.5 : 1,
    });
    if (!drawn) drawPowerupFallback(ctx, entity.kind, x, y + bob, palette, 1);
    if (entity.phase === "telegraph" || entity.phase === "available") {
      const halo = POWERUP_HALO[entity.kind];
      drawAtlasFrame(ctx, assets, "powerups", halo, x, y + bob, {
        scale: 1.18 + Math.sin(entity.phaseTime * 7) * 0.08,
        alpha: 0.48,
      });
    }
  });
}

function interpolatedCamera(world, alpha) {
  return lerp(
    world.context?.previousCameraWorldX ?? world.lastCameraWorldX ?? 0,
    world.context?.cameraWorldX ?? world.lastCameraWorldX ?? 0,
    alpha,
  );
}

/**
 * Traffic faces its actual on-screen motion. This keeps a slow watercraft from
 * appearing to reverse when the surfer's camera overtakes it, while preserving
 * world-space parallax and simulation direction.
 */
export function trafficScreenDirection(entity, world, layer) {
  const config = WORLD_LAYER_CONFIG[layer];
  if (!config) return entity?.direction < 0 ? -1 : 1;
  const previousCamera = world?.context?.previousCameraWorldX ?? world?.lastCameraWorldX ?? 0;
  const currentCamera = world?.context?.cameraWorldX ?? world?.lastCameraWorldX ?? previousCamera;
  const previousX = projectWorldX(entity?.previousWorldX ?? entity?.worldX ?? 0, previousCamera, config.parallax);
  const currentX = projectWorldX(entity?.worldX ?? entity?.previousWorldX ?? 0, currentCamera, config.parallax);
  const delta = currentX - previousX;
  if (Math.abs(delta) > 1e-6) return delta < 0 ? -1 : 1;
  return entity?.direction < 0 ? -1 : 1;
}

function trafficBob(entity, settings) {
  if (settings.reducedMotion) return 0;
  const seed = (entity.eventSeed & 31) * 0.17;
  if (entity.animation === "bob" || entity.animation === "heel" || entity.animation === "race") {
    return Math.sin(entity.animationTime * 3 + seed) * (entity.animation === "race" ? 1.6 : 1);
  }
  if (entity.animation === "hover" || entity.animation === "flap") {
    return Math.sin(entity.animationTime * 5 + seed) * 1.4;
  }
  return 0;
}

function trafficFrame(entity) {
  if (BIRD_SCATTER_PHASES.has(entity.reaction) || BIRD_SCATTER_PHASES.has(entity.phase)) {
    return BIRD_SCATTER_FRAME;
  }
  if (entity.reaction === "bank" || entity.phase === "bank") {
    return entity.kind === "cormorantFlock" ? CORMORANT_BANK_FRAME : TERN_BANK_FRAME;
  }
  if (entity.activity === "courier" || String(entity.phase).startsWith("courier")) {
    return entity.kind === "pelican" ? PELICAN_COURIER_FRAME : GULL_COURIER_FRAME;
  }
  return TRAFFIC_FRAMES[entity.kind];
}

function drawTrafficActivity(ctx, entity, assets, palette, x, y, scale, visualDirection = entity.direction) {
  const courier = entity.activity === "courier" || String(entity.phase).startsWith("courier");
  if (courier && entity.payload) {
    const pickupX = x - visualDirection * 4 * scale;
    const pickupY = y + 8 * scale;
    const drawn = drawAtlasFrame(ctx, assets, "powerups", entity.payload, pickupX, pickupY, {
      scale: Math.max(0.42, scale * 0.58),
      alpha: entity.phase === "courierTelegraph" ? 0.68 : 1,
    });
    if (!drawn) drawPowerupFallback(ctx, entity.payload, pickupX, pickupY, palette, Math.max(0.42, scale * 0.58));
  }
  if (entity.activity === "race" || String(entity.phase).startsWith("race")) {
    const wakeDirection = visualDirection < 0 ? 1 : -1;
    ctx.save();
    ctx.globalAlpha = 0.72;
    ctx.fillStyle = palette.foamShade;
    for (let index = 0; index < 3; index += 1) {
      const width = 8 + index * 5;
      const wakeX = x + wakeDirection * (13 + index * 7) * scale;
      ctx.fillRect(Math.round(wakeX - (wakeDirection < 0 ? width : 0)), Math.round(y + 7 * scale + index * 2), width, 1);
    }
    ctx.restore();
  }
  if (entity.activity === "aircraftDrop" && DROP_DRAW_PHASES.has(entity.phase)) {
    const dropX = x - visualDirection * 7;
    const dropY = y + 17;
    const drawn = drawAtlasFrame(ctx, assets, "airTraffic", "parachuteDrop", dropX, dropY, {
      scale: Math.max(0.44, scale * 0.68),
      alpha: 0.9,
    });
    if (!drawn) {
      ctx.save();
      ctx.strokeStyle = palette.ink;
      ctx.fillStyle = palette.foam;
      ctx.beginPath();
      ctx.arc(Math.round(dropX), Math.round(dropY - 4), 5, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
      ctx.fillRect(Math.round(dropX - 1), Math.round(dropY - 3), 2, 7);
      ctx.restore();
    }
  }
}

function drawLiveBannerText(ctx, message, x, y, direction, palette, scale, time, settings) {
  const text = String(message).toUpperCase().slice(0, 18);
  const clothWidth = clamp(text.length * 3 + 12, 48, 70) * scale;
  const clothHeight = 12 * scale;
  const sway = settings.reducedMotion ? 0 : Math.sin(time * 3.2) * 1.2 * scale;
  const centerX = x + direction * (15 + clothWidth * 0.5) * scale;
  const left = centerX - clothWidth * 0.5;
  const right = centerX + clothWidth * 0.5;
  const top = y - 5 * scale + sway;
  const nearEdge = direction > 0 ? left : right;

  ctx.save();
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + direction * 4 * scale, y - 2 * scale);
  ctx.quadraticCurveTo(x + direction * 10 * scale, y - 5 * scale - sway, nearEdge, top + 2 * scale);
  ctx.stroke();
  ctx.fillStyle = palette.foam;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(right, top + sway * 0.25);
  ctx.lineTo(right - direction * 2 * scale, top + clothHeight + sway * 0.45);
  ctx.lineTo(centerX, top + clothHeight - sway * 0.25);
  ctx.lineTo(left + direction * 2 * scale, top + clothHeight + sway * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.foamShade;
  ctx.fillRect(Math.round(left + 2), Math.round(top + clothHeight - 2), Math.max(2, Math.round(clothWidth - 4)), 1);
  ctx.restore();

  const textX = centerX;
  const textY = top + 3 * scale;
  drawPixelText(ctx, text, textX, textY, {
    align: "center",
    spacing: 0,
    color: palette.ink,
    shadow: null,
    alpha: 0.94,
  });
}

function wildlifeFrame(entity) {
  if (entity.kind === "dolphin") {
    return DOLPHIN_VISUAL_FRAMES[entity.phase] ?? DOLPHIN_VISUAL_FRAMES.approach;
  }
  if (entity.kind === "shark") {
    if (entity.phase === "depart") return entity.hit ? SHARK_VISUAL_FRAMES.splash : SHARK_VISUAL_FRAMES.retreat;
    return SHARK_VISUAL_FRAMES[entity.phase] ?? SHARK_VISUAL_FRAMES.fallback;
  }
  return WHALE_VISUAL_FRAMES[entity.phase] ?? WHALE_VISUAL_FRAMES.distant;
}

function drawTrafficFallback(ctx, entity, x, y, palette, layer) {
  ctx.save();
  ctx.globalAlpha = layer === "far" ? 0.55 : 0.82;
  ctx.fillStyle = palette.ink;
  const size = layer === "far" ? 2 : 3;
  const kind = String(entity.kind).toLowerCase();
  if (kind.includes("flock") || kind === "pelican") {
    ctx.fillRect(Math.round(x - size * 2), Math.round(y), size * 2, 1);
    ctx.fillRect(Math.round(x), Math.round(y - 1), size * 2, 1);
    ctx.fillRect(Math.round(x - 1), Math.round(y), 2, 1);
  } else if (kind.includes("boat") || kind.includes("craft") || kind === "jetski" || kind === "tugboat" || kind === "cargoship") {
    ctx.beginPath();
    ctx.moveTo(x - size * 3, y - 1);
    ctx.lineTo(x + size * 3, y - 1);
    ctx.lineTo(x + size * 2, y + size);
    ctx.lineTo(x - size * 2, y + size);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = palette.foamShade;
    ctx.fillRect(Math.round(x - size * 4), Math.round(y + size + 1), size * 3, 1);
  } else if (kind.includes("plane") || kind === "helicopter") {
    ctx.fillRect(Math.round(x - size * 3), Math.round(y), size * 6, 2);
    ctx.fillRect(Math.round(x - 1), Math.round(y - size), 2, size * 2 + 2);
  } else {
    ctx.fillRect(Math.round(x - size), Math.round(y - 1), size * 2, 2);
  }
  if (kind === "fishschool") {
    ctx.fillStyle = palette.foam;
    ctx.fillRect(Math.round(x - 5), Math.round(y - 3), 3, 1);
    ctx.fillRect(Math.round(x + 2), Math.round(y - 5), 3, 1);
  }
  ctx.restore();
}

function drawWildlifeFallback(ctx, entity, x, y, palette) {
  const direction = entity.direction < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(direction, 1);
  ctx.globalAlpha = entity.phase === "distant" ? 0.48 : 0.92;
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = 2;
  if (entity.kind === "dolphin") {
    ctx.fillStyle = palette.waterLight;
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 7, -0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.ink;
    ctx.beginPath();
    ctx.moveTo(-3, -5);
    ctx.lineTo(-8, -13);
    ctx.lineTo(3, -6);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-29, -8);
    ctx.lineTo(-25, 1);
    ctx.lineTo(-30, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(13, -2, 9, 2);
    ctx.fillRect(10, -3, 2, 2);
  } else if (entity.kind === "shark") {
    ctx.fillStyle = palette.deepInk;
    ctx.beginPath();
    ctx.ellipse(0, 2, 24, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2, 0);
    ctx.lineTo(4, -16);
    ctx.lineTo(10, 1);
    ctx.fill();
  } else {
    ctx.fillStyle = palette.deepInk;
    ctx.beginPath();
    ctx.ellipse(0, 2, 35, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = palette.foamShade;
    ctx.fillRect(7, 8, 22, 3);
    if (WHALE_FOAM_PHASES.has(entity.phase)) {
      ctx.fillStyle = palette.foam;
      ctx.fillRect(-9, -21, 3, 13);
      ctx.fillRect(-15, -17, 7, 3);
      ctx.fillRect(-7, -18, 8, 3);
    }
  }
  ctx.restore();
}

function drawPowerupFallback(ctx, kind, x, y, palette, scale) {
  const color = kind === "mangoRush"
    ? palette.gold
    : kind === "moonPop"
      ? (palette.violet ?? palette.waterLight)
      : palette.foam;
  const label = kind === "mangoRush" ? "M" : kind === "moonPop" ? "O" : "S";
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(scale, scale);
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  drawPixelText(ctx, label, 0, -2, { align: "center", color: palette.ink });
  ctx.restore();
}

function drawFoamGateFallback(ctx, x, y, radius, palette) {
  ctx.save();
  ctx.strokeStyle = palette.foam;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), Math.max(7, radius), 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = palette.foamShade;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(Math.round(x), Math.round(y), Math.max(5, radius - 3), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCarrierFallback(ctx, carrier, x, y, palette) {
  const direction = carrier.direction < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.scale(direction, 1);
  ctx.globalAlpha = carrier.phase === "haze" ? 0.5 : 0.82;
  ctx.fillStyle = palette.deepInk;
  ctx.beginPath();
  ctx.moveTo(-45, -4);
  ctx.lineTo(42, -4);
  ctx.lineTo(30, 11);
  ctx.lineTo(-34, 11);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = palette.foamShade;
  ctx.fillRect(-31, -8, 50, 4);
  ctx.fillStyle = palette.waterLight;
  ctx.fillRect(3, -20, 15, 12);
  ctx.fillStyle = palette.gold;
  ctx.fillRect(7, -16, 2, 2);
  ctx.fillRect(13, -16, 2, 2);
  ctx.fillStyle = palette.foam;
  ctx.fillRect(-42, 13, 58, 2);
  ctx.restore();
}

function drawDangerWake(ctx, x, y, palette, time) {
  const pulse = Math.floor(time * 8) & 1;
  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.fillStyle = palette.danger;
  for (let index = 0; index < 4; index += 1) {
    const width = 8 + index * 5;
    ctx.fillRect(Math.round(x - width - index * 3 - pulse), Math.round(y + 6 + index * 3), width, 1);
  }
  ctx.restore();
}
