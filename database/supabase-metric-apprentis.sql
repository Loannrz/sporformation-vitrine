-- Supabase : métrique publique « nombre total d’inscriptions / apprentis » pour la vitrine
-- À exécuter dans le SQL Editor après avoir créé la table formulaires_etudiants.
--
-- La fonction tourne avec les droits du propriétaire (SECURITY DEFINER) : les lignes
-- de formulaires_etudiants restent protégées par la RLS pour la clé anon, mais le COUNT
-- est lisible via RPC uniquement.

CREATE OR REPLACE FUNCTION public.count_formulaires_etudiants()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::bigint FROM public.formulaires_etudiants;
$$;

COMMENT ON FUNCTION public.count_formulaires_etudiants() IS 'Nombre total de lignes formulaires_etudiants pour affichage vitrine';

REVOKE ALL ON FUNCTION public.count_formulaires_etudiants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_formulaires_etudiants() TO anon;
GRANT EXECUTE ON FUNCTION public.count_formulaires_etudiants() TO authenticated;

-- Variante : si vous préférez maintenir un chiffre manuel ou synchronisé dans indicateurs_site,
-- activez la lecture anonyme sur cette table uniquement :
--
-- ALTER TABLE public.indicateurs_site ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Lecture publique indicateurs"
--   ON public.indicateurs_site FOR SELECT
--   USING (true);
