/**
 * Device selection, pedal mapping, calibration and hardware profile.
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
  onAssignmentChange,
  pruneMissingDevices,
  readPedal,
} from "../input/mapping.js";
import {
  calibrationFor,
  captureCalibration,
  clearCalibration,
  describeCalibration,
  isCalibrated,
  normalise,
  onCalibrationChange,
  setCalibration,
} from "../input/calibration.js";
import { deleteProfile, getProfile, listProfiles, putProfile } from "../storage/db.js";
import {
  createProfile,
  parseProfilesExport,
  serialiseProfiles,
  withPedal,
  withoutPedal,
} from "../storage/profiles.js";

/** @typedef {import("../input/devices.js").DeviceInfo} DeviceInfo */
/** @typedef {import("../input/mapping.js").PedalRole} PedalRole */
/** @typedef {import("../storage/profiles.js").HardwareProfile} HardwareProfile */

/** @typedef {{ role: PedalRole, kind: "detect" | "calibrate" }} BusyState */

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
 * @param {string} text
 * @returns {HTMLButtonElement}
 */
function button(text) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = text;
  return node;
}

/**
 * The gamepad id carries vendor and product ids that are noise in a label.
 * @param {string} deviceId
 */
function shortName(deviceId) {
  const cut = deviceId.indexOf("(");
  return (cut > 0 ? deviceId.slice(0, cut) : deviceId).trim() || deviceId;
}

/**
 * @typedef {object} RoleView
 * @property {HTMLElement} axisText
 * @property {HTMLElement} fill
 * @property {HTMLElement} marker
 * @property {HTMLButtonElement} detectButton
 * @property {HTMLButtonElement} calibrateButton
 * @property {HTMLElement} hint
 * @property {HTMLElement} summary
 */

/**
 * @param {HTMLElement} root
 * @returns {() => void} Teardown.
 */
