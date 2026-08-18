/**
 * Shared statistics used by both the live metric engine and (later) the
 * server-side recompute that validates leaderboard submissions. Keeping this
 * in one place is what prevents client and server numbers from drifting.
 */

/**
 * @param {readonly number[]} xs
 * @returns {number} NaN for an empty input, so callers must guard explicitly.
 */
export function mean(xs) {
  if (xs.length === 0) return NaN;
  let sum = 0;
  for (const x of xs) sum += x;
  return sum / xs.length;
}

/**
 * Population standard deviation.
 * @param {readonly number[]} xs
 * @returns {number}
 */
export function stdev(xs) {
  if (xs.length === 0) return NaN;
  const m = mean(xs);
  let acc = 0;
  for (const x of xs) acc += (x - m) ** 2;
  return Math.sqrt(acc / xs.length);
}

/**
 * @param {readonly number[]} xs
 * @returns {number}
 */
export function median(xs) {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const half = sorted.length >> 1;
  const hi = sorted[half];
  if (hi === undefined) return NaN;
  if (sorted.length % 2 === 1) return hi;
  const lo = sorted[half - 1];
  return lo === undefined ? hi : (lo + hi) / 2;
}

/**
 * Root mean square — the aggregation used for both trace error and jerk.
 * @param {readonly number[]} xs
 * @returns {number}
 */
export function rms(xs) {
  if (xs.length === 0) return NaN;
  let acc = 0;
  for (const x of xs) acc += x * x;
  return Math.sqrt(acc / xs.length);
}
