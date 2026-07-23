import {
  BOARDS,
  CONDITIONS,
  DEFAULT_RUN_MODE_ID,
  FIXED_STEP,
  GAME_VERSION,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  MAX_FRAME_DELTA,
  RUN_MODES,
  TUNING,
} from "./config.js";
import {
  CHARACTER_CATALOG,
  characterDefinition,
  normalizeCharacterId,
} from "./character-catalog.js";
import { SurfAudio } from "./audio.js";
import { PoliteAnnouncer } from "./announcer.js";
import { InputManager } from "./input.js";
import { riderFrameCameraTarget } from "./camera.js";
import { clamp } from "./math.js";
import {
  getRunRecord,
  loadSave,
  recordRun,
  resolveStorage,
  sanitizeSettings,
  writeSave,
} from "./persistence.js";
import { KakiRenderer } from "./renderer.js";
import { SurfSimulation } from "./simulation.js";
import {
  adjustFormControl,
  clearGamepadFocus,
  findDirectionalTarget,
  markGamepadFocus,
  visibleFocusables,
} from "./ui-navigation.js";

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

export function isTouchControlEnvironment({
  coarsePointer = false,
  maxTouchPoints = 0,
  viewportWidth = Number.POSITIVE_INFINITY,
} = {}) {
  const compactTouchscreen = Number(maxTouchPoints) > 0 && Number(viewportWidth) <= 1024;
  return Boolean(coarsePointer || compactTouchscreen);
}

export function shouldShowTouchControls(
  state,
  enabled,
  settingsOpen = false,
  touchEnvironment = true,
  qaFixture = false,
) {
  if (qaFixture && state === "qa") return true;
  return Boolean(enabled && state === "running" && !settingsOpen && touchEnvironment);
}

export function stableViewportOrientation(width, height, minimumAspectRatio = 1.12) {
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!(safeWidth > 0) || !(safeHeight > 0)) return null;
  const ratio = safeWidth / safeHeight;
  if (ratio >= minimumAspectRatio) return "landscape";
  if (ratio <= 1 / minimumAspectRatio) return "portrait";
  return null;
}

export function resolveViewportTransition(previousOrientation, width, height) {
  const observed = stableViewportOrientation(width, height);
  return {
    orientation: observed ?? previousOrientation ?? null,
    changed: Boolean(previousOrientation && observed && observed !== previousOrientation),
  };
}

export async function lockMobileLandscape({
  enabled = true,
  host = null,
  documentRef = globalThis.document,
  screenRef = globalThis.screen,
} = {}) {
  if (!enabled) return { fullscreen: false, locked: false };
  let fullscreen = Boolean(documentRef?.fullscreenElement);
  let locked = false;
  if (!fullscreen && typeof host?.requestFullscreen === "function") {
    try {
      await host.requestFullscreen({ navigationUI: "hide" });
      fullscreen = true;
    } catch {
      // iOS Safari and embedded browsers may deny fullscreen; the rotate gate
      // remains available without breaking the run.
    }
  }
  if (typeof screenRef?.orientation?.lock === "function") {
    try {
      await screenRef.orientation.lock("landscape");
      locked = true;
    } catch {
      // Orientation lock generally requires fullscreen and is not universal.
    }
  }
  return { fullscreen, locked };
}

export class KakiSurfGame {
  constructor({
    host,
    externalInput = null,
    externalAudio = null,
    storage = undefined,
    hostSettings = null,
    profile = null,
    onExit = null,
    onRunComplete = null,
    qaScene = null,
    visualAssets = null,
  }) {
    this.host = host;
    this.storage = resolveStorage(storage);
    this.profile = profile;
    this.onExit = onExit;
    this.onRunComplete = onRunComplete;
    this.initialQaScene = qaScene;
    this.qaFreeze = false;
    this.save = loadSave(this.storage);
    if (hostSettings) {
      this.save.settings = sanitizeSettings(
        { ...this.save.settings, ...hostSettings },
        { legacyControlMode: this.save.settings.controlMode },
      );
    }
    this.settings = this.save.settings;
    this.selectedCharacter = normalizeCharacterId(this.save.selectedCharacter);
    this.state = "menu";
    this.pausedFrom = null;
    this.accumulator = 0;
    this.lastFrame = 0;
    this.frameHandle = 0;
    this.started = false;
    this.destroyed = false;
    this.characterFallbackWarned = false;
    this.runSequence = 0;
    this.viewportOrientation = stableViewportOrientation(
      globalThis.window?.innerWidth,
      globalThis.window?.innerHeight,
    );
    this.abort = new AbortController();
    this.host.innerHTML = gameMarkup();
    this.elements = collectElements(host);
    this.announcer = new PoliteAnnouncer(this.elements.liveRegion);
    this.simulation = new SurfSimulation({
      tuning: TUNING,
      controlMode: this.settings.controlMode,
      mode: this.save.selectedMode,
      character: this.selectedCharacter,
    });
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
    this.selectedMode = RUN_MODES[this.save.selectedMode] ? this.save.selectedMode : DEFAULT_RUN_MODE_ID;
    this.host.dataset.condition = this.selectedCondition;
    this.host.dataset.character = this.selectedCharacter;
    this.bindUI();
    this.buildCharacterCards();
    this.buildBoardCards();
    this.buildModeCards();
    this.buildConditionCards();
    this.buildDebugPanel();
    this.syncSettingsUI();
    this.updateMenuStats();
    this.showLayer("menu");
    this.audio.setLifecycle?.("menu");
  }

  start({
    immediate = false,
    character = null,
    board = null,
    condition = null,
    mode = null,
  } = {}) {
    if (this.destroyed) throw new Error("Cannot start a destroyed Kaki Surf instance.");
    if (character) this.selectCharacter(character);
    if (board && BOARDS[board]) this.selectBoard(board);
    if (condition && CONDITIONS[condition]) this.selectCondition(condition);
    if (mode && RUN_MODES[mode]) this.selectMode(mode);
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
    const soderFallbackActive = this.selectedCharacter === "soderSnek"
      && !this.renderer.visualAssets?.generated?.soderSnek;
    this.host.dataset.characterAsset = soderFallbackActive ? "fallback" : "atlas";
    if (soderFallbackActive && !this.characterFallbackWarned) {
      this.characterFallbackWarned = true;
      console.warn("Soder Snek atlas could not be loaded; using the complete code-authored Soder renderer.");
    }
    const landscapeLock = lockMobileLandscape({
      enabled: this.isTouchControlEnvironment(),
      host: this.host,
    });
    const runSequence = ++this.runSequence;
    this.announcer.clear();
    this.save.selectedCharacter = this.selectedCharacter;
    this.save.selectedBoard = this.selectedBoard;
    this.save.selectedCondition = this.selectedCondition;
    this.save.selectedMode = this.selectedMode;
    writeSave(this.save, this.storage);
    this.input.clear?.();
    this.audio.resetRun?.();
    this.simulation.reset({
      character: this.selectedCharacter,
      board: this.selectedBoard,
      condition: this.selectedCondition,
      mode: this.selectedMode,
      assists: {
        steering: this.settings.steeringAssist,
        landing: this.settings.landingAssist,
      },
      controlMode: this.settings.controlMode,
      tutorialEnabled: !this.save.tutorialSeen,
    });
    this.renderer.resetRunPresentation?.(this.simulation);
    this.simulation.begin();
    this.accumulator = 0;
    this.state = "running";
    this.pausedFrom = null;
    this.showLayer(null);
    this.elements.canvas.focus({ preventScroll: true });
    try {
      this.audio.setLifecycle?.("running");
      await this.audio.unlock?.();
      if (runSequence !== this.runSequence || this.state !== "running") return;
      this.audio.onEvent?.("uiConfirm", this.simulation);
    } catch (error) {
      console.warn("Kaki Surf audio could not be unlocked; play continues silently.", error);
    }
    await landscapeLock;
    this.refreshViewportOrientation();
    if (this.state === "running" && this.isPortraitTouchLayout()) {
      this.pause("orientation");
      this.announce("Turn your phone sideways to surf.", { urgent: true });
      return;
    }
    this.announce(`${characterDefinition(this.selectedCharacter).displayName}, ${RUN_MODES[this.selectedMode].name}, ${BOARDS[this.selectedBoard].name}, ${CONDITIONS[this.selectedCondition].name}.${soderFallbackActive ? " Code-authored Soder art active." : ""}`);
  }

