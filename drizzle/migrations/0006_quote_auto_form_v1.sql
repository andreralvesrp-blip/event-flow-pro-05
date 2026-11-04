-- 1) forms: versão do fluxo + configuração de envio por formulário
ALTER TABLE public.forms ADD COLUMN flow_version text NOT NULL DEFAULT 'atual';
ALTER TABLE public.forms ADD CONSTRAINT forms_flow_version_check CHECK (flow_version IN ('atual','orcamento_automatico'));
ALTER TABLE public.forms ADD COLUMN whatsapp_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.forms ADD COLUMN chatguru_dialog_id text;
ALTER TABLE public.forms ADD COLUMN quote_unit_name text;
ALTER TABLE public.forms ADD COLUMN quote_unit_address text;
ALTER TABLE public.forms ADD COLUMN quote_unit_phone text;
ALTER TABLE public.forms ADD COLUMN quote_whatsapp_number text;

-- 2) clients: telefone padronizado (só dígitos, com DDI 55) + backfill (coluna phone original intocada)
ALTER TABLE public.clients ADD COLUMN phone_normalized text;
UPDATE public.clients
SET phone_normalized = CASE
  WHEN regexp_replace(phone, '\D', '', 'g') ~ '^55\d{10,11}$' THEN regexp_replace(phone, '\D', '', 'g')
  WHEN length(regexp_replace(phone, '\D', '', 'g')) BETWEEN 10 AND 11 THEN '55' || regexp_replace(phone, '\D', '', 'g')
  ELSE NULLIF(regexp_replace(phone, '\D', '', 'g'), '')
END
WHERE phone IS NOT NULL AND phone_normalized IS NULL;
CREATE INDEX clients_phone_normalized_idx ON public.clients (tenant_id, phone_normalized);

-- 3) opportunities: e-mail informado no formulário + consentimento de marketing + índice na data da festa
ALTER TABLE public.opportunities ADD COLUMN email text;
ALTER TABLE public.opportunities ADD COLUMN marketing_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.opportunities ADD COLUMN marketing_consent_at timestamptz;
CREATE INDEX opportunities_desired_date_idx ON public.opportunities (desired_date);

-- 4) Envios de orçamento (e-mail / WhatsApp)
CREATE TABLE public.quote_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('email','whatsapp')),
  status text NOT NULL CHECK (status IN ('pendente','enviado','falhou','desligado','sem_email')),
  recipient text,
  provider_response text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
GRANT SELECT ON public.quote_sends TO authenticated;
GRANT ALL ON public.quote_sends TO service_role;
ALTER TABLE public.quote_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY quote_sends_tenant_select ON public.quote_sends FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE INDEX quote_sends_opportunity_idx ON public.quote_sends (opportunity_id);

-- 5) Histórico de etapas da oportunidade (sem trigger nesta etapa)
CREATE TABLE public.opportunity_stage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  from_stage text,
  to_stage text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid
);
GRANT SELECT ON public.opportunity_stage_history TO authenticated;
GRANT ALL ON public.opportunity_stage_history TO service_role;
ALTER TABLE public.opportunity_stage_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY opportunity_stage_history_tenant_select ON public.opportunity_stage_history FOR SELECT TO authenticated USING (tenant_id = public.current_tenant_id());
CREATE INDEX opportunity_stage_history_opp_idx ON public.opportunity_stage_history (opportunity_id);

-- 6) Registro de envios para rate limit da lead-intake-v2 (só service role)
CREATE TABLE public.lead_intake_rate_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid,
  form_slug text,
  ip_hash text,
  phone_normalized text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.lead_intake_rate_log TO service_role;
ALTER TABLE public.lead_intake_rate_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX lead_intake_rate_log_ip_idx ON public.lead_intake_rate_log (ip_hash, created_at);
CREATE INDEX lead_intake_rate_log_phone_idx ON public.lead_intake_rate_log (phone_normalized, created_at);