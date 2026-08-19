import "./gac-round-readiness.js";
import "./gac-verified-battle-ui.js";
import { parseMechanics } from "./gac-datacron-mechanics.js";

function injectStyles() {
  if (!document.querySelector('link[data-gac-round-readiness="true"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/gac-round-readiness.css?v=20260819-gacready1";
    link.dataset.gacRoundReadiness = "true";
    document.head.append(link);
  }
  if (document.querySelector('style[data-gac-datacron-mechanics="true"]')) return;
  const style = document.createElement("style");
  style.dataset.gacDatacronMechanics = "true";
  style.textContent = `
    .gac-datacron-mechanics-row { display:flex; flex-wrap:wrap; gap:.24rem; margin-top:.34rem; }
    .gac-datacron-mechanic-chip { border:1px solid rgba(102,194,255,.2); border-radius:999px; padding:.18rem .34rem; background:rgba(40,105,146,.12); color:#9bcdec; font-size:.52rem; cursor:help; }
    .gac-datacron-mechanics-note { margin-top:.28rem; color:#68768c; font-size:.52rem; }
  `;
  document.head.append(style);
}

function escapeAttr(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function enhanceAbilityDetail(detail) {
  if (!(detail instanceof Element) || detail.dataset.mechanicsParsed === "true") return;
  detail.dataset.mechanicsParsed = "true";
  if (!detail.classList.contains("is-resolved")) return;
  const paragraph = detail.querySelector("p");
  const description = paragraph?.textContent?.trim() || "";
  const parsed = parseMechanics(description);
  if (!parsed.known || !parsed.signals.length) return;

  const row = document.createElement("div");
  row.className = "gac-datacron-mechanics-row";
  row.innerHTML = parsed.signals.slice(0, 8).map((signal) =>
    `<span class="gac-datacron-mechanic-chip" title="${escapeAttr(signal.sentence || signal.evidence)}">${escapeAttr(signal.label)}</span>`
  ).join("");
  detail.append(row);

  const note = document.createElement("div");
  note.className = "gac-datacron-mechanics-note";
  note.textContent = "Mechanic labels are extracted from the official localized sentence for explanation only; they are not a hidden strength score.";
  detail.append(note);
}

function enhanceAll() {
  injectStyles();
  document.querySelectorAll(".gac-datacron-ability-detail").forEach(enhanceAbilityDetail);
}

enhanceAll();
document.addEventListener("DOMContentLoaded", enhanceAll, { once: true });
new MutationObserver(enhanceAll).observe(document.documentElement, { childList: true, subtree: true });
