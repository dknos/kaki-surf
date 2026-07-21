import { clamp, smoothstep } from "./math.js";
import {
  DEFAULT_WAVE_STYLE_ID,
  LOGICAL_WIDTH,
  TUNING,
  WAVE_STYLES,
} from "./config.js";

export function resolveWaveStyle(profile = DEFAULT_WAVE_STYLE_ID) {
  const id = typeof profile === "string" ? profile : profile?.id;
  return WAVE_STYLES[id] ?? WAVE_STYLES[DEFAULT_WAVE_STYLE_ID];
}

export function contactX(wave) {
  const curl = Number(wave?.curlX);
  const profile = resolveWaveStyle(wave?.profile ?? wave?.profileId);
  const offset = Number(profile.pocket.contactOffset);
  return (Number.isFinite(curl) ? curl : 0) + (Number.isFinite(offset) ? offset : 13);
}

/**
 * Side-effect-free section sample shared by gameplay QA and the renderer.
 * Callers may provide `out` to avoid allocating during a render loop.
 */
export function sampleWaveSection(wave, playerX = contactX(wave), out = {}) {
  const profile = resolveWaveStyle(wave?.profile ?? wave?.profileId);
  const barrel = profile.barrel;
  const pressure = clamp(Number(wave?.pressure) || 0, 0, 1);
  const x = Number.isFinite(Number(playerX)) ? Number(playerX) : contactX(wave);
  const curl = Number.isFinite(Number(wave?.curlX)) ? Number(wave.curlX) : 0;
  const gap = x - (profile.pocket.contactOrigin ? contactX(wave) : curl);
  const pocket = typeof wave?.pocketRisk === "function"
    ? clamp(Number(wave.pocketRisk(x)) || 0, 0, 1)
    : pocketRiskForProfile(profile, gap);
  const thresholds = barrel.stageThresholds;
  let stageIndex = 0;
  while (stageIndex < thresholds.length && pressure >= thresholds[stageIndex]) stageIndex += 1;
  const stageStart = stageIndex === 0 ? 0 : thresholds[stageIndex - 1];
  const stageEnd = stageIndex < thresholds.length ? thresholds[stageIndex] : 1;
  const growth = smoothstep(barrel.growStart, barrel.growEnd, pressure);
  const closure = smoothstep(barrel.closeStart, barrel.closeEnd, pressure);
  const apertureGrowth = smoothstep(barrel.apertureStart, barrel.apertureFull, pressure);
  const aperture = apertureGrowth * (1 - closure * (1 - barrel.closedAperture));

  out.profileId = profile.id;
  out.renderer = profile.renderer;
  out.heroBarrel = profile.renderer === "heroBarrel";
  out.stage = barrel.stageNames[stageIndex];
  out.stageIndex = stageIndex;
  out.stageMix = smoothstep(stageStart, stageEnd, pressure);
  out.pressure = pressure;
  out.growth = growth;
  out.closure = closure;
  out.aperture = aperture;
  out.curlX = curl;
  out.contactX = contactX(wave);
  out.playerX = x;
  out.gap = gap;
  out.pocket = pocket;
  out.outerRadiusX = mixRange(barrel.outerRadiusX, growth);
  out.outerRadiusY = mixRange(barrel.outerRadiusY, growth);
  out.apertureRadiusX = mixRange(barrel.apertureRadiusX, aperture);
  out.apertureRadiusY = mixRange(barrel.apertureRadiusY, aperture);
  out.lipDrop = mixRange(barrel.lipDrop, growth);
  out.shoulderReach = mixRange(barrel.shoulderReach, growth);
  return out;
}

/**
 * Three-quarter presentation projection. At `focusFace` it is exactly the
 * canonical ride surface, so the player, board tangent, contact gap, landing,
 * and scoring stay aligned while the rest of the face fans into depth.
 */
