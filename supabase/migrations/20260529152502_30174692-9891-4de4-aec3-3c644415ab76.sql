DO $$ BEGIN
  CREATE TYPE opportunity_source_new AS ENUM
    ('meta','ga','indicacao','veio_em_festa','offline','ja_cliente','recorrencia','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP INDEX IF EXISTS public.idx_opp_source;

ALTER TABLE public.clients
  ALTER COLUMN source TYPE opportunity_source_new
  USING (
    CASE
      WHEN source IS NULL                                   THEN NULL
      WHEN source::text = 'google'                          THEN 'ga'
      WHEN source::text = 'instagram'                       THEN 'meta'
      WHEN source::text = 'convidado'                       THEN 'veio_em_festa'
      WHEN source::text IN ('passou_frente','mora_proximo') THEN 'offline'
      WHEN source::text = 'internet'                        THEN 'outro'
      ELSE source::text
    END::opportunity_source_new
  );

ALTER TABLE public.opportunities
  ALTER COLUMN source TYPE opportunity_source_new
  USING (
    CASE
      WHEN source IS NULL                                   THEN NULL
      WHEN source::text = 'google'                          THEN 'ga'
      WHEN source::text = 'instagram'                       THEN 'meta'
      WHEN source::text = 'convidado'                       THEN 'veio_em_festa'
      WHEN source::text IN ('passou_frente','mora_proximo') THEN 'offline'
      WHEN source::text = 'internet'                        THEN 'outro'
      ELSE source::text
    END::opportunity_source_new
  );

DROP TYPE public.opportunity_source;
ALTER TYPE public.opportunity_source_new RENAME TO opportunity_source;
CREATE INDEX IF NOT EXISTS idx_opp_source ON public.opportunities (tenant_id, source);