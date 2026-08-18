/**
 * Hardware diagnosis.
 *
 * The verdict decides what the app is allowed to claim about a user's pedaleira,
 * so the failure that matters is the optimistic one: grading bad hardware as
 * good would publish a jerk number nobody should trust.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  analyseCadence,
  analyseNoise,
  analyseResolution,
  describeGrade,
  judge,
} from "./diagnostics.js";

/**
 * @param {number} gapMs
 * @param {number} count
 * @param {(i: number) => number} value
 */
const evenly = (gapMs, count, value) =>
  Array.from({ length: count }, (_, i) => ({ t: i * gapMs, value: value(i) }));

/**
 * Quantised sweep: `levels` steps spread across `span`, like a real axis.
 * @param {number} levels
 * @param {number} span
 */
const sweep = (levels, span) => {
  const step = span / (levels - 1);
  return evenly(20, levels, (i) => -1 + i * step);
};

const close = (/** @type {number} */ got, /** @type {number} */ want, tol = 1e-6) =>
  assert.ok(Math.abs(got - want) < tol, `got ${got}, want ${want}`);

test("analyseCadence resume taxa e percentis dos intervalos", () => {
  const readings = evenly(20, 51, () => 0);
  const cadence = analyseCadence(readings, 1000);
  close(cadence.reportRateHz, 51);
  close(cadence.medianGapMs, 20);
  close(cadence.maxGapMs, 20);
  assert.equal(cadence.count, 51);
});

test("analyseCadence expõe o maior buraco, não só a média", () => {
  // Uma pausa longa some numa média e é exatamente o que invalida a medição.
  const readings = [{ t: 0, value: 0 }, { t: 20, value: 0 }, { t: 600, value: 0 }];
  const cadence = analyseCadence(readings, 600);
  close(cadence.maxGapMs, 580);
});

test("analyseCadence aguenta entrada vazia", () => {
  const cadence = analyseCadence([], 1000);
  assert.equal(cadence.count, 0);
  assert.equal(cadence.maxGapMs, 0);
});

test("analyseResolution recupera o degrau de um eixo quantizado", () => {
  // 8 bits sobre o range de 2.0 -> degrau de 2/255.
  const readings = sweep(256, 2);
  const resolution = analyseResolution(readings);
  close(resolution.stepRaw, 2 / 255, 1e-9);
  assert.equal(resolution.levels, 256);
  close(resolution.spanRaw, 2, 1e-9);
});

test("analyseResolution usa a mediana e ignora um salto isolado", () => {
  // Um trecho percorrido rápido deixa um buraco grande entre níveis; a mediana
  // tem que continuar refletindo o degrau real.
  const readings = [...sweep(64, 1), { t: 9999, value: 0.9 }];
  const resolution = analyseResolution(readings);
  close(resolution.stepRaw, 1 / 63, 1e-9);
});

test("analyseResolution aguenta eixo que não se moveu", () => {
  const resolution = analyseResolution(evenly(20, 10, () => 0.5));
  assert.equal(resolution.levels, 1);
  assert.equal(resolution.stepRaw, 0);
});

test("analyseNoise mede desvio e pico a pico em repouso", () => {
  const readings = [
    { t: 0, value: 0.5 },
    { t: 20, value: 0.52 },
    { t: 40, value: 0.48 },
  ];
  const noise = analyseNoise(readings);
  close(noise.peakToPeakRaw, 0.04, 1e-9);
  assert.equal(noise.distinct, 3);
  assert.ok(noise.stdevRaw > 0);
});

test("analyseNoise reporta zero para eixo perfeitamente estável", () => {
  // Foi o que a PXN VD4 realmente fez: um único valor em 5 segundos.
  const noise = analyseNoise(evenly(20, 250, () => -1));
  assert.equal(noise.stdevRaw, 0);
  assert.equal(noise.peakToPeakRaw, 0);
  assert.equal(noise.distinct, 1);
});

test("a resolução é julgada contra o curso calibrado, não o eixo nominal", () => {
  // Mesmo hardware, mas o pedal só percorre 40% do eixo. Os degraus são os
  // mesmos em unidades brutas, e portanto o dobro de grosseiros em relação ao
  // que o usuário consegue alcançar.
  const resolution = { stepRaw: 2 / 255, levels: 256, spanRaw: 0.8 };
  const cadence = analyseCadence(evenly(20, 51, () => 0), 1000);
  const noise = analyseNoise([{ t: 0, value: 0 }]);

  const full = judge({ cadence, resolution, noise, travelRaw: 2, stepMs: 20 });
  const partial = judge({ cadence, resolution, noise, travelRaw: 0.8, stepMs: 20 });

  assert.ok(partial.bits < full.bits, "curso menor deveria dar menos bits efetivos");
  close(full.bits, 8, 0.05);
});

