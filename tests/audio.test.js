import assert from "node:assert/strict";
import test from "node:test";

import { SurfAudio, safeLevel } from "../js/audio.js";

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

test("Turbo start, landed-trick refill, and empty-tank stop have distinct cues", () => {
  const { audio, calls } = createAudioProbe();

  audio.onEvent({ type: "turboStart", payload: { level: 0.8 } });
  assert.ok(calls.some((call) => call.method === "noiseBurst" && call.filter === "highpass"));
  assert.ok(firstTone(calls).end > firstTone(calls).start, "boost ignition rises");

  calls.length = 0;
  audio.onEvent({ type: "turboRefill", payload: { amount: 0.42, quality: "perfect" } });
  assert.equal(calls.filter((call) => call.method === "tone").length, 3);
  assert.equal(firstTone(calls).start, 523);

  calls.length = 0;
  audio.onEvent({ type: "turboStop", payload: { reason: "released" } });
  assert.equal(calls.length, 0, "ordinary release avoids audio chatter");
  audio.onEvent({ type: "turboStop", payload: { reason: "empty" } });
  assert.ok(firstTone(calls).end < firstTone(calls).start, "empty tank resolves downward");
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

test("tube success and failure use distinct rising and low impact cues", () => {
  const { audio, calls } = createAudioProbe();

  audio.onEvent({ type: "tubeExit", payload: { duration: 0.8, score: 220 } });
  assert.ok(firstTone(calls).end > firstTone(calls).start);
  assert.ok(calls.some((call) => call.method === "noiseTick"));

  calls.length = 0;
  audio.onEvent({ type: "tubeExit", payload: { reason: "complete", duration: 0.8, score: 220 } });
  assert.equal(calls.length, 0, "timer completion cannot play the clean tube-exit cue");

  calls.length = 0;
  audio.onEvent({ type: "tubeFail", payload: { reason: "curl" } });
  assert.ok(calls.some((call) => call.method === "noiseBurst" && call.filter === "lowpass"));
  assert.ok(firstTone(calls).end < firstTone(calls).start);
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

test("every continuous audio bus is silent before its noise source starts", () => {
  const previousAudioContext = globalThis.AudioContext;
  const timeline = [];
  let gainIndex = 0;
  const gainNames = ["master", "music", "effects", "wave", "board", "wind"];

  const parameter = (name, initialValue = 1) => ({
    value: initialValue,
    setValueAtTime(value) {
      this.value = value;
      timeline.push({ type: "gainValue", name, value });
    },
    setTargetAtTime(value) {
      // A real AudioParam starts a target curve from its current value. Keep
      // that current value intact so the fake catches graph-start ordering.
      timeline.push({ type: "gainTarget", name, value });
    },
  });
  const node = (name) => ({
    name,
    connect(destination) {
      this.destination = destination;
      return destination;
    },
    disconnect() {},
  });

  class FakeAudioContext {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 32;
      this.state = "suspended";
      this.destination = node("destination");
    }

    createGain() {
      const name = gainNames[gainIndex++] ?? `transient-${gainIndex}`;
      return { ...node(name), gain: parameter(name) };
    }

    createBiquadFilter() {
      return {
        ...node("filter"),
        type: "lowpass",
        Q: parameter("filter-q", 0),
        frequency: parameter("filter-frequency", 0),
      };
    }

    createDynamicsCompressor() {
      return {
        ...node("limiter"),
        threshold: parameter("limiter-threshold", 0),
        knee: parameter("limiter-knee", 0),
        ratio: parameter("limiter-ratio", 0),
        attack: parameter("limiter-attack", 0),
        release: parameter("limiter-release", 0),
      };
    }

    createBuffer(_channels, length, sampleRate) {
      return {
        duration: length / sampleRate,
        getChannelData: () => new Float32Array(length),
      };
    }

    createBufferSource() {
      return {
        ...node("continuous-source"),
        start() {
          timeline.push({
            type: "sourceStart",
            destination: this.destination.name,
            gain: this.destination.gain.value,
          });
        },
        stop() {},
      };
    }
  }

  globalThis.AudioContext = FakeAudioContext;
  try {
    const audio = new SurfAudio();
    audio.createGraph();

    const starts = timeline.filter((entry) => entry.type === "sourceStart");
    assert.deepEqual(
      starts,
      [
        { type: "sourceStart", destination: "wave", gain: 0 },
        { type: "sourceStart", destination: "board", gain: 0 },
        { type: "sourceStart", destination: "wind", gain: 0 },
      ],
    );

    const firstStart = timeline.findIndex((entry) => entry.type === "sourceStart");
    for (const name of gainNames) {
      const zeroed = timeline.findIndex((entry) => (
        entry.type === "gainValue" && entry.name === name && entry.value === 0
      ));
      assert.ok(zeroed >= 0 && zeroed < firstStart, `${name} bus must be zeroed before continuous audio starts`);
    }
  } finally {
    if (previousAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousAudioContext;
  }
});

test("a long pause rebases the music transport instead of catching up missed beats", () => {
  const audio = createReactiveAudioProbe();
  const scheduled = [];
  audio.scheduleBeat = (time) => scheduled.push(time);
  audio.nextBeat = 1;
  audio.context.currentTime = 611;

  audio.update(createAudioSimulation("riding"));

  assert.ok(scheduled.length <= 2, `expected at most two current beats, saw ${scheduled.length}`);
  assert.ok(scheduled.every((time) => time >= 611), "no beat may be scheduled in the paused interval");
  assert.ok(audio.nextBeat > 611);
});

test("lifecycle transitions fade physical layers and resume from a fresh music clock", () => {
  const audio = createReactiveAudioProbe();
  audio.context.currentTime = 20;
  audio.setLifecycle("paused");
  assert.equal(audio.lifecycle, "paused");
  assert.equal(audio.boardGain.gain.value, 0);
  assert.equal(audio.windGain.gain.value, 0);

  audio.context.currentTime = 620;
  audio.setLifecycle("running");
  assert.equal(audio.nextBeat, 620.06);

  audio.update(createAudioSimulation("riding"));
  const ridingBoard = audio.boardGain.gain.value;
  const ridingWind = audio.windGain.gain.value;
  assert.ok(ridingBoard > ridingWind, "surface contact leads the riding mix");

  audio.context.currentTime += 0.016;
  audio.update(createAudioSimulation("airborne"));
  assert.equal(audio.boardGain.gain.value, 0);
  assert.ok(audio.windGain.gain.value > ridingWind, "airborne speed opens the wind layer");

  let resumeCalls = 0;
  audio.setLifecycle("paused");
  audio.context.state = "suspended";
  audio.context.resume = () => { resumeCalls += 1; return Promise.resolve(); };
  audio.setLifecycle("running");
  assert.equal(resumeCalls, 1, "a direct resume gesture revives a browser-suspended context");
});

test("altitude filters surf at the apex and opens a stronger re-entry rush", () => {
  const audio = createReactiveAudioProbe();
  const beachAir = createAudioSimulation("airborne", { aerialAltitude: 0.08, airVY: -62 });
  audio.update(beachAir);
  const beachWaveFrequency = audio.waveFilter.frequency.value;
  const beachWaveGain = audio.waveGain.gain.value;
  const beachWind = audio.windGain.gain.value;

  audio.context.currentTime += 0.016;
  audio.update(createAudioSimulation("airborne", { aerialAltitude: 0.94, airVY: 0 }));
  const orbitWaveFrequency = audio.waveFilter.frequency.value;
  const orbitWaveGain = audio.waveGain.gain.value;
  const orbitWind = audio.windGain.gain.value;
  assert.ok(orbitWaveFrequency < beachWaveFrequency * 0.45);
  assert.ok(orbitWaveGain < beachWaveGain * 0.3);
  assert.ok(orbitWind < beachWind, "the orbital apex creates a brief quiet pocket");

  audio.context.currentTime += 0.016;
  audio.update(createAudioSimulation("airborne", { aerialAltitude: 0.7, airVY: 96 }));
  assert.ok(audio.windGain.gain.value > beachWind * 1.5, "descent restores a powerful wind rush");
  assert.ok(audio.windFilter.frequency.value > 3000);
});

test("audio levels remain finite and bounded when settings are corrupted", () => {
  assert.equal(safeLevel(Number.NaN, 0.58), 0.58);
  assert.equal(safeLevel("not-a-level", 0.78), 0.78);
  assert.equal(safeLevel(12, 0.5), 1);
  assert.equal(safeLevel(-4, 0.5), 0);

  const audio = createReactiveAudioProbe();
  audio.applySettings({ music: Number.NaN, effects: "broken", waveAudio: Infinity });
  for (const bus of [audio.master, audio.musicGain, audio.effectsGain, audio.waveGain]) {
    assert.ok(Number.isFinite(bus.gain.value));
  }
});

function createReactiveAudioProbe() {
  const audio = new SurfAudio({ music: 0.58, effects: 0.78, waveAudio: 0.52 });
  const param = (value = 0) => ({
    value,
    setTargetAtTime(next) { this.value = next; },
  });
  const gain = () => ({ gain: param() });
  audio.started = true;
  audio.lifecycle = "running";
  audio.context = { currentTime: 12, state: "running", resume: () => Promise.resolve() };
  audio.master = gain();
  audio.musicGain = gain();
  audio.effectsGain = gain();
  audio.waveGain = gain();
  audio.boardGain = gain();
  audio.windGain = gain();
  audio.waveFilter = { frequency: param() };
  audio.boardFilter = { frequency: param() };
  audio.windFilter = { frequency: param() };
  audio.tone = () => {};
  audio.noiseTick = () => {};
  return audio;
}

function createAudioSimulation(state, playerOverrides = {}) {
  return {
    player: {
      state,
      speed: 118,
      x: 230,
      faceVelocity: state === "riding" ? 0.9 : 0,
      speedPotential: { risk: 0.62, potential: 0.78 },
      aerialAltitude: 0,
      airVY: 0,
      ...playerOverrides,
    },
    wave: { pocketRisk: () => 0.62 },
    score: { combo: 2.4 },
    timeRemaining: 54,
    condition: { id: "goldenCoast" },
  };
}
