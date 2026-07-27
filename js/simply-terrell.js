import { drawAtlasFrame } from "./asset-drawing.js";
import {
  SODER_SNEK_FRAME_NAMES,
  resolveSoderSnekFrame,
} from "./soder-snek.js";

// SimplyTerrell shares the canonical 56-pose rider timeline while keeping an
// independent renderer and atlas. The internal frame vocabulary never affects
// scoring, controls, saves, or player-facing move names.
export const SIMPLY_TERRELL_FRAME_NAMES = SODER_SNEK_FRAME_NAMES;

export const SIMPLY_TERRELL_ATLAS = Object.freeze({
  columns: 8,
  rows: 7,
  cellWidth: 64,
  cellHeight: 64,
  width: 512,
  height: 448,
  frameCount: SIMPLY_TERRELL_FRAME_NAMES.length,
});

export const SIMPLY_TERRELL_VISUAL_BOUNDS = Object.freeze({
  left: -24,
  right: 24,
  top: -58,
  bottom: 8,
});

export function resolveSimplyTerrellFrame(player = {}, options = {}) {
  return resolveSoderSnekFrame(player, options);
}

export function drawSimplyTerrellSprite(ctx, x, y, angle, player, palette, options = {}) {
  const frame = resolveSimplyTerrellFrame(player, {
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
  const drawn = drawAtlasFrame(ctx, options.assets, "simplyTerrell", frame, 0, 2, {
    scale: 0.76,
  });
  if (!drawn) drawSimplyTerrellFallback(ctx, frame, palette);
  ctx.restore();
  return frame;
}

function drawSimplyTerrellFallback(ctx, frame, palette) {
  const ink = palette?.ink ?? "#161f2f";
  const locs = "#171421";
  const locHighlight = "#553426";
  const skin = "#a9633f";
  const skinLight = "#d08a5b";
  const mouth = "#85323d";
  const navy = "#20294c";
  const navyLight = "#343d68";
  const shoulder = "#969aa8";
  const red = "#bb344f";
  const shoe = "#aba9a9";
  const crouch = /Compression|Impact|Tuck|Coil|wobble|Hold|Mount/i.test(frame) ? 4 : 0;
  const stretch = /takeoff|rising|victory|Cooking/i.test(frame) ? 3 : 0;
  const lean = /Cutback|downFace|SpiralMaximum|wipeoutA/i.test(frame)
    ? 3
    : /highLine|Snap|SpiralWindup|wipeoutB/i.test(frame) ? -3 : 0;
  const bodyX = lean;
  const bodyY = -27 + crouch - stretch;
  const headX = Math.round(lean * 0.65);
  const headY = bodyY - 20;

  // Two independent board-contact legs and shoes.
  ctx.fillStyle = ink;
  ctx.fillRect(bodyX - 8, bodyY + 17, 7, 18 - crouch);
  ctx.fillRect(bodyX + 2, bodyY + 17, 7, 18 - crouch);
  ctx.fillStyle = navy;
  ctx.fillRect(bodyX - 7, bodyY + 18, 5, 16 - crouch);
  ctx.fillRect(bodyX + 3, bodyY + 18, 5, 16 - crouch);
  ctx.fillStyle = ink;
  ctx.fillRect(bodyX - 12, 5, 11, 4);
  ctx.fillRect(bodyX + 2, 5, 11, 4);
  ctx.fillStyle = shoe;
  ctx.fillRect(bodyX - 10, 5, 8, 2);
  ctx.fillRect(bodyX + 3, 5, 8, 2);

  // Loose navy stage jacket with the source-reference shoulder panels.
  ctx.fillStyle = ink;
  ctx.fillRect(bodyX - 11, bodyY - 2, 22, 23);
  ctx.fillStyle = navy;
  ctx.fillRect(bodyX - 9, bodyY, 18, 19);
  ctx.fillStyle = navyLight;
  ctx.fillRect(bodyX - 7, bodyY + 10, 14, 4);
  ctx.fillStyle = shoulder;
  ctx.fillRect(bodyX - 10, bodyY, 5, 5);
  ctx.fillRect(bodyX + 6, bodyY, 5, 5);
  // Lead arm stays clearly outside the torso in a balanced surf posture.
  const gestureUp = /victory|Star|Release|Cooking/i.test(frame);
  const gestureOut = /Snap|Cutback|wobble|wipeout|Spiral/i.test(frame);
  const handX = bodyX - (gestureOut ? 22 : gestureUp ? 17 : 20);
  const handY = bodyY + (gestureUp ? -10 : gestureOut ? 2 : 8);
  const elbowX = bodyX - 14;
  const elbowY = Math.round((bodyY + 4 + handY) / 2);
  ctx.fillStyle = ink;
  ctx.fillRect(
    Math.min(handX + 2, elbowX),
    Math.min(handY, elbowY) - 3,
    Math.abs(elbowX - handX) + 4,
    Math.abs(elbowY - handY) + 7,
  );
  ctx.fillRect(
    Math.min(elbowX, bodyX - 8) - 3,
    Math.min(elbowY, bodyY + 3),
    Math.abs(bodyX - 8 - elbowX) + 7,
    Math.abs(bodyY + 3 - elbowY) + 5,
  );
  ctx.fillStyle = navy;
  ctx.fillRect(
    Math.min(handX + 2, elbowX) + 1,
    Math.min(handY, elbowY) - 2,
    Math.abs(elbowX - handX) + 2,
    Math.abs(elbowY - handY) + 5,
  );
  ctx.fillStyle = ink;
  ctx.fillRect(handX - 1, handY - 1, 6, 6);
  ctx.fillStyle = skin;
  ctx.fillRect(handX, handY, 4, 4);
  ctx.fillStyle = skinLight;
  ctx.fillRect(handX + 1, handY, 2, 1);

  // Trail arm reaches the opposite side for a readable balance pose.
  ctx.fillStyle = ink;
  ctx.fillRect(bodyX + 8, bodyY + 2, 14, 11);
  ctx.fillStyle = navy;
  ctx.fillRect(bodyX + 9, bodyY + 4, 12, 7);
  ctx.fillStyle = ink;
  ctx.fillRect(bodyX + 18, bodyY + 7, 6, 6);
  ctx.fillStyle = skin;
  ctx.fillRect(bodyX + 19, bodyY + 8, 4, 4);

  // Loc silhouette, face, and warm comedian expression.
  ctx.fillStyle = locs;
  ctx.fillRect(headX - 12, headY - 3, 24, 23);
  ctx.fillRect(headX - 14, headY + 4, 5, 24);
  ctx.fillRect(headX + 10, headY + 3, 5, 23);
  ctx.fillRect(headX - 9, headY - 6, 18, 6);
  ctx.fillStyle = locHighlight;
  ctx.fillRect(headX - 11, headY, 3, 18);
  ctx.fillRect(headX + 8, headY - 1, 3, 20);
  ctx.fillStyle = "#693725";
  ctx.fillRect(headX - 2, headY + 15, 5, bodyY - headY - 14);
  ctx.fillStyle = skin;
  ctx.fillRect(headX - 8, headY + 2, 16, 15);
  ctx.fillStyle = skinLight;
  ctx.fillRect(headX - 6, headY + 3, 5, 3);
  ctx.fillStyle = ink;
  ctx.fillRect(headX - 5, headY + 8, 2, 2);
  ctx.fillRect(headX + 3, headY + 8, 2, 2);
  ctx.fillRect(headX - 3, headY + 13, 7, 3);
  ctx.fillStyle = "#f3ddc2";
  ctx.fillRect(headX - 2, headY + 13, 5, 1);
  ctx.fillStyle = mouth;
  ctx.fillRect(headX - 1, headY + 14, 3, 1);
  ctx.fillStyle = skinLight;
  ctx.fillRect(headX, headY + 15, 1, 1);
  ctx.fillStyle = red;
  ctx.fillRect(bodyX - 4, bodyY, 9, 2);
}

function snapAngle(angle = 0) {
  const step = Math.PI / 16;
  return Math.round(Number(angle || 0) / step) * step;
}
