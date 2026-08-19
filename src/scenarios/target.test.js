/**
 * Target curves.
 *
 * The guide is what every score will be measured against, so an error here does
 * not look like a bug — it looks like the driver being bad at the scenario.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { channelDuration, sampleChannel, sampleTarget } from "./target.js";
import { QUICK_SCENARIOS } from "./catalog.js";

const close = (/** @type {number} */ got, /** @type {number} */ want, tol = 1e-9) =>
  assert.ok(Math.abs(got - want) < tol, `got ${got}, want ${want}`);

test("idle mantém zero", () => {
  const { value } = sampleChannel([{ kind: "idle", ms: 200 }], 200);
  assert.equal(value.length, 10);
  assert.ok(value.every((v) => v === 0));
});

test("ramp linear sobe a taxa constante", () => {
  const { value } = sampleChannel(
    [{ kind: "ramp", ms: 200, to: 1, curve: "linear" }],
    200,
  );
  close(value[0] ?? -1, 0);
  close(value[5] ?? -1, 0.5);
  close(value[9] ?? -1, 0.9);
});

test("ramp suave começa e termina com taxa zero", () => {
  // É o que separa um alvo aplicável de um alvo que exige um tranco: um
  // quíntico de jerk mínimo sai do repouso sem degrau.
  const { value } = sampleChannel([{ kind: "ramp", ms: 1000, to: 1 }], 1000);
  const first = (value[1] ?? 0) - (value[0] ?? 0);
  const middle = (value[26] ?? 0) - (value[25] ?? 0);
  assert.ok(first < middle / 5, "o arranque deveria ser bem mais lento que o meio");
  close(value[0] ?? -1, 0);
});

test("hold segura o valor onde a rampa parou", () => {
  const { value } = sampleChannel(
    [
      { kind: "ramp", ms: 100, to: 0.8, curve: "linear" },
      { kind: "hold", ms: 200 },
    ],
    300,
  );
  close(value[9] ?? -1, 0.8, 1e-6);
  close(value[14] ?? -1, 0.8, 1e-6);
});

test("release desce a partir do valor corrente", () => {
  const { value } = sampleChannel(
    [
      { kind: "ramp", ms: 100, to: 1, curve: "linear" },
      { kind: "release", ms: 200, to: 0, curve: "linear" },
    ],
    300,
  );
  close(value[5] ?? -1, 1, 1e-6);
  close(value[10] ?? -1, 0.5, 1e-6);
});

test("depois do último segmento o valor é mantido, não zerado", () => {
  // Uma curva mais curta que o cenário não pode cair de um penhasco no fim.
  const { value } = sampleChannel([{ kind: "ramp", ms: 100, to: 0.7, curve: "linear" }], 300);
  close(value[14] ?? -1, 0.7, 1e-6);
});

test("tolerância por segmento chega na amostra", () => {
  const { tolerance } = sampleChannel(
    [
      { kind: "idle", ms: 100 },
      { kind: "ramp", ms: 100, to: 1, tolerance: 0.02 },
    ],
    200,
  );
  close(tolerance[0] ?? -1, 0.06);
  close(tolerance[7] ?? -1, 0.02);
});

test("sampleTarget devolve os dois canais na mesma grade", () => {
  const sampled = sampleTarget(
    {
      brake: [{ kind: "ramp", ms: 1000, to: 1, curve: "linear" }],
      throttle: [{ kind: "idle", ms: 1000 }],
    },
    1000,
  );
  assert.equal(sampled.brake.length, 50);
  assert.equal(sampled.throttle.length, 50);
  assert.equal(sampled.brakeTolerance.length, 50);
});

test("todo cenário com guia tem curva do tamanho do cenário", () => {
  // Curva mais longa que o cenário significa alvo que nunca é alcançado, e o
  // usuário levaria a culpa por não conseguir.
  for (const scenario of QUICK_SCENARIOS) {
    if (!scenario.target) continue;
    for (const channel of /** @type {const} */ (["brake", "throttle"])) {
      assert.equal(
        channelDuration(scenario.target[channel]),
        scenario.durationMs,
        `${scenario.id}/${channel} não preenche a duração do cenário`,
      );
    }
  }
});

test("nenhum alvo sai da faixa alcançável do pedal", () => {
  for (const scenario of QUICK_SCENARIOS) {
    if (!scenario.target) continue;
    const sampled = sampleTarget(scenario.target, scenario.durationMs);
    for (const series of [sampled.brake, sampled.throttle]) {
      for (const value of series) {
        assert.ok(value >= 0 && value <= 1, `${scenario.id} pede ${value}`);
      }
    }
  }
});

test("todo cenário de traço tem guia", () => {
  // Sem guia o cenário não tem o que treinar: é a referência inteira.
  for (const scenario of QUICK_SCENARIOS) {
    if (scenario.kind !== "trace") continue;
    assert.ok(scenario.target, `${scenario.id} sem curva-alvo`);
  }
});

test("a troca de pedal não pede overlap nem lacuna", () => {
  // O cenário existe para treinar o encontro exato no zero; se o próprio alvo
  // pedisse os dois pedais juntos, ele estaria ensinando a falta.
  const scenario = QUICK_SCENARIOS.find((s) => s.id === "troca-de-pedal");
  assert.ok(scenario?.target);
  const sampled = sampleTarget(scenario.target, scenario.durationMs);

  let overlaps = 0;
  for (let i = 0; i < sampled.brake.length; i++) {
    const brake = sampled.brake[i] ?? 0;
    const throttle = sampled.throttle[i] ?? 0;
    if (brake > 0.02 && throttle > 0.02) overlaps++;
  }
  assert.equal(overlaps, 0, "o alvo pede os dois pedais ao mesmo tempo");
});
