import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync(new URL("../public/rote-slot-presentation.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../public/rote-slot-presentation.css", import.meta.url), "utf8");
const bridge = fs.readFileSync(new URL("../public/rote-squad-bridge.js", import.meta.url), "utf8");

assert.match(ui, /ELIGIBLE FLEX UNITS/);
assert.match(ui, /FIXED MISSION SQUAD/);
assert.match(ui, /No other roster units are selectable/);
assert.match(ui, /Required units are shown above and removed from this filler pool/);
assert.match(ui, /FLEX SLOTS/);
assert.match(ui, /dataTbFlexToggle|tbFlexToggle/);
assert.match(ui, /model\.fixedSquad/);
assert.match(ui, /model\.flexCandidates\.length/);
assert.match(css, /rote-slot-pool-toggle/);
assert.match(css, /\[hidden\]/);
assert.match(bridge, /rote-slot-presentation\.js\?v=20260816-slots1/);

console.log("ROTE slot presentation wiring checks passed");
