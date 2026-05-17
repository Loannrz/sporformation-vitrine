/**
 * Routes administrateur Sporformation — mini-CMS (auth Supabase + CRUD).
 *
 * Modèle :
 *   • Le client (admin.html) s'authentifie via Supabase Auth (email/password) côté navigateur.
 *   • Pour chaque requête admin, il envoie le JWT d'accès dans `Authorization: Bearer <token>`.
 *   • Le serveur vérifie ce token avec Supabase puis contrôle la présence du user_id
 *     dans la table des admins (défaut `public.admins`, configurable via SUPABASE_ADMINS_TABLE).
 *     Sans ligne correspondante → 403.
 *   • Les écritures se font avec la clé `SUPABASE_SERVICE_ROLE_KEY` (contournement RLS),
 *     elles ne sont donc effectuées que côté serveur, après vérification.
 */
import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import multer from "multer";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUCKET = "public-uploads";

let DEFAULT_FORMATION_DOCS = {};
try {
  const p = path.resolve(__dirname, "..", "src", "data", "formation-default-docs.json");
  DEFAULT_FORMATION_DOCS = JSON.parse(fs.readFileSync(p, "utf8"));
} catch (_e) {
  DEFAULT_FORMATION_DOCS = {};
}

const DOC_BTN_VARIANTS = new Set(["outline", "primary", "light", "secondary"]);
function normalizeDocVariant(v) {
  const x = String(v ?? "").trim().toLowerCase();
  return DOC_BTN_VARIANTS.has(x) ? x : "outline";
}

