/**
 * Envoi via Resend (clés dans .env.local : RESEND_API_KEY, EMAIL_FROM, DIRECTOR_EMAIL).
 * Templates HTML responsives, inline-styled (compatibles Gmail / Outlook / Apple Mail).
 */

const BRAND = {
  primary: "#1A1A2E",
  primarySoft: "#111524",
  accent: "#E63946",
  accentDark: "#C92C39",
  white: "#FFFFFF",
  surface: "#F8F9FA",
  surfaceStrong: "#EEF1F5",
  text: "#2D2D2D",
  textMuted: "#6B7280",
  textSoft: "#9CA3AF",
  border: "#E5E7EB",
  success: "#198754",
};

function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function resolveRecipients() {
  const raw =
    process.env.DIRECTOR_EMAIL ||
    process.env.RESEND_TO_EMAIL ||
    process.env.MAIL_TO ||
    "";
  return raw
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resendConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
      (process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM?.trim()) &&
      resolveRecipients().length
  );
}

/* ─────────────────────── Templates ─────────────────────── */

/**
 * Wrapper commun : header sombre + corps clair + footer.
 * @param {{ accentLabel: string, title: string, subtitle: string, contentHtml: string, ctaPhone?: string }} opts
 */
function renderEmailShell(opts) {
  const { accentLabel, title, subtitle, contentHtml, ctaPhone } = opts;
  const safeAccent = escapeHtml(accentLabel);
  const safeTitle = escapeHtml(title);
  const safeSubtitle = escapeHtml(subtitle);
  const phoneBlock = ctaPhone
    ? `
        <tr>
          <td style="padding: 0 32px 24px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.accent};border-radius:12px;">
              <tr>
                <td align="center" style="padding:18px 20px;">
                  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.8);margin-bottom:6px;">À rappeler en priorité</div>
                  <a href="tel:${escapeHtml(String(ctaPhone).replace(/\s/g, ""))}" style="font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;color:${BRAND.white};text-decoration:none;letter-spacing:0.5px;">
                    ${escapeHtml(ctaPhone)}
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${safeTitle}</title>
<!--[if mso]>
<style type="text/css">body, table, td { font-family: Arial, Helvetica, sans-serif !important; }</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.surfaceStrong};font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:${BRAND.text};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safeTitle} — ${safeSubtitle}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.surfaceStrong};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width:600px;width:100%;background:${BRAND.white};border-radius:16px;overflow:hidden;box-shadow:0 12px 32px rgba(17,24,39,0.08);">
          <!-- Header -->
          <tr>
            <td style="background:${BRAND.primary};padding:32px 32px 28px 32px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="vertical-align:middle;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background:${BRAND.accent};color:${BRAND.white};font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:18px;width:44px;height:44px;text-align:center;border-radius:10px;line-height:44px;">
                          SF
                        </td>
                        <td style="padding-left:14px;font-family:Arial,Helvetica,sans-serif;color:${BRAND.white};">
                          <div style="font-size:16px;font-weight:700;letter-spacing:0.3px;">SporFormation</div>
                          <div style="font-size:12px;color:rgba(255,255,255,0.65);letter-spacing:0.4px;">CFA Sport &amp; Animation</div>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <span style="display:inline-block;background:rgba(230,57,70,0.18);color:${BRAND.white};font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;padding:6px 12px;border-radius:999px;border:1px solid rgba(230,57,70,0.45);">
                      ${safeAccent}
                    </span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Title -->
          <tr>
            <td style="padding:32px 32px 8px 32px;">
              <h1 style="margin:0;font-family:'Segoe UI',Arial,Helvetica,sans-serif;font-size:26px;line-height:1.25;color:${BRAND.primary};font-weight:700;">
                ${safeTitle}
              </h1>
              <p style="margin:10px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:${BRAND.textMuted};">
                ${safeSubtitle}
              </p>
            </td>
          </tr>

          ${phoneBlock}

          <!-- Content -->
          <tr>
            <td style="padding:8px 32px 32px 32px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:${BRAND.surface};padding:24px 32px;border-top:1px solid ${BRAND.border};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.textMuted};line-height:1.6;">
                    <strong style="color:${BRAND.primary};">SporFormation — CFA</strong><br>
                    Notification automatique du site vitrine.<br>
                    <span style="color:${BRAND.textSoft};">Cet email a été déclenché par une soumission de formulaire en ligne.</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <p style="margin:16px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${BRAND.textSoft};">
          © ${new Date().getFullYear()} SporFormation. Tous droits réservés.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Rangée label / valeur (table-based pour compat Outlook) */
function infoRow(label, value, opts = {}) {
  const isLast = opts.last === true;
  const borderBottom = isLast ? "none" : `1px solid ${BRAND.border}`;
  return `
    <tr>
      <td style="padding:14px 0;border-bottom:${borderBottom};vertical-align:top;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.textSoft};margin-bottom:4px;">
          ${escapeHtml(label)}
        </div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;color:${BRAND.text};line-height:1.5;font-weight:500;">
          ${value}
        </div>
      </td>
    </tr>`;
}

function linkValue(href, text) {
  return `<a href="${escapeHtml(href)}" style="color:${BRAND.accentDark};text-decoration:none;border-bottom:1px solid ${BRAND.accentDark};">${escapeHtml(text)}</a>`;
}

/* ─────────────────────── Templates métier ─────────────────────── */

export function buildCandidatureText(data) {
  return [
    "═══════════════════════════════",
    "NOUVELLE DEMANDE DE CONTACT — SPORFORMATION",
    "═══════════════════════════════",
    `Prénom : ${data.prenom}`,
    `Nom : ${data.nom}`,
    `Téléphone : ${data.telephone} ← À rappeler en priorité`,
    `Email : ${data.email}`,
    `Ville : ${data.villeResidence || "Non renseignée"}`,
    "",
    `Formation évoquée : ${data.formationSouhaitee}`,
    `Ville de formation : ${data.villeFormation || "Non renseignée"}`,
    "",
    `Situation : ${data.situation}`,
    `Employeur / structure : ${data.employeur}`,
    `Source : ${data.source}`,
    "",
    "Message / questions :",
    data.motivation,
    "═══════════════════════════════",
  ].join("\n");
}

export function buildCandidatureHtml(data) {
  const t = (x) => escapeHtml(x ?? "");
  const phoneClean = String(data.telephone || "").replace(/\s/g, "");

  const motivation = t(data.motivation).replace(/\n/g, "<br>");

  const content = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
      ${infoRow(
        "Demandeur",
        `<strong style="color:${BRAND.primary};font-size:17px;">${t(data.prenom)} ${t(data.nom)}</strong>`
      )}
      ${infoRow(
        "Téléphone",
        `<a href="tel:${escapeHtml(phoneClean)}" style="color:${BRAND.text};text-decoration:none;font-weight:600;">${t(data.telephone)}</a>`
      )}
      ${infoRow("Email", linkValue(`mailto:${data.email}`, data.email))}
      ${infoRow("Ville de résidence", t(data.villeResidence || "Non renseignée"))}
      ${infoRow(
        "Formation évoquée",
        `<span style="display:inline-block;background:${BRAND.surface};color:${BRAND.primary};font-weight:600;padding:4px 10px;border-radius:6px;border:1px solid ${BRAND.border};">${t(data.formationSouhaitee)}</span>`
      )}
      ${infoRow("Ville de formation", t(data.villeFormation || "Non renseignée"))}
      ${infoRow("Situation actuelle", t(data.situation))}
      ${infoRow("Employeur / structure", t(data.employeur))}
      ${infoRow("Source de connaissance", t(data.source), { last: true })}
    </table>

    <div style="margin-top:28px;padding:20px 22px;background:${BRAND.surface};border-left:4px solid ${BRAND.accent};border-radius:0 12px 12px 0;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${BRAND.accent};margin-bottom:10px;">
        Message et questions
      </div>
      <div style="font-family:'Segoe UI',Georgia,serif;font-size:15px;line-height:1.7;color:${BRAND.text};font-style:italic;">
        “${motivation}”
      </div>
    </div>

    <div style="margin-top:28px;text-align:center;">
      <a href="tel:${escapeHtml(phoneClean)}" style="display:inline-block;background:${BRAND.primary};color:${BRAND.white};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.4px;padding:14px 28px;border-radius:10px;text-decoration:none;">
        Rappeler ${t(data.prenom)} →
      </a>
    </div>
  `;

  return renderEmailShell({
    accentLabel: "Demande de contact",
    title: `Nouvelle demande de contact`,
    subtitle: `${data.prenom} ${data.nom} vous écrit au sujet de « ${data.formationSouhaitee} ». À recontacter sous 24 h.`,
    contentHtml: content,
    ctaPhone: data.telephone,
  });
}

