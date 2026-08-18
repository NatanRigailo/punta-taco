/**
 * Device selection and pedal mapping panel.
 *
 * Deliberately does its own rendering with plain DOM: the panel is small, and
 * the live readout runs on the animation frame, which is easier to reason about
 * without a framework re-render in between.
 */

import { watchDevices } from "../input/devices.js";
import {
  assign,
  assignmentFor,
  clearAssignment,
  detectAxis,
  pruneMissingDevices,
  readPedal,
} from "../input/mapping.js";

/** @typedef {import("../input/devices.js").DeviceInfo} DeviceInfo */
/** @typedef {import("../input/mapping.js").PedalRole} PedalRole */

/** @type {{ role: PedalRole, label: string }[]} */
const ROLES = [
  { role: "brake", label: "Freio" },
  { role: "throttle", label: "Acelerador" },
];

/**
 * @param {string} tag
 * @param {{ class?: string, text?: string }} [attrs]
 * @param {(Node | string)[]} [children]
 */
function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  if (attrs.class) node.className = attrs.class;
  if (attrs.text !== undefined) node.textContent = attrs.text;
  for (const child of children) node.append(child);
  return node;
}

/**
 * @param {HTMLElement} root
 * @returns {() => void} Teardown.
 */
export function mountInputPanel(root) {
  /** @type {DeviceInfo[]} */
  let devices = [];
  /** @type {number | null} */
  let selected = null;
  /** @type {PedalRole | null} */
  let detecting = null;

  const status = el("p", { class: "status" });
  const select = document.createElement("select");
  select.className = "device-select";
  const deviceRow = el("div", { class: "row" }, [select]);

  /** @type {Map<PedalRole, { axisText: HTMLElement, fill: HTMLElement, button: HTMLButtonElement, hint: HTMLElement }>} */
  const roleViews = new Map();

  const roleList = el("div", { class: "roles" });
  for (const { role, label } of ROLES) {
    const axisText = el("span", { class: "axis-text", text: "não mapeado" });
    const fill = el("i");
    const bar = el("div", { class: "bar" }, [fill]);
    const button = document.createElement("button");
    button.textContent = "detectar";
    button.type = "button";
    const hint = el("span", { class: "hint" });

    button.addEventListener("click", () => void runDetection(role));

    roleList.append(
      el("div", { class: "role" }, [
        el("div", { class: "role-head" }, [
          el("strong", { text: label }),
          axisText,
          button,
        ]),
        bar,
        hint,
      ]),
    );
    roleViews.set(role, { axisText, fill, button, hint });
  }

  root.append(status, deviceRow, roleList);

  /** @param {PedalRole} role */
  async function runDetection(role) {
    if (selected === null || detecting) return;
    detecting = role;
    const view = roleViews.get(role);
    syncButtons();

    try {
      const result = await detectAxis(selected, {
        onProgress: (remaining) => {
          if (view) view.hint.textContent = `pressione o pedal até o fundo — ${(remaining / 1000).toFixed(1)}s`;
        },
      });
      assign(role, selected, result.axis);
      if (view) {
        view.hint.textContent =
          `eixo ${result.axis}, curso de ${(result.travel / 2 * 100).toFixed(0)}%` +
          (result.runnerUp > 0.05 ? ` (segundo colocado: ${(result.runnerUp / 2 * 100).toFixed(0)}%)` : "");
      }
    } catch (err) {
      if (view) view.hint.textContent = err instanceof Error ? err.message : String(err);
      clearAssignment(role);
    } finally {
      detecting = null;
      syncButtons();
      renderRoles();
    }
  }

  function syncButtons() {
    for (const [role, view] of roleViews) {
      const busy = detecting !== null;
      view.button.disabled = selected === null || busy;
      view.button.textContent = detecting === role ? "detectando…" : "detectar";
    }
  }

  function renderRoles() {
    for (const [role, view] of roleViews) {
      const a = assignmentFor(role);
      view.axisText.textContent = a ? `eixo ${a.axis}` : "não mapeado";
      view.axisText.classList.toggle("mapped", a !== null);
    }
  }

  function renderDevices() {
    if (devices.length === 0) {
      status.textContent =
        "Nenhuma pedaleira visível. O Chrome só revela o dispositivo depois de um input — pise num pedal ou aperte um botão.";
      status.className = "status waiting";
      deviceRow.hidden = true;
      roleList.hidden = true;
      selected = null;
      syncButtons();
      return;
    }

    status.textContent = `${devices.length} dispositivo(s) visível(is).`;
    status.className = "status ok";
    deviceRow.hidden = false;
    roleList.hidden = false;

    const stillThere = devices.some((d) => d.index === selected);
    if (!stillThere) {
      const first = devices[0];
      selected = first ? first.index : null;
    }

    select.replaceChildren();
    for (const d of devices) {
      const option = document.createElement("option");
      option.value = String(d.index);
      option.textContent = `[${d.index}] ${d.id} — ${d.axisCount} eixos`;
      select.append(option);
    }
    if (selected !== null) select.value = String(selected);
    syncButtons();
  }

  select.addEventListener("change", () => {
    selected = Number(select.value);
    syncButtons();
  });

  const unwatch = watchDevices((next) => {
    devices = next;
    // A device that vanished must not leave a role pointing at a dead axis.
    for (const role of pruneMissingDevices()) {
      const view = roleViews.get(role);
      if (view) view.hint.textContent = "dispositivo desconectado — mapeie de novo";
    }
    renderDevices();
    renderRoles();
  });

  let frame = 0;
  const tick = () => {
    for (const [role, view] of roleViews) {
      const raw = readPedal(role);
      const normalised = raw === null ? 0 : (raw + 1) / 2;
      view.fill.style.width = `${(normalised * 100).toFixed(1)}%`;
      view.fill.classList.toggle("idle", raw === null);
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  renderDevices();
  renderRoles();

  return () => {
    cancelAnimationFrame(frame);
    unwatch();
    root.replaceChildren();
  };
}
