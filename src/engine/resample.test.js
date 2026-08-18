/**
 * Fixed-grid resampling.
 *
 * This is the layer every later metric stands on: if the grid is not exactly
 * uniform, a derivative computed from it is wrong in a way no test downstream
 * would attribute back here.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { STEP_MS, describeCadence, resampleToGrid } from "./resample.js";

/**
 * @param {number} t
 * @param {number} brake
 * @param {number} [throttle]
 */
const s = (t, brake, throttle = 0) => ({ t, brake, throttle });

const close = (/** @type {number} */ got, /** @type {number} */ want, tol = 1e-9) =>
  assert.ok(Math.abs(got - want) < tol, `got ${got}, want ${want}`);

test("uma tentativa de 8s no passo de 20ms dá exatamente 400 pontos", () => {
  const series = resampleToGrid([s(0, 0), s(8000, 1)], { durationMs: 8000 });
  assert.equal(series.brake.length, 400);
  assert.equal(series.throttle.length, 400);
  assert.equal(series.stepMs, STEP_MS);
});

test("o passo é uniforme independente da cadência do dispositivo", () => {
  // Cadência irregular como a medida na PXN: intervalos de 1x, 2x e 3x.
  const raw = [s(0, 0), s(19, 0.1), s(57, 0.3), s(76, 0.4), s(133, 0.7), s(200, 1)];
  const series = resampleToGrid(raw, { durationMs: 200 });

  assert.equal(series.brake.length, 10);
  // A grade é 0,20,…,180 por construção; o teste real é o valor interpolado.
  close(series.brake[0] ?? -1, 0);
  close(series.brake[1] ?? -1, 0.1 + (1 / 38) * 0.2); // t=20, entre 19 e 57
});

test("interpola linearmente entre duas leituras", () => {
  const series = resampleToGrid([s(0, 0), s(40, 1)], { durationMs: 60 });
  close(series.brake[0] ?? -1, 0);
  close(series.brake[1] ?? -1, 0.5); // t=20, meio do caminho
  close(series.brake[2] ?? -1, 1); // t=40, exatamente na segunda leitura
});

test("segura o primeiro valor antes da primeira leitura", () => {
  // O dispositivo pode demorar a reportar depois do início da tentativa.
  const series = resampleToGrid([s(50, 0.7), s(90, 0.9)], { durationMs: 100 });
  close(series.brake[0] ?? -1, 0.7);
  close(series.brake[1] ?? -1, 0.7);
  close(series.brake[2] ?? -1, 0.7); // t=40, ainda antes da primeira
});

test("segura o último valor depois da última leitura", () => {
  const series = resampleToGrid([s(0, 0.2), s(30, 0.8)], { durationMs: 100 });
  close(series.brake[4] ?? -1, 0.8); // t=80, muito depois da última
});

test("leituras repetidas não geram degrau falso", () => {
  // O dispositivo reporta sem mudar de valor; a interpolação entre dois pontos
  // iguais tem que ser plana, nao inventar rampa.
  const series = resampleToGrid([s(0, 0.5), s(19, 0.5), s(38, 0.5)], { durationMs: 40 });
  close(series.brake[0] ?? -1, 0.5);
  close(series.brake[1] ?? -1, 0.5);
});

test("os dois canais são reamostrados de forma independente", () => {
  const series = resampleToGrid([s(0, 0, 1), s(40, 1, 0)], { durationMs: 60 });
  close(series.brake[1] ?? -1, 0.5);
  close(series.throttle[1] ?? -1, 0.5);
  close(series.brake[2] ?? -1, 1);
  close(series.throttle[2] ?? -1, 0);
});

test("entrada vazia produz série de zeros do tamanho certo", () => {
  const series = resampleToGrid([], { durationMs: 100 });
  assert.equal(series.brake.length, 5);
  assert.ok(series.brake.every((v) => v === 0));
});

test("uma leitura só produz série constante", () => {
  const series = resampleToGrid([s(0, 0.42)], { durationMs: 100 });
  assert.ok(series.brake.every((v) => v === 0.42));
});

test("duas leituras no mesmo instante não geram divisão por zero", () => {
  const series = resampleToGrid([s(0, 0.1), s(0, 0.9), s(40, 0.9)], { durationMs: 60 });
  assert.ok(series.brake.every((v) => Number.isFinite(v)));
});

test("passo customizado é respeitado", () => {
  const series = resampleToGrid([s(0, 0), s(100, 1)], { durationMs: 100, stepMs: 10 });
  assert.equal(series.brake.length, 10);
  assert.equal(series.stepMs, 10);
});

test("parâmetros inválidos falham alto", () => {
  assert.throws(() => resampleToGrid([], { durationMs: 100, stepMs: 0 }), /stepMs/);
  assert.throws(() => resampleToGrid([], { durationMs: -1 }), /durationMs/);
});

test("describeCadence resume os intervalos reais do dispositivo", () => {
  const cadence = describeCadence([s(0, 0), s(19, 0), s(38, 0), s(95, 0)]);
  assert.equal(cadence.count, 4);
  close(cadence.medianMs, 19); // intervalos: 19, 19, 57
  close(cadence.maxMs, 57);
});

test("describeCadence aguenta série vazia ou de um ponto", () => {
  assert.deepEqual(describeCadence([]), { count: 0, medianMs: 0, maxMs: 0 });
  assert.deepEqual(describeCadence([s(0, 0)]), { count: 1, medianMs: 0, maxMs: 0 });
});
