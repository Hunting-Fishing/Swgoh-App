import { gacHistoryImportService } from "../gac-history-import-service.mjs";

const allyCode = String(process.argv[2] || "").replace(/\D/g, "");
const modeArg = String(process.argv[3] || "").toLowerCase();
const modes = ["3v3", "5v5"].includes(modeArg) ? [modeArg] : ["3v3", "5v5"];

if (!/^\d{9}$/.test(allyCode)) {
  console.error("Usage: node scripts/import-gac-player-history.mjs <9-digit-ally-code> [3v3|5v5]");
  process.exitCode = 2;
} else {
  try {
    const result = await gacHistoryImportService.importPlayer(allyCode, { modes });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exitCode = 1;
  }
}
