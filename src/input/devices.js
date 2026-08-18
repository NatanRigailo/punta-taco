/**
 * Device discovery over the Gamepad API.
 *
 * Two browser quirks shape everything here:
 *  - `navigator.getGamepads()` returns a snapshot, so it must be called on every
 *    read; holding on to a Gamepad object gives stale values.
 *  - Chrome hides gamepads until the user produces an input on one. A device can
 *    therefore exist physically and be invisible to the page, which is why
 *    callers need a real "not yet appeared" state rather than an empty list.
 */

/**
 * @typedef {object} DeviceInfo
 * @property {number} index     Stable slot assigned by the browser.
 * @property {string} id        Vendor string, e.g. "PXN VD4 (Vendor: 36e6 Product: 400d)".
 * @property {number} axisCount
 */

/** @returns {Gamepad[]} */
export function connectedPads() {
  /** @type {Gamepad[]} */
  const out = [];
  for (const pad of navigator.getGamepads()) {
    if (pad) out.push(pad);
  }
  return out;
}

/** @returns {DeviceInfo[]} */
export function listDevices() {
  return connectedPads().map((pad) => ({
    index: pad.index,
    id: pad.id,
    axisCount: pad.axes.length,
  }));
}

/**
 * @param {number} index
 * @returns {Gamepad | null}
 */
export function getPad(index) {
  for (const pad of navigator.getGamepads()) {
    if (pad && pad.index === index) return pad;
  }
  return null;
}

/**
 * Raw axis value in the browser's -1..1 range, or null when the device or axis
 * is gone. Normalising to 0..1 of a calibrated range belongs to the calibration
 * module, not here.
 *
 * @param {number} index
 * @param {number} axis
 * @returns {number | null}
 */
export function readAxis(index, axis) {
  const pad = getPad(index);
  if (!pad) return null;
  const value = pad.axes[axis];
  return value === undefined ? null : value;
}

/**
 * @param {DeviceInfo[]} devices
 * @returns {string} Identity of the current device set, for change detection.
 */
function signature(devices) {
  return devices.map((d) => `${d.index}:${d.id}:${d.axisCount}`).join("|");
}

/**
 * Calls `onChange` whenever the set of visible devices changes, plus once
 * immediately with the current state.
 *
 * The connect/disconnect events alone are not enough: they can fire before this
 * module is imported, and Chrome's reveal-on-first-input means a device often
 * becomes visible without an event the page can rely on. Polling at a low rate
 * alongside the events is what makes the state converge on its own.
 *
 * @param {(devices: DeviceInfo[]) => void} onChange
 * @param {{ pollMs?: number }} [options]
 * @returns {() => void} Unsubscribe.
 */
export function watchDevices(onChange, options = {}) {
  const pollMs = options.pollMs ?? 250;
  let last = " "; // impossible signature, so the first tick always fires
  let timer = 0;
  let stopped = false;

  const check = () => {
    if (stopped) return;
    const devices = listDevices();
    const sig = signature(devices);
    if (sig !== last) {
      last = sig;
      onChange(devices);
    }
  };

  const tick = () => {
    check();
    if (!stopped) timer = setTimeout(tick, pollMs);
  };

  addEventListener("gamepadconnected", check);
  addEventListener("gamepaddisconnected", check);
  tick();

  return () => {
    stopped = true;
    clearTimeout(timer);
    removeEventListener("gamepadconnected", check);
    removeEventListener("gamepaddisconnected", check);
  };
}
