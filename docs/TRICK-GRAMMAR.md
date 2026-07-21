# Trick grammar and integration reference

Kaki Surf composes an aerial from four independent layers:

```text
launch + accumulated body rotation + ordered trick sequence + landing quality
```

Left/right rotation is never replaced by a canned trick animation. Up/down board trim remains independent from Kitty's body rotation, while a Varial or Kaki Twist adds authored board-relative motion. `js/tricks.js` owns this renderer-free state, `js/trick-scoring.js` names and values it, and `js/scoring.js` previews or banks the result.

## Public modules

| Module | Relevant exports |
| --- | --- |
| `js/trick-catalog.js` | `TRICK_CATALOG`, `TRICK_ACTIONS`, `TRICK_IDS`, `getTrickDefinition`, `getBoardSpecialty`, `trickIdForAction` |
| `js/tricks.js` | `AerialTrickSession`, `createAerialSession`, `normalizeTrickInput` |
| `js/trick-scoring.js` | `quantizeRotationDegrees`, `completedTrickEntries`, `buildTrickSignature`, `formatTrickName`, `repeatDecayForEntries`, `scoreAerialManifest`, `createLegacyAerialManifest` |
| `js/scoring.js` | `ScoreSystem` preview, landing bank, combo, buckets, and exact-repeat history |

Catalog records are frozen data. They contain no renderer callbacks, DOM references, or score-system mutations.

## Input contract

Every fixed gameplay step accepts this shape:

```js
const step = {
  x: 0,
  y: 0,
  edge: false,
  edgePressed: false,
  edgeReleased: false,

  trick1: false,
  trick1Pressed: false,
  trick1Released: false,
  trick2: false,
  trick2Pressed: false,
  trick2Released: false,
  trick3: false,
  trick3Pressed: false,
  trick3Released: false,
  trick4: false,
  trick4Pressed: false,
  trick4Released: false,

  trick: false,
  trickPressed: false,
  trickReleased: false,
  special: false,
  specialPressed: false,
  specialReleased: false,
  spinLeft: false,
  spinLeftPressed: false,
  spinLeftReleased: false,
  spinRight: false,
  spinRightPressed: false,
  spinRightReleased: false,
};
```

The un-suffixed field is held state. `Pressed` and `Released` are one-shot edges; the built-in `InputManager` retains those edges for 120 ms or until consumed. An external adapter may produce the contract directly but must preserve the same semantics and clear all fields on pause, restart, blur, and unmount.

`normalizeTrickInput(input, target)` also accepts `action` as an alias for `edge` and the migration fields `style`, `stylePressed`, and `styleReleased` as aliases for `trick1`. It preserves both mode contracts; `SurfSimulation` decides which actions are active from `controlMode`.

Simple Controls are the default. They activate `edge`, `turbo`, `trick`, `special`, `spinLeft`, and `spinRight`. A Simple Trick press is buffered by simulation, then mapped to an eligible manifest entry once airborne: hold for a grab, tap for the next discrete/variety option, and use an unused grab as a fallback when a large move misses its gate. Optional spin impulses coexist with ordinary horizontal body-spin input. Late descent receives board-specific auto-level toward the nearest regular or opposite-facing landing tangent.

Advanced Controls activate `edge`, the common `turbo` action, and `trick1` through `trick4`, preserving the original direct catalog mapping:

The built-in physical mapping is:

| Action | Keyboard | Standard gamepad | Touch cluster |
| --- | --- | --- | --- |
| `trick1` | Q, legacy X/C | X or left bumper | Left / Rail |
| `trick2` | E | Y or right bumper | Top / Tail |
| `trick3` | F | B | Bottom / Flip |
| `trick4` | T | Left trigger or right-stick press | Right / Twist |

## Advanced context switch on the wave

In Advanced mode, `SurfSimulation.updateRidingManeuvers` consumes the same logical presses before a launch. In Simple mode, Trick is reserved for the buffered aerial intent and Action owns pumping/pop:

