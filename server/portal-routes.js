/**
 * Portail visiteurs — comptes métier (portal_accounts), hors auth.users.
 * Session cookie HttpOnly signée (PORTAL_SESSION_SECRET).
 */
import { Router } from "express";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { sendPortalVerificationEmail } from "./resend-mail.js";
import { attachInscriptionPortalRoutes } from "./inscription-forms.js";

const COOKIE_NAME = "portal_session";
const BCRYPT_ROUNDS = 12;
const OTP_TTL_MS = 25 * 60 * 1000;
const SESSION_MAX_AGE_SEC = 7 * 24 * 60 * 60;

function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 5 || v.length > 254) return false;
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v);
}

function normalizeEmail(e) {
  return String(e ?? "")
    .trim()
    .toLowerCase();
}

function clientIp(req) {
  const x = req.headers["x-forwarded-for"];
  if (typeof x === "string" && x.length) return x.split(",")[0].trim().slice(0, 64);
  return String(req.socket?.remoteAddress || "unknown").slice(0, 64);
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = decodeURIComponent(part.slice(idx + 1).trim());
    out[k] = v;
  }
  return out;
}

function makeLimiter(windowMs, max) {
  const m = new Map();
  return function limit(key) {
    const now = Date.now();
    let e = m.get(key);
    if (!e || now > e.reset) {
      e = { n: 0, reset: now + windowMs };
      m.set(key, e);
    }
    e.n++;
    return e.n <= max;
  };
}

function signSession(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string") return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.exp !== "number" || payload.exp * 1000 < Date.now()) return null;
    if (typeof payload.aid !== "string") return null;
    return payload;
  } catch {
    return null;
  }
}

function cookieSecure() {
  return process.env.NODE_ENV === "production" || process.env.PORTAL_COOKIE_SECURE === "1";
}

