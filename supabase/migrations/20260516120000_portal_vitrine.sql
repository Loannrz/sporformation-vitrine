-- Portail visiteurs (hors Supabase Auth / auth.users)
-- Lecture-écriture uniquement via l’API Node (service_role). Aucune policy RLS → pas d’accès anon.

CREATE TABLE IF NOT EXISTS public.portal_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (status IN ('pending_verification', 'active')),
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.portal_email_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_account_id UUID NOT NULL REFERENCES public.portal_accounts (id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_ev_pending
  ON public.portal_email_verifications (portal_account_id)
  WHERE consumed_at IS NULL;

ALTER TABLE public.portal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_email_verifications ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
