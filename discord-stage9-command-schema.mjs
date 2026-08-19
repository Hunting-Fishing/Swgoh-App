const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];

export const DISCORD_STAGE9_PLAN_SCHEMA_VERSION = '2026-08-19-stage9-plan-status-v1';

const phaseChoices = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map((phase) => Object.freeze({ name: phase, value: phase }));

export const DISCORD_STAGE9_TB_SUBCOMMANDS = Object.freeze([
  Object.freeze({
    type: 1,
    name: 'plan-status',
    description: 'Officer-read immutable ROTE assignment plan versions and approval state',
    options: Object.freeze([
      Object.freeze({
        type: 3,
        name: 'phase',
        description: 'Optional ROTE phase scope',
        required: false,
        choices: Object.freeze(phaseChoices),
      }),
    ]),
  }),
]);

function normalizedCommand(command = {}) {
  return {
    type: Number(command.type || 1),
    name: text(command.name),
    description: text(command.description),
    options: array(command.options).map((option) => ({ ...option })),
  };
}

export function applyDiscordStage9TbCommandSchema(tbCommand = {}) {
  if (text(tbCommand.name).toLowerCase() !== 'tb') throw new Error('Stage 9 schema patch requires the registered /tb command.');
  const next = normalizedCommand(tbCommand);
  const existing = new Set(next.options.map((option) => text(option?.name).toLowerCase()).filter(Boolean));
  const added = [];
  for (const subcommand of DISCORD_STAGE9_TB_SUBCOMMANDS) {
    if (existing.has(subcommand.name)) continue;
    next.options.push({
      type: subcommand.type,
      name: subcommand.name,
      description: subcommand.description,
      options: subcommand.options.map((option) => ({
        ...option,
        choices: array(option.choices).map((choice) => ({ ...choice })),
      })),
    });
    existing.add(subcommand.name);
    added.push(subcommand.name);
  }
  return Object.freeze({
    changed: added.length > 0,
    added: Object.freeze(added),
    command: Object.freeze(next),
    schemaVersion: DISCORD_STAGE9_PLAN_SCHEMA_VERSION,
  });
}
