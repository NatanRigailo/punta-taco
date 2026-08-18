/**
 * Drill catalogue.
 *
 * O catálogo é dado, mas dado que a rota usa como chave e que o escopo restringe
 * — vale travar as invariantes antes que um drill novo as quebre.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { QUICK_DRILLS, describePedal, drillById } from "./catalog.js";

test("ids são únicos", () => {
  // Id duplicado faria a rota abrir sempre o primeiro, silenciosamente.
  const ids = QUICK_DRILLS.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("ids são seguros para URL", () => {
  for (const drill of QUICK_DRILLS) {
    assert.match(drill.id, /^[a-z0-9-]+$/, `id inválido: ${drill.id}`);
  }
});

test("treinos rápidos ficam entre 5 e 8 segundos", () => {
  // É o que separa esta categoria de "Sessões"; estourar aqui significa que o
  // drill pertence à outra categoria.
  for (const drill of QUICK_DRILLS) {
    assert.ok(
      drill.durationMs >= 5000 && drill.durationMs <= 8000,
      `${drill.id} dura ${drill.durationMs}ms`,
    );
  }
});

test("todo drill diz qual métrica ele move", () => {
  for (const drill of QUICK_DRILLS) {
    assert.ok(drill.focus.length > 0, `${drill.id} sem foco declarado`);
    assert.ok(drill.summary.length > 0, `${drill.id} sem resumo`);
  }
});

test("drillById encontra e recusa", () => {
  assert.equal(drillById("trail")?.name, "Trail braking");
  assert.equal(drillById("inexistente"), null);
});

test("describePedal cobre os três casos", () => {
  assert.equal(describePedal("brake"), "freio");
  assert.equal(describePedal("throttle"), "acelerador");
  assert.equal(describePedal("both"), "freio e acelerador");
});
