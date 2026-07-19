function atlas(filename, columns, rows, cellWidth, cellHeight, names, {
  anchor = [0.5, 0.5],
  optional = true,
} = {}) {
  const frames = Object.create(null);
  names.forEach((name, index) => {
    frames[name] = Object.freeze({
      x: (index % columns) * cellWidth,
      y: Math.floor(index / columns) * cellHeight,
      width: cellWidth,
      height: cellHeight,
      anchor: Object.freeze([...anchor]),
    });
  });
  return Object.freeze({
    filename,
    width: columns * cellWidth,
    height: rows * cellHeight,
    optional,
    frames: Object.freeze(frames),
  });
}

export const GENERATED_ASSET_MANIFEST = Object.freeze({
  waveBreaker: atlas("wave-breaker-atlas.png", 4, 2, 72, 64, [
    "crestFeatherA", "crestFeatherB", "risingCurl", "impact",
    "whitewaterChurn", "foamTendrils", "sprayBurst", "seaMist",
  ], { anchor: [0.5, 1] }),
  waveProgression: atlas("wave-progression-atlas.png", 2, 2, 160, 96, [
    "swell", "pitch", "curl", "impact",
  ], { anchor: [1, 1] }),
  dolphin: atlas("dolphin-atlas.png", 4, 2, 56, 40, [
    "approach", "offer", "mountedGlide", "compress",
    "breach", "corkscrew", "tailSlap", "dismount",
  ], { anchor: [0.5, 0.78] }),
  shark: atlas("shark-atlas.png", 4, 2, 56, 36, [
    "deepShadow", "finTelegraph", "closeFin", "crossing",
    "jumpUnder", "nearMiss", "comicSplash", "retreat",
  ], { anchor: [0.5, 0.76] }),
  whale: atlas("whale-atlas.png", 4, 2, 88, 54, [
    "distantShadow", "blowTelegraph", "swellLift", "breachAnticipation",
    "breach", "rideableBack", "giantSplash", "departure",
  ], { anchor: [0.5, 0.84] }),
  birds: atlas("birds-atlas.png", 4, 2, 34, 24, [
    "gullGlide", "gullFlap", "pelicanSkim", "pelicanCourier",
    "ternBank", "cormorantDive", "flock", "scatter",
  ], { anchor: [0.5, 0.55] }),
  boats: atlas("boats-atlas.png", 4, 2, 64, 34, [
    "sailboat", "speedboat", "fishingBoat", "tugboat",
    "cargoShip", "jetSki", "rescueCraft", "escortBoat",
  ], { anchor: [0.5, 0.82] }),
  airTraffic: atlas("air-traffic-atlas.png", 4, 2, 72, 32, [
    "propPlane", "seaplane", "helicopter", "fastPlane",
    "bannerPlane", "parachuteDrop", "airshowFormation", "launchClimb",
  ], { anchor: [0.5, 0.52] }),
  powerups: atlas("powerups-atlas.png", 4, 2, 24, 24, [
    "mangoRush", "moonPop", "starFoam", "dolphinCall",
    "mangoHalo", "moonHalo", "starHalo", "pickupBurst",
  ]),
  boards: atlas("boards-atlas.png", 4, 3, 64, 24, [
    "foamPuffTop", "foamPuffRail", "foamPuffFlexConcept", "foamPuffUnderside",
    "mangoFishTop", "mangoFishRail", "mangoFishFlexConcept", "mangoFishUnderside",
    "moonLogTop", "moonLogRail", "moonLogFlexConcept", "moonLogUnderside",
  ], { anchor: [0.5, 0.62] }),
  carrier: atlas("carrier-atlas.png", 4, 2, 96, 50, [
    "hazeSilhouette", "festivalCarrier", "islandLights", "radarDish",
    "deckCrew", "deckAircraft", "escortVessel", "layeredWake",
  ], { anchor: [0.5, 0.82] }),
  uiOrnaments: atlas("ui-ornaments-atlas.png", 4, 2, 80, 52, [
    "titleCrest", "foamPuffEmblem", "mangoFishEmblem", "moonLogEmblem",
    "simpleControlsGlyph", "blankRibbon", "wildlifeSpecialBadge", "resultsMedallion",
  ]),
});

export function atlasFrame(manifest, name) {
  return manifest?.frames?.[name] ?? null;
}
