// Filtres de la page Formations : segmentation par tags data-filter-item.
export const initFilters = () => {
  const buttons = document.querySelectorAll("[data-filter-button]");
  const items = document.querySelectorAll("[data-filter-item]");

  if (!buttons.length || !items.length) {
    return;
  }

  const apply = (filter) => {
    buttons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.filterButton === filter);
    });

    items.forEach((item) => {
      const categories = (item.dataset.filterItem || "").split(/\s+/);
      const visible = filter === "all" || categories.includes(filter);
      item.hidden = !visible;
    });
  };

  buttons.forEach((button) => {
    button.addEventListener("click", () => apply(button.dataset.filterButton));
  });
};
