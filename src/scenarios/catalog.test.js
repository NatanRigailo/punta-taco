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
  describeAxis,
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

test("todo cenário descreve a forma do movimento e o que mede", () => {
  for (const scenario of QUICK_SCENARIOS) {
    assert.ok(scenario.shape.length > 0, `${scenario.id} sem forma declarada`);
    assert.ok(scenario.detail.length > 0, `${scenario.id} sem descrição do que é bom`);
    assert.ok(scenario.focus.length > 0, `${scenario.id} sem foco declarado`);
  }
});

test("todo cenário declara ao menos um eixo de treino", () => {
  // Tempo, quantidade, coordenação e suavidade são o que o produto treina.
  // Um cenário que não move nenhum deles não tem por que existir.
  for (const scenario of QUICK_SCENARIOS) {
    assert.ok(scenario.trains.length > 0, `${scenario.id} não treina nada`);
    assert.equal(
      new Set(scenario.trains).size,
      scenario.trains.length,
      `${scenario.id} repete eixo`,
    );
  }
});

test("os quatro eixos de treino estão cobertos pelo catálogo", () => {
  // Um eixo sem nenhum cenário é uma lacuna no produto, não uma escolha.
  const covered = new Set(QUICK_SCENARIOS.flatMap((s) => s.trains));
  for (const axis of ["timing", "amount", "coordination", "smoothness"]) {
    assert.ok(covered.has(/** @type {any} */ (axis)), `nenhum cenário treina ${axis}`);
  }
});

test("nenhum cenário cita pista ou curva real", () => {
  // O app não tem velocidade, carga nem pista: prometer contexto que a tela
  // não entrega convida a comparação com o simulador, que este produto perde.
  const banned = /interlagos|monza|senna|ferradura|junção|juncao|curva \d|lago|spa|monaco/i;
  for (const scenario of QUICK_SCENARIOS) {
    const text = `${scenario.name} ${scenario.shape} ${scenario.detail}`;
    assert.doesNotMatch(text, banned, `${scenario.id} cita referência real`);
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

test("todo cenário declara como é executado", () => {
  // O tipo decide qual runner a view monta; um valor novo sem runner cairia
  // silenciosamente no caminho padrão e gravaria a tentativa errada.
  for (const scenario of QUICK_SCENARIOS) {
    assert.ok(
      scenario.kind === "trace" || scenario.kind === "launch",
      `${scenario.id} com kind inválido: ${scenario.kind}`,
    );
  }
});

test("cenário de largada não depende do guia na tela", () => {
  // É o que permite ele existir antes do M1: o alvo dele é um evento.
  const launch = QUICK_SCENARIOS.filter((s) => s.kind === "launch");
  assert.ok(launch.length > 0);
  for (const scenario of launch) {
    assert.ok(isPlayable(scenario), `${scenario.id} não deveria estar bloqueado`);
    assert.ok(scenario.trains.includes("timing"), "largada treina tempo por definição");
  }
});

test("existe pelo menos um cenário jogável", () => {
  assert.ok(QUICK_SCENARIOS.some(isPlayable));
});

test("scenarioById encontra e recusa", () => {
  assert.equal(scenarioById("liberacao-longa")?.name, "Liberação longa");
  assert.equal(scenarioById("inexistente"), null);
});

test("describeAxis cobre os quatro eixos", () => {
  assert.equal(describeAxis("timing"), "tempo");
  assert.equal(describeAxis("amount"), "quantidade");
  assert.equal(describeAxis("coordination"), "coordenação");
  assert.equal(describeAxis("smoothness"), "suavidade");
});

test("describePedal cobre os três casos", () => {
  assert.equal(describePedal("brake"), "freio");
  assert.equal(describePedal("throttle"), "acelerador");
  assert.equal(describePedal("both"), "freio e acelerador");
});
