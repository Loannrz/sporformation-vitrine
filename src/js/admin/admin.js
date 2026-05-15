/**
 * Console admin SporFormation — orchestre les 5 onglets :
 * Formations · Documents · TEP · À propos · Partenaires.
 *
 * Toutes les écritures passent par /api/admin/* (JWT Supabase + table admins
 * vérifiés côté serveur, écritures avec service_role uniquement).
 */
import "../../scss/admin.scss";
import { supabase, apiFetch } from "./supabase-client.js";
import { FORMATION_LABELS, FORMATION_META } from "../modules/formation-city-detail.js";
import {
  RESULTS_INDICATORS_CLE,
  parseResultsIndicators,
  defaultResultsIndicators,
  isDefaultResultsIndicators,
  deepClone,
} from "../modules/results-indicators.js";

// ───── Helpers DOM ───────────────────────────────────────────────────────────
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "dataset") Object.assign(e.dataset, v);
    else if (k === "on") {
      for (const [evt, fn] of Object.entries(v)) e.addEventListener(evt, fn);
    } else if (k === "html") {
      e.innerHTML = v;
    } else if (v === false || v === null || v === undefined) {
      /* skip */
    } else if (v === true) e.setAttribute(k, "");
    else e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return e;
}
function svg(d, opts = {}) {
  const sz = opts.size || 16;
  const ns = "http://www.w3.org/2000/svg";
  const s = document.createElementNS(ns, "svg");
  s.setAttribute("width", sz);
  s.setAttribute("height", sz);
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("fill", "none");
  s.setAttribute("stroke", "currentColor");
  s.setAttribute("stroke-width", "2");
  s.setAttribute("stroke-linecap", "round");
  s.setAttribute("stroke-linejoin", "round");
  const p = document.createElementNS(ns, "path");
  p.setAttribute("d", d);
  s.appendChild(p);
  return s;
}

// ───── Format dates ──────────────────────────────────────────────────────────
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
});
/** "2026-09-21" → "21 septembre 2026" — robuste aux entrées vides. */
export function formatHumanDate(iso) {
  if (!iso) return "";
  // Si déjà du texte humain non-ISO, on renvoie tel quel (rétro-compat)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.trim())) return iso;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return dateFmt.format(date);
}
function todayIso() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

// ───── Flash UI ──────────────────────────────────────────────────────────────
function flash(msg, kind = "success") {
  const el = document.getElementById("admin-flash");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("error", "success");
  el.classList.add("visible", kind);
  clearTimeout(flash._t);
  flash._t = setTimeout(() => el.classList.remove("visible"), 3500);
}
function reportError(prefix, err) {
  console.error(prefix, err);
  flash(`${prefix} : ${err?.message || err}`, "error");
}

// ───── Auth gate ─────────────────────────────────────────────────────────────
async function ensureAdminOrRedirect() {
  try {
    const me = await apiFetch("/api/admin/me");
    if (!me?.ok) throw new Error("not-admin");
    return me.admin;
  } catch (_e) {
    window.location.replace("/login.html");
    return null;
  }
}

// ───── Tabs ─────────────────────────────────────────────────────────────────
function initTabs() {
  const links = document.querySelectorAll(".admin-sidebar a[data-tab]");
  const sections = {
    formations: document.getElementById("tab-formations"),
    documents: document.getElementById("tab-documents"),
    tep: document.getElementById("tab-tep"),
    apropos: document.getElementById("tab-apropos"),
    partenaires: document.getElementById("tab-partenaires"),
  };
  links.forEach((a) => {
    a.addEventListener("click", () => {
      links.forEach((x) => x.classList.remove("active"));
      a.classList.add("active");
      for (const [name, sec] of Object.entries(sections)) {
        sec?.classList.toggle("hidden", name !== a.dataset.tab);
      }
    });
  });
}

// ═════════════════════════ Onglet Formations ═══════════════════════════════
const FORMATION_FIELDS_PRIMARY = [
  { cle: "deadline_iso", label: "Date limite d'inscription", type: "date" },
  { cle: "session_iso", label: "Prochaine session", type: "date" },
  { cle: "duration", label: "Durée affichée", type: "text", placeholder: "ex: 12 mois — 553 h" },
  { cle: "success_rate", label: "Taux d'obtention", type: "percent" },
  { cle: "summary_stat_label", label: "Légende sous le % (sidebar + bloc résultats)", type: "text", placeholder: "ex: session 2026 — 2027" },
];

function getFormationKeys() {
  return Object.keys(FORMATION_META).map((k) => {
    const [slug, ville] = k.split("|");
    return { slug, ville, key: k };
  });
}

const formationsState = { overrides: [], filter: { slug: "", ville: "" } };

async function loadFormations() {
  const r = await apiFetch("/api/admin/formation-overrides");
  formationsState.overrides = r.items || [];
}

