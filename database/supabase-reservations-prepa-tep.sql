-- Supabase : table des réservations de diagnostic Prépa TEP
-- À exécuter dans le SQL Editor du projet Supabase.
--
-- Source : formulaire inscription-prepa-tep.html → POST /api/forms/prepa-tep
-- L'insertion est faite côté serveur avec SUPABASE_SERVICE_ROLE_KEY,
-- la RLS reste activée pour bloquer les lectures via la clé anon.

CREATE TABLE IF NOT EXISTS public.reservations_prepa_tep (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prenom TEXT NOT NULL,
  nom TEXT NOT NULL,
  date_naissance DATE,
  telephone TEXT NOT NULL,
  email TEXT NOT NULL,
  lieu_residence TEXT NOT NULL,
  pratique_sport TEXT NOT NULL,
  pratique_sport_detail TEXT,
  formation_visee TEXT NOT NULL,
  structure_alternance TEXT NOT NULL,
  deja_passe_tep TEXT NOT NULL,
  echecs_tep TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  disponibilites TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  consentement_recontact BOOLEAN NOT NULL DEFAULT FALSE,
  consentement_politique BOOLEAN NOT NULL DEFAULT FALSE,
  origine TEXT NOT NULL DEFAULT 'site-vitrine-prepa-tep'
);

CREATE INDEX IF NOT EXISTS idx_reservations_prepa_tep_created
  ON public.reservations_prepa_tep (created_at DESC);

ALTER TABLE public.reservations_prepa_tep ENABLE ROW LEVEL SECURITY;

-- Aucune policy : seul le service_role (utilisé par le serveur Node) peut écrire/lire.
-- Si vous voulez exposer la lecture à un rôle authentifié interne, ajoutez une policy SELECT dédiée.
