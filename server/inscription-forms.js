/**
 * Formulaires d'inscription dynamiques — routes admin (JWT) et portail (cookie session).
 */
import multer from "multer";
import crypto from "node:crypto";

const BUCKET = "public-uploads";

/** Étape 0 obligatoire — identique en base, migrations et normalisation. */
export const PORTAL_IDENTITY_STEP_ID = "portal_step_identite";
export const PORTAL_FIELD_IDENT_NOM = "portal_ident_nom";
export const PORTAL_FIELD_IDENT_PRENOM = "portal_ident_prenom";
export const PORTAL_FIELD_IDENT_EMAIL = "portal_ident_email";

export const inscriptionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

function slugify(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "formulaire";
}

/**
 * Choisit un slug libre proche du slug demandé : base, base-2, base-3… puis suffixe aléatoire.
 * @param {import("@supabase/supabase-js").SupabaseClient} supabaseAdmin
 * @param {string} requestedSlug — déjà normalisé (slugify + max 80)
 * @param {string | null} excludeTemplateId — exclure cette fiche (même slug conservé à la mise à jour)
 */
async function pickUniqueInscriptionSlug(supabaseAdmin, requestedSlug, excludeTemplateId = null) {
  const first = String(requestedSlug || "formulaire")
    .trim()
    .toLowerCase()
    .slice(0, 80);
  const stem = first.replace(/-\d+$/, "").replace(/-+$/g, "").slice(0, 72) || "formulaire";

  const candidates = [];
  const push = (s) => {
    const x = s.slice(0, 80);
    if (!candidates.includes(x)) candidates.push(x);
  };
  push(first);
  for (let n = 2; n <= 52; n++) push(`${stem}-${n}`);

  const { data: rows, error } = await supabaseAdmin
    .from("inscription_templates")
    .select("id, slug")
    .in("slug", candidates);
  if (error) throw error;
  const taken = new Set();
  for (const r of rows || []) {
    if (excludeTemplateId && r.id === excludeTemplateId) continue;
    taken.add(r.slug);
  }
  for (const c of candidates) {
    if (!taken.has(c)) return { slug: c, adjusted: c !== first };
  }
  const rnd = crypto.randomBytes(4).toString("hex");
  const fallback = `${stem}-${rnd}`.slice(0, 80);
  return { slug: fallback, adjusted: true };
}

