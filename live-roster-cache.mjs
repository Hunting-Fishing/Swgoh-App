function positiveMilliseconds(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class LiveRosterCache {
  constructor(options = {}) {
    this.freshMs = positiveMilliseconds(options.freshMs, 90_000);
    this.staleMs = Math.max(this.freshMs, positiveMilliseconds(options.staleMs, 10 * 60_000));
    this.maxEntries = positiveInteger(options.maxEntries, 500);
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.entries = new Map();
    this.pending = new Map();
  }

  touch(key, entry) {
    const cacheKey = String(key);
    this.entries.delete(cacheKey);
    this.entries.set(cacheKey, entry);
  }

  inspect(key) {
    const cacheKey = String(key);
    const entry = this.entries.get(cacheKey);
    if (!entry) return { state: "miss", value: null };
    const age = this.now() - entry.storedAt;
    if (age > this.staleMs) {
      this.entries.delete(cacheKey);
      return { state: "miss", value: null };
    }

    this.touch(cacheKey, entry);
    if (age <= this.freshMs) return { state: "fresh", value: entry.value, ageMs: age };
    return { state: "stale", value: entry.value, ageMs: age };
  }

  prune() {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  set(key, value) {
    const cacheKey = String(key);
    this.entries.delete(cacheKey);
    this.entries.set(cacheKey, { value, storedAt: this.now() });
    this.prune();
    return value;
  }

  async refresh(key, loader) {
    const cacheKey = String(key);
    if (this.pending.has(cacheKey)) return this.pending.get(cacheKey);

    const promise = Promise.resolve()
      .then(loader)
      .then((value) => this.set(cacheKey, value))
      .finally(() => this.pending.delete(cacheKey));
    this.pending.set(cacheKey, promise);
    return promise;
  }

  async getOrLoad(key, loader, options = {}) {
    const current = this.inspect(key);
    if (current.state === "fresh") {
      return { value: current.value, cache: "fresh", ageMs: current.ageMs || 0 };
    }

    if (current.state === "stale" && options.staleWhileRevalidate !== false) {
      this.refresh(key, loader).catch(() => {});
      return { value: current.value, cache: "stale", ageMs: current.ageMs || 0 };
    }

    const value = await this.refresh(key, loader);
    return { value, cache: current.state === "stale" ? "refreshed" : "miss", ageMs: 0 };
  }

  delete(key) {
    this.entries.delete(String(key));
  }

  clear() {
    this.entries.clear();
  }
}
