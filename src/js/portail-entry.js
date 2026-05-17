import "../scss/main.scss";
import "../scss/portal.scss";
import { portalJson } from "./modules/portal-api.js";

function flash(el, msg, kind) {
  if (!el) return;
  if (!msg) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = msg;
  el.classList.remove("portal-msg--error", "portal-msg--ok");
  el.classList.add(kind === "ok" ? "portal-msg--ok" : "portal-msg--error");
}

function bindTabs() {
  const tReg = document.getElementById("tab-register");
  const tLog = document.getElementById("tab-login");
  const pReg = document.getElementById("panel-register");
  const pLog = document.getElementById("panel-login");
  if (!tReg || !tLog || !pReg || !pLog) return;

  const show = (which) => {
    const isReg = which === "register";
    pReg.hidden = !isReg;
    pLog.hidden = isReg;
    tReg.setAttribute("aria-selected", String(isReg));
    tLog.setAttribute("aria-selected", String(!isReg));
  };

  tReg.addEventListener("click", () => show("register"));
  tLog.addEventListener("click", () => show("login"));
}

document.addEventListener("DOMContentLoaded", async () => {
  const flashEl = document.getElementById("portal-flash");

  const gate = await portalJson("/me");
  if (gate.ok && gate.data?.email) {
    window.location.replace("/compte/tableau-de-bord");
    return;
  }
  if (!gate.ok && gate.status === 503 && gate.data?.hint) {
    flash(flashEl, `${gate.data.error || "Portail indisponible."} ${gate.data.hint}`, "err");
  }

  bindTabs();

  document.getElementById("form-register")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    flash(flashEl, "", "err");
    const email = document.getElementById("reg-email")?.value.trim() ?? "";
    const password = document.getElementById("reg-password")?.value ?? "";
    const passwordConfirm = document.getElementById("reg-password2")?.value ?? "";
    if (password.length < 8) {
      flash(flashEl, "Le mot de passe doit contenir au moins 8 caractères.", "err");
      return;
    }
    if (password !== passwordConfirm) {
      flash(flashEl, "Les mots de passe ne correspondent pas.", "err");
      return;
    }
    const { ok, status, data } = await portalJson("/register", {
      method: "POST",
      body: JSON.stringify({ email, password, passwordConfirm }),
    });
    if (!ok) {
      flash(flashEl, [data?.error, data?.hint].filter(Boolean).join(" ") || `Erreur (${status}).`, "err");
      return;
    }
    window.location.href = `/portail/verifier?email=${encodeURIComponent(data.email || email)}`;
  });

  document.getElementById("form-login")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    flash(flashEl, "", "err");
    const email = document.getElementById("login-email")?.value.trim() ?? "";
    const password = document.getElementById("login-password")?.value ?? "";
    const { ok, status, data } = await portalJson("/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!ok) {
      flash(flashEl, [data?.error, data?.hint].filter(Boolean).join(" ") || `Erreur (${status}).`, "err");
      return;
    }
    window.location.replace("/compte/tableau-de-bord");
  });
});
