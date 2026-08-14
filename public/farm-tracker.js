function value(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function ratio(current, required) {
  const target = value(required);
  if (!target) return null;
  return Math.max(0, Math.min(1, value(current) / target));
}

export function farmRequirementRows(currentUnit = {}, required = {}, unitType = "Character") {
  const rows = [];
  const add = (key, label, current, target, format = (input) => String(input)) => {
    const progress = ratio(current, target);
    if (progress === null) return;
    rows.push({
      key,
      label,
      current: value(current),
      required: value(target),
      currentLabel: format(value(current)),
      requiredLabel: format(value(target)),
      progress,
      complete: progress >= 1,
    });
  };

  add("stars", "Stars", currentUnit.stars, required.stars, (input) => `${input}★`);
  add("level", "Level", currentUnit.level, required.level);

  if (unitType !== "Ship") {
    add("gear", "Gear", currentUnit.gear, required.gear, (input) => `G${input}`);
    add("relic", "Relic", currentUnit.relic, required.relic, (input) => `R${input}`);
  }

  return rows;
}

export function farmCompletion(currentUnit = {}, required = {}, unitType = "Character") {
  const rows = farmRequirementRows(currentUnit, required, unitType);
  if (!rows.length) return { percent: 0, complete: false, rows: [] };
  const percent = Math.round((rows.reduce((sum, row) => sum + row.progress, 0) / rows.length) * 100);
  return {
    percent,
    complete: rows.every((row) => row.complete),
    rows,
  };
}

export function farmStatus(result = {}) {
  const percent = value(result.percent);
  if (result.complete || percent >= 100) return "Complete";
  if (percent >= 85) return "Close";
  if (percent >= 50) return "Farming";
  return "Early";
}