export function projectWavePoint(wave, x, face, focusFace = face, out = {}) {
  const profile = resolveWaveStyle(wave?.profile ?? wave?.profileId);
  const projection = profile.projection;
  const sampleX = Number.isFinite(Number(x)) ? Number(x) : 0;
  const sampleFace = Number.isFinite(Number(face)) ? Number(face) : 0;
  const anchorFace = Number.isFinite(Number(focusFace)) ? Number(focusFace) : sampleFace;
  const depthDelta = easedFace(profile, sampleFace) - easedFace(profile, anchorFace);
  const contact = contactX(wave);
  const fan = clamp((sampleX - contact) / Math.max(1, LOGICAL_WIDTH - contact), 0, 1);
  const canonicalY = typeof wave?.ridingY === "function"
    ? wave.ridingY(sampleX, sampleFace)
    : 0;

  out.x = sampleX + depthDelta * (projection.depthShear + projection.fanShear * fan);
  out.y = canonicalY + depthDelta * (projection.depthDrop + projection.fanDrop * fan);
  out.depth = easedFace(profile, sampleFace);
  return out;
}

export class GameplayWave {
  constructor(seed = 0x4b414b49, profile = DEFAULT_WAVE_STYLE_ID) {
    this.seed = 0;
    this.phaseA = 0;
    this.phaseB = 0;
    this.profile = WAVE_STYLES[DEFAULT_WAVE_STYLE_ID];
    this.profileId = this.profile.id;
    this.curlWorldX = 0;
    Object.defineProperty(this, "curlX", {
      enumerable: true,
      get: () => this.curlWorldX,
      set: (value) => { this.curlWorldX = Number(value) || 0; },
    });
    this.reset(seed, profile);
  }

  setProfile(profile = DEFAULT_WAVE_STYLE_ID) {
    this.profile = resolveWaveStyle(profile);
    this.profileId = this.profile.id;
    return this.profile;
  }

  reset(seed = this.seed, profile = this.profile) {
    this.setProfile(profile);
    this.seed = Number.isFinite(seed) ? seed >>> 0 : this.seed >>> 0;
    this.phaseA = ((this.seed >>> 4) & 255) / 255 * Math.PI * 2;
    this.phaseB = ((this.seed >>> 12) & 255) / 255 * Math.PI * 2;
    this.time = 0;
    this.travel = 0;
    this.worldTravel = 0;
    const initialCurlX = Number(this.profile.threat?.initialCurlX);
    this.curlWorldX = Number.isFinite(initialCurlX) ? initialCurlX : 48;
    this.pressure = 0;
  }

  update(dt, speed, curlSpeed, signedSpeed = speed, threat = null) {
    this.time += dt;
    this.travel += speed * dt;
    this.worldTravel += (Number.isFinite(signedSpeed) ? signedSpeed : speed) * dt;

    if (threat && Number.isFinite(threat.playerX)) {
      const threatProfile = this.profile.threat;
      const temporalPressure = smoothstep(0, TUNING.curlRampEnd, this.time);
      const threatOrigin = threatProfile.contactOrigin ? this.contactX() : this.curlX;
      const gap = threat.playerX - threatOrigin;
      const proximityPressure = 1 - smoothstep(
        threatProfile.proximityNearGap,
        threatProfile.proximityFarGap,
        gap,
      );
      this.pressure = clamp(
        Math.max(temporalPressure * threatProfile.temporalPressureScale, proximityPressure),
        0,
        1,
      );

      if (threat.active !== false) {
        const paceScale = clamp(
          (Number.isFinite(curlSpeed) ? curlSpeed : TUNING.curlSpeed) / TUNING.curlSpeed,
          0.25,
          2.5,
        );
        if (this.time <= TUNING.curlGrace) {
          const openingSpeed = Math.max(0, Number(threatProfile.openingSpeed) || 0);
          const openingRamp = smoothstep(0.35, 1.5, this.time);
          this.curlX += openingSpeed * paceScale * openingRamp * dt;
          return;
        }
        const escalation = smoothstep(TUNING.curlGrace, TUNING.curlRampEnd, this.time);
        const skill = clamp(Number(threat.skillMomentum) || 0, 0, 1);
        const speedRelief = smoothstep(
          TUNING.curlReliefSpeedStart,
          TUNING.curlReliefSpeedEnd,
          Number(threat.speed) || 0,
        );
        const relief = clamp(
          skill * TUNING.curlSkillRelief + speedRelief * TUNING.curlSpeedRelief,
          0,
          Number.isFinite(threatProfile.maxRelief)
            ? threatProfile.maxRelief
            : TUNING.curlMaxRelief,
        );
        const maximumThreatSpeed = Number.isFinite(threatProfile.maxSpeed)
          ? threatProfile.maxSpeed
          : TUNING.curlThreatMaxSpeed;
        const advance = maximumThreatSpeed * paceScale * escalation * (1 - relief);
        // The threat can slow when Kaki surfs well, but it never moves backward
        // merely because the rider reverses direction.
        this.curlX += Math.max(0, advance) * dt;
      }
      return;
    }

    // Keep the standalone/legacy wave API stable for visual and unit probes.
    const pulse = Math.sin(this.time * 0.44 + this.phaseB) * 0.22;
    this.curlX += (curlSpeed + pulse) * dt;
    this.pressure = smoothstep(0, 72, this.time);
  }

