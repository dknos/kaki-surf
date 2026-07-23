const CHARACTER_IDS = Object.freeze(["kaki", "soderSnek"]);

const kaki = Object.freeze({
  id: "kaki",
  displayName: "KAKI",
  menuDescription: "KAKI — Plush precision, fearless airs, maximum flow.",
  portraitFrame: "kakiPortrait",
  riderRendererId: "kaki",
  paletteAccents: Object.freeze({
    primary: "#f7d46b",
    secondary: "#7bd1cc",
    trail: "#fff6d8",
  }),
  moveNameOverrides: Object.freeze({}),
  trickEffectProfile: "kakiClassic",
  turboEffectProfile: "kakiElectric",
  audioAccentProfile: "kaki",
  animationProfile: "kaki",
});

const soderSnek = Object.freeze({
  id: "soderSnek",
  displayName: "SODER SNEK",
  menuDescription: "SODER SNEK — Coiled style, elastic poses, tremendous tongue control.",
  portraitFrame: "soderSnekPortrait",
  riderRendererId: "soderSnek",
  paletteAccents: Object.freeze({
    primary: "#73b94a",
    secondary: "#e178a5",
    trail: "#d6c28a",
  }),
  moveNameOverrides: Object.freeze({
    snap: "SNEK SNAP",
    cutback: "COIL CUTBACK",
    frontRailGrab: "TONGUE TAP",
    tailGrab: "TAIL COIL",
    boardVarial: "SHED FLIP",
    kakiTwist: "SODER SPIRAL",
    tubeTuck: "SERPENT TUCK",
    turboFullBurn: "SNEK'S COOKING",
  }),
  trickEffectProfile: "soderScales",
  turboEffectProfile: "soderElectric",
  audioAccentProfile: "soderSnek",
  animationProfile: "soderSnek",
});

export const CHARACTER_CATALOG = Object.freeze({
  kaki,
  soderSnek,
});

export const PLAYABLE_CHARACTER_IDS = CHARACTER_IDS;
export const DEFAULT_CHARACTER_ID = "kaki";

export function normalizeCharacterId(character) {
  const id = typeof character === "string" ? character : character?.id;
  return Object.hasOwn(CHARACTER_CATALOG, id) ? id : DEFAULT_CHARACTER_ID;
}

export function characterDefinition(character) {
  return CHARACTER_CATALOG[normalizeCharacterId(character)];
}

export function characterMoveName(character, canonicalId, fallback = canonicalId) {
  const definition = characterDefinition(character);
  return definition.moveNameOverrides[canonicalId] ?? fallback;
}

const PRESENTATION_MOVE_TERMS = Object.freeze([
  Object.freeze(["KAKI'S COOKING", "turboFullBurn"]),
  Object.freeze(["FRONTSIDE GRAB", "frontRailGrab"]),
  Object.freeze(["FRONT RAIL GRAB", "frontRailGrab"]),
  Object.freeze(["STALEFISH", "tailGrab"]),
  Object.freeze(["TAIL GRAB", "tailGrab"]),
  Object.freeze(["BOARD VARIAL", "boardVarial"]),
  Object.freeze(["KAKI TWIST", "kakiTwist"]),
  Object.freeze(["TUBE TUCK", "tubeTuck"]),
  Object.freeze(["FRONTSIDE SNAP", "snap"]),
  Object.freeze(["DEEP CUTBACK", "cutback"]),
  Object.freeze(["CUTBACK", "cutback"]),
  Object.freeze(["SNAP", "snap"]),
]);

/**
 * Presentation-only text replacement. Canonical move IDs remain the scoring,
 * replay, and integration identity for every character.
 */
export function characterMoveText(character, text = "") {
  if (normalizeCharacterId(character) === DEFAULT_CHARACTER_ID) return String(text ?? "");
  let result = String(text ?? "");
  for (const [term, canonicalId] of PRESENTATION_MOVE_TERMS) {
    result = result.replaceAll(term, characterMoveName(character, canonicalId, term));
  }
  return result;
}
