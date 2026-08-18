/**
 * App entry point. Everything the app does today is device setup; drills and
 * metrics arrive once the sampling engine lands.
 */

import { mountInputPanel } from "./ui/input-panel.js";

const root = document.getElementById("input-panel");
if (root instanceof HTMLElement) {
  mountInputPanel(root);
} else {
  console.error("elemento #input-panel não encontrado");
}
