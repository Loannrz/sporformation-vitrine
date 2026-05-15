/**
 * Routes administrateur Sporformation — mini-CMS (auth Supabase + CRUD).
 *
 * Modèle :
 *   • Le client (admin.html) s'authentifie via Supabase Auth (email/password) côté navigateur.
 *   • Pour chaque requête admin, il envoie le JWT d'accès dans `Authorization: Bearer <token>`.
 *   • Le serveur vérifie ce token avec Supabase puis contrôle la présence du user_id
 *     dans la table `public.admins`. Sans ça → 401.
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

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 }, // 25 Mo
  });

  /** Vérifie le JWT envoyé par le client et la présence dans `admins`. */
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
      const { data: adminRow, error: adminErr } = await supabaseAdmin
        .from("admins")
        .select("user_id, email, role")
        .eq("user_id", userId)
        .maybeSingle();
      if (adminErr) {
        return res.status(500).json({ error: adminErr.message });
      }
      if (!adminRow) {
        const email = userRes.user.email || "(email inconnu)";
        return res.status(403).json({
          error:
            "Ce compte n'a pas le rôle administrateur. " +
            `Demandez au responsable du site d'exécuter : ` +
            `INSERT INTO public.admins (user_id, email, role) VALUES ('${userId}', '${email}', 'super-admin');`,
          user_id: userId,
          email,
        });
      }
      req.admin = adminRow;
      req.authUser = userRes.user;
      next();
    } catch (e) {
      res
        .status(500)
        .json({ error: e instanceof Error ? e.message : "Erreur d'authentification." });
    }
  }

  router.get("/me", requireAdmin, (req, res) => {
    res.json({
      ok: true,
      admin: { email: req.admin.email, role: req.admin.role },
    });
  });

  // ── Site settings (clé/valeur JSONB) ───────────────────────────────────────────
  router.get("/settings", requireAdmin, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("site_settings")
      .select("cle, valeur, maj_at")
      .order("cle", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.put("/settings/:cle", requireAdmin, async (req, res) => {
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
  router.get("/formation-overrides", requireAdmin, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("formation_overrides")
      .select("id, slug, ville, cle, valeur, source, maj_at")
      .order("slug")
      .order("ville")
      .order("cle");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.put("/formation-overrides", requireAdmin, async (req, res) => {
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

  router.delete("/formation-overrides/:id", requireAdmin, async (req, res) => {
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
  router.get("/documents", requireAdmin, async (req, res) => {
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

  router.post("/documents", requireAdmin, async (req, res) => {
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

  router.patch("/documents/:id", requireAdmin, async (req, res) => {
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
  router.post("/documents/seed-formation-defaults", requireAdmin, async (req, res) => {
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

  router.delete("/documents/:id", requireAdmin, async (req, res) => {
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
  router.get("/partenaires", requireAdmin, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("partenaires")
      .select("id, nom, logo_url, fichier_chemin, lien, ordre, actif, cree_at")
      .order("ordre");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.post("/partenaires", requireAdmin, async (req, res) => {
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

  router.patch("/partenaires/:id", requireAdmin, async (req, res) => {
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

  router.delete("/partenaires/:id", requireAdmin, async (req, res) => {
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

  // ── Étapes méthode TEP (nb dynamique) ────────────────────────────────────────
  router.get("/tep-etapes", requireAdmin, async (_req, res) => {
    const { data, error } = await supabaseAdmin
      .from("tep_etapes")
      .select("id, ordre, badge, titre, description, accent, lien_document, actif, maj_at")
      .order("ordre");
    if (error) return res.status(500).json({ error: error.message });
    res.json({ items: data || [] });
  });

  router.post("/tep-etapes", requireAdmin, async (req, res) => {
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

  router.patch("/tep-etapes/:id", requireAdmin, async (req, res) => {
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

  router.delete("/tep-etapes/:id", requireAdmin, async (req, res) => {
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
        tep_etapes: [],
      });
    }
    const [settings, overrides, documents, partenaires, etapes] = await Promise.all([
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
      tep_etapes: etapes.data || [],
    });
  };
}

export { buildAdminRouter, buildPublicContentHandler };
