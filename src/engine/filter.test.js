/**
 * Savitzky-Golay.
 *
 * The strongest possible check on this filter is its defining property: fitting
 * a polynomial of order p and reading derivatives off the fit must reproduce
 * any polynomial of order ≤ p *exactly*, at every point including the ends. A
 * sign error, a wrong factorial or bad edge handling all break that immediately,
 * and none of them would be obvious by eye on a noisy pedal trace.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  POLY_ORDER,
  REFERENCE_JERK,
  chooseWindow,
  filterSeries,
  noiseGain,
  savitzkyGolayCoefficients,
} from "./filter.js";

const STEP_MS = 20;
const H = STEP_MS / 1000;

const close = (/** @type {number} */ got, /** @type {number} */ want, tol = 1e-6) =>
  assert.ok(Math.abs(got - want) < tol, `got ${got}, want ${want}`);

/**
 * @param {number} n
 * @param {(t: number) => number} fn  t in seconds
 */
const sampled = (n, fn) => Array.from({ length: n }, (_, i) => fn(i * H));

test("coeficientes de suavização somam 1", () => {
  // Caso contrário o filtro mudaria o nível do sinal, não só a suavidade.
  for (let halfWidth = 2; halfWidth <= 7; halfWidth++) {
    const c = savitzkyGolayCoefficients(halfWidth, POLY_ORDER, 0);
    close(c.reduce((a, b) => a + b, 0), 1);
  }
});

test("coeficientes de derivada somam 0", () => {
  // A derivada de uma constante é zero, então os pesos têm que se cancelar.
  for (const derivative of [1, 2]) {
    for (let halfWidth = 2; halfWidth <= 7; halfWidth++) {
      const c = savitzkyGolayCoefficients(halfWidth, POLY_ORDER, derivative);
      close(c.reduce((a, b) => a + b, 0), 0);
    }
  }
});

test("suavização preserva um polinômio de ordem igual à do ajuste", () => {
  const series = sampled(40, (t) => 0.3 + 2 * t - 5 * t * t + 3 * t * t * t);
  const smoothed = filterSeries(series, { halfWidth: 5, stepMs: STEP_MS });
  for (let i = 0; i < series.length; i++) {
    close(smoothed[i] ?? NaN, series[i] ?? NaN, 1e-6);
  }
});

test("primeira derivada de uma rampa é a inclinação, inclusive nas bordas", () => {
  const slope = 4.2;
  const series = sampled(30, (t) => 0.1 + slope * t);
  const d1 = filterSeries(series, { halfWidth: 4, stepMs: STEP_MS, derivative: 1 });
  for (const value of d1) close(value, slope, 1e-6);
});

test("segunda derivada de uma parábola é 2a, inclusive nas bordas", () => {
  const a = -7.5;
  const series = sampled(30, (t) => 1 + 0.5 * t + a * t * t);
  const d2 = filterSeries(series, { halfWidth: 4, stepMs: STEP_MS, derivative: 2 });
  for (const value of d2) close(value, 2 * a, 1e-5);
});

test("derivadas de um cúbico batem com a solução analítica", () => {
  // f(t) = t³ → f'(t) = 3t², f''(t) = 6t. Cobre o caso em que a derivada varia
  // dentro da janela, que é onde um ajuste de ordem baixa demais falharia.
  const series = sampled(30, (t) => t ** 3);
  const d1 = filterSeries(series, { halfWidth: 4, stepMs: STEP_MS, derivative: 1 });
  const d2 = filterSeries(series, { halfWidth: 4, stepMs: STEP_MS, derivative: 2 });

  for (let i = 0; i < series.length; i++) {
    const t = i * H;
    close(d1[i] ?? NaN, 3 * t * t, 1e-5);
    close(d2[i] ?? NaN, 6 * t, 1e-4);
  }
});

test("as bordas usam ajuste fora do centro, não espelhamento", () => {
  // Espelhar inventaria simetria: uma rampa espelhada vira um "V" e a derivada
  // na borda cairia para zero. Aqui ela tem que continuar valendo a inclinação.
  const series = sampled(20, (t) => 3 * t);
  const d1 = filterSeries(series, { halfWidth: 5, stepMs: STEP_MS, derivative: 1 });
  close(d1[0] ?? NaN, 3, 1e-6);
  close(d1[d1.length - 1] ?? NaN, 3, 1e-6);
});

test("suavização derruba ruído sem deslocar o sinal", () => {
  const clean = sampled(200, (t) => 0.5 + 0.4 * Math.sin(2 * Math.PI * 2 * t));
  let seed = 42;
  const noisy = clean.map((v) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return v + (seed / 2147483648 - 0.5) * 0.02;
  });

  const smoothed = filterSeries(noisy, { halfWidth: 5, stepMs: STEP_MS });
  const error = (/** @type {number[]} */ series) =>
    Math.sqrt(
      series.reduce((acc, v, i) => acc + (v - (clean[i] ?? 0)) ** 2, 0) / series.length,
    );

  assert.ok(error(smoothed) < error(noisy), "o filtro deveria reduzir o erro");
});

