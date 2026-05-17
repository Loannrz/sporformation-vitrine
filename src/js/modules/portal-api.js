/** Appels API portail (cookie HttpOnly, credentials inclus). */
export async function portalJson(path, options = {}) {
  const res = await fetch(`/api/portal${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function requirePortalSession() {
  const { ok, data } = await portalJson("/me");
  if (!ok || !data?.email) {
    window.location.replace("/portail");
    return null;
  }
  return data;
}

export async function portalLogout() {
  await portalJson("/logout", { method: "POST", body: "{}" });
  window.location.replace("/portail");
}

/** Envoi multipart (fichiers inscription) avec cookie de session. */
export async function portalFormData(path, formData) {
  const res = await fetch(`/api/portal${path}`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

/**
 * Même chose que portalFormData avec suivi de progression (0–1 ou null si taille inconnue).
 * @param {(ratio: number | null) => void} [onProgress]
 */
export function portalFormDataWithProgress(path, formData, onProgress) {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/portal${path}`);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => {
      if (typeof onProgress !== "function") return;
      if (e.lengthComputable) onProgress(Math.min(1, e.loaded / Math.max(1, e.total)));
      else onProgress(null);
    };
    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText || "null");
      } catch {
        data = null;
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
    };
    xhr.onerror = () => resolve({ ok: false, status: xhr.status || 0, data: { error: "Réseau indisponible." } });
    xhr.send(formData);
  });
}

/** URL publique Storage Supabase pour un objet du bucket `public-uploads` (inscription). */
export function portalPublicUploadUrl(storagePath) {
  if (!storagePath || typeof storagePath !== "string") return "";
  const base = String(
    import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL || ""
  ).replace(/\/$/, "");
  if (!base) return "";
  const encoded = storagePath
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${base}/storage/v1/object/public/public-uploads/${encoded}`;
}
