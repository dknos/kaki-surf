import { GENERATED_ASSET_MANIFEST } from "./asset-manifest.js";

const CONDITION_IDS = Object.freeze([
  "goldenCoast",
  "twilightGlass",
  "stormbreak",
]);

const BACKGROUND_WIDTH = 384;
const BACKGROUND_HEIGHT = 80;

let visualAssetsPromise = null;

/**
 * Decode presentation art before the game is constructed. Every image fails
 * independently so the code-authored renderer remains a complete fallback.
 */
export function preloadVisualAssets() {
  if (!visualAssetsPromise) visualAssetsPromise = loadVisualAssets();
  return visualAssetsPromise;
}

async function loadVisualAssets() {
  const requests = [];
  for (const conditionId of CONDITION_IDS) {
    requests.push(loadImage(conditionId, "backgrounds", `${conditionId}-strip.png`, true));
    requests.push(loadImage(conditionId, "menus", `${conditionId}-menu.png`, false));
  }
  for (const [family, descriptor] of Object.entries(GENERATED_ASSET_MANIFEST)) {
    requests.push(loadGeneratedAtlas(family, descriptor));
  }

  const backgrounds = Object.create(null);
  const menus = Object.create(null);
  const generated = Object.create(null);
  const missing = [];
  for (const result of await Promise.all(requests)) {
    if (result.group === "generated") {
      generated[result.family] = result.image;
      if (!result.image) missing.push(`generated:${result.family}`);
    } else {
      const target = result.group === "backgrounds" ? backgrounds : menus;
      target[result.conditionId] = result.image;
      if (!result.image) missing.push(`${result.conditionId}:${result.group}`);
    }
  }

  return Object.freeze({
    backgrounds: Object.freeze(backgrounds),
    menus: Object.freeze(menus),
    generated: Object.freeze(generated),
    generatedManifest: GENERATED_ASSET_MANIFEST,
    missing: Object.freeze(missing),
  });
}

async function loadImage(conditionId, group, filename, validateBackground) {
  if (typeof Image !== "function") return { conditionId, group, image: null };
  const image = new Image();
  image.decoding = "async";
  const url = new URL(`../assets/backgrounds/${filename}`, import.meta.url);

  try {
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
      image.src = url.href;
    });
    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        // A successfully loaded image is still drawable when eager decode is unavailable.
      }
    }
    if (validateBackground && (image.naturalWidth !== BACKGROUND_WIDTH || image.naturalHeight !== BACKGROUND_HEIGHT)) {
      return { conditionId, group, image: null };
    }
    return { conditionId, group, image };
  } catch {
    return { conditionId, group, image: null };
  }
}

async function loadGeneratedAtlas(family, descriptor) {
  if (typeof Image !== "function") return { family, group: "generated", image: null };
  const image = new Image();
  image.decoding = "async";
  const url = new URL(`../assets/generated/${descriptor.filename}`, import.meta.url);
  try {
    await new Promise((resolve, reject) => {
      image.addEventListener("load", resolve, { once: true });
      image.addEventListener("error", reject, { once: true });
      image.src = url.href;
    });
    if (typeof image.decode === "function") {
      try {
        await image.decode();
      } catch {
        // A loaded optional atlas remains drawable without eager decode.
      }
    }
    const valid = image.naturalWidth === descriptor.width
      && image.naturalHeight === descriptor.height;
    return { family, group: "generated", image: valid ? image : null };
  } catch {
    return { family, group: "generated", image: null };
  }
}
