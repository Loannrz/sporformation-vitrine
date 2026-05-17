/**
 * Console admin SporFormation — orchestre les onglets :
 * Formations & villes · Équipe (À propos) · Partenaires · Utilisateurs (Auth).
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
import {
  resolveDeadlineDisplay,
  resolveSessionDisplay,
  resolveDurationDisplay,
  resolveSuccessRateTrim,
  DEFAULT_SUCCESS_LABEL,
} from "../modules/formation-sidebar-display.js";
import { initInscriptionTab } from "./inscription-tab.js";

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
    window.location.replace("/login");
    return null;
  }
}

/** Libellé du rôle stocké dans public.admins (console). */
function formatConsoleRoleLabel(roleRaw) {
  const r = String(roleRaw || "").trim();
  const map = {
    "super-admin": "Super-admin",
    "site-editor": "Modificateur du site",
    admin: "Modificateur du site",
    "gestion-candidatures": "Gestion des candidatures",
  };
  return map[r] || r || "—";
}

function consoleRoleSelectValue(stored) {
  const r = String(stored || "").trim();
  if (r === "admin") return "site-editor";
  if (r === "super-admin" || r === "site-editor" || r === "gestion-candidatures") return r;
  return "site-editor";
}

/** Permissions console si /api/admin/me est ancien (sans champ permissions). */
function deriveConsolePermissions(admin) {
  if (admin.permissions) return admin.permissions;
  const r = String(admin.role || "").trim();
  const isSuper = r === "super-admin";
  const legacyEditor = r === "admin" || r === "site-editor";
  return {
    cms: isSuper || legacyEditor,
    users: isSuper,
    candidaturesOnly: r === "gestion-candidatures",
  };
}

/** Masque la nav CMS ou la liste utilisateurs selon permissions renvoyées par /api/admin/me */
function applyConsoleLayout(perms) {
  const p = perms || { cms: true, users: false, candidaturesOnly: false };
  const usersLink = document.querySelector('.admin-sidebar__footer-link[data-tab="utilisateurs"]');
  const sidebarMain = document.querySelector(".admin-sidebar__main");
  const candPanel = document.getElementById("tab-candidatures-placeholder");
  const adminPanel = document.querySelector(".admin-panel");

  const inscriptionLink = document.querySelector('.admin-sidebar__main a[data-tab="inscription"]');
  if (inscriptionLink) {
    inscriptionLink.classList.toggle("hidden", !p.cms);
    inscriptionLink.setAttribute("aria-hidden", p.cms ? "false" : "true");
  }

  if (usersLink) {
    usersLink.classList.toggle("hidden", !p.users);
    usersLink.setAttribute("aria-hidden", p.users ? "false" : "true");
  }

  if (p.candidaturesOnly && candPanel && adminPanel) {
    sidebarMain?.classList.add("hidden");
    adminPanel.querySelectorAll(":scope > section").forEach((sec) => {
      sec.classList.toggle("hidden", sec.id !== "tab-candidatures-placeholder");
    });
    candPanel.classList.remove("hidden");
    return;
  }

  sidebarMain?.classList.remove("hidden");
  candPanel?.classList.add("hidden");
  if (!adminPanel) return;
  adminPanel.querySelectorAll(":scope > section").forEach((sec) => {
    if (sec.id === "tab-candidatures-placeholder") sec.classList.add("hidden");
    else if (sec.id === "tab-formations") sec.classList.remove("hidden");
    else sec.classList.add("hidden");
  });
  document.querySelectorAll(".admin-sidebar__main a[data-tab]").forEach((a) => {
    a.classList.toggle("active", a.dataset.tab === "formations");
  });
}