function renderFormationsFilters() {
  const slugs = [...new Set(getFormationKeys().map((k) => k.slug))];
  const villes = [...new Set(getFormationKeys().map((k) => k.ville))];
  const filterSlug = document.getElementById("formations-filter-slug");
  const filterVille = document.getElementById("formations-filter-ville");
  if (!filterSlug.options.length) {
    filterSlug.appendChild(el("option", { value: "" }, "— Toutes les formations —"));
    slugs.forEach((s) =>
      filterSlug.appendChild(el("option", { value: s }, FORMATION_LABELS[s] || s))
    );
    filterSlug.addEventListener("change", () => {
      formationsState.filter.slug = filterSlug.value;
      renderFormationsList();
    });
  }
  if (!filterVille.options.length) {
    filterVille.appendChild(el("option", { value: "" }, "— Toutes les villes —"));
    villes.forEach((v) => filterVille.appendChild(el("option", { value: v }, v)));
    filterVille.addEventListener("change", () => {
      formationsState.filter.ville = filterVille.value;
      renderFormationsList();
    });
  }
}

function getOverride(slug, ville, cle) {
  return formationsState.overrides.find(
    (r) => r.slug === slug && r.ville === ville && r.cle === cle
  );
}

async function saveFormationField(slug, ville, cle, valeur) {
  try {
    const v = valeur == null ? "" : String(valeur).trim();
    if (v === "") {
      const existing = getOverride(slug, ville, cle);
      if (existing?.id) {
        await apiFetch(`/api/admin/formation-overrides/${existing.id}`, {
          method: "DELETE",
        });
      }
    } else {
      await apiFetch("/api/admin/formation-overrides", {
        method: "PUT",
        body: JSON.stringify({ slug, ville, cle, valeur: v }),
      });
    }
    await loadFormations();
    flash("Modification enregistrée.");
  } catch (e) {
    reportError("Enregistrement impossible", e);
  }
}

function readDefault(slug, ville, cle) {
  const meta = FORMATION_META[`${slug}|${ville}`];
  if (!meta) return "";
  switch (cle) {
    case "duration":
      return meta.duration || "";
    case "success_rate":
      return meta.successRate || "";
    case "summary_stat_label":
      return meta.summaryStatLabel || "";
    default:
      return "";
  }
}

function makeField(slug, ville, field) {
  const wrap = el("div", { class: "admin-field" });
  wrap.appendChild(el("label", {}, field.label));
  const override = getOverride(slug, ville, field.cle);
  let input;
  if (field.type === "date") {
    input = el("input", { type: "date", value: override?.valeur || "" });
  } else if (field.type === "number") {
    input = el("input", { type: "number", min: "0", step: "1", value: override?.valeur || "" });
  } else if (field.type === "percent") {
    wrap.classList.add("admin-field--suffix");
    // Acceptons "84", "84%", "84 %"
    const cleanVal = (override?.valeur || "").replace(/[%\s]/g, "");
    input = el("input", {
      type: "number",
      min: "0",
      max: "100",
      step: "0.01",
      value: cleanVal,
    });
    wrap.appendChild(input);
    wrap.appendChild(el("span", { class: "suffix" }, "%"));
    input.addEventListener("change", () => {
      const v = input.value.trim();
      saveFormationField(slug, ville, field.cle, v === "" ? "" : `${v} %`);
    });
    return wrap;
  } else {
    input = el("input", {
      type: "text",
      value: override?.valeur || "",
      placeholder: field.placeholder || (readDefault(slug, ville, field.cle) ? `défaut : ${readDefault(slug, ville, field.cle)}` : ""),
    });
  }
  wrap.appendChild(input);
  input.addEventListener("change", () => {
    saveFormationField(slug, ville, field.cle, input.value);
  });
  return wrap;
}

function formationSummaryIcon(kind) {
  const icons = {
    calendar:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/></svg>',
    clock:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    chart:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5"/><path d="M20 19V11"/><path d="M12 19V8"/></svg>',
  };
  const span = document.createElement("span");
  span.className = "formation-summary__icon";
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = icons[kind] || "";
  return span;
}

function formationSummaryRow(label, value, iconKind) {
  const row = el("div", { class: "formation-summary__row" });
  row.appendChild(formationSummaryIcon(iconKind));
  row.appendChild(
    el(
      "div",
      { class: "formation-summary__row-text" },
      el("strong", {}, label),
      el("span", {}, value || "—")
    )
  );
  return row;
}

