/**
 * Applique le contenu dynamique (mini-CMS) sur les pages publiques.
 *
 * Charge une seule fois `/api/public/site-content` au boot, puis :
 *   • patche les FORMATION_META à la volée (déjà rendues par formation-city-detail)
 *   • remplace les prix TEP (#tep-pricing, #methode-details)
 *   • remplace les étapes méthode TEP (data-tep-method-grid)
 *   • remplace le bloc « Emploi & débouchés » de a-propos.html
 *   • injecte l'équipe pédagogique (À propos / Qui sommes-nous)
 *   • injecte les boutons « Documents et liens utiles » (zones data-docs-zone sur les fiches)
 *
 * Stratégie : si l'API est indisponible, les zones CMS restent vides (tableaux indicateurs, etc.).
 */

import {
  RESULTS_INDICATORS_CLE,
  parseResultsIndicatorsFromCms,
} from "./results-indicators.js";
import {
  resolveDeadlineDisplay,
  resolveSessionDisplay,
  resolveDurationDisplay,
  resolveSuccessRateTrim,
  DEFAULT_SUCCESS_LABEL,
} from "./formation-sidebar-display.js";
import { refreshSessionsCalendarTable, enrollmentFromByCle } from "./sessions-calendar-table.js";

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

/** Section « Indicateurs de résultats » (*-res) : tableau + bloc % pilotés par le CMS uniquement. */
function applyFormationResultsSection(sheet, byCle) {
  const section = sheet.querySelector('section[id$="-res"]');
  if (!section) return;

  const rawRi = byCle[RESULTS_INDICATORS_CLE];
  const data = parseResultsIndicatorsFromCms(rawRi);
  const rate = resolveSuccessRateTrim(byCle);
  const lab =
    String(byCle.summary_stat_label ?? "").trim() || DEFAULT_SUCCESS_LABEL;

  const statBlock = section.querySelector(".formation-detail-sheet__stat");
  const tableWrap = section.querySelector(".formation-detail-sheet__table-wrap");
  const foot = section.querySelector(".formation-detail-sheet__footnote");

  let table = tableWrap?.querySelector("table");
  if (tableWrap && !table) {
    tableWrap.innerHTML = "<table><thead><tr></tr></thead><tbody></tbody></table>";
    table = tableWrap.querySelector("table");
  }

  const theadRow = table?.querySelector("thead tr");
  const tbody = table?.querySelector("tbody");

  if (statBlock) {
    const heroVal = statBlock.querySelector(".formation-detail-sheet__stat-value");
    const strongEl = statBlock.querySelector(".formation-detail-sheet__stat-caption strong");
    const spanEl = statBlock.querySelector(".formation-detail-sheet__stat-caption span");

    if (rate) {
      statBlock.hidden = false;
      if (heroVal) heroVal.textContent = rate;
      if (strongEl) strongEl.textContent = data?.heroTitle ?? "";
      if (spanEl) {
        if (data) spanEl.textContent = data.heroNote ?? "";
        else spanEl.textContent = lab;
      }
    } else {
      statBlock.hidden = true;
      if (heroVal) heroVal.textContent = "";
      if (strongEl) strongEl.textContent = "";
      if (spanEl) spanEl.textContent = "";
    }
  }

  if (!theadRow || !tbody) return;

  theadRow.innerHTML = "";
  tbody.innerHTML = "";

  if (data && Array.isArray(data.columns) && data.columns.length >= 2) {
    for (const col of data.columns) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = col;
      theadRow.appendChild(th);
    }
    const dataCols = data.columns.length - 1;
    for (const row of data.rows) {
      const tr = document.createElement("tr");
      const tdLabel = document.createElement("td");
      tdLabel.textContent = row.label || "";
      tr.appendChild(tdLabel);
      const cells = Array.isArray(row.cells) ? row.cells : [];
      for (let i = 0; i < dataCols; i++) {
        const td = document.createElement("td");
        const rawCell = String(cells[i] ?? "").trim();
        const strong = document.createElement("strong");
        strong.textContent = rawCell || "\u00a0";
        td.appendChild(strong);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
  }

  if (foot) {
    const ft = data?.footnote?.trim();
    if (ft) {
      foot.hidden = false;
      foot.textContent = ft;
    } else {
      foot.hidden = true;
      foot.textContent = "";
    }
  }
}

// ── Formations : injecter dans #data-formation-summary-* + gérer CTA ─────────
function applyFormationOverrides(overrides) {
  if (!document.querySelector("[data-formation-detail-page]")) return;

  const list = overrides || [];

  document.querySelectorAll("[data-formation-detail-sheet]").forEach((article) => {
    const key = article.getAttribute("data-formation-detail-sheet")?.trim();
    if (!key) return;
    const pipe = key.indexOf("|");
    if (pipe < 0) return;
    const s = key.slice(0, pipe).trim();
    const v = key.slice(pipe + 1).trim();
    const items = list.filter((o) => o.slug === s && o.ville === v);
    const byCleLocal = {};
    for (const it of items) byCleLocal[it.cle] = it.valeur;
    applyFormationResultsSection(article, byCleLocal);
  });

  const params = new URLSearchParams(window.location.search);
  const slug = params.get("f")?.trim();
  const ville = params.get("v")?.trim();
  if (!slug || !ville) return;

  const items = list.filter((o) => o.slug === slug && o.ville === ville);
  const byCle = {};
  for (const it of items) byCle[it.cle] = it.valeur;

  const setElText = (selector, text) => {
    const el = document.querySelector(selector);
    if (el) el.textContent = text ?? "";
  };

  const setTextIfNonEmpty = (selector, value) => {
    const el = document.querySelector(selector);
    if (el && value && String(value).trim()) el.textContent = value;
  };

  setElText("[data-formation-summary-deadline]", resolveDeadlineDisplay(byCle));
  setElText("[data-formation-summary-session]", resolveSessionDisplay(byCle));
  setElText("[data-formation-summary-duration]", resolveDurationDisplay(byCle));

  const rate = resolveSuccessRateTrim(byCle);
  const lab =
    String(byCle.summary_stat_label ?? "").trim() || DEFAULT_SUCCESS_LABEL;

  const stat = document.querySelector("[data-formation-summary-stat]");
  const wrap = document.querySelector("[data-formation-summary-stat-wrap]");
  const statLabelEl = document.querySelector("[data-formation-summary-stat-label]");
  if (rate) {
    if (stat) stat.textContent = rate;
    if (wrap) wrap.hidden = false;
    if (statLabelEl) statLabelEl.textContent = lab;
  } else {
    if (wrap) wrap.hidden = true;
    if (stat) stat.textContent = "";
    if (statLabelEl) statLabelEl.textContent = "";
  }

  const fields = [
    ["effectif_actuel", "[data-formation-stat-effectif]"],
    ["taux_apprentis", "[data-formation-stat-apprentis]"],
    ["taux_interruption", "[data-formation-stat-interruption]"],
    ["taux_rupture", "[data-formation-stat-rupture]"],
    ["satisfaction", "[data-formation-stat-satisfaction]"],
  ];
  for (const [cle, sel] of fields) {
    if (byCle[cle]) setTextIfNonEmpty(sel, byCle[cle]);
  }

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

  const enrollment = enrollmentFromByCle(byCle);
  if (!enrollment.canApply) {
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

// ── Équipe pédagogique (page Qui sommes-nous / À propos) ─────────────────────
function applyEquipePedagogique(members) {
  const host = document.querySelector("[data-equipe-pedagogique-grid]");
  if (!host) return;
  host.innerHTML = "";
  if (!members?.length) return;
  const sorted = [...members].sort((a, b) => Number(a.ordre ?? 0) - Number(b.ordre ?? 0));
  for (const m of sorted) {
    const article = document.createElement("article");
    article.className = "equipe-card reveal";
    const h3 = document.createElement("h3");
    h3.className = "equipe-card__name";
    h3.textContent = m.prenom || "";
    article.appendChild(h3);
    const role = document.createElement("p");
    role.className = "equipe-card__role";
    role.textContent = m.fonction || "";
    article.appendChild(role);
    if (m.email) {
      const a = document.createElement("a");
      a.className = "equipe-card__contact";
      a.href = `mailto:${String(m.email).trim()}`;
      a.textContent = m.email;
      article.appendChild(a);
    }
    if (m.telephone) {
      const tel = document.createElement("a");
      tel.className = "equipe-card__contact";
      const raw = String(m.telephone).replace(/\s/g, "").replace(/\./g, "");
      tel.href = `tel:${raw}`;
      tel.textContent = m.telephone;
      article.appendChild(tel);
    }
    host.appendChild(article);
  }
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

function annotateFormationDocZones() {
  document.querySelectorAll("[data-formation-detail-sheet]").forEach((art) => {
    const key = art.getAttribute("data-formation-detail-sheet")?.trim();
    if (!key) return;
    const grid = art.querySelector(".formation-detail-sheet__links-grid");
    if (!grid) return;
    grid.setAttribute("data-docs-zone", "");
    grid.dataset.docsScope = "formation";
    grid.dataset.docsScopeKey = key;
  });
}

const DOC_BTN_VARIANTS_SITE = new Set(["outline", "primary", "light", "secondary"]);

function docLinkBtnClasses(variant) {
  const v = String(variant ?? "")
    .trim()
    .toLowerCase();
  const ok = DOC_BTN_VARIANTS_SITE.has(v) ? v : "outline";
  return `btn btn--${ok}`;
}

// ── Documents & liens utiles : insère sur les zones marquées ───────────────
function applyDocumentZones(documents) {
  annotateFormationDocZones();
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
    docs.sort((a, b) => Number(a.ordre ?? 0) - Number(b.ordre ?? 0));
    zone.innerHTML = "";
    for (const d of docs) {
      const a = document.createElement("a");
      a.className = docLinkBtnClasses(d.bouton_variante);
      a.href = d.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = d.label;
      zone.appendChild(a);
    }
  }
}

// ── Boot ───────────────────────────────────────────────────────────────────
export async function initDynamicContent() {
  const payload = await fetchPayload();
  if (!payload) return;
  try {
    applyFormationOverrides(payload.formation_overrides ?? []);
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
    applyEquipePedagogique(payload.equipe_pedagogique);
  } catch (e) {
    console.warn("[dynamic] equipe pedagogique", e);
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
  try {
    refreshSessionsCalendarTable(payload.formation_overrides ?? []);
  } catch (e) {
    console.warn("[dynamic] sessions calendar table", e);
  }
}
