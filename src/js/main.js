// SporFormation - point d'entrée JS
import "../scss/main.scss";

import { initHeader } from "./modules/header.js";
import { initMobileNav } from "./modules/mobile-nav.js";
import { initReveal } from "./modules/reveal.js";
import { initBackToTop } from "./modules/back-to-top.js";
import { initCounters } from "./modules/counter.js";
import { initSlider } from "./modules/slider.js";
import { initFilters } from "./modules/filters.js";
import {
  initFormationCityModal,
  initFormationDetailPage,
} from "./modules/formation-city-detail.js";
import {
  initContactForm,
  initEmployerForm,
  initPrepaTepForm,
} from "./modules/form.js";
import { initLiveMetrics } from "./modules/live-metrics.js";

const boot = async () => {
  initHeader();
  initMobileNav();
  initReveal();
  initBackToTop();
  await initLiveMetrics();
  initCounters();
  initSlider();
  initFilters();
  initFormationCityModal();
  initFormationDetailPage();
  initContactForm();
  initEmployerForm();
  initPrepaTepForm();
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => void boot(), { once: true });
} else {
  void boot();
}
