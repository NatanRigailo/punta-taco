/**
 * Fixed-step ring buffer feeding the live trace.
 *
 * The recorder in `recorder.js` keeps raw readings and resamples afterwards,
 * which is right for an attempt but useless for a display that has to draw
 * *now*. Here the accumulator does the opposite job: it pulls the current
 * reading onto the same 20ms grid as it goes, so what is drawn and what is
 * measured share a time base.
 *
 * Zero-order hold rather than interpolation, deliberately: interpolating live
 * would need the next sample, and the whole point of this buffer is not to wait.
 * At a 20ms grid against a device reporting every ~19ms the difference is below
 * one step, and it is the raw signal — showing it smoothed would lie about the
 * chatter the scenarios exist to expose.
 */

import { STEP_MS } from "./resample.js";

/**
 * @typedef {object} BufferOptions
 * @property {number} capacity   How many fixed-step samples to keep.
 * @property {number} [stepMs]
 */

/**
 * @param {BufferOptions} options
 */
export function createLiveBuffer(options) {
  const stepMs = options.stepMs ?? STEP_MS;
  const capacity = options.capacity;
  /** @type {number[]} */
  const brake = new Array(capacity).fill(0);
  /** @type {number[]} */
  const throttle = new Array(capacity).fill(0);

  let filled = 0;
  let accumulator = 0;
  /** @type {number | null} */
  let lastTick = null;

  return {
    stepMs,
    capacity,

    /**
     * Advances the grid by however much real time has passed, appending one
     * sample per elapsed step.
     *
     * @param {number} now                    performance.now()
     * @param {() => { brake: number, throttle: number }} read
     * @returns {number} How many samples were appended.
     */
    advance(now, read) {
      if (lastTick === null) {
        lastTick = now;
        return 0;
      }

      accumulator += now - lastTick;
      lastTick = now;

      // A tab that was backgrounded comes back with a huge delta. Replaying it
      // would flood the buffer with copies of one reading and draw a flat line
      // over a period nobody actually pedalled through, so the backlog is
      // dropped and the trace simply resumes.
      const maxBacklog = capacity * stepMs;
      if (accumulator > maxBacklog) accumulator = stepMs;

      let appended = 0;
      while (accumulator >= stepMs) {
        accumulator -= stepMs;
        const reading = read();
        brake.push(reading.brake);
        brake.shift();
        throttle.push(reading.throttle);
        throttle.shift();
        if (filled < capacity) filled++;
        appended++;
      }
      return appended;
    },

    /** Oldest to newest; the last entry is the current sample. */
    series() {
      return { brake, throttle, filled };
    },

    reset() {
      brake.fill(0);
      throttle.fill(0);
      filled = 0;
      accumulator = 0;
      lastTick = null;
    },
  };
}
