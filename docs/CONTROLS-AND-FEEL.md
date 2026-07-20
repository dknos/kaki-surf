# Controls and gameplay feel

## Control modes

Simple Controls are the default for new saves. Advanced Controls preserve the direct Q/E/F/T scheme from earlier builds. The setting is persistent and switching modes clears held inputs and edge buffers so one mode cannot leak an action into the other.

### Simple Controls

| Intent | Keyboard | Standard gamepad | Touch |
| --- | --- | --- | --- |
| Travel left/right; carve up/down | Arrows or WASD | Left stick or D-pad | Direction pad |
| Action: compress, pump, and commit a lip pop | Space or Z | A (0) or right trigger (7) | **Action** |
| Context trick | F or X | X (2) or B (1) | **Trick** |
| Optional counterclockwise / clockwise spin impulse | Q / E | Left / right bumper | Left / right **Spin** |
| Mounted-animal special | T or either Shift | Y (3) | **Special** when ready |
| Pause | Escape or P | Start (9) | **II** pause button; Settings also pauses |
| Restart / retry | R; Space on results | B on results; A on results | Results button |

Action is always readable: hold on the face to compress, then release while carving upward on a useful line to earn an efficiency-scaled pump; carry that uphill line through the lip to launch. Releases below the charge/line gate consume their partial charge without a burst, and a short cadence floor rejects tapping. Action is not a permission button for ordinary speed; wave slope and signed motion produce the base acceleration.

Simple Trick is contextual and buffered. On Twilight's wave face, holding it inside the eligible critical pocket tucks Kaki into the tube; Moon Log uses its Soul Arch variant. Releasing Trick or leaving the pocket returns immediately to the ordinary riding pose. Around a launch, a held request chooses Front Rail Grab, or Tail Grab when held with down intent. A tap starts with Board Varial, then chooses an unused grab, then Kaki Twist when the launch is large enough. If a tap reaches a gate too late or without enough air, the simulation falls back to an unused grab instead of simply eating the input. The request buffer is 0.34 seconds in simulation time.

Late in descent, Simple mode nudges the board toward whichever landing tangent is nearer: normal or opposite-facing. The board-specific correction is strongest on Foam Puff and lightest on Moon Log. This is not a guaranteed landing; speed, trick-relative board motion, contact error, and the normal landing bands still apply.

### Advanced Controls

| Action | Keyboard | Standard gamepad | Touch control | On the wave | In the air |
| --- | --- | --- | --- | --- | --- |
| Rail / `trick1` | Q; legacy X or C | X (2) or left bumper (4) | Left Spin button | Snap / slash | Front Rail Grab |
| Tail / `trick2` | E | Y (3) or right bumper (5) | Right Spin button | Cutback / layback | Tail Grab |
| Flip / `trick3` | F | B (1) | Trick button | Floater / re-entry | Board Varial |
| Twist / `trick4` | T | Left trigger (6) or right-stick press (11) | Special button | Tube Tuck; Moon Log Soul Arch | Kaki Twist |

Advanced gamepad B is Board Varial during a run and retry only on the results screen. Advanced touch remaps the same physical five-button cluster to Q/E/F/T plus Action; the labels remain compact enough for the Simple layout.

## Input contract

`js/input.js` retains pressed and released edges for 120 ms or until one fixed simulation step consumes them. Each logical action has:

- an unsuffixed live held field;
- a `Pressed` one-shot edge;
- a `Released` one-shot edge.

Keyboard repeat cannot create duplicate edges. In Advanced mode Q/X/C are aliases for one action, so releasing one alias while another remains held does not generate a release. The legacy `style`, `stylePressed`, and `styleReleased` fields mirror `trick1` for old host adapters.

Simple mode additionally exposes `trick`, `special`, `spinLeft`, and `spinRight`; Advanced mode exposes `trick1` through `trick4`. Inactive-mode actions remain false. Analog axes use an 18% dead zone and are rescaled outside it. Blur, pause, restart, mode change, and destroy clear keys, touch pointers, gamepad state, and buffers; a held gamepad must return to neutral before it can create a new edge.

Touch pointers are independent, allowing direction plus Action or a held Trick at the same time. Releasing one pointer does not cancel another.

Outside active play, a standard gamepad navigates visible controls spatially with the stick or D-pad. A activates the focused control, B closes Settings or resumes from Pause, and Start remains the direct pause/resume control. Direction repeats after a 340 ms hold and then every 110 ms; A/B remain discrete. Left/right adjusts focused ranges and selects without ejecting focus. The same neutral-after-clear rule prevents a gameplay hold from activating a pause, menu, or results control.

Touch presentation is capability-aware. The persistent setting allows the controls, while the runtime shows them only for a coarse primary pointer or a compact device that reports touch points. Fine-pointer desktops remain unobscured. A stable portrait/landscape transition pauses play and clears every held pointer before moving the controls.

## Bidirectional travel and switch stance

Horizontal riding input targets signed travel velocity rather than teleporting the rider's facing. Opposite input first fights the current glide and applies a speed scrub. A direction change commits only after velocity crosses the configured threshold for the configured commit time; this prevents a single noisy sample from flipping the sprite or world.

When a change commits:

- `travelDirection`, `worldTravel`, parallax, wake, airborne carry, and sprite facing agree;
- the run records regular or switch stance relative to its starting direction;
- a meaningful reversal adds Flow and emits one `directionChange` event;
- takeoff and landing may independently record switch bonuses.

