// Filtres page Formations : catégories (sport / animation), recherche libre, liste déroulante par ville.

function normalizeSearchText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCities(raw) {
  return String(raw ?? "")
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildSearchBlob(item) {
  const title = item.querySelector("h3")?.textContent ?? "";
  const meta = [...item.querySelectorAll(".formation-card__meta .tag")]
    .map((el) => el.textContent)
    .join(" ");
  const details = item.querySelector(".formation-card__details")?.textContent ?? "";
  return normalizeSearchText(`${title} ${meta} ${details}`);
}

/** Ancienne page sans barre étendue : uniquement boutons data-filter-button */
function initLegacyFilters() {
  const buttons = document.querySelectorAll("[data-filter-button]");
  const items = document.querySelectorAll("[data-filter-item]");
  const root = document.querySelector("[data-formations-filter-root]");

  if (!buttons.length || !items.length || root) {
    return false;
  }

  const apply = (filter) => {
    buttons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.filterButton === filter);
    });

    items.forEach((item) => {
      const categories = (item.dataset.filterItem || "").split(/\s+/).filter(Boolean);
      const visible = filter === "all" || categories.includes(filter);
      item.hidden = !visible;
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => apply(button.dataset.filterButton));
  });

  return true;
}

export const initFilters = () => {
  if (initLegacyFilters()) {
    return;
  }

  const root = document.querySelector("[data-formations-filter-root]");
  const items = document.querySelectorAll("[data-filter-item]");
  const buttons = root?.querySelectorAll("[data-filter-button]");
  const searchInput = root?.querySelector("[data-filter-search]");
  const citySelect = root?.querySelector("[data-filter-city]");

  if (!root || !items.length || !buttons?.length || !searchInput || !citySelect) {
    return;
  }

  items.forEach((item) => {
    item.dataset.searchBlob = buildSearchBlob(item);
  });

  const citySet = new Set();
  items.forEach((item) => {
    parseCities(item.dataset.cities).forEach((c) => citySet.add(c));
  });
  [...citySet].sort((a, b) => a.localeCompare(b, "fr")).forEach((city) => {
    const opt = document.createElement("option");
    opt.value = city;
    opt.textContent = city;
    citySelect.appendChild(opt);
  });

  let activeCategory = "all";

  const refresh = () => {
    const q = normalizeSearchText(searchInput.value);
    const selectedCity = citySelect.value.trim();

    items.forEach((item) => {
      const categories = (item.dataset.filterItem || "").split(/\s+/).filter(Boolean);
      const catOk = activeCategory === "all" || categories.includes(activeCategory);

      const cities = parseCities(item.dataset.cities);
      const cityOk =
        !selectedCity || cities.includes(selectedCity);

      const blob = item.dataset.searchBlob || "";
      const searchOk = !q || blob.includes(q);

      item.hidden = !(catOk && cityOk && searchOk);
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.filterButton || "all";
      buttons.forEach((b) => {
        b.classList.toggle("is-active", b.dataset.filterButton === activeCategory);
      });
      refresh();
    });
  });

  searchInput.addEventListener("input", refresh);
  citySelect.addEventListener("change", refresh);

  const syncFromHash = () => {
    const hash = window.location.hash.slice(1);
    if (hash !== "sport" && hash !== "animation") {
      return;
    }
    activeCategory = hash;
    buttons.forEach((b) => {
      b.classList.toggle("is-active", b.dataset.filterButton === activeCategory);
    });
    refresh();
  };

  window.addEventListener("hashchange", syncFromHash);
  syncFromHash();
  refresh();
};
