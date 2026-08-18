/**
 * Hardware profile: what the app knows about one pedaleira.
 *
 * Everything here is pure. The IndexedDB side lives in `db.js`, which keeps the
 * interesting part — building, validating and exchanging profiles — testable
 * without a browser.
 *
 * Import is the security-relevant path: a profile file is untrusted input, and
 * a malformed one must be rejected loudly rather than land half-applied and
 * produce metrics from a calibration that makes no sense.
 */

/** @typedef {import("../input/mapping.js").PedalRole} PedalRole */
/** @typedef {import("../input/calibration.js").Calibration} Calibration */

/**
 * @typedef {object} PedalEntry
 * @property {number} axis
 * @property {Calibration} calibration
 */

/**
 * @typedef {object} HardwareMeasurement
 * @property {number} reportRateHz
 * @property {number} medianGapMs
 * @property {number} stepFraction    Quantisation step over calibrated travel.
 * @property {number} bits
 * @property {number} noiseFraction
 * @property {"full" | "partial" | "limited"} grade
 * @property {boolean} jerkPublishable
 * @property {number} windowPoints    Filter window this hardware requires.
 * @property {number} measuredAt
 */

/**
 * @typedef {object} HardwareProfile
 * @property {string} deviceId   Gamepad id string — the only stable identifier.
 * @property {string} name       Editable label shown to the user.
 * @property {number} createdAt
 * @property {number} updatedAt
 * @property {{ brake?: PedalEntry, throttle?: PedalEntry }} pedals
 * @property {HardwareMeasurement} [hardware]  Absent until the diagnosis runs.
 */

export const EXPORT_FORMAT = "punta-taco/profiles";
export const EXPORT_VERSION = 1;

/** @type {PedalRole[]} */
const ROLES = ["brake", "throttle"];

/**
 * @param {string} deviceId
 * @param {string} [name]
 * @param {number} [now]
 * @returns {HardwareProfile}
 */
export function createProfile(deviceId, name, now = Date.now()) {
  return {
    deviceId,
    name: name ?? deviceId,
    createdAt: now,
    updatedAt: now,
    pedals: {},
  };
}

/**
 * Returns a new profile with one pedal recorded. Never mutates its input, so a
 * failed write cannot leave the in-memory profile ahead of what was stored.
 *
 * @param {HardwareProfile} profile
 * @param {PedalRole} role
 * @param {PedalEntry} entry
 * @param {number} [now]
 * @returns {HardwareProfile}
 */
export function withPedal(profile, role, entry, now = Date.now()) {
  return {
    ...profile,
    updatedAt: now,
    pedals: { ...profile.pedals, [role]: entry },
  };
}

/**
 * @param {HardwareProfile} profile
 * @param {PedalRole} role
 * @param {number} [now]
 * @returns {HardwareProfile}
 */
export function withoutPedal(profile, role, now = Date.now()) {
  const pedals = { ...profile.pedals };
  delete pedals[role];
  return { ...profile, updatedAt: now, pedals };
}

/** @type {HardwareMeasurement["grade"][]} */
const GRADES = ["full", "partial", "limited"];

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {number}
 */
function requireFiniteNumber(value, path) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${path} deve ser um número finito`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {string}
 */
function requireString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} deve ser um texto não vazio`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Record<string, unknown>}
 */
