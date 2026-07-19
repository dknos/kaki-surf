# Controls and gameplay feel

## Input map

The same five step actions are available on keyboard, standard-layout gamepads, touch, and an optional host input adapter. A trick button changes meaning with context; it never collapses back into a generic Style action.

| Intent | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Carve on the face | Arrows or WASD | Left stick or D-pad | Direction pad |
| Body spin left/right in air | A/D or Left/Right | Left stick or D-pad | Left/Right |
| Board trim in air | W/S or Up/Down | Left stick or D-pad | Up/Down |
| Pump / compress / commit | Space or Z | A (button 0) or right trigger (7) | Separate Pump button |
| Q: Rail | Q; legacy X or C | X (2) or left bumper (4) | Left point of trick diamond |
| E: Tail | E | Y (3) or right bumper (5) | Top point of trick diamond |
| F: Flip | F | B (1) | Bottom point of trick diamond |
| T: Twist | T | Left trigger (6) or right-stick press (11) | Right point of trick diamond |
| Pause | Escape or P | Start (9) | Open Settings to pause |
| Restart / retry | R; Space on results | B on results; A on results | Results button |
| Debug tuning | Backtick | Not mapped | Not mapped |

The gamepad names above follow the browser Standard Gamepad layout. B is a live Board Varial input while surfing and a retry input only on the results screen; it does not restart an active ride.

The touch layout keeps its direction pad on the left. On the right, Q/E/F/T form a compact diamond with Pump beside it. Pointer state is tracked independently, so a player can steer while holding a grab, use more than one action pointer, and release one direction without cancelling another. Buttons expose visible pressed state and the cluster scales down in short landscape layouts.

## Pressed, held, and released contract

`js/input.js` exports a 120 ms `BUFFER_WINDOW`. For Pump and all four trick actions:

- `actionPressed` is retained for up to 120 ms or until the fixed-step simulation consumes it.
- `action` is the live held state and remains true for the physical hold.
- `actionReleased` is retained for up to 120 ms or until consumed.

Keyboard repeat cannot create another press. Overlapping aliases are one logical action: holding X and then pressing C does not duplicate Q, and Q/X/C release only when the final alias is released. The legacy `style`, `stylePressed`, and `styleReleased` fields mirror `trick1` for old host adapters.

Each analog-stick axis has an 18% dead zone and is rescaled outside it. Blur, pause, restart, and destroy clear held state, edge buffers, touch pointers, and meta actions. After a clear, a still-held gamepad must return to neutral before it can create a fresh action edge.

## Contextual trick map

| Button | On the wave | Eligibility | Rejection hint | In the air |
| --- | --- | --- | --- | --- |
| Q | Snap / slash | A real carve and no maneuver cooldown | `CARVE FIRST` | Front Rail Grab |
| E | Cutback / layback | A real carve, cooldown clear, and enough space from the curl | `CARVE FIRST` or `TOO DEEP` | Tail Grab |
| F | Floater / re-entry | At the lip or within the crest band, with timing cooldown clear | `NEED LIP` or `TIME THE LIP` | Board Varial |
| T | Tube Tuck; Soul Arch on Moon Log | Held in the critical/pocket area and a usable face band | `FIND POCKET` | Kaki Twist |

An ineligible on-wave input emits a `trickRejected` event with `context: "wave"`, presents the short hint, and awards no maneuver points. Valid maneuvers are mechanical:

- Snap redirects the carve toward the useful line and costs extra speed when performed on a poor line.
- Cutback reverses face velocity, redirects toward the curl, and gives up some speed for pocket position.
- Floater holds speed across the lip and preserves the launch-coyote opportunity.
- Tube Tuck or Soul Arch narrows steering to 46% while held and earns style only in the eligible pocket.

## Aerial composition

Horizontal input always controls Kitty's accumulated body spin. Vertical input trims the board relative to the body. The aerial trick manifest then adds pose motion or board-relative motion on top of those controls:

- Q and E are hold tricks. Front Rail enters fastest; Tail Grab pays more, makes trim more sensitive, rewards an apex hold, and adds late-release risk while descending.
- F is a discrete full board-relative turn. It needs at least 0.08 seconds before starting, 0.44 seconds of total air, and 4 logical pixels of height. An incomplete varial can leave a bad board orientation.
- T is the signature counter-rotation. It needs at least 0.28 seconds before starting, 0.78 seconds of total air, and 18 logical pixels of height. Board-specific timing, motion, score, and risk modifiers make each version distinct.

