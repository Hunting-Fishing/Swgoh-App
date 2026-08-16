const ROTE_MEDIA = "https://raw.githubusercontent.com/genskaar/tb_empire/main/media";
const GEO_MEDIA = "https://raw.githubusercontent.com/genskaar/tb_geo/master/media";

export const TB_VISUAL_SOURCES = Object.freeze({
  rote: Object.freeze({
    label: "GenSkaar · Rise of the Empire interactive map",
    repository: "https://github.com/genskaar/tb_empire",
  }),
  geo: Object.freeze({
    label: "GenSkaar · Geonosis interactive maps",
    repository: "https://github.com/genskaar/tb_geo",
  }),
  hoth: Object.freeze({
    label: "SWGOH Wiki · Hoth Territory Battle zone maps",
    repository: "https://swgoh.wiki/wiki/Territory_Battle",
  }),
});

export const ROTE_VISUAL_ASSETS = Object.freeze({
  map: `${ROTE_MEDIA}/map_rote_lines.jpeg`,
  mapFallback: `${ROTE_MEDIA}/map_rote.png`,
  starfield: `${ROTE_MEDIA}/starfield_bg.png`,
  planets: Object.freeze({
    mustafar: `${ROTE_MEDIA}/planet_mustafar.png`,
    corellia: `${ROTE_MEDIA}/planet_corellia.png`,
    coruscant: `${ROTE_MEDIA}/planet_coruscant.png`,
    geonosis: `${ROTE_MEDIA}/planet_geonosis.png`,
    felucia: `${ROTE_MEDIA}/planet_felucia.png`,
    bracca: `${ROTE_MEDIA}/planet_bracca.png`,
    dathomir: `${ROTE_MEDIA}/planet_dathomir.png`,
    tatooine: `${ROTE_MEDIA}/planet_tatooine.png`,
    kashyyyk: `${ROTE_MEDIA}/planet_kashyyyk.png`,
    haven: `${ROTE_MEDIA}/planet_haven.png`,
    kessel: `${ROTE_MEDIA}/planet_kessel.png`,
    lothal: `${ROTE_MEDIA}/planet_lothal.png`,
    malachor: `${ROTE_MEDIA}/planet_malachor.png`,
    vandor: `${ROTE_MEDIA}/planet_vandor.png`,
    kafrene: `${ROTE_MEDIA}/planet_kafrene.png`,
    "death-star": `${ROTE_MEDIA}/planet_deathstar.png`,
    hoth: `${ROTE_MEDIA}/planet_hoth.png`,
    scarif: `${ROTE_MEDIA}/planet_scarif.png`,
    zeffo: `${ROTE_MEDIA}/planet_zeffo.png`,
    mandalore: `${ROTE_MEDIA}/planet_mandalore.png`,
  }),
});

export const TB_MISSION_VISUAL_ASSETS = Object.freeze({
  combat: `${ROTE_MEDIA}/mission_usual.png`,
  fleet: `${ROTE_MEDIA}/mission_fleet.png`,
  special: `${ROTE_MEDIA}/mission_special.png`,
  operations: `${ROTE_MEDIA}/mission_platoon.png`,
  deployment: `${ROTE_MEDIA}/mission_deploy.png`,
  reva: `${ROTE_MEDIA}/mission_reva.png`,
  kam: `${ROTE_MEDIA}/mission_KAM.svg`,
  wat: `${ROTE_MEDIA}/mission_WT.svg`,
});

export const TB_CAMPAIGN_MAP_ASSETS = Object.freeze({
  "geo-separatist": `${GEO_MEDIA}/map_dark.jpg`,
  "geo-republic": `${GEO_MEDIA}/map.jpg`,
  "hoth-rebel": "https://swgoh.wiki/images/thumb/d/df/Territory_Battle-Rebel_Assault_Zones.png/800px-Territory_Battle-Rebel_Assault_Zones.png",
  "hoth-imperial": "https://swgoh.wiki/images/thumb/b/b5/Territory_Battle-Imperial_Retaliation_Zones.png/800px-Territory_Battle-Imperial_Retaliation_Zones.png",
});

export const TB_CAMPAIGN_MATCHERS = Object.freeze([
  Object.freeze({ id: "geo-separatist", fragments: Object.freeze(["SEPARATIST MIGHT", "GEO DS"]) }),
  Object.freeze({ id: "geo-republic", fragments: Object.freeze(["REPUBLIC OFFENSIVE", "GEO LS"]) }),
  Object.freeze({ id: "hoth-rebel", fragments: Object.freeze(["REBEL ASSAULT", "HOTH LS"]) }),
  Object.freeze({ id: "hoth-imperial", fragments: Object.freeze(["IMPERIAL RETALIATION", "HOTH DS"]) }),
]);

export function missionVisualKind(label = "", explicitType = "") {
  const type = String(explicitType || "").toLowerCase();
  if (type === "fleet") return "fleet";
  if (type === "special") return "special";
  if (type === "combat") return "combat";
  if (type === "platoon" || type === "operations" || type === "operation") return "operations";
  if (type === "deployment" || type === "deploy") return "deployment";

  const text = String(label || "").toLowerCase();
  if (/\b(fleet|ships?)\b/.test(text)) return "fleet";
  if (/\breva\b/.test(text)) return "reva";
  if (/\bki[- ]?adi[- ]?mundi\b|\bkam\b/.test(text)) return "kam";
  if (/\bwat\b/.test(text)) return "wat";
  if (/\b(unlock|special mission)\b/.test(text)) return "special";
  return "combat";
}
