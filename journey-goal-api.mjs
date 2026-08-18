import { journeyGoalService } from './journey-goal-service.mjs';
import { supabaseAuthSession } from './supabase-auth-session.mjs';

const MAX_BODY_BYTES = 32 * 1024;
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
    if (size > MAX_BODY_BYTES) throw httpError('Journey goal request body is too large.', 413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('Journey goal request body must contain valid JSON.', 400, 'INVALID_JSON'); }
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

export function createJourneyGoalApi(options = {}) {
  const session = options.session || supabaseAuthSession;
  const service = options.service || journeyGoalService;

  async function requireUser(request) {
    const user = await session.currentUser(request);
    if (!user?.id) throw httpError('A signed-in Command Center session is required.', 401, 'AUTH_REQUIRED');
    return user;
  }

  async function handle(request, response, url) {
    if (url.pathname !== '/api/account/journey-goals') return false;
    try {
      const user = await requireUser(request);
      if (request.method === 'GET') {
        writeJson(response, 200, await service.snapshot(user.id));
        return true;
      }
      if (request.method === 'PUT') {
        if (!sameOrigin(request)) throw httpError('Cross-origin Journey goal write rejected.', 403, 'CROSS_ORIGIN_REJECTED');
        const body = await readJsonBody(request);
        writeJson(response, 200, await service.replace(user.id, body?.eventIds));
        return true;
      }
      throw httpError('Method not allowed for Journey goal route.', 405, 'METHOD_NOT_ALLOWED');
    } catch (error) {
      writeJson(response, Number(error?.status) || 500, {
        error: error?.message || 'Journey goal request failed.',
        code: error?.code || 'JOURNEY_GOAL_FAILED',
      });
      return true;
    }
  }

  return Object.freeze({ handle });
}

export const journeyGoalApi = createJourneyGoalApi();
