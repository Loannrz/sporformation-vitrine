-- Étape 1 « coordonnées » obligatoire (nom, prénom, e-mail) + colonnes dédiées sur les dossiers

ALTER TABLE public.inscription_submissions
  ADD COLUMN IF NOT EXISTS candidate_nom TEXT,
  ADD COLUMN IF NOT EXISTS candidate_prenom TEXT,
  ADD COLUMN IF NOT EXISTS candidate_email TEXT;

COMMENT ON COLUMN public.inscription_submissions.candidate_nom IS 'Nom de famille — étape 1 portail (clé answers portal_ident_nom).';
COMMENT ON COLUMN public.inscription_submissions.candidate_prenom IS 'Prénom — étape 1 portail (portal_ident_prenom).';
COMMENT ON COLUMN public.inscription_submissions.candidate_email IS 'E-mail — étape 1 portail (portal_ident_email).';

WITH prepended AS (
  UPDATE public.inscription_templates t
  SET definition = jsonb_set(
    COALESCE(t.definition, '{"steps":[]}'::jsonb),
    '{steps}',
    '[
      {
        "id": "portal_step_identite",
        "title": "Étape 1 — Vos coordonnées",
        "blocks": [
          {
            "id": "portal_ident_nom",
            "kind": "field",
            "type": "text",
            "label": "Nom de famille",
            "help": "",
            "required": true
          },
          {
            "id": "portal_ident_prenom",
            "kind": "field",
            "type": "text",
            "label": "Votre prénom",
            "help": "",
            "required": true
          },
          {
            "id": "portal_ident_email",
            "kind": "field",
            "type": "text",
            "label": "Adresse e-mail",
            "help": "",
            "required": true
          }
        ]
      }
    ]'::jsonb || COALESCE(t.definition->'steps', '[]'::jsonb)
  )
  WHERE (COALESCE(t.definition->'steps'->0->>'id', '')) IS DISTINCT FROM 'portal_step_identite'
  RETURNING id
)
UPDATE public.inscription_submissions s
SET current_step_index = LEAST(
  s.current_step_index + 1,
  GREATEST(
    0,
    COALESCE(
      (SELECT jsonb_array_length(t.definition->'steps') - 1 FROM public.inscription_templates t WHERE t.id = s.template_id),
      0
    )
  )
)
WHERE s.template_id IN (SELECT id FROM prepended);

NOTIFY pgrst, 'reload schema';
