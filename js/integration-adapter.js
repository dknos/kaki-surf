import { preloadVisualAssets } from "./asset-loader.js";

/**
 * Narrow host boundary for a future Kitty Kaki Survivors integration.
 * The standalone launcher uses the same contract, so embedded behavior is not a fork.
 */
export async function createKakiSurf({
  host,
  input = null,
  audio = null,
  storage = globalThis.localStorage,
  settings = null,
  profile = null,
  onExit = null,
  onRunComplete = null,
  qaScene = null,
} = {}) {
  if (!(host instanceof HTMLElement)) {
    throw new TypeError("Kaki Surf requires a host HTMLElement.");
  }
  const [visualAssets, { KakiSurfGame }] = await Promise.all([
    preloadVisualAssets(),
    import("./game.js"),
  ]);
  const game = new KakiSurfGame({
    host,
    externalInput: input,
    externalAudio: audio,
    storage,
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
