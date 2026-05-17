-- Membres de l'équipe affichés sur la page À propos / Qui sommes-nous (cadres contact).
-- À exécuter dans le SQL Editor Supabase après supabase-admin-cms.sql.

CREATE TABLE IF NOT EXISTS public.equipe_pedagogique (
  id BIGSERIAL PRIMARY KEY,
  prenom TEXT NOT NULL,
  fonction TEXT NOT NULL,
  email TEXT,
  telephone TEXT,
  ordre INT NOT NULL DEFAULT 100,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  cree_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  maj_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_equipe_pedagogique_ordre
  ON public.equipe_pedagogique (actif, ordre);

ALTER TABLE public.equipe_pedagogique ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "equipe_pedagogique lecture publique" ON public.equipe_pedagogique;
CREATE POLICY "equipe_pedagogique lecture publique"
  ON public.equipe_pedagogique FOR SELECT
  USING (true);

COMMENT ON TABLE public.equipe_pedagogique IS
  'Contacts équipe pédagogique / administration — page Qui sommes-nous (géré via console admin).';

-- Données initiales (une seule fois si la table est vide)
INSERT INTO public.equipe_pedagogique (prenom, fonction, email, telephone, ordre)
SELECT x.prenom, x.fonction, x.email, x.telephone, x.ordre
FROM (
  VALUES
    ('Julie', 'Responsable administrative', 'admin@sporformation.fr', NULL::text, 10),
    ('Raphaël', 'Coordinateur général des formations', 'raphaelsporformation@gmail.com', '07 44 99 06 99', 20),
    ('Jeremy', 'Coordinateur de formation BPJEPS Rugby', 'jeremynsporformation@gmail.com', NULL::text, 30),
    ('Emmanuel', 'Coordinateur de formation BPJEPS Basket (Courbevoie)', 'emmanuelsporformation@gmail.com', NULL::text, 40),
    ('Karim', 'Coordinateur de formation BPJEPS APT (Paris VII)', 'karimsporformation@gmail.com', NULL::text, 50),
    ('Emeric', 'Coordinateur de formation BPJEPS AF', 'emericsporformation@gmail.com', NULL::text, 60),
    ('Déborah', 'Coordinatrice de formation BPJEPS APT (Courbevoie)', 'deborahrafaelsporformation@gmail.com', NULL::text, 70),
    ('Nikolas', 'Coordinateur de formation BPJEPS APT (Cergy-Pontoise)', 'nikolas.diot@gmail.com', NULL::text, 80),
    ('Hendy', 'Coordinateur de formation BPJEPS APT (Courbevoie)', 'hendysporformation@gmail.com', NULL::text, 90),
    ('Mickaël', 'Coordinateur de formation BPJEPS Basket (Nanterre)', 'mikesporformation@gmail.com', NULL::text, 100),
    ('Stéphane', 'Coordinateur de formation BPJEPS APT (Coulommiers)', 'stephanesporformation@gmail.com', NULL::text, 110)
) AS x(prenom, fonction, email, telephone, ordre)
WHERE NOT EXISTS (SELECT 1 FROM public.equipe_pedagogique LIMIT 1);
