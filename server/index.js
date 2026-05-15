/**
 * API locale formulaires + métrique « nombre d'étudiants » + envoi mails Resend.
 * Persistance : Supabase (priorité, via SUPABASE_SERVICE_ROLE_KEY) + SQLite locale (fallback / archivage).
 */
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import {
  buildCandidatureHtml,
  buildEmployerHtml,
  notifyCandidature,
  notifyEmployeur,
  resendConfigured,
} from "./resend-mail.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

dotenv.config({ path: path.resolve(rootDir, ".env") });
dotenv.config({ path: path.resolve(rootDir, ".env.local"), override: true });

const PORT = Number(process.env.FORMS_API_PORT || 3001);
const dbPath = path.resolve(
  rootDir,
  process.env.FORMS_SQLITE_PATH || "data/sporformation-forms.db"
);
const apiSecret = process.env.FORMS_API_SECRET || "";

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS formulaires_etudiants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  ville_residence TEXT,
  formation_souhaitee TEXT NOT NULL,
  ville_formation TEXT,
  situation TEXT NOT NULL,
  employeur_structure TEXT NOT NULL,
  source_connaissance TEXT NOT NULL,
  motivation TEXT NOT NULL,
  consentement_recontact INTEGER NOT NULL DEFAULT 0,
  consentement_politique INTEGER NOT NULL DEFAULT 0,
  origine TEXT NOT NULL DEFAULT 'site-vitrine'
);

CREATE INDEX IF NOT EXISTS idx_etudiants_created ON formulaires_etudiants (created_at DESC);

CREATE TABLE IF NOT EXISTS formulaires_employeurs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  email TEXT NOT NULL,
  telephone TEXT NOT NULL,
  formation_recherchee TEXT NOT NULL,
  recherche_alternants INTEGER NOT NULL DEFAULT 0,
  consentement_recontact INTEGER NOT NULL DEFAULT 0,
  consentement_politique INTEGER NOT NULL DEFAULT 0,
  origine TEXT NOT NULL DEFAULT 'site-vitrine'
);

CREATE INDEX IF NOT EXISTS idx_employeurs_created ON formulaires_employeurs (created_at DESC);

