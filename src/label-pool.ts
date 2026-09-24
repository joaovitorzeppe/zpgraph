/** Reuse a label node across draws. Thresholds and span bands share this. */
export const pooledLabel = (
  pool: HTMLElement[],
  index: number,
  parent: HTMLElement,
  kind: string,
): HTMLElement => {
  let el = pool[index];
  if (!el) {
    el = document.createElement("div");
    el.dataset.zpLabel = kind;
    parent.appendChild(el);
    pool[index] = el;
  }
  return el;
};
