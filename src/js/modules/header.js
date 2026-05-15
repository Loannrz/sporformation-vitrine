// Bascule l'état "scrolled" sur la nav fixe.
// Sur les pages internes (.site-header--solid), la nav reste solide en permanence.
export const initHeader = () => {
  const header = document.getElementById("site-header");
  if (!header) {
    return;
  }

  const isSolid = header.classList.contains("site-header--solid");

  const handleScroll = () => {
    if (isSolid) {
      return;
    }
    header.classList.toggle("is-scrolled", window.scrollY > 24);
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();
};
