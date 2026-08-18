/**
 * Hash router.
 *
 * The whole app is one static page served from disk, so the hash is the only
 * form of routing that works without a server rewriting paths — and it keeps
 * deep links working when this eventually goes back onto static hosting.
 *
 * Around thirty lines, and it removes any argument for pulling in a framework
 * just to switch views.
 */

/**
 * @typedef {object} Match
 * @property {string} pattern
 * @property {Record<string, string>} params
 */

/**
 * @typedef {object} Route
 * @property {string} pattern   e.g. "/rapidos/:id"
 * @property {(root: HTMLElement, params: Record<string, string>) => (() => void) | void} view
 */

/**
 * Exported for testing: it is the only part of the router that can be wrong in
 * a way that is not immediately visible on screen.
 *
 * @param {string} pattern
 * @param {string} path
 * @returns {Record<string, string> | null}
 */
export function matchPattern(pattern, path) {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  /** @type {Record<string, string>} */
  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i];
    const actual = pathParts[i];
    if (expected === undefined || actual === undefined) return null;
    if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return params;
}

/** @returns {string} */
export function currentPath() {
  const hash = location.hash.replace(/^#/, "");
  return hash === "" ? "/" : hash;
}

/**
 * @param {string} path
 */
export function navigate(path) {
  location.hash = path;
}

/**
 * @param {HTMLElement} root
 * @param {readonly Route[]} routes
 * @param {(root: HTMLElement) => void} notFound
 * @returns {() => void} Teardown.
 */
export function startRouter(root, routes, notFound) {
  /** @type {(() => void) | null} */
  let teardown = null;

  const render = () => {
    // Every view returns its own teardown; calling it before swapping is what
    // stops abandoned animation frames and timers from piling up.
    if (teardown) teardown();
    teardown = null;
    root.replaceChildren();
    scrollTo(0, 0);

    const path = currentPath();
    for (const route of routes) {
      const params = matchPattern(route.pattern, path);
      if (!params) continue;
      teardown = route.view(root, params) ?? null;
      return;
    }
    notFound(root);
  };

  addEventListener("hashchange", render);
  render();

  return () => {
    removeEventListener("hashchange", render);
    if (teardown) teardown();
  };
}
