/**
 * Quick drills: the list, and one drill being run.
 *
 * No target curve and no score yet — both are M1. What a run does today is
 * record the attempt on the fixed grid and show what the pedal actually did,
 * which is already the loop the product is built around.
 */

import { el, button, table } from "./dom.js";
import { QUICK_DRILLS, describePedal, drillById } from "../drills/catalog.js";
import { readPedals } from "../input/pedals.js";
import { recordAttempt } from "../engine/recorder.js";
import { STEP_MS } from "../engine/resample.js";
import { mountTracePanel } from "./trace-panel.js";
import { navigate } from "./router.js";

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function mountQuickDrills(root) {
  root.append(
    el("nav", { class: "crumbs" }, [el("a", { href: "#/", text: "← início" })]),
    el("header", { class: "view-head" }, [
      el("h1", { text: "Treinos rápidos" }),
      el("p", {
        class: "lead",
        text:
          "Um gesto por vez, entre 5 e 8 segundos. As formas vêm de telemetria real, não de "
          + "curvas inventadas. Curva-alvo e nota chegam no M1 — por enquanto cada drill grava a "
          + "tentativa e mostra o que o seu pé fez.",
      }),
    ]),
  );

  const list = el("div", { class: "drill-list" });
  for (const drill of QUICK_DRILLS) {
    list.append(
      el("a", { class: "drill-card", href: `#/rapidos/${drill.id}` }, [
        el("div", { class: "card-head" }, [
          el("h2", { text: drill.name }),
          el("span", { class: "badge muted", text: `${drill.durationMs / 1000}s` }),
        ]),
        el("p", { class: "card-text", text: drill.summary }),
        el("p", {
          class: "tagline",
          text: `${describePedal(drill.pedal)} · mede ${drill.focus}`,
        }),
      ]),
    );
  }
  root.append(list);

  return () => root.replaceChildren();
}

/**
 * @param {HTMLElement} root
 * @param {Record<string, string>} params
 * @returns {() => void}
 */
export function mountDrill(root, params) {
  const drill = params["id"] ? drillById(params["id"]) : null;
  if (!drill) {
    root.append(
      el("nav", { class: "crumbs" }, [el("a", { href: "#/rapidos", text: "← treinos rápidos" })]),
      el("p", { class: "callout", text: "Esse drill não existe." }),
    );
    return () => root.replaceChildren();
  }

  root.append(
    el("nav", { class: "crumbs" }, [el("a", { href: "#/rapidos", text: "← treinos rápidos" })]),
    el("header", { class: "view-head" }, [
      el("h1", { text: drill.name }),
      el("p", { class: "tagline", text: `${describePedal(drill.pedal)} · ${drill.durationMs / 1000}s · mede ${drill.focus}` }),
      el("p", { class: "lead", text: drill.detail }),
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

  // Capturado depois da guarda: o narrowing de `drill` não atravessa o closure
  // assíncrono de `run`, e repetir a checagem lá dentro seria ruído.
  const target = drill;

  const traceHost = el("section", { class: "panel" });
  const traceTeardown = mountTracePanel(traceHost);

  const startButton = button("iniciar tentativa", { variant: "primary" });
  const state = el("span", { class: "summary" });
  const reportHost = el("div");

  const controls = el("section", { class: "panel" }, [
    el("div", { class: "role-head" }, [
      el("strong", { text: "Tentativa" }),
      state,
      startButton,
    ]),
    reportHost,
  ]);

  root.append(traceHost, controls);

  let running = false;
  startButton.addEventListener("click", () => void run());

  async function run() {
    if (running) return;
    running = true;
    startButton.disabled = true;
    reportHost.replaceChildren();

    const attempt = await recordAttempt({
      durationMs: target.durationMs,
      onProgress: (elapsed) => {
        state.textContent = `${((target.durationMs - elapsed) / 1000).toFixed(1)}s`;
      },
    });

    running = false;
    startButton.disabled = false;
    startButton.textContent = "repetir";
    state.textContent = attempt.trustworthy ? "tentativa gravada" : "tentativa suspeita";

    const expected = Math.round(target.durationMs / STEP_MS);
    const peakBrake = Math.max(0, ...attempt.series.brake);
    const peakThrottle = Math.max(0, ...attempt.series.throttle);

    /** @type {[string, string, string?][]} */
    const rows = [
      ["pico do freio", `${(peakBrake * 100).toFixed(1)}%`],
      ["pico do acelerador", `${(peakThrottle * 100).toFixed(1)}%`],
      [
        "série",
        `${attempt.series.brake.length} pontos · passo de ${attempt.series.stepMs}ms`,
        attempt.series.brake.length === expected ? "ok" : "bad",
      ],
      [
        "cadência do dispositivo",
        `mediana ${attempt.cadence.medianMs.toFixed(1)}ms · máx ${attempt.cadence.maxMs.toFixed(1)}ms`,
      ],
    ];
    if (attempt.warning) rows.push(["aviso", attempt.warning, "warn"]);

    reportHost.append(table(rows));
    reportHost.append(
      el("p", {
        class: "tagline",
        text: "Sem nota ainda: curva-alvo, faltas e métricas de suavidade chegam no M1.",
      }),
    );
  }

  return () => {
    traceTeardown();
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
