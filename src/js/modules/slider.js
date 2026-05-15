// Carousel témoignages : navigation, dots, autoplay 5s, pause au survol.
export const initSlider = () => {
  const track = document.getElementById("testimonial-track");
  if (!track) {
    return;
  }

  const slides = Array.from(track.children);
  if (slides.length < 2) {
    return;
  }

  const prevButton = document.getElementById("testimonial-prev");
  const nextButton = document.getElementById("testimonial-next");
  const dotsContainer = document.getElementById("testimonial-dots");

  let current = 0;
  let timer = null;
  const AUTO_DELAY = 5000;

  const renderDots = () => {
    if (!dotsContainer) return;
    dotsContainer.innerHTML = "";
    slides.forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = `slider__dot${index === current ? " is-active" : ""}`;
      dot.setAttribute("aria-label", `Afficher le témoignage ${index + 1}`);
      dot.addEventListener("click", () => {
        goTo(index);
        restart();
      });
      dotsContainer.appendChild(dot);
    });
  };

  const goTo = (index) => {
    current = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    renderDots();
  };

  const next = () => goTo(current + 1);
  const prev = () => goTo(current - 1);

  const start = () => {
    timer = window.setInterval(next, AUTO_DELAY);
  };
  const stop = () => window.clearInterval(timer);
  const restart = () => {
    stop();
    start();
  };

  prevButton?.addEventListener("click", () => {
    prev();
    restart();
  });
  nextButton?.addEventListener("click", () => {
    next();
    restart();
  });

  track.addEventListener("mouseenter", stop);
  track.addEventListener("mouseleave", start);
  track.addEventListener("focusin", stop);
  track.addEventListener("focusout", start);

  goTo(0);
  start();
};
