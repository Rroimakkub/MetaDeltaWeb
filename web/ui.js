// Helpers shared by the site's pages.

export const formatNumber = (value) => new Intl.NumberFormat('en-US').format(Math.round(value));

// Builds elements with textContent only, so names from the API are never parsed as HTML.
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function fact(label, value) {
  const box = el('div');
  box.append(el('span', null, label), el('b', null, value));
  return box;
}
