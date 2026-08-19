/**
 * Target curves: the guide that says where the input has to be.
 *
 * A curve is a list of segments, each with a duration and a destination. That
 * is the whole format. It was tempting to design something richer — named
 * easings, per-segment tolerance profiles, nesting — but every one of those
 * would have been invented before anything consumed it. The shape below is what
 * the five scenarios actually need, and it is small enough to extend without
 * breaking files already written.
 *
 * Segment kinds:
 *   `idle`    hold at the current value (usually zero) — the lead-in
 *   `ramp`    move to `to` over `ms`, following `curve`
 *   `hold`    stay at the current value for `ms`
 *   `release` move to `to` over `ms` — same maths as ramp, named for readability
 *
 * `curve` decides how the movement is distributed in time:
 *   `linear`  constant rate. What trail braking asks for.
 *   `smooth`  minimum-jerk quintic: starts and ends at zero rate. How human
 *             limbs actually move, and the right target for anything meant to
 *             be applied without a jolt.
 */

import { STEP_MS } from "../engine/resample.js";

/** @typedef {"idle" | "ramp" | "hold" | "release"} SegmentKind */
/** @typedef {"linear" | "smooth"} SegmentCurve */
/** @typedef {import("./catalog.js").ScenarioPedal} ScenarioPedal */

/**
 * @typedef {object} Segment
 * @property {SegmentKind} kind
 * @property {number} ms
 * @property {number} [to]        Destination, 0..1. Required for ramp/release.
 * @property {SegmentCurve} [curve] Defaults to smooth.
 * @property {number} [tolerance] Allowed error either side, 0..1. Defaults per curve.
 */

/**
 * @typedef {object} TargetCurve
 * @property {Segment[]} brake
 * @property {Segment[]} throttle
 */

/** Default tolerance band, as a fraction of full travel. */
const DEFAULT_TOLERANCE = 0.06;

/**
 * Minimum-jerk quintic. Zero rate at both ends, which is what makes it the
 * honest target for "apply this without a jolt".
 *
 * @param {number} u  0..1
 * @returns {number}
 */
function smoothstep(u) {
  return u * u * u * (10 - 15 * u + 6 * u * u);
}

/**
 * @param {Segment} segment
 * @param {number} u  Progress through the segment, 0..1.
 * @returns {number}
 */
function shape(segment, u) {
  return (segment.curve ?? "smooth") === "linear" ? u : smoothstep(u);
}

/**
 * Samples one channel onto the fixed grid.
 *
 * @param {readonly Segment[]} segments
 * @param {number} durationMs
 * @param {number} [stepMs]
 * @returns {{ value: number[], tolerance: number[] }}
 */
export function sampleChannel(segments, durationMs, stepMs = STEP_MS) {
  const count = Math.round(durationMs / stepMs);
  /** @type {number[]} */
  const value = new Array(count).fill(0);
  /** @type {number[]} */
  const tolerance = new Array(count).fill(DEFAULT_TOLERANCE);

  let cursorMs = 0;
  let current = 0;
  let index = 0;

  for (const segment of segments) {
    const start = current;
    const end = segment.kind === "ramp" || segment.kind === "release"
      ? (segment.to ?? current)
      : current;
    const band = segment.tolerance ?? DEFAULT_TOLERANCE;
    const endMs = cursorMs + segment.ms;

    while (index < count && index * stepMs < endMs) {
      const t = index * stepMs;
      const u = segment.ms > 0 ? Math.min(1, Math.max(0, (t - cursorMs) / segment.ms)) : 1;
      value[index] = start + (end - start) * shape(segment, u);
      tolerance[index] = band;
      index++;
    }

    cursorMs = endMs;
    current = end;
  }

  // Anything past the last segment holds the final value, so a curve shorter
  // than the scenario does not fall off a cliff at the end.
  while (index < count) {
    value[index] = current;
    index++;
  }

  return { value, tolerance };
}

/**
 * @typedef {object} SampledTarget
 * @property {number} stepMs
 * @property {number[]} brake
 * @property {number[]} throttle
 * @property {number[]} brakeTolerance
 * @property {number[]} throttleTolerance
 */

/**
 * @param {TargetCurve} curve
 * @param {number} durationMs
 * @param {number} [stepMs]
 * @returns {SampledTarget}
 */
export function sampleTarget(curve, durationMs, stepMs = STEP_MS) {
  const brake = sampleChannel(curve.brake, durationMs, stepMs);
  const throttle = sampleChannel(curve.throttle, durationMs, stepMs);
  return {
    stepMs,
    brake: brake.value,
    throttle: throttle.value,
    brakeTolerance: brake.tolerance,
    throttleTolerance: throttle.tolerance,
  };
}

/**
 * Total declared length of a channel, for checking a curve fills its scenario.
 *
 * @param {readonly Segment[]} segments
 * @returns {number}
 */
export function channelDuration(segments) {
  return segments.reduce((total, segment) => total + segment.ms, 0);
}