export function buildEmployerText(data) {
  return [
    "═══════════════════════════════",
    "DEMANDE EMPLOYEUR — RECHERCHE D'ALTERNANTS",
    "═══════════════════════════════",
    `Prénom : ${data.prenom}`,
    `Nom : ${data.nom}`,
    `Téléphone : ${data.telephone}`,
    `Email : ${data.email}`,
    "",
    `Formation concernée : ${data.formationRecherchee}`,
    `Recherche d'alternants : ${data.rechercheAlternants === "oui" ? "Oui" : "non"}`,
    "═══════════════════════════════",
  ].join("\n");
}

export function buildEmployerHtml(data) {
  const t = (x) => escapeHtml(x ?? "");
  const phoneClean = String(data.telephone || "").replace(/\s/g, "");
  const cherche = data.rechercheAlternants === "oui" || data.rechercheAlternants === true;

  const content = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
      ${infoRow(
        "Contact employeur",
        `<strong style="color:${BRAND.primary};font-size:17px;">${t(data.prenom)} ${t(data.nom)}</strong>`
      )}
      ${infoRow(
        "Téléphone",
        `<a href="tel:${escapeHtml(phoneClean)}" style="color:${BRAND.text};text-decoration:none;font-weight:600;">${t(data.telephone)}</a>`
      )}
      ${infoRow("Email", linkValue(`mailto:${data.email}`, data.email))}
      ${infoRow(
        "Formation concernée",
        `<span style="display:inline-block;background:${BRAND.surface};color:${BRAND.primary};font-weight:600;padding:4px 10px;border-radius:6px;border:1px solid ${BRAND.border};">${t(data.formationRecherchee)}</span>`
      )}
      ${infoRow(
        "Recherche d'alternants",
        cherche
          ? `<span style="color:${BRAND.success};font-weight:700;">✓ Oui, recherche active</span>`
          : `<span style="color:${BRAND.textMuted};">Non</span>`,
        { last: true }
      )}
    </table>

    <div style="margin-top:28px;padding:18px 22px;background:${BRAND.surface};border-radius:12px;border:1px solid ${BRAND.border};">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">
        <strong style="color:${BRAND.primary};">Action recommandée :</strong>
        recontacter sous 24 h pour qualifier le besoin et proposer des profils d'apprentis alignés avec la formation
        <em>« ${t(data.formationRecherchee)} »</em>.
      </div>
    </div>

    <div style="margin-top:28px;text-align:center;">
      <a href="tel:${escapeHtml(phoneClean)}" style="display:inline-block;background:${BRAND.primary};color:${BRAND.white};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.4px;padding:14px 28px;border-radius:10px;text-decoration:none;">
        Rappeler ${t(data.prenom)} →
      </a>
    </div>
  `;

  return renderEmailShell({
    accentLabel: "Demande employeur",
    title: "Nouvelle demande employeur",
    subtitle: `${data.prenom} ${data.nom} recherche des alternants pour « ${data.formationRecherchee} ».`,
    contentHtml: content,
    ctaPhone: data.telephone,
  });
}

/* ─────────────────────── Envoi Resend ─────────────────────── */

/** Validation d'email volontairement permissive (la stricte est faite par Resend lui-même). */
function isValidEmail(value) {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (v.length < 5 || v.length > 254) return false;
  return /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(v);
}

async function sendResendEmail({ to, subject, html, text, replyTo }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || process.env.RESEND_FROM?.trim() || "";

  if (!apiKey || !from) {
    throw new Error("RESEND_API_KEY ou EMAIL_FROM manquant.");
  }

  const recipients = Array.isArray(to) ? to : [to];
  if (!recipients.length) {
    throw new Error("Aucun destinataire (DIRECTOR_EMAIL).");
  }

  const payload = {
    from,
    to: recipients,
    subject,
    html,
  };
  if (text) payload.text = text;

  if (replyTo && isValidEmail(replyTo)) {
    payload.reply_to = String(replyTo).trim();
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(errText || `Resend HTTP ${res.status}`);
  }

  return res.json();
}

/** Code à 6 chiffres — confirmation compte portail vitrine (destinataire = l’internaute). */
export async function sendPortalVerificationEmail(toEmail, code) {
  const safeCode = escapeHtml(code);
  const content = `
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.text};">
      Utilisez ce code sur la page <strong>Confirmer l’e-mail</strong> du site SporFormation. Il expire dans environ <strong>25 minutes</strong>.
    </p>
    <div style="margin:28px 0;text-align:center;font-family:'Courier New',Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${BRAND.primary};">
      ${safeCode}
    </div>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${BRAND.textMuted};">
      Si vous n’avez pas demandé ce message, ignorez-le.
    </p>
  `;
  await sendResendEmail({
    to: [String(toEmail).trim()],
    subject: `${code} — Confirmez votre compte SporFormation`,
    html: renderEmailShell({
      accentLabel: "Portail",
      title: "Votre code de confirmation",
      subtitle: "Saisissez ces six chiffres sur le site pour activer votre espace.",
      contentHtml: content,
    }),
    text: `Code SporFormation : ${code}\n\nCe code expire dans environ 25 minutes.`,
  });
}

export async function notifyCandidature(data) {
  const to = resolveRecipients();
  const subject = `Contact — ${data.prenom} ${data.nom} — ${data.formationSouhaitee}`;
  await sendResendEmail({
    to,
    subject,
    html: buildCandidatureHtml(data),
    text: buildCandidatureText(data),
    replyTo: data.email,
  });
}

export async function notifyEmployeur(data) {
  const to = resolveRecipients();
  const subject = `Employeur — ${data.prenom} ${data.nom} — ${data.formationRecherchee}`;
  await sendResendEmail({
    to,
    subject,
    html: buildEmployerHtml(data),
    text: buildEmployerText(data),
    replyTo: data.email,
  });
}

/* ─────────────────────── Réservation Prépa TEP ─────────────────────── */

function formatList(values) {
  if (!values) return "Non renseigné";
  const arr = Array.isArray(values) ? values : [values];
  const cleaned = arr.map((v) => String(v).trim()).filter(Boolean);
  if (!cleaned.length) return "Non renseigné";
  return cleaned.join(", ");
}

function formatDateFr(value) {
  if (!value) return "Non renseignée";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function buildPrepaTepText(data) {
  const echecs = Array.isArray(data.echecsTep)
    ? data.echecsTep.join(" / ")
    : data.echecsTep || "—";
  const dispos = Array.isArray(data.disponibilites)
    ? data.disponibilites.join(" / ")
    : data.disponibilites || "—";
  return [
    "═══════════════════════════════",
    "NOUVELLE RÉSERVATION DE DIAGNOSTIC — PRÉPA TEP",
    "═══════════════════════════════",
    `Prénom : ${data.prenom}`,
    `Nom : ${data.nom}`,
    `Date de naissance : ${formatDateFr(data.dateNaissance)}`,
    `Téléphone : ${data.telephone} ← À rappeler en priorité`,
    `Email : ${data.email}`,
    `Lieu de résidence : ${data.lieuResidence}`,
    "",
    `Pratique sportive régulière : ${data.pratiqueSport || "—"}`,
    data.pratiqueSport === "Oui"
      ? `Détails pratique : ${data.pratiqueSportDetail || "Non précisé"}`
      : null,
    "",
    `Formation visée : ${data.formationVisee}`,
    `Structure d'alternance : ${data.structureAlternance}`,
    `Déjà passé les TEP : ${data.dejaPasseTep}`,
    data.dejaPasseTep === "Oui" ? `Échecs antérieurs : ${echecs}` : null,
    `Disponibilités : ${dispos}`,
    "═══════════════════════════════",
  ]
    .filter(Boolean)
    .join("\n");
}

