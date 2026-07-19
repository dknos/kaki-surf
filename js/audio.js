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
    this.nextBeat = 0;
    this.beatIndex = 0;
    this.started = false;
    this.destroyed = false;
    this.mutedByVisibility = false;
    this.conditionId = "goldenCoast";
    this.lastSpeedTier = -1;
    this.lastFinalSecond = -1;
    this.inPowerLine = false;
  }

  async unlock() {
    if (this.destroyed) return;
    if (!this.context) this.createGraph();
    if (!this.context) return;
    if (this.context.state === "suspended") await this.context.resume();
    this.started = true;
    this.nextBeat = this.context.currentTime + 0.06;
  }

  createGraph() {
    const AudioContextClass = globalThis.AudioContext ?? globalThis.webkitAudioContext ?? globalThis.window?.AudioContext ?? globalThis.window?.webkitAudioContext;
    if (!AudioContextClass || this.destroyed) return;
    this.context = new AudioContextClass({ latencyHint: "interactive" });
    this.master = this.context.createGain();
    this.musicGain = this.context.createGain();
    this.effectsGain = this.context.createGain();
    this.waveGain = this.context.createGain();
    this.waveFilter = this.context.createBiquadFilter();
    this.waveFilter.type = "lowpass";
    this.waveFilter.frequency.value = 1050;
    this.musicGain.connect(this.master);
    this.effectsGain.connect(this.master);
    this.waveGain.connect(this.waveFilter).connect(this.master);
    this.master.connect(this.context.destination);
    this.applySettings();
    this.createWaveNoise();
  }

  createWaveNoise() {
    if (!this.context || !this.waveGain) return;
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
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(this.waveGain);
    source.start();
    this.waveSource = source;
  }

  applySettings(settings = this.settings) {
    this.settings = { ...this.settings, ...settings };
    if (!this.context || this.destroyed) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.mutedByVisibility ? 0 : 0.82, now, 0.02);
    this.musicGain.gain.setTargetAtTime(clamp(Number(this.settings.music ?? 0.58), 0, 1) * 0.22, now, 0.04);
    this.effectsGain.gain.setTargetAtTime(clamp(Number(this.settings.effects ?? 0.78), 0, 1) * 0.42, now, 0.03);
    this.waveGain.gain.setTargetAtTime(clamp(Number(this.settings.waveAudio ?? 0.52), 0, 1) * 0.13, now, 0.08);
  }

  update(simulation) {
    if (!this.started || !this.context || this.context.state !== "running" || this.destroyed) return;
    const player = simulation.player;
    const risk = player.speedPotential?.risk ?? simulation.wave.pocketRisk(player.x);
    const potential = player.speedPotential?.potential ?? 0.5;
    const speed = Number(player.speed ?? 0);
    const combo = Number(simulation.score?.combo ?? simulation.currentMultiplier?.() ?? 1);
    const airborne = player.state === "airborne";
    const seconds = Math.ceil(simulation.timeRemaining ?? 99);
    const now = this.context.currentTime;
    this.conditionId = conditionIdFor(simulation, this.settings);

    const conditionFilter = this.conditionId === "stormbreak" ? 360 : this.conditionId === "twilightGlass" ? 180 : 0;
    this.waveFilter.frequency.setTargetAtTime(560 + speed * 4.5 + risk * 1180 + potential * 310 + conditionFilter, now, 0.08);
    const pocketGain = 0.05 + risk * 0.15 + potential * 0.045 + (airborne ? -0.025 : 0);
    this.waveGain.gain.setTargetAtTime(clamp(Number(this.settings.waveAudio ?? 0.52), 0, 1) * pocketGain, now, 0.07);
    this.musicGain.gain.setTargetAtTime(clamp(Number(this.settings.music ?? 0.58), 0, 1) * (airborne ? 0.17 : 0.22 + Math.min(0.055, combo * 0.012)), now, 0.05);

    const speedTier = clamp(Math.floor((speed - 34) / 24), 0, 4);
    if (speedTier > this.lastSpeedTier && speedTier >= 3) this.tone(now, 520 + speedTier * 80, 0.05, "triangle", 0.035, this.effectsGain, 720 + speedTier * 90);
    this.lastSpeedTier = speedTier;

    if (seconds <= 10 && seconds >= 0 && seconds !== this.lastFinalSecond) {
      this.lastFinalSecond = seconds;
      this.tone(now, seconds <= 3 ? 880 : 660, 0.045, "square", seconds <= 3 ? 0.07 : 0.045, this.musicGain, seconds <= 3 ? 1320 : 770);
    }

    while (this.nextBeat < now + 0.16) {
      this.scheduleBeat(this.nextBeat, { speedTier, risk, airborne, combo, finalSeconds: seconds <= 10 });
      this.nextBeat += clamp(0.146 - speedTier * 0.006 - (combo > 2.5 ? 0.008 : 0) - (seconds <= 10 ? 0.009 : 0), 0.1, 0.15);
    }
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
    const payload = event.payload ?? {};
    const now = this.context.currentTime;
    switch (event.type) {
      case "pumpCharge":
        this.tone(now, 105 + (payload.charge ?? 0) * 75, 0.055, "triangle", 0.035, this.effectsGain, 145 + (payload.charge ?? 0) * 110);
        break;
      case "trickRejected":
        this.tone(now, 176, 0.045, "square", 0.025, this.effectsGain, 132);
        break;
      case "pump":
        this.tone(now, 132, 0.075, "square", 0.07 + (payload.efficiency ?? payload.strength ?? 0.5) * 0.07, this.effectsGain, 220 + (payload.efficiency ?? payload.strength ?? 0.5) * 160);
        break;
      case "powerLineEnter":
        this.inPowerLine = true;
        this.chirp(now, 294, 660, 0.15, 0.12);
        this.tone(now + 0.06, 990, 0.08, "sine", 0.055, this.effectsGain, 1320);
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
      case "maneuver":
      case "maneuverStart":
      case "maneuverComplete":
        this.playManeuver(now, payload.id);
        break;
      case "snap":
      case "cutback":
      case "floater":
      case "tubeTuck":
        this.playManeuver(now, event.type);
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
        this.playLanding(now, payload.quality);
        break;
      case "wipeout":
        this.noiseBurst(now, 0.34, 0.26);
        this.tone(now, 160, 0.33, "square", 0.11, this.effectsGain, 52);
        break;
      case "combo":
      case "comboIncrease": {
        const combo = Number(payload.combo ?? payload.value ?? 1);
        this.chirp(now, 392 + combo * 28, 590 + combo * 55, 0.08, 0.06);
        break;
      }
      case "personalBest":
        this.chirp(now, 330, 1320, 0.34, 0.16);
        this.tone(now + 0.16, 1568, 0.16, "sine", 0.08, this.effectsGain, 2093);
        break;
      case "complete":
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

  playLanding(time, quality = "clean") {
    if (quality === "perfect") {
      this.chirp(time, 330, 990, 0.2, 0.2);
      this.tone(time + 0.08, 1320, 0.08, "square", 0.08, this.effectsGain);
    } else if (quality === "wobble" || quality === "sketchy") {
      this.tone(time, 115, 0.14, "sawtooth", 0.1, this.effectsGain, 82);
      this.noiseBurst(time, 0.1, 0.08);
    } else {
      this.tone(time, 280, 0.11, "square", 0.13, this.effectsGain, 440);
    }
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

  noiseTick(time, duration, volume) {
    if (!this.context || !this.musicGain || this.destroyed) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1800 + (this.beatIndex % 3) * 420, time);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(this.musicGain);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }

  noiseBurst(time, duration, volume) {
    if (!this.context || !this.effectsGain || this.destroyed) return;
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(Math.max(0.0001, volume), time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.buffer = buffer;
    source.connect(gain).connect(this.effectsGain);
    source.start(time);
  }

  setVisibility(hidden) {
    this.mutedByVisibility = Boolean(hidden);
    this.applySettings();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.started = false;
    try { this.waveSource?.stop(); } catch {}
    for (const node of [this.waveSource, this.waveFilter, this.waveGain, this.effectsGain, this.musicGain, this.master]) {
      try { node?.disconnect(); } catch {}
    }
    const context = this.context;
    this.waveSource = null;
    this.waveFilter = null;
    this.waveGain = null;
    this.effectsGain = null;
    this.musicGain = null;
    this.master = null;
    this.context = null;
    if (context && context.state !== "closed") {
      try { context.close()?.catch?.(() => {}); } catch {}
    }
  }
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
  if (value.includes("tube")) return "tubeTuck";
  if (value.includes("snap")) return "snap";
  return "frontRail";
}
