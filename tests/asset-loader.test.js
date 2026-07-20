import assert from "node:assert/strict";
import test from "node:test";

import { waitForImageLoad } from "../js/asset-loader.js";

test("optional art loads independently and times out into the code fallback", async () => {
  const loaded = new FakeImage("load");
  await waitForImageLoad(loaded, "asset.png", 20);
  assert.equal(loaded.src, "asset.png");
  assert.equal(loaded.listenerCount(), 0, "settled image listeners are released");

  const stalled = new FakeImage("stall");
  await assert.rejects(
    waitForImageLoad(stalled, "stalled.png", 5),
    /timed out/,
  );
  assert.equal(stalled.listenerCount(), 0, "timed-out image listeners are released");
});

class FakeImage {
  constructor(outcome) {
    this.outcome = outcome;
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  set src(value) {
    this._src = value;
    if (this.outcome === "load") queueMicrotask(() => this.listeners.get("load")?.());
    if (this.outcome === "error") queueMicrotask(() => this.listeners.get("error")?.());
  }

  get src() {
    return this._src;
  }

  listenerCount() {
    return this.listeners.size;
  }
}
