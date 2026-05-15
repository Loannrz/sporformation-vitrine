# Assets publics - SporFormation

Ce dossier contient les fichiers servis tels quels par Vite. Tous les chemins commencent par `/` dans le HTML (ex : `/assets/videos/hero-sport.mp4`).

## Arborescence attendue

```
public/assets/
├── images/    → photos haute résolution (apprentis, équipe, sessions…)
├── logos/     → logos SporFormation, Qualiopi, partenaires
└── videos/    → vidéo hero (hero-sport.mp4 + .webm en option)
```

## Conseils

- **Vidéo hero** : viser un fichier < 3 Mo, format MP4 (H.264) et idéalement un fallback WebM. Dimensions 1920×1080, 24 ou 30 fps, sans audio.
- **Images** : JPEG 80% pour les photos, PNG pour les logos sur fond transparent, SVG pour les pictogrammes vectoriels.
- **Logos** : prévoir une version sur fond clair et sombre si le contraste l'exige.
- Tous les noms doivent être en minuscules, sans accent, avec des tirets `kebab-case`.
