/**
 * Profile building and, mainly, profile parsing.
 *
 * The parser is the only place in the app that consumes data it did not
 * produce. A profile file that gets half-accepted would leave the app running
 * metrics on a nonsense calibration with no visible symptom, so every rejection
 * path is worth a test.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  EXPORT_FORMAT,
  createProfile,
  parseProfile,
  parseProfilesExport,
  serialiseProfiles,
  withHardware,
  withPedal,
  withoutPedal,
} from "./profiles.js";

const hardware = {
  reportRateHz: 51.8,
  medianGapMs: 19.3,
  stepFraction: 0.0025,
  bits: 8.64,
  noiseFraction: 0,
  grade: "full",
  jerkPublishable: true,
  windowPoints: 5,
  measuredAt: 5000,
};

const calibration = { restRaw: -1, pressedRaw: 1, deadzone: 0.01, restNoise: 0.002 };

/** @param {Partial<Record<string, unknown>>} [overrides] */
const validProfile = (overrides = {}) => ({
  deviceId: "PXN VD4 (Vendor: 36e6 Product: 400d)",
  name: "PXN",
  createdAt: 1000,
  updatedAt: 2000,
  pedals: { brake: { axis: 3, calibration } },
  ...overrides,
});

test("withPedal não muta o perfil original", () => {
  const original = createProfile("dev", "PXN", 1000);
  const updated = withPedal(original, "brake", { axis: 3, calibration }, 2000);

  assert.deepEqual(original.pedals, {}, "o original foi mutado");
  assert.equal(updated.pedals.brake?.axis, 3);
  assert.equal(updated.updatedAt, 2000);
  assert.equal(updated.createdAt, 1000, "createdAt não deve mudar");
});

test("withoutPedal remove apenas o papel pedido", () => {
  let profile = createProfile("dev", "PXN", 1000);
  profile = withPedal(profile, "brake", { axis: 3, calibration }, 1000);
  profile = withPedal(profile, "throttle", { axis: 1, calibration }, 1000);

  const result = withoutPedal(profile, "brake", 3000);
  assert.equal(result.pedals.brake, undefined);
  assert.equal(result.pedals.throttle?.axis, 1);
  assert.equal(profile.pedals.brake?.axis, 3, "o original foi mutado");
});

test("parseProfile aceita um perfil bem formado", () => {
  const parsed = parseProfile(validProfile());
  assert.equal(parsed.deviceId, "PXN VD4 (Vendor: 36e6 Product: 400d)");
  assert.equal(parsed.pedals.brake?.calibration.deadzone, 0.01);
});

test("parseProfile ignora papéis desconhecidos em vez de propagá-los", () => {
  const parsed = parseProfile(
    validProfile({ pedals: { brake: { axis: 3, calibration }, embreagem: { axis: 9 } } }),
  );
  assert.deepEqual(Object.keys(parsed.pedals), ["brake"]);
});

test("parseProfile rejeita campos obrigatórios ausentes ou vazios", () => {
  assert.throws(() => parseProfile(validProfile({ deviceId: undefined })), /deviceId/);
  assert.throws(() => parseProfile(validProfile({ deviceId: "" })), /deviceId/);
  assert.throws(() => parseProfile(validProfile({ createdAt: "ontem" })), /createdAt/);
  assert.throws(() => parseProfile(null), /objeto/);
  assert.throws(() => parseProfile([]), /objeto/);
});

test("parseProfile rejeita calibração impossível", () => {
  const bad = (/** @type {Record<string, unknown>} */ cal) =>
    validProfile({ pedals: { brake: { axis: 3, calibration: cal } } });

  // Repouso igual ao fundo faria normalise devolver sempre zero.
  assert.throws(
    () => parseProfile(bad({ ...calibration, pressedRaw: -1 })),
    /coincidem/,
  );
  assert.throws(() => parseProfile(bad({ ...calibration, deadzone: 1 })), /deadzone/);
  assert.throws(() => parseProfile(bad({ ...calibration, deadzone: -0.1 })), /deadzone/);
  assert.throws(() => parseProfile(bad({ ...calibration, restNoise: -1 })), /restNoise/);
  assert.throws(() => parseProfile(bad({ ...calibration, restRaw: NaN })), /restRaw/);
});

