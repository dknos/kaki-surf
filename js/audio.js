import { clamp } from "./math.js";

const MUSIC_PATTERN = [0, 7, 12, 7, 3, 10, 15, 10, 5, 12, 17, 12, 3, 10, 14, 10];

export class SurfAudio {
  constructor(settings) {
    this.settings = settings;
    this.context = null;
    this.master = null;
    this.musicGain = null;
    this.effectsGain = null;
    this.waveGain = null;
    this.waveFilter = null;
    this.nextBeat = 0;
    this.beatIndex = 0;
    this.started = false;
    this.mutedByVisibility = false;
  }

  async unlock() {
    if (!this.context) this.createGraph();
    if (this.context.state === "suspended") await this.context.resume();
    this.started = true;
    this.nextBeat = this.context.currentTime + 0.06;
  }

  createGraph() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
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
    this.settings = settings;
    if (!this.context) return;
    const now = this.context.currentTime;
    this.master.gain.setTargetAtTime(this.mutedByVisibility ? 0 : 0.82, now, 0.02);
    this.musicGain.gain.setTargetAtTime(clamp(settings.music, 0, 1) * 0.22, now, 0.04);
    this.effectsGain.gain.setTargetAtTime(clamp(settings.effects, 0, 1) * 0.42, now, 0.03);
    this.waveGain.gain.setTargetAtTime(clamp(settings.waveAudio, 0, 1) * 0.13, now, 0.08);
  }

  update(simulation) {
    if (!this.started || !this.context || this.context.state !== "running") return;
    const risk = simulation.wave.pocketRisk(simulation.player.x);
    const speed = simulation.player.speed;
    const now = this.context.currentTime;
    this.waveFilter.frequency.setTargetAtTime(650 + speed * 4.2 + risk * 1200, now, 0.08);
    this.waveGain.gain.setTargetAtTime(this.settings.waveAudio * (0.055 + risk * 0.17), now, 0.07);
    while (this.nextBeat < now + 0.16) {
      this.scheduleBeat(this.nextBeat, simulation.score.combo);
      this.nextBeat += 0.122;
    }
  }

  scheduleBeat(time, combo) {
    const step = this.beatIndex % MUSIC_PATTERN.length;
    const frequency = 110 * Math.pow(2, MUSIC_PATTERN[step] / 12);
    if (step % 2 === 0 || combo > 2.2) this.tone(time, frequency, 0.07, "square", 0.045, this.musicGain);
    if (step % 4 === 0) this.tone(time, 55, 0.055, "triangle", 0.075, this.musicGain, 34);
    if (step % 2 === 1) this.noiseTick(time, 0.018, 0.018);
    this.beatIndex += 1;
  }

  onEvent(event) {
    if (!this.started || !this.context) return;
    const now = this.context.currentTime;
    switch (event.type) {
      case "pump":
        this.tone(now, 135, 0.07, "square", 0.08 + event.payload.strength * 0.05, this.effectsGain, 210);
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
      case "land":
        if (event.payload.quality === "perfect") {
          this.chirp(now, 330, 990, 0.2, 0.2);
          this.tone(now + 0.08, 1320, 0.08, "square", 0.08, this.effectsGain);
        } else if (event.payload.quality === "wobble") {
          this.tone(now, 115, 0.14, "sawtooth", 0.1, this.effectsGain, 82);
        } else {
          this.tone(now, 280, 0.11, "square", 0.13, this.effectsGain, 440);
        }
        break;
      case "wipeout":
        this.noiseBurst(now, 0.34, 0.26);
        this.tone(now, 160, 0.33, "square", 0.11, this.effectsGain, 52);
        break;
      case "complete":
        this.chirp(now, 260, 780, 0.42, 0.14);
        break;
      default:
        break;
    }
  }

  tone(time, frequency, duration, type, volume, destination, endFrequency = frequency) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, time);
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
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(1800 + (this.beatIndex % 3) * 420, time);
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(gain).connect(this.musicGain);
    oscillator.start(time);
    oscillator.stop(time + duration);
  }

  noiseBurst(time, duration, volume) {
    const length = Math.floor(this.context.sampleRate * duration);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const source = this.context.createBufferSource();
    const gain = this.context.createGain();
    gain.gain.setValueAtTime(volume, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.buffer = buffer;
    source.connect(gain).connect(this.effectsGain);
    source.start(time);
  }

  setVisibility(hidden) {
    this.mutedByVisibility = hidden;
    this.applySettings();
  }
}
