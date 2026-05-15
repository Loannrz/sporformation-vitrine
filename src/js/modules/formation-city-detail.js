/** Modale « choix de ville » sur formations.html + page squelette formation-detail.html */

const PARAM_FORMATION = "f";
const PARAM_VILLE = "v";

/** Libellés courts pour l’URL ?f=… — à garder synchronisés avec data-formation-slug sur chaque carte */
export const FORMATION_LABELS = {
  "bp-jeps-aspf": "BP JEPS - Activités Physiques et Sportives de la Forme (ASPF)",
  "bp-jeps-mapst": "BP JEPS - Multi Activités Physiques ou Sportives pour Tous (MAPST)",
  "bp-jeps-basket": "BP JEPS - Activités du Basket-Ball",
  "bp-jeps-rugby": "BP JEPS - Activités du Rugby à XV",
  "tfp-cdssa": "TFP CDSSA - Chargé de Développement d'une Structure Sportive Associative",
  "bp-jeps-asec": "BP JEPS - Animation Socio-Éducative ou Culturelle (ASEC)",
  "cc-acm": "Certificat Complémentaire - Direction d'un Accueil Collectif de Mineurs (ACM)",
  "de-jeps-asec-coordination":
    "DE JEPS - Animation Socio-Éducative ou Culturelle, mention Coordination de Projets",
};

/** Libellé court affiché dans le breadcrumb / hero de la fiche détail */
const FORMATION_SHORT_LABELS = {
  "bp-jeps-aspf": "BP JEPS Éducateur Sportif — APSF",
  "bp-jeps-mapst": "BP JEPS Éducateur Sportif — MAPST",
  "bp-jeps-basket": "BP JEPS Éducateur Sportif — Basket-Ball",
  "bp-jeps-rugby": "BP JEPS Éducateur Sportif — Rugby à XV",
  "tfp-cdssa": "TFP CDSSA",
  "bp-jeps-asec": "BP JEPS Animateur — ASEC",
  "cc-acm": "CC Direction ACM",
  "de-jeps-asec-coordination": "DE JEPS ASEC — Coordination",
};

/** Métadonnées affichées dans la sidebar selon le couple slug|ville */
const FORMATION_META = {
  "bp-jeps-mapst|Courbevoie": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 40480" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "553 h en centre" },
      { label: "Île-de-France" },
    ],
    deadline: "20 août 2026",
    session: "21 septembre 2026",
    duration: "12 mois — 553 h",
    successRate: "80 %",
  },
};