  crestY(x) {
    const surface = this.profile.surface;
    const broad = Math.sin(
      x * surface.broadXFrequency
        + this.travel * surface.broadTravelFrequency
        + this.phaseA,
    ) * surface.broadAmplitude;
    const detail = Math.sin(
      x * surface.detailXFrequency
        - this.time * surface.detailTimeFrequency
        + this.phaseB,
    ) * surface.detailAmplitude;
    return surface.crestBase + broad + detail;
  }

  faceDepth(x) {
    const surface = this.profile.surface;
    return surface.faceDepthBase
      + Math.sin(x * surface.faceDepthXFrequency + this.phaseB) * surface.faceDepthAmplitude;
  }

  ridingY(x, face) {
    return this.crestY(x) + easedFace(this.profile, face) * this.faceDepth(x);
  }

  /**
   * Returns the normalized face coordinate of the sustainable power seam.
   * This is the canonical query for both physics and presentation; callers
   * must never recreate the line with a separate visual-only formula.
   */
  powerFaceAt(x) {
    const power = this.profile.power;
    const broad = Math.sin(
      x * power.broadXFrequency
        + this.phaseA
        + this.travel * power.broadTravelFrequency,
    ) * power.broadAmplitude;
    const pulse = Math.sin(
      x * power.pulseXFrequency
        - this.time * power.pulseTimeFrequency
        + this.phaseB,
    ) * power.pulseAmplitude;
    const pressureLift = (clamp(this.pressure, 0, 1) - 0.5) * power.pressureShift;
    return clamp(power.baseFace + broad + pulse + pressureLift, power.minFace, power.maxFace);
  }

  /**
   * Side-effect-free description of the acceleration available at a point on
   * the wave. Positive correction means carve down the face (positive input
   * y); negative correction means carve up toward the lip.
   */
  speedPotential(playerX, face, options = {}) {
    const x = Number.isFinite(playerX) ? playerX : 0;
    const currentFace = Number.isFinite(face) ? face : 0.5;
    const targetFace = this.powerFaceAt(x);
    const error = currentFace - targetFace;
    const absoluteError = Math.abs(error);
    const correction = Math.sign(targetFace - currentFace);
    const pocket = this.pocketRisk(x);
    const pressure = clamp(this.pressure, 0, 1);
    const breaking = Boolean(options.breaking ?? this.curlContact(x));

    // Keep broad guidance readable while letting the simulation's surface
    // gradient, rather than a narrow seam, own ordinary top-end drive.
    const lineQuality = 1 - smoothstep(0.035, 0.27, absoluteError);
    const pocketDrive = 0.34 + smoothstep(0.06, 0.68, pocket) * 0.66;
    const criticalLoss = smoothstep(0.76, 1, pocket) * 0.38;
    const sustainablePocket = clamp(pocketDrive - criticalLoss, 0.24, 1);
    const seamCore = 1 - smoothstep(0.025, 0.115, absoluteError);
    const sustainableBand = smoothstep(0.16, 0.34, pocket)
      * (1 - smoothstep(0.68, 0.82, pocket))
      * Number(!breaking);
    const seamDrive = clamp(seamCore * sustainableBand, 0, 1);
    const pressureContribution = 0.78 + pressure * 0.22;
    const breakingContribution = breaking ? 0.72 : 1;

    const board = options.board ?? null;
    const boardPump = clamp(Number(board?.pump ?? 1), 0.65, 1.35);
    const boardAcceleration = clamp(Number(board?.acceleration ?? 1), 0.65, 1.35);
    const pumpCharge = clamp(Number(options.pumpCharge ?? 0), 0, 1);
    const faceVelocity = clamp(Math.abs(Number(options.faceVelocity ?? 0)), 0, 1.5);
    const movementTiming = 0.78 + Math.min(0.22, faceVelocity * 0.2);
    const pumpAccess = clamp(
      lineQuality * sustainablePocket * 0.58 + seamDrive * 0.24 + pocketDrive * 0.18,
      0,
      1,
    );
    const pumpEfficiency = clamp(
      pumpAccess * (0.62 + pumpCharge * 0.38) * movementTiming * boardPump,
      0,
      1,
    );
    const pumpContribution = options.pumpReleased
      ? 0.82 + pumpEfficiency * 0.28
      : 1;

    const potential = clamp(
      lineQuality * 0.55
        + sustainablePocket * 0.22
        + pressure * 0.13
        + seamDrive * 0.1,
      0,
      1,
    );
    // The readable line is useful, but it is no longer a permission gate for
    // ordinary speed. Geometry-derived downhill drive is applied by the
    // simulation; this query supplies only a broad local-wave contribution.
    const acceleration = clamp(
      (0.46 + lineQuality * 0.24 + sustainablePocket * 0.16 + seamDrive * 0.08 + pressure * 0.08)
        * pressureContribution
        * breakingContribution
        * pumpContribution
        * (0.84 + boardAcceleration * 0.16),
      0.32,
      1.12,
    );
    const risk = clamp(
      pocket * 0.78
        + smoothstep(0.72, 1.04, currentFace) * 0.12
        + (breaking ? 0.18 : 0),
      0,
      1,
    );
    const zone = breaking || pocket >= 0.78
      ? "critical"
      : absoluteError <= 0.12 && pocket >= 0.16
        ? "power"
        : "safe";

    return {
      targetFace,
      error,
      correction,
      zone,
      risk,
      pocket,
      pressure,
      breaking,
      lineQuality,
      seamDrive,
      maxFlowEligible: seamDrive >= 0.85,
      potential,
      pumpEfficiency,
      acceleration,
      pressureContribution,
      breakingContribution,
    };
  }