function buildPortalIdentityStep() {
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

/** Alimente les colonnes dédiées sur `inscription_submissions` à partir de `answers`. */
function submissionCandidateIdentityFromAnswers(answers) {
  const a = answers && typeof answers === "object" ? answers : {};
  return {
    candidate_nom: String(a[PORTAL_FIELD_IDENT_NOM] ?? "").trim().slice(0, 200) || null,
    candidate_prenom: String(a[PORTAL_FIELD_IDENT_PRENOM] ?? "").trim().slice(0, 200) || null,
    candidate_email: String(a[PORTAL_FIELD_IDENT_EMAIL] ?? "").trim().slice(0, 320) || null,
  };
}

function normalizeDefinition(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const steps = Array.isArray(d.steps) ? d.steps : [];
  const outSteps = [];
  const identityReserved = new Set([
    PORTAL_FIELD_IDENT_NOM,
    PORTAL_FIELD_IDENT_PRENOM,
    PORTAL_FIELD_IDENT_EMAIL,
  ]);
  for (const st of steps) {
    if (!st || typeof st !== "object") continue;
    const id = typeof st.id === "string" && st.id.trim() ? st.id.trim() : crypto.randomUUID();
    if (id === PORTAL_IDENTITY_STEP_ID) continue;
    const title = String(st.title || "").trim().slice(0, 200);
    const blocks = [];
    for (const b of Array.isArray(st.blocks) ? st.blocks : []) {
      if (!b || typeof b !== "object") continue;
      const bid = typeof b.id === "string" && b.id.trim() ? b.id.trim() : crypto.randomUUID();
      if (identityReserved.has(bid)) continue;
      if (b.kind === "info") {
        blocks.push({
          id: bid,
          kind: "info",
          body: String(b.body || "").slice(0, 8000),
        });
        continue;
      }
      if (b.kind === "title") {
        blocks.push({
          id: bid,
          kind: "title",
          text: String(b.text != null ? b.text : b.body || "").trim().slice(0, 500),
        });
        continue;
      }
      if (b.kind === "description") {
        blocks.push({
          id: bid,
          kind: "description",
          body: String(b.body || "").slice(0, 8000),
        });
        continue;
      }
      if (b.kind === "field") {
        const type = String(b.type || "text").trim().toLowerCase();
        const allowed = new Set(["text", "textarea", "number", "single", "multi", "yesno", "binary", "file"]);
        const t = allowed.has(type) ? type : "text";
        const opts = Array.isArray(b.options)
          ? b.options.map((x) => String(x).trim().slice(0, 200)).filter(Boolean).slice(0, 48)
          : [];
        const base = {
          id: bid,
          kind: "field",
          type: t,
          label: String(b.label || "Question").trim().slice(0, 400),
          help: String(b.help || "").trim().slice(0, 2000),
          required: b.required === true,
        };
        if (t === "single" || t === "multi") {
          base.options = opts.length ? opts : ["Option A", "Option B"];
        } else if (t === "binary") {
          base.label_left = String(b.label_left ?? "1").trim().slice(0, 80) || "1";
          base.label_right = String(b.label_right ?? "2").trim().slice(0, 80) || "2";
        }
        blocks.push(base);
        continue;
      }
    }
    if (!blocks.length) continue;
    outSteps.push({ id, title, blocks });
  }
  return { steps: [buildPortalIdentityStep(), ...outSteps] };
}

function targetsApply(template, formationSlug, villeSlug) {
  const t = template.targets;
  if (!Array.isArray(t) || t.length === 0) return true;
  return t.some(
    (x) =>
      x &&
      String(x.formation_slug || "").trim() === formationSlug &&
      String(x.ville_slug || "").trim() === villeSlug
  );
}

function allFieldBlocks(def) {
  const out = [];
  for (const step of def.steps || []) {
    for (const b of step.blocks || []) {
      if (b.kind === "field") out.push(b);
    }
  }
  return out;
}

function isFieldFilled(field, answers, files) {
  const v = answers[field.id];
  if (field.type === "file") {
    const f = files[field.id];
    return Boolean(f && typeof f === "object" && f.path);
  }
  if (field.type === "multi") return Array.isArray(v) && v.length > 0;
  if (field.type === "yesno") return v === "oui" || v === "non";
  if (field.type === "binary") return v === "left" || v === "right";
  if (field.type === "number") {
    if (v == null || String(v).trim() === "") return false;
    const n = Number(String(v).trim().replace(",", "."));
    return !Number.isNaN(n) && Number.isFinite(n);
  }
  if (field.type === "single" || field.type === "text" || field.type === "textarea") {
    return v != null && String(v).trim() !== "";
  }
  return false;
}

/**
 * Instantané comparable de la valeur persistée d’un champ (answers + files).
 * Sert à détecter une **reprise effective** avant de retirer une entrée de `admin_field_flags`.
 */
function fieldAnswerSnapshot(field, answers, files) {
  const id = field.id;
  const a = answers && typeof answers === "object" ? answers : {};
  const f = files && typeof files === "object" ? files : {};
  if (field.type === "file") {
    const p = f[id]?.path;
    return p != null ? String(p).trim() : "";
  }
  const v = a[id];
  if (field.type === "multi") {
    if (!Array.isArray(v)) return "[]";
    return JSON.stringify(
      [...v]
        .map((x) => String(x))
        .sort((x, y) => x.localeCompare(y, "fr"))
    );
  }
  if (field.type === "number") {
    if (v == null || String(v).trim() === "") return "";
    const n = Number(String(v).trim().replace(",", "."));
    return Number.isFinite(n) ? String(n) : String(v).trim();
  }
  if (field.type === "yesno" || field.type === "binary" || field.type === "single") {
    return v == null ? "" : String(v).trim();
  }
  if (field.type === "text" || field.type === "textarea") {
    return v == null ? "" : String(v).trim();
  }
  return v == null ? "" : JSON.stringify(v);
}

/**
 * Réconciliation `admin_field_flags` après PATCH/PUT portail (règle métier Sporformation) :
 * pour chaque `field_id` présent dans le corps de la requête **et** encore marqué côté direction,
 * on ne retire la clé que si la valeur a **réellement changé** vs l’état avant mise à jour
 * ET que le champ est à nouveau **conforme** (rempli selon les mêmes règles que `isFieldFilled`).
 */
function reconcileAdminFieldFlagsAfterPortalPatch(
  definition,
  admin_field_flags,
  bodyAnswers,
  prevAnswers,
  prevFiles,
  mergedAnswers,
  mergedFiles
) {
  const marks = admin_field_flags && typeof admin_field_flags === "object" ? { ...admin_field_flags } : {};
  if (!bodyAnswers || typeof bodyAnswers !== "object") return marks;
  const def = normalizeDefinition(definition);
  const byId = new Map(allFieldBlocks(def).map((f) => [f.id, f]));

  for (const fieldId of Object.keys(bodyAnswers)) {
    if (!Object.prototype.hasOwnProperty.call(marks, fieldId)) continue;
    const field = byId.get(fieldId);
    if (!field) continue;
    const before = fieldAnswerSnapshot(field, prevAnswers, prevFiles);
    const after = fieldAnswerSnapshot(field, mergedAnswers, mergedFiles);
    if (before === after) continue;
    if (!isFieldFilled(field, mergedAnswers, mergedFiles)) continue;
    delete marks[fieldId];
  }
  return marks;
}

export function computeInscriptionProgress(definition, answers, files, admin_field_flags) {
  const marks =
    admin_field_flags && typeof admin_field_flags === "object" && !Array.isArray(admin_field_flags)
      ? admin_field_flags
      : {};
  const fieldCountedFilled = (f) => {
    if (Object.prototype.hasOwnProperty.call(marks, f.id)) return false;
    return isFieldFilled(f, answers, files);
  };
  const def = normalizeDefinition(definition);
  const steps = def.steps || [];
  if (!steps.length) return { percent: 0, stepPercents: [] };
  const stepPercents = steps.map((step) => {
    const fields = (step.blocks || []).filter((b) => b.kind === "field");
    const required = fields.filter((f) => f.required);
    const denom = required.length > 0 ? required.length : fields.length || 1;
    const numer =
      required.length > 0
        ? required.filter((f) => fieldCountedFilled(f)).length
        : fields.filter((f) => fieldCountedFilled(f)).length || 0;
    return Math.min(100, Math.round((100 * numer) / denom));
  });
  const percent = Math.round(
    stepPercents.reduce((a, b) => a + b, 0) / Math.max(1, stepPercents.length)
  );
  return { percent, stepPercents };
}

/** Premier champ encore marqué par l’admin (ordre du formulaire). */
function firstCorrectionFieldId(definition, admin_field_flags) {
  const marks =
    admin_field_flags && typeof admin_field_flags === "object" && !Array.isArray(admin_field_flags)
      ? admin_field_flags
      : {};
  const keys = Object.keys(marks);
  if (!keys.length) return null;
  const keySet = new Set(keys);
  for (const f of allFieldBlocks(normalizeDefinition(definition))) {
    if (keySet.has(f.id)) return f.id;
  }
  return keys[0];
}

function stepIndexForFieldId(definition, fieldId) {
  if (!fieldId) return 0;
  const def = normalizeDefinition(definition);
  const steps = def.steps || [];
  for (let i = 0; i < steps.length; i++) {
    if ((steps[i].blocks || []).some((b) => b.kind === "field" && b.id === fieldId)) return i;
  }
  return 0;
}

/** Toujours exiger l’étape coordonnées, même si une vieille définition JSON omet `required`. */
function portalIdentityAnswersComplete(answers) {
  const a = answers && typeof answers === "object" ? answers : {};
  const trio = [
    { id: PORTAL_FIELD_IDENT_NOM, kind: "field", type: "text" },
    { id: PORTAL_FIELD_IDENT_PRENOM, kind: "field", type: "text" },
    { id: PORTAL_FIELD_IDENT_EMAIL, kind: "field", type: "text" },
  ];
  for (const f of trio) {
    if (!isFieldFilled(f, a, {})) return false;
  }
  return true;
}

function submissionComplete(definition, answers, files, admin_field_flags) {
  if (!portalIdentityAnswersComplete(answers)) return false;
  const marks =
    admin_field_flags && typeof admin_field_flags === "object" && !Array.isArray(admin_field_flags)
      ? admin_field_flags
      : {};
  const fields = allFieldBlocks(normalizeDefinition(definition)).filter((f) => f.required);
  for (const f of fields) {
    if (Object.prototype.hasOwnProperty.call(marks, f.id)) return false;
    if (!isFieldFilled(f, answers, files)) return false;
  }
  return true;
}

/** Dossier transmis encore modifiable côté portail (pas de décision finale). */
function portalSubmittedDossierEditable(row) {
  if (row.status !== "submitted") return false;
  const rd = row.review_decision || "none";
  return rd !== "refuse" && rd !== "accepte";
}

function portalAllowsInscriptionAnswerPatch(row) {
  if (row.status === "draft") return true;
  if (row.status !== "submitted") return false;
  return portalSubmittedDossierEditable(row);
}

/**
 * Après sauvegarde portail : drapeaux levés OU dossier transmis + « à compléter » entièrement rétabli → revue équipe.
 * @returns {Record<string, string>}
 */
function mergePortalInscriptionFinalizePatch(row, rowFmBefore, admin_field_flagsAfter, defNorm, answers, files) {
  const rd = row.review_decision || "none";
  const fromFlags = portalCorrectionsFinalizedReviewPatch(row, rowFmBefore, admin_field_flagsAfter);
  if (Object.keys(fromFlags).length) return fromFlags;
  if (
    row.status === "submitted" &&
    rd === "a_completer" &&
    Object.keys(rowFmBefore).length === 0 &&
    submissionComplete(defNorm, answers, files, admin_field_flagsAfter)
  ) {
    return { review_decision: "pending" };
  }
  return {};
}

/** Indique que le candidat a fini une relance (champs signalés ou formulaire « à compléter » sur dossier transmis). */
function inscriptionCandidateFollowupDoneForAdmin(finalizePatch) {
  return finalizePatch && finalizePatch.review_decision === "pending";
}

/** Dossier transmis : plus aucun champ signalé → l’équipe revoit le dossier (sauf décision finale). */
function portalCorrectionsFinalizedReviewPatch(row, prevFlags, nextFlags) {
  const prev = prevFlags && typeof prevFlags === "object" ? prevFlags : {};
  const next = nextFlags && typeof nextFlags === "object" ? nextFlags : {};
  if (row.status !== "submitted" || Object.keys(prev).length === 0 || Object.keys(next).length > 0) {
    return {};
  }
  const rd = row.review_decision || "none";
  if (rd === "refuse" || rd === "accepte") return {};
  return { review_decision: "pending" };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {import("express").Router} router
 * @param {{ supabaseAdmin: import("@supabase/supabase-js").SupabaseClient, requireAdmin: Function, requireCms: Function }} deps
 */
export function attachInscriptionAdminRoutes(router, deps) {
  const { supabaseAdmin, requireAdmin, requireCms } = deps;

  router.get("/inscription-templates", requireAdmin, requireCms, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("inscription_templates")
        .select("id, title, slug, is_published, targets, definition, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      res.json({ items: data || [] });
    } catch (e) {
      console.error("[admin inscription-templates list]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.get("/inscription-templates/:id", requireAdmin, requireCms, async (req, res) => {
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "id invalide." });
    try {
      const { data, error } = await supabaseAdmin
        .from("inscription_templates")
        .select("id, title, slug, is_published, targets, definition, created_at, updated_at")
        .eq("id", id)
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Introuvable." });
      res.json({ item: data });
    } catch (e) {
      console.error("[admin inscription-templates get]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post("/inscription-templates", requireAdmin, requireCms, async (req, res) => {
    try {
      const title = String(req.body?.title || "").trim().slice(0, 200);
      if (!title) return res.status(400).json({ error: "Titre requis." });
      let requested = String(req.body?.slug || "").trim().toLowerCase().slice(0, 80);
      if (!requested) requested = slugify(title);
      requested = slugify(requested).slice(0, 80);

      const { slug, adjusted } = await pickUniqueInscriptionSlug(supabaseAdmin, requested, null);

      const is_published = req.body?.is_published === true;
      const targets = Array.isArray(req.body?.targets) ? req.body.targets : [];
      const definition = normalizeDefinition(req.body?.definition);
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("inscription_templates")
        .insert({
          title,
          slug,
          is_published,
          targets,
          definition,
          updated_at: now,
        })
        .select("id, title, slug, is_published, targets, definition, created_at, updated_at")
        .maybeSingle();
      if (error) {
        if (/unique|duplicate/i.test(error.message)) {
          return res.status(409).json({
            error:
              "Impossible d’attribuer un slug unique automatiquement. Modifiez le titre ou le slug manuellement.",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      res.status(201).json({ ok: true, item: data, slug_adjusted: adjusted });
    } catch (e) {
      console.error("[admin inscription-templates create]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.put("/inscription-templates/:id", requireAdmin, requireCms, async (req, res) => {
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "id invalide." });
    try {
      const patch = {};
      let slugAdjusted = false;
      if (req.body?.title !== undefined)
        patch.title = String(req.body.title || "").trim().slice(0, 200);
      if (req.body?.slug !== undefined) {
        let want = String(req.body.slug || "").trim();
        want = (slugify(want) || "formulaire").slice(0, 80);
        const picked = await pickUniqueInscriptionSlug(supabaseAdmin, want, id);
        patch.slug = picked.slug;
        slugAdjusted = picked.adjusted;
      }
      if (req.body?.is_published !== undefined) patch.is_published = req.body.is_published === true;
      if (req.body?.targets !== undefined)
        patch.targets = Array.isArray(req.body.targets) ? req.body.targets : [];
      if (req.body?.definition !== undefined) patch.definition = normalizeDefinition(req.body.definition);
      if (patch.title === "") return res.status(400).json({ error: "Titre invalide." });
      patch.updated_at = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("inscription_templates")
        .update(patch)
        .eq("id", id)
        .select("id, title, slug, is_published, targets, definition, created_at, updated_at")
        .maybeSingle();
      if (error) {
        if (/unique|duplicate/i.test(error.message)) {
          return res.status(409).json({
            error:
              "Impossible d’attribuer un slug unique automatiquement. Choisissez un autre slug.",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.status(404).json({ error: "Introuvable." });
      res.json({ ok: true, item: data, slug_adjusted: slugAdjusted });
    } catch (e) {
      console.error("[admin inscription-templates put]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.delete("/inscription-templates/:id", requireAdmin, requireCms, async (req, res) => {
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "id invalide." });
    try {
      const { error } = await supabaseAdmin.from("inscription_templates").delete().eq("id", id);
      if (error) return res.status(500).json({ error: error.message });
      res.json({ ok: true });
    } catch (e) {
      console.error("[admin inscription-templates delete]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  const REVIEW_DECISIONS = new Set(["none", "pending", "a_completer", "refuse", "accepte"]);

  router.get("/inscription-submissions", requireAdmin, requireCms, async (_req, res) => {
    try {
      const { data, error } = await supabaseAdmin
        .from("inscription_submissions")
        .select(
          "id, template_id, formation_slug, ville_slug, status, answers, files, current_step_index, created_at, updated_at, submitted_at, review_decision, review_note_internal, review_message_candidat, admin_field_flags, candidate_nom, candidate_prenom, candidate_email, portal_accounts ( email ), inscription_templates ( title, definition )"
        )
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) return res.status(500).json({ error: error.message });
      const items = (data || []).map((row) => {
        let tmpl = row.inscription_templates;
        if (Array.isArray(tmpl)) tmpl = tmpl[0];
        let pa = row.portal_accounts;
        if (Array.isArray(pa)) pa = pa[0];
        const def = normalizeDefinition(tmpl?.definition);
        const { percent } = computeInscriptionProgress(
          def,
          row.answers || {},
          row.files || {},
          row.admin_field_flags
        );
        return {
          id: row.id,
          template_id: row.template_id,
          template_title: tmpl?.title || "",
          formation_slug: row.formation_slug,
          ville_slug: row.ville_slug,
          portal_email: pa?.email || "",
          status: row.status,
          review_decision: row.review_decision || "none",
          review_note_internal: row.review_note_internal || "",
          review_message_candidat: row.review_message_candidat || "",
          admin_field_flags: row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {},
          candidate_nom: row.candidate_nom || null,
          candidate_prenom: row.candidate_prenom || null,
          candidate_email: row.candidate_email || null,
          current_step_index: row.current_step_index,
          progress_percent: row.status === "submitted" ? 100 : percent,
          updated_at: row.updated_at,
          submitted_at: row.submitted_at,
        };
      });
      res.json({ items });
    } catch (e) {
      console.error("[admin inscription-submissions list]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.get("/inscription-submissions/:id", requireAdmin, requireCms, async (req, res) => {
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "id invalide." });
    try {
      const { data: rows, error } = await supabaseAdmin
        .from("inscription_submissions")
        .select(
          "id, template_id, formation_slug, ville_slug, status, answers, files, current_step_index, created_at, updated_at, submitted_at, review_decision, review_note_internal, review_message_candidat, admin_field_flags, candidate_nom, candidate_prenom, candidate_email, portal_accounts ( email ), inscription_templates ( title, definition )"
        )
        .eq("id", id)
        .limit(1);
      if (error) return res.status(500).json({ error: error.message });
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Introuvable." });
      let tmpl = row.inscription_templates;
      if (Array.isArray(tmpl)) tmpl = tmpl[0];
      let pa = row.portal_accounts;
      if (Array.isArray(pa)) pa = pa[0];
      const def = normalizeDefinition(tmpl?.definition);
      const { percent } = computeInscriptionProgress(
        def,
        row.answers || {},
        row.files || {},
        row.admin_field_flags
      );
      res.json({
        item: {
          id: row.id,
          template_id: row.template_id,
          template_title: tmpl?.title || "",
          formation_slug: row.formation_slug,
          ville_slug: row.ville_slug,
          portal_email: pa?.email || "",
          status: row.status,
          answers: row.answers || {},
          files: row.files || {},
          definition: def,
          current_step_index: row.current_step_index,
          progress_percent: row.status === "submitted" ? 100 : percent,
          submitted_at: row.submitted_at,
          updated_at: row.updated_at,
          review_decision: row.review_decision || "none",
          review_note_internal: row.review_note_internal || "",
          review_message_candidat: row.review_message_candidat || "",
          admin_field_flags: row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {},
          candidate_nom: row.candidate_nom || null,
          candidate_prenom: row.candidate_prenom || null,
          candidate_email: row.candidate_email || null,
        },
      });
    } catch (e) {
      console.error("[admin inscription-submissions get]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.patch("/inscription-submissions/:id/review", requireAdmin, requireCms, async (req, res) => {
    const id = String(req.params.id || "");
    if (!UUID_RE.test(id)) return res.status(400).json({ error: "id invalide." });
    const decision = String(req.body?.review_decision ?? "").trim();
    if (!REVIEW_DECISIONS.has(decision)) {
      return res.status(400).json({ error: "Décision invalide." });
    }
    const noteInt = req.body?.review_note_internal != null ? String(req.body.review_note_internal).slice(0, 4000) : undefined;
    const msgCand = req.body?.review_message_candidat != null ? String(req.body.review_message_candidat).slice(0, 4000) : undefined;
    try {
      const { data: rows, error: qErr } = await supabaseAdmin
        .from("inscription_submissions")
        .select("id, status, review_decision")
        .eq("id", id)
        .limit(1);
      if (qErr) return res.status(500).json({ error: qErr.message });
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Introuvable." });

      const patch = {
        review_decision: decision,
        updated_at: new Date().toISOString(),
      };
      if (noteInt !== undefined) patch.review_note_internal = noteInt.trim() || null;
      if (msgCand !== undefined) patch.review_message_candidat = msgCand.trim() || null;

      if (decision === "a_completer" && row.status === "submitted") {
        patch.status = "draft";
        patch.submitted_at = null;
      }
      if (decision === "none" || decision === "pending") {
        /* ne pas forcer le statut */
      }

      const { data: updated, error: uErr } = await supabaseAdmin
        .from("inscription_submissions")
        .update(patch)
        .eq("id", id)
        .select("id, status, submitted_at, review_decision, review_note_internal, review_message_candidat")
        .maybeSingle();
      if (uErr) return res.status(500).json({ error: uErr.message });
      res.json({ ok: true, item: updated });
    } catch (e) {
      console.error("[admin inscription-submissions review]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post("/inscription-submissions/:id/clear-field", requireAdmin, requireCms, async (req, res) => {
    const id = String(req.params.id || "");
    const fieldId = String(req.body?.field_id || "").trim();
    if (!UUID_RE.test(id) || !fieldId) return res.status(400).json({ error: "Paramètres invalides." });
    const reason = String(req.body?.reason || "annulation_admin").slice(0, 200);
    try {
      const { data: rows, error: qErr } = await supabaseAdmin
        .from("inscription_submissions")
        .select("id, status, answers, files, admin_field_flags, inscription_templates ( definition )")
        .eq("id", id)
        .limit(1);
      if (qErr) return res.status(500).json({ error: qErr.message });
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Introuvable." });

      let tmpl = row.inscription_templates;
      if (Array.isArray(tmpl)) tmpl = tmpl[0];
      const def = normalizeDefinition(tmpl?.definition);
      const fieldMeta = allFieldBlocks(def).find((f) => f.id === fieldId);
      if (!fieldMeta) return res.status(400).json({ error: "Champ inconnu dans ce formulaire." });
      if (
        fieldId === PORTAL_FIELD_IDENT_NOM ||
        fieldId === PORTAL_FIELD_IDENT_PRENOM ||
        fieldId === PORTAL_FIELD_IDENT_EMAIL
      ) {
        return res.status(400).json({
          error: "Les champs d’identification (nom, prénom, e-mail) ne peuvent pas être annulés depuis l’admin.",
        });
      }

      const answers = { ...(row.answers || {}) };
      delete answers[fieldId];

      const files = { ...(row.files || {}) };
      const storedPath = files[fieldId]?.path;
      delete files[fieldId];
      if (typeof storedPath === "string" && storedPath.trim()) {
        const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([storedPath]);
        if (rmErr) console.warn("[admin clear-field] storage", rmErr.message);
      }

      const admin_field_flags = { ...(row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {}) };
      admin_field_flags[fieldId] = {
        cleared_at: new Date().toISOString(),
        reason,
      };

      const { percent } = computeInscriptionProgress(def, answers, files, admin_field_flags);
      const now = new Date().toISOString();
      const patch = {
        answers,
        files,
        admin_field_flags,
        progress_percent: percent,
        updated_at: now,
        ...submissionCandidateIdentityFromAnswers(answers),
      };
      if (row.status === "submitted") {
        patch.status = "draft";
        patch.submitted_at = null;
      }

      const { error: uErr } = await supabaseAdmin.from("inscription_submissions").update(patch).eq("id", id);
      if (uErr) return res.status(500).json({ error: uErr.message });
      res.json({ ok: true, answers, files, admin_field_flags, progress_percent: percent });
    } catch (e) {
      console.error("[admin inscription-submissions clear-field]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });
}

/**
 * @param {import("express").Router} router
 * @param {{ supabaseAdmin: import("@supabase/supabase-js").SupabaseClient, getPortalAccount: (req: import("express").Request) => Promise<{ id: string, email: string } | null> }} deps
 */
export function attachInscriptionPortalRoutes(router, deps) {
  const { supabaseAdmin, getPortalAccount } = deps;

  router.get("/inscription/template", async (req, res) => {
    try {
      const formation_slug = String(req.query.formation || "").trim();
      const ville_slug = String(req.query.ville || "").trim();
      if (!formation_slug || !ville_slug) {
        return res.status(400).json({ error: "formation et ville requis." });
      }
      const { data: rows, error } = await supabaseAdmin
        .from("inscription_templates")
        .select("id, title, slug, targets, definition, updated_at")
        .eq("is_published", true)
        .order("updated_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      const match = (rows || []).find((t) => targetsApply(t, formation_slug, ville_slug));
      if (!match) return res.status(404).json({ error: "Aucun formulaire publié pour cette formation et cette ville." });
      res.json({
        template: {
          id: match.id,
          title: match.title,
          slug: match.slug,
          definition: normalizeDefinition(match.definition),
        },
      });
    } catch (e) {
      console.error("[portal inscription template]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.get("/inscription/my", async (req, res) => {
    try {
      const acc = await getPortalAccount(req);
      if (!acc) return res.status(401).json({ error: "Non connecté." });
      const { data: rows, error } = await supabaseAdmin
        .from("inscription_submissions")
        .select(
          "id, template_id, formation_slug, ville_slug, status, answers, files, current_step_index, updated_at, submitted_at, review_decision, review_message_candidat, admin_field_flags, inscription_templates ( title, definition )"
        )
        .eq("portal_account_id", acc.id)
        .order("updated_at", { ascending: false })
        .limit(80);
      if (error) return res.status(500).json({ error: error.message });
      const items = (rows || []).map((r) => {
        let tmpl = r.inscription_templates;
        if (Array.isArray(tmpl)) tmpl = tmpl[0];
        const defNorm = normalizeDefinition(tmpl?.definition);
        const fm = r.admin_field_flags && typeof r.admin_field_flags === "object" ? r.admin_field_flags : {};
        const dec = r.review_decision || "none";
        let { percent } = computeInscriptionProgress(defNorm, r.answers || {}, r.files || {}, fm);
        if (r.status === "draft" && (dec === "a_completer" || Object.keys(fm).length > 0)) {
          percent = Math.min(percent, 99);
        }
        const field_labels = {};
        for (const f of allFieldBlocks(defNorm)) {
          field_labels[f.id] = String(f.label || "Question").trim() || "Question";
        }
        let progressOut = percent;
        if (r.status === "submitted") {
          progressOut = Object.keys(fm).length > 0 ? Math.min(percent, 99) : 100;
        }
        return {
          id: r.id,
          template_id: r.template_id,
          template_title: tmpl?.title || "Formulaire",
          formation_slug: r.formation_slug,
          ville_slug: r.ville_slug,
          status: r.status,
          review_decision: dec,
          review_message_candidat: r.review_message_candidat || "",
          admin_field_flags: fm,
          field_labels,
          correction_focus_field_id: firstCorrectionFieldId(defNorm, fm),
          progress_percent: progressOut,
          current_step_index: r.current_step_index,
          updated_at: r.updated_at,
          submitted_at: r.submitted_at,
        };
      });
      res.json({ items });
    } catch (e) {
      console.error("[portal inscription my]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post("/inscription/start", async (req, res) => {
    try {
      const acc = await getPortalAccount(req);
      if (!acc) return res.status(401).json({ error: "Non connecté." });
      const template_id = String(req.body?.template_id || "");
      const formation_slug = String(req.body?.formation_slug || "").trim();
      const ville_slug = String(req.body?.ville_slug || "").trim();
      if (!UUID_RE.test(template_id) || !formation_slug || !ville_slug) {
        return res.status(400).json({ error: "Paramètres invalides." });
      }
      const { data: tmplRows, error: tErr } = await supabaseAdmin
        .from("inscription_templates")
        .select("id, is_published, targets, definition")
        .eq("id", template_id)
        .limit(1);
      if (tErr) return res.status(500).json({ error: tErr.message });
      const tmpl = tmplRows?.[0];
      if (!tmpl?.is_published) return res.status(404).json({ error: "Formulaire introuvable ou non publié." });
      if (!targetsApply(tmpl, formation_slug, ville_slug)) {
        return res.status(400).json({ error: "Ce formulaire ne correspond pas à la formation et la ville choisies." });
      }

      const { data: existingDraft, error: dErr } = await supabaseAdmin
        .from("inscription_submissions")
        .select(
          "id, answers, files, current_step_index, status, review_decision, review_message_candidat, admin_field_flags"
        )
        .eq("portal_account_id", acc.id)
        .eq("template_id", template_id)
        .eq("formation_slug", formation_slug)
        .eq("ville_slug", ville_slug)
        .eq("status", "draft")
        .limit(1);
      if (dErr) return res.status(500).json({ error: dErr.message });
      if (existingDraft?.length) {
        const row = existingDraft[0];
        const defNorm = normalizeDefinition(tmpl.definition);
        const fm = row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {};
        const dec = row.review_decision || "none";
        let { percent } = computeInscriptionProgress(defNorm, row.answers || {}, row.files || {}, fm);
        if (dec === "a_completer" || Object.keys(fm).length > 0) {
          percent = Math.min(percent, 99);
        }
        return res.json({
          ok: true,
          submission: {
            id: row.id,
            answers: row.answers || {},
            files: row.files || {},
            current_step_index: row.current_step_index,
            progress_percent: percent,
            definition: defNorm,
            review_decision: dec,
            review_message_candidat: row.review_message_candidat || "",
            admin_field_flags: fm,
            correction_focus_field_id: firstCorrectionFieldId(defNorm, fm),
          },
        });
      }

      const now = new Date().toISOString();
      const { data: ins, error: iErr } = await supabaseAdmin
        .from("inscription_submissions")
        .insert({
          template_id,
          portal_account_id: acc.id,
          formation_slug,
          ville_slug,
          status: "draft",
          answers: {},
          files: {},
          current_step_index: 0,
          progress_percent: 0,
          updated_at: now,
        })
        .select("id, answers, files, current_step_index")
        .maybeSingle();
      if (iErr) return res.status(500).json({ error: iErr.message });
      res.status(201).json({
        ok: true,
        submission: {
          id: ins.id,
          answers: ins.answers || {},
          files: ins.files || {},
          current_step_index: ins.current_step_index || 0,
          progress_percent: 0,
          definition: normalizeDefinition(tmpl.definition),
          review_decision: "none",
          review_message_candidat: "",
          admin_field_flags: {},
          correction_focus_field_id: null,
        },
      });
    } catch (e) {
      console.error("[portal inscription start]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.get("/inscription/submissions/:id", async (req, res) => {
    try {
      const acc = await getPortalAccount(req);
      if (!acc) return res.status(401).json({ error: "Non connecté." });
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) return res.status(400).json({ error: "id invalide." });
      const { data: rows, error } = await supabaseAdmin
        .from("inscription_submissions")
        .select(
          "id, template_id, formation_slug, ville_slug, status, answers, files, current_step_index, updated_at, submitted_at, review_decision, review_message_candidat, admin_field_flags, inscription_templates ( title, definition )"
        )
        .eq("id", id)
        .eq("portal_account_id", acc.id)
        .limit(1);
      if (error) return res.status(500).json({ error: error.message });
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Introuvable." });
      let tmpl = row.inscription_templates;
      if (Array.isArray(tmpl)) tmpl = tmpl[0];
      const def = normalizeDefinition(tmpl?.definition);
      const fm = row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {};
      const dec = row.review_decision || "none";
      let { percent } = computeInscriptionProgress(def, row.answers || {}, row.files || {}, fm);
      if (row.status === "draft" && (dec === "a_completer" || Object.keys(fm).length > 0)) {
        percent = Math.min(percent, 99);
      }
      let progressOut = percent;
      if (row.status === "submitted") {
        progressOut = Object.keys(fm).length > 0 ? Math.min(percent, 99) : 100;
      }
      res.json({
        submission: {
          id: row.id,
          template_id: row.template_id,
          template_title: tmpl?.title || "",
          formation_slug: row.formation_slug,
          ville_slug: row.ville_slug,
          status: row.status,
          answers: row.answers || {},
          files: row.files || {},
          current_step_index: row.current_step_index,
          progress_percent: progressOut,
          definition: def,
          submitted_at: row.submitted_at,
          review_decision: dec,
          review_message_candidat: row.review_message_candidat || "",
          admin_field_flags: fm,
          correction_focus_field_id: firstCorrectionFieldId(def, fm),
        },
      });
    } catch (e) {
      console.error("[portal inscription get]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.put("/inscription/submissions/:id", async (req, res) => {
    try {
      const acc = await getPortalAccount(req);
      if (!acc) return res.status(401).json({ error: "Non connecté." });
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) return res.status(400).json({ error: "id invalide." });

      const { data: rows, error: qErr } = await supabaseAdmin
        .from("inscription_submissions")
        .select(
          "id, status, template_id, answers, files, admin_field_flags, review_decision, inscription_templates ( definition )"
        )
        .eq("id", id)
        .eq("portal_account_id", acc.id)
        .limit(1);
      if (qErr) return res.status(500).json({ error: qErr.message });
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Introuvable." });
      if (!portalAllowsInscriptionAnswerPatch(row)) {
        return res.status(400).json({
          error:
            "Ce dossier est clos côté équipe (accepté ou refusé) : il n’est plus modifiable depuis le portail.",
        });
      }

      const prevAnswers = { ...(row.answers || {}) };
      const prevFiles = { ...(row.files || {}) };

      const rowFm = row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {};
      const flaggedKeys = new Set(Object.keys(rowFm));
      const reviewDec = row.review_decision || "none";
      const allowFullSubmittedEdit =
        row.status === "submitted" &&
        flaggedKeys.size === 0 &&
        portalSubmittedDossierEditable(row);

      let answers = { ...prevAnswers };
      if (req.body?.answers && typeof req.body.answers === "object") {
        const patch = req.body.answers;
        if (row.status === "draft" || allowFullSubmittedEdit) {
          answers = { ...answers, ...patch };
        } else {
          for (const k of Object.keys(patch)) {
            if (!flaggedKeys.has(k)) {
              return res.status(400).json({
                error:
                  "Pour ce dossier transmis, seuls les champs demandés par l’équipe (repérés sur le formulaire) sont modifiables.",
              });
            }
            answers[k] = patch[k];
          }
        }
      }
      const files = { ...prevFiles };
      let current_step_index = row.current_step_index;
      if (row.status === "draft" || allowFullSubmittedEdit) {
        if (req.body?.current_step_index !== undefined) {
          current_step_index = Number(req.body.current_step_index);
        }
        if (!Number.isFinite(current_step_index) || current_step_index < 0) current_step_index = 0;
      }

      let tmplPut = row.inscription_templates;
      if (Array.isArray(tmplPut)) tmplPut = tmplPut[0];
      const defNorm = normalizeDefinition(tmplPut?.definition);
      const admin_field_flags = reconcileAdminFieldFlagsAfterPortalPatch(
        defNorm,
        row.admin_field_flags,
        req.body?.answers,
        prevAnswers,
        prevFiles,
        answers,
        files
      );
      const { percent } = computeInscriptionProgress(defNorm, answers, files, admin_field_flags);
      let progressOut = percent;
      if (row.status === "submitted") {
        progressOut = Object.keys(admin_field_flags).length > 0 ? Math.min(percent, 99) : 100;
      } else if (reviewDec === "a_completer" || Object.keys(admin_field_flags).length > 0) {
        progressOut = Math.min(progressOut, 99);
      }

      const now = new Date().toISOString();
      const finalizeReview = mergePortalInscriptionFinalizePatch(
        row,
        rowFm,
        admin_field_flags,
        defNorm,
        answers,
        files
      );
      const { error: uErr } = await supabaseAdmin
        .from("inscription_submissions")
        .update({
          answers,
          current_step_index,
          admin_field_flags,
          progress_percent: progressOut,
          updated_at: now,
          ...submissionCandidateIdentityFromAnswers(answers),
          ...finalizeReview,
        })
        .eq("id", id);
      if (uErr) return res.status(500).json({ error: uErr.message });
      res.json({
        ok: true,
        progress_percent: progressOut,
        answers,
        current_step_index,
        admin_field_flags,
        review_decision: finalizeReview.review_decision ?? reviewDec,
        correction_focus_field_id: firstCorrectionFieldId(defNorm, admin_field_flags),
        dossier_mis_a_jour_pour_equipe: inscriptionCandidateFollowupDoneForAdmin(finalizeReview),
      });
    } catch (e) {
      console.error("[portal inscription save]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post(
    "/inscription/submissions/:id/upload",
    inscriptionUpload.single("file"),
    async (req, res) => {
      try {
        const acc = await getPortalAccount(req);
        if (!acc) return res.status(401).json({ error: "Non connecté." });
        const id = String(req.params.id || "");
        const fieldId = String(req.body?.field_id || req.query.field_id || "").trim();
        if (!UUID_RE.test(id) || !fieldId) return res.status(400).json({ error: "Paramètres invalides." });
        const file = req.file;
        if (!file?.buffer) return res.status(400).json({ error: "Fichier manquant." });

        const { data: rows, error: qErr } = await supabaseAdmin
          .from("inscription_submissions")
          .select(
            "id, status, template_id, answers, files, admin_field_flags, review_decision, inscription_templates ( definition )"
          )
          .eq("id", id)
          .eq("portal_account_id", acc.id)
          .limit(1);
        if (qErr) return res.status(500).json({ error: qErr.message });
        const row = rows?.[0];
        if (!row) return res.status(404).json({ error: "Introuvable." });
        const rowFm = row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {};
        const allow =
          row.status === "draft" || (row.status === "submitted" && portalSubmittedDossierEditable(row));
        if (!allow) return res.status(400).json({ error: "Ce dossier n’accepte pas de fichier sur ce champ." });
        if (
          row.status === "submitted" &&
          Object.keys(rowFm).length > 0 &&
          !Object.prototype.hasOwnProperty.call(rowFm, fieldId)
        ) {
          return res.status(400).json({
            error: "Seuls les fichiers des champs signalés par la direction peuvent être modifiés.",
          });
        }

        let tmpl = row.inscription_templates;
        if (Array.isArray(tmpl)) tmpl = tmpl[0];
        const def = normalizeDefinition(tmpl?.definition);
        const fieldMeta = allFieldBlocks(def).find((f) => f.id === fieldId);
        if (!fieldMeta || fieldMeta.type !== "file") {
          return res.status(400).json({ error: "Identifiant de champ fichier invalide." });
        }

        const prevPath = row.files?.[fieldId]?.path;
        if (typeof prevPath === "string" && prevPath.trim()) {
          const { error: rmPrevErr } = await supabaseAdmin.storage.from(BUCKET).remove([prevPath]);
          if (rmPrevErr) console.warn("[portal inscription upload] remove previous:", rmPrevErr.message);
        }

        const safeName = String(file.originalname || "document")
          .replace(/[^\w.\- ()]+/g, "_")
          .slice(0, 180);
        const objectPath = `inscription/${id}/${fieldId}/${crypto.randomUUID()}-${safeName}`;
        const { error: upErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(objectPath, file.buffer, {
            contentType: file.mimetype || "application/octet-stream",
            upsert: true,
          });
        if (upErr) return res.status(500).json({ error: upErr.message });

        const files = { ...(row.files || {}) };
        files[fieldId] = {
          path: objectPath,
          name: safeName,
          contentType: file.mimetype || null,
          uploaded_at: new Date().toISOString(),
        };
        const answers = { ...(row.answers || {}) };
        const prevFmUpload = row.admin_field_flags && typeof row.admin_field_flags === "object" ? { ...row.admin_field_flags } : {};
        const admin_field_flags = { ...(row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {}) };
        delete admin_field_flags[fieldId];
        const reviewDec = row.review_decision || "none";
        const { percent } = computeInscriptionProgress(def, answers, files, admin_field_flags);
        let progressOut = percent;
        if (row.status === "submitted") {
          progressOut = Object.keys(admin_field_flags).length > 0 ? Math.min(percent, 99) : 100;
        } else if (reviewDec === "a_completer" || Object.keys(admin_field_flags).length > 0) {
          progressOut = Math.min(progressOut, 99);
        }
        const now = new Date().toISOString();
        const finalizeReviewUp = mergePortalInscriptionFinalizePatch(
          row,
          prevFmUpload,
          admin_field_flags,
          def,
          answers,
          files
        );
        const { error: uErr } = await supabaseAdmin
          .from("inscription_submissions")
          .update({
            files,
            admin_field_flags,
            progress_percent: progressOut,
            updated_at: now,
            ...submissionCandidateIdentityFromAnswers(answers),
            ...finalizeReviewUp,
          })
          .eq("id", id);
        if (uErr) return res.status(500).json({ error: uErr.message });
        res.json({
          ok: true,
          files,
          file: files[fieldId],
          progress_percent: progressOut,
          admin_field_flags,
          review_decision: finalizeReviewUp.review_decision ?? reviewDec,
          correction_focus_field_id: firstCorrectionFieldId(def, admin_field_flags),
          dossier_mis_a_jour_pour_equipe: inscriptionCandidateFollowupDoneForAdmin(finalizeReviewUp),
        });
      } catch (e) {
        console.error("[portal inscription upload]", e);
        res.status(500).json({ error: "Erreur serveur." });
      }
    }
  );

  router.delete("/inscription/submissions/:id/files/:fieldId", async (req, res) => {
    try {
      const acc = await getPortalAccount(req);
      if (!acc) return res.status(401).json({ error: "Non connecté." });
      const id = String(req.params.id || "");
      const fieldId = String(req.params.fieldId || "").trim();
      if (!UUID_RE.test(id) || !fieldId) return res.status(400).json({ error: "Paramètres invalides." });

        const { data: rows, error: qErr } = await supabaseAdmin
          .from("inscription_submissions")
          .select(
            "id, status, template_id, answers, files, admin_field_flags, review_decision, inscription_templates ( definition )"
          )
          .eq("id", id)
          .eq("portal_account_id", acc.id)
          .limit(1);
      if (qErr) return res.status(500).json({ error: qErr.message });
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Introuvable." });
      const rowFmDel =
        row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {};
      const allowDel =
        row.status === "draft" || (row.status === "submitted" && portalSubmittedDossierEditable(row));
      if (!allowDel) return res.status(400).json({ error: "Ce dossier n’accepte pas cette modification." });
      if (
        row.status === "submitted" &&
        Object.keys(rowFmDel).length > 0 &&
        !Object.prototype.hasOwnProperty.call(rowFmDel, fieldId)
      ) {
        return res.status(400).json({
          error: "Seuls les fichiers des champs signalés par la direction peuvent être modifiés.",
        });
      }

      let tmpl = row.inscription_templates;
      if (Array.isArray(tmpl)) tmpl = tmpl[0];
      const def = normalizeDefinition(tmpl?.definition);
      const fieldMeta = allFieldBlocks(def).find((f) => f.id === fieldId);
      if (!fieldMeta || fieldMeta.type !== "file") {
        return res.status(400).json({ error: "Identifiant de champ fichier invalide." });
      }

      const storedPath = row.files?.[fieldId]?.path;
      if (typeof storedPath === "string" && storedPath.trim()) {
        const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove([storedPath]);
        if (rmErr) console.warn("[portal inscription delete file]", rmErr.message);
      }

      const files = { ...(row.files || {}) };
      delete files[fieldId];
      const answers = { ...(row.answers || {}) };
      const prevFmDel =
        row.admin_field_flags && typeof row.admin_field_flags === "object" ? { ...row.admin_field_flags } : {};
      const admin_field_flags =
        row.admin_field_flags && typeof row.admin_field_flags === "object" ? { ...row.admin_field_flags } : {};
      const reviewDec = row.review_decision || "none";
      const { percent } = computeInscriptionProgress(def, answers, files, admin_field_flags);
      let progressOut = percent;
      if (row.status === "submitted") {
        progressOut = Object.keys(admin_field_flags).length > 0 ? Math.min(percent, 99) : 100;
      } else if (reviewDec === "a_completer" || Object.keys(admin_field_flags).length > 0) {
        progressOut = Math.min(progressOut, 99);
      }
      const now = new Date().toISOString();
      const finalizeReviewDel = mergePortalInscriptionFinalizePatch(
        row,
        prevFmDel,
        admin_field_flags,
        def,
        answers,
        files
      );
      const { error: uErr } = await supabaseAdmin
        .from("inscription_submissions")
        .update({
          files,
          admin_field_flags,
          progress_percent: progressOut,
          updated_at: now,
          ...submissionCandidateIdentityFromAnswers(answers),
          ...finalizeReviewDel,
        })
        .eq("id", id);
      if (uErr) return res.status(500).json({ error: uErr.message });
      res.json({
        ok: true,
        files,
        progress_percent: progressOut,
        admin_field_flags,
        review_decision: finalizeReviewDel.review_decision ?? reviewDec,
        correction_focus_field_id: firstCorrectionFieldId(def, admin_field_flags),
        dossier_mis_a_jour_pour_equipe: inscriptionCandidateFollowupDoneForAdmin(finalizeReviewDel),
      });
    } catch (e) {
      console.error("[portal inscription delete file]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post("/inscription/submissions/:id/submit", async (req, res) => {
    try {
      const acc = await getPortalAccount(req);
      if (!acc) return res.status(401).json({ error: "Non connecté." });
      const id = String(req.params.id || "");
      if (!UUID_RE.test(id)) return res.status(400).json({ error: "id invalide." });

      const { data: rows, error: qErr } = await supabaseAdmin
        .from("inscription_submissions")
        .select(
          "id, status, answers, files, admin_field_flags, review_decision, inscription_templates ( definition )"
        )
        .eq("id", id)
        .eq("portal_account_id", acc.id)
        .limit(1);
      if (qErr) return res.status(500).json({ error: qErr.message });
      const row = rows?.[0];
      if (!row) return res.status(404).json({ error: "Introuvable." });

      const fm0 = row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {};
      const rdRow = row.review_decision || "none";

      if (row.status !== "draft") {
        if (row.status === "submitted" && Object.keys(fm0).length > 0) {
          return res.status(400).json({
            error:
              "Enregistrez d’abord chaque champ demandé par l’équipe ; vos modifications sont sauvegardées automatiquement quand tout est correct.",
          });
        }
        if (row.status === "submitted" && Object.keys(fm0).length === 0) {
          if (rdRow === "refuse" || rdRow === "accepte") {
            return res.status(400).json({
              error: "Ce dossier est clos : vous ne pouvez plus le modifier ni le renvoyer à l’équipe.",
            });
          }
          if (rdRow === "a_completer" || rdRow === "pending" || rdRow === "none") {
            let tmplAc = row.inscription_templates;
            if (Array.isArray(tmplAc)) tmplAc = tmplAc[0];
            const defAcNorm = normalizeDefinition(tmplAc?.definition);
            if (!submissionComplete(defAcNorm, row.answers || {}, row.files || {}, row.admin_field_flags)) {
              return res.status(400).json({
                error:
                  "Le formulaire est encore incomplet. Vérifiez chaque étape, puis réessayez pour confirmer l’envoi à l’équipe.",
              });
            }
            const nowAc = new Date().toISOString();
            const { error: uErrAc } = await supabaseAdmin
              .from("inscription_submissions")
              .update({
                review_decision: "pending",
                progress_percent: 100,
                updated_at: nowAc,
                submitted_at: nowAc,
                ...submissionCandidateIdentityFromAnswers(row.answers || {}),
              })
              .eq("id", id);
            if (uErrAc) return res.status(500).json({ error: uErrAc.message });
            return res.json({ ok: true });
          }
          return res.json({ ok: true });
        }
        return res.status(400).json({
          error:
            "Impossible d’appliquer cette action sur le dossier dans son état actuel. Actualisez la page ou repassez par le tableau de bord.",
        });
      }

      let tmplSub = row.inscription_templates;
      if (Array.isArray(tmplSub)) tmplSub = tmplSub[0];
      const defSubNorm = normalizeDefinition(tmplSub?.definition);
      if (!submissionComplete(defSubNorm, row.answers || {}, row.files || {}, row.admin_field_flags)) {
        return res.status(400).json({
          error: "Le formulaire est incomplet. Remplissez toutes les questions obligatoires.",
        });
      }
      const fm = row.admin_field_flags && typeof row.admin_field_flags === "object" ? row.admin_field_flags : {};
      if (Object.keys(fm).length > 0) {
        return res.status(400).json({
          error:
            "Des corrections demandées par l’équipe ne sont pas encore traitées. Mettez à jour les champs signalés puis réessayez.",
        });
      }
      const now = new Date().toISOString();
      const { error: uErr } = await supabaseAdmin
        .from("inscription_submissions")
        .update({
          status: "submitted",
          submitted_at: now,
          progress_percent: 100,
          updated_at: now,
          ...submissionCandidateIdentityFromAnswers(row.answers || {}),
        })
        .eq("id", id);
      if (uErr) return res.status(500).json({ error: uErr.message });
      res.json({ ok: true });
    } catch (e) {
      console.error("[portal inscription submit]", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });
}

export { BUCKET as INSCRIPTION_STORAGE_BUCKET };
