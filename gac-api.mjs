function writeError(writeJson, response, error, fallback) {
  const status = [400, 401, 404, 429, 503].includes(error?.status) ? error.status : 502;
  writeJson(response, status, {
    error: error?.name === "AbortError" ? "The live GAC request timed out." : error?.message || fallback,
  });
}

export function createGacApi({ requestGateway, writeJson }) {
  if (typeof requestGateway !== "function") throw new TypeError("requestGateway is required");
  if (typeof writeJson !== "function") throw new TypeError("writeJson is required");

  return Object.freeze({
    async handle(request, response, url) {
      if (request.method !== "GET") return false;

      if (url.pathname === "/api/gac/current-event") {
        try {
          const body = await requestGateway("/v1/gac/current-event", true);
          writeJson(response, 200, body, { "X-GAC-Source": body?.source || "comlink-live" });
        } catch (error) {
          writeError(writeJson, response, error, "The current GAC event is unavailable.");
        }
        return true;
      }

      const playerMatch = url.pathname.match(/^\/api\/gac\/player\/(\d{9})$/);
      if (playerMatch) {
        try {
          const body = await requestGateway(`/v1/gac/player/${playerMatch[1]}`, true);
          writeJson(response, 200, body, { "X-GAC-Source": body?.source || "comlink-live" });
        } catch (error) {
          writeError(writeJson, response, error, "The player GAC context is unavailable.");
        }
        return true;
      }

      const bracketMatch = url.pathname.match(/^\/api\/gac\/bracket\/(KYBER|AURODIUM|CHROMIUM|BRONZIUM|CARBONITE)\/(\d+)$/i);
      if (bracketMatch) {
        const league = bracketMatch[1].toUpperCase();
        const bracketIndex = Number(bracketMatch[2]);
        try {
          const body = await requestGateway(`/v1/gac/bracket/${league}/${bracketIndex}`, true);
          writeJson(response, 200, body, { "X-GAC-Source": body?.source || "comlink-live" });
        } catch (error) {
          writeError(writeJson, response, error, "The requested GAC bracket is unavailable.");
        }
        return true;
      }

      return false;
    },
  });
}
