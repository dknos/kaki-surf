# Kaki Surf

Kaki Surf is a standalone, no-bundler Canvas arcade game starring Kitty Kaki. Copy this directory to any static host or GitHub Pages branch and open `index.html` through HTTP.

**[Play Kaki Surf](https://dknos.github.io/kaki-surf/)**

![Kitty Kaki surfing a pixel wave](docs/images/ride.png)

## Play

- Carve: arrow keys, WASD, controller stick, or D-pad.
- Pump / commit: Space, Z, controller A, or right trigger. Hold to compress; release to turn timing into speed.
- Style: X, C, or controller X. Hold in the air for a grab bonus.
- Pause: Escape, P, or controller Start.
- Restart: R or controller B. Space/A also retries from results.
- Debug tuning: backtick.

Climb toward the lip with a strong upward carve to launch. In the air, horizontal input controls rotation and vertical input trims the board independently. Match the dotted landing tangent before contact. Staying near the curl raises the risk multiplier, but repeated tricks decay.

## Static launch

No compilation or package installation is required for the standalone game. Browsers require module files to be served over HTTP rather than opened as `file://` URLs.

The optional repository-level Sites wrapper is only a preview/deployment shell. The complete game lives in this folder and keeps relative URLs so it can be updated or deployed independently.

## Project status

This repository is the independent Kaki Surf release. It can evolve in parallel with Kitty Kaki Survivors and later connect through the documented host adapter. Gameplay art is manually authored on the logical pixel grid; the canonical Survivors GLBs are reference and identity metadata rather than runtime downloads.

## Host integration

`js/integration-adapter.js` exports `createKakiSurf({ host, input, audio, storage, settings, profile, onExit, onRunComplete })` and returns lifecycle methods:

`start`, `pause`, `resume`, `restart`, `destroy`, and `getSnapshot`.

See `docs/ADR-001-standalone-canvas.md` for the later Kitty Kaki Survivors boundary.

See `docs/HERO-SOURCE-MAP.md` for the canonical mapping from Kitty Kaki,
CowboyKaki, and the remaining Survivors avatar ids to their source GLBs.
