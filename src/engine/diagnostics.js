/**
 * Hardware diagnosis.
 *
 * Measures what a pedaleira actually delivers — report rate, usable resolution,
 * noise floor — and turns that into a verdict about which metrics the device
 * can support. The rule the whole project follows is that bad hardware produces
 * a warning, never a confident-looking number.
 *
 * Pure by construction: capture lives in `../input/measure.js`, so everything
 * that could be subtly wrong is testable without a browser.
 */

import { chooseWindow } from "./filter.js";

/**
 * @typedef {object} Reading
 * @property {number} t      Milliseconds since capture started.
 * @property {number} value  Raw axis value, -1..1.
 */

/**
 * @typedef {object} CadenceReport
 * @property {number} reportRateHz
 * @property {number} medianGapMs
 * @property {number} p90GapMs
 * @property {number} maxGapMs
 * @property {number} count
 */

/**
 * @param {readonly number[]} sorted
 * @param {number} quantile
 * @returns {number}
 */
function percentile(sorted, quantile) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(quantile * (sorted.length - 1))),
  );
  return sorted[index] ?? 0;
}

/**
 * @param {readonly Reading[]} readings
 * @param {number} elapsedMs
 * @returns {CadenceReport}
 */
export function analyseCadence(readings, elapsedMs) {
  /** @type {number[]} */
  const gaps = [];
  for (let i = 1; i < readings.length; i++) {
    const previous = readings[i - 1];
    const current = readings[i];
    if (!previous || !current) continue;
    gaps.push(current.t - previous.t);
  }

  const sorted = [...gaps].sort((a, b) => a - b);
  return {
    reportRateHz: elapsedMs > 0 ? (readings.length / elapsedMs) * 1000 : 0,
    medianGapMs: percentile(sorted, 0.5),
    p90GapMs: percentile(sorted, 0.9),
    maxGapMs: sorted.length > 0 ? (sorted[sorted.length - 1] ?? 0) : 0,
    count: readings.length,
  };
}

/**
 * @typedef {object} ResolutionReport
 * @property {number} stepRaw   Median gap between distinct raw levels.
 * @property {number} levels    Distinct values observed.
 * @property {number} spanRaw   Raw range covered during the sweep.
 */

/**
 * The median gap between observed levels approximates one quantisation step.
 * The minimum would be corrupted by a single noisy reading, and the mean by the
 * large gaps left wherever the sweep moved quickly.
 *
 * @param {readonly Reading[]} readings
 * @returns {ResolutionReport}
 */
export function analyseResolution(readings) {
  const distinct = [...new Set(readings.map((r) => r.value))].sort((a, b) => a - b);
  if (distinct.length < 2) {
    return { stepRaw: 0, levels: distinct.length, spanRaw: 0 };
  }

  /** @type {number[]} */
  const gaps = [];
  for (let i = 1; i < distinct.length; i++) {
    const previous = distinct[i - 1];
    const current = distinct[i];
    if (previous === undefined || current === undefined) continue;
    gaps.push(current - previous);
  }
  gaps.sort((a, b) => a - b);

  const first = distinct[0] ?? 0;
  const last = distinct[distinct.length - 1] ?? 0;
  return { stepRaw: percentile(gaps, 0.5), levels: distinct.length, spanRaw: last - first };
}

/**
 * @typedef {object} NoiseReport
 * @property {number} stdevRaw
 * @property {number} peakToPeakRaw
 * @property {number} distinct
 */

/**
 * @param {readonly Reading[]} readings
 * @returns {NoiseReport}
 */