test("noiseGain cai conforme a janela cresce", () => {
  let previous = Number.POSITIVE_INFINITY;
  for (let halfWidth = 2; halfWidth <= 7; halfWidth++) {
    const gain = noiseGain(savitzkyGolayCoefficients(halfWidth, POLY_ORDER, 2));
    assert.ok(gain < previous, `janela ${halfWidth} não reduziu o ganho de ruído`);
    previous = gain;
  }
});

test("chooseWindow abre a janela conforme o degrau piora", () => {
  const fine = chooseWindow({ stepFraction: 0.0005, stepMs: STEP_MS });
  const coarse = chooseWindow({ stepFraction: 0.0025, stepMs: STEP_MS });
  assert.ok(
    coarse.halfWidth >= fine.halfWidth,
    "hardware mais grosseiro deveria exigir janela igual ou maior",
  );
});

test("chooseWindow admite derrota em hardware ruim demais", () => {
  // Degrau de 5% do curso, ~4,3 bits: nenhuma janela dentro do teto de
  // fidelidade segura o ruído do jerk, e alargar mais destruiria o sinal.
  const hopeless = chooseWindow({ stepFraction: 0.05, stepMs: STEP_MS });
  assert.equal(hopeless.withinBudget, false);
  assert.ok(hopeless.jerkNoise > REFERENCE_JERK * 0.1);
});

test("a janela escolhida para a PXN VD4 mantém o jerk dentro do orçamento", () => {
  // Degrau medido: 0,25% do curso, passo de 20ms. Ver docs/medicoes.md.
  const choice = chooseWindow({ stepFraction: 0.0025, stepMs: STEP_MS });
  assert.equal(choice.withinBudget, true);
  assert.equal(choice.windowPoints, 5, "a PXN nem precisa da janela máxima");
});

test("a janela nunca ultrapassa o teto de fidelidade", () => {
  // Mesmo em hardware péssimo, a busca para em 7 pontos: alargar reduziria o
  // número de ruído enquanto destrói o sinal, que é o pior dos dois mundos.
  for (const stepFraction of [0.0005, 0.0025, 0.02, 0.05, 0.2]) {
    assert.ok(chooseWindow({ stepFraction, stepMs: STEP_MS }).windowPoints <= 7);
  }
});

test("a janela máxima reconstrói uma aplicação de pedal real", () => {
  // Perfil de jerk mínimo (quíntico), que é como movimento humano de fato se
  // comporta, com jerk contínuo nas duas pontas. Onset de 250ms.
  const T = 0.25;
  const amplitude = 0.95;
  const position = sampled(60, (t) => {
    const u = Math.min(1, t / T);
    return amplitude * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5);
  });
  const analytic = sampled(60, (t) => {
    if (t > T) return 0;
    const u = t / T;
    return (amplitude / T ** 2) * (60 * u - 180 * u ** 2 + 120 * u ** 3);
  });

  const filtered = filterSeries(position, { halfWidth: 3, stepMs: STEP_MS, derivative: 2 });
  const peakTrue = Math.max(...analytic.map(Math.abs));
  const peakGot = Math.max(...filtered.map(Math.abs));

  // Tolerância folgada de propósito: o objetivo é travar a ordem de grandeza e
  // pegar regressão, não fingir precisão que a quantização não permite.
  assert.ok(
    Math.abs(peakGot / peakTrue - 1) < 0.15,
    `pico do jerk fora da faixa: ${peakGot.toFixed(1)} contra ${peakTrue.toFixed(1)}`,
  );
});

test("alargar além do teto piora a reconstrução — é por isso que o teto existe", () => {
  const T = 0.25;
  const position = sampled(60, (t) => {
    const u = Math.min(1, t / T);
    return 0.95 * (10 * u ** 3 - 15 * u ** 4 + 6 * u ** 5);
  });
  const analytic = sampled(60, (t) => {
    if (t > T) return 0;
    const u = t / T;
    return (0.95 / T ** 2) * (60 * u - 180 * u ** 2 + 120 * u ** 3);
  });

  /** @param {number} halfWidth */
  const rmse = (halfWidth) => {
    const filtered = filterSeries(position, { halfWidth, stepMs: STEP_MS, derivative: 2 });
    const sum = filtered.reduce((acc, v, i) => acc + (v - (analytic[i] ?? 0)) ** 2, 0);
    return Math.sqrt(sum / filtered.length);
  };

  assert.ok(rmse(3) < rmse(5), "janela de 220ms deveria reconstruir pior que a de 140ms");
  assert.ok(rmse(2) < rmse(4), "janela de 180ms deveria reconstruir pior que a de 100ms");
});

test("parâmetros incoerentes falham alto", () => {
  assert.throws(() => savitzkyGolayCoefficients(0, 3, 0), /halfWidth/);
  assert.throws(() => savitzkyGolayCoefficients(3, 1, 2), /ordem do polinômio/);
  assert.throws(() => savitzkyGolayCoefficients(1, 3, 0), /janela pequena/);
});

test("série vazia devolve série vazia", () => {
  assert.deepEqual(filterSeries([], { halfWidth: 3, stepMs: STEP_MS }), []);
});
