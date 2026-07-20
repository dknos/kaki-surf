import { appendFile, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const outputDir = path.resolve(repoRoot, "docs/video");
const sourcePath = process.env.KAKI_HIGHLIGHT_SOURCE
  ?? "/tmp/kaki-surf-twilight-highlight-source.webm";
const outputPath = process.env.KAKI_HIGHLIGHT_OUTPUT
  ?? path.join(outputDir, "twilight-glass-highlight.mp4");
const posterPath = path.join(outputDir, "twilight-glass-highlight-poster.jpg");
const probePath = path.join(outputDir, "twilight-glass-highlight.ffprobe.json");
const subtitlePath = "/tmp/kaki-surf-twilight-highlight.ass";
const cdpHost = process.env.KAKI_SURF_CDP_URL ?? "http://127.0.0.1:9224";
const baseUrl = process.env.KAKI_SURF_QA_URL ?? "http://127.0.0.1:9876/index.html";
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const ffprobe = process.env.FFPROBE ?? "ffprobe";
const duration = 27.3;
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

await mkdir(outputDir, { recursive: true });
await rm(sourcePath, { force: true });
await rm(outputPath, { force: true });
await rm(posterPath, { force: true });

const pages = await fetch(`${cdpHost}/json/list`).then((response) => {
  if (!response.ok) throw new Error(`CDP returned HTTP ${response.status}`);
  return response.json();
});
const page = pages.find((entry) => entry.type === "page");
if (!page) throw new Error("No debuggable Chromium page was found");

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (!message.id) return;
  const waiter = pending.get(message.id);
  if (!waiter) return;
  pending.delete(message.id);
  if (message.error) waiter.reject(new Error(`${waiter.method}: ${message.error.message}`));
  else waiter.resolve(message.result ?? {});
});

function call(method, params = {}) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, method });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression, timeout = 45_000) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => reject(new Error("Runtime evaluation timed out")), timeout);
  });
  let result;
  try {
    result = await Promise.race([
      call("Runtime.evaluate", {
        expression,
        awaitPromise: true,
        returnByValue: true,
      }),
      timeoutPromise,
    ]);
  } finally {
    clearTimeout(timeoutHandle);
  }
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? "Browser evaluation failed";
    throw new Error(description);
  }
  return result.result?.value;
}

async function waitForReady(timeout = 12_000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await evaluate("Boolean(globalThis.kakiSurf && document.readyState === 'complete' && location.search.includes('capture=vertical-highlight'))")) return;
    await sleep(50);
  }
  throw new Error("Timed out waiting for Kaki Surf");
}

await call("Runtime.enable");
await call("Page.enable");
await call("Emulation.setDeviceMetricsOverride", {
  width: 1280,
  height: 720,
  screenWidth: 1280,
  screenHeight: 720,
  deviceScaleFactor: 1,
  mobile: false,
});
await call("Page.navigate", {
  url: `${baseUrl}?qa=heroMax-twilightGlass&capture=vertical-highlight`,
});
await waitForReady();
await sleep(400);

// A trusted pointer gesture lets Chromium initialize WebAudio under normal
// autoplay policy. The game remains fully controlled by the cinematic driver.
await call("Input.dispatchMouseEvent", { type: "mousePressed", x: 640, y: 360, button: "left", clickCount: 1 });
await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: 640, y: 360, button: "left", clickCount: 1 });

