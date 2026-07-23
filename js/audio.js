import { clamp } from "./math.js";

const MUSIC_PATTERNS = Object.freeze({
  goldenCoast: [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 3, 10, 14, 10],
  twilightGlass: [0, 5, 10, 14, 7, 12, 17, 12, 3, 10, 15, 19, 7, 14, 17, 12],
  stormbreak: [0, 3, 7, 10, 0, 5, 8, 12, -2, 3, 7, 10, 0, 7, 10, 15],
});

const TRICK_CUES = Object.freeze({
  frontRail: { start: 330, end: 440, type: "triangle", accent: 660 },
  tailGrab: { start: 247, end: 370, type: "square", accent: 554 },
  varial: { start: 185, end: 740, type: "sawtooth", accent: 988 },
  kakiTwist: { start: 392, end: 1175, type: "square", accent: 1568 },
});

const MANEUVER_CUES = Object.freeze({
  snap: { start: 205, end: 510, duration: 0.09 },
  cutback: { start: 360, end: 165, duration: 0.13 },
  floater: { start: 294, end: 440, duration: 0.16 },
  tubeTuck: { start: 92, end: 122, duration: 0.2 },
});

const EMPTY_EVENT_PAYLOAD = Object.freeze({});
const MUSIC_LOOKAHEAD = 0.16;
const MUSIC_RESYNC_GAP = 0.22;
const MAX_BEATS_PER_UPDATE = 4;

const LIFECYCLE_MIX = Object.freeze({
  menu: Object.freeze({ master: 0.52, music: 0.42, wave: 0.08, effects: 0.72 }),
  running: Object.freeze({ master: 0.82, music: 1, wave: 1, effects: 1 }),
  paused: Object.freeze({ master: 0.42, music: 0.22, wave: 0.1, effects: 0.65 }),
  results: Object.freeze({ master: 0.68, music: 0.34, wave: 0.12, effects: 1 }),
});

const POWERUP_TONES = Object.freeze({
  mangoRush: Object.freeze({ start: 196, end: 784, type: "sawtooth", accent: 988 }),
  moonPop: Object.freeze({ start: 330, end: 990, type: "triangle", accent: 1320 }),
  starFoam: Object.freeze({ start: 523, end: 698, type: "sine", accent: 1047 }),
});

export function turboAudioMix(player = {}, board = {}, target = null) {
  const cooking = (Number(player.turboCookingTimer) || 0) > 0 || player.turboTier === "cooking";
  const engaged = cooking || Boolean(player.turboActive) || (Number(player.turboReleaseGrace) || 0) > 0;
  const progress = clamp(Number(player.turboBurnProgress) || 0, 0, 1);
  const intensity = engaged ? cooking ? 1 : 0.18 + progress * 0.82 : 0;
  const boardId = board?.id ?? "foamPuff";
  const boardHiss = boardId === "moonLog" ? 1.12 : boardId === "mangoFish" ? 1.06 : 0.95;
  const windTone = boardId === "moonLog" ? 0.94 : boardId === "mangoFish" ? 1.08 : 1;
  const mix = target ?? {};
  mix.tier = cooking ? "cooking" : engaged ? player.turboTier || "ignition" : "idle";
  mix.progress = progress;
  mix.intensity = intensity;
  mix.boardHiss = boardHiss;
  mix.windTone = windTone;
  mix.cooking = cooking;
  return mix;
}

export class SurfAudio {
  constructor(settings = {}) {
    this.settings = settings;
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.effectsGain = null;
    this.waveGain = null;
    this.waveFilter = null;
    this.waveSource = null;
    this.boardGain = null;
    this.boardFilter = null;
    this.boardSource = null;
    this.windGain = null;
    this.windFilter = null;
    this.windSource = null;
    this.limiter = null;
    this.continuousNoiseBuffer = null;
    this.effectNoiseBuffer = null;
    this.noiseCursor = 0;
    this.nextBeat = 0;
    this.beatIndex = 0;
    this.started = false;
    this.destroyed = false;
    this.mutedByVisibility = false;
    this.lifecycle = "menu";
    this.duckUntil = 0;
    this.duckAmount = 1;
    this.conditionId = "goldenCoast";
    this.lastSpeedTier = -1;
    this.lastFinalSecond = -1;
    this.inPowerLine = false;
    this.turboMix = {};
    this.beatReactive = {
      speedTier: 0,
      risk: 0,
      airborne: false,
      combo: 1,
      finalSeconds: false,
    };
  }

  async unlock() {
    if (this.destroyed) return;
    if (!this.context) this.createGraph();
    if (!this.context) return;
    if (this.context.state === "suspended") await this.context.resume();
    this.started = true;
    this.resyncMusicClock();
    this.applyLifecycleMix();
  }

  createGraph() {
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? globalThis.window?.AudioContext ?? globalThis.window?.webkitAudioContext;
    if (!AudioContextClass || this.destroyed) return;
    this.context = new AudioContextClass({ latencyHint: "interactive" });
    this.master = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.effectsGain = this.context.createGain();
    this.waveGain = this.context.createGain();
    this.boardGain = this.context.createGain();
    this.windGain = this.context.createGain();
    for (const bus of [this.master, this.musicGain, this.effectsGain, this.waveGain, this.boardGain, this.windGain]) {
      setParamValue(bus.gain, 0);
    }
    this.waveFilter = this.context.createBiquadFilter();
    this.boardFilter = this.context.createBiquadFilter();
    this.windFilter = this.context.createBiquadFilter();
    this.waveFilter.type = "lowpass";
    this.waveFilter.frequency.value = 1050;
    this.boardFilter.type = "bandpass";
    this.boardFilter.Q.value = 0.8;
    this.boardFilter.frequency.value = 1450;
    this.windFilter.type = "highpass";
    this.windFilter.Q.value = 0.45;
    this.windFilter.frequency.value = 920;
    this.limiter = this.context.createDynamicsCompressor?.() ?? null;
    if (this.limiter) {
      setParamValue(this.limiter.threshold, -12);
      setParamValue(this.limiter.knee, 8);
      setParamValue(this.limiter.ratio, 8);
      setParamValue(this.limiter.attack, 0.004);
      setParamValue(this.limiter.release, 0.18);
    }
    this.musicGain.connect(this.master);
    this.effectsGain.connect(this.master);
    this.waveGain.connect(this.waveFilter).connect(this.master);
    this.boardGain.connect(this.boardFilter).connect(this.master);
    this.windGain.connect(this.windFilter).connect(this.master);
    if (this.limiter) this.master.connect(this.limiter).connect(this.context.destination);
    else this.master.connect(this.context.destination);
    this.applySettings();
    this.createContinuousNoise();
    this.createEffectNoiseBuffer();
  }