CREATE TABLE IF NOT EXISTS indicateurs_site (
  cle TEXT PRIMARY KEY,
  valeur_entier INTEGER NOT NULL DEFAULT 0,
  maj_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO indicateurs_site (cle, valeur_entier) VALUES ('nombre_etudiants_actifs', 204);
`);

const insertStudent = db.prepare(`
  INSERT INTO formulaires_etudiants (
    prenom, nom, email, telephone, ville_residence, formation_souhaitee, ville_formation,
    situation, employeur_structure, source_connaissance, motivation,
    consentement_recontact, consentement_politique, origine
  ) VALUES (
    @prenom, @nom, @email, @telephone, @ville_residence, @formation_souhaitee, @ville_formation,
    @situation, @employeur_structure, @source_connaissance, @motivation,
    @consentement_recontact, @consentement_politique, @origine
  )
`);

const insertEmployer = db.prepare(`
  INSERT INTO formulaires_employeurs (
    prenom, nom, email, telephone, formation_recherchee, recherche_alternants,
    consentement_recontact, consentement_politique, origine
  ) VALUES (
    @prenom, @nom, @email, @telephone, @formation_recherchee, @recherche_alternants,
    @consentement_recontact, @consentement_politique, @origine
  )
`);

/* ────────────────────────────────────────────────────────────────────
 * Supabase (service_role) — destination principale des formulaires + métriques.
 * Les noms de tables/champs miroient ceux de SQLite + database/schema.postgresql.sql.
 * ────────────────────────────────────────────────────────────────── */
const supabaseUrl = (
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
)
  .toString()
  .trim();
const supabaseServiceKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  ""
)
  .toString()
  .trim();
const supabaseAnonKey = (
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ""
)
  .toString()
  .trim();

const supabaseAdmin =
  supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const supabasePublic =
  supabaseUrl && (supabaseAnonKey || supabaseServiceKey)
    ? createClient(supabaseUrl, supabaseAnonKey || supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

function supabaseConfigured() {
  return Boolean(supabaseAdmin);
}

async function insertStudentSupabase(payload) {
  if (!supabaseAdmin) return { ok: false, reason: "supabase non configuré" };
  const { error } = await supabaseAdmin
    .from("formulaires_etudiants")
    .insert({
      prenom: payload.prenom,
      nom: payload.nom,
      email: payload.email,
      telephone: payload.telephone,
      ville_residence: payload.ville_residence,
      formation_souhaitee: payload.formation_souhaitee,
      ville_formation: payload.ville_formation,
      situation: payload.situation,
      employeur_structure: payload.employeur_structure,
      source_connaissance: payload.source_connaissance,
      motivation: payload.motivation,
      consentement_recontact: Boolean(payload.consentement_recontact),
      consentement_politique: Boolean(payload.consentement_politique),
      origine: payload.origine,
    });
  if (error) {
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

async function insertEmployerSupabase(payload) {
  if (!supabaseAdmin) return { ok: false, reason: "supabase non configuré" };
  const { error } = await supabaseAdmin
    .from("formulaires_employeurs")
    .insert({
      prenom: payload.prenom,
      nom: payload.nom,
      email: payload.email,
      telephone: payload.telephone,
      formation_recherchee: payload.formation_recherchee,
      recherche_alternants: Boolean(payload.recherche_alternants),
      consentement_recontact: Boolean(payload.consentement_recontact),
      consentement_politique: Boolean(payload.consentement_politique),
      origine: payload.origine,
    });
  if (error) {
    return { ok: false, reason: error.message };
  }
  return { ok: true };
}

/** Compte tous les apprentis (table `students`) — toutes promos, avec ou sans classe assignée. */
async function countStudentsSupabase() {
  if (!supabaseAdmin && !supabasePublic) return null;
  const client = supabaseAdmin || supabasePublic;
  const tableName = (process.env.SUPABASE_STUDENTS_TABLE || "students").trim();
  const { count, error } = await client
    .from(tableName)
    .select("*", { count: "exact", head: true });
  if (error) {
    console.warn(`[metrics] supabase count ${tableName}:`, error.message);
    return null;
  }
  return typeof count === "number" ? count : null;
}

async function countClassesSupabase() {
  if (!supabaseAdmin && !supabasePublic) return null;
  const client = supabaseAdmin || supabasePublic;
  const { count, error } = await client
    .from("classes")
    .select("*", { count: "exact", head: true });
  if (error) {
    console.warn("[metrics] supabase count classes:", error.message);
    return null;
  }
  return typeof count === "number" ? count : null;
}

function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 5 || v.length > 254) return false;
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v);
}

const app = express();
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-api-key"],
  })
);
app.use(express.json({ limit: "96kb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sporformation-forms",
    resend: resendConfigured(),
    supabase: supabaseConfigured(),
  });
});

/* Previsualisation du rendu HTML des mails sans envoi Resend (dev only) */
const sampleCandidature = {
  prenom: "Camille",
  nom: "Bertrand",
  email: "camille.bertrand@example.fr",
  telephone: "06 12 34 56 78",
  villeResidence: "Courbevoie (92)",
  formationSouhaitee: "BPJEPS APT — Activités Physiques pour Tous",
  villeFormation: "Courbevoie",
  situation: "Salarié — temps partiel",
  employeur: "Club Sportif Municipal de Courbevoie",
  source: "Recommandation d'un ancien apprenti",
  motivation:
    "Passionnée de sport depuis l'enfance, je souhaite faire de l'encadrement sportif mon métier. J'accompagne déjà bénévolement les jeunes du club et je veux maintenant me professionnaliser via le BPJEPS APT. L'alternance correspond parfaitement à mon profil : continuer à travailler tout en me formant sérieusement.",
};

const sampleEmployer = {
  prenom: "Julien",
  nom: "Moreau",
  email: "julien.moreau@example.fr",
  telephone: "07 88 99 00 11",
  formationRecherchee: "BPJEPS APT — Activités Physiques pour Tous",
  rechercheAlternants: "oui",
};

app.get("/api/email/preview/candidature", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(buildCandidatureHtml(sampleCandidature));
});

app.get("/api/email/preview/employeur", (_req, res) => {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(buildEmployerHtml(sampleEmployer));
});

app.get("/api/metrics", async (_req, res) => {
  const [supaStudents, supaClasses] = await Promise.all([
    countStudentsSupabase(),
    countClassesSupabase(),
  ]);

  let nombreEtudiantsActifs = supaStudents;
  let nombreClasses = supaClasses;
  let source = "supabase";

  if (nombreEtudiantsActifs == null) {
    const row = db
      .prepare(
        "SELECT valeur_entier FROM indicateurs_site WHERE cle = 'nombre_etudiants_actifs'"
      )
      .get();
    nombreEtudiantsActifs =
      typeof row?.valeur_entier === "number" ? row.valeur_entier : 204;
    source = "sqlite";
  }

  if (nombreClasses == null) {
    const row = db
      .prepare(
        "SELECT valeur_entier FROM indicateurs_site WHERE cle = 'nombre_classes'"
      )
      .get();
    nombreClasses = typeof row?.valeur_entier === "number" ? row.valeur_entier : 14;
  }

  res.json({ nombreEtudiantsActifs, nombreClasses, source });
});

app.post("/api/email/candidature", async (req, res) => {
  if (!resendConfigured()) {
    return res.status(503).json({
      error:
        "Resend non configuré sur le serveur (RESEND_API_KEY, EMAIL_FROM, DIRECTOR_EMAIL dans .env.local).",
    });
  }
  const b = req.body || {};
  const required = [
    "prenom",
    "nom",
    "email",
    "telephone",
    "formationSouhaitee",
    "situation",
    "employeur",
    "source",
    "motivation",
  ];
  for (const k of required) {
    if (!b[k] || String(b[k]).trim() === "") {
      return res.status(400).json({ error: `Champ manquant : ${k}` });
    }
  }
  if (!isValidEmail(b.email)) {
    return res.status(400).json({ error: "Email candidat invalide." });
  }
  if (String(b.motivation).trim().length < 100) {
    return res.status(400).json({ error: "Motivation trop courte." });
  }
  try {
    await notifyCandidature(b);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[email/candidature]", e);
    res.status(502).json({
      error: e instanceof Error ? e.message : "Échec envoi Resend.",
    });
  }
});

app.post("/api/email/employeur", async (req, res) => {
  if (!resendConfigured()) {
    return res.status(503).json({
      error:
        "Resend non configuré sur le serveur (RESEND_API_KEY, EMAIL_FROM, DIRECTOR_EMAIL dans .env.local).",
    });
  }
  const b = req.body || {};
  const required = ["prenom", "nom", "email", "telephone", "formationRecherchee"];
  for (const k of required) {
    if (!b[k] || String(b[k]).trim() === "") {
      return res.status(400).json({ error: `Champ manquant : ${k}` });
    }
  }
  if (!isValidEmail(b.email)) {
    return res.status(400).json({ error: "Email employeur invalide." });
  }
  if (!b.rechercheAlternants || !b.recontact || !b.confidentialite) {
    return res.status(400).json({ error: "Consentements requis." });
  }
  try {
    await notifyEmployeur(b);
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("[email/employeur]", e);
    res.status(502).json({
      error: e instanceof Error ? e.message : "Échec envoi Resend.",
    });
  }
});

app.patch("/api/internal/metrics/nombre-etudiants", (req, res) => {
  if (!apiSecret || req.headers["x-api-key"] !== apiSecret) {
    return res.status(401).json({ error: "Clé API invalide ou FORMS_API_SECRET non défini." });
  }
  const raw = req.body?.nombreEtudiantsActifs ?? req.body?.value;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) {
    return res.status(400).json({ error: "nombreEtudiantsActifs invalide." });
  }
  db.prepare(
    `INSERT INTO indicateurs_site (cle, valeur_entier, maj_at)
     VALUES ('nombre_etudiants_actifs', @n, datetime('now'))
     ON CONFLICT(cle) DO UPDATE SET valeur_entier = excluded.valeur_entier, maj_at = excluded.maj_at`
  ).run({ n });
  res.json({ ok: true, nombreEtudiantsActifs: n });
});

app.post("/api/forms/student", async (req, res) => {
  const b = req.body || {};
  const required = [
    "prenom",
    "nom",
    "email",
    "telephone",
    "formationSouhaitee",
    "situation",
    "employeur",
    "source",
    "motivation",
  ];
  for (const k of required) {
    if (!b[k] || String(b[k]).trim() === "") {
      return res.status(400).json({ error: `Champ manquant : ${k}` });
    }
  }
  if (String(b.motivation).trim().length < 100) {
    return res.status(400).json({ error: "Motivation trop courte." });
  }

  const payload = {
    prenom: String(b.prenom).trim(),
    nom: String(b.nom).trim(),
    email: String(b.email).trim(),
    telephone: String(b.telephone).trim(),
    ville_residence: b.villeResidence ? String(b.villeResidence).trim() : null,
    formation_souhaitee: String(b.formationSouhaitee).trim(),
    ville_formation: b.villeFormation ? String(b.villeFormation).trim() : null,
    situation: String(b.situation).trim(),
    employeur_structure: String(b.employeur).trim(),
    source_connaissance: String(b.source).trim(),
    motivation: String(b.motivation).trim(),
    consentement_recontact: b.recontact === "oui" || b.recontact === true ? 1 : 0,
    consentement_politique:
      b.confidentialite === "oui" || b.confidentialite === true ? 1 : 0,
    origine: b.origine ? String(b.origine).slice(0, 80) : "site-vitrine",
  };

  let supabaseOk = false;
  let supabaseError = null;
  if (supabaseConfigured()) {
    const r = await insertStudentSupabase(payload);
    supabaseOk = r.ok;
    if (!r.ok) supabaseError = r.reason;
  }

  let sqliteOk = false;
  try {
    insertStudent.run(payload);
    sqliteOk = true;
  } catch (e) {
    console.error("[forms/student][sqlite]", e);
  }

  if (!supabaseOk && !sqliteOk) {
    return res.status(500).json({
      error: "Enregistrement impossible (Supabase + SQLite KO).",
      supabaseError,
    });
  }

  res.status(201).json({
    ok: true,
    persisted: { supabase: supabaseOk, sqlite: sqliteOk },
    supabaseError,
  });
});

app.post("/api/forms/employer", async (req, res) => {
  const b = req.body || {};
  const required = ["prenom", "nom", "email", "telephone", "formationRecherchee"];
  for (const k of required) {
    if (!b[k] || String(b[k]).trim() === "") {
      return res.status(400).json({ error: `Champ manquant : ${k}` });
    }
  }

  const payload = {
    prenom: String(b.prenom).trim(),
    nom: String(b.nom).trim(),
    email: String(b.email).trim(),
    telephone: String(b.telephone).trim(),
    formation_recherchee: String(b.formationRecherchee).trim(),
    recherche_alternants:
      b.rechercheAlternants === "oui" || b.rechercheAlternants === true ? 1 : 0,
    consentement_recontact: b.recontact === "oui" || b.recontact === true ? 1 : 0,
    consentement_politique:
      b.confidentialite === "oui" || b.confidentialite === true ? 1 : 0,
    origine: b.origine ? String(b.origine).slice(0, 80) : "site-vitrine",
  };

  let supabaseOk = false;
  let supabaseError = null;
  if (supabaseConfigured()) {
    const r = await insertEmployerSupabase(payload);
    supabaseOk = r.ok;
    if (!r.ok) supabaseError = r.reason;
  }

  let sqliteOk = false;
  try {
    insertEmployer.run(payload);
    sqliteOk = true;
  } catch (e) {
    console.error("[forms/employer][sqlite]", e);
  }

  if (!supabaseOk && !sqliteOk) {
    return res.status(500).json({
      error: "Enregistrement impossible (Supabase + SQLite KO).",
      supabaseError,
    });
  }

  res.status(201).json({
    ok: true,
    persisted: { supabase: supabaseOk, sqlite: sqliteOk },
    supabaseError,
  });
});

app.listen(PORT, () => {
  console.log(`[sporformation-forms] http://127.0.0.1:${PORT}`);
  console.log(
    `[resend] ${resendConfigured() ? "prêt (emails formulaires)" : "NON configuré — renseignez RESEND_API_KEY, EMAIL_FROM, DIRECTOR_EMAIL"}`
  );
  console.log(
    `[supabase] ${supabaseConfigured() ? "prêt (formulaires + métriques)" : "NON configuré — renseignez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY"}`
  );
});
