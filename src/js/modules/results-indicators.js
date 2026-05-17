/**
 * Schéma du tableau « Indicateurs de résultats » en bas de fiche formation.
 * Stocké dans formation_overrides (cle = results_indicators) en JSON.
 */

export const RESULTS_INDICATORS_CLE = "results_indicators";

export function defaultResultsIndicators() {
  return {
    heroTitle: "Taux d'obtention du diplôme",
    heroNote: "",
    columns: ["Indicateurs", "Session précédente", "Session actuelle"],
    rows: [
      { label: "Nombre d'apprenants", cells: ["", ""] },
      { label: "Taux d'apprentis", cells: ["", ""] },
      { label: "Taux d'interruption de formation", cells: ["", ""] },
      { label: "Taux de rupture de contrat d'apprentissage", cells: ["", ""] },
    ],
    footnote: "",
  };
}

/**
 * Données affichées sur le site public uniquement si présentes en base.
 * Pas de tableau « par défaut » : vide ⇒ aucune ligne injectée (voir dynamic-content).
 */
export function parseResultsIndicatorsFromCms(raw) {
  if (raw == null || !String(raw).trim()) return null;
  try {
    const o = JSON.parse(raw);
    const cols = Array.isArray(o.columns)
      ? o.columns.map((c) => String(c ?? "").trim())
      : [];
    if (cols.length < 2) return null;
    const dataColCount = cols.length - 1;
    const rowsInput = Array.isArray(o.rows) ? o.rows : [];
    const rows = rowsInput.map((r) => ({
      label: String(r?.label ?? "").trim(),
      cells: Array.from({ length: dataColCount }, (_, i) =>
        String(r?.cells?.[i] ?? "").trim()
      ),
    }));
    return {
      heroTitle: typeof o.heroTitle === "string" ? o.heroTitle.trim() : "",
      heroNote: typeof o.heroNote === "string" ? o.heroNote.trim() : "",
      columns: cols,
      rows,
      footnote: typeof o.footnote === "string" ? o.footnote.trim() : "",
    };
  } catch {
    return null;
  }
}

function normalizeRowsForColumns(rowsInput, dataColCount, fallbackRows) {
  const src = rowsInput?.length ? rowsInput : fallbackRows;
  return src.map((r, idx) => {
    const label = String(
      r?.label ?? fallbackRows[idx]?.label ?? `Indicateur ${idx + 1}`
    ).trim();
    const cells = Array.from({ length: dataColCount }, (_, i) =>
      String(r?.cells?.[i] ?? "").trim()
    );
    return { label, cells };
  });
}

/** Parse la valeur texte JSON depuis la base ; retourne toujours un objet complet. */
export function parseResultsIndicators(raw) {
  const base = defaultResultsIndicators();
  if (!raw || !String(raw).trim()) return deepClone(base);
  try {
    const o = JSON.parse(raw);
    const cols =
      Array.isArray(o.columns) && o.columns.length >= 2
        ? o.columns.map((c) => String(c ?? "").trim())
        : base.columns.slice();
    const dataColCount = Math.max(1, cols.length - 1);
    const rows = normalizeRowsForColumns(o.rows, dataColCount, base.rows);
    return {
      heroTitle:
        typeof o.heroTitle === "string" && o.heroTitle.trim()
          ? o.heroTitle.trim()
          : base.heroTitle,
      heroNote: typeof o.heroNote === "string" ? o.heroNote.trim() : "",
      columns: cols,
      rows,
      footnote: typeof o.footnote === "string" ? o.footnote.trim() : "",
    };
  } catch {
    return deepClone(base);
  }
}

export function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Compare à defaultResultsIndicators() pour savoir si on peut supprimer l’override. */
export function isDefaultResultsIndicators(data) {
  const d = defaultResultsIndicators();
  return JSON.stringify(data) === JSON.stringify(d);
}
