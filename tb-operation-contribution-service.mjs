import { createHash } from 'node:crypto';
import { aggregateRoteOperations } from './rote-operations.mjs';
import { ROTE_PLANETS } from './public/rote-map-data.js';
import { supabaseCoreStore } from './supabase-core-store.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const object = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const text = (value) => String(value ?? '').trim();
const first = (value) => array(value)[0] || null;
const uuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value)) ? text(value).toLowerCase() : '';
const allyCode = (value) => { const code = text(value).replace(/\D/g, ''); return /^\d{9}$/.test(code) ? code : ''; };
const phase = (value) => { const normalized = text(value).toUpperCase(); return /^P[1-6]$/.test(normalized) ? normalized : ''; };
const iso = (value) => { const parsed = Date.parse(text(value)); return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null; };
const finiteOrNull = (value) => value === null || value === undefined || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);

const OFFICER_ROLES = new Set(['owner', 'officer']);
const KNOWN_CONTRIBUTION_STATUS = new Set(['filled', 'verified', 'mismatch']);
const GAME_SOURCES = new Set(['canonical', 'game_gateway']);
const SOURCE_RANK = Object.freeze({ canonical: 500, game_gateway: 450, officer_web: 300, discord: 250, member_web: 200, import: 150, system: 100, unknown: 0 });