| Action | Maneuver | Eligibility | Rejection |
| --- | --- | --- | --- |
| `trick1` | Snap | Absolute face velocity at least `SCORE.carveMinVelocity` (0.28) and cooldown clear | `CARVE FIRST` |
| `trick2` | Cutback | Absolute face velocity at least 0.2, cooldown clear, risk at most 0.9, and at least 24 units from curl | `CARVE FIRST` or `TOO DEEP` |
| `trick3` | Floater | Face at most 0.14 or state `lip`, with cooldown clear | `NEED LIP` or `TIME THE LIP` |
| `trick4` | Tube Tuck; Moon Log Soul Arch | Held while zone is critical or risk is at least 0.58, with face from 0.16 through 0.76 | `FIND POCKET` |

Invalid inputs emit `trickRejected` with the action, move ID, hint, and `context: "wave"`. They also emit the short callout, do not start the move, and award no maneuver score. Valid T is evaluated continuously while held; the other maneuvers use one logical press and a cooldown.

## Aerial catalog

| Action | ID | Category | Input model | Core gates and identity |
| --- | --- | --- | --- | --- |
| Q / `trick1` | `frontRailGrab` | `grab` | Hold | 0.075 s entry; lowest risk; duration and apex bonus |
| E / `trick2` | `tailGrab` | `grab` | Hold | 0.14 s entry; higher base/duration value; trim multiplier; late-hold risk |
| F / `trick3` | `boardVarial` | `board` | Discrete | Start after 0.08 s; 4 px height; 0.44 s total air; one board-relative turn |
| T / `trick4` | `kakiTwist` | `signature` | Discrete | Start after 0.28 s; 18 px height; 0.78 s total air; body/board counter-rotation |

Every catalog definition includes identity/display fields and the following tuning fields as applicable:

- `entryDuration`, `hold`, `discrete`, `canChain`;
- `minStartAirtime`, `minAirtime`, `minHeight`, `completionThreshold`;
- `baseScore`, `durationScore`, `durationCap`, `risk`, `repeatDecay`;
- `boardTurns`, `bodyPose`, `boardCounterRotation`, `trimMultiplier`, `lateHoldRiskRate`;
- a `specialties` record keyed by board ID.

A specialty may multiply entry time, score, risk, board-motion timing, and trim. Kaki Twist also receives `softPaw`, `mangoWhip`, or `moonArc` as its board-specific signature variant.

## Session lifecycle

Create one `AerialTrickSession` for each launch:

```js
import { AerialTrickSession } from "../js/tricks.js";

const tricks = new AerialTrickSession({
  boardId: "mangoFish",
  launchData: {
    potential: 31,
    launchStrength: 1.08,
    launchSpeed: 112,
    pocketRisk: 0.64,
    multiplier: 2.1,
    boardStyle: 1.08,
  },
});

tricks.primeInput(inputAtLaunch);

const events = tricks.update(1 / 120, inputStep, {
  angularVelocity,
  horizontalInput: inputStep.x,
  rotationDirection: Math.sign(angularVelocity || inputStep.x) || 1,
  rotationAccumulated,
  maxHeight,
  apex: Math.abs(verticalVelocity) < 14,
  descending: verticalVelocity > 12,
});

const landedManifest = tricks.finalizeLanding({
  rotationAccumulated,
  quality: "clean",
});
```

`primeInput` locks actions already held at takeoff so a riding input does not accidentally start an aerial trick. The action must return to neutral before it can create a new start.

`update` returns zero or more `{ type, id, hint }` records. Types are `trickStarted`, `trickCompleted`, and `trickRejected`. Rejections are intentional gameplay language:

Those exact semantic event names pass through the simulation to both renderer and audio; the presentation layer does not maintain a second trick-state vocabulary.

- `CHAIN ANOTHER` when that trick ID already appears in the launch sequence;
- `WAIT FOR AIR` before its start-time gate;
- `NEED MORE POP` below its height gate;
- `HOLD IT` when a grab is released before completing entry.

Starting a grab finishes any other active grab. Finished entries remain in sequence order and a different trick can start immediately when its gates allow. Discrete input locks prevent held keys or keyboard repeat from farming more than one entry.

Call `finalizeLanding` once on contact, or `wipeout` once when the launch is lost. Both make the session final; later `update` calls are inert.

## Manifest schema

`session.manifest` is intentionally plain data suitable for tests, renderers, host telemetry, and a future replay layer.