  createContinuousNoise() {
    if (!this.context || !this.waveGain || this.continuousNoiseBuffer) return;
    const sampleRate = this.context.sampleRate;
    const length = sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const channel = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.88 + white * 0.12;
      channel[index] = last * 0.7 + white * 0.16;
    }
    this.continuousNoiseBuffer = buffer;
    this.waveSource = this.startNoiseLoop(buffer, this.waveGain);
    this.boardSource = this.startNoiseLoop(buffer, this.boardGain, 0.37);
    this.windSource = this.startNoiseLoop(buffer, this.windGain, 0.83);
  }

  startNoiseLoop(buffer, destination, offset = 0) {
    if (!this.context || !buffer || !destination) return null;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(destination);
    source.start(0, Math.min(offset, Math.max(0, buffer.duration - 0.01)));
    return source;
  }

  createEffectNoiseBuffer() {
    if (!this.context || this.effectNoiseBuffer) return;
    const sampleRate = this.context.sampleRate;
    const length = sampleRate;
    const buffer = this.context.createBuffer(1, length, sampleRate);
    const channel = buffer.getChannelData(0);
    let brown = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      brown = brown * 0.92 + white * 0.08;
      channel[index] = clamp(white * 0.78 + brown * 0.62, -1, 1);
    }
    this.effectNoiseBuffer = buffer;
  }

  applySettings(settings = this.settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.context || this.destroyed) return;
    this.applyLifecycleMix();
  }

  update(simulation) {
    if (!this.started || !this.context || this.context.state !== "running" || this.destroyed
      || this.lifecycle !== "running" || this.mutedByVisibility) return;
    const player = simulation.player;
    const risk = player.speedPotential?.risk ?? simulation.wave.pocketRisk(player.x);
    const potential = player.speedPotential?.potential ?? 0.5;
    const speed = Number(player.motionSpeed ?? player.speed ?? 0);
    const combo = Number(simulation.score?.combo ?? simulation.currentMultiplier?.() ?? 1);
    const airborne = player.state === "airborne";
    const tubeActive = Boolean(player.tubeRide?.active);
    const turboMix = turboAudioMix(player, simulation.board, this.turboMix);
    const aerialAltitude = airborne ? clamp(Number(player.aerialAltitude) || 0, 0, 1) : 0;
    const apexQuiet = airborne
      ? smoothAudioStep(0, 12, Math.abs(Number(player.airVY) || 0))
      : 1;
    const reentry = airborne && (Number(player.airVY) || 0) > 0
      ? aerialAltitude * smoothAudioStep(18, 96, Number(player.airVY) || 0)
      : 0;
    const timed = simulation.mode?.timed !== false;
    const seconds = timed ? Math.ceil(simulation.timeRemaining ?? 99) : Number.POSITIVE_INFINITY;
    const now = this.context.currentTime;
    this.conditionId = conditionIdFor(simulation, this.settings);

    const conditionFilter = this.conditionId === "stormbreak" ? 360 : this.conditionId === "twilightGlass" ? 180 : 0;
    const openWaveFrequency = 560 + speed * 4.5 + risk * 1180 + potential * 310 + conditionFilter;
    const altitudeFilter = 1 - smoothAudioStep(0.16, 0.92, aerialAltitude) * 0.78;
    setParamTarget(
      this.waveFilter?.frequency,
      openWaveFrequency * (tubeActive ? 0.56 : 1) * altitudeFilter,
      now,
      0.08,
    );
    const pocketGain = 0.05 + risk * 0.15 + potential * 0.045
      + (airborne ? -0.025 : 0)
      + (tubeActive ? 0.055 : 0);
    setParamTarget(
      this.waveGain?.gain,
      safeLevel(this.settings.waveAudio, 0.52)
        * pocketGain
        * (1 - smoothAudioStep(0.18, 0.94, aerialAltitude) * 0.88),
      now,
      0.07,
    );

    const contact = ["riding", "lip", "landing", "wobble"].includes(player.state);
    const speedMix = clamp((speed - 28) / 118, 0, 1);
    const turboSpeedMix = clamp((speed - 28) / 205, 0, 1);
    const carveMix = clamp(Math.abs(Number(player.faceVelocity) || 0) / 1.4, 0, 1);
    const effectsLevel = safeLevel(this.settings.effects, 0.78);
    const boardLevel = contact
      ? effectsLevel
        * (0.012 + speedMix * 0.045 + carveMix * 0.055)
        * (tubeActive ? 0.58 : 1)
        * (1 + turboMix.intensity * turboSpeedMix * 0.62)
        * turboMix.boardHiss
      : 0;
    const windLevel = airborne
      ? effectsLevel
        * (0.018 + speedMix * 0.095)
        * (0.82 + aerialAltitude * 0.52 + reentry * 1.35)
        * (0.24 + apexQuiet * 0.76)
        * (1 + turboMix.intensity * turboSpeedMix * 0.22)
      : effectsLevel * (speedMix * 0.008 + turboSpeedMix * turboMix.intensity * 0.05);
    setParamTarget(this.boardGain?.gain, boardLevel, now, 0.045);
    setParamTarget(
      this.boardFilter?.frequency,
      780 + speedMix * 1750 + carveMix * 920
        + turboMix.intensity * turboSpeedMix * 680,
      now,
      0.055,
    );
    setParamTarget(this.windGain?.gain, windLevel, now, airborne ? 0.05 : 0.12);
    setParamTarget(
      this.windFilter?.frequency,
      (720 + speedMix * 1900 + aerialAltitude * 580 + reentry * 960
        + turboMix.intensity * turboSpeedMix * 940) * turboMix.windTone,
      now,
      0.08,
    );

    const duck = now < this.duckUntil ? this.duckAmount : 1;
    if (duck === 1) this.duckAmount = 1;
    setParamTarget(
      this.musicGain?.gain,
      safeLevel(this.settings.music, 0.58)
        * (airborne
          ? 0.17 * (1 - smoothAudioStep(0.62, 1, aerialAltitude) * 0.42)
          : 0.22 + Math.min(0.055, combo * 0.012))
        * duck,
      now,
      duck < 1 ? 0.025 : 0.08,
    );

    const speedTier = clamp(Math.floor((speed - 34) / 24), 0, 4);
    if (speedTier > this.lastSpeedTier && speedTier >= 3) this.tone(now, 520 + speedTier * 80, 0.05, "triangle", 0.035, this.effectsGain, 720 + speedTier * 90);
    this.lastSpeedTier = speedTier;

    if (seconds <= 10 && seconds >= 0 && seconds !== this.lastFinalSecond) {
      this.lastFinalSecond = seconds;
      this.tone(now, seconds <= 3 ? 880 : 660, 0.045, "square", seconds <= 3 ? 0.07 : 0.045, this.musicGain, seconds <= 3 ? 1320 : 770);
    }

    const reactive = this.beatReactive;
    reactive.speedTier = speedTier;
    reactive.risk = risk;
    reactive.airborne = airborne;
    reactive.combo = combo;
    reactive.finalSeconds = seconds <= 10;
    if (!Number.isFinite(this.nextBeat) || this.nextBeat < now - MUSIC_RESYNC_GAP) this.resyncMusicClock(now);
    let scheduled = 0;
    while (this.nextBeat < now + MUSIC_LOOKAHEAD && scheduled < MAX_BEATS_PER_UPDATE) {
      this.scheduleBeat(this.nextBeat, reactive);
      this.nextBeat += clamp(0.146 - speedTier * 0.006 - (combo > 2.5 ? 0.008 : 0) - (seconds <= 10 ? 0.009 : 0), 0.1, 0.15);
      scheduled += 1;
    }
    if (this.nextBeat < now - MUSIC_RESYNC_GAP) this.resyncMusicClock(now);
  }

  scheduleBeat(time, reactive) {
    const pattern = MUSIC_PATTERNS[this.conditionId] ?? MUSIC_PATTERNS.goldenCoast;
    const step = this.beatIndex % pattern.length;
    const root = this.conditionId === "twilightGlass" ? 98 : this.conditionId === "stormbreak" ? 82.4 : 110;
    const frequency = root * Math.pow(2, pattern[step] / 12);
    const leadType = this.conditionId === "twilightGlass" ? "sine" : this.conditionId === "stormbreak" ? "sawtooth" : "square";
    if (step % 2 === 0 || reactive.combo > 2.2 || reactive.airborne) this.tone(time, frequency, reactive.airborne ? 0.1 : 0.07, leadType, 0.038 + reactive.speedTier * 0.003, this.musicGain);
    if (step % 4 === 0) {
      const bass = this.conditionId === "stormbreak" ? 41.2 : 55;
      this.tone(time, bass, 0.06 + reactive.risk * 0.025, "triangle", 0.075, this.musicGain, bass * 0.64);
    }
    if (step % 2 === 1 && (!reactive.airborne || reactive.combo > 3)) this.noiseTick(time, this.conditionId === "stormbreak" ? 0.025 : 0.016, 0.012 + reactive.speedTier * 0.003);
    if (this.conditionId === "twilightGlass" && step % 8 === 6) this.tone(time, frequency * 2, 0.16, "sine", 0.023, this.musicGain, frequency * 1.5);
    this.beatIndex += 1;
  }

  onEvent(event, simulation = null) {
    if (!this.started || !this.context || this.destroyed) return;
    if (simulation) this.conditionId = conditionIdFor(simulation, this.settings);
    const type = typeof event === "string" ? event : event?.type;
    const payload = typeof event === "string"
      ? EMPTY_EVENT_PAYLOAD
      : event?.payload ?? event ?? EMPTY_EVENT_PAYLOAD;
    const now = this.context.currentTime;
    switch (type) {
      case "turboStart":
        this.duck(0.78, 0.16);
        this.chirp(now, 174, 696, 0.18, 0.11);
        this.noiseBurst(now, 0.13, 0.045, "highpass", 620, 2800);
        break;
      case "turboRefill":
        this.chirp(now, 523, 1175, 0.16, 0.085);
        this.tone(now + 0.075, 1568, 0.09, "sine", 0.05, this.effectsGain, 2093);
        break;
      case "turboTier":
        if (payload.tier === "surge") {
          this.tone(now, 330, 0.07, "triangle", 0.035, this.effectsGain, 495);
        } else if (payload.tier === "redline") {
          this.chirp(now, 392, 880, 0.12, 0.055);
          this.noiseBurst(now, 0.08, 0.018, "bandpass", 1150, 3100);
        }
        break;
      case "turboFullBurn":
        this.duck(0.58, 0.26);
        this.noiseBurst(now, 0.11, 0.09, "highpass", 420, 4200);
        this.chirp(now, 165, 1320, 0.13, 0.12);
        this.tone(now + 0.045, 990, 0.12, "triangle", 0.065, this.effectsGain, 1485);
        break;
      case "turboStop":
        if (payload.reason === "empty") {
          this.tone(now, 220, 0.1, "triangle", 0.035, this.effectsGain, 150);
        }
        break;
      case "endlessSet":
        this.duck(0.74, 0.28);
        this.chirp(now, 196, payload.final ? 988 : 784, 0.22, 0.11);
        this.tone(now + 0.08, payload.final ? 1174 : 880, 0.14, "square", 0.055, this.effectsGain, 1320);
        break;
      case "pumpCharge":
        this.tone(now, 105 + (payload.charge ?? 0) * 75, 0.055, "triangle", 0.035, this.effectsGain, 145 + (payload.charge ?? 0) * 110);
        break;
      case "trickRejected":
        this.tone(now, 176, 0.045, "square", 0.025, this.effectsGain, 132);
        break;
      case "pump":
        this.tone(now, 132, 0.075, "square", 0.07 + (payload.efficiency ?? payload.strength ?? 0.5) * 0.07, this.effectsGain, 220 + (payload.efficiency ?? payload.strength ?? 0.5) * 160);
        break;
      case "directionChange":
      case "reversal":
      case "switch":
        this.playDirectionChange(now, payload);
        break;
      case "speedTier":
      case "speedBurst":
      case "downhill":
      case "downhillDrive":
        this.playSpeedEvent(now, payload, type);
        break;
      case "powerLineEnter":
        this.inPowerLine = true;
        this.chirp(now, 294, 660, 0.15, 0.12);
        this.tone(now + 0.06, 990, 0.08, "sine", 0.055, this.effectsGain, 1320);
        break;
      case "fullPower":
        this.duck(0.68, 0.24);
        this.chirp(now, 247, 988, 0.22, 0.13);
        this.noiseBurst(now, 0.16, 0.055, "highpass", 820, 3400);
        break;
      case "powerLineLeave":
        this.inPowerLine = false;
        this.tone(now, 310, 0.12, "triangle", 0.07, this.effectsGain, 180);
        break;
      case "lip":
        this.tone(now, 180, 0.1, "triangle", 0.08, this.effectsGain, 280);
        break;
      case "launch":
        this.chirp(now, 210, 620, 0.17, 0.16);
        break;
      case "apex":
        this.tone(now, 880, 0.08, "sine", 0.09, this.effectsGain, 1040);
        break;
      case "aerialMilestone": {
        const tier = clamp(Math.round(Number(payload.index) || 1), 1, 4);
        this.duck(tier >= 4 ? 0.48 : 0.7, tier >= 4 ? 0.5 : 0.24);
        this.chirp(now, 330 + tier * 85, 660 + tier * 190, 0.18 + tier * 0.025, 0.08);
        if (tier >= 3) this.tone(now + 0.08, 880 + tier * 110, 0.22, "sine", 0.045, this.effectsGain, 1320);
        break;
      }
      case "aerialReentry":
        this.noiseBurst(now, 0.34, 0.11, "highpass", 480, 3900);
        this.chirp(now, 280, 920, 0.24, 0.09);
        break;
      case "maneuver":
      case "maneuverStart":
      case "maneuverComplete":
        this.playManeuver(now, payload.id);
        break;
      case "snap":
      case "cutback":
      case "floater":
      case "tubeTuck":
        this.playManeuver(now, type);
        break;
      case "tubeExit":
        if (payload.reason === "complete") break;
        this.chirp(now, 196, 784, 0.16, 0.1);
        this.noiseTick(now + 0.035, 0.025, 0.018);
        break;
      case "tubeFail":
        this.noiseBurst(now, 0.18, 0.09, "lowpass", 760, 180);
        this.tone(now, 146, 0.18, "triangle", 0.075, this.effectsGain, 62);
        break;
      case "trickStarted":
      case "trickStart":
        this.playTrick(now, payload.id, false);
        break;
      case "trickCompleted":
      case "trickComplete":
        this.playTrick(now, payload.id, true);
        break;
      case "varial":
        this.playTrick(now, "varial", true);
        break;
      case "signature":
      case "kakiTwist":
        this.playTrick(now, "kakiTwist", true);
        break;
      case "land":
        this.playLanding(now, payload.quality, payload);
        break;
      case "wildlifePhase":
        this.playWildlifePhase(now, payload);
        break;
      case "dolphinMounted":
      case "dolphinRide":
        this.playAnimalMount(now, "dolphin");
        break;
      case "whaleMounted":
      case "whaleRide":
        this.playAnimalMount(now, "whale");
        break;
      case "animalDismount":
        this.playAnimalDismount(now, payload);
        break;
      case "sharkCollision":
        this.playSharkCollision(now);
        break;
      case "sharkThread":
        this.playSharkThread(now);
        break;
      case "birdReaction":
        if (["scatter", "dodge", "bank"].includes(String(payload.phase ?? "").toLowerCase())) {
          this.noiseTick(now, 0.045, 0.026, this.effectsGain, 2200);
          this.chirp(now + 0.02, 740, 1180, 0.08, 0.045);
        }
        break;
      case "featherThread":
        this.chirp(now, 620, 1680, 0.16, 0.095);
        this.noiseTick(now + 0.05, 0.06, 0.03, this.effectsGain, 2600);
        break;
      case "courierPhase":
        if (payload.phase === "carry" || payload.phase === "drop") {
          this.chirp(now, payload.phase === "drop" ? 440 : 660, payload.phase === "drop" ? 1320 : 1100, 0.11, 0.06);
        }
        break;
      case "aircraftDropPhase":
        if (payload.phase === "approach" || payload.phase === "drop") {
          this.tone(now, payload.phase === "drop" ? 880 : 176, 0.14, "triangle", 0.055, this.effectsGain, payload.phase === "drop" ? 1320 : 264);
        }
        break;
      case "racePhase":
        if (payload.phase === "racing") this.chirp(now, 196, 587, 0.16, 0.08);
        else if (payload.phase === "won") this.chirp(now, 392, 1175, 0.2, 0.11);
        else if (payload.phase === "lost") this.tone(now, 294, 0.16, "triangle", 0.045, this.effectsGain, 220);
        break;
      case "speedboatRaceWon":
        this.chirp(now, 523, 1568, 0.18, 0.1);
        break;
      case "foamGateCleared":
        this.tone(now, 784 + Math.min(3, Number(payload.value ?? 1)) * 110, 0.1, "sine", 0.075, this.effectsGain, 1175);
        break;
      case "foamGateSeriesCompleted":
        this.chirp(now, 523, 1760, 0.22, 0.12);
        break;
      case "powerupPhase":
        this.playPowerupPhase(now, payload);
        break;
      case "powerupCollected":
        this.playPowerup(now, payload, "collected");
        break;
      case "powerupConsumed":
        this.playPowerup(now, payload, "consumed");
        break;
      case "powerupExpired":
        this.playPowerup(now, payload, "expired");
        break;
      case "trafficSpawned":
      case "trafficPhase":
        this.playTrafficEvent(now, payload);
        break;
      case "stanceSwitch":
        this.playDirectionChange(now, {
          ...payload,
          direction: payload.stance === "goofy" ? -1 : 1,
          speed: 54,
          turnForce: 0.4,
          switchStance: true,
        });
        break;
      case "carrierPhase":
        this.playCarrierPhase(now, payload.phase);
        break;
      case "fleetAirshowCompleted":
        this.playFleetAirshow(now, payload);
        break;
      case "wipeout":
        this.duck(0.34, 0.48);
        this.noiseBurst(now, 0.34, 0.26, "lowpass", 980, 260);
        this.tone(now, 160, 0.33, "square", 0.11, this.effectsGain, 52);
        break;
      case "respawn":
        this.chirp(now, 196, 523, 0.18, 0.075);
        break;
      case "tutorialComplete":
        this.duck(0.5, 0.5);
        this.chirp(now, 392, 1568, 0.34, 0.14);
        this.tone(now + 0.18, 2093, 0.15, "sine", 0.07, this.effectsGain, 2637);
        break;
      case "uiConfirm":
        this.tone(now, 392, 0.065, "square", 0.055, this.effectsGain, 587);
        break;
      case "uiBack":
      case "uiPause":
        this.tone(now, 330, 0.075, "triangle", 0.045, this.effectsGain, 220);
        break;
      case "combo":
      case "comboIncrease": {
        const combo = Number(payload.combo ?? payload.value ?? 1);
        this.chirp(now, 392 + combo * 28, 590 + combo * 55, 0.08, 0.06);
        break;
      }
      case "personalBest":
        this.duck(0.28, 0.72);
        this.chirp(now, 330, 1320, 0.34, 0.16);
        this.tone(now + 0.16, 1568, 0.16, "sine", 0.08, this.effectsGain, 2093);
        break;
      case "complete":
        this.duck(0.48, 0.52);
        this.chirp(now, 260, 780, 0.42, 0.14);
        break;
      default:
        break;
    }
  }

  playManeuver(time, id) {
    const cue = MANEUVER_CUES[normalizeCueId(id)] ?? MANEUVER_CUES.snap;
    this.tone(time, cue.start, cue.duration, cue.start > cue.end ? "triangle" : "square", 0.1, this.effectsGain, cue.end);
    if (normalizeCueId(id) === "tubeTuck") this.noiseTick(time + 0.025, 0.04, 0.025);
  }

  playTrick(time, id, completed) {
    const cue = TRICK_CUES[normalizeCueId(id)] ?? TRICK_CUES.frontRail;
    const volume = completed ? 0.13 : 0.075;
    this.tone(time, cue.start, completed ? 0.16 : 0.08, cue.type, volume, this.effectsGain, completed ? cue.end : cue.start * 1.18);
    if (completed) this.tone(time + 0.06, cue.accent, 0.1, "triangle", volume * 0.62, this.effectsGain, cue.accent * 1.2);
  }

  playDirectionChange(time, payload) {
    const direction = Math.sign(Number(payload.to ?? payload.direction ?? 1)) || 1;
    const speed = clamp(Number(payload.speed ?? payload.velocity ?? 70), 0, 150);
    const turnForce = clamp(Math.abs(Number(payload.turnForce ?? payload.strength ?? 0.6)), 0, 1);
    const start = direction > 0 ? 294 : 392;
    const bottom = direction > 0 ? 196 : 247;
    const finish = direction > 0 ? 587 : 494;
    this.tone(time, start, 0.11 + turnForce * 0.05, "triangle", 0.085, this.effectsGain, bottom);
    this.tone(time + 0.075, bottom, 0.13, "square", 0.07, this.effectsGain, finish);
    this.noiseBurst(time, 0.08 + speed / 1200, 0.025 + speed / 1800, "highpass", 1450, 2800);
    if (payload.switch || payload.switchStance) {
      this.tone(time + 0.15, 740, 0.075, "sine", 0.055, this.effectsGain, 988);
    }
  }

  playSpeedEvent(time, payload, type) {
    const tier = clamp(Number(payload.tier ?? payload.speedTier ?? 3), 0, 5);
    const strength = clamp(Number(payload.strength ?? payload.drive ?? payload.potential ?? tier / 5), 0, 1);
    const downhill = type === "downhill" || type === "downhillDrive";
    const start = downhill ? 118 + strength * 48 : 180 + tier * 34;
    const end = downhill ? 360 + strength * 420 : start * 1.65;
    this.noiseBurst(time, 0.12 + strength * 0.1, 0.022 + strength * 0.04, "highpass", 720 + tier * 150, 2600 + tier * 230);
    this.tone(time, start, 0.1 + strength * 0.08, "triangle", 0.055 + strength * 0.035, this.effectsGain, end);
  }

  playWildlifePhase(time, payload) {
    const kind = normalizeWorldKind(payload.kind ?? payload.animal ?? payload.id);
    const phase = String(payload.phase ?? "").toLowerCase();
    if (kind === "dolphin") {
      if (phase === "telegraph" || phase === "approach") {
        this.chirp(time, 540, phase === "telegraph" ? 940 : 1180, 0.12, 0.075);
      } else if (phase === "catchable") {
        this.chirp(time, 660, 1480, 0.18, 0.11);
        this.tone(time + 0.11, 1760, 0.07, "sine", 0.045, this.effectsGain, 1320);
      } else if (phase === "depart") {
        this.tone(time, 720, 0.12, "triangle", 0.038, this.effectsGain, 360);
      }
      return;
    }
    if (kind === "shark") {
      if (phase === "telegraph") {
        this.tone(time, 124, 0.24, "sawtooth", 0.105, this.effectsGain, 62);
        this.tone(time + 0.09, 185, 0.13, "square", 0.045, this.effectsGain, 92);
      } else if (phase === "crossing") {
        this.noiseBurst(time, 0.2, 0.09, "bandpass", 760, 1320);
        this.tone(time, 78, 0.18, "triangle", 0.07, this.effectsGain, 148);
      }
      return;
    }
    if (kind !== "whale") return;
    if (phase === "distant") {
      this.tone(time, 46, 0.48, "triangle", 0.12, this.effectsGain, 34);
    } else if (phase === "blow") {
      this.tone(time, 38, 0.34, "sine", 0.13, this.effectsGain, 64);
      this.noiseBurst(time + 0.08, 0.3, 0.08, "highpass", 420, 1500);
    } else if (phase === "breach") {
      this.tone(time, 52, 0.42, "triangle", 0.15, this.effectsGain, 104);
      this.noiseBurst(time + 0.12, 0.28, 0.1, "lowpass", 720, 260);
    } else if (phase === "ramp") {
      this.tone(time, 82, 0.3, "sine", 0.09, this.effectsGain, 220);
    } else if (phase === "splash") {
      this.noiseBurst(time, 0.5, 0.24, "lowpass", 920, 170);
      this.tone(time, 58, 0.42, "triangle", 0.16, this.effectsGain, 29);
    }
  }

  playAnimalMount(time, kind) {
    if (kind === "whale") {
      this.tone(time, 48, 0.28, "triangle", 0.15, this.effectsGain, 96);
      this.chirp(time + 0.08, 196, 784, 0.22, 0.11);
      return;
    }
    this.chirp(time, 440, 1568, 0.24, 0.16);
    this.tone(time + 0.12, 988, 0.16, "sine", 0.075, this.effectsGain, 1319);
  }

  playAnimalDismount(time, payload) {
    const kind = normalizeWorldKind(payload.kind ?? payload.animal ?? payload.reason ?? payload.id);
    if (kind === "whale") {
      this.tone(time, 72, 0.22, "triangle", 0.12, this.effectsGain, 210);
      this.noiseBurst(time + 0.07, 0.18, 0.09, "lowpass", 760, 330);
    } else {
      this.chirp(time, 320, 1040, 0.2, 0.13);
    }
    this.tone(time + 0.13, 1320, 0.09, "sine", 0.06, this.effectsGain, 1760);
  }

  playSharkCollision(time) {
    this.noiseBurst(time, 0.3, 0.24, "lowpass", 1050, 180);
    this.tone(time, 112, 0.3, "sawtooth", 0.14, this.effectsGain, 36);
  }

  playSharkThread(time) {
    this.tone(time, 165, 0.09, "square", 0.085, this.effectsGain, 660);
    this.chirp(time + 0.055, 523, 1175, 0.12, 0.09);
  }

  playPowerupPhase(time, payload) {
    const phase = String(payload.phase ?? "").toLowerCase();
    if (phase !== "telegraph" && phase !== "available") return;
    const cue = powerupToneFor(payload);
    const volume = phase === "available" ? 0.055 : 0.035;
    this.tone(time, cue.start * 1.5, 0.08, "sine", volume, this.effectsGain, cue.end * 1.25);
  }

  playPowerup(time, payload, stage) {
    const cue = powerupToneFor(payload);
    if (stage === "expired") {
      this.tone(time, cue.accent, 0.2, "triangle", 0.065, this.effectsGain, cue.start * 0.7);
      return;
    }
    if (stage === "consumed") {
      this.tone(time, cue.accent, 0.13, cue.type, 0.1, this.effectsGain, cue.end);
      this.tone(time + 0.065, cue.end, 0.09, "sine", 0.05, this.effectsGain, cue.start);
      return;
    }
    this.tone(time, cue.start, 0.18, cue.type, 0.14, this.effectsGain, cue.end);
    this.tone(time + 0.075, cue.accent, 0.13, "sine", 0.09, this.effectsGain, cue.accent * 1.5);
    this.noiseBurst(time, 0.09, 0.045, "highpass", 1100, 3200);
  }

  playTrafficEvent(time, payload) {
    const kind = normalizeWorldKind(payload.kind ?? payload.id);
    const phase = String(payload.phase ?? "").toLowerCase();
    if (kind === "bannerplane") {
      if (!phase || phase === "approach") {
        this.tone(time, 146, 0.22, "triangle", 0.04, this.effectsGain, 164);
        this.tone(time + 0.1, 587, 0.09, "sine", 0.03, this.effectsGain, 784);
      } else if (phase === "tow") {
        this.tone(time, 330, 0.1, "triangle", 0.035, this.effectsGain, 440);
      }
    } else if (kind === "helicopter") {
      this.tone(time, 88, 0.18, "square", 0.035, this.effectsGain, 92);
      this.noiseTick(time + 0.06, 0.025, 0.018, this.effectsGain, 460);
    } else if (kind === "propplane" || kind === "seaplane") {
      this.tone(time, kind === "seaplane" ? 116 : 132, 0.2, "triangle", 0.03, this.effectsGain, 154);
    } else if (kind === "cargoship") {
      this.tone(time, 55, 0.48, "sine", 0.055, this.effectsGain, 46);
    }
  }

  playCarrierPhase(time, phaseValue) {
    const phase = String(phaseValue ?? "").toLowerCase();
    if (phase === "haze") {
      this.tone(time, 41, 0.52, "triangle", 0.07, this.effectsGain, 52);
    } else if (phase === "arrival") {
      this.tone(time, 55, 0.44, "sine", 0.1, this.effectsGain, 73);
      this.tone(time + 0.2, 110, 0.25, "triangle", 0.04, this.effectsGain, 82);
    } else if (phase === "deckactivity") {
      this.tone(time, 440, 0.07, "sine", 0.045, this.effectsGain, 880);
      this.tone(time + 0.12, 660, 0.07, "sine", 0.035, this.effectsGain, 990);
    } else if (phase === "launch") {
      this.noiseBurst(time, 0.32, 0.08, "highpass", 520, 2800);
      this.tone(time, 82, 0.32, "sawtooth", 0.08, this.effectsGain, 440);
    } else if (phase === "airshow") {
      this.chirp(time, 220, 880, 0.24, 0.12);
      this.tone(time + 0.12, 1175, 0.18, "triangle", 0.075, this.effectsGain, 1760);
    } else if (phase === "depart") {
      this.tone(time, 164, 0.36, "triangle", 0.06, this.effectsGain, 55);
    }
  }

  playFleetAirshow(time, payload) {
    const success = payload.reason === "success" || Number(payload.value) > 0 || payload.success === true;
    if (!success) {
      this.tone(time, 330, 0.22, "triangle", 0.055, this.effectsGain, 147);
      return;
    }
    this.chirp(time, 262, 1047, 0.3, 0.15);
    this.tone(time + 0.11, 1319, 0.16, "square", 0.09, this.effectsGain, 2093);
    this.tone(time + 0.22, 2637, 0.15, "sine", 0.065, this.effectsGain, 2093);
  }

  playLanding(time, quality = "clean", payload = EMPTY_EVENT_PAYLOAD) {
    if (quality === "perfect") {
      this.chirp(time, 330, 990, 0.2, 0.2);
      this.tone(time + 0.08, 1320, 0.08, "square", 0.08, this.effectsGain);
      this.noiseBurst(time, 0.065, 0.045, "highpass", 1200, 2600);
    } else if (quality === "wobble" || quality === "sketchy" || quality === "rough") {
      this.tone(time, 115, 0.14, "sawtooth", 0.1, this.effectsGain, 82);
      this.noiseBurst(time, 0.13, 0.1, "lowpass", 820, 230);
    } else {
      this.tone(time, 280, 0.11, "square", 0.13, this.effectsGain, 440);
      this.noiseBurst(time, 0.075, 0.05, "bandpass", 620, 900);
    }
    if (payload.switch || payload.switchLanding) this.tone(time + 0.12, 698, 0.07, "sine", 0.045, this.effectsGain, 1047);
  }

  tone(time, frequency, duration, type, volume, destination, endFrequency = frequency) {
    if (!this.context || !destination || this.destroyed) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), time);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), time + duration);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), time + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.02);
  }

  chirp(time, start, end, duration, volume) {
    this.tone(time, start, duration, "square", volume, this.effectsGain, end);
    this.tone(time + 0.025, start * 1.5, duration * 0.72, "triangle", volume * 0.42, this.effectsGain, end * 1.5);
  }

  noiseTick(time, duration, volume, destination = this.musicGain, frequency = null) {
    if (!this.context || !destination || this.destroyed) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency ?? 1800 + (this.beatIndex % 3) * 420, time);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(destination);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }

  noiseBurst(time, duration, volume, filterType = "", startFrequency = 1200, endFrequency = startFrequency) {
    if (!this.context || !this.effectsGain || this.destroyed) return;
    this.createEffectNoiseBuffer();
    if (!this.effectNoiseBuffer) return;
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, volume), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.buffer = this.effectNoiseBuffer;
    source.connect(gain);
    if (filterType && this.context.createBiquadFilter) {
      const filter = this.context.createBiquadFilter();
      filter.type = filterType;
      filter.Q.value = filterType === "bandpass" ? 1.2 : 0.7;
      filter.frequency.setValueAtTime(Math.max(20, startFrequency), time);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), time + duration);
      gain.connect(filter).connect(this.effectsGain);
    } else {
      gain.connect(this.effectsGain);
    }
    const availableOffset = Math.max(0, this.effectNoiseBuffer.duration - duration - 0.01);
    const offset = availableOffset > 0 ? (this.noiseCursor * 0.173) % availableOffset : 0;
    this.noiseCursor += 1;
    source.start(time, offset);
    source.stop(time + duration + 0.01);
  }

  duck(amount = 0.5, duration = 0.3) {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.duckAmount = clamp(Number(amount) || 0.5, 0.15, 1);
    this.duckUntil = Math.max(this.duckUntil, now + Math.max(0.05, Number(duration) || 0.3));
    const lifecycle = LIFECYCLE_MIX[this.lifecycle] ?? LIFECYCLE_MIX.menu;
    setParamTarget(
      this.musicGain?.gain,
      safeLevel(this.settings.music, 0.58) * 0.22 * lifecycle.music * this.duckAmount,
      now,
      0.018,
    );
  }

  setLifecycle(nextLifecycle) {
    const next = Object.hasOwn(LIFECYCLE_MIX, nextLifecycle) ? nextLifecycle : "menu";
    const wasRunning = this.lifecycle === "running" && !this.mutedByVisibility;
    this.lifecycle = next;
    const isRunning = next === "running" && !this.mutedByVisibility;
    if (isRunning && !wasRunning) {
      this.resyncMusicClock();
      if (this.context?.state === "suspended") {
        try { this.context.resume()?.catch?.(() => {}); } catch {}
      }
    }
    this.applyLifecycleMix();
  }

  resetRun() {
    this.lastSpeedTier = -1;
    this.lastFinalSecond = -1;
    this.inPowerLine = false;
    this.duckUntil = 0;
    this.duckAmount = 1;
    this.beatIndex = 0;
    this.resyncMusicClock();
    if (!this.context) return;
    const now = this.context.currentTime;
    setParamTarget(this.boardGain?.gain, 0, now, 0.015);
    setParamTarget(this.windGain?.gain, 0, now, 0.015);
  }

  resyncMusicClock(now = this.context?.currentTime ?? 0) {
    this.nextBeat = Math.max(0, Number(now) || 0) + 0.06;
  }

  applyLifecycleMix() {
    if (!this.context || this.destroyed) return;
    const now = this.context.currentTime;
    const lifecycle = LIFECYCLE_MIX[this.lifecycle] ?? LIFECYCLE_MIX.menu;
    const muted = this.mutedByVisibility || Boolean(this.settings.muted);
    const music = safeLevel(this.settings.music, 0.58);
    const effects = safeLevel(this.settings.effects, 0.78);
    const wave = safeLevel(this.settings.waveAudio, 0.52);
    setParamTarget(this.master?.gain, muted ? 0 : lifecycle.master, now, muted ? 0.018 : 0.055);
    setParamTarget(this.musicGain?.gain, music * 0.22 * lifecycle.music, now, 0.06);
    setParamTarget(this.effectsGain?.gain, effects * 0.42 * lifecycle.effects, now, 0.045);
    setParamTarget(this.waveGain?.gain, wave * 0.13 * lifecycle.wave, now, 0.09);
    if (this.lifecycle !== "running") {
      setParamTarget(this.boardGain?.gain, 0, now, 0.045);
      setParamTarget(this.windGain?.gain, 0, now, 0.08);
    }
  }

  setVisibility(hidden) {
    const wasAudible = this.lifecycle === "running" && !this.mutedByVisibility;
    this.mutedByVisibility = Boolean(hidden);
    if (!this.mutedByVisibility && !wasAudible && this.lifecycle === "running") this.resyncMusicClock();
    this.applyLifecycleMix();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    for (const source of [this.waveSource, this.boardSource, this.windSource]) {
      try { source?.stop(); } catch {}
    }
    for (const node of [
      this.waveSource,
      this.boardSource,
      this.windSource,
      this.waveFilter,
      this.boardFilter,
      this.windFilter,
      this.waveGain,
      this.boardGain,
      this.windGain,
      this.effectsGain,
      this.musicGain,
      this.master,
      this.limiter,
    ]) {
      try { node?.disconnect(); } catch {}
    }
    const context = this.context;
    this.waveSource = null;
    this.boardSource = null;
    this.windSource = null;
    this.waveFilter = null;
    this.boardFilter = null;
    this.windFilter = null;
    this.waveGain = null;
    this.boardGain = null;
    this.windGain = null;
    this.effectsGain = null;
    this.musicGain = null;
    this.master = null;
    this.limiter = null;
    this.continuousNoiseBuffer = null;
    this.effectNoiseBuffer = null;
    this.context = null;
    if (context && context.state !== "closed") {
      try { context.close()?.catch?.(() => {}); } catch {}
    }
  }
}

