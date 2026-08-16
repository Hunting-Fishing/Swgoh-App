import { allTerritoryBattleStrategyCoverageReport } from "../public/tb-strategy-coverage-all.js";
import { buildTerritoryBattleResearchQueue } from "../public/tb-strategy-research-priority.js";

const report = allTerritoryBattleStrategyCoverageReport();
const queue = buildTerritoryBattleResearchQueue(report.rows);

console.log(`Territory Battle strategy research queue: ${queue.length} unresolved/partial missions`);
console.log("");

for (const row of queue) {
  const location = [row.tbId, row.phase ? `P${row.phase}` : "", row.territoryName || row.territoryId].filter(Boolean).join(" · ");
  const p = row.researchPriority;
  console.log(`[${p.tier}] ${p.score} · ${row.coverage.toUpperCase()} · ${location} · ${row.missionName} (${row.missionId})`);
  console.log(`  ${p.reasons.join("; ")}`);
  console.log(`  ${row.reason}`);
}
