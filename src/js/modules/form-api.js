/**
 * API locale : enregistrement SQLite (/api/forms/*), mails Resend (/api/email/*).
 * En dev : requêtes relatives `/api` proxifiées par Vite vers le serveur Node.
 */
export function getFormsApiOrigin() {
  const explicit = String(import.meta.env.VITE_FORMS_API_URL || "").trim();
  if (explicit) {
    return explicit.replace(/\/$/, "");
  }
  if (import.meta.env.DEV) {
    return "";
  }
  return null;
}

async function postJson(path, body) {
  const origin = getFormsApiOrigin();
  if (origin === null) {
    return;
  }
  const url = `${origin}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
}

/** Payload aligné sur les champs du formulaire HTML candidat */
export function persistStudentForm(data) {
  return postJson("/api/forms/student", data);
}

/** Payload aligné sur formulaire employeur */
export function persistEmployerForm(data) {
  return postJson("/api/forms/employer", data);
}

/** Payload aligné sur formulaire inscription Prépa TEP */
export function persistPrepaTepForm(data) {
  return postJson("/api/forms/prepa-tep", data);
}

async function postEmail(path, body) {
  const origin = getFormsApiOrigin();
  if (origin === null) {
    throw new Error(
      "SERVEUR_INDISPONIBLE: Lancez npm run dev:full (API sur le port 3001) ou définissez VITE_FORMS_API_URL en production."
    );
  }
  const url = `${origin}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text || `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text);
      if (j.error) msg = j.error;
    } catch {
      /* garder msg brut */
    }
    throw new Error(msg);
  }
}

/** Envoi notification équipe via Resend (serveur lit RESEND_* depuis .env.local) */
export function sendCandidatureEmail(data) {
  return postEmail("/api/email/candidature", data);
}

export function sendEmployeurEmail(data) {
  return postEmail("/api/email/employeur", data);
}

export function sendPrepaTepEmail(data) {
  return postEmail("/api/email/prepa-tep", data);
}