export function mountInputPanel(root) {
  /** @type {DeviceInfo[]} */
  let devices = [];
  /** @type {number | null} */
  let selected = null;
  /** @type {BusyState | null} */
  let busy = null;
  /** @type {HardwareProfile | null} */
  let profile = null;
  /** While a stored profile is being applied, changes are echoes of the load
   *  and must not be written straight back. */
  let restoring = false;
  /** Device changes can arrive faster than IndexedDB answers, so each restore
   *  claims a sequence number and a superseded one drops its result instead of
   *  applying a profile for a device that is no longer selected. */
  let restoreSeq = 0;

  const status = el("p", { class: "status" });
  const select = document.createElement("select");
  select.className = "device-select";
  const deviceRow = el("div", { class: "row" }, [select]);

  /** @type {Map<PedalRole, RoleView>} */
  const roleViews = new Map();
  const roleList = el("div", { class: "roles" });

  for (const { role, label } of ROLES) {
    const axisText = el("span", { class: "axis-text", text: "não mapeado" });
    const fill = el("i");
    const marker = el("u", { class: "deadzone" });
    const bar = el("div", { class: "bar" }, [fill, marker]);
    const detectButton = button("detectar eixo");
    const calibrateButton = button("calibrar");
    const hint = el("span", { class: "hint" });
    const summary = el("span", { class: "summary" });

    detectButton.addEventListener("click", () => void runDetection(role));
    calibrateButton.addEventListener("click", () => void runCalibration(role));

    roleList.append(
      el("div", { class: "role" }, [
        el("div", { class: "role-head" }, [
          el("strong", { text: label }),
          axisText,
          detectButton,
          calibrateButton,
        ]),
        bar,
        hint,
        summary,
      ]),
    );

    roleViews.set(role, {
      axisText, fill, marker, detectButton, calibrateButton, hint, summary,
    });
  }

  const readiness = el("p", { class: "readiness" });

  const profileState = el("span", { class: "summary" });
  const exportButton = button("exportar");
  const importButton = button("importar");
  const forgetButton = button("esquecer perfil");
  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.hidden = true;

  const profileBox = el("div", { class: "profile" }, [
    el("div", { class: "role-head" }, [
      el("strong", { text: "Perfil" }),
      profileState,
      exportButton,
      importButton,
      forgetButton,
    ]),
    importInput,
  ]);

  exportButton.addEventListener("click", () => void runExport());
  importButton.addEventListener("click", () => importInput.click());
  importInput.addEventListener("change", () => void runImport());
  forgetButton.addEventListener("click", () => void runForget());

  root.append(status, deviceRow, roleList, readiness, profileBox);

  /* ---------- persistence ------------------------------------------------ */

  /** @param {number | null} index */
  async function setSelected(index) {
    if (selected === index) return;
    selected = index;
    syncControls();
    await restoreProfile();
  }

  /** @returns {DeviceInfo | null} */
  function selectedDevice() {
    return devices.find((d) => d.index === selected) ?? null;
  }

  async function restoreProfile() {
    const seq = ++restoreSeq;
    const device = selectedDevice();
    restoring = true;
    try {
      for (const { role } of ROLES) {
        clearCalibration(role);
        clearAssignment(role);
      }
      const stored = device ? await getProfile(device.id) : null;
      if (seq !== restoreSeq) return; // superseded by a newer selection
      profile = stored;

      if (device && profile) {
        for (const { role } of ROLES) {
          const entry = profile.pedals[role];
          if (!entry) continue;
          // Order matters: assigning clears the calibration for that role, so
          // the stored calibration has to be applied after the assignment.
          assign(role, device.index, entry.axis);
          setCalibration(role, entry.calibration);
        }
      }
    } catch (err) {
      if (seq === restoreSeq) {
        profileState.textContent = `falha ao ler o perfil: ${messageOf(err)}`;
      }
    } finally {
      // Only the newest restore owns the flag; an older one unsetting it would
      // let the echo of its own writes reach persist().
      if (seq === restoreSeq) restoring = false;
    }
    if (seq !== restoreSeq) return;
    renderRoles();
    renderProfile();
  }

  async function persist() {
    if (restoring) return;
    const device = selectedDevice();
    if (!device) return;

    let next = profile ?? createProfile(device.id, shortName(device.id));
    for (const { role } of ROLES) {
      const assignment = assignmentFor(role);
      const calibration = calibrationFor(role);
      next = assignment && calibration
        ? withPedal(next, role, { axis: assignment.axis, calibration })
        : withoutPedal(next, role);
    }

    try {
      await putProfile(next);
      profile = next;
    } catch (err) {
      profileState.textContent = `falha ao salvar: ${messageOf(err)}`;
      return;
    }
    renderProfile();
  }

  async function runExport() {
    try {
      const all = await listProfiles();
      if (all.length === 0) {
        profileState.textContent = "nada para exportar ainda";
        return;
      }
      const blob = new Blob([serialiseProfiles(all)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "punta-taco-perfis.json";
      link.click();
      URL.revokeObjectURL(url);
      profileState.textContent = `${all.length} perfil(is) exportado(s)`;
    } catch (err) {
      profileState.textContent = `falha ao exportar: ${messageOf(err)}`;
    }
  }

  async function runImport() {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;

    try {
      const imported = parseProfilesExport(await file.text());
      for (const entry of imported) await putProfile(entry);
      await restoreProfile();
      profileState.textContent = `${imported.length} perfil(is) importado(s)`;
    } catch (err) {
      // Import is the one place consuming data the app did not produce, so the
      // failure has to name what is wrong instead of failing silently.
      profileState.textContent = `arquivo recusado: ${messageOf(err)}`;
    }
  }

  async function runForget() {
    const device = selectedDevice();
    if (!device) return;
    try {
      await deleteProfile(device.id);
      await restoreProfile();
      profileState.textContent = "perfil apagado";
    } catch (err) {
      profileState.textContent = `falha ao apagar: ${messageOf(err)}`;
    }
  }

  /* ---------- flows ------------------------------------------------------ */

  /** @param {PedalRole} role */
  async function runDetection(role) {
    if (selected === null || busy) return;
    busy = { role, kind: "detect" };
    const view = roleViews.get(role);
    syncControls();

    try {
      const result = await detectAxis(selected, {
        onProgress: (remaining) => {
          if (view) {
            view.hint.textContent = `pressione o pedal até o fundo — ${(remaining / 1000).toFixed(1)}s`;
          }
        },
      });
      assign(role, selected, result.axis);
      if (view) view.hint.textContent = `eixo ${result.axis} identificado — agora calibre`;
    } catch (err) {
      if (view) view.hint.textContent = messageOf(err);
      clearAssignment(role);
    } finally {
      busy = null;
      syncControls();
      renderRoles();
    }
  }

  /** @param {PedalRole} role */
  async function runCalibration(role) {
    const assignment = assignmentFor(role);
    if (!assignment || busy) return;
    busy = { role, kind: "calibrate" };
    const view = roleViews.get(role);
    clearCalibration(role);
    syncControls();

    try {
      const calibration = await captureCalibration(assignment.deviceIndex, assignment.axis, {
        onPhase: (phase, remaining) => {
          if (!view) return;
          view.hint.textContent = phase === "rest"
            ? `tire o pé do pedal — ${(remaining / 1000).toFixed(1)}s`
            : `percorra o curso inteiro, do zero ao fundo — ${(remaining / 1000).toFixed(1)}s`;
        },
      });
      setCalibration(role, calibration);
      if (view) view.hint.textContent = "calibrado e salvo";
    } catch (err) {
      if (view) view.hint.textContent = messageOf(err);
    } finally {
      busy = null;
      syncControls();
      renderRoles();
    }
  }

  /* ---------- rendering -------------------------------------------------- */

  function syncControls() {
    const running = busy !== null;
    for (const [role, view] of roleViews) {
      view.detectButton.disabled = selected === null || running;
      view.calibrateButton.disabled = running || assignmentFor(role) === null;

      const mine = busy && busy.role === role ? busy.kind : null;
      view.detectButton.textContent = mine === "detect" ? "detectando…" : "detectar eixo";
      view.calibrateButton.textContent = mine === "calibrate"
        ? "calibrando…"
        : isCalibrated(role) ? "recalibrar" : "calibrar";
    }
    forgetButton.disabled = running || profile === null;
    exportButton.disabled = running;
    importButton.disabled = running;
  }

  function renderRoles() {
    for (const [role, view] of roleViews) {
      const assignment = assignmentFor(role);
      view.axisText.textContent = assignment ? `eixo ${assignment.axis}` : "não mapeado";
      view.axisText.classList.toggle("mapped", assignment !== null);

      const calibration = calibrationFor(role);
      if (calibration) {
        const d = describeCalibration(calibration);
        view.summary.textContent =
          `curso ${d.travelPct.toFixed(0)}% do eixo · deadzone ${d.deadzonePct.toFixed(1)}%` +
          (d.inverted ? " · eixo invertido, corrigido" : "");
        view.marker.style.width = `${d.deadzonePct.toFixed(2)}%`;
        view.marker.hidden = false;
      } else {
        view.summary.textContent = assignment ? "sem calibração — leitura ainda é o valor bruto" : "";
        view.marker.hidden = true;
      }
    }
    renderReadiness();
  }

  function renderReadiness() {
    const missing = ROLES.filter(({ role }) => !isCalibrated(role));
    if (missing.length === 0) {
      readiness.textContent = "Freio e acelerador calibrados — pronto para treinar.";
      readiness.className = "readiness ok";
      return;
    }
    const names = missing.map((m) => m.label.toLowerCase()).join(" e ");
    readiness.textContent = `Falta calibrar: ${names}. Nenhum cenário roda sem calibração.`;
    readiness.className = "readiness pending";
  }

  function renderProfile() {
    if (!profile) {
      profileState.textContent = selected === null
        ? "nenhum dispositivo selecionado"
        : "sem perfil salvo — calibrar já grava um";
    } else {
      const when = new Date(profile.updatedAt).toLocaleString("pt-BR");
      const mapped = Object.keys(profile.pedals).length;
      profileState.textContent = `${profile.name} · ${mapped} pedal(is) · salvo em ${when}`;
    }
    syncControls();
  }

  function renderDevices() {
    if (devices.length === 0) {
      status.textContent =
        "Nenhuma pedaleira visível. O Chrome só revela o dispositivo depois de um input — pise num pedal ou aperte um botão.";
      status.className = "status waiting";
      deviceRow.hidden = true;
      roleList.hidden = true;
      void setSelected(null);
      syncControls();
      return;
    }

    status.textContent = `${devices.length} dispositivo(s) visível(is).`;
    status.className = "status ok";
    deviceRow.hidden = false;
    roleList.hidden = false;

    select.replaceChildren();
    for (const d of devices) {
      const option = document.createElement("option");
      option.value = String(d.index);
      option.textContent = `[${d.index}] ${d.id} — ${d.axisCount} eixos`;
      select.append(option);
    }

    if (!devices.some((d) => d.index === selected)) {
      const first = devices[0];
      void setSelected(first ? first.index : null);
    }
    if (selected !== null) select.value = String(selected);
    syncControls();
  }

  select.addEventListener("change", () => void setSelected(Number(select.value)));

  // Remapping an axis invalidates the calibration captured for the old one.
  const unassign = onAssignmentChange((role) => {
    clearCalibration(role);
    renderRoles();
  });

  // Every calibration change — new, cleared or restored — is what the profile
  // tracks, so persistence hangs off this single point.
  const uncalibrate = onCalibrationChange(() => {
    renderRoles();
    void persist();
  });

  const unwatch = watchDevices((next) => {
    devices = next;
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
      const calibration = calibrationFor(role);
      const value = raw === null
        ? 0
        : calibration
          ? normalise(calibration, raw)
          : (raw + 1) / 2;
      view.fill.style.width = `${(value * 100).toFixed(1)}%`;
      view.fill.classList.toggle("idle", raw === null);
      view.fill.classList.toggle("raw", raw !== null && calibration === null);
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);

  renderDevices();
  renderRoles();
  renderProfile();

  return () => {
    cancelAnimationFrame(frame);
    unwatch();
    unassign();
    uncalibrate();
    root.replaceChildren();
  };
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
