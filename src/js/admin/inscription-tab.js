/**
 * Onglet admin — constructeur de formulaires d'inscription (portail candidats).
 * Édition par étapes : une seule étape visible tant qu’on n’a pas validé « Étape suivante ».
 */
import { apiFetch } from "./supabase-client.js";

const FIELD_TYPES = [
  { value: "text", label: "Question simple (texte court)" },
  { value: "textarea", label: "Texte long" },
  { value: "number", label: "Nombre" },
  { value: "single", label: "Choix unique (boutons)" },
  { value: "multi", label: "Choix multiple" },
  { value: "binary", label: "Deux choix (ex. 1 / 2)" },
  { value: "yesno", label: "Oui / Non" },
  { value: "file", label: "Fichier joint" },
];

/** Aligné sur server/inscription-forms.js — ne pas renommer les ids. */
const PORTAL_IDENTITY_STEP_ID = "portal_step_identite";
const PORTAL_FIELD_IDENT_NOM = "portal_ident_nom";
const PORTAL_FIELD_IDENT_PRENOM = "portal_ident_prenom";
const PORTAL_FIELD_IDENT_EMAIL = "portal_ident_email";

function buildPortalIdentityStepAdmin() {
  return {
    id: PORTAL_IDENTITY_STEP_ID,
    title: "Étape 1 — Vos coordonnées",
    blocks: [
      {
        id: PORTAL_FIELD_IDENT_NOM,
        kind: "field",
        type: "text",
        label: "Nom de famille",
        help: "",
        required: true,
      },
      {
        id: PORTAL_FIELD_IDENT_PRENOM,
        kind: "field",
        type: "text",
        label: "Votre prénom",
        help: "",
        required: true,
      },
      {
        id: PORTAL_FIELD_IDENT_EMAIL,
        kind: "field",
        type: "text",
        label: "Adresse e-mail",
        help: "",
        required: true,
      },
    ],
  };
}

function ensureIdentityStepFirst(def) {
  if (!def || typeof def !== "object") return;
  if (!Array.isArray(def.steps)) def.steps = [];
  const canonical = buildPortalIdentityStepAdmin();
  const idx = def.steps.findIndex((s) => s && s.id === PORTAL_IDENTITY_STEP_ID);
  if (idx === 0) {
    def.steps[0] = canonical;
    return;
  }
  if (idx > 0) {
    def.steps.splice(idx, 1);
  }
  def.steps.unshift(canonical);
}

/** Même logique que `targetsApply` côté serveur (portail). */
function inscriptionTemplateCoversPair(tpl, formationSlug, villeSlug) {
  const t = tpl?.targets;
  if (!Array.isArray(t) || t.length === 0) return true;
  const fs = String(formationSlug || "").trim();
  const vs = String(villeSlug || "").trim();
  return t.some(
    (x) =>
      x &&
      String(x.formation_slug || "").trim() === fs &&
      String(x.ville_slug || "").trim() === vs
  );
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Titre par défaut à l’ouverture : l’admin doit le personnaliser. */
const DEFAULT_NEW_TEMPLATE_TITLE = "Nouveau formulaire";

/** Aligné sur server/inscription-forms.js (slugify). */
function slugifyFromInscriptionTitle(s) {
  try {
    return (
      String(s || "")
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 80) || "formulaire"
    );
  } catch {
    return "formulaire";
  }
}

function isPlaceholderInscriptionTitle(title) {
  const t = String(title || "").trim().toLowerCase();
  return !t || t === DEFAULT_NEW_TEMPLATE_TITLE.toLowerCase();
}

/** Remplit le contenu « corps d’étape » comme sur le portail (lecture seule). */
function fillCandidatePreviewBody(helpr, bodyHost, step) {
  bodyHost.textContent = "";
  if (!step) return;

  for (const block of step.blocks || []) {
    if (block.kind === "info") {
      bodyHost.appendChild(
        helpr("div", { class: "portal-insc-info" }, block.body || "")
      );
      continue;
    }
    if (block.kind === "title") {
      bodyHost.appendChild(
        helpr("h3", { class: "portal-insc-block-title" }, block.text || "")
      );
      continue;
    }
    if (block.kind === "description") {
      bodyHost.appendChild(
        helpr("div", { class: "portal-insc-block-desc" }, block.body || "")
      );
      continue;
    }
    if (block.kind !== "field") continue;

    const f = block;
    const wrap = helpr("div", { class: "portal-insc-field" });
    wrap.appendChild(
      helpr(
        "label",
        { class: "portal-insc-field-label" },
        (f.label || "Question") + (f.required ? " *" : "")
      )
    );
    if (f.help) {
      wrap.appendChild(helpr("p", { class: "portal-insc-field-help" }, f.help));
    }

    if (f.type === "text") {
      wrap.appendChild(
        helpr("input", {
          type: "text",
          class: "portal-input",
          disabled: true,
          placeholder: "Réponse courte…",
        })
      );
    } else if (f.type === "number") {
      wrap.appendChild(
        helpr("input", {
          type: "text",
          class: "portal-input",
          disabled: true,
          placeholder: "Saisissez un nombre",
        })
      );
    } else if (f.type === "textarea") {
      wrap.appendChild(
        helpr("textarea", {
          class: "portal-input",
          rows: 3,
          disabled: true,
          placeholder: "Réponse détaillée…",
        })
      );
    } else if (f.type === "yesno") {
      const row = helpr("div", { class: "portal-insc-btn-row" });
      row.appendChild(helpr("button", { type: "button", class: "btn btn--choice", disabled: true }, "Oui"));
      row.appendChild(helpr("button", { type: "button", class: "btn btn--choice", disabled: true }, "Non"));
      wrap.appendChild(row);
    } else if (f.type === "binary") {
      const row = helpr("div", { class: "portal-insc-btn-row" });
      const leftL = f.label_left ?? "1";
      const rightL = f.label_right ?? "2";
      row.appendChild(
        helpr("button", { type: "button", class: "btn btn--choice", disabled: true }, leftL)
      );
      row.appendChild(
        helpr("button", { type: "button", class: "btn btn--choice", disabled: true }, rightL)
      );
      wrap.appendChild(row);
    } else if (f.type === "single") {
      const row = helpr("div", { class: "portal-insc-btn-row" });
      const opts = (f.options || []).length ? f.options : ["Option A", "Option B"];
      for (const opt of opts.slice(0, 6)) {
        row.appendChild(
          helpr("button", { type: "button", class: "btn btn--choice", disabled: true }, opt)
        );
      }
      wrap.appendChild(row);
    } else if (f.type === "multi") {
      const opts = (f.options || []).length ? f.options : ["Option A", "Option B"];
      for (const opt of opts.slice(0, 8)) {
        const row = helpr("label", { class: "portal-insc-check" });
        row.appendChild(helpr("input", { type: "checkbox", disabled: true }));
        row.appendChild(document.createTextNode(" " + opt));
        wrap.appendChild(row);
      }
    } else if (f.type === "file") {
      wrap.appendChild(
        helpr("p", { class: "portal-insc-file-name" }, "Le candidat déposera un fichier ici.")
      );
      wrap.appendChild(
        helpr("input", { type: "file", class: "portal-insc-file", disabled: true })
      );
    }

    bodyHost.appendChild(wrap);
  }
}

