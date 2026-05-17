-- Renommage aligné produit Sporformation : drapeaux « à corriger » côté direction
-- + persistance de l’avancement calculé côté serveur
--
-- Idempotent : si admin_field_flags existe déjà (sync manuelle / migration rejouée), on ne renomme pas.

DO $$
BEGIN
  -- Les deux colonnes : probable ajout manuel de admin_field_flags alors que field_marks restait.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inscription_submissions'
      AND column_name = 'field_marks'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inscription_submissions'
      AND column_name = 'admin_field_flags'
  ) THEN
    UPDATE public.inscription_submissions
    SET admin_field_flags =
      COALESCE(field_marks, '{}'::jsonb) || COALESCE(admin_field_flags, '{}'::jsonb);
    ALTER TABLE public.inscription_submissions DROP COLUMN field_marks;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inscription_submissions'
      AND column_name = 'field_marks'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inscription_submissions'
      AND column_name = 'admin_field_flags'
  ) THEN
    ALTER TABLE public.inscription_submissions
      RENAME COLUMN field_marks TO admin_field_flags;
  END IF;
END $$;

ALTER TABLE public.inscription_submissions
  ADD COLUMN IF NOT EXISTS progress_percent SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'inscription_submissions'
      AND c.conname = 'inscription_submissions_progress_percent_check'
  ) THEN
    ALTER TABLE public.inscription_submissions
      ADD CONSTRAINT inscription_submissions_progress_percent_check
      CHECK (progress_percent >= 0 AND progress_percent <= 100);
  END IF;
END $$;

COMMENT ON COLUMN public.inscription_submissions.admin_field_flags IS
  'Clés = id des champs feuilles à corriger ; valeur typique { "message"?: string } ou { "cleared_at", "reason" } après annulation admin.';

NOTIFY pgrst, 'reload schema';
