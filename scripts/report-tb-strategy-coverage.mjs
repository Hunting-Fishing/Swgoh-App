import { roteStrategyCoverageReport } from "../public/tb-strategy-coverage.js";

const report = roteStrategyCoverageReport();
const missing = report.rows.filter((row) => row.coverage === "missing");
const partial = report.rows.filter((row) => row.coverage === "partial");

console.log(`ROTE strategy coverage: ${report.counts.covered}/${report.total} covered (${report.percentCovered}%)`);
console.log(`Partial: ${report.counts.partial} · Missing: ${report.counts.missing}`);
for (const type of ["combat", "special", "fleet"]) {
  const row = report.byType[type];
  if (row) console.log(`${type}: ${row.covered}/${row.total} covered · ${row.partial} partial · ${row.missing} missing`);
}
console.log("\nMissing missions:");
for (const row of missing) console.log(`- P${row.phase} ${row.territoryId} · ${row.missionType} · ${row.missionId} · ${row.name}`);
console.log("\nPartial missions:");
for (const row of partial) console.log(`- P${row.phase} ${row.territoryId} · ${row.missionType} · ${row.missionId} · ${row.name}`);
