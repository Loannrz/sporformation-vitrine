import { createClient } from "@supabase/supabase-js";
import { getFormsApiOrigin } from "./form-api.js";

/** Singleton léger : créé au premier appel avec les variables Vite */
let supabaseInstance = null;

/** URL et clé anon : VITE_* (habituel Vite) ou NEXT_PUBLIC_* (comme Next.js). Ne jamais utiliser la service_role côté navigateur. */
function resolveSupabaseBrowserConfig() {
  const url = String(
    import.meta.env.VITE_SUPABASE_URL ||
      import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
      ""
  ).trim();
  const anonKey = String(
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
      import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ""
  ).trim();
  return { url, anonKey };
}

function getSupabaseClient() {
  const { url, anonKey } = resolveSupabaseBrowserConfig();
  if (!url || !anonKey) {
    return null;
  }
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, anonKey);
  }
  return supabaseInstance;
}

function applyMetric(value, els) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return;
  }
  const formatted = Math.round(n).toString();
  els.forEach((el) => {
    if (el.classList.contains("counter")) {
      el.dataset.target = formatted;
    } else {
      el.textContent = formatted;
    }
  });
}

/**
 * count_formulaires (défaut) — RPC count_formulaires_etudiants (voir database/supabase-metric-apprentis.sql)
 * indicator — ligne indicateurs_site.cle = nombre_etudiants_actifs (politique RLS lecture anon à prévoir)
 */
async function fetchSupabaseStudentTotal() {
  const sb = getSupabaseClient();
  if (!sb) {
    return null;
  }

  const mode = String(
    import.meta.env.VITE_SUPABASE_METRIC ||
      import.meta.env.NEXT_PUBLIC_SUPABASE_METRIC ||
      "count_formulaires"
  ).trim();

  if (mode === "indicator") {
    const { data, error } = await sb
      .from("indicateurs_site")
      .select("valeur_entier")
      .eq("cle", "nombre_etudiants_actifs")
      .maybeSingle();

    if (error) {
      console.warn("[live-metrics] Supabase indicateur", error.message);
      return null;
    }
    const v = data?.valeur_entier;
    return v != null ? Number(v) : null;
  }

  const rpcName =
    String(
      import.meta.env.VITE_SUPABASE_RPC_COUNT ||
        import.meta.env.NEXT_PUBLIC_SUPABASE_RPC_COUNT ||
        ""
    ).trim() || "count_formulaires_etudiants";

  const { data, error } = await sb.rpc(rpcName);

  if (error) {
    console.warn("[live-metrics] Supabase RPC", rpcName, error.message);
    return null;
  }

  return data != null ? Number(data) : null;
}

/** Comptage direct table `classes` (RLS lecture anon doit être autorisée — voir database/supabase-metric-classes.sql) */
async function fetchSupabaseClassesTotal() {
  const sb = getSupabaseClient();
  if (!sb) {
    return null;
  }

  const tableName =
    String(
      import.meta.env.VITE_SUPABASE_CLASSES_TABLE ||
        import.meta.env.NEXT_PUBLIC_SUPABASE_CLASSES_TABLE ||
        ""
    ).trim() || "classes";

  const { count, error } = await sb
    .from(tableName)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.warn("[live-metrics] Supabase count classes", error.message);
    return null;
  }
  return typeof count === "number" ? count : null;
}

async function fetchFormsApiMetrics() {
  const origin = getFormsApiOrigin();
  if (origin === null) {
    return null;
  }
  try {
    const res = await fetch(`${origin}/api/metrics`);
    if (!res.ok) {
      return null;
    }
    return await res.json();
  } catch {
    return null;
  }
}

/** Met à jour les éléments [data-live-metric] (students + classes) avant l’animation des compteurs.
 *
 * Stratégie : API locale /api/metrics prioritaire pour les deux métriques (la clé service_role
 * côté serveur contourne la RLS des tables `students` et `classes`). Fallback Supabase anon
 * direct uniquement si l’API est inaccessible (et seulement si une politique RLS le permet).
 */
export async function initLiveMetrics() {
  const studentEls = document.querySelectorAll(
    '[data-live-metric="students"]'
  );
  const classEls = document.querySelectorAll('[data-live-metric="classes"]');

  if (!studentEls.length && !classEls.length) {
    return;
  }

  const api = await fetchFormsApiMetrics();
  let students = api && typeof api.nombreEtudiantsActifs === "number"
    ? api.nombreEtudiantsActifs
    : null;
  let classes = api && typeof api.nombreClasses === "number"
    ? api.nombreClasses
    : null;

  if (students == null && studentEls.length) {
    students = await fetchSupabaseStudentTotal();
  }
  if (classes == null && classEls.length) {
    classes = await fetchSupabaseClassesTotal();
  }

  if (students != null && students > 0) {
    applyMetric(students, studentEls);
  }
  if (classes != null && classes > 0) {
    applyMetric(classes, classEls);
  }
}
