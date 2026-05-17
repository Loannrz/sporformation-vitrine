/** Page /login.html — authentification administrateur via Supabase Auth. */
import { supabase, apiFetch } from "./supabase-client.js";

async function ensureAdmin() {
  try {
    const me = await apiFetch("/api/admin/me");
    return { ok: Boolean(me?.ok) };
  } catch (e) {
    const status = typeof e?.status === "number" ? e.status : null;
    const msg = e instanceof Error ? e.message : String(e);
    const networkFault =
      status == null &&
      (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg));
    return { ok: false, networkFault, httpStatus: status };
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");
  if (!form || !errorEl || !submitBtn) return;

  // Si déjà connecté et déjà admin, redirige directement
  const sessionGate = await ensureAdmin();
  if (sessionGate.ok) {
    window.location.replace("/admin.html");
    return;
  }

  const showError = (msg) => {
    errorEl.textContent = msg;
    errorEl.classList.add("visible");
  };
  const clearError = () => {
    errorEl.textContent = "";
    errorEl.classList.remove("visible");
  };

  const pwdInput = document.getElementById("login-password");
  const pwdToggle = document.getElementById("login-password-toggle");

  pwdToggle?.addEventListener("click", () => {
    if (!pwdInput || !pwdToggle) return;
    const reveal = pwdInput.type === "password";
    pwdInput.type = reveal ? "text" : "password";
    pwdToggle.classList.toggle("is-revealed", reveal);
    pwdToggle.setAttribute("aria-label", reveal ? "Masquer le mot de passe" : "Afficher le mot de passe");
    pwdToggle.setAttribute("aria-pressed", reveal ? "true" : "false");
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    submitBtn.disabled = true;
    submitBtn.textContent = "Connexion en cours…";

    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(
          error.message?.toLowerCase().includes("invalid")
            ? "E-mail ou mot de passe incorrect."
            : error.message || "Connexion impossible."
        );
      }
      const adminGate = await ensureAdmin();
      if (!adminGate.ok) {
        if (adminGate.networkFault) {
          showError(
            "Impossible de joindre l’API du site (serveur local). Arrêtez puis relancez « npm run dev » — la commande démarre Vite et l’API sur le port configuré (3001 par défaut). Vous pouvez aussi lancer « npm run server » dans un second terminal."
          );
        } else {
          await supabase.auth.signOut();
          showError(
            adminGate.httpStatus === 403
              ? "Ce compte n'a pas le rôle administrateur. Contactez le responsable du site pour obtenir l'accès."
              : "Vérification du compte administrateur impossible. Réessayez dans un instant."
          );
        }
        submitBtn.disabled = false;
        submitBtn.textContent = "Se connecter";
        return;
      }
      window.location.replace("/admin.html");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Connexion impossible.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Se connecter";
    }
  });
});
