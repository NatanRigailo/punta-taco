/**
 * Pedal calibration: turning a raw axis reading into 0..1 of the user's actual
 * travel.
 *
 * This is the step that makes every later metric meaningful. Without it the app
 * would compare a load cell measuring force against a potentiometer measuring
 * travel, on axes that may run backwards, over ranges that never reach the
 * browser's nominal -1..1. So calibration is expressed entirely relative to two
 * observed points — where the pedal rests, and how far the user can actually
 * push it — and absolute raw values are never compared across devices.
 */

import { readAxis } from "./devices.js";

/** @typedef {import("./mapping.js").PedalRole} PedalRole */

/**
 * @typedef {object} Calibration
 * @property {number} restRaw     Raw value with the pedal released.
 * @property {number} pressedRaw  Raw value at full press. May be below restRaw
 *                                on an inverted axis — that is handled by the
 *                                subtraction in `normalise`, not by a flag.
 * @property {number} deadzone    Fraction of travel, 0..1, treated as zero.
 * @property {number} restNoise   Peak-to-peak raw noise seen at rest, kept so
 *                                the diagnostic can explain the deadzone.
 */

/** Minimum raw travel for a calibration to be trustworthy. */
const MIN_TRAVEL_RAW = 0.3;

/** Deadzone bounds, as a fraction of calibrated travel. */
const MIN_DEADZONE = 0.004;
const MAX_DEADZONE = 0.06;

/** @type {Map<PedalRole, Calibration>} */
const calibrations = new Map();

/** @type {Set<(role: PedalRole) => void>} */
const listeners = new Set();

/**
 * @param {(role: PedalRole) => void} fn
 * @returns {() => void} Unsubscribe.
 */
export function onCalibrationChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {PedalRole} role
 * @param {Calibration} calibration
 */
export function setCalibration(role, calibration) {
  calibrations.set(role, calibration);
  for (const fn of listeners) fn(role);
}

/**
 * @param {PedalRole} role
 * @returns {Calibration | null}
 */
export function calibrationFor(role) {
  return calibrations.get(role) ?? null;
}

/**
 * @param {PedalRole} role
 * @returns {boolean}
 */
export function isCalibrated(role) {
  return calibrations.has(role);
}

/** @param {PedalRole} role */
export function clearCalibration(role) {
  if (calibrations.delete(role)) {
    for (const fn of listeners) fn(role);
  }
}

/**
 * Maps a raw axis reading onto 0..1 of calibrated travel.
 *
 * Inversion needs no special case: `pressedRaw - restRaw` is negative on an
 * inverted axis, and dividing by it flips the sense of the numerator too.
 *
 * @param {Calibration} calibration
 * @param {number} raw
 * @returns {number} Clamped to 0..1.
 */
export function normalise(calibration, raw) {
  const span = calibration.pressedRaw - calibration.restRaw;
  if (span === 0) return 0;

  const t = (raw - calibration.restRaw) / span;
  if (t <= calibration.deadzone) return 0;
  if (t >= 1) return 1;

  // Rescale so the pedal still reaches a true 1 after the deadzone is removed;
  // otherwise the top of the travel would be unreachable by exactly the
  // deadzone amount.
  return (t - calibration.deadzone) / (1 - calibration.deadzone);
}

/**
 * @typedef {object} CaptureOptions
 * @property {number} [restMs]    Time observing the released pedal. Default 1200.
 * @property {number} [sweepMs]   Time observing full-travel presses. Default 5000.
 * @property {number} [pollMs]    Sampling period. Default 16.
 * @property {(phase: "rest" | "sweep", remainingMs: number) => void} [onPhase]
 */

/**
 * Guided capture: observe the pedal at rest, then observe the user working the
 * full travel, and derive the calibration from what was actually seen.
 *
 * The rest phase does double duty — it fixes the zero point and measures the
 * noise floor, which is what sizes the deadzone. A device with a clean axis
 * gets almost no deadzone; a noisy one gets exactly as much as it needs.
 *
 * @param {number} deviceIndex
 * @param {number} axis
 * @param {CaptureOptions} [options]
 * @returns {Promise<Calibration>}
 */
