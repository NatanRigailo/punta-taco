/**
 * Route matching.
 *
 * Small enough to eyeball, and exactly the kind of thing that fails silently:
 * a pattern matching too eagerly sends someone to the wrong view rather than
 * throwing.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { matchPattern } from "./router.js";

test("casa rota literal", () => {
  assert.deepEqual(matchPattern("/rapidos", "/rapidos"), {});
  assert.equal(matchPattern("/rapidos", "/sessoes"), null);
});

test("casa a raiz", () => {
  assert.deepEqual(matchPattern("/", "/"), {});
});

test("extrai parâmetro nomeado", () => {
  assert.deepEqual(matchPattern("/rapidos/:id", "/rapidos/trail"), { id: "trail" });
});

test("não casa profundidade diferente", () => {
  // Sem isso "/rapidos" casaria "/rapidos/trail" e a lista apareceria no lugar
  // do cenário.
  assert.equal(matchPattern("/rapidos", "/rapidos/trail"), null);
  assert.equal(matchPattern("/rapidos/:id", "/rapidos"), null);
});

test("decodifica parâmetro escapado", () => {
  assert.deepEqual(matchPattern("/rapidos/:id", "/rapidos/raio%20decrescente"), {
    id: "raio decrescente",
  });
});

test("barras extras não mudam o resultado", () => {
  assert.deepEqual(matchPattern("/rapidos", "/rapidos/"), {});
});