Different tricks can be sequenced during one launch. Starting one grab ends the other active grab, but a completed grab can chain into a varial or signature. The same trick cannot be started twice in one aerial; the restrained rejection is `CHAIN ANOTHER`. Starting too early reports `WAIT FOR AIR`, and a height gate reports `NEED MORE POP`.

Examples of valid composition include:

- Hold Right and Q for `180 FRONT RAIL`, then use Up/Down to trim.
- Hold Right, hold and release E through the apex, tap F, then land for `360 TAIL GRAB + VARIAL`.
- Build a larger Moon Log launch, start T after the gate, continue spinning, and align the independently counter-rotating board for `KAKI TWIST` plus rotation.

See [Trick grammar](./TRICK-GRAMMAR.md) for manifest fields, exact naming, gates, and scoring behavior.

## Wave reading and pumping

Physics and presentation both call `GameplayWave.powerFaceAt(x)` and `GameplayWave.speedPotential(x, face, options)`. The renderer must not invent a second fast-line formula.

The shared query classifies three zones:

1. **Safe shoulder:** lower pocket risk, calmer streaks, stable recovery space, and modest acceleration. An off-line position is also classified safe even if it is nearer the pocket.
2. **Power seam:** within 0.12 normalized face units of the moving target and close enough to the pocket to sustain drive. Seafoam/gold beads, faster streaks, wake, an entry chirp, and the HUD communicate acquisition.
3. **Critical curl:** the breaking area or pocket risk at least 0.78. Dark folding water, whitewater mass, foam fingers, sparse coral marks, stronger surf noise, and multiplier pressure distinguish danger from the sustainable seam.

Hold Pump to charge, compress Kitty, and flex the board. Release with more than 0.12 charge while still on the face to convert charge, carve rhythm, board pump identity, and the shared `pumpEfficiency` into speed. The compact Pump meter turns gold when efficiency is strong; thresholded charge notes teach the build without sounding every simulation step. A timed release creates a larger spray and impact response, while poor line timing produces less boost.

The intended rhythm is playable rather than modal: climb, hold Pump, drop toward the seam, release, accelerate, return to the lip, and launch.

## Wave Read Assist

Wave Read Assist changes presentation only. It never changes physics, score, or eligibility.

| Mode | Presentation |
| --- | --- |
| Full | Stronger seam beads, a nearby correction arrow, `TOO HIGH` / `TOO LOW` / `POWER LINE` labels, acquisition callout, landing label, and the first-run teaching overlay |
| Subtle | Natural seam, directional streaks, spray, board wake, and audio; no persistent correction arrow or teaching panel |
| Off | Keeps world animation and the base physical seam readable but removes assist-only arrows, labels, and the lower teaching panel |

High Contrast also strengthens the seam and landing label. Steering Assist and Landing Assist are separate options; either applies the displayed 18% scoring reduction, while Wave Read Assist does not.

## First-run teaching

Until a completed run records `tutorialSeen`, the ride stages three short prompts rather than showing a wall of instructions:

1. After entry: `CLIMB + HOLD PUMP`.
2. Around four seconds or once Kitty reaches the upper face: `DROP TO POWER SEAM + RELEASE`.
3. Around seven seconds or on reaching the lip: `FIND LIP / Q E F T IN AIR`.

The short first-run callouts come from simulation in every mode. In Full mode, the lower teaching card additionally mirrors this flow with `LOAD THE BOARD`, seam correction language, and the four trick labels, then fades by roughly 13 seconds.

## Speed feedback

The fixed tiers are `STALLING` below 52, `GLIDING` below 78, `FLOWING` below 101, `FLYING` below 124, and `MAX FLOW` at 124 or above. Speed is redundantly communicated through:

- the compact flow gauge and tier name;
- board-specific wake length and spray shape;
- speed-driven spray density and water-streak motion;
- pump compression/release poses, board flex, and aerial posture;
- travel-driven background parallax;
- wave-filter pitch, music density, and high-tier audio accents;
- restrained semantic cues for combo-tier growth, trick start/completion, and rejected inputs;
- vibration or dual-rumble events where the device and browser support them.

## Landing and banking

The dotted landing tangent is simulation-derived. The aerial landing panel shows current alignment against perfect, clean, and recovery bands and indicates whether error is improving. Full Wave Read or High Contrast also labels the world-space tangent.

Perfect and clean landings bank the completed aerial at their quality values. A wobble landing banks a reduced aerial, weakens combo heat, and loses more speed. A wipeout clears the provisional name and score, resets the combo, and banks none of the aerial value. Exact repeats decay by the complete landed signature, not by a generic spin label.

Runs last 78 seconds or three wipeouts. A short recovery returns the player to the wave when time and paws remain.
