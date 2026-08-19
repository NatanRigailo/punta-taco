/**
 * The launch scenario.
 *
 * Five lights come on in sequence, then go out after a delay the driver cannot
 * predict. Release the brake when they do.
 *
 * The random delay is the whole mechanic: a fixed one would be memorised within
 * a handful of attempts and the scenario would stop measuring reaction and
 * start measuring rhythm — which the scope explicitly does not want.
 */

import { el, button, table } from "./dom.js";
import { readPedals } from "../input/pedals.js";
import { recordAttempt } from "../engine/recorder.js";
import { analyseLaunch, roundReaction } from "../engine/launch.js";

const LIGHT_COUNT = 5;
/** Interval between lights coming on. */
const LIGHT_STEP_MS = 600;
/** Range of the unpredictable hold after the last light. */
const HOLD_MIN_MS = 200;
const HOLD_MAX_MS = 3000;

/** Pedal positions required before the sequence starts. */
const ARM_BRAKE = 0.5;
const ARM_THROTTLE = 0.3;
/** How long the pedals must stay armed before the lights begin. */
const ARM_STABLE_MS = 500;

/**
 * @param {HTMLElement} root
 * @param {import("../scenarios/catalog.js").Scenario} scenario
 * @returns {() => void} Teardown.
 */
export function mountLaunchPanel(root, scenario) {
  const lights = el("div", { class: "lights" });
  /** @type {HTMLElement[]} */
  const bulbs = [];
  for (let i = 0; i < LIGHT_COUNT; i++) {
    const bulb = el("i", { class: "bulb" });
    bulbs.push(bulb);
    lights.append(bulb);
  }

  const state = el("p", { class: "launch-state", text: "acelerador embaixo, freio no fundo" });
  const startButton = button("armar", { variant: "primary" });
  const reportHost = el("div");

  const panel = el("section", { class: "panel" }, [
    el("div", { class: "role-head" }, [
      el("strong", { text: "Largada" }),
      el("span", { class: "summary", text: `${scenario.durationMs / 1000}s por tentativa` }),
      startButton,
    ]),
    lights,
    state,
    reportHost,
  ]);
  root.append(panel);

  /** @type {number[]} */
  let timers = [];
  let armFrame = 0;
  let running = false;
  let disposed = false;

  const clearTimers = () => {
    for (const timer of timers) clearTimeout(timer);
    timers = [];
  };

  /** @param {number} lit */
  const setLights = (lit) => {
    bulbs.forEach((bulb, i) => bulb.classList.toggle("on", i < lit));
  };

  startButton.addEventListener("click", () => {
    if (running) return;
    running = true;
    startButton.disabled = true;
    reportHost.replaceChildren();
    setLights(0);
    waitForArm();
  });

  /** Holds until both pedals sit in position long enough to count as ready. */
  function waitForArm() {
    let stableSince = 0;
    const check = () => {
      if (disposed) return;
      const reading = readPedals();
      const armed = reading.brake >= ARM_BRAKE && reading.throttle >= ARM_THROTTLE;
      const now = performance.now();

      if (!armed) {
        stableSince = 0;
        state.textContent = reading.brake < ARM_BRAKE
          ? "pise o freio até o fundo"
          : "mantenha o acelerador aplicado";
        armFrame = requestAnimationFrame(check);
        return;
      }

      if (stableSince === 0) stableSince = now;
      if (now - stableSince < ARM_STABLE_MS) {
        state.textContent = "segura assim…";
        armFrame = requestAnimationFrame(check);
        return;
      }

      void run();
    };
    armFrame = requestAnimationFrame(check);
  }

  async function run() {
    state.textContent = "atenção";

    /** @type {number | null} */
    let signalMs = null;
    const holdMs = HOLD_MIN_MS + Math.random() * (HOLD_MAX_MS - HOLD_MIN_MS);

    const attempt = await recordAttempt({
      durationMs: scenario.durationMs,
      onStart: (startedAt) => {
        // Scheduled against the recording's own origin, so the signal instant
        // and the sample timestamps are on one clock.
        for (let i = 1; i <= LIGHT_COUNT; i++) {
          timers.push(setTimeout(() => setLights(i), i * LIGHT_STEP_MS));
        }
        timers.push(
          setTimeout(() => {
            setLights(0);
            signalMs = performance.now() - startedAt;
            state.textContent = "vai!";
          }, LIGHT_COUNT * LIGHT_STEP_MS + holdMs),
        );
      },
    });

    clearTimers();
    setLights(0);
    running = false;
    startButton.disabled = false;
    startButton.textContent = "de novo";

    if (disposed) return;

    if (signalMs === null) {
      state.textContent = "a tentativa acabou antes do sinal — tente de novo";
      return;
    }

    render(analyseLaunch(attempt.samples, signalMs), attempt.cadence.medianMs);
  }

  /**
   * @param {import("../engine/launch.js").LaunchResult} result
   * @param {number} deviceGapMs
   */
  function render(result, deviceGapMs) {
    state.textContent = result.jumpStart
      ? "queimou a largada"
      : result.valid
        ? "tentativa válida"
        : (result.problem ?? "tentativa inválida");

    /** @type {[string, string, string?][]} */
    const rows = [];

    if (result.reactionMs !== null) {
      const rounded = roundReaction(Math.abs(result.reactionMs), deviceGapMs);
      rows.push([
        "reação",
        result.jumpStart
          ? `−${rounded} ms — soltou antes do sinal`
          : `${rounded} ms${result.anticipated ? " — abaixo do reflexo humano, foi antecipação" : ""}`,
        result.jumpStart || result.anticipated ? "bad" : rounded <= 250 ? "ok" : "warn",
      ]);
    }
    if (result.releaseMs !== null) {
      rows.push(["duração da soltura", `${Math.round(result.releaseMs)} ms`]);
    }
    rows.push([
      "acelerador na espera",
      `${(result.heldThrottle * 100).toFixed(0)}% · oscilou ${(result.throttleWobble * 100).toFixed(1)}%`,
      result.throttleWobble < 0.03 ? "ok" : "warn",
    ]);
    rows.push(["freio na espera", `${(result.heldBrake * 100).toFixed(0)}%`]);

    reportHost.replaceChildren(table(rows));
    reportHost.append(
      el("p", {
        class: "tagline",
        text: `Tempo em passos de ${Math.max(10, Math.round(deviceGapMs / 10) * 10)}ms — `
          + "é a granularidade que a sua pedaleira sustenta.",
      }),
    );
  }

  return () => {
    disposed = true;
    clearTimers();
    cancelAnimationFrame(armFrame);
    root.replaceChildren();
  };
}