/** Réplique la sidebar droite de formation-detail.html (formation-summary). */
function buildSidebarPreview(slug, ville) {
  const meta = FORMATION_META[`${slug}|${ville}`] || {};
  const deadlineIso = getOverride(slug, ville, "deadline_iso")?.valeur || "";
  const sessionIso = getOverride(slug, ville, "session_iso")?.valeur || "";
  const dur = getOverride(slug, ville, "duration")?.valeur || meta.duration || "—";
  const successRaw = (
    getOverride(slug, ville, "success_rate")?.valeur ||
    meta.successRate ||
    ""
  ).trim();
  const statLabel =
    getOverride(slug, ville, "summary_stat_label")?.valeur?.trim() ||
    meta.summaryStatLabel?.trim() ||
    "Taux d’obtention du diplôme — session 2025‑2026";

  const visibleOverride = getOverride(slug, ville, "inscription_visible")?.valeur;
  const showCta = visibleOverride !== "0";
  const closed =
    deadlineIso && /^\d{4}-\d{2}-\d{2}$/.test(deadlineIso) && deadlineIso < todayIso();

  const deadlineDisplay = deadlineIso
    ? formatHumanDate(deadlineIso)
    : meta.deadline || "—";
  const sessionDisplay = sessionIso
    ? formatHumanDate(sessionIso)
    : meta.session || "—";

  const root = el("div", { class: "formation-summary", role: "presentation" });
  root.appendChild(
    el(
      "div",
      { class: "formation-summary__header" },
      el("p", { class: "formation-summary__eyebrow" }, "Site de formation"),
      el("p", { class: "formation-summary__title" }, ville)
    )
  );

  const summaryBody = el("div", { class: "formation-summary__body" });
  summaryBody.appendChild(
    formationSummaryRow("Date limite d’inscription", deadlineDisplay, "calendar")
  );
  summaryBody.appendChild(
    formationSummaryRow("Prochaine session", sessionDisplay, "clock")
  );
  summaryBody.appendChild(formationSummaryRow("Durée", dur, "chart"));

  if (successRaw) {
    summaryBody.appendChild(
      el(
        "div",
        { class: "formation-summary__stat" },
        el("span", { class: "formation-summary__stat-value" }, successRaw),
        el("span", { class: "formation-summary__stat-label" }, statLabel)
      )
    );
  }

  if (showCta && !closed) {
    summaryBody.appendChild(
      el(
        "span",
        {
          class: "btn btn--primary formation-summary__cta",
          tabindex: "-1",
          "aria-disabled": "true",
        },
        "Démarrer mon inscription"
      )
    );
  } else {
    summaryBody.appendChild(
      el(
        "span",
        {
          class:
            "btn btn--primary formation-summary__cta formation-summary__cta--disabled",
          tabindex: "-1",
          "aria-disabled": "true",
        },
        "Inscriptions fermées"
      )
    );
  }

  const contact = el("p", { class: "formation-summary__contact" });
  contact.innerHTML =
    "Une question&nbsp;?<br><a href=\"tel:+33744990699\">07 44 99 06 99</a>";
  summaryBody.appendChild(contact);

  root.appendChild(summaryBody);
  return root;
}

async function saveResultsIndicators(slug, ville, data) {
  try {
    if (isDefaultResultsIndicators(data)) {
      const existing = getOverride(slug, ville, RESULTS_INDICATORS_CLE);
      if (existing?.id) {
        await apiFetch(`/api/admin/formation-overrides/${existing.id}`, {
          method: "DELETE",
        });
      }
    } else {
      await apiFetch("/api/admin/formation-overrides", {
        method: "PUT",
        body: JSON.stringify({
          slug,
          ville,
          cle: RESULTS_INDICATORS_CLE,
          valeur: JSON.stringify(data),
        }),
      });
    }
    await loadFormations();
    flash("Tableau des résultats enregistré.");
  } catch (e) {
    reportError("Enregistrement tableau impossible", e);
  }
}

