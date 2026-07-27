import assert from "node:assert/strict";
import test from "node:test";

import { GENERATED_ASSET_MANIFEST } from "../js/asset-manifest.js";
import {
  SIMPLY_TERRELL_ATLAS,
  SIMPLY_TERRELL_FRAME_NAMES,
  SIMPLY_TERRELL_VISUAL_BOUNDS,
  drawSimplyTerrellSprite,
  resolveSimplyTerrellFrame,
} from "../js/simply-terrell.js";
import { drawPlayableRiderSprite } from "../js/sprites.js";

const PALETTE = Object.freeze({
  ink: "#161f2f",
});

test("SimplyTerrell publishes one complete 56-pose local atlas", () => {
  const manifest = GENERATED_ASSET_MANIFEST.simplyTerrell;
  assert.equal(manifest.width, SIMPLY_TERRELL_ATLAS.width);
  assert.equal(manifest.height, SIMPLY_TERRELL_ATLAS.height);
  assert.equal(manifest.optional, false);
  assert.equal(SIMPLY_TERRELL_FRAME_NAMES.length, 56);
  assert.deepEqual(Object.keys(manifest.frames), [...SIMPLY_TERRELL_FRAME_NAMES]);
});

test("SimplyTerrell follows canonical rider state and trick animation", () => {
  assert.equal(resolveSimplyTerrellFrame({ state: "riding", ridingStance: "regular" }), "regularRide");
  assert.equal(resolveSimplyTerrellFrame({ state: "airborne", airVY: -90, stateTime: 0.2 }), "risingStretch");
  assert.equal(resolveSimplyTerrellFrame({ state: "airborne", airVY: 0 }), "floatingApex");
  assert.equal(resolveSimplyTerrellFrame({
    state: "airborne",
    presentationPoseId: "frontRailGrab",
    presentationPhase: "hold",
    presentationProgress: 0.5,
  }), "tongueTapHold");
  assert.equal(resolveSimplyTerrellFrame({ state: "complete", resultWon: true }), "victory");
});

test("SimplyTerrell fallback keeps locs, tracksuit, red collar, skin, and microphone readable", () => {
  const direct = new CommandContext();
  const dispatched = new CommandContext();
  const player = {
    characterId: "simplyTerrell",
    state: "riding",
    stateTime: 0.2,
    travelDirection: 1,
    ridingStance: "regular",
  };
  drawSimplyTerrellSprite(direct, 100, 100, 0, player, PALETTE, {
    direction: 1,
    stanceDirection: 1,
  });
  drawPlayableRiderSprite(dispatched, 100, 100, 0, player, PALETTE, {
    direction: 1,
    stanceDirection: 1,
  });

  assert.deepEqual(dispatched.commands, direct.commands);
  assert.equal(direct.depth, 0);
  for (const color of ["#171421", "#20294c", "#969aa8", "#bb344f", "#a9633f", "#d8dbe2"]) {
    assert.ok(direct.colors.has(color), `fallback landmark ${color}`);
  }
  assert.ok(
    direct.commands.filter(([command, , , width, height]) => (
      command === "fillRect" && width >= 3 && height >= 4
    )).length >= 12,
    "full biped, locs, stage jacket, hands, and microphone",
  );
  assert.deepEqual(direct.scales[0], [1, 1]);
  assert.ok(SIMPLY_TERRELL_VISUAL_BOUNDS.left > -32);
  assert.ok(SIMPLY_TERRELL_VISUAL_BOUNDS.right < 32);
  assert.ok(SIMPLY_TERRELL_VISUAL_BOUNDS.top > -64);
  assert.ok(SIMPLY_TERRELL_VISUAL_BOUNDS.bottom < 16);
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
