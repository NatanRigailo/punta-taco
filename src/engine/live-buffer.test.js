/**
 * Live fixed-step buffer.
 *
 * The accumulator is small but easy to get subtly wrong: dropping a step makes
 * the trace run slow, replaying a backlog draws movement that never happened,
 * and both look plausible on screen.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { createLiveBuffer } from "./live-buffer.js";

/** @param {number} value */
const constant = (value) => () => ({ brake: value, throttle: value });

test("a primeira chamada só estabelece a referência de tempo", () => {
  const buffer = createLiveBuffer({ capacity: 10 });
  assert.equal(buffer.advance(1000, constant(1)), 0);
  assert.equal(buffer.series().filled, 0);
});

test("emite uma amostra por passo decorrido", () => {
  const buffer = createLiveBuffer({ capacity: 10, stepMs: 20 });
  buffer.advance(0, constant(0));
  assert.equal(buffer.advance(20, constant(1)), 1);
  assert.equal(buffer.advance(60, constant(1)), 2);
  assert.equal(buffer.series().filled, 3);
});

test("acumula frações em vez de perdê-las", () => {
  // Num monitor de 165Hz cada frame são ~6ms, e nenhum deles sozinho completa
  // um passo. Sem acumulador o traço nunca andaria.
  const buffer = createLiveBuffer({ capacity: 100, stepMs: 20 });
  buffer.advance(0, constant(1));
  let emitted = 0;
  for (let i = 1; i <= 100; i++) emitted += buffer.advance(i * 6.06, constant(1));

  // 606ms decorridos a 20ms por passo.
  assert.equal(emitted, 30);
});

test("não perde nem inventa passos em cadência irregular", () => {
  const buffer = createLiveBuffer({ capacity: 200, stepMs: 20 });
  buffer.advance(0, constant(1));
  const deltas = [6, 6, 7, 6, 33, 6, 6, 12, 6, 6, 6, 40, 6];
  let now = 0;
  let emitted = 0;
  for (const d of deltas) {
    now += d;
    emitted += buffer.advance(now, constant(1));
  }
  assert.equal(emitted, Math.floor(now / 20));
});

test("descarta o backlog de uma aba que ficou em segundo plano", () => {
  // Meio minuto parado replayado encheria o buffer com cópias de uma leitura,
  // desenhando uma linha reta sobre um período em que ninguém pedalou.
  const buffer = createLiveBuffer({ capacity: 10, stepMs: 20 });
  buffer.advance(0, constant(0));
  const emitted = buffer.advance(30000, constant(1));
  assert.equal(emitted, 1, "deveria retomar com um passo só");
});

test("mantém a capacidade e descarta o mais antigo", () => {
  const buffer = createLiveBuffer({ capacity: 4, stepMs: 20 });
  buffer.advance(0, constant(0));
  for (let i = 1; i <= 8; i++) buffer.advance(i * 20, constant(i));

  const { brake, filled } = buffer.series();
  assert.equal(brake.length, 4);
  assert.equal(filled, 4);
  assert.deepEqual(brake, [5, 6, 7, 8], "o mais novo tem que ficar no fim");
});

test("reset zera o estado e a referência de tempo", () => {
  const buffer = createLiveBuffer({ capacity: 4, stepMs: 20 });
  buffer.advance(0, constant(0));
  buffer.advance(80, constant(1));
  buffer.reset();

  assert.equal(buffer.series().filled, 0);
  assert.equal(buffer.advance(10000, constant(1)), 0, "deveria recomeçar do zero");
});
