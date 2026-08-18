import { JOURNEY_PRESETS, journeyPresetById } from './public/farm-presets.js';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const first = (value) => array(value)[0] || null;

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function publicPreset(event = {}) {
  return Object.freeze({
    id: text(event.id),
    name: text(event.name || event.shortName || event.id),
    shortName: text(event.shortName || event.name || event.id),
    category: text(event.category || 'Journey Guide'),
    targetBaseId: text(event.targetBaseId),
    featured: event.featured === true,
    requirementCount: array(event.requirements).length,
  });
}

export function createJourneyGoalService(options = {}) {
  const store = options.store || supabaseCoreStore;

  async function verifiedIdentity(userId) {
    const links = array(await store.select('user_player_links', {
      select: 'player_id,is_primary,verification_status,verified_at',
      user_id: `eq.${userId}`,
      verification_status: 'eq.verified',
      order: 'is_primary.desc,verified_at.desc',
      limit: 10,
    }));
    const link = links.find((row) => row.is_primary === true) || links[0];
    if (!link?.player_id) throw httpError('A verified SWGOH player is required to manage Journey goals.', 403, 'VERIFIED_PLAYER_REQUIRED');
    const player = first(await store.select('players', {
      select: 'id,ally_code,name,current_guild_id',
      id: `eq.${link.player_id}`,
      limit: 1,
    }));
    if (!player?.id) throw httpError('The verified player identity is unavailable.', 404, 'VERIFIED_PLAYER_NOT_FOUND');
    return Object.freeze({ userId, player: Object.freeze({ ...player }) });
  }

  function normalizeEventIds(input) {
    const ids = [];
    const seen = new Set();
    for (const raw of array(input)) {
      const id = text(raw).toUpperCase();
      if (!id || seen.has(id)) continue;
      if (!journeyPresetById(id)) throw httpError(`Unknown Journey target: ${id}`, 400, 'UNKNOWN_JOURNEY_GOAL');
      seen.add(id);
      ids.push(id);
    }
    if (ids.length > 50) throw httpError('At most 50 Journey goals may be tracked.', 400, 'TOO_MANY_JOURNEY_GOALS');
    return ids;
  }

  async function listForPlayer(userId, playerId) {
    return Object.freeze(array(await store.select('user_journey_goals', {
      select: 'journey_event_id,priority_rank,created_at,updated_at',
      user_id: `eq.${userId}`,
      player_id: `eq.${playerId}`,
      order: 'priority_rank.asc,journey_event_id.asc',
      limit: 50,
    })).map((row) => text(row.journey_event_id)).filter((id) => journeyPresetById(id)));
  }

  async function snapshot(userId) {
    const identity = await verifiedIdentity(userId);
    const trackedIds = await listForPlayer(userId, identity.player.id);
    const trackedSet = new Set(trackedIds);
    return Object.freeze({
      source: 'durable-journey-goals-v1',
      player: Object.freeze({
        id: text(identity.player.id),
        allyCode: text(identity.player.ally_code).replace(/\D/g, ''),
        name: text(identity.player.name),
      }),
      trackedIds,
      goals: Object.freeze(JOURNEY_PRESETS.map((event) => Object.freeze({ ...publicPreset(event), tracked: trackedSet.has(text(event.id)) }))),
    });
  }

  async function replace(userId, eventIds) {
    const identity = await verifiedIdentity(userId);
    const normalized = normalizeEventIds(eventIds);
    await store.rpc('replace_user_journey_goals', {
      p_user_id: userId,
      p_player_id: identity.player.id,
      p_event_ids: normalized,
    });
    return snapshot(userId);
  }

  return Object.freeze({ snapshot, replace, listForPlayer, verifiedIdentity, normalizeEventIds });
}

export const journeyGoalService = createJourneyGoalService();
