/**
 * Raw axis capture for the hardware diagnosis.
 *
 * Oversamples with `setTimeout` rather than the animation frame: the point is to
 * observe how often the *device* reports, and a poll tied to the monitor cannot
 * resolve anything faster than the monitor. Chrome clamps nested timeouts to
 * about 4ms, which is the resolution limit of every interval measured here.
 */

import { getPad } from "./devices.js";

/** @typedef {import("../engine/diagnostics.js").Reading} Reading */

/**
 * @typedef {object} CaptureOptions
 * @property {number} durationMs
 * @property {(remainingMs: number) => void} [onProgress]
 */

/**
 * @param {number} deviceIndex
 * @param {number} axis
 * @param {CaptureOptions} options
 * @returns {Promise<{ readings: Reading[], elapsedMs: number }>}
 */
export function captureReadings(deviceIndex, axis, options) {
  const { durationMs, onProgress } = options;

  return new Promise((resolve, reject) => {
    /** @type {Reading[]} */
    const readings = [];
    const started = performance.now();
    let lastStamp = Number.NaN;
    let lastValue = Number.NaN;

    const poll = () => {
      const now = performance.now();
      const elapsed = now - started;
      const pad = getPad(deviceIndex);

      if (!pad) {
        reject(new Error("dispositivo desconectado durante a medição"));
        return;
      }

      const value = pad.axes[axis];
      if (value === undefined) {
        reject(new Error(`eixo ${axis} não existe neste dispositivo`));
        return;
      }

      // Either signal counts as a fresh report. On the PXN VD4 the two move
      // together, but that is a property of one device and one browser, not a
      // guarantee — a load cell may well behave differently.
      if (pad.timestamp !== lastStamp || value !== lastValue) {
        lastStamp = pad.timestamp;
        lastValue = value;
        readings.push({ t: elapsed, value });
      }

      if (elapsed < durationMs) {
        if (onProgress) onProgress(durationMs - elapsed);
        setTimeout(poll, 0);
        return;
      }

      resolve({ readings, elapsedMs: elapsed });
    };

    poll();
  });
}
