/**
 * Running a scenario against its guide.
 *
 * The guide scrolls in from the right and the realized trace is drawn behind
 * the playhead. Telemetry convention: x is time, right to left, playhead fixed
 * at two thirds — so the third to the right is what is about to be asked of
 * you, and the look-ahead is literally the point.
 *
 * The band around the guide is the tolerance. Drawing it is what turns "follow
 * this line" into something answerable: inside the band is right, outside is
 * not, and the width of the band says how much precision the segment demands.
 */

import { el, button, table } from "./dom.js";
import { readPedals } from "../input/pedals.js";
import { recordAttempt } from "../engine/recorder.js";
import { STEP_MS } from "../engine/resample.js";
import { sampleTarget } from "../scenarios/target.js";

/** Visible past and future, in milliseconds. Their ratio matches the playhead. */
const PAST_MS = 3000;
const FUTURE_MS = 1500;
const PLAYHEAD = PAST_MS / (PAST_MS + FUTURE_MS);

const COUNTDOWN_FROM = 3;

const COLOURS = {
  brake: "#4ade80",
  throttle: "#38bdf8",
  brakeGuide: "#22c55e",
  throttleGuide: "#0ea5e9",
  brakeBand: "rgba(34,197,94,0.16)",
  throttleBand: "rgba(14,165,233,0.16)",
};

/**
 * @param {HTMLElement} root
 * @param {import("../scenarios/catalog.js").Scenario} scenario
 * @returns {() => void} Teardown.
 */
export function mountScenarioRun(root, scenario) {
  const target = scenario.target
    ? sampleTarget(scenario.target, scenario.durationMs)
    : null;
  const count = target ? target.brake.length : 0;

  /** Realized value per grid index; null until that instant has happened. */
  /** @type {(number | null)[]} */
  let liveBrake = new Array(count).fill(null);
  /** @type {(number | null)[]} */
  let liveThrottle = new Array(count).fill(null);

  /** @type {"idle" | "counting" | "running" | "review"} */
  let phase = "idle";
  let nowMs = 0;
  let countdown = COUNTDOWN_FROM;
  let disposed = false;

  const canvas = document.createElement("canvas");
  canvas.className = "run-canvas";
  canvas.width = 960;
  canvas.height = 300;

  const state = el("span", { class: "summary", text: "siga o guia" });
  const startButton = button("começar", { variant: "primary" });
  const reportHost = el("div");

  root.append(
    el("section", { class: "panel" }, [
      el("div", { class: "role-head" }, [
        el("strong", { text: scenario.name }),
        state,
        startButton,
      ]),
      canvas,
      reportHost,
    ]),
  );

  startButton.addEventListener("click", () => void start());

  /** @type {number[]} */
  let timers = [];
  let frame = 0;

  async function start() {
    if (phase === "counting" || phase === "running") return;
    reportHost.replaceChildren();
    liveBrake = new Array(count).fill(null);
    liveThrottle = new Array(count).fill(null);
    nowMs = 0;
    startButton.disabled = true;

    phase = "counting";
    countdown = COUNTDOWN_FROM;
    for (let i = 1; i <= COUNTDOWN_FROM; i++) {
      timers.push(setTimeout(() => {
        countdown = COUNTDOWN_FROM - i;
      }, i * 700));
    }
    await new Promise((resolve) => timers.push(setTimeout(resolve, COUNTDOWN_FROM * 700)));
    if (disposed) return;

    phase = "running";
    state.textContent = "vai";

    const attempt = await recordAttempt({
      durationMs: scenario.durationMs,
      onProgress: (elapsed) => {
        nowMs = elapsed;
        // Fill the grid as time passes so the realized line is drawn from the
        // same index space as the guide — no alignment guesswork at review.
        const index = Math.floor(elapsed / STEP_MS);
        if (index >= 0 && index < count) {
          const reading = readPedals();
          liveBrake[index] = reading.brake;
          liveThrottle[index] = reading.throttle;
        }
      },
    });

    if (disposed) return;
    phase = "review";
    nowMs = scenario.durationMs;
    startButton.disabled = false;
    startButton.textContent = "de novo";
    state.textContent = attempt.trustworthy ? "tentativa completa" : "tentativa suspeita";
    review(attempt);
  }

  /** @param {import("../engine/recorder.js").Attempt} attempt */
  function review(attempt) {
    if (!target) return;

    const analysis = compare(attempt.series.brake, target.brake, target.brakeTolerance);
    const throttleAnalysis = compare(
      attempt.series.throttle,
      target.throttle,
      target.throttleTolerance,
    );

    // Only report a channel the scenario actually asks something of; a channel
    // whose guide is flat zero would always score perfectly and dilute the
    // number that matters.
    const usesBrake = target.brake.some((v) => v > 0.05);
    const usesThrottle = target.throttle.some((v) => v > 0.05);

    /** @type {[string, string, string?][]} */
    const rows = [];
    if (usesBrake) {
      rows.push([
        "freio dentro da banda",
        `${(analysis.insideFraction * 100).toFixed(0)}% do tempo`,
        analysis.insideFraction > 0.8 ? "ok" : analysis.insideFraction > 0.5 ? "warn" : "bad",
      ]);
      rows.push(["erro do freio (RMS)", `${(analysis.rms * 100).toFixed(1)}% do curso`]);
    }
    if (usesThrottle) {
      rows.push([
        "acelerador dentro da banda",
        `${(throttleAnalysis.insideFraction * 100).toFixed(0)}% do tempo`,
        throttleAnalysis.insideFraction > 0.8
          ? "ok"
          : throttleAnalysis.insideFraction > 0.5 ? "warn" : "bad",
      ]);
      rows.push([
        "erro do acelerador (RMS)",
        `${(throttleAnalysis.rms * 100).toFixed(1)}% do curso`,
      ]);
    }
    if (attempt.warning) rows.push(["aviso", attempt.warning, "warn"]);

    reportHost.replaceChildren(table(rows));
    reportHost.append(
      el("p", {
        class: "tagline",
        text:
          "Ainda sem nota nem faltas marcadas na timeline — isto é fidelidade ao guia, que é a "
          + "primeira das métricas do escopo.",
      }),
    );
  }

  const ctx = canvas.getContext("2d");
  const tick = () => {
    draw();
    frame = requestAnimationFrame(tick);
  };

  function draw() {
    if (!ctx) return;
    const g = ctx;
    const { width, height } = canvas;
    const top = 16;
    const bottom = height - 22;
    const span = bottom - top;
    const playheadX = width * PLAYHEAD;
    const pxPerMs = playheadX / PAST_MS;

    g.clearRect(0, 0, width, height);
    g.fillStyle = "#0d0d0d";
    g.fillRect(playheadX, 0, width - playheadX, height);

    g.strokeStyle = "#1c1c1c";
    g.lineWidth = 1;
    for (const fraction of [0, 0.5, 1]) {
      const y = bottom - fraction * span;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(width, y);
      g.stroke();
    }

    /** @param {number} value */
    const toY = (value) => bottom - Math.min(1, Math.max(0, value)) * span;

    /** In review the whole attempt is fitted to the canvas instead of scrolling. */
    const reviewing = phase === "review";
    /** @param {number} index */
    const toX = (index) =>
      reviewing
        ? (index / Math.max(1, count - 1)) * width
        : playheadX + (index * STEP_MS - nowMs) * pxPerMs;

    if (target) {
      band(g, target.brake, target.brakeTolerance, COLOURS.brakeBand, toX, toY);
      band(g, target.throttle, target.throttleTolerance, COLOURS.throttleBand, toX, toY);
      guide(g, target.brake, COLOURS.brakeGuide, toX, toY);
      guide(g, target.throttle, COLOURS.throttleGuide, toX, toY);
    }

    realized(g, liveBrake, COLOURS.brake, toX, toY);
    realized(g, liveThrottle, COLOURS.throttle, toX, toY);

    if (!reviewing) {
      g.strokeStyle = "#f5f5f5";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(playheadX, 0);
      g.lineTo(playheadX, height);
      g.stroke();
    }

    if (phase === "counting") {
      g.fillStyle = "#e7e7e7";
      g.font = "600 64px ui-monospace, monospace";
      g.textAlign = "center";
      g.fillText(String(Math.max(1, countdown)), width / 2, height / 2 + 22);
      g.textAlign = "left";
    }

    g.fillStyle = "#5a5a5a";
    g.font = "11px ui-monospace, monospace";
    g.fillText("100%", 4, top + 10);
    g.fillText(reviewing ? "tentativa completa" : "agora", reviewing ? 4 : playheadX + 6, height - 6);
  }

  frame = requestAnimationFrame(tick);

  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    for (const timer of timers) clearTimeout(timer);
    timers = [];
    root.replaceChildren();
  };
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {readonly number[]} values
 * @param {readonly number[]} tolerance
 * @param {string} colour
 * @param {(index: number) => number} toX
 * @param {(value: number) => number} toY
 */