export function initInscriptionTab(ctx) {
  const { el, flash, reportError, getFormationKeys, FORMATION_LABELS } = ctx;
  const root = document.getElementById("inscription-builder-root");
  if (!root) return;

  const formationChoices = getFormationKeys();

  let templates = [];
  let selected = null;
  /** Index de l’étape en cours dans l’éditeur (une étape affichée à la fois) */
  let builderStepIndex = 0;

  const listEl = el("div", { class: "admin-inscription-list admin-inscription-list--rail" });
  const editorEl = el("div", { class: "admin-inscription-editor" });
  const previewCol = el("div", { class: "admin-inscription-preview-col" });
  const workbench = el("div", { class: "admin-inscription-workbench" }, editorEl, previewCol);
  root.appendChild(el("div", { class: "admin-inscription-shell" }, listEl, workbench));

  function defaultDefinition() {
    const sid = crypto.randomUUID();
    const t1 = crypto.randomUUID();
    const d1 = crypto.randomUUID();
    return {
      steps: [
        buildPortalIdentityStepAdmin(),
        {
          id: sid,
          title: "Étape 2",
          blocks: [
            { id: t1, kind: "title", text: "" },
            {
              id: d1,
              kind: "description",
              body: "",
            },
          ],
        },
      ],
    };
  }

  async function refreshList() {
    try {
      const r = await apiFetch("/api/admin/inscription-templates");
      templates = r.items || [];
      renderList();
      if (selected && !templates.find((t) => t.id === selected.id)) {
        selected = null;
        renderEditor();
      } else if (selected) {
        const up = templates.find((t) => t.id === selected.id);
        if (up) selected = up;
        renderEditor();
      }
    } catch (e) {
      reportError("Formulaires d’inscription", e);
      /* Remettre l’UI (liste + message éditeur) même si l’API échoue — évite une carte blanche. */
      renderList();
      renderEditor();
    }
  }

  function renderList() {
    listEl.textContent = "";
    listEl.appendChild(
      el(
        "div",
        { class: "admin-inscription-rail-head" },
        el("h3", { class: "admin-inscription-rail-title" }, "Modèles"),
        el(
          "p",
          { class: "admin-inscription-rail-lead" },
          "Étapes, blocs et questions — le candidat avance comme sur le portail."
        )
      )
    );
    const newBtn = el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--primary admin-inscription-new-btn",
        on: {
          click: async () => {
            try {
              builderStepIndex = 0;
              const def = defaultDefinition();
              const r = await apiFetch("/api/admin/inscription-templates", {
                method: "POST",
                body: JSON.stringify({
                  title: "Nouveau formulaire",
                  slug: "",
                  is_published: false,
                  targets: [],
                  definition: def,
                }),
              });
              if (r.slug_adjusted && r.item?.slug) {
                flash(
                  `Modèle créé. Slug automatique : « ${r.item.slug} » (le slug par défaut était déjà utilisé).`
                );
              } else {
                flash("Modèle créé.");
              }
              selected = r.item;
              await refreshList();
            } catch (e) {
              reportError("Création", e);
            }
          },
        },
      },
      "+ Nouveau modèle"
    );
    listEl.appendChild(newBtn);
    const ul = el("div", { class: "admin-inscription-cards" });
    for (const t of templates) {
      const isPub = Boolean(t.is_published);
      const card = el(
        "button",
        {
          type: "button",
          class: `admin-inscription-card${selected?.id === t.id ? " is-active" : ""}`,
          on: {
            click: async () => {
              try {
                const r = await apiFetch(`/api/admin/inscription-templates/${t.id}`);
                selected = r.item;
                builderStepIndex = 0;
                renderList();
                renderEditor();
              } catch (e) {
                reportError("Chargement", e);
              }
            },
          },
        },
        el("div", { class: "admin-inscription-card__top" }, [
          el("div", { class: "admin-inscription-card__title" }, t.title),
          el(
            "span",
            {
              class: `admin-inscription-status${isPub ? " admin-inscription-status--live" : ""}`,
            },
            isPub ? "Publié" : "Brouillon"
          ),
        ]),
        el(
          "div",
          { class: "admin-inscription-card__slug" },
          el("span", {}, t.slug || "—")
        )
      );
      ul.appendChild(card);
    }
    listEl.appendChild(ul);
  }

  function readBlockFromEl(blockEl) {
    const kind = blockEl.dataset.blockKind;
    const id = blockEl.dataset.blockId || crypto.randomUUID();
    if (kind === "info") {
      return {
        id,
        kind: "info",
        body: blockEl.querySelector(".ins-info-body")?.value ?? "",
      };
    }
    if (kind === "title") {
      return {
        id,
        kind: "title",
        text: blockEl.querySelector(".ins-title-text")?.value ?? "",
      };
    }
    if (kind === "description") {
      return {
        id,
        kind: "description",
        body: blockEl.querySelector(".ins-desc-body")?.value ?? "",
      };
    }
    if (kind === "field") {
      const type = blockEl.querySelector(".ins-field-type")?.value || "text";
      const label = blockEl.querySelector(".ins-field-label")?.value?.trim() || "Question";
      const help = blockEl.querySelector(".ins-field-help")?.value?.trim() || "";
      const required = blockEl.querySelector(".ins-field-req")?.checked === true;
      const optStr = blockEl.querySelector(".ins-field-options")?.value ?? "";
      const options = optStr
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const block = {
        id,
        kind: "field",
        type,
        label,
        help,
        required,
      };
      if (type === "single" || type === "multi") {
        block.options = options.length ? options : ["Oui", "Non"];
      }
      if (type === "binary") {
        block.label_left =
          blockEl.querySelector(".ins-binary-left")?.value?.trim().slice(0, 80) || "1";
        block.label_right =
          blockEl.querySelector(".ins-binary-right")?.value?.trim().slice(0, 80) || "2";
      }
      return block;
    }
    return null;
  }

  function readCurrentStepFromDom(stepEl) {
    if (!stepEl) return null;
    if (stepEl.dataset.stepId === PORTAL_IDENTITY_STEP_ID) {
      return buildPortalIdentityStepAdmin();
    }
    const si = Number(stepEl.dataset.builderStepIndex);
    const stitle = stepEl.querySelector(".ins-step-title")?.value?.trim() || `Étape ${si + 1}`;
    const blocks = [];
    stepEl.querySelectorAll("[data-block-index]").forEach((blockEl) => {
      const b = readBlockFromEl(blockEl);
      if (b) blocks.push(b);
    });
    return {
      id: stepEl.dataset.stepId || crypto.randomUUID(),
      title: stitle,
      blocks,
    };
  }

  function validateStepData(step) {
    if (!String(step.title || "").trim()) {
      return { ok: false, msg: "Indiquez un titre pour cette étape (en haut de la carte)." };
    }
    for (const b of step.blocks || []) {
      if (b.kind === "field" && !String(b.label || "").trim()) {
        return { ok: false, msg: "Chaque question doit avoir un libellé." };
      }
    }
    return { ok: true };
  }

  function syncStepFromDom(stepIndex) {
    const d = selected.definition;
    if (!d?.steps?.[stepIndex]) return;
    const stepEl = stepsHost?.querySelector?.(`[data-builder-step-index="${stepIndex}"]`);
    if (!stepEl) return;
    const read = readCurrentStepFromDom(stepEl);
    if (read) d.steps[stepIndex] = read;
  }

  function collectFullDefinitionFromMemory() {
    return { steps: selected.definition.steps };
  }

  let stepsHost = null;

  function renderEditor() {
    editorEl.textContent = "";
    previewCol.textContent = "";
    stepsHost = null;
    if (!selected) {
      editorEl.appendChild(
        el("p", { class: "muted admin-inscription-editor-empty" }, "Sélectionnez un modèle dans la colonne de gauche, ou créez-en un nouveau.")
      );
      previewCol.appendChild(
        el(
          "div",
          { class: "admin-insc-preview-placeholder" },
          el("span", { class: "admin-insc-preview-placeholder__label" }, "Aperçu"),
          el("h4", { class: "admin-insc-preview-placeholder__title" }, "Vue portail candidat"),
          el(
            "p",
            { class: "admin-insc-preview-placeholder__text" },
            "Choisissez un modèle pour afficher ici le rendu de l’étape en cours, comme sur /compte/inscription."
          )
        )
      );
      return;
    }

    const def = selected.definition && selected.definition.steps ? selected.definition : defaultDefinition();
    if (!selected.definition?.steps?.length) selected.definition = def;
    ensureIdentityStepFirst(selected.definition);
    if (builderStepIndex >= selected.definition.steps.length) {
      builderStepIndex = Math.max(0, selected.definition.steps.length - 1);
    }

    const titleInp = el("input", {
      class: "admin-input",
      value: selected.title,
      id: "ins-tpl-title",
    });
    const slugInp = el("input", { class: "admin-input", value: selected.slug, id: "ins-tpl-slug" });
    const titleWarn = el("p", {
      class: "admin-inscription-title-warn",
      id: "ins-tpl-title-warn",
      hidden: true,
      "aria-live": "polite",
    });
    function syncTitleWarning() {
      if (isPlaceholderInscriptionTitle(titleInp.value)) {
        titleWarn.hidden = false;
        titleWarn.textContent =
          "Donnez un nom spécifique à ce formulaire : remplacez « Nouveau formulaire » par un libellé clair (ex. inscription + formation + ville).";
      } else {
        titleWarn.hidden = true;
        titleWarn.textContent = "";
      }
    }
    titleInp.addEventListener("input", () => {
      slugInp.value = slugifyFromInscriptionTitle(titleInp.value);
      syncTitleWarning();
    });
    syncTitleWarning();

    const slugHint = el(
      "p",
      { class: "admin-inscription-slug-hint muted" },
      "Mis à jour automatiquement quand vous modifiez le titre ; vous pouvez ajuster le slug à la main si besoin."
    );
    const pubInp = el("input", {
      type: "checkbox",
      id: "ins-tpl-pub",
      ...(selected.is_published ? { checked: true } : {}),
    });

    const targetsWrap = el("div", { class: "admin-field admin-inscription-targets-field" });
    targetsWrap.appendChild(
      el("label", {}, "Cibles formation / ville (vide = toutes les combinaisons du site)")
    );
    targetsWrap.appendChild(
      el(
        "p",
        { class: "admin-inscription-targets-hint muted" },
        "Les cases grisées sont déjà couvertes par un autre modèle publié (cible explicite ou « toutes les combinaisons »). Le portail n’affiche qu’un formulaire par couple formation / ville."
      )
    );
    const targetGrid = el("div", {
      class: "admin-inscription-targets",
    });
    const targetState = new Map();
    for (const pair of selected.targets || []) {
      const k = `${pair.formation_slug}|${pair.ville_slug}`;
      targetState.set(k, true);
    }
    const curId = selected?.id || null;
    for (const { slug, ville, key } of formationChoices) {
      const id = `ins-tgt-${key.replace(/[^a-z0-9]+/gi, "-")}`;
      const blocking = templates.filter(
        (t) =>
          t.is_published &&
          t.id !== curId &&
          inscriptionTemplateCoversPair(t, slug, ville)
      );
      const isBlocked = blocking.length > 0;
      const chk = el("input", {
        type: "checkbox",
        id,
        disabled: isBlocked,
        ...(targetState.has(key) && !isBlocked ? { checked: true } : {}),
        dataset: { formation: slug, ville },
      });
      const rowContent = el("div", { class: "admin-inscription-target-row__content" });
      rowContent.appendChild(
        el(
          "span",
          { class: "admin-inscription-target-row__line" },
          `${FORMATION_LABELS[slug] || slug} — ${ville}`
        )
      );
      if (isBlocked) {
        const names = blocking
          .map((t) => `« ${String(t.title || t.slug || "Sans titre").trim()} »`)
          .join(", ");
        rowContent.appendChild(
          el("span", { class: "admin-inscription-target-row__blocked-note" }, `Déjà utilisé par ${names}.`)
        );
      }
      const rowLabel = el(
        "label",
        {
          class: `admin-inscription-target-row${isBlocked ? " admin-inscription-target-row--blocked" : ""}`,
          for: id,
        },
        chk,
        rowContent
      );
      targetGrid.appendChild(rowLabel);
    }
    targetsWrap.appendChild(targetGrid);

    function collectTargets() {
      const targets = [];
      targetGrid.querySelectorAll('input[type="checkbox"]').forEach((inp) => {
        if (inp.checked && !inp.disabled)
          targets.push({
            formation_slug: inp.dataset.formation,
            ville_slug: inp.dataset.ville,
          });
      });
      return targets;
    }

    stepsHost = el("div", { class: "admin-inscription-steps" });

    const d = selected.definition;

    const previewTrack = el(
      "div",
      { class: "portal-insc-progress-track", dataset: { tier: "low" } },
      el("span", { class: "portal-insc-progress-fill" })
    );
    const previewLabel = el("p", { class: "portal-insc-progress-label" }, "");
    const previewTitleEl = el("h2", { class: "portal-insc-step-title" }, "");
    const previewBodyEl = el("div", { class: "admin-insc-preview-body" });

    function refreshCandidatePreview() {
      syncStepFromDom(builderStepIndex);
      const n = Math.max(1, d.steps?.length || 1);
      const si = Math.min(builderStepIndex, n - 1);
      const pct = Math.min(100, Math.round(((si + 1) / n) * 100));
      previewTrack.style.setProperty("--pct", `${pct}%`);
      previewTrack.dataset.tier = pct >= 85 ? "high" : pct >= 40 ? "mid" : "low";
      previewLabel.textContent = `Progression (aperçu) · ${pct} % · étape ${si + 1} / ${n}`;
      const step = d.steps[si];
      previewTitleEl.textContent = step?.title?.trim() || `Étape ${si + 1}`;
      fillCandidatePreviewBody(el, previewBodyEl, step);
    }

    const schedulePreviewRefresh = debounce(refreshCandidatePreview, 150);

    previewCol.appendChild(
      el(
        "div",
        { class: "admin-insc-preview-sticky" },
        el(
          "div",
          { class: "admin-insc-preview-header" },
          el("span", { class: "admin-insc-preview-badge" }, "Aperçu temps réel"),
          el("h4", { class: "admin-insc-preview-heading" }, "Vue candidat"),
          el(
            "p",
            { class: "admin-insc-preview-sub" },
            "Rendu aligné sur le portail (champs désactivés)."
          )
        ),
        el(
          "div",
          { class: "admin-insc-browser-chrome" },
          el(
            "div",
            { class: "admin-insc-browser-dots" },
            el("span", { class: "admin-insc-browser-dot" }),
            el("span", { class: "admin-insc-browser-dot" }),
            el("span", { class: "admin-insc-browser-dot" })
          ),
          el("span", { class: "admin-insc-browser-url" }, "compte / inscription")
        ),
        el(
          "div",
          { class: "admin-insc-site-preview" },
          el(
            "div",
            { class: "portal-insc-panel" },
            el(
              "div",
              { class: "portal-insc-head" },
              el(
                "div",
                { class: "portal-insc-progress-wrap" },
                previewTrack,
                previewLabel
              )
            ),
            previewTitleEl,
            previewBodyEl,
            el(
              "div",
              { class: "portal-insc-actions" },
              el(
                "button",
                { type: "button", class: "admin-btn admin-btn--sm", disabled: true },
                "← Précédent"
              ),
              el(
                "button",
                {
                  type: "button",
                  class: "admin-btn admin-btn--primary admin-btn--sm",
                  disabled: true,
                },
                "Suivant →"
              )
            )
          )
        )
      )
    );

    const wizardHead = el("div", {
      class: "admin-insc-wizard-head",
    });
    const stepLabel = el("strong", { class: "admin-insc-wizard-title" }, "");
    const dotsWrap = el("div", {
      class: "admin-insc-wizard-dots",
    });

    let updateDeleteCurrentStepUi = () => {};

    function updateWizardHead() {
      const n = d.steps.length;
      const si = builderStepIndex;
      stepLabel.textContent = `Construire le formulaire — étape ${si + 1} / ${n}`;
      dotsWrap.textContent = "";
      for (let j = 0; j < n; j++) {
        const isActive = j === si;
        const canGo = j <= si;
        const dot = el(
          "button",
          {
            type: "button",
            class: `admin-insc-step-dot${isActive ? " is-active" : ""}${canGo ? "" : " is-locked"}`,
            disabled: j > si,
            title: canGo ? `Aller à l’étape ${j + 1}` : "Terminez d’abord les étapes précédentes",
            on: {
              click: () => {
                if (!canGo || j === si) return;
                syncStepFromDom(builderStepIndex);
                builderStepIndex = j;
                renderStepPane();
                updateWizardHead();
              },
            },
          },
          String(j + 1)
        );
        dotsWrap.appendChild(dot);
      }
      updateDeleteCurrentStepUi();
    }

    const btnPrev = el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--sm",
        disabled: builderStepIndex <= 0,
        on: {
          click: () => {
            syncStepFromDom(builderStepIndex);
            if (builderStepIndex > 0) {
              builderStepIndex--;
              renderStepPane();
              updateWizardHead();
            }
          },
        },
      },
      "← Étape précédente"
    );

    const btnNext = el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--primary admin-btn--sm",
        on: {
          click: () => {
            syncStepFromDom(builderStepIndex);
            const step = d.steps[builderStepIndex];
            const v = validateStepData(step);
            if (!v.ok) {
              flash(v.msg, "error");
              return;
            }
            if (builderStepIndex < d.steps.length - 1) {
              builderStepIndex++;
              renderStepPane();
              updateWizardHead();
            }
          },
        },
      },
      "Étape suivante →"
    );

    const btnAddStep = el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--sm",
        on: {
          click: () => {
            syncStepFromDom(builderStepIndex);
            const v = validateStepData(d.steps[builderStepIndex]);
            if (!v.ok) {
              flash(`Pour ajouter une étape, terminez d’abord celle-ci : ${v.msg}`, "error");
              return;
            }
            const nid = crypto.randomUUID();
            d.steps.push({
              id: nid,
              title: `Étape ${d.steps.length + 1}`,
              blocks: [
                {
                  id: crypto.randomUUID(),
                  kind: "title",
                  text: "",
                },
                {
                  id: crypto.randomUUID(),
                  kind: "description",
                  body: "",
                },
              ],
            });
            builderStepIndex = d.steps.length - 1;
            renderStepPane();
            updateWizardHead();
            updateNextBtnState();
          },
        },
      },
      "+ Nouvelle étape"
    );

    wizardHead.appendChild(btnPrev);
    wizardHead.appendChild(stepLabel);
    wizardHead.appendChild(dotsWrap);
    wizardHead.appendChild(btnNext);
    wizardHead.appendChild(btnAddStep);

    const stepPane = el("div", { class: "admin-insc-step-pane" });

    function updateNextBtnState() {
      btnPrev.disabled = builderStepIndex <= 0;
      const last = builderStepIndex >= d.steps.length - 1;
      btnNext.textContent = last ? "Dernière étape (validez puis « Nouvelle étape » si besoin)" : "Étape suivante →";
      btnNext.disabled = last;
      btnNext.style.opacity = last ? "0.65" : "1";
    }

    /** Toujours muter l’étape réelle dans `d.steps` : syncStepFromDom peut remplacer l’objet et invalider une ref `step` capturée au rendu. */
    function removeBlockById(blockId) {
      const st = d.steps[builderStepIndex];
      if (!st?.blocks) return;
      const idx = st.blocks.findIndex((x) => x.id === blockId);
      if (idx >= 0) st.blocks.splice(idx, 1);
      renderStepPane();
    }

    function renderBlockEditor(step, bi, block) {
      if (block.kind === "info") {
        const bEl = el("div", {
          class: "admin-field admin-insc-block-shell admin-insc-block-shell--info",
          dataset: { blockIndex: String(bi), blockKind: "info", blockId: block.id },
        });
        bEl.appendChild(
          el(
            "div",
            { style: "display:flex;justify-content:space-between;align-items:center;" },
            [
              el("strong", { style: "font-size:13px;" }, "Bloc information (ancien format)"),
              el(
                "button",
                {
                  type: "button",
                  class: "admin-btn admin-btn--sm",
                  on: {
                    click: () => removeBlockById(block.id),
                  },
                },
                "Supprimer"
              ),
            ]
          )
        );
        bEl.appendChild(el("label", {}, "Texte"));
        const infoTa = el("textarea", {
          class: "admin-input ins-info-body",
          rows: 4,
        });
        infoTa.value = block.body || "";
        bEl.appendChild(infoTa);
        return bEl;
      }
      if (block.kind === "title") {
        const bEl = el("div", {
          class: "admin-field admin-insc-block-shell admin-insc-block-shell--title",
          dataset: { blockIndex: String(bi), blockKind: "title", blockId: block.id },
        });
        bEl.appendChild(
          el(
            "div",
            { style: "display:flex;justify-content:space-between;align-items:center;" },
            [
              el("strong", { style: "font-size:13px;color:var(--admin-accent-dark,#D5343F);" }, "Titre de bloc"),
              el(
                "button",
                {
                  type: "button",
                  class: "admin-btn admin-btn--sm",
                  on: {
                    click: () => removeBlockById(block.id),
                  },
                },
                "Supprimer"
              ),
            ]
          )
        );
        bEl.appendChild(el("label", {}, "Titre affiché au candidat"));
        bEl.appendChild(
          el("input", {
            class: "admin-input ins-title-text",
            value: block.text || "",
            placeholder: "ex. Vos coordonnées",
          })
        );
        return bEl;
      }
      if (block.kind === "description") {
        const bEl = el("div", {
          class: "admin-field admin-insc-block-shell admin-insc-block-shell--desc",
          dataset: { blockIndex: String(bi), blockKind: "description", blockId: block.id },
        });
        bEl.appendChild(
          el(
            "div",
            { style: "display:flex;justify-content:space-between;align-items:center;" },
            [
              el("strong", { style: "font-size:13px;color:#2563eb;" }, "Description de bloc"),
              el(
                "button",
                {
                  type: "button",
                  class: "admin-btn admin-btn--sm",
                  on: {
                    click: () => removeBlockById(block.id),
                  },
                },
                "Supprimer"
              ),
            ]
          )
        );
        bEl.appendChild(el("label", {}, "Paragraphe d’explication"));
        const descTa = el("textarea", {
          class: "admin-input ins-desc-body",
          rows: 4,
        });
        descTa.value = block.body || "";
        bEl.appendChild(descTa);
        return bEl;
      }
      /* field */
      const bEl = el("div", {
        class: "admin-field admin-insc-block-shell admin-insc-block-shell--field",
        dataset: { blockIndex: String(bi), blockKind: "field", blockId: block.id },
      });
      bEl.appendChild(
        el(
          "div",
          { style: "display:flex;justify-content:space-between;align-items:center;" },
          [
            el("strong", { style: "font-size:13px;" }, "Question"),
            el(
              "button",
              {
                type: "button",
                class: "admin-btn admin-btn--sm",
                on: {
                  click: () => removeBlockById(block.id),
                },
              },
              "Supprimer"
            ),
          ]
        )
      );
      const typeSel = el("select", { class: "admin-input ins-field-type" });
      for (const ft of FIELD_TYPES) {
        typeSel.appendChild(
          el("option", { value: ft.value, ...(block.type === ft.value ? { selected: true } : {}) }, ft.label)
        );
      }
      bEl.appendChild(el("label", {}, "Type de question"));
      bEl.appendChild(typeSel);
      bEl.appendChild(el("label", { style: "margin-top:8px;display:block;" }, "Libellé de la question"));
      bEl.appendChild(
        el("input", { class: "admin-input ins-field-label", value: block.label || "" })
      );
      bEl.appendChild(el("label", { style: "margin-top:8px;display:block;" }, "Aide (optionnel)"));
      bEl.appendChild(el("input", { class: "admin-input ins-field-help", value: block.help || "" }));

      const optRow = el("div", { class: "admin-field ins-opt-row" });
      optRow.appendChild(
        el(
          "label",
          {},
          "Options (choix unique / multiple) — une par ligne ou séparées par des virgules"
        )
      );
      const optTa = el("textarea", {
        class: "admin-input ins-field-options",
        rows: 2,
      });
      optTa.value = Array.isArray(block.options) ? block.options.join("\n") : "";
      optRow.appendChild(optTa);

      const binaryRow = el("div", {
        class: "admin-field ins-binary-row",
        style: "display:grid;grid-template-columns:1fr 1fr;gap:10px;",
      });
      binaryRow.appendChild(el("div", {}, el("label", {}, "Libellé 1er bouton")));
      binaryRow.appendChild(el("div", {}, el("label", {}, "Libellé 2e bouton")));
      binaryRow.appendChild(
        el("input", {
          class: "admin-input ins-binary-left",
          value: block.label_left ?? "1",
          placeholder: "ex. 1",
        })
      );
      binaryRow.appendChild(
        el("input", {
          class: "admin-input ins-binary-right",
          value: block.label_right ?? "2",
          placeholder: "ex. 2",
        })
      );

      const syncTypeUi = () => {
        const v = typeSel.value;
        optRow.style.display = v === "single" || v === "multi" ? "block" : "none";
        binaryRow.style.display = v === "binary" ? "grid" : "none";
      };
      typeSel.addEventListener("change", () => {
        syncTypeUi();
        schedulePreviewRefresh();
      });
      bEl.appendChild(optRow);
      bEl.appendChild(binaryRow);
      syncTypeUi();

      bEl.appendChild(
        el("label", { style: "margin-top:8px;display:flex;gap:8px;align-items:center;" }, [
          el("input", {
            type: "checkbox",
            class: "ins-field-req",
            ...(block.required ? { checked: true } : {}),
          }),
          "Réponse obligatoire",
        ])
      );
      return bEl;
    }

    function renderStepPane() {
      stepPane.textContent = "";
      const si = builderStepIndex;
      const step = d.steps[si];
      if (!step) {
        updateDeleteCurrentStepUi();
        return;
      }

      if (step.id === PORTAL_IDENTITY_STEP_ID) {
        const locked = el("div", {
          class: "admin-card admin-insc-step-editor-card admin-insc-step-editor-card--identity",
          dataset: { builderStepIndex: String(si), stepId: step.id },
        });
        locked.appendChild(
          el(
            "p",
            { class: "muted", style: "margin:0 0 12px;line-height:1.45;" },
            el("strong", {}, "Étape fixe — "),
            "trois champs obligatoires, toujours en tête sur le portail. Les valeurs sont aussi enregistrées sur le dossier."
          )
        );
        locked.appendChild(
          el("div", { class: "admin-field" }, el("label", {}, "Titre affiché aux candidats"), el("input", { class: "admin-input", value: step.title || "Étape 1 — Vos coordonnées", disabled: true }))
        );
        for (const block of step.blocks || []) {
          if (block.kind !== "field") continue;
          locked.appendChild(
            el(
              "div",
              { class: "admin-field", style: "opacity:0.92;" },
              el("label", {}, (block.label || "Champ") + (block.required ? " *" : "")),
              el("input", { class: "admin-input", disabled: true, placeholder: "Saisie côté candidat", value: "" })
            )
          );
        }
        stepPane.appendChild(locked);
        updateNextBtnState();
        refreshCandidatePreview();
        updateDeleteCurrentStepUi();
        return;
      }

      const stepEl = el("div", {
        class: "admin-card admin-insc-step-editor-card",
        dataset: { builderStepIndex: String(si), stepId: step.id },
      });
      stepEl.appendChild(
        el(
          "div",
          { class: "admin-grid", style: "align-items:end;margin-bottom:8px;" },
          [
            el("div", { class: "admin-field", style: "flex:1;" }, [
              el("label", {}, `Titre interne de l’étape ${si + 1}`),
              el("input", { class: "admin-input ins-step-title", value: step.title }),
            ]),
            d.steps.length > 1
              ? el(
                  "button",
                  {
                    type: "button",
                    class: "admin-btn admin-btn--sm",
                    title: "Supprimer cette étape",
                    on: {
                      click: () => {
                        if (d.steps[si]?.id === PORTAL_IDENTITY_STEP_ID) {
                          flash("L’étape « coordonnées » (nom, prénom, e-mail) ne peut pas être supprimée.", "error");
                          return;
                        }
                        if (!confirm("Supprimer cette étape et tous ses blocs ?")) return;
                        syncStepFromDom(builderStepIndex);
                        d.steps.splice(si, 1);
                        builderStepIndex = Math.min(builderStepIndex, d.steps.length - 1);
                        if (!d.steps.length) d.steps.push(buildPortalIdentityStepAdmin());
                        renderStepPane();
                        updateWizardHead();
                        updateNextBtnState();
                      },
                    },
                  },
                  "Supprimer l’étape"
                )
              : el("span", {}, ""),
          ]
        )
      );

      (step.blocks || []).forEach((block, bi) => {
        stepEl.appendChild(renderBlockEditor(step, bi, block));
      });

      const addRow = el("div", { class: "admin-insc-add-blocks-row" });
      const pushBlock = (b) => {
        const st = d.steps[builderStepIndex];
        if (!st) return;
        if (!Array.isArray(st.blocks)) st.blocks = [];
        st.blocks.push(b);
        renderStepPane();
      };
      addRow.appendChild(
        el(
          "button",
          { type: "button", class: "admin-btn admin-btn--sm", on: { click: () => pushBlock({ id: crypto.randomUUID(), kind: "title", text: "" }) } },
          "+ Titre de bloc"
        )
      );
      addRow.appendChild(
        el(
          "button",
          {
            type: "button",
            class: "admin-btn admin-btn--sm",
            on: {
              click: () => pushBlock({ id: crypto.randomUUID(), kind: "description", body: "" }),
            },
          },
          "+ Description"
        )
      );
      addRow.appendChild(
        el(
          "button",
          {
            type: "button",
            class: "admin-btn admin-btn--sm",
            on: {
              click: () =>
                pushBlock({
                  id: crypto.randomUUID(),
                  kind: "field",
                  type: "text",
                  label: "",
                  help: "",
                  required: false,
                }),
            },
          },
          "+ Question"
        )
      );
      addRow.appendChild(
        el(
          "button",
          {
            type: "button",
            class: "admin-btn admin-btn--sm",
            on: {
              click: () =>
                pushBlock({
                  id: crypto.randomUUID(),
                  kind: "info",
                  body: "",
                }),
            },
          },
          "+ Info (texte simple)"
        )
      );
      stepEl.appendChild(addRow);
      stepPane.appendChild(stepEl);
      updateNextBtnState();
      refreshCandidatePreview();
      updateDeleteCurrentStepUi();
    }

    stepsHost.appendChild(
      el(
        "p",
        {
          class: "admin-insc-builder-hint",
        },
        "Vous construisez une étape à la fois : validez avec « Étape suivante » avant de passer à la suivante. Les étapes grisées ne sont pas encore accessibles côté candidat."
      )
    );
    stepsHost.appendChild(wizardHead);
    stepsHost.appendChild(stepPane);

    stepsHost.addEventListener("input", schedulePreviewRefresh);
    stepsHost.addEventListener("change", schedulePreviewRefresh);

    updateWizardHead();
    renderStepPane();

    const saveBtn = el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--primary",
        on: {
          click: async () => {
            try {
              syncStepFromDom(builderStepIndex);
              const cur = d.steps[builderStepIndex];
              const v = validateStepData(cur);
              if (!v.ok) {
                flash(`Étape ${builderStepIndex + 1} : ${v.msg}`, "error");
                return;
              }
              const definition = collectFullDefinitionFromMemory();
              const rawTitle = titleInp.value.trim();
              if (isPlaceholderInscriptionTitle(rawTitle)) {
                flash(
                  "Donnez un nom à ce formulaire avant d’enregistrer (remplacez « Nouveau formulaire » par un libellé reconnaissable).",
                  "error"
                );
                titleInp.focus();
                syncTitleWarning();
                return;
              }
              const body = {
                title: rawTitle,
                slug:
                  slugInp.value.trim().toLowerCase() ||
                  slugifyFromInscriptionTitle(rawTitle) ||
                  "formulaire",
                is_published: pubInp.checked,
                targets: collectTargets(),
                definition,
              };
              const r = await apiFetch(`/api/admin/inscription-templates/${selected.id}`, {
                method: "PUT",
                body: JSON.stringify(body),
              });
              selected = r.item;
              if (builderStepIndex >= selected.definition.steps.length) {
                builderStepIndex = Math.max(0, selected.definition.steps.length - 1);
              }
              if (r.slug_adjusted && r.item?.slug) {
                flash(
                  `Formulaire enregistré — slug final : « ${r.item.slug} » (identifiant déjà utilisé, ajustement automatique).`
                );
              } else {
                flash("Formulaire enregistré.");
              }
              await refreshList();
            } catch (e) {
              reportError("Enregistrement", e);
            }
          },
        },
      },
      "Enregistrer"
    );

    const deleteCurrentStepBtn = el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--danger",
        on: {
          click: () => {
            syncStepFromDom(builderStepIndex);
            const si = builderStepIndex;
            if (d.steps[si]?.id === PORTAL_IDENTITY_STEP_ID) {
              flash("L’étape « coordonnées » (nom, prénom, e-mail) ne peut pas être supprimée.", "error");
              return;
            }
            if (d.steps.length <= 1) {
              flash("Il doit rester au moins une étape.", "error");
              return;
            }
            if (!confirm(`Supprimer l’étape ${si + 1} et tous ses blocs ?`)) return;
            d.steps.splice(si, 1);
            builderStepIndex = Math.min(builderStepIndex, d.steps.length - 1);
            if (!d.steps.length) d.steps.push(buildPortalIdentityStepAdmin());
            renderStepPane();
            updateWizardHead();
            updateNextBtnState();
          },
        },
      },
      "Supprimer l’étape"
    );

    updateDeleteCurrentStepUi = () => {
      const si = builderStepIndex;
      const step = d.steps[si];
      const isIdentity = step?.id === PORTAL_IDENTITY_STEP_ID;
      const onlyOne = d.steps.length <= 1;
      const cantDelete = isIdentity || onlyOne;
      deleteCurrentStepBtn.textContent = `Supprimer l’étape ${si + 1}`;
      deleteCurrentStepBtn.disabled = cantDelete;
      deleteCurrentStepBtn.title = cantDelete
        ? isIdentity
          ? "L’étape coordonnées (nom, prénom, e-mail) est obligatoire."
          : "Il doit rester au moins une étape."
        : `Retirer l’étape ${si + 1} du formulaire (sans supprimer le modèle entier).`;
    };

    const delBtn = el(
      "button",
      {
        type: "button",
        class: "admin-btn admin-btn--danger",
        on: {
          click: async () => {
            if (!confirm("Supprimer ce modèle et toutes les candidatures liées ?")) return;
            try {
              await apiFetch(`/api/admin/inscription-templates/${selected.id}`, { method: "DELETE" });
              flash("Modèle supprimé.");
              selected = null;
              await refreshList();
              renderEditor();
            } catch (e) {
              reportError("Suppression", e);
            }
          },
        },
      },
      "Supprimer le modèle"
    );

    editorEl.appendChild(
      el(
        "div",
        { class: "admin-inscription-meta-card" },
        el("h3", { class: "admin-inscription-panel-title" }, "Paramètres du modèle"),
          el(
            "div",
            { class: "admin-grid admin-inscription-meta-grid" },
            el(
              "div",
              { class: "admin-field" },
              el("label", { for: "ins-tpl-title" }, "Titre interne"),
              titleInp,
              titleWarn
            ),
            el(
              "div",
              { class: "admin-field" },
              el("label", { for: "ins-tpl-slug" }, "Slug URL (unique)"),
              slugInp,
              slugHint
            )
          ),
        el(
          "label",
          { class: "admin-inscription-pub-row" },
          pubInp,
          el("span", {}, "Publié (visible sur le portail candidat)")
        ),
        targetsWrap
      )
    );
    editorEl.appendChild(
      el(
        "div",
        { class: "admin-inscription-builder-card" },
        el("h3", { class: "admin-inscription-panel-title" }, "Blocs & questions"),
        stepsHost
      )
    );
    editorEl.appendChild(el("div", { class: "admin-inscription-actions-row" }, saveBtn, deleteCurrentStepBtn, delBtn));
    updateDeleteCurrentStepUi();
  }

  /* Premier rendu synchrone : bouton « Nouveau modèle » et colonne éditeur tout de suite, sans attendre l’API. */
  renderList();
  renderEditor();
  refreshList();
}
