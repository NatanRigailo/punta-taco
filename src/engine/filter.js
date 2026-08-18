/**
 * Savitzky-Golay smoothing and derivatives.
 *
 * Jerk is the second derivative of pedal position, and differentiating twice
 * amplifies quantisation noise brutally: the PXN VD4 measured 8.66 bits, which
 * means the raw signal is a staircase, and the second difference of a staircase
 * is a spike train. Filtering before differentiating is not a refinement here,
 * it is the difference between a metric and noise.
 *
 * Savitzky-Golay rather than a moving average because it fits a low-order
 * polynomial over the window and reads the derivative off that fit. A moving
 * average would flatten the very peaks the drills are about.
 *
 * Everything is computed from first principles — no dependency. The maths is a
 * least-squares fit over a handful of points, and owning it is cheaper than
 * trusting a package with it.
 */

/** Polynomial order used throughout. Cubic keeps peaks that quadratic rounds off. */
export const POLY_ORDER = 3;

/**
 * Window search bounds, in half-widths (window = 2 * halfWidth + 1).
 *
 * The upper bound is set by signal fidelity, not by noise. Measured against a
 * minimum-jerk pedal application over 250ms — the profile human limb movement
 * actually follows — the reconstruction error of the second derivative grows
 * monotonically with the window and turns bad abruptly:
 *
 *     5 points (100ms)   peak error  -9%    rmse  6.3
 *     7 points (140ms)   peak error  -5%    rmse 12.1
 *     9 points (180ms)   peak error +37%    rmse 18.1
 *    11 points (220ms)   peak error +66%    rmse 22.5
 *
 * Past 140ms the window is a sizeable fraction of the event being measured, and
 * the cubic fit stops describing it. A wider window would keep lowering the
 * noise figure while quietly destroying the signal — which is worse than noise,
 * because it still produces a confident-looking number.
 */
const MIN_HALF_WIDTH = 2; // 5 points, 100ms at the 20ms step
const MAX_HALF_WIDTH = 3; // 7 points, 140ms

/**
 * Reference jerk for a real braking application, in travel/s². Derived from a
 * threshold brake reaching 95% in ~200ms; used only as the scale the noise
 * floor is judged against.
 */
export const REFERENCE_JERK = 60;

/** Noise floor accepted for jerk, as a fraction of REFERENCE_JERK. */
const NOISE_BUDGET = 0.1;

/**
 * Inverts a small square matrix by Gauss-Jordan elimination with partial
 * pivoting. Sizes here are (POLY_ORDER + 1)², so clarity beats sophistication.
 *
 * @param {number[][]} matrix
 * @returns {number[][]}
 */
function invert(matrix) {
  const n = matrix.length;
  /** @type {number[][]} */
  const a = matrix.map((row, i) => {
    const identity = new Array(n).fill(0);
    identity[i] = 1;
    return [...row, ...identity];
  });

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      const candidate = a[row]?.[col] ?? 0;
      const best = a[pivot]?.[col] ?? 0;
      if (Math.abs(candidate) > Math.abs(best)) pivot = row;
    }

    const pivotRow = a[pivot];
    const currentRow = a[col];
    if (!pivotRow || !currentRow) throw new Error("matriz malformada");
    if (pivot !== col) {
      a[pivot] = currentRow;
      a[col] = pivotRow;
    }

    const row = a[col];
    if (!row) throw new Error("matriz malformada");
    const diagonal = row[col] ?? 0;
    if (diagonal === 0) throw new Error("matriz singular no ajuste polinomial");

    for (let k = 0; k < 2 * n; k++) row[k] = (row[k] ?? 0) / diagonal;

    for (let other = 0; other < n; other++) {
      if (other === col) continue;
      const target = a[other];
      if (!target) continue;
      const factor = target[col] ?? 0;
      if (factor === 0) continue;
      for (let k = 0; k < 2 * n; k++) {
        target[k] = (target[k] ?? 0) - factor * (row[k] ?? 0);
      }
    }
  }

  return a.map((row) => row.slice(n));
}

/**
 * Convolution coefficients for one Savitzky-Golay output point.
 *
 * `evalAt` is where inside the window the result is wanted, in samples from the
 * centre. It is zero everywhere except near the ends of a series, where a
 * centred window does not exist: instead of mirroring or padding — both of
 * which invent data — the same fitted polynomial is simply evaluated off-centre.
 *
 * The returned coefficients are in units of samples^-derivative; the caller
 * divides by the step in seconds raised to the same power.
 *
 * @param {number} halfWidth
 * @param {number} polyOrder
 * @param {number} derivative
 * @param {number} [evalAt]
 * @returns {number[]}
 */
export function savitzkyGolayCoefficients(halfWidth, polyOrder, derivative, evalAt = 0) {
  if (halfWidth < 1) throw new Error("halfWidth deve ser pelo menos 1");
  if (polyOrder < derivative) throw new Error("ordem do polinômio menor que a derivada pedida");
  if (2 * halfWidth + 1 <= polyOrder) {
    throw new Error("janela pequena demais para a ordem do polinômio");
  }

  const size = polyOrder + 1;
  /** @type {number[]} */
  const offsets = [];
  for (let z = -halfWidth; z <= halfWidth; z++) offsets.push(z);

  // Normal equations of the least-squares fit: M[j][k] = sum z^(j+k).
  /** @type {number[][]} */
  const normal = [];
  for (let j = 0; j < size; j++) {
    /** @type {number[]} */
    const row = [];
    for (let k = 0; k < size; k++) {
      let sum = 0;
      for (const z of offsets) sum += z ** (j + k);
      row.push(sum);
    }
    normal.push(row);
  }
  const inverse = invert(normal);

  // Weight of each polynomial term in the requested derivative, evaluated at
  // `evalAt`: d/dz^d of z^j is j!/(j-d)! * z^(j-d).
  /** @type {number[]} */
  const termWeights = new Array(size).fill(0);
  for (let j = derivative; j < size; j++) {
    let falling = 1;
    for (let step = 0; step < derivative; step++) falling *= j - step;
    termWeights[j] = falling * evalAt ** (j - derivative);
  }

  return offsets.map((z) => {
    let coefficient = 0;
    for (let j = 0; j < size; j++) {
      const weight = termWeights[j] ?? 0;
      if (weight === 0) continue;
      const inverseRow = inverse[j];
      if (!inverseRow) continue;
      let projected = 0;
      for (let k = 0; k < size; k++) projected += (inverseRow[k] ?? 0) * z ** k;
      coefficient += weight * projected;
    }
    return coefficient;
  });
}

