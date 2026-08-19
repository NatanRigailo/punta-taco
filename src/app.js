/**
 * App entry point. Today the app sets up hardware and records one attempt;
 * drills and metrics arrive once the filter lands.
 */

import { mountInputPanel } from "./ui/input-panel.js";
import { mountRecordPanel } from "./ui/record-panel.js";
import { mountDiagnosticsPanel } from "./ui/diagnostics-panel.js";
import { mountTracePanel } from "./ui/trace-panel.js";

/**
 * @param {string} id
 * @param {(root: HTMLElement) => unknown} mount
 */
function mountInto(id, mount) {
  const root = document.getElementById(id);
  if (root instanceof HTMLElement) mount(root);
  else console.error(`elemento #${id} não encontrado`);
}

mountInto("input-panel", mountInputPanel);
mountInto("trace-panel", mountTracePanel);
mountInto("diagnostics-panel", mountDiagnosticsPanel);
mountInto("record-panel", mountRecordPanel);
