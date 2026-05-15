# Modèles EmailJS — archive / référence uniquement

> Le site utilise désormais **Resend** côté serveur (`server/resend-mail.js`). Ce fichier peut servir de référence pour le contenu des mails si vous adaptez le HTML dans Resend ou dans `buildCandidatureHtml` / `buildEmployerHtml`.

Les anciennes notes EmailJS suivent ci‑dessous pour mémoire.

Conseils :

- Dans EmailJS : créez **deux modèles** (candidature + employeur) et reliez-les à `VITE_EMAILJS_TEMPLATE_ID` et `VITE_EMAILJS_TEMPLATE_ID_EMPLOYER`.
- Champ « To » : votre boîte de réception équipe (ex. `{{to_email}}` si vous exposez cette variable côté template).
- Le champ **`{{message}}`** contient déjà un récapitulatif tout prêt en texte brut ; vous pouvez l’afficher seul ou enrichir avec les variables ci‑dessous.

---

## 1. Candidature (formulaire étudiant)

**Sujet suggéré (template EmailJS)** :

```text
{{subject}}
```

**Corps HTML exemple** :

```html
<h2>Nouvelle candidature — SporFormation</h2>
<p><strong>Rappel prioritaire :</strong> {{applicant_phone}}</p>
<ul>
  <li><strong>Prénom / Nom :</strong> {{applicant_firstname}} {{applicant_lastname}}</li>
  <li><strong>Email :</strong> {{applicant_email}}</li>
  <li><strong>Ville :</strong> {{applicant_city}}</li>
  <li><strong>Formation :</strong> {{requested_program}}</li>
  <li><strong>Ville de formation :</strong> {{requested_city}}</li>
  <li><strong>Situation :</strong> {{current_status}}</li>
  <li><strong>Employeur / structure :</strong> {{employer_status}}</li>
  <li><strong>Source :</strong> {{acquisition_source}}</li>
</ul>
<h3>Motivation</h3>
<pre style="white-space:pre-wrap;font-family:inherit">{{motivation}}</pre>
<hr />
<pre style="white-space:pre-wrap;font-size:13px;color:#444">{{message}}</pre>
```

**Corps texte minimal** :

```text
{{message}}
```

Variables disponibles côté code : `subject`, `applicant_firstname`, `applicant_lastname`, `applicant_phone`, `applicant_email`, `applicant_city`, `requested_program`, `requested_city`, `current_status`, `employer_status`, `acquisition_source`, `motivation`, `message`, `to_email`.

---

## 2. Employeur (recherche d’alternants)

**Sujet suggéré** :

```text
{{subject}}
```

**Corps HTML exemple** :

```html
<h2>Demande employeur — SporFormation</h2>
<p><strong>Rappel prioritaire :</strong> {{employer_phone}}</p>
<ul>
  <li><strong>Prénom / Nom :</strong> {{employer_firstname}} {{employer_lastname}}</li>
  <li><strong>Email :</strong> {{employer_email}}</li>
  <li><strong>Formation concernée :</strong> {{sought_program}}</li>
  <li><strong>Recherche d’alternants :</strong> {{seeks_apprentices}}</li>
</ul>
<hr />
<pre style="white-space:pre-wrap;font-size:13px;color:#444">{{message}}</pre>
```

Variables : `subject`, `employer_firstname`, `employer_lastname`, `employer_phone`, `employer_email`, `sought_program`, `seeks_apprentices`, `message`, `to_email`.

---

## 3. Liaison avec la base formulaires

Les mêmes données sont envoyées en parallèle vers l’API (`POST /api/forms/student` et `POST /api/forms/employeur`) lorsque l’API est configurée. Les colonnes SQL équivalentes sont décrites dans `database/schema.postgresql.sql` et `database/schema.mysql.sql`.
