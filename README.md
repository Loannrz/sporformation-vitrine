# SporFormation - site vitrine & inscription

Site officiel du CFA SporFormation. Architecture **Vite** + **SCSS** (BEM) + **JavaScript** modulaire, sans framework UI.

## Prérequis

- **Node.js** ≥ 18  
- **npm** ≥ 9 (livré avec Node)

## Installation & lancement

À la racine du projet :

```bash
# 1. Installer les dépendances (une fois)
npm install

# 2. Serveur de développement (hot reload)
npm run dev
```

Par défaut l’URL locale est **http://localhost:5173** (Vite peut aussi afficher une URL réseau pour tester sur mobile).

```bash
# 3. Build de production (sortie dans ./dist)
npm run build

# 4. Prévisualiser le build comme en prod (après npm run build)
npm run preview
```

| Script          | Rôle |
|-----------------|------|
| `npm run dev`   | Développement, SCSS/JS recompilés à la volée |
| `npm run build` | Génère les HTML/CSS/JS minifiés dans `dist/` |
| `npm run preview` | Sert le contenu de `dist/` pour valider avant mise en ligne |

## Déploiement

Le dossier **`dist/`** contient le site statique après `npm run build`. Déposez son contenu sur votre hébergement (Netlify, Vercel, OVH, etc.). Les fichiers **`public/`** (robots, sitemap, assets) sont copiés dans `dist/` au build.

## Dépannage rapide

- **`npm run dev` ne trouve pas `package.json`** : exécutez les commandes depuis le dossier racine du projet (là où se trouvent `package.json` et `vite.config.js`).
- **Formulaire** : l’envoi des mails passe par **Resend** sur le **serveur Node** (`server/`). En local, lancez **`npm run dev:full`** (Vite + API). Sans API joignable, le formulaire affiche une erreur.
- **Vidéo hero absente** : tant que `public/assets/videos/hero-sport.mp4` n’existe pas, le hero garde le fond bleu nuit + overlay (comportement prévu).

## Arborescence

```
.
├── index.html                       # page d'accueil (entrée Vite)
├── formations.html
├── apprentissage.html
├── a-propos.html
├── handicap.html
├── tep.html
├── contact.html
├── mentions-legales.html
├── politique-de-confidentialite.html
├── vite.config.js                   # Vite multi-pages
├── package.json
├── .env.example                     # variables serveur (Resend) + optionnel Vite
├── public/
│   ├── robots.txt
│   ├── sitemap.xml
│   └── assets/
│       ├── images/                  # photos
│       ├── logos/                   # SporFormation, Qualiopi, partenaires
│       └── videos/                  # hero-sport.mp4
└── src/
    ├── js/
    │   ├── main.js                  # point d'entrée
    │   └── modules/
    │       ├── header.js
    │       ├── mobile-nav.js
    │       ├── reveal.js
    │       ├── back-to-top.js
    │       ├── counter.js
    │       ├── slider.js
    │       ├── filters.js
    │       └── form.js              # formulaires → API → Resend
    └── scss/
        ├── main.scss                # point d'entrée
        ├── abstracts/               # variables, mixins
        ├── base/                    # reset, typo, animations, utilitaires
        ├── layout/                  # header, footer, container, sections
        └── components/              # boutons, cartes, hero, slider…
```

## Resend — e-mails des formulaires

Les formulaires (`contact.html`, `formulaire-employeur.html`) envoient les données au serveur **`npm run server`**, qui appelle l’API [Resend](https://resend.com). La clé **ne doit pas** être exposée au navigateur.

1. Renseigner dans **`.env.local`** (lu automatiquement par le serveur) :

```
RESEND_API_KEY=re_xxxxxxx
EMAIL_FROM=SporFormation <onboarding@resend.dev>
DIRECTOR_EMAIL=votre@email.fr
```

2. En développement : **`npm run dev:full`** (ou deux terminaux : `npm run server` + `npm run dev`). Le proxy Vite envoie `/api/*` vers le port 3001.

3. En production : héberger le même serveur Node (ou équivalent) derrière une URL et définir **`VITE_FORMS_API_URL`** au build pour que le front atteigne cette API.

Le corps HTML / texte des mails est généré dans `server/resend-mail.js`.

## Design system

| Token              | Valeur                                       |
| ------------------ | -------------------------------------------- |
| Primaire           | `#1A1A2E` (bleu nuit)                        |
| Accent             | `#E63946` (rouge énergie sport)              |
| Surface            | `#F8F9FA`                                    |
| Texte principal    | `#2D2D2D`                                    |
| Texte secondaire   | `#6B7280`                                    |
| Police titres      | Poppins 600/700/800                          |
| Police corps       | Inter 400/500/600/700/800                    |
| Container          | `min(1200px, 100% - 32px)` centré            |
| Radius             | 8 / 12 / 20 / 28 px                          |
| Espacement         | multiples de 8 (8, 16, 24, 32, 48, 64, 96)   |

## Performance & accessibilité

- Lazy loading sur toutes les images (`loading="lazy"`).
- Polices Google chargées avec `preconnect` + `display=swap`.
- Animations GPU-friendly (`opacity`, `transform`), désactivées si `prefers-reduced-motion`.
- Skip-link et focus visibles partout.
- Données structurées Schema.org `EducationalOrganization` sur l'accueil.

## Médias à fournir

Tous les emplacements sont marqués dans le HTML par les classes :

- `.logo-placeholder` (logos manquants)
- `.media-placeholder` (image en attente)

Remplacer les placeholders `placehold.co` par les fichiers définitifs dans `public/assets/`.
