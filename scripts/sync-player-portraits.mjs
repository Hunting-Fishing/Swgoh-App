import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE = String(process.env.SWGOH_GAMEDATA_BASE_URL || 'https://raw.githubusercontent.com/swgoh-utils/gamedata/main').replace(/\/+$/, '');
const ASSET_BASE = String(process.env.SWGOH_PLAYER_PORTRAIT_ASSET_BASE_URL || 'https://game-assets.swgoh.gg').replace(/\/+$/, '');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const OUTPUT_PATH = path.join(DATA_DIR, 'player-portraits.json');
const TIMEOUT_MS = Number(process.env.SWGOH_STATIC_SYNC_TIMEOUT_MS || 60_000);
const ALLOW_STALE = process.argv.includes('--allow-stale');
const SCHEMA_VERSION = 1;

const asArray = (value) => Array.isArray(value) ? value : [];
const clean = (value) => String(value ?? '').trim();

function normalizePortrait(row = {}) {
  const id = clean(row.id || row.portraitId || row.definitionId);
  const icon = clean(row.icon || row.texture || row.thumbnailName);
  if (!/^PLAYERPORTRAIT_[A-Z0-9_]+$/i.test(id) || !/^tex\.[a-z0-9_.-]+$/i.test(icon)) return null;
  return Object.freeze({
    id,
    icon,
    image: `${ASSET_BASE}/${encodeURIComponent(icon)}.png`,
    obtainable: row.obtainable === true,
    hidden: row.hidden === true,
  });
}

async function requestJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'SWGOH-Command-Center (static-player-portraits)' },
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function usablePortraitRegistry(body = {}) {
  const portraits = asArray(body?.portraits).map(normalizePortrait).filter(Boolean);
  const declaredCount = Number(body?.count);
  const countMatches = !Number.isFinite(declaredCount) || declaredCount === portraits.length;
  return portraits.length > 0 && countMatches;
}

async function stalePortraitRegistryUsable(filePath = OUTPUT_PATH) {
  try {
    const body = JSON.parse(await readFile(filePath, 'utf8'));
    return usablePortraitRegistry(body);
  } catch {
    return false;
  }
}

async function syncPlayerPortraits() {
  await mkdir(DATA_DIR, { recursive: true });
  const payload = await requestJson(`${SOURCE}/playerPortrait.json`);
  const portraits = asArray(payload?.data || payload)
    .map(normalizePortrait)
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!portraits.length) throw new Error('Player portrait game data normalized to zero entries.');

  const body = {
    schemaVersion: SCHEMA_VERSION,
    version: clean(payload?.version),
    generatedAt: new Date().toISOString(),
    assetBase: ASSET_BASE,
    source: 'swgoh-utils/gamedata:playerPortrait.json',
    count: portraits.length,
    portraits,
  };
  await writeFile(OUTPUT_PATH, `${JSON.stringify(body)}\n`, 'utf8');
  console.log(`[player-portraits] wrote ${portraits.length} portrait definitions`);
  return body;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  syncPlayerPortraits().catch(async (error) => {
    if (ALLOW_STALE && await stalePortraitRegistryUsable(OUTPUT_PATH)) {
      console.warn(`[player-portraits] refresh failed; serving validated non-empty existing registry: ${error?.message || error}`);
      return;
    }
    console.error(`[player-portraits] ${error?.stack || error}`);
    process.exitCode = 1;
  });
}

export {
  ASSET_BASE,
  OUTPUT_PATH,
  SCHEMA_VERSION,
  normalizePortrait,
  stalePortraitRegistryUsable,
  syncPlayerPortraits,
  usablePortraitRegistry,
};