function bulletList(values) {
  const arr = Array.isArray(values) ? values : [];
  if (!arr.length) {
    return `<span style="color:${BRAND.textMuted};">Aucun élément sélectionné</span>`;
  }
  return `<ul style="margin:6px 0 0 0;padding-left:18px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.text};">${arr
    .map((v) => `<li>${escapeHtml(v)}</li>`)
    .join("")}</ul>`;
}

export function buildPrepaTepHtml(data) {
  const t = (x) => escapeHtml(x ?? "");
  const phoneClean = String(data.telephone || "").replace(/\s/g, "");
  const pratiqueOui = data.pratiqueSport === "Oui";
  const dejaTep = data.dejaPasseTep === "Oui";
  const detailSport = (data.pratiqueSportDetail || "").trim();

  const content = `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:8px;">
      ${infoRow(
        "Candidat Prépa TEP",
        `<strong style="color:${BRAND.primary};font-size:17px;">${t(data.prenom)} ${t(data.nom)}</strong>`
      )}
      ${infoRow("Date de naissance", t(formatDateFr(data.dateNaissance)))}
      ${infoRow(
        "Téléphone",
        `<a href="tel:${escapeHtml(phoneClean)}" style="color:${BRAND.text};text-decoration:none;font-weight:600;">${t(data.telephone)}</a>`
      )}
      ${infoRow("Email", linkValue(`mailto:${data.email}`, data.email))}
      ${infoRow("Lieu de résidence", t(data.lieuResidence))}
      ${infoRow(
        "Formation visée",
        `<span style="display:inline-block;background:${BRAND.surface};color:${BRAND.primary};font-weight:600;padding:4px 10px;border-radius:6px;border:1px solid ${BRAND.border};">${t(data.formationVisee)}</span>`
      )}
      ${infoRow(
        "Pratique sportive régulière",
        pratiqueOui
          ? `<span style="color:${BRAND.success};font-weight:700;">✓ Oui</span>${
              detailSport
                ? `<div style="margin-top:6px;font-weight:400;color:${BRAND.text};font-style:italic;">“${t(detailSport)}”</div>`
                : ""
            }`
          : `<span style="color:${BRAND.textMuted};">${t(data.pratiqueSport)}</span>`
      )}
      ${infoRow(
        "Structure d'alternance",
        data.structureAlternance === "Oui"
          ? `<span style="color:${BRAND.success};font-weight:700;">✓ Oui, déjà identifiée</span>`
          : `<span style="color:${BRAND.textMuted};">Non — accompagnement souhaité</span>`
      )}
      ${infoRow(
        "Déjà passé les TEP",
        dejaTep
          ? `<span style="color:${BRAND.accent};font-weight:700;">Oui</span>${bulletList(data.echecsTep)}`
          : `<span style="color:${BRAND.textMuted};">Non</span>`
      )}
      ${infoRow("Disponibilités", bulletList(data.disponibilites), { last: true })}
    </table>

    <div style="margin-top:28px;padding:18px 22px;background:${BRAND.surface};border-radius:12px;border:1px solid ${BRAND.border};">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.6;color:${BRAND.textMuted};">
        <strong style="color:${BRAND.primary};">Action recommandée :</strong>
        recontacter sous 24 h pour caler le diagnostic, valider le créneau de préparation et confirmer la place réservée pour la formation
        <em>« ${t(data.formationVisee)} »</em>.
      </div>
    </div>

    <div style="margin-top:28px;text-align:center;">
      <a href="tel:${escapeHtml(phoneClean)}" style="display:inline-block;background:${BRAND.primary};color:${BRAND.white};font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;letter-spacing:0.4px;padding:14px 28px;border-radius:10px;text-decoration:none;">
        Rappeler ${t(data.prenom)} →
      </a>
    </div>
  `;

  return renderEmailShell({
    accentLabel: "Réservation diagnostic",
    title: "Nouvelle réservation de diagnostic",
    subtitle: `${data.prenom} ${data.nom} demande une Prépa TEP pour « ${data.formationVisee} ». À recontacter sous 24 h.`,
    contentHtml: content,
    ctaPhone: data.telephone,
  });
}

export async function notifyPrepaTep(data) {
  const to = resolveRecipients();
  const subject = `Prépa TEP — ${data.prenom} ${data.nom} — ${data.formationVisee}`;
  await sendResendEmail({
    to,
    subject,
    html: buildPrepaTepHtml(data),
    text: buildPrepaTepText(data),
    replyTo: data.email,
  });
}
