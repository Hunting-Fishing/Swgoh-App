import { supabaseCoreStore } from './supabase-core-store.mjs';

const array = (value) => Array.isArray(value) ? value : [];
const text = (value) => String(value ?? '').trim();
const first = (value) => array(value)[0] || null;
const nowIso = () => new Date().toISOString();

function httpError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function allyCode(value) {
  const code = text(value).replace(/\D/g, '');
  if (!/^\d{9}$/.test(code)) throw httpError('A valid 9-digit Ally Code is required.', 400, 'INVALID_ALLY_CODE');
  return code;
}

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function boundedText(value, max = 160) {
  return text(value).slice(0, max);
}

function ids(value, max = 500) {
  return [...new Set(array(value).map((row) => boundedText(row, 180)).filter(Boolean))].slice(0, max);
}

function sanitizeDestination(row) {
  if (!row) return null;
  return Object.freeze({
    id: text(row.id),
    kind: text(row.destination_kind),
    externalId: text(row.external_id),
    displayName: text(row.display_name),
    verified: row.verified === true,
    configured: Boolean(row.secret_ref || row.external_id),
    metadata: object(row.metadata),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  });
}

function sanitizeSettings(row) {
  return Object.freeze({
    assignmentAlgorithm: text(row?.assignment_algorithm || 'mission-safe-scarcity-v1'),
    defaultDeliveryMode: text(row?.default_delivery_mode || 'preview'),
    includeMentions: row?.include_mentions === true,
    sendDms: row?.send_dms === true,
    defaultDiscordDestinationId: text(row?.default_discord_destination_id),
    metadata: object(row?.metadata),
  });
}

function sanitizeTbPlan(row) {
  return Object.freeze({
    id: text(row?.id),
    name: text(row?.name),
    tbKey: text(row?.tb_key || 'rote'),
    status: text(row?.status || 'draft'),
    phaseLayout: object(row?.phase_layout),
    requirementOverrides: object(row?.requirement_overrides),
    ignoredMissions: array(row?.ignored_missions),
    ignoredPlatoons: array(row?.ignored_platoons),
    ignoredSlots: array(row?.ignored_slots),
    delivery: object(row?.delivery),
    metadata: object(row?.metadata),
    createdAt: text(row?.created_at),
    updatedAt: text(row?.updated_at),
  });
}

function sanitizeTwPlan(row) {
  return Object.freeze({
    id: text(row?.id),
    name: text(row?.name),
    status: text(row?.status || 'draft'),
    strategy: object(row?.strategy),
    delivery: object(row?.delivery),
    metadata: object(row?.metadata),
    createdAt: text(row?.created_at),
    updatedAt: text(row?.updated_at),
  });
}

