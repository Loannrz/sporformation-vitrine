-- Décision de traitement des dossiers d'inscription + suivi des champs vidés par l'admin

ALTER TABLE public.inscription_submissions
  ADD COLUMN IF NOT EXISTS review_decision TEXT NOT NULL DEFAULT 'none';

ALTER TABLE public.inscription_submissions
  DROP CONSTRAINT IF EXISTS inscription_submissions_review_decision_check;

ALTER TABLE public.inscription_submissions
  ADD CONSTRAINT inscription_submissions_review_decision_check
  CHECK (review_decision IN ('none', 'pending', 'a_completer', 'refuse', 'accepte'));

ALTER TABLE public.inscription_submissions
  ADD COLUMN IF NOT EXISTS review_note_internal TEXT;

ALTER TABLE public.inscription_submissions
  ADD COLUMN IF NOT EXISTS review_message_candidat TEXT;

/* { "field-uuid": { "cleared_at": "ISO", "reason": "..." }, ... } */
ALTER TABLE public.inscription_submissions
  ADD COLUMN IF NOT EXISTS field_marks JSONB NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
