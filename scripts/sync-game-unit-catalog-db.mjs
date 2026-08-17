import { syncGameUnitCatalog } from "../game-unit-catalog-sync.mjs";
import { supabaseCoreStore } from "../supabase-core-store.mjs";

const IF_CONFIGURED = process.argv.includes("--if-configured");
const SOFT_FAIL = process.argv.includes("--soft-fail");

async function main() {
  const status = supabaseCoreStore.status();
  if (!status.configured && IF_CONFIGURED) {
    console.log("[catalog-db] Supabase is not configured; database catalog sync skipped.");
    return;
  }

  const result = await syncGameUnitCatalog({ store: supabaseCoreStore });
  console.log(
    `[catalog-db] stored ${result.rowsStored} units ` +
    `(${result.characterCount} characters, ${result.shipCount} ships) and ` +
    `${result.abilitiesStored} abilities (${result.zetaAbilityCount} zeta, ${result.omicronAbilityCount} omicron) ` +
    `for ${result.catalogVersion}.`,
  );
}

main().catch((error) => {
  console.error(`[catalog-db] ${error?.message || error}`);
  if (!SOFT_FAIL) process.exitCode = 1;
});