| Field | Meaning |
| --- | --- |
| `version` | Manifest schema version, currently 1 |
| `sequence` | Ordered array of attempted trick entries |
| `heldDurations` | Total held seconds by trick ID |
| `completion` | Completed entry count divided by attempted entry count |
| `poseProgress`, `trickPose`, `bodyPose` | Current renderer-facing pose state |
| `boardRelativeRotation` | Trick-authored board motion, independent of body spin and manual trim |
| `risk` | Aggregate clamped trick risk including late holds |
| `repetitionSignature` | Current preview or finalized exact signature |
| `rotationAccumulated`, `rotationDegrees` | Raw body rotation in radians and readable quantized result |
| `launchData` | Launch potential, strength, speed, velocity, pocket risk, multiplier, board style, and board ID |
| `maxHeight`, `airtime` | Highest rise in logical pixels and session seconds |
| `landed`, `landingQuality`, `wipedOut` | Finalization outcome |
| `invalidBoardOrientation` | True when final board-relative error exceeds 0.34 rad |
| `provisionalScore`, `provisionalTrickName` | Renderer-facing preview value and evolving name |

Each `sequence` entry contains:

| Field group | Fields |
| --- | --- |
| Identity | `id`, `action`, `category`, `direction`, `signatureVariant` |
| Timing | `startTime`, `endTime`, `elapsed`, `entryDuration`, `heldDuration`, `heldThroughApex`, `lateHoldDuration` |
| Completion | `completion`, `poseProgress`, `complete`, `landed`, `invalidBoardOrientation` |
| Motion | `boardRelativeRotation`, `bodyPose`, `boardMotionMultiplier`, `trimMultiplier` |
| Value | `risk`, `baseScore`, `repetitionSignature` |

An incomplete entry remains in `sequence` for diagnostics but is excluded from trick naming and points. If its unfinished board motion is more than 0.34 rad from neutral, its `invalidBoardOrientation` flag records why the tangent may have been difficult or impossible to meet.

## Board trim versus body spin

The simulation composes board orientation each air step:

```text
board target = body angle + manual vertical trim + manifest board-relative rotation
```

- Left/right input changes angular velocity, `bodyAngle`, and `rotationAccumulated`.
- Up/down input supplies manual trim scaled by air control and active grab sensitivity.
- Board Varial writes a full board-relative turn while Kitty's body spin continues.
- Kaki Twist applies an arcing board counter-rotation and an independent body pose.
- Landing compares the resulting `boardAngle` with `wave.slopeAt(airX, landingFace)`.

This separation is why `360 TAIL GRAB + VARIAL` can be a real composition rather than a renamed fixed animation.

## Rotation naming

`quantizeRotationDegrees` uses the final accumulated body rotation:

- below 135 degrees in magnitude: no rotation name;
- at or above 135 degrees: nearest 180-degree increment;
- unusually large landed spins continue in 180-degree increments;
- the display uses magnitude, while the signature retains clockwise or counterclockwise direction.

Examples produced by `formatTrickName` include:

| Completed manifest | Display name |
| --- | --- |
| No trick, no named rotation | `FLOATY POP` |
| No trick, one full turn | `360 AIR SPIN` |
| Front Rail, no spin | `FRONT RAIL GRAB` |
| Front Rail, half turn | `180 FRONT RAIL` |
| Tail Grab plus Varial, full turn | `360 TAIL GRAB + VARIAL` |
| Perfect single Varial, one and a half turns | `PERFECT 540 VARIAL` |
| Kaki Twist, two turns | `720 KAKI TWIST` |

The formatter does not infer a spin from a loose threshold crossed earlier in the launch; unwinding changes the final accumulated value before quantization.

## Full signatures and repeat decay

`buildTrickSignature` retains details intentionally omitted from the short display name:

```text
direction:rotation:ordered-entry-signatures
```

For example:

```text
cw:360:tailGrab:held:apex>boardVarial:complete
ccw:540:kakiTwist:complete:moonArc
```

Grab hold bands are `tap` below 0.28 seconds, `held` from 0.28 through less than 0.55, and `long` from 0.55 upward. The signature also retains held-through-apex state and Kaki's board variant.

The last four landed signatures are checked for exact equality. The repeat factor is `decay ^ priorMatches`: 0.58 per match by default, 0.50 when a Varial makes the string stricter, and 0.34 when it contains Kaki Twist. Direction, rotation size, order, different trick IDs, hold bands, apex state, or board-specific signature variant can make a genuinely different string.

