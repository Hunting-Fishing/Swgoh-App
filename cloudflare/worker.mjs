import http from "node:http";
import { httpServerHandler } from "cloudflare:node";

const workerPort = 8080;
const originalListen = http.Server.prototype.listen;

// server.mjs is also used on Railway and currently supplies a host argument to
// server.listen(). Cloudflare's node:http server shim accepts a numeric port
// but not the Node host overload. Normalize that one call while loading the
// existing production server so the API implementation remains single-source.
http.Server.prototype.listen = function cloudflareCompatibleListen(...args) {
  const requestedPort = Number(args[0]);
  const port = Number.isFinite(requestedPort) && requestedPort > 0 ? requestedPort : workerPort;
  const callback = [...args].reverse().find((value) => typeof value === "function");
  return callback ? originalListen.call(this, port, callback) : originalListen.call(this, port);
};

try {
  await import("../server.mjs");
} finally {
  http.Server.prototype.listen = originalListen;
}

export default httpServerHandler({ port: workerPort });
