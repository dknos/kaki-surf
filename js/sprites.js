import { clamp } from "./math.js";
import { drawAtlasFrame } from "./asset-drawing.js";

const BOARD_PROFILES = Object.freeze({
  foamPuff: Object.freeze({ half: 17, thickness: 6, wake: 0.86, spray: "round", flex: 1.25 }),
  mangoFish: Object.freeze({ half: 16, thickness: 4, wake: 1, spray: "slash", flex: 0.62 }),
  moonLog: Object.freeze({ half: 22, thickness: 4, wake: 1.34, spray: "heavy", flex: 0.84 }),
});

const POSES = Object.freeze({
  neutralRide: pose(),
  highLineCarve: pose({ crouch: 1, lean: -2, headX: 2, leftPaw: [-12, -12], rightPaw: [7, -10], legSpread: 6 }),
  downFaceCarve: pose({ crouch: 2, lean: 3, headX: 3, leftPaw: [-8, -14], rightPaw: [10, -9], legSpread: 6 }),
  snap: pose({ crouch: 2, lean: -4, headX: 4, leftPaw: [-13, -15], rightPaw: [8, -7], legSpread: 7, expression: "focus" }),
  cutback: pose({ crouch: 1, lean: 4, headX: -2, leftPaw: [-6, -8], rightPaw: [12, -15], legSpread: 7, expression: "focus" }),
  compression: pose({ crouch: 5, headY: 3, leftPaw: [-9, -7], rightPaw: [6, -7], legSpread: 5, squash: 1 }),
  release: pose({ stretch: 3, headY: -2, leftPaw: [-12, -17], rightPaw: [9, -17], legSpread: 6, expression: "bright" }),
  lip: pose({ crouch: 3, lean: -2, headX: 3, leftPaw: [-11, -10], rightPaw: [7, -13], legSpread: 6, expression: "focus" }),
  takeoff: pose({ stretch: 4, lean: -2, headY: -3, leftPaw: [-13, -16], rightPaw: [9, -18], legSpread: 7, expression: "bright" }),
  rise: pose({ stretch: 3, headY: -2, leftPaw: [-12, -15], rightPaw: [8, -17], legSpread: 6 }),
  apex: pose({ crouch: 1, float: 2, leftPaw: [-12, -14], rightPaw: [9, -14], legSpread: 7, expression: "bright" }),
  fall: pose({ crouch: 2, headY: 1, leftPaw: [-9, -11], rightPaw: [7, -11], legSpread: 6, expression: "focus" }),
  frontRail: pose({ crouch: 4, headY: 2, headX: 2, leftPaw: [-10, -2], rightPaw: [6, -8], legSpread: 3, expression: "focus" }),
  tailGrab: pose({ crouch: 3, headY: 1, headX: -1, leftPaw: [-7, -9], rightPaw: [-14, -2], legSpread: 3, expression: "focus" }),
  varial: pose({ float: 3, stretch: 1, leftPaw: [-14, -18], rightPaw: [10, -18], legSpread: 5, expression: "bright" }),
  kakiTwist: pose({ crouch: 2, float: 2, lean: 3, leftPaw: [3, -13], rightPaw: [-5, -10], legSpread: 4, expression: "bright" }),
  floater: pose({ crouch: 2, lean: -1, leftPaw: [-12, -13], rightPaw: [9, -12], legSpread: 7, expression: "focus" }),
  tubeTuck: pose({ crouch: 5, headY: 4, headX: -2, leftPaw: [-7, -6], rightPaw: [4, -7], legSpread: 3, squash: 1, expression: "focus" }),
  landingAnticipation: pose({ crouch: 4, headY: 2, leftPaw: [-10, -9], rightPaw: [7, -9], legSpread: 7, expression: "focus" }),
  perfectLanding: pose({ crouch: 5, headY: 3, leftPaw: [-13, -12], rightPaw: [10, -12], legSpread: 7, squash: 1, expression: "bright" }),
  cleanLanding: pose({ crouch: 3, headY: 1, leftPaw: [-11, -11], rightPaw: [8, -11], legSpread: 6 }),
  wobble: pose({ crouch: 2, lean: 2, leftPaw: [-15, -18], rightPaw: [12, -17], legSpread: 8, foldedEar: true, expression: "wide" }),
  wipeoutA: pose({ loose: true, lean: 5, float: 3, leftPaw: [-15, -16], rightPaw: [12, -5], legSpread: 9, foldedEar: true, expression: "wide" }),
  wipeoutB: pose({ loose: true, lean: -5, float: -1, leftPaw: [-11, -4], rightPaw: [13, -17], legSpread: 8, foldedEar: true, expression: "squint" }),
  wipeoutC: pose({ loose: true, crouch: 3, headY: 4, leftPaw: [-15, -9], rightPaw: [12, -8], legSpread: 10, foldedEar: true, expression: "wide" }),
  victory: pose({ stretch: 2, headY: -2, leftPaw: [-12, -18], rightPaw: [8, -22], legSpread: 5, expression: "bright" }),
  disappointed: pose({ crouch: 2, headY: 2, leftPaw: [-7, -9], rightPaw: [4, -9], legSpread: 4, foldedEar: true, expression: "squint" }),
});

