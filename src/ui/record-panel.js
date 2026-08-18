/**
 * Records one attempt and reports what the engine actually produced.
 *
 * This exists to make #10 verifiable by hand: the acceptance criteria are about
 * counts, steps and gaps, which are invisible until something prints them. The
 * real training UI replaces it later.
 */

import { readPedals } from "../input/pedals.js";
import { recordAttempt } from "../engine/recorder.js";
import { STEP_MS } from "../engine/resample.js";

const DURATION_MS = 8000;

/**
 * @param {HTMLElement} root
 * @returns {() => void} Teardown.
 */
export function mountRecordPanel(root) {
  const startButton = document.createElement("button");
  startButton.type = "button";
  startButton.textContent = `gravar ${DURATION_MS / 1000}s`;

  const state = document.createElement("span");
  state.className = "summary";

  const report = document.createElement("table");
  report.className = "report";

  const canvas = document.createElement("canvas");
  canvas.width = 880;
  canvas.height = 120;
  canvas.className = "attempt-trace";
  canvas.hidden = true;

  const head = document.createElement("div");
  head.className = "role-head";
  const title = document.createElement("strong");
  title.textContent = "Tentativa";
  head.append(title, state, startButton);

  root.append(head, report, canvas);

  let running = false;

  const refreshReadiness = () => {
    if (running) return;
    const ready = readPedals().ready;
    startButton.disabled = !ready;
    if (!ready && report.rows.length === 0) {
      state.textContent = "mapeie e calibre os dois pedais primeiro";
    }
  };

  const readinessTimer = setInterval(refreshReadiness, 250);
  refreshReadiness();

  startButton.addEventListener("click", () => void run());

  async function run() {
    running = true;
    startButton.disabled = true;
    report.replaceChildren();
    canvas.hidden = true;

    const attempt = await recordAttempt({
      durationMs: DURATION_MS,
      onProgress: (elapsed) => {
        state.textContent = `gravando — ${((DURATION_MS - elapsed) / 1000).toFixed(1)}s`;
      },
    });

    running = false;
    state.textContent = attempt.trustworthy ? "tentativa gravada" : "tentativa suspeita";

    const expected = Math.round(DURATION_MS / STEP_MS);
    const peakBrake = Math.max(0, ...attempt.series.brake);
    const peakThrottle = Math.max(0, ...attempt.series.throttle);

    /** @type {[string, string, string?][]} */
    const rows = [
      ["amostras cruas do dispositivo", String(attempt.cadence.count)],
      [
        "cadência do dispositivo",
        `mediana ${attempt.cadence.medianMs.toFixed(1)}ms · máx ${attempt.cadence.maxMs.toFixed(1)}ms`,
      ],
      [
        "série reamostrada",
        `${attempt.series.brake.length} pontos no passo de ${attempt.series.stepMs}ms`,
        attempt.series.brake.length === expected ? "ok" : "bad",
      ],
      ["pico do freio", `${(peakBrake * 100).toFixed(1)}%`],
      ["pico do acelerador", `${(peakThrottle * 100).toFixed(1)}%`],
    ];
    if (attempt.warning) rows.push(["aviso", attempt.warning, "warn"]);

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

    draw(attempt.series.brake, attempt.series.throttle);
    refreshReadiness();
  }

  /**
   * @param {readonly number[]} brake
   * @param {readonly number[]} throttle
   */
  function draw(brake, throttle) {
    const ctx = canvas.getContext("2d");
    if (!ctx || brake.length === 0) return;
    canvas.hidden = false;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = "#222";
    ctx.beginPath();
    ctx.moveTo(0, height - 4);
    ctx.lineTo(width, height - 4);
    ctx.stroke();

    /**
     * @param {readonly number[]} series
     * @param {string} colour
     */
    const plot = (series, colour) => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < series.length; i++) {
        const value = series[i] ?? 0;
        const x = (i / (series.length - 1 || 1)) * width;
        const y = height - 4 - value * (height - 8);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };

    plot(throttle, "#38bdf8");
    plot(brake, "#4ade80");
  }

  return () => {
    clearInterval(readinessTimer);
    root.replaceChildren();
  };
}
