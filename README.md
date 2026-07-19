# Kaki Surf

Kaki Surf is a standalone, no-bundler Canvas score-attack game starring Kitty Kaki. It runs at a fixed 384 x 216 logical resolution with a 1/120-second gameplay step and deploys directly to any static host.

**[Play Kaki Surf on GitHub Pages](https://dknos.github.io/kaki-surf/)**

![Kitty Kaki surfing a pixel wave](docs/images/ride.png)

## Quick play

Open the hosted game above, or serve this directory over HTTP and open `index.html`. For example:

```console
python -m http.server 8000
```

Then visit `http://localhost:8000`, choose one of three boards and one of three surf conditions, and select **Drop In**. No build or package installation is required.

| Intent | Keyboard | Gamepad |
| --- | --- | --- |
| Carve; spin or trim in air | Arrows or WASD | Left stick or D-pad |
| Pump / compress / commit | Space or Z | A or right trigger |
| Rail move / Front Rail Grab | Q; legacy X or C | X or left bumper |
| Tail move / Tail Grab | E | Y or right bumper |
| Lip move / Board Varial | F | B |
| Pocket move / Kaki Twist | T | Left trigger or right-stick press |
| Pause | Escape or P | Start |
| Restart | R | B on results |

Touch play uses a directional pad, a separate Pump button, and a four-button Q/E/F/T trick diamond. The controls accept simultaneous direction and trick pointers, so held grabs and aerial trim work on touch.

## Read, pump, launch

The face has three strategic zones: a calm safe shoulder, a shifting seafoam-and-gold power seam, and a dangerous critical curl. Hold Pump while climbing to compress, drop toward the seam, then release into the line for the strongest boost. Wake length, spray, moving water streaks, Kitty's pose, the flow tier, audio, and supported rumble all reinforce speed.

On the wave, Q/E/F/T become Snap, Cutback, Floater, and Tube Tuck (or Moon Log's Soul Arch). In the air they become Front Rail Grab, Tail Grab, Board Varial, and Kaki Twist. Left/right body spin and up/down board trim remain independent, so spins, holds, and sequenced tricks can be composed without entering a canned animation. Aerial points are provisional until the board meets the landing tangent; a wipeout loses the provisional bank.

See [Controls and gameplay](docs/CONTROLS-AND-FEEL.md) for device mappings and contextual eligibility, and [Trick grammar](docs/TRICK-GRAMMAR.md) for the simulation and host-input contract.

## Boards and conditions

- **Foam Puff** is the beginner recovery board: rounded and thick, with the widest landing modifier, strong trim, and low commitment.
- **Mango Fish** is the technical combo board: a sharp fish silhouette with fast rails, strong grip, and quick spins.
- **Moon Log** is the expert momentum board: a long silhouette with the highest speed and pop, slower correction, and high-value long holds and signatures.

Golden Coast, Twilight Glass, and Stormbreak share fair gameplay-wave physics while changing palette, horizon treatment, atmosphere, and reactive music.

## Validation

The repository has no third-party runtime or test dependencies. Run the native Node test suite and syntax validation from this directory:

```console
npm test
npm run check
```

The latest integrated run passes 44 tests plus syntax and Git whitespace checks. See [validation results](docs/TEST-RESULTS.md) and the [26-state production QA contact sheet](docs/images/qa-contact-sheet.png).

## Static deployment

Browsers require the native module files to be served over HTTP rather than opened through a `file://` URL. All runtime imports and assets use relative local URLs; there is no bundle, generated build directory, remote gameplay asset, or runtime image-generation API.

The optional repository-level Sites wrapper is only a preview/deployment shell. The complete game lives in this directory and can be copied to a GitHub Pages branch or another static host unchanged.

## Architecture and host integration

Gameplay truth is renderer-independent. `js/wave.js` owns the canonical power seam and speed-potential queries; `js/tricks.js` owns the aerial manifest; `js/trick-scoring.js` names and values it; and `js/sprites.js` plus `js/wave-visuals.js` render the production code-authored pixel work.

`js/integration-adapter.js` exports `createKakiSurf({ host, input, audio, storage, settings, profile, onExit, onRunComplete, qaScene })`. It returns `start`, `pause`, `resume`, `restart`, `destroy`, and `getSnapshot` lifecycle methods.

See [ADR-001](docs/ADR-001-standalone-canvas.md) for determinism and integration boundaries, [Asset manifest](docs/ASSET-MANIFEST.md) for production provenance, and [Hero source map](docs/HERO-SOURCE-MAP.md) for the reference-only Kitty Kaki Survivors identity mapping.
