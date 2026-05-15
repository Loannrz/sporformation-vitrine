// Menu mobile : ouverture/fermeture, overlay sombre, fermeture sur lien ou Escape.
export const initMobileNav = () => {
  const toggle = document.getElementById("menu-toggle");
  const nav = document.getElementById("mobile-nav");
  const overlay = document.getElementById("mobile-nav-overlay");

  if (!toggle || !nav || !overlay) {
    return;
  }

  const open = () => {
    nav.classList.add("is-open");
    overlay.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("menu-open");
  };

  const close = () => {
    nav.classList.remove("is-open");
    overlay.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("menu-open");
  };

  toggle.addEventListener("click", () => {
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    expanded ? close() : open();
  });

  overlay.addEventListener("click", close);
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", close));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      close();
    }
  });
};
