# Controls and gameplay

## Compact control panel

| Intent | Keyboard | Controller | Touch |
| --- | --- | --- | --- |
| Carve / steer / aerial rotation | Arrows or WASD | Left stick or D-pad | Direction pad |
| Pump / compress / commit | Space or Z | A or right trigger | Pump |
| Style / grab | X or C | X or left bumper | Style |
| Pause | Escape or P | Start | Settings button |
| Instant restart | R; Space on results | B; A on results | Results button |

Keyboard and controller use an 18% analog dead zone and a 120 ms action buffer. Launch has 110 ms of lip coyote time. Landing has a 95 ms contact-recovery window.

## Ride model

- Up/down input accelerates a continuous carve velocity across the wave face.
- Down-face movement, the power zone, and well-timed pump releases build speed.
- Climbing costs momentum. Excessive correction and a wobble landing shed speed.
- A committed upward line through the lip launches automatically; pump charge adds pop.
- Horizontal air input controls angular velocity. Vertical input trims the board relative to the plush body.
- The board must match the visible landing tangent. Clean and perfect windows preserve momentum; the outer recovery window produces a wobble save.
- The curl advances through the run. Its proximity increases pressure, wave audio, and multiplier before it becomes a wipeout.

## Scoring

Ride, speed, pocket proximity, alternating carves, height, landed rotation, grab, and landing quality have separate buckets. Air tricks score only after landing. Recent identical tricks decay to 58% of the previous value. Steering or landing assistance is labeled and applies an 18% multiplier reduction.

Runs last 78 seconds or three wipeouts. Wipeouts are short; a run restarts with one input from the results screen.
