import "../scss/main.scss";
import "../scss/portal.scss";
import {
  requirePortalSession,
  portalJson,
  portalLogout,
  portalFormDataWithProgress,
  portalPublicUploadUrl,
} from "./modules/portal-api.js";
import { FORMATION_META, FORMATION_LABELS, FORMATION_SHORT_LABELS } from "./modules/formation-city-detail.js";
import {
  missingRequiredMessagesForStep,
  missingRequiredMessagesAllSteps,
  portalFieldMissingMessage,
  isPortalFieldFilled,
  isPortalFieldMandatory,
} from "./modules/inscription-portal-validation.js";

const FOCUS_PARAM_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PORTAL_IDENTITY_STEP_ID = "portal_step_identite";

function missingFlaggedRequiredMessagesForStep(step, answers, files, adminFlags) {
  const missing = [];
  const marks = adminFlags && typeof adminFlags === "object" ? adminFlags : {};
  for (const b of step.blocks || []) {
    if (b.kind !== "field") continue;
    const flagged = Object.prototype.hasOwnProperty.call(marks, b.id);
    if (!flagged && !isPortalFieldMandatory(b)) continue;
    if (isPortalFieldFilled(b, answers, files)) continue;
    const msg = portalFieldMissingMessage(
      flagged ? { ...b, required: true } : b,
      answers,
      files
    );
    if (msg) missing.push(msg);
  }
  return missing;
}

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

function formationLabel(slug) {
  return FORMATION_SHORT_LABELS[slug] || FORMATION_LABELS[slug] || slug;
}

function getPairsGrouped() {
  const bySlug = new Map();
  for (const key of Object.keys(FORMATION_META)) {
    const pipe = key.indexOf("|");
    const slug = key.slice(0, pipe);
    const ville = key.slice(pipe + 1);
    if (!bySlug.has(slug)) bySlug.set(slug, []);
    bySlug.get(slug).push({ key, slug, ville });
  }
  return bySlug;
}

