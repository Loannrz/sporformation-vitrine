/**
 * Applique le contenu dynamique (mini-CMS) sur les pages publiques.
 *
 * Charge une seule fois `/api/public/site-content` au boot, puis :
 *   • patche les FORMATION_META à la volée (déjà rendues par formation-city-detail)
 *   • remplace les prix TEP (#tep-pricing, #methode-details)
 *   • remplace les étapes méthode TEP (data-tep-method-grid)
 *   • remplace le bloc « Emploi & débouchés » de a-propos.html
 *   • injecte la grille de partenaires
 *   • injecte les blocs "Documents et liens utiles" (data-docs-zone)
 *
 * Stratégie : si l'API est indisponible, on ne casse rien — les valeurs HTML
 * statiques restent en place.
 */

import {
  RESULTS_INDICATORS_CLE,
  parseResultsIndicators,
} from "./results-indicators.js";

const PAYLOAD_URL = "/api/public/site-content";
let cachedPayload = null;

async function fetchPayload() {
  if (cachedPayload) return cachedPayload;
  try {
    const res = await fetch(PAYLOAD_URL, { credentials: "omit" });
    if (!res.ok) return null;
    cachedPayload = await res.json();
    return cachedPayload;
  } catch (_e) {
    return null;
  }
}

// Format helpers
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
function formatHumanDate(iso) {
  if (!iso) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim())) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  return dateFmt.format(new Date(Date.UTC(y, m - 1, d)));
}
function todayIso() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function findFormationSheet(slug, ville) {
  const key = `${slug}|${ville}`;
  for (const art of document.querySelectorAll("[data-formation-detail-sheet]")) {
    if (art.getAttribute("data-formation-detail-sheet") === key) return art;
  }
  return null;
}

