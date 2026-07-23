import test from "node:test";
import assert from "node:assert/strict";

import { BOARDS, DEFAULT_SETTINGS, SAVE_KEY } from "../js/config.js";
import { createDefaultSave, getRunRecord, loadSave, recordRun, resolveStorage, writeSave } from "../js/persistence.js";

test("fresh profiles keep the backward-compatible v1 shape and current defaults", () => {
  const save = createDefaultSave();

  assert.equal(save.version, 1);
  assert.equal(SAVE_KEY, "kaki-surf-meta-v1");
  assert.deepEqual(save.unlockedBoards, Object.keys(BOARDS));
  assert.equal(save.selectedCharacter, "kaki");
  assert.equal(save.selectedBoard, "foamPuff");
  assert.equal(save.selectedCondition, "twilightGlass", "fresh players see the MVP hero barrel first");
  assert.equal(save.selectedMode, "endless");
  assert.deepEqual(Object.keys(save.records), ["endless", "scoreAttack"]);
  assert.deepEqual(getRunRecord(save, "endless"), {
    bestScore: 0,
    bestFlow: 0,
    bestDistance: 0,
    bestSet: 1,
    longestRide: 0,
  });
  assert.equal(save.settings.controlMode, "simple");
  assert.equal(save.settings.waveReadAssist, "full");
  assert.deepEqual(save.settings, DEFAULT_SETTINGS);

  const anotherSave = createDefaultSave();
  assert.notStrictEqual(anotherSave.settings, save.settings, "settings must not be shared between profiles");
  assert.notStrictEqual(anotherSave.unlockedBoards, save.unlockedBoards, "board lists must be independently mutable");
  assert.notStrictEqual(anotherSave.records, save.records, "mode records must not be shared between profiles");
  assert.notStrictEqual(anotherSave.records.endless, save.records.endless, "nested mode records must be independently mutable");
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
  assert.equal(save.selectedCharacter, "kaki");
  assert.equal(save.selectedBoard, legacy.selectedBoard);
  assert.deepEqual(save.unlockedBoards, legacy.unlockedBoards);
  assert.equal(save.selectedCondition, "goldenCoast");
  assert.equal(save.selectedMode, "endless");
  assert.equal(save.records.scoreAttack.bestScore, legacy.bestScore);
  assert.equal(save.records.scoreAttack.bestFlow, legacy.bestFlow);
  assert.equal(save.records.endless.bestScore, 0);
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

test("semantically corrupt v1 fields are normalized without discarding valid progress", () => {
  const storage = new MemoryStorage({
    [SAVE_KEY]: JSON.stringify({
      version: 1,
      bestScore: null,
      bestFlow: 900,
      totalRuns: -8,
      selectedBoard: "not-a-board",
      selectedCondition: "lava",
      unlockedBoards: ["foamPuff", "foamPuff", "bogus"],
      tutorialSeen: "yes",
      settings: {
        muted: true,
        music: "broken",
        effects: 4,
        waveAudio: -2,
        screenShake: Number.NaN,
        controlMode: "turbo",
        waveReadAssist: "maximum",
      },
      lastRun: { score: null, flow: Infinity, rank: "Z", board: "bad", condition: "bad", at: "never" },
    }),
  });

  const save = loadSave(storage);
  assert.equal(save.bestScore, 0);
  assert.equal(save.bestFlow, 100);
  assert.equal(save.totalRuns, 0);
  assert.equal(save.selectedCharacter, "kaki");
  assert.equal(save.selectedBoard, "foamPuff");
  assert.equal(save.selectedCondition, "goldenCoast");
  assert.deepEqual(save.unlockedBoards, ["foamPuff"]);
  assert.equal(save.tutorialSeen, false);
  assert.equal(save.settings.muted, true);
  assert.equal(save.settings.music, DEFAULT_SETTINGS.music);
  assert.equal(save.settings.effects, 1);
  assert.equal(save.settings.waveAudio, 0);
  assert.equal(save.settings.controlMode, "advanced");
  assert.equal(save.settings.waveReadAssist, DEFAULT_SETTINGS.waveReadAssist);
  assert.deepEqual(save.lastRun, {
    score: 0,
    flow: 0,
    rank: "D",
    character: "kaki",
    board: "foamPuff",
    condition: "goldenCoast",
    mode: "scoreAttack",
    distance: 0,
    set: 1,
    duration: 0,
    at: null,
  });
  assert.doesNotThrow(() => save.bestScore.toLocaleString());
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
      character: "kaki",
      board: "moonLog",
      condition: "stormbreak",
      mode: "endless",
      distance: 0,
      set: 1,
      duration: 0,
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

test("Endless and Score Attack keep independent score, distance, set, and survival records", () => {
  const save = createDefaultSave();
  const endlessBest = recordRun(save, {
    score: 4200,
    flow: 72,
    rank: { grade: "A" },
    board: "mangoFish",
    condition: "twilightGlass",
    mode: "endless",
    distance: 2380,
    set: 4,
    duration: 131,
  });
  const attackBest = recordRun(save, {
    score: 1900,
    flow: 48,
    rank: { grade: "B" },
    board: "foamPuff",
    condition: "goldenCoast",
    mode: "scoreAttack",
    distance: 1210,
    set: 1,
    duration: 78,
  });

  assert.equal(endlessBest, true);
  assert.equal(attackBest, true, "a lower global score can still be a Score Attack best");
  assert.deepEqual(getRunRecord(save, "endless"), {
    bestScore: 4200,
    bestFlow: 72,
    bestDistance: 2380,
    bestSet: 4,
    longestRide: 131,
  });
  assert.deepEqual(getRunRecord(save, "scoreAttack"), {
    bestScore: 1900,
    bestFlow: 48,
    bestDistance: 1210,
    bestSet: 1,
    longestRide: 78,
  });
  assert.equal(save.bestScore, 4200, "legacy global best remains the all-mode maximum");
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

test("explicit null disables persistence without reading the global storage getter", () => {
  withGlobalStorageGetter(() => {
    throw new Error("the global getter must not be read");
  }, (reads) => {
    assert.equal(resolveStorage(null), null);
    assert.deepEqual(loadSave(null), createDefaultSave());
    assert.equal(writeSave(createDefaultSave(), null), false);
    assert.equal(reads(), 0);
  });
});

test("a denied global storage getter degrades direct load and write to memory-only play", () => {
  withGlobalStorageGetter(() => {
    throw new DOMException("Storage access denied", "SecurityError");
  }, (reads) => {
    assert.equal(resolveStorage(), null);
    assert.deepEqual(loadSave(), createDefaultSave());
    assert.equal(writeSave(createDefaultSave()), false);
    assert.equal(reads(), 3);
  });
});

test("storage method failures remain nonfatal after safe resolution", () => {
  const deniedStorage = {
    getItem() {
      throw new DOMException("Read denied", "SecurityError");
    },
    setItem() {
      throw new DOMException("Write denied", "SecurityError");
    },
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(loadSave(deniedStorage), createDefaultSave());
    assert.equal(writeSave(createDefaultSave(), deniedStorage), false);
  } finally {
    console.warn = originalWarn;
  }
});

function withGlobalStorageGetter(getter, assertion) {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  let reads = 0;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      reads += 1;
      return getter();
    },
  });
  try {
    assertion(() => reads);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete globalThis.localStorage;
  }
}

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