  pause(reason = "manual") {
    if (this.state !== "running") return;
    this.announcer.clear();
    this.pausedFrom = reason;
    this.state = "paused";
    this.input.clear?.();
    this.audio.onEvent?.("uiPause", this.simulation);
    this.audio.setLifecycle?.("paused");
    this.showLayer("pause");
    this.elements.resumeButton.focus({ preventScroll: true });
    this.announce("Surfing paused.", { urgent: true });
  }

  resume() {
    if (this.state !== "paused") return;
    void lockMobileLandscape({
      enabled: this.isTouchControlEnvironment?.() ?? false,
      host: this.host,
    });
    this.announcer.clear();
    // A/B can both activate pause UI and map to gameplay actions. Neutralize
    // them before the same frame returns to the fixed-step simulation.
    this.input.clear?.();
    this.state = "running";
    this.pausedFrom = null;
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.showLayer(null);
    this.audio.setLifecycle?.("running");
    this.elements.canvas.focus({ preventScroll: true });
    this.announce("Surfing resumed.");
  }

  restart() {
    this.input.clear?.();
    this.startRun();
  }

  backToMenu() {
    this.runSequence += 1;
    this.announcer.clear();
    this.input.clear?.();
    this.state = "menu";
    this.simulation.reset({
      character: this.selectedCharacter,
      board: this.selectedBoard,
      condition: this.selectedCondition,
      mode: this.selectedMode,
      controlMode: this.settings.controlMode,
    });
    this.accumulator = 0;
    this.renderer.resetRunPresentation?.(this.simulation);
    this.audio.onEvent?.("uiBack", this.simulation);
    this.audio.setLifecycle?.("menu");
    this.updateMenuStats();
    this.showLayer("menu");
    this.elements.startButton.focus({ preventScroll: true });
  }

  getSnapshot() {
    return {
      lifecycle: this.state,
      state: this.simulation.player.state,
      elapsed: this.simulation.elapsed,
      activeTime: this.simulation.activeTime,
      timeRemaining: Number.isFinite(this.simulation.timeRemaining) ? this.simulation.timeRemaining : null,
      score: Math.round(this.simulation.score.total),
      multiplier: this.simulation.currentMultiplier(),
      turbo: this.simulation.player.turbo,
      turboActive: this.simulation.player.turboActive,
      turboBurnProgress: this.simulation.player.turboBurnProgress,
      turboTier: this.simulation.player.turboTier,
      turboCookingTimer: this.simulation.player.turboCookingTimer,
      aerialAltitude: this.simulation.player.aerialAltitude,
      aerialZone: this.simulation.player.aerialZone,
      wipeouts: this.simulation.wipeouts,
      character: this.selectedCharacter,
      board: this.selectedBoard,
      condition: this.selectedCondition,
      mode: this.selectedMode,
      set: this.simulation.endlessSet,
      distance: Math.round(this.simulation.rideDistance),
      bestScore: getRunRecord(this.save, this.selectedMode).bestScore,
      tutorial: this.simulation.tutorial?.snapshot?.() ?? null,
      assists: { ...this.simulation.assists },
      controlMode: this.simulation.controlMode,
      travelDirection: this.simulation.player.travelDirection,
      ridingStance: this.simulation.player.ridingStance,
      stanceSwitches: this.simulation.player.stanceSwitches,
      playerX: this.simulation.player.state === "airborne"
        ? this.simulation.player.airX
        : this.simulation.player.x,
      cameraWorldX: this.simulation.cameraWorldX,
      breakX: this.simulation.wave.contactX(),
      world: this.simulation.world.snapshot(),
    };
  }

  getCameraDebugSnapshot() {
    const simulation = this.simulation;
    const player = simulation.player;
    const playerWorldX = Number(player.worldX) || 0;
    const curlWorldX = Number(simulation.wave.curlWorldX) || 0;
    const cameraWorldX = Number(simulation.camera.worldX) || 0;
    const cameraWorldY = Number(simulation.camera.worldY) || 0;
    const naturalPlayerY = ["airborne", "wipeout"].includes(player.state)
      ? Number(player.airY) || 0
      : simulation.wave.ridingY(playerWorldX, player.face);
    const riderFrameOffsetY = this.renderer.riderFrameOffsetY(simulation, 1);
    const riderProjection = this.renderer.riderProjection?.(simulation, 1);
    const stageOffsetY = Number(this.renderer.lastStageOffset?.y) || 0;
    const waveCrestScreenY = simulation.wave.ridingY(simulation.wave.contactX(), 0) + stageOffsetY;
    const waterlineScreenY = 79 + stageOffsetY;
    const backdrop = this.renderer.aerialBackdrop;
    const backdropSourceY = this.renderer.backgroundSourceY?.() ?? 424;
    return {
      state: player.state,
      playerWorldX,
      curlWorldX,
      cameraWorldX,
      playerScreenX: playerWorldX - cameraWorldX,
      barrelGap: playerWorldX - curlWorldX,
      cameraWorldY,
      playerScreenY: naturalPlayerY + riderFrameOffsetY + stageOffsetY,
      naturalPlayerY,
      riderFrameOffsetY,
      riderScale: riderProjection?.riderScale ?? 1,
      finalPlayerScreenY: naturalPlayerY + riderFrameOffsetY + stageOffsetY,
      stageOffsetY,
      hudOffsetY: 0,
      horizonScreenY: 79 + stageOffsetY,
      waveCrestScreenY,
      waterlineScreenY,
      backdropAltitude: backdrop?.altitude ?? 0,
      backdropSourceX: Number(this.renderer.lastBackdropSourceX) || 0,
      backdropSourceY,
      backdropBlendState: { ...(backdrop?.blend ?? {}) },
      backdropFrameDelta: (backdrop?.frameDelta ?? 0) * 424,
      maximumPerFrameBackdropDelta: (backdrop?.maximumFrameDelta ?? 0) * 424,
      maxAirHeight: player.maxAirHeight,
      waveMomentum: player.waveMomentum,
      momentumLiftMultiplier: Number(player.trickManifest?.launchData?.momentumLiftMultiplier) || 1,
      reboundReadiness: Number(player.trickManifest?.launchData?.reboundReadiness) || 0,
      reboundLiftMultiplier: Number(player.trickManifest?.launchData?.reboundLiftMultiplier) || 1,
      aerialBoostStack: Number(player.trickManifest?.launchData?.boostStack) || 0,
      aerialAltitude: player.aerialAltitude,
      airVY: player.airVY,
      boardAngle: player.boardAngle,
      face: player.face,
      faceVelocity: player.faceVelocity,
      speed: player.speed,
      speedCap: simulation.currentRideSpeedCap(),
      landingTargetAngle: player.landingPreview?.targetAngle ?? null,
      landingError: player.landingPreview?.error ?? null,
      rotation: player.rotationAccum,
      angularVelocity: player.angularVelocity,
      activeTime: simulation.activeTime,
      turbo: player.turbo,
      turboActive: player.turboActive,
      turboBurnStartLevel: player.turboBurnStartLevel,
      turboBurnSpent: player.turboBurnSpent,
      turboBurnProgress: player.turboBurnProgress,
      turboBurnInterruptions: player.turboBurnInterruptions,
      turboTier: player.turboTier,
      turboReleaseGrace: player.turboReleaseGrace,
      turboCookingTimer: player.turboCookingTimer,
      turboFullBurnQualified: player.turboFullBurnQualified,
      turboEffects: this.renderer.turboSnapshot?.() ?? null,
      landingQuality: player.landingQuality,
      lastLandingQuality: player.lastLandingQuality,
      landingCarryTimer: player.landingCarryTimer,
      direction: player.travelDirection,
      ridingStance: player.ridingStance,
      trickPose: player.trickPose,
      wipeoutCause: player.wipeoutCause,
      wipeouts: simulation.wipeouts,
      multiplier: simulation.currentMultiplier(),
      trickSequence: (player.trickManifest?.sequence ?? []).map((entry) => ({
        id: entry.id,
        complete: entry.complete,
        progress: entry.poseProgress,
      })),
    };
  }