/** Met à jour le bloc « Indicateurs de résultats » dans la fiche courante. */
function applyResultsIndicatorsDom(sheet, data) {
  const statBlock = sheet.querySelector(".formation-detail-sheet__stat");
  if (statBlock) {
    const strongEl = statBlock.querySelector(".formation-detail-sheet__stat-caption strong");
    const spanEl = statBlock.querySelector(".formation-detail-sheet__stat-caption span");
    if (strongEl && data.heroTitle) strongEl.textContent = data.heroTitle;
    if (spanEl) spanEl.textContent = data.heroNote || "";
  }

  const wrap = sheet.querySelector(".formation-detail-sheet__table-wrap");
  const table = wrap?.querySelector("table");
  if (!table || !Array.isArray(data.columns) || !Array.isArray(data.rows)) return;

  const theadRow = table.querySelector("thead tr");
  const tbody = table.querySelector("tbody");
  if (!theadRow || !tbody) return;

  theadRow.innerHTML = "";
  for (const col of data.columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = col;
    theadRow.appendChild(th);
  }

  tbody.innerHTML = "";
  const dataCols = Math.max(1, data.columns.length - 1);
  for (const row of data.rows) {
    const tr = document.createElement("tr");
    const tdLabel = document.createElement("td");
    tdLabel.textContent = row.label || "";
    tr.appendChild(tdLabel);
    const cells = Array.isArray(row.cells) ? row.cells : [];
    for (let i = 0; i < dataCols; i++) {
      const td = document.createElement("td");
      const raw = String(cells[i] ?? "").trim();
      const strong = document.createElement("strong");
      strong.textContent = raw || "\u00a0";
      td.appendChild(strong);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  const section = wrap.closest("section") || sheet;
  const foot = section.querySelector(".formation-detail-sheet__footnote");
  if (foot && data.footnote != null && String(data.footnote).trim()) {
    foot.textContent = data.footnote.trim();
  }
}

// ── Formations : injecter dans #data-formation-summary-* + gérer CTA ─────────
function applyFormationOverrides(overrides) {
  if (!overrides?.length && !document.querySelector("[data-formation-detail-page]")) return;
  if (!document.querySelector("[data-formation-detail-page]")) return;

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("f")?.trim();
  const ville = params.get("v")?.trim();
  if (!slug || !ville) return;

  const items = (overrides || []).filter(
    (o) => o.slug === slug && o.ville === ville
  );

  const byCle = {};
  for (const it of items) byCle[it.cle] = it.valeur;

  const setText = (selector, value) => {
    const el = document.querySelector(selector);
    if (el && value && String(value).trim()) el.textContent = value;
  };

  // Dates : prio à ISO si présente, sinon texte humain hérité
  const deadlineHuman = byCle.deadline_iso
    ? formatHumanDate(byCle.deadline_iso)
    : byCle.deadline;
  const sessionHuman = byCle.session_iso
    ? formatHumanDate(byCle.session_iso)
    : byCle.session;
  if (deadlineHuman) setText("[data-formation-summary-deadline]", deadlineHuman);
  if (sessionHuman) setText("[data-formation-summary-session]", sessionHuman);
  if (byCle.duration) setText("[data-formation-summary-duration]", byCle.duration);

  if (byCle.success_rate) {
    const stat = document.querySelector("[data-formation-summary-stat]");
    const wrap = document.querySelector("[data-formation-summary-stat-wrap]");
    if (stat) stat.textContent = byCle.success_rate;
    if (wrap) wrap.hidden = false;
  }
  if (byCle.summary_stat_label) {
    setText("[data-formation-summary-stat-label]", byCle.summary_stat_label);
  }

  // Indicateurs détaillés
  const fields = [
    ["effectif_actuel", "[data-formation-stat-effectif]"],
    ["taux_apprentis", "[data-formation-stat-apprentis]"],
    ["taux_interruption", "[data-formation-stat-interruption]"],
    ["taux_rupture", "[data-formation-stat-rupture]"],
    ["satisfaction", "[data-formation-stat-satisfaction]"],
  ];
  for (const [cle, sel] of fields) {
    if (byCle[cle]) setText(sel, byCle[cle]);
  }

  const sheet = findFormationSheet(slug, ville);
  if (sheet) {
    // Grand % du bloc « Indicateurs de résultats » = même valeur que la colonne de droite (sidebar)
    if (byCle.success_rate) {
      const heroVal = sheet.querySelector(
        ".formation-detail-sheet__stat .formation-detail-sheet__stat-value"
      );
      if (heroVal) heroVal.textContent = String(byCle.success_rate).trim();
    }
    if (byCle[RESULTS_INDICATORS_CLE]) {
      const parsed = parseResultsIndicators(byCle[RESULTS_INDICATORS_CLE]);
      applyResultsIndicatorsDom(sheet, parsed);
    }
    // Légende sous le % (admin) : même texte que la sidebar + ligne sous le grand % en bas de fiche
    if (byCle.summary_stat_label && String(byCle.summary_stat_label).trim()) {
      const legend = String(byCle.summary_stat_label).trim();
      const captionSpan = sheet.querySelector(
        ".formation-detail-sheet__stat .formation-detail-sheet__stat-caption > span"
      );
      if (captionSpan) captionSpan.textContent = legend;
    }
  }

  // ── CTA (sidebar) : auto-grisé si deadline_iso passée, ou masqué via toggle
  applyCtaState(byCle);
}

function applyCtaState(byCle) {
  const cta = document.querySelector("[data-formation-summary-cta]");
  if (!cta) return;
  const defaultLabel = cta.dataset.ctaDefaultLabel || "Démarrer mon inscription";
  const defaultHref = cta.getAttribute("href") || "contact.html";
  cta.dataset.ctaDefaultHref = cta.dataset.ctaDefaultHref || defaultHref;

  // Reset
  cta.classList.remove("formation-summary__cta--disabled");
  cta.removeAttribute("aria-disabled");
  cta.style.pointerEvents = "";
  cta.style.opacity = "";
  cta.setAttribute("href", cta.dataset.ctaDefaultHref);
  cta.textContent = defaultLabel;
  cta.hidden = false;

  // Toggle désactivé → bouton visible mais gris, sans lien (comme « inscriptions fermées »)
  const hiddenIntent = (() => {
    const v = String(byCle.inscription_visible ?? "").trim().toLowerCase();
    return v === "0" || v === "false";
  })();
  if (hiddenIntent) {
    cta.hidden = false;
    cta.textContent = "Inscriptions fermées";
    cta.classList.add("formation-summary__cta--disabled");
    cta.setAttribute("aria-disabled", "true");
    cta.removeAttribute("href");
    cta.style.pointerEvents = "none";
    cta.style.opacity = "";
    return;
  }

  // Date limite dépassée → même rendu désactivé
  const iso = byCle.deadline_iso;
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) && iso < todayIso()) {
    cta.textContent = "Inscriptions fermées";
    cta.classList.add("formation-summary__cta--disabled");
    cta.setAttribute("aria-disabled", "true");
    cta.removeAttribute("href");
    cta.style.pointerEvents = "none";
    cta.style.opacity = "";
  }
}

