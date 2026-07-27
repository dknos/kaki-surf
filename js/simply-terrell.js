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
  const silver = "#d8dbe2";
  const shoe = "#aba9a9";
  const crouch = /Compression|Impact|Tuck|Coil|wobble|Hold|Mount/i.test(frame) ? 4 : 0;
  const stretch = /takeoff|rising|victory|Cooking/i.test(frame) ? 3 : 0;
  const lean = /Cutback|downFace|SpiralMaximum|wipeoutA/i.test(frame)
    ? 3
    : /highLine|Snap|SpiralWindup|wipeoutB/i.test(frame) ? -3 : 0;
  const bodyX = lean;
  const bodyY = -27 + crouch - stretch;
  const headX = Math.round(lean * 0.65);
  const headY = bodyY - 23;

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
  ctx.fillStyle = red;
  ctx.fillRect(bodyX - 2, bodyY, 5, 4);

  // Free gesturing arm.
  const gestureUp = /victory|Star|Release|Cooking/i.test(frame);
  const gestureOut = /Snap|Cutback|wobble|wipeout|Spiral/i.test(frame);
  const handX = bodyX - (gestureOut ? 16 : 12);
  const handY = bodyY + (gestureUp ? -8 : gestureOut ? 6 : 11);
  ctx.fillStyle = ink;
  ctx.fillRect(Math.min(bodyX - 10, handX), Math.min(bodyY + 3, handY), 8, Math.abs(handY - bodyY - 3) + 7);
  ctx.fillStyle = navy;
  ctx.fillRect(Math.min(bodyX - 9, handX + 1), Math.min(bodyY + 4, handY + 1), 6, Math.abs(handY - bodyY - 3) + 5);
  ctx.fillStyle = ink;
  ctx.fillRect(handX - 1, handY - 1, 6, 6);
  ctx.fillStyle = skin;
  ctx.fillRect(handX, handY, 4, 4);
  ctx.fillStyle = skinLight;
  ctx.fillRect(handX + 1, handY, 2, 1);

  // Microphone arm stays close to the face in every state.
  ctx.fillStyle = ink;
  ctx.fillRect(bodyX + 8, bodyY + 3, 7, 15);
  ctx.fillStyle = navy;
  ctx.fillRect(bodyX + 9, bodyY + 4, 5, 13);
  ctx.fillStyle = skin;
  ctx.fillRect(headX + 8, headY + 16, 5, 5);
  ctx.fillStyle = ink;
  ctx.fillRect(headX + 10, headY + 12, 3, 10);
  ctx.fillStyle = silver;
  ctx.fillRect(headX + 8, headY + 9, 5, 4);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(headX + 9, headY + 9, 2, 1);

  // Loc silhouette, face, and warm comedian expression.
  ctx.fillStyle = locs;
  ctx.fillRect(headX - 12, headY - 3, 24, 23);
  ctx.fillRect(headX - 14, headY + 4, 5, 24);
  ctx.fillRect(headX + 10, headY + 3, 5, 23);
  ctx.fillRect(headX - 9, headY - 6, 18, 6);
  ctx.fillStyle = locHighlight;
  ctx.fillRect(headX - 11, headY, 3, 18);
  ctx.fillRect(headX + 8, headY - 1, 3, 20);
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
}

function snapAngle(angle = 0) {
  const step = Math.PI / 16;
  return Math.round(Number(angle || 0) / step) * step;
}
