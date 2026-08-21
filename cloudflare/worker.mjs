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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      return proxyApi(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

export { copyResponseHeaders, proxyApi, readSetCookies };
