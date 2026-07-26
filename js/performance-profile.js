export const QUALITY_MODES = Object.freeze(["auto", "full", "mobile"]);

export const QUALITY_PROFILES = Object.freeze({
  full: Object.freeze({
    id: "full",
    particleScale: 1,
    renderFarTraffic: true,
  }),
  mobile: Object.freeze({
    id: "mobile",
    particleScale: 0.5,
    renderFarTraffic: false,
  }),
});

const SLOW_FRAME_SECONDS = 1 / 45;
const PRESSURE_LIMIT_SECONDS = 0.9;
const PRESSURE_RECOVERY_RATE = 0.45;
const MAX_OBSERVED_FRAME_SECONDS = 0.1;

export function normalizeQualityMode(value) {
  return QUALITY_MODES.includes(value) ? value : "auto";
}

export function resolveQualityProfile(mode, { mobilePreferred = false } = {}) {
  const normalized = normalizeQualityMode(mode);
  if (normalized === "mobile" || (normalized === "auto" && mobilePreferred)) {
    return QUALITY_PROFILES.mobile;
  }
  return QUALITY_PROFILES.full;
}

export function scaledVisualCount(count, profile = QUALITY_PROFILES.full, reducedScale = 1) {
  const source = Math.max(0, Math.round(Number(count) || 0));
  if (source === 0) return 0;
  const qualityScale = Number(profile?.particleScale) || 1;
  const motionScale = Math.max(0, Number(reducedScale) || 0);
  return Math.max(1, Math.round(source * qualityScale * motionScale));
}

/**
 * Auto begins in Mobile on compact touch hardware and can make one session-only
 * downgrade after sustained missed frames. It never changes simulation timing.
 */
export class AdaptiveQualityProfile {
  constructor({ requested = "auto", mobilePreferred = false } = {}) {
    this.requested = normalizeQualityMode(requested);
    this.mobilePreferred = Boolean(mobilePreferred);
    this.profile = resolveQualityProfile(this.requested, {
      mobilePreferred: this.mobilePreferred,
    });
    this.pressure = 0;
    this.adapted = false;
  }

  setRequested(requested, { mobilePreferred = this.mobilePreferred } = {}) {
    const previous = this.profile.id;
    this.requested = normalizeQualityMode(requested);
    this.mobilePreferred = Boolean(mobilePreferred);
    this.profile = resolveQualityProfile(this.requested, {
      mobilePreferred: this.mobilePreferred,
    });
    this.pressure = 0;
    this.adapted = false;
    return this.profile.id !== previous;
  }

  observeFrame(deltaSeconds, { active = true, visible = true } = {}) {
    if (!active || !visible || this.requested !== "auto" || this.profile.id === "mobile") {
      this.pressure = 0;
      return false;
    }
    const delta = Math.min(
      MAX_OBSERVED_FRAME_SECONDS,
      Math.max(0, Number(deltaSeconds) || 0),
    );
    if (delta >= SLOW_FRAME_SECONDS) {
      this.pressure += delta;
    } else {
      this.pressure = Math.max(0, this.pressure - delta * PRESSURE_RECOVERY_RATE);
    }
    if (this.pressure < PRESSURE_LIMIT_SECONDS) return false;
    this.profile = QUALITY_PROFILES.mobile;
    this.pressure = 0;
    this.adapted = true;
    return true;
  }

  snapshot() {
    return Object.freeze({
      requested: this.requested,
      resolved: this.profile.id,
      mobilePreferred: this.mobilePreferred,
      adapted: this.adapted,
      pressure: this.pressure,
    });
  }
}
