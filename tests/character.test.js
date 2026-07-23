import assert from "node:assert/strict";
import test from "node:test";

import {
  CHARACTER_CATALOG,
  characterDefinition,
  characterMoveName,
  normalizeCharacterId,
} from "../js/character-catalog.js";
import { BOARDS, CONDITIONS, FIXED_STEP, SAVE_KEY } from "../js/config.js";
import { createDefaultSave, loadSave, writeSave } from "../js/persistence.js";
import { SurfSimulation } from "../js/simulation.js";

test("character catalog exposes Kaki and Soder through one cosmetic contract", () => {
  assert.deepEqual(Object.keys(CHARACTER_CATALOG), ["kaki", "soderSnek"]);
  for (const definition of Object.values(CHARACTER_CATALOG)) {
    for (const key of [
      "id",
      "displayName",
      "menuDescription",
      "portraitFrame",
      "riderRendererId",
      "paletteAccents",
      "moveNameOverrides",
      "trickEffectProfile",
      "turboEffectProfile",
      "audioAccentProfile",
      "animationProfile",
    ]) {
      assert.ok(definition[key], `${definition.id}.${key}`);
    }
  }
  assert.equal(
    CHARACTER_CATALOG.soderSnek.menuDescription,
    "SODER SNEK — Coiled style, elastic poses, tremendous tongue control.",
  );
});

test("character IDs normalize safely and Soder move names remain display-only", () => {
  assert.equal(normalizeCharacterId("soderSnek"), "soderSnek");
  assert.equal(normalizeCharacterId("unknown"), "kaki");
  assert.equal(characterDefinition(null).id, "kaki");
  assert.equal(characterMoveName("soderSnek", "kakiTwist", "KAKI TWIST"), "SODER SPIRAL");
  assert.equal(characterMoveName("kaki", "kakiTwist", "KAKI TWIST"), "KAKI TWIST");
});

test("existing saves migrate to Kaki, Soder persists, and invalid IDs fall back", () => {
  const legacy = createDefaultSave();
  delete legacy.selectedCharacter;
  const legacyStorage = new MemoryStorage({ [SAVE_KEY]: JSON.stringify(legacy) });
  assert.equal(loadSave(legacyStorage).selectedCharacter, "kaki");

  const selected = createDefaultSave();
  selected.selectedCharacter = "soderSnek";
  const selectedStorage = new MemoryStorage();
  assert.equal(writeSave(selected, selectedStorage), true);
  assert.equal(loadSave(selectedStorage).selectedCharacter, "soderSnek");

  selected.selectedCharacter = "dragon";
  selectedStorage.setItem(SAVE_KEY, JSON.stringify(selected));
  assert.equal(loadSave(selectedStorage).selectedCharacter, "kaki");
});

test("Kaki and Soder preserve byte-identical physical gameplay for one complete air", () => {
  const kaki = preparedSimulation("kaki");
  const soder = preparedSimulation("soderSnek");
  let landed = false;

  for (let step = 0; step < 900; step += 1) {
    const input = {
      x: Math.sin(step * 0.037) * 0.55,
      y: step < 75 ? -0.4 : 0.18,
      turbo: step < 180,
      turboPressed: step === 0,
      turboReleased: step === 180,
      trick1: step >= 38 && step < 78,
      trick1Pressed: step === 38,
      trick1Released: step === 78,
    };
    kaki.update(FIXED_STEP, input);
    soder.update(FIXED_STEP, input);
    kaki.consumeEvents(() => {});
    soder.consumeEvents(() => {});
    assert.deepEqual(physicalSnapshot(soder), physicalSnapshot(kaki), `fixed step ${step}`);
    if (step > 10 && kaki.player.state === "riding") {
      landed = true;
      break;
    }
  }

  assert.equal(kaki.player.characterId, "kaki");
  assert.equal(soder.player.characterId, "soderSnek");
  assert.equal(landed, true, "the comparison includes takeoff, flight, and landing");
});

function preparedSimulation(character) {
  const simulation = new SurfSimulation({ seed: 0x50de25e5, character });
  simulation.reset({
    seed: 0x50de25e5,
    character,
    board: BOARDS.mangoFish,
    condition: CONDITIONS.goldenCoast,
    controlMode: "advanced",
    tutorialEnabled: false,
    worldQa: { quiet: true },
  });
  simulation.begin();
  simulation.player.state = "lip";
  simulation.player.stateTime = 0.1;
  simulation.player.face = 0.02;
  simulation.player.previousFace = 0.02;
  simulation.player.faceVelocity = -0.82;
  simulation.player.speed = 112;
  simulation.player.charge = 0.86;
  simulation.wave.curlX = -800;
  simulation.consumeEvents(() => {});
  return simulation;
}

function physicalSnapshot(simulation) {
  const player = simulation.player;
  return {
    elapsed: simulation.elapsed,
    activeTime: simulation.activeTime,
    score: simulation.score.total,
    combo: simulation.score.combo,
    flow: simulation.score.flow,
    cameraX: simulation.camera.worldX,
    cameraY: simulation.camera.worldY,
    stageWaveTime: simulation.wave.time,
    waveTravel: simulation.wave.worldTravel,
    state: player.state,
    stateTime: player.stateTime,
    worldX: player.worldX,
    previousWorldX: player.previousWorldX,
    face: player.face,
    velocity: player.motionSpeed,
    motionVX: player.motionVX,
    motionVY: player.motionVY,
    airY: player.airY,
    airVX: player.airVX,
    airVY: player.airVY,
    boardAngle: player.boardAngle,
    bodyAngle: player.bodyAngle,
    turbo: player.turbo,
    turboActive: player.turboActive,
    turboBurnProgress: player.turboBurnProgress,
    turboTier: player.turboTier,
    landingQuality: player.landingQuality,
    world: simulation.world.snapshot(),
  };
}

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}