function setPortalCookie(res, token, maxAgeSec) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSec}`,
  ];
  if (cookieSecure()) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearPortalCookie(res) {
  const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (cookieSecure()) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function hashOtp(code, pepper) {
  return crypto.createHash("sha256").update(`${pepper}|${String(code).trim()}`).digest("hex");
}

function randomSixDigit() {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
}

function validNewPassword(p) {
  return typeof p === "string" && p.length >= 8 && p.length <= 200;
}

async function getSessionAccount(req, supabase, secret) {
  const raw = parseCookies(req.headers.cookie || "")[COOKIE_NAME];
  const sess = verifySessionToken(raw, secret);
  if (!sess) return null;
  const { data, error } = await supabase
    .from("portal_accounts")
    .select("id, email, status")
    .eq("id", sess.aid)
    .eq("status", "active")
    .limit(1);
  if (error || !data?.length) return null;
  return data[0];
}

/**
 * @param {{ supabaseAdmin: import('@supabase/supabase-js').SupabaseClient | null, portalSessionSecret: string, portalOtpPepper: string }} opts
 */
export function buildPortalRouter({ supabaseAdmin, portalSessionSecret, portalOtpPepper }) {
  const router = Router();
  const pepper = String(portalOtpPepper || "").trim() || "portal-otp-change-me";
  const secret = String(portalSessionSecret || "").trim();

  if (!supabaseAdmin || !secret) {
    const missingSupabase = !supabaseAdmin;
    const missingSecret = !secret;
    const hints = [];
    if (missingSupabase) {
      hints.push(
        "Supabase côté serveur : ajoutez SUPABASE_URL (ou VITE_SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY dans le fichier .env.local à la racine du projet (pas seulement les variables VITE_ côté navigateur)."
      );
    }
    if (missingSecret) {
      hints.push(
        "Secret de session : ajoutez PORTAL_SESSION_SECRET ou FORMS_API_SECRET (chaîne aléatoire longue) dans .env.local."
      );
    }
    hints.push("Redémarrez ensuite « npm run dev » pour recharger les variables.");
    router.use((_req, res) => {
      res.status(503).json({
        error: "Portail désactivé : configuration serveur incomplète.",
        missing: {
          supabase: missingSupabase,
          portalSessionSecret: missingSecret,
        },
        hint: hints.join(" "),
      });
    });
    return router;
  }

  const limRegisterIp = makeLimiter(60_000, 15);
  const limRegisterEmail = makeLimiter(60_000, 4);
  const limVerifyIp = makeLimiter(60_000, 40);
  const limVerifyEmail = makeLimiter(60_000, 15);
  const limLoginIp = makeLimiter(60_000, 25);
  const limLoginEmail = makeLimiter(60_000, 10);
  const limResendIp = makeLimiter(60_000, 10);
  const limResendEmail = makeLimiter(60_000, 3);

  router.get("/me", async (req, res) => {
    try {
      const row = await getSessionAccount(req, supabaseAdmin, secret);
      if (!row) return res.status(401).json({ error: "Non connecté." });
      res.json({ ok: true, email: row.email });
    } catch (e) {
      console.error("[portal] me", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post("/logout", (_req, res) => {
    clearPortalCookie(res);
    res.json({ ok: true });
  });

  router.post("/register", async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!limRegisterIp(`rip:${ip}`)) {
        return res.status(429).json({ error: "Trop de tentatives depuis cette adresse. Réessayez dans une minute." });
      }
      const email = normalizeEmail(req.body?.email);
      const pw = req.body?.password;
      const pw2 = req.body?.passwordConfirm ?? req.body?.password_confirmation;
      if (!email || !isValidEmail(email)) return res.status(400).json({ error: "E-mail invalide." });
      if (!validNewPassword(pw)) {
        return res.status(400).json({ error: "Le mot de passe doit contenir au moins 8 caractères." });
      }
      if (pw !== pw2) return res.status(400).json({ error: "Les mots de passe ne correspondent pas." });
      if (!limRegisterEmail(`rem:${email}`)) {
        return res.status(429).json({ error: "Trop de demandes pour cet e-mail. Réessayez dans une minute." });
      }

      const password_hash = await bcrypt.hash(pw, BCRYPT_ROUNDS);

      const { data: existingRows, error: exErr } = await supabaseAdmin
        .from("portal_accounts")
        .select("id, status")
        .eq("email", email)
        .limit(1);
      if (exErr) return res.status(500).json({ error: exErr.message });
      const existing = existingRows?.[0];

      if (existing?.status === "active") {
        return res.status(409).json({ error: "Un compte actif existe déjà avec cet e-mail." });
      }

      let accountId = existing?.id;
      const nowIso = new Date().toISOString();

      if (!existing) {
        const { data: ins, error: insErr } = await supabaseAdmin
          .from("portal_accounts")
          .insert({ email, password_hash, status: "pending_verification" })
          .select("id")
          .limit(1);
        if (insErr) return res.status(500).json({ error: insErr.message });
        accountId = ins?.[0]?.id;
      } else {
        const { error: upErr } = await supabaseAdmin
          .from("portal_accounts")
          .update({ password_hash, updated_at: nowIso })
          .eq("id", existing.id);
        if (upErr) return res.status(500).json({ error: upErr.message });
        await supabaseAdmin.from("portal_email_verifications").delete().eq("portal_account_id", existing.id);
        accountId = existing.id;
      }

      const code = randomSixDigit();
      const code_hash = hashOtp(code, pepper);
      const expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();
      const { error: vErr } = await supabaseAdmin.from("portal_email_verifications").insert({
        portal_account_id: accountId,
        email,
        code_hash,
        expires_at,
      });
      if (vErr) return res.status(500).json({ error: vErr.message });

      try {
        await sendPortalVerificationEmail(email, code);
      } catch (e) {
        console.error("[portal] envoi e-mail OTP:", e);
        return res.status(503).json({
          error: "Impossible d’envoyer l’e-mail de confirmation. Réessayez plus tard ou contactez le support.",
        });
      }

      res.json({ ok: true, email });
    } catch (e) {
      console.error("[portal] register", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post("/verify", async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!limVerifyIp(`vip:${ip}`)) {
        return res.status(429).json({ error: "Trop de tentatives. Réessayez dans une minute." });
      }
      const email = normalizeEmail(req.body?.email);
      const code = String(req.body?.code ?? "")
        .replace(/\D/g, "")
        .slice(0, 6);
      if (!email || !isValidEmail(email)) return res.status(400).json({ error: "E-mail invalide." });
      if (code.length !== 6) return res.status(400).json({ error: "Saisissez le code à 6 chiffres." });
      if (!limVerifyEmail(`vem:${email}`)) {
        return res.status(429).json({ error: "Trop de tentatives pour cet e-mail." });
      }

      const { data: accRows, error: accErr } = await supabaseAdmin
        .from("portal_accounts")
        .select("id, status")
        .eq("email", email)
        .limit(1);
      if (accErr) return res.status(500).json({ error: accErr.message });
      const acc = accRows?.[0];
      if (!acc) return res.status(404).json({ error: "Aucune inscription en cours pour cet e-mail." });
      if (acc.status !== "pending_verification") {
        return res.status(400).json({ error: "Ce compte est déjà confirmé. Utilisez la connexion." });
      }

      const { data: verRows, error: verErr } = await supabaseAdmin
        .from("portal_email_verifications")
        .select("id, code_hash")
        .eq("portal_account_id", acc.id)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString());
      if (verErr) return res.status(500).json({ error: verErr.message });

      const tryHash = hashOtp(code, pepper);
      let matched = false;
      for (const row of verRows || []) {
        const a = Buffer.from(row.code_hash, "hex");
        const b = Buffer.from(tryHash, "hex");
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
          matched = true;
          break;
        }
      }
      if (!matched) return res.status(400).json({ error: "Code incorrect ou expiré." });

      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("portal_email_verifications")
        .update({ consumed_at: nowIso })
        .eq("portal_account_id", acc.id)
        .is("consumed_at", null);

      const { error: actErr } = await supabaseAdmin
        .from("portal_accounts")
        .update({ status: "active", email_verified_at: nowIso, updated_at: nowIso })
        .eq("id", acc.id);
      if (actErr) return res.status(500).json({ error: actErr.message });

      const token = signSession(
        { aid: acc.id, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC },
        secret
      );
      setPortalCookie(res, token, SESSION_MAX_AGE_SEC);
      res.json({ ok: true });
    } catch (e) {
      console.error("[portal] verify", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post("/resend", async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!limResendIp(`srp:${ip}`)) {
        return res.status(429).json({ error: "Trop de demandes. Réessayez dans une minute." });
      }
      const email = normalizeEmail(req.body?.email);
      if (!email || !isValidEmail(email)) return res.status(400).json({ error: "E-mail invalide." });
      if (!limResendEmail(`sre:${email}`)) {
        return res.status(429).json({ error: "Trop de renvois pour cet e-mail." });
      }

      const { data: accRows, error: accErr } = await supabaseAdmin
        .from("portal_accounts")
        .select("id, status")
        .eq("email", email)
        .limit(1);
      if (accErr) return res.status(500).json({ error: accErr.message });
      const acc = accRows?.[0];
      if (!acc) return res.status(404).json({ error: "Aucun compte trouvé." });
      if (acc.status !== "pending_verification") {
        return res.status(400).json({ error: "Ce compte est déjà vérifié." });
      }

      await supabaseAdmin.from("portal_email_verifications").delete().eq("portal_account_id", acc.id);
      const code = randomSixDigit();
      const code_hash = hashOtp(code, pepper);
      const expires_at = new Date(Date.now() + OTP_TTL_MS).toISOString();
      const { error: vErr } = await supabaseAdmin.from("portal_email_verifications").insert({
        portal_account_id: acc.id,
        email,
        code_hash,
        expires_at,
      });
      if (vErr) return res.status(500).json({ error: vErr.message });

      try {
        await sendPortalVerificationEmail(email, code);
      } catch (e) {
        console.error("[portal] resend e-mail:", e);
        return res.status(503).json({ error: "Impossible d’envoyer l’e-mail." });
      }
      res.json({ ok: true });
    } catch (e) {
      console.error("[portal] resend", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post("/login", async (req, res) => {
    try {
      const ip = clientIp(req);
      if (!limLoginIp(`lip:${ip}`)) {
        return res.status(429).json({ error: "Trop de tentatives. Réessayez dans une minute." });
      }
      const email = normalizeEmail(req.body?.email);
      const pw = req.body?.password;
      if (!email || !isValidEmail(email) || typeof pw !== "string" || pw.length < 1 || pw.length > 200) {
        return res.status(400).json({ error: "E-mail ou mot de passe incorrect." });
      }
      if (!limLoginEmail(`lem:${email}`)) {
        return res.status(429).json({ error: "Trop de tentatives pour ce compte." });
      }

      const { data: rows, error } = await supabaseAdmin
        .from("portal_accounts")
        .select("id, password_hash, status")
        .eq("email", email)
        .limit(1);
      if (error) return res.status(500).json({ error: error.message });
      const row = rows?.[0];
      if (!row) return res.status(401).json({ error: "E-mail ou mot de passe incorrect." });
      if (row.status !== "active") {
        return res.status(403).json({
          error: "Compte non confirmé. Validez le code envoyé par e-mail avant de vous connecter.",
        });
      }

      const ok = await bcrypt.compare(pw, row.password_hash);
      if (!ok) return res.status(401).json({ error: "E-mail ou mot de passe incorrect." });

      const token = signSession(
        { aid: row.id, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC },
        secret
      );
      setPortalCookie(res, token, SESSION_MAX_AGE_SEC);
      res.json({ ok: true });
    } catch (e) {
      console.error("[portal] login", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  router.post("/password", async (req, res) => {
    try {
      const row = await getSessionAccount(req, supabaseAdmin, secret);
      if (!row) return res.status(401).json({ error: "Session expirée. Reconnectez-vous." });

      const cur = req.body?.currentPassword;
      const nw = req.body?.newPassword;
      const nw2 = req.body?.newPasswordConfirm ?? req.body?.new_password_confirm;
      if (!validNewPassword(nw) || nw !== nw2) {
        return res.status(400).json({
          error: "Le nouveau mot de passe doit contenir au moins 8 caractères et correspondre à la confirmation.",
        });
      }

      const { data: full, error } = await supabaseAdmin
        .from("portal_accounts")
        .select("password_hash")
        .eq("id", row.id)
        .limit(1);
      if (error || !full?.length) return res.status(500).json({ error: "Erreur serveur." });
      const match = await bcrypt.compare(String(cur ?? ""), full[0].password_hash);
      if (!match) return res.status(400).json({ error: "Mot de passe actuel incorrect." });

      const password_hash = await bcrypt.hash(nw, BCRYPT_ROUNDS);
      const { error: uErr } = await supabaseAdmin
        .from("portal_accounts")
        .update({ password_hash, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (uErr) return res.status(500).json({ error: uErr.message });
      res.json({ ok: true });
    } catch (e) {
      console.error("[portal] password", e);
      res.status(500).json({ error: "Erreur serveur." });
    }
  });

  attachInscriptionPortalRoutes(router, {
    supabaseAdmin,
    getPortalAccount: (req) => getSessionAccount(req, supabaseAdmin, secret),
  });

  return router;
}
