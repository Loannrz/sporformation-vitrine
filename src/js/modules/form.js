// Formulaires candidature ([data-contact-form]), employeurs ([data-employer-form])
// et inscription Prépa TEP ([data-prepa-tep-form]).
// Notifications équipe via Resend, déclenchées par le serveur Node (/api/email/*).
import {
  getFormsApiOrigin,
  persistEmployerForm,
  persistPrepaTepForm,
  persistStudentForm,
  sendCandidatureEmail,
  sendEmployeurEmail,
  sendPrepaTepEmail,
} from "./form-api.js";

const bindMessageBox = (form) => {
  const messageBox =
    form.closest(".card")?.querySelector("[data-form-message]") ??
    document.querySelector("[data-form-message]");

  const showMessage = (type, content) => {
    if (!messageBox) return;
    messageBox.className = `form-message form-message--${type} is-visible`;
    messageBox.textContent = content;
    messageBox.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return showMessage;
};

export const initContactForm = () => {
  const form = document.querySelector("[data-contact-form]");
  if (!form) {
    return;
  }

  const showMessage = bindMessageBox(form);
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.recontact || !data.confidentialite) {
      showMessage(
        "error",
        "Merci d'accepter le recontact et la politique de confidentialité avant l'envoi."
      );
      return;
    }

    if ((data.motivation || "").trim().length < 100) {
      showMessage(
        "error",
        "Merci de détailler votre motivation sur au moins 100 caractères."
      );
      return;
    }

    if (getFormsApiOrigin() === null) {
      showMessage(
        "error",
        "Le serveur d’envoi n’est pas joignable. En local : lancez « npm run dev:full » (API + site). Sinon : configurez l’hébergement de l’API (variable VITE_FORMS_API_URL au build)."
      );
      return;
    }

    try {
      submitButton?.setAttribute("disabled", "true");
      submitButton?.setAttribute("aria-busy", "true");

      const emailPromise = sendCandidatureEmail(data);
      const dbPromise = persistStudentForm(data);

      const [emailOutcome, dbOutcome] = await Promise.allSettled([
        emailPromise,
        dbPromise,
      ]);

      if (emailOutcome.status === "rejected") {
        throw emailOutcome.reason;
      }

      if (dbOutcome.status === "rejected") {
        console.warn("[forms-api] candidature non enregistrée en base locale", dbOutcome.reason);
      }

      showMessage(
        "success",
        `Merci ${data.prenom} ! Votre candidature a bien été reçue. Notre équipe vous contacte sous 24h au ${data.telephone}.`
      );
      form.reset();
    } catch (error) {
      console.error("[Resend / formulaire]", error);
      const detail =
        error instanceof Error ? error.message : String(error);
      showMessage(
        "error",
        detail.includes("SERVEUR_INDISPONIBLE") || detail.includes("joignable")
          ? "Le serveur d’envoi n’est pas disponible. En local utilisez « npm run dev:full »."
          : `L'envoi a échoué : ${detail}. Réessayez plus tard ou contactez-nous au 07 44 99 06 99.`
      );
    } finally {
      submitButton?.removeAttribute("disabled");
      submitButton?.removeAttribute("aria-busy");
    }
  });
};

