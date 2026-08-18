/**
 * Calibration maths.
 *
 * Uses the Node built-in test runner and assert module, so the suite costs zero
 * packages. Nothing here touches the DOM: `normalise` and `describeCalibration`
 * are pure, which is exactly why they are worth testing — a sign error in the
 * inversion handling would silently produce metrics for a pedal running
 * backwards, with no visible symptom.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { normalise, describeCalibration } from "./calibration.js";

/**
 * @param {number} restRaw
 * @param {number} pressedRaw
 * @param {number} [deadzone]
 */
const cal = (restRaw, pressedRaw, deadzone = 0) => ({
  restRaw,
  pressedRaw,
  deadzone,
  restNoise: 0,
});

const close = (/** @type {number} */ got, /** @type {number} */ want) =>
  assert.ok(Math.abs(got - want) < 1e-9, `got ${got}, want ${want}`);

test("eixo normal mapeia repouso, meio e fundo", () => {
  const c = cal(-1, 1);
  close(normalise(c, -1), 0);
  close(normalise(c, 0), 0.5);
  close(normalise(c, 1), 1);
});

test("eixo invertido é corrigido pela própria subtração, sem flag", () => {
  const c = cal(1, -1);
  close(normalise(c, 1), 0);
  close(normalise(c, 0), 0.5);
  close(normalise(c, -1), 1);
  assert.equal(describeCalibration(c).inverted, true);
});

test("curso parcial usa o range observado, não o nominal", () => {
  // Pedaleira que nunca alcança os extremos de -1..1 do browser.
  const c = cal(-0.8, 0.4);
  close(normalise(c, -0.8), 0);
  close(normalise(c, -0.2), 0.5);
  close(normalise(c, 0.4), 1);
});

test("deadzone zera abaixo do limiar e mantém o topo alcançável", () => {
  const c = cal(-1, 1, 0.1);
  close(normalise(c, -0.9), 0); // t = 0.05, dentro da deadzone
  close(normalise(c, -0.8), 0); // t = 0.10, exatamente no limiar
  close(normalise(c, -0.78), (0.11 - 0.1) / 0.9);
  // Sem o reescalonamento o fundo pararia em 0.9 e o pedal nunca chegaria a 100%.
  close(normalise(c, 1), 1);
});

test("leitura fora do range calibrado é limitada, nunca extrapolada", () => {
  const normal = cal(-1, 1);
  close(normalise(normal, 1.5), 1);
  close(normalise(normal, -1.5), 0);

  const inverted = cal(1, -1);
  close(normalise(inverted, -1.5), 1);
  close(normalise(inverted, 1.5), 0);
});

test("span zero devolve zero em vez de NaN ou Infinity", () => {
  // Acontece quando a captura falha e os dois pontos coincidem; a métrica não
  // pode virar NaN e contaminar todo o resto silenciosamente.
  const c = cal(0.5, 0.5, 0.01);
  const value = normalise(c, 0.9);
  assert.ok(Number.isFinite(value));
  assert.equal(value, 0);
});

test("describeCalibration reporta curso contra o span de 2.0 do eixo", () => {
  const d = describeCalibration(cal(-1, 1, 0.02));
  close(d.travelPct, 100);
  close(d.deadzonePct, 2);
  assert.equal(d.inverted, false);
});
