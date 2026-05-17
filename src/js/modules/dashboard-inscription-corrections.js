/**
 * Modale tableau de bord — corrections direction sur dossiers (brouillon ou déjà envoyé).
 */
import { portalJson, portalFormDataWithProgress, portalPublicUploadUrl } from "./portal-api.js";
import { portalFieldMissingMessage, isPortalFieldFilled } from "./inscription-portal-validation.js";

function fieldMetaById(definition, fieldId) {
  for (const step of definition?.steps || []) {
    for (const b of step.blocks || []) {
      if (b.kind === "field" && b.id === fieldId) return b;
    }
  }
  return null;
}

function orderedAdminFlagFieldIds(definition, admin_field_flags) {
  const marks = admin_field_flags && typeof admin_field_flags === "object" ? admin_field_flags : {};
  const keySet = new Set(Object.keys(marks));
  const out = [];
  for (const step of definition?.steps || []) {
    for (const b of step.blocks || []) {
      if (b.kind === "field" && keySet.has(b.id)) out.push(b.id);
    }
  }
  for (const k of Object.keys(marks)) {
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

function directionMessageForField(fid, admin_field_flags) {
  const mark = admin_field_flags?.[fid];
  if (!mark || typeof mark !== "object") return "Merci de mettre ce champ à jour.";
  const msg = mark.message != null ? String(mark.message).trim() : "";
  if (msg) return msg;
  if (mark.reason && String(mark.reason) !== "annulation_admin") {
    return `Motif (administration) : ${mark.reason}`;
  }
  return "Merci de mettre ce champ à jour.";
}

function flashDash(el, msg, kind) {
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

/**
 * @param {{ reloadList: () => void | Promise<void> }} opts
 */
export function initDashboardInscriptionCorrections(opts) {
  const dialog = document.getElementById("dash-insc-corr-dialog");
  const bodyEl = document.getElementById("dash-insc-corr-body");
  const flashEl = document.getElementById("dash-insc-corr-flash");
  const btnSend = document.getElementById("dash-insc-corr-send");
  const btnClose = document.getElementById("dash-insc-corr-close");

  if (!dialog || !bodyEl || !btnSend || !btnClose) {
    return { openCorrectionsModal: async () => {} };
  }

  /** @type {{ submissionId: string, definition: object, answers: object, files: object, admin_field_flags: object, status: string } | null} */
  let session = null;

  /**
   * Plus aucun champ signalé : enchaîne POST /submit pour renvoyer tout le dossier (comme « Envoyer le formulaire »).
   * @returns {Promise<boolean>} true si la modale est terminée (succès ou échec géré avec fermeture)
   */
  async function trySubmitFullDossierAfterCorrectionsDone() {
    if (!session?.submissionId || Object.keys(session.admin_field_flags || {}).length > 0) return false;
    const subRes = await portalJson(`/inscription/submissions/${session.submissionId}/submit`, {
      method: "POST",
      body: "{}",
    });
    if (!subRes.ok) {
      flashDash(
        flashEl,
        subRes.data?.error ||
          "Les corrections sont enregistrées, mais le renvoi du dossier complet a échoué — souvent parce qu’un champ obligatoire manque ailleurs dans le formulaire. Ouvrez le dossier complet pour finaliser.",
        "err"
      );
      dialog.close();
      await opts.reloadList();
      return true;
    }
    flashDash(
      flashEl,
      "C’est fait : le dossier complet a été renvoyé à l’équipe. Inutile d’enchaîner les étapes ni de recliquer sur « Envoyer le formulaire ».",
      "ok"
    );
    dialog.close();
    await opts.reloadList();
    return true;
  }

  function setAnswer(fieldId, value) {
    if (!session) return;
    session.answers[fieldId] = value;
    /* Ne pas re-render le corps de la modale ici : ça détruirait l’input et ferait perdre le focus (une lettre puis blocage). */
  }

  function toggleMulti(fieldId, opt, checked) {
    if (!session) return;
    const cur = Array.isArray(session.answers[fieldId]) ? [...session.answers[fieldId]] : [];
    const i = cur.indexOf(opt);
    if (checked && i === -1) cur.push(opt);
    if (!checked && i >= 0) cur.splice(i, 1);
    session.answers[fieldId] = cur;
  }

  function refreshModalEditors() {
    if (!session) return;
    renderModalBody();
  }

  function appendFieldControls(wrap, f, idSuffix) {
    if (!session) return;
    if (f.type === "text") {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "portal-input";
      inp.value = session.answers[f.id] ?? "";
      inp.addEventListener("input", () => setAnswer(f.id, inp.value));
      wrap.appendChild(inp);
    } else if (f.type === "number") {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.inputMode = "numeric";
      inp.autocomplete = "off";
      inp.className = "portal-input";
      inp.placeholder = "Saisissez un nombre";
      inp.value = session.answers[f.id] ?? "";
      inp.addEventListener("input", () => setAnswer(f.id, inp.value));
      wrap.appendChild(inp);
    } else if (f.type === "textarea") {
      const ta = document.createElement("textarea");
      ta.className = "portal-input";
      ta.rows = 4;
      ta.value = session.answers[f.id] ?? "";
      ta.addEventListener("input", () => setAnswer(f.id, ta.value));
      wrap.appendChild(ta);
    } else if (f.type === "yesno") {
      const row = document.createElement("div");
      row.className = "portal-insc-btn-row";
      const val = session.answers[f.id];
      for (const opt of ["oui", "non"]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn--choice" + (val === opt ? " is-selected" : "");
        b.textContent = opt === "oui" ? "Oui" : "Non";
        b.addEventListener("click", () => {
          setAnswer(f.id, opt);
          refreshModalEditors();
        });
        row.appendChild(b);
      }
      wrap.appendChild(row);
    } else if (f.type === "binary") {
      const row = document.createElement("div");
      row.className = "portal-insc-btn-row";
      const val = session.answers[f.id];
      const leftL = f.label_left ?? "1";
      const rightL = f.label_right ?? "2";
      for (const [key, capt] of [
        ["left", leftL],
        ["right", rightL],
      ]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn--choice" + (val === key ? " is-selected" : "");
        b.textContent = capt;
        b.addEventListener("click", () => {
          setAnswer(f.id, key);
          refreshModalEditors();
        });
        row.appendChild(b);
      }
      wrap.appendChild(row);
    } else if (f.type === "single") {
      const row = document.createElement("div");
      row.className = "portal-insc-btn-row";
      const opts = f.options || [];
      const val = session.answers[f.id];
      for (const opt of opts) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn--choice" + (val === opt ? " is-selected" : "");
        b.textContent = opt;
        b.addEventListener("click", () => {
          setAnswer(f.id, opt);
          refreshModalEditors();
        });
        row.appendChild(b);
      }
      wrap.appendChild(row);
    } else if (f.type === "multi") {
      const opts = f.options || [];
      const cur = Array.isArray(session.answers[f.id]) ? session.answers[f.id] : [];
      for (const opt of opts) {
        const row = document.createElement("label");
        row.className = "portal-insc-check";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = cur.includes(opt);
        cb.addEventListener("change", () => toggleMulti(f.id, opt, cb.checked));
        row.appendChild(cb);
        row.appendChild(document.createTextNode(" " + opt));
        wrap.appendChild(row);
      }
    } else if (f.type === "file") {
      attachFileField(wrap, f, idSuffix);
    }
  }

  function attachFileField(wrap, f, idSuffix) {
    if (!session) return;
    const previewHost = document.createElement("div");
    previewHost.className = "portal-insc-file-preview-host";
    const progressWrap = document.createElement("div");
    progressWrap.className = "portal-insc-file-progress";
    progressWrap.hidden = true;
    const progressLabel = document.createElement("span");
    progressLabel.className = "portal-insc-file-progress__text";
    progressLabel.textContent = "Téléversement…";
    const progressTrack = document.createElement("div");
    progressTrack.className = "portal-insc-file-progress__track";
    const progressBar = document.createElement("div");
    progressBar.className = "portal-insc-file-progress__bar";
    progressTrack.appendChild(progressBar);
    progressWrap.appendChild(progressLabel);
    progressWrap.appendChild(progressTrack);

    const setProgress = (ratio) => {
      progressWrap.hidden = false;
      progressWrap.classList.toggle("portal-insc-file-progress--indeterminate", ratio == null);
      if (ratio == null) {
        progressBar.style.width = "";
        progressLabel.textContent = "Téléversement en cours…";
      } else {
        const p = Math.min(100, Math.round(ratio * 100));
        progressBar.style.width = `${p}%`;
        progressLabel.textContent = `${p} %`;
      }
    };
    const clearProgress = () => {
      progressWrap.hidden = true;
      progressWrap.classList.remove("portal-insc-file-progress--indeterminate");
      progressBar.style.width = "0%";
    };

    function appendDocPreview(url, name, ct) {
      const docBox = document.createElement("div");
      docBox.className = "portal-insc-file-preview-doc";
      const badge = document.createElement("span");
      badge.className = "portal-insc-file-preview-badge";
      if (ct.includes("pdf")) badge.textContent = "PDF";
      else if (ct.startsWith("video/")) badge.textContent = "Vidéo";
      else badge.textContent = "Fichier";
      docBox.appendChild(badge);
      const cap = document.createElement("p");
      cap.className = "portal-insc-file-caption";
      cap.textContent = name;
      docBox.appendChild(cap);
      if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "portal-insc-file-preview-link";
        link.textContent = "Ouvrir ou télécharger";
        docBox.appendChild(link);
      } else {
        const p = document.createElement("p");
        p.className = "portal-insc-file-preview-missing-url";
        p.textContent =
          "Lien direct indisponible (configuration Supabase côté site). Le fichier reste enregistré sur le dossier.";
        docBox.appendChild(p);
      }
      previewHost.appendChild(docBox);
    }

    const refreshPreview = () => {
      previewHost.replaceChildren();
      const m = session.files[f.id];
      if (!m?.path) {
        previewHost.hidden = true;
        return;
      }
      previewHost.hidden = false;
      const url = portalPublicUploadUrl(m.path);
      const ct = String(m.contentType || "").toLowerCase();
      const name = m.name || "Document";
      if (url && ct.startsWith("image/")) {
        const img = document.createElement("img");
        img.className = "portal-insc-file-preview-img";
        img.alt = name;
        img.src = url;
        img.loading = "lazy";
        img.addEventListener("error", () => {
          previewHost.replaceChildren();
          appendDocPreview(url, name, ct);
        });
        previewHost.appendChild(img);
        const cap = document.createElement("p");
        cap.className = "portal-insc-file-caption";
        cap.textContent = name;
        previewHost.appendChild(cap);
      } else {
        appendDocPreview(url, name, ct);
      }
    };

    async function runUpload(file) {
      if (!file || !session?.submissionId) return;
      setProgress(0);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("field_id", f.id);
      const { ok, data } = await portalFormDataWithProgress(
        `/inscription/submissions/${session.submissionId}/upload`,
        fd,
        (ratio) => setProgress(ratio)
      );
      clearProgress();
      if (ok && data?.files && session) {
        session.files = data.files;
        if (data?.admin_field_flags && typeof data.admin_field_flags === "object") {
          session.admin_field_flags = data.admin_field_flags;
        }
        if (!Object.keys(session.admin_field_flags || {}).length) {
          await trySubmitFullDossierAfterCorrectionsDone();
          return;
        }
        flashDash(flashEl, "Fichier enregistré.", "ok");
        refreshModalEditors();
      } else {
        flashDash(flashEl, data?.error || "Envoi du fichier impossible.", "err");
      }
    }

    const pickId = `dash-insc-file-${f.id}${idSuffix}`;
    const pickLabel = document.createElement("label");
    pickLabel.className = "portal-insc-file-pick";
    pickLabel.htmlFor = pickId;
    const pickText = document.createElement("span");
    pickText.className = "portal-insc-file-pick__main";
    pickText.textContent = session.files[f.id]?.path ? "Remplacer le fichier" : "Choisir un fichier";
    pickLabel.appendChild(pickText);
    const inp = document.createElement("input");
    inp.type = "file";
    inp.id = pickId;
    inp.className = "portal-insc-file-input-native";
    inp.addEventListener("change", () => {
      const file = inp.files?.[0];
      inp.value = "";
      if (file) void runUpload(file);
    });
    pickLabel.appendChild(inp);
    const dropHint = document.createElement("p");
    dropHint.className = "portal-insc-file-drop-hint";
    dropHint.textContent = "Vous pouvez aussi glisser-déposer un fichier dans cette zone.";
    const dropZone = document.createElement("div");
    dropZone.className = "portal-insc-file-drop";
    dropZone.appendChild(pickLabel);
    dropZone.appendChild(dropHint);
    ["dragenter", "dragover"].forEach((evt) => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add("is-dragover");
      });
    });
    dropZone.addEventListener("dragleave", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rel = e.relatedTarget;
      if (!(rel instanceof Node) || !dropZone.contains(rel)) dropZone.classList.remove("is-dragover");
    });
    dropZone.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove("is-dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) void runUpload(file);
    });

    const btnDel = document.createElement("button");
    btnDel.type = "button";
    btnDel.className = "btn btn--ghost portal-insc-file-remove";
    btnDel.textContent = "Supprimer le document";
    btnDel.hidden = !session.files[f.id]?.path;
    btnDel.addEventListener("click", async () => {
      if (!session.files[f.id]?.path) return;
      if (!confirm("Retirer ce fichier du dossier ?")) return;
      const { ok, data } = await portalJson(`/inscription/submissions/${session.submissionId}/files/${f.id}`, {
        method: "DELETE",
      });
      if (ok && data?.files && session) {
        session.files = data.files;
        if (data?.admin_field_flags && typeof data.admin_field_flags === "object") {
          session.admin_field_flags = data.admin_field_flags;
        }
        if (!Object.keys(session.admin_field_flags || {}).length) {
          await trySubmitFullDossierAfterCorrectionsDone();
          return;
        }
        flashDash(flashEl, "Fichier retiré.", "ok");
        refreshModalEditors();
      } else {
        flashDash(flashEl, data?.error || "Suppression impossible.", "err");
      }
    });

    const actions = document.createElement("div");
    actions.className = "portal-insc-file-actions";
    actions.appendChild(dropZone);
    actions.appendChild(btnDel);
    refreshPreview();
    wrap.appendChild(previewHost);
    wrap.appendChild(progressWrap);
    wrap.appendChild(actions);
  }

  function renderModalBody() {
    if (!session) return;
    bodyEl.replaceChildren();
    const def = session.definition || { steps: [] };
    const fm = session.admin_field_flags || {};
    const ids = orderedAdminFlagFieldIds(def, fm);
    if (!ids.length) return;
    for (const fid of ids) {
      const meta = fieldMetaById(def, fid);
      if (!meta) continue;
      const sec = document.createElement("section");
      sec.className = "portal-insc-correction-item";
      const h = document.createElement("h3");
      h.className = "portal-insc-correction-item__title";
      h.textContent = (meta.label || "Question") + (meta.required ? " *" : "");
      const instr = document.createElement("p");
      instr.className = "portal-insc-correction-item__instr";
      instr.textContent = directionMessageForField(fid, session.admin_field_flags);
      const editor = document.createElement("div");
      editor.className = "portal-insc-correction-item__editor";
      appendFieldControls(editor, meta, "-dash");
      sec.append(h, instr, editor);
      bodyEl.appendChild(sec);
    }
  }

  async function openCorrectionsModal(submissionId) {
    flashDash(flashEl, "", "err");
    const { ok, data } = await portalJson(`/inscription/submissions/${submissionId}`);
    if (!ok || !data?.submission) {
      flashDash(flashEl, data?.error || "Dossier introuvable.", "err");
      return;
    }
    const s = data.submission;
    const fm = s.admin_field_flags && typeof s.admin_field_flags === "object" ? s.admin_field_flags : {};
    if (!Object.keys(fm).length) {
      const dec0 = s.review_decision || "none";
      if (s.status === "submitted" && dec0 === "a_completer") {
        window.location.href = `/compte/inscription?id=${encodeURIComponent(submissionId)}`;
        return;
      }
      flashDash(flashEl, "Aucune correction ciblée sur ce dossier — ouvrez le formulaire complet si l’équipe vous a demandé des compléments.", "err");
      return;
    }
    const dec = s.review_decision || "none";
    if (dec === "refuse" || dec === "accepte") {
      flashDash(flashEl, "Ce dossier ne peut plus être modifié depuis le portail.", "err");
      return;
    }
    session = {
      submissionId: s.id,
      definition: s.definition || { steps: [] },
      answers: { ...(s.answers || {}) },
      files: { ...(s.files || {}) },
      admin_field_flags: { ...fm },
      status: s.status,
    };
    renderModalBody();
    dialog.showModal();
  }

  dialog.addEventListener("close", () => {
    session = null;
    flashDash(flashEl, "", "err");
  });

  btnClose.addEventListener("click", () => dialog.close());

  btnSend.addEventListener("click", async () => {
    if (!session) return;
    btnSend.disabled = true;
    const syncRes = await portalJson(`/inscription/submissions/${session.submissionId}`);
    btnSend.disabled = false;
    if (!syncRes.ok || !syncRes.data?.submission) {
      flashDash(flashEl, syncRes.data?.error || "Impossible de synchroniser le dossier.", "err");
      return;
    }
    const srv = syncRes.data.submission;
    const decSync = srv.review_decision || "none";
    if (decSync === "refuse" || decSync === "accepte") {
      flashDash(flashEl, "Ce dossier ne peut plus être modifié depuis le portail.", "err");
      return;
    }
    const serverFm =
      srv.admin_field_flags && typeof srv.admin_field_flags === "object" ? { ...srv.admin_field_flags } : {};
    session.admin_field_flags = serverFm;
    session.status = srv.status;
    if (srv.definition && typeof srv.definition === "object") {
      session.definition = srv.definition;
    }
    if (srv.files && typeof srv.files === "object") {
      session.files = { ...srv.files };
    }

    if (!Object.keys(serverFm).length) {
      session.admin_field_flags = serverFm;
      await trySubmitFullDossierAfterCorrectionsDone();
      return;
    }

    const def = session.definition || { steps: [] };
    const missing = [];
    for (const fid of Object.keys(serverFm)) {
      const meta = fieldMetaById(def, fid);
      if (!meta || meta.kind !== "field") continue;
      if (isPortalFieldFilled(meta, session.answers, session.files)) continue;
      const msg = portalFieldMissingMessage({ ...meta, required: true }, session.answers, session.files);
      if (msg) missing.push(msg);
    }
    if (missing.length) {
      flashDash(
        flashEl,
        `Complétez d’abord les champs demandés :\n${missing.map((m) => `• ${m}`).join("\n")}`,
        "err"
      );
      refreshModalEditors();
      return;
    }
    const patch = {};
    for (const fid of Object.keys(serverFm)) {
      patch[fid] = session.answers[fid];
    }
    btnSend.disabled = true;
    const { ok, data } = await portalJson(`/inscription/submissions/${session.submissionId}`, {
      method: "PUT",
      body: JSON.stringify({ answers: patch }),
    });
    btnSend.disabled = false;
    if (!ok) {
      flashDash(
        flashEl,
        data?.error || "Enregistrement impossible — actualisez la page ou rouvrez la fenêtre.",
        "err"
      );
      refreshModalEditors();
      return;
    }
    const nextFlags =
      data?.admin_field_flags && typeof data.admin_field_flags === "object"
        ? data.admin_field_flags
        : session.admin_field_flags;
    session.admin_field_flags = nextFlags;

    if (Object.keys(session.admin_field_flags || {}).length > 0) {
      flashDash(flashEl, "Partie enregistrée. Vérifiez les champs restants.", "ok");
      renderModalBody();
      return;
    }

    await trySubmitFullDossierAfterCorrectionsDone();
  });

  return { openCorrectionsModal };
}
