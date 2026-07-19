import { BOARDS, FIXED_STEP, LOGICAL_HEIGHT, LOGICAL_WIDTH, MAX_FRAME_DELTA, TUNING } from "./config.js";
import { SurfAudio } from "./audio.js";
import { InputManager } from "./input.js";
import { clamp } from "./math.js";
import { loadSave, recordRun, writeSave } from "./persistence.js";
import { KakiRenderer } from "./renderer.js";
import { SurfSimulation } from "./simulation.js";

const DEBUG_FIELDS = [
  ["speed", "Base speed", 40, 110, 1],
  ["maxSpeed", "Max speed", 90, 190, 1],
  ["carveAcceleration", "Carve acceleration", 1, 7, 0.05],
  ["carveFriction", "Carve friction", 1, 9, 0.1],
  ["wavePush", "Wave push", 2, 30, 0.5],
  ["curlSpeed", "Curl speed", 0.5, 6, 0.05],
  ["launchForce", "Launch force", 70, 180, 1],
  ["gravity", "Gravity", 90, 280, 2],
  ["rotationAcceleration", "Rotation accel", 5, 24, 0.2],
  ["airControl", "Air control", 0.35, 1.5, 0.02],
  ["landingTolerance", "Landing tolerance", 0.18, 0.9, 0.01],
  ["wipeoutThreshold", "Wipeout threshold", 0.65, 1.8, 0.01],
  ["cameraResponse", "Camera response", 1, 12, 0.1],
  ["juiceIntensity", "Juice", 0, 1.5, 0.05],
  ["scoreSpeed", "Speed score", 0, 0.8, 0.01],
  ["scorePocket", "Pocket score", 0.2, 2.5, 0.05],
  ["scoreFlow", "Flow score", 0.1, 1, 0.01],
  ["scoreAir", "Air score", 0.4, 2.5, 0.05],
];

const DEFAULT_TUNING = Object.freeze({ ...TUNING });

export class KakiSurfGame {
  constructor({
    host,
    externalInput = null,
    externalAudio = null,
    storage = globalThis.localStorage,
    hostSettings = null,
    profile = null,
    onExit = null,
    onRunComplete = null,
  }) {
    this.host = host;
    this.storage = storage;
    this.profile = profile;
    this.onExit = onExit;
    this.onRunComplete = onRunComplete;
    this.save = loadSave(storage);
    if (hostSettings) this.save.settings = { ...this.save.settings, ...hostSettings };
    this.settings = this.save.settings;
    this.state = "menu";
    this.pausedFrom = null;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.frameHandle = 0;
    this.started = false;
    this.destroyed = false;
    this.abort = new AbortController();
    this.host.innerHTML = gameMarkup();
    this.elements = collectElements(host);
    this.simulation = new SurfSimulation({ tuning: TUNING });
    this.renderer = new KakiRenderer(this.elements.canvas, this.settings);
    this.ownsInput = !externalInput;
    this.input = externalInput ?? new InputManager({ touchRoot: this.elements.touchControls });
    this.audio = externalAudio ?? new SurfAudio(this.settings);
    this.selectedBoard = BOARDS[this.save.selectedBoard] ? this.save.selectedBoard : "foamPuff";
    this.bindUI();
    this.buildBoardCards();
    this.buildDebugPanel();
    this.syncSettingsUI();
    this.updateMenuStats();
    this.showLayer("menu");
  }

  start({ immediate = false, board = null } = {}) {
    if (this.destroyed) throw new Error("Cannot start a destroyed Kaki Surf instance.");
    if (board && BOARDS[board]) this.selectBoard(board);
    if (!this.started) {
      this.started = true;
      this.lastFrame = performance.now();
      this.frameHandle = requestAnimationFrame((now) => this.frame(now));
    }
    if (immediate) this.startRun();
    return this;
  }

