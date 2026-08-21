function clean(value) {
  return String(value ?? "").trim();
}

function railwayOrigin(env) {
  const value = clean(env.RAILWAY_APP_ORIGIN).replace(/\/+$/, "");
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}

function readSetCookies(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === "function") {
    return headers.getSetCookie();
  }
  if (typeof headers.getAll === "function") {
    try {
      return headers.getAll("Set-Cookie");
    } catch {
      // Fall through to the single-value path below.
    }
  }
  const single = headers.get?.("Set-Cookie");
  return single ? [single] : [];
}

function copyResponseHeaders(headers) {
  const output = new Headers();
  for (const [name, value] of headers) {
    if (name.toLowerCase() === "set-cookie") continue;
    output.append(name, value);
  }
  for (const value of readSetCookies(headers)) {
    output.append("Set-Cookie", value);
  }
  return output;
}

function clearBrowserSessionCookies(headers) {
  for (const name of ["swgoh_cc_access", "swgoh_cc_refresh", "swgoh_cc_oauth"]) {
    headers.append("Set-Cookie", `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  }
  return headers;
}

function hasOauthCookie(headers) {
  const cookieHeader = clean(headers?.get?.("cookie"));
  return /(?:^|;\s*)swgoh_cc_oauth=/.test(cookieHeader);
}

function rootOauthCallbackRequest(request, url) {
  if (request.method !== "GET" || url.pathname !== "/") return null;
  if (!hasOauthCookie(request.headers)) return null;
  if (!url.searchParams.has("code") && !url.searchParams.has("error")) return null;

  const callback = new URL("/api/auth/oauth/callback", url.origin);
  callback.search = url.search;
  return new Request(callback.href, {
    method: "GET",
    headers: request.headers,
    redirect: "manual",
  });
}

function isSameOriginSignout(request, url) {
  if (request.method !== "POST" || url.pathname !== "/api/auth/signout") return false;
  const origin = clean(request.headers.get("origin"));
  return !origin || origin === url.origin;
}

async function proxyApi(request, env) {
  const origin = railwayOrigin(env);
  if (!origin) {
    return Response.json(
      {
        error: "Cloudflare edge is not connected to the Railway SWGOH application origin.",
        code: "RAILWAY_APP_ORIGIN_REQUIRED",
      },
      { status: 503 },
    );
  }

  const incoming = new URL(request.url);
  const upstream = new URL(`${incoming.pathname}${incoming.search}`, origin);
  const headers = new Headers(request.headers);

  // Preserve the browser's Cookie header and the public Cloudflare host/protocol.
  // Railway uses these forwarded values for same-origin auth and callback URLs.
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  headers.set("x-swgoH-edge", "cloudflare");
  headers.delete("host");

  const upstreamRequest = new Request(upstream, {
    method: request.method,
    headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual",
  });

  const response = await fetch(upstreamRequest);

  // Set-Cookie cannot be folded like ordinary response headers. Preserve every
  // Railway cookie individually so OAuth state/session cookies survive the edge.
  const responseHeaders = copyResponseHeaders(response.headers);
  responseHeaders.set("x-swgoH-runtime", "railway");
  responseHeaders.set("x-swgoH-edge", "cloudflare");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}

async function signoutAtEdge(request, env) {
  try {
    const upstream = await proxyApi(request, env);
    const headers = clearBrowserSessionCookies(copyResponseHeaders(upstream.headers));
    headers.set("Cache-Control", "private, no-store");
    headers.set("x-swgoH-edge-signout", "cleared");
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers,
    });
  } catch {
    const headers = clearBrowserSessionCookies(new Headers({
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
      "x-swgoH-edge-signout": "cleared-upstream-unavailable",
    }));
    return new Response(JSON.stringify({ authenticated: false, upstreamRevocation: "unavailable" }), {
      status: 200,
      headers,
    });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Supabase can fall back to the configured Site URL and return the OAuth
    // authorization code at `/?code=...`. Complete that flow at the edge before
    // the SPA loads so the PKCE callback cannot race the frontend auth guard.
    const oauthCallbackRequest = rootOauthCallbackRequest(request, url);
    if (oauthCallbackRequest) {
      return proxyApi(oauthCallbackRequest, env);
    }

    // Browser logout must be locally authoritative. Railway/Supabase revocation
    // is still attempted, but the edge always expires every Command Center auth
    // cookie so a surviving refresh token cannot silently recreate the session.
    if (isSameOriginSignout(request, url)) {
      return signoutAtEdge(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return proxyApi(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

export {
  clearBrowserSessionCookies,
  copyResponseHeaders,
  hasOauthCookie,
  isSameOriginSignout,
  proxyApi,
  readSetCookies,
  rootOauthCallbackRequest,
  signoutAtEdge,
};