export function safeLevel(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(number, 0, 1) : clamp(Number(fallback) || 0, 0, 1);
}

function smoothAudioStep(edge0, edge1, value) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((Number(value) - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function setParamTarget(param, value, time, constant) {
  if (!param) return;
  const finiteValue = Number.isFinite(value) ? value : 0;
  if (typeof param.setTargetAtTime === "function") param.setTargetAtTime(finiteValue, time, constant);
  else param.value = finiteValue;
}

function setParamValue(param, value) {
  if (!param) return;
  if (typeof param.setValueAtTime === "function") param.setValueAtTime(value, 0);
  else param.value = value;
}

function conditionIdFor(simulation, settings) {
  const candidate = simulation?.condition?.id ?? simulation?.condition ?? settings?.condition ?? "goldenCoast";
  return candidate === "twilightGlass" || candidate === "stormbreak" ? candidate : "goldenCoast";
}

function normalizeCueId(id) {
  const value = String(id ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (value.includes("tail")) return "tailGrab";
  if (value.includes("varial") || value.includes("boardflip")) return "varial";
  if (value.includes("twist") || value.includes("signature")) return "kakiTwist";
  if (value.includes("cutback")) return "cutback";
  if (value.includes("floater")) return "floater";
  if (value.includes("tube") || value.includes("soularch")) return "tubeTuck";
  if (value.includes("snap")) return "snap";
  return "frontRail";
}

function normalizeWorldKind(kind) {
  return String(kind ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function powerupToneFor(payload) {
  const kind = normalizeWorldKind(payload.kind ?? payload.powerup ?? payload.id);
  if (kind.includes("moonpop") || kind.includes("moon")) return POWERUP_TONES.moonPop;
  if (kind.includes("starfoam") || kind.includes("star")) return POWERUP_TONES.starFoam;
  return POWERUP_TONES.mangoRush;
}
