import assert from "node:assert/strict";
import test from "node:test";

import { GENERATED_ASSET_MANIFEST } from "../js/asset-manifest.js";
import {
  drawSoderSnekSprite,
  quantizedAnimationFrame,
  resolveSoderSnekFrame,
  resolveSoderTrickFrame,
  SODER_SNEK_ATLAS,
  SODER_SNEK_FRAME_NAMES,
  SODER_SNEK_VISUAL_BOUNDS,
} from "../js/soder-snek.js";
import { drawKittySprite, drawPlayableRiderSprite } from "../js/sprites.js";

const PALETTE = Object.freeze({
  ink: "#161f2f",
  plush: "#e1b779",
  plushDark: "#9f7148",
  plushLight: "#fff8e0",
  hoodie: "#244f6d",
  white: "#ffffff",
  face: "#f0ddc7",
  cheek: "#d56d7f",
});

test("Soder atlas publishes 56 padded 64x64 production cells", () => {
  const manifest = GENERATED_ASSET_MANIFEST.soderSnek;
  assert.deepEqual(SODER_SNEK_ATLAS, {
    columns: 8,
    rows: 7,
    cellWidth: 64,
    cellHeight: 64,
    width: 512,
    height: 448,
    frameCount: 56,
  });
  assert.equal(manifest.width, SODER_SNEK_ATLAS.width);
  assert.equal(manifest.height, SODER_SNEK_ATLAS.height);
  assert.equal(manifest.optional, false);
  assert.deepEqual(Object.keys(manifest.frames), SODER_SNEK_FRAME_NAMES);
  for (const frame of Object.values(manifest.frames)) {
    assert.equal(frame.width, 64);
    assert.equal(frame.height, 64);
  }
});

test("Soder supports every canonical rider state and result family", () => {
  const cases = [
    [{ state: "riding", ridingStance: "regular", stateTime: 0.1 }, ["regularRide", "neutralRide"]],
    [{ state: "riding", ridingStance: "goofy" }, ["goofyRide"]],
    [{ state: "riding", compression: 0.8 }, ["deepCompression"]],
    [{ state: "lip" }, ["lipAnticipation"]],
    [{ state: "airborne", stateTime: 0.05, airVY: -80 }, ["takeoffUncoil"]],
    [{ state: "airborne", stateTime: 0.3, airVY: -80 }, ["risingStretch"]],
    [{ state: "airborne", airVY: 0 }, ["floatingApex"]],
    [{ state: "airborne", airVY: 80, landingPreview: {} }, ["controlledFall"]],
    [{ state: "airborne", airVY: 80, landingPreview: { error: 0.1, bands: { recovery: 0.5 } } }, ["landingAnticipation"]],
    [{ state: "landing", landingQuality: "perfect" }, ["perfectImpactCoil"]],
    [{ state: "landing", landingQuality: "clean" }, ["cleanImpact"]],
    [{ state: "wobble" }, ["wobble"]],
    [{ state: "wipeout", stateTime: 0, wipeoutCause: "curl" }, ["curlWipeout"]],
    [{ state: "wipeout", stateTime: 0.3 }, ["wipeoutA", "tailKnotTumble", "tongueFlop"]],
    [{ state: "complete", resultWon: true }, ["victory"]],
    [{ state: "complete", resultWon: false }, ["disappointed"]],
    [{ state: "riding", turboActive: true, turboTier: "ignition" }, ["turboIgnition"]],
    [{ state: "riding", turboActive: true, turboTier: "surge" }, ["turboSurge"]],
    [{ state: "riding", turboActive: true, turboTier: "redline" }, ["turboRedline"]],
    [{ state: "riding", turboCookingTimer: 0.5 }, ["turboCooking"]],
    [{ state: "riding", maneuver: { id: "snap" } }, ["snekSnap"]],
    [{ state: "riding", maneuver: { id: "cutback" } }, ["coilCutback"]],
    [{ state: "riding", maneuver: { id: "tubeTuck" } }, ["serpentTuck"]],
    [{ state: "riding", animalMount: "dolphin" }, ["dolphinMount"]],
  ];
  for (const [player, expected] of cases) {
    const frame = resolveSoderSnekFrame(player);
    assert.ok(expected.includes(frame), `${JSON.stringify(player)} -> ${frame}`);
    assert.ok(SODER_SNEK_FRAME_NAMES.includes(frame));
  }
});

test("Soder landing variants, Turbo poses, and switch preparation select bespoke frames", () => {
  const presentations = {
    landingPawUp: "perfectRideAwayA",
    landingPowerCrouch: "perfectRideAwayB",
    landingStar: "perfectRideAwayC",
    landingLookBack: "perfectRideAwayD",
    landingLowRide: "cleanRideAwayA",
    landingTailBalance: "cleanRideAwayB",
    landingPawSweep: "cleanRideAwayC",
    landingQuickSettle: "cleanRideAwayD",
    turboIgnition: "turboIgnition",
    turboSurge: "turboSurge",
    turboRedline: "turboRedline",
    turboCooking: "turboCooking",
    turboRelease: "turboRelease",
  };
  for (const [presentationPoseId, expected] of Object.entries(presentations)) {
    assert.equal(resolveSoderSnekFrame({ state: "riding", presentationPoseId }), expected);
  }
  assert.equal(resolveSoderSnekFrame({
    state: "landing",
    landingDirection: -1,
    takeoffDirection: 1,
  }), "switchLanding");
});

