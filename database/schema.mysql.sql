-- Variante MySQL / MariaDB (même logique métier que schema.postgresql.sql)

CREATE TABLE IF NOT EXISTS formulaires_etudiants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  prenom VARCHAR(120) NOT NULL,
  nom VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  telephone VARCHAR(40) NOT NULL,
  ville_residence VARCHAR(200) NULL,
  formation_souhaitee VARCHAR(200) NOT NULL,
  ville_formation VARCHAR(200) NULL,
  situation VARCHAR(160) NOT NULL,
  employeur_structure VARCHAR(200) NOT NULL,
  source_connaissance VARCHAR(160) NOT NULL,
  motivation TEXT NOT NULL,
  consentement_recontact TINYINT(1) NOT NULL DEFAULT 0,
  consentement_politique TINYINT(1) NOT NULL DEFAULT 0,
  origine VARCHAR(80) NOT NULL DEFAULT 'site-vitrine',
  INDEX idx_formulaires_etudiants_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS formulaires_employeurs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  prenom VARCHAR(120) NOT NULL,
  nom VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL,
  telephone VARCHAR(40) NOT NULL,
  formation_recherchee VARCHAR(200) NOT NULL,
  recherche_alternants TINYINT(1) NOT NULL DEFAULT 0,
  consentement_recontact TINYINT(1) NOT NULL DEFAULT 0,
  consentement_politique TINYINT(1) NOT NULL DEFAULT 0,
  origine VARCHAR(80) NOT NULL DEFAULT 'site-vitrine',
  INDEX idx_formulaires_employeurs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS indicateurs_site (
  cle VARCHAR(64) NOT NULL PRIMARY KEY,
  valeur_entier BIGINT NOT NULL DEFAULT 0,
  maj_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO indicateurs_site (cle, valeur_entier)
VALUES ('nombre_etudiants_actifs', 204);
