import "../scss/main.scss";
import "../scss/portal.scss";
import { requirePortalSession, portalJson, portalLogout } from "./modules/portal-api.js";
import { FORMATION_SHORT_LABELS, FORMATION_LABELS } from "./modules/formation-city-detail.js";
import { initDashboardInscriptionCorrections } from "./modules/dashboard-inscription-corrections.js";

function formationDashboardLabel(slug) {
  return FORMATION_SHORT_LABELS[slug] || FORMATION_LABELS[slug] || slug;
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

/** Libellés des champs marqués par la direction. */
function markedFieldLabels(admin_field_flags, field_labels) {
  const marks = admin_field_flags && typeof admin_field_flags === "object" ? admin_field_flags : {};
  const labels = field_labels && typeof field_labels === "object" ? field_labels : {};
  const ids = Object.keys(marks);
  if (!ids.length) return [];
  const out = ids.map((id) => labels[id] || null).filter(Boolean);
  if (out.length) return out;
  return ["champs du formulaire (ouvrez le dossier pour le détail)"];
}

/** Valeurs de décision revue normalisées pour l’affichage tableau de bord. */
function portalDashReviewDecision(raw) {
  const d = String(raw ?? "none").trim().toLowerCase();
  if (d === "refuse" || d === "refus" || d === "rejected") return "refuse";
  if (d === "accepte" || d === "accepté" || d === "accepted") return "accepte";
  if (d === "pending" || d === "a_completer" || d === "none") return d;
  return "none";
}

document.addEventListener("DOMContentLoaded", async () => {
  const me = await requirePortalSession();
  if (!me?.email) return;

  const settingsEmail = document.getElementById("portal-settings-email");
  if (settingsEmail) settingsEmail.value = me.email;

  const greetEl = document.getElementById("portal-greeting");
  const welcomeEl = document.getElementById("portal-dash-welcome");
  if (greetEl) greetEl.textContent = me.email;

  if (welcomeEl) {
    const local = (me.email.split("@")[0] || "").trim();
    const firstSegment = local.split(/[._-]/)[0] || local;
    const name =
      firstSegment.length > 0
        ? firstSegment.charAt(0).toUpperCase() + firstSegment.slice(1).toLowerCase()
        : "";
    welcomeEl.textContent = name ? `Bonjour, ${name}` : "Bienvenue";
  }

  document.getElementById("portal-logout")?.addEventListener("click", () => void portalLogout());

  const page = document.body.dataset.comptePage;
  if (page === "dashboard") {
    const host = document.getElementById("portal-dash-inscriptions");
    if (host) {
      const dashCorr = initDashboardInscriptionCorrections({
        reloadList: loadDashInscriptions,
      });

      function loadDashInscriptions() {
        portalJson("/inscription/my").then(({ ok, data }) => {
          host.replaceChildren();
          if (!ok || !data?.items?.length) {
            host.appendChild(
              document.createTextNode(
                "Aucun dossier pour l’instant — utilisez le bouton ci-dessus pour commencer."
              )
            );
            return;
          }
          const inboxPriority = (row) => {
            const dec = portalDashReviewDecision(row.review_decision);
            if (dec === "refuse" || dec === "accepte") return 0;
            const fm = row.admin_field_flags;
            const hasFlags = !!(fm && typeof fm === "object" && Object.keys(fm).length > 0);
            if (hasFlags) return 2;
            if (row.status === "draft" && dec === "a_completer") return 1;
            if (row.status === "submitted" && dec === "a_completer") return 2;
            return 0;
          };

          const items = [...data.items].sort((a, b) => {
            const p = inboxPriority(b) - inboxPriority(a);
            if (p !== 0) return p;
            return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
          });

          for (const it of items) {
          const dec = portalDashReviewDecision(it.review_decision);
          const isDraft = it.status === "draft";
          const marked = markedFieldLabels(it.admin_field_flags, it.field_labels);
          const hasFlaggedCorrections = marked.length > 0;
          const submittedNeedsCompleters =
            it.status === "submitted" && dec === "a_completer" && !hasFlaggedCorrections;

          const isEditable = isDraft;
          const el = document.createElement(isEditable ? "a" : "div");
          if (isEditable) {
            const focus = it.correction_focus_field_id
              ? `&focus=${encodeURIComponent(it.correction_focus_field_id)}`
              : "";
            el.href = `/compte/inscription?id=${encodeURIComponent(it.id)}${focus}`;
          }

          const classes = ["portal-dash-insc-card"];
          let metaStatus = "";
          let badgeText = "";

          if (isDraft) {
            if (dec === "a_completer") {
              classes.push("portal-dash-insc-card--tocomplete");
              metaStatus = "Brouillon · À compléter";
              badgeText = "À compléter";
            } else {
              metaStatus = "Brouillon";
            }
          } else {
            classes.push("portal-dash-insc-card--done");
            if (dec === "refuse") {
              classes.push("portal-dash-insc-card--refused");
              metaStatus = "Refusé";
              badgeText = "Refusé";
            } else if (dec === "accepte") {
              classes.push("portal-dash-insc-card--accepted");
              metaStatus = "Accepté";
              badgeText = "Accepté";
            } else if (dec === "a_completer") {
              metaStatus = "Envoyé · À compléter — merci de mettre le dossier à jour";
            } else {
              metaStatus = "En attente de traitement";
            }
          }

          if (marked.length && !badgeText) {
            badgeText = "Corrections";
            classes.push("portal-dash-insc-card--corrections");
          } else if (submittedNeedsCompleters && !badgeText) {
            badgeText = "À compléter";
            classes.push("portal-dash-insc-card--tocomplete");
          }

          el.className = classes.join(" ");

          const pct = Math.max(0, Math.min(100, it.progress_percent || 0));
          const tier = pct >= 85 ? "high" : pct >= 40 ? "mid" : "low";
          if (isEditable) el.dataset.tier = tier;
          if (dec === "refuse") el.dataset.tier = "refused";
          if (dec === "accepte") el.dataset.tier = "accepted";

          const titleRow = document.createElement("div");
          titleRow.className = "portal-dash-insc-card__title-row";
          const title = document.createElement("span");
          title.className = "portal-dash-insc-card__title";
          title.textContent = it.template_title || "Dossier d’inscription";
          titleRow.appendChild(title);
          if (badgeText) {
            const badge = document.createElement("span");
            const isCorrOnly = marked.length && badgeText === "Corrections";
            badge.className =
              "portal-dash-insc-card__badge" +
              (dec === "refuse"
                ? " portal-dash-insc-card__badge--refused"
                : dec === "accepte"
                  ? " portal-dash-insc-card__badge--accepted"
                  : dec === "a_completer"
                    ? " portal-dash-insc-card__badge--tocomplete"
                    : isCorrOnly
                      ? " portal-dash-insc-card__badge--corrections"
                      : "");
            badge.textContent = badgeText;
            titleRow.appendChild(badge);
          }
          el.appendChild(titleRow);

          if (marked.length) {
            const mods = document.createElement("div");
            mods.className = "portal-dash-insc-card__mods";
            mods.textContent =
              marked.length === 1
                ? `Modification demandée : ${marked[0]}`
                : `Modifications demandées : ${marked.join(", ")}`;
            el.appendChild(mods);
          }

          const showCorrBtn =
            (hasFlaggedCorrections || submittedNeedsCompleters) && dec !== "refuse" && dec !== "accepte";
          if (showCorrBtn) {
            const act = document.createElement("div");
            act.className = "portal-dash-insc-card__corr-actions";
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "btn btn--primary";
            btn.textContent = submittedNeedsCompleters
              ? "Compléter le dossier demandé par l’équipe"
              : "Fournir les informations ou documents demandés";
            btn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (submittedNeedsCompleters) {
                window.location.href = `/compte/inscription?id=${encodeURIComponent(it.id)}`;
                return;
              }
              void dashCorr.openCorrectionsModal(it.id);
            });
            act.appendChild(btn);
            el.appendChild(act);
          }

          const meta = document.createElement("div");
          meta.className = "portal-dash-insc-card__meta";
          meta.textContent = `${formationDashboardLabel(it.formation_slug)} — ${it.ville_slug} · ${metaStatus}`;
          el.appendChild(meta);

          const track = document.createElement("div");
          track.className = "portal-dash-insc-card__track";
          track.style.setProperty("--pct", `${pct}%`);
          const fill = document.createElement("span");
          fill.className = "portal-dash-insc-card__fill";
          track.appendChild(fill);
          el.appendChild(track);

          host.appendChild(el);
        }
        });
      }

      loadDashInscriptions();
    }
  }

  if (page === "settings") {
    const flashEl = document.getElementById("portal-settings-flash");
    document.getElementById("portal-password-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      flash(flashEl, "", "err");
      const currentPassword = document.getElementById("pwd-current")?.value ?? "";
      const newPassword = document.getElementById("pwd-new")?.value ?? "";
      const newPasswordConfirm = document.getElementById("pwd-new2")?.value ?? "";
      if (newPassword.length < 8) {
        flash(flashEl, "Le nouveau mot de passe doit contenir au moins 8 caractères.", "err");
        return;
      }
      if (newPassword !== newPasswordConfirm) {
        flash(flashEl, "La confirmation ne correspond pas.", "err");
        return;
      }
      const { ok, data } = await portalJson("/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword, newPasswordConfirm }),
      });
      if (!ok) {
        flash(flashEl, data?.error || "Impossible de mettre à jour le mot de passe.", "err");
        return;
      }
      flash(flashEl, "Mot de passe mis à jour.", "ok");
      const form = document.getElementById("portal-password-form");
      form?.reset();
    });
  }
});