test("Soder animation is stepped at authored 8-12 FPS and Reduced Motion is stable", () => {
  assert.equal(quantizedAnimationFrame(0.124, 8), 0);
  assert.equal(quantizedAnimationFrame(0.125, 8), 1);
  assert.equal(quantizedAnimationFrame(0.099, 10), 0);
  assert.equal(quantizedAnimationFrame(0.1, 10), 1);
  assert.equal(quantizedAnimationFrame(0.084, 12), 1);
  assert.equal(resolveSoderSnekFrame({ state: "riding", stateTime: 999 }, { reducedMotion: true }), "regularRide");
});

test("every canonical trick has readable Soder entry, hold, release, and landing-read frames", () => {
  const cases = {
    frontRailGrab: ["tongueTapReach", "tongueTapHold", "tongueTapRelease"],
    tailGrab: ["tailCoilReach", "tailCoilHold", "tailCoilRelease"],
    boardVarial: ["shedFlipOpen", "shedFlipSeparate", "shedFlipReconnect"],
    kakiTwist: ["soderSpiralWindup", "soderSpiralMaximum", "soderSpiralSpot"],
  };
  for (const [id, [entry, middle, release]] of Object.entries(cases)) {
    assert.equal(resolveSoderTrickFrame(id, phaseFor(id, "entry"), 0.1), entry);
    assert.equal(resolveSoderTrickFrame(id, phaseFor(id, "middle"), 0.55), middle);
    assert.equal(resolveSoderTrickFrame(id, phaseFor(id, "release"), 0.92), release);
    assert.equal(resolveSoderTrickFrame(id, "landingRead", 0.96), release);
    assert.equal(
      resolveSoderTrickFrame(id, phaseFor(id, "middle"), 0.55, { reducedMotion: true }),
      middle,
    );
  }
});

test("Kaki dispatcher remains byte-for-byte equivalent to the original Kaki renderer", () => {
  const player = {
    characterId: "kaki",
    state: "riding",
    stateTime: 1,
    travelDirection: 1,
    ridingStance: "regular",
    faceVelocity: 0,
    compression: 0,
  };
  const direct = new CommandContext();
  const dispatched = new CommandContext();
  drawKittySprite(direct, 120, 90, 0.2, player, PALETTE, { direction: 1, stanceDirection: 1 });
  drawPlayableRiderSprite(dispatched, 120, 90, 0.2, player, PALETTE, { direction: 1, stanceDirection: 1 });
  assert.deepEqual(dispatched.commands, direct.commands);
  assert.equal(dispatched.depth, 0);
});

test("Soder fallback is recognizable, balanced, bounded, and mirrors only once", () => {
  const right = new CommandContext();
  const left = new CommandContext();
  const goofy = new CommandContext();
  const player = {
    characterId: "soderSnek",
    state: "riding",
    stateTime: 0.2,
    travelDirection: 1,
    ridingStance: "regular",
  };
  drawSoderSnekSprite(right, 100, 100, 0, player, PALETTE, { direction: 1, stanceDirection: 1 });
  drawSoderSnekSprite(left, 100, 100, 0, player, PALETTE, { direction: -1, stanceDirection: 1 });
  drawSoderSnekSprite(goofy, 100, 100, 0, { ...player, ridingStance: "goofy" }, PALETTE, {
    direction: 1,
    stanceDirection: -1,
  });
  assert.equal(right.depth, 0);
  assert.equal(left.depth, 0);
  assert.equal(goofy.depth, 0);
  assert.ok(right.colors.has("#539738"), "green hood/body");
  assert.ok(right.colors.has("#de6997"), "pink tongue");
  assert.ok(right.colors.has("#a6703d"), "segmented tan belly");
  assert.deepEqual(right.scales[0], [1, 1]);
  assert.deepEqual(left.scales[0], [-1, 1]);
  assert.deepEqual(goofy.scales[0], [-1, 1]);
  assert.ok(SODER_SNEK_VISUAL_BOUNDS.left > -32);
  assert.ok(SODER_SNEK_VISUAL_BOUNDS.right < 32);
  assert.ok(SODER_SNEK_VISUAL_BOUNDS.top > -64);
  assert.ok(SODER_SNEK_VISUAL_BOUNDS.bottom < 16);
});

class CommandContext {
  constructor() {
    this.commands = [];
    this.colors = new Set();
    this.scales = [];
    this.depth = 0;
    this._fillStyle = "";
    this.imageSmoothingEnabled = false;
    this.globalAlpha = 1;
  }

  set fillStyle(value) {
    this._fillStyle = value;
    this.colors.add(value);
    this.commands.push(["fillStyle", value]);
  }

  get fillStyle() {
    return this._fillStyle;
  }

  save() {
    this.depth += 1;
    this.commands.push(["save"]);
  }

  restore() {
    this.depth -= 1;
    this.commands.push(["restore"]);
  }

  translate(x, y) {
    this.commands.push(["translate", x, y]);
  }

  rotate(angle) {
    this.commands.push(["rotate", angle]);
  }

  scale(x, y) {
    this.scales.push([x, y]);
    this.commands.push(["scale", x, y]);
  }

  fillRect(x, y, width, height) {
    this.commands.push(["fillRect", x, y, width, height]);
  }
}

function phaseFor(id, stage) {
  const phases = {
    frontRailGrab: { entry: "reach", middle: "hold", release: "release" },
    tailGrab: { entry: "windup", middle: "hold", release: "release" },
    boardVarial: { entry: "pop", middle: "separate", release: "reconnect" },
    kakiTwist: { entry: "windup", middle: "maximum", release: "spot" },
  };
  return phases[id][stage];
}
