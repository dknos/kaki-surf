import { BOARDS, CONDITIONS, FIXED_STEP, LOGICAL_HEIGHT, LOGICAL_WIDTH, MAX_FRAME_DELTA, TUNING } from "./config.js";
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

export function shouldShowTouchControls(state, enabled, settingsOpen = false) {
  return Boolean(enabled && state === "running" && !settingsOpen);
}

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
    qaScene = null,
    visualAssets = null,
  }) {
    this.host = host;
    this.storage = storage;
    this.profile = profile;
    this.onExit = onExit;
    this.onRunComplete = onRunComplete;
    this.initialQaScene = qaScene;
    this.qaFreeze = false;
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
    this.simulation = new SurfSimulation({ tuning: TUNING, controlMode: this.settings.controlMode });
    this.renderer = new KakiRenderer(this.elements.canvas, this.settings, visualAssets);
    this.ownsInput = !externalInput;
    this.input = externalInput ?? new InputManager({
      touchRoot: this.elements.touchControls,
      controlMode: this.settings.controlMode,
    });
    this.input.setControlMode?.(this.settings.controlMode);
    this.audio = externalAudio ?? new SurfAudio(this.settings);
    this.selectedBoard = BOARDS[this.save.selectedBoard] ? this.save.selectedBoard : "foamPuff";
    this.selectedCondition = CONDITIONS[this.save.selectedCondition] ? this.save.selectedCondition : "goldenCoast";
    this.host.dataset.condition = this.selectedCondition;
    this.bindUI();
    this.buildBoardCards();
    this.buildConditionCards();
    this.buildDebugPanel();
    this.syncSettingsUI();
    this.updateMenuStats();
    this.showLayer("menu");
  }

  start({ immediate = false, board = null, condition = null } = {}) {
    if (this.destroyed) throw new Error("Cannot start a destroyed Kaki Surf instance.");
    if (board && BOARDS[board]) this.selectBoard(board);
    if (condition && CONDITIONS[condition]) this.selectCondition(condition);
    if (!this.started) {
      this.started = true;
      this.lastFrame = performance.now();
      this.frameHandle = requestAnimationFrame((now) => this.frame(now));
    }
    if (this.initialQaScene) {
      const scene = this.initialQaScene;
      this.initialQaScene = null;
      this.setQaScene(scene);
    }
    if (immediate) this.startRun();
    return this;
  }

  async startRun() {
    if (this.destroyed) return;
    this.save.selectedBoard = this.selectedBoard;
    this.save.selectedCondition = this.selectedCondition;
    writeSave(this.save, this.storage);
    this.input.clear?.();
    this.simulation.reset({
      board: this.selectedBoard,
      condition: this.selectedCondition,
      assists: {
        steering: this.settings.steeringAssist,
        landing: this.settings.landingAssist,
      },
      controlMode: this.settings.controlMode,
      tutorialEnabled: !this.save.tutorialSeen,
    });
    this.simulation.begin();
    this.accumulator = 0;
    this.state = "running";
    this.pausedFrom = null;
    this.showLayer(null);
    this.elements.canvas.focus({ preventScroll: true });
    try {
      await this.audio.unlock?.();
    } catch (error) {
      console.warn("Kaki Surf audio could not be unlocked; play continues silently.", error);
    }
    this.announce(`Ride started on ${BOARDS[this.selectedBoard].name} at ${CONDITIONS[this.selectedCondition].name}.`);
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
    this.input.clear?.();
    this.startRun();
  }

  backToMenu() {
    this.input.clear?.();
    this.state = "menu";
    this.simulation.reset({
      board: this.selectedBoard,
      condition: this.selectedCondition,
      controlMode: this.settings.controlMode,
    });
    this.accumulator = 0;
    this.updateMenuStats();
    this.showLayer("menu");
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
      condition: this.selectedCondition,
      bestScore: this.save.bestScore,
      tutorial: this.simulation.tutorial?.snapshot?.() ?? null,
      assists: { ...this.simulation.assists },
      controlMode: this.simulation.controlMode,
      travelDirection: this.simulation.player.travelDirection,
      world: this.simulation.world.snapshot(),
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
    if (meta.retry && this.state === "results") this.restart();

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
      this.syncTouchActionState();
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
    if (this.qaFreeze) return;
    this.frameHandle = requestAnimationFrame((next) => this.frame(next));
  }

  processEvents() {
    this.simulation.consumeEvents((event) => {
      this.renderer.onEvent(event, this.simulation);
      this.audio.onEvent?.(event, this.simulation);
      if (event.type === "callout") this.announce(event.payload.subtext ? `${event.payload.text}. ${event.payload.subtext}` : event.payload.text);
      if (event.type === "tutorialStep") {
        this.announce(`Surf School ${event.payload.index} of ${event.payload.total}. ${event.payload.text}. ${event.payload.hint}`);
      }
      if (event.type === "tutorialComplete") this.handleTutorialComplete();
      if (event.type === "complete") this.handleComplete(event.payload);
      if (event.type === "pump") this.rumble(28, 0.16, 0.08);
      if (event.type === "powerLineEnter") this.rumble(42, 0.12, 0.22);
      if (event.type === "land") this.rumble(event.payload.quality === "perfect" ? 78 : 46, 0.25, event.payload.quality === "perfect" ? 0.55 : 0.3);
      if (event.type === "wipeout") this.rumble(110, 0.58, 0.72);
      if (event.type === "directionChange") this.rumble(38, 0.14, 0.22);
      if (event.type === "dolphinMounted" || event.type === "whaleMounted") this.rumble(72, 0.22, 0.48);
      if (event.type === "powerupCollected") this.rumble(45, 0.18, 0.28);
      if (event.type === "sharkCollision") this.rumble(92, 0.42, 0.58);
      if (event.type === "wildlifePhase" && ["telegraph", "distant", "blow"].includes(event.payload.phase)) {
        const cue = event.payload.kind === "shark" ? "Shark fin ahead." : event.payload.kind === "whale" ? "Whale event ahead." : "Dolphin opportunity ahead.";
        this.announce(cue);
      }
    });
  }

  rumble(duration, weakMagnitude, strongMagnitude) {
    if (this.settings.reducedMotion) return;
    navigator.vibrate?.(Math.min(45, duration));
    const pad = Array.from(navigator.getGamepads?.() ?? []).find(Boolean);
    pad?.vibrationActuator?.playEffect?.("dual-rumble", {
      duration,
      weakMagnitude,
      strongMagnitude,
    }).catch?.(() => {});
  }

  handleComplete(result) {
    const enriched = { ...result, board: this.selectedBoard, condition: this.selectedCondition };
    const isBest = recordRun(this.save, enriched);
    writeSave(this.save, this.storage);
    if (isBest) {
      const event = { type: "personalBest", payload: { score: result.score }, time: this.simulation.elapsed };
      this.renderer.onEvent(event, this.simulation);
      this.audio.onEvent?.(event, this.simulation);
    }
    this.state = "results";
    this.renderResults(enriched, isBest);
    this.showLayer("results");
    this.elements.retryButton.focus({ preventScroll: true });
    this.onRunComplete?.(enriched);
    this.announce(`${result.rank.title}. Score ${Math.round(result.score)}. Flow ${result.flow} percent.`);
  }

  handleTutorialComplete() {
    if (this.save.tutorialSeen) return;
    this.save.tutorialSeen = true;
    writeSave(this.save, this.storage);
    this.syncTutorialReplayUI();
    this.announce("Surf School complete. The full wave is yours.");
  }

  replayTutorial() {
    this.save.tutorialSeen = false;
    writeSave(this.save, this.storage);
    this.syncTutorialReplayUI();
    this.announce("Surf School is ready for the next run.");
  }

  renderResults(result, isBest) {
    const breakdown = result.breakdown;
    const highlights = result.highlights ?? {};
    this.elements.resultRank.textContent = result.rank.grade;
    this.elements.resultTitle.textContent = result.rank.title;
    this.elements.resultScore.textContent = Math.round(result.score).toLocaleString();
    this.elements.resultBest.textContent = isBest ? "NEW PERSONAL BEST" : `BEST ${this.save.bestScore.toLocaleString()}`;
    this.elements.resultFlow.textContent = `${result.flow}%`;
    const rows = [
      ["Ride", breakdown.ride],
      ["Speed", breakdown.speed],
      ["Pocket", breakdown.pocket],
      ["Carves", breakdown.carves],
      ["Moves", breakdown.maneuvers ?? 0],
      ["Air", breakdown.air],
      ["Style", breakdown.style],
      ["Landings", breakdown.landings],
    ].map(([label, value]) => [label, Math.round(value).toLocaleString()]);
    if (highlights.biggestAir > 0) rows.push(["Biggest Air", `${Math.round(highlights.biggestAir)} PX`]);
    if (highlights.bestTrick) rows.push(["Best Trick", String(highlights.bestTrick).toUpperCase()]);
    if (highlights.perfectLandings > 0) rows.push(["Perfect", String(highlights.perfectLandings)]);
    if (highlights.switchBonuses > 0) rows.push(["Switch", String(highlights.switchBonuses)]);
    if (highlights.animalBonuses > 0) rows.push(["Animal", String(highlights.animalBonuses)]);
    if (highlights.nearMisses > 0) rows.push(["Near Miss", String(highlights.nearMisses)]);
    this.elements.breakdown.innerHTML = rows
      .map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
    this.elements.resultCondition.textContent = CONDITIONS[this.selectedCondition].name;
  }

  bindUI() {
    const signal = this.abort.signal;
    this.elements.startButton.addEventListener("click", () => this.startRun(), { signal });
    this.elements.retryButton.addEventListener("click", () => this.restart(), { signal });
    this.elements.resumeButton.addEventListener("click", () => this.resume(), { signal });
    this.elements.menuButtons.forEach((button) => button.addEventListener("click", () => this.backToMenu(), { signal }));
    this.elements.settingsButtons.forEach((button) => button.addEventListener("click", () => this.openSettings(), { signal }));
    this.elements.closeSettings.addEventListener("click", () => this.closeSettings(), { signal });
    this.elements.replayTutorial.addEventListener("click", () => this.replayTutorial(), { signal });
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
    const stats = ["speed", "carve", "pump", "pop", "spin", "landing"];
    this.elements.boardGrid.innerHTML = Object.values(BOARDS).map((board) => `
      <button class="board-card${board.id === this.selectedBoard ? " is-selected" : ""}" type="button" data-board="${board.id}" aria-pressed="${board.id === this.selectedBoard}">
        <span class="board-art board-art--${board.shape}" style="--board:${board.color};--board-accent:${board.accent}" aria-hidden="true"><i></i><em></em></span>
        <span class="board-copy"><strong>${board.name}</strong><small>${board.tagline}</small></span>
        <span class="board-specialty"><b>${board.recommendation}</b>${board.specialty}</span>
        <span class="board-stats" aria-label="Board ratings">
          ${stats.map((stat) => `<span title="${stat}"><i>${stat.slice(0, 3).toUpperCase()}</i><b>${Array.from({ length: 5 }, (_, index) => `<em class="${index < board.stats[stat] ? "on" : ""}"></em>`).join("")}</b></span>`).join("")}
        </span>
      </button>
    `).join("");
    this.elements.boardGrid.querySelectorAll("[data-board]").forEach((button) => {
      button.addEventListener("click", () => this.selectBoard(button.dataset.board), { signal: this.abort.signal });
    });
  }

  buildConditionCards() {
    this.elements.conditionGrid.innerHTML = Object.values(CONDITIONS).map((condition) => `
      <button class="condition-card condition-card--${condition.id}${condition.id === this.selectedCondition ? " is-selected" : ""}" type="button" data-condition="${condition.id}" aria-pressed="${condition.id === this.selectedCondition}">
        <span aria-hidden="true"><i></i><b></b></span>
        <strong>${condition.shortName}</strong>
        <small>${condition.tagline}</small>
      </button>
    `).join("");
    this.elements.conditionGrid.querySelectorAll("[data-condition]").forEach((button) => {
      button.addEventListener("click", () => this.selectCondition(button.dataset.condition), { signal: this.abort.signal });
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

  selectCondition(conditionId) {
    if (!CONDITIONS[conditionId]) return;
    this.selectedCondition = conditionId;
    this.host.dataset.condition = conditionId;
    this.simulation.condition = CONDITIONS[conditionId];
    this.save.selectedCondition = conditionId;
    this.elements.conditionGrid.querySelectorAll("[data-condition]").forEach((button) => {
      const selected = button.dataset.condition === conditionId;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    this.elements.selectedConditionName.textContent = CONDITIONS[conditionId].shortName;
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
    this.settings[key] = input.type === "checkbox"
      ? input.checked
      : input.tagName === "SELECT"
        ? input.value
        : Number(input.value);
    if (key === "controlMode") {
      this.input.setControlMode?.(this.settings.controlMode);
      this.simulation.controlMode = this.settings.controlMode;
      this.host.dataset.controlMode = this.settings.controlMode;
    }
    const output = this.host.querySelector(`[data-setting-output="${key}"]`);
    if (output) output.textContent = `${Math.round(this.settings[key] * 100)}%`;
    this.renderer.applySettings(this.settings);
    this.audio.applySettings?.(this.settings);
    this.syncTouchControlsVisibility();
    this.save.settings = this.settings;
    writeSave(this.save, this.storage);
  }

  syncTouchActionState() {
    const simple = this.settings.controlMode !== "advanced";
    this.host.dataset.controlMode = simple ? "simple" : "advanced";
    if (this.elements.touchSpecial) {
      this.elements.touchSpecial.hidden = simple && !this.simulation.player.animalSpecialReady;
    }
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
    this.selectCondition(this.selectedCondition);
    this.syncTouchActionState();
    this.syncTutorialReplayUI();
  }

  syncTutorialReplayUI() {
    const armed = !this.save.tutorialSeen;
    this.elements.replayTutorial.textContent = armed ? "SURF SCHOOL READY" : "REPLAY SURF SCHOOL";
    this.elements.replayTutorial.setAttribute("aria-pressed", String(armed));
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
    this.elements.selectedConditionName.textContent = CONDITIONS[this.selectedCondition].shortName;
  }

  showLayer(name) {
    this.elements.menuLayer.hidden = name !== "menu";
    this.elements.pauseLayer.hidden = name !== "pause";
    this.elements.resultsLayer.hidden = name !== "results";
    this.elements.topControls.hidden = name === "menu";
    this.syncTouchControlsVisibility();
  }

  syncTouchControlsVisibility() {
    const controls = this.elements.touchControls;
    const visible = shouldShowTouchControls(
      this.state,
      this.settings.touchControls,
      this.elements.settingsDialog.open,
    );
    if (!visible && !controls.hidden) this.input.clear?.();
    controls.hidden = !visible;
    controls.inert = !visible;
    controls.setAttribute("aria-hidden", String(!visible));
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

  setQaScene(scene) {
    this.qaFreeze = true;
    this.input.clear?.();
    this.elements.touchControls.classList.remove("qa-visible");
    if ("enabled" in this.input) this.input.enabled = false;
    this.renderer.applySettings({
      ...this.settings,
      highContrast: false,
      reducedMotion: false,
      reducedFlash: true,
      waveReadAssist: "full",
    });

    if (["menu", "settingsSimple", "settingsAdvanced"].includes(scene)) {
      this.selectedBoard = "foamPuff";
      this.selectedCondition = "goldenCoast";
      this.host.dataset.condition = this.selectedCondition;
      this.buildBoardCards();
      this.buildConditionCards();
      this.updateMenuStats();
      this.simulation.condition = CONDITIONS.goldenCoast;
      this.state = "menu";
      this.showLayer("menu");
      if (scene !== "menu") {
        this.settings.controlMode = scene === "settingsAdvanced" ? "advanced" : "simple";
        this.input.setControlMode?.(this.settings.controlMode);
        this.simulation.controlMode = this.settings.controlMode;
        this.host.dataset.controlMode = this.settings.controlMode;
        this.syncSettingsUI();
        this.openSettings();
      }
      return;
    }

    if (scene === "results") {
      this.selectedCondition = "goldenCoast";
      this.host.dataset.condition = this.selectedCondition;
      this.state = "results";
      this.renderResults({
        score: 18420,
        flow: 94,
        rank: { grade: "S", title: "LEGENDARY PLUSH" },
        breakdown: {
          ride: 1280,
          speed: 2460,
          pocket: 3180,
          carves: 1640,
          maneuvers: 2140,
          air: 4890,
          style: 1720,
          landings: 1110,
        },
        highlights: {
          biggestAir: 94,
          bestTrick: "720 KAKI TWIST",
          perfectLandings: 3,
          switchBonuses: 2,
          animalBonuses: 1,
          nearMisses: 2,
        },
      }, true);
      this.showLayer("results");
      this.elements.topControls.hidden = true;
      return;
    }

    const conditionId = Object.keys(CONDITIONS).find((id) => scene === id || scene.endsWith(`-${id}`))
      ?? "goldenCoast";
    const boardId = Object.keys(BOARDS).find((id) => scene === id || scene.startsWith(`${id}-`))
      ?? (scene === "maxSpeed" || scene === "tailGrab" || scene === "hugeAir" ? "moonLog" : scene === "snap" || scene === "combo360" ? "mangoFish" : "foamPuff");
    this.selectedCondition = conditionId;
    this.host.dataset.condition = conditionId;
    this.selectedBoard = boardId;
    this.simulation.reset({
      board: boardId,
      condition: conditionId,
      assists: { steering: false, landing: false },
      controlMode: this.settings.controlMode,
      worldQa: qaWorldOverride(scene),
    });
    this.simulation.condition = CONDITIONS[conditionId];
    this.simulation.begin();
    this.simulation.elapsed = 24;
    this.simulation.timeRemaining = 54;
    this.simulation.wave.time = 18;
    this.simulation.wave.travel = 1320;
    this.simulation.wave.pressure = 0.72;
    this.simulation.wave.curlX = 72;
    this.simulation.score.total = scene === "neutral" ? 1240 : 6840;
    this.simulation.score.combo = scene.includes("combo") ? 3.8 : 2.4;
    this.simulation.score.comboHeat = scene.includes("combo") ? 0.88 : 0.44;
    this.state = "qa";
    this.showLayer(null);
    this.elements.topControls.hidden = true;
    this.elements.touchControls.hidden = true;

    const player = this.simulation.player;
    const targetFace = this.simulation.wave.powerFaceAt?.(232) ?? 0.4;
    Object.assign(player, {
      state: "riding",
      stateTime: 0.42,
      x: 232,
      previousX: 232,
      face: targetFace,
      previousFace: targetFace,
      faceVelocity: -0.12,
      speed: 92,
      compression: 0,
      charge: 0,
      boardAngle: this.simulation.wave.slopeAt(232, targetFace),
      bodyAngle: this.simulation.wave.slopeAt(232, targetFace),
      trickPose: "neutral",
      boardRelativeAngle: 0,
      provisionalTrickName: "",
      provisionalScore: 0,
      maneuver: null,
      speedTier: "FAST",
      flowTier: "",
      flow: 0.44,
      travelDirection: 1,
      travelVelocity: 18,
      worldTravel: this.simulation.wave.worldTravel,
      switchStance: false,
      airX: 232,
      previousAirX: 232,
      airY: 74,
      previousAirY: 74,
      airVX: 8,
      airVY: -12,
      rotationAccum: 0,
      maxAirHeight: 28,
      landingFace: 0.2,
      landingPreview: null,
    });

    const makeAirborne = (pose, name, rotation, boardRelative = 0) => {
      Object.assign(player, {
        state: "airborne",
        stateTime: 0.68,
        airX: 230,
        previousAirX: 230,
        airY: 49,
        previousAirY: 49,
        airVY: 6,
        bodyAngle: rotation,
        boardAngle: rotation + boardRelative,
        rotationAccum: rotation,
        boardRelativeAngle: boardRelative,
        trickPose: pose,
        provisionalTrickName: name,
        provisionalScore: 940 + Math.round(Math.abs(rotation) * 180),
        landingPreview: {
          boardAngle: rotation + boardRelative,
          targetAngle: this.simulation.wave.slopeAt(230, 0.2),
          error: 0.28,
          improving: true,
          bands: { perfect: 0.12, clean: 0.46, recovery: 0.78 },
        },
      });
    };

    switch (scene) {
      case "powerLine":
        player.waveMomentum = 0.82;
        player.speed = Math.max(106, Math.round(this.simulation.currentRideSpeedCap?.() * 0.84 || 106));
        player.speedTier = "FLYING";
        player.powerLine = true;
        this.renderer.onEvent({ type: "powerLineEnter", payload: { potential: 1 } }, this.simulation);
        break;
      case "maxSpeed":
        player.waveMomentum = 1;
        player.speed = Math.round((this.simulation.currentRideSpeedCap?.() ?? this.simulation.tuning.maxSpeed * this.simulation.board.maxSpeed) * 0.985);
        player.speedTier = "BLASTING";
        player.powerLine = true;
        this.renderer.onEvent({ type: "fullPower", payload: { momentum: 1 } }, this.simulation);
        break;
      case "pumpCompression":
        player.compression = 1;
        player.charge = 0.86;
        player.trickPose = "pumpCompress";
        break;
      case "pumpRelease":
        player.speed = 116;
        player.trickPose = "pumpRelease";
        this.renderer.onEvent({ type: "pump", payload: { strength: 1, efficiency: 1 } }, this.simulation);
        break;
      case "snap":
      case "cutback":
      case "floater":
      case "tubeTuck": {
        const maneuverId = scene === "tubeTuck" ? "tubeTuck" : scene;
        player.maneuver = { id: maneuverId, progress: 0.58 };
        player.trickPose = maneuverId;
        player.faceVelocity = scene === "snap" ? -0.72 : 0.54;
        if (scene === "tubeTuck") player.x = 116;
        this.renderer.onEvent({ type: "maneuver", payload: { id: maneuverId, strength: 1 } }, this.simulation);
        break;
      }
      case "launch":
        makeAirborne("takeoff", "FLOATY POP", 0.12);
        player.airY = 68;
        player.previousAirY = 68;
        player.airVY = -74;
        this.renderer.onEvent({ type: "launch", payload: { strength: 1.2 } }, this.simulation);
        break;
      case "smallAir":
        makeAirborne("rise", "SMALL POP", 0.18);
        player.airY = 70;
        player.previousAirY = 70;
        player.airVY = -24;
        player.maxAirHeight = 18;
        break;
      case "hugeAir":
        makeAirborne("apex", "720 MOON LAUNCH", Math.PI * 4);
        player.airY = 29;
        player.previousAirY = 29;
        player.airVY = 2;
        player.maxAirHeight = 96;
        player.provisionalScore = 2840;
        break;
      case "clockwiseSpin":
        makeAirborne("apex", "360 AIR SPIN", Math.PI * 2);
        player.angularVelocity = 6.4;
        break;
      case "counterSpin":
        makeAirborne("apex", "CCW 360 AIR SPIN", -Math.PI * 2);
        player.angularVelocity = -6.4;
        player.travelDirection = -1;
        break;
      case "frontRail":
        makeAirborne("frontRailGrab", "FRONT RAIL GRAB", Math.PI * 0.42);
        break;
      case "tailGrab":
        makeAirborne("tailGrab", "360 TAIL GRAB", Math.PI * 2);
        break;
      case "varial":
        makeAirborne("boardVarial", "BOARD VARIAL", Math.PI * 0.2, Math.PI * 0.72);
        break;
      case "kakiTwist":
        makeAirborne("kakiTwist", "360 KAKI TWIST", Math.PI * 2, -Math.PI * 0.42);
        this.renderer.onEvent({ type: "trickStart", payload: { id: "kakiTwist" } }, this.simulation);
        break;
      case "combo360":
        makeAirborne("tailGrab", "360 TAIL GRAB + VARIAL", Math.PI * 2, Math.PI * 0.28);
        break;
      case "combo540":
        makeAirborne("boardVarial", "PERFECT 540 VARIAL", Math.PI * 3, Math.PI * 0.58);
        break;
      case "perfectLanding":
        player.state = "landing";
        player.stateTime = 0.06;
        player.speed = 122;
        player.compression = 1;
        player.trickPose = "perfectLanding";
        this.renderer.onEvent({ type: "land", payload: { quality: "perfect", error: 0.04 } }, this.simulation);
        break;
      case "switchLanding":
        player.state = "landing";
        player.stateTime = 0.06;
        player.speed = 118;
        player.compression = 0.92;
        player.travelDirection = -1;
        player.travelVelocity = -28;
        player.switchStance = true;
        player.trickPose = "perfectLanding";
        this.renderer.onEvent({ type: "land", payload: { quality: "perfect", error: 0.05, switch: true, landingDirection: -1 } }, this.simulation);
        break;
      case "wobble":
        player.state = "wobble";
        player.stateTime = 0.16;
        player.wobble = 0.9;
        player.trickPose = "wobble";
        this.renderer.onEvent({ type: "land", payload: { quality: "wobble", error: 0.72 } }, this.simulation);
        break;
      case "wipeout":
        player.state = "wipeout";
        player.stateTime = 0.48;
        player.airX = 216;
        player.previousAirX = 216;
        player.airY = 106;
        player.previousAirY = 106;
        player.boardAngle = -0.9;
        player.bodyAngle = 1.2;
        this.renderer.onEvent({ type: "wipeout", payload: { cause: "landing" } }, this.simulation);
        break;
      case "pause":
        this.state = "paused";
        this.pausedFrom = "qa";
        this.showLayer("pause");
        break;
      case "touch":
        this.elements.touchControls.hidden = false;
        this.elements.touchControls.classList.add("qa-visible");
        break;
      case "touchAdvanced":
        this.settings.controlMode = "advanced";
        this.input.setControlMode?.("advanced");
        this.simulation.controlMode = "advanced";
        this.host.dataset.controlMode = "advanced";
        this.elements.touchControls.hidden = false;
        this.elements.touchControls.classList.add("qa-visible");
        this.syncTouchActionState();
        break;
      case "simpleKeyboard":
        this.simulation.elapsed = 2;
        this.simulation.tutorialEnabled = true;
        this.simulation.qaControlHint = "ARROWS + SPACE + F";
        break;
      case "simpleGamepad":
        this.simulation.elapsed = 2;
        this.simulation.tutorialEnabled = true;
        this.simulation.qaControlHint = "STICK + A + X";
        break;
      case "leftTravel":
        player.travelDirection = -1;
        player.travelVelocity = -24;
        player.switchStance = true;
        player.speed = 104;
        break;
      case "rightTravel":
        player.travelDirection = 1;
        player.travelVelocity = 24;
        player.speed = 104;
        break;
      case "reversal":
        player.travelDirection = -1;
        player.travelVelocity = -31;
        player.redirectVelocity = -18;
        player.turnForce = 0.92;
        player.switchStance = true;
        player.trickPose = "cutback";
        this.renderer.onEvent({ type: "directionChange", payload: { from: 1, to: -1, switch: true, turnForce: 0.92 } }, this.simulation);
        break;
      case "downhill":
        player.face = 0.58;
        player.faceVelocity = 0.72;
        player.slopeDrive = 0.88;
        player.speed = 126;
        player.speedTier = "BLASTING";
        player.trickPose = "downFaceCarve";
        break;
      case "curlEarly":
        this.simulation.wave.curlX = 38;
        this.simulation.wave.pressure = 0.3;
        player.x = 242;
        break;
      case "curlFolding":
        this.simulation.wave.curlX = 74;
        this.simulation.wave.pressure = 0.68;
        player.x = 236;
        break;
      case "curlImpact":
        this.simulation.wave.curlX = 112;
        this.simulation.wave.pressure = 0.94;
        player.x = 252;
        this.renderer.onEvent({ type: "lip", payload: { strength: 1.1 } }, this.simulation);
        break;
      case "curlDanger":
        this.simulation.wave.curlX = 174;
        this.simulation.wave.pressure = 1;
        player.x = 210;
        player.speed = 112;
        this.renderer.onEvent({ type: "callout", payload: { text: "CURL CLOSE", subtext: "DROP OR REVERSE", tone: "risk" } }, this.simulation);
        break;
      case "dolphinRide":
      case "dolphinGates":
        player.animalMount = "dolphin";
        player.animalSpecialReady = true;
        player.speed = 116;
        this.renderer.onEvent({ type: "dolphinMounted", payload: { kind: "dolphin" } }, this.simulation);
        break;
      case "whaleRide":
        player.animalMount = "whale";
        player.animalSpecialReady = true;
        player.speed = 124;
        this.renderer.onEvent({ type: "whaleMounted", payload: { kind: "whale" } }, this.simulation);
        break;
      case "sharkNearMiss":
        makeAirborne("tailGrab", "SHARK THREAD", Math.PI);
        player.airY = 78;
        break;
      case "sharkCollision":
        player.state = "wipeout";
        player.stateTime = 0.32;
        player.airX = player.x;
        player.airY = 112;
        player.previousAirX = player.airX;
        player.previousAirY = player.airY;
        player.wipeoutCause = "shark";
        this.renderer.onEvent({ type: "wipeout", payload: { cause: "shark" } }, this.simulation);
        break;
      case "dolphinDismount":
        makeAirborne("takeoff", "DOLPHIN CORKSCREW", Math.PI * 2);
        player.airY = 45;
        player.previousAirY = 45;
        player.airVY = -32;
        player.maxAirHeight = 72;
        break;
      case "mangoRush":
      case "moonPop":
      case "starFoam":
        this.simulation.world.activateBonus(scene);
        break;
      case "mangoExpired":
        this.simulation.world.activateBonus("mangoRush");
        this.simulation.world.bonuses.mangoRush.remaining = 0.08;
        this.renderer.onEvent({ type: "callout", payload: { text: "MANGO RUSH ENDING", subtext: "KEEP THE LINE", tone: "hint" } }, this.simulation);
        break;
      case "moonConsumed":
        this.simulation.world.activateBonus("moonPop");
        this.simulation.world.bonuses.moonPop.charges = 0.12;
        this.renderer.onEvent({ type: "callout", payload: { text: "MOON POP", subtext: "NEXT LIP CONSUMES", tone: "perfect" } }, this.simulation);
        break;
      case "starSave":
        this.simulation.world.activateBonus("starFoam");
        this.renderer.onEvent({ type: "callout", payload: { text: "STAR FOAM SAVE", subtext: "ONE HIT PROTECTED", tone: "perfect" } }, this.simulation);
        break;
      case "ambientReverse":
        player.travelDirection = -1;
        player.travelVelocity = -28;
        player.switchStance = true;
        break;
      case "featherThread":
        this.renderer.onEvent({ type: "featherThread", payload: { value: 1 } }, this.simulation);
        break;
      case "speedboatRace":
      case "jetSkiRace":
        this.renderer.onEvent({ type: "callout", payload: { text: "RACE THE WAKE", subtext: "LOSING COSTS NOTHING", tone: "risk" } }, this.simulation);
        break;
      case "dolphinReduced":
        this.renderer.applySettings({ ...this.settings, reducedMotion: true, reducedFlash: true });
        player.animalMount = "dolphin";
        player.animalSpecialReady = true;
        break;
      case "sharkHighContrast":
        this.renderer.applySettings({ ...this.settings, highContrast: true, waveReadAssist: "full" });
        break;
      case "whaleReduced":
        this.renderer.applySettings({ ...this.settings, reducedMotion: true, reducedFlash: true });
        break;
      case "highContrast":
        this.renderer.applySettings({ ...this.settings, highContrast: true, waveReadAssist: "full" });
        player.powerLine = true;
        break;
      case "reducedMotion":
        this.renderer.applySettings({ ...this.settings, reducedMotion: true, reducedFlash: true });
        break;
      case "reducedFlash":
        this.renderer.applySettings({ ...this.settings, reducedFlash: true });
        this.renderer.onEvent({ type: "launch", payload: { strength: 1.2 } }, this.simulation);
        break;
      default:
        break;
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frameHandle);
    this.abort.abort();
    this.input.clear?.();
    if (this.ownsInput) this.input.destroy?.();
    this.audio.destroy?.();
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
    conditionGrid: host.querySelector(".condition-grid"),
    bestScore: host.querySelector("[data-stat=best]"),
    runCount: host.querySelector("[data-stat=runs]"),
    selectedBoardName: host.querySelector("[data-stat=board]"),
    selectedConditionName: host.querySelector("[data-stat=condition]"),
    resultRank: host.querySelector("[data-result=rank]"),
    resultTitle: host.querySelector("[data-result=title]"),
    resultScore: host.querySelector("[data-result=score]"),
    resultBest: host.querySelector("[data-result=best]"),
    resultFlow: host.querySelector("[data-result=flow]"),
    resultCondition: host.querySelector("[data-result=condition]"),
    breakdown: host.querySelector("[data-result=breakdown]"),
    settingsDialog: host.querySelector(".settings-dialog"),
    closeSettings: host.querySelector("[data-action=close-settings]"),
    replayTutorial: host.querySelector("[data-action=replay-tutorial]"),
    settingsInputs: host.querySelectorAll("[data-setting]"),
    touchControls: host.querySelector(".touch-controls"),
    touchSpecial: host.querySelector('[data-control="special"]'),
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
        <canvas width="${LOGICAL_WIDTH}" height="${LOGICAL_HEIGHT}" tabindex="0" aria-label="Kitty Kaki rides a moving wave. Carve and rotate with arrows or WASD, use Space or Z for action, F or X for a context trick, and T or Shift for an available animal special."></canvas>
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
          <p class="mission-copy">Drop downhill for speed, carve back to the lip, and turn one huge air into the next.</p>
          <div class="board-grid" aria-label="Choose a board"></div>
          <div class="condition-select">
            <p><b>SESSION</b> Choose the light. The wave stays fair.</p>
            <div class="condition-grid" aria-label="Choose a surf condition"></div>
          </div>
          <div class="start-row">
            <button class="primary-button" type="button" data-action="start"><span>DROP IN</span><small>SPACE / GAMEPAD A</small></button>
            <button class="secondary-button" type="button" data-action="settings">ACCESS + AUDIO</button>
          </div>
          <dl class="menu-stats">
            <div><dt>BEST</dt><dd data-stat="best">0</dd></div>
            <div><dt>BOARD</dt><dd data-stat="board">FOAM PUFF</dd></div>
            <div><dt>BREAK</dt><dd data-stat="condition">GOLDEN</dd></div>
            <div><dt>RIDES</dt><dd data-stat="runs">0</dd></div>
          </dl>
          <p class="controls-line"><b>CARVE + SPIN</b> ARROWS / STICK <b>ACTION</b> SPACE / A <b>TRICK</b> F / X <b>SPECIAL</b> T / Y WHEN READY</p>
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
            <p class="condition-label" data-result="condition">Golden Coast</p>
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
            <button class="touch-spin touch-spin--left" type="button" data-control="spinLeft" aria-label="Optional counterclockwise spin or advanced trick one"><b>Q</b><span>SPIN</span></button>
            <button class="touch-spin touch-spin--right" type="button" data-control="spinRight" aria-label="Optional clockwise spin or advanced trick two"><b>E</b><span>SPIN</span></button>
            <button class="touch-trick" type="button" data-control="trick" aria-label="Context trick"><b>TRICK</b><span>TAP / HOLD</span></button>
            <button class="touch-special" type="button" data-control="special" aria-label="Animal special ability" hidden><b>SPECIAL</b><span>READY</span></button>
            <button class="touch-action" type="button" data-control="edge" aria-label="Action: compress, pump, and pop"><b>ACTION</b><span>HOLD / RELEASE</span></button>
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
            <label><span>CONTROLS</span><select data-setting="controlMode" aria-label="Control mode"><option value="simple">SIMPLE · ACTION + TRICK</option><option value="advanced">ADVANCED · Q E F T</option></select></label>
            <label class="toggle"><input type="checkbox" data-setting="reducedMotion"><span>REDUCED MOTION</span></label>
            <label><span>SCREEN SHAKE <output data-setting-output="screenShake">70%</output></span><input type="range" min="0" max="1" step="0.05" data-setting="screenShake" aria-label="Screen shake intensity"></label>
            <label class="toggle"><input type="checkbox" data-setting="reducedFlash"><span>FLASH REDUCTION</span></label>
            <label class="toggle"><input type="checkbox" data-setting="highContrast"><span>HIGH-CONTRAST SURF MARKERS</span></label>
            <label class="toggle"><input type="checkbox" data-setting="touchControls"><span>TOUCH CONTROLS</span></label>
            <label><span>WAVE READ</span><select data-setting="waveReadAssist" aria-label="Wave Read Assist"><option value="full">FULL</option><option value="subtle">SUBTLE</option><option value="off">OFF</option></select></label>
          </section>
          <section aria-labelledby="assist-heading">
            <h3 id="assist-heading">ASSISTS <small>−18% SCORE, NO SHAME</small></h3>
            <label class="toggle"><input type="checkbox" data-setting="steeringAssist"><span>STEERING ASSIST</span></label>
            <label class="toggle"><input type="checkbox" data-setting="landingAssist"><span>LANDING ASSIST</span></label>
          </section>
          <button class="secondary-button tutorial-replay" type="button" data-action="replay-tutorial" aria-pressed="false">REPLAY SURF SCHOOL</button>
          <p class="settings-note">Assists widen control and landing margins. They are labeled in play and reduce scoring without changing unlocks.</p>
        </form>
      </dialog>
      <p class="sr-only" aria-live="polite"></p>
    </section>
  `;
}

function qaWorldOverride(scene) {
  const wildlife = {
    dolphinApproach: { kind: "dolphin", phase: "approach", screenX: 176, y: 128, direction: 1 },
    dolphinRide: { kind: "dolphin", phase: "mounted", screenX: 232, y: 132, direction: 1 },
    dolphinDismount: { kind: "dolphin", phase: "dismount", screenX: 232, y: 118, direction: 1 },
    sharkApproach: { kind: "shark", phase: "telegraph", screenX: 190, y: 133, direction: 1 },
    sharkNearMiss: { kind: "shark", phase: "crossing", screenX: 222, y: 134, direction: 1 },
    sharkCollision: { kind: "shark", phase: "crossing", screenX: 232, y: 128, direction: 1 },
    whaleDistant: { kind: "whale", phase: "distant", screenX: 270, y: 116, direction: -1 },
    whaleBreach: { kind: "whale", phase: "breach", screenX: 270, y: 112, direction: -1 },
    whaleRamp: { kind: "whale", phase: "ramp", screenX: 244, y: 126, direction: -1 },
    whaleRide: { kind: "whale", phase: "mounted", screenX: 232, y: 137, direction: 1 },
    whaleSplash: { kind: "whale", phase: "splash", screenX: 248, y: 126, direction: 1 },
    dolphinReduced: { kind: "dolphin", phase: "mounted", screenX: 232, y: 132, direction: 1 },
    sharkHighContrast: { kind: "shark", phase: "telegraph", screenX: 190, y: 133, direction: 1 },
    whaleReduced: { kind: "whale", phase: "breach", screenX: 270, y: 112, direction: -1 },
    dolphinGates: { kind: "dolphin", phase: "mounted", screenX: 232, y: 132, direction: 1 },
    starSave: { kind: "shark", phase: "crossing", screenX: 222, y: 132, direction: 1 },
  }[scene];
  if (wildlife) return { wildlife };

  if (scene === "flockScatter") {
    return {
      traffic: [{ kind: "gullFlock", layer: "near", screenX: 214, y: 84, direction: 1, duration: 30 }],
      birdReaction: { reaction: "scatter", kind: "gullFlock", layer: "near", screenX: 214, y: 84 },
    };
  }
  if (scene === "featherThread") {
    return {
      traffic: [{ kind: "gullFlock", layer: "near", screenX: 230, y: 112, direction: 1, duration: 30 }],
      birdReaction: { reaction: "dodge", kind: "gullFlock", layer: "near", screenX: 230, y: 112 },
    };
  }
  if (scene === "pelicanCourier" || scene === "gullCourier") {
    return {
      courier: {
        birdKind: scene === "pelicanCourier" ? "pelican" : "gullFlock",
        powerupKind: scene === "pelicanCourier" ? "mangoRush" : "starFoam",
        layer: "near",
        screenX: 306,
        birdY: 58,
        dropX: 274,
        dropY: 106,
        direction: 1,
      },
    };
  }
  if (scene === "speedboatRace" || scene === "jetSkiRace") {
    return {
      race: {
        kind: scene === "speedboatRace" ? "speedboat" : "jetSki",
        phase: "racing",
        layer: "mid",
        screenX: 204,
        y: 92,
        direction: 1,
      },
    };
  }
  if (scene === "aircraftDrop") {
    return {
      aircraftDrop: {
        aircraftKind: "propPlane",
        powerupKind: "moonPop",
        phase: "approach",
        screenX: 312,
        aircraftY: 42,
        dropX: 266,
        dropY: 91,
        direction: -1,
      },
    };
  }

  const powerup = {
    mangoRush: { kind: "mangoRush", phase: "available", screenX: 258, y: 116, direction: -1 },
    moonPop: { kind: "moonPop", phase: "available", screenX: 258, y: 92, direction: -1 },
    starFoam: { kind: "starFoam", phase: "available", screenX: 258, y: 132, direction: -1 },
    powerupMiss: { kind: "moonPop", phase: "available", screenX: 342, y: 56, direction: 1 },
  }[scene];
  if (powerup) return { powerup };

  const carrierPhase = {
    carrierHaze: "haze",
    carrierArrival: "arrival",
    carrierDeck: "deckActivity",
    carrierLaunch: "launch",
    fleetAirshow: "airshow",
    airshowGates: "airshow",
  }[scene];
  if (carrierPhase) return { carrier: { phase: carrierPhase, direction: 1 } };

  const trafficKind = {
    gullFlock: "gullFlock",
    pelican: "pelican",
    ternFlock: "ternFlock",
    cormorantFlock: "cormorantFlock",
    bannerPlane: "bannerPlane",
    propPlane: "propPlane",
    helicopter: "helicopter",
    seaplane: "seaplane",
    sailboat: "sailboat",
    speedboat: "speedboat",
    fishingBoat: "fishingBoat",
    tugboat: "tugboat",
    cargoShip: "cargoShip",
    jetSki: "jetSki",
    rescueCraft: "rescueCraft",
  }[scene];
  if (trafficKind) {
    const layer = ["cargoShip", "sailboat", "fishingBoat", "cormorantFlock", "propPlane"].includes(trafficKind)
      ? "far"
      : ["gullFlock", "pelican", "bannerPlane"].includes(trafficKind)
        ? "near"
        : "mid";
    const trafficY = trafficKind === "bannerPlane"
      ? 43
      : ["propPlane", "seaplane", "helicopter"].includes(trafficKind)
        ? 42
        : ["gullFlock", "ternFlock", "cormorantFlock", "pelican"].includes(trafficKind)
          ? 50
          : layer === "far" ? 68 : 82;
    const trafficX = ["speedboat", "tugboat", "jetSki", "rescueCraft"].includes(trafficKind) ? 308 : 196;
    return {
      traffic: [{
        kind: trafficKind,
        layer,
        screenX: trafficX,
        y: trafficY,
        direction: 1,
        message: trafficKind === "bannerPlane" ? "GIANT AIR KAKI" : "",
        duration: 30,
      }],
    };
  }

  if (scene === "ambientBusy") {
    return {
      traffic: [
        { kind: "cargoShip", layer: "far", screenX: 310, y: 70, direction: -1, duration: 30 },
        { kind: "sailboat", layer: "far", screenX: 82, y: 73, direction: 1, duration: 30 },
        { kind: "gullFlock", layer: "mid", screenX: 122, y: 39, direction: 1, duration: 30 },
        { kind: "helicopter", layer: "mid", screenX: 290, y: 49, direction: -1, duration: 30 },
        { kind: "pelican", layer: "near", screenX: 328, y: 91, direction: -1, duration: 30 },
      ],
    };
  }
  if (scene === "ambientReverse") {
    return {
      traffic: [
        { kind: "cargoShip", layer: "far", screenX: 306, y: 70, direction: 1, duration: 30 },
        { kind: "gullFlock", layer: "mid", screenX: 126, y: 40, direction: -1, duration: 30 },
        { kind: "pelican", layer: "near", screenX: 306, y: 88, direction: 1, duration: 30 },
      ],
    };
  }
  if (scene === "twilightTraffic-twilightGlass") {
    return {
      traffic: [
        { kind: "fishingBoat", layer: "far", screenX: 300, y: 70, direction: -1, duration: 30 },
        { kind: "cormorantFlock", layer: "mid", screenX: 104, y: 42, direction: 1, duration: 30 },
        { kind: "seaplane", layer: "mid", screenX: 262, y: 46, direction: -1, duration: 30 },
      ],
    };
  }
  if (scene === "stormTraffic-stormbreak") {
    return {
      traffic: [
        { kind: "rescueCraft", layer: "mid", screenX: 304, y: 89, direction: -1, duration: 30 },
        { kind: "gullFlock", layer: "near", screenX: 118, y: 49, direction: 1, duration: 30 },
        { kind: "helicopter", layer: "mid", screenX: 264, y: 42, direction: -1, duration: 30 },
      ],
    };
  }
  const bannerMessage = {
    bannerDolphins: "DOLPHINS AHEAD",
    bannerShark: "SHARK WATCH",
    bannerBigAir: "BIG AIR WEATHER",
  }[scene];
  if (bannerMessage) {
    return {
      traffic: [{ kind: "bannerPlane", layer: "near", screenX: 196, y: 43, direction: 1, message: bannerMessage, duration: 30 }],
    };
  }
  if (scene === "planeDrop") {
    return {
      traffic: [{ kind: "propPlane", layer: "mid", screenX: 268, y: 44, direction: -1, duration: 30 }],
      powerup: { kind: "moonPop", phase: "available", screenX: 250, y: 88, direction: -1 },
    };
  }
  return null;
}

const EMPTY_META = Object.freeze({ restart: false, retry: false, pause: false, debug: false });
const EMPTY_CONTROLS = Object.freeze({
  x: 0,
  y: 0,
  edge: false,
  edgePressed: false,
  edgeReleased: false,
  trick1: false,
  trick1Pressed: false,
  trick1Released: false,
  trick2: false,
  trick2Pressed: false,
  trick2Released: false,
  trick3: false,
  trick3Pressed: false,
  trick3Released: false,
  trick4: false,
  trick4Pressed: false,
  trick4Released: false,
  style: false,
  stylePressed: false,
  styleReleased: false,
});