// ── TEP : prix + étapes ─────────────────────────────────────────────────────
function applyTepPricing(settings) {
  if (!settings) return;
  const cards = document.querySelectorAll(".tep-pricing__card");
  if (!cards.length) return;

  // L'ordre des cartes dans tep.html : [0] = inscription seule, [1] = préparation
  const p1 = settings.tep_prix_inscription_seule;
  const p2 = settings.tep_prix_preparation;

  if (cards[0] && p1) {
    const badge = cards[0].querySelector(".tep-pricing__badge");
    const amount = cards[0].querySelector(".tep-pricing__amount");
    const unit = cards[0].querySelector(".tep-pricing__unit");
    if (badge && p1.libelle) badge.textContent = p1.libelle;
    if (amount && Number.isFinite(p1.montant)) {
      amount.innerHTML = `${p1.montant}&nbsp;${p1.devise || "€"}`;
    }
    if (unit && p1.unite) unit.textContent = p1.unite;
  }
  if (cards[1] && p2) {
    const badge = cards[1].querySelector(".tep-pricing__badge");
    const amount = cards[1].querySelector(".tep-pricing__amount");
    const unit = cards[1].querySelector(".tep-pricing__unit");
    if (badge && p2.libelle) badge.textContent = p2.libelle;
    if (amount && Number.isFinite(p2.montant)) {
      amount.innerHTML = `${p2.montant}&nbsp;${p2.devise || "€"}`;
    }
    if (unit && p2.unite) unit.textContent = p2.unite;
  }
}

function applyTepEtapes(etapes) {
  if (!etapes?.length) return;
  const host = document.querySelector("[data-tep-method-grid]");
  if (!host) return;
  // Adapter grid--N selon le nombre
  host.classList.remove("grid--3", "grid--4", "grid--2");
  const cols = Math.max(2, Math.min(4, etapes.length));
  host.classList.add(`grid--${cols}`);
  host.innerHTML = "";
  for (const e of etapes) {
    const accentStyle = e.accent
      ? "border:2px solid #F94144;background:rgba(249,65,68,0.07);"
      : "";
    const article = document.createElement("article");
    article.className = "info-card tep-method-card reveal";
    if (accentStyle) article.setAttribute("style", accentStyle);
    if (e.badge) {
      const eyebrow = document.createElement("span");
      eyebrow.className = "eyebrow tep-method-card__label";
      eyebrow.textContent = e.badge;
      article.appendChild(eyebrow);
    }
    const h3 = document.createElement("h3");
    h3.textContent = e.titre;
    article.appendChild(h3);
    const p = document.createElement("p");
    p.textContent = e.description;
    article.appendChild(p);
    host.appendChild(article);
  }
}

