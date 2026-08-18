/**
 * Which physical axis carries which pedal.
 *
 * Nothing is assumed: axis order differs per device (on the PXN VD4 the brake is
 * axis 3, elsewhere it is not), and guessing wrong silently produces metrics for
 * the wrong pedal. The mapping is therefore always established by observing the
 * user press the pedal.
 *
 * In-session only — persisting the mapping belongs to the hardware profile.
 */

import { getPad, readAxis } from "./devices.js";

/** @typedef {"brake" | "throttle"} PedalRole */

/**
 * @typedef {object} Assignment
 * @property {number} deviceIndex
 * @property {number} axis
 */

/** @type {Map<PedalRole, Assignment>} */
const assignments = new Map();

/** @type {Set<(role: PedalRole) => void>} */
const listeners = new Set();

/** @param {PedalRole} role */
function emit(role) {
  for (const fn of listeners) fn(role);
}

/**
 * @param {(role: PedalRole) => void} fn
 * @returns {() => void} Unsubscribe.
 */
export function onAssignmentChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * @param {PedalRole} role
 * @param {number} deviceIndex
 * @param {number} axis
 */
export function assign(role, deviceIndex, axis) {
  assignments.set(role, { deviceIndex, axis });
  emit(role);
}

/**
 * @param {PedalRole} role
 * @returns {Assignment | null}
 */
export function assignmentFor(role) {
  return assignments.get(role) ?? null;
}

/** @param {PedalRole} role */
export function clearAssignment(role) {
  if (assignments.delete(role)) emit(role);
}

/**
 * Raw -1..1 reading for a mapped pedal, or null when unmapped or disconnected.
 *
 * @param {PedalRole} role
 * @returns {number | null}
 */
export function readPedal(role) {
  const a = assignments.get(role);
  if (!a) return null;
  return readAxis(a.deviceIndex, a.axis);
}

/**
 * Drops assignments pointing at devices that are no longer present, so a
 * unplugged pedaleira does not leave the app reading a phantom axis.
 *
 * @returns {PedalRole[]} Roles that were cleared.
 */
export function pruneMissingDevices() {
  /** @type {PedalRole[]} */
  const dropped = [];
  for (const [role, a] of [...assignments]) {
    if (!getPad(a.deviceIndex)) {
      assignments.delete(role);
      dropped.push(role);
      emit(role);
    }
  }
  return dropped;
}

/**
 * @typedef {object} DetectOptions
 * @property {number} [durationMs]  How long to watch. Default 4000.
 * @property {number} [minTravel]   Minimum movement, in the -1..1 scale, for an
 *                                  axis to count as pressed. Default 0.35.
 * @property {number} [pollMs]      Sampling period while watching. Default 16.
 * @property {(remainingMs: number) => void} [onProgress]
 */

/**
 * @typedef {object} DetectResult
 * @property {number} axis
 * @property {number} travel   Observed range on the winning axis.
 * @property {number} runnerUp Observed range on the next-best axis.
 */

/**
 * Watches every axis of a device and resolves with the one that moved most,
 * which is how the user assigns a pedal: they press it.
 *
 * Rejects when nothing moved enough, or when two axes moved comparably — the
 * latter usually means a combined pedal set reporting on one axis, or the user
 * pressing two pedals at once. Guessing between them would be worse than asking
 * again.
 *
 * @param {number} deviceIndex
 * @param {DetectOptions} [options]
 * @returns {Promise<DetectResult>}
 */
export function detectAxis(deviceIndex, options = {}) {
  const durationMs = options.durationMs ?? 4000;
  const minTravel = options.minTravel ?? 0.35;
  const pollMs = options.pollMs ?? 16;
  const onProgress = options.onProgress;

  return new Promise((resolve, reject) => {
    const pad = getPad(deviceIndex);
    if (!pad) {
      reject(new Error("dispositivo não está conectado"));
      return;
    }

    const axisCount = pad.axes.length;
    const min = new Array(axisCount).fill(Number.POSITIVE_INFINITY);
    const max = new Array(axisCount).fill(Number.NEGATIVE_INFINITY);
    const started = performance.now();

    const sample = () => {
      const now = performance.now();
      const live = getPad(deviceIndex);
      if (!live) {
        reject(new Error("dispositivo foi desconectado durante a detecção"));
        return;
      }

      for (let i = 0; i < axisCount; i++) {
        const v = live.axes[i];
        if (v === undefined) continue;
        const lo = min[i];
        const hi = max[i];
        if (lo === undefined || hi === undefined) continue;
        if (v < lo) min[i] = v;
        if (v > hi) max[i] = v;
      }

      const remaining = durationMs - (now - started);
      if (remaining > 0) {
        if (onProgress) onProgress(remaining);
        setTimeout(sample, pollMs);
        return;
      }

      /** @type {{ axis: number, travel: number }[]} */
      const ranked = [];
      for (let i = 0; i < axisCount; i++) {
        const lo = min[i];
        const hi = max[i];
        if (lo === undefined || hi === undefined) continue;
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
        ranked.push({ axis: i, travel: hi - lo });
      }
      ranked.sort((a, b) => b.travel - a.travel);

      const best = ranked[0];
      if (!best || best.travel < minTravel) {
        reject(new Error("nenhum eixo se moveu o suficiente — pressione o pedal até o fundo"));
        return;
      }

      const second = ranked[1];
      const runnerUp = second ? second.travel : 0;
      if (runnerUp > best.travel * 0.6) {
        reject(new Error("mais de um eixo se moveu junto — pressione apenas um pedal"));
        return;
      }

      resolve({ axis: best.axis, travel: best.travel, runnerUp });
    };

    sample();
  });
}
