-- Formulaires d'inscription dynamiques (portail visiteurs) + configurations admin
-- Accès données : API Node (service_role) uniquement.

CREATE TABLE IF NOT EXISTS public.inscription_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  is_published BOOLEAN NOT NULL DEFAULT false,
  /* Cibles : [] = toutes formations/villes ; sinon [{ "formation_slug": "…", "ville_slug": "…" }, …] */
  targets JSONB NOT NULL DEFAULT '[]'::jsonb,
  /* { "steps": [ { "id", "title", "blocks": [ ... ] } ] } — blocs info + champs typés */
  definition JSONB NOT NULL DEFAULT '{"steps":[]}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.inscription_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.inscription_templates (id) ON DELETE CASCADE,
  portal_account_id UUID NOT NULL REFERENCES public.portal_accounts (id) ON DELETE CASCADE,
  formation_slug TEXT NOT NULL,
  ville_slug TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  files JSONB NOT NULL DEFAULT '{}'::jsonb,
  current_step_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_inscription_one_draft_per_combo
  ON public.inscription_submissions (portal_account_id, template_id, formation_slug, ville_slug)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_inscription_submissions_portal
  ON public.inscription_submissions (portal_account_id, updated_at DESC);

ALTER TABLE public.inscription_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inscription_submissions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
