/**
 * Composes mapping and calibration into the one reading the engine consumes.
 *
 * Everything downstream wants calibrated 0..1 values plus a way to tell a fresh
 * device report from the same value read twice — that distinction is what the
 * recorder needs to avoid inventing samples the hardware never produced.
 */

import { getPad } from "./devices.js";
import { assignmentFor, readPedal } from "./mapping.js";
import { calibrationFor, normalise } from "./calibration.js";

/** @typedef {import("./mapping.js").PedalRole} PedalRole */

/**
 * @typedef {object} PedalReading
 * @property {number} brake     Calibrated 0..1, or 0 when unmapped.
 * @property {number} throttle
 * @property {number} stamp     Changes when any mapped device reports new data.
 * @property {boolean} ready    Both pedals mapped and calibrated.
 */

/** @type {PedalRole[]} */
const ROLES = ["brake", "throttle"];

/**
 * @param {PedalRole} role
 * @returns {number}
 */
function calibratedValue(role) {
  const raw = readPedal(role);
  if (raw === null) return 0;
  const calibration = calibrationFor(role);
  return calibration ? normalise(calibration, raw) : 0;
}

/** @returns {PedalReading} */
export function readPedals() {
  let stamp = 0;
  let ready = true;

  for (const role of ROLES) {
    const assignment = assignmentFor(role);
    if (!assignment || !calibrationFor(role)) {
      ready = false;
      continue;
    }
    const pad = getPad(assignment.deviceIndex);
    // Summing is enough: any device reporting new data moves the total, which
    // is all the recorder asks of this value.
    if (pad) stamp += pad.timestamp;
  }

  return {
    brake: calibratedValue("brake"),
    throttle: calibratedValue("throttle"),
    stamp,
    ready,
  };
}