function buildResultsTableEditor(slug, ville) {
  let state = deepClone(
    parseResultsIndicators(getOverride(slug, ville, RESULTS_INDICATORS_CLE)?.valeur)
  );

  const meta = FORMATION_META[`${slug}|${ville}`] || {};
  const ratePreview =
    getOverride(slug, ville, "success_rate")?.valeur?.trim() || meta.successRate || "";

  const wrap = el("div", { class: "admin-results-editor" });

  wrap.appendChild(
    el(
      "p",
      { class: "muted admin-results-hint" },
      "Le taux d’obtention saisi plus haut met aussi à jour le grand pourcentage rouge sur le site. " +
        "Le tableau reprend le même style que la page publique : remplissez uniquement les cases utiles."
    )
  );

  const statOuter = el("div", { class: "formation-detail-sheet__stat" });
  statOuter.appendChild(
    el("span", { class: "formation-detail-sheet__stat-value" }, ratePreview || "\u00a0")
  );
  const cap = el("div", { class: "formation-detail-sheet__stat-caption" });
  const inpTitle = el("input", {
    type: "text",
    class: "admin-results-hero-input admin-results-hero-input--title",
    value: state.heroTitle,
    placeholder: "Titre (ex. Taux d’obtention du diplôme)",
  });
  const inpNote = el("input", {
    type: "text",
    class: "admin-results-hero-input admin-results-hero-input--note",
    value: state.heroNote,
    placeholder: "Précision (ex. Session 2025 — donnée indicative)",
  });
  cap.appendChild(inpTitle);
  cap.appendChild(inpNote);
  statOuter.appendChild(cap);
  wrap.appendChild(statOuter);

  const modeWrap = el("div", { class: "admin-field admin-results-mode" });
  modeWrap.appendChild(el("label", {}, "Format du tableau"));
  const selCols = el("select", {});
  selCols.appendChild(
    el("option", { value: "2" }, "Deux colonnes de chiffres (comparer deux sessions)")
  );
  selCols.appendChild(el("option", { value: "1" }, "Une colonne de chiffres"));
  selCols.value = state.columns.length <= 2 ? "1" : "2";
  modeWrap.appendChild(selCols);
  wrap.appendChild(modeWrap);

  const tableWrap = el("div", { class: "formation-detail-sheet__table-wrap" });
  const table = el("table", {});
  const thead = el("thead", {});
  const tbody = el("tbody", {});

  function syncStateFromDom() {
    const trh = thead.querySelector("tr");
    const thInputs = trh?.querySelectorAll(".admin-results-th-input") || [];
    state.columns = [...thInputs].map((i) => i.value.trim());
    state.rows = [...tbody.querySelectorAll("tr")].map((tr) => {
      const inputs = [...tr.querySelectorAll(".admin-results-td-input")];
      const label = inputs[0]?.value.trim() ?? "";
      const cells = inputs.slice(1).map((inp) => inp.value.trim());
      return { label, cells };
    });
  }

  function renderTable() {
    thead.innerHTML = "";
    tbody.innerHTML = "";
    const trh = el("tr");
    state.columns.forEach((colText) => {
      const th = el("th", { scope: "col" });
      th.appendChild(
        el("input", {
          type: "text",
          class: "admin-results-th-input",
          value: colText,
          placeholder: "—",
        })
      );
      trh.appendChild(th);
    });
    thead.appendChild(trh);

    const dataCols = Math.max(1, state.columns.length - 1);
    state.rows.forEach((row) => {
      const tr = el("tr");
      const tdLab = el("td");
      tdLab.appendChild(
        el("input", {
          type: "text",
          class: "admin-results-td-input",
          value: row.label,
          placeholder: "Nom de la ligne",
        })
      );
      tr.appendChild(tdLab);
      for (let i = 0; i < dataCols; i++) {
        const td = el("td");
        td.appendChild(
          el("input", {
            type: "text",
            class: "admin-results-td-input",
            value: row.cells[i] || "",
            placeholder: "",
          })
        );
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    });
  }

  selCols.addEventListener("change", () => {
    syncStateFromDom();
    const dc = selCols.value === "1" ? 1 : 2;
    const ind = state.columns[0] || "Indicateurs";
    if (dc === 1) {
      const mid = state.columns[1] || state.columns[2] || "Session 2025 — 2026";
      state.columns = [ind, mid];
      state.rows = state.rows.map((r) => ({
        label: r.label,
        cells: [r.cells[0] || ""],
      }));
    } else {
      state.columns = [
        ind,
        state.columns[1] || "Session précédente",
        state.columns[2] || "Session actuelle",
      ];
      state.rows = state.rows.map((r) => ({
        label: r.label,
        cells: [r.cells[0] ?? "", r.cells[1] ?? ""],
      }));
    }
    renderTable();
  });

  table.appendChild(thead);
  table.appendChild(tbody);
  renderTable();
  tableWrap.appendChild(table);
  wrap.appendChild(tableWrap);

  const footField = el("div", { class: "admin-field" });
  footField.appendChild(el("label", {}, "Note sous le tableau (*…)"));
  const footTa = el("textarea", {
    rows: 2,
    class: "admin-results-footnote",
    placeholder:
      "Optionnel — laissez vide pour ne pas remplacer la note déjà présente sur la fiche",
  });
  footTa.value = state.footnote;
  footField.appendChild(footTa);

  const actions = el("div", { class: "admin-results-actions" });
  actions.appendChild(
    el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--primary admin-btn--sm",
        on: {
          click: async () => {
            syncStateFromDom();
            state.heroTitle =
              inpTitle.value.trim() || defaultResultsIndicators().heroTitle;
            state.heroNote = inpNote.value.trim();
            state.footnote = footTa.value.trim();
            await saveResultsIndicators(slug, ville, state);
            renderFormationsList();
          },
        },
      },
      "Enregistrer le tableau"
    )
  );
  actions.appendChild(
    el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--ghost admin-btn--sm",
        on: {
          click: async () => {
            const fresh = deepClone(defaultResultsIndicators());
            await saveResultsIndicators(slug, ville, fresh);
            renderFormationsList();
          },
        },
      },
      "Réinitialiser (revenir au texte statique du site)"
    )
  );
  wrap.appendChild(footField);
  wrap.appendChild(actions);

  return wrap;
}

