#!/usr/bin/env node

import { copyFile, mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = parseArgs(process.argv.slice(2));
const inputPath = path.resolve(required(args, "input"));
const outputPath = path.resolve(required(args, "output"));
const prompt = required(args, "prompt");
const comfyUrl = String(args.comfy ?? process.env.COMFY_URL ?? "http://127.0.0.1:8190").replace(/\/$/, "");
const comfyInput = path.resolve(args["comfy-input"] ?? process.env.COMFY_INPUT ?? "/home/nemoclaw/ComfyUI/input");
const width = boundedInteger(args.width, 1024, 256, 2048);
const height = boundedInteger(args.height, 576, 256, 2048);
const steps = boundedInteger(args.steps, 14, 1, 50);
const seed = boundedInteger(args.seed, 0x4b414b49, 0, Number.MAX_SAFE_INTEGER);
const cfg = boundedNumber(args.cfg, 2.5, 0.1, 20);
const virtualVram = boundedNumber(args["virtual-vram"], 6, 0, 64);
const jobName = `_kaki_qwen_${Date.now()}_${seed}.png`;
const stagedInput = path.join(comfyInput, jobName);

await mkdir(comfyInput, { recursive: true });
await mkdir(path.dirname(outputPath), { recursive: true });
await copyFile(inputPath, stagedInput);

try {
  const workflow = buildWorkflow({ jobName, prompt, width, height, steps, seed, cfg, virtualVram });
  const queued = await requestJson(`${comfyUrl}/prompt`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!queued.prompt_id) throw new Error(`ComfyUI did not return a prompt id: ${JSON.stringify(queued)}`);
  const result = await waitForResult(comfyUrl, queued.prompt_id);
  const image = result?.outputs?.["10"]?.images?.[0];
  if (!image?.filename) throw new Error("Qwen Edit completed without a saved image");
  const query = new URLSearchParams({
    filename: image.filename,
    subfolder: image.subfolder ?? "",
    type: image.type ?? "output",
  });
  const response = await fetch(`${comfyUrl}/view?${query}`);
  if (!response.ok) throw new Error(`Could not fetch ComfyUI output: HTTP ${response.status}`);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  console.log(JSON.stringify({ output: outputPath, promptId: queued.prompt_id, width, height, steps, cfg, seed }));
} finally {
  await unlink(stagedInput).catch(() => {});
}

function buildWorkflow({ jobName, prompt, width, height, steps, seed, cfg, virtualVram }) {
  return {
    "1": {
      class_type: "UnetLoaderGGUFDisTorch2MultiGPU",
      inputs: {
        unet_name: "Qwen-Image-Edit-2509-Q4_K_M.gguf",
        compute_device: "cuda:0",
        virtual_vram_gb: virtualVram,
        donor_device: "cpu",
        eject_models: true,
      },
    },
    "2": {
      class_type: "CLIPLoaderGGUFMultiGPU",
      inputs: {
        clip_name: "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",
        type: "qwen_image",
        device: "cpu",
      },
    },
    "3": { class_type: "VAELoader", inputs: { vae_name: "qwen_image_vae.safetensors" } },
    "4": { class_type: "LoadImage", inputs: { image: jobName } },
    "5": {
      class_type: "TextEncodeQwenImageEditPlus",
      inputs: { clip: ["2", 0], vae: ["3", 0], image1: ["4", 0], prompt },
    },
    "6": { class_type: "ConditioningZeroOut", inputs: { conditioning: ["5", 0] } },
    "7": { class_type: "EmptySD3LatentImage", inputs: { width, height, batch_size: 1 } },
    "8": {
      class_type: "KSampler",
      inputs: {
        model: ["1", 0], seed, steps, cfg,
        sampler_name: "euler", scheduler: "simple",
        positive: ["5", 0], negative: ["6", 0], latent_image: ["7", 0], denoise: 1,
      },
    },
    "9": { class_type: "VAEDecode", inputs: { samples: ["8", 0], vae: ["3", 0] } },
    "10": { class_type: "SaveImage", inputs: { images: ["9", 0], filename_prefix: jobName.replace(/\.png$/i, "") } },
  };
}

async function waitForResult(baseUrl, promptId) {
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const history = await requestJson(`${baseUrl}/history/${encodeURIComponent(promptId)}`);
    const result = history[promptId];
    if (result) {
      if (result.status?.status_str === "error") {
        throw new Error(`ComfyUI execution failed: ${JSON.stringify(result.status)}`);
      }
      if (result.outputs?.["10"]?.images?.length) return result;
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error("Timed out waiting for Qwen Edit");
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const key = values[index];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    const value = values[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${key}`);
    parsed[key.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function required(values, name) {
  const value = String(values[name] ?? "").trim();
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function boundedInteger(value, fallback, minimum, maximum) {
  return Math.round(boundedNumber(value, fallback, minimum, maximum));
}

function boundedNumber(value, fallback, minimum, maximum) {
  const number = Number(value);
  return Math.min(maximum, Math.max(minimum, Number.isFinite(number) ? number : fallback));
}
