/**
 * Configuration: everything about the hardware, out of the training flow.
 *
 * These panels used to be the whole page. They are setup, not training, and
 * having them in front of someone who just wants to pedal was an artefact of
 * building the engine before the product.
 */

import { el } from "./dom.js";
import { mountInputPanel } from "./input-panel.js";
import { mountDiagnosticsPanel } from "./diagnostics-panel.js";

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function mountSetup(root) {
  root.append(
    el("nav", { class: "crumbs" }, [el("a", { href: "#/", text: "← início" })]),
    el("header", { class: "view-head" }, [
      el("h1", { text: "Configuração" }),
      el("p", {
        class: "lead",
        text:
          "Sem calibração toda métrica é chute, então este passo é obrigatório antes do primeiro "
          + "drill. Feito uma vez, fica salvo por pedaleira.",
      }),
    ]),
  );

  const inputHost = el("section", { class: "panel" }, [
    el("h2", { text: "Pedais" }),
    el("p", {
      class: "lead",
      text:
        "Nada é assumido por padrão: a ordem dos eixos muda de dispositivo para dispositivo, e "
        + "mapear errado produz métrica do pedal errado sem nenhum sintoma visível.",
    }),
  ]);
  const inputRoot = el("div");
  inputHost.append(inputRoot);

  const diagnosticsHost = el("section", { class: "panel" }, [
    el("h2", { text: "Diagnóstico de hardware" }),
    el("p", {
      class: "lead",
      text:
        "Mede taxa de report, resolução útil sobre o curso calibrado e ruído em repouso, e decide "
        + "quais métricas a sua pedaleira sustenta. Hardware ruim gera aviso, nunca métrica falsa.",
    }),
  ]);
  const diagnosticsRoot = el("div");
  diagnosticsHost.append(diagnosticsRoot);

  root.append(inputHost, diagnosticsHost);

  const teardownInput = mountInputPanel(inputRoot);
  const teardownDiagnostics = mountDiagnosticsPanel(diagnosticsRoot);

  return () => {
    teardownInput();
    teardownDiagnostics();
    root.replaceChildren();
  };
}
