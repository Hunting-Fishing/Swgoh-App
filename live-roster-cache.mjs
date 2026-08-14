function positiveMilliseconds(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export class LiveRosterCache {
  constructor(options = {}) {
    this.freshMs = positiveMilliseconds(options.freshMs, 90_000);
    this.staleMs = Math.max(this.freshMs, positiveMilliseconds(options.staleMs, 10 * 60_000));
    this.now = typeof options.now === "function" ? options.now : Date.now;
    this.entries = new Map();
    this.pending = new Map();
  }

  inspect(key) {
    const entry = this.entries.get(String(key));
    if (!entry) return { state: "miss", value: null };
    const age = this.now() - entry.storedAt;
    if (age <= this.freshMs) return { state: "fresh", value: entry.value, ageMs: age };
    if (age <= this.staleMs) return { state: "stale", value: entry.value, ageMs: age };
    this.entries.delete(String(key));
    return { state: "miss", value: null };
  }

  set(key, value) {
    this.entries.set(String(key), { value, storedAt: this.now() });
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
