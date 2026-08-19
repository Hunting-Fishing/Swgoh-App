const phaseChoices = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((phase) => ({ name: phase, value: phase }));

export const DISCORD_STAGE10_DELIVERY_SCHEMA_VERSION = '2026-08-20-stage10-controlled-delivery-v1';

export const DISCORD_STAGE10_TB_SUBCOMMANDS = Object.freeze([
  Object.freeze({
    type: 1,
    name: 'plan-delivery',
    description: 'Preview or publish one approved immutable ROTE plan to the verified Guild channel',
    options: [
      {
        type: 3,
        name: 'action',
        description: 'Preview is read-only; publish requires exact hash confirmation',
        required: true,
        choices: [
          { name: 'PREVIEW — no Discord post', value: 'preview' },
          { name: 'PUBLISH — verified Guild channel only', value: 'publish' },
        ],
      },
      { type: 3, name: 'phase', description: 'ROTE phase', required: true, choices: phaseChoices },
      { type: 4, name: 'version', description: 'Immutable version number', required: true, min_value: 1 },
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
  Object.freeze({
    type: 1,
    name: 'delivery-status',
    description: 'Show durable Stage 10 delivery receipts for one immutable ROTE version',
    options: [
      { type: 3, name: 'phase', description: 'ROTE phase', required: true, choices: phaseChoices },
      { type: 4, name: 'version', description: 'Immutable version number', required: true, min_value: 1 },
    ],
  }),
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function applyDiscordStage10TbCommandSchema(command = {}) {
  if (String(command?.name || '').toLowerCase() !== 'tb') {
    throw new Error('Stage 10 command schema requires the registered /tb command.');
  }
  const existing = Array.isArray(command.options) ? clone(command.options) : [];
  const names = new Set(existing.map((row) => String(row?.name || '').toLowerCase()));
  const added = [];
  for (const row of DISCORD_STAGE10_TB_SUBCOMMANDS) {
    if (names.has(row.name)) continue;
    existing.push(clone(row));
    names.add(row.name);
    added.push(row.name);
  }
  if (existing.length > 25) {
    throw new Error(`Stage 10 would exceed Discord's 25-subcommand /tb limit (${existing.length}).`);
  }
  return Object.freeze({
    changed: added.length > 0,
    added: Object.freeze(added),
    schemaVersion: DISCORD_STAGE10_DELIVERY_SCHEMA_VERSION,
    command: Object.freeze({ ...clone(command), options: existing }),
  });
}
