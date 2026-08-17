import { readFile } from "node:fs/promises";

const MAX_CHOICES = 25;
const MAX_CHOICE_NAME = 100;
const CATALOG_URL = new URL("./public/data/catalog.json", import.meta.url);
let indexPromise = null;

function clean(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return clean(value).toLowerCase();
}

function trimChoiceName(value) {
  const text = clean(value);
  return text.length <= MAX_CHOICE_NAME ? text : `${text.slice(0, MAX_CHOICE_NAME - 1).trimEnd()}…`;
}

function unitRow(unit = {}) {
  const baseId = clean(unit.baseId).toUpperCase();
  if (!/^[A-Z0-9_:-]{2,80}$/.test(baseId)) return null;
  const name = clean(unit.name || baseId);
  const unitType = clean(unit.unitType || (Number(unit.combatType) === 2 ? "Ship" : "Character"));
  return Object.freeze({
    baseId,
    name,
    unitType,
    searchBaseId: normalize(baseId),
    searchName: normalize(name),
    searchType: normalize(unitType),
  });
}

async function loadIndex() {
  if (indexPromise) return indexPromise;
  indexPromise = readFile(CATALOG_URL, "utf8")
    .then((text) => JSON.parse(text))
    .then((body) => {
      const rows = (Array.isArray(body?.units) ? body.units : [])
        .map(unitRow)
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name) || a.baseId.localeCompare(b.baseId));
      return Object.freeze(rows);
    })
    .catch((error) => {
      indexPromise = null;
      throw error;
    });
  return indexPromise;
}

function matchScore(row, query) {
  if (!query) return 50;
  if (row.searchBaseId === query) return 0;
  if (row.searchName === query) return 1;
  if (row.searchBaseId.startsWith(query)) return 2;
  if (row.searchName.startsWith(query)) return 3;
  if (row.searchBaseId.includes(query)) return 4;
  if (row.searchName.includes(query)) return 5;
  if (row.searchType.startsWith(query)) return 6;
  return null;
}

export async function autocompleteSwgohUnits(input = "", options = {}) {
  const query = normalize(input);
  const limit = Math.max(1, Math.min(MAX_CHOICES, Math.floor(Number(options.limit || MAX_CHOICES))));
  const rows = await loadIndex();
  return rows
    .map((row) => ({ row, score: matchScore(row, query) }))
    .filter((entry) => entry.score !== null)
    .sort((a, b) => a.score - b.score || a.row.name.localeCompare(b.row.name) || a.row.baseId.localeCompare(b.row.baseId))
    .slice(0, limit)
    .map(({ row }) => Object.freeze({
      name: trimChoiceName(`${row.name} · ${row.unitType} · ${row.baseId}`),
      value: row.baseId,
    }));
}

export function resetDiscordUnitAutocompleteCacheForTests() {
  indexPromise = null;
}
