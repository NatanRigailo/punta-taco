/**
 * Live pedal trace.
 *
 * Telemetry convention throughout: x is time, running right to left, with the
 * playhead fixed at two thirds of the width. The empty third to its right is
 * the look-ahead — where the target curve will appear once drills exist.
 */

import { readPedals } from "../input/pedals.js";
import { assignmentFor } from "../input/mapping.js";
import { calibrationFor } from "../input/calibration.js";
import { getPad } from "../input/devices.js";
import { createLiveBuffer } from "../engine/live-buffer.js";
import { filterSeries } from "../engine/filter.js";
import { STEP_MS } from "../engine/resample.js";
import { getProfile } from "../storage/db.js";

/** Visible past, in milliseconds. */
const PAST_MS = 4000;
/** Fraction of the width occupied by the past. */
const PLAYHEAD = 2 / 3;

const MODE_KEY = "punta-taco/trace-mode";
/** @type {readonly ["raw", "filtered", "both"]} */
const MODES = ["raw", "filtered", "both"];

const COLOURS = {
  brake: "#4ade80",
  throttle: "#38bdf8",
  brakeFiltered: "#166534",
  throttleFiltered: "#075985",
};

/** @returns {"raw" | "filtered" | "both"} */
function loadMode() {
  const stored = localStorage.getItem(MODE_KEY);
  return MODES.includes(/** @type {any} */ (stored))
    ? /** @type {"raw" | "filtered" | "both"} */ (stored)
    : "raw";
}

/**
 * @param {HTMLElement} root
 * @returns {() => void} Teardown.
 */
export function mountTracePanel(root) {
  const capacity = Math.ceil(PAST_MS / STEP_MS) + 8; // headroom for the filter window
  const buffer = createLiveBuffer({ capacity });

  let mode = loadMode();
  // Until the diagnosis has run there is no measured step to size the window
  // from, so the narrowest window is assumed — it is the one that distorts the
  // signal least, and being under-filtered is the safer error to show.
  let halfWidth = 2;

  const canvas = document.createElement("canvas");
  canvas.className = "live-trace";
  canvas.width = 900;
  canvas.height = 260;

  const state = document.createElement("span");
  state.className = "summary";

  const controls = document.createElement("div");
  controls.className = "trace-modes";
  for (const [value, label] of /** @type {[typeof MODES[number], string][]} */ ([
    ["raw", "cru"],
    ["filtered", "filtrado"],
    ["both", "ambos"],
  ])) {
    const id = `trace-mode-${value}`;
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "trace-mode";
    input.id = id;
    input.value = value;
    input.checked = mode === value;
    input.addEventListener("change", () => {
      if (!input.checked) return;
      mode = value;
      localStorage.setItem(MODE_KEY, value);
      renderState();
    });
    const text = document.createElement("label");
    text.htmlFor = id;
    text.textContent = label;
    controls.append(input, text);
  }

  const head = document.createElement("div");
  head.className = "role-head";
  const title = document.createElement("strong");
  title.textContent = "Traço ao vivo";
  head.append(title, state, controls);

  root.append(head, canvas);

  void loadWindow();

  /** Uses the window the diagnosis picked for this device, when there is one. */
  async function loadWindow() {
    const assignment = assignmentFor("brake");
    if (!assignment) return;
    const pad = getPad(assignment.deviceIndex);
    if (!pad) return;
    try {
      const profile = await getProfile(pad.id);
      const points = profile?.hardware?.windowPoints;
      if (points && points >= 5) halfWidth = (points - 1) / 2;
    } catch {
      // A profile that cannot be read is not worth interrupting the trace for.
    }
    renderState();
  }

  function renderState() {
    const ready = calibrationFor("brake") !== null || calibrationFor("throttle") !== null;
    if (!ready) {
      state.textContent = "calibre um pedal para o traço começar";
      return;
    }
    const lagMs = halfWidth * STEP_MS;
    state.textContent = mode === "raw"
      ? `sinal cru · grade de ${STEP_MS}ms`
      : `filtro de ${2 * halfWidth + 1} pontos · traço filtrado ${lagMs}ms atrás do playhead`;
  }

  const ctx = canvas.getContext("2d");
  let frame = 0;

  const tick = () => {
    buffer.advance(performance.now(), () => {
      const reading = readPedals();
      return { brake: reading.brake, throttle: reading.throttle };
    });
    draw();
    frame = requestAnimationFrame(tick);
  };

  /**
   * @param {CanvasRenderingContext2D} g
   * @param {readonly number[]} series
   * @param {number} count      How many samples back from the newest to draw.
   * @param {number} offset     Samples of lag between the newest and the playhead.
   * @param {number} playheadX
   * @param {number} bottom
   * @param {number} span
   * @param {string} colour
   * @param {number} lineWidth
   */
  function plot(g, series, count, offset, playheadX, bottom, span, colour, lineWidth) {
    if (count < 2) return;
    g.strokeStyle = colour;
    g.lineWidth = lineWidth;
    g.beginPath();
    for (let age = 0; age < count; age++) {
      const index = series.length - 1 - offset - age;
      if (index < 0) break;
      const value = series[index] ?? 0;
      const x = playheadX - (((offset + age) * STEP_MS) / PAST_MS) * playheadX;
      const y = bottom - Math.min(1, Math.max(0, value)) * span;
      if (age === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
  }

  function draw() {
    if (!ctx) return;
    const g = ctx;
    const { width, height } = canvas;
    const playheadX = width * PLAYHEAD;
    const top = 12;
    const bottom = height - 18;
    const span = bottom - top;

    g.clearRect(0, 0, width, height);

    // Look-ahead region, deliberately empty for now.
    g.fillStyle = "#0d0d0d";
    g.fillRect(playheadX, 0, width - playheadX, height);

    g.strokeStyle = "#1e1e1e";
    g.lineWidth = 1;
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      const y = bottom - fraction * span;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(width, y);
      g.stroke();
    }

    const { brake, throttle, filled } = buffer.series();
    const visible = Math.min(filled, Math.ceil(PAST_MS / STEP_MS));
    const rawWidth = mode === "both" ? 1 : 1.8;

    if (mode === "raw" || mode === "both") {
      plot(g, brake, visible, 0, playheadX, bottom, span, COLOURS.brake, rawWidth);
      plot(g, throttle, visible, 0, playheadX, bottom, span, COLOURS.throttle, rawWidth);
    }
    if ((mode === "filtered" || mode === "both") && filled > 2 * halfWidth + 1) {
      // Drawn `halfWidth` samples behind the playhead so every point comes from
      // a complete, centred window. Filtering right up to the edge would make
      // the line move after it was drawn, as later samples arrive.
      const smoothBrake = filterSeries(brake, { halfWidth, stepMs: STEP_MS });
      const smoothThrottle = filterSeries(throttle, { halfWidth, stepMs: STEP_MS });
      const count = visible - halfWidth;
      plot(g, smoothBrake, count, halfWidth, playheadX, bottom, span, COLOURS.brakeFiltered, 2.2);
      plot(g, smoothThrottle, count, halfWidth, playheadX, bottom, span, COLOURS.throttleFiltered, 2.2);
    }

    g.strokeStyle = "#f5f5f5";
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(playheadX, 0);
    g.lineTo(playheadX, height);
    g.stroke();

    g.fillStyle = "#5a5a5a";
    g.font = "11px ui-monospace, monospace";
    g.fillText("-4s", 4, height - 4);
    g.fillText("agora", playheadX + 6, height - 4);
    g.fillText("100%", 4, top + 10);
  }

  renderState();
  frame = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(frame);
    root.replaceChildren();
  };
}
