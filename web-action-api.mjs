import { journeyGoalService } from './journey-goal-service.mjs';
import { supabaseAuthSession } from './supabase-auth-session.mjs';
import { tbEventStateApi } from './tb-event-state-api.mjs';
import { webActionService } from './web-action-service.mjs';

const MAX_BODY_BYTES = 128 * 1024;
const text = (value) => String(value ?? '').trim();

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function sameOrigin(request) {
  const origin = text(request?.headers?.origin);
  if (!origin) return true;
  const host = text(request?.headers?.['x-forwarded-host'] || request?.headers?.host);
  const proto = text(text(request?.headers?.['x-forwarded-proto']).split(',')[0]) || 'https';
  return Boolean(host && origin === `${proto}://${host}`);
}

async function readJsonBody(request) {
  const contentType = text(request?.headers?.['content-type']).toLowerCase();
  if (contentType && !contentType.startsWith('application/json')) throw httpError('Content-Type must be application/json.', 415, 'CONTENT_TYPE_REQUIRED');
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError('Website action request body is too large.', 413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('Website action request body must contain valid JSON.', 400, 'INVALID_JSON'); }
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

export function createWebActionApi(options = {}) {
  const session = options.session || supabaseAuthSession;
  const service = options.service || webActionService;
  const goals = options.journeyGoals || journeyGoalService;
  const tb = options.tbEventStateApi || tbEventStateApi;

  async function requireUser(request) {
    const user = await session.currentUser(request);
    if (!user?.id) throw httpError('A signed-in Command Center session is required.', 401, 'AUTH_REQUIRED');
    return user;
  }

  async function handle(request, response, url) {
    if (url.pathname.startsWith('/api/account/web-actions/tb/')) {
      return tb.handle(request, response, url);
    }
    if (!url.pathname.startsWith('/api/account/web-actions')) return false;
    try {
      const user = await requireUser(request);

      if (request.method === 'GET' && url.pathname === '/api/account/web-actions/catalog') {
        writeJson(response, 200, await service.catalog(user.id));
        return true;
      }
      if (request.method === 'GET' && url.pathname === '/api/account/web-actions/recent') {
        writeJson(response, 200, { runs: await service.recent(user.id, url.searchParams.get('limit')) });
        return true;
      }
      if (request.method === 'GET' && url.pathname === '/api/account/web-actions/journey-goals') {
        writeJson(response, 200, await goals.snapshot(user.id));
        return true;
      }

      const playerFeed = url.pathname.match(/^\/api\/account\/web-actions\/feed\/player\/(\d{9})$/);
      if (request.method === 'GET' && playerFeed) {
        writeJson(response, 200, await service.playerFeed(user.id, playerFeed[1]));
        return true;
      }
      const guildFeed = url.pathname.match(/^\/api\/account\/web-actions\/feed\/guild\/(\d{9})$/);
      if (request.method === 'GET' && guildFeed) {
        writeJson(response, 200, await service.guildFeed(user.id, guildFeed[1]));
        return true;
      }

      if (request.method === 'PUT' && url.pathname === '/api/account/web-actions/journey-goals') {
        if (!sameOrigin(request)) throw httpError('Cross-origin Journey goal write rejected.', 403, 'CROSS_ORIGIN_REJECTED');
        const body = await readJsonBody(request);
        writeJson(response, 200, await goals.replace(user.id, body?.eventIds));
        return true;
      }

      if (!sameOrigin(request)) throw httpError('Cross-origin website action write rejected.', 403, 'CROSS_ORIGIN_REJECTED');
      if (request.method !== 'POST') throw httpError('Method not allowed for website action route.', 405, 'METHOD_NOT_ALLOWED');
      const body = await readJsonBody(request);

      if (url.pathname === '/api/account/web-actions/execute') {
        const result = await service.execute(user.id, body?.actionKey, body?.input || {});
        writeJson(response, 201, result);
        return true;
      }

      const shareMatch = url.pathname.match(/^\/api\/account\/web-actions\/([0-9a-f-]{36})\/share$/i);
      if (shareMatch) {
        const result = await service.share(user.id, shareMatch[1], body?.targetKind, { destinationId: body?.destinationId });
        writeJson(response, 200, result);
        return true;
      }

      throw httpError('Website action route not found.', 404, 'WEB_ACTION_ROUTE_NOT_FOUND');
    } catch (error) {
      writeJson(response, Number(error?.status) || 500, {
        error: error?.message || 'Website action request failed.',
        code: error?.code || 'WEB_ACTION_FAILED',
      });
      return true;
    }
  }

  return Object.freeze({ handle });
}

export const webActionApi = createWebActionApi();