const captureMetadata = await evaluate(`(async () => {
  globalThis.kakiSurf?.destroy?.();
  const [{ KakiSurfGame }, { preloadVisualAssets }] = await Promise.all([
    import("./js/game.js"),
    import("./js/asset-loader.js"),
  ]);
  const host = document.querySelector("#kaki-surf-root");
  const game = new KakiSurfGame({
    host,
    storage: null,
    qaScene: "heroMax-twilightGlass",
    visualAssets: await preloadVisualAssets(),
  });
  game.start();
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  globalThis.__kakiHighlightGame = game;
  const canvas = game?.renderer?.canvas;
  if (!game || !canvas) throw new Error("Kaki Surf canvas is unavailable");
  if (!globalThis.MediaRecorder || !canvas.captureStream) {
    throw new Error("This Chromium build cannot record a canvas stream");
  }

  const shots = [
    { start: 0.0, end: 0.8, scene: "heroMax-twilightGlass", pose: "ride", cue: "fullPower" },
    { start: 0.8, end: 1.7, scene: "heroCollapse-twilightGlass", pose: "collapse", cue: "lip" },
    { start: 1.7, end: 3.0, scene: "heroOpen-twilightGlass", pose: "downhill", cue: "downhill" },
    { start: 3.0, end: 3.7, scene: "heroOpen-twilightGlass", pose: "pump", cue: "pump" },
    { start: 3.7, end: 4.3, scene: "heroDeep-twilightGlass", pose: "speed", cue: "fullPower" },
    { start: 4.3, end: 5.3, scene: "heroGather-twilightGlass", pose: "ride" },
    { start: 5.3, end: 6.2, scene: "heroPitch-twilightGlass", pose: "ride", cue: "lip" },
    { start: 6.2, end: 7.3, scene: "heroOpen-twilightGlass", pose: "ride" },
    { start: 7.3, end: 8.3, scene: "heroOpen-twilightGlass", pose: "launch", cue: "launch" },
    { start: 8.3, end: 9.7, scene: "heroDeep-twilightGlass", pose: "hugeAir", cue: "apex" },
    { start: 9.7, end: 11.2, scene: "heroMax-twilightGlass", pose: "combo", cue: "trickComplete" },
    { start: 11.2, end: 12.6, scene: "heroMax-twilightGlass", pose: "land", cue: "land" },
    { start: 12.6, end: 13.5, scene: "sharkNearMiss", pose: "wildlife", cue: "sharkThread" },
    { start: 13.5, end: 14.4, scene: "dolphinRide", pose: "wildlife", cue: "dolphinMounted" },
    { start: 14.4, end: 15.3, scene: "whaleBreach", pose: "wildlife", cue: "whaleBreach" },
    { start: 15.3, end: 17.3, scene: "heroDeep-twilightGlass", pose: "tube", cue: "tubeTuck" },
    { start: 17.3, end: 19.5, scene: "heroMax-twilightGlass", pose: "tube", cue: "fullPower" },
    { start: 19.5, end: 22.1, scene: "heroCollapse-twilightGlass", pose: "collapse", cue: "lip" },
    { start: 22.1, end: 23.1, scene: "heroOpen-twilightGlass", pose: "launch", cue: "launch" },
    { start: 23.1, end: 24.6, scene: "heroMax-twilightGlass", pose: "combo", cue: "trickComplete" },
    { start: 24.6, end: 25.7, scene: "heroMax-twilightGlass", pose: "land", cue: "land" },
    { start: 25.7, end: 27.3, scene: "heroMax-twilightGlass", pose: "result", cue: "personalBest" },
  ];

  const mimeCandidates = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9",
    "video/webm",
  ];
  const mimeType = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
  if (!mimeType) throw new Error("No supported MediaRecorder WebM codec was found");

  game.qaFreeze = true;
  game.audio?.applySettings?.({ muted: false, music: 0.68, effects: 0.94, waveAudio: 0.82 });
  game.audio?.setLifecycle?.("running");
  await game.audio?.unlock?.();

  const captureStream = canvas.captureStream(60);
  let capturedAudio = false;
  let audioDestination = null;
  if (game.audio?.context?.state === "running" && game.audio?.master) {
    audioDestination = game.audio.context.createMediaStreamDestination();
    game.audio.master.connect(audioDestination);
    const [audioTrack] = audioDestination.stream.getAudioTracks();
    if (audioTrack) {
      captureStream.addTrack(audioTrack);
      capturedAudio = true;
    }
  }

  const recorder = new MediaRecorder(captureStream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
    audioBitsPerSecond: 160_000,
  });
  const chunks = [];
  recorder.addEventListener("dataavailable", (event) => {
    if (event.data?.size) chunks.push(event.data);
  });

  const { drawPixelText } = await import("./js/pixel-font.js");
  const ctx = canvas.getContext("2d");
  let activeShot = null;
  let lastNow = performance.now();
  let startedAt = 0;

  const audioCue = (cue, simulation) => {
    if (!cue) return;
    const cues = {
      fullPower: { type: "fullPower", payload: { momentum: 1 } },
      lip: { type: "lip", payload: { strength: 1 } },
      downhill: { type: "downhill", payload: { strength: 1, tier: 4 } },
      pump: { type: "pump", payload: { strength: 1, efficiency: 1 } },
      launch: { type: "launch", payload: { strength: 1.2 } },
      apex: { type: "apex", payload: {} },
      trickComplete: { type: "trickComplete", payload: { id: "varial" } },
      land: { type: "land", payload: { quality: "perfect", error: 0.04 } },
      sharkThread: { type: "sharkThread", payload: {} },
      dolphinMounted: { type: "dolphinMounted", payload: { kind: "dolphin" } },
      whaleBreach: { type: "wildlifePhase", payload: { kind: "whale", phase: "breach" } },
      tubeTuck: { type: "tubeTuck", payload: { id: "tubeTuck" } },
      personalBest: { type: "personalBest", payload: { score: 18420 } },
    };
    game.audio?.onEvent?.(cues[cue], simulation);
  };

  const applyPose = (shot) => {
    const simulation = game.simulation;
    const player = simulation.player;
    if (["launch", "hugeAir", "combo"].includes(shot.pose)) {
      Object.assign(player, {
        state: "airborne",
        stateTime: 0,
        airX: 220,
        previousAirX: 220,
        airY: shot.pose === "launch" ? 76 : 38,
        previousAirY: shot.pose === "launch" ? 76 : 38,
        airVY: shot.pose === "launch" ? -82 : 0,
        speed: 136,
        bodyAngle: 0,
        boardAngle: 0,
        boardRelativeAngle: shot.pose === "combo" ? 0.58 : 0,
        angularVelocity: shot.pose === "combo" ? 9.4 : 5.2,
        rotationAccum: 0,
        maxAirHeight: shot.pose === "launch" ? 54 : 98,
        trickPose: shot.pose === "combo" ? "boardVarial" : shot.pose === "hugeAir" ? "apex" : "takeoff",
        provisionalTrickName: shot.pose === "combo" ? "PERFECT 540 VARIAL" : shot.pose === "hugeAir" ? "HUGE MOON AIR" : "FLOATY POP",
        provisionalScore: shot.pose === "combo" ? 3240 : shot.pose === "hugeAir" ? 2180 : 760,
        landingPreview: {
          boardAngle: 0.08,
          targetAngle: simulation.wave.slopeAt(220, 0.2),
          error: 0.08,
          improving: true,
          bands: { perfect: 0.12, clean: 0.46, recovery: 0.78 },
        },
      });
    } else if (shot.pose === "land" || shot.pose === "result") {
      Object.assign(player, {
        state: "landing",
        stateTime: 0.03,
        speed: 138,
        compression: 1,
        trickPose: "perfectLanding",
        bodyAngle: simulation.wave.slopeAt(player.x, player.face),
        boardAngle: simulation.wave.slopeAt(player.x, player.face),
      });
      simulation.score.total = shot.pose === "result" ? 18420 : Math.max(11240, simulation.score.total);
      simulation.score.combo = shot.pose === "result" ? 5.4 : 4.8;
    } else if (shot.pose === "pump") {
      Object.assign(player, { state: "riding", compression: 1, charge: 0.92, speed: 118, trickPose: "pumpCompress" });
    } else if (shot.pose === "downhill") {
      Object.assign(player, { state: "riding", face: 0.61, previousFace: 0.61, faceVelocity: 0.74, speed: 124, trickPose: "downFaceCarve", speedTier: "BLASTING" });
    } else if (shot.pose === "speed") {
      Object.assign(player, { state: "riding", speed: 148, waveMomentum: 1, powerLine: true, speedTier: "BLASTING", trickPose: "pumpRelease" });
    } else if (shot.pose === "tube") {
      Object.assign(player, { state: "riding", x: 208, previousX: 208, speed: 136, trickPose: "tubeTuck", maneuver: { id: "tubeTuck", progress: 0.58 } });
    }
    audioCue(shot.cue, simulation);
  };

  const enterShot = (shot) => {
    game.renderer.resetRunPresentation?.(game.simulation);
    // QA scene setup intentionally replaces these live-simulation helpers with
    // concise presentation values. Restore their structural shape before the
    // next reset so one canvas can carry the entire continuous capture.
    const stalePlayer = game.simulation.player;
    stalePlayer.maneuver ??= { id: "", progress: 0 };
    stalePlayer.landingPreview ??= {
      boardAngle: 0,
      targetAngle: 0,
      targetDirection: 1,
      error: 0,
      bands: { perfect: 0, clean: 0, recovery: 0 },
      improving: false,
    };
    game.setQaScene(shot.scene);
    game.qaFreeze = true;
    game.state = "qa";
    applyPose(shot);
    activeShot = shot;
  };

  const animate = (shot, local, progress, dt) => {
    const simulation = game.simulation;
    const player = simulation.player;
    const wave = simulation.wave;
    const previousX = Number(player.x ?? 208);
    const previousFace = Number(player.face ?? 0.5);
    player.previousX = previousX;
    player.previousFace = previousFace;
    simulation.elapsed += dt;
    simulation.timeRemaining = Math.max(8, 54 - simulation.elapsed * 0.4);
    wave.time += dt * (shot.pose === "speed" ? 2.1 : 1.25);
    wave.travel += dt * Math.max(90, Number(player.speed ?? 100));
    player.worldTravel = wave.worldTravel;
    player.stateTime = Math.max(0, Number(player.stateTime ?? 0) + dt);

    if (shot.pose === "ride") {
      player.x = 208 + Math.sin(local * 2.2) * 2.2;
      player.faceVelocity = Math.sin(local * 2.4) * 0.16;
      player.bodyAngle += Math.sin(local * 2.1) * 0.002;
    } else if (shot.pose === "collapse") {
      player.x = 210 + progress * 7;
      player.curlTimer = Math.max(0.02, progress * 0.82);
      player.speed = 134 - progress * 18;
      player.trickPose = progress > 0.66 ? "wobble" : "tubeTuck";
    } else if (shot.pose === "downhill") {
      player.x = 200 + progress * 20;
      player.face = 0.48 + progress * 0.2;
      player.speed = 112 + progress * 25;
      player.compression = 0.25 + Math.sin(progress * Math.PI) * 0.55;
    } else if (shot.pose === "pump") {
      player.compression = progress < 0.58 ? 0.5 + progress * 0.85 : Math.max(0, 1 - (progress - 0.58) * 2.38);
      player.charge = Math.max(0, 1 - progress * 0.45);
      player.trickPose = progress < 0.58 ? "pumpCompress" : "pumpRelease";
      player.speed = 118 + progress * 18;
    } else if (shot.pose === "speed") {
      player.x = 206 + progress * 18;
      player.speed = 142 + Math.sin(progress * Math.PI) * 8;
      player.faceVelocity = Math.sin(local * 4.5) * 0.34;
    } else if (["launch", "hugeAir", "combo"].includes(shot.pose)) {
      const arc = Math.sin(progress * Math.PI);
      player.airX = 208 + progress * 58;
      player.airY = shot.pose === "launch" ? 96 - arc * 66 : 91 - arc * (shot.pose === "combo" ? 78 : 88);
      const turns = shot.pose === "combo" ? 1.5 : shot.pose === "hugeAir" ? 1.15 : 0.28;
      const angle = progress * Math.PI * 2 * turns;
      player.rotationAccum = angle;
      player.bodyAngle = angle;
      player.boardAngle = angle + (shot.pose === "combo" ? Math.sin(progress * Math.PI) * 0.64 : 0.04);
      player.airVY = -Math.cos(progress * Math.PI) * 92;
      player.trickPose = shot.pose === "combo" ? "boardVarial" : progress < 0.25 ? "takeoff" : progress > 0.72 ? "fall" : "apex";
    } else if (shot.pose === "land") {
      player.compression = Math.max(0.2, 1 - progress * 0.7);
      player.speed = 138 + progress * 4;
      player.x = 210 + progress * 19;
    } else if (shot.pose === "tube") {
      player.x = 202 + Math.sin(local * 1.7) * 4;
      player.speed = 132 + progress * 10;
      player.maneuver = { id: "tubeTuck", progress: 0.35 + Math.sin(progress * Math.PI) * 0.5 };
    } else if (shot.pose === "wildlife") {
      player.x = 220 + progress * 16;
      if (shot.scene === "sharkNearMiss") {
        player.airY = 78 - Math.sin(progress * Math.PI) * 19;
        player.bodyAngle = progress * Math.PI * 1.1;
        player.boardAngle = player.bodyAngle + 0.12;
      } else {
        player.speed = 116 + progress * 12;
        player.bodyAngle += Math.sin(local * 5) * 0.008;
      }
    }

    game.renderer.update(dt, simulation);
    game.audio?.update?.(simulation);
    game.renderer.render(simulation, 1);

    if (shot.pose === "result") {
      const appear = Math.min(1, progress * 3.5);
      ctx.save();
      ctx.globalAlpha = 0.9 * appear;
      ctx.fillStyle = "#07152f";
      ctx.fillRect(89, 40, 206, 133);
      ctx.strokeStyle = "#7de2d1";
      ctx.lineWidth = 3;
      ctx.strokeRect(92, 43, 200, 127);
      ctx.globalAlpha = appear;
      drawPixelText(ctx, "NEW BEST", 192, 62, { size: 3, align: "center", color: "#ffe08a", shadow: "#141d45" });
      drawPixelText(ctx, "18 420", 192, 91, { size: 5, align: "center", color: "#ffffff", shadow: "#141d45" });
      drawPixelText(ctx, "PERFECT ESCAPE", 192, 130, { size: 2, align: "center", color: "#7de2d1", shadow: "#141d45" });
      ctx.restore();
    }
  };

  const finished = new Promise((resolve, reject) => {
    recorder.addEventListener("stop", resolve, { once: true });
    recorder.addEventListener("error", (event) => reject(event.error ?? new Error("MediaRecorder failed")), { once: true });
  });

  recorder.start(500);
  startedAt = performance.now();
  enterShot(shots[0]);

  await new Promise((resolve, reject) => {
    const frame = (now) => {
      try {
        const time = Math.min(${duration}, (now - startedAt) / 1000);
        const shot = shots.find((candidate) => time >= candidate.start && time < candidate.end) ?? shots.at(-1);
        if (shot !== activeShot) enterShot(shot);
        const dt = Math.min(1 / 30, Math.max(1 / 240, (now - lastNow) / 1000));
        lastNow = now;
        const local = Math.max(0, time - shot.start);
        const progress = Math.min(1, local / Math.max(0.001, shot.end - shot.start));
        animate(shot, local, progress, dt);
        if (time >= ${duration}) {
          resolve();
          return;
        }
        requestAnimationFrame(frame);
      } catch (error) {
        reject(error);
      }
    };
    requestAnimationFrame(frame);
  });

  recorder.stop();
  await finished;
  captureStream.getTracks().forEach((track) => track.stop());
  if (audioDestination && game.audio?.master) {
    try { game.audio.master.disconnect(audioDestination); } catch {}
  }
  globalThis.__kakiHighlightBlob = new Blob(chunks, { type: mimeType });
  return {
    duration: ${duration},
    mimeType,
    size: globalThis.__kakiHighlightBlob.size,
    capturedAudio,
    audioContextState: game.audio?.context?.state ?? "unavailable",
    width: canvas.width,
    height: canvas.height,
    shotCount: shots.length,
  };
})()`, 45_000);

