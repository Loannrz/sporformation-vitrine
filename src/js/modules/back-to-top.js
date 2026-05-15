// Bouton "retour en haut" : visible après 500px de scroll.
export const initBackToTop = () => {
  const button = document.getElementById("back-to-top");
  if (!button) {
    return;
  }

  const handleScroll = () => {
    button.classList.toggle("is-visible", window.scrollY > 500);
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
};
