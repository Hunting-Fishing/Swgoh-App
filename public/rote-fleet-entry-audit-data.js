const ALL_SHIP_ALIGNMENTS = Object.freeze(["Light", "Dark", "Neutral"]);
const LIGHT_SHIPS = Object.freeze(["Light"]);
const DARK_SHIPS = Object.freeze(["Dark"]);

const member = (name, baseId) => Object.freeze({ name, baseId });
const rule = (sourceRequirement, allowedAlignments, mandatoryMembers = []) => Object.freeze({
  verified: true,
  unitType: "Ship",
  starsMin: 7,
  allowedAlignments,
  mandatoryMembers: Object.freeze(mandatoryMembers),
  sourceRequirement,
  sourceIds: Object.freeze(["swgoh-wiki-rote-zones", "genskaar-rote"]),
  lastVerified: "2026-08-17",
});

// Fleet-entry legality is kept separate from recommended battle fleets. These are
// the actual mission entry gates cross-checked against the current ROTE zone
// reference and GenSkaar's per-planet requirement records.
export const ROTE_FLEET_ENTRY_AUDIT = Object.freeze({
  "mustafar-fleet": rule("Dark Side Ships (7-Star), Scythe", DARK_SHIPS, [member("Scythe", "SCYTHE")]),
  "corellia-fleet": rule("Lando's Millennium Falcon (7-Star)", ALL_SHIP_ALIGNMENTS, [member("Lando's Millennium Falcon", "MILLENNIUMFALCONPRISTINE")]),
  "coruscant-fleet": rule("Light Side Ships (7-Star), Outrider", LIGHT_SHIPS, [member("Outrider", "OUTRIDER")]),
  "geonosis-fleet": rule("Dark Side Ships (7-Star)", DARK_SHIPS),
  "felucia-fleet": rule("Ships (7-Star)", ALL_SHIP_ALIGNMENTS),
  "bracca-fleet": rule("Light Side Ships (7-Star)", LIGHT_SHIPS),
  "tatooine-fleet": rule("Ships (7-Star), Executor", ALL_SHIP_ALIGNMENTS, [member("Executor", "CAPITALEXECUTOR")]),
  "kashyyyk-fleet": rule("Light Side Ships (7-Star), Profundity", LIGHT_SHIPS, [member("Profundity", "CAPITALPROFUNDITY")]),
  "zeffo-fleet": rule("Light Side Ships (7-Star), Negotiator", LIGHT_SHIPS, [member("Negotiator", "CAPITALNEGOTIATOR")]),
  "kessel-fleet": rule("Ships (7-Star), Ghost", ALL_SHIP_ALIGNMENTS, [member("Ghost", "GHOST")]),
  "lothal-fleet": rule("Light Side Ships (7-Star)", LIGHT_SHIPS),
  "mandalore-fleet": rule("Ships (7-Star), Gauntlet Starfighter", ALL_SHIP_ALIGNMENTS, [member("Gauntlet Starfighter", "GAUNTLETSTARFIGHTER")]),
  "vandor-fleet": rule("Ships (7-Star)", ALL_SHIP_ALIGNMENTS),
  "kafrene-fleet": rule("Light Side Ships (7-Star)", LIGHT_SHIPS),
  "death-star-fleet": rule("Dark Side Ships (7-Star), Imperial TIE Fighter", DARK_SHIPS, [member("Imperial TIE Fighter", "TIEFIGHTERIMPERIAL")]),
  "hoth-fleet": rule("Ships (7-Star)", ALL_SHIP_ALIGNMENTS),
  "scarif-fleet": rule("Light Side Ships (7-Star), Profundity", LIGHT_SHIPS, [member("Profundity", "CAPITALPROFUNDITY")]),
});

export const ROTE_FLEET_ENTRY_AUDIT_COUNT = Object.keys(ROTE_FLEET_ENTRY_AUDIT).length;

export function roteFleetEntryAudit(missionId) {
  return ROTE_FLEET_ENTRY_AUDIT[String(missionId || "")] || null;
}
