/**
 * Scenario catalogue.
 *
 * O catálogo é dado, mas dado que a rota usa como chave e que o escopo
 * restringe — vale travar as invariantes antes que um cenário novo as quebre.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  QUICK_SCENARIOS,
  describePedal,
  isPlayable,
  scenarioById,
} from "./catalog.js";

test("ids são únicos", () => {
  // Id duplicado faria a rota abrir sempre o primeiro, silenciosamente.
  const ids = QUICK_SCENARIOS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("ids são seguros para URL", () => {
  for (const scenario of QUICK_SCENARIOS) {
    assert.match(scenario.id, /^[a-z0-9-]+$/, `id inválido: ${scenario.id}`);
  }
});

test("treinos rápidos ficam entre 5 e 8 segundos", () => {
  // É o que separa esta categoria de "Sessões"; estourar aqui significa que o
  // cenário pertence à outra categoria.
  for (const scenario of QUICK_SCENARIOS) {
    assert.ok(
      scenario.durationMs >= 5000 && scenario.durationMs <= 8000,
      `${scenario.id} dura ${scenario.durationMs}ms`,
    );
  }
});

test("todo cenário descreve a situação, a referência e o que mede", () => {
  // A situação é o que separa cenário de gesto abstrato; sem ela o catálogo
  // volta a ser vocabulário de manual.
  for (const scenario of QUICK_SCENARIOS) {
    assert.ok(scenario.situation.length > 0, `${scenario.id} sem situação`);
    assert.ok(scenario.reference.length > 0, `${scenario.id} sem referência real`);
    assert.ok(scenario.focus.length > 0, `${scenario.id} sem foco declarado`);
  }
});

test("cenário bloqueado diz o motivo", () => {
  for (const scenario of QUICK_SCENARIOS) {
    if (isPlayable(scenario)) continue;
    assert.ok(
      scenario.blockedBy && scenario.blockedBy.length > 0,
      `${scenario.id} bloqueado sem explicação`,
    );
  }
});

test("existe pelo menos um cenário jogável", () => {
  assert.ok(QUICK_SCENARIOS.some(isPlayable));
});

test("scenarioById encontra e recusa", () => {
  assert.equal(scenarioById("entrada-rapida")?.name, "Entrada de curva rápida");
  assert.equal(scenarioById("inexistente"), null);
});

test("describePedal cobre os três casos", () => {
  assert.equal(describePedal("brake"), "freio");
  assert.equal(describePedal("throttle"), "acelerador");
  assert.equal(describePedal("both"), "freio e acelerador");
});
