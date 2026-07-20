const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1']):not([disabled])",
].join(",");

export function visibleFocusables(container) {
  if (!container?.querySelectorAll) return [];
  return [...container.querySelectorAll(FOCUSABLE_SELECTOR)].filter(isNavigable);
}

export function findDirectionalTarget(current, candidates, x, y) {
  if (!current || (!x && !y)) return null;
  const origin = centerOf(current);
  if (!origin) return null;

  let best = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    if (!candidate || candidate === current) continue;
    const point = centerOf(candidate);
    if (!point) continue;
    const deltaX = point.x - origin.x;
    const deltaY = point.y - origin.y;
    const primary = x ? deltaX * Math.sign(x) : deltaY * Math.sign(y);
    if (primary <= 1) continue;
    const cross = x ? Math.abs(deltaY) : Math.abs(deltaX);
    const offAxisPenalty = cross > primary * 1.35 ? cross * 3.5 : cross * 1.6;
    const score = primary + offAxisPenalty;
    if (score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function adjustFormControl(control, direction) {
  const sign = Math.sign(direction);
  if (!control || !sign) return false;
  const tag = String(control.tagName ?? "").toUpperCase();
  const type = String(control.type ?? "").toLowerCase();

  if (tag === "SELECT") {
    const optionCount = Number(control.options?.length ?? 0);
    if (!optionCount) return false;
    const current = Number.isInteger(control.selectedIndex) ? control.selectedIndex : 0;
    const next = clamp(current + sign, 0, optionCount - 1);
    if (next === current) return true;
    control.selectedIndex = next;
    dispatchControlEvent(control, "change");
    return true;
  }

  if (tag === "INPUT" && ["range", "number"].includes(type)) {
    const current = finiteNumber(control.value, 0);
    const step = positiveNumber(control.step, 1);
    const minimum = finiteNumber(control.min, Number.NEGATIVE_INFINITY);
    const maximum = finiteNumber(control.max, Number.POSITIVE_INFINITY);
    const next = clamp(current + step * sign, minimum, maximum);
    control.value = String(next);
    dispatchControlEvent(control, "input");
    return true;
  }

  return false;
}

export function markGamepadFocus(root, element) {
  root?.querySelectorAll?.("[data-gamepad-focus]").forEach((candidate) => {
    candidate.removeAttribute?.("data-gamepad-focus");
  });
  if (!element) return null;
  element.setAttribute?.("data-gamepad-focus", "true");
  element.focus?.({ preventScroll: true });
  element.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return element;
}

export function clearGamepadFocus(root) {
  markGamepadFocus(root, null);
}

function isNavigable(element) {
  if (element.hidden || element.disabled || element.getAttribute?.("aria-hidden") === "true") return false;
  if (element.closest?.("[hidden], [inert]")) return false;
  const rect = element.getBoundingClientRect?.();
  return Boolean(rect && rect.width > 0 && rect.height > 0);
}

function centerOf(element) {
  const rect = element.getBoundingClientRect?.();
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function dispatchControlEvent(control, type) {
  const EventConstructor = control.ownerDocument?.defaultView?.Event ?? globalThis.Event;
  if (typeof EventConstructor !== "function") return;
  control.dispatchEvent?.(new EventConstructor(type, { bubbles: true }));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