function parseCities(raw) {
  return String(raw ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildDetailUrl(slug, city) {
  const url = new URL("formation-detail.html", window.location.href);
  url.searchParams.set(PARAM_FORMATION, slug);
  url.searchParams.set(PARAM_VILLE, city);
  return url.pathname + url.search + url.hash;
}

export function initFormationCityModal() {
  const modal = document.getElementById("formation-city-modal");
  const subtitle = modal?.querySelector("[data-formation-modal-subtitle]");
  const citiesWrap = modal?.querySelector("[data-formation-modal-cities]");
  const dialog = modal?.querySelector(".formation-modal__dialog");

  if (!modal || !subtitle || !citiesWrap || !dialog) {
    return;
  }

  let lastTrigger = null;
  let onKeydown = null;

  const close = () => {
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("formation-modal-open");
    citiesWrap.innerHTML = "";
    subtitle.textContent = "";
    if (onKeydown) {
      document.removeEventListener("keydown", onKeydown);
      onKeydown = null;
    }
    lastTrigger?.focus();
    lastTrigger = null;
  };

  modal.querySelectorAll("[data-formation-modal-close]").forEach((el) => {
    el.addEventListener("click", close);
  });

  document.querySelectorAll("[data-formation-detail-trigger]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const article = btn.closest("[data-formation-slug]");
      if (!article) return;

      lastTrigger = btn;
      const slug = article.dataset.formationSlug?.trim();
      const cities = parseCities(article.dataset.cities);
      if (!slug || !cities.length) return;

      const title =
        (slug && FORMATION_LABELS[slug]) ||
        article.querySelector("h3")?.textContent?.trim() ||
        "Formation";

      subtitle.textContent = title;

      const pinSvg = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M12 22s7-7.5 7-13a7 7 0 1 0-14 0c0 5.5 7 13 7 13Z" />
          <circle cx="12" cy="9" r="2.5" />
        </svg>`;

      citiesWrap.innerHTML = "";
      cities.forEach((city) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "formation-modal__city-btn";
        b.innerHTML = `
          <span class="formation-modal__city-pin">${pinSvg}</span>
          <span class="formation-modal__city-label"></span>
          <span class="formation-modal__city-arrow" aria-hidden="true">→</span>
        `;
        b.querySelector(".formation-modal__city-label").textContent = city;
        b.setAttribute("aria-label", `Voir le détail de ${title} à ${city}`);
        b.addEventListener("click", () => {
          window.location.href = buildDetailUrl(slug, city);
        });
        citiesWrap.appendChild(b);
      });

      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("formation-modal-open");

      onKeydown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      };
      document.addEventListener("keydown", onKeydown);

      dialog.focus({ preventScroll: true });
    });
  });
}

function renderBadges(container, badges) {
  if (!container) return;
  container.innerHTML = "";
  if (!Array.isArray(badges) || !badges.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  badges.forEach((b) => {
    const span = document.createElement("span");
    span.className = `formation-detail-hero__badge${b.accent ? " formation-detail-hero__badge--accent" : ""}`;
    span.textContent = b.label;
    container.appendChild(span);
  });
}

function setText(selector, value) {
  const el = document.querySelector(selector);
  if (el) el.textContent = value || "—";
}

export function initFormationDetailPage() {
  const root = document.querySelector("[data-formation-detail-page]");
  if (!root) return;

  const titleEl = root.querySelector("[data-formation-detail-title]");
  const crumbEl = root.querySelector("[data-formation-detail-crumb]");
  const cityEl = root.querySelector("[data-formation-detail-city]");
  const badgesEl = root.querySelector("[data-formation-detail-badges]");
  const missingEl = document.querySelector("[data-formation-detail-missing]");
  const placeholderCard = document.querySelector("[data-formation-detail-placeholder-card]");
  const sheets = document.querySelectorAll("[data-formation-detail-sheet]");
  const aside = document.querySelector("[data-formation-detail-aside]");
  const metaDesc = document.querySelector('meta[name="description"]');

  const hideAllSheets = () => {
    sheets.forEach((el) => {
      el.hidden = true;
    });
  };

  const params = new URLSearchParams(window.location.search);
  const slug = params.get(PARAM_FORMATION)?.trim();
  const ville = params.get(PARAM_VILLE)?.trim();

  if (!slug || !ville) {
    if (titleEl) titleEl.textContent = "Fiche formation";
    if (cityEl) cityEl.textContent = "";
    if (badgesEl) {
      badgesEl.innerHTML = "";
      badgesEl.hidden = true;
    }
    if (missingEl) missingEl.hidden = false;
    if (aside) aside.hidden = true;
    hideAllSheets();
    if (placeholderCard) placeholderCard.hidden = false;
    return;
  }

  if (missingEl) missingEl.hidden = true;

  const label = FORMATION_LABELS[slug] || slug;
  const shortLabel = FORMATION_SHORT_LABELS[slug] || label;

  if (titleEl) titleEl.textContent = label;
  if (crumbEl) crumbEl.textContent = `${shortLabel} — ${ville}`;
  if (cityEl) cityEl.textContent = ville;
  document.title = `${label} — ${ville} | SporFormation`;

  const key = `${slug}|${ville}`;
  let sheetFound = false;
  sheets.forEach((el) => {
    const match = el.getAttribute("data-formation-detail-sheet") === key;
    el.hidden = !match;
    if (match) sheetFound = true;
  });

  const meta = FORMATION_META[key];
  if (sheetFound && meta) {
    renderBadges(badgesEl, meta.badges);
    if (aside) aside.hidden = false;
    setText("[data-formation-summary-city]", ville);
    setText("[data-formation-summary-deadline]", meta.deadline);
    setText("[data-formation-summary-session]", meta.session);
    setText("[data-formation-summary-duration]", meta.duration);
    setText("[data-formation-summary-stat]", meta.successRate);
  } else {
    if (badgesEl) {
      badgesEl.innerHTML = "";
      badgesEl.hidden = true;
    }
    if (aside) aside.hidden = true;
  }

  if (placeholderCard) placeholderCard.hidden = sheetFound;

  if (metaDesc) {
    const snippet = sheetFound
      ? `${label} à ${ville} — inscription, alternance, titre RNCP, dates et indicateurs. CFA SporFormation.`
      : `${label} à ${ville} — informations formation et contact CFA SporFormation.`;
    metaDesc.setAttribute("content", snippet);
  }
}
