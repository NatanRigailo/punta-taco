/**
 * Minimal promise wrapper over IndexedDB.
 *
 * IndexedDB's own API is event-based and predates promises, which is why every
 * project reaches for a library here. This file exists so that this one does
 * not: the surface actually used is four operations on a single store, and that
 * is far cheaper to own than to depend on.
 */

const DB_NAME = "punta-taco";
const DB_VERSION = 1;
const PROFILE_STORE = "profiles";

/** @type {Promise<IDBDatabase> | null} */
let opening = null;

/**
 * Schema migrations live here. `oldVersion` is 0 on a fresh database, so a new
 * user runs every step in order; an existing one runs only what it is missing.
 *
 * @param {IDBDatabase} db
 * @param {number} oldVersion
 */
function migrate(db, oldVersion) {
  if (oldVersion < 1) {
    // Keyed by the gamepad id string: the numeric index the browser assigns is
    // reused between sessions and across devices, so it cannot identify a
    // pedaleira from one day to the next.
    db.createObjectStore(PROFILE_STORE, { keyPath: "deviceId" });
  }
}

/** @returns {Promise<IDBDatabase>} */
export function openDb() {
  if (opening) return opening;

  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      migrate(request.result, event.oldVersion);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("falha ao abrir o banco"));
    request.onblocked = () =>
      reject(new Error("banco bloqueado por outra aba — feche as demais abas do Punta Taco"));
  });

  // A failed open must not be cached, or every later call inherits the failure.
  opening.catch(() => {
    opening = null;
  });

  return opening;
}

/**
 * @template T
 * @param {IDBRequest<T>} request
 * @returns {Promise<T>}
 */
function await_(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("operação falhou"));
  });
}

/**
 * @param {IDBTransactionMode} mode
 * @returns {Promise<IDBObjectStore>}
 */
async function profileStore(mode) {
  const db = await openDb();
  return db.transaction(PROFILE_STORE, mode).objectStore(PROFILE_STORE);
}

/**
 * @param {import("./profiles.js").HardwareProfile} profile
 * @returns {Promise<void>}
 */
export async function putProfile(profile) {
  const store = await profileStore("readwrite");
  await await_(store.put(profile));
}

/**
 * @param {string} deviceId
 * @returns {Promise<import("./profiles.js").HardwareProfile | null>}
 */
export async function getProfile(deviceId) {
  const store = await profileStore("readonly");
  const found = await await_(store.get(deviceId));
  return found === undefined ? null : /** @type {import("./profiles.js").HardwareProfile} */ (found);
}

/** @returns {Promise<import("./profiles.js").HardwareProfile[]>} */
export async function listProfiles() {
  const store = await profileStore("readonly");
  const all = await await_(store.getAll());
  return /** @type {import("./profiles.js").HardwareProfile[]} */ (all);
}

/**
 * @param {string} deviceId
 * @returns {Promise<void>}
 */
export async function deleteProfile(deviceId) {
  const store = await profileStore("readwrite");
  await await_(store.delete(deviceId));
}
