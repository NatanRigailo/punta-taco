/**
 * Fidelity of a realized channel against its guide.
 *
 * É o primeiro número que o usuário vai ler sobre a própria pisada, então errar
 * para o lado generoso é pior que errar para o lado severo: um "90% dentro da
 * banda" falso destrói a confiança em tudo que vier depois.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { compare } from "./scenario-run.js";

const flat = (/** @type {number} */ value, /** @type {number} */ n) =>
  new Array(n).fill(value);

test("traço idêntico ao guia fica inteiro dentro da banda", () => {
  const result = compare(flat(0.5, 20), flat(0.5, 20), flat(0.05, 20));
  assert.equal(result.rms, 0);
  assert.equal(result.insideFraction, 1);
});

test("erro dentro da tolerância ainda conta como dentro", () => {
  const result = compare(flat(0.54, 20), flat(0.5, 20), flat(0.05, 20));
  assert.equal(result.insideFraction, 1);
  assert.ok(result.rms > 0, "estar dentro da banda não zera o erro");
});

test("erro acima da tolerância conta como fora", () => {
  const result = compare(flat(0.6, 20), flat(0.5, 20), flat(0.05, 20));
  assert.equal(result.insideFraction, 0);
});

test("a fração dentro da banda é proporcional", () => {
  const realized = [...flat(0.5, 10), ...flat(0.9, 10)];
  const result = compare(realized, flat(0.5, 20), flat(0.05, 20));
  assert.equal(result.insideFraction, 0.5);
});

test("erro para os dois lados conta igual", () => {
  // Ficar abaixo do alvo não é mais aceitável que ficar acima; ambos são
  // desvio do que estava sendo pedido.
  const acima = compare(flat(0.6, 10), flat(0.5, 10), flat(0.05, 10));
  const abaixo = compare(flat(0.4, 10), flat(0.5, 10), flat(0.05, 10));
  assert.equal(acima.insideFraction, abaixo.insideFraction);
  assert.ok(Math.abs(acima.rms - abaixo.rms) < 1e-12);
});

test("tolerância variável é respeitada ponto a ponto", () => {
  // Um trecho apertado e outro folgado, com o mesmo erro nos dois.
  const tolerance = [...flat(0.02, 10), ...flat(0.2, 10)];
  const result = compare(flat(0.6, 20), flat(0.5, 20), tolerance);
  assert.equal(result.insideFraction, 0.5);
});

test("séries de tamanhos diferentes usam o menor", () => {
  const result = compare(flat(0.5, 30), flat(0.5, 20), flat(0.05, 20));
  assert.equal(result.insideFraction, 1);
});

test("série vazia não vira divisão por zero", () => {
  const result = compare([], [], []);
  assert.equal(result.rms, 0);
  assert.equal(result.insideFraction, 0);
});