// ── À propos : bloc Emploi & débouchés ─────────────────────────────────────
function applyAproposEmploi(settings) {
  const v = settings?.a_propos_emploi_debouches;
  if (!v) return;
  const block = document.querySelector("[data-stat-emploi-debouches]");
  if (!block) return;
  const valEl = block.querySelector(".stat-card__value");
  const titreEl = block.querySelector("h3");
  const descEl = block.querySelector("p");
  if (valEl && v.valeur) valEl.textContent = v.valeur;
  if (titreEl && v.titre) titreEl.textContent = v.titre;
  if (descEl && v.description) descEl.textContent = v.description;
}

// ── Partenaires : remplace la grille statique ───────────────────────────────
function applyPartenaires(partenaires) {
  const host = document.querySelector("[data-partenaires-grid]");
  if (!host) return;
  if (!partenaires?.length) return;
  host.innerHTML = "";
  for (const p of partenaires) {
    const card = document.createElement("div");
    card.className = "partner-card reveal";
    const fallbackName = () => {
      const span = document.createElement("span");
      span.className = "partner-card__fallback-name";
      span.textContent = p.nom || "Partenaire";
      span.style.textTransform = "none";
      span.style.letterSpacing = "normal";
      span.style.fontWeight = "600";
      span.style.fontSize = "0.95rem";
      span.style.color = "var(--color-text, #1a1a2e)";
      card.appendChild(span);
    };

    if (p.logo_url) {
      const link = p.lien
        ? Object.assign(document.createElement("a"), {
            href: p.lien,
            target: "_blank",
            rel: "noopener",
          })
        : null;
      const img = document.createElement("img");
      img.src = p.logo_url;
      img.alt = p.nom || "";
      img.loading = "lazy";
      img.decoding = "async";
      img.style.maxWidth = "100%";
      img.style.maxHeight = "60px";
      img.style.objectFit = "contain";
      img.addEventListener("error", () => {
        img.remove();
        if (link && link.parentNode === card) link.remove();
        fallbackName();
      });
      if (link) {
        link.appendChild(img);
        card.appendChild(link);
      } else {
        card.appendChild(img);
      }
    } else {
      fallbackName();
    }
    host.appendChild(card);
  }
}

// ── Documents & liens utiles : insère sur les zones marquées ───────────────
function applyDocumentZones(documents) {
  if (!documents?.length) return;
  const zones = document.querySelectorAll("[data-docs-zone]");
  if (!zones.length) return;

  for (const zone of zones) {
    const scope = zone.dataset.docsScope || "";
    const scopeKey = zone.dataset.docsScopeKey || "";
    const docs = documents.filter((d) => {
      if (scope && d.scope !== scope) return false;
      if (scopeKey && d.scope_key !== scopeKey) return false;
      if (!scopeKey && d.scope_key) return false;
      return true;
    });
    if (!docs.length) continue;
    const grid = document.createElement("div");
    grid.className = "formation-detail-sheet__links-grid";
    for (const d of docs) {
      const a = document.createElement("a");
      a.className = "btn btn--outline";
      a.href = d.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = d.label;
      grid.appendChild(a);
    }
    zone.innerHTML = "";
    zone.appendChild(grid);
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
export async function initDynamicContent() {
  const payload = await fetchPayload();
  if (!payload) return;
  try {
    applyFormationOverrides(payload.formation_overrides);
  } catch (e) {
    console.warn("[dynamic] formation overrides", e);
  }
  try {
    applyTepPricing(payload.settings);
  } catch (e) {
    console.warn("[dynamic] TEP pricing", e);
  }
  try {
    applyTepEtapes(payload.tep_etapes);
  } catch (e) {
    console.warn("[dynamic] TEP etapes", e);
  }
  try {
    applyAproposEmploi(payload.settings);
  } catch (e) {
    console.warn("[dynamic] A propos", e);
  }
  try {
    applyPartenaires(payload.partenaires);
  } catch (e) {
    console.warn("[dynamic] partenaires", e);
  }
  try {
    applyDocumentZones(payload.documents);
  } catch (e) {
    console.warn("[dynamic] docs", e);
  }
}
