-- Libellés étape 1 (coordonnées) : aligner les templates déjà migrés avec le portail

UPDATE public.inscription_templates t
SET definition = jsonb_set(
  jsonb_set(
    t.definition,
    '{steps,0,title}',
    to_jsonb('Étape 1 — Vos coordonnées'::text)
  ),
  '{steps,0,blocks}',
  '[
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
  ]'::jsonb
)
WHERE (t.definition->'steps'->0->>'id') = 'portal_step_identite';

COMMENT ON COLUMN public.inscription_submissions.candidate_nom IS 'Nom de famille — étape 1 portail (clé answers portal_ident_nom).';
COMMENT ON COLUMN public.inscription_submissions.candidate_prenom IS 'Prénom — étape 1 portail (portal_ident_prenom).';
COMMENT ON COLUMN public.inscription_submissions.candidate_email IS 'E-mail — étape 1 portail (portal_ident_email).';

NOTIFY pgrst, 'reload schema';