export function analyseNoise(readings) {
  if (readings.length === 0) {
    return { stdevRaw: 0, peakToPeakRaw: 0, distinct: 0 };
  }

  const values = readings.map((r) => r.value);
  let sum = 0;
  let lowest = Number.POSITIVE_INFINITY;
  let highest = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    sum += v;
    if (v < lowest) lowest = v;
    if (v > highest) highest = v;
  }
  const mean = sum / values.length;
  let variance = 0;
  for (const v of values) variance += (v - mean) ** 2;

  return {
    stdevRaw: Math.sqrt(variance / values.length),
    peakToPeakRaw: highest - lowest,
    distinct: new Set(values).size,
  };
}

/**
 * @typedef {object} Verdict
 * @property {"full" | "partial" | "limited"} grade
 * @property {number} bits            Effective resolution over the calibrated travel.
 * @property {number} stepFraction    Quantisation step as a fraction of travel.
 * @property {boolean} jerkPublishable
 * @property {number} windowPoints    Filter window this hardware requires.
 * @property {number} jerkNoise
 * @property {string[]} warnings
 */

/**
 * Combines the three measurements into what the app is allowed to claim.
 *
 * Resolution is judged against the **calibrated travel**, not the nominal -1..1
 * axis range. A pedal that only sweeps 60% of its axis has proportionally
 * coarser steps across the range the user can actually reach, and grading it on
 * the nominal range would flatter it.
 *
 * @param {object} input
 * @param {CadenceReport} input.cadence
 * @param {ResolutionReport} input.resolution
 * @param {NoiseReport} input.noise
 * @param {number} input.travelRaw   Calibrated travel, in raw axis units.
 * @param {number} input.stepMs      Sampling step the engine will use.
 * @returns {Verdict}
 */
export function judge(input) {
  const { cadence, resolution, noise, travelRaw, stepMs } = input;
  /** @type {string[]} */
  const warnings = [];

  const usableTravel = Math.abs(travelRaw);
  const stepFraction = usableTravel > 0 && resolution.stepRaw > 0
    ? resolution.stepRaw / usableTravel
    : 1;
  const bits = stepFraction > 0 && stepFraction < 1 ? Math.log2(1 / stepFraction) : 0;

  const window = chooseWindow({ stepFraction, stepMs });

  if (cadence.reportRateHz < 30) {
    warnings.push(
      `o dispositivo reporta a ${cadence.reportRateHz.toFixed(0)}Hz, abaixo do que as métricas de tempo exigem`,
    );
  }
  if (cadence.maxGapMs > 250) {
    warnings.push(
      `houve um intervalo de ${cadence.maxGapMs.toFixed(0)}ms sem leitura durante a medição`,
    );
  }
  if (!window.withinBudget) {
    warnings.push(
      "a resolução deste eixo não sustenta jerk — as demais métricas continuam válidas",
    );
  }
  if (noise.peakToPeakRaw > usableTravel * 0.01) {
    warnings.push(
      `ruído em repouso de ${((noise.peakToPeakRaw / usableTravel) * 100).toFixed(1)}% do curso — deadzone será necessária`,
    );
  }
  if (resolution.spanRaw < usableTravel * 0.8) {
    warnings.push("o curso percorrido na medição ficou bem abaixo do calibrado — refaça");
  }

  /** @type {"full" | "partial" | "limited"} */
  let grade = "limited";
  if (window.withinBudget && cadence.reportRateHz >= 40) grade = "full";
  else if (bits >= 6 && cadence.reportRateHz >= 30) grade = "partial";

  return {
    grade,
    bits,
    stepFraction,
    jerkPublishable: window.withinBudget,
    windowPoints: window.windowPoints,
    jerkNoise: window.jerkNoise,
    warnings,
  };
}

/**
 * What each grade means, for the interface and, later, for deciding whether two
 * users' scores belong on the same leaderboard.
 *
 * @param {Verdict["grade"]} grade
 * @returns {string}
 */
export function describeGrade(grade) {
  switch (grade) {
    case "full":
      return "todas as métricas, incluindo jerk";
    case "partial":
      return "forma, chatter, linearidade e consistência; jerk não";
    default:
      return "apenas forma e consistência grosseira";
  }
}
