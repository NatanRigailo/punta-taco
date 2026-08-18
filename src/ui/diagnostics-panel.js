/**
 * Hardware diagnosis, in the app.
 *
 * Replaces the throwaway `/probe/` page with something that runs against the
 * calibrated pedal and writes its verdict into the hardware profile, so the
 * engine can size its filter from measured facts rather than assumptions.
 */

import { assignmentFor } from "../input/mapping.js";
import { calibrationFor } from "../input/calibration.js";
import { getPad } from "../input/devices.js";
import { captureReadings } from "../input/measure.js";
import {
  analyseCadence,
  analyseNoise,
  analyseResolution,
  describeGrade,
  judge,
} from "../engine/diagnostics.js";
import { STEP_MS } from "../engine/resample.js";
import { getProfile, putProfile } from "../storage/db.js";
import { createProfile, withHardware } from "../storage/profiles.js";

const REST_MS = 2000;
const SWEEP_MS = 10000;

/** @type {Record<import("../engine/diagnostics.js").Verdict["grade"], string>} */
const GRADE_LABEL = {
  full: "completo",
  partial: "parcial",
  limited: "limitado",
};

/**
 * @param {HTMLElement} root
 * @returns {() => void} Teardown.
 */
export function mountDiagnosticsPanel(root) {
  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.textContent = "diagnosticar hardware";

  const state = document.createElement("span");
  state.className = "summary";

  const report = document.createElement("table");
  report.className = "report";

  const warnings = document.createElement("ul");
  warnings.className = "warnings";
  warnings.hidden = true;

  const head = document.createElement("div");
  head.className = "role-head";
  const title = document.createElement("strong");
  title.textContent = "Diagnóstico";
  head.append(title, state, startButton);

  root.append(head, report, warnings);

  let running = false;

  const refresh = () => {
    if (running) return;
    const ready = assignmentFor("brake") !== null && calibrationFor("brake") !== null;
    startButton.disabled = !ready;
    if (!ready && report.rows.length === 0) {
      state.textContent = "mapeie e calibre o freio primeiro";
    }
  };

  const timer = setInterval(refresh, 250);
  refresh();

  startButton.addEventListener("click", () => void run());

  async function run() {
    const assignment = assignmentFor("brake");
    const calibration = calibrationFor("brake");
    if (!assignment || !calibration) return;

    running = true;
    startButton.disabled = true;
    report.replaceChildren();
    warnings.replaceChildren();
    warnings.hidden = true;

    try {
      const rest = await captureReadings(assignment.deviceIndex, assignment.axis, {
        durationMs: REST_MS,
        onProgress: (remaining) => {
          state.textContent = `tire o pé do pedal — ${(remaining / 1000).toFixed(1)}s`;
        },
      });

      const sweep = await captureReadings(assignment.deviceIndex, assignment.axis, {
        durationMs: SWEEP_MS,
        onProgress: (remaining) => {
          state.textContent = `percorra o curso inteiro, devagar — ${(remaining / 1000).toFixed(1)}s`;
        },
      });

      // Cadence comes from the sweep: a still pedal reports without changing,
      // and measuring the rate while nothing moves is what produced a wrong
      // number in the first version of the standalone probe.
      const cadence = analyseCadence(sweep.readings, sweep.elapsedMs);
      const resolution = analyseResolution(sweep.readings);
      const noise = analyseNoise(rest.readings);
      const travelRaw = Math.abs(calibration.pressedRaw - calibration.restRaw);

      const verdict = judge({ cadence, resolution, noise, travelRaw, stepMs: STEP_MS });
      render(verdict, cadence, noise, travelRaw);
      await save(assignment.deviceIndex, verdict, cadence, noise, travelRaw);
    } catch (err) {
      state.textContent = err instanceof Error ? err.message : String(err);
    } finally {
      running = false;
      refresh();
    }
  }

  /**
   * @param {import("../engine/diagnostics.js").Verdict} verdict
   * @param {import("../engine/diagnostics.js").CadenceReport} cadence
   * @param {import("../engine/diagnostics.js").NoiseReport} noise
   * @param {number} travelRaw
   */
  function render(verdict, cadence, noise, travelRaw) {
    state.textContent = `grau ${GRADE_LABEL[verdict.grade]} — ${describeGrade(verdict.grade)}`;

    /** @type {[string, string, string?][]} */
    const rows = [
      [
        "taxa de report",
        `${cadence.reportRateHz.toFixed(0)} Hz · mediana ${cadence.medianGapMs.toFixed(1)} ms`,
        cadence.reportRateHz >= 40 ? "ok" : "warn",
      ],
      [
        "resolução sobre o curso",
        `${verdict.bits.toFixed(2)} bits · degrau de ${(verdict.stepFraction * 100).toFixed(3)}%`,
        verdict.bits >= 8 ? "ok" : verdict.bits >= 6 ? "warn" : "bad",
      ],
      [
        "ruído em repouso",
        `${((noise.peakToPeakRaw / travelRaw) * 100).toFixed(3)}% do curso`,
        noise.peakToPeakRaw / travelRaw < 0.003 ? "ok" : "warn",
      ],
      [
        "jerk",
        verdict.jerkPublishable
          ? `utilizável — janela de ${verdict.windowPoints} pontos, piso de ruído ${verdict.jerkNoise.toFixed(2)} curso/s²`
          : "não publicável neste hardware",
        verdict.jerkPublishable ? "ok" : "bad",
      ],
    ];

    for (const [label, value, cls] of rows) {
      const tr = document.createElement("tr");
      const th = document.createElement("td");
      th.textContent = label;
      const td = document.createElement("td");
      td.textContent = value;
      if (cls) td.className = cls;
      tr.append(th, td);
      report.append(tr);
    }

    if (verdict.warnings.length > 0) {
      warnings.hidden = false;
      for (const message of verdict.warnings) {
        const li = document.createElement("li");
        li.textContent = message;
        warnings.append(li);
      }
    }
  }

  /**
   * @param {number} deviceIndex
   * @param {import("../engine/diagnostics.js").Verdict} verdict
   * @param {import("../engine/diagnostics.js").CadenceReport} cadence
   * @param {import("../engine/diagnostics.js").NoiseReport} noise
   * @param {number} travelRaw
   */
  async function save(deviceIndex, verdict, cadence, noise, travelRaw) {
    const pad = getPad(deviceIndex);
    if (!pad) return;

    const stored = (await getProfile(pad.id)) ?? createProfile(pad.id, pad.id);
    await putProfile(
      withHardware(stored, {
        reportRateHz: cadence.reportRateHz,
        medianGapMs: cadence.medianGapMs,
        stepFraction: verdict.stepFraction,
        bits: verdict.bits,
        noiseFraction: travelRaw > 0 ? noise.peakToPeakRaw / travelRaw : 0,
        grade: verdict.grade,
        jerkPublishable: verdict.jerkPublishable,
        windowPoints: verdict.windowPoints,
        measuredAt: Date.now(),
      }),
    );
  }

  return () => {
    clearInterval(timer);
    root.replaceChildren();
  };
}
