import {
  BOARDS,
  CONDITIONS,
  DEFAULT_RUN_MODE_ID,
  DEFAULT_SETTINGS,
  RUN_MODES,
  SAVE_KEY,
} from "./config.js";
import { normalizeCharacterId } from "./character-catalog.js";

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
const FRESH_DEFAULT_CONDITION = "twilightGlass";
const LEGACY_DEFAULT_CONDITION = "goldenCoast";

export function createDefaultSave() {
  return {
    version: 1,
    bestScore: 0,
    bestFlow: 0,
    totalRuns: 0,
    selectedCharacter: "kaki",
    selectedBoard: "foamPuff",
    selectedCondition: FRESH_DEFAULT_CONDITION,
    selectedMode: DEFAULT_RUN_MODE_ID,
    records: createModeRecords(),
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
    const legacyBestScore = finiteNonNegative(saved.bestScore, fallback.bestScore);
    const legacyBestFlow = finiteRange(saved.bestFlow, fallback.bestFlow, 0, 100);
    const records = sanitizeModeRecords(saved.records, {
      legacyBestScore,
      legacyBestFlow,
    });
    return {
      ...fallback,
      bestScore: Math.max(legacyBestScore, ...Object.values(records).map((record) => record.bestScore)),
      bestFlow: Math.max(legacyBestFlow, ...Object.values(records).map((record) => record.bestFlow)),
      totalRuns: Math.floor(finiteNonNegative(saved.totalRuns, fallback.totalRuns)),
      selectedCharacter: normalizeCharacterId(saved.selectedCharacter),
      selectedBoard: Object.hasOwn(BOARDS, saved.selectedBoard) ? saved.selectedBoard : fallback.selectedBoard,
      // Existing v1 profiles that predate condition selection keep their familiar
      // Golden Coast session; only genuinely fresh profiles open on the hero barrel.
      selectedCondition: Object.hasOwn(CONDITIONS, saved.selectedCondition)
        ? saved.selectedCondition
        : LEGACY_DEFAULT_CONDITION,
      selectedMode: Object.hasOwn(RUN_MODES, saved.selectedMode)
        ? saved.selectedMode
        : fallback.selectedMode,
      records,
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
  const score = Math.round(finiteNonNegative(result.score, 0));
  const flow = Math.round(finiteRange(result.flow, 0, 0, 100));
  const mode = Object.hasOwn(RUN_MODES, result.mode) ? result.mode : resolveModeId(save.selectedMode);
  if (!save.records || typeof save.records !== "object") save.records = createModeRecords();
  const record = sanitizeModeRecord(save.records[mode]);
  const previousBest = record.bestScore;
  const distance = Math.round(finiteNonNegative(result.distance, 0));
  const set = Math.max(1, Math.floor(finiteNonNegative(result.set, 1)));
  const duration = Math.round(finiteNonNegative(result.duration, 0));
  record.bestScore = Math.max(record.bestScore, score);
  record.bestFlow = Math.max(record.bestFlow, flow);
  record.bestDistance = Math.max(record.bestDistance, distance);
  record.bestSet = Math.max(record.bestSet, set);
  record.longestRide = Math.max(record.longestRide, duration);
  save.records[mode] = record;
  save.bestScore = Math.max(finiteNonNegative(save.bestScore, 0), score);
  save.bestFlow = Math.max(finiteRange(save.bestFlow, 0, 0, 100), flow);
  save.totalRuns += 1;
  save.lastRun = {
    score,
    flow,
    rank: result.rank.grade,
    character: normalizeCharacterId(result.character ?? save.selectedCharacter),
    board: result.board,
    condition: result.condition ?? save.selectedCondition,
    mode,
    distance,
    set,
    duration,
    at: new Date().toISOString(),
  };
  return score > previousBest;
}

export function getRunRecord(save, modeId = save?.selectedMode) {
  return sanitizeModeRecord(save?.records?.[resolveModeId(modeId)]);
}

function sanitizeLastRun(lastRun) {
  if (!lastRun || typeof lastRun !== "object") return null;
  const rank = typeof lastRun.rank === "string" && /^[SABCD]$/.test(lastRun.rank) ? lastRun.rank : "D";
  const character = normalizeCharacterId(lastRun.character);
  const board = Object.hasOwn(BOARDS, lastRun.board) ? lastRun.board : "foamPuff";
  const condition = Object.hasOwn(CONDITIONS, lastRun.condition) ? lastRun.condition : LEGACY_DEFAULT_CONDITION;
  const mode = Object.hasOwn(RUN_MODES, lastRun.mode)
    ? lastRun.mode
    : lastRun.mode == null
      ? "scoreAttack"
      : DEFAULT_RUN_MODE_ID;
  const at = Number.isFinite(Date.parse(lastRun.at)) ? lastRun.at : null;
  return {
    score: Math.round(finiteNonNegative(lastRun.score, 0)),
    flow: Math.round(finiteRange(lastRun.flow, 0, 0, 100)),
    rank,
    character,
    board,
    condition,
    mode,
    distance: Math.round(finiteNonNegative(lastRun.distance, 0)),
    set: Math.max(1, Math.floor(finiteNonNegative(lastRun.set, 1))),
    duration: Math.round(finiteNonNegative(lastRun.duration, 0)),
    at,
  };
}

function createModeRecords() {
  return Object.fromEntries(Object.keys(RUN_MODES).map((id) => [id, sanitizeModeRecord()]));
}

function sanitizeModeRecords(candidate, { legacyBestScore = 0, legacyBestFlow = 0 } = {}) {
  const source = candidate && typeof candidate === "object" ? candidate : {};
  const records = createModeRecords();
  for (const id of Object.keys(RUN_MODES)) records[id] = sanitizeModeRecord(source[id]);
  // Profiles written before modes existed were 78-second sessions. Preserve
  // their history under Score Attack while the new primary mode starts clean.
  if (!source.scoreAttack || typeof source.scoreAttack !== "object") {
    records.scoreAttack.bestScore = legacyBestScore;
    records.scoreAttack.bestFlow = legacyBestFlow;
  }
  return records;
}

function sanitizeModeRecord(record = null) {
  const source = record && typeof record === "object" ? record : {};
  return {
    bestScore: Math.round(finiteNonNegative(source.bestScore, 0)),
    bestFlow: Math.round(finiteRange(source.bestFlow, 0, 0, 100)),
    bestDistance: Math.round(finiteNonNegative(source.bestDistance, 0)),
    bestSet: Math.max(1, Math.floor(finiteNonNegative(source.bestSet, 1))),
    longestRide: Math.round(finiteNonNegative(source.longestRide, 0)),
  };
}

function resolveModeId(modeId) {
  return Object.hasOwn(RUN_MODES, modeId) ? modeId : DEFAULT_RUN_MODE_ID;
}

function finiteNonNegative(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function finiteRange(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