In the air, the nearest of the regular and opposite-facing landing tangents is valid. A clean opposite-facing landing commits the new direction and keeps quality-dependent momentum carry.

Rider direction never mirrors Twilight's environmental animation. Its breaking edge continues left-to-right, falling water continues top-to-bottom, and the sparse water clock never runs backward when Kaki carves or reverses. Only rider-facing elements such as the board-contact spray and wake flip with the surfer.

## Slope drive, Action, and big air

The rider samples the same animated ride surface used for drawing and landing. The simulation projects signed x travel and face movement through that surface gradient:

- positive downhill drive adds the strongest acceleration;
- uphill travel has a real speed cost;
- traverse supplies a smaller glide contribution;
- broad line quality, pocket position, board acceleration, and an Action release enhance the result.

The old narrow seam is no longer required to unlock the board's maximum speed. The readable fast line remains useful guidance and improves pump efficiency, but `currentRideSpeedCap()` is the board's actual hard cap. A poor line can still move; it simply gives back speed through slope and reduced local drive.

Launch height comes from current speed, uphill approach, Action charge, pocket position, board launch identity, and bonuses such as Moon Pop. A basic lip pop retains a useful floor. A fast bottom turn and climb makes the larger arc. Horizontal takeoff velocity carries signed travel and board motion into the air instead of being replaced by the last input sample. Large aerials automatically pan the world down to expose more sky and landing room, then ease home; the shift is clamped and disabled by Reduced Motion.

Perfect, clean, and wobble landings preserve progressively less speed. A short carry timer prevents a successful landing from collapsing immediately back to baseline glide.

## Aerial tricks

Advanced mode composes body spin, manual trim, and the Q/E/F/T manifest directly:

- Front Rail and Tail Grab are held tricks. Tail pays more, changes trim, rewards an apex hold, and adds descending risk.
- Board Varial is a discrete board-relative turn with start, height, and airtime gates.
- Kaki Twist is a larger signature counter-rotation with stricter gates and board-specific variants.

Different tricks can be sequenced in one launch. Starting one grab ends the other active grab, while a completed grab can chain into a varial or signature. Body rotation remains independent from board-relative trick motion in both control modes. See [Trick grammar](./TRICK-GRAMMAR.md) for exact manifest and scoring fields.

## Speed and Flow

Speed is physical velocity. Its fixed presentation tiers are:

| Range | Tier |
| --- | --- |
| Below 52 | `STALLING` |
| 52 through below 78 | `GLIDING` |
| 78 through below 101 | `FAST` |
| 101 through below 124 | `FLYING` |
| 124 and above | `BLASTING` |

Wake length, directional spray, water streaks, parallax, pose, wave-filter pitch, and speed accents reinforce those tiers. The HUD does not expose a persistent POWER meter.

Flow is a separate 0–100 style/combo state. Valid full arcs, committed direction changes, timed pumps, varied landed tricks, landing quality, wildlife rides, near misses, and set-piece bonuses add Flow. A strong line can briefly sustain Flow that an action already earned, but ordinary riding never creates it; passive play, stalling, repetition, wobble, and wipeouts reduce it. Flow drives the live score multiplier but never replaces physical speed.

## Wave Read Assist and teaching

Wave Read changes presentation only. It does not change slope physics, collision, score, trick eligibility, or spawn logic.

| Mode | Presentation |
| --- | --- |
| Full | Stronger fast-line cue, correction help, and landing label |
| Subtle | Natural streaks, spray, wake, and audio without persistent labels |
| Off | World and physical wave remain visible; assist-only text and arrows are removed |

Surf School is independent of Wave Read and teaches six actions in order: **drop downhill, carve back up, launch, rotate, add a trick, and land board-first**. A lesson remains visible until its physical state or semantic event succeeds; elapsed time alone cannot advance it. Completion is saved immediately, an interrupted first run retries the unfinished lesson, and Settings can arm the full sequence for the next run. Steering Assist and Landing Assist are separate scoring assists; either applies the displayed 18% score reduction. Simple auto-level is part of the selected control mode, not the Landing Assist setting.

## Wildlife and bonuses

Dolphin and whale offers can temporarily mount Kitty. While mounted, the ride preserves a minimum speed and grows Flow; Special or a lip launch triggers a large animal-assisted dismount. A shark uses a minimum telegraph before crossing. Contact wipes out unless Star Foam is ready, while threading the crossing grants score and Flow. Twilight suppresses boat and aircraft traffic so no decorative craft can appear inside or behind its hero break; wildlife and bonuses remain simulation-owned opportunities.

Mango Rush reduces uphill loss for its active duration, Moon Pop multiplies the next launch and is consumed on use, and Star Foam protects one shark contact or wobble landing before being consumed. Powerups, mounts, and active timers come from `WorldSimulation.getModifiers()`; their sprites and HUD are presentation only.

## Landing and banking

The dotted landing tangent is simulation-derived. The landing preview reports perfect, clean, and recovery bands and whether alignment is improving. Perfect and clean landings bank the completed aerial. A wobble banks less and cuts Flow; a wipeout clears the provisional score and banks none of it. Exact repeats decay by the complete landed signature, not a generic spin label.

Runs last 78 seconds or three wipeouts. A short recovery returns Kitty to the wave when time and paws remain.