if (!captureMetadata?.size) throw new Error("Browser produced an empty highlight recording");

const transferChunkSize = 512 * 1024;
for (let offset = 0; offset < captureMetadata.size; offset += transferChunkSize) {
  const end = Math.min(captureMetadata.size, offset + transferChunkSize);
  const base64 = await evaluate(`(async () => {
    const bytes = new Uint8Array(await globalThis.__kakiHighlightBlob.slice(${offset}, ${end}).arrayBuffer());
    let binary = "";
    for (let index = 0; index < bytes.length; index += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + 0x8000)));
    }
    return btoa(binary);
  })()`);
  const buffer = Buffer.from(base64, "base64");
  if (offset === 0) await writeFile(sourcePath, buffer);
  else await appendFile(sourcePath, buffer);
}

socket.close();

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(`${command} exited ${code}\n${stderr}`));
      else resolve({ stdout, stderr });
    });
  });
}

const audioMap = captureMetadata.capturedAudio ? ["-map", "0:a:0"] : [];
const audioCodec = captureMetadata.capturedAudio
  ? ["-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-ar", "48000"]
  : ["-an"];
await writeFile(subtitlePath, `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Hook,DejaVu Sans,100,&H00FFFFFF,&H00FFFFFF,&H002F1507,&H5007152F,-1,0,0,0,100,100,0,0,3,7,0,8,40,40,180,1
Style: CTA,DejaVu Sans,88,&H008AE0FF,&H008AE0FF,&H002F1507,&H5007152F,-1,0,0,0,100,100,0,0,3,7,0,2,40,40,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:00.80,Hook,,0,0,0,,OUTRUN THIS!
Dialogue: 0,0:00:25.70,0:00:27.30,CTA,,0,0,0,,SURF IT NOW
`);
const filter = [
  "[0:v]split=2[background][game]",
  "[background]scale=1080:1920:force_original_aspect_ratio=increase:flags=neighbor,crop=1080:1920,gblur=sigma=34,eq=brightness=-0.28:saturation=0.82[backdrop]",
  "[game]scale=1080:608:flags=neighbor[gameframe]",
  "[backdrop][gameframe]overlay=0:656:format=auto[composite]",
  "[composite]drawbox=x=0:y=648:w=1080:h=624:color=0x7de2d1@0.72:t=8[framed]",
  `[framed]ass=filename=${subtitlePath}[vout]`,
].join(";");