  async startRun() {
    if (this.destroyed) return;
    this.save.selectedBoard = this.selectedBoard;
    writeSave(this.save, this.storage);
    this.simulation.reset({
      board: this.selectedBoard,
      assists: {
        steering: this.settings.steeringAssist,
        landing: this.settings.landingAssist,
      },
    });
    this.simulation.begin();
    this.accumulator = 0;
    this.state = "running";
    this.pausedFrom = null;
    this.showLayer(null);
    this.elements.canvas.focus({ preventScroll: true });
    this.elements.touchControls.hidden = !this.settings.touchControls;
    try {
      await this.audio.unlock?.();
    } catch (error) {
      console.warn("Kaki Surf audio could not be unlocked; play continues silently.", error);
    }
    this.announce(`Ride started on ${BOARDS[this.selectedBoard].name}.`);
  }

  pause(reason = "manual") {
    if (this.state !== "running") return;
    this.pausedFrom = reason;
    this.state = "paused";
    this.input.clear?.();
    this.showLayer("pause");
    this.announce("Surfing paused.");
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "running";
    this.pausedFrom = null;
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.showLayer(null);
    this.elements.canvas.focus({ preventScroll: true });
    this.announce("Surfing resumed.");
  }

  restart() {
    this.startRun();
  }

  backToMenu() {
    this.state = "menu";
    this.simulation.reset({ board: this.selectedBoard });
    this.accumulator = 0;
    this.updateMenuStats();
    this.showLayer("menu");
    this.elements.touchControls.hidden = true;
    this.elements.startButton.focus({ preventScroll: true });
  }

  getSnapshot() {
    return {
      lifecycle: this.state,
      state: this.simulation.player.state,
      elapsed: this.simulation.elapsed,
      timeRemaining: this.simulation.timeRemaining,
      score: Math.round(this.simulation.score.total),
      multiplier: this.simulation.currentMultiplier(),
      wipeouts: this.simulation.wipeouts,
      board: this.selectedBoard,
      bestScore: this.save.bestScore,
      assists: { ...this.simulation.assists },
    };
  }

  frame(now) {
    if (this.destroyed) return;
    const frameDelta = clamp((now - this.lastFrame) / 1000, 0, MAX_FRAME_DELTA);
    this.lastFrame = now;
    this.input.update?.(frameDelta);
    const meta = this.input.consumeMeta?.() ?? EMPTY_META;

    if (meta.debug) this.toggleDebug();
    if (meta.pause) {
      if (this.state === "running") this.pause();
      else if (this.state === "paused") this.resume();
    }
    if (meta.restart && (this.state === "running" || this.state === "results")) this.restart();

    if (this.state === "running") {
      if (!this.renderer.shouldFreeze()) {
        this.accumulator = Math.min(this.accumulator + frameDelta, FIXED_STEP * 14);
        let steps = 0;
        while (this.accumulator + 1e-10 >= FIXED_STEP && steps < 14) {
          const controls = this.input.consumeStep?.() ?? EMPTY_CONTROLS;
          this.simulation.update(FIXED_STEP, controls);
          this.processEvents();
          this.accumulator = Math.max(0, this.accumulator - FIXED_STEP);
          steps += 1;
          if (this.state !== "running" || this.renderer.shouldFreeze()) break;
        }
      } else {
        this.accumulator = 0;
      }
      this.audio.update?.(this.simulation);
    } else if (this.state === "menu") {
      this.simulation.wave.update(frameDelta * 0.26, 24, 0);
      const controls = this.input.consumeStep?.() ?? EMPTY_CONTROLS;
      if (controls.edgePressed) this.startRun();
    } else if (this.state === "results") {
      const controls = this.input.consumeStep?.() ?? EMPTY_CONTROLS;
      if (controls.edgePressed) this.restart();
    }

    this.renderer.update(frameDelta, this.simulation);
    const alpha = this.accumulator / FIXED_STEP;
    this.renderer.render(this.simulation, alpha);
    this.frameHandle = requestAnimationFrame((next) => this.frame(next));
  }

  processEvents() {
    this.simulation.consumeEvents((event) => {
      this.renderer.onEvent(event, this.simulation);
      this.audio.onEvent?.(event, this.simulation);
      if (event.type === "callout") this.announce(event.payload.subtext ? `${event.payload.text}. ${event.payload.subtext}` : event.payload.text);
      if (event.type === "complete") this.handleComplete(event.payload);
      if (event.type === "wipeout" && navigator.vibrate) navigator.vibrate(this.settings.reducedMotion ? 0 : 35);
    });
  }

