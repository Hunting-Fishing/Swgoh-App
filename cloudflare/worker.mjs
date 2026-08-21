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

  // Preserve the public Cloudflare host for the Railway app's same-origin auth
  // checks while the actual fetch target remains the Railway service domain.
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
  const responseHeaders = new Headers(response.headers);
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
