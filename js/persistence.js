import { BOARDS, CONDITIONS, DEFAULT_SETTINGS, SAVE_KEY } from "./config.js";

const VOLUME_SETTINGS = Object.freeze(["music", "effects", "waveAudio", "screenShake"]);
const BOOLEAN_SETTINGS = Object.freeze([
  "muted",
  "reducedMotion",
  "reducedFlash",
  "highContrast",
  "steeringAssist",
  "landingAssist",
  "touchControls",
]);

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

/**
 * Resolve the browser storage boundary without assuming the property is safe to
 * read. Privacy policies and sandboxed/opaque origins can throw from the
 * `localStorage` getter itself, before a getItem/setItem try/catch can run.
 * Explicit null is preserved so hosts can intentionally disable persistence.
 */
export function resolveStorage(storage = undefined) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function loadSave(storage = undefined) {
  const fallback = createDefaultSave();
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return fallback;
  try {
    const raw = resolvedStorage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const saved = JSON.parse(raw);
    if (!saved || saved.version !== 1) return fallback;
    const savedSettings = saved.settings && typeof saved.settings === "object" ? saved.settings : {};
    const settings = sanitizeSettings(savedSettings, { legacyControlMode: "advanced" });
    const unlockedBoards = Array.isArray(saved.unlockedBoards)
      ? [...new Set(saved.unlockedBoards.filter((id) => Object.hasOwn(BOARDS, id)))]
      : fallback.unlockedBoards;
    return {
      ...fallback,
      bestScore: finiteNonNegative(saved.bestScore, fallback.bestScore),
      bestFlow: finiteRange(saved.bestFlow, fallback.bestFlow, 0, 100),
      totalRuns: Math.floor(finiteNonNegative(saved.totalRuns, fallback.totalRuns)),
      selectedBoard: Object.hasOwn(BOARDS, saved.selectedBoard) ? saved.selectedBoard : fallback.selectedBoard,
      selectedCondition: Object.hasOwn(CONDITIONS, saved.selectedCondition) ? saved.selectedCondition : fallback.selectedCondition,
      unlockedBoards: unlockedBoards.length ? unlockedBoards : fallback.unlockedBoards,
      tutorialSeen: saved.tutorialSeen === true,
      settings,
      lastRun: sanitizeLastRun(saved.lastRun),
    };
  } catch (error) {
    console.warn("Kaki Surf save could not be read; using a fresh local profile.", error);
    return fallback;
  }
}

export function sanitizeSettings(candidate = {}, { legacyControlMode = DEFAULT_SETTINGS.controlMode } = {}) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const settings = { ...DEFAULT_SETTINGS };
  for (const key of VOLUME_SETTINGS) {
    settings[key] = finiteRange(source[key], DEFAULT_SETTINGS[key], 0, 1);
  }
  for (const key of BOOLEAN_SETTINGS) {
    settings[key] = typeof source[key] === "boolean" ? source[key] : DEFAULT_SETTINGS[key];
  }
  settings.controlMode = source.controlMode === "simple" || source.controlMode === "advanced"
    ? source.controlMode
    : legacyControlMode;
  settings.waveReadAssist = ["full", "subtle", "off"].includes(source.waveReadAssist)
    ? source.waveReadAssist
    : DEFAULT_SETTINGS.waveReadAssist;
  return settings;
}

export function writeSave(save, storage = undefined) {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) return false;
  try {
    resolvedStorage.setItem(SAVE_KEY, JSON.stringify(save));
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

function sanitizeLastRun(lastRun) {
  if (!lastRun || typeof lastRun !== "object") return null;
  const rank = typeof lastRun.rank === "string" && /^[SABCD]$/.test(lastRun.rank) ? lastRun.rank : "D";
  const board = Object.hasOwn(BOARDS, lastRun.board) ? lastRun.board : "foamPuff";
  const condition = Object.hasOwn(CONDITIONS, lastRun.condition) ? lastRun.condition : "goldenCoast";
  const at = Number.isFinite(Date.parse(lastRun.at)) ? lastRun.at : null;
  return {
    score: Math.round(finiteNonNegative(lastRun.score, 0)),
    flow: Math.round(finiteRange(lastRun.flow, 0, 0, 100)),
    rank,
    board,
    condition,
    at,
  };
}

function finiteNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function finiteRange(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
