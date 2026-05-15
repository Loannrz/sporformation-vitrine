// Formulaires candidature ([data-contact-form]) et employeurs ([data-employer-form]).
// Notifications équipe via Resend, déclenchées par le serveur Node (/api/email/*).
import {
  getFormsApiOrigin,
  persistEmployerForm,
  persistStudentForm,
  sendCandidatureEmail,
  sendEmployeurEmail,
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