test("parseProfile rejeita índice de eixo inválido", () => {
  const withAxis = (/** @type {unknown} */ axis) =>
    validProfile({ pedals: { brake: { axis, calibration } } });

  assert.throws(() => parseProfile(withAxis(-1)), /axis/);
  assert.throws(() => parseProfile(withAxis(1.5)), /axis/);
  assert.throws(() => parseProfile(withAxis("3")), /axis/);
});

test("export e import fazem a volta completa", () => {
  const profile = withPedal(createProfile("dev", "PXN", 1000), "brake", {
    axis: 3,
    calibration,
  }, 2000);

  const restored = parseProfilesExport(serialiseProfiles([profile]));
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0], profile);
});

test("import rejeita arquivo alheio ou corrompido", () => {
  assert.throws(() => parseProfilesExport("{nao é json"), /JSON/);
  assert.throws(
    () => parseProfilesExport(JSON.stringify({ format: "outro-app", version: 1, profiles: [] })),
    /formato desconhecido/,
  );
  assert.throws(
    () => parseProfilesExport(JSON.stringify({ format: EXPORT_FORMAT, version: 1 })),
    /lista/,
  );
});

test("import recusa versão de formato futura em vez de adivinhar", () => {
  const future = JSON.stringify({ format: EXPORT_FORMAT, version: 99, profiles: [] });
  assert.throws(() => parseProfilesExport(future), /versão 99/);
});

test("import aponta qual perfil da lista está quebrado", () => {
  const payload = JSON.stringify({
    format: EXPORT_FORMAT,
    version: 1,
    profiles: [validProfile(), validProfile({ name: 42 })],
  });
  assert.throws(() => parseProfilesExport(payload), /perfil\[1\]\.name/);
});

test("withHardware anexa a medição sem tocar no resto do perfil", () => {
  const base = withPedal(createProfile("dev", "PXN", 1000), "brake", {
    axis: 3,
    calibration,
  }, 2000);

  const measured = withHardware(base, /** @type {any} */ (hardware), 3000);
  assert.equal(measured.hardware?.grade, "full");
  assert.equal(measured.pedals.brake?.axis, 3, "os pedais não deviam mudar");
  assert.equal(measured.updatedAt, 3000);
  assert.equal(base.hardware, undefined, "o original foi mutado");
});

test("perfil sem medição continua válido", () => {
  // A medição só existe depois que o diagnóstico roda; um perfil antigo,
  // gravado antes desta funcionalidade, não pode ser recusado.
  const parsed = parseProfile(validProfile());
  assert.equal(parsed.hardware, undefined);
});

test("parseProfile aceita e devolve a medição de hardware", () => {
  const parsed = parseProfile(validProfile({ hardware }));
  assert.equal(parsed.hardware?.grade, "full");
  assert.equal(parsed.hardware?.jerkPublishable, true);
  assert.equal(parsed.hardware?.windowPoints, 5);
});

test("parseProfile rejeita medição de hardware incoerente", () => {
  const withHw = (/** @type {Record<string, unknown>} */ overrides) =>
    validProfile({ hardware: { ...hardware, ...overrides } });

  assert.throws(() => parseProfile(withHw({ grade: "otimo" })), /grade/);
  assert.throws(() => parseProfile(withHw({ jerkPublishable: "sim" })), /jerkPublishable/);
  // Degrau maior que o curso inteiro, ou zero, nao descrevem hardware nenhum.
  assert.throws(() => parseProfile(withHw({ stepFraction: 0 })), /stepFraction/);
  assert.throws(() => parseProfile(withHw({ stepFraction: 1.5 })), /stepFraction/);
  assert.throws(() => parseProfile(withHw({ bits: "oito" })), /bits/);
});

test("a medição sobrevive ao round-trip de export e import", () => {
  const profile = withHardware(
    createProfile("dev", "PXN", 1000),
    /** @type {any} */ (hardware),
    2000,
  );
  const restored = parseProfilesExport(serialiseProfiles([profile]));
  assert.deepEqual(restored[0], profile);
});
