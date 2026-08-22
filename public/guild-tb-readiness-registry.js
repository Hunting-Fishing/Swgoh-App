export const GUILD_TB_READINESS_MISSIONS = Object.freeze([
  Object.freeze({
    id: "zeffo",
    label: "Zeffo",
    shortLabel: "Zeffo",
    title: "Bracca / Zeffo Unlock",
    kicker: "ROTE · BRACCA SPECIAL MISSION",
    status: "live",
    description: "Cere Junda R7+ with either Jedi Knight Cal Kestis R7+ or Cal Kestis R7+. JKCK is the preferred officer route.",
    target: 30,
  }),
  Object.freeze({
    id: "mandalore",
    label: "Mandalore",
    shortLabel: "Mandalore",
    title: "Mandalore Readiness",
    kicker: "TB READINESS",
    status: "planned",
    description: "Mission requirements will be encoded from verified game data before this tab becomes active.",
  }),
  Object.freeze({
    id: "reva",
    label: "Reva",
    shortLabel: "Reva",
    title: "Reva Readiness",
    kicker: "TB READINESS",
    status: "planned",
    description: "Mission requirements will be encoded from verified game data before this tab becomes active.",
  }),
  Object.freeze({
    id: "wat",
    label: "Wat Tambor",
    shortLabel: "Wat",
    title: "Wat Tambor Readiness",
    kicker: "TB READINESS",
    status: "planned",
    description: "Mission requirements will be encoded from verified game data before this tab becomes active.",
  }),
]);

export function getGuildTbReadinessMission(id = "zeffo") {
  const normalized = String(id || "zeffo").trim().toLowerCase();
  return GUILD_TB_READINESS_MISSIONS.find((mission) => mission.id === normalized)
    || GUILD_TB_READINESS_MISSIONS[0];
}

export function liveGuildTbReadinessMissions() {
  return Object.freeze(GUILD_TB_READINESS_MISSIONS.filter((mission) => mission.status === "live"));
}
