const ZONES = Object.freeze([
  Object.freeze({ value: "FRONT-TOP", label: "Front Top" }),
  Object.freeze({ value: "FRONT-BOTTOM", label: "Front Bottom" }),
  Object.freeze({ value: "BACK-TOP", label: "Back Top" }),
  Object.freeze({ value: "BACK-BOTTOM", label: "Back Bottom" }),
]);

function clean(value) { return String(value ?? "").trim(); }
function normalizeZone(value) {
  const zone = clean(value).toUpperCase();
  return ZONES.some((entry) => entry.value === zone) ? zone : "";
}
function backendSlotFromDisplay(value) {
  if (value === null || value === undefined || value === "") return null;
  const display = Number(value);
  if (!Number.isInteger(display) || display < 1 || display > 100) return null;
  return display - 1;
}
function displaySlotFromBackend(value) {
  if (value === null || value === undefined || value === "") return "";
  const backend = Number(value);
  return Number.isInteger(backend) && backend >= 0 && backend <= 99 ? String(backend + 1) : "";
}
function readBoardPosition(zoneInput, displaySlotInput) {
  const rawZone = clean(zoneInput);
  const rawSlot = clean(displaySlotInput);
  const specified = Boolean(rawZone || rawSlot);
  if (!specified) return Object.freeze({ specified: false, complete: true, zone: "", slot: null, displaySlot: "" });
  const zone = normalizeZone(rawZone);
  const slot = backendSlotFromDisplay(rawSlot);
  const complete = Boolean(zone) && slot !== null;
  return Object.freeze({ specified: true, complete, zone, slot, displaySlot: complete ? String(slot + 1) : rawSlot });
}
function zoneLabel(value) {
  const zone = normalizeZone(value);
  return ZONES.find((entry) => entry.value === zone)?.label || clean(value);
}

export { ZONES, backendSlotFromDisplay, displaySlotFromBackend, normalizeZone, readBoardPosition, zoneLabel };
