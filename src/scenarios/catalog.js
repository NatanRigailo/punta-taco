/**
 * Scenario catalogue.
 *
 * Deliberately generic. The app has none of what a simulator has — no speed, no
 * load, no tyre, no visual reference of a track — so tying a scenario to a real
 * corner would promise a context the screen cannot deliver, and invite a
 * comparison with the sim that this loses.
 *
 * What is trained here is the movement itself: timing, amount, coordination and
 * smoothness. The reference is the curve on the screen, not the corner on the
 * tarmac. A scenario name is only there to say which shape of pedal work is
 * being drilled — recognisable, but not a place.
 *
 * (The daily drill, later, can afford to be more elaborate. Quick scenarios
 * cannot: they are the repetition loop, and repetition wants a plain target.)
 *
 * Metadata only, on purpose. The declarative target curve — the sequence of
 * `ramp` / `hold` / `release` / `idle` segments from the scope — is a public
 * contract that only makes sense alongside the rendering and scoring it feeds,
 * both of which are M1.
 */

/** @typedef {"brake" | "throttle" | "both"} ScenarioPedal */

/**
 * The four things a scenario can train. Named by what the foot is doing, not by
 * what a car would be doing.
 *
 * @typedef {"timing" | "amount" | "coordination" | "smoothness"} TrainingAxis
 */

/**
 * @typedef {object} Scenario
 * @property {string} id
 * @property {string} name
 * @property {string} shape     The pedal movement, in one line. Shown on the card.
 * @property {string} detail    What good looks like, shown while running.
 * @property {TrainingAxis[]} trains
 * @property {"trace" | "launch"} kind
 *   How the scenario is run. `trace` records against the on-screen guide;
 *   `launch` waits for a signal, which is why it can exist before the guide does.
 * @property {ScenarioPedal} pedal
 * @property {number} durationMs
 * @property {string} focus     The metric this scenario exists to move.
 * @property {import("./target.js").TargetCurve} [target]
 *   The guide: where the input has to be, instant by instant. Absent only for
 *   scenarios measured against an event instead of a curve.
 * @property {string} [blockedBy] Why it cannot be run yet, when it cannot.
 */

