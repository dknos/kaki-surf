import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_SETTINGS } from "../js/config.js";
import {
  AdaptiveQualityProfile,
  QUALITY_PROFILES,
  normalizeQualityMode,
  resolveQualityProfile,
  scaledVisualCount,
} from "../js/performance-profile.js";
import { sanitizeSettings } from "../js/persistence.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Auto selects Mobile for touch hardware while explicit choices remain stable", () => {
  assert.equal(normalizeQualityMode("broken"), "auto");
  assert.equal(resolveQualityProfile("auto").id, "full");
  assert.equal(resolveQualityProfile("auto", { mobilePreferred: true }).id, "mobile");
  assert.equal(resolveQualityProfile("full", { mobilePreferred: true }).id, "full");
  assert.equal(resolveQualityProfile("mobile").id, "mobile");
});

test("Mobile scales cosmetic counts without removing readable effects", () => {
  assert.equal(scaledVisualCount(12, QUALITY_PROFILES.full), 12);
  assert.equal(scaledVisualCount(12, QUALITY_PROFILES.mobile), 6);
  assert.equal(scaledVisualCount(1, QUALITY_PROFILES.mobile), 1);
  assert.equal(scaledVisualCount(12, QUALITY_PROFILES.mobile, 0.5), 3);
  assert.equal(scaledVisualCount(0, QUALITY_PROFILES.mobile), 0);
});

test("Auto makes one session-only downgrade after sustained slow frames", () => {
  const quality = new AdaptiveQualityProfile({ requested: "auto" });
  let changed = false;
  for (let frame = 0; frame < 40 && !changed; frame += 1) {
    changed = quality.observeFrame(1 / 30);
  }

  assert.equal(changed, true);
  assert.deepEqual(quality.snapshot(), {
    requested: "auto",
    resolved: "mobile",
    mobilePreferred: false,
    adapted: true,
    pressure: 0,
  });
  assert.equal(quality.observeFrame(1 / 60), false, "the resolved profile does not oscillate");
});

test("Auto ignores paused/hidden frames and recovers from isolated pressure", () => {
  const quality = new AdaptiveQualityProfile({ requested: "auto" });
  for (let frame = 0; frame < 20; frame += 1) {
    quality.observeFrame(1 / 30, { active: false });
    quality.observeFrame(1 / 30, { visible: false });
  }
  assert.equal(quality.snapshot().pressure, 0);

  quality.observeFrame(1 / 30);
  const pressured = quality.snapshot().pressure;
  for (let frame = 0; frame < 8; frame += 1) quality.observeFrame(1 / 60);
  assert.ok(quality.snapshot().pressure < pressured);
  assert.equal(quality.snapshot().resolved, "full");
});

test("Full never adapts and changing a setting resets the session profile", () => {
  const quality = new AdaptiveQualityProfile({ requested: "full", mobilePreferred: true });
  for (let frame = 0; frame < 120; frame += 1) quality.observeFrame(1 / 20);
  assert.equal(quality.snapshot().resolved, "full");
  assert.equal(quality.snapshot().adapted, false);

  assert.equal(quality.setRequested("mobile"), true);
  assert.equal(quality.snapshot().resolved, "mobile");
  assert.equal(quality.snapshot().adapted, false);
});

test("quality settings remain backward-compatible with v1 saves", () => {
  assert.equal(DEFAULT_SETTINGS.qualityMode, "auto");
  assert.equal(sanitizeSettings({ qualityMode: "mobile" }).qualityMode, "mobile");
  assert.equal(sanitizeSettings({ qualityMode: "full" }).qualityMode, "full");
  assert.equal(sanitizeSettings({ qualityMode: "invalid" }).qualityMode, "auto");
  assert.equal(sanitizeSettings({}).qualityMode, "auto");
});

test("runtime wiring keeps the Mobile profile presentation-only", () => {
  const game = readFileSync(path.join(ROOT, "js", "game.js"), "utf8");
  const renderer = readFileSync(path.join(ROOT, "js", "renderer.js"), "utf8");
  const styles = readFileSync(path.join(ROOT, "styles.css"), "utf8");

  assert.match(game, /data-setting="qualityMode"/);
  assert.match(game, /this\.qualityProfile\.observeFrame\(frameDelta/);
  assert.match(game, /quality:\s*this\.qualityProfile\.snapshot\(\)/);
  assert.match(renderer, /this\.qualityProfile\.renderFarTraffic/);
  assert.match(renderer, /scaledVisualCount/);
  assert.match(styles, /\[data-quality-profile="mobile"\][\s\S]*?backdrop-filter:\s*none;/);
});