function renderFormationsList() {
  const host = document.getElementById("formations-list");
  host.innerHTML = "";
  const keys = getFormationKeys().filter((k) => {
    if (formationsState.filter.slug && k.slug !== formationsState.filter.slug) return false;
    if (formationsState.filter.ville && k.ville !== formationsState.filter.ville) return false;
    return true;
  });
  if (!keys.length) {
    host.appendChild(el("p", { class: "admin-empty" }, "Aucune fiche pour ces filtres."));
    return;
  }
  for (const { slug, ville } of keys) {
    const card = el("article", { class: "formation-card" });

    // Header avec badge + ville
    const visibleOverride = getOverride(slug, ville, "inscription_visible")?.valeur;
    const showCta = visibleOverride === "0" ? false : true;
    const deadlineIso = getOverride(slug, ville, "deadline_iso")?.valeur || "";
    const closed =
      deadlineIso && /^\d{4}-\d{2}-\d{2}$/.test(deadlineIso) && deadlineIso < todayIso();

    const statusBadges = el("div", { class: "formation-card__status" });
    statusBadges.appendChild(
      closed
        ? el("span", { class: "badge badge--warn" }, "Inscriptions fermées")
        : showCta
          ? el("span", { class: "badge badge--ok" }, "Inscriptions ouvertes")
          : el("span", { class: "badge badge--muted" }, "Inscriptions désactivées")
    );

    const header = el(
      "header",
      { class: "formation-card__header" },
      el(
        "div",
        {},
        el("p", { class: "formation-card__city" }, ville),
        el("p", { class: "formation-card__slug" }, FORMATION_LABELS[slug] || slug)
      ),
      statusBadges
    );
    card.appendChild(header);

    // Corps : colonne gauche (formulaires) + colonne droite (sidebar identique au site)
    const body = el("div", { class: "formation-card__body" });

    const editorGrid = el("div", { class: "admin-formation-editor-grid" });
    const mainCol = el("div", { class: "admin-formation-editor-main" });

    // Section principale
    const sectionTitle = el(
      "div",
      { style: "display:flex;align-items:center;gap:10px;margin-bottom:10px;" },
      el("span", { class: "badge badge--accent" }, "Informations affichées"),
      el(
        "span",
        { class: "muted", style: "font-size:12px;" },
        "Modifiable en un clic — pré-remplissage avec les valeurs par défaut."
      )
    );
    mainCol.appendChild(sectionTitle);

    const grid = el("div", { class: "admin-grid" });
    FORMATION_FIELDS_PRIMARY.forEach((f) => grid.appendChild(makeField(slug, ville, f)));
    mainCol.appendChild(grid);

    // Toggle "afficher le bouton"
    const toggleWrap = el(
      "div",
      {
        style:
          "margin-top:16px;display:flex;gap:18px;flex-wrap:wrap;align-items:center;",
      },
      buildToggle(slug, ville),
      el(
        "span",
        { class: "muted", style: "font-size:12.5px;" },
        "Désactivé : sur le site le bouton reste visible mais gris (« Inscriptions fermées »), sans lien. Sinon il est rouge et mène à la page contact."
      )
    );
    mainCol.appendChild(toggleWrap);

    const resultsDetails = el(
      "details",
      { class: "admin-results-details", style: "margin-top:16px;" },
      el(
        "summary",
        {
          style:
            "cursor:pointer;font-weight:700;color:#1A1A2E;padding:10px 0;font-size:14px;",
        },
        "Tableau « Indicateurs de résultats » (bas de page fiche formation)"
      )
    );
    resultsDetails.appendChild(buildResultsTableEditor(slug, ville));
    mainCol.appendChild(resultsDetails);

    const previewCol = el("div", { class: "admin-formation-sidebar-preview" });
    previewCol.appendChild(
      el("p", { class: "admin-sidebar-preview-caption" }, "Aperçu colonne droite")
    );
    previewCol.appendChild(buildSidebarPreview(slug, ville));

    editorGrid.appendChild(mainCol);
    editorGrid.appendChild(previewCol);
    body.appendChild(editorGrid);

    card.appendChild(body);
    host.appendChild(card);
  }
}

function buildToggle(slug, ville) {
  const visibleOverride = getOverride(slug, ville, "inscription_visible")?.valeur;
  const checked = visibleOverride !== "0";
  const label = el("label", { class: "admin-toggle" });
  const input = el("input", { type: "checkbox" });
  if (checked) input.setAttribute("checked", "");
  input.addEventListener("change", () => {
    saveFormationField(slug, ville, "inscription_visible", input.checked ? "1" : "0")
      .then(() => renderFormationsList());
  });
  label.appendChild(input);
  label.appendChild(el("span", { class: "switch" }));
  label.appendChild(document.createTextNode("Activer le bouton « S'inscrire » (rouge, cliquable)"));
  return label;
}

async function bootFormationsTab() {
  await loadFormations();
  renderFormationsFilters();
  renderFormationsList();
}

// ═════════════════════════ Onglet Documents ════════════════════════════════
const docsState = { items: [], scope: "", scopeKey: "", uploadCache: null };

async function loadDocuments() {
  const r = await apiFetch("/api/admin/documents");
  docsState.items = r.items || [];
}

function fillScopeKeyOptions() {
  const sel = document.getElementById("doc-scope-key");
  if (!sel || sel.options.length) return;
  sel.appendChild(el("option", { value: "" }, "— Aucune (page entière) —"));
  getFormationKeys().forEach(({ slug, ville }) => {
    sel.appendChild(
      el(
        "option",
        { value: `${slug}|${ville}` },
        `${FORMATION_LABELS[slug] || slug} — ${ville}`
      )
    );
  });
}

function renderDocuments() {
  const host = document.getElementById("documents-list");
  host.innerHTML = "";
  const items = docsState.items.filter((d) => {
    if (docsState.scope && d.scope !== docsState.scope) return false;
    if (docsState.scopeKey && d.scope_key !== docsState.scopeKey) return false;
    return true;
  });
  if (!items.length) {
    host.appendChild(
      el("p", { class: "admin-empty" }, "Aucun document — créez le premier ci-dessus.")
    );
    return;
  }
  const tbl = el(
    "table",
    { class: "admin-table" },
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", {}, "Scope"),
        el("th", {}, "Clé"),
        el("th", {}, "Libellé"),
        el("th", {}, "Type"),
        el("th", {}, "URL"),
        el("th", {}, "Ordre"),
        el("th", {}, "")
      )
    )
  );
  const tbody = el("tbody", {});
  for (const d of items) {
    const tr = el(
      "tr",
      {},
      el("td", {}, el("span", { class: "badge" }, d.scope)),
      el("td", {}, d.scope_key || "—"),
      el("td", {}, d.label),
      el("td", {}, d.type === "lien" ? "Lien" : "Document"),
      el(
        "td",
        {},
        el("a", { href: d.url, target: "_blank", rel: "noopener" }, "Ouvrir ↗")
      ),
      el("td", {}, String(d.ordre)),
      el(
        "td",
        { class: "actions" },
        el(
          "button",
          {
            class: "admin-btn admin-btn--danger admin-btn--sm",
            on: {
              click: async () => {
                if (!confirm("Supprimer définitivement ce lien ?")) return;
                try {
                  await apiFetch(`/api/admin/documents/${d.id}`, { method: "DELETE" });
                  await loadDocuments();
                  renderDocuments();
                  flash("Document supprimé.");
                } catch (e) {
                  reportError("Suppression impossible", e);
                }
              },
            },
          },
          "Supprimer"
        )
      )
    );
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  host.appendChild(tbl);
}