function httpError(message, status, code, details = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function hash(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function bounded(value, max = 240) {
  return text(value).slice(0, max);
}

function cleanBaseId(value) {
  const normalized = text(value).toUpperCase();
  return /^[A-Z0-9_:-]{2,100}$/.test(normalized) ? normalized : '';
}

function cleanPlanetId(value) {
  const normalized = text(value).toLowerCase();
  return /^[a-z0-9-]{2,80}$/.test(normalized) ? normalized : '';
}

function sourceKind(value, fallback = 'unknown') {
  const normalized = text(value).toLowerCase();
  return ['canonical','game_gateway','officer_web','member_web','discord','import','system','unknown'].includes(normalized) ? normalized : fallback;
}

function contributionStatus(value, fallback = 'filled') {
  const normalized = text(value).toLowerCase();
  return ['filled','verified','mismatch','unknown'].includes(normalized) ? normalized : fallback;
}

function logicalContributionId(input = {}) {
  const id = text(input.id || input.contributionId || input.sourceRef);
  if (!id || id.length > 200) {
    throw httpError('A stable contribution ID is required so retries cannot create duplicate Operation evidence.', 400, 'TB_OPERATION_CONTRIBUTION_ID_REQUIRED');
  }
  return id;
}

function roleOf(identity = {}) {
  return text(identity?.membership?.role).toLowerCase();
}

function normalizeUnitSnapshot(value = {}, fallbackBaseId = '') {
  const row = object(value);
  const stats = object(row.stats);
  const rawAbilities = array(row.abilities || row.skills || row?.metadata?.skills);
  return Object.freeze({
    baseId: cleanBaseId(row.baseId || row.base_id || fallbackBaseId),
    name: text(row.name || row.unitName || row.unit_name),
    level: finiteOrNull(row.level),
    stars: finiteOrNull(row.stars ?? row.rarity),
    gear: finiteOrNull(row.gear ?? row.gearLevel ?? row.gear_level),
    relic: finiteOrNull(row.relic ?? row.relicTier ?? row.relic_tier),
    galacticPower: finiteOrNull(row.galacticPower ?? row.power ?? row.galactic_power),
    zetaCount: finiteOrNull(row.zetaCount ?? row.zetas ?? row.zeta_count),
    omicronCount: finiteOrNull(row.omicronCount ?? row.omicrons ?? row.omicron_count),
    abilities: Object.freeze(rawAbilities.map((ability) => Object.freeze({
      id: text(ability?.id),
      name: text(ability?.name),
      tier: finiteOrNull(ability?.tier ?? ability?.effectiveTier ?? ability?.rawTier),
      hasZeta: ability?.hasZeta === true ? true : ability?.hasZeta === false ? false : null,
      hasOmicron: ability?.hasOmicron === true ? true : ability?.hasOmicron === false ? false : null,
      omicronMode: finiteOrNull(ability?.omicronMode),
    })).filter((ability) => ability.id)),
    stats: Object.freeze({
      speed: finiteOrNull(stats.speed ?? row.speed),
      health: finiteOrNull(stats.health ?? row.health),
      protection: finiteOrNull(stats.protection ?? row.protection),
      offense: finiteOrNull(stats.offense ?? row.offense),
      physicalDamage: finiteOrNull(stats.physicalDamage ?? row.physicalDamage),
      specialDamage: finiteOrNull(stats.specialDamage ?? row.specialDamage),
      potency: finiteOrNull(stats.potency ?? row.potency),
      tenacity: finiteOrNull(stats.tenacity ?? row.tenacity),
    }),
    source: text(row.source),
    fetchedAt: iso(row.fetchedAt || row.persistedAt || row.lastSyncedAt || row.last_synced_at),
  });
}

function snapshotFromPersistedRow(row = {}) {
  const metadata = object(row.metadata);
  return normalizeUnitSnapshot({
    baseId: row.base_id,
    name: row.unit_name,
    rarity: row.rarity,
    level: row.level,
    gear_level: row.gear_level,
    relic_tier: row.relic_tier,
    galactic_power: row.galactic_power,
    zeta_count: row.zeta_count,
    omicron_count: row.omicron_count,
    speed: metadata.speed,
    abilities: array(metadata.skills).map((skill) => ({ id: skill?.id, tier: skill?.tier })),
    source: 'player_units_current',
    fetchedAt: row.last_synced_at,
  }, row.base_id);
}

function linkedConflictLane(value) {
  const linked = text(value).toLowerCase();
  if (/(^|_)mixed(_|$)/.test(linked)) return 'Mixed';
  if (/(^|_)dark(_|$)/.test(linked)) return 'Dark';
  if (/(^|_)light(_|$)/.test(linked)) return 'Light';
  return '';
}

export function roteOperationPlanetForSlot(slot = {}) {
  const slotPhase = phase(slot.phase);
  const lane = linkedConflictLane(slot.linkedConflictId);
  if (!slotPhase || !lane) return '';
  const candidates = ROTE_PLANETS.filter((planet) => text(planet.phase).toUpperCase() === slotPhase && text(planet.alignment) === lane);
  return candidates.length === 1 ? cleanPlanetId(candidates[0].id) : '';
}

function operationNumber(value) {
  const match = /(?:platoon|operation)[-_]?(\d+)$/i.exec(text(value));
  return match ? Number(match[1]) : null;
}

export function normalizeRoteOperationReference(payload, options = {}) {
  const aggregated = Array.isArray(payload?.slots) ? payload : aggregateRoteOperations(payload);
  const normalized = [];
  const skipped = [];
  for (const sourceSlot of array(aggregated?.slots)) {
    const slotPhase = phase(sourceSlot.phase);
    const baseId = cleanBaseId(sourceSlot.baseId);
    const conflictId = bounded(sourceSlot.conflictId, 80);
    const squadId = bounded(sourceSlot.squadId, 100);
    const slotIndex = Math.floor(Number(sourceSlot.slot));
    const planetId = cleanPlanetId((typeof options.planetResolver === 'function' ? options.planetResolver(sourceSlot) : '') || roteOperationPlanetForSlot(sourceSlot));
    const reasons = [];
    if (!slotPhase) reasons.push('phase');
    if (!planetId) reasons.push('planet');
    if (!conflictId) reasons.push('conflict');
    if (!squadId) reasons.push('operation');
    if (!Number.isInteger(slotIndex) || slotIndex <= 0) reasons.push('slotIndex');
    if (!baseId) reasons.push('baseId');
    if (reasons.length) {
      skipped.push(Object.freeze({ sourceSlotId: text(sourceSlot.id), phase: slotPhase, conflictId, squadId, reasons: Object.freeze(reasons) }));
      continue;
    }
    const number = operationNumber(squadId);
    const logicalSlotId = `${slotPhase}:${conflictId}:${squadId}:${slotIndex}`;
    const operationId = `${conflictId}:${squadId}`;
    const planet = ROTE_PLANETS.find((candidate) => candidate.id === planetId);
    normalized.push(Object.freeze({
      phase: slotPhase,
      planetId,
      operationId,
      operationName: `${text(planet?.name || planetId)} · ${number ? `Operation ${number}` : squadId}`,
      slotId: logicalSlotId,
      slotIndex,
      requiredBaseId: baseId,
      requiredRelic: finiteOrNull(sourceSlot.requiredRelic),
      requiredRarity: finiteOrNull(sourceSlot.requiredRarity),
      metadata: Object.freeze({
        sourceSlotId: text(sourceSlot.id),
        conflictId,
        linkedConflictId: text(sourceSlot.linkedConflictId),
        squadId,
        unitName: text(sourceSlot.name || baseId),
        unitType: text(sourceSlot.unitType),
        combatType: finiteOrNull(sourceSlot.combatType),
      }),
    }));
  }
  return Object.freeze({
    source: text(aggregated?.source || 'swgoh-utils/gamedata:swgoh_rote_operations.json'),
    territoryBattleId: text(aggregated?.territoryBattleId || 't05D'),
    slots: Object.freeze(normalized),
    skipped: Object.freeze(skipped),
  });
}

function sanitizeSlot(row = {}) {
  return Object.freeze({
    id: text(row.id),
    eventId: text(row.event_id),
    guildId: text(row.guild_id),
    phase: phase(row.phase),
    planetId: text(row.planet_id),
    operationId: text(row.operation_id),
    operationName: text(row.operation_name),
    slotId: text(row.slot_id),
    slotIndex: Number(row.slot_index || 0),
    requiredBaseId: cleanBaseId(row.required_base_id),
    requiredRelic: finiteOrNull(row.required_relic),
    requiredRarity: finiteOrNull(row.required_rarity),
    sourceKind: text(row.source_kind),
    sourceRef: text(row.source_ref),
    sourceFetchedAt: text(row.source_fetched_at),
    metadata: Object.freeze({ ...object(row.metadata) }),
    updatedAt: text(row.updated_at),
  });
}

function sanitizeAssignment(row = {}) {
  if (!row?.id) return null;
  return Object.freeze({
    id: text(row.id),
    slotRecordId: text(row.slot_id),
    assignmentRunId: text(row.assignment_run_id),
    playerId: text(row.assigned_player_id),
    allyCode: text(row.assigned_ally_code),
    baseId: cleanBaseId(row.assigned_base_id),
    state: text(row.assignment_state),
    source: text(row.assignment_source),
    planHash: text(row.plan_hash),
    inputFingerprint: text(row.input_fingerprint),
    assignedAt: text(row.assigned_at),
    supersededAt: text(row.superseded_at),
  });
}

function sanitizeContribution(row = {}) {
  return Object.freeze({
    id: text(row.id),
    contributionKey: text(row.contribution_key),
    evidenceFingerprint: text(row.evidence_fingerprint),
    slotRecordId: text(row.slot_id),
    eventId: text(row.event_id),
    guildId: text(row.guild_id),
    phase: phase(row.phase),
    playerId: text(row.contributor_player_id),
    allyCode: text(row.contributor_ally_code),
    baseId: cleanBaseId(row.contributed_base_id),
    relic: finiteOrNull(row.contributed_relic),
    rarity: finiteOrNull(row.contributed_rarity),
    status: text(row.status),
    evidenceClass: text(row.evidence_class),
    sourceKind: text(row.source_kind),
    sourceRef: text(row.source_ref),
    observedAt: text(row.observed_at),
    reportedByUserId: text(row.reported_by_user_id),
    unitSnapshot: normalizeUnitSnapshot(row.unit_snapshot, row.contributed_base_id),
    metadata: Object.freeze({ ...object(row.metadata) }),
    createdAt: text(row.created_at),
  });
}

export function effectiveOperationContribution(rows = []) {
  const evidence = array(rows).map((row) => row?.sourceKind ? row : sanitizeContribution(row));
  const known = evidence.filter((row) => KNOWN_CONTRIBUTION_STATUS.has(text(row.status).toLowerCase()));
  const candidates = known.length ? known : evidence;
  return candidates.slice().sort((a, b) => {
    const sourceDelta = (SOURCE_RANK[sourceKind(b.sourceKind)] || 0) - (SOURCE_RANK[sourceKind(a.sourceKind)] || 0);
    if (sourceDelta) return sourceDelta;
    return Date.parse(b.observedAt || b.createdAt || 0) - Date.parse(a.observedAt || a.createdAt || 0);
  })[0] || null;
}

function chunks(rows, size = 250) {
  const output = [];
  for (let index = 0; index < rows.length; index += size) output.push(rows.slice(index, index + size));
  return output;
}

export function createTbOperationContributionService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  function ensureConfigured() {
    if (!store.status?.().configured) throw httpError('Command Center persistence is not configured.', 503, 'PERSISTENCE_NOT_CONFIGURED');
  }

  async function verifiedIdentity(userId) {
    const user = text(userId);
    if (!user) throw httpError('A signed-in Command Center account is required.', 401, 'AUTH_REQUIRED');
    const links = array(await store.select('user_player_links', {
      select: 'player_id,is_primary,verification_status,verified_at',
      user_id: `eq.${user}`,
      verification_status: 'eq.verified',
      order: 'is_primary.desc,verified_at.desc',
      limit: 10,
    }));
    const link = links.find((row) => row.is_primary === true) || links[0];
    if (!link?.player_id) throw httpError('A verified SWGOH player is required for ROTE Operations evidence.', 403, 'VERIFIED_PLAYER_REQUIRED');
    const player = first(await store.select('players', {
      select: 'id,ally_code,swgoh_player_id,name,current_guild_id,last_synced_at',
      id: `eq.${link.player_id}`,
      limit: 1,
    }));
    if (!player?.id || !allyCode(player.ally_code)) throw httpError('Verified SWGOH player identity is unavailable.', 404, 'VERIFIED_PLAYER_NOT_FOUND');
    if (!player.current_guild_id) throw httpError('Your verified player is not currently attached to a Guild.', 409, 'ACTIVE_GUILD_REQUIRED');
    const membership = first(await store.select('guild_user_memberships', {
      select: 'guild_id,user_id,player_id,role,status',
      guild_id: `eq.${player.current_guild_id}`,
      user_id: `eq.${user}`,
      player_id: `eq.${player.id}`,
      status: 'eq.active',
      limit: 1,
    }));
    if (!membership) throw httpError('Current verified Guild membership is required.', 403, 'ACTIVE_GUILD_MEMBERSHIP_REQUIRED');
    return Object.freeze({ userId: user, guildId: text(player.current_guild_id), allyCode: allyCode(player.ally_code), player: Object.freeze(player), membership: Object.freeze(membership) });
  }

  async function eventForGuild(guildIdInput, requestedEventId = '') {
    const guildId = uuid(guildIdInput);
    if (!guildId) throw httpError('A valid Guild ID is required.', 400, 'TB_OPERATION_GUILD_ID_INVALID');
    const requested = requestedEventId ? uuid(requestedEventId) : '';
    if (requestedEventId && !requested) throw httpError('The Territory Battle event ID is invalid.', 400, 'TB_OPERATION_EVENT_ID_INVALID');
    const event = first(await store.select('guild_tb_events', {
      select: 'id,guild_id,tb_key,current_phase,status,started_at,ends_at,updated_at',
      guild_id: `eq.${guildId}`,
      tb_key: 'eq.rote',
      ...(requested ? { id: `eq.${requested}` } : { status: 'eq.active' }),
      order: 'updated_at.desc',
      limit: 1,
    }));
    if (!event?.id) throw httpError(requested ? 'That ROTE event does not belong to the requested Guild.' : 'No active ROTE event is configured for this Guild.', 404, 'TB_OPERATION_EVENT_NOT_FOUND');
    return Object.freeze(event);
  }

  async function eventFor(identity, requestedEventId = '') {
    return eventForGuild(identity.guildId, requestedEventId);
  }

  async function syncReferenceSlots(userId, payload, syncOptions = {}) {
    ensureConfigured();
    const identity = await verifiedIdentity(userId);
    const event = await eventFor(identity, syncOptions.eventId);
    const normalized = normalizeRoteOperationReference(payload, syncOptions);
    const existingRows = array(await store.select('guild_tb_operation_slots', {
      select: '*',
      event_id: `eq.${event.id}`,
      order: 'phase.asc,planet_id.asc,operation_id.asc,slot_index.asc',
      limit: 5000,
    }));
    const existing = new Map(existingRows.map((row) => [`${row.phase}|${row.operation_id}|${row.slot_id}`, row]));
    const conflicts = [];
    for (const slot of normalized.slots) {
      const current = existing.get(`${slot.phase}|${slot.operationId}|${slot.slotId}`);
      if (current && cleanBaseId(current.required_base_id) !== slot.requiredBaseId) {
        conflicts.push(Object.freeze({
          slotRecordId: text(current.id),
          phase: slot.phase,
          operationId: slot.operationId,
          slotId: slot.slotId,
          persistedBaseId: cleanBaseId(current.required_base_id),
          incomingBaseId: slot.requiredBaseId,
        }));
      }
    }
    if (conflicts.length) {
      throw httpError('Canonical ROTE Operation requirements changed for an existing event slot. Refusing to rewrite assignment-linked event history.', 409, 'TB_OPERATION_SLOT_DEFINITION_CONFLICT', { conflicts });
    }

    const fetchedAt = iso(syncOptions.sourceFetchedAt) || now().toISOString();
    const source = ['canonical','game','import','officer','system','unknown'].includes(text(syncOptions.sourceKind).toLowerCase())
      ? text(syncOptions.sourceKind).toLowerCase()
      : 'canonical';
    const rows = normalized.slots.map((slot) => ({
      event_id: event.id,
      guild_id: identity.guildId,
      phase: slot.phase,
      planet_id: slot.planetId,
      operation_id: slot.operationId,
      operation_name: slot.operationName,
      slot_id: slot.slotId,
      slot_index: slot.slotIndex,
      required_base_id: slot.requiredBaseId,
      required_relic: slot.requiredRelic,
      required_rarity: slot.requiredRarity,
      source_kind: source,
      source_ref: bounded(syncOptions.sourceRef || normalized.source),
      source_fetched_at: fetchedAt,
      metadata: { ...slot.metadata, territoryBattleId: normalized.territoryBattleId },
      updated_at: now().toISOString(),
    }));

    const saved = [];
    for (const batch of chunks(rows)) {
      saved.push(...array(await store.upsert('guild_tb_operation_slots', batch, {
        onConflict: 'event_id,phase,operation_id,slot_id',
        returning: true,
      })));
    }
    return Object.freeze({
      source: 'guild-tb-operation-ledger-v1',
      eventId: text(event.id),
      guildId: identity.guildId,
      savedSlots: saved.length,
      slots: Object.freeze(saved.map(sanitizeSlot)),
      skipped: normalized.skipped,
      evidenceBoundary: 'Operation slot definitions are reference/event state only. They do not prove that any member was assigned or contributed.',
    });
  }

  async function resolveSlot(event, input = {}) {
    const slotRecordId = uuid(input.slotRecordId || input.slotDbId);
    const logicalSlotId = text(input.slotId || input.operationSlotId);
    const slotPhase = input.phase ? phase(input.phase) : '';
    if (input.phase && !slotPhase) throw httpError('A valid ROTE phase P1-P6 is required.', 400, 'TB_OPERATION_PHASE_INVALID');
    if (!slotRecordId && !logicalSlotId) throw httpError('An Operation slot ID is required.', 400, 'TB_OPERATION_SLOT_REQUIRED');
    const rows = array(await store.select('guild_tb_operation_slots', {
      select: '*',
      event_id: `eq.${event.id}`,
      ...(slotRecordId ? { id: `eq.${slotRecordId}` } : { slot_id: `eq.${logicalSlotId}` }),
      ...(slotPhase ? { phase: `eq.${slotPhase}` } : {}),
      limit: 2,
    }));
    if (!rows.length) throw httpError('That Operation slot is not registered for this ROTE event.', 404, 'TB_OPERATION_SLOT_NOT_FOUND');
    if (rows.length > 1) throw httpError('The Operation slot reference is ambiguous; include phase or the durable slot record ID.', 409, 'TB_OPERATION_SLOT_AMBIGUOUS');
    return rows[0];
  }

  async function resolveCurrentGuildPlayer(guildId, input = {}, { allowUnknown = false } = {}) {
    const requestedPlayerId = uuid(input.playerId || input.contributorPlayerId);
    const requestedAlly = allyCode(input.allyCode || input.contributorAllyCode);
    const requestedGameId = bounded(input.swgohPlayerId || input.contributorSwgohPlayerId, 120);
    if (!requestedPlayerId && !requestedAlly && !requestedGameId) {
      if (allowUnknown) return null;
      throw httpError('A current Guild contributor identity is required.', 400, 'TB_OPERATION_CONTRIBUTOR_REQUIRED');
    }
    let player = null;
    if (requestedPlayerId) {
      player = first(await store.select('players', { select: 'id,ally_code,swgoh_player_id,name,current_guild_id,last_synced_at', id: `eq.${requestedPlayerId}`, current_guild_id: `eq.${guildId}`, limit: 1 }));
    }
    if (!player && requestedAlly) {
      player = first(await store.select('players', { select: 'id,ally_code,swgoh_player_id,name,current_guild_id,last_synced_at', ally_code: `eq.${requestedAlly}`, current_guild_id: `eq.${guildId}`, limit: 1 }));
    }
    if (!player && requestedGameId) {
      player = first(await store.select('players', { select: 'id,ally_code,swgoh_player_id,name,current_guild_id,last_synced_at', swgoh_player_id: `eq.${requestedGameId}`, current_guild_id: `eq.${guildId}`, limit: 1 }));
    }
    if (!player && !allowUnknown) throw httpError('The reported contributor is not a current member of this Guild.', 409, 'TB_OPERATION_CONTRIBUTOR_NOT_CURRENT_MEMBER');
    return player;
  }

  async function currentUnitSnapshot(playerId, baseId) {
    if (!playerId || !baseId) return normalizeUnitSnapshot({}, baseId);
    const row = first(await store.select('player_units_current', {
      select: 'player_id,base_id,unit_name,combat_type,rarity,level,gear_level,relic_tier,galactic_power,zeta_count,omicron_count,last_synced_at,metadata',
      player_id: `eq.${playerId}`,
      base_id: `eq.${baseId}`,
      limit: 1,
    }));
    return row ? snapshotFromPersistedRow(row) : normalizeUnitSnapshot({ source: 'player_units_current' }, baseId);
  }

  async function activeAssignment(slotRecordId) {
    return first(await store.select('guild_tb_operation_assignments', {
      select: '*',
      slot_id: `eq.${slotRecordId}`,
      assignment_state: 'eq.assigned',
      superseded_at: 'is.null',
      order: 'assigned_at.desc',
      limit: 1,
    }));
  }

  function mismatchReasons(slot, assignment, contributor, contributedBaseId) {
    const reasons = [];
    if (contributedBaseId && contributedBaseId !== cleanBaseId(slot.required_base_id)) reasons.push('UNIT_DOES_NOT_MATCH_SLOT_REQUIREMENT');
    if (assignment?.assigned_base_id && contributedBaseId && cleanBaseId(assignment.assigned_base_id) !== contributedBaseId) reasons.push('UNIT_DOES_NOT_MATCH_ASSIGNMENT');
    if (assignment?.assigned_player_id && contributor?.id && text(assignment.assigned_player_id) !== text(contributor.id)) reasons.push('CONTRIBUTOR_DOES_NOT_MATCH_ASSIGNMENT');
    return reasons;
  }

  async function existingContribution(contributionKey) {
    return first(await store.select('guild_tb_operation_contributions', {
      select: '*', contribution_key: `eq.${contributionKey}`, limit: 1,
    }));
  }

  function assertSameContribution(existing, prepared) {
    if (!existing) return;
    if (text(existing.evidence_fingerprint) !== prepared.evidenceFingerprint) {
      throw httpError('This contribution ID already exists with different evidence. Record a new correction/observation instead of rewriting history.', 409, 'TB_OPERATION_CONTRIBUTION_EVIDENCE_CONFLICT');
    }
  }

  async function persistPrepared(prepared) {
    const existing = await existingContribution(prepared.contributionKey);
    if (existing) {
      assertSameContribution(existing, prepared);
      return Object.freeze({ saved: true, alreadyRecorded: true, contribution: sanitizeContribution(existing) });
    }
    try {
      const saved = first(await store.insert('guild_tb_operation_contributions', [prepared.row]));
      if (!saved?.id) throw httpError('The Operation contribution evidence could not be persisted.', 502, 'TB_OPERATION_CONTRIBUTION_WRITE_FAILED');
      return Object.freeze({ saved: true, alreadyRecorded: false, contribution: sanitizeContribution(saved) });
    } catch (error) {
      if (Number(error?.status) !== 409) throw error;
      const raced = await existingContribution(prepared.contributionKey);
      if (!raced) throw error;
      assertSameContribution(raced, prepared);
      return Object.freeze({ saved: true, alreadyRecorded: true, contribution: sanitizeContribution(raced) });
    }
  }

  async function prepareContribution({ event, guildId, slot, contributor, unresolvedAlly = '', input = {}, source, evidenceClass, reportedByUserId = null, trustedSnapshot = false, requestedStatus = 'filled' }) {
    const logicalId = logicalContributionId(input);
    const assignment = await activeAssignment(slot.id);
    let contributedBaseId = cleanBaseId(input.baseId || input.contributedBaseId);
    let baseIdKnown = Boolean(contributedBaseId);
    if (!contributedBaseId) contributedBaseId = cleanBaseId(slot.required_base_id);
    const persistedSnapshot = contributor?.id ? await currentUnitSnapshot(contributor.id, contributedBaseId) : normalizeUnitSnapshot({}, contributedBaseId);
    const suppliedSnapshot = trustedSnapshot ? normalizeUnitSnapshot(input.unitSnapshot, contributedBaseId) : null;
    const unitSnapshot = suppliedSnapshot && suppliedSnapshot.baseId ? suppliedSnapshot : persistedSnapshot;
    const reasons = mismatchReasons(slot, assignment, contributor, contributedBaseId);
    let status = contributionStatus(requestedStatus, 'filled');
    if (!contributor && GAME_SOURCES.has(source)) status = 'unknown';
    if (!baseIdKnown && GAME_SOURCES.has(source)) status = 'unknown';
    if (reasons.length) status = 'mismatch';
    const observedAt = iso(input.observedAt) || now().toISOString();
    const contributionKey = hash(['rote-operation-contribution-v1', event.id, slot.id, source, logicalId].join('|'));
    const material = {
      eventId: event.id,
      guildId,
      phase: slot.phase,
      slotRecordId: slot.id,
      contributorPlayerId: contributor?.id || null,
      contributorAllyCode: contributor ? allyCode(contributor.ally_code) : (allyCode(unresolvedAlly) || null),
      contributedBaseId,
      status,
      evidenceClass,
      sourceKind: source,
      unitSnapshot,
      mismatchReasons: reasons,
      baseIdKnown,
    };
    const evidenceFingerprint = hash(material);
    return Object.freeze({
      contributionKey,
      evidenceFingerprint,
      row: {
        contribution_key: contributionKey,
        evidence_fingerprint: evidenceFingerprint,
        slot_id: slot.id,
        event_id: event.id,
        guild_id: guildId,
        phase: slot.phase,
        contributor_player_id: contributor?.id || null,
        contributor_ally_code: contributor ? allyCode(contributor.ally_code) : (allyCode(unresolvedAlly) || null),
        contributed_base_id: contributedBaseId,
        contributed_relic: finiteOrNull(unitSnapshot.relic),
        contributed_rarity: finiteOrNull(unitSnapshot.stars),
        status,
        evidence_class: evidenceClass,
        source_kind: source,
        source_ref: bounded(input.sourceRef || logicalId),
        observed_at: observedAt,
        reported_by_user_id: reportedByUserId || null,
        unit_snapshot: unitSnapshot,
        metadata: {
          logicalContributionId: logicalId,
          assignmentId: text(assignment?.id),
          assignedPlayerId: text(assignment?.assigned_player_id),
          assignedAllyCode: text(assignment?.assigned_ally_code),
          assignmentMatched: Boolean(assignment && contributor?.id && text(assignment.assigned_player_id) === text(contributor.id) && cleanBaseId(assignment.assigned_base_id) === contributedBaseId),
          mismatchReasons: reasons,
          contributorIdentityResolved: Boolean(contributor?.id),
          contributedBaseIdKnown: baseIdKnown,
          evidenceBoundary: 'Assignment is not proof of contribution. This row records only the stated/observed contribution evidence and its provenance.',
        },
      },
    });
  }

  async function recordMemberConfirmation(userId, input = {}) {
    ensureConfigured();
    const identity = await verifiedIdentity(userId);
    const event = await eventFor(identity, input.eventId);
    const slot = await resolveSlot(event, input);
    const requestedAlly = allyCode(input.allyCode || input.contributorAllyCode);
    const requestedPlayerId = uuid(input.playerId || input.contributorPlayerId);
    if ((requestedAlly && requestedAlly !== identity.allyCode) || (requestedPlayerId && requestedPlayerId !== identity.player.id)) {
      throw httpError('Members may only confirm their own Operation contributions.', 403, 'TB_OPERATION_MEMBER_SELF_CONFIRM_ONLY');
    }
    const prepared = await prepareContribution({
      event,
      guildId: identity.guildId,
      slot,
      contributor: identity.player,
      input: { ...input, baseId: cleanBaseId(slot.required_base_id) },
      source: 'member_web',
      evidenceClass: 'GUILD_DATA',
      reportedByUserId: identity.userId,
      trustedSnapshot: false,
      requestedStatus: 'filled',
    });
    const result = await persistPrepared(prepared);
    return Object.freeze({ source: 'guild-tb-operation-contributions-v1', ...result });
  }

  async function recordOfficerConfirmation(userId, input = {}) {
    ensureConfigured();
    const identity = await verifiedIdentity(userId);
    if (!OFFICER_ROLES.has(roleOf(identity))) throw httpError('Guild officer authorization is required to confirm another member’s Operation contribution.', 403, 'OFFICER_REQUIRED');
    const event = await eventFor(identity, input.eventId);
    const slot = await resolveSlot(event, input);
    const contributor = await resolveCurrentGuildPlayer(identity.guildId, input, { allowUnknown: contributionStatus(input.status, 'verified') === 'unknown' });
    const prepared = await prepareContribution({
      event,
      guildId: identity.guildId,
      slot,
      contributor,
      unresolvedAlly: input.allyCode || input.contributorAllyCode,
      input,
      source: 'officer_web',
      evidenceClass: 'GUILD_DATA',
      reportedByUserId: identity.userId,
      trustedSnapshot: false,
      requestedStatus: contributionStatus(input.status, 'verified'),
    });
    const result = await persistPrepared(prepared);
    return Object.freeze({ source: 'guild-tb-operation-contributions-v1', ...result });
  }

  async function recordGameEvidence(input = {}, gameOptions = {}) {
    ensureConfigured();
    const guildId = uuid(gameOptions.guildId);
    const event = await eventForGuild(guildId, gameOptions.eventId || input.eventId);
    const slot = await resolveSlot(event, input);
    const contributor = await resolveCurrentGuildPlayer(guildId, input, { allowUnknown: true });
    const source = GAME_SOURCES.has(sourceKind(gameOptions.sourceKind, 'game_gateway')) ? sourceKind(gameOptions.sourceKind, 'game_gateway') : 'game_gateway';
    const prepared = await prepareContribution({
      event,
      guildId,
      slot,
      contributor,
      unresolvedAlly: input.allyCode || input.contributorAllyCode,
      input,
      source,
      evidenceClass: 'GAME_DATA',
      reportedByUserId: null,
      trustedSnapshot: true,
      requestedStatus: contributor ? 'verified' : 'unknown',
    });
    const result = await persistPrepared(prepared);
    return Object.freeze({ source: 'guild-tb-operation-contributions-v1', ...result });
  }

  async function ledger(userId, filters = {}) {
    ensureConfigured();
    const identity = await verifiedIdentity(userId);
    const event = await eventFor(identity, filters.eventId);
    const requestedPhase = filters.phase ? phase(filters.phase) : '';
    if (filters.phase && !requestedPhase) throw httpError('A valid ROTE phase P1-P6 is required.', 400, 'TB_OPERATION_PHASE_INVALID');
    const slotRows = array(await store.select('guild_tb_operation_slots', {
      select: '*',
      event_id: `eq.${event.id}`,
      ...(requestedPhase ? { phase: `eq.${requestedPhase}` } : {}),
      ...(cleanPlanetId(filters.planetId) ? { planet_id: `eq.${cleanPlanetId(filters.planetId)}` } : {}),
      order: 'phase.asc,planet_id.asc,operation_id.asc,slot_index.asc',
      limit: 5000,
    }));
    const output = [];
    for (const slot of slotRows) {
      const [assignment, contributions] = await Promise.all([
        activeAssignment(slot.id),
        store.select('guild_tb_operation_contributions', {
          select: '*', slot_id: `eq.${slot.id}`, order: 'observed_at.desc,created_at.desc', limit: 100,
        }),
      ]);
      const evidence = array(contributions).map(sanitizeContribution);
      output.push(Object.freeze({
        slot: sanitizeSlot(slot),
        assignment: sanitizeAssignment(assignment),
        effectiveContribution: effectiveOperationContribution(evidence),
        contributions: Object.freeze(evidence),
      }));
    }
    return Object.freeze({
      source: 'guild-tb-operation-ledger-v1',
      guildId: identity.guildId,
      eventId: text(event.id),
      phase: requestedPhase,
      slots: Object.freeze(output),
      evidenceBoundary: 'ASSIGNED and CONTRIBUTED are separate evidence. Missing contribution evidence remains unreported/unknown and is never converted to filled or skipped.',
    });
  }

  return Object.freeze({
    verifiedIdentity,
    eventFor,
    syncReferenceSlots,
    recordMemberConfirmation,
    recordOfficerConfirmation,
    recordGameEvidence,
    ledger,
  });
}

export const tbOperationContributionService = createTbOperationContributionService();

export {
  hash as tbOperationContributionHash,
  logicalContributionId,
  normalizeUnitSnapshot as normalizeTbOperationUnitSnapshot,
  sanitizeContribution as sanitizeTbOperationContribution,
  sanitizeSlot as sanitizeTbOperationSlot,
};