const POSE_ALIASES = Object.freeze({
  neutral: "neutralRide",
  ride: "neutralRide",
  neutralride: "neutralRide",
  high: "highLineCarve",
  highcarve: "highLineCarve",
  highlinecarve: "highLineCarve",
  down: "downFaceCarve",
  downcarve: "downFaceCarve",
  downfacecarve: "downFaceCarve",
  frontside: "snap",
  frontsidesnap: "snap",
  backside: "cutback",
  backsidecutback: "cutback",
  pumpcompression: "compression",
  pumpcharge: "compression",
  pumprelease: "release",
  lipanticipation: "lip",
  landinganticipation: "landingAnticipation",
  perfect: "perfectLanding",
  clean: "cleanLanding",
  frontrailgrab: "frontRail",
  railgrab: "frontRail",
  tailgrab: "tailGrab",
  boardvarial: "varial",
  signature: "kakiTwist",
  kakisignature: "kakiTwist",
  kakitwist: "kakiTwist",
  tubetuck: "tubeTuck",
  soularch: "tubeTuck",
  resultvictory: "victory",
  resultdisappointed: "disappointed",
});

function pose(overrides = {}) {
  return Object.freeze({
    crouch: 0,
    stretch: 0,
    lean: 0,
    float: 0,
    headX: 0,
    headY: 0,
    leftPaw: [-10, -13],
    rightPaw: [7, -13],
    legSpread: 5,
    squash: 0,
    foldedEar: false,
    expression: "calm",
    loose: false,
    ...overrides,
  });
}

export function getBoardVisualProfile(board) {
  return BOARD_PROFILES[board?.id] ?? BOARD_PROFILES.foamPuff;
}

export function resolveKakiPose(player = {}) {
  const explicit = player.trickPose?.id ?? player.trickPose?.pose ?? player.trickPose;
  const explicitPose = poseName(explicit);
  if (explicitPose && explicitPose !== "neutralRide") return explicitPose;

  const maneuverPose = poseName(player.maneuver?.id);
  if (maneuverPose) return maneuverPose;
  const trick = player.activeTrick?.id ?? player.trick?.id ?? player.provisionalTrickName;
  const trickPose = poseName(trick);
  if (trickPose && ["frontRail", "tailGrab", "varial", "kakiTwist"].includes(trickPose)) return trickPose;

  switch (player.state) {
    case "lip": return "lip";
    case "airborne":
      if (player.airVY < -24) return player.stateTime < 0.13 ? "takeoff" : "rise";
      if (Math.abs(player.airVY ?? 0) <= 24) return "apex";
      if (landingIsRecoverable(player.landingPreview)) return "landingAnticipation";
      return "fall";
    case "landing":
      return player.landingQuality === "perfect" || player.lastLandingQuality === "perfect"
        ? "perfectLanding"
        : "cleanLanding";
    case "wobble": return "wobble";
    case "wipeout": {
      const cause = player.wipeoutCause ?? "";
      if (cause === "curl") return "wipeoutC";
      return (Math.floor((player.stateTime ?? 0) * 5) & 1) ? "wipeoutB" : "wipeoutA";
    }
    case "complete": return player.resultWon === false ? "disappointed" : "victory";
    default:
      if (player.pumpReleased || player.justPumped) return "release";
      if ((player.compression ?? 0) > 0.58 || (player.charge ?? 0) > 0.55) return "compression";
      if ((player.faceVelocity ?? 0) < -0.22) return "highLineCarve";
      if ((player.faceVelocity ?? 0) > 0.22) return "downFaceCarve";
      return "neutralRide";
  }
}

function landingIsRecoverable(preview = {}) {
  const error = Number(preview.error);
  const recovery = Number(preview.bands?.recovery);
  return Number.isFinite(error)
    && Number.isFinite(recovery)
    && recovery > 0
    && error <= recovery;
}

function poseName(value) {
  if (typeof value !== "string" || !value) return null;
  const normalized = value.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (POSE_ALIASES[normalized]) return POSE_ALIASES[normalized];
  return Object.keys(POSES).find((key) => key.toLowerCase() === normalized) ?? null;
}