// ───── Tabs ─────────────────────────────────────────────────────────────────
function initTabs(onTabChange) {
  const links = document.querySelectorAll(".admin-sidebar a[data-tab]");
  const sections = {
    formations: document.getElementById("tab-formations"),
    equipe: document.getElementById("tab-equipe"),
    partenaires: document.getElementById("tab-partenaires"),
    utilisateurs: document.getElementById("tab-utilisateurs"),
    inscription: document.getElementById("tab-inscription"),
  };
  links.forEach((a) => {
    a.addEventListener("click", () => {
      links.forEach((x) => x.classList.remove("active"));
      a.classList.add("active");
      const name = a.dataset.tab || "";
      for (const [key, sec] of Object.entries(sections)) {
        sec?.classList.toggle("hidden", key !== name);
      }
      if (typeof onTabChange === "function") onTabChange(name);
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

function formationOverridesByCle(slug, ville) {
  const byCle = {};
  for (const r of formationsState.overrides) {
    if (r.slug === slug && r.ville === ville) byCle[r.cle] = r.valeur;
  }
  return byCle;
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
  const byCle = formationOverridesByCle(slug, ville);
  const deadlineIso = String(byCle.deadline_iso ?? "").trim();
  const deadlineDisplay = resolveDeadlineDisplay(byCle);
  const sessionDisplay = resolveSessionDisplay(byCle);
  const dur = resolveDurationDisplay(byCle);
  const successRaw = resolveSuccessRateTrim(byCle);
  const statLabel =
    String(byCle.summary_stat_label ?? "").trim() || DEFAULT_SUCCESS_LABEL;

  const visibleOverride = getOverride(slug, ville, "inscription_visible")?.valeur;
  const showCta = visibleOverride !== "0";
  const closed =
    deadlineIso && /^\d{4}-\d{2}-\d{2}$/.test(deadlineIso) && deadlineIso < todayIso();

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

  const ratePreview = resolveSuccessRateTrim(formationOverridesByCle(slug, ville));

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
  statOuter.hidden = !ratePreview;
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

const DOC_BTN_VARIANT_OPTIONS = [
  ["outline", "Contour rouge"],
  ["primary", "Rouge plein"],
  ["light", "Blanc lumineux"],
  ["secondary", "Contour sombre"],
];

const docsState = { items: [], defaultsSeeded: false };

async function loadDocuments() {
  const r = await apiFetch("/api/admin/documents");
  docsState.items = r.items || [];
}

async function seedFormationDefaultsOnce() {
  if (docsState.defaultsSeeded) return;
  try {
    const r = await apiFetch("/api/admin/documents/seed-formation-defaults", {
      method: "POST",
      body: JSON.stringify({}),
    });
    docsState.defaultsSeeded = true;
    if (r?.seeded) {
      await loadDocuments();
      flash(`Liens existants importés (${r.seeded} fiches).`);
    }
  } catch (e) {
    console.warn("[admin] seed defaults", e);
  }
}

function sortedFormationDocs(scopeKey) {
  return docsState.items
    .filter((d) => d.scope === "formation" && d.scope_key === scopeKey)
    .sort((a, b) => Number(a.ordre ?? 0) - Number(b.ordre ?? 0));
}

function buildVariantSwatches(current, onChange) {
  const wrap = el("div", {
    class: "admin-doc-swatches",
    role: "radiogroup",
    "aria-label": "Style du bouton",
  });
  for (const [val, lab] of DOC_BTN_VARIANT_OPTIONS) {
    const sw = el("button", {
      type: "button",
      class: `admin-doc-swatch admin-doc-swatch--${val}${val === current ? " is-active" : ""}`,
      title: lab,
      "aria-label": lab,
      "aria-pressed": val === current ? "true" : "false",
      dataset: { variant: val },
      on: {
        click: () => {
          wrap
            .querySelectorAll(".admin-doc-swatch")
            .forEach((b) => {
              b.classList.toggle("is-active", b.dataset.variant === val);
              b.setAttribute(
                "aria-pressed",
                b.dataset.variant === val ? "true" : "false"
              );
            });
          onChange(val);
        },
      },
    });
    wrap.appendChild(sw);
  }
  return wrap;
}

/** Liste déroulante « style bouton » (même jeu que les swatches des fiches formation). */
function buildDocVariantSelect(defaultVal) {
  const sel = el("select", { class: "admin-input" });
  const fallback =
    DOC_BTN_VARIANT_OPTIONS.some(([v]) => v === defaultVal) ? defaultVal : "outline";
  for (const [val, lab] of DOC_BTN_VARIANT_OPTIONS) {
    sel.appendChild(el("option", { value: val }, lab));
  }
  sel.value = fallback;
  return sel;
}

function makePreviewBtn(variant, label) {
  const btn = el("span", { class: `btn btn--${variant} admin-doc-preview-btn` }, label || "Bouton");
  btn.setAttribute("aria-hidden", "true");
  return btn;
}

function syncPreviewBtn(btn, variant, label) {
  btn.className = `btn btn--${variant} admin-doc-preview-btn`;
  btn.textContent = label || "Bouton";
}

function buildFormationDocRow(d) {
  const row = el("div", {
    class: "admin-doc-row admin-doc-row--card",
    dataset: { docId: String(d.id), variant: d.bouton_variante || "outline" },
  });

  const preview = makePreviewBtn(d.bouton_variante || "outline", d.label);
  row.appendChild(preview);

  const labelInp = el("input", {
    type: "text",
    class: "admin-input admin-input--soft",
    value: d.label,
    placeholder: "Nom du bouton",
  });
  const urlInp = el("input", {
    type: "url",
    class: "admin-input admin-input--soft",
    value: d.url,
    placeholder: "URL ou ancre (#…)",
  });
  labelInp.addEventListener("input", () =>
    syncPreviewBtn(preview, row.dataset.variant, labelInp.value)
  );

  const fields = el("div", { class: "admin-doc-row__fields" });
  fields.appendChild(
    el(
      "label",
      { class: "admin-doc-row__field" },
      el("span", { class: "admin-doc-row__field-label" }, "Libellé"),
      labelInp
    )
  );
  fields.appendChild(
    el(
      "label",
      { class: "admin-doc-row__field" },
      el(
        "span",
        { class: "admin-doc-row__field-label" },
        d.type === "document" ? "Lien du fichier" : "Lien"
      ),
      urlInp
    )
  );
  row.appendChild(fields);

  const meta = el("div", { class: "admin-doc-row__meta" });
  meta.appendChild(
    el(
      "span",
      {
        class: `admin-doc-pill admin-doc-pill--${d.type === "document" ? "file" : "link"}`,
      },
      d.type === "document" ? "Fichier" : "Lien"
    )
  );

  const swatches = buildVariantSwatches(d.bouton_variante || "outline", async (val) => {
    row.dataset.variant = val;
    syncPreviewBtn(preview, val, labelInp.value);
    try {
      await apiFetch(`/api/admin/documents/${d.id}`, {
        method: "PATCH",
        body: JSON.stringify({ bouton_variante: val }),
      });
      await loadDocuments();
    } catch (e) {
      reportError("Style bouton", e);
    }
  });
  meta.appendChild(swatches);
  row.appendChild(meta);

  const actions = el("div", { class: "admin-doc-row__actions" });
  actions.appendChild(
    el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--sm",
        on: {
          click: async () => {
            try {
              await apiFetch(`/api/admin/documents/${d.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  label: labelInp.value.trim(),
                  url: urlInp.value.trim(),
                }),
              });
              await loadDocuments();
              flash("Lien enregistré.");
            } catch (e) {
              reportError("Enregistrement", e);
            }
          },
        },
      },
      "Enregistrer"
    )
  );
  actions.appendChild(
    el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--danger admin-btn--sm",
        on: {
          click: async () => {
            if (!confirm(`Supprimer le bouton « ${d.label} » ?`)) return;
            try {
              await apiFetch(`/api/admin/documents/${d.id}`, { method: "DELETE" });
              await loadDocuments();
              renderFormationsList();
              flash("Bouton supprimé.");
            } catch (e) {
              reportError("Suppression", e);
            }
          },
        },
      },
      "Supprimer"
    )
  );
  row.appendChild(actions);

  return row;
}

/** Repère les blocs « Documents » encore ouverts avant re-render. */
function captureOpenFormationDocsDetailKeys() {
  const keys = new Set();
  const host = document.getElementById("formations-list");
  if (!host) return keys;
  host.querySelectorAll("details.admin-formation-docs[data-scope-key]").forEach((d) => {
    const k = d.dataset.scopeKey;
    if (k && d.open) keys.add(k);
  });
  return keys;
}

function buildFormationDocsSection(slug, ville, docsDetailOpenKeys) {
  const scopeKey = `${slug}|${ville}`;
  const existing = sortedFormationDocs(scopeKey);

  const details = el("details", {
    class: "admin-formation-docs admin-formation-docs--fullwidth",
    style: "margin-top:18px;",
    dataset: { scopeKey },
  });
  const summary = el("summary", { class: "admin-formation-docs__summary" });
  summary.appendChild(
    el(
      "span",
      { class: "admin-formation-docs__summary-title" },
      "Documents & liens utiles"
    )
  );
  summary.appendChild(
    el(
      "span",
      { class: "admin-formation-docs__summary-count" },
      `${existing.length} bouton${existing.length > 1 ? "s" : ""}`
    )
  );
  details.appendChild(summary);

  const body = el("div", { class: "admin-formation-docs__body" });

  body.appendChild(
    el(
      "p",
      { class: "admin-formation-docs__hint" },
      "Apparaît en bas de la fiche, section « Documents et liens utiles ». L’ordre sur le site suit celui de la liste (du haut vers le bas). Choisissez la couleur en cliquant sur une pastille."
    )
  );

  // Liste
  const listHost = el("div", {
    class: "admin-docs-list",
    dataset: { formationDocsHost: scopeKey },
  });
  for (const d of existing) listHost.appendChild(buildFormationDocRow(d));
  body.appendChild(listHost);

  if (!existing.length) {
    const empty = el(
      "div",
      { class: "admin-formation-docs__empty" },
      el("p", {}, "Aucun bouton — utilisez le formulaire ci-dessous pour en ajouter."),
      el(
        "button",
        {
          type: "button",
          class: "admin-btn admin-btn--sm",
          on: {
            click: async () => {
              try {
                const r = await apiFetch(
                  "/api/admin/documents/seed-formation-defaults",
                  {
                    method: "POST",
                    body: JSON.stringify({ scope_key: scopeKey }),
                  }
                );
                if (r?.seeded) {
                  await loadDocuments();
                  renderFormationsList();
                  flash("Liens de la page importés.");
                } else {
                  flash("Aucun lien par défaut pour ce couple.", "error");
                }
              } catch (e) {
                reportError("Import liens par défaut", e);
              }
            },
          },
        },
        "Importer les liens existants de la page"
      )
    );
    body.appendChild(empty);
  }

  // ── Formulaire d'ajout ───────────────────────────────────────────────────
  const draft = { uploadCache: null, variant: "outline" };
  const idSafe = scopeKey.replace(/[^a-zA-Z0-9]+/g, "-");

  const addCard = el("div", { class: "admin-formation-docs__add" });
  addCard.appendChild(
    el(
      "div",
      { class: "admin-formation-docs__add-title" },
      "+ Ajouter un bouton"
    )
  );

  const labelField = el("input", {
    type: "text",
    class: "admin-input admin-formation-docs__input",
    placeholder: "Nom du bouton (ex. Fiche RNCP 40423)",
    autocomplete: "off",
  });
  const urlField = el("input", {
    type: "url",
    class: "admin-input admin-formation-docs__input",
    placeholder: "https://… ou contact.html",
    autocomplete: "off",
  });
  const urlHintId = `fdoc-url-hint-${idSafe}`;
  const urlHint = el(
    "p",
    {
      id: urlHintId,
      class: "admin-formation-docs__url-lock-hint",
      hidden: true,
    },
    "En mode fichier, l’adresse est définie automatiquement après le téléversement — elle ne peut pas être modifiée à la main."
  );

  const previewBtn = makePreviewBtn(draft.variant, "Aperçu");
  labelField.addEventListener("input", () =>
    syncPreviewBtn(previewBtn, draft.variant, labelField.value || "Aperçu")
  );

  const swatches = buildVariantSwatches(draft.variant, (val) => {
    draft.variant = val;
    syncPreviewBtn(previewBtn, val, labelField.value || "Aperçu");
  });

  const typeSwitch = el(
    "div",
    {
      class: "admin-doc-typeswitch",
      role: "radiogroup",
      "aria-label": "Type de bouton",
    },
    el(
      "label",
      { class: "admin-doc-typeswitch__segment" },
      el("input", { type: "radio", name: `docType-${idSafe}`, value: "lien", checked: true }),
      el(
        "span",
        { class: "admin-doc-typeswitch__text" },
        el("span", { class: "admin-doc-typeswitch__title" }, "Lien externe"),
        el("span", { class: "admin-doc-typeswitch__hint" }, "Page du site ou URL web")
      )
    ),
    el(
      "label",
      { class: "admin-doc-typeswitch__segment" },
      el("input", { type: "radio", name: `docType-${idSafe}`, value: "document" }),
      el(
        "span",
        { class: "admin-doc-typeswitch__text" },
        el("span", { class: "admin-doc-typeswitch__title" }, "Fichier"),
        el("span", { class: "admin-doc-typeswitch__hint" }, "PDF, image… téléversé")
      )
    )
  );
  const getType = () =>
    typeSwitch.querySelector(`input[name='docType-${idSafe}']:checked`)?.value || "lien";

  const fileInput = el("input", {
    type: "file",
    id: `fdoc-${idSafe}`,
    style: "display:none",
  });
  const fileName = el(
    "span",
    { class: "admin-formation-docs__filename" },
    "Aucun fichier sélectionné"
  );
  const filePick = el(
    "label",
    {
      class: "admin-btn admin-btn--sm",
      for: fileInput.id,
      style: "margin:0;",
    },
    "Choisir un fichier"
  );

  fileInput.addEventListener("change", async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    fileName.textContent = "Téléversement…";
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("dossier", "documents");
      const r = await apiFetch("/api/admin/upload", { method: "POST", body: form });
      draft.uploadCache = r;
      urlField.value = r.url || "";
      fileName.textContent = f.name;
    } catch (e) {
      fileName.textContent = "Échec";
      reportError("Téléversement", e);
    }
  });

  function applyDocTypeUi() {
    const t = getType();
    if (t === "document") {
      urlField.disabled = true;
      urlField.placeholder = "Rempli automatiquement après téléversement";
      urlField.setAttribute("aria-describedby", urlHintId);
      urlHint.hidden = false;
    } else {
      urlField.disabled = false;
      urlField.placeholder = "https://… ou contact.html";
      urlField.removeAttribute("aria-describedby");
      urlHint.hidden = true;
    }
  }

  typeSwitch.querySelectorAll('input[type="radio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (getType() === "document") {
        urlField.value = "";
        draft.uploadCache = null;
        fileInput.value = "";
        fileName.textContent = "Aucun fichier sélectionné";
      }
      applyDocTypeUi();
    });
  });

  const fieldsGrid = el("div", { class: "admin-formation-docs__add-grid" });
  fieldsGrid.appendChild(
    el(
      "label",
      { class: "admin-formation-docs__add-field" },
      el("span", {}, "Type"),
      typeSwitch
    )
  );
  fieldsGrid.appendChild(
    el(
      "label",
      { class: "admin-formation-docs__add-field" },
      el("span", {}, "Libellé du bouton"),
      labelField
    )
  );
  fieldsGrid.appendChild(
    el(
      "label",
      { class: "admin-formation-docs__add-field" },
      el("span", {}, "URL"),
      urlField,
      urlHint
    )
  );
  fieldsGrid.appendChild(
    el(
      "div",
      { class: "admin-formation-docs__add-field" },
      el("span", {}, "Fichier (si téléversé)"),
      el(
        "div",
        { class: "admin-formation-docs__file-row" },
        filePick,
        fileInput,
        fileName
      )
    )
  );
  fieldsGrid.appendChild(
    el(
      "div",
      { class: "admin-formation-docs__add-field" },
      el("span", {}, "Couleur du bouton"),
      swatches
    )
  );
  fieldsGrid.appendChild(
    el(
      "div",
      { class: "admin-formation-docs__add-field" },
      el("span", {}, "Aperçu"),
      el("div", { class: "admin-formation-docs__preview" }, previewBtn)
    )
  );
  addCard.appendChild(fieldsGrid);

  const nextOrdre =
    existing.reduce((m, x) => Math.max(m, Number(x.ordre || 0)), 0) + 10;

  addCard.appendChild(
    el(
      "div",
      { class: "admin-formation-docs__add-actions" },
      el(
        "button",
        {
          type: "button",
          class: "admin-btn admin-btn--primary admin-btn--sm",
          on: {
            click: async () => {
              const label = labelField.value.trim();
              const url = urlField.value.trim();
              const type = getType();
              if (!label || !url) {
                flash("Libellé et URL (ou fichier téléversé) obligatoires.", "error");
                return;
              }
              try {
                await apiFetch("/api/admin/documents", {
                  method: "POST",
                  body: JSON.stringify({
                    scope: "formation",
                    scope_key: scopeKey,
                    label,
                    url,
                    type,
                    ordre: nextOrdre,
                    bouton_variante: draft.variant,
                    fichier_chemin: draft.uploadCache?.fichier_chemin || null,
                  }),
                });
                draft.uploadCache = null;
                labelField.value = "";
                urlField.value = "";
                fileInput.value = "";
                fileName.textContent = "Aucun fichier sélectionné";
                const lienRadio = typeSwitch.querySelector(
                  `input[name='docType-${idSafe}'][value="lien"]`
                );
                if (lienRadio) lienRadio.checked = true;
                applyDocTypeUi();
                await loadDocuments();
                renderFormationsList();
                flash("Bouton ajouté.");
              } catch (e) {
                reportError("Ajout document", e);
              }
            },
          },
        },
        "Ajouter ce bouton"
      )
    )
  );

  applyDocTypeUi();

  body.appendChild(addCard);
  details.appendChild(body);

  if (docsDetailOpenKeys instanceof Set && docsDetailOpenKeys.has(scopeKey)) {
    details.open = true;
  }

  return details;
}

let otherDocsUploadCache = null;

/** Grille « documents hors formation » : libellé + contrôle (TEP, Handicap, etc.). */
function formationDocControlField(label, control) {
  return el("div", { class: "admin-field" }, el("label", {}, label), control);
}

function renderOtherPagesDocs() {
  const host = document.getElementById("other-pages-docs-panel");
  if (!host) return;
  host.innerHTML = "";

  host.appendChild(el("h3", { style: "margin:0 0 10px;font-size:14px;" }, "Ajouter (TEP, Handicap, global)"));

  const grid = el("div", { class: "admin-grid" });
  const scopeSel = el(
    "select",
    { id: "other-doc-scope", class: "admin-input" },
    el("option", { value: "tep" }, "Page Prépa TEP"),
    el("option", { value: "a-propos" }, "Page À propos"),
    el("option", { value: "handicap" }, "Page Handicap"),
    el("option", { value: "global" }, "Global")
  );
  const keyInp = el("input", {
    id: "other-doc-scope-key",
    type: "text",
    class: "admin-input",
    placeholder: "Clé optionnelle (vide le plus souvent)",
  });
  const labelInp = el("input", {
    id: "other-doc-label",
    type: "text",
    class: "admin-input",
    placeholder: "Nom du bouton",
  });
  const typeSel = el(
    "select",
    { id: "other-doc-type", class: "admin-input" },
    el("option", { value: "document" }, "Fichier téléversé"),
    el("option", { value: "lien" }, "Lien externe")
  );
  const urlInp = el("input", {
    id: "other-doc-url",
    type: "url",
    class: "admin-input",
    placeholder: "https://…",
  });
  const varSel = buildDocVariantSelect("outline");
  varSel.id = "other-doc-variant";

  grid.appendChild(formationDocControlField("Page", scopeSel));
  grid.appendChild(formationDocControlField("Clé", keyInp));
  grid.appendChild(formationDocControlField("Nom", labelInp));
  grid.appendChild(formationDocControlField("Type", typeSel));
  grid.appendChild(formationDocControlField("URL", urlInp));
  grid.appendChild(formationDocControlField("Style bouton", varSel));

  const fileInp = el("input", { type: "file", id: "other-doc-file", style: "display:none" });
  const fileLbl = el("span", { id: "other-doc-file-name", class: "filename" }, "Aucun fichier");
  const pickLbl = el(
    "label",
    { class: "admin-btn", for: "other-doc-file", style: "margin:0;" },
    "Téléverser"
  );
  const createBtn = el(
    "button",
    { type: "button", class: "admin-btn admin-btn--primary admin-btn--sm", id: "other-doc-create" },
    "Créer"
  );
  const fileStrip = el(
    "div",
    {
      class: "admin-field",
      style: "grid-column:1/-1;display:flex;flex-wrap:wrap;gap:10px;align-items:center;",
    },
    pickLbl,
    fileInp,
    fileLbl,
    createBtn
  );
  grid.appendChild(fileStrip);
  host.appendChild(grid);

  host.appendChild(el("h3", { style: "margin:18px 0 10px;font-size:14px;" }, "Liste (hors fiches formation)"));

  const items = docsState.items
    .filter((d) => d.scope !== "formation")
    .sort((a, b) => {
      const ak = `${a.scope}|${a.scope_key}|${String(a.ordre).padStart(6, "0")}`;
      const bk = `${b.scope}|${b.scope_key}|${String(b.ordre).padStart(6, "0")}`;
      return ak.localeCompare(bk);
    });

  if (!items.length) {
    host.appendChild(el("p", { class: "admin-empty" }, "Aucune entrée."));
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
        el("th", {}, "Nom"),
        el("th", {}, "Style"),
        el("th", {}, "Type"),
        el("th", {}, "")
      )
    )
  );
  const tb = el("tbody", {});
  for (const d of items) {
    tb.appendChild(
      el(
        "tr",
        {},
        el("td", {}, d.scope),
        el("td", {}, d.scope_key || "—"),
        el("td", {}, d.label),
        el("td", {}, d.bouton_variante || "outline"),
        el("td", {}, d.type === "lien" ? "Lien" : "Fichier"),
        el(
          "td",
          { class: "actions" },
          el(
            "button",
            {
              type: "button",
              class: "admin-btn admin-btn--danger admin-btn--sm",
              on: {
                click: async () => {
                  if (!confirm("Supprimer ?")) return;
                  try {
                    await apiFetch(`/api/admin/documents/${d.id}`, { method: "DELETE" });
                    await loadDocuments();
                    renderOtherPagesDocs();
                    renderFormationsList();
                    flash("Supprimé.");
                  } catch (e) {
                    reportError("Suppression", e);
                  }
                },
              },
            },
            "Supprimer"
          )
        )
      )
    );
  }
  tbl.appendChild(tb);
  host.appendChild(tbl);
}

function bindOtherPagesDocs() {
  const panel = document.getElementById("other-pages-docs-panel");
  if (!panel || panel.dataset.bound === "1") return;
  panel.dataset.bound = "1";

  panel.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.id !== "other-doc-file") return;
    const f = t.files?.[0];
    const fileName = document.getElementById("other-doc-file-name");
    if (!f) return;
    fileName.textContent = "Envoi…";
    try {
      const form = new FormData();
      form.append("file", f);
      form.append("dossier", "documents");
      const r = await apiFetch("/api/admin/upload", { method: "POST", body: form });
      otherDocsUploadCache = r;
      document.getElementById("other-doc-url").value = r.url || "";
      fileName.textContent = f.name;
    } catch (err) {
      fileName.textContent = "Échec";
      reportError("Téléversement", err);
    }
  });

  panel.addEventListener("click", async (e) => {
    const btn = e.target.closest("#other-doc-create");
    if (!btn) return;
    const scope = document.getElementById("other-doc-scope").value;
    const scope_key = document.getElementById("other-doc-scope-key").value.trim();
    const label = document.getElementById("other-doc-label").value.trim();
    const type = document.getElementById("other-doc-type").value;
    const url = document.getElementById("other-doc-url").value.trim();
    const bouton_variante = document.getElementById("other-doc-variant").value;
    if (!label || !url) {
      flash("Nom et URL requis.", "error");
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
          ordre: 500,
          bouton_variante,
          fichier_chemin: otherDocsUploadCache?.fichier_chemin || null,
        }),
      });
      otherDocsUploadCache = null;
      document.getElementById("other-doc-label").value = "";
      document.getElementById("other-doc-url").value = "";
      document.getElementById("other-doc-scope-key").value = "";
      document.getElementById("other-doc-file").value = "";
      document.getElementById("other-doc-file-name").textContent = "Aucun fichier";
      await loadDocuments();
      renderOtherPagesDocs();
      flash("Créé.");
    } catch (err) {
      reportError("Création", err);
    }
  });
}

function renderFormationsList() {
  const host = document.getElementById("formations-list");
  const docsDetailOpenKeys = captureOpenFormationDocsDetailKeys();
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
    editorGrid.appendChild(buildFormationDocsSection(slug, ville, docsDetailOpenKeys));
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
  await Promise.all([loadFormations(), loadDocuments()]);
  await seedFormationDefaultsOnce();
  renderFormationsFilters();
  renderFormationsList();
  renderOtherPagesDocs();
}

// ═════════════════════════ Onglet Équipe pédagogique (À propos) ══════════════
const equipeState = { items: [] };

async function loadEquipe() {
  const r = await apiFetch("/api/admin/equipe-pedagogique");
  equipeState.items = r.items || [];
}

function renderEquipePedagogiqueList() {
  const host = document.getElementById("equipe-pedagogique-list");
  if (!host) return;
  host.innerHTML = "";
  if (!equipeState.items.length) {
    host.appendChild(
      el(
        "p",
        { class: "admin-empty" },
        "Aucun membre — exécutez le SQL « equipe_pedagogique » dans Supabase puis ajoutez des cadres ci-dessus."
      )
    );
    return;
  }
  const sorted = [...equipeState.items].sort((a, b) => Number(a.ordre) - Number(b.ordre));
  for (const m of sorted) {
    const prenomI = el("input", {
      type: "text",
      class: "admin-input",
      value: m.prenom || "",
      maxlength: 80,
    });
    const fonctionI = el("input", {
      type: "text",
      class: "admin-input",
      value: m.fonction || "",
      maxlength: 240,
    });
    const emailI = el("input", {
      type: "email",
      class: "admin-input",
      value: m.email || "",
    });
    const telI = el("input", {
      type: "text",
      class: "admin-input",
      value: m.telephone || "",
      maxlength: 40,
    });
    const ordreI = el("input", {
      type: "number",
      class: "admin-input",
      value: m.ordre,
      min: 0,
      step: 10,
    });
    const actifI = el("input", { type: "checkbox" });
    if (m.actif !== false) actifI.setAttribute("checked", "");

    const saveRow = async () => {
      try {
        await apiFetch(`/api/admin/equipe-pedagogique/${m.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            prenom: prenomI.value.trim(),
            fonction: fonctionI.value.trim(),
            email: emailI.value.trim() || null,
            telephone: telI.value.trim() || null,
            ordre: Number(ordreI.value || 0),
            actif: actifI.checked,
          }),
        });
        await loadEquipe();
        renderEquipePedagogiqueList();
        flash("Cadre enregistré.");
      } catch (e) {
        reportError("Enregistrement équipe", e);
      }
    };

    const row = el(
      "div",
      {
        class: "admin-card",
        style: "padding:16px 18px;margin-bottom:14px;",
      },
      el(
        "div",
        { class: "admin-grid" },
        el("div", { class: "admin-field" }, el("label", {}, "Prénom"), prenomI),
        el("div", { class: "admin-field" }, el("label", {}, "Ordre"), ordreI)
      ),
      el(
        "div",
        { class: "admin-field", style: "margin-top:10px;" },
        el("label", {}, "Fonction"),
        fonctionI
      ),
      el(
        "div",
        { class: "admin-grid", style: "margin-top:10px;" },
        el("div", { class: "admin-field" }, el("label", {}, "E-mail"), emailI),
        el("div", { class: "admin-field" }, el("label", {}, "Téléphone"), telI)
      ),
      el(
        "div",
        {
          style:
            "margin-top:14px;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:flex-end;",
        },
        el(
          "label",
          { class: "admin-toggle", style: "margin-right:auto;" },
          actifI,
          el("span", { class: "switch" }),
          document.createTextNode(" Visible sur le site")
        ),
        el(
          "button",
          {
            type: "button",
            class: "admin-btn admin-btn--primary admin-btn--sm",
            on: { click: saveRow },
          },
          "Enregistrer"
        ),
        el(
          "button",
          {
            type: "button",
            class: "admin-btn admin-btn--danger admin-btn--sm",
            on: {
              click: async () => {
                if (!confirm(`Supprimer « ${m.prenom} » ?`)) return;
                try {
                  await apiFetch(`/api/admin/equipe-pedagogique/${m.id}`, { method: "DELETE" });
                  await loadEquipe();
                  renderEquipePedagogiqueList();
                  flash("Supprimé.");
                } catch (e) {
                  reportError("Suppression équipe", e);
                }
              },
            },
          },
          "Supprimer"
        )
      )
    );
    host.appendChild(row);
  }
}

function bindEquipeTab() {
  const btn = document.getElementById("equipe-create");
  if (!btn || btn.dataset.bound === "1") return;
  btn.dataset.bound = "1";
  btn.addEventListener("click", async () => {
    const prenom = document.getElementById("equipe-prenom").value.trim();
    const fonction = document.getElementById("equipe-fonction").value.trim();
    if (!prenom || !fonction) {
      flash("Prénom et fonction sont obligatoires.", "error");
      return;
    }
    try {
      await apiFetch("/api/admin/equipe-pedagogique", {
        method: "POST",
        body: JSON.stringify({
          prenom,
          fonction,
          email: document.getElementById("equipe-email").value.trim() || null,
          telephone: document.getElementById("equipe-tel").value.trim() || null,
          ordre: Number(document.getElementById("equipe-ordre-create").value || 500),
        }),
      });
      document.getElementById("equipe-prenom").value = "";
      document.getElementById("equipe-fonction").value = "";
      document.getElementById("equipe-email").value = "";
      document.getElementById("equipe-tel").value = "";
      document.getElementById("equipe-ordre-create").value = "500";
      await loadEquipe();
      renderEquipePedagogiqueList();
      flash("Cadre ajouté.");
    } catch (e) {
      reportError("Ajout équipe", e);
    }
  });
}

async function bootEquipeTab() {
  await loadEquipe();
  renderEquipePedagogiqueList();
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

// ═════════════════════════ Onglet Utilisateurs Auth ════════════════════════
const usersState = {
  users: [],
  meId: "",
  loading: false,
  searchQuery: "",
  sortKey: "name-asc",
};

function normalizeUserSearchText(s) {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function getFilteredSortedUsers() {
  let list = usersState.users.slice();
  const q = normalizeUserSearchText(usersState.searchQuery);
  if (q) {
    list = list.filter((u) => {
      const name = normalizeUserSearchText(u.display_name || "");
      const email = normalizeUserSearchText(u.email || "");
      return name.includes(q) || email.includes(q);
    });
  }
  const collator = new Intl.Collator("fr", { sensitivity: "base" });
  const cmpEmail = (a, b) => collator.compare(a.email || "", b.email || "");
  const cmpName = (a, b) =>
    collator.compare(a.display_name || "", b.display_name || "") || cmpEmail(a, b);

  list.sort((a, b) => {
    switch (usersState.sortKey) {
      case "name-desc":
        return cmpName(b, a);
      case "email-asc":
        return cmpEmail(a, b);
      case "email-desc":
        return cmpEmail(b, a);
      case "name-asc":
      default:
        return cmpName(a, b);
    }
  });
  return list;
}

function updateAdminUsersStatus() {
  const statusEl = document.getElementById("admin-users-status");
  if (!statusEl) return;
  const total = usersState.users.length;
  if (!total) {
    statusEl.textContent = "";
    return;
  }
  const filtered = getFilteredSortedUsers().length;
  const hasQuery = Boolean(usersState.searchQuery.trim());
  if (hasQuery) {
    statusEl.textContent =
      filtered === total
        ? `${total} compte(s)`
        : `${filtered} résultat(s) sur ${total} compte(s)`;
  } else {
    statusEl.textContent = `${total} compte(s)`;
  }
}

async function loadAuthUsersList() {
  usersState.loading = true;
  const statusEl = document.getElementById("admin-users-status");
  if (statusEl) statusEl.textContent = "Chargement…";
  try {
    const r = await apiFetch("/api/admin/users");
    usersState.users = r.users || [];
    updateAdminUsersStatus();
  } finally {
    usersState.loading = false;
  }
}

function renderAuthUsersList() {
  const host = document.getElementById("admin-users-list");
  if (!host) return;
  host.replaceChildren();

  if (!usersState.users.length) {
    host.appendChild(el("p", { class: "muted" }, "Aucun utilisateur renvoyé par Auth."));
    updateAdminUsersStatus();
    return;
  }

  const rows = getFilteredSortedUsers();
  if (!rows.length) {
    host.appendChild(
      el("p", { class: "muted" }, "Aucun résultat pour cette recherche. Modifiez ou effacez le filtre.")
    );
    updateAdminUsersStatus();
    return;
  }

  const tbl = el("table", { class: "admin-table" });
  tbl.appendChild(
    el(
      "thead",
      {},
      el(
        "tr",
        {},
        el("th", {}, "Nom affiché"),
        el("th", {}, "E-mail"),
        el("th", {}, "Accès console"),
        el("th", {}, "Rôle console")
      )
    )
  );
  const tbody = el("tbody");

  for (const u of rows) {
    const isSelf = u.id === usersState.meId;

    const roleSel = el("select", {
      class: "admin-input admin-console-role-select",
      "aria-label": "Rôle console",
    });
    for (const [val, lab] of [
      ["site-editor", "Modificateur du site"],
      ["gestion-candidatures", "Gestion des candidatures"],
      ["super-admin", "Super-administrateur"],
    ]) {
      roleSel.appendChild(el("option", { value: val }, lab));
    }
    roleSel.value = consoleRoleSelectValue(u.role);
    roleSel.disabled = !u.admin;

    const syncRoleFromServer = (row) => {
      if (row?.role) u.role = row.role;
      roleSel.value = consoleRoleSelectValue(u.role);
    };

    roleSel.addEventListener("change", async () => {
      if (!u.admin) return;
      roleSel.disabled = true;
      try {
        const data = await apiFetch(`/api/admin/users/${encodeURIComponent(u.id)}/admin`, {
          method: "PUT",
          body: JSON.stringify({ admin: true, console_role: roleSel.value }),
        });
        syncRoleFromServer(data.row);
        flash("Rôle console mis à jour.");
      } catch (err) {
        roleSel.value = consoleRoleSelectValue(u.role);
        reportError("Mise à jour du rôle impossible", err);
      } finally {
        roleSel.disabled = !u.admin;
      }
    });

    const cb = el("input", {
      type: "checkbox",
      class: "admin-user-admin-cb",
      checked: u.admin,
      disabled: isSelf && u.admin,
      title:
        isSelf && u.admin
          ? "Vous ne pouvez pas retirer vos propres droits depuis cette interface."
          : u.admin
            ? "Retirer l’accès à la console"
            : "Accorder l’accès à la console (rôle choisi dans la liste)",
      on: {
        change: async (ev) => {
          const input = ev.target;
          const next = input.checked;
          input.disabled = true;
          roleSel.disabled = true;
          try {
            if (next) {
              const data = await apiFetch(`/api/admin/users/${encodeURIComponent(u.id)}/admin`, {
                method: "PUT",
                body: JSON.stringify({
                  admin: true,
                  console_role: roleSel.value,
                }),
              });
              u.admin = true;
              syncRoleFromServer(data.row);
              flash("Accès console activé.");
            } else {
              await apiFetch(`/api/admin/users/${encodeURIComponent(u.id)}/admin`, {
                method: "PUT",
                body: JSON.stringify({ admin: false }),
              });
              u.admin = false;
              u.role = null;
              flash("Accès console retiré.");
            }
            renderAuthUsersList();
          } catch (err) {
            input.checked = !next;
            reportError("Mise à jour impossible", err);
          } finally {
            input.disabled = isSelf && u.admin;
            roleSel.disabled = !u.admin;
          }
        },
      },
    });

    tbody.appendChild(
      el(
        "tr",
        {},
        el("td", {}, u.display_name || "—"),
        el("td", {}, u.email || "—"),
        el("td", { style: "text-align:center;" }, cb),
        el("td", {}, roleSel)
      )
    );
  }

  tbl.appendChild(tbody);
  host.appendChild(tbl);
  updateAdminUsersStatus();
}

function bindAuthUsersTab() {
  const btn = document.getElementById("admin-users-refresh");
  const searchInput = document.getElementById("admin-users-search");
  const sortSel = document.getElementById("admin-users-sort");

  btn?.addEventListener("click", async () => {
    try {
      await loadAuthUsersList();
      renderAuthUsersList();
      flash("Liste actualisée.");
    } catch (e) {
      reportError("Actualisation impossible", e);
    }
  });

  searchInput?.addEventListener("input", () => {
    usersState.searchQuery = searchInput.value;
    renderAuthUsersList();
  });

  sortSel?.addEventListener("change", () => {
    usersState.sortKey = sortSel.value || "name-asc";
    renderAuthUsersList();
  });
}

async function bootAuthUsersTab() {
  await loadAuthUsersList();
  renderAuthUsersList();
}

function bindProfileModal(adminEmail) {
  const modal = document.getElementById("admin-profile-modal");
  const openBtn = document.getElementById("admin-open-profile");
  const backdrop = document.getElementById("admin-profile-backdrop");
  const cancel = document.getElementById("admin-profile-cancel");
  const save = document.getElementById("admin-profile-save");
  const emailEl = document.getElementById("admin-profile-email");
  const pw = document.getElementById("admin-profile-password");
  const pw2 = document.getElementById("admin-profile-password2");

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    if (pw) pw.value = "";
    if (pw2) pw2.value = "";
  }

  function openModal() {
    if (!modal || !emailEl) return;
    emailEl.textContent = adminEmail || "—";
    if (pw) pw.value = "";
    if (pw2) pw2.value = "";
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    pw?.focus();
  }

  openBtn?.addEventListener("click", () => openModal());
  backdrop?.addEventListener("click", () => closeModal());
  cancel?.addEventListener("click", () => closeModal());

  save?.addEventListener("click", async () => {
    const a = pw?.value?.trim() || "";
    const b = pw2?.value?.trim() || "";
    if (a.length < 8) {
      flash("Le mot de passe doit contenir au moins 8 caractères.", "error");
      return;
    }
    if (a !== b) {
      flash("Les deux mots de passe ne correspondent pas.", "error");
      return;
    }
    try {
      const { error } = await supabase.auth.updateUser({ password: a });
      if (error) throw error;
      flash("Mot de passe mis à jour.");
      closeModal();
    } catch (e) {
      reportError("Modification du mot de passe impossible", e);
    }
  });

  document.addEventListener("keydown", (ev) => {
    if (ev.key !== "Escape" || !modal || modal.classList.contains("hidden")) return;
    closeModal();
  });
}

// ═════════════════════════ Boot global ═════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  const admin = await ensureAdminOrRedirect();
  if (!admin) return;

  const perms = deriveConsolePermissions(admin);

  applyConsoleLayout(perms);

  document.getElementById("admin-user-email").textContent =
    `${admin.email} · ${formatConsoleRoleLabel(admin.role)}`;
  document.getElementById("admin-logout").addEventListener("click", async () => {
    await supabase.auth.signOut();
    window.location.replace("/login");
  });

  usersState.meId = admin.user_id || "";

  initTabs((tab) => {
    if (tab === "utilisateurs" && perms.users) {
      bootAuthUsersTab().catch((e) => reportError("Utilisateurs", e));
    }
  });
  if (perms.cms) {
    initInscriptionTab({ el, flash, reportError, getFormationKeys, FORMATION_LABELS });
    bindOtherPagesDocs();
    bindEquipeTab();
    bindPartenairesTab();
    try {
      await bootFormationsTab();
      await bootEquipeTab();
      await bootPartenairesTab();
    } catch (e) {
      reportError("Chargement initial", e);
    }
  }

  if (perms.users) {
    bindAuthUsersTab();
  }

  bindProfileModal(admin.email);
});
