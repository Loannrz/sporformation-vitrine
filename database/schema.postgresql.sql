-- SporFormation — schéma pour liaison avec votre SI / espace élèves-professeurs (PostgreSQL 13+)
-- Les INSERT depuis ce site peuvent alimenter les mêmes tables si vous exposez une API équivalente.

CREATE TABLE IF NOT EXISTS formulaires_etudiants (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prenom VARCHAR(120) NOT NULL,
  nom VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  telephone VARCHAR(40) NOT NULL,
  ville_residence VARCHAR(200),
  formation_souhaitee VARCHAR(200) NOT NULL,
  ville_formation VARCHAR(200),
  situation VARCHAR(160) NOT NULL,
  employeur_structure VARCHAR(200) NOT NULL,
  source_connaissance VARCHAR(160) NOT NULL,
  motivation TEXT NOT NULL,
  consentement_recontact BOOLEAN NOT NULL DEFAULT FALSE,
  consentement_politique BOOLEAN NOT NULL DEFAULT FALSE,
  origine VARCHAR(80) NOT NULL DEFAULT 'site-vitrine'
);

CREATE INDEX IF NOT EXISTS idx_formulaires_etudiants_created ON formulaires_etudiants (created_at DESC);

CREATE TABLE IF NOT EXISTS formulaires_employeurs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prenom VARCHAR(120) NOT NULL,
  nom VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  telephone VARCHAR(40) NOT NULL,
  formation_recherchee VARCHAR(200) NOT NULL,
  recherche_alternants BOOLEAN NOT NULL DEFAULT FALSE,
  consentement_recontact BOOLEAN NOT NULL DEFAULT FALSE,
  consentement_politique BOOLEAN NOT NULL DEFAULT FALSE,
  origine VARCHAR(80) NOT NULL DEFAULT 'site-vitrine'
);

CREATE INDEX IF NOT EXISTS idx_formulaires_employeurs_created ON formulaires_employeurs (created_at DESC);

-- Indicateurs publiables pour la vitrine (ex. nombre d’étudiants actifs synchronisé depuis votre BD métier)
CREATE TABLE IF NOT EXISTS indicateurs_site (
  cle VARCHAR(64) PRIMARY KEY,
  valeur_entier BIGINT NOT NULL DEFAULT 0,
  maj_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO indicateurs_site (cle, valeur_entier)
VALUES ('nombre_etudiants_actifs', 204)
ON CONFLICT (cle) DO NOTHING;
