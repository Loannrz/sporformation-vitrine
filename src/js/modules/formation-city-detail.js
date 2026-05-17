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

/** Libellé court affiché dans le breadcrumb / hero de la fiche détail et tableaux */
export const FORMATION_SHORT_LABELS = {
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
export const FORMATION_META = {
  "bp-jeps-aspf|Courbevoie": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 41752" },
      { label: "Alternance / autofinancement" },
      { label: "12 mois" },
      { label: "553 h (jeu. & ven.)" },
      { label: "Courbevoie" },
    ],
    deadline: "19 septembre 2026",
    session: "19 octobre 2026",
    duration: "12 mois — 553 h",
    successRate: "60 %",
    summaryStatLabel: "Taux d’obtention du diplôme — session 2025",
  },
  "bp-jeps-basket|Courbevoie": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 40423" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "610 h en centre" },
      { label: "Courbevoie" },
    ],
    deadline: "21 août 2026",
    session: "21 septembre 2026",
    duration: "12 mois — 610 h",
    successRate: "50 %",
    summaryStatLabel: "Taux d’obtention du diplôme — session 2024‑2025",
  },
  "bp-jeps-basket|Nanterre": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 40423" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "610 h en centre" },
      { label: "Nanterre" },
    ],
    deadline: "21 août 2026",
    session: "21 septembre 2026",
    duration: "12 mois — 610 h",
    successRate: "72 %",
    summaryStatLabel: "Taux d’obtention du diplôme — session 2024‑2025",
  },
  "bp-jeps-basket|Cergy": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 40423" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "610 h en centre" },
      { label: "Cergy" },
    ],
    deadline: "21 août 2026",
    session: "21 septembre 2026",
    duration: "12 mois — 610 h",
    successRate: "",
    summaryStatLabel: "",
  },
  "bp-jeps-asec|Courbevoie": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 39926" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "610 h en centre" },
      { label: "Courbevoie" },
    ],
    deadline: "19 septembre 2026",
    session: "19 octobre 2026",
    duration: "12 mois — 610 h",
    successRate: "87,50 %",
    summaryStatLabel: "Taux d’obtention du diplôme — session 2023‑2024",
  },
  "bp-jeps-asec|Coulommiers": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 39926" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "610 h en centre" },
      { label: "Coulommiers" },
    ],
    deadline: "À communiquer",
    session: "À communiquer",
    duration: "12 mois — 610 h",
    successRate: "",
    summaryStatLabel: "",
  },
  "bp-jeps-rugby|Courbevoie": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 41750" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "585 h en centre" },
      { label: "Courbevoie" },
    ],
    deadline: "21 août 2026",
    session: "21 septembre 2026",
    duration: "12 mois — 585 h",
    successRate: "84 %",
    summaryStatLabel: "Taux d’obtention du diplôme — session 2024‑2025",
  },
  "cc-acm|Courbevoie": {
    region: "Île-de-France",
    badges: [
      { label: "RS 5737", accent: true },
      { label: "Certificat complémentaire" },
      { label: "154 h en centre" },
      { label: "Courbevoie" },
    ],
    deadline: "8 février 2027",
    session: "8 mars 2027",
    duration: "154 h en centre + temps en structure",
    successRate: "",
    summaryStatLabel: "",
  },
  "de-jeps-asec-coordination|Courbevoie": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 5", accent: true },
      { label: "RNCP 39930" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "700 h en centre" },
      { label: "Courbevoie" },
    ],
    deadline: "19 août 2026",
    session: "19 octobre 2026",
    duration: "12 mois — 700 h",
    successRate: "",
    summaryStatLabel: "",
  },
  "tfp-cdssa|Paris 7e": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 5", accent: true },
      { label: "RNCP 38142" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "612 h en centre" },
      { label: "Paris 7e" },
    ],
    deadline: "À communiquer",
    session: "À communiquer",
    duration: "12 mois — 612 h",
    successRate: "",
    summaryStatLabel: "",
  },
  "tfp-cdssa|Drancy": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 5", accent: true },
      { label: "RNCP 38142" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "612 h en centre" },
      { label: "Drancy" },
    ],
    deadline: "À communiquer",
    session: "À communiquer",
    duration: "12 mois — 612 h",
    successRate: "",
    summaryStatLabel: "",
  },
  "tfp-cdssa|Cergy": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 5", accent: true },
      { label: "RNCP 38142" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "612 h en centre" },
      { label: "Cergy" },
    ],
    deadline: "À communiquer",
    session: "À communiquer",
    duration: "12 mois — 612 h",
    successRate: "100 %",
    summaryStatLabel: "Taux d’obtention du diplôme — session 2025",
  },
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
    summaryStatLabel: "Taux d’obtention du diplôme — session 2025‑2026",
  },
  "bp-jeps-mapst|Paris 7e": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 40480" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "553 h en centre" },
      { label: "Île-de-France" },
    ],
    deadline: "23 août 2026",
    session: "24 septembre 2026",
    duration: "12 mois — 553 h",
    successRate: "83 %",
    summaryStatLabel: "Taux d’obtention du diplôme — session 2024‑2025",
  },
  "bp-jeps-mapst|Cergy": {
    region: "Île-de-France",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 40480" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "553 h en centre" },
      { label: "Île-de-France" },
    ],
    deadline: "À communiquer",
    session: "À communiquer",
    duration: "12 mois — 553 h",
    successRate: "",
    summaryStatLabel: "",
  },
  "bp-jeps-mapst|Nanterre": {
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
    successRate: "94 %",
    summaryStatLabel: "Taux d’obtention du diplôme — session 2024‑2025",
  },
  "bp-jeps-mapst|Coulommiers": {
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
    successRate: "100 %",
    summaryStatLabel: "Taux d’obtention du diplôme — session 2024‑2025",
  },
  "bp-jeps-mapst|Ajaccio": {
    region: "Corse",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 40480" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "609 h en centre" },
      { label: "Corse" },
    ],
    deadline: "20 août 2026",
    session: "21 septembre 2026",
    duration: "12 mois — 609 h",
    successRate: "",
    summaryStatLabel: "",
  },
  "bp-jeps-mapst|Arpajon-Égly": {
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
    successRate: "",
    summaryStatLabel: "",
  },
  "bp-jeps-mapst|Mortagne-au-Perche": {
    region: "Normandie",
    badges: [
      { label: "Niveau 4", accent: true },
      { label: "RNCP 40480" },
      { label: "Alternance" },
      { label: "12 mois" },
      { label: "553 h en centre" },
      { label: "Normandie" },
    ],
    deadline: "20 août 2026",
    session: "21 septembre 2026",
    duration: "12 mois — 553 h",
    successRate: "",
    summaryStatLabel: "",
  },
  "bp-jeps-mapst|Drancy": {
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
    successRate: "",
    summaryStatLabel: "",
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

const TOC_SECTION_SUFFIXES = ["quoi", "org", "alt", "eval", "fin", "obj", "deb", "res", "docs"];

function updateFormationTocAnchors(visibleArticle) {
  const toc = document.querySelector("[data-formation-toc]");
  if (!toc || !visibleArticle) return;
  const prefix = visibleArticle.dataset.sheetAnchorPrefix?.trim();
  if (!prefix) return;
  const links = toc.querySelectorAll("ol li a");
  links.forEach((a, i) => {
    const suf = TOC_SECTION_SUFFIXES[i];
    if (suf) {
      a.setAttribute("href", `#${prefix}-${suf}`);
    }
  });
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
  let visibleArticle = null;
  sheets.forEach((el) => {
    const match = el.getAttribute("data-formation-detail-sheet") === key;
    el.hidden = !match;
    if (match) {
      sheetFound = true;
      visibleArticle = el;
    }
  });

  updateFormationTocAnchors(visibleArticle);

  const meta = FORMATION_META[key];
  if (sheetFound && meta) {
    renderBadges(badgesEl, meta.badges);
    if (aside) aside.hidden = false;
    setText("[data-formation-summary-city]", ville);
    setText("[data-formation-summary-deadline]", meta.deadline);
    setText("[data-formation-summary-session]", meta.session);
    setText("[data-formation-summary-duration]", meta.duration);
    const statEl = document.querySelector("[data-formation-summary-stat]");
    const statWrap = document.querySelector("[data-formation-summary-stat-wrap]");
    const rate = meta.successRate?.trim();
    if (statWrap) {
      statWrap.hidden = !rate;
    }
    if (statEl) {
      statEl.textContent = rate || "—";
    }
    const statLabelEl = document.querySelector("[data-formation-summary-stat-label]");
    if (statLabelEl) {
      if (!rate) {
        statLabelEl.textContent = "";
      } else {
        statLabelEl.textContent =
          meta.summaryStatLabel?.trim() ||
          "Taux d’obtention du diplôme — session 2025‑2026";
      }
    }

    // Grand encadré % sous « Indicateurs de résultats » : même règle que la sidebar (masqué si pas de taux statique).
    const bottomStat = visibleArticle?.querySelector(".formation-detail-sheet__stat");
    if (bottomStat) {
      const sheetRate = meta.successRate?.trim();
      bottomStat.hidden = !sheetRate;
      const heroVal = bottomStat.querySelector(".formation-detail-sheet__stat-value");
      if (heroVal && sheetRate) heroVal.textContent = sheetRate;
    }
  } else {
    if (badgesEl) {
      badgesEl.innerHTML = "";
      badgesEl.hidden = true;
    }
    if (aside) aside.hidden = true;

    const bottomStat = visibleArticle?.querySelector(".formation-detail-sheet__stat");
    if (bottomStat) bottomStat.hidden = true;
  }

  if (placeholderCard) placeholderCard.hidden = sheetFound;

  if (metaDesc) {
    const snippet = sheetFound
      ? `${label} à ${ville} — inscription, alternance, titre RNCP, dates et indicateurs. CFA SporFormation.`
      : `${label} à ${ville} — informations formation et contact CFA SporFormation.`;
    metaDesc.setAttribute("content", snippet);
  }
}
