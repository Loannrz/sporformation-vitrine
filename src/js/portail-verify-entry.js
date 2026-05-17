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

/** Champ OTP découpé en 6 cases — navigation clavier + collage. */
function bindOtpDigits() {
  const digits = [...document.querySelectorAll(".portal-otp-digit")];
  if (!digits.length) return () => "";

  const getCode = () =>
    digits
      .map((el) => String(el.value || "").replace(/\D/g, "").slice(-1))
      .join("");

  digits.forEach((input, i) => {
    input.addEventListener("input", () => {
      input.value = String(input.value || "").replace(/\D/g, "").slice(-1);
      if (input.value && i < digits.length - 1) digits[i + 1].focus();
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !input.value && i > 0) digits[i - 1].focus();
    });
  });

  digits[0]?.addEventListener("paste", (e) => {
    e.preventDefault();
    const raw = (e.clipboardData?.getData("text") || "").replace(/\D/g, "").slice(0, 6);
    raw.split("").forEach((ch, j) => {
      if (digits[j]) digits[j].value = ch;
    });
    digits[Math.min(raw.length, digits.length - 1)]?.focus();
  });

  return getCode;
}

function refreshSentToBanner(email) {
  const wrap = document.getElementById("verify-sentto-wrap");
  const strong = document.getElementById("verify-email-strong");
  if (!wrap || !strong) return;
  const trimmed = email.trim();
  if (trimmed) {
    strong.textContent = trimmed;
    wrap.hidden = false;
  } else {
    wrap.hidden = true;
  }
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

  const getOtpCode = bindOtpDigits();

  const params = new URLSearchParams(window.location.search);
  const emailFromUrl = (params.get("email") || "").trim();
  const emailInput = document.getElementById("verify-email-input");
  if (emailInput && emailFromUrl) {
    emailInput.value = emailFromUrl;
  }

  refreshSentToBanner(emailInput?.value || emailFromUrl || "");
  emailInput?.addEventListener("input", () => refreshSentToBanner(emailInput.value));

  const digitsFocusFirst = () => document.querySelector(".portal-otp-digit")?.focus();

  if (emailFromUrl) digitsFocusFirst();

  document.getElementById("form-verify")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    flash(flashEl, "", "err");
    const email = (emailInput?.value || "").trim();
    const code = getOtpCode ? getOtpCode() : "";
    if (!email) {
      flash(flashEl, "Indiquez l’adresse e-mail utilisée à l’inscription.", "err");
      return;
    }
    if (code.length !== 6) {
      flash(flashEl, "Saisissez les 6 chiffres du code reçu par e-mail.", "err");
      document.querySelector(".portal-otp-digit")?.focus();
      return;
    }
    const { ok, status, data } = await portalJson("/verify", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    });
    if (!ok) {
      flash(flashEl, [data?.error, data?.hint].filter(Boolean).join(" ") || `Erreur (${status}).`, "err");
      return;
    }
    window.location.replace("/compte/tableau-de-bord");
  });

  document.getElementById("verify-resend")?.addEventListener("click", async () => {
    flash(flashEl, "", "err");
    const email = (emailInput?.value || "").trim();
    if (!email) {
      flash(flashEl, "Indiquez votre e-mail pour renvoyer un code.", "err");
      return;
    }
    const { ok, data } = await portalJson("/resend", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    if (!ok) {
      flash(flashEl, [data?.error, data?.hint].filter(Boolean).join(" ") || "Impossible de renvoyer le code.", "err");
      return;
    }
    flash(flashEl, "Un nouveau code vous a été envoyé.", "ok");
    digitsFocusFirst();
  });
});
