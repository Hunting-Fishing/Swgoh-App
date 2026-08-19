import { supabaseAuthSession } from './supabase-auth-session.mjs';
import { tbEventStateService } from './tb-event-state-service.mjs';
import { tbRoutePreviewService } from './tb-route-preview-service.mjs';
import { tbRouteApplyService } from './tb-route-apply-service.mjs';
import { tbMissionEvidenceService } from './tb-mission-evidence-service.mjs';

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
    if (size > MAX_BODY_BYTES) throw httpError('TB Command Center request body is too large.', 413, 'BODY_TOO_LARGE');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError('TB Command Center request body must contain valid JSON.', 400, 'INVALID_JSON'); }
}

function writeJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(body));
}

function requestedMissionIds(url) {
  return [...new Set(url.searchParams.getAll('missionId')
    .flatMap((value) => text(value).split(','))
    .map(text)
    .filter(Boolean))];
}

export function createTbEventStateApi(options = {}) {
  const session = options.session || supabaseAuthSession;
  const service = options.service || tbEventStateService;
  const routePreview = options.routePreview || tbRoutePreviewService;
  const routeApply = options.routeApply || tbRouteApplyService;
  const missionEvidence = options.missionEvidence || tbMissionEvidenceService;
  const prefix = '/api/account/web-actions/tb';

  async function requireUser(request) {
    const user = await session.currentUser(request);
    if (!user?.id) throw httpError('A signed-in Command Center session is required.', 401, 'AUTH_REQUIRED');
    return user;
  }

  async function handle(request, response, url) {
    if (!url.pathname.startsWith(`${prefix}/`) && url.pathname !== prefix) return false;
    try {
      const user = await requireUser(request);

      if (request.method === 'GET' && url.pathname === `${prefix}/event`) {
        writeJson(response, 200, await service.eventSnapshot(user.id));
        return true;
      }
      if (request.method === 'GET' && url.pathname === `${prefix}/today`) {
        writeJson(response, 200, await service.today(user.id));
        return true;
      }
      if (request.method === 'GET' && url.pathname === `${prefix}/mission-evidence`) {
        writeJson(response, 200, await missionEvidence.evidence(user.id, { missionIds: requestedMissionIds(url) }));
        return true;
      }

      if (!sameOrigin(request)) throw httpError('Cross-origin TB Command Center write rejected.', 403, 'CROSS_ORIGIN_REJECTED');
      if (request.method !== 'POST') throw httpError('Method not allowed for TB Command Center route.', 405, 'METHOD_NOT_ALLOWED');
      const body = await readJsonBody(request);

      if (url.pathname === `${prefix}/route/preview`) {
        writeJson(response, 200, await routePreview.preview(user.id, body));
        return true;
      }
      if (url.pathname === `${prefix}/route/apply`) {
        writeJson(response, 200, await routeApply.apply(user.id, body));
        return true;
      }
      if (url.pathname === `${prefix}/mission-attempt`) {
        writeJson(response, 201, await missionEvidence.report(user.id, body));
        return true;
      }
      const missionCorrection = url.pathname.match(/^\/api\/account\/web-actions\/tb\/mission-attempt\/([0-9a-f-]{36})\/correct$/i);
      if (missionCorrection) {
        writeJson(response, 200, await missionEvidence.correct(user.id, missionCorrection[1], body));
        return true;
      }
      if (url.pathname === `${prefix}/event`) {
        writeJson(response, body?.id ? 200 : 201, await service.saveEvent(user.id, body));
        return true;
      }
      if (url.pathname === `${prefix}/zone`) {
        writeJson(response, 200, await service.saveZoneState(user.id, body));
        return true;
      }
      if (url.pathname === `${prefix}/today/refresh`) {
        writeJson(response, 200, await service.refreshToday(user.id));
        return true;
      }

      const actionStatus = url.pathname.match(/^\/api\/account\/web-actions\/tb\/action\/([0-9a-f-]{36})\/status$/i);
      if (actionStatus) {
        writeJson(response, 200, await service.setActionStatus(user.id, actionStatus[1], body?.status));
        return true;
      }

      throw httpError('TB Command Center route not found.', 404, 'TB_ROUTE_NOT_FOUND');
    } catch (error) {
      writeJson(response, Number(error?.status) || 500, {
        error: error?.message || 'TB Command Center request failed.',
        code: error?.code || 'TB_COMMAND_CENTER_FAILED',
        ...(error?.details ? { details: error.details } : {}),
      });
      return true;
    }
  }

  return Object.freeze({ handle });
}

export const tbEventStateApi = createTbEventStateApi();