export function captureCalibration(deviceIndex, axis, options = {}) {
  const restMs = options.restMs ?? 1200;
  const sweepMs = options.sweepMs ?? 5000;
  const pollMs = options.pollMs ?? 16;
  const onPhase = options.onPhase;

  return new Promise((resolve, reject) => {
    /** @type {number[]} */
    const restSamples = [];
    /** @type {number[]} */
    const sweepSamples = [];

    const started = performance.now();

    const sample = () => {
      const now = performance.now();
      const elapsed = now - started;
      const raw = readAxis(deviceIndex, axis);

      if (raw === null) {
        reject(new Error("dispositivo desconectado durante a calibração"));
        return;
      }

      if (elapsed < restMs) {
        restSamples.push(raw);
        if (onPhase) onPhase("rest", restMs - elapsed);
      } else if (elapsed < restMs + sweepMs) {
        sweepSamples.push(raw);
        if (onPhase) onPhase("sweep", restMs + sweepMs - elapsed);
      } else {
        finish(resolve, reject, restSamples, sweepSamples);
        return;
      }

      setTimeout(sample, pollMs);
    };

    sample();
  });
}

/**
 * @param {(c: Calibration) => void} resolve
 * @param {(e: Error) => void} reject
 * @param {number[]} restSamples
 * @param {number[]} sweepSamples
 */
function finish(resolve, reject, restSamples, sweepSamples) {
  if (restSamples.length === 0 || sweepSamples.length === 0) {
    reject(new Error("não foi possível ler o eixo durante a calibração"));
    return;
  }

  let restSum = 0;
  let restMin = Number.POSITIVE_INFINITY;
  let restMax = Number.NEGATIVE_INFINITY;
  for (const v of restSamples) {
    restSum += v;
    if (v < restMin) restMin = v;
    if (v > restMax) restMax = v;
  }
  const restRaw = restSum / restSamples.length;
  const restNoise = restMax - restMin;

  // Full press is whichever extreme of the sweep sits farthest from rest. That
  // single rule covers both axis directions without asking the user anything.
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  for (const v of sweepSamples) {
    if (v < lowest) lowest = v;
    if (v > highest) highest = v;
  }
  const pressedRaw = highest - restRaw >= restRaw - lowest ? highest : lowest;
  const travel = Math.abs(pressedRaw - restRaw);

  if (travel < MIN_TRAVEL_RAW) {
    reject(
      new Error(
        `curso capturado de apenas ${(travel / 2 * 100).toFixed(0)}% — pressione o pedal até o fundo`,
      ),
    );
    return;
  }

  // Deadzone covers the observed noise with margin, expressed as a fraction of
  // the travel that was actually captured.
  const noiseFraction = restNoise / travel;
  const deadzone = Math.min(MAX_DEADZONE, Math.max(MIN_DEADZONE, noiseFraction * 1.5));

  resolve({ restRaw, pressedRaw, deadzone, restNoise });
}

/**
 * Calibrated 0..1 reading, or null when the pedal is unmapped, uncalibrated or
 * disconnected.
 *
 * @param {PedalRole} role
 * @param {number | null} raw
 * @returns {number | null}
 */
export function normaliseFor(role, raw) {
  if (raw === null) return null;
  const cal = calibrations.get(role);
  return cal ? normalise(cal, raw) : null;
}

/**
 * Human-readable summary for the UI and, later, the hardware profile.
 *
 * @param {Calibration} calibration
 * @returns {{ travelPct: number, deadzonePct: number, inverted: boolean, restNoisePct: number }}
 */
export function describeCalibration(calibration) {
  const span = calibration.pressedRaw - calibration.restRaw;
  const travel = Math.abs(span);
  return {
    // Raw axes span 2.0 (-1..1), so travel is reported against that.
    travelPct: (travel / 2) * 100,
    deadzonePct: calibration.deadzone * 100,
    inverted: span < 0,
    restNoisePct: travel === 0 ? 0 : (calibration.restNoise / travel) * 100,
  };
}
