-- ─────────────────────────────────────────────────────────────────────────────
-- SporFormation — Mini-CMS pour la vitrine
-- À exécuter UNE FOIS dans le SQL Editor Supabase (déclencher l'ensemble du script).
--
-- Couvre :
--   • admins (rôle administrateur — vérifié par le serveur Node)
--   • site_settings (paire clé / JSON : prix TEP, débouchés, etc.)
--   • formation_overrides (override par couple formation × ville)
--   • documents_utiles (liens & documents par "scope" — page ou fiche)
--   • partenaires (logos + lien + ordre, nb illimité)
--   • tep_etapes (les "étapes" de la méthode TEP, nombre dynamique)
--
-- + Bucket Storage public-uploads pour les fichiers téléversés (docs / logos).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Administrateurs ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',         -- 'admin' | 'super-admin'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
-- Lecture autorisée pour l'utilisateur courant si c'est son propre row
DROP POLICY IF EXISTS "admins lecture propre" ON public.admins;
CREATE POLICY "admins lecture propre"
  ON public.admins FOR SELECT
  USING (auth.uid() = user_id);

-- 2) Paramètres globaux (clé/valeur JSON) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.site_settings (
  cle TEXT PRIMARY KEY,
  valeur JSONB NOT NULL,
  maj_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "site_settings lecture publique" ON public.site_settings;
CREATE POLICY "site_settings lecture publique"
  ON public.site_settings FOR SELECT
  USING (true);
-- L'écriture passe exclusivement par le serveur Node (service_role).

-- Seeds par défaut (valeurs équivalentes au site actuel)
INSERT INTO public.site_settings (cle, valeur)
VALUES
  ('tep_prix_preparation', '{"montant": 100, "devise": "€", "unite": "tout compris", "libelle": "Préparation + inscription"}'::jsonb),
  ('tep_prix_inscription_seule', '{"montant": 70, "devise": "€", "unite": "par candidat", "libelle": "Inscription seule"}'::jsonb),
  ('a_propos_emploi_debouches', '{"titre": "Emploi & débouchés", "valeur": "Insertion", "description": "Taux d''insertion et de réussite à personnaliser avec vos chiffres consolidés."}'::jsonb)
ON CONFLICT (cle) DO NOTHING;

-- 3) Overrides par formation × ville --------------------------------------------
-- On stocke les champs un par un pour pouvoir modifier finement chaque cellule
-- (date limite d'inscription, prochaine session, durée, taux d'obtention, libellé,
--  satisfaction, effectifs, taux d'apprentis, interruption, rupture…).
CREATE TABLE IF NOT EXISTS public.formation_overrides (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL,
  ville TEXT NOT NULL,
  cle TEXT NOT NULL,                          -- ex: 'deadline', 'session', 'success_rate', 'effectif_actuel'…
  valeur TEXT,                                -- valeur texte (libellé affiché)
  source TEXT NOT NULL DEFAULT 'manuel',      -- 'manuel' | 'auto' (à venir : auto depuis DB)
  maj_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (slug, ville, cle)
);
CREATE INDEX IF NOT EXISTS idx_formation_overrides_slug_ville
  ON public.formation_overrides (slug, ville);
ALTER TABLE public.formation_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "formation_overrides lecture publique" ON public.formation_overrides;
CREATE POLICY "formation_overrides lecture publique"
  ON public.formation_overrides FOR SELECT
  USING (true);

-- 4) Documents & liens utiles ---------------------------------------------------
-- scope = 'global' | 'formation' | 'tep' | 'a-propos' | 'handicap'…
-- scope_key = '' (pour global) ou '<slug>|<ville>' pour une fiche précise
CREATE TABLE IF NOT EXISTS public.documents_utiles (
  id BIGSERIAL PRIMARY KEY,
  scope TEXT NOT NULL,
  scope_key TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL,
  url TEXT NOT NULL,                          -- URL publique (Supabase Storage ou externe)
  fichier_chemin TEXT,                        -- chemin dans le bucket Storage (si téléversé)
  type TEXT NOT NULL DEFAULT 'document',      -- 'document' | 'lien'
  bouton_variante TEXT NOT NULL DEFAULT 'outline', -- outline | primary | light | secondary (site)
  ordre INT NOT NULL DEFAULT 100,
  cree_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_utiles_scope
  ON public.documents_utiles (scope, scope_key, ordre);
ALTER TABLE public.documents_utiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "documents_utiles lecture publique" ON public.documents_utiles;
CREATE POLICY "documents_utiles lecture publique"
  ON public.documents_utiles FOR SELECT
  USING (true);

-- 5) Partenaires (logos / nb illimité) ------------------------------------------
CREATE TABLE IF NOT EXISTS public.partenaires (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  logo_url TEXT,                              -- URL publique du logo (Supabase Storage ou externe)
  fichier_chemin TEXT,                        -- chemin dans le bucket Storage
  lien TEXT,                                  -- lien externe optionnel
  ordre INT NOT NULL DEFAULT 100,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  cree_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_partenaires_ordre
  ON public.partenaires (actif, ordre);
ALTER TABLE public.partenaires ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "partenaires lecture publique" ON public.partenaires;
CREATE POLICY "partenaires lecture publique"
  ON public.partenaires FOR SELECT
  USING (true);

-- 6) Étapes méthode TEP (nb dynamique, 1 à N) -----------------------------------
CREATE TABLE IF NOT EXISTS public.tep_etapes (
  id BIGSERIAL PRIMARY KEY,
  ordre INT NOT NULL DEFAULT 100,
  badge TEXT,                                 -- ex: "Format", "Durée"…
  titre TEXT NOT NULL,
  description TEXT NOT NULL,
  accent BOOLEAN NOT NULL DEFAULT FALSE,      -- TRUE = cadre rouge / accentué
  lien_document BIGINT REFERENCES public.documents_utiles(id) ON DELETE SET NULL,
  actif BOOLEAN NOT NULL DEFAULT TRUE,
  maj_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tep_etapes_ordre
  ON public.tep_etapes (actif, ordre);
ALTER TABLE public.tep_etapes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tep_etapes lecture publique" ON public.tep_etapes;
CREATE POLICY "tep_etapes lecture publique"
  ON public.tep_etapes FOR SELECT
  USING (true);

-- Seeds initiaux (les 4 étapes actuelles du site)
INSERT INTO public.tep_etapes (ordre, badge, titre, description, accent)
VALUES
  (10, 'Format',      'Session collective + suivi',        'Sessions collectives, suivi individualisé personnalisé, et inscription définitive au TEP prise en charge par nos équipes.', FALSE),
  (20, 'Durée',       '1 à 2 mois',                        'Une séance par semaine, pendant 1 à 2 mois selon votre niveau de départ et l''épreuve visée.', FALSE),
  (30, 'Lieu',        'Courbevoie (92)',                   'Toutes les séances se déroulent dans nos locaux à Courbevoie, accessibles en transports en commun.', FALSE),
  (40, 'Encadrement', 'Formateurs diplômés d''État',       'Encadrement assuré par des formateurs diplômés d''État, expérimentés sur les TEP des BP JEPS APSF & MAPS.', FALSE)
ON CONFLICT DO NOTHING;

-- 7) Bucket Storage --------------------------------------------------------------
-- Crée le bucket "public-uploads" (idempotent) avec lecture publique
INSERT INTO storage.buckets (id, name, public)
VALUES ('public-uploads', 'public-uploads', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- Policy de lecture publique sur ce bucket (lecture seule via clé anon)
DROP POLICY IF EXISTS "public-uploads lecture publique" ON storage.objects;
CREATE POLICY "public-uploads lecture publique"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'public-uploads');

-- ─────────────────────────────────────────────────────────────────────────────
-- Création du PREMIER administrateur :
--   1. Aller dans Supabase → Authentication → Users → "Add user" → entrer
--      email + mot de passe (par exemple raphaelsporformation@gmail.com).
--   2. Copier l'UUID du user créé (colonne "User UID").
--   3. Exécuter le SQL suivant en remplaçant la valeur :
--
--   INSERT INTO public.admins (user_id, email, role)
--   VALUES ('<UUID_DU_USER>', 'raphaelsporformation@gmail.com', 'super-admin');
--
--   4. Aller sur /login.html, se connecter avec ces identifiants.
-- ─────────────────────────────────────────────────────────────────────────────