export function createGuildOperationsService(options = {}) {
  const store = options.store || supabaseCoreStore;
  const now = typeof options.now === 'function' ? options.now : nowIso;

  function status() {
    const persistence = store.status?.() || {};
    return Object.freeze({
      configured: persistence.configured !== false,
      mode: 'durable-guild-operations-v1',
      officerRoles: Object.freeze(['owner','officer']),
    });
  }

  async function selectOne(table, query) {
    return first(await store.select(table, { ...query, limit: 1 }));
  }

  async function resolveGuild(lookupAllyCode) {
    const code = allyCode(lookupAllyCode);
    const player = await selectOne('players', {
      select: 'id,ally_code,name,current_guild_id',
      ally_code: `eq.${code}`,
    });
    if (!player?.current_guild_id) throw httpError('That Ally Code is not linked to a persisted Guild.', 404, 'GUILD_NOT_FOUND');
    const guild = await selectOne('guilds', {
      select: 'id,swgoh_guild_id,name,member_count,galactic_power,last_synced_at',
      id: `eq.${player.current_guild_id}`,
    });
    if (!guild?.id) throw httpError('The persisted Guild identity is unavailable.', 404, 'GUILD_NOT_FOUND');
    return Object.freeze({ code, player, guild });
  }

  async function requireOfficer(userId, lookupAllyCode) {
    if (!store.status?.().configured) throw httpError('Guild operations persistence is not configured.', 503, 'PERSISTENCE_NOT_CONFIGURED');
    const user = text(userId);
    if (!user) throw httpError('A signed-in Command Center account is required.', 401, 'AUTH_REQUIRED');
    const context = await resolveGuild(lookupAllyCode);
    const membership = await selectOne('guild_user_memberships', {
      select: 'guild_id,user_id,player_id,role,status,joined_at,updated_at',
      guild_id: `eq.${context.guild.id}`,
      user_id: `eq.${user}`,
      status: 'eq.active',
    });
    if (!membership) throw httpError('Your Command Center account is not an active member of this Guild.', 403, 'GUILD_ACCESS_DENIED');
    const role = text(membership.role).toLowerCase();
    if (!['owner','officer'].includes(role)) throw httpError('Guild officer authorization is required for the Operations workspace.', 403, 'OFFICER_REQUIRED');
    return Object.freeze({ ...context, userId: user, role, membership });
  }

  async function ensureSettings(context) {
    let row = await selectOne('guild_operation_settings', {
      select: '*',
      guild_id: `eq.${context.guild.id}`,
    });
    if (!row) row = first(await store.insert('guild_operation_settings', [{ guild_id: context.guild.id }]));
    return row || {};
  }

  async function currentMemberIds(context) {
    const rows = await store.select('guild_members_current', {
      select: 'player_id',
      guild_id: `eq.${context.guild.id}`,
      limit: 100,
    });
    return new Set(array(rows).map((row) => text(row.player_id)).filter(Boolean));
  }

  async function requireCurrentMember(context, playerIdInput) {
    const playerId = text(playerIdInput);
    if (!playerId) throw httpError('playerId is required.', 400, 'PLAYER_ID_REQUIRED');
    const member = await selectOne('guild_members_current', {
      select: 'player_id',
      guild_id: `eq.${context.guild.id}`,
      player_id: `eq.${playerId}`,
    });
    if (!member) throw httpError('That player is not a current member of this Guild.', 409, 'PLAYER_NOT_CURRENT_GUILD_MEMBER');
    return playerId;
  }

  async function requireVerifiedDestination(context, destinationIdInput) {
    const destinationId = text(destinationIdInput);
    if (!destinationId) return null;
    const row = await selectOne('guild_discord_destinations', {
      select: 'id,guild_id,verified,destination_kind',
      id: `eq.${destinationId}`,
      guild_id: `eq.${context.guild.id}`,
      verified: 'eq.true',
    });
    if (!row) throw httpError('Default Discord destination must be verified for this Guild.', 409, 'VERIFIED_DESTINATION_REQUIRED');
    return row;
  }

  async function playerNameMap(playerIds) {
    const map = new Map();
    for (const playerId of [...new Set(playerIds.map(text).filter(Boolean))]) {
      const player = await selectOne('players', { select: 'id,ally_code,name', id: `eq.${playerId}` });
      if (player) map.set(playerId, player);
    }
    return map;
  }

  async function getWorkspace(userId, lookupAllyCode) {
    const context = await requireOfficer(userId, lookupAllyCode);
    const [settings, destinations, controls, preferences, tbPlans, twPlans, audits, tbRuns, twRuns] = await Promise.all([
      ensureSettings(context),
      store.select('guild_discord_destinations', { select: 'id,destination_kind,external_id,display_name,verified,secret_ref,metadata,created_at,updated_at', guild_id: `eq.${context.guild.id}`, order: 'display_name.asc', limit: 100 }),
      store.select('guild_member_operation_controls', { select: '*', guild_id: `eq.${context.guild.id}`, order: 'updated_at.desc', limit: 100 }),
      store.select('guild_unit_donation_preferences', { select: '*', guild_id: `eq.${context.guild.id}`, order: 'updated_at.desc', limit: 500 }),
      store.select('guild_tb_plans', { select: '*', guild_id: `eq.${context.guild.id}`, order: 'updated_at.desc', limit: 50 }),
      store.select('guild_tw_defense_plans', { select: '*', guild_id: `eq.${context.guild.id}`, order: 'updated_at.desc', limit: 50 }),
      store.select('guild_operations_audit_log', { select: 'id,actor_user_id,action,entity_type,entity_id,metadata,occurred_at', guild_id: `eq.${context.guild.id}`, order: 'occurred_at.desc', limit: 100 }),
      store.select('guild_tb_assignment_runs', { select: 'id,plan_id,status,diagnostics,delivery,created_at,published_at', guild_id: `eq.${context.guild.id}`, order: 'created_at.desc', limit: 20 }),
      store.select('guild_tw_defense_runs', { select: 'id,plan_id,status,diagnostics,delivery,created_at,published_at', guild_id: `eq.${context.guild.id}`, order: 'created_at.desc', limit: 20 }),
    ]);

    const playerIds = [...array(controls).map((row) => row.player_id), ...array(preferences).map((row) => row.player_id)];
    const playerMap = await playerNameMap(playerIds);
    const controlRows = array(controls).map((row) => ({
      playerId: text(row.player_id),
      allyCode: text(playerMap.get(text(row.player_id))?.ally_code),
      name: text(playerMap.get(text(row.player_id))?.name),
      available: row.available !== false,
      ignoredUntil: text(row.ignored_until),
      ignoreReason: text(row.ignore_reason),
      source: text(row.source),
      updatedAt: text(row.updated_at),
    }));
    const preferenceRows = array(preferences).map((row) => ({
      playerId: text(row.player_id),
      allyCode: text(playerMap.get(text(row.player_id))?.ally_code),
      name: text(playerMap.get(text(row.player_id))?.name),
      baseId: text(row.base_id),
      preference: text(row.preference),
      source: text(row.source),
      updatedAt: text(row.updated_at),
    }));

    return Object.freeze({
      source: 'durable-guild-operations',
      guild: Object.freeze({
        id: text(context.guild.id),
        swgohGuildId: text(context.guild.swgoh_guild_id),
        name: text(context.guild.name),
        memberCount: Number(context.guild.member_count || 0),
        galacticPower: Number(context.guild.galactic_power || 0),
        lastSyncedAt: text(context.guild.last_synced_at),
      }),
      authorization: Object.freeze({ role: context.role, officer: true }),
      settings: sanitizeSettings(settings),
      destinations: Object.freeze(array(destinations).map(sanitizeDestination)),
      memberControls: Object.freeze(controlRows),
      donationPreferences: Object.freeze(preferenceRows),
      tbPlans: Object.freeze(array(tbPlans).map(sanitizeTbPlan)),
      twPlans: Object.freeze(array(twPlans).map(sanitizeTwPlan)),
      recentTbRuns: Object.freeze(array(tbRuns)),
      recentTwRuns: Object.freeze(array(twRuns)),
      audit: Object.freeze(array(audits)),
    });
  }

  async function audit(context, action, entityType, entityId, metadata = {}, beforeState = null, afterState = null) {
    await store.insert('guild_operations_audit_log', [{
      guild_id: context.guild.id,
      actor_user_id: context.userId,
      action: boundedText(action, 120),
      entity_type: boundedText(entityType, 80),
      entity_id: boundedText(entityId, 180) || null,
      before_state: beforeState,
      after_state: afterState,
      metadata: object(metadata),
      occurred_at: now(),
    }], { returning: false });
  }

  async function saveSettings(userId, lookupAllyCode, input = {}) {
    const context = await requireOfficer(userId, lookupAllyCode);
    const before = await ensureSettings(context);
    const deliveryMode = ['preview','discord_channel','webhook'].includes(text(input.defaultDeliveryMode)) ? text(input.defaultDeliveryMode) : 'preview';
    const destinationId = text(input.defaultDiscordDestinationId);
    if (destinationId) await requireVerifiedDestination(context, destinationId);
    const next = {
      guild_id: context.guild.id,
      assignment_algorithm: boundedText(input.assignmentAlgorithm || before.assignment_algorithm || 'mission-safe-scarcity-v1', 80),
      default_delivery_mode: deliveryMode,
      include_mentions: input.includeMentions === true,
      send_dms: input.sendDms === true,
      default_discord_destination_id: destinationId || null,
      metadata: object(input.metadata),
      updated_at: now(),
    };
    const row = first(await store.upsert('guild_operation_settings', [next], { onConflict: 'guild_id' }));
    await audit(context, 'settings.update', 'guild_operation_settings', context.guild.id, {}, before, row);
    return sanitizeSettings(row);
  }

  async function setMemberControl(userId, lookupAllyCode, input = {}) {
    const context = await requireOfficer(userId, lookupAllyCode);
    const playerId = await requireCurrentMember(context, input.playerId);
    const before = await selectOne('guild_member_operation_controls', { select: '*', guild_id: `eq.${context.guild.id}`, player_id: `eq.${playerId}` });
    const ignoredUntil = text(input.ignoredUntil);
    const row = first(await store.upsert('guild_member_operation_controls', [{
      guild_id: context.guild.id,
      player_id: playerId,
      available: input.available !== false,
      ignored_until: ignoredUntil || null,
      ignore_reason: boundedText(input.ignoreReason, 500) || null,
      source: 'command-center-web',
      updated_by_user_id: context.userId,
      metadata: object(input.metadata),
      updated_at: now(),
    }], { onConflict: 'guild_id,player_id' }));
    await audit(context, 'member-control.update', 'guild_member_operation_controls', playerId, {}, before, row);
    return row;
  }

  async function setDonationPreference(userId, lookupAllyCode, input = {}) {
    const context = await requireOfficer(userId, lookupAllyCode);
    const playerId = await requireCurrentMember(context, input.playerId);
    const baseId = boundedText(input.baseId, 120).toUpperCase();
    const preference = text(input.preference).toLowerCase();
    if (!baseId) throw httpError('baseId is required.', 400, 'PREFERENCE_TARGET_REQUIRED');
    const before = await selectOne('guild_unit_donation_preferences', { select: '*', guild_id: `eq.${context.guild.id}`, player_id: `eq.${playerId}`, base_id: `eq.${baseId}` });
    if (preference === 'default' || !preference) {
      await store.delete('guild_unit_donation_preferences', { guild_id: `eq.${context.guild.id}`, player_id: `eq.${playerId}`, base_id: `eq.${baseId}` });
      await audit(context, 'donation-preference.clear', 'guild_unit_donation_preferences', `${playerId}:${baseId}`, {}, before, null);
      return { playerId, baseId, preference: 'default' };
    }
    if (!['give','keep'].includes(preference)) throw httpError('Preference must be give, keep, or default.', 400, 'INVALID_DONATION_PREFERENCE');
    const row = first(await store.upsert('guild_unit_donation_preferences', [{
      guild_id: context.guild.id,
      player_id: playerId,
      base_id: baseId,
      preference,
      source: 'command-center-web',
      updated_by_user_id: context.userId,
      metadata: object(input.metadata),
      updated_at: now(),
    }], { onConflict: 'guild_id,player_id,base_id' }));
    await audit(context, 'donation-preference.update', 'guild_unit_donation_preferences', `${playerId}:${baseId}`, {}, before, row);
    return row;
  }

  async function saveTbPlan(userId, lookupAllyCode, input = {}) {
    const context = await requireOfficer(userId, lookupAllyCode);
    const planId = text(input.id);
    const before = planId ? await selectOne('guild_tb_plans', { select: '*', id: `eq.${planId}`, guild_id: `eq.${context.guild.id}` }) : null;
    if (planId && !before) throw httpError('TB plan was not found in this Guild.', 404, 'TB_PLAN_NOT_FOUND');
    const payload = {
      guild_id: context.guild.id,
      tb_key: boundedText(input.tbKey || before?.tb_key || 'rote', 80),
      name: boundedText(input.name || before?.name || 'ROTE Operations Plan', 160),
      status: ['draft','previewed','published','archived'].includes(text(input.status)) ? text(input.status) : text(before?.status || 'draft'),
      phase_layout: object(input.phaseLayout),
      requirement_overrides: object(input.requirementOverrides),
      ignored_missions: ids(input.ignoredMissions),
      ignored_platoons: ids(input.ignoredPlatoons),
      ignored_slots: ids(input.ignoredSlots),
      delivery: object(input.delivery),
      metadata: object(input.metadata),
      created_by_user_id: before?.created_by_user_id || context.userId,
      updated_at: now(),
      ...(planId ? { id: planId } : {}),
    };
    const row = planId
      ? first(await store.update('guild_tb_plans', { id: `eq.${planId}`, guild_id: `eq.${context.guild.id}` }, payload))
      : first(await store.insert('guild_tb_plans', [payload]));
    await audit(context, before ? 'tb-plan.update' : 'tb-plan.create', 'guild_tb_plan', row?.id, {}, before, row);
    return sanitizeTbPlan(row);
  }

  async function replaceTbRules(userId, lookupAllyCode, planIdInput, rulesInput = []) {
    const context = await requireOfficer(userId, lookupAllyCode);
    const planId = text(planIdInput);
    const plan = await selectOne('guild_tb_plans', { select: 'id', id: `eq.${planId}`, guild_id: `eq.${context.guild.id}` });
    if (!plan) throw httpError('TB plan was not found in this Guild.', 404, 'TB_PLAN_NOT_FOUND');
    const before = await store.select('guild_tb_grouping_rules', { select: '*', plan_id: `eq.${planId}`, order: 'priority.asc' });
    await store.delete('guild_tb_grouping_rules', { plan_id: `eq.${planId}`, guild_id: `eq.${context.guild.id}` });
    const rows = array(rulesInput).slice(0, 100).map((rule, index) => ({
      guild_id: context.guild.id,
      plan_id: planId,
      name: boundedText(rule.name || `Rule ${index + 1}`, 160),
      enabled: rule.enabled !== false,
      priority: Math.max(1, Math.floor(Number(rule.priority || (index + 1) * 10))),
      rule_type: text(rule.ruleType || rule.rule_type),
      when_spec: object(rule.whenSpec || rule.when_spec),
      then_spec: object(rule.thenSpec || rule.then_spec),
      metadata: object(rule.metadata),
      updated_at: now(),
    })).filter((row) => ['avoid_pair','prefer_pair','avoid_unit_after','max_member_assignments','protect_unit_if_assigned'].includes(row.rule_type));
    const saved = rows.length ? await store.insert('guild_tb_grouping_rules', rows) : [];
    await audit(context, 'tb-rules.replace', 'guild_tb_grouping_rules', planId, { count: saved.length }, before, saved);
    return saved;
  }

  async function replaceTbPreassignments(userId, lookupAllyCode, planIdInput, rowsInput = []) {
    const context = await requireOfficer(userId, lookupAllyCode);
    const planId = text(planIdInput);
    const plan = await selectOne('guild_tb_plans', { select: 'id', id: `eq.${planId}`, guild_id: `eq.${context.guild.id}` });
    if (!plan) throw httpError('TB plan was not found in this Guild.', 404, 'TB_PLAN_NOT_FOUND');

    const rows = array(rowsInput).slice(0, 1000).map((row) => ({
      plan_id: planId,
      slot_id: boundedText(row.slotId || row.slot_id, 180),
      player_id: text(row.playerId || row.player_id),
      base_id: boundedText(row.baseId || row.base_id, 120).toUpperCase() || null,
      phase: boundedText(row.phase, 20) || null,
      source: 'officer',
      metadata: object(row.metadata),
      updated_at: now(),
    })).filter((row) => row.slot_id && row.player_id);

    const memberIds = await currentMemberIds(context);
    const invalid = rows.filter((row) => !memberIds.has(row.player_id));
    if (invalid.length) {
      throw httpError('One or more pre-assigned players are no longer current Guild members.', 409, 'PREASSIGNMENT_PLAYER_NOT_CURRENT');
    }
    const duplicateSlots = rows.filter((row, index) => rows.findIndex((other) => other.slot_id === row.slot_id) !== index);
    if (duplicateSlots.length) throw httpError('Each TB Operation slot may have only one pre-assignment.', 409, 'DUPLICATE_PREASSIGNMENT_SLOT');

    const before = await store.select('guild_tb_plan_preassignments', { select: '*', plan_id: `eq.${planId}` });
    await store.delete('guild_tb_plan_preassignments', { plan_id: `eq.${planId}` });
    const saved = rows.length ? await store.insert('guild_tb_plan_preassignments', rows) : [];
    await audit(context, 'tb-preassignments.replace', 'guild_tb_plan_preassignments', planId, { count: saved.length }, before, saved);
    return saved;
  }

  async function getTbPlanDetail(userId, lookupAllyCode, planIdInput) {
    const context = await requireOfficer(userId, lookupAllyCode);
    const planId = text(planIdInput);
    const plan = await selectOne('guild_tb_plans', { select: '*', id: `eq.${planId}`, guild_id: `eq.${context.guild.id}` });
    if (!plan) throw httpError('TB plan was not found in this Guild.', 404, 'TB_PLAN_NOT_FOUND');
    const [rules, preAssignments] = await Promise.all([
      store.select('guild_tb_grouping_rules', { select: '*', plan_id: `eq.${planId}`, guild_id: `eq.${context.guild.id}`, order: 'priority.asc', limit: 100 }),
      store.select('guild_tb_plan_preassignments', { select: '*', plan_id: `eq.${planId}`, order: 'slot_id.asc', limit: 1000 }),
    ]);
    return { plan: sanitizeTbPlan(plan), rules: array(rules), preAssignments: array(preAssignments) };
  }

  async function saveTwPlan(userId, lookupAllyCode, input = {}) {
    const context = await requireOfficer(userId, lookupAllyCode);
    const planId = text(input.id);
    const before = planId ? await selectOne('guild_tw_defense_plans', { select: '*', id: `eq.${planId}`, guild_id: `eq.${context.guild.id}` }) : null;
    if (planId && !before) throw httpError('TW defense plan was not found in this Guild.', 404, 'TW_PLAN_NOT_FOUND');
    const payload = {
      guild_id: context.guild.id,
      name: boundedText(input.name || before?.name || 'TW Defense Strategy', 160),
      status: ['draft','previewed','published','archived'].includes(text(input.status)) ? text(input.status) : text(before?.status || 'draft'),
      strategy: object(input.strategy),
      delivery: object(input.delivery),
      metadata: object(input.metadata),
      created_by_user_id: before?.created_by_user_id || context.userId,
      updated_at: now(),
      ...(planId ? { id: planId } : {}),
    };
    const row = planId
      ? first(await store.update('guild_tw_defense_plans', { id: `eq.${planId}`, guild_id: `eq.${context.guild.id}` }, payload))
      : first(await store.insert('guild_tw_defense_plans', [payload]));
    await audit(context, before ? 'tw-plan.update' : 'tw-plan.create', 'guild_tw_defense_plan', row?.id, {}, before, row);
    return sanitizeTwPlan(row);
  }

  async function persistTbRun(context, input = {}) {
    const row = first(await store.insert('guild_tb_assignment_runs', [{
      guild_id: context.guild.id,
      plan_id: text(input.planId) || null,
      status: text(input.status || 'preview'),
      input_fingerprint: boundedText(input.inputFingerprint, 180) || null,
      assignments: array(input.assignments),
      unfilled: array(input.unfilled),
      diagnostics: object(input.diagnostics),
      delivery: object(input.delivery),
      created_by_user_id: context.userId,
    }]));
    await audit(context, 'tb-run.create', 'guild_tb_assignment_run', row?.id, { status: row?.status });
    return row;
  }

  async function persistTwRun(context, input = {}) {
    const row = first(await store.insert('guild_tw_defense_runs', [{
      guild_id: context.guild.id,
      plan_id: text(input.planId) || null,
      status: text(input.status || 'preview'),
      input_fingerprint: boundedText(input.inputFingerprint, 180) || null,
      assignments: array(input.assignments),
      unfilled: array(input.unfilled),
      diagnostics: object(input.diagnostics),
      delivery: object(input.delivery),
      created_by_user_id: context.userId,
    }]));
    await audit(context, 'tw-run.create', 'guild_tw_defense_run', row?.id, { status: row?.status });
    return row;
  }

  return Object.freeze({
    status,
    requireOfficer,
    getWorkspace,
    getTbPlanDetail,
    saveSettings,
    setMemberControl,
    setDonationPreference,
    saveTbPlan,
    replaceTbRules,
    replaceTbPreassignments,
    saveTwPlan,
    persistTbRun,
    persistTwRun,
  });
}

export const guildOperationsService = createGuildOperationsService();
