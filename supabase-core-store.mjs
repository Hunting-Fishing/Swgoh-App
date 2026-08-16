function clean(value) {
  return String(value || "").trim();
}

function trimUrl(value) {
  return clean(value).replace(/\/+$/, "");
}

function configFromEnv(env = process.env) {
  const url = trimUrl(env.SUPABASE_URL);
  const serviceRoleKey = clean(env.SUPABASE_SERVICE_ROLE_KEY);
  return Object.freeze({
    url,
    serviceRoleKey,
    enabled: Boolean(url && serviceRoleKey),
  });
}

function normalizeTable(value) {
  const table = clean(value);
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(table)) throw new Error("Invalid Supabase table name.");
  return table;
}

function encodeQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

export function createSupabaseCoreStore(env = process.env, options = {}) {
  const config = configFromEnv(env);
  const fetchImpl = options.fetch || fetch;

  function status() {
    return Object.freeze({
      configured: config.enabled,
      mode: config.enabled ? "supabase-rest-service-role" : "disabled",
      urlConfigured: Boolean(config.url),
      serviceRoleConfigured: Boolean(config.serviceRoleKey),
    });
  }

  function requireConfigured() {
    if (config.enabled) return;
    const error = new Error("Supabase persistence is not configured.");
    error.code = "SUPABASE_NOT_CONFIGURED";
    throw error;
  }

  async function request(table, { method = "GET", query = {}, body, prefer = "" } = {}) {
    requireConfigured();
    const normalizedTable = normalizeTable(table);
    const response = await fetchImpl(`${config.url}/rest/v1/${normalizedTable}${encodeQuery(query)}`, {
      method,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        ...(prefer ? { Prefer: prefer } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "error",
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = text;
      }
    }

    if (!response.ok) {
      const error = new Error(payload?.message || payload?.error || `Supabase returned HTTP ${response.status}.`);
      error.status = response.status;
      error.details = payload;
      throw error;
    }
    return payload;
  }

  return Object.freeze({
    status,
    select(table, query = {}) {
      return request(table, { query });
    },
    insert(table, rows, { returning = true } = {}) {
      return request(table, {
        method: "POST",
        body: rows,
        prefer: returning ? "return=representation" : "return=minimal",
      });
    },
    upsert(table, rows, { onConflict = "", returning = true } = {}) {
      return request(table, {
        method: "POST",
        query: onConflict ? { on_conflict: onConflict } : {},
        body: rows,
        prefer: `${returning ? "return=representation" : "return=minimal"},resolution=merge-duplicates`,
      });
    },
    update(table, query, values, { returning = true } = {}) {
      return request(table, {
        method: "PATCH",
        query,
        body: values,
        prefer: returning ? "return=representation" : "return=minimal",
      });
    },
    delete(table, query, { returning = false } = {}) {
      return request(table, {
        method: "DELETE",
        query,
        prefer: returning ? "return=representation" : "return=minimal",
      });
    },
  });
}

export const supabaseCoreStore = createSupabaseCoreStore(process.env);
