/**
 * App shell and routes.
 */

import { startRouter } from "./ui/router.js";
import { mountHome } from "./ui/home-view.js";
import { mountNotFound, mountQuickScenarios, mountScenario } from "./ui/quick-scenarios-view.js";
import { mountSetup } from "./ui/setup-view.js";

const view = document.getElementById("view");

if (view instanceof HTMLElement) {
  startRouter(
    view,
    [
      { pattern: "/", view: mountHome },
      { pattern: "/rapidos", view: mountQuickScenarios },
      { pattern: "/rapidos/:id", view: mountScenario },
      { pattern: "/config", view: mountSetup },
    ],
    mountNotFound,
  );
} else {
  console.error("elemento #view não encontrado");
}
