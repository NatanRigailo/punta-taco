/**
 * Launch analysis.
 *
 * The expensive failure here is a permissive one: counting a jump start as a
 * brilliant reaction. Reaction time is the sort of number people screenshot, so
 * every way of getting it wrong deserves a case.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { HUMAN_FLOOR_MS, analyseLaunch, roundReaction } from "./launch.js";

/**
 * Builds a launch recording on a 20ms grid.
 *
 * @param {object} options
 * @param {number} options.signalMs
 * @param {number} [options.onsetMs]     When the brake starts leaving. Omit to never release.
 * @param {number} [options.releaseMs]   How long the release takes.
 * @param {number} [options.heldBrake]
 * @param {number} [options.heldThrottle]
 * @param {number} [options.throttleWobble]
 */
function recording(options) {
  const {
    signalMs,
    onsetMs,
    releaseMs = 120,
    heldBrake = 0.95,
    heldThrottle = 0.8,
    throttleWobble = 0,
  } = options;

  /** @type {{ t: number, brake: number, throttle: number }[]} */
  const samples = [];
  for (let t = 0; t <= 3000; t += 20) {
    let brake = heldBrake;
    if (onsetMs !== undefined && t >= onsetMs) {
      const progress = Math.min(1, (t - onsetMs) / releaseMs);
      brake = heldBrake * (1 - progress);
    }
    // Wobble alternates so peak-to-peak is exactly what was asked for.
    const throttle = heldThrottle + (t % 40 === 0 ? throttleWobble / 2 : -throttleWobble / 2);
    samples.push({ t, brake, throttle });
  }
  return { samples, signalMs };
}

test("reação é medida do sinal até o freio começar a sair", () => {
  const { samples, signalMs } = recording({ signalMs: 1000, onsetMs: 1200 });
  const result = analyseLaunch(samples, signalMs);

  assert.equal(result.valid, true);
  assert.equal(result.jumpStart, false);
  assert.ok(result.reactionMs !== null && Math.abs(result.reactionMs - 200) <= 20);
});

test("queima de largada é detectada e invalida a tentativa", () => {
  // A soltura começa antes do sinal. Procurar o onset só a partir do sinal
  // esconderia exatamente isto — o erro que o cenário existe para pegar.
  const { samples, signalMs } = recording({ signalMs: 1500, onsetMs: 1300 });
  const result = analyseLaunch(samples, signalMs);

  assert.equal(result.jumpStart, true);
  assert.equal(result.valid, false);
  assert.match(result.problem ?? "", /queimou/);
  assert.ok(result.reactionMs !== null && result.reactionMs < 0, "o tempo deve sair negativo");
});

test("reação abaixo do limite humano é marcada como antecipação", () => {
  const { samples, signalMs } = recording({ signalMs: 1000, onsetMs: 1040 });
  const result = analyseLaunch(samples, signalMs);

  assert.equal(result.jumpStart, false, "não é queima, o sinal já tinha saído");
  assert.equal(result.anticipated, true);
  assert.ok((result.reactionMs ?? 0) < HUMAN_FLOOR_MS);
});

test("reação logo acima do limite não é marcada como antecipação", () => {
  const { samples, signalMs } = recording({ signalMs: 1000, onsetMs: 1140 });
  const result = analyseLaunch(samples, signalMs);
  assert.equal(result.anticipated, false);
});

test("o limiar de soltura acompanha o quanto o freio estava segurando", () => {
  // Quem segura 60% solta a partir de 57%, não a partir de 95% absoluto.
  const { samples, signalMs } = recording({ signalMs: 1000, onsetMs: 1200, heldBrake: 0.6 });
  const result = analyseLaunch(samples, signalMs);

  assert.equal(result.valid, true);
  assert.ok(result.reactionMs !== null && Math.abs(result.reactionMs - 200) <= 20);
});

test("freio frouxo na espera invalida a tentativa", () => {
  const { samples, signalMs } = recording({ signalMs: 1000, onsetMs: 1200, heldBrake: 0.2 });
  const result = analyseLaunch(samples, signalMs);

  assert.equal(result.valid, false);
  assert.match(result.problem ?? "", /freio não estava segurando/);
});

test("sem acelerador na espera não é largada", () => {
  const { samples, signalMs } = recording({ signalMs: 1000, onsetMs: 1200, heldThrottle: 0.05 });
  const result = analyseLaunch(samples, signalMs);

  assert.equal(result.valid, false);
  assert.match(result.problem ?? "", /acelerador/);
});

test("freio nunca solto é reportado, não interpretado como reação infinita", () => {
  const { samples, signalMs } = recording({ signalMs: 1000 });
  const result = analyseLaunch(samples, signalMs);

  assert.equal(result.valid, false);
  assert.equal(result.reactionMs, null);
  assert.match(result.problem ?? "", /não foi solto/);
});

test("duração da soltura é medida do início até o freio zerar", () => {
  const { samples, signalMs } = recording({ signalMs: 1000, onsetMs: 1200, releaseMs: 200 });
  const result = analyseLaunch(samples, signalMs);
  assert.ok(result.releaseMs !== null && Math.abs(result.releaseMs - 200) <= 40);
});

test("oscilação do acelerador na espera é reportada", () => {
  const steady = recording({ signalMs: 1000, onsetMs: 1200, throttleWobble: 0 });
  const nervous = recording({ signalMs: 1000, onsetMs: 1200, throttleWobble: 0.1 });

  assert.ok(analyseLaunch(steady.samples, steady.signalMs).throttleWobble < 0.01);
  assert.ok(analyseLaunch(nervous.samples, nervous.signalMs).throttleWobble > 0.08);
});

test("gravação vazia não vira resultado", () => {
  const result = analyseLaunch([], 1000);
  assert.equal(result.valid, false);
  assert.equal(result.reactionMs, null);
});

test("roundReaction não inventa precisão que o hardware não tem", () => {
  // A ~50Hz o dispositivo reporta a cada ~19ms, então 212 e 219 são leituras
  // que ele não consegue separar — e portanto têm que sair idênticas.
  assert.equal(roundReaction(212, 19.3), roundReaction(219, 19.3));

  // Mas diferenças acima do grão continuam distinguíveis, senão o
  // arredondamento estaria jogando fora informação real.
  assert.notEqual(roundReaction(212, 19.3), roundReaction(245, 19.3));

  // O resultado é sempre múltiplo do grão.
  assert.equal(roundReaction(212, 19.3) % 20, 0);

  // Dispositivo rápido não passa de 10ms de granularidade exibida: abaixo
  // disso a leitura oscila mais que a diferença que estaria sendo mostrada.
  assert.equal(roundReaction(212, 2), 210);
  assert.equal(roundReaction(217, 2), 220);
});