function bindDocumentsTab() {
  fillScopeKeyOptions();
  const fileInput = document.getElementById("doc-file");
  const fileName = document.getElementById("doc-file-name");
  const urlInput = document.getElementById("doc-url");

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) {
      fileName.textContent = "Aucun fichier sélectionné";
      return;
    }
    fileName.textContent = "Téléversement…";
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("dossier", "documents");
      const r = await apiFetch("/api/admin/upload", { method: "POST", body: form });
      docsState.uploadCache = r;
      urlInput.value = r.url;
      fileName.textContent = `${f.name} (envoyé)`;
    } catch (e) {
      fileName.textContent = "Échec.";
      reportError("Téléversement impossible", e);
    }
  });

  document.getElementById("doc-create").addEventListener("click", async () => {
    const scope = document.getElementById("doc-scope").value;
    const scope_key = document.getElementById("doc-scope-key").value.trim();
    const label = document.getElementById("doc-label").value.trim();
    const type = document.getElementById("doc-type").value;
    const url = document.getElementById("doc-url").value.trim();
    const ordre = Number(document.getElementById("doc-ordre").value || 100);
    if (!label || !url) {
      flash("Libellé et URL sont obligatoires.", "error");
      return;
    }
    try {
      await apiFetch("/api/admin/documents", {
        method: "POST",
        body: JSON.stringify({
          scope,
          scope_key,
          label,
          url,
          type,
          ordre,
          fichier_chemin: docsState.uploadCache?.fichier_chemin || null,
        }),
      });
      docsState.uploadCache = null;
      document.getElementById("doc-label").value = "";
      document.getElementById("doc-url").value = "";
      document.getElementById("doc-scope-key").value = "";
      fileInput.value = "";
      fileName.textContent = "Aucun fichier sélectionné";
      await loadDocuments();
      renderDocuments();
      flash("Document créé.");
    } catch (e) {
      reportError("Création impossible", e);
    }
  });

  document.getElementById("doc-filter-scope").addEventListener("change", (e) => {
    docsState.scope = e.target.value;
    renderDocuments();
  });
  document.getElementById("doc-filter-key").addEventListener("input", (e) => {
    docsState.scopeKey = e.target.value.trim();
    renderDocuments();
  });
}

async function bootDocumentsTab() {
  await loadDocuments();
  renderDocuments();
}

// ═════════════════════════ Onglet TEP ═══════════════════════════════════════
const tepState = { etapes: [], settings: {} };

async function loadTep() {
  const [s, e] = await Promise.all([
    apiFetch("/api/admin/settings"),
    apiFetch("/api/admin/tep-etapes"),
  ]);
  tepState.settings = {};
  for (const it of s.items || []) tepState.settings[it.cle] = it.valeur;
  tepState.etapes = e.items || [];
}

function renderTepPrices() {
  const p1 = tepState.settings.tep_prix_inscription_seule || {};
  const p2 = tepState.settings.tep_prix_preparation || {};
  document.getElementById("tep-libelle-1").value = p1.libelle ?? "Inscription seule";
  document.getElementById("tep-montant-1").value = p1.montant ?? 70;
  document.getElementById("tep-unite-1").value = p1.unite ?? "par candidat";
  document.getElementById("tep-libelle-2").value = p2.libelle ?? "Préparation + inscription";
  document.getElementById("tep-montant-2").value = p2.montant ?? 100;
  document.getElementById("tep-unite-2").value = p2.unite ?? "tout compris";
}