## Provisional scoring and banking

`scoreAerialManifest(manifest, { preview: true })` is pure and does not mutate buckets. Preview valuation includes completed-so-far entries, launch potential, maximum height, quantized rotation, board style, launch multiplier, manifest risk, variety, and exact-repeat factor. Its landing bucket is always zero.

Base aerial valuation is built from:

- 45 launch points plus 0.18 times launch potential;
- 1.8 points per logical pixel of maximum height;
- 95 for 180 degrees, 260 for 360, then 175 per additional 180;
- completed Board Varial value in the air bucket;
- completed grab/signature values, hold duration, and apex bonuses in the style bucket;
- 42 style points per additional distinct trick and a 14% variety factor per additional distinct ID;
- up to a 10% manifest-risk factor, followed by board style, launch multiplier, landing quality, and repeat factor.

Final landing quality applies 1.10 to air/style for perfect, 1.00 for clean, and 0.55 for wobble. The separate landing bucket awards 240, 95, or 55 points respectively, scaled by the launch multiplier.

`ScoreSystem.registerLanding` performs the only bank:

1. finalize and filter to completed landed entries;
2. build the full landed signature and exact-repeat factor;
3. value the finalized manifest;
4. add air, style, and landing buckets;
5. update combo and push the signature into history;
6. clear the provisional bank.

Perfect preserves 103.5% of landing speed, clean preserves 94%, and wobble preserves 74% before clamping. Wobble also weakens combo heat. A wipeout calls `session.wipeout()` and `score.wipeout()`: provisional value and name clear, no aerial bucket is added, and combo returns to 1.

## Landing bands and preview state

The player exposes:

```js
player.landingPreview = {
  boardAngle,
  targetAngle,
  error,
  bands: { perfect, clean, recovery },
  improving,
};
```

The final contact bands are:

```text
perfect = 0.115 * assistScale
clean = 0.46 * board.landing * assistScale * (1 - manifest.risk * 0.18)
recovery = min(1.18, clean * 1.7)
```

`assistScale` is 1.4 with Landing Assist and 1 otherwise. Error through perfect banks perfect; error through clean banks clean; error through recovery banks wobble. Larger error has a 95 ms contact-recovery window before wipeout. `improving` becomes true when the next tracked angular error drops by more than 0.002 rad.

The compact HUD and world tangent visualize this state but do not change it.

## Renderer-facing player state

The simulation publishes these stable presentation fields without giving the renderer ownership:

- `trickPose` and `boardRelativeAngle` for the current trick silhouette and board separation;
- `provisionalTrickName` and `provisionalScore` for the evolving aerial panel;
- `maneuver: { id, progress }` for Snap, Cutback, Floater, Tube Tuck, or Soul Arch;
- `landingPreview` for tangent matching;
- `flowTier` and `speedPotential` for redundant wave/speed feedback;
- `trickManifest` for inspectable sequence details.

Renderers should prefer these values and semantic events. They must not mark entries complete, rename rotations, award points, or recreate wave eligibility.

## Host adapter notes

`createKakiSurf` accepts an optional external `input`. A compatible adapter should implement:

```js
const input = {
  update(renderDeltaSeconds) {},
  consumeStep() {
    return step;
  },
  consumeMeta() {
    return {
      restart: false,
      pause: false,
      retry: false,
      debug: false,
    };
  },
  clear() {},
};
```

The game calls `update` once per render frame and, while running, `consumeStep` once per fixed simulation step. It also consumes a step from menu/results frames for start or retry. A buffered press/release should survive until the first consumption; held fields should remain current on later steps. `clear` must remove every held and edge state. The game clears external input on lifecycle transitions but only destroys an internally created `InputManager`.

`start({ immediate, board, condition })` validates board and condition IDs. `getSnapshot()` returns lifecycle, simulation state, elapsed and remaining time, rounded score, current multiplier, wipeouts, board, condition, best score, and assist flags. `onRunComplete` receives the final result with score buckets, rank, flow, board, and condition. Host rewards should be translated there rather than inserted into trick or score modules.

See [ADR-001](./ADR-001-standalone-canvas.md) for the complete lifecycle and determinism boundary.
