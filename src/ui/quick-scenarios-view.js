/**
 * Quick scenarios: the list, and the entry point into one.
 *
 * The run itself lives in `scenario-run.js` for guided scenarios and in
 * `launch-panel.js` for the launch, which is measured against an event rather
 * than a curve. This file only decides which of the two to mount.
 */

import { el } from "./dom.js";
import {
  QUICK_SCENARIOS,
  describeAxis,
  describePedal,
  isPlayable,
  scenarioById,
} from "../scenarios/catalog.js";
import { readPedals } from "../input/pedals.js";
import { mountLaunchPanel } from "./launch-panel.js";
import { mountScenarioRun } from "./scenario-run.js";
import { navigate } from "./router.js";

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function mountQuickScenarios(root) {
  root.append(
    el("nav", { class: "crumbs" }, [el("a", { href: "#/", text: "← início" })]),
    el("header", { class: "view-head" }, [
      el("h1", { text: "Treinos rápidos" }),
      el("p", {
        class: "lead",
        text:
          "Um movimento por vez, entre 5 e 8 segundos. Genéricos de propósito: aqui não há "
          + "velocidade, carga nem pista — o que se treina é tempo, quantidade, coordenação e "
          + "suavidade do movimento. O guia na tela diz onde o seu input tem que estar, e a banda "
          + "em volta dele é o quanto de erro aquele trecho tolera.",
      }),
    ]),
  );

  const list = el("div", { class: "drill-list" });
  for (const scenario of QUICK_SCENARIOS) {
    const body = [
      el("div", { class: "card-head" }, [
        el("h2", { text: scenario.name }),
        el("span", {
          class: isPlayable(scenario) ? "badge" : "badge muted",
          text: isPlayable(scenario) ? `${scenario.durationMs / 1000}s` : "em breve",
        }),
      ]),
      el("p", { class: "card-text", text: scenario.shape }),
      el("p", {
        class: "tagline",
        text: isPlayable(scenario)
          ? `treina ${scenario.trains.map(describeAxis).join(" e ")} · ${describePedal(scenario.pedal)}`
          : `treina ${scenario.trains.map(describeAxis).join(" e ")} · ${scenario.blockedBy}`,
      }),
    ];

    if (isPlayable(scenario)) {
      list.append(el("a", { class: "drill-card", href: `#/rapidos/${scenario.id}` }, body));
    } else {
      const card = el("div", { class: "drill-card locked" }, body);
      card.setAttribute("aria-disabled", "true");
      list.append(card);
    }
  }

  root.append(list);

  return () => root.replaceChildren();
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, string>} params
 * @returns {() => void}
 */
export function mountScenario(root, params) {
  const scenario = params["id"] ? scenarioById(params["id"]) : null;
  if (!scenario || !isPlayable(scenario)) {
    root.append(
      el("nav", { class: "crumbs" }, [el("a", { href: "#/rapidos", text: "← treinos rápidos" })]),
      el("p", {
        class: "callout",
        text: scenario
          ? `Este cenário ainda não roda: ${scenario.blockedBy}.`
          : "Esse cenário não existe.",
      }),
    );
    return () => root.replaceChildren();
  }

  root.append(
    el("nav", { class: "crumbs" }, [el("a", { href: "#/rapidos", text: "← treinos rápidos" })]),
    el("header", { class: "view-head" }, [
      el("h1", { text: scenario.name }),
      el("p", {
        class: "tagline",
        text:
          `treina ${scenario.trains.map(describeAxis).join(" e ")}`
          + ` · ${describePedal(scenario.pedal)} · ${scenario.durationMs / 1000}s`
          + ` · mede ${scenario.focus}`,
      }),
      el("p", { class: "lead", text: scenario.shape }),
      el("p", { class: "lead", text: scenario.detail }),
    ]),
  );

  const reading = readPedals();
  if (!reading.ready) {
    const callout = el("p", { class: "callout" }, [
      el("span", { text: "Mapeie e calibre os dois pedais antes de treinar. " }),
      el("a", { href: "#/config", text: "Configurar →" }),
    ]);
    root.append(callout);
    return () => root.replaceChildren();
  }

  // Capturado depois da guarda: o narrowing de `scenario` não atravessa o closure
  // assíncrono de `run`, e repetir a checagem lá dentro seria ruído.
  const target = scenario;

  // A largada é medida contra um evento, não contra um guia — por isso ela roda
  // hoje, enquanto os demais esperam a curva-alvo do M1.
  if (target.kind === "launch") {
    const teardownLaunch = mountLaunchPanel(root, target);
    return () => {
      teardownLaunch();
      root.replaceChildren();
    };
  }

  const teardownRun = mountScenarioRun(root, target);

  return () => {
    teardownRun();
    root.replaceChildren();
  };
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function mountNotFound(root) {
  root.append(
    el("header", { class: "view-head" }, [el("h1", { text: "Página não encontrada" })]),
    el("p", { class: "callout" }, [el("a", { href: "#/", text: "voltar ao início" })]),
  );
  const timer = setTimeout(() => navigate("/"), 3000);
  return () => {
    clearTimeout(timer);
    root.replaceChildren();
  };
}