function renderTepEtapes() {
  const host = document.getElementById("tep-etapes-list");
  host.innerHTML = "";
  if (!tepState.etapes.length) {
    host.appendChild(el("p", { class: "admin-empty" }, "Aucune étape — cliquez « Ajouter »."));
    return;
  }
  tepState.etapes.forEach((etape) => {
    const wrap = el("div", { class: "tep-step-editor" + (etape.accent ? " accent" : "") });
    const grid = el("div", { class: "admin-grid" });
    const ordreI = el("input", { type: "number", value: etape.ordre, step: 10 });
    const badgeI = el("input", { type: "text", value: etape.badge || "" });
    const titreI = el("input", { type: "text", value: etape.titre });
    grid.append(
      el("div", { class: "admin-field" }, el("label", {}, "Ordre"), ordreI),
      el("div", { class: "admin-field" }, el("label", {}, "Étiquette (eyebrow)"), badgeI),
      el("div", { class: "admin-field" }, el("label", {}, "Titre"), titreI)
    );
    const descI = el("textarea", { rows: 3 }, etape.description);
    const descField = el("div", { class: "admin-field" }, el("label", {}, "Description"), descI);
    const accentI = el("input", { type: "checkbox" });
    accentI.checked = !!etape.accent;
    const accentLabel = el(
      "label",
      { class: "admin-toggle" },
      accentI,
      el("span", { class: "switch" }),
      "Mettre en avant (cadre rouge)"
    );
    const actions = el(
      "div",
      { style: "display:flex;gap:8px;align-items:center;margin-top:12px;flex-wrap:wrap;" },
      accentLabel,
      el("div", { style: "margin-left:auto;display:flex;gap:8px;" },
        el(
          "button",
          {
            class: "admin-btn admin-btn--primary admin-btn--sm",
            on: {
              click: async () => {
                try {
                  await apiFetch(`/api/admin/tep-etapes/${etape.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({
                      ordre: Number(ordreI.value),
                      badge: badgeI.value.trim() || null,
                      titre: titreI.value.trim(),
                      description: descI.value.trim(),
                      accent: accentI.checked,
                    }),
                  });
                  await loadTep();
                  renderTepEtapes();
                  flash("Étape enregistrée.");
                } catch (e) {
                  reportError("Enregistrement impossible", e);
                }
              },
            },
          },
          "Enregistrer"
        ),
        el(
          "button",
          {
            class: "admin-btn admin-btn--danger admin-btn--sm",
            on: {
              click: async () => {
                if (!confirm("Supprimer cette étape ?")) return;
                try {
                  await apiFetch(`/api/admin/tep-etapes/${etape.id}`, { method: "DELETE" });
                  await loadTep();
                  renderTepEtapes();
                  flash("Étape supprimée.");
                } catch (e) {
                  reportError("Suppression impossible", e);
                }
              },
            },
          },
          "Supprimer"
        )
      )
    );
    wrap.append(grid, descField, actions);
    host.appendChild(wrap);
  });
}

function bindTepTab() {
  document.getElementById("tep-save-prices").addEventListener("click", async () => {
    try {
      await apiFetch("/api/admin/settings/tep_prix_inscription_seule", {
        method: "PUT",
        body: JSON.stringify({
          valeur: {
            libelle: document.getElementById("tep-libelle-1").value.trim(),
            montant: Number(document.getElementById("tep-montant-1").value || 0),
            unite: document.getElementById("tep-unite-1").value.trim(),
            devise: "€",
          },
        }),
      });
      await apiFetch("/api/admin/settings/tep_prix_preparation", {
        method: "PUT",
        body: JSON.stringify({
          valeur: {
            libelle: document.getElementById("tep-libelle-2").value.trim(),
            montant: Number(document.getElementById("tep-montant-2").value || 0),
            unite: document.getElementById("tep-unite-2").value.trim(),
            devise: "€",
          },
        }),
      });
      await loadTep();
      renderTepPrices();
      flash("Tarifs enregistrés.");
    } catch (e) {
      reportError("Enregistrement tarifs impossible", e);
    }
  });

  document.getElementById("tep-etape-add").addEventListener("click", async () => {
    try {
      const nextOrdre = (tepState.etapes.at(-1)?.ordre || 0) + 10;
      await apiFetch("/api/admin/tep-etapes", {
        method: "POST",
        body: JSON.stringify({
          ordre: nextOrdre,
          badge: "Étape",
          titre: "Nouvelle étape",
          description: "Décrivez cette étape ici.",
          accent: false,
        }),
      });
      await loadTep();
      renderTepEtapes();
      flash("Étape ajoutée.");
    } catch (e) {
      reportError("Ajout impossible", e);
    }
  });
}

async function bootTepTab() {
  await loadTep();
  renderTepPrices();
  renderTepEtapes();
}

// ═════════════════════════ Onglet À propos ═════════════════════════════════
async function bootAproposTab() {
  try {
    const s = await apiFetch("/api/admin/settings");
    const map = {};
    for (const it of s.items || []) map[it.cle] = it.valeur;
    const v = map.a_propos_emploi_debouches || {};
    document.getElementById("apropos-titre").value = v.titre || "Emploi & débouchés";
    document.getElementById("apropos-valeur").value = v.valeur || "Insertion";
    document.getElementById("apropos-description").value = v.description || "";
  } catch (e) {
    reportError("Chargement À propos", e);
  }
}

function bindAproposTab() {
  document.getElementById("apropos-save").addEventListener("click", async () => {
    try {
      await apiFetch("/api/admin/settings/a_propos_emploi_debouches", {
        method: "PUT",
        body: JSON.stringify({
          valeur: {
            titre: document.getElementById("apropos-titre").value.trim(),
            valeur: document.getElementById("apropos-valeur").value.trim(),
            description: document.getElementById("apropos-description").value.trim(),
          },
        }),
      });
      flash("Bloc « Emploi & débouchés » enregistré.");
    } catch (e) {
      reportError("Enregistrement impossible", e);
    }
  });
}

// ═════════════════════════ Onglet Partenaires ══════════════════════════════
const partenairesState = { items: [], uploadCache: null };

async function loadPartenaires() {
  const r = await apiFetch("/api/admin/partenaires");
  partenairesState.items = r.items || [];
}

function renderPartenaires() {
  const host = document.getElementById("partenaires-list");
  host.innerHTML = "";
  if (!partenairesState.items.length) {
    host.appendChild(
      el("p", { class: "admin-empty" }, "Aucun partenaire — ajoutez le premier ci-dessus.")
    );
    return;
  }
  const tbl = el(
    "table",
    { class: "admin-table" },
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", {}, "Logo"),
        el("th", {}, "Nom"),
        el("th", {}, "Lien"),
        el("th", {}, "Ordre"),
        el("th", {}, "Visible"),
        el("th", {}, "")
      )
    )
  );
  const tbody = el("tbody", {});
  for (const p of partenairesState.items) {
    const logoCell = el(
      "td",
      {},
      p.logo_url
        ? el(
            "div",
            { class: "logo-thumb" },
            el("img", { src: p.logo_url, alt: p.nom })
          )
        : el("span", { class: "muted" }, "—")
    );
    const tr = el(
      "tr",
      {},
      logoCell,
      el("td", {}, el("strong", {}, p.nom)),
      el(
        "td",
        {},
        p.lien
          ? el(
              "a",
              { href: p.lien, target: "_blank", rel: "noopener" },
              p.lien.replace(/^https?:\/\//, "").slice(0, 32) + " ↗"
            )
          : el("span", { class: "muted" }, "—")
      ),
      el("td", {}, String(p.ordre)),
      el(
        "td",
        {},
        p.actif
          ? el("span", { class: "badge badge--ok" }, "Visible")
          : el("span", { class: "badge badge--muted" }, "Masqué")
      ),
      el(
        "td",
        { class: "actions" },
        el(
          "button",
          {
            class: "admin-btn admin-btn--sm",
            on: {
              click: async () => {
                try {
                  await apiFetch(`/api/admin/partenaires/${p.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ actif: !p.actif }),
                  });
                  await loadPartenaires();
                  renderPartenaires();
                } catch (e) {
                  reportError("Mise à jour impossible", e);
                }
              },
            },
          },
          p.actif ? "Masquer" : "Réactiver"
        ),
        el(
          "button",
          {
            class: "admin-btn admin-btn--danger admin-btn--sm",
            on: {
              click: async () => {
                if (!confirm("Supprimer ce partenaire ?")) return;
                try {
                  await apiFetch(`/api/admin/partenaires/${p.id}`, { method: "DELETE" });
                  await loadPartenaires();
                  renderPartenaires();
                  flash("Partenaire supprimé.");
                } catch (e) {
                  reportError("Suppression impossible", e);
                }
              },
            },
          },
          "Supprimer"
        )
      )
    );
    tbody.appendChild(tr);
  }
  tbl.appendChild(tbody);
  host.appendChild(tbl);
}

