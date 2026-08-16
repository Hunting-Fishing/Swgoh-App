(() => {
  const nativeFetch = window.fetch.bind(window);
  const TTL = Object.freeze({
    player: 25_000,
    guild: 25_000,
    catalog: 300_000,
    operations: 60_000,
    error: 1_000,
  });
  const cache = new Map();
  const inflight = new Map();

  const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 9);

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
    const force = url.searchParams.get("refresh") === "1";

    const player = url.pathname.match(/^\/api\/player\/(\d{9})$/);
    if (player) {
      return {
        kind: "player",
        key: url.pathname,
        allyCode: player[1],
        ttlMs: TTL.player,
        force,
      };
    }

    const guildRoster = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})\/roster$/);
    if (guildRoster) {
      return {
        kind: "guild-roster",
        key: url.pathname,
        allyCode: guildRoster[1],
        ttlMs: TTL.guild,
        force,
      };
    }

    const guild = url.pathname.match(/^\/api\/guild\/by-player\/(\d{9})$/);
    if (guild) {
      return {
        kind: "guild",
        key: url.pathname,
        allyCode: guild[1],
        ttlMs: TTL.guild,
        force,
      };
    }

    if (url.pathname === "/data/catalog.json") {
      return {
        kind: "catalog",
        key: url.pathname,
        allyCode: "",
        ttlMs: TTL.catalog,
        force,
      };
    }

    if (url.pathname === "/api/rote/operations") {
      return {
        kind: "operations",
        key: url.pathname,
        allyCode: "",
        ttlMs: TTL.operations,
        force,
      };
    }

    return null;
  }

  function responseFrom(entry) {
    return new Response(entry.body, {
      status: entry.status,
      statusText: entry.statusText,
      headers: entry.headers,
    });
  }

  function publishSnapshot(info, text) {
    try {
      const body = JSON.parse(text);
      const fetchedAt = Date.now();
      if (info.kind === "player") {
        if (body?.source !== "live" || !body?.player || !Array.isArray(body?.units)) return;
        window.__swgohLiveSnapshot = {
          allyCode: info.allyCode,
          body,
          fetchedAt,
        };
        return;
      }
      if (info.kind === "guild-roster") {
        if (!Array.isArray(body?.members)) return;
        window.__swgohGuildRosterSnapshot = {
          allyCode: info.allyCode,
          body,
          fetchedAt,
        };
        return;
      }
      if (info.kind === "guild") {
        window.__swgohGuildSnapshot = {
          allyCode: info.allyCode,
          body,
          fetchedAt,
        };
        return;
      }
      if (info.kind === "catalog") {
        if (!Array.isArray(body?.units)) return;
        window.__swgohCatalogSnapshot = { body, fetchedAt };
        return;
      }
      if (info.kind === "operations") {
        if (!Array.isArray(body?.requirements)) return;
        window.__swgohRoteOperationsSnapshot = { body, fetchedAt };
      }
    } catch {
      // Leave malformed/non-JSON responses to the original consumer.
    }
  }

  function purgeExpired(now = Date.now()) {
    for (const [key, entry] of cache.entries()) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
  }

  function deleteMatching(predicate) {
    for (const key of [...cache.keys()]) {
      if (predicate(key)) cache.delete(key);
    }
  }

  window.fetch = async function sharedDataFetch(input, init = {}) {
    const info = requestInfo(input, init);
    if (!info) return nativeFetch(input, init);

    const now = Date.now();
    purgeExpired(now);
    if (info.force) cache.delete(info.key);
    const cached = info.force ? null : cache.get(info.key);
    if (cached && cached.expiresAt > now) return responseFrom(cached);

    if (!info.force && inflight.has(info.key)) {
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
        expiresAt: Date.now() + (response.ok ? info.ttlMs : TTL.error),
      };
      if (response.ok) {
        cache.set(info.key, entry);
        publishSnapshot(info, body);
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
      const code = digits(allyCode);
      if (code.length === 9) cache.delete(`/api/player/${code}`);
      else deleteMatching((key) => key.startsWith("/api/player/"));
    },
    ttlMs: TTL.player,
  };

  window.__swgohSharedFetchCache = {
    clear(kind = "", allyCode = "") {
      const code = digits(allyCode);
      if (!kind) {
        cache.clear();
        return;
      }
      if (kind === "player") {
        if (code.length === 9) cache.delete(`/api/player/${code}`);
        else deleteMatching((key) => key.startsWith("/api/player/"));
        return;
      }
      if (kind === "guild") {
        if (code.length === 9) {
          cache.delete(`/api/guild/by-player/${code}`);
          cache.delete(`/api/guild/by-player/${code}/roster`);
        } else {
          deleteMatching((key) => key.startsWith("/api/guild/by-player/"));
        }
        return;
      }
      if (kind === "catalog") {
        cache.delete("/data/catalog.json");
        return;
      }
      if (kind === "operations") cache.delete("/api/rote/operations");
    },
    stats() {
      purgeExpired();
      return {
        cached: cache.size,
        inflight: inflight.size,
        keys: [...cache.keys()],
        ttlMs: { ...TTL },
      };
    },
    ttlMs: { ...TTL },
  };
})();