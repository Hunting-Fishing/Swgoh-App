export const RELIC_TIER_COSTS = Object.freeze({
  1: { Credits: 10000, CCB: 40 },
  2: { Credits: 25000, CCB: 30, BW: 40, FSD: 15 },
  3: { Credits: 50000, CCB: 30, BW: 40, CT: 20, FSD: 20, ISD: 15 },
  4: { Credits: 75000, CCB: 30, BW: 40, CT: 40, FSD: 20, ISD: 25 },
  5: { Credits: 100000, CCB: 30, BW: 40, CT: 30, AH: 20, FSD: 20, ISD: 25, FLSD: 15 },
  6: { Credits: 250000, CCB: 20, BW: 30, CT: 30, AH: 20, EC: 20, FSD: 20, ISD: 25, FLSD: 25 },
  7: { Credits: 500000, CCB: 20, BW: 30, CT: 20, AH: 20, EC: 20, ZC: 10, FSD: 20, ISD: 25, FLSD: 35 },
  8: { Credits: 1000000, CT: 20, AH: 20, EC: 20, ZC: 20, ID: 20, AM: 20, FSD: 20, ISD: 25, FLSD: 45 },
  9: { Credits: 1500000, EC: 20, ZC: 20, ID: 20, AM: 20, GK: 20, DB: 20, ISD: 30, FLSD: 55 },
  10: { Credits: 2000000, ID: 20, AM: 20, GK: 20, DB: 20, CS: 20, ISD: 25, FLSD: 45, CSD: 15 },
});

export const RELIC_MATERIALS = Object.freeze({
  Credits: { name: "Credits", category: "currency", source: "Credit Heist, challenges, events and campaign rewards", route: "Events / Challenges" },
  CCB: { name: "Carbonite Circuit Board", category: "scrap", source: "Scavenger — convert eligible low-tier gear into relic scrap", route: "Cantina → Scavenger" },
  BW: { name: "Bronzium Wiring", category: "scrap", source: "Scavenger — convert eligible gear into relic scrap", route: "Cantina → Scavenger" },
  CT: { name: "Chromium Transistor", category: "scrap", source: "Scavenger — convert eligible gear into relic scrap", route: "Cantina → Scavenger" },
  AH: { name: "Aurodium Heatsink", category: "scrap", source: "Scavenger — convert eligible gear into relic scrap", route: "Cantina → Scavenger" },
  EC: { name: "Electrium Conductor", category: "scrap", source: "Scavenger — convert eligible higher-tier gear into relic scrap; also appears in stores/events", route: "Cantina → Scavenger" },
  ZC: { name: "Zinbiddle Card", category: "scrap", source: "Scavenger — convert eligible higher-tier gear into relic scrap; also appears in stores/events", route: "Cantina → Scavenger" },
  ID: { name: "Impulse Detector", category: "scrap", source: "Scavenger — convert eligible high-tier gear into relic scrap; also available from selected stores/events", route: "Cantina → Scavenger" },
  AM: { name: "Aeromagnifier", category: "scrap", source: "Scavenger plus selected high-end event/store rewards", route: "Cantina → Scavenger" },
  GK: { name: "Gyrda Keypad", category: "scrap", source: "Scavenger — convert eligible high-tier gear into relic scrap; also selected stores/events", route: "Cantina → Scavenger" },
  DB: { name: "Droid Brain", category: "scrap", source: "Scavenger and selected high-end guild/event/store rewards", route: "Cantina → Scavenger" },
  CS: { name: "Coaxial Servomotor", category: "scrap", source: "R10 relic material from high-end game sources / Scavenger ecosystem", route: "Relic / high-end rewards" },
  FSD: { name: "Fragmented Signal Data", category: "signal", source: "Cantina Battles 8-C; newer Stage 9 nodes can also include mixed Signal Data", route: "Cantina Battles 8-C" },
  ISD: { name: "Incomplete Signal Data", category: "signal", source: "Cantina Battles 8-F; newer Stage 9 nodes can also include mixed Signal Data", route: "Cantina Battles 8-F" },
  FLSD: { name: "Flawed Signal Data", category: "signal", source: "Cantina Battles 8-G; newer Stage 9 nodes can also include mixed Signal Data", route: "Cantina Battles 8-G" },
  CSD: { name: "Corrupted Signal Data", category: "signal", source: "R10 Signal Data from the newer Cantina Stage 9 / high-end relic progression sources", route: "Cantina Stage 9" },
});

function boundedRelic(value) {
  return Math.max(0, Math.min(10, Math.floor(Number(value) || 0)));
}

export function relicMaterialsBetween(currentRelic, targetRelic) {
  const from = boundedRelic(currentRelic);
  const to = boundedRelic(targetRelic);
  const totals = {};
  const tiers = [];

  if (to <= from) {
    return { from, to, levelsRemaining: 0, tiers, totals, materials: [] };
  }

  for (let tier = from + 1; tier <= to; tier += 1) {
    tiers.push(tier);
    for (const [materialId, quantity] of Object.entries(RELIC_TIER_COSTS[tier] || {})) {
      totals[materialId] = (totals[materialId] || 0) + Number(quantity || 0);
    }
  }

  const order = ["Credits", "FSD", "ISD", "FLSD", "CSD", "CCB", "BW", "CT", "AH", "EC", "ZC", "ID", "AM", "GK", "DB", "CS"];
  const materials = order
    .filter((id) => Number(totals[id] || 0) > 0)
    .map((id) => ({ id, quantity: totals[id], ...(RELIC_MATERIALS[id] || { name: id, category: "other", source: "Source not mapped", route: "" }) }));

  return { from, to, levelsRemaining: to - from, tiers, totals, materials };
}

export function gearGap(currentGear, targetGear) {
  const from = Math.max(0, Math.min(13, Math.floor(Number(currentGear) || 0)));
  const to = Math.max(0, Math.min(13, Math.floor(Number(targetGear) || 0)));
  return {
    from,
    to,
    tiersRemaining: Math.max(0, to - from),
    complete: from >= to,
    tiers: from >= to ? [] : Array.from({ length: to - from }, (_, index) => from + index + 1),
  };
}