  handleComplete(result) {
    const enriched = { ...result, board: this.selectedBoard };
    const isBest = recordRun(this.save, enriched);
    writeSave(this.save, this.storage);
    this.state = "results";
    this.renderResults(enriched, isBest);
    this.showLayer("results");
    this.elements.touchControls.hidden = true;
    this.elements.retryButton.focus({ preventScroll: true });
    this.onRunComplete?.(enriched);
    this.announce(`${result.rank.title}. Score ${Math.round(result.score)}. Flow ${result.flow} percent.`);
  }

  renderResults(result, isBest) {
    const breakdown = result.breakdown;
    this.elements.resultRank.textContent = result.rank.grade;
    this.elements.resultTitle.textContent = result.rank.title;
    this.elements.resultScore.textContent = Math.round(result.score).toLocaleString();
    this.elements.resultBest.textContent = isBest ? "NEW PERSONAL BEST" : `BEST ${this.save.bestScore.toLocaleString()}`;
    this.elements.resultFlow.textContent = `${result.flow}%`;
    this.elements.breakdown.innerHTML = [
      ["Ride", breakdown.ride],
      ["Speed", breakdown.speed],
      ["Pocket", breakdown.pocket],
      ["Carves", breakdown.carves],
      ["Air", breakdown.air],
      ["Style", breakdown.style],
      ["Landings", breakdown.landings],
    ].map(([label, value]) => `<div><span>${label}</span><strong>${Math.round(value).toLocaleString()}</strong></div>`).join("");
  }

  bindUI() {
    const signal = this.abort.signal;
    this.elements.startButton.addEventListener("click", () => this.startRun(), { signal });
    this.elements.retryButton.addEventListener("click", () => this.restart(), { signal });
    this.elements.resumeButton.addEventListener("click", () => this.resume(), { signal });
    this.elements.menuButtons.forEach((button) => button.addEventListener("click", () => this.backToMenu(), { signal }));
    this.elements.settingsButtons.forEach((button) => button.addEventListener("click", () => this.openSettings(), { signal }));
    this.elements.closeSettings.addEventListener("click", () => this.closeSettings(), { signal });
    this.elements.settingsDialog.addEventListener("click", (event) => {
      if (event.target === this.elements.settingsDialog) this.closeSettings();
    }, { signal });
    this.elements.fullscreenButton.addEventListener("click", () => this.toggleFullscreen(), { signal });
    this.elements.exitButton.addEventListener("click", () => {
      if (this.onExit) this.onExit(this.getSnapshot());
      else this.backToMenu();
    }, { signal });

    this.elements.settingsInputs.forEach((input) => {
      input.addEventListener("input", () => this.updateSetting(input), { signal });
      input.addEventListener("change", () => this.updateSetting(input), { signal });
    });

    document.addEventListener("visibilitychange", () => {
      const hidden = document.visibilityState === "hidden";
      this.audio.setVisibility?.(hidden);
      if (hidden) this.pause("visibility");
    }, { signal });
    window.addEventListener("blur", () => this.pause("blur"), { signal });
    window.addEventListener("keydown", (event) => {
      if (event.code === "Escape" && this.elements.settingsDialog.open) {
        event.preventDefault();
        this.closeSettings();
      }
    }, { signal });
  }

  buildBoardCards() {
    this.elements.boardGrid.innerHTML = Object.values(BOARDS).map((board) => `
      <button class="board-card${board.id === this.selectedBoard ? " is-selected" : ""}" type="button" data-board="${board.id}" aria-pressed="${board.id === this.selectedBoard}">
        <span class="board-art" style="--board:${board.color};--board-accent:${board.accent}" aria-hidden="true"><i></i></span>
        <strong>${board.name}</strong>
        <small>${board.tagline}</small>
        <span>${board.description}</span>
      </button>
    `).join("");
    this.elements.boardGrid.querySelectorAll("[data-board]").forEach((button) => {
      button.addEventListener("click", () => this.selectBoard(button.dataset.board), { signal: this.abort.signal });
    });
  }

