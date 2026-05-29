-- =====================================================================
-- Migração: Preparação Comercial — Kids Point  (v2)
-- Pipeline (oportunidades + visitas) + qualidade de dados (geo, origem, data)
-- =====================================================================

DO $$ BEGIN
  CREATE TYPE opportunity_stage AS ENUM
    ('em_conversa','visita_agendada','visita_realizada','pre_reserva','ganho','perdido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE opportunity_source AS ENUM
    ('google','instagram','indicacao','convidado','ja_cliente','recorrencia',
     'passou_frente','mora_proximo','internet','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE loss_reason AS ENUM
    ('preco','data_indisponivel','sem_resposta','fechou_concorrente',
     'festa_em_casa','fora_perfil','desistiu','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE visit_status AS ENUM
    ('agendada','realizada','no_show','remarcada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_slot AS ENUM ('almoco','jantar');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cep    text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS bairro text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cidade text;
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS source opportunity_source;

CREATE INDEX IF NOT EXISTS idx_clients_cep    ON public.clients (cep);
CREATE INDEX IF NOT EXISTS idx_clients_bairro ON public.clients (bairro);

CREATE TABLE IF NOT EXISTS public.opportunities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.tenants(id),
  client_id           uuid NOT NULL REFERENCES public.clients(id),
  celebrant_name      varchar,
  celebrant_age       int,
  celebrant_birthdate date,
  desired_date        date,
  desired_slot        event_slot,
  guest_estimate      int,
  stage               opportunity_stage NOT NULL DEFAULT 'em_conversa',
  owner_id            uuid REFERENCES public.users(id),
  estimated_value     numeric,
  source              opportunity_source,
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  first_response_at   timestamptz,
  pre_reserva_at      timestamptz,
  pre_reserva_expires_at timestamptz,
  closed_at           timestamptz,
  stage_changed_at    timestamptz NOT NULL DEFAULT now(),
  loss_reason         loss_reason,
  lost_from_stage     opportunity_stage,
  contract_id         uuid REFERENCES public.contracts(id),
  notes               text,
  created_by          uuid REFERENCES auth.users(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.opportunities TO authenticated;
GRANT ALL ON public.opportunities TO service_role;

CREATE INDEX IF NOT EXISTS idx_opp_tenant_stage ON public.opportunities (tenant_id, stage);
CREATE INDEX IF NOT EXISTS idx_opp_desired_date ON public.opportunities (desired_date);
CREATE INDEX IF NOT EXISTS idx_opp_client       ON public.opportunities (client_id);
CREATE INDEX IF NOT EXISTS idx_opp_owner        ON public.opportunities (owner_id);
CREATE INDEX IF NOT EXISTS idx_opp_source       ON public.opportunities (tenant_id, source);
CREATE INDEX IF NOT EXISTS idx_opp_prereserva   ON public.opportunities (desired_date, desired_slot)
  WHERE stage = 'pre_reserva';

ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunities_all ON public.opportunities;
CREATE POLICY opportunities_all ON public.opportunities
  FOR ALL TO authenticated
  USING      (tenant_id = private.current_tenant_id())
  WITH CHECK (tenant_id = private.current_tenant_id());

DROP TRIGGER IF EXISTS opportunities_set_updated_at ON public.opportunities;
CREATE TRIGGER opportunities_set_updated_at
  BEFORE UPDATE ON public.opportunities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.visits (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.tenants(id),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  scheduled_at   timestamptz NOT NULL,
  status         visit_status NOT NULL DEFAULT 'agendada',
  confirmed      boolean NOT NULL DEFAULT false,
  notes          text,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.visits TO authenticated;
GRANT ALL ON public.visits TO service_role;

CREATE INDEX IF NOT EXISTS idx_visits_opp       ON public.visits (opportunity_id);
CREATE INDEX IF NOT EXISTS idx_visits_scheduled ON public.visits (tenant_id, scheduled_at);

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS visits_all ON public.visits;
CREATE POLICY visits_all ON public.visits
  FOR ALL TO authenticated
  USING      (tenant_id = private.current_tenant_id())
  WITH CHECK (tenant_id = private.current_tenant_id());

DROP TRIGGER IF EXISTS visits_set_updated_at ON public.visits;
CREATE TRIGGER visits_set_updated_at
  BEFORE UPDATE ON public.visits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS opportunity_id uuid REFERENCES public.opportunities(id);
CREATE INDEX IF NOT EXISTS idx_contracts_opp ON public.contracts (opportunity_id);

UPDATE public.contracts
   SET event_date = NULL,
       legacy_notes = COALESCE(legacy_notes,'') || ' [migração: event_date inválida removida]'
 WHERE event_date IS NOT NULL AND event_date <= DATE '2015-01-01';

DO $$ BEGIN
  ALTER TABLE public.contracts
    ADD CONSTRAINT contracts_event_date_sane
    CHECK (event_date IS NULL OR event_date > DATE '2015-01-01');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.opportunities
    ADD CONSTRAINT opp_desired_date_sane
    CHECK (desired_date IS NULL OR desired_date > DATE '2015-01-01');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

UPDATE public.clients
   SET cep = substring(address_full from 'CEP:\s*([0-9]{5})')
 WHERE cep IS NULL AND address_full ~ 'CEP:';

UPDATE public.clients SET source = CASE
    WHEN how_met IS NULL                                    THEN NULL
    WHEN lower(how_met) LIKE '%indica%'                     THEN 'indicacao'::opportunity_source
    WHEN lower(how_met) LIKE '%internet%'                   THEN 'internet'::opportunity_source
    WHEN lower(how_met) = 'google'                          THEN 'google'::opportunity_source
    WHEN lower(how_met) LIKE '%insta%'                      THEN 'instagram'::opportunity_source
    WHEN lower(how_met) LIKE '%convidad%'                   THEN 'convidado'::opportunity_source
    WHEN lower(how_met) = 'cliente'                         THEN 'ja_cliente'::opportunity_source
    WHEN lower(how_met) LIKE '%frente%'                     THEN 'passou_frente'::opportunity_source
    WHEN lower(how_met) LIKE '%próximo%'
      OR lower(how_met) LIKE '%proximo%'                    THEN 'mora_proximo'::opportunity_source
    ELSE 'outro'::opportunity_source
  END
 WHERE source IS NULL;
