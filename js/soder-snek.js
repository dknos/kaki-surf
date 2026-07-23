import { drawAtlasFrame } from "./asset-drawing.js";
import { clamp } from "./math.js";

export const SODER_SNEK_FRAME_NAMES = Object.freeze([
  "neutralRide", "regularRide", "goofyRide", "highLineCarve",
  "downFaceCarve", "deepCompression", "pumpRelease", "snekSnap",
  "coilCutback", "lipAnticipation", "serpentTuck", "takeoffUncoil",
  "risingStretch", "floatingApex", "controlledFall", "landingAnticipation",
  "perfectImpactCoil", "cleanImpact", "wobble", "perfectRideAwayA",
  "perfectRideAwayB", "perfectRideAwayC", "perfectRideAwayD", "cleanRideAwayA",
  "cleanRideAwayB", "cleanRideAwayC", "cleanRideAwayD", "switchLanding",
  "turboLanding", "wipeoutA", "wipeoutB", "wipeoutC",
  "curlWipeout", "tailKnotTumble", "tongueFlop", "victory",
  "disappointed", "turboIgnition", "turboSurge", "turboRedline",
  "turboCooking", "turboRelease", "tongueTapReach", "tongueTapHold",
  "tongueTapRelease", "tailCoilReach", "tailCoilHold", "tailCoilRelease",
  "shedFlipOpen", "shedFlipSeparate", "shedFlipReconnect", "soderSpiralWindup",
  "soderSpiralMaximum", "soderSpiralSpot", "dolphinMount", "sharkStartled",
]);

export const SODER_SNEK_ATLAS = Object.freeze({
  columns: 8,
  rows: 7,
  cellWidth: 64,
  cellHeight: 64,
  width: 512,
  height: 448,
  frameCount: SODER_SNEK_FRAME_NAMES.length,
});

export const SODER_SNEK_VISUAL_BOUNDS = Object.freeze({
  left: -24,
  right: 24,
  top: -56,
  bottom: 8,
});

const LANDING_FRAMES = Object.freeze({
  landingPawUp: "perfectRideAwayA",
  landingPowerCrouch: "perfectRideAwayB",
  landingStar: "perfectRideAwayC",
  landingLookBack: "perfectRideAwayD",
  landingLowRide: "cleanRideAwayA",
  landingTailBalance: "cleanRideAwayB",
  landingPawSweep: "cleanRideAwayC",
  landingQuickSettle: "cleanRideAwayD",
});

const TURBO_FRAMES = Object.freeze({
  turboIgnition: "turboIgnition",
  turboSurge: "turboSurge",
  turboRedline: "turboRedline",
  turboCooking: "turboCooking",
  turboRelease: "turboRelease",
});

export function resolveSoderSnekFrame(player = {}, { reducedMotion = false } = {}) {
  const presentation = player.presentationPoseId;
  if (LANDING_FRAMES[presentation]) return LANDING_FRAMES[presentation];
  if (TURBO_FRAMES[presentation]) return TURBO_FRAMES[presentation];
  if (player.animalMount === "dolphin") return "dolphinMount";
  if (player.soderReaction === "shark") return "sharkStartled";

  const maneuver = player.maneuver?.id ?? "";
  if (maneuver === "snap") return "snekSnap";
  if (maneuver === "cutback") return "coilCutback";
  if (maneuver === "tubeTuck" || maneuver === "soulArch" || player.tubeRide?.active) return "serpentTuck";

  switch (player.state) {
    case "lip":
      return "lipAnticipation";
    case "airborne":
      if (player.airVY < -24) return player.stateTime < 0.13 ? "takeoffUncoil" : "risingStretch";
      if (Math.abs(Number(player.airVY) || 0) <= 24) return "floatingApex";
      return landingIsRecoverable(player.landingPreview) ? "landingAnticipation" : "controlledFall";
    case "landing":
      if (player.landingDirection && player.landingDirection !== player.takeoffDirection) return "switchLanding";
      return player.landingQuality === "perfect" || player.lastLandingQuality === "perfect"
        ? "perfectImpactCoil"
        : "cleanImpact";
    case "wobble":
      return "wobble";
    case "wipeout":
      return wipeoutFrame(player);
    case "complete":
      return player.resultWon === false ? "disappointed" : "victory";
    default:
      if ((Number(player.turboCookingTimer) || 0) > 0) return "turboCooking";
      if (player.turboActive) {
        if (player.turboTier === "redline") return "turboRedline";
        if (player.turboTier === "surge") return "turboSurge";
        return "turboIgnition";
      }
      if (player.pumpReleased || player.justPumped) return "pumpRelease";
      if ((Number(player.compression) || 0) > 0.58 || (Number(player.charge) || 0) > 0.55) return "deepCompression";
      if ((Number(player.faceVelocity) || 0) < -0.22) return "highLineCarve";
      if ((Number(player.faceVelocity) || 0) > 0.22) return "downFaceCarve";
      if (player.ridingStance === "goofy") return "goofyRide";
      if (reducedMotion) return "regularRide";
      return quantizedAnimationFrame(player.stateTime, 10) & 1 ? "neutralRide" : "regularRide";
  }
}

export function quantizedAnimationFrame(time, framesPerSecond = 10) {
  return Math.max(0, Math.floor((Number(time) || 0) * clamp(framesPerSecond, 8, 12)));
}

