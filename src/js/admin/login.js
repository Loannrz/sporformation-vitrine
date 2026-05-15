/** Page /login.html — authentification administrateur via Supabase Auth. */
import { supabase, apiFetch } from "./supabase-client.js";

async function ensureAdmin() {
  try {
    const me = await apiFetch("/api/admin/me");
    return Boolean(me?.ok);
  } catch (_e) {
    return false;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("login-form");
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("login-submit");
  if (!form || !errorEl || !submitBtn) return;

  // Si déjà connecté et déjà admin, redirige directement
  const already = await ensureAdmin();
  if (already) {
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
      const ok = await ensureAdmin();
      if (!ok) {
        // On récupère le détail du serveur (user_id + SQL prêt-à-coller) pour aider
        let detail = null;
        try {
          const r = await fetch("/api/admin/me", {
            headers: {
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
          });
          detail = await r.json();
        } catch (_e) {
          /* ignore */
        }
        await supabase.auth.signOut();
        const err = new Error(
          detail?.error ||
            "Ce compte n'a pas le rôle administrateur. Contactez le responsable du site."
        );
        err.detail = detail;
        throw err;
      }
      window.location.replace("/admin.html");
    } catch (err) {
      // Si le serveur a renvoyé l'user_id, on affiche le SQL prêt à copier
      if (err?.detail?.user_id) {
        errorEl.innerHTML =
          "Ce compte n'a pas le rôle administrateur. Exécutez le SQL suivant dans Supabase pour vous ajouter :" +
          `<code>INSERT INTO public.admins (user_id, email, role)\nVALUES ('${err.detail.user_id}', '${err.detail.email}', 'super-admin');</code>`;
        errorEl.classList.add("visible");
      } else {
        showError(err instanceof Error ? err.message : "Connexion impossible.");
      }
      submitBtn.disabled = false;
      submitBtn.textContent = "Se connecter";
    }
  });
});