test("hardware bom recebe grau completo", () => {
  const verdict = judge({
    cadence: analyseCadence(evenly(20, 51, () => 0), 1000),
    resolution: { stepRaw: 0.005, levels: 380, spanRaw: 2 },
    noise: { stdevRaw: 0, peakToPeakRaw: 0, distinct: 1 },
    travelRaw: 2,
    stepMs: 20,
  });
  assert.equal(verdict.grade, "full");
  assert.equal(verdict.jerkPublishable, true);
  assert.deepEqual(verdict.warnings, []);
});

test("resolução ruim derruba jerk mas preserva as demais métricas", () => {
  const verdict = judge({
    cadence: analyseCadence(evenly(20, 51, () => 0), 1000),
    resolution: { stepRaw: 0.12, levels: 17, spanRaw: 2 },
    noise: { stdevRaw: 0, peakToPeakRaw: 0, distinct: 1 },
    travelRaw: 2,
    stepMs: 20,
  });
  assert.equal(verdict.jerkPublishable, false);
  assert.notEqual(verdict.grade, "full");
  assert.ok(verdict.warnings.some((w) => w.includes("não sustenta jerk")));
  assert.ok(
    verdict.warnings.some((w) => w.includes("demais métricas continuam válidas")),
    "o aviso precisa dizer o que ainda funciona, não só o que quebrou",
  );
});

test("taxa baixa demais vira aviso explícito", () => {
  const verdict = judge({
    cadence: analyseCadence(evenly(50, 21, () => 0), 1000),
    resolution: { stepRaw: 0.005, levels: 380, spanRaw: 2 },
    noise: { stdevRaw: 0, peakToPeakRaw: 0, distinct: 1 },
    travelRaw: 2,
    stepMs: 20,
  });
  assert.ok(verdict.warnings.some((w) => w.includes("Hz")));
  assert.notEqual(verdict.grade, "full");
});

test("buraco na medição e curso incompleto são reportados", () => {
  const verdict = judge({
    cadence: analyseCadence([{ t: 0, value: 0 }, { t: 700, value: 0 }], 700),
    resolution: { stepRaw: 0.005, levels: 100, spanRaw: 0.5 },
    noise: { stdevRaw: 0, peakToPeakRaw: 0, distinct: 1 },
    travelRaw: 2,
    stepMs: 20,
  });
  assert.ok(verdict.warnings.some((w) => w.includes("sem leitura")));
  assert.ok(verdict.warnings.some((w) => w.includes("curso percorrido")));
});

test("ruído acima de 1% do curso pede deadzone", () => {
  const verdict = judge({
    cadence: analyseCadence(evenly(20, 51, () => 0), 1000),
    resolution: { stepRaw: 0.005, levels: 380, spanRaw: 2 },
    noise: { stdevRaw: 0.01, peakToPeakRaw: 0.06, distinct: 40 },
    travelRaw: 2,
    stepMs: 20,
  });
  assert.ok(verdict.warnings.some((w) => w.includes("deadzone")));
});

test("a PXN VD4 medida de verdade fecha em grau completo", () => {
  // Números de docs/medicoes.md: ~50Hz, degrau de 0,25% do curso, ruído zero.
  const verdict = judge({
    cadence: analyseCadence(evenly(19.3, 52, () => 0), 1000),
    resolution: { stepRaw: 0.005, levels: 380, spanRaw: 2 },
    noise: { stdevRaw: 0, peakToPeakRaw: 0, distinct: 1 },
    travelRaw: 2,
    stepMs: 20,
  });
  assert.equal(verdict.grade, "full");
  assert.equal(verdict.windowPoints, 5, "a PXN não precisa de janela alargada");
  close(verdict.bits, 8.64, 0.1);
});

test("describeGrade diz o que cada grau libera", () => {
  assert.ok(describeGrade("full").includes("jerk"));
  assert.ok(describeGrade("partial").includes("jerk não"));
  assert.ok(describeGrade("limited").length > 0);
});
