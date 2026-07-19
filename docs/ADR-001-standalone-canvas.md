# ADR-001: Standalone fixed-step Canvas core

Status: accepted for the vertical slice, 2026-07-19.

## Decision

Build Kaki Surf as a self-contained native JavaScript module set with a 384×216 Canvas renderer, a fixed 1/120-second gameplay simulation, and an independent adapter for host input, audio, settings, storage, exit, and run-complete events.

Simulation, scoring, wave collision, input, rendering, audio, persistence, and host integration are separate modules. The gameplay wave exposes a stable crest/face function. The renderer animates foam, highlights, parallax, curl mass, particles, and camera response around that function without changing collision.

The standalone directory uses only relative URLs and needs no build step. A thin optional site page embeds the exact standalone launcher for preview and private hosting.

## Why

- Fixed-step simulation protects handling from 30/60/144 Hz render pacing.
- Canvas at a fixed logical resolution keeps the board, lip, curl, and landing tangent legible.
- No runtime dependency, GLB, or framework is required by the game.
- A separate save key (`kaki-surf-meta-v1`) cannot collide with Kitty Kaki Survivors' existing meta save.
- Independent lifecycle and listeners let both projects evolve in parallel.

## Alternatives considered

1. Embed directly into the mature Three.js town. Rejected for the first slice because existing global input/audio lifecycles and the broad integration surface create unrelated-mode regression risk.
2. Reuse the supplied plush GLB. Rejected for runtime use: 1.5 million triangles, three 4096² textures, roughly 300 MB estimated GPU footprint with mipmaps, and no rig, morphs, or animations.
3. Build a fluid or rigid-body simulation. Rejected because stable landing readability and fast tuning matter more than water realism.
4. Use a component framework for the gameplay core. Rejected because the game is a fixed-resolution render/simulation loop and must remain GitHub Pages compatible without compilation.

## Integration boundary

Later, mount the game within the existing `#kk-stage` and provide adapters rather than importing the existing global systems directly:

```js
const surf = await createKakiSurf({
  host,
  input,
  audio,
  storage,
  settings,
  profile,
  onExit,
  onRunComplete,
});
```

The host must suspend its own gameplay listeners while Surf owns focus, forward audio only after the browser's user-gesture unlock, and call `destroy()` on exit. No Survivor save schema changes are required.

## Consequences

The vertical slice uses deterministic code-authored pixel art and procedural audio instead of shared Three.js assets. Town rewards and cross-mode progression wait until the ride is validated by broader playtesting.
