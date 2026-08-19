import { discordTbStage9PlanCommand } from './discord-tb-stage9-plan-command.mjs';
import { discordTbStage9PlanCancelCommand } from './discord-tb-stage9-plan-cancel-command.mjs';
import { discordTbStage9PlanPreviewCommand } from './discord-tb-stage9-plan-preview-command.mjs';

const text = (value) => String(value ?? '').trim();
const array = (value) => Array.isArray(value) ? value : [];

function subcommand(interaction = {}) {
  return text(array(interaction?.data?.options).find((row) => Number(row?.type) === 1 || Number(row?.type) === 2)?.name).toLowerCase();
}

export function createDiscordTbStage9Command(options = {}) {
  const planCommand = options.planCommand || discordTbStage9PlanCommand;
  const cancelCommand = options.cancelCommand || discordTbStage9PlanCancelCommand;
  const previewCommand = options.previewCommand || discordTbStage9PlanPreviewCommand;

  async function execute(interaction = {}) {
    const name = subcommand(interaction);
    if (name === 'plan-preview') return previewCommand.execute(interaction);
    if (name === 'plan-cancel') return cancelCommand.execute(interaction);
    return planCommand.execute(interaction);
  }

  return Object.freeze({ execute });
}

export const discordTbStage9Command = createDiscordTbStage9Command();
