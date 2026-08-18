/**
 * Tiny DOM helpers shared by the views.
 *
 * Exists so view code reads as structure rather than as a sequence of
 * `createElement` calls. Text always goes through `textContent`, never
 * `innerHTML`, so nothing here can turn a string into markup.
 */

/**
 * @param {string} tag
 * @param {{ class?: string, text?: string, href?: string, title?: string }} [attrs]
 * @param {(Node | string)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  if (attrs.class) node.className = attrs.class;
  if (attrs.text !== undefined) node.textContent = attrs.text;
  if (attrs.title !== undefined) node.title = attrs.title;
  if (attrs.href !== undefined && node instanceof HTMLAnchorElement) node.href = attrs.href;
  for (const child of children) node.append(child);
  return node;
}

/**
 * @param {string} text
 * @param {{ variant?: "primary" | "ghost" }} [options]
 * @returns {HTMLButtonElement}
 */
export function button(text, options = {}) {
  const node = document.createElement("button");
  node.type = "button";
  node.textContent = text;
  if (options.variant) node.classList.add(options.variant);
  return node;
}

/**
 * @param {[string, string, string?][]} rows
 * @returns {HTMLTableElement}
 */
export function table(rows) {
  const node = document.createElement("table");
  node.className = "report";
  for (const [label, value, cls] of rows) {
    const tr = document.createElement("tr");
    const th = document.createElement("td");
    th.textContent = label;
    const td = document.createElement("td");
    td.textContent = value;
    if (cls) td.className = cls;
    tr.append(th, td);
    node.append(tr);
  }
  return node;
}
