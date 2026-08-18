/**
 * App shell and routes.
 */

import { startRouter } from "./ui/router.js";
import { mountHome } from "./ui/home-view.js";
import { mountDrill, mountNotFound, mountQuickDrills } from "./ui/quick-drills-view.js";
import { mountSetup } from "./ui/setup-view.js";

const view = document.getElementById("view");

if (view instanceof HTMLElement) {
  startRouter(
    view,
    [
      { pattern: "/", view: mountHome },
      { pattern: "/rapidos", view: mountQuickDrills },
      { pattern: "/rapidos/:id", view: mountDrill },
      { pattern: "/config", view: mountSetup },
    ],
    mountNotFound,
  );
} else {
  console.error("elemento #view não encontrado");
}