/**
 * @typedef {object} FilterOptions
 * @property {number} halfWidth
 * @property {number} stepMs
 * @property {number} [polyOrder]
 * @property {number} [derivative]  0 smooths, 1 and 2 differentiate.
 */

/**
 * Applies the filter across a whole series, including the ends.
 *
 * @param {readonly number[]} series
 * @param {FilterOptions} options
 * @returns {number[]}
 */
export function filterSeries(series, options) {
  const polyOrder = options.polyOrder ?? POLY_ORDER;
  const derivative = options.derivative ?? 0;
  const stepSeconds = options.stepMs / 1000;
  const n = series.length;
  if (n === 0) return [];

  // A window wider than the series itself cannot be fitted; shrinking is the
  // honest response, and it only happens on very short inputs.
  let halfWidth = options.halfWidth;
  while (2 * halfWidth + 1 > n && halfWidth > 1) halfWidth--;
  const width = 2 * halfWidth + 1;
  if (width > n || width <= polyOrder) {
    throw new Error("série curta demais para filtrar com esta janela");
  }

  const scale = stepSeconds ** derivative;
  /** @type {Map<number, number[]>} */
  const cache = new Map();

  /** @param {number} evalAt */
  const coefficientsFor = (evalAt) => {
    const cached = cache.get(evalAt);
    if (cached) return cached;
    const computed = savitzkyGolayCoefficients(halfWidth, polyOrder, derivative, evalAt);
    cache.set(evalAt, computed);
    return computed;
  };

  /** @type {number[]} */
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let start = i - halfWidth;
    if (start < 0) start = 0;
    if (start + width > n) start = n - width;
    const coefficients = coefficientsFor(i - (start + halfWidth));

    let sum = 0;
    for (let k = 0; k < width; k++) sum += (coefficients[k] ?? 0) * (series[start + k] ?? 0);
    out[i] = sum / scale;
  }

  return out;
}

/**
 * How much white input noise the filter passes through, as a multiplier on the
 * input standard deviation. For uncorrelated noise the gain is the L2 norm of
 * the coefficients.
 *
 * @param {readonly number[]} coefficients
 * @returns {number}
 */
export function noiseGain(coefficients) {
  let sum = 0;
  for (const c of coefficients) sum += c * c;
  return Math.sqrt(sum);
}

/**
 * @typedef {object} WindowChoice
 * @property {number} halfWidth
 * @property {number} windowPoints
 * @property {number} jerkNoise      Estimated noise floor, travel/s².
 * @property {boolean} withinBudget  False when even the widest window is not enough.
 */

/**
 * Picks the narrowest window whose jerk noise floor fits the budget.
 *
 * This is the rule that came out of measuring real hardware: the floor scales
 * with `quantisation step / dt²`, so a coarse device needs a wider window, and
 * hard-coding one number would either waste resolution on good hardware or lie
 * on bad hardware. Narrowest-that-works is the right end to search from —
 * every extra point smooths away real pedal movement too.
 *
 * @param {{ stepFraction: number, stepMs: number, polyOrder?: number }} hardware
 *   `stepFraction` is the quantisation step as a fraction of full travel.
 * @returns {WindowChoice}
 */
export function chooseWindow(hardware) {
  const polyOrder = hardware.polyOrder ?? POLY_ORDER;
  const stepSeconds = hardware.stepMs / 1000;
  // Uniform quantisation error has standard deviation step/sqrt(12).
  const inputNoise = hardware.stepFraction / Math.sqrt(12);
  const budget = REFERENCE_JERK * NOISE_BUDGET;

  /** @type {WindowChoice | null} */
  let widest = null;

  for (let halfWidth = MIN_HALF_WIDTH; halfWidth <= MAX_HALF_WIDTH; halfWidth++) {
    const coefficients = savitzkyGolayCoefficients(halfWidth, polyOrder, 2);
    const jerkNoise = (inputNoise * noiseGain(coefficients)) / stepSeconds ** 2;
    const choice = {
      halfWidth,
      windowPoints: 2 * halfWidth + 1,
      jerkNoise,
      withinBudget: jerkNoise <= budget,
    };
    if (choice.withinBudget) return choice;
    widest = choice;
  }

  // Nothing fitted within the fidelity cap. Report the widest tried, flagged,
  // so the diagnostic can say jerk is not publishable on this hardware instead
  // of quietly printing a number nobody should trust. Widening further is not
  // an option: it would trade a noisy metric for a distorted one.
  return widest ?? {
    halfWidth: MAX_HALF_WIDTH,
    windowPoints: 2 * MAX_HALF_WIDTH + 1,
    jerkNoise: Number.POSITIVE_INFINITY,
    withinBudget: false,
  };
}
