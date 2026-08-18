/**
 * Scenario catalogue.
 *
 * Scenarios, not gestures. "Threshold braking" is manual vocabulary: you learn
 * the technique and then have to remember where it applies. "You arrive at 300
 * and need 80" is a moment the driver already recognises from inside the sim,
 * which is what gives the training a chance of transferring — the risk the
 * scope itself calls the most serious one.
 *
 * Each scenario names a real corner as reference without being tied to it. The
 * mechanic stays portable, and the recognition is there for whoever has driven
 * that track.
 *
 * Metadata only, on purpose. The declarative target curve — the sequence of
 * `ramp` / `hold` / `release` / `idle` segments from the scope — is a public
 * contract that only makes sense alongside the rendering and scoring it feeds,
 * both of which are M1.
 */

/** @typedef {"brake" | "throttle" | "both"} ScenarioPedal */

/**
 * @typedef {object} Scenario
 * @property {string} id
 * @property {string} name
 * @property {string} situation   The moment, in one line. Shown on the card.
 * @property {string} reference   A real corner where this happens.
 * @property {string} detail      What good looks like, shown while running.
 * @property {ScenarioPedal} pedal
 * @property {number} durationMs
 * @property {string} focus       The metric this scenario exists to move.
 * @property {string} [blockedBy] Why it cannot be run yet, when it cannot.
 */

/** @type {readonly Scenario[]} */
export const QUICK_SCENARIOS = [
  {
    id: "fim-de-reta",
    name: "Freada de fim de reta",
    situation: "Você chega a 300 e precisa de 80, com o carro pesado e reto.",
    reference: "como a Curva 1 de Interlagos",
    detail:
      "Chegue perto do limite depressa e pare lá. O erro comum é passar do ponto e corrigir para "
      + "baixo — o overshoot custa mais que a fração de segundo que a pressa economiza.",
    pedal: "brake",
    durationMs: 7000,
    focus: "overshoot e tempo até o pico",
  },
  {
    id: "entrada-rapida",
    name: "Entrada de curva rápida",
    situation: "Freia forte e vai soltando enquanto vira, carregando o freio até o vértice.",
    reference: "como o S do Senna",
    detail:
      "A liberação é o exercício, não a pisada. Ela precisa ser uma reta: qualquer degrau no "
      + "caminho é o que tira a frente do carro no meio da curva.",
    pedal: "brake",
    durationMs: 8000,
    focus: "linearidade da liberação",
  },
  {
    id: "curva-que-fecha",
    name: "Curva que fecha",
    situation: "O raio diminui no meio e você precisa de freio de novo, depois de já ter soltado.",
    reference: "como a Descida do Lago",
    detail:
      "Solta, segura num patamar intermediário, solta de novo. A transição entre os dois estágios "
      + "é onde o pé costuma dar um tranco, e é justamente onde o carro está mais leve.",
    pedal: "brake",
    durationMs: 8000,
    focus: "suavidade na troca de estágio",
  },
  {
    id: "vertice-e-saida",
    name: "Vértice e saída",
    situation: "O ponto exato em que o freio acaba e o acelerador começa.",
    reference: "qualquer curva de segunda marcha",
    detail:
      "Os dois pedais em sequência limpa. Overlap é falta, lacuna é tempo perdido. O alvo é os "
      + "dois traços se encontrarem exatamente no zero.",
    pedal: "both",
    durationMs: 6000,
    focus: "overlap e lacuna na troca",
  },
  {
    id: "saida-lenta",
    name: "Saída de curva lenta",
    situation: "Segunda marcha, tração no limite, e a reta inteira dependendo dessa saída.",
    reference: "como a saída da Junção",
    detail:
      "Progressão contínua, sem degrau. É o gesto que define se o carro sai tracionando ou "
      + "girando — e o único em que ser gentil é literalmente mais rápido.",
    pedal: "throttle",
    durationMs: 6000,
    focus: "jerk na aplicação",
  },
  {
    id: "largada",
    name: "Largada",
    situation: "Acelerador embaixo, freio segurando, e as luzes prestes a apagar.",
    reference: "a mesma de toda corrida",
    detail:
      "Reação e soltura, com o acelerador firme na espera. Queimar a largada invalida a tentativa "
      + "— é o único cenário em que existe errar antes de começar.",
    pedal: "both",
    durationMs: 8000,
    focus: "reação e queima de largada",
    blockedBy: "precisa do sinal de largada",
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
