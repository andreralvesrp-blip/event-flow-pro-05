-- 1a — Alinhamento do enum opportunity_source (idempotente)
DO $$ BEGIN
  CREATE TYPE public.opportunity_source_new AS ENUM
    ('meta','ga','indicacao','veio_em_festa','offline','ja_cliente','recorrencia','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP INDEX IF EXISTS public.idx_opp_source;

ALTER TABLE public.clients
  ALTER COLUMN source TYPE public.opportunity_source_new
  USING (CASE WHEN source IS NULL THEN NULL
    WHEN source::text = 'google'        THEN 'ga'
    WHEN source::text = 'instagram'     THEN 'meta'
    WHEN source::text = 'convidado'     THEN 'veio_em_festa'
    WHEN source::text IN ('passou_frente','mora_proximo') THEN 'offline'
    WHEN source::text = 'internet'      THEN 'outro'
    ELSE source::text END::public.opportunity_source_new);

ALTER TABLE public.opportunities
  ALTER COLUMN source TYPE public.opportunity_source_new
  USING (CASE WHEN source IS NULL THEN NULL
    WHEN source::text = 'google'        THEN 'ga'
    WHEN source::text = 'instagram'     THEN 'meta'
    WHEN source::text = 'convidado'     THEN 'veio_em_festa'
    WHEN source::text IN ('passou_frente','mora_proximo') THEN 'offline'
    WHEN source::text = 'internet'      THEN 'outro'
    ELSE source::text END::public.opportunity_source_new);

DROP TYPE public.opportunity_source;
ALTER TYPE public.opportunity_source_new RENAME TO opportunity_source;
CREATE INDEX IF NOT EXISTS idx_opp_source ON public.opportunities (tenant_id, source);

-- 1b — Tabela forms + form_id em opportunities
CREATE TABLE IF NOT EXISTS public.forms (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id),
  name            varchar NOT NULL,
  slug            varchar NOT NULL,
  welcome_message text NOT NULL DEFAULT 'Vamos planejar sua festa? 🎉',
  source          public.opportunity_source NOT NULL DEFAULT 'outro',
  utm_campaign    text,
  active          boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.forms TO authenticated;
GRANT ALL ON public.forms TO service_role;

CREATE INDEX IF NOT EXISTS idx_forms_tenant ON public.forms (tenant_id);
CREATE INDEX IF NOT EXISTS idx_forms_slug   ON public.forms (slug);

ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS forms_all ON public.forms;
CREATE POLICY forms_all ON public.forms FOR ALL TO authenticated
  USING (tenant_id = private.current_tenant_id())
  WITH CHECK (tenant_id = private.current_tenant_id());

DROP TRIGGER IF EXISTS forms_set_updated_at ON public.forms;
CREATE TRIGGER forms_set_updated_at BEFORE UPDATE ON public.forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS form_id uuid REFERENCES public.forms(id);
CREATE INDEX IF NOT EXISTS idx_opp_form ON public.opportunities (form_id);