function band(g, values, tolerance, colour, toX, toY) {
  if (values.length < 2) return;
  g.fillStyle = colour;
  g.beginPath();
  for (let i = 0; i < values.length; i++) {
    g.lineTo(toX(i), toY((values[i] ?? 0) + (tolerance[i] ?? 0)));
  }
  for (let i = values.length - 1; i >= 0; i--) {
    g.lineTo(toX(i), toY((values[i] ?? 0) - (tolerance[i] ?? 0)));
  }
  g.closePath();
  g.fill();
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {readonly number[]} values
 * @param {string} colour
 * @param {(index: number) => number} toX
 * @param {(value: number) => number} toY
 */
function guide(g, values, colour, toX, toY) {
  if (values.length < 2) return;
  g.strokeStyle = colour;
  g.lineWidth = 1.5;
  g.setLineDash([5, 4]);
  g.beginPath();
  for (let i = 0; i < values.length; i++) {
    const x = toX(i);
    const y = toY(values[i] ?? 0);
    if (i === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.setLineDash([]);
}

/**
 * @param {CanvasRenderingContext2D} g
 * @param {readonly (number | null)[]} values
 * @param {string} colour
 * @param {(index: number) => number} toX
 * @param {(value: number) => number} toY
 */
function realized(g, values, colour, toX, toY) {
  g.strokeStyle = colour;
  g.lineWidth = 2.2;
  g.beginPath();
  let started = false;
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null || value === undefined) {
      started = false;
      continue;
    }
    const x = toX(i);
    const y = toY(value);
    if (started) g.lineTo(x, y);
    else g.moveTo(x, y);
    started = true;
  }
  g.stroke();
}

/**
 * Fidelity of a realized channel against its guide.
 *
 * @param {readonly number[]} realizedValues
 * @param {readonly number[]} targetValues
 * @param {readonly number[]} tolerance
 * @returns {{ rms: number, insideFraction: number }}
 */
export function compare(realizedValues, targetValues, tolerance) {
  const n = Math.min(realizedValues.length, targetValues.length);
  if (n === 0) return { rms: 0, insideFraction: 0 };

  let squared = 0;
  let inside = 0;
  for (let i = 0; i < n; i++) {
    const error = (realizedValues[i] ?? 0) - (targetValues[i] ?? 0);
    squared += error * error;
    if (Math.abs(error) <= (tolerance[i] ?? 0)) inside++;
  }
  return { rms: Math.sqrt(squared / n), insideFraction: inside / n };
}
