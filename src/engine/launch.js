/**
 * Launch analysis.
 *
 * The one scenario whose target is an event rather than a curve: the signal
 * goes out and the brake has to leave. That is why it can ship before the
 * target curve exists — there is nothing to draw a guide against.
 *
 * Pure, like the rest of the engine. The lights and the pedals live in the UI;
 * everything that can be quantitatively wrong lives here, under test.
 */

/** @typedef {import("./resample.js").RawSample} RawSample */

/**
 * Release is considered started when the brake has dropped this far below what
 * it was holding. A fraction of the held value rather than an absolute number,
 * because nobody holds exactly 100% — and a threshold expressed in absolute
 * travel would trigger at a different point for someone holding 85%.
 */
const RELEASE_FRACTION = 0.95;

/** Brake below this counts as fully released. */
const RELEASED = 0.02;

/** Minimum brake that counts as "holding the car". */
const MIN_HELD_BRAKE = 0.5;

/** Minimum throttle that counts as "on the power". */
const MIN_HELD_THROTTLE = 0.3;

/**
 * Below this, a reaction is anticipation rather than reflex: simple visual
 * reaction time does not go under ~100ms in humans, so a faster number means
 * the release was already under way when the signal happened to fire.
 */
export const HUMAN_FLOOR_MS = 100;

/** Window before the signal used to characterise the hold. */
const HOLD_WINDOW_MS = 500;

/**
 * @typedef {object} LaunchResult
 * @property {boolean} valid
 * @property {string | null} problem       Why the attempt does not count.
 * @property {boolean} jumpStart           Release began before the signal.
 * @property {boolean} anticipated         Reaction under the human floor.
 * @property {number | null} reactionMs    Negative on a jump start.
 * @property {number | null} releaseMs     From release onset to fully off.
 * @property {number} heldBrake
 * @property {number} heldThrottle
 * @property {number} throttleWobble       Peak-to-peak throttle during the hold.
 */

/**
 * @param {readonly number[]} values
 * @returns {number}
 */
function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const half = sorted.length >> 1;
  const hi = sorted[half] ?? 0;
  if (sorted.length % 2 === 1) return hi;
  return ((sorted[half - 1] ?? hi) + hi) / 2;
}

/**
 * @param {readonly RawSample[]} samples
 * @param {number} signalMs   When the lights went out, on the same clock as `t`.
 * @returns {LaunchResult}
 */
export function analyseLaunch(samples, signalMs) {
  /** @type {LaunchResult} */
  const empty = {
    valid: false,
    problem: "nenhuma leitura durante a tentativa",
    jumpStart: false,
    anticipated: false,
    reactionMs: null,
    releaseMs: null,
    heldBrake: 0,
    heldThrottle: 0,
    throttleWobble: 0,
  };
  if (samples.length === 0) return empty;

  const hold = samples.filter((s) => s.t >= signalMs - HOLD_WINDOW_MS && s.t < signalMs);
  if (hold.length === 0) return { ...empty, problem: "nenhuma leitura antes do sinal" };

  const heldBrake = median(hold.map((s) => s.brake));
  const heldThrottle = median(hold.map((s) => s.throttle));

  const throttleValues = hold.map((s) => s.throttle);
  const throttleWobble = Math.max(...throttleValues) - Math.min(...throttleValues);

  /** @type {LaunchResult} */
  const base = {
    valid: true,
    problem: null,
    jumpStart: false,
    anticipated: false,
    reactionMs: null,
    releaseMs: null,
    heldBrake,
    heldThrottle,
    throttleWobble,
  };

  if (heldBrake < MIN_HELD_BRAKE) {
    return { ...base, valid: false, problem: "o freio não estava segurando o carro" };
  }
  if (heldThrottle < MIN_HELD_THROTTLE) {
    return { ...base, valid: false, problem: "o acelerador não estava aplicado na espera" };
  }

  // The search starts at the beginning of the recording, not at the signal —
  // otherwise a jump start would be invisible, which is the one error this
  // scenario exists to catch.
  const threshold = heldBrake * RELEASE_FRACTION;
  const onset = samples.find((s) => s.brake < threshold);
  if (!onset) {
    return { ...base, valid: false, problem: "o freio não foi solto" };
  }

  const reactionMs = onset.t - signalMs;
  const releasedAt = samples.find((s) => s.t >= onset.t && s.brake <= RELEASED);

  const jumpStart = reactionMs < 0;
  const anticipated = !jumpStart && reactionMs < HUMAN_FLOOR_MS;

  return {
    ...base,
    valid: !jumpStart,
    problem: jumpStart ? "queimou a largada" : null,
    jumpStart,
    anticipated,
    reactionMs,
    releaseMs: releasedAt ? releasedAt.t - onset.t : null,
  };
}

/**
 * Reaction time, rounded to the precision the hardware can actually support.
 *
 * A device reporting every ~19ms cannot distinguish 212ms from 219ms, and
 * printing the extra digits would claim a precision that does not exist.
 *
 * @param {number} reactionMs
 * @param {number} deviceGapMs
 * @returns {number}
 */
export function roundReaction(reactionMs, deviceGapMs) {
  const grain = Math.max(10, Math.round(deviceGapMs / 10) * 10);
  return Math.round(reactionMs / grain) * grain;
}
