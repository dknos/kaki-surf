import test from "node:test";
import assert from "node:assert/strict";

import { BOARDS, DEFAULT_SETTINGS, SAVE_KEY } from "../js/config.js";
import { createDefaultSave, loadSave, recordRun, writeSave } from "../js/persistence.js";

test("fresh profiles keep the backward-compatible v1 shape and current defaults", () => {
  const save = createDefaultSave();

  assert.equal(save.version, 1);
  assert.equal(SAVE_KEY, "kaki-surf-meta-v1");
  assert.deepEqual(save.unlockedBoards, Object.keys(BOARDS));
  assert.equal(save.selectedBoard, "foamPuff");
  assert.equal(save.selectedCondition, "goldenCoast");
  assert.equal(save.settings.controlMode, "simple");
  assert.equal(save.settings.waveReadAssist, "full");
  assert.deepEqual(save.settings, DEFAULT_SETTINGS);

  const anotherSave = createDefaultSave();
  assert.notStrictEqual(anotherSave.settings, save.settings, "settings must not be shared between profiles");
  assert.notStrictEqual(anotherSave.unlockedBoards, save.unlockedBoards, "board lists must be independently mutable");
});

test("legacy v1 payloads retain progress and settings while migrating missing controlMode to Advanced", () => {
  const legacy = {
    version: 1,
    bestScore: 4380,
    bestFlow: 67,
    totalRuns: 4,
    selectedBoard: "mangoFish",
    unlockedBoards: ["foamPuff", "mangoFish"],
    tutorialSeen: true,
    settings: {
      music: 0.25,
      reducedMotion: true,
    },
    lastRun: null,
  };
  const storage = new MemoryStorage({
    [SAVE_KEY]: JSON.stringify(legacy),
  });

  const save = loadSave(storage);

  assert.equal(save.version, 1);
  assert.equal(save.bestScore, legacy.bestScore);
  assert.equal(save.selectedBoard, legacy.selectedBoard);
  assert.deepEqual(save.unlockedBoards, legacy.unlockedBoards);
  assert.equal(save.selectedCondition, "goldenCoast");
  assert.deepEqual(save.settings, {
    ...DEFAULT_SETTINGS,
    ...legacy.settings,
    controlMode: "advanced",
  });
  assert.equal(save.settings.controlMode, "advanced");
  assert.equal(save.settings.waveReadAssist, "full");
});

test("v1 payloads with an explicit valid control mode preserve that choice", () => {
  for (const controlMode of ["simple", "advanced"]) {
    const saved = createDefaultSave();
    saved.bestScore = 9123;
    saved.selectedBoard = "moonLog";
    saved.selectedCondition = "stormbreak";
    saved.settings.controlMode = controlMode;
    const storage = new MemoryStorage({ [SAVE_KEY]: JSON.stringify(saved) });

    const loaded = loadSave(storage);
    assert.equal(loaded.settings.controlMode, controlMode);
    assert.equal(loaded.bestScore, 9123);
    assert.equal(loaded.selectedBoard, "moonLog");
    assert.equal(loaded.selectedCondition, "stormbreak");
  }
});

test("malformed, old, and future-version saves each fall back to a fresh profile", () => {
  const cases = [
    ["malformed JSON", "{ definitely-not-json"],
    ["old version", JSON.stringify({ version: 0, bestScore: 999999 })],
    ["future version", JSON.stringify({ version: 2, bestScore: 999999 })],
  ];
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    for (const [label, payload] of cases) {
      const storage = new MemoryStorage({ [SAVE_KEY]: payload });
      assert.deepEqual(loadSave(storage), createDefaultSave(), label);
    }
  } finally {
    console.warn = originalWarn;
  }
});

test("recordRun only raises bests and records board and condition metadata", () => {
  const save = createDefaultSave();
  save.bestScore = 500;
  save.bestFlow = 30;
  save.selectedCondition = "twilightGlass";

  const firstIsBest = recordRun(save, {
    score: 750.6,
    flow: 40.2,
    rank: { grade: "A" },
    board: "moonLog",
    condition: "stormbreak",
  });

  assert.equal(firstIsBest, true);
  assert.equal(save.bestScore, 751);
  assert.equal(save.bestFlow, 40);
  assert.equal(save.totalRuns, 1);
  assert.deepEqual(
    { ...save.lastRun, at: undefined },
    {
      score: 751,
      flow: 40,
      rank: "A",
      board: "moonLog",
      condition: "stormbreak",
      at: undefined,
    },
  );
  assert.ok(Number.isFinite(Date.parse(save.lastRun.at)), "lastRun.at should be an ISO timestamp");

  const secondIsBest = recordRun(save, {
    score: 700.4,
    flow: 99.6,
    rank: { grade: "B" },
    board: "foamPuff",
  });

  assert.equal(secondIsBest, false);
  assert.equal(save.bestScore, 751, "a lower score cannot lower the best score");
  assert.equal(save.bestFlow, 100, "flow can set its own independent best");
  assert.equal(save.totalRuns, 2);
  assert.equal(save.lastRun.condition, "twilightGlass", "missing run metadata uses the selected condition");
});

test("writeSave writes once and only under kaki-surf-meta-v1", () => {
  const storage = new MemoryStorage();
  const save = createDefaultSave();

  assert.equal(writeSave(save, storage), true);
  assert.equal(storage.writes.length, 1);
  assert.equal(storage.writes[0].key, "kaki-surf-meta-v1");
  assert.deepEqual(JSON.parse(storage.writes[0].value), save);
  assert.deepEqual([...storage.values.keys()], ["kaki-surf-meta-v1"]);
});

class MemoryStorage {
  constructor(initialValues = {}) {
    this.values = new Map(Object.entries(initialValues));
    this.writes = [];
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    const serialized = String(value);
    this.values.set(key, serialized);
    this.writes.push({ key, value: serialized });
  }
}
