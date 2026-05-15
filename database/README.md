# Base formulaires — liaison avec le site vitrine

Deux tables métier :

| Table | Rôle |
|-------|------|
| `formulaires_etudiants` | Dépot formulaire candidature (`contact.html`) |
| `formulaires_employeurs` | Dépot formulaire employeurs (`formulaire-employeur.html`) |

La table `indicateurs_site` sert à exposer un **nombre d’étudiants actifs** (et autres clés plus tard) pour la page d’accueil. Mettez à jour `nombre_etudiants_actifs` depuis votre base élèves / cron / script interne.

Le mini-serveur Node (`npm run server`) utilise SQLite localement avec les mêmes colonnes ; en production, importez `schema.postgresql.sql` ou `schema.mysql.sql` dans votre SGBD et faites pointer `VITE_FORMS_API_URL` vers votre API qui implémente les mêmes routes (`POST /api/forms/student`, `POST /api/forms/employeur`, `GET /api/metrics`).

### Mettre à jour le nombre d’étudiants depuis votre autre site / BD

Définissez `FORMS_API_SECRET` puis appelez (exemple SQLite locale sur le port 3001) :

```bash
curl -s -X PATCH http://127.0.0.1:3001/api/internal/metrics/nombre-etudiants \
  -H "Content-Type: application/json" \
  -H "x-api-key: VOTRE_SECRET" \
  -d '{"nombreEtudiantsActifs": 312}'
```

Les éléments `[data-live-metric="students"]` sur l’accueil consomment `GET /api/metrics` au chargement (avec proxy `/api` en dev).

### Supabase (recommandé pour la vitrine)

1. Exécutez `schema.postgresql.sql` puis **`database/supabase-metric-apprentis.sql`** dans le SQL Editor Supabase (fonction `count_formulaires_etudiants`).
2. Dans `.env.local`, utilisez soit **`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`**, soit les variables **`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`** (reconnues par Vite via `envPrefix` dans `vite.config.js`). Les variables **`SUPABASE_URL`** sans préfixe ne sont pas injectées dans le navigateur : gardez-les pour un backend Node uniquement.
3. Le site affiche alors **le nombre total de lignes** dans `formulaires_etudiants` (mises à jour automatiques à chaque nouvel enregistrement).
4. Alternative sans RPC : `VITE_SUPABASE_METRIC=indicator` et lecture de `indicateurs_site` — ajoutez une politique RLS `SELECT` pour `anon` sur cette table uniquement.

### EmailJS

Modèles historiques (optionnels si vous réutilisez un autre canal) : `docs/emailjs-templates.md`. Les formulaires du site passent par **Resend** côté serveur (voir `.env.example` et `server/resend-mail.js`).