await run(ffmpeg, [
  "-hide_banner", "-y",
  "-i", sourcePath,
  "-filter_complex", filter,
  "-map", "[vout]",
  ...audioMap,
  "-t", String(duration),
  "-r", "60",
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "19",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  ...audioCodec,
  outputPath,
]);

await run(ffmpeg, [
  "-hide_banner", "-y",
  "-ss", "18.2",
  "-i", outputPath,
  "-frames:v", "1",
  "-q:v", "2",
  posterPath,
]);

const probe = await run(ffprobe, [
  "-v", "error",
  "-show_entries", "format=duration,size,bit_rate:stream=index,codec_name,codec_type,width,height,r_frame_rate,pix_fmt,sample_rate,channels",
  "-of", "json",
  outputPath,
]);
const probeJson = JSON.parse(probe.stdout);
const video = probeJson.streams?.find((stream) => stream.codec_type === "video");
const audio = probeJson.streams?.find((stream) => stream.codec_type === "audio");
const measuredDuration = Number(probeJson.format?.duration);
if (video?.codec_name !== "h264" || video.width !== 1080 || video.height !== 1920) {
  throw new Error(`Unexpected final video stream: ${JSON.stringify(video)}`);
}
if (Math.abs(measuredDuration - duration) > 0.12) {
  throw new Error(`Expected ${duration}s, ffprobe measured ${measuredDuration}s`);
}
if (captureMetadata.capturedAudio && audio?.codec_name !== "aac") {
  throw new Error(`Expected AAC game audio, received ${JSON.stringify(audio)}`);
}

const report = {
  generatedAt: new Date().toISOString(),
  source: captureMetadata,
  final: probeJson,
};
await writeFile(probePath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  outputPath,
  posterPath,
  probePath,
  captureMetadata,
  final: {
    duration: measuredDuration,
    size: Number(probeJson.format?.size),
    bitRate: Number(probeJson.format?.bit_rate),
    videoCodec: video.codec_name,
    dimensions: `${video.width}x${video.height}`,
    frameRate: video.r_frame_rate,
    pixelFormat: video.pix_fmt,
    audioCodec: audio?.codec_name ?? null,
    audioChannels: audio?.channels ?? null,
  },
}, null, 2));