export function drawBoardSprite(ctx, x, y, angle, board, palette, options = {}) {
  const id = board?.id ?? "foamPuff";
  const profile = getBoardVisualProfile(board);
  const compression = clamp(Number(options.compression ?? 0), 0, 1);
  const flex = Math.round(compression * profile.flex);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(snapAngle(angle + Number(options.relativeAngle ?? 0)));
  ctx.scale(Math.sign(options.direction ?? 1) || 1, 1);

  const family = id === "mangoFish" ? "mangoFish" : id === "moonLog" ? "moonLog" : "foamPuff";
  const view = options.airborne || options.underside ? "Underside" : "Top";
  const atlasScale = id === "moonLog" ? 0.72 : id === "mangoFish" ? 0.62 : 0.6;
  const drawn = drawAtlasFrame(ctx, options.assets, "boards", `${family}${view}`, 0, 1 + flex * 0.35, {
    scale: atlasScale,
  });

  if (!drawn) {
    if (id === "mangoFish") drawFishBoard(ctx, board, palette, flex);
    else if (id === "moonLog") drawLogBoard(ctx, board, palette, flex);
    else drawPuffBoard(ctx, board, palette, flex);
  }

  ctx.restore();
}

function drawPuffBoard(ctx, board, p, flex) {
  ctx.fillStyle = p.ink;
  ctx.fillRect(-15, -3 + flex, 30, 7 - flex);
  ctx.fillRect(-17, -2 + flex, 34, 5 - flex);
  ctx.fillStyle = board?.color ?? p.gold;
  ctx.fillRect(-14, -2 + flex, 28, 5 - flex);
  ctx.fillRect(-16, -1 + flex, 32, 3 - flex);
  ctx.fillStyle = board?.accent ?? p.danger;
  ctx.fillRect(-5, -2 + flex, 10, 4 - flex);
  ctx.fillStyle = p.sun;
  ctx.fillRect(8, -1 + flex, 5, 2);
}

