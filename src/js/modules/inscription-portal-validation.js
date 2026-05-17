/**
 * Validation côté portail des champs obligatoires — alignée sur server/inscription-forms.js (isFieldFilled).
 */
/** Même ids que server/inscription-forms.js — toujours obligatoires sur l’étape 1. */
const PORTAL_IDENTITY_FIELD_IDS = new Set(["portal_ident_nom", "portal_ident_prenom", "portal_ident_email"]);

/** Indique si le champ doit être renseigné pour passer à l’étape suivante / envoyer (hors mode « seulement les champs signalés »). */
export function isPortalFieldMandatory(field) {
  if (!field || field.kind !== "field") return false;
  if (field.required === true) return true;
  return PORTAL_IDENTITY_FIELD_IDS.has(field.id);
}

export function isPortalFieldFilled(field, answers, files) {
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

/** @returns {string | null} libellé + précision, ou null si OK / pas obligatoire */
export function portalFieldMissingMessage(field, answers, files) {
  if (!field || field.kind !== "field" || !isPortalFieldMandatory(field)) return null;
  if (isPortalFieldFilled(field, answers, files)) return null;
  const label = String(field.label || "Question").trim() || "Question";
  switch (field.type) {
    case "file":
      return `« ${label} » : aucun fichier n’a été envoyé.`;
    case "multi":
      return `« ${label} » : cochez au moins une option.`;
    case "yesno":
      return `« ${label} » : choisissez Oui ou Non.`;
    case "binary":
      return `« ${label} » : sélectionnez une des deux propositions.`;
    case "single":
      return `« ${label} » : sélectionnez une option dans la liste.`;
    case "number":
      return `« ${label} » : indiquez un nombre valide.`;
    case "textarea":
      return `« ${label} » : le texte est vide.`;
    case "text":
    default:
      return `« ${label} » : la réponse est vide.`;
  }
}

/** @returns {string[]} */
export function missingRequiredMessagesForStep(step, answers, files) {
  const out = [];
  for (const b of step.blocks || []) {
    if (b.kind !== "field") continue;
    const msg = portalFieldMissingMessage(b, answers, files);
    if (msg) out.push(msg);
  }
  return out;
}

/** @returns {string[]} tout le formulaire (toutes étapes) */
export function missingRequiredMessagesAllSteps(definition, answers, files) {
  const out = [];
  const steps = definition?.steps || [];
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const prefix = steps.length > 1 ? `Étape ${i + 1} (${step.title || "sans titre"}) — ` : "";
    for (const msg of missingRequiredMessagesForStep(step, answers, files)) {
      out.push(prefix + msg);
    }
  }
  return out;
}