function buildAdminRouter({ supabaseUrl, supabaseServiceKey, supabaseAnonKey }) {
  const router = Router();

  if (!supabaseUrl || !supabaseServiceKey) {
    router.use((_req, res) => {
      res.status(503).json({
        error:
          "Supabase non configuré (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis dans .env.local).",
      });
    });
    return router;
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  /** Table des comptes console (script SQL du projet : `admins`). Si votre projet utilise `administrateurs`, renseignez SUPABASE_ADMINS_TABLE. */
  const ADMINS_TABLE = (process.env.SUPABASE_ADMINS_TABLE || "admins").trim();
  const ADMINS_COL = {
    userId: (process.env.SUPABASE_ADMINS_COL_USER_ID || "user_id").trim(),
    email: (process.env.SUPABASE_ADMINS_COL_EMAIL || "email").trim(),
    role: (process.env.SUPABASE_ADMINS_COL_ROLE || "role").trim(),
  };
  const ADMINS_SELECT = `${ADMINS_COL.userId}, ${ADMINS_COL.email}, ${ADMINS_COL.role}`;

  function shapeAdminRow(raw) {
    if (!raw) return null;
    return {
      user_id: raw[ADMINS_COL.userId],
      email: raw[ADMINS_COL.email],
      role: raw[ADMINS_COL.role],
    };
  }

  function adminsPayload(parts) {
    const o = {};
    if (parts.user_id !== undefined) o[ADMINS_COL.userId] = parts.user_id;
    if (parts.email !== undefined) o[ADMINS_COL.email] = parts.email;
    if (parts.role !== undefined) o[ADMINS_COL.role] = parts.role;
    return o;
  }

  /** Rôles autorisés à ouvrir la console (table admins). */
  const LOGIN_ALLOWED_ROLES = new Set([
    "super-admin",
    "site-editor",
    "gestion-candidatures",
    "admin", // legacy → même périmètre que site-editor côté droits CMS
  ]);

  function normalizeConsoleRoleKey(roleRaw) {
    return String(roleRaw ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/_/g, "-")
      .replace(/\s+/g, "-");
  }

  /**
   * Harmonise la valeur `public.admins.role` (casse, espaces, libellés français, legacy).
   * Retourne uniquement des clés reconnues par LOGIN_ALLOWED_ROLES (sauf legacy « admin » → site-editor).
   */
  function canonicalConsoleRole(roleRaw) {
    const x = normalizeConsoleRoleKey(roleRaw);
    if (!x) return null;
    const SUPER = new Set([
      "super-admin",
      "superadmin",
      "super-administrateur",
      "superadministrateur",
    ]);
    const EDITOR = new Set([
      "admin",
      "site-editor",
      "siteeditor",
      "modificateur",
      "editor",
      "editeur",
      "modificateur-du-site",
      "modification-du-site",
      "administrateur",
      "administrateur-site",
      "webmaster",
    ]);
    const GC = new Set([
      "gestion-candidatures",
      "gestion-candidature",
      "gestion-contrats",
      "gestionnaire-contrats",
      "gestionnaire-contrat",
    ]);
    if (SUPER.has(x)) return "super-admin";
    if (EDITOR.has(x)) return "site-editor";
    if (GC.has(x)) return "gestion-candidatures";
    return null;
  }

  function consolePermissions(roleRaw) {
    const r = String(roleRaw || "").trim();
    const isSuper = r === "super-admin";
    const legacyEditor = r === "admin" || r === "site-editor";
    return {
      cms: isSuper || legacyEditor,
      users: isSuper,
      candidaturesOnly: r === "gestion-candidatures",
    };
  }

  function normalizeAssignableConsoleRole(input) {
    const x = normalizeConsoleRoleKey(input ?? "site-editor");
    if (!x) return "site-editor";
    if (x === "admin" || x === "modificateur" || x === "site-editor" || x === "siteeditor") {
      return "site-editor";
    }
    if (
      x === "super-admin" ||
      x === "superadmin" ||
      x === "super-administrateur" ||
      x === "superadministrateur"
    ) {
      return "super-admin";
    }
    if (
      x === "gestion-candidatures" ||
      x === "gestion-candidature" ||
      x === "gestion-contrats" ||
      x === "gestionnaire-contrats"
    ) {
      return "gestion-candidatures";
    }
    return "site-editor";
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 Mo
  });

  /** Vérifie le JWT envoyé par le client et la présence dans la table des admins. */
  async function requireAdmin(req, res, next) {
    try {
      const authHeader = req.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : "";
      if (!token) {
        return res.status(401).json({ error: "Jeton d'authentification manquant." });
      }
      const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
      if (userErr || !userRes?.user) {
        return res.status(401).json({ error: "Session invalide ou expirée." });
      }
      const userId = userRes.user.id;
      const userEmail = (userRes.user.email || "").trim().toLowerCase();

      let { data: rawAdminRow, error: adminErr } = await supabaseAdmin
        .from(ADMINS_TABLE)
        .select(ADMINS_SELECT)
        .eq(ADMINS_COL.userId, userId)
        .maybeSingle();
      if (adminErr) {
        return res.status(500).json({ error: adminErr.message });
      }
      let adminRow = shapeAdminRow(rawAdminRow);

      // Ligne créée avec un mauvais user_id mais le bon e-mail (recréation Auth, copie d’UUID erronée…)
      if (!adminRow && userEmail) {
        const { data: rawByEmail, error: emailErr } = await supabaseAdmin
          .from(ADMINS_TABLE)
          .select(ADMINS_SELECT)
          .eq(ADMINS_COL.email, userEmail)
          .maybeSingle();
        const byEmail = shapeAdminRow(rawByEmail);
        if (!emailErr && byEmail) {
          if (byEmail.user_id !== userId) {
            const { error: syncErr } = await supabaseAdmin
              .from(ADMINS_TABLE)
              .update(adminsPayload({ user_id: userId, email: userEmail }))
              .eq(ADMINS_COL.userId, byEmail.user_id);
            if (!syncErr) {
              adminRow = { ...byEmail, user_id: userId, email: userEmail };
            }
          } else {
            adminRow = byEmail;
          }
        }
      }

      if (!adminRow) {
        return res.status(403).json({
          error:
            "Ce compte n'a pas le rôle administrateur. Contactez le responsable du site pour obtenir l'accès.",
        });
      }

      const resolvedRole = canonicalConsoleRole(adminRow.role);
      if (!resolvedRole || !LOGIN_ALLOWED_ROLES.has(resolvedRole)) {
        return res.status(403).json({
          error:
            "Ce compte n'a pas un rôle console autorisé (super-admin, modificateur du site ou gestion des candidatures).",
        });
      }

      req.admin = { ...adminRow, role: resolvedRole };
      req.authUser = userRes.user;
      next();
    } catch (e) {
      res
        .status(500)
        .json({ error: e instanceof Error ? e.message : "Erreur d'authentification." });
    }
  }

  function requireCms(req, res, next) {
    const p = consolePermissions(req.admin.role);
    if (!p.cms) {
      return res.status(403).json({
        error:
          "Accès au contenu du site refusé pour votre rôle. Seuls les modificateurs et super-admin peuvent modifier la vitrine.",
      });
    }
    next();
  }

  function requireSuperAdmin(req, res, next) {
    if (req.admin.role !== "super-admin") {
      return res.status(403).json({
        error: "Réservé aux super-administrateurs.",
      });
    }
    next();
  }

  router.get("/me", requireAdmin, (req, res) => {
    res.json({
      ok: true,
      admin: {
        email: req.admin.email,
        role: req.admin.role,
        user_id: req.admin.user_id,
        permissions: consolePermissions(req.admin.role),
      },
    });
  });

  const UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  /** Liste les comptes Auth + indicateur admin (service_role). */
  router.get("/users", requireAdmin, requireSuperAdmin, async (_req, res) => {
    try {
      const { data: adminRows, error: admErr } = await supabaseAdmin
        .from(ADMINS_TABLE)
        .select(ADMINS_SELECT);
      if (admErr) return res.status(500).json({ error: admErr.message });
      const adminByUser = new Map(
        (adminRows || [])
          .map((r) => shapeAdminRow(r))
          .filter(Boolean)
          .map((row) => [row.user_id, row])
      );

      const collected = [];
      let page = 1;
      const perPage = 200;
      while (page <= 100) {
        const { data: pageData, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page,
          perPage,
        });
        if (listErr) return res.status(500).json({ error: listErr.message });
        const chunk = pageData?.users || [];
        collected.push(...chunk);
        if (chunk.length < perPage) break;
        page += 1;
      }

      const users = collected.map((u) => {
        const row = adminByUser.get(u.id);
        const meta = u.user_metadata || {};
        const displayName =
          (typeof meta.full_name === "string" && meta.full_name.trim()) ||
          (typeof meta.name === "string" && meta.name.trim()) ||
          (u.email ? u.email.split("@")[0] : "—");
        return {
          id: u.id,
          email: u.email || "",
          display_name: displayName,
          admin: Boolean(row),
          role: row?.role ?? null,
        };
      });
      users.sort((a, b) => (a.email || "").localeCompare(b.email || "", "fr"));
      res.json({ users });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Impossible de charger les utilisateurs.",
      });
    }
  });

  /** Promouvoir ou retirer un administrateur (table des admins Supabase). */
  router.put("/users/:userId/admin", requireAdmin, requireSuperAdmin, async (req, res) => {
    const targetId = String(req.params.userId || "").trim();
    if (!UUID_RE.test(targetId)) {
      return res.status(400).json({ error: "Identifiant utilisateur invalide." });
    }
    const wantAdmin = Boolean(req.body?.admin);
    const actorId = req.admin.user_id;
    const requestedRoleRaw = req.body?.console_role;

    try {
      if (!wantAdmin) {
        if (targetId === actorId) {
          return res.status(400).json({
            error: "Vous ne pouvez pas retirer vos propres droits administrateur.",
          });
        }
        const { data: rawTargetAdmin, error: findErr } = await supabaseAdmin
          .from(ADMINS_TABLE)
          .select(ADMINS_COL.userId)
          .eq(ADMINS_COL.userId, targetId)
          .maybeSingle();
        if (findErr) return res.status(500).json({ error: findErr.message });
        if (!rawTargetAdmin) {
          return res.json({ ok: true, admin: false });
        }
        const { count, error: cntErr } = await supabaseAdmin
          .from(ADMINS_TABLE)
          .select(ADMINS_COL.userId, { count: "exact", head: true });
        if (cntErr) return res.status(500).json({ error: cntErr.message });
        if ((count ?? 0) <= 1) {
          return res.status(400).json({
            error: "Au moins un administrateur doit rester en base.",
          });
        }
        const { error: delErr } = await supabaseAdmin
          .from(ADMINS_TABLE)
          .delete()
          .eq(ADMINS_COL.userId, targetId);
        if (delErr) return res.status(500).json({ error: delErr.message });
        return res.json({ ok: true, admin: false });
      }

      const { data: authUser, error: getErr } =
        await supabaseAdmin.auth.admin.getUserById(targetId);
      if (getErr || !authUser?.user) {
        return res.status(404).json({ error: "Utilisateur introuvable dans l'authentification." });
      }
      const email =
        authUser.user.email ||
        (typeof authUser.user.new_email === "string" ? authUser.user.new_email : null);
      if (!email) {
        return res.status(400).json({ error: "L'utilisateur n'a pas d'e-mail : promotion impossible." });
      }

      const { data: rawAlreadyAdmin, error: exErr } = await supabaseAdmin
        .from(ADMINS_TABLE)
        .select(ADMINS_SELECT)
        .eq(ADMINS_COL.userId, targetId)
        .maybeSingle();
      if (exErr) return res.status(500).json({ error: exErr.message });
      const alreadyAdmin = shapeAdminRow(rawAlreadyAdmin);
      if (alreadyAdmin) {
        let updatedRow = alreadyAdmin;
        if (requestedRoleRaw != null && String(requestedRoleRaw).trim() !== "") {
          const nextRole = normalizeAssignableConsoleRole(requestedRoleRaw);
          const currentRole =
            canonicalConsoleRole(alreadyAdmin.role) ?? alreadyAdmin.role;
          if (nextRole !== currentRole) {
            const { data: rawUpd, error: upErr } = await supabaseAdmin
              .from(ADMINS_TABLE)
              .update(adminsPayload({ role: nextRole }))
              .eq(ADMINS_COL.userId, targetId)
              .select(ADMINS_SELECT)
              .maybeSingle();
            if (upErr) return res.status(500).json({ error: upErr.message });
            const upd = shapeAdminRow(rawUpd);
            if (upd) updatedRow = upd;
          }
        }
        return res.json({ ok: true, admin: true, row: updatedRow });
      }

      const roleToSet =
        requestedRoleRaw != null && String(requestedRoleRaw).trim() !== ""
          ? normalizeAssignableConsoleRole(requestedRoleRaw)
          : "site-editor";

      const { data: rawInserted, error: insErr } = await supabaseAdmin
        .from(ADMINS_TABLE)
        .insert(
          adminsPayload({
            user_id: targetId,
            email: String(email).trim(),
            role: roleToSet,
          })
        )
        .select(ADMINS_SELECT)
        .maybeSingle();
      if (insErr) return res.status(500).json({ error: insErr.message });

      res.json({ ok: true, admin: true, row: shapeAdminRow(rawInserted) });
    } catch (e) {
      res.status(500).json({
        error: e instanceof Error ? e.message : "Mise à jour impossible.",
      });
    }
  });

  // ── Site settings (clé/valeur JSONB) ───────────────────────────────────────────
  router.get("/settings", requireAdmin, requireCms, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("cle, valeur, maj_at")
      .order("cle", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.put("/settings/:cle", requireAdmin, requireCms, async (req, res) => {
    const cle = String(req.params.cle || "").trim();
    if (!cle) return res.status(400).json({ error: "Clé requise." });
    const valeur = req.body?.valeur;
    if (valeur === undefined) return res.status(400).json({ error: "Valeur requise." });
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .upsert({ cle, valeur, maj_at: new Date().toISOString() }, { onConflict: "cle" })
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, item: data });
  });

  // ── Formation overrides ───────────────────────────────────────────────────────
  router.get("/formation-overrides", requireAdmin, requireCms, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("formation_overrides")
      .select("id, slug, ville, cle, valeur, source, maj_at")
      .order("slug")
      .order("ville")
      .order("cle");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.put("/formation-overrides", requireAdmin, requireCms, async (req, res) => {
    const { slug, ville, cle, valeur, source } = req.body || {};
    if (!slug || !ville || !cle) {
      return res.status(400).json({ error: "slug, ville et cle requis." });
    }
    const payload = {
      slug: String(slug).trim(),
      ville: String(ville).trim(),
      cle: String(cle).trim(),
      valeur: valeur === null || valeur === undefined ? null : String(valeur),
      source: source === "auto" ? "auto" : "manuel",
      maj_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from("formation_overrides")
      .upsert(payload, { onConflict: "slug,ville,cle" })
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, item: data });
  });

  router.delete("/formation-overrides/:id", requireAdmin, requireCms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide." });
    const { error } = await supabaseAdmin
      .from("formation_overrides")
      .delete()
      .eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // ── Upload fichier dans Supabase Storage ──────────────────────────────────────
  router.post(
    "/upload",
    requireAdmin,
    requireCms,
    upload.single("file"),
    async (req, res) => {
      try {
        if (!req.file) return res.status(400).json({ error: "Fichier manquant." });
        const safeBase = (req.file.originalname || "fichier")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-zA-Z0-9.\-_]/g, "-");
        const folder = String(req.body?.dossier || "divers")
          .replace(/[^a-zA-Z0-9\-_]/g, "")
          .slice(0, 40) || "divers";
        const stamp = Date.now();
        const rand = crypto.randomBytes(3).toString("hex");
        const ext = path.extname(safeBase);
        const baseNoExt = path.basename(safeBase, ext);
        const objectPath = `${folder}/${stamp}-${rand}-${baseNoExt}${ext}`;

        const { error: upErr } = await supabaseAdmin.storage
          .from(BUCKET)
          .upload(objectPath, req.file.buffer, {
            contentType: req.file.mimetype,
            upsert: false,
          });
        if (upErr) return res.status(500).json({ error: upErr.message });

        const { data: pub } = supabaseAdmin.storage
          .from(BUCKET)
          .getPublicUrl(objectPath);

        res.json({
          ok: true,
          url: pub?.publicUrl,
          fichier_chemin: objectPath,
          original_name: req.file.originalname,
          mime: req.file.mimetype,
          taille: req.file.size,
        });
      } catch (e) {
        res
          .status(500)
          .json({ error: e instanceof Error ? e.message : "Erreur d'upload." });
      }
    }
  );

  // ── Documents & liens utiles ──────────────────────────────────────────────────
  router.get("/documents", requireAdmin, requireCms, async (req, res) => {
    const scope = String(req.query.scope || "").trim();
    const scope_key = String(req.query.scope_key || "").trim();
    let q = supabaseAdmin
      .from("documents_utiles")
      .select(
        "id, scope, scope_key, label, url, fichier_chemin, type, bouton_variante, ordre, cree_at"
      )
      .order("scope")
      .order("scope_key")
      .order("ordre");
    if (scope) q = q.eq("scope", scope);
    if (scope_key) q = q.eq("scope_key", scope_key);
    const { data, error } = await q;
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.post("/documents", requireAdmin, requireCms, async (req, res) => {
    const {
      scope,
      scope_key,
      label,
      url,
      fichier_chemin,
      type,
      ordre,
      bouton_variante,
    } = req.body || {};
    if (!scope || !label || !url) {
      return res.status(400).json({ error: "scope, label et url requis." });
    }
    const payload = {
      scope: String(scope).trim(),
      scope_key: String(scope_key || "").trim(),
      label: String(label).trim().slice(0, 200),
      url: String(url).trim(),
      fichier_chemin: fichier_chemin ? String(fichier_chemin).trim() : null,
      type: type === "lien" ? "lien" : "document",
      bouton_variante: normalizeDocVariant(bouton_variante),
      ordre: Number.isFinite(Number(ordre)) ? Number(ordre) : 100,
    };
    const { data, error } = await supabaseAdmin
      .from("documents_utiles")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ ok: true, item: data });
  });

  router.patch("/documents/:id", requireAdmin, requireCms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide." });
    const patch = {};
    const fields = [
      "label",
      "url",
      "scope",
      "scope_key",
      "type",
      "ordre",
      "fichier_chemin",
      "bouton_variante",
    ];
    for (const k of fields) {
      if (req.body?.[k] !== undefined) {
        if (k === "bouton_variante") patch[k] = normalizeDocVariant(req.body[k]);
        else patch[k] = req.body[k];
      }
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Aucun champ." });
    const { data, error } = await supabaseAdmin
      .from("documents_utiles")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, item: data });
  });

  /**
   * Seed des liens « Documents et liens utiles » par défaut (extraits du HTML
   * `formation-detail.html`). N'écrase rien : on n'insère que pour les couples
   * `slug|ville` qui n'ont AUCUNE ligne en base avec scope='formation'.
   */
  router.post("/documents/seed-formation-defaults", requireAdmin, requireCms, async (req, res) => {
    const onlyKey = String(req.body?.scope_key || "").trim();
    const targets = Object.entries(DEFAULT_FORMATION_DOCS).filter(([key]) =>
      onlyKey ? key === onlyKey : true
    );
    if (!targets.length) return res.json({ ok: true, seeded: 0, skipped: 0 });

    // Liste des couples déjà non vides
    const { data: existing, error: exErr } = await supabaseAdmin
      .from("documents_utiles")
      .select("scope_key")
      .eq("scope", "formation");
    if (exErr) return res.status(500).json({ error: exErr.message });
    const occupied = new Set((existing || []).map((r) => r.scope_key));

    let seeded = 0;
    let skipped = 0;
    for (const [key, defs] of targets) {
      if (occupied.has(key)) {
        skipped++;
        continue;
      }
      const rows = defs.map((d) => ({
        scope: "formation",
        scope_key: key,
        label: String(d.label).slice(0, 200),
        url: String(d.url),
        type: d.type === "document" ? "document" : "lien",
        bouton_variante: normalizeDocVariant(d.bouton_variante),
        ordre: Number.isFinite(Number(d.ordre)) ? Number(d.ordre) : 100,
      }));
      const { error } = await supabaseAdmin.from("documents_utiles").insert(rows);
      if (error) return res.status(500).json({ error: error.message });
      seeded++;
    }
    res.json({ ok: true, seeded, skipped, couples: targets.length });
  });

  router.delete("/documents/:id", requireAdmin, requireCms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide." });
    // Récupère le chemin fichier pour le supprimer du bucket
    const { data: row } = await supabaseAdmin
      .from("documents_utiles")
      .select("fichier_chemin")
      .eq("id", id)
      .maybeSingle();
    if (row?.fichier_chemin) {
      await supabaseAdmin.storage.from(BUCKET).remove([row.fichier_chemin]).catch(() => null);
    }
    const { error } = await supabaseAdmin.from("documents_utiles").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // ── Partenaires ───────────────────────────────────────────────────────────────
  router.get("/partenaires", requireAdmin, requireCms, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("partenaires")
      .select("id, nom, logo_url, fichier_chemin, lien, ordre, actif, cree_at")
      .order("ordre");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.post("/partenaires", requireAdmin, requireCms, async (req, res) => {
    const { nom, logo_url, fichier_chemin, lien, ordre, actif } = req.body || {};
    if (!nom) return res.status(400).json({ error: "nom requis." });
    const payload = {
      nom: String(nom).trim().slice(0, 120),
      logo_url: logo_url ? String(logo_url).trim() : null,
      fichier_chemin: fichier_chemin ? String(fichier_chemin).trim() : null,
      lien: lien ? String(lien).trim() : null,
      ordre: Number.isFinite(Number(ordre)) ? Number(ordre) : 100,
      actif: actif === false ? false : true,
    };
    const { data, error } = await supabaseAdmin
      .from("partenaires")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ ok: true, item: data });
  });

  router.patch("/partenaires/:id", requireAdmin, requireCms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide." });
    const patch = {};
    const fields = ["nom", "logo_url", "fichier_chemin", "lien", "ordre", "actif"];
    for (const k of fields) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ error: "Aucun champ." });
    const { data, error } = await supabaseAdmin
      .from("partenaires")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, item: data });
  });

  router.delete("/partenaires/:id", requireAdmin, requireCms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide." });
    const { data: row } = await supabaseAdmin
      .from("partenaires")
      .select("fichier_chemin")
      .eq("id", id)
      .maybeSingle();
    if (row?.fichier_chemin) {
      await supabaseAdmin.storage.from(BUCKET).remove([row.fichier_chemin]).catch(() => null);
    }
    const { error } = await supabaseAdmin.from("partenaires").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // ── Équipe pédagogique (page Qui sommes-nous / À propos) ─────────────────────
  router.get("/equipe-pedagogique", requireAdmin, requireCms, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("equipe_pedagogique")
      .select("id, prenom, fonction, email, telephone, ordre, actif, cree_at, maj_at")
      .order("ordre");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.post("/equipe-pedagogique", requireAdmin, requireCms, async (req, res) => {
    const { prenom, fonction, email, telephone, ordre, actif } = req.body || {};
    if (!prenom || !fonction) {
      return res.status(400).json({ error: "prenom et fonction requis." });
    }
    const payload = {
      prenom: String(prenom).trim().slice(0, 80),
      fonction: String(fonction).trim().slice(0, 240),
      email: email ? String(email).trim().slice(0, 160) : null,
      telephone: telephone ? String(telephone).trim().slice(0, 40) : null,
      ordre: Number.isFinite(Number(ordre)) ? Number(ordre) : 100,
      actif: actif === false ? false : true,
      maj_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from("equipe_pedagogique")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ ok: true, item: data });
  });

  router.patch("/equipe-pedagogique/:id", requireAdmin, requireCms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide." });
    const patch = { maj_at: new Date().toISOString() };
    const fields = ["prenom", "fonction", "email", "telephone", "ordre", "actif"];
    for (const k of fields) {
      if (req.body?.[k] !== undefined) {
        if (k === "email") patch[k] = req.body[k] ? String(req.body[k]).trim().slice(0, 160) : null;
        else if (k === "telephone")
          patch[k] = req.body[k] ? String(req.body[k]).trim().slice(0, 40) : null;
        else if (k === "prenom") patch[k] = String(req.body[k]).trim().slice(0, 80);
        else if (k === "fonction") patch[k] = String(req.body[k]).trim().slice(0, 240);
        else if (k === "ordre") patch[k] = Number.isFinite(Number(req.body[k])) ? Number(req.body[k]) : 100;
        else if (k === "actif") patch[k] = req.body[k] === false ? false : true;
      }
    }
    const keys = Object.keys(patch).filter((k) => k !== "maj_at");
    if (!keys.length) return res.status(400).json({ error: "Aucun champ." });
    const { data, error } = await supabaseAdmin
      .from("equipe_pedagogique")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, item: data });
  });

  router.delete("/equipe-pedagogique/:id", requireAdmin, requireCms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide." });
    const { error } = await supabaseAdmin.from("equipe_pedagogique").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  // ── Étapes méthode TEP (nb dynamique) ────────────────────────────────────────
  router.get("/tep-etapes", requireAdmin, requireCms, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("tep_etapes")
      .select("id, ordre, badge, titre, description, accent, lien_document, actif, maj_at")
      .order("ordre");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.post("/tep-etapes", requireAdmin, requireCms, async (req, res) => {
    const { ordre, badge, titre, description, accent, lien_document, actif } =
      req.body || {};
    if (!titre || !description) {
      return res.status(400).json({ error: "titre et description requis." });
    }
    const payload = {
      ordre: Number.isFinite(Number(ordre)) ? Number(ordre) : 100,
      badge: badge ? String(badge).trim().slice(0, 60) : null,
      titre: String(titre).trim().slice(0, 200),
      description: String(description).trim().slice(0, 2000),
      accent: accent === true,
      lien_document: lien_document ? Number(lien_document) : null,
      actif: actif === false ? false : true,
    };
    const { data, error } = await supabaseAdmin
      .from("tep_etapes")
      .insert(payload)
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json({ ok: true, item: data });
  });

  router.patch("/tep-etapes/:id", requireAdmin, requireCms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide." });
    const patch = {};
    const fields = ["ordre", "badge", "titre", "description", "accent", "lien_document", "actif"];
    for (const k of fields) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k];
    }
    patch.maj_at = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from("tep_etapes")
      .update(patch)
      .eq("id", id)
      .select()
      .maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true, item: data });
  });

  router.delete("/tep-etapes/:id", requireAdmin, requireCms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "id invalide." });
    const { error } = await supabaseAdmin.from("tep_etapes").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ ok: true });
  });

  return router;
}

