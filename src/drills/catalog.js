/**
 * Drill catalogue.
 *
 * Metadata only, on purpose. The declarative target curve — the sequence of
 * `ramp` / `hold` / `release` / `idle` segments from the scope — is a public
 * contract that only makes sense alongside the rendering and scoring it feeds,
 * both of which are M1. Committing to its shape now would mean designing it
 * without the thing that consumes it.
 *
 * The shapes themselves come from real telemetry, not from arbitrary curves.
 */

/** @typedef {"brake" | "throttle" | "both"} DrillPedal */

/**
 * @typedef {object} Drill
 * @property {string} id
 * @property {string} name
 * @property {string} summary      One line, shown on the card.
 * @property {string} detail       What good looks like, shown while running.
 * @property {DrillPedal} pedal
 * @property {number} durationMs
 * @property {string} focus        The metric this drill exists to move.
 */

/** @type {readonly Drill[]} */
export const QUICK_DRILLS = [
  {
    id: "threshold",
    name: "Threshold braking",
    summary: "Subida rápida até 95%, platô, e soltar.",
    detail:
      "Chegue perto do limite depressa e pare lá. O erro comum é passar de 95% e corrigir para "
      + "baixo — o overshoot custa mais que a fração de segundo que a pressa economiza.",
    pedal: "brake",
    durationMs: 6000,
    focus: "tempo até o pico e overshoot",
  },
  {
    id: "trail",
    name: "Trail braking",
    summary: "Pico e liberação linear longa até zero.",
    detail:
      "A liberação é o exercício, não a pisada. Ela precisa ser uma reta: qualquer degrau no "
      + "caminho aparece como queda de linearidade e é o que desestabiliza o carro na entrada.",
    pedal: "brake",
    durationMs: 8000,
    focus: "linearidade da liberação",
  },
  {
    id: "decreasing-radius",
    name: "Release de raio decrescente",
    summary: "Liberação em dois estágios, para curva que fecha.",
    detail:
      "Solta, segura num patamar intermediário, e solta de novo. A transição entre os dois "
      + "estágios é onde o pé costuma dar um tranco.",
    pedal: "brake",
    durationMs: 8000,
    focus: "suavidade na troca de estágio",
  },
  {
    id: "throttle-modulation",
    name: "Modulação de saída",
    summary: "Acelerador progressivo de 0 a 100%, sem tranco.",
    detail:
      "Progressão contínua, sem degrau. É o gesto que define se o carro sai da curva tracionando "
      + "ou girando.",
    pedal: "throttle",
    durationMs: 6000,
    focus: "jerk na aplicação",
  },
  {
    id: "transition",
    name: "Transição",
    summary: "Sair do freio e entrar no acelerador sem overlap e sem lacuna.",
    detail:
      "Os dois pedais em sequência limpa. Overlap é falta; lacuna é tempo perdido. O alvo é os "
      + "dois traços se encontrarem exatamente no zero.",
    pedal: "both",
    durationMs: 6000,
    focus: "overlap e lacuna na troca",
  },
];

/**
 * @param {string} id
 * @returns {Drill | null}
 */
export function drillById(id) {
  return QUICK_DRILLS.find((drill) => drill.id === id) ?? null;
}

/**
 * @param {DrillPedal} pedal
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
