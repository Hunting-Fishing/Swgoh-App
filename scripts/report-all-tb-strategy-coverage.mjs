import { allTerritoryBattleStrategyCoverageReport } from "../public/tb-strategy-coverage-all.js";

const report = allTerritoryBattleStrategyCoverageReport();

console.log(`Territory Battle strategy coverage: ${report.counts.covered} covered / ${report.counts.partial} partial / ${report.counts.missing} missing / ${report.counts.total} total`);
console.log("");

for (const [tbId, section] of Object.entries(report.byTb)) {
  const { covered, partial, missing, total } = section.counts;
  console.log(`${tbId}: ${covered} covered / ${partial} partial / ${missing} missing / ${total} total`);
}

console.log("");
for (const row of report.rows.filter((entry) => entry.coverage !== "covered")) {
  const location = [row.tbId, row.phase ? `P${row.phase}` : "", row.territoryName || row.territoryId].filter(Boolean).join(" · ");
  console.log(`[${row.coverage.toUpperCase()}] ${location} · ${row.missionName} (${row.missionId})`);
  console.log(`  ${row.reason}`);
}
