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

export function initFormationDetailPage() {
  const root = document.querySelector("[data-formation-detail-page]");
  if (!root) return;

  const titleEl = root.querySelector("[data-formation-detail-title]");
  const cityEl = root.querySelector("[data-formation-detail-city]");
  const missingEl = document.querySelector("[data-formation-detail-missing]");

  const params = new URLSearchParams(window.location.search);
  const slug = params.get(PARAM_FORMATION)?.trim();
  const ville = params.get(PARAM_VILLE)?.trim();

  if (!slug || !ville) {
    if (titleEl) titleEl.textContent = "Fiche formation";
    if (cityEl) cityEl.textContent = "";
    if (missingEl) missingEl.hidden = false;
    return;
  }

  if (missingEl) missingEl.hidden = true;

  const label = FORMATION_LABELS[slug] || slug;

  if (titleEl) titleEl.textContent = label;
  if (cityEl) cityEl.textContent = `Ville : ${ville}`;
  document.title = `${label} — ${ville} | SporFormation`;
}