/** Retire le chemin stockage du JSON public ; ajoute une URL signée si besoin (bucket privé). */
async function partnerRowsForPublicApi(storageAdmin, rows) {
  const list = rows || [];
  if (!list.length) return [];

  const ttlSeconds = 60 * 60 * 24 * 7; // 7 jours — rechargement page régénère via l’API

  return Promise.all(
    list.map(async (p) => {
      const { fichier_chemin, ...rest } = p;
      let logo_url = rest.logo_url ?? null;

      if (storageAdmin && fichier_chemin) {
        const { data, error } = await storageAdmin.storage
          .from(BUCKET)
          .createSignedUrl(fichier_chemin, ttlSeconds);
        if (!error && data?.signedUrl) {
          logo_url = data.signedUrl;
        } else if (error) {
          console.warn(
            "[site-content] logo partenaire : impossible de signer",
            fichier_chemin,
            error.message
          );
        }
      }

      return { ...rest, logo_url };
    })
  );
}

/** Endpoint public (lecture seule) — agrège tout le contenu dynamique pour le site. */
function buildPublicContentHandler({ supabaseUrl, supabaseAnonKey, supabaseServiceKey }) {
  const client =
    supabaseUrl && (supabaseAnonKey || supabaseServiceKey)
      ? createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

  const storageAdmin =
    supabaseUrl && supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

  return async function publicContentHandler(_req, res) {
    if (!client) {
      return res.json({
        settings: {},
        formation_overrides: [],
        documents: [],
        partenaires: [],
        equipe_pedagogique: [],
        tep_etapes: [],
      });
    }
    const [settings, overrides, documents, partenaires, equipePedagogique, etapes] =
      await Promise.all([
      client.from("site_settings").select("cle, valeur"),
      client.from("formation_overrides").select("slug, ville, cle, valeur, source"),
      client
        .from("documents_utiles")
        .select(
          "id, scope, scope_key, label, url, type, ordre, bouton_variante"
        )
        .order("ordre"),
      client
        .from("partenaires")
        .select("id, nom, logo_url, fichier_chemin, lien, ordre, actif")
        .eq("actif", true)
        .order("ordre"),
      client
        .from("equipe_pedagogique")
        .select("id, prenom, fonction, email, telephone, ordre, actif")
        .eq("actif", true)
        .order("ordre"),
      client
        .from("tep_etapes")
        .select("id, ordre, badge, titre, description, accent, lien_document, actif")
        .eq("actif", true)
        .order("ordre"),
    ]);

    const settingsObj = {};
    for (const row of settings.data || []) settingsObj[row.cle] = row.valeur;

    if (settings.error) console.warn("[site-content] site_settings:", settings.error.message);
    if (overrides.error) console.warn("[site-content] formation_overrides:", overrides.error.message);
    if (documents.error) console.warn("[site-content] documents_utiles:", documents.error.message);
    if (partenaires.error) console.warn("[site-content] partenaires:", partenaires.error.message);
    if (equipePedagogique.error)
      console.warn("[site-content] equipe_pedagogique:", equipePedagogique.error.message);
    if (etapes.error) console.warn("[site-content] tep_etapes:", etapes.error.message);
    if (!storageAdmin && (partenaires.data || []).some((p) => p.fichier_chemin)) {
      console.warn(
        "[site-content] SUPABASE_SERVICE_ROLE_KEY absente : les logos utilisent logo_url brut (bucket Storage doit être public)."
      );
    }

    const partenairesPublic = await partnerRowsForPublicApi(
      storageAdmin,
      partenaires.data || []
    );

    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    res.json({
      settings: settingsObj,
      formation_overrides: overrides.data || [],
      documents: documents.data || [],
      partenaires: partenairesPublic,
      equipe_pedagogique: equipePedagogique.data || [],
      tep_etapes: etapes.data || [],
    });
  };
}

export { buildAdminRouter, buildPublicContentHandler };
