-- Table alternative « administrateurs » (même rôle que public.admins dans supabase-admin-cms.sql).
-- À exécuter dans le SQL Editor Supabase SI vous utilisez SUPABASE_ADMINS_TABLE=administrateurs dans .env.local.
--
-- Si vous avez déjà public.admins avec des lignes, après création de cette table :
--   INSERT INTO public.administrateurs (user_id, email, role, created_at)
--   SELECT user_id, email, role, created_at FROM public.admins
--   ON CONFLICT (user_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.administrateurs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'site-editor',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.administrateurs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "administrateurs lecture propre" ON public.administrateurs;
CREATE POLICY "administrateurs lecture propre"
  ON public.administrateurs FOR SELECT
  USING (auth.uid() = user_id);

-- Recharge le cache du schéma PostgREST (évite parfois « not in the schema cache » juste après un CREATE).
NOTIFY pgrst, 'reload schema';