function drawFishBoard(ctx, board, p, flex) {
  ctx.fillStyle = p.ink;
  ctx.beginPath();
  ctx.moveTo(18, 0 + flex);
  ctx.lineTo(13, -3 + flex);
  ctx.lineTo(-12, -3 + flex);
  ctx.lineTo(-18, -1 + flex);
  ctx.lineTo(-14, 0 + flex);
  ctx.lineTo(-18, 2);
  ctx.lineTo(-11, 3);
  ctx.lineTo(13, 3);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = board?.color ?? p.sun;
  ctx.beginPath();
  ctx.moveTo(16, 0 + flex);
  ctx.lineTo(12, -2 + flex);
  ctx.lineTo(-12, -2 + flex);
  ctx.lineTo(-15, -1 + flex);
  ctx.lineTo(-11, 0 + flex);
  ctx.lineTo(-15, 1);
  ctx.lineTo(-10, 2);
  ctx.lineTo(12, 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = board?.accent ?? p.violet;
  ctx.fillRect(2, -2 + flex, 7, 4 - flex);
  ctx.fillRect(-13, -1 + flex, 3, 1);
}

function drawLogBoard(ctx, board, p, flex) {
  ctx.fillStyle = p.ink;
  ctx.fillRect(-20, -3 + flex, 40, 6 - flex);
  ctx.fillRect(-22, -2 + flex, 44, 4 - flex);
  ctx.fillStyle = board?.color ?? p.violet;
  ctx.fillRect(-19, -2 + flex, 38, 4 - flex);
  ctx.fillRect(-21, -1 + flex, 42, 2);
  ctx.fillStyle = board?.accent ?? p.waterDeep;
  ctx.fillRect(-3, -2 + flex, 7, 4 - flex);
  ctx.fillStyle = p.white;
  ctx.fillRect(12, -1 + flex, 5, 1);
}

export function drawKittySprite(ctx, x, y, angle, player, palette, options = {}) {
  const poseId = resolveKakiPose(player);
  const poseData = POSES[poseId] ?? POSES.neutralRide;
  const wobble = poseId === "wobble" ? Math.round(Math.sin((player.stateTime ?? 0) * 30) * 3) : 0;
  const crouch = poseData.crouch + Math.round(clamp(player.compression ?? 0, 0, 1) * 2);
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(snapAngle(angle + poseData.lean * 0.035 + (poseData.loose ? Math.sin((player.stateTime ?? 0) * 17) * 0.16 : 0)));
  ctx.scale(Math.sign(options.direction ?? player?.travelDirection ?? 1) || 1, 1);
  ctx.translate(0, -poseData.float);

  // Tail and independent legs keep the plush silhouette readable at speed.
  ctx.fillStyle = palette.ink;
  ctx.fillRect(-11 - Math.sign(poseData.lean), -12 + crouch, 7, 5);
  ctx.fillStyle = palette.plush;
  ctx.fillRect(-10 - Math.sign(poseData.lean), -11 + crouch, 5, 3);
  const legY = -6 + Math.round(crouch * 0.45);
  ctx.fillStyle = palette.ink;
  ctx.fillRect(-poseData.legSpread - 3, legY, 5, Math.max(3, 7 - poseData.squash));
  ctx.fillRect(poseData.legSpread - 2, legY, 5, Math.max(3, 7 - poseData.squash));
  ctx.fillStyle = palette.hoodie;
  ctx.fillRect(-poseData.legSpread - 2, legY + 1, 3, Math.max(2, 5 - poseData.squash));
  ctx.fillRect(poseData.legSpread - 1, legY + 1, 3, Math.max(2, 5 - poseData.squash));

  const bodyY = -15 + crouch - poseData.stretch;
  ctx.fillStyle = palette.ink;
  ctx.fillRect(-7, bodyY - 2, 14, 12 + poseData.stretch - poseData.squash);
  ctx.fillRect(-5, bodyY - 4, 10, 3);
  ctx.fillStyle = palette.hoodie;
  ctx.fillRect(-6, bodyY - 1, 12, 9 + poseData.stretch - poseData.squash);
  ctx.fillStyle = palette.white;
  ctx.fillRect(-1, bodyY, 1, 6);
  ctx.fillRect(1, bodyY, 1, 6);

  drawPaw(ctx, poseData.leftPaw[0] - wobble, poseData.leftPaw[1] + crouch, palette);
  drawPaw(ctx, poseData.rightPaw[0] + wobble, poseData.rightPaw[1] + crouch, palette);

  const headX = poseData.headX + Math.round(clamp((player.faceVelocity ?? 0) * 0.7, -2, 2));
  const headY = bodyY - 19 + poseData.headY - poseData.stretch;
  ctx.translate(headX, 0);
  ctx.fillStyle = palette.ink;
  ctx.fillRect(-11, headY + 3, 22, 16);
  ctx.fillRect(-9, headY + 1, 18, 3);
  drawEar(ctx, -10, headY - 6, false, palette, poseData.foldedEar);
  drawEar(ctx, 5, headY - 6, true, palette, poseData.loose && !poseData.foldedEar);
  ctx.fillStyle = palette.face;
  ctx.fillRect(-8, headY + 6, 16, 11);
  ctx.fillRect(-6, headY + 4, 12, 2);
  ctx.fillStyle = palette.plush;
  ctx.fillRect(-10, headY + 2, 20, 5);
  ctx.fillRect(-10, headY + 6, 4, 10);
  ctx.fillRect(6, headY + 6, 4, 10);
  ctx.fillRect(-8, headY + 4, 5, 3);
  ctx.fillStyle = palette.plushDark;
  ctx.fillRect(-9, headY + 13, 3, 3);
  ctx.fillRect(7, headY + 11, 2, 5);
  ctx.fillStyle = palette.plushLight;
  ctx.fillRect(-6, headY + 2, 7, 2);
  ctx.fillRect(4, headY + 4, 5, 2);
  ctx.fillRect(-9, headY + 8, 2, 3);
  drawFace(ctx, headY, poseData.expression, palette);
  ctx.restore();
  return poseId;
}

function drawPaw(ctx, x, y, p) {
  ctx.fillStyle = p.ink;
  ctx.fillRect(x, y, 5, 5);
  ctx.fillStyle = p.plushLight;
  ctx.fillRect(x + 1, y + 1, 3, 3);
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

function drawFace(ctx, headY, expression, p) {
  ctx.fillStyle = p.ink;
  if (expression === "wide") {
    ctx.fillRect(-5, headY + 10, 2, 2);
    ctx.fillRect(4, headY + 10, 2, 2);
  } else if (expression === "squint") {
    ctx.fillRect(-6, headY + 11, 3, 1);
    ctx.fillRect(3, headY + 11, 3, 1);
  } else if (expression === "focus") {
    ctx.fillRect(-6, headY + 10, 3, 1);
    ctx.fillRect(4, headY + 9, 2, 2);
  } else {
    ctx.fillRect(-5, headY + 11, 3, 1);
    ctx.fillRect(3, headY + 11, 3, 1);
    ctx.fillRect(-6, headY + 10, 1, 1);
    ctx.fillRect(6, headY + 10, 1, 1);
  }
  ctx.fillRect(0, headY + 13, 1, 1);
  if (expression === "bright") {
    ctx.fillRect(-3, headY + 14, 2, 1);
    ctx.fillRect(2, headY + 14, 2, 1);
    ctx.fillRect(-1, headY + 15, 3, 1);
  } else {
    ctx.fillRect(-2, headY + 14, 5, 1);
  }
  ctx.fillStyle = p.cheek;
  ctx.fillRect(-7, headY + 13, 2, 1);
  ctx.fillRect(6, headY + 13, 2, 1);
}

function snapAngle(angle = 0) {
  const step = Math.PI / 16;
  return Math.round(Number(angle || 0) / step) * step;
}