  slopeAt(x, face = 0.25) {
    const epsilon = 2;
    return Math.atan2(
      this.ridingY(x + epsilon, face) - this.ridingY(x - epsilon, face),
      epsilon * 2,
    );
  }

  /**
   * Side-effect-free gradient of the ride surface at one point. Both
   * derivatives use the same current wave state, so animated wave motion does
   * not inject energy into the rider. Simulation projects signed rider motion
   * through this gradient to distinguish downhill, traverse, and uphill travel.
   */
  surfaceGradientAt(x, face = 0.25) {
    const sampleX = Number.isFinite(x) ? x : 0;
    const sampleFace = Number.isFinite(face) ? face : 0.25;
    const epsilonX = 2;
    const epsilonFace = 1 / 512;
    const lowFace = clamp(sampleFace - epsilonFace, -0.06, 1.36);
    const highFace = clamp(sampleFace + epsilonFace, -0.06, 1.36);
    return {
      x: (
        this.ridingY(sampleX + epsilonX, sampleFace)
        - this.ridingY(sampleX - epsilonX, sampleFace)
      ) / (epsilonX * 2),
      face: (
        this.ridingY(sampleX, highFace)
        - this.ridingY(sampleX, lowFace)
      ) / Math.max(Number.EPSILON, highFace - lowFace),
    };
  }

  pocketRisk(playerX) {
    const origin = this.profile.pocket.contactOrigin ? this.contactX() : this.curlX;
    const distance = playerX - origin;
    return pocketRiskForProfile(this.profile, distance);
  }

  curlContact(playerX) {
    return playerX <= this.contactX();
  }

  contactX() {
    return contactX(this);
  }

  sectionState(playerX, out = {}) {
    return sampleWaveSection(this, playerX, out);
  }
}

function easedFace(profile, face) {
  const value = Number.isFinite(Number(face)) ? Number(face) : 0;
  const surface = profile.surface;
  return value * (surface.faceEaseLinear + value * surface.faceEaseQuadratic);
}

function pocketRiskForProfile(profile, distance) {
  const pocket = profile.pocket;
  return clamp(1 - (distance - pocket.nearOffset) / pocket.span, 0, 1);
}

function mixRange(range, amount) {
  return range[0] + (range[1] - range[0]) * clamp(amount, 0, 1);
}
