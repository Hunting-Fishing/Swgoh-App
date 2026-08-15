(() => {
  const nativeFetch = window.fetch.bind(window);
  const TTL_MS = 25_000;
  const cache = new Map();
  const inflight = new Map();

  function requestInfo(input, init = {}) {
    const method = String(init?.method || (input instanceof Request ? input.method : "GET") || "GET").toUpperCase();
    if (method !== "GET") return null;
    let url;
    try {
      url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    } catch {
      return null;
    }
    if (url.origin !== window.location.origin) return null;
    const match = url.pathname.match(/^\/api\/player\/(\d{9})$/);
    return match ? { key: url.pathname, allyCode: match[1] } : null;
  }

  function responseFrom(entry) {
    return new Response(entry.body, {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.headers,
    });
  }

  function publishSnapshot(allyCode, text) {
    try {
      const body = JSON.parse(text);
      if (body?.source !== "live" || !body?.player || !Array.isArray(body?.units)) return;
      window.__swgohLiveSnapshot = {
        allyCode,
        body,
        fetchedAt: Date.now(),
      };
    } catch {
      // Leave malformed/non-JSON responses to the original consumer.
    }
  }

  function purgeExpired(now = Date.now()) {
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
  }

  window.fetch = async function sharedRosterFetch(input, init = {}) {
    const info = requestInfo(input, init);
    if (!info) return nativeFetch(input, init);

    const now = Date.now();
    purgeExpired(now);
    const cached = cache.get(info.key);
    if (cached && cached.expiresAt > now) return responseFrom(cached);

    if (inflight.has(info.key)) {
      const entry = await inflight.get(info.key);
      return responseFrom(entry);
    }

    const requestPromise = nativeFetch(input, init).then(async (response) => {
      const body = await response.clone().text();
      const entry = {
        body,
        status: response.status,
        statusText: response.statusText,
        headers: [...response.headers.entries()],
        expiresAt: Date.now() + (response.ok ? TTL_MS : 1_000),
      };
      if (response.ok) {
        cache.set(info.key, entry);
        publishSnapshot(info.allyCode, body);
      }
      return entry;
    }).finally(() => {
      inflight.delete(info.key);
    });

    inflight.set(info.key, requestPromise);
    const entry = await requestPromise;
    return responseFrom(entry);
  };

  window.__swgohRosterFetchCache = {
    clear(allyCode = "") {
      const digits = String(allyCode || "").replace(/\D/g, "").slice(0, 9);
      if (digits.length === 9) cache.delete(`/api/player/${digits}`);
      else cache.clear();
    },
    ttlMs: TTL_MS,
  };
})();
