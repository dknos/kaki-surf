import { preloadVisualAssets } from "./asset-loader.js";
import { resolveStorage } from "./persistence.js";

/**
 * Narrow host boundary for a future Kitty Kaki Survivors integration.
 * The standalone launcher uses the same contract, so embedded behavior is not a fork.
 */
export async function createKakiSurf({
  host,
  input = null,
  audio = null,
  storage = undefined,
  settings = null,
  profile = null,
  onExit = null,
  onRunComplete = null,
  qaScene = null,
} = {}) {
  if (!(host instanceof HTMLElement)) {
    throw new TypeError("Kaki Surf requires a host HTMLElement.");
  }
  // Resolve once at the public boundary so every persistence call in the game
  // receives the same concrete storage object or an intentional null.
  const resolvedStorage = resolveStorage(storage);
  const [visualAssets, { KakiSurfGame }] = await Promise.all([
    preloadVisualAssets(),
    import("./game.js"),
  ]);
  const game = new KakiSurfGame({
    host,
    externalInput: input,
    externalAudio: audio,
    storage: resolvedStorage,
    hostSettings: settings,
    profile,
    onExit,
    onRunComplete,
    qaScene,
    visualAssets,
  });

  return Object.freeze({
    start: (options) => game.start(options),
    pause: (reason) => game.pause(reason),
    resume: () => game.resume(),
    restart: () => game.restart(),
    destroy: () => game.destroy(),
    getSnapshot: () => game.getSnapshot(),
  });
}