document.addEventListener("DOMContentLoaded", async () => {
  const me = await requirePortalSession();
  if (!me?.email) return;

  document.getElementById("portal-logout")?.addEventListener("click", () => void portalLogout());

  const flashEl = document.getElementById("insc-flash");
  const pickEl = document.getElementById("insc-pick");
  const flowEl = document.getElementById("insc-flow");
  const selForm = document.getElementById("insc-formation");
  const selVille = document.getElementById("insc-ville");
  const btnStart = document.getElementById("insc-start");
  const deadlineEl = document.getElementById("insc-deadline");
  const btnBackPick = document.getElementById("insc-back-pick");
  const stepTitleEl = document.getElementById("insc-step-title");
  const stepBodyEl = document.getElementById("insc-step-body");
  const btnPrev = document.getElementById("insc-prev");
  const btnNext = document.getElementById("insc-next");
  const btnSubmit = document.getElementById("insc-submit");
  const btnSaveExit = document.getElementById("insc-save-exit");
  const progressTrack = document.getElementById("insc-progress-track");
  const progressLabel = document.getElementById("insc-progress-label");
  const reviewBanner = document.getElementById("insc-review-banner");
  const reviewTitle = document.getElementById("insc-review-title");
  const reviewToggle = document.getElementById("insc-review-toggle");
  const reviewPanel = document.getElementById("insc-review-panel");
  const reviewLead = document.getElementById("insc-review-lead");
  const reviewMessage = document.getElementById("insc-review-message");
  const reviewVoided = document.getElementById("insc-review-voided");
  const reviewMissing = document.getElementById("insc-review-missing");
  const reviewOpenCorrections = document.getElementById("insc-review-open-corrections");
  const correctionsDialog = document.getElementById("insc-corrections-dialog");
  const correctionsDialogBody = document.getElementById("insc-corrections-dialog-body");
  const correctionsDialogSave = document.getElementById("insc-corrections-save");
  const correctionsDialogClose = document.getElementById("insc-corrections-close");

  const grouped = getPairsGrouped();
  const slugs = [...grouped.keys()].sort((a, b) =>
    formationLabel(a).localeCompare(formationLabel(b), "fr")
  );
  selForm.appendChild(new Option("— Choisir —", "", true, true));
  for (const slug of slugs) {
    selForm.appendChild(new Option(formationLabel(slug), slug));
  }

  function updateDeadlineDisplay() {
    if (!deadlineEl) return;
    const slug = selForm.value;
    const ville = selVille.value;
    if (!slug || !ville) {
      deadlineEl.hidden = true;
      deadlineEl.textContent = "";
      return;
    }
    const meta = FORMATION_META[`${slug}|${ville}`];
    const raw = meta?.deadline != null ? String(meta.deadline).trim() : "";
    deadlineEl.hidden = false;
    deadlineEl.replaceChildren();
    const villeStrong = document.createElement("strong");
    villeStrong.className = "portal-insc-deadline-city";
    villeStrong.textContent = ville;
    deadlineEl.appendChild(villeStrong);
    deadlineEl.appendChild(document.createTextNode(" — "));
    if (raw) {
      deadlineEl.appendChild(
        document.createTextNode("Date limite d’inscription : ")
      );
      const dateStrong = document.createElement("strong");
      dateStrong.textContent = raw;
      deadlineEl.appendChild(dateStrong);
    } else {
      const muted = document.createElement("span");
      muted.className = "portal-insc-deadline--muted";
      muted.textContent =
        "Date limite d’inscription : non indiquée pour cette session.";
      deadlineEl.appendChild(muted);
    }
  }

  function refreshVilles() {
    selVille.innerHTML = "";
    const slug = selForm.value;
    if (!slug) {
      selVille.appendChild(new Option("— D’abord la formation —", "", true, true));
      updateDeadlineDisplay();
      return;
    }
    const villes = grouped.get(slug) || [];
    selVille.appendChild(new Option("— Choisir —", "", true, true));
    for (const { ville } of villes) {
      selVille.appendChild(new Option(ville, ville));
    }
    updateDeadlineDisplay();
  }

  selForm.addEventListener("change", () => refreshVilles());
  selVille.addEventListener("change", () => updateDeadlineDisplay());
  refreshVilles();

  let state = {
    submissionId: null,
    templateId: null,
    formation_slug: "",
    ville_slug: "",
    definition: { steps: [] },
    answers: {},
    files: {},
    currentStepIndex: 0,
    progress_percent: 0,
    status: "draft",
    review_decision: "none",
    review_message_candidat: "",
    admin_field_flags: {},
  };

  let surfaceAfterFieldEdit = null;

  function orderedAdminFlagFieldIds() {
    const marks = state.admin_field_flags && typeof state.admin_field_flags === "object" ? state.admin_field_flags : {};
    const keySet = new Set(Object.keys(marks));
    const out = [];
    for (const step of state.definition?.steps || []) {
      for (const b of step.blocks || []) {
        if (b.kind === "field" && keySet.has(b.id)) out.push(b.id);
      }
    }
    for (const k of Object.keys(marks)) {
      if (!out.includes(k)) out.push(k);
    }
    return out;
  }

  function adminFlagsNonEmpty() {
    return orderedAdminFlagFieldIds().length > 0;
  }

  function directionMessageForField(fid) {
    const mark = state.admin_field_flags?.[fid];
    if (!mark || typeof mark !== "object") return "Merci de mettre ce champ à jour.";
    const msg = mark.message != null ? String(mark.message).trim() : "";
    if (msg) return msg;
    if (mark.reason && String(mark.reason) !== "annulation_admin") {
      return `Motif (administration) : ${mark.reason}`;
    }
    return "Merci de mettre ce champ à jour.";
  }

  function stepIndexForFieldFromDef(def, fieldId) {
    if (!fieldId || !def?.steps) return 0;
    const steps = def.steps;
    for (let i = 0; i < steps.length; i++) {
      if ((steps[i].blocks || []).some((b) => b.kind === "field" && b.id === fieldId)) return i;
    }
    return 0;
  }

  function correctionsPendingState() {
    const marks = state.admin_field_flags && typeof state.admin_field_flags === "object" ? state.admin_field_flags : {};
    return Object.keys(marks).length > 0 || (state.review_decision || "none") === "a_completer";
  }

  function scrollToInscriptionField(fieldId) {
    if (!fieldId || !stepBodyEl) return;
    requestAnimationFrame(() => {
      const target = stepBodyEl.querySelector(`[data-insc-field-id="${fieldId}"]`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  function fieldMetaById(fieldId) {
    const steps = state.definition?.steps || [];
    for (const step of steps) {
      for (const b of step.blocks || []) {
        if (b.kind === "field" && b.id === fieldId) return b;
      }
    }
    return null;
  }

  function updateReviewBannerUi() {
    if (!reviewBanner || !reviewTitle) return;
    const marks = state.admin_field_flags && typeof state.admin_field_flags === "object" ? state.admin_field_flags : {};
    const markIds = Object.keys(marks);
    const dec = state.review_decision || "none";
    const show =
      (state.status === "draft" &&
        (dec === "a_completer" || dec === "refuse" || markIds.length > 0)) ||
      (state.status === "submitted" &&
        dec !== "refuse" &&
        dec !== "accepte" &&
        (markIds.length > 0 || dec === "a_completer"));
    if (!show) {
      reviewBanner.hidden = true;
      if (reviewPanel) reviewPanel.hidden = true;
      if (reviewOpenCorrections) reviewOpenCorrections.hidden = true;
      return;
    }
    if (reviewOpenCorrections) {
      reviewOpenCorrections.hidden = !markIds.length || dec === "refuse";
    }
    reviewBanner.hidden = false;
    if (dec === "a_completer") {
      reviewTitle.textContent = "À compléter — merci de reprendre votre dossier";
      reviewBanner.classList.add("portal-insc-review-banner--urgent");
      reviewBanner.classList.remove("portal-insc-review-banner--refused");
    } else if (dec === "refuse") {
      reviewTitle.textContent = "Décision : dossier refusé";
      reviewBanner.classList.remove("portal-insc-review-banner--urgent");
      reviewBanner.classList.add("portal-insc-review-banner--refused");
    } else {
      reviewTitle.textContent = "Des éléments de votre dossier doivent être corrigés";
      reviewBanner.classList.add("portal-insc-review-banner--urgent");
      reviewBanner.classList.remove("portal-insc-review-banner--refused");
    }
    if (reviewLead) {
      reviewLead.textContent =
        dec === "a_completer"
          ? "L’équipe vous demande de compléter ou corriger des informations. Utilisez le détail ci-dessous puis enregistrez chaque étape."
          : dec === "refuse"
            ? "Vous trouverez ci-dessous le message associé à cette décision."
            : "Les champs signalés en rouge ont été annulés ou doivent être renvoyés.";
    }
    if (reviewMessage) {
      const msg = (state.review_message_candidat || "").trim();
      if (msg) {
        reviewMessage.hidden = false;
        reviewMessage.textContent = msg;
      } else {
        reviewMessage.hidden = true;
        reviewMessage.textContent = "";
      }
    }
    if (reviewVoided) {
      reviewVoided.replaceChildren();
      if (markIds.length) {
        const h = document.createElement("h3");
        h.className = "portal-insc-review-subtitle";
        h.textContent = "Champs concernés (réponse à renvoyer)";
        reviewVoided.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "portal-insc-review-list";
        for (const fid of orderedAdminFlagFieldIds()) {
          const meta = fieldMetaById(fid);
          const label = meta?.label || "Question";
          const si = stepIndexForFieldFromDef(state.definition, fid);
          const stepTit =
            si >= 0 ? state.definition.steps[si]?.title || `Étape ${si + 1}` : "Étape";
          const li = document.createElement("li");
          const mainLine = document.createElement("span");
          mainLine.textContent =
            (state.definition.steps?.length > 1 ? `${stepTit} — ` : "") + `« ${label} »`;
          li.appendChild(mainLine);
          const consigne = document.createElement("span");
          consigne.className = "portal-insc-review-consigne";
          consigne.textContent = directionMessageForField(fid);
          li.appendChild(consigne);
          ul.appendChild(li);
        }
        reviewVoided.appendChild(ul);
      }
    }
    if (reviewMissing) {
      reviewMissing.replaceChildren();
      const missing = missingRequiredMessagesAllSteps(state.definition, state.answers, state.files);
      if (missing.length) {
        const h = document.createElement("h3");
        h.className = "portal-insc-review-subtitle";
        h.textContent = "Champs obligatoires encore vides sur l’ensemble du formulaire";
        reviewMissing.appendChild(h);
        const ul = document.createElement("ul");
        ul.className = "portal-insc-review-list";
        for (const m of missing) {
          const li = document.createElement("li");
          li.textContent = m;
          ul.appendChild(li);
        }
        reviewMissing.appendChild(ul);
      }
    }
  }

  reviewToggle?.addEventListener("click", () => {
    if (!reviewPanel) return;
    const open = reviewPanel.hidden;
    reviewPanel.hidden = !open;
    reviewToggle.textContent = open
      ? "Masquer le détail"
      : "Voir les consignes et ce qui manque";
  });

  reviewOpenCorrections?.addEventListener("click", () => {
    if (!adminFlagsNonEmpty() || (state.status !== "draft" && state.status !== "submitted")) return;
    openCorrectionsDialogIfNeeded();
  });

  correctionsDialog?.addEventListener("close", () => {
    surfaceAfterFieldEdit = null;
  });

  correctionsDialogSave?.addEventListener("click", async () => {
    await saveAnswers(false);
    if (!adminFlagsNonEmpty()) {
      correctionsDialog?.close();
      renderStep();
      updateReviewBannerUi();
      updateProgressUi();
      updateSubmitBtnState();
    } else renderCorrectionsModalContent();
  });

  correctionsDialogClose?.addEventListener("click", () => correctionsDialog?.close());

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveAnswers(false), 550);
  }

  function afterPortalFollowupDone(data) {
    if (!data?.dossier_mis_a_jour_pour_equipe) return;
    if (state.status === "submitted" && data?.review_decision) state.review_decision = data.review_decision;
    flash(
      flashEl,
      "C’est enregistré : les nouvelles informations remplacent les précédentes en base. L’équipe voit votre dossier comme prêt à être vérifié à nouveau.",
      "ok"
    );
    window.location.href = "/compte/tableau-de-bord";
  }

  /** Dossier transmis sans champ signalé : renvoie la version complète (équivalent « Envoyer le formulaire »). */
  async function tryResubmitFullInscriptionAfterCorrections() {
    if (state.status !== "submitted" || adminFlagsNonEmpty()) return false;
    const subRes = await portalJson(`/inscription/submissions/${state.submissionId}/submit`, {
      method: "POST",
      body: "{}",
    });
    if (!subRes.ok) {
      flash(
        flashEl,
        subRes.data?.error ||
          "Le renvoi du dossier complet a échoué. Vérifiez que tous les champs obligatoires sont remplis sur l’ensemble du formulaire, puis réessayez.",
        "err"
      );
      return false;
    }
    flash(
      flashEl,
      "C’est fait : le dossier complet a été renvoyé à l’équipe. Inutile d’enchaîner les étapes ni de recliquer sur « Envoyer le formulaire ».",
      "ok"
    );
    window.location.href = "/compte/tableau-de-bord";
    return true;
  }

  /** @returns {Promise<boolean>} true si redirection immédiate (relance terminée) */
  async function saveAnswers(silent) {
    if (!state.submissionId) return false;
    if (state.status === "draft") {
      const { ok, data } = await portalJson(`/inscription/submissions/${state.submissionId}`, {
        method: "PUT",
        body: JSON.stringify({
          answers: state.answers,
          current_step_index: state.currentStepIndex,
        }),
      });
      if (ok) {
        if (typeof data?.progress_percent === "number") state.progress_percent = data.progress_percent;
        if (data?.admin_field_flags && typeof data.admin_field_flags === "object") {
          state.admin_field_flags = data.admin_field_flags;
        }
        if (data?.review_decision) state.review_decision = data.review_decision;
        updateReviewBannerUi();
        updateProgressUi();
      } else if (!silent) {
        flash(flashEl, data?.error || "Enregistrement impossible.", "err");
      }
      return false;
    }
    if (state.status !== "submitted") return false;
    const rd = state.review_decision || "none";
    const fullSubmittedEdit =
      !adminFlagsNonEmpty() && (rd === "a_completer" || rd === "pending" || rd === "none");

    if (adminFlagsNonEmpty()) {
      const patch = {};
      for (const fid of Object.keys(state.admin_field_flags)) {
        patch[fid] = state.answers[fid];
      }
      const { ok, data } = await portalJson(`/inscription/submissions/${state.submissionId}`, {
        method: "PUT",
        body: JSON.stringify({ answers: patch }),
      });
      if (ok) {
        if (typeof data?.progress_percent === "number") state.progress_percent = data.progress_percent;
        if (data?.admin_field_flags && typeof data.admin_field_flags === "object") {
          state.admin_field_flags = data.admin_field_flags;
        }
        if (data?.review_decision) state.review_decision = data.review_decision;
        updateReviewBannerUi();
        updateProgressUi();
        if (!adminFlagsNonEmpty()) {
          if (silent) return false;
          if (await tryResubmitFullInscriptionAfterCorrections()) return true;
        }
      } else if (!silent) {
        flash(flashEl, data?.error || "Enregistrement impossible.", "err");
      }
      return false;
    }
    if (fullSubmittedEdit) {
      const { ok, data } = await portalJson(`/inscription/submissions/${state.submissionId}`, {
        method: "PUT",
        body: JSON.stringify({
          answers: state.answers,
          current_step_index: state.currentStepIndex,
        }),
      });
      if (ok) {
        if (typeof data?.progress_percent === "number") state.progress_percent = data.progress_percent;
        if (data?.admin_field_flags && typeof data.admin_field_flags === "object") {
          state.admin_field_flags = data.admin_field_flags;
        }
        if (data?.review_decision) state.review_decision = data.review_decision;
        updateReviewBannerUi();
        updateProgressUi();
        afterPortalFollowupDone(data);
        if (data?.dossier_mis_a_jour_pour_equipe) return true;
      } else if (!silent) {
        flash(flashEl, data?.error || "Enregistrement impossible.", "err");
      }
      return false;
    }
    return false;
  }

  /** Avancement : complétion réelle si corrections demandées, sinon position dans les étapes. */
  function updateProgressUi() {
    const steps = state.definition?.steps || [];
    const n = Math.max(1, steps.length);
    const idx = Math.min(Math.max(0, state.currentStepIndex), n - 1);
    let pct;
    if (state.status === "submitted" && adminFlagsNonEmpty()) {
      pct = Math.max(0, Math.min(100, Math.round(Number(state.progress_percent) || 0)));
      progressLabel.textContent = `Corrections sur dossier transmis — environ ${pct} % complété`;
      progressTrack.dataset.mode = "completion";
    } else if (
      state.status === "submitted" &&
      !adminFlagsNonEmpty() &&
      ["a_completer", "pending", "none"].includes(state.review_decision || "none")
    ) {
      pct = Math.max(0, Math.min(100, Math.round(Number(state.progress_percent) || 0)));
      progressLabel.textContent = `Dossier transmis — mise à jour — environ ${pct} % complété`;
      progressTrack.dataset.mode = "completion";
    } else if (state.status === "draft" && correctionsPendingState()) {
      pct = Math.max(0, Math.min(100, Math.round(Number(state.progress_percent) || 0)));
      progressLabel.textContent = `Dossier à finaliser — environ ${pct} % complété`;
      progressTrack.dataset.mode = "completion";
    } else {
      pct = Math.min(100, Math.round(((idx + 1) / n) * 100));
      progressLabel.textContent = `Étape ${idx + 1} sur ${n} — ${pct} %`;
      progressTrack.dataset.mode = "steps";
    }
    progressTrack.style.setProperty("--pct", `${pct}%`);
    progressTrack.dataset.tier = pct >= 85 ? "high" : pct >= 40 ? "mid" : "low";
  }

  /** Sur la dernière étape : activer « Envoyer » seulement si tout le formulaire est validable. */
  function updateSubmitBtnState() {
    const steps = state.definition?.steps || [];
    if (state.status === "submitted") {
      const rd = state.review_decision || "none";
      const onLast = steps.length > 0 && state.currentStepIndex >= steps.length - 1;
      const allowResubmit =
        !adminFlagsNonEmpty() && ["a_completer", "pending", "none"].includes(rd);
      if (allowResubmit && onLast) {
        const missing = missingRequiredMessagesAllSteps(state.definition, state.answers, state.files);
        btnSubmit.disabled = missing.length > 0;
        if (missing.length) {
          btnSubmit.setAttribute(
            "title",
            "Remplissez tous les champs obligatoires (*) puis confirmez pour renvoyer votre dossier à l’équipe."
          );
        } else {
          btnSubmit.removeAttribute("title");
        }
        return;
      }
      btnSubmit.disabled = true;
      btnSubmit.removeAttribute("title");
      return;
    }
    if (!state.submissionId || state.status !== "draft" || !steps.length) {
      btnSubmit.disabled = true;
      btnSubmit.removeAttribute("title");
      return;
    }
    const onLast = state.currentStepIndex >= steps.length - 1;
    if (!onLast) {
      btnSubmit.disabled = true;
      btnSubmit.removeAttribute("title");
      return;
    }
    if (adminFlagsNonEmpty()) {
      btnSubmit.disabled = true;
      btnSubmit.setAttribute(
        "title",
        "Corrigez d’abord les champs signalés par l’équipe (panneau « Corrections demandées ») avant d’envoyer le dossier."
      );
      return;
    }
    const missing = missingRequiredMessagesAllSteps(state.definition, state.answers, state.files);
    const complete = missing.length === 0;
    btnSubmit.disabled = !complete;
    if (complete) btnSubmit.removeAttribute("title");
    else
      btnSubmit.setAttribute(
        "title",
        "Remplissez tous les champs obligatoires (*) sur chaque étape pour envoyer le dossier."
      );
  }

  function showPick() {
    pickEl.hidden = false;
    flowEl.hidden = true;
    history.replaceState(
      null,
      "",
      "/compte/inscription"
    );
  }

  function showFlow() {
    pickEl.hidden = true;
    flowEl.hidden = false;
  }

  async function loadSubmission(subId) {
    const { ok, data } = await portalJson(`/inscription/submissions/${subId}`);
    if (!ok || !data?.submission) {
      flash(flashEl, data?.error || "Dossier introuvable.", "err");
      return false;
    }
    const s = data.submission;
    const fmLoaded = s.admin_field_flags && typeof s.admin_field_flags === "object" ? s.admin_field_flags : {};
    const rd = s.review_decision || "none";

    if (s.status === "submitted") {
      if (rd === "refuse") {
        flash(
          flashEl,
          "Ce dossier a été refusé. Vous ne pouvez plus le modifier. Pour postuler à nouveau, créez un nouveau dossier (autre formation ou ville, ou contactez l’équipe).",
          "err"
        );
        showPick();
        return false;
      }
      if (rd === "accepte") {
        flash(flashEl, "Ce dossier a été accepté. Il n’est plus modifiable.", "ok");
        showPick();
        return false;
      }
      if (
        !Object.keys(fmLoaded).length &&
        rd !== "a_completer" &&
        rd !== "pending" &&
        rd !== "none"
      ) {
        flash(flashEl, "Ce dossier a déjà été envoyé et n’est plus modifiable depuis le portail dans cet état.", "ok");
        showPick();
        return false;
      }

      const urlFocusSub = new URLSearchParams(window.location.search).get("focus");
      const fromUrlSub =
        urlFocusSub && FOCUS_PARAM_RE.test(String(urlFocusSub).trim())
          ? String(urlFocusSub).trim()
          : null;
      const focusIdSub = fromUrlSub || s.correction_focus_field_id || null;
      const defSub = s.definition || { steps: [] };
      let stepIdxSub = s.current_step_index || 0;
      if (focusIdSub) {
        stepIdxSub = stepIndexForFieldFromDef(defSub, focusIdSub);
      }
      state = {
        submissionId: s.id,
        templateId: s.template_id,
        formation_slug: s.formation_slug,
        ville_slug: s.ville_slug,
        definition: defSub,
        answers: { ...s.answers },
        files: { ...s.files },
        currentStepIndex: stepIdxSub,
        progress_percent: s.progress_percent || 0,
        status: s.status,
        review_decision: rd,
        review_message_candidat: s.review_message_candidat || "",
        admin_field_flags: { ...fmLoaded },
      };
      showFlow();
      updateProgressUi();
      updateReviewBannerUi();
      renderStep();
      history.replaceState(
        null,
        "",
        `/compte/inscription?id=${encodeURIComponent(subId)}${
          focusIdSub ? `&focus=${encodeURIComponent(focusIdSub)}` : ""
        }`
      );
      if (focusIdSub) scrollToInscriptionField(focusIdSub);
      openCorrectionsDialogIfNeeded();
      flash(
        flashEl,
        Object.keys(fmLoaded).length
          ? "Dossier transmis : seuls les champs que l’équipe a signalés sont modifiables. Chaque champ correctement complété est enregistré en base et n’est plus marqué comme à corriger."
          : rd === "a_completer"
            ? "L’équipe vous demande de compléter ce dossier déjà transmis. Vos réponses remplacent les précédentes dans la base à chaque enregistrement."
            : "Dossier transmis : vous pouvez mettre à jour vos réponses (elles remplacent les précédentes à chaque enregistrement). À la fin, utilisez « Envoyer » pour signaler une nouvelle version à l’équipe.",
        "ok"
      );
      return true;
    }

    const urlFocus = new URLSearchParams(window.location.search).get("focus");
    const fromUrl =
      urlFocus && FOCUS_PARAM_RE.test(String(urlFocus).trim()) ? String(urlFocus).trim() : null;
    const focusId = fromUrl || s.correction_focus_field_id || null;
    const def = s.definition || { steps: [] };
    let stepIdx = s.current_step_index || 0;
    if (focusId) {
      stepIdx = stepIndexForFieldFromDef(def, focusId);
    }
    state = {
      submissionId: s.id,
      templateId: s.template_id,
      formation_slug: s.formation_slug,
      ville_slug: s.ville_slug,
      definition: def,
      answers: { ...s.answers },
      files: { ...s.files },
      currentStepIndex: stepIdx,
      progress_percent: s.progress_percent || 0,
      status: s.status,
      review_decision: s.review_decision || "none",
      review_message_candidat: s.review_message_candidat || "",
      admin_field_flags: s.admin_field_flags && typeof s.admin_field_flags === "object" ? { ...s.admin_field_flags } : {},
    };
    showFlow();
    updateProgressUi();
    updateReviewBannerUi();
    renderStep();
    history.replaceState(
      null,
      "",
      `/compte/inscription?id=${encodeURIComponent(subId)}${
        focusId ? `&focus=${encodeURIComponent(focusId)}` : ""
      }`
    );
    if (focusId) scrollToInscriptionField(focusId);
    openCorrectionsDialogIfNeeded();
    return true;
  }

  async function startFlow() {
    const formation_slug = selForm.value;
    const ville_slug = selVille.value;
    if (!formation_slug || !ville_slug) {
      flash(flashEl, "Choisissez une formation et une ville.", "err");
      return;
    }
    flash(flashEl, "", "ok");
    const tRes = await portalJson(
      `/inscription/template?formation=${encodeURIComponent(formation_slug)}&ville=${encodeURIComponent(ville_slug)}`
    );
    if (!tRes.ok || !tRes.data?.template) {
      flash(
        flashEl,
        tRes.data?.error ||
          "Aucun formulaire publié pour ce couple formation / ville. Le directeur doit publier un modèle dans la console admin.",
        "err"
      );
      return;
    }
    const templateId = tRes.data.template.id;
    const { ok, data } = await portalJson("/inscription/start", {
      method: "POST",
      body: JSON.stringify({ template_id: templateId, formation_slug, ville_slug }),
    });
    if (!ok || !data?.submission) {
      flash(flashEl, data?.error || "Impossible d’ouvrir le dossier.", "err");
      return;
    }
    const sub = data.submission;
    const focusId = sub.correction_focus_field_id || null;
    const def = sub.definition || { steps: [] };
    let stepIdx = sub.current_step_index || 0;
    if (focusId) {
      stepIdx = stepIndexForFieldFromDef(def, focusId);
    }
    state = {
      submissionId: sub.id,
      templateId,
      formation_slug,
      ville_slug,
      definition: def,
      answers: { ...sub.answers },
      files: { ...sub.files },
      currentStepIndex: stepIdx,
      progress_percent: sub.progress_percent || 0,
      status: "draft",
      review_decision: sub.review_decision || "none",
      review_message_candidat: sub.review_message_candidat || "",
      admin_field_flags: sub.admin_field_flags && typeof sub.admin_field_flags === "object" ? { ...sub.admin_field_flags } : {},
    };
    updateProgressUi();
    updateReviewBannerUi();
    renderStep();
    showFlow();
    history.replaceState(
      null,
      "",
      `/compte/inscription?id=${encodeURIComponent(state.submissionId)}${
        focusId ? `&focus=${encodeURIComponent(focusId)}` : ""
      }`
    );
    if (focusId) scrollToInscriptionField(focusId);
    openCorrectionsDialogIfNeeded();
  }

  function setAnswer(fieldId, value) {
    state.answers[fieldId] = value;
    scheduleSave();
    updateSubmitBtnState();
    surfaceAfterFieldEdit?.();
  }

  function toggleMulti(fieldId, opt, checked) {
    const cur = Array.isArray(state.answers[fieldId]) ? [...state.answers[fieldId]] : [];
    const i = cur.indexOf(opt);
    if (checked && i === -1) cur.push(opt);
    if (!checked && i >= 0) cur.splice(i, 1);
    state.answers[fieldId] = cur;
    scheduleSave();
    updateSubmitBtnState();
    surfaceAfterFieldEdit?.();
  }

  function renderCorrectionsModalContent() {
    if (!correctionsDialogBody) return;
    correctionsDialogBody.replaceChildren();
    for (const fid of orderedAdminFlagFieldIds()) {
      const meta = fieldMetaById(fid);
      if (!meta) continue;
      const sec = document.createElement("section");
      sec.className = "portal-insc-correction-item";
      const h = document.createElement("h3");
      h.className = "portal-insc-correction-item__title";
      h.textContent = (meta.label || "Question") + (isPortalFieldMandatory(meta) ? " *" : "");
      const instr = document.createElement("p");
      instr.className = "portal-insc-correction-item__instr";
      instr.textContent = directionMessageForField(fid);
      const editor = document.createElement("div");
      editor.className = "portal-insc-correction-item__editor";
      appendInscriptionFieldControls(editor, meta, "-modal");
      sec.append(h, instr, editor);
      correctionsDialogBody.appendChild(sec);
    }
  }

  function openCorrectionsDialogIfNeeded() {
    if (!correctionsDialog || !adminFlagsNonEmpty()) return;
    if (state.status !== "draft" && state.status !== "submitted") return;
    renderCorrectionsModalContent();
    surfaceAfterFieldEdit = () => {
      renderStep();
      updateReviewBannerUi();
      updateProgressUi();
      updateSubmitBtnState();
    };
    correctionsDialog.showModal();
  }

  function appendInscriptionFieldControls(wrap, f, idSuffix = "") {
    const fieldLocked =
      state.status === "submitted" && adminFlagsNonEmpty() && !state.admin_field_flags?.[f.id];
    const root = document.createElement(fieldLocked ? "fieldset" : "div");
    if (fieldLocked) {
      root.disabled = true;
      root.className = "portal-insc-field-controls portal-insc-field-controls--locked";
    } else {
      root.className = "portal-insc-field-controls";
    }

    if (f.type === "text") {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.className = "portal-input";
      inp.value = state.answers[f.id] ?? "";
      inp.addEventListener("input", () => setAnswer(f.id, inp.value));
      root.appendChild(inp);
    } else if (f.type === "number") {
      const inp = document.createElement("input");
      inp.type = "text";
      inp.inputMode = "numeric";
      inp.autocomplete = "off";
      inp.className = "portal-input";
      inp.placeholder = "Saisissez un nombre";
      inp.value = state.answers[f.id] ?? "";
      inp.addEventListener("input", () => setAnswer(f.id, inp.value));
      root.appendChild(inp);
    } else if (f.type === "textarea") {
      const ta = document.createElement("textarea");
      ta.className = "portal-input";
      ta.rows = 4;
      ta.value = state.answers[f.id] ?? "";
      ta.addEventListener("input", () => setAnswer(f.id, ta.value));
      root.appendChild(ta);
    } else if (f.type === "yesno") {
      const row = document.createElement("div");
      row.className = "portal-insc-btn-row";
      const val = state.answers[f.id];
      for (const opt of ["oui", "non"]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn--choice" + (val === opt ? " is-selected" : "");
        b.textContent = opt === "oui" ? "Oui" : "Non";
        b.addEventListener("click", () => {
          setAnswer(f.id, opt);
          if (idSuffix === "-modal") renderCorrectionsModalContent();
          else renderStep();
        });
        row.appendChild(b);
      }
      root.appendChild(row);
    } else if (f.type === "binary") {
      const row = document.createElement("div");
      row.className = "portal-insc-btn-row";
      const val = state.answers[f.id];
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
          if (idSuffix === "-modal") renderCorrectionsModalContent();
          else renderStep();
        });
        row.appendChild(b);
      }
      root.appendChild(row);
    } else if (f.type === "single") {
      const row = document.createElement("div");
      row.className = "portal-insc-btn-row";
      const opts = f.options || [];
      const val = state.answers[f.id];
      for (const opt of opts) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "btn btn--choice" + (val === opt ? " is-selected" : "");
        b.textContent = opt;
        b.addEventListener("click", () => {
          setAnswer(f.id, opt);
          if (idSuffix === "-modal") renderCorrectionsModalContent();
          else renderStep();
        });
        row.appendChild(b);
      }
      root.appendChild(row);
    } else if (f.type === "multi") {
      const opts = f.options || [];
      const cur = Array.isArray(state.answers[f.id]) ? state.answers[f.id] : [];
      for (const opt of opts) {
        const row = document.createElement("label");
        row.className = "portal-insc-check";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = cur.includes(opt);
        cb.addEventListener("change", () => toggleMulti(f.id, opt, cb.checked));
        row.appendChild(cb);
        row.appendChild(document.createTextNode(" " + opt));
        root.appendChild(row);
      }
    } else if (f.type === "file") {
      attachInscriptionFileField(root, f, idSuffix);
    }
    wrap.appendChild(root);
  }

  /** Pièces jointes : aperçu, barre de progression au téléversement, dépôt, suppression. */
  function attachInscriptionFileField(wrap, f, idSuffix = "") {
    const fileLocked =
      state.status === "submitted" && adminFlagsNonEmpty() && !state.admin_field_flags?.[f.id];
    if (fileLocked) {
      const previewHost = document.createElement("div");
      previewHost.className = "portal-insc-file-preview-host";
      const runLockedPreview = () => {
        previewHost.replaceChildren();
        const m = state.files[f.id];
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
          previewHost.appendChild(img);
          const cap = document.createElement("p");
          cap.className = "portal-insc-file-caption";
          cap.textContent = name;
          previewHost.appendChild(cap);
        } else {
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
          }
          previewHost.appendChild(docBox);
        }
      };
      runLockedPreview();
      wrap.appendChild(previewHost);
      return;
    }

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
      const m = state.files[f.id];
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
      if (!file || !state.submissionId) return;
      setProgress(0);
      const fd = new FormData();
      fd.append("file", file);
      fd.append("field_id", f.id);
      const { ok, data } = await portalFormDataWithProgress(
        `/inscription/submissions/${state.submissionId}/upload`,
        fd,
        (ratio) => setProgress(ratio)
      );
      clearProgress();
      if (ok && data?.files) {
        state.files = data.files;
        if (typeof data.progress_percent === "number") state.progress_percent = data.progress_percent;
        if (data?.admin_field_flags && typeof data.admin_field_flags === "object") state.admin_field_flags = data.admin_field_flags;
        if (data?.review_decision) state.review_decision = data.review_decision;
        updateReviewBannerUi();
        updateProgressUi();
        const clearedAfterUpload = state.status === "submitted" && !adminFlagsNonEmpty();
        if (clearedAfterUpload && (await tryResubmitFullInscriptionAfterCorrections())) return;
        afterPortalFollowupDone(data);
        if (!clearedAfterUpload) {
          flash(flashEl, "Fichier enregistré.", "ok");
        }
        renderStep();
        surfaceAfterFieldEdit?.();
      } else {
        flash(flashEl, data?.error || "Envoi du fichier impossible.", "err");
      }
    }

    const actions = document.createElement("div");
    actions.className = "portal-insc-file-actions";

    const pickId = `insc-file-inp-${f.id}${idSuffix}`;
    const pickLabel = document.createElement("label");
    pickLabel.className = "portal-insc-file-pick";
    pickLabel.htmlFor = pickId;
    const pickText = document.createElement("span");
    pickText.className = "portal-insc-file-pick__main";
    pickText.textContent = state.files[f.id]?.path ? "Remplacer le fichier" : "Choisir un fichier";
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
    btnDel.hidden = !state.files[f.id]?.path;
    btnDel.addEventListener("click", async () => {
      if (!state.files[f.id]?.path) return;
      if (!confirm("Retirer ce fichier du dossier ? Vous pourrez en envoyer un autre ensuite.")) return;
      const { ok, data } = await portalJson(
        `/inscription/submissions/${state.submissionId}/files/${f.id}`,
        {
          method: "DELETE",
        }
      );
      if (ok && data?.files) {
        state.files = data.files;
        if (typeof data.progress_percent === "number") state.progress_percent = data.progress_percent;
        if (data?.admin_field_flags && typeof data.admin_field_flags === "object") state.admin_field_flags = data.admin_field_flags;
        if (data?.review_decision) state.review_decision = data.review_decision;
        updateReviewBannerUi();
        updateProgressUi();
        const clearedAfterDel = state.status === "submitted" && !adminFlagsNonEmpty();
        if (clearedAfterDel && (await tryResubmitFullInscriptionAfterCorrections())) return;
        afterPortalFollowupDone(data);
        if (!clearedAfterDel) {
          flash(flashEl, "Fichier retiré.", "ok");
        }
        renderStep();
        surfaceAfterFieldEdit?.();
      } else {
        flash(flashEl, data?.error || "Suppression impossible.", "err");
      }
    });

    actions.appendChild(dropZone);
    actions.appendChild(btnDel);

    refreshPreview();
    wrap.appendChild(previewHost);
    wrap.appendChild(progressWrap);
    wrap.appendChild(actions);
  }

  function renderStep() {
    const steps = state.definition.steps || [];
    if (!steps.length) {
      stepTitleEl.textContent = "Formulaire vide";
      stepTitleEl.classList.remove("portal-insc-step-title--identity");
      stepBodyEl.textContent =
        "Contactez l’administration : le formulaire ne contient aucune étape.";
      stepBodyEl.classList.remove("portal-insc-step-body--identity");
      btnNext.classList.add("hidden");
      btnSubmit.classList.add("hidden");
      updateProgressUi();
      updateSubmitBtnState();
      return;
    }
    const idx = Math.min(state.currentStepIndex, steps.length - 1);
    state.currentStepIndex = idx;
    const step = steps[idx];
    stepTitleEl.textContent = step.title || `Étape ${idx + 1}`;
    stepTitleEl.classList.toggle("portal-insc-step-title--identity", step.id === PORTAL_IDENTITY_STEP_ID);
    stepBodyEl.textContent = "";
    stepBodyEl.classList.toggle("portal-insc-step-body--identity", step.id === PORTAL_IDENTITY_STEP_ID);

    for (const block of step.blocks || []) {
      if (block.kind === "info") {
        const div = document.createElement("div");
        div.className = "portal-insc-info";
        div.textContent = block.body || "";
        stepBodyEl.appendChild(div);
        continue;
      }
      if (block.kind === "title") {
        const h = document.createElement("h3");
        h.className = "portal-insc-block-title";
        h.textContent = block.text || "";
        stepBodyEl.appendChild(h);
        continue;
      }
      if (block.kind === "description") {
        const div = document.createElement("div");
        div.className = "portal-insc-block-desc";
        div.textContent = block.body || "";
        stepBodyEl.appendChild(div);
        continue;
      }
      if (block.kind !== "field") continue;

      const f = block;
      const wrap = document.createElement("div");
      wrap.className = "portal-insc-field";
      if (f?.id) wrap.dataset.inscFieldId = f.id;
      const mark = state.admin_field_flags?.[f.id];
      if (mark) {
        wrap.classList.add("portal-insc-field--voided");
        const voidNote = document.createElement("p");
        voidNote.className = "portal-insc-field-void-note";
        const clearedRaw = mark.cleared_at
          ? new Date(mark.cleared_at).toLocaleString("fr-FR", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "";
        const consigne = directionMessageForField(f.id);
        if (mark.cleared_at) {
          voidNote.textContent =
            "Cette réponse a été annulée par l’administration — merci de la saisir ou l’envoyer à nouveau." +
            (clearedRaw ? ` (${clearedRaw})` : "") +
            (mark.reason && String(mark.reason) !== "annulation_admin"
              ? ` Motif indiqué : ${mark.reason}.`
              : "") +
            (consigne && consigne !== "Merci de mettre ce champ à jour." ? ` ${consigne}` : "");
        } else {
          voidNote.textContent = consigne;
        }
        wrap.appendChild(voidNote);
      }
      const lab = document.createElement("label");
      lab.className = "portal-insc-field-label";
      lab.textContent = f.label + (isPortalFieldMandatory(f) ? " *" : "");
      wrap.appendChild(lab);
      if (f.help) {
        const h = document.createElement("p");
        h.className = "portal-insc-field-help";
        h.textContent = f.help;
        wrap.appendChild(h);
      }

      appendInscriptionFieldControls(wrap, f, "");

      stepBodyEl.appendChild(wrap);
    }

    btnPrev.disabled = idx <= 0;
    const last = idx >= steps.length - 1;
    btnNext.classList.toggle("hidden", last);
    const showSubmitOnSubmitted =
      state.status === "submitted" &&
      !adminFlagsNonEmpty() &&
      ["a_completer", "pending", "none"].includes(state.review_decision || "none");
    btnSubmit.classList.toggle("hidden", !last || (state.status === "submitted" && !showSubmitOnSubmitted));
    updateProgressUi();
    updateReviewBannerUi();
    updateSubmitBtnState();
  }

  btnStart.addEventListener("click", () => void startFlow());
  btnBackPick.addEventListener("click", () => {
    void saveAnswers(true);
    showPick();
  });
  btnSaveExit.addEventListener("click", async () => {
    await saveAnswers(false);
    window.location.href = "/compte/tableau-de-bord";
  });
  btnPrev.addEventListener("click", async () => {
    await saveAnswers(false);
    state.currentStepIndex = Math.max(0, state.currentStepIndex - 1);
    await saveAnswers(false);
    renderStep();
  });
  btnNext.addEventListener("click", async () => {
    await saveAnswers(false);
    const steps = state.definition.steps || [];
    const step = steps[state.currentStepIndex];
    const missing =
      state.status === "submitted" && adminFlagsNonEmpty()
        ? missingFlaggedRequiredMessagesForStep(step, state.answers, state.files, state.admin_field_flags)
        : missingRequiredMessagesForStep(step, state.answers, state.files);
    if (missing.length) {
      flash(
        flashEl,
        `Vous ne pouvez pas passer à l’étape suivante tant que les champs obligatoires (*) ne sont pas complétés :\n${missing.map((m) => `• ${m}`).join("\n")}`,
        "err"
      );
      flashEl?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      return;
    }
    flash(flashEl, "", "ok");
    state.currentStepIndex = Math.min(steps.length - 1, state.currentStepIndex + 1);
    await saveAnswers(false);
    renderStep();
  });
  btnSubmit.addEventListener("click", async () => {
    if (btnSubmit.disabled) return;
    if (adminFlagsNonEmpty()) {
      flash(
        flashEl,
        "Des champs doivent encore être corrigés selon la direction. Utilisez le panneau « Corrections demandées » ou le bouton « Corriger dans le panneau », puis enregistrez.",
        "err"
      );
      flashEl?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      openCorrectionsDialogIfNeeded();
      return;
    }

    const redirected = await saveAnswers(false);
    if (redirected) return;

    const missing = missingRequiredMessagesAllSteps(state.definition, state.answers, state.files);
    if (missing.length) {
      flash(
        flashEl,
        `Le formulaire n’est pas complet. Corrigez les points ci-dessous avant de confirmer :\n${missing.map((m) => `• ${m}`).join("\n")}`,
        "err"
      );
      flashEl?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
      return;
    }

    const { ok, data } = await portalJson(`/inscription/submissions/${state.submissionId}/submit`, {
      method: "POST",
      body: "{}",
    });
    if (ok) {
      const msg =
        state.status === "submitted"
          ? "Nouvelle version enregistrée : l’équipe voit votre dossier mis à jour (date d’envoi actualisée)."
          : "Formulaire envoyé. Merci !";
      flash(flashEl, msg, "ok");
      window.location.href = "/compte/tableau-de-bord";
    } else {
      flash(flashEl, data?.error || "Envoi impossible — vérifiez les champs obligatoires.", "err");
    }
  });

  const params = new URLSearchParams(window.location.search);
  const subId = params.get("id");
  if (subId) {
    await loadSubmission(subId);
  } else {
    const f = params.get("formation");
    const v = params.get("ville");
    if (f && [...selForm.options].some((o) => o.value === f)) {
      selForm.value = f;
      refreshVilles();
      if (v && [...selVille.options].some((o) => o.value === v)) selVille.value = v;
    }
  }
});
