const phaseChoices = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((phase) => ({ name: phase, value: phase }));

export const DISCORD_STAGE10_DELIVERY_SCHEMA_VERSION = '2026-08-20-stage10-mentions-channels-v3';

export const DISCORD_STAGE10_TB_SUBCOMMANDS = Object.freeze([
  Object.freeze({
    type: 1,
    name: 'plan-delivery',
    description: 'Preview, publish, or inspect approved immutable ROTE delivery',
    options: [
      {
        type: 3,
        name: 'action',
        description: 'Preview/status are read-only; publish requires exact hash confirmation',
        required: true,
        choices: [
          { name: 'PREVIEW — no Discord post', value: 'preview' },
          { name: 'STATUS — durable delivery receipts', value: 'status' },
          { name: 'PUBLISH — verified Guild channel only', value: 'publish' },
        ],
      },
      { type: 3, name: 'phase', description: 'ROTE phase', required: true, choices: phaseChoices },
      { type: 4, name: 'version', description: 'Immutable version number', required: true, min_value: 1 },
      {
        type: 7,
        name: 'channel',
        description: 'Optional verified TB assignment channel; defaults to the configured Command Center channel',
        required: false,
        channel_types: [0, 5],
      },
      {
        type: 3,
        name: 'mentions',
        description: 'Linked-member @mentions; defaults ON for TB public delivery',
        required: false,
        choices: [
          { name: 'ON — @mention linked assigned members', value: 'on' },
          { name: 'OFF — names only, no member notifications', value: 'off' },
        ],
      },
      { type: 3, name: 'hash', description: 'First 12+ hex characters of the approved immutable hash', required: false, min_length: 12, max_length: 64 },
      {
        type: 3,
        name: 'confirm',
        description: 'Required only for PUBLISH',
        required: false,
        choices: [{ name: 'PUBLISH APPROVED VERSION', value: 'PUBLISH' }],
      },
    ],
  }),
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function schemaShape(value) {
  if (Array.isArray(value)) return value.map(schemaShape);
  if (!value || typeof value !== 'object') return value;
  const shaped = {
    type: Number(value.type || 0),
    name: String(value.name || ''),
    description: String(value.description || ''),
    required: value.required === true,
  };
  if (Array.isArray(value.options)) shaped.options = value.options.map(schemaShape);
  if (Array.isArray(value.choices)) shaped.choices = value.choices.map((row) => ({ name: String(row?.name || ''), value: row?.value }));
  if (Array.isArray(value.channel_types)) shaped.channel_types = value.channel_types.map(Number);
  for (const key of ['min_value', 'max_value', 'min_length', 'max_length']) {
    if (value[key] !== undefined && value[key] !== null) shaped[key] = value[key];
  }
  return shaped;
}

function sameSchema(left, right) {
  return JSON.stringify(schemaShape(left)) === JSON.stringify(schemaShape(right));
}

export function applyDiscordStage10TbCommandSchema(command = {}) {
  if (String(command?.name || '').toLowerCase() !== 'tb') {
    throw new Error('Stage 10 command schema requires the registered /tb command.');
  }
  const existing = Array.isArray(command.options) ? clone(command.options) : [];
  const added = [];
  const updated = [];
  for (const row of DISCORD_STAGE10_TB_SUBCOMMANDS) {
    const index = existing.findIndex((option) => String(option?.name || '').toLowerCase() === row.name);
    if (index < 0) {
      existing.push(clone(row));
      added.push(row.name);
      continue;
    }
    if (!sameSchema(existing[index], row)) {
      existing[index] = clone(row);
      updated.push(row.name);
    }
  }
  if (existing.length > 25) {
    throw new Error(`Stage 10 would exceed Discord's 25-subcommand /tb limit (${existing.length}).`);
  }
  return Object.freeze({
    changed: added.length > 0 || updated.length > 0,
    added: Object.freeze(added),
    updated: Object.freeze(updated),
    schemaVersion: DISCORD_STAGE10_DELIVERY_SCHEMA_VERSION,
    command: Object.freeze({ ...clone(command), options: existing }),
  });
}
