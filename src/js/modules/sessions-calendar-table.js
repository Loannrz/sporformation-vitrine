/**
 * Table « Calendrier des sessions » sur formations.html.
 * Une ligne par couple slug|ville défini dans FORMATION_META ; dates et statuts viennent
 * uniquement des overrides admin (session_iso, deadline_iso, etc.), pas du fichier JS statique.
 */

import {
  FORMATION_META,
  FORMATION_SHORT_LABELS,
  FORMATION_LABELS,
} from "./formation-city-detail.js";
import {
  resolveSessionDisplay,
  PH_SESSION,
} from "./formation-sidebar-display.js";

const CLOSING_SOON_DAYS = 14;

/** Parse une date du type « 19 septembre 2026 » (insensible aux accents). */
function parseFrenchDeadline(input) {
  const raw = String(input ?? "").trim();
  if (!raw || /à\s+communiquer/i.test(raw)) return null;

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  const months = {
    janvier: 0,
    fevrier: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    aout: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    decembre: 11,
  };

  const m = normalized.match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const monthKey = m[2];
  const year = Number(m[3]);
  const month = months[monthKey];
  if (month === undefined || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  const d = new Date(year, month, day);
  if (d.getMonth() !== month || d.getDate() !== day) return null;
  return d;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function todayIso() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function parseIsoLocal(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function enrollmentOpenStates(deadlineDateStartOfDay, now = new Date()) {
  const today = startOfDay(now);
  if (deadlineDateStartOfDay < today) {
    return {
      label: "Fermé",
      badgeClass: "session-status--closed",
      canApply: false,
    };
  }
  const daysLeft = Math.round((deadlineDateStartOfDay - today) / 86400000);
  if (daysLeft <= CLOSING_SOON_DAYS) {
    return {
      label: "Ferme bientôt",
      badgeClass: "session-status--soon",
      canApply: true,
    };
  }
  return {
    label: "Ouvert",
    badgeClass: "session-status--open",
    canApply: true,
  };
}

/** Statut inscriptions : données CMS uniquement (deadline_iso ou deadline libellé admin). */
export function enrollmentFromByCle(byCle, now = new Date()) {
  const hiddenIntent = (() => {
    const v = String(byCle.inscription_visible ?? "").trim().toLowerCase();
    return (
      v === "0" ||
      v === "false" ||
      v === "off" ||
      v === "non" ||
      v === "no"
    );
  })();
  if (hiddenIntent) {
    return {
      label: "Fermé",
      badgeClass: "session-status--closed",
      canApply: false,
    };
  }

  const iso = String(byCle.deadline_iso ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    if (iso < todayIso()) {
      return {
        label: "Fermé",
        badgeClass: "session-status--closed",
        canApply: false,
      };
    }
    const dead = startOfDay(parseIsoLocal(iso));
    return enrollmentOpenStates(dead, now);
  }

  const deadline = parseFrenchDeadline(byCle.deadline ?? "");
  if (deadline === null) {
    return {
      label: "À préciser",
      badgeClass: "session-status--soon",
      canApply: true,
    };
  }

  return enrollmentOpenStates(startOfDay(deadline), now);
}

/**
 * Overrides formation × ville depuis Supabase uniquement (pas de repli sur FORMATION_META).
 */
function overridesByCle(slug, ville, overridesList) {
  const byCle = {};
  for (const it of overridesList || []) {
    if (it.slug === slug && it.ville === ville) {
      byCle[it.cle] = it.valeur;
    }
  }
  return byCle;
}

/** Date de début : session_iso ou champ libellé session saisi en admin uniquement. */
function formatStartDateCell(byCle) {
  const s = resolveSessionDisplay(byCle);
  if (!s || s === PH_SESSION) return "—";
  return s;
}

function formationLabel(slug) {
  return FORMATION_SHORT_LABELS[slug] ?? FORMATION_LABELS[slug] ?? slug;
}

function renderSessionsTable(formationOverrides) {
  const root = document.querySelector("[data-session-table]");
  const tbody = root?.querySelector("[data-session-table-body]");
  if (!root || !tbody) return;

  const overridesList = formationOverrides || [];

  const rows = Object.entries(FORMATION_META).map(([key]) => {
    const pipe = key.indexOf("|");
    const slug = pipe >= 0 ? key.slice(0, pipe) : key;
    const ville = pipe >= 0 ? key.slice(pipe + 1) : "";
    const byCle = overridesByCle(slug, ville, overridesList);
    return {
      slug,
      ville,
      label: formationLabel(slug),
      sessionDisplay: formatStartDateCell(byCle),
      enrollment: enrollmentFromByCle(byCle),
    };
  });

  rows.sort((a, b) => {
    const c = a.label.localeCompare(b.label, "fr");
    if (c !== 0) return c;
    return a.ville.localeCompare(b.ville, "fr");
  });

  tbody.replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement("tr");

      const tdForm = document.createElement("td");
      tdForm.textContent = r.label;

      const tdVille = document.createElement("td");
      tdVille.textContent = r.ville;

      const tdDate = document.createElement("td");
      tdDate.textContent = r.sessionDisplay;

      const tdStat = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = `session-status ${r.enrollment.badgeClass}`;
      badge.textContent = r.enrollment.label;
      tdStat.appendChild(badge);

      const tdAct = document.createElement("td");
      if (r.enrollment.canApply) {
        const a = document.createElement("a");
        a.className = "btn btn--outline session-table__btn";
        a.href = "/contact.html";
        a.textContent = "Postuler";
        tdAct.appendChild(a);
      } else {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn--outline session-table__btn session-table__btn--inactive";
        btn.disabled = true;
        btn.textContent = "Postuler";
        tdAct.appendChild(btn);
      }

      tr.append(tdForm, tdVille, tdDate, tdStat, tdAct);
      return tr;
    }),
  );
}

/** Rendu initial avant réponse API : lignes présentes, dates/statuts vides jusqu’au CMS. */
export function initSessionsCalendarTable() {
  renderSessionsTable([]);
}

/** Après chargement `/api/public/site-content` — applique session_iso / deadline_iso etc. */
export function refreshSessionsCalendarTable(formationOverrides) {
  renderSessionsTable(formationOverrides);
}
