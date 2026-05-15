-- Style des boutons « Documents et liens utiles » (couleur sur la vitrine).
-- Exécuter une fois dans Supabase SQL Editor après la création initiale.

ALTER TABLE public.documents_utiles
  ADD COLUMN IF NOT EXISTS bouton_variante TEXT NOT NULL DEFAULT 'outline';

COMMENT ON COLUMN public.documents_utiles.bouton_variante IS
  'Classe bouton vitrine : outline | primary | light | secondary';