function bindPartenairesTab() {
  const fileInput = document.getElementById("partenaire-file");
  const fileName = document.getElementById("partenaire-file-name");
  const logoUrlInput = document.getElementById("partenaire-logo-url");

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) {
      fileName.textContent = "Aucun fichier sélectionné";
      return;
    }
    fileName.textContent = "Téléversement…";
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("dossier", "partenaires");
      const r = await apiFetch("/api/admin/upload", { method: "POST", body: form });
      partenairesState.uploadCache = r;
      logoUrlInput.value = r.url;
      fileName.textContent = `${f.name} (envoyé)`;
    } catch (e) {
      fileName.textContent = "Échec.";
      reportError("Téléversement impossible", e);
    }
  });

  document.getElementById("partenaire-create").addEventListener("click", async () => {
    const nom = document.getElementById("partenaire-nom").value.trim();
    const lien = document.getElementById("partenaire-lien").value.trim();
    const ordre = Number(document.getElementById("partenaire-ordre").value || 100);
    const logoUrl = logoUrlInput.value.trim();
    if (!nom) {
      flash("Nom du partenaire requis.", "error");
      return;
    }
    try {
      await apiFetch("/api/admin/partenaires", {
        method: "POST",
        body: JSON.stringify({
          nom,
          lien: lien || null,
          ordre,
          logo_url: logoUrl || null,
          fichier_chemin: partenairesState.uploadCache?.fichier_chemin || null,
        }),
      });
      partenairesState.uploadCache = null;
      document.getElementById("partenaire-nom").value = "";
      document.getElementById("partenaire-lien").value = "";
      logoUrlInput.value = "";
      fileInput.value = "";
      fileName.textContent = "Aucun fichier sélectionné";
      await loadPartenaires();
      renderPartenaires();
      flash("Partenaire ajouté.");
    } catch (e) {
      reportError("Ajout impossible", e);
    }
  });
}

async function bootPartenairesTab() {
  await loadPartenaires();
  renderPartenaires();
}

// ═════════════════════════ Boot global ═════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  const admin = await ensureAdminOrRedirect();
  if (!admin) return;

  document.getElementById("admin-user-email").textContent =
    `${admin.email} · ${admin.role}`;
  document.getElementById("admin-logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.replace("/login.html");
  });

  initTabs();
  bindDocumentsTab();
  bindTepTab();
  bindAproposTab();
  bindPartenairesTab();

  try {
    await bootFormationsTab();
    await bootDocumentsTab();
    await bootTepTab();
    await bootAproposTab();
    await bootPartenairesTab();
  } catch (e) {
    reportError("Chargement initial", e);
  }
});
