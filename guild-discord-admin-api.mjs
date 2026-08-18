import { guildDiscordAdminService } from './guild-discord-admin-service.mjs';
import { guildIntegrationReportService } from './guild-integration-report-service.mjs';
import { supabaseAuthSession } from './supabase-auth-session.mjs';

const text = (value) => String(value ?? '').trim();
function httpError(message, status, code) { const error = new Error(message); error.status = status; error.code = code; return error; }
function sameOrigin(request) {
  const origin = text(request?.headers?.origin); if (!origin) return true;
  const host = text(request?.headers?.['x-forwarded-host'] || request?.headers?.host);
  const proto = text(text(request?.headers?.['x-forwarded-proto']).split(',')[0]) || 'https';
  return Boolean(host && origin === `${proto}://${host}`);
}
async function readBody(request) {
  const chunks = []; let size = 0;
  for await (const chunk of request) { size += chunk.length; if (size > 64 * 1024) throw httpError('Discord admin request body is too large.', 413, 'BODY_TOO_LARGE'); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError('Discord admin request body must be valid JSON.', 400, 'INVALID_JSON'); }
}
function writeJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(JSON.stringify(body));
}

export function createGuildDiscordAdminApi(options = {}) {
  const session = options.session || supabaseAuthSession;
  const service = options.service || guildDiscordAdminService;
  const integration = options.integration || guildIntegrationReportService;
  async function handle(request, response, url) {
    if (!url.pathname.startsWith('/api/account/guild-discord-admin/')) return false;
    try {
      const user = await session.currentUser(request);
      if (!user?.id) throw httpError('A signed-in Command Center session is required.', 401, 'AUTH_REQUIRED');
      const match = url.pathname.match(/^\/api\/account\/guild-discord-admin\/(\d{9})(?:\/(status|integration-report|verify-channel|unverify-channel|match-guildmates))?$/);
      if (!match) throw httpError('A valid Guild lookup Ally Code is required.', 400, 'INVALID_ALLY_CODE');
      const code = match[1]; const action = match[2] || 'status';
      if (request.method === 'GET' && action === 'status') { writeJson(response, 200, await service.status(user.id, code)); return true; }
      if (request.method === 'GET' && action === 'integration-report') { writeJson(response, 200, await integration.report(user.id, code)); return true; }
      if (!sameOrigin(request)) throw httpError('Cross-origin Discord administration write rejected.', 403, 'CROSS_ORIGIN_REJECTED');
      if (request.method !== 'POST') throw httpError('Method not allowed for Discord administration route.', 405, 'METHOD_NOT_ALLOWED');
      const body = await readBody(request);
      if (action === 'verify-channel') { writeJson(response, 200, await service.verifyChannel(user.id, code, body?.channelId)); return true; }
      if (action === 'unverify-channel') { writeJson(response, 200, await service.unverifyChannel(user.id, code, body?.destinationId)); return true; }
      if (action === 'match-guildmates') { writeJson(response, 200, await service.matchGuildmates(user.id, code, { apply: body?.apply === true })); return true; }
      throw httpError('Discord administration route not found.', 404, 'DISCORD_ADMIN_ROUTE_NOT_FOUND');
    } catch (error) {
      writeJson(response, Number(error?.status) || 500, { error: error?.message || 'Discord administration request failed.', code: error?.code || 'DISCORD_ADMIN_FAILED' });
      return true;
    }
  }
  return Object.freeze({ handle });
}
export const guildDiscordAdminApi = createGuildDiscordAdminApi();
