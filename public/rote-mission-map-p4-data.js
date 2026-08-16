const SOURCE_REVISION = "932c5d4d2e7a29b23baa37f759cd1254459a97a2";
const RAW = `https://raw.githubusercontent.com/genskaar/tb_empire/${SOURCE_REVISION}`;

export const ROTE_P4_MISSION_MAP_SOURCE = Object.freeze({
  repository: "https://github.com/genskaar/tb_empire",
  revision: SOURCE_REVISION,
  currentRequirements: "https://swgoh.wiki/wiki/Rise_of_the_Empire/Zone_Information",
  currentRewards: "https://swgoh.gg/territory-battles/t05D/rewards/",
  viewBox: Object.freeze([0, 0, 1000, 667]),
  note: "Haven, Kessel and Lothal use source-pinned planet art and node coordinates. Current Zone 4 R8 gates and special-mission rewards are cross-checked against current SWGOH Wiki / SWGOH.GG. Mandalore is intentionally excluded for its own unlock-zone step.",
});

const node = (id, type, top, left, label, requirement, reward, internal = {}) => Object.freeze({
  id,
  type,
  top,
  left,
  label,
  requirement,
  reward,
  missionId: internal.missionId || "",
  teamId: internal.teamId || "",
  note: internal.note || "",
});

const planet = (id, background, nodes) => Object.freeze({
  id,
  background: `${RAW}/media/planets/${background}`,
  nodes: Object.freeze(nodes),
});

export const ROTE_P4_MISSION_MAPS = Object.freeze({
  haven: planet("haven", "haven.png", [
    node("c1", "combat", 47, 50, "Combat Mission", "5x Dark Side characters at Relic 8+", "219,375 → 493,594 TP"),
    node("c2", "combat", 16, 47, "Combat Mission", "5x Dark Side characters at Relic 8+", "219,375 → 493,594 TP"),
    node("c3", "special", 52, 19, "Inquisitorius + Third Sister", "5x Inquisitorius at Relic 8+ including Third Sister", "20 Mk III Guild Event Tokens", { missionId: "haven-reva", teamId: "rote-reva" }),
    node("c4", "combat", 32, 10, "Combat Mission · Brain Worms", "5x Dark Side characters at Relic 8+", "219,375 → 493,594 TP", { note: "The pinned source identifies this as the harder Brain Worms variant; the app has no dedicated recommendation record, so the node stays source-only." }),
    node("c6", "combat", 24, 25, "Combat Mission", "5x Dark Side characters at Relic 8+", "219,375 → 493,594 TP"),
    node("c7", "deployment", 22, 37, "Deployment", "Territory deployment", "1★ 235,143,105 · 2★ 400,243,583 · 3★ 500,304,479"),
    node("m2", "operations", 22, 61, "Operations", "Characters Relic 8 · Ships 7★", "Supports Haven Operations"),
  ]),

  kessel: planet("kessel", "kessel.png", [
    node("c1", "fleet", 65, 68, "Fleet · Ghost", "7★ ships including Ghost", "987,188 TP"),
    node("c2", "combat", 39, 55, "Combat Mission", "5x characters at Relic 8+", "219,375 → 493,594 TP"),
    node("c3", "special", 60, 30, "Qi'ra + L3-37", "5x characters at Relic 8+ including Qi'ra and L3-37", "20 Mk III Guild Event Tokens", { missionId: "kessel-qira-l3", teamId: "rote-qira-yhan" }),
    node("c4", "combat", 57, 50, "Jabba the Hutt", "5x characters at Relic 8+ including Jabba the Hutt", "219,375 → 493,594 TP", { missionId: "kessel-jabba", teamId: "rote-jabba" }),
    node("c6", "combat", 32, 29, "Combat Mission", "5x characters at Relic 8+", "219,375 → 493,594 TP"),
    node("c7", "deployment", 44, 35, "Deployment", "Territory deployment", "1★ 235,143,105 · 2★ 400,243,583 · 3★ 500,304,479"),
    node("m2", "operations", 28, 48, "Operations", "Characters Relic 8 · Ships 7★", "Supports Kessel Operations"),
  ]),

  lothal: planet("lothal", "lothal.png", [
    node("c1", "combat", 69, 35, "Jedi", "5x Jedi at Relic 8+", "219,375 → 493,594 TP", { missionId: "lothal-jedi", teamId: "rote-jedi" }),
    node("c2", "combat", 26, 49, "Combat Mission", "5x Light Side characters at Relic 8+", "219,375 → 493,594 TP"),
    node("c3", "combat", 63, 21, "Phoenix", "5x Phoenix characters at Relic 8+", "219,375 → 493,594 TP", { missionId: "lothal-phoenix", teamId: "rote-phoenix" }),
    node("c6", "fleet", 28, 18, "Fleet Mission", "7★ Light Side ships", "987,188 TP"),
    node("c7", "deployment", 52, 43, "Deployment", "Territory deployment", "1★ 246,742,558 · 2★ 419,987,333 · 3★ 524,984,167"),
    node("m2", "operations", 47, 27, "Operations", "Characters Relic 8 · Ships 7★", "Supports Lothal, Kafrene and Scarif Operations"),
  ]),
});

export function roteP4MissionMap(planetId) {
  return ROTE_P4_MISSION_MAPS[String(planetId || "")] || null;
}