/* ─── Inscription Prépa TEP ─────────────────────────────────────────── */
export const initPrepaTepForm = () => {
  const form = document.querySelector("[data-prepa-tep-form]");
  if (!form) {
    return;
  }

  const showMessage = bindMessageBox(form);
  const submitButton = form.querySelector('button[type="submit"]');

  // Affichage/masquage dynamique des blocs conditionnels (data-conditional-for)
  form.querySelectorAll("[data-conditional-for]").forEach((zone) => {
    const fieldName = zone.getAttribute("data-conditional-for");
    const expected = zone.getAttribute("data-conditional-when");
    const update = () => {
      const selected = form.querySelector(`input[name="${fieldName}"]:checked`);
      const isActive = selected && selected.value === expected;
      zone.classList.toggle("is-active", Boolean(isActive));
    };
    form
      .querySelectorAll(`input[name="${fieldName}"]`)
      .forEach((input) => input.addEventListener("change", update));
    update();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);

    const disponibilites = formData.getAll("disponibilites");
    const echecsTep = formData.getAll("echecsTep");

    const data = {
      prenom: String(formData.get("prenom") || "").trim(),
      nom: String(formData.get("nom") || "").trim(),
      dateNaissance: String(formData.get("dateNaissance") || "").trim(),
      telephone: String(formData.get("telephone") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      lieuResidence: String(formData.get("lieuResidence") || "").trim(),
      pratiqueSport: String(formData.get("pratiqueSport") || "").trim(),
      pratiqueSportDetail: String(formData.get("pratiqueSportDetail") || "").trim(),
      formationVisee: String(formData.get("formationVisee") || "").trim(),
      structureAlternance: String(formData.get("structureAlternance") || "").trim(),
      dejaPasseTep: String(formData.get("dejaPasseTep") || "").trim(),
      echecsTep,
      disponibilites,
      recontact: formData.get("recontact") ? "oui" : "",
      confidentialite: formData.get("confidentialite") ? "oui" : "",
      origine: "site-vitrine-prepa-tep",
    };

    const requiredText = [
      ["prenom", "Prénom"],
      ["nom", "Nom"],
      ["dateNaissance", "Date de naissance"],
      ["telephone", "Téléphone"],
      ["email", "Adresse mail"],
      ["lieuResidence", "Lieu de résidence"],
    ];
    for (const [key, label] of requiredText) {
      if (!data[key]) {
        showMessage("error", `Merci de renseigner : ${label}.`);
        return;
      }
    }

    const requiredRadios = [
      ["pratiqueSport", "Pratique sportive régulière"],
      ["formationVisee", "Formation visée"],
      ["structureAlternance", "Structure d’alternance"],
      ["dejaPasseTep", "Tests TEP déjà passés"],
    ];
    for (const [key, label] of requiredRadios) {
      if (!data[key]) {
        showMessage("error", `Merci de répondre à : ${label}.`);
        return;
      }
    }

    if (!disponibilites.length) {
      showMessage("error", "Merci de cocher au moins un créneau de disponibilité.");
      return;
    }

    if (!data.recontact || !data.confidentialite) {
      showMessage(
        "error",
        "Merci d’accepter le recontact et la politique de confidentialité avant l’envoi."
      );
      return;
    }

    if (getFormsApiOrigin() === null) {
      showMessage(
        "error",
        "Le serveur d’envoi n’est pas joignable. En local : lancez « npm run dev:full »."
      );
      return;
    }

    try {
      submitButton?.setAttribute("disabled", "true");
      submitButton?.setAttribute("aria-busy", "true");

      const [emailOutcome, dbOutcome] = await Promise.allSettled([
        sendPrepaTepEmail(data),
        persistPrepaTepForm(data),
      ]);

      if (emailOutcome.status === "rejected") {
        throw emailOutcome.reason;
      }
      if (dbOutcome.status === "rejected") {
        console.warn(
          "[forms-api] inscription Prépa TEP non enregistrée en base",
          dbOutcome.reason
        );
      }

      showMessage(
        "success",
        `Merci ${data.prenom} ! Votre inscription à la Prépa TEP a bien été reçue. Notre équipe vous contacte sous 24h au ${data.telephone}.`
      );
      form.reset();
      form
        .querySelectorAll(".prepa-tep-conditional")
        .forEach((z) => z.classList.remove("is-active"));
    } catch (error) {
      console.error("[Resend / formulaire Prépa TEP]", error);
      const detail = error instanceof Error ? error.message : String(error);
      showMessage(
        "error",
        detail.includes("SERVEUR_INDISPONIBLE")
          ? "Le serveur d’envoi n’est pas disponible. En local utilisez « npm run dev:full »."
          : `L'envoi a échoué : ${detail}. Réessayez plus tard ou contactez-nous au 07 44 99 06 99.`
      );
    } finally {
      submitButton?.removeAttribute("disabled");
      submitButton?.removeAttribute("aria-busy");
    }
  });
};

export const initEmployerForm = () => {
  const form = document.querySelector("[data-employer-form]");
  if (!form) {
    return;
  }

  const showMessage = bindMessageBox(form);
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (
      !data.rechercheAlternants ||
      !data.recontact ||
      !data.confidentialite
    ) {
      showMessage(
        "error",
        "Merci de confirmer votre recherche d'alternants, l'acceptation d'être recontacté et la politique de confidentialité."
      );
      return;
    }

    if (getFormsApiOrigin() === null) {
      showMessage(
        "error",
        "Le serveur d’envoi n’est pas joignable. En local : lancez « npm run dev:full »."
      );
      return;
    }

    try {
      submitButton?.setAttribute("disabled", "true");
      submitButton?.setAttribute("aria-busy", "true");

      const emailPromise = sendEmployeurEmail(data);
      const dbPromise = persistEmployerForm(data);

      const [emailOutcome, dbOutcome] = await Promise.allSettled([
        emailPromise,
        dbPromise,
      ]);

      if (emailOutcome.status === "rejected") {
        throw emailOutcome.reason;
      }

      if (dbOutcome.status === "rejected") {
        console.warn("[forms-api] employeur non enregistré en base locale", dbOutcome.reason);
      }

      showMessage(
        "success",
        `Merci ${data.prenom} ! Votre demande employeur a bien été transmise. Notre équipe vous rappelle sous 24h au ${data.telephone}.`
      );
      form.reset();
    } catch (error) {
      console.error("[Resend / formulaire employeur]", error);
      const detail =
        error instanceof Error ? error.message : String(error);
      showMessage(
        "error",
        detail.includes("SERVEUR_INDISPONIBLE")
          ? "Le serveur d’envoi n’est pas disponible. En local utilisez « npm run dev:full »."
          : `L'envoi a échoué : ${detail}. Réessayez plus tard ou contactez-nous au 07 44 99 06 99.`
      );
    } finally {
      submitButton?.removeAttribute("disabled");
      submitButton?.removeAttribute("aria-busy");
    }
  });
};
