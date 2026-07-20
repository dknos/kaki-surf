import assert from "node:assert/strict";
import test from "node:test";

import { PoliteAnnouncer } from "../js/announcer.js";

test("polite announcements dwell one at a time instead of replacing each other", () => {
  const element = { textContent: "" };
  const clock = new FakeClock();
  const announcer = new PoliteAnnouncer(element, {
    schedule: (callback, delay) => clock.schedule(callback, delay),
    cancel: (id) => clock.cancel(id),
    dwellMs: 1000,
    gapMs: 100,
  });

  announcer.announce("Drop downhill");
  announcer.announce("Carve upward");
  clock.advance(0);
  assert.equal(element.textContent, "Drop downhill");
  clock.advance(999);
  assert.equal(element.textContent, "Drop downhill");
  clock.advance(1);
  assert.equal(element.textContent, "");
  clock.advance(100);
  assert.equal(element.textContent, "Carve upward");
});

test("urgent warnings move ahead of queued hints and duplicate chatter is coalesced", () => {
  const element = { textContent: "" };
  const clock = new FakeClock();
  const announcer = new PoliteAnnouncer(element, {
    schedule: (callback, delay) => clock.schedule(callback, delay),
    cancel: (id) => clock.cancel(id),
    dwellMs: 100,
    gapMs: 10,
  });

  assert.equal(announcer.announce("First"), true);
  assert.equal(announcer.announce("Hint"), true);
  assert.equal(announcer.announce("Hint"), false);
  assert.equal(announcer.announce("Shark ahead", { urgent: true }), true);
  clock.advance(0);
  assert.equal(element.textContent, "First");
  clock.advance(110);
  assert.equal(element.textContent, "Shark ahead");
  clock.advance(110);
  assert.equal(element.textContent, "Hint");
  announcer.destroy();
  assert.equal(element.textContent, "");
  assert.equal(clock.pending(), 0);
});

class FakeClock {
  constructor() {
    this.now = 0;
    this.sequence = 0;
    this.tasks = [];
  }

  schedule(callback, delay) {
    const id = ++this.sequence;
    this.tasks.push({ id, at: this.now + delay, callback });
    return id;
  }

  cancel(id) {
    this.tasks = this.tasks.filter((task) => task.id !== id);
  }

  advance(duration) {
    const target = this.now + duration;
    while (true) {
      this.tasks.sort((a, b) => a.at - b.at || a.id - b.id);
      const next = this.tasks[0];
      if (!next || next.at > target) break;
      this.tasks.shift();
      this.now = next.at;
      next.callback();
    }
    this.now = target;
  }

  pending() {
    return this.tasks.length;
  }
}
