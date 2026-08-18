import { guildOperationScheduleService } from './guild-operation-schedule-service.mjs';
import { supabaseAuthSession } from './supabase-auth-session.mjs';

const MAX_BODY_BYTES = 64 * 1024;
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
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw httpError('Schedule request body is too large.', 413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('Schedule request body must contain valid JSON.', 400, 'INVALID_JSON'); }
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

export function createGuildOperationScheduleApi(options = {}) {
  const session = options.session || supabaseAuthSession;
  const service = options.service || guildOperationScheduleService;

  async function requireUser(request) {
    const user = await session.currentUser(request);
    if (!user?.id) throw httpError('A signed-in Command Center session is required.', 401, 'AUTH_REQUIRED');
    return user;
  }

  async function handle(request, response, url) {
    if (!url.pathname.startsWith('/api/account/guild-operation-schedules/')) return false;
    try {
      const user = await requireUser(request);
      const match = url.pathname.match(/^\/api\/account\/guild-operation-schedules\/(\d{9})(?:\/([0-9a-f-]{36}))?(?:\/(status))?$/i);
      if (!match) throw httpError('A valid Guild lookup Ally Code is required.', 400, 'INVALID_ALLY_CODE');
      const code = match[1];
      const scheduleId = match[2] || '';
      const action = match[3] || '';

      if (request.method === 'GET' && !scheduleId) {
        writeJson(response, 200, await service.list(user.id, code));
        return true;
      }

      if (!sameOrigin(request)) throw httpError('Cross-origin schedule write rejected.', 403, 'CROSS_ORIGIN_REJECTED');

      if (request.method === 'POST' && !scheduleId) {
        const body = await readJsonBody(request);
        const saved = await service.save(user.id, code, body);
        writeJson(response, body?.id ? 200 : 201, saved);
        return true;
      }

      if (request.method === 'POST' && scheduleId && action === 'status') {
        const body = await readJsonBody(request);
        writeJson(response, 200, await service.setStatus(user.id, code, scheduleId, body?.status, body?.nextRunAt));
        return true;
      }

      if (request.method === 'DELETE' && scheduleId && !action) {
        writeJson(response, 200, await service.remove(user.id, code, scheduleId));
        return true;
      }

      throw httpError('Method not allowed for Guild Operation schedule route.', 405, 'METHOD_NOT_ALLOWED');
    } catch (error) {
      writeJson(response, Number(error?.status) || 500, {
        error: error?.message || 'Guild Operation schedule request failed.',
        code: error?.code || 'GUILD_OPERATION_SCHEDULE_FAILED',
      });
      return true;
    }
  }

  return Object.freeze({ handle });
}

export const guildOperationScheduleApi = createGuildOperationScheduleApi();
