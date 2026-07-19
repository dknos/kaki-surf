import assert from "node:assert/strict";
import test from "node:test";

import { SurfAudio } from "../js/audio.js";

function createAudioProbe() {
  const audio = new SurfAudio();
  const calls = [];
  audio.started = true;
  audio.context = { currentTime: 12 };
  audio.effectsGain = { id: "effects" };
  audio.musicGain = { id: "music" };
  audio.tone = (time, start, duration, type, volume, destination, end = start) => {
    calls.push({ method: "tone", time, start, duration, type, volume, destination, end });
  };
  audio.noiseBurst = (time, duration, volume, filter = "", start = 0, end = start) => {
    calls.push({ method: "noiseBurst", time, duration, volume, filter, start, end });
  };
  audio.noiseTick = (time, duration, volume, destination, frequency) => {
    calls.push({ method: "noiseTick", time, duration, volume, destination, frequency });
  };
  return { audio, calls };
}

function firstTone(calls) {
  return calls.find((call) => call.method === "tone");
}

test("direction and downhill events have physical, direction-aware pitch sweeps", () => {
  const { audio, calls } = createAudioProbe();

  audio.onEvent({
    type: "directionChange",
    payload: { to: -1, speed: 118, turnForce: 0.9, switch: true },
  });
  assert.equal(firstTone(calls).start, 392);
  assert.ok(calls.some((call) => call.method === "noiseBurst" && call.filter === "highpass"));
  assert.equal(calls.filter((call) => call.method === "tone").length, 3, "switch stance adds a short confirmation accent");
  assert.ok(calls.filter((call) => call.method === "tone").every((call) => call.destination === audio.effectsGain));

  calls.length = 0;
  audio.onEvent("reversal");
  assert.equal(firstTone(calls).start, 294, "string-form semantic events remain supported");

  calls.length = 0;
  audio.onEvent({ type: "downhillDrive", payload: { drive: 1, tier: 4 } });
  const downhill = firstTone(calls);
  assert.ok(downhill.end > downhill.start * 4, "downhill drive rises sharply with speed");
  assert.ok(calls.some((call) => call.method === "noiseBurst" && call.end > call.start));
});

test("dolphin, shark, and whale semantics resolve to distinct frequency identities", () => {
  const { audio, calls } = createAudioProbe();

  audio.onEvent({ type: "wildlifePhase", kind: "dolphin", phase: "telegraph" });
  const dolphinStart = firstTone(calls).start;
  calls.length = 0;
  audio.onEvent({ type: "wildlifePhase", kind: "shark", phase: "telegraph" });
  const sharkStart = firstTone(calls).start;
  calls.length = 0;
  audio.onEvent({ type: "wildlifePhase", kind: "whale", phase: "distant" });
  const whaleStart = firstTone(calls).start;

  assert.deepEqual([dolphinStart, sharkStart, whaleStart], [540, 124, 46]);

  calls.length = 0;
  audio.onEvent({ type: "dolphinMounted" });
  assert.ok(calls.filter((call) => call.method === "tone").length >= 3);
  calls.length = 0;
  audio.onEvent({ type: "whaleMounted" });
  assert.equal(firstTone(calls).start, 48);
  calls.length = 0;
  audio.onEvent({ type: "animalDismount", payload: { reason: "whale" } });
  assert.ok(calls.some((call) => call.method === "noiseBurst" && call.filter === "lowpass"));
  calls.length = 0;
  audio.onEvent({ type: "sharkCollision" });
  assert.ok(calls.some((call) => call.method === "noiseBurst" && call.volume >= 0.2));
  calls.length = 0;
  audio.onEvent({ type: "sharkThread" });
  assert.ok(firstTone(calls).end > firstTone(calls).start);
});

test("each flyby powerup has a unique pickup cue plus consume and expiration envelopes", () => {
  const { audio, calls } = createAudioProbe();
  const starts = [];
  for (const kind of ["mangoRush", "moonPop", "starFoam"]) {
    calls.length = 0;
    audio.onEvent({ type: "powerupCollected", payload: { kind } });
    starts.push(firstTone(calls).start);
    assert.ok(calls.some((call) => call.method === "noiseBurst"), `${kind} pickup has a sparkle burst`);
  }
  assert.deepEqual(starts, [196, 330, 523]);

  calls.length = 0;
  audio.onEvent({ type: "powerupConsumed", kind: "bonus-moonPop" });
  assert.equal(firstTone(calls).start, 1320);
  assert.equal(calls.filter((call) => call.method === "tone").length, 2);

  calls.length = 0;
  audio.onEvent({ type: "powerupExpired", payload: { id: "bonus-starFoam" } });
  assert.ok(firstTone(calls).end < firstTone(calls).start, "expiration resolves downward");
});

test("banner traffic, carrier phases, Fleet Airshow, and landing grades stay event-driven", () => {
  const { audio, calls } = createAudioProbe();

  audio.onEvent({ type: "trafficSpawned", kind: "bannerPlane", phase: "approach" });
  assert.equal(firstTone(calls).start, 146);
  calls.length = 0;
  audio.onEvent({ type: "trafficSpawned", kind: "gullFlock", phase: "cruise" });
  assert.equal(calls.length, 0, "ordinary ambience does not become audio spam");

  audio.onEvent({ type: "carrierPhase", phase: "launch" });
  assert.ok(calls.some((call) => call.method === "noiseBurst"));
  assert.ok(calls.some((call) => call.method === "tone" && call.end > call.start));
  calls.length = 0;
  audio.onEvent({ type: "fleetAirshowCompleted", payload: { reason: "success", value: 1 } });
  assert.ok(calls.filter((call) => call.method === "tone").length >= 4);

  calls.length = 0;
  audio.onEvent({ type: "land", payload: { quality: "perfect", switch: true } });
  const perfectToneCount = calls.filter((call) => call.method === "tone").length;
  assert.ok(perfectToneCount >= 4);
  assert.ok(calls.some((call) => call.method === "noiseBurst" && call.filter === "highpass"));
  calls.length = 0;
  audio.onEvent({ type: "land", payload: { quality: "wobble" } });
  assert.ok(calls.some((call) => call.method === "noiseBurst" && call.filter === "lowpass"));
});

test("effect bursts reuse one noise buffer instead of regenerating samples per event", () => {
  const audio = new SurfAudio();
  let bufferCreations = 0;
  let sourceCreations = 0;
  const node = () => ({ connect() { return this; } });
  audio.context = {
    sampleRate: 100,
    createBuffer(_channels, length, sampleRate) {
      bufferCreations += 1;
      return {
        duration: length / sampleRate,
        getChannelData: () => new Float32Array(length),
      };
    },
    createBufferSource() {
      sourceCreations += 1;
      return { ...node(), start() {}, stop() {} };
    },
    createGain() {
      return {
        ...node(),
        gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      };
    },
    createBiquadFilter() {
      return {
        ...node(),
        type: "lowpass",
        Q: { value: 0 },
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
      };
    },
  };
  audio.effectsGain = node();

  audio.noiseBurst(0, 0.2, 0.1, "lowpass", 900, 240);
  audio.noiseBurst(0.4, 0.15, 0.08, "highpass", 700, 2500);

  assert.equal(bufferCreations, 1);
  assert.equal(sourceCreations, 2);
  assert.equal(audio.noiseCursor, 2);
});