  frame(now) {
    if (this.destroyed) return;
    const frameDelta = clamp((now - this.lastFrame) / 1000, 0, MAX_FRAME_DELTA);
    this.lastFrame = now;
    this.input.update?.(frameDelta);
    const ui = this.input.consumeUi?.() ?? EMPTY_UI;
    const controlsBlocked = Boolean(this.elements.settingsDialog.open);
    const bufferedMeta = this.input.consumeMeta?.() ?? EMPTY_META;
    const meta = controlsBlocked ? EMPTY_META : bufferedMeta;

    if (meta.debug) this.toggleDebug();
    if (meta.pause) {
      if (this.state === "running") this.pause();
      else if (this.state === "paused") this.resume();
    }
    if (meta.restart && (this.state === "running" || this.state === "results")) this.restart();
    if (meta.retry && this.state === "results") this.restart();

    if (this.state !== "running" || controlsBlocked) this.handleGamepadUi(ui);

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
        this.simulation.updateCameraPresentation?.(frameDelta);
      }
      this.audio.update?.(this.simulation);
      this.syncTouchActionState();
    } else if (this.state === "menu") {
      this.simulation.wave.update(frameDelta * 0.26, 24, 0);
      const controls = this.input.consumeStep?.() ?? EMPTY_CONTROLS;
      if (!controlsBlocked && controls.edgePressed && !ui.confirm) this.startRun();
    } else if (this.state === "results") {
      const controls = this.input.consumeStep?.() ?? EMPTY_CONTROLS;
      if (!controlsBlocked && controls.edgePressed && !ui.confirm) this.restart();
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
      if (event.type !== "complete") this.audio.onEvent?.(event, this.simulation);
      if (event.type === "callout") {
        this.announce(
          event.payload.subtext ? `${event.payload.text}. ${event.payload.subtext}` : event.payload.text,
          { urgent: ["risk", "wipeout"].includes(event.payload.tone) },
        );
      }
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
        this.announce(cue, { urgent: event.payload.kind === "shark" });
      }
    });
  }

  rumble(duration, weakMagnitude, strongMagnitude) {
    if (this.settings.reducedMotion) return;
    try {
      const userActivation = navigator.userActivation;
      if (this.isTouchControlEnvironment() && userActivation?.hasBeenActive !== false) {
        navigator.vibrate?.(Math.min(45, duration));
      }
      const pads = Array.from(navigator.getGamepads?.() ?? []).filter(Boolean);
      const pad = pads.find((candidate) =>
        candidate.buttons?.some((button) => button?.pressed || button?.value > 0.5)
        || candidate.axes?.some((axis) => Math.abs(Number(axis) || 0) > 0.18))
        ?? pads[0];
      pad?.vibrationActuator?.playEffect?.("dual-rumble", {
        duration,
        weakMagnitude,
        strongMagnitude,
      }).catch?.(() => {});
    } catch {
      // Vibration support is optional and must never interrupt the frame loop.
    }
  }

  handleComplete(result) {
    this.announcer.clear();
    // Results owns a new focus context. Suppress held carving/repeat and action
    // edges until the controller returns to neutral.
    this.input.clear?.();
    const enriched = {
      ...result,
      character: this.selectedCharacter,
      board: this.selectedBoard,
      condition: this.selectedCondition,
      mode: this.selectedMode,
    };
    const isBest = recordRun(this.save, enriched);
    writeSave(this.save, this.storage);
    if (isBest) {
      const event = { type: "personalBest", payload: { score: result.score }, time: this.simulation.elapsed };
      this.renderer.onEvent(event, this.simulation);
      this.audio.onEvent?.(event, this.simulation);
    } else this.audio.onEvent?.({ type: "complete", payload: result }, this.simulation);
    this.state = "results";
    this.audio.setLifecycle?.("results");
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
    const mode = RUN_MODES[result.mode] ?? RUN_MODES[this.selectedMode];
    const record = getRunRecord(this.save, mode.id);
    this.elements.resultRank.textContent = result.rank.grade;
    this.elements.resultTitle.textContent = result.rank.title;
    this.elements.resultScore.textContent = Math.round(result.score).toLocaleString();
    this.elements.resultBest.textContent = isBest ? "NEW PERSONAL BEST" : `${mode.shortName} BEST ${record.bestScore.toLocaleString()}`;
    this.elements.resultFlow.textContent = `${result.flow}%`;
    const rows = [
      ["Ride Time", formatDuration(result.duration)],
      ["Distance", `${Math.round(result.distance ?? 0)} M`],
      ...(!mode.timed ? [["Best Set", String(result.set ?? 1)]] : []),
      ["Ride", breakdown.ride],
      ["Speed", breakdown.speed],
      ["Pocket", breakdown.pocket],
      ["Carves", breakdown.carves],
      ["Moves", breakdown.maneuvers ?? 0],
      ["Air", breakdown.air],
      ["Style", breakdown.style],
      ["Landings", breakdown.landings],
    ].map(([label, value]) => [label, typeof value === "number" ? Math.round(value).toLocaleString() : value]);
    if (highlights.biggestAir > 0) rows.push(["Biggest Air", `${Math.round(highlights.biggestAir)} PX`]);
    if (highlights.bestTrick) rows.push(["Best Trick", String(highlights.bestTrick).toUpperCase()]);
    if (highlights.perfectLandings > 0) rows.push(["Perfect", String(highlights.perfectLandings)]);
    if (highlights.switchBonuses > 0) rows.push(["Switch", String(highlights.switchBonuses)]);
    if (highlights.animalBonuses > 0) rows.push(["Animal", String(highlights.animalBonuses)]);
    if (highlights.nearMisses > 0) rows.push(["Near Miss", String(highlights.nearMisses)]);
    if (highlights.longestTube > 0) {
      rows.push([
        "Best Tube",
        `${Number(highlights.bestTubeDuration ?? 0).toFixed(1)} S / ${Math.round(highlights.bestTubeScore ?? 0)}`,
      ]);
    }
    this.elements.breakdown.innerHTML = rows
      .map(([label, value]) => `<div${["Best Trick", "Best Tube"].includes(label) ? " class=score-breakdown-wide" : ""}><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
    this.elements.resultCondition.textContent = `${mode.name} / ${CONDITIONS[this.selectedCondition].name}`;
  }

  handleGamepadUi(ui) {
    if (!ui || (!ui.x && !ui.y && !ui.confirm && !ui.cancel)) return false;
    const settingsOpen = Boolean(this.elements.settingsDialog.open);
    const container = settingsOpen
      ? this.elements.settingsDialog
      : this.state === "menu"
        ? this.elements.menuLayer
        : this.state === "paused"
          ? this.elements.pauseLayer
          : this.state === "results"
            ? this.elements.resultsLayer
            : null;
    if (!container) return false;

    if (ui.cancel) {
      this.audio.onEvent?.("uiBack", this.simulation);
      if (settingsOpen) this.closeSettings();
      else if (this.state === "paused") this.resume();
      // B remains the documented instant retry on Results via consumeMeta().
      return true;
    }

    const focusables = visibleFocusables(container);
    const active = container.contains?.(document.activeElement) ? document.activeElement : null;
    const preferred = this.preferredGamepadFocus(settingsOpen, focusables);
    let focused = active;

    if (ui.x || ui.y) {
      if (!focused) focused = markGamepadFocus(this.host, preferred ?? focusables[0]);
      else if (!(ui.x && adjustFormControl(focused, ui.x))) {
        const next = findDirectionalTarget(focused, focusables, ui.x, ui.y);
        if (next) focused = markGamepadFocus(this.host, next);
      }
    }

    if (ui.confirm) {
      const target = focused ?? preferred ?? focusables[0];
      if (target) {
        markGamepadFocus(this.host, target);
        target.click?.();
      }
    }
    return true;
  }

  preferredGamepadFocus(settingsOpen, focusables) {
    if (settingsOpen) {
      return this.elements.settingsDialog.querySelector("[data-setting=controlMode]") ?? focusables[0];
    }
    if (this.state === "menu") {
      return this.elements.startButton;
    }
    if (this.state === "paused") return this.elements.resumeButton;
    if (this.state === "results") return this.elements.retryButton;
    return focusables[0];
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
    this.elements.settingsDialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closeSettings();
    }, { signal });
    this.elements.settingsDialog.addEventListener("close", () => this.finishSettingsClose(), { signal });
    this.elements.fullscreenButton.addEventListener("click", () => this.toggleFullscreen(), { signal });
    this.elements.pauseButton.addEventListener("click", () => this.pause("touch"), { signal });
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
    window.addEventListener("orientationchange", () => this.handleViewportChange(true), { signal });
    window.addEventListener("resize", () => this.handleViewportChange(false), { signal });
    window.addEventListener("pointerdown", () => clearGamepadFocus(this.host), { signal });
    window.addEventListener("keydown", (event) => {
      clearGamepadFocus(this.host);
      if (event.code === "Escape" && this.elements.settingsDialog.open) {
        event.preventDefault();
        this.closeSettings();
      }
    }, { signal });
  }

  buildCharacterCards() {
    this.elements.characterGrid.innerHTML = Object.values(CHARACTER_CATALOG).map((character) => `
      <button class="character-card character-card--${character.id}${character.id === this.selectedCharacter ? " is-selected" : ""}" type="button" data-character="${character.id}" aria-pressed="${character.id === this.selectedCharacter}" aria-label="${character.menuDescription}">
        <span class="character-portrait" aria-hidden="true"><i></i><b></b><em></em></span>
        <span><strong>${character.displayName}</strong><small>${character.menuDescription.replace(`${character.displayName} — `, "")}</small></span>
      </button>
    `).join("");
    this.elements.characterGrid.querySelectorAll("[data-character]").forEach((button) => {
      button.addEventListener("click", () => this.selectCharacter(button.dataset.character), { signal: this.abort.signal });
    });
  }

  selectCharacter(characterId) {
    const normalized = normalizeCharacterId(characterId);
    this.selectedCharacter = normalized;
    this.host.dataset.character = normalized;
    this.save.selectedCharacter = normalized;
    this.simulation.characterId = normalized;
    this.simulation.player.characterId = normalized;
    this.elements.characterGrid.querySelectorAll("[data-character]").forEach((button) => {
      const selected = button.dataset.character === normalized;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    this.elements.selectedCharacterName.textContent = characterDefinition(normalized).displayName;
    writeSave(this.save, this.storage);
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

  buildModeCards() {
    this.elements.modeGrid.innerHTML = Object.values(RUN_MODES).map((mode) => `
      <button class="mode-card${mode.id === this.selectedMode ? " is-selected" : ""}" type="button" data-mode="${mode.id}" aria-pressed="${mode.id === this.selectedMode}">
        <span><strong>${mode.name}</strong><b>${mode.shortName}</b></span>
        <small>${mode.tagline}</small>
      </button>
    `).join("");
    this.elements.modeGrid.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => this.selectMode(button.dataset.mode), { signal: this.abort.signal });
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

  selectMode(modeId) {
    if (!RUN_MODES[modeId]) return;
    this.selectedMode = modeId;
    this.save.selectedMode = modeId;
    this.simulation.mode = RUN_MODES[modeId];
    this.simulation.modeId = modeId;
    this.elements.modeGrid.querySelectorAll("[data-mode]").forEach((button) => {
      const selected = button.dataset.mode === modeId;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const mode = RUN_MODES[modeId];
    this.elements.startLabel.textContent = mode.startLabel;
    this.elements.startHint.textContent = mode.startHint;
    this.updateMenuStats();
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
    this.renderer.cameraDebug = !this.elements.debugPanel.hidden;
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
      this.elements.touchSpecial.hidden = simple;
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
    this.selectCharacter(this.selectedCharacter);
    this.selectBoard(this.selectedBoard);
    this.selectMode(this.selectedMode);
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
    this.input.clear?.();
    this.elements.settingsDialog.showModal();
  }

  closeSettings() {
    if (!this.elements.settingsDialog.open) return;
    this.elements.settingsDialog.close();
  }

  finishSettingsClose() {
    this.input.clear?.();
    if (this.state === "paused" && this.pausedFrom === "settings") this.resume();
  }

  updateMenuStats() {
    const mode = RUN_MODES[this.selectedMode];
    const record = getRunRecord(this.save, this.selectedMode);
    this.elements.bestLabel.textContent = `${mode.shortName} BEST`;
    this.elements.bestScore.textContent = record.bestScore.toLocaleString();
    this.elements.runCount.textContent = String(this.save.totalRuns);
    this.elements.selectedCharacterName.textContent = characterDefinition(this.selectedCharacter).displayName;
    this.elements.selectedBoardName.textContent = BOARDS[this.selectedBoard].name;
    this.elements.selectedConditionName.textContent = CONDITIONS[this.selectedCondition].shortName;
  }

  showLayer(name) {
    clearGamepadFocus(this.host);
    this.elements.menuLayer.hidden = name !== "menu";
    this.elements.pauseLayer.hidden = name !== "pause";
    this.elements.resultsLayer.hidden = name !== "results";
    this.elements.topControls.hidden = name === "menu";
    this.elements.pauseButton.hidden = this.state !== "running";
    this.syncTouchControlsVisibility();
    this.syncOrientationGate();
  }

  handleViewportChange(forceOrientationChange = false) {
    const transition = resolveViewportTransition(
      this.viewportOrientation,
      globalThis.window?.innerWidth,
      globalThis.window?.innerHeight,
    );
    this.viewportOrientation = transition.orientation;
    if (forceOrientationChange || transition.changed) {
      if (transition.orientation === "portrait" && this.state === "running") {
        this.pause("orientation");
      } else if (transition.orientation === "landscape"
        && this.state === "paused" && this.pausedFrom === "orientation") {
        this.resume();
      } else this.input.clear?.();
    }
    this.syncTouchControlsVisibility();
    this.syncOrientationGate?.();
  }

  refreshViewportOrientation() {
    this.viewportOrientation = stableViewportOrientation(
      globalThis.window?.innerWidth,
      globalThis.window?.innerHeight,
    ) ?? this.viewportOrientation;
  }

  isTouchControlEnvironment() {
    return isTouchControlEnvironment({
      coarsePointer: Boolean(globalThis.window?.matchMedia?.("(pointer: coarse)")?.matches),
      maxTouchPoints: globalThis.navigator?.maxTouchPoints,
      viewportWidth: globalThis.window?.innerWidth,
    });
  }

  syncTouchControlsVisibility() {
    const controls = this.elements.touchControls;
    const touchEnvironment = this.isTouchControlEnvironment();
    const visible = shouldShowTouchControls(
      this.state,
      this.settings.touchControls,
      this.elements.settingsDialog.open,
      touchEnvironment && this.viewportOrientation !== "portrait",
      controls.classList.contains("qa-visible"),
    );
    if (!visible && !controls.hidden) this.input.clear?.();
    controls.hidden = !visible;
    controls.inert = !visible;
    controls.setAttribute("aria-hidden", String(!visible));
  }

  isPortraitTouchLayout() {
    return this.viewportOrientation === "portrait" && this.isTouchControlEnvironment();
  }

  syncOrientationGate() {
    const gate = this.elements.orientationGate;
    const visible = this.isPortraitTouchLayout()
      && (this.state === "running" || (this.state === "paused" && this.pausedFrom === "orientation"));
    this.host.dataset.touchUi = this.isTouchControlEnvironment() ? "true" : "false";
    gate.hidden = !visible;
    gate.inert = !visible;
    gate.setAttribute("aria-hidden", String(!visible));
  }

  announce(message, options = {}) {
    this.announcer.announce(message, options);
  }

  async toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (this.isTouchControlEnvironment()) {
        await lockMobileLandscape({ host: this.host });
      } else await this.host.requestFullscreen();
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
      this.selectedMode = DEFAULT_RUN_MODE_ID;
      this.host.dataset.condition = this.selectedCondition;
      this.buildBoardCards();
      this.buildModeCards();
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
      this.selectedMode = "endless";
      this.host.dataset.condition = this.selectedCondition;
      this.state = "results";
      this.renderResults({
        score: 18420,
        flow: 94,
        mode: "endless",
        duration: 147,
        distance: 3228,
        set: 5,
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

    if (scene === "coreSurfLab") {
      this.qaFreeze = false;
      this.settings.controlMode = "simple";
      this.input.setControlMode?.("simple");
      if ("enabled" in this.input) this.input.enabled = true;
      this.host.dataset.controlMode = "simple";
      this.host.dataset.coreSurfLab = "true";
      this.selectedBoard = "foamPuff";
      this.selectedCondition = "twilightGlass";
      this.selectedMode = "endless";
      this.host.dataset.condition = this.selectedCondition;
      this.simulation.reset({
        board: this.selectedBoard,
        condition: this.selectedCondition,
        mode: this.selectedMode,
        controlMode: "simple",
        tutorialEnabled: false,
        worldQa: { quiet: true },
        coreSurfLab: true,
      });
      this.simulation.begin();
      Object.assign(this.simulation.player, {
        state: "riding",
        stateTime: 1,
        x: 196,
        previousX: 196,
        face: 0.34,
        previousFace: 0.34,
        speed: 72,
        travelVelocity: 16,
        lateralVelocity: 16,
      });
      this.simulation.wave.curlX = -520;
      this.simulation.wave.pressure = 0.46;
      this.simulation.syncCanonicalMotion(0, true);
      this.renderer.resetRunPresentation?.(this.simulation);
      this.state = "running";
      this.showLayer(null);
      this.elements.topControls.hidden = true;
      this.elements.touchControls.hidden = true;
      this.elements.canvas.focus({ preventScroll: true });
      return;
    }

    const conditionId = Object.keys(CONDITIONS).find((id) => scene === id || scene.endsWith(`-${id}`))
      ?? "goldenCoast";
    const boardId = Object.keys(BOARDS).find((id) => scene === id || scene.startsWith(`${id}-`))
      ?? (scene === "maxSpeed" || scene === "turboBoost" || scene === "tailGrab" || scene === "hugeAir" ? "moonLog" : scene === "snap" || scene === "combo360" ? "mangoFish" : "foamPuff");
    this.selectedCondition = conditionId;
    this.selectedMode = "endless";
    this.host.dataset.condition = conditionId;
    this.selectedBoard = boardId;
    this.simulation.reset({
      board: boardId,
      condition: conditionId,
      mode: this.selectedMode,
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
      turbo: 1,
      turboActive: false,
      turboOverdrive: 0,
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

    const aerialQa = scene.match(/^aerial(Coast|Cloud|Upper|Space|Reentry)-/);
    if (aerialQa) {
      const stage = {
        Coast: { altitude: 0.1, rawY: 62, height: 20, label: "BIG AIR", zone: "COASTAL SKY", zoneId: "coastalSky", tier: 1 },
        Cloud: { altitude: 0.38, rawY: 24, height: 62, label: "CLOUD BREAKER", zone: "CLOUD LAYER", zoneId: "cloudLayer", tier: 2 },
        Upper: { altitude: 0.68, rawY: -32, height: 118, label: "STRATOSPHERE KAKI", zone: "UPPER ATMOSPHERE", zoneId: "upperAtmosphere", tier: 3 },
        Space: { altitude: 0.94, rawY: -84, height: 174, label: "KAKI IN ORBIT", zone: "KAKI SPACE", zoneId: "kakiSpace", tier: 4 },
        Reentry: { altitude: 0.68, rawY: -18, height: 128, label: "", zone: "UPPER ATMOSPHERE", zoneId: "upperAtmosphere", tier: 3, descending: true },
      }[aerialQa[1]];
      makeAirborne(stage.descending ? "landingAnticipation" : "apex", stage.label, Math.PI * (stage.tier >= 3 ? 2 : 0.2));
      Object.assign(player, {
        airY: stage.rawY,
        previousAirY: stage.rawY,
        airVY: stage.descending ? 96 : stage.tier === 4 ? 0 : -4,
        launchY: 82,
        maxAirHeight: stage.height,
        aerialAltitude: stage.altitude,
        previousAerialAltitude: stage.altitude,
        aerialAltitudeCeiling: stage.tier === 4 ? 1 : stage.altitude + 0.07,
        aerialExpectedHeight: Math.max(28, stage.height),
        aerialZone: stage.zoneId,
        aerialLaunchQuality: stage.tier === 4 ? 0.96 : 0.48 + stage.tier * 0.12,
        aerialTurboLaunch: stage.tier === 4 ? 1 : 0,
        aerialSpaceQualified: stage.tier === 4,
        aerialMilestoneTier: stage.tier,
      });
      this.simulation.camera.worldY = riderFrameCameraTarget(player);
      this.simulation.camera.verticalAnchorY = this.simulation.camera.worldY;
      this.simulation.camera.verticalTracking = true;
      // Keep the orbital fixture honest: a real late-run launch often happens
      // after the break has advanced far enough to open its trailing cutout.
      // That overlap caught the aerial panorama/coast compositing regression.
      if (stage.tier === 4) {
        this.simulation.wave.curlWorldX = this.simulation.camera.worldX + 92;
      }
      if (stage.label) {
        this.renderer.onEvent({
          type: "aerialMilestone",
          payload: { index: stage.tier, altitude: stage.altitude, text: stage.label },
        }, this.simulation);
        this.renderer.pushCallout(stage.label, stage.zone, "perfect", { channel: "aerial" });
      }
    }

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
      case "turboBoost":
        player.turbo = 0.68;
        player.turboActive = true;
        player.turboOverdrive = 1;
        player.waveMomentum = 1;
        player.speed = Math.round(this.simulation.currentRideSpeedCap() * 0.98);
        player.speedTier = "BLASTING";
        this.renderer.onEvent({ type: "turboStart", payload: { level: player.turbo } }, this.simulation);
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
        player.aerialAltitude = 0.46;
        player.previousAerialAltitude = 0.46;
        player.provisionalScore = 2840;
        this.simulation.camera.worldY = riderFrameCameraTarget(player);
        this.simulation.camera.verticalAnchorY = -42;
        this.simulation.camera.verticalTracking = true;
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
        makeAirborne("frontRailGrab", "FRONTSIDE GRAB", Math.PI * 0.42);
        break;
      case "tailGrab":
        makeAirborne("tailGrab", "360 STALEFISH", Math.PI * 2);
        break;
      case "varial":
        makeAirborne("boardVarial", "BOARD VARIAL", Math.PI * 0.2, Math.PI * 0.72);
        break;
      case "kakiTwist":
        makeAirborne("kakiTwist", "360 KAKI TWIST", Math.PI * 2, -Math.PI * 0.42);
        this.renderer.onEvent({ type: "trickStart", payload: { id: "kakiTwist" } }, this.simulation);
        break;
      case "combo360":
        makeAirborne("tailGrab", "360 STALEFISH + VARIAL", Math.PI * 2, Math.PI * 0.28);
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
        if (this.isPortraitTouchLayout()) {
          this.state = "paused";
          this.pausedFrom = "orientation";
          this.elements.touchControls.hidden = true;
          this.syncOrientationGate();
        } else {
          this.elements.touchControls.hidden = false;
          this.elements.touchControls.classList.add("qa-visible");
        }
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
      case "regularStance":
        player.ridingStance = "regular";
        player.trickPose = "neutral";
        break;
      case "goofyStance":
        player.ridingStance = "goofy";
        player.trickPose = "neutral";
        break;
      case "downhillRight":
        player.travelDirection = 1;
        player.travelVelocity = 24;
        player.face = 0.48;
        player.faceVelocity = 0.62;
        player.speed = 118;
        player.trickPose = "downFaceCarve";
        break;
      case "downhillLeft":
        player.travelDirection = -1;
        player.travelVelocity = -24;
        player.face = 0.48;
        player.faceVelocity = 0.62;
        player.speed = 118;
        player.switchStance = true;
        player.trickPose = "downFaceCarve";
        break;
      case "uphill":
        player.travelDirection = 1;
        player.travelVelocity = 24;
        player.face = 0.5;
        player.faceVelocity = -0.56;
        player.speed = 106;
        player.trickPose = "highLineCarve";
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
      case "heroGather-twilightGlass":
      case "heroPitch-twilightGlass":
      case "heroOpen-twilightGlass":
      case "heroDeep-twilightGlass":
      case "heroMax-twilightGlass":
      case "heroCollapse-twilightGlass": { // Fixed rider pose isolates the hero barrel's authored animation stages.
        const heroStage = {
          // The six fixtures now tell the actual chase story: fully offscreen,
          // first re-entry, open pocket, deep pursuit, hero barrel, catch.
          "heroGather-twilightGlass": { pressure: 0.12, curlX: -230 },
          "heroPitch-twilightGlass": { pressure: 0.34, curlX: -122 },
          "heroOpen-twilightGlass": { pressure: 0.58, curlX: -66 },
          "heroDeep-twilightGlass": { pressure: 0.78, curlX: 20 },
          "heroMax-twilightGlass": { pressure: 0.94, curlX: 76 },
          "heroCollapse-twilightGlass": { pressure: 1, curlX: 120 },
        }[scene];
        const heroX = 208;
        this.simulation.wave.pressure = heroStage.pressure;
        this.simulation.wave.curlX = heroStage.curlX;
        const heroFace = this.simulation.wave.powerFaceAt(heroX);
        const heroTangent = this.simulation.wave.slopeAt(heroX, heroFace);
        Object.assign(player, {
          state: "riding",
          stateTime: 0.42,
          x: heroX,
          previousX: heroX,
          face: heroFace,
          previousFace: heroFace,
          faceVelocity: 0,
          boardAngle: heroTangent,
          bodyAngle: heroTangent,
          curlTimer: scene === "heroCollapse-twilightGlass" ? 0.35 : 0,
        });
        break;
      }
      case "heroTube-twilightGlass": {
        this.simulation.wave.pressure = 0.82;
        this.simulation.wave.curlX = 84;
        const tubeX = this.simulation.wave.contactX() + 13;
        const tubeFace = this.simulation.wave.powerFaceAt(tubeX);
        const tubeTangent = this.simulation.wave.slopeAt(tubeX, tubeFace);
        Object.assign(player, {
          state: "riding",
          stateTime: 0.72,
          x: tubeX,
          previousX: tubeX,
          face: tubeFace,
          previousFace: tubeFace,
          boardAngle: tubeTangent,
          bodyAngle: tubeTangent,
          speed: 116,
          curlTimer: 0,
          maneuver: { id: "tubeTuck", progress: 0.66 },
          trickPose: "tubeTuck",
          tubeRide: {
            active: true,
            id: "tubeTuck",
            time: 1.2,
            score: 175,
            exitGrace: TUNING.tubeExitGrace,
            releaseRequired: false,
            visualExit: 0,
            hintShown: true,
            wasReady: false,
          },
        });
        break;
      }
      case "heroAir-twilightGlass": {
        this.simulation.wave.pressure = 0.7;
        this.simulation.wave.curlX = 72;
        makeAirborne("apex", "TWILIGHT SKYLINE", Math.PI * 2);
        Object.assign(player, {
          airX: 246,
          previousAirX: 246,
          airY: 18,
          previousAirY: 18,
          airVY: 1,
          maxAirHeight: 102,
          aerialAltitude: 0.58,
          previousAerialAltitude: 0.58,
          provisionalScore: 2160,
        });
        // QA freezes after its first frame, so use the settled target to prove
        // the same vertical framing that the live camera eases toward.
        this.simulation.camera.worldY = riderFrameCameraTarget(player);
        this.simulation.camera.verticalAnchorY = -46;
        this.simulation.camera.verticalTracking = true;
        break;
      }
      case "dolphinRide":
      case "dolphinGates":
        player.animalMount = "dolphin";
        player.animalSpecialReady = true;
        player.speed = 116;
        this.renderer.onEvent({ type: "dolphinMounted", payload: { kind: "dolphin" } }, this.simulation);
        break;
      case "whaleRide":
      case "whaleRideLeft":
        player.animalMount = "whale";
        player.animalSpecialReady = true;
        player.speed = 124;
        if (scene === "whaleRideLeft") {
          player.travelDirection = -1;
          player.travelVelocity = -44;
          player.lateralVelocity = -44;
          player.directionIntent = -1;
        }
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
    const qaMotion = this.simulation.syncCanonicalMotion(0, false);
    if (["riding", "lip", "landing", "wobble"].includes(player.state)) {
      player.boardAngle = qaMotion.spriteAngle;
      player.bodyAngle = qaMotion.spriteAngle;
    }
    primeQaWake(this.simulation, scene === "reversal" ? 0.9 : 0);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.runSequence += 1;
    cancelAnimationFrame(this.frameHandle);
    this.abort.abort();
    this.input.clear?.();
    if (this.ownsInput) this.input.destroy?.();
    this.announcer.destroy();
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
    pauseButton: host.querySelector("[data-action=pause-run]"),
    exitButton: host.querySelector("[data-action=exit]"),
    characterGrid: host.querySelector(".character-grid"),
    boardGrid: host.querySelector(".board-grid"),
    modeGrid: host.querySelector(".mode-grid"),
    conditionGrid: host.querySelector(".condition-grid"),
    startLabel: host.querySelector("[data-start=label]"),
    startHint: host.querySelector("[data-start=hint]"),
    bestLabel: host.querySelector("[data-stat=best-label]"),
    bestScore: host.querySelector("[data-stat=best]"),
    runCount: host.querySelector("[data-stat=runs]"),
    selectedCharacterName: host.querySelector("[data-stat=character]"),
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
    orientationGate: host.querySelector(".orientation-gate"),
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
        <canvas width="${LOGICAL_WIDTH}" height="${LOGICAL_HEIGHT}" tabindex="0" aria-label="Kitty Kaki rides a moving wave. Carve with arrows or WASD. Hold Space or A for a half-second tuck preload, hold Shift for Turbo, and use F or X for tricks. Tap Trick on the wave to switch regular and goofy stance; release tricks before landing."></canvas>
        <div class="scanlines" aria-hidden="true"></div>
        <nav class="top-controls" aria-label="Game controls" hidden>
          <button type="button" data-action="pause-run" aria-label="Pause surfing">II</button>
          <button type="button" data-action="settings" aria-label="Open settings">SET</button>
          <button type="button" data-action="fullscreen" aria-label="Toggle fullscreen">FULL</button>
          <button type="button" data-action="exit" aria-label="Leave this run">EXIT</button>
        </nav>

        <div class="game-layer title-layer" data-layer="menu">
          <div class="title-lockup" aria-label="Kaki Surf">
            <span class="pixel-sun" aria-hidden="true"></span>
            <p>PLUSH POCKET ARCADE <span class="build-version" aria-label="version ${GAME_VERSION}">v${GAME_VERSION}</span></p>
            <h1>KAKI <i>SURF</i></h1>
            <span class="title-wave" aria-hidden="true"></span>
          </div>
          <p class="mission-copy">Drop downhill for speed, carve back to the lip, and turn one huge air into the next.</p>
          <div class="mode-select">
            <p><b>MODE</b> Pick the kind of run.</p>
            <div class="mode-grid" aria-label="Choose a game mode"></div>
          </div>
          <div class="start-row">
            <button class="primary-button" type="button" data-action="start"><span data-start="label">CHASE THE HORIZON</span><small data-start="hint">3 PAWS / NO CLOCK</small></button>
            <button class="secondary-button" type="button" data-action="settings">ACCESS + AUDIO</button>
          </div>
          <div class="character-select">
            <p><b>RIDER</b> Choose your surfer. Style changes; physics never do.</p>
            <div class="character-grid" role="group" aria-label="Choose a playable character"></div>
          </div>
          <div class="board-grid" aria-label="Choose a board"></div>
          <div class="condition-select">
            <p><b>SESSION</b> Choose the light. The wave stays fair.</p>
            <div class="condition-grid" aria-label="Choose a surf condition"></div>
          </div>
          <dl class="menu-stats">
            <div><dt data-stat="best-label">ENDLESS BEST</dt><dd data-stat="best">0</dd></div>
            <div><dt>RIDER</dt><dd data-stat="character">KAKI</dd></div>
            <div><dt>BOARD</dt><dd data-stat="board">FOAM PUFF</dd></div>
            <div><dt>BREAK</dt><dd data-stat="condition">GOLDEN</dd></div>
            <div><dt>RIDES</dt><dd data-stat="runs">0</dd></div>
          </dl>
          <p class="controls-line"><b>CARVE</b> ARROWS / WASD <b>PRELOAD</b> HOLD SPACE / A <b>TURBO</b> SHIFT / L3 <b>TRICKS</b> Q FRONT · E STALE · F VARIAL / STANCE · T TWIST</p>
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
          <div class="touch-stick" data-touch-stick data-stick-radius="42" role="group" aria-label="Analog surf stick. Drag in any direction to carve and rotate.">
            <span class="touch-stick__gate" data-stick-gate aria-hidden="true">
              <span class="touch-stick__ticks"></span>
              <span class="touch-stick__knob"></span>
            </span>
            <span class="touch-stick__label" aria-hidden="true">CARVE · SPIN</span>
          </div>
          <div class="touch-actions">
            <button class="touch-spin touch-spin--left" type="button" data-control="spinLeft" aria-label="Advanced Q Frontside Grab"><b>Q</b><span>FRONT</span></button>
            <button class="touch-spin touch-spin--right" type="button" data-control="spinRight" aria-label="Advanced E Stalefish Grab"><b>E</b><span>STALE</span></button>
            <button class="touch-trick" type="button" data-control="trick" aria-label="Context trick or Advanced F Board Varial; tap on the wave to switch stance"><b>TRICK</b><span>VARIAL</span></button>
            <button class="touch-turbo" type="button" data-control="turbo" aria-label="Hold Turbo boost; successful landed tricks refill it"><b>TURBO</b><span>HOLD</span></button>
            <button class="touch-special" type="button" data-control="special" aria-label="Advanced Twist trick; Action or Trick dismounts a ridden animal" hidden><b>T</b><span>TWIST</span></button>
            <button class="touch-action" type="button" data-control="edge" aria-label="Action: hold up to half a second to preload speed with reduced steering, then release to pop"><b>ACTION</b><span>PRELOAD / POP</span></button>
          </div>
        </div>

        <div class="game-layer orientation-gate" hidden inert aria-hidden="true">
          <div class="orientation-gate__phone" aria-hidden="true"><span></span></div>
          <p><b>TURN PHONE</b><span>SURF HORIZONTAL</span></p>
        </div>

        <aside class="debug-panel" hidden>
          <header><strong>SURF LAB</strong><button type="button" data-action="debug-reset">RESET</button></header>
          <p>LIVE TUNING · BACKTICK TO CLOSE</p>
          <div class="debug-fields"></div>
        </aside>
      </div>

      <dialog class="settings-dialog" aria-labelledby="settings-title">
        <form method="dialog" class="settings-card">
          <header><div><p class="eyebrow">MAKE IT YOUR WAVE</p><h2 id="settings-title">SETTINGS</h2></div><button type="button" data-action="close-settings" aria-label="Close settings">×</button></header>
          <section aria-labelledby="audio-heading">
            <h3 id="audio-heading">AUDIO</h3>
            <label class="toggle"><input type="checkbox" data-setting="muted"><span>MUTE ALL AUDIO</span></label>
            <label><span>MUSIC <output data-setting-output="music">58%</output></span><input type="range" min="0" max="1" step="0.01" data-setting="music" aria-label="Music volume"></label>
            <label><span>EFFECTS <output data-setting-output="effects">78%</output></span><input type="range" min="0" max="1" step="0.01" data-setting="effects" aria-label="Effects volume"></label>
            <label><span>WAVE <output data-setting-output="waveAudio">52%</output></span><input type="range" min="0" max="1" step="0.01" data-setting="waveAudio" aria-label="Wave volume"></label>
          </section>
          <section aria-labelledby="access-heading">
            <h3 id="access-heading">ACCESS</h3>
            <label><span>CONTROLS</span><select data-setting="controlMode" aria-label="Control mode"><option value="simple">SIMPLE · ACTION + TRICK + TURBO</option><option value="advanced">ADVANCED · Q E F T + TURBO</option></select></label>
            <label class="toggle"><input type="checkbox" data-setting="reducedMotion"><span>REDUCED MOTION</span></label>
            <label><span>SCREEN SHAKE <output data-setting-output="screenShake">70%</output></span><input type="range" min="0" max="1" step="0.05" data-setting="screenShake" aria-label="Screen shake intensity"></label>
            <label class="toggle"><input type="checkbox" data-setting="reducedFlash"><span>FLASH REDUCTION</span></label>
            <label class="toggle"><input type="checkbox" data-setting="highContrast"><span>HIGH-CONTRAST SURF MARKERS</span></label>
            <label class="toggle"><input type="checkbox" data-setting="touchControls"><span>ALLOW TOUCH CONTROLS · AUTO</span></label>
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

function primeQaWake(simulation, curve = 0) {
  const player = simulation.player;
  const contact = ["riding", "lip", "landing", "wobble"].includes(player.state)
    && !player.animalMount;
  for (const sample of player.wakeSamples ?? []) sample.active = false;
  if (!contact || !Array.isArray(player.wakeSamples)) return;
  const count = Math.min(player.wakeSamples.length, 42);
  const perpendicularX = -player.motionVY / Math.max(1, player.motionSpeed);
  const perpendicularY = player.motionVX / Math.max(1, player.motionSpeed);
  for (let index = 0; index < count; index += 1) {
    const age = (count - index - 1) / 60;
    const bend = Math.sin((index / Math.max(1, count - 1)) * Math.PI) * curve * 18;
    const sample = player.wakeSamples[index];
    sample.active = true;
    sample.worldX = player.tailX + simulation.cameraWorldX
      - player.motionVX * age
      + perpendicularX * bend;
    sample.y = player.tailY - player.motionVY * age + perpendicularY * bend;
    sample.vx = -player.motionVX;
    sample.vy = -player.motionVY;
    sample.sourceVX = player.motionVX;
    sample.sourceVY = player.motionVY;
    sample.speed = player.motionSpeed;
    sample.age = age;
  }
  player.wakeSampleCursor = count % player.wakeSamples.length;
}

export function qaWorldOverride(scene) {
  const wildlife = {
    dolphinApproach: { kind: "dolphin", phase: "approach", screenX: 176, y: 128, direction: 1 },
    dolphinRide: { kind: "dolphin", phase: "mounted", screenX: 232, y: 132, direction: 1 },
    dolphinDismount: { kind: "dolphin", phase: "dismount", screenX: 232, y: 118, direction: 1 },
    sharkApproach: { kind: "shark", phase: "telegraph", screenX: 190, y: 133, direction: 1 },
    sharkNearMiss: { kind: "shark", phase: "crossing", screenX: 222, y: 134, direction: 1 },
    sharkCollision: { kind: "shark", phase: "crossing", screenX: 232, y: 128, direction: 1 },
    whaleDistant: { kind: "whale", phase: "distant", phaseTime: 0.8, screenX: 270, y: 136, direction: -1 },
    whaleBreachStart: { kind: "whale", phase: "breach", phaseTime: 0, screenX: 270, y: 136, direction: -1 },
    whaleBreach: { kind: "whale", phase: "breach", phaseTime: 0.725, screenX: 270, y: 136, direction: -1 },
    whaleBreachReturn: { kind: "whale", phase: "breach", phaseTime: 1.45, screenX: 270, y: 136, direction: -1 },
    whaleRamp: { kind: "whale", phase: "ramp", phaseTime: 0.8, screenX: 244, y: 136, direction: -1 },
    whaleRide: { kind: "whale", phase: "mounted", phaseTime: 1.1, screenX: 232, y: 137, direction: 1 },
    whaleRideLeft: { kind: "whale", phase: "mounted", phaseTime: 1.1, screenX: 232, y: 137, direction: -1 },
    whaleSplash: { kind: "whale", phase: "splash", phaseTime: 0.45, screenX: 248, y: 136, direction: 1 },
    dolphinReduced: { kind: "dolphin", phase: "mounted", screenX: 232, y: 132, direction: 1 },
    sharkHighContrast: { kind: "shark", phase: "telegraph", screenX: 190, y: 133, direction: 1 },
    whaleReduced: { kind: "whale", phase: "breach", phaseTime: 0.725, screenX: 270, y: 136, direction: -1 },
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
        screenX: 330,
        y: 82,
        scale: scene === "speedboatRace" ? 0.68 : 0.62,
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
    const trafficX = ["cargoShip", "sailboat", "fishingBoat"].includes(trafficKind)
      ? 310
      : ["speedboat", "tugboat", "jetSki", "rescueCraft"].includes(trafficKind)
        ? 308
        : 196;
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

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

const EMPTY_META = Object.freeze({ restart: false, retry: false, pause: false, debug: false });
const EMPTY_UI = Object.freeze({ x: 0, y: 0, confirm: false, cancel: false });
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
