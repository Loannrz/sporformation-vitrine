# Console admin SporFormation — guide de mise en route

## 1. Activer la base Supabase (une seule fois)

1. Ouvrir votre projet Supabase → **SQL editor**.
2. Coller et exécuter intégralement le fichier `database/supabase-admin-cms.sql`.
   Cela crée :
   - les tables `admins`, `site_settings`, `formation_overrides`, `documents_utiles`,
     `partenaires`, `tep_etapes` ;
   - le bucket Storage **public-uploads** (lecture publique) ;
   - les valeurs par défaut (tarifs TEP 70 € / 100 €, 4 étapes méthode, etc.).

## 2. Créer le **premier compte administrateur**

1. Supabase → **Authentication → Users → Add user → Add user (manual)**.
   - Renseigner l’e‑mail et un mot de passe robuste (≥ 12 caractères).
   - Décocher *Send invite email* si vous voulez vous connecter immédiatement.
2. Copier l’**UUID** du user nouvellement créé (colonne *User UID*).
3. Toujours dans Supabase → **SQL editor**, exécuter :

```sql
INSERT INTO public.admins (user_id, email, role)
VALUES ('VOTRE_UUID_ICI', 'votre.email@exemple.fr', 'super-admin');
```

4. Aller sur `/login.html` (en local : `http://localhost:5173/login.html`).
5. Se connecter — vous arrivez automatiquement sur `/admin.html`.

> Pour ajouter un autre admin plus tard : créer un user dans Auth puis ré-exécuter le
> `INSERT INTO public.admins …` avec son UUID.

## 3. Variables d’environnement requises

Dans `.env.local` à la racine du projet :

```
SUPABASE_URL=https://VOTRE-PROJET.supabase.co
SUPABASE_ANON_KEY=eyJ…   # « anon public »
SUPABASE_SERVICE_ROLE_KEY=eyJ…   # « service_role » (ne JAMAIS exposer côté client)
```

Le client navigateur lit `SUPABASE_URL` + `SUPABASE_ANON_KEY` (préfixe géré par Vite).
Le serveur Node utilise `SUPABASE_SERVICE_ROLE_KEY` pour les écritures admin.

## 4. URL d’accès `/login` (sans `.html`)

Sur Vite/Static, l’URL finale est `/login.html`. Pour permettre de taper
simplement `/login`, ajoutez une redirection côté hébergeur :

- **Nginx**

  ```nginx
  rewrite ^/login$  /login.html  permanent;
  rewrite ^/admin$  /admin.html  permanent;
  ```

- **Apache** (.htaccess)

  ```apache
  RewriteRule ^login$ /login.html [R=301,L]
  RewriteRule ^admin$ /admin.html [R=301,L]
  ```

- **Netlify** (`_redirects`)

  ```
  /login  /login.html  200
  /admin  /admin.html  200
  ```

- **Vercel** (`vercel.json`)

  ```json
  { "rewrites": [
    { "source": "/login", "destination": "/login.html" },
    { "source": "/admin", "destination": "/admin.html" }
  ] }
  ```

## 5. Que peut-on modifier depuis la console ?

| Onglet | Ce que vous éditez |
|--------|--------------------|
| **Formations & villes** | Date limite, prochaine session, durée, taux d’obtention, légende du taux, effectif actuel, taux d’apprentis, taux d’interruption, taux de rupture, satisfaction — pour **chaque couple formation × ville**. Vide = on retombe sur la valeur par défaut du site. |
| **Documents & liens utiles** | Téléverser un fichier (PDF, image…), créer un lien nommé, l’attacher à une page (TEP, Handicap, À propos, Global) ou à une fiche formation précise (`slug|ville`). |
| **Prépa TEP** | Tarifs (inscription seule + préparation), liste des **étapes de la méthode** (1 à N étapes, badge, titre, description, mise en avant rouge). |
| **À propos** | Bloc « Emploi & débouchés » : titre, valeur centrale, description. |
| **Partenaires** | Ajouter/supprimer/réordonner autant de partenaires que voulu, téléverser leur logo, lien externe optionnel. |

Toutes les modifications s’appliquent **immédiatement** sur le site public sans
rebuild — le module `dynamic-content.js` charge un payload JSON unique au boot
et patche le DOM.

## 6. Sécurité

- L’écriture sur les tables CMS passe **exclusivement** par les routes
  `/api/admin/*` (clé `service_role` stockée serveur).
- Chaque requête admin vérifie le JWT Supabase **+** la présence du user dans
  `public.admins`. Un user sans ligne dans cette table reçoit un 403.
- Le bucket Storage `public-uploads` est en lecture publique (les fichiers sont
  destinés à être téléchargés par les visiteurs). Les **uploads** sont
  également limités côté serveur (clé service_role).
- Pages `/login.html` et `/admin.html` sont en `noindex, nofollow`.

## 7. Maintenance courante

- Voir tous les overrides actifs sur une fiche : SQL editor →
  `SELECT * FROM formation_overrides WHERE slug = 'bp-jeps-rugby' AND ville = 'Courbevoie';`
- Vider un override pour retomber sur la valeur par défaut du site :
  utiliser la console admin (champ vide → suppression de l’override).
- Supprimer un partenaire qui revient sur le site : `DELETE FROM partenaires WHERE id = …;`
