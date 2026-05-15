/**
 * Affichage colonne droite fiche formation — valeurs pilotées par le CMS.
 * Sans valeur en base : libellés « non communiquée » ; sans taux : bloc masqué.
 */

export const PH_DEADLINE = "Date non communiquée";
export const PH_SESSION = "Session non communiquée";
export const PH_DURATION = "Information non communiquée";

function formatIsoFr(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(String(iso).trim())) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** À partir des clés formation_overrides pour ce couple slug|ville. */
export function resolveDeadlineDisplay(byCle) {
  const iso = String(byCle.deadline_iso ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const human = formatIsoFr(iso);
    if (human) return human;
  }
  const leg = String(byCle.deadline ?? "").trim();
  if (leg) return leg;
  return PH_DEADLINE;
}

export function resolveSessionDisplay(byCle) {
  const iso = String(byCle.session_iso ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const human = formatIsoFr(iso);
    if (human) return human;
  }
  const leg = String(byCle.session ?? "").trim();
  if (leg) return leg;
  return PH_SESSION;
}

export function resolveDurationDisplay(byCle) {
  const v = String(byCle.duration ?? "").trim();
  if (v) return v;
  return PH_DURATION;
}

export function resolveSuccessRateTrim(byCle) {
  return String(byCle.success_rate ?? "").trim();
}

export const DEFAULT_SUCCESS_LABEL =
  "Taux d’obtention du diplôme — session en cours";
