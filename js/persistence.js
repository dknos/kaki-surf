import { DEFAULT_SETTINGS, SAVE_KEY } from "./config.js";

export function createDefaultSave() {
  return {
    version: 1,
    bestScore: 0,
    bestFlow: 0,
    totalRuns: 0,
    selectedBoard: "foamPuff",
    selectedCondition: "goldenCoast",
    unlockedBoards: ["foamPuff", "mangoFish", "moonLog"],
    tutorialSeen: false,
    settings: { ...DEFAULT_SETTINGS },
    lastRun: null,
  };
}

export function loadSave(storage = globalThis.localStorage) {
  const fallback = createDefaultSave();
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1) return fallback;
    return {
      ...fallback,
      ...saved,
      unlockedBoards: Array.isArray(saved.unlockedBoards) ? saved.unlockedBoards : fallback.unlockedBoards,
      settings: { ...DEFAULT_SETTINGS, ...saved.settings },
    };
  } catch (error) {
    console.warn("Kaki Surf save could not be read; using a fresh local profile.", error);
    return fallback;
  }
}

export function writeSave(save, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (error) {
    console.warn("Kaki Surf save could not be written.", error);
    return false;
  }
}

export function recordRun(save, result) {
  const score = Math.round(result.score);
  const flow = Math.round(result.flow);
  const previousBest = save.bestScore;
  save.bestScore = Math.max(save.bestScore, score);
  save.bestFlow = Math.max(save.bestFlow, flow);
  save.totalRuns += 1;
  save.lastRun = {
    score,
    flow,
    rank: result.rank.grade,
    board: result.board,
    condition: result.condition ?? save.selectedCondition,
    at: new Date().toISOString(),
  };
  return score > previousBest;
}