  selectBoard(boardId) {
    if (!BOARDS[boardId]) return;
    this.selectedBoard = boardId;
    this.save.selectedBoard = boardId;
    this.elements.boardGrid.querySelectorAll("[data-board]").forEach((button) => {
      const selected = button.dataset.board === boardId;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    this.elements.selectedBoardName.textContent = BOARDS[boardId].name;
    writeSave(this.save, this.storage);
  }

  buildDebugPanel() {
    this.elements.debugFields.innerHTML = DEBUG_FIELDS.map(([key, label, min, max, step]) => `
      <label><span>${label}<output data-output="${key}">${TUNING[key]}</output></span><input type="range" data-tuning="${key}" min="${min}" max="${max}" step="${step}" value="${TUNING[key]}"></label>
    `).join("");
    this.elements.debugFields.querySelectorAll("[data-tuning]").forEach((input) => {
      input.addEventListener("input", () => {
        const key = input.dataset.tuning;
        TUNING[key] = Number(input.value);
        this.elements.debugFields.querySelector(`[data-output="${key}"]`).textContent = Number(input.value).toFixed(Number(input.step) < 0.1 ? 2 : 1);
      }, { signal: this.abort.signal });
    });
    this.elements.debugReset.addEventListener("click", () => {
      Object.assign(TUNING, DEFAULT_TUNING);
      for (const input of this.elements.debugFields.querySelectorAll("[data-tuning]")) {
        input.value = TUNING[input.dataset.tuning];
        input.dispatchEvent(new Event("input"));
      }
    }, { signal: this.abort.signal });
  }

  toggleDebug() {
    this.elements.debugPanel.hidden = !this.elements.debugPanel.hidden;
  }

  updateSetting(input) {
    const key = input.dataset.setting;
    if (!key) return;
    this.settings[key] = input.type === "checkbox" ? input.checked : Number(input.value);
    const output = this.host.querySelector(`[data-setting-output="${key}"]`);
    if (output) output.textContent = `${Math.round(this.settings[key] * 100)}%`;
    this.renderer.applySettings(this.settings);
    this.audio.applySettings?.(this.settings);
    this.elements.touchControls.hidden = !this.settings.touchControls || this.state !== "running";
    this.save.settings = this.settings;
    writeSave(this.save, this.storage);
  }

  syncSettingsUI() {
    for (const input of this.elements.settingsInputs) {
      const key = input.dataset.setting;
      if (input.type === "checkbox") input.checked = Boolean(this.settings[key]);
      else input.value = this.settings[key];
      const output = this.host.querySelector(`[data-setting-output="${key}"]`);
      if (output) output.textContent = `${Math.round(this.settings[key] * 100)}%`;
    }
    this.selectBoard(this.selectedBoard);
  }

  openSettings() {
    if (this.state === "running") this.pause("settings");
    this.elements.settingsDialog.showModal();
  }

  closeSettings() {
    if (!this.elements.settingsDialog.open) return;
    this.elements.settingsDialog.close();
    if (this.state === "paused" && this.pausedFrom === "settings") this.resume();
  }

  updateMenuStats() {
    this.elements.bestScore.textContent = this.save.bestScore.toLocaleString();
    this.elements.runCount.textContent = String(this.save.totalRuns);
    this.elements.selectedBoardName.textContent = BOARDS[this.selectedBoard].name;
  }

  showLayer(name) {
    this.elements.menuLayer.hidden = name !== "menu";
    this.elements.pauseLayer.hidden = name !== "pause";
    this.elements.resultsLayer.hidden = name !== "results";
    this.elements.topControls.hidden = name === "menu";
  }

  announce(message) {
    this.elements.liveRegion.textContent = "";
    requestAnimationFrame(() => { this.elements.liveRegion.textContent = message; });
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await this.host.requestFullscreen();
    } catch (error) {
      console.warn("Fullscreen is unavailable.", error);
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frameHandle);
    this.abort.abort();
    if (this.ownsInput) this.input.destroy?.();
    this.host.innerHTML = "";
  }
}

function collectElements(host) {
  return {
    canvas: host.querySelector("canvas"),
    menuLayer: host.querySelector("[data-layer=menu]"),
    pauseLayer: host.querySelector("[data-layer=pause]"),
    resultsLayer: host.querySelector("[data-layer=results]"),
    topControls: host.querySelector(".top-controls"),
    startButton: host.querySelector("[data-action=start]"),
    retryButton: host.querySelector("[data-action=retry]"),
    resumeButton: host.querySelector("[data-action=resume]"),
    menuButtons: host.querySelectorAll("[data-action=menu]"),
    settingsButtons: host.querySelectorAll("[data-action=settings]"),
    fullscreenButton: host.querySelector("[data-action=fullscreen]"),
    exitButton: host.querySelector("[data-action=exit]"),
    boardGrid: host.querySelector(".board-grid"),
    bestScore: host.querySelector("[data-stat=best]"),
    runCount: host.querySelector("[data-stat=runs]"),
    selectedBoardName: host.querySelector("[data-stat=board]"),
    resultRank: host.querySelector("[data-result=rank]"),
    resultTitle: host.querySelector("[data-result=title]"),
    resultScore: host.querySelector("[data-result=score]"),
    resultBest: host.querySelector("[data-result=best]"),
    resultFlow: host.querySelector("[data-result=flow]"),
    breakdown: host.querySelector("[data-result=breakdown]"),
    settingsDialog: host.querySelector(".settings-dialog"),
    closeSettings: host.querySelector("[data-action=close-settings]"),
    settingsInputs: host.querySelectorAll("[data-setting]"),
    touchControls: host.querySelector(".touch-controls"),
    debugPanel: host.querySelector(".debug-panel"),
    debugFields: host.querySelector(".debug-fields"),
    debugReset: host.querySelector("[data-action=debug-reset]"),
    liveRegion: host.querySelector("[aria-live]"),
  };
}

function gameMarkup() {
  return `
    <section class="surf-shell" aria-label="Kaki Surf arcade game">
      <div class="stage-frame">
        <canvas width="${LOGICAL_WIDTH}" height="${LOGICAL_HEIGHT}" tabindex="0" aria-label="Kitty Kaki rides a moving wave. Use arrow keys or a controller stick to carve, Space or Z to pump, and X to style in the air."></canvas>
        <div class="scanlines" aria-hidden="true"></div>
        <nav class="top-controls" aria-label="Game controls" hidden>
          <button type="button" data-action="settings" aria-label="Open settings">SET</button>
          <button type="button" data-action="fullscreen" aria-label="Toggle fullscreen">FULL</button>
          <button type="button" data-action="exit" aria-label="Leave this run">EXIT</button>
        </nav>

        <div class="game-layer title-layer" data-layer="menu">
          <div class="title-lockup" aria-label="Kaki Surf">
            <span class="pixel-sun" aria-hidden="true"></span>
            <p>PLUSH POCKET ARCADE</p>
            <h1>KAKI <i>SURF</i></h1>
            <span class="title-wave" aria-hidden="true"></span>
          </div>
          <p class="mission-copy">Carve the living face. Tempt the curl. Point the board home before gravity notices.</p>
          <div class="board-grid" aria-label="Choose a board"></div>
          <div class="start-row">
            <button class="primary-button" type="button" data-action="start"><span>DROP IN</span><small>SPACE / GAMEPAD A</small></button>
            <button class="secondary-button" type="button" data-action="settings">ACCESS + AUDIO</button>
          </div>
          <dl class="menu-stats">
            <div><dt>BEST</dt><dd data-stat="best">0</dd></div>
            <div><dt>BOARD</dt><dd data-stat="board">FOAM PUFF</dd></div>
            <div><dt>RIDES</dt><dd data-stat="runs">0</dd></div>
          </dl>
          <p class="controls-line"><b>CARVE</b> ARROWS / STICK <b>PUMP</b> SPACE / A <b>STYLE</b> X / GAMEPAD X <b>RESTART</b> R / B</p>
        </div>

        <div class="game-layer compact-layer" data-layer="pause" hidden>
          <div class="pixel-card pause-card">
            <p class="eyebrow">THE WAVE WAITS</p>
            <h2>PAUSED</h2>
            <button class="primary-button" type="button" data-action="resume">BACK TO THE FACE</button>
            <button class="secondary-button" type="button" data-action="settings">SETTINGS</button>
            <button class="text-button" type="button" data-action="menu">SURF SHACK</button>
          </div>
        </div>

        <div class="game-layer compact-layer" data-layer="results" hidden>
          <div class="pixel-card results-card">
            <div class="rank-badge" data-result="rank">A</div>
            <p class="eyebrow" data-result="title">KAKI FLOW</p>
            <div class="final-score" data-result="score">0</div>
            <p class="best-label" data-result="best">PERSONAL BEST</p>
            <div class="flow-row"><span>FLOW</span><strong data-result="flow">0%</strong></div>
            <div class="score-breakdown" data-result="breakdown"></div>
            <button class="primary-button" type="button" data-action="retry"><span>PRESS YOUR LUCK</span><small>R / GAMEPAD B / SPACE</small></button>
            <button class="text-button" type="button" data-action="menu">CHANGE BOARD</button>
          </div>
        </div>

        <div class="touch-controls" aria-label="Touch controls" hidden>
          <div class="touch-dpad">
            <button type="button" data-control="up" aria-label="Carve toward the lip">▲</button>
            <button type="button" data-control="left" aria-label="Steer left">◀</button>
            <button type="button" data-control="down" aria-label="Carve toward the trough">▼</button>
            <button type="button" data-control="right" aria-label="Steer right">▶</button>
          </div>
          <div class="touch-actions">
            <button type="button" data-control="style" aria-label="Style grab">STYLE</button>
            <button type="button" data-control="edge" aria-label="Pump and commit">PUMP</button>
          </div>
        </div>

        <aside class="debug-panel" hidden>
          <header><strong>SURF LAB</strong><button type="button" data-action="debug-reset">RESET</button></header>
          <p>LIVE TUNING · BACKTICK TO CLOSE</p>
          <div class="debug-fields"></div>
        </aside>
      </div>

      <dialog class="settings-dialog">
        <form method="dialog" class="settings-card">
          <header><div><p class="eyebrow">MAKE IT YOUR WAVE</p><h2>SETTINGS</h2></div><button type="button" data-action="close-settings" aria-label="Close settings">×</button></header>
          <section aria-labelledby="audio-heading">
            <h3 id="audio-heading">AUDIO</h3>
            <label><span>MUSIC <output data-setting-output="music">58%</output></span><input type="range" min="0" max="1" step="0.01" data-setting="music" aria-label="Music volume"></label>
            <label><span>EFFECTS <output data-setting-output="effects">78%</output></span><input type="range" min="0" max="1" step="0.01" data-setting="effects" aria-label="Effects volume"></label>
            <label><span>WAVE <output data-setting-output="waveAudio">52%</output></span><input type="range" min="0" max="1" step="0.01" data-setting="waveAudio" aria-label="Wave volume"></label>
          </section>
          <section aria-labelledby="access-heading">
            <h3 id="access-heading">ACCESS</h3>
            <label class="toggle"><input type="checkbox" data-setting="reducedMotion"><span>REDUCED MOTION</span></label>
            <label><span>SCREEN SHAKE <output data-setting-output="screenShake">70%</output></span><input type="range" min="0" max="1" step="0.05" data-setting="screenShake" aria-label="Screen shake intensity"></label>
            <label class="toggle"><input type="checkbox" data-setting="reducedFlash"><span>FLASH REDUCTION</span></label>
            <label class="toggle"><input type="checkbox" data-setting="highContrast"><span>HIGH-CONTRAST SURF MARKERS</span></label>
            <label class="toggle"><input type="checkbox" data-setting="touchControls"><span>TOUCH CONTROLS</span></label>
          </section>
          <section aria-labelledby="assist-heading">
            <h3 id="assist-heading">ASSISTS <small>−18% SCORE, NO SHAME</small></h3>
            <label class="toggle"><input type="checkbox" data-setting="steeringAssist"><span>STEERING ASSIST</span></label>
            <label class="toggle"><input type="checkbox" data-setting="landingAssist"><span>LANDING ASSIST</span></label>
          </section>
          <p class="settings-note">Assists widen control and landing margins. They are labeled in play and reduce scoring without changing unlocks.</p>
        </form>
      </dialog>
      <p class="sr-only" aria-live="polite"></p>
    </section>
  `;
}

const EMPTY_META = Object.freeze({ restart: false, pause: false, debug: false });
const EMPTY_CONTROLS = Object.freeze({ x: 0, y: 0, edge: false, edgePressed: false, edgeReleased: false, style: false, stylePressed: false });
