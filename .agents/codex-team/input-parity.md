# Input Parity Implementation Report

## Contract

`InputManager.consumeStep()` returns the complete per-step contract in this order:

```js
{
  x,
  y,
  edge,
  edgePressed,
  edgeReleased,
  trick1,
  trick1Pressed,
  trick1Released,
  trick2,
  trick2Pressed,
  trick2Released,
  trick3,
  trick3Pressed,
  trick3Released,
  trick4,
  trick4Pressed,
  trick4Released,
  style,
  stylePressed,
  styleReleased,
}
```

`style`, `stylePressed`, and `styleReleased` are strict mirrors of the corresponding trick1 fields. The exported `createInputStep()` helper gives external adapters the same zero-state shape.

Every edge, trick press, and trick release is buffered for 0.12 seconds. Consuming a buffer clears only its discrete edge; held values remain true until every source for that action is released. Keyboard events are also captured between updates, so a short press and release cannot disappear between frames.

## Mappings

| Device | Direction | Edge | Trick 1 | Trick 2 | Trick 3 | Trick 4 | Meta |
|--------|-----------|------|---------|---------|---------|---------|------|
| Keyboard | Arrows or WASD | Space or Z | Q, X, or C | E | F | T | Escape/P pause, R restart |
| Gamepad | Left stick or D-pad | A or RT | X or LB | Y or RB | B | LT or R3 | Start pause, B retry edge |
| Touch | Independent direction pointers | `edge` | `trick1` or legacy `style` | `trick2` | `trick3` | `trick4` | Not applicable |

Gamepad B never emits `restart`. It emits held trick3 plus a separate rising-edge `retry` meta action, allowing the game lifecycle to accept it only on the results screen.

## State Safety

- Blur, `clear()`, and `destroy()` reset keys, touch pointers, gamepad state, pressed/released buffers, meta buffers, prior transition state, and the returned step object.
- A gamepad must return to neutral after a clear before it can produce another action. This prevents a held Start or B button from immediately toggling pause or retrying again.
- Touch tracks pointer IDs independently, supports diagonals and multiple held trick buttons, preserves a button's active state while any pointer remains, and removes all active styling on clear.
- All bound keyboard keydown and keyup events prevent browser defaults. Repeated keydown events are ignored, so they cannot create additional discrete tricks.
- Gamepad polling safely returns a disconnected state when `navigator` is absent, the provider is missing, or polling throws.

## Files

- `js/input.js`: complete keyboard, gamepad, touch, buffering, clearing, and adapter-helper implementation.
- `tests/input.test.js`: browser-free `node:test` coverage with keyboard, gamepad, touch, and event-target fakes.

## Verification

Fresh focused test run:

```text
$ node --test tests/input.test.js
tests 9
pass 9
fail 0
```

Fresh syntax checks:

```text
$ node --check js/input.js
exit 0
$ node --check tests/input.test.js
exit 0
```

The focused suite covers the exact contract, Q/E/F/T press-hold-release behavior, 120 ms buffer retention and expiry, repeat suppression, X/C alias overlap, keyboard direction/edge/meta mappings, gamepad primary and alternate mappings, B retry separation, touch multi-action state, visible touch state, navigator absence, and clear/blur/destroy semantics.
