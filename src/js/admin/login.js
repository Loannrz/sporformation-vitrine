/** Page /login — authentification administrateur via Supabase Auth. */
import { supabase, apiFetch } from "./supabase-client.js";

/** @param {string | undefined} accessToken Jeton frais renvoyé par signInWithPassword (évite 401 transitoire). */
async function ensureAdmin(accessToken) {
  try {
    const me = await apiFetch("/api/admin/me", accessToken ? { accessToken } : {});
    return { ok: Boolean(me?.ok) };
  } catch (e) {
    const status = typeof e?.status === "number" ? e.status : null;
    const msg = e instanceof Error ? e.message : String(e);
    const hint = typeof e?.hint === "string" ? e.hint : "";
    const networkFault =
      status == null &&
      (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(msg));
    return {
      ok: false,
      networkFault,
      httpStatus: status,
      serverMessage: msg,
      serverHint: hint || undefined,
    };
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
    window.location.replace("/admin");
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
      const { data: signData, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        throw new Error(
          error.message?.toLowerCase().includes("invalid")
            ? "E-mail ou mot de passe incorrect."
            : error.message || "Connexion impossible."
        );
      }
      const freshToken = signData?.session?.access_token?.trim() || "";
      const adminGate = await ensureAdmin(freshToken || undefined);
      if (!adminGate.ok) {
        if (adminGate.networkFault) {
          showError(
            "Impossible de joindre l’API du site (serveur local). Arrêtez puis relancez « npm run dev » — la commande démarre Vite et l’API sur le port configuré (3001 par défaut). Vous pouvez aussi lancer « npm run server » dans un second terminal."
          );
        } else {
          await supabase.auth.signOut();
          const st = adminGate.httpStatus;
          if (st === 403) {
            showError(
              "Ce compte n'a pas le rôle administrateur. Contactez le responsable du site pour obtenir l'accès."
            );
          } else if (st === 401) {
            showError(
              "La session n’a pas pu être vérifiée tout de suite. Réessayez : si le problème continue, vérifiez que l’API tourne et que les clés Supabase (.env.local) correspondent au même projet que ce site."
            );
          } else if (st === 503) {
            showError(
              "Serveur mal configuré : SUPABASE_URL (ou VITE_SUPABASE_URL) et SUPABASE_SERVICE_ROLE_KEY sont requis côté API pour la console admin."
            );
          } else if (typeof st === "number") {
            const detail =
              adminGate.serverMessage &&
              adminGate.serverMessage !== `Erreur HTTP ${st}`
                ? adminGate.serverMessage
                : "";
            const hintSuffix = adminGate.serverHint ? ` — ${adminGate.serverHint}` : "";
            showError(
              detail
                ? `${detail}${hintSuffix}`
                : `Vérification du compte impossible (erreur ${st}). Réessayez dans un instant ou contactez le support.`
            );
          } else {
            showError("Vérification du compte administrateur impossible. Réessayez dans un instant.");
          }
        }
        submitBtn.disabled = false;
        submitBtn.textContent = "Se connecter";
        return;
      }
      window.location.replace("/admin");
    } catch (err) {
      showError(err instanceof Error ? err.message : "Connexion impossible.");
      submitBtn.disabled = false;
      submitBtn.textContent = "Se connecter";
    }
  });
});
