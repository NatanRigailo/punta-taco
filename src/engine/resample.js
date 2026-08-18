/**
 * Resampling raw device readings onto a fixed-step grid.
 *
 * The device reports on its own clock — measured at roughly 19ms on the PXN
 * VD4, and irregular in the sense that consecutive reports sometimes carry an
 * unchanged value. Every metric downstream assumes a constant step, so the grid
 * has to be produced here rather than hoped for upstream.
 *
 * This runs after an attempt ends, not during it. Linear interpolation needs
 * the sample *after* the grid point, which live would cost a frame of latency;
 * done afterwards it costs nothing.
 *
 * The step itself is not a free parameter: quantisation noise in jerk scales
 * with `step / dt²`, so sampling faster than the hardware justifies makes the
 * central metric worse. See `docs/medicoes.md`.
 */

/** Fixed grid step, in milliseconds. */
export const STEP_MS = 20;

/**
 * @typedef {object} RawSample
 * @property {number} t         Milliseconds since the attempt started.
 * @property {number} brake     Calibrated 0..1.
 * @property {number} throttle  Calibrated 0..1.
 */

/**
 * @typedef {object} Series
 * @property {number} stepMs
 * @property {number[]} brake
 * @property {number[]} throttle
 */

/**
 * @param {readonly RawSample[]} samples
 * @param {number} index
 * @param {number} t
 * @param {"brake" | "throttle"} channel
 * @returns {number}
 */
function valueAt(samples, index, t, channel) {
  const current = samples[index];
  if (!current) return 0;

  const next = samples[index + 1];
  // Before the first reading and after the last one there is nothing to
  // interpolate towards, so the nearest known value is held.
  if (!next || t <= current.t) return current[channel];

  const span = next.t - current.t;
  if (span <= 0) return current[channel];

  const fraction = Math.min(1, Math.max(0, (t - current.t) / span));
  return current[channel] + fraction * (next[channel] - current[channel]);
}

/**
 * @typedef {object} ResampleOptions
 * @property {number} durationMs  Attempt length; decides how many grid points.
 * @property {number} [stepMs]    Defaults to STEP_MS.
 */

/**
 * Produces a constant-step series covering `[0, durationMs)`.
 *
 * An 8s attempt at the 20ms step yields exactly 400 points, at t = 0, 20, …,
 * 7980 — the end of the window is exclusive, which is what keeps the count
 * exact and the steps uniform.
 *
 * @param {readonly RawSample[]} samples  Must be sorted by `t`.
 * @param {ResampleOptions} options
 * @returns {Series}
 */
export function resampleToGrid(samples, options) {
  const stepMs = options.stepMs ?? STEP_MS;
  if (!(stepMs > 0)) throw new Error("stepMs deve ser positivo");
  if (!(options.durationMs >= 0)) throw new Error("durationMs deve ser não negativo");

  const count = Math.round(options.durationMs / stepMs);
  /** @type {number[]} */
  const brake = new Array(count);
  /** @type {number[]} */
  const throttle = new Array(count);

  // Single pass: the cursor only moves forward, so the whole resample is O(n+k)
  // rather than a binary search per grid point.
  let cursor = 0;
  for (let k = 0; k < count; k++) {
    const t = k * stepMs;
    while (cursor + 1 < samples.length) {
      const candidate = samples[cursor + 1];
      if (!candidate || candidate.t > t) break;
      cursor++;
    }
    brake[k] = valueAt(samples, cursor, t, "brake");
    throttle[k] = valueAt(samples, cursor, t, "throttle");
  }

  return { stepMs, brake, throttle };
}

/**
 * Intervals between consecutive raw readings, for reporting how the device
 * actually behaved during an attempt.
 *
 * @param {readonly RawSample[]} samples
 * @returns {{ count: number, medianMs: number, maxMs: number }}
 */
export function describeCadence(samples) {
  /** @type {number[]} */
  const gaps = [];
  for (let i = 1; i < samples.length; i++) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (!previous || !current) continue;
    gaps.push(current.t - previous.t);
  }

  if (gaps.length === 0) return { count: samples.length, medianMs: 0, maxMs: 0 };

  const sorted = [...gaps].sort((a, b) => a - b);
  const half = sorted.length >> 1;
  const hi = sorted[half] ?? 0;
  const lo = sorted[half - 1] ?? hi;
  const medianMs = sorted.length % 2 === 1 ? hi : (lo + hi) / 2;

  return { count: samples.length, medianMs, maxMs: sorted[sorted.length - 1] ?? 0 };
}
