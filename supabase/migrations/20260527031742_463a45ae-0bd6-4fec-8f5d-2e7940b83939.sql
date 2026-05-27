
-- clients: support CPF/CNPJ
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS document_type text DEFAULT 'CPF',
  ADD COLUMN IF NOT EXISTS document_number text,
  ADD COLUMN IF NOT EXISTS legacy_document_raw text;

ALTER TABLE public.clients ALTER COLUMN cpf DROP NOT NULL;

UPDATE public.clients
SET document_type = COALESCE(document_type, 'CPF'),
    document_number = COALESCE(document_number, cpf)
WHERE document_number IS NULL AND cpf IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_tenant_document
  ON public.clients(tenant_id, document_type, document_number)
  WHERE document_number IS NOT NULL;

-- contracts: legacy/import fields
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS legacy_contract_key text,
  ADD COLUMN IF NOT EXISTS legacy_import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS legacy_notes text,
  ADD COLUMN IF NOT EXISTS is_historical boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS financial_scope text,
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS import_warnings text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_tenant_legacy_key
  ON public.contracts(tenant_id, legacy_contract_key)
  WHERE legacy_contract_key IS NOT NULL;

-- contract_installments: legacy/import fields
ALTER TABLE public.contract_installments
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS legacy_contract_key text,
  ADD COLUMN IF NOT EXISTS legacy_import_batch_id uuid,
  ADD COLUMN IF NOT EXISTS is_historical boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS financial_scope text,
  ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS import_warnings text;

-- ===== STAGING =====
CREATE TABLE IF NOT EXISTS public.legacy_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  source_file_name text,
  status text NOT NULL DEFAULT 'staged',
  total_clients int DEFAULT 0,
  total_festas int DEFAULT 0,
  total_parcelas int DEFAULT 0,
  total_revisao int DEFAULT 0,
  diagnostic jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.users(id),
  committed_at timestamptz,
  committed_by uuid REFERENCES public.users(id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_import_batches TO authenticated;
GRANT ALL ON public.legacy_import_batches TO service_role;
ALTER TABLE public.legacy_import_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY batches_all ON public.legacy_import_batches FOR ALL TO authenticated
  USING (tenant_id = private.current_tenant_id())
  WITH CHECK (tenant_id = private.current_tenant_id());

CREATE TABLE IF NOT EXISTS public.legacy_import_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES public.legacy_import_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  legacy_client_key text,
  full_name text,
  document_type text,
  document_number text,
  legacy_document_raw text,
  email text,
  phone text,
  address_full text,
  mother_name text,
  father_name text,
  how_met text,
  notes text,
  needs_review boolean DEFAULT false,
  warnings text,
  raw_row jsonb,
  import_status text DEFAULT 'staged',
  created_client_id uuid,
  errors text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_import_clients TO authenticated;
GRANT ALL ON public.legacy_import_clients TO service_role;
ALTER TABLE public.legacy_import_clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY lic_all ON public.legacy_import_clients FOR ALL TO authenticated
  USING (tenant_id = private.current_tenant_id())
  WITH CHECK (tenant_id = private.current_tenant_id());
CREATE INDEX IF NOT EXISTS idx_lic_batch ON public.legacy_import_clients(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_lic_key ON public.legacy_import_clients(import_batch_id, legacy_client_key);

CREATE TABLE IF NOT EXISTS public.legacy_import_festas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES public.legacy_import_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  legacy_contract_key text,
  legacy_client_key text,
  status text,
  event_date date,
  event_weekday_raw text,
  event_start_time time,
  event_end_time time,
  guest_count int,
  celebrant_name text,
  celebrant_age int,
  children_pay_from_age int,
  decoration text,
  tasting_menu text,
  hot_dish text,
  cake text,
  kids_menu text,
  observations text,
  additional_services text,
  total_value numeric,
  payment_method text,
  installment_count int,
  payment_schedule_raw text,
  contract_form_date date,
  contracted_company_email text,
  is_historical boolean DEFAULT false,
  financial_scope text,
  needs_review boolean DEFAULT false,
  legacy_notes text,
  warnings text,
  raw_row jsonb,
  import_status text DEFAULT 'staged',
  created_contract_id uuid,
  errors text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_import_festas TO authenticated;
GRANT ALL ON public.legacy_import_festas TO service_role;
ALTER TABLE public.legacy_import_festas ENABLE ROW LEVEL SECURITY;
CREATE POLICY lif_all ON public.legacy_import_festas FOR ALL TO authenticated
  USING (tenant_id = private.current_tenant_id())
  WITH CHECK (tenant_id = private.current_tenant_id());
CREATE INDEX IF NOT EXISTS idx_lif_batch ON public.legacy_import_festas(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_lif_key ON public.legacy_import_festas(import_batch_id, legacy_contract_key);

CREATE TABLE IF NOT EXISTS public.legacy_import_parcelas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES public.legacy_import_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  legacy_contract_key text,
  order_index int,
  due_date date,
  amount numeric,
  payment_method text,
  payment_status text,
  paid boolean,
  paid_at timestamptz,
  charge_customer boolean,
  card_installments int,
  raw_line text,
  is_historical boolean DEFAULT false,
  financial_scope text,
  needs_review boolean DEFAULT false,
  warnings text,
  raw_row jsonb,
  import_status text DEFAULT 'staged',
  created_installment_id uuid,
  errors text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_import_parcelas TO authenticated;
GRANT ALL ON public.legacy_import_parcelas TO service_role;
ALTER TABLE public.legacy_import_parcelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY lip_all ON public.legacy_import_parcelas FOR ALL TO authenticated
  USING (tenant_id = private.current_tenant_id())
  WITH CHECK (tenant_id = private.current_tenant_id());
CREATE INDEX IF NOT EXISTS idx_lip_batch ON public.legacy_import_parcelas(import_batch_id);
CREATE INDEX IF NOT EXISTS idx_lip_key ON public.legacy_import_parcelas(import_batch_id, legacy_contract_key);

CREATE TABLE IF NOT EXISTS public.legacy_import_revisao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id uuid NOT NULL REFERENCES public.legacy_import_batches(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  origem text,
  source_row_number int,
  legacy_client_key text,
  legacy_contract_key text,
  tipo_problema text,
  campo text,
  valor_original text,
  valor_normalizado text,
  severidade text,
  acao_recomendada text,
  observacao text,
  raw_row jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.legacy_import_revisao TO authenticated;
GRANT ALL ON public.legacy_import_revisao TO service_role;
ALTER TABLE public.legacy_import_revisao ENABLE ROW LEVEL SECURITY;
CREATE POLICY lir_all ON public.legacy_import_revisao FOR ALL TO authenticated
  USING (tenant_id = private.current_tenant_id())
  WITH CHECK (tenant_id = private.current_tenant_id());
CREATE INDEX IF NOT EXISTS idx_lir_batch ON public.legacy_import_revisao(import_batch_id);
