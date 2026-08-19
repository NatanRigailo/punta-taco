/**
 * Attempt recorder.
 *
 * Captures raw device readings with their real timestamps, then hands them to
 * the resampler. Keeping the two apart is deliberate: the capture is the only
 * part that needs a browser, and it is small enough to eyeball, while all the
 * arithmetic that could be subtly wrong lives in `resample.js` under test.
 *
 * The poll runs on the animation frame. That makes the *capture* rate depend on
 * the monitor, which does not matter — the recorded timestamps are real, and the
 * fixed grid is produced afterwards from them. A 60Hz and a 165Hz machine
 * therefore produce the same series from the same pedal movement.
 */

import { readPedals } from "../input/pedals.js";
import { STEP_MS, describeCadence, resampleToGrid } from "./resample.js";

/** @typedef {import("./resample.js").RawSample} RawSample */
/** @typedef {import("./resample.js").Series} Series */

/**
 * A gap this long means the page stopped being scheduled — a hidden tab, or the
 * machine struggling. The samples on either side are real, but what happened in
 * between is unknown, so the attempt is reported as suspect rather than
 * silently interpolated across.
 */
const MAX_TRUSTED_GAP_MS = 250;

/**
 * @typedef {object} Attempt
 * @property {RawSample[]} samples          Raw readings, as captured.
 * @property {Series} series                Fixed-step grid.
 * @property {number} durationMs
 * @property {{ count: number, medianMs: number, maxMs: number }} cadence
 * @property {boolean} trustworthy
 * @property {string | null} warning
 */

/**
 * @typedef {object} RecordOptions
 * @property {number} durationMs
 * @property {number} [stepMs]
 * @property {() => import("../input/pedals.js").PedalReading} [read]
 * @property {(elapsedMs: number) => void} [onProgress]
 * @property {(startedAt: number) => void} [onStart]
 *   Called once with the recording's `performance.now()` origin. The launch
 *   scenario needs it to schedule its signal on the same clock the samples are
 *   timestamped against — otherwise reaction time would be measured between two
 *   clocks that drift apart by however long the setup took.
 */

/**
 * @param {RecordOptions} options
 * @returns {Promise<Attempt>}
 */
export function recordAttempt(options) {
  const durationMs = options.durationMs;
  const stepMs = options.stepMs ?? STEP_MS;
  const read = options.read ?? readPedals;
  const onProgress = options.onProgress;

  return new Promise((resolve) => {
    /** @type {RawSample[]} */
    const samples = [];
    const started = performance.now();
    if (options.onStart) options.onStart(started);
    let lastStamp = Number.NaN;

    const poll = () => {
      const elapsed = performance.now() - started;
      const reading = read();

      // Only a genuinely new device report becomes a sample. Recording every
      // frame would fabricate a staircase at the monitor's rate and make the
      // interpolation smooth over quantisation steps that never happened.
      if (reading.stamp !== lastStamp) {
        lastStamp = reading.stamp;
        samples.push({
          t: Math.min(elapsed, durationMs),
          brake: reading.brake,
          throttle: reading.throttle,
        });
      }

      if (elapsed < durationMs) {
        if (onProgress) onProgress(elapsed);
        requestAnimationFrame(poll);
        return;
      }

      const cadence = describeCadence(samples);
      const starved = cadence.maxMs > MAX_TRUSTED_GAP_MS;
      const empty = samples.length < 2;

      resolve({
        samples,
        series: resampleToGrid(samples, { durationMs, stepMs }),
        durationMs,
        cadence,
        trustworthy: !starved && !empty,
        warning: empty
          ? "o dispositivo praticamente não reportou durante a tentativa"
          : starved
            ? `houve um intervalo de ${cadence.maxMs.toFixed(0)}ms sem leitura — a aba perdeu prioridade`
            : null,
      });
    };

    requestAnimationFrame(poll);
  });
}