/** @type {readonly Scenario[]} */
export const QUICK_SCENARIOS = [
  {
    id: "freada-reta",
    kind: "trace",
    name: "Freada em linha reta",
    shape: "Subir depressa até um patamar alto, segurar, e soltar.",
    detail:
      "Chegue ao patamar depressa e pare exatamente nele. O erro comum é passar do ponto e "
      + "corrigir para baixo — a correção custa mais que a pressa economizou.",
    trains: ["timing", "amount"],
    pedal: "brake",
    durationMs: 7000,
    focus: "erro de onset e overshoot",
    target: {
      // Sobe depressa, segura o patamar, e sai sem pressa.
      brake: [
        { kind: "idle", ms: 1500 },
        { kind: "ramp", ms: 300, to: 0.95 },
        { kind: "hold", ms: 2500 },
        { kind: "release", ms: 700, to: 0 },
        { kind: "idle", ms: 2000 },
      ],
      throttle: [{ kind: "idle", ms: 7000 }],
    },
  },
  {
    id: "liberacao-longa",
    kind: "trace",
    name: "Liberação longa",
    shape: "Pico e então uma descida contínua até zero.",
    detail:
      "A descida é o exercício, não a pisada. Ela precisa ser uma reta: qualquer degrau no meio "
      + "aparece como queda de linearidade.",
    trains: ["smoothness", "amount"],
    pedal: "brake",
    durationMs: 8000,
    focus: "linearidade da liberação",
    target: {
      // A descida é linear de propósito: é exatamente o que se está medindo.
      brake: [
        { kind: "idle", ms: 1500 },
        { kind: "ramp", ms: 350, to: 0.9 },
        { kind: "hold", ms: 500 },
        { kind: "release", ms: 3500, to: 0, curve: "linear", tolerance: 0.05 },
        { kind: "idle", ms: 2150 },
      ],
      throttle: [{ kind: "idle", ms: 8000 }],
    },
  },
  {
    id: "dois-estagios",
    kind: "trace",
    name: "Liberação em dois estágios",
    shape: "Soltar, segurar num patamar intermediário, e soltar de novo.",
    detail:
      "A troca entre os dois estágios é onde o pé costuma dar um tranco. O alvo é que os dois "
      + "patamares se liguem sem degrau visível.",
    trains: ["smoothness", "timing"],
    pedal: "brake",
    durationMs: 8000,
    focus: "suavidade na troca de estágio",
    target: {
      brake: [
        { kind: "idle", ms: 1500 },
        { kind: "ramp", ms: 350, to: 0.9 },
        { kind: "hold", ms: 400 },
        { kind: "release", ms: 900, to: 0.45, curve: "linear" },
        { kind: "hold", ms: 700 },
        { kind: "release", ms: 1200, to: 0, curve: "linear" },
        { kind: "idle", ms: 2950 },
      ],
      throttle: [{ kind: "idle", ms: 8000 }],
    },
  },
  {
    id: "troca-de-pedal",
    kind: "trace",
    name: "Troca de pedal",
    shape: "Zerar o freio e subir o acelerador, um logo após o outro.",
    detail:
      "Os dois pedais em sequência limpa. Overlap é falta, lacuna é tempo morto. O alvo é os dois "
      + "traços se encontrarem exatamente no zero.",
    trains: ["coordination", "timing"],
    pedal: "both",
    durationMs: 6000,
    focus: "overlap e lacuna na troca",
    target: {
      // O acelerador começa exatamente quando o freio zera: sem overlap,
      // sem lacuna. A tolerância é apertada justo nesse encontro.
      brake: [
        { kind: "idle", ms: 1200 },
        { kind: "ramp", ms: 300, to: 0.8 },
        { kind: "hold", ms: 800 },
        { kind: "release", ms: 900, to: 0, curve: "linear", tolerance: 0.04 },
        { kind: "idle", ms: 2800 },
      ],
      throttle: [
        { kind: "idle", ms: 3200 },
        { kind: "ramp", ms: 1200, to: 0.9, tolerance: 0.04 },
        { kind: "idle", ms: 1600 },
      ],
    },
  },
  {
    id: "aplicacao-progressiva",
    kind: "trace",
    name: "Aplicação progressiva",
    shape: "Do zero ao fundo do acelerador, sem degrau em nenhum ponto.",
    detail:
      "Progressão contínua. É o gesto mais difícil de fazer sem tranco, e o mais fácil de medir: "
      + "qualquer irregularidade aparece direto no jerk.",
    trains: ["smoothness"],
    pedal: "throttle",
    durationMs: 6000,
    focus: "jerk na aplicação",
    target: {
      brake: [{ kind: "idle", ms: 6000 }],
      throttle: [
        { kind: "idle", ms: 1500 },
        { kind: "ramp", ms: 2500, to: 1 },
        { kind: "hold", ms: 500 },
        { kind: "idle", ms: 1500 },
      ],
    },
  },
  {
    id: "largada",
    kind: "launch",
    name: "Largada",
    shape: "Acelerador firme, freio segurando, e soltar o freio ao sinal.",
    detail:
      "Reação e soltura, com o acelerador estável durante a espera. Soltar antes do sinal "
      + "invalida a tentativa — é o único cenário em que dá para errar antes de começar.",
    trains: ["timing", "coordination"],
    pedal: "both",
    durationMs: 8000,
    focus: "reação e queima de largada",
  },
];

/**
 * @param {string} id
 * @returns {Scenario | null}
 */
export function scenarioById(id) {
  return QUICK_SCENARIOS.find((scenario) => scenario.id === id) ?? null;
}

/**
 * @param {Scenario} scenario
 * @returns {boolean}
 */
export function isPlayable(scenario) {
  return scenario.blockedBy === undefined;
}

/**
 * @param {TrainingAxis} axis
 * @returns {string}
 */
export function describeAxis(axis) {
  switch (axis) {
    case "timing":
      return "tempo";
    case "amount":
      return "quantidade";
    case "coordination":
      return "coordenação";
    default:
      return "suavidade";
  }
}

/**
 * @param {ScenarioPedal} pedal
 * @returns {string}
 */
export function describePedal(pedal) {
  switch (pedal) {
    case "brake":
      return "freio";
    case "throttle":
      return "acelerador";
    default:
      return "freio e acelerador";
  }
}
