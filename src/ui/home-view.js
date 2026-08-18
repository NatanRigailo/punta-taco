/**
 * Home: pick a category of training.
 *
 * The locked cards are shown rather than hidden. Someone landing here should be
 * able to see where the product is going, and a category that appears later
 * without ever having been visible reads as a surprise instead of a promise
 * kept.
 */

import { el } from "./dom.js";
import { QUICK_SCENARIOS, isPlayable } from "../scenarios/catalog.js";
import { readPedals } from "../input/pedals.js";

/**
 * @typedef {object} Category
 * @property {string} title
 * @property {string} tagline
 * @property {string} description
 * @property {string | null} href   Null when not available yet.
 * @property {string} status
 */

/** @returns {Category[]} */
function categories() {
  return [
    {
      title: "Treinos rápidos",
      tagline: "5–8s por tentativa",
      description:
        "Um momento de corrida por vez, repetido até sair limpo. Ciclo curto: pisa, vê o traço, repete.",
      href: "#/rapidos",
      status: `${QUICK_SCENARIOS.filter(isPlayable).length} cenários`,
    },
    {
      title: "Sessões",
      tagline: "sequências de ~60s",
      description:
        "Vários cenários encadeados, como numa volta. Treina resistência e consistência, não só o momento isolado.",
      href: null,
      status: "em breve",
    },
    {
      title: "Drill do dia",
      tagline: "a mesma curva para todos",
      description:
        "Um desafio por dia, igual para todo mundo, com placar comparável. Precisa de servidor — chega no M2.",
      href: null,
      status: "em breve",
    },
    {
      title: "Prática livre",
      tagline: "sem alvo",
      description:
        "Só o traço e as métricas, sem curva para seguir. Para explorar o próprio pé sem estar sendo medido contra nada.",
      href: null,
      status: "em breve",
    },
  ];
}

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function mountHome(root) {
  const reading = readPedals();

  const hero = el("header", { class: "hero" }, [
    el("h1", { text: "Punta Taco" }),
    el("p", { class: "motto", text: "smooth is fast" }),
    el("p", {
      class: "lead",
      text:
        "Aqui o pedal é isolado do resto: uma curva-alvo, o traço realizado, e números que "
        + "apontam onde a aplicação foi grosseira. Ciclo de repetição de segundos, não de voltas.",
    }),
  ]);

  const grid = el("div", { class: "category-grid" });
  for (const category of categories()) {
    const badge = el("span", { class: "badge", text: category.status });
    const body = [
      el("div", { class: "card-head" }, [el("h2", { text: category.title }), badge]),
      el("p", { class: "tagline", text: category.tagline }),
      el("p", { class: "card-text", text: category.description }),
    ];

    if (category.href) {
      const card = el("a", { class: "category-card", href: category.href }, body);
      grid.append(card);
    } else {
      badge.classList.add("muted");
      const card = el("div", { class: "category-card locked" }, body);
      card.setAttribute("aria-disabled", "true");
      grid.append(card);
    }
  }

  root.append(hero, grid);

  // A pedaleira uncalibrated is the one thing that blocks every category, so it
  // gets said here rather than being discovered inside a scenario.
  if (!reading.ready) {
    root.append(
      el("p", { class: "callout" }, [
        el("span", {
          text: "Os pedais ainda não estão mapeados e calibrados. ",
        }),
        el("a", { href: "#/config", text: "Configurar agora →" }),
      ]),
    );
  }

  return () => root.replaceChildren();
}