function requireObject(value, path) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} deve ser um objeto`);
  }
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {Calibration}
 */
function parseCalibration(value, path) {
  const raw = requireObject(value, path);
  const restRaw = requireFiniteNumber(raw["restRaw"], `${path}.restRaw`);
  const pressedRaw = requireFiniteNumber(raw["pressedRaw"], `${path}.pressedRaw`);
  const deadzone = requireFiniteNumber(raw["deadzone"], `${path}.deadzone`);
  const restNoise = requireFiniteNumber(raw["restNoise"], `${path}.restNoise`);

  if (restRaw === pressedRaw) {
    throw new Error(`${path}: repouso e fundo coincidem, calibração inútil`);
  }
  if (deadzone < 0 || deadzone >= 1) {
    throw new Error(`${path}.deadzone deve ficar entre 0 e 1`);
  }
  if (restNoise < 0) {
    throw new Error(`${path}.restNoise não pode ser negativo`);
  }

  return { restRaw, pressedRaw, deadzone, restNoise };
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {PedalEntry}
 */
function parsePedalEntry(value, path) {
  const raw = requireObject(value, path);
  const axis = requireFiniteNumber(raw["axis"], `${path}.axis`);
  if (!Number.isInteger(axis) || axis < 0) {
    throw new Error(`${path}.axis deve ser um índice inteiro não negativo`);
  }
  return { axis, calibration: parseCalibration(raw["calibration"], `${path}.calibration`) };
}

/**
 * @param {unknown} value
 * @param {string} path
 * @returns {HardwareMeasurement}
 */
function parseHardware(value, path) {
  const raw = requireObject(value, path);
  const grade = raw["grade"];
  if (typeof grade !== "string" || !GRADES.includes(/** @type {any} */ (grade))) {
    throw new Error(`${path}.grade deve ser um de: ${GRADES.join(", ")}`);
  }
  if (typeof raw["jerkPublishable"] !== "boolean") {
    throw new Error(`${path}.jerkPublishable deve ser booleano`);
  }

  const stepFraction = requireFiniteNumber(raw["stepFraction"], `${path}.stepFraction`);
  if (stepFraction <= 0 || stepFraction > 1) {
    throw new Error(`${path}.stepFraction deve ficar entre 0 e 1`);
  }

  return {
    reportRateHz: requireFiniteNumber(raw["reportRateHz"], `${path}.reportRateHz`),
    medianGapMs: requireFiniteNumber(raw["medianGapMs"], `${path}.medianGapMs`),
    stepFraction,
    bits: requireFiniteNumber(raw["bits"], `${path}.bits`),
    noiseFraction: requireFiniteNumber(raw["noiseFraction"], `${path}.noiseFraction`),
    grade: /** @type {HardwareMeasurement["grade"]} */ (grade),
    jerkPublishable: raw["jerkPublishable"],
    windowPoints: requireFiniteNumber(raw["windowPoints"], `${path}.windowPoints`),
    measuredAt: requireFiniteNumber(raw["measuredAt"], `${path}.measuredAt`),
  };
}

/**
 * Validates untrusted data into a profile, or throws explaining what is wrong.
 *
 * @param {unknown} value
 * @param {string} [path]
 * @returns {HardwareProfile}
 */
export function parseProfile(value, path = "perfil") {
  const raw = requireObject(value, path);
  const deviceId = requireString(raw["deviceId"], `${path}.deviceId`);
  const name = requireString(raw["name"], `${path}.name`);
  const createdAt = requireFiniteNumber(raw["createdAt"], `${path}.createdAt`);
  const updatedAt = requireFiniteNumber(raw["updatedAt"], `${path}.updatedAt`);

  const pedalsRaw = requireObject(raw["pedals"], `${path}.pedals`);
  /** @type {{ brake?: PedalEntry, throttle?: PedalEntry }} */
  const pedals = {};
  for (const role of ROLES) {
    const entry = pedalsRaw[role];
    if (entry === undefined) continue;
    pedals[role] = parsePedalEntry(entry, `${path}.pedals.${role}`);
  }

  /** @type {HardwareProfile} */
  const profile = { deviceId, name, createdAt, updatedAt, pedals };

  const hardware = raw["hardware"];
  if (hardware !== undefined) {
    profile.hardware = parseHardware(hardware, `${path}.hardware`);
  }
  return profile;
}

/**
 * @param {HardwareProfile} profile
 * @param {HardwareMeasurement} hardware
 * @param {number} [now]
 * @returns {HardwareProfile}
 */
export function withHardware(profile, hardware, now = Date.now()) {
  return { ...profile, updatedAt: now, hardware };
}

/**
 * @param {HardwareProfile[]} profiles
 * @returns {string} Pretty JSON, because these files get read and edited by hand.
 */
export function serialiseProfiles(profiles) {
  return JSON.stringify(
    { format: EXPORT_FORMAT, version: EXPORT_VERSION, profiles },
    null,
    2,
  );
}

/**
 * @param {string} text
 * @returns {HardwareProfile[]}
 */
export function parseProfilesExport(text) {
  /** @type {unknown} */
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("arquivo não é JSON válido");
  }

  const root = requireObject(parsed, "arquivo");
  if (root["format"] !== EXPORT_FORMAT) {
    throw new Error(`formato desconhecido — esperado "${EXPORT_FORMAT}"`);
  }

  const version = requireFiniteNumber(root["version"], "arquivo.version");
  if (version > EXPORT_VERSION) {
    throw new Error(
      `arquivo na versão ${version}, mas esta build entende até a ${EXPORT_VERSION}`,
    );
  }

  const list = root["profiles"];
  if (!Array.isArray(list)) {
    throw new Error("arquivo.profiles deve ser uma lista");
  }

  return list.map((entry, i) => parseProfile(entry, `perfil[${i}]`));
}