export function drawSoderSnekSprite(ctx, x, y, angle, player, palette, options = {}) {
  const frame = resolveSoderSnekFrame(player, {
    reducedMotion: Boolean(options.reducedMotion),
  });
  const direction = Math.sign(options.direction ?? player.travelDirection ?? 1) || 1;
  const stanceDirection = Math.sign(
    options.stanceDirection ?? (player.ridingStance === "goofy" ? -1 : 1),
  ) || 1;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(snapAngle(angle));
  ctx.scale(direction * stanceDirection, 1);
  const drawn = drawAtlasFrame(ctx, options.assets, "soderSnek", frame, 0, 2, {
    scale: 0.76,
  });
  if (!drawn) drawSoderSnekFallback(ctx, player, palette, frame);
  ctx.restore();
  return frame;
}

function drawSoderSnekFallback(ctx, player, palette, frame) {
  const green = "#539738";
  const greenDark = "#2b5c32";
  const belly = "#a6703d";
  const tongue = "#de6997";
  const cheek = "#b56698";
  const teal = "#59b1c1";
  const face = "#eee1cd";
  const ink = palette?.ink ?? "#161f2f";
  const crouch = /Impact|Compression|Tuck|Coil|wobble/i.test(frame) ? 3 : 0;
  const stretch = /takeoff|rising|victory/i.test(frame) ? 3 : 0;
  const speed = /turbo|Cooking/i.test(frame);

  ctx.fillStyle = ink;
  ctx.fillRect(-21, -10 + crouch, 22, 8);
  ctx.fillStyle = greenDark;
  ctx.fillRect(-19, -8 + crouch, 20, 4);
  ctx.fillStyle = ink;
  ctx.fillRect(-7, -25 + crouch - stretch, 14, 25 + stretch);
  ctx.fillStyle = green;
  ctx.fillRect(-5, -23 + crouch - stretch, 10, 22 + stretch);
  ctx.fillStyle = belly;
  ctx.fillRect(-2, -18 + crouch - stretch, 5, 17 + stretch);
  for (let segment = -15; segment < -1; segment += 4) {
    ctx.fillStyle = "#ca9b5b";
    ctx.fillRect(-2, segment + crouch - stretch, 5, 1);
  }

  ctx.fillStyle = ink;
  ctx.fillRect(-16, -49 + crouch - stretch, 32, 27);
  ctx.fillRect(-13, -52 + crouch - stretch, 26, 4);
  ctx.fillStyle = greenDark;
  ctx.fillRect(-14, -47 + crouch - stretch, 28, 23);
  ctx.fillStyle = green;
  ctx.fillRect(-11, -49 + crouch - stretch, 22, 7);
  ctx.fillStyle = face;
  ctx.fillRect(-9, -40 + crouch - stretch, 18, 14);
  ctx.fillStyle = teal;
  ctx.fillRect(-8, -42 + crouch - stretch, 16, 4);
  ctx.fillRect(-6, -39 + crouch - stretch, 4, 2);

  ctx.fillStyle = ink;
  ctx.fillRect(-11, -46 + crouch - stretch, 3, 7);
  ctx.fillRect(8, -46 + crouch - stretch, 3, 7);
  ctx.fillStyle = "#fff8e0";
  ctx.fillRect(-10, -45 + crouch - stretch, 1, 2);
  ctx.fillRect(9, -45 + crouch - stretch, 1, 2);
  ctx.fillStyle = cheek;
  ctx.fillRect(-14, -36 + crouch - stretch, 4, 4);
  ctx.fillRect(10, -36 + crouch - stretch, 4, 4);

  ctx.fillStyle = ink;
  ctx.fillRect(-6, -34 + crouch - stretch, 4, 1);
  ctx.fillRect(3, -34 + crouch - stretch, 4, 1);
  ctx.fillRect(-2, -30 + crouch - stretch, 5, 1);
  ctx.fillStyle = "#cd4d67";
  ctx.fillRect(-8, -31 + crouch - stretch, 2, 1);
  ctx.fillRect(7, -31 + crouch - stretch, 2, 1);

  ctx.fillStyle = ink;
  ctx.fillRect(-3, -50 + crouch - stretch, speed ? 17 : 7, 6);
  ctx.fillStyle = tongue;
  ctx.fillRect(-2, -49 + crouch - stretch, speed ? 15 : 5, 4);
  if (!speed) ctx.fillRect(1, -45 + crouch - stretch, 3, 7);

  drawFallbackPaw(ctx, -10, -19 + crouch, ink);
  drawFallbackPaw(ctx, 7, -18 + crouch, ink);
}

function drawFallbackPaw(ctx, x, y, ink) {
  ctx.fillStyle = ink;
  ctx.fillRect(x, y, 6, 6);
  ctx.fillStyle = "#fbf8e0";
  ctx.fillRect(x + 1, y + 1, 4, 4);
}

function wipeoutFrame(player) {
  if (player.wipeoutCause === "curl") return "curlWipeout";
  const phase = quantizedAnimationFrame(player.stateTime, 8) % 3;
  return phase === 0 ? "wipeoutA" : phase === 1 ? "tailKnotTumble" : "tongueFlop";
}

function landingIsRecoverable(preview = {}) {
  const error = Number(preview.error);
  const recovery = Number(preview.bands?.recovery);
  return Number.isFinite(error) && Number.isFinite(recovery) && recovery > 0 && error <= recovery;
}

function snapAngle(angle = 0) {
  const step = Math.PI / 16;
  return Math.round((Number(angle) || 0) / step) * step;
}
