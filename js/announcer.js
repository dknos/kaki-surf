export const ANNOUNCEMENT_DWELL_MS = 1250;
export const ANNOUNCEMENT_GAP_MS = 90;
export const ANNOUNCEMENT_QUEUE_LIMIT = 5;

export class PoliteAnnouncer {
  constructor(element, {
    schedule = globalThis.setTimeout?.bind(globalThis),
    cancel = globalThis.clearTimeout?.bind(globalThis),
    dwellMs = ANNOUNCEMENT_DWELL_MS,
    gapMs = ANNOUNCEMENT_GAP_MS,
    queueLimit = ANNOUNCEMENT_QUEUE_LIMIT,
  } = {}) {
    this.element = element;
    this.schedule = schedule;
    this.cancel = cancel;
    this.dwellMs = dwellMs;
    this.gapMs = gapMs;
    this.queueLimit = queueLimit;
    this.queue = [];
    this.active = null;
    this.timer = null;
    this.destroyed = false;
  }

  announce(message, { urgent = false } = {}) {
    const text = String(message ?? "").trim();
    if (!text || this.destroyed || !this.element) return false;
    if (this.active?.text === text || this.queue.some((item) => item.text === text)) return false;

    const item = { text, urgent: Boolean(urgent) };
    if (item.urgent) this.queue.unshift(item);
    else this.queue.push(item);
    if (this.queue.length > this.queueLimit) {
      let removable = -1;
      for (let index = this.queue.length - 1; index >= 0; index -= 1) {
        if (!this.queue[index].urgent) {
          removable = index;
          break;
        }
      }
      this.queue.splice(removable >= 0 ? removable : this.queue.length - 1, 1);
    }
    this.presentNext();
    return true;
  }

  presentNext() {
    if (this.destroyed || this.active || !this.queue.length) return;
    this.active = this.queue.shift();
    this.element.textContent = "";
    this.timer = this.schedule?.(() => {
      this.timer = null;
      if (this.destroyed || !this.active) return;
      this.element.textContent = this.active.text;
      this.timer = this.schedule?.(() => this.finishActive(), this.dwellMs) ?? null;
    }, 0) ?? null;
  }

  finishActive() {
    this.timer = null;
    if (this.destroyed) return;
    this.element.textContent = "";
    this.active = null;
    this.timer = this.schedule?.(() => {
      this.timer = null;
      this.presentNext();
    }, this.gapMs) ?? null;
  }

  clear() {
    if (this.timer !== null) this.cancel?.(this.timer);
    this.timer = null;
    this.queue.length = 0;
    this.active = null;
    if (this.element) this.element.textContent = "";
  }

  destroy() {
    this.destroyed = true;
    this.clear();
    this.element = null;
  }
}
