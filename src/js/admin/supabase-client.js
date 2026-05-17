/**
 * Client Supabase pour les pages admin (login / console).
 * Utilise la clé anon (publique) — le verrouillage d'écriture se fait côté serveur
 * via la table `admins` et la vérification du JWT.
 */
import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  "";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    "[admin] Variables Supabase manquantes : définis SUPABASE_URL / SUPABASE_ANON_KEY dans .env.local."
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "sporformation-admin-auth",
  },
});

/** Récupère le JWT d'accès courant (Bearer) ou null. */
export async function getAccessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || null;
}

/** Wrapper fetch avec Authorization automatique.
 *  Passer `{ accessToken: "<jwt>" }` juste après signInWithPassword évite une course où getSession()
 *  n’a pas encore le jeton (401 alors que le compte est bien admin). */
export async function apiFetch(input, init = {}) {
  const explicit = typeof init.accessToken === "string" && init.accessToken.trim() ? init.accessToken.trim() : "";
  const { accessToken: _omit, ...fetchInit } = init;
  const token = explicit || (await getAccessToken());
  const headers = new Headers(fetchInit.headers || {});
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (fetchInit.body && !(fetchInit.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(input, { ...fetchInit, headers });
  let payload = null;
  try {
    payload = await res.json();
  } catch (_e) {
    payload = null;
  }
  if (!res.ok) {
    const message = payload?.error || `Erreur HTTP ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    err.payload = payload;
    if (payload?.hint && typeof payload.hint === "string") err.hint = payload.hint;
    throw err;
  }
  return payload;
}